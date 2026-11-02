from server.db import clean_name


def test_clean_name_drops_the_replacement_character():
    assert clean_name("Dragon Slayer \ufffd") == "Dragon Slayer"


def test_clean_name_leaves_real_names_and_gaps_alone():
    assert clean_name("\u2605GANJA KING") == "\u2605GANJA KING"
    assert clean_name(None) is None
