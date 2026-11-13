import { type MouseEvent, type ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useWide } from '../data'

// The small "i": a tap opens a short explanation, formulas first. On the body, because a sheet's animation would otherwise trap it inside the sheet.
// These follow docs/specs/01-scoring-core.md, docs/specs/02-allocation-rules.md and web/src/dayplan.ts: change them together.

// Maths set as maths, in MathML, which every current browser draws without a library.
const Eq = ({ label, children }: { label: string; children: ReactNode }) => (
  <math display="block" aria-label={label} className="m-0 overflow-x-auto text-[14px] text-ink [scrollbar-width:none]"><mrow>{children}</mrow></math>
)
const V = ({ children }: { children: string }) => <mi>{children}</mi>
const O = ({ children }: { children: string }) => <mo>{children}</mo>
const N = ({ children }: { children: string }) => <mn>{children}</mn>
const Frac = ({ top, bottom }: { top: ReactNode; bottom: ReactNode }) => <mfrac><mrow>{top}</mrow><mrow>{bottom}</mrow></mfrac>
const Capped = ({ v, cap }: { v: string; cap: string }) => <><mi mathvariant="normal">min</mi><O>(</O><Frac top={<V>{v}</V>} bottom={<N>{cap}</N>} /><O>,</O><N>1</N><O>)</O></>
const Key = ({ rows }: { rows: [string, string][] }) => (
  <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-1 text-[13px] leading-[1.35] text-ink-2">
    {rows.map(([v, what]) => <div key={v} className="contents"><dt className="font-serif italic text-ink">{v}</dt><dd className="m-0">{what}</dd></div>)}
  </dl>
)

const SCORE_MATH = (
  <>
    <Eq label="Score equals attack plus defence"><V>Score</V><O>=</O><V>A</V><O>+</O><V>D</V></Eq>
    <Eq label="Attack equals three-star rate, times one minus miss rate, times attacks over 25 capped at 1, times one plus 0.05 times town hall gap">
      <V>A</V><O>=</O><V>t</V><O>×</O><O>(</O><N>1</N><O>−</O><V>m</V><O>)</O><O>×</O><Capped v="n" cap="25" /><O>×</O><O>(</O><N>1</N><O>+</O><N>0.05</N><V>g</V><O>)</O>
    </Eq>
    <Eq label="Defence equals three minus stars taken, over three, times 100, times defences over 20 capped at 1, times one plus 0.05 times town hall minus 15">
      <V>D</V><O>=</O><Frac top={<><N>3</N><O>−</O><V>s</V></>} bottom={<N>3</N>} /><O>×</O><N>100</N><O>×</O><Capped v="d" cap="20" /><O>×</O><O>(</O><N>1</N><O>+</O><N>0.05</N><V>h</V><O>)</O>
    </Eq>
  </>
)
const SCORE_KEY = (
  <Key rows={[
    ['t', '3★ rate, as a % of attacks made'],
    ['m', 'Miss rate, missed ÷ (attacks + missed)'],
    ['n', 'Attacks made'],
    ['g', 'Average TH you hit − your TH'],
    ['s', 'Average stars taken off you'],
    ['d', 'Defences'],
    ['h', 'Your TH − 15'],
  ]} />
)

const TOPICS: Record<string, { title: string; formulas?: string[]; math?: ReactNode; key?: ReactNode; lines?: string[] }> = {
  score: {
    title: 'How the score works',
    math: SCORE_MATH,
    key: SCORE_KEY,
    lines: [
      'Covers about the last 3 to 4 months of wars, on a rolling basis. Half the family is above 50. The top tenth is above 95.',
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
  expected: {
    title: 'How performance works',
    formulas: [
      'Our stars = what we usually get + what they usually concede − group average',
      'Their stars = what they usually get + what we usually concede − group average',
    ],
    lines: [
      "'Usually' means each clan's other wars in this group. Early in the league it leans on the group average, so one odd day can't swing it.",
      'It shows once both clans have 3 other wars, and it updates as each day ends.',
      'A number in red went against us by 2 stars or more. Green went our way by as much.',
      'The index beside Performance adds up every day: stars we took above expected, less stars they took above expected.',
    ],
  },
  picks: {
    title: 'How bonus picks are chosen',
    formulas: ['★/hit = stars ÷ hits'],
    lines: [
      'You qualify with 8 stars or more and no missed attack.',
      'Picks rank by ★/hit, so playing fewer days never counts against you.',
      'Ties go to higher average destruction, then more hits on a town hall at your level or higher.',
      'Leaders hand out the bonuses in the game.',
    ],
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
      'Scores and rates cover about the last 3 to 4 months of wars, on a rolling basis. Hero progress starts in November.',
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
            {t.math && <div className="flex flex-col gap-3 rounded-xl bg-[#F6EEDC] px-2 py-3">{t.math}</div>}
            {t.key}
            {t.lines?.map((l) => <p key={l} className="m-0 text-sm leading-[1.4] text-ink-2">{l}</p>)}
            <button type="button" autoFocus onClick={() => setOpen(false)} className="min-h-11 flex-none cursor-pointer rounded-full border border-line bg-white text-sm font-bold text-ink-2 hover:bg-hover">Got it, chief</button>
          </section>
        </div>,
        document.body,
      )}
    </>
  )
}
