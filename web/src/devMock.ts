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
