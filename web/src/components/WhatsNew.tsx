import { useCallback, useState } from 'react'
import { EARLIER, LATEST, type Update } from '../updates'
import { CardSheet } from './ClanSheet'
import { Eyebrow } from './ui'

// The header's What's new button and its card. A new update opens the card once and lights the button until it is seen;
// a link that opens a player or clan keeps its own sheet, and only the button lights.

const SEEN = 'ff-whats-new'
const seen = () => { try { return localStorage.getItem(SEEN) === LATEST.id } catch { return true } }

const Sparkle = ({ size }: { size: number }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.3 6.7L21 11l-6.7 2.3L12 20l-2.3-6.7L3 11l6.7-2.3L12 2zM19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9L19 16z" /></svg>
)

const Groups = ({ update }: { update: Update }) => (
  <div className="flex flex-col gap-3.5">
    {update.groups.map((g) => (
      <section key={g.title} aria-label={g.title} className="flex flex-col gap-1.5">
        <Eyebrow>{g.title}</Eyebrow>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {g.lines.map((l) => (
            <li key={l} className="flex gap-2 text-sm font-normal leading-snug text-ink-2">
              <span aria-hidden="true" className="mt-[7px] size-1 flex-none rounded-full bg-[#A3957C]" />
              {l}
            </li>
          ))}
        </ul>
      </section>
    ))}
  </div>
)

export default function WhatsNew({ wide }: { wide: boolean }) {
  const [fresh, setFresh] = useState(() => !seen())
  const [open, setOpen] = useState(() => !seen() && !/\/(p|c|e|u)\//.test(window.location.hash))
  const close = useCallback(() => {
    setOpen(false)
    setFresh(false)
    try { localStorage.setItem(SEEN, LATEST.id) } catch { /* private mode */ }
  }, [])
  return (
    <>
      <button type="button" aria-label="What's new" title="What's new" onClick={() => setOpen(true)}
        className="relative flex size-9 flex-none cursor-pointer items-center justify-center rounded-full border border-line bg-white text-gold hover:bg-page">
        <Sparkle size={16} />
        {fresh && <span aria-hidden="true" className="absolute right-0 top-0 size-2.5 rounded-full border-2 border-white bg-[#DC2626]" />}
      </button>
      {open && (
        <CardSheet label="What's new" wide={wide} onClose={close} head={
          <div className="flex min-w-0 flex-auto flex-col gap-1">
            <span className="font-display text-[26px] leading-tight text-brand">What's new</span>
            <span className="flex items-center gap-1 text-xs font-normal text-muted"><span className="text-gold"><Sparkle size={12} /></span>Updated {LATEST.date}</span>
          </div>
        }>
          <Groups update={LATEST} />
          {EARLIER.length > 0 && (
            <section aria-label="Earlier updates" className="flex flex-col gap-1 border-t border-hair pt-3">
              <Eyebrow>Earlier updates</Eyebrow>
              {EARLIER.map((u) => (
                <details key={u.id} className="group">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-normal text-ink-2 [&::-webkit-details-marker]:hidden">
                    {u.date}
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A3957C" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-open:rotate-90"><path d="M9 6l6 6-6 6" /></svg>
                  </summary>
                  <div className="pb-2 pt-1"><Groups update={u} /></div>
                </details>
              ))}
            </section>
          )}
          {/* Stays in reach however many earlier updates are open. */}
          <div className="sticky -bottom-px flex-none bg-white pt-2">
            <button type="button" onClick={close} className="min-h-11 w-full cursor-pointer rounded-xl border-0 bg-ink text-sm font-bold text-white hover:opacity-90">Got it</button>
          </div>
        </CardSheet>
      )}
    </>
  )
}
