import { useEffect, useState } from 'react'
import type { ClanName } from './types'

// GET /api/explore/upgrades (public) and the leaders-only /api/leaders/*.
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
export type Candidate = { tag: string; name: string; clan: ClanName; th: number | null; cwl_slot: string | null; reasons: Reason[]; score: number }
export type MakeRoom = { clan: ClanName; members: number; cap: number; as_of: string | null; players: Candidate[] }

const mock = () => import.meta.env.DEV && new URLSearchParams(window.location.search).has('mock')

async function getJson<T>(url: string): Promise<T | null> {
  const r = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' }).catch(() => null)
  return r?.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null
}

function useLoad<T>(key: string | null, load: () => Promise<T | null>) {
  const [state, setState] = useState<{ key: string | null; data: T | null; loading: boolean }>({ key, data: null, loading: true })
  useEffect(() => {
    if (key === null) return
    let live = true
    setState({ key, data: null, loading: true })
    load().then((data) => { if (live) setState({ key, data, loading: false }) }, () => { if (live) setState({ key, data: null, loading: false }) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state.key === key ? state : { key, data: null, loading: key !== null }
}

export const useUpgrades = (days: number) =>
  useLoad<{ upgrades: Upgrade[]; as_of: string | null }>(`upgrades-${days}`, () => (mock()
    ? import('./devMock').then((m) => m.mockUpgrades() as Promise<{ upgrades: Upgrade[]; as_of: string | null }>)
    : getJson<{ upgrades: Upgrade[]; as_of: string | null }>(`/api/explore/upgrades?days=${days}`).then((d) => (d && Array.isArray(d.upgrades) ? d : null))))

/** Leaders only; pass enabled=false before unlocking so nothing is requested. */
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
    case 'sitting_out': return { text: 'Sitting out', tone: 'grey' }
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
