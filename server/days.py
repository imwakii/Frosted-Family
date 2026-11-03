"""The day planner: who plays each of the seven CWL days, for Fire and Cake.

One shared draft per CWL season (YYYY-MM, the API's season), which any leader with a Discord session may save, last
write wins. Only the publisher publishes, and only a published plan reaches members: /roster gives each player of a
planned clan their days. A publish needs exactly 15 players on every day of each clan it covers, all of them in that
clan's live allocation. The leaders' view lays each day's war over the plan once the collector has it: the lineup in
game, the opponent's town halls, each attacker's stars, and who missed their attack. For days not yet drawn it gives
the expected enemy: rank by rank, the mean town hall of the top 15 of each group clan not yet faced. The page's Suggest
(web/src/dayplan.ts) uses both to match the enemy with reliable players, and the stars to choose between equal fits.

Plans are kept by month. The game's season can be longer (2026-11-02), so wars are matched on the month alone. A day whose
war has begun is the game's: a publish cannot change it and keeps what was planned, and members see the game's lineup.
"""
from __future__ import annotations

import json
import re
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from frosted.config import CLAN_TAGS
from server import appdb, db, plan
from server.auth import Leader, require_discord_write, require_leader, require_publisher

DAYS = range(1, 8)
SEASON = r"^\d{4}-\d{2}$"

router = APIRouter(prefix="/plan/days")

SCHEMA = """
CREATE TABLE IF NOT EXISTS day_plans (
    season TEXT NOT NULL,             -- the CWL season, YYYY-MM
    state TEXT NOT NULL,              -- 'draft' or 'published'
    body TEXT NOT NULL,               -- {clan: {"1": [tag, ...], ..., "7": [...]}}
    updated_at TEXT NOT NULL,
    updated_by TEXT,
    PRIMARY KEY (season, state)
);
"""


def connect():
    conn = appdb.connect()
    conn.executescript(SCHEMA)
    return conn


def current_season() -> str:
    from server import leaders  # leaders.now is replaced in tests
    return leaders.now().strftime("%Y-%m")


class DayPlan(BaseModel):
    season: str = Field(pattern=SEASON)
    clans: dict[str, dict[str, list[str]]]

    @field_validator("clans")
    @classmethod
    def shape(cls, v):
        for clan, days in v.items():
            if clan not in plan.CWL_CLANS:
                raise ValueError(f"clan is one of {', '.join(plan.CWL_CLANS)}")
            for d, tags in days.items():
                if d not in {str(i) for i in DAYS} or len(tags) > plan.CAP:
                    raise ValueError("days are 1 to 7, each at most 50 players")
                if not all(re.fullmatch(plan.PLAYER_TAG, t) for t in tags):
                    raise ValueError("not a player tag")
                days[d] = sorted(set(tags))
        return v


def read(conn, season: str, state: str) -> dict | None:
    row = conn.execute("SELECT * FROM day_plans WHERE season=? AND state=?", (season, state)).fetchone()
    if not row:
        return None
    return {"clans": json.loads(row["body"]), "updated_at": row["updated_at"], "updated_by": row["updated_by"]}


def write(conn, body: DayPlan, state: str, leader: Leader) -> None:
    conn.execute(
        """INSERT INTO day_plans VALUES (?,?,?,?,?) ON CONFLICT (season, state) DO UPDATE SET
             body=excluded.body, updated_at=excluded.updated_at, updated_by=excluded.updated_by""",
        (body.season, state, json.dumps(body.clans), db.utcnow(), leader.name))


def check(body: DayPlan, rows: list[dict], begun: dict | None = None) -> list[str]:
    """Exactly 15 on every day still to come of each planned clan, each of them in that clan."""
    clan_of = {r["tag"]: r.get("clan") for r in rows if r.get("tag")}
    problems = []
    for clan, days in body.clans.items():
        for d in DAYS:
            if str(d) in (begun or {}).get(clan, {}):
                continue
            tags = days.get(str(d), [])
            if len(tags) != plan.STARTERS:
                problems.append(f"{clan} day {d} has {len(tags)}, needs exactly {plan.STARTERS}")
            elsewhere = [t for t in tags if clan_of.get(t) != clan]
            if elsewhere:
                problems.append(f"{clan} day {d}: not in {clan}: {', '.join(elsewhere)}")
    return problems


def wars(conn, season: str) -> dict:
    """{clan: {day: {...}}} for each CWL war of the season the collector has seen."""
    out: dict = {c: {} for c in plan.CWL_CLANS}
    if conn is None:
        return out
    for clan in plan.CWL_CLANS:
        tag = CLAN_TAGS[clan]
        for w in conn.execute("""SELECT * FROM wars WHERE kind='cwl' AND substr(season,1,7)=substr(?,1,7) AND ? IN (clan_tag, opponent_tag)
                                 ORDER BY round""", (season, tag)):
            them = "opponent" if w["clan_tag"] == tag else "clan"
            ms = conn.execute("SELECT * FROM war_members WHERE war_key=?", (w["war_key"],)).fetchall()
            ours = [m for m in ms if m["clan_tag"] == tag]
            ended = w["state"] == "warEnded"
            stars = {r["t"]: r["s"] for r in conn.execute(
                "SELECT attacker_tag AS t, MAX(stars) AS s FROM attacks WHERE war_key=? AND attacker_clan_tag=? GROUP BY attacker_tag",
                (w["war_key"], tag))}
            out[clan][str(w["round"])] = {
                "state": w["state"], "opponent": w[f"{them}_name"],
                "opponent_th": sorted((m["town_hall"] for m in ms if m["clan_tag"] != tag and m["town_hall"]), reverse=True),
                "lineup": sorted(m["player_tag"] for m in ours),
                "stars": stars,  # stars each of our attackers took, toward the 8 for CWL bonus eligibility
                "missed": sorted(m["player_tag"] for m in ours if ended and m["attacks_used"] < (w["attacks_per_member"] or 1)),
            }
    return out


def begun(conn, season: str) -> dict:
    """{clan: {day: the game's lineup}} for each day whose war is on or over."""
    return {clan: {d: w["lineup"] for d, w in ws.items() if w["state"] != "preparation"} for clan, ws in wars(conn, season).items()}


def upcoming(conn, season: str, clan: str, faced: set[str]) -> list[float]:
    """The expected enemy on a day not yet drawn. The top 15 of a signed-up roster stands in for the lineup we will see."""
    tag = CLAN_TAGS[clan]
    try:
        rows = conn.execute("SELECT clan_tag, town_halls FROM cwl_group_clans WHERE substr(season,1,7)=substr(?,1,7) AND our_clan_tag=?",
                            (season, tag)).fetchall()
    except sqlite3.OperationalError:  # the collector has not yet created the table
        return []
    tops = [json.loads(r["town_halls"])[:plan.STARTERS] for r in rows if r["clan_tag"] != tag and r["clan_tag"] not in faced]
    tops = [t for t in tops if len(t) == plan.STARTERS]
    return [round(sum(t[i] for t in tops) / len(tops), 2) for i in range(plan.STARTERS)] if tops else []


def expected_enemy(conn, season: str) -> dict:
    out = {}
    for clan in plan.CWL_CLANS:
        if conn is None:
            out[clan] = []
            continue
        tag = CLAN_TAGS[clan]
        faced = {r["opponent_tag"] if r["clan_tag"] == tag else r["clan_tag"] for r in conn.execute(
            "SELECT clan_tag, opponent_tag FROM wars WHERE kind='cwl' AND substr(season,1,7)=substr(?,1,7) AND ? IN (clan_tag, opponent_tag)",
            (season, tag))}
        out[clan] = upcoming(conn, season, clan, faced)
    return out


def member_days(season: str | None = None) -> dict[str, list[int]]:
    """For /roster: each player of a clan the published plan covers, with the days they play ([] for none)."""
    from server.api import open_db
    season = season or current_season()
    with connect() as conn:
        pub = read(conn, season, "published")
    if not pub:
        return {}
    fixed = begun(open_db(), season)
    out: dict[str, list[int]] = {}
    for clan, days in pub["clans"].items():
        for d in DAYS:
            for t in fixed.get(clan, {}).get(str(d), days.get(str(d), [])):
                out.setdefault(t, []).append(d)
        for r in plan.live_rows():
            if r.get("clan") == clan and r.get("tag"):
                out.setdefault(r["tag"], [])
    return out


# ─── routes ───────────────────────────────────────────────────────────────────

def view(season: str) -> dict:
    from server.api import open_db  # api imports plan, which this module imports; resolve at call time
    with connect() as conn:
        draft, pub = read(conn, season, "draft"), read(conn, season, "published")
    conn = open_db()
    return {"season": season, "draft": draft, "published": pub, "wars": wars(conn, season),
            "upcoming": expected_enemy(conn, season)}


@router.get("")
def get_days(season: str | None = Query(default=None, pattern=SEASON), leader: Leader = Depends(require_leader)):
    return view(season or current_season())


@router.put("")
def put_days(body: DayPlan, leader: Leader = Depends(require_discord_write)):
    with connect() as conn:
        write(conn, body, "draft", leader)
    return view(body.season)


@router.post("/publish")
def publish_days(body: DayPlan, leader: Leader = Depends(require_publisher)):
    return do_publish(body, leader)


def do_publish(body: DayPlan, leader: Leader) -> dict:
    from server.api import open_db
    fixed = begun(open_db(), body.season)
    problems = check(body, plan.live_rows(), fixed)
    if problems:
        raise HTTPException(422, {"problems": problems})
    with connect() as conn:
        pub = read(conn, body.season, "published")
        # Days already begun stay as they were planned, so the page can show where the game differed.
        for clan, days in body.clans.items():
            for d, lineup in fixed.get(clan, {}).items():
                days[d] = (pub["clans"].get(clan, {}).get(d) if pub else None) or lineup
        write(conn, body, "draft", leader)
        write(conn, body, "published", leader)
    return view(body.season)

