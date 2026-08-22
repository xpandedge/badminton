# App Dialogs and Player Names Design

## Goal

Use DuoRally-styled confirmation dialogs throughout the app and let registered players control the name other players see.

## Confirmations

`ConfirmDialog` is the single confirmation surface. It appears as a bottom sheet on mobile and a centred modal on larger screens, traps keyboard focus, closes on Escape or backdrop interaction, and distinguishes normal from destructive actions. The live-session console will replace every remaining browser `confirm()` call with this component and action-specific customer copy.

## Google-Only Signup

Google is the only account-creation route exposed in the MVP. Email/password registration remains implemented for a later release, while the current form is visible only for people with an existing account and for password recovery. New Google accounts begin with Google's display name, and DuoRally never manufactures a player name from the email address.

## Changing a Player Name

The initials avatar in the app header becomes an account button. It opens an in-app **Your player name** sheet asking **What should players call you?**. The server treats this as the player's global DuoRally name and propagates it to Firebase Auth, the user profile, the global player record, squad membership and player records, session rosters, RSVPs, leaderboards, and cached match participant labels. Match scores, outcomes, and other history do not change. Guest names remain controlled by organisers within their session.

## Verification

Focused auth tests cover shared name validation. TypeScript checks protect dialog and account integration, and a production build verifies the complete checkout.
