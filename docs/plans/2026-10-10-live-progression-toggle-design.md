# Live Progression Toggle Design

## Goal

Let an organiser correct a mistaken session default while the session is live by switching between manual game starts and automatic court population.

## Approved behavior

The live organiser controls include an organiser-only toggle labelled **Manual game starts**. When enabled, completed courts stop receiving new games automatically; existing scheduled or in-progress games remain unchanged. When disabled, the setting is saved and the existing rebalance path immediately fills eligible empty courts; future completed courts continue to auto-populate.

The setting is available while the session is active or paused. It is not shown as an editable control on completed sessions. Changes are transactionally authorized and written to the session audit log. Completed matches, locked matches, and current assignments are preserved.

## Validation

Verify the server permission/status guard, the toggle copy and visibility, the immediate rebalance call when disabling manual mode, and the clean-main Vercel release.
