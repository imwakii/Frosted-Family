import { YouTag } from './You'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { groupUnits } from '../equipment'
import OverallBoard, { Bar } from './OverallBoard'
import RankBoard, { type RankCol } from './RankBoard'
import { CATS, type Cat, competitionRanks, HIGH_MISS, isMaxed, type MatrixPlayer, missRate, progress, useMatrix, useWarBoard, type WarRow, type WarScope } from '../explore'
import { go, onDrill, playerHref, upgradeHref, useDrill } from '../route'
import { CLAN, CLANS } from '../theme'
import type { ClanName } from '../types'
import { norm, SearchBox } from './CwlTab'
import BadgesBoard from './BadgesBoard'
import ClansBoard, { COLOR } from './ClansBoard'
import HistoryBoard from './HistoryBoard'
import { ClanSwitch, Star, StatusKey, SubNav, Th, UnitIcon, RowChevron, chip } from './ui'

export type ClanPick = ClanName | 'All'
type BoardProps = { q: string; setQ: (v: string) => void; wide: boolean }

// Players: all upgrades together, one unit matrix per category, then past a divider the two rankings that are not upgrades.
const NAV: { id: string; label: string; icon: string | null }[] = [
  { id: 'overall', label: 'Upgrades', icon: null }, ...CATS, { id: 'donations', label: 'Donations', icon: null }, { id: 'capital', label: 'Capital', icon: null },
]

const SUBS = [
  { id: 'players', label: 'Players', href: '#/stats/players' },
  { id: 'badges', label: 'Badges', href: '#/stats/badges' },
  { id: 'war', label: 'War', href: '#/stats/war' },
  { id: 'trends', label: 'Trends', href: '#/stats/trends' },
  { id: 'history', label: 'History', href: '#/stats/history' },
]

type Gift = { donated: number; received: number } | null
type Cap = { contributed: number | null; raid_loot: number | null; raid_attacks: number | null } | null
const DONATION_COLS: RankCol[] = [
  { key: 'donated', label: 'Donated', value: (r) => (r.donations as Gift)?.donated ?? null },
  { key: 'received', label: 'Received', value: (r) => (r.donations as Gift)?.received ?? null },
  { key: 'ratio', label: 'Ratio', value: (r) => { const d = r.donations as Gift; return d && d.received ? d.donated / d.received : null }, fmt: (v) => v.toFixed(1) },
]
const CAPITAL_COLS: RankCol[] = [
  { key: 'loot', label: 'Last raid loot', chip: 'Raid loot', sub: 'Loot', value: (r) => (r.capital as Cap)?.raid_loot ?? null },
  { key: 'attacks', label: 'Last raid attacks', chip: 'Raid attacks', sub: 'Attacks', value: (r) => (r.capital as Cap)?.raid_attacks ?? null },
  { key: 'contributed', label: 'All-time contributed', chip: 'All-time', sub: 'All-time', subFmt: (v) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v.toLocaleString('en-GB')), value: (r) => (r.capital as Cap)?.contributed ?? null },
]

export function useClanPick() {
  const [clan, setClanState] = useState<ClanPick>(() => (read('ff-x-clan') as ClanPick) || 'All')
  onDrill(useCallback(() => setClanState('All'), []))
  return [clan, (c: ClanPick) => { setClanState(c); write('ff-x-clan', c) }] as const
}

export function CategoryNav({ current, wide }: { current: string; wide: boolean }) {
  const navRef = useRef<HTMLElement>(null)
  useEffect(() => { navRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }) }, [current])
  return (
    <nav ref={navRef} aria-label="Category" className={`flex flex-none gap-1.5 overflow-x-auto [scrollbar-width:none] ${wide ? 'max-w-full flex-wrap' : 'px-4'}`}>
      {NAV.map((c) => (
        <Fragment key={c.id}>
          {c.id === 'donations' && <span aria-hidden="true" className="mx-1 my-1.5 w-px flex-none bg-line" />}
          <button type="button" aria-pressed={c.id === current} onClick={() => go.to(`#/stats/players/${c.id}`)} className={chip(c.id === current)}>
            {wide && c.icon && <UnitIcon name={c.icon} size={22} />}{c.label}
          </button>
        </Fragment>
      ))}
    </nav>
  )
}

const read = (k: string) => { try { return sessionStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { sessionStorage.setItem(k, v) } catch { /* private mode */ } }

export function ClanFilter({ clan, setClan }: { clan: ClanPick; setClan: (c: ClanPick) => void }) {
  return <ClanSwitch<ClanPick> value={clan} onPick={setClan} options={['All', ...CLANS]} />
}

export function Empty({ loading }: { loading: boolean }) {
  if (loading) {
    return <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-[52px] animate-pulse rounded-xl bg-well" />)}</div>
  }
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-white px-6 py-14 text-center">
      <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#A3957C" strokeWidth="2" strokeLinecap="round"><path d="M4 20h16M7 16V9M12 16V5M17 16v-4" /></svg>
      <span className="text-sm font-semibold text-faint">No data yet</span>
    </div>
  )
}

const cellTone = (l: number | null, max: number) =>
  l === null || l === 0 ? 'text-[#D5C8AC]' : l >= max ? 'font-extrabold text-ink' : l < max * 0.6 ? 'font-semibold text-[#A3957C]' : 'font-semibold text-ink-2'

export default function ExploreTab({ sub, kind, ...rest }: BoardProps & { sub: string; kind: string | null }) {
  const id = NAV.find((c) => c.id === kind)?.id ?? 'overall'
  const board = sub === 'badges' ? <BadgesBoard {...rest} />
    : sub === 'history' ? <HistoryBoard {...rest} />
    : sub === 'war' ? <WarBoardView {...rest} />
    : sub === 'trends' ? (
      <main className={rest.wide ? 'mx-auto max-w-[1360px] px-[clamp(16px,3vw,32px)] pb-12 pt-5' : 'pb-6 pt-3'}><ClansBoard wide={rest.wide} /></main>
    )
    : id === 'overall' ? <OverallBoard {...rest} />
    : id === 'donations' ? <RankBoard key="donations" kind="donations" cols={DONATION_COLS} note="This season" {...rest} />
    : id === 'capital' ? <RankBoard key="capital" kind="capital" cols={CAPITAL_COLS} {...rest} />
    : <MatrixBoard cat={id as Cat} {...rest} />
  return <><SubNav items={SUBS} current={sub} wide={rest.wide} />{board}</>
}

function MatrixBoard({ cat, q, setQ, wide }: BoardProps & { cat: Cat }) {
  const { data, loading } = useMatrix(cat)
  const [clan, setClan] = useClanPick()
  const [sort, setSort] = useState<{ col: number; asc: boolean }>({ col: -1, asc: false })
  const [unit, setUnit] = useState<number | null>(null)
  useEffect(() => { setSort({ col: -1, asc: false }); setUnit(null) }, [cat])

  const units = useMemo(() => data?.units ?? [], [data])
  // Equipment groups by hero; other categories are one group in the API's order.
  const groups = useMemo(() => groupUnits(cat, units), [cat, units])
  const order = groups.flatMap((g) => g.idx)
  const opensGroup = new Set(groups.slice(1).map((g) => g.idx[0]))
  const byHero = groups.some((g) => g.hero)
  const divider = (i: number) => (opensGroup.has(i) ? 'border-l border-l-line' : '')
  const nq = norm(q.trim())
  const pool = useMemo(() => (data?.players ?? []).filter((p) => clan === 'All' || p.clan === clan), [data, clan])
  const matchQ = (p: MatrixPlayer) => !nq || norm(p.name).includes(nq) || p.tag.toLowerCase().includes(nq)
  const stamp = data?.as_of ? `${new Date(data.as_of).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })} UTC` : null

  useDrill((d) => units.some((x) => x.name === d.unit), (d) => {
    const i = units.findIndex((x) => x.name === d.unit)
    setSort({ col: i, asc: false })
    setUnit(i)
  })

  const unitNav = useRef<HTMLDivElement>(null)
  useEffect(() => { unitNav.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' }) }, [unit, cat])

  if (wide) {
    const rows = pool.map((p) => ({ p, pct: progress(p.levels, units), maxed: units.every((u, i) => isMaxed(p.levels[i], u)) }))
    const key = (r: (typeof rows)[number]) => (sort.col < 0 ? r.pct : r.p.levels[sort.col] ?? -1)
    rows.sort((a, b) => (sort.asc ? key(a) - key(b) : key(b) - key(a)) || b.pct - a.pct || a.p.name.localeCompare(b.p.name))
    // # is the overall position by category progress, whatever column is sorted.
    const place = competitionRanks(rows, (r) => Math.round(r.pct * 10) / 10)
    const maxedN = rows.filter((r) => r.maxed).length
    const shown = rows.filter((r) => matchQ(r.p))
    const pick = (col: number) => setSort((s) => (s.col === col ? { col, asc: !s.asc } : { col, asc: false }))
    const catLabel = CATS.find((c) => c.id === cat)!.label.toLowerCase()

    return (
      <main className="mx-auto flex max-w-[1360px] flex-col gap-3.5 px-[clamp(16px,3vw,32px)] pb-12 pt-5">
        <div className="flex items-center justify-between gap-4">
          <ClanFilter clan={clan} setClan={setClan} />
          <div className="w-[clamp(220px,28vw,340px)] flex-none"><SearchBox q={q} setQ={setQ} onEnter={() => { if (shown[0]) go.to(upgradeHref(cat, shown[0].p.tag)) }} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <CategoryNav current={cat} wide />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          {data && (
            <>
              <span className="font-bold text-ink"><Star /> {maxedN} of {rows.length} fully maxed</span>
              <span className="font-semibold">Ranked by {sort.col < 0 ? `${catLabel} progress` : units[sort.col]?.name}</span>
              {stamp && <span className="text-xs font-semibold text-faint">Updated {stamp}</span>}
            </>
          )}
        </div>

        {!data ? <Empty loading={loading} /> : (
          <>
            {/* Scrolls inside its own box, so the hero and unit icons stay pinned above the numbers. */}
            <section className="max-h-[calc(100dvh-210px)] overflow-auto rounded-2xl border border-line bg-white">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-[3]">
                  {byHero && (
                    <tr>
                      <th colSpan={3} className="sticky left-0 z-[4] bg-white" />
                      {groups.map((g) => (
                        <th key={g.hero ?? 'other'} colSpan={g.idx.length} title={g.hero ?? undefined}
                          className={`bg-[#FBF5E6] pb-0.5 pt-1.5 ${divider(g.idx[0])}`}>
                          {g.hero && <span className="flex justify-center"><UnitIcon name={g.hero} size={28} /></span>}
                        </th>
                      ))}
                    </tr>
                  )}
                  <tr>
                    <th className="sticky left-0 z-[4] w-12 min-w-12 border-b border-line bg-white py-2.5 pl-4 pr-1 text-left text-xs font-bold text-faint">#</th>
                    <th className="sticky left-12 z-[4] min-w-[210px] border-b border-line bg-white px-3 py-2.5 text-left text-xs font-bold text-faint">PLAYER</th>
                    <th className={`border-b border-line p-0 ${sort.col < 0 ? 'bg-[#F1E8D3]' : 'bg-white'}`} aria-sort={sort.col < 0 ? (sort.asc ? 'ascending' : 'descending') : undefined}>
                      <button type="button" onClick={() => pick(-1)} className="min-h-16 w-24 cursor-pointer border-0 bg-transparent text-xs font-bold text-ink-2 hover:bg-[#F1E8D3]">Progress</button>
                    </th>
                    {order.map((i) => { const u = units[i]; return (
                      <th key={u.name} className={`border-b border-line p-0 ${divider(i)} ${sort.col === i ? 'bg-[#F1E8D3]' : 'bg-white'}`} aria-sort={sort.col === i ? (sort.asc ? 'ascending' : 'descending') : undefined}>
                        <button type="button" onClick={() => pick(i)} title={`${u.name} · max ${u.max}`} aria-label={`Sort by ${u.name}`}
                          className="flex min-h-16 w-14 cursor-pointer flex-col items-center justify-center gap-0.5 border-0 bg-transparent px-0.5 py-1 hover:bg-[#F1E8D3]">
                          <UnitIcon name={u.name} size={36} />
                        </button>
                      </th>
                    ) })}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => { const { p, pct } = r; return (
                    <tr key={p.tag} data-tag={p.tag} onClick={() => go.to(upgradeHref(cat, p.tag, units[sort.col]?.name))} className="group cursor-pointer">
                      <td className="sticky left-0 z-[1] w-12 min-w-12 border-b border-hair bg-white py-1.5 pl-4 pr-1 font-bold tabular-nums text-faint group-hover:bg-hover">{place.get(r) ?? '—'}</td>
                      <td className="sticky left-12 z-[1] whitespace-nowrap border-b border-hair bg-white px-3 py-1.5 group-hover:bg-hover">
                        <span className="flex items-center gap-2.5">
                          <Th th={p.th} />
                          <a href={upgradeHref(cat, p.tag, units[sort.col]?.name)} onClick={(e) => e.stopPropagation()} className="font-semibold text-ink no-underline"><YouTag tag={p.tag} />{p.name}</a>
                          {clan === 'All' && <span className="text-[11px] font-bold" style={{ color: CLAN[p.clan].deep }}>{p.clan}</span>}
                        </span>
                      </td>
                      <td className={`border-b border-hair px-2.5 py-1.5 group-hover:bg-hover ${sort.col < 0 ? 'bg-[#F6EEDC]' : ''}`}>
                        <span className="flex w-[76px] flex-col gap-[3px]">
                          <span className="font-bold tabular-nums">{Math.round(pct)}%</span>
                          <Bar v={pct} color={COLOR[p.clan]} />
                        </span>
                      </td>
                      {order.map((i) => {
                        const u = units[i]
                        const l = p.levels[i]
                        return (
                          <td key={u.name} data-sorted={sort.col === i || undefined} className={`h-11 border-b border-hair px-1 text-center tabular-nums group-hover:bg-hover ${divider(i)} ${sort.col === i ? 'bg-[#F6EEDC]' : ''} ${cellTone(l, u.max)}`}>
                            {l ? l : '—'}{isMaxed(l, u) && <span className="ml-px align-[4px] text-[11px] text-gold">★</span>}
                          </td>
                        )
                      })}
                    </tr>
                  ) })}
                  {!shown.length && <tr><td colSpan={3 + units.length} className="p-5 text-sm text-faint">No one by that name</td></tr>}
                </tbody>
              </table>
            </section>
          </>
        )}
      </main>
    )
  }

  // Phone: one unit at a time, ranked.
  const ui = unit !== null && unit < units.length ? unit : order[0]
  const u = ui === undefined ? undefined : units[ui]
  const sorted = u ? pool
    .map((p) => ({ p, l: p.levels[ui] ?? 0 }))
    .sort((a, b) => b.l - a.l || a.p.name.localeCompare(b.p.name)) : []
  const unitPlace = competitionRanks(sorted, (x) => x.l)
  const ranked = sorted.map((x) => ({ ...x, rank: unitPlace.get(x) ?? null }))
  const maxedN = u ? ranked.filter((r) => r.l >= u.max).length : 0
  const shown = ranked.filter((r) => matchQ(r.p))

  return (
    <div className="flex flex-col gap-2.5 pb-6">
      <div className="px-4 pt-1"><ClanFilter clan={clan} setClan={setClan} /></div>
      <div className="sticky top-0 z-10 bg-page px-4 pb-2 pt-1">
        <SearchBox q={q} setQ={setQ} onEnter={() => { if (shown[0]) go.to(upgradeHref(cat, shown[0].p.tag)) }} />
      </div>
      <CategoryNav current={cat} wide={false} />
      {!data || !u ? <div className="px-4"><Empty loading={loading} /></div> : (
        <>
          <div ref={unitNav} role="listbox" aria-label="Unit" className="flex flex-none gap-2 overflow-x-auto px-4 pb-2 pt-1 [scrollbar-width:none]">
            {groups.map((g, gi) => (
              <Fragment key={g.hero ?? 'other'}>
                {byHero && (g.hero
                  ? <span title={g.hero} className={`flex flex-none items-center ${gi ? 'border-l border-line pl-2' : ''}`}><UnitIcon name={g.hero} size={26} /></span>
                  : <span aria-hidden="true" className="w-px flex-none self-stretch bg-line" />)}
                {g.idx.map((i) => { const x = units[i]; return (
                  <button key={x.name} type="button" role="option" aria-selected={i === ui} aria-label={x.name} onClick={() => setUnit(i)}
                    className={`flex size-[60px] flex-none cursor-pointer items-center justify-center rounded-2xl p-0 ${i === ui ? 'border-2 border-action bg-[#F6EEDC] shadow-[0_2px_8px_rgba(51,39,26,.2)]' : 'border border-line bg-white'}`}>
                    <UnitIcon name={x.name} size={44} />
                  </button>
                ) })}
              </Fragment>
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
                <li key={p.tag} data-tag={p.tag}>
                  <a href={upgradeHref(cat, p.tag, u.name)} className={`flex min-h-[54px] items-center gap-2.5 px-3.5 py-1.5 text-ink no-underline hover:bg-hover ${i ? 'border-t border-hair' : ''}`}>
                    <span className="w-6 flex-none text-right text-xs tabular-nums text-faint">{rank ?? '—'}</span>
                    <Th th={p.th} />
                    <span className="flex min-w-0 flex-auto flex-col gap-1">
                      <span className="flex min-w-0 items-baseline gap-1.5">
                        <span className="truncate text-[15px] font-semibold"><YouTag tag={p.tag} />{p.name}</span>
                        {clan === 'All' && <span className="flex-none text-[11px] font-bold" style={{ color: CLAN[p.clan].deep }}>{p.clan}</span>}
                      </span>
                      <Bar v={(100 * Math.min(l, u.max)) / u.max} color={COLOR[p.clan]} />
                    </span>
                    <span className={`w-[78px] flex-none whitespace-nowrap text-right text-sm tabular-nums ${maxed ? 'font-extrabold text-ink' : l ? 'font-semibold text-muted' : 'text-[#D5C8AC]'}`}>
                      {l ? `${l} / ${u.max}` : '—'}{maxed && <span className="ml-0.5 text-gold">★</span>}
                    </span>
                    <RowChevron />
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

type WarCol = { key: string; label: string; value: (r: WarRow) => number | null; fmt: (v: number) => string; low?: boolean; recordedOnly?: boolean }

const pct = (v: number) => `${Math.round(v)}%`
const WAR_COLS: WarCol[] = [
  { key: 'stars', label: 'War stars', value: (r) => r.war?.stars ?? null, fmt: (v) => v.toLocaleString('en-GB') },
  { key: 'attacks', label: 'Attacks', value: (r) => r.war?.attacks ?? null, fmt: String },
  { key: 'missed', label: 'Missed', value: (r) => (r.war ? r.war.missed : null), fmt: String, low: true },
  { key: 'triple', label: '3★ rate', value: (r) => (r.war?.attacks ? (100 * r.war.three_stars) / r.war.attacks : null), fmt: pct },
  { key: 'avg', label: 'Avg ★', value: (r) => (r.war?.attacks ? r.war.stars / r.war.attacks : null), fmt: (v) => v.toFixed(1) },
  { key: 'dest', label: 'Avg dest.', value: (r) => r.war?.avg_destruction ?? null, fmt: pct, recordedOnly: true },
]

// Green once a member has attacked with misses at or under the line, amber above it.
function MissDot({ r }: { r: WarRow }) {
  const m = missRate(r.war)
  if (m === null) return null
  const high = m > HIGH_MISS
  return <span title={high ? 'High miss' : 'Active'} aria-label={high ? 'High miss' : 'Active'} className="size-2 flex-none rounded" style={{ background: high ? '#D97706' : '#16A34A' }} />
}

const sinceLabel = (d: string | null) => (d ? `Since ${new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : null)

function WarBoardView({ q, setQ, wide }: BoardProps) {
  const [scope, setScope] = useState<WarScope>(() => (read('ff-war-scope') as WarScope) || 'all')
  const pickScope = (s: WarScope) => { setScope(s); write('ff-war-scope', s) }
  // The CWL toggle shows once the API filters by scope and has recorded a CWL war this season.
  const allBoard = useWarBoard('all').data
  const scoped = allBoard?.scope != null && !!allBoard.season
  const { data, loading } = useWarBoard(scoped ? scope : 'all')
  const [clan, setClan] = useClanPick()
  const cols = useMemo(() => WAR_COLS.filter((c) => !data || data.players.some((r) => c.value(r) !== null)), [data])
  const [sortKey, setSortKey] = useState<{ key: string; asc: boolean } | null>(null)
  const sort = sortKey && cols.some((c) => c.key === sortKey.key) ? sortKey : { key: cols[0]?.key ?? 'attacks', asc: !!cols[0]?.low }
  const col = cols.find((c) => c.key === sort.key) ?? cols[0]
  const pick = (c: WarCol) => setSortKey(sort.key === c.key ? { key: c.key, asc: !sort.asc } : { key: c.key, asc: !!c.low })
  useDrill((d) => cols.some((c) => c.key === d.col), (d) => setSortKey({ key: d.col!, asc: !!cols.find((c) => c.key === d.col)!.low }))

  const nq = norm(q.trim())
  const ranked = useMemo(() => {
    if (!data || !col) return []
    return data.players
      .filter((r) => clan === 'All' || r.clan === clan)
      .map((r) => ({ r, v: col.value(r) }))
      .sort((a, b) => (a.v === null ? (b.v === null ? 0 : 1) : b.v === null ? -1 : sort.asc ? a.v - b.v : b.v - a.v) || a.r.name.localeCompare(b.r.name))
  }, [data, clan, col, sort.asc])
  const placeCol = cols.find((c) => c.key === 'stars') ?? cols[0]
  const place = useMemo(() => competitionRanks(ranked.map((x) => x.r), (r) => (wide ? placeCol : col)?.value(r) ?? null, !wide && !!col?.low), [ranked, placeCol, col, wide])
  const shown = ranked.filter(({ r }) => !nq || norm(r.name).includes(nq) || r.tag.toLowerCase().includes(nq))
  const since = sinceLabel(data?.windowFrom ?? data?.since ?? null)
  // Destruction comes from recorded wars only, which can start later than the window.
  // Totals and weighted averages over the players the clan and scope filters keep.
  const summary = useMemo(() => {
    const rows = ranked.map((x) => x.r)
    const ws = rows.map((r) => r.war?.stars).filter((v): v is number => v !== null && v !== undefined)
    let attacks = 0, missed = 0, three = 0, stars = 0, destSum = 0, destN = 0
    for (const r of rows) {
      const w = r.war
      if (!w) continue
      attacks += w.attacks; missed += w.missed; three += w.three_stars; stars += w.stars
      // Destruction covers recorded wars only, so it is weighted by recorded wars.
      if (w.avg_destruction !== null && w.wars) { destSum += w.avg_destruction * w.wars; destN += w.wars }
    }
    return {
      warStars: ws.length ? ws.reduce((a, b) => a + b, 0) : null,
      warStarsMean: ws.length ? ws.reduce((a, b) => a + b, 0) / ws.length : null,
      attacks, missed, three, stars,
      triple: attacks ? (100 * three) / attacks : null,
      avgStars: attacks ? stars / attacks : null,
      dest: destN ? destSum / destN : null,
      missRate: attacks + missed ? (100 * missed) / (attacks + missed) : null,
    }
  }, [ranked])
  const who = clan === 'All' ? 'Family' : clan
  const footer: { label: string; cell: Record<string, string> }[] = [
    { label: `Total · ${who}`, cell: {
      stars: summary.warStars === null ? '' : `${summary.warStars.toLocaleString('en-GB')}★`,
      attacks: String(summary.attacks), missed: String(summary.missed),
      triple: `${summary.three} × 3★`, avg: `${Math.round(summary.stars).toLocaleString('en-GB')}★`, dest: '',
    } },
    { label: `Average · ${who}`, cell: {
      stars: summary.warStarsMean === null ? '' : `${Math.round(summary.warStarsMean).toLocaleString('en-GB')}★`,
      attacks: '', missed: summary.missRate === null ? '' : `${Math.round(summary.missRate)}%`,
      triple: summary.triple === null ? '' : pct(summary.triple), avg: summary.avgStars === null ? '' : summary.avgStars.toFixed(2),
      dest: summary.dest === null ? '' : pct(summary.dest),
    } },
  ]
  const recordedStart = data?.recordedFrom ?? (data?.windowFrom && data.since !== data.windowFrom ? data.since : null)
  const recordedTip = recordedStart && recordedStart !== data?.windowFrom ? `Recorded ${sinceLabel(recordedStart)}` : undefined

  const scopeToggle = scoped && (
    <div role="group" aria-label="Wars" className="flex flex-none gap-1.5">
      {([['all', 'All wars'], ['cwl', 'CWL season']] as const).map(([k, label]) => (
        <button key={k} type="button" aria-pressed={k === scope} onClick={() => pickScope(k)}
          className={chip(k === scope)}>
          {label}
        </button>
      ))}
    </div>
  )
  const sinceChip = since && <span className="flex-none text-xs font-semibold text-faint">{since}</span>
  const key = <StatusKey only={['active', 'highMiss']} className="!text-xs" />
  const enter = () => { if (shown[0]) go.to(playerHref(shown[0].r.tag)) }

  if (wide) {
    return (
      <main className="mx-auto flex max-w-[1360px] flex-col gap-3.5 px-[clamp(16px,3vw,32px)] pb-12 pt-5">
        <div className="flex items-center justify-between gap-4">
          <ClanFilter clan={clan} setClan={setClan} />
          <div className="w-[clamp(220px,28vw,340px)] flex-none"><SearchBox q={q} setQ={setQ} onEnter={enter} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {scopeToggle}{sinceChip}{key}
        </div>
        {!data || !col ? <Empty loading={loading} /> : (
          <section className="max-h-[calc(100dvh-210px)] overflow-auto rounded-2xl border border-line bg-white">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs font-bold text-faint">
                  <th className="sticky left-0 top-0 z-[4] w-12 min-w-12 border-b border-line bg-white py-2.5 pl-4 pr-1 font-bold">#</th>
                  <th className="sticky left-12 top-0 z-[4] min-w-[220px] border-b border-line bg-white px-2 font-bold">PLAYER</th>
                  {cols.map((c) => (
                    <th key={c.key} className={`sticky top-0 z-[2] border-b border-line p-0 text-right ${c.key === sort.key ? 'bg-[#F1E8D3]' : 'bg-white'}`} aria-sort={c.key === sort.key ? (sort.asc ? 'ascending' : 'descending') : undefined}>
                      <button type="button" onClick={() => pick(c)} title={c.recordedOnly ? recordedTip : undefined}
                        className={`min-h-12 w-full cursor-pointer whitespace-nowrap border-0 bg-transparent px-4 text-right text-xs font-bold hover:bg-[#F1E8D3] ${c.key === sort.key ? 'text-ink' : 'text-faint'}`}>
                        {c.label}{c.key === sort.key ? (sort.asc ? ' ↑' : ' ↓') : ''}
                        {c.recordedOnly && recordedStart && <span className="block text-[10px] font-semibold text-faint">{sinceLabel(recordedStart)}</span>}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map(({ r }) => (
                  <tr key={r.tag} data-tag={r.tag} onClick={() => go.to(playerHref(r.tag))} className="group cursor-pointer">
                    <td className="sticky left-0 z-[1] w-12 min-w-12 border-b border-hair bg-white py-1.5 pl-4 pr-1 font-bold tabular-nums text-faint group-hover:bg-hover">{place.get(r) ?? '—'}</td>
                    <td className="sticky left-12 z-[1] whitespace-nowrap border-b border-hair bg-white px-2 py-1.5 group-hover:bg-hover">
                      <span className="flex items-center gap-2.5">
                        <Th th={r.th} />
                        <a href={playerHref(r.tag)} onClick={(e) => e.stopPropagation()} className="font-semibold text-ink no-underline"><YouTag tag={r.tag} />{r.name}</a>
                        <MissDot r={r} />
                        {clan === 'All' && <span className="text-[11px] font-bold" style={{ color: CLAN[r.clan].deep }}>{r.clan}</span>}
                      </span>
                    </td>
                    {cols.map((c) => {
                      const v = c.value(r)
                      const high = c.key === 'missed' && (missRate(r.war) ?? 0) > HIGH_MISS
                      return (
                        <td key={c.key} className={`border-b border-hair px-4 text-right tabular-nums group-hover:bg-hover ${c.key === sort.key ? 'bg-[#F6EEDC] font-extrabold text-ink' : 'font-semibold text-ink-2'} ${v === null ? '!font-normal !text-[#D5C8AC]' : ''}`}>
                          {v === null ? '—' : high ? <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[#92400E]">{c.fmt(v)}</span> : <>{c.fmt(v)}{c.key === 'stars' && <span className="ml-0.5 text-gold">★</span>}</>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {!shown.length && <tr><td colSpan={2 + cols.length} className="p-5 text-sm text-faint">No one by that name</td></tr>}
              </tbody>
              <tfoot>
                {footer.map((f, fi) => {
                  const pin = fi === 0 ? 'bottom-11 border-t-2 border-t-line' : 'bottom-0'
                  return (
                    <tr key={f.label} className="h-11">
                      <td className={`sticky left-0 z-[3] bg-[#FBF5E6] ${pin}`} />
                      <td className={`sticky left-12 z-[3] whitespace-nowrap bg-[#FBF5E6] px-2 text-[13px] font-extrabold text-ink ${pin}`}>{f.label}</td>
                      {cols.map((c) => (
                        <td key={c.key} title={c.recordedOnly ? recordedTip : undefined}
                          className={`sticky z-[2] whitespace-nowrap bg-[#FBF5E6] px-4 text-right font-extrabold tabular-nums text-ink ${pin}`}>
                          {f.cell[c.key] ?? ''}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tfoot>
            </table>
          </section>
        )}
      </main>
    )
  }

  const rest = col ? cols.filter((c) => c.key !== col.key).slice(0, 2) : []
  return (
    <div className="flex flex-col gap-2.5 pb-6">
      <div className="px-4 pt-1"><ClanFilter clan={clan} setClan={setClan} /></div>
      <div className="sticky top-0 z-10 bg-page px-4 pb-2 pt-1"><SearchBox q={q} setQ={setQ} onEnter={enter} /></div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4">{scopeToggle}{sinceChip}{key}</div>
      {!data || !col ? <div className="px-4"><Empty loading={loading} /></div> : (
        <>
          <div role="group" aria-label="Sort by" className="-mb-1 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none]">
            {cols.map((c) => (
              <button key={c.key} type="button" aria-pressed={c.key === sort.key} onClick={() => pick(c)} title={c.recordedOnly ? recordedTip : undefined}
                className={chip(c.key === sort.key)}>
                {c.label}{c.key === sort.key ? (sort.asc ? ' ↑' : ' ↓') : ''}
              </button>
            ))}
          </div>
          <div aria-label={`${who} summary`} className="mx-4 grid grid-cols-3 gap-2">
            {[['3★ rate', summary.triple === null ? '—' : pct(summary.triple)], ['Avg ★', summary.avgStars === null ? '—' : summary.avgStars.toFixed(2)], ['Attacks', String(summary.attacks)]].map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5 rounded-xl border border-line bg-white px-3 py-2">
                <span className="truncate text-[11px] text-faint">{k}</span>
                <span className="font-display text-xl leading-none tabular-nums">{v}</span>
              </div>
            ))}
          </div>
          <ol className="m-0 mx-4 list-none rounded-2xl border border-line bg-white py-1">
            {shown.map(({ r, v }, i) => (
              <li key={r.tag} data-tag={r.tag}>
                <a href={playerHref(r.tag)} className={`flex min-h-[56px] items-center gap-2.5 px-3.5 py-1.5 text-ink no-underline hover:bg-hover ${i ? 'border-t border-hair' : ''}`}>
                  <span className="w-6 flex-none text-right text-xs tabular-nums text-faint">{place.get(r) ?? '—'}</span>
                  <Th th={r.th} />
                  <span className="flex min-w-0 flex-auto flex-col gap-0.5">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[15px] font-semibold"><YouTag tag={r.tag} />{r.name}</span>
                      <MissDot r={r} />
                      {clan === 'All' && <span className="flex-none text-[11px] font-bold" style={{ color: CLAN[r.clan].deep }}>{r.clan}</span>}
                    </span>
                    <span className="truncate text-xs text-faint">
                      {rest.map((c, j) => { const x = c.value(r); return <span key={c.key}>{j ? ' · ' : ''}{c.label} {x === null ? '—' : c.fmt(x)}</span> })}
                    </span>
                  </span>
                  <span className={`flex-none whitespace-nowrap text-right text-base tabular-nums ${v === null ? 'text-[#D5C8AC]' : 'font-extrabold'}`}>
                    {v === null ? '—' : col.fmt(v)}{v !== null && col.key === 'stars' && <span className="ml-0.5 text-gold">★</span>}
                  </span>
                  <RowChevron />
                </a>
              </li>
            ))}
            {!shown.length && <li className="p-4 text-sm text-faint">No one by that name</li>}
          </ol>
        </>
      )}
    </div>
  )
}
