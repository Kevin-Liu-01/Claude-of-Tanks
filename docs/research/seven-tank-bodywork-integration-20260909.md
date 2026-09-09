# Seven-tank bodywork integration — 2026-09-09

Scoped checkpoint, not completion of the fleet performance/running-gear pass.
Inputs: `15303c11d176bcdabafbbb99b7851d6a9b4b2221` plus generator-owned
outputs listed below. Targets: `t90a_burlak_x`, `leo2a5_x`, `leo2a6_x`,
`leclerc_x`, `amx40_x`, `merkava3d_x`, `merkava4_x`.

## Changes and measured limits

- Fixed metal side panels use the existing camouflage finish rather than
  rubber. Mechanisms and genuinely flexible rubber remain separate.
- Both Merkavas have fitted finite shoulder returns; Mk3D front and Mk4 end
  fenders close the upper gaps while preserving visible lower wheels.
- This is not a triangle-reduction result. Mk4's end closures add 368
  triangles at both quality levels and two draw submissions. The running-gear
  primitive replacement, track gauge and switching-latency work remain open.

## Completed checks

The frozen-input driver completed all 12 phases, with no unexpected source
mutation: 16 focused tests; TypeScript; full-fleet anatomy update/check;
marking update/check; combat-anatomy test; full-fleet module-hit probe;
technical-card generation/check; 84 native views; and seven-ID icon refresh.
The module probe covered 174 tanks, 1,496 modules and 348 track sides with no
outside-module failures; its 79 existing dimension-drift warnings are retained.

Native coverage is seven IDs × HIGH/LOW × factory/winter × front-left,
rear-left and left, at 15 m and 1200 × 800. Representative current Mk3D front,
Mk4 rear and Burlak winter side images were visually reviewed. These views
demonstrate bodywork/finish, not all-pose running-gear or performance approval.
The private production build also passed, retaining the existing large-chunk
warning.

Separately, the maintained `muzzle-bore-probe --all` passed for all **201
currently registered IDs**: recessed dark bores, rims, concentricity and
terminal seating. This does not include the seven unpublished conventional
Abrams X variants. Their WIP must not be silently counted as registered.

Local raw evidence (excluded from Git):
`.qa-dev/bodywork-integration-gmMzYo/receipt.json` and phase logs;
`.qa-dev/bodywork-integration-gmMzYo/native/`;
`.qa-dev/all-fleet-bore-OSY1kG/report.json`.

Only the changed seven-ID presentation assets, the two Merkava technical-card
sets, their manifest entries and the generated Merkava marking receipt changed.
No source-model files, unrelated fleet-icon churn or temporary QA are included.

## Release status

The scoped integration receipt is PASS; it explicitly retains
`fullReleasePass: false`. It is not a substitute for the composed release
command, and previous failed full-suite results remain recorded. Do not cite
the individual passes above as a clean full `npm test` or a finished fleet pass.

The first composed release stopped at Mk3D presentation centering: 0.34 px
residual exceeded the unchanged 0.25 px limit after its fender correction.
The maintained centering generator was rerun; only the two changed Merkava
anchors/projections and their corresponding icons were retained. Unrelated
sub-millimetre M1A3/MBT-70 regeneration noise was excluded. The subsequent
release run passed centering (maximum 0.00 px rendered, 0.14 px exported top),
all seven module alignments, current assets, track duplication, muzzles,
barrel circularity and registered source fidelity. All seven strict geometry
gates passed (minimum 92.3/92); contact/clipping, continuity and weapon checks
also passed. The composed command then entered the full `npm test` lifecycle,
which subsequently failed in the unrelated world shoreline regression below.
None of these completed phases is a full release PASS.

On runtime input `183548a33` (later documentation/report-only head
`b0ed8d90f`), the full lifecycle passed 270 PRE files and the first 436 CORE
files, including all reached vehicle geometry, floor, asset, anatomy and gun
articulation checks. CORE stopped at `src/world/shoreDirtMask.selftest.mjs:254`:
`polders: bank pass is opt-in only`. The map currently enables `shoreDirt`,
whereas this historical-control test assumes only Mangrove enables it.
The map owner has been notified. Existing RGBA goldens must not be replaced
or the failed test silently skipped to publish vehicle work. Remaining CORE,
POST and the composed command's final private build are not yet release-green.
