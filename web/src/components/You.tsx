import { useEffect, useId, useSyncExternalStore, useState } from 'react'
import { syncAccounts } from '../alerts'
import type { Roster } from '../types'
import { CLAN, SLOT_TEXT } from '../theme'
import { playerHref } from '../route'
import { SearchIcon, Th } from './ui'

// Which accounts are this person's: their main and any alts. Added from the header's Add me, changed from any player's sheet,
// and shown on every list. Kept in this browser; the server only hears of them if this phone turns alerts on, and nobody else sees them.

const YOU_KEY = 'ff-you'
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
  void syncAccounts(tags)
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

let nextYou = 0
/** Takes you to your row on a long list, then your next account's. */
export const jumpToYou = () => {
  const all = document.querySelectorAll('[data-you]')
  all[nextYou++ % all.length]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

/** The floating button for wide screens, where it clears the list; hidden when there is nowhere further to go. */
export function JumpToYou({ wide }: { wide: boolean }) {
  const { yous } = useYou()
  const [show, setShow] = useState(false)
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
  return (
    <button type="button" onClick={jumpToYou}
      className={`fixed right-4 z-20 min-h-11 cursor-pointer rounded-full border-0 bg-ink px-4 text-sm font-bold text-white shadow-[0_4px_14px_rgba(43,33,20,.3)] ${wide ? 'bottom-6' : 'bottom-[72px]'}`}>
      Find me
    </button>
  )
}

/** Finds a member by name and marks them as this person: their first account, or another one. */
export function YouPrompt({ roster, onDone, autoFocus, bare }: { roster: Roster; onDone: () => void; autoFocus?: boolean; bare?: boolean }) {
  const { yous, addYou } = useYou()
  const [q, setQ] = useState('')
  const id = useId()
  const adding = roster.players.some((p) => yous.includes(p.tag))
  const n = q.trim().toLowerCase()
  const hits = n ? roster.players.filter((p) => !yous.includes(p.tag) && p.name.toLowerCase().includes(n)).slice(0, 5) : []
  return (
    <section aria-label={adding ? 'Add another account' : 'Add me'} className={`flex flex-col gap-2 ${bare ? '' : 'rounded-2xl border border-line bg-white p-3'}`}>
      {!bare && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[15px] font-bold text-ink">{adding ? 'Add another account' : 'Add me'}</span>
          <button type="button" aria-label="Close" onClick={onDone}
            className="flex size-8 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-lg leading-none text-faint hover:bg-page hover:text-ink">×</button>
        </div>
      )}
      <div className="relative min-w-0">
        <label htmlFor={id} className="sr-only">Your name in the game</label>
        <SearchIcon />
        <input id={id} type="search" autoFocus={autoFocus} placeholder="Your name in the game" value={q} autoComplete="off" spellCheck={false} onChange={(e) => setQ(e.target.value)}
          className="h-11 w-full rounded-xl border border-line bg-white pl-[42px] pr-3.5 text-base text-ink placeholder:text-faint" />
      </div>
      {hits.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {hits.map((p, i) => (
            <li key={p.tag}>
              <button type="button" onClick={() => { addYou(p.tag); onDone() }} className={`flex min-h-11 w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent px-1 text-left hover:bg-hover ${i ? 'border-t border-hair' : ''}`}>
                <Th th={p.th} />
                <span className="min-w-0 flex-auto truncate text-sm font-semibold text-ink">{p.name}</span>
                <span className="flex-none text-xs font-bold" style={{ color: CLAN[p.clan].deep }}>{p.clan} · {SLOT_TEXT[p.slot]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {n && !hits.length && <span className="px-1 text-sm text-faint">No one by that name in this village</span>}
    </section>
  )
}

/** Your own card from any tab: the first of your accounts; the card switches between them. */
export function YouChip({ roster, compact }: { roster: Roster; compact?: boolean }) {
  const { yous } = useYou()
  const [picking, setPicking] = useState(false)
  const p = roster.players.find((x) => yous.includes(x.tag))
  if (!p) {
    return (
      <>
        <button type="button" aria-label="Add me" onClick={() => setPicking(true)}
          className={`flex h-9 flex-none cursor-pointer items-center justify-center gap-0.5 whitespace-nowrap rounded-full border border-line bg-white text-[13px] font-bold text-ink-2 hover:bg-hover ${compact ? 'w-9' : 'px-2 lg:px-3'}`}>
          <span aria-hidden="true" className="text-base leading-none">+</span>
          {!compact && <><span className="lg:hidden">Add me</span><span className="max-lg:hidden">Add yourself</span></>}
        </button>
        {picking && (
          <div className="ff-fade fixed inset-0 z-50 flex items-start justify-center bg-[rgba(43,33,20,.4)] px-4 pt-20" onClick={(e) => { if (e.target === e.currentTarget) setPicking(false) }}>
            <div className="w-full max-w-[420px] shadow-[0_20px_50px_rgba(43,33,20,.25)]"><YouPrompt roster={roster} onDone={() => setPicking(false)} autoFocus /></div>
          </div>
        )}
      </>
    )
  }
  return (
    <a href={playerHref(p.tag)} aria-label={`Your card, ${p.name}`}
      className={`flex h-9 min-w-0 max-w-[170px] items-center gap-1 overflow-hidden rounded-full border border-line bg-white py-0.5 pl-0.5 text-ink no-underline hover:bg-page ${compact ? 'flex-none pr-0.5' : 'pr-2'}`}>
      <Th th={p.th} />
      {!compact && <span className="min-w-0 truncate text-[13px] font-bold">{p.name}</span>}
    </a>
  )
}
