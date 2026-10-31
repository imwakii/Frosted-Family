"""Read API for the Frosted Family site, served at cwl-api.ngkawai.dev behind Caddy and reached by the site through a
Vercel rewrite.

    GET /roster          every allocated player from frosted_cwl_members.csv, joined on tag to the latest snapshot
    GET /war/live        each clan's current war: CWL day, opponent, stars, attacks used
    GET /player/{tag}    one player's allocation, latest snapshot, wars, attacks and missed attacks

The CSV is canonical for allocation and is read as it stands; nothing here changes clan, cwl_slot or
transferred_from. Tag is the join key, never name.

    uvicorn server.api:app --host 127.0.0.1 --port 8090
"""
from __future__ import annotations

import csv
import os
import sqlite3
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException

from frosted.config import CLAN_TAGS, TAG_TO_CLAN
from server import db

DEFAULT_DB = "/opt/bots/frosted/data/frosted.db"
ROSTER_FIELDS = ("tag", "name", "clan", "cwl_slot", "transferred_from", "tier", "final_score", "current_th", "flags")

app = FastAPI(title="Frosted Family CWL", docs_url=None, redoc_url=None, openapi_url=None)


def db_path() -> str:
    return os.environ.get("FROSTED_DB", DEFAULT_DB)


def roster_path() -> Path:
    # The unit sets FROSTED_ROSTER; the fallback is the repo root, where the service and tests run.
    return Path(os.environ.get("FROSTED_ROSTER", "frosted_cwl_members.csv"))


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


def read_roster() -> list[dict]:
    with roster_path().open(encoding="utf-8", newline="") as f:
        return [{k: blank_to_none(row.get(k)) for k in ROSTER_FIELDS} for row in csv.DictReader(f)]


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
    for r in read_roster():
        # Rows with no tag (joined between export and roster build) cannot be joined and show without a snapshot.
        r["snapshot"] = snapshot_view(latest.get(r["tag"])) if r["tag"] else None
        rows.append(r)
    return {"players": rows, "last_poll": last_poll(conn)}


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
    alloc = next((r for r in read_roster() if r["tag"] == tag), None)
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


# ─── leader-only endpoints: STUBS ─────────────────────────────────────────────
# The Plan tab's draft and publish. Not built: Ka Wai has not decided how leaders sign in. Until then require_leader
# refuses every request, so these routes cannot change anything. Replace it with the chosen auth, then build the
# handlers. Publishing must still never write clan, cwl_slot or transferred_from without his decision.

def require_leader(authorization: str | None = Header(default=None)) -> None:
    raise HTTPException(401, "leader sign-in is not set up yet")


@app.get("/plan/draft", dependencies=[Depends(require_leader)])
def get_draft():  # pragma: no cover - unreachable until auth exists
    raise HTTPException(501, "not built")


@app.put("/plan/draft", dependencies=[Depends(require_leader)])
def put_draft():  # pragma: no cover
    raise HTTPException(501, "not built")


@app.post("/plan/publish", dependencies=[Depends(require_leader)])
def publish():  # pragma: no cover
    raise HTTPException(501, "not built")
