import { YouTag } from './You'
import { useMemo, useState } from 'react'
import { CATS, type Cat, competitionRanks, type Matrix, progress, useMatrix } from '../explore'
import { playerHref } from '../route'
import { CLAN } from '../theme'
import type { ClanName } from '../types'
import { COLOR } from './ClansBoard'
import { norm } from './CwlTab'
import { type ClanPick, Empty } from './ExploreTab'
import { chip, Star, Th, RowChevron } from './ui'

type Row = { tag: string; name: string; clan: ClanName; th: number | null; overall: number; cats: Partial<Record<Cat, number>> }

// Each category counts equally, so hero levels (max ~100) don't drown out spells (max ~12).
function combine(boards: (Matrix | null)[]): Row[] {
  const rows = new Map<string, Row>()
  boards.forEach((m) => {
    if (!m) return
    for (const p of m.players) {
      if (p.levels.every((l) => l === null)) continue
      const r = rows.get(p.tag) ?? { tag: p.tag, name: p.name, clan: p.clan, th: p.th, overall: 0, cats: {} }
      r.cats[m.cat] = progress(p.levels, m.units)
      rows.set(p.tag, r)
    }
  })
  const n = boards.filter(Boolean).length
  return [...rows.values()].map((r) => ({ ...r, overall: Object.values(r.cats).reduce((a, b) => a + b, 0) / (n || 1) }))
}

const pct = (v: number | undefined) => (v === undefined ? '—' : `${Math.round(v)}%`)
const pct1 = (v: number) => `${(Math.floor(v * 10) / 10).toFixed(1)}%`

// The one progress bar on the Stats boards, in the clan's soft colour.
export function Bar({ v, color }: { v: number; color: string }) {
  return <span className="block h-[3px] w-full overflow-hidden rounded-full bg-hair"><span className="block h-full rounded-full" style={{ width: `${Math.min(v, 100)}%`, background: color }} /></span>
}

const TOP = 10

/** Log's Furthest along: every category's progress, in one ranking. */
export default function OverallBoard({ q, clan, wide }: { q: string; clan: ClanPick; wide: boolean }) {
  // One hook per category, in the fixed CATS order.
  const boards = CATS.map((c) => useMatrix(c.id)) // eslint-disable-line react-hooks/rules-of-hooks
  const loading = boards.some((b) => b.loading)
  const all = useMemo(() => (loading ? [] : combine(boards.map((b) => b.data))), [loading, ...boards.map((b) => b.data)]) // eslint-disable-line react-hooks/exhaustive-deps
  const [sort, setSort] = useState<Cat | 'overall'>('overall')
  const [everyone, setEveryone] = useState(false)
  const nq = norm(q.trim())

  const key = (r: Row) => (sort === 'overall' ? r.overall : r.cats[sort] ?? -1)
  const ranked = all.filter((r) => clan === 'All' || r.clan === clan).sort((a, b) => key(b) - key(a) || b.overall - a.overall || a.name.localeCompare(b.name))
  const place = competitionRanks(ranked, (r) => Math.round(key(r) * 10) / 10)
  const found = ranked.filter((r) => !nq || norm(r.name).includes(nq) || r.tag.toLowerCase().includes(nq))
  const shown = everyone || nq ? found : found.slice(0, TOP)
  // Fully maxed means every category at game max.
  const maxedN = ranked.filter((r) => CATS.every((c) => (r.cats[c.id] ?? 0) >= 100)).length
  const cols: { id: Cat | 'overall'; label: string }[] = [{ id: 'overall', label: 'Overall' }, ...CATS.map((c) => ({ id: c.id, label: c.label }))]
  if (!all.length) return <Empty loading={loading} />

  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Ranked by" className={`flex gap-1.5 overflow-x-auto [scrollbar-width:none] ${wide ? 'flex-wrap' : ''}`}>
        {cols.map((c) => <button key={c.id} type="button" aria-pressed={c.id === sort} onClick={() => setSort(c.id)} className={chip(c.id === sort)}>{c.label}</button>)}
      </div>
      <span className="px-1 text-xs font-semibold text-muted"><Star /> {maxedN} of {ranked.length} fully maxed</span>
      <ol className="m-0 list-none rounded-2xl border border-line bg-white py-1">
        {shown.map((r, i) => (
          <li key={r.tag}>
            <a href={playerHref(r.tag)} className={`flex min-h-[56px] items-center gap-3 px-3.5 py-1.5 text-ink no-underline hover:bg-hover ${i ? 'border-t border-hair' : ''}`}>
              <span className="w-6 flex-none text-right text-xs font-bold tabular-nums text-faint">{place.get(r) ?? '—'}</span>
              <Th th={r.th} />
              <span className="flex min-w-0 flex-auto flex-col gap-1">
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate text-[15px] font-semibold"><YouTag tag={r.tag} />{r.name}</span>
                  {clan === 'All' && <span className="flex-none text-[11px] font-bold" style={{ color: CLAN[r.clan].deep }}>{r.clan}</span>}
                </span>
                <Bar v={key(r)} color={COLOR[r.clan]} />
              </span>
              <span className="w-14 flex-none text-right text-sm font-extrabold tabular-nums">{sort === 'overall' ? pct1(key(r)) : pct(key(r))}</span>
              <RowChevron />
            </a>
          </li>
        ))}
      </ol>
      {shown.length < found.length && <button type="button" onClick={() => setEveryone(true)} className="min-h-11 w-full cursor-pointer rounded-2xl border border-line bg-white text-[13px] font-bold text-action hover:bg-page">Show all {found.length}</button>}
    </div>
  )
}
