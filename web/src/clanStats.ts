import { useEffect, useState } from 'react'
import type { ClanName } from './types'

export type StatClan = ClanName | 'Family'
export type Point = { date: string; value: number }
export type SeasonPoint = { season?: string; date?: string; value: number }
export type StatsWar = {
  date: string
  clan: ClanName
  kind: 'cwl' | 'regular' | string
  opponent: string
  result: 'won' | 'lost' | 'draw'
  stars: number
  opponent_stars: number
  destruction: number | null
  opponent_destruction: number | null
  three_star_rate: number | null
}
export type CycleScore = { cycle: string; avg_score: number | null; n: number; core_avg_score: number | null; core_n: number | null }

export interface ClanStats {
  members: Point[]
  avg_th: Point[]
  hero_progress: Point[]
  donations: Point[]
  donations_by_season: SeasonPoint[]
  capital_by_raid: Point[]
  cwl_league: { season: string; league: string | null }[]
  wars: StatsWar[]
  score_by_cycle: CycleScore[]
}

export interface ClansStats { since: string; as_of: string; clans: Record<StatClan, ClanStats> }

let cache: Promise<ClansStats | null> | null = null

function load(): Promise<ClansStats | null> {
  cache ??= fetch('/api/stats/clans', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
    .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null))
    .then((d) => (d && d.clans ? (d as ClansStats) : null))
    .catch(() => null)
    .then((d) => { if (!d) cache = null; return d })
  return cache
}

export function useClanStats() {
  const [state, setState] = useState<{ data: ClansStats | null; loading: boolean }>({ data: null, loading: true })
  useEffect(() => {
    let live = true
    load().then((data) => { if (live) setState({ data, loading: false }) })
    return () => { live = false }
  }, [])
  return state
}
