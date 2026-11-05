import { useEffect, useRef, useState } from 'react'
import { thIcon } from '../clash'
import { loadPlayerAll, type PlayerCard, playerNow } from '../data'
import { ago, type UpgradeCategory } from '../leaders'
import { markFromCard, openedFromCard, playerHref } from '../route'
import type { Roster } from '../types'
import { CardSheet } from './ClanSheet'
import { SheetTitle } from './FitName'
import { dayLabel, feedDay, KINDS } from './LogTab'
import { chip, UnitIcon, GoblinNote } from './ui'

// One player's upgrades over the last 7 or 30 days, a day at a time, of one kind if the list it opened from was filtered.
// Opens from Most upgrades, the Log's feed and Latest upgrades on their card.

const DAY = 86_400_000
type Range = 7 | 30

export default function UpgradeHistory({ tag, days: start, kind: startKind, roster, wide, onClose }: { tag: string; days: Range; kind: UpgradeCategory | null; roster: Roster; wide: boolean; onClose: () => void }) {
  const [card, setCard] = useState<PlayerCard | null>(() => playerNow(tag)?.card ?? null)
  const [failed, setFailed] = useState(false)
  const [days, setDays] = useState<Range>(start)
  const [kind, setKind] = useState<UpgradeCategory | 'all'>(startKind ?? 'all')
  const [fromCard] = useState(openedFromCard)
  // Opened on a kind further along the row, its chip starts in view, so the filter can be seen.
  const chips = useRef<HTMLDivElement>(null)
  useEffect(() => { chips.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' }) }, [!!card]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => markFromCard(false), [])
  useEffect(() => {
    let live = true
    const had = playerNow(tag)
    if (!had) loadPlayerAll(tag).then((x) => { if (live) { setCard(x.card); setFailed(!x.card) } })
    else { setCard(had.card); setFailed(!had.card) }
    return () => { live = false }
  }, [tag])
  const p = roster.players.find((x) => x.tag === tag)
  const all = card?.upgrade_history ?? card?.upgrades ?? []
  const cut = new Date(Date.now() - days * DAY).toISOString()
  const inRange = all.filter((u) => u.at >= cut)
  const ups = inRange.filter((u) => kind === 'all' || u.category === kind)
  // The kinds this player has in the range, and the one being looked at even when it has none.
  const kinds = KINDS.filter((k) => k.id === 'all' || k.id === kind || inRange.some((u) => u.category === k.id))
  const kindWord = KINDS.find((k) => k.id === kind)?.label.toLowerCase()
  const byDay = new Map<string, typeof ups>()
  ups.forEach((u) => { const d = feedDay(u.at); byDay.set(d, [...(byDay.get(d) ?? []), u]) })
  return (
    <CardSheet label={`${p?.name ?? 'Player'}'s upgrades`} wide={wide} onClose={onClose} head={<>
      <a href={playerHref(tag)} className="flex min-w-0 flex-auto items-center gap-3 text-ink no-underline">
        <SheetTitle th={p?.th} name={p?.name ?? tag} sub={card ? `${ups.length} ${ups.length === 1 ? 'upgrade' : 'upgrades'}` : ' '} />
      </a>
      {/* Holds the back button's place, so a long name is one size on every card. */}
      {!fromCard && <span aria-hidden="true" className="size-11 flex-none" />}
      {fromCard && (
        <button type="button" aria-label="Back to the player card" onClick={() => window.history.back()}
          className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-[#F6EEDC] text-muted hover:bg-well">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
      )}
    </>}>
      <div role="group" aria-label="Range" className="flex flex-none gap-1.5">
        {([7, 30] as const).map((d) => <button key={d} type="button" aria-pressed={d === days} onClick={() => setDays(d)} className={chip(d === days)}>{d} days</button>)}
      </div>
      {(
        <div ref={chips} role="group" aria-label="Kind" className={`flex flex-none gap-1.5 ${wide ? 'flex-wrap' : 'overflow-x-auto [scrollbar-width:none]'}`}>
          {kinds.map((k) => <button key={k.id} type="button" aria-pressed={k.id === kind} onClick={() => setKind(k.id)} className={`${chip(k.id === kind)} flex-none`}>{k.label}</button>)}
        </div>
      )}
      {/* The list scrolls on its own and starts again at the top for each filter, so the chips above it never move. */}
      <div key={`${days}-${kind}`} className="flex min-h-0 flex-auto flex-col gap-4 overflow-y-auto">
      {failed ? <GoblinNote box goblin="panic">Their upgrades are under a shield. Try again shortly.</GoblinNote>
        : !card ? <div aria-busy="true" aria-label="Loading" className="h-40 flex-none animate-pulse rounded-2xl bg-well" />
        : !ups.length ? <GoblinNote box goblin="coin">No upgrades{kind === 'all' ? '' : ` to ${kindWord}`} in {days} days. All builders on holiday</GoblinNote>
        : [...byDay.entries()].map(([d, rows]) => (
          <section key={d} aria-label={dayLabel(d)} className="flex flex-none flex-col gap-1.5">
            <span className="px-1 text-xs font-bold uppercase tracking-[0.06em] text-faint">{dayLabel(d)}</span>
            <ul className="m-0 list-none divide-y divide-hair rounded-2xl border border-line bg-white p-0">
              {rows.map((u) => (
                <li key={`${u.unit}-${u.to}`} className="flex min-h-[52px] items-center gap-2.5 px-3 py-1.5 text-sm">
                  {u.category === 'town_hall'
                    ? <img src={thIcon(u.to) ?? undefined} alt="" width={30} height={30} className="size-[30px] flex-none object-contain" />
                    : <UnitIcon name={u.unit} size={30} />}
                  <span className="min-w-0 flex-auto truncate font-semibold text-ink">{u.unit}</span>
                  <span className="flex-none text-[13px] font-bold tabular-nums text-ink-2">{u.from ? `${u.from} → ${u.to}` : `Unlocked ${u.to}`}</span>
                  <span className="w-14 flex-none text-right text-xs text-faint">{ago(u.at)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </CardSheet>
  )
}
