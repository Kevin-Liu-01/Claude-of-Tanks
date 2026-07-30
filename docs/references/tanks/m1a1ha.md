# M1A1HA Abrams — reference packet

Variant: M1A1 Heavy Armor (first-gen DU armor package). Externally near
identical to M1A1: no CITV, no CROWS, M256 L/44.

## Real-vehicle dimensions
- Same envelope as M1A1: hull ~7.92 m, overall 9.77 m, width 3.66 m,
  height 2.44 m, M256 L/44. 7 road wheels.
  Sources: GlobalSecurity (https://www.globalsecurity.org/military/systems/ground/m1-specs.htm),
  Wikipedia M1 Abrams (https://en.wikipedia.org/wiki/M1_Abrams).

## Local GLB oracle
MODEL_SOURCE.m1a1ha points at `/models/tanks/m1a2_tejas.glb` (userdrops5) —
same oracle as m1a2_tejas / m1a1. A recovered `m1a1ha.glb` exists under
community/recovered/ but is not wired as the model source, so the lab scores
this id against the Tejas M1A2. Scoring-frame targets: see
docs/references/tanks/m1a2_tejas.md (identical).

## Notes / mismatches
- Same oracle-vs-history conflict as m1a1 (CROWS mass present on the oracle).

## Outcome (final lab state)
Shares the tejas oracle/geometry: 75.4 -> ~87 (H92 T78 G87 R88). See
m1a2_tejas.md for the LOD-bucket and camera-tilt notes.

## Round 2 (shaded-parity, 2026-07-30)
Identical build to m1a1 (correct per packet); see m1a1.md round-2 note.
Score 87.1 -> 86.6.
