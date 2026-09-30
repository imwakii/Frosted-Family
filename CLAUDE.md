# Frosted Family CWL

Data pipeline and dashboard for monthly Clan War League roster allocation across a three-clan Clash of Clans family. Ka Wai (in-game: Waki) runs the family and is the sole decision authority on allocation.

## Critical constraints

**Never push to `main`.** This repo auto-deploys to https://frosted-family.streamlit.app on push, and that URL is printed on the roster poster handed to ~100 clan members. Work on a branch, verify locally, and stop. Ka Wai merges.

**Never commit working artefacts.** `*_pool_diagnostic.csv`, `*_move_checklist.csv`, `*_moves.md` and anything else naming who is being benched or pruned stay out of the repo. They go stale within days and they publish decisions that are not meant to be public. What belongs here: `frosted_cwl_members.csv`, `app_frosted.py`, `build_cycle.py`, the two poster scripts, the `frosted/` package, `tests/`, `docs/`, `data/raw/`, and the two requirements files. `archive/` holds past posters, superseded rosters and ad-hoc exports; it lives on disk and is git-ignored.

**Allocation is a human decision.** Which player lands in which clan and slot is Ka Wai's call, informed by things absent from the data: co-leader status, retention risk, who actually moves when told to. Never infer, adjust, or "improve" `clan`, `cwl_slot`, or `transferred_from`. Compute scores, surface implications, stop.

The standing constraints he has already settled -- the one-way valve, Maki's lock, TH18-first and its exceptions, move sequencing against the 50 cap, and why Cake's demotion is deliberate -- are in `docs/specs/02-allocation-rules.md`. Read it before proposing any move, and do not re-litigate what it records as settled or promote what it records as open.

**Ten rows have no `tag`.** They joined Cake between the 27 August export pull and the 30 August roster build, so they appear in no archived export and their tags cannot be recovered. `build_cycle.py` adopts a tag for them by name match on the next cycle and reports each one for verification. Until then it also reports them as dropped rather than losing them silently -- one of them, `rudra`, is a Cake CORE placement.

## Domain glossary

**The three clans.** Fire (`#CL0G80LV`), flagship, Champion 3, TH18-only. Cake (`#20CU2R80R`), Champion 3, expected to demote to Masters 1. Flakes (`#2JJYV0JVV`), currently sitting out CWL, used as a recruiting and holding pen.

**TH** is town hall level, 7–18. Higher is stronger. TH18 is current max. A clan's CWL roster is sorted by strength, so TH18s are placed at the top of the war map and must attack the opponent's strongest bases. This is why a TH16 with a high score cannot fill a TH18 slot, and why benched players routinely outscore starters. It is not a bug in the model.

**CWL** runs seven consecutive war days once a month. Rosters are locked at sign-up.

**`cwl_slot`** is one of `CORE` (starting lineup), `SUB` (bench), or `Sitting Out` (in the clan, not on the roster). An older label `Turtle Kingdom` is retired and must not be reintroduced — it once caused a live bug where a player's row was silently unselectable across several app views.

**Alts** are secondary accounts. They compete on merit like any other account. An older rule forcing alts to `SUB` was retired in July 2026.

**Flakes sits out CWL by choice**, and Cake's expected demotion to Masters 1 is a deliberate two-tier outcome, not a failure. `docs/specs/02-allocation-rules.md` carries the reasoning and the roster evidence behind both.

## Data flow

Six raw exports from clashspot.net per cycle, one members file and one war-statistics file per clan, land in `data/raw/YYYY-MM/`. `build_cycle.py` ingests and scores them into `frosted_cwl_members.csv`, which is canonical and drives three consumers: `app_frosted.py`, `make_poster.py`, and `make_directory_poster.py`. Nothing downstream reads the raw exports.

`build_cycle.py` also writes `data/score_history.csv`: every cycle folder under `data/raw/` re-scored with today's formula, one row per player per cycle, keyed on tag and labelled with each player's latest name. The app's Trends tab reads it. Each export is a 3-to-4-month window and consecutive windows overlap, so a history point is a rolling score sampled monthly, not one month's form. `is_current_member` means present in the latest export.

**`data/raw/` folders are named by the cycle they fed, not by the month they were pulled.** These differ: the exports that produced the August roster were pulled on 27 July. Each folder carries a `manifest.md`, written by `build_cycle.py`, recording the pull date, the window and the roster it produced. Getting this wrong is how the archive became ambiguous in the first place.

**`tag` is the primary key.** Clash of Clans player tags (`#R2PPV8CL`) are immutable. Display names are not — `#20G28UPQG` went from `Jules` to `juna the zealot` between the July and September exports, and a name-keyed join reads that as one departure plus one arrival. Never join on `name`. Names also carry emoji, CJK, and occasional mojibake; the poster scripts strip unrenderable glyphs and carry a `NAME_ALIAS` map for cases like `ジェイ` → `Jay`.

**Verify all six exports share the same date window before scoring.** A short window on one clan silently deflates every player in it through the confidence weight, and the output looks plausible rather than broken. This happened once in July 2026: Hallelou read 18.6 instead of 105.2 and Cake's reliable pool read as 3 players instead of 37.

## Scoring

Fully deterministic. The formula, every flag threshold, and the activity tier rules are specified in `docs/specs/01-scoring-core.md` — read it there rather than inferring from the CSV. Scoring lives in `frosted/scoring.py` as pure functions: DataFrame in, DataFrame out, no I/O, no printing, no globals.

The confidence weights (attacks capped at 25, defenses at 20) are load-bearing. They stop a five-attack hot streak from outranking a proven sixty-attack record. A consequence worth knowing: any short-window analysis gets crushed by them, so recency must be a separate indicator and never a term in the main score.

`tests/test_reproducibility.py` asks two separate questions. `test_formula_self_consistency` recomputes the scores from the roster's own stored input columns and passes to within 0.075, which is rounding: this is the guard against the formula being quietly changed. `test_reproducible_from_raw` rebuilds from the archived exports and is currently `xfail`, because the committed roster was built from a pull that was never archived. That is snapshot drift, not formula drift, and the first test passing is what proves it. From the 2026-10 cycle the manifest records the export consumed and it becomes a strict assert.

**If either fails, do not tune the formula to make it pass.** Report the players whose scores differ, with both values, and stop.

## Commands

```bash
python build_cycle.py --cycle 2026-10   # six raw exports -> canonical roster
python build_cycle.py --cycle 2026-10 --dry-run   # report only, writes nothing
streamlit run app_frosted.py                   # dashboard
python -m pytest                        # all tests
python make_poster.py --csv frosted_cwl_members.csv --date "2 SEPTEMBER 2026" --time "18:00 UTC"
python make_directory_poster.py --csv frosted_cwl_members.csv --date "2 SEPTEMBER 2026"
```

`build_cycle.py` computes scores, flags and tiers, and carries `clan`, `cwl_slot` and `transferred_from` forward on tag. It never invents an allocation. Read its report before trusting the output: it names tags adopted by a name match, players it had to drop, and anyone whose score moved more than 10 points.

Both poster scripts have per-cycle config blocks at the top (`CLAN_FORMAT`, `CLAN_STATUS`) that change when leagues change on promotion or demotion. Palette and threshold constants live in `frosted/config.py` and must appear exactly once in the codebase.

Fonts resolve through `frosted/fonts.py`, which finds DejaVu Sans in the system font directory or in matplotlib's bundle. Do not reintroduce a hardcoded font path: the old `/usr/share/fonts/truetype/dejavu` made the posters unrenderable outside Linux. Rendered geometry depends on the exact font file, so it must stay DejaVu itself and not a lookalike.

## Conventions

Python, pandas, PIL for posters, plotly in the app. Prefer editing the existing poster scripts over rewriting them; the layout is tuned and matches published output. Ask before changing anything that alters rendered poster geometry, since posters are archived and compared cycle to cycle.

Surface decisions before making them. When a task touches a CORE/SUB line, a clan assignment, or a contradiction between the brief and the data, stop and ask. Formatting and cosmetic issues can be auto-resolved and mentioned in the summary.
