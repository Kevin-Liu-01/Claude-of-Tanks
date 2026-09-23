# Strv 122 X shared track-link stock — in progress

Scope: `strv122_x`, based on `9e20c8b0a` in the isolated
`cot-challenger-gear-efficiency-20260910` worktree. This change is separable
from the unpublished Challenger draft in that tree.

The current fleet census found 138,220 HIGH / 134,476 LOW total triangles.
Its road wheels already use procedural turned solids. The 48-sided wheel
faces retain independently tested source surfaces; this pass does not change
them, the axle stations, track course, shoe dimensions or suspension joints.

The native gear now delegates shoes to the existing quality-aware
`buildFleetTrackShoe`, retaining the supplied national recipe. At the actual
10 m LOD, link cost changes from 37,944 to **26,112 HIGH / 13,056 LOW**:
31.18% / 65.59% fewer link triangles. These are not full-model totals or
measured browser-speed improvements. Track thickness is unchanged and its
separate country-style thickness/clearance requirement remains open.

The unchanged native held-out wheel/hub/rim rays, axle stations, spinning
endpoints, suspension clearance and attachment rays, sixteen moving ground
phases and wheel-face animation all PASS at HIGH and LOW. The test now also
checks visible, instance-expanded link costs and meaningful LOW reduction.
The initial cost probe counted both LOD levels before explicitly selecting
the camera distance; that 30,600 figure was not a valid visible cost.

The provisional 25,000 HIGH stretch target is **not met** (26,112). The
regression test instead records the actual >=30% HIGH / >=57% LOW reduction
against shipped stock; it is not a replacement source or release gate.
No physical/source tolerance was relaxed. Do not claim the stretch target,
full style pass, or release qualification passed.

The first source attempt rejected the raw download's hash and timed out; it
was not a model score. Located the existing normalized comparison in
`cot-source-x-second-wave-20260906/public/models/community-candidates/strv122_x_source.glb`
and independently verified SHA-256
`d1ac97d98dd477d52850aaed8ae98184f9a3fd9b7ef20c5aadcf6c34d8e6d582`,
matching the unchanged certificate. The local QA symlink now points there.
Never include this reference in a commit or playable loading path.

The fresh exemplar source gate PASSes at 97.0 aggregate, with every whole
view above 92 (lowest displayed view 95.5). The neutral comparison and
articulation/turntable board was inspected: retained chassis, wheel seats,
turret and gun outline, without new visible gross separation. Fused-source
component masks remain unavailable, not independently passing components.
Strict exact band/shoe hull-containment sweep PASSes with zero reported
intersections. These checks do not replace finite wheel/guide contact tests.

Anatomy refresh/check, current production assets and release verification
remain pending. No publication or completed full-style pass is claimed.
