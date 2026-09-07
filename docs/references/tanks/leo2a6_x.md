# Leopard 2A6 X — independent source reconstruction

Status (2026-09-06): authoring and focused CPU validation. No final fidelity,
geometry, shaded-review or release qualification is claimed by this packet.

## Reference and provenance

Primary owner-supplied input: `leopard_2_a6.glb`, 78,687,888 bytes,
SHA-256 `b98d81990ecf8a65e8d7f81158226f1bd55fe71d6e923c4f896151d7ee237477`.
[buh's source page](https://sketchfab.com/3d-models/leopard-2-a6-7cb23d5322df4b409a880de635826067)
claims CC BY 4.0. The inspected metadata/page did not establish AI generation or
commercial-game extraction; this is not a broader guarantee about ownership.
The file remains a local comparison input. No source topology, buffers, UVs,
textures or source-loading path enter the playable model.

The canonical [registration recipe](../../research/second-wave-registrations/leo2a6_x.json)
retains scale 1, applies the proper half-turn `[-x,y,-z]`, then translates by
`[0.000005,1.08062,0.251745]`. Source body midpoint defines hull-center Z;
source track bottom defines ground 0. No per-part deformation is applied.

## Independent scalar datums

| Datum | Canonical metres | Meaning |
|---|---:|---|
| Hull body envelope length | 7.63049 | Includes source body-end sheetwork |
| Overall neutral length | 10.9547999 | Source stern through actual muzzle |
| Exterior width | 3.80991006 | Fixed source width; never candidate-fit scaling |
| Structural turret roof | 2.43111 | Armor roof, excluding raised equipment |
| Fixed PERI head top | 2.89810 | Equipment, not structural roof |
| Highest antenna | 4.15628 | Slender fitting, not roof or P95 target |
| Yaw origin | 0.000005, 2.14836, 1.047795 | Actual source turret object datum |
| Physical gun trunnion | 0.000005, 1.97054, 1.419495 | Source pitch station and independently cut bore |
| Muzzle Z | 7.139555 | Real circular muzzle, included in comparisons |

The source gun object's Y origin is not its physical tube axis. Straight-sleeve
cuts and the muzzle give Y 1.97054. The evacuator is deliberately eccentric at
Y 2.00048; its bounding-box center must not redefine the bore. Published A6
dimensions (roughly 7.72 m hull, 10.97 m overall, 3.75 m width and 2.64 m reported
height) remain external context with differing measurement conventions, not a
second normalization of this already metre-scale source.

## Forms and negative space

The independent closed lower tub leaves true air under the broad sponsons.
Separate port/starboard armor solids leave the gun throat. Forward cheek faces
carry their measured transverse and longitudinal slopes, rather than one level
wedge. The turret is not artificially centered by its asymmetric width.

At X −0.72, the source glass is Z 1.822243 at Y 2.42; its raised frame is
Z 1.869834 at Y 2.50. The 47.591 mm setback and the forward approach volume are
physical ray-tested air. They are not a black rectangle on a full forward slab.
The barrel, eccentric evacuator and bored muzzle recoil together; the actual
mantlet remains pitch-owned. Two staggered four-tube smoke rows on each flank
are separate open cylindrical mouths. Their source-sized stocks have small
original concealed saddles into the permanent flank; those saddle roots are
construction inferences, not asserted source-surface measurements.

Fixed wheel radius is 0.34531 m, rest axle Y 0.41820 m. Seven road stations are
−2.239845, −1.357925, −0.483615, 0.398305, 1.127355, 1.899555, 2.715785 m.
Drive axle (Z −3.058845, Y 0.82369) and idler (Z 3.365775, Y 0.83990) remain
unchanged by native running-gear construction. Native track contact, complete
phase sweep and final return-course seating still require the strict audit.

## Rejected first pass and source-backed corrections

The first comparison failed the gun silhouette (77.17) and strict primary
curves (hull 88.924, whole 88.125, turret 89.394). This is a historical rejected
authoring checkpoint, not qualification. Source-fixed P95 body height is
independent of the 2.43111 m armor roof; it does not authorize candidate scaling.

The physical corrections restore the source upper mantlet rake (Y2.315575 at
X0/Z2.5), eccentric muzzle-reference brackets, bow lamps and separate spare
links. Actual upper skirt sheets retain their inward crossfall: at Y1.50/Z.20,
the positive source side is X1.67796969. Cover joints follow the source's three
0.61 m long panels and separate forward return, not three oversized generic
panels. Small hidden hinge roots extend about 25 mm into the retained cover;
this seating allowance is disclosed construction inference.

The source inboard anchor has center Y.62652/Z(road+.485275), radius .14897,
width .28297 and center |X|.85961. The axle boss has radius .08630, width .23257
and center |X|1.16893. These replace generic bosses reaching 118 mm too low in
the X±.90 plane, while wheel rest axes remain fixed. End-wheel axial accuracy
and the complete strict sweep remain under review.

The first rear tub also occupied real space beneath the engine return. Separate
upper/lower folds now retain the source lower return Y1.314924 at X0/Z−3.60.
The original curved recovery hook preserves its open eye at Y.84/Z−3.55 and
Y.80/Z−3.55. At Y.84 its rear exterior is Z−3.65222048. These witnesses are
checked against the complete high/low tank, including the permanent hull.
The new physical corrections still require a fresh component/strict capture.

## Verification boundary

### 2026-09-06 equipment and ground-contact authoring checkpoint

The raised EMES aft housing, thin cupola sight cap, open aft lifting eye and
paired supported bow mirrors are now independently authored from fixed source
planes. Their actual high/low rays and the lifting-eye air remain covered by the
focused regression. The equipment-only strict geometry checkpoint passed
(hull 92.2, whole 93.2, turret 93.6, stations 97.7, dimensions 96; displayed
rounded values, not substitutes for the archived raw decisions). This is not a
final qualification of the following running-gear correction.

The former lower course put physical shoes 22 mm below source ground. Source
flat shoe skin spans Y0–0.07568 m. The correction uses a 24 mm concealed carrier
and bottom course center Y0.0564 m; actual flat skin is Y0.0024–0.0744 m.
The 2.4 mm allowance clears the rigid shoe corners at the end tangent, rather
than allowing those corners below ground. Carrier thickness and this small
corner allowance are disclosed native construction inferences, not measured
source layers. Every original road/end axle and casting remains fixed, and the
inner carrier top Y0.0684 stays below the source road-wheel rest Y0.07289.
Actual high/low shoe-vertex bounds and fixed flat-skin rays pass; the unchanged
strict CPU sampler reports zero front/rear/full-sweep band and shoe overlap.
Fresh browser fidelity/geometry and the final release procedure remain pending.

The focused `leopardA6X.selftest.mjs` pins source-fixed hull/cheek rays, actual
glass/rim depth and empty approach, physical gear axes, yaw/pitch/recoil
ownership and unchanged mesh census at high/low quality. It does not substitute
for the raw 92 component/view floors, independent shaded review, complete
anatomy regeneration or composed release check. Final receipts are pending.

### 2026-09-06 paired-wheel and forged-arm correction checkpoint

The subsequent silhouette 97.8 / geometry 93.7 passing checkpoint preceded
this mechanical finding and is historical, not proof of the following edit.
The full wheel audit exposed a real overly deep generic steel dish. The
source's paired tires occupy X 1.154605…1.294165 and 1.363445…1.503005 on the
positive side; a generic dish extended inward to X1.070324. The authored wheel
now has two separate 139.56 mm-wide annuli, a measured 0.31624 m radial shoulder,
stepped closed steel dishes and a separate 0.12401 m-radius central hub. The
69.28 mm inter-tire air is genuine geometry. Rubber/steel material assignment
at the measured shoulder is a presentation choice: the source uses one
painted material. No source topology or material maps are imported.

Further inward radial checks found that the source arm's 165.59 mm overall
axial extent was not its web thickness. Both forgings are 69.62 mm thick:
anchor X0.990565…1.060185 and axle X1.086535…1.156155. Their centers shift
95.97 mm outward along the joining web. The original native constant-width
approximation protruded about 96 mm beside the neighboring wheel. The new
closed rounded-end primitive retains this shear, mirrors with a proper
rotation on the left, and leaves all original bosses, axle stations and belt
lanes unchanged. Its receipt still reports the full sheared bounding extent;
it must not claim clearance by hiding that extent.

Actual high/low source rays now match the stepped dish within 0.03 mm
(rubber side span within 0.7 mm) and the two arm endpoint faces within 0.02 mm.
Whole-model inter-tire air, side-correct native spin and inward radial
arm-to-wheel clearance of at least 19.162 mm pass focused tests. Three
independently captured pre-change arm geometry-buffer hashes are unchanged
when the optional shear is absent. The unchanged strict CPU band/shoe sampler
reports zero front, rear and full-sweep overlap. The old global AABB wheel
clearance decision still needs its separately owned physical-contact review;
these CPU findings do not waive it or constitute fresh release qualification.
