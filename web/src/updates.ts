// What changed, for the What's new card. To add an update, append an entry to the END of UPDATES with a new id: the card
// opens for everyone once, shows the last entry on top, and keeps the others below it, newest first.
// Lines sit under the tab they changed, such as "War tab", or "Player cards" or "General". Each is one short, professional release note naming the
// specific feature and starting with a past-tense verb, such as "Added support for local time toggle". Keep each under 40 characters, so it stays on one line on a phone.

export type Update = { id: string; date: string; groups: { title: string; lines: string[] }[] }

export const UPDATES: Update[] = [
  {
    id: '2026-11-01',
    date: '1 Nov 2026',
    groups: [
      {
        title: 'Stats tab',
        lines: [
          'Added upgrade rankings for all members.',
          'Added a war record for each member.',
          'Added Donations and Capital rankings.',
          'Added monthly clan trends.',
        ],
      },
      {
        title: 'CWL tab',
        lines: [
          'Added pending clan moves to Lineups.',
        ],
      },
    ],
  },
  {
    id: '2026-11-02',
    date: '2 Nov 2026',
    groups: [
      {
        title: 'War tab (new)',
        lines: [
          'Added a live attack log for each war.',
          'Added open bases and attacks remaining.',
          'Added post-war recaps.',
        ],
      },
      {
        title: 'Log tab (new)',
        lines: [
          'Added member and upgrade activity.',
          'Added reactions to new town halls.',
        ],
      },
      {
        title: 'CWL tab',
        lines: [
          'Added play days to daily lineups.',
        ],
      },
      {
        title: 'Stats tab',
        lines: [
          'Added family membership history.',
          'Added a Badges leaderboard.',
        ],
      },
      {
        title: 'Player cards',
        lines: [
          'Added account tagging with Add me.',
          'Added bronze, silver and gold badges.',
          'Added streaks, heroes and equipment.',
        ],
      },
      {
        title: 'General',
        lines: [
          'Added home screen installation.',
        ],
      },
    ],
  },
  {
    id: '2026-11-03',
    date: '3 Nov 2026',
    groups: [
      {
        title: 'CWL tab',
        lines: [
          'Added a Group table with town halls.',
          'Added clan cards for our three clans.',
          'Added a seven-day selector.',
        ],
      },
      {
        title: 'War tab',
        lines: [
          'Added lineup mismatch alerts.',
          "Added each clan's most recent war.",
        ],
      },
      {
        title: 'Plan tab',
        lines: [
          'Improved newcomer placement in Suggest.',
        ],
      },
    ],
  },
  {
    id: '2026-11-04',
    date: '4 Nov 2026',
    groups: [
      {
        title: 'CWL tab',
        lines: [
          'Added Standings for the CWL group.',
          'Added enemy clan comparison cards.',
        ],
      },
      {
        title: 'War tab',
        lines: [
          'Added a War log of finished wars.',
        ],
      },
      {
        title: 'Stats tab',
        lines: [
          'Added upgrade cards by category.',
          'Reorganised sub-tabs for easier access.',
        ],
      },
      {
        title: 'Player cards',
        lines: [
          'Added links to all upgrade categories.',
        ],
      },
      {
        title: 'General',
        lines: [
          'Added support for local time toggle.',
        ],
      },
    ],
  },
]

export const LATEST = UPDATES[UPDATES.length - 1]
export const EARLIER = UPDATES.slice(0, -1).reverse()
