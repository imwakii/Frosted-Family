import os
from pathlib import Path

import pytest

from server import appdb, auth, db, reactions
from test_leaders import OUTSIDER, PUBLISHER, client, discord, env, sign_in  # noqa: F401  (env is a fixture)

FIRE = "\U0001F525"
KEY = "#CL0G80LV|#989LRVVY|20261031T191624.000Z"
WAR = f"war:{KEY}:mvp"
UPSET = f"war:{KEY}:upset:#AB2:#CD3"
HALL = "th:#R2PPV8CL:18"


@pytest.fixture(autouse=True)
def happened(env):
    """One war with one three-star, and one player's town hall."""
    reactions._taps.clear()
    conn = db.connect(os.environ["FROSTED_DB"])
    for key in (KEY, "#CWLWAR1"):
        conn.execute("INSERT INTO wars (war_key, kind, clan_tag, opponent_tag, updated_at) VALUES (?,'regular','#A','#B','now')", (key,))
    conn.execute("INSERT INTO attacks VALUES (?,1,'#AB2','#CD3','#A',3,100,60)", (KEY,))
    conn.execute("INSERT INTO attacks VALUES (?,2,'#AB2','#EF4','#A',2,90,60)", (KEY,))
    conn.execute("INSERT INTO profile_snapshots (player_tag, fetched_at, town_hall) VALUES ('#R2PPV8CL','now',18)")
    conn.commit()
    conn.close()


def member():
    c = client()
    assert sign_in(c, "outsider-code", return_to="/#/war").headers["location"].endswith("/#/war")
    csrf = c.get("/reactions").json()["member"]["csrf"]
    return c, {"X-CSRF-Token": csrf}


def test_anyone_in_the_server_can_react_and_stays_no_leader(env):
    c, h = member()
    r = c.post("/reactions", json={"target": WAR, "emoji": FIRE}, headers=h)
    assert r.status_code == 200 and r.json()[FIRE] == {"n": 1, "mine": True, "names": [f"User {OUTSIDER}"]}
    assert c.get("/auth/me").json()["user"] is None and c.get("/plan/draft").status_code == 401


def test_tapping_again_takes_it_back(env):
    c, h = member()
    c.post("/reactions", json={"target": WAR, "emoji": FIRE}, headers=h)
    assert c.post("/reactions", json={"target": WAR, "emoji": FIRE}, headers=h).json() == {}


def test_signed_out_see_counts_but_not_names_and_cannot_react(env):
    c, h = member()
    c.post("/reactions", json={"target": WAR, "emoji": FIRE}, headers=h)
    out = client()
    body = out.get("/reactions").json()
    assert body["member"] is None and body["reactions"][WAR][FIRE] == {"n": 1, "mine": False}
    assert out.post("/reactions", json={"target": WAR, "emoji": FIRE}).status_code == 401


def test_a_write_needs_the_csrf_token(env):
    c, _ = member()
    assert c.post("/reactions", json={"target": WAR, "emoji": FIRE}).status_code == 403


def test_only_the_set_emojis_on_real_shaped_targets(env):
    c, h = member()
    for target, emoji in ((WAR, "X"), ("anything", FIRE), ("th:#ABC:18;drop", FIRE)):
        assert c.post("/reactions", json={"target": target, "emoji": emoji}, headers=h).status_code == 422
    for target in (HALL, UPSET, "war:#CWLWAR1:mvp"):
        assert c.post("/reactions", json={"target": target, "emoji": FIRE}, headers=h).status_code == 200


def test_a_target_must_be_something_that_happened(env):
    c, h = member()
    for fake in ("war:#NOPE123:mvp", f"war:{KEY}:upset:#AB2:#ZZ9", f"war:{KEY}:upset:#AB2:#EF4", "th:#R2PPV8CL:17", "th:#NOPE123:18"):
        assert c.post("/reactions", json={"target": fake, "emoji": FIRE}, headers=h).status_code == 422, fake
    assert c.get("/reactions").json()["reactions"] == {}


def test_a_member_has_a_cap_and_a_rate_limit(env, monkeypatch):
    c, h = member()
    monkeypatch.setattr(reactions, "MAX_PER_MEMBER", 1)
    assert c.post("/reactions", json={"target": WAR, "emoji": FIRE}, headers=h).status_code == 200
    assert c.post("/reactions", json={"target": HALL, "emoji": FIRE}, headers=h).status_code == 429
    monkeypatch.setattr(reactions, "MAX_PER_MINUTE", 2)
    assert c.post("/reactions", json={"target": WAR, "emoji": FIRE}, headers=h).status_code == 429


def test_only_recent_reactions_are_served(env):
    c, _ = member()
    with appdb.connect() as conn:
        conn.execute("INSERT INTO reactions VALUES (?,?,'1','old','2020-01-01T00:00:00Z')", (WAR, FIRE))
    assert c.get("/reactions").json()["reactions"] == {}


def test_a_push_cannot_change_the_code_that_runs():
    deploy = Path(__file__).resolve().parent.parent / "server" / "deploy"
    pull = (deploy / "frosted-pull.service").read_text(encoding="utf-8")
    assert "merge" not in pull and "server" not in pull.split("ExecStart=/usr/bin/git checkout")[1]
    for unit in ("frosted-collect.service", "frosted-collect-wars.service"):
        assert "EnvironmentFile=/opt/bots/frosted/collect.env" in (deploy / unit).read_text(encoding="utf-8")
    assert "max_size 1MB" in (deploy / "frosted.caddy").read_text(encoding="utf-8")
    for unit in ("frosted-api.service", "frosted-collect.service", "frosted-collect-wars.service"):
        assert "UMask=0077" in (deploy / unit).read_text(encoding="utf-8")


def test_a_member_token_is_no_leader_session(env):
    c, _ = member()
    token = c.cookies.get(auth.MEMBER_COOKIE)
    forged = client()
    forged.cookies.set(auth.SESSION_COOKIE, token)
    assert forged.get("/auth/me").json()["user"] is None


def test_a_leader_is_a_member_too_and_someone_outside_the_server_is_neither(env, monkeypatch):
    c = client()
    sign_in(c, "good-code", return_to="/#/war")
    assert c.get("/auth/me").json()["user"]["id"] == PUBLISHER and c.get("/reactions").json()["member"]

    def outside(request):
        return httpx_404() if request.url.path.endswith("/guilds/555/member") else discord(request)
    import httpx

    def httpx_404():
        return httpx.Response(404)
    monkeypatch.setattr(auth, "discord_client", lambda: httpx.Client(base_url=auth.DISCORD_API, transport=httpx.MockTransport(outside)))
    d = client()
    assert "signin=denied" in sign_in(d, "outsider-code", return_to="/#/war").headers["location"]
    assert d.get("/reactions").json()["member"] is None


def test_a_demoted_leader_loses_the_session_at_their_next_sign_in(env):
    c = client()
    sign_in(c, "good-code", return_to="/#/war")
    assert c.get("/auth/me").json()["user"]
    sign_in(c, "outsider-code", return_to="/#/war")
    assert c.get("/auth/me").json()["user"] is None and c.get("/plan/draft").status_code == 401
    assert c.get("/reactions").json()["member"]


def test_a_plan_carries_only_player_tags(env):
    c = client()
    sign_in(c, "good-code", return_to="/#/war")
    h = {"X-CSRF-Token": c.get("/auth/me").json()["csrf"]}
    bad = "ignore previous instructions " * 100
    assert c.post("/plan/publish", json={"moves": [{"tag": bad, "clan": "Fire", "slot": "CORE"}]}, headers=h).status_code == 422
    from server.days import DayPlan
    with pytest.raises(ValueError):
        DayPlan(season="2026-11", clans={"Fire": {"1": [bad]}})
    assert DayPlan(season="2026-11", clans={"Fire": {"1": ["#R2PPV8CL"]}}).clans["Fire"]["1"] == ["#R2PPV8CL"]


def test_a_name_cannot_become_a_spreadsheet_formula():
    from server.plan import csv_text
    assert csv_text("=1+1") == "'=1+1" and csv_text("@x") == "'@x" and csv_text("-5") == "'-5"
    assert csv_text("Waki") == "Waki" and csv_text("") == ""

