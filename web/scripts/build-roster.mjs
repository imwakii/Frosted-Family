// Builds public/roster.json from the canonical roster and score history.
// The site falls back to this file whenever /api/roster is unreachable.
// Tag is the key throughout; names are display only.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const web = join(dirname(fileURLToPath(import.meta.url)), '..')
const repo = join(web, '..')

function parseCsv(text) {
  const rows = []
  let row = [], field = '', quoted = false
  text = text.replace(/^﻿/, '')
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  const [head, ...body] = rows.filter((r) => r.length > 1)
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
}

const num = (v) => (v === '' || v === undefined || Number.isNaN(Number(v)) ? null : Number(v))
// The CSV has a few names whose emoji were lost to U+FFFD upstream; drop the marker for display.
const cleanName = (s) => s.replace(/�/g, '').replace(/\s+/g, ' ').trim()
const round1 = (v) => (v === null ? null : Math.round(v * 10) / 10)

// Tier to the poster's activity label (docs/specs/01-scoring-core.md).
const STATUS = {
  'PROVEN': 'active',
  'UNRELIABLE (HM)': 'highMiss',
  'THIN RECORD': 'thin',
  'LAPSING': 'inactive',
  'DORMANT': 'inactive',
  'NO DATA': 'inactive',
}
const SLOT = { CORE: 'CORE', SUB: 'SUB', 'Sitting Out': 'OUT' }

const members = parseCsv(readFileSync(join(repo, 'frosted_cwl_members.csv'), 'utf8'))
const history = parseCsv(readFileSync(join(repo, 'data', 'score_history.csv'), 'utf8'))
const cycle = JSON.parse(readFileSync(join(web, 'cycle.json'), 'utf8'))

const cycles = [...new Set(history.map((h) => h.cycle))].sort()
const byTag = new Map()
for (const h of history) {
  if (!h.tag) continue
  if (!byTag.has(h.tag)) byTag.set(h.tag, [])
  byTag.get(h.tag).push({ cycle: h.cycle, score: round1(num(h.final_score)) })
}

// Export window of the latest cycle, from its manifest table.
let window = null
const rawDir = join(repo, 'data', 'raw')
const latest = existsSync(rawDir) ? readdirSync(rawDir).filter((d) => /^\d{4}-\d{2}$/.test(d)).sort().pop() : null
const manifest = latest && join(rawDir, latest, 'manifest.md')
if (manifest && existsSync(manifest)) {
  const dates = [...readFileSync(manifest, 'utf8').matchAll(/^\s*\w+\s+(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})/gm)]
  if (dates.length) {
    window = {
      from: dates.map((d) => d[2]).sort()[0],
      to: dates.map((d) => d[1]).sort().pop(),
    }
  }
}

const scored = members.map((m) => num(m.final_score)).filter((s) => s !== null)
const players = members.map((m) => {
  const score = num(m.final_score)
  const missing = !m.tag
  if (missing) console.warn(`roster: no tag for ${m.name}; skipped`)
  if (!SLOT[m.cwl_slot]) throw new Error(`roster: unknown cwl_slot "${m.cwl_slot}" for ${m.tag}`)
  return missing ? null : {
    tag: m.tag,
    name: cleanName(m.name),
    clan: m.clan,
    slot: SLOT[m.cwl_slot],
    from: m.transferred_from || null,
    th: num(m.current_th),
    score: round1(score),
    status: STATUS[m.tier] ?? 'inactive',
    threeStar: round1(num(m.three_star_pct)),
    missPct: round1(num(m.miss_pct)),
    attacks: num(m.attack_count),
    rank: score === null ? null : 1 + scored.filter((s) => s > score).length,
    history: (byTag.get(m.tag) ?? []).sort((a, b) => a.cycle.localeCompare(b.cycle)),
  }
}).filter(Boolean)

const out = { generatedAt: new Date().toISOString(), cwlStart: cycle.cwlStart, clans: cycle.clans, window, cycles, players }
writeFileSync(join(web, 'public', 'roster.json'), JSON.stringify(out))
console.log(`roster.json: ${players.length} players, cycles ${cycles.join(', ')}, window ${window?.from} to ${window?.to}`)
