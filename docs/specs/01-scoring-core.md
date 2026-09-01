# 01 — Scoring core

The allocation score, the data-quality flags, and the activity tiers. This file
is the specification; `frosted/scoring.py` and `frosted/tiering.py` are the
implementation, and `tests/` is the check that they agree. Read the formula here
rather than inferring it from the CSV.

Everything below is deterministic. None of it requires judgment. Judgment starts
where this file stops: which player lands in which clan and slot.

---

## The score

**Offence.** Three-star rate, discounted for missed attacks and for thin data,
adjusted for how far above or below their own level the player was attacking.

```
offense = three_star_pct/100
        × (1 − miss_pct/100)
        × min(attack_count / 25, 1)
        × (1 + 0.05 × th_attack_diff)
        × 100
```

**Defence.** Stars withheld, on the same 0–100 footing, weighted by defence
volume and by how much punishment the town hall invites.

```
defense = (3 − avg_stars_conceded) / 3 × 100
        × min(defense_count / 20, 1)
        × (1 + 0.05 × (current_th − 15))
```

**Final score** is the unweighted sum. There is no third term and no tie-break.

### Input definitions that are easy to get wrong

| Field | Definition |
|---|---|
| `attack_count` | Attacks actually **made**. Misses are not included. |
| `miss_count` | Attacks **not** taken. |
| war slots | `attack_count + miss_count`. Attacks *available*. |
| `miss_pct` | `miss_count / war_slots`, not `miss_count / attack_count`. Waki's 4 misses on 98 attacks report 3.92%, which is 4/102. |
| `three_star_pct` | Three-stars / `attack_count`. Denominator is attacks made, **not** slots. |
| `th_attack_diff` | Average TH of targets − own TH. Negative means punching down. |

### Why the confidence weights are load-bearing

`min(count/cap, 1)` exists to stop a player with five attacks and a hot streak
from outranking a proven player with sixty. It is the single most important term
for making the ranking trustworthy.

It has a consequence that shapes everything else: **any short-window analysis is
crushed by it**, because a thirty-day window yields far fewer than 25 attacks.
This is why recency must never be folded into the main score. If a form
indicator is wanted, it belongs beside the score as a separate signal, never as
a term inside it.

It is also why a short export is dangerous rather than merely inaccurate. In
July 2026 one clan's war-statistics export covered roughly four weeks while the
other two covered four months. Every player in that clan was deflated: Hallelou
read 18.6 instead of 105.2, and the clan's reliable pool read as 3 players
instead of 37. **The output looked plausible rather than broken.**
`frosted/ingest.py` therefore refuses to score a cycle whose six exports
disagree, rather than warning about it.

---

## Flags

| Flag | Condition |
|---|---|
| `flag_high_miss` | `miss_pct` **strictly greater than** 20 |
| `flag_ltd_data` | `attack_count` between 1 and 9 inclusive |
| `flag_no_data` | no war-statistics row exists at all |

`flag_no_data` is deliberately distinct from a row showing zero attacks. A player
who never appeared and a player who appeared and did nothing are different
situations that happen to produce the same score.

**Open question — zero-attack players.** Ten players have zero attacks and a
100% miss rate. They score 0.0 and are *not* flagged as limited-data, because
that flag requires at least one attack. They therefore sort identically to a
player who attacked and genuinely scored zero. Unresolved; the tests pin the
current behaviour so a change is deliberate rather than accidental.

---

## Activity tiers

A player is **PROVEN** only if all three hold:

- warred within **21 days** of the reference date
- at least **10 war slots**
- at most **20%** of attacks missed

Failing any one drops them into a tier naming the first condition failed:

| Precedence | Tier | Condition | Poster label |
|---|---|---|---|
| 1 | `NO DATA` | no war-statistics row | INACTIVE |
| 2 | `DORMANT` | idle > 45 days | INACTIVE |
| 3 | `LAPSING` | idle > 21 days | INACTIVE |
| 4 | `UNRELIABLE (HM)` | miss > 20% | HIGH MISS |
| 5 | `THIN RECORD` | war slots < 10 | THIN |
| 6 | `PROVEN` | all gates pass | ACTIVE |

**The reference date is the most recent war anyone in the family fought**, taken
from the data rather than the wall clock, so re-running an old cycle reproduces
its tiers exactly. For the September 2026 cycle that is 2026-08-27.

### Why this precedence, and what it disagrees with

Idle-first, deliberately: once a record is stale, everything computed from it is
stale too, so "hasn't warred in two months" is more useful to show than a miss
rate measured before they stopped.

This ordering is **a decision, not a recovered fact.** The September 2026
diagnostic labelled `twistedtiger` (34 days idle, 27% miss) INACTIVE and
`Bigmon` (62 days idle, 60% miss) HIGH MISS. No single linear precedence
produces both. Under the order above, twistedtiger matches the published poster
and Bigmon is relabelled INACTIVE.

There is one rule that fits both: rank by *how far past its threshold* each
breach is, and report the worst. Bigmon's miss is 3.0× its limit against 1.4×
for idle; twistedtiger's idle is 1.6× against 1.4× for miss. It reproduces the
September output exactly, but it was almost certainly a coincidence of two data
points rather than a rule anyone implemented, and it makes a player's label
depend on a ratio nobody can compute in their head. Not adopted. Recorded here
so the option is not rediscovered from scratch.

The `DORMANT` / `LAPSING` split at 45 days is a chosen value, roughly 1.5 CWL
cycles. Both display as INACTIVE, so it affects internal reporting only.

---

## Reproducibility

`tests/test_reproducibility.py` asks two separate questions, and keeping them
apart is the point.

1. **Does the stored score follow from the stored inputs?** Recomputed from the
   roster's own columns. Independent of which export the roster came from. This
   is the guard against the formula being quietly changed, and it passes to a
   maximum error of 0.075, which is 2dp rounding.

2. **Does the archived export rebuild the roster?** Currently `xfail`. The
   committed roster was built on 30 August from a pull that was never archived;
   `data/raw/2026-09/` holds the 27 August pull. Waki reads 100 attacks in the
   roster and 98 in the export. This is **snapshot drift, not formula drift** —
   question 1 passing is what proves it. From the 2026-10 cycle,
   `build_cycle.py` writes a `manifest.md` recording the export it consumed, and
   this becomes a strict assert.

**If either fails, do not tune the formula to make it pass.** Report the players
whose scores differ, with both values, and stop.
