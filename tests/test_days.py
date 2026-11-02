"""The day planner: leaders save a shared draft, only the publisher publishes, and only the publish reaches /roster."""
from server import days
from test_leaders import client, env, roster_rows, signed_in  # noqa: F401 (env is a fixture)

SEASON = "2026-11"


def core(rows, clan):
    return sorted(r["tag"] for r in rows if r["clan"] == clan and r["cwl_slot"] == "CORE" and r["tag"])


def body(clans):
    return {"season": SEASON, "clans": clans}


def every_day(tags):
    return {str(d): tags for d in days.DAYS}


def test_coleader_saves_a_draft_that_members_do_not_see(env):
    fire = core(roster_rows(env), "Fire")
    c, csrf = signed_in("coleader-code")
    assert client().get(f"/plan/days?season={SEASON}").status_code == 401
    r = c.put("/plan/days", json=body({"Fire": every_day(fire)}), headers=csrf)
    assert r.status_code == 200 and r.json()["draft"]["clans"]["Fire"]["1"] == fire and r.json()["published"] is None
    assert c.post("/plan/days/publish", json=body({"Fire": every_day(fire)}), headers=csrf).status_code == 403
    assert all(p["days"] is None for p in client().get("/roster").json()["players"])


def test_publish_needs_fifteen_from_the_clan_every_day(env):
    rows = roster_rows(env)
    fire, cake = core(rows, "Fire"), core(rows, "Cake")
    c, csrf = signed_in()
    short = every_day(fire) | {"3": fire[:14]}
    r = c.post("/plan/days/publish", json=body({"Fire": short}), headers=csrf)
    assert r.status_code == 422 and r.json()["detail"]["problems"] == ["Fire day 3 has 14, needs exactly 15"]
    r = c.post("/plan/days/publish", json=body({"Fire": every_day(fire[:14] + cake[:1])}), headers=csrf)
    assert r.status_code == 422 and "not in Fire" in r.json()["detail"]["problems"][0]
    assert c.put("/plan/days", json=body({"Flakes": every_day(fire)}), headers=csrf).status_code == 422


def test_published_days_reach_the_roster(env, monkeypatch):
    rows = roster_rows(env)
    fire = core(rows, "Fire")
    sub = next(r["tag"] for r in rows if r["clan"] == "Fire" and r["cwl_slot"] == "SUB" and r["tag"])
    plan_days = every_day(fire) | {"2": fire[1:] + [sub]}
    monkeypatch.setattr(days, "current_season", lambda: SEASON)
    c, csrf = signed_in()
    assert c.post("/plan/days/publish", json=body({"Fire": plan_days}), headers=csrf).status_code == 200
    by_tag = {p["tag"]: p for p in client().get("/roster").json()["players"]}
    assert by_tag[fire[1]]["days"] == [1, 2, 3, 4, 5, 6, 7]
    assert by_tag[fire[0]]["days"] == [1, 3, 4, 5, 6, 7] and by_tag[sub]["days"] == [2]
    other_sub = next(r["tag"] for r in rows if r["clan"] == "Fire" and r["cwl_slot"] == "SUB" and r["tag"] != sub)
    assert by_tag[other_sub]["days"] == []  # in a planned clan, no days
    assert by_tag[core(rows, "Cake")[0]]["days"] is None  # Cake has no plan
