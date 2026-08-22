# Dynamic Casual Capacity Design

## Goal

Remove fixed casual confirmed slots from the RSVP experience. Casual players should fill whichever places are left after regular players who are coming are counted.

## Behaviour

- Admin configures total player capacity.
- Regulars are in by default unless they RSVP away.
- Casual confirmations are calculated as `total capacity - regulars in`.
- If 6 regulars are coming and capacity is 11, 5 casuals are confirmed.
- Extra casuals stay on the waiting list when waiting list is enabled.
- The existing stored `casualConfirmedSlots` field remains for backward compatibility, but it no longer controls bucket calculation or appears in admin forms.

## UI

- Squad default RSVP settings show `Total player capacity`, `RSVP cutoff hours`, and waiting list.
- Session RSVP settings show `Total player capacity`, `RSVP cutoff`, and waiting list.
- Public RSVP stats no longer show `Casual slots`; they show `Open spots`.
