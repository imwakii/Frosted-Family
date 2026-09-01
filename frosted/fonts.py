"""DejaVu Sans resolution and the glyph-safety helpers built on it.

The poster scripts were written in a Linux sandbox and hardcoded
/usr/share/fonts/truetype/dejavu. That path does not exist on Windows, which
made the posters unrenderable outside the sandbox. Rendered geometry depends on
the font file, so this resolves the *same* DejaVu files rather than
substituting a lookalike: matplotlib ships them, which is why its bundle is the
fallback. Any change here must be checked with the poster byte-diff in the
repo README before it is trusted.
"""

from pathlib import Path

from PIL import ImageFont
from fontTools.ttLib import TTFont

_BOLD_NAME, _REG_NAME = "DejaVuSans-Bold.ttf", "DejaVuSans.ttf"


def _candidate_dirs():
    yield Path("/usr/share/fonts/truetype/dejavu")          # Linux, and the old sandbox
    try:                                                     # bundled with matplotlib
        import matplotlib
        yield Path(matplotlib.__file__).parent / "mpl-data" / "fonts" / "ttf"
    except ImportError:
        pass
    yield Path("C:/Windows/Fonts")                           # if installed system-wide


def font_paths():
    """Return (bold, regular) paths, or raise with every directory tried."""
    tried = []
    for d in _candidate_dirs():
        tried.append(str(d))
        bold, reg = d / _BOLD_NAME, d / _REG_NAME
        if bold.exists() and reg.exists():
            return bold, reg
    raise FileNotFoundError(
        f"DejaVu Sans not found. Looked for {_BOLD_NAME} and {_REG_NAME} in:\n  "
        + "\n  ".join(tried)
        + "\nInstall matplotlib (pip install matplotlib), which bundles them."
    )


BOLD, REG = font_paths()


def sized(spec):
    """Build a font dict from {key: (weight, size)} where weight is 'b' or 'r'."""
    return {k: ImageFont.truetype(str(BOLD if w == "b" else REG), s)
            for k, (w, s) in spec.items()}


def build_charset():
    """Codepoints DejaVu Sans can actually render."""
    cps = set()
    for path in (BOLD, REG):
        for table in TTFont(str(path))["cmap"].tables:
            cps |= set(table.cmap.keys())
    return cps


# Display aliases for names DejaVu cannot render at all (pure CJK etc).
# Without these clean() falls back to "?" and the row becomes unusable.
NAME_ALIAS = {
    "ジェイ": "Jay",
}


def clean(text, charset):
    """Drop glyphs DejaVu lacks (emoji, CJK, Tibetan...) and tidy whitespace."""
    text = NAME_ALIAS.get(str(text).strip(), text)
    out = "".join(c for c in str(text) if ord(c) in charset)
    out = " ".join(out.split()).strip(" -_·.")
    return out or "?"
