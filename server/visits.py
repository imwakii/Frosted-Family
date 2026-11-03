"""How many people have used the site: for the footer, and day by day and by region for leaders.

Each browser makes up a random id and reports it once a UTC day, with its time zone. No name, tag or address is stored, so
one person on two devices counts twice and anyone can inflate the count a little. A cap on new ids a day keeps that from
growing the table. A region is read from the time zone, so it follows the phone's setting and is close rather than exact.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from server import appdb, db
from server.auth import Leader, require_leader

MAX_A_DAY = 5000
DAYS_SHOWN = 30
NOT_RECORDED = "Not recorded"
UNKNOWN = "Unknown"  # a browser or bot that says UTC says nothing about where it is
ASIA = {
    "South Asia": "Kolkata Calcutta Karachi Dhaka Colombo Kathmandu Katmandu Thimphu Kabul",
    "South East Asia": "Singapore Jakarta Manila Bangkok Kuala_Lumpur Kuching Ho_Chi_Minh Saigon Hanoi Yangon Rangoon Phnom_Penh Vientiane Brunei Makassar Jayapura Pontianak Dili",
    "Middle East": "Dubai Riyadh Tehran Baghdad Kuwait Qatar Bahrain Muscat Beirut Damascus Amman Jerusalem Tel_Aviv Gaza Hebron Aden Nicosia",
    "East Asia": "Tokyo Seoul Shanghai Hong_Kong Taipei Macau Chongqing Urumqi Pyongyang Ulaanbaatar",
}
CITY_REGION = {city: region for region, cities in ASIA.items() for city in cities.split()}
ELSEWHERE = {"Europe": "Europe", "America": "Americas", "Africa": "Africa", "Australia": "Oceania", "Pacific": "Oceania"}
ORDER = [*ASIA, "Europe", "Americas", "Africa", "Oceania", "Other Asia", "Elsewhere", UNKNOWN, NOT_RECORDED]

router = APIRouter(prefix="/visits")


class Visit(BaseModel):
    id: str = Field(pattern=r"^[0-9a-f-]{16,40}$")
    tz: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_+/-]{1,40}$")


def region(tz: str | None) -> str:
    if not tz:
        return NOT_RECORDED
    area, _, city = tz.partition("/")
    if area in ("UTC", "GMT", "Etc"):
        return UNKNOWN
    if area == "Asia":
        return CITY_REGION.get(city, "Other Asia")
    return ELSEWHERE.get(area, "Elsewhere")


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
            conn.execute("""INSERT INTO visits (day, visitor, tz) VALUES (?,?,?)
                            ON CONFLICT (day, visitor) DO UPDATE SET tz=COALESCE(excluded.tz, visits.tz)""", (day, body.id, body.tz))
        return counts(conn)


@router.get("/daily")
def daily(leader: Leader = Depends(require_leader)):
    today = datetime.now(timezone.utc).date()
    days = [(today - timedelta(days=i)).isoformat() for i in range(DAYS_SHOWN - 1, -1, -1)]
    by_day: dict[str, dict[str, int]] = {d: {} for d in days}
    seen: dict[str, set[str]] = {}
    with appdb.connect() as conn:
        for r in conn.execute("SELECT day, visitor, tz FROM visits WHERE day>=?", (days[0],)):
            name = region(r["tz"])
            by_day[r["day"]][name] = by_day[r["day"]].get(name, 0) + 1
            seen.setdefault(name, set()).add(r["visitor"])
        totals = counts(conn)
    return {**totals, "days": [{"day": d, "total": sum(by_day[d].values()), "regions": by_day[d]} for d in days],
            "regions": [{"name": n, "total": len(seen[n])} for n in ORDER if n in seen]}
