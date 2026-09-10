# Autumn birch/aspen leaf sprays

Baseline `c4b3c14ac`; runtime checkpoint `99ea0b24f`. Only Autumn opts into
leaf-bearing birch/aspen atlases. Other maps retain the existing bare-twig
painter. The detailed Garage grove uses the same palette selector.

Eleven irregular branch sprays carry attached leaves with open gaps. They
replace winter twig scratches and translucent circular haze, using the same
256×256 straight-alpha RGBA storage, texture owner, mip policy, alpha cutoff,
material and shader. Near/far geometry, wind, placements, collision and
concealment records are unchanged. No new frame-loop work is introduced.

## Verification

`autumnLeafSprays.selftest.mjs` executes the actual species registry, Canvas
painters, near/far/Garage builders and material constructors. It covers exact
twig output and painter RNG for 29 opt-out maps, 12 seeded target raster pairs,
20 near/far geometry pairs, two Garage species and existing owner counts.
Geometry RNG and every attribute/index remain exact. Painter RNG intentionally
differs and is independently seeded; it does not drive tree placement.

The old seasonal-palette test still checks byte-exact alpha and RNG for its
pigment-only comparison. It removes the new leaf flag from fixture copies;
the leaf test separately covers the intentional silhouette change.

Tested cutoff coverage is 9.93–14.65% through box-averaged 16px samples, inside
a 6–18% regression envelope. Empty, solid, near-solid-with-holes, old-twig
and moved-geometry mutations fail. These CPU samples are not GPU mip readbacks.
At the production atlas seeds, mean alpha decreases from .123 to .113 for
birch and .120 to .105 for aspen; cutoff coverage can increase locally.

Eight focused tests, native TypeScript 7, strict complexity, changed-scope
Doctor and public build pass. The strengthened density-envelope test and
Doctor were repeated after its test-only change. No scanner suppression.

## Native art and cost evidence

Evidence root: `/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/`.
`autumn-leaf-sprays-r1.CCGXNj/native.json` records six native Metal 1440×900
High screenshots at three matched cameras: near, reverse lighting, and wide.
Root and an independent reviewer inspected all six. Recognizable leaves
replace the scribbly crowns without new rectangular edges; accepted as a
leaf-identity improvement, not a complete tree redesign. Long bare spear-like
leaders and disconnected crown clumps remain visible and need a later pass.

Only the two authenticated atlas RGBA/alpha hashes differ. Observed foliage
stays at 42 geometries, 11 materials, 7 textures, 42 instance owners,
6,243,912 attribute/instance-view bytes and 8,865,352 typed backing bytes.
Scene renderer counts match per camera: 669/674/677 geometries, 211 textures,
209 programs. All views retain 42 observed foliage submissions per frame and
the same submitted triangles. These callbacks exclude shadow paths that
bypass them; the postprocess counter is not a complete-frame draw count.

The first sequential sample has slower candidate submission-wall medians
(near 2.9→4.4ms, reverse 4.3→6.6ms, wide 3.4→7.7ms). These include driver and
scheduling time, not completed GPU time. A warmed candidate/baseline/baseline/
candidate repeat (`autumn-leaf-cost-r1.TqxMHb`) returned 6.8/3.1/6.4/6.4ms
medians. The unchanged baseline itself more than doubled, so cross-context
submission wall is unstable here. All four delivered-frame medians remain
16.7ms (p95 17.0–17.5ms). This does not prove the atlas is free to render.

A final diagnostic swapped only the two observed baseline/candidate RGBA
contents in the same candidate scene, retaining the existing ImageData,
Texture, Material, geometry and instance owners. Each balanced block excluded
120 warm-up frames after upload before observing 120 normal renders, then
restored the production candidate pixels. This deliberately controlled
override is separate from unmodified-production art/ownership evidence.

The first pixel-swap attempt (`autumn-leaf-pixel-cost-r1.6q2Yaf`) stopped at
the browser command's argument-size guard before any cost block. It retained
the source-pinned baseline and candidate RGBA captures and closed its browser
and preview. The second attempt (`autumn-leaf-pixel-cost-r2.vPV1xs`) used stdin
for lossless pixel transfer, authenticated both atlas byte hashes and completed
without errors. Source/build pins stayed unchanged, candidate pixels and full
inventory were restored, and its browser and preview closed.

The eight same-context blocks used order C/B/B/C/B/C/C/B at the same near
camera. Interpret four neighboring balanced pairs, not 960 independent runs:

| Pair | C / B submission median (ms) | C / B submission p95 (ms) | C / B frame-interval p95 (ms) |
| --- | --- | --- | --- |
| 1 | 2.8 / 2.9 | 3.0 / 3.2 | 17.5 / 17.6 |
| 2 | 3.05 / 3.0 | 7.3 / 3.9 | 19.5 / 17.5 |
| 3 | 3.0 / 2.9 | 4.2 / 3.1 | 17.4 / 17.4 |
| 4 | 7.45 / 7.7 | 8.2 / 8.4 | 17.4 / 17.0 |

The paired median differences are −0.10/+0.05/+0.10/−0.25ms, without a consistent
candidate penalty; the late slowdown persists after switching back to baseline.
Candidate pair 2 still has a worse tail. That is retained as uncertainty, not
discarded or presented as a zero-cost guarantee. This narrow texture change
has accepted art and unchanged storage/draw budgets; the sampled evidence
does not establish a repeatable median regression attributable to its pixels.

No physical mobile/Safari, forced-GC heap, whole-game FPS or global
no-performance-regression certificate is claimed by this packet.

## Integration

Preserved newer remote UI/performance commits through `85aa932da` in an isolated
merge. The shared test-suite manifest merged without conflicts; foliage runtime
and map configuration did not overlap. `autumn-leaf-integration-r1.3x6Zdd`
records passing leaf, seasonal-palette and new shot-schematic self-tests,
TypeScript 7 and a fresh public build on the integrated tree. The art and
pixel-cost captures above precede this unrelated UI merge; they were not
recaptured or relabeled as post-merge measurements.
