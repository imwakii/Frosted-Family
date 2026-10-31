import { useState, type CSSProperties, type ReactNode } from 'react'
import { leagueIcon, thIcon, unitIcon } from '../clash'
import { STATUS } from '../theme'
import type { LiveWar, Status } from '../types'

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
  const box = 'inline-flex h-7 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-bold'
  const ended = war?.state === 'warEnded' && (war.endTime === null || now - war.endTime < ENDED_SHOWN)
  if (!war || (war.state === 'warEnded' && !ended)) {
    return <span className={`${box} bg-white/60 font-semibold text-[#94A3B8]`}>No war</span>
  }
  if (war.state === 'preparation') {
    return (
      <span title={`vs ${war.opponent}`} className={`${box} bg-[#FEF3C7] text-[#92400E]`}>
        Prep{war.startTime ? ` · starts ${until(war.startTime - now)}` : ''}
      </span>
    )
  }
  if (war.state === 'warEnded') {
    const won = war.stars > war.opponentStars || (war.stars === war.opponentStars && (war.destruction ?? 0) > (war.opponentDestruction ?? 0))
    const draw = war.stars === war.opponentStars && war.destruction === war.opponentDestruction
    return (
      <span title={`vs ${war.opponent}`} className={`${box} bg-white/60 font-semibold text-muted`}>
        {draw ? 'Draw' : won ? `Won ${war.stars}–${war.opponentStars}` : `Lost ${war.stars}–${war.opponentStars}`}
      </span>
    )
  }
  const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v)}%`)
  return (
    <span className="relative inline-flex max-w-full">
      <button type="button" aria-expanded={open} title={`vs ${war.opponent}`} onClick={() => setOpen((o) => !o)}
        className={`${box} cursor-pointer border-0 bg-white text-[#B91C1C] shadow-[0_1px_2px_rgba(15,23,42,.08)]`}>
        <span className="ff-live size-2 flex-none rounded bg-[#DC2626]" />
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
