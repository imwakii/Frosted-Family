"""The family's history from Clash of Stats' past-members tables, read once and kept in the repo (data/history/).

Separate from what the collector records, and approximate. Clash of Stats dates a player by when its service first and last
saw them, may have missed members, and holds one span per player per clan, so someone who left and came back looks as if
they stayed throughout. That rules out working out a clan's size on past dates: it gives more than the 50 a clan can hold.
So this serves only what the data can bear: who first appeared when, in which clans, and who has been here longest.
"""
from __future__ import annotations

import json
import os
from datetime import datetime
from functools import lru_cache
from pathlib import Path

from server import profiles

CLANS = {"fire": "Fire", "cake": "Cake", "flakes": "Flakes"}


def path() -> Path:
    # The units run in the repo checkout; FROSTED_HISTORY overrides for tests.
    return Path(os.environ.get("FROSTED_HISTORY", "data/history/clashofstats.json"))


def day(s: str) -> str:
    return datetime.strptime(s, "%B %d, %Y").strftime("%Y-%m-%d")


@lru_cache(maxsize=2)
def _load(where: str, stamp: float) -> dict:
    raw = json.loads(Path(where).read_text(encoding="utf-8"))
    rows = [{"clan": CLANS[k], "name": name, "tag": tag, "first": day(first)}
            for k, rs in raw["clans"].items() for name, tag, _role, first, _last in rs]
    by_tag: dict[str, list[dict]] = {}
    for r in rows:
        by_tag.setdefault(r["tag"], []).append(r)
    return {"read_at": raw.get("read_at"), "rows": rows, "by_tag": by_tag}


def load() -> dict | None:
    p = path()
    return _load(str(p), p.stat().st_mtime) if p.exists() else None


def since(tag: str, conn=None) -> str | None:
    """The first date any of our clans saw this player: the imported history, or with conn also what the collector
    has seen, so someone who joined after the import still has a date."""
    h = load()
    spans = h["by_tag"].get(tag) if h else None
    dates = [r["first"] for r in spans] if spans else []
    if conn is not None:
        seen = conn.execute("SELECT first_seen FROM member_first_seen WHERE player_tag=?", (tag,)).fetchone()
        if seen and seen[0]:
            dates.append(seen[0][:10])
    return min(dates) if dates else None


def timeline(conn) -> dict | None:
    """GET /stats/history: each clan's start, first appearances by year, and every current member by time in the family."""
    h = load()
    if not h:
        return None
    rows = h["rows"]
    clans = [{"clan": c, "first": min(r["first"] for r in rows if r["clan"] == c),
              "players": sum(r["clan"] == c for r in rows)} for c in CLANS.values() if any(r["clan"] == c for r in rows)]
    years: dict[str, dict] = {}
    for r in rows:
        y = years.setdefault(r["first"][:4], {"year": r["first"][:4], **{c: 0 for c in CLANS.values()}})
        y[r["clan"]] += 1
    members = profiles.current_members(conn) if conn else []
    longest = []
    for m in members:
        first = since(m["tag"], conn)
        if first:
            longest.append({**profiles.row(m), "since": first})
    longest.sort(key=lambda r: (r["since"], r["name"] or ""))
    return {
        "read_at": h["read_at"], "players": len(h["by_tag"]),
        "in_several": sum(len({r["clan"] for r in spans}) > 1 for spans in h["by_tag"].values()),
        "clans": clans, "years": sorted(years.values(), key=lambda y: y["year"]), "longest": longest,
    }
