"""Clan trends from the monthly exports, joined to a daily series that carries them forward. Part of GET /stats/clans.

Every clashspot export is a rolling 3-to-4-month window, so a cycle's score is the score over the last few months,
read on its pull day. The daily series is the same reading on every day since the collector started: the export
current on that day plus the wars the collector recorded after its pull date, up to that day, scored with the same
formula (frosted.scoring). On a new export's pull day the series moves to it, so no war counts twice and a day's
value never depends on an export pulled after it.

A clan's score is the average final score of the members in it that day (or in that cycle's members file). A member
with no war data in the window has no score, as in build_cycle.py. A player who moved clans inside a window has a row
in each clan's export; their counts are added up, where build_cycle.py reads only their current clan's row.
"""
from __future__ import annotations

import csv
from functools import lru_cache
from pathlib import Path

import pandas as pd

from frosted.config import CLAN_TAGS
from frosted.scoring import add_scores
from server import baseline


def cycles() -> list[tuple[str, Path, str]]:
    """(cycle, folder, pull date) for every committed cycle, oldest first. The pull date is the clans' latest."""
    out = []
    for m in sorted(baseline.raw_dir().glob("*/manifest.md")):
        pulls, _ = baseline.parse_manifest(m.read_text(encoding="utf-8"))
        if pulls:
            out.append((m.parent.name, m.parent, max(pulls.values())))
    return out


@lru_cache(maxsize=16)
def load(folder: str, mtime: float) -> baseline.Baseline:
    return baseline.load(Path(folder))


def base_of(folder: Path) -> baseline.Baseline:
    return load(str(folder), (folder / "manifest.md").stat().st_mtime)


def export_members(folder: Path, clan_tag: str) -> dict[str, int]:
    """Player tag -> town hall, from a cycle's members file for one clan."""
    path = folder / f"{clan_tag.lstrip('#')}-members.csv"
    if not path.exists():
        return {}
    with path.open(encoding="utf-8-sig", newline="") as f:
        return {r["Tag"].strip(): baseline.as_int(r.get("TH")) for r in csv.DictReader(f) if (r.get("Tag") or "").strip()}


def add(a: dict | None, b: dict | None) -> dict | None:
    if not a or not b:
        return a or b
    # Counts add up; an export row's last_war date is not a count and is dropped.
    return {k: a.get(k, 0) + b.get(k, 0) for k in set(a) | set(b) if not isinstance(a.get(k, b.get(k)), str)}


def inputs(c: dict, th: int) -> dict:
    """Counts to the scoring inputs, as docs/specs/01-scoring-core.md defines them."""
    att, missed, dfn = c.get("attacks", 0), c.get("missed", 0), c.get("defenses", 0)
    conceded = 3 * c.get("d_three", 0) + 2 * c.get("d_two", 0) + c.get("d_one", 0)
    return {
        "attack_count": att,
        "three_star_pct": 100 * c.get("three", 0) / att if att else 0.0,
        "miss_pct": 100 * missed / (att + missed) if att + missed else 0.0,
        "th_attack_diff": c["tth"] / c["tn"] - th if c.get("tn") else 0.0,
        "avg_stars_conceded": conceded / dfn if dfn else 0.0,
        "defense_count": dfn,
        "current_th": th,
    }


def clan_point(counts: dict[str, dict], members: dict[str, int]) -> dict | None:
    """The clan's average score, 3-star rate and miss rate over its members' windows."""
    rows = [{"tag": t, **inputs(counts[t], th)} for t, th in members.items() if counts.get(t)]
    if not rows:
        return None
    scored = add_scores(pd.DataFrame(rows))
    att = sum(counts[r["tag"]].get("attacks", 0) for r in rows)
    three = sum(counts[r["tag"]].get("three", 0) for r in rows)
    missed = sum(counts[r["tag"]].get("missed", 0) for r in rows)
    return {"score": round(float(scored["final_score"].mean()), 2), "n": len(rows),
            "three_star_rate": round(three / att, 3) if att else None,
            "miss_rate": round(missed / (att + missed), 3) if att + missed else None}


def monthly(clan_tags: list[str]) -> list[dict]:
    """One point per cycle, dated at its pull date: each clan's members in that cycle's files, scored on its export."""
    out = []
    for cycle, folder, pulled in cycles():
        members: dict[str, int] = {}
        for t in clan_tags:
            members.update(export_members(folder, t))
        p = clan_point(base_of(folder).players, members)
        if p:
            out.append({"date": pulled, "cycle": cycle, "members": len(members),
                        "avg_th": round(sum(members.values()) / len(members), 2), **p})
    return out


def recorded_upto(conn, day: str, cutoffs: dict[str, str]) -> dict[str, dict]:
    """Counts per player over recorded wars that started after the export's pull date (per clan) and by `day`,
    with the sum and count of target town halls for th_attack_diff."""
    from server.profiles import recorded_counts
    d = day.replace("-", "")
    rec = recorded_counts(conn, "substr(w.start_time, 1, 8) <= ?", (d,), cutoffs=cutoffs)
    cases = " ".join("WHEN ? THEN ?" for _ in cutoffs)
    flat = tuple(x for tag, v in cutoffs.items() for x in (tag, v.replace("-", "")))
    after = f" AND substr(w.start_time, 1, 8) > CASE a.attacker_clan_tag {cases} ELSE '' END" if cutoffs else ""
    for r in conn.execute(f"""SELECT a.attacker_tag AS t, SUM(dm.town_hall) AS tth, COUNT(dm.town_hall) AS tn
                              FROM attacks a JOIN wars w USING (war_key)
                              JOIN war_members dm ON dm.war_key = a.war_key AND dm.player_tag = a.defender_tag
                              WHERE substr(w.start_time, 1, 8) <= ?{after} GROUP BY a.attacker_tag""", (d, *flat)):
        if r["t"] in rec:
            rec[r["t"]].update(tth=r["tth"] or 0, tn=r["tn"])
    return rec


def members_on(conn, day: str, clan_tags: list[str]) -> dict[str, int]:
    q = f"""SELECT player_tag, town_hall FROM member_snapshots
            WHERE snapshot_date = ? AND clan_tag IN ({",".join("?" * len(clan_tags))})"""
    return {r["player_tag"]: r["town_hall"] or 0 for r in conn.execute(q, (day, *clan_tags))}


_daily: dict[tuple, list[dict]] = {}


def daily(conn, clan_tags: list[str]) -> list[dict]:
    """One point per day the collector has seen members, each scored on the export current that day. Cached until
    the next poll or a new cycle's exports."""
    key = (tuple(clan_tags), conn.execute("SELECT MAX(seen_at) FROM member_snapshots").fetchone()[0],
           tuple(c[2] for c in cycles()), str(baseline.raw_dir()))
    if key not in _daily:
        if len(_daily) > 16:
            _daily.clear()
        _daily[key] = _daily_uncached(conn, clan_tags)
    return _daily[key]


def _daily_uncached(conn, clan_tags: list[str]) -> list[dict]:
    days = [r[0] for r in conn.execute("SELECT DISTINCT snapshot_date FROM member_snapshots ORDER BY 1")]
    known = cycles()
    out = []
    for d in days:
        current = [c for c in known if c[2] <= d]
        if not current:
            continue
        base = base_of(current[-1][1])
        counts = {t: add(base.players.get(t), r) for t, r in recorded_upto(conn, d, base.pull_dates).items()}
        counts = {**base.players, **counts}
        p = clan_point(counts, members_on(conn, d, clan_tags))
        if p:
            out.append({"date": d, "cycle": current[-1][0], **p})
    return out


def trend(conn, clan_tags: list[str]) -> dict:
    return {"monthly": monthly(clan_tags), "daily": daily(conn, clan_tags) if conn is not None else []}
