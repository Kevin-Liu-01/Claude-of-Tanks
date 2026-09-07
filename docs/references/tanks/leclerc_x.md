# Char Leclerc X — independent source reconstruction

Status (2026-09-07): geometry frozen after the combined source-shoulder and
track-link correction. The latest scoped proof passes raw fidelity
97.85692719450148 (every registered valid view at least92), raw geometry
93.39087094541301, all strict band/shoe/front/rear/sweep checks0, continuity0
and actual roof-MG1. Earlier failures below are historical. Complete mandatory
anatomy, presentation/assets and release integration remain pending; this is
not a claim of visually exact reconstruction or full release approval.

## Local references and provenance

Primary: owner-supplied `char_leclerc.glb`, SHA-256
`84385d79783b4e2977567f2e136e3f7170a8b806bf67be705107205b04a1c689`.
[andertan's September 2024 Char Leclerc](https://sketchfab.com/3d-models/char-leclerc-84a0918d2f534c2eb003ab3cb3029c03)
describes itself as a retextured version of the author's old Leclerc.
Supplementary: `leclerc_tank.glb`, SHA-256
`5af3259ad6273c967e3a81b7f785a177478f87e8690376e696f827f133549707`,
[same author's June 2024 model](https://sketchfab.com/3d-models/leclerc-tank-732a16cdf688490698ba4231921ece03).
These establish one lineage, not separate evidenced S1/S2/XLR configurations.
Both claim CC BY 4.0; no confirmed AI or game-extraction declaration was found
in the inspected pages. The sources remain local references only. Runtime
geometry is independently authored from scalar dimensions, not source arrays,
topology, UVs, textures or a source-file loading path.

## Canonical frame and measurement conventions

The primary source receives a proper `[-z,y,x]` rotation and uniform scale
1.2051681351586139, anchored by the independent 3.6 m width. Translation is
`[-0.045302567526875434,-0.13214238165211875,-0.3644000229598085]`.
Source body midpoint defines longitudinal zero and source track contact defines
ground. Original hull body envelope is 7.1303053 m; overall through the actual
muzzle is 9.8043880 m. The highest structural armor terrace is 2.36494 m,
raised fixed optic 2.764625 m and slender antenna 3.0665927 m. These distinct
heights must not substitute for one another or a separately measured P95 target.

The source yaw datum is `[-0.00215336,1.40294995,0.72122934]`. The gun node
repeats that origin, which is not its physical trunnion. Straight circular
barrel cuts give bore X 0.018886 and Y 1.8791055; the rear moving housing begins
at Z 1.998880. That source-backed housing station defines the authored pitch
datum; it is not a recovered internal bearing measurement. Muzzle Z is 6.239235.

Left/right source track lane centers are −1.3158745 and +1.2727975 m; their
43.077 mm center offset is retained. Six road wheels have radius 0.3307865 m and
axle Y 0.4040425 m. Concealed native return supports are construction inferences,
subject to strict contact/sweep validation rather than asserted source detail.

## Source-specific forms

The lower tub, elevated side carriers, rigid outer skirts and deeper flexible
inner skirts are separate physical solids. The upper assembly retains its
terraced port bustle armor, starboard crew deck and narrow center spine.
Primary sight glazing at X −0.54/Y 2.10 lies at Z 1.970792 behind its forward
hood; panoramic glazing at X 0.564/Y 2.57 lies at Z 1.06488 behind a rim at
Z 1.1166. Both openings are real empty approach volumes tested on the complete
runtime assembly. The gun thermal jacket is asymmetric in vertical section,
while the physical muzzle remains circular and open. The muzzle reference
fixture and its supports recoil with the tube.

The supplied neutral source omits a roof MG. Standing BUILD-STANDARD requirements
still apply: a restrained forward/level weapon is seated on the existing crew
hatch, explicitly an owner-required gameplay augmentation rather than source
equipment. No false source attribution is made for it.

## Verification boundary

`leclercX.selftest.mjs` checks the fixed source frame, physical pitch/recoil,
both actual recessed sights, closed hull and asymmetric native lanes at high
and low quality. The source's materials split individual physical components;
all turret material fragments must be included in source ownership masks.
Tracks are fused with other hull material primitives, so a fabricated isolated
track component mask is not justified. Final comparison and release receipts
will be added only after the complete strict pipeline passes.

## 2026-09-06 running-gear and rear-service correction checkpoint

The preceding draft failed raw track fidelity (91.7084) and strict geometry
(hull 85.2606, whole 80.5323, turret 88.6492). These are historical rejection
values, not qualification. A fresh comparison remains required after this
source-backed correction.

The actual road-wheel centers are X −1.3349235/+1.2513905, distinct from the
unchanged track lanes. Source road-body width is 0.526689 m. Drive casting
centers are −1.336972/+1.2502425; idler centers match the road centers. Native
wheel/end offsets now preserve this asymmetry through spinning rather than
moving the belt. The drive's central painted ring radius is 0.29132 m and its
separate tooth crown radius is 0.389405 m: the former generic recipe produced
an oversized crown. End Y/Z remain the original independently measured mean
stations; the source's few-millimeter left/right Y/Z differences are not
claimed reproduced exactly.

Object_5's tread-plate islands span X 1.009449…1.534776 (525.327 mm) while
separate end connectors extend the total span to 636.079 mm. The concealed
continuous carrier now uses the plate span, not a solid pin-to-pin rectangle;
visible shoes and the original lanes retain the full source envelope. The
source upper course lies around Y 1.17…1.185 m, requiring a higher supported
return than the previous generic run. Hidden return supports remain disclosed
construction inferences. Rounded lower transitions and rigid link chords
preserve the original road/end axes and put every shoe on or above ground.

Four independently authored rear service brackets replace the former box
stubs. Object_4/Object_23 source planes establish each 267.651 mm-wide bracket,
93.331 mm central channel, three stepped/raked exterior surfaces and separate
inset stock. The source stern reach is Z −3.565152645. Closed sidewalls meet
the permanent hull at their forward roots; depressed floors remain real
negative space, not dark-painted grooves. Their ownership is permanent hull
equipment.

Focused high/low tests pass source-fixed bracket rays, four channel-air/floor
witnesses, positive root overlap, actual asymmetric road/end centers, spinning
without axle movement and 48 opposing-scroll phases with physical ground
contact. The unchanged strict CPU band/shoe audit reports zero front, rear and
full-sweep overlap. This is a bounded CPU checkpoint; it is not a substituted
silhouette, shaded-review, anatomy or release pass.

## Steel-wheel envelope and panoramic aperture correction — 2026-09-06

The subsequent 96.9% silhouette checkpoint passed its registered component
floors, but strict geometry still rejected the draft: front whole 81.5434%,
front hull 86.8014% and turret side 88.7178%. These are historical results
before the corrections below, not current qualification.

Exact transverse triangle cuts exposed a genuine wheel-face error. At
X−1.72 the reference's lowest surface is skirt Y.813738, while the old native
steel dish extended down to Y.359999. The measured rubber width was correct;
the generic steel/inset geometry projected beyond it. `leclercXWheels.ts`
replaces those injected faces with independently authored stepped rotational
solids. Complete wheel envelopes now end at X−1.598268 and X1.514735. The
right outward plate steps are X1.47367597 at radial .06, X1.38927376 at .12,
X1.36334872 at .20 and X1.39867330 at .265. Source radial shoulders are
.2753843, .2615704, .1791096 and .1107934 m. The source exposes single-sided
plate faces; their 3 mm inward closure and 4 mm concealed rim wall are
explicit construction inferences, not falsely measured source thicknesses.

The tire crown is not a full-width cylinder: its central groove drops from
R.3307865 to R.279660. The source's narrow flat groove spans axial
−.02921228…+.02183922 relative to the right wheel station, with sloping
shoulders joining the two bands. Separate native annuli and side-specific
groove solids preserve that air. All rubber/steel layers retain the original
six native road axles, their asymmetric side centers and native spin; no
static duplicate wheels or track-lane shifts were introduced.

`leclercXSight.ts` corrects the panoramic sight's broad triangular rain
guards and actual under-glass opening. The source right guard reaches
X.736946, not the old narrow bar at X.699. The glass remains at Z1.064890,
between Y2.425645 and Y2.721766. At X.564/Y2.420 the genuine lower slot is
open to the rear wall at Z.87513261; at Y2.735 the upper surround is at
Z1.06172821, and at Y2.760 its recessed upper step is Z1.04251190. The
previous top-center regression incorrectly reused the **side crest** depth
1.1166 at X.564/Y2.750. It is replaced by the full-source center witness
1.06172821 plus independent side-guard, glass, slot-air and backing rays.
This corrects a misplaced assertion, not a threshold relaxation. The measured
pedestal extends from Y1.864391 to Y2.368814 and supports the real lower floor;
the earlier short generic pedestal is removed. Small source face tilts and
corner relief are approximated within the documented millimeter-scale tests.

High/low source-fixed wheel-face, groove-air, native-layer motion and sight
aperture tests pass, as do typecheck, the focused complexity gate, the actual
wheel-quality audit and unchanged strict front/rear/swept band-and-shoe audit
(all zero overlaps). Fresh component/geometry comparison and independent
shaded review remain pending. Forward guards, turret contours and smaller
source fixtures still need evaluation; no final release claim is made.

## Forward skirt crossfall — 2026-09-06

Independent full-source underside rays exposed another real overfill in the
three thick forward panels per side. At Z2.2, source |X|1.72/1.78 lower faces
are Y.814000/.922462; the draft flat-bottom loft gave Y.696109 at both
stations. Object_23:26266/26273/26289 and their left counterparts are wedges
with a strong transverse lower bevel, separately raked crowns and a sharply
folded front toe, not rectangular armor courses.

`leclercXFrontSkirts.ts` replaces only those six panels with independent
analytic closed folds. The upper warped facets use generated subdivisions;
the terminal lower crease is a real analytic edge lofted across the width,
preserving its air instead of interpolating a diagonal skin over it. The
original X±1.8 extreme and source panel-span gaps remain. Inner roots overlap
the existing carrier by about1 mm transversely; neither permanent carrier,
bow guard, other skirt course, wheel/end axle, shoe recipe, sight nor gun is
changed. Small source facet irregularities remain within the independent
3 mm held-out surface tolerance, not claimed as copied source topology.

`leclercXFrontSkirts.selftest.mjs` verifies actual high/low source crowns and
undersides at eighteen paired held-out locations, the rising toe, outward
winding, real under-bevel and inter-panel air, carrier engagement and fixed
lane/muzzle datums. Existing source-wheel/sight/recoil and48-phase ground
checks also pass. Exact committed CPU front/rear/full-sweep band and moving
shoe intersections remain zero. Typecheck and44-function quality checks
pass. This is a frozen local correction awaiting fresh visual/geometry proof;
known central stern and turret-outline residuals remain separate work.

## Open rear rack and canted right box — 2026-09-06

Complete-source Object25/29/30 inspection shows four approximately32mm
round-stock U hoops, not four full-width tilted shelves. The source upper
hoop spans Y2.172871..2.204517 with clipped rear bends at Z−2.32231;
the lower two hoop rear edges step forward by50.589/103.220mm. At X−1,
Z−1.9 the genuine first upper surface is the basket floor Y1.855355. The
draft shelf instead filled the opening up to2.196968, a342mm false surface.

`leclercXRearRack.ts` replaces that assembly with independently swept closed
rods, short kinked rear posts, actual vertical side posts and the separate
thin floor/central plate. The upper three levels have real central air.
Only the separated rods/posts carry the established open-lattice semantic
role; the floor and closed neighboring box remain ordinary solid permanent
equipment. They remain visible in every source comparison and subject to
physical attachment checks. Faceted source bends and small stock cross-
section irregularities are approximated with original rounded joins; no
reference connectivity or sampled vertex contour is reused.

The adjacent right source box has two sloped roof planes, an oblique rear
wall, canted lower faces and a separate attached low cover. At X.6/Z−2.1,
source roof/low cover are Y2.263550/1.913640; the old draft had no box there.
At Z−1.8 its roof is2.265630 and lower face1.789636, not the old2.190300/
1.898536. The replacement uses analytic plane intersections and generated
sections, including the actual inclined rear face at Z−2.172585 at Y2.2.
The front root overlaps the unchanged permanent turret; the basket floor
likewise reaches retained armor. The source under-box space remains open.

Actual high/low tests check source first surfaces, hoop levels/undersides,
central basket air, canted box roof/floor/rear planes, positive post/hoop and
body-root contacts, fixed track lanes and muzzle, and yaw-owned placement
independent of gun pitch. Existing wheel48-phase motion, original sight
apertures and new forward-fold tests pass. Exact committed strict band and
shoe checks remain zero front/rear/full sweep; quality and typecheck pass.
These two bounded corrections await a fresh combined proof. Other source
front-guard, stern and turret residuals are not waived by this CPU result.

### Rack/fold rendered proof and subsequent bounded surface correction

The unmodified fixed-source run of 2026-09-06T19:41:50.349Z is retained in
local-only `.qa-dev/reports/leclerc-rack-fold-fidelity.json`. Raw fidelity
97.1125427273 passed every registered view/component (minimum whole view
96.8837201130). Geometry still failed: hull91.2727711397, whole87.3503241459,
turret90.8421466738, stations97.2562963015, dimensions95.3015873016,
floaters100. The official standard stopped at that failing fresh geometry
prerequisite, so this run supplies no new standard clearance/continuity pass.
These failures were retained rather than averaged away.

`leclercXSourceFittings.ts` now replaces only the generic front guards and
round antenna stocks. Complete Object23 plus Object9 inspection proves the
guards have a closed flat underside at Y.867272496, not an open-bottom shell:
the underside lives in a different material island. Their roof is the plane
`.9553865Y + .2953585Z = 2.184349839`; the main inclined front and proud folded
lip are independently intersected planes. Actual spans are left
X−1.6509963..−.9320235 and rightX.9502472..1.6692200, not mirrored generic
boxes. Front extent is Z3.5651526; external clearance below the guard remains
open, with positive overlap into the unchanged carrier at its rear root.

Source Object29:2689/2826 carries rectangular stepped stocks, not round
whips: at Y2.4 the lower neck is about67×88mm, followed by a narrower taper
and an8×26mm terminal. Independent tapered rectangular solids preserve
Y3.066592932 and both source anchors. The subtle base faceting and tiny
cross-axis plane skew are simplified; held-out main faces differ by less
than.2mm. No wheel axis, track course, full-width datum or gun endpoint moves.

`leclercXPortRoof.ts` restores the actual narrow high platform, its lower
outboard bevel and forward steep ledge. The complete source roof (including
separate hatch material islands) remains closed. At X−1.2/Z−1.45 the source
outer bevel is Y2.208147, not the old broad high roof; at X−.85/Z−.22 the narrow
ledge remains Y2.364352. The neighboring rear service block is only
Y2.208397 at X−.52/Z−.12. The thin cover over the steep ledge and the clipped
rear-left case are separate attached solids, not a new continuous shelf.

The forward casing is a real recessed well: floorY2.0741854, inner vertical
wall toY2.1754804, canted rim and crownY2.213315. Only the old concealed roof
under that measured floor is relieved; gun spine, starboard terrace, sights,
running gear and rig frames are retained. A separate low folded outboard lip
preserves the source first side surface and clearance beneath its exposed
cap. Small irregular wall notches and triangulated surface variation are
approximated by original bounded plane/loft pieces; no reference vertices,
connectivity or copied contours are used. The source service block stops
about.5mm short of its adjoining platform; a concealed1.45mm left-wall
extension supplies positive engagement without moving its measured roof or
main exterior faces.

`leclercXSourceFittings.selftest.mjs` and `leclercXPortRoof.selftest.mjs`
exercise actual high/low factory geometry, independent held-out full-source
surface rays, complete undersides, real floor/terminal air, physical contacts
and turret-yaw ownership independent of gun elevation. Original sight and
frame tests plus front-fold and rear-rack tests pass. The committed strict
CPU scan remains zero bands/shoes front/rear/full sweep; full typecheck and
complexity gates pass. Geometry is frozen pending a fresh rendered proof;
the preceding87.3503 failure is not reclassified as passing by these tests.

The fresh scoped proof (fidelity receipt20:18:47.808 UTC) reports raw
composite97.6278662, whole98.4662201, hull98.1003442, turret96.3381512,
gun97.2612267, tracks96.2578207 and minimum whole view97.698699: all registered
silhouette views pass. The neutral board shows the narrower port platform,
low outboard lip and rectangular stepped stocks without the former broad
high shoulder. Full exact data is retained locally at
`.qa-dev/reports/leclerc-port-roof-fidelity.json`.

Fresh fixed-world geometry improves to hull92.2698718, turret93.3908709,
stations97.4201787, dimensions100 and floaters100, but whole/front90.2145574
still fails the unchanged92 floor. The official standard stops at this fresh
geometry prerequisite, so this run supplies no new browser track/continuity
qualification. The failure remains active; the passing CPU checks and average
silhouette do not override it. Remaining source/native front-width and
outer-turret fixtures require independent physical investigation.

### Rear shoulder and starboard terrace correction

Independent complete-source rays located an actual120–150mm rear shoulder
deficit, not a registration error. At X−1.625/Z−1.07 the source crown is
Y1.9191502; the previous generic chamfer was much lower. The right upper
terrace also had an abrupt vertical outer edge: source X1.345/Z−1.23 is
Y2.2125854, while the old wall removed that narrow armor bevel. Conversely,
the source forward diagonal falls toY2.1333233 at X1.345/Z−.46, so merely
widening the former high roof would have created another real overfill.

`leclercXRearShoulders.ts` uses independently measured plane intersections
for the aft outer walls, their moving vertical creases, the steep shoulder
folds and the separate narrow seam floors. The left seam's small undercut is
retained. At X1.40/Z−.73 the genuine seam floor isY2.0186177; at
X−1.50/Z−1.07 it isY2.0356987. X1.57/Z−1.3 and−.9 now expose the hull below
rather than an artificial turret wall. The forward cheeks, source port
sight well, gun spine, gun joints and all hull geometry remain unchanged.

The outboard upper terrace has a closed source underside atY2.0686557293,
with actual air beneath it. Original generated sections preserve the narrow
upper and lower bevels, rear corner and diagonal forward roof. A concealed
1mm lap connects these new outer spans to the retained central cover; no
new pedestal or support studs are introduced. The central cover's existing
support depth is retained in this bounded correction. Fine source surface
irregularities and the short transitions to the pre-existing neighboring
sections remain approximations, not claims of copied source topology.

`leclercXRearShoulders.selftest.mjs` checks36 independent between-station
complete-model top rays, four side-wall rays, actual seam/outer-wall/
under-terrace air, closed end caps, positive central contact, unchanged
forward witnesses and yaw ownership in both detail levels. It uses a0.1mm
scalar tolerance for the measured folded surfaces. Existing port-well,
source-fittings, rear-rack, front-skirt and48-phase native gear tests remain
required. The previous whole90.2145574 failure remains recorded until the
combined new shoulder and separately measured pad/pin recipe is freshly
rendered through the unchanged gates.

That combined revision now passes the fresh, unchanged checks: raw fidelity
97.85692719450148 with every registered view/component at least92; geometry
minimum93.4; zero strict band/shoe overlaps and continuity holes; one recognized
actual roof weapon. The capture still used the former display label `Leclerc X`;
its stable ID `leclerc_x` now displays **Char Leclerc X** to distinguish the
independent older-file addition. Complete anatomy, assets and batch release
remain pending; this is a scoped physical/shape qualification.
