# Envelope honesty lane state (2026-10-30)

Withdrawn. Neither head ships in any release; never merge them.
- item/envelope-honesty-264: the held v1 set plus these lane tools.
- item/envelope-ratchet-265 @ e3419f7156: the same set with the census shards registered.

Why: moving parts out of 'turret'/'hull' changes the look. 21 of 34 ids get a different shadow proxy, moved parts drop
out at the LOD distance, and the box re-fit slides main plates (cv9040c cheeks 46 cm behind the drawn face). External
buckets carry no spaced plates. Main accepted the hold on 2026-10-29.

Nothing is running and no capture ticket is queued. The scratch worktrees (envelope-264-B..F, -i263) were removed on
2026-10-29; their uncommitted batch rows are patches in ~/cot-lanes/envelope-honesty-264-evidence/scratch-worktrees.

Open: v2, Main-approved and not started (the session card waits on the owner). It cuts fresh from main and does not
rebase these heads. Its parts:
1. Flag non-armour parts in place, read only by the anatomy envelope measurement.
2. Fit each main plate to its drawn face.
3. Give the external buckets spaced plates.
4. Add a receipt that shadow proxies and LOD sets are byte-identical before and after (shadow-look.mjs).
Take leopardX.ts from item/leo2-front-265 / release 266. The Danish lane is rebuilding the 2A5M/2A6M/2A7V wedges there;
keep the wedges in 'turret'.

Tools in this folder (usage in each file's header): shadow-look.mjs, world-look.mjs, plate-geo.mjs, plate-gap.mjs,
plate-shift.py, box-contrib.mjs, fleetpass-ids.mjs, allowance-rows.mjs, merge-gen.mjs, chain3.zsh, rr-splice.py.

Evidence: ~/cot-lanes/envelope-honesty-264-evidence. It holds ship-table.md, fairness-table.md,
shadow-look-compare.txt, ext/plate-gap-ship34.txt and ext/plate-shift-ship.txt. The owed list is the
"Envelope honesty 264" section of ~/cot-launch-state/streams/TESTS-OWED.md.

Resume:
    cd ~/cot-lanes/envelope-honesty-264 && git fetch origin && git status -sb && git log --oneline -3 origin/item/envelope-honesty-264 origin/main
