# Western X source inventory — 2026-09-05

Local authoring inputs only. No source topology, materials, textures, animation,
or source-derived runtime payload is imported by the playable builders. The
playable geometry is independently authored by Kevin B. Liu.

## Provenance decisions before geometry authoring

| Candidate | Owner input | Finding | Oracle decision |
| --- | --- | --- | --- |
| `merkava4_x` | `merkava-mk4.zip` | arlassar original artist model; live API describes the artist's first tank model, CC-BY 4.0. Nested Maya FBX and hand-named texture set match the existing verified record. | Accepted for local comparison only. |
| `merkava3d_x` | `merkava-mk3d.zip` | Jeyhun1985 upload explicitly describes “Merkava Mk.3D from War Thunder”; publication 2026-04-09 matches the nested archive timestamp and characteristic texture names. | Confirmed extraction; owner explicitly authorized local-only measurement/comparison for this supplied batch on 2026-09-05. No source payload ships. |
| `k2_x` | `k2_black_panther_armored_warfare.glb` | KojfDiscord, embedded CC-BY 4.0, title names Armored Warfare. Live API still has empty description and tags, so provenance remains inconclusive; no new confirmed-extraction evidence. | Existing owner adjudication in ATTRIBUTION.md permits local-only measurement/influence; never ship. |
| `kf51_x` | `kf51-panther-woodland.zip` | GRIP420 / David Falke original Maya model, CC-BY 4.0, exact 63,016-triangle match to existing verified source record. | Accepted for local comparison only. |

Primary source pages:

- [Merkava Mk4, arlassar](https://sketchfab.com/3d-models/merkava-mk4-5720c5369ea24c71af475aff769ffa8b)
- [Merkava Mk.3D, Jeyhun1985 (confirmed extraction)](https://sketchfab.com/3d-models/merkava-mk3d-1e61cd3b871646d59a8b9505e06e9d0f)
- [K2, KojfDiscord](https://sketchfab.com/3d-models/k2-black-panther-armored-warfare-af7a16423faa4530953fa801caace65a)
- [KF51 Panther Woodland, GRIP420](https://sketchfab.com/3d-models/kf51-panther-woodland-4764a740867c4ea697df8011e7d5bf63)

SHA-256 of the unchanged owner deliveries:

| Input | SHA-256 |
| --- | --- |
| `merkava-mk4.zip` | `2ca6d0ef5c096e5975b629dd8e429c88333f63390ab153da293215a10846b7b4` |
| `merkava-mk3d.zip` | `2e19b525ccd108cb9b3cdc73cc152188992532cb0ac95b43fbd3b06062dcdbd3` |
| `k2_black_panther_armored_warfare.glb` | `3e514bedb40be0fde6787dad6513f625ba077cd0c1da04d29defe94e9c156140` |
| `kf51-panther-woodland.zip` | `4ea24378f03f67b03ae68a86dd51dfece356e551fe71b96842bdb8adfb69bcec` |

API metadata was rechecked on 2026-09-05. Embedded license labels alone are
not treated as provenance proof. Mk3D was initially held before any vertex
inspection. After disclosure, the owner's direct instruction was “use those
files, it's actually okay because we don't use those files in actual game at
all.” This is a dated exception for local comparison of this supplied batch,
not a claim that the uploader owns the original game geometry and not a
general change to the project's provenance rule. The input in Downloads is
unchanged. No source vertices, indices, rig, textures or buffers ship.

## Raw geometry census (before canonical normalization)

Values below are source units, with Three.js's imported Y-up world transforms
applied. They are not silently substituted for published vehicle dimensions.

| Source | Triangles | Topology | World bounds min → max |
| --- | ---: | --- | --- |
| Mk4 | 224,715 | One fused mesh; about 1,968 position-connected islands; no authored runtime rig. | `(-2.9398,.0074,-5.5893)` → `(2.9748,6.4167,5.1213)` |
| Mk3D | 237,457 | 161 material-split meshes; nominal bone owners also contain internal body geometry and flat add-on armor. | `(-1.9882,-.02034,-4.20808)` → `(1.98815,5.13835,4.63017)` |
| K2 | 184,062 | 29 flat, material-split meshes `Object_2`…`Object_30`; mixed component ownership. | `(-1.8595,-.0045,-3.7949)` → `(1.8595,4.7308,7.0499)` |
| KF51 | 63,016 | Authored Body, Turret, Gun, MG, Wheels and Treads meshes. | Neutral-transform study: `(-34.4269,.1376,-18.0112)` → `(74.3365,58.0260,18.0112)` |

Mk4's existing license receipt records a uniformly normalized 4.88 m width
for 9.04 m overall length. That raw posed whole-object envelope is not a
valid chassis-width measurement: independent shaded inspection and face
normals reveal a **25° displayed turret yaw**. The structural hull is
9.875 source units long (`z=-5.460…4.415`), its skirt width is approximately
4.868 units, and its turret rear-face normal is `(-.423,0,-.906)`.
Neutralization rotates complete turret/equipment connected islands −25°
around `(0,0,-1.03)`, preserving both front hull-marker whips. The original
chain curtain has separate rings, ball weights and tiny connecting links;
each complete connected island follows the same rigid yaw transform.
No pointwise warping, cropped geometry or axis-specific scaling is used.
The hull is then centered at `z=-.5225`, grounded at `y=.0073919296`, and
uniformly scaled by `7.60/9.875`. This yields a full width of **3.77689 m**,
including slightly asymmetric equipment. Thus the prior broad-width
warning was predominantly a pose problem, not confirmed stretched geometry.
The [AUSA published vehicle comparison](https://www.ausa.org/sites/default/files/publications/LWP_109_Role_of_the_Tank_in_Modern_Warfare.pdf)
lists approximately 3.72 m, a remaining 1.5% equipment-envelope difference
that is recorded openly rather than erased with a width-only stretch.

KF51's body is 77.9067 units long and 36.0224 units wide. Normalizing the
body to 7.70 m uses one uniform factor `7.70 / 77.9067192`; the resulting
width is 3.560 m. The FBX has a −45° displayed turret yaw and −5° gun
rotation with Maya pivots. Neutralization must be verified against the
actual tube axis, not implemented by discarding all transforms blindly.

K2 is already close to metres and faces +Z. The flat mesh names do not
justify semantic component masks: `Object_19` mixes barrel and suspension,
and `Object_22` mixes turret and hull-skirt equipment. Whole-vehicle and
track evidence remain mandatory even where an honest part mask is absent.

Raw connected-island inventories and untextured study GLBs are external
scratch artifacts at `/private/tmp/cot-x-west-sources.7qb5zf/`; no source
geometry is added to the repository.

## Canonical datums and runtime reconstruction

All canonical oracles are ignored local files under
`public/models/community-candidates/<candidate>_source.glb`. The runtime
profiles import only primitive construction helpers and native running gear;
there is no source loader, buffer, mesh, texture or inherited family builder.

| Candidate | Hull / overall length | Full width | Structural roof / highest fitting | Yaw pivot | Trunnion | Muzzle Z |
| --- | --- | --- | --- | --- | --- | --- |
| `merkava4_x` | 7.600 / 8.70504 | 3.77689 | 2.401 broad roof; 2.565 raised armor / 4.93273 | `(0,1.605,-.3906)` | `(0,1.99346,1.930)` | 4.80553 |
| `merkava3d_x` | 7.9645 / 8.83824 | 3.97635 | ~2.59 / 5.15869 | `(0,1.68034,-.72418)` | `(0,2.0898,1.4258)` | 4.85599 |
| `k2_x` | 7.8535 / 10.84482 | 3.71906 | 2.369 / 4.73527 | `(0,1.5945,.21815)` | `(0,1.99253,1.36815)` | 6.91807 |
| `kf51_x` | 7.700 / 10.74975 | 3.56031 | 2.5603 / 5.72147 | `(0,1.4596,.5185)` | `(0,1.85491,1.3478)` | 6.89975 |

Mk4's integrated cupola rises to 2.702 m, its panoramic sight to 2.833 m,
and its roof weapon to approximately 3.003 m; the 4.93 m maximum is an
antenna, not hull/turret armor. The raised asymmetrical armor roof must not
be confused with the broad 2.401 m rear roof.

The source-only 1536-pixel silhouette extraction uses the gate's 12%-vertical-span
band filter and 95th-percentile top envelope. Its broad `bodyExtent` heights
are **2.997 m K2, 3.093 m KF51, 2.996 m Mk4, and 3.016 m Mk3D**. These
include substantial roof fittings but reject isolated antenna tips. They
are neither structural armor heights nor candidate-derived measurements.
The extraction uses the current canonical loader's width-only normalization;
the older extractor's independent height clamp would shrink KF51 by 4% and
must not be applied a second time. GPU raster rounding can vary a few mm.

Subsequent actual 1024-pixel gate measurement exposed an important exception
to that last rounding expectation: Mk4's four narrow whips occupy enough
coarse columns to enter P95, giving source **4.655 m** (and the same value
for the candidate). Its fixed-gate silhouette datum is therefore 4.655 m,
while the 1536-pixel source-only result stays recorded as 2.996 m. Neither
the source nor the whips are altered to conceal that resolution dependence.

K2 also has three different longitudinal measurements: the 407-vertex main
`Object_29` hull island is 7.3418 m (raw Z −3.5918…3.7500); exterior hull
equipment is 7.8535 m (front guard islands reach +4.0586; aft fittings
reach −3.7949); the fixed 1024-pixel source `bodyExtent` is 7.566 m.
These labels must not be substituted for each other or candidate-derived.

Measurement correction history is explicit: KF51's provisional 2.0251 m
datum was the muzzle-reference optical device, not the bore. Its actual
terminal tube bounds are `y=1.765712…1.944111`, giving the true axis
**1.85491175 m** and radius .0892 m. K2's terminal tube similarly corrects
the provisional 2.0045 m datum to 1.99253 m, and Mk4 corrects 2.014 m to
1.99346 m. These corrections preserve every source world-space vertex;
they change only the declared pivot and independently authored runtime.

Canonical coordinate operations:

- Mk3D: no scaling/rotation; add `(0,.02034,.2258175)`.
- K2: no scaling/rotation; add `(0,.0045,-.13185)`.
- KF51: neutralize the displayed turret/gun local transforms, rotate Y −90°,
  subtract `(0,.1375615597,4.5264759064)`, uniformly scale by
  `7.70/77.9067192078`, then publish pivots without moving any world vertices.
- Mk4: the rigid, whole-island pose/scale procedure documented above.

Reproduce the ignored local oracles with
`node tools/west-x-source-oracle.mjs <mk4|mk3d|k2|kf51> <unpacked-input>`.
Accepted inputs are the nested FBX/OBJ or supplied K2 GLB, not an archive.
The tool writes the position-only neutral study and full connected-island
inventory to a new external temporary directory, and refuses to write the
canonical GLB unless Git confirms the comparison-candidate ignore rule.

`tools/west-x-reference-overrides.ts` registers the unchanged 92-point
exemplar quality bar. K2/Mk3D/Mk4 have honest whole-vehicle comparisons
because their source ownership cannot support disjoint component masks.
KF51 retains authored Body, Turret, Gun, MG, Wheels and Treads semantics.
The common reference loader normalizes to the spec's full width, so those
widths must match this table; applying another scale/axis rotation would be
a double-normalization bug, not an improvement to the reconstruction.

Native track courses preserve measured wheel/end station locations and road
wheel radii. Source static treads sometimes penetrate their displayed drive
wheel teeth. Native animated shoe pads need their real nonzero wrap allowance;
the reconstruction does not copy those source intersections. Hidden forward
shoulder undersides are kept thin, the Mk4 central tub narrows beneath its
separate full-width bow guards, and K2/Mk3D rear flaps use measured aft
stations (KF51's aft hanger is corroborated against its source side view).
Native shoe depth initially put the bottom .050–.054 m below the canonical
ground. The bottom course, not the wheel/end stations, was corrected using
the factory's actual pad-reach formula: K2 .095, KF51 .097, Mk3D .0976,
Mk4 .0956 m. Every resulting physical `contactGeom.bottomYM` is zero.
No shoe/band classifier, global pattern, clip tolerance or gate threshold is
changed by these profiles. Strict exact front/rear/full-sweep band and shoe
checks reached zero for all four during CPU preflight on 2026-09-05.

`src/vehicles/profiles/westXGeometry.selftest.mjs` checks generated bounds,
actual roof/keel rays, native road-wheel instance stations, one native shoe
course, physical muzzle extents and articulation in both detail levels.
It specifically catches the mistaken three-argument primitive cylinder call
that made a segment count become a many-metre height in the initial pass.
These CPU checks are prerequisites, not claims of visual acceptance: every
registered view still needs its independent 92-point and shaded inspection.

### Physical-contour review, 2026-09-05

The neutral-clay review exposed details that the whole silhouettes did not:
KF51's open RWS yoke, Mk4's raised thermal-sleeve clamps, and K2's lamp/towing
assemblies and three-bay rear radiator. These are now independently authored
physical fittings. K2 passed the 92-point source and geometry gates in the
fifth scoped run; the other candidates were still failing and are not signed
off by that result. All four returned zero continuity holes. Three official
track navigations timed out during host contention; only Mk4 produced a
fresh strict zero receipt in that run, so those timeouts are not passes.

KF51's later correction uses measured lower-body stations: at X .4, Z −3.8
the roof/underside are 1.80405/1.48806 m; at Z −3.7 they are
1.86889/1.14991 m. Its floor reaches .4699 m at Z −2.973, not Z −3.51.
The flank is a lower outer belt, sloped upper plane and raised rear hem;
the former flat boxes incorrectly occupied the rear wrap zone. The two
whips have vertical necks to Y 3.00752, then aft-leaning upper rods ending
at Y 5.72147, Z about −2.3833. No whip is shortened for a raster score.

The upper rods were subsequently checked at intermediate heights: they are
gently bowed and tapered, not straight cones. A first-party analytic tube
uses its own radial/longitudinal tessellation, with the source mid-height
front surface at Y 3.7515 / Z −2.14058 and Y 4.4935 / Z −2.1974 covered
by physical ray tests. The RWS outboard trunnion cover, wider panoramic
hood and extended cannon-jacket shoulders likewise came from separate
source surface measurements, not aggregate-score fitting. The muzzle
reference sight and barrel-mounted clamps are recoil-owned.

Mk3D's yaw-dependent detached region was projected back to the right MAG,
not its antenna. The source has a roof foot at raw X .8983..1.1791,
Y 2.4294..2.5483, Z −1.2651..−1.1516, a vertical neck and a forward
cantilever ending near Z −.6931. Those independently authored supports
now carry the receiver without lowering its firing axis. Its exterior
length is formed by separate rear-container caps (raw Z −4.188) and open
front towing eyes (raw Z 3.7564), not a stretched armored hull.

Neutral-shaded review rejects a generic smooth turret even when its broad
outline overlaps. Subsequent source-plane work therefore rebuilt K2 as a
central shell with separate vertical flank cassettes, stepped mantlet and
open rear carrier; KF51 as a gun well between independent pointed cheeks;
Mk3D with a low left-forward shoulder and high right cheek; and Mk4 with
its asymmetric raised roof and distinct sloping cheek tiles. Source baskets
retain their open braces, actual sheet floors and individually stored parts.
These remain under visual iteration; this packet is not a release approval.

The frozen western authoring set now has passing scoped receipts. On
2026-09-05 23:17 UTC, K2/Mk3D/Mk4 whole-view minima were 92.60/92.98/92.43;
their geometry minima were 92.6/93.0/92.4. KF51's subsequent asymmetric
sight-hood and L-shaped vision-bank correction passed on 2026-09-06
00:19 UTC: whole minimum 97.00, direct turret side minima 92.86/92.95,
geometry minimum 93.6 and stations 100. All four official standard runs
measured zero front/rear/full-sweep band and shoe intersections, zero
continuity holes, and real MG counts K2=1, KF51=1, Mk3D=3, Mk4=2.
Per-ID `*.fidelity.json` files preserve the exact rows. The packets record
fresh neutral-shaded review and visible residual simplifications separately
from the registered numerical gates. Final whole-fleet anatomy/release
validation remains the parent task's responsibility.

Per-ID human-readable packets and machine-readable, payload-free source
receipts are under `docs/references/tanks/{k2_x,kf51_x,merkava3d_x,merkava4_x}`.
The changed-scope improve-threejs scan on 2026-09-05 reports 84/100 with
zero diagnostics across 20 tracked changed files. Untracked new profile
files were also inspected manually for factory-owned merged geometry,
resource disposal, LOD and absence of per-frame allocation; the scan alone
is not evidence of new-profile visual correctness.

## Pre-change static scan

The improve-threejs read-only scan reports 49/100, 232 existing issues
(5 errors, 227 warnings). None arises from these not-yet-authored builders.
This task does not change global frame loops or unrelated pre-existing
scanner findings. New profiles must retain factory-owned merge, LOD,
equipment ownership, native running gear and disposal contracts.
