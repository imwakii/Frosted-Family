import { type MouseEvent, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, useSyncExternalStore } from 'react'
import { leagueIcon, thIcon, unitIcon, useClans } from '../clash'
import { CLAN, CLANS, STATUS } from '../theme'
import type { ClanName, Status } from '../types'

export function Th({ th, size = 'sm' }: { th: number | null; size?: 'sm' | 'lg' }) {
  const img = thIcon(th)
  const label = th ? `Town hall ${th}` : 'Town hall unknown'
  if (img) {
    const px = size === 'lg' ? 52 : 34
    return <img src={img} alt={label} width={px} height={px} className="flex-none object-contain" style={{ width: px, height: px }} />
  }
  const box = size === 'lg' ? 'size-[46px] rounded-[14px] text-[17px] font-extrabold' : 'size-[26px] rounded-lg text-xs font-bold'
  return (
    <span className={`flex flex-none items-center justify-center ${size === 'lg' ? 'size-[52px]' : 'size-[34px]'}`}>
      <span aria-label={label} className={`${box} flex items-center justify-center bg-[#F1E8D3] text-ink-2 tabular-nums`}>{th ?? '?'}</span>
    </span>
  )
}

/** A clan badge from the API's badgeUrls; nothing until the API has answered. */
export function ClanBadge({ src, size = 22, className = '' }: { src: string | null | undefined; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false)
  if (!src || broken) return null
  return <img src={src} alt="" width={size} height={size} onError={() => setBroken(true)} className={`flex-none object-contain ${className}`} style={{ width: size, height: size }} />
}

/** League badge and name, e.g. Champion League III · 15v15. */
export function LeaguePill({ league, text }: { league: string | null; text: string }) {
  const icon = leagueIcon(league)
  return (
    <span className={`flex items-center gap-1 self-start rounded-full bg-white py-0.5 pr-2.5 text-xs font-bold text-ink-2 ${icon ? 'pl-1' : 'pl-2.5'}`}>
      {icon && <img src={icon} alt="" width={22} height={22} className="size-[22px]" />}
      {text}
    </span>
  )
}

/** A unit's 64px icon, or its name where no icon exists. */
export function UnitIcon({ name, size }: { name: string; size: number }) {
  const [broken, setBroken] = useState(false)
  if (broken) {
    return <span className="px-0.5 text-center text-[10px] font-bold leading-[1.15] text-muted">{name}</span>
  }
  return <img src={unitIcon(name)} alt="" width={size} height={size} onError={() => setBroken(true)} style={{ width: size, height: size }} />
}

export const Display = ({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) => (
  <span className={`font-display ${className}`} style={style}>{children}</span>
)

export function StatusPill({ status, className = '' }: { status: Status; className?: string }) {
  const s = STATUS[status]
  return (
    <span className={`flex-none whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`} style={{ background: s.bg, color: s.fg }}>
      {s.text}
    </span>
  )
}

// Few attacks is a hollow ring, so it reads apart from Inactive's solid grey.
function Dot({ status }: { status: Status }) {
  const s = STATUS[status]
  return <span className="size-2 flex-none rounded-full" style={status === 'thin' ? { boxShadow: `inset 0 0 0 1.5px ${s.dot}` } : { background: s.dot }} />
}

/** Every legend's row: one line, directly above the list it explains. On a very narrow screen it scrolls rather than wraps. */
export const KEY_ROW = 'flex gap-x-2.5 gap-y-1.5 overflow-x-auto whitespace-nowrap text-xs font-semibold text-muted [scrollbar-width:none] md:flex-wrap md:gap-x-[18px] md:overflow-visible md:text-[13px]'

/** A member's status as a dot; StatusKey says what each colour means. */
export function StatusDot({ status }: { status: Status }) {
  return <span title={STATUS[status].text} className="flex w-2 flex-none justify-center"><Dot status={status} /><span className="sr-only">{STATUS[status].text}</span></span>
}

export function StatusKey({ only, extra, className = '' }: { only?: Status[]; extra?: ReactNode; className?: string }) {
  return (
    <div aria-label="Key" className={`${KEY_ROW} ${className}`}>
      {(only ?? (Object.keys(STATUS) as Status[])).map((k) => <span key={k} className="flex flex-none items-center gap-1 md:gap-1.5"><Dot status={k} />{STATUS[k].text}</span>)}
      {extra}
    </div>
  )
}

export const Arrow = ({ size = 16 }: { size?: number }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#A3957C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)

export const SearchIcon = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7A6C55" strokeWidth="2.2" strokeLinecap="round" className="pointer-events-none absolute left-[15px] top-1/2 -translate-y-1/2">
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4.5-4.5" />
  </svg>
)

export const Eyebrow = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <span className={`text-xs font-bold uppercase tracking-[0.06em] text-faint ${className}`}>{children}</span>
)

export const Star = () => <span aria-hidden="true" className="text-gold">★</span>

// A tab's own sections, as links under the top bar.
export function SubNav({ items, current, wide }: { items: { id: string; label: string; href: string }[]; current: string; wide: boolean }) {
  const ref = useRef<HTMLElement>(null)
  // A section past the edge is scrolled into view when it is the one open.
  useEffect(() => { ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }) }, [current])
  return (
    <div className={wide ? 'border-b border-line bg-white' : 'px-4'}>
      {/* A soft gold pill marks the open section, so this row reads apart from the clan switch and chips below it. Its padding closes up so Stats' five fit from 360px wide. The first pill lines up with the page's left edge, like every chip and card below it. */}
      <nav ref={ref} aria-label="Section" className={`flex overflow-x-auto [scrollbar-width:none] ${wide ? 'mx-auto max-w-[1360px] gap-1.5 px-[clamp(16px,3vw,32px)]' : 'gap-1'}`}>
        {items.map((s) => (
          <a key={s.id} href={s.href} aria-current={s.id === current ? 'page' : undefined} className="flex min-h-11 flex-none items-center no-underline">
            <span className={`whitespace-nowrap rounded-full px-[clamp(8px,calc((100vw-271px)/10),12px)] py-1 text-[14px] font-bold ${s.id === current ? 'bg-[#F3E3B3] text-ink' : 'text-muted hover:text-ink'}`}>{s.label}</span>
          </a>
        ))}
      </nav>
    </div>
  )
}

/** Re-renders every `ms` with the current time. */
export function useNow(ms = 15_000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), ms); return () => window.clearInterval(id) }, [ms])
  return now
}

/** The time now: in the viewer's own zone, as their device reports it, or in UTC after a tap. The choice is remembered. */
// Whether times read as UTC or the phone's own, chosen in Settings.
const UTC_KEY = 'ff-clock'
let utcNow = (() => { try { return localStorage.getItem(UTC_KEY) === 'utc' } catch { return false } })()
const utcListeners = new Set<() => void>()
export function useUtc() {
  return useSyncExternalStore((l) => { utcListeners.add(l); return () => { utcListeners.delete(l) } }, () => utcNow)
}
export function setUtc(v: boolean) {
  utcNow = v
  try { localStorage.setItem(UTC_KEY, v ? 'utc' : 'local') } catch { /* private mode */ }
  utcListeners.forEach((l) => l())
}

/** One row of a settings list: what it does, and a switch. */
export function SwitchRow({ label, line, on, disabled, onFlip }: { label: string; line: string; on: boolean; disabled?: boolean; onFlip: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onFlip}
      className="flex min-h-[60px] w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-3 py-2 text-left disabled:cursor-default">
      <span className="flex min-w-0 flex-auto flex-col">
        <span className="text-[15px] font-bold text-ink">{label}</span>
        <span className="truncate text-[13px] leading-[1.3] text-muted">{line}</span>
      </span>
      <span aria-hidden="true" className={`relative h-[31px] w-[51px] flex-none rounded-full transition-colors ${on ? 'bg-ink' : 'bg-[#E3D8BF]'}`}>
        <span className={`absolute left-0.5 top-0.5 size-[27px] rounded-full bg-white shadow-[0_2px_5px_rgba(43,33,20,.25)] transition-transform ${on ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  )
}

/** An empty or error screen: one goblin, shown as drawn, and a short line. */
export function GoblinNote({ goblin, box, children }: { goblin: 'panic' | 'bored' | 'coin' | 'page'; box?: boolean; children: ReactNode }) {
  return (
    <div className={`flex flex-none flex-col items-center gap-3 px-5 py-6 text-center text-sm text-faint ${box ? 'rounded-2xl border border-line bg-white' : ''}`}>
      <img src={`/icons/goblin-${goblin}.png`} alt="" className="h-28 w-auto" />
      <span className="text-balance">{children}</span>
    </div>
  )
}

/** A compact choice for a phone: the size of a chip, opens the phone's own list. */
export function Picker<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: { id: T; label: string }[]; onPick: (v: T) => void }) {
  return (
    <label className="relative flex min-h-9 min-w-0 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-white px-3 text-[13px] font-bold text-ink-2">
      <span className="sr-only">{label}</span>
      <span className="truncate">{options.find((o) => o.id === value)?.label ?? value}</span>
      <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="flex-none"><path d="M6 9l6 6 6-6" /></svg>
      <select value={value} onChange={(e) => onPick(e.target.value as T)} className="absolute inset-0 cursor-pointer opacity-0">
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  )
}

// The seven CWL days, filled where the published day plan has the player in.
export function PlayDays({ days, clan, size = 15 }: { days: number[]; clan: ClanName; size?: number }) {
  return (
    <span aria-label={days.length ? `Plays day ${days.join(', ')}` : 'No days planned'} className="flex gap-[3px]">
      {[1, 2, 3, 4, 5, 6, 7].map((d) => (
        <span key={d} className="flex items-center justify-center rounded-full font-extrabold"
          style={{ width: size, height: size, fontSize: Math.round(size * 0.6), ...(days.includes(d) ? { background: CLAN[clan].accent, color: '#FFFBF1' } : { boxShadow: 'inset 0 0 0 1px #EFE6D2', color: '#C9BCA0' }) }}>{d}</span>
      ))}
    </span>
  )
}

/** Stars out of three, for one attack or the best on a base. */
export function Stars({ n }: { n: number }) {
  // A star that has just been won pops in; the ones already there stay still.
  const was = useRef(n)
  useEffect(() => { was.current = n }, [n])
  return (
    <span aria-label={`${n} stars`} className="flex-none tracking-[-1px]">
      {[0, 1, 2].map((i) => <span key={i} className={`${i < n ? 'text-gold' : 'text-[#C9BCA0]'} ${i < n && i >= was.current ? 'ff-pop' : ''}`}>{i < n ? '★' : '☆'}</span>)}
    </span>
  )
}

type DayFacts = { day: number; state: string; stars: number; opponent_stars: number; destruction: number; opponent_destruction: number }

export const dayWon = (d: DayFacts) => (d.stars !== d.opponent_stars ? d.stars > d.opponent_stars : d.destruction !== d.opponent_destruction ? d.destruction > d.opponent_destruction : null)

/** A row of buttons with one highlight that slides to the picked one, and can be held and slid across. It only moves once
 * placed, so it does not fly in when a page opens. The buttons must be in the same order as `items`. */
function useSlidePick<T>(value: T, items: readonly T[], onPick: (v: T) => void) {
  const nav = useRef<HTMLElement>(null)
  const [slide, setSlide] = useState<{ left: number; width: number; moves: boolean } | null>(null)
  useLayoutEffect(() => {
    const place = (moves: boolean) => {
      const on = nav.current?.querySelector<HTMLElement>('[aria-pressed="true"]')
      setSlide(on ? { left: on.offsetLeft, width: on.offsetWidth, moves } : null)
    }
    place(slide !== null)
    // A resize places it again without the slide.
    const seen = new ResizeObserver(() => place(false))
    if (nav.current) seen.observe(nav.current)
    return () => seen.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // The highlight can also be held and slid across; letting go picks the clan nearest its middle. A tap still just picks.
  const grab = useRef<{ x: number; left: number; moved: boolean } | null>(null)
  const swallowClick = useRef(false)
  const [dragLeft, setDragLeft] = useState<number | null>(null)
  const buttons = () => [...(nav.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
  const onPointerDown = (e: PointerEvent) => {
    swallowClick.current = false
    const on = (e.target as HTMLElement).closest('button')?.getAttribute('aria-pressed') === 'true'
    grab.current = on && slide ? { x: e.clientX, left: slide.left, moved: false } : null
  }
  const onPointerMove = (e: PointerEvent) => {
    const g = grab.current
    if (!g || !slide) return
    const dx = e.clientX - g.x
    if (!g.moved) {
      if (Math.abs(dx) < 5) return
      g.moved = true
      nav.current?.setPointerCapture(e.pointerId)
    }
    const all = buttons()
    const last = all[all.length - 1]
    setDragLeft(Math.min(Math.max(g.left + dx, all[0].offsetLeft), last.offsetLeft + last.offsetWidth - slide.width))
  }
  const onPointerUp = () => {
    const g = grab.current
    grab.current = null
    if (!g?.moved || !slide || dragLeft === null) return
    swallowClick.current = true
    const middle = dragLeft + slide.width / 2
    const distance = (b: HTMLButtonElement) => Math.abs(b.offsetLeft + b.offsetWidth / 2 - middle)
    const nearest = buttons().filter((b) => !b.disabled).sort((a, b) => distance(a) - distance(b))[0]
    setDragLeft(null)
    setSlide({ ...slide, moves: true })
    const picked = nearest && items[buttons().indexOf(nearest)]
    if (picked !== undefined && picked !== value) onPick(picked)
  }
  const onPointerCancel = () => { grab.current = null; setDragLeft(null) }
  return {
    navProps: {
      ref: nav, onPointerDown, onPointerMove, onPointerUp, onPointerCancel,
      onClickCapture: (e: MouseEvent) => { if (swallowClick.current) { swallowClick.current = false; e.preventDefault(); e.stopPropagation() } },
    },
    slideStyle: slide && { width: slide.width, transform: `translateX(${dragLeft ?? slide.left}px)` },
    slideMotion: slide?.moves && dragLeft === null ? 'transition-[transform,width] duration-200 ease-out motion-reduce:transition-none' : '',
    grabbing: dragLeft !== null,
  }
}

/** The seven CWL days, the same row on War and Roster: each day's result once it has one. A clan out of this month's CWL
 * gets the row greyed out, so switching to it keeps the page's shape. */
export function DayRow({ days = [], pick, onPick, live = 0, roster, drawnOnly, out }: {
  days?: DayFacts[]; pick: number | 'all' | null; onPick: (d: number | 'all') => void; live?: number; roster?: boolean; drawnOnly?: boolean; out?: boolean
}) {
  const cell = 'relative flex min-h-[42px] min-w-0 cursor-pointer flex-col items-center justify-center rounded-[9px] border-0 tabular-nums disabled:cursor-default disabled:opacity-40'
  const items = useMemo<(number | 'all')[]>(() => [...(roster ? ['all' as const] : []), 1, 2, 3, 4, 5, 6, 7], [roster])
  const { navProps, slideStyle, slideMotion, grabbing } = useSlidePick<number | 'all' | null>(pick, items, (d) => { if (d !== null) onPick(d) })
  const grab = (on: boolean) => (on ? (grabbing ? 'cursor-grabbing' : 'cursor-grab') : '')
  return (
    <div className="flex w-full max-w-[480px] flex-col gap-1">
    <Eyebrow className="px-0.5">{out ? 'Not in CWL' : 'CWL day'}</Eyebrow>
    <nav {...(out ? {} : navProps)} aria-label={out ? 'Not in CWL' : 'CWL day'} className={`relative grid w-full touch-pan-y select-none gap-1 rounded-xl bg-well p-1 ${roster ? 'grid-cols-[1.7fr_repeat(7,1fr)]' : 'grid-cols-7'}`}>
      {slideStyle && <span aria-hidden="true" className={`absolute inset-y-1 left-0 rounded-[9px] bg-white shadow-[0_1px_3px_rgba(43,33,20,.12)] ${slideMotion}`} style={slideStyle} />}
      {roster && (
        <button type="button" aria-pressed={pick === 'all'} disabled={out} onClick={() => onPick('all')}
          className={`${cell} ${grab(pick === 'all')} bg-transparent text-[13px] font-bold transition-colors duration-200 motion-reduce:transition-none ${pick === 'all' ? 'text-ink' : 'text-muted'}`}>All</button>
      )}
      {[1, 2, 3, 4, 5, 6, 7].map((n) => {
        const d = days.find((x) => x.day === n)
        const over = d?.state === 'warEnded', fighting = d?.state === 'inWar' || (!d && n === live), prep = d?.state === 'preparation'
        const won = d && over ? dayWon(d) : null
        // A day in preparation wears the peach of the War tab's Preparation pill. The picked day lets the white highlight
        // show through, and its score says the result instead.
        const background = pick === n ? 'transparent' : over ? (won === true ? '#DCEFD5' : won === false ? '#F8D5CF' : '#EFE6D2') : prep ? '#FFEDD5' : fighting ? '#FFFBF1' : 'transparent'
        const score = fighting || (pick === n && won === true) ? 'text-[#15803D]' : pick === n && won === false ? 'text-[#B91C1C]' : 'text-ink-2'
        return (
          <button key={n} type="button" aria-pressed={pick === n} aria-label={`Day ${n}${prep ? ', preparation' : ''}`} disabled={out || (drawnOnly && !d)} onClick={() => onPick(n)}
            className={`${cell} ${grab(pick === n)}`} style={{ background }}>
            <span className={`text-sm font-bold leading-tight ${prep ? 'text-[#B4451A]' : pick === n ? 'text-ink' : 'text-muted'}`}>{n}</span>
            {d && (over || fighting) && <span className={`text-[10px] font-bold leading-tight ${score}`}>{d.stars}–{d.opponent_stars}</span>}
            {prep && <span className="text-[10px] font-bold leading-tight text-[#B4451A]">Prep</span>}
            {fighting && <span className="ff-live absolute right-1 top-1 size-1.5 rounded bg-[#16A34A]" />}
          </button>
        )
      })}
    </nav>
    </div>
  )
}

/** The clan switch on every tab: same look, directly under the sub-tabs. A wide War tab keeps it right, level with the day strip. */
/** A phone page's clan switch follows the scroll, in the place it would sit anyway. */
export const STICKY_SWITCH = 'sticky top-0 z-10 -mx-4 -mb-1 -mt-1 bg-page px-4 pb-1 pt-1'

export function ClanSwitch<T extends ClanName | 'All'>({ value, onPick, options, live = [], prep = [], flag = [], off = [] }: {
  value: T; onPick: (c: T) => void; options?: readonly T[]; live?: ClanName[]; prep?: ClanName[]; flag?: ClanName[]; off?: ClanName[]
}) {
  const clans = useClans()
  const list = (options ?? CLANS) as readonly T[]
  const { navProps, slideStyle, slideMotion, grabbing } = useSlidePick(value, list, onPick)
  return (
    <nav {...navProps} aria-label="Clan" className="relative grid w-full max-w-[480px] touch-pan-y select-none gap-1 rounded-xl bg-well p-1"
      style={{ gridTemplateColumns: list.map((k) => (k === 'All' ? '.6fr' : '1fr')).join(' ') }}>
      {slideStyle && <span aria-hidden="true" className={`absolute inset-y-1 left-0 rounded-[9px] bg-white shadow-[0_1px_3px_rgba(43,33,20,.12)] ${slideMotion}`} style={slideStyle} />}
      {list.map((k) => {
        const on = k === value
        const clan = k === 'All' ? null : (k as ClanName)
        return (
          <button key={k} type="button" aria-pressed={on} disabled={!!clan && off.includes(clan)} onClick={() => onPick(k)}
            aria-label={clan && live.includes(clan) ? `${k}, at war` : clan && prep.includes(clan) ? `${k}, preparing` : undefined}
            className={`relative flex min-h-[42px] min-w-0 cursor-pointer items-center justify-center gap-1 rounded-[9px] border-0 bg-transparent px-1 text-[15px] font-bold transition-colors duration-200 disabled:cursor-default disabled:opacity-40 motion-reduce:transition-none ${on ? (grabbing ? 'cursor-grabbing' : 'cursor-grab') : 'text-muted'}`}
            style={on && clan ? { color: CLAN[clan].deep } : undefined}>
            {clan && <ClanBadge src={clans[clan]?.badge} size={20} />}
            {k}
            {clan && live.includes(clan) && <span aria-hidden="true" title="At war" className="ff-live size-1.5 flex-none rounded bg-[#16A34A]" />}
            {clan && !live.includes(clan) && prep.includes(clan) && <span aria-hidden="true" title="Preparing" className="size-1.5 flex-none rounded bg-[#B4451A]" />}
            {clan && flag.includes(clan) && <span title="A day is not 15" className="size-2 flex-none rounded-full bg-[#DC2626]" />}
          </button>
        )
      })}
    </nav>
  )
}

/** Says a row opens a player's card; phones have no hover to say it for them. */
// A row shaped as an arrow: the war log and the clan log both say direction this way.
export const POINT = {
  right: { cls: 'pl-3 pr-5', style: { clipPath: 'polygon(0 0,calc(100% - 10px) 0,100% 50%,calc(100% - 10px) 100%,0 100%)' } },
  left: { cls: 'pl-5 pr-3', style: { clipPath: 'polygon(10px 0,100% 0,100% 100%,10px 100%,0 50%)' } },
}

/** The app's one filter or sort chip. */
export const chip = (on: boolean) => `flex min-h-9 flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-bold ${on ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-2 hover:bg-hover'}`

export const RowChevron = () => (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C4B69A" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="-ml-1 flex-none md:hidden">
    <path d="M9 6l6 6-6 6" />
  </svg>
)
