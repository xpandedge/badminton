# Social Doubles Mixer Rotation Design

## Context

DuoRally is solving a social-session problem, not a tournament-bracket problem. A squad turns up with mixed ability and limited courts. The app should give everyone a good night by sharing court time fairly while helping players meet a wider mix of partners and opponents.

This design restarts the rotation conversation around the main product mode: **Social Doubles Mixer**. Singles is out of scope for now. Fixed Pair Round Robin remains a separate tournament-style format and should not be the default mental model for social play.

## Worldwide Patterns Considered

Common racquet-sport formats fall into a few families:

- Round robin: clear and complete, but less flexible when players arrive late or games finish unevenly.
- Americano-style doubles: rotating partners, individual scoring, and high social variety.
- Mexicano-style doubles: rotating partners with future games influenced by standings, better for competitive nights.
- King or Queen of Court: fast and fun, but winners get more continuity and court-time fairness can drift.
- Club mix-in or pegboard: pragmatic social play where fairness and variety matter more than a perfect pre-planned draw.

References used for the pattern scan:

- USA Pickleball approved tournament formats: https://usapickleball.org/sanctioning/formats/
- USTA round-robin guidance: https://customercare.usta.com/hc/en-us/articles/39761800000404-Round-Robin-Format
- Padeli social padel formats: https://padeli.com/get-started/formats/
- Padelturn Americano and Mexicano format notes: https://padelturn.com/en/padel/formats

## Product Decision

Social Doubles Mixer should stay as **continuous live rotation**:

- one court finishes;
- DuoRally immediately fills that court when possible;
- completed and visible live games are not disturbed;
- late arrivals, people leaving, and uneven game lengths are handled naturally.

This is more realistic for casual play than a pre-planned full-night schedule.

## Priority Model

The scheduler should be **fairness-always, variety-first once repetition appears, balance-second**.

The practical priority order is:

1. Keep court time roughly equal.
2. Avoid back-to-back sit-outs.
3. Avoid repeated partners wherever possible.
4. Prefer different opponents.
5. If a fully fresh opponent set is not possible, make sure at least one opponent changes where possible.
6. Avoid repeating the same foursome.
7. Keep teams reasonably balanced by skill or squad rating.
8. Use "play about two games, then rest" only as a soft rhythm.

The important nuance is that sit-out fairness and variety are close peers. Early in a session, court-time fairness should lead because there is little repetition history. Later, when partner/opponent repetition starts to build, variety can temporarily outrank strict sit-out rhythm if the game-count difference remains acceptable.

## Scheduling Model

The engine should evaluate candidate games, not just candidate players.

For each refill opportunity:

1. Build a candidate set of players who can play now.
2. Build allowed sit-out choices from the existing fairness rules.
3. Generate possible lineups for the freed court or courts.
4. Score each possible team split using a social freshness score.
5. Pick the lowest-scoring option deterministically.
6. Persist the chosen match and update the fairness history.

The social freshness score should be tiered so important social rules cannot be drowned out by small rating differences:

- repeated partner: very high penalty;
- same partner as the last game: even higher penalty;
- repeated opponent: medium penalty;
- no opponent changes compared with a player's recent opponent set: high penalty;
- repeated foursome: medium-high penalty;
- rating or skill gap: lower penalty;
- sit-out fairness relaxation: allowed only when repetition pressure is high and game-count spread stays small.

## Exact-Capacity Reality

If `players === courts * 4`, there is no bench. Under continuous live rotation, when one court finishes the only idle players are the four who just played on that court. If DuoRally must immediately fill that court, those same four must play again. No algorithm can create cross-court variety without either waiting or changing the court usage.

The app should explain this to organisers instead of pretending the scheduler can solve it. For exact-capacity sessions, show guidance such as:

> Everyone will get maximum court time, but groups may repeat. Add a spare player or use fewer courts if you want more mixing.

Do not hold courts empty by default. An explicit "more mixing, less court usage" setting can be considered later.

## UX

Rename the default social format in the session setup and live console from "social rotation" to **Social Doubles Mixer**. The UI should describe outcomes, not algorithm internals:

- "Mix partners and opponents"
- "Share court time fairly"
- "Keep games balanced"

Avoid exposing weights, penalty names, or scheduler jargon to players.

When the organiser is near exact capacity, give a short inline warning and one-step options:

- add another player;
- reduce active courts;
- continue with maximum court use.

## Data And Compatibility

Keep the stored session format value as `social_rotation` for backward compatibility unless there is a later migration. Treat "Social Doubles Mixer" as the player-facing label.

The match engine remains pure TypeScript with no Firebase or I/O. Server actions continue to own persistence. Existing sessions should continue to run.

## Out Of Scope

- Singles rotation.
- Americano, Mexicano, King of Court, or ladder formats.
- Mixed-gender balancing rules.
- Holding courts empty by default.
- Rewriting completed matches or historical scores.

## Acceptance Criteria

- Social sessions reduce repeated partners materially in ordinary benched sessions.
- Opponent variety improves, and when a fully fresh opponent set is impossible at least one opponent changes where possible.
- No player gets avoidable back-to-back sit-outs.
- Game-count and sit-out-count spread remain small.
- Skill or squad-rating balance is still considered after fairness and freshness.
- Exact-capacity sessions explain why variety is limited.
- Existing Fixed Pair Round Robin behavior is not regressed.
