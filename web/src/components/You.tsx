import { useEffect, useSyncExternalStore, useState } from 'react'
import type { Roster } from '../types'
import { CLAN, SLOT_TEXT } from '../theme'
import { SearchIcon, Th } from './ui'

// Who this device belongs to. Asked once on Lineups, changed from any player's sheet, and shown on every list.

const YOU_KEY = 'ff-you'
const SKIP_KEY = 'ff-you-skip'
const listeners = new Set<() => void>()
const read = (key: string) => { try { return localStorage.getItem(key) } catch { return null } }
const write = (key: string, v: string | null) => {
  try { if (v) localStorage.setItem(key, v); else localStorage.removeItem(key) } catch { /* private mode */ }
}
let current = read(YOU_KEY)

function setYou(tag: string | null) {
  current = tag
  write(YOU_KEY, tag)
  listeners.forEach((l) => l())
}

export function useYou() {
  const you = useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => current)
  return [you, setYou] as const
}

/** Marks a row as yours; renders nothing for anyone else. The Jump button finds it by data-you. */
export function YouTag({ tag }: { tag: string }) {
  const [you] = useYou()
  if (you !== tag) return null
  return <span data-you className="mr-1.5 inline-block flex-none rounded-md bg-ink px-1 py-px align-[1px] text-[9px] font-extrabold uppercase tracking-[0.05em] text-white">You</span>
}

/** Takes you to your row on a long list; hidden when it is already on screen or not on this page. */
export function JumpToYou({ wide }: { wide: boolean }) {
  const [you] = useYou()
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!you) { setShow(false); return }
    const check = () => {
      const el = document.querySelector('[data-you]')
      if (!el) { setShow(false); return }
      const r = el.getBoundingClientRect()
      setShow(r.top < 60 || r.bottom > window.innerHeight - 70)
    }
    check()
    const id = window.setInterval(check, 700)
    return () => window.clearInterval(id)
  }, [you])
  if (!show) return null
  return (
    <button type="button" onClick={() => document.querySelector('[data-you]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
      className={`fixed right-4 z-20 min-h-10 cursor-pointer rounded-full border-0 bg-ink px-4 text-sm font-bold text-white shadow-[0_4px_14px_rgba(15,23,42,.3)] ${wide ? 'bottom-6' : 'bottom-[72px]'}`}>
      Find me
    </button>
  )
}

/** Asked once: which member this is. Skipping it stays skipped on this device. */
export function YouPrompt({ roster }: { roster: Roster }) {
  const [you, pin] = useYou()
  const [skipped, setSkipped] = useState(() => !!read(SKIP_KEY))
  const [q, setQ] = useState('')
  if (skipped || (you && roster.players.some((p) => p.tag === you))) return null
  const n = q.trim().toLowerCase()
  const hits = n ? roster.players.filter((p) => p.name.toLowerCase().includes(n)).slice(0, 5) : []
  return (
    <section aria-label="Which one is you?" className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-bold text-ink">Which one is you?</span>
        <button type="button" aria-label="Skip" onClick={() => { write(SKIP_KEY, '1'); setSkipped(true) }}
          className="flex size-8 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-lg leading-none text-faint hover:bg-page hover:text-ink">×</button>
      </div>
      <div className="relative min-w-0">
        <label htmlFor="who" className="sr-only">Your name in the game</label>
        <SearchIcon />
        <input id="who" type="search" placeholder="Your name in the game" value={q} autoComplete="off" spellCheck={false} onChange={(e) => setQ(e.target.value)}
          className="h-11 w-full rounded-xl border border-line bg-white pl-[42px] pr-3.5 text-base text-ink placeholder:text-faint" />
      </div>
      {hits.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {hits.map((p, i) => (
            <li key={p.tag}>
              <button type="button" onClick={() => pin(p.tag)} className={`flex min-h-11 w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent px-1 text-left hover:bg-hover ${i ? 'border-t border-hair' : ''}`}>
                <Th th={p.th} />
                <span className="min-w-0 flex-auto truncate text-sm font-semibold text-ink">{p.name}</span>
                <span className="flex-none text-xs font-bold" style={{ color: CLAN[p.clan].deep }}>{p.clan} · {SLOT_TEXT[p.slot]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {n && !hits.length && <span className="px-1 text-sm text-faint">No one by that name</span>}
    </section>
  )
}
