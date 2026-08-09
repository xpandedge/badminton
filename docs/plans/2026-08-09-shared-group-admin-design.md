# Shared Group Administration Design

## Goal

Let more than one trusted person administer and run a DuoRally group without giving every member operational control. A person may be an admin in any number of groups.

## Role Model

DuoRally uses three user-facing group roles:

| Capability | Owner | Admin | Member |
| --- | --- | --- | --- |
| View group, sessions, games, and results | Yes | Yes | Yes |
| RSVP and enter scores | Yes | Yes | Yes |
| Create and run sessions | Yes | Yes | No |
| Manage session players, courts, and future games | Yes | Yes | No |
| Manage members, guests, venues, invite codes, and join requests | Yes | Yes | No |
| Assign or remove admins | Yes | No | No |
| Transfer ownership or delete the group | Yes | No | No |

Each group keeps exactly one owner and may have multiple admins. Role membership remains stored per group, so the same account can administer multiple groups naturally.

## Compatibility

New admin assignments use the stored value `admin`. Existing Firestore records with the legacy value `organiser` continue to receive admin permissions and display as `Admin`. This avoids a required production migration and allows legacy records to be normalised later.

## Experience

The owner can promote a member to Admin or return an admin to Member from the group member list. Admins can add and remove regular members but cannot promote another admin, remove an admin, remove the owner, or alter ownership.

Session controls are visible only to owners and admins. Members retain player actions, RSVP, session viewing, and score entry. Sessions belonging to groups a user administers should appear in their dashboard even when another admin created them.

## Enforcement

The permission matrix is defined once in `@picklebaddies/domain` and used by both UI and server actions. Every mutation re-checks the caller's current group role on the server. Firestore rules mirror the same boundaries for remaining direct client writes and continue accepting legacy `organiser` records as admin-level.

Role changes are transactional. The generic role-change path cannot create a second owner, demote the owner, or let an admin elevate another member.

## Verification

Cover the permission matrix with domain unit tests, Firestore Rules emulator tests, and focused server-action tests where practical. Complete browser checks as an owner, admin, member, and legacy organiser, including one account administering two groups.
