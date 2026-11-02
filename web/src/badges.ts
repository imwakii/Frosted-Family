// Named from the game. Each says what earns it and where its three tiers sit (server/profiles.py sets the lines);
// the server adds the tier and what earned it for this player.
export const BADGES: Record<string, { icon: string; label: string; means: string; ladder: [string, string, string] }> = {
  sharpshooter: { icon: '⭐', label: 'Three-Star General', means: 'Three stars on your war attacks, over 20 or more attacks.', ladder: ['80%', '85%', '90%'] },
  never_misses: { icon: '⚔️', label: 'Battle Ready', means: 'War attacks made with none missed.', ladder: ['20', '50', '75'] },
  wall: { icon: '🛡️', label: 'Unbreakable', means: 'Fewest stars given up per attack, over 20 or more defences.', ladder: ['Top 20', 'Top 10', 'Top 5'] },
  giant_slayer: { icon: '🪓', label: 'Giant Slayer', means: 'Three-star war hits on a higher town hall.', ladder: ['1', '3', '5'] },
  cleanup: { icon: '🧹', label: 'Cleanup Crew', means: 'Three-starred a base others in your war failed to clear.', ladder: ['1', '3', '5'] },
  war_hero: { icon: '🎖️', label: 'War Hero', means: 'War stars earned, all time.', ladder: ['2,000', '3,000', '5,000'] },
  raider: { icon: '🏛️', label: 'Capital Raider', means: 'Capital gold looted in the latest raid weekend.', ladder: ['20k', '25k', '30k'] },
  builder: { icon: '🔨', label: 'Master Builder', means: 'Upgrades finished in the last 30 days.', ladder: ['5', '15', '30'] },
  top_donor: { icon: '🤝', label: 'Friend in Need', means: 'Biggest donors in the family this season.', ladder: ['Top 10', 'Top 3', '#1'] },
  maxed_heroes: { icon: '👑', label: 'Hero Hall Legend', means: 'Hero levels as a share of the maximum.', ladder: ['95%', '99%', 'All max'] },
}
export const TIERS = ['bronze', 'silver', 'gold'] as const
export type Tier = (typeof TIERS)[number]
export const TIER_LOOK = {
  bronze: { chip: 'border-[#D9A77A] bg-[#FBEFE4] text-[#8A4B1F]', on: 'border-[#8A4B1F] bg-[#F5DFCB] text-[#8A4B1F]', ink: '#E8B48A', dot: '#CD7F32', name: 'Bronze' },
  silver: { chip: 'border-[#B8C2D0] bg-[#F6EEDC] text-[#5E5240]', on: 'border-[#5E5240] bg-[#E3D8BF] text-[#5E5240]', ink: '#D5C8AC', dot: '#A3957C', name: 'Silver' },
  gold: { chip: 'border-[#E9B949] bg-[#FEF3C7] text-[#92400E]', on: 'border-[#92400E] bg-[#FDE68A] text-[#92400E]', ink: '#FDE68A', dot: '#E9B949', name: 'Gold' },
}
