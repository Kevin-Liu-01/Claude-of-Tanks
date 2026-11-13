# Leopard 2 Revolution owner-source study

The September 4, 2026 owner archive is the visual authority for the new
first-party Revolution. The preceding procedural model is preserved as
Leopard 2 Revolution Proto, tier IX. Neither the archive nor its meshes, materials, textures,
or derived comparison GLB belong in the playable asset path.

## Source and provenance

The supplied `leopard-2-mbt-revolution.zip` contains
`source/Leopard 2 MBT Revolution.zip`, whose only member is
`Leopard 2 MBT Revolution.obj`. The outer archive also holds five texture PNGs;
the OBJ references an absent `untitled.mtl`.

| Input | SHA-256 |
| --- | --- |
| Owner ZIP | `8577cb2ac53daf369dc2175b045207de4760246ec73f6434bbcfce38a0fc3e4f` |
| Nested OBJ | `d97595be419fee2c474a1cd4cfdc6b502e666070d4c746dda2e7b0d8c2d60481` |

No original author or license record accompanies this archive. Texture names
such as `mbt_03_ext01_blufor_co.png` resemble Arma asset conventions; this is
an origin warning, not proof that these particular bytes were extracted.
Bohemia's [artist interview](https://arma3.com/news/report-in-dave-zapletal-art)
identifies its AAF tank as inspired by Leopard 2. Existing project provenance
already places recovered Revolution files in local-only quarantine. Do not
redistribute the archive or generated oracle, and do not treat the local
comparison registration as license clearance. Commercial-game extracted
assets remain prohibited by `docs/GEOMETRY-GATE.md`.

The archived `leo2_revolution.glb.bak` uses the same source lineage and exact
source width, but its altered turret has large missing side walls and a
floating roof. It is unsuitable as the new visual authority. The owner OBJ
has closed side walls. Preserve the original bytes; do not reapply the old
repair chain.

## Coordinate and normalization receipt

`tools/revolution-source-oracle.py` imports the OBJ through Blender with
negative-Z forward/Y-up, then reads canonical axes `(x,z,y)` from Blender
world coordinates. The canonical game frame is +X right, +Y up, +Z forward.
The frame origin is ground level and the midpoint of the source `chassis`
longitudinal bounds, rather than the midpoint of hull plus barrel.

Declared dimensions are 4.00 m overall width, 7.72 m hull length, and 9.97 m
overall length. The source width is 4.42255; XY scale is 0.9044555743. Hull
longitudinal scale is 0.9030908636. Only the exposed barrel ahead of the source
bow receives the 0.9829963476 longitudinal scale needed for the declared
overall length. The transform is continuous at the bow. No faces are added,
deleted, re-parented, or copied into a procedural builder.

Raw canonical datums: X center -0.028315, ground Y -1.10808, hull Z center
-0.522110, bow Z +3.752100. Final hull ends are Z ±3.86, muzzle Z +6.11.

The OBJ has 23 meshes: `chassis`, a complete fused `chassis_vlo`, twelve
overlapping track animation meshes, two end-wheel meshes, and seven paired
road-wheel meshes. Those export artifacts do not define playable architecture:
the procedural model must retain its single animated smart-track course.
Coincident vertices are grouped only for measurement connectivity; the oracle
export preserves its original faces and vertices.

## Principal measured envelopes

These are connected geometric islands in the original source, normalized into
the hull-centered game frame. They are envelopes, not replacement meshes.

| Component | X range (m) | Y range (m) | Z range (m) |
| --- | --- | --- | --- |
| Structural hull | -1.9493…1.9493 | 0.3416…1.6632 | -3.6602…3.8600 |
| Closed turret shell | -1.6020…1.6297 | 1.5370…2.2364 | -2.8077…2.0960 |
| Mantlet assembly | -0.3967…0.4334 | 1.5840…2.1637 | 1.1723…2.4112 |
| Main gun island | -0.1911…0.2149 | 1.6751…2.0377 | 1.4851…6.1100 |
| Turret ring island | -0.9262…0.9131 | 1.4397…1.6205 | -0.4269…1.3816 |
| Left source track | -1.5383…-0.9746 | 0.0105…1.1866 | -3.1387…3.5534 |
| Right source track | 1.0476…1.6112 | 0.0000…1.1766 | -3.1388…3.5533 |
| Front idler pair | -1.4085…1.4861 | 0.5313…1.0869 | 2.9261…3.4784 |
| Rear drive pair | -1.5462…1.6176 | 0.4791…1.1920 | -3.1264…-2.4303 |

The ring envelope suggests a yaw center near X -0.0065, Z +0.4774. Source
road-wheel diameter is 0.6609 m; seven Z centers from forward to rear are
2.3861, 1.5878, 0.8282, 0.0919, -0.6628, -1.4709, -2.2110. Source total
height 4.0258 m includes thin antennae; the main shell roof is 2.2364 m.

The 4.9038 m turret shell has a broad 3.23 m envelope and a low 0.699 m
vertical span. Its rear narrows progressively; the central roof is flat at
2.2364 m before the forward roof falls continuously toward 2.0221 m at
Z +2.094. Its central chin is 1.537 m and rises to approximately 1.676 m at
the forward tip. The study JSON supplies 21 triangle-intersected longitudinal
sections for the principal hull and turret islands.

Source roof hardware occupies specific stations, all in the same hull-centered
world frame:

| Hardware | X center (m) | Z center (m) | Vertical envelope (m) |
| --- | ---: | ---: | --- |
| Panoramic sight | -0.273 | -0.875 | 2.230…2.674 |
| Remote weapon spindle | 0.858 | -1.596 | 2.239…2.729 |
| Remote weapon upper fairing | 0.857 | -1.534 | 2.710…2.866 |
| Loader / commander hatches | -0.509 / 0.541 | -0.226 | 2.199…2.353 |
| Front smoke banks | -1.492 / 1.519 | 1.868 | 2.018…2.166 |
| Rear smoke banks | -1.029 / 1.057 | -2.588 | 2.230…2.346 |
| Front-right radio mast | 1.0493 | 0.8470 | 2.1413…3.9612 |
| Rear-left radio mast | -0.8420 | -2.0733 | 2.2933…4.0258 |

The actual muzzle terminal ring is centered at X 0.01190, Y 1.84926,
Z 6.10799, with 0.08281 m outer radius. Its nearby asymmetric fitting reaches
X 0.168; using that fitting's bounding box to define the circular bore would
misplace the barrel axis. The source remote machine-gun barrel is a distinct
thin tube near X 0.857, Y 2.725, spanning Z -1.353…-0.725.

`leopardRevolutionGeometry.selftest.mjs` independently measures the real
procedural shell, chin/roof intersections, outer walls, physical gun ring,
turret-owned equipment vertices, native wheel instance matrices, paired track
bands and muzzle yaw. Two fixed mast-tip probes distinguish the source's
front-right / rear-left stations from two generic short rear whips.
Its shell probes are fixed source measurements rather
than a copy of builder-authored receipts. They supplement the nine-view gate;
passing these structural checks cannot replace the visual comparison.

## Repeatable evidence and strict gates

Run with an extracted owner OBJ outside the repository:

```sh
blender --background --factory-startup --python tools/revolution-source-oracle.py -- \
  --model /absolute/path/to/Leopard.obj \
  --output-json /absolute/path/to/hull-centered-measurements.json \
  --output-glb public/models/community-candidates/leopard_revolution_owner_2026.glb

blender --background --factory-startup --python tools/revolution-source-study.py -- \
  --model /absolute/path/to/Leopard.obj --id revolution-source \
  --axes=x,z,y --target-width=4 \
  --output-json /absolute/path/to/source-measurements.json \
  --render-dir /absolute/path/to/source-renders

node tools/procedural-fidelity.mjs --ids=leo2_revolution --shots=1 --board --check
node tools/geometry-gate.mjs --ids=leo2_revolution --check
```

The dedicated source-study renderer converts the measured Y-up frame into
Blender Z-up before lighting and camera placement; the older generic study
renderer otherwise produces a vertical vehicle bisected by its ground plane.

`procedural-fidelity.html` registers this vehicle with `qualityBar:'exemplar'`:
overall and every registered silhouette view must reach 92. Because the OBJ
has a fused complete-vehicle mesh and its `chassis` includes upper fittings,
independent hull, turret, and gun masks would be false evidence. Whole views
and lower running gear remain scored. Native turret yaw, gun elevation,
connected fittings, exact band/shoe containment, dimensions, and anatomy
must be checked separately by the established release pipeline.

Pre-rebuild baseline against this intact source: overall 91.81, whole-view
average 90.92, tracks 95.68, worst view rear 87.09. Front 88.00, front-left
91.60, left 92.25, rear-left 92.13, rear-right 91.76, right 92.79,
front-right 92.15, and top 90.54. This baseline fails the exemplar gate.
Source and procedural shaded boards must additionally be inspected at front,
quarter, side, rear, and top; a favorable aggregate cannot waive a failed
view or visibly incorrect connected bodywork.

## Rebuild validation receipt

The rebuilt, independent profile passes the owner-source outline comparison
at **94.0 overall**, with every canonical view above the unchanged 92 floor:
front 93.8, front-left 93.9, left 92.2, rear-left 93.6, rear 94.0,
rear-right 94.8, right 93.1, front-right 94.0, and top 96.2. Running gear
scores 94.4. These are silhouette-overlap scores, not a claim of perfect
surface or material equivalence; the fused source cannot provide honest
independent hull/turret/gun masks.

The separate measured geometry packet passes at a minimum of 92.2. Measured
envelope errors are 0.25% hull length, 0.44% overall length, 0.11% width, and
1.26% silhouette height. Fixed source-section probes additionally check the
actual roof/chin triangles, closed outer walls, muzzle, seven paired wheel
stations, radio masts, and roof equipment. Both front/rear and whole-course
strict track-band/shoe intersection counts are zero.

The large EMES window uses genuine negative space: its roughly 0.55 m wide
mouth opens at world Z 2.096, with a back wall at Z 1.10 and a low floor at
Y 1.71. It has no solid armor bridge across the front opening. The inset glass
is backed by a physical bulkhead; explicit ray tests fail if a replacement
cheek fills the recess. Gallery inspection includes a frontal close-up and
32-degree turret yaw with 12-degree gun elevation. The new vehicle keeps
only restrained rear-fender tools from the generic decoration system;
source-authored roof stations are not obscured by random cargo.

The rear slat cage also requires intentional negative space. Applying the
unqualified whole-footprint continuity raster to the intact source reports
477 enclosed sky cells, versus 345 on the rebuild. Independent two-sided
triangle rays and 2 mm interval scans confirm that the source is open between
the rear cage (Z -3.858…-3.820) and deck (beginning near Z -3.660), and between
the rear hull edge (|X| about 1.698) and side cage (|X| about 1.934). The narrow
supports at Z -1.20 are only 8.27 mm thick longitudinally. These regions are
not missing hull panels and must not be filled to manufacture a passing
raster. Body continuity therefore needs to distinguish explicitly authored
open-lattice framing from closed hull skin; source-outline, attachment, and
strict track-containment checks must continue to include that framing.

The implemented body-continuity policy excludes only the two explicitly
tagged, non-armor lattice equipment meshes from its closed-skin raster. The
rebuild then has zero body holes. Renderer regression fixtures verify both
sides of that rule: intentional external lattice reports zero holes, a real
missing body panel still reports 144, and untagged rails still report 1,176.
An armor mesh cannot exempt itself by carrying the lattice tag. The cage
remains rendered and participates in source-outline and track-clearance
checks; the 92-point and zero-intersection thresholds are unchanged.

The rendered comparison board is regenerated locally at
`shots/procedural-fidelity/boards/leo2_revolution.png`. Geometry receipts are
tracked in `docs/geometry-gate/leo2_revolution.json`. The private source mesh
and generated comparison GLB remain outside release artifacts.

Final end-to-end verification completed successfully with
`npm run tank:anatomy:update`, `npm run tank:anatomy:check`, and
`npm run tank:release:check -- --ids=leo2_revolution,leo2_revolution_proto --gate`.
The release command passed both vehicles' fresh assets, module alignment,
single-track-course, muzzle, barrel circularity, strict track/body continuity,
and geometry checks, followed by all pre/core/post regression suites and the
private build. The final `npm run build` public build also passed and removed
the local comparison directory from `dist`; its registry audit reported
138 procedural playables and zero GLB-sourced playables. Existing bundle-size
warnings remain advisory, not a claim of a new performance benchmark.

## Historical Proto preservation oracle (not source fidelity)

`leo2_revolution_proto` intentionally preserves the former inaccurate authored
design. It must not claim that a favorable self-comparison proves Leopard 2
Revolution accuracy. Its separate comparison purpose is **preservation**: an
immutable first-party export from the clean historical commit
`da5e0cf0af4e4ddf7a29ec78d7e1c120ce12755b`, original ID `leo2_revolution`.
The exported GLB is local and ignored, never a runtime loading path.

The snapshot and current Proto have the same 541 visible mesh instances and
the same physical triangle/articulation fingerprint at one-micrometre
precision:
`305ff0250dea38d45a53738d775686727300440890467023e5fb7e8e94711f38`.
The frozen GLB SHA-256 is
`ce63f41864d158627df7a89f0fc22e7f71ae753ded72e350206230bf2f417ff7`.
The tool-only loader checks those pinned baseline metadata and the actual
GLB bytes before parsing. The allowlist is restricted to the Proto ID; it
cannot exempt the rebuilt Revolution or another source-fidelity vehicle.

Repeat the CPU export from a **separate clean detached worktree** at that
commit, with the same installed dependency tree available there:

```sh
node tools/export-first-party-preservation.mjs \
  --snapshot=/absolute/path/to/clean-historical-worktree \
  --commit=da5e0cf0af4e4ddf7a29ec78d7e1c120ce12755b \
  --id=leo2_revolution --candidate-id=leo2_revolution_proto \
  --output=public/models/community-candidates/leo2_revolution_proto_preservation.glb
node tools/preservation-oracle.selftest.mjs
node tools/geometry-gate.mjs --ids=leo2_revolution_proto --check
node tools/procedural-fidelity.mjs --ids=leo2_revolution_proto --check
```

The export replaces materials with neutral comparison material and expands
native GPU instances into static meshes; it does not alter triangle shapes,
positions, articulation ownership or the original scene origin. Its CPU
fingerprint independently verifies the unchanged candidate before export.
Unlike source normalization, preservation applies **no independent scaling
or ground adjustment** to either side. Every view and geometric component
must reach **99**, including dimensional measurements against the immutable
baseline through identical masks/cameras. The old 9.72 m authored overall
length remains explicitly different from its historical 9.97 m published
specification; preservation is not permission to call that source-accurate.
The rebuilt Revolution remains at 92 against the owner source and published
dimensions. Focused harness tests enforce that separation and reject changed
hashes, commits, substituted bytes and unauthorized preservation IDs.
