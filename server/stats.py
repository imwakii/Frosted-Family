"""Clan statistics over time: GET /stats/clans.

The collector writes one clan_daily row per clan per day (record_day), so the endpoint reads a small table. Wars,
raid weekends and cycle scores come from their own tables and from data/score_history.csv. Every series is a list
of {date, value}; the family line is the three clans added up.

score_history.csv has no slot column, so a cycle's CORE lineup is only known for the current cycle (from the live
roster). Earlier cycles report the average score of the clan's members, with core_avg_score null.
"""
from __future__ import annotations

import csv
import os
from pathlib import Path
from statistics import mean

from frosted.config import CLAN_TAGS, TAG_TO_CLAN
from server import plan

SEASON_RESET = 0.5   # season-to-date donations falling by half or more mark a new season


def record_day(conn, now: str) -> None:
    """Rewrite today's row for each clan from its latest member poll, profiles and clan details."""
    date = now[:10]
    for clan_tag in CLAN_TAGS.values():
        latest = conn.execute("SELECT MAX(seen_at) FROM member_snapshots WHERE clan_tag=?", (clan_tag,)).fetchone()[0]
        if not latest:
            continue
        m = conn.execute(
            """SELECT COUNT(*) AS n, COALESCE(SUM(town_hall), 0) AS th, COALESCE(SUM(donations), 0) AS don,
                      COALESCE(SUM(donations_received), 0) AS rec
               FROM member_snapshots WHERE clan_tag=? AND seen_at=?""", (clan_tag, latest)).fetchone()
        h = conn.execute(
            """SELECT COALESCE(SUM(u.level), 0) AS lv, COALESCE(SUM(u.max_level), 0) AS mx
               FROM member_snapshots s JOIN player_units u ON u.player_tag = s.player_tag AND u.kind = 'hero'
               WHERE s.clan_tag=? AND s.seen_at=?""", (clan_tag, latest)).fetchone()
        cap = conn.execute(
            """SELECT SUM(p.capital_contributions) FROM member_snapshots s
               JOIN player_profiles p ON p.player_tag = s.player_tag WHERE s.clan_tag=? AND s.seen_at=?""",
            (clan_tag, latest)).fetchone()[0]
        league = conn.execute("SELECT war_league FROM clans WHERE clan_tag=?", (clan_tag,)).fetchone()
        conn.execute(
            """INSERT INTO clan_daily VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (date, clan_tag) DO UPDATE SET
                 members=excluded.members, th_sum=excluded.th_sum, hero_levels=excluded.hero_levels,
                 hero_max=excluded.hero_max, donations=excluded.donations,
                 donations_received=excluded.donations_received, capital_contributions=excluded.capital_contributions,
                 war_league=excluded.war_league, updated_at=excluded.updated_at""",
            (date, clan_tag, m["n"], m["th"], h["lv"], h["mx"], m["don"], m["rec"], cap,
             league["war_league"] if league else None, now))


# ─── reading ──────────────────────────────────────────────────────────────────

def day(t: str | None) -> str | None:
    return f"{t[:4]}-{t[4:6]}-{t[6:8]}" if t else None  # 20261104T080000.000Z -> 2026-11-04


def series(rows: list[dict], fn) -> list[dict]:
    out = []
    for r in rows:
        v = fn(r)
        if v is not None:
            out.append({"date": r["date"], "value": v})
    return out


def seasons(points: list[dict]) -> list[dict]:
    """Completed seasons' donation totals: the last day before season-to-date donations drop by half or more."""
    out = []
    for prev, cur in zip(points, points[1:]):
        if prev["value"] and cur["value"] <= prev["value"] * (1 - SEASON_RESET):
            out.append(prev)
    return out


def daily_rows(conn, tags: list[str]) -> list[dict]:
    """clan_daily for the given clans, summed per day."""
    q = f"""SELECT date, SUM(members) AS members, SUM(th_sum) AS th_sum, SUM(hero_levels) AS hero_levels,
                   SUM(hero_max) AS hero_max, SUM(donations) AS donations,
                   SUM(capital_contributions) AS capital_contributions, MAX(war_league) AS war_league
            FROM clan_daily WHERE clan_tag IN ({','.join('?' * len(tags))}) GROUP BY date ORDER BY date"""
    return [dict(r) for r in conn.execute(q, tags)]


def wars(conn, tags: list[str]) -> list[dict]:
    """Every ended war of these clans, oldest first, from our side."""
    out = []
    for w in conn.execute("SELECT * FROM wars WHERE state='warEnded' ORDER BY end_time"):
        for us in tags:
            if us not in (w["clan_tag"], w["opponent_tag"]):
                continue
            a, b = ("clan", "opponent") if w["clan_tag"] == us else ("opponent", "clan")
            s, os_ = w[f"{a}_stars"] or 0, w[f"{b}_stars"] or 0
            d, od = w[f"{a}_destruction"] or 0, w[f"{b}_destruction"] or 0
            result = "won" if (s, d) > (os_, od) else "lost" if (s, d) < (os_, od) else "draw"
            hits = conn.execute("""SELECT COUNT(*) AS n, SUM(stars = 3) AS three FROM attacks
                                   WHERE war_key=? AND attacker_clan_tag=?""", (w["war_key"], us)).fetchone()
            out.append({"date": day(w["end_time"]), "clan": TAG_TO_CLAN.get(us), "kind": w["kind"],
                        "opponent": w[f"{b}_name"], "result": result, "stars": s, "opponent_stars": os_,
                        "destruction": d, "opponent_destruction": od,
                        "three_star_rate": round(hits["three"] / hits["n"], 3) if hits["n"] else None})
    return out


def raids(conn, tags: list[str]) -> list[dict]:
    """Capital loot per raid weekend, summed over the clans' raiders."""
    q = f"""SELECT substr(start_time, 1, 8) AS d, SUM(looted) AS v FROM raid_members
            WHERE clan_tag IN ({','.join('?' * len(tags))}) GROUP BY d ORDER BY d"""
    return [{"date": day(r["d"]), "value": r["v"]} for r in conn.execute(q, tags)]


def leagues(rows: list[dict]) -> list[dict]:
    """The CWL league each month, as the clan endpoint last showed it that month."""
    by_month: dict[str, str] = {}
    for r in rows:
        if r["war_league"]:
            by_month[r["date"][:7]] = r["war_league"]
    return [{"season": k, "league": v} for k, v in sorted(by_month.items())]


def score_history_path() -> Path:
    # The unit runs in the repo checkout; FROSTED_SCORE_HISTORY overrides for tests.
    return Path(os.environ.get("FROSTED_SCORE_HISTORY", "data/score_history.csv"))


def cycle_scores(clan: str | None) -> list[dict]:
    """Per cycle: the average final score of the clan's members (all three clans for the family), and for the
    current cycle the average over its CORE lineup in the live roster."""
    path = score_history_path()
    if not path.exists():
        return []
    with path.open(encoding="utf-8", newline="") as f:
        hist = [r for r in csv.DictReader(f) if r.get("final_score") and (clan is None or r["clan"] == clan)]
    rows, _ = plan.effective_roster()
    core = {r["tag"] for r in rows if r.get("cwl_slot") == "CORE" and (clan is None or r["clan"] == clan)}
    cycles = sorted({r["cycle"] for r in hist})
    out = []
    for c in cycles:
        scores = [float(r["final_score"]) for r in hist if r["cycle"] == c]
        core_scores = [float(r["final_score"]) for r in hist if r["cycle"] == c and r["tag"] in core]
        out.append({"cycle": c, "avg_score": round(mean(scores), 2), "n": len(scores),
                    "core_avg_score": round(mean(core_scores), 2) if c == cycles[-1] and core_scores else None,
                    "core_n": len(core_scores) if c == cycles[-1] else None})
    return out


def clan_stats(conn, name: str, tags: list[str]) -> dict:
    rows = daily_rows(conn, tags)
    donations = series(rows, lambda r: r["donations"])
    return {
        "members": series(rows, lambda r: r["members"]),
        "avg_th": series(rows, lambda r: round(r["th_sum"] / r["members"], 2) if r["members"] else None),
        "hero_progress": series(rows, lambda r: round(r["hero_levels"] / r["hero_max"], 4) if r["hero_max"] else None),
        "donations": donations,
        "donations_by_season": seasons(donations),
        "capital_by_raid": raids(conn, tags),
        "cwl_league": leagues(rows) if name != "Family" else [],
        "wars": wars(conn, tags),
        "score_by_cycle": cycle_scores(None if name == "Family" else name),
    }


def clans(conn) -> dict:
    names = {**{n: [t] for n, t in CLAN_TAGS.items()}, "Family": list(CLAN_TAGS.values())}
    if conn is None:
        return {"since": None, "as_of": None, "clans": {n: clan_stats_empty(n) for n in names}}
    since = conn.execute("SELECT MIN(date) FROM clan_daily").fetchone()[0]
    as_of = conn.execute("SELECT MAX(updated_at) FROM clan_daily").fetchone()[0]
    return {"since": since, "as_of": as_of, "clans": {n: clan_stats(conn, n, t) for n, t in names.items()}}


def clan_stats_empty(name: str) -> dict:
    return {"members": [], "avg_th": [], "hero_progress": [], "donations": [], "donations_by_season": [],
            "capital_by_raid": [], "cwl_league": [], "wars": [],
            "score_by_cycle": cycle_scores(None if name == "Family" else name)}
