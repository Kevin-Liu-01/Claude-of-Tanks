# Merkava Mk4 X — independent owner-source reconstruction

Status: **release-qualified — 2026-09-06T10:49:59.926Z**.
The final **2026-09-06T10:06:54.116Z** capture records raw fidelity
**94.0478197190329**, minimum whole view **92.67653035592014**, and raw
geometry minimum **92.67653035592014**: [exact fidelity](merkava4_x.fidelity.json),
[exact geometry](../../geometry-gate/merkava4_x.json).
All registered valid 92-point floors pass; strict band/shoe/full-sweep
intersections and continuity holes are zero.
Fused-source hull/turret/gun component scores remain N/A, not synthetic passes.
Mandatory anatomy/assets, 510 selftest files, typecheck and private/public builds passed in the composed
batch. The checkpoints below are historical; source-use restrictions and
acknowledged physical simplifications remain unchanged.

`buildMerkava4X` in `src/vehicles/profiles/merkavaX.ts` adds a first-party
Merkava with its own hull, raised asymmetric turret armor, fittings, open
basket and one native animated track course. The prior vehicle remains
unchanged; no source geometry or donor builder is a runtime dependency.

## Provenance and corrected source pose

The owner supplied `merkava-mk4.zip`, SHA-256
`2ca6d0ef5c096e5975b629dd8e429c88333f63390ab153da293215a10846b7b4`.
[arlassar's original artist model](https://sketchfab.com/3d-models/merkava-mk4-5720c5369ea24c71af475aff769ffa8b)
claims CC-BY 4.0 and matches the existing original-Maya provenance record.
The source has 224,715 triangles in one fused mesh with approximately
1,968 position-connected islands. It is a local authoring oracle only.

The original 4.88 m normalized width warning was primarily a posed-turret
envelope: face normals and shaded inspection reveal +25° displayed yaw.
Whole turret/equipment islands are rigidly rotated −25° around source
`(0,0,-1.03)`, including detached chain links but excluding the front hull
marker whips. The hull is grounded at .0073919296, centered at Z −.5225
and uniformly scaled by `7.60/9.875`. There is no pointwise deformation,
cropping or axis-specific stretch. The corrected full width is 3.77689 m,
about 1.5% wider than the approximately 3.72 m
[AUSA comparison](https://www.ausa.org/sites/default/files/publications/LWP_109_Role_of_the_Tank_in_Modern_Warfare.pdf).
That residual equipment-envelope difference is recorded, not erased.
The ignored canonical oracle is
`public/models/community-candidates/merkava4_x_source.glb`.

## Measured geometry and datums

Hull length is 7.600 m and overall length 8.70504 m. The broad rear turret
roof is Y 2.401; asymmetrically raised armor reaches 2.565; cupola 2.702;
panoramic sight 2.833; roof MG approximately 3.003; antenna 4.9327283 m.
Source P95 broad body height is 2.996 m at 1536 pixels but **4.655 m at
the actual 1024-pixel gate**: four narrow whips occupy enough coarse
columns to enter P95. Both source and candidate give 4.655 m there; the
gate metadata uses that source result without shrinking the real whips.
These are different datums, not contradictory structural roof heights.
Turret pivot is `(0,1.605,-.3906)` and bore `(0,1.9934619,1.93)`;
muzzle Z is 4.805527 m. The slight source bore X offset +.0221 m remains
documented; the runtime articulation is centered for the game rig.

The raised roof slopes toward the gun with independent left/right edges
and measured multi-break transverse shoulder sections. Six smoke
tubes per side occupy measured high shoulder rows. The rear basket narrows
from approximately X ±1.60 near the turret to ±.944 at Z −3.645, with
open horizontal rails, a thin actual floor and weighted chains below.
It is not a broad flat rectangular rear shelf. Two front marker whips remain
hull-owned and distinct from the four taller turret whips.

Six road wheels per side retain Z `[-2.062,-1.267,-.199,.739,1.617,2.417]`,
radius .3467 and axle Y .387 m. Front sprocket is Z 3.285/Y .761; rear
idler Z −3.020/Y .722. Native bottom-course center .0956 m makes physical
pad contact ground zero; its hidden front tub clearance does not widen or
raise the source-visible bow guards.

## Verification contract

The fused source does not support honest disjoint component masks. Whole
vehicle and track evidence remain mandatory at 92 in every registered
view, independently accompanied by shaded armor/cage inspection. Actual
roof rays, closed hull stations, native wheel instances, muzzle vertices
and ground contact are tested in both LODs.

## Historical scoped evidence — 2026-09-05, round 6

The historical 23:17:02 UTC row recorded:
aggregate 93.92, minimum whole view 92.43 (rear-right), track 95.16.
Geometry minimum is 92.4, dimensions 100 and attachment islands 100.
The official standard check returned zero front/rear/full-sweep band and
shoe intersections, zero continuity holes and two real fitting-library MGs.
These are scoped authoring receipts; final anatomy regeneration and the
release check remain separate requirements.

Neutral-clay review of the fresh board confirms the asymmetric raised roof,
descending bow, forward marker whips, four tall turret whips, thermal-sleeve
clamps, coax cradle and leaning open basket are actual geometry. The chain
curtain remains open rather than a filled block. Residual simplifications
are visible: the glacis has fewer small lugs/fasteners, roof panel seams are
coarser, and native wheel/hub/link relief differs from the artist model.
The native front running gear is more exposed in the hero view. Numeric
passing evidence does not assert identical surface detail or copied mesh
topology. The profile was reopened for the correction below.

## Medium-form correction — 2026-09-05 local, round 8

Independent neutral-clay review rejected the coarse triangular side tiles
and invented center-deck grille. Fixed source rays showed those tiles
lifted the outer rim by 10–14 cm. They are replaced by a first-party
multi-break shell whose slope steepens outward. At Z −.8, source top
heights at X 1.2/1.4/1.6 are 2.43468/2.27288/2.11827; at Z 0,
X 1.4/1.6 are 2.24960/2.09345. Seven protected shoulder rays agree
within 13 mm in both LODs. The asymmetric central raised roof is retained.

The right engine-access pack now has its measured 739.9 × 501.7 mm base
cover, 498.0 × 230.1 mm sliding upper cover and two separated hinge
saddles. Their top planes are Y 1.63349 and 1.65826. The former central
radiator grille is removed; an empty-center regression prevents it from
returning. Small source-sized lifting eyes are seated on the glacis.

Round 8's historical 2026-09-06 00:49:29 UTC row recorded aggregate 93.96, minimum whole view 92.43
(rear-right), tracks 95.21. Fresh geometry is 92.4, dimensions and
attachment islands 100. The official standard passes with front/rear/full
sweep band and shoe overlaps all zero, continuity zero and MG count 2.
All thirteen X high/low articulation and marking-support checks pass.

Fresh neutral inspection confirms the lowered rolling shoulders without
the former coarse raised triangular tiles. The right service pack and
hinges now occupy their real deck station. The native remains simpler in
small turret fasteners, perimeter seams and front clamp detail, and its
native wheels/links differ in surface sculpting. The rear basket remains
open. These scoped checks do not replace final independent shaded review
or the complete anatomy/release procedure; no source or gate thresholds
were changed to obtain the pass.

## Rear-hull wing correction — 2026-09-06

Independent review of the 07:23 UTC neutral board found a projecting rear
shoulder beneath the basket. Exact canonical-source rays confirmed a real
structural-hull error, not the documented turret pose or a basket-floor
error. At X ±1.5, the source roof at Z −3.70/−3.40/−3.25/−2.75 is
Y 1.224095/1.533695/1.565644/1.606141; the old native roof was
1.568409/1.653636/1.660066/1.637640. The basket floor at X 0/Z −3.50
was already aligned: source 1.82628 versus native 1.827, and stays fixed.

The replacement uses a low two-slope end, level rear landing and measured
forward-rising shoulder plane, normal `(0,.9967360764,−.0807291396)`.
Separate closed rear folds preserve the source's transverse asymmetry:
the uninterrupted left cover is 540.667 mm wide, while the 333.681 mm
right cover has a genuine lower central channel and narrow side rims.
At Z −3.655, the left cover top is 1.407351; right rim at X 1.3 is
1.40730; right channel floor at X 1.5 is 1.339935; exposed backing at
X 1.1 is 1.28350. A single full-width high roof would erase those steps.
The cover returns seat into the lower fold; no floating covering plane
or broad transverse shelf was added. Small surface crossfalls are
approximated within the held-out 3.5 mm envelope.

The fused source does not provide a continuous upward-facing central
hull skin under parts of the basket. The native retains a closed central
runtime core using the surrounding measured roof, explicitly an inferred
closure rather than a claimed source sample. The existing lower keel is
unchanged. All hull triangles at and forward of Z −2.0, and the complete
basket/turret/gun/equipment/running-gear geometry and transforms, remain
exactly unchanged. Mk3D is not modified.

`merkava4XRearHull.selftest.mjs` passes in high and low detail: 19 held-out
source rays, real landing/channel/basket air, seated return contact, exact
non-target geometry preservation and unchanged ground contact. The four-
Western source geometry test, full TypeScript check and focused complexity
audit also pass. Geometry was frozen before fresh scoped fidelity, geometry,
standard and the mandatory final anatomy/assets/release regeneration, all
subsequently passed;
the older render scores above do not certify this changed rear hull.

Fresh scoped comparison at **2026-09-06 08:22:35.216 UTC** records raw
aggregate **94.0478197190329**, minimum whole-view score
**92.67653035592014** (front), and tracks **93.49141224767072**. Every
registered valid view passes the unchanged 92 floor. Hull, turret and gun
component scores remain unavailable for this fused source; they are not
treated as passing measured components.

Independent local-image review of that exact fresh
`shots/procedural-fidelity/boards/merkava4_x-neutral.png`, including its
full-resolution hero and rear/side turntable views, confirms that the
previous projecting upper wing beneath the rear basket is gone. The
lower folded rear shoulder now reads as bodywork, while the narrow basket
floor, open rails and chain curtain remain distinct. No new visible
floating cover, filled basket opening or major/medium silhouette defect
was introduced by this correction. The existing coarser small fasteners,
wheel/link sculpting and more exposed native front running gear remain
documented simplifications. This was scoped visual acceptance; the separate
official standard proof and mandatory final anatomy/assets/release pipeline
subsequently passed as recorded above.
