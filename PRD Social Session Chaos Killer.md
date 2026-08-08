# PRD: Social Session Chaos Killer

## Badminton / Pickleball Social Session Management App

## 1. Product Summary

Build a mobile-first PWA that helps badminton and pickleball organisers run casual social sessions with minimal administration.

The app should allow an organiser to create a social play session, add players, define courts and session duration, automatically generate fair doubles games, track scores, handle late arrivals/leavers, and rebalance future games without disrupting completed or in-progress matches.

This is not a full tournament platform in v1. The first version should focus on solving the real-world chaos of social sessions:

* Who plays next?
* Which court?
* Who is sitting out?
* Has everyone played fairly?
* What happens when someone leaves or arrives late?
* How do we avoid the organiser manually doing maths on WhatsApp like it is 2008?

## 2. UI/UX Direction
Fetch this design file, read its readme, and implement the relevant aspects of the design. https://api.anthropic.com/v1/design/h/2oZ-YEL7OVyAtRf-7i65Og?open_file=ui_kits%2Fapp%2Findex.html
Implement: ui_kits/app/index.html

## 3. Product Vision

Create the easiest mobile-first tool for running fair, fun, low-admin social badminton and pickleball sessions.

The app should feel like an organiser assistant, not a spreadsheet.

Core product promise:

> Create a session, add players, generate fair games, track scores, and rebalance chaos in seconds.

## 4. Product Positioning

The initial product is not:

* a full tournament management platform
* a league management platform
* a payment platform
* a merch store
* a native mobile app
* an advanced AI coaching platform

The initial product is:

> A social session chaos killer for organisers who want fair rotations and less admin.

## 5. Target Users

### Primary User: Social Session Organiser

A person who coordinates casual badminton or pickleball groups, usually through WhatsApp, Messenger, spreadsheets, or memory.

They need:

* fast session creation
* simple player management
* fair game generation
* manual override
* score tracking
* live session clarity
* low cognitive load during play

### Secondary User: Player

A participant who wants to know:

* whether they are playing now
* which court they are on
* who their partner is
* who their opponents are
* whether they are waiting
* their result history
* their session ranking

### Future User: Club Admin

A person managing recurring club nights, attendance, player grades, long-term ratings, ladders, and paid events.

This user is not the primary v1 target.

## 6. Product Goals

The MVP should allow an organiser to:

1. Sign in.
2. Create a group.
3. Add players.
4. Create a social session.
5. Define venue and courts.
6. Generate fair doubles matchups.
7. Track current and upcoming games.
8. Enter scores.
9. See a live leaderboard.
10. Add or remove players mid-session.
11. Rebalance only future rounds.
12. Preserve completed and in-progress matches.
13. Let players see their own current/next match.

## 7. Success Metrics

### MVP Success

The MVP is successful if a real organiser can run a casual session with minimal help.

Suggested success metrics:

* Session created in under 2 minutes.
* 8+ players can be added quickly.
* Valid doubles games are generated.
* No player is unfairly overplayed where avoidable.
* Completed games are never lost during rebalancing.
* Players can see their next match without asking the organiser.
* Organiser can remove or add a player mid-session and continue.
* A real session can be run from a mobile browser.

### Product Metrics

Track:

* number of sessions created
* number of players per session
* number of generated schedules
* number of rebalances per session
* score entry completion rate
* session completion rate
* average games per player
* fairness score distribution
* returning organisers
* returning players

## 8. Scope

## 8.1 In Scope for MVP

* Firebase Authentication
* Google sign-in
* Email sign-in
* User profile
* Create/manage groups
* Add players manually
* Guest/manual players
* Basic player skill level
* Create session
* Define sport: badminton or pickleball
* Define venue
* Define number of courts
* Define session duration
* Define estimated game duration
* Generate doubles matchups
* Fair rotation logic
* Avoid repeated partners where possible
* Avoid repeated opponents where possible
* Sit-out management
* Manual organiser override
* Score entry
* Session leaderboard
* Player game history within session
* Rebalance future rounds
* Preserve completed/current matches
* Player next-match view
* Share/join link
* Basic role-based access
* Realtime updates or polling fallback
* PWA/mobile browser support
* Audit logs for critical changes

## 8.2 Out of Scope for MVP

* Native iOS app
* Native Android app
* Knockout tournaments
* Swiss tournaments
* Ladder competitions
* Pool + finals
* Full league management
* Payments
* Merch
* AI-generated schedules as source of truth
* Advanced AI player grading
* Public club discovery
* Club subscriptions
* Complex gender/age/division rules
* Deep analytics
* Video highlights
* Umpire workflow
* Push notification polish

## 9. Recommended Technical Stack

## 9.1 v1 Stack: Firebase First

Use Firebase for v1.

### Frontend

* Next.js
* TypeScript
* PWA-first
* Mobile-first browser experience
* UI/UX based on provided HTML

### Authentication

* Firebase Authentication
* Google sign-in
* Email/password or email link sign-in

Optional later:

* Apple sign-in
* Phone sign-in, only if SMS cost is acceptable

### Database

* Cloud Firestore

Firestore should be used intentionally as a document database. Denormalisation is acceptable and expected.

### Backend Logic

* Firebase Cloud Functions

Use Cloud Functions for:

* match generation
* session rebalancing
* score validation
* leaderboard updates
* audit logging
* future AI features

### Hosting

Preferred options:

1. Firebase Hosting
2. Vercel

Firebase Hosting is preferred if keeping the entire v1 stack inside Firebase.

Vercel is acceptable if the coding agent prefers the Next.js deployment flow.

### Analytics

* Firebase Analytics or basic custom event logging

### Future AI Layer

* Server-side AI integration only
* Never expose AI provider keys to the frontend

## 9.2 Why Firebase First

Firebase is the right v1 choice because:

1. Fast to build.
2. Built-in authentication.
3. Firestore realtime updates are excellent for live session state.
4. Minimal infra overhead.
5. Works well for mobile-first apps.
6. Good enough for MVP scale.
7. Easier for an AI coding agent to implement quickly.
8. Postgres migration can happen later if the product proves itself.

The MVP should validate product behaviour, not win an architecture beauty pageant.

## 9.3 Future Migration to Postgres

Postgres may be considered later if the app needs:

* advanced reporting
* long-term player ratings
* relational analytics
* complex leaderboards
* club subscriptions
* financial transactions
* multi-season tournaments
* cross-club ranking
* better querying across historical sessions

Do not optimise too early for Postgres, but avoid making migration impossible.

Keep business logic in service layers rather than directly inside React components.

## 10. Key Product Concepts

### Group

A reusable collection of players managed by one or more organisers.

Examples:

* Saturday Smash Crew
* Office Pickleball
* JS Sports Badminton
* Sunday Social Doubles

### Player

A person who participates in games.

A player may be:

* linked to a Firebase authenticated user
* a manually created guest
* a lightweight participant created by an organiser

### Session

A specific play event at a venue with players, courts, duration, rounds, matches, scores, and leaderboard.

### Round

A batch of matches that happen at roughly the same time.

Example:

If there are 3 courts, one round may contain 3 doubles matches involving 12 players.

### Match

A single game on a court.

MVP supports doubles:

* Team A: 2 players
* Team B: 2 players

### Sit-Out

A player who does not play in a specific round because there are more players than available court spots or player count is not divisible by 4.

### Locked Match

A completed or in-progress match that should not be modified by automatic regeneration.

## 11. User Roles

### Owner

Can:

* create group
* manage group
* add/remove organisers
* add/remove players
* create/edit/delete sessions
* generate/rebalance matches
* enter/edit scores
* complete/cancel session

### Organiser

Can:

* create sessions
* manage session players
* generate/rebalance matches
* enter/edit scores
* mark players unavailable
* advance rounds

### Player

Can:

* join session
* view own matches
* view leaderboard
* view results

Optional later:

* submit score for organiser approval

### Guest

Can:

* be added by organiser
* join via link with lightweight details
* view limited session information

## 12. MVP User Stories and Acceptance Criteria

## 12.1 Authentication

As a user, I can sign in using Google or email so that my groups and sessions are saved.

Acceptance criteria:

* User can sign in with Google.
* User can sign in with email.
* User has a profile document.
* User can sign out.
* Unauthenticated users cannot create groups or sessions.
* Invite links can be opened before sign-in, but joining should require sign-in or lightweight guest flow.

## 12.2 Create Group

As an organiser, I can create a group so that I can reuse players across sessions.

Acceptance criteria:

* User can create a group with name and optional description.
* Creator becomes group owner.
* Owner can add other organisers.
* Owner can add players.
* Group players can be reused in sessions.

## 12.3 Add Players

As an organiser, I can add players manually.

Acceptance criteria:

* Add player by name.
* Optional email.
* Optional phone.
* Optional skill level.
* Player can exist without a Firebase user account.
* Duplicate warning should appear for similar name or same email within a group.

Skill levels:

* unknown
* beginner
* intermediate
* advanced

## 12.4 Create Session

As an organiser, I can create a social session quickly.

Required fields:

* session name
* sport: badminton or pickleball
* group
* venue
* number of courts
* start date/time
* session duration
* estimated game duration
* scoring mode

Scoring modes:

* winner only
* points

Acceptance criteria:

* Session can be created in under 2 minutes.
* Reasonable defaults are used.
* Session can be edited before start.
* Session can be started by organiser.

## 12.5 Join Link

As an organiser, I can share a session join link.

Acceptance criteria:

* Session has a unique join code or join URL.
* Player can open join link.
* Player can register interest.
* Organiser can approve/remove joined player.
* Joined player appears in session player list.
* Late joiners can be added to future rounds.

## 12.6 Generate Matchups

As an organiser, I can generate fair doubles matchups.

Acceptance criteria:

* Generate rounds based on:

  * players
  * courts
  * session duration
  * estimated game duration
* Each match has:

  * round number
  * court
  * team A
  * team B
  * status
* Algorithm tries to:

  * equalise games played
  * distribute sit-outs fairly
  * avoid repeat partners
  * avoid repeat opponents
  * balance skill if skill data exists
* If perfect fairness is impossible, generate the best available schedule.
* Save generation metadata.

## 12.7 Start Session

As an organiser, I can start a session.

Acceptance criteria:

* Session moves from draft/scheduled to active.
* First round becomes current.
* Matches can be marked in progress.
* Scores can be entered.
* Completed matches become locked.
* Next round becomes visible when advanced.

## 12.8 Player View

As a player, I can see my current and upcoming match.

Acceptance criteria:

* Player can see:

  * current match
  * next match
  * court
  * partner
  * opponents
  * waiting status
  * completed results
* Player does not need organiser permissions.
* Player view updates when organiser changes future rounds.

## 12.9 Score Entry

As an organiser, I can enter scores.

Acceptance criteria:

* Organiser can enter Team A score and Team B score.
* Winner is calculated.
* Score can be edited by organiser.
* Score edit creates audit log.
* Completed match updates leaderboard.
* Completed match updates session player stats.
* Completed match is locked.

## 12.10 Manual Override

As an organiser, I can manually change future matches.

Acceptance criteria:

* Organiser can swap players in future matches.
* Organiser can move match to another court.
* Organiser can mark player as unavailable.
* Completed matches cannot be changed unless explicitly unlocked.
* Manual changes are logged.

## 12.11 Rebalance Future Rounds

As an organiser, I can regenerate future rounds after changes.

Acceptance criteria:

* Completed matches remain unchanged.
* In-progress matches remain unchanged by default.
* Future matches are regenerated.
* Late players are included from next available round.
* Removed/unavailable players are excluded from future rounds.
* Player game counts remain as balanced as reasonably possible.
* Rebalance summary is generated.

Example rebalance summary:

“Future rounds regenerated. 2 completed matches preserved. 1 current match preserved. Ravi removed from future rounds. Anita added from Round 4. Expected games per active player: 3–4.”

## 12.12 Leaderboard

As a player or organiser, I can see live session standings.

Acceptance criteria:

* Leaderboard shows:

  * player
  * games played
  * wins
  * losses
  * points for
  * points against
  * point difference
  * sit-out count
* Sorting defaults to:

  * wins
  * point difference
  * games played
* Leaderboard is session-specific for MVP.

## 13. Session State Model

Session statuses:

```text
draft
scheduled
active
paused
completed
cancelled
```

Match statuses:

```text
scheduled
in_progress
completed
cancelled
```

Player session statuses:

```text
invited
registered
checked_in
active
waiting
left
removed
no_show
```

Rules:

* Draft sessions can be fully edited.
* Active sessions can regenerate only future rounds.
* Completed matches are locked.
* Cancelled matches do not count toward stats.
* Players marked `left`, `removed`, or `no_show` should not be scheduled into future rounds.

## 14. Match Generation Algorithm

## 14.1 Algorithm Type

Use a deterministic scoring/constraint algorithm.

Do not use an LLM as the source of truth for schedule generation.

AI may later explain, tune, or suggest improvements, but the core generator must be:

* predictable
* testable
* reproducible
* database-agnostic

## 14.2 Inputs

* session ID
* active player list
* courts
* existing locked matches
* estimated game duration
* remaining session time
* player skill levels
* existing partner/opponent history within session
* manual organiser constraints

## 14.3 Outputs

* rounds
* matches
* court assignments
* sit-out list per round
* fairness summary
* generation metadata

## 14.4 Round Calculation

```text
estimated_rounds = floor(session_duration_minutes / estimated_game_duration_minutes)

max_matches_per_round = number_of_courts

players_per_match = 4

max_players_per_round = max_matches_per_round * 4
```

Rules:

* If active players are fewer than 4, do not generate matches.
* If players are not divisible by 4, assign sit-outs fairly.
* If players exceed court capacity, assign sit-outs fairly.
* If there are more courts than needed, use only the required courts.

## 14.5 Fairness Objectives

Optimise for:

1. Equal number of games per player.
2. Equal number of sit-outs per player.
3. Avoid repeat partners.
4. Avoid repeat opponents.
5. Avoid immediate back-to-back repeated pairings.
6. Balance team skill where possible.
7. Keep court utilisation high.
8. Preserve locked matches.

## 14.6 Penalty Model

For each candidate match, calculate a penalty score.

Lower score is better.

Suggested penalty model:

```text
total_penalty =
  games_played_imbalance_penalty
+ sit_out_imbalance_penalty
+ repeat_partner_penalty
+ repeat_opponent_penalty
+ recent_partner_penalty
+ recent_opponent_penalty
+ team_skill_gap_penalty
+ player_overuse_penalty
+ manual_constraint_penalty
```

## 14.7 Skill Mapping

MVP skill levels:

```text
unknown
beginner
intermediate
advanced
```

Map to numeric values:

```text
unknown = 2
beginner = 1
intermediate = 2
advanced = 3
```

For doubles balance:

```text
team_skill = player_1_skill + player_2_skill
skill_gap = abs(team_a_skill - team_b_skill)
```

Skill balance should be a soft constraint.

## 14.8 Generation Metadata

Store metadata for each generation run:

```json
{
  "algorithmVersion": "v1",
  "generatedAt": "timestamp",
  "playersCount": 18,
  "courtsCount": 3,
  "roundsGenerated": 5,
  "fairnessScore": 0.82,
  "minGamesPerPlayer": 3,
  "maxGamesPerPlayer": 4,
  "notes": [
    "Two players will sit out twice because player count exceeds court capacity.",
    "Repeated opponents could not be fully avoided."
  ]
}
```

## 14.9 Regeneration Rules

When regenerating:

1. Fetch all completed matches.
2. Fetch current in-progress matches.
3. Treat those matches as locked.
4. Calculate player stats from locked matches.
5. Delete or archive unlocked future matches.
6. Generate only remaining future rounds.
7. Insert new future matches.
8. Write generation run.
9. Write audit log.
10. Return rebalance summary.

## 15. Firestore Data Model

Use this Firestore structure for v1:

```text
/users/{userId}

/groups/{groupId}

/groups/{groupId}/members/{memberId}

/groups/{groupId}/players/{playerId}

/groups/{groupId}/venues/{venueId}

/groups/{groupId}/venues/{venueId}/courts/{courtId}

/sessions/{sessionId}

/sessions/{sessionId}/players/{sessionPlayerId}

/sessions/{sessionId}/rounds/{roundId}

/sessions/{sessionId}/rounds/{roundId}/matches/{matchId}

/sessions/{sessionId}/sitOuts/{sitOutId}

/sessions/{sessionId}/generationRuns/{generationRunId}

/sessions/{sessionId}/auditLogs/{auditLogId}

/sessions/{sessionId}/leaderboard/{playerId}
```

## 15.1 users/{userId}

```json
{
  "displayName": "string",
  "email": "string",
  "photoURL": "string",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

## 15.2 groups/{groupId}

```json
{
  "name": "Saturday Smash Crew",
  "description": "Social badminton group",
  "createdBy": "userId",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

## 15.3 groups/{groupId}/members/{memberId}

```json
{
  "userId": "userId",
  "role": "owner | organiser | member",
  "createdAt": "timestamp"
}
```

## 15.4 groups/{groupId}/players/{playerId}

```json
{
  "userId": "userId or null",
  "displayName": "string",
  "email": "string or null",
  "phone": "string or null",
  "skillLevel": "unknown | beginner | intermediate | advanced",
  "isGuest": true,
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

## 15.5 groups/{groupId}/venues/{venueId}

```json
{
  "name": "string",
  "address": "string or null",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

## 15.6 groups/{groupId}/venues/{venueId}/courts/{courtId}

```json
{
  "name": "Court 1",
  "courtNumber": 1,
  "isActive": true,
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

## 15.7 sessions/{sessionId}

```json
{
  "groupId": "groupId",
  "venueId": "venueId",
  "name": "Friday Social Doubles",
  "sport": "badminton | pickleball",
  "status": "draft | scheduled | active | paused | completed | cancelled",
  "startsAt": "timestamp",
  "durationMinutes": 120,
  "estimatedGameMinutes": 15,
  "numberOfCourts": 3,
  "scoringMode": "winner_only | points",
  "createdBy": "userId",
  "currentRoundNumber": 1,
  "joinCode": "short-code",
  "joinEnabled": true,
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

## 15.8 sessions/{sessionId}/players/{sessionPlayerId}

```json
{
  "playerId": "playerId",
  "displayName": "cached display name",
  "skillLevel": "unknown | beginner | intermediate | advanced",
  "status": "invited | registered | checked_in | active | waiting | left | removed | no_show",
  "gamesPlayed": 0,
  "wins": 0,
  "losses": 0,
  "pointsFor": 0,
  "pointsAgainst": 0,
  "sitOutCount": 0,
  "joinedAt": "timestamp",
  "leftAt": "timestamp or null",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

Important:

Cache display name and skill level in the session player document so the live session does not need repeated lookups into group players.

## 15.9 sessions/{sessionId}/rounds/{roundId}

```json
{
  "roundNumber": 1,
  "status": "scheduled | in_progress | completed | cancelled",
  "startsAt": "timestamp or null",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

## 15.10 sessions/{sessionId}/rounds/{roundId}/matches/{matchId}

```json
{
  "sessionId": "sessionId",
  "roundId": "roundId",
  "roundNumber": 1,
  "courtId": "courtId",
  "courtName": "Court 1",
  "matchNumber": 1,
  "status": "scheduled | in_progress | completed | cancelled",
  "isLocked": false,
  "teamA": [
    {
      "playerId": "playerId",
      "displayName": "string",
      "skillLevel": "intermediate"
    }
  ],
  "teamB": [
    {
      "playerId": "playerId",
      "displayName": "string",
      "skillLevel": "beginner"
    }
  ],
  "teamAScore": null,
  "teamBScore": null,
  "winnerTeam": null,
  "startedAt": null,
  "completedAt": null,
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

For Firestore v1, storing `teamA` and `teamB` as embedded arrays is acceptable.

## 15.11 sessions/{sessionId}/sitOuts/{sitOutId}

```json
{
  "roundId": "roundId",
  "roundNumber": 1,
  "playerId": "playerId",
  "displayName": "string",
  "reason": "rotation | unavailable | overflow",
  "createdAt": "timestamp"
}
```

## 15.12 sessions/{sessionId}/generationRuns/{generationRunId}

```json
{
  "trigger": "initial | manual_rebalance | player_added | player_removed | settings_changed",
  "algorithmVersion": "v1",
  "createdBy": "userId",
  "metadata": {
    "playersCount": 18,
    "courtsCount": 3,
    "roundsGenerated": 5,
    "fairnessScore": 0.82,
    "minGamesPerPlayer": 3,
    "maxGamesPerPlayer": 4,
    "notes": [
      "Repeated opponents could not be fully avoided."
    ]
  },
  "createdAt": "timestamp"
}
```

## 15.13 sessions/{sessionId}/leaderboard/{playerId}

```json
{
  "playerId": "playerId",
  "displayName": "string",
  "gamesPlayed": 4,
  "wins": 3,
  "losses": 1,
  "pointsFor": 82,
  "pointsAgainst": 65,
  "pointDifference": 17,
  "sitOutCount": 1,
  "updatedAt": "timestamp"
}
```

Leaderboard should be denormalised to avoid recalculating it from raw matches on every page load.

## 15.14 sessions/{sessionId}/auditLogs/{auditLogId}

```json
{
  "entityType": "match | session | player | score | generation",
  "entityId": "string",
  "action": "created | updated | deleted | score_changed | rebalanced | locked | unlocked",
  "oldValue": {},
  "newValue": {},
  "createdBy": "userId",
  "createdAt": "timestamp"
}
```

## 16. Firebase Cloud Functions

Use Cloud Functions for critical backend operations.

## 16.1 generateSchedule

```text
generateSchedule(sessionId)
```

Responsibilities:

* Validate organiser permission.
* Load session.
* Load active session players.
* Load courts.
* Generate rounds and matches.
* Write rounds.
* Write matches.
* Write sit-outs.
* Write generation run metadata.
* Initialise leaderboard records if required.
* Return generation summary.

## 16.2 rebalanceSession

```text
rebalanceSession(sessionId, reason)
```

Responsibilities:

* Validate organiser permission.
* Preserve completed matches.
* Preserve in-progress matches by default.
* Delete or archive unlocked future matches.
* Recalculate player stats from locked matches.
* Generate future rounds only.
* Write generation run.
* Write audit log.
* Return rebalance summary.

## 16.3 submitScore

```text
submitScore(sessionId, roundId, matchId, teamAScore, teamBScore)
```

Responsibilities:

* Validate organiser permission.
* Validate match exists.
* Validate score values.
* Calculate winner.
* Mark match as completed.
* Lock match.
* Update leaderboard documents.
* Update session player stats.
* Write audit log.

## 16.4 updatePlayerStatus

```text
updatePlayerStatus(sessionId, sessionPlayerId, status)
```

Responsibilities:

* Validate organiser permission.
* Mark player as active, waiting, left, removed, or no-show.
* If session is active, allow organiser to trigger rebalance.

## 16.5 advanceRound

```text
advanceRound(sessionId)
```

Responsibilities:

* Validate organiser permission.
* Complete or close current round if appropriate.
* Move next scheduled round to current/in-progress.
* Update session current round number.
* Write audit log.

## 17. Frontend Service Layer

Avoid scattering Firestore calls throughout UI components.

Use service files like:

```text
/src/lib/firebase
/src/lib/auth
/src/lib/groups
/src/lib/players
/src/lib/sessions
/src/lib/match-generation
/src/lib/leaderboard
/src/lib/audit
/src/functions
```

Create service functions:

```text
createGroup()
addPlayerToGroup()
createSession()
addPlayerToSession()
generateSessionSchedule()
rebalanceSession()
submitMatchScore()
updatePlayerStatus()
getSessionLeaderboard()
watchSession()
watchCurrentRound()
watchPlayerMatches()
```

This keeps the app easier to test and easier to migrate later.

## 18. Realtime Requirements

The app should update session state without requiring full page refresh.

Realtime updates required for:

* player added
* player removed
* player status changed
* match generated
* match started
* score updated
* match completed
* round advanced
* future rounds regenerated
* leaderboard updated

Use Firestore realtime listeners.

Minimum fallback:

* Poll every 10–15 seconds if listener fails.

## 19. Security Rules Requirements

Security rules should enforce:

1. Signed-in users can read their own profile.
2. Group members can read group data.
3. Only owners/organisers can create or edit sessions.
4. Only owners/organisers can generate or rebalance sessions.
5. Players can read sessions they are part of.
6. Players can read their own match assignments.
7. Score submission is organiser-only in MVP.
8. Public join links allow limited registration only.
9. Cloud Functions must perform server-side permission checks.
10. Clients must not directly mark arbitrary matches completed unless explicitly allowed.

Important:

Do not rely only on frontend checks. All sensitive operations must be validated server-side.

## 20. Firestore Modelling Principles

## 20.1 Denormalise Intentionally

Firestore does not support relational joins.

Duplicate commonly needed data:

* player display name inside session player
* skill level inside session player
* court name inside match
* player names inside match team arrays
* leaderboard summary as separate documents

This is acceptable for v1.

## 20.2 Keep Live Session Reads Cheap

The live session page should mainly read:

```text
sessions/{sessionId}
sessions/{sessionId}/players
sessions/{sessionId}/rounds
sessions/{sessionId}/rounds/{roundId}/matches
sessions/{sessionId}/leaderboard
```

Avoid repeated reads from global group player records during a live session.

## 20.3 Use Batch Writes and Transactions

Use Firestore batch writes or transactions when:

* generating schedule
* submitting scores
* locking matches
* updating leaderboard
* rebalancing future rounds

## 20.4 Archive vs Delete

For v1:

* It is acceptable to delete unlocked future matches during rebalance.
* Always keep generationRuns and auditLogs.

Later:

* Consider marking superseded matches as cancelled/superseded for debugging.

## 21. AI Roadmap

AI is not required for the first working MVP.

The system should collect enough structured data to support AI later.

## 21.1 AI Principles

* AI should not be the source of truth for match generation.
* AI should not directly modify schedules without organiser confirmation.
* AI calls must happen server-side only.
* AI API keys must never be exposed to frontend.
* AI should explain, suggest, summarise, and assist.

## 21.2 Phase 2 AI Features

### AI Session Doctor

Suggests improvements during a live session.

Example:

“Two players have only played once while most have played three times. Recommend rebalancing next round.”

### AI Schedule Explainer

Explains why a schedule was generated.

Example:

“Round 4 prioritised players who sat out in Round 3 and avoided repeating the Amit/Sarah partnership.”

### AI Player Grading Suggestions

Suggests player skill movement based on:

* win/loss
* score difference
* opponent skill
* partner skill
* consistency over sessions

### AI Match Duration Prediction

Predicts likely match duration based on:

* sport
* scoring mode
* player level
* previous match durations

### AI Social Summary

Generates a fun post-session summary.

Example:

“Closest match: Court 2, 21–20. Biggest comeback: Priya and Daniel. Current streak leader: James.”

### AI Organiser Assistant

Natural language assistant for organisers.

Example prompts:

* “Add Ravi from next round.”
* “Who has played the least?”
* “Make the next round more balanced.”
* “Why is Sarah sitting out again?”
* “Can we finish by 8:30?”

## 22. Analytics Events

Track these events:

```text
user_signed_up
group_created
player_added
session_created
join_link_opened
player_joined_session
schedule_generated
session_started
score_entered
match_completed
round_advanced
rebalance_triggered
session_completed
leaderboard_viewed
```

Track operational metrics:

```text
average_players_per_session
average_courts_per_session
average_rebalances_per_session
percentage_sessions_completed
average_score_entry_time
average_games_per_player
fairness_score_distribution
```

## 23. Edge Cases

Handle these cases:

### Fewer than 4 players

Do not generate matches. Show actionable error.

### Exactly 4 players

Generate one match per round. No sit-outs.

### More courts than needed

Use only required courts.

### Players not divisible by 4

Assign sit-outs fairly.

### Too many players for courts

Rotate sit-outs fairly.

### Player leaves mid-session

Remove from future rounds only.

### Player arrives late

Add to future rounds only.

### Score entered incorrectly

Allow organiser edit with audit log.

### Current match delayed

Organiser can manually advance, pause, or adjust future matches.

### Court unavailable

Organiser can disable court and rebalance future rounds.

### Duplicate player

Warn organiser before adding duplicate.

## 24. Non-Functional Requirements

## 24.1 Performance

* Session dashboard should load in under 2 seconds for normal sessions.
* Match generation should complete in under 5 seconds for up to 40 players and 8 courts.
* Leaderboard update should feel near real-time.
* Player next-match page should be lightweight.

## 24.2 Reliability

* Do not lose scores.
* Do not overwrite completed matches during regeneration.
* Use transactions/batches where needed.
* Store audit logs for critical changes.
* Preserve generation metadata.

## 24.3 Security

* Enforce Firebase security rules.
* Validate organiser permissions in Cloud Functions.
* Do not expose service account credentials.
* Do not expose AI API keys.
* Validate all API inputs server-side.

## 24.4 Privacy

* Store minimal personal data.
* Guest players should not require email/phone.
* Allow organisers to remove players.
* Avoid collecting unnecessary sensitive information.
* Keep children/school scenarios out of MVP unless proper controls are added.

## 24.5 Accessibility

* App should work well on mobile.
* Actions should be clear.
* Avoid relying only on colour to indicate status.
* Text should be readable in a sports venue environment.

## 25. Implementation Plan

## Milestone 1: Project Setup

* Create Next.js TypeScript app.
* Configure Firebase.
* Add Firebase Auth.
* Add Firestore.
* Add Cloud Functions.
* Add protected route handling.
* Import/adapt UI direction from provided HTML.

## Milestone 2: Groups and Players

* Create group documents.
* Add group members.
* Add manual players.
* Add guest players.
* Add skill level.
* Add basic owner/organiser/member roles.

## Milestone 3: Session Creation

* Create session document.
* Add venue and court setup.
* Add session players.
* Add join code/link.
* Add draft/scheduled session states.

## Milestone 4: Match Generator

* Implement deterministic doubles generator.
* Generate rounds.
* Generate matches.
* Generate sit-outs.
* Store generation metadata.
* Add tests for fairness logic.

## Milestone 5: Live Session Management

* Start session.
* Show current/future rounds.
* Enter scores.
* Complete matches.
* Lock completed matches.
* Update leaderboard.

## Milestone 6: Rebalancing

* Add/remove player mid-session.
* Mark player left/no-show.
* Preserve locked matches.
* Regenerate future rounds.
* Store audit log.
* Return rebalance summary.

## Milestone 7: Hardening

* Mobile QA.
* Error handling.
* Security rules testing.
* Cloud Function permission testing.
* Realtime listeners.
* Polling fallback.
* Seed/demo data.
* Deployment.

## 26. Testing Requirements

## 26.1 Unit Tests

Test:

* 4 players, 1 court
* 8 players, 2 courts
* 10 players, 2 courts
* 12 players, 3 courts
* 14 players, 3 courts
* 18 players, 3 courts
* sit-out fairness
* repeat partner avoidance
* repeat opponent avoidance
* skill balancing
* regeneration preserving locked matches
* late player inclusion
* removed player exclusion

## 26.2 Integration Tests

Test:

* create session → add players → generate matches
* start session → enter score → leaderboard updates
* remove player → rebalance → completed matches unchanged
* add late player → rebalance → player appears only in future round
* organiser vs player permissions
* score update creates audit log

## 26.3 Manual Test Scenarios

### Scenario 1

* 12 players
* 3 courts
* 60-minute session
* 15-minute games
* Expected: 4 rounds, no sit-outs

### Scenario 2

* 14 players
* 3 courts
* 60-minute session
* 15-minute games
* Expected: rotating sit-outs

### Scenario 3

* 18 players
* 3 courts
* 90-minute session
* 15-minute games
* Expected: all players get similar game count

### Scenario 4

* 16 players
* 4 courts
* Remove 1 player after Round 1
* Expected: completed round preserved, future rounds regenerated

### Scenario 5

* 9 players
* 2 courts
* Expected: one sit-out per round with fair rotation

## 27. MVP Acceptance Criteria

The MVP is acceptable when:

1. A user can sign in.
2. A user can create a group.
3. A user can add at least 8 players.
4. A user can create a session with 2+ courts.
5. The app can generate valid doubles matches.
6. The schedule avoids obvious unfairness.
7. Scores can be entered.
8. Leaderboard updates after scores.
9. Players can view their own next match.
10. Organiser can remove a player mid-session.
11. Organiser can add a late player mid-session.
12. Organiser can rebalance future rounds.
13. Completed matches are preserved after rebalancing.
14. App works well on mobile browser.
15. Basic realtime updates work or polling fallback exists.
16. Data persists correctly in Firestore.
17. Security rules prevent unauthorised writes.
18. Critical operations are audited.

## 28. Future Roadmap

## Phase 2

* Round robin mode
* King/Queen of the Court
* Recurring sessions
* Player availability
* Waitlist management
* Better ratings
* AI session doctor
* AI summaries
* AI schedule explainer

## Phase 3

* Ladder competitions
* Club rankings
* Paid session registration
* Merch
* Advanced analytics
* Native app wrapper using Capacitor
* Club subscription plans

## Phase 4

* Postgres migration, if justified
* Multi-club support
* Corporate tournament packages
* School/university mode
* White-label club version

## 29. Migration Path to Postgres Later

Do not build Postgres now.

To keep migration manageable:

1. Use stable IDs.
2. Keep clear document boundaries.
3. Store generation metadata.
4. Keep audit logs.
5. Keep service-layer abstractions.
6. Keep match generation database-agnostic.
7. Avoid business logic inside React components.
8. Avoid overly deep Firestore nesting beyond current session use cases.

Potential later mapping:

```text
Firestore users -> Postgres users
groups -> groups
group members -> group_members
players -> players
sessions -> sessions
session players -> session_players
rounds -> rounds
matches -> matches
leaderboard -> derived table or materialised view
auditLogs -> audit_logs
generationRuns -> generation_runs
```

## 30. Definition of Done

A feature is done when:

* It works on mobile and desktop browsers.
* It persists data correctly.
* It has proper error states.
* It respects organiser/player permissions.
* It does not mutate completed matches during rebalance.
* It has basic tests.
* It follows the UI/UX direction from the provided HTML.
* It can be deployed and demoed using seed data.
* A real organiser can run a small session without developer help.

## 31. Build Philosophy

Use Firebase to move fast.

The first technical goal is not perfect architecture.

The first technical goal is:

> Can a real organiser run a messy social session from their phone without losing their mind?

If yes, improve the backend later.

If no, Postgres will not save the product.
