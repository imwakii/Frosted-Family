import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
from streamlit_sortables import sort_items

# ── Page config ────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Frosted Family CWL",
    page_icon="❄️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Constants ──────────────────────────────────────────────────────────────────
CLAN_COLORS = {"Fire": "#FF6B35", "Cake": "#4A90D9", "Flakes": "#7B68EE"}
CORE_SIZES  = {"Fire": 15, "Cake": 15, "Flakes": 30}
CLAN_ICONS  = {"Fire": "🔥", "Cake": "🎂", "Flakes": "🥣"}

# Discrete colour map — sampled directly from the official TH legend asset
TH_COLOR_MAP = {
    "7":  "#8D5E2E",  # TH7  — warm brown
    "8":  "#614631",  # TH8  — dark brown
    "9":  "#31353D",  # TH9  — slate grey
    "10": "#731C18",  # TH10 — crimson
    "11": "#8D8C95",  # TH11 — silver grey
    "12": "#18446F",  # TH12 — navy blue
    "13": "#1F7886",  # TH13 — teal
    "14": "#21745B",  # TH14 — forest green
    "15": "#4B4360",  # TH15 — deep purple
    "16": "#9F8836",  # TH16 — golden yellow
    "17": "#2D3D4F",  # TH17 — steel blue-grey
    "18": "#5D89A2",  # TH18 — sky blue
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
    "moved":          st.column_config.TextColumn("Move", width="small"),
}

# ── Data ───────────────────────────────────────────────────────────────────────
@st.cache_data
def load_data() -> pd.DataFrame:
    df = pd.read_csv("frosted_cwl_members.csv", index_col="row")
    for c in ["flag_high_miss", "flag_ltd_data", "flag_no_data", "flag_prev_data"]:
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

# ── Sandbox helpers ────────────────────────────────────────────────────────────
def _fmt(name: str) -> str:
    """Format a player name into a sortable item string: 'Name (TH18) 124'"""
    rows = df_full[df_full["name"] == name]
    if rows.empty:
        return f"{name} (TH?) —"
    r   = rows.iloc[0]
    th  = int(r["current_th"]) if pd.notna(r.get("current_th")) else "?"
    sc  = r.get("final_score", np.nan)
    sc_str = f"{sc:.0f}" if pd.notna(sc) else "—"
    return f"{name} (TH{th}) {sc_str}"

def _parse(item: str) -> str:
    """Extract player name from item string 'Name (TH18) 124'"""
    return item.split(" (TH")[0]

def _init_sandbox():
    """Populate session_state with the official allocation order."""
    for clan in ["Fire", "Cake", "Flakes"]:
        clan_df  = df_full[df_full["clan"] == clan].copy()
        core     = clan_df[clan_df["cwl_slot"] == "CORE"].sort_values("final_score", ascending=False)
        subs     = clan_df[clan_df["cwl_slot"] != "CORE"].sort_values("final_score", ascending=False)
        ordered  = pd.concat([core, subs])
        st.session_state[f"sb_{clan}"] = [_fmt(n) for n in ordered["name"]]

def _sandbox_df(result: list) -> pd.DataFrame:
    """Build a working DataFrame from sort_items result."""
    records = []
    for entry in result:
        raw_clan = entry["header"]
        clan     = raw_clan.split(" ")[1].replace("🔥","Fire").replace("🎂","Cake").replace("🥣","Flakes")
        # strip emoji from header to get clan name
        for k in ["Fire","Cake","Flakes"]:
            if k in raw_clan:
                clan = k
                break
        core_size = CORE_SIZES[clan]
        for i, item in enumerate(entry["items"]):
            name = _parse(item)
            slot = "CORE" if i < core_size else "SUB"
            match = df_full[df_full["name"] == name]
            if not match.empty:
                row = match.iloc[0].to_dict()
                row["sb_clan"] = clan
                row["sb_slot"] = slot
                records.append(row)
    return pd.DataFrame(records) if records else pd.DataFrame()

def _core_avg(df: pd.DataFrame, clan_col: str = "clan", slot_col: str = "cwl_slot") -> dict:
    """Return {clan: avg_final} for CORE players."""
    out = {}
    for clan in ["Fire", "Cake", "Flakes"]:
        vals = df.loc[
            (df[clan_col] == clan) & (df[slot_col] == "CORE"), "final_score"
        ].dropna()
        out[clan] = vals.mean() if not vals.empty else float("nan")
    return out

# ── Sidebar ────────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("## ❄️ Frosted Family")
    st.markdown("CWL Planning Dashboard")
    st.divider()

    st.subheader("Filters")
    sel_clans = st.multiselect("Clan",     ["Fire","Cake","Flakes"], default=["Fire","Cake","Flakes"])
    sel_slots = st.multiselect("CWL Slot", ["CORE","SUB","TUNDRA"],  default=["CORE","SUB"])
    th_min    = int(df_full["current_th"].min())
    th_max    = int(df_full["current_th"].max())
    th_range  = st.slider("TH Range", th_min, th_max, (th_min, th_max))

    st.divider()
    st.subheader("Hide flagged")
    hide_hm  = st.checkbox("Hide HM (miss >20%)",  value=False)
    hide_nd  = st.checkbox("Hide ND (no war data)", value=False)
    hide_ltd = st.checkbox("Hide LTD (<10 atks)",   value=False)

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

# ── Helper: shared display_table ──────────────────────────────────────────────
def display_table(data: pd.DataFrame, height: int = 420, extra_cols: list | None = None):
    cols = DISPLAY_COLS + (extra_cols or [])
    cols = [c for c in cols if c in data.columns]
    show = data[cols].reset_index(drop=True)
    show.index += 1
    st.dataframe(show, column_config=COL_CFG, use_container_width=True, height=height)

# ── Tabs ───────────────────────────────────────────────────────────────────────
tab_ov, tab_ros, tab_exp, tab_ch, tab_th, tab_sb = st.tabs([
    "📊 Overview", "🏠 Rosters", "🔍 Explorer",
    "📈 Charts",   "🏗️ TH Directory", "🧪 Sandbox",
])

# ════════════════════════════════════════════════════════════════════════════════
# OVERVIEW
# ════════════════════════════════════════════════════════════════════════════════
with tab_ov:
    st.subheader("Clan Snapshot")

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
    with st.expander("📐 How scores are calculated", expanded=False):
        st.markdown("""
**Every player gets three numbers — Offense, Defense, and Final (= Offense + Defense).**

---

**Offense** asks: *how reliably does this player 3-star their attacks?*

| Ingredient | Role |
|---|---|
| **3-star rate** | Core signal — what fraction of attacks ended in 3 stars |
| **Miss penalty** `(1 − miss%)` | Discounts every wasted attack |
| **Confidence** `min(atks ÷ 25, 1)` | Scales down players with fewer than 25 tracked attacks |
| **TH attack mult** `1 + 0.05 × (target TH − player TH)` | ±5% bonus/penalty for punching up or down |

`Offense = 3★% × (1 − miss%) × confidence × TH_atk_mult × 100`

---

**Defense** asks: *how hard is this base to crack, and does TH level back it up?*

| Ingredient | Role |
|---|---|
| **Stars conceded** `(3 − avg stars) ÷ 3 × 100` | Fewer stars given up = higher score |
| **Def confidence** `min(def_count ÷ 20, 1)` | Same reliability idea as attack confidence |
| **TH def mult** `1 + 0.05 × (current TH − 15)` | TH18 ×1.15 · TH17 ×1.10 · TH15 ×1.00 · TH14 ×0.95 |

`Defense = base_defense × def_confidence × TH_def_mult`

---

**Final = Offense + Defense** · Elite: 110+ · Solid core: 80–110 · Borderline: 50–80
        """)

# ════════════════════════════════════════════════════════════════════════════════
# ROSTERS  (always uses df_full — shows official plan)
# ════════════════════════════════════════════════════════════════════════════════
with tab_ros:
    for clan, fmt_str in [("Fire","15v15"), ("Cake","15v15"), ("Flakes","30v30")]:
        cdf  = df_full[df_full["clan"] == clan].copy()
        slot_rank = {"CORE":0, "SUB":1, "TUNDRA":2}
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
        top25 = plot_base.nlargest(25,"final_score").sort_values("final_score")
        fig_b = px.bar(top25, x="final_score", y="name", orientation="h",
                       color="clan", color_discrete_map=CLAN_COLORS,
                       hover_data={"offense_score":":.1f","defense_score":":.1f",
                                   "cwl_slot":True,"clan":False,"name":False},
                       labels={"final_score":"Final Score","name":""})
        fig_b.update_layout(height=560, showlegend=False,
                            yaxis_tickfont_size=9, margin=dict(l=0,t=10))
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

# ════════════════════════════════════════════════════════════════════════════════
# SANDBOX
# ════════════════════════════════════════════════════════════════════════════════
with tab_sb:
    st.subheader("Roster Sandbox")
    st.caption(
        "Drag players between clans to explore hypothetical allocations. "
        "The first **15 / 15 / 30** players in each list count as the CWL core. "
        "No rules are enforced — free-form exploration only. "
        "Resets automatically when you close this tab or start a new session."
    )

    # ── Initialise (once per session) ────────────────────────────────────────
    if not all(f"sb_{c}" in st.session_state for c in ["Fire","Cake","Flakes"]):
        _init_sandbox()

    reset_col, _ = st.columns([1,5])
    with reset_col:
        if st.button("🔄 Reset to official", use_container_width=True):
            _init_sandbox()
            st.rerun()

    st.divider()

    # ── Sortable containers ───────────────────────────────────────────────────
    for clan in ["Fire","Cake","Flakes"]:
        n = len(st.session_state[f"sb_{clan}"])
        core_cnt = min(CORE_SIZES[clan], n)
        st.session_state[f"sb_{clan}_header"] = (
            f"{CLAN_ICONS[clan]} {clan}  —  top {core_cnt} = CORE  ({n} total)"
        )

    containers = [
        {"header": st.session_state["sb_Fire_header"],   "items": st.session_state["sb_Fire"]},
        {"header": st.session_state["sb_Cake_header"],   "items": st.session_state["sb_Cake"]},
        {"header": st.session_state["sb_Flakes_header"], "items": st.session_state["sb_Flakes"]},
    ]

    result = sort_items(
        containers,
        multi_containers=True,
        direction="horizontal",
        key="sandbox_main",
    )

    # Persist new order
    for i, clan in enumerate(["Fire","Cake","Flakes"]):
        st.session_state[f"sb_{clan}"] = result[i]["items"]

    # ── Build sandbox DataFrame ───────────────────────────────────────────────
    sb_df = _sandbox_df(result)

    if sb_df.empty:
        st.warning("Sandbox is empty — hit Reset to reload the official allocation.")
        st.stop()

    # ── Comparison metrics ────────────────────────────────────────────────────
    st.divider()
    st.subheader("Sandbox vs Official")

    off_avgs = _core_avg(df_full, "clan", "cwl_slot")
    sb_avgs  = _core_avg(sb_df,   "sb_clan", "sb_slot")

    mc1, mc2, mc3 = st.columns(3)
    for col, clan in [(mc1,"Fire"), (mc2,"Cake"), (mc3,"Flakes")]:
        off_v = off_avgs.get(clan, float("nan"))
        sb_v  = sb_avgs.get(clan,  float("nan"))
        delta = sb_v - off_v if not (np.isnan(sb_v) or np.isnan(off_v)) else None
        delta_str = f"{delta:+.1f}" if delta is not None else None
        with col:
            st.metric(
                label=f"{CLAN_ICONS[clan]} {clan} — Core Avg",
                value=f"{sb_v:.1f}" if not np.isnan(sb_v) else "—",
                delta=delta_str,
            )
            sb_core_n = ((sb_df["sb_clan"]==clan)&(sb_df["sb_slot"]=="CORE")).sum()
            st.caption(f"Official: {off_v:.1f}  ·  Sandbox core size: {sb_core_n}")

    # ── Changes table ─────────────────────────────────────────────────────────
    merged = sb_df[["name","sb_clan","sb_slot"]].merge(
        df_full[["name","clan","cwl_slot","current_th","final_score"]],
        on="name", how="left"
    )
    changed = merged[merged["sb_clan"] != merged["clan"]].copy()

    if changed.empty:
        st.info("No players have moved from the official allocation yet.")
    else:
        st.markdown(f"#### {len(changed)} player{'s' if len(changed)>1 else ''} moved")
        ch_show = changed.rename(columns={
            "name":"Name","clan":"Official Clan","sb_clan":"Sandbox Clan",
            "cwl_slot":"Official Slot","sb_slot":"Sandbox Slot",
            "current_th":"TH","final_score":"Final",
        })[["Name","TH","Final","Official Clan","Official Slot","Sandbox Clan","Sandbox Slot"]]
        ch_show = ch_show.reset_index(drop=True)
        ch_show.index += 1
        st.dataframe(ch_show, use_container_width=True)

    # ── Side-by-side clan tables ───────────────────────────────────────────────
    st.divider()
    st.markdown("#### Clan rosters — Official ↔ Sandbox")
    st.caption("Players who moved clans are marked with 🔄 in the Sandbox column.")

    for clan in ["Fire","Cake","Flakes"]:
        with st.expander(f"{CLAN_ICONS[clan]} {clan}", expanded=True):
            col_off, col_sb = st.columns(2)

            # Official side
            off_clan = df_full[df_full["clan"]==clan].copy()
            off_clan["_sr"] = off_clan["cwl_slot"].map({"CORE":0,"SUB":1,"TUNDRA":2}).fillna(3)
            off_clan = off_clan.sort_values(["_sr","final_score"], ascending=[True,False]).drop(columns="_sr")
            with col_off:
                st.markdown("**Official**")
                display_table(off_clan, height=min(80+len(off_clan)*35, 550))

            # Sandbox side — add move indicator
            moved_names = set(changed["name"].tolist())
            sb_clan = sb_df[sb_df["sb_clan"]==clan].copy()
            sb_clan["_sr"] = sb_clan["sb_slot"].map({"CORE":0,"SUB":1}).fillna(2)
            sb_clan = sb_clan.sort_values(["_sr","final_score"], ascending=[True,False]).drop(columns="_sr")
            sb_clan = sb_clan.rename(columns={"sb_clan":"clan","sb_slot":"cwl_slot"})
            sb_clan["moved"] = sb_clan["name"].apply(lambda n: "🔄" if n in moved_names else "")
            with col_sb:
                st.markdown("**Sandbox**")
                display_table(sb_clan, height=min(80+len(sb_clan)*35, 550), extra_cols=["moved"])
