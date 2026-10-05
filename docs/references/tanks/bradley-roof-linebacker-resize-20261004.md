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

## Separate retained M3A3 gun-to-hull defect

At -9 degrees with the turret facing forward, the cannon intersects the raised
hull deck. The independent reviewer reproduced the same contact before this
roof change at commit `2a9c9efe3`; its sampled centerline penetrates 61.6 mm.
The new roof has no contact with the gun, and neither hull nor gun geometry was
changed by the roof repair. This remains a real unresolved physical defect,
not covered by the owner's failed-reference exception.

A diagnostic-only trial raised the gun 140 mm and moved it forward 120 mm. It
cleared the new roof and improved forward clearance to about 9.9 mm, but still
intersected rear hull stock at yaw 165–190 degrees (52.8 mm sampled penetration
at 180 degrees). It would also require relocating the stationary trunnions and
support saddles. The trial was rejected and never applied to the runtime source.
Raw observations and candidate failures remain under `critic/`. Do not claim
complete M3A3 articulation qualification from this scoped roof acceptance.
