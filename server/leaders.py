"""Upgrade feed, inactivity watch and the make-room list. All public for now; LEADERS_PUBLIC=false locks the last two.

Everything here only reads. The make-room list gives reasons, never decisions: who leaves a clan is Ka Wai's call.

Activity comes from profile snapshots, taken every 2 hours and stored when any counter moved. A snapshot shows
activity when, against the one before it, attack wins, war stars, capital contributions, experience level, town hall
or any unit level changed, or donations given or received rose. Trophies and builder trophies do not count, as
defenses move them while the player is idle, and a season reset of donations to 0 is not activity.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from frosted.config import CLAN_TAGS, TAG_TO_CLAN
from server import baseline, plan, profiles
from server.auth import Leader, current_leader

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


# Ka Wai's rule, 1 Nov 2026 (docs/specs/02-allocation-rules.md, "Removing members"): activity first, then hero
# strength for the town hall, weakest first. The other reasons only break ties, in TIE_BREAKS order.
BUCKETS = ((14, "inactive_14_plus"), (7, "inactive_7_to_13"), (3, "inactive_3_to_6"), (0, "active"))
TIE_BREAKS = ("missed_recent", "high_miss", "no_donations", "sitting_out", "new_and_unproven", "low_th_for_clan")
MIN_COHORT = 3


def bucket(days: int | None) -> tuple[int, str]:
    """Index and name of the activity bucket. No snapshot yet counts as active: there is no evidence either way."""
    for i, (floor, name) in enumerate(BUCKETS):
        if (days or 0) >= floor:
            return i, name
    return len(BUCKETS) - 1, BUCKETS[-1][1]


def median(xs: list[float]) -> float:
    xs = sorted(xs)
    n = len(xs)
    return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2


def hero_strength(conn) -> dict[str, dict]:
    """Per current member with a profile: home hero levels summed, as a % of the median sum among every current
    family member at the same town hall. With fewer than 3 there, the cohort is TH-1 to TH+1 and its median is
    scaled by the player's summed hero max levels over the cohort's median of the same, flagged thin. The API's max
    is the game's, not the town hall's, so that scaling only reflects which heroes each player has unlocked."""
    sums: dict[str, tuple[int, int]] = {}
    for r in conn.execute("""SELECT player_tag, SUM(level) AS lv, SUM(COALESCE(max_level, 0)) AS mx
                             FROM player_units WHERE kind='hero' GROUP BY player_tag"""):
        sums[r["player_tag"]] = (r["lv"], r["mx"])
    people = []
    for m in profiles.current_members(conn):
        if m["fetched_at"] is None or not m["town_hall"]:
            continue
        lv, mx = sums.get(m["tag"], (0, 0))  # a profile with no heroes yet (low town hall) sums to 0
        people.append((m["tag"], m["town_hall"], lv, mx))
    out = {}
    for tag, th, lv, mx in people:
        same = [p for p in people if p[1] == th]
        if len(same) >= MIN_COHORT:
            ref, cohort, kind = median([p[2] for p in same]), same, "same_th"
        else:
            cohort, kind = [p for p in people if abs(p[1] - th) <= 1], "thin"
            top = median([p[3] for p in cohort])
            ref = median([p[2] for p in cohort]) * (mx / top if top else 1)
        out[tag] = {"hero_levels": lv, "hero_pct": round(100 * lv / ref, 1) if ref else None,
                    "cohort_th": th, "cohort_n": len(cohort), "cohort": kind}
    return out


def make_room(conn, clan: str) -> dict:
    if clan not in CLAN_TAGS:
        raise HTTPException(422, f"clan is one of {', '.join(CLAN_TAGS)}")
    if conn is None:
        return {"clan": clan, "members": 0, "cap": plan.CAP, "as_of": None, "players": []}
    rows, _ = plan.effective_roster()
    alloc = {r["tag"]: r for r in rows if r.get("tag")}
    act, heroes = activity(conn), hero_strength(conn)
    recent = missed_since(conn, (now() - timedelta(days=MISSED_RECENT_DAYS)).strftime("%Y%m%dT%H%M%S"))
    here = [m for m in profiles.current_members(conn) if TAG_TO_CLAN.get(m["clan_tag"]) == clan]
    out = []
    for m in here:
        a, act_m = alloc.get(m["tag"]), act.get(m["tag"], {})
        rs = reasons_for(m, clan, act_m, a, recent.get(m["tag"], 0))
        b_idx, b_name = bucket(act_m.get("days_inactive"))
        h = heroes.get(m["tag"], {"hero_levels": None, "hero_pct": None, "cohort_th": None, "cohort_n": 0,
                                  "cohort": None})
        codes = {r["code"] for r in rs}
        out.append({**profiles.row(m), "cwl_slot": a.get("cwl_slot") if a else None,
                    "days_inactive": act_m.get("days_inactive"), "inactive_at_least": act_m.get("inactive_at_least"),
                    "activity": b_name, **h, "reasons": rs,
                    "_key": (b_idx, h["hero_pct"] is None, h["hero_pct"] or 0,
                             *(code not in codes for code in TIE_BREAKS), (m["name"] or m["snap_name"] or "").lower())})
    out.sort(key=lambda r: r["_key"])
    for i, r in enumerate(out, start=1):
        del r["_key"]
        r["position"] = i
    as_of = conn.execute("SELECT MAX(started_at) FROM profile_runs").fetchone()[0]
    return {"clan": clan, "members": len(here), "cap": plan.CAP, "as_of": as_of, "players": out}


# ─── routes ───────────────────────────────────────────────────────────────────

def _db():
    from server.api import open_db  # api imports this module; resolve at call time
    return open_db()


def leaders_public() -> bool:
    """LEADERS_PUBLIC (default true) opens the inactivity and make-room lists to everyone. Set it to false in api.env
    and restart the API to put them back behind a leader session."""
    return os.environ.get("LEADERS_PUBLIC", "true").strip().lower() not in ("false", "0", "no", "off")


def leaders_access(leader: Leader | None = Depends(current_leader)) -> None:
    if not leaders_public() and not leader:
        raise HTTPException(401, "sign in as a leader")


@router.get("/inactivity", dependencies=[Depends(leaders_access)])
def get_inactivity():
    return inactivity(_db())


@router.get("/make-room", dependencies=[Depends(leaders_access)])
def get_make_room(clan: str):
    return make_room(_db(), clan)
