import { useEffect, useState } from 'react'
import type { Cat } from './explore'
import type { ClanName } from './types'

// Hash routes: #/war[/log[/<clan>/<war key>]] (where the app opens), #/cwl[/group], #/calendar, #/log[/recap], #/stats/<sub>[/<category>], #/plan/<sub>. A player sheet opens over
// Lineups or Stats by appending /p/<tag without #>, and closes by dropping it; a clan card the same way with /c/<clan>,
// a league group clan's card with /e/<our clan>/<its tag without #>,
// one player in one upgrade category with /u/<category>/<tag without #>[/<unit to mark>],
// and two players side by side with /v/<tag>[/<other tag>], tags without #.
// Old links (#/explore/<kind>, #/leaders/<sub>) are rewritten to their new place.
export type Tab = 'cwl' | 'calendar' | 'explore' | 'log' | 'war' | 'plan'
export type Route = { tab: Tab; sub: string; kind: string | null; player: string | null; clan: ClanName | null; rival: { clan: ClanName; tag: string } | null; upgrade: { cat: Cat; tag: string; unit: string | null } | null; compare: { a: string; b: string | null } | null; history: { tag: string; days: 7 | 30 } | null; attacks: { tag: string; days: 7 | 30 } | null; base: string }

export const STATS_SUBS = ['players', 'badges', 'war', 'trends', 'history'] as const
export const LEADERS_SUBS = ['builder', 'days', 'members', 'usage'] as const

/** A hand-edited or cut-off link can hold a broken % escape; it opens no player rather than failing the page. */
export function decodeTag(raw: string) {
  try { return decodeURIComponent(raw) } catch { return null }
}

const upgradePath = (cat: Cat, tag: string, unit?: string | null) =>
  `/u/${cat}/${encodeURIComponent(tag.replace(/^#/, ''))}${unit ? `/${encodeURIComponent(unit)}` : ''}`

const comparePath = (a: string, b?: string | null) =>
  `/v/${encodeURIComponent(a.replace(/^#/, ''))}${b ? `/${encodeURIComponent(b.replace(/^#/, ''))}` : ''}`

const historyPath = (tag: string, days: number) => `/l/${encodeURIComponent(tag.replace(/^#/, ''))}/${days}`
const attacksPath = (tag: string, days: number) => `/a/${encodeURIComponent(tag.replace(/^#/, ''))}/${days}`

function parse(): Route {
  const h = window.location.hash.replace(/^#\/?/, '')
  const [head, tag] = h.split(/(?:^|\/)p\//)
  const decoded = tag ? decodeTag(tag) : null
  const player = decoded ? '#' + decoded : null
  const card = head.match(/(?:^|\/)c\/(Fire|Cake|Flakes)$/)
  const enemy = head.match(/(?:^|\/)e\/(Fire|Cake|Flakes)\/([^/]+)$/)
  const rivalTag = enemy ? decodeTag(enemy[2]) : null
  const stat = head.match(/(?:^|\/)u\/(heroes|equipment|troops|spells|pets|sieges)\/([^/]+)(?:\/([^/]+))?$/)
  const statTag = stat ? decodeTag(stat[2]) : null
  const versus = head.match(/(?:^|\/)v\/([^/]+)(?:\/([^/]+))?$/)
  const versusA = versus ? decodeTag(versus[1]) : null
  const versusB = versus?.[2] ? decodeTag(versus[2]) : null
  const log = head.match(/(?:^|\/)l\/([^/]+)\/(7|30)$/)
  const logTag = log ? decodeTag(log[1]) : null
  const fights = head.match(/(?:^|\/)a\/([^/]+)\/(7|30)$/)
  const fightsTag = fights ? decodeTag(fights[1]) : null
  const cut = enemy ?? card ?? stat ?? versus ?? log ?? fights
  return {
    ...place(cut ? head.slice(0, cut.index) : head, player),
    clan: card ? (card[1] as ClanName) : null,
    rival: enemy && rivalTag ? { clan: enemy[1] as ClanName, tag: '#' + rivalTag } : null,
    compare: versusA ? { a: '#' + versusA, b: versusB ? '#' + versusB : null } : null,
    history: log && logTag ? { tag: '#' + logTag, days: Number(log[2]) as 7 | 30 } : null,
    attacks: fights && fightsTag ? { tag: '#' + fightsTag, days: Number(fights[2]) as 7 | 30 } : null,
    upgrade: stat && statTag ? { cat: stat[1] as Cat, tag: '#' + statTag, unit: stat[3] ? decodeTag(stat[3]) : null } : null,
  }
}

function place(path: string, player: string | null): Omit<Route, 'clan' | 'rival' | 'upgrade' | 'compare' | 'history' | 'attacks'> {
  let parts = path.split('/').filter(Boolean)
  if (parts[0] === 'explore') parts = parts[1] === 'war' || parts[1] === 'upgrades' ? ['stats', parts[1]] : ['stats', 'players', ...parts.slice(1, 2)]
  if ((parts[0] === 'plan' || parts[0] === 'leaders') && parts[1] === 'attacks') parts = ['war']  // moved 2 Nov 2026
  if (parts[0] === 'plan' || parts[0] === 'leaders') {
    const sub = (LEADERS_SUBS as readonly string[]).includes(parts[1]) ? parts[1] : 'days'
    return { tab: 'plan', sub, kind: null, player, base: `#/plan/${sub}` }
  }
  if (parts[0] === 'stats' && parts[1] === 'clans') parts = ['stats', 'trends']  // renamed 2 Nov 2026
  if (parts[0] === 'stats' && parts[1] === 'upgrades') parts = ['log']  // moved 2 Nov 2026
  if (parts[0] === 'stats' && (parts[1] === 'donations' || parts[1] === 'capital')) parts = ['stats', 'players', parts[1]]  // moved 3 Nov 2026
  if (parts[0] === 'stats') {
    const sub = (STATS_SUBS as readonly string[]).includes(parts[1]) ? parts[1] : 'players'
    const kind = sub === 'players' ? parts[2] ?? null : null
    return { tab: 'explore', sub, kind, player, base: `#/stats/${sub}${kind ? '/' + kind : ''}` }
  }
  if (parts[0] === 'calendar') return { tab: 'calendar', sub: '', kind: null, player, base: '#/calendar' }
  if (parts[0] === 'log') return parts[1] === 'recap'
    ? { tab: 'log', sub: 'recap', kind: null, player, base: '#/log/recap' }
    : { tab: 'log', sub: 'feed', kind: null, player, base: '#/log' }
  if (parts[0] === 'cwl') {
    const sub = parts[1] === 'group' || parts[1] === 'standings' ? 'group' : 'lineups'  // Standings joined Group on 4 Nov 2026
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
      const want = r.base + (r.clan ? `/c/${r.clan}` : '') + (r.rival ? `/e/${r.rival.clan}/${encodeURIComponent(r.rival.tag.slice(1))}` : '') + (r.history ? historyPath(r.history.tag, r.history.days) : '') + (r.attacks ? attacksPath(r.attacks.tag, r.attacks.days) : '') + (r.upgrade ? upgradePath(r.upgrade.cat, r.upgrade.tag, r.upgrade.unit) : '') + (r.compare ? comparePath(r.compare.a, r.compare.b) : '') + (r.player ? `/p/${encodeURIComponent(r.player.slice(1))}` : '')
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

// Set when an upgrade card opens from a player's card, so it can offer the way back. A link or a Stats list leaves it off.
let upgradeFromCard = false
export const openedFromCard = () => upgradeFromCard
export const markFromCard = (on: boolean) => { upgradeFromCard = on }

/** Link to two players side by side over the current view, or to choosing the second. */
export const compareHref = (a: string, b?: string | null) => `${parse().base}${comparePath(a, b)}`

/** Link to one player's upgrades over the last 7 or 30 days, over the current view. */
export const historyHref = (tag: string, days: 7 | 30) => `${parse().base}${historyPath(tag, days)}`

/** Link to one player's attacks over the last 7 or 30 days, over the current view. */
export const attacksHref = (tag: string, days: 7 | 30) => `${parse().base}${attacksPath(tag, days)}`

/** Link to one player in one upgrade category, over the current view. */
export const upgradeHref = (cat: Cat, tag: string, unit?: string | null) => `${parse().base}${upgradePath(cat, tag, unit)}`

/** Link to a league group clan's card over the current view, set against our clan in that group. */
export const rivalHref = (clan: ClanName, tag: string) => `${parse().base}/e/${clan}/${encodeURIComponent(tag.replace(/^#/, ''))}`

// A tap on a player card's figure opens the ranking behind it: that unit or column, across the family, with the player's
// row shown. Boards read it once they hold the data it names.
export type Drill = { tag: string; unit?: string; col?: string }
let drill: Drill | null = null

// The card a ranking was opened from, so the page can offer the quick way back. It lasts while the person stays on that tab.
let cameFrom: { hash: string; tag: string; tab: Tab } | null = null
export function cardToReturnTo(tab: Tab) {
  if (cameFrom && cameFrom.tab !== tab) cameFrom = null
  return cameFrom
}
export function returnToCard() {
  if (!cameFrom) return
  const { hash } = cameFrom
  cameFrom = null
  window.location.hash = hash
}

export const go = {
  to: (hash: string) => { window.location.hash = hash },
  closePlayer: () => { window.location.hash = parse().base },
  drill: (hash: string, d: Drill) => {
    drill = d
    const parts = hash.replace(/^#\/?/, '')
    cameFrom = window.location.hash.includes('/p/') ? { hash: window.location.hash, tag: d.tag, tab: place(parts, null).tab } : null
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
