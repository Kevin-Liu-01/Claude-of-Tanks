# K2 X — independent owner-source reconstruction

Status: **release-qualified — 2026-09-06T10:49:59.926Z**.
The final **2026-09-06T10:06:54.116Z** capture records raw fidelity
**95.25005966274296**, minimum whole view **92.97291811746518**, and raw
geometry minimum **92.97291811746518**: [exact fidelity](k2_x.fidelity.json),
[exact geometry](../../geometry-gate/k2_x.json).
All registered valid 92-point floors pass; strict band/shoe/full-sweep
intersections and continuity holes are zero.
Fused-source hull/turret/gun component scores remain N/A, not synthetic passes.
Mandatory anatomy/assets, 510 selftest files, typecheck and private/public builds passed in the composed
batch. The checkpoints below are historical; source-use restrictions and
acknowledged physical simplifications remain unchanged.

`buildK2X` in `src/vehicles/profiles/k2X.ts` is additive; the existing K2
builder remains unchanged. It constructs its own enclosed hull, modular
turret shell, fittings and single animated native track course. No source
mesh, buffer, texture, rig or donor builder is imported at runtime.

## Provenance and comparison boundary

The owner supplied `k2_black_panther_armored_warfare.glb`, SHA-256
`3e514bedb40be0fde6787dad6513f625ba077cd0c1da04d29defe94e9c156140`.
Embedded metadata names KojfDiscord and CC-BY 4.0; the
[source title](https://sketchfab.com/3d-models/k2-black-panther-armored-warfare-af7a16423faa4530953fa801caace65a)
names Armored Warfare. Its live description and tags remain empty, so
provenance is inconclusive rather than independently verified original.
The existing owner adjudication permits local-only measurement/influence.
The ignored oracle is `public/models/community-candidates/k2_x_source.glb`.

## Measurements and distinct physical features

The input has 184,062 triangles in 29 mixed material meshes. It already
uses metres, Y up and Z forward; canonical coordinates only add
`(0,.0045,-.13185)`. Full width is 3.71906 m, hull length 7.8535 m and
overall length 10.84482 m. The nominal structural roof is 2.369 m, source
P95 broad body height 2.997 m and highest antenna tip 4.73527 m.
The trunnion is `(0,1.99253,1.36815)` and muzzle Z 6.91807 m.

The 7.8535 m hull measurement includes front guards and the narrow aft
supports. The core armor island itself is 7.3418 m (raw Z −3.5918…3.75),
while the gate's filtered body length is 7.566 m. The runtime separately
constructs that core and the fittings, rather than lengthening its rear
armor wall to approximate the full exterior envelope.

The source has separate nearly vertical rear flank armor cassettes, three
sloping forward modules per side and pointed fore-cheeks surrounding a
stepped mantlet. The rear carrier contains individual stores and open
rails; it is not a full-width solid bustle. Paired roof sensor cradles
retain the opening between inclined supports. The left GPS berth and
tall rear commander optic are different devices with different datums.

Six source wheel stations per side are `[-2.17585,-1.28085,-.38585,.50915,
1.40415,2.29915]` m, radius .3225 m, axle Y .4095 m. The rear sprocket is
Z −2.80685/Y .8265 and front idler Z 3.18415/Y .8175. Native pad reach
requires bottom-course center Y .095 m for actual ground contact at zero;
wheel and end stations are not displaced to copy static-source overlap.

## Honest verification contract

`Object_19` mixes barrel and suspension, while `Object_22` mixes turret
and skirt equipment. Invented disjoint source component masks would lie.
Whole vehicle and track masks therefore remain mandatory at 92 in every
registered view, with separate shaded scrutiny of physical armor planes.
Focused tests inspect actual structural surfaces, native instances, pad
contact and barrel vertices rather than trusting declared dimensions.
The independent 1536-pixel source-only body P95 is 2.997 m. The actual
fixed-1024 gate source P95 is 3.020 m (`referenceBodyExtent.h` in the
round-6 geometry receipt); these are resolution-specific measurements,
not structural-roof heights or a reason to shorten the physical whips.

The adjacent source receipt and
`docs/research/west-x-source-inventory.md` record normalization, source
ownership and the common reproduction command.

## Historical scoped evidence — 2026-09-05, round 6

The historical 23:17:02 UTC row reported aggregate
95.68, minimum whole view 92.60 (right), track 95.37. Geometry minimum
is 92.6, dimensions 95.3 and attachment islands 100. The official standard
check measured zero front/rear/full-sweep band and shoe intersections,
zero continuity holes and one real fitting-library MG. The layered skirt
has both an inner skin and separate outer plates; the sealed continuity
result does not come from filling the exposed running gear.

Fresh neutral-clay inspection confirms the high rear armor cassettes,
sloping forward cheek modules, stepped gun berth, separate commander
optic, front lamp guards, tow eyes and three-bay rear grille. The source
still contains finer fasteners, turret-flank launcher/fixture relief,
mantlet faceting and tire/hub detail than the procedural model. Those
visible simplifications are recorded separately from the passing outline
score. Anatomy regeneration and the release gate are not replaced by this row.

## Subsequent source-detail correction and fresh proof

The gun housing is now a closed extruded section with the measured stepped
rear, raked lower and upper front and circular collar. It replaces the former
full-height rectangular mount: the old face stood 0.28 m too high at source
Z 2.36. Independent rays at seven canonical stations now match the source
within 0.002 m. Two differently inclined hood sheets preserve the actual
positive-X optic opening, its lower floor at Y 2.36023, four-sided frame and
recessed visible glass. `k2XDetail.selftest.mjs` tests those surfaces and the
empty opening in both detail levels, not builder-reported dimensions.

The source driver's hatch and three-part vision bank are on positive X;
the former oversized, elevated negative-X hatch has been removed. The port
service plate has its asymmetric stepped footprint and follows the glacis.
The independent center vision hood, low front shoulder lamps and narrow
glacis service strip are seated on the measured surfaces. The fresh
00:48:21 UTC source report scores 95.52 aggregate with every valid view
above 92 (lowest 92.324). Primary geometry minimum is 92.3, dimensions
95.3 and attachment score 100. The fresh official standard reports zero
front/rear/sweep band or shoe overlaps, zero enclosed continuity holes and
one supported machine gun. Independent shaded review accepted the new
mantlet and cavity but identified remaining buried launcher mouths and
simplified multi-eye optics. Those corrections and release checks were outstanding at that checkpoint;
the later equipment repair and completed composed release close them.

## Roof equipment and launcher-seat correction

The source GPS is a rounded housing with a genuine front slot. Its glazing
is at canonical Z .78627; the former flat front was 112 mm too far forward.
The independent replacement has the rounded shoulder, open slot and the
separate 87.9 mm high source pedestal connecting it to the roof. The rear
commander optic has eight separate round, physically recessed eyes in three
staggered rows, rather than one large rectangular glass patch. A ray at
X −.1222/Y 2.84784 reaches its source back surface at Z −1.55555.

The twelve launcher centers and their source-derived axis directions are
recorded as scalar measurements in the adjacent source receipt. The earlier
generic row was inboard of these locations. Even after moving the tubes to
their proper stations, the old outer armor wall obstructed the foremost
upper mouth roughly 95 mm ahead of the source surface. Local independently
authored cheek sections now retreat to the measured permanent armor X
1.197585 at Y 2.03/Z 1.972, retaining the thick support below the bank.
The steep inboard blade beside the mantlet is a separate measured solid;
it was not a legitimate part of that relief and must remain. Its four
source top rays and sloped underside are checked within 3 mm in both LODs.
The original measured mantlet, hood, driver and hull-deck fittings are not
modified by this equipment correction.

The local immutable round-9 receipt (01:07:15.788 UTC) is retained as a
failed proof: aggregate 94.84, whole left 90.396 against the unchanged 92
floor, right 92.120, track 94.014 and geometry minimum 90.4. The standard
stopped on that geometry failure; it is not a release pass. Comparing the
immediately preceding root detail receipt shows a +1 pixel jump across all
left contour bins, including the untouched cannon, and across the native
track bottom. The existing 384-pixel centroid-registration rounding is a
documented contributor, not a reason to move correct geometry or change
the gate. The round-9 physical ray diagnosis additionally found an actual
missing inboard blade and missing GPS pedestal, which were corrected before
the next capture. Source-mesh component masks remain unavailable, honestly.

## Historical scoped evidence — round 10

The historical complete 01:24:19.419 UTC row recorded the following,
after restoring the source inboard blade and pedestal: aggregate 95.10,
track 94.03, and all nine mandatory whole views pass the unchanged 92 floor.
The exact displayed rows are front 96.70, front-left 94.85, left 92.46,
rear-left 95.84, rear 95.99, rear-right 95.68, right 92.84,
front-right 94.65 and top 99.07. Geometry minimum is 92.5, dimensions 95.3,
and attachment islands 100. The fresh official standard passes with zero
front/rear/full-sweep band and shoe intersections, zero continuity holes
and one real fitting-library MG. The original mantlet/hull detail tests and
the new equipment surface/cavity tests pass in high and low detail.

Fresh equal-clay inspection shows the actual rounded GPS slot, multi-eye
rear head and separated launcher mouths instead of blank armor over the
bank. The steep armor beside the gun remains present, not an enlarged
launcher recess. The source still has denser hatch/roof hardware, finer
launcher mount relief and side-panel hardware than the authored model;
the numeric result does not claim those interiors or small fittings are
identical. Final fleet anatomy and release proof subsequently passed separately.
