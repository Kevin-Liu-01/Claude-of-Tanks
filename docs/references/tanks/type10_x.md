# Type 10 X — independent authoring packet

Status: roof-cover and lifting-rail detail revision frozen for fresh scoped
fidelity and official standard qualification. Earlier passes are historical;
final fleet anatomy/assets/release remain pending.
The first whole-source comparison scored 89.4 and the first geometry whole-shape
result was 85.9. These failures are retained. K1A1 passing does not qualify this
separate model.

## Physical reference and unchanged comparison source

The [JGSDF 7th Division equipment history](https://www.mod.go.jp/gsdf/nae/7d/siryoukan.html)
states overall length 9.42 m, width 3.24 m and nominal height 2.30 m. The
initial draft followed that published width, but the supplied-file visual
target was subsequently selected for this additive X variant. Its current
physical dimensions are source width 3.38929737 m and structural roof
2.2148683143 m; overall length stays 9.42 m. Highest fitting is separately
4.12156 m. The source's published-dimension conflict is not presented as
real-world accuracy, and the original production Type 10 is untouched.
No supplied mesh is a playable model.

Local source: `type-10_main_battle_tank.glb`, SHA-256
`2cc5748e4357722fc1c21bf7759ec21c29f84b2cfaf1203b5bee995f4cfeca67`.
Root's ignored canonical oracle is `public/models/community-candidates/type10_x_source.glb`,
SHA-256 `fb6c2aa30119ac45b49fdfb7393a13760109ce4c9cc3f6244e579eb4944879fe`.
Its only transform is uniform scale 1.1366241623942464 and translation
[-0.00034883486105, 1.24758034095187, 0.25532557439914], +Y up/+Z forward.
It remains 3.38929726 m wide, 4.61% wider than the official 3.24 m. The source
also contains approximately 0.01004 rad whole-vehicle pitch: wheel heights and
gun axis share that rake. The native vehicle uses a level operating wheel
stance and an independent circular pitch/recoil gun. The oracle is not warped
to make those differences disappear; strict source-view residuals remain visible.

## Semantic ownership

The five source meshes are material partitions, not five physical components.
`Object_6` mixes turret shell, main gun, mantlet boot and roof fittings;
`Object_5` mixes hull deck, turret rack/stowage, roof optics/MG and whips;
`Object_3` mixes road wheels, suspension, fenders and skirt armor.
`Object_4` is principally body and fixtures. `Object_2` is tread skin only,
not the complete running-gear component. No regex is allowed to pretend these
are complete independently segmented hull/turret/gun models. Unavailable
component comparisons are N/A; complete whole views retain every source mesh.

The first source-only fixed-resolution instrument returned height
3.7260024579268, hull length 7.208572755269049, overall length
9.002021938351149 and width 3.1596500843219264 m. These are filtered image
measurements, **not** substitutes for official physical extrema. That initial
receipt also predated the canonical-frame loader correction: the legacy
loader still width-fitted the already uniformly anchored source. It is retained
as failed historical evidence, not accepted canonical metrology. The later
hash-certified, identity-metre source receipt reports filtered height
3.6465144162243215, hull length 7.630853056295037, overall length
9.419334241364187 and width 3.318626198961644 m. The physical source maximum
width remains 3.38929726 m; neither filtered width is a reason to deform it.

## Independent construction and protected landmarks

`type10X.ts` contains original closed lofted armor, separate folded end sheets,
open rear rack, supported optics, a genuine circular main bore, and one native
five-wheel running-gear unit. It calls no existing tank/family builder and
contains no source vertex/index arrays, buffers, textures, or source rig.
Turret yaw [-0.00276,1.50832,0.20655] follows the measured ring midplane;
trunnion [0,1.851,2.0529] is explicitly inferred inside the measured boot,
not claimed as a recovered source pivot. Terminal muzzle datum is Z5.628774.

The five source longitudinal wheel stations are [-1.94594,-0.88563,0.17466,
1.23495,2.29524] m, radius 0.33617 m; the nominal level wheel center is Y0.405.
Idler [Z3.2069,Y0.8113,R0.33617], sprocket [Z-2.8495,Y0.748,R0.3131].
Three covered return supports are mechanical inferences because their precise
source mounting geometry is occluded; they are not falsely labeled measurements.

Actual-ID high/low tests protect the forward guard's thin folded sheet and
under-sheet air, complete-source recessed glass (rather than opaque-only
false deep cavities), separated positive rear-rack posts and slots, native
course count, dimensional extrema and pitch/recoil ownership. They are initial
invariants, not a claim of full visual, clipping or attachment acceptance.
The first yaw90 attachment image contains a narrow disconnected region;
that and the remaining source-sized contour/detail deficits require diagnosis.

## Historical official-width running gear, skirts and stern correction

The first draft used a 0.540 m generic tread lane and incorrectly extended
the lower armor to Y1.232. Independent source measurements instead give a
0.4653 m physical lane in the official-width authored frame, upper rail
thickness0.0296 m, and five separate lower module roof ranges Y0.7687–0.8151.
Their unequal Z spans and low edges Y0.3683–0.4133 are now separately authored.
The narrow vertical fender return positively supports the upper course.

The source rear mudguard is not located at the overall aft extreme. Complete
source Object_4:164 yields front-facing sheet witnesses [Y0.679268,Z-3.340590],
[0.508775,-3.355127] and [0.395112,-3.359810]. These now replace the draft's
incorrect long hanging sheet at Z-3.79. The true aft extreme belongs to
Object_4:42, an open transverse tray: thin top and lower sheets, side returns
and sparse vertical straps. Its center remains open between the two sheets;
two separate side exhaust housings attach to the actual narrow rear wall.
The steep terminal lower-tub crease is also retained rather than interpolating
an incorrectly high underfloor across the stern.

The unchanged committed strict CPU audit now reports front/rear/full-sweep
band0 and shoe0, with352 native shoe instances. Actual-ID high/low tests retain
these source sheet/air/course witnesses. Fresh source image gates and official
browser qualification remain pending; this is not a replacement for them.

## Independent roof, coax opening and antenna attachment correction

The fresh neutral comparison exposed a genuinely incorrect generic bevel:
the authored outer cheek was approximately 83–84 mm high at raw X±1.2/Z0.5.
The actual source has a raised, narrowing central roof and a separate lower
outboard shelf with transverse crossfall. Original closed parametric lofts
now follow these independent principal planes. Held-out whole-model rays at
both shelf stations, the forward roof and its two converging nose facets
are within 5 mm of their declared source scalars in both LODs. Only the
initial official-width X frame differed; that earlier compression has now
been removed from the independently authored dimensions, as recorded below.
Y/Z remain unchanged canonical-source metres. No source contour or
connectivity arrays are used.

A shell-only read of Object_6:332 would incorrectly suggest a broad empty
mantlet cutout. Complete-source rays show that Object_6:135 fills this region
with an asymmetric armored surround. Its real opening is the smaller right
coax aperture, raw center approximately X0.333/Y0.6363. The new
`type10XCoax.ts` constructs a closed folded surround with an elliptical
opening from scalar dimensions and analytical plane intersections. It keeps
the structural back at raw Z≈1.4707, the rounded backing plate ending≈1.51518,
and the recessed weapon ending 1.69876. Six held-out complete-source first
surfaces and deep front-air witnesses pass in actual high/low builds. No
painted-black replacement, hollow unbacked shell, broad false opening or
main-gun ownership change is involved.

The yaw 90° attachment failure was independently identified by projecting
actual native vertices through the committed camera: its narrow island was
the central rear antenna, not a rear mudguard. The draft omitted source
Object_6:24 and :12 below the :68 base. Two original closed mounting stages
now reproduce their folded foot and canted cap. The foot physically overlaps
the retained rear roof by between 1 and 4 mm; the upper cap engages the antenna
base. Actual high/low source crowns, adjacent air, contact and yaw 90°/180°
ownership are tested. All physical dimensions, running-gear stations and
the pitch/recoil main gun remain unchanged. The profile is frozen for a
fresh official comparison, not declared source-qualified from CPU tests.

## Supplied-file visual frame and measured equipment pass

On 2026-09-06 the supplied-file proportions became the visual target for this
new X variant, with the published width conflict retained above. The native
armor's transverse dimensions, five unequal skirt modules, guard spans,
cupola, optic widths and equipment positions were independently re-authored
at the unchanged source metre frame. No final model/group scale or new oracle
normalization was used. The physical source track lanes are now centered at
X±1.27414 m, width 0.486738 m; measured wheel axial width is 0.358099 m.
Existing source longitudinal/radial stations and native mechanical supports
remain unchanged. The structural roof is 2.2148683143 m, distinct from the
source-only filtered height 3.6465144162243215 m.

The first source-width capture, 2026-09-06T16:22:20.323Z, remained a failure:
raw whole 94.10038834239334, tracks 94.4936412869251, left whole
91.87390079443524 and right 91.74430581234063. Its full immutable local row is
`.qa-dev/reports/type10-source-width-fidelity.json`. Those failures led to
actual source equipment measurements rather than further shape scaling.

The two long whips now have five measured diameter/taper stages, not thin
constant rods sharing only the endpoints. Their independent Y3.50 sections
meet the canonical surfaces within 1.5 mm in actual high/low builds. Source
Object_5:110 insulator crowns are Y2.373987 and 2.373856; the corresponding
stalks physically engage the retained supports. Tilted terminal cap radius
is accounted for, retaining the source's actual outer highest fitting.

The roof weapon now has separate rear grips, an open forward sight hoop,
an open rear notch, and its measured thin folded cradle. Object_5:112 has
9–11 mm lower/end walls, stepped outboard returns and an open central volume,
not a solid sloping block. Held-out surface rays protect the floor at
X−0.20/Z1.02/Y2.5118644, upper side lip at X−0.13/Z1.02/Y2.730804,
and separate fore/aft walls at Z1.10603206/0.91172084 at Y2.60. The actual
weapon base overlaps permanent cupola geometry; its two narrow legs retain
concealed attachment extensions to the native cupola rather than floating
at source-only endpoints. Source grip-cap first surface Y2.938328 is
distinguished from the lower grip body, avoiding a false isolated-part test.

Paired original muzzle-side fittings reproduce source Object_6:14's
approximately 79 mm transverse spans and narrowing tips. Their source
held-out surface at X±0.11/Z5.50 is Y1.89615016, and X±0.14/Z5.55 retains
real terminal air. Actual recoil movement verifies ownership. The main
barrel's existing level neutral operating axis is unchanged; the supplied
source's approximately 0.01004 rise remains explicitly visible, not erased
by transforming the oracle.

Fresh scoped proof at 2026-09-06T16:43:23.927Z passes all registered valid
views: raw composite 94.82541391495612, whole 94.90005081464692, tracks
94.49887747880878, and minimum whole 93.62950685944715. Full exact local row:
`.qa-dev/reports/type10-source-equipment-fidelity.json`. Geometry also passes
at raw 93.62950685944715, dimensions 100 and floaters 100. Fused hull/turret/
gun component comparisons remain honestly unavailable. The strict committed
CPU band and shoe audit remains zero for front, rear and full sweep; all
high/low focused tests, typecheck and the authored complexity scan pass.

## Lower-bow spare links and actual supporting facets

The equipment-pass neutral review identified four missing source-sized spare-link
assemblies despite passing outer silhouettes. `type10XBow.ts` now authors these
as original closed plates and separately seated pins, not source mesh data.
Source Object_5:22 gives transverse centers −0.731826, −0.192168, +0.192171 and
+0.731828 m, plate width 0.318035 m, in-plane height 0.351478 m and normal depth
0.053183 m. Their rake is 0.615620555 radians. Each assembly has four outer
round pins and four narrower inset pins. The source front plane is preserved;
only its hidden back extends 1.4 mm for positive native supporting contact.

The former generic lower glacis obscured this real relief: at Y0.95 its front
was Z3.518558, versus complete-source Z3.475760, a 42.8 mm overfill. The bounded
correction changes only the central lower nose after Z2.50, following two
independently measured planes meeting at Y0.7213660983/Z3.3136651848. Added upper
vertices remain on the exact old roof interpolation. An adaptive bevel keeps
the terminal 19.6 mm lip closed and non-inverted. Upper armor, other hull
stations, overall dimensions, running gear and all articulated equipment are
unchanged.

Actual high/low regressions preserve four source lower-facet surfaces, all four
link fronts, three independent pin surfaces, and 0.5–3 mm positive link-to-hull
contact. The inter-link openings at X0/±0.45/Y0.95 retain more than 65 mm of real
front air before their permanent backing at Z3.47575998. Three upper-roof
held-outs remain unchanged within 10 micrometres. Existing roof/coax/gear,
attachment and recoil tests pass alongside these new witnesses.

## Thin roof covers and longitudinal lifting rails

The next independent visual review found a materially bare roof despite the
passing silhouette. Source Object_6 contains four long central access covers,
two narrower right covers, three aft covers and a raised forward crew plate.
`type10XRoofPanels.ts` authors these from scalar centers, dimensions, corner
radii and their measured 0.0100435 longitudinal rake. The 7.2–9.1 mm service
plates stay visibly separate from the supporting roof; the forward crew plate
is 26.4 mm deep. No source contour or connectivity data is copied.

The old transverse bracket was the wrong structure. Source islands 1213/1247
are two separate longitudinal lifting rails, centered at X0.0018409 and
0.1690486, with feet at Z−1.905233/−1.350435. Their original analytic bent-tube
construction has radius 19.24 mm and bend radius 67.5 mm. The four capped feet
engage permanent armor by approximately 2.95 mm while preserving real air
beneath the long portions. Folded lid catches and two small pull handles also
retain open space rather than filled bounding boxes.

`type10XRoofPanels.selftest.mjs` passes actual high/low builds, twelve held-out
cover/handle first surfaces within 0.8 mm, sixteen complete-source rail crowns
within 3.5 mm, adjacent air and positive attachment. Yaw and pitch tests preserve
ownership; the running-gear receipt is unchanged. The original Type 10 X
regression also passes. These CPU results do not replace the queued fresh raw
visual and geometric gates. The source hash and uniform registration above
remain unchanged.

The first bow capture at 2026-09-06T16:56:19.216Z had passing shape rows but
failed its console gate on one HTTP 404. Its complete failure receipt remains
`.qa-dev/reports/type10-bow-fidelity.json`. An unchanged-geometry repeat at
2026-09-06T16:59:19.555Z completed without that error and passes every valid
registered view: raw composite 94.81691842950741, whole 94.88961350395283,
tracks 94.49887747880878, minimum whole 93.62950685944715. Full exact row:
`.qa-dev/reports/type10-bow-final-fidelity.json`. Geometry is
93.62950685944715, dimensions 100 and floaters 100. Source fused components
remain unavailable, not fabricated as separate masks.

The fresh neutral board at
`shots/procedural-fidelity/boards/type10_x-neutral.png` shows the new raised
lower-bow assemblies, real intervening gaps, supported roof weapon and muzzle
fittings without a newly observed medium-size defect. Sub-centimetre fasteners,
latches and material/weathering detail remain simplified. The official scoped
standard exited successfully: all front/rear/full-sweep band and shoe counts 0,
continuity holes 0, recognized MG count 1. Focused high/low tests, typecheck and
authored complexity checks pass. Geometry is frozen; the mandatory complete
anatomy/assets/release chain remains the parent fleet integration's responsibility.

## Fixed-source width failure and local folded-sheet correction

The later source-only fixed-ruler audit rejected the previously qualified
shape at dimensions88.83832335329339: filtered plan width was3.3978233790 m
versus source3.3183421304 m, although both full physical envelopes were
3.38929737 m. This was a real spatial-distribution error, not permission to
shrink the oracle or whole vehicle. The former five lower skirts used each
source island's maximum-X bounding box along its entire longitudinal span.
For example, Object_3:6203 reaches X1.6946522 only at its bent forward corner
near Z2.291/Y.414. At the independent central witness Y.6/Z1.5 the actual
outer sheet is X1.5702528; the old native face was1.6894503,119.2 mm proud.

`type10XSkirts.ts` now authors thin, closed sheets from original analytic
longitudinal bend functions, common measured rake and local end folds. It
does not contain source vertex, sampled contour or connectivity arrays.
The widest source corner remains unchanged. Full-scene high/low held-outs
cover both sides and all five sheets: first surfaces differ by0.5–4.1 mm at
the declared samples, and inner-skin rays retain positive millimetre-scale
volume rather than the previous70–130 mm slabs. Source lateral thickness
at those rays ranges6.34–8.23 mm. Fine local dents remain an explicitly
bounded approximation. The roofs positively enter the unchanged fascia.
Source horizontal U straps near Y.81–.87 replace unsupported near-max-width
boxes at Y1.447; real strap-centre air is tested. No hull roof, bow, turret,
gun, wheel/end station, native track lane or source oracle changed.

The first corrected proof passes geometry93.62950685944715, dimensions100,
floaters100, official band/shoe/front/rear/sweep0, continuity0 and MG1.
Filtered width is3.2984718182 versus source3.3183421304 m (0.599%); physical
width remains3.38929749 m. All silhouette shape rows are above92, but an
HTTP404 console error correctly failed that capture. Its full failed row is
`.qa-dev/reports/type10-skirts-fidelity.json`; an unchanged-geometry traced
repeat is required before acceptance. The new dedicated
`type10XSkirts.selftest.mjs` and all earlier Type10 source regressions pass in
both detail levels, alongside typecheck and zero authored complexity violations.

The unchanged-geometry repeat at 2026-09-06T18:22:51.837Z completed with no
recorded per-ID console errors and passes: raw composite 95.28288666699812,
whole 95.46188512082671, tracks 94.49976843149807, minimum whole view
93.63607872461465. Exact clean receipt:
`.qa-dev/reports/type10-skirts-final-fidelity.json`. Scratch-only response
tracing was attached to the unchanged committed runner and identified a sole
404 for `/favicon.ico` during the initial page, before per-ID collection.
This is consistent with the earlier timing-sensitive console failure, whose
original exact request was not logged; that failure remains retained.
No camera, mask, ownership, normalization or gate floor was changed. The fresh
neutral board shows the over-thick lower course removed and the source's bent
thin sheets restored without a new visible medium-size defect in this scope.
Type 10 geometry is frozen again for the parent mandatory final pipeline.

## Source roof lids and lifting rails — fresh bounded qualification

`type10XRoofPanels.ts` replaces the old crossing roof scaffold with the
source's independently positioned shallow rounded covers, folded catches and
two bent lifting rails. Scalar roof witnesses, actual negative space and
positive rail-foot contact are tested in both detail levels. Main hull,
turret, cannon datums and running gear are unchanged. Fine latch dimensions
remain explicitly simplified; no source vertex buffers are shipped.

The fresh `.qa-dev/reports/type10-roof-lids-fidelity.json` passes all valid
whole/track views (fused source components remain N/A). Official geometry
minimum93.6, dimensions100 and floaters100 pass; strict front/rear/full-sweep
band/shoe intersections0, continuity holes0 and actual roof MG1 pass.
This is scoped shape/mechanical qualification, not the outstanding final
anatomy, generated-asset, full-test and release certification.
