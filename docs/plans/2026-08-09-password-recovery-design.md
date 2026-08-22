# Password Recovery Design

## Goal

Add launch-ready password recovery for DuoRally accounts while preventing Firebase Auth emails from going out under the old PickleBaddies brand.

## Context

The app supports both Google sign-in and email/password sign-in on `/sign-in`. Password recovery is required because users who create or use email/password accounts need a way back in before launch. Google-only users should continue to use Google sign-in and do not need a DuoRally password reset.

The Firebase project is still named around PickleBaddies (`picklebaddies-prod-e727d`). Firebase Auth reset email sender/template branding is controlled in Firebase Auth configuration, not in the Next.js UI. Code can trigger a reset email, but it cannot guarantee the visible sender name, sender domain or template copy without the Firebase Console/DNS setup being completed.

## Recommended Approach

Add an inline "Forgot password?" action to the existing sign-in form.

- It appears only in sign-in mode.
- It uses the email address already entered in the email input.
- If the email field is empty, it prompts the user to enter their email first.
- On success, it displays a neutral confirmation: "If an account exists, Firebase will send a reset link..."
- On failure, it displays the Firebase error message in the same inline error area as sign-in failures.
- It does not appear in register mode.
- It does not change Google sign-in behavior.

This avoids a new route and keeps the launch change narrow.

## Firebase Launch Requirement

Before public launch, Firebase Auth must be configured so password reset emails match DuoRally:

- Authentication email template display name/copy says DuoRally.
- Password reset template links return users to an approved DuoRally domain.
- The sender domain is configured to a DuoRally/Xpandedge controlled domain where Firebase supports it.
- A manual test password reset is sent to a real inbox and verified before launch.

If the sender cannot be fully rebranded in time, email/password sign-in should not be treated as launch-ready.

## Files

- `apps/web/src/lib/auth/sign-in.ts`: expose a password reset helper that wraps Firebase Auth.
- `apps/web/src/app/sign-in/page.tsx`: add the inline reset action, busy state and status copy.
- `docs/superpowers/plans/2026-08-09-password-recovery.md`: implementation checklist.

## Verification

- Run the web typecheck.
- Run the focused web auth tests.
- Manually verify `/sign-in` still supports Google sign-in, email sign-in, registration and reset request UI.
- In Firebase Console, send one reset email after DuoRally branding is configured and confirm the sender/template/link are correct.
