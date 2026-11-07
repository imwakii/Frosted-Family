import { type LogWar, useWarLog } from '../leaders'
import type { ClanName } from '../types'
import { ClanBadge, dayWon, RowChevron } from './ui'
import { norm } from './CwlTab'

// Every finished war we hold for a clan, newest first. A row opens that war's board.

// The API's times look like 20261104T080000.000Z.
const date = (t: string | null) => {
  const m = t?.match(/^(\d{4})(\d{2})(\d{2})/)
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : ''
}

const month = (t: string | null) => {
  const m = t?.match(/^(\d{4})(\d{2})/)
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : ''
}

export const warLogHref = (clan: ClanName, key: string) => `#/war/log/${clan}/${encodeURIComponent(key)}`

export default function WarLog({ clan, q = '' }: { clan: ClanName; q?: string }) {
  const { data, loading } = useWarLog(clan)
  if (!data) return loading ? <div aria-busy="true" className="h-64 animate-pulse rounded-2xl bg-well" /> : <div className="rounded-2xl border border-line bg-white p-5 text-sm text-faint">Unavailable right now</div>
  const nq = norm(q.trim())
  const wars = nq ? data.wars.filter((w) => norm(w.opponent ?? '').includes(nq)) : data.wars
  if (nq && !wars.length) return null
  if (!wars.length) return <div className="rounded-2xl border border-line bg-white px-6 py-14 text-center text-sm font-semibold text-faint">No wars yet</div>
  // A CWL's days stay together, under its month; the wars between CWLs under their own label.
  const runs: { label: string; wars: LogWar[] }[] = []
  for (const w of wars) {
    const label = w.kind === 'cwl' ? `CWL · ${month(w.end_time)}` : 'Regular wars'
    if (runs[runs.length - 1]?.label === label) runs[runs.length - 1].wars.push(w)
    else runs.push({ label, wars: [w] })
  }
  const won = wars.filter((w) => dayWon(w) === true).length, lost = wars.filter((w) => dayWon(w) === false).length
  return (
    <section aria-label="War log" className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-hair px-3.5 py-2.5 text-[13px] font-bold tabular-nums">
        <span className="text-ink">{wars.length} {wars.length === 1 ? 'war' : 'wars'}</span>
        <span className="text-[#15803D]">{won} won</span>
        <span className="text-[#B91C1C]">{lost} lost</span>
        {wars.length - won - lost > 0 && <span className="text-muted">{wars.length - won - lost} drawn</span>}
      </div>
      {runs.map((run) => (
        <div key={run.wars[0].war_key}>
          <div className="border-b border-hair bg-[#F6EEDC] px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">{run.label}</div>
          <ol className="m-0 grid list-none lg:grid-cols-2 lg:gap-x-6 lg:px-1">
        {run.wars.map((w, i) => {
          const result = dayWon(w)
          return (
            <li key={w.war_key} className={i ? 'border-t border-hair lg:[&:nth-child(2)]:border-t-0' : ''}>
              <a href={warLogHref(clan, w.war_key)} className="flex min-h-[52px] items-center gap-2.5 px-3 py-1.5 text-ink no-underline hover:bg-hover">
                <ClanBadge src={w.opponent_badge} size={32} />
                <span className="flex min-w-0 flex-auto flex-col gap-0.5">
                  <bdi className="text-left truncate text-sm font-bold">{w.opponent}</bdi>
                  <span className="truncate text-xs font-semibold text-muted">{w.kind === 'cwl' ? `CWL day ${w.day}` : 'War'} · {date(w.end_time)}</span>
                </span>
                <span className="flex flex-none flex-col items-end gap-0.5">
                  <span className={`text-sm font-bold tabular-nums ${result === false ? 'text-[#B91C1C]' : result ? 'text-[#15803D]' : 'text-ink-2'}`}>
                    {result === null ? 'Draw' : result ? 'Won' : 'Lost'} {w.stars}–{w.opponent_stars}
                  </span>
                  <span className="text-[11px] font-semibold tabular-nums text-faint">{Math.round(w.destruction)}% v {Math.round(w.opponent_destruction)}%</span>
                </span>
                <RowChevron />
              </a>
            </li>
          )
        })}
      </ol>
        </div>
      ))}
    </section>
  )
}
