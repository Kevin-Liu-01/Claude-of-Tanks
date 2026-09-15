# Ironworks masonry checkpoint

This is a narrow, image-reviewed pigment correction, not a whole-map makeover.
Only Foundry opts into the `ironworks` sourced-building palette. Its brick
tint changes from `[.94,.76,.62]` / desaturation `.18` to `[.80,.75,.70]` / `.34`.
Copper Mesa keeps the original `foundry` palette. Roof, plaster and timber
share the original policy objects; geometry, placement and gameplay do not change.

## Visual decision

Native comparison: frozen parent `9dac657de` versus candidate `0d2c071df`,
using collector `a5d12a2f9`. Evidence directory:

`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/foundry-masonry-native-r1.zFoj4g`

All six building/establishing/detail images were personally reviewed by the
primary agent and an independent reviewer. Near halls, chimney and yard walls
lose their conspicuous orange cast while retaining warm brick, pale mortar
and dark cavities. Distant factories recede slightly. This is a modest change;
the bright roof highlight, flat black trim and sparse industrial composition
remain. In the detail view, foreground road, poles and wreck stay visually
stable; right-edge masonry changes intentionally, so that PNG is not an
entirely immutable control.

All images use the same three saved poses. Actual observations before/after
each image show High, 1440×900, DPR1, scale1, trim0, SMAA-high+FSR1 and MSAA0.
No page errors or quality-observation issues. The harness explicitly records
`sameFrameProof:false`; static review is not a motion or frame-time certificate.

Both scene inventories: 201 nodes, 10,782 instances, 1,934,078 triangles,
170 geometries, 33 materials and 41 textures. Renderer residency is also equal:
669 geometries, 205 textures and 330 programs. These counts are not total heap
or GPU byte measurements.

## Tests and cost

First preparation batch, all seven stages passed: actual native Canvas/JPEG
masonry tests on desktop/mobile, sourced-texture tests, native TypeScript7,
changed-module quality and both ordinary private builds. Tests cover all30
maps/120 bucket policies, Copper Mesa/roof contamination, real async texture
swaps, disposal, sampler properties, per-world raster ownership and bounded
cache reuse. Native image evidence, not pixel arithmetic, owns the art decision.

Preparation receipt: `foundry-masonry-preparation-r1.Y4VnwR/prepare-status.json`
in the same environment-recovery archive. Baseline private index SHA256:
`59caa089f97cbf070854128eadd9699a8b4a16e69ab397015e0a74a6b6e7f04b`.
Candidate: `f6d703f16ce38587630921f5558d98118e75a5dccf45debe96b10b1a3f7cb1b9`.

One serial maintained full-frame comparison (75 samples ×3 repeats,
`--sync-gpu --gate`) passed existing gates without a retry:

| Measurement | Parent | Candidate |
|---|---:|---:|
| Synchronized render median | 3.1 ms | 3.2 ms |
| Render p95 | 3.5 ms | 3.5 ms |
| Complete-frame maximum draws | 544 | 544 |
| Complete-frame maximum triangles | 3,645,209 | 3,645,209 |

The +0.1ms median is retained, not described as zero change. The existing
gate allows 0.25ms median/0.5ms p95 measurement tolerance at these costs.
Actual High/M5 Max Metal policies match across setup and all repeat boundaries;
both builds, source fingerprints and tool pins stayed clean and unchanged.
Receipt: `foundry-masonry-frame-cost-r1.TZALes/pair-status.json`.
Intervals are not live-game FPS, and this pair does not certify iPad Safari,
all-map performance, construction time or total memory. No new GPU resources,
shader operations or frame updater were introduced; the additional small
static palette/stone policy objects are real CPU storage, not literally free.

## Current-main integration

The integration batch on `16269dc30` passed all nine commands: desktop/mobile
masonry, sourced textures, all30-map quality, native TypeScript7, core-unused,
explicit changed-module quality, scoped Doctor and ordinary public build.
The five changed source/test/registry hashes stayed identical throughout.
This preserves the separately published single-bake nighttime correction.
Receipt: `foundry-masonry-main-check.SS5WrR/report.json`. Public index SHA256:
`21ce63532176eadd7f44aa36a51bc2f887f10db058c3b0ec98959b10227ea69e`.
The initial Doctor scan covered three tracked files with no issues. A final
staged-file scan includes both new tests/fixtures: five files, score100, no
issues (`final-doctor.json` beside the integration report). The explicit
module-quality check also included the new tests and frozen fixture.

## Roof reflection follow-up

Candidate `8abe1bcb2` separately reduces the broad white highlight on Ironworks'
tile roofs. Only Foundry's existing material roughness scalar changes, from1
to1.3: Three multiplies this by the surface texture's green channel before
clamping physical roughness. Albedo, normal and surface pixels remain exact;
Copper Mesa and the other28 maps retain their old material values. No extra
texture, cache, shader variant or frame updater is introduced.

The real material/uniform/clone/serialization test covers all30 maps, shared
texture ownership and negative controls. Desktop/mobile native JPEG tests
verify the actual surface response and dependency shader ordering. Native TS7
and core-unused pass. Existing explicit module-quality failures remain limited
to the unchanged `addWallRun` and `createPropsAsync` functions; the new helper
does not introduce a violating function. This is not a clean global lint claim.

All six matched native images were personally reviewed by the primary agent
and an independent reviewer. The building view loses the white glare while
retaining warm terracotta and tile relief; establishing/detail controls remain
stable. Repetitive roofs and flat dark fixtures still need separate art work.
Evidence: `foundry-roof-native-r1.oSiGrN` in the environment-recovery archive
above. Same actual High/M5 Max, 1440×900 DPR1 policies; no page errors. Static
captures still explicitly record `sameFrameProof:false`.

One serial 75-sample ×3 synchronized A/B passed unchanged gates without a retry
(`foundry-roof-frame-cost-r1.3nnLjA/pair-status.json`). Render median/p95 remain
3.1/3.4ms; post-render intervals are21.0ms median, p95 22.2→22.0ms. Maximum
draws544 and triangles3,645,209, scene inventory and renderer residency are
identical. These intervals are not live-game FPS or an all-map/mobile/memory
certificate. Sources and both private builds stayed frozen throughout.

The final three-file Doctor scan reports49/100, not a pass: its new `no-eval`
finding is a high-confidence false positive for a Node-only test that reads
the fixed local `props.ts` file and executes its extracted constructor—no
user/network input. Its other warning is the unchanged pole lookup immediately
after synchronous `addBakedInstance` creates that entry. Neither finding is
suppressed or hidden. Receipt: `foundry-roof-main-check.88o8cx/doctor.log`.
The subsequent native TS7 and ordinary public build both pass, with all three
source/test/registry hashes unchanged (`foundry-roof-public-build.gJzpfZ`).
