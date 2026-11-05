import { useCallback, useState } from 'react'
import { leagueIcon } from '../clash'
import { go } from '../route'
import { EARLIER, type Highlight, LATEST, type Update } from '../updates'
import { CardSheet } from './ClanSheet'
import { Eyebrow, RowChevron, UnitIcon } from './ui'
import { firstVisit } from './Welcome'

// The What's new card, opened from Settings. A new update opens it once and lights the Settings button until it is seen;
// a link that opens a player or clan keeps its own sheet, and only the button lights. A first visit gets the welcome instead.

const SEEN = 'ff-whats-new'
const seen = () => { try { return localStorage.getItem(SEEN) === LATEST.id } catch { return true } }

export const Sparkle = ({ size }: { size: number }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.3 6.7L21 11l-6.7 2.3L12 20l-2.3-6.7L3 11l6.7-2.3L12 2zM19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9L19 16z" /></svg>
)

export const Chevron = ({ className }: { className: string }) => (
  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#A3957C" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${className}`}><path d="M9 6l6 6-6 6" /></svg>
)

const HighlightIcon = ({ icon }: { icon: Highlight['icon'] }) => {
  if (icon === 'league') return <img src={leagueIcon('Champion League III') ?? undefined} alt="" width={36} height={36} className="size-9 flex-none object-contain" />
  if (icon === 'hero') return <span className="flex-none"><UnitIcon name="Barbarian King" size={36} /></span>
  if (icon === 'bell' || icon === 'calendar') {
    return (
      <span className="flex size-9 flex-none items-center justify-center text-brand">
        <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d={icon === 'bell' ? 'M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9zM10 20a2.2 2.2 0 0 0 4 0' : 'M7 3v4M17 3v4M4 10h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z'} />
        </svg>
      </span>
    )
  }
  return (
    <span className="flex size-9 flex-none items-center justify-center text-brand">
      <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19M4 16l4 4M20 16l-4 4" /></svg>
    </span>
  )
}

// Notes about Plan are for the leaders who can use it.
const Groups = ({ update, quiet, leader }: { update: Update; quiet?: boolean; leader: boolean }) => (
  <div className={`flex flex-col ${quiet ? 'gap-1.5' : 'gap-2.5'}`}>
    {update.groups.filter((g) => leader || g.title !== 'Plan tab').map((g) => (
      <section key={g.title} aria-label={g.title} className="flex flex-col gap-0.5">
        <Eyebrow>{g.title}</Eyebrow>
        <ul className="m-0 flex list-none flex-col p-0">
          {g.lines.map((l) => (
            <li key={l} className={`flex gap-2 font-normal leading-[1.3] ${quiet ? 'text-xs text-muted' : 'text-sm text-ink-2'}`}>
              <span aria-hidden="true" className="mt-[7px] size-1 flex-none rounded-full bg-[#A3957C]" />
              {l}
            </li>
          ))}
        </ul>
      </section>
    ))}
  </div>
)

export function useNews() {
  const [fresh, setFresh] = useState(() => !seen() && !firstVisit)
  const [open, setOpen] = useState(() => !seen() && !firstVisit && !/\/(p|c|e|u|s|l|a|v)\//.test(window.location.hash))
  const close = useCallback(() => {
    setOpen(false)
    setFresh(false)
    try { localStorage.setItem(SEEN, LATEST.id) } catch { /* private mode */ }
  }, [])
  return { fresh, open, close, show: useCallback(() => setOpen(true), []) }
}

export function WhatsNewCard({ wide, leader, onClose: close, onSettings }: { wide: boolean; leader: boolean; onClose: () => void; onSettings: () => void }) {
  return (
        <CardSheet label="What's new" wide={wide} onClose={close} head={
          <div className="flex min-w-0 flex-auto flex-col gap-1">
            <span className="font-display text-[26px] leading-tight text-brand">What's new</span>
            <span className="flex items-center gap-1 text-xs font-normal text-muted"><span className="text-gold"><Sparkle size={12} /></span>Updated {LATEST.date}</span>
          </div>
        }>
          {LATEST.highlights ? (
            <>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {LATEST.highlights.map((h) => (
                  <li key={h.title}>
                    <button type="button" onClick={() => { close(); if (h.href) go.to(h.href); else onSettings() }}
                      className="flex min-h-[60px] w-full cursor-pointer items-center gap-3 rounded-xl border-0 bg-[#F6EEDC] px-3 py-2 text-left hover:bg-well">
                      <HighlightIcon icon={h.icon} />
                      <span className="flex min-w-0 flex-auto flex-col">
                        <span className="truncate text-[15px] font-bold text-ink">{h.title}</span>
                        <span className="truncate text-[13px] text-muted">{h.line}</span>
                      </span>
                      <RowChevron />
                    </button>
                  </li>
                ))}
              </ul>
              <details className="group/notes">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-normal text-ink-2 [&::-webkit-details-marker]:hidden">
                  All patch notes
                  <Chevron className="group-open/notes:rotate-90" />
                </summary>
                <div className="pb-2 pt-1"><Groups update={LATEST} leader={leader} /></div>
              </details>
            </>
          ) : <Groups update={LATEST} leader={leader} />}
          {/* One quiet row until asked for, so the newest update is what the card is about. */}
          {EARLIER.length > 0 && (
            <details className="group/all -mt-4">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-normal text-ink-2 [&::-webkit-details-marker]:hidden">
                Earlier updates
                <Chevron className="group-open/all:rotate-90" />
              </summary>
              <div className="flex flex-col pl-1">
                {EARLIER.map((u) => (
                  <details key={u.id} className="group/one">
                    <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 text-xs font-normal text-muted [&::-webkit-details-marker]:hidden">
                      {u.date}
                      <Chevron className="group-open/one:rotate-90" />
                    </summary>
                    <div className="pb-2 pt-1"><Groups update={u} quiet leader={leader} /></div>
                  </details>
                ))}
              </div>
            </details>
          )}
          {/* Stays in reach however many earlier updates are open. */}
          <div className="sticky -bottom-px flex-none bg-white pt-2">
            <button type="button" onClick={close} className="min-h-11 w-full cursor-pointer rounded-full border border-line bg-white text-sm font-bold text-ink-2 hover:bg-hover">Got it</button>
          </div>
        </CardSheet>
  )
}
