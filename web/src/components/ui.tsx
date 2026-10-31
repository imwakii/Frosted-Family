import type { ReactNode } from 'react'
import { STATUS } from '../theme'
import type { LiveWar, Status } from '../types'

export function Th({ th, size = 'sm' }: { th: number | null; size?: 'sm' | 'lg' }) {
  const box = size === 'lg' ? 'size-[46px] rounded-[14px] text-[17px] font-extrabold' : 'size-[26px] rounded-lg text-xs font-bold'
  return (
    <span aria-label={th ? `Town hall ${th}` : 'Town hall unknown'} className={`${box} flex flex-none items-center justify-center bg-[#F1F5F9] text-ink-2 tabular-nums`}>
      {th ?? '?'}
    </span>
  )
}

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

export function LiveLine({ war, className = '' }: { war: LiveWar | null | undefined; className?: string }) {
  if (!war) {
    return (
      <div className={`flex min-h-[40px] items-center gap-2 rounded-[14px] border border-line bg-white px-3.5 text-[13px] ${className}`}>
        <span className="size-2 flex-none rounded bg-[#CBD5E1]" />
        <span className="font-semibold text-faint">No war yet</span>
      </div>
    )
  }
  const live = war.state === 'inWar'
  const label = war.state === 'preparation' ? 'Prep' : war.state === 'warEnded' ? 'Ended' : 'Day'
  return (
    <div className={`flex min-h-[40px] items-center gap-2 rounded-[14px] border border-line bg-white px-3.5 text-[13px] ${className}`}>
      <span className={`size-2 flex-none rounded ${live ? 'ff-live bg-[#DC2626]' : 'bg-[#94A3B8]'}`} />
      <span className={`whitespace-nowrap font-bold ${live ? 'text-[#B91C1C]' : 'text-ink-2'}`}>
        {label}{war.day ? ` ${war.day}` : ''}
      </span>
      <span className="min-w-0 flex-auto truncate text-muted">vs {war.opponent}</span>
      <span className="whitespace-nowrap text-[15px] font-extrabold tabular-nums">{war.stars}–{war.opponentStars}</span>
      <span className="whitespace-nowrap tabular-nums text-faint">{war.attacks}/{war.teamSize}</span>
    </div>
  )
}
