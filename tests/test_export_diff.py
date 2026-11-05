"""A later clashspot export against our own records: exact once its window is all ours, a ceiling before that."""
import pytest

from frosted.config import CLAN_TAGS
from server import baseline, db, export_diff

FIRE, CAKE = CLAN_TAGS["Fire"], CLAN_TAGS["Cake"]
MANIFEST = """```
  clan  pull_date earliest_war  attack_ceiling  players
  Fire {pull} {first}            94.0       35
```
"""
HEADER = 'Tag,Name,"Date last war","Attack: count","Attack: Average TH of targets","Attack: 3 Stars Count","Attack: 2 Stars Count","Attack: 1 Star Count","Attack: Miss attacks","Defense: count","Defense: 3 Stars Count","Defense: 2 Stars Count","Defense: 1 Star Count"\n'


def row(tag, name, attacks=0, three=0, two=0, one=0, missed=0, defenses=0):
    return f'{tag},{name},2026-12-01,{attacks},17,{three},{two},{one},{missed},{defenses},0,0,0\n'


def export(root, cycle, first, pull, *rows):
    d = root / cycle
    d.mkdir(parents=True)
    (d / "manifest.md").write_text(MANIFEST.format(pull=pull, first=first), encoding="utf-8")
    (d / f"{FIRE.lstrip('#')}-war-statistics.csv").write_text(HEADER + "".join(rows), encoding="utf-8")
    return d


def war(conn, key, start, used=None):
    conn.execute("INSERT INTO wars VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                 (key, key, "cwl", "2026-11", 1, "warEnded", 15, 1, start, start, start, FIRE, "x", 0, 0, 0, "#ENEMY", "y", 0, 0, 0, "x"))
    for tag, n in (used or {}).items():
        conn.execute("INSERT INTO war_members (war_key, player_tag, clan_tag, name, attacks_used) VALUES (?,?,?,?,?)", (key, tag, FIRE, tag[1:], n))


def hit(conn, key, order, tag, stars):
    conn.execute("INSERT INTO attacks VALUES (?,?,?,?,?,?,?,?)", (key, order, tag, "#E", FIRE, stars, 90.0, 60))


@pytest.fixture
def raw(tmp_path, monkeypatch):
    root = tmp_path / "raw"
    export(root, baseline.TALLY_CYCLE, "2026-07-14", "2026-10-29", row("#A", "Ann", attacks=10, three=8, two=2), row("#B", "Bob", attacks=4, three=4))
    monkeypatch.setenv("FROSTED_RAW", str(root))
    return root


@pytest.fixture
def conn(tmp_path):
    c = db.connect(tmp_path / "game.db")
    war(c, "a", "20261101T100000.000Z", {"#A": 1, "#B": 1})
    hit(c, "a", 1, "#A", 3)
    hit(c, "a", 2, "#B", 2)
    c.commit()
    return c


def test_a_new_export_does_not_move_the_tally(raw):
    export(raw, "2026-12", "2026-08-01", "2026-11-29")
    assert baseline.current().cycle == baseline.TALLY_CYCLE


def test_a_window_we_only_partly_hold_is_a_ceiling_check(raw, conn):
    d = export(raw, "2026-12", "2026-08-01", "2026-11-29", row("#A", "Ann", attacks=9, three=7), row("#B", "Bob", attacks=7, three=5))
    [r] = export_diff.compare(conn, d)
    assert not r["exact"] and r["recorded_from"] == "2026-11-01"
    # Ann fits inside the 11 attacks we hold. Bob has 5 in tally and records, and the export claims 7.
    assert [(f["name"], f["gaps"]) for f in r["found"]] == [("Bob", {"attacks": (7, 5), "three": (5, 4)})]


def test_a_window_all_ours_is_compared_count_by_count(raw, conn):
    d = export(raw, "2027-03", "2026-11-01", "2026-11-29", row("#A", "Ann", attacks=1, three=1), row("#B", "Bob", attacks=1, three=1))
    [r] = export_diff.compare(conn, d)
    assert r["exact"]
    assert [(f["name"], f["gaps"]) for f in r["found"]] == [("Bob", {"three": (1, 0), "two": (0, 1)})]


def test_someone_on_our_record_but_missing_from_the_export_shows(raw, conn):
    d = export(raw, "2027-03", "2026-11-01", "2026-11-29", row("#A", "Ann", attacks=1, three=1))
    [r] = export_diff.compare(conn, d)
    assert [(f["tag"], f["gaps"]) for f in r["found"]] == [("#B", {"attacks": (0, 1), "two": (0, 1)})]


def test_wars_outside_the_window_do_not_count(raw, conn):
    war(conn, "later", "20261205T100000.000Z", {"#A": 1})
    hit(conn, "later", 1, "#A", 3)
    conn.commit()
    d = export(raw, "2027-03", "2026-11-01", "2026-11-29", row("#A", "Ann", attacks=1, three=1), row("#B", "Bob", attacks=1, two=1))
    assert export_diff.compare(conn, d)[0]["found"] == []


def test_the_report_says_which_check_ran(raw, conn):
    d = export(raw, "2026-12", "2026-08-01", "2026-11-29", row("#B", "Bob", attacks=7))
    text = export_diff.report(export_diff.compare(conn, d))
    assert "ceiling only, our records start 2026-11-01: 1 differ" in text and "attacks export 7 ours 5" in text
