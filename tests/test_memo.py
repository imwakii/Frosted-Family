"""Results kept between requests: replaced when what they read changes, and never asked of a missing database."""
from server import db, profiles


def test_a_result_is_kept_until_its_check_changes_and_one_slot_holds_it(tmp_path):
    conn = db.connect(tmp_path / "x.db")
    calls = []
    work = lambda: calls.append(1) or len(calls)
    checks = ("SELECT MAX(rowid) FROM polls",)
    assert db.memo(conn, "t", checks, work) == 1
    assert db.memo(conn, "t", checks, work) == 1
    conn.execute("INSERT INTO polls VALUES ('2026-11-07T00:00:00Z', NULL, 0, 0)")
    assert db.memo(conn, "t", checks, work) == 2
    assert db.memo(conn, "t", checks, work, extra=("next hour",)) == 3
    assert sum(1 for k in db._memo if k[0] == "t") == 1


def test_no_database_yet_gives_the_empty_record():
    assert profiles.war_record(None)["players"] == []
