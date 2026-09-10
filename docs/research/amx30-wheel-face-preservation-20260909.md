# AMX-30 X wheel-face preservation — 2026-09-09

Status: local focused checkpoint, not released. This is new work, not a
previously lost tank implementation, and is not the full-fleet primitive pass.

The existing face-depth correction recessed the painted dish behind two
closed rubber-cylinder caps. The replacement uses the existing finite tire-ring
primitive with a 0.314 m opening and the unchanged 0.36545 m rolling radius.
The painted dish, wheel axes and tire material are not moved or recolored.
The new ring uses the measured 0.4005 m width; the former second cylinder's
1.03-width lip is not retained.

The regression rejects the old capped-wheel runtime. The candidate passes
240 first-visible-surface rays across all ten wheels and both qualities,
closed-edge checks, unchanged rolling-radius checks and the existing gun,
optic and pose assertions. Ring cost remains 208 HIGH / 96 LOW triangles per
shared tire geometry, equal to the two former capped cylinders. Fleet wheel,
track-pattern and suspension checks and typecheck also passed.

The native driver completed 24 images with stable inputs: HIGH/LOW,
factory/winter and six views. The HIGH/factory front-left image was reviewed
and shows exposed painted dishes; the remaining views still need full review.
Images and manifests remain under
`.qa-dev/amx30-wheel-rings-native-20260909/` in this worktree.

Anatomy, asset refresh, source/release qualification and the changed-file
quality scan remain outstanding. A separate eight-ID wheel-face census failed
before evaluating its first tank because its Node harness lacked `document`.
It provides no result for those other tanks; do not infer a fleet-wide fix.
No temporary QA files or source models are included in this local checkpoint.
