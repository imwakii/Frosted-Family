export type ClanName = 'Fire' | 'Cake' | 'Flakes'
export type Slot = 'CORE' | 'SUB' | 'OUT' | 'NEW'
export type Status = 'active' | 'highMiss' | 'inactive' | 'thin' | 'new'

export interface Player {
  tag: string
  name: string
  clan: ClanName
  slot: Slot
  from: ClanName | null
  th: number | null
  score: number | null
  /** The two parts of the score; none yet for a new member. */
  attackScore?: number | null
  defenceScore?: number | null
  status: Status
  threeStar: number | null
  missPct: number | null
  attacks: number | null
  rank: number | null
  history: { cycle: string; score: number | null }[]
  /** New members only: first seen in the clan, and the slot the backend suggests. */
  joinedAt?: string | null
  suggestedSlot?: Slot | null
  suggestedReason?: string | null
  /** Back in the clan after leaving, in the slot they had. */
  rejoined?: boolean
  /** The clan the member is in now, in game; differs from clan until they make their move. */
  inClan?: ClanName | null
  /** CWL days in the published day plan; [] for none, null when the clan has no plan. */
  days?: number[] | null
}

export interface ClanInfo { league: string | null; inCwl: boolean }

export interface Roster {
  generatedAt: string
  cwlStart: string | null
  clans: Record<ClanName, ClanInfo>
  window: { from: string; to: string } | null
  cycles: string[]
  players: Player[]
}

export interface LiveWar {
  state: 'preparation' | 'inWar' | 'warEnded'
  day: number | null
  opponent: string
  stars: number
  opponentStars: number
  attacks: number
  teamSize: number
  kind: 'cwl' | 'regular' | null
  startTime: number | null
  endTime: number | null
  destruction: number | null
  opponentDestruction: number | null
}
