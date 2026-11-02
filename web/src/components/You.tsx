import { useEffect, useRef, useSyncExternalStore, useState } from 'react'
import type { Roster } from '../types'
import { CLAN, SLOT_TEXT } from '../theme'
import { SearchIcon, Th } from './ui'

// Which accounts are this person's: their main and any alts. Asked once on Lineups, changed from any player's sheet,
// and shown on every list. Kept in this browser only; the server never knows, and nobody else sees it.

const YOU_KEY = 'ff-you'
const SKIP_KEY = 'ff-you-skip'
const listeners = new Set<() => void>()
const read = (key: string) => { try { return localStorage.getItem(key) } catch { return null } }
const write = (key: string, v: string | null) => {
  try { if (v) localStorage.setItem(key, v); else localStorage.removeItem(key) } catch { /* private mode */ }
}
// Stored as a JSON list; a device from before alts holds one bare tag.
function load(): string[] {
  const raw = read(YOU_KEY)
  if (!raw) return []
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : [raw] } catch { return [raw] }
}
let current = load()

function save(tags: string[]) {
  current = tags
  write(YOU_KEY, tags.length ? JSON.stringify(tags) : null)
  listeners.forEach((l) => l())
}
const addYou = (tag: string) => { if (!current.includes(tag)) save([...current, tag]) }
const removeYou = (tag: string) => save(current.filter((t) => t !== tag))

/** Your accounts, main first. */
export function useYou() {
  const yous = useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => current)
  return { yous, addYou, removeYou }
}

/** Marks a row as yours; renders nothing for anyone else. The Jump button finds it by data-you. */
export function YouTag({ tag }: { tag: string }) {
  const { yous } = useYou()
  if (!yous.includes(tag)) return null
  return <span data-you className="mr-1.5 inline-block flex-none rounded-md bg-ink px-1 py-px align-[1px] text-[9px] font-extrabold uppercase tracking-[0.05em] text-white">You</span>
}

/** Takes you to your row on a long list, then your next account's; hidden when there is nowhere further to go. */
export function JumpToYou({ wide }: { wide: boolean }) {
  const { yous } = useYou()
  const [show, setShow] = useState(false)
  const next = useRef(0)
  useEffect(() => {
    if (!yous.length) { setShow(false); return }
    const check = () => {
      const all = [...document.querySelectorAll('[data-you]')]
      setShow(all.some((el) => {
        const r = el.getBoundingClientRect()
        return r.top < 60 || r.bottom > window.innerHeight - 70
      }))
    }
    check()
    const id = window.setInterval(check, 700)
    return () => window.clearInterval(id)
  }, [yous])
  if (!show) return null
  const jump = () => {
    const all = document.querySelectorAll('[data-you]')
    all[next.current++ % all.length]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
  return (
    <button type="button" onClick={jump}
      className={`fixed right-4 z-20 min-h-10 cursor-pointer rounded-full border-0 bg-ink px-4 text-sm font-bold text-white shadow-[0_4px_14px_rgba(15,23,42,.3)] ${wide ? 'bottom-6' : 'bottom-[72px]'}`}>
      Find me
    </button>
  )
}

/** Whether Lineups is still asking which member this is. */
export function useAsksYou(roster: Roster) {
  const { yous } = useYou()
  const skipped = useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => !!read(SKIP_KEY))
  return !skipped && !roster.players.some((p) => yous.includes(p.tag))
}

/** Asked once: which member this is; skipping it stays skipped on this device. With onDone, it adds another account. */
export function YouPrompt({ roster, onDone }: { roster: Roster; onDone?: () => void }) {
  const { yous, addYou } = useYou()
  const asks = useAsksYou(roster)
  const [q, setQ] = useState('')
  if (!onDone && !asks) return null
  const n = q.trim().toLowerCase()
  const hits = n ? roster.players.filter((p) => !yous.includes(p.tag) && p.name.toLowerCase().includes(n)).slice(0, 5) : []
  return (
    <section aria-label={onDone ? 'Add another account' : 'Which one is you?'} className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-bold text-ink">{onDone ? 'Add another account' : 'Which one is you?'}</span>
        <button type="button" aria-label={onDone ? 'Close' : 'Skip'} onClick={() => { if (onDone) { onDone(); return } write(SKIP_KEY, '1'); listeners.forEach((l) => l()) }}
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
              <button type="button" onClick={() => { addYou(p.tag); onDone?.() }} className={`flex min-h-11 w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent px-1 text-left hover:bg-hover ${i ? 'border-t border-hair' : ''}`}>
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
