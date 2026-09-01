"""Activity tiering and its precedence order."""

import pandas as pd
import pytest

from frosted import config as cfg
from frosted import tiering

PROVEN = dict(idle_days=3, slots=40, miss_pct=5.0, has_row=True)


def tier(**over):
    a = dict(PROVEN, **over)
    return tiering.assign_tier(a["idle_days"], a["slots"], a["miss_pct"], a["has_row"])


class TestGates:
    def test_all_three_conditions_met_is_proven(self):
        assert tier() == "PROVEN"

    def test_idle_beyond_the_limit_is_lapsing(self):
        assert tier(idle_days=cfg.PROVEN_MAX_IDLE_DAYS) == "PROVEN"
        assert tier(idle_days=cfg.PROVEN_MAX_IDLE_DAYS + 1) == "LAPSING"

    def test_long_idle_becomes_dormant(self):
        assert tier(idle_days=cfg.DORMANT_IDLE_DAYS + 1) == "DORMANT"

    def test_high_miss_alone_is_unreliable(self):
        assert tier(miss_pct=cfg.PROVEN_MAX_MISS_PCT) == "PROVEN"
        assert tier(miss_pct=cfg.PROVEN_MAX_MISS_PCT + 0.1) == "UNRELIABLE (HM)"

    def test_too_few_slots_alone_is_thin(self):
        assert tier(slots=cfg.PROVEN_MIN_WAR_SLOTS) == "PROVEN"
        assert tier(slots=cfg.PROVEN_MIN_WAR_SLOTS - 1) == "THIN RECORD"

    def test_absent_war_statistics_row_is_no_data(self):
        assert tier(has_row=False) == "NO DATA"


class TestPrecedence:
    def test_idle_wins_over_miss(self):
        """Once a record is stale, the miss rate computed from it is stale too."""
        assert tier(idle_days=60, miss_pct=90.0) == "DORMANT"

    def test_miss_wins_over_thin(self):
        assert tier(slots=2, miss_pct=90.0) == "UNRELIABLE (HM)"

    def test_september_twistedtiger_reads_inactive(self):
        """34 days idle, 27% miss. Matches the published September poster."""
        assert tiering.poster_label(tier(idle_days=34, slots=22, miss_pct=27.27)) == "INACTIVE"

    def test_september_bigmon_disagrees_with_the_old_diagnostic(self):
        """62 days idle, 60% miss. The September diagnostic labelled him HIGH
        MISS, which no linear ordering produces alongside twistedtiger. This
        pins the behaviour we chose so the disagreement stays visible."""
        assert tiering.poster_label(tier(idle_days=62, slots=10, miss_pct=60.0)) == "INACTIVE"


class TestWarSlots:
    def test_slots_count_attacks_available_not_attacks_made(self):
        """miss_pct is measured against slots: Waki's 4 misses on 98 attacks
        report 3.92%, which is 4/102, not 4/98."""
        assert tiering.war_slots(pd.Series([98]), pd.Series([4])).iloc[0] == 102


class TestReferenceDate:
    def test_reference_date_comes_from_the_data_not_the_clock(self):
        """So that re-running an old cycle reproduces its tiers exactly."""
        got = tiering.reference_date(["2026-08-01", "2026-08-27", None])
        assert got == pd.Timestamp("2026-08-27")
