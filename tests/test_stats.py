"""GET /stats/clans from a fixture poll, and Discord sign-in with exactly the six api.env lines."""
from pathlib import Path

import pytest

from server import auth, db, stats
from test_leaders import client, env, sign_in  # noqa: F401  (fixtures)
from test_server import FIRE, Recorder, poll


@pytest.fixture
def polled(env):
    conn = db.connect(env / "frosted.db")
    poll(conn, Recorder())
    poll(conn, Recorder())  # a second pass the same day rewrites today's rows, it does not add any
    conn.close()
    return env


def test_one_row_per_clan_per_day(polled):
    conn = db.connect(polled / "frosted.db")
    rows = conn.execute("SELECT clan_tag, members FROM clan_daily").fetchall()
    assert sorted((r["clan_tag"], r["members"]) for r in rows) == [("#20CU2R80R", 2), ("#2JJYV0JVV", 1),
                                                                   ("#CL0G80LV", 2)]


def test_clan_series(polled):
    body = client().get("/stats/clans").json()
    assert body["since"] and body["as_of"]
    fire = body["clans"]["Fire"]
    today = body["since"]
    assert fire["members"] == [{"date": today, "value": 2}]
    assert fire["avg_th"] == [{"date": today, "value": 17.5}]
    assert fire["hero_progress"] == [{"date": today, "value": round(200 / 210, 4)}]  # newbie has no profile
    assert fire["capital_by_raid"] == [{"date": "2026-10-24", "value": 21000}]
    assert fire["cwl_league"] == [{"season": today[:7], "league": "Champion League III"}]
    # Day 1 ended 3-4 against Fire; day 2 is still in war and not listed. Waki's only day-1 attack was a three-star.
    assert fire["wars"] == [{"date": "2026-11-04", "clan": "Fire", "kind": "cwl", "opponent": "Enemy", "result": "lost",
                             "stars": 3, "opponent_stars": 4, "destruction": 50.0, "opponent_destruction": 85.0,
                             "three_star_rate": 1.0}]
    cake = body["clans"]["Cake"]
    assert cake["wars"][0]["result"] == "won" and cake["wars"][0]["three_star_rate"] == 0.333
    family = body["clans"]["Family"]
    assert family["members"] == [{"date": today, "value": 5}] and len(family["wars"]) == 2
    assert family["cwl_league"] == []


def test_cycle_scores(polled):
    fire = client().get("/stats/clans").json()["clans"]["Fire"]["score_by_cycle"]
    assert [c["cycle"] for c in fire] == ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]
    # score_history.csv has no slot column: the CORE average exists for the current cycle only.
    assert all(c["core_avg_score"] is None for c in fire[:-1])
    assert fire[-1]["core_avg_score"] is not None and fire[-1]["core_n"] == 15
    assert all(c["avg_score"] > 0 and c["n"] > 0 for c in fire)


def test_season_totals_from_resets():
    pts = [{"date": f"2026-10-{d:02d}", "value": v} for d, v in ((25, 900), (26, 1000), (27, 30), (28, 200))]
    assert stats.seasons(pts) == [{"date": "2026-10-26", "value": 1000}]


def test_stats_before_the_first_poll(env):
    body = client().get("/stats/clans").json()
    assert body["since"] is None and body["clans"]["Fire"]["members"] == []


# ─── Discord with only the six api.env lines ──────────────────────────────────

def test_discord_needs_only_the_six_lines(env, monkeypatch):
    # The unit sets FROSTED_SITE_URL, but the default must be right without it.
    monkeypatch.delenv("FROSTED_SITE_URL")
    monkeypatch.delenv("LEADER_PASSCODE", raising=False)
    monkeypatch.setenv("LEADERS_PUBLIC", "false")
    assert auth.config() is not None
    assert auth.config().redirect_uri == "https://frosted-family.vercel.app/api/auth/callback"
    assert client().get("/leaders/inactivity").status_code == 401  # locked, signed out
    c = client()
    assert sign_in(c).headers["location"] == "https://frosted-family.vercel.app/#/plan"
    me = c.get("/auth/me").json()
    assert (me["configured"], me["role"], me["via"], me["passcode_enabled"]) == (True, "publisher", "discord", False)
    csrf = {"X-CSRF-Token": me["csrf"]}
    assert c.get("/leaders/inactivity").status_code == 200
    assert c.put("/plan/draft", json={"moves": []}, headers=csrf).status_code == 200
    assert c.post("/plan/check", json={"moves": []}, headers=csrf).json() == {"ok": True, "problems": []}


def test_discord_co_leader_reads_and_saves_but_cannot_publish(env, monkeypatch):
    monkeypatch.setenv("LEADERS_PUBLIC", "false")
    c = client()
    sign_in(c, "coleader-code")
    csrf = {"X-CSRF-Token": c.get("/auth/me").json()["csrf"]}
    assert c.get("/leaders/make-room", params={"clan": "Fire"}).status_code == 200
    assert c.put("/plan/draft", json={"moves": []}, headers=csrf).status_code == 200
    assert c.post("/plan/publish", json={"moves": []}, headers=csrf).status_code == 403


@pytest.fixture
def exports(polled, monkeypatch):
    monkeypatch.setenv("FROSTED_RAW", str(Path(__file__).parents[1] / "data" / "raw"))  # the committed exports
    return polled


def test_trend_monthly_matches_the_cycle_scores(exports):
    fire = client().get("/stats/clans").json()["clans"]["Fire"]
    monthly, by_cycle = fire["trend"]["monthly"], {c["cycle"]: c["avg_score"] for c in fire["score_by_cycle"]}
    assert [m["cycle"] for m in monthly] == ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]
    assert monthly == sorted(monthly, key=lambda m: m["date"])
    # Same exports, same formula: only the exports' rounded percentages separate the two.
    assert all(abs(m["score"] - by_cycle[m["cycle"]]) < 0.5 for m in monthly)
    assert all(0 < m["three_star_rate"] <= 1 and 0 <= m["miss_rate"] < 1 for m in monthly)


def test_trend_daily_carries_the_latest_export_forward(exports):
    body = client().get("/stats/clans").json()
    fire = body["clans"]["Fire"]["trend"]
    assert [d["date"] for d in fire["daily"]] == [body["since"]]
    day = fire["daily"][0]
    assert day["cycle"] == "2026-11" and day["n"] >= 1 and day["score"] > 0
