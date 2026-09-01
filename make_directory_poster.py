#!/usr/bin/env python3
"""
Frosted Family — full membership directory poster.

Companion to make_poster.py. Where that renders the CWL lineup (CORE + top subs
for participating clans only), this renders EVERY member of all three clans,
grouped by CWL slot, with an activity status tag and the 50-member cap per clan.

    python3 make_directory_poster.py --csv frosted_cwl_members.csv \
        --diag september_pool_diagnostic.csv --date "2 SEPTEMBER 2026" \
        --out frosted-family-directory.png

EDIT EACH CYCLE: CLAN_STATUS below.
"""

import argparse
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont

# ─── per-cycle config ─────────────────────────────────────────────────────────
CLAN_ORDER  = ["Fire", "Cake", "Flakes"]
CLAN_STATUS = {
    "Fire":   "15v15 · CHAMPION 3 · PRIORITY CLAN",
    "Cake":   "15v15 · CHAMPION 3 · BACKFILL",
    "Flakes": "NOT IN CWL · HOLDING PEN",
}
SECTIONS_AFTER = [("CORE", "STARTING FIFTEEN"),
                  ("SUB", "SUBSTITUTES"),
                  ("Sitting Out", "NOT ON CWL ROSTER")]
SECTIONS_BEFORE = [("ACTIVE", "ACTIVE"), ("THIN", "THIN RECORD"),
                   ("HIGH MISS", "HIGH MISS"), ("INACTIVE", "INACTIVE")]

# ─── palette (shared with make_poster.py) ─────────────────────────────────────
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
STATUS_STYLE = {                       # tier -> (label, pill colour)
    "PROVEN":          ("ACTIVE",    ( 39, 174,  96)),
    "THIN RECORD":     ("THIN",      ( 52, 130, 190)),
    "UNRELIABLE (HM)": ("HIGH MISS", (211, 120,  32)),
    "LAPSING":         ("INACTIVE",  ( 88,  96, 112)),
    "DORMANT":         ("INACTIVE",  ( 88,  96, 112)),
    "NO DATA":         ("INACTIVE",  ( 88,  96, 112)),
}
BG         = ( 14,  25,  44)
PANEL_BG   = ( 22,  34,  56)
ROW_ALT    = ( 27,  41,  65)
DIVIDER_BG = ( 17,  28,  48)
TITLE_BLUE = ( 93, 173, 236)
SUBTITLE   = (146, 163, 188)
WHITE      = (255, 255, 255)
DIM        = (150, 165, 188)
DIMMER     = (108, 122, 145)
GOLD       = (247, 201,  72)
GOLD_DIM   = (188, 155,  72)

# ─── geometry ─────────────────────────────────────────────────────────────────
CANVAS_W    = 2400
MARGIN      = 44
PANEL_GAP   = 28
TITLE_BLOCK = 178
HEADER_H    = 105
COLHEAD_H   = 30
ROW_H       = 30
DIVIDER_H   = 30
FOOTER_GAP  = 30
FOOTER_H    = 92

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
        "title":   f(BOLD, 68), "subtitle": f(REG, 25),
        "clan":    f(BOLD, 42), "format":   f(REG, 18),
        "avg_lbl": f(REG, 14),  "avg":      f(BOLD, 34),
        "colhead": f(REG, 14),  "name":     f(BOLD, 18),
        "name_d":  f(REG, 18),  "score":    f(BOLD, 18),
        "th":      f(BOLD, 14), "pill":     f(BOLD, 11),
        "divider": f(BOLD, 14), "foot_b":   f(BOLD, 24), "note": f(REG, 19),
    }


def build_charset():
    cps = set()
    for path in (BOLD, REG):
        for table in TTFont(str(path))["cmap"].tables:
            cps |= set(table.cmap.keys())
    return cps


def clean(text, charset):
    text = NAME_ALIAS.get(str(text).strip(), text)
    out = "".join(c for c in str(text) if ord(c) in charset)
    out = " ".join(out.split()).strip(" -_·.")
    return out or "?"


def text_color_for(bg):
    lum = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2]
    return (20, 28, 42) if lum > 150 else WHITE


def rounded(draw, box, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def draw_th_badge(draw, cx, cy, th, fonts):
    if pd.isna(th):
        return
    th = int(th)
    color = TH_COLOR_MAP.get(th, (90, 90, 90))
    r = 11
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    label = str(th)
    w = draw.textlength(label, font=fonts["th"])
    draw.text((cx - w / 2, cy - 8), label, font=fonts["th"], fill=text_color_for(color))


def draw_pill(draw, x, cy, label, fonts, color, text_col=WHITE):
    pad_x, h = 7, 17
    w = draw.textlength(label, font=fonts["pill"]) + pad_x * 2
    rounded(draw, [x, cy - h // 2, x + w, cy + h // 2], 4, fill=color)
    draw.text((x + pad_x, cy - 7), label, font=fonts["pill"], fill=text_col)
    return w


def draw_row(draw, px, y, pw, rec, fonts, charset, idx, dim=False):
    cy = y + ROW_H // 2
    name_c  = DIMMER if dim else WHITE
    score_c = GOLD_DIM if dim else GOLD
    name_f  = fonts["name_d"] if dim else fonts["name"]

    draw.text((px + 18, cy - 9), str(idx), font=fonts["colhead"], fill=DIMMER)
    name = clean(rec["name"], charset)
    draw.text((px + 56, cy - 10), name, font=name_f, fill=name_c)

    move, mclan = rec.get("move_label"), rec.get("move_clan")
    if isinstance(move, str) and move:
        draw_pill(draw, px + 322, cy, move, fonts,
                  CLAN_COLORS.get(mclan, (90, 110, 140)))

    label, colour = STATUS_STYLE.get(rec.get("tier"), ("?", (80, 80, 80)))
    draw_pill(draw, px + 442, cy, label, fonts, colour)

    draw_th_badge(draw, px + pw - 118, cy, rec.get("current_th"), fonts)

    score = rec.get("final_score")
    s = "—" if pd.isna(score) else f"{score:.1f}"
    sw = draw.textlength(s, font=fonts["score"])
    draw.text((px + pw - 24 - sw, cy - 10), s, font=fonts["score"], fill=score_c)


def panel_height(groups):
    n_rows = sum(len(g) for _, _, g in groups)
    return HEADER_H + COLHEAD_H + len(groups) * DIVIDER_H + n_rows * ROW_H


def draw_panel(img, draw, px, py, pw, clan, groups, core_avg, subtitle, fonts, charset):
    accent = CLAN_COLORS[clan]
    ph = panel_height(groups)
    rounded(draw, [px, py, px + pw, py + ph], 12, fill=PANEL_BG)

    hdr = Image.new("RGBA", (pw, HEADER_H), accent + (255,))
    mask = Image.new("L", (pw, HEADER_H), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, pw, HEADER_H + 14], radius=12, fill=255)
    img.paste(hdr, (px, py), mask)

    draw.text((px + 24, py + 20), clan.upper(), font=fonts["clan"], fill=WHITE)
    draw.text((px + 26, py + 70), subtitle, font=fonts["format"], fill=WHITE)

    if core_avg is not None:
        lbl, val = "CORE AVG", ("—" if pd.isna(core_avg) else f"{core_avg:.1f}")
        lw = draw.textlength(lbl, font=fonts["avg_lbl"])
        vw = draw.textlength(val, font=fonts["avg"])
        draw.text((px + pw - 24 - lw, py + 22), lbl, font=fonts["avg_lbl"], fill=WHITE)
        draw.text((px + pw - 24 - vw, py + 42), val, font=fonts["avg"], fill=WHITE)

    y = py + HEADER_H
    draw.rectangle([px, y, px + pw, y + COLHEAD_H], fill=DIVIDER_BG)
    draw.text((px + 18, y + 8), "#", font=fonts["colhead"], fill=DIM)
    draw.text((px + 56, y + 8), "PLAYER", font=fonts["colhead"], fill=DIM)
    draw.text((px + 442, y + 8), "STATUS", font=fonts["colhead"], fill=DIM)
    tw = draw.textlength("TH", font=fonts["colhead"])
    draw.text((px + pw - 118 - tw / 2, y + 8), "TH", font=fonts["colhead"], fill=DIM)
    sw = draw.textlength("SCORE", font=fonts["colhead"])
    draw.text((px + pw - 24 - sw, y + 8), "SCORE", font=fonts["colhead"], fill=DIM)
    y += COLHEAD_H

    n = 0
    for slot, heading, recs in groups:
        draw.rectangle([px, y, px + pw, y + DIVIDER_H], fill=DIVIDER_BG)
        draw.text((px + 18, y + 8), heading, font=fonts["divider"], fill=DIM)
        y += DIVIDER_H
        for i, rec in enumerate(recs):
            n += 1
            if i % 2 == 1:
                draw.rectangle([px, y, px + pw, y + ROW_H], fill=ROW_ALT)
            draw_row(draw, px, y, pw, rec, fonts, charset, n,
                     dim=(slot in ("Sitting Out", "INACTIVE")))
            y += ROW_H

    rounded(draw, [px, py, px + pw, py + ph], 12, outline=accent, width=2)
    return ph


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv",  default="frosted_cwl_members.csv")
    ap.add_argument("--diag", default="september_pool_diagnostic.csv",
                    help="diagnostic file supplying the activity tier per player")
    ap.add_argument("--out",  default="frosted-family-directory.png")
    ap.add_argument("--date", required=True)
    ap.add_argument("--title", default="FROSTED FAMILY")
    ap.add_argument("--mode", choices=["before", "after"], default="after",
                    help="before = clans as they stand today, grouped by status; "
                         "after = clans post-move, grouped by CWL slot")
    args = ap.parse_args()
    before = args.mode == "before"

    df = pd.read_csv(args.csv)
    df["transferred_from"] = df["transferred_from"].fillna("")
    tiers = pd.read_csv(args.diag)[["Name", "tier"]].rename(columns={"Name": "name"})
    df = df.merge(tiers, on="name", how="left")
    df["tier"] = df["tier"].fillna("NO DATA")
    df["status"] = df["tier"].map(lambda t: STATUS_STYLE.get(t, ("?", None))[0])
    df["origin"] = df.apply(
        lambda r: r["transferred_from"] if str(r["transferred_from"]).strip() else r["clan"], axis=1)
    moved = df["origin"] != df["clan"]
    if before:
        df["panel"] = df["origin"]
        df["move_label"] = np.where(moved, "→ " + df["clan"].str.upper(), "")
        df["move_clan"]  = df["clan"]
    else:
        df["panel"] = df["clan"]
        df["move_label"] = np.where(moved, "← " + df["origin"].str.upper(), "")
        df["move_clan"]  = df["origin"]

    fonts, charset = load_fonts(), build_charset()

    key = "status" if before else "cwl_slot"
    sections = SECTIONS_BEFORE if before else SECTIONS_AFTER
    panels = {}
    for clan in CLAN_ORDER:
        sub = df[df.panel == clan]
        groups = []
        for slot, heading in sections:
            recs = sub[sub[key] == slot].sort_values(
                "final_score", ascending=False, na_position="last").to_dict("records")
            if recs:
                groups.append((slot, heading, recs))
        if before:
            avg = None
        else:
            core = sub[sub.cwl_slot == "CORE"]["final_score"].dropna()
            avg = core.mean() if len(core) else float("nan")
        panels[clan] = (groups, avg)

    pw = (CANVAS_W - 2 * MARGIN - (len(CLAN_ORDER) - 1) * PANEL_GAP) // len(CLAN_ORDER)
    tallest = max(panel_height(g) for g, _ in panels.values())
    canvas_h = MARGIN + TITLE_BLOCK + tallest + FOOTER_GAP + FOOTER_H + MARGIN

    img = Image.new("RGB", (CANVAS_W, canvas_h), BG)
    draw = ImageDraw.Draw(img)

    tw = draw.textlength(args.title, font=fonts["title"])
    draw.text(((CANVAS_W - tw) / 2, MARGIN + 6), args.title,
              font=fonts["title"], fill=TITLE_BLUE)
    sub = ("MEMBERSHIP BEFORE MOVES" if before
           else f"MEMBERSHIP AFTER MOVES  —  {args.date}")
    sw = draw.textlength(sub, font=fonts["subtitle"])
    draw.text(((CANVAS_W - sw) / 2, MARGIN + 92), sub,
              font=fonts["subtitle"], fill=SUBTITLE)
    ly = MARGIN + 144
    draw.line([MARGIN + 40, ly, CANVAS_W - MARGIN - 40, ly], fill=(38, 56, 84), width=2)

    py = MARGIN + TITLE_BLOCK
    for i, clan in enumerate(CLAN_ORDER):
        groups, avg = panels[clan]
        subtitle = "AS IT STANDS TODAY" if before else CLAN_STATUS.get(clan, "")
        draw_panel(img, draw, MARGIN + i * (pw + PANEL_GAP), py, pw,
                   clan, groups, avg, subtitle, fonts, charset)

    fy = py + tallest + FOOTER_GAP
    rounded(draw, [MARGIN, fy, CANVAS_W - MARGIN, fy + FOOTER_H], 12,
            outline=CLAN_COLORS["Flakes"], width=2)
    line1 = "LEGEND"
    w1 = draw.textlength(line1, font=fonts["foot_b"])
    draw.text(((CANVAS_W - w1) / 2, fy + 18), line1, font=fonts["foot_b"], fill=WHITE)
    legend = [("ACTIVE", (39,174,96),   "warring with a usable record"),
              ("THIN",   (52,130,190),  "too few attacks to judge"),
              ("HIGH MISS", (211,120,32), "misses over 20% of attacks"),
              ("INACTIVE", (88,96,112), "no war in three weeks or more")]
    seg = [draw.textlength(f"  {t}", font=fonts["note"]) + 
           draw.textlength(l, font=fonts["pill"]) + 14 + 26 for l, _, t in legend]
    x = (CANVAS_W - sum(seg)) / 2
    cy = fy + 62
    for (label, colour, text), width in zip(legend, seg):
        x += draw_pill(draw, x, cy, label, fonts, colour) + 8
        draw.text((x, cy - 11), text, font=fonts["note"], fill=DIM)
        x += draw.textlength(text, font=fonts["note"]) + 26

    img.save(args.out)
    print(f"wrote {args.out}  ({CANVAS_W}x{canvas_h})")
    for clan in CLAN_ORDER:
        groups, avg = panels[clan]
        detail = " ".join(f"{s}:{len(r)}" for s, _, r in groups)
        tot = sum(len(r) for _, _, r in groups)
        print(f"  {clan:7s} {tot:3d} members  ({detail})")


if __name__ == "__main__":
    main()
