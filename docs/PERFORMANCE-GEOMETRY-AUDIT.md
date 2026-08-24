# Geometry performance audit — 2026-08-23

This audit covers every registered procedural vehicle and every live renderer
subsystem. Its rule is conservative: remove geometry only when the exterior is
unchanged, or substitute a measured distance representation after the original
detail is no longer resolvable. Close gallery and battle heroes keep their
authored silhouettes.

## Outcome at a glance

The shipped changes reduce geometry work where it is least visible while
preserving close-range tank silhouettes and authored gameplay geometry. The
largest practical gain is on lower-end and mobile hardware: the audited 90 m
mobile fleet census falls from 8.73 M to 3.50 M triangles (-59.88%). Close
gallery and battle views are 9-10% lighter across all 149 registered tanks,
and a representative live battlefield inventory is 13.43% lighter.

| Area | Accomplished | Player-facing result |
|---|---:|---|
| All close-view tanks | 9.05-10.05% fewer triangles | Less vertex/raster work without changing armor, weapons, equipment, markings, shadows, or exterior silhouettes |
| Mobile tanks at 90 m | 59.88% fewer triangles | Substantially more GPU headroom at normal mobile combat distance |
| Running gear | 12.34% lighter close; 70.68% lighter at 90 m | Exact exterior shoes nearby, measured 22-triangle shoes after detail is no longer resolvable |
| Representative visible world | 13.43% fewer triangles | Lower battlefield scene cost from props, vegetation decals, wrecks, and distance-aware poles |
| Tank wrecks | 48.04% fewer triangles | Complete wreck silhouette and track course retained while sealed fine furniture is omitted |
| Far telephone poles | Up to 94.79% fewer triangles | Exact pole nearby and a stable hysteretic distance representation beyond 120 m |
| Tree contact decals | 33.33% fewer triangles | Same transparent visible boundary with fewer terrain-conforming sectors |
| Point primitives | Already zero in the live probe | No hidden point-particle geometry remained to optimize |

These figures are aggregate fleet-census comparisons—one rendering of every
registered tank per scenario—not a claim that all 149 tanks are rendered in a
single battle frame. The reductions directly remove geometry processing and
associated bandwidth, but actual frame-rate improvement remains dependent on
device bottlenecks, resolution, shadows, and scene composition.

Visual parity was established with 447/447 close fleet comparisons and
596/596 battle-distance comparisons, plus original-resolution wreck and pole
checks and inspection of all twenty battlefield maps. The complete project
suite, 149-vehicle muzzle visual gate, anatomy/asset receipts, and public and
private production builds also passed before publication.

## Measurement contract

- Fleet: 149 registered procedural tanks, including all 122 playable tanks.
- Modes: gallery, garage, player battle, 40 m bot, 180 m bot, and 90 m
  mobile-player geometry.
- `InstancedMesh` counts multiply the indexed/non-indexed primitive count by
  the live instance count. `BatchedMesh` counts use the active multi-draw
  ranges. Hidden LOD levels do not count.
- Points and lines are counted independently; they are never folded into the
  triangle total.
- The fleet census is produced by `tools/fleet-geometry-audit.mjs`. Battle
  distance captures come from `tools/fleet-battle-views.mjs`; numeric image
  comparisons come from `tools/fleet-visual-compare.mjs`.
- Live scene accounting comes from `tools/perfprobe.mjs --breakdown`, which now
  reports points, lines, top world geometry, and terrain/vegetation/props
  aggregates.

## Fleet result

| Scenario | Before | After | Reduction |
|---|---:|---:|---:|
| Gallery, high detail | 12,088,893 | 10,994,333 | 9.05% |
| Garage, high detail | 12,356,441 | 11,261,881 | 8.86% |
| Player battle | 11,653,457 | 10,558,897 | 9.39% |
| Bot at 40 m | 10,892,027 | 9,797,467 | 10.05% |
| Bot at 180 m | 2,907,471 | 2,907,471 | 0% |
| Mobile player at 90 m | 8,727,135 | 3,501,051 | 59.88% |

All 149 tanks improved in every close-mode census. Gallery reductions range
from 3.96% to 12.63% (9.24% median); mobile 90 m reductions range from 38.99%
to 75.28% (60.84% median). The 180 m bot result is intentionally unchanged:
the existing LOD already removes track shoes completely by that distance.

Running gear was the dominant source: 8,871,268 triangles, or 73.4% of the
gallery fleet. It is now 7,776,708 triangles (-12.34%). At mobile 90 m it fell
from 7,393,936 to 2,167,852 (-70.68%). Armor, weapons, markings, equipment and
shadow silhouettes are unchanged.

### Track changes

1. Sealed mating faces were removed from the exact shoe: grouser bottoms,
   overlapped shoulder volume, web tops, guide-horn joints and inward pin caps.
   Every exterior face and silhouette dimension remains the same. The largest
   family shoe is now 196 triangles instead of 240.
2. At 55 m, shoes switch to a 22-triangle representation preserving exact
   track width, pitch, pad depth and grouser peak. The authored shoe returns
   inside 55 m; the existing empty level remains at 150 m.
3. Exact and distance levels share the same articulated `instanceMatrix` and
   deterministic color buffers, so the second level adds no transform upload,
   allocation, or animation drift.

## World result

The representative Verdant inventory changed as follows. Dynamic vegetation
and terrain partitions vary slightly with the sampled camera; the component
rows beneath the table are exact construction counts.

| Subsystem | Before world pass | After world pass | Reduction |
|---|---:|---:|---:|
| Props | 713,280 | 453,686 | 36.40% |
| Vegetation | 1,730,714 | 1,629,386 | 5.85% |
| Terrain | 349,200 | 334,992 | camera-LOD variance |
| Total visible world inventory | 2,793,194 | 2,418,064 | 13.43% |

- Baked tank wreck: 335,908 -> 174,550 triangles (-48.04%). It now bakes the
  existing distance shoe and omits sub-wheel recess/ring/hub furniture,
  return rollers and end-wheel fasteners. Road-wheel, tire, hull, turret,
  barrel, debris and complete track-course silhouettes remain.
- Tree contact/canopy decals: 218,664 -> 145,776 (-33.33%). The outer texels
  are fully transparent, so changing twelve terrain-conforming sectors to
  eight leaves the visible radial shadow boundary unchanged.
- Telephone pole: 6,528 -> 340 triangles per far instance (-94.79%). The exact
  sourced model is retained through 120 m; a 105/120 m hysteresis window
  prevents camera-boundary churn. A representative live partition with seven
  close and sixteen far poles used 51,136 rather than 150,144 triangles
  (-65.94%). Topple and utility-wire indices remain stable behind the LOD.

The live battle probe reported a 3.19 M median rendered triangle count against
the 7 M budget, zero rendered points, and at most five line primitives. Its
timing certification was deliberately refused because eleven foreign headless
GPU processes made the machine contended; those frame-time numbers are not
used as performance evidence.

## Literal visual comparisons

| Comparison | Images | Gate/result |
|---|---:|---|
| High-detail fleet: angle/top/side | 447 pairs | 447/447 pass; minimum SSIM 0.99534, minimum silhouette IoU 0.999990, maximum edge displacement 0 px |
| Battle distance: 40/60/90/180 m | 596 pairs | 596/596 pass; SSIM >= 0.92, silhouette IoU >= 0.985, edge displacement <= 1 px |
| Pole at 138 m, same camera/world | 1 pair | SSIM 0.99811; source 6,528 vs distance 340 triangles |
| Wreck, close gameplay framing | 1 pair | Same hull/turret/barrel/course/debris silhouette; 48.04% fewer triangles; manually inspected at original resolution |
| Verdant player/spectator/wide views | 3 pairs per world step | Side-by-side inspection passed; cross-session SSIM stayed in the harness's normal 0.973-0.996 variance band |
| Battlefield map smoke | 20 maps | All establishing frames captured and inspected; no missing world, floating wreck, pole, tree shadow, or terrain seam |

The strict high-detail set proves the close model did not lose visible quality.
The distance set is more important for play: it exercises every tank at four
screen scales, including the two sides of the 55 m transition. The comparison
tool records SSIM, normalized error, changed-pixel ratio, silhouette IoU and
edge displacement instead of accepting a single whole-frame score.

## Audited, intentionally unchanged

- Near-tree cards remain the largest world class. Their far partition and
  shadow policy are already aggressive; removing cards changed canopy density
  and was rejected. The existing opaque shadow proxy is documented in
  `vegetation.js`, including the measured negative result from a coarser
  replacement.
- Terrain already uses camera-driven chunk LOD. Further blanket tessellation
  cuts created ridge/road profile risk for a smaller return than the safe
  world changes above.
- Rocks use welded displaced icosahedra and instancing. Current variants are
  modest compared with vegetation and wrecks, and their fracture silhouette is
  visible at cover distance.
- FX uses pooled instanced quads/meshes rather than `THREE.Points`; the live
  probe confirms zero point primitives. Tracers are a single two-triangle
  ribbon per live instance. Killcam/studio/gallery lines are sparse diagnostic
  or authored trajectory overlays, not particle clouds.
- Garage-only rendering is about 21.6k triangles before the selected tank; HUD
  and battle controls are DOM, so they add no WebGL triangles or points.
- ISU-152 and ISU-122S remain close-detail outliers because their large
  non-indexed lattices carry authored per-vertex casting color, not unused
  subdivision. They already disappear behind battle LOD. Reducing them in the
  gallery failed the audit's no-visible-quality-loss rule.

## Reproduction

```bash
node tools/fleet-geometry-audit.mjs --out=/tmp/fleet-geometry.json
node tools/fleet-battle-views.mjs --out=/tmp/fleet-battle-views
node tools/fleet-visual-compare.mjs --before=/tmp/before --after=/tmp/after --out=/tmp/compare.json
node tools/track-system-audit.mjs
node tools/world-wreck-visual-audit.mjs --out=/tmp/wreck.png
node tools/world-pole-visual-audit.mjs --out=/tmp/pole-audit
node tools/perfprobe.mjs --seconds 60 --breakdown --no-trend --out=/tmp/perf.json
```

Geometry changes still require the normal anatomy refresh/check and the full
playable-roster release gate before publication.
