"""Checks a new clashspot export against our own war records, while exports are still pulled for the rolling scores.

    python -m server.export_diff 2026-12     # read-only; uses FROSTED_DB and data/raw/<cycle>/

An export gives each player one total for its window, with no per-war detail, so it can only be sliced by its window.
Once a clan's window starts on or after our first recorded war of theirs, every count can be compared exactly. Before
that we hold only part of the window, so the one check is that the export shows no more than our tally has altogether.
"""
from __future__ import annotations

import csv
import os
import sys
from pathlib import Path

from frosted.config import TAG_TO_CLAN
from server import baseline, profiles
from server.db import FRIENDLY, connect_readonly

DEFAULT_DB = "/opt/bots/frosted/data/frosted.db"
FIELDS = ("attacks", "three", "two", "one", "missed", "defenses")


def clan_rows(cycle_dir: Path, clan_tag: str) -> dict[str, dict]:
    """One clan's export, by player tag. Unlike a baseline, it keeps the clans apart so they can be checked one by one."""
    path = cycle_dir / f"{clan_tag.lstrip('#')}-war-statistics.csv"
    if not path.exists():
        return {}
    out: dict[str, dict] = {}
    with path.open(encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            tag = (r.get("Tag") or "").strip()
            if tag:
                out[tag] = {"name": (r.get("Name") or "").strip(),
                            **{k: baseline.as_int(r.get(col)) for k, col in baseline.ATTACK_COLS.items()},
                            "defenses": baseline.as_int(r.get(baseline.DEFENSE_COLS["defenses"]))}
    return out


def _first_recorded(conn, clan_tag: str) -> str | None:
    d = conn.execute(f"SELECT MIN(substr(w.start_time, 1, 8)) FROM wars w WHERE ? IN (w.clan_tag, w.opponent_tag) AND NOT {FRIENDLY}", (clan_tag,)).fetchone()[0]
    return profiles.api_day(d) if d else None


def _exact(conn, clan_tag: str, rows: dict[str, dict], start: str, end: str) -> list[dict]:
    """Every count for everyone in the export or on our record for this clan in its window."""
    span = (start.replace("-", ""), end.replace("-", ""))
    ours = profiles.recorded_counts(conn, "? IN (w.clan_tag, w.opponent_tag) AND substr(w.start_time, 1, 8) BETWEEN ? AND ?", (clan_tag, *span))
    fought = {r["t"]: r["name"] for r in conn.execute(
        """SELECT m.player_tag AS t, m.name FROM war_members m JOIN wars w USING (war_key)
           WHERE m.clan_tag = ? AND substr(w.start_time, 1, 8) BETWEEN ? AND ?""", (clan_tag, *span))}
    found = []
    for tag in sorted(rows.keys() | fought.keys()):
        theirs, mine = rows.get(tag, {}), ours.get(tag, {})
        gaps = {k: (theirs.get(k, 0), mine.get(k, 0)) for k in FIELDS if theirs.get(k, 0) != mine.get(k, 0)}
        if gaps:
            found.append({"tag": tag, "name": theirs.get("name") or fought.get(tag), "gaps": gaps})
    return found


def _ceiling(tally: dict[str, dict], recorded: dict[str, dict], rows: dict[str, dict]) -> list[dict]:
    """The export's window sits inside the tally's, so no player can have more in it than the tally holds."""
    found = []
    for tag, theirs in sorted(rows.items()):
        held = {k: tally.get(tag, {}).get(k, 0) + recorded.get(tag, {}).get(k, 0) for k in FIELDS}
        gaps = {k: (theirs[k], held[k]) for k in FIELDS if theirs[k] > held[k]}
        if gaps:
            found.append({"tag": tag, "name": theirs["name"], "gaps": gaps})
    return found


def compare(conn, cycle_dir: Path) -> list[dict]:
    pulls, earliest = baseline.parse_manifest((cycle_dir / "manifest.md").read_text(encoding="utf-8"))
    tally = baseline.current()
    reports = []
    for clan_tag, end in pulls.items():
        start, rows = earliest[clan_tag], clan_rows(cycle_dir, clan_tag)
        first = _first_recorded(conn, clan_tag)
        exact = first is not None and start >= first
        if exact:
            found = _exact(conn, clan_tag, rows, start, end)
        else:
            recorded = profiles.recorded_counts(conn, "substr(w.start_time, 1, 8) <= ?", (end.replace("-", ""),), cutoffs=tally.pull_dates if tally else None)
            found = _ceiling(tally.players if tally else {}, recorded, rows)
        reports.append({"clan": TAG_TO_CLAN[clan_tag], "start": start, "end": end, "recorded_from": first, "exact": exact, "players": len(rows), "found": found})
    return reports


def report(reports: list[dict]) -> str:
    lines = []
    for r in reports:
        kind = "exact" if r["exact"] else f"ceiling only, our records start {r['recorded_from'] or 'nowhere'}"
        lines.append(f"{r['clan']}: {r['start']} to {r['end']}, {r['players']} players, {kind}: {len(r['found'])} differ")
        for f in r["found"]:
            lines.append(f"  {f['tag']} {f['name']}: " + ", ".join(f"{k} export {a} ours {b}" for k, (a, b) in f["gaps"].items()))
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: python -m server.export_diff <cycle>", file=sys.stderr)
        return 2
    cycle_dir = baseline.raw_dir() / argv[1]
    if not (cycle_dir / "manifest.md").exists():
        print(f"no manifest in {cycle_dir}", file=sys.stderr)
        return 2
    conn = connect_readonly(os.environ.get("FROSTED_DB", DEFAULT_DB))
    print(report(compare(conn, cycle_dir)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
