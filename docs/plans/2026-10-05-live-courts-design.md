# Live court management

Approved scope: add courts and change court names/numbers directly in the live Courts section, with enable/disable controls. Owners and admins can manage active or paused sessions. Use inline, labelled forms suitable for mobile. Preserve court IDs when editing and preserve existing match snapshots, including completed scores. Newly generated matches use updated court details. Offer the existing update-games flow after availability changes for social sessions; round-robin scheduling retains its existing behavior.

Validate names and positive integer court numbers, reject duplicates, maintain active courtCount, and perform mutations in authenticated server transactions. Show save failures inline and prevent duplicate submissions. Verify validation with unit tests and run web typechecking.
