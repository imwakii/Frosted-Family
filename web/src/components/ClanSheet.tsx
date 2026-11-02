import { useEffect, useMemo, useRef } from 'react'
import { thIcon, useClans } from '../clash'
import { useWarBoard } from '../explore'
import { setDayPick, setWarClan, useCwlGroups } from '../leaders'
import { go } from '../route'
import { CLAN } from '../theme'
import type { ClanName, Roster } from '../types'
import { clanFacts } from './CwlTab'
import { ClanBadge, DayRow, Eyebrow, LeaguePill } from './ui'

// A clan's card, as a player has one: its size and place, how strong it is at war, its town halls and this CWL so far.

const num = (v: number | null, digits = 0) => (v === null ? '—' : v.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits }))
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v)}%`)
const per = (a: number, b: number) => (b ? a / b : null)

export default function ClanSheet({ clan, roster, wide, onClose }: { clan: ClanName; roster: Roster; wide: boolean; onClose: () => void }) {
  const f = clanFacts(roster, clan, useClans()[clan])
  const c = CLAN[clan]
  const group = useCwlGroups().data?.clans.find((x) => x.clan === clan)?.group
  const place = group ? group.table.findIndex((r) => r.ours) : -1
  const players = roster.players.filter((p) => p.clan === clan)
  const ths = [...new Set(players.flatMap((p) => (p.th ? [p.th] : [])))].sort((a, b) => b - a)
  const record = useWarBoard('all').data
  // Every current member's war history added up, so a rate weighs each attack alike rather than each player.
  const strength = useMemo(() => {
    const tags = new Set(players.map((p) => p.tag))
    const rows = record?.players.filter((r) => tags.has(r.tag)) ?? []
    const sum = (v: (r: (typeof rows)[number]) => number | null | undefined) => rows.reduce((n, r) => n + (v(r) ?? 0), 0)
    const attacks = sum((r) => r.war?.attacks), defenses = sum((r) => r.war?.defense?.defenses)
    const known = rows.filter((r) => r.war_stars != null).length
    return {
      warStars: per(sum((r) => r.war_stars), known),
      threeStar: per(100 * sum((r) => r.war?.three_stars), attacks),
      stars: per(sum((r) => r.war?.stars), attacks),
      missed: per(100 * sum((r) => r.war?.missed), attacks + sum((r) => r.war?.missed)),
      conceded: per(sum((r) => r.war?.defense?.stars_conceded), defenses),
      threeStarred: per(100 * sum((r) => r.war?.defense?.three_stars_conceded), defenses),
    }
  }, [record, players])
  const top15 = place >= 0 ? group?.table[place].strength : null
  const close = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    close.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.() }
  }, [onClose])

  const facts = [
    { label: f.inCwl ? 'Core avg' : 'Top 15 avg', value: f.avg },
    { label: 'Members', value: String(players.length) },
    ...(place >= 0 && group ? [{ label: 'Group', value: `${place + 1} of ${group.table.length}` }, { label: 'Stars', value: String(group.table[place].stars) }] : []),
  ]

  return (
    <div className="fixed inset-0 z-40">
      <div className="ff-fade absolute inset-0 bg-[rgba(43,33,20,.35)]" onClick={onClose} aria-hidden="true" />
      <section role="dialog" aria-modal="true" aria-label={f.name}
        className={wide
          ? 'ff-sheet absolute left-1/2 top-1/2 flex max-h-[min(720px,90vh)] w-[min(440px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-auto rounded-[22px] bg-white p-6 shadow-[0_20px_50px_rgba(43,33,20,.25)]'
          : 'ff-sheet absolute inset-x-0 bottom-0 flex max-h-[calc(100dvh-64px)] flex-col gap-4 overflow-auto rounded-t-[22px] bg-white px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-8px_30px_rgba(43,33,20,.18)]'}>
        {!wide && <span aria-hidden="true" className="h-[5px] w-10 flex-none self-center rounded-[3px] bg-[#D5C8AC]" />}
        <div className="flex items-center gap-3">
          <ClanBadge src={f.badge} size={60} />
          <div className="flex min-w-0 flex-auto flex-col gap-1">
            <span className="font-display truncate text-[26px] leading-tight" style={{ color: c.deep }}>{f.name}</span>
            <LeaguePill league={f.league} text={f.format.replace('League ', '')} />
          </div>
          <button ref={close} type="button" aria-label="Close" onClick={onClose}
            className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-[#F6EEDC] text-muted hover:bg-well">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <dl className={`m-0 grid gap-2 ${facts.length > 2 ? 'grid-cols-4' : 'grid-cols-2'}`}>
          {facts.map((x) => (
            <div key={x.label} className="flex flex-col items-center gap-0.5 rounded-xl px-1 py-2" style={{ background: c.tint }}>
              <dd className="font-display m-0 whitespace-nowrap text-[19px] leading-none" style={{ color: c.deep }}>{x.value}</dd>
              <dt className="whitespace-nowrap text-[11px] font-semibold text-muted">{x.label}</dt>
            </div>
          ))}
        </dl>

        <section aria-label="Strength" className="flex flex-col gap-1.5">
          <Eyebrow>Strength</Eyebrow>
          <dl className="m-0 grid grid-cols-6 gap-2">
            {[
              { label: 'Avg war stars', value: num(strength.warStars) },
              { label: '3-star rate', value: pct(strength.threeStar) },
              { label: 'Stars per attack', value: num(strength.stars, 2) },
              { label: 'Attacks missed', value: pct(strength.missed) },
              { label: 'Stars given up', value: num(strength.conceded, 2) },
              { label: 'Bases 3-starred', value: pct(strength.threeStarred) },
              ...(top15 ? [
                { label: 'Heroes, top 15', value: num(top15.heroes), wide: true },
                { label: 'Gear, top 15', value: num(top15.equipment), wide: true },
              ] : []),
            ].map((x) => (
              <div key={x.label} className={`flex flex-col items-center gap-0.5 rounded-xl bg-[#F6EEDC] px-1 py-2 ${'wide' in x ? 'col-span-3' : 'col-span-2'}`}>
                <dd className="m-0 whitespace-nowrap text-[17px] font-bold leading-none tabular-nums text-ink">{x.value}</dd>
                <dt className="whitespace-nowrap text-[11px] font-semibold text-muted">{x.label}</dt>
              </div>
            ))}
          </dl>
        </section>

        <section aria-label="Town halls" className="flex flex-col gap-1.5">
          <Eyebrow>Town halls</Eyebrow>
          <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1.5 p-0">
            {ths.map((th) => (
              <li key={th} className="flex items-center gap-1 text-sm font-bold tabular-nums text-ink">
                {thIcon(th) ? <img src={thIcon(th)!} alt={`Town hall ${th}`} width={28} height={28} className="size-7 object-contain" /> : <span className="text-xs text-faint">TH{th}</span>}
                {players.filter((p) => p.th === th).length}
              </li>
            ))}
          </ul>
        </section>

        {group && group.days.length > 0 && (
          <section aria-label="This CWL" className="flex flex-col gap-1.5">
            <Eyebrow>This CWL</Eyebrow>
            <DayRow days={group.days} pick={null} onPick={(d) => { setWarClan(clan); setDayPick(d); go.to('#/war') }} drawnOnly />
          </section>
        )}

      </section>
    </div>
  )
}
