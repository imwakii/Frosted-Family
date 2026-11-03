import { useEffect, useState } from 'react'
import { thIcon } from '../clash'
import { loadPlayerAll, type PlayerCard, playerNow } from '../data'
import { ago } from '../leaders'
import { openedFromCard, playerHref } from '../route'
import type { Roster } from '../types'
import { CardSheet } from './ClanSheet'
import { dayLabel, feedDay } from './LogTab'
import { chip, Th, UnitIcon } from './ui'

// One player's upgrades over the last 7 or 30 days, a day at a time. Opens from Most upgrades and from Latest upgrades on their card.

const DAY = 86_400_000
type Range = 7 | 30

export default function UpgradeHistory({ tag, days: start, roster, wide, onClose }: { tag: string; days: Range; roster: Roster; wide: boolean; onClose: () => void }) {
  const [card, setCard] = useState<PlayerCard | null>(() => playerNow(tag)?.card ?? null)
  const [days, setDays] = useState<Range>(start)
  const [fromCard] = useState(openedFromCard)
  useEffect(() => {
    let live = true
    if (!playerNow(tag)) loadPlayerAll(tag).then((x) => { if (live) setCard(x.card) })
    else setCard(playerNow(tag)?.card ?? null)
    return () => { live = false }
  }, [tag])
  const p = roster.players.find((x) => x.tag === tag)
  const all = card?.upgrade_history ?? card?.upgrades ?? []
  const cut = new Date(Date.now() - days * DAY).toISOString()
  const ups = all.filter((u) => u.at >= cut)
  const byDay = new Map<string, typeof ups>()
  ups.forEach((u) => { const d = feedDay(u.at); byDay.set(d, [...(byDay.get(d) ?? []), u]) })
  return (
    <CardSheet label={`${p?.name ?? 'Player'}'s upgrades`} wide={wide} onClose={onClose} head={<>
      {fromCard && (
        <button type="button" aria-label="Back to the player card" onClick={() => window.history.back()}
          className="-ml-1 flex size-11 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-[#F6EEDC] text-muted hover:bg-well">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
      )}
      <a href={playerHref(tag)} className="flex min-w-0 flex-auto items-center gap-2.5 text-ink no-underline">
        {p && <Th th={p.th} />}
        <span className="flex min-w-0 flex-col">
          <span className="font-display truncate text-[22px] leading-tight">{p?.name ?? tag}</span>
          <span className="text-xs text-muted">{card ? `${ups.length} ${ups.length === 1 ? 'upgrade' : 'upgrades'}` : ' '}</span>
        </span>
      </a>
    </>}>
      <div role="group" aria-label="Range" className="flex flex-none gap-1.5">
        {([7, 30] as const).map((d) => <button key={d} type="button" aria-pressed={d === days} onClick={() => setDays(d)} className={chip(d === days)}>{d} days</button>)}
      </div>
      {!card ? <div aria-busy="true" aria-label="Loading" className="h-40 flex-none animate-pulse rounded-2xl bg-well" />
        : !ups.length ? <p className="m-0 rounded-2xl border border-line bg-white p-5 text-sm text-faint">No upgrades in the last {days} days</p>
        : [...byDay.entries()].map(([d, rows]) => (
          <section key={d} aria-label={dayLabel(d)} className="flex flex-none flex-col gap-1.5">
            <span className="px-1 text-xs font-bold uppercase tracking-[0.06em] text-faint">{dayLabel(d)}</span>
            <ul className="m-0 list-none divide-y divide-hair rounded-2xl border border-line bg-white p-0">
              {rows.map((u) => (
                <li key={`${u.unit}-${u.to}`} className="flex min-h-12 items-center gap-2.5 px-3 py-1.5 text-sm">
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
    </CardSheet>
  )
}
