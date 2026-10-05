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
- PENDING: regenerated fills/assets/anatomy, native HIGH/LOW visual review,
  closure, integrated release, build and browser switching on the final tree.

Current command logs, generated outcomes and captures live in the ignored
`.qa-dev/bradley-roof-resize/` evidence directory. Do not infer a current pass
from the preceding M6 packet. The M3A3 reference model remains a disassembled
parts kit with a failed comparison; the owner’s existing publication exception
retains that status and does not waive physical checks.

The previous M1A1 release retry was interrupted while still queued, before
these edits. It remains incomplete, never a pass; its seven authored mantlets
are unchanged and their final combined-tree release checks remain required.
