# Two-Game Rhythm Scheduler Design

## Goal

Make the default live-session scheduler feel more natural by preferring a "play about two games, then rest" rhythm, while keeping fairness rules in charge.

## Approved Behavior

- The rule is soft. It applies by default, but it gives way when sit-out fairness or catch-up fairness says someone else should play.
- A player who just sat out should still be strongly protected from sitting again.
- A player who is behind on games should not be rested only because they have a recent play streak.
- When players are otherwise similar, someone who has played two or more consecutive scheduled games is a better sit-out candidate than someone who has played zero or one.
- Do not add minutes-played tracking. Game duration is too variable and score-entry timing is not a reliable enough data source for this change.

## Architecture

Track a lightweight `playStreak` in the pure match engine state. `recordMatch` increments a player's streak, and `recordSitOut` resets it to zero. The sit-out selector keeps the existing ordering layers, then uses `playStreak` as the final scheduler preference before deterministic ordering.

The web app persists engine state in Firestore, so the server serializer/deserializer needs to include `playStreak`. Existing sessions without this field should default missing streak values to zero.

## Testing

Add match-engine tests that prove:

- playing increments `playStreak`;
- sitting resets `playStreak`;
- equal-fairness candidates with a two-game streak sit before lower-streak candidates;
- games-played fairness still beats rhythm, so lagging players stay protected.
