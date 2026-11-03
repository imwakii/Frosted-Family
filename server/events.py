"""The clan calendar: what Supercell announced, what the game repeats, and the family's own wars.

Supercell's monthly news post is the only list of its events: the API gives just the Gold Pass season's dates and there
is no feed. So the collector reads the news archive twice a day and keeps each dated line's name and dates, never the
post's text, with a link back. Each paragraph of that post opens with a bold "November 1-30: November Gold Pass."

    GET /calendar?month=YYYY-MM

Every event is one of:
    supercell  from the news post, by date
    api        the Gold Pass season, from the official API, to the second
    war        the family's wars the collector has seen, to the second; CWL days not drawn yet follow from the last drawn
    pattern    what repeats: Raid Weekend each week, and for a month with no post yet, Clan Games and the Gold Pass
    plan       the family's habit for a month that has not happened: a friendly on the 1st, CWL drawn on the 2nd

Dates come from start_time and end_time. wars.season holds whatever the API said, which is not the month.
"""
from __future__ import annotations

import calendar as cal
import json
import re
import sqlite3
from datetime import date, datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, HTTPException

from frosted.config import CLAN_TAGS
from server.plan import CWL_CLANS

SITE = "https://supercell.com"
ARCHIVE = "/en/games/clashofclans/blog/"
MONTH_NAMES = {m: i for i, m in enumerate(cal.month_name) if m}
LEAD = re.compile(r"^(?P<m1>[A-Z][a-z]+) (?P<d1>\d{1,2})(?:\s*[-–]\s*(?:(?P<m2>[A-Z][a-z]+) )?(?P<d2>\d{1,2}))?\s*:\s*(?P<name>.+)$")
MIN_LINES = 3  # fewer dated lines than this is an ordinary article that happens to mention a date
FETCH_HOURS = (8, 20)  # the post goes up around 08:00 UTC on the 1st
REREAD = timedelta(days=7)
COSMETIC = re.compile(r"\b(Scenery|Cosmetics|Skin|Skins|Stickers|Chests)\b|\b(King|Queen|Warden|Champion|Prince|Duke)\)?$")
RAID_DAY = 4  # Friday
RAID_HOUR = 7
RAID_DAYS = 3
CLAN_GAMES = (22, 28)
PLANNED_FRIENDLY = (1, 2)
PLANNED_CWL = (2, 10)
CWL_DAYS = 7

router = APIRouter()


# ─── Supercell's news ──────────────────────────────────────────────────────────

def page_props(html: str) -> dict:
    """The structured data Supercell's own page is drawn from."""
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    return json.loads(m.group(1))["props"]["pageProps"] if m else {}


def dated_lines(post: dict) -> list[str]:
    """Each paragraph's opening bold run."""
    lines = []
    for block in post.get("bodyCollection") or []:
        doc = (block.get("text") or {}).get("json") or {} if block.get("__typename") == "TextBlock" else {}
        for node in doc.get("content") or []:
            first = next(iter(node.get("content") or []), {}) if node.get("nodeType") == "paragraph" else {}
            if any(m.get("type") == "bold" for m in first.get("marks") or []):
                lines.append(first.get("value", "").replace("\xa0", " ").strip())
    return lines


def parse_line(line: str, year: int, published_month: int) -> dict | None:
    m = LEAD.match(line)
    name = m and m["name"].strip().rstrip(".").strip()
    if not m or not name or m["m1"] not in MONTH_NAMES or (m["m2"] and m["m2"] not in MONTH_NAMES):
        return None
    first = MONTH_NAMES[m["m1"]]
    last = MONTH_NAMES[m["m2"]] if m["m2"] else first
    # A post from December can date an event in January.
    y1 = year + 1 if first < published_month - 6 else year
    y2 = y1 + 1 if last < first else y1
    try:
        start = date(y1, first, int(m["d1"]))
        end = date(y2, last, int(m["d2"] or m["d1"]))
    except ValueError:
        return None
    return {"name": name, "start": start, "end": end} if start <= end else None


def parse_post(post: dict) -> list[dict]:
    published = post.get("publishDate") or ""
    if not re.match(r"\d{4}-\d{2}", published):
        return []
    found = (parse_line(l, int(published[:4]), int(published[5:7])) for l in dated_lines(post))
    events = [e for e in found if e]
    return events if len(events) >= MIN_LINES else []


def collect_news(conn: sqlite3.Connection, client: httpx.Client, now: datetime) -> int:
    """The archive's first page, then any post on it not read before or new enough to have been corrected. A failure
    keeps what we have and tries again at the next fetch hour. Returns the number of posts read."""
    r = client.get(ARCHIVE)
    r.raise_for_status()
    articles = page_props(r.text).get("articles") or []
    if not articles:
        raise ValueError("no articles on the news archive, its page may have changed")
    recent = (now - REREAD).strftime("%Y-%m-%d")
    known = {row[0] for row in conn.execute("SELECT slug FROM game_posts")}
    read = 0
    for a in articles:
        path = (a.get("linkUrl") or "").rstrip("/")
        slug = path.rsplit("/", 1)[-1]
        if not slug or "/news/" not in path or (slug in known and (a.get("publishDate") or "") < recent):
            continue
        r = client.get(path + "/")
        r.raise_for_status()
        post = page_props(r.text)
        events = parse_post(post)
        with conn:
            conn.execute("INSERT OR REPLACE INTO game_posts VALUES (?,?,?,?)",
                         (slug, post.get("title"), post.get("publishDate"), now.strftime("%Y-%m-%dT%H:%M:%SZ")))
            conn.execute("DELETE FROM game_events WHERE slug=?", (slug,))
            conn.executemany("INSERT OR REPLACE INTO game_events VALUES (?,?,?,?,?)",
                             [(slug, i, e["name"], e["start"].isoformat(), e["end"].isoformat()) for i, e in enumerate(events)])
        read += 1
    return read


def store_gold_pass(conn: sqlite3.Connection, season: dict | None) -> None:
    if season and season.get("startTime") and season.get("endTime"):
        conn.execute("INSERT OR REPLACE INTO gold_pass VALUES (?,?)", (season["startTime"], season["endTime"]))


def news_due(now: datetime) -> bool:
    """Once in each fetch hour: the 10-minute pass lands in its first ten minutes exactly once."""
    return now.hour in FETCH_HOURS and now.minute < 10


# ─── the calendar ──────────────────────────────────────────────────────────────

def iso(api_time: str | None) -> str | None:
    """The API's 20261103T184508.000Z as 2026-11-03T18:45:08Z."""
    m = re.match(r"(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})", api_time or "")
    return f"{m[1]}-{m[2]}-{m[3]}T{m[4]}:{m[5]}:{m[6]}Z" if m else None


def parse_iso(t: str) -> datetime:
    return datetime.strptime(t, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def later(t: str, days: int) -> str:
    return (parse_iso(t) + timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")


def event(id: str, title: str, kind: str, source: str, start: str, end: str, *, clan: str | None = None, timed: bool = False,
          expected: bool = False, **extra) -> dict:
    return {"id": id, "title": title, "kind": kind, "source": source, "clan": clan, "start": start, "end": end, "timed": timed,
            "expected": expected, **extra}


def kind_of(name: str) -> str:
    if "Clan Games" in name:
        return "clan_games"
    if "Gold Pass" in name:
        return "season"
    if "Clan War League" in name:
        return "cwl_window"
    return "cosmetic" if COSMETIC.search(name) else "game"


def side(w: dict, tag: str) -> dict:
    us, them = ("clan", "opponent") if w["clan_tag"] == tag else ("opponent", "clan")
    return {"opponent": w[f"{them}_name"], "stars": w[f"{us}_stars"], "opponent_stars": w[f"{them}_stars"],
            "destruction": w[f"{us}_destruction"], "opponent_destruction": w[f"{them}_destruction"]}


def rows(conn: sqlite3.Connection | None, sql: str, *params) -> list[dict]:
    """Nothing, rather than an error, before the first poll or the first pass since these tables were added."""
    if not conn:
        return []
    try:
        return [dict(r) for r in conn.execute(sql, params)]
    except sqlite3.OperationalError:
        return []


def war_view(w: dict, tag: str) -> dict:
    return {"war_key": w["war_key"], "state": w["state"], "start": iso(w["start_time"]), "end": iso(w["end_time"]), **side(w, tag)}


def clan_wars(conn, clan: str, tag: str, first: date, last: date) -> tuple[list[dict], bool]:
    """One clan's wars touching the month: its CWL as one event with its seven days, the friendly before it, other wars."""
    lo, hi = first.strftime("%Y%m%d"), (last + timedelta(days=1)).strftime("%Y%m%d")
    wars = rows(conn, """SELECT * FROM wars WHERE ? IN (clan_tag, opponent_tag) AND start_time IS NOT NULL
                         AND substr(preparation_start, 1, 8) < ? AND substr(end_time, 1, 8) >= ?
                         ORDER BY preparation_start""", tag, hi, lo)
    cwl = [w for w in wars if w["kind"] == "cwl"]
    out = []
    cwl_from = None
    if cwl:
        cwl_from = iso(cwl[0]["preparation_start"])
        days = [{"day": w["round"], **war_view(w, tag)} for w in cwl]
        drawn = {d["day"] for d in days}
        top = max(cwl, key=lambda w: w["round"])
        for n in range(1, CWL_DAYS + 1):
            if n not in drawn and n > top["round"]:
                # Each CWL day begins as the one before it ends, so days not drawn yet follow from the last one drawn.
                gap = n - top["round"]
                days.append({"day": n, "war_key": None, "state": "notDrawn", "start": later(iso(top["start_time"]), gap),
                             "end": later(iso(top["end_time"]), gap)})
        days.sort(key=lambda d: d["day"])
        out.append(event(f"cwl-{clan}-{first:%Y-%m}", f"{clan} CWL", "cwl", "war", cwl_from, days[-1]["end"], clan=clan, timed=True, days=days))
    for w in wars:
        if w["kind"] != "regular":
            continue
        start = iso(w["start_time"])
        # The API does not say a war is a friendly. A CWL clan's war fought from the 1st and over before the draw is taken as one.
        before_draw = iso(w["end_time"]) <= cwl_from if cwl_from else start[:10] <= first.replace(day=PLANNED_FRIENDLY[1]).isoformat()
        friendly = clan in CWL_CLANS and start[:10] >= first.isoformat() and before_draw
        out.append(event(f"war-{w['war_key']}", f"{clan} v {side(w, tag)['opponent']}", "friendly" if friendly else "war", "war",
                         start, iso(w["end_time"]), clan=clan, timed=True, war_key=w["war_key"], state=w["state"], **side(w, tag)))
    return out, bool(cwl)


def planned(clan: str, first: date, today: date, has_cwl: bool, has_friendly: bool) -> list[dict]:
    """The family's habit, until the month's own wars replace it. A day already past is not planned any more."""
    if has_cwl:
        return []
    out = []
    month = f"{first:%Y-%m}"
    friendly_end, cwl_start, cwl_end = (first.replace(day=d) for d in (PLANNED_FRIENDLY[1], *PLANNED_CWL))
    if not has_friendly and today <= first.replace(day=PLANNED_FRIENDLY[0]):
        out.append(event(f"plan-friendly-{clan}-{month}", f"{clan} friendly", "friendly", "plan", first.isoformat(), friendly_end.isoformat(), clan=clan, expected=True))
    if today <= cwl_start:
        out.append(event(f"plan-cwl-{clan}-{month}", f"{clan} CWL", "cwl", "plan", cwl_start.isoformat(), cwl_end.isoformat(), clan=clan, expected=True))
    return out


def raid_weekends(first: date, last: date) -> list[dict]:
    d = first - timedelta(days=RAID_DAYS)
    d += timedelta(days=(RAID_DAY - d.weekday()) % 7)
    out = []
    while d <= last:
        start = f"{d.isoformat()}T{RAID_HOUR:02d}:00:00Z"
        end = f"{(d + timedelta(days=RAID_DAYS)).isoformat()}T{RAID_HOUR:02d}:00:00Z"
        if end[:10] >= first.isoformat():
            out.append(event(f"raid-{d}", "Raid Weekend", "raid", "pattern", start, end, timed=True))
        d += timedelta(days=7)
    return out


def month_events(conn, first: date, today: date) -> dict:
    last = first.replace(day=cal.monthrange(first.year, first.month)[1])
    a, b = first.isoformat(), last.isoformat()
    events: list[dict] = []
    for clan, tag in CLAN_TAGS.items():
        wars, has_cwl = clan_wars(conn, clan, tag, first, last)
        events += wars
        if clan in CWL_CLANS:
            events += planned(clan, first, today, has_cwl, any(e["kind"] == "friendly" for e in wars))
    has_cwl = any(e["kind"] == "cwl" for e in events)

    posted = rows(conn, """SELECT e.*, p.title AS post_title FROM game_events e JOIN game_posts p USING (slug)
                           WHERE e.start_date <= ? AND e.end_date >= ? ORDER BY e.start_date, e.line""", b, a)
    # A post's events that start in another month do not make this month announced: November's last one runs to 1 December.
    announced = any(r["start_date"][:7] == a[:7] for r in posted)
    gold = [g for g in rows(conn, "SELECT * FROM gold_pass ORDER BY start_time") if iso(g["start_time"])[:10] <= b and iso(g["end_time"])[:10] >= a]
    for g in gold:
        events.append(event(f"gold-{g['start_time']}", "Gold Pass", "season", "api", iso(g["start_time"]), iso(g["end_time"]), timed=True))
    for r in posted:
        k = kind_of(r["name"])
        # The family's own CWL says more than Supercell's window for it, and the API's Gold Pass more than the post's.
        if (k == "cwl_window" and has_cwl) or (k == "season" and gold):
            continue
        events.append(event(f"post-{r['slug']}-{r['line']}", r["name"], k, "supercell", r["start_date"], r["end_date"],
                            url=f"{SITE}{ARCHIVE}news/{r['slug']}/", post=r["post_title"]))
    if not announced and first >= today.replace(day=1):
        if not gold:
            events.append(event(f"pattern-gold-{a[:7]}", "Gold Pass", "season", "pattern", a, b, expected=True))
        events.append(event(f"pattern-games-{a[:7]}", "Clan Games", "clan_games", "pattern", first.replace(day=CLAN_GAMES[0]).isoformat(),
                            first.replace(day=CLAN_GAMES[1]).isoformat(), expected=True))
    events += raid_weekends(first, last)
    checked = rows(conn, "SELECT MAX(fetched_at) AS at FROM game_posts")
    return {"month": a[:7], "events": events, "news_checked": checked[0]["at"] if checked else None}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


@router.get("/calendar")
def calendar_month(month: str | None = None):
    from server import api
    today = now_utc().date()
    month = month or f"{today:%Y-%m}"
    if not re.fullmatch(r"20\d{2}-(0[1-9]|1[0-2])", month):
        raise HTTPException(422, "month is YYYY-MM")
    first = date(int(month[:4]), int(month[5:7]), 1)
    return month_events(api.open_db(), first, today)
