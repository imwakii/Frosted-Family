"""Score history: every archived cycle re-scored with today's formula.

One row per player per cycle, keyed on tag. Written by `build_cycle.py` to
data/score_history.csv so the app never reads the raw exports itself.

Each export is a windowed aggregate over roughly the previous three to four
months, and consecutive windows overlap by about two thirds. A point here is
therefore a rolling score sampled once a month, not that month's performance in
isolation. It moves slowly by construction.

Every cycle is re-scored with the current formula rather than read back from old
rosters, so a change to the formula never shows up as a change in a player.
"""

import re
from pathlib import Path

import pandas as pd

from . import ingest, scoring, tiering

CYCLE_DIR = re.compile(r"^\d{4}-\d{2}$")

COLUMNS = ["cycle", "tag", "name", "clan", "current_th", "final_score",
           "family_rank", "attack_count", "miss_pct", "tier", "is_current_member"]


def cycles(root="data/raw"):
    """Cycle folders under root, oldest first."""
    return sorted(p.name for p in Path(root).iterdir()
                  if p.is_dir() and CYCLE_DIR.match(p.name))


def score_cycle(cycle, root="data/raw"):
    """One cycle scored and tiered, with the family rank by final score."""
    df = tiering.add_tiers(scoring.add_scores(ingest.read_cycle(cycle, root=root)))
    df["cycle"] = cycle
    # Rank 1 is the family's highest score. Players with no score get no rank.
    df["family_rank"] = df["final_score"].rank(ascending=False, method="min")
    return df


def build_history(root="data/raw"):
    """Every cycle stacked, with `is_current_member` set from the latest export."""
    frames = [score_cycle(c, root=root) for c in cycles(root)]
    if not frames:
        return pd.DataFrame(columns=COLUMNS)
    hist = pd.concat(frames, ignore_index=True)
    latest = hist["cycle"].max()
    current = set(hist.loc[hist["cycle"] == latest, "tag"])
    hist["is_current_member"] = hist["tag"].isin(current)
    # The latest name is the one people will search for, so it labels every
    # cycle. A rename must never split one player into two lines.
    latest_name = hist.sort_values("cycle").groupby("tag")["name"].last()
    hist["name"] = hist["tag"].map(latest_name)
    hist["final_score"] = hist["final_score"].round(2)
    hist["miss_pct"] = pd.to_numeric(hist["miss_pct"], errors="coerce").round(2)
    return hist[COLUMNS].sort_values(["cycle", "family_rank"]).reset_index(drop=True)


def movers(hist, a, b):
    """Score and rank change from cycle a to cycle b, for players in both."""
    cols = ["tag", "name", "clan", "final_score", "family_rank"]
    x = hist.loc[hist["cycle"] == a, cols]
    y = hist.loc[hist["cycle"] == b, cols + ["is_current_member"]]
    m = y.merge(x.drop(columns="name"), on="tag", suffixes=("", "_was"))
    m["score_change"] = m["final_score"] - m["final_score_was"]
    # Positive means climbed: rank 20 -> rank 5 is +15.
    m["rank_change"] = m["family_rank_was"] - m["family_rank"]
    return m.dropna(subset=["score_change"])
