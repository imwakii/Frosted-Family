import type { Player } from './types'

// The day planner's rules, as the co-leaders run CWL:
//   1. Every reliable player gets the days they need for 8 stars (CWL bonus eligibility): three wars, a fourth if
//      they fall short. Days needed = ceil((8 − stars expected so far) / 3).
//   2. Only players certain to attack: high-miss and inactive players, and anyone who missed an attack this season,
//      get no suggested days. Unproven and new players come after proven ones.
//   3. Each day's lineup matches the enemy's town halls, slot by slot. Being under an enemy slot costs more than being
//      over it, and reliability comes first: a reliable TH17 goes ahead of a TH18 who will not attack.
//      The enemy is the drawn opponent, else the expected one (`upcoming`); with neither, the highest town halls play.
// Days whose war is on or over are fixed to the game's lineup; only the days still to come are suggested.

export const DAYS = [1, 2, 3, 4, 5, 6, 7] as const
export const TEAM = 15
export const TARGET = 8
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

/** 0 proven, 1 unproven or new, null not suggested. */
export function tier(p: Player, missed: Set<string>): number | null {
  if (missed.has(p.tag) || p.status === 'highMiss' || p.status === 'inactive') return null
  return p.status === 'active' ? 0 : 1
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
  const ok = pool.filter((p) => tier(p, missed) !== null)
  const need = Object.fromEntries(ok.map((p) => [p.tag, daysFor(stars[p.tag] ?? 0)]))
  const byStrength = (a: Player, b: Player) =>
    tier(a, missed)! - tier(b, missed)! || (b.th ?? 0) - (a.th ?? 0) || (b.score ?? 0) - (a.score ?? 0)
  const out: ClanDays = {}
  const open = DAYS.filter((d) => !locked(wars[d]))
  for (const d of DAYS) {
    if (locked(wars[d])) { out[d] = [...wars[d].lineup]; continue }
    const left = open.filter((x) => x >= d).length
    const foe = enemy(wars[d], upcoming).slice(0, TEAM)
    let team: Player[]
    if (foe.length) {
      // Anyone who needs every day left plays regardless; the other slots go, strongest enemy first, to the best fit.
      team = ok.filter((p) => need[p.tag] >= left).sort(byStrength).slice(0, TEAM)
      const fit = (p: Player, slot: number) => {
        const diff = (p.th ?? 0) - slot
        return (diff >= 0 ? diff * 0.5 : -diff) + tier(p, missed)! - 2 * (need[p.tag] / left)
      }
      for (const slot of foe.slice(0, TEAM - team.length)) {
        const best = ok.filter((p) => !team.includes(p)).sort((a, b) => fit(a, slot) - fit(b, slot) || byStrength(a, b))[0]
        if (best) team = [...team, best]
      }
    } else {
      // Whoever needs days most urgently first, then the strongest of the rest.
      const needy = ok.filter((p) => need[p.tag] > 0)
        .sort((a, b) => need[b.tag] / left - need[a.tag] / left || byStrength(a, b))
        .slice(0, TEAM)
      const rest = ok.filter((p) => !needy.includes(p)).sort(byStrength).slice(0, TEAM - needy.length)
      team = [...needy, ...rest]
    }
    out[d] = team.map((p) => p.tag).sort()
    for (const t of out[d]) if (need[t] > 0) need[t] -= 1
  }
  return out
}
