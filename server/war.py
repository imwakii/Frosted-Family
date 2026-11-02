"""GET /war/board: each clan's war for the War tab, public.

The war being fought, else the one in preparation, else the last one for three days after it ended. Bases are paired by
map position, with a log of every attack, newest first: who hit whom, stars, damage, and when the collector first saw it,
since the API gives no attack times. A war the collector last saw in progress whose end has passed is over,
whatever state was stored.
"""
from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone

from frosted.config import CLAN_TAGS

ENDED_SHOWN = timedelta(days=3)


def stamp(t: datetime) -> str:
    return t.strftime("%Y%m%dT%H%M%S")  # the API's time format, which sorts as text


def pick_war(conn, clan_tag: str, now: datetime):
    """A row and whether it is over, or (None, False)."""
    rows = conn.execute(
        """SELECT * FROM wars WHERE ? IN (clan_tag, opponent_tag)
           ORDER BY CASE state WHEN 'inWar' THEN 0 WHEN 'preparation' THEN 1 ELSE 2 END, preparation_start DESC""",
        (clan_tag,)).fetchall()
    now_s = stamp(now)
    for w in rows:
        if w["state"] != "warEnded" and not (w["end_time"] and w["end_time"][:15] < now_s):
            return w, False
    ended = [w for w in rows if w["end_time"]]
    ended.sort(key=lambda w: w["end_time"], reverse=True)
    if ended and ended[0]["end_time"][:15] >= stamp(now - ENDED_SHOWN):
        return ended[0], True
    return None, False


def badge_of(conn, tag: str) -> str | None:
    try:
        r = conn.execute("SELECT badge FROM war_clan_badges WHERE clan_tag=?", (tag,)).fetchone()
    except sqlite3.OperationalError:  # the collector has not yet created the table
        return None
    return r[0] if r else None


def seen_times(conn, war_key: str) -> dict[int, str | None]:
    try:
        return {r[0]: r[1] for r in conn.execute("SELECT attack_order, seen_at FROM attack_seen WHERE war_key=?", (war_key,))}
    except sqlite3.OperationalError:
        return {}


def brief(b: dict) -> dict:
    return {k: b[k] for k in ("tag", "name", "th", "position")}


def war_view(conn, w, clan_tag: str, over: bool) -> dict:
    us, them = ("clan", "opponent") if w["clan_tag"] == clan_tag else ("opponent", "clan")
    allowed = w["attacks_per_member"] or (1 if w["kind"] == "cwl" else 2)
    members = conn.execute("SELECT * FROM war_members WHERE war_key=?", (w["war_key"],)).fetchall()
    bases = {m["player_tag"]: {"tag": m["player_tag"], "name": m["name"], "th": m["town_hall"], "position": m["map_position"],
                               "used": m["attacks_used"], "allowed": allowed, "best": None} for m in members}
    ours = {m["player_tag"] for m in members if m["clan_tag"] == clan_tag}
    seen = seen_times(conn, w["war_key"])
    log = []
    # Newest first; the API's order is the order the attacks were made in.
    for a in conn.execute("SELECT * FROM attacks WHERE war_key=? ORDER BY attack_order DESC", (w["war_key"],)):
        by, on = bases.get(a["attacker_tag"]), bases.get(a["defender_tag"])
        if not by or not on:
            continue
        on["best"] = max(on["best"] or 0, a["stars"])
        log.append({"order": a["attack_order"], "ours": a["attacker_tag"] in ours, "attacker": brief(by), "defender": brief(on),
                    "stars": a["stars"], "destruction": a["destruction"], "seen_at": seen.get(a["attack_order"])})
    left = {b["position"]: b for t, b in bases.items() if t in ours}
    right = {b["position"]: b for t, b in bases.items() if t not in ours}
    return {
        "kind": w["kind"], "state": "warEnded" if over else w["state"], "day": w["round"], "team_size": w["team_size"],
        "start_time": w["start_time"], "end_time": w["end_time"], "attacks_allowed": allowed, "opponent": w[f"{them}_name"],
        "badge": badge_of(conn, clan_tag), "opponent_badge": badge_of(conn, w[f"{them}_tag"]),
        "stars": w[f"{us}_stars"], "opponent_stars": w[f"{them}_stars"],
        "destruction": w[f"{us}_destruction"], "opponent_destruction": w[f"{them}_destruction"],
        "attacks_used": w[f"{us}_attacks"], "opponent_attacks_used": w[f"{them}_attacks"],
        "pairs": [{"position": p, "us": left.get(p), "them": right.get(p)}
                  for p in sorted(x for x in set(left) | set(right) if x is not None)],
        "log": log,
    }


def board(conn, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    clans = []
    for name, clan_tag in CLAN_TAGS.items():
        w, over = pick_war(conn, clan_tag, now) if conn else (None, False)
        clans.append({"clan": name, "war": war_view(conn, w, clan_tag, over) if w else None})
    last = conn.execute("SELECT MAX(finished_at) FROM polls").fetchone()[0] if conn else None
    return {"clans": clans, "last_poll": last}
