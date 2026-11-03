import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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
      {/* A soft gold pill marks the open section, so this row reads apart from the clan switch and chips below it. Its padding closes up so Stats' five fit from 360px wide. */}
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
export function Clock({ wide }: { wide: boolean }) {
  const now = useNow()
  const [utc, setUtc] = useState(() => { try { return localStorage.getItem('ff-clock') === 'utc' } catch { return false } })
  const flip = () => {
    setUtc(!utc)
    try { localStorage.setItem('ff-clock', utc ? 'local' : 'utc') } catch { /* private mode */ }
  }
  const d = new Date(now)
  const timeZone = utc ? 'UTC' : undefined
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone })
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone })
  const zone = utc ? 'UTC' : new Intl.DateTimeFormat('en-GB', { timeZoneName: 'short' }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value
  return (
    <button type="button" onClick={flip} aria-label={`${time} ${zone}. Switch to ${utc ? 'your time' : 'UTC'}`}
      className="h-9 flex-none cursor-pointer whitespace-nowrap rounded-full border border-line bg-white px-2 text-xs font-bold text-muted tabular-nums hover:bg-page md:px-3 md:text-[13px]">
      {wide && <span className="font-semibold text-faint max-lg:hidden">{day} · </span>}{time}{(utc || wide) && ` ${zone}`}
    </button>
  )
}

// The seven CWL days, filled where the published day plan has the player in.
export function PlayDays({ days, clan, size = 15 }: { days: number[]; clan: ClanName; size?: number }) {
  return (
    <span aria-label={days.length ? `Plays day ${days.join(', ')}` : 'No days planned'} className="flex gap-[3px]">
      {[1, 2, 3, 4, 5, 6, 7].map((d) => (
        <span key={d} className="flex items-center justify-center rounded-full font-extrabold"
          style={{ width: size, height: size, fontSize: Math.round(size * 0.6), ...(days.includes(d) ? { background: CLAN[clan].accent, color: '#FFFBF1' } : { boxShadow: 'inset 0 0 0 1.5px #E3D8BF', color: '#A3957C' }) }}>{d}</span>
      ))}
    </span>
  )
}

/** Stars out of three, for one attack or the best on a base. */
export function Stars({ n }: { n: number }) {
  return (
    <span aria-label={`${n} stars`} className="flex-none tracking-[-1px]">
      {[0, 1, 2].map((i) => <span key={i} className={i < n ? 'text-gold' : 'text-[#C9BCA0]'}>{i < n ? '★' : '☆'}</span>)}
    </span>
  )
}

type DayFacts = { day: number; state: string; stars: number; opponent_stars: number; destruction: number; opponent_destruction: number }

export const dayWon = (d: DayFacts) => (d.stars !== d.opponent_stars ? d.stars > d.opponent_stars : d.destruction !== d.opponent_destruction ? d.destruction > d.opponent_destruction : null)

/** The seven CWL days, the same row on War and Lineups: each day's result once it has one. */
export function DayRow({ days = [], pick, onPick, live = 0, roster, drawnOnly }: {
  days?: DayFacts[]; pick: number | 'all' | null; onPick: (d: number | 'all') => void; live?: number; roster?: boolean; drawnOnly?: boolean
}) {
  const cell = 'relative flex min-h-[46px] min-w-0 cursor-pointer flex-col items-center justify-center rounded-[9px] border-0 tabular-nums disabled:cursor-default disabled:opacity-40'
  const ring = 'shadow-[inset_0_0_0_2px_var(--color-ink)]'
  return (
    <nav aria-label="CWL day" className={`grid w-full max-w-[480px] gap-1 rounded-xl bg-well p-1 ${roster ? 'grid-cols-[1.7fr_repeat(7,1fr)]' : 'grid-cols-7'}`}>
      {roster && (
        <button type="button" aria-pressed={pick === 'all'} onClick={() => onPick('all')}
          className={`${cell} text-[13px] font-bold ${pick === 'all' ? `bg-white text-ink ${ring}` : 'bg-transparent text-muted'}`}>Roster</button>
      )}
      {[1, 2, 3, 4, 5, 6, 7].map((n) => {
        const d = days.find((x) => x.day === n)
        const over = d?.state === 'warEnded', fighting = d?.state === 'inWar' || (!d && n === live)
        const won = d && over ? dayWon(d) : null
        const background = over ? (won === true ? '#DCEFD5' : won === false ? '#F8D5CF' : '#EFE6D2') : pick === n || fighting ? '#FFFBF1' : 'transparent'
        return (
          <button key={n} type="button" aria-pressed={pick === n} aria-label={`Day ${n}`} disabled={drawnOnly && !d} onClick={() => onPick(n)}
            className={`${cell} ${pick === n ? ring : ''}`} style={{ background }}>
            <span className={`text-sm font-bold leading-tight ${pick === n ? 'text-ink' : 'text-muted'}`}>{n}</span>
            {d && (over || fighting) && <span className={`text-[10px] font-bold leading-tight ${fighting ? 'text-[#15803D]' : 'text-ink-2'}`}>{d.stars}–{d.opponent_stars}</span>}
            {d?.state === 'preparation' && <span className="text-[10px] font-bold leading-tight text-[#B4451A]">Prep</span>}
            {fighting && <span className="ff-live absolute right-1 top-1 size-1.5 rounded bg-[#16A34A]" />}
          </button>
        )
      })}
    </nav>
  )
}

/** The clan switch on every tab: same look, same place, directly under the sub-tabs. */
/** A phone page's clan switch follows the scroll, in the place it would sit anyway. */
export const STICKY_SWITCH = 'sticky top-0 z-10 -mx-4 -mb-1 -mt-1 bg-page px-4 pb-1 pt-1'

export function ClanSwitch<T extends ClanName | 'All'>({ value, onPick, options, live = [], flag = [], off = [] }: {
  value: T; onPick: (c: T) => void; options?: readonly T[]; live?: ClanName[]; flag?: ClanName[]; off?: ClanName[]
}) {
  const clans = useClans()
  const list = (options ?? CLANS) as readonly T[]
  return (
    <nav aria-label="Clan" className="grid w-full max-w-[480px] gap-1 rounded-xl bg-well p-1"
      style={{ gridTemplateColumns: list.map((k) => (k === 'All' ? '.6fr' : '1fr')).join(' ') }}>
      {list.map((k) => {
        const on = k === value
        const clan = k === 'All' ? null : (k as ClanName)
        return (
          <button key={k} type="button" aria-pressed={on} disabled={!!clan && off.includes(clan)} onClick={() => onPick(k)}
            className={`flex min-h-[42px] min-w-0 cursor-pointer items-center justify-center gap-1 rounded-[9px] border-0 px-1 text-[15px] font-bold disabled:cursor-default disabled:opacity-40 ${on ? 'bg-white shadow-[0_1px_3px_rgba(43,33,20,.12)]' : 'bg-transparent text-muted'}`}
            style={on && clan ? { color: CLAN[clan].deep } : undefined}>
            {clan && <ClanBadge src={clans[clan]?.badge} size={20} />}
            {k}
            {clan && live.includes(clan) && <span className="ff-live size-1.5 flex-none rounded bg-[#16A34A]" />}
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
