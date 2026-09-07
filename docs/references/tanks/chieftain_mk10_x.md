# Chieftain Mk10 X — Mk5-derived source reconstruction

Status (2026-09-07): **Mk5-derived implementation and generated integration
complete; strict release rejected by one source-real continuity opening**.
The existing X variant now shares the completed Mk5 X's first-party
chassis/casting constructors, with Mk10-specific scalar recipes and equipment.
Mk5 remains unchanged. The supplied Mk10 file and complete fixed comparison
oracle are unchanged. Fresh source/geometry checks, anatomy, focused tests,
builds and gallery inspection pass; the strict continuity rejection is not
waived. This revision is local, not committed or published.

## Local reference and provenance

Primary owner-supplied input: `chieftain_mk.10__high-quality_model.glb`,
8,797,308 bytes, SHA-256
`f8c1888e345742a5f9f65e877e51b55028d708e5cb42ab4392b5fbc21d1db2de`.
[Source page](https://sketchfab.com/3d-models/chieftain-mk10-high-quality-model-5558373e3f6a413aae04c0789b4174a9),
Scout, May 2024, claims CC BY 4.0. The empty description and game-style node and
material names are a provenance warning, not proof of extraction. Existing
owner authorization permits **local comparison and scalar measurement only**.
No supplied geometry, vertex arrays, textures, archives or buffers are shipped
or imported by the playable model.

## Canonical frame and measured datums

The source does not declare usable meter units. A uniform inferred scale of
0.025, proper identity rotation and translation `[0, .0492805375, .0960252625]`
place ground at zero and forward along +Z. The resulting main body is 7.38869 m
long and 3.49821 m wide. These independently agree within 1.22% and 0.34% with
the 7.48 m chassis and 3.51 m width in the US Army 2001 WEG Chieftain entry
([government-authored manual](https://man.fas.org/dod-101/sys/land/row/weg2001.pdf)).
This is a dimension-qualified scale inference, not a falsely asserted source
unit or a fit to the candidate.

The exterior equipment width is 3.678103 m; it is not the narrower main body.
Rear fitting to muzzle extent is 10.803698 m. Main cast armor reaches 2.453337 m,
separate fixed roof equipment reaches 3.091425 m and antennas reach 4.249091 m.
The source-metric silhouette height remains a separate measurement.

The flattened source has zero object origins rather than meaningful rig axes.
Circular basket bounds establish yaw X≈0/Z.595241 at the source structural
ring plane Y1.512956. Straight sleeve and rifled-bore cuts establish axis
X.000026/Y1.912199 and muzzle Z7.093385. The pitch station Z1.550505 at the
outer barrel root is an explicitly inferred construction datum, not a source
object origin.

## First-party construction and negative space

### Mk5 foundation revision — 2026-09-07 (integration passed; strict release rejected)

`chieftainXFoundation.ts` extracts the Mk5 X's closed tub/sponson,
folded-deck, rounded cast-shoulder and separate cheek-horn constructors.
Both variants call those constructors with their own measured scalar rows.
The Mk5's original rows and sampling order remain immutable; the Mk10 is
not a uniformly scaled Mk5 or a second complete turret overlaid on it.

| Datum (metres) | Mk5 X retained | Mk10 X retained |
|---|---:|---:|
| Main chassis length | 6.575424 | 7.388690 |
| Turret pivot Z | 0.369280 | 0.595241 |
| Trunnion Y | 1.859441 | 1.912199 |
| Road-wheel radius | 0.395279 | 0.411105 |
| Muzzle Z | 6.812053 | 7.093385 |

Mk10 retains its own Stillbrew cheek/spine armor, six-tube smoke banks,
real roof machine gun, cast cupola, gun carriage and asymmetric equipment.
The Mk5's projector and eight-tube banks are not copied into this variant.
Source-proven gun-mouth, carrier, basket and fender-channel air must survive
both neutral and articulated poses. No unmeasured TOGS aperture is claimed.

The previous Mk10 emitted three permanent Stillbrew solids only as external
visual armor. The revision moves those real closed solids into structural
turret ownership so refreshed main-armor receipts include them. Exposed
finite face probes must hit their actual stock; internally overlapped faces
must not acquire duplicate protection, and empty channels must remain air.
Old source scores and old anatomy receipts do not certify this revision.

The fresh, immutable `mk10-mk5-foundation-proof-ALV1AB` comparison packet
uses the unchanged hash-pinned complete source and fixed source-world frame.
Silhouette fidelity is **97.137497**, with hull 97.461884, direct turret
96.606324, gun 95.159385 and tracks 96.420379. Every registered required view
passes the unchanged 92 floor. The separate metric-curve gate passes at a
minimum **93.153760**; the largest paired dimension discrepancy is 1.636905%
(raster hull length), below the 3% ceiling. Five articulated floater views
remain connected. These are measured shape passes, not release approval.

The immutable foundation-preservation regression now passes at high and low
quality. Both complete Mk5 scenes, original cold specification and measured
datums are unchanged; its own existing running-gear initialization is the
only permitted cold-to-warm metadata addition. Building or articulating the
Mk10 does not change the complete warmed Mk5 record. All 668 Mk10 equipment
emissions remain exact. Only two independently authenticated paint quads
follow the changed casting, with the surrounding merged geometry preserved.

Ten additional isolated source-casting ray witnesses have maximum absolute
residual 12.816315 mm, and the source-left antenna retains 38.827997 mm of
positive support. These local witnesses do not replace full outline tests or
claim exact source topology. The two existing source/negative-space/gear tests
pass at high and low quality, including the 48-phase ground check. The
new live Stillbrew collision regression now passes against the actual
regenerated runtime receipt at both quality levels. The fresh marking-seat
and generated-asset checks also pass; see the final integration record below.

The first refreshed collision receipt was **rejected**: the generic final
longitudinal convex cell bridged the genuine central gun channel. The finite
ray `[0, 2.1, 3]` to `[0, 2.1, 1.82]` incorrectly enters that cell at
Z2.034894, before the actual rear wall at Z1.796146. The rejected receipt and
generation log are archived in `mk10-collision-rejection-Zuwolb`. Asset
generation was stopped at this checkpoint. The correction must use separate
closed Mk10 stock volumes and the existing union tracer, not fill the visible
opening, reduce the strict floor, or omit Stillbrew protection.

The archived live first-receipt test additionally found that only **5 of 58**
genuinely exposed Stillbrew triangle witnesses obtained a main-armor entry.
All 58 use finite 40 mm normal-centered probes; the result repeats at both
quality levels and three turret poses. The complete 130-mesh source independently
has zero hits in the central finite ray above and in the basket ray
`[.4, .81, .3]` to `[.4, .69, .3]`. The next genuine basket-side hull contact
is at Y.576547. These results are retained in the first live collision log
and `mk10-foundation-source-air.json`, not erased by later successful runs.

The scoped correction captures only first-party closed turret stocks during
offline anatomy generation. New convex stock cells declare their vertex-mean
interior point, avoiding the outside-AABB-midpoint error for thin wedges.
Their overlay hides only fully covered faces rather than assuming separate
cheeks sharing a Z station are an internal seam. Untagged legacy cells retain
their previous conversion behavior. Synthetic actual-finalizer tests and
full generated integration pass with the exact corrected stocks.

The frozen offline helper produces 977 independent convex cells / 6,862
faces. This is deliberately not the rejected seven-cell envelope. Both
quality levels pass all 58 finite Stillbrew contacts at three turret poses
(174/174 per quality), the actual central mouth and basket air, and 945
independent stock/air rays. The live finalized proof is retained in
`mk10-finalized-collision-trial-wEpVMq`; 51 fully buried overlay faces are
identified without hiding partial covers or even sub-micrometre real gaps.
An exact cross-station merge experiment only reduced 977 to 950 cells and
was not adopted; its volume and interval equivalence evidence remains in
`mk10-collision-merge-ieWkoc`.

Startup coverage classification now rejects disjoint cell bounds once per
stock before applying the same exact face predicate. All 6,862 flags match
exhaustive evaluation and the archived finalizer, with no geometry or donor
change (`mk10-cover-candidates-ubPyIc`). In the separately paired complete
finalizer test `mk10-finalizer-cover-cost-Lyffmc`, the entire finalized output
is identical and all 174 live contacts plus six posed air probes still pass.
Median finalization decreases from 285.59 to 81.97 ms. The same 180-ray trace
workload is unchanged (approximately 28 microseconds per ray); this is not
an overall frame-rate certification or a comparison with a different tank.
The larger collision count and initial construction cost remain documented
tradeoffs, not a relaxed visual/geometry gate. Runtime code stayed frozen for
the completed generated-anatomy, asset, focused regression and release checks.

The final focused run `second-wave-armor-checks-Jxrkwc` passes all 41 selected
regressions against the regenerated 977-cell receipt, including high/low Mk5
and Mk10 equipment preservation, live Stillbrew contact/air, exact auxiliary
armor, simulation, recoil, rollover and fleet anatomy. The fleet-anatomy test
examines all 174 playable tanks, 3,978 closed cells and 7,206 non-AABB module
volumes. This is a focused regression run, not a new complete `npm test` or
an override of the strict continuity rejection below.

The remaining strict continuity rejection has now been traced to the exact
66×184 raster cell, centered at X1.812578/Z−.182400: both the complete source
and native model have one empty cell there. The report's X1.86/Z−.20 label
uses the nominal 60 mm step instead of the actual raster spans. This confirms
source-real negative space, **not a waived gate or full release pass**.

#### Final frozen integration — 2026-09-07

The final 12-phase run `second-wave-integration-Tv1Iok` passes: all 174 anatomy
receipts and marking seats are current, 603 technical images cover all 201
development IDs, and all 230 scoped X assets pass freshness/geometry/bore
checks. All 1,246 unrelated cosmetic files remain byte-identical. Rendered
centering passes for all 201 IDs. The full module probe has zero failures or
outside-envelope modules, while retaining 79 existing dimension warnings;
the separate Mk10-only probe has zero dimension warnings.

Independent post-freeze proof `post-freeze-independent-preservation-I88a4P`
verifies all 178 original specifications, 356 high/low scenes and 178 asset
records unchanged. All 151 original anatomy and 151 marking records remain
exact. The 23 native lazy closures contain no source-loader or source-payload
leak; all 174 playable models retain native procedural provenance.

The fresh actual generated-paint test `mk10-final-paint-rays-MdwGDs` passes
36/36 existing footprint rays across high/low detail, hitting structural
turret stock with 5.976–10.792 mm clearance. The authenticated low merged
quads match high within 56 nm. An extra full-square grid misses four insignia
points per quality; all are in transparent margins outside the roundel ink.
That rejection is retained separately. Nine footprint samples do not prove
continuous coverage of every painted perimeter point.

Fresh typechecking and changed-code quality checks pass (3,668 functions,
zero violations). Both public/private builds pass. The public inventory
retains the exact final manifest and all 230 scoped image hashes, with no
supplied geometry/archive payloads. These proofs are retained in
`second-wave-post-optics-ZmrDb2` and `second-wave-build-gallery-final-tdnke6`.

The actual desktop gallery loads all 23 scoped IDs with decoded images and
zero external geometry loads. Its complete error log reports no page errors;
the owned browser and server close afterward. The fresh Mk10 screenshot in
`second-wave-gallery-wTFP3A/chieftain_mk10_x.png` was independently inspected:
the complete model is uncropped, the new cast/Stillbrew form is coherent, and
no new visible regression was found. This inspection is not pixel-perfect
source equivalence or a performance qualification.

The final official target run is archived without replacing earlier evidence
in `mk10-mk5-final-release-ymwZhS`. Its fresh raw silhouette score is
**97.134546**, direct turret **96.593143**, and metric minimum remains
**93.153760**. These are the final regenerated-paint measurements, not the
slightly different earlier ALV1AB score. Assets, centering, module alignment,
track duplication, bore, circularity and registered shape gates pass. Strict
standard checking still rejects the single source-matching opening, despite
zero track/sweep intersections and one real roof machine gun. The command
exits 2 before its `npm test`/build tail. The separate 41 focused regressions
and successful builds above must not be presented as a clean full release.

The native builder authors its own closed lower tub, raised side carriers,
cast section curves, separately shaped asymmetric Stillbrew cheeks, rear
equipment and native suspension. The real central gun-mouth volume above the
tube remains open to its rear wall at Z1.796146; it is not painted onto a solid
front block. The barrel and muzzle fixture recoil while the actual mantlet
pitches with the gun. Cupola glazing, smoke mouths and stowage are equipment,
not armor-envelope extensions.

Six road axles retain source Y.474396 and Z
`[-2.174642, -1.254642, -.289679, .630321, 1.700374, 2.620374]`,
with 0.411105 m tire radius. Belt centers are X±1.36021, width .61317 m.
Drive and idler retain their independently measured Y/Z centers. Native shoe
thickness, contact seating and concealed support construction are initial
inferences requiring strict swept-clearance validation.

First-pass cast transverse interpolation, forward guards, smoke mounting
positions and selected deck furniture still simplify the source. Source
stills are evidence of the reference, **not** evidence of candidate fidelity.
The builder is expected to change after actual component and shaded review.

Focused regression: `src/vehicles/profiles/chieftain10X.selftest.mjs` checks
high/low real runtime meshes, source frame, closed belly, cast roof, genuine
gun-mouth air/backing, native gear axes and yaw/pitch/recoil ownership. Full
anatomy generation now passes; the composed release result is the explicitly
retained continuity rejection above.

## Rejected first comparison and gun correction — 2026-09-06

The first comparison used incomplete sanitized source-node matching and is not
a valid component baseline. After the complete fixed-turret ownership was
restored, the draft still failed: hull 96%, turret 84% and gun 62.5% silhouette
means. Those real deficits are not waived by the better whole-model score.

CPU measurement identified a misplaced barrel collar and missing rear gun
assembly. `chieftain10XGun.ts` now authors the rear eccentric sleeve around
Z2.25–2.72, the narrower middle tube, and the separate forward evacuator around
Z4.95687–5.45823 with its real collars. At Z4.50 the source crown is Y2.0198796;
at Z5.20 it is Y2.0378831. The earlier 330 mm diameter approximation is removed.
The breech and barrel recoil; the cradle, guides and controls pitch with their
physical parent. The source rear U pocket retains its floor at Y1.834870 and
front web at Z.597355, with genuine air behind that web. The low left control
is a thin inclined lever rather than a solid bounding-box pedestal.

High/low actual-ID tests retain all earlier structural and articulation checks
and add source-fixed barrel crowns, pocket floor/side/web/air, and the low
lever plus adjacent air. Typecheck and focused complexity checks pass. This is
an authoring correction awaiting fresh component, shaded and strict release
proof; it is not final qualification. Smaller breech control profiles and
unseen internal stock details remain simplified first-party primitives.

## Asymmetric antennas and open stowage correction — 2026-09-06

The subsequent rejected checkpoint still reported about 91.86% silhouette,
including a below-floor turret and gun, and substantial strict hull/turret
curve failures. Those results are historical rejection evidence, not current
qualification. The following corrections were subsequently captured at the
still-rejected 93.1% silhouette checkpoint; they did not qualify the model.

Independent `antenna_02` cuts place the port whip at X−1.250550/Z.673825,
ending at Y4.102651, and the starboard whip at X1.013900/Z.747445, ending at
Y4.249091. Both have a measured 1.778930 m upper whip. The earlier shared
station row misplaced both whips by roughly 40 mm and made the port one
146.440 mm too tall. Separate source-sized stepped bases now meet the actual
closed port box and the starboard cantilever support. Their roots overlap
permanent cast armor rather than floating above it.

The 3.111431 m aggregate bounds of `bone_turret_39.002` do **not** describe one
closed box. Its central body spans X−.806234…+.752827,
Y1.872005…2.305645 and Z−2.090355…−1.622933. The native model now separates
this chamfered body, front/rear plates, right oblique cases and the left open
carrier. The latter retains real air above its floor near X−1.3/Z−1.3; its
measured source floor witness is Y1.942620. The former full-width filled box
is removed. The starboard forward housing has a real transverse bevel: its
crown at X1.5/Z0 is Y2.43372635, dropping to Y2.37359240 at X1.8. The angled
case lid at X1.5/Z−.9 is Y2.35692482. These are source scalar witnesses, not
measurements retargeted to the candidate.

`chieftain10XStowage.ts` contains independently authored closed primitives;
all new housings, rails and antenna supports are permanent turret equipment.
High/low actual-ID regression retains the original armor, gear, muzzle and
recoil assertions and adds fixed source station/crown, carrier-air/floor and
positive-support checks through two yaw poses. No source topology or arrays
enter runtime. Thin carrier rails, warped netting, can profiles and small
latches remain restrained geometric approximations; the carrier floor
flattens the source's roughly 11 mm local net warp. The cast and bow residuals
and the remaining below-floor gun score still require fresh diagnosis.

## Four source screens and track-clearance correction — 2026-09-06

The next rejected checkpoint reported hull 82.1%, whole 77.9% and turret
86.7% strict geometry. The four source `ex_armor_body_04…07` screens are now
independent 14.99 mm sheets, replacing five generic rectangles. Their raised
rear and forward lower edges remain open around the end wheels. Eight upper
mounts and twenty shallow clips per side use the measured source layout;
the clips extend to X±1.772947 without widening the entire sheet beyond
X±1.752016. The two longitudinal sheet seams are real air.

A first strict CPU audit also exposed old physical defects: the full-width
carrier boxes and downward-sloping forward guards intersected the upper
course, while rigid shoes reached 21 mm below ground. These were not waived.
The source return roof is a separate 5–10 mm sheet, and `ex_decor_01` has a
shallow crown followed by two overlapping free leaves. At X1.25/Z3.28 the
source crown is Y1.34074751; at X1.4/Z3.57 it is Y1.32434161; at
X1.55/Z3.70 it is Y1.28953183. The steep inner return at X1/Z3.4 has a top
of Y1.27267139 and an underside of Y1.24159156, not a filled rectangular
plate. The native root positively overlaps its supporting deck by about
6.45 mm. Air between the idler and guard is tested on the actual full model.

The source lower tread has distinct outer levels at Y0, .011260 and .022440,
an inward web at .066970 and a guide crown at .152291. The native input
dimensions account explicitly for its 4/6 mm web joints, 27 mm shoe-center
offset and separate 45 mm wrap clearance. The old oversized end course is
corrected without moving any of the six road axles, either raised end axle,
three return rollers, or either track lane. A rounded ground transition and
rigid links follow that single course; no ground clamp or detached second
belt is used.

High/low actual-ID tests retain all prior source, recess and articulation
witnesses and add independent screen relief/seams/clips, both guard windings,
held-out crown/underside and positive-root witnesses, and exact ground contact
through 48 opposing scroll phases. The unchanged strict sampler now reports
zero front, rear and full-sweep band **and** shoe intersections. This is a CPU
authoring checkpoint awaiting fresh component, shaded and composed release
proof, not final qualification. Warped guard corners and the lower free-leaf
edges remain restrained faceted approximations; the native end-link chord
envelope is roughly 10 mm inside the source's continuous tread envelope.
Remaining cast-turret, deck and gun residuals are still open work.

The ensuing parent-captured checkpoint improved to approximately 93.6%
silhouette (hull 96%, turret 86%, gun 90%, tracks 96%) and strict geometry
hull 87.6%, whole 88.5%, turret 88.1%, stations 97.4%, dimensions 100% and
floaters 100%. It remains **rejected** by the unchanged 92% floors. The
physical track/guard correction is retained; the turret and gun are not
qualified by averaging them into the better whole-model score.

## Raised rear casting and low cupola bearing — 2026-09-06

The rejected checkpoint above remains historical evidence, not a current
qualification. Independent complete-source rays found that the draft had
assigned the localized MG-mount maximum to the entire cupola rim: its
1.03543 m diameter cap reached Y2.823, whereas the real broad bearing crown
is approximately Y2.6205. The replacement is an original closed annular
profile with the source's rising underside, a lower separate optical belt,
a domed hatch and localized inclined MG supports. The roof-MG barrel is now
at its measured X−.35805/Y2.7961 axis, not the former X−.46/Y2.85 station.

The former casting also continued a flat Y1.513 floor rearward beyond the
source bearing and omitted the closed connection beneath the rear hatches.
The actual source floor is Y1.799665 at Z−.9 and Y1.817450 at Z−1.1. A
source-sized circular step at Y1.578237 joins the smaller Y1.512957 bearing;
these geometric circle centers do not alter the fixed mechanical yaw.
The restored rear shell has a sloping roof and two separate hatch skins:
at X.5/Z−1.5 the hatch crown is Y2.388812, rising to Y2.424079 at Z−1.3.
Both hatch roots overlap the permanent roof by about 2 mm. The real open
space below the raised aft casting is retained.

[The scalar receipt](chieftain_mk10_x.cast-cupola-source.json) records exact
source identity, measurements and uncertainty. The new actual-ID high/low
test adds held-out floor, bearing, rear-body side, hatch support, dome and
MG witnesses through yaw, including real air where the old tall cap stood.
The existing source, gun recess, carrier, screen, native gear, ground and
articulation tests still pass. Typecheck and the changed runtime complexity
gate pass; React Doctor remained 84/100 with no findings before and after.

The ensuing 19:06:24 UTC captured checkpoint remains **rejected**: raw
fidelity 94.10803603161733, but turret 87.83226261650815 and gun
89.98882151445177; strict geometry hull 87.63597051763807, whole
90.1037852788412 and turret 94.08698712026937. The cupola/casting correction
is retained, but passing turret geometry does not qualify its failed outline.
The optical-belt frames, small MG controls, hatch hinge
and rounded cast transitions remain restrained original approximations.
The independently identified missing raised engine-deck panels and remaining
forward casting/Stillbrew and main-gun residuals are still open work. No
gate, camera, source registration, donor vehicle, axle or track datum changed.

## Paired pressed wheels and horizontal Horstmann anchors — 2026-09-06

The generic steel wheel extended about 173 mm beyond the source's complete
393.02 mm axial span. The source instead has two separately pressed dishes,
a true annular gap and ten small local flange heads. Original turned solids
now reproduce those medium forms, including the deeply recessed outer bowl;
the source wheel center X±1.35287 is distinct from the preserved track lane
X±1.36021. All wheel Y/Z stations, track paths, end wheels and return rollers
are unchanged. The physical central spindle does not fill the bowl or gap.

The old generic joint axes were 444 mm above the road axles and extended
inboard into a region where the source has no suspension material. The
source Horstmann anchors are nominally horizontal, with alternating
approximately 367.175 mm fore/aft separation from each axle. Finite zero
`anchorLiftM` is now supported without permitting negative lift or zero in
other required dimensions. Explicit paired trail uses the two independent
fulcrums; absent options preserve the legacy shared midpoint exactly.
The connecting native web is a closed construction between measured cap
faces; detailed hidden forged-lever fillets and upper linkage relief remain
acknowledged approximations, not imported source topology.

[The wheel/suspension scalar receipt](chieftain_mk10_x.wheel-source.json)
records the source measurements and limits. High/low actual-ID tests verify
held-out bowl surfaces, real inter-wheel air, cap faces, both-side spinning,
paired anchor positions and exact reset. The complete Mk10 track/end/roller
buffers and transforms match their pre-edit hashes, and all eight original
gear snapshots pass. The strict CPU sampler reports zero band and shoe
intersections in front, rear and full sweep; high/low mechanical wheel
quality also passes. This tranche awaits fresh rendered proof. The remaining
deck, hull-floor and gun/Stillbrew discrepancies are not waived.

## Raised engine panels and missing gun-carriage solids — 2026-09-06

The missing forward engine covers are now independent thin plates with the
source's stepped and diagonal inner edges. They do not fill the clearance
notch beneath the turret. Separate folded louvers, deep edge frames and
small source-station hinge ears connect to a permanent outward-falling hull
shoulder. The louvers have distinct lower folds rather than tilted solid
boxes: an initial 6 mm underside error was rejected and corrected against
the source underside rays before the focused test passed. The port panel
arrangement and frame slopes remain distinct from starboard.

Original thin cross-wires interpret the supplied net surface without copying
its texture. The concealed lower shoulder closure overlaps the existing
closed carrier, and the thin cover undersides are first-party construction
closures; these are documented inferences, not sampled source topology.
The rear-most pre-existing deck fittings and small latch/fillet relief are
not claimed exact. [The scalar packet](chieftain_mk10_x.deck-carriage-source.json)
records the measured planes, ownership and limits.

The gun audit found real omitted geometry in `gun_barrel_44`: a 36.49 mm
thick left carriage shield extends rearward to Z.195315, while the draft's
gun assembly ended at Z.367275. The source shield's sloping upper and lower
planes, shoulder notch and rear clipped corner are now original closed
solids. A narrow forward linkage reaches source Z2.128855, and the small
rear breech cap closes at Z.290585. The shield and linkage pitch with the
fixed cradle; the breech cap recoils with its parent breech. The original
deep breech opening, barrel datums and muzzle are unchanged.

All three new high/low tests pass alongside the original Mk10 source,
negative-space, 48-phase ground and articulation regressions. The full
173-tank mechanical wheel audit passes after the wheel correction. The
changed six-file runtime complexity scan reports 77 functions and zero
violations. These are **authoring results awaiting fresh captured proof**,
not release qualification; the recorded earlier gun and turret failures
remain historical evidence until the new unchanged gates are evaluated.

## Open lower turret basket — 2026-09-06, 21:02 UTC

The fresh engine/carriage comparison rejected the turret again: raw turret
87.8580, despite whole 97.5262, hull 96.5348 and gun 95.1594. The four required
front/side/rear turret views remained below 92. No geometry receipt from the
canceled queued stage is claimed. This prompted a complete-source lower
turret audit rather than a change to component ownership or comparison gates.

The draft had incorrectly extended the basket floor into a 277.71 mm solid
drum while omitting the actual stepped seat supports and folded trays. The
replacement has the measured 32.901 mm floor, genuine starboard opening,
local raised aft lip, notched seat pad, thin tray rims and hanging return.
The oblique right support hangs from the permanent bearing; its real lower
gap remains open. A narrow bent linkage preserves the surrounding air.
These are permanent turret-owned equipment, not expendable armor or gun
followers. The external casting, main gun, yaw/pitch datums and running gear
are unchanged.

[The basket scalar packet](chieftain_mk10_x.basket-source.json) records exact
source rays and construction limits. In particular, a concealed 22.62 mm
seat connection is inferred with positive overlap, tray crown differences
of approximately 3.2 mm and small linkage fillets remain simplified. High/low
tests pass for the source folds, actual material/air, support, yaw ownership,
gun-pitch independence, disposal and exact non-target geometry preservation.
The original source/48-phase-ground/articulation test and typecheck also pass.
This bounded correction is **frozen for fresh comparison, not qualified**;
the smaller forward roof sight differences still require source review.

## Rear closure and supported source fittings — 2026-09-06, 22:20 UTC

The following basket checkpoint passed every registered valid fidelity view,
but strict geometry still rejected the model: hull **91.3165193509398**, whole
**91.2404139740653**, turret **94.29414045834466**. Those are historical
pre-correction results, not a current qualification.

Exact source cuts showed that the broad aft carrier filled real air under
and beside the narrow rear box. The rear-box floor and the shallow/steep
aft hull planes now match independent held-out source rays and normals.
The raised lid retains its under-cover space. The source's narrow paired
rear support and unequal upper caps are separate supported equipment,
not an extension of the whole hull roof. Removing the false carrier also
exposed four unsupported, incorrectly located draft cubes; these were
replaced by the actual sloping side cases, two open port clasps and the
separately supported starboard rear panel.

The cupola-side fitting is an open inclined receiving channel, with thin
walls, folded returns, real center air and two seated feet. The localized
left housing latch has its measured steep fold; the broad housing was not
widened. The existing roof weapon was independently confirmed to contain
its complete receiver, stock and barrel, rather than only an empty mount.
Its physical axis remains unchanged. At the bow, four source-located lamp
stocks replace the two misplaced draft lamps. Bent diamond-section guards
and the separate central braces leave genuine approach windows open.

[The scalar packet](chieftain_mk10_x.closure-fittings-source.json) records
the source owners, fixed witnesses and limitations. In particular, the
channel feet use a concealed 0.5 mm seating allowance, the rear cap has a
roughly 2.3 mm lateral connection between separate source islands, and the
side-case receiving wall has a roughly 3 mm concealed continuation into
the native fender. Small guard bends, latches, lamp trim and hidden carrier
blends remain simplified; no source-exact micro-detail claim is made.

The new high/low source-plane, material/air, attachment and ownership test
passes, together with all existing Mk10 source, cupola, engine, gun-carriage,
wheel and basket tests. The unchanged strict CPU sampler reports zero
front/rear/full-sweep band and shoe intersections. Typecheck passes; the
six-file runtime audit reports 77 functions and no complexity or explicit
`any`/`unknown` violations. Geometry is **frozen for fresh parent-owned
comparison, not yet qualified**. Frame, datums, gear axes, track course,
component policy and every comparison/release threshold remain unchanged.

## Six fender cases and real bearing-side channel — 2026-09-07, 00:17 UTC

The historical 22:32 UTC comparison passed every valid fidelity view at raw
96.91310705401158, but hull geometry remained **90.7271867702118**, below 92.
Whole geometry was 93.15375956566169 and turret 94.29414045834466. Official
track intersections were zero; the side-housing continuity column at
X1.86/Z−.20 remained reported. These are pre-correction results, not a current
qualification or permission to fill real source air.

The six short draft boxes are replaced by source-sized long folded rear
cases, unequal diagonal middle cases and two-plane forward cases. Separate
lids, folded latches and narrow receiving strips preserve the source supports
and open regions. Exact source underside planes meet the inclined rear
receiving shoulder; the entire deck is not raised to support the cases.

Full-source rays also exposed a 237.93 mm false fill in the permanent hull at
X1.40/Z1.00. A local closed bearing-shoulder correction now leaves the real
channel between that shoulder and the middle case. Six independent channel
floor witnesses per side agree within 0.08 mm, while held-out stock rays and
normals retain the actual steep adjoining facet. The rounded casting between
those planes remains an original parametric approximation, not copied source
contours. Small latch relief, secondary roof facets and concealed receiving
laps remain explicitly simplified.

[The fender/channel scalar packet](chieftain_mk10_x.fender-channel-source.json)
records those measurements, limits and high/low air, stock and contact tests.
All eight Mk10 focused tests pass, including unchanged complete track/end/roller
buffers. Typecheck and the two-helper quality audit pass. The unchanged strict
CPU sampler reports zero band and shoe intersections at both detail levels
through front, rear and full sweep. The fresh `source-fender-channel` proof
captured at **2026-09-07T00:17:06.031Z** passes every valid fidelity view at raw
**97.01624197415876**, but hull geometry is still **90.99507741629532**, below
92. Whole geometry remains 93.15375956566169 and turret 94.29414045834466.
Official front/rear/full-sweep band and shoe intersections are zero, MG census
is one, and the unchanged source-real continuity column remains reported.
**This checkpoint is rejected, not release-qualified.** Full exact receipts
are retained under the unique `source-fender-channel` archive paths recorded
in the scalar packet; prior failure receipts are unchanged.

The author directly inspected the fresh neutral source/native board. The
folded cases and exposed channel are seated with no new broad floater seen
in these additions; broader bow-guard folds, rear fixture relief and casting
detail remain visibly simplified. This is not full-model visual acceptance.
The real outboard side-housing air, complete source oracle, datums and all
gates remain unchanged.

## Raised rear service frame — 2026-09-07, 00:40 UTC

The historical `source-fender-channel` result above remains rejected. Exact
complete-source cuts identify a specific cause of the remaining front-hull
upper-edge deficit: the rear service frame reaches Y1.791260 m where the
native deck previously reached only approximately 1.697 m. Three separately
crowned transverse rail segments, two falling longitudinal rails, a thin
central service cover and their folded receiving supports are now authored
from independent scalar planes. The whole deck has not been raised.

The two 61.14 mm gaps between transverse segments and the air beneath the
long rails remain physical openings. The transverse receiving web retains
its measured diagonal underside, with a separate folded outboard foot rather
than a filled pedestal. Only that narrow foot's concealed root continues
approximately 15 mm into permanent stock. Cover-wall thickness, small laps,
secondary chamfers, seals and end relief remain construction simplifications.

[The service-frame scalar packet](chieftain_mk10_x.service-frame-source.json)
records source owners, independent surface/air witnesses, limits and exact
add-only preservation. The new high/low test and all eight existing Mk10
tests pass; every old physical draw vertex remains unchanged after subtracting
only the new helper. Typecheck, runtime quality and high/low strict track
checks pass. The fresh `source-service-frame` comparison captured at
**2026-09-07T00:44:21.538Z** passes every registered valid fidelity view at raw
**97.1306900033582**, with minimum whole view **97.31779195588027**. Geometry
now passes: hull **93.72086675208449**, whole/minimum **93.15375956566169**,
turret **94.29414045834466**, stations **97.88243177248052**, dimensions
**94.90476190476193**, floaters **100**. Exact full fidelity and geometry
receipts are retained at the unique paths in the scalar packet.

Official front/rear/full-sweep band and shoe intersections are all zero and
MG census is one. **The official standard still rejects one continuity cell
at X1.86/Z−.20; this is not release-qualified.** That source-real side-housing
opening remains open, with no fill or policy waiver. The complete oracle,
coordinate frame, axles, course and all thresholds are unchanged.

The author directly inspected the fresh complete neutral board. The raised
rear rails are visibly separate and supported in the articulated rear views.
Bow-guard folds, casting transitions, seals and smaller fixture relief remain
simplified; this bounded review is not full-model visual acceptance.
