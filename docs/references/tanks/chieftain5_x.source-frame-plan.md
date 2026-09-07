# Chieftain Mk5 X — supplied-file frame and ownership proposal

2026-09-06, quiet-window metadata inspection. **Provisional proposal only:** no
runtime edits, geometry conversion, canonical-source export, registration,
browser or GPU work. The previous primary-photo build is superseded as the
target by the explicit owner-directed supplied-file rebuild. Mk10's remaining
hull/whole geometry failures are a separate queued task.

## File and provenance

Source: `/Users/kevinliu/Downloads/Claude of Tanks Models/chieftain_mk-5_main_battle_tank.glb`.
The unchanged 6,531,532-byte GLB has SHA-256
`a7cb7c9ab877635d204f96f359e84f2da8b59298bf09f2eeaeeecd4205725169`.
It declares glTF 2.0, generator `Sketchfab-16.59.0`, author Muhamad Mirza
Arrafi and CC-BY-4.0. Those embedded claims do not establish upstream rights.
The earlier [inventory](../../research/second-wave-west-inventory.md) records
the live source page's `createdwithai` tag. Owner-directed likeness to this
file is not a claim that its proportions, anatomy or apertures are historically
accurate. Existing local-only source-media restrictions remain unchanged.

There are eleven triangle primitives, 59,680 POSITION vertices and 55,147
triangles; ten materials and nine embedded PNGs. No skins, animations or
external image URI appear in the supplied JSON. Every material is double-sided;
only `Track_494` declares `alphaMode: MASK`. `Glass_996` is opaque in metadata.
Consequently material names and dark/transparent-looking textures cannot certify
a physical hole, solid thickness or separate articulation owner.

## Initial uniform frame proposal — historical quiet-window checkpoint

The actual scene root is a proper half-turn about X: diagonal `[1, -1, -1]`
(determinant +1; export noise below 5e-16). The eleven leaves otherwise have
identity transforms. Bake that existing matrix first; the resulting source
already has +Y up and +Z gun-forward. No reflection, component stretch or
source-part repair is proposed.

Use the independently documented Army Mk5 width, 3.51 m, as **one uniform
presentation ruler**, anchored to the complete source's 154.17323303222656-unit
width. This scale does not assert that every resulting source dimension agrees
with the real vehicle:

```text
uniform scale = 3.51 / 154.17323303222656
              = 0.022766597878026665
post-scene axes = [x, y, z]
provisional source center/ground = [-4.586616516113281,
                                    0.11811023950576782,
                                  -71.63385772705078]
provisional post-scale translation = [0.10442165384306669,
                                     -0.0026889683281052347,
                                      1.6308592333235383]
```

X/Z centering currently uses the `Hull_361` material batch's midpoint; Y uses
the actual `Track_494` accessor minimum, not a guessed belly or the candidate.
Before freezing the recipe, source-only connected-component and ground-course
inspection must verify that the hull batch's extremities are the intended
structural datum and that its minimum track point belongs to the contact course.
The hull and track X midpoints independently agree at −4.5866165161 raw units.
No existing photo-draft coordinate participates in this proposal.

The proposed ruler gives these **source-export envelopes**, not automatically
structural or historical dimensions:

| Quantity | Proposed canonical metres | Meaning/limit |
|---|---:|---|
| Complete width | 3.510000 | Chosen uniform ruler; equipment creates asymmetric limits about the hull center. |
| Hull material Z span | 7.209124 | 3.62% shorter than the Army table's 7.48 m; do not stretch this independently. |
| Complete gun-forward Z span | 10.470842 | Includes the supplied gun and hull batch. |
| Turret material upper Y | 2.745436 | Includes roof furniture; not yet an armor-roof datum. |
| Highest fitting Y | 3.809372 | Sparse `Gear_921` geometry; not a turret-height substitute. |
| Track upper Y | 1.199280 | Track-material envelope only; alpha masking requires inspection. |
| Track ground Y | 0 | Provisional contact-course anchor. |

The source has no source-authored meter-unit declaration or usable pivot nodes.
An inch-like decimal grid alone is insufficient reason to silently select
0.0254. A different physical ruler, if selected by the parent, must likewise be
one recorded uniform scale, never independent length/height normalization.

## Actual batch ownership

Names below are **node names**, not the different mesh names `Object_0..10`.
Their bounds already include the actual scene root matrix.

| Node | Material | Triangles | Initial ownership treatment |
|---|---|---:|---|
| `Object_2` | `Turret_995` | 11,911 | Complete turret-colored batch; investigate fixed versus moving followers before registration. |
| `Object_3` | `SideSkirts_361` | 280 | Hull skirt batch. Preserve its real seams and underside contour. |
| `Object_4` | `Hull_361` | 17,318 | Hull-colored batch, including furniture; connected primary tub must be isolated for datums only. |
| `Object_5` | `Cannon_128` | 2,080 | Main cannon-colored batch; actual bore axis and stock/mantlet split require measurement. |
| `Object_6` | `Applique_155` | 5,206 | Mixed hull/turret-height attachments; no blanket hull or turret assignment. |
| `Object_7` | `Gear_938` | 2,224 | Rear equipment spans Y 57.598..101.575 raw units; mixed-owner audit required. |
| `Object_8` | `Glass_996` | 282 | Widely separated hull and turret glass; opaque metadata, not through-air. |
| `Object_9` | `Gear_921` | 150 | Tall sparse equipment; do not collapse, clamp or discard it for height. |
| `Object_10` | `Track_494` | 1,968 | Both alpha-masked track courses. |
| `Object_11` | `Wheels_310` | 9,270 | Merged wheels/end fittings; no separate axle nodes. |
| `Object_12` | `Wheels_310` | 4,458 | Second wheel-material batch; not evidence of a second complete wheel set. |

No complete turret/gun semantic masks are proposed until the mixed batches
have defensible complete-piece ownership. Fused or mixed ownership may require
component N/A while retaining every source-visible mesh in whole comparisons;
it must not hide difficult fixtures or enlarge the score through selective
omission. Native hull, turret, gun/recoil and gear ownership will be explicitly
authored from physical components, not inherited from the flat source tree.

## Source defects and pending checks

- No functional rig: all leaf origins coincide. Measure the yaw bearing,
  trunnion/straight stock, muzzle and each road/end/return axle independently.
- Material batching mixes fittings and owners. Connected islands are a study
  instrument, not permission to copy their topology into the runtime.
- Double-sided faces may hide missing back walls; alpha-masked tracks may hide
  non-physical slots. Inspect whole-source front/back rays before claiming air.
- The source's width/length proportion disagrees with the Army table after a
  uniform width anchor. Record that difference; do not repair the source or
  historical datum to fit the current draft.
- Real candidate mechanical conflicts, if revealed later, require bounded
  source-to-native construction explanations and strict checks, not a waiver
  or hidden source-only clipping rule.

Priority negative-space studies: gun bore and mantlet sleeve; gunner sight
hood/backing; cupola/MG support openings; under-sponson and front-guard daylight;
skirt seams; wheel dishes and inter-wheel air. Their existence and dimensions
are **not certified by this metadata-only note**.

## Next permitted source-only measurements

After the parent releases the quiet window:

```sh
node tools/glb-island-probe.mjs '/Users/kevinliu/Downloads/Claude of Tanks Models/chieftain_mk-5_main_battle_tank.glb' --min-tris 80 --weld 0.000001
```

Use the existing ignored `.qa-dev/second-wave-west/source-study.mjs` loader for
source-only world triangles, then bounded primary-tub/track-ground bounds,
bearing and stock circular sections, axle census and held-out first/back/air
rays. Keep outputs in ignored research storage; commit only scalar evidence,
original parametric construction and focused tests. Parent owns shared registry
and oracle generation. Source arrays never become runtime imports or copied
surface meshes. The previous Mk5 draft remains unchanged until this plan is
approved and measurements establish the new datums.

## Source-cut refinement — 2026-09-06

The bounded CPU inspection confirms that the source track minimum belongs to
the real lower contact course. Its forward contact stations reach Y = 0 while
the aft course is about 1 mm higher; the ground anchor is not an isolated
decorative point. The complete source remains unchanged.

The hull-material midpoint above includes connected fenders and separate flaps.
The main `Object_4` component (study island 1398) instead gives these exact
**centerline armor endpoints** after the initial transform:

```text
rear lower armor: Z = -3.2334844600058767
front nose armor: Z = +3.3419393200465130
centerline armor span = 6.575423780052390 m
midpoint = +0.054227430020318046 m
```

The two witnesses lie on physical stern and nose armor planes near X = 0,
not on a silhouette-fitted center. Connected lateral fenders extend farther:
their component bounds must not be mistaken for this centerline datum. This
choice does not discard any source surface and does not redefine the complete
exterior length. The unchanged fenders, flaps, wheels and fittings remain in
all whole-source comparisons.

Refined frame approved by the parent before oracle generation:

```text
uniform scale = 0.022766597878026665              # unchanged
post-scene axes = [x, y, z]                      # unchanged
source center/ground = [-4.586616516113281,
                        0.11811023950576782,
                      -69.25197219848633]
post-scale translation = [0.10442165384306669,
                         -0.0026889683281052347,
                          1.5766318033032203]
```

Only the rigid Z registration changes, by −54.227430 mm. All source-export
dimensions in the earlier table retain their values. In particular, the
7.209124 m hull-material envelope and the 6.575424 m centerline armor span
are different datums, neither a reason to stretch the supplied model to the
7.48 m historical table value.

Further source-cut findings, stated in the **initial frame** so earlier
measurements remain reproducible:

- The main turret casting is `Object_2` island 258. Its actual armor roof
  reaches Y = 2.315202 m; the material-batch maximum of 2.745436 m is equipment.
- The bearing is `Object_2` island 39, X = −0.991781..0.998055,
  Y = 1.414397..1.537194, Z = −0.566924..1.414845 m. Circular section fits at
  Y = 1.425/1.480/1.525 give X centers 0.006865/0.003101/−0.000054 m and
  Z centers 0.423149/0.423509/0.423779 m. This is a slightly warped and tilted
  unrigged source bearing. A functional native yaw axis must be labeled an
  inference, not falsely presented as an exact source node.
- The near-muzzle section at Z = 6.85 has X = −0.109839..0.093705 and
  Y = 1.757689..1.961193 m. Its center is approximately
  X = −0.008067, Y = 1.859441 m. Mid-barrel sections vary by several millimetres;
  a single straight native axis is another explicitly bounded construction
  inference. The original frontmost cannon point is Z = 6.866281 m.
- Whole-source forward rays at X = −0.008, Y = 1.86 reach the actual recessed
  cannon interior near Z = 6.303575, not a solid muzzle cap. This is real
  negative space, but the warped source floor is not a historically calibrated
  120 mm bore.
- Six road wheels per side are physical islands, not inferred from texture.
  Their provisional Z centers are approximately −2.175824, −1.284879,
  −0.366148, 0.524797, 1.545709 and 2.436654 m; their source Y envelope is
  approximately 0.052..0.84344 m. Separate rear sprockets, front idlers and
  three return rollers per side are also present. Native wheels must be
  reconstructed from their radial surfaces rather than preserving the
  superseded photo-draft axle table.

Mixed `Applique_155`, `Gear_938` and `Glass_996` batches still prevent a truthful
complete-node component split. Whole-only comparison is proposed, with every
one of the eleven source meshes included. No source arrays or runtime geometry
were written during this measurement checkpoint.

The approved recipe is now [chieftain5_x.json](../../research/second-wave-registrations/chieftain5_x.json).
`tools/source-x-oracle.mjs` prepared the ignored, reference-only canonical GLB
with SHA-256 `2a781a798e4ffe8f99ab9f6750b8db8e132b236de51a021cac28cbb82f268e79`.
Its report confirms eleven retained meshes and zero omitted meshes. Complete
canonical bounds are X = −1.6505783796..1.8594216108,
Y = 0..3.8093717098 and Z = −3.6587893963..6.8120532036 m.
The asymmetric maximum X is actual supplied equipment, not permission to
recenter the tank or widen its structural body. The oracle and report are
Git-ignored; no supplied geometry or media is a public playable dependency.
