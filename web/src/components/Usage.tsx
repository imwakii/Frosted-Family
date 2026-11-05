import { useEffect, useState } from 'react'
import { HttpError } from '../data'
import { getVisitsDaily, type VisitsDaily } from '../visits'
import { Eyebrow } from './ui'

// Plan's Usage: visitors a day, stacked by region. A region comes from the phone's time zone, so it is close rather than exact.
// Probably bots are left out of every number here except their own line.
// Colour follows the region, whichever others are there; the order is the server's.

const COLOURS: Record<string, string> = {
  'South Asia': '#2a78d6', 'South East Asia': '#eb6834', 'Middle East': '#1baf7a', 'East Asia': '#eda100',
  Europe: '#e87ba4', Americas: '#008300', Africa: '#6250d6', Oceania: '#e34948',
}
const REST = '#B8AE98'  // other Asia and elsewhere
const colour = (region: string) => COLOURS[region] ?? REST
const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const CHART = 160

export default function Usage({ onLapsed }: { onLapsed: () => void }) {
  const [data, setData] = useState<VisitsDaily | null>(null)
  const [failed, setFailed] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)
  useEffect(() => { getVisitsDaily().then(setData, (e) => { if (e instanceof HttpError && e.status === 401) onLapsed(); else setFailed(true) }) }, [onLapsed])

  if (failed) return <main className="mx-auto max-w-[900px] px-[clamp(16px,3vw,32px)] pt-5 text-sm font-semibold text-muted">Not available. Try again.</main>
  if (!data) return <div aria-busy="true" aria-label="Loading" className="mx-auto mt-10 h-64 max-w-[900px] animate-pulse rounded-2xl bg-well" />

  const top = Math.max(1, ...data.days.map((d) => d.total))
  const today = data.days[data.days.length - 1]
  const shown = data.days[picked ?? data.days.length - 1]
  const inOrder = (regions: Record<string, number>) => data.regions.map((r) => r.name).filter((n) => regions[n])
  return (
    <main className="mx-auto flex max-w-[900px] flex-col gap-3.5 px-[clamp(16px,3vw,32px)] pb-12 pt-1 md:pt-5">
      <p className="m-0 flex flex-wrap gap-x-3 text-xs font-semibold tabular-nums text-muted">
        <span>{data.total.toLocaleString('en-GB')} all time</span>
        <span>{data.week.toLocaleString('en-GB')} this week</span>
        <span>{today.total.toLocaleString('en-GB')} today</span>
      </p>

      <section aria-label="Visitors a day" className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-3">
        <Eyebrow>Visitors a day · last {data.days.length} days</Eyebrow>
        <div className="relative border-b border-line" style={{ height: CHART }}>
          <span aria-hidden="true" className="absolute inset-x-0 top-0 border-t border-hair" />
          <span aria-hidden="true" className="absolute left-0 top-0.5 text-[11px] font-semibold tabular-nums text-faint">{top}</span>
          <div className="absolute inset-0 flex items-end gap-px">
            {data.days.map((d, i) => (
              <button key={d.day} type="button" aria-label={`${dayLabel(d.day)}, ${d.total} ${d.total === 1 ? 'visitor' : 'visitors'}`} aria-pressed={i === picked}
                onClick={() => setPicked(i)} onPointerEnter={() => setPicked(i)}
                className={`flex h-full min-w-0 flex-1 cursor-pointer flex-col justify-end border-0 bg-transparent p-0 ${shown.day === d.day ? 'bg-hover' : ''}`}>
                <span className="flex w-full flex-col gap-[2px] overflow-hidden rounded-t-[4px]" style={{ height: `${(d.total / top) * 100}%` }}>
                  {inOrder(d.regions).map((n) => <span key={n} className="w-full" style={{ flexGrow: d.regions[n], flexBasis: 0, minHeight: 2, background: colour(n) }} />)}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div aria-hidden="true" className="flex justify-between text-[11px] font-semibold text-faint">
          <span>{dayLabel(data.days[0].day)}</span><span>{dayLabel(today.day)}</span>
        </div>
        <p role="status" className="m-0 min-h-10 text-[13px] text-ink-2">
          <span className="font-bold text-ink">{dayLabel(shown.day)}: {shown.total}</span>
          {inOrder(shown.regions).length > 0 && ` · ${inOrder(shown.regions).map((n) => `${n} ${shown.regions[n]}`).join(', ')}`}
        </p>
      </section>

      <section aria-label="By region" className="flex flex-col gap-1.5">
        <Eyebrow>By region · last {data.days.length} days</Eyebrow>
        <ul className="m-0 flex list-none flex-col rounded-xl border border-line bg-white p-0">
          {[...data.regions].sort((a, b) => b.total - a.total).map((r) => (
            <li key={r.name} className="flex min-h-11 items-center gap-2.5 border-b border-hair px-3 text-sm last:border-b-0">
              <span aria-hidden="true" className="size-2.5 flex-none rounded-full" style={{ background: colour(r.name) }} />
              <span className="min-w-0 flex-auto truncate font-semibold text-ink">{r.name}</span>
              <span className="flex-none font-bold tabular-nums text-ink-2">{r.total}</span>
            </li>
          ))}
        </ul>
        {!!data.bots && <span className="px-1 text-xs font-semibold text-muted">Left out: {data.bots.toLocaleString('en-GB')} probably bots</span>}
      </section>
    </main>
  )
}
