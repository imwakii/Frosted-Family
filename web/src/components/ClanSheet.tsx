import { useEffect, useRef } from 'react'
import { thIcon, useClans } from '../clash'
import { setDayPick, useCwlGroups } from '../leaders'
import { go, playerHref } from '../route'
import { CLAN, fmtScore } from '../theme'
import type { ClanName, Roster } from '../types'
import { clanFacts } from './CwlTab'
import { ClanBadge, DayRow, Eyebrow, LeaguePill, RowChevron, StatusDot, Th } from './ui'

// A clan's card, as a player has one: how strong it is, its town halls, this CWL so far and its strongest players.

const TOP_SHOWN = 5

export default function ClanSheet({ clan, roster, wide, onClose }: { clan: ClanName; roster: Roster; wide: boolean; onClose: () => void }) {
  const f = clanFacts(roster, clan, useClans()[clan])
  const c = CLAN[clan]
  const group = useCwlGroups().data?.clans.find((x) => x.clan === clan)?.group
  const place = group ? group.table.findIndex((r) => r.ours) : -1
  const players = roster.players.filter((p) => p.clan === clan)
  const ths = [...new Set(players.flatMap((p) => (p.th ? [p.th] : [])))].sort((a, b) => b - a)
  const top = players.filter((p) => p.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, TOP_SHOWN)
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
            <DayRow days={group.days} pick={null} onPick={(d) => { setDayPick(d); go.to('#/war') }} drawnOnly />
          </section>
        )}

        {top.length > 0 && (
          <section aria-label="Strongest" className="flex flex-col gap-1.5">
            <Eyebrow>Strongest</Eyebrow>
            <ol className="m-0 list-none rounded-2xl border border-line py-1">
              {top.map((p, i) => (
                <li key={p.tag}>
                  <a href={playerHref(p.tag)} className={`flex min-h-[44px] items-center gap-2.5 px-3 text-ink no-underline hover:bg-hover ${i ? 'border-t border-hair' : ''}`}>
                    <Th th={p.th} />
                    <span className="min-w-0 flex-auto truncate text-sm font-semibold">{p.name}</span>
                    <StatusDot status={p.status} />
                    <span className="w-10 flex-none text-right text-sm font-bold tabular-nums text-muted">{fmtScore(p.score)}</span>
                    <RowChevron />
                  </a>
                </li>
              ))}
            </ol>
          </section>
        )}
      </section>
    </div>
  )
}
