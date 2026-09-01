"""Read a cycle's six clashspot exports into one tag-keyed frame.

Six files per cycle, a members file and a war-statistics file per clan, living
in data/raw/<cycle>/. Nothing downstream reads them; everything downstream reads
frosted_cwl_members.csv.

`tag` is the primary key throughout. Player tags are immutable; display names
are not. #20G28UPQG went from `Jules` to `juna the zealot` between the July and
September exports, and a name-keyed join reads that as one departure plus one
arrival. Never join on name.
"""

from pathlib import Path

import pandas as pd

from . import config as cfg

# raw column -> canonical column
WAR_COLUMNS = {
    "Tag": "tag",
    "Name": "name",
    "Date last war": "date_last_war",
    "Average TH": "avg_war_th",
    "Attack: count": "attack_count",
    "Attack: Average TH of targets": "avg_target_th",
    "Attack: % of 3 Stars": "three_star_pct",
    "Attack: Miss attacks": "miss_count",
    "Attack: % of Miss attacks": "miss_pct",
    "Defense: count": "defense_count",
    "Defense: Average Stars": "avg_stars_conceded",
}
MEMBER_COLUMNS = {"Tag": "tag", "Name": "name", "TH": "current_th", "Role": "role"}

MAX_PULL_DATE_SPREAD_DAYS = 3
MIN_ATTACK_CEILING_RATIO = 0.5


class WindowMismatch(Exception):
    """The six exports do not describe the same period, so they cannot be scored.

    This is the July 2026 failure mode. Cake's war-statistics had been pulled
    over roughly 1-28 July while Fire and Flakes covered April through July. The
    short window deflated every Cake player through the confidence weight:
    Hallelou read 18.6 instead of 105.2, and Cake's reliable pool read as 3
    players instead of 37. The output looked plausible rather than broken, which
    is exactly why this refuses to score rather than warning.
    """


def cycle_dir(cycle, root="data/raw"):
    d = Path(root) / cycle
    if not d.is_dir():
        raise FileNotFoundError(f"No export folder at {d}")
    return d


def _clan_of(path):
    tag = "#" + path.name.split("-")[0]
    try:
        return cfg.TAG_TO_CLAN[tag]
    except KeyError:
        raise ValueError(f"{path.name} does not start with a known clan tag; "
                         f"expected one of {sorted(cfg.TAG_TO_CLAN)}")


def read_cycle(cycle, root="data/raw", check_window=True):
    """Return one row per player across all three clans, keyed on tag."""
    d = cycle_dir(cycle, root)
    members = {_clan_of(p): pd.read_csv(p) for p in sorted(d.glob("*-members.csv"))}
    wars = {_clan_of(p): pd.read_csv(p) for p in sorted(d.glob("*-war-statistics.csv"))}

    missing = set(cfg.CLAN_TAGS) - set(members) | set(cfg.CLAN_TAGS) - set(wars)
    if missing:
        raise FileNotFoundError(
            f"{d} is missing exports for: {', '.join(sorted(missing))}. "
            "A cycle needs a members file and a war-statistics file per clan.")

    if check_window:
        verify_window(wars)

    frames = []
    for clan in members:
        m = members[clan][list(MEMBER_COLUMNS)].rename(columns=MEMBER_COLUMNS)
        w = wars[clan][list(WAR_COLUMNS)].rename(columns=WAR_COLUMNS)
        # left join: a member with no war-statistics row is NO DATA, which is
        # distinct from a row showing zero attacks.
        j = m.merge(w.drop(columns=["name"]), on="tag", how="left")
        j["clan"] = clan
        frames.append(j)

    df = pd.concat(frames, ignore_index=True)
    df["th_attack_diff"] = df["avg_target_th"] - df["current_th"]
    df["flag_no_data"] = df["date_last_war"].isna()
    return df


def window_summary(wars):
    """Per-clan pull date and attack ceiling, the two things that reveal a short
    export. Returned separately so callers can print it."""
    rows = []
    for clan, w in wars.items():
        last = pd.to_datetime(w["Date last war"], errors="coerce")
        rows.append({
            "clan": clan,
            "pull_date": last.max(),
            "earliest_war": last.min(),
            "attack_ceiling": w["Attack: count"].quantile(0.90),
            "players": len(w),
        })
    return pd.DataFrame(rows).sort_values("clan").reset_index(drop=True)


def verify_window(wars):
    """Raise WindowMismatch unless all six exports describe the same period."""
    s = window_summary(wars)

    spread = (s["pull_date"].max() - s["pull_date"].min()).days
    if spread > MAX_PULL_DATE_SPREAD_DAYS:
        raise WindowMismatch(
            f"Exports were pulled {spread} days apart (limit "
            f"{MAX_PULL_DATE_SPREAD_DAYS}). Re-export the stale clans.\n"
            + s.to_string(index=False))

    ceiling, median = s["attack_ceiling"], s["attack_ceiling"].median()
    if median > 0 and (ceiling.min() / median) < MIN_ATTACK_CEILING_RATIO:
        low = s.loc[ceiling.idxmin(), "clan"]
        raise WindowMismatch(
            f"{low}'s export covers a much shorter period than the others "
            f"({ceiling.min():.0f} attacks at the 90th percentile against a family "
            f"median of {median:.0f}). Every {low} player would be deflated through "
            "the confidence weight and the scores would look plausible rather than "
            "broken. Re-export " + low + " over the full window.\n"
            + s.to_string(index=False))
    return s
