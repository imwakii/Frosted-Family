import { useEffect, useState } from 'react'
import type { ClanName } from './types'

// Game art served from public/: 64px unit icons, town halls and CWL league
// badges. Clan badges are not bundled; they load from the API's badgeUrls.

/** "Barbarian King" -> barbarian_king, "P.E.K.K.A" -> p_e_k_k_a. */
export const snake = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

export const unitIcon = (name: string) => `/icons/${snake(name)}.png`

const TH_ART = new Set([13, 14, 15, 16, 17, 18])
export const thIcon = (th: number | null) => (th && TH_ART.has(th) ? `/icons/th${th}.png` : null)

const LEAGUE_ART = new Set(['champion_league_iii', 'master_league_ii', 'master_league_iii'])
export const leagueIcon = (league: string | null | undefined) =>
  league && LEAGUE_ART.has(snake(league)) ? `/leagues/${snake(league)}.png` : null

export type ClanMeta = { clan: ClanName; name: string; badge: string | null; league: string | null }

type ApiClans = { clans: { clan: string; name?: string; badge_urls?: { small?: string; medium?: string; large?: string }; war_league?: string | null }[] }

let clansPromise: Promise<Partial<Record<ClanName, ClanMeta>>> | null = null

function loadClans() {
  clansPromise ??= fetch('/api/clans', { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : { clans: [] }))
    .then((d: ApiClans) => Object.fromEntries((d.clans ?? []).map((c) => [c.clan, {
      clan: c.clan as ClanName,
      name: c.name ?? `Frosted ${c.clan}`,
      badge: c.badge_urls?.medium ?? c.badge_urls?.large ?? c.badge_urls?.small ?? null,
      league: c.war_league ?? null,
    }])))
    .catch(() => ({}))
  return clansPromise
}

/** Clan names, badges and leagues from GET /api/clans; empty until it answers. */
export function useClans() {
  const [clans, setClans] = useState<Partial<Record<ClanName, ClanMeta>>>({})
  useEffect(() => { loadClans().then(setClans) }, [])
  return clans
}
