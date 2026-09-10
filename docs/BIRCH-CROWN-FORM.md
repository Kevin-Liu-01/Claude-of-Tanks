# Connected birch and aspen crowns

Baseline: `09a58b3d3`. This is a crown-structure checkpoint, following the
Autumn leaf-spray texture change. It does not complete the environment pass.

## Change and scope

The old builder placed secondary branches independently above a shortened
stem and scattered foliage independently of the branches. Long leaders and
forks extended beyond that cloud, producing disconnected clumps and bare
spears. The shared near builder now attaches secondary branches to actual
leader segments, seats forks on their parents, tapers and bounds the tips,
and distributes existing foliage cards along those same limbs. Snow lobes
follow the card anchors. There are no extra branches, cards or snow lobes.

The stem, basal flare and four root buttresses are unchanged. Textures,
materials, colors, UVs, flex values, far geometry, instance placement and
constructor random sequences are unchanged. New limb records exist only
during geometry construction; no retained metadata or frame-loop work was
added. This is not a claim of zero temporary allocation during construction.

The shared builder serves birch/aspen on Autumn, Winter, Whiteout, Railyard,
Foundry, Fjord, Reservoir, Airfield and Frontier. Garage groves also use it;
their current recipes pass the default palette, not the corresponding map's
snow palette. This change does not alter that existing behavior.

Collision/concealment/fall proxies come from species archetypes, not crown
vertices. Their records and placement inputs are unchanged, so no obstacle
manifest was regenerated. These proxies were not strict mesh bounds before
this change, and this checkpoint does not claim to make them so.

## Regression checks

`birchCrownForm.selftest.mjs` runs 144 paired builds: four palettes, three
variants and twelve seeds. It executes the complete production module and a
literal predecessor branch/card-position block. It checks actual cylinder
ring centers against independently rotated limb segments, parent attachment,
tip bounds and terminal foliage stations. It also checks exact stem/root
geometry, topology, UV/color/flex buffers and full constructor RNG sequences.

The predecessor produces 2,280 disconnected secondary roots and 1,256
over-height tips across this domain. Floating-branch and needle mutations
are rejected. Card-center proximity is not a proof that every alpha-visible
leaf touches a branch; native review remains necessary.

Passing checks: crown form, trunk quality, woody-root orientation, far seams,
vegetation resource ownership, tree-pool capacity, Autumn leaf sprays and
seasonal palette, TypeScript, strict complexity and public build. Changed-file
Doctor scans, including the new test, have no findings or suppressions.

The far-seam VM fixture also now binds the real `makeBirchFoliageTexture`
helper introduced by the preceding checkpoint. Its missing binding caused a
test-only ReferenceError; no assertions were relaxed.

## Native evidence

Evidence directory:
`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/birch-crown-native-r1.GKrpNe`.

`native.json` retains twelve original 1440×900 High screenshots using native
Chrome/ANGLE Metal: baseline and candidate Autumn/Winter, each near, reverse
lighting and wide. Candidate views replay the exact baseline cameras and
selected tree instances. Source/build hashes remain stable; the acquisition
completed without errors and released both previews, browsers and FIFO lease.

Root and an independent reviewer inspected all twelve images and accepted
the narrow attachment/spike correction, with no blocking art regression.
The Autumn crowns have a substantially
cleaner silhouette and visible supporting limbs instead of long spikes. The
Winter comparisons retain their sparse, snow-loaded identity with shorter
supported tips. Accepted as a connected-crown improvement. Sparse alpha-card
clumps, faceted snowy lobes and simplified branching remain visible at close
range; neither these trees nor the surrounding maps meet the final art target.

At all six matched views, protected foliage content/storage and aggregate
renderer residency match. Only the intended near birch/aspen position/normal
arrays and their derived bounds change. The 42 observed foliage-owner
submissions per frame and submitted triangles match throughout every
120-frame sample. Callback counts omit some shadow paths; the later
postprocess `renderer.info` snapshot is not a whole-frame draw count.

| View | Submission-wall median before / after | p95 before / after |
| --- | --- | --- |
| Autumn near | 2.80 / 2.70 ms | 3.10 / 3.10 ms |
| Autumn reverse | 2.70 / 2.70 ms | 3.00 / 3.00 ms |
| Autumn wide | 2.70 / 2.70 ms | 3.10 / 3.20 ms |
| Winter near | 2.80 / 2.40 ms | 3.20 / 2.80 ms |
| Winter reverse | 3.90 / 3.80 ms | 4.30 / 4.20 ms |
| Winter wide | 2.80 / 2.95 ms | 3.30 / 7.40 ms |

Median frame cadence remains 16.6–16.7 ms. The Winter-wide candidate has late
bursts (maximum 9.10 versus 3.60 ms), and several candidate cadence tails
increase by 1–1.7 ms. Their cause is unresolved, not discarded. Submission
wall includes scheduling and driver backpressure, not completed GPU time.
These short sequential samples show unchanged resource/submission budgets,
not a full no-performance-regression certificate. No physical mobile/Safari,
forced-GC heap, full nine-map art or whole-game FPS claim is made.

## Remaining environment work

Water/contact and railroad coal-pile corrections remain published. The next
broader composition candidate is a functional Foundry rail-service court:
reuse existing building/clutter donors and bounded worked-ground footprints,
preserve open access, then verify support, collision and native views. The
previous oversized apron and held compound drafts are not accepted results.
