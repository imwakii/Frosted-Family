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
