#!/usr/bin/env python
"""Turn a cycle's six raw exports into the canonical roster.

    python build_cycle.py --cycle 2026-10
    python build_cycle.py --cycle 2026-10 --dry-run

Computes what can be computed and carries forward what cannot. The machine owns
scores, flags and tiers; Ka Wai owns `clan`, `cwl_slot` and `transferred_from`.
Those three are copied from the previous roster and never inferred, adjusted or
"improved" -- which player lands in which clan and slot depends on co-leader
status, retention risk and who actually moves when told, none of which is in the
data.

New players arrive with `clan` set to the clan they are physically sitting in
and `cwl_slot` blank, waiting for a decision.
"""

import argparse
import sys
from pathlib import Path

import pandas as pd

from frosted import ingest, scoring, tiering

# Columns Ka Wai owns. Carried forward on tag, never computed.
HUMAN_COLUMNS = ["cwl_slot", "transferred_from", "flag_prev_data", "flag_alt"]

COLUMN_ORDER = [
    "row", "tag", "name", "clan", "cwl_slot", "transferred_from",
    "current_th", "avg_war_th", "attack_count", "three_star_pct", "miss_pct",
    "th_attack_diff", "offense_score", "defense_score", "final_score",
    "flag_high_miss", "flag_ltd_data", "flag_no_data", "flag_prev_data",
    "flags", "flag_alt", "tier",
]
ROUND_2DP = ["avg_war_th", "three_star_pct", "miss_pct", "th_attack_diff",
             "offense_score", "defense_score", "final_score"]


def build(cycle, roster_path, root="data/raw"):
    """Return (new_roster, report). Pure apart from reading; writes nothing."""
    scored = tiering.add_tiers(
        scoring.add_flags(scoring.add_scores(ingest.read_cycle(cycle, root=root))))

    prev = pd.read_csv(roster_path)
    prev["tag"] = prev["tag"].fillna("").astype(str)

    report = {"adopted": [], "renamed": [], "arrived": [], "departed": [],
              "moved_score": [], "lost_tagless": []}

    # Tagless rows in the previous roster are players who joined after the last
    # export was pulled. Adopt their tag by name, once, and say so -- a name
    # match is a guess and it is the caller's job to see it.
    tagless = prev[prev["tag"] == ""]
    by_name = scored.drop_duplicates("name").set_index("name")["tag"]
    for i, r in tagless.iterrows():
        if r["name"] in by_name.index:
            prev.at[i, "tag"] = by_name[r["name"]]
            report["adopted"].append((r["name"], by_name[r["name"]]))

    carried = prev.set_index("tag")[HUMAN_COLUMNS + ["name", "final_score", "clan"]]
    carried = carried[~carried.index.duplicated()]

    new = scored.merge(carried.add_prefix("prev_"), left_on="tag",
                       right_index=True, how="left")

    for c in HUMAN_COLUMNS:
        new[c] = new["prev_" + c]
    new["cwl_slot"] = new["cwl_slot"].fillna("")
    new["transferred_from"] = new["transferred_from"].fillna("")

    known = new["prev_name"].notna()
    report["renamed"] = [(a, b, t) for a, b, t in
                         zip(new.loc[known, "prev_name"], new.loc[known, "name"],
                             new.loc[known, "tag"]) if a != b]
    report["arrived"] = new.loc[~known, ["tag", "name", "clan", "current_th"]].to_dict("records")
    gone = carried[~carried.index.isin(new["tag"])]
    report["departed"] = [{"tag": t, "name": r["name"], "clan": r["clan"]}
                          for t, r in gone.iterrows() if t]

    # A row that still has no tag could not be matched to this export at all, so
    # we cannot say whether the player left or simply was not in the pull. Never
    # let one disappear quietly: it may be a CORE placement.
    report["lost_tagless"] = prev.loc[prev["tag"] == "",
                                      ["name", "clan", "cwl_slot"]].to_dict("records")

    delta = (new["final_score"] - new["prev_final_score"]).abs()
    big = new[delta > 10]
    report["moved_score"] = [
        {"name": r["name"], "was": r["prev_final_score"], "now": r["final_score"]}
        for _, r in big.iterrows() if pd.notna(r["prev_final_score"])]

    new = new.sort_values("final_score", ascending=False, na_position="last").reset_index(drop=True)
    new["row"] = range(1, len(new) + 1)
    for c in ROUND_2DP:
        new[c] = pd.to_numeric(new[c], errors="coerce").round(2)
    return new[COLUMN_ORDER], report


def manifest(cycle, wars_summary, roster_path, n):
    return (
        f"# Cycle {cycle} raw exports\n\n"
        f"Six clashspot.net exports, one members file and one war-statistics file\n"
        f"per clan. Consumed by `build_cycle.py --cycle {cycle}` to produce\n"
        f"`{roster_path}` ({n} players). Recorded at build time so the export that\n"
        f"produced a roster is never in doubt.\n\n"
        f"```\n{wars_summary.to_string(index=False)}\n```\n\n"
        f"`pull_date` is the most recent war anyone fought and doubles as the\n"
        f"cycle's reference date for idle-day and tier calculations.\n"
    )


def print_report(rep, cycle):
    def section(title, items, fmt):
        print(f"\n{title} ({len(items)})")
        if not items:
            print("  none")
        for x in items[:40]:
            print("  " + fmt(x))
        if len(items) > 40:
            print(f"  ... and {len(items) - 40} more")

    print(f"\n{'=' * 62}\nCycle {cycle}\n{'=' * 62}")
    section("Tags adopted by name match -- VERIFY THESE", rep["adopted"],
            lambda x: f"{x[0]} -> {x[1]}")
    section("Renames detected by tag", rep["renamed"],
            lambda x: f"{x[0]} -> {x[1]}  ({x[2]})")
    section("Arrivals", rep["arrived"],
            lambda x: f"{x['name']:22s} {x['clan']:7s} TH{x['current_th']}  {x['tag']}")
    section("Departures", rep["departed"],
            lambda x: f"{x['name']:22s} {x['clan']:7s} {x['tag']}")
    section("Score moved more than 10 points", rep["moved_score"],
            lambda x: f"{x['name']:22s} {x['was']:6.1f} -> {x['now']:6.1f}")
    section("Untagged and not in this export -- DROPPED, decide manually",
            rep["lost_tagless"],
            lambda x: f"{x['name']:22s} {x['clan']:7s} {x['cwl_slot'] or '(no slot)'}")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cycle", required=True, help="folder under data/raw, e.g. 2026-10")
    ap.add_argument("--roster", default="frosted_cwl_members.csv")
    ap.add_argument("--root", default="data/raw")
    ap.add_argument("--dry-run", action="store_true", help="report without writing")
    args = ap.parse_args()

    try:
        new, rep = build(args.cycle, args.roster, args.root)
    except ingest.WindowMismatch as e:
        print(f"REFUSING TO SCORE\n\n{e}", file=sys.stderr)
        return 2

    print_report(rep, args.cycle)
    blank = (new["cwl_slot"] == "").sum()
    print(f"\n{len(new)} players. {blank} awaiting a CWL slot.")

    if args.dry_run:
        print("\n--dry-run: nothing written.")
        return 0

    new.to_csv(args.roster, index=False)
    d = Path(args.root) / args.cycle
    wars = {ingest._clan_of(p): pd.read_csv(p) for p in d.glob("*-war-statistics.csv")}
    (d / "manifest.md").write_text(
        manifest(args.cycle, ingest.window_summary(wars), args.roster, len(new)),
        encoding="utf-8")
    print(f"\nWrote {args.roster} and {d / 'manifest.md'}.")
    print("Allocation is yours: fill cwl_slot for anyone blank, then run the posters.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
