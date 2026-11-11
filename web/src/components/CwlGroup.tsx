import Info from './Info'
import { useMemo, useState } from 'react'
import { useClans, thIcon } from '../clash'
import { type CwlRow, setWarClan, useCwlGroups, useWarDots, useWarBoard, useWarClan, warClanOr } from '../leaders'
import { clanHref, playerHref, rivalHref } from '../route'
import { CLAN, CLANS } from '../theme'
import type { ClanName } from '../types'
import { familyHits, FamilyHits, norm, PhoneSearch, readClan, WideHeader } from './CwlTab'
import type { Roster } from '../types'
import { chip, ClanBadge, ClanSwitch, dayWon, LeaguePill, RowChevron, useNow } from './ui'

// A clan's league group, ranked as the game ranks it, three ways: who is winning, with each clan's days; signed-up town
// halls; strength. Each member's stars are in Current's Recap, and each day's war is on Current.

const COLS = 'grid-cols-[14px_minmax(0,1fr)_repeat(5,30px)] md:grid-cols-[18px_minmax(0,1fr)_repeat(5,44px)]'
const POWER_COLS = 'grid-cols-[14px_minmax(0,1fr)_repeat(3,58px)] md:grid-cols-[18px_minmax(0,1fr)_repeat(3,76px)]'
const STANDING_COLS = 'grid-cols-[14px_minmax(0,1fr)_34px_30px_58px] md:grid-cols-[18px_minmax(0,1fr)_repeat(7,38px)_52px_44px_72px]'
// While a day is being fought, a column for the attacks each clan has left sits beside the stars.
const LIVE_COLS = 'grid-cols-[14px_minmax(0,1fr)_34px_30px_28px_58px] md:grid-cols-[18px_minmax(0,1fr)_repeat(7,38px)_52px_44px_44px_72px]'
const DAYS = [1, 2, 3, 4, 5, 6, 7]
const POWER = [{ k: 'war_stars', label: 'War stars' }, { k: 'heroes', label: 'Heroes' }, { k: 'equipment', label: 'Equipment' }] as const

function ClanLink({ r, clan }: { r: CwlRow; clan: ClanName }) {
  return (
    <a href={r.ours ? clanHref(clan) : rivalHref(clan, r.tag)} className="group flex min-h-11 min-w-0 items-center gap-1.5 no-underline">
      <span className="flex size-[22px] flex-none items-center justify-center"><ClanBadge src={r.badge} size={22} /></span>
      {r.ours
        ? <span className="min-w-0 truncate text-[13px] font-bold group-hover:underline md:text-[15px]" style={{ color: CLAN[clan].deep }}>{clan}</span>
        : <bdi className="text-left min-w-0 truncate text-[13px] font-semibold text-ink-2 group-hover:underline md:text-[15px]">{r.name}</bdi>}
      <span className="flex flex-none"><RowChevron /></span>
    </a>
  )
}

// In Standings a clan's name opens its days in place: a result table wants a breakdown, not the clan's page.
function ClanToggle({ r, clan, open, onToggle }: { r: CwlRow; clan: ClanName; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" aria-expanded={open} onClick={onToggle} className="group flex min-h-11 min-w-0 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-left">
      <span className="flex size-[22px] flex-none items-center justify-center"><ClanBadge src={r.badge} size={22} /></span>
      {r.ours
        ? <span className="min-w-0 truncate text-[13px] font-bold md:text-[15px]" style={{ color: CLAN[clan].deep }}>{clan}</span>
        : <bdi className="text-left min-w-0 truncate text-[13px] font-semibold text-ink-2 md:text-[15px]">{r.name}</bdi>}
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
        className={`flex-none text-faint transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
    </button>
  )
}

// One clan's league so far, day by day, with the way to its page.
function ClanDays({ r, clan }: { r: CwlRow; clan: ClanName }) {
  const days = (r.wars ?? []).filter((w) => w.state !== 'preparation').sort((a, b) => a.day - b.day)
  return (
    <div className="border-t border-hair px-2.5 pb-1 pt-1 md:px-3.5">
      {days.length === 0 && <div className="py-3 text-center text-xs font-semibold text-faint">No wars yet</div>}
      <ol className="m-0 list-none">
        {days.map((w) => {
          const won = w.state === 'warEnded' ? dayWon(w) : null
          return (
            <li key={w.day} className="grid min-h-9 grid-cols-[44px_minmax(0,1fr)_52px_44px] items-center gap-x-2 text-[13px]">
              <span className="text-xs font-bold text-faint">Day {w.day}</span>
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="flex size-4 flex-none items-center justify-center"><ClanBadge src={w.opponent_badge} size={16} /></span>
                <bdi className="min-w-0 truncate font-semibold text-ink-2">{w.opponent ?? '—'}</bdi>
              </span>
              <span className={`text-right font-bold tabular-nums ${won === true ? 'text-[#15803D]' : won === false ? 'text-[#B91C1C]' : 'text-ink-2'}`}>{w.stars}–{w.opponent_stars}</span>
              <span className="text-right text-xs font-semibold tabular-nums text-muted">{Math.round(w.destruction)}%</span>
            </li>
          )
        })}
      </ol>
      <a href={r.ours ? clanHref(clan) : rivalHref(clan, r.tag)} className="flex min-h-10 items-center justify-end gap-0.5 text-[13px] font-bold text-action no-underline">Clan stats<RowChevron /></a>
    </div>
  )
}

// Before the first war ends every row reads zero, so the table says when it starts.
function useStartsIn(clan: ClanName) {
  const now = useNow(30_000)
  const war = useWarBoard().data?.clans.find((c) => c.clan === clan)?.war
  const m = war?.state === 'preparation' && war.day === 1 ? war.start_time?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/) : null
  if (!m) return null
  const mins = Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - now) / 60000)
  if (mins <= 0) return null
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function Standings({ rows, clan }: { rows: CwlRow[]; clan: ClanName }) {
  const { tint } = CLAN[clan]
  const league = useClans()[clan]?.league
  const head = 'text-center text-[10px] font-bold leading-tight text-muted md:text-xs'
  const live = rows.some((r) => r.left != null)
  const cols = live ? LIVE_COLS : STANDING_COLS
  const [open, setOpen] = useState<string | null>(null)
  return (
    <section aria-label="Standings" className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className={`grid h-11 items-center gap-x-1 border-b border-hair px-2.5 md:gap-x-1.5 md:px-3.5 ${cols}`}>
        <span className="col-span-2 min-w-0 whitespace-nowrap">{league ? <LeaguePill league={league} text={league.replace('League ', '')} /> : null}</span>
        {DAYS.map((d) => <span key={d} className={`${head} max-md:hidden`}>Day {d}</span>)}
        <span className={head}>Won</span>
        <span className="text-center text-gold" aria-label="Stars">★</span>
        {live && <span className={head}>Left</span>}
        <span className={head}>Destruction</span>
      </div>
      <ol className="m-0 list-none">
        {rows.map((r, n) => (
          <li key={r.tag} className={n ? 'border-t border-hair' : ''} style={r.ours ? { background: tint } : undefined}>
          <div className={`grid h-[52px] items-center gap-x-1 px-2.5 md:gap-x-1.5 md:px-3.5 ${cols}`}>
            <span className="text-right text-xs font-bold tabular-nums text-faint">{n + 1}</span>
            <ClanToggle r={r} clan={clan} open={open === r.tag} onToggle={() => setOpen(open === r.tag ? null : r.tag)} />
            {DAYS.map((d) => {
              const w = r.wars?.find((x) => x.day === d && x.state !== 'preparation')
              const result = w?.state === 'warEnded' ? dayWon(w) : null
              return (
                <span key={d} aria-label={w ? `Day ${d}: ${w.stars} stars` : `Day ${d}: not played`}
                  className={`flex h-8 items-center justify-center rounded-md text-xs font-bold tabular-nums max-md:hidden ${w ? (result === false ? 'bg-[#FEE2E2] text-[#991B1B]' : result ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#F6EEDC] text-ink-2') : 'text-[#C9BCA0]'}`}>
                  {w ? w.stars : '·'}
                </span>
              )
            })}
            <span className="text-center text-[13px] font-bold tabular-nums text-ink-2">{r.won}–{r.lost}</span>
            <span className="font-display text-center text-[17px] tabular-nums text-ink">{r.stars}</span>
            {live && <span aria-label={r.left == null ? 'No war on' : `${r.left} attacks left`} className={`text-center text-[13px] font-bold tabular-nums ${r.left ? 'text-ink-2' : 'text-[#C9BCA0]'}`}>{r.left == null ? '·' : r.left}</span>}
            <span className="text-center text-xs font-semibold tabular-nums text-muted">{Math.round(r.destruction).toLocaleString('en-GB')}%</span>
          </div>
          {open === r.tag && <ClanDays r={r} clan={clan} />}
          </li>
        ))}
      </ol>
    </section>
  )
}

function GroupTable({ rows, clan, compare }: { rows: CwlRow[]; clan: ClanName; compare: boolean }) {
  const { tint } = CLAN[clan]
  const top = Math.max(...rows.flatMap((r) => r.town_halls), 0)
  // The four highest town halls in the group, then everything under them.
  const heads = [top, top - 1, top - 2, top - 3, top - 4]
  const count = (r: CwlRow, i: number) => r.town_halls.filter((t) => (i < 4 ? t === heads[i] : t <= heads[4])).length
  const most = Math.max(...rows.flatMap((r) => heads.map((_, i) => count(r, i))), 1)
  const ours = rows.find((r) => r.ours)?.strength
  const cols = compare ? POWER_COLS : COLS
  return (
    <section aria-label="Group table" className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className={`grid h-11 items-center gap-x-1 border-b border-hair px-2.5 md:gap-x-1.5 md:px-3.5 ${cols}`}>
        <span />
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-faint">{compare ? 'Top 15 avg' : 'Signed up'}</span>
        {compare ? POWER.map((p) => <span key={p.k} className="text-center text-[10px] font-bold leading-tight text-muted md:text-xs">{p.label}</span>) : heads.map((h, i) => (
          <span key={h} className="flex flex-col items-center">
            {i < 4 && thIcon(h)
              ? <img src={thIcon(h)!} alt={`Town hall ${h}`} width={24} height={24} className="size-6 object-contain" />
              : <span className="text-[11px] font-bold text-faint">{i < 4 ? h : `≤${h}`}</span>}
          </span>
        ))}
      </div>
      <ol className="m-0 list-none">
        {rows.map((r, n) => (
          <li key={r.tag} className={`grid h-[52px] items-center gap-x-1 px-2.5 md:gap-x-1.5 md:px-3.5 ${cols} ${n ? 'border-t border-hair' : ''}`} style={r.ours ? { background: tint } : undefined}>
            <span className="text-right text-xs font-bold tabular-nums text-faint">{n + 1}</span>
            <ClanLink r={r} clan={clan} />
            {compare ? POWER.map((p) => {
              const v = r.strength?.[p.k]
              const gap = v != null && ours && !r.ours ? Math.round(v - ours[p.k]) : null
              return (
                <span key={p.k} className="flex flex-col items-center leading-none">
                  <span className="text-[13px] font-bold tabular-nums text-ink">{v == null ? '·' : Math.round(v).toLocaleString('en-GB')}</span>
                  {gap !== null && gap !== 0 && <span className={`mt-0.5 text-[10px] font-bold tabular-nums ${gap > 0 ? 'text-[#B91C1C]' : 'text-[#15803D]'}`}>{gap > 0 ? '+' : '−'}{Math.abs(gap).toLocaleString('en-GB')}</span>}
                </span>
              )
            }) : heads.map((h, i) => {
              const c = count(r, i)
              return (
                <span key={h} aria-label={`${c} at ${i < 4 ? `town hall ${h}` : `town hall ${h} or under`}`}
                  className={`flex h-8 items-center justify-center rounded-md text-xs font-bold tabular-nums ${c ? 'text-ink' : 'text-[#C9BCA0]'}`}
                  style={c ? { background: `color-mix(in srgb, var(--color-gold) ${6 + Math.round((c / most) * 44)}%, transparent)` } : undefined}>
                  {c || '·'}
                </span>
              )
            })}
          </li>
        ))}
      </ol>
    </section>
  )
}

const VIEWS = [{ id: 'standings', label: 'Standings' }, { id: 'halls', label: 'Town halls' }, { id: 'strength', label: 'Strength' }] as const

function Board({ rows, clan }: { rows: CwlRow[]; clan: ClanName }) {
  const [view, setView] = useState<(typeof VIEWS)[number]['id']>('standings')
  const canCompare = rows.some((r) => r.ours && r.strength) && rows.some((r) => !r.ours && r.strength)
  const shown = view === 'strength' && !canCompare ? 'standings' : view
  const startsIn = useStartsIn(clan)
  // The rows sit in the same place in all three views: one header height, one row height, and this line in each.
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {startsIn && rows.every((r) => !r.stars) && <div className="rounded-xl bg-[#FFEDD5] px-3 py-1 text-center text-xs font-bold text-[#B4451A]">Day 1 starts in {startsIn}</div>}
      <div className="flex items-center gap-2">
        <div role="group" aria-label="View" className="flex min-w-0 flex-auto gap-1.5 overflow-x-auto [scrollbar-width:none]">
          {VIEWS.filter((v) => v.id !== 'strength' || canCompare).map((v) => (
            <button key={v.id} type="button" aria-pressed={v.id === shown} onClick={() => setView(v.id)} className={chip(v.id === shown)}>{v.label}</button>
          ))}
        </div>
        {shown === 'strength' && <span className="flex flex-none items-center"><Info topic="strength" /></span>}
      </div>
      {shown === 'standings' ? <Standings rows={rows} clan={clan} /> : <GroupTable rows={rows} clan={clan} compare={shown === 'strength'} />}
    </div>
  )
}

export default function CwlGroup({ wide, roster, q, setQ }: { wide: boolean; roster: Roster; q: string; setQ: (v: string) => void }) {
  const { data, loading } = useCwlGroups()
  const own = useWarClan() ?? warClanOr(readClan())
  const setOwn = setWarClan
  const dots = useWarDots()
  const groups = useMemo(() => (data?.clans ?? []).filter((c) => c.group), [data])
  const shown = groups.find((c) => c.clan === own) ?? groups[0]
  const hits = familyHits(roster, norm(q.trim()))
  const enter = () => { if (hits[0]) window.location.hash = playerHref(hits[0].tag) }
  const switcher = <ClanSwitch<ClanName> value={shown?.clan ?? own} onPick={setOwn} {...dots} off={data ? CLANS.filter((k) => !groups.some((c) => c.clan === k)) : []} />
  return (
    <main className={wide ? 'mx-auto flex max-w-[1360px] flex-col gap-4 px-[clamp(16px,3vw,32px)] pb-12 pt-5' : 'flex flex-col gap-3 px-4 pb-6 pt-1'}>
      {wide ? <WideHeader q={q} setQ={setQ} onEnter={enter}>{switcher}</WideHeader> : <PhoneSearch q={q} setQ={setQ} onEnter={enter} className="-mx-4 -mb-1 -mt-1">{switcher}</PhoneSearch>}
      {q.trim() ? (
        <FamilyHits roster={roster} hits={hits} />
      ) : !data ? (
        loading ? <div aria-busy="true" className="h-64 animate-pulse rounded-2xl bg-well" /> : <div className="rounded-2xl border border-line bg-white p-5 text-sm text-faint">Unavailable right now</div>
      ) : !shown?.group ? (
        <div className="rounded-2xl border border-line bg-white px-6 py-14 text-center text-sm font-semibold text-faint">No CWL group yet</div>
      ) : (
        <div className="w-full max-w-[900px]"><Board rows={shown.group.table} clan={shown.clan} /></div>
      )}
    </main>
  )
}
