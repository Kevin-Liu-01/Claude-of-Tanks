# AMX-40 owner-source completion — independent §B8 graduation

Date: 2026-08-10
Frozen geometry: `d2c73d96` (58 meshes / 83,226 vertices)
Machine gate: 90.1 — 90.2 / 90.5 / 90.1 / 91.8 / 93.4 / 100
Direct fidelity: 94.7 — H96.4 / T90.9 / G92.1 / R95.9

## Verdict

**PASS / KEEP.** Standard-order vector:

`[9.0, 9.1, 9.1, 9.0, 9.0, 9.0, 9.1, 9.1, 9.0, 9.2, 9.1, 9.1, 9.0, 9.0]`

Order: front, front-left, left, rear-left, rear, rear-right, right,
front-right, top, hero front-left, hero rear-right, hero top-tilt, close
front, close roof. Floor **9.0**, mean **9.06**; every required view clears
the law.

The completed procedural model preserves the source's low continuous welded
turret, canted cheek/mantlet transition, bounded gun tunnel, asymmetric roof
hierarchy, flank modules, layered transom, articulated bow and native
six-wheel running gear. The final mantlet is one source-like faceted load
path rather than a rectangular proxy block.

## Attachment and running-gear audit

Fresh yaw 0 and yaw 90 each rendered 14/14 diagnostics. The turret shell,
gun/mantlet, crown, cupola, optics, smoke banks, flank/service equipment and
their bases rotate as one assembly. No hull-fixed or fused duplicate turret
mass, unsupported decoration, empty-air seam or exposed base is visible.
Hull-owned deck furniture correctly remains with the hull.

The game-native running gear passes: six road wheels per side, distinct
terminal gears, a continuous linked-shoe contact run and coherent terminal
wraps. No donor belt, wheel or end-drum geometry is rendered, and the final
turret tuning introduces no track regression.

Console and network were healthy: no HTTP or runtime errors. The sole message
was the known non-substantive source-loader warning for
`KHR_materials_pbrSpecularGlossiness`.
