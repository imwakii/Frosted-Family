import { useState } from 'react'
import { LATEST } from '../updates'
import type { Roster } from '../types'
import Alerts from './Alerts'
import { CardSheet } from './ClanSheet'
import InstallGuide from './InstallGuide'
import { canInstall } from './InstallHint'
import { Eyebrow, RowChevron, setUtc, SwitchRow, Th, useUtc } from './ui'
import { Sparkle, useNews, WhatsNewCard } from './WhatsNew'
import { useYou, YouPrompt } from './You'

// The header's Settings button and its sheet: What's new, whose accounts this phone follows, which alerts it gets, and the time shown.

const VISITED = 'ff-settings-seen'

const Gear = () => (
  <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)
const Dot = ({ className }: { className: string }) => <span aria-hidden="true" className={`size-2.5 rounded-full border-2 border-white bg-[#DC2626] ${className}`} />

function Accounts({ roster }: { roster: Roster }) {
  const { yous, addYou, removeYou } = useYou()
  const [adding, setAdding] = useState(false)
  const [gone, setGone] = useState<{ tag: string; name: string } | null>(null)
  const mine = roster.players.filter((p) => yous.includes(p.tag))
  return (
    <section aria-label="Your accounts" className="flex flex-col gap-1.5">
      <div className="flex min-h-9 items-center justify-between">
        <Eyebrow>Your accounts</Eyebrow>
        {mine.length > 0 && !adding && <button type="button" onClick={() => setAdding(true)} className="min-h-9 cursor-pointer rounded-full border border-line bg-white px-3 text-[13px] font-bold text-ink-2 hover:bg-hover">Add</button>}
      </div>
      {mine.length > 0 && (
        <ul className="m-0 flex list-none flex-col rounded-xl border border-line bg-white p-0">
          {mine.map((p) => (
            <li key={p.tag} className="flex min-h-[52px] items-center gap-2.5 border-b border-hair pl-3 pr-1 last:border-b-0">
              <Th th={p.th} />
              <span className="min-w-0 flex-auto truncate text-sm font-semibold text-ink">{p.name}</span>
              <button type="button" aria-label={`Remove ${p.name}`} onClick={() => { removeYou(p.tag); setGone({ tag: p.tag, name: p.name }) }}
                className="flex size-9 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-lg leading-none text-faint hover:bg-page hover:text-ink">×</button>
            </li>
          ))}
        </ul>
      )}
      {gone && !yous.includes(gone.tag) && (
        <div className="flex min-h-10 items-center justify-between gap-3 rounded-xl bg-[#F6EEDC] px-3 text-sm font-semibold text-ink-2">
          <span className="min-w-0 truncate">{gone.name} removed</span>
          <button type="button" onClick={() => { addYou(gone.tag); setGone(null) }} className="min-h-8 flex-none cursor-pointer border-0 bg-transparent p-0 font-bold text-action underline">Undo</button>
        </div>
      )}
      {(adding || !mine.length) && <YouPrompt bare roster={roster} onDone={() => setAdding(false)} />}
    </section>
  )
}

export default function Settings({ wide, roster, leader, account }: { wide: boolean; roster: Roster | null; leader: boolean; account: { name: string; onSignOut: () => void } | null }) {
  const news = useNews()
  const { yous } = useYou()
  const utc = useUtc()
  const [open, setOpen] = useState(false)
  const [guide, setGuide] = useState(false)
  // Once someone has marked themselves, the button lights until they have been in here and seen alerts.
  const [visited, setVisited] = useState(() => { try { return !!localStorage.getItem(VISITED) } catch { return true } })
  const openSheet = () => {
    setOpen(true)
    if (yous.length) {
      setVisited(true)
      try { localStorage.setItem(VISITED, '1') } catch { /* private mode */ }
    }
  }
  return (
    <>
      <button type="button" aria-label="Settings" title="Settings" onClick={openSheet}
        className="relative flex size-9 flex-none cursor-pointer items-center justify-center rounded-full border border-line bg-white text-ink-2 hover:bg-page">
        <Gear />
        {(news.fresh || (yous.length > 0 && !visited)) && <Dot className="absolute right-0 top-0" />}
      </button>
      {open && (
        <CardSheet label="Settings" wide={wide} onClose={() => setOpen(false)} head={<span className="font-display text-[26px] leading-tight text-brand">Settings</span>}>
          <button type="button" onClick={() => { setOpen(false); news.show() }}
            className="flex min-h-[60px] w-full flex-none cursor-pointer items-center gap-3 rounded-xl border border-line bg-white px-3 py-2 text-left hover:bg-page">
            <span className="flex size-9 flex-none items-center justify-center text-gold"><Sparkle size={22} /></span>
            <span className="flex min-w-0 flex-auto flex-col">
              <span className="flex items-center gap-1.5 text-[15px] font-bold text-ink">What's new{news.fresh && <Dot className="flex-none" />}</span>
              <span className="truncate text-[13px] text-muted">Updated {LATEST.date}</span>
            </span>
            <RowChevron />
          </button>
          {canInstall() && (
            <button type="button" onClick={() => { setOpen(false); setGuide(true) }}
              className="flex min-h-[60px] w-full flex-none cursor-pointer items-center gap-3 rounded-xl border border-line bg-white px-3 py-2 text-left hover:bg-page">
              <img src="/app-icon-192.png" alt="" width={36} height={36} className="flex-none rounded-[9px]" />
              <span className="flex min-w-0 flex-auto flex-col">
                <span className="text-[15px] font-bold text-ink">Add to home screen</span>
                <span className="truncate text-[13px] text-muted">Opens like an app</span>
              </span>
              <RowChevron />
            </button>
          )}
          {roster && <Accounts roster={roster} />}
          <Alerts onGuide={() => { setOpen(false); setGuide(true) }} />
          <section aria-label="Time" className="flex flex-col gap-1.5">
            <Eyebrow>Time</Eyebrow>
            <div className="rounded-xl border border-line bg-white">
              <SwitchRow label="Show UTC" line="On the calendar" on={utc} onFlip={() => setUtc(!utc)} />
            </div>
          </section>
          {account && (
            <section aria-label="Leader sign-in" className="flex flex-col gap-1.5">
              <Eyebrow>Leader sign-in</Eyebrow>
              <div className="flex min-h-[52px] items-center gap-2.5 rounded-xl border border-line bg-white pl-3 pr-2">
                <span className="min-w-0 flex-auto truncate text-sm font-semibold text-ink">{account.name}</span>
                <button type="button" onClick={() => { setOpen(false); account.onSignOut() }}
                  className="min-h-9 flex-none cursor-pointer rounded-full border border-line bg-white px-3 text-[13px] font-bold text-ink-2 hover:bg-hover">Sign out</button>
              </div>
            </section>
          )}
        </CardSheet>
      )}
      {guide && <InstallGuide wide={wide} onClose={() => setGuide(false)} />}
      {news.open && <WhatsNewCard wide={wide} leader={leader} onClose={news.close} onSettings={openSheet} />}
    </>
  )
}
