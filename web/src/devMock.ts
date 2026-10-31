// Dev only (`?mock` in the URL): synthetic Explore payloads built from
// roster.json, for reviewing layouts before /api/explore/* returns data.
import type { ExploreRow, Source } from './explore'
import type { Roster } from './types'

const HEROES: [string, number][] = [['Barbarian King', 105], ['Archer Queen', 105], ['Minion Prince', 90], ['Grand Warden', 80], ['Royal Champion', 55]]
const UNITS: [string, 'troop' | 'spell' | 'pet' | 'siege', number][] = [
  ['Electro Titan', 'troop', 4], ['Dragon', 'troop', 12], ['Root Rider', 'troop', 3], ['Rage Spell', 'spell', 6],
  ['Freeze Spell', 'spell', 7], ['Overgrowth Spell', 'spell', 3], ['Unicorn', 'pet', 10], ['Frosty', 'pet', 10], ['Log Launcher', 'siege', 5],
]

function rnd(seed: string) {
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0
  return () => { h = (h * 1103515245 + 12345) | 0; return ((h >>> 0) % 1000) / 1000 }
}

export async function mockPayload(src: Source) {
  const roster: Roster = await fetch('/roster.json').then((r) => r.json())
  const players: ExploreRow[] = roster.players.map((p) => {
    const r = rnd(p.tag + src)
    const th = p.th ?? 15
    const scale = th / 18
    const fill = 0.45 + r() * 0.55
    const items = (list: [string, number][]) => list.map(([name, max]) => {
      const cap = Math.max(1, Math.round(max * scale))
      return { name, level: Math.max(1, Math.round(cap * Math.min(1, fill + r() * 0.1))), cap, max }
    })
    const row: ExploreRow = { tag: p.tag, name: p.name, clan: p.clan, th }
    if (src === 'heroes') row.heroes = items(HEROES)
    if (src === 'army') row.units = UNITS.map(([name, group, max]) => ({ ...items([[name, max]])[0], group }))
    if (src === 'equipment') row.equipment = Array.from({ length: 6 + Math.floor(r() * 14) }, (_, i) => ({ name: `Equipment ${i}`, level: 1 + Math.floor(r() * 27), max: 27 }))
    if (src === 'war') { const a = Math.floor(r() * 30); const t = Math.floor(a * r()); row.war = { wars: Math.ceil(a / 2), attacks: a, stars: t * 3 + Math.floor((a - t) * 1.6), three_stars: t, missed: Math.floor(r() * 3), avg_destruction: a ? 70 + r() * 30 : null } }
    if (src === 'donations') row.donations = { donated: Math.floor(r() * 4000), received: Math.floor(r() * 2500) }
    if (src === 'capital') row.capital = { contributed: Math.floor(r() * 2e6), raid_loot: r() > 0.3 ? Math.floor(r() * 30000) : null, raid_attacks: r() > 0.3 ? Math.floor(r() * 6) : null }
    return row
  })
  return { kind: src, updated_at: new Date().toISOString(), players }
}
