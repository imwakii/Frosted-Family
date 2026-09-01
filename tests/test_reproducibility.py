"""Can the committed roster be rebuilt?

Two separate questions, deliberately kept apart, because conflating them is what
made this look like an unexplained mystery for a month.

If either fails, DO NOT tune the formula to make it pass. Report the players
whose scores differ, with both values, and stop.
"""

import pandas as pd
import pytest

from frosted import ingest, scoring, tiering

CURRENT_CYCLE = "2026-09"
ROUNDING_TOLERANCE = 0.1     # the roster stores its inputs at 2dp
SUM_TOLERANCE = 0.15         # offense and defense are each stored at 1dp, so the
                             # sum of two rounded addends can drift by that much
INGEST_TOLERANCE = 0.1


def test_formula_self_consistency(roster):
    """Do the stored scores follow from the stored inputs?

    This is the real guard against the formula being quietly changed. It uses
    the roster's own input columns, so it is independent of which export
    snapshot the roster was built from.
    """
    off = scoring.offense_score(roster["three_star_pct"], roster["miss_pct"],
                                roster["attack_count"], roster["th_attack_diff"])
    err = (off - roster["offense_score"]).abs()
    worst = roster.loc[err.idxmax()]
    assert err.max() < ROUNDING_TOLERANCE, (
        f"offense_score does not follow from the stored inputs. Worst: "
        f"{worst['name']} stored {worst['offense_score']}, recomputed "
        f"{off[err.idxmax()]:.3f}. Do not adjust the formula -- find out why.")


def test_final_score_is_the_unweighted_sum(roster):
    err = (roster["offense_score"] + roster["defense_score"] - roster["final_score"]).abs()
    assert err.max() < SUM_TOLERANCE


def test_every_tagged_player_has_a_unique_tag(roster):
    """Tag is the primary key. A duplicate would silently merge two players."""
    tagged = roster[roster["tag"].notna() & (roster["tag"] != "")]
    dupes = tagged[tagged.duplicated("tag", keep=False)]
    assert dupes.empty, f"duplicate tags:\n{dupes[['tag', 'name', 'clan']]}"


def test_roster_has_no_retired_slot_labels(roster):
    """`Turtle Kingdom` once made a player's row silently unselectable."""
    assert not roster["cwl_slot"].astype(str).str.contains("Turtle").any()


@pytest.mark.xfail(
    reason="Snapshot drift, not formula drift. The committed roster was built on "
           "30 August from an export pull that was not archived; data/raw/2026-09 "
           "holds the 27 August pull. Waki reads 100 attacks in the roster and 98 "
           "in the archived export. Confirmed by test_formula_self_consistency, "
           "which passes: the formula is right, the inputs differ. From the "
           "2026-10 cycle build_cycle.py archives the export it consumed and "
           "this becomes a strict assert.",
    strict=False)
def test_reproducible_from_raw(roster, repo):
    """Does the archived export rebuild the committed roster?"""
    raw = scoring.add_scores(ingest.read_cycle(CURRENT_CYCLE, root=repo / "data" / "raw"))
    joined = roster.merge(raw[["tag", "offense_score"]].rename(
        columns={"offense_score": "recomputed"}), on="tag", how="inner")
    err = (joined["recomputed"] - joined["offense_score"]).abs()
    worst = joined.loc[err.idxmax()]
    assert err.max() < INGEST_TOLERANCE, (
        f"{(err > INGEST_TOLERANCE).sum()} of {len(joined)} players differ; worst is "
        f"{worst['name']} ({worst['offense_score']} stored vs {worst['recomputed']:.2f}).")


def test_september_proven_pool_matches_the_record(repo):
    """The 28 August session found exactly 44 players meeting the PROVEN bar,
    against the 45 CORE slots that three clans at 15v15 would need. That number
    drove the decision to sit Flakes out of CWL, so it is worth pinning."""
    df = tiering.add_tiers(scoring.add_scores(
        ingest.read_cycle(CURRENT_CYCLE, root=repo / "data" / "raw")))
    assert (df["tier"] == "PROVEN").sum() == 44


def test_window_check_rejects_a_short_export(repo, tmp_path):
    """The July 2026 failure: one clan pulled over a shorter period, every player
    in it deflated through the confidence weight, output plausible not broken."""
    src = repo / "data" / "raw" / CURRENT_CYCLE
    dst = tmp_path / CURRENT_CYCLE
    dst.mkdir()
    for f in src.glob("*.csv"):
        dst.joinpath(f.name).write_bytes(f.read_bytes())

    short = dst / "20CU2R80R-war-statistics.csv"
    w = pd.read_csv(short)
    w["Attack: count"] = (w["Attack: count"] * 0.28).round()
    w.to_csv(short, index=False)

    with pytest.raises(ingest.WindowMismatch, match="Cake"):
        ingest.read_cycle(CURRENT_CYCLE, root=tmp_path)
