# Session Name Placeholder Design

## Goal

Make organisers enter an intentional session name instead of accidentally creating every session as `Saturday Social`.

## Design

The create-session form starts with an empty name. The input keeps its existing label and required behavior, and adds an example placeholder containing a session name, date, and time: `e.g. Saturday Social · 24 Aug, 6:30 PM`. The server-side minimum-length validation remains unchanged, so the data model, permissions, and stored session names are unaffected.

## Verification

Run the web typecheck and tests, then build the web app. Confirm the input is empty on first render and that the placeholder is visible without becoming submitted data.
