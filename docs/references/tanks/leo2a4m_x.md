# Leopard 2A4M X — additive owner-source study

Status: **release-qualified — 2026-09-06T10:49:59.926Z**.
The final **2026-09-06T10:06:54.116Z** capture records raw fidelity
**95.33029438076386**, minimum whole view **93.01881346427744**, and raw
geometry minimum **93.01881346427744**: [exact fidelity](leo2a4m_x.fidelity.json),
[exact geometry](../../geometry-gate/leo2a4m_x.json).
All registered valid 92-point floors pass; strict band/shoe/full-sweep
intersections and continuity holes are zero.
Fused-source hull/turret/gun component scores remain N/A, not synthetic passes.
Mandatory anatomy/assets, 510 selftest files, typecheck and private/public builds passed in the composed
batch. The checkpoints below are historical; source-use restrictions and
acknowledged physical simplifications remain unchanged.

Independent `buildLeopard2A4MX` in `leopardX.ts`. Existing `leo2a4m` is unchanged.
The new authored model follows the supplied broad low AMAP shell, forward
hull modules, low L/44 and left-offset stern frame; it calls no donor builder.

## Provenance / permitted local study

Owner GLB SHA-256:
`b3911324cf3119e1e7815cad115667a698407fe1921e4bd1e88970d8b2416b53`.
Embedded source: [Arrafi A4M](https://sketchfab.com/3d-models/leopard-2a4m-main-battle-tank-80b589fc9c0b4720888b40d01d6e5153),
author Muhamad Mirza Arrafi / nazidefenseforceofficial, uploader-claimed CC BY
4.0. Existing ATTRIBUTION flags extraction-suspect account / `chassis_vlo`
lineage. This is owner-authorized local-only measurement/influence, not
redistributable upstream content. The GLB, textures and sampled topology do not
ship or load in the playable model. Ignored oracle:
`public/models/community-candidates/leo2a4m_x_source.glb`.

## Source-first dimensions and shape

Axes `y,z,x`; source ground Y −1.10783; X center −.014585; hull `Object_2`
Z center −.363515. Width-uniform scale .9461450237 produces 3.77 m across the
actual modules, not the unrelated 4.07 m figure for another armor fit.
Width-only hull / overall read 7.713173 / 9.967837 m. Recorded longitudinal
scales .9469824747 (hull) / .9399916072 (beyond bow) normalize to
7.72 / 9.96 m and keep stern/muzzle at −3.86 / +6.10. Y is not warped.

| Measured feature | World/corrected values, m |
|---|---|
| Main hull | X ±1.885; Y .5231..1.8165; Z approximately −3.826..3.830 |
| Turret main shell | X −1.5226..1.4195; Y 1.6703..2.4486 |
| Shell silhouette | left stern to −2.833; pointed cheek to +3.024 |
| Cannon tip center | X −.12731, Y 1.90798, Z 6.10; diameter .1626 |
| Thin radio whips | source roof equipment reaches 4.3851 |
| Gear | sole source band spans 7.0112 longitudinally and 3.2947 laterally |

`Object_3` paired 107-vertex wheel islands yield normalized paired-mean
stations −2.46924, −1.69277, −.84589, −.05430, .71890, 1.51565, 2.35278 m,
diameter .69182 m; these pin the independent station test. The source has
small per-wheel Y differences; the native loaded axle line is .444 m.

The source's low cannon and asymmetric shell are measured, not donor values.
The 2.62 m spec is the established hatch-equipment datum; actual bare shell
2.4486 m and thin radio whips are separately recorded. Manufacturer
[A5 L/44 description](https://knds.com/en/products/systems/leopard/leopard-2-a5)
corroborates the cannon family; exact A4M fit dimensions remain explicitly
source-configuration measurements rather than an invented primary citation.

## Fused-source / VLO ownership

`Object_2` contains hull and turret-zone equipment. `Object_3/4` fuse hull,
turret, cannon and masts. `Object_5` is the only complete gear train, not a
removable duplicate shell. No raw node honestly separates turret or gun.
Therefore whole-model views plus independent numeric triangle probes are used;
component labels must not be synthesized to make an easy mask. Native yaw,
pitch and roof fitting ownership are independently correct.

## Initial verification contract — historical

Seven neutral source views inspected before building, including the offset
rear frame and actual frontal sight opening. `.source-measurements.json`
contains bounds/rays only. Every registered view/component must reach 92,
with independent shaded review and strict attachment/articulation/track-zero
checks; no legacy 89.5 ceiling is inherited and no release pass is claimed by
the initial implementation.

The source RWS has a distinct receiver at X .66869...82075,
Y 2.86965..3.00535 and Z −1.2139..−.84245, with its narrow barrel reaching
Z −.08713 and top attachments reaching Y 3.03048. The native weapon now
uses that full physical length and elevation, with a separate camera housing
(.25738 × .18388 × .30611 m near X .381 / Y 3.005 / Z −1.055) and open
side supports. Fixed-source runtime bounds tests prevent reintroducing the
short/tall generic substitute identified in the neutral review.

Independent shaded review subsequently distinguished two additional RWS
parts from the main receiver: the source low cradle spans X .46052..1.01943,
Y 2.65288..2.77848, Z −1.12398..−.72043, while a separate outboard
receiver/ammunition body spans X .88798..1.13044, Y 2.82656..3.04817,
Z −.95863..−.83767. Original separate cradle, side body, stepped cap and
small feed/yoke connection retain the protected main gun axis. Fixed rays at
Z −.90 reach Y 3.03976/3.01360/2.97733 for X .90/1.00/1.10, and the low
cradle at X .50, Z −.85 reaches Y 2.77643. These are actual geometry
assertions against independently measured source surfaces, not a widened
generic MG or a bounding-box-only claim.

## Historical 02:41 scoped checkpoint

The historical component/view checkpoint was generated at **2026-09-06T02:41:42.081Z**. Fidelity is **95.32**, minimum
valid view **92.83**, and every registered 92-point floor passes. Fresh
primary geometry is **92.8**, dimensions **94.3**, floaters **100**. Official
front/rear band and shoes, complete sweep and enclosed continuity are all
**zero**; the supported MG census is **one**. Independent shaded review
closed the separate source-sized receiver body, sloping cap and substantial
RWS cradle. The profile remained frozen; full generated anatomy/assets and
final release checks subsequently passed.
