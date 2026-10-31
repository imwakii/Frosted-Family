"""Read API for the Frosted Family site, served at FROSTED_API_HOST (deploy/setup.sh) behind Caddy and reached by the
site through a Vercel rewrite.

    GET /roster          every allocated player from frosted_cwl_members.csv, joined on tag to the latest snapshot
    GET /clans           each clan's name, badge URLs and war league
    GET /war/live        each clan's current war: CWL day, opponent, stars, attacks used
    GET /player/{tag}    one player's allocation, latest snapshot, wars, attacks and missed attacks
    GET /allocation.csv  the latest published allocation, for server/pull_allocation.py
    GET /explore/{board} ranked boards from player profiles: heroes, equipment, army, war, donations, capital
    GET /explore/matrix?cat=heroes|equipment|troops|spells|pets|sieges   every member's level in every unit
    /auth/*, /plan/*     Discord sign-in for leaders (server/auth.py) and the Plan tab (server/plan.py)

The CSV is canonical for allocation. The one thing laid over it is the publisher's latest publish, and only while the
CSV is the one it was published against (server/plan.py). Tag is the join key, never name.

    uvicorn server.api:app --host 127.0.0.1 --port 8090
"""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request

from frosted.config import CLAN_TAGS, TAG_TO_CLAN
from server import auth, db, plan, profiles

DEFAULT_DB = "/opt/bots/frosted/data/frosted.db"
ROSTER_FIELDS = ("tag", "name", "clan", "cwl_slot", "transferred_from", "tier", "final_score", "current_th", "flags")

app = FastAPI(title="Frosted Family CWL", docs_url=None, redoc_url=None, openapi_url=None)


def db_path() -> str:
    return os.environ.get("FROSTED_DB", DEFAULT_DB)


def open_db() -> sqlite3.Connection | None:
    path = db_path()
    if not Path(path).exists():
        return None  # the collector has not run yet; every endpoint still answers
    return db.connect_readonly(path)


def norm_tag(tag: str) -> str:
    t = tag.strip().upper().lstrip("#").replace("O", "0")  # game tags have no letter O
    return "#" + t


def blank_to_none(v):
    return None if v is None or v == "" else v


def read_roster() -> tuple[list[dict], dict]:
    rows, meta = plan.effective_roster()
    return [{k: blank_to_none(row.get(k)) for k in ROSTER_FIELDS} for row in rows], meta


def snapshot_view(s: dict | None) -> dict | None:
    if not s:
        return None
    return {
        "name": s["name"], "clan_tag": s["clan_tag"], "clan": TAG_TO_CLAN.get(s["clan_tag"]), "role": s["role"],
        "town_hall": s["town_hall"], "trophies": s["trophies"], "seen_at": s["seen_at"],
    }


@app.get("/roster")
def roster():
    conn = open_db()
    latest = db.latest_members(conn) if conn else {}
    rows = []
    players, meta = read_roster()
    for r in players:
        # Rows with no tag (joined between export and roster build) cannot be joined and show without a snapshot.
        r["snapshot"] = snapshot_view(latest.get(r["tag"])) if r["tag"] else None
        rows.append(r)
    return {"players": rows, "allocation": meta, "last_poll": last_poll(conn)}


def last_poll(conn) -> str | None:
    if not conn:
        return None
    row = conn.execute("SELECT MAX(finished_at) FROM polls").fetchone()
    return row[0]


def current_war(conn, clan_tag: str) -> dict | None:
    """The war being fought now, else the one in preparation, else the most recent. During CWL tomorrow's war sits
    in preparation while today's is in war, so battle day wins."""
    rows = conn.execute(
        """SELECT * FROM wars WHERE ? IN (clan_tag, opponent_tag)
           ORDER BY CASE state WHEN 'inWar' THEN 0 WHEN 'preparation' THEN 1 ELSE 2 END, preparation_start DESC
           LIMIT 1""",
        (clan_tag,),
    ).fetchall()
    return dict(rows[0]) if rows else None


def oriented(w: dict, clan_tag: str) -> dict:
    """Flip a war row so 'us' is clan_tag, whichever side the API listed it on."""
    us, them = ("clan", "opponent") if w["clan_tag"] == clan_tag else ("opponent", "clan")
    return {
        "kind": w["kind"], "state": w["state"], "season": w["season"], "day": w["round"],
        "team_size": w["team_size"], "start_time": w["start_time"], "end_time": w["end_time"],
        "opponent": {"tag": w[f"{them}_tag"], "name": w[f"{them}_name"]},
        "stars": w[f"{us}_stars"], "opponent_stars": w[f"{them}_stars"],
        "destruction": w[f"{us}_destruction"], "opponent_destruction": w[f"{them}_destruction"],
        "attacks_used": w[f"{us}_attacks"], "attacks_allowed": (w["team_size"] or 0) * (w["attacks_per_member"] or 0),
        "opponent_attacks_used": w[f"{them}_attacks"],
    }


@app.get("/clans")
def clans():
    """Each clan's name, badge and war league, for the site's headers. null fields until the first poll."""
    conn = open_db()
    rows = {r["clan_tag"]: r for r in conn.execute("SELECT * FROM clans")} if conn else {}
    out = []
    for name, tag in CLAN_TAGS.items():
        r = rows.get(tag)
        out.append({"clan": name, "tag": tag, "name": r["name"] if r else None,
                    "badge_urls": {k: r[f"badge_{k}"] if r else None for k in ("small", "medium", "large")},
                    "war_league": r["war_league"] if r else None, "capital_league": r["capital_league"] if r else None,
                    "members": r["members"] if r else None, "updated_at": r["updated_at"] if r else None})
    return {"clans": out}


@app.get("/war/live")
def war_live():
    conn = open_db()
    clans = []
    for name, tag in CLAN_TAGS.items():
        w = current_war(conn, tag) if conn else None
        clans.append({"clan": name, "tag": tag, "war": oriented(w, tag) if w else None})
    return {"clans": clans, "last_poll": last_poll(conn)}


@app.get("/player/{tag}")
def player(tag: str):
    tag = norm_tag(tag)
    alloc = next((r for r in read_roster()[0] if r["tag"] == tag), None)
    conn = open_db()
    snap = db.latest_members(conn).get(tag) if conn else None
    if not alloc and not snap:
        raise HTTPException(404, "player not found")
    wars, missed = [], []
    if conn:
        for w in conn.execute(
            """SELECT w.*, m.clan_tag AS player_clan, m.map_position, m.town_hall AS war_th, m.attacks_used
               FROM war_members m JOIN wars w USING (war_key) WHERE m.player_tag=?
               ORDER BY w.preparation_start DESC""",
            (tag,),
        ):
            w = dict(w)
            attacks = [dict(a) for a in conn.execute(
                """SELECT attack_order, defender_tag, stars, destruction, duration FROM attacks
                   WHERE war_key=? AND attacker_tag=? ORDER BY attack_order""", (w["war_key"], tag))]
            wars.append({**oriented(w, w["player_clan"]), "clan": TAG_TO_CLAN.get(w["player_clan"]),
                         "map_position": w["map_position"], "town_hall": w["war_th"],
                         "attacks_per_member": w["attacks_per_member"], "attacks": attacks})
        missed = [m for m in db.missed_attacks(conn) if m["player_tag"] == tag]
    return {"tag": tag, "allocation": alloc, "snapshot": snapshot_view(snap), "wars": wars,
            "missed_attacks": sum(m["missed"] for m in missed)}


# ─── allocation, sign-in, plan, explore ───────────────────────────────────────

@app.get("/allocation.csv")
def allocation():
    return plan.allocation_csv()


@app.get("/explore/matrix")  # before /explore/{board}, which would otherwise take "matrix"
def explore_matrix(cat: str = "heroes"):
    return profiles.matrix(open_db(), cat)


@app.get("/explore/{board}")
def explore(board: str):
    return profiles.board(open_db(), board)


app.include_router(auth.router)
app.include_router(plan.router)


@app.middleware("http")
async def private_responses(request: Request, call_next):
    """Sign-in and plan answers are per leader. Caddy marks the public reads cacheable, so these say no-store, and
    Vary: Cookie keeps any cache from handing one leader's answer to another."""
    resp = await call_next(request)
    if request.url.path.startswith(("/auth", "/plan", "/allocation")):
        resp.headers["Cache-Control"] = "no-store, private"
    resp.headers["Vary"] = "Cookie"
    return resp
