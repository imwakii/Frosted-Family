"""The formula, term by term. See docs/specs/01-scoring-core.md."""

import numpy as np
import pandas as pd
import pytest

from frosted import config as cfg
from frosted import scoring


def off(three_star, miss, attacks, th_diff):
    return scoring.offense_score(pd.Series([three_star]), pd.Series([miss]),
                                 pd.Series([attacks]), pd.Series([th_diff])).iloc[0]


def dfn(stars_conceded, defenses, th):
    return scoring.defense_score(pd.Series([stars_conceded]), pd.Series([defenses]),
                                 pd.Series([th])).iloc[0]


class TestOffense:
    def test_perfect_record_at_full_confidence_scores_100(self):
        assert off(100, 0, 25, 0) == pytest.approx(100.0)

    def test_confidence_scales_linearly_below_the_cap(self):
        assert off(100, 0, 5, 0) == pytest.approx(20.0)   # 5/25
        assert off(100, 0, 20, 0) == pytest.approx(80.0)

    def test_confidence_caps_at_the_threshold(self):
        """A sixty-attack record must not outrank itself for being longer."""
        at_cap = off(100, 0, cfg.ATTACK_CONFIDENCE_CAP, 0)
        assert off(100, 0, 60, 0) == pytest.approx(at_cap)
        assert off(100, 0, 1000, 0) == pytest.approx(at_cap)

    def test_misses_discount_the_three_star_rate(self):
        assert off(100, 20, 25, 0) == pytest.approx(80.0)

    def test_th_differential_adjusts_five_percent_per_level(self):
        assert off(100, 0, 25, 1) == pytest.approx(105.0)
        assert off(100, 0, 25, -2) == pytest.approx(90.0)

    def test_zero_attacks_scores_zero(self):
        assert off(0, 100, 0, 0) == pytest.approx(0.0)

    def test_missing_attack_count_is_treated_as_no_confidence(self):
        assert off(100, 0, np.nan, 0) == pytest.approx(0.0)


class TestDefense:
    def test_conceding_nothing_at_the_baseline_th_scores_100(self):
        assert dfn(0, cfg.DEFENSE_CONFIDENCE_CAP, cfg.DEFENSE_TH_BASELINE) == pytest.approx(100.0)

    def test_conceding_three_stars_every_time_scores_zero(self):
        assert dfn(3, 20, 15) == pytest.approx(0.0)

    def test_defense_confidence_has_its_own_cap(self):
        at_cap = dfn(0, cfg.DEFENSE_CONFIDENCE_CAP, 15)
        assert dfn(0, 10, 15) == pytest.approx(at_cap / 2)
        assert dfn(0, 200, 15) == pytest.approx(at_cap)

    def test_th_multiplier_is_relative_to_the_baseline(self):
        assert dfn(0, 20, 18) == pytest.approx(115.0)   # 1 + 0.05*3
        assert dfn(0, 20, 14) == pytest.approx(95.0)


class TestFlags:
    def build(self, **kw):
        base = {"attack_count": 30, "miss_pct": 5.0}
        base.update(kw)
        return scoring.add_flags(pd.DataFrame([base]))

    def test_high_miss_is_strictly_greater_than_the_threshold(self):
        assert not self.build(miss_pct=cfg.HIGH_MISS_PCT)["flag_high_miss"].iloc[0]
        assert self.build(miss_pct=cfg.HIGH_MISS_PCT + 0.1)["flag_high_miss"].iloc[0]

    def test_limited_data_covers_one_to_nine_attacks_inclusive(self):
        lo, hi = cfg.LIMITED_DATA_RANGE
        assert self.build(attack_count=lo)["flag_ltd_data"].iloc[0]
        assert self.build(attack_count=hi)["flag_ltd_data"].iloc[0]
        assert not self.build(attack_count=hi + 1)["flag_ltd_data"].iloc[0]

    def test_zero_attacks_is_not_limited_data(self):
        """Ten players sit here. They score 0.0 and sort identically to someone
        who attacked and genuinely scored zero -- an open question, not a bug."""
        assert not self.build(attack_count=0)["flag_ltd_data"].iloc[0]

    def test_no_data_is_distinct_from_zero_attacks(self):
        assert not self.build(attack_count=0)["flag_no_data"].iloc[0]
        assert self.build(attack_count=np.nan)["flag_no_data"].iloc[0]
