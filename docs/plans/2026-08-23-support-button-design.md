# In-App Support Button Design

**Date:** 2026-08-23

## Goal

Give signed-in DuoRally users a clear way to submit a support question from inside the app. The message is sent server-side from `xpandedge@gmail.com` to `sanju36@gmail.com`; the destination address is never rendered in client code.

## Chosen Approach

Add a Support entry to the existing signed-in navigation and a support form on `/help`. The form submits to a Next.js server action. The action verifies the current Firebase session, validates subject and message length, applies a Firestore-backed per-user rate limit, and sends an email using Gmail SMTP through Nodemailer.

The SMTP account and app password are runtime secrets (`SUPPORT_SMTP_USER` and `SUPPORT_SMTP_APP_PASSWORD`). The recipient remains a server-only constant. The user's account email is placed in `Reply-To`, while the message body includes their display name and UID for support context.

## Alternatives Considered

1. **Gmail SMTP through the existing Vercel server action (chosen):** no new paid vendor, keeps the recipient and credentials server-side, and fits the current Next.js deployment. Requires a Gmail app password in Vercel environment variables.
2. **Transactional email provider:** cleaner operationally, but adds another account, API key, and provider dependency for a small support workflow.
3. **`mailto:` link:** free and simple, but exposes the recipient address and depends on the user's mail client; it is not a reliable submission flow.

## User Experience

- Support is available to signed-in users through the bottom navigation and the Help page.
- The form asks for a short subject and a message.
- On success it clears the form and shows a confirmation.
- On failure it shows an actionable error without exposing SMTP details.
- A hidden honeypot field silently drops obvious bots; repeated submissions are rate limited.

## Security and Privacy

- The server action uses `requireSession`; client-supplied identity fields are ignored.
- The destination email and SMTP credentials are server-only.
- Input is trimmed and bounded before being put into the email.
- `Reply-To` is taken from the verified session email only when present.
- No support message is written to the public client-readable Firestore collections.

## Verification

- Unit-test validation, rate-limit handling, and successful transport invocation with mocked dependencies.
- Run web typecheck and web unit tests.
- Configure Vercel production secrets before relying on the live button:
  `SUPPORT_SMTP_USER` and `SUPPORT_SMTP_APP_PASSWORD`.
