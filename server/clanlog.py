"""The family's log: who joined, left, moved clan or changed role, worked out from the daily member rows, and recent upgrades.

Nothing is stored for it. A player's rows, in order, say when they were in which clan with what role. Clash does not say
whether someone left or was kicked, so both read as left. A gap only counts as leaving once clean polls ran through it,
so a collector outage never reads as the whole family leaving. Players in the first day's rows were already here.
"""
from __future__ import annotations

import sqlite3
from bisect import bisect_left, bisect_right

from frosted.config import TAG_TO_CLAN
from server import history, leaders

UPGRADE_DAYS = 14
GONE_AFTER_POLLS = 2       # clean polls that must miss a player before they count as gone
ROLE_RANK = {"member": 0, "admin": 1, "coLeader": 2, "leader": 3}


def day_firsts(conn) -> dict[tuple, str]:
    # The table's first day began part-way through, so its times there are not when anyone's day began.
    try:
        return {(r["clan_tag"], r["player_tag"], r["snapshot_date"]): r["first_at"]
                for r in conn.execute("SELECT * FROM member_day_first WHERE snapshot_date > (SELECT MIN(snapshot_date) FROM member_day_first)")}
    except sqlite3.OperationalError:
        return {}  # the collector creates the table on its next pass


def member_events(conn) -> list[dict]:
    rows = conn.execute("SELECT * FROM member_snapshots ORDER BY player_tag, seen_at").fetchall()
    if not rows:
        return []
    baseline = min(r["snapshot_date"] for r in rows)
    polls = [r["started_at"] for r in conn.execute("SELECT started_at FROM polls WHERE errors=0 ORDER BY started_at")]
    missed = lambda after, before=None: (len(polls) if before is None else bisect_left(polls, before)) - bisect_right(polls, after)
    clan_last: dict[str, str] = {}
    for r in rows:
        clan_last[r["clan_tag"]] = max(clan_last.get(r["clan_tag"], ""), r["seen_at"])
    firsts = day_firsts(conn)
    family: dict[str, str] = {r["player_tag"]: r["first_seen"] for r in conn.execute("SELECT * FROM member_first_seen")}

    def started(r) -> tuple[str, bool]:
        """When this row's day began for the player, and whether that time is only right to the day."""
        at = firsts.get((r["clan_tag"], r["player_tag"], r["snapshot_date"]))
        if at:
            return at, False
        first = family.get(r["player_tag"], "")
        return (first, False) if first[:10] == r["snapshot_date"] else (f'{r["snapshot_date"]}T00:00:00Z', True)

    out: list[dict] = []

    def add(kind: str, r, at: str, approx: bool = False, **extra) -> None:
        out.append({"kind": kind, "tag": r["player_tag"], "name": r["name"], "th": r["town_hall"],
                    "clan": TAG_TO_CLAN.get(r["clan_tag"]), "at": at, "approx": approx, **extra})

    prev = None
    for r in rows:
        if not prev or prev["player_tag"] != r["player_tag"]:
            if prev:
                _gone(prev, clan_last, missed, add)
            if r["snapshot_date"] > baseline:
                at, approx = started(r)
                came_back = (history.since(r["player_tag"]) or r["snapshot_date"]) < r["snapshot_date"]
                add("rejoined" if came_back else "joined", r, at, approx)
        elif prev["clan_tag"] != r["clan_tag"]:
            at, approx = started(r)
            add("moved", r, at, approx, from_clan=TAG_TO_CLAN.get(prev["clan_tag"]))
        else:
            at, approx = started(r)
            if missed(prev["seen_at"], at) >= GONE_AFTER_POLLS:
                add("left", prev, prev["seen_at"])
                add("rejoined", r, at, approx)
            elif prev["role"] != r["role"] and prev["role"] in ROLE_RANK and r["role"] in ROLE_RANK:
                # The row keeps one role a day, so a change is known to the day.
                up = ROLE_RANK[r["role"]] > ROLE_RANK[prev["role"]]
                add("promoted" if up else "demoted", r, at, True, role=r["role"])
        prev = r
    _gone(prev, clan_last, missed, add)
    # Seen by a single poll: one visit, not a join and a leave.
    key = lambda e: (e["tag"], e["at"])
    visits = {key(e) for e in out if e["kind"] == "left"} & {key(e) for e in out if e["kind"] in ("joined", "rejoined")}
    out = [e for e in out if not (e["kind"] == "left" and key(e) in visits)]
    for e in out:
        if key(e) in visits:
            e["kind"] = "visited"
    out.sort(key=lambda e: (e["at"], e["name"] or ""), reverse=True)
    return out


def _gone(r, clan_last, missed, add) -> None:
    """Their clan has been polled since, without them."""
    if clan_last[r["clan_tag"]] > r["seen_at"] and missed(r["seen_at"]) >= GONE_AFTER_POLLS:
        add("left", r, r["seen_at"])


def clan_log(conn) -> dict:
    """GET /log: every member event on record, newest first, the last two weeks' upgrades and all upgrades by day."""
    if conn is None:
        return {"since": None, "upgrade_days": UPGRADE_DAYS, "events": [], "upgrades": [], "upgrade_counts": [], "upgrade_board": []}
    since = conn.execute("SELECT MIN(snapshot_date) FROM member_snapshots").fetchone()[0]
    return {"since": since, "upgrade_days": UPGRADE_DAYS, "events": member_events(conn),
            "upgrades": leaders.upgrades(conn, UPGRADE_DAYS)["upgrades"], "upgrade_counts": leaders.upgrade_counts(conn),
            "upgrade_board": leaders.upgrade_board(conn)}
