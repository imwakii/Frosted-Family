"""Leaders' proposals: each leader keeps their own, all can read them, and only the publisher decides."""
from server import days
from test_leaders import client, env, pick, roster_rows, signed_in  # noqa: F401 (env is a fixture)

SEASON = "2026-11"


def core(rows, clan):
    return sorted(r["tag"] for r in rows if r["clan"] == clan and r["cwl_slot"] == "CORE" and r["tag"])


def day_proposal(tags):
    return {"kind": "days", "season": SEASON, "body": {"clans": {"Fire": {str(d): tags for d in days.DAYS}}}}


def listed(c, kind="days"):
    return c.get("/plan/proposals", params={"kind": kind, "season": SEASON}).json()


def test_leaders_keep_their_own_and_read_each_others(env):
    fire = core(roster_rows(env), "Fire")
    co, co_csrf = signed_in("coleader-code")
    boss, boss_csrf = signed_in()
    assert client().get("/plan/proposals", params={"kind": "days"}).status_code == 401
    assert co.put("/plan/proposals", json=day_proposal(fire)).status_code == 403  # no CSRF

    first = co.put("/plan/proposals", json=day_proposal(fire), headers=co_csrf).json()
    again = co.put("/plan/proposals", json=day_proposal(fire[:14]), headers=co_csrf).json()
    assert again["id"] == first["id"]  # replaced, not a second one
    boss.put("/plan/proposals", json=day_proposal(fire), headers=boss_csrf)

    seen = listed(boss)["open"]
    assert len(seen) == 2 and {p["mine"] for p in seen} == {True, False}
    theirs = next(p for p in seen if not p["mine"])
    assert theirs["author"] == "User 1002" and len(theirs["body"]["clans"]["Fire"]["1"]) == 14


def test_only_the_publisher_decides_and_only_the_author_withdraws(env):
    fire = core(roster_rows(env), "Fire")
    co, co_csrf = signed_in("coleader-code")
    boss, boss_csrf = signed_in()
    pid = co.put("/plan/proposals", json=day_proposal(fire), headers=co_csrf).json()["id"]
    assert co.post(f"/plan/proposals/{pid}/accept", headers=co_csrf).status_code == 403
    assert co.post(f"/plan/proposals/{pid}/reject", headers=co_csrf).status_code == 403
    assert boss.delete(f"/plan/proposals/{pid}", headers=boss_csrf).status_code == 403
    assert co.delete(f"/plan/proposals/{pid}", headers=co_csrf).status_code == 200
    assert listed(boss) == {"season": SEASON, "open": [], "decided": []}

    pid = co.put("/plan/proposals", json=day_proposal(fire), headers=co_csrf).json()["id"]
    assert boss.post(f"/plan/proposals/{pid}/reject", headers=boss_csrf).status_code == 200
    assert listed(co)["decided"][0]["status"] == "rejected"
    assert boss.post(f"/plan/proposals/{pid}/accept", headers=boss_csrf).status_code == 409


def test_accepting_publishes_through_the_rule_checks(env, monkeypatch):
    fire = core(roster_rows(env), "Fire")
    monkeypatch.setattr(days, "current_season", lambda: SEASON)
    co, co_csrf = signed_in("coleader-code")
    boss, boss_csrf = signed_in()
    pid = co.put("/plan/proposals", json=day_proposal(fire[:14]), headers=co_csrf).json()["id"]
    r = boss.post(f"/plan/proposals/{pid}/accept", headers=boss_csrf)
    assert r.status_code == 422 and "needs exactly 15" in r.json()["detail"]["problems"][0]
    assert len(listed(boss)["open"]) == 1  # still open

    pid = co.put("/plan/proposals", json=day_proposal(fire), headers=co_csrf).json()["id"]
    assert boss.post(f"/plan/proposals/{pid}/accept", headers=boss_csrf).status_code == 200
    assert listed(co)["decided"][0]["status"] == "accepted" and listed(co)["decided"][0]["decided_by"] == "User 1001"
    by_tag = {p["tag"]: p for p in client().get("/roster").json()["players"]}
    assert by_tag[fire[0]]["days"] == list(days.DAYS)


def test_a_lineup_proposal_needs_the_valve_override_to_accept(env):
    rows = roster_rows(env)
    fire_sub = pick(rows, "Fire", "SUB")
    co, co_csrf = signed_in("coleader-code")
    boss, boss_csrf = signed_in()
    moves = [{"tag": fire_sub, "clan": "Cake", "slot": "SUB"}]
    pid = co.put("/plan/proposals", json={"kind": "lineup", "body": {"moves": moves}}, headers=co_csrf).json()["id"]
    assert listed(boss, "lineup")["open"][0]["body"]["moves"] == moves
    r = boss.post(f"/plan/proposals/{pid}/accept", headers=boss_csrf)
    assert r.status_code == 422 and "Fire to Cake is blocked" in r.json()["detail"]["problems"][0]
    assert boss.post(f"/plan/proposals/{pid}/accept", json={"override_valve": True}, headers=boss_csrf).status_code == 200
    placed = {p["tag"]: p for p in client().get("/roster").json()["players"]}[fire_sub]
    assert (placed["clan"], placed["cwl_slot"]) == ("Cake", "SUB")


def test_a_malformed_proposal_is_refused(env):
    co, co_csrf = signed_in("coleader-code")
    assert co.put("/plan/proposals", json={"kind": "days", "season": "soon", "body": {"clans": {}}}, headers=co_csrf).status_code == 422
    bad = {"kind": "lineup", "body": {"moves": [{"tag": "#X", "clan": "Nowhere", "slot": "SUB"}]}}
    assert co.put("/plan/proposals", json=bad, headers=co_csrf).status_code == 422
