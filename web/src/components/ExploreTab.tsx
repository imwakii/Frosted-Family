import { useEffect, useMemo, useRef, useState } from 'react'
import { useClans } from '../clash'
import { CATS, type Cat, isMaxed, type MatrixPlayer, progress, useMatrix } from '../explore'
import { go, playerHref } from '../route'
import { CLAN, CLANS } from '../theme'
import type { ClanName } from '../types'
import { norm, SearchBox } from './CwlTab'
import { ClanBadge, Star, Th, UnitIcon } from './ui'

type ClanPick = ClanName | 'All'

const read = (k: string) => { try { return sessionStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { sessionStorage.setItem(k, v) } catch { /* private mode */ } }

function ClanFilter({ clan, setClan, counts, wide }: { clan: ClanPick; setClan: (c: ClanPick) => void; counts: Record<string, number>; wide: boolean }) {
  const clans = useClans()
  return (
    <div role="group" aria-label="Clan" className={`gap-1 rounded-xl bg-well p-1 ${wide ? 'inline-grid flex-none auto-cols-max grid-flow-col' : 'grid grid-cols-4'}`}>
      {(['All', ...CLANS] as const).map((k) => (
        <button key={k} type="button" aria-pressed={k === clan} onClick={() => setClan(k)}
          className={`flex min-h-10 cursor-pointer items-center justify-center gap-1 rounded-[9px] border-0 text-sm font-bold ${wide ? 'px-3' : 'px-1'} ${k === clan ? 'bg-white shadow-[0_1px_3px_rgba(15,23,42,.12)]' : 'bg-transparent text-muted'}`}
          style={k === clan && k !== 'All' ? { color: CLAN[k].deep } : undefined}>
          {k !== 'All' && <ClanBadge src={clans[k]?.badge} size={20} />}
          {k}{k !== 'All' && counts[k] ? <span className="font-semibold opacity-60">{counts[k]}</span> : null}
        </button>
      ))}
    </div>
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

const cellTone = (l: number | null, max: number) =>
  l === null || l === 0 ? 'text-[#CBD5E1]' : l >= max ? 'font-extrabold text-ink' : l < max * 0.6 ? 'font-semibold text-[#94A3B8]' : 'font-semibold text-ink-2'

export default function ExploreTab({ kind, q, setQ, wide }: { kind: string | null; q: string; setQ: (v: string) => void; wide: boolean }) {
  const cat: Cat = (CATS.find((c) => c.id === kind)?.id ?? 'heroes') as Cat
  const { data, loading } = useMatrix(cat)
  const [clan, setClanState] = useState<ClanPick>(() => (read('ff-x-clan') as ClanPick) || 'All')
  const setClan = (c: ClanPick) => { setClanState(c); write('ff-x-clan', c) }
  const [sort, setSort] = useState<{ col: number; asc: boolean }>({ col: -1, asc: false })
  const [unit, setUnit] = useState(0)
  useEffect(() => { setSort({ col: -1, asc: false }); setUnit(0) }, [cat])

  const units = useMemo(() => data?.units ?? [], [data])
  const nq = norm(q.trim())
  const pool = useMemo(() => (data?.players ?? []).filter((p) => clan === 'All' || p.clan === clan), [data, clan])
  const counts = Object.fromEntries(CLANS.map((k) => [k, (data?.players ?? []).filter((p) => p.clan === k).length]))
  const matchQ = (p: MatrixPlayer) => !nq || norm(p.name).includes(nq) || p.tag.toLowerCase().includes(nq)
  const stamp = data?.as_of ? new Date(data.as_of).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null

  const catNav = useRef<HTMLElement>(null)
  useEffect(() => { catNav.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }) }, [cat])
  const unitNav = useRef<HTMLDivElement>(null)
  useEffect(() => { unitNav.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' }) }, [unit, cat])

  if (wide) {
    const rows = pool.map((p) => ({ p, pct: progress(p.levels, units), maxed: units.every((u, i) => isMaxed(p.levels[i], u)) }))
    const key = (r: (typeof rows)[number]) => (sort.col < 0 ? r.pct : r.p.levels[sort.col] ?? -1)
    rows.sort((a, b) => (sort.asc ? key(a) - key(b) : key(b) - key(a)) || b.pct - a.pct || a.p.name.localeCompare(b.p.name))
    const maxedN = rows.filter((r) => r.maxed).length
    const shown = rows.filter((r) => matchQ(r.p))
    const pick = (col: number) => setSort((s) => (s.col === col ? { col, asc: !s.asc } : { col, asc: false }))
    const catLabel = CATS.find((c) => c.id === cat)!.label.toLowerCase()

    return (
      <main className="mx-auto flex max-w-[1360px] flex-col gap-3.5 px-[clamp(16px,3vw,32px)] pb-12 pt-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <nav aria-label="Category" className="flex flex-wrap gap-1 rounded-[14px] bg-well p-1">
            {CATS.map((c) => (
              <button key={c.id} type="button" aria-pressed={c.id === cat} onClick={() => go.to(`#/explore/${c.id}`)}
                className={`flex min-h-[42px] cursor-pointer items-center gap-1.5 rounded-[10px] border-0 pl-2.5 pr-3.5 text-sm font-bold ${c.id === cat ? 'bg-white text-ink shadow-[0_1px_3px_rgba(15,23,42,.12)]' : 'bg-transparent text-muted hover:text-ink'}`}>
                {c.icon && <UnitIcon name={c.icon} size={24} />}{c.label}
              </button>
            ))}
          </nav>
          <ClanFilter clan={clan} setClan={setClan} counts={counts} wide />
          <div className="ml-auto min-w-[200px] max-w-[320px] flex-auto">
            <SearchBox q={q} setQ={setQ} onEnter={() => { if (shown[0]) go.to(playerHref(shown[0].p.tag)) }} />
          </div>
        </div>

        {!data ? <Empty loading={loading} /> : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <span className="rounded-full border border-line bg-white px-3 py-1.5 font-bold text-ink"><Star /> {maxedN} of {rows.length} fully maxed</span>
              <span className="rounded-full border border-line bg-white px-3 py-1.5 font-semibold">Ranked by {sort.col < 0 ? `${catLabel} progress` : units[sort.col]?.name}</span>
              {stamp && <span className="ml-auto text-xs font-semibold text-faint">Updated {stamp}</span>}
            </div>
            <section className="overflow-auto rounded-[18px] border border-line bg-white">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-[2] min-w-[210px] border-b border-line bg-white px-3 py-2.5 text-left text-xs font-bold text-faint">PLAYER</th>
                    <th className={`border-b border-line p-0 ${sort.col < 0 ? 'bg-[#EEF2FF]' : 'bg-white'}`} aria-sort={sort.col < 0 ? (sort.asc ? 'ascending' : 'descending') : undefined}>
                      <button type="button" onClick={() => pick(-1)} className="min-h-16 w-24 cursor-pointer border-0 bg-transparent text-xs font-bold text-ink-2 hover:bg-[#EEF2FF]">Progress</button>
                    </th>
                    {units.map((u, i) => (
                      <th key={u.name} className={`border-b border-line p-0 ${sort.col === i ? 'bg-[#EEF2FF]' : 'bg-white'}`} aria-sort={sort.col === i ? (sort.asc ? 'ascending' : 'descending') : undefined}>
                        <button type="button" onClick={() => pick(i)} title={`${u.name} · max ${u.max}`} aria-label={`Sort by ${u.name}`}
                          className="flex min-h-16 w-14 cursor-pointer flex-col items-center justify-center gap-0.5 border-0 bg-transparent px-0.5 py-1 hover:bg-[#EEF2FF]">
                          <UnitIcon name={u.name} size={36} />
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map(({ p, pct }) => (
                    <tr key={p.tag} onClick={() => go.to(playerHref(p.tag))} className="group cursor-pointer">
                      <td className="sticky left-0 z-[1] whitespace-nowrap border-b border-hair bg-white px-3 py-1.5 group-hover:bg-hover">
                        <span className="flex items-center gap-2.5">
                          <Th th={p.th} />
                          <a href={playerHref(p.tag)} onClick={(e) => e.stopPropagation()} className="font-semibold text-ink no-underline">{p.name}</a>
                          {clan === 'All' && <span className="text-xs font-bold" style={{ color: CLAN[p.clan].deep }}>{p.clan}</span>}
                        </span>
                      </td>
                      <td className={`border-b border-hair px-2.5 py-1.5 group-hover:bg-hover ${sort.col < 0 ? 'bg-[#F5F7FF]' : ''}`}>
                        <span className="flex w-[76px] flex-col gap-[3px]">
                          <span className="font-bold tabular-nums">{Math.round(pct)}%</span>
                          <span className="block h-[5px] overflow-hidden rounded-[3px] bg-[#E2E8F0]"><span className="block h-[5px] bg-ink" style={{ width: `${pct}%` }} /></span>
                        </span>
                      </td>
                      {units.map((u, i) => {
                        const l = p.levels[i]
                        return (
                          <td key={u.name} className={`h-11 border-b border-hair px-1 text-center tabular-nums group-hover:bg-hover ${sort.col === i ? 'bg-[#F5F7FF]' : ''} ${cellTone(l, u.max)}`}>
                            {l ? l : '—'}{isMaxed(l, u) && <span className="ml-px align-[4px] text-[11px] text-gold">★</span>}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  {!shown.length && <tr><td colSpan={2 + units.length} className="p-5 text-sm text-faint">No one by that name</td></tr>}
                </tbody>
              </table>
            </section>
          </>
        )}
      </main>
    )
  }

  // Phone: one unit at a time, ranked.
  const u = units[Math.min(unit, Math.max(0, units.length - 1))]
  const ranked = u ? pool
    .map((p) => ({ p, l: p.levels[units.indexOf(u)] ?? 0 }))
    .sort((a, b) => b.l - a.l || a.p.name.localeCompare(b.p.name))
    .map((x, i) => ({ ...x, rank: i + 1 })) : []
  const maxedN = u ? ranked.filter((r) => r.l >= u.max).length : 0
  const shown = ranked.filter((r) => matchQ(r.p))

  return (
    <div className="flex flex-col gap-2.5 pb-6">
      <div className="sticky top-0 z-10 bg-page px-4 pb-2 pt-1">
        <SearchBox q={q} setQ={setQ} onEnter={() => { if (shown[0]) go.to(playerHref(shown[0].p.tag)) }} />
      </div>
      <div className="px-4"><ClanFilter clan={clan} setClan={setClan} counts={counts} wide={false} /></div>
      <nav ref={catNav} aria-label="Category" className="flex flex-none gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
        {CATS.map((c) => (
          <button key={c.id} type="button" aria-pressed={c.id === cat} onClick={() => go.to(`#/explore/${c.id}`)}
            className={`min-h-10 flex-none cursor-pointer rounded-full border px-3.5 text-sm font-bold ${c.id === cat ? 'border-ink bg-ink text-white' : 'border-line bg-white text-muted'}`}>
            {c.label}
          </button>
        ))}
      </nav>
      {!data || !u ? <div className="px-4"><Empty loading={loading} /></div> : (
        <>
          <div ref={unitNav} role="listbox" aria-label="Unit" className="flex flex-none gap-2 overflow-x-auto px-4 pb-2 pt-1 [scrollbar-width:none]">
            {units.map((x, i) => (
              <button key={x.name} type="button" role="option" aria-selected={x === u} aria-label={x.name} onClick={() => setUnit(i)}
                className={`flex size-[60px] flex-none cursor-pointer items-center justify-center rounded-2xl p-0 ${x === u ? 'border-2 border-action bg-[#EFF5FF] shadow-[0_2px_8px_rgba(37,99,235,.2)]' : 'border border-line bg-white'}`}>
                <UnitIcon name={x.name} size={44} />
              </button>
            ))}
          </div>
          <div className="flex items-baseline justify-between gap-3 px-4">
            <span className="font-display truncate text-xl">{u.name}</span>
            <span className="flex-none text-[13px] font-semibold text-muted"><Star /> {maxedN} of {ranked.length} maxed</span>
          </div>
          <ol className="m-0 mx-4 list-none rounded-2xl border border-line bg-white py-1">
            {shown.map(({ p, l, rank }, i) => {
              const maxed = l >= u.max
              return (
                <li key={p.tag}>
                  <a href={playerHref(p.tag)} className={`flex min-h-[54px] items-center gap-2.5 px-3.5 py-1.5 text-ink no-underline hover:bg-hover ${i ? 'border-t border-hair' : ''}`}>
                    <span className="w-6 flex-none text-right text-xs tabular-nums text-faint">{rank}</span>
                    <Th th={p.th} />
                    <span className="flex min-w-0 flex-auto flex-col gap-1">
                      <span className="flex min-w-0 items-baseline gap-1.5">
                        <span className="truncate text-[15px] font-semibold">{p.name}</span>
                        {clan === 'All' && <span className="flex-none text-[11px] font-bold" style={{ color: CLAN[p.clan].deep }}>{p.clan}</span>}
                      </span>
                      <span className="block h-[5px] overflow-hidden rounded-[3px] bg-[#E2E8F0]">
                        <span className="block h-[5px]" style={{ width: `${(100 * Math.min(l, u.max)) / u.max}%`, background: maxed ? '#E0A100' : '#0F172A' }} />
                      </span>
                    </span>
                    <span className={`w-[78px] flex-none whitespace-nowrap text-right text-sm tabular-nums ${maxed ? 'font-extrabold text-ink' : l ? 'font-semibold text-muted' : 'text-[#CBD5E1]'}`}>
                      {l ? `${l} / ${u.max}` : '—'}{maxed && <span className="ml-0.5 text-gold">★</span>}
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
