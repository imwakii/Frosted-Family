"""Alerts: who gets what, once. Sending is a stand-in; web_push itself is only the library call."""
import json
import sqlite3
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from frosted.config import CLAN_TAGS
from server import appdb, db, notify, push

NOW = datetime(2026, 11, 4, 16, 0, tzinfo=timezone.utc)
FIRE = CLAN_TAGS["Fire"]
ME, OTHER = "#AAA", "#BBB"
PHONE = "https://fcm.googleapis.com/fcm/send/abc"


def stamp(d: datetime) -> str:
    return d.strftime("%Y%m%dT%H%M%S.000Z")


@pytest.fixture
def conns(tmp_path, monkeypatch):
    monkeypatch.setenv("FROSTED_APP_DB", str(tmp_path / "app.db"))
    game = db.connect(tmp_path / "game.db")
    app = push.connect()
    return game, app


def war(game, key="w1", state="inWar", kind="cwl", ends_in=timedelta(hours=1), starts_ago=timedelta(hours=23), round_no=3, fresh=True):
    updated = (NOW if fresh else NOW - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    game.execute(
        "INSERT INTO wars VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (key, key, kind, "2026-11-02", round_no, state, 15, 1, stamp(NOW - starts_ago - timedelta(hours=23)), stamp(NOW - starts_ago),
         stamp(NOW + ends_in), "#ENEMY", "Rivals", 0, 0, 0, FIRE, "Fire", 0, 0, 0, updated))
    game.commit()


def lineup(game, tag=ME, used=0, key="w1"):
    game.execute("INSERT INTO war_members VALUES (?,?,?,?,?,?,?,?)", (key, tag, FIRE, "Waki", 18, 1, used, 0))
    game.commit()


def phone(app, tags=(ME,), attacks=True, days=True, war_on=False):
    app.execute("INSERT INTO push_subscriptions VALUES (?,?,?,?,?,?)",
                (PHONE, "k" * 30, "a" * 10, json.dumps(list(tags)), json.dumps({"attacks": attacks, "days": days, "war": war_on}), "x"))
    app.commit()


def run(game, app, now=NOW):
    got = []
    notify.run(game, app, send=lambda sub, m: got.append(m), now=now)
    return [m for m in got if m["key"] != "hello"]


def test_a_new_phone_is_greeted_once(conns):
    game, app = conns
    phone(app)
    got = []
    notify.run(game, app, send=lambda s, m: got.append(m["key"]), now=NOW)
    notify.run(game, app, send=lambda s, m: got.append(m["key"]), now=NOW)
    assert got == ["hello"]


def test_attack_left_goes_once_inside_the_window(conns):
    game, app = conns
    phone(app)
    war(game)
    lineup(game)
    got = run(game, app)
    assert [m["title"] for m in got] == ["Waki has an attack left"]
    assert got[0]["body"] == "Fire v Rivals ends in 1 hour."
    assert run(game, app) == []


def test_no_attack_alert_when_used_too_early_stale_or_not_in_the_war(conns):
    game, app = conns
    phone(app)
    war(game, key="used")
    lineup(game, used=1, key="used")
    war(game, key="early", ends_in=timedelta(hours=5))
    lineup(game, key="early")
    war(game, key="stale", fresh=False)
    lineup(game, key="stale")
    war(game, key="notin")
    lineup(game, tag=OTHER, key="notin")
    assert run(game, app) == []


def test_turned_off_alert_does_not_go(conns):
    game, app = conns
    phone(app, attacks=False)
    war(game)
    lineup(game)
    assert run(game, app) == []


def test_day_alert_follows_the_published_plan(conns):
    game, app = conns
    phone(app)
    war(game, state="preparation", ends_in=timedelta(hours=30), starts_ago=timedelta(hours=-6), round_no=3)
    assert run(game, app) == []  # nothing published yet
    app.execute("CREATE TABLE day_plans (season TEXT, state TEXT, body TEXT, updated_at TEXT, updated_by TEXT)")
    app.execute("INSERT INTO day_plans VALUES ('2026-11','published',?,'x','x')", (json.dumps({"Fire": {"3": [OTHER]}}),))
    app.commit()
    assert run(game, app) == []  # someone else's day
    app.execute("UPDATE day_plans SET body=?", (json.dumps({"Fire": {"3": [ME]}}),))
    app.commit()
    got = run(game, app)
    assert [m["title"] for m in got] == ["Day 3: you're in"]
    assert "starts in 6 hours" in got[0]["body"]
    assert run(game, app) == []


def test_war_started_is_off_unless_asked_and_only_when_recent(conns):
    game, app = conns
    phone(app, attacks=False, days=False)
    db.upsert_members(game, FIRE, [{"tag": ME, "name": "Waki"}], "2026-11-04T15:00:00Z")
    war(game, ends_in=timedelta(hours=23), starts_ago=timedelta(minutes=10))
    assert run(game, app) == []
    app.execute("UPDATE push_subscriptions SET alerts=?", (json.dumps({"war": True}),))
    app.commit()
    assert [m["title"] for m in run(game, app)] == ["Fire war started"]
    app.execute("DELETE FROM push_sent")
    app.commit()
    late = [m for m in run(game, app, now=NOW + timedelta(hours=1))]
    assert late == []


def test_a_gone_phone_is_removed_and_a_failure_is_retried(conns):
    game, app = conns
    phone(app)

    def fail(s, m):
        raise OSError("down")
    notify.run(game, app, send=fail, now=NOW)
    assert app.execute("SELECT COUNT(*) FROM push_sent").fetchone()[0] == 0

    def gone(s, m):
        raise notify.Gone
    notify.run(game, app, send=gone, now=NOW)
    assert app.execute("SELECT COUNT(*) FROM push_subscriptions").fetchone()[0] == 0


@pytest.fixture
def api(conns):
    a = FastAPI()
    a.include_router(push.router)
    return TestClient(a)


BODY = {"endpoint": PHONE, "keys": {"p256dh": "k" * 30, "auth": "a" * 10}, "tags": [ME], "alerts": {"attacks": True, "war": False}}


def test_subscribe_keeps_one_row_a_phone_and_unsubscribe_clears_it(api, conns):
    _, app = conns
    assert api.post("/push/subscribe", json=BODY).status_code == 200
    assert api.post("/push/subscribe", json={**BODY, "tags": [ME, OTHER]}).status_code == 200
    rows = app.execute("SELECT tags, alerts FROM push_subscriptions").fetchall()
    assert len(rows) == 1 and json.loads(rows[0]["tags"]) == [ME, OTHER]
    assert json.loads(rows[0]["alerts"]) == {"attacks": True, "days": False, "war": False}
    assert api.post("/push/unsubscribe", json={"endpoint": PHONE}).status_code == 200
    assert app.execute("SELECT COUNT(*) FROM push_subscriptions").fetchone()[0] == 0


@pytest.mark.parametrize("bad", ["http://fcm.googleapis.com/x", "https://evil.example/x", "https://169.254.169.254/latest",
                                 "https://fcm.googleapis.com.evil.example/x", "https://notpush.apple.com/x"])
def test_only_real_push_services_are_accepted(api, conns, bad):
    assert api.post("/push/subscribe", json={**BODY, "endpoint": bad}).status_code == 422


def test_the_signing_key_is_made_once_and_private(api, conns):
    first = api.get("/push/key").json()["key"]
    assert api.get("/push/key").json()["key"] == first
    assert len(first) == 87  # 65 bytes, base64url without padding
    assert push.key_path().exists()
