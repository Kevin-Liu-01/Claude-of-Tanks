# C1 Ariete X — independent supplied-file reconstruction

**Changed target:** the owner subsequently instructed this X model to match
the supplied GLB, including its proportion differences. Source-only registration
and a new independent procedural rebuild are in progress. The photo-led draft
and checks below remain historical, not approval of the replacement. The source
AI warning remains documented; the new comparison establishes file likeness,
not real-vehicle dimensional accuracy. Production Ariete models are unchanged.

## Current supplied-file measurement contract — 2026-09-06

The source-only canonical recipe is
`docs/research/second-wave-registrations/ariete_c1_x.json`. It retains every
original object, applies the same positive uniform scale
`0.021363932716129873` to all axes, and places the actual track ground at Y0
and the actual hull longitudinal midpoint at Z0. The source already faces +Z.
The 3.61 m **full supplied visual width** is the ruler; this does not assert
that the file's bulky external armor is the manufacturer's bare fender datum.
Neither a candidate bounding box nor rendered candidate mask sets the frame.

| Quantity | Supplied-file target | Original CIO figure | Interpretation |
|---|---:|---:|---|
| Hull envelope | 7.0114 m | 7.99 m | Source is about 12.25% shorter |
| Gun-forward envelope | 8.5338 m | 9.87 m | Source is about 13.54% shorter |
| Full visual width | 3.61 m | 3.61 m fender width | Chosen uniform ruler; not identical physical datum |
| Primary hull roof | 1.5182 m | 1.82 m | Source roof about 16.58% lower |
| Primary turret roof | 2.1313 m | 2.50 m | Source roof about 14.75% lower |

The authoring study resolves a low hull with a real recessed bearing well,
separate sharply beveled heavy side armor, a substantially recessed left
frontal sight roof, an undercut turret rear and an open carried-stowage frame.
Those are construction targets, not permission to import its triangles or
fill its openings with boxes. Its main turret ring and gun axes are being
measured independently; the previous photo-estimated pivot values below are
not reused. Primary islands, scalar planes and held-out ray measurements are
private inspection inputs only. Material-batched source objects mix multiple
physical owners, so no invented partial-triangle component masks are allowed.

The native supplied-file replacement is now **wired but not qualified**.
`arieteXSupplied.selftest.mjs` constructs the actual high/low X entry and checks
the source datums, closed planar armor stock, held-out face witnesses, real
mantlet throat, open barrel and blind bore depth, bearing/bustle undercuts,
axles, native pitch and recoil. Those checks pass. The unchanged strict CPU
track sampler reports zero front, rear and full-sweep intersections for both
bands and shoes. Full raw visual/geometry gates and release checks remain
required; the photo-draft passes below are not the replacement's score.

The source bearing is `[0,1.306227824,.328028885]`; the round gun axis is
Y1.651499209 and its visible rear seat is Z1.3415539. A hidden pitch joint at
that seat is an explicit mechanical inference because the file has no bone.
The 28-cell analytic mantlet arch follows the measured circular opening,
not a rectangular bounding box. Closed plane-defined cheeks remain permanent
turret armor through damage and LOD changes. The source contains an empty
cupola fork, not a complete roof machine gun; it receives no false weapon credit.

Two concealed native mechanical accommodations are documented rather than
applied to the source oracle: the wheel-well ceiling is raised from its
source plane to Y1.080 to clear the articulated return shoes, and the loaded
course center is Y.045 instead of the first .040 estimate to keep shoe corners
above ground. Road/end axles and exterior shoulder roof planes are unchanged.
An outboard folded return closes the skirt-to-shoulder seam without filling
the wheel well. All source objects remain in the comparison.

## Supplied-source rear fittings — bounded correction, not release approval

The first supplied-file checkpoint recorded approximately 97.8 raw fidelity
and 96.9 geometry with zero strict band/shoe intersections, but a rear
continuity failure. That historical failure is retained. Inspection of the
complete canonical source identified real construction errors: a round torus
substituted for the flat C-shaped towing head, a broad box substituted for its
separate stepped lever, a shallow box omitted the lower hooked coupling, and
the round deck service cap was placed 318 mm too far aft.

`arieteXSuppliedHullEquipment.ts` now authors these as original closed
primitives. Source island 4980 has a 37.85 mm-thick C head and a real left
throat; island 4905 supplies the distinct stepped lever, with retaining ears,
collar and cross-pin. The shank ends at Z−3.167582, while measured flared hinge
roots—not an invented shank extension—meet the unchanged rear hull plane
Z−3.157488. The native roots overlap that permanent plane by one concealed
millimeter. Source island 773 supplies the lower hooked forging, separate
upper locking jaw and open throat. The round cap is centered at Z−2.429937
with a flat crown radius 0.408774 m and top Y1.518185. Its shallow beveled
shoulder replaces the previous overhanging disc.

The independently authored C arcs and lower-hook curves retain small local
rounding differences, bounded by held-out surface tolerances of 1–6 mm; the
flat head's slightly falling forward top is simplified by at most 2.1 mm.
The cap bevel has approximately 2.1 mm local tessellation/profile difference.
No source vertices, indices, texture coordinates or topology enter the runtime.
All other supplied hull, turret, gun, road/end axes and track geometry remain
unchanged.

`arieteXSuppliedRearTow.selftest.mjs` exercises the actual high/low factory,
including source head stock, separated ear undersides, lever/cross-pin contact,
flared-root attachment, lower-hook and locking-jaw air, and the relocated deck
cap. The original supplied geometry regression, typecheck and focused quality
scan pass. These CPU checks do not replace fresh rendered qualification.

The continuity discrepancy is reported honestly. A CPU reproduction of the
committed 6 cm / 3× top-view sampler, on the exact same native frame, finds
**three native enclosed cells and the same three cells in the complete source**.
Their actual X/Z centers are (−0.059230768,−3.357105101),
(−0.059230768,−3.416790709), and (0,−3.416790709); top rays are empty in both
models. The separately corrected cell at (0,−3.357105101) meets the real lower
coupling, source Y≈0.956214. The report's rounded nominal coordinates differ
from the actual cell centers because the fitted cell pitch is 0.059231 ×
0.059686 m. Thus a literal zero-hole rule conflicts with genuine source
negative space here. No continuity classifier, exclusion, threshold, source
mask or geometry role was changed, and no strict-zero claim is made. The
fresh `source-rear-closures` checkpoint must retain its actual result, including
the source's absent complete roof machine gun rather than awarding false credit.

That fresh immutable checkpoint completed at 2026-09-06T23:49:28.114Z:
raw fidelity **97.85935549973813**, minimum valid whole view
**97.27561411545888**, tracks **97.39675176105726**, and raw geometry minimum
**97.27561411545888** (fixed-source whole-outline metric; dimensions and
floaters both 100). All applicable source-likeness checks pass. The official
standard still **fails**: all front/rear/full-sweep band and shoe intersections
are zero, but continuity is **3** and machine-gun census is **0**. These are
not reported as a full release pass. Complete fidelity/geometry outputs remain
in the immutable ignored `ariete_c1_x-source-rear-closures-*.json` receipts.
The fresh neutral board shows no new broad-envelope or main aperture defect;
its overall view cannot independently resolve every small towing-ear surface,
which is covered by the actual high/low source-ray tests above.

## Historical photo-led draft (superseded by the owner)

Status, 2026-09-06: **authoring draft, not qualified**. This is a new first-party
procedural vehicle, not a reskin or donor-family builder. CPU construction and
mechanical checks are not substitutes for visual review or the final release.

## Evidence and provenance

The owner's `c1_ariete_main_battle_tank.glb` has SHA-256
`02043219575d2ac02c9846666efca20c8087727808e4c51245a28588242e26b4`.
Its [source page](https://sketchfab.com/3d-models/c1-ariete-main-battle-tank-97db7617df55431590c09b9cd37e42ff)
is AI-labelled. In the historical draft it was supplementary visual material
only. The owner's later instruction makes it the current likeness target
under the source-only recipe above, without changing its provenance warning.
No source arrays, textures or topology enter the runtime. No source-mesh 92
score is claimed before the actual replacement passes the comparisons.

The primary dimensional instrument is the original
[CIO Ariete MBT specification](https://www.iveco-otomelara.com/docs/Ariete-MBT.pdf):
7.99 m hull length, 9.87 m gun-forward length, 3.61 m fender width, 1.82 m hull
height, 2.50 m turret roof, 2.86 m panoramic sight and 0.48 m ground clearance.
This is the original C1 configuration, not the later C2 upgrade. The brochure's
different length figures from common secondary summaries are retained openly.

Photographic shape references, all original U.S. Army captures:

- [Spc. Uriel Ramirez, 2021-02-21, VIRIN 210221-A-GQ344-1001](https://www.dvidshub.net/image/6529373/c1-ariete):
  forward quarter and wheel/armor proportions; the dark exposure limits small
  aperture interpretation.
- [Spc. Nathanael Mercado, 2016-05-12, VIRIN 160512-A-DN311-428](https://www.dvidshub.net/image/2587533/strong-europe-tank-challenge-2016):
  side profile, seven road stations, hull cooling louvers, turret wedge and
  rear bustle. The turret is traversed relative to the hull.
- [Spc. Nathaniel Gayle, 2021-09-13, VIRIN 210913-A-TC177-1032](https://www.dvidshub.net/image/6833050/italian-army-132nd-tank-regiment-meets-us-army-europe-and-africa-commanding-general):
  paired bow lamp bodies, separate spare-link field, and the deep turret-bustle
  undercut. This close view shows the turret reversed; its bustle is not
  mislabelled as frontal armor.

The [Italian Army's native-language description](https://www.esercito.difesa.it/equipaggiamenti/veicoli-blindati-e-corazzati-da-combattimento/veicoli-da-combattimento/carro-armato-ariete/81543.html)
places the driver at front right. Photographs remain comparison inputs, not
playable textures or redistributed media.

## Original construction and confidence limits

The hull is a closed station-defined tub with separate outboard guards, lamps,
skirts and raised rear deck. The undercut bustle and tapering lower turret are
closed original sections; neither the ring clearance nor the main gun throat
is filled by a bounding box. The main tube has an open 120 mm muzzle, recessed
inner backing, separate evacuator and reference fitting. All tube furniture
recoils; the real cradle is pitch-owned.

Yaw `[0, 1.60, 0.56]`, trunnion `[0, 2.08, 1.77]` and wheel/end stations are
photo-estimated authoring datums, not surveyed real-vehicle positions. Muzzle
Z5.875 follows the primary overall envelope and hull-centered frame. The
panoramic head's 29 mm front recess and concealed support depths are explicit
native construction inferences; no millimetric photogrammetry claim is made.
The separate carried-link pattern is an interpretation of the dated bow
photograph, with pins and small latch relief simplified.

## Pending checks

`arieteX.selftest.mjs` exercises the actual X factory at high/low quality:
manufacturer envelope and clearance, physical shoe ground, real sight and
muzzle air, bustle undercut, gun pitch/recoil and permanent turret equipment.
The actual-ID high/low test passes. The unchanged strict CPU track sampler
also passes on `ariete_c1_x`, with zero band/shoe overlap in front, rear and
complete sweep. Full typecheck and the focused complexity gate pass (22
functions, zero violations). These are authoring checks, not a release receipt.
The clearer forward gunner-sight photograph still needs review. Independent
shaded acceptance, complete anatomy and strict composed release remain required.

## Photo-led equipment correction — authoring, not qualification

The first draft placed the forward launcher center at X±1.34 m, with a mouth
reach of only about 72 mm outward, inside the existing approximately 1.44 m
turret flank. This was a real occlusion, not an absent texture or a poor score.
The 2016 Army side photograph supports four exposed tubes per side. The
replacement uses an original closed metal tube wall, open front annulus and
recessed stock on a carrier that overlaps the unchanged permanent armor. All
eight stocks have actual sampled surface overlap greater than 10 mm; eight
radial rays per bore reach the recessed stock without hitting armor, the
carrier or an adjacent launcher. The checks repeat after turret yaw at both
quality levels. The 90 mm outside diameter, 190 mm length, 170 mm mouth depth
and precise placement are explicit photo-led construction estimates, not
measurements from the unreliable supplied mesh.

The September reversed-turret photograph also supports broad paired aft bins
and positive folded receiving brackets. The former narrow .31 m-wide plates
are replaced by separate .72 m-wide bins with permanent-root overlap, hinges
and open-centered brackets. Bin dimensions and bracket relief are estimates;
no source-photo photogrammetry claim is made. The main bustle, bearing air,
turret roof, hull, gun, all road/end axes and track construction are unchanged.
Fine latch/pin relief and external soft stowage remain simplified. These
changes need fresh independent shaded review and the complete release gates.

## Recessed road-wheel correction — 2026-09-06 authoring checkpoint

The 2016 Army side photograph shows a broad recessed steel bowl, a localized
central hub and a rolled outer rim. `primaryPhotoWheelSolids.ts` now supplies
an original closed turned core instead of the generic proud disc/spoke stack.
The 108–125 mm axial bowl planes, 204 mm rim and 229 mm hub offset from each
axle are explicit construction estimates, not photographic metrology. Small
hub/rim fasteners and stamped relief remain simplified.

Road/end axle centers, tire radius and outer axial envelope, track geometry,
shoe count and hull/turret/gun dimensions are unchanged. The original rubber
center was a filled cylinder; it is now annular, retaining the existing
0.94-radius / 1.03-width shoulder around the actual steel rim. The native
suspension still follows its actual inboard wheel surface rather than the old
oversized generic hub. No separate stationary wheel row is added.

The dedicated `primaryPhotoWheelSolids.selftest.mjs` passes in high/low quality:
eight radial sectors at four independent bowl depths per wheel, true approach
air, supported central hub, steel/rubber overlap, identical tire/face spin
matrices, disposal and exact preservation of non-wheel surfaces and moving
track/end-wheel buffers. The 173-tank wheel-quality audit, track/suspension
pattern checks, original Ariete geometry tests, typecheck and focused complexity
gate pass. Strict front/rear/full-sweep band and shoe overlap remain zero.
Fresh neutral quarter/rear/wheel closeups show the actual bowl shape; this
closes the former flat-disc finding, not overall visual or release qualification.

## Primary-photo roof and hub refinement — 2026-09-06

A further original Army image from the same May 2016 event resolves the
previously obscured sight arrangement:
[Spc. Nathanael Mercado, VIRIN 160512-A-DN311-176, DVIDS 2587515](https://www.dvidshub.net/image/2587515/strong-europe-tank-challenge-2016).
The frontal image clearly shows a broad, separate twin-window lower sight on
vehicle right, a taller protected optical head behind it, low roof rails and
localized hinges/fasteners. This is dated C1 evidence, not a later C2 sight or
an interpretation of the supplied AI mesh. The original 2016 side image
supports the low rails, closed-rest hatch hardware and localized hub nuts.

`arieteXPhotoDetails.ts` now supplies the lower sight as a seated sloping pad,
closed backing, side/top/sill stock and two separately recessed glass panes.
The former round head shell is replaced by a squared protective housing with
a taller real aperture. Its original glass plane Z0.616 and published 2.86 m
crown remain unchanged. A low socket now overlaps the actual roof, instead of
leaving an unexplained gap below the former head. Both optical locations,
window sizes/depths, hidden shell closures and support thicknesses are native
construction estimates; a single oblique photograph does not establish their
surveyed three-dimensional positions. The lateral alignment of the two sights
is approximate, and the head's small corner radii and optical internals remain
simplified. The reliable published structural/overall envelope is unchanged.

The closed-rest hatch handles and low side rails have separate seated legs and
genuinely open intervals beneath the bridges. Their feet follow the original
roof and hatch surfaces. The source photos often show open crew hatches, crew,
covered soft stowage and varied machine-gun elevation; this draft retains its
closed-rest hatch and level gun configuration, without converting those poses
or removable covers into permanent geometry.

Eight small hub fasteners per road-wheel face are an explicit count/scale
interpretation of the 2016 side image, not photographic metrology. They are
joined to the original spinning core: every original bowl triangle is retained
coordinate-for-coordinate, the 229 mm axial core and 316 mm rim envelopes stay
fixed, and no raised spokes, new tire row or stationary disc is introduced.
The native tires, shoulders, road/end axles, suspension and complete moving
track course are unchanged. Fine stamped relief and exact nut/washer profiles
remain simplified.

`arieteXPhotoDetails.selftest.mjs` passes actual high/low factory checks for both
lower optical recesses, the preserved upper sight plane/crown, positive contact
to the sloped roof, open handle/rail air, original bowl triangles, every native
wheel's moving fastener frame and resource disposal. The original Ariete and
shared photo-wheel tests also pass unchanged. A before/after high/low fingerprint
in ignored reports preserves every non-roof/road-core buffer and transform;
the full committed strict sampler reports zero front/rear/full-sweep band and
shoe overlap. Typecheck and the focused 41-function quality scan pass. These
are physical authoring checks, not a numerical source-mesh likeness score or
the final anatomy/release qualification.

Ten fresh actual-runtime neutral/camouflage quarter, rear, tilted-top, roof
and wheel views were captured through the shared serialized capture queue;
the owned browser closed successfully. The ignored evidence prefix is
`.qa-dev/reports/ariete_c1_x-primary-refine-`. Independent review against the
May 2016 frontal image closes the missing-equipment finding: separate lower
twin windows and upper head, seated bases, hatch/rail air, launcher mouths and
localized wheel hubs remain readable, without a newly observed floater or
filled aperture. The lower sight still reads wider/shallower and the upper
hood corners more rectangular than the photograph. These are explicitly
photo-inferred proportion/detail limitations, not a measured match or full
quality qualification. The original upper sight's viewing witness is retained;
the extended lower pane has only local recess checks, not a claim of an
unobstructed field of view at every height. Final anatomy/release qualification
remains separate.
