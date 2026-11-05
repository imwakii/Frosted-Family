"""A month's recap: who wins each award, what the clans did, and what a month without records looks like."""
from datetime import datetime, timezone

import pytest

from frosted.config import CLAN_TAGS
from server import clanlog, db, leaders, recap

FIRE, CAKE = CLAN_TAGS["Fire"], CLAN_TAGS["Cake"]
NOW = datetime(2026, 11, 20, tzinfo=timezone.utc)


def member(tag, name, clan=FIRE):
    return {"tag": tag, "name": name, "snap_name": None, "clan_tag": clan, "town_hall": 17, "snap_th": None}


@pytest.fixture
def conn(tmp_path, monkeypatch):
    monkeypatch.setenv("FROSTED_HISTORY", str(tmp_path / "none.json"))
    monkeypatch.setattr(leaders, "now", lambda: NOW)
    monkeypatch.setattr(leaders, "members_by_tag", lambda c: {m["tag"]: m for m in (member("#A", "Ann"), member("#B", "Bob"), member("#C", "Cy", CAKE))})
    monkeypatch.setattr(clanlog, "member_events", lambda c: [])
    return db.connect(tmp_path / "game.db")


def war(conn, key, start="20261105T100000.000Z", clan=FIRE, opponent="#ENEMY", stars=0, opponent_stars=0):
    conn.execute("INSERT INTO wars VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                 (key, key, "cwl", "2026-11", 1, "warEnded", 15, 1, start, start, start, clan, "x", stars, 0, 0, opponent, "y", opponent_stars, 0, 0, "x"))


def attacks(conn, key, tag, stars, clan=FIRE):
    start = conn.execute("SELECT COALESCE(MAX(attack_order), 0) FROM attacks WHERE war_key=?", (key,)).fetchone()[0]
    for i, s in enumerate(stars):
        conn.execute("INSERT INTO attacks VALUES (?,?,?,?,?,?,?,?)", (key, start + i + 1, tag, "#E", clan, s, 90.0, 60))


def test_three_star_general_needs_enough_attacks_and_ties_go_to_more(conn):
    war(conn, "w")
    attacks(conn, "w", "#A", [3] * 5)
    attacks(conn, "w", "#B", [3] * 7)  # a perfect CWL can win
    attacks(conn, "w", "#C", [3] * 3, CAKE)  # 3 for 3 is not enough
    conn.commit()
    got = recap.recap(conn, "2026-11")["awards"]["three_star"]
    assert [(p["name"], p["attacks"], p["rate"]) for p in got] == [("Bob", 7, 1.0), ("Ann", 5, 1.0)]


def test_the_war_stars_race_is_the_game_score_on_either_side_of_a_war(conn):
    war(conn, "a", stars=30, opponent_stars=99)
    war(conn, "b", "20261106T100000.000Z", clan="#ENEMY", opponent=CAKE, stars=99, opponent_stars=12)  # CWL can list us second
    conn.commit()
    r = recap.recap(conn, "2026-11")["race"]["war_stars"]
    assert (r["Fire"], r["Cake"], r["Flakes"]) == (30, 12, 0)


def test_a_war_between_our_own_clans_counts_once(conn):
    war(conn, "f", clan=FIRE, opponent=CAKE, stars=12, opponent_stars=2)
    war(conn, "c", clan=CAKE, opponent=FIRE, stars=2, opponent_stars=12)
    for key in ("f", "c"):
        attacks(conn, key, "#A", [3, 3, 3, 3])
    conn.commit()
    r = recap.recap(conn, "2026-11")
    assert (r["race"]["war_stars"]["Fire"], r["race"]["war_stars"]["Cake"]) == (12, 2)
    assert r["awards"]["three_star"] == []  # 4 attacks, not 8


def donate(conn, tag, day, n, clan=FIRE):
    conn.execute("INSERT INTO member_snapshots (clan_tag, player_tag, snapshot_date, seen_at, donations) VALUES (?,?,?,?,?)", (clan, tag, day, f"{day}T12:00:00Z", n))


def test_donations_in_the_running_month_are_the_games_count_after_its_reset(conn):
    donate(conn, "#A", "2026-11-01", 950)  # the end of last season
    donate(conn, "#A", "2026-11-02", 30)   # Clash reset it
    donate(conn, "#A", "2026-11-03", 80)
    donate(conn, "#C", "2026-11-19", 5000, CAKE)
    conn.commit()
    r = recap.recap(conn, "2026-11")
    assert [(p["name"], p["n"]) for p in r["awards"]["donor"]] == [("Cy", 5000), ("Ann", 80)]
    assert (r["race"]["donations"]["Fire"], r["race"]["donations"]["Cake"]) == (80, 5000)


def test_donations_in_the_running_month_match_the_players_card(conn, monkeypatch):
    with_counts = {"#A": {**member("#A", "Ann"), "donations": 1826}, "#B": {**member("#B", "Bob"), "donations": 0}}
    monkeypatch.setattr(leaders, "members_by_tag", lambda c: with_counts)
    donate(conn, "#A", "2026-11-03", 1308)  # the daily row lags the hourly profile
    donate(conn, "#GONE", "2026-11-03", 9000)  # has left, so the game's clan total no longer has them
    conn.commit()
    r = recap.recap(conn, "2026-11")
    assert [(p["name"], p["n"]) for p in r["awards"]["donor"]] == [("Ann", 1826)]
    assert r["race"]["donations"]["Fire"] == 1826


def test_a_finished_month_keeps_the_season_that_filled_it(conn, monkeypatch):
    monkeypatch.setattr(leaders, "now", lambda: datetime(2026, 12, 20, tzinfo=timezone.utc))
    donate(conn, "#A", "2026-11-01", 950)  # last season's tail
    donate(conn, "#A", "2026-11-02", 30)
    donate(conn, "#A", "2026-11-29", 2000)
    donate(conn, "#A", "2026-11-30", 5)    # the next season's first hours
    donate(conn, "#GONE", "2026-11-10", 700)
    donate(conn, "#GONE", "2026-11-12", 900)  # has left since, and still counted in the clan's month
    conn.commit()
    r = recap.recap(conn, "2026-11")
    assert [(p["name"], p["n"]) for p in r["awards"]["donor"]] == [("Ann", 2000)]
    assert r["race"]["donations"]["Fire"] == 2900


def test_early_in_a_month_it_opens_on_the_one_just_finished(conn, monkeypatch):
    monkeypatch.setattr(leaders, "now", lambda: datetime(2026, 12, 2, tzinfo=timezone.utc))
    war(conn, "old")
    attacks(conn, "old", "#A", [3])
    conn.commit()
    r = recap.recap(conn)
    assert r["month"] == "2026-11" and not r["live"] and r["months"] == ["2026-12", "2026-11"]
    monkeypatch.setattr(leaders, "now", lambda: datetime(2026, 12, 4, tzinfo=timezone.utc))
    assert recap.recap(conn)["month"] == "2026-12"


def test_upgrades_comings_and_milestones_stay_in_their_month(conn, monkeypatch):
    monkeypatch.setattr(leaders, "upgrade_events", lambda c: [
        ("#B", "Archer", "troop", 1, 2, "2026-11-03T00:00:00Z", "level_up"), ("#B", "Giant", "troop", 1, 2, "2026-11-04T00:00:00Z", "level_up"),
        ("#A", "Golem", "troop", 1, 2, "2026-11-04T00:00:00Z", "level_up"), ("#GONE", "Golem", "troop", 1, 2, "2026-11-04T00:00:00Z", "level_up"),
        ("#A", "Golem", "troop", 2, 3, "2026-10-30T00:00:00Z", "level_up")])
    monkeypatch.setattr(leaders, "upgrade_counts", lambda c: [{"day": "2026-11-04", "clan": "Fire", "category": "troop", "n": 4}, {"day": "2026-10-30", "clan": "Cake", "category": "troop", "n": 9}])
    monkeypatch.setattr(clanlog, "member_events", lambda c: [{"kind": k, "at": at} for k, at in (
        ("joined", "2026-11-02T00:00:00Z"), ("rejoined", "2026-11-03T00:00:00Z"), ("left", "2026-11-04T00:00:00Z"), ("moved", "2026-11-05T00:00:00Z"),
        ("visited", "2026-11-05T00:00:00Z"), ("joined", "2026-10-05T00:00:00Z"))])
    monkeypatch.setattr(clanlog, "milestones", lambda c, days=14: [{"kind": "hero", "at": "2026-11-02T00:00:00Z"}, {"kind": "hero", "at": "2026-10-02T00:00:00Z"}])
    r = recap.recap(conn, "2026-11")
    assert [(p["name"], p["n"]) for p in r["awards"]["builder"]] == [("Bob", 2), ("Ann", 1)]
    assert (r["race"]["upgrades"]["Fire"], r["race"]["upgrades"]["Cake"]) == (4, 0)
    assert r["comings"] == {"joined": 2, "left": 1, "moved": 1}
    assert len(r["milestones"]) == 1


def test_months_list_what_is_on_record_and_this_one(conn, monkeypatch):
    monkeypatch.setattr(leaders, "now", lambda: datetime(2027, 2, 10, tzinfo=timezone.utc))
    war(conn, "old", "20261105T100000.000Z", stars=3)
    attacks(conn, "old", "#A", [3])
    war(conn, "none", "20261201T100000.000Z")  # a war with no attacks
    war(conn, "early", "20261031T100000.000Z")  # before records really began
    attacks(conn, "early", "#A", [3])
    conn.commit()
    r = recap.recap(conn)
    assert r["months"] == ["2027-02", "2026-11"] and r["month"] == "2027-02" and r["live"]
    past = recap.recap(conn, "2026-11")
    assert not past["live"] and past["awards"]["builder"] == [] and past["race"]["war_stars"]["Fire"] == 3


def test_no_database_is_an_empty_month():
    assert recap.recap(None, "2026-11")["awards"]["donor"] == []
