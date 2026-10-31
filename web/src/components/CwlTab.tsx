import { useEffect, useMemo, useRef, useState } from 'react'
import { CLAN, CLANS, GROUPS, SLOT_TEXT, coreAvg, fmtScore } from '../theme'
import { playerHref } from '../route'
import type { ClanName, LiveWar, Player, Roster } from '../types'
import { useClans, type ClanMeta } from '../clash'
import { ClanBadge, Eyebrow, LeaguePill, SearchIcon, StatusPill, Th, WarPill } from './ui'

type Props = { roster: Roster; war: Partial<Record<ClanName, LiveWar | null>>; wide: boolean; q: string; setQ: (v: string) => void }

export const norm = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const matches = (p: Player, q: string) => norm(p.name).includes(q) || p.tag.toLowerCase().includes(q)
const href = (p: Player) => playerHref(p.tag)

function groupsFor(roster: Roster, clan: ClanName) {
  const mine = roster.players.filter((p) => p.clan === clan)
  if (!roster.clans[clan]?.inCwl) return [{ label: 'Members', dim: false, rows: mine }]
  return GROUPS.map((g) => ({ label: g.label, dim: g.dim, rows: mine.filter((p) => p.slot === g.slot) }))
}

function clanFacts(roster: Roster, clan: ClanName, meta?: ClanMeta) {
  const info = roster.clans[clan]
  const core = roster.players.filter((p) => p.clan === clan && p.slot === 'CORE')
  // Clans out of CWL have no core, so they show the average of their best 15.
  const best = roster.players.filter((p) => p.clan === clan && p.score !== null).map((p) => p.score as number).sort((a, b) => b - a).slice(0, 15)
  const avg = coreAvg(info?.inCwl ? core.map((p) => p.score) : best)
  const league = meta?.league ?? info?.league ?? null
  return {
    inCwl: !!info?.inCwl,
    league,
    format: info?.inCwl ? `${league ? `${league} · ` : ''}15v15` : league ? `${league} · not in CWL` : 'Not in CWL this month',
    avg: avg === null ? '—' : avg.toFixed(1),
    name: meta?.name ?? `Frosted ${clan}`,
    badge: meta?.badge ?? null,
  }
}

// Badge, name and league; core average (best 15 for clans out of CWL) and member count.
function ClanCard({ roster, clan, meta, war, compact }: { roster: Roster; clan: ClanName; meta?: ClanMeta; war: LiveWar | null | undefined; compact?: boolean }) {
  const f = clanFacts(roster, clan, meta)
  const c = CLAN[clan]
  return (
    <div className={`flex items-center gap-3 ${compact ? 'px-4 py-3.5' : 'rounded-[18px] p-3.5'}`} style={{ background: c.tint }}>
      <ClanBadge src={f.badge} size={compact ? 52 : 64} className="drop-shadow-[0_2px_4px_rgba(15,23,42,.18)]" />
      <div className="flex min-w-0 flex-auto flex-col gap-1">
        <h2 className={`font-display m-0 truncate leading-none ${compact ? 'text-[22px]' : 'text-2xl'}`} style={{ color: c.deep }}>{f.name}</h2>
        <LeaguePill league={f.league} text={f.format} />
        <WarPill war={war} />
      </div>
      <div className="flex flex-none flex-col items-end">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">{f.inCwl ? 'Core avg' : 'Top 15 avg'}</span>
        <span className={`font-display leading-none ${compact ? 'text-[26px]' : 'text-[30px]'}`} style={{ color: c.deep }}>{f.avg}</span>
        {!f.inCwl && <span className="mt-1 text-xs font-semibold text-muted">{roster.players.filter((p) => p.clan === clan).length} members</span>}
      </div>
    </div>
  )
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

// A move into this clan before sign-up, shown after the name as on the poster,
// tinted with the clan the player comes from.
function FromPill({ from }: { from: ClanName | null }) {
  if (!from) return null
  return (
    <span className="flex-none whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-extrabold uppercase tracking-[0.04em]"
      style={{ background: CLAN[from].tint, color: CLAN[from].deep }}>
      From {from}
    </span>
  )
}

function Row({ p, n, hit, dense }: { p: Player; n: number; hit?: boolean; dense?: boolean }) {
  const first = n === 1
  return (
    <li>
      <a href={href(p)} data-tag={p.tag}
        className={`flex items-center gap-3 text-ink no-underline ${dense ? 'min-h-[42px] px-2.5' : 'min-h-[46px] px-3.5'} ${first ? '' : 'border-t border-hair'} ${hit ? 'bg-hit' : 'hover:bg-hover'}`}>
        <span className="w-5 flex-none text-right text-xs font-bold tabular-nums text-faint">{n}</span>
        <Th th={p.th} />
        <span className="flex min-w-0 flex-auto items-center gap-1.5">
          <span className={`min-w-0 truncate font-semibold ${dense ? 'text-sm' : 'text-[15px]'}`}>{p.name}</span>
          <FromPill from={p.from} />
        </span>
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
          {/* Side by side, every clan's list starts under a label row, so the columns line up. */}
          {g.label !== 'Members' || dense ? (
            <div className={`flex justify-between ${dense ? 'px-2.5 pt-3' : 'px-1'}`}>
              <Eyebrow className={dense ? 'text-[11px]' : ''}>{g.label}</Eyebrow>
              <Eyebrow className={dense ? 'text-[11px]' : ''}>{g.rows.length}</Eyebrow>
            </div>
          ) : null}
          {g.rows.length ? (
            <ol className={`m-0 list-none ${dense ? '' : 'rounded-2xl border border-line bg-white py-1'} ${g.dim ? 'opacity-[.85]' : ''}`}>
              {g.rows.map((p, i) => <Row key={p.tag} p={p} n={i + 1} dense={dense} hit={!!q && matches(p, q)} />)}
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
  const clans = useClans()

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
                  <span className="flex min-w-0 flex-auto items-center gap-1.5">
                    <span className="min-w-0 truncate text-[15px] font-semibold">{p.name}</span>
                    <FromPill from={p.from} />
                  </span>
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
            <nav aria-label="Clan" className="grid grid-cols-3 gap-1 rounded-xl bg-well p-1">
              {CLANS.map((k) => (
                <button key={k} type="button" aria-pressed={k === clan} onClick={() => setClan(k)}
                  className={`flex min-h-[42px] cursor-pointer items-center justify-center gap-1 rounded-[9px] border-0 text-[15px] font-bold ${k === clan ? 'bg-white shadow-[0_1px_3px_rgba(15,23,42,.12)]' : 'bg-transparent text-muted'}`}
                  style={k === clan ? { color: CLAN[k].deep } : undefined}>
                  <ClanBadge src={clans[k]?.badge} size={22} />
                  {k} <span className="font-semibold opacity-60">{roster.players.filter((p) => p.clan === k).length}</span>
                </button>
              ))}
            </nav>
            <ClanCard roster={roster} clan={clan} meta={clans[clan]} war={war[clan]} />
            <Groups roster={roster} clan={clan} />
          </>
        )}
      </div>
    </>
  )
}

function Desktop({ roster, war, q, setQ }: Omit<Props, 'wide'>) {
  const nq = norm(q.trim())
  const grid = useRef<HTMLDivElement>(null)
  const clans = useClans()
  const hits = useMemo(() => (nq ? roster.players.filter((p) => matches(p, nq)) : []), [nq, roster])

  useEffect(() => {
    if (!hits.length) return
    const el = grid.current?.querySelector<HTMLElement>(`[data-tag="${CSS.escape(hits[0].tag)}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [hits])

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-4 px-[clamp(16px,3vw,32px)] pb-12 pt-6">
      <div className="flex max-w-[480px] flex-col gap-1">
        <SearchBox q={q} setQ={setQ} tall onEnter={() => { if (hits[0]) window.location.hash = href(hits[0]) }} />
        {nq && !hits.length && <span className="px-1 text-sm text-faint">No one by that name</span>}
      </div>
      <div ref={grid} className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">
        {CLANS.map((clan) => {
          return (
            <section key={clan} aria-label={clan} className="overflow-hidden rounded-[18px] border border-line bg-white pb-2.5">
              <ClanCard roster={roster} clan={clan} meta={clans[clan]} war={war[clan]} compact />
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
