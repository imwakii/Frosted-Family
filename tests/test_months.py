"""Roster's earlier months: /roster keeps what it serves under its month, and Roster can open a month kept."""
from datetime import datetime, timezone

from server import leaders, months
from test_leaders import client, env  # noqa: F401 (env is a fixture)

NOV = datetime(2026, 11, 11, 12, tzinfo=timezone.utc)


def test_a_roster_published_from_the_twelfth_is_next_months():
    assert months.season_of("2026-11-05T09:20:05Z", NOV) == "2026-11"
    assert months.season_of("2026-11-25T18:00:00Z", NOV) == "2026-12"
    assert months.season_of("2026-12-20T18:00:00Z", NOV) == "2027-01"
    assert months.season_of(None, NOV) == "2026-11"


def test_a_published_roster_is_kept_and_an_earlier_month_opens(env, monkeypatch):
    monkeypatch.setattr(leaders, "now", lambda: NOV)
    served = client().get("/roster").json()["players"]
    # Not published, so nothing is kept: a new roster file may already be next month's.
    assert months.month("2026-11") is None
    assert client().get("/roster/months").json() == {"current": "2026-11", "months": [{"season": "2026-11", "league": None}]}
    months.keep(served, "2026-11-05T09:20:05Z", NOV)
    # December's roster is published; November's stays as it was served.
    months.keep([{"tag": "#DEC", "name": "December"}], "2026-11-25T18:00:00Z", NOV)
    monkeypatch.setattr(months, "season_of", lambda published_at, now: "2026-12")
    body = client().get("/roster/months").json()
    assert body["current"] == "2026-12" and [m["season"] for m in body["months"]] == ["2026-12", "2026-11"]
    nov = client().get("/roster/month/2026-11").json()
    assert nov["season"] == "2026-11" and [p["tag"] for p in nov["players"]] == [p["tag"] for p in served]
    assert client().get("/roster/month/2026-10").status_code == 404
    assert client().get("/roster/month/nope").status_code == 422


def test_every_month_is_kept(env):
    months.keep([{"tag": "#A"}], "2026-11-02T00:00:00Z", NOV)
    months.keep([{"tag": "#B"}], "2027-06-02T00:00:00Z", datetime(2027, 6, 5, tzinfo=timezone.utc))
    assert months.month("2026-11") == [{"tag": "#A", "snapshot": None}]
    assert months.months("2027-06") == ["2027-06", "2026-11"]
