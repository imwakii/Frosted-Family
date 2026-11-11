"""Each CWL month's roster as members saw it, so Roster can step back to an earlier month once the next is published.

/roster saves what it serves under the month that roster is for. The roster CSV and the allocation are replaced each
month, so this copy is the only record of an earlier month's lineup, names, slots and days. Every month is kept, from
November 2026, the first the app tracked: a month is about 100 KB.
"""
from __future__ import annotations

import json
import re
from contextlib import closing
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException

from server import appdb, db

SCHEMA = """
CREATE TABLE IF NOT EXISTS roster_months (
    season TEXT PRIMARY KEY,          -- YYYY-MM, the CWL month the roster was for
    players TEXT NOT NULL,            -- /roster's players as last served for that month
    saved_at TEXT NOT NULL
);
"""
SEASON = r"^\d{4}-\d{2}$"
# A league runs over the first ten or so days of a month, so a roster published from the 12th on is for next month's.
NEXT_FROM_DAY = 12

router = APIRouter(prefix="/roster")


def connect():
    """Closed when done: `with closing(connect()) as conn, conn:` commits, then closes."""
    conn = appdb.connect()
    conn.executescript(SCHEMA)
    return conn


def season_of(published_at: str | None, now: datetime) -> str:
    """The CWL month a roster published at this time is for. With no publish, the month being planned now: a new
    roster file from the 12th on is next month's too."""
    t = datetime.fromisoformat(published_at.replace("Z", "+00:00")) if published_at else now
    if t.day >= NEXT_FROM_DAY:
        t = t.replace(day=1) + timedelta(days=32)
    return t.strftime("%Y-%m")


def kept_view(r: dict) -> dict:
    """What a past month needs of a row: the roster's own fields, the name and town hall then, and whether they had left.
    Trophies and poll times change every few minutes and would rewrite the month on nearly every visit."""
    s = r.get("snapshot") or {}
    return {**{k: v for k, v in r.items() if k not in ("snapshot", "new")},
            "snapshot": {k: s.get(k) for k in ("name", "town_hall", "clan")} if s else None}


def keep(players: list[dict], published_at: str, now: datetime) -> str:
    """Save a published roster under its month. Only a published roster is kept: a new roster file not yet published
    may already be next month's."""
    season = season_of(published_at, now)
    body = json.dumps([kept_view(r) for r in players], sort_keys=True)
    with closing(connect()) as conn, conn:
        had = conn.execute("SELECT players FROM roster_months WHERE season=?", (season,)).fetchone()
        if had and had["players"] == body:
            return season
        conn.execute(
            "INSERT INTO roster_months VALUES (?,?,?) ON CONFLICT (season) DO UPDATE SET players=excluded.players, saved_at=excluded.saved_at",
            (season, body, db.utcnow()))
    return season


def months(current: str) -> list[str]:
    """Every month Roster can show, newest first: this month's roster and each earlier one kept."""
    with closing(connect()) as conn:
        saved = {r["season"] for r in conn.execute("SELECT season FROM roster_months")}
    return sorted(saved | {current}, reverse=True)


def month(season: str) -> list[dict] | None:
    with closing(connect()) as conn:
        row = conn.execute("SELECT players FROM roster_months WHERE season=?", (season,)).fetchone()
    return json.loads(row["players"]) if row else None


def league_season(conn, month_: str) -> str | None:
    """That month's CWL season as the game names it ("2026-11-02"), for the day strip's results."""
    if not conn:
        return None
    row = conn.execute("SELECT MAX(season) FROM cwl_group_clans WHERE season LIKE ?", (f"{month_}%",)).fetchone()
    return row[0] if row else None


@router.get("/months")
def roster_months():
    from server import api, leaders, plan
    now = leaders.now()
    _, meta = plan.effective_roster()
    current = season_of(meta["published_at"] if meta["source"] == "published" else None, now)
    conn = api.open_db()
    return {"current": current, "months": [{"season": m, "league": league_season(conn, m)} for m in months(current)]}


@router.get("/month/{season}")
def roster_month(season: str):
    if not re.fullmatch(SEASON, season):
        raise HTTPException(422, "season is YYYY-MM")
    players = month(season)
    if players is None:
        raise HTTPException(404, "that month's roster is not kept")
    from server import api
    return {"season": season, "players": players, "league": league_season(api.open_db(), season)}
