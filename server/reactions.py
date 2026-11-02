"""Emoji reactions on the moments worth one: a war's MVP and upsets, and a new town hall.

Anyone can see the counts; only members signed in with Discord can react or see who did. A target must be something
that happened, a member has a cap and a rate limit, and only recent reactions are served, so one script cannot grow what
every phone downloads. Stored in app.db.
"""
from __future__ import annotations

import os
import re
import sqlite3
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from server import appdb, auth, db

EMOJIS = ("\U0001F525", "\U0001F44F", "\U0001F602")  # fire, clap, laugh
RECENT_DAYS = 30           # older than a war's recap or a town hall stays on the site
MAX_PER_MEMBER = 200       # within RECENT_DAYS
MAX_PER_MINUTE = 30
TAG = r"#[0-9A-Z]{3,12}"
WAR = re.compile(rf"war:([#|0-9A-Z.]{{1,60}}):(?:mvp|upset:({TAG}):({TAG}))")
HALL = re.compile(rf"th:({TAG}):([0-9]{{1,2}})")
_taps: dict[str, list[float]] = {}

router = APIRouter(prefix="/reactions")


class Toggle(BaseModel):
    target: str = Field(max_length=120)
    emoji: str = Field(max_length=8)


def happened(target: str) -> bool:
    """Whether the target names a real war, three-star or town hall."""
    war, hall = WAR.fullmatch(target), HALL.fullmatch(target)
    if not war and not hall:
        return False
    try:
        conn = db.connect_readonly(os.environ.get("FROSTED_DB", "/opt/bots/frosted/data/frosted.db"))
    except sqlite3.OperationalError:
        return False
    try:
        if hall:
            q, args = "SELECT 1 FROM profile_snapshots WHERE player_tag=? AND town_hall=?", (hall[1], int(hall[2]))
        elif war[2]:
            q, args = "SELECT 1 FROM attacks WHERE war_key=? AND attacker_tag=? AND defender_tag=? AND stars=3", war.groups()
        else:
            q, args = "SELECT 1 FROM wars WHERE war_key=?", (war[1],)
        return conn.execute(q, args).fetchone() is not None
    except sqlite3.OperationalError:
        return False
    finally:
        conn.close()


def since() -> str:
    return (datetime.now(timezone.utc) - timedelta(days=RECENT_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")


def too_fast(member_id: str) -> bool:
    now = time.time()
    kept = [t for t in _taps.get(member_id, []) if now - t < 60]
    if len(kept) >= MAX_PER_MINUTE:
        _taps[member_id] = kept
        return True
    _taps[member_id] = [*kept, now]
    return False


def view(conn, member: auth.Member | None, target: str | None = None) -> dict:
    out: dict[str, dict] = {}
    rows = conn.execute("SELECT * FROM reactions WHERE target=? ORDER BY at" if target else "SELECT * FROM reactions WHERE at>=? ORDER BY at",
                        (target,) if target else (since(),))
    for r in rows:
        e = out.setdefault(r["target"], {}).setdefault(r["emoji"], {"n": 0, "mine": False})
        e["n"] += 1
        if member:
            e["mine"] = e["mine"] or r["user_id"] == member.id
            e.setdefault("names", []).append(r["name"] or "Someone")
    return out


@router.get("")
def reactions(member: auth.Member | None = Depends(auth.current_member)):
    with appdb.connect() as conn:
        return {"member": {"name": member.name, "csrf": member.csrf} if member else None, "emojis": EMOJIS, "reactions": view(conn, member)}


@router.post("")
def toggle(body: Toggle, member: auth.Member = Depends(auth.require_member_write)):
    if body.emoji not in EMOJIS or not happened(body.target):
        raise HTTPException(422, "not something to react to")
    if too_fast(member.id):
        raise HTTPException(429, "slow down")
    key = (body.target, body.emoji, member.id)
    with appdb.connect() as conn:
        had = conn.execute("DELETE FROM reactions WHERE target=? AND emoji=? AND user_id=?", key).rowcount
        if not had:
            if conn.execute("SELECT COUNT(*) FROM reactions WHERE user_id=? AND at>=?", (member.id, since())).fetchone()[0] >= MAX_PER_MEMBER:
                raise HTTPException(429, "too many reactions")
            conn.execute("INSERT INTO reactions VALUES (?,?,?,?,?)", (*key, member.name, db.utcnow()))
        return view(conn, member, body.target).get(body.target, {})
