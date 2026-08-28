import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go

# ── Page config ────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Frosted Family CWL",
    page_icon="❄️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Theme tokens ───────────────────────────────────────────────────────────────
CLAN_COLORS  = {"Fire": "#FF6B35", "Cake": "#4A90D9", "Flakes": "#7B68EE"}
SLOT_COLORS  = {"CORE": "#27AE60", "SUB": "#E67E22", "Sitting Out": "#95A5A6"}
SCORE_MAX    = {"offense_score": 120, "defense_score": 50, "final_score": 175}

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
    "offense_score":  st.column_config.ProgressColumn(
        "Offense", format="%.1f", min_value=0, max_value=SCORE_MAX["offense_score"]
    ),
    "defense_score":  st.column_config.ProgressColumn(
        "Defense", format="%.1f", min_value=0, max_value=SCORE_MAX["defense_score"]
    ),
    "final_score":    st.column_config.ProgressColumn(
        "Final", format="%.1f", min_value=0, max_value=SCORE_MAX["final_score"]
    ),
    "flags":          st.column_config.TextColumn("Flags", width="small"),
}

# ── Data ───────────────────────────────────────────────────────────────────────
@st.cache_data
def load_data() -> pd.DataFrame:
    df = pd.read_csv("frosted_cwl_members.csv", index_col="row")
    bool_cols = ["flag_high_miss", "flag_ltd_data", "flag_no_data", "flag_prev_data"]
    for c in bool_cols:
        df[c] = df[c].fillna(False).astype(bool)
    num_cols = ["offense_score", "defense_score", "final_score",
                "current_th", "avg_war_th", "attack_count",
                "three_star_pct", "miss_pct", "th_attack_diff"]
    for c in num_cols:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df["transferred_from"] = df["transferred_from"].fillna("")
    df["flags"] = df["flags"].fillna("")
    return df

try:
    df_full = load_data()
except FileNotFoundError:
    st.error("⚠️ `frosted_cwl_members.csv` not found. Place it in the same directory as `app.py`.")
    st.stop()

# ── Helpers ────────────────────────────────────────────────────────────────────
def core_avg(df: pd.DataFrame) -> float:
    vals = df.loc[df["cwl_slot"] == "CORE", "final_score"].dropna()
    return vals.mean() if not vals.empty else float("nan")

def display_table(df: pd.DataFrame, height: int = 420):
    show = df[DISPLAY_COLS].reset_index(drop=True)
    show.index += 1
    st.dataframe(show, column_config=COL_CFG, use_container_width=True, height=height)

# ── Sidebar ────────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("## ❄️ Frosted Family")
    st.markdown("CWL Planning Dashboard")
    st.divider()

    st.subheader("Filters")
    sel_clans = st.multiselect(
        "Clan", ["Fire", "Cake", "Flakes"], default=["Fire", "Cake", "Flakes"]
    )
    sel_slots = st.multiselect(
        "CWL Slot", ["CORE", "SUB", "Sitting Out"], default=["CORE", "SUB"]
    )
    th_min = int(df_full["current_th"].min())
    th_max = int(df_full["current_th"].max())
    th_range = st.slider("TH Range", th_min, th_max, (th_min, th_max))

    st.divider()
    st.subheader("Hide flagged players")
    hide_hm  = st.checkbox("Hide HM (miss >20%)", value=False)
    hide_nd  = st.checkbox("Hide ND (no war data)",  value=False)
    hide_ltd = st.checkbox("Hide LTD (<10 attacks)", value=False)

    mask = (
        df_full["clan"].isin(sel_clans)
        & df_full["cwl_slot"].isin(sel_slots)
        & df_full["current_th"].between(th_range[0], th_range[1])
    )
    if hide_hm:  mask &= ~df_full["flag_high_miss"]
    if hide_nd:  mask &= ~df_full["flag_no_data"]
    if hide_ltd: mask &= ~df_full["flag_ltd_data"]

    df = df_full[mask].copy()

    st.divider()
    st.caption(f"Showing **{len(df)}** of **{len(df_full)}** members")

# ── Tabs ───────────────────────────────────────────────────────────────────────
tab_ov, tab_ros, tab_exp, tab_ch, tab_th = st.tabs([
    "📊 Overview",
    "🏠 Rosters",
    "🔍 Explorer",
    "📈 Charts",
    "🏗️ TH Directory",
])

# ════════════════════════════════════════════════════════════════════════════════
# TAB 1 — OVERVIEW
# ════════════════════════════════════════════════════════════════════════════════
with tab_ov:
    st.subheader("Clan Snapshot")
    c_fire, c_cake, c_flakes = st.columns(3)

    for col, clan, icon, fmt in [
        (c_fire,   "Fire",   "🔥", "15v15"),
        (c_cake,   "Cake",   "🎂", "15v15"),
        (c_flakes, "Flakes", "🥣", "not in CWL"),
    ]:
        clan_df  = df_full[df_full["clan"] == clan]
        core_df  = clan_df[clan_df["cwl_slot"] == "CORE"]
        avg_fin  = core_df["final_score"].dropna().mean()
        avg_off  = core_df["offense_score"].dropna().mean()
        avg_def  = core_df["defense_score"].dropna().mean()
        n_total  = len(clan_df)
        n_core   = len(core_df)

        with col:
            st.markdown(f"### {icon} {clan} · {fmt}")
            st.metric("Core avg (Final)", f"{avg_fin:.1f}" if not np.isnan(avg_fin) else "—")
            m1, m2 = st.columns(2)
            m1.metric("Offense", f"{avg_off:.1f}" if not np.isnan(avg_off) else "—")
            m2.metric("Defense", f"{avg_def:.1f}" if not np.isnan(avg_def) else "—")
            st.caption(f"{n_core} CWL core · {n_total} total members")

            bar_df = core_df.dropna(subset=["final_score"]).sort_values("final_score")
            if not bar_df.empty:
                fig = px.bar(
                    bar_df,
                    x="final_score", y="name", orientation="h",
                    color_discrete_sequence=[CLAN_COLORS[clan]],
                    labels={"final_score": "", "name": ""},
                    hover_data={"offense_score": ":.1f", "defense_score": ":.1f",
                                "current_th": True, "cwl_slot": False,
                                "name": False, "final_score": ":.1f"},
                )
                fig.update_layout(
                    height=350, margin=dict(l=0, r=10, t=4, b=0),
                    showlegend=False, yaxis_tickfont_size=9,
                    xaxis_title="Final Score",
                )
                st.plotly_chart(fig, use_container_width=True)

    st.divider()

    # Scoring formula card
    with st.expander("📐 How scores are calculated", expanded=False):
        st.markdown("""
**Every player gets three numbers — Offense, Defense, and Final (= Offense + Defense).**

---

**Offense Score** answers: *how reliably does this player 3-star their attacks?*

| Ingredient | Role |
|---|---|
| **3-star rate** | Core signal — what fraction of attacks ended in 3 stars |
| **Miss penalty** `(1 − miss%)` | Discounts the score for every wasted attack |
| **Confidence** `min(atks ÷ 25, 1)` | Scales down players with fewer than 25 tracked attacks |
| **TH attack multiplier** `1 + 0.05 × (target TH − player TH)` | Modest ±5% bonus/penalty for attacking above or below your level |

`Offense = 3★% × (1 − miss%) × confidence × TH_atk_mult × 100`

---

**Defense Score** answers: *how hard is this base to crack, and does the TH level back it up?*

| Ingredient | Role |
|---|---|
| **Stars conceded** `(3 − avg stars) ÷ 3 × 100` | Fewer stars given up = higher score |
| **Defense confidence** `min(def_count ÷ 20, 1)` | Same data-reliability idea as attack confidence |
| **TH defense multiplier** `1 + 0.05 × (current TH − 15)` | TH18 ×1.15 · TH17 ×1.10 · TH15 ×1.00 · TH14 ×0.95 … |

`Defense = base_defense × def_confidence × TH_def_mult`

---

**Final = Offense + Defense** — both components are shown in every table.

Typical ranges: Elite = 110 + · Solid core = 80–110 · Borderline = 50–80
        """)

# ════════════════════════════════════════════════════════════════════════════════
# TAB 2 — ROSTERS
# ════════════════════════════════════════════════════════════════════════════════
with tab_ros:
    for clan, icon, fmt in [
        ("Fire",   "🔥", "15v15"),
        ("Cake",   "🎂", "15v15"),
        ("Flakes", "🥣", "not in CWL"),
    ]:
        clan_df = df_full[df_full["clan"] == clan].copy()
        # Sort: CORE first (by score), then SUB (by score), then Sitting Out
        slot_rank = {"CORE": 0, "SUB": 1, "Sitting Out": 2}
        clan_df["_sr"] = clan_df["cwl_slot"].map(slot_rank).fillna(3)
        clan_df = clan_df.sort_values(["_sr", "final_score"], ascending=[True, False]).drop(columns="_sr")

        n_core = (clan_df["cwl_slot"] == "CORE").sum()
        n_sub  = (clan_df["cwl_slot"] == "SUB").sum()
        avg    = core_avg(clan_df)
        avg_lbl = "—" if np.isnan(avg) else f"{avg:.1f}"

        with st.expander(
            f"{icon} Frosted {clan} — {fmt} · core avg **{avg_lbl}** · "
            f"{n_core} core / {n_sub} subs",
            expanded=True,
        ):
            display_table(clan_df, height=min(80 + len(clan_df) * 35, 700))

# ════════════════════════════════════════════════════════════════════════════════
# TAB 3 — EXPLORER
# ════════════════════════════════════════════════════════════════════════════════
with tab_exp:
    st.subheader("Member Explorer")

    search_col, sort_col, order_col = st.columns([3, 2, 1])
    with search_col:
        search = st.text_input("Search by name", placeholder="Type a player name…")
    with sort_col:
        sort_by = st.selectbox(
            "Sort by",
            ["final_score", "offense_score", "defense_score",
             "current_th", "attack_count", "three_star_pct", "miss_pct"],
            index=0,
        )
    with order_col:
        ascending = st.checkbox("Asc", value=False)

    exp_df = df.copy()
    if search:
        exp_df = exp_df[exp_df["name"].str.contains(search, case=False, na=False)]

    exp_df = exp_df.sort_values(sort_by, ascending=ascending)
    st.caption(f"{len(exp_df)} members")
    display_table(exp_df, height=600)

    dl = exp_df[DISPLAY_COLS].to_csv(index=False)
    st.download_button("⬇️ Download this view as CSV", dl, "frosted_filtered.csv", "text/csv")

# ════════════════════════════════════════════════════════════════════════════════
# TAB 4 — CHARTS
# ════════════════════════════════════════════════════════════════════════════════
with tab_ch:
    plot_df = df_full[df_full["cwl_slot"].isin(["CORE", "SUB"])].dropna(
        subset=["offense_score", "defense_score"]
    ).copy()

    # 1. Offense vs Defense scatter — full width
    st.markdown("#### Offense vs Defense")
    st.caption("Bubble size = TH level · Shape = CWL slot · Colour = Clan")

    fig_s = px.scatter(
        plot_df,
        x="offense_score", y="defense_score",
        color="clan", symbol="cwl_slot",
        size="current_th", size_max=16,
        hover_name="name",
        hover_data={
            "final_score":    ":.1f",
            "current_th":     True,
            "attack_count":   True,
            "three_star_pct": ":.1f",
            "miss_pct":       ":.1f",
            "clan":           False,
            "cwl_slot":       False,
        },
        color_discrete_map=CLAN_COLORS,
        symbol_map={"CORE": "circle", "SUB": "diamond"},
        labels={"offense_score": "Offense Score", "defense_score": "Defense Score"},
    )
    fig_s.update_layout(height=480, legend_title_text="", margin=dict(t=10))
    st.plotly_chart(fig_s, use_container_width=True)

    left, right = st.columns(2)

    # 2. Top 25 final score bar
    with left:
        st.markdown("#### Top 25 by Final Score")
        top25 = (
            plot_df
            .nlargest(25, "final_score")
            .sort_values("final_score")
        )
        fig_b = px.bar(
            top25, x="final_score", y="name", orientation="h",
            color="clan", color_discrete_map=CLAN_COLORS,
            hover_data={"offense_score": ":.1f", "defense_score": ":.1f",
                        "cwl_slot": True, "clan": False, "name": False},
            labels={"final_score": "Final Score", "name": ""},
        )
        fig_b.update_layout(
            height=550, showlegend=False,
            yaxis_tickfont_size=9, margin=dict(l=0, t=10),
        )
        st.plotly_chart(fig_b, use_container_width=True)

    with right:
        # 3. Score distribution box per clan
        st.markdown("#### Final Score Distribution")
        fig_box = px.box(
            plot_df, x="clan", y="final_score",
            color="clan", color_discrete_map=CLAN_COLORS,
            points="all",
            hover_data={"name": True, "cwl_slot": True, "final_score": ":.1f",
                        "clan": False},
            labels={"final_score": "Final Score", "clan": ""},
        )
        fig_box.update_layout(height=290, showlegend=False, margin=dict(t=10))
        st.plotly_chart(fig_box, use_container_width=True)

        # 4. TH distribution
        st.markdown("#### TH Distribution by Clan")
        th_dist = (
            df_full.groupby(["clan", "current_th"])
            .size()
            .reset_index(name="count")
            .dropna(subset=["current_th"])
        )
        th_dist["current_th"] = th_dist["current_th"].astype(int)
        fig_th = px.bar(
            th_dist, x="current_th", y="count", color="clan",
            barmode="group", color_discrete_map=CLAN_COLORS,
            labels={"current_th": "TH Level", "count": "Members", "clan": ""},
        )
        fig_th.update_layout(height=260, margin=dict(t=10), legend_title_text="")
        st.plotly_chart(fig_th, use_container_width=True)

# ════════════════════════════════════════════════════════════════════════════════
# TAB 5 — TH DIRECTORY
# ════════════════════════════════════════════════════════════════════════════════
with tab_th:
    st.subheader("Members by TH Level")
    st.caption("Within each TH tier, ranked by Final Score.")

    th_levels = sorted(
        df_full["current_th"].dropna().unique().astype(int), reverse=True
    )

    for th in th_levels:
        th_df = (
            df_full[df_full["current_th"] == th]
            .sort_values("final_score", ascending=False)
        )
        n_core = (th_df["cwl_slot"] == "CORE").sum()
        avg    = th_df["final_score"].dropna().mean()
        label  = (
            f"TH{th} — {len(th_df)} members"
            + (f" · {n_core} in CWL core" if n_core else "")
            + (f" · avg {avg:.1f}" if not np.isnan(avg) else "")
        )

        with st.expander(label, expanded=(th == th_levels[0])):
            display_table(th_df, height=min(80 + len(th_df) * 35, 600))
