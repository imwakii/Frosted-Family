// Dev only (`?mock` in the URL): a synthetic Explore matrix built from
// roster.json and the design's unit list, for reviewing layouts before
// /api/explore/matrix returns data.
import catalog from './unitCatalog.json'
import type { Cat, Matrix } from './explore'
import type { Roster } from './types'

function rnd(seed: string) {
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0
  return () => { h = (h * 1103515245 + 12345) | 0; return ((h >>> 0) % 1000) / 1000 }
}

export async function mockMatrix(cat: Cat): Promise<Matrix> {
  const roster: Roster = await fetch('/roster.json').then((r) => r.json())
  const units = (catalog as unknown as Record<string, [string, number][]>)[cat].map(([name, max]) => ({ name, max }))
  return {
    cat,
    as_of: new Date().toISOString(),
    units,
    players: roster.players.map((p) => {
      const r = rnd(p.tag + cat)
      const fill = ((p.th ?? 15) / 18) * (0.55 + r() * 0.45)
      return {
        tag: p.tag, name: p.name, clan: p.clan, th: p.th,
        levels: units.map((u) => (r() < 0.08 ? null : Math.max(1, Math.min(u.max, Math.round(u.max * Math.min(1, fill + (r() - 0.3) * 0.3)))))),
      }
    }),
  }
}

export async function mockWar(scope: 'all' | 'cwl') {
  const roster: Roster = await fetch('/roster.json').then((r) => r.json())
  return {
    kind: 'war', scope, since: '2026-10-31', season: scope === 'cwl' ? '2026-11' : null, updated_at: new Date().toISOString(),
    players: roster.players.map((p) => {
      const r = rnd(p.tag + scope)
      const wars = scope === 'cwl' ? Math.floor(r() * 4) : Math.floor(r() * 6)
      const owed = wars * (scope === 'cwl' ? 1 : 2)
      const missed = Math.floor(owed * r() * r())
      const attacks = owed - missed
      const three = Math.floor(attacks * r())
      return {
        tag: p.tag, name: p.name, clan: p.clan, th: p.th,
        war_stars: r() < 0.05 ? null : Math.floor(200 + r() * 2400),
        war: attacks + missed ? { wars, attacks, stars: three * 3 + Math.floor((attacks - three) * 1.8), three_stars: three, missed, avg_destruction: attacks ? 70 + r() * 30 : null } : null,
      }
    }),
  }
}

const HOURS = 3600_000

export async function mockUpgrades() {
  const roster: Roster = await fetch('/roster.json').then((r) => r.json())
  const pool: [string, 'hero' | 'equipment' | 'troop' | 'spell' | 'pet' | 'siege' | 'town_hall', number][] = [
    ['Archer Queen', 'hero', 110], ['Barbarian King', 'hero', 110], ['Grand Warden', 'hero', 85], ['Giant Gauntlet', 'equipment', 27],
    ['Fireball', 'equipment', 27], ['Electro Titan', 'troop', 4], ['Root Rider', 'troop', 3], ['Rage Spell', 'spell', 6],
    ['Overgrowth Spell', 'spell', 3], ['Unicorn', 'pet', 10], ['Log Launcher', 'siege', 5], ['Town Hall', 'town_hall', 18],
  ]
  const r = rnd('upgrades')
  const upgrades = Array.from({ length: 60 }, () => {
    const p = roster.players[Math.floor(r() * roster.players.length)]
    const [unit, category, max] = pool[Math.floor(r() * pool.length)]
    const to = category === 'town_hall' ? Math.min(18, (p.th ?? 15) + 1) : Math.max(1, Math.floor(r() * max) + 1)
    return { tag: p.tag, name: p.name, clan: p.clan, th: p.th, unit, category, change: to === 1 ? 'unlock' : 'level_up', from: to - 1, to,
      at: new Date(Date.now() - r() * 7 * 24 * HOURS).toISOString() }
  }).sort((a, b) => b.at.localeCompare(a.at))
  return { as_of: new Date().toISOString(), upgrades }
}

export async function mockMakeRoom(clan: 'Fire' | 'Cake' | 'Flakes') {
  const roster: Roster = await fetch('/roster.json').then((r) => r.json())
  const r = rnd('room' + clan)
  const codes = ['high_miss', 'missed_recent', 'sitting_out', 'no_donations', 'new_and_unproven']
  const order = ['inactive_14_plus', 'inactive_7_to_13', 'inactive_3_to_6', 'active'] as const
  const mine = roster.players.filter((p) => p.clan === clan)
  const players = mine.map((p) => {
    const days = Math.floor(r() * r() * 30)
    const activity = days >= 14 ? order[0] : days >= 7 ? order[1] : days >= 3 ? order[2] : order[3]
    const thin = r() < 0.15
    return {
      tag: p.tag, name: p.name, clan: p.clan, th: p.th, cwl_slot: p.slot === 'OUT' ? 'Sitting Out' : p.slot,
      activity, days_inactive: days, inactive_at_least: r() < 0.1,
      hero_levels: null, hero_pct: r() < 0.05 ? null : 55 + r() * 60, cohort_th: p.th, cohort_n: thin ? 2 : 3 + Math.floor(r() * 20), cohort: thin ? 'thin' : 'same_th',
      reasons: [
        ...(days >= 3 ? [{ code: 'inactive_days', value: days }] : []),
        ...codes.filter(() => r() < 0.2).map((code) => ({ code, value: code === 'missed_recent' ? 1 + Math.floor(r() * 4) : null })),
      ],
    }
  }).sort((a, b) => order.indexOf(a.activity) - order.indexOf(b.activity) || (a.hero_pct ?? 999) - (b.hero_pct ?? 999))
  return { clan, members: mine.length, cap: 50, as_of: new Date().toISOString(), players: players.map((p, i) => ({ ...p, position: i + 1 })) }
}

// ?mock=new: the /api/roster shape from roster.json, with two new members and one departed player.
export async function mockRosterApi() {
  const roster: Roster = await fetch('/roster.json').then((r) => r.json())
  const slot = { CORE: 'CORE', SUB: 'SUB', OUT: 'Sitting Out', NEW: 'New' } as const
  const players = roster.players.map((p, i) => ({
    tag: p.tag, name: p.name, clan: p.clan, cwl_slot: slot[p.slot], transferred_from: p.from, tier: 'PROVEN', final_score: p.score, current_th: p.th,
    snapshot: null, left: i === 5,
  }))
  players.push(
    { tag: '#NEWFIRE1', name: 'Snowfall Rookie', clan: 'Fire', cwl_slot: 'New', transferred_from: null, tier: 'NEW', final_score: null, current_th: 17, snapshot: null, left: false,
      joined_at: '2026-10-30', suggested_slot: 'SUB', suggested_reason: 'TH17 with no war record yet' } as never,
    { tag: '#NEWCAKE1', name: 'Frostbite with a very long name', clan: 'Cake', cwl_slot: 'New', transferred_from: null, tier: 'NEW', final_score: null, current_th: 18, snapshot: null, left: false,
      joined_at: '2026-10-31', suggested_slot: 'CORE', suggested_reason: 'TH18, heroes at the TH median' } as never,
  )
  return { players }
}
