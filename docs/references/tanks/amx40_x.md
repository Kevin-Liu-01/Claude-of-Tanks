# AMX-40 X — independent source study

2026-09-06. **Draft; visual/geometric release rejected pending refinement.**
No existing AMX-40 builder is used. Combat rules alone are inherited.

## Comparison boundary

Owner-supplied `amx-40_armored_warfare.glb` SHA-256
`2a510ae66a2355bc9766f043c7f42ae51164181ac9a6ed40d45c63993789d50e`.
Private normalized comparison SHA-256
`2b67a377fbd39d6a80e4d9511a2b890ec4abd19db37c41b1e7a6142d5c990079`.
Registration receipt: `docs/research/second-wave-registrations/amx40_x.json`.
Complete original turret owners are Object 6/7/8/11/12/24; gun owners are
Object 2/5/14/15/20. No source buffers or source loading enter the runtime.
These identities are not claims that the supplied game asset can be redistributed.

## Independent physical construction

Structural hull 6.6816m, overall 10.0588002m, width 3.3585m, structural roof
2.50869m. Bearing `[-.03904,1.56289,.16819]`; trunnion
`[-.00005,1.94827,1.3413]`; metal muzzle Z6.6028. Three separate antennae,
paired six-tube launcher banks, rear basket, cupola-mounted equipment and
projecting left sight shield are authored from primitives and scalar sections.

The source 120mm gun has a blind bore to Z5.3665 (the native dark lining seats
at Z5.3677), not a black muzzle decal. Two separate circular mantlet lenses
are recessed in actual reveals; the previous broad rectangular window was
incorrect. The cupola retains real air above its separate elliptical hatch.
Yaw, gun pitch and recoil keep the entire appropriate assembly attached.

The road-wheel source assembly includes a long inboard axle. Its entire
438.5mm envelope is not a tire: the rubber itself is 321.1mm wide, centered
at absolute X1.29715, with radius340.1mm and center Y.41530. Independent
annular rubber exposes pressed steel rather than covering it with a solid
rubber cap. All six stations and the source end-wheel axes remain fixed.
The source-sized moving shoes follow rigid chords around a rounded loaded
contact patch. All 48 opposite-scroll ground phases are tested.

## Evidence and unresolved work

Actual high/low bore, reveal, cupola, wheel annulus and recoil tests pass.
The exact committed front/rear/full-sweep sampler reports zero continuous
band and moving-shoe intersections. Original-vehicle fingerprints remain
unchanged. Scoped neutral board is under `shots/procedural-fidelity/boards/`.

The first turret-equipment refinement passed every registered silhouette
floor: aggregate95.7, hull96.7, turret94.9, gun93.8 and tracks95.0. Its exact
local receipt is `.qa-dev/reports/amx40-turret-round1-fidelity.json`.
The stricter geometry result still failed: hull89.1, whole88.1,
turret89.6, stations87.4, dimensions97.9; floaters100. These failures remain
in evidence. A good aggregate, code checks or valid articulation do not
qualify the model. Further physical repairs below await a fresh capture.
Final anatomy, exported assets and release qualification remain pending.

## Source-specific turret refinement

Independent scalar section/plane inspection identified these actual forms:

- The broad cupola foot ends at Y2.54779; its periscope band ends at
  Y2.70449. There is no continuous 141mm wall above that band. A separate
  elliptical hatch reaches Y2.74359 and positively seats on the band.
- The night head is a clipped vertical box on a narrow pedestal, with a
  capsule-shaped window at Z−.08551. It is not a horizontal round tube.
  The separately measured rear meteo mast remains unchanged.
- Object12:5572 is an open 26mm-diameter bent guard around the **left**
  six-tube launcher bank. No unsupported mirrored right guard was added.
- Object8 supplies three soft rolls and two distinct canted rigid cases.
  Their source crown rays, not merely their overall boxes, control the
  first-party elliptical and clipped-section primitives.
- Object12:975 has separate upper and lower cast nose lips. The old single
  collapsing terminal section erased an upper lip and filled its clearance.
  Source X−.85/Z1.40 upper and underside are Y2.241153/2.175587; the
  separate roof apron and pitching gun remain independent.
- The left rear 'box' was actually five jerrycans in an open folded carrier
  (Object7 and Object12:4661). At X−1.35 or−.675/Y2.0, source air extends
  to Z−1.89231, whereas the old box began at−2.2536: a 361mm overfill.
  Separate cans, narrow carrier walls, retaining strips and genuine handhold
  and inter-can gaps now replace that block. The right rear case has a
  canted wall and a separate thin outer cover, not a rectangular envelope.
- The actual mantlet optics are centred approximately X−.8269/Y1.96837
  and X−.33165/Y1.89192, with front lens crowns Z2.1258 and1.8877.
  The old test's X−.5885/Y1.93962 'window' is source solid armor at
  Z1.977516. That invented assertion was replaced by the measured solid
  witness and both genuine optical reveals. Concealed retaining rings seat
  the lens rims into their existing housing walls; front air remains open.
- Source Object15:336 supplies the wider twelve-sided coax sleeve and
  tapered base, preceding the retained narrow tube. Its rear collar extends
  to X.468, unlike the tube's X.4455. The restored cast mantlet uses measured
  sloped surfaces and a circular terminal neck; the barrel stations,
  deep bore, trunnion and roof apron are unchanged.

`amx40XTurretEquipment.selftest.mjs` checks actual high/low source first
surfaces, retained air, all five separate rear can faces, carrier gaps,
cast-lip underside, optical planes and yaw ownership. `amx40X.selftest.mjs`
retains the unchanged deep-bore, tube-section, apron, wheel and recoil
regressions. Small cast irregularities, fabric creases and sub-centimetre
fasteners remain simplified; no source vertex/index arrays enter any helper.

The second scoped capture at 2026-09-06T18:01:43.606Z is retained in
`.qa-dev/reports/amx40-turret-round2-fidelity.json`. Fidelity passes with raw
composite95.70106263880194; whole96.54521405752399, hull96.72329918830101,
turret94.64255017531858, gun93.34996050649363 and tracks94.98634532187937.
Minimum whole view is95.38893659036711. Direct turret geometry now passes:
side94.62104960140134, plan95.78476390987377. The full vehicle is **not yet
qualified**: hull front89.06289062101678, whole front88.05039062064805 and
stations87.40675716657073 remain actual sub-floor results; dimensions97.8734
and floaters100 pass. The measured night-head rain cap and remaining hull
front/outer-lug forms are separate remaining source-supported work, not waived
by the passing turret and silhouette averages.

The separately measured night-head rain cap is now an original closed,
corner-faceted 312.2 × 312.1 mm plate, underside Y3.08439 and crown3.09509.
It restores the source's small outer roof contour without changing the
retained head, capsule window or gun. Complete-source island inspection finds
the source cap itself floating 6.9–8.3 mm above Object_12:3845; no source
connector occupies that interval. The runtime therefore uses two concealed
16 × 20 mm spacer footprints as explicit mechanical inferences. They overlap
the retained head and the cap positively, while source side-overhang air and
clipped corner air remain real. High/low tests retain the old head/glass
witnesses and add independent cap upper/underside, open-gap and actual
spacer-contact checks. This local cap addition awaits the combined next
AMX40 capture after the separately owned hull/skirt correction freezes.

The combined cap/folded-skirt capture subsequently passes ordinary fidelity
(95.9 rounded), but still rejects hull front91.8 and whole front91.3;
turret93.4, stations99.1, dimensions94.5 and floaters100. These are reported
rounded diagnostics, not replacement exact receipts or a release pass.

### Stepped antenna insulators

Complete-source Object_12:5818 has a broad lower drum to Y2.49209, a short
narrowing stock to2.55119, then a 35.7-to-19.1 mm tapered neck ending2.82659.
The former single cone was physically too broad: at Y2.65 its width was
about135 mm instead of the source29.7 mm; at Y2.82 about104 mm instead of
19.5 mm. The independent replacement uses closed radial sections, retaining
the original front whip start2.82345, tip5.11445 and X/Z axis. Its basal
underside is0.7 mm below the measured source base to engage the retained
roof positively; the source upper neck overlaps the original whip3.14 mm.

Paired rear Object_12:13425/13747 similarly have a broad lower cap to
Y2.32459, a narrower stock and a 36.2-to-10.8 mm neck ending2.74059, not
full-height130 mm cones. Actual source section witnesses at Y2.30/2.40/
2.50/2.60 are retained independently for both sides. Existing mounting
feet remain unchanged: the new lower casting starts2.235 and overlaps their
2.2415 upper surfaces6.5 mm. The source's irregular lower casting below
that join remains simplified behind the retained roof/feet, not claimed as
an exact reconstruction. Both rear whip starts2.64721 and tips4.15041,
their axes, the meteo mast, cupola, gun and every hull/gear datum are unchanged.

The actual high/low equipment regression checks thirteen source transverse
sections (front within1 mm; rear within2.3 mm, including source faceting),
genuine air beside all three narrow necks, closed underside/roof or foot
engagement, and all six unchanged whip start/end datums. Neck tops must
physically overlap the original rods. These source-supported equipment
changes await the next combined frozen-geometry capture; no gate, mask,
reference transform or threshold was altered.

### Hull floor, folded skirts and forward lamp assemblies

The source Object_16 has separate thin rear/forward skirt courses, rising
ends and a folded upper root. The replacement uses5.5–14mm rear skins and a
separate fore apron, not six80–90mm rectangular slabs. Unsupported outer
lugs and the old flat25mm fender blanket are removed. Held-out source outer
planes, rising-end air, real inner bay and shoulder-root contact are tested.

Object_9's broad rear transmission floor is distinct from its narrow369.9mm
half-width central keel and oblique bilges. The runtime retains those two
floor forms. The hidden longitudinal wall is inset28.9mm from the source
plane for belt running clearance; neither wheel stations nor belt courses
move. This is an explicit mechanical departure, not an exact source-wall
claim. Strict front/rear/sweep band and shoe overlap are all zero.

Source front lamps lie aroundZ3.2, not the oldZ2.715 mounting. Round87.9mm
radius headlamps now have recessed glass, neighboring rectangular markers,
separate bent roofs, open inter-lamp space and a supported base. The front
mudguard is a6–8mm twisted rolled apron reachingZ3.414; it connects to the
shoulder through a short bearing flange rather than floating ahead of it.
The source's sub-centimetre guard facets and irregular casting remain
simplified. Actual high/low regression checks fourteen apron sections within
3mm, forward lamp seating, apron air, root contact and independently measured
rear/central floor sections within6mm. Mirrored faces retain outward winding.

The clean combined comparison now passes all metric geometry components:
hull92.3, whole93.4, turret95.3, stations99.1, dimensions100, floaters100
(rounded diagnostics; exact values remain in the receipt). **Front turret
silhouette90.9479 remains below92** after removal of the false broad antenna
cones. Actual missing roof fittings must be corrected; no cone inflation or
threshold relaxation is accepted. Final qualification remains open.

### Front mounting webs and channel

Source Object_3 has six29.8mm transverse-stock mounting webs, at paired
X172.2/338.4/778.1mm. Their longitudinal front uses three successive bend
planes and a rearward tapered bearing, with an actual37.2mm transverse pin
bore. A separate1.8798m wide,12mm folded crossbar connects their upper roots
to the lower nose. These are closed first-party extrusions with genuine
bores and air between webs, not a replacement full-width armor rectangle.
High/low tests retain24 independently sampled front-plane witnesses within
3mm, all six open bores and surrounding stock, crossbar engagement and air
between adjacent supports. Small transitions between source bends and its
irregular pressed crossbar fastening ribs remain simplified. The candidate
does not import source topology and this change does not move any hull,
track, turret or gun datum. Fresh combined gates remain required.

### Source roof grip, oblique sight and weapon-side mechanism

The remaining front-outline deficit exposed three actual roof fittings, not
the removed oversized antenna cones. Object_12:8578 is a bent rectangular
grip reaching Y2.38809, supported by separate thin sloping plates8658/8848.
The first-party curved extrusion and closed14mm plates preserve the large
outboard opening at X1.24/Y2.26. Three independent crown/underside pairs at
X1.18/1.24/1.29 agree within3mm in both runtime LODs; the actual lower root
engages the unchanged turret casting. No bounding-box fill closes the opening.

Object_12:457 is a yaw−.633 oblique roof sight, not the former straight box.
Its source crown is Y2.58929 and its rear-facing Object_11:11 glass lies at
Z−.476976/−.461893 at X.70/.72, Y2.54. The replacement has separate sidewalls,
backing, a beveled cap and genuinely recessed glass; actual high/low first
surfaces agree within1mm at the held-out crown/glass witnesses. Its source
round flange sits on the separate18.6mm Object_12:19216 service skin, also
restored as an original clipped plate with real roof engagement. The supplied
case floats5.8mm over that flange: only its concealed lower wall extends7mm
to make a positive1mm connection. This is an explicit mechanical inference,
not a claimed source connector or an added broad pedestal.

Object_12:6368 is a thin folded MG-side tray and narrow receiver web, with
paired longitudinal closed rollers17277/17143 and adjustment disk6973.
These replace only the former broad side box. Source roller/disk crown
witnesses agree within1.5mm; real air above the roller, each roller's end
contact with the tray, disk/roller contact and web/receiver engagement are
checked on the actual high/low factory model. All added weapon-side pieces
retain the existing exact MG owner and follow turret yaw independently of
main-gun pitch. Existing weapon barrel/receiver, main gun, bore, whip axes
and heights, source transforms and hull/gear datums are unchanged. Fine
lever/fastener details remain simplified; no source buffers ship.

`amx40XRoofFixtures.selftest.mjs`, the existing equipment/profile tests,
typecheck and focused complexity checks pass. The complete combined roof
and front-web candidate is frozen for fresh silhouette/geometry/strict
qualification; the prior90.9479 front-turret failure is not retroactively
treated as a pass.

The subsequent combined frozen capture at2026-09-06T19:16:32.948Z passes
all registered views/components: raw composite96.21859806695639, whole
97.71443026346257, hull97.31144947221028, turret94.73451106812385,
gun93.32627603822137 and tracks94.30787210600745. The former failed front
direct-turret view is95.37; top direct-turret92.63 remains the lowest printed
registered turret view. Geometry minimum is92.33242187220752, with hull
92.33242187220752, whole95.48593749835601, turret95.27648165059892,
stations99.08414626979948 and dimensions/floaters100. Official standard
reports zero front/rear/full-sweep band and shoe overlap, zero enclosed
continuity cells and one actual MG. Exact local receipt:
`.qa-dev/reports/amx40-roof-fixtures-fidelity.json`.

Read-only review of the fresh neutral board confirms that the source-like
open grip, angled sight and front mounting webs are present and supported;
the narrow antenna necks and genuine openings remain. The bounded repaired
assemblies show no new medium defect. Small source lever/fastener and grill
relief remain simplified. Geometry is frozen; mandatory final anatomy,
assets and release verification remain separately required.

The subsequent anatomy-overlay regression exposed zero volume in the night
sight's glazing: the previous ShapeGeometry had no rear face. Its exact front
plane and visible silhouette are retained atZ−.08551; a concealed4mm closed
extrusion reachesZ−.08951 and overlaps the case by1mm. This small rear thickness
is a declared mechanical inference, not a measured source depth. Actual
high/low front/recess and closed-back tests pass; calibration regeneration and
fresh final shape verification are required after this fix.

The closed-glazing rebuild subsequently passed fresh raw92 comparison and
the full standard gate. Local receipt:
`.qa-dev/reports/amx40-closed-glazing-fidelity.json`. Geometry's lowest
component is still92.3 (hull), with whole95.5, turret95.3, stations99.1,
dimensions100 and floaters100. Front/rear/full-sweep band and shoe overlap
remain zero, continuity defects zero, and the actual roof weapon census one.
This supersedes the shape-refresh requirement immediately above; final fleet
anatomy/asset/release receipts still need the completed23-model batch.
