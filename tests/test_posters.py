"""The posters must render, and must render the same way they always have.

Geometry is compared cycle to cycle by eye against archived PNGs, so a silent
layout change is expensive. These tests do not check the layout is *good*; they
check that a refactor did not move anything.
"""

import subprocess
import sys

import pytest
from PIL import Image

pytest.importorskip("PIL")

EXPECTED = {
    "make_poster.py": (1700, 1683),
    "make_directory_poster.py": (2400, 1993),
}


@pytest.mark.parametrize("script,size", EXPECTED.items())
def test_poster_renders_at_the_expected_size(script, size, repo, tmp_path):
    out = tmp_path / "poster.png"
    cmd = [sys.executable, script, "--csv", "frosted_cwl_members.csv",
           "--date", "2 SEPTEMBER 2026", "--out", str(out)]
    if script == "make_poster.py":
        cmd += ["--time", "18:00 UTC"]
    r = subprocess.run(cmd, cwd=repo, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    assert Image.open(out).size == size, (
        f"{script} geometry changed. Posters are archived and compared cycle to "
        "cycle; confirm this is intended before updating the expected size.")


def test_directory_poster_refuses_a_roster_without_tiers(repo, tmp_path):
    """It used to take them from a *_pool_diagnostic.csv joined on name. Both
    the file and the join were rule violations."""
    import pandas as pd
    csv = tmp_path / "no_tier.csv"
    pd.read_csv(repo / "frosted_cwl_members.csv").drop(columns=["tier"]).to_csv(csv, index=False)
    r = subprocess.run(
        [sys.executable, "make_directory_poster.py", "--csv", str(csv),
         "--date", "2 SEPTEMBER 2026", "--out", str(tmp_path / "x.png")],
        cwd=repo, capture_output=True, text=True)
    assert r.returncode != 0
    assert "build_cycle.py" in (r.stderr + r.stdout)


def test_fonts_resolve_to_dejavu():
    """The scripts hardcoded a Linux path, which made them unrunnable on Windows.
    Rendered geometry depends on the font file, so this must be DejaVu itself and
    not a lookalike."""
    from frosted import fonts
    assert fonts.BOLD.name == "DejaVuSans-Bold.ttf"
    assert fonts.REG.name == "DejaVuSans.ttf"
    assert fonts.BOLD.exists() and fonts.REG.exists()


def test_katakana_name_survives_as_an_alias():
    """`ジェイ` rendered as `?` because DejaVu lacks the glyphs."""
    from frosted import fonts
    assert fonts.clean("ジェイ", fonts.build_charset()) == "Jay"
