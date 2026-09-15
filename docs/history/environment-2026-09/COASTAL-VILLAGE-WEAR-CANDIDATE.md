# Coastal village-wear candidate

This is a native-image-reviewed, scoped village-ground improvement. Complete
performance/memory acceptance is separate. It starts from
`c97e20fd249ac35351a35a3549c63858488c0ab3` and leaves the earlier
accepted worn-sand source/captures untouched.

## Intent and scope

Only Coastal and Saltwind opt into `terrain.villageWear: 'activity-patches'`.
The existing A-channel polygon stamper replaces blanket village wear on dry,
off-road pixels. All original R/G/B bytes and the complete RGBA of road/water
pixels remain exact. Beach sand, roads, ruts, village grading, physical terrain,
obstacles and vegetation placement are not changed.

Each map has four authored patches, located from its actual roads and shipped
seed1337 scene records rather than random shape placement:

- Coastal: market junction `(163.766,95.656)`, coast-road fishery/boatshed
  frontages, the `z≈-52` crofts, and cottages immediately north of the market.
- Saltwind: market junction `(-190,-36)`, southern cross-street frontages,
  stair-road crofts, and the dry approach from landing 1 `(-283.537,-21.886)`
  past its beached boat `(-264.885,-21.707)`.

Actual desktop off-road nonzero wear coverage changes from 62,388 to 12,992 m²
on Coastal and 75,804 to 15,840 m² on Saltwind. Mobile coverage changes from
59,312 to 11,648 m² and 71,744 to 14,096 m² respectively. These are raster-area
measurements, not a claim that every worn pixel corresponds to a navigable yard.

Known visual limitation: the original village grass-suppression footprint is
deliberately unchanged. Newly green gaps may therefore have fewer 3D grass
tufts than open pasture. No settlement or collision relocation is included.

## Resource and work boundaries

No shader, uniform, texture, material, geometry, draw-call or steady-frame owner
is added. The existing RGBA mask remains 1,048,576 bytes at desktop512 and
262,144 bytes at mobile256 with identical sampling/mipmap policy. The complete
splat source remains SHA256
`4e3118087bf09d46b113a31a85792608723549d0e11400359a2febd0655a9498`.
Review-only parent source receipts: createHeightField body
`e5c98c158e1419794e04b11638cb850cbf60580921db07ff585703c7979d93af`,
vegetation.ts `0aad8b3e66da9257761b63ca3782a5420cb02c67a930e6f2ef67cf5d480bf28a`,
props.ts `48a3e6e9b31941a929e201266847886bbbfebaf291bbdb51dc7c2d8a9102393c`.
These broad source hashes are evidence for this isolated diff, not permanent
executable village-wear gates. A follow-up removed those unrelated locks from
the new test; it retains the actual full-mask, scope, resource-policy and
sampled gameplay-input assertions.

Authoring data is added: eight patch objects and 67 coordinate pairs in the two
map configurations, plus their existing resolved-layout references. This is
not zero added JavaScript memory. No additional retained raster or scratch
array is created. Existing bounded polygon stamping visits at most 7,996/2,162
bounding-box pixels on Coastal desktop/mobile and 10,384/2,766 on Saltwind;
the conservative maximum segment checks are 62,416/16,863 and 116,309/30,735.
Road/water rejection reduces actual work. A scoped mask-cost comparison is
recorded below; complete construction time and retained heap are not certified.

## Verification

`villageWear.selftest.mjs` passes all 28 untouched maps' full production RGBA
outputs at both real raster tiers, plus 12 Coastal/Saltwind seed/tier cases.
The latter preserve protected channels, texture policy, RNG draw counts/tails,
and sampled height/normal/traction/water/road/no-vegetation/village-mask inputs.
Repeated bakes are exact. Independent actual market/frontage/boat coordinates
retain wear. Old blanket coverage, empty coverage, misplaced patches, a corrupt
road byte and unauthorized map opt-ins fail negative controls.

The immutable reference is clean `2c9d47d55637240d9ce0b6ee108f54c955c8aab8`,
whose complete `src/world` tree is identical to the requested parent:
`d915140ef50ccb969d876e88beac875e169355e7`. Its original pilot masks and all28
aggregate receipts are embedded in the test; execution requires no Git history.
Historical shoreline/palette projections remove only these later opt-ins;
original RGBA/config receipts are not replaced.

Also passed: terrainProjection, terrainSandCoverage, terrainWornDirt,
TypeScript 7.0.2 (`node_modules/typescript/bin/tsc`), strict changed test/helper
quality (38 functions, zero violations), and `git diff --check`.

Preserved failures: shoreDirtMask and workedGroundMask reach the same final
obsolete whole-shader lock on both frozen parent-equivalent source and this
candidate (`d470ff…` expected versus current `4e3118…`). Their preceding mask
assertions pass; neither suite is reported as a passing test. An initial
reference acquisition mislabeled desktop512 as mobile; it is retained but
excluded from evidence. The corrected run explicitly verifies actual256.
The package's missing local `@typescript/native` alias also produced an initial
module-not-found exit; the existing TypeScript 7.0.2 installation then passed.

Raw receipts/logs are under
`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/coastal-village-wear-cpu-r1.Q2Zvem/`.
Corrected frozen receipt SHA256:
`28be13bde665155b9a30b9850446151ad70bea2064e05a8a4d4fa813e9b03937`.
New mask-test log SHA256:
`e985d063c28bf1f5043bec55a1368f6ce219f7f90a1b1db662fbcf32e0e500fc`.

## Native visual acceptance

Clean candidate9eb055905f35dd6fe71b58af89b730bb1aa8802e passed the public build,
then one maintained native Coastal/Saltwind capture with exact baseline poses.
Both the independent reviewer and primary agent viewed all four original
before/after PNGs. Coastal now reads as pasture around fishery/cottage frontages;
Saltwind retains market soil while its empty lots and town edges return to green.
The existing sparse village grass and raised road embankments remain separate.

Candidate index SHA256 is
`828b3b5df3fc6b89b801cc234543f3a6a04d7ce0486060bfd9be868b08506a56`.
The native report, original images, comparison script and receipt are in
`coastal-village-wear-visual-r1` under the external evidence directory above.
Comparison SHA256:
`0ee2458ad5ca32c65ddf9ba8977a99ca33bd700a75b189fa3eb9e73a45f4ff0c`.
The baseline is the frozen2c9d47d55 capture in `coastal-worn-ground-r1`.

The two exact camera poses, acquisition state, complete material/texture
inventories and scene/subtree scalar counts match. Browser errors are empty.
Coastal retains172 geometries/32 materials/40 textures/1,342,864 scene triangles;
Saltwind166/33/42/1,366,623. Chrome151.0.7922.47, ANGLE Metal Apple M5 Max,
desktop1440×900 DPR1; no physical iPad or whole-browser heap claim follows.
Read-only changed-scope React Doctor also passed with no findings.

The scoped runtime and test corrections were integrated as85f93d809/853c6bc6b.
The complete mask and all-biome resource tests plus TypeScript7 pass again on
the integration branch containing the already-published grass-padding fix.

## Scoped mask-generation cost

The one declared FIFO CPU acquisition used the actual current mask function,
policy off/on, with the same preconstructed field and seeded noise inputs.
Two warmup rounds precede eight paired AB/BA observations per map/tier. All
80 outputs (including warmups) match the authenticated full mask hashes and
are disposed. Every one of the 32 paired wall deltas favors the new policy:

| Map/tier | Previous mean wall | Activity mean wall | Change |
|---|---:|---:|---:|
| Coastal512 | 26.830 ms | 24.988 ms | −6.86% |
| Saltwind512 | 19.265 ms | 17.494 ms | −9.19% |
| Coastal256 | 5.428 ms | 5.109 ms | −5.87% |
| Saltwind256 | 4.907 ms | 4.517 ms | −7.93% |

Mean CPU time also decreases in all four cases; two individual desktop CPU
deltas are positive and remain in the raw receipt. The script and all samples
are external `coastal-village-wear-mask-cost-r1.mjs/.json` files. This measures
the same-function policy change, not a rebuilt historical binary, total map
construction, frame time or whole-browser heap. No repeat/tuning round ran.
