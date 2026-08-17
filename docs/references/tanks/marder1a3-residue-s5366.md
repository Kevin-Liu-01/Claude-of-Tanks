# marder1a3 — §5.349 residue packet (UNCOMMITTED-UNSTAGED, 2026-08-17)

ORDERS (shots/ifv-b2-sweep/afvfamily-handoff.md §2): (a) MILAN-carriage sky
pocket, (b) donor under-bow window. Fence: §5.316 old-hull+new-turret +
§5.354 owner equipment untouchable except these closures.

## Timeline hazard (live tree churned 4x during the lane)
- Recorded baseline afa0b546 (71/82601) @ 6e27a4c8 == the §5.354 stated hash.
- §5.356 floating-turret regression (owner-filed) was LIVE in that baseline:
  spec turretPivot remap pushed the seat 1.895 -> 2.057 (+x 0.187); my probe
  measured collar bottom 2.037 vs donor roof 1.905 (13 cm ring air) and gate
  dims 63.7 (vs ledger 100) PRE-EDIT — both foreign, both root-caused by the
  landed float-fix packet (docs/references/tanks/float-fix-packet-s5356.md).
- §5.361 landed mid-lane: seats restored; marder re-baselined ef162114
  (71/82601) @ 896384ed with edits reverted.

## Closures (both turret/hull-LOCAL — seat-independent by construction)
1. Pocket (was 552px plain-side pre-landing; 631px y0 + 802px y45-fql live):
   carriage pedestal web box(0.34, 0.45, 0.67) @ turret-local (0, 0.645,
   -0.255) — spans the inter-tower bay flush to the trunnion tower inner
   faces (x +-0.17), welds into beam/riser undersides, buries into the cast
   crown. No §5.269 cast line or carriage/MILAN/PERI piece moved.
2. Bow window ([y 0.50..0.63, z 2.84..3.08] live): the exact §5.341 m2a2
   bow-corner grammar (side plate 1.40..1.44 plane + transverse cap z
   3.10..3.16 per side), authored marder-locally in buildMarder1A3 (the
   hard-gated splice takes no bradleyFlankDressing content).

## Receipts (before-896384ed/ vs after/ + after-run2/, tree c13e67c3)
- y0-side 4945 -> 3876; y45-side 4568/4562 -> 3993/3987; y45-fql 894 -> 22.
- AFTER cluster list is PIXEL-IDENTICAL to the certified m2a2 guard profile
  (408px donor bow-seam + 363/357/331/324/288 wheel-daylight rows) — §B2
  clean at the certified donor class.
- Sweep x2: run1 == run2 view-for-view (enclosed + islands), 9 views.
- Honest re-gate x2 (bit-identical): whole 82.5 / dims 100 / floaters 100.
  Reverted-at-tree isolation gate: 81.9/100/100 == the ledger row exactly.
  MY DELTA: whole +0.6, dims/floaters HELD. Hold-or-improve PASS.
- Track-clip STRICT (--exact): front 0 rear 0, shoe 0/0.
- §B5: pedestal is P.add('turret') bucket (rig_turret by construction);
  y45 receipts show the closure riding the rotated turret.
- Hash: ef162114 -> d25cfa80 (71 meshes, verts 82601 -> 83063).

## Residuals / not-mine (left, banked)
- 408px donor bow-seam slit [1.62..1.78, 1.82..2.14]: certified m2a2 class
  (identical cluster on the byte-held guard) — tolerated, not an order.
- 1123px y0-side ISLAND [y 2.37..2.67, z -1.05..-0.77]: turret stowage-rack
  cluster floating ~4 cm over the rear equipment wall in silhouette.
  PRE-EXISTING (identical px in the reverted PRE run; turret-local, predates
  §5.354) and OUTSIDE the fence ("untouchable except the pocket/window
  closures") — §B5-class candidate for the orchestrator.
- Bow-window residual: one ~40px AA sliver at the plate top-chord tuck
  (cm-class, MINOR charter).
