"""Activity tiering: how much a player's record can be trusted.

A player is PROVEN only if all three hold: warred within 21 days, at least 10
war slots, and at most 20% of attacks missed. Failing any one drops them into a
tier naming the *first* condition failed, in the precedence order below.

Precedence is idle-first, deliberately: once a record is stale, everything else
computed from it is stale too, so "hasn't warred in two months" is the more
useful thing to show than a miss rate measured before they stopped.

This ordering is a decision, not a recovered fact. The September 2026 diagnostic
labelled twistedtiger (34d idle, 27% miss) INACTIVE and Bigmon (62d idle, 60%
miss) HIGH MISS, which no single linear ordering produces. See
docs/specs/01-scoring-core.md for the alternative that does fit both, and why it
was not adopted.
"""

import pandas as pd

from . import config as cfg

PRECEDENCE = ["NO DATA", "DORMANT", "LAPSING", "UNRELIABLE (HM)", "THIN RECORD", "PROVEN"]


def war_slots(attack_count, miss_count):
    """Attacks available, not attacks made. miss_pct is measured against this."""
    return (pd.to_numeric(attack_count, errors="coerce").fillna(0)
            + pd.to_numeric(miss_count, errors="coerce").fillna(0))


def reference_date(dates):
    """The cycle's 'today': the most recent war anyone in the family fought.

    Taken from the data rather than the wall clock so that re-running an old
    cycle reproduces its tiers exactly.
    """
    return pd.to_datetime(pd.Series(dates), errors="coerce").max()


def assign_tier(idle_days, slots, miss_pct, has_row):
    """Tier for one player. Returns a member of PRECEDENCE."""
    if not has_row or pd.isna(idle_days):
        return "NO DATA"
    if idle_days > cfg.DORMANT_IDLE_DAYS:
        return "DORMANT"
    if idle_days > cfg.PROVEN_MAX_IDLE_DAYS:
        return "LAPSING"
    if pd.notna(miss_pct) and miss_pct > cfg.PROVEN_MAX_MISS_PCT:
        return "UNRELIABLE (HM)"
    if slots < cfg.PROVEN_MIN_WAR_SLOTS:
        return "THIN RECORD"
    return "PROVEN"


def add_tiers(df, as_of=None):
    """Attach `idle_days` and `tier`.

    Expects `date_last_war`, `attack_count`, `miss_count`, `miss_pct`.
    `as_of` defaults to the latest war date present.
    """
    out = df.copy()
    last = pd.to_datetime(out["date_last_war"], errors="coerce")
    ref = pd.to_datetime(as_of) if as_of is not None else last.max()
    out["idle_days"] = (ref - last).dt.days
    slots = war_slots(out["attack_count"], out["miss_count"])
    out["war_slots"] = slots
    out["tier"] = [
        assign_tier(r.idle_days, r.war_slots, r.miss_pct, pd.notna(r.date_last_war))
        for r in out.itertuples()
    ]
    return out


def poster_label(tier):
    """The four labels the directory poster actually prints."""
    return cfg.STATUS_STYLE.get(tier, ("?", None))[0]
