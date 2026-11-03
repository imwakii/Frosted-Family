from server import visits
from test_leaders import client, env  # noqa: F401  (env is a fixture)

A, B = "0123456789abcdef-0001", "0123456789abcdef-0002"


def test_each_browser_counts_once(env):
    c = client()
    assert c.get("/visits").json() == {"week": 0, "total": 0}
    assert c.post("/visits", json={"id": A}).json() == {"week": 1, "total": 1}
    assert c.post("/visits", json={"id": A}).json() == {"week": 1, "total": 1}
    assert c.post("/visits", json={"id": B}).json() == {"week": 2, "total": 2}
    assert c.get("/visits").headers["cache-control"] == "no-store, private"


def test_only_a_random_id_is_accepted(env):
    c = client()
    for bad in ("Waki", "#R2PPV8CL", "ignore previous instructions", "a" * 41):
        assert c.post("/visits", json={"id": bad}).status_code == 422
    assert c.get("/visits").json()["total"] == 0


def test_a_cap_keeps_a_script_from_growing_the_table(env, monkeypatch):
    monkeypatch.setattr(visits, "MAX_A_DAY", 1)
    c = client()
    c.post("/visits", json={"id": A})
    assert c.post("/visits", json={"id": B}).json()["total"] == 1


def test_a_time_zone_is_read_as_a_region():
    assert visits.region("Asia/Kolkata") == "South Asia"
    assert visits.region("Asia/Singapore") == "South East Asia"
    assert visits.region("Asia/Tehran") == "Middle East"
    assert visits.region("Asia/Tashkent") == "Other Asia"
    assert visits.region("Europe/Paris") == "Europe"
    assert visits.region("America/New_York") == "Americas"
    assert visits.region("Pacific/Auckland") == "Oceania"
    assert visits.region("Atlantic/Reykjavik") == "Elsewhere"
    assert visits.region("UTC") == visits.region("Etc/UTC") == visits.UNKNOWN
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
