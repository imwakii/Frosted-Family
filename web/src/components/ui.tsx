import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { leagueIcon, thIcon, unitIcon, useClans } from '../clash'
import { CLAN, CLANS, STATUS } from '../theme'
import type { ClanName, LiveWar, Status } from '../types'

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
      <span aria-label={label} className={`${box} flex items-center justify-center bg-[#F1F5F9] text-ink-2 tabular-nums`}>{th ?? '?'}</span>
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
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)

export const SearchIcon = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.2" strokeLinecap="round" className="pointer-events-none absolute left-[15px] top-1/2 -translate-y-1/2">
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4.5-4.5" />
  </svg>
)

export const Eyebrow = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <span className={`text-xs font-bold uppercase tracking-[0.06em] text-faint ${className}`}>{children}</span>
)

export const Star = () => <span aria-hidden="true" className="text-gold">★</span>

const ENDED_SHOWN = 24 * 3600_000

function until(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000))
  return m < 60 ? `${m}m` : `${Math.round(m / 60)}h`
}

/**
 * War status for a clan header: one fixed-height pill whatever the state, so
 * every clan's header and list start at the same height.
 */
export function WarPill({ war, now = Date.now() }: { war: LiveWar | null | undefined; now?: number }) {
  const [open, setOpen] = useState(false)
  // self-start keeps the pill compact inside the header's flex column.
  const box = 'inline-flex h-7 max-w-full items-center gap-1.5 self-start whitespace-nowrap rounded-full px-2.5 text-xs font-bold'
  const ended = war?.state === 'warEnded' && (war.endTime === null || now - war.endTime < ENDED_SHOWN)
  if (!war || (war.state === 'warEnded' && !ended)) {
    return <span className={`${box} bg-white/60 font-semibold text-[#94A3B8]`}>No war</span>
  }
  if (war.state === 'preparation') {
    return (
      <span title={`vs ${war.opponent}`} className={`${box} bg-[#FFEDD5] text-[#C2410C]`}>
        Prep{war.startTime ? ` · starts ${until(war.startTime - now)}` : ''}
      </span>
    )
  }
  if (war.state === 'warEnded') {
    const won = war.stars > war.opponentStars || (war.stars === war.opponentStars && (war.destruction ?? 0) > (war.opponentDestruction ?? 0))
    const draw = war.stars === war.opponentStars && war.destruction === war.opponentDestruction
    return (
      <span title={`vs ${war.opponent}`} className={`${box} bg-white/60 font-semibold text-muted`}>
        {draw ? 'Draw' : won ? 'Won' : 'Lost'} {war.stars}–{war.opponentStars}
      </span>
    )
  }
  const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v)}%`)
  return (
    <span className="relative inline-flex max-w-full self-start">
      <button type="button" aria-expanded={open} title={`vs ${war.opponent}`} onClick={() => setOpen((o) => !o)}
        className={`${box} cursor-pointer border-0 bg-white text-[#15803D] shadow-[0_1px_2px_rgba(15,23,42,.08)]`}>
        <span className="ff-live size-2 flex-none rounded bg-[#16A34A]" />
        {war.day ? `Day ${war.day}` : 'Live'}
        <span className="font-display text-[13px] font-normal text-ink tabular-nums"><Star /> {war.stars}–{war.opponentStars}</span>
      </button>
      {open && <span aria-hidden="true" className="fixed inset-0 z-30" onClick={() => setOpen(false)} />}
      {open && (
        <span role="dialog" aria-label="War" className="ff-fade absolute left-0 top-[calc(100%+6px)] z-40 flex w-60 flex-col gap-1.5 rounded-xl border border-line bg-white p-3 text-left text-[13px] font-semibold text-ink-2 shadow-[0_10px_30px_rgba(15,23,42,.14)]">
          <span className="truncate font-bold text-ink">vs <bdi>{war.opponent}</bdi></span>
          <span className="flex justify-between"><span className="text-faint">Stars</span><span className="tabular-nums">{war.stars} – {war.opponentStars}</span></span>
          <span className="flex justify-between"><span className="text-faint">Destruction</span><span className="tabular-nums">{pct(war.destruction)} – {pct(war.opponentDestruction)}</span></span>
          <span className="flex justify-between"><span className="text-faint">Attacks used</span><span className="tabular-nums">{war.attacks}/{war.teamSize}</span></span>
        </span>
      )}
    </span>
  )
}

// A tab's own sections, as links under the top bar; underlined, so it reads as a level below the tabs.
export function SubNav({ items, current, wide }: { items: { id: string; label: string; href: string }[]; current: string; wide: boolean }) {
  const ref = useRef<HTMLElement>(null)
  // A section past the edge is scrolled into view when it is the one open.
  useEffect(() => { ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' }) }, [current])
  return (
    <div className={wide ? 'border-b border-line bg-white' : 'px-4'}>
      {/* On phones the row is tighter, and fades at the right edge when it runs past it, so it reads as scrollable. */}
      <nav ref={ref} aria-label="Section" className={`flex overflow-x-auto [scrollbar-width:none] ${wide ? 'mx-auto max-w-[1360px] gap-5 px-[clamp(16px,3vw,32px)]' : 'gap-4 border-b border-line [mask-image:linear-gradient(to_right,black_88%,transparent)] pr-6'}`}>
        {items.map((s) => (
          <a key={s.id} href={s.href} aria-current={s.id === current ? 'page' : undefined}
            className={`-mb-px flex min-h-11 flex-none items-center whitespace-nowrap border-b-2 text-[15px] font-bold no-underline ${s.id === current ? 'border-ink text-ink' : 'border-transparent text-faint hover:text-ink'}`}>
            {s.label}
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

/** The time now in UTC, the zone every time on the site is in. */
export function UtcClock({ wide }: { wide: boolean }) {
  const now = useNow()
  const d = new Date(now)
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  return (
    <span className="whitespace-nowrap rounded-full border border-line bg-white px-2.5 py-[5px] text-xs font-bold text-muted tabular-nums md:px-3 md:py-1.5 md:text-[13px]">
      {wide && <span className="font-semibold text-faint">{day} · </span>}{time} UTC
    </span>
  )
}

// The seven CWL days, filled where the published day plan has the player in.
export function PlayDays({ days, clan, size = 15 }: { days: number[]; clan: ClanName; size?: number }) {
  return (
    <span aria-label={days.length ? `Plays day ${days.join(', ')}` : 'No days planned'} className="flex gap-[3px]">
      {[1, 2, 3, 4, 5, 6, 7].map((d) => (
        <span key={d} className="flex items-center justify-center rounded-full font-extrabold"
          style={{ width: size, height: size, fontSize: Math.round(size * 0.6), ...(days.includes(d) ? { background: CLAN[clan].accent, color: '#fff' } : { boxShadow: 'inset 0 0 0 1.5px #E2E8F0', color: '#94A3B8' }) }}>{d}</span>
      ))}
    </span>
  )
}

/** Stars out of three, for one attack or the best on a base. */
export function Stars({ n }: { n: number }) {
  return (
    <span aria-label={`${n} stars`} className="flex-none tracking-[-1px]">
      {[0, 1, 2].map((i) => <span key={i} className={i < n ? 'text-gold' : 'text-[#AEB7C4]'}>{i < n ? '★' : '☆'}</span>)}
    </span>
  )
}

/** The clan switch on every tab: same look, same place, directly under the sub-tabs. */
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
            className={`flex min-h-[42px] min-w-0 cursor-pointer items-center justify-center gap-1 rounded-[9px] border-0 px-1 text-[15px] font-bold disabled:cursor-default disabled:opacity-40 ${on ? 'bg-white shadow-[0_1px_3px_rgba(15,23,42,.12)]' : 'bg-transparent text-muted'}`}
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
export const RowChevron = () => (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B6BFCC" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="-ml-1 flex-none md:hidden">
    <path d="M9 6l6 6-6 6" />
  </svg>
)
