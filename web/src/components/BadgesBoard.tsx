import { useMemo, useState } from 'react'
import { BADGES, TIER_LOOK, TIERS, type Tier } from '../badges'
import { competitionRanks } from '../explore'
import { go, playerHref } from '../route'
import { CLAN } from '../theme'
import type { ClanName } from '../types'
import { norm, SearchBox } from './CwlTab'
import { ClanFilter, Empty, useClanPick } from './ExploreTab'
import { useBoard } from './RankBoard'
import { KEY_ROW, RowChevron, Th, chip } from './ui'
import { YouTag } from './You'

// GET /api/explore/badges. Everyone's badges as a medal table, gold first, then silver, then bronze; or who holds one
// badge, best first. Only members with a badge are listed.

type Earned = { id: string; label: string; tier: Tier; detail: string; value: number }
type Row = { tag: string; name: string; clan: ClanName; th: number | null; badges: Earned[] }

const medals = (r: Row, t: Tier) => r.badges.filter((b) => b.tier === t).length
const medalScore = (r: Row) => medals(r, 'gold') * 10_000 + medals(r, 'silver') * 100 + medals(r, 'bronze')
// A phone row holds this many, best first, and counts the rest.
const CHIPS_ON_PHONE = 6

export default function BadgesBoard({ q, setQ, wide }: { q: string; setQ: (v: string) => void; wide: boolean }) {
  const { data, loading } = useBoard('badges')
  const [clan, setClan] = useClanPick()
  const [pick, setPick] = useState<string | null>(null)
  const nq = norm(q.trim())
  const all = useMemo(() => (data?.players ?? []) as unknown as Row[], [data])

  const here = all.filter((r) => clan === 'All' || r.clan === clan)
  const rows = here
    .map((r) => {
      const held = pick ? r.badges.find((b) => b.id === pick) ?? null : null
      return { r, held, score: pick ? (held ? TIERS.indexOf(held.tier) * 1e6 + held.value : null) : (r.badges.length ? medalScore(r) : null) }
    })
    .filter((x) => x.score !== null)
    .sort((a, b) => b.score! - a.score! || a.r.name.localeCompare(b.r.name))
  const place = competitionRanks(rows, (x) => x.score)
  const shown = rows.filter(({ r }) => !nq || norm(r.name).includes(nq) || r.tag.toLowerCase().includes(nq))
  const about = pick ? BADGES[pick] : null

  const body = !data ? <Empty loading={loading} /> : (
    <>
      <div role="group" aria-label="Badge" className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] md:flex-wrap">
        <button type="button" aria-pressed={!pick} onClick={() => setPick(null)} className={chip(!pick)}>All badges</button>
        {Object.entries(BADGES).map(([id, b]) => (
          <button key={id} type="button" aria-pressed={pick === id} onClick={() => setPick(id)} className={chip(pick === id)}>
            <span aria-hidden="true">{b.icon}</span>{b.label}
          </button>
        ))}
      </div>

      {about ? (
        <div className="flex flex-col gap-1.5 rounded-2xl border border-line bg-white p-3">
          <span className="text-[13px] font-semibold text-ink-2">{about.means}</span>
          <div className="grid grid-cols-3 gap-1.5">
            {TIERS.map((t, i) => (
              <span key={t} className={`rounded-lg border px-2 py-1 text-center text-xs font-bold ${TIER_LOOK[t].chip}`}>{TIER_LOOK[t].name} · {about.ladder[i]}</span>
            ))}
          </div>
        </div>
      ) : (
        <div aria-label="Key" className={KEY_ROW}>
          {[...TIERS].reverse().map((t) => <span key={t} className="flex items-center gap-1"><span className="size-2.5 rounded-full" style={{ background: TIER_LOOK[t].dot }} />{TIER_LOOK[t].name}</span>)}
          <span>Ranked gold first</span>
        </div>
      )}

      {shown.length ? (
        <ol className="m-0 w-full list-none rounded-2xl border border-line bg-white py-1">
          {shown.map((x, i) => (
            <li key={x.r.tag}>
              <a href={playerHref(x.r.tag)} className={`flex min-h-[56px] items-center gap-2.5 px-3.5 py-1.5 text-ink no-underline hover:bg-hover ${i ? 'border-t border-hair' : ''}`}>
                <span className="w-6 flex-none text-right text-xs font-bold tabular-nums text-faint">{place.get(x) ?? '—'}</span>
                <Th th={x.r.th} />
                <span className="flex min-w-0 flex-auto flex-col gap-0.5">
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span className="truncate text-[15px] font-semibold"><YouTag tag={x.r.tag} />{x.r.name}</span>
                    {clan === 'All' && <span className="flex-none text-[11px] font-bold" style={{ color: CLAN[x.r.clan].deep }}>{x.r.clan}</span>}
                  </span>
                  {x.held ? <span className="truncate text-xs text-muted">{x.held.detail}</span> : (
                    <span aria-label={x.r.badges.map((b) => `${BADGES[b.id]?.label ?? b.label}, ${b.tier}`).join('; ')} className={`flex items-center ${wide ? 'flex-wrap gap-1' : '-space-x-1'}`}>
                      {[...x.r.badges].sort((a, b) => TIERS.indexOf(b.tier) - TIERS.indexOf(a.tier)).slice(0, wide ? undefined : CHIPS_ON_PHONE).map((b) => (
                        <span key={b.id} title={`${BADGES[b.id]?.label ?? b.label} · ${TIER_LOOK[b.tier].name}`} className={`flex size-[22px] items-center justify-center rounded-full border text-[11px] ${TIER_LOOK[b.tier].chip}`}>{BADGES[b.id]?.icon}</span>
                      ))}
                      {!wide && x.r.badges.length > CHIPS_ON_PHONE && <span className="pl-2 text-[11px] font-bold text-muted">+{x.r.badges.length - CHIPS_ON_PHONE}</span>}
                    </span>
                  )}
                </span>
                {x.held ? (
                  <span className={`flex-none rounded-full border px-2 py-0.5 text-xs font-bold ${TIER_LOOK[x.held.tier].chip}`}>{TIER_LOOK[x.held.tier].name}</span>
                ) : (
                  <span className="flex flex-none items-center gap-1.5">
                    {[...TIERS].reverse().map((t) => (
                      <span key={t} aria-label={`${medals(x.r, t)} ${t}`} className="flex w-[26px] items-center justify-end gap-0.5 text-[13px] font-extrabold tabular-nums">
                        <span className="size-2 flex-none rounded-full" style={{ background: TIER_LOOK[t].dot, opacity: medals(x.r, t) ? 1 : 0.25 }} />
                        <span className={medals(x.r, t) ? 'text-ink' : 'text-[#D5C8AC]'}>{medals(x.r, t)}</span>
                      </span>
                    ))}
                  </span>
                )}
                <RowChevron />
              </a>
            </li>
          ))}
        </ol>
      ) : <div className="rounded-2xl border border-line bg-white p-5 text-sm text-faint">{nq ? 'No one by that name holds this' : 'No one here holds this yet'}</div>}
    </>
  )

  const enter = () => { if (shown[0]) go.to(playerHref(shown[0].r.tag)) }
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
      <div className="px-4 pt-1"><ClanFilter clan={clan} setClan={setClan} /></div>
      <div className="sticky top-0 z-10 bg-page px-4 pb-2 pt-1"><SearchBox q={q} setQ={setQ} onEnter={enter} /></div>
      <div className="flex flex-col gap-2.5 px-4">{body}</div>
    </div>
  )
}
