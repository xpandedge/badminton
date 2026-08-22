# Leave Squad Design

## Goal

Let registered members and admins leave a squad without asking an organiser, while preserving played-session history.

## Behaviour

A **Leave squad** action appears at the bottom of the squad Members view. It uses the shared in-app confirmation dialog and explains that access will end while completed results remain.

Leaving removes the caller from the squad member list, squad player list, and `memberIds`. It also removes their RSVP, roster entry, and zeroed leaderboard entry from draft or scheduled sessions, adjusting RSVP counts. Active, paused, completed, and cancelled session records are preserved so current play and history are not rewritten.

Owners cannot leave while they still own the squad because every squad must retain one accountable owner. An owner can transfer ownership to another registered member. The new owner receives the owner role, while the previous owner becomes an admin and may then leave.

If a draft or scheduled session already has generated games, leaving clears that unstarted schedule so it can be generated again without the departing player. Live and completed games are never touched.

## Navigation

After a successful leave, the user returns Home and the squad disappears from their squad list. Completed scores, global rankings, and historical match labels stay intact.

Ownership transfer keeps the user on the squad page and confirms that the selected member is now the owner. Both users' updated roles appear through the existing realtime member listener.
