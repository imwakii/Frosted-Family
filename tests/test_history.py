import pandas as pd
import pytest

from frosted import history


@pytest.fixture(scope="module")
def hist(repo):
    return history.build_history(repo / "data" / "raw")


def test_one_row_per_player_per_cycle(hist):
    assert not hist.duplicated(["cycle", "tag"]).any()


def test_a_rename_stays_one_player_under_the_latest_name(hist):
    """#20G28UPQG went from Jules to juna the zealot. One line, not two."""
    rows = hist[hist["tag"] == "#20G28UPQG"]
    assert rows["cycle"].nunique() == len(rows) >= 2
    assert set(rows["name"]) == {"juna the zealot"}


def test_current_members_are_exactly_the_latest_export(hist):
    latest = hist["cycle"].max()
    in_latest = set(hist.loc[hist["cycle"] == latest, "tag"])
    assert set(hist.loc[hist["is_current_member"], "tag"]) == in_latest


def test_former_members_are_kept(hist):
    assert (~hist["is_current_member"]).any()


def test_rank_one_is_the_top_score_each_cycle(hist):
    for _, g in hist.groupby("cycle"):
        top = g.loc[g["family_rank"] == 1, "final_score"]
        assert top.iloc[0] == g["final_score"].max()


def test_movers_sign_convention():
    h = pd.DataFrame({
        "cycle": ["a", "a", "b", "b"],
        "tag": ["#1", "#2", "#1", "#2"],
        "name": ["x", "y", "x", "y"],
        "clan": ["Fire"] * 4,
        "final_score": [50.0, 90.0, 95.0, 40.0],
        "family_rank": [2.0, 1.0, 1.0, 2.0],
        "is_current_member": [True] * 4,
    })
    m = history.movers(h, "a", "b").set_index("tag")
    assert m.at["#1", "score_change"] == 45.0
    assert m.at["#1", "rank_change"] == 1      # climbed from 2 to 1
    assert m.at["#2", "rank_change"] == -1
