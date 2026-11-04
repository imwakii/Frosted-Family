import type { CalMonth } from './calendar'
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ClanName } from './types'

// GET /api/explore/upgrades and /api/leaders/*, all public for now.
export type UpgradeCategory = 'hero' | 'equipment' | 'troop' | 'spell' | 'pet' | 'siege' | 'town_hall'
export type Upgrade = {
  tag: string; name: string; clan: ClanName; th: number | null
  unit: string; category: UpgradeCategory; change: 'level_up' | 'unlock'; from: number; to: number; at: string
}
export type Reason = { code: string; value: number | string | null }
export type Activity = 'inactive_14_plus' | 'inactive_7_to_13' | 'inactive_3_to_6' | 'active'
/** Make room, already in Ka Wai's removal order: activity bucket, then weakest heroes for the TH. */
export type Candidate = {
  tag: string; name: string; clan: ClanName; th: number | null; cwl_slot: string | null; reasons: Reason[]
  position?: number; activity?: Activity; days_inactive?: number | null; inactive_at_least?: boolean
  hero_levels?: number | null; hero_pct?: number | null; cohort_th?: number | null; cohort_n?: number | null; cohort?: 'same_th' | 'thin' | null
  tracking_since?: string | null; last_upgrade?: string | null; upgrades_30d?: number
}

export const ACTIVITY_LABEL: Record<Activity, string> = {
  inactive_14_plus: 'Inactive 14+ days', inactive_7_to_13: 'Inactive 7–13 days', inactive_3_to_6: 'Inactive 3–6 days', active: 'Active',
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

// GET /api/log: who came, went, moved or changed role, and recent upgrades. An approx time is only right to the day.
export type LogEvent = {
  kind: 'joined' | 'rejoined' | 'visited' | 'left' | 'moved' | 'promoted' | 'demoted'
  tag: string; name: string | null; th: number | null; clan: ClanName; from_clan?: ClanName; role?: string; at: string; approx: boolean
}
export type UpgradeCount = { day: string; clan: ClanName; category: UpgradeCategory; n: number }
export type UpgradeLeader = { tag: string; name: string | null; clan: ClanName; th: number | null; week: number; month: number; last: string }
export type Milestone = { kind: 'hero' | 'war_stars'; tag: string; name: string | null; clan: string | null; at: string; unit?: string; stars?: number }
export type ClanLog = { milestones?: Milestone[]; since: string | null; upgrade_days: number; events: LogEvent[]; upgrades: Upgrade[]; upgrade_counts?: UpgradeCount[]; upgrade_board?: UpgradeLeader[] }

const loadClanLog = (): Promise<ClanLog | null> => (mock()
  ? import('./devMock').then((m) => m.mockUpgrades()).then((d) => ({ since: null, upgrade_days: 14, events: [], upgrades: (d as { upgrades: Upgrade[] }).upgrades }))
  : getJson<ClanLog>('/api/log').then((d) => (d && Array.isArray(d.events) ? d : null)))

// Refetched every 5 minutes while open and on coming back to the app; a failed refetch keeps what is showing.
export function useClanLog() {
  const [state, setState] = useState<{ data: ClanLog | null; loading: boolean }>({ data: null, loading: true })
  useEffect(() => {
    let live = true
    const tick = () => loadClanLog().then((data) => { if (live) setState((s) => ({ data: data ?? s.data, loading: false })) }, () => { if (live) setState((s) => ({ ...s, loading: false })) })
    const back = () => { if (document.visibilityState === 'visible') tick() }
    tick()
    const id = window.setInterval(tick, 300_000)
    document.addEventListener('visibilitychange', back)
    return () => { live = false; window.clearInterval(id); document.removeEventListener('visibilitychange', back) }
  }, [])
  return state
}

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
export type WarAttack = { order: number; ours: boolean; attacker: WarSide; defender: WarSide; stars: number; destruction: number; duration?: number | null; seen_at: string | null }
export type WarRecap = { mvp: WarSide & { stars: number[]; destruction: number; tied: number }; upsets: { attacker: WarSide; defender: WarSide }[] }
export type WarBase = WarSide & { used: number; allowed: number; best: number | null }
export type ClanWar = {
  kind: string; state: 'inWar' | 'preparation' | 'warEnded'; day: number | null; team_size: number; updated_at: string
  preparation_start?: string | null; start_time: string | null; end_time: string | null; attacks_allowed: number; opponent: string; opponent_tag?: string
  stars: number; opponent_stars: number; destruction: number; opponent_destruction: number
  attacks_used: number; opponent_attacks_used: number; badge: string | null; opponent_badge: string | null; log: WarAttack[]; recap?: WarRecap | null; war_key?: string
  pairs: { position: number; us: WarBase | null; them: WarBase | null }[]
}
export const loadWarBoard = () => getJson<{ clans: { clan: ClanName; war: ClanWar | null; next?: ClanWar | null }[]; last_poll: string | null }>('/api/war/board')

/** Refetched every minute, keeping the last answer on screen meanwhile. */
export type CwlRow = { tag: string; name: string; badge: string | null; ours: boolean; stars: number; destruction: number; won: number; lost: number; town_halls: number[]; strength: { war_stars: number; heroes: number; equipment: number } | null; profile?: CwlProfile | null; wars?: CwlClanWar[] }
export type CwlProfile = { level: number | null; war_wins: number | null; win_streak: number | null; war_league: string | null; members: number | null }
export type CwlClanWar = { day: number; state: string; opponent_tag: string; opponent: string | null; opponent_badge: string | null; stars: number; opponent_stars: number; destruction: number; opponent_destruction: number }
export type CwlDay = { day: number; war_key: string; state: string; opponent: string; opponent_badge: string | null; stars: number; opponent_stars: number; destruction: number; opponent_destruction: number }
export type LogWar = CwlDay & { kind: string; end_time: string | null; team_size: number | null }
export type EightRow = { tag: string; name: string; th: number | null; played: number; stars: number }
export type CwlGroup = { season: string; table: CwlRow[]; days: CwlDay[]; before?: CwlDay | null; eight: EightRow[] }
const loadCwlGroups = () => getJson<{ clans: { clan: ClanName; group: CwlGroup | null }[] }>('/api/war/cwl')

// Fetched on opening and every minute, keeping the last answer through a failed fetch.
function usePolled<T>(key: string, load: () => Promise<T | null>) {
  const [state, setState] = useState<{ key: string; data: T | null; loading: boolean }>({ key, data: null, loading: true })
  useEffect(() => {
    let live = true
    setState({ key, data: null, loading: true })
    const tick = () => load().then((data) => { if (live) setState((s) => ({ key, data: data ?? s.data, loading: false })) }, () => { if (live) setState((s) => ({ ...s, loading: false })) })
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => { live = false; window.clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}

// The CWL day picked on War or Lineups: both stay on it. null follows the day being fought; 'all' is Lineups' roster.
let dayPick: number | 'all' | null = null
const dayListeners = new Set<() => void>()
const onDayPick = (run: () => void) => { dayListeners.add(run); return () => { dayListeners.delete(run) } }
export const setDayPick = (d: number | 'all' | null) => { dayPick = d; dayListeners.forEach((run) => run()) }
export const useDayPick = () => useSyncExternalStore(onDayPick, () => dayPick)

// The clan picked on the War tab, which a clan card can also set. null opens on your own war.
let warClan: ClanName | null = null
export const setWarClan = (c: ClanName | null) => { warClan = c; dayListeners.forEach((run) => run()) }
export const useWarClan = () => useSyncExternalStore(onDayPick, () => warClan)

export const useCwlGroups = () => usePolled('groups', loadCwlGroups)
export const useCalendar = (month: string) => usePolled(`cal${month}`, () => getJson<CalMonth>(`/api/calendar?month=${month}`))
export const useWarLog = (clan: ClanName) => usePolled(`log${clan}`, () => getJson<{ clan: ClanName; wars: LogWar[] }>(`/api/war/log?clan=${clan}`))
export const useCwlDay = (clan: ClanName, key: string) =>
  usePolled(`${clan}${key}`, () => getJson<ClanWar>(`/api/war/cwl/day?clan=${clan}&key=${encodeURIComponent(key)}`))

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
