import { useEffect, useState } from 'react'
import { useClans } from '../clash'
import { go, playerHref } from '../route'
import { CLAN, CLANS } from '../theme'
import type { ClanName } from '../types'
import { norm, PhoneSearch, SearchBox } from './CwlTab'
import { ClanFilter, Empty, useClanPick } from './ExploreTab'
import { ClanBadge, KEY_ROW, RowChevron, Th, GoblinNote } from './ui'
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
const BAR: Record<ClanName, string> = { Fire: '#E8703A', Cake: '#1D5FB0', Flakes: '#9440BE' }
const fullDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
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

function Section({ title, note, className = '', children }: { title: string; note?: string; className?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-baseline justify-between gap-2 px-1">
        <span className="text-xs font-bold uppercase tracking-[0.06em] text-faint">{title}</span>
        {note && <span className="truncate text-xs text-faint">{note}</span>}
      </div>
      {children}
    </section>
  )
}

export default function HistoryBoard({ q, setQ, wide }: { q: string; setQ: (v: string) => void; wide: boolean }) {
  const [data, setData] = useState<History | null>(null)
  const [loading, setLoading] = useState(true)
  const [clan, setClan] = useClanPick()
  const clans = useClans()
  useEffect(() => { let live = true; load().then((d) => { if (live) { setData(d); setLoading(false) } }); return () => { live = false } }, [])

  const shownClans = clan === 'All' ? CLANS : [clan]
  const total = (y: Year) => shownClans.reduce((n, c) => n + y[c], 0)
  const peak = data ? Math.max(1, ...data.years.map(total)) : 1
  const members = (data?.longest ?? []).filter((r) => clan === 'All' || r.clan === clan)
  const nq = norm(q.trim())
  // Searching shows every match with their real place in the family, and nothing else on the page.
  const ranked = members.map((r, i) => ({ r, place: i + 1 }))
  const matches = nq ? ranked.filter(({ r }) => norm(r.name).includes(nq) || r.tag.toLowerCase().includes(nq)) : ranked
  const longest = matches
  const enter = () => { if (longest[0]) go.to(playerHref(longest[0].r.tag)) }

  const body = !data ? <Empty loading={loading} /> : (
    <div className="grid w-full items-start gap-3.5 lg:grid-cols-2 lg:items-stretch">
      {!nq && <div className="flex flex-col gap-3.5">
        <Section title="How it began">
          <ol className="m-0 flex list-none flex-col rounded-2xl border border-line bg-white p-3">
            {data.clans.map((c, i) => (
              <li key={c.clan} className="flex gap-3">
                <span className="flex flex-none flex-col items-center">
                  <ClanBadge src={clans[c.clan]?.badge} size={34} />
                  {i < data.clans.length - 1 && <span className="my-1 w-0.5 flex-auto rounded bg-line" />}
                </span>
                <span className={`flex min-w-0 flex-col ${i < data.clans.length - 1 ? 'pb-2' : ''}`}>
                  <span className="text-[15px] font-bold" style={{ color: CLAN[c.clan].deep }}>{clans[c.clan]?.name ?? `Frosted ${c.clan}`}</span>
                  <span className="text-[13px] text-muted">Founded on {fullDate(c.first)}</span>
                  <span className="text-xs text-faint">{c.players.toLocaleString('en-GB')} players since</span>
                </span>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="New faces each year" note="First time in the family">
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
      </div>}

      {/* Beside the left column, taken out of the flow so that column alone sets the height and both end level. */}
      <div className="relative min-w-0">
      <Section title="Longest in the family" note="Current members" className={nq ? '' : 'lg:absolute lg:inset-0'}>
        {/* Everyone, scrolling in place. */}
        <ol className={`m-0 max-h-[530px] min-h-0 list-none overflow-y-auto overscroll-contain rounded-2xl border border-line bg-white py-1 ${nq ? '' : 'lg:max-h-none'}`}>
          {longest.map(({ r, place }, i) => (
            <li key={r.tag}>
              <a href={playerHref(r.tag)} className={`flex min-h-[52px] items-center gap-2.5 px-3.5 py-1.5 text-ink no-underline hover:bg-hover ${i ? 'border-t border-hair' : ''}`}>
                <span className="w-5 flex-none text-right text-xs font-bold tabular-nums text-faint">{place}</span>
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
          {!longest.length && <li><GoblinNote goblin="page">No one by that name in this village</GoblinNote></li>}
        </ol>
      </Section>
      </div>
      <p className="m-0 px-1 text-xs text-faint lg:col-span-2">Dates are when Clash of Stats first saw a player, so some are approximate and some members may be missing.</p>
    </div>
  )

  return wide ? (
    <main className="mx-auto flex max-w-[1360px] flex-col gap-3.5 px-[clamp(16px,3vw,32px)] pb-12 pt-5">
      <div className="flex items-center justify-between gap-4">
        <ClanFilter clan={clan} setClan={setClan} />
        <div className="w-[clamp(220px,28vw,340px)] flex-none"><SearchBox q={q} setQ={setQ} onEnter={enter} /></div>
      </div>
      {body}
    </main>
  ) : (
    <div className="flex flex-col gap-2.5 pb-6">
      <PhoneSearch q={q} setQ={setQ} onEnter={enter}><ClanFilter clan={clan} setClan={setClan} /></PhoneSearch>
      <div className="px-4">{body}</div>
    </div>
  )
}
