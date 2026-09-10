# Type 10 X: fitted 90 mm candidate — not released

Base: published `8f879124415f2734e8020de07b69a03afac4d96c`.
This is a separately preserved candidate, not the already-pushed skirt/support
checkpoint. Do not publish it as qualified or replace its failed source row.

## Implemented

- A reusable closed paired-wheel primitive, metal dishes/hub/fasteners and
  distinct rubber rims; a real 100 mm central guide channel.
- The actual Japanese staggered-rib recipe through the quality-aware fleet
  shoe builder; no source buffers and no counterfeit NATO pattern identity.
- A 90 mm carrier, original road/end axle centres and wheel radii, 4 mm end
  contact allowance, 16-step wrap arcs without duplicate course cells.
- Six fitted composite return rotors, canonical hull-connected spindles and
  2.5 mm upper-course allowance. Actual spin radii are not altered to move stock.

## Measured, not a release certificate

`pairedRunningGearStock.selftest.mjs`: eight HIGH/LOW, steel/rubber fixtures;
closed outward stock, finite attributes/UVs, real guide air and 13 negative
controls pass. Typecheck/core-unused and Type 10's independent source feature,
stock/air/weapon/ownership witnesses pass. That test now checks ground contact
with native `seatOnFloor`, separately from the unchanged raw source frame.

`.qa-dev/type10-production-contact.mjs` ran each detail level on actual native
battle geometry: 64 moving poses at the real +0.30/−0.22 m suspension clamps
and a nonflat wave. Minimum track/roller separation is 0.485 mm; conservative
road-stock/roller separation 10.950 mm. Continuous near/far shoe bounds pass.
At 15/75/200 m and 27 phases, maximum visible roller/support gaps are
2.957 mm HIGH and 5.026 mm LOW, below the unchanged 6 mm limit.

The preceding 3 mm-crown prototype measured 63,166 HIGH / 39,238 LOW
LOD-selected, instance-expanded triangles. Counts must be recaptured at the
final candidate; these are not GPU submissions or a frozen class-budget pass.
Native HIGH angle/front/side/top frames were captured and inspected in
`.qa-dev/type10-90mm-native`, alongside original Type 10 controls. They are
diagnostic views, not an official full-view independent visual certification.

## Explicit owner target decision

The frozen source is unchanged (SHA-256
`fb6c2aa30119ac45b49fdfb7393a13760109ce4c9cc3f6244e579eb4944879fe`).
The early 3 mm-crown source check fails **79.4/92**, with whole shape **89.5**.
Actual physical height is 4.209195 m versus source 4.121557 m: retaining axle
positions while fitting the thicker course extends the ground envelope by
87.638 mm. The narrower ground-space source cannot simultaneously remain exact.
The subsequent 0.5 mm crown adjustment has not been source-regated.

On 2026-09-10 the owner explicitly selected **"Prioritize fitted thicker running
gear"** after being told that retaining the axle centres extends the ground
envelope by roughly 9 cm and fails the frozen source-shape check. The intended
design is now the fitted 90 mm course, not preservation of the source's thin
ground envelope. This is an accepted design deviation, not a claim that the
unchanged source score passes, and not a waiver of contact or release checks.

No source transform, threshold or reference was changed. No expensive
anatomy/assets/full-release run was started on this known source mismatch.
Qualification must report both the raw source mismatch and the explicit
owner-approved running-gear target.

The bounded gear-call inverse is now implemented in the historical test
helpers. Both old whole-source hashes and both old native whole-model hashes
pass unchanged. An undeclared source edit is still rejected. The actual
candidate also passes `sourceXOtherAuxArmor.selftest.mjs --ids=type10_x` at
HIGH/LOW: 1,744 auxiliary faces, 2,320 independent held-out rays per detail,
2,405 seams / 196 owned edges, with maximum held-out surface error 2.303 mm.
The paired-stock primitive test is registered in the full npm lifecycle;
the complete registry accounts for 958 checks on this candidate's base.

Complete road/end wheel-to-shoe motion, guards/ground sweeps and native LOW
close views remain, as do regenerated assets/anatomy and full release checks.
