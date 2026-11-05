import { type ReactNode, useLayoutEffect, useRef } from 'react'
import { Th } from './ui'

// A player's name at the head of a sheet, on one line: a name too long for the space shrinks just enough to fit.
const SMALLEST = 14

export default function FitName({ name, size, className = '' }: { name: string; size: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.style.fontSize = `${size}px`
      if (el.scrollWidth > el.clientWidth) el.style.fontSize = `${Math.max(SMALLEST, Math.floor((10 * size * el.clientWidth) / el.scrollWidth) / 10)}px`
    }
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(el)
    document.fonts?.ready.then(fit)  // The display font arrives late and is narrower than its fallback.
    return () => watch.disconnect()
  }, [name, size])
  return <span ref={ref} className={`font-display block min-w-0 truncate leading-tight ${className}`}>{name}</span>
}

/** Holds the title's place while the player is on the way. */
export const TitleHolder = () => <div aria-hidden="true" className="min-h-[52px] min-w-0 flex-auto" />

/** The one title of a player's sheets: town hall, name, then one line under it. Back sits beside Close, in Compare's place, so the title never moves. */
export function SheetTitle({ th, name, sub }: { th?: number | null; name: string; sub: ReactNode }) {
  return (
    <>
      {th !== undefined && <Th th={th} size="lg" />}
      <div className="flex min-w-0 flex-auto flex-col">
        <FitName name={name} size={26} />
        <span className="truncate text-[13px] text-faint">{sub}</span>
      </div>
    </>
  )
}
