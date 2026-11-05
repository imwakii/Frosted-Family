import { type MouseEvent, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useWide } from '../data'

// The small "i": a tap opens a short explanation, formulas first. On the body, because a sheet's animation would otherwise trap it inside the sheet.
// These follow docs/specs/01-scoring-core.md, docs/specs/02-allocation-rules.md and web/src/dayplan.ts: change them together.

const TOPICS: Record<string, { title: string; formulas?: string[]; lines?: string[] }> = {
  score: {
    title: 'How the score works',
    formulas: [
      'Score = Attack + Defence',
      'Attack = 3★ rate % × (1 − miss rate) × attacks ÷ 25 × (1 + 5% × TH gap)',
      'Defence = (3 − avg stars taken) ÷ 3 × 100 × defences ÷ 20 × (1 + 5% × (TH − 15))',
    ],
    lines: [
      'Attacks ÷ 25 and defences ÷ 20 stop at 1. TH gap is the town hall you hit minus your own.',
      'Covers about the last 3 to 4 months of wars. Half the family is above 50. The top tenth is above 95.',
    ],
  },
  who: {
    title: 'How this list is ordered',
    formulas: [
      '1. Most days idle',
      '2. Lowest Heroes %',
      '3. No upgrades in 30 days',
      'Heroes % = hero levels ÷ typical player at their TH × 100',
    ],
    lines: ["Still tied? Then misses, no donations, not in CWL, new, low TH. It's only a guide. You decide."],
  },
  suggest: {
    title: 'What Suggest does',
    lines: [
      'Takes off anyone who missed this season, left the team or is still in New.',
      'Brings each day to 15.',
      'Adds days for anyone who can no longer reach 8 stars.',
      'Started wars never change. Rebuild ignores your plan and starts over.',
    ],
  },
  war: {
    title: 'Reading this war',
    formulas: [
      '7% destroyed = share of the enemy village destroyed so far',
      '1/15 attacks = attacks used / attacks available',
      'Open bases = enemy bases not yet 3-starred',
      'Stars on a base = the most anyone has taken off it',
    ],
  },
  clan: {
    title: 'What these numbers mean',
    formulas: [
      'Avg war stars = lifetime war stars ÷ players',
      '3★ rate = three-star attacks ÷ attacks',
      'Stars per attack = stars won ÷ attacks',
      'Miss rate = missed ÷ (attacks + missed)',
      'Stars given up = stars taken off us ÷ defences',
      'Bases 3-starred = defences three-starred ÷ defences',
    ],
    lines: ['Avg score is the average score of the core, or of the top 15 when the clan is out of CWL.'],
  },
  privacy: {
    title: 'Your privacy',
    lines: [
      'The accounts you mark as yours and your settings stay on this device.',
      'To count visits, we keep a random ID, the date, your time zone, your clock offset and whether you used the home screen app. No name goes with it. The switch here turns it off.',
      "If you turn on alerts, our server keeps your phone's push address, your marked accounts and which alerts you chose.",
      'Signing in with Discord sets a cookie to keep you signed in. For leaders, we also keep your Discord ID, name, picture and last sign-in.',
      "Our hosting and Google Fonts can see your connection's address, as with any website.",
      'No ads or trackers.',
    ],
  },
  warBoard: {
    title: 'Reading this list',
    formulas: ['Miss rate = missed ÷ (attacks + missed)'],
    lines: ['Amber dot: miss rate above 20%. Green dot: at or below it.'],
  },
  strength: {
    title: 'How strength is worked out',
    formulas: ['Strength = clan total ÷ players in the group'],
    lines: ['Done for war stars, heroes and equipment.'],
  },
  recap: {
    title: 'How the awards work',
    formulas: ['Three-Star General = three-stars ÷ attacks, 5 attacks minimum'],
    lines: ['Awards are for people still here. Months run on UTC.'],
  },
  trends: {
    title: 'How to read these charts',
    lines: [
      'One point a month, so these only move when a new month comes in.',
      'Scores and rates cover about the last 3 to 4 months of wars. Hero progress starts in November.',
    ],
  },
}

export default function Info({ topic, extra }: { topic: keyof typeof TOPICS; extra?: string | null }) {
  const [open, setOpen] = useState(false)
  const wide = useWide()
  const t = TOPICS[topic]
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); setOpen(false) } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])
  const show = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); setOpen(true) }
  return (
    <>
      <button type="button" aria-label={t.title} title={t.title} onClick={show}
        className="relative inline-flex size-[18px] flex-none cursor-pointer items-center justify-center rounded-full border border-[#A3957C] bg-transparent p-0 font-serif text-[12px] font-bold normal-case italic leading-none tracking-normal text-muted before:absolute before:-inset-2 before:content-[''] hover:border-ink hover:text-ink">
        i
      </button>
      {open && createPortal(
        <div className={`ff-fade fixed inset-0 z-[60] flex justify-center bg-[rgba(43,33,20,.4)] p-4 ${wide ? 'items-center' : 'items-end'}`} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
          <section role="dialog" aria-modal="true" aria-label={t.title}
            className="ff-sheet flex max-h-[80dvh] w-full max-w-[440px] flex-col gap-3 overflow-auto rounded-[20px] bg-white p-5 shadow-[0_20px_50px_rgba(43,33,20,.25)]">
            <h2 className="font-display m-0 text-[22px] leading-tight text-brand">{t.title}</h2>
            {extra && <p className="m-0 text-sm font-bold text-ink">{extra}</p>}
            {t.formulas && (
              <div className="flex flex-col gap-1.5 rounded-xl bg-[#F6EEDC] p-3">
                {t.formulas.map((f) => <span key={f} className="text-[13px] font-bold leading-[1.35] tabular-nums text-ink">{f}</span>)}
              </div>
            )}
            {t.lines?.map((l) => <p key={l} className="m-0 text-sm leading-[1.4] text-ink-2">{l}</p>)}
            <button type="button" autoFocus onClick={() => setOpen(false)} className="min-h-11 flex-none cursor-pointer rounded-full border border-line bg-white text-sm font-bold text-ink-2 hover:bg-hover">Got it, chief</button>
          </section>
        </div>,
        document.body,
      )}
    </>
  )
}
