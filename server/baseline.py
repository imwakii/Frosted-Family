"""The war-record baseline: the latest cycle's clashspot war-statistics exports, committed in data/raw/.

The cycle is the newest data/raw/<cycle>/ folder with a manifest.md. Its manifest table gives each clan's pull_date
(the most recent war in the export) and earliest_war. A recorded war only adds to this baseline for a clan if its
battle started after that clan's pull_date, so no war is counted twice. When the next cycle's exports are committed,
the baseline moves to them on its own.

clashspot reports attack and defense counts by stars and missed attacks, but no destruction and no war count.
"""
from __future__ import annotations

import csv
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from frosted.config import CLAN_TAGS

ATTACK_COLS = {"attacks": "Attack: count", "three": "Attack: 3 Stars Count", "two": "Attack: 2 Stars Count",
               "one": "Attack: 1 Star Count", "missed": "Attack: Miss attacks"}
DEFENSE_COLS = {"defenses": "Defense: count", "three": "Defense: 3 Stars Count", "two": "Defense: 2 Stars Count",
                "one": "Defense: 1 Star Count"}
ROW = re.compile(r"^\s*(\w+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})\b")


@dataclass(frozen=True)
class Baseline:
    cycle: str
    pull_dates: dict[str, str]      # clan tag -> YYYY-MM-DD
    earliest: dict[str, str]        # clan tag -> YYYY-MM-DD
    players: dict[str, dict]        # player tag -> summed counts across the clans' exports


def raw_dir() -> Path:
    # The units run in the repo checkout; FROSTED_RAW overrides for tests.
    return Path(os.environ.get("FROSTED_RAW", "data/raw"))


def latest_cycle(raw: Path) -> Path | None:
    cycles = sorted(p for p in raw.glob("*/manifest.md"))
    return cycles[-1].parent if cycles else None


def parse_manifest(text: str) -> tuple[dict[str, str], dict[str, str]]:
    pulls, earliest = {}, {}
    for line in text.splitlines():
        m = ROW.match(line)
        if m and m.group(1) in CLAN_TAGS:
            tag = CLAN_TAGS[m.group(1)]
            pulls[tag], earliest[tag] = m.group(2), m.group(3)
    return pulls, earliest


def as_int(v: str | None) -> int:
    return int(float(v)) if v not in (None, "") else 0


def load(cycle_dir: Path) -> Baseline:
    pulls, earliest = parse_manifest((cycle_dir / "manifest.md").read_text(encoding="utf-8"))
    players: dict[str, dict] = {}
    for clan_tag in pulls:
        path = cycle_dir / f"{clan_tag.lstrip('#')}-war-statistics.csv"
        if not path.exists():
            continue
        with path.open(encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f):
                tag = (r.get("Tag") or "").strip()
                if not tag:
                    continue
                p = players.setdefault(tag, {"attacks": 0, "three": 0, "two": 0, "one": 0, "missed": 0,
                                             "defenses": 0, "d_three": 0, "d_two": 0, "d_one": 0})
                # A player who moved clans inside the window has a row in each export: their wars add up.
                for k, col in ATTACK_COLS.items():
                    p[k] += as_int(r.get(col))
                for k, col in DEFENSE_COLS.items():
                    p["defenses" if k == "defenses" else f"d_{k}"] += as_int(r.get(col))
    return Baseline(cycle=cycle_dir.name, pull_dates=pulls, earliest=earliest, players=players)


@lru_cache(maxsize=4)
def _cached(cycle_dir: str, mtimes: tuple) -> Baseline:
    return load(Path(cycle_dir))


def current() -> Baseline | None:
    """The newest cycle's baseline, re-read only when its files change (the 30-minute pull brings a new cycle)."""
    d = latest_cycle(raw_dir())
    if d is None:
        return None
    files = sorted(d.glob("*"))
    return _cached(str(d), tuple((f.name, f.stat().st_mtime_ns) for f in files))
