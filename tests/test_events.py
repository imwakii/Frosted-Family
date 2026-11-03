"""The clan calendar: reading Supercell's post, and laying a month's wars, patterns and plans side by side."""
import json
from datetime import date, datetime, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from frosted.config import CLAN_TAGS
from server import api, collect, db, events

FIRE, CAKE, FLAKES = CLAN_TAGS["Fire"], CLAN_TAGS["Cake"], CLAN_TAGS["Flakes"]


def para(lead, rest=" Some prose."):
    return {"nodeType": "paragraph", "content": [{"nodeType": "text", "value": lead, "marks": [{"type": "bold"}]}, {"nodeType": "text", "value": rest, "marks": []}]}


def post(*leads, published="2026-11-01T08:00:12.820Z", title="Clash of Titans"):
    body = [{"nodeType": "paragraph", "content": [{"nodeType": "text", "value": "November 3: not bold, so not an event."}]}, {"nodeType": "hr"}]
    return {"title": title, "publishDate": published,
            "bodyCollection": [{"__typename": "TextBlock", "text": {"json": {"nodeType": "document", "content": body + [para(l) for l in leads]}}},
                               {"__typename": "ImageBlock"}, {"__typename": "TextBlock", "text": None}]}


NOVEMBER = post("November 1-30: November Gold Pass.", "November 1-10: November Clan War League.", "November 9: M.O.M.M.A Mass Troop Event. ",
                "November 5-30: Titan King (Barbarian King).", "November 15-30: November 2025 Cosmetics Return: The Wastelands.",
                "November 22-28: November Clan Games.", "November 24-December 1: Fully Forged Challenge.", "Not a date: nothing.")


def page(props):
    return f'<html><script id="__NEXT_DATA__" type="application/json">{json.dumps({"props": {"pageProps": props}})}</script></html>'


def as_tuple(e):
    return e["name"], e["start"].isoformat(), e["end"].isoformat()


def test_a_post_gives_each_dated_line_including_one_day_and_across_months():
    got = [as_tuple(e) for e in events.parse_post(NOVEMBER)]
    assert ("November Gold Pass", "2026-11-01", "2026-11-30") in got
    assert ("M.O.M.M.A Mass Troop Event", "2026-11-09", "2026-11-09") in got
    assert ("Fully Forged Challenge", "2026-11-24", "2026-12-01") in got
    assert len(got) == 7


def test_an_ordinary_article_is_not_a_calendar():
    assert events.parse_post(post("October 8: Balance changes.", "Bold words here")) == []


def test_a_december_post_can_date_an_event_in_january():
    p = post("December 1-31: Gold Pass.", "December 28-January 3: Long One.", "January 2: Next Year.", published="2026-12-01T08:00:00Z")
    got = [as_tuple(e) for e in events.parse_post(p)]
    assert ("Long One", "2026-12-28", "2027-01-03") in got and ("Next Year", "2027-01-02", "2027-01-02") in got


def test_an_impossible_date_is_dropped():
    assert events.parse_line("November 31: Nope.", 2026, 11) is None and events.parse_line("Smarch 3: Nope.", 2026, 11) is None


@pytest.mark.parametrize("name,kind", [("November Clan Games", "clan_games"), ("Gold Pass", "season"), ("Clan War League", "cwl_window"),
                                       ("Titan King (Barbarian King)", "cosmetic"), ("Savage King", "cosmetic"), ("Titan Foundry Scenery", "cosmetic"),
                                       ("Treasure Hunt", "game"), ("M.O.M.M.A Mass Troop Event", "game")])
def test_kinds(name, kind):
    assert events.kind_of(name) == kind


def news_client(calls):
    articles = [{"linkUrl": "/en/games/clashofclans/blog/news/titans", "publishDate": "2026-11-01T08:00:12Z"},
                {"linkUrl": "/en/games/clashofclans/blog/news/old", "publishDate": "2026-10-17T08:00:12Z"}]

    def handler(request):
        calls.append(request.url.path)
        return httpx.Response(200, text=page({"articles": articles} if request.url.path.endswith("/blog/") else NOVEMBER))
    return httpx.Client(base_url=events.SITE, transport=httpx.MockTransport(handler))


def test_news_reads_a_post_once_unless_it_is_new_enough_to_be_corrected(tmp_path):
    conn = db.connect(tmp_path / "x.db")
    calls = []
    assert events.collect_news(conn, news_client(calls), datetime(2026, 11, 2, 8, tzinfo=timezone.utc)) == 2
    assert conn.execute("SELECT COUNT(*) FROM game_events WHERE slug='titans'").fetchone()[0] == 7
    assert events.collect_news(conn, news_client(calls), datetime(2026, 11, 3, 8, tzinfo=timezone.utc)) == 1  # titans again, not old
    assert conn.execute("SELECT COUNT(*) FROM game_events WHERE slug='titans'").fetchone()[0] == 7
    calls.clear()
    assert events.collect_news(conn, news_client(calls), datetime(2026, 11, 20, 8, tzinfo=timezone.utc)) == 0
    assert len(calls) == 1


def test_a_changed_page_is_an_error_and_keeps_what_we_have(tmp_path):
    conn = db.connect(tmp_path / "x.db")
    events.collect_news(conn, news_client([]), datetime(2026, 11, 2, 8, tzinfo=timezone.utc))
    broken = httpx.Client(base_url=events.SITE, transport=httpx.MockTransport(lambda r: httpx.Response(200, text="<html>new site</html>")))
    with pytest.raises(ValueError):
        events.collect_news(conn, broken, datetime(2026, 11, 3, 8, tzinfo=timezone.utc))
    assert conn.execute("SELECT COUNT(*) FROM game_events").fetchone()[0] == 14


def test_news_comes_once_in_each_fetch_hour():
    at = lambda h, m: datetime(2026, 11, 4, h, m, tzinfo=timezone.utc)
    assert events.news_due(at(8, 0)) and events.news_due(at(20, 9))
    assert not events.news_due(at(8, 10)) and not events.news_due(at(9, 0))


def war(conn, us, them, prep, start, end, kind="regular", round_no=None, state="warEnded", tag=None, us_first=True):
    a = {"tag": us[0], "name": us[1], "stars": 20, "destructionPercentage": 80.0, "attacks": 10, "members": []}
    b = {"tag": them[0], "name": them[1], "stars": 15, "destructionPercentage": 70.0, "attacks": 9, "members": []}
    w = {"state": state, "teamSize": 15, "preparationStartTime": prep, "startTime": start, "endTime": end, "clan": a if us_first else b, "opponent": b if us_first else a}
    db.upsert_war(conn, w, kind=kind, war_tag=tag, season="2026-11-02" if kind == "cwl" else None, round_no=round_no)


def november(tmp_path):
    conn = db.connect(tmp_path / "x.db")
    fire = (FIRE, "Frosted Fire")
    war(conn, fire, ("#B", "The Berserkers"), "20261031T191624.000Z", "20261101T181624.000Z", "20261102T181624.000Z")
    # The API lists the clan on either side of a CWL war, and the season is its value, not the month.
    war(conn, fire, ("#E", "ENIGMA"), "20261102T184510.000Z", "20261103T184508.000Z", "20261104T184508.000Z", "cwl", 1, "inWar", "#W1", us_first=False)
    war(conn, fire, ("#D", "DESTROYERS"), "20261103T184520.000Z", "20261104T184517.000Z", "20261105T184517.000Z", "cwl", 2, "preparation", "#W2")
    war(conn, (CAKE, "Frosted Cake"), ("#R", "Robopilinguis"), "20261102T191519.000Z", "20261103T191517.000Z", "20261104T191517.000Z", "cwl", 1, "inWar", "#W3")
    war(conn, (FLAKES, "Frosted Flakes"), ("#L", "ELITEN"), "20261103T185200.000Z", "20261104T175200.000Z", "20261105T175200.000Z", state="preparation")
    war(conn, fire, ("#H", "HIndustani"), "20261029T180510.000Z", "20261030T170510.000Z", "20261031T170510.000Z")
    with conn:
        for i, e in enumerate(events.parse_post(NOVEMBER)):
            conn.execute("INSERT INTO game_events VALUES (?,?,?,?,?)", ("titans", i, e["name"], e["start"].isoformat(), e["end"].isoformat()))
        conn.execute("INSERT INTO game_posts VALUES ('titans','Clash of Titans','2026-11-01T08:00:12Z','2026-11-04T08:00:00Z')")
    return conn


def by_id(cal, start):
    return [e for e in cal["events"] if e["id"].startswith(start)]


def test_this_months_cwl_comes_from_the_wars_with_undrawn_days_following(tmp_path):
    cal = events.month_events(november(tmp_path), date(2026, 11, 1), date(2026, 11, 4))
    fire = by_id(cal, "cwl-Fire")[0]
    assert fire["source"] == "war" and fire["start"] == "2026-11-02T18:45:10Z" and fire["end"] == "2026-11-10T18:45:17Z"
    days = fire["days"]
    assert [d["day"] for d in days] == [1, 2, 3, 4, 5, 6, 7]
    assert days[0]["opponent"] == "ENIGMA" and days[0]["stars"] == 20 and days[0]["opponent_stars"] == 15  # oriented to us, whichever side the API listed
    assert days[0]["start"] == "2026-11-03T18:45:08Z" and days[1]["state"] == "preparation"
    assert days[2]["state"] == "notDrawn" and days[2]["start"] == "2026-11-05T18:45:17Z" and days[6]["end"] == "2026-11-10T18:45:17Z"
    assert by_id(cal, "cwl-Cake")[0]["end"] == "2026-11-10T19:15:17Z"
    assert not by_id(cal, "cwl-Flakes")


def test_the_war_before_the_draw_is_a_friendly_and_flakes_and_others_are_wars(tmp_path):
    cal = events.month_events(november(tmp_path), date(2026, 11, 1), date(2026, 11, 4))
    friendly = [e for e in cal["events"] if e["kind"] == "friendly"]
    assert [e["title"] for e in friendly] == ["Fire v The Berserkers"] and friendly[0]["source"] == "war"
    assert any(e["kind"] == "war" and e["clan"] == "Flakes" and e["title"] == "Flakes v ELITEN" for e in cal["events"])
    assert not by_id(cal, "plan-")  # the wars have replaced the plan


def test_a_month_shows_a_war_only_where_it_touches_and_no_friendly_from_the_month_before(tmp_path):
    cal = events.month_events(november(tmp_path), date(2026, 10, 1), date(2026, 11, 4))
    wars = [e for e in cal["events"] if e["source"] == "war"]
    assert {e["title"] for e in wars} == {"Fire v HIndustani", "Fire v The Berserkers"}  # the second was prepared on 31 October
    assert all(e["kind"] == "war" for e in wars)


def test_supercell_events_show_and_our_cwl_replaces_its_window(tmp_path):
    cal = events.month_events(november(tmp_path), date(2026, 11, 1), date(2026, 11, 4))
    names = {e["title"]: e for e in cal["events"] if e["source"] == "supercell"}
    assert "November Clan War League" not in names
    assert names["November Clan Games"]["kind"] == "clan_games" and names["Titan King (Barbarian King)"]["kind"] == "cosmetic"
    assert names["November Clan Games"]["url"].endswith("/blog/news/titans/")
    assert cal["news_checked"] == "2026-11-04T08:00:00Z"


def test_a_month_with_no_post_expects_the_patterns_and_the_familys_plan(tmp_path):
    cal = events.month_events(november(tmp_path), date(2026, 12, 1), date(2026, 11, 4))
    assert by_id(cal, "post-titans-6")[0]["title"] == "Fully Forged Challenge"  # November's last runs into December, and does not announce it
    games = by_id(cal, "pattern-games")[0]
    assert (games["start"], games["end"], games["expected"]) == ("2026-12-22", "2026-12-28", True)
    assert by_id(cal, "pattern-gold")[0]["end"] == "2026-12-31"
    fire = by_id(cal, "plan-friendly-Fire")[0]
    assert (fire["start"], fire["end"], fire["expected"]) == ("2026-12-01", "2026-12-02", True)
    assert (by_id(cal, "plan-cwl-Cake")[0]["start"], by_id(cal, "plan-cwl-Cake")[0]["end"]) == ("2026-12-02", "2026-12-10")
    assert not by_id(cal, "plan-cwl-Flakes") and not by_id(cal, "plan-friendly-Flakes")


def test_a_plan_that_never_happened_goes_once_its_day_has_passed(tmp_path):
    conn = db.connect(tmp_path / "x.db")
    assert not by_id(events.month_events(conn, date(2026, 12, 1), date(2026, 12, 3)), "plan-")
    cal = events.month_events(conn, date(2026, 12, 1), date(2026, 12, 2))
    assert by_id(cal, "plan-cwl-Fire") and not by_id(cal, "plan-friendly-Fire")


def test_the_apis_gold_pass_replaces_the_posts(tmp_path):
    conn = november(tmp_path)
    with conn:
        events.store_gold_pass(conn, {"startTime": "20261101T080000.000Z", "endTime": "20261201T080000.000Z"})
    cal = events.month_events(conn, date(2026, 11, 1), date(2026, 11, 4))
    assert [(e["source"], e["end"]) for e in cal["events"] if e["kind"] == "season"] == [("api", "2026-12-01T08:00:00Z")]


def test_raid_weekends_run_friday_to_monday_at_seven(tmp_path):
    raids = by_id(events.month_events(db.connect(tmp_path / "x.db"), date(2026, 11, 1), date(2026, 11, 4)), "raid-")
    assert raids[0]["start"] == "2026-10-30T07:00:00Z" and raids[0]["end"] == "2026-11-02T07:00:00Z"  # the one the collector saw
    assert raids[-1]["start"] == "2026-11-27T07:00:00Z" and len(raids) == 5


def test_the_endpoint_answers_before_the_first_poll_and_refuses_a_bad_month(monkeypatch, tmp_path):
    monkeypatch.setenv("FROSTED_DB", str(tmp_path / "none.db"))
    c = TestClient(api.app)
    r = c.get("/calendar?month=2026-11")
    assert r.status_code == 200 and r.json()["month"] == "2026-11" and by_id(r.json(), "raid-")
    assert c.get("/calendar").status_code == 200
    assert c.get("/calendar?month=November").status_code == 422


def test_a_database_from_before_the_calendar_still_answers(monkeypatch, tmp_path):
    path = tmp_path / "old.db"
    conn = db.connect(path)
    conn.executescript("DROP TABLE game_events; DROP TABLE game_posts; DROP TABLE gold_pass;")
    conn.close()
    monkeypatch.setenv("FROSTED_DB", str(path))
    assert TestClient(api.app).get("/calendar?month=2026-11").status_code == 200


def test_a_failed_news_read_keeps_the_gold_pass_and_does_not_raise(tmp_path, monkeypatch):
    conn = db.connect(tmp_path / "x.db")
    coc = httpx.Client(base_url=collect.API, transport=httpx.MockTransport(
        lambda r: httpx.Response(200, json={"startTime": "20261101T080000.000Z", "endTime": "20261201T080000.000Z"})))
    site = httpx.Client(base_url=events.SITE, transport=httpx.MockTransport(lambda r: httpx.Response(500)))
    monkeypatch.setattr(collect.httpx, "Client", lambda **k: site)
    collect.collect_calendar(conn, collect.Api(coc))
    assert conn.execute("SELECT end_time FROM gold_pass").fetchone()[0] == "20261201T080000.000Z"
