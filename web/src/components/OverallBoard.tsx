import { useMemo, useState } from 'react'
import { CATS, type Cat, competitionRanks, type Matrix, progress, useMatrix } from '../explore'
import { go, playerHref } from '../route'
import { CLAN, CLANS } from '../theme'
import type { ClanName } from '../types'
import { norm, SearchBox } from './CwlTab'
import { CategoryNav, ClanFilter, Empty, useClanPick } from './ExploreTab'
import { Th } from './ui'

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

function Bar({ v, color }: { v: number; color: string }) {
  return <span className="block h-1.5 w-full overflow-hidden rounded-full bg-well"><span className="block h-full rounded-full" style={{ width: `${Math.min(v, 100)}%`, background: color }} /></span>
}

export default function OverallBoard({ q, setQ, wide }: { q: string; setQ: (v: string) => void; wide: boolean }) {
  // One hook per category, in the fixed CATS order.
  const boards = CATS.map((c) => useMatrix(c.id)) // eslint-disable-line react-hooks/rules-of-hooks
  const loading = boards.some((b) => b.loading)
  const all = useMemo(() => (loading ? [] : combine(boards.map((b) => b.data))), [loading, ...boards.map((b) => b.data)]) // eslint-disable-line react-hooks/exhaustive-deps
  const [clan, setClan] = useClanPick()
  const [sort, setSort] = useState<Cat | 'overall'>('overall')
  const nq = norm(q.trim())

  const counts = Object.fromEntries(CLANS.map((k) => [k, all.filter((r) => r.clan === k).length]))
  const key = (r: Row) => (sort === 'overall' ? r.overall : r.cats[sort] ?? -1)
  const ranked = all.filter((r) => clan === 'All' || r.clan === clan).sort((a, b) => key(b) - key(a) || b.overall - a.overall || a.name.localeCompare(b.name))
  const place = competitionRanks(ranked, (r) => Math.round(key(r) * 10) / 10)
  const shown = ranked.filter((r) => !nq || norm(r.name).includes(nq) || r.tag.toLowerCase().includes(nq))
  const enter = () => { if (shown[0]) go.to(playerHref(shown[0].tag)) }
  const cols: { id: Cat | 'overall'; label: string }[] = [{ id: 'overall', label: 'Overall' }, ...CATS.map((c) => ({ id: c.id, label: c.label }))]

  const board = !all.length ? <Empty loading={loading} /> : wide ? (
    <section className="max-h-[calc(100dvh-210px)] overflow-auto rounded-[18px] border border-line bg-white">
      <table className="min-w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-left text-xs font-bold text-faint">
            <th className="sticky left-0 top-0 z-[4] w-12 min-w-12 border-b border-line bg-white py-2.5 pl-4 pr-1">#</th>
            <th className="sticky left-12 top-0 z-[4] min-w-[220px] border-b border-line bg-white px-2">PLAYER</th>
            {cols.map((c) => (
              <th key={c.id} className={`sticky top-0 z-[2] border-b border-line p-0 text-right ${c.id === sort ? 'bg-[#EEF2FF]' : 'bg-white'}`} aria-sort={c.id === sort ? 'descending' : undefined}>
                <button type="button" onClick={() => setSort(c.id)}
                  className={`min-h-12 w-full cursor-pointer whitespace-nowrap border-0 bg-transparent px-4 text-right text-xs font-bold hover:bg-[#EEF2FF] ${c.id === sort ? 'text-ink' : 'text-faint'}`}>
                  {c.label}{c.id === sort ? ' ↓' : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.tag} onClick={() => go.to(playerHref(r.tag))} className="group cursor-pointer">
              <td className="sticky left-0 z-[1] border-b border-hair bg-white py-1.5 pl-4 pr-1 font-bold tabular-nums text-faint group-hover:bg-hover">{place.get(r) ?? '—'}</td>
              <td className="sticky left-12 z-[1] whitespace-nowrap border-b border-hair bg-white px-2 py-1.5 group-hover:bg-hover">
                <span className="flex items-center gap-2.5">
                  <Th th={r.th} />
                  <a href={playerHref(r.tag)} onClick={(e) => e.stopPropagation()} className="font-semibold text-ink no-underline">{r.name}</a>
                  {clan === 'All' && <span className="text-[11px] font-bold" style={{ color: CLAN[r.clan].deep }}>{r.clan}</span>}
                </span>
              </td>
              <td className="min-w-[150px] border-b border-hair px-4 py-1.5 group-hover:bg-hover">
                <span className="flex items-center gap-2.5"><Bar v={r.overall} color={CLAN[r.clan].deep} /><span className="w-10 flex-none text-right font-extrabold tabular-nums text-ink">{pct(r.overall)}</span></span>
              </td>
              {CATS.map((c) => <td key={c.id} className="border-b border-hair px-4 py-1.5 text-right font-semibold tabular-nums text-ink-2 group-hover:bg-hover">{pct(r.cats[c.id])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  ) : (
    <ol className="m-0 list-none rounded-2xl border border-line bg-white py-1">
      {shown.map((r, i) => (
        <li key={r.tag}>
          <a href={playerHref(r.tag)} className={`flex min-h-[56px] items-center gap-3 px-3.5 py-1.5 text-ink no-underline hover:bg-hover ${i ? 'border-t border-hair' : ''}`}>
            <span className="w-6 flex-none text-right text-xs font-bold tabular-nums text-faint">{place.get(r) ?? '—'}</span>
            <Th th={r.th} />
            <span className="flex min-w-0 flex-auto flex-col gap-1">
              <span className="truncate text-[15px] font-semibold">{r.name}</span>
              <Bar v={key(r)} color={CLAN[r.clan].deep} />
            </span>
            <span className="w-11 flex-none text-right text-sm font-extrabold tabular-nums">{pct(key(r))}</span>
          </a>
        </li>
      ))}
    </ol>
  )

  if (wide) {
    return (
      <main className="mx-auto flex max-w-[1360px] flex-col gap-3.5 px-[clamp(16px,3vw,32px)] pb-12 pt-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <CategoryNav current="overall" wide />
          <ClanFilter clan={clan} setClan={setClan} counts={counts} wide />
        </div>
        <div className="ml-auto w-full max-w-[320px]"><SearchBox q={q} setQ={setQ} onEnter={enter} /></div>
        {board}
      </main>
    )
  }
  return (
    <div className="flex flex-col gap-2.5 pb-6">
      <div className="sticky top-0 z-10 bg-page px-4 pb-2 pt-1"><SearchBox q={q} setQ={setQ} onEnter={enter} /></div>
      <div className="px-4"><ClanFilter clan={clan} setClan={setClan} counts={counts} wide={false} /></div>
      <CategoryNav current="overall" wide={false} />
      <div role="group" aria-label="Rank by" className="flex gap-1 overflow-x-auto px-4 [scrollbar-width:none]">
        {cols.map((c) => (
          <button key={c.id} type="button" aria-pressed={c.id === sort} onClick={() => setSort(c.id)}
            className={`flex min-h-8 flex-none cursor-pointer items-center whitespace-nowrap rounded-lg border px-2.5 text-[13px] font-bold ${c.id === sort ? 'border-ink-2 bg-white text-ink' : 'border-transparent bg-transparent text-faint'}`}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="px-4">{board}</div>
    </div>
  )
}
