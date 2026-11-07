// What changed, for the What's new card. A later update on the same date merges into that date's entry and keeps its highlights.
// A new id opens the card for everyone, so it takes a new id only when members will notice the change. Plan tab notes show to leaders only.
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
          'Added clan moves still to make.',
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
          'Added joins, leaves and upgrades.',
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
          'Added member history.',
          'Added a Badges leaderboard.',
        ],
      },
      {
        title: 'Player cards',
        lines: [
          'Added Add me to mark your account.',
          'Added bronze, silver and gold badges.',
          'Added streaks, heroes and equipment.',
        ],
      },
      {
        title: 'General',
        lines: [
          'Added Add to home screen.',
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
          'Added a button for each CWL day.',
        ],
      },
      {
        title: 'War tab',
        lines: [
          'Added warnings for wrong lineups.',
          "Added each clan's most recent war.",
        ],
      },
      {
        title: 'Plan tab',
        lines: [
          'Changed Suggest to place new members.',
        ],
      },
    ],
  },
  {
    // Further ids for the same day: the batch grew after the first, so the card opens once more.
    id: '2026-11-04-13',
    date: '4 Nov 2026',
    highlights: [
      { title: 'Phone alerts', line: 'Choose what your phone tells you.', icon: 'bell' },
      { title: 'Calendar', line: "See what's coming up.", href: '#/calendar', icon: 'calendar' },
      { title: 'Most upgrades', line: "See who's upgrading the most.", href: '#/log', icon: 'hero' },
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
          'Removed your status row.',
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
          'Changed Trends to monthly points.',
          'Changed rankings to the top 10 and you.',
          'Added i buttons to explain the numbers.',
          'Added upgrade cards by category.',
          'Moved Donations and Capital to Players.',
          'Moved the tabs around in Stats.',
        ],
      },
      {
        title: 'Log tab',
        lines: [
          'Added each player\'s upgrade history.',
          'Added Since you last looked.',
          'Added Most upgrades to Upgrades.',
          'Changed Log to open on recent days.',
        ],
      },
      {
        title: 'Plan tab',
        lines: [
          'Merged lineups and days into one page.',
          'Added a place picker under each name.',
          'Added an Activity list of plan changes.',
          'Added side-by-side clan comparison.',
          'Changed Publish to send it all at once.',
          'Locked days once their war has started.',
          'Added Not as planned marks.',
          'Changed Suggest to keep your plan.',
          'Added the swaps to make in the game.',
          'Added visitors by region under Usage.',
          'Merged Make room and Inactivity.',
          'Added the day changes to Publish.',
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
          "Changed the card's order and header.",
          'Added each player\'s attack history.',
          'Added a way back to the card.',
          'Added your stars toward 8.',
          'Added the next badge you could earn.',
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
          'Added a monthly Recap to the Log.',
          'Fixed friendlies counting as misses.',
          'Added kind filters to Most upgrades.',
          'Changed New faces to count people once.',
          'Added gold Log rows for milestones.',
          'Added goblins to empty screens.',
          'Changed buttons to two matching sizes.',
          'Moved Stats categories back to chips.',
          'Added a way to undo This is me.',
          'Added the Plan tab for leader sign-in.',
          'Added small animations.',
          'Added swiping between clans and days.',
          'Added a search icon on phones.',
          'Added a first-visit welcome.',
          'Changed clan buttons to stay on screen.',
          'Moved leader sign-in to the footer.',
          'Removed reactions and emojis.',
        ],
      },
    ],
  },
  {
    id: '2026-11-05-b',
    date: '5 Nov 2026',
    highlights: [
      { title: 'See how they got there', line: 'Tap a name on Stats for the breakdown.', href: '#/stats/players/overall', icon: 'hero' },
      { title: 'A better Recap', line: 'Tap an award to open its card.', href: '#/log/recap', icon: 'league' },
      { title: 'Home screen', line: 'See how to add Frosted to your phone.', icon: 'bell' },
    ],
    groups: [
      {
        title: 'Stats tab',
        lines: [
          'Added breakdown cards to Overall.',
          'Added Donations and Capital cards.',
          'Added a card for each Badges row.',
          'Added lifetime war stars to War.',
          'Added a miss rate column to War.',
        ],
      },
      {
        title: 'Log tab',
        lines: [
          'Changed Recap awards to open cards.',
          'Changed the clan race to one table.',
          'Added names to comings and goings.',
          'Added dates to Recap milestones.',
          'Changed upgrade rows to open in place.',
          'Fixed Most upgrades ignoring the kind.',
          'Fixed Recap donations to match game.',
        ],
      },
      {
        title: 'Player cards',
        lines: [
          'Added category chips to upgrade cards.',
          'Changed badges to open the badges card.',
          'Changed Back to keep your place.',
          'Changed long names to fit one line.',
          'Changed all cards to one height.',
          'Removed This is me from the card.',
        ],
      },
      {
        title: 'War tab',
        lines: [
          'Added search to the current war.',
          'Changed the war score wording.',
          'Moved the clan switch beside the days.',
          'Changed the war blast to play less.',
        ],
      },
      {
        title: 'CWL tab',
        lines: [
          'Changed the clan card to be bigger.',
        ],
      },
      {
        title: 'Plan tab',
        lines: [
          'Added search to Who to yeet.',
          'Changed Publish to say why it waits.',
          'Removed the Preview button.',
        ],
      },
      {
        title: 'General',
        lines: [
          'Added a home screen guide.',
          'Added a switch for counting visits.',
          'Changed visitors to leave out bots.',
          'Moved the privacy note behind an i.',
          'Changed the score explainer to maths.',
          'Added an explainer to clan cards.',
          'Added what 8 stars earns.',
          'Changed list rows to one height.',
          'Changed labels to match everywhere.',
          'Fixed Back reopening closed cards.',
          'Fixed blank pages after a crash.',
        ],
      },
    ],
  },
  {
    id: '2026-11-07-b',
    date: '7 Nov 2026',
    highlights: [
      { title: 'CWL is now in War', line: 'Roster and Group sit beside the live war.', href: '#/war/roster', icon: 'swords' },
      { title: 'Clan Games points', line: 'Points per member, monthly from now.', href: '#/stats/players/games', icon: 'league' },
      { title: 'Attacks left', line: 'Group shows who still has hits to come.', href: '#/war/group', icon: 'calendar' },
    ],
    groups: [
      {
        title: 'War tab',
        lines: [
          'Moved CWL Lineups here as Roster.',
          'Moved CWL Group here.',
          'Changed clan and day to stay picked.',
          'Added Not in CWL to the day strip.',
          'Added search to Group and War log.',
          'Added attacks left to Group.',
          'Changed CWL open bases to unhit only.',
          'Removed the war MVP.',
        ],
      },
      {
        title: 'Stats tab',
        lines: [
          'Added Clan Games rankings.',
          'Added a Score column to War.',
          'Changed rates to need 10 attacks.',
          'Renamed two History headings.',
        ],
      },
      {
        title: 'General',
        lines: [
          'Removed the CWL tab.',
          'Moved Calendar to the tab bar.',
        ],
      },
    ],
  },
]

export const LATEST = UPDATES[UPDATES.length - 1]
export const EARLIER = UPDATES.slice(0, -1).reverse()
