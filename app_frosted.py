import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px

# ── Page config ────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Frosted Family CWL",
    page_icon="❄️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Constants ──────────────────────────────────────────────────────────────────
CLAN_COLORS = {"Fire": "#FF6B35", "Cake": "#4A90D9", "Flakes": "#7B68EE"}
CLAN_ICONS  = {"Fire": "🔥", "Cake": "🎂", "Flakes": "🥣"}

# Discrete colour map — sampled from the official TH legend, then brightened
TH_COLOR_MAP = {
    "7":  "#E07100",  # TH7  — warm brown
    "8":  "#9B5A28",  # TH8  — dark brown
    "9":  "#444E61",  # TH9  — slate grey
    "10": "#B80800",  # TH10 — crimson
    "11": "#CECCE0",  # TH11 — silver grey
    "12": "#0059B1",  # TH12 — navy blue
    "13": "#00B9D6",  # TH13 — teal
    "14": "#00B981",  # TH14 — forest green
    "15": "#675499",  # TH15 — deep purple
    "16": "#E0AF02",  # TH16 — golden yellow
    "17": "#2C537E",  # TH17 — steel blue-grey
    "18": "#51ACE0",  # TH18 — sky blue
}

DISPLAY_COLS = [
    "name", "clan", "cwl_slot", "current_th", "attack_count",
    "three_star_pct", "miss_pct", "th_attack_diff",
    "offense_score", "defense_score", "final_score", "flags",
]

COL_CFG = {
    "name":           st.column_config.TextColumn("Name", width="medium"),
    "clan":           st.column_config.TextColumn("Clan", width="small"),
    "cwl_slot":       st.column_config.TextColumn("Slot", width="small"),
    "current_th":     st.column_config.NumberColumn("TH", format="%d", width="small"),
    "attack_count":   st.column_config.NumberColumn("Atks", format="%d", width="small"),
    "three_star_pct": st.column_config.NumberColumn("3★%", format="%.1f", width="small"),
    "miss_pct":       st.column_config.NumberColumn("Miss%", format="%.1f", width="small"),
    "th_attack_diff": st.column_config.NumberColumn("TH Δ", format="%.2f", width="small"),
    "offense_score":  st.column_config.ProgressColumn("Offense", format="%.1f", min_value=0, max_value=120),
    "defense_score":  st.column_config.ProgressColumn("Defense", format="%.1f", min_value=0, max_value=50),
    "final_score":    st.column_config.ProgressColumn("Final",   format="%.1f", min_value=0, max_value=175),
    "flags":          st.column_config.TextColumn("Flags", width="small"),
}

# ── Data ───────────────────────────────────────────────────────────────────────
@st.cache_data
def load_data() -> pd.DataFrame:
    df = pd.read_csv("frosted_cwl_members.csv", index_col="row")
    for c in ["flag_high_miss", "flag_ltd_data", "flag_no_data", "flag_prev_data", "flag_alt"]:
        df[c] = df[c].fillna(False).astype(bool)
    for c in ["offense_score", "defense_score", "final_score",
              "current_th", "avg_war_th", "attack_count",
              "three_star_pct", "miss_pct", "th_attack_diff"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df["transferred_from"] = df["transferred_from"].fillna("")
    df["flags"]            = df["flags"].fillna("")
    # TH as string for categorical scatter
    df["th_str"] = df["current_th"].dropna().astype(int).astype(str)
    return df

try:
    df_full = load_data()
except FileNotFoundError:
    st.error("⚠️ `frosted_cwl_members.csv` not found — place it alongside `app.py`.")
    st.stop()

# ── Sidebar ────────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("## ❄️ Frosted Family")
    st.markdown("CWL Planning Dashboard")
    st.divider()

    st.subheader("Filters")
    sel_clans = st.multiselect("Clan",     ["Fire","Cake","Flakes"], default=["Fire","Cake","Flakes"])
    sel_slots = st.multiselect(
        "CWL Slot", ["CORE","SUB","Sitting Out"], default=["CORE","SUB"]
    )
    th_min    = int(df_full["current_th"].min())
    th_max    = int(df_full["current_th"].max())
    th_range  = st.slider("TH Range", th_min, th_max, (th_min, th_max))

    st.divider()
    st.subheader("Hide flagged")
    hide_hm  = st.checkbox("Hide HM (miss >20%)",  value=False)
    hide_nd  = st.checkbox("Hide ND (no war data)", value=False)
    hide_ltd = st.checkbox("Hide LTD (<10 atks)",   value=False)
    hide_alt = st.checkbox("Hide ALT (alt accounts)", value=False)

    mask = (
        df_full["clan"].isin(sel_clans)
        & df_full["cwl_slot"].isin(sel_slots)
        & df_full["current_th"].between(th_range[0], th_range[1])
    )
    if hide_hm:  mask &= ~df_full["flag_high_miss"]
    if hide_nd:  mask &= ~df_full["flag_no_data"]
    if hide_ltd: mask &= ~df_full["flag_ltd_data"]
    if hide_alt: mask &= ~df_full["flag_alt"]

    df = df_full[mask].copy()
    st.divider()
    st.caption(f"Showing **{len(df)}** of **{len(df_full)}** members")

# ── Helper: shared display_table ──────────────────────────────────────────────
def display_table(data: pd.DataFrame, height: int = 420, extra_cols: list | None = None):
    cols = DISPLAY_COLS + (extra_cols or [])
    cols = [c for c in cols if c in data.columns]
    show = data[cols].reset_index(drop=True)
    show.index += 1
    st.dataframe(show, column_config=COL_CFG, use_container_width=True, height=height)

# ── Tabs ───────────────────────────────────────────────────────────────────────
tab_ov, tab_ros, tab_exp, tab_ch, tab_th = st.tabs([
    "📊 Overview", "🏠 Rosters", "🔍 Explorer",
    "📈 Charts",   "🏗️ TH Directory",
])

# ════════════════════════════════════════════════════════════════════════════════
# OVERVIEW
# ════════════════════════════════════════════════════════════════════════════════
with tab_ov:
    st.subheader("Clan Snapshot")
    st.caption(
        "Data source: stats pulled from **clashspot.net**, covering "
        "**1 March 2026 – 10 June 2026**."
    )

    c_f, c_c, c_fl = st.columns(3)
    for col, clan, fmt_str in [(c_f,"Fire","15v15"), (c_c,"Cake","15v15"), (c_fl,"Flakes","30v30")]:
        cdf  = df[df["clan"] == clan]   # filtered
        core = cdf[cdf["cwl_slot"] == "CORE"]
        avg_fin = core["final_score"].dropna().mean()
        avg_off = core["offense_score"].dropna().mean()
        avg_def = core["defense_score"].dropna().mean()
        with col:
            st.markdown(f"### {CLAN_ICONS[clan]} {clan} · {fmt_str}")
            st.metric("Core avg (Final)",  f"{avg_fin:.1f}" if not np.isnan(avg_fin) else "—")
            m1, m2 = st.columns(2)
            m1.metric("Offense", f"{avg_off:.1f}" if not np.isnan(avg_off) else "—")
            m2.metric("Defense", f"{avg_def:.1f}" if not np.isnan(avg_def) else "—")
            n_core  = len(df_full[(df_full["clan"]==clan)&(df_full["cwl_slot"]=="CORE")])
            n_total = len(df_full[df_full["clan"]==clan])
            st.caption(f"{n_core} CWL core · {n_total} total · showing {len(cdf)} after filters")
            bar = core.dropna(subset=["final_score"]).sort_values("final_score")
            if not bar.empty:
                fig = px.bar(bar, x="final_score", y="name", orientation="h",
                             color_discrete_sequence=[CLAN_COLORS[clan]],
                             labels={"final_score":"", "name":""},
                             hover_data={"offense_score":":.1f","defense_score":":.1f",
                                         "current_th":True,"final_score":":.1f",
                                         "name":False})
                fig.update_layout(height=340, margin=dict(l=0,r=6,t=4,b=0),
                                  showlegend=False, yaxis_tickfont_size=9,
                                  xaxis_title="Final Score")
                st.plotly_chart(fig, use_container_width=True)

    st.divider()

    # ── Transfer Log ──────────────────────────────────────────────────────────
    st.subheader("🔁 Transfers This Cycle")
    transfers = df_full[df_full["transferred_from"] != ""].copy()
    tk = df_full[df_full["cwl_slot"] == "Sitting Out"]

    rows = []
    if not transfers.empty:
        for (src, dst), grp in transfers.groupby(["transferred_from", "clan"]):
            rows.append({"From → To": f"{src} → {dst}", "Players": ", ".join(grp["name"])})
    for _, r in tk.iterrows():
        rows.append({"From → To": f"{r['clan']} → Sitting Out", "Players": r["name"]})

    if rows:
        st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)
    else:
        st.caption("No transfers recorded.")

    st.divider()
    with st.expander("📐 How scores are calculated", expanded=False):
        st.markdown("""
Each player is given three numbers: an **Offense Score**, a **Defense Score**, and a
**Final Score** (which is just the two added together). All three are visible in every
table so you can see exactly what is driving someone's ranking.

---

### Offense Score

> *How reliably does this player get 3 stars when they attack?*

The Offense Score is built from three ingredients multiplied together, then scaled to a 0–100 base:

**1. Three-star rate** — the percentage of attacks where the player got all three stars.
This is the core of the score. A player getting 80% three-stars is clearly more valuable
than one getting 50%.

**2. Miss penalty** — `(1 − miss rate)`. A missed attack is a wasted attack. If a player
misses 20% of their attacks, only 80% of their effort is actually contributing. This term
directly discounts the score for every missed attack.

**3. Confidence weight** — `min(attack count ÷ 25, 1.0)`. A player who went 3-for-3 looks
like 100% three-star rate, but three attacks tells us very little. This weight scales the
score down for small sample sizes — a player with 5 attacks only gets 20% confidence,
while someone with 25+ attacks gets full credit. It prevents players with almost no data
from appearing elite.

Put together: `Offense = 3★% × (1 − miss%) × confidence × 100`

A perfect offense score of 100 means: 100% three-star rate, 0% miss rate, 25+ attacks.

**4. TH attack multiplier** — `1 + 0.05 × (avg target TH − player's avg TH)`. This adjusts
the Offense Score upward if a player consistently attacks bases *above* their own TH level,
and downward if they attack below it. Attacking a higher TH base is genuinely harder — a
TH16 player consistently three-starring TH17 bases is more impressive than the same rate
at equal level. The effect is intentionally modest: each full TH level of difference
adjusts the score by ±5%.

> **Example:** A TH18 player attacking TH18 targets → multiplier ≈ 1.0, no change. A TH16
> in Flakes who attacks TH17 targets → multiplier ≈ 1.05, a 5% bonus.

---

### Defense Score

> *How hard is this player's base to crack, and does their TH level support that?*

The Defense Score has the same structure as Offense — a base rate, a confidence weight,
and a TH multiplier:

**1. Stars conceded rate** — `(3 − avg stars conceded) ÷ 3 × 100`. If a player's base gives
up an average of 1.5 stars per defense, their base score is `(3 − 1.5) ÷ 3 × 100 = 50`.
Giving up 0 stars every time scores 100; being three-starred every time scores 0. Note
that in practice almost everyone concedes between 2.0–2.9 stars, so most raw defense
scores sit in the 5–35 range — defense scores are naturally lower than offense scores.

**2. Defense confidence weight** — `min(defense count ÷ 20, 1.0)`. Same logic as for
attacks: a player who has only been defended against twice doesn't give us reliable data.

**3. TH defense multiplier** — `1 + 0.05 × (current TH − 15)`. A TH18 base is structurally
harder to three-star than a TH15 base, regardless of layout. We reward higher-TH players
in the defense score to reflect this: TH18 gets a ×1.15 boost, TH17 gets ×1.10, TH15 is
neutral at ×1.00, and lower THs get a slight penalty. This is why you generally want TH18s
over TH17s in a Masters CWL roster even when their attack stats look similar.

> **Example:** Two players both concede 2.5 stars per defense with 20 defenses each. The
> TH18 scores `(0.5÷3 × 100) × 1.0 × 1.15 = 19.2`. The TH17 scores
> `(0.5÷3 × 100) × 1.0 × 1.10 = 18.3`. Small difference, but it accumulates across the
> roster.

---

### Final Score

> *The complete picture.*

`Final = Offense + Defense`

Both components are additive and both are shown, so you can always see the breakdown. A
player with a great attack record but a leaky base will show high Offense and low Defense.
A TH18 who also defends well will have both numbers elevated. The Final Score is what
determines ranking within each clan.

Typical ranges in this pool:
- **Elite:** Final 110+
- **Solid core:** Final 80–110
- **Borderline:** Final 50–80
- **Weak / needs monitoring:** Final below 50

---

**Flags:** HM = miss rate >20% · LTD = fewer than 10 attacks · ND = no war data ·
prev = prior-season data · **ALT = alt account — always a SUB regardless of score**,
so the main account gets the CWL slot.
        """)

# ════════════════════════════════════════════════════════════════════════════════
# ROSTERS  (always uses df_full — shows full roster plan)
# ════════════════════════════════════════════════════════════════════════════════
with tab_ros:
    for clan, fmt_str in [("Fire","15v15"), ("Cake","15v15"), ("Flakes","30v30")]:
        cdf  = df_full[df_full["clan"] == clan].copy()
        slot_rank = {"CORE":0, "SUB":1, "Sitting Out":2}
        cdf["_sr"] = cdf["cwl_slot"].map(slot_rank).fillna(3)
        cdf = cdf.sort_values(["_sr","final_score"], ascending=[True,False]).drop(columns="_sr")
        n_core = (cdf["cwl_slot"]=="CORE").sum()
        n_sub  = (cdf["cwl_slot"]=="SUB").sum()
        avg    = cdf.loc[cdf["cwl_slot"]=="CORE","final_score"].dropna().mean()
        with st.expander(
            f"{CLAN_ICONS[clan]} Frosted {clan} — {fmt_str}  ·  "
            f"core avg **{avg:.1f}**  ·  {n_core} core / {n_sub} subs",
            expanded=True
        ):
            display_table(cdf, height=min(80 + len(cdf)*35, 700))

# ════════════════════════════════════════════════════════════════════════════════
# EXPLORER  (filtered)
# ════════════════════════════════════════════════════════════════════════════════
with tab_exp:
    st.subheader("Member Explorer")
    srch_col, sort_col, ord_col = st.columns([3,2,1])
    with srch_col:
        search = st.text_input("Search by name", placeholder="Type a player name…")
    with sort_col:
        sort_by = st.selectbox("Sort by",
            ["final_score","offense_score","defense_score",
             "current_th","attack_count","three_star_pct","miss_pct"], index=0)
    with ord_col:
        asc = st.checkbox("Asc", value=False)

    exp_df = df.copy()
    if search:
        exp_df = exp_df[exp_df["name"].str.contains(search, case=False, na=False)]
    exp_df = exp_df.sort_values(sort_by, ascending=asc)
    st.caption(f"{len(exp_df)} members")
    display_table(exp_df, height=600)
    st.download_button("⬇️ Download this view",
                       exp_df[DISPLAY_COLS].to_csv(index=False),
                       "frosted_filtered.csv", "text/csv")

# ════════════════════════════════════════════════════════════════════════════════
# CHARTS  (filtered, TH scatter with toggle)
# ════════════════════════════════════════════════════════════════════════════════
with tab_ch:
    plot_base = df[df["cwl_slot"].isin(["CORE","SUB"])].dropna(subset=["offense_score","defense_score"]).copy()
    plot_base["th_str"] = plot_base["current_th"].dropna().astype(int).astype(str)

    # ── Offense vs Defense scatter — TH coloured ──────────────────────────────
    st.markdown("#### Offense vs Defense by TH Level")

    all_ths = sorted(plot_base["th_str"].dropna().unique(), key=lambda x: -int(x))
    sel_ths = st.multiselect(
        "Toggle TH levels", all_ths, default=all_ths,
        format_func=lambda x: f"TH{x}"
    )
    scatter_df = plot_base[plot_base["th_str"].isin(sel_ths)]

    th_order   = [str(t) for t in sorted([int(x) for x in all_ths], reverse=True)]
    fig_s = px.scatter(
        scatter_df,
        x="offense_score", y="defense_score",
        color="th_str",
        color_discrete_map=TH_COLOR_MAP,
        category_orders={"th_str": th_order},
        size="current_th", size_max=16,
        hover_name="name",
        hover_data={
            "final_score":":.1f", "current_th":True,
            "attack_count":True, "three_star_pct":":.1f", "miss_pct":":.1f",
            "clan":True, "cwl_slot":True, "th_str":False,
        },
        labels={"offense_score":"Offense Score","defense_score":"Defense Score","th_str":"TH Level"},
    )
    fig_s.update_layout(height=500, legend_title_text="TH Level", margin=dict(t=10))
    st.plotly_chart(fig_s, use_container_width=True)

    left, right = st.columns(2)

    with left:
        st.markdown("#### Top 25 by Final Score")
        # Highest score first (top of chart), still coloured by clan.
        top25 = plot_base.nlargest(25, "final_score").sort_values("final_score", ascending=False)
        name_order = top25["name"].tolist()
        fig_b = px.bar(top25, x="final_score", y="name", orientation="h",
                       color="clan", color_discrete_map=CLAN_COLORS,
                       category_orders={"name": name_order},
                       hover_data={"offense_score":":.1f","defense_score":":.1f",
                                   "cwl_slot":True,"clan":False,"name":False},
                       labels={"final_score":"Final Score","name":""})
        fig_b.update_layout(height=560, showlegend=True,
                            yaxis_tickfont_size=9, margin=dict(l=0,t=10),
                            legend_title_text="")
        st.plotly_chart(fig_b, use_container_width=True)

    with right:
        st.markdown("#### Final Score Distribution")
        fig_box = px.box(plot_base, x="clan", y="final_score",
                         color="clan", color_discrete_map=CLAN_COLORS,
                         points="all",
                         hover_data={"name":True,"cwl_slot":True,"final_score":":.1f","clan":False},
                         labels={"final_score":"Final Score","clan":""})
        fig_box.update_layout(height=290, showlegend=False, margin=dict(t=10))
        st.plotly_chart(fig_box, use_container_width=True)

        st.markdown("#### TH Distribution by Clan")
        th_dist = (df_full.groupby(["clan","current_th"]).size()
                   .reset_index(name="count").dropna(subset=["current_th"]))
        th_dist["current_th"] = th_dist["current_th"].astype(int)
        fig_th = px.bar(th_dist, x="current_th", y="count", color="clan",
                        barmode="group", color_discrete_map=CLAN_COLORS,
                        labels={"current_th":"TH Level","count":"Members","clan":""})
        fig_th.update_layout(height=260, margin=dict(t=10), legend_title_text="")
        st.plotly_chart(fig_th, use_container_width=True)

# ════════════════════════════════════════════════════════════════════════════════
# TH DIRECTORY  (filtered)
# ════════════════════════════════════════════════════════════════════════════════
with tab_th:
    st.subheader("Members by TH Level")
    st.caption("Within each TH tier, ranked by Final Score.  Filters from the sidebar apply.")
    th_levels = sorted(df["current_th"].dropna().unique().astype(int), reverse=True)
    for th in th_levels:
        th_df  = df[df["current_th"] == th].sort_values("final_score", ascending=False)
        n_core = (th_df["cwl_slot"]=="CORE").sum()
        avg    = th_df["final_score"].dropna().mean()
        label  = (f"TH{th} — {len(th_df)} members"
                  + (f" · {n_core} in CWL core" if n_core else "")
                  + (f" · avg {avg:.1f}" if not np.isnan(avg) else ""))
        with st.expander(label, expanded=(th == th_levels[0])):
            display_table(th_df, height=min(80 + len(th_df)*35, 600))
