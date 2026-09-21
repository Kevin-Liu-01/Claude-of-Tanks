# Griffin proportion correction — 2026-09-21

Owner request: “fix both griffins proportions, make its hull 10% longer and turret 10% smaller”.

Both Griffin 50 mm X and Griffin Viper use the same chassis. The authored hull
is 10% longer along Z, with unchanged width and height. Road-wheel, drive-wheel,
idler and return-roller stations move with that length change. The native
suspension rebuilds the belt and shoe courses around those stations; wheel
radii, widths and circular cross-sections remain unchanged.

Both complete upper assemblies shrink uniformly to 90% around their turret
mount. The mounting point follows the longer hull. Gun pivots, firing anchors,
optics, roof fittings, armor and module receipts use the resulting frame.
Griffin 50 mm retains its 50 mm bore and existing ammunition. Viper retains
140 mm clear canisters and its 1-second, 64-missile feed. This is a proportion
change, not a change in their gameplay roles.

The supplied Griffin's original assembled source remains immutable. The
separate local comparison target is made by
`tools/griffin-proportion-reference.mjs`, using only that source and the
owner's fixed 1.10/0.90 instructions. No candidate measurement enters reference
preparation; all 25 meshes and all triangles remain. The source wheel stocks
translate to the extended axle stations instead of becoming ellipses.
Object_24's disconnected fittings are assigned by their disjoint source
height envelopes; any ambiguous component fails preparation. The original
and derived hashes and mesh ownership census are retained in the adjacent
receipt. Source GLBs remain private authoring inputs, excluded from runtime.

The existing 92 comparison floor, sealed-body gate, physical attachment,
track and bore checks remain unchanged. The historical source certificate
continues to replay independently; it does not certify the new proportions.
The current Griffin 50 mm passes the unchanged 92 source-comparison floor at
95.0, and the separate procedural fidelity check scores 97.0. Both Griffins
pass strict loaded-track clearance, attachment/continuity, physical launcher
or cannon checks, centering, generated-asset freshness and sealed-body checks.
Neither has an open view in the 33-view sealed audit.

Filled and unfilled HIGH/LOW tests verify the longer shared chassis, round
wheels, smaller upper assemblies and firing-anchor agreement. Native HIGH rear
and LOW front views of both vehicles were directly inspected; this was a
linear owner-requested review, not an independent critic score.

The shadow coverage fixture applies the inverse transpose of the fixed 1.10
hull stretch to its original caliper direction. Its historical source-stock
measurement, coverage tolerances and three-shadow-draw budget remain unchanged.
See the [combined qualification record](missile-roles-ariete-upgrade-20260921.md)
for regression, anatomy and build results.
