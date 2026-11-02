"""How many people have used the site, for the footer.

Each browser makes up a random id and reports it once a UTC day. No name, tag or address is stored, so one person on two
devices counts twice and anyone can inflate the count a little. A cap on new ids a day keeps that from growing the table.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter
from pydantic import BaseModel, Field

from server import appdb, db

MAX_A_DAY = 5000

router = APIRouter(prefix="/visits")


class Visit(BaseModel):
    id: str = Field(pattern=r"^[0-9a-f-]{16,40}$")


def counts(conn) -> dict:
    week_from = (datetime.now(timezone.utc) - timedelta(days=6)).strftime("%Y-%m-%d")
    return {
        "week": conn.execute("SELECT COUNT(DISTINCT visitor) FROM visits WHERE day>=?", (week_from,)).fetchone()[0],
        "total": conn.execute("SELECT COUNT(DISTINCT visitor) FROM visits").fetchone()[0],
    }


@router.get("")
def get_visits():
    with appdb.connect() as conn:
        return counts(conn)


@router.post("")
def add_visit(body: Visit):
    day = db.utcnow()[:10]
    with appdb.connect() as conn:
        if conn.execute("SELECT COUNT(*) FROM visits WHERE day=?", (day,)).fetchone()[0] < MAX_A_DAY:
            conn.execute("INSERT OR IGNORE INTO visits VALUES (?,?)", (day, body.id))
        return counts(conn)
