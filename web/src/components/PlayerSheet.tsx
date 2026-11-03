import { type ReactNode, useEffect, useRef, useState } from 'react'
import { loadPlayerAll, type PlayerCard, playerNow } from '../data'
import { BADGES, TIER_LOOK, TIERS } from '../badges'
import { ago } from '../leaders'
import { CATS } from '../explore'
import { compareHref, go, markFromCard, playerHref, upgradeHref } from '../route'
import { useYou } from './You'
import { CLAN, cycleLong, cycleShort, fmtScore, fmtWindow } from '../theme'
import type { Player, Roster } from '../types'
import { Arrow, PlayDays, RowChevron, Stars, StatusPill, Th, UnitIcon } from './ui'

// Explained on hover with a mouse, and on tap on a phone. Tapping elsewhere closes it.
function Badges({ badges }: { badges: NonNullable<PlayerCard['badges']> }) {
  const [hover, setHover] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const open = badges.find((b) => b.id === (hover ?? pinned))
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!pinned) return
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setPinned(null) }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [pinned])
  return (
    <div ref={box} className="relative">
      <ul aria-label="Badges" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {badges.map((b) => (
          <li key={b.id}>
            <button type="button" aria-expanded={open?.id === b.id}
              onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHover(b.id) }}
              onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHover(null) }}
              onClick={() => setPinned((p) => (p === b.id ? null : b.id))}
              className={`flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs font-bold ${TIER_LOOK[b.tier ?? 'silver'][open?.id === b.id ? 'on' : 'chip']}`}>
              {BADGES[b.id]?.label ?? b.label}
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <div role="tooltip" className="absolute inset-x-0 top-full z-10 mt-1.5 flex flex-col gap-0.5 rounded-xl bg-ink px-3 py-2.5 text-white shadow-[0_8px_24px_rgba(43,33,20,.3)]">
          <span className="text-[13px] font-bold">{BADGES[open.id]?.label ?? open.label}{open.tier && <span style={{ color: TIER_LOOK[open.tier].ink }}> · {TIER_LOOK[open.tier].name}</span>}</span>
          {BADGES[open.id] && <span className="text-xs">{BADGES[open.id].means}</span>}
          {open.tier && BADGES[open.id] && (
            <span className="mt-0.5 grid grid-cols-3 gap-1 text-[11px]">
              {TIERS.map((t, i) => (
                <span key={t} className={`rounded-md px-1.5 py-1 text-center ${t === open.tier ? 'bg-white/15 font-bold' : 'text-white/60'}`} style={t === open.tier ? { color: TIER_LOOK[t].ink } : undefined}>
                  {TIER_LOOK[t].name}<br />{BADGES[open.id].ladder[i]}
                </span>
              ))}
            </span>
          )}
          <span className="text-xs font-semibold" style={{ color: open.tier ? TIER_LOOK[open.tier].ink : '#FDE68A' }}>{open.detail}</span>
        </div>
      )}
    </div>
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
function Stat({ label, value, sub, onOpen }: { label: string; value: ReactNode; sub?: string; onOpen?: () => void }) {
  const body = (
    <>
      <span className="truncate text-[11px] text-faint">{label}</span>
      <span className="truncate text-[17px] font-bold leading-tight tabular-nums">{value}</span>
      {sub && <span className="truncate text-[11px] font-semibold text-faint">{sub}</span>}
    </>
  )
  const box = 'flex min-w-0 flex-col gap-0.5 rounded-xl border border-line px-2.5 py-2'
  if (!onOpen) return <div className={box}>{body}</div>
  return (
    <button type="button" onClick={onOpen} className={`${box} relative cursor-pointer bg-transparent pr-5 text-left text-ink hover:bg-hover`}>
      {body}
      <span className="absolute right-1 top-1/2 -translate-y-1/2"><RowChevron /></span>
    </button>
  )
}

// Where a unit's ranking lives; a new town hall has none, so it opens the Log.
const UPGRADE_HOME: Record<string, string> = { hero: 'heroes', equipment: 'equipment', troop: 'troops', spell: 'spells', pet: 'pets', siege: 'sieges' }
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
    <Section title="Score by cycle" note="Monthly">
      <svg role="img" aria-label={`Score by cycle: ${label}`} viewBox="-8 -12 366 130" className="h-auto w-full overflow-visible">
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
  const { yous, addYou, removeYou } = useYou()
  const isMine = yous.includes(tag)
  const accounts = roster.players.filter((x) => yous.includes(x.tag))
  const close = useRef<HTMLButtonElement>(null)

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
    close.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.() }
  }, [onClose])

  const p: Player | undefined = base && { ...base, ...extra, history: extra?.history ?? base.history }
  const inCwl = p ? !!roster.clans[p.clan]?.inCwl : false
  const where = p ? `${p.clan} · ${p.slot === 'NEW' ? 'new' : inCwl ? { CORE: 'core', SUB: 'sub', OUT: 'not in' }[p.slot] : 'not in CWL'}` : ''
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
      <div className="ff-fade absolute inset-0 bg-[rgba(43,33,20,.35)]" onClick={onClose} aria-hidden="true" />
      <section role="dialog" aria-modal="true" aria-label={p?.name ?? 'Player'}
        className={wide
          ? 'ff-sheet absolute left-1/2 top-1/2 flex h-[min(720px,90vh)] w-[min(440px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-auto rounded-[22px] bg-white p-6 shadow-[0_20px_50px_rgba(43,33,20,.25)]'
          : 'ff-sheet absolute inset-x-0 bottom-0 flex h-[calc(100dvh-64px)] flex-col gap-4 overflow-auto rounded-t-[22px] bg-white px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-8px_30px_rgba(43,33,20,.18)]'}>
        {!wide && <span aria-hidden="true" className="h-[5px] w-10 flex-none self-center rounded-[3px] bg-[#D5C8AC]" />}
        <div className="flex items-center gap-3">
          {p && <Th th={p.th} size="lg" />}
          <div className="flex min-w-0 flex-auto flex-col">
            {/* A name too long to share the line pushes the tag below it, rather than either being cut. */}
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-display min-w-0 max-w-full truncate text-[26px] leading-tight">{p?.name ?? 'Not on the roster'}</span>
              <span className="flex-none text-xs tabular-nums text-faint">{tag}</span>
            </span>
            <span className="flex min-w-0 items-center gap-2 text-[13px] text-faint">
              <span className="min-w-0 truncate">{where}</span>
              {p && (
                <button type="button" onClick={() => (isMine ? removeYou(tag) : addYou(tag))}
                  className={`min-h-8 flex-none cursor-pointer whitespace-nowrap rounded-full border-0 px-2.5 text-xs font-bold ${isMine ? 'bg-ink text-white' : 'bg-[#EFE6D2] text-ink-2 hover:bg-well'}`}>
                  {isMine ? 'You · undo' : yous.length ? 'Also me' : 'This is me'}
                </button>
              )}
            </span>
          </div>
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
                    className={`flex-none rounded-full border px-2.5 py-1 text-xs font-bold no-underline ${a.tag === tag ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-2 hover:bg-page'}`}>{a.name}</a>
                ))}
              </nav>
            )}
            {p.inClan && p.inClan !== p.clan && (
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
                  <span className="text-xs font-bold uppercase tracking-[0.06em]" style={{ color: c.label }}>Score{cycle ? ` · ${cycleShort(cycle)}` : ''}</span>
                  <span className="font-display text-5xl leading-none tabular-nums" style={{ color: c.deep }}>{fmtScore(p.score)}</span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusPill status={p.status} className="!px-2.5 !py-[3px] !text-xs !font-bold" />
                  {p.rank && <span className="text-[13px] font-semibold text-muted">#{p.rank} in the family</span>}
                  {p.attackScore != null && p.defenceScore != null && (
                    <span className="text-xs font-semibold tabular-nums text-muted">Attack {p.attackScore.toFixed(1)} + Defence {p.defenceScore.toFixed(1)}</span>
                  )}
                </div>
              </div>
              {(p.days || card?.family_since || cardLoading) && (
                <div className="flex flex-col gap-2 border-t pt-2.5" style={{ borderColor: 'rgba(43,33,20,.08)' }}>
                  {p.days && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-muted">CWL days</span>
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
            {card?.badges?.length ? <Badges badges={card.badges} /> : null}
            {/* The picker lists your own accounts first, so comparing with yourself stays one tap and anyone else is a search away. */}
            <a href={compareHref(tag)} onClick={() => markFromCard(true)}
              className="flex min-h-11 flex-none items-center justify-center rounded-xl bg-[#F6EEDC] text-sm font-bold text-ink no-underline hover:bg-well">
              Compare with another player
            </a>
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
            <Section title="War record" note={rec?.from ? `Since ${dayMonth(rec.from)}` : fmtWindow(roster.window)}>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Three stars" value={pct(threeStar)} onOpen={toCol('war', 'triple')} />
                <Stat label="Missed" value={pct(missed)} onOpen={toCol('war', 'missed')} />
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
            <Trend p={p} cycles={roster.cycles} />
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
            {card && card.attacks.length > 0 && (
              <Section title="Latest attacks">
                <ul className={LIST}>
                  {card.attacks.slice(0, 5).map((a, i) => (
                    <li key={i} className={`flex items-center gap-2 px-3 py-1.5 ${i ? 'border-t border-hair' : ''}`}>
                      <Th th={a.target_th} />
                      <span className="flex min-w-0 flex-auto flex-col">
                        <span className="truncate text-[13px] font-semibold text-ink">{a.target ?? 'Unknown'}</span>
                        <span className="truncate text-[11px] text-faint">{a.kind === 'cwl' ? `CWL day ${a.day ?? '?'} · ` : ''}{a.opponent}</span>
                      </span>
                      <Stars n={a.stars} />
                      <span className="w-9 flex-none text-right text-xs font-bold tabular-nums text-ink-2">{Math.round(a.destruction)}%</span>
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
                      <button type="button" onClick={() => (u.category && UPGRADE_HOME[u.category] ? toUnit(UPGRADE_HOME[u.category], u.unit) : go.drill('#/log', { tag, unit: 'Town Hall' }))}
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
              <Section title="Totals">
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Donated" value={num(card.donations)} sub="this season" onOpen={toCol('donations', 'donated')} />
                  <Stat label="Received" value={num(card.donations_received)} sub="this season" onOpen={toCol('donations', 'received')} />
                  <Stat label="War stars" value={num(card.war_stars)} sub="all time" onOpen={toCol('war', 'stars')} />
                  <Stat label="Capital" value={num(card.capital)} sub="all time" onOpen={toCol('capital', 'contributed')} />
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
