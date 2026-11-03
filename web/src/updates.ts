// What changed, for the What's new card. A later update on the same date merges into that date's entry, keeping its highlights, and takes a new id.
// To add an update on a new date, append an entry to the END of UPDATES with a new id: the card
// opens for everyone once, shows the last entry on top, and keeps the others below it, newest first. Up to three
// highlights lead it, each a short benefit that links to the place; the full notes fold away under them.
// Lines sit under the tab they changed, such as "War tab", or "Player cards" or "General". Each is one patch note naming the specific feature and
// starting with a past-tense verb such as Added, Changed, Moved, Fixed or Removed. Keep each under 40 characters, so it stays on one line on a phone.

export type Highlight = { title: string; line: string; href?: string; icon: 'league' | 'swords' | 'hero' | 'bell' | 'calendar' }  // no href opens Settings
export type Update = { id: string; date: string; highlights?: Highlight[]; groups: { title: string; lines: string[] }[] }

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
    // Further ids for the same day: the batch grew after the first, so the card opens once more.
    id: '2026-11-04-11',
    date: '4 Nov 2026',
    highlights: [
      { title: 'Phone alerts', line: 'Choose what your phone tells you.', icon: 'bell' },
      { title: 'Calendar', line: "See what's on next in the family.", href: '#/calendar', icon: 'calendar' },
      { title: 'Standings', line: "See who's winning your CWL group.", href: '#/cwl/group', icon: 'league' },
    ],
    groups: [
      {
        title: 'Calendar',
        lines: [
          'Added a calendar icon at the top.',
          'Added planned CWL and friendly dates.',
        ],
      },
      {
        title: 'CWL tab',
        lines: [
          'Added Standings to the Group sub-tab.',
          'Added enemy clan comparison cards.',
          'Added play days to the Lineups roster.',
          'Changed Lineups to open on the roster.',
          'Removed the personal status row.',
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
          'Moved Donations and Capital to Players.',
          'Reorganised sub-tabs for easier access.',
        ],
      },
      {
        title: 'Log tab',
        lines: [
          'Changed Log to open on recent days.',
        ],
      },
      {
        title: 'Plan tab',
        lines: [
          'Merged the lineup and day builders.',
          'Added a place picker under each name.',
          'Added an Activity list of plan changes.',
          'Added side-by-side clan comparison.',
          'Changed Publish to send it all at once.',
          'Locked days once their war has started.',
          'Added Not as planned marks.',
          'Changed Suggest to keep your plan.',
          'Added the swaps to make in the game.',
          'Added changes to the Publish check.',
        ],
      },
      {
        title: 'Settings',
        lines: [
          'Added a Settings button at the top.',
          'Removed the clock from the top.',
          'Added phone alerts you can choose.',
          "Moved What's new into Settings.",
        ],
      },
      {
        title: 'Player cards',
        lines: [
          'Fixed move notes after sign-up closes.',
          'Added side-by-side player comparison.',
          'Added Change on both compared players.',
          'Added links to all upgrade categories.',
          'Added a back arrow on upgrade cards.',
        ],
      },
      {
        title: 'General',
        lines: [
          'Added support for local time toggle.',
          'Added draggable clan and day selectors.',
          'Added a search icon on phones.',
          'Added a first-visit welcome.',
          'Changed clan selector to stay pinned.',
          'Moved leader sign-in to the footer.',
          'Removed reactions and emojis.',
        ],
      },
    ],
  },
]

export const LATEST = UPDATES[UPDATES.length - 1]
export const EARLIER = UPDATES.slice(0, -1).reverse()
