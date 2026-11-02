import { useState } from 'react'
import { react, useReactions } from '../reactions'

// A few set emojis under a moment worth reacting to. Counts show only once someone has reacted; signed-in members can
// open who it was.
export default function ReactionBar({ target, className = '' }: { target: string; className?: string }) {
  const { ready, emojis, byTarget, signedIn, refused } = useReactions()
  const [open, setOpen] = useState(false)
  if (!ready) return null
  const mine = byTarget[target] ?? {}
  const named = emojis.filter((e) => mine[e]?.names?.length)
  const all = [...new Set(named.flatMap((e) => mine[e].names!))]
  const who = all.length > 2 ? `${all.slice(0, 2).join(', ')} +${all.length - 2}` : all.join(', ')
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {emojis.map((e) => (
          <button key={e} type="button" aria-pressed={!!mine[e]?.mine} aria-label={`React ${e}${mine[e] ? `, ${mine[e].n}` : ''}`} title={signedIn ? undefined : 'Sign in with Discord to react'} onClick={() => react(target, e)}
            className={`flex min-h-8 min-w-9 cursor-pointer items-center justify-center gap-1 rounded-full border px-2 text-[13px] leading-none ${mine[e]?.mine ? 'border-gold bg-[#F7E8BC]' : 'border-line bg-white hover:bg-hover'}`}>
            <span aria-hidden="true">{e}</span>
            {mine[e] && <span className="text-xs font-bold tabular-nums text-ink-2">{mine[e].n}</span>}
          </button>
        ))}
        {who && (
          <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="min-h-8 min-w-0 cursor-pointer truncate border-0 bg-transparent px-1 text-xs font-semibold text-muted hover:text-ink">{who}</button>
        )}
      </div>
      {open && named.map((e) => (
        <span key={e} className="text-xs text-muted"><span aria-hidden="true">{e} </span>{mine[e].names!.join(', ')}</span>
      ))}
      {refused === target && <span className="text-xs font-semibold text-[#92400E]">Only members of the family's Discord can react</span>}
    </div>
  )
}
