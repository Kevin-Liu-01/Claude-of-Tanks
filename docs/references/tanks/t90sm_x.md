# T-90SM X — owner-source reconstruction

Status: **release-qualified — 2026-09-06T10:49:59.926Z**.
The final **2026-09-06T10:06:54.116Z** capture records raw fidelity
**97.2673499027235**, minimum whole view **96.51064798186457**, and raw
geometry minimum **92.44447466576615**: [exact fidelity](t90sm_x.fidelity.json),
[exact geometry](../../geometry-gate/t90sm_x.json).
All registered valid 92-point floors pass; strict band/shoe/full-sweep
intersections and continuity holes are zero. Mandatory anatomy/assets, 510 selftest files, typecheck and private/public builds passed in the composed
batch. The checkpoints below are historical; source-use restrictions and
acknowledged physical simplifications remain unchanged.

The empty auxiliary-drum cradles use independently measured curved 9.79 mm
webs and separate 50.92 mm bearing rails, not filled rectangular brackets.
At X 0.374 and Z −4.0/−3.9/−3.8, source web lower heights are
1.18285/1.16479/1.17071 m, and rail upper heights are
1.25654/1.23833/1.24556 m. Actual-mesh rays test these within 8 mm.
The right outer cradle is offset +2.99 mm vertically and +8.42 mm forward.
Road-wheel face fasteners now follow the measured tire envelope rather than
extending 23 mm beyond it; track lanes and native axle ownership are unchanged.

Historical checkpoint: independent `buildT90SMX` passed the fourteenth raw exemplar,
official standard, muzzle and barrel checks. Independent neutral review
accepts the major forms, true apertures and final source sleeve/glacis fittings.
Geometry was frozen before the now-completed full-fleet release. Existing T-90SM
geometry is unchanged.

The eleventh proof passed every valid fidelity component/view (97.1 aggregate)
and both turret curves, but its 87.1 geometry minimum still failed. Subsequent
source-only checks exposed the low engine-cover channel, transverse tub
crossfall, thicker axle-end forgings, and separate low fender sheet beneath
the narrower raised side casing. These are now distinct first-party closed
surfaces with high/low actual-mesh tests. The source's genuine rear tow-eye
air and continuous curved cable are separately checked; subsequent full proof
and final certification passed. Native wheel, suspension and end-casting
datums are recorded in [the scalar gear packet](t90sm_x.running-gear.json).

After the eighth proof, independent source review identified a 110 mm aft
error in the commander hatch, a full-height RWS box occupying 244 mm of
source air at its ends, and missing substantive forward side support wedges.
The measured commander seat is X 0.70042/Z −0.06046 with Y 2.27283–2.37103;
the loader lid is centered at X −0.49502/Z −0.34206. The RWS has a rounded
Y 2.42786–2.53203 base and a clipped central housing up to Y 2.77527, with
its actual forward optical recess retained. Thin forward optic retainers
extend to Z 0.62753; the whole sight housing is not extended into that air.
Original closed side-support primitives preserve measured roof crossfall:
at Z 0.60, source Y is 2.03170 at X −1.69 and 2.03885 at X 1.69.
The rear cage's outer X 1.89 extremum is a short foot near Y 1.016, not a
tall full-depth post. The rounded front guard narrows to X 1.460 at Z 3.90
and X 1.241 at Z 3.95, with separate thin inner returns. Actual mesh rays
and absent-surface assertions pin these distinctions. These physical changes
required fresh full comparison; the eighth geometry minimum was 84.6/92,
and its right turret fidelity view was 89.68/92, so it was not certified.

Owner archive `t-90sm-main-battle-tank.zip`, SHA-256
`53e8b435e25a22fd862af6f1f64508605ee23b64744c096476ea0e7bf20de5e4`.
Its nested `T-90SM Main Battle Tank.obj` SHA-256 is
`0a416d2e1f32624c3fd381f1806747c769b79befa5f6d8496aec13ef950b88e0`.
Title, May 1, 2025 publication date and 78,691 triangles match
[Muhamad Mirza Arrafi's listing](https://sketchfab.com/3d-models/t-90sm-main-battle-tank-35968fbefd9a4188a18ca9163ea3e175),
which declares CC Attribution. The original archive contains no separate
author/license record; no confirmed commercial-game extraction was found
during this inventory. Source files remain local-only pending provenance
review, not redistribution-cleared assets.

The OBJ was exported from Blender 2.82 and references a missing
`untitled.mtl`. It contains 27 mesh nodes, including twelve overlapping
track-phase meshes, six paired road-wheel nodes and two paired end-wheel
nodes. These redundant export phases must never become multiple runtime
track courses. A stray `wheel` node is only one triangle.

`misc_a` contains the upper/turret assembly and `misc_b` the main gun. They
are geometrically separate but **all** OBJ origins are zero and every mesh is
unparented; a true turret yaw axis and gun trunnion must be measured rather
than inferred from those empty transforms. Other major groups are `chasis`,
`bronya`, `details`, and `tross`.

Imported Blender world is Z-up, with the cannon toward positive Y. Raw whole
bounds are X -2.508639…2.471946, Y -5.561650…8.337869,
Z -0.940820…3.209809. Uniform width registration to 3.78 m gives total
height 3.1501 m and overall length 10.5490 m. The nominal chassis spans
10.058933 source units and includes equipment; hull/deck planes require
separate measurement before published-dimension normalization. The source's
large squared bustle and side stowage must retain their actual structure
and supported negative space.

Required certification remains 92 in every valid source component/view,
dimensions within 3%, actual-geometry tests, one native suspension-driven
shoe course, positive solid body skins and independent shaded inspection.
No source geometry or texture payload enters runtime.

## Final structural registration and authored distinction

The owner explicitly authorized local comparison of the supplied batch on
2026-09-05; this does not permit redistribution. Source axes `(X,Z,Y)` map
to game XYZ, with reflected face winding corrected for rendering. XY scale
is 0.7589462293 and Z scale is 0.8012599989. The largest closed chassis
island, not the whole equipment-containing `chasis` mesh, sets the centered
6.86 m hull. The same scale is applied to every barrel and rack point.

| Measured source-fit datum | Metres |
| --- | ---: |
| Structural hull / external hull including racks | 6.8600 / 8.0598 |
| Width / complete gun-forward overall | 3.7800 / 11.1371 |
| Full roof-equipment height | 3.1501 |
| Main turret shell width / length / roof | 2.8712 / 3.2111 / 2.2893 |
| Side-bin extremities X | -1.7862 / 1.8254 |
| Main muzzle Z / bore Y | 7.0399 / 1.90309 |

The 11.14 m full envelope is a source-fit outcome, not a published real-world
overall-length claim. Inferred physical yaw and gun pivots are
`(0.008,1.532,0.359)` and `(0.001,1.90309,1.56)` respectively. Separate
`misc_a`/`misc_b` ownership supports upper/gun masks, but there are no native
animation pivots or source motion clips. Every source track phase is retained
in the ignored oracle; the runtime intentionally has just one moving native
course with six paired wheel stations.

The procedural SM has a separately shaped solid hull/turret, broader side
bins and deeper full rear bustle cage than M, tall asymmetric Kord station,
independent optical heads, Relikt side modules and rear empty drum brackets.
Actual-geometry tests inspect closed bow/rear caps, roof rays, measured
barrel-tip vertices, twelve moving wheel instances and rigid yaw behavior.
`tools/t90x-source-oracle.py` recreates only local ignored reference files.

The source-only filtered body extent is 7.770 m long and 3.113 m high in the
shared 1024-pixel/P95 geometry pipeline. It intentionally excludes the thin
rear mounting brackets from the substantial body span; the complete 8.0598 m
exterior hull envelope is still reported separately, as are the 6.86 m
structural hull and 2.2893 m main roof. No native measurement sets a target.
Source wheel-face depth is independently seated inside the source-sized
tire/track envelope using the optional axial face-depth control. The
pressed face/rim/bolt geometry uses native suspension-bound layers.

The separate rear bustle antenna is at X 0.79786/Z −2.33438 m and rises
to Y 3.05142 m; it is not the roof weather mast. Source empty drum brackets
form four narrow rails at X approximately −0.806/−0.365/0.374/0.800 m,
ending near Z −4.097 m. Rear side-rack horizontal bars are about 0.005 m
high and 0.050 m deep, preserving open standoff air. The source also has a
large asymmetric left rear housing below the deck. All are original
primitive reconstructions of these measured parts.

Source hanging skirt skins are only about 0.01273 m thick, with the
scalloped lower edge reaching Y 0.44108 m. The forward fender decreases
from approximately Y 1.53 over the rear deck to 1.27 at Z 3.70 m, before
the end flap. Source outer/full shoe-guide spans are 0.0555/0.1388 m.
The source omits separate hidden return rollers; three native support
circles at Z −1.65/0.37/2.096, Y 1.055 and radius 0.110 m are explicitly
inferred beneath its measured return run, not attributed to existing mesh
nodes. Source outer track maximum Y 1.27840 m remains the independent target.

## Seventh local proof and physical corrections

The left rear exhaust casing has a 0.9453 m lower floor only aft of the
drive wheel. Ahead of Z ≈ −3.18 m, the underside steps up to 1.3196 m;
filling its full bounding box incorrectly intersects the moving track.
The folded RWS hood rises from a raked rear to its 3.115 m crown and
descends again at the front. Close-seated cheek covers are about 0.319 m
wide in their oblique mounting plane; narrow 0.048 m source islands are
ribs, not the broad panel covers.

The seventh local proof clears official exact strict front/rear/full-sweep
bands and shoes with all zero intersections. Fidelity 96.10 remains
unqualified because the right turret view is 89.55/92; primary geometry is
81.3/92. Actual-mesh rays pin the exhaust underside and folded hood.
These failures remain work orders, not waived metrics.

## Independent native wheel-lane and front-cheek refinement

The source track widths are 0.48891 m, with right interval
X 1.16031–1.64922 m and left interval −1.65263…−1.16373 m. The
paired road-wheel radial surfaces instead span right 1.21158–1.63341 m
and left −1.63163…−1.20981 m. Their axle centers are approximately
15 mm outboard of the track centers; they are not resized to the track.
The first-party native grammar uses 0.40954 m wheel depth (its actual tire
span is 1.03 times this), shallow faces, and a 15.135 mm road-wheel-only
outset. Band, rollers and end drums keep their source lane ownership.

Rear-to-front wheel Z stations are −1.93988, −0.98038, **−0.02818**,
0.87757, 1.77558 and 2.70061 m. Corresponding absolute axle heights
are 0.47202, 0.45513, 0.45513, 0.45513, 0.45513 and 0.51461 m.
The former positive third-station Z was a transcription error. Native
`wheelYs` preserves these rest heights through suspension and support
sampling; the unconfigured fleet is independently hash-regression tested.

The final front cheek pairs are independent forward-facing plates, not
another diagonal tile repetition. Their upper/lower folded skins reach
Z 2.037/2.161 m on the left and 2.066/2.188 m on the right. Compound
corner pieces join the diagonal course while leaving the gun aperture
open. These are newly authored closed primitives, never source buffers.

## Historical source-backed work orders and scoped proofs

The twelfth local raw proof recorded fidelity 97.2 with every valid component view
above 92, but the primary metric minimum is **91.93402320544102**, so it
did not qualify. No rounded-score pass is accepted. The remaining front
whole-body curve exposed a missing partial raised RWS rim; independent
shaded/ray review also found a wrong upper/lower bow-ERA slope and closed
smoke mouths. These are physical repairs, not changed source targets.

The bounded scalar packets and actual-mesh tests are
[hull tub and fender shoulders](t90sm_x.hull-tub.json),
[engine deck](t90sm_x.engine-deck.source-measurements.json),
[tow cable and hollow eyes](t90sm_x.tow-cable.json),
[front armor and lower lip](t90sm_x.front-era.source-measurements.json), and
[partial RWS rim and housing](t90sm_x.rws-base.json).
The launcher packet separately records its [twelve conical blind bores](t90sm_x.smoke-source.json),
[folded shelf and canted case](t90sm_x.launcher-shelf.json),
[left mounts](t90sm_x.left-smoke-mounts.json) and
[right cast carrier](t90sm_x.right-launcher-bracket.source-measurements.json).
The RWS repair retains the actual weapon receiver/barrel transforms and the
real optical recess. The front repair leaves the already-correct core hull
untouched and replaces only the separate source armor cover and rib.
The thirteenth scoped proof passes the corrected unrounded gates:
geometry **92.4444746658** and fidelity **97.2588451726**, with every valid
registered component/view above 92. Whole-body curves reach 93.2460100167;
source/spec dimensions score 98.8782082091 and floaters score 100.
The official standard check reports zero front/rear/full-sweep band and
shoe intersections, zero body-continuity holes, and one visible exact MG.
The thirteenth raw fidelity row was recorded with its source-report hash;
the linked final receipt now contains the later composed-release capture. Independent neutral-board review accepts the repaired
major forms, smoke/support/case assembly, RWS rim and corner, rear tow eyes
and cage air; it identified only bounded sleeve and glacis hardware to finish.
The [six partial upper sleeve saddles](t90sm_x.gun-saddles.json) retain actual
source roof planes and recoil ownership. Their outer legs seat inside the
smoother native jacket; the fourth central crown is buried by about 0.6 mm,
explicitly documented rather than artificially inflated. Genuine 5.26 mm-wide
axial source seams remain a disclosed fine-detail simplification.
The fourteenth proof includes these saddles plus sixteen shallow glacis ribs,
four two-stage latches, two supported narrow uprights and four separate center
covers with real recessed seams. Existing broad hull and armor planes remain
unchanged. Exact raw fidelity is **97.26765174089836** and geometry minimum
is **92.44447466576615**; every valid registered component/view passes.
Official band/shoe front, rear and full-sweep intersections are all zero,
body-continuity holes are zero, and the visible exact-MG count is one.
The muzzle probe retains a centered open bore with 132.6 luma contrast;
barrel circularity is 1.000 with 0.0 mm lateral firing-axis offset.
These exact values record the historical fourteenth report; the linked
fidelity receipt now archives the final composed-release capture.
Independent review of the fresh neutral board accepts the physical glacis
pattern, source apertures and partial saddles without any new major/medium
defect or floater. The geometry remained frozen; the mandatory final full-fleet
generated anatomy/assets/release sequence subsequently passed.

## Gameplay binding follow-up

A subsequent gameplay audit found the four inherited ERA zones were not bound
to the newly authored visible panels. Those original cover buffers and their
attached furniture now deplete correctly; underlying base covers, crosswise
rib and supporting uprights remain fixed. See [the exact-face binding audit](t90-x-era-binding.md).
The fourteenth neutral proof above predates this material/ownership repair;
fresh anatomy and shaded release evidence subsequently passed before qualification.
