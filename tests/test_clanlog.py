import pytest

from frosted.config import CLAN_TAGS
from server import clanlog, db

FIRE, CAKE = CLAN_TAGS["Fire"], CLAN_TAGS["Cake"]


@pytest.fixture
def conn(tmp_path, monkeypatch):
    monkeypatch.setenv("FROSTED_HISTORY", str(tmp_path / "none.json"))
    return db.connect(tmp_path / "frosted.db")


def poll(conn, at, **clans):
    """One clean collector pass: each clan's members as tag or (tag, role)."""
    conn.execute("INSERT INTO polls VALUES (?,?,0,0)", (at, at))
    for tag, members in ((FIRE, clans.get("fire", [])), (CAKE, clans.get("cake", []))):
        items = [{"tag": m if isinstance(m, str) else m[0], "name": "n", "role": "member" if isinstance(m, str) else m[1]} for m in members]
        db.upsert_members(conn, tag, items, at)


def kinds(conn):
    return [(e["kind"], e["tag"]) for e in clanlog.member_events(conn)]


def test_the_first_days_members_were_already_here(conn):
    poll(conn, "2026-11-01T10:00:00Z", fire=["#A"])
    assert kinds(conn) == []


def test_a_new_player_joins_at_the_poll_that_first_saw_them(conn):
    poll(conn, "2026-11-01T10:00:00Z", fire=["#A"])
    poll(conn, "2026-11-02T09:10:00Z", fire=["#A", "#B"])
    poll(conn, "2026-11-02T09:20:00Z", fire=["#A", "#B"])
    e = clanlog.member_events(conn)
    assert [(x["kind"], x["tag"], x["at"], x["approx"]) for x in e] == [("joined", "#B", "2026-11-02T09:10:00Z", False)]


def test_leaving_needs_clean_polls_without_them(conn):
    poll(conn, "2026-11-01T10:00:00Z", fire=["#A", "#B"])
    poll(conn, "2026-11-01T10:10:00Z", fire=["#A"])
    assert kinds(conn) == []
    poll(conn, "2026-11-01T10:20:00Z", fire=["#A"])
    assert kinds(conn) == [("left", "#B")]
    assert clanlog.member_events(conn)[0]["at"] == "2026-11-01T10:00:00Z"


def test_seen_by_one_poll_is_a_visit(conn):
    poll(conn, "2026-11-01T10:00:00Z", fire=["#A"])
    poll(conn, "2026-11-02T10:00:00Z", fire=["#A", "#B"])
    poll(conn, "2026-11-02T10:10:00Z", fire=["#A"])
    poll(conn, "2026-11-02T10:20:00Z", fire=["#A"])
    assert kinds(conn) == [("visited", "#B")]


def test_a_collector_outage_is_not_everyone_leaving(conn):
    poll(conn, "2026-11-01T10:00:00Z", fire=["#A"])
    poll(conn, "2026-11-03T10:00:00Z", fire=["#A"])
    assert kinds(conn) == []


def test_changing_clan_is_a_move_not_a_leave(conn):
    poll(conn, "2026-11-01T10:00:00Z", fire=["#A"], cake=["#C"])
    poll(conn, "2026-11-02T10:00:00Z", cake=["#A", "#C"])
    poll(conn, "2026-11-02T10:10:00Z", cake=["#A", "#C"])
    poll(conn, "2026-11-02T10:20:00Z", cake=["#A", "#C"])
    e = clanlog.member_events(conn)
    assert [(x["kind"], x["clan"], x.get("from_clan")) for x in e] == [("moved", "Cake", "Fire")]


def test_gone_and_back_to_the_same_clan(conn):
    poll(conn, "2026-11-01T10:00:00Z", fire=["#A", "#B"])
    poll(conn, "2026-11-02T10:00:00Z", fire=["#A"])
    poll(conn, "2026-11-02T10:10:00Z", fire=["#A"])
    poll(conn, "2026-11-03T10:00:00Z", fire=["#A", "#B"])
    assert kinds(conn) == [("rejoined", "#B"), ("left", "#B")]


def test_role_changes_are_known_to_the_day(conn):
    poll(conn, "2026-11-01T10:00:00Z", fire=[("#A", "member"), ("#B", "coLeader")])
    poll(conn, "2026-11-02T10:00:00Z", fire=[("#A", "admin"), ("#B", "member")])
    e = {x["tag"]: x for x in clanlog.member_events(conn)}
    assert (e["#A"]["kind"], e["#A"]["role"], e["#A"]["approx"]) == ("promoted", "admin", True)
    assert (e["#B"]["kind"], e["#B"]["role"]) == ("demoted", "member")


def test_no_database_is_an_empty_log():
    assert clanlog.clan_log(None)["events"] == []
