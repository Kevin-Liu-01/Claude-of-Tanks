# Geometry methods: a source-first cookbook

Use this page while authoring one scoped model or repair. It supplies construction
recipes, not another gate definition or a claim that the linked tanks all passed.
Read [workflow](workflow.md), [BUILD-STANDARD](../BUILD-STANDARD.md) and
[GEOMETRY-GATE](../GEOMETRY-GATE.md); use [tool map](tool-map.md) for commands.

The [September source-freeze contract](../research/source-x-second-wave.md)
takes precedence over archived fitting shortcuts in older documents/comments.
Freeze source bytes, a source-only rigid frame and any declared uniform unit/size
scale before optimizing the candidate. Do not nonuniformly warp the oracle,
reshape its height percentiles, hide visible furniture from comparison masks, or
add counterweights merely to improve a score. Preserve incompatible source/physical
requirements as explicit failures or owner decisions, not manufactured passes.

## 1. Freeze a coordinate contract before drawing solids

Record raw and canonical source hashes, unit conversion, handedness, axis mapping,
ground datum, selected source owners, fixed cameras and landmark uncertainties.
The game uses metres, +Y up and local +Z forward. Verify bow, sight side and axle
positions; a source's “left” label or a screenshot's horizontal axis is insufficient.

Keep these quantities distinct:

| Datum | Measure and retain |
| --- | --- |
| Hull | Structural bow/stern, belly, deck and shoulder stations |
| Turret | Bearing centre, lower stock, roof, cheek ridge and bustle stations |
| Gun | Tube centreline, receiving sleeve, inferred/measured pivot, muzzle plane |
| Gear | Each side's axle centres, radii, axial bands and complete shoe envelope |
| Instruments | Fixed optics and antenna extrema, separate from structural roof |

Source nodes can establish ownership; fused meshes cannot invent independent rigs.
Keep complete-source comparisons when a component cannot be separated honestly.
Do not delete awkward attached parts to improve a component score. An isolated
part study is diagnostic; full-source first hits remain the reference for air.

The [registration certificate](../../tools/source-world-registration.mjs) verifies
canonical bytes and frame anchors. [Classic Leclerc's frame](../../src/vehicles/profiles/leclercClassicXFrame.ts)
shows separate structural/instrument heights, asymmetric axle positions, and an
explicitly inferred gun-pitch location. Convert canonical points into their owner
frame once; do not subtract a pivot twice or recenter every accessory independently.

## 2. Turn landmarks into joined station lofts

Start with front, side, top and rear readings, then sample intermediate sections
where a plane, slope or curvature changes. Record source stock intervals as well
as outer bounds. A component AABB is a search region, not proof of a filled cuboid.

For a hull or turret, use rows such as `z, leftX, rightX, floorY, crownY`, adding
explicit shoulder/ridge points where needed. Interpolate within a measured span;
do not extrapolate a single ray into an entire side wall. Preserve real asymmetry.
Author sparse scalar/plane recipes; never embed copied mesh indices, dense source
vertices, or sampled source topology as a purported procedural reconstruction.

The [sectionSolid primitive](../../src/vehicles/profiles/sectionSolid.ts) joins
corresponding XY contours along increasing Z and triangulates both end caps:

1. Use the same meaningful contour-point order/count at every station.
2. Keep each XY ring counter-clockwise when viewed from +Z; reject collapsed edges.
3. Join adjacent stations, not separately capped overlapping boxes at every row.
4. Clamp bevels to the local available width/height; a tiny terminal section must
   not inherit a bevel larger than half its stock.
5. Test closure, triangle area, outward normals and independent between-row rays.

[Classic Leclerc's turret](../../src/vehicles/profiles/leclercClassicXTurret.ts)
uses separate floor/crown/side values and local bevel limits. Its method is useful;
its station numbers are not a family-wide template. A slope must shape the whole
volume, including its underside and ends, not merely a thin plate over a box.

## 3. Model material and negative space separately

“Closed armor” means a coherent boundary around actual stock. It does not mean
making every empty part of the vehicle solid. Choose the construction by function:

| Feature | Construct | Preserve/test |
| --- | --- | --- |
| Structural armor | Joined closed volume, real returns/caps | No accidental seam or missing wall |
| Sight hood | Side/top/bottom stock, recessed back/lens | Mouth relief and actual glass first hit |
| Mantlet opening | Fixed receiving armor plus moving housing | Source-sized clearance throughout pitch |
| Basket/slat rack | Closed individual rails, posts and real floor strips | Open bays between members |
| Tow eye/guard | Annular or folded stock and authentic supports | Through-hole, under-web air |
| Wheel bay/bustle | Measured boundary surfaces | Ground channel and intentional daylight |

Use bounded finite rays with explicit origin, direction, far distance, expected
owner and first/back surface. Pair a stock hit with an adjacent air witness.
Hold some samples out of the authoring fit and test the complete candidate scene,
not just the new helper. Another assembly can cap an otherwise correct opening.

Glass is material, not air: an open steel frame may contain a thick closed pane.
Check isolated metal and full-source glazing separately. A black rectangle is not
a recessed optical mouth; an arbitrarily hollow window is not faithful glazing.
[Classic roof/sight construction](../../src/vehicles/profiles/leclercClassicXTurret.ts)
and [the open Char Leclerc rack](../../src/vehicles/profiles/leclercXRearRack.ts)
illustrate different answers. Do not relabel solid armor as lattice to evade a
continuity test. Source-real air that conflicts with that test stays disclosed.

### Hull, glacis, shoulders and skirts share boundary datums

Do not build a floating shoulder cover over a separate narrow hull wedge.
At each bow/crest/side station, measure the central glacis edge, shoulder ridge,
outer skirt top and under-sponson stock. Reuse their shared vertices/datum
functions so the joining faces continue the same intended rake. A longitudinal
deck plane can be written `y(z)=yCrest+(z-zCrest)*(yNose-yCrest)/(zNose-zCrest)`;
evaluate the shoulder's inboard edge there, then use the measured lateral rake
to reach its outboard edge. Confirm the finite spans before extending that plane.

The lower glacis meets the upper at the real nose knee; it does not become an
inverted triangular pocket. Close the volume beneath the deck with the actual
belly/side walls, leaving the wheel channel outside it. Attach front mudguards
to a continuous shoulder hinge/return, with their lower edge clear of the full
moving shoe envelope. Join rear skirts to the rear bodywork at matching measured
stations; preserve access doors, exhausts and track departure clearance.

When moving tracks inward, move their complete canonical assembly and remeasure
skirt clearance—not isolated visible wheels. When extending a rear hull only,
keep explicitly fixed track/end-wheel datums. Test continuity at intermediate
stations and from both low front/rear quarters; coincident-looking silhouettes
are not proof of physical closure. Reuse bodywork helpers only after inspecting
their actual source-specific station contract.

## 4. Prove winding and closure in the rendered path

Check finite vertices, nonzero triangle areas, matched boundary edges and outward
orientation. A valid station ring alone does not prove every warped joining face
is sound. Supply compatible position/normal/UV attributes before merging geometry.
Recompute appropriate normals after changing shape; retain hard creases deliberately.

Reflection changes handedness. Reverse reflected triangle winding where required;
do not repair inside-out stock by switching the material to DoubleSide. Check both
sides under ordinary FrontSide shading as well as CPU rays and silhouette masks.
For instanced/batched geometry, verify the actual renderer path: a parent transform
and a per-instance negative scale need not receive the same culling treatment.
If mirroring is baked into geometry, test positions, winding and moving-axis parity.

Use [sectionSolid's regression](../../src/vehicles/profiles/sectionSolid.selftest.mjs)
as a primitive starting point, then add model-specific surface/air tests. A clean
topology test does not certify source likeness, and an attractive mask can conceal
reversed faces. Inspect normal-material quarter and underside views too.

## 5. Build chevrons, backing and bustle undersides as real forms

A chevron needs an upper face, shared projecting ridge, lower return, roots and
terminal closures. Build one continuous cheek volume where the target has one;
avoid stacked wedge slices with internal caps or a flat donor cheek behind the ridge.
The `closedLeopardChevronCheek`/roof-bridge functions in
[leopard.ts](../../src/vehicles/profiles/leopard.ts) and their
[focused test](../../src/vehicles/profiles/leopardChevronTurretFront.selftest.mjs)
show joined-course construction. Historical normalization comments there are not
instructions to alter a new source oracle.

Permanent spaced armor is not automatically ERA. Put the load-bearing cheek and
authentic backing in permanent geometry. Only genuinely removable cassettes/skins
belong to the exact destructible sector; keep brackets and optical stock outside it.
Bind real directed hit faces to the named sector, not just an empty marker group.
Test intact → spent → reset using actual geometry and shot surfaces in both LODs.
[Leopard X's ERA test](../../src/vehicles/profiles/leopardXEraBinding.selftest.mjs)
checks exposed stock, retained backing and immutable permanent buffers.

For a rising bustle underside, measure floor height at several longitudinal and
lateral stations independently of the roof. Join the underside to the rear wall
and side returns; don't extend a tall rectangle down through the source's air.
[Char Leclerc's canted rear stock](../../src/vehicles/profiles/leclercXRearRack.ts)
uses analytic sloping surfaces and separate rails rather than an AABB filler.

## 6. Solve gun direction, seat and articulation together

Measure breech/sleeve/evacuator/muzzle stations on the actual centreline. An eccentric
evacuator or oval mantlet is not necessarily centred on that line. Keep the source
muzzle and trunnion contract separate from the spec's nominal barrel length.

Verify primitive direction before authoring a tapered barrel. In
[factoryGeometry.ts](../../src/vehicles/factoryGeometry.ts), `cylY(top,bottom,h)`
puts `top` at +Y; `cylZ(rFront,length,segments,rRear)` rotates that end to +Z.
Swapping the radii reverses a gun frustum. Use a longitudinal section/lathe for a
compound tube rather than stretching an unrelated existing barrel.

Construct the muzzle annulus, interior wall and measured recessed termination;
ray-test the complete visible factory output for a later fallback disc or cap.
Seat the mantlet in real receiving armor. [Type10's seat contract](../../src/vehicles/profiles/type10GunSeat.ts)
is a model-specific example of mouth, moving housing and muzzle datums—not source-X
coordinates to copy. Test neutral, elevation and depression after turret traverse.

Author an MG's receiver, barrel, feed, cradle, optics and relevant shield in a
coherent station frame. Yaw the whole station; articulate the weapon about its
actual trunnion instead of rotating only a translated barrel away from its receiver.
The fitting builders in [kit.ts](../../src/vehicles/profiles/kit.ts) document local
+Z firing and a mounting-foot origin. Reuse only a source-supported installation.
A source with an empty mount cannot be “fixed” by inventing a gun or an MG flag;
report the source/mandatory-weapon conflict explicitly.

## 7. Seat equipment on its actual receiving surface

Find the local surface under the entire intended foot, not the highest point of
the roof, cupola or bounding box. For a measured plane `n·p=d`, solve
`y=(d-nx*x-nz*z)/ny` where `ny` is safely nonzero and the point lies inside its
finite face. Use another projection or a finite ray for near-vertical stock.

Align the foot to that surface normal, then establish an actual contact chain:
main stock → bracket/base → hinge/bearing → accessory. Shared parenting and
overlapping bounding boxes do not establish physical contact. Test real surface
intersections or bounded receiving rays at the feet and intermediate links.
Keep clearances beside those links; don't add a broad pedestal through source air.

A concealed seating overlap is a documented construction inference, not a source
measurement. Bound it, preserve the exterior silhouette and test neighbouring air.
Rerun these checks after changing the supporting roof or bustle. Inspect the full
scene at multiple turret/gun poses; an isolated correctly seated helper can still
collide with another owner's sight, receiver or glass.

## 8. Freeze the running-gear datums before tuning body clearance

Record road/end/return axle positions, radii, axial face layers, tire bands, tooth
crowns, track centre planes and support/contact stations. Do not assume bilateral
symmetry if the source supplies different centres or wheel spacing. Keep wheel
face details attached to the actual spinning wheel, not a static overlay.

Use one integrated animated course. [Classic Leclerc gear](../../src/vehicles/profiles/leclercClassicXGear.ts)
passes measured road/end-wheel data, tire bands, shoe cross-sections and a supported
loop to the shared running-gear builder. Distinguish physical wheel radius, effective
track-contact radius and tooth-tip radius; changing one does not justify moving all.
Measure turned rim/bowl/hub profiles and voids before adding generic proud discs.

Clear the complete shoe: pad, web, grouser, pin caps, connector and guide horn, not
only the continuous carrier band. Test bilateral front/rear wraps and strict full
sweep across track phases and both LODs. Read the band and shoe columns separately
in [the clip audit](../../tools/track-clip-audit.mjs); band zero can hide shoe overlap.

If a guard intersects the sweep, first distinguish wrong guard stock from wrong
gear datums. Do not narrow shoes, shift axles, raise the whole tank or hide guards
solely to erase a failure. Contradictory source tooth/course geometry requires an
explicit target decision, with any mechanical departure still reported against source.
[Char Leclerc's link test](../../src/vehicles/profiles/leclercXTrackLinks.selftest.mjs)
pins native course matrices/default buffers while probing pad, connector, cap and air.

## 9. Treat markings as physical surface geometry

Place unit marks on intended permanent visible stock with sufficient size and
clearance. An anchor record or a centre-only ray cannot prove the whole quad fits.
Test corners, edge midpoints and centre with short inward first-surface rays, then
independent outward-view visibility rays so buried/occluded paint cannot pass.

Repeat with high/low geometry, turret yaw, generated and solver seat paths, and
all removable armor spent. Verify the intended owner remains the first support;
don't bless markings mounted only on a disappearing ERA cover or hidden furniture.
See [marking policy](../../src/vehicles/vehicleMarkings.ts) and
[source-X physical marking tests](../../src/vehicles/sourceXSecondWaveMarkings.selftest.mjs).
Sampled ray coverage is bounded evidence, not visibility from every possible angle.
If preservation tests remove paint for comparison, authenticate only the exact
decal geometry; never exempt arbitrary named meshes or their physical children.

## 10. Separate visual stock from main and auxiliary collision armor

A correct render can retain ghost-hittable donor plates. Main-shell calibration
does not automatically replace every inherited spaced skirt, cheek or rear cage.
Audit each auxiliary owner against actual authored stock and keep intended donor
protection values separate from spatial placement. Never blanket-delete real armor.

Use finite ordered planar convex outlines for the opt-in polygon tracer. Split
concave/warped stock into valid facets without artificial seam gaps. Preserve actual
panel openings, source-owned ERA and hull/turret/gun ownership. See
[auxiliary primitives](../../src/vehicles/sourceXAuxArmorPrimitives.ts),
[scoped replacements](../../src/vehicles/sourceXOtherAuxArmor.ts) and
[the tracer](../../src/sim/armor.ts).

`surfaceGroup` identifies one physical continuous surface: coincident hits in the
same impact frame within 1 µm are deduplicated, not all layers along the ray.
Distinct-depth armor must remain distinct. Where one intended protection layer
uses outer panels plus exposed backing, clip backing to uncovered regions rather
than charging a full inherited thickness again behind each outer panel. The
[exposure helper](../../src/vehicles/sourceXAuxArmorExposure.ts) preserves exact
cut boundaries; half-open edges are boundary ownership, not permission to shrink stock.

Test positive hits on real stock, negative shots through gaps/old ghost locations,
seams, depth layers, turret/gun poses and live/spent/reset states. Pin non-target
geometry and metadata. Regenerate anatomy through the workflow; do not edit generated
cells or receipts to conceal a hole, missing weapon or failed collision assertion.

## 11. Close a bounded iteration with evidence, not a magic number

Historical requests such as “move by 0.50 m,” “use 0.42 m,” or “reduce by 10%” are
case-specific deltas, not universal dimensions or clearance rules. Record the exact
part, owner frame, starting revision and requested operation; remeasure the resulting
seat, envelope and protected air. Do not apply a percentage to the whole source.

Before freezing, retain source/candidate hashes, changed parameters, held-out
stock/air/contact results, original-buffer preservation and actual high/low posed
views. Label measured, inferred and deliberately divergent features separately.
Run the required full comparisons/integration via the workflow; local closure and
contact tests do not replace raw per-view scores or independent shaded review.
Do not claim visual exactness from a passing outline average, technical diagram,
attachment count, or one attractive hero shot. Preserve the worst remaining form
defect and the next bounded action in the handoff.
