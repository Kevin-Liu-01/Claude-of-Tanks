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


## Round 5 — gate v6/v7 iteration (2026-07-31)
TILT-COMPENSATION REVERT: every v5 'published-0.20' constant is gone. The
shell roofs are physically true again (cheek tips 2.15, shoulders 2.30,
main/bustle roof 2.36 world; v5 had dropped the family roof to 2.24), the
glacis hump/splash board are flush (the v5 deck was authored to the tilted
silhouette), and the bustle rack top rides at the published 2.44.
WIDTH GUARD: the v5 skirt bolts/handles/joint plates poked 1.5-2.5 cm past
the skirt face and the rear soot decals (render meshes!) poked 0.17 above
the deck and 0.05 past the tail — all seated flush; the widest mesh is now
exactly the committed +-1.83 (procScale 1.000).
DIMS DISCIPLINE (v6 heightM = p95 of side body-column tops): the rack rails,
rear-roof block and hatches form a deliberate 2.44 plateau; only the compact
CWS/CROWS head (z-local 0.11..0.32, ~2 columns, top 3.27 = the oracle's
cluster peak) rises above it. Whips stay stowed as base pots.
CERTIFIED CAP (v6 numbers): the oracle carries its CROWS/M240/doghouse
cluster as a 1.6 m-long solid at 3.21-3.29 world (z 0..1.6) plus twin whips
at 4.09 — matching more than ~2 columns of that under the published 2.44
p95 breaks dims by construction. wholeCurves/turretCurves/stations are
capped ~50/52/61 by exactly those columns (each carries ~0.83-1.65 m of
unmatchable top error); hullCurves 90.1, dims 98.1, floaters 100 are the
achievable components and are green.
Final: hull 90.1 / whole 51.8 / turret 52.5 / stations 60.9 / dims 98.1 /
floaters 100.


## Gate v10 note (2026-07-31)
Shares the m1a1 build and caps (tejas-family CROWS-cluster height cap
STANDS). hull 90.1 passes v10; dims 98.1, floaters 100.

## 2026-08-01 re-verification (fleet dual-gate program)
Cap re-derived from the CURRENT tejas GLB via a fresh gate run + full-curve
probe: the oracle still carries the CROWS/M240/doghouse cluster as a
1.65 m-long solid at 3.20-3.28 world (z -0.7..0.95) plus whips to ~4.08 —
the v6/v10 height-cluster cert STANDS unchanged (matching more than the
~3-column p95 budget breaks published heightM 2.44 by construction).
Shared-machinery fixes from this session's abrams.js work (rear-face
fittings tucked inside the tail plane, soot decals on the rear plate, lift
eyes seated on the deck) lifted the family without touching its certified
posture: stations 60.7 -> 68.9, dims 98.1 -> 98.8, turret 48.1 -> 49.2,
whole 52 -> 52.1; hullCurves HELD at 90.1 (passing). Boards regenerated
(&board=1) for the independent critic; IoU floor 87.6 (committed 86.6 — no
regression).
