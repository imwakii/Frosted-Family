"""Upgrade feed (public), inactivity watch and the make-room list (leaders only).

Everything here only reads. The make-room list gives reasons, never decisions: who leaves a clan is Ka Wai's call.

Activity comes from profile snapshots, taken every 2 hours and stored when any counter moved. A snapshot shows
activity when, against the one before it, attack wins, war stars, capital contributions, experience level, town hall
or any unit level changed, or donations given or received rose. Trophies and builder trophies do not count, as
defenses move them while the player is idle, and a season reset of donations to 0 is not activity.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from frosted.config import CLAN_TAGS, TAG_TO_CLAN
from server import baseline, plan, profiles
from server.auth import Leader, require_leader

INACTIVE_DAYS = 7          # make-room flags a member idle this long
MISSED_RECENT_DAYS = 14    # missed attacks in wars that ended this recently
MIN_TH = {"Fire": 18, "Cake": 16}
UNPROVEN_TIERS = ("NO DATA", "THIN RECORD")
CATEGORY = {"hero": "hero", "equipment": "equipment", "troop": "troop", "spell": "spell", "pet": "pet",
            "siege": "siege"}  # super troops are boosted copies and are left out

router = APIRouter(prefix="/leaders")


def now() -> datetime:
    """Replaced in tests."""
    return datetime.now(timezone.utc)


def parse(t: str) -> datetime:
    return datetime.strptime(t, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def members_by_tag(conn) -> dict[str, dict]:
    return {m["tag"]: m for m in profiles.current_members(conn)}


def first_seen(conn) -> dict[str, str]:
    """Each player's first profile fetch. What existed then is their starting point, not an upgrade."""
    out: dict[str, str] = {}
    for q in ("SELECT player_tag, MIN(fetched_at) AS t FROM profile_snapshots GROUP BY player_tag",
              "SELECT player_tag, MIN(seen_at) AS t FROM player_unit_history GROUP BY player_tag"):
        for r in conn.execute(q):
            out[r["player_tag"]] = min(out.get(r["player_tag"], r["t"]), r["t"])
    return out


# ─── upgrade feed ─────────────────────────────────────────────────────────────

def upgrades(conn, days: int = 7, clan: str | None = None) -> dict:
    if clan is not None and clan not in CLAN_TAGS:
        raise HTTPException(422, f"clan is one of {', '.join(CLAN_TAGS)}")
    if conn is None:
        return {"days": days, "clan": clan, "as_of": None, "upgrades": []}
    cutoff = (now() - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    ms, start = members_by_tag(conn), first_seen(conn)
    events = []
    prev: dict[tuple, int] = {}
    for u in conn.execute("SELECT * FROM player_unit_history ORDER BY player_tag, kind, name, level"):
        key = (u["player_tag"], u["kind"], u["name"])
        before = prev.get(key)
        prev[key] = u["level"]
        if u["kind"] not in CATEGORY or u["seen_at"] <= start.get(u["player_tag"], ""):
            continue
        events.append((u["player_tag"], u["name"], CATEGORY[u["kind"]], before or 0, u["level"], u["seen_at"],
                       "level_up" if before else "unlock"))
    th: dict[str, int] = {}
    for s in conn.execute("SELECT player_tag, fetched_at, town_hall FROM profile_snapshots ORDER BY player_tag, fetched_at"):
        before = th.get(s["player_tag"])
        th[s["player_tag"]] = s["town_hall"]
        if before and s["town_hall"] and s["town_hall"] > before:
            events.append((s["player_tag"], "Town Hall", "town_hall", before, s["town_hall"], s["fetched_at"],
                           "level_up"))
    out = []
    for tag, unit, cat, frm, to, at, change in events:
        m = ms.get(tag)
        if not m or at < cutoff:
            continue
        r = profiles.row(m)
        if clan and r["clan"] != clan:
            continue
        out.append({**r, "unit": unit, "category": cat, "change": change, "from": frm, "to": to, "at": at})
    out.sort(key=lambda e: (e["at"], e["name"] or ""), reverse=True)
    as_of = conn.execute("SELECT MAX(started_at) FROM profile_runs").fetchone()[0]
    return {"days": days, "clan": clan, "as_of": as_of, "upgrades": out}


# ─── inactivity ───────────────────────────────────────────────────────────────

ACTIVE_IF_CHANGED = ("town_hall", "exp_level", "attack_wins", "war_stars", "capital_contributions", "unit_levels")
ACTIVE_IF_RISEN = ("donations", "donations_received")  # both reset to 0 at season end, which is not activity
# Trophies and builder trophies are left out: defenses move them while the player is idle.


def was_active(before, after) -> bool:
    return (any(after[k] != before[k] for k in ACTIVE_IF_CHANGED)
            or any((after[k] or 0) > (before[k] or 0) for k in ACTIVE_IF_RISEN))


def activity(conn) -> dict[str, dict]:
    """Per member: last_active (the latest snapshot that shows activity against the one before), days_inactive and
    the date tracking began for them."""
    snaps: dict[str, list] = {}
    for s in conn.execute("SELECT * FROM profile_snapshots ORDER BY player_tag, fetched_at"):
        snaps.setdefault(s["player_tag"], []).append(s)
    t = now()
    out = {}
    for tag, rows in snaps.items():
        last = next((b["fetched_at"] for a, b in reversed(list(zip(rows, rows[1:]))) if was_active(a, b)), None)
        ref = parse(last or rows[0]["fetched_at"])
        out[tag] = {"last_active": last, "tracking_since": rows[0]["fetched_at"], "days_inactive": (t - ref).days,
                    # No activity seen since tracking began: days_inactive is a floor, not the full idle time.
                    "inactive_at_least": last is None}
    return out


def last_attacks(conn) -> dict[str, str]:
    out = {r["t"]: profiles.api_day(r["d"]) for r in conn.execute(
        """SELECT a.attacker_tag AS t, MAX(substr(w.start_time, 1, 8)) AS d FROM attacks a JOIN wars w USING (war_key)
           GROUP BY a.attacker_tag""")}
    base = baseline.current()
    for tag, p in (base.players.items() if base else []):
        if p.get("last_war") and p["last_war"] > out.get(tag, ""):
            out[tag] = p["last_war"]
    return out


def missed_since(conn, since: str | None = None) -> dict[str, int]:
    sql = "SELECT player_tag, SUM(missed) AS n FROM missed_attacks"
    args: tuple = ()
    if since:
        sql += " WHERE end_time >= ?"
        args = (since,)
    return {r["player_tag"]: r["n"] for r in conn.execute(sql + " GROUP BY player_tag", args)}


def inactivity(conn) -> dict:
    if conn is None:
        return {"as_of": None, "players": []}
    act, attacks, missed = activity(conn), last_attacks(conn), missed_since(conn)
    rows = []
    for tag, m in members_by_tag(conn).items():
        a = act.get(tag, {})
        rows.append({**profiles.row(m), "last_active": a.get("last_active"), "days_inactive": a.get("days_inactive"),
                     "inactive_at_least": a.get("inactive_at_least"), "tracking_since": a.get("tracking_since"),
                     "last_war_attack": attacks.get(tag), "donations": m["donations"],
                     "missed_attacks_recorded": missed.get(tag, 0)})
    rows.sort(key=lambda r: (-(r["days_inactive"] if r["days_inactive"] is not None else -1), r["name"] or ""))
    as_of = conn.execute("SELECT MAX(started_at) FROM profile_runs").fetchone()[0]
    return {"as_of": as_of, "players": rows}


# ─── make room ────────────────────────────────────────────────────────────────

def reasons_for(m: dict, clan: str, act: dict, alloc: dict | None, missed_recent: int) -> list[dict]:
    rs = []
    days = act.get("days_inactive")
    if days is not None and days >= INACTIVE_DAYS:
        rs.append({"code": "inactive_days", "value": days})
    if alloc and alloc.get("flag_high_miss") == "True":
        rs.append({"code": "high_miss", "value": float(alloc["miss_pct"]) if alloc.get("miss_pct") else None})
    if missed_recent:
        rs.append({"code": "missed_recent", "value": missed_recent})
    if alloc and clan in MIN_TH and alloc.get("cwl_slot") == "Sitting Out":
        rs.append({"code": "sitting_out", "value": None})
    if m["fetched_at"] is not None and m["donations"] == 0:
        rs.append({"code": "no_donations", "value": 0})
    th = m["town_hall"] or m["snap_th"]
    if clan in MIN_TH and th and th < MIN_TH[clan]:
        rs.append({"code": "low_th_for_clan", "value": th})
    if alloc is None:
        rs.append({"code": "new_and_unproven", "value": "not on the roster"})
    elif alloc.get("tier") in UNPROVEN_TIERS:
        rs.append({"code": "new_and_unproven", "value": alloc["tier"]})
    return rs


def score(rs: list[dict]) -> int:
    """Inactivity weighs heaviest: 3 points a day (capped at 60 days), 10 for each other reason."""
    days = next((r["value"] for r in rs if r["code"] == "inactive_days"), 0)
    return 3 * min(days, 60) + 10 * sum(r["code"] != "inactive_days" for r in rs)


def make_room(conn, clan: str) -> dict:
    if clan not in CLAN_TAGS:
        raise HTTPException(422, f"clan is one of {', '.join(CLAN_TAGS)}")
    if conn is None:
        return {"clan": clan, "members": 0, "cap": plan.CAP, "as_of": None, "players": []}
    rows, _ = plan.effective_roster()
    alloc = {r["tag"]: r for r in rows if r.get("tag")}
    act = activity(conn)
    recent = missed_since(conn, (now() - timedelta(days=MISSED_RECENT_DAYS)).strftime("%Y%m%dT%H%M%S"))
    here = [m for m in profiles.current_members(conn) if TAG_TO_CLAN.get(m["clan_tag"]) == clan]
    out = []
    for m in here:
        a = alloc.get(m["tag"])
        rs = reasons_for(m, clan, act.get(m["tag"], {}), a, recent.get(m["tag"], 0))
        out.append({**profiles.row(m), "cwl_slot": a.get("cwl_slot") if a else None, "reasons": rs,
                    "score": score(rs)})
    out.sort(key=lambda r: (-r["score"], r["th"] or 0, r["name"] or ""))
    as_of = conn.execute("SELECT MAX(started_at) FROM profile_runs").fetchone()[0]
    return {"clan": clan, "members": len(here), "cap": plan.CAP, "as_of": as_of, "players": out}


# ─── routes ───────────────────────────────────────────────────────────────────

def _db():
    from server.api import open_db  # api imports this module; resolve at call time
    return open_db()


@router.get("/inactivity")
def get_inactivity(leader: Leader = Depends(require_leader)):
    return inactivity(_db())


@router.get("/make-room")
def get_make_room(clan: str, leader: Leader = Depends(require_leader)):
    return make_room(_db(), clan)
