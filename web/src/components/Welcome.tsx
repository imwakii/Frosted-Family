import { useState } from 'react'
import { alertState } from '../alerts'
import { LATEST } from '../updates'
import type { Roster } from '../types'
import Alerts from './Alerts'
import { CardSheet } from './ClanSheet'
import { YouPrompt } from './You'

// A first visit asks who you are, in place of the What's new card, which means nothing yet. A link that opens a player
// or clan keeps its own sheet, and the welcome waits for the next visit. Once they have found themselves, a phone that can
// take alerts is offered them, while saying yes is one tap.

const WELCOMED = 'ff-welcome'
const WHATS_NEW = 'ff-whats-new'

export const firstVisit = (() => {
  try {
    return !localStorage.getItem('ff-you') && !localStorage.getItem(WHATS_NEW) && !localStorage.getItem(WELCOMED)
      && !/\/(p|c|e|u)\//.test(window.location.hash)
  } catch { return false }
})()

export default function Welcome({ roster, wide }: { roster: Roster; wide: boolean }) {
  const [open, setOpen] = useState(firstVisit)
  const [offering, setOffering] = useState(false)
  if (!open) return null
  const done = () => {
    setOpen(false)
    try {
      localStorage.setItem(WELCOMED, '1')
      localStorage.setItem(WHATS_NEW, LATEST.id)
    } catch { /* private mode */ }
  }
  const found = () => { alertState().then((s) => { if (s === 'off') setOffering(true); else done() }, done) }
  if (offering) {
    return (
      <CardSheet label="Get alerts" wide={wide} onClose={done} head={
        <div className="flex min-w-0 flex-auto flex-col gap-1">
          <span className="font-display text-[24px] leading-tight text-brand">Get alerts</span>
          <span className="text-sm text-muted">Hear when your attack or CWL day is close.</span>
        </div>
      }>
        <Alerts />
        <button type="button" onClick={done} className="min-h-11 flex-none cursor-pointer rounded-xl border-0 bg-transparent text-sm font-bold text-muted hover:text-ink">Done</button>
      </CardSheet>
    )
  }
  return (
    <CardSheet label="Welcome" wide={wide} onClose={done} head={
      <div className="flex min-w-0 flex-auto flex-col gap-1">
        <span className="font-display text-[24px] leading-tight text-brand">Welcome</span>
        <span className="text-sm text-muted">Find your name to see which CWL days you're allocated, our stats and war log.</span>
      </div>
    }>
      <YouPrompt roster={roster} onDone={found} bare />
      <button type="button" onClick={done} className="min-h-11 flex-none cursor-pointer rounded-xl border-0 bg-transparent text-sm font-bold text-muted hover:text-ink">Not now</button>
    </CardSheet>
  )
}
