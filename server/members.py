"""Who is in the family now, against frosted_cwl_members.csv: new members, departed members, and a suggested slot.

The CSV is built once a cycle, so it misses anyone who joined since and still lists anyone who left. /roster adds
the first and flags the second from the 10-minute member polls. A new member's suggested slot is a suggestion only:
it is never written to the CSV, and allocation stays Ka Wai's call at the next cycle (AGENTS.md).
"""
from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone

from frosted.config import TAG_TO_CLAN

LEFT_AFTER = timedelta(minutes=30)
SUB_FLOOR = {"Fire": 18, "Cake": 16}   # the clans' TH floors (docs/specs/02-allocation-rules.md)
SUB_HERO_PCT = 85.0                    # hero strength against same-TH family peers needed to suggest SUB


def parse(t: str) -> datetime:
    return datetime.strptime(t, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def presence(conn) -> dict[str, dict]:
    """Per player ever seen: clan last seen in, when, first seen, and whether they are in that clan's latest poll."""
    newest = {r["clan_tag"]: r["t"] for r in conn.execute(
        "SELECT clan_tag, MAX(seen_at) AS t FROM member_snapshots GROUP BY clan_tag")}
    out: dict[str, dict] = {}
    for r in conn.execute("""SELECT player_tag, clan_tag, MIN(seen_at) AS first, MAX(seen_at) AS last
                             FROM member_snapshots GROUP BY player_tag, clan_tag"""):
        p = out.setdefault(r["player_tag"], {"first_seen": r["first"], "last_seen": r["last"], "clan_tag": r["clan_tag"]})
        p["first_seen"] = min(p["first_seen"], r["first"])
        if r["last"] >= p["last_seen"]:
            p["last_seen"], p["clan_tag"] = r["last"], r["clan_tag"]
    try:
        for r in conn.execute("SELECT player_tag, first_seen FROM member_first_seen"):
            if r["player_tag"] in out:
                out[r["player_tag"]]["first_seen"] = r["first_seen"]
    except sqlite3.OperationalError:
        pass  # the collector creates the table on its next pass; until then first_seen is right to the day
    for p in out.values():
        # Judged against the newest poll of the clan they were last seen in, not the clock: a collector outage or a
        # clan whose member call keeps failing does not mark its members as gone.
        p["live"] = p["last_seen"] == newest[p["clan_tag"]]
        p["left"] = parse(newest[p["clan_tag"]]) - parse(p["last_seen"]) >= LEFT_AFTER
    return out


def suggest(clan: str | None, th: int | None, hero: dict | None) -> tuple[str, str]:
    """SUB when the TH meets the clan's floor and heroes are at least 85% of same-TH peers; otherwise Sitting Out."""
    if clan not in SUB_FLOOR:
        return "Sitting Out", f"{clan or 'This clan'} sits out CWL"
    floor = SUB_FLOOR[clan]
    if not th or th < floor:
        return "Sitting Out", f"TH{th or '?'} is below {clan}'s TH{floor} floor"
    pct = hero.get("hero_pct") if hero else None
    if pct is None:
        return "Sitting Out", "no profile yet, so hero strength is unknown"
    peers = f"{hero['cohort_n']} TH{hero['cohort_th']} family members" + (" (thin cohort)" if hero["cohort"] == "thin" else "")
    if pct >= SUB_HERO_PCT:
        return "SUB", f"TH{th} meets {clan}'s floor; heroes at {pct:g}% of the median of {peers}"
    return "Sitting Out", f"heroes at {pct:g}% of the median of {peers}, below {SUB_HERO_PCT:g}%"


def new_member_rows(conn, csv_tags: set[str], heroes: dict[str, dict], snapshot_view) -> list[dict]:
    """A /roster row for each live member who is not in the CSV."""
    seen = presence(conn)
    rows = []
    for tag, p in seen.items():
        if tag in csv_tags or not p["live"]:
            continue
        s = conn.execute("""SELECT * FROM member_snapshots WHERE player_tag=? AND clan_tag=? AND seen_at=?""",
                         (tag, p["clan_tag"], p["last_seen"])).fetchone()
        clan = TAG_TO_CLAN.get(p["clan_tag"])
        slot, why = suggest(clan, s["town_hall"], heroes.get(tag))
        rows.append({
            "tag": tag, "name": s["name"], "clan": clan, "cwl_slot": "New", "transferred_from": None, "tier": "NEW",
            "final_score": None, "current_th": s["town_hall"], "flags": None, "snapshot": snapshot_view(dict(s)),
            "new": True, "left": False, "joined_at": p["first_seen"],
            # The API keeps no history: everything about a new member starts when the collector first saw them.
            "history": "recorded only", "suggested_slot": slot, "suggested_reason": why,
        })
    rows.sort(key=lambda r: (r["clan"] or "", r["joined_at"], (r["name"] or "").lower()))
    return rows
