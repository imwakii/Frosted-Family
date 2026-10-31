import { useEffect, useMemo, useRef, useState } from 'react'
import { EXPLORERS, type Column, type ExploreRow, fmt, useExplore } from '../explore'
import { go, playerHref } from '../route'
import { CLAN, CLANS } from '../theme'
import type { ClanName } from '../types'
import { norm, SearchBox } from './CwlTab'
import { Th } from './ui'

type Sort = { key: string; asc: boolean }

const read = (k: string) => { try { return sessionStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { sessionStorage.setItem(k, v) } catch { /* private mode */ } }

function Chip({ on, children, onClick, tint }: { on: boolean; children: React.ReactNode; onClick: () => void; tint?: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`flex min-h-9 flex-none cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border px-3.5 text-sm font-bold ${on ? 'border-transparent bg-ink text-white' : 'border-line bg-white text-muted hover:text-ink'}`}
      style={on && tint ? { background: tint } : undefined}>
      {children}
    </button>
  )
}

function SortArrow({ asc }: { asc: boolean }) {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
      <path d={asc ? 'M12 19V5M6 11l6-6 6 6' : 'M12 5v14M6 13l6 6 6-6'} />
    </svg>
  )
}

function Bar({ v }: { v: number | null }) {
  if (v === null) return null
  return (
    <span className="block h-1 w-full overflow-hidden rounded-full bg-hair">
      <span className="block h-full rounded-full bg-[#94A3B8]" style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
    </span>
  )
}

function Empty({ loading }: { loading: boolean }) {
  if (loading) {
    return <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-[52px] animate-pulse rounded-xl bg-well" />)}</div>
  }
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-white px-6 py-14 text-center">
      <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"><path d="M4 20h16M7 16V9M12 16V5M17 16v-4" /></svg>
      <span className="text-sm font-semibold text-faint">No data yet</span>
    </div>
  )
}

export default function ExploreTab({ kind, q, setQ, wide }: { kind: string | null; q: string; setQ: (v: string) => void; wide: boolean }) {
  // Rushed needs per-TH caps; the API sends cap: null until a cap table exists.
  const heroes = useExplore(['heroes'])
  const capsKnown = !!heroes.rows?.some((r) => r.heroes?.some((h) => h.cap))
  const explorers = EXPLORERS.filter((e) => e.id !== 'rushed' || capsKnown)
  const ex = explorers.find((e) => e.id === kind) ?? explorers[0]
  const [clan, setClan] = useState<ClanName | 'All'>(() => (read('ff-x-clan') as ClanName) || 'All')
  useEffect(() => write('ff-x-clan', clan), [clan])
  const { rows, loading, updated } = useExplore(ex.sources)
  const allCols = useMemo(() => ex.columns(rows ?? []), [ex, rows])
  // A column nobody has a value for is left out.
  const cols = useMemo(() => (rows ? allCols.filter((c) => rows.some((r) => c.value(r) !== null)) : allCols), [allCols, rows])
  const noData = !rows || !cols.length
  const [sort, setSort] = useState<Sort | null>(null)
  useEffect(() => setSort(null), [ex.id])
  const nav = useRef<HTMLElement>(null)
  useEffect(() => { nav.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }) }, [ex.id])
  const first = cols[0] ?? allCols[0]
  const active: Sort = sort && cols.some((c) => c.key === sort.key) ? sort : { key: first.key, asc: !!first.low }
  const col = cols.find((c) => c.key === active.key) ?? first

  const ranked = useMemo(() => {
    const pool = (rows ?? []).filter((r) => clan === 'All' || r.clan === clan)
    const v = (r: ExploreRow) => col.value(r)
    return pool
      .map((r) => ({ r, v: v(r) }))
      .sort((a, b) => (a.v === null ? 1 : b.v === null ? -1 : active.asc ? a.v - b.v : b.v - a.v) || a.r.name.localeCompare(b.r.name))
      .map((x, i) => ({ ...x, rank: x.v === null ? null : i + 1 }))
  }, [rows, clan, col, active.asc])

  const nq = norm(q.trim())
  const shown = nq ? ranked.filter((x) => norm(x.r.name).includes(nq) || x.r.tag.toLowerCase().includes(nq)) : ranked
  const pick = (c: Column) => setSort(active.key === c.key ? { key: c.key, asc: !active.asc } : { key: c.key, asc: !!c.low })
  const counts = Object.fromEntries(CLANS.map((k) => [k, (rows ?? []).filter((r) => r.clan === k).length]))
  const stamp = updated ? new Date(updated).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null

  return (
    <div className={wide ? 'mx-auto flex max-w-[1320px] flex-col gap-4 px-[clamp(16px,3vw,32px)] pb-12 pt-6' : 'flex flex-col gap-3 pb-6'}>
      <div className={wide ? 'max-w-[480px]' : 'sticky top-0 z-10 bg-page px-4 pb-3 pt-1'}>
        <SearchBox q={q} setQ={setQ} tall={wide} onEnter={() => { if (shown[0]) window.location.hash = playerHref(shown[0].r.tag) }} />
      </div>

      <nav ref={nav} aria-label="Explorer" className={`flex gap-2 overflow-x-auto [scrollbar-width:none] ${wide ? 'flex-wrap' : 'px-4'}`}>
        {explorers.map((e) => <Chip key={e.id} on={e.id === ex.id} onClick={() => go.to(`#/explore/${e.id}`)}>{e.label}</Chip>)}
      </nav>

      <div className={`flex flex-wrap items-center justify-between gap-3 ${wide ? '' : 'px-4'}`}>
        <div role="group" aria-label="Clan" className={`grid grid-cols-4 gap-1 rounded-xl bg-well p-1 ${wide ? 'w-[420px]' : 'w-full'}`}>
          {(['All', ...CLANS] as const).map((k) => (
            <button key={k} type="button" aria-pressed={k === clan} onClick={() => setClan(k)}
              className={`min-h-10 cursor-pointer rounded-[9px] border-0 text-sm font-bold ${k === clan ? 'bg-white shadow-[0_1px_3px_rgba(15,23,42,.12)]' : 'bg-transparent text-muted'}`}
              style={k === clan && k !== 'All' ? { color: CLAN[k].deep } : undefined}>
              {k}{k !== 'All' && rows ? <span className="font-semibold opacity-60"> {counts[k]}</span> : null}
            </button>
          ))}
        </div>
        {stamp && wide && <span className="text-xs font-semibold text-faint">Updated {stamp}</span>}
      </div>

      {noData ? <div className={wide ? '' : 'px-4'}><Empty loading={loading} /></div> : wide ? (
        <div className="overflow-x-auto rounded-[18px] border border-line bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
                <th className="w-12 py-3 pl-5 pr-2 font-bold">#</th>
                <th className="w-10 px-2 font-bold"><span className="sr-only">Town hall</span></th>
                <th className="px-2 font-bold">Name</th>
                {cols.map((c) => (
                  <th key={c.key} className="px-2 text-right font-bold last:pr-5" aria-sort={c.key === active.key ? (active.asc ? 'ascending' : 'descending') : undefined}>
                    <button type="button" onClick={() => pick(c)}
                      className={`ml-auto inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent px-1.5 text-[11px] font-bold uppercase tracking-[0.06em] ${c.key === active.key ? 'text-ink' : 'text-faint hover:text-ink'}`}>
                      {c.label}{c.key === active.key && <SortArrow asc={active.asc} />}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map(({ r, rank }) => {
                const flag = ex.flag?.(r)
                return (
                  <tr key={r.tag} onClick={() => go.to(playerHref(r.tag))} className="cursor-pointer border-t border-hair first:border-0 hover:bg-hover">
                    <td className="py-2 pl-5 pr-2 font-bold tabular-nums text-faint">{rank ?? '—'}</td>
                    <td className="px-2"><Th th={r.th} /></td>
                    <td className="px-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <a href={playerHref(r.tag)} onClick={(e) => e.stopPropagation()} className="truncate font-semibold text-ink no-underline">{r.name}</a>
                        <span className="flex-none text-xs font-bold" style={{ color: CLAN[r.clan].deep }}>{r.clan}</span>
                        {flag && <span className="flex-none rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[11px] font-semibold text-[#92400E]">{flag}</span>}
                      </span>
                    </td>
                    {cols.map((c) => (
                      <td key={c.key} className={`px-3.5 text-right tabular-nums last:pr-6 ${c.key === active.key ? 'font-extrabold text-ink' : 'font-semibold text-muted'}`}>{fmt(c.value(r), c.format)}</td>
                    ))}
                  </tr>
                )
              })}
              {!shown.length && <tr><td colSpan={3 + cols.length} className="p-5 text-sm text-faint">No one by that name</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div role="group" aria-label="Sort by" className="-mb-1 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none]">
            {cols.map((c) => (
              <button key={c.key} type="button" aria-pressed={c.key === active.key} onClick={() => pick(c)}
                className={`flex min-h-8 flex-none cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 text-[13px] font-bold ${c.key === active.key ? 'border-ink-2 bg-white text-ink' : 'border-transparent bg-transparent text-faint'}`}>
                {c.label}{c.key === active.key && <SortArrow asc={active.asc} />}
              </button>
            ))}
          </div>
          <ol className="m-0 mx-4 list-none rounded-2xl border border-line bg-white py-1">
            {shown.map(({ r, v, rank }, i) => {
              const flag = ex.flag?.(r)
              const rest = cols.filter((c) => c.key !== col.key).slice(0, 3)
              return (
                <li key={r.tag}>
                  <a href={playerHref(r.tag)} className={`flex min-h-[58px] items-center gap-3 px-3.5 py-2 text-ink no-underline hover:bg-hover ${i ? 'border-t border-hair' : ''}`}>
                    <span className="w-6 flex-none text-right text-[13px] font-bold tabular-nums text-faint">{rank ?? '—'}</span>
                    <Th th={r.th} />
                    <span className="flex min-w-0 flex-auto flex-col gap-0.5">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[15px] font-semibold">{r.name}</span>
                        {flag && <span className="flex-none rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[11px] font-semibold text-[#92400E]">{flag}</span>}
                      </span>
                      <span className="truncate text-xs text-faint">
                        <span className="font-bold" style={{ color: CLAN[r.clan].deep }}>{r.clan}</span>
                        {rest.map((c) => <span key={c.key}> · {c.label} {fmt(c.value(r), c.format)}</span>)}
                      </span>
                    </span>
                    <span className="flex w-16 flex-none flex-col items-end gap-1">
                      <span className="text-base font-extrabold tabular-nums">{fmt(v, col.format)}</span>
                      {col.bar && <Bar v={v} />}
                    </span>
                  </a>
                </li>
              )
            })}
            {!shown.length && <li className="p-4 text-sm text-faint">No one by that name</li>}
          </ol>
        </>
      )}
    </div>
  )
}
