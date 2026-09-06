# Leopard 2A5 X — additive owner-source study

Status: **release-qualified — 2026-09-06T10:49:59.926Z**.
The final **2026-09-06T10:06:54.116Z** capture records raw fidelity
**96.73008733234222**, minimum whole view **96.43852716111473**, and raw
geometry minimum **93.00741397308094**: [exact fidelity](leo2a5_x.fidelity.json),
[exact geometry](../../geometry-gate/leo2a5_x.json).
All registered valid 92-point floors pass; strict band/shoe/full-sweep
intersections and continuity holes are zero. Mandatory anatomy/assets, 510 selftest files, typecheck and private/public builds passed in the composed
batch. The checkpoints below are historical; source-use restrictions and
acknowledged physical simplifications remain unchanged.
The optional front-left turret diagnostic remains **91.5**: it is not a gated
cardinal view, and its residuals are not solely the internal basket. This pass
does not claim every optional diagonal reaches 92.

New first-party `buildLeopard2A5X` in `leopardX.ts`; existing `leo2a5` stays
untouched. The X has separately authored hull planes, arrowhead modules,
functional sight recess, one native seven-wheel gear train and L/44 cannon.

## Confirmed commercial-game source: local-only exception

Owner ZIP SHA-256:
`4bb05bfdaa569862595c5b23b42bd417079a2e90555c16573ea42092f53a45ce`.
Nested OBJ SHA-256:
`40ee3021c7cea8fb17cdd5ef3343feef19957523deb2818e3fe2d1009a15fe41`.
Finder download metadata identifies Sketchfab UUID
`0a460e6bb8274bd0ab7d313bc935557f`. The
[public source API](https://api.sketchfab.com/v3/models/0a460e6bb8274bd0ab7d313bc935557f)
explicitly describes the upload as **“Leopard 2A5 from War Thunder”**. It is
not merely suspected from texture names. Uploader Jeyhun1985, April 30, 2026,
180624 faces; an uploader CC-BY claim cannot license upstream game assets.

This finding was reported before authoring. For this specific batch the owner
explicitly authorized supplied confirmed game extractions as **local
measurement/comparison only**, overriding the default hold on reference use,
not granting redistribution. This authorization does not extend to shipping
source meshes/textures/materials or a runtime source loader. No such content
is copied into the playable builder. The comparison GLB is ignored at
`public/models/community-candidates/leo2a5_x_source.glb`.

## Measured source frame and corrections

Signed source axes `x,z,-y`, +Y up / +Z forward; ground source Y −.01157,
X center −.00003, hull-root Z center −.283885. Width scale 1.0089025562 gives
3.75 m. Width-only hull / overall are 7.808290 / 9.990042 m. The explicit
longitudinal hull scale .9974946346 and overhang scale 1.0404624277 normalize
to 7.72 / 9.97 m, stern −3.86 and muzzle +6.11. No independent height warp is
performed. [KNDS A5](https://knds.com/en/products/systems/leopard/leopard-2-a5)
corroborates the 120 mm L/44 and improved optronics identity; the exact study
envelope is recorded as the owner's source fit.

| Component measured before building | Width-only bounds / datums, m |
|---|---|
| Main hull | X −1.7057..1.7052; Y .5527..1.7993; Z −3.7350..3.8342 |
| Turret core | X −1.2833..1.2578; Y 1.6788..2.6315; Z −2.7557..2.2604 |
| Arrowhead modules | to X ±1.445 and Z 3.268/3.273; Y 1.703..2.366 |
| Commander optic | X −.5081..−.0473; Y 2.6269..3.0167; Z −.6065..−.1457 |
| Corrected cannon tip | center X .023815 / Y 1.99791; diameter .16382; Z 6.11 |
| Road wheels | diameter .70317; centers Y .4401; distinct seven stations/side |
| Source belts | inner X ±1.046; outer X ±1.695; top Y 1.3145 |

The supplied left/right road-wheel stations are staggered. The current generic
native gear API has one common station list; the authored assembly uses the
paired station means, retaining seven physical dual wheels per side, rather
than duplicating source gear or overriding shared animation machinery. This
explicit approximation remains subject to whole/gear view checks.

## Genuine semantic ownership

111 source nodes are retained by name, never relabeled into artificial masks.
`vehicle#bone_turret_40`, `ex_armor_*_14_*`, `ex_armor_*_15_*`, turret caps,
commander optic, MG and their respective accessories supply genuine turret
components. `bone_gun_48` and `gun_barrel_49` are genuine gun objects. The
`wheel_*`, `track_*`, `suspension_*` nodes identify actual running gear.
Other `ex_armor_*` panels and `x_root_107` belong to the hull. Classification
must use exact nodes, not a broad `ex_armor` regex that puts skirts on the
turret. The submerged turret basket is not the exterior roof/chin.

Direct semantic comparison includes the source's real interior crew basket
and rear breech. The separate basket island measures radius .98597 m,
floor Y .82029 m and top Y 1.70975 m, with corrected center Z .661 m.
This fixes the native yaw axis at (0, 1.662, .661), not an estimated shell
center. The physical cross-trunnion is at (.0238, 1.9979, 1.659); the gun
assembly reaches back to Z −.0628 and its muzzle stays at Z 6.11. Original
first-party basket floor/walls/seats and breech/mantlet/evacuator geometry
are included, with actual geometry and parenting assertions. Valid source
components are not suppressed merely because these internal parts were
absent from the first exterior-only draft.

## Initial verification contract — historical

Seven neutral source views inspected before authoring, without importing its
textures into the study renderer. The adjacent numeric source receipt is not
an external mesh. Strict 92 per registered view/component, independent shaded
comparison, attachment/articulation tests and exact track-zero checks remain
required. Initial implementation is not a released/passing fidelity result.

The first neutral review rejected the tall slab-like outer arrowheads. Fixed
source vertical rays at Z 1.0 give Y 2.44101 at X 1.25, Y 2.10588 at X 1.40,
and Y 2.03115 at X 1.48. Original closed, faceted wrap sections now descend
to that low outer edge; a runtime triangle assertion protects the X 1.40
datum. The MG stock/muzzle are corrected to Z −.437 / .820 and its top to
Y 2.92573, with a separate right-hand ammunition box. Native linked-shoe
minimum Y is checked against source ground zero; source wheel centers stay
unchanged. These corrections do not waive the still-required final gates.

Front-projected actual triangle sections at Y 1.075–1.475 identify broad
curved basket quadrant walls spanning X −.911..−.350 and .350...911,
with cardinal windows and the narrow internal divider left open. Four thin
diagonal posts were insufficient: the native carrier now has original
closed annular sectors. A fixed ray at X .6 / Y 1.25 reaches source Z
1.42921 and independently checks the native wall. Upper smoke launchers sit
rearward (centers near Z −1.658..−.987, Y 2.278, X ±1.30), while the lower
bank sits forward and outboard (Z −1.192..−.392, Y 2.048, X ±1.37).
This is separately authored geometry, not a generic outboard stacked rack.

Connected-component review corrected an earlier semantic mistake: the source
envelope at Z −3.81 / Y 1.4398 and Z −3.71 / Y 1.3020 is the recovery
cables, not main armor. The 1170-vertex main-hull island ends at corrected
Z −3.6927; its fixed section at Z −3.31677 has minimum Y .96975 and maximum
Y 1.78672. The playable hull now follows that distinct sloping underside,
with a full-width sloped louvre field and two independently authored curved
recovery cables. Tests require the source hull section, absence of invented
armor behind that island, and retention of the separate cable envelope.
Source x_root_107 also contains distinct inboard torsion/crank housings with
bottom Y .41917, inside X 1.02703. These are separately built fittings under
the .553 m armored keel, not a lowered solid hull or masked track overlap.
The
forward lower skirt blocks occupy full solid half-width 1.875 m (at Y 1.15,
Z 2.0), with separate thinner upper modules and the source step in lower
edges. Rear thin skirts retain a documented additional .013 m stand-off from
the measured face to keep a positive margin in the strict .02 m band audit;
wheel/belt width and source axle stations are unchanged. All changes require
new final browser receipts; earlier passing screenshots are not reused.

The muzzle-reference fixture is two physical pieces: the source's forward
box spans X −.12749..−.03977, Y 1.96601..2.02990 and corrected
Z 5.93373..6.00270; its narrower aft bracket spans X −.12372..−.06449
and Z 5.87930..5.96860. These replace the draft's single short narrow box.
A fixed ray at Y 1.998 / Z 5.985 protects the actual negative-X face to
.002 m. The long main sleeve at Z 4.25–5.75 already agrees with source
triangle sections to .0003 m; it is not widened to fill a diagnostic bin.

The commander panorama's .46081 m round bearing ends at Y 2.79879; its
raised optical head is narrower, X −.41419..−.14116. The earlier broad cap
mistakenly extended the bearing envelope to the full 3.01667 m height.
Source-fixed rays at X −.49 and −.28 / Z −.37 now separately protect the
low wide bearing and the narrow raised housing, with genuine recessed glass.

The smoke banks are not mirror images in this source configuration. Fixed
negative-X rays at Y 2.08 reach X −1.39724 at Z −1.21 and X −1.40530 at
Z −.85; the negative-side launchers now have their own stagger and fan angles.
The antenna bearing is low (Y 2.57309..2.60784), followed by a slender neck,
not a .13 m-wide pedestal at Y 2.8. The source neck and shaft are protected
by independent fixed-height rays, while the full mast height stays unchanged.
Source front mudguards have two bends across Z 3.790..3.954, X 1.001..1.705,
with separate hinge ears reaching Z 3.752 and low outer edge Y 1.077; both native guards use closed, outward-wound folded
sections and separate bow tow eyes. Exact strict track preflight remains zero
for the front, rear and full swept bands and actual shoes after these changes.

Flat source belt sections at Z 0 fix ground Y 0, broad web height .08837,
guide tip .16344 and upper return exterior 1.31284. The default family shoe
was radially too deep; this build now declares independent pad (.0389),
grouser (.01636), web (.04948), guide (.06464) and pin (.01636 radius)
dimensions. Complete source track endpoints are corrected Z −3.29343 and
3.81941. Distinct drive/idler pitch radii .2712/.2471 reproduce those courses
without moving the measured axes or changing visible rim radii .360/.273.
Actual transformed native shoe vertices must match both endpoints to .010 m,
top to .012 m and ground to .003 m; strict band and shoe overlap remains zero.

Further fixed source triangle witnesses distinguish the descending central
glacis from its thin forward fenders. At X 0, Z 3.40/3.55/3.70 the actual
roof is Y 1.38614/1.27006/1.15456. At X 1.30, Z 3.55 the separate fender
skin is Y 1.32835..1.34510 with real air beneath it. The native solid nose
now narrows and descends independently of these thin wings. The source's
forward-raked spare links occupy Z 3.40..3.79, with backing rays at
X .4055 reaching Y 1.36654 at Z 3.45 and Y 1.29125 at Z 3.55. Circular
headlamp faces reach Z 3.80062 at X ±.8359, Y 1.276. These actual fittings
replace the generic raised aft lamp/pad row on this ID only.

The cannon's direct semantic mask exposed a real collar omission. Source
`bone_gun_48`/`gun_barrel_49` section rays at Z 3.29..3.42 describe a narrow
collar at Y 1.86190..2.12760, followed by an eccentric evacuator whose full
section is Y 1.85990..2.21330. Its forward taper reaches Y 2.19130 at
Z 3.95 and returns to a lower collar at Y 1.86260 at Z 4.05. Original
closed elliptical-section solids retain those measured surfaces; no source
vertices or topology are imported. All three new bow/optic/collar changes
have fixed-world triangle assertions, and the complete fleet's new-X legal
gun-pitch/high-low attachment and recoil contract remains passing.

The source bow shackle is a vertical forged eye, not a horizontal XZ ring.
Its independent native mesh now stands in YZ, retaining actual transverse
air through the eye. Fixed source-envelope checks cover its .09870 m X
width, Y 1.04676..1.26149 bounds and Z 3.95546 forward extent. Its metal
intercepts the source top-down bow ray; it remains subject to the complete
continuity scan. The circular headlamp rim is likewise rotated into its
actual forward-facing plane rather than lying flat behind the glass.

Source rays at X −1.22/+1.25, Z −3.76 find no armor or skin: the air is
outside the real −3.6927 main stern, inside the recovery-cable projection.
Only the two separately named rope tubes carry the existing open-lattice
equipment role, with their physical paths unchanged. Tests require thin
TubeGeometry, normal rendered hull ownership and strict track-clearance
participation, while rejecting that role on armor and ordinary detail.
No source exterior air is filled and no shared continuity policy changed.

## Historical 02:41 scoped checkpoint — superseded

The historical exact component/view checkpoint was generated at
**2026-09-06T02:41:42.081Z**. The adjacent `leo2a5_x.fidelity.json` now archives the
final 10:06:54.116 UTC capture. This historical checkpoint's fidelity was **96.54**; direct
hull/turret/gun/track means are **97.38/96.17/92.18/96.44**, and every
registered mean and view meets 92. Fresh fixed-world primary geometry is
**92.5** (hull 92.7, whole 92.5, turret 93.8, stations 96.0, dimensions 100,
floaters 100). Official front/rear band and shoes, complete sweep and enclosed
continuity are all **zero**; the supported MG census is **one**. Source datum
registration remained rigid 0/0 with no candidate-derived alignment. These
numbers describe that historical checkpoint, not current qualification.

## Reopened final geometry rejection

The later composed final release rejected this model at raw side-hull
**91.37151641805673** and side-turret **91.85515475801913**, despite whole
geometry **92.57554897632001**, exact stations **95.99595832485116**, dimensions
100 and passing ordinary source fidelity. The fixed source-world registration
still passes at 0/0; neither the camera nor that registration is a correction
target. The earlier complete raw curve rows were not durably archived, so a
precise numerical attribution of the checkpoint difference is not claimed.

Independent source triangle cuts identify two omitted rounded rear-deck
service covers and two omitted raised roof fittings. The latter include a
narrow bridge and a canted hood with genuine air underneath. A separate
10.4 mm excess in the native crew basket's axial radius crosses one 96-column
sample boundary, amplifying its lower-edge error; the source basket is mildly
elliptical, not circular. Source-backed physical repairs and new held-out
high/low regressions are now CPU-frozen and passing. Fresh source/shaded/strict proof, anatomy, assets and the composed release
subsequently passed. The dated final result closes this rejection through
physical correction and fresh evidence, not a historical-score waiver.

The bounded correction is recorded in
[`leo2a5_x.final-details.json`](leo2a5_x.final-details.json). Two shallow
rounded hull service covers retain their source rake and actual deck support.
The basket changes only its longitudinal floor/band/wall contour: center
Z .66115932 and half-depth .97573431, with X radius and Y levels unchanged.
The aft roof fitting is a narrow arched lug over a real transverse eye,
seated on its separately measured low chamfered baseplate. The forward hood
is a 5.9 mm canted sheet with narrow folded end legs and real air underneath.
Independent material-presence rays corrected two initially over-thin arch
sections without closing its central opening.

The hood's concealed support needs one explicit construction inference:
the measured leg roots would sit 13–18 mm above the retained native roof.
Only those narrow roots continue to the actual permanent roof, with 3 mm
positive overlap. No roof lift, broad pedestal or filled hood is introduced.
All five roof pieces are permanent turret equipment, not ERA; source-fixed
surface, air and physical-joint tests remain passing in high/low detail at
neutral and ±90/180-degree yaw, including exact disposal and retained
non-target assembly hashes. Small source facet irregularities, lug-foot
relief and microfasteners remain acknowledged simplifications. Fresh shaded,
source-fidelity and strict release proof subsequently passed; the optional
91.5 diagonal diagnostic remains explicitly outside the registered gate.
