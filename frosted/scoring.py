"""The allocation score. Pure functions: DataFrame in, DataFrame out.

No I/O, no printing, no globals. The formula and every threshold are specified
in docs/specs/01-scoring-core.md; read it there rather than inferring from this
file or from the CSV.

If tests/test_reproducibility.py fails, do not tune anything here to make it
pass. Report the players whose scores differ, with both values, and stop.
"""

import numpy as np
import pandas as pd

from . import config as cfg


def _confidence(count, cap):
    """Data-reliability weight, capped at 1. Load-bearing: it stops a five-attack
    hot streak from outranking a proven sixty-attack record."""
    return np.minimum(pd.to_numeric(count, errors="coerce").fillna(0) / cap, 1.0)


def offense_score(three_star_pct, miss_pct, attack_count, th_attack_diff):
    """3-star rate, discounted for misses and thin data, adjusted for the town
    hall level actually attacked. `th_attack_diff` is target TH minus own TH."""
    return (
        pd.to_numeric(three_star_pct, errors="coerce") / 100
        * (1 - pd.to_numeric(miss_pct, errors="coerce") / 100)
        * _confidence(attack_count, cfg.ATTACK_CONFIDENCE_CAP)
        * (1 + cfg.TH_ADJUSTMENT_PER_LEVEL * pd.to_numeric(th_attack_diff, errors="coerce"))
        * 100
    )


def defense_score(avg_stars_conceded, defense_count, current_th):
    """Stars withheld on defence, on the same 0-100 footing as offence, weighted
    by defence volume and by how much punishment the town hall invites."""
    base = (3 - pd.to_numeric(avg_stars_conceded, errors="coerce")) / 3 * 100
    return (
        base
        * _confidence(defense_count, cfg.DEFENSE_CONFIDENCE_CAP)
        * (1 + cfg.TH_ADJUSTMENT_PER_LEVEL
             * (pd.to_numeric(current_th, errors="coerce") - cfg.DEFENSE_TH_BASELINE))
    )


def add_scores(df):
    """Attach offense_score, defense_score and final_score.

    Expects the canonical column names: three_star_pct, miss_pct, attack_count,
    th_attack_diff, avg_stars_conceded, defense_count, current_th.
    """
    out = df.copy()
    out["offense_score"] = offense_score(
        out["three_star_pct"], out["miss_pct"], out["attack_count"], out["th_attack_diff"])
    out["defense_score"] = defense_score(
        out["avg_stars_conceded"], out["defense_count"], out["current_th"])
    out["final_score"] = out["offense_score"] + out["defense_score"]
    return out


def add_flags(df):
    """Attach the three data-quality flags and the joined `flags` string.

    `flag_no_data` means no war-statistics row existed at all, which is distinct
    from a row showing zero attacks. The distinction matters: a player who never
    appeared and a player who appeared and did nothing both score 0.0.
    """
    out = df.copy()
    attacks = pd.to_numeric(out["attack_count"], errors="coerce")
    lo, hi = cfg.LIMITED_DATA_RANGE

    out["flag_high_miss"] = pd.to_numeric(out["miss_pct"], errors="coerce") > cfg.HIGH_MISS_PCT
    out["flag_ltd_data"] = attacks.between(lo, hi)
    if "flag_no_data" not in out.columns:
        out["flag_no_data"] = attacks.isna()
    for c in ("flag_high_miss", "flag_ltd_data", "flag_no_data"):
        out[c] = out[c].fillna(False).astype(bool)

    labels = [("flag_high_miss", "HIGH MISS"), ("flag_ltd_data", "LTD DATA"),
              ("flag_no_data", "NO DATA")]
    out["flags"] = [
        " · ".join(lbl for col, lbl in labels if row[col]) for _, row in out.iterrows()
    ]
    return out
