import { useEffect, useState } from 'react'
import { loginHref } from '../auth'
import { type ClanAttacks, Denied, loadAttacks } from '../leaders'
import { playerHref } from '../route'
import { CLAN } from '../theme'
import { Th } from './ui'

type Data = { clans: ClanAttacks[]; last_poll: string | null }

// The API's times look like 20261104T080000.000Z.
const at = (t: string | null) => {
  const m = t?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/)
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null
}
const left = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000))
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}

/** Refetched every minute (the collector polls every 10), keeping the last answer on screen meanwhile. */
function useAttacksLive() {
  const [state, setState] = useState<{ data: Data | null; loading: boolean; denied: boolean }>({ data: null, loading: true, denied: false })
  useEffect(() => {
    let live = true
    const tick = () => loadAttacks().then(
      (data) => { if (live) setState((s) => ({ data: data ?? s.data, loading: false, denied: false })) },
      (e) => { if (live) setState((s) => ({ ...s, loading: false, denied: e instanceof Denied })) })
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => { live = false; window.clearInterval(id) }
  }, [])
  return state
}

function ClanCard({ c, now }: { c: ClanAttacks; now: number }) {
  const t = CLAN[c.clan]
  const w = c.war!
  const todo = c.members.filter((m) => m.used < m.allowed)
  const end = at(w.end_time)
  const start = at(w.start_time)
  const live = w.state === 'inWar'
  return (
    <section aria-label={c.clan} className="overflow-hidden rounded-[18px] border border-line bg-white">
      <div className="flex items-start justify-between gap-3 p-4" style={{ background: t.tint }}>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-display m-0 text-[22px] leading-none" style={{ color: t.deep }}>{c.clan}</h2>
          <span className="truncate text-[13px] font-semibold text-muted">
            {w.kind === 'cwl' ? `CWL day ${w.day ?? '?'}` : 'War'} · vs {w.opponent} · ★ {w.stars}–{w.opponent_stars}
          </span>
        </div>
        <div className="flex flex-none flex-col items-end gap-1">
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${live ? 'bg-white text-[#15803D]' : 'bg-[#FFEDD5] text-[#C2410C]'}`}>
            {live ? (end ? `${left(end - now)} left` : 'Live') : start ? `Starts in ${left(start - now)}` : 'Prep'}
          </span>
          {live && <span className="text-xs font-bold" style={{ color: todo.length ? '#B45309' : '#15803D' }}>{todo.length ? `${todo.length} to attack` : 'All attacked'}</span>}
        </div>
      </div>
      <ol className="m-0 list-none py-1">
        {c.members.map((m, i) => {
          const done = m.used >= m.allowed
          return (
            <li key={m.tag}>
              <a href={playerHref(m.tag)} className={`flex min-h-11 items-center gap-3 px-3.5 text-ink no-underline hover:bg-hover ${i ? 'border-t border-hair' : ''} ${done ? 'opacity-55' : ''}`}>
                <span className="w-5 flex-none text-right text-xs font-bold tabular-nums text-faint">{m.position ?? ''}</span>
                <Th th={m.th} />
                <span className="min-w-0 flex-auto truncate text-[15px] font-semibold">{m.name}</span>
                {m.used > 0 && <span className="flex-none text-xs font-bold tabular-nums text-muted">{m.stars}★</span>}
                <span aria-label={`${m.used} of ${m.allowed} attacks used`} className="flex flex-none gap-1">
                  {Array.from({ length: m.allowed }, (_, k) => (
                    <span key={k} className={`size-2.5 rounded-full ${k < m.used ? 'bg-[#16A34A]' : live ? 'bg-[#F59E0B]' : 'bg-[#E2E8F0]'}`} />
                  ))}
                </span>
              </a>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** Leaders → Attacks: who still has attacks in each clan's war, CWL or regular, refreshed every minute. */
export default function WarAttacks({ wide }: { wide: boolean }) {
  const { data, loading, denied } = useAttacksLive()
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(id) }, [])
  const wars = (data?.clans ?? []).filter((c) => c.war)
  return (
    <main className={wide ? 'mx-auto flex max-w-[1360px] flex-col gap-4 px-[clamp(16px,3vw,32px)] pb-12 pt-5' : 'flex flex-col gap-3 px-4 pb-6 pt-3'}>
      {wars.length > 0 && (
        <div className="flex flex-wrap gap-x-[18px] gap-y-1.5 text-[13px] font-semibold text-muted">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#F59E0B]" />Attack left</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#16A34A]" />Used</span>
        </div>
      )}
      {denied ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-white px-6 py-12 text-center">
          <span className="text-sm font-semibold text-muted">Leaders only</span>
          <a href={loginHref()} className="flex min-h-11 items-center rounded-xl bg-[#5865F2] px-5 text-sm font-bold text-white no-underline hover:bg-[#4752C4]">Sign in with Discord</a>
        </div>
      ) : !data ? (
        loading ? <div aria-busy="true" className="h-64 animate-pulse rounded-2xl bg-well" /> : <div className="rounded-2xl border border-line bg-white p-5 text-sm text-faint">Unavailable right now</div>
      ) : !wars.length ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-white px-6 py-14 text-center">
          <span className="text-sm font-semibold text-faint">No war on</span>
        </div>
      ) : (
        <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">
          {wars.map((c) => <ClanCard key={c.clan} c={c} now={now} />)}
        </div>
      )}
    </main>
  )
}
