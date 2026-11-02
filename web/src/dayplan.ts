import type { Player } from './types'

// The day planner's rules, in priority order. Keeping the league and promoting comes first:
//   1. Only players certain to attack: high-miss and inactive players, and anyone who missed an attack this season,
//      get no suggested days, whatever their town hall. Unproven and new players count as one town hall weaker.
//   2. Each day's lineup matches the enemy's town halls, slot by slot. Being under an enemy slot costs more than being
//      over it. The enemy is the drawn opponent, else the expected one (`upcoming`); with neither, the highest play.
//   3. Between players who fit a slot equally well, the one who needs more days for 8 stars plays. Days needed =
//      ceil((8 − stars expected so far) / 3). 8 stars never puts a weaker player ahead of a better fit.
//   4. New members are tried out: up to two a day who have not played yet, highest town hall first, on the weakest
//      enemy slots and only if they are within a town hall of them. One who attacks counts as proven from then on and
//      competes for days like anyone else, so a TH18 keeps playing until 8 stars. One who misses gets no more days.
//   5. Weakest of all: consecutive days are easier to remember. Between equal fits, once anyone who needs every day
//      left for 8 stars is in, a player who played the day before stays in.
// Days whose war is on or over are fixed to the game's lineup; only the days still to come are suggested.

export const DAYS = [1, 2, 3, 4, 5, 6, 7] as const
export const TEAM = 15
export const TARGET = 8
export const TRIALS_A_DAY = 2
export type DayWar = {
  state: 'preparation' | 'inWar' | 'warEnded'
  opponent: string | null
  opponent_th: number[]
  lineup: string[]
  stars: Record<string, number>
  missed: string[]
}
export type ClanDays = Record<string, string[]>  // "1".."7" → tags
export type Wars = Record<string, DayWar>

export const locked = (w: DayWar | undefined) => !!w && w.state !== 'preparation'

/** Stars each player has, or is counted on for: a war on now credits 3 to anyone in it who has not attacked yet. */
export function expected(wars: Wars): Record<string, number> {
  const out: Record<string, number> = {}
  for (const w of Object.values(wars)) {
    if (!locked(w)) continue
    for (const t of w.lineup) out[t] = (out[t] ?? 0) + (w.stars[t] ?? (w.state === 'inWar' ? 3 : 0))
  }
  return out
}

export const earned = (wars: Wars, tag: string) =>
  Object.values(wars).reduce((s, w) => s + (locked(w) && w.state === 'warEnded' ? w.stars[tag] ?? 0 : 0), 0)

export const missedThisSeason = (wars: Wars) => new Set(Object.values(wars).flatMap((w) => w.missed))

/** A new member who has yet to attack in a war this season. */
export const onTrial = (p: Player, wars: Wars) =>
  p.slot === 'NEW' && !Object.values(wars).some((w) => locked(w) && w.stars[p.tag] !== undefined)

/** 0 proven, 1 unproven or new, null not suggested. */
export function tier(p: Player, missed: Set<string>, wars: Wars): number | null {
  if (missed.has(p.tag) || p.status === 'highMiss' || p.status === 'inactive') return null
  return p.status === 'active' || (p.slot === 'NEW' && !onTrial(p, wars)) ? 0 : 1
}

const daysFor = (stars: number) => Math.max(0, Math.ceil((TARGET - stars) / 3))

/** Can this plan still get the player to 8 stars? */
export function onTrack(tag: string, plan: ClanDays, wars: Wars) {
  const open = DAYS.filter((d) => !locked(wars[d]) && plan[d]?.includes(tag)).length
  return (expected(wars)[tag] ?? 0) + 3 * open >= TARGET
}

/** The enemy to match on a day: the opponent once drawn, else the expected one, else nothing. */
export const enemy = (war: DayWar | undefined, upcoming: number[]) =>
  war?.opponent_th.length ? war.opponent_th : upcoming

/** How many of our slots sit below the enemy's, rank by rank. */
export function slotsBelow(ths: number[], foe: number[]) {
  const ours = [...ths].sort((a, b) => b - a)
  return foe.filter((f, i) => (ours[i] ?? 0) < Math.round(f)).length
}

export function suggest(pool: Player[], wars: Wars, upcoming: number[] = []): ClanDays {
  const missed = missedThisSeason(wars)
  const stars = expected(wars)
  const ok = pool.filter((p) => tier(p, missed, wars) !== null && !onTrial(p, wars))
  const need = Object.fromEntries(ok.map((p) => [p.tag, daysFor(stars[p.tag] ?? 0)]))
  const byStrength = (a: Player, b: Player) =>
    tier(a, missed, wars)! - tier(b, missed, wars)! || (b.th ?? 0) - (a.th ?? 0) || (b.score ?? 0) - (a.score ?? 0)
  // Not yet tried: one in a war still being fought is waiting on its result.
  const inGame = new Set(Object.values(wars).filter(locked).flatMap((w) => w.lineup))
  const untried = pool.filter((p) => onTrial(p, wars) && tier(p, missed, wars) !== null && !inGame.has(p.tag))
    .sort((a, b) => (b.th ?? 0) - (a.th ?? 0) || (b.score ?? 0) - (a.score ?? 0))
  const strongest = [...ok].sort(byStrength)
  const out: ClanDays = {}
  const open = DAYS.filter((d) => !locked(wars[d]))
  for (const d of DAYS) {
    if (locked(wars[d])) { out[d] = [...wars[d].lineup]; continue }
    const left = open.filter((x) => x >= d).length
    // Strongest enemy first, each slot to the best fit. With no enemy known, an out-of-reach slot picks the highest.
    const known = enemy(wars[d], upcoming)
    const foe = known.length ? known.slice(0, TEAM) : Array<number>(TEAM).fill(99)
    // Try new members on the weakest slots, as long as they are within a town hall of them.
    const floor = (known.length ? Math.round(Math.min(...foe)) : strongest[TEAM - 1]?.th ?? 0) - 1
    const trial = untried.filter((p) => (p.th ?? 0) >= floor).slice(0, TRIALS_A_DAY)
    for (const p of trial) untried.splice(untried.indexOf(p), 1)
    const fit = (p: Player, slot: number) => {
      const diff = (p.th ?? 0) - slot
      return (diff >= 0 ? diff * 0.5 : -diff) + tier(p, missed, wars)!
    }
    // Equal fits: must play for 8 stars, then still short and on a run, still short, on a run, the rest.
    const yesterday = new Set(out[d - 1] ?? [])
    const rank = (p: Player) => {
      const n = need[p.tag], run = yesterday.has(p.tag)
      return n > 0 && n >= left ? 0 : n > 0 ? (run ? 1 : 2) : run ? 3 : 4
    }
    const team: Player[] = []
    for (const slot of foe.slice(0, TEAM - trial.length)) {
      const best = ok.filter((p) => !team.includes(p))
        .sort((a, b) => fit(a, slot) - fit(b, slot) || rank(a) - rank(b) || need[b.tag] - need[a.tag] || byStrength(a, b))[0]
      if (best) team.push(best)
    }
    out[d] = [...team, ...trial].map((p) => p.tag).sort()
    for (const t of out[d]) if (need[t] > 0) need[t] -= 1
  }
  return out
}
