# Fleet style and performance baseline — 2026-09-07

> Read-only baseline for the P0 [fleet style/performance priority](../tank-generation/fleet-style-performance-priority.md). Implementation fixes, browser latency, GPU timings, silhouette quality, and visual finish certification are not part of this census.

Completed **108 real builds**: 51 requested models plus three original controls, each at high and low geometry quality. All builds passed. Seven slowest unique IDs received five additional timed builds each. The bounded measurement completed 2026-09-07T19:34:13.388Z.

The SEP V2 X scene contains **96,130 unique stored triangles / 229,128 visible instance-expanded triangles** at high quality, and **87,578 / 200,430** at low: only **12.5%** fewer visible triangles. Its high visible count is **2.36×** original M1A2. These are pre-frustum scene-work estimates, not measured GPU triangle submissions.

**11 models have zero observed native return-roller stations and no roller-named scene objects in both qualities.** This proves absence from the observed native assembly; it does not exhaustively rule out untagged roller-shaped stock merged into body buckets. Record these as probable missing return rollers pending targeted geometry/visual inspection.

## Frozen inputs and measurement method

- Worktree: `/Users/kevinliu/.codex/worktrees/cot-abrams-source-x-integrated-20260907`; branch `codex/abrams-source-x-integrated-20260907`; base commit `12a5b9aec317107782b5f6505065ada7c721f290`.
- Actual input SHA-256: `c173a04f06878c383f9091c0b55db5021cfeaaefcafe8d38229c9e4745888da1`, covering 855 saved runtime/spec/source files and dependency manifests. Identical before and after the run. The complete per-file manifest is in the raw JSON.
- This is the unfinished integrated Abrams snapshot before the final hull/bracket/marking resync. It does not certify the newest authoring worktree. Geometry, assets and registries were not edited for the census.
- The rejected CROWS feed helper remains unwired: the measured Equipment build contains its original `CrowsAmmoBox` and `CrowsFeedNeck` boxes. No draft-helper geometry or standalone draft cost is included in live scene counts.
- Runtime: v24.13.0, Three.js r185, darwin/arm64, Apple M5 Max, 18 logical CPUs.
- Factory options: `proceduralOnly: true`, `geometryReceipt: true`, `camoSeed: 4242`, explicit `quality: high|low`. Imports occur before timing. `geometryReceipt` selects the established nonrendering material adapter; texture painting/upload and GPU shader work are absent.
- Construction duration is `performance.now()` around synchronous `createTank()`, with `process.cpuUsage()` also retained. Sync, LOD selection, census traversal and disposal are outside the timer. Sequential builds share a Node process and its caches. Wall-clock contention and garbage collection can affect times; no p95 claim is made from five samples.
- `syncFromState` at 10 m and `THREE.LOD.update(camera)` with camera `(0,3,-10)` reproduce the existing `tools/fleet-geometry-audit.html` visibility selection. No frustum/occlusion culling, renderer passes or GPU work are measured.
- Stored triangles count unique scene-referenced `BufferGeometry` objects once, including hidden LOD payloads. Batched geometry uses active ranges, not allocated capacity. Visible totals multiply `InstancedMesh.count` or sum active visible `BatchedMesh` instance ranges. Raw JSON separately records allocated triangle capacity, geometry attribute/index bytes, color-only and shadow-only visible totals, mesh counts, geometry counts and unique material counts.
- Counter validation: shared boxes plus an instanced box and batched boxes produce exactly 24 stored versus 84 instance-expanded triangles; hiding one batch instance produces 72. This detects accidental counting of allocated batch capacity or missed multiplicity.
- The preliminary `census.json` and pilot intentionally remain in QA history. They lacked camera-driven LOD visibility and overcounted both shoe levels. Their SEP V2 X totals 243,128 / 214,430 are superseded by the corrected 229,128 / 200,430; do not reuse them as visible workload.

## Largest visible geometry totals

Every value below is high / low. Mesh/material counts are visible mesh objects / unique visible materials, not GPU draw calls.

| ID | Stored triangles H / L | Visible triangles H / L | Visible reduction | Meshes H / L | Materials H / L |
|---|---:|---:|---:|---:|---:|
| `m1a2_sepv2_x` | 96,130 / 87,578 | 229,128 / 200,430 | 12.5% | 194 / 192 | 14 / 14 |
| `m1a2_tusk_x` | 78,774 / 71,934 | 211,772 / 184,786 | 12.7% | 194 / 192 | 14 / 14 |
| `m1a2_sepv3_x` | 67,688 / 61,008 | 200,686 / 173,860 | 13.4% | 175 / 173 | 14 / 14 |
| `m1a2_x` | 62,818 / 57,090 | 195,816 / 169,942 | 13.2% | 175 / 173 | 14 / 14 |
| `m1a1_x` | 59,850 / 54,122 | 192,848 / 166,974 | 13.4% | 173 / 171 | 14 / 14 |
| `m1a1ha_x` | 59,850 / 54,122 | 192,848 / 166,974 | 13.4% | 173 / 171 | 14 / 14 |
| `ua_m1a1_x` | 59,850 / 54,122 | 192,848 / 166,974 | 13.4% | 173 / 171 | 14 / 14 |

SEP V2 X high has 155,440 visible running-gear triangles (67.8%). Its largest objects are `gearRoadWheelDiscs` 58,240 (14 instances); `gearTrackPads` 42,800 (200 instances); `gearRoadWheelTires` 28,672 (14 instances); `turretEquipment` 26,918 (1 instances); `hullDetail` 12,644 (1 instances). This identifies shared wheel and shoe primitives as a measurable reduction opportunity, without choosing a geometry simplification.

## Repeated CPU construction samples

Selected by the slowest observed initial quality per unique ID; then repeated five times in the warm process. Sorted here by repeat median. These are synchronous Node construction costs, **not browser tank-switch latency**. Initial rank is noisy; repeat selection does not prove every unselected model is faster.

| ID / quality | Initial ms | Repeat median ms | Repeat min–max ms | All five ms |
|---|---:|---:|---:|---|
| `challenger_3x` / high | 2278.3 | 2267.7 | 2240.8–2293.1 | 2293.1, 2267.7, 2272.2, 2240.8, 2241.5 |
| `m1a2` / high | 1421.3 | 1440.1 | 1411.8–1821.8 | 1411.8, 1821.8, 1456.2, 1416.8, 1440.1 |
| `t14_x` / high | 903.7 | 1280.3 | 1253.2–1298.2 | 1275.3, 1253.2, 1298.2, 1280.3, 1285.3 |
| `chieftain_mk10_x` / high | 705.7 | 970.6 | 961.9–975.9 | 970.6, 975.9, 975.2, 961.9, 964.1 |
| `amx40_x` / low | 1039.3 | 826.2 | 824.1–868.5 | 868.5, 825.6, 824.1, 826.2, 836.9 |
| `t72b3m_x` / low | 860.2 | 826.1 | 807.5–835.4 | 807.5, 808.3, 827.0, 835.4, 826.1 |
| `t90ms_x` / high | 662.0 | 559.0 | 554.3–567.6 | 567.6, 559.0, 555.5, 554.3, 566.6 |

Triangle count and construction time are different failure modes: the largest geometry is the conventional Abrams X family, while other builds lead synchronous CPU construction. Browser switch profiling must separately measure loading, construction, texture work, compilation, frame blocking and first useful paint before assigning user-visible latency to either cause.

## Return rollers and track configuration

The instrument forwards `KIT.buildRunningGear` unchanged and records the actual configuration passed to it before building. Native roller tire/disc instance arrays are then counted in the real scene. Tire and disc layers are two materials of one roller set; their counts are not added together as physical rollers.

No captured config: none; every measured ID has a captured running-gear configuration.

| Probable missing ID | Config roller stations per side | Scene roller objects, H / L | Carrier thickness m | Evidence limit |
|---|---:|---:|---:|---|
| `leo2a7v_x` | 0 | 0 / 0 | 0.074 | Native assembly absent; untagged merged stock not exhaustively ruled out |
| `leo2a4m_x` | 0 | 0 / 0 | 0.072 | Native assembly absent; untagged merged stock not exhaustively ruled out |
| `leo2a5_x` | 0 | 0 / 0 | 0.0389 | Native assembly absent; untagged merged stock not exhaustively ruled out |
| `merkava4_x` | 0 | 0 / 0 | 0.064 | Native assembly absent; untagged merged stock not exhaustively ruled out |
| `merkava3d_x` | 0 | 0 / 0 | 0.068 | Native assembly absent; untagged merged stock not exhaustively ruled out |
| `k2_x` | 0 | 0 / 0 | 0.066 | Native assembly absent; untagged merged stock not exhaustively ruled out |
| `kf51_x` | 0 | 0 / 0 | 0.07 | Native assembly absent; untagged merged stock not exhaustively ruled out |
| `t14_x` | 0 | 0 / 0 | 0.068 | Native assembly absent; untagged merged stock not exhaustively ruled out |
| `t62mv1_x` | 0 | 0 / 0 | 0.024 | Native assembly absent; untagged merged stock not exhaustively ruled out |
| `jpz_e100_x` | 0 | 0 / 0 | 0.023 | Native assembly absent; untagged merged stock not exhaustively ruled out |
| `leo2_revolution` | 0 | 0 / 0 | 0.072 | Native assembly absent; untagged merged stock not exhaustively ruled out |

`leo2_revolution_proto` has four configured return-roller stations per side and eight tire/eight disc instances; `leo2_revolution` has zero configured stations and no roller objects. All seven conventional Abrams X have two configured stations per side and four tire/four disc instances. All six older Challenger 2/3 IDs have four stations per side and eight tire/eight disc instances. These counts establish presence, not mechanical contact or historical correctness.

The seven Abrams X configure an 18 mm carrier with explicit 26 mm pad / 9 mm grouser / 12 mm web, plus their native guide. Original `m1a2` configures a 90 mm carrier. These parameters are not interchangeable definitions of complete visible track thickness: the pad/grouser/guide envelope must be compared in the follow-up. Carrier thickness alone does not justify scaling the course or all shoe stock.

## Material and primitive reuse evidence

The raw rows retain the top twelve visible objects with geometry multiplicity, material names, roles and adapter colors. Named gear roles distinguish wheel paint, tire rubber, track pad/steel and hardware; many armor/equipment merged buckets remain `unclassified` at this semantic layer. The nonrendering material adapter prevents any claim here that live camouflage, bags, optics or fabric colors are correct. The P0 finish review still requires rendered inspection and authored material ownership.

The census records per-build road-wheel/core/idler/sprocket override flags, track guide presence, and actual wheel/roller configuration. Object identity deduplication measures shared buffers within a built model; it does not prove content-identical buffers across separate tanks are cached or reusable. Shared primitive reuse is a follow-up design decision, not an implemented optimization.

## Full exact-ID baseline

Rows 1–43 are source-X (13 first-wave, 23 second-wave, seven conventional Abrams), followed by both Revolution records, six older Challenger 2/3 records, then three controls. H / L pairs use identical settings except quality. Times are the single initial sample; use the repeat table where available.

| Exact ID | Stored tris H / L | Visible tris H / L | Construction ms H / L | Visible meshes H / L | Visible materials H / L | Native roller stations/side |
|---|---:|---:|---:|---:|---:|---:|
| `leo2a7v_x` | 31,456 / 29,954 | 89,602 / 84,674 | 103.2 / 51.1 | 77 / 75 | 14 / 14 | 0 |
| `leo2a6m_x` | 30,898 / 29,252 | 84,504 / 78,424 | 64.4 / 48.6 | 51 / 49 | 14 / 14 | 4 |
| `leo2a4m_x` | 24,188 / 22,686 | 76,086 / 71,158 | 43.8 / 38.0 | 40 / 38 | 14 / 14 | 0 |
| `leo2a5_x` | 36,934 / 36,072 | 88,784 / 84,496 | 61.2 / 57.1 | 51 / 49 | 14 / 14 | 0 |
| `merkava4_x` | 27,582 / 26,736 | 76,486 / 71,430 | 34.4 / 31.5 | 42 / 40 | 14 / 14 | 0 |
| `merkava3d_x` | 24,826 / 23,200 | 74,466 / 68,630 | 40.0 / 35.4 | 47 / 45 | 14 / 14 | 0 |
| `k2_x` | 23,860 / 22,346 | 73,090 / 68,598 | 31.9 / 28.1 | 42 / 40 | 14 / 14 | 0 |
| `kf51_x` | 15,818 / 15,084 | 66,204 / 62,044 | 34.1 / 30.6 | 39 / 37 | 14 / 14 | 0 |
| `t90a_x` | 24,838 / 23,714 | 89,808 / 84,986 | 66.5 / 34.5 | 47 / 45 | 14 / 14 | 3 |
| `t90a_vladimir_x` | 25,156 / 24,136 | 71,258 / 66,540 | 37.9 / 34.3 | 42 / 40 | 14 / 14 | 3 |
| `t90m_x` | 30,684 / 29,664 | 93,194 / 88,476 | 384.4 / 377.4 | 49 / 47 | 14 / 14 | 3 |
| `t90sm_x` | 32,840 / 31,820 | 97,522 / 92,804 | 223.2 / 216.1 | 49 / 47 | 14 / 14 | 3 |
| `t14_x` | 29,432 / 27,868 | 75,214 / 70,224 | 903.7 / 891.1 | 41 / 39 | 14 / 14 | 0 |
| `leo2a6_x` | 27,632 / 26,754 | 93,938 / 88,626 | 35.8 / 32.7 | 41 / 39 | 14 / 14 | 4 |
| `k1a1_x` | 33,214 / 31,624 | 90,120 / 86,064 | 107.5 / 102.2 | 45 / 43 | 15 / 15 | 3 |
| `amx30_x` | 17,976 / 16,834 | 65,292 / 60,828 | 119.6 / 141.5 | 40 / 38 | 14 / 14 | 5 |
| `t62mv1_x` | 14,136 / 13,274 | 58,222 / 54,830 | 41.9 / 39.5 | 38 / 36 | 13 / 13 | 0 |
| `t72b_1987_x` | 25,520 / 24,514 | 71,262 / 66,558 | 185.1 / 175.7 | 40 / 38 | 13 / 13 | 3 |
| `t80u_x` | 13,848 / 12,842 | 59,690 / 54,986 | 19.8 / 17.8 | 42 / 40 | 13 / 13 | 3 |
| `leclerc_x` | 31,632 / 30,754 | 123,496 / 118,920 | 66.0 / 62.0 | 44 / 42 | 14 / 14 | 3 |
| `leclerc_classic_x` | 34,230 / 30,952 | 127,558 / 110,214 | 92.9 / 89.3 | 46 / 44 | 14 / 14 | 3 |
| `chieftain_mk10_x` | 36,366 / 34,592 | 102,856 / 94,056 | 705.7 / 696.4 | 40 / 38 | 14 / 14 | 3 |
| `t72b3_x` | 17,222 / 16,216 | 65,076 / 60,372 | 161.5 / 159.4 | 40 / 38 | 13 / 13 | 3 |
| `jpz_e100_x` | 31,162 / 30,596 | 97,226 / 94,858 | 42.4 / 38.3 | 31 / 29 | 13 / 13 | 0 |
| `type10_x` | 31,690 / 30,378 | 77,168 / 72,606 | 70.5 / 40.9 | 44 / 42 | 15 / 15 | 3 |
| `type90_x` | 20,512 / 19,192 | 68,814 / 62,652 | 24.7 / 20.9 | 40 / 38 | 14 / 14 | 3 |
| `amx40_x` | 31,986 / 31,108 | 98,914 / 93,762 | 631.0 / 1039.3 | 43 / 41 | 14 / 14 | 5 |
| `ariete_c1_x` | 31,334 / 29,560 | 90,110 / 77,918 | 506.4 / 495.8 | 40 / 38 | 14 / 14 | 3 |
| `strv122_x` | 70,998 / 70,232 | 148,972 / 145,228 | 368.6 / 374.1 | 42 / 40 | 14 / 14 | 4 |
| `t72b3m_x` | 26,716 / 25,710 | 75,986 / 71,282 | 856.8 / 860.2 | 40 / 38 | 13 / 13 | 3 |
| `challenger1_x` | 25,182 / 24,416 | 100,220 / 96,988 | 578.5 / 533.9 | 37 / 35 | 14 / 14 | 3 |
| `t72bu_x` | 17,638 / 16,632 | 66,176 / 61,472 | 325.5 / 347.5 | 40 / 38 | 13 / 13 | 3 |
| `chieftain5_x` | 30,760 / 28,684 | 85,026 / 75,620 | 267.0 / 292.0 | 41 / 39 | 14 / 14 | 3 |
| `t90_x` | 38,262 / 37,256 | 87,196 / 82,492 | 274.3 / 168.7 | 39 / 37 | 14 / 14 | 3 |
| `t90a_burlak_x` | 29,434 / 28,316 | 80,480 / 74,432 | 59.1 / 59.9 | 40 / 38 | 13 / 13 | 3 |
| `t90ms_x` | 24,972 / 23,966 | 73,906 / 69,202 | 662.0 / 558.1 | 41 / 39 | 14 / 14 | 3 |
| `m1a1_x` | 59,850 / 54,122 | 192,848 / 166,974 | 116.4 / 103.0 | 173 / 171 | 14 / 14 | 2 |
| `m1a1ha_x` | 59,850 / 54,122 | 192,848 / 166,974 | 124.9 / 122.5 | 173 / 171 | 14 / 14 | 2 |
| `m1a2_x` | 62,818 / 57,090 | 195,816 / 169,942 | 153.1 / 131.7 | 175 / 173 | 14 / 14 | 2 |
| `m1a2_tusk_x` | 78,774 / 71,934 | 211,772 / 184,786 | 251.0 / 163.4 | 194 / 192 | 14 / 14 | 2 |
| `m1a2_sepv2_x` | 96,130 / 87,578 | 229,128 / 200,430 | 204.2 / 219.1 | 194 / 192 | 14 / 14 | 2 |
| `m1a2_sepv3_x` | 67,688 / 61,008 | 200,686 / 173,860 | 153.9 / 109.7 | 175 / 173 | 14 / 14 | 2 |
| `ua_m1a1_x` | 59,850 / 54,122 | 192,848 / 166,974 | 130.0 / 109.4 | 173 / 171 | 14 / 14 | 2 |
| `leo2_revolution` | 20,984 / 19,470 | 71,382 / 66,442 | 276.8 / 257.5 | 40 / 38 | 14 / 14 | 0 |
| `leo2_revolution_proto` | 35,176 / 32,082 | 89,798 / 82,270 | 143.4 / 128.5 | 66 / 60 | 20 / 20 | 4 |
| `fv4034` | 45,088 / 34,218 | 123,478 / 87,234 | 240.7 / 182.2 | 62 / 55 | 17 / 17 | 4 |
| `challenger2` | 49,622 / 37,392 | 127,788 / 91,416 | 264.3 / 213.8 | 74 / 67 | 17 / 17 | 4 |
| `challenger2e` | 53,782 / 41,902 | 131,034 / 95,014 | 366.4 / 270.4 | 84 / 78 | 17 / 17 | 4 |
| `ua_challenger2` | 55,138 / 43,258 | 133,302 / 97,282 | 216.7 / 168.9 | 84 / 78 | 17 / 17 | 4 |
| `challenger_3` | 27,666 / 25,534 | 76,270 / 70,146 | 92.9 / 91.0 | 64 / 53 | 18 / 18 | 4 |
| `challenger_3x` | 38,938 / 36,802 | 87,538 / 81,414 | 2278.3 / 2244.8 | 65 / 56 | 19 / 19 | 4 |
| `m1a2` (control) | 44,602 / 41,428 | 96,996 / 89,232 | 1421.3 / 1326.6 | 65 / 61 | 19 / 19 | 2 |
| `abramsx` (control) | 39,896 / 36,270 | 90,804 / 82,586 | 339.8 / 308.4 | 81 / 74 | 19 / 19 | 2 |
| `leclerc` (control) | 28,662 / 26,708 | 96,784 / 91,170 | 88.2 / 82.7 | 48 / 46 | 16 / 16 | 5 |

## Artifacts and reproduction

- Raw accepted report: `.qa-dev/fleet-style-performance-20260907/census-lod.json` (108 rows, input manifest, object/material/config receipts, CPU samples).
- Retained instrument: `.qa-dev/fleet-style-performance-20260907/census.mjs`; summary generator: `summarize.mjs` in the same folder. These are ignored QA tools, not runtime imports.
- Preliminary artifacts: `pilot.json`, `census.json` in that folder; their pre-LOD visible totals are invalidated above.
- Prior shared integration evidence: `.qa-dev/integration/2026-09-07T18-13-22-111Z/audit-2026-09-07.md`.

Run from this integrated worktree; the capture wrapper owns the existing shared queue:

```sh
node --input-type=module -e 'import {runCapturedCommand} from "./tools/capture-command.mjs"; await runCapturedCommand(process.execPath,[".qa-dev/fleet-style-performance-20260907/census.mjs"]);'
node .qa-dev/fleet-style-performance-20260907/summarize.mjs
```

The first full run was repeated once because inspection of the existing audit exposed the missing LOD update. The accepted run and its five-sample follow-ups share one unchanged input digest. No tank geometry, materials, generated assets, source binaries, or playback/UI code was modified by the measurement.
