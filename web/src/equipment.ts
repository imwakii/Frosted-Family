import type { Unit } from './explore'

// Hero equipment by hero, in hero order; within each hero, commons (max 18)
// then epics (max 27). An unconfirmed piece goes under null, shown last
// without a label, as does any equipment the API adds before this list knows it.
const BY_HERO: [string | null, string[]][] = [
  ['Barbarian King', ['Barbarian Puppet', 'Rage Vial', 'Earthquake Boots', 'Vampstache', 'Giant Gauntlet', 'Spiky Ball', 'Snake Bracelet', 'Stick Horse']],
  ['Archer Queen', ['Archer Puppet', 'Invisibility Vial', 'Giant Arrow', 'Healer Puppet', 'Frozen Arrow', 'Magic Mirror', 'Action Figure', 'Monolith Arrow']],
  ['Grand Warden', ['Eternal Tome', 'Life Gem', 'Rage Gem', 'Healing Tome', 'Fireball', 'Lavaloon Puppet', 'Heroic Torch']],
  ['Royal Champion', ['Royal Gem', 'Seeking Shield', 'Hog Rider Puppet', 'Haste Vial', 'Rocket Spear', 'Electro Boots', 'Frost Flake']],
  ['Minion Prince', ['Henchmen Puppet', 'Dark Orb', 'Metal Pants', 'Noble Iron', 'Dark Crown', 'Meteor Staff']],
  ['Dragon Duke', ['Fire Heart', 'Stun Blaster', 'Flame Blower', 'Electro Fangs', 'Rocket Backpack', 'Revenge Deck']],
  [null, ['Portal Pendant']],
]

export type UnitGroup = { hero: string | null; idx: number[] }

/** Unit indices in display order, grouped by hero for equipment; one unlabelled group otherwise. */
export function groupUnits(cat: string, units: Unit[]): UnitGroup[] {
  const all = units.map((_, i) => i)
  if (cat !== 'equipment') return [{ hero: null, idx: all }]
  const at = new Map(units.map((u, i) => [u.name, i]))
  const placed = new Set<number>()
  const groups = BY_HERO.map(([hero, names]) => {
    const idx = names.map((n) => at.get(n)).filter((i): i is number => i !== undefined)
    idx.forEach((i) => placed.add(i))
    return { hero, idx }
  })
  groups[groups.length - 1].idx.push(...all.filter((i) => !placed.has(i)))
  return groups.filter((g) => g.idx.length)
}
