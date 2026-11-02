import { useEffect, useState } from 'react'
import type { ClanName } from './types'

// GET /api/explore/upgrades and /api/leaders/*, all public for now.
export type UpgradeCategory = 'hero' | 'equipment' | 'troop' | 'spell' | 'pet' | 'siege' | 'town_hall'
export type Upgrade = {
  tag: string; name: string; clan: ClanName; th: number | null
  unit: string; category: UpgradeCategory; change: 'level_up' | 'unlock'; from: number; to: number; at: string
}
export type Inactive = {
  tag: string; name: string; clan: ClanName; th: number | null
  last_active: string | null; days_inactive: number | null; inactive_at_least: boolean; tracking_since: string | null
  last_war_attack: string | null; donations: number | null; missed_attacks_recorded: number | null
}
export type Reason = { code: string; value: number | string | null }
export type Activity = 'inactive_14_plus' | 'inactive_7_to_13' | 'inactive_3_to_6' | 'active'
/** Make room, already in Ka Wai's removal order: activity bucket, then weakest heroes for the TH. */
export type Candidate = {
  tag: string; name: string; clan: ClanName; th: number | null; cwl_slot: string | null; reasons: Reason[]
  position?: number; activity?: Activity; days_inactive?: number | null; inactive_at_least?: boolean
  hero_levels?: number | null; hero_pct?: number | null; cohort_th?: number | null; cohort_n?: number | null; cohort?: 'same_th' | 'thin' | null
}

export const ACTIVITY_LABEL: Record<Activity, string> = {
  inactive_14_plus: 'Inactive 14+ days', inactive_7_to_13: 'Inactive 7–13 days', inactive_3_to_6: 'Inactive 3–6 days', active: 'Active',
}

const HERO_LOW = 85

/** Heroes as a share of the same-TH median; a thin cohort compares TH-1 to TH+1. */
export function heroChip(c: Candidate): { text: string; tone: 'amber' | 'grey' | 'plain' } | null {
  if (c.hero_pct === null || c.hero_pct === undefined || !c.cohort_th) return null
  const thin = c.cohort === 'thin'
  const of = thin ? `TH${c.cohort_th - 1}–${c.cohort_th + 1}` : `TH${c.cohort_th}`
  return { text: `Heroes ${Math.round(c.hero_pct)}% of ${of}`, tone: thin ? 'grey' : c.hero_pct < HERO_LOW ? 'amber' : 'plain' }
}
export type MakeRoom = { clan: ClanName; members: number; cap: number; as_of: string | null; players: Candidate[] }

const mock = () => import.meta.env.DEV && new URLSearchParams(window.location.search).has('mock')

/** Thrown when the server wants a leader's sign-in, so the page can ask for one instead of showing no data. */
export class Denied extends Error {}

async function getJson<T>(url: string): Promise<T | null> {
  const r = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' }).catch(() => null)
  if (r && (r.status === 401 || r.status === 403)) throw new Denied()
  return r?.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null
}

function useLoad<T>(key: string | null, load: () => Promise<T | null>) {
  const [state, setState] = useState<{ key: string | null; data: T | null; loading: boolean; denied?: boolean }>({ key, data: null, loading: true })
  useEffect(() => {
    if (key === null) return
    let live = true
    setState({ key, data: null, loading: true })
    load().then((data) => { if (live) setState({ key, data, loading: false }) },
      (e) => { if (live) setState({ key, data: null, loading: false, denied: e instanceof Denied }) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state.key === key ? state : { key, data: null, loading: key !== null, denied: false }
}

export const useUpgrades = (days: number) =>
  useLoad<{ upgrades: Upgrade[]; as_of: string | null }>(`upgrades-${days}`, () => (mock()
    ? import('./devMock').then((m) => m.mockUpgrades() as Promise<{ upgrades: Upgrade[]; as_of: string | null }>)
    : getJson<{ upgrades: Upgrade[]; as_of: string | null }>(`/api/explore/upgrades?days=${days}`).then((d) => (d && Array.isArray(d.upgrades) ? d : null))))

export const useInactivity = (enabled: boolean) =>
  useLoad<{ players: Inactive[]; as_of: string | null }>(enabled ? 'inactivity' : null, () => (mock()
    ? import('./devMock').then((m) => m.mockInactivity())
    : getJson<{ players: Inactive[]; as_of: string | null }>('/api/leaders/inactivity')))

export const useMakeRoom = (clan: ClanName, enabled: boolean) =>
  useLoad<MakeRoom>(enabled ? `make-room-${clan}` : null, () => (mock()
    ? import('./devMock').then((m) => m.mockMakeRoom(clan) as Promise<MakeRoom>)
    : getJson<MakeRoom>(`/api/leaders/make-room?clan=${clan}`)))

/** Reason chips, worst first in the API's order. */
export function reasonLabel(r: Reason): { text: string; tone: 'amber' | 'grey' } {
  switch (r.code) {
    case 'inactive_days': return { text: `Inactive ${r.value ?? '?'}d`, tone: 'amber' }
    case 'high_miss': return { text: 'High miss', tone: 'amber' }
    case 'missed_recent': return { text: `Missed ${r.value ?? ''}`.trim(), tone: 'amber' }
    case 'sitting_out': return { text: 'Not in', tone: 'grey' }
    case 'no_donations': return { text: 'No donations', tone: 'grey' }
    case 'low_th_for_clan': return { text: 'Low TH', tone: 'grey' }
    case 'new_and_unproven': return { text: 'New', tone: 'grey' }
    default: return { text: r.code.replace(/_/g, ' '), tone: 'grey' }
  }
}

/** "2h ago", "3d ago". */
export function ago(iso: string | null, now = Date.now()) {
  if (!iso) return null
  const m = Math.max(0, (now - new Date(iso).getTime()) / 60000)
  if (m < 60) return `${Math.max(1, Math.round(m))}m ago`
  if (m < 1440) return `${Math.round(m / 60)}h ago`
  return `${Math.round(m / 1440)}d ago`
}

// GET /api/war/board: each clan's war, its bases paired by map position.
type WarSide = { tag: string; name: string; th: number | null; position: number | null }
export type WarAttack = { order: number; ours: boolean; attacker: WarSide; defender: WarSide; stars: number; destruction: number; seen_at: string | null }
export type WarBase = WarSide & { used: number; allowed: number; best: number | null }
export type ClanWar = {
  kind: string; state: 'inWar' | 'preparation' | 'warEnded'; day: number | null; team_size: number; updated_at: string
  start_time: string | null; end_time: string | null; attacks_allowed: number; opponent: string
  stars: number; opponent_stars: number; destruction: number; opponent_destruction: number
  attacks_used: number; opponent_attacks_used: number; badge: string | null; opponent_badge: string | null; log: WarAttack[]
  pairs: { position: number; us: WarBase | null; them: WarBase | null }[]
}
export const loadWarBoard = () => getJson<{ clans: { clan: ClanName; war: ClanWar | null }[]; last_poll: string | null }>('/api/war/board')

/** Refetched every minute, keeping the last answer on screen meanwhile. */
export function useWarBoard() {
  const [state, setState] = useState<{ data: Awaited<ReturnType<typeof loadWarBoard>>; loading: boolean }>({ data: null, loading: true })
  useEffect(() => {
    let live = true
    const tick = () => loadWarBoard().then((data) => { if (live) setState((s) => ({ data: data ?? s.data, loading: false })) }, () => { if (live) setState((s) => ({ ...s, loading: false })) })
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => { live = false; window.clearInterval(id) }
  }, [])
  return state
}
