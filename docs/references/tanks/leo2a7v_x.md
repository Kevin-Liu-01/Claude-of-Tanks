# Leopard 2A7V X — additive owner-source study

Status: **release-qualified — 2026-09-06T10:49:59.926Z**.
The final **2026-09-06T10:06:54.116Z** capture records raw fidelity
**94.17033123100498**, minimum whole view **92.0503132458764**, and raw
geometry minimum **92.0503132458764**: [exact fidelity](leo2a7v_x.fidelity.json),
[exact geometry](../../geometry-gate/leo2a7v_x.json).
All registered valid 92-point floors pass; strict band/shoe/full-sweep
intersections and continuity holes are zero.
Fused-source hull/turret/gun component scores remain N/A, not synthetic passes.
Mandatory anatomy/assets, 510 selftest files, typecheck and private/public builds passed in the composed
batch. The checkpoints below are historical; source-use restrictions and
acknowledged physical simplifications remain unchanged.

This is a new separately selectable first-party vehicle. `leo2a7v` is unchanged.
Builder: `src/vehicles/profiles/leopardX.ts`, `buildLeopard2A7VX`.

## Provenance and permitted use

Owner input: `leopard-2a7v-main-battle-tank/source/LEOPARD 2A7V MAIN BATTLE TANK.zip`.
Archive SHA-256: `54ff6b63f2ded1dbf35ec4a8dd68a86d2562e8475f76b650a3fb95c095a9f898`.
OBJ SHA-256: `c799db1950ad49edd395363db686021417549490f6499716231bfa29da4efdeb`.
The archive contains one OBJ exported from Prisma3D 2.1.1, four
`desirefx_me_*` objects, and a missing referenced `Proyek baru.mtl`. No bundled
license establishes upstream rights. The matching November 27, 2024
[Arrafi upload](https://sketchfab.com/3d-models/leopard-2a7v-main-battle-tank-659654c78dba4df1b80664afc42cbab2)
claims CC Attribution, has generated-with-AI / World of Tanks tags, and is
therefore treated as unverified, local comparison only. Tags do not themselves
prove a commercial-game extraction. No source geometry, texture, material,
vertex array, or loader is included in the runtime builder.

The owner-authorized oracle is gitignored at
`public/models/community-candidates/leo2a7v_x_source.glb`; it is not a shipping
asset. The committed `.source-measurements.json` beside this file contains only
numeric bounds and ray measurements, not topology.

## Independent dimensional correction

[KNDS A7V](https://knds.com/de/produkte/systeme/leopard/leopard-2-a7)
specifies overall length up to 10.97 m, width 3.77–4.00 m and turret roof 2.64 m.
[Bundeswehr A7V](https://www.bundeswehr.de/de/meldungen/leopard-2-a7v-5344226)
independently corroborates the 10.97 m envelope. The established Leopard hull
datum is 7.72 m. This source fit carries the 4.00 m modular-armor configuration.

After signed axis mapping `x,z,-y`, source width is 2.495383 units. Uniform
XY scale is 1.6029622743 m/unit; ground is source Y −0.91725. Hull node
`desirefx_me_001` centers Z at −0.241825 units. Width-only hull length is
8.382226 m and overall is 11.864918 m: these are not silently accepted as real
dimensions. Hull Z scale 1.4763224273 gives 7.72 m, with a continuous separate
gun-overhang scale 1.4967561296 beyond source Z 2.37278. The resulting full
oracle stern/muzzle are −4.001402 / +6.968598 m (10.97 m overall).
Height is not independently stretched or compressed.

Fresh triangle-component measurement finds the main shell roof at **2.67624 m**,
not the 3.24 m fused-equipment percentile reported in the old `leo2a7v` packet.
The actual hull deck is 1.79–2.00 m, not 2.6–2.9 m. Old oracle caps are not
inherited by X. The roof difference from KNDS is 1.37%; source masts reach
5.35/5.56 m and are explicitly slender equipment, not the roof datum.

## Shape and negative-space measurements before authoring

The closed shell spans width-only X −1.60865..1.48605, Y 1.74827..2.67624,
Z −3.03403..3.37706. In the corrected frame it is a long, low asymmetric wedge
with a raised bustle chin, not a large rectangular turret.

Actual source triangle rays through the negative-X EMES aperture:

| Ray X / Y, m | First source hit Z, m |
|---|---:|
| −0.95 / 2.40 | 1.65004 |
| −0.80 / 2.40 | 1.65004 |
| −0.65 / 2.40 | 1.65004 |
| −0.50 / 2.40, adjacent armor | 2.44061 |
| −1.10 / 2.40, outer reveal | 2.05004 |

The center opening is therefore approximately 0.79 m behind adjacent armor.
The first-party construction uses separate closed floor, side reveals and
rear bulkhead; the glass does not cover a solid face at the opening mouth.
Source-tip bounds put the bore at X 0, Y 2.032625, diameter 0.19814 m. Native
gun is straight and centered at that physical endpoint datum.

Connected gear islands fix the rear sprocket at corrected Z −3.120 m,
Y .96473 m, radius .38132 m; the front idler is Z 3.247 m, Y .90628 m,
radius .27853 m. These physical wheels must not be inferred from the outer
skirt length. The native seven paired road-wheel station means remain
−2.379, −1.569, −.759, .049, .858, 1.667, 2.476 m; diameter .750 m.

## Honest component ownership

`desirefx_me_001` is hull/deck; `.002` mixes hull and turret furniture; `.003`
mixes turret, gun and masts; `.004` mixes gear and other pieces. No independent
turret/gun/track mask can be manufactured by renaming these fused nodes. Whole
views remain mandatory, accompanied by independent numeric part probes.
Native fittings are assigned to the correct yaw/pitch owners; source mistakes
such as hull-owned roof hardware are not reproduced as articulation defects.

## Initial verification contract — historical

Seven neutral shaded source views were inspected before building. The X
profile uses original authored closed sections, generic primitive fittings,
one canonical seven-wheel running-gear assembly and independent cannon.
Source vertices/indices are not reused. The strict 92 component/view floor,
attachment and articulation checks, exact band/shoe/sweep zero-overlap and an
independent shaded review remain required; initial implementation is not a
claim that these release gates have passed.

The neutral review also fixed the full roof MG length (Z −.455 through .920,
top Y 3.17) and mast geometry: the thin whips start at Y 3.113 / 3.119,
not at the lower antenna pedestal. Their diameter is .04311 m and corrected
upper rake is approximately .30 m. The shafts are curved: a fixed ray at
X −1 and Y 4 first reaches Z −1.88403, substantially ahead of a straight
line between the endpoint datums. Original curved tube geometry preserves
that source shape. Source-fixed muzzle/height/rake triangle
tests protect these details, in addition to the EMES exterior-air test.
Removable cheek and deck plates now have original thin seated physical seams
and fasteners, not painted substitutes for changed geometry. Final neutral
review and strict gates were outstanding during authoring and subsequently passed.

The rear comparison also identified the large suspended recovery cables and
full-width sloped louvre field that a generic low exhaust pair omitted. Two
source cable islands occupy X −1.324..−.870 / .863..1.281, Y .964..2.035,
with the rearmost corrected Z −4.001. At Z −3.92 the source triangle-plane
minimum is Y 1.1222. Original curved tubes and a separate louvre assembly
now represent these actual fixtures, with a fixed rear-section assertion;
native axle/belt dimensions are unchanged and the strict CPU sweep is zero.

The supplied fourth forward skirt module is distinct from the three longer
lower panels. At fixed Z 3.35 / Y 1.15 its exposed face is X 2.0; at X 1.9 /
Z 3.4 its top is Y 1.42004; its lower edge rises to .97707 at Z 3.5. The
new original terminal loft preserves those planes and tapers inward in plan.
A documented .038 m relief on its hidden inner return clears the unchanged
native belt; the measured exposed silhouette is not shifted. Source-fixed
triangle probes and strict front/rear/full-course zero checks protect it.

Independent shaded review caught a medium-scale census error in the frontal
rack: the source has seventeen separate tubes, nine lower and eight upper,
not eight total. Lower centers begin X .4056825, Y 2.5411375, Z 2.56696;
upper centers begin X .4551395, Y 2.6222165, Z 2.5459115, both at .100876
X spacing. Each source tube is .0960737 m wide, with lower-row bounds
Y 2.464594..2.617681 and Z 2.455923..2.677997. Original annular extrusions
with recessed rear closures reproduce actual hollow mouths; a named seventeen
tube census and centerline air probes protect their geometry, not metadata.
The broad inclined tray is a real thin plate: at X .8 and Z 2.85 its source
upper/under surfaces are Y 2.5783193/2.5630257. Separate short carriers seat
the tray on the forward turret; the OBJ's hull-detail grouping is not copied
as incorrect runtime ownership.

The same review identified a genuinely sloped positive-X cheek. Fixed source
armor rays at Z 2.10 are Y 2.56965 at X .3 and Y 2.39868 at X 1.1; at
Z 2.30 they are 2.52886 and 2.31405. An original closed faceted cheek now
has the diagonally advancing ridge and outward crossfall, rather than a flat
full-width cap. The negative-X EMES air pocket and its original fixed-depth
probes remain unchanged and passing.

Independent shaded review also identified the bow's medium-scale equipment.
The source has three upper spare links at X .40916/.57280/.73085 on each
side and one lower link at X .40916, offset Y −.15610 and Z +.190037.
Their separate side webs and end pins now follow the source rake; fixed
upper and lower pin probes reach Y 1.49604/1.36291. The paired circular
headlamps are centered X ±.911, Y 1.2872, with optical faces at Z 3.68501.
Low source carriers and vertical towing eyes replace the earlier generic
aft box-light/pad row. The supporting central glacis itself is corrected
to source rays Y 1.43897/1.35682/1.27468/1.19254 at Z 3.3/3.4/3.5/3.6;
no artificial pedestals bridge an incorrect hull surface.

The source has no armor or skin at X ±1.11, Z −3.91: those positions are
exterior air inside the suspended recovery-cable projection. Only the two
separately named original rope tubes carry the existing open-lattice
equipment role. Their geometry, rendering, hull ownership and strict
track-clearance participation remain unchanged. Regression checks reject
that role on any structural armor or ordinary merged detail mesh; no
continuity-policy change or global hole exception was made.

## Historical 02:41 scoped checkpoint

The historical component/view checkpoint was generated at **2026-09-06T02:41:42.081Z**. Fidelity is **94.28**, minimum
valid view **92.93**, and every registered 92-point floor passes. Fresh
primary geometry is **92.9**, dimensions **100**, floaters **100**. Official
front/rear band and shoes, complete sweep and enclosed continuity are all
**zero**; the supported MG census is **one**. Independent shaded review
closed the recessed optic, two-row 17-mouth rack, inclined tray, cheek crossfall
and source-layout bow fixtures. The profile remained frozen; full generated
anatomy/assets and final release checks subsequently passed.

## Subsequent gameplay ERA binding repair

The pre-suite found that inherited `a7v_upper_glacis_era` had no damageable
visual binding. The existing deck panel perimeter is retained at X
−.88..+.88, Z2.03..3.14. Its exact native top triangles now form a closed,
18 mm vertically deep removable skin above a closed permanent backing;
the partition stays entirely inside the original occupied solid. The hidden
depth is an explicit gameplay construction inference, not a measured claim
that the reference carries Ukrainian reactive armor. Donor protection values
are unchanged. Existing perimeter hardware follows the cassette without
creating extra hit surfaces. All fitted faces come from actual cover triangle
indices, not a rectangle spanning air. Dense exterior/backing/reset rays and
the original source geometry tests pass. This semantic/internal-topology
change was included in fresh passing anatomy, assets and release evidence;
the earlier frozen-render checkpoint above remains historical.
