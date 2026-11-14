# Second-wave X source inventory — Korean, Japanese, French and JPz E 100

2026-09-06, read-only source inventory. Proposed additive IDs are `k1a1_x`,
`type10_x`, `type90_x`, `amx30_x`, `amx40_x`, and `jpz_e100_x`; none existed
when inventoried. Existing playable models must remain unchanged.

All six inputs exist under `/Users/kevinliu/Downloads/Claude of Tanks Models/`.
The requested JPz path directly under `Downloads/` does **not** exist; the same
basename is present in the Models folder. No source asset was copied, converted,
registered or rendered during this inventory. Archive entries were read as data;
no contained instructions, executables or scripts were run.

## Immutable inputs and provenance

| Input | Bytes | SHA-256 | Embedded or existing-record attribution |
| --- | ---: | --- | --- |
| `k1a1-armored-warfare.zip` | 14,750,875 | `d2e8eeb7d828b2cff23ee78d54657ebf97935f430151741f4dab8a23cbb6a96d` | KojfDiscord AW series; existing owner local-only measurement ruling in `docs/ATTRIBUTION.md` |
| `type-10_main_battle_tank.glb` | 10,994,616 | `2cc5748e4357722fc1c21bf7759ec21c29f84b2cfaf1203b5bee995f4cfeca67` | Muhamad Mirza Arrafi / nazidefenseforceofficial, CC-BY-4.0 claimed; exact previously owner-cleared input |
| `type_90_kyu-maru_japan.glb` | 3,105,188 | `d47c9446d82e511922c92244c375afca7701b9202ff11d601197e3a898adeaac` | 42manako, CC-BY-NC-4.0; local-only, as recorded in `japanese-armored-family.md` |
| `amx_30_b.glb` | 28,446,172 | `487ad57122e2f8e3425df7b706e752dac7d3cd1983b44b876deefc755d97bf9c` | heska075, CC-BY-4.0 claimed; semantic `Skin_F72_AMX_30_*`/batch names are an extraction/conversion flag, not independent clearance |
| `amx-40_armored_warfare.glb` | 31,242,564 | `2a510ae66a2355bc9766f043c7f42ae51164181ac9a6ed40d45c63993789d50e` | KojfDiscord, CC-BY-4.0 claimed; existing provenance-inconclusive AW-series local-only ruling |
| `jagdpanzer_e_100_world_of_tanks.glb` | 3,856,540 | `3e0e68362353175d4d7100c33802b95b60e305ae7ae3b8bb204a79b174fe7a40` | JUSTGAME, CC-BY-4.0 claimed; explicitly titled “Jagdpanzer E 100 (World of Tanks)” |

Embedded source URLs: [Type 10](https://sketchfab.com/3d-models/type-10-main-battle-tank-7d14267918e7441b92ccc9f77869cb37),
[Type 90](https://sketchfab.com/3d-models/type-90-kyu-maru-japan-0b0e862581234f05a5d0ac2883577e33),
[AMX-30](https://sketchfab.com/3d-models/amx-30-b-0641679a71464d1a94772c3c955a9b55),
[AMX-40](https://sketchfab.com/3d-models/amx-40-armored-warfare-1c7abf96071d4752b8021ea77b7a587c),
[JPz E 100](https://sketchfab.com/3d-models/jagdpanzer-e-100-world-of-tanks-008c176072274c999eb16cffc802d990).
These are metadata attributions, not a new live-page provenance adjudication.
No embedded CC tag establishes redistribution rights. All remain external
comparison inputs, never playable geometry, textures, rigs or copied buffers.

K1A1's outer ZIP has 25 entries: nested `source/K1A1.zip` plus textures. Its
already-unpacked nested archive has 35 entries (OBJ, MTL, textures), no executable
or license/readme entry. The existing OBJ is 5,233,864 bytes, SHA-256
`7c55e7f54f0f7d59247e1559b92fc1db82952191566ef5504fd78dcde9df6d93`.
Texture names include `normal_ddn_n`, `id_diffuse_<hash>` and
`universal_props_shader_ddn_n`; record the evidence without treating a title
alone as a newly proven extraction. The standing owner ruling is preserved.

## Actual scene geometry

Dimensions below are raw world XYZ after the source node hierarchy, **not**
automatically metres or hull dimensions. Island counts use the existing
`tools/glb-island-probe.mjs --min-tris 1 --weld 0.000001`; welding is per primitive.
Its heuristic “TURRET?” labels are not accepted as semantic ownership proof.
All five GLBs are unskinned, have no animation, no Draco, and no required
compressed-geometry extension. Their meshes can be CPU-inspected without GPU.

| Source | Mesh nodes / triangles / islands | Raw world size XYZ | Up / forward | Segmentation consequence |
| --- | --- | --- | --- | --- |
| K1A1 OBJ | 41 material groups; semantic assembly groups | 3.675800 × 4.070250 × 9.722640 | +Y / +Z | Real turret, cannon, cannonbase, tread, suspension, cage, smoke and antenna groups; individual roof/hull material groups still require ownership audit |
| Type 10 | 5 / 99,944 / 2,450 | 2.981900 × 3.626140 × 8.287705 | +Y / +Z | Material split: `Object_6` turret **and gun**, `Object_5` deck **and tall roof fittings**; broad node regexes cannot give honest articulated component masks |
| Type 90 | 2 / 7,711 / 158 | 90.439531 × 42.98644 × 33.387075 | +Y / +X | `mesh_308_mat_57_0` mixes body/turret/gun/equipment; `mesh_309_mat_56_0` has four track islands. Low-poly disconnected shell/gun islands exist but do not constitute a rig |
| AMX-30 | 71 / 13,801 / 714 | 9.548690 × 3.423820 × 10.113220 | +Y / +X | **Two full vehicles** at world Z +3.5 and −3.5. First 34 semantic assembly parents are the undecorated first vehicle; second has three extra `Skin_F72` groups. Do not normalize the complete scene |
| AMX-40 | 23 / 142,137 / 2,336 | 3.358500 × 5.114450 × 10.058800 | +Y / +Z | Mixed OBJ material merger, but hull `Object_9`, tracks `Object_10/19`, gun `Object_20`, rear collar `Object_14`, roof/upper body `Object_12` are measurable starting groups |
| JPz E 100 | 25 / 49,720 / 964 | 4.478840 × 3.400790 × 11.420660 | +Y / +Z | Semantic Hull, Gun, two Track groups, wheel/suspension nodes. Fixed casemate: do not mislabel the hull-owned casemate as a rotating turret |

Type 10 generator is Sketchfab-16.59.0; Type 90 17.20.0; AMX-30 16.99.0;
AMX-40 16.93.0; JPz 16.72.0. Type 90 uses `KHR_materials_specular`, AMX-40
the older `KHR_materials_pbrSpecularGlossiness`, and JPz `KHR_materials_unlit`.
The current CPU Three.js loader warns about AMX-40's legacy material extension;
geometry still loads. Neutral geometry comparison should not claim material parity.

## Bounds, assembly landmarks and next measurement targets

- **K1A1:** source hull main group `vehicle#k1a1--k1a1_3_0`
  is X ±1.837900, Y .380900..1.655300, Z −3.834000..3.793000.
  Treads are X ±1.046000..±1.629200, Y −.015900..1.289100,
  Z −3.309300..3.677000. Six road-wheel station centers are
  Z −2.177500, −1.297400, −.461300, .528200, 1.584100, 2.504600,
  radius .331300, Y .381900; front idler Z3.277900/Y.814600,
  rear sprocket Z−2.905600/Y.796350. Cage group `_cage_turret_12_0`
  spans Y1.651560..2.088160 and Z−2.505060..1.518440; preserve its
  actual open lattice, not its bounding box. `_smokecaps_turret_7_0`
  explicitly contains source caps: do not assume all source mouths are open.
- **Type 10:** `Object_6` has an independent 1,060-triangle foregun island
  X−.135940.. .136550, Y .387090.. .664790, Z2.325800..4.727550;
  its 332-triangle turret-shell island is X−1.297200..1.292960,
  Y .232720.. .851020, Z−1.998780..1.969230. Rear rack crossbars in
  `Object_5` occupy distinct thin Z rows −2.347960..−2.329860,
  −2.512710..−2.494610 and −2.677470..−2.659360. Their intervening
  slots, mantlet/optic recesses, and raised roof-unit supports need first-hit
  air/solid probes; a full rectangular rack would be false source geometry.
- **Type 90:** source hull island (204 triangles) spans
  X−37.434730..34.537100, Y4.122720..17.071730, Z−16.489740..16.489770;
  turret shell (84 triangles) X−19.977230..18.048390,
  Y15.519420..22.697290, Z−11.251450..12.124700;
  foregun (396 triangles) X18.048390..51.657880,
  Y16.512620..20.347590, Z−1.917090..1.917120.
  Two thin antenna islands reach Y42.98642. Do not call that structural roof.
  Verify muzzle/optic openings and low-poly hull/turret separation from actual
  triangles before manufacturing “negative space” from a mesh name.
- **AMX-30:** first-copy semantic hull `1_hull_batch_0_30`/`Object_64`
  is X−3.209260..3.093630 and Z1.951970..5.052160;
  gun `1_gun_01_batch_0_27`/`Object_58` ends at X5.936580.
  Turret parents `_32/_33`, gun/mask parents `_27/_28/_29`, chassis and
  grille groups are separable. Use the first copy only, subtract Z3.5,
  then rotate +X to +Z. Grille, thin non-collision (`nc`) fixture rails,
  coax/mantlet ports and sight support openings must be examined rather than
  treating every `nc` group as disposable. Second copy is not byte-identical:
  three additional Skin_F72 groups change its exterior.
- **AMX-40:** main shell island (747 triangles) X ±1.596700,
  Y .457800..1.744100, Z−3.371100..3.310500; hull equipment broadens
  full bounds to Z−3.486300. Foretube `Object_20` ends Z6.572500;
  `Object_24` carries whips reaching Y5.115850. Distinguish that from
  upper fittings (`Object_12`, maxY3.114090). Investigate rack/side-frame
  `Object_8`, engine grille, smoke mounts and gun/collar air with source rays.
- **JPz E 100:** `Hull_Material000.001_0` spans
  X ±2.239420, Y−.659350..2.335300, Z−4.240640..4.506930.
  Tracks bottomY−1.065490 and returnY .259530; foregun terminalZ7.180020.
  Gun and mantlet are separate from fixed superstructure. Preserve muzzle-brake
  slots/bore, mantlet clearance, interleaved wheel gaps and rear exhaust/tow
  standoffs where actual source triangle rays prove air. These are probe
  priorities, not a claim that a shaded/negative-space audit has passed.

## Japanese metric-anchor discrepancy — approved honest dual evidence

The [Japan MoD 7th Division museum comparison table](https://www.mod.go.jp/gsdf/nae/7d/siryoukan.html)
gives Type 10 overall length9.42 m, width3.24 m, standard height2.30 m;
Type 90 length9.80 m, skirt width3.40 m, height2.30 m. The
[JGSDF equipment page](https://www.mod.go.jp/gsdf/equipment/ve/index.html)
independently gives Type 90's same length/width and identifies its height as
standard posture; Type 10 is rounded to approximately9.5/3.2/2.3 m.

| Source | Uniform width anchor | Resulting overall length | Uniform overall anchor | Resulting width |
| --- | ---: | ---: | ---: | ---: |
| Type 10 | 3.24/2.981900096 = 1.086555517 | 9.005052 m (−4.405%) | 9.42/8.287704945 = 1.136623476 | 3.389298 m (+4.608%) |
| Type 90 | 3.40/33.387075406 = .101835814 | 9.209983 m (−6.021%) | 9.80/90.439531405 = .108359695 | 3.617813 m (+6.406%) |

Type 90 has no uniform-scale interval within3% of both official length and
width. A “balanced” fit would still be approximately−3.057%/+3.153%; do not
round this into a pass. Root requested owner direction on supplied-shape
fidelity versus real dimensions, then approved proceeding with uniform
overall-length anchoring for the unchanged source oracle and official
dimensions plus primary photography for independently authored runtime shapes.
The source residual must remain visible: a strict source pass is not claimed
where the supplied proportions make it impossible. No nonuniform oracle
correction, old warped-oracle substitution or threshold relaxation is allowed.
Existing `type10` repaired/clamped oracle is not an independent replacement;
Type 90's older recovered source should be assessed as an additional input,
not silently substituted for the supplied file.

An explicit ignored-file search found the old Type 90 pre-warp backup in the
shared checkout (`public/models/tanks/community/recovered/type90.glb.bak`,
SHA-256 `15ab01b7921736fb5441290281bedfeb71638c62d987df54de4bafca0d2252b0`).
CPU world bounds are90.439548 ×42.986439 ×33.387080, effectively the same
proportions as the supplied file. It is a prior segmentation/conversion, not an
independent better-proportioned source. The quarantined original Type 10 and
Type 90 GLBs are byte-identical to the supplied hashes above. The old live
recovered Type 90 is a different, explicitly warped file; neither it nor the
repaired Type 10 qualifies as an undeformed comparison oracle.

The [MHI Type 10 manufacturer page](https://www.mhi.com/jp/business/products-services/space-defense/defense-vehicles/type-10-main-battle-tank)
provides useful primary photography, but no additional precise dimensional
anchors. Its photographs are expressly not reusable; they were not downloaded
or incorporated. Official Tamiya kit dimensions describe the kits, not a more
authoritative measurement of the actual vehicles, and were not substituted for
JGSDF dimensions. Root owns execution of the approved rigid/uniform conversion.

Fresh exact Three.js world bounds differ from the initial inventory parser by
only micrometres. Proposed conversion datums, reported to root before any
conversion, are:

| Datum | Type 10 | Type 90 |
| --- | --- | --- |
| Raw longitudinal extent | 8.287699937820435 | 90.43954606008333 |
| Uniform overall-length scale | 1.1366241623942464 | .1083596770099818 |
| Axis mapping | `[x,y,z]` | `[-z,y,x]` |
| Translation after scale/axes | `[-.00034883486105,1.24758034095187,.25532557439914]` | `[.00000172794,.00000197300,.15699306157]` |
| Resulting unchanged-source width | 3.38929725996 | 3.61781383855 |
| Runtime official target width | 3.24 | 3.40 |

Type 10's measured annular-ring center becomes
`[-.00275904,1.50831687,.20655021]`; the source has a small positive nose/gun
pitch of approximately `.01004` radians, also evident in the five road-wheel
center heights. It must not be silently de-posed. Type 90 has no recovered
rig; yaw location remains an inference to establish inside the physical ring.
Its raw foregun axis is approximately `Y18.42945/Z.000017`, with terminal
raw `X51.6578912`. Datum uncertainty is not a license to fit a candidate to
its own image.

K1A1 uniform scale1 is approved in principle. Proposed canonical shift is
Y+.0159, Z+.0205 (main-hull center, not muzzle-inclusive center), preserving
raw units, whole length9.722640 and source hull length7.627000. The source's
gun-axis transverse offset X+.0352 is real and must not be silently centered.

## Reproduction and bounded next steps

Raw scalar-only island reports are outside Git in
`/private/tmp/cot-second-wave-other-inventory.my3APo/{type10,type90,amx30,amx40,jpze100}-islands.json`.
Reproduce one report with:

```sh
node tools/glb-island-probe.mjs '/Users/kevinliu/Downloads/Claude of Tanks Models/type_90_kyu-maru_japan.glb' --min-tris 1 --weld 0.000001 --json /private/tmp/type90-source-islands.json
```

Next: isolate original source assembly **only for local measurement**, measure
ring/trunnion centers and rigid source poses, obtain fixed source cross-section
planes and held-out air/support rays, approve one rigid/uniform transform, and
only then author independent solids. Root owns any ignored oracle conversion.
No GPU/browser, source geometry/texture copy, runtime model edit, or Git write
was performed in the initial inventory stage. Subsequent approved independent
K1A1 authoring is documented separately in `docs/references/tanks/k1a1_x.md`.
