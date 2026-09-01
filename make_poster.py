#!/usr/bin/env python3
"""
Frosted Family CWL roster poster generator.

Renders frosted_cwl_members.csv as a landscape PNG with all three clans
side by side. Panel heights adapt to core size, so 15v15 and 30v30 both work.

    python3 make_poster.py --csv frosted_cwl_members.csv \
        --date "16 AUGUST 2026" --time "18:00 UTC" \
        --out frosted-cwl-roster.png

EDIT EACH CYCLE: CLAN_FORMAT below (leagues change on promotion/demotion).
"""

import argparse
from pathlib import Path

import pandas as pd
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont

# ─── per-cycle config ─────────────────────────────────────────────────────────
CLAN_ORDER  = ["Fire", "Cake"]          # Flakes sits out this cycle
CLAN_FORMAT = {
    "Fire":   "15v15 · CHAMPION 3 · TH18",
    "Cake":   "15v15 · CHAMPION 3 · TH16-18",
}
N_SUBS_SHOWN = 14
DASHBOARD_URL = "frosted-family.streamlit.app"

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
BG          = ( 14,  25,  44)
PANEL_BG    = ( 22,  34,  56)
ROW_ALT     = ( 27,  41,  65)
DIVIDER_BG  = ( 17,  28,  48)
TITLE_BLUE  = ( 93, 173, 236)
SUBTITLE    = (146, 163, 188)
WHITE       = (255, 255, 255)
DIM         = (150, 165, 188)
GOLD        = (247, 201,  72)
GOLD_DIM    = (188, 155,  72)
LINK_BLUE   = (120, 200, 255)

# ─── geometry ─────────────────────────────────────────────────────────────────
CANVAS_W     = 1700
MARGIN       = 44
PANEL_GAP    = 28
TITLE_BLOCK  = 178
HEADER_H     = 105
COLHEAD_H    = 34
ROW_H        = 38
DIVIDER_H    = 34
FOOTER_GAP   = 30
FOOTER_H     = 112

# Display aliases for names DejaVu cannot render at all (pure CJK etc).
# Without these clean() falls back to "?" and the row becomes unusable.
NAME_ALIAS = {
    "ジェイ": "Jay",
}

FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")
BOLD, REG = FONT_DIR / "DejaVuSans-Bold.ttf", FONT_DIR / "DejaVuSans.ttf"


def load_fonts():
    f = lambda p, s: ImageFont.truetype(str(p), s)
    return {
        "title":    f(BOLD, 68), "subtitle": f(REG, 25),
        "clan":     f(BOLD, 44), "format":   f(REG, 19),
        "avg_lbl":  f(REG, 15),  "avg":      f(BOLD, 40),
        "colhead":  f(REG, 16),  "rank":     f(REG, 19),
        "name":     f(BOLD, 22), "name_sub": f(REG, 21),
        "score":    f(BOLD, 23), "th":       f(BOLD, 16),
        "pill":     f(BOLD, 13), "divider":  f(BOLD, 15),
        "foot_b":   f(BOLD, 26), "foot_l":   f(BOLD, 22), "note": f(REG, 18),
    }


def build_charset():
    """Codepoints DejaVu Sans can actually render."""
    cps = set()
    for path in (BOLD, REG):
        for table in TTFont(str(path))["cmap"].tables:
            cps |= set(table.cmap.keys())
    return cps


def clean(text, charset):
    """Drop glyphs DejaVu lacks (emoji, CJK, Tibetan...) and tidy whitespace."""
    text = NAME_ALIAS.get(str(text).strip(), text)
    out = "".join(c for c in str(text) if ord(c) in charset)
    out = " ".join(out.split()).strip(" -_·.")
    return out or "?"


def text_color_for(bg):
    """Dark text on light TH badges, white on dark ones."""
    lum = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2]
    return (20, 28, 42) if lum > 150 else WHITE


def rounded(draw, box, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def draw_th_badge(draw, cx, cy, th, fonts):
    if pd.isna(th):
        return
    th = int(th)
    color = TH_COLOR_MAP.get(th, (90, 90, 90))
    r = 14
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    label = str(th)
    w = draw.textlength(label, font=fonts["th"])
    draw.text((cx - w / 2, cy - 10), label, font=fonts["th"], fill=text_color_for(color))


def draw_pill(draw, x, cy, label, fonts, color):
    pad_x, h = 9, 20
    w = draw.textlength(label, font=fonts["pill"]) + pad_x * 2
    rounded(draw, [x, cy - h // 2, x + w, cy + h // 2], 5, fill=color)
    draw.text((x + pad_x, cy - 8), label, font=fonts["pill"], fill=WHITE)
    return w


def draw_row(draw, px, y, pw, rec, fonts, charset, idx=None, dim=False):
    """One player row. idx=None renders a substitute (no rank, dimmed)."""
    name_c  = DIM if dim else WHITE
    score_c = GOLD_DIM if dim else GOLD
    name_f  = fonts["name_sub"] if dim else fonts["name"]
    cy = y + ROW_H // 2

    if idx is not None:
        draw.text((px + 26, cy - 11), str(idx), font=fonts["rank"], fill=DIM)

    x = px + 66
    name = clean(rec["name"], charset)
    draw.text((x, cy - (12 if not dim else 11)), name, font=name_f, fill=name_c)
    x += draw.textlength(name, font=name_f) + 12

    src = rec.get("transferred_from")
    if isinstance(src, str) and src.strip():
        x += draw_pill(draw, x, cy, f"FROM {src.upper()}", fonts,
                       CLAN_COLORS.get(src.strip(), (90, 110, 140))) + 8

    if rec.get("flag_alt"):
        draw.text((x, cy - 9), "(alt)", font=fonts["colhead"], fill=(110, 126, 150))

    draw_th_badge(draw, px + pw - 152, cy, rec.get("current_th"), fonts)

    score = rec.get("final_score")
    s = "—" if pd.isna(score) else f"{score:.1f}"
    sw = draw.textlength(s, font=fonts["score"])
    draw.text((px + pw - 30 - sw, cy - 13), s, font=fonts["score"], fill=score_c)


def panel_height(n_core, n_sub):
    return HEADER_H + COLHEAD_H + n_core * ROW_H + DIVIDER_H + n_sub * ROW_H


def draw_panel(img, draw, px, py, pw, clan, core, subs, fonts, charset):
    accent = CLAN_COLORS[clan]
    ph = panel_height(len(core), len(subs))

    rounded(draw, [px, py, px + pw, py + ph], 12, fill=PANEL_BG)

    # header band
    hdr = Image.new("RGBA", (pw, HEADER_H), accent + (255,))
    mask = Image.new("L", (pw, HEADER_H), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, pw, HEADER_H + 14], radius=12, fill=255)
    img.paste(hdr, (px, py), mask)

    draw.text((px + 26, py + 20), clan.upper(), font=fonts["clan"], fill=WHITE)
    draw.text((px + 28, py + 72), CLAN_FORMAT.get(clan, ""), font=fonts["format"], fill=WHITE)

    avg = pd.Series([r["final_score"] for r in core]).dropna().mean()
    lbl, val = "CORE AVG", ("—" if pd.isna(avg) else f"{avg:.1f}")
    lw = draw.textlength(lbl, font=fonts["avg_lbl"])
    vw = draw.textlength(val, font=fonts["avg"])
    draw.text((px + pw - 26 - lw, py + 22), lbl, font=fonts["avg_lbl"], fill=WHITE)
    draw.text((px + pw - 26 - vw, py + 44), val, font=fonts["avg"], fill=WHITE)

    # column headers
    y = py + HEADER_H
    draw.rectangle([px, y, px + pw, y + COLHEAD_H], fill=DIVIDER_BG)
    draw.text((px + 26, y + 9), "#",      font=fonts["colhead"], fill=DIM)
    draw.text((px + 66, y + 9), "PLAYER", font=fonts["colhead"], fill=DIM)
    tw = draw.textlength("TH", font=fonts["colhead"])
    draw.text((px + pw - 152 - tw / 2, y + 9), "TH", font=fonts["colhead"], fill=DIM)
    sw = draw.textlength("SCORE", font=fonts["colhead"])
    draw.text((px + pw - 30 - sw, y + 9), "SCORE", font=fonts["colhead"], fill=DIM)
    y += COLHEAD_H

    for i, rec in enumerate(core, 1):
        if i % 2 == 0:
            draw.rectangle([px, y, px + pw, y + ROW_H], fill=ROW_ALT)
        draw_row(draw, px, y, pw, rec, fonts, charset, idx=i)
        y += ROW_H

    draw.rectangle([px, y, px + pw, y + DIVIDER_H], fill=DIVIDER_BG)
    draw.text((px + 26, y + 10), "TOP SUBSTITUTES", font=fonts["divider"], fill=DIM)
    y += DIVIDER_H

    for i, rec in enumerate(subs):
        if i % 2 == 1:
            draw.rectangle([px, y, px + pw, y + ROW_H], fill=ROW_ALT)
        draw_row(draw, px, y, pw, rec, fonts, charset, idx=None, dim=True)
        y += ROW_H

    rounded(draw, [px, py, px + pw, py + ph], 12, outline=accent, width=2)
    return ph


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv",  default="frosted_cwl_members.csv")
    ap.add_argument("--out",  default="frosted-cwl-roster.png")
    ap.add_argument("--date", required=True, help='e.g. "16 AUGUST 2026"')
    ap.add_argument("--time", default="18:00 UTC")
    ap.add_argument("--title", default="FROSTED FAMILY")
    ap.add_argument("--subs", type=int, default=N_SUBS_SHOWN,
                    help=f"substitutes shown per clan (default {N_SUBS_SHOWN})")
    ap.add_argument("--show-sitting-out", action="store_true",
                    help="list Sitting Out players under the footer (off by default)")
    args = ap.parse_args()

    df = pd.read_csv(args.csv)
    df["transferred_from"] = df["transferred_from"].fillna("")
    if "flag_alt" in df:
        df["flag_alt"] = df["flag_alt"].fillna(False).astype(bool)

    fonts, charset = load_fonts(), build_charset()

    rosters = {}
    for clan in CLAN_ORDER:
        c = df[(df.clan == clan) & (df.cwl_slot == "CORE")].sort_values(
            "final_score", ascending=False)
        s = df[(df.clan == clan) & (df.cwl_slot == "SUB")].sort_values(
            "final_score", ascending=False).head(args.subs)
        rosters[clan] = (c.to_dict("records"), s.to_dict("records"))

    pw = (CANVAS_W - 2 * MARGIN - (len(CLAN_ORDER) - 1) * PANEL_GAP) // len(CLAN_ORDER)
    tallest = max(panel_height(len(c), len(s)) for c, s in rosters.values())
    canvas_h = MARGIN + TITLE_BLOCK + tallest + FOOTER_GAP + FOOTER_H + MARGIN

    img = Image.new("RGB", (CANVAS_W, canvas_h), BG)
    draw = ImageDraw.Draw(img)

    # title block
    tw = draw.textlength(args.title, font=fonts["title"])
    draw.text(((CANVAS_W - tw) / 2, MARGIN + 6), args.title,
              font=fonts["title"], fill=TITLE_BLUE)
    sub = f"CWL ROSTERS  —  {args.date}, {args.time}"
    sw = draw.textlength(sub, font=fonts["subtitle"])
    draw.text(((CANVAS_W - sw) / 2, MARGIN + 92), sub,
              font=fonts["subtitle"], fill=SUBTITLE)
    ly = MARGIN + 144
    draw.line([MARGIN + 40, ly, CANVAS_W - MARGIN - 40, ly], fill=(38, 56, 84), width=2)

    # panels
    py = MARGIN + TITLE_BLOCK
    for i, clan in enumerate(CLAN_ORDER):
        core, subs = rosters[clan]
        draw_panel(img, draw, MARGIN + i * (pw + PANEL_GAP), py, pw,
                   clan, core, subs, fonts, charset)

    # footer
    fy = py + tallest + FOOTER_GAP
    rounded(draw, [MARGIN, fy, CANVAS_W - MARGIN, fy + FOOTER_H], 12,
            outline=CLAN_COLORS["Flakes"], width=2)
    t1 = "FULL INTERACTIVE DASHBOARD"
    w1 = draw.textlength(t1, font=fonts["foot_b"])
    draw.text(((CANVAS_W - w1) / 2, fy + 26), t1, font=fonts["foot_b"], fill=WHITE)
    w2 = draw.textlength(DASHBOARD_URL, font=fonts["foot_l"])
    draw.text(((CANVAS_W - w2) / 2, fy + 62), DASHBOARD_URL,
              font=fonts["foot_l"], fill=LINK_BLUE)

    out = df[df.cwl_slot == "Sitting Out"]
    if args.show_sitting_out and not out.empty:
        note = "SITTING OUT: " + ", ".join(clean(n, charset) for n in out["name"])
        nw = draw.textlength(note, font=fonts["note"])
        draw.text(((CANVAS_W - nw) / 2, fy - 26), note, font=fonts["note"], fill=DIM)

    img.save(args.out)
    print(f"wrote {args.out}  ({CANVAS_W}x{canvas_h})")
    for clan in CLAN_ORDER:
        core, subs = rosters[clan]
        avg = pd.Series([r["final_score"] for r in core]).dropna().mean()
        print(f"  {clan:7s} core {len(core):2d} avg {avg:5.1f}  subs shown {len(subs)}")


if __name__ == "__main__":
    main()
