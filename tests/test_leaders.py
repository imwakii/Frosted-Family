"""Leader sign-in, the Plan endpoints, the published allocation and the Explore boards. Discord and the game API are
mocked with httpx.MockTransport; the rule checks run against a copy of the real roster."""
import csv
import io
import json
import shutil
import time
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from fastapi.testclient import TestClient

from server import api, auth, db, plan, profiles, pull_allocation
from test_server import FIX, Recorder, poll  # tests/ is on sys.path (rootdir import mode)

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
        return httpx.Response(200, json={"id": uid, "username": f"user{uid}", "global_name": f"User {uid}",
                                         "avatar": "abc" if uid == PUBLISHER else None})
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


def sign_in(c, code="good-code", return_to=None):
    login = c.get("/auth/login", params={"return_to": return_to} if return_to else None)
    state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
    return c.get("/auth/callback", params={"code": code, "state": state})


def signed_in(code="good-code"):
    c = client()
    assert sign_in(c, code).headers["location"] == f"{SITE}/#/plan"
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
    r = sign_in(c, return_to="/#/explore")
    assert r.headers["location"] == f"{SITE}/#/explore"
    cookie = r.headers["set-cookie"]
    assert auth.SESSION_COOKIE in cookie and "Domain" not in cookie and "HttpOnly" in cookie
    me = c.get("/auth/me").json()
    assert me["user"] == {"id": PUBLISHER, "name": f"User {PUBLISHER}",
                          "avatar_url": f"https://cdn.discordapp.com/avatars/{PUBLISHER}/abc.png?size=64"}
    assert me["role"] == "publisher" and me["publishers"] == [f"User {PUBLISHER}"] and me["csrf"]
    assert c.get("/auth/me").headers["cache-control"] == "no-store, private"


def test_coleader_is_a_leader_and_publisher_is_unnamed_until_signed_in(env):
    c, _ = signed_in("coleader-code")
    me = c.get("/auth/me").json()
    assert me["role"] == "leader" and me["publishers"] == []


def test_return_to_cannot_leave_the_site(env):
    for bad in ("https://evil.example/", "//evil.example/", "/\\evil.example", "/\r\nSet-Cookie:x"):
        assert sign_in(client(), return_to=bad).headers["location"] == f"{SITE}/#/plan"
    assert auth.with_outcome("/#/plan", "denied") == "/?signin=denied#/plan"


def test_member_without_leader_role_is_denied(env):
    c = client()
    assert sign_in(c, "outsider-code").headers["location"] == f"{SITE}/?signin=denied#/plan"
    assert c.get("/auth/me").json()["user"] is None


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
    assert client().get("/auth/me").json() == {"user": None, "role": None, "publishers": [], "csrf": None,
                                               "configured": False}


def test_nothing_writes_without_a_configured_sign_in(env, monkeypatch):
    # Sign-in is deferred: api.env has no DISCORD_* or SESSION_SECRET. Even a cookie signed with a guessed secret
    # must not open a write.
    for k in ("DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_GUILD_ID", "DISCORD_LEADER_ROLE_IDS",
              "DISCORD_PUBLISHER_ID", "SESSION_SECRET"):
        monkeypatch.delenv(k)
    c = client()
    forged = auth.sign({"uid": PUBLISHER, "name": "x", "csrf": "c", "exp": time.time() + 60}, b"test-secret")
    c.cookies.set(auth.SESSION_COOKIE, forged)
    h = {"X-CSRF-Token": "c"}
    assert c.get("/auth/me").json()["configured"] is False and c.get("/auth/me").json()["user"] is None
    body = {"moves": [{"tag": "#R2PPV8CL", "clan": "Fire", "slot": "SUB"}]}
    assert c.put("/plan/draft", json=body, headers=h).status_code == 401
    assert c.post("/plan/check", json=body, headers=h).status_code == 401
    assert c.post("/plan/publish", json=body, headers=h).status_code == 401
    assert c.get("/auth/login").status_code == 503
    assert client().get("/allocation.csv").status_code == 404  # nothing was published


def test_logout_clears_the_session(env):
    c, _ = signed_in()
    assert c.post("/auth/logout").status_code == 204
    assert c.get("/auth/me").json()["user"] is None


# ─── drafts and CSRF ──────────────────────────────────────────────────────────

def test_drafts_need_sign_in_and_csrf(env):
    assert client().get("/plan/draft").status_code == 401
    c, csrf = signed_in("coleader-code")
    assert c.get("/plan/draft").json() == {"moves": []}
    body = {"moves": [{"tag": "#R2PPV8CL", "clan": "Fire", "slot": "SUB"}]}
    assert c.put("/plan/draft", json=body).status_code == 403
    assert c.put("/plan/draft", json=body, headers={"X-CSRF-Token": "wrong"}).status_code == 403
    saved = c.put("/plan/draft", json=body, headers=csrf).json()
    assert saved["moves"] == body["moves"] and saved["updated_by"] == f"User {COLEADER}" and saved["updated_at"]
    # One shared draft: the publisher loads the co-leader's.
    p, _ = signed_in()
    assert p.get("/plan/draft").json()["moves"] == body["moves"]


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


def by_name(body):
    return {p["name"]: p for p in body["players"]}


def test_explore_every_member_gets_a_row(explored):
    body = explored.get("/explore/heroes").json()
    assert body["kind"] == "heroes" and body["updated_at"]
    rows = by_name(body)
    # Five members in the poll. flake's profile names another clan, but the member poll is fresher and keeps them.
    assert set(rows) == {"Waki renamed", "newbie", "Maki", "cake two", "flake"}
    assert rows["flake"]["clan"] == "Flakes"
    assert rows["newbie"]["heroes"] == [] and rows["newbie"]["rank"] is None  # no profile fixture
    # Home village only: no Battle Machine.
    assert rows["Waki renamed"]["heroes"] == [{"name": "Barbarian King", "level": 100, "cap": None, "max": 105},
                                              {"name": "Archer Queen", "level": 100, "cap": None, "max": 105}]
    assert (rows["Waki renamed"]["rank"], rows["Maki"]["rank"], rows["flake"]["rank"]) == (1, 2, 3)
    assert (rows["Waki renamed"]["clan"], rows["Waki renamed"]["th"]) == ("Fire", 18)


def test_explore_equipment_names_the_hero_only_when_worn(explored):
    eq = by_name(explored.get("/explore/equipment").json())["Waki renamed"]["equipment"]
    assert {e["name"]: e["hero"] for e in eq} == {"Giant Gauntlet": "Barbarian King", "Barbarian Puppet": None}


def test_explore_army_groups_and_drops_super_troops(explored):
    units = by_name(explored.get("/explore/army").json())["Waki renamed"]["units"]
    assert {u["name"]: u["group"] for u in units} == {"Barbarian": "troop", "Wall Wrecker": "siege",
                                                      "Unicorn": "pet", "Rage Spell": "spell"}
    assert all(u["cap"] is None for u in units)


def test_explore_war_record(explored, env):
    body = explored.get("/explore/war").json()
    first_poll = db.connect(env / "frosted.db").execute("SELECT MIN(started_at) FROM polls").fetchone()[0]
    assert body["kind"] == "war" and body["as_of"] and body["since"] == first_poll[:10]
    assert body["cwl_season"] == "2026-11"
    rows = by_name(body)
    waki = {"wars_played": 2, "attacks_used": 2, "attacks_missed": 0, "three_star_rate": 1.0, "avg_stars": 3.0,
            "avg_destruction": 100.0}
    assert rows["Waki renamed"]["war_stars"] == 2100
    assert rows["Waki renamed"]["recorded"] == waki and rows["Waki renamed"]["cwl"] == waki
    # Skipped CWL day 1 (ended); day 2 is still in war, so its unused attack is not yet missed.
    assert rows["newbie"]["recorded"] == {"wars_played": 2, "attacks_used": 0, "attacks_missed": 1,
                                          "three_star_rate": None, "avg_stars": None, "avg_destruction": None}
    # Cake's war was a regular war: in the record, not in the CWL season.
    assert rows["cake two"]["recorded"] == {"wars_played": 1, "attacks_used": 2, "attacks_missed": 0,
                                            "three_star_rate": 0.0, "avg_stars": 1.0, "avg_destruction": 61.5}
    assert rows["cake two"]["cwl"] is None
    assert rows["Maki"]["recorded"]["attacks_missed"] == 1  # 1 of 2 regular-war attacks used
    assert rows["flake"]["recorded"] is None and rows["flake"]["war_stars"] == 300
    # Ranked by all-time war stars; no profile yet means unranked.
    assert [(r["name"], r["rank"]) for r in body["players"]][:3] == [("Waki renamed", 1), ("Maki", 2), ("flake", 3)]
    assert rows["newbie"]["rank"] is None


def test_explore_donations_and_capital(explored):
    don = by_name(explored.get("/explore/donations").json())
    assert don["Maki"]["donations"] == {"donated": 300, "received": 90} and don["Maki"]["rank"] == 1
    assert don["newbie"]["donations"] is None
    cap = by_name(explored.get("/explore/capital").json())
    assert cap["Waki renamed"]["capital"] == {"contributed": 450000, "raid_loot": 21000, "raid_attacks": 6}
    assert cap["Maki"]["capital"] == {"contributed": 450000, "raid_loot": None, "raid_attacks": None}
    assert cap["Waki renamed"]["rank"] == cap["Maki"]["rank"] == 1  # a tie shares the rank
    assert explored.get("/explore/rushed").status_code == 404


def test_profiles_due_every_two_hours():
    conn = db.connect(":memory:")
    assert profiles.profiles_due(conn, "2026-11-02T00:00:00Z")
    conn.execute("INSERT INTO profile_runs VALUES ('2026-11-02T00:00:00Z', 5)")
    assert not profiles.profiles_due(conn, "2026-11-02T01:59:00Z")
    assert profiles.profiles_due(conn, "2026-11-02T02:00:00Z")


# ─── matrix ───────────────────────────────────────────────────────────────────

def test_matrix_heroes_in_game_order_with_zero_for_locked(explored):
    body = explored.get("/explore/matrix", params={"cat": "heroes"}).json()
    assert body["cat"] == "heroes" and body["as_of"]
    assert body["units"] == [{"name": "Barbarian King", "max": 105}, {"name": "Archer Queen", "max": 105}]
    # Fire, then Cake, then Flakes; higher TH first, then name. No profile yet: levels null.
    assert [(p["name"], p["clan"], p["levels"]) for p in body["players"]] == [
        ("Waki renamed", "Fire", [100, 100]), ("newbie", "Fire", None),
        ("cake two", "Cake", None), ("Maki", "Cake", [90, 95]),
        ("flake", "Flakes", [70, 0])]


def test_matrix_categories_split_the_troops_list(explored):
    get = lambda cat: explored.get("/explore/matrix", params={"cat": cat}).json()
    assert [u["name"] for u in get("troops")["units"]] == ["Barbarian"]  # no super troop, pet or siege
    assert [u["name"] for u in get("pets")["units"]] == ["Unicorn"]
    sieges = get("sieges")
    assert sieges["units"] == [{"name": "Wall Wrecker", "max": 5}]
    assert {p["name"]: p["levels"] for p in sieges["players"]}["Maki"] == [4]
    assert {p["name"]: p["levels"] for p in get("pets")["players"]}["Maki"] == [0]
    assert [u["name"] for u in get("equipment")["units"]] == ["Giant Gauntlet", "Barbarian Puppet"]
    assert [u["name"] for u in get("spells")["units"]] == ["Rage Spell"]
    assert explored.get("/explore/matrix", params={"cat": "builder"}).status_code == 404


def test_unit_history_records_only_level_changes(env):
    conn = db.connect(env / "frosted.db")
    p = json.loads((FIX / "player_CGJ8YR8J.json").read_text(encoding="utf-8"))
    with conn:
        profiles.upsert_profile(conn, p, "2026-11-02T00:00:00Z")
        profiles.upsert_profile(conn, p, "2026-11-02T02:00:00Z")
    first = conn.execute("SELECT COUNT(*) FROM player_unit_history").fetchone()[0]
    p["heroes"][0]["level"] = 91
    with conn:
        profiles.upsert_profile(conn, p, "2026-11-02T04:00:00Z")
    rows = conn.execute("SELECT level, seen_at FROM player_unit_history WHERE name='Barbarian King' ORDER BY level")
    assert [tuple(r) for r in rows] == [(90, "2026-11-02T00:00:00Z"), (91, "2026-11-02T04:00:00Z")]
    assert conn.execute("SELECT COUNT(*) FROM player_unit_history").fetchone()[0] == first + 1
