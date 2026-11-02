"""Leaders' proposals, for the lineup builder and the day planner.

Each leader with a Discord session keeps one open proposal per kind (and season, for days), so nobody overwrites anyone
else. Every leader can read all of them. Only the publisher decides: accepting publishes the proposal through the same
rule checks as a direct publish, and a proposal that fails them stays open. Rejecting, or the author withdrawing, closes
it. A proposal stores the whole plan (days) or its moves (lineup), so what it changes is always worked out against what
is published at the time.
"""
from __future__ import annotations

import json
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from server import appdb, db, days, plan
from server.auth import Leader, require_discord_write, require_leader, require_publisher

DECIDED_SHOWN = 5

router = APIRouter(prefix="/plan/proposals")


class ProposalBody(BaseModel):
    kind: Literal["days", "lineup"]
    season: str = ""
    body: dict


class AcceptBody(BaseModel):
    override_valve: bool = False


def clean(p: ProposalBody) -> dict:
    """The body as its kind's own model has it; a malformed proposal is refused like a malformed publish."""
    try:
        if p.kind == "days":
            return {"clans": days.DayPlan(season=p.season, clans=p.body.get("clans", {})).clans}
        return {"moves": [m.model_dump() for m in plan.DraftBody(moves=p.body.get("moves", [])).moves]}
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


def view(r, leader: Leader) -> dict:
    return {"id": r["id"], "kind": r["kind"], "season": r["season"], "author": r["author_name"],
            "mine": r["author_id"] == leader.id, "body": json.loads(r["body"]), "status": r["status"],
            "updated_at": r["updated_at"], "decided_by": r["decided_by"], "decided_at": r["decided_at"]}


def get_open(conn, proposal_id: int):
    r = conn.execute("SELECT * FROM proposals WHERE id=?", (proposal_id,)).fetchone()
    if not r:
        raise HTTPException(404, "no such proposal")
    if r["status"] != "open":
        raise HTTPException(409, f"already {r['status']}")
    return r


def close(conn, proposal_id: int, status: str, leader: Leader) -> None:
    conn.execute("UPDATE proposals SET status=?, decided_by=?, decided_at=? WHERE id=?",
                 (status, leader.name, db.utcnow(), proposal_id))


@router.get("")
def list_proposals(kind: Literal["days", "lineup"], season: str | None = Query(default=None),
                   leader: Leader = Depends(require_leader)):
    season = "" if kind == "lineup" else season or days.current_season()
    with appdb.connect() as conn:
        rows = conn.execute("""SELECT * FROM proposals WHERE kind=? AND season=? AND status!='withdrawn'
                               ORDER BY COALESCE(decided_at, updated_at) DESC""", (kind, season)).fetchall()
    return {"season": season, "open": [view(r, leader) for r in rows if r["status"] == "open"],
            "decided": [view(r, leader) for r in rows if r["status"] != "open"][:DECIDED_SHOWN]}


@router.put("")
def save_proposal(p: ProposalBody, leader: Leader = Depends(require_discord_write)):
    """Creates the leader's open proposal, or replaces it."""
    body = json.dumps(clean(p))
    season = "" if p.kind == "lineup" else p.season
    now = db.utcnow()
    with appdb.connect() as conn:
        mine = conn.execute("SELECT id FROM proposals WHERE kind=? AND season=? AND author_id=? AND status='open'",
                            (p.kind, season, leader.id)).fetchone()
        if mine:
            conn.execute("UPDATE proposals SET body=?, author_name=?, updated_at=? WHERE id=?",
                         (body, leader.name, now, mine["id"]))
            pid = mine["id"]
        else:
            pid = conn.execute("""INSERT INTO proposals (kind, season, author_id, author_name, body, status, updated_at)
                                  VALUES (?,?,?,?,?,'open',?)""", (p.kind, season, leader.id, leader.name, body, now)).lastrowid
        return view(conn.execute("SELECT * FROM proposals WHERE id=?", (pid,)).fetchone(), leader)


@router.delete("/{proposal_id}")
def withdraw(proposal_id: int, leader: Leader = Depends(require_discord_write)):
    with appdb.connect() as conn:
        r = get_open(conn, proposal_id)
        if r["author_id"] != leader.id:
            raise HTTPException(403, "only its author can withdraw a proposal")
        close(conn, proposal_id, "withdrawn", leader)
    return {"ok": True}


@router.post("/{proposal_id}/accept")
def accept(proposal_id: int, a: AcceptBody | None = None, leader: Leader = Depends(require_publisher)):
    with appdb.connect() as conn:
        r = get_open(conn, proposal_id)
    body = json.loads(r["body"])
    # Either publish raises a 422 with the rule problems, and the proposal stays open.
    if r["kind"] == "days":
        days.do_publish(days.DayPlan(season=r["season"], clans=body["clans"]), leader)
    else:
        plan.do_publish(plan.PublishBody(moves=body["moves"], override_valve=bool(a and a.override_valve)), leader)
    with appdb.connect() as conn:
        close(conn, proposal_id, "accepted", leader)
    return {"ok": True}


@router.post("/{proposal_id}/reject")
def reject(proposal_id: int, leader: Leader = Depends(require_publisher)):
    with appdb.connect() as conn:
        get_open(conn, proposal_id)
        close(conn, proposal_id, "rejected", leader)
    return {"ok": True}
