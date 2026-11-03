"""The Plan tab: leaders' drafts, the publisher's publish, and the published allocation that /roster serves.

A publish is a full allocation (clan, cwl_slot, transferred_from for every tagged player), stamped with time and user
and with the SHA-256 of the roster CSV it was made against. It overrides the CSV only while that CSV is unchanged:
once Ka Wai runs server/pull_allocation.py and commits, or builds a new cycle, the CSV is newer and wins again. A
publish never touches the CSV or GitHub.

The rule checks re-run here before anything is stored, whatever the page already checked:
  - each CWL clan (Fire, Cake) has exactly 15 CORE
  - no clan above 50 members
  - the one-way valve: nobody moves Fire to Cake unless the publish sets override_valve
  - Maki is Cake CORE
Departed players are left out and rejoiners counted in their old slots (members.live_allocation), as on the site.
All four are settled rules in docs/specs/02-allocation-rules.md. Move order against the 50 cap is the leaders'
job in game and is not checked here.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import sqlite3
from pathlib import Path
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from server import appdb, db
from server.auth import Leader, require_discord_write, require_leader, require_leader_write, require_publisher

CWL_CLANS = ("Fire", "Cake")
CLANS = ("Fire", "Cake", "Flakes")
STARTERS = 15
CAP = 50
MAKI = "#CGJ8YR8J"
SLOT_IN = {"CORE": "CORE", "SUB": "SUB", "OUT": "Sitting Out", "Sitting Out": "Sitting Out"}
ALLOC_COLS = ("clan", "cwl_slot", "transferred_from")
DEFAULT_DB = "/opt/bots/frosted/data/frosted.db"

router = APIRouter(prefix="/plan")


def roster_path() -> Path:
    # The unit sets FROSTED_ROSTER; the fallback is the repo root, where the service and tests run.
    return Path(os.environ.get("FROSTED_ROSTER", "frosted_cwl_members.csv"))


def read_csv() -> tuple[list[dict], str]:
    raw = roster_path().read_bytes()
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8"))))
    return rows, hashlib.sha256(raw).hexdigest()


def latest_publish(conn: sqlite3.Connection) -> dict | None:
    row = conn.execute("SELECT * FROM publishes ORDER BY published_at DESC LIMIT 1").fetchone()
    if not row:
        return None
    p = dict(row)
    p["allocation"] = json.loads(p["allocation"])
    return p


def effective_roster() -> tuple[list[dict], dict]:
    """CSV rows with the latest publish laid over them by tag, if it was made against this CSV. A published player
    who is not in the CSV (a new member placed in the builder) is added as a row of their own."""
    rows, sha = read_csv()
    with appdb.connect() as conn:
        pub = latest_publish(conn)
    meta = {"source": "csv", "published_at": None, "published_by": None, "superseded": False}
    if pub:
        meta |= {"published_at": pub["published_at"], "published_by": pub["user_name"]}
        if pub["base_sha256"] == sha:
            meta["source"] = "published"
            for r in rows:
                a = pub["allocation"].get(r.get("tag") or "")
                if a:
                    r.update({k: a[k] or "" for k in ALLOC_COLS})
            tags = {r.get("tag") for r in rows}
            rows += [{"tag": t, "name": "", "tier": "NEW", "final_score": "", **{k: a[k] or "" for k in ALLOC_COLS}}
                     for t, a in sorted(pub["allocation"].items()) if t not in tags and a.get("cwl_slot") != "New"]
        else:
            meta["superseded"] = True  # the CSV changed after this publish; the CSV wins
    return rows, meta


# ─── rules ────────────────────────────────────────────────────────────────────

PLAYER_TAG = r"^#[0-9A-Z]{3,12}$"


class Move(BaseModel):
    tag: str = Field(pattern=PLAYER_TAG)
    clan: Literal["Fire", "Cake", "Flakes"]
    slot: Literal["CORE", "SUB", "OUT", "Sitting Out"]


class PublishBody(BaseModel):
    moves: list[Move] = Field(max_length=500)
    override_valve: bool = False


def apply_moves(rows: list[dict], moves: list[Move]) -> tuple[dict, list[str]]:
    """The allocation after the moves, by tag, and any move whose tag is not on the roster."""
    alloc = {r["tag"]: {k: r.get(k) or None for k in ALLOC_COLS} for r in rows if r.get("tag")}
    unknown = []
    for m in moves:
        a = alloc.get(m.tag)
        if a is None:
            unknown.append(m.tag)
            continue
        if m.clan != a["clan"]:
            # A clan change records where the player came from, the way the cycle roster does.
            a["transferred_from"] = a["clan"]
        a["clan"], a["cwl_slot"] = m.clan, SLOT_IN[m.slot]
    return alloc, unknown


def check_rules(before: dict, after: dict, override_valve: bool) -> list[str]:
    problems = []
    for clan in CLANS:
        members = [t for t, a in after.items() if a["clan"] == clan]
        if len(members) > CAP:
            problems.append(f"{clan} has {len(members)} members, above the {CAP} cap")
        if clan in CWL_CLANS:
            core = sum(after[t]["cwl_slot"] == "CORE" for t in members)
            if core != STARTERS:
                problems.append(f"{clan} has {core} in core, needs exactly {STARTERS}")
    valve = sorted(t for t in after if before[t]["clan"] == "Fire" and after[t]["clan"] == "Cake")
    if valve and not override_valve:
        problems.append(f"Fire to Cake is blocked for {len(valve)} {'player' if len(valve) == 1 else 'players'}")
    maki = after.get(MAKI)
    if maki and (maki["clan"], maki["cwl_slot"]) != ("Cake", "CORE"):
        problems.append("Maki stays in Cake core")
    return problems


# ─── routes ───────────────────────────────────────────────────────────────────

class DraftBody(BaseModel):
    moves: list[Move] = Field(max_length=500)


def draft_view(conn) -> dict:
    row = conn.execute("SELECT * FROM drafts WHERE draft_id='family'").fetchone()
    if not row:
        return {"moves": []}
    return {"moves": json.loads(row["body"])["moves"], "updated_at": row["updated_at"], "updated_by": row["updated_by"]}


@router.get("/draft")
def get_draft(leader: Leader = Depends(require_leader)):
    """The family's one shared draft; any leader may load it."""
    with appdb.connect() as conn:
        return draft_view(conn)


@router.put("/draft")
def put_draft(body: DraftBody, leader: Leader = Depends(require_discord_write)):
    """Replaces the shared draft: last write wins."""
    with appdb.connect() as conn:
        conn.execute(
            """INSERT INTO drafts VALUES ('family',?,?,?) ON CONFLICT (draft_id) DO UPDATE SET
                 body=excluded.body, updated_at=excluded.updated_at, updated_by=excluded.updated_by""",
            (body.model_dump_json(), db.utcnow(), leader.name))
        return draft_view(conn)


def live_rows() -> list[dict]:
    """effective_roster without departed players and with rejoiners in their old slots, as the lineups show it."""
    from server import members
    rows, _ = effective_roster()
    path = Path(os.environ.get("FROSTED_DB", DEFAULT_DB))
    if not path.exists():
        return rows
    conn = db.connect_readonly(path)
    try:
        return members.live_allocation(conn, rows)
    finally:
        conn.close()


@router.post("/check")
def check(body: PublishBody, leader: Leader = Depends(require_leader_write)):
    """The publish rule checks without publishing."""
    rows = live_rows()
    before, _ = apply_moves(rows, [])
    after, unknown = apply_moves(rows, body.moves)
    problems = [f"not on the roster: {t}" for t in unknown] + check_rules(before, after, body.override_valve)
    return {"ok": not problems, "problems": problems}


@router.post("/publish")
def publish(body: PublishBody, leader: Leader = Depends(require_publisher)):
    return do_publish(body, leader)


def do_publish(body: PublishBody, leader: Leader) -> dict:
    rows = live_rows()
    _, sha = read_csv()
    before, _ = apply_moves(rows, [])
    after, unknown = apply_moves(rows, body.moves)
    problems = [f"not on the roster: {t}" for t in unknown] + check_rules(before, after, body.override_valve)
    if problems:
        raise HTTPException(422, {"problems": problems})
    now = db.utcnow()
    with appdb.connect() as conn:
        conn.execute("INSERT INTO publishes VALUES (?,?,?,?,?,?,?)",
                     (now, leader.id, leader.name, sha, int(body.override_valve),
                      json.dumps([m.model_dump() for m in body.moves]), json.dumps(after)))
    return {"ok": True, "published_at": now, "published_by": leader.name, "changes": len(body.moves)}


def csv_text(v: str) -> str:
    """A player name is anyone's to choose; a spreadsheet would run one starting like a formula."""
    return f"'{v}" if v[:1] in ("=", "+", "-", "@", "\t", "\r") else v


def allocation_csv() -> Response:
    """The latest publish as CSV, for server/pull_allocation.py. 404 until something is published."""
    rows, _ = read_csv()
    with appdb.connect() as conn:
        pub = latest_publish(conn)
    if not pub:
        raise HTTPException(404, "nothing published yet")
    out = io.StringIO()
    w = csv.writer(out, lineterminator="\n")
    w.writerow(("tag", "name", *ALLOC_COLS))
    names = {r["tag"]: r["name"] for r in rows if r.get("tag")}
    for tag, a in sorted(pub["allocation"].items()):
        w.writerow((tag, csv_text(names.get(tag, "")), *(a[k] or "" for k in ALLOC_COLS)))
    return Response(out.getvalue(), media_type="text/csv", headers={
        "X-Published-At": pub["published_at"], "X-Published-By": quote(pub["user_name"] or ""),  # headers are Latin-1; names have emoji
        "Content-Disposition": "attachment; filename=allocation.csv", "Cache-Control": "no-store"})
