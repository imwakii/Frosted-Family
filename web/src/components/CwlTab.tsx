import { useEffect, useMemo, useRef, useState } from 'react'
import { CLAN, CLANS, GROUPS, SLOT_TEXT, coreAvg, fmtScore } from '../theme'
import { playerHref } from '../route'
import type { ClanName, LiveWar, Player, Roster } from '../types'
import { Arrow, Eyebrow, LiveLine, SearchIcon, StatusPill, Th } from './ui'

type Props = { roster: Roster; war: Partial<Record<ClanName, LiveWar | null>>; wide: boolean; q: string; setQ: (v: string) => void }

export const norm = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const matches = (p: Player, q: string) => norm(p.name).includes(q) || p.tag.toLowerCase().includes(q)
const href = (p: Player) => playerHref(p.tag)

function groupsFor(roster: Roster, clan: ClanName) {
  const mine = roster.players.filter((p) => p.clan === clan)
  if (!roster.clans[clan]?.inCwl) return [{ label: 'Members', dim: false, rows: mine }]
  return GROUPS.map((g) => ({ label: g.label, dim: g.dim, rows: mine.filter((p) => p.slot === g.slot) }))
}

function clanFacts(roster: Roster, clan: ClanName) {
  const info = roster.clans[clan]
  const core = roster.players.filter((p) => p.clan === clan && p.slot === 'CORE')
  const avg = coreAvg(core.map((p) => p.score))
  return {
    inCwl: !!info?.inCwl,
    format: info?.inCwl ? `15v15${info.league ? ` · ${info.league}` : ''}` : 'Not in CWL this month',
    avg: avg === null ? '—' : avg.toFixed(1),
  }
}

export function SearchBox({ q, setQ, tall, onEnter }: { q: string; setQ: (v: string) => void; tall?: boolean; onEnter?: () => void }) {
  return (
    <div className="relative min-w-0">
      <label htmlFor="find" className="sr-only">Find your name</label>
      <SearchIcon />
      <input
        id="find" type="search" placeholder="Find your name" value={q} autoComplete="off" spellCheck={false}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onEnter?.() }}
        className={`${tall ? 'h-[52px]' : 'h-12'} w-full rounded-[14px] border border-line bg-white pl-[42px] pr-3.5 text-base text-ink placeholder:text-faint`}
      />
    </div>
  )
}

function Movers({ movers, row }: { movers: Player[]; row?: boolean }) {
  if (!movers.length) return null
  return (
    <section aria-label="Move before sign-up" className={row
      ? 'flex flex-[2_1_480px] flex-wrap items-center gap-x-4 gap-y-1 rounded-[14px] border border-line bg-white px-4 py-2'
      : 'flex flex-col gap-0.5 rounded-2xl border border-line bg-white px-3.5 py-3'}>
      <Eyebrow className={row ? 'mr-1' : 'mb-1'}>Move before sign-up</Eyebrow>
      {movers.map((m) => (
        <a key={m.tag} href={href(m)}
          className={`flex min-h-9 items-center gap-2 rounded-lg text-ink no-underline hover:bg-hover ${row ? '-mx-1 px-1.5 text-sm' : '-mx-1.5 px-1.5 text-[15px]'}`}>
          <span className={`font-semibold ${row ? '' : 'min-w-0 flex-auto truncate'}`}>{m.name}</span>
          <span className="text-[13px] font-bold" style={{ color: CLAN[m.from!].deep }}>{m.from}</span>
          <Arrow size={row ? 14 : 16} />
          <span className="text-[13px] font-bold" style={{ color: CLAN[m.clan].deep }}>{m.clan}</span>
        </a>
      ))}
    </section>
  )
}

function Row({ p, first, hit, dense }: { p: Player; first: boolean; hit?: boolean; dense?: boolean }) {
  return (
    <li>
      <a href={href(p)} data-tag={p.tag}
        className={`flex items-center gap-3 text-ink no-underline ${dense ? 'min-h-[42px] px-2.5' : 'min-h-[46px] px-3.5'} ${first ? '' : 'border-t border-hair'} ${hit ? 'bg-hit' : 'hover:bg-hover'}`}>
        <Th th={p.th} />
        <span className={`min-w-0 flex-auto truncate font-semibold ${dense ? 'text-sm' : 'text-[15px]'}`}>{p.name}</span>
        <StatusPill status={p.status} />
        <span className="w-10 flex-none text-right text-sm font-bold tabular-nums text-muted">{fmtScore(p.score)}</span>
      </a>
    </li>
  )
}

function Groups({ roster, clan, q, dense }: { roster: Roster; clan: ClanName; q?: string; dense?: boolean }) {
  return (
    <>
      {groupsFor(roster, clan).map((g) => (
        <section key={g.label} className={`flex flex-col ${dense ? 'gap-0.5 px-2' : 'gap-1.5'}`}>
          {g.label !== 'Members' ? (
            <div className={`flex justify-between ${dense ? 'px-2.5 pt-3' : 'px-1'}`}>
              <Eyebrow className={dense ? 'text-[11px]' : ''}>{g.label}</Eyebrow>
              <Eyebrow className={dense ? 'text-[11px]' : ''}>{g.rows.length}</Eyebrow>
            </div>
          ) : dense ? <div className="h-2" /> : null}
          {g.rows.length ? (
            <ol className={`m-0 list-none ${dense ? '' : 'rounded-2xl border border-line bg-white py-1'} ${g.dim ? 'opacity-[.85]' : ''}`}>
              {g.rows.map((p, i) => <Row key={p.tag} p={p} first={i === 0} dense={dense} hit={!!q && matches(p, q)} />)}
            </ol>
          ) : null}
        </section>
      ))}
    </>
  )
}

function readClan(): ClanName {
  try {
    const v = sessionStorage.getItem('ff-clan')
    return v === 'Cake' || v === 'Flakes' ? v : 'Fire'
  } catch { return 'Fire' }
}

function Phone({ roster, war, q, setQ }: Omit<Props, 'wide'>) {
  const [clan, setClan] = useState<ClanName>(readClan)
  useEffect(() => { try { sessionStorage.setItem('ff-clan', clan) } catch { /* private mode */ } }, [clan])
  const nq = norm(q.trim())
  const results = nq ? roster.players.filter((p) => matches(p, nq)).slice(0, 12) : []
  const movers = roster.players.filter((p) => p.from)
  const facts = clanFacts(roster, clan)

  return (
    <>
      <div className="sticky top-0 z-10 bg-page px-4 pb-3 pt-1">
        <SearchBox q={q} setQ={setQ} onEnter={() => { if (results[0]) window.location.hash = href(results[0]) }} />
      </div>
      <div className="flex flex-col gap-3 px-4 pb-6">
        {nq ? (
          <ul className="m-0 list-none rounded-2xl border border-line bg-white py-1">
            {results.map((p, i) => (
              <li key={p.tag}>
                <a href={href(p)}
                  className={`flex min-h-[52px] items-center gap-3 px-3.5 py-1.5 text-ink no-underline hover:bg-hover ${i ? 'border-t border-hair' : ''}`}>
                  <Th th={p.th} />
                  <span className="min-w-0 flex-auto truncate text-[15px] font-semibold">{p.name}</span>
                  <span className="flex-none whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: CLAN[p.clan].tint, color: CLAN[p.clan].deep }}>
                    {p.clan} · {roster.clans[p.clan]?.inCwl ? SLOT_TEXT[p.slot] : 'Not playing'}
                  </span>
                </a>
              </li>
            ))}
            {!results.length && <li className="p-4 text-sm text-faint">No one by that name</li>}
          </ul>
        ) : (
          <>
            <Movers movers={movers} />
            <nav aria-label="Clan" className="grid grid-cols-3 gap-1 rounded-xl bg-well p-1">
              {CLANS.map((k) => (
                <button key={k} type="button" aria-pressed={k === clan} onClick={() => setClan(k)}
                  className={`min-h-[42px] cursor-pointer rounded-[9px] border-0 text-[15px] font-bold ${k === clan ? 'bg-white shadow-[0_1px_3px_rgba(15,23,42,.12)]' : 'bg-transparent text-muted'}`}
                  style={k === clan ? { color: CLAN[k].deep } : undefined}>
                  {k} <span className="font-semibold opacity-60">{roster.players.filter((p) => p.clan === k).length}</span>
                </button>
              ))}
            </nav>
            <div className="flex items-baseline justify-between px-1">
              <span className="text-sm font-semibold text-muted">{facts.format}</span>
              {facts.inCwl && (
                <span className="text-sm text-muted">core avg <span className="text-lg font-extrabold" style={{ color: CLAN[clan].deep }}>{facts.avg}</span></span>
              )}
            </div>
            {facts.inCwl && <LiveLine war={war[clan]} />}
            <Groups roster={roster} clan={clan} />
          </>
        )}
      </div>
    </>
  )
}

function Desktop({ roster, war, q, setQ }: Omit<Props, 'wide'>) {
  const nq = norm(q.trim())
  const movers = roster.players.filter((p) => p.from)
  const grid = useRef<HTMLDivElement>(null)
  const hits = useMemo(() => (nq ? roster.players.filter((p) => matches(p, nq)) : []), [nq, roster])

  useEffect(() => {
    if (!hits.length) return
    const el = grid.current?.querySelector<HTMLElement>(`[data-tag="${CSS.escape(hits[0].tag)}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [hits])

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-4 px-[clamp(16px,3vw,32px)] pb-12 pt-6">
      <div className="flex flex-wrap items-stretch gap-3">
        <div className="flex flex-[1_1_320px] flex-col gap-1">
          <SearchBox q={q} setQ={setQ} tall onEnter={() => { if (hits[0]) window.location.hash = href(hits[0]) }} />
          {nq && !hits.length && <span className="px-1 text-sm text-faint">No one by that name</span>}
        </div>
        <Movers movers={movers} row />
      </div>
      <div ref={grid} className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">
        {CLANS.map((clan) => {
          const f = clanFacts(roster, clan)
          const c = CLAN[clan]
          return (
            <section key={clan} aria-label={clan} className="overflow-hidden rounded-[18px] border border-line bg-white pb-2.5">
              <div className="flex items-end justify-between px-[18px] py-4" style={{ background: c.tint }}>
                <div className="flex flex-col gap-0.5">
                  <h2 className="m-0 text-[22px] font-extrabold tracking-[-0.02em]" style={{ color: c.deep }}>{clan}</h2>
                  <span className="text-[13px] font-semibold text-muted">{f.format}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">{f.inCwl ? 'Core avg' : 'Members'}</span>
                  <span className="text-[26px] font-extrabold leading-[1.05]" style={{ color: c.deep }}>
                    {f.inCwl ? f.avg : roster.players.filter((p) => p.clan === clan).length}
                  </span>
                </div>
              </div>
              {f.inCwl && <LiveLine war={war[clan]} className="mx-3.5 mt-3" />}
              <Groups roster={roster} clan={clan} q={nq} dense />
            </section>
          )
        })}
      </div>
    </main>
  )
}

export default function CwlTab({ wide, ...rest }: Props) {
  return wide ? <Desktop {...rest} /> : <Phone {...rest} />
}
