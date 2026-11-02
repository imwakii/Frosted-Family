import type { ClanName, Slot, Status } from './types'

export const CLANS: ClanName[] = ['Fire', 'Cake', 'Flakes']

// Clan colour marks clan identity only.
export const CLAN: Record<ClanName, { tint: string; deep: string; accent: string; label: string }> = {
  Fire: { tint: '#FFF0E8', deep: '#D2360A', accent: '#EC6A35', label: '#A82C0A' },
  Cake: { tint: '#EEF5FD', deep: '#1D5FB0', accent: '#3B8BE6', label: '#1E4E8C' },
  Flakes: { tint: '#F8EEFC', deep: '#8E24AA', accent: '#B44FD6', label: '#74208C' },
}

export const STATUS: Record<Status, { text: string; bg: string; fg: string; dot: string }> = {
  active: { text: 'Active', bg: '#DCFCE7', fg: '#166534', dot: '#16A34A' },
  highMiss: { text: 'High miss', bg: '#FEF3C7', fg: '#92400E', dot: '#D97706' },
  inactive: { text: 'Inactive', bg: '#E3D8BF', fg: '#463A29', dot: '#A3957C' },
  thin: { text: 'Few attacks', bg: '#E3D8BF', fg: '#463A29', dot: '#A3957C' },
  new: { text: 'New', bg: '#D6E6E4', fg: '#1F5A5F', dot: '#2F7F86' },
}

export const GROUPS: { slot: Slot; label: string; dim: boolean }[] = [
  { slot: 'CORE', label: 'Core', dim: false },
  { slot: 'SUB', label: 'Sub', dim: false },
  { slot: 'OUT', label: 'Not in', dim: true },
  { slot: 'NEW', label: 'New', dim: false },
]

export const SLOT_TEXT: Record<Slot, string> = { CORE: 'Core', SUB: 'Sub', OUT: 'Not in', NEW: 'New' }

export const fmtScore = (s: number | null) => (s === null ? '—' : s.toFixed(1))

export function coreAvg(scores: (number | null)[]): number | null {
  const v = scores.filter((s): s is number => s !== null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

export function fmtStart(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
  return `${day}, ${time} UTC`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const cycleShort = (c: string) => MONTHS[Number(c.slice(5, 7)) - 1] ?? c
export const cycleLong = (c: string) => LONG[Number(c.slice(5, 7)) - 1] ?? c

export function fmtWindow(w: { from: string; to: string } | null): string | null {
  if (!w) return null
  const a = LONG[Number(w.from.slice(5, 7)) - 1], b = LONG[Number(w.to.slice(5, 7)) - 1]
  const ya = w.from.slice(0, 4), yb = w.to.slice(0, 4)
  return ya === yb ? `${a} to ${b} ${yb}` : `${a} ${ya} to ${b} ${yb}`
}
