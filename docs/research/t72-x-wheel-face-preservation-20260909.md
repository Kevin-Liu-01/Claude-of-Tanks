# Source-X visible wheel-face repair — 2026-09-09

Status: local preservation checkpoint; not released or full-fleet approval.

The eight-ID diagnostic finished. Both detail levels of T-72B 1987 X,
T-72B3 X, T-72B3M X, T-72BU X, T-90 X, T-90MS X and T-62MV-1 X have solid
rubber caps in front of the recessed painted dishes. Every one of their three
lower-face rays per wheel hits rubber. Burlak X is partially obscured: 24/36
HIGH and 12/36 LOW rays hit rubber. Full-size baseline side images were also
inspected for the five later cases, not merely their material tags.

Both profiles now use the existing closed annular-tire primitive. The fitted
openings are 0.3103 m and 0.30685 m respectively. These are deliberate style
corrections, not rewritten source measurements. The existing steel geometry,
source wheel radii, axle positions, counts and neutral tire roles are retained.
The former second capped cylinder's extra three-percent axial lip is omitted.

The first focused test passed 288 complete-visible-scene rays for T-72B 1987 X,
covering all twelve wheels at HIGH and LOW. It independently checks the
original axle coordinates, actual rubber radii, tire width, closed physical
edges and a 208 HIGH / 96 LOW triangle ceiling per tire primitive, equal to
the previous pair of capped cylinders. Painted steel must be the first hit;
the presence of a hidden painted mesh cannot satisfy the check.

The expanded T-72B3 X rerun passed: 576 total first-visible-face rays across
those two tanks, both sides and both qualities. The Soviet second-wave and
T-72B3 X source-geometry regressions also passed both qualities.

The continuing diagnostic also confirmed 36 rubber-cap first hits at each
quality on T-72B3M X; its full-size baseline left view visibly shows the same
covered steel faces. Its fitted ring now has a 0.33692 m opening inside the
unchanged 0.391766 m rolling radius. The regression includes its independent
axle witnesses.

The same fitted closed-ring primitive is now applied to all eight confirmed
cases. The five additional openings are T-72BU X 0.32690 m, Burlak X and
T-90 X 0.33888 m, T-90MS X 0.33402 m, and T-62MV-1 X 0.33679 m. Existing
painted dishes, neutral hubs and source axle/radius dimensions remain intact;
the test preserves T-90MS's distinct left/right axle stations explicitly.
The expanded eight-ID physical-face/ring test passed: 2,256 first-visible
painted-face rays across both sides and HIGH/LOW, with closed-ring, fixed
axle/radius and unchanged tire-budget checks. The T-72B3M source-geometry
regression also passed both qualities. The T-62 remains correctly rollerless.
No blanket new-roller inference
is made from the tire repair.

The nine-ID native capture (including AMX-30 X) completed all 216 frames:
six views at HIGH/LOW and factory/winter. Selected full-size frames were
inspected, but capture completion is not approval of every frame. The T-90 X
LOW winter side still visibly has a long neutral rear skirt, a separate open
finish issue. T-72B3M, T-72BU, T-90 geometry, Soviet second-wave geometry,
all-181 suspension/track/wheel pattern tests and typecheck passed.

The nine-ID HIGH/LOW auxiliary-armor regression also passed: 1,214 physical
facets, projectile checks and stock/air grids. Its original whole-model hashes
remain unchanged. A narrowly scoped test-only inverse removes precisely the
eight declared tire-opening parameters before the historical hash check
(and retains Burlak's pre-existing exact finish inverse). The actual candidate
still undergoes the full physical armor/air tests and visible-wheel tests.
This avoids either accepting new golden hashes or rejecting an authorized
tire repair as unrelated geometry damage.

Full
candidate review, anatomy/assets, release and changed-file scan remain outstanding.
This edit does not fix the still-thin tracks or certify hull/fender closure.
No source models or temporary QA files belong in this checkpoint.

## Publication split

The fourteen-vehicle successor excludes T-72B3M X's tire-opening delta and
its generated assets because that tank still fails the 268-cell continuity
gate. The complete earlier fifteen-tank source/assets remain preserved in
`68f978403`; no work was discarded. The delayed tank keeps the current main
geometry and its original whole-model hash. Seven tire-opening opt-ins
(plus AMX-30's separately tested painted face) remain in this successor.
This separation does not waive the delayed tank's gap issue or permit
publishing the remaining fourteen before their integrated release passes.
