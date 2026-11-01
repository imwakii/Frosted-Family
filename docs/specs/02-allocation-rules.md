# 02 Allocation rules

Where `01-scoring-core.md` stops. That file is deterministic and needs no judgment; this one is the
standing judgment, the rules Ka Wai has already settled so they do not get re-litigated every cycle.

**These are constraints on allocation, not inputs to the score.** Nothing here is computed and
nothing here belongs in `frosted/`. `build_cycle.py` must still never invent an allocation.

Compiled 2026-09-03 from the June to September 2026 decision record, archived at
`Brain/raw/processed/2026-09-01-frosted-cwl-decision-record.md`. Each rule notes when it was set.

---

## Standing rules

**Maki is permanently locked to Cake CORE.** No exceptions and never re-opened. Predates the record.

**The one-way valve.** Fire members may not be moved to Cake. Flakes members may move directly to
either Fire or Cake. Set by Ka Wai at the end of the 28 August 2026 session, enforced for the first
time on 30 August when LOGAN moved Flakes to Fire and was held there as a SUB rather than being
redirected to fill Cake's open CORE slot. **The valve outranks filling an open slot**, which is
exactly the case it was tested on.

*Exception, October 2026 cycle:* the co-leaders chose proposal 2 and moved Death Eaters RS, DEATH
EATERS jr, Death Eaters 3 and Death Eaters 2 from Fire to Cake CORE. Ka Wai confirmed it on
29 September 2026 as a one-off override. It does not retire the valve.

**The four Death Eaters accounts are permanently Cake members.** Death Eaters RS, DEATH EATERS jr,
Death Eaters 3 and Death Eaters 2 stay in Cake and are no longer shown as transfers from Fire. Ka Wai's
call, 31 October 2026. Their CORE or SUB slot is still decided on merit each cycle.

*Exception, November 2026 cycle:* Ka Wai moved juna the great and wamr from Fire to Cake CORE on
31 October 2026, a one-off override. It does not retire the valve.

**Fire and Cake are TH18-first.** TH17s are retained only where their scores are too strong to
demote. Flakes is the catch-all for everyone below TH18, plus a small number of TH18 exceptions.
Active since the June 2026 cycle.

**Cake's bottom five CORE slots take the best available TH17s rather than weak TH18s.** Ka Wai's
explicit call, 28 August 2026. This is a deliberate exception to TH18-first, not a contradiction of
it.

**Move sequencing: Cake to Fire executes before Flakes to Cake.** The 50-member cap is a game
constraint, so moves that are each individually valid fail collectively if ordered wrong: Cake hits
the ceiling mid-transfer and the later moves silently do not happen. Discovered live in the
September cycle. **Restate this in every move checklist.**

Alt accounts compete on merit. That rule is already in `AGENTS.md` and is not repeated here.

---

## The two-tier structure, and why the demotion is deliberate

Decided 28 August 2026, accepted by Ka Wai. **Fire and Cake both run 15v15 in Champion 3. Flakes
sits out CWL entirely** and is retained as a recruiting and holding pen.

**Cake is expected to demote to Masters 1, and that is the intended outcome rather than a failure.**
Masters 1 is where Cake's roster quality actually sits, and it is also where the orphaned TH16 and
TH17 players belong. A deliberate drop produces a stable two-tier family from October. The
alternative was two mid-table finishes and the same structural problem again four weeks later.

This is the part most likely to be reversed by someone reading only the league table, so the
evidence behind it:

- The August mutiny cost 56 of 115 July names against 55 arrivals. Not a wash: of the 55 arrivals
  **only 11 were CWL-usable**. Cake took 27 recruits and got 5.
- 29 of 60 July CORE players were lost, including Cake's entire co-leader layer and 18 of Flakes' 30.
- **Only 44 players across the whole family met the PROVEN bar.** Three clans at 15v15 needs 45 CORE
  slots, so the family was one body short of filling three cores before a single substitute existed.

Headcount is not depth. Cake looked 43 deep and was 16 deep. Never read a recruiting number as
roster strength without the activity tiering from `01-scoring-core.md` applied.

---

## Named constraints are Ka Wai's to set, and they cost points

For the September cycle he required JayDogg, juna the great, Blaze, Calsedy and Pulkit to start in
Fire, and consolidated the Death family accounts into Cake.

Carrying Calsedy and Pulkit cost Fire 19.4 and 23.7 points against the best available alternatives.
Fire's merit-only ceiling was 97.9 against 94.4 with the instruction applied. He was told and the
call stood.

**The pattern to follow: compute the cost, state it once, then implement what he asked for.** These
constraints encode co-leader status, retention risk and who actually moves when told, none of which
is in the data.

---

## Removing members

Set by Ka Wai on 1 November 2026: "activity is number one indicator, followed by strength of the player.
players with weak heroes relative to their townhalls are first to go".

The site's make-room list (`GET /leaders/make-room?clan=`, `server/leaders.py`) orders each clan's members by
that rule. **It lists candidates and never removes anyone.** Who leaves is still Ka Wai's call.

1. **Activity first.** Members fall into four buckets by days without activity: 14 or more, 7 to 13, 3 to 6,
   then active. Activity comes from the hourly profile snapshots. Trophies do not count, and a donations
   reset at season end does not count. Where nothing has changed since tracking began, the days counted are
   a minimum, and they still decide the bucket.
2. **Then hero strength, weakest first.** A member's home hero levels, summed, as a percentage of the median
   sum among all current members of the three clans at the same town hall. With fewer than 3 members at
   that town hall, the comparison widens to TH-1 to TH+1, and its median is scaled by the ratio of summed
   hero max levels. The list marks these comparisons `thin`.
3. **Other reasons only break ties**, in this order: missed attacks in the last 14 days, a high miss rate,
   no donations this season, sitting out, new or unproven, below the clan's TH floor (TH18 in Fire, TH16 in
   Cake). They show as reasons beside each name.

---

## Members who leave, and members who come back

Set by Ka Wai on 1 November 2026: people who leave the clan should not appear in the allocations, and people who
leave and rejoin should be slotted back in where they were.

- **Leaving.** The server marks a player as gone once their clan's member polls have not shown them for 30 minutes.
  They drop out of the lineups, the Lineup builder and the publish checks (core count, the 50 cap) at once. Their row
  can then be removed from `frosted_cwl_members.csv`, and the posters re-rendered without them. Do not rewrite a
  departed player's slot to Sitting Out: that erased what they had.
- **Coming back.** Every collector pass records each player's allocation in `slot_memory`, which outlives their CSV
  row. A player who rejoins the clan they were allocated to is back in that slot at once, marked "Back" on Lineups.
  One who rejoins a different clan shows as New, with their old slot named in the suggestion.
- **A returning starter can make 16 CORE** if their place was filled while they were away. The builder's check shows
  it; which of the two starts is the leaders' call.

## Open, and not to be recorded as settled

**Variant B.** Proposed 28 August 2026, never adopted or rejected. Applying the one-way valve
produced an alternative pulling only RR and Grozbolt from Cake into Fire rather than five, keeping
Vadim, Chaengiiee and Hallelou in Cake, cutting total moves from 22 to 14 while marginally
improving Cake's core average. **Ka Wai did not confirm it. Do not treat it as decided.**

**Retention risk from the two-tier structure.** Ten proven players ended up with no realistic
Champion 3 role, including juna the zealot at 105.1, DemonJuan at 93.6 and Yaki at 93.1. Eight are
TH16 or TH17 and several are clan leaders. The advice given was to tell them directly rather than
let them infer it from the war map. Whether that happened is unrecorded.

**What to publish server-wide.** The directory poster labels individual members `HIGH MISS` and
`INACTIVE` by name. Flagged 30 August 2026 as a judgment call, still unresolved.

---

## Superseded, kept so they are not reintroduced

- **Alts default to SUB regardless of score.** Retired in the July 2026 cycle. The Grozbolt II/III/IV/V
  override that forced four alts into Flakes CORE was an exception to this rule and is obsolete with it.
- **Flakes runs 30v30 in Crystal at all TH levels.** True in the June 2026 handover. Flakes now sits out.
- **Cake in Masters 1, Fire in Masters.** The June handover league table is stale. Fire is Champion 3.
- **The VIROX override**, keeping him in Cake CORE at a 31.2% miss rate. VIROX left in the August mutiny.
