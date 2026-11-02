import { useEffect, useState } from 'react'
import { useClans } from '../clash'
import { playerHref } from '../route'
import { CLAN, CLANS } from '../theme'
import type { ClanName } from '../types'
import { ClanFilter, Empty, useClanPick } from './ExploreTab'
import { ClanBadge, KEY_ROW, RowChevron, Th } from './ui'
import { YouTag } from './You'

// GET /api/stats/history: the family's story from Clash of Stats. Who first appeared when, and who has been here longest.
// No clan sizes over time: one span per player per clan makes them come out above the 50 a clan can hold.

type Year = { year: string } & Record<ClanName, number>
type History = {
  read_at: string | null; players: number; in_several: number
  clans: { clan: ClanName; first: string; players: number }[]
  years: Year[]
  longest: { tag: string; name: string; clan: ClanName; th: number | null; since: string }[]
}

// Checked with the colourblind validator on white: Cake's deep blue beside these lighter Fire and Flakes.
const BAR: Record<ClanName, string> = { Fire: '#E8703A', Cake: '#1D5FB0', Flakes: '#8B7BEB' }
const fullDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const LONGEST_SHOWN = 15
// How long since a date, to the month; under a month, in days.
function tenure(since: string, now = Date.now()) {
  const from = new Date(`${since}T00:00:00Z`), to = new Date(now)
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth()
  if (to.getUTCDate() < from.getUTCDate()) months -= 1
  if (months < 1) { const d = Math.max(0, Math.floor((now - from.getTime()) / 86_400_000)); return d ? `${d}d` : 'Today' }
  const y = Math.floor(months / 12), m = months % 12
  return y ? (m ? `${y}y ${m}m` : `${y}y`) : `${m}m`
}

let cached: Promise<History | null> | null = null
const load = () => (cached ??= fetch('/api/stats/history', { headers: { Accept: 'application/json' } })
  .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null))
  .catch(() => null))

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <span className="text-xs font-bold uppercase tracking-[0.06em] text-faint">{title}</span>
        {note && <span className="truncate text-xs text-faint">{note}</span>}
      </div>
      {children}
    </section>
  )
}

export default function HistoryBoard({ wide }: { wide: boolean }) {
  const [data, setData] = useState<History | null>(null)
  const [loading, setLoading] = useState(true)
  const [clan, setClan] = useClanPick()
  const [showAll, setShowAll] = useState(false)
  const clans = useClans()
  useEffect(() => { let live = true; load().then((d) => { if (live) { setData(d); setLoading(false) } }); return () => { live = false } }, [])

  const shownClans = clan === 'All' ? CLANS : [clan]
  const total = (y: Year) => shownClans.reduce((n, c) => n + y[c], 0)
  const peak = data ? Math.max(1, ...data.years.map(total)) : 1
  const members = (data?.longest ?? []).filter((r) => clan === 'All' || r.clan === clan)
  const longest = showAll ? members : members.slice(0, LONGEST_SHOWN)

  const body = !data ? <Empty loading={loading} /> : (
    <div className="grid w-full max-w-[1100px] items-start gap-5 lg:grid-cols-2">
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col rounded-2xl border border-line bg-white p-3">
            <span className="font-display text-[26px] leading-tight tabular-nums text-ink">{data.players.toLocaleString('en-GB')}</span>
            <span className="text-xs text-muted">players through the family</span>
          </div>
          <div className="flex flex-col rounded-2xl border border-line bg-white p-3">
            <span className="font-display text-[26px] leading-tight tabular-nums text-ink">{data.in_several.toLocaleString('en-GB')}</span>
            <span className="text-xs text-muted">in more than one clan</span>
          </div>
        </div>

        <Section title="How it began">
          <ol className="m-0 flex list-none flex-col rounded-2xl border border-line bg-white p-3">
            {data.clans.map((c, i) => (
              <li key={c.clan} className="flex gap-3">
                <span className="flex flex-none flex-col items-center">
                  <ClanBadge src={clans[c.clan]?.badge} size={34} />
                  {i < data.clans.length - 1 && <span className="my-1 w-0.5 flex-auto rounded bg-line" />}
                </span>
                <span className={`flex min-w-0 flex-col ${i < data.clans.length - 1 ? 'pb-4' : ''}`}>
                  <span className="text-[15px] font-bold" style={{ color: CLAN[c.clan].deep }}>{clans[c.clan]?.name ?? `Frosted ${c.clan}`}</span>
                  <span className="text-[13px] text-muted">Founded on {fullDate(c.first)}</span>
                  <span className="text-xs text-faint">{c.players.toLocaleString('en-GB')} players since</span>
                </span>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="New faces each year" note="First seen in each clan">
          <div className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-3">
            <div aria-label="Key" className={KEY_ROW}>
              {shownClans.map((c) => <span key={c} className="flex items-center gap-1"><span className="size-2.5 rounded-sm" style={{ background: BAR[c] }} />{c}</span>)}
            </div>
            <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
              {data.years.filter((y) => total(y) > 0).map((y) => (
                <li key={y.year} title={shownClans.map((c) => `${c} ${y[c]}`).join(' · ')} className="grid grid-cols-[34px_minmax(0,1fr)_34px] items-center gap-2">
                  <span className="text-xs font-semibold tabular-nums text-muted">{y.year}</span>
                  <span className="flex h-3.5 gap-0.5" style={{ width: `${Math.max(2, (100 * total(y)) / peak)}%` }}>
                    {shownClans.filter((c) => y[c]).map((c) => (
                      <span key={c} aria-label={`${c} ${y[c]}`} className="h-full first:rounded-l last:rounded-r" style={{ flexGrow: y[c], flexBasis: 0, background: BAR[c] }} />
                    ))}
                  </span>
                  <span className="text-right text-xs font-bold tabular-nums text-ink-2">{total(y)}</span>
                </li>
              ))}
            </ol>
          </div>
        </Section>
      </div>

      <Section title="Longest in the family" note="Current members">
        <ol className="m-0 list-none rounded-2xl border border-line bg-white py-1">
          {longest.map((r, i) => (
            <li key={r.tag}>
              <a href={playerHref(r.tag)} className={`flex min-h-[52px] items-center gap-2.5 px-3.5 py-1.5 text-ink no-underline hover:bg-hover ${i ? 'border-t border-hair' : ''}`}>
                <span className="w-5 flex-none text-right text-xs font-bold tabular-nums text-faint">{i + 1}</span>
                <Th th={r.th} />
                <span className="min-w-0 flex-auto truncate text-[15px] font-semibold"><YouTag tag={r.tag} />{r.name} {clan === 'All' && <span className="text-[11px] font-bold" style={{ color: CLAN[r.clan].deep }}>{r.clan}</span>}</span>
                <span className="flex flex-none flex-col items-end">
                  <span className="text-[13px] font-extrabold tabular-nums text-ink">{tenure(r.since)}</span>
                  <span className="text-[11px] font-semibold tabular-nums text-faint">{fullDate(r.since)}</span>
                </span>
                <RowChevron />
              </a>
            </li>
          ))}
        </ol>
        {members.length > LONGEST_SHOWN && (
          <button type="button" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}
            className="min-h-11 cursor-pointer rounded-xl border border-line bg-white text-sm font-bold text-ink-2 hover:bg-page">
            {showAll ? 'Show fewer' : `Show all ${members.length}`}
          </button>
        )}
      </Section>
      <p className="m-0 px-1 text-xs text-faint lg:col-span-2">Dates are when Clash of Stats first saw a player, so some are approximate and some members may be missing.</p>
    </div>
  )

  return wide ? (
    <main className="mx-auto flex max-w-[1360px] flex-col gap-3.5 px-[clamp(16px,3vw,32px)] pb-12 pt-5">
      <ClanFilter clan={clan} setClan={setClan} />
      {body}
    </main>
  ) : (
    <div className="flex flex-col gap-2.5 px-4 pb-6 pt-1">
      <ClanFilter clan={clan} setClan={setClan} />
      {body}
    </div>
  )
}
