# T-90A Vladimir X — owner-source reconstruction

Status: **release-qualified — 2026-09-06T10:49:59.926Z**.
The final **2026-09-06T10:06:54.116Z** capture records raw fidelity
**96.74454320698266**, minimum whole view **94.40786589683208**, and raw
geometry minimum **94.40786589683208**: [exact fidelity](t90a_vladimir_x.fidelity.json),
[exact geometry](../../geometry-gate/t90a_vladimir_x.json).
All registered valid 92-point floors pass; strict band/shoe/full-sweep
intersections and continuity holes are zero.
Fused-source hull/turret component scores remain N/A, not synthetic passes.
Mandatory anatomy/assets, 510 selftest files, typecheck and private/public builds passed in the composed
batch. The checkpoints below are historical; source-use restrictions and
acknowledged physical simplifications remain unchanged.

Source topology is audited; redistribution provenance remains unresolved.
The independently authored `buildT90AVladimirX` and actual-geometry probes
are implemented. An earlier scoped 2026-09-06 proof recorded fidelity 96.38 and
primary geometry 93.9; every valid source view is ≥92. Official band, shoe
and full-sweep intersections are zero, body-contiguity holes zero, and actual
visible MG census one. The source-specific folded rear guards are physically
seated and pass high/low source rays. The [exact final receipt](t90a_vladimir_x.fidelity.json)
retains the honest fused-source mask ownership. Fleet-wide release integration
and generated receipts subsequently passed, including the forward-guard repair.

Owner archive `uralvagonzavod-t-90a-vladimir-main-battle-tank.zip`, SHA-256
`8bc8780d344e8e8708909d7a6ea93f6b632e4e0fad3a00340e4dc20259f1d1e3`.
Its FBX SHA-256 is
`68eaf6f2e315363e2aff067c2daef304b6ef7bc97f74eaf5635544f2a5dbbf67`.

The title, January 5, 2025 publication date and 262,200 triangles match
[Muhamad Mirza Arrafi's listing](https://sketchfab.com/3d-models/uralvagonzavod-t-90a-vladimir-main-battle-tank-66e1ac73b0d940edb232335248bb3a2b).
That uploader claims CC Attribution. However, the FBX contains twelve
`desirefx.me_*` mesh names and 3ds Max metadata, indicating an intervening
redistribution history. The original creator and rights chain are not
established by the supplied archive. A `world-of-tanks` listing tag is a
warning, not sufficient proof of a game extraction. Keep it quarantined and
do not equate the uploader's label with verified original authorship.

The FBX contains 12 meshes, 262,200 triangles and three non-mesh text objects;
there are no animation actions or native parent/child articulation nodes.
The nominal tower mesh `desirefx.me_001` includes the main gun: isolated
gun-pitch masks would be dishonest without documented geometric partitioning.
Wheel surfaces are split across several material meshes, not a native
suspension hierarchy.

Blender source world is Z-up. Whole raw bounds are X
-0.153560…0.121239, Y -0.432667…0.324469, Z -0.080187…0.196566.
Uniform registration to 3.78 m width gives total furniture height 3.8069 m
and overall length 10.4148 m. The mesh object origins are shared export
transforms, **not** usable turret or gun pivots. Accurate structural hull,
turret, barrel and wheel measurements are required before any normalized
comparison registration. The older repaired oracle is not the new source.

The playable addition uses independently authored procedural
geometry with the 92-point per-view/component exemplar floor, dimensions
within 3%, native running gear and full anatomy/release verification. The
existing `t90a_vladimir` remains unchanged.

## Final structural registration

The owner confirmed local measurement/comparison use of this supplied batch
on 2026-09-05; that is not redistribution permission. Source axes map
`(X,Z,-Y)` to game XYZ. Scale XY is 13.7554585153; longitudinal scale is
14.2462479886. The largest closed 2,212-vertex hull island establishes the
6.86 m structural hull, centered independently of the gun and fuel drums.
No source vertex, index, texture or rig is used in the playable builder.

| Measured source-fit datum | Metres |
| --- | ---: |
| Structural hull / complete external hull length | 6.8600 / 8.1115 |
| Width / complete gun-forward length | 3.7800 / 10.7863 |
| Roof-equipment height including whip | 3.8069 |
| Main turret shell width / length / roof | 2.8997 / 2.6552 / 2.2595 |
| Muzzle Z / bore Y | 6.5964 / 1.7287 |
| Road-wheel radius / center height | 0.36837 / 0.43969 |

The six physical road-wheel centers are Z -1.82823, -0.94808, -0.06794,
0.81221, 1.69235, 2.57250, measured from connected wheel discs rather than
assuming equal station positions from another T-90. Native paired discs
sit about X ±1.32286 and ±1.57531 on each track side.

Yaw `(0,1.416,0.298)` is inferred from the physical ring. A trunnion
`(0,1.7287,1.34)` is appropriate for the newly authored barrel, but is not
claimed as a source animation pivot. The intact reference keeps its barrel
within `OracleTurret`; mixed `T90A_Glass` spans hull and upper assembly.
Therefore the current registration certifies only whole-model masks and
dimensions, with `componentMasks:false`; an independently audited source
partition is required before claiming component fidelity. The valid whole
view floor remains 92. No source faces are deleted to raise a score.

The new procedural hull and turret have separate station tables from
T-90A X, source-handed NSVT/cupolas, a tall rear whip, detailed Kontakt-5
cheeks and forward side ERA, and native six-station running gear. Source-fit
overall dimensions are not presented as independently published vehicle
dimensions. The comparison GLB and numerical receipt are reproduced by
`tools/t90x-source-oracle.py` only into ignored local storage.

The unchanged canonical source's filtered body extent measures 8.016 m long
and 2.881 m high in the shared 1024-pixel/P95 geometry pipeline. This is
distinct from its 6.86 m structural hull, 8.1115 m complete exterior hull,
2.2595 m main roof and 3.8069 m whip maximum. The comparison target is always
source-only, never the candidate's current envelope.

The first articulation audit found a genuine detached roof-gun receiver:
the generic fitting's body was forward of its support. Camera-matched CPU
rays identified that exact mesh at the 90-degree yaw pose. It was replaced
with an independently constructed NSVT and its measured support rails,
ammunition cases and cradle. Source barrel bounds are X -0.635…-0.590,
Y 2.703…2.748, Z 0.782…1.834 m. The thin whip is at X -0.2478,
Z -0.9447, with its base starting at Y 2.168 and tip at Y 3.8069.
The neighboring meteorological mast reaches Y 2.9901. These fittings are
source-measured solids, not copies of source buffers or a floater waiver.

Connected wheel islands independently establish the front idler at
(Z 3.31047, Y 0.87096), radius 0.23765 m, and the drive at
(Z −2.70245, Y 0.80394), radius 0.36432 m. Three return rollers per side
are at Z −1.55863, 0.39502 and 2.39302, Y 0.98969, radius 0.11452 m;
their principal axial casting is 0.1172 m wide. They now participate in the
one native track course. Source outer/full shoe-guide thicknesses are
0.0743/0.1974 m. Original fleet shoe, roller and road-wheel geometry remains
protected by immutable pre-override geometry and instance fingerprints.

## Seventh local proof and physical corrections

Source canvas-mantlet sections establish a rounded rear boot about 0.650 m
wide at Z 1.23, from Y 1.49 to 2.086 m, tapering to a circular 0.300 m
cuff at Z 1.713. Its front collar is not a triangular metal cone. The
glacis has shallow staggered fittings on a continuous plate; smaller tiles
are 0.3366 m wide and 0.2293 m long, at Z 2.634–2.864 and 2.941–3.170 m.
The source lower-front applique is authored separately.

The seventh local proof passes every valid fidelity view (96.00 aggregate),
primary geometry 93.7/92, dimensions 100 and official exact strict front,
rear and full-sweep band/shoe checks all zero. Independent shaded review
and final fleet anatomy/release checks subsequently passed.

## Gameplay binding follow-up

The unchanged upper-glacis, forward-skirt and cheek cassettes now use the six
inherited ERA depletion zones; lower bow applique and permanent supports stay
fixed. See [the exact-face binding audit](t90-x-era-binding.md). This later
semantic repair was included in fresh passing anatomy and shaded release evidence.

## Final independent front-guard finding

The 2026-09-06 07:23 UTC neutral comparison exposed a genuine remaining
medium-scale defect: the native forward mudguards were flat ramps, while
the source has a shallow upper cover, crowned nose and folded side returns.
Independent source rays confirmed up to 162 mm of missing crown height.
The V-only [front-guard correction packet](t90a_vladimir_x.front-guards.json)
records the fixed source frame, held-out measurements, closed fabrication,
small concealed joint inference and exact replacement-only preservation.
The new high/low tests verify actual crown normals, source air and positive
lap contact. Fresh parent-owned scoped proof on 2026-09-06 passes with raw
fidelity 96.74454320698266 and raw geometry/minimum whole view
94.40786589683208, plus the strict checks. The parent independently inspected
the updated 07:55 UTC neutral board and confirmed the guard crown is restored.
This supersedes the earlier scoped render evidence for the changed guard;
full final anatomy/assets/release regeneration subsequently passed separately,
not inferred from this scoped result.
