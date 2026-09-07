# T90 X reactive-armor gameplay binding

The four source-authored T90 X builders retain their original neutral exterior
geometry and inherited ERA effectiveness. Their real removable cassettes now
belong to the existing gameplay depletion zones; an activation strips the
actual merged vertex ranges, and round/replay reset restores those same ranges.
This is not an additional armor package or a change to donor combat values.

| Variant | Reactive pieces | Permanent pieces deliberately retained |
| --- | --- | --- |
| T-90A X | Upper glacis courses, three forward skirt cassettes per side, upper/lower cheek cassettes and their small attached fixtures | Lower bow applique, inner skirt backing, hanging skirts, Shtora/support housings, stowage and turret core |
| T-90A Vladimir X | Four upper glacis panels per side, three forward skirt cassettes per side, upper/lower cheek cassettes and attached fixtures | Lower bow applique, continuous base glacis, ordinary skirts, carriers and stowage |
| T-90M X | Three seven-column glacis courses; five forward modular side curtains and terminal panel per side; cheek cassettes; final rear-wrap cheek cassette pair assigned to `side_era_L/R` | Lower bow applique, inner side plates, hanging rails, passive aft curtain/cage, folded turret supports and all stowage boxes |
| T-90SM X | Two broad forward glacis covers; four thin center overlays and their ribs; paired upper outer covers and attached latches; upper/lower cheek covers and their attached narrow ribs | Crosswise lower bow rib, thicker lower center bases, lower outer support courses, edge uprights/leaves/legs, launcher shelves/mounts, side cases and turret core |

All variants retain `glacis_era_L/R` and `turret_era_L/R`. A/V/M also retain
`skirt_era_L/R`; M additionally retains `side_era_L/R`. Exact names preserve
the existing activation, spent-zone and reset contracts. An asymmetric physical
cassette crossing X=0 belongs intact to the side of its center; a zone suffix
does not cut visible geometry at an arbitrary plane.

The fitted hit fields use selected triangles from the actual authored cover
buffers, encoded as degenerate four-point quads for the existing collision API.
They do not use broad PCA rectangles over folded panels. Attached seam strips,
bolts, ribs and latches deplete with their cassette but carry an explicit empty
hit-face list: such furniture cannot enlarge ammunition protection into air.
No geometry is added to stand in for gameplay protection.

`t90XEraBindings.selftest.mjs` pins eight pre-binding visible world-vertex
multiset hashes (four vehicles at high/low LOD), checks every complete fitted
facet against an actually stripped native triangle within 2 micrometres,
rejects translated air-only faces, checks unchanged permanent buffers and exact
reset, and pins inherited effectiveness plus source rig/combat anchors.
The unchanged fleet `eraGameplayRegistration.selftest.mjs` remains the actual
first-hit activation, visual-strip, spent second-hit and reset audit.

Because attached hardware moves to its owner's camouflaged external-armor
material bucket, shaded material/UV appearance can change although vertices do
not. Combat-anatomy receipts and technical images must be regenerated, and the
final shaded/source comparison must be refreshed after this semantic repair.
Earlier silhouette proofs establish the preserved geometry, not completion of
this later gameplay-binding release step.

After canonical source yaw/trunnion metadata was applied, the unmodified
focused checks pass all eight high/low geometry fingerprints and exact-face
containment checks. `sourceXEra.selftest.mjs` also passes all four T90 variants:
48 high/low zone activation/strip/spent-second-hit/reset flows and 1,854 actual
fitted facet checks. The four-vehicle source geometry test and full TypeScript
check pass. The final generated fleet registration audit and shaded release
proof remain required; this CPU evidence does not replace them.

## Later source-backed physical corrections

The binding-only eight complete hashes remain recorded in the test. Subsequent
release review identified two unrelated geometric defects: the A gun's generic
taper/false MRS housing, and Vladimir's flat forward guard crowns. These are
independently source-tested physical corrections, not ERA-binding changes.
For A, a pre-correction hash pins every vertex outside the gun rig; the separate
`t90AXGun.selftest.mjs` pins the corrected barrel's measured surfaces and real
recoil ownership. For Vladimir, a pre-correction hash subtracts only the exact
72 vertices of the two old guard solids, with multiplicity. The updated test
subtracts only the exact new helper solids (every vertex must be present in the
actual tank) and matches all remaining vertices to that immutable hash. No
spatial box, whole hull, material bucket or ERA surface is exempted. All
actual strip, hit-face containment, fixed-backing and reset assertions remain.
