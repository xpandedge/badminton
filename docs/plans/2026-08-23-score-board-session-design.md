# Score Board Session Design

## Goal

Make the public score-link board feel like the authenticated session console while keeping the public player experience simpler and preserving all existing board behavior.

## Design

The board keeps its public-safe data source, polling, local player picker, personalized state, court list, bench message, and leaderboard data. Its presentation adopts the session language: a dark patterned hero with a clear sport/session/status hierarchy, a consistent constrained content column, stronger live court cards, and a dense leaderboard panel with visible rank, player, wins, and point-difference/game columns. Completed-session messaging remains prominent but calm.

No scoring, polling, permissions, or Firestore behavior changes. The work is limited to the board page's React markup and visual styles.

## Verification

Run the web typecheck and tests, then build the web app so the public route is checked by Next.js. Review mobile and desktop layouts for clipped headings, overflowing player names, and stable leaderboard columns.
