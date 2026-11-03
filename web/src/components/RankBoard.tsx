import { YouTag } from './You'
import { useEffect, useMemo, useState } from 'react'
import { competitionRanks } from '../explore'
import { go, playerHref, useDrill } from '../route'
import { CLAN } from '../theme'
import type { ClanName } from '../types'
import { norm, PhoneSearch, SearchBox } from './CwlTab'
import { CategoryNav, ClanFilter, Empty, useClanPick } from './ExploreTab'
import { ShowAll, topRows, useShowAll } from './Top'
import { Picker, Th, RowChevron } from './ui'

// GET /api/explore/{donations|capital}: one row per current member from their latest profile.
type Row = { tag: string; name: string; clan: ClanName; th: number | null; [k: string]: unknown }
type Board = { updated_at: string | null; players: Row[] }
// chip and sub are the shorter names a phone uses, on its sort buttons and under each name.
export type RankCol = { key: string; label: string; value: (r: Row) => number | null; fmt?: (v: number) => string; chip?: string; sub?: string; subFmt?: (v: number) => string }

const cache = new Map<string, Promise<Board | null>>()

export function useBoard(kind: string) {
  const [state, setState] = useState<{ kind: string; data: Board | null; loading: boolean }>({ kind, data: null, loading: true })
  useEffect(() => {
    let live = true
    if (!cache.has(kind)) {
      cache.set(kind, fetch(`/api/explore/${kind}`, { headers: { Accept: 'application/json' } })
        .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null))
        .then((d) => (d && Array.isArray(d.players) ? (d as Board) : null))
        .catch(() => null))
    }
    cache.get(kind)!.then((data) => { if (live) setState({ kind, data, loading: false }) })
    return () => { live = false }
  }, [kind])
  return state.kind === kind ? state : { kind, data: null, loading: true }
}

const num = (v: number) => v.toLocaleString('en-GB')

/** A ranked table of members by one of several columns, with the clan filter and search the other boards have. */
export default function RankBoard({ kind, cols, note, q, setQ, wide }: {
  kind: string; cols: RankCol[]; note?: string; q: string; setQ: (v: string) => void; wide: boolean
}) {
  const { data, loading } = useBoard(kind)
  const [clan, setClan] = useClanPick()
  const [sortKey, setSortKey] = useState(cols[0].key)
  const top = useShowAll(`${kind}-${sortKey}-${clan}`)
  const col = cols.find((c) => c.key === sortKey) ?? cols[0]
  useDrill((d) => !!data && cols.some((c) => c.key === d.col), (d) => setSortKey(d.col!))
  const nq = norm(q.trim())
  const all = useMemo(() => data?.players ?? [], [data])
  const ranked = all.filter((r) => clan === 'All' || r.clan === clan)
    .map((r) => ({ r, v: col.value(r) }))
    .sort((a, b) => (a.v === null ? (b.v === null ? 0 : 1) : b.v === null ? -1 : b.v - a.v) || a.r.name.localeCompare(b.r.name))
  const place = competitionRanks(ranked, (x) => x.v)
  const shown = ranked.filter(({ r }) => !nq || norm(r.name).includes(nq) || r.tag.toLowerCase().includes(nq))
  const listed = wide ? shown : topRows(shown, (x) => x.r.tag, top.yous, top.all || !!nq)
  const enter = () => { if (shown[0]) go.to(playerHref(shown[0].r.tag)) }
  const fmt = (c: RankCol, v: number | null) => (v === null ? '—' : (c.fmt ?? num)(v))
  const stamp = data?.updated_at ? `${new Date(data.updated_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })} UTC` : null
  const chips = (
    <>
      <span className="font-semibold">Ranked by {col.label.toLowerCase()}</span>
      {note && <span className="text-xs font-semibold text-faint">{note}</span>}
      {stamp && <span className="text-xs font-semibold text-faint">Updated {stamp}</span>}
    </>
  )

  const board = !all.length ? <Empty loading={loading} /> : wide ? (
    <section className="max-h-[calc(100dvh-210px)] overflow-auto rounded-2xl border border-line bg-white">
      <table className="min-w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-left text-xs font-bold text-faint">
            <th className="sticky left-0 top-0 z-[4] w-12 min-w-12 border-b border-line bg-white py-2.5 pl-4 pr-1">#</th>
            <th className="sticky left-12 top-0 z-[4] min-w-[220px] border-b border-line bg-white px-2">PLAYER</th>
            {cols.map((c) => (
              <th key={c.key} className={`sticky top-0 z-[2] border-b border-line p-0 text-right ${c.key === col.key ? 'bg-[#F1E8D3]' : 'bg-white'}`} aria-sort={c.key === col.key ? 'descending' : undefined}>
                <button type="button" onClick={() => setSortKey(c.key)}
                  className={`min-h-12 w-full cursor-pointer whitespace-nowrap border-0 bg-transparent px-4 text-right text-xs font-bold hover:bg-[#F1E8D3] ${c.key === col.key ? 'text-ink' : 'text-faint'}`}>
                  {c.label}{c.key === col.key ? ' ↓' : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((x) => { const r = x.r; return (
            <tr key={r.tag} data-tag={r.tag} onClick={() => go.to(playerHref(r.tag))} className="group cursor-pointer">
              <td className="sticky left-0 z-[1] border-b border-hair bg-white py-1.5 pl-4 pr-1 font-bold tabular-nums text-faint group-hover:bg-hover">{place.get(x) ?? '—'}</td>
              <td className="sticky left-12 z-[1] whitespace-nowrap border-b border-hair bg-white px-2 py-1.5 group-hover:bg-hover">
                <span className="flex items-center gap-2.5">
                  <Th th={r.th} />
                  <a href={playerHref(r.tag)} onClick={(e) => e.stopPropagation()} className="font-semibold text-ink no-underline"><YouTag tag={r.tag} />{r.name}</a>
                  {clan === 'All' && <span className="text-[11px] font-bold" style={{ color: CLAN[r.clan].deep }}>{r.clan}</span>}
                </span>
              </td>
              {cols.map((c) => (
                <td key={c.key} className={`border-b border-hair px-4 py-1.5 text-right tabular-nums group-hover:bg-hover ${c.key === col.key ? 'bg-[#F6EEDC] font-extrabold text-ink' : 'font-semibold text-ink-2'}`}>{fmt(c, c.value(r))}</td>
              ))}
            </tr>
          ) })}
        </tbody>
      </table>
    </section>
  ) : (
    <ol className="m-0 list-none rounded-2xl border border-line bg-white py-1">
      {listed.map((x, i) => (
        <li key={x.r.tag} data-tag={x.r.tag}>
          <a href={playerHref(x.r.tag)} className={`flex min-h-[52px] items-center gap-3 px-3.5 py-1.5 text-ink no-underline hover:bg-hover ${i ? 'border-t border-hair' : ''}`}>
            <span className="w-6 flex-none text-right text-xs font-bold tabular-nums text-faint">{place.get(x) ?? '—'}</span>
            <Th th={x.r.th} />
            <span className="flex min-w-0 flex-auto flex-col">
              <span className="truncate text-[15px] font-semibold"><YouTag tag={x.r.tag} />{x.r.name}</span>
              <span className="truncate text-xs text-muted">
                {cols.filter((c) => c.key !== col.key).map((c) => { const v = c.value(x.r); return `${c.sub ?? c.label} ${v !== null && c.subFmt ? c.subFmt(v) : fmt(c, v)}` }).join(' · ')}
              </span>
            </span>
            <span className="flex-none text-right text-sm font-extrabold tabular-nums">{fmt(col, x.v)}</span>
            <RowChevron />
          </a>
        </li>
      ))}
    </ol>
  )

  if (wide) {
    return (
      <main className="mx-auto flex max-w-[1360px] flex-col gap-3.5 px-[clamp(16px,3vw,32px)] pb-12 pt-5">
        <div className="flex items-center justify-between gap-4">
          <ClanFilter clan={clan} setClan={setClan} />
          <div className="w-[clamp(220px,28vw,340px)] flex-none"><SearchBox q={q} setQ={setQ} onEnter={enter} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5"><CategoryNav current={kind} wide /></div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          {all.length > 0 && chips}
        </div>
        {board}
      </main>
    )
  }
  return (
    <div className="flex flex-col gap-2.5 pb-6">
      <PhoneSearch q={q} setQ={setQ} onEnter={enter}><ClanFilter clan={clan} setClan={setClan} /></PhoneSearch>
      <CategoryNav current={kind} wide={false}>
        <Picker label="Rank by" value={col.key} options={cols.map((c) => ({ id: c.key, label: c.chip ?? c.label }))} onPick={setSortKey} />
        {note && <span className="ml-auto text-xs font-semibold text-faint">{note}</span>}
      </CategoryNav>
      <div className="flex flex-col gap-2 px-4">
        {board}
        {listed.length < shown.length && <ShowAll total={shown.length} onClick={() => top.setAll(true)} />}
      </div>
    </div>
  )
}
