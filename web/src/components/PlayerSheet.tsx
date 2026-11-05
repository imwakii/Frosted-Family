import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { sheetVisit, useSheetMotion } from '../sheetMotion'
import { loadPlayerAll, type PlayerCard, playerNow, stillToMove } from '../data'
import { BADGES, TIER_LOOK } from '../badges'
import { ago } from '../leaders'
import { CATS, sinceDay } from '../explore'
import { attacksHref, compareHref, go, historyHref, markFromCard, markStatFromCard, playerHref, statHref, upgradeHref } from '../route'
import Info from './Info'
import { StarBurst, useCountUp, useNewIds, useOnce } from './Motion'
import { Bar } from './OverallBoard'
import { SheetTitle } from './FitName'
import { useYou } from './You'
import { CLAN, cycleLong, cycleShort, fmtScore, fmtWindow } from '../theme'
import type { Player, Roster } from '../types'
import { Arrow, PlayDays, RowChevron, Stars, StatusPill, Th, UnitIcon } from './ui'

// Explained on hover with a mouse, and on tap on a phone. Tapping elsewhere closes it.
let scrolled: { tag: string; top: number; visit: number } | null = null

// Each badge opens the badges card with that badge marked; Back returns here.
function Badges({ tag, badges, fresh = [] }: { tag: string; badges: NonNullable<PlayerCard['badges']>; fresh?: string[] }) {
  return (
    <ul aria-label="Badges" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
      {badges.map((b) => (
        <li key={b.id}>
          <a href={statHref('badges', tag, b.id)} onClick={() => markStatFromCard(true)}
            className={`${fresh.includes(`${b.id}-${b.tier}`) ? 'ff-shine' : ''} flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-bold no-underline ${TIER_LOOK[b.tier ?? 'silver'].chip}`}>
            {BADGES[b.id]?.label ?? b.label}
          </a>
        </li>
      ))}
    </ul>
  )
}

// The card's one section: a small heading, with an optional note on the right.
function Section({ title, note, children }: { title: string; note?: string | null; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.06em] text-faint">{title}</span>
        {note && <span className="truncate text-xs text-faint">{note}</span>}
      </div>
      {children}
    </section>
  )
}

// Holds a section's place until the card arrives, so nothing moves when it does.
const Holding = ({ height }: { height: number }) => <div aria-hidden="true" className="animate-pulse rounded-xl bg-[#F1E8D3]" style={{ height }} />

// The card's one tile. One with somewhere to go opens that ranking.
function Stat({ label, value, sub, onOpen, small }: { label: string; value: ReactNode; sub?: string; onOpen?: () => void; small?: boolean }) {
  const body = (
    <>
      <span className="truncate text-[11px] text-faint">{label}</span>
      <span className="truncate text-[17px] font-bold leading-tight tabular-nums">{value}</span>
      {sub && <span className="truncate text-[11px] font-semibold text-faint">{sub}</span>}
    </>
  )
  const box = 'flex min-w-0 flex-col gap-0.5 rounded-xl border border-line px-2.5 py-2'
  if (!onOpen) return <div className={box}>{body}</div>
  if (small) return <button type="button" onClick={onOpen} className={`${box} cursor-pointer bg-transparent text-left text-ink hover:bg-hover`}>{body}</button>
  return (
    <button type="button" onClick={onOpen} className={`${box} relative cursor-pointer bg-transparent pr-5 text-left text-ink hover:bg-hover`}>
      {body}
      <span className="absolute right-1 top-1/2 -translate-y-1/2"><RowChevron /></span>
    </button>
  )
}

// Where a unit's ranking lives; a new town hall has none, so it opens the Log.
const unitHash = (cat: string) => `#/stats/players/${cat}`

const dayMonth = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const LIST = 'm-0 flex list-none flex-col rounded-xl border border-line p-0'
const num = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v.toLocaleString('en-GB'))

function Trend({ p, cycles }: { p: Player; cycles: string[] }) {
  const pts = cycles.map((c) => ({ c, s: p.history.find((h) => h.cycle === c)?.score ?? null }))
  const vals = pts.map((x) => x.s).filter((s): s is number => s !== null)
  if (vals.length < 2) return null
  const W = 350, H = 90
  const lo = Math.max(0, Math.min(...vals) - 10), hi = Math.max(...vals) + 10
  const x = (i: number) => (pts.length === 1 ? W : (i / (pts.length - 1)) * W)
  const y = (s: number) => H - ((s - lo) / (hi - lo || 1)) * (H - 10)
  const accent = CLAN[p.clan].accent
  // Break the line where a cycle has no score.
  const runs: string[] = []
  let run: string[] = []
  pts.forEach((pt, i) => {
    if (pt.s === null) { if (run.length) runs.push(run.join(' ')); run = [] } else run.push(`${x(i).toFixed(1)},${y(pt.s).toFixed(1)}`)
  })
  if (run.length) runs.push(run.join(' '))
  const lastI = pts.map((pt) => pt.s !== null).lastIndexOf(true)
  const label = pts.map((pt) => `${cycleLong(pt.c)} ${fmtScore(pt.s)}`).join(', ')

  return (
    <Section title="Score by month">
      <svg role="img" aria-label={`Score by month: ${label}`} viewBox="-8 -12 366 130" className="h-auto w-full overflow-visible">
        <line x1="0" y1={H} x2={W} y2={H} stroke="#EFE6D2" />
        {runs.map((r) => <polyline key={r} points={r} fill="none" stroke={accent} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />)}
        {pts.map((pt, i) => pt.s === null ? null : (
          <g key={pt.c}>
            <circle cx={x(i)} cy={y(pt.s)} r={i === lastI ? 5.5 : 3.5} fill={i === lastI ? accent : '#FFFBF1'} stroke={i === lastI ? '#FFFBF1' : accent} strokeWidth={i === lastI ? 2.5 : 2} />
            <text x={x(i)} y={y(pt.s) - 11} textAnchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}
              fontSize="12" fontWeight={i === lastI ? 800 : 600} fill={i === lastI ? CLAN[p.clan].deep : '#7A6C55'}>{fmtScore(pt.s)}</text>
            <title>{`${cycleLong(pt.c)}: ${fmtScore(pt.s)}`}</title>
          </g>
        ))}
        {pts.map((pt, i) => (
          <text key={pt.c} x={x(i)} y={H + 22} fontSize="12" fill="#7A6C55"
            textAnchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}>{cycleShort(pt.c)}</text>
        ))}
      </svg>
    </Section>
  )
}

export default function PlayerSheet({ tag, roster, wide, onClose }: { tag: string; roster: Roster; wide: boolean; onClose: () => void }) {
  const base = roster.players.find((p) => p.tag === tag)
  const [extra, setExtra] = useState<Partial<Player> | null>(() => playerNow(tag)?.extra ?? null)
  const [card, setCard] = useState<PlayerCard | null>(() => playerNow(tag)?.card ?? null)
  const [cardLoading, setCardLoading] = useState(() => !playerNow(tag))
  const { yous } = useYou()
  const isMine = yous.includes(tag)
  const accounts = roster.players.filter((x) => yous.includes(x.tag))
  const close = useRef<HTMLButtonElement>(null)
  const motion = useSheetMotion()
  // Back from a card opened from this one lands where the reader left it.
  const body = useRef<HTMLElement>(null)
  const [returnTo] = useState(() => (motion.sheet === '' && scrolled?.tag === tag && scrolled.visit === sheetVisit() ? scrolled.top : 0))
  const restored = useRef(false)

  useLayoutEffect(() => {
    if (cardLoading || restored.current) return
    restored.current = true
    if (body.current && returnTo) body.current.scrollTop = returnTo
  }, [cardLoading, returnTo])

  useEffect(() => {
    let live = true
    const now = playerNow(tag)
    setExtra(now?.extra ?? null)
    setCard(now?.card ?? null)
    setCardLoading(!now)
    if (!now) loadPlayerAll(tag).then((x) => { if (live) { setExtra(x.extra); setCard(x.card); setCardLoading(false) } })
    return () => { live = false }
  }, [tag])

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    close.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.() }
  }, [onClose])

  const p: Player | undefined = base && { ...base, ...extra, history: extra?.history ?? base.history }
  const score = useCountUp(p?.score ?? null, isMine ? `ff-seen-score-${tag}` : null)
  const eight = isMine ? card?.eight : null
  const reached = useOnce(eight && eight.stars >= 8 ? `ff-eight-${eight.season}-${tag}` : null)
  const freshBadges = useNewIds(isMine && card?.badges ? card.badges.map((b) => `${b.id}-${b.tier}`) : null, isMine ? `ff-seen-badges-${tag}` : null)
  const inCwl = p ? !!roster.clans[p.clan]?.inCwl : false
  // A place in this month's CWL, so it sits with the CWL days under that month's name; the header says only where they are now.
  const place = p ? (p.slot === 'NEW' ? 'New' : inCwl ? { CORE: 'Core', SUB: 'Sub', OUT: 'Not in' }[p.slot] : 'Not in CWL') : ''
  const c = p && CLAN[p.clan]
  const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}%`)
  const cycle = roster.cycles[roster.cycles.length - 1]
  // The live record once the server sends it: the export's window to now, as on War record and the badges.
  const rec = card?.record
  const threeStar = rec ? (rec.three_star_rate === null ? null : rec.three_star_rate * 100) : p?.threeStar ?? null
  const missed = rec ? (rec.attacks + rec.missed ? (100 * rec.missed) / (rec.attacks + rec.missed) : null) : p?.missPct ?? null
  const toUnit = (cat: string, unit: string) => go.drill(unitHash(cat), { tag, unit })
  const toCol = (sub: string, col: string) => () => go.drill(`#/stats/${sub}`, { tag, col })

  return (
    <div className="fixed inset-0 z-40">
      <div className={`${motion.fade} absolute inset-0 bg-[rgba(43,33,20,.35)]`} onClick={onClose} aria-hidden="true" />
      <section ref={body} onScroll={(e) => { scrolled = { tag, top: e.currentTarget.scrollTop, visit: sheetVisit() } }} role="dialog" aria-modal="true" aria-label={p?.name ?? 'Player'}
        className={wide
          ? `${motion.sheet} absolute left-1/2 top-1/2 flex h-[min(720px,90vh)] w-[min(440px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-auto [scrollbar-gutter:stable] rounded-[22px] bg-white p-6 shadow-[0_20px_50px_rgba(43,33,20,.25)]`
          : `${motion.sheet} absolute inset-x-0 bottom-0 flex h-[calc(100dvh-64px)] flex-col gap-4 overflow-auto [scrollbar-gutter:stable] rounded-t-[22px] bg-white px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-8px_30px_rgba(43,33,20,.18)]`}>
        {!wide && <span aria-hidden="true" className="h-[5px] w-10 flex-none self-center rounded-[3px] bg-[#D5C8AC]" />}
        <div className="flex items-center gap-3">
          <SheetTitle th={p?.th} name={p?.name ?? 'Not on the roster'} sub={<>{p ? `${p.inClan ?? p.clan} · ` : ''}{tag}</>} />
          {/* The picker lists your own accounts first, so comparing with yourself stays one tap and anyone else is a search away. */}
          {p && (
            <a href={compareHref(tag)} onClick={() => markFromCard(true)} aria-label="Compare with another player" title="Compare with another player"
              className="flex size-11 flex-none items-center justify-center rounded-full bg-[#F6EEDC] text-muted no-underline hover:bg-well">
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4L3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7" /></svg>
            </a>
          )}
          <button ref={close} type="button" aria-label="Close" onClick={onClose}
            className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-[#F6EEDC] text-muted hover:bg-well">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {p && c && (
          <>
            {isMine && accounts.length > 1 && (
              <nav aria-label="Your accounts" className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
                {accounts.map((a) => (
                  <a key={a.tag} href={playerHref(a.tag)} aria-current={a.tag === tag ? 'page' : undefined}
                    className={`flex min-h-9 flex-none items-center rounded-full border px-3 text-[13px] font-bold no-underline ${a.tag === tag ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-2 hover:bg-page'}`}>{a.name}</a>
                ))}
              </nav>
            )}
            {p.inClan && stillToMove(p, roster) && (
              <div className="flex min-h-12 items-center gap-2 rounded-[14px] bg-[#F6EEDC] px-4 text-sm font-semibold text-action-deep">
                <span className="flex-auto">Move before sign-up</span>
                <span className="font-bold" style={{ color: CLAN[p.inClan].deep }}>{p.inClan}</span>
                <Arrow size={14} />
                <span className="font-bold" style={{ color: c.deep }}>{p.clan}</span>
              </div>
            )}
            <div className="flex flex-col gap-3 rounded-2xl p-4" style={{ background: c.tint }}>
              <div className="flex items-end justify-between gap-3">
                <div className="flex flex-col">
                  <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.06em]" style={{ color: c.label }}>Score{cycle ? ` · ${cycleShort(cycle)}` : ''}<Info topic="score" extra={p.attackScore != null && p.defenceScore != null ? `Attack ${p.attackScore.toFixed(1)} + Defence ${p.defenceScore.toFixed(1)}` : null} /></span>
                  <span className="font-display text-5xl leading-none tabular-nums" style={{ color: c.deep }}>{fmtScore(score)}</span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusPill status={p.status} className="!px-2.5 !py-[3px] !text-xs !font-bold" />
                  {p.rank && <span className="text-[13px] font-semibold text-muted">#{p.rank} in the family</span>}
                </div>
              </div>
              {eight && (
                <div className="flex flex-col gap-1.5 border-t pt-2.5" style={{ borderColor: 'rgba(43,33,20,.08)' }}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-semibold text-muted">Stars toward 8</span>
                    <span className="text-[13px] font-bold tabular-nums text-ink-2">{eight.stars} of 8{eight.stars < 8 && p.days ? ` · ${((n) => `${n} ${n === 1 ? 'day' : 'days'} left`)(p.days.filter((d) => d > eight.begun).length)}` : ''}</span>
                  </div>
                  <Bar v={(eight.stars / 8) * 100} color={c.deep} />
                </div>
              )}
              {(p.days || card?.family_since || cardLoading) && (
                <div className="flex flex-col gap-2 border-t pt-2.5" style={{ borderColor: 'rgba(43,33,20,.08)' }}>
                  {p.days && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-muted">{cycle ? `${cycleShort(cycle)} CWL` : 'CWL'} · {place}</span>
                      <PlayDays days={p.days} clan={p.clan} size={22} />
                    </div>
                  )}
                  {cardLoading && <div aria-hidden="true" className="h-5 animate-pulse rounded bg-black/5" />}
                  {card?.family_since && (
                    <div className="flex items-center justify-between gap-2" title="When Clash of Stats first saw them, so approximate">
                      <span className="text-[13px] font-semibold text-muted">In the family since</span>
                      <span className="text-[13px] font-bold tabular-nums text-ink-2">{new Date(`${card.family_since}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Everything below the score waits for the card and arrives together, so nothing already drawn moves. */}
            {cardLoading ? (
              <div aria-busy="true" aria-label="Loading" className="flex flex-none flex-col gap-4">
                {[32, 78, 78, 130, 288].map((h, i) => <Holding key={i} height={h} />)}
              </div>
            ) : (
            <div className="ff-fade flex flex-none flex-col gap-4">
            <Trend p={p} cycles={roster.cycles} />
            <StarBurst show={reached} />
            {card?.badges?.length ? <Badges tag={tag} badges={card.badges} fresh={freshBadges} /> : null}
            {isMine && card?.next_badge && (
              <div className="flex flex-col gap-1.5 rounded-xl bg-[#F6EEDC] px-3 py-2.5">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-bold text-ink">Next: {BADGES[card.next_badge.id]?.label ?? card.next_badge.label}, {card.next_badge.tier}</span>
                  <span className="flex-none text-xs font-bold tabular-nums text-muted">{card.next_badge.pct}%</span>
                </span>
                <Bar v={card.next_badge.pct} color={c.deep} />
                <span className="text-[13px] text-muted">{card.next_badge.text}</span>
              </div>
            )}
            {card && card.heroes.length > 0 && (
              <Section title="Heroes and equipment">
                <ul className={LIST}>
                  {card.heroes.map((h, i) => (
                    <li key={h.name} className={`flex items-center gap-2 px-3 py-1.5 ${i ? 'border-t border-hair' : ''}`}>
                      <button type="button" title={h.name} aria-label={`${h.name}, level ${h.level}: see the ranking`} onClick={() => toUnit('heroes', h.name)} className="-ml-1 flex flex-none cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent p-1 hover:bg-hover">
                        <UnitIcon name={h.name} size={32} />
                        <span className={`w-[52px] text-left text-xs font-bold tabular-nums ${h.max && h.level >= h.max ? 'text-gold' : 'text-ink-2'}`}>{h.level}{h.max ? <span className="font-semibold text-faint">/{h.max}</span> : null}</span>
                      </button>
                      <span className="ml-auto flex items-center gap-2.5">
                        {h.gear?.map((g) => (
                          <button type="button" key={g.name} title={g.name} aria-label={`${g.name}, level ${g.level}: see the ranking`} onClick={() => toUnit('equipment', g.name)} className="flex w-[52px] cursor-pointer items-center gap-1 rounded-lg border-0 bg-transparent p-0.5 hover:bg-hover">
                            <UnitIcon name={g.name} size={28} />
                            <span className={`text-[11px] font-bold tabular-nums ${g.max && g.level >= g.max ? 'text-gold' : 'text-muted'}`}>{g.level}</span>
                          </button>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {card && card.upgrades.length > 0 && (
              <Section title="Latest upgrades">
                <ul className={LIST}>
                  {card.upgrades.slice(0, 4).map((u, i) => (
                    <li key={`${u.unit}-${u.to}`} className={i ? 'border-t border-hair' : ''}>
                      <button type="button" onClick={() => { markFromCard(true); go.to(historyHref(tag, 30)) }}
                        className="flex min-h-10 w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-[13px] hover:bg-hover">
                        <UnitIcon name={u.unit} size={26} />
                        <span className="min-w-0 flex-auto truncate font-semibold text-ink">{u.unit}</span>
                        <span className="flex-none text-xs font-bold tabular-nums text-ink-2">{u.from} → {u.to}</span>
                        <span className="w-14 flex-none text-right text-[11px] text-faint">{ago(u.at)}</span>
                        <RowChevron />
                      </button>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {card && (
              <Section title="All upgrades">
                <ul className="m-0 grid list-none grid-cols-3 gap-1.5 p-0">
                  {CATS.map((c) => (
                    <li key={c.id}>
                      <a href={upgradeHref(c.id, p.tag)} onClick={() => markFromCard(true)} className="flex min-h-11 items-center gap-1 rounded-xl border border-line bg-white px-1.5 py-1 text-xs font-bold text-ink no-underline hover:bg-hover">
                        <UnitIcon name={c.icon} size={22} />
                        <span className="min-w-0 truncate">{c.label}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {/* The monthly figures stand in only if the live ones fail, so the numbers do not change under the reader. */}
            <Section title="War record" note={rec?.from ? sinceDay(rec.from) : fmtWindow(roster.window)}>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="3★ rate" value={pct(threeStar)} onOpen={toCol('war', 'triple')} />
                <Stat label="Miss rate" value={pct(missed)} onOpen={toCol('war', 'rate')} />
                <Stat label="Attacks" value={rec?.attacks ?? p.attacks ?? '—'} onOpen={toCol('war', 'attacks')} />
              </div>
            </Section>
            {card?.streaks && (
              <Section title="Streaks" note={card.tracked_from ? `Since ${dayMonth(card.tracked_from)}` : null}>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="3★ now" value={<>{card.streaks.three_stars}</>} />
                  <Stat label="3★ best" value={card.streaks.three_stars_best} />
                  <Stat label="No-miss wars" value={card.streaks.clean_wars} />
                </div>
              </Section>
            )}
            {card && card.attacks.length > 0 && (
              <Section title="Latest attacks">
                <ul className={LIST}>
                  {card.attacks.slice(0, 5).map((a, i) => (
                    <li key={i} className={i ? 'border-t border-hair' : ''}>
                      <button type="button" onClick={() => { markFromCard(true); go.to(attacksHref(tag, 30)) }}
                        className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left hover:bg-hover">
                        <Th th={a.target_th} />
                        <span className="flex min-w-0 flex-auto flex-col">
                          <span className="truncate text-[13px] font-semibold text-ink">{a.target ?? 'Unknown'}</span>
                          <span className="truncate text-[11px] text-faint">{a.kind === 'cwl' ? `CWL day ${a.day ?? '?'} · ` : ''}{a.opponent}</span>
                        </span>
                        <Stars n={a.stars} />
                        <span className="w-9 flex-none text-right text-xs font-bold tabular-nums text-ink-2">{Math.round(a.destruction)}%</span>
                        <RowChevron />
                      </button>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {card && (
              <Section title="Totals">
                <div className="grid grid-cols-4 gap-1.5">
                  <Stat small label="Donated" value={num(card.donations)} onOpen={toCol('donations', 'donated')} />
                  <Stat small label="Received" value={num(card.donations_received)} onOpen={toCol('donations', 'received')} />
                  <Stat small label="War stars" value={num(card.war_stars)} onOpen={toCol('war', 'total')} />
                  <Stat small label="Capital" value={num(card.capital)} onOpen={toCol('capital', 'contributed')} />
                </div>
              </Section>
            )}
            </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
