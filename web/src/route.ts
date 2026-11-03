import { useEffect, useState } from 'react'
import type { ClanName } from './types'

// Hash routes: #/war[/log[/<clan>/<war key>]] (where the app opens), #/cwl[/standings|/group], #/log, #/stats/<sub>[/<category>], #/plan/<sub>. A player sheet opens over
// Lineups or Stats by appending /p/<tag without #>, and closes by dropping it; a clan card the same way with /c/<clan>,
// and a league group clan's card with /e/<our clan>/<its tag without #>.
// Old links (#/explore/<kind>, #/leaders/<sub>) are rewritten to their new place.
export type Tab = 'cwl' | 'explore' | 'log' | 'war' | 'plan'
export type Route = { tab: Tab; sub: string; kind: string | null; player: string | null; clan: ClanName | null; rival: { clan: ClanName; tag: string } | null; base: string }

export const STATS_SUBS = ['players', 'badges', 'war', 'donations', 'capital', 'trends', 'history'] as const
export const LEADERS_SUBS = ['builder', 'days', 'members'] as const

/** A hand-edited or cut-off link can hold a broken % escape; it opens no player rather than failing the page. */
export function decodeTag(raw: string) {
  try { return decodeURIComponent(raw) } catch { return null }
}

function parse(): Route {
  const h = window.location.hash.replace(/^#\/?/, '')
  const [head, tag] = h.split(/(?:^|\/)p\//)
  const decoded = tag ? decodeTag(tag) : null
  const player = decoded ? '#' + decoded : null
  const card = head.match(/(?:^|\/)c\/(Fire|Cake|Flakes)$/)
  const enemy = head.match(/(?:^|\/)e\/(Fire|Cake|Flakes)\/([^/]+)$/)
  const rivalTag = enemy ? decodeTag(enemy[2]) : null
  const cut = enemy ?? card
  return {
    ...place(cut ? head.slice(0, cut.index) : head, player),
    clan: card ? (card[1] as ClanName) : null,
    rival: enemy && rivalTag ? { clan: enemy[1] as ClanName, tag: '#' + rivalTag } : null,
  }
}

function place(path: string, player: string | null): Omit<Route, 'clan' | 'rival'> {
  let parts = path.split('/').filter(Boolean)
  if (parts[0] === 'explore') parts = parts[1] === 'war' || parts[1] === 'upgrades' ? ['stats', parts[1]] : ['stats', 'players', ...parts.slice(1, 2)]
  if ((parts[0] === 'plan' || parts[0] === 'leaders') && parts[1] === 'attacks') parts = ['war']  // moved 2 Nov 2026
  if (parts[0] === 'plan' || parts[0] === 'leaders') {
    const sub = (LEADERS_SUBS as readonly string[]).includes(parts[1]) ? parts[1] : 'builder'
    return { tab: 'plan', sub, kind: null, player, base: `#/plan/${sub}` }
  }
  if (parts[0] === 'stats' && parts[1] === 'clans') parts = ['stats', 'trends']  // renamed 2 Nov 2026
  if (parts[0] === 'stats' && parts[1] === 'upgrades') parts = ['log']  // moved 2 Nov 2026
  if (parts[0] === 'stats') {
    const sub = (STATS_SUBS as readonly string[]).includes(parts[1]) ? parts[1] : 'players'
    const kind = sub === 'players' ? parts[2] ?? null : null
    return { tab: 'explore', sub, kind, player, base: `#/stats/${sub}${kind ? '/' + kind : ''}` }
  }
  if (parts[0] === 'log') return { tab: 'log', sub: '', kind: null, player, base: '#/log' }
  if (parts[0] === 'cwl') {
    const sub = parts[1] === 'group' || parts[1] === 'standings' ? parts[1] : 'lineups'
    return { tab: 'cwl', sub, kind: null, player, base: sub === 'lineups' ? '#/cwl' : `#/cwl/${sub}` }
  }
  if (parts[0] === 'war' && parts[1] === 'log') {
    const kind = parts[2] && parts[3] ? `${parts[2]}/${parts[3]}` : null
    return { tab: 'war', sub: 'log', kind, player, base: `#/war/log${kind ? '/' + kind : ''}` }
  }
  return { tab: 'war', sub: 'latest', kind: null, player, base: '#/war' }
}

export function useRoute() {
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const on = () => {
      const r = parse()
      // Rewrite an old link in place, so the address bar shows the new route.
      const want = r.base + (r.clan ? `/c/${r.clan}` : '') + (r.rival ? `/e/${r.rival.clan}/${encodeURIComponent(r.rival.tag.slice(1))}` : '') + (r.player ? `/p/${encodeURIComponent(r.player.slice(1))}` : '')
      if (want && window.location.hash !== want) history.replaceState(null, '', want)
      setRoute(r)
    }
    on()
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

/** Link to a player's sheet over the current view. */
export const playerHref = (tag: string) => {
  const base = parse().base
  return `${base}/p/${encodeURIComponent(tag.replace(/^#/, ''))}`
}

/** Link to a clan's card over the current view. */
export const clanHref = (clan: ClanName) => `${parse().base}/c/${clan}`

/** Link to a league group clan's card over the current view, set against our clan in that group. */
export const rivalHref = (clan: ClanName, tag: string) => `${parse().base}/e/${clan}/${encodeURIComponent(tag.replace(/^#/, ''))}`

// A tap on a player card's figure opens the ranking behind it: that unit or column, across the family, with the player's
// row shown. Boards read it once they hold the data it names.
export type Drill = { tag: string; unit?: string; col?: string }
let drill: Drill | null = null

export const go = {
  to: (hash: string) => { window.location.hash = hash },
  closePlayer: () => { window.location.hash = parse().base },
  drill: (hash: string, d: Drill) => {
    drill = d
    try { sessionStorage.setItem('ff-x-clan', 'All') } catch { /* private mode */ }
    window.location.hash = hash
    window.dispatchEvent(new Event('ff-drill'))
  },
}

export function onDrill(run: () => void) {
  useEffect(() => {
    window.addEventListener('ff-drill', run)
    return () => window.removeEventListener('ff-drill', run)
  }, [run])
}

function showRow(tag: string) {
  const row = document.querySelector(`[data-tag="${CSS.escape(tag)}"]`)
  if (!row) return
  ;(row.querySelector('[data-sorted]') ?? row).scrollIntoView({ block: 'center', inline: 'center' })
  row.classList.add('ff-drilled')
  window.setTimeout(() => row.classList.remove('ff-drilled'), 2400)
}

export function useDrill(ready: (d: Drill) => boolean, apply: (d: Drill) => void) {
  const [, bump] = useState(0)
  useEffect(() => {
    const on = () => bump((n) => n + 1)
    window.addEventListener('ff-drill', on)
    return () => window.removeEventListener('ff-drill', on)
  }, [])
  useEffect(() => {
    if (!drill || !ready(drill)) return
    const d = drill
    drill = null
    apply(d)
    window.setTimeout(() => showRow(d.tag), 150)  // once the new order has drawn and the card has gone
  })
}
