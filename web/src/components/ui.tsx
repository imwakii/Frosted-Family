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

const Swords = ({ color }: { color: string }) => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
    <path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M9.5 17.5L21 6V3h-3L6.5 14.5M11 19l-6-6M8 16l-4 4M5 21l-2-2" />
  </svg>
)

export const Star = () => <span aria-hidden="true" className="text-gold">★</span>

export function LiveLine({ war, className = '' }: { war: LiveWar | null | undefined; className?: string }) {
  if (!war) {
    return (
      <div className={`flex min-h-[42px] items-center gap-2 rounded-[14px] border border-line bg-white px-3.5 text-[13px] ${className}`}>
        <Swords color="#CBD5E1" />
        <span className="font-semibold text-faint">No war yet</span>
      </div>
    )
  }
  const live = war.state === 'inWar'
  const label = war.state === 'preparation' ? 'Prep' : war.state === 'warEnded' ? 'Ended' : war.day ? 'Day' : 'Live'
  return (
    <div className={`flex min-h-[42px] items-center gap-2 rounded-[14px] border border-line bg-white px-3.5 text-[13px] ${className}`}>
      <Swords color={live ? '#B91C1C' : '#94A3B8'} />
      <span className={`whitespace-nowrap font-bold ${live ? 'text-[#B91C1C]' : 'text-ink-2'}`}>
        {label}{war.day ? ` ${war.day}` : ''}
      </span>
      <span className="min-w-0 flex-auto truncate text-muted">vs <bdi>{war.opponent}</bdi></span>
      <span className="font-display whitespace-nowrap text-base tabular-nums" aria-label={`${war.stars} stars to ${war.opponentStars}`}>
        <Star /> {war.stars} – {war.opponentStars} <Star />
      </span>
    </div>
  )
}
