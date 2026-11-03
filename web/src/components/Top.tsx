import { useCallback, useEffect, useRef, useState } from 'react'
import { onDrill } from '../route'
import { useYou } from './You'

// A long ranking on a phone: the top ten and your own rows, until asked for the rest. A search, or coming from a player's card, shows everyone.

const TOP = 10

export function useShowAll(resetOn: unknown) {
  const { yous } = useYou()
  const [all, setAll] = useState(false)
  // Coming from a card also changes the clan and the unit, which must not fold the list back before its row is shown.
  const drilled = useRef(0)
  useEffect(() => { if (Date.now() - drilled.current > 1000) setAll(false) }, [resetOn])
  onDrill(useCallback(() => { drilled.current = Date.now(); setAll(true) }, []))
  return { all, setAll, yous }
}

export const topRows = <T,>(rows: T[], tag: (r: T) => string, yous: string[], all: boolean) =>
  (all ? rows : rows.filter((r, i) => i < TOP || yous.includes(tag(r))))

export function ShowAll({ total, onClick, className = '' }: { total: number; onClick: () => void; className?: string }) {
  return <button type="button" onClick={onClick} className={`min-h-11 cursor-pointer rounded-2xl border border-line bg-white text-[13px] font-bold text-action hover:bg-page ${className}`}>Show all {total}</button>
}
