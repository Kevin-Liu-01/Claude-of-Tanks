# Overlapping bush sprays — incremental density improvement

Isolated from exact `29217600af0e2615549529cb93dc0f3384ef0265` (accepted Autumn
palette; no held normal or rejected shrub geometry). Only the bush constructor
and its private writer/interface change runtime. `foliageCard`, every tree
builder, placement, materials, shaders, textures and world updates are untouched.

The existing 16 random nodes each emit two smaller flat sprays rather than one
bowed card. Widths are .74/.68 times the original .72–1.27m random width, both
with .8 aspect. Each pair shares a branch anchor strictly inside both rectangles;
local offsets (.14,.05) and (−.12,−.08) of each spray's width prevent coincident
centers. Yaw separation is .90–1.20 radians, pitch stays within ±.40 radians and
roll within ±.60. The sprays are noncoplanar, predominantly upright—not radial
tangent plates, a hollow shell or repeated horizontal tiers.

Branch anchors keep the original random direction/radius distribution, XZ scale
.96 and vertical scale .42 around y=.55 with a small node-dependent height
stagger. Per-seed bounds are recorded by the focused test. Four native views
retain grounded, coherent cover without an unacceptable silhouette collapse;
this does not certify equal alpha coverage or concealment alignment. Existing
placement and gameplay concealment records remain unchanged.

The writer computes normals from actual Float32 positions relative to the bush
center: scale vertical displacement by .65, normalize, add .55 to Y with minimum
.28, normalize again. This yields finite unit normals with normalized Y at least
approximately .269, including the old downward-pole case. A mild vertex-height
value gradient, lifted interior shade floor and reduced card saturation replace
the compounded dark center; visual success is not inferred from this math.

## Exact construction budgets; not measured performance

- 32 flat sprays ×2 triangles =64 triangles,192 nonindexed vertices: same as
  16 bowed cards ×4 triangles. Same position/normal/UV/color/flex layouts:
  9216 attribute bytes per prototype, two production buckets unchanged.
- One BufferGeometry and five final typed arrays/BufferAttributes. No temporary
  PlaneGeometry, converted clones, parts array or merge in this constructor.
- Exactly11 RNG draws per node in the prior order,176 total. Both output sprays
  derive from those draws; no new placement RNG, map queries or frame work.
- UV content intentionally changes:32 complete atlas rectangles instead of16
  twice-subdivided rectangles. Flex stays .22. Pair plane area is1.01 times the
  predecessor's flat-plane area (before its bow); changed overlap/alpha coverage
  still requires actual rendering review, not a same-triangle performance claim.

## Validation and native art decision — 2026-09-09

Evidence root: `/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/`.
Runtime checkpoint: `19f7a39523b5ff9d7f96eb0049809a2cbc605396`; public index:
`5e8690a59258c5d0b668e75e7d17de99f0562f88589b7578ed73692b25bf2103`.

- `bush-spray-checks-r1.kDYvfU` retains two failures: cognitive complexity27
  and an obsolete negative control whose indexed-merge mutation no longer
  affected the new direct-buffer bush constructor. No build ran on that failure.
- `bush-spray-checks-r2.w0c7X8` passes all eight focused tests, TS7, Doctor,
  strict changed-function metrics and public build. The two writes are explicitly
  unrolled (cognitive4). The index mutation now exercises actual still-merged
  broadleaf cards and verifies equal expanded geometry/RNG before rejecting
  changed indexed storage; the negative assertion was not removed.
  Doctor reports zero errors and six warnings on unchanged lines of the existing
  far-seams test (lookup/JSON-clone checks); those source lines match292176 exactly.
  There are no runtime or new-test diagnostics. This is not a warning-free scan.
- The bush test builds both production seeds with all30 map palettes; checks
  finite unit positive-up normals, complete UVs, nondegenerate flat sprays,
  exact176-draw RNG tails, storage/construction counts, and unchanged sampled
  tree geometry. Per-seed bounds are measurements, not a coverage guarantee.
- Actual constructor/disposal CPU benchmark:12 ABBA blocks of400 alternating
  production-seed bushes, forced GC between blocks. R2 medians47.82ms before,
  7.71ms after (0.161 ratio), identical9,216 bytes/build. This is warm prototype
  construction only; the world builds two prototypes, not400 every frame.

`bush-overlapping-sprays-native-r1.hrIaeL` completed eight images in105.741s.
Both use native Apple M5 Max/Metal, High1440×900/DPR1/trim0/scale1, identical
unrounded cameras, existing day/wind staging and normal post frames. All source,
build and camera pins remain stable; no console/GL/shader/context errors.
Owned browsers/previews closed and the capture FIFO released.

Both root and an independent reviewer inspected all eight originals and accept
only an incremental density/card-fragmentation improvement:

- Near: continuous grounded front mass substantially reduces the open-bowl
  cavity; dark upright rear cards remain.
- Establishing: coherent low clumps preserve visual cover and avoid the earlier
  rejected stacked-disc shape. Some profiles remain boxy/repetitive.
- Variant0: fuller joined volume; dark notch and upright fins remain conspicuous.
- Opposite: grounded width retained with fewer projecting scraps, but the dark
  back and pale exposed patch still reveal cards.

This is not natural-bush or whole-map art completion. Do not describe the dark
backfaces as fixed. Earlier rejected tangent/branchlet receipts remain intact.

## Resource and timing scope

All four A/B renderer-residency and local ownership checks pass. Global geometry
counts are670/675/677/681 by pose, with211 textures and209 programs on both sides.
Actual foliage retains42 geometries/instance owners,11 materials,7 textures,
6,243,912 geometry/instance view bytes and8,865,352 observed typed backing bytes.
Only bush40/41 position/normal/color/UV content and derived bounds differ; all
tree data, textures, materials, transforms, grass and crops remain exact.

The120-normal-frame observer records42 foliage submissions per frame on both
sides and identical per-pose foliage triangle totals. Post-submission median/p95
milliseconds before→after: near2.5/4.6→2.3/3.1, establishing2.6/4.4→2.5/3.4,
variant0 2.6/4.4→2.5/3.4, opposite2.7/4.4→2.8/4.5. Median frame interval is16.7ms
throughout. These are single-order desktop submission observations, not completed
GPU timing, total retained heap, lifecycle leakage, or physical tablet/mobile
performance certification. No threshold or quality setting was relaxed.
