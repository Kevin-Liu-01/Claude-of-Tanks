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
The final 2.5 mm-clearance candidate was source-regated after rebasing onto
`9919b26b9`: the raw result remains **79.4/92**, whole shape **89.5**,
floaters **100**, registration **PASS**. The source oracle is unchanged.

On 2026-09-10 the owner explicitly selected **"Prioritize fitted thicker running
gear"** after being told that retaining the axle centres extends the ground
envelope by roughly 9 cm and fails the frozen source-shape check. The intended
design is now the fitted 90 mm course, not preservation of the source's thin
ground envelope. This is an accepted design deviation, not a claim that the
unchanged source score passes, and not a waiver of contact or release checks.

No source transform, threshold or reference was changed. Initial fitting
iterations stopped before anatomy/assets/full release. After the owner chose
the thicker target and native contact tests passed, release evidence collection
started on `a82edb9f6`. It retains any raw source-stage failures and collects
the remaining official stages; it does not label a failed composed gate PASS.

The bounded gear-call inverse is now implemented in the historical test
helpers. Both old whole-source hashes and both old native whole-model hashes
pass unchanged. An undeclared source edit is still rejected. The actual
candidate also passes `sourceXOtherAuxArmor.selftest.mjs --ids=type10_x` at
HIGH/LOW: 1,744 auxiliary faces, 2,320 independent held-out rays per detail,
2,405 seams / 196 owned edges, with maximum held-out surface error 2.303 mm.
The paired-stock primitive test is registered in the full npm lifecycle;
the registry at that initial checkpoint accounted for 958 checks, before the
additional finite-contact, tapered-carrier and native Type 10 regressions.

## Fitted contact follow-up

The broader native road-stock sweep found a real missing constraint: the
original lower course cut into an end road wheel by 28.916 mm at full droop.
Holding its end influence alone reduced that failure but still left a
10.673 mm wave-pose intersection. The new opt-in `fitLoadedRun` solves the
finite lower spans against the live wheel-rim envelopes. It keeps duplicated
cross-sections welded, preserves band thickness, reuses constructor-owned
scratch, and feeds the existing near/far moving shoes from the same course.
The existing endpoint-ownership table was correct and is not changed.

A full-width carrier also intersected the canonical sprocket teeth. Narrowing
the entire carrier fixed the tooth intersection but failed actual visible
roller support (48.621 mm gap). The final closed carrier is recessed only in
the sprocket's lateral engagement lanes: 420 mm through z = −2.40 m, tapering
back to the original 486.738 mm at z = −2.30 m. Collinear transition sections
retain one connected course; all return-roller crowns retain full-width stock.

Final native HIGH/LOW observations on this candidate:

- `type10XRunningGear.selftest.mjs`: all ten road wheels, actual +0.30/−0.22 m
  axle travel and wave terrain, 16 link phases per pose; **128 poses pass**,
  minimum finite stock clearance **1.2585 mm**. Moving a real carrier upward
  is rejected as a negative control. Six return rotors must actually exist.
- The repeated roller-motion test still gives minimum **0.4852 mm** clearance;
  visible support is **2.957 mm HIGH / 5.026 mm LOW** at 15/75/200 m, below
  the unchanged 6 mm limit. The committed regression includes this support
  check, not only a component-count assertion.
- Native batched end-body/hardware edge-crossing diagnostic: zero carrier
  crossings for all four end wheels, four spin phases and both details.
  This is a finite crossing diagnostic, not a complete containment proof.
- The final LOD-selected, instance-expanded census is **63,230 HIGH / 39,302
  LOW** triangles. Published skirt/support checkpoint `8f8791244` was
  **70,542 / 65,886**: an additional **10.37% / 40.35%** reduction. This is
  not a GPU timing or switch-latency claim.
- The shared-default preservation test still matches its immutable published
  fingerprint in all twelve assemblies and 96 motion snapshots. Other
  vehicles do not opt into the new lower-span fitting or lateral taper.
- Primitive disposal is now observed independently: all indexed inputs,
  flattened copies and HIGH fasteners release exactly once. Returned stock
  retains native ownership. No geometry vertices change in this disposal fix.
- Fresh typecheck/core-unused and source panel/ballistics/history tests pass;
  the old source and native hashes are unchanged, with the new opt-in fields
  explicitly removed only inside the historical reconstruction helper.

The final strict native track-clip sweep passes front/rear carrier, shoe and
wrap checks with zero reported intersections. HIGH/LOW wheel-quality checks
also pass. The in-app native close review covered full-vehicle front, side and
rear quarters, plus isolated running gear in LOW droop/wave and HIGH
compression. Camouflaged fixed skirts, painted stock, separate neutral
stowage, six rollers and articulated carrier are present. Diagnostic floor
height does not follow the artificial suspension fixtures; its clipping is
not a terrain-contact observation. An initial preview mistakenly requested
geometry-only receipt materials; that preview was corrected and reloaded
before material review. These are close diagnostic views, not a substitute
for the registered source board or an independent 14-view score.

Required anatomy regeneration passes, including the full-fleet technical
diagram refresh; only Type 10 assets/receipts differ. The first anatomy-check
attempt stopped at a real stale presentation receipt: native/saved diagrams
measure `centerYM: 2.017`, but the old runtime projection still says `2.0608`.
Its preceding anatomy/marking freshness and combat/module-hit checks pass
(181 tanks, 1,552 authored modules, 362 track sides; zero failures and 83
pre-existing dimension warnings). That composed attempt is **FAIL**, not a
release certificate. The selected centering generator and all ten Type 10
assets have now been refreshed before a new complete check/release attempt.
The generated horizontal centre also changes by 0.1 mm; no other vehicle's
anchor or projection changes. No manual projection or generated evidence edit
is used.
