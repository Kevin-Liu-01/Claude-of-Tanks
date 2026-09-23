# MBT-70 gun-throat taper — 2026-09-21

Kevin requested reversal of the cone selected in his Gallery packet dated
2026-09-21T15:41:50.403Z: `mbt70`, `rig_gun/gunMount`, front cap at local
Z 1.315 m. The exported `remove` operation identifies the patch; his instruction
is to flip the taper, not delete the fitting.

The existing 250 mm-long cone stays centered at Z 1.19 m. Its rear radius is
now 220 mm, seated against the existing throat ring, and its forward radius
is 170 mm toward the muzzle. There are no new primitives, materials, batches,
per-frame operations, or changes to gun ownership, placement or dimensions.

Actual HIGH/LOW surface-ray checks verify the taper and receiver seating.
The existing fender fixture also passes its 192 suspension poses and 268
receiver samples; its original-emission hashes were refreshed only for this
requested taper reversal. A before/after comparison against 4d0923016 finds
only the `gunMount` mesh changed and identical full-vehicle bounds. The native
HIGH close-up was inspected directly. Private evidence is under
`.qa-dev/mbt70-cone-20260921/`.

The existing whole-vehicle source comparison remains a separate failed
qualification. Its committed baseline already failed the 90-point floor;
the fresh run reports 86.5 minimum (whole curves 89.4, dimensions 86.5,
floaters 100). The vehicle retains the owner-directed M1A1 hull composition
documented in [the fender repair](mbt70-upper-fender-sides-20260909.md).
The source, registration and thresholds are unchanged. This small repair
does not certify that broader comparison or redesign the rest of the tank.

The complete anatomy update/check passes: 202 current anatomy and marking
receipts, 1,745 modules and 404 track sides with no failed or outside-envelope
modules, and 606 technical diagrams current. The sealed-body check remains
sealed in all 33 views, exactly matching the committed census (85,146
triangles, zero open or see-through pixels). Type checking and the private
production build pass. Only this tank’s regenerated image/manifest entries
are retained; unrelated fleet assets remain byte-identical to the base.

The required integrated release command was run and exits nonzero at source
scoring: geometry minimum 86.5/90, and whole-view fidelity 91.51 overall but
front 89.60 and rear 89.44 below 90. The neutral comparison/articulation board
was inspected directly. These failures remain recorded in the refreshed
geometry receipt; no passing full-release claim is made.

Final `npm test` passes all three suites: 403 pre, 680 core, and 42 post.
The normal unchanged-input cache reuses 273 prior passing receipts; 852 tests
execute freshly. The targeted release probes also pass centering, module
alignment/hits, assets, track uniqueness, visible muzzle, and barrel
circularity (ratio 1.000, firing-axis lateral error 0.0 mm).

Publication scope is the explicitly requested cone repair. Whole-vehicle
source qualification remains failed and visible in the committed receipts.
