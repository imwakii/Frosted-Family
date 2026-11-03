import { thIcon } from '../clash'
import { useCwlGroups } from '../leaders'
import { CLAN } from '../theme'
import type { ClanName } from '../types'
import { CardSheet } from './ClanSheet'
import { ClanBadge, dayWon, Eyebrow, LeaguePill } from './ui'

// A league group clan's card, set against ours. Nothing here is kept past the next CWL (server/db.py, forget_groups).

const num = (v: number | null | undefined) => (v == null ? '—' : Math.round(v).toLocaleString('en-GB'))
const POWER = [{ k: 'war_stars', label: 'War stars' }, { k: 'heroes', label: 'Heroes' }, { k: 'equipment', label: 'Equipment' }] as const
const COMPARE = 'grid grid-cols-[minmax(0,1fr)_64px_64px] items-center gap-x-2 px-3'

export default function RivalSheet({ clan, tag, wide, onClose }: { clan: ClanName; tag: string; wide: boolean; onClose: () => void }) {
  const { data } = useCwlGroups()
  const table = data?.clans.find((x) => x.clan === clan)?.group?.table
  const row = table?.find((r) => r.tag === tag)
  const ours = table?.find((r) => r.ours)
  const c = CLAN[clan]
  if (!data) return null
  if (!row) {
    return (
      <CardSheet label="Clan" wide={wide} onClose={onClose} head={<span className="font-display truncate text-[26px] leading-tight text-ink-2">Clan</span>}>
        <p className="m-0 text-sm text-faint">Clan details are gone</p>
      </CardSheet>
    )
  }
  const count = (ths: number[] | undefined, th: number) => ths?.filter((t) => t === th).length ?? 0
  const halls = [...new Set([...row.town_halls, ...(ours?.town_halls ?? [])])].sort((a, b) => b - a)
  const p = row.profile
  const facts = [
    { label: 'CWL stars', value: num(row.stars) },
    { label: 'Clan level', value: num(p?.level) },
    { label: 'War wins', value: num(p?.war_wins) },
    { label: 'Win streak', value: num(p?.win_streak) },
  ]
  const wars = (row.wars ?? []).filter((w) => w.state !== 'preparation')
  return (
    <CardSheet label={row.name} wide={wide} onClose={onClose} head={<>
      <ClanBadge src={row.badge} size={60} />
      <div className="flex min-w-0 flex-auto flex-col gap-1">
        <bdi className="text-left font-display truncate text-[26px] leading-tight text-ink-2">{row.name}</bdi>
        {p?.war_league && <LeaguePill league={p.war_league} text={p.war_league.replace('League ', '')} />}
      </div>
    </>}>
      <dl className="m-0 grid grid-cols-4 gap-2">
        {facts.map((x) => (
          <div key={x.label} className="flex flex-col items-center gap-0.5 rounded-xl bg-[#F6EEDC] px-1 py-2">
            <dd className="font-display m-0 whitespace-nowrap text-[19px] leading-none text-ink-2">{x.value}</dd>
            <dt className="whitespace-nowrap text-[11px] font-semibold text-muted">{x.label}</dt>
          </div>
        ))}
      </dl>

      <section aria-label="Strength" className="flex flex-col gap-1.5">
        <Eyebrow>Strength, top 15 avg</Eyebrow>
        <div className="overflow-hidden rounded-xl border border-hair">
          <div className={`${COMPARE} border-b border-hair py-1.5`}>
            <span />
            <span className="flex flex-col items-center gap-0.5 text-[10px] font-bold text-muted"><ClanBadge src={row.badge} size={24} />Them</span>
            <span className="flex flex-col items-center gap-0.5 text-[10px] font-bold" style={{ color: c.deep }}><ClanBadge src={ours?.badge ?? null} size={24} />Us</span>
          </div>
          {POWER.map((m, i) => {
            const them = row.strength?.[m.k], us = ours?.strength?.[m.k]
            const gap = them != null && us != null ? Math.round(them - us) : 0
            return (
              <div key={m.k} className={`${COMPARE} min-h-[44px] ${i ? 'border-t border-hair' : ''}`}>
                <span className="text-[13px] font-semibold text-ink-2">{m.label}</span>
                <span className="flex flex-col items-center leading-none">
                  <span className="text-sm font-bold tabular-nums text-ink">{num(them)}</span>
                  {gap !== 0 && <span className={`mt-0.5 text-[10px] font-bold tabular-nums ${gap > 0 ? 'text-[#B91C1C]' : 'text-[#15803D]'}`}>{gap > 0 ? '+' : '−'}{Math.abs(gap).toLocaleString('en-GB')}</span>}
                </span>
                <span className="text-center text-sm font-bold tabular-nums" style={{ color: c.deep }}>{num(us)}</span>
              </div>
            )
          })}
        </div>
      </section>

      <p className="m-0 -mt-2 text-[11px] text-faint"><span className="font-bold text-[#15803D]">Green</span>: we're ahead. <span className="font-bold text-[#B91C1C]">Red</span>: they're ahead.</p>

      <section aria-label="Town halls" className="flex flex-col gap-1.5">
        <Eyebrow>Town halls</Eyebrow>
        <div className="overflow-hidden rounded-xl border border-hair">
          {halls.map((th, i) => (
            <div key={th} className={`${COMPARE} min-h-9 ${i ? 'border-t border-hair' : ''}`}>
              <span className="flex items-center">{thIcon(th) ? <img src={thIcon(th)!} alt={`Town hall ${th}`} width={26} height={26} className="size-[26px] object-contain" /> : <span className="text-xs font-bold text-faint">TH{th}</span>}</span>
              <span className="text-center text-sm font-bold tabular-nums text-ink">{count(row.town_halls, th) || '·'}</span>
              <span className="text-center text-sm font-bold tabular-nums" style={{ color: c.deep }}>{count(ours?.town_halls, th) || '·'}</span>
            </div>
          ))}
        </div>
      </section>

      {wars.length > 0 && (
        <section aria-label="This CWL" className="flex flex-col gap-1.5">
          <Eyebrow>This CWL</Eyebrow>
          <ol className="m-0 flex list-none flex-col gap-1 p-0">
            {wars.map((w) => {
              const won = dayWon(w), over = w.state === 'warEnded'
              return (
                <li key={w.day} className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-ink" style={{ background: w.opponent_tag === ours?.tag ? c.tint : '#F6EEDC' }}>
                  <span className="w-3 flex-none text-center text-xs font-bold tabular-nums text-faint">{w.day}</span>
                  <ClanBadge src={w.opponent_badge} size={22} />
                  <bdi className="text-left min-w-0 flex-auto truncate">{w.opponent}</bdi>
                  <span className={`flex-none text-[13px] font-bold tabular-nums ${!over ? 'text-ink-2' : won === false ? 'text-[#B91C1C]' : won ? 'text-[#15803D]' : 'text-ink-2'}`}>
                    {!over ? 'Live' : won === null ? 'Draw' : won ? 'Won' : 'Lost'} {w.stars}–{w.opponent_stars}
                  </span>
                </li>
              )
            })}
          </ol>
        </section>
      )}
    </CardSheet>
  )
}
