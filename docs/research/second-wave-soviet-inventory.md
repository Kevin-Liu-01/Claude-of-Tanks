# Second-wave Soviet source inventory — 2026-09-06

Initial CPU-only inventory snapshot of the nine owner-supplied inputs under
`/Users/kevinliu/Downloads/Claude of Tanks Models/`. No source oracle, runtime
geometry, texture, or rig has been copied into this worktree. No browser or GPU
was used. Local scalar output is ignored at
`.qa-dev/reports/second-wave-soviet-inventory.json`; its bounded CPU probe is
`.qa-dev/second-wave-soviet-inventory.mjs`.

Subsequent status: the first three recipes were independently approved and the
parent generated local-only comparison oracles. Independent first-party builders
and exact high/low source tests now exist for `t62mv1_x`, `t72b_1987_x` and
`t80u_x`; see their source-measurement packets. The inventory-time proposal
language below is historical, not the current registration status. Their latest
CPU changes await fresh complete visual/geometry/release qualification; no
passing whole-silhouette aggregate is presented as full qualification.

The probe reads archived FBX/OBJ members in memory, disables FBX texture loading,
and reads GLB position/index accessors without loading its images. It records
world-transformed bounds, original object names, hierarchy, triangle counts,
position-connected island counts, and scalar end-on rays. It never executes
instructions from asset metadata or exports source topology. Island detection
welds positions to 1e-6 **source units**, not a claim of physical tolerances.

## File identity

Paths below are relative to the supplied folder. SHA-256 identifies exact bytes;
it does not establish authorship, license validity, or redistribution rights.

| Proposed new ID | Supplied archive/GLB | SHA-256 |
|---|---|---|
| `t62mv1_x` | `t-62mv-1-ussr/source/t-62mv-1.zip` | `a4dc7cc82a6a8088c06ddc538d5311f7e63f41a7604b9fbff1040cbab69a143f` |
| `t72b_1987_x` | `t-72b-obr-1987-ussr/source/t-72b_obr-1987.zip` | `de96f935e8920bc8e6f712c105a2c0b0508cc30fe6ca66df9880fdbc5ffba593` |
| `t72b3_x` | `t-72b3.zip` | `19b196bdc9825dc721dd20191e5e98146ab5c32202c50c213b079a6c523d2d8e` |
| `t72b3m_x` | `t-72b3m_obr._2022.glb` | `6ee260f31911b1c60feab24999dfa30467cc1b5c8c5ff6ecf787ddd590e9f350` |
| `t72bu_x` | `t-72bu-ussr/source/t-72bu.zip` | `11c0f63b8434c9f44c1a04194ab29a3a7e1ee2e3f02693157c6a0da7ce48cc21` |
| `t80u_x` | `t-80u-ussr/source/t-80u.zip` | `037e55a1a78909cfc0d37861b262deea4fcca8ae27060947770bd3e7d5a7788f` |
| `t90_x` | `t-90-armored-warfare/source/T-90.zip` | `379bda4e056be4e2d152123f6b62085f2f2c8ed94382799755a024aeabadc44c` |
| `t90a_burlak_x` | `t-90a_burlak_armored_warfare.glb` | `812000466f783234effb41b54d32925bf071a3bf117c2b0780a26d6a40bd8f90` |
| `t90ms_x` | `t-90ms-tagil-armored-warfare/source/T-90MS_Tagil.zip` | `a13b3bb56d3f62edc564b85233a34ed54f7799adfb63d7101013a5aefca32530` |

The four small USSR archives each contain one FBX and two PNG atlases. T-72B3
contains `source/t72b3.zip`, which in turn contains `t72b3.fbx` and fifteen BMP
textures; the outer package also has PNG texture copies. The two Armored Warfare
archives contain one OBJ/MTL pair and many hashed diffuse/normal/AO atlases.

Actual geometry-member hashes:

| Member | SHA-256 |
|---|---|
| `t-62mv-1.fbx` | `3cad400728a45be77946b876f6ff7feb84487509795e6f82412e3f8c3a60f94b` |
| `t-72b_obr-1987.fbx` | `97e5cab758f070ca516dc865f46c09ff259ed562bb311add5da897892c89d743` |
| `source/t72b3.zip!t72b3.fbx` | `9da4a363d5a2a86d763b66ebc23cfabda06fdd2d2e3d4527688389c82f2488ed` |
| `t-72bu.fbx` | `3bb7bb20841ada6d5fa84a446e1229c78dde46dc0aea9216adc6bc2d9c170898` |
| `t-80u.fbx` | `64c5fec7d47a591f4a1fccc4f7273a8b2ddb9b8aa8748f8a8a45ba3c108aa888` |
| `T-90.obj` | `fd7d8552bcb9d4b416ca2e101f6061e1a3b50a9e96e768db85a8a2e1e7daa4a9` |
| `T-90MS_Tagil.obj` | `a7da9111b862fa083c6bace1525ee8fd48efa92398883a08ae01d93b232589d4` |

## Provenance and existing authorization

- The supplied T-90/Burlak/Tagil inputs belong to the **KojfDiscord Armored
  Warfare series** already addressed in [ATTRIBUTION](../ATTRIBUTION.md),
  section “KojfDiscord (Armored Warfare) series,” 2026-08-08. That standing owner
  ruling permits **local-only measurement/influence**, never shipment. The game
  title and game-style material names are extraction warnings, not sufficient
  evidence to replace the documented **provenance-inconclusive** classification
  with “confirmed extraction.” The historical OBJ re-bakes are not byte-identical
  archives by definition; that section does not publish original T-90/Tagil/Burlak
  SHA-256 receipts, so this inventory does not claim a historical hash match.
- Burlak GLB embeds author `KojfDiscord`, title `T-90A Burlak (Armored Warfare)`,
  uploader `CC-BY-4.0`, and source
  `https://sketchfab.com/3d-models/t-90a-burlak-armored-warfare-92f0e101ed0f46168b245436dfe753e0`.
  Generator is `Sketchfab-16.56.0`; it has 34 embedded images, no skins or animation.
- T-72B3M GLB embeds author `42manako`, title `T-72B3M Obr. 2022`, uploader
  `CC-BY-4.0`, and source
  `https://sketchfab.com/3d-models/t-72b3m-obr-2022-b821cd7b4cf9482598e1d603790f9293`.
  Generator is `Sketchfab-16.65.0`; seven images, no skins or animation.
  Existing [T-72B3 packet](../references/tanks/t72b3.md) identifies this same source
  URL/model and its later promotion to the old `t72b3m` oracle. That is historical
  source identity, not a fresh live-page or exact-file hash verification.
- Four USSR FBXs contain `Blender (stable FBX IO) - 5.1.0 - 5.15.0` and
  `Blender Foundation` exporter metadata. **Exporter author is not model author.**
  No model creator/license/source URL was found in those packages. The historical
  direct-recovered-archives attribution covers T-62MV1, T-72B1987 and T-72BU as
  local-only, insufficiently licensed inputs. Do not upgrade their provenance.
- T-72B3's semantic names, interchangeable `gear1-option*` parts, and crew/weapon
  attachment markers indicate a game/mod-style source workflow; they do not,
  alone, identify an original author or prove commercial-game extraction.
  Original author/license investigation remains unresolved.
- The supplied T-80U **is not** the separately attributed javanilga 28,141-triangle
  source used by the previous playable. It has only 6,764 triangles. Do not carry
  javanilga's credit/license or prior normalized datums onto this different input.

No live website was accessed during this bounded CPU inventory. All inputs
remain local-only. No supplied vertices, indices, textures, rigs, animations,
or source-derived baked runtime arrays may ship.

## Raw world-space census

These are **unmodified source measurements**, not proposed gameplay dimensions.
X/Y/Z sizes include exterior drums, lamps, antennae and gun. FBX figures are
arbitrary exporter units until independently calibrated; GLB/OBJ rows are in
their source's apparent metre-scale coordinates. “Forward” is inferred from
the end-on cannon geometry, not a filename.

| Source | Meshes / triangles | Raw X × Y × Z extent | Up / forward | Segmentation verdict |
|---|---:|---|---|---|
| T-62MV1 | 2 / 5,948 | 12260.414 × 3554.512 × 4254.049 | +Y / +X | Fused body/turret/gun `mesh_326`; separate four-island track `mesh_327` |
| T-72B1987 | 2 / 8,665 | 10989.792 × 3262.764 × 4066.086 | +Y / +X | Fused body/turret/gun `mesh_315`; four-island track `mesh_316` |
| T-72B3 | 156 / 18,281 | 967.080 × 545.700 × 376.560 | +Y / +X | Real ownership tree; duplicate options and pivots require audit |
| T-72B3M 2022 | 15 / 130,716 | 3.951016 × 3.761047 × 10.267539 | +Y / −Z | Material meshes mix owners; no honest whole turret/gun split yet |
| T-72BU | 2 / 6,420 | 22792.821 × 7483.773 × 7907.655 | +Y / +X | Fused body/turret/gun `mesh_324`; track `mesh_325` |
| T-80U | 2 / 6,764 | 11554.380 × 3025.578 × 4362.758 | +Y / +X | Fused body/turret/gun `mesh_324`; track `mesh_325` |
| T-90 AW | 65 / 78,003 | 3.815880 × 4.471150 × 10.173270 | +Y / +Z | Many semantic object owners; flat OBJ, no actual source rig |
| Burlak | 24 / 93,560 | 4.070300 × 4.627690 × 10.063050 | +Y / +Z | Anonymous material partitions mix owners; cannon identifiable |
| Tagil | 75 / 83,046 | 3.780200 × 4.747100 × 10.096710 | +Y / +Z | Many semantic object owners; flat OBJ, no actual source rig |

The four small FBX body and track nodes have the same negative-determinant
transform per file: magnitude 5.65381145 (T-62), 5.15171623 (T-72B1987),
10.33886719 (T-72BU), 5.38611984 (T-80U). Bake the actual matrix and correct
mirrored winding exactly once before any local normalization. Do not interpret
these numbers as metre scale, apply a blind centimetre conversion, or reuse a
previous modified/repartitioned oracle. A proper +X-forward→+Z-forward rotation
is `x' = -z, y' = y, z' = x`; ground and hull-centering translation follow.

### Important object/rig findings

- T-72B3 has `hull → turret → mount → weapon → barrel`, plus distinct wheels,
  skirts, ERA, `sosna-u`, hatches, interiors and smoke emitters. The FBX root has
  a 100 scale, so 0.01 converts its apparent centimetres to metre-scale geometry.
  This is a proposed unit interpretation, not a certified dimension fit.
  Main mesh origins (`hull`, `turret`, `mount`, `weapon`) all report world zero;
  their names/hierarchy must **not** be advertised as valid yaw/pitch pivots.
  Muzzle/crew emitters have nonzero author markers and can help independently
  locate datums. `gear1-optiona/b/f` occupy identical bounds; c/d are partial
  alternatives. Select the intended physical configuration before creating an
  oracle, with an explicit exclusion receipt. Do not render every option at once.
- T-72B3M `Object_14` spans Z −5.353…2.314: it contains gun-run cladding as well
  as turret geometry. `Object_15` is the main tube but cannot alone define a
  complete gun mask. `Object_3` is the tall roof cluster. Raw ground is Y −0.815740
  and nose is −Z; a ground translation and 180° yaw are required. Preserve the
  real roof cluster; the old packet's historical height clamps are not new
  source-normalization instructions.
- T-90 AW separates `cannonbase_t-90_2a46m5_skinned_5_0` from
  `t-90_cannon_2a46m2_21_0`, tread sides, turret, ERA and lamps. OBJ names containing
  `skinned` do **not** make them skinned meshes: there are no bones/animations or
  nonzero object pivots. Manually measured ring/trunnion datums are still required.
- Burlak `Object_15` is the 4.6525 m cannon run, `Object_11` the 2.291 m antenna;
  `Object_18` spans hull-height and turret-height equipment and is not one owner.
  `Object_20` combines a long turret/side assembly. It must not be classified by
  a simplistic Y threshold. Both tread sides are individually recognizable as
  `Object_5` and `Object_13`, but the wheel/gear material groups overlap in area.
- Tagil has explicit cannon, mantlet, turret cage, hull cage, detachable-case,
  ERA and tread labels. Preserve the cage's standoff air; it is not armor fill.
  Its two cannon primitives overlap in axial range but represent exterior plus
  inner bore surfaces, not automatically duplicate geometry to delete.

## Negative-space evidence and pending held-outs

End-on rays at the scalar ring centers confirm actual open muzzle mouths in the
four small FBXs and T-72B3. In unscaled source units, the first center hit lies
behind the end plane by 336.914 (T-62), 187.897 (T-72B1987), 233.027 (T-72BU),
199.789 (T-80U), and 128.957 (T-72B3). These measurements are aperture witnesses,
not shell-caliber claims. Exact physical ray/normal assertions must be repeated
after the approved source transform.

At apparent metre scale, the T-90 AW center is `(0.000160,1.726340,5.993570)`
and the Burlak center `(0.002360,1.784450,5.883350)`; both see the first source
surface **0.406300 m** behind the muzzle. Tagil's center is
`(-0.000690,1.814310,5.956110)` with an inner first hit **1.302800 m** behind its
end plane. All three exterior end rings are approximately 0.1834 m in diameter.
Do not cap these openings with a solid disk. This inventory's automatic extreme
slice is degenerate for the tilted T-72B3M mouth; no bore claim is made there.

Other physically named targets for the next scalar studies are the T-72B3
Sosna-U/driver sight reveals, mount/weapon throat and hatch rims; Tagil rear
basket/hull-cage standoff pockets and sight/RWS apertures; the Burlak bustle and
roof sight spaces; and the first trio's turret throat, ERA inter-row gaps,
wheel/return-course air and rear drum-support spaces. **Names/bounds alone do
not certify those openings**: held-out triangle rays and later shaded source
inspection are still required. No other negative-space geometry is asserted
complete by this inventory.

## First-trio datum decisions before authorship

The parent assigned new standalone `t62mv1X.ts`, `t72b1987X.ts`, and `t80uX.ts`
builders. Their source conversion/datums must be approved before authored work.

- Existing `t62mv1` is now named **T-62 obr. 1975**, with an owner-decreed old-model
  width increase from 3.30 to 3.63 m. This supplied MV-1 source is an ERA-equipped
  earlier design, not that later source; preserve the existing original and use
  an explicit **T-62MV-1 X** identity. Do not silently inherit the old width tweak.
- Width-only illustrative scales from previously documented nominal widths are
  T-62 `3.30 / 4254.04852981654 = 0.000775731630`,
  T-72B1987 `3.59 / 4066.086257091173 = 0.000882912898`,
  T-80U `3.60 / 4362.757550802347 = 0.000825166184`.
  They imply overall spans 9.511, 9.703 and 9.534 m respectively, including rear
  fittings. They are **proposals, not approved canonical oracle transformations**.
- The largest closed body islands at those illustrative scales span 6.364 m
  (T-62), 6.737 m (T-72B1987), and 6.720 m (T-80U) longitudinally. Those are exact
  selected-island bounds, **not yet authoritative structural hull endpoints**;
  fenders and rear fittings are separate islands. Resolve true structural datum
  stations and published-versus-exterior dimension distinctions before pinning
  the hull center, yaw ring, trunnion, and muzzle. No source remapping to an
  authored candidate, envelope compression, or score cap is authorized here.

Next CPU steps: inspect source hull/turret island planes and ring/throat sections;
corroborate width/structural-length targets; record explicit canonical transforms
and inferred pivots; create ignored local-only comparison files through the
parent's approved converter; then independently author parametric solids and
held-out real-buffer tests. Registered views retain the strict raw 92 minimum,
source/spec dimensions within 3%, and unchanged native track/attachment gates.

## Follow-up T-72B3 scalar study

This next source remains measurement-only: no new runtime builder or canonical
oracle has been authored from it yet. Ignored probes
`.qa-dev/t72b3-source-study.mjs` and `.qa-dev/t72b3-joints.mjs` retain only scalar
reports and hashes, not source vertex/index arrays. Values here use the proposed
0.01 unit conversion and +X-to-+Z axis rotation, before hull-center translation.

- Exact transformed triangle multisets, rounded to one micrometre for duplicate
  identification, establish that `gear1-optiona`, `b`, and `f` are identical
  152-triangle configurations. `c` and `d` contain 76 triangles each and their
  union equals `a` exactly. `e` is a distinct two-triangle fitting. The proposed
  configuration is therefore `a` plus `e`, with `b/c/d/f` explicitly excluded as
  duplicates; that proposal still requires the parent's oracle recipe approval.
- The full supplied width is 3.7656 m; the fender body is 3.6018 m wide. Neither
  should be silently fitted to the previous T-72 donor's 3.59 m. The 5.457 m high
  second antenna is genuine source geometry and must not be height-clamped.
- The principal connected hull skin has 121 triangles and longitudinal ends
  −3.33719993 and +3.00600004 m, a 6.34319997 m span. The −3.45070004 m extremum
  of the separate `hullb` node belongs to a small recovery fitting, not the main
  hull. `hullb` also contains real aft shell and deck pieces: its whole node may
  not be discarded or used uncritically as the structural-length datum.
- The horizontal main-hull opening has actual decagonal ring points consistent
  with center X≈0, Z≈−0.10655 m, radius≈1.10204 m, at Y≈1.4571003 m. This is a
  physical seat candidate, not a claim that the zeroed `turret` node origin is a
  design pivot. Final fixed yaw and inferred gun-pitch datums remain under audit.
- The main weapon's actual front ring ends at Z5.62659979 m, whereas the author
  `weapon_muzzle` marker is at Z5.64219999 m, 15.6002 mm farther forward. A marker
  is therefore not an exact exterior endpoint. Its internal `barrel` component
  is an eight-triangle conical bore, not a solid muzzle cap.

No source unit/frame, component ownership, or proposed exclusion in this section
has been fitted to an authored candidate or a score. The same unresolved
provenance and local-only restrictions stated above apply.

Reproduce this inventory from the worktree root with
`node .qa-dev/second-wave-soviet-inventory.mjs` (all nine) or an inventory key
argument such as `t62mv1`. It writes only scalar JSON below ignored `.qa-dev/`.
The maintained `tools/source-world-registration-local.mjs` and
`tools/source-slab-study.mjs` are later verification examples, but their current
ID/certificate registrations do **not** include this new wave yet.
