# Dashboard Create Action Contrast Design

## Goal

Make the dashboard's `Create` squad action clearly visible against the pale surface while preserving its existing destination and compact layout.

## Design

The action remains a text-plus-background link to `/groups`, but uses a dark ink foreground with a light volt-tinted background and a visible border. The hover state increases the tint slightly, and the focus-visible state uses the existing volt focus treatment so keyboard users can identify the action. No create logic, routes, or data behavior changes.

## Verification

Run the web typecheck and focused test suite. Confirm the dashboard still renders the same link and that the working tree contains only the intended style and design-document changes.
