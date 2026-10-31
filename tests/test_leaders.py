"""Leader sign-in, the Plan endpoints, the published allocation and the Explore boards. Discord and the game API are
mocked with httpx.MockTransport; the rule checks run against a copy of the real roster."""
import csv
import io
import shutil
import time
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from fastapi.testclient import TestClient

from server import api, auth, db, plan, profiles, pull_allocation
from test_server import Recorder, poll  # tests/ is on sys.path (rootdir import mode)

SITE = "https://frosted-family.vercel.app"
LEADER_ROLE, OTHER_ROLE = "111", "999"
PUBLISHER, COLEADER, OUTSIDER = "1001", "1002", "1003"
USERS = {"good-code": PUBLISHER, "coleader-code": COLEADER, "outsider-code": OUTSIDER}
ROLES = {PUBLISHER: [LEADER_ROLE], COLEADER: [OTHER_ROLE, LEADER_ROLE], OUTSIDER: [OTHER_ROLE]}


def discord(request: httpx.Request) -> httpx.Response:
    path = request.url.path
    if path.endswith("/oauth2/token"):
        code = parse_qs(request.content.decode())["code"][0]
        return httpx.Response(200, json={"access_token": f"tok-{code}"}) if code in USERS else httpx.Response(400)
    uid = USERS.get(request.headers["Authorization"].removeprefix("Bearer tok-"))
    if path.endswith("/users/@me"):
        return httpx.Response(200, json={"id": uid, "username": f"user{uid}", "global_name": f"User {uid}"})
    if path.endswith("/guilds/555/member"):
        return httpx.Response(200, json={"nick": None, "roles": ROLES[uid]})
    return httpx.Response(404)


@pytest.fixture
def env(tmp_path, monkeypatch, repo):
    shutil.copy(repo / "frosted_cwl_members.csv", tmp_path / "roster.csv")
    for k, v in {"DISCORD_CLIENT_ID": "cid", "DISCORD_CLIENT_SECRET": "csecret", "DISCORD_GUILD_ID": "555",
                 "DISCORD_LEADER_ROLE_IDS": f"{LEADER_ROLE}, 222", "DISCORD_PUBLISHER_ID": PUBLISHER,
                 "SESSION_SECRET": "test-secret", "FROSTED_SITE_URL": SITE,
                 "FROSTED_DB": str(tmp_path / "frosted.db"), "FROSTED_APP_DB": str(tmp_path / "app.db"),
                 "FROSTED_ROSTER": str(tmp_path / "roster.csv")}.items():
        monkeypatch.setenv(k, v)
    monkeypatch.setattr(auth, "discord_client",
                        lambda: httpx.Client(base_url=auth.DISCORD_API, transport=httpx.MockTransport(discord)))
    return tmp_path


def client():
    return TestClient(api.app, base_url="https://testserver", follow_redirects=False)


def sign_in(c, code="good-code"):
    login = c.get("/auth/login")
    state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
    return c.get("/auth/callback", params={"code": code, "state": state})


def signed_in(code="good-code"):
    c = client()
    assert "signin=ok" in sign_in(c, code).headers["location"]
    csrf = c.get("/auth/me").json()["csrf"]
    return c, {"X-CSRF-Token": csrf}


def roster_rows(env):
    return list(csv.DictReader((env / "roster.csv").open(encoding="utf-8")))


def pick(rows, clan, slot):
    return next(r["tag"] for r in rows if r["clan"] == clan and r["cwl_slot"] == slot and r["tag"]
                and r["tag"] != plan.MAKI)


# ─── sign-in ──────────────────────────────────────────────────────────────────

def test_login_redirects_to_discord_with_scopes_and_callback(env):
    r = client().get("/auth/login")
    q = parse_qs(urlparse(r.headers["location"]).query)
    assert r.status_code == 302 and r.headers["location"].startswith(auth.DISCORD_AUTHORIZE)
    assert q["scope"] == ["identify guilds.members.read"]
    assert q["redirect_uri"] == [f"{SITE}/api/auth/callback"]
    cookie = r.headers["set-cookie"]
    assert auth.STATE_COOKIE in cookie and "HttpOnly" in cookie and "Secure" in cookie and "samesite=lax" in cookie.lower()


def test_leader_signs_in_and_gets_a_session(env):
    c = client()
    r = sign_in(c)
    assert r.headers["location"] == f"{SITE}/?signin=ok#/plan"
    assert auth.SESSION_COOKIE in r.headers["set-cookie"]
    me = c.get("/auth/me").json()
    assert me["signed_in"] and me["id"] == PUBLISHER and me["can_publish"] and me["name"] == f"User {PUBLISHER}"
    assert c.get("/auth/me").headers["cache-control"] == "no-store, private"


def test_member_without_leader_role_is_denied(env):
    c = client()
    assert "signin=denied" in sign_in(c, "outsider-code").headers["location"]
    assert c.get("/auth/me").json()["signed_in"] is False


def test_callback_rejects_a_forged_state(env):
    c = client()
    c.get("/auth/login")
    r = c.get("/auth/callback", params={"code": "good-code", "state": "forged"})
    assert "signin=failed" in r.headers["location"] and auth.SESSION_COOKIE not in r.headers.get("set-cookie", "")


def test_tampered_or_expired_session_is_ignored(env):
    secret = b"test-secret"
    good = auth.sign({"uid": PUBLISHER, "name": "x", "csrf": "c", "exp": time.time() + 60}, secret)
    assert auth.unsign(good, secret)["uid"] == PUBLISHER
    body, mac = good.rsplit(".", 1)
    assert auth.unsign(body + "." + mac[:-2] + "AA", secret) is None
    assert auth.unsign(auth.sign({"uid": PUBLISHER, "exp": time.time() - 1}, secret), secret) is None


def test_sign_in_answers_503_until_configured(env, monkeypatch):
    monkeypatch.delenv("DISCORD_CLIENT_SECRET")
    assert client().get("/auth/login").status_code == 503
    assert client().get("/auth/me").json() == {"signed_in": False, "configured": False}


def test_logout_clears_the_session(env):
    c, _ = signed_in()
    c.post("/auth/logout")
    assert c.get("/auth/me").json()["signed_in"] is False


# ─── drafts and CSRF ──────────────────────────────────────────────────────────

def test_drafts_need_sign_in_and_csrf(env):
    assert client().get("/plan/draft").status_code == 401
    c, csrf = signed_in("coleader-code")
    body = {"moves": [{"tag": "#R2PPV8CL", "clan": "Fire", "slot": "SUB"}], "note": "try this"}
    assert c.put("/plan/draft", json=body).status_code == 403
    assert c.put("/plan/draft", json=body, headers={"X-CSRF-Token": "wrong"}).status_code == 403
    assert c.put("/plan/draft", json=body, headers=csrf).status_code == 200
    assert c.get("/plan/draft").json()["draft"]["note"] == "try this"
    assert [d["by"] for d in c.get("/plan/drafts").json()["drafts"]] == [f"User {COLEADER}"]


# ─── rules and publish ────────────────────────────────────────────────────────

def test_coleader_cannot_publish(env):
    c, csrf = signed_in("coleader-code")
    assert c.post("/plan/publish", json={"moves": []}, headers=csrf).status_code == 403


def test_publish_without_csrf_is_refused(env):
    c, _ = signed_in()
    assert c.post("/plan/publish", json={"moves": []}).status_code == 403


def problems(c, csrf, moves, **extra):
    return c.post("/plan/check", json={"moves": moves, **extra}, headers=csrf).json()["problems"]


def test_rule_checks(env):
    rows = roster_rows(env)
    c, csrf = signed_in()
    fire_core, fire_sub = pick(rows, "Fire", "CORE"), pick(rows, "Fire", "SUB")
    cake_out, flake = pick(rows, "Cake", "Sitting Out"), pick(rows, "Flakes", "Sitting Out")
    assert problems(c, csrf, [{"tag": fire_core, "clan": "Fire", "slot": "SUB"},
                              {"tag": fire_sub, "clan": "Fire", "slot": "CORE"}]) == []
    assert problems(c, csrf, [{"tag": fire_core, "clan": "Fire", "slot": "SUB"}]) == \
        ["Fire has 14 CORE, needs exactly 15"]
    assert problems(c, csrf, [{"tag": flake, "clan": "Cake", "slot": "OUT"}]) == \
        ["Cake has 51 members, above the 50 cap"]
    valve = [{"tag": fire_sub, "clan": "Cake", "slot": "SUB"}, {"tag": cake_out, "clan": "Flakes", "slot": "OUT"}]
    assert [p.split(":")[0] for p in problems(c, csrf, valve)] == ["one-way valve"]
    assert problems(c, csrf, valve, override_valve=True) == []
    assert problems(c, csrf, [{"tag": plan.MAKI, "clan": "Cake", "slot": "SUB"},
                              {"tag": pick(rows, "Cake", "SUB"), "clan": "Cake", "slot": "CORE"}]) == \
        ["Maki is locked to Cake CORE"]
    assert problems(c, csrf, [{"tag": "#NOTREAL", "clan": "Fire", "slot": "SUB"}]) == ["not on the roster: #NOTREAL"]


def test_publish_overrides_roster_until_csv_changes(env):
    rows = roster_rows(env)
    c, csrf = signed_in()
    fire_sub, cake_out = pick(rows, "Fire", "SUB"), pick(rows, "Cake", "Sitting Out")
    moves = [{"tag": fire_sub, "clan": "Cake", "slot": "SUB"}, {"tag": cake_out, "clan": "Flakes", "slot": "OUT"}]
    assert c.post("/plan/publish", json={"moves": moves}, headers=csrf).status_code == 422  # valve
    r = c.post("/plan/publish", json={"moves": moves, "override_valve": True}, headers=csrf)
    assert r.status_code == 200 and r.json()["published_by"] == f"User {PUBLISHER}"

    body = client().get("/roster").json()
    by_tag = {p["tag"]: p for p in body["players"]}
    assert body["allocation"]["source"] == "published"
    assert (by_tag[fire_sub]["clan"], by_tag[fire_sub]["cwl_slot"], by_tag[fire_sub]["transferred_from"]) == \
        ("Cake", "SUB", "Fire")
    assert (by_tag[cake_out]["clan"], by_tag[cake_out]["cwl_slot"]) == ("Flakes", "Sitting Out")

    out = client().get("/allocation.csv")
    assert out.headers["x-published-by"] == "User%201001" and out.headers["cache-control"] == "no-store, private"
    alloc = {r["tag"]: r for r in csv.DictReader(io.StringIO(out.text))}
    assert alloc[fire_sub]["clan"] == "Cake"

    # A new CSV (the pulled allocation committed, or a new cycle) wins over the old publish.
    (env / "roster.csv").write_text((env / "roster.csv").read_text(encoding="utf-8") + "\n", encoding="utf-8")
    body = client().get("/roster").json()
    assert body["allocation"]["source"] == "csv" and body["allocation"]["superseded"]
    assert {p["tag"]: p for p in body["players"]}[fire_sub]["clan"] == "Fire"


def test_allocation_csv_404_until_published(env):
    assert client().get("/allocation.csv").status_code == 404


# ─── pull_allocation ──────────────────────────────────────────────────────────

def test_pull_with_no_changes_rewrites_the_csv_byte_for_byte(repo):
    text = (repo / "frosted_cwl_members.csv").read_text(encoding="utf-8")
    merged, changes, missing = pull_allocation.merge(text, "tag,name,clan,cwl_slot,transferred_from\n")
    assert merged == text and changes == [] and missing == []


def test_pull_changes_allocation_columns_only(env, capsys):
    rows = roster_rows(env)
    c, csrf = signed_in()
    a, b = pick(rows, "Fire", "CORE"), pick(rows, "Fire", "SUB")
    c.post("/plan/publish", headers=csrf, json={"moves": [{"tag": a, "clan": "Fire", "slot": "SUB"},
                                                          {"tag": b, "clan": "Fire", "slot": "CORE"}]})
    (env / "alloc.csv").write_text(client().get("/allocation.csv").text, encoding="utf-8")
    pull_allocation.main(["--csv", str(env / "roster.csv"), "--from-file", str(env / "alloc.csv")])
    assert "2 players change" in capsys.readouterr().out
    after = roster_rows(env)
    changed = [(x["tag"], k) for x, y in zip(rows, after) for k in x if x[k] != y[k]]
    assert sorted(changed) == sorted([(a, "cwl_slot"), (b, "cwl_slot")])


# ─── Explore ──────────────────────────────────────────────────────────────────

@pytest.fixture
def explored(env):
    conn = db.connect(env / "frosted.db")
    poll(conn, Recorder())
    conn.close()
    return client()


def test_explore_heroes_counts_home_village_only_and_skips_leavers(explored):
    players = explored.get("/explore/heroes").json()["players"]
    assert [(p["name"], p["levels"], p["rank"]) for p in players] == [("Waki renamed", 200, 1), ("Maki", 185, 2)]
    assert "Battle Machine" not in {u["name"] for u in players[0]["units"]}


def test_explore_army_sorts_pets_and_siege_and_drops_super_troops(explored):
    waki = explored.get("/explore/army").json()["players"][0]
    kinds = {u["name"]: u["kind"] for u in waki["units"]}
    assert kinds == {"Barbarian": "troop", "Wall Wrecker": "siege", "Unicorn": "pet", "Rage Spell": "spell"}
    assert waki["progress_pct"] == 100.0


def test_explore_ties_share_a_rank(explored):
    capital = explored.get("/explore/capital").json()["players"]
    assert [p["rank"] for p in capital] == [1, 1]
    assert explored.get("/explore/donations").json()["players"][0]["name"] == "Maki"
    assert explored.get("/explore/war").json()["players"][0]["war_stars"] == 2100
    assert explored.get("/explore/rushed").status_code == 404


def test_profiles_due_twice_a_day():
    conn = db.connect(":memory:")
    assert profiles.profiles_due(conn, "2026-11-02T00:00:00Z")
    conn.execute("INSERT INTO profile_runs VALUES ('2026-11-02T00:00:00Z', 5)")
    assert not profiles.profiles_due(conn, "2026-11-02T11:59:00Z")
    assert profiles.profiles_due(conn, "2026-11-02T12:00:00Z")
