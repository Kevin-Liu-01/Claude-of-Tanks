# Coastal village-wear candidate

This is an unreviewed visual candidate, not a native-art or performance acceptance.
It starts from `c97e20fd249ac35351a35a3549c63858488c0ab3` and leaves the earlier
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

Authoring data is added: eight patch objects and 67 coordinate pairs in the two
map configurations, plus their existing resolved-layout references. This is
not zero added JavaScript memory. No additional retained raster or scratch
array is created. Existing bounded polygon stamping visits at most 7,996/2,162
bounding-box pixels on Coastal desktop/mobile and 10,384/2,766 on Saltwind;
the conservative maximum segment checks are 62,416/16,863 and 116,309/30,735.
Road/water rejection reduces actual work. No construction timing or retained
heap comparison has been measured for this candidate.

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

No build, native Canvas/browser capture, timing acceptance, push, or visual
approval has occurred for this candidate.
