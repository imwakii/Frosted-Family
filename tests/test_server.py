"""The war collector and read API, against fixture JSON in the official API's response shape. No live calls: every
request goes through httpx.MockTransport, and a request with no fixture fails the test."""
import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from server import api, collect, db

FIX = Path(__file__).resolve().parent / "fixtures" / "coc"
FIRE, CAKE, FLAKES = "#CL0G80LV", "#20CU2R80R", "#2JJYV0JVV"

ROUTES = {
    "/v1/clans/%23CL0G80LV/members": "members_fire.json",
    "/v1/clans/%2320CU2R80R/members": "members_cake.json",
    "/v1/clans/%232JJYV0JVV/members": "members_flakes.json",
    "/v1/clans/%23CL0G80LV/currentwar": "currentwar_notinwar.json",
    "/v1/clans/%2320CU2R80R/currentwar": "currentwar_cake_ended.json",
    "/v1/clans/%232JJYV0JVV/currentwar": 403,           # war log private
    "/v1/clans/%23CL0G80LV/currentwar/leaguegroup": "leaguegroup.json",
    "/v1/clans/%2320CU2R80R/currentwar/leaguegroup": 404,
    "/v1/clans/%232JJYV0JVV/currentwar/leaguegroup": 404,  # Flakes sits out CWL
    "/v1/clanwarleagues/wars/%238QPY2LGR0": "cwl_war_fire_day1.json",
    "/v1/clanwarleagues/wars/%239RJ2C80GQ": "cwl_war_others.json",
    "/v1/clanwarleagues/wars/%232Y0QRLJ8P": "cwl_war_fire_day2.json",
    "/v1/clans/%23CL0G80LV/capitalraidseasons?limit=1": "raids_fire.json",
    "/v1/clans/%2320CU2R80R/capitalraidseasons?limit=1": 404,
    "/v1/clans/%232JJYV0JVV/capitalraidseasons?limit=1": 403,
}


def fixture(name):
    return json.loads((FIX / name).read_text(encoding="utf-8"))


class Recorder:
    def __init__(self, routes=ROUTES):
        self.routes = routes
        self.paths = []

    def __call__(self, request):
        path = request.url.raw_path.decode()
        self.paths.append(path)
        if path.startswith("/v1/players/%23") and path not in self.routes:
            profile = FIX / f"player_{path.rsplit('%23', 1)[1]}.json"
            return httpx.Response(200, json=fixture(profile.name)) if profile.exists() else httpx.Response(404)
        target = self.routes[path]  # KeyError: an unexpected call fails the test
        if isinstance(target, int):
            return httpx.Response(target, json={"reason": "accessDenied" if target == 403 else "notFound"})
        return httpx.Response(200, json=fixture(target))


def poll(conn, recorder):
    with httpx.Client(base_url=collect.API, transport=httpx.MockTransport(recorder)) as client:
        return collect.run(conn, client)


def counts(conn):
    return {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            for t in ("member_snapshots", "wars", "war_members", "attacks", "cwl_war_tags")}


@pytest.fixture(autouse=True)
def app_db(tmp_path, monkeypatch):
    monkeypatch.setenv("FROSTED_APP_DB", str(tmp_path / "app.db"))


@pytest.fixture
def conn(tmp_path):
    c = db.connect(tmp_path / "frosted.db")
    yield c
    c.close()


# ─── idempotent upserts ──────────────────────────────────────────────────────

def test_repolling_adds_nothing(conn):
    first_rec, second_rec = Recorder(), Recorder()
    first = poll(conn, first_rec)
    after_first = counts(conn)
    poll(conn, second_rec)
    assert counts(conn) == after_first
    # Profiles are fetched on the first pass only: the next is due 12 hours later.
    assert sum("/players/" in p for p in first_rec.paths) == 5
    assert not any("/players/" in p for p in second_rec.paths)
    assert first.errors == 0  # the 403 and 404s are quiet
    # 5 members; Cake's regular war and Fire's two CWL wars; the other clans' war is not stored
    assert after_first == {"member_snapshots": 5, "wars": 3, "war_members": 12, "attacks": 9, "cwl_war_tags": 3}


def test_upsert_war_twice_keeps_one_copy_and_updates_score(conn):
    war = fixture("cwl_war_fire_day2.json")
    with conn:
        db.upsert_war(conn, war, kind="cwl", war_tag="#2Y0QRLJ8P", season="2026-11", round_no=2)
    war["clan"]["stars"] = 6
    war["clan"]["members"][1]["attacks"] = [{"attackerTag": "#Q8VJ2L0C", "defenderTag": "#8L0QYJ2V", "stars": 3,
                                             "destructionPercentage": 100, "order": 2, "duration": 120}]
    with conn:
        db.upsert_war(conn, war, kind="cwl", war_tag="#2Y0QRLJ8P", season="2026-11", round_no=2)
    assert counts(conn)["wars"] == 1
    assert conn.execute("SELECT clan_stars FROM wars").fetchone()[0] == 6
    assert conn.execute("SELECT COUNT(*) FROM attacks").fetchone()[0] == 2


def test_ended_and_foreign_cwl_wars_are_not_refetched(conn):
    poll(conn, Recorder())
    second = Recorder()
    poll(conn, second)
    wars = [p for p in second.paths if "/clanwarleagues/wars/" in p]  # profiles are not due on the second pass
    assert wars == ["/v1/clanwarleagues/wars/%232Y0QRLJ8P"]  # only the war still running


def test_bad_token_on_members_is_an_error(conn):
    routes = {**ROUTES, "/v1/clans/%23CL0G80LV/members": 403}
    assert poll(conn, Recorder(routes)).errors == 1


# ─── missed attacks ──────────────────────────────────────────────────────────

def test_missed_attacks_derived_from_ended_wars_only(conn):
    poll(conn, Recorder())
    missed = {(m["player_tag"], m["kind"]): m["missed"] for m in db.missed_attacks(conn, [FIRE, CAKE])}
    # newbie skipped CWL day 1; Maki used 1 of 2 in the regular war. Day 2 is still in war, so newbie's
    # unused attack there is not yet missed, and nobody who used every attack appears.
    assert missed == {("#Q8VJ2L0C", "cwl"): 1, ("#CGJ8YR8J", "regular"): 1}


def test_missed_attacks_default_when_payload_omits_attacks_per_member(conn):
    war = fixture("cwl_war_fire_day1.json")
    del war["attacksPerMember"]
    with conn:
        db.upsert_war(conn, war, kind="cwl", war_tag="#8QPY2LGR0")
    assert [m["missed"] for m in db.missed_attacks(conn, [FIRE])] == [1]


# ─── API ─────────────────────────────────────────────────────────────────────

ROSTER_CSV = """row,tag,name,clan,cwl_slot,transferred_from,tier,final_score,current_th,flags
1,#R2PPV8CL,Waki,Fire,CORE,,PROVEN,122.19,18,
2,#CGJ8YR8J,Maki,Cake,CORE,,PROVEN,108.71,18,
3,#LJ2Q0Y9P,newbie,Fire,SUB,Flakes,NEW,0,17,NO DATA
4,,rudra,Cake,CORE,,NEW,0,18,
"""


@pytest.fixture
def client(conn, tmp_path, monkeypatch):
    poll(conn, Recorder())
    (tmp_path / "roster.csv").write_text(ROSTER_CSV, encoding="utf-8")
    monkeypatch.setenv("FROSTED_DB", str(tmp_path / "frosted.db"))
    monkeypatch.setenv("FROSTED_ROSTER", str(tmp_path / "roster.csv"))
    return TestClient(api.app)


def test_roster_joins_on_tag_never_name(client):
    players = {p["name"]: p for p in client.get("/roster").json()["players"]}
    # Renamed in game: still joined, by tag.
    assert players["Waki"]["snapshot"]["name"] == "Waki renamed"
    assert players["Waki"]["snapshot"]["clan"] == "Fire"
    # Same name as a live member but a different tag: not joined.
    assert players["newbie"]["snapshot"] is None
    # No tag: listed, never joined.
    assert players["rudra"]["tag"] is None and players["rudra"]["snapshot"] is None
    # Allocation comes from the CSV untouched.
    assert (players["newbie"]["clan"], players["newbie"]["cwl_slot"], players["newbie"]["transferred_from"]) == \
        ("Fire", "SUB", "Flakes")


def test_roster_without_database(tmp_path, monkeypatch):
    (tmp_path / "roster.csv").write_text(ROSTER_CSV, encoding="utf-8")
    monkeypatch.setenv("FROSTED_DB", str(tmp_path / "absent.db"))
    monkeypatch.setenv("FROSTED_ROSTER", str(tmp_path / "roster.csv"))
    body = TestClient(api.app).get("/roster").json()
    assert len(body["players"]) == 4 and body["last_poll"] is None


def test_real_roster_loads(repo, roster, tmp_path, monkeypatch):
    monkeypatch.setenv("FROSTED_DB", str(tmp_path / "absent.db"))
    monkeypatch.setenv("FROSTED_ROSTER", str(repo / "frosted_cwl_members.csv"))
    assert len(TestClient(api.app).get("/roster").json()["players"]) == len(roster)


def test_war_live_orients_each_clan(client):
    clans = {c["clan"]: c["war"] for c in client.get("/war/live").json()["clans"]}
    fire = clans["Fire"]
    # Day 2 is in war, so it wins over day 1; Fire is the API's "clan" side in this one.
    assert (fire["kind"], fire["day"], fire["state"], fire["opponent"]["name"]) == ("cwl", 2, "inWar", "Other A")
    assert (fire["stars"], fire["attacks_used"], fire["attacks_allowed"]) == (3, 1, 2)
    assert clans["Cake"]["kind"] == "regular" and clans["Cake"]["opponent"]["tag"] == "#2LQ8PYV0"
    assert clans["Flakes"] is None


def test_player_reports_wars_attacks_and_misses(client):
    body = client.get("/player/q8vj2l0c").json()  # case and missing # are normalised
    assert body["tag"] == "#Q8VJ2L0C" and body["allocation"] is None
    day1 = next(w for w in body["wars"] if w["day"] == 1)
    # Fire was the API's "opponent" side on day 1; the view is flipped to Fire's.
    assert (day1["clan"], day1["opponent"]["name"], day1["stars"], day1["attacks"]) == ("Fire", "Enemy", 3, [])
    assert body["missed_attacks"] == 1
    assert client.get("/player/%23R2PPV8CL").json()["allocation"]["name"] == "Waki"
    assert client.get("/player/%2399999999").status_code == 404


def test_leader_endpoints_refuse_until_auth_exists(client):
    assert client.get("/plan/draft").status_code == 401
    assert client.put("/plan/draft").status_code == 401
    assert client.post("/plan/publish", headers={"Authorization": "Bearer x"}).status_code == 401
