"""Constants shared across the app and both poster scripts.

Every colour and threshold below appears exactly once in the codebase. If you
find yourself copying a value out of here into a script, put it back.

Geometry (canvas widths, row heights, section headings) deliberately stays in
the individual poster scripts: the two posters have different layouts, and the
per-cycle config blocks at the top of each are meant to be edited in place.
"""

# ─── the family ───────────────────────────────────────────────────────────────
CLAN_TAGS = {
    "Fire":   "#CL0G80LV",
    "Cake":   "#20CU2R80R",
    "Flakes": "#2JJYV0JVV",
}
TAG_TO_CLAN = {v: k for k, v in CLAN_TAGS.items()}

CWL_SLOTS = ("CORE", "SUB", "Sitting Out")

# ─── scoring thresholds ───────────────────────────────────────────────────────
# The confidence caps are load-bearing: they stop a five-attack hot streak from
# outranking a proven sixty-attack record. See docs/specs/01-scoring-core.md.
ATTACK_CONFIDENCE_CAP = 25
DEFENSE_CONFIDENCE_CAP = 20
TH_ADJUSTMENT_PER_LEVEL = 0.05
DEFENSE_TH_BASELINE = 15

HIGH_MISS_PCT = 20.0        # flagged when strictly greater
LIMITED_DATA_RANGE = (1, 9)  # inclusive, on attacks actually made

# ─── activity tiering ─────────────────────────────────────────────────────────
PROVEN_MAX_IDLE_DAYS = 21
PROVEN_MIN_WAR_SLOTS = 10
PROVEN_MAX_MISS_PCT = 20.0
DORMANT_IDLE_DAYS = 45      # beyond LAPSING; see docs/specs/01-scoring-core.md

# ─── palette ──────────────────────────────────────────────────────────────────
CLAN_COLORS = {
    "Fire":   (255, 107,  53),
    "Cake":   ( 74, 144, 217),
    "Flakes": (123, 104, 238),
}
TH_COLOR_MAP = {
    7:  (224, 113,   0),  8:  (155,  90,  40),  9:  ( 68,  78,  97),
    10: (184,   8,   0),  11: (206, 204, 224),  12: (  0,  89, 177),
    13: (  0, 185, 214),  14: (  0, 185, 129),  15: (103,  84, 153),
    16: (224, 175,   2),  17: ( 44,  83, 126),  18: ( 81, 172, 224),
}
STATUS_STYLE = {                       # tier -> (poster label, pill colour)
    "PROVEN":          ("ACTIVE",    ( 39, 174,  96)),
    "THIN RECORD":     ("THIN",      ( 52, 130, 190)),
    "UNRELIABLE (HM)": ("HIGH MISS", (211, 120,  32)),
    "LAPSING":         ("INACTIVE",  ( 88,  96, 112)),
    "DORMANT":         ("INACTIVE",  ( 88,  96, 112)),
    "NO DATA":         ("INACTIVE",  ( 88,  96, 112)),
}

BG          = ( 14,  25,  44)
PANEL_BG    = ( 22,  34,  56)
ROW_ALT     = ( 27,  41,  65)
DIVIDER_BG  = ( 17,  28,  48)
TITLE_BLUE  = ( 93, 173, 236)
SUBTITLE    = (146, 163, 188)
WHITE       = (255, 255, 255)
DIM         = (150, 165, 188)
DIMMER      = (108, 122, 145)
GOLD        = (247, 201,  72)
GOLD_DIM    = (188, 155,  72)
LINK_BLUE   = (120, 200, 255)

# Streamlit/plotly wants hex; PIL wants RGB tuples. One source, two views.
def hex_of(rgb):
    return "#%02X%02X%02X" % tuple(rgb)

CLAN_COLORS_HEX = {k: hex_of(v) for k, v in CLAN_COLORS.items()}
SLOT_COLORS_HEX = {"CORE": "#27AE60", "SUB": "#E67E22", "Sitting Out": "#95A5A6"}

DASHBOARD_URL = "frosted-family.streamlit.app"
