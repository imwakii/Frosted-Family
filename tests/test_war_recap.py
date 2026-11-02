from server import war


def hit(tag, stars, destruction=100.0, duration=100, th=18, on_th=18, ours=True):
    return {"ours": ours, "attacker": {"tag": tag, "name": tag, "th": th, "position": 1},
            "defender": {"tag": "#E", "name": "enemy", "th": on_th, "position": 1},
            "stars": stars, "destruction": destruction, "duration": duration}


def test_the_mvp_has_the_most_stars_then_damage_then_speed():
    assert war.recap([hit("#A", 3), hit("#B", 2)])["mvp"]["tag"] == "#A"
    assert war.recap([hit("#A", 2, 60.0), hit("#B", 2, 90.0)])["mvp"]["tag"] == "#B"
    r = war.recap([hit("#A", 3, duration=120), hit("#B", 3, duration=90)])
    assert (r["mvp"]["tag"], r["mvp"]["tied"]) == ("#B", 2)


def test_every_attack_counts_towards_the_mvp():
    r = war.recap([hit("#A", 3), hit("#B", 2), hit("#B", 2)])
    assert (r["mvp"]["tag"], r["mvp"]["stars"], r["mvp"]["tied"]) == ("#B", [2, 2], 1)


def test_the_enemy_cannot_be_mvp_and_a_war_without_our_attacks_has_no_recap():
    assert war.recap([hit("#Z", 3, ours=False)]) is None
    assert war.recap([hit("#Z", 3, ours=False), hit("#A", 1)])["mvp"]["tag"] == "#A"


def test_an_upset_needs_three_stars_on_two_town_halls_up():
    log = [hit("#A", 3, th=17, on_th=18), hit("#B", 3, th=15, on_th=17), hit("#C", 2, th=14, on_th=17), hit("#D", 3, th=13, on_th=16, ours=False)]
    assert [u["attacker"]["tag"] for u in war.recap(log)["upsets"]] == ["#B"]


def test_the_biggest_upsets_come_first_and_a_missing_time_never_wins():
    log = [hit(f"#{i}", 3, th=17 - i, on_th=18) for i in range(1, 6)]
    assert [u["attacker"]["tag"] for u in war.recap(log)["upsets"]] == ["#5", "#4", "#3"]
    assert war.recap([hit("#A", 3, duration=None), hit("#B", 3, duration=170)])["mvp"]["tag"] == "#B"
