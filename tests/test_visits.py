from server import visits
from test_leaders import client, env  # noqa: F401  (env is a fixture)

A, B = "0123456789abcdef-0001", "0123456789abcdef-0002"


def test_each_browser_counts_once(env):
    c = client()
    assert c.get("/visits").json() == {"week": 0, "total": 0}
    assert c.post("/visits", json={"id": A, "tz": "Asia/Singapore"}).json() == {"week": 1, "total": 1}
    assert c.post("/visits", json={"id": A, "tz": "Asia/Singapore"}).json() == {"week": 1, "total": 1}
    assert c.post("/visits", json={"id": B, "tz": "Asia/Singapore"}).json() == {"week": 2, "total": 2}
    assert c.get("/visits").headers["cache-control"] == "no-store, private"


def test_only_a_random_id_is_accepted(env):
    c = client()
    for bad in ("Waki", "#R2PPV8CL", "ignore previous instructions", "a" * 41):
        assert c.post("/visits", json={"id": bad}).status_code == 422
    assert c.get("/visits").json()["total"] == 0


def test_a_cap_keeps_a_script_from_growing_the_table(env, monkeypatch):
    monkeypatch.setattr(visits, "MAX_A_DAY", 1)
    c = client()
    c.post("/visits", json={"id": A, "tz": "Asia/Singapore"})
    assert c.post("/visits", json={"id": B, "tz": "Asia/Singapore"}).json()["total"] == 1


def test_a_time_zone_is_read_as_a_region():
    assert visits.region("Asia/Kolkata") == "South Asia"
    assert visits.region("Asia/Singapore") == "South East Asia"
    assert visits.region("Asia/Tehran") == "Middle East"
    assert visits.region("Asia/Tashkent") == "Other Asia"
    assert visits.region("Europe/Paris") == "Europe"
    assert visits.region("America/New_York") == "Americas"
    assert visits.region("Pacific/Auckland") == "Oceania"
    assert visits.region("Atlantic/Reykjavik") == "Elsewhere"
    assert visits.region("UTC") == visits.region("Etc/UTC") == visits.UNCLEAR  # sent before the offset was recorded
    assert visits.region("UTC", False, 0) == visits.BOTS
    assert visits.region("UTC", True, 0) == visits.region("UTC", 1, 480) == visits.HOME_SCREEN
    assert visits.region("UTC", False, 480) == visits.HIDDEN
    assert visits.region("Asia/Singapore", False, 0) == "South East Asia"
    assert visits.region("Europe/London", False, 0) == "Europe"
    assert visits.region(None) == visits.NOT_RECORDED


def test_leaders_see_visitors_a_day_by_region(env):
    from test_leaders import signed_in
    c = client()
    assert c.get("/visits/daily").status_code == 401
    assert c.post("/visits", json={"id": A}).status_code == 200  # an older page sends no time zone
    assert c.post("/visits", json={"id": B, "tz": "Asia/Singapore"}).status_code == 200
    assert c.post("/visits", json={"id": A, "tz": "Asia/Kolkata"}).status_code == 200  # a later report fills it in
    assert c.post("/visits", json={"id": A}).status_code == 200  # and an empty one does not clear it
    assert c.post("/visits", json={"id": B, "tz": "<script>"}).status_code == 422
    leader, _ = signed_in("coleader-code")
    got = leader.get("/visits/daily").json()
    assert len(got["days"]) == visits.DAYS_SHOWN and got["total"] == 2 and got["week"] == 2
    assert got["days"][-1]["total"] == 2 and got["days"][-1]["regions"] == {"South Asia": 1, "South East Asia": 1}
    assert got["days"][0]["total"] == 0
    assert got["regions"] == [{"name": "South Asia", "total": 1}, {"name": "South East Asia", "total": 1}]
    assert got["bots"] == 0 and got["unclear"] == 0


def test_only_visits_that_show_a_person_count(env):
    from test_leaders import signed_in
    c = client()
    assert c.post("/visits", json={"id": A, "tz": "UTC"}).json() == {"week": 0, "total": 0}
    assert c.post("/visits", json={"id": B}).json() == {"week": 0, "total": 0}  # from before time zones were recorded
    for i, tz in enumerate(("GMT", "Etc/UTC", "Etc/GMT+3")):
        assert c.post("/visits", json={"id": f"0123456789abcdef-100{i}", "tz": tz}).status_code == 200
    assert c.get("/visits").json() == {"week": 0, "total": 0}
    leader, _ = signed_in("coleader-code")
    got = leader.get("/visits/daily").json()
    assert got["unclear"] == 4 and got["bots"] == 0 and got["regions"] == [] and got["days"][-1] == {"day": got["days"][-1]["day"], "total": 0, "regions": {}}
    assert c.post("/visits", json={"id": A, "tz": "Europe/London"}).json()["total"] == 1  # a later report from a real place counts them


def test_a_home_screen_app_saying_utc_is_a_person_and_a_bare_browser_is_not(env):
    from test_leaders import signed_in
    c = client()
    assert c.post("/visits", json={"id": A, "tz": "UTC", "standalone": False, "offset": 0}).json()["total"] == 0
    assert c.post("/visits", json={"id": B, "tz": "UTC", "standalone": True, "offset": 0}).json()["total"] == 1
    assert c.post("/visits", json={"id": "0123456789abcdef-0003", "tz": "UTC", "standalone": False, "offset": 480}).json()["total"] == 2
    assert c.post("/visits", json={"id": A, "offset": 9999}).status_code == 422
    leader, _ = signed_in("coleader-code")
    got = leader.get("/visits/daily").json()
    assert got["bots"] == 1 and got["unclear"] == 0
    assert got["regions"] == [{"name": "Home screen app", "total": 1}, {"name": "Place hidden", "total": 1}]
    assert got["days"][-1]["total"] == 2


def test_a_later_report_fills_in_the_home_screen_flag(env):
    c = client()
    assert c.post("/visits", json={"id": A, "tz": "UTC"}).json()["total"] == 0
    assert c.post("/visits", json={"id": A, "tz": "UTC", "standalone": True, "offset": 0}).json()["total"] == 1
    assert c.post("/visits", json={"id": A, "tz": "UTC"}).json()["total"] == 1  # an older page does not clear it
