# Bradley roof and Linebacker turret resize — 2026-10-04

Owner corrected “M313” to M3A3 Bradley (`m3a3_bradley`) and requested a proper
turret roof plus a complete 10% turret reduction for `m6_linebacker`. Work is
isolated on `codex/linebacker-bradley-mantlets-20261004`, based on `2a9c9efe3`.

## Construction

M3A3 now has a finite sloping roof bridging the split cheeks. It overlaps
the rear bulkhead and both shoulders by 20 mm. The front edge stops behind
the moving gun; the existing −9°/+30° elevation bay stays functional. Roof
stock is part of the turret, with outward-facing surfaces and no hull furniture.

M6 applies 0.90 to all turret-owned geometry and direct-mounted fittings about
the existing bearing, from a 2.68 m shell to 2.412 m. Gun pivot, four missile
mouths, barrel envelope, armor surfaces, crew and modules share the new frame.
The chassis, fenders, tracks, passive skirts, armor thicknesses and weapon
stats are unchanged. The main barrel retains its physical 25 mm bore.

## Verification status

- PASS: focused native HIGH/LOW checks. All eight optical channels remain
  visible; all four missile origins match their actual tubes at articulated
  poses; the pod clears the hull by at least 273.5 mm across 120 poses per
  quality. M3 roof rays, gun-clearance probes, cheek ERA contact/spent/reset,
  preserved chassis and original Ukrainian Bradley controls pass.
- PASS: independent source/physical critic. At 0.5° pitch increments, exact
  gun/mantlet triangles do not intersect the M3 roof (319,160 HIGH and 197,816
  LOW triangle/prism tests). All visible M6 turret meshes in HIGH and LOW follow the
  90% transformation, except the intentionally preserved bore. M6 chassis,
  running gear, transforms and instancing data are byte-identical to HEAD
  (43 HIGH / 41 LOW meshes). Critic scripts, results and exact input hashes
  are saved in `.qa-dev/bradley-roof-resize/critic/`.
- PASS: TypeScript and core-unused checks on the authored revision.
- PASS: scoped fill and asset regeneration; full 220-vehicle anatomy update/check;
  scoped centering; geometry ledger update/check; 33-view sealed closure; public
  and private builds; attribution; production Gallery/Garage display and switching.
  The two generated asset records are the only changed rows in tank-assets.json.
- PASS: independent review of all 40 unmodified native HIGH/LOW Gallery captures,
  with exact source and image hashes in `critic/visual-review.json`. Acceptance
  covers the added roof and complete M6 resize, not full-vehicle qualification.
- PASS: release-tail anatomy freshness, centering, module visual alignment and
  hits, asset currency, duplicate tracks, muzzle bores and barrel circularity
  across the two Bradleys and all seven M1A1 photo-repair IDs.
- PASS: the M6 owner-design gate after synchronizing its pinned expected datums
  with the owner's 10% reduction. The first run failed because that duplicate
  contract still described the previous turret. `concept.log` retains the raw
  failure; `concept-retry/` holds the fresh pass. No tolerance was changed.
- PENDING: composed release scoring and the integrated npm test suite. These
  are separate from the passed release-tail commands and must not be called green.

Current command logs, generated outcomes and captures live in the ignored
`.qa-dev/bradley-roof-resize/` evidence directory. Do not infer a current pass
from the preceding M6 packet. The M3A3 reference model remains a disassembled
parts kit with a failed comparison; the owner’s existing publication exception
retains that status and does not waive physical checks.

The previous M1A1 release retry was interrupted while still queued, before
these edits. It remains incomplete, never a pass; its seven authored mantlets
are unchanged and their final combined-tree release checks remain required.

## M3A3 gun-to-hull repair follow-up

At -9 degrees with the turret facing forward, the cannon intersects the raised
hull deck. The independent reviewer reproduced the same contact before this
roof change at commit `2a9c9efe3`; its sampled centerline penetrates 61.6 mm.
The new roof has no contact with the gun, and neither hull nor gun geometry was
changed by the roof repair. This was a real pre-existing physical defect,
not covered by the owner's failed-reference exception.

A diagnostic-only trial raised the gun 140 mm and moved it forward 120 mm. It
cleared the new roof and improved forward clearance to about 9.9 mm, but still
intersected rear hull stock at yaw 165–190 degrees (52.8 mm sampled penetration
at 180 degrees). It would also require relocating the stationary trunnions and
support saddles. The trial was rejected and never applied to the runtime source.
Raw observations and candidate failures remain under `critic/`. Do not claim
complete M3A3 articulation qualification from this scoped roof acceptance.

The owner subsequently requested a physical repair before publication. The gun
axis is now 240 mm higher and 120 mm farther forward, at turret-local
`[-0.06, 0.492, 0.78]`. Welded cheek saddles carry the relocated stationary
bearings; a rotary axle and rounded receiver connect the rocking mask. The
original hull and full −9°/+30° aiming range are retained.

Independent authored-surface checks pass in HIGH and LOW: 23.663 mm minimum
clearance in the 0.05° full-yaw depression sweep with recoil, plus 22,140
full-envelope poses per quality and zero unintended roof/saddle intersections
over 483 pitch/recoil poses. The persistent regression uses finite triangle
clipping and rejects the original low trunnion as a negative control.

The regenerated fill now preserves the integrated base's exact 250-box hull,
uses 24 turret boxes and has no moving-gun fill. The generator requires actual
moving stock on both sides of a column before assigning it to the gun; seeing
a gun overhead no longer creates a long artificial underside. M3's generation
boundary narrows only turret fittings, preserving all original hull buckets.
The independent final source and physical review passes in both qualities.

The extra volumetric diagnostic remains explicitly RED: 48.73 L versus 23.50 L
on integrated base `0afe2e51c`. This is not an identical inherited receipt.
Its final decomposition is 21.296875 L of unchanged hull residue, 1.000 L of
primary turret fine slivers (base 1.03125 L), 1.53125 L of external fitting
columns and 24.90625 L of intentional air outside both the moving gun and fixed
turret spans. No broad roof/body opening was found. The 33-view native sealed
check passes with zero opening pixels; no threshold was changed and the
articulation bay was not filled to improve the volumetric score.

The complete interior-fill boundary fixture fails identically on base and
candidate at unrelated BMP-3M (`bmp3m_dragun125_x`: six voxels versus zero).
The M3-only cases, including the removed-plate negative control, pass. Raw logs
and source hashes are retained under `critic/`; this is named inherited debt.

Full anatomy update/check, the nine-ID physical release tail, public/private
builds, attribution and real Garage selection/rapid return passed before the
last hull-boundary correction. Its final assets, geometry ledger, 33-view closure and HIGH/LOW captures
were refreshed successfully with the preserved hull fill. Integrated release
and test checks remain tracked separately; do not infer pending passes. The first standalone switch profile used an invalid five-entry sequence
with a repeated current selection and only two warm returns; the corrected run
must include at least four actual warm switches.

Evidence and exact statuses are in `.qa-dev/bradley-gun-repair/`, including
`critic/residual-review.json` and `critic/final-turret-only-source-review.json`.
