# Environment recovery and acceptance ledger

## Recovery baseline — 2026-09-07

The previous `/private/tmp/cot-environment-*` worktree directories and their
recent native captures were missing on inspection. The cause is unknown.
Integration commit `c5796838857b52a774eeb4ceebf7ece178c908ba` and release commit
`2f82b3a3646bdfb1693a18f05ceb4b213209f781` survive in Git. Their worktree indexes
match HEAD; the later uncommitted V57–V59 refinements were not recovered from
the scoped worktree metadata, stashes or persistent output locations.

Work now lives at
`/Users/kevinliu/.codex/worktrees/cot-environment-recovery-20260907`, branch
`codex/environment-recovery-20260907`. The unchanged checkpoint is separately
checked out at `/Users/kevinliu/.codex/worktrees/cot-environment-baseline-20260907`.
The shared dirty main checkout is not an integration target.

Current integration now lives at
`/Users/kevinliu/.codex/worktrees/cot-environment-integration-20260907`, branch
`codex/environment-integration-20260907`. Merge `4bffcad8c` preserves current
production `247cb2ef5` (including its 23 newer fleet variants and entry fixes)
alongside the recovered 30-map environment. Typecheck, product counts, SEO,
network presentation tests and the public build passed at `13b9497dd`.
Map refinement continues in the recovery checkout and is cherry-picked only
after its focused checks; neither checkout is release-approved yet.

The preceding goal turn was **progress**: the recovery and shipping audits
established the actual surviving source and changed the next action. This
turn restores a persistent candidate and rebuilds missing improvements.

## Scope remains open

- Improve terrain, mountains, horizons, sky presentation, close detail and
  inhabited ambient/environment details across the existing maps.
- Complete ten distinct new maps: Polders, Copper Mesa, Airfield, Oasis,
  Whiteout, Orchard, Longleaf, Mangrove, Saltwind and Reservoir.
- Use natural, non-circular water planforms shared by rendering, minimaps,
  surface interaction and terrain support.
- Preserve gameplay and authoritative collision/navigation correctness.
- Prove no performance or memory regression using matched native scenarios,
  lifecycle/eviction tests, constrained-tier tests and unchanged quality gates.
- Keep randomized day/night; do not reintroduce rain, snow or dynamic weather.
- Complete actual nighttime tank headlights and appropriate building/fixture
  lights. Keep visible emission separate from the bounded light-casting pool;
  preserve spotting, destruction, Garage restoration and warm-up ownership.
- Review fresh native images, camera motion and transitions before release;
  integrate with current origin/main, verify and push only accepted changes.

None of those broad acceptance requirements is certified by this recovery.
Historical prose or missing reports must not be treated as current proof.

## Fresh baseline evidence

The checkpoint public build passed on 2026-09-07. A maintained staged capture
completed for Polders and Frosthollow at 1440×900 desktop quality:

`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/baseline-maps-r1/report.json`

Observed backend: native ANGLE Metal / Apple M5 Max; no page errors. Polders
overhead visibly retains repeated L/T-shaped lobed water cells. Frosthollow
renders, but the overall naturalness/detail bar remains subject to review.

This older map-audit acquisition pins dynamic scale to 1 and disables browser
frame/vsync throttling. Its timing samples are **not** ordinary gameplay
performance acceptance. Do not use them to waive the normal live-motion,
resource-residency or constrained-device gates. Screenshot output is persisted
outside temporary directories. The owned browser/server exited after capture.

## Rebuilt improvements (candidate, not release)

### Tree instance capacity

Construction counts each species once and allocates its existing near/far pools
at that capacity rather than allocating every pool for the entire population.
The six-case CPU oracle checks active transforms, colors, fades, slot/upload
ranges, RNG, collision/spotting records and unchanged object ownership.

| Map | Previous instance arrays | Candidate arrays | Saved |
| --- | ---: | ---: | ---: |
| Verdant | 20,465,760 B | 5,116,440 B | 15,349,320 B |
| Polders | 9,172,800 B | 3,057,600 B | 6,115,200 B |
| Mangrove | 11,715,480 B | 3,905,160 B | 7,810,320 B |

These are actual CPU typed-array capacities, not total heap or measured driver
memory. Desktop/mobile placement cases passed. Existing authored-tree,
clearance (90 structure envelopes) and all-30-library disposal checks passed.
Native visual, upload and timing parity remain required.

### Night lighting

The standalone candidate owner has at most two unshadowed SpotLights and one
PointLight. Dedicated semantic materials may glow without allocating one light
per fixture. Its tests cover source transforms, death/visibility admission,
fixed pool identity and exact restoration. World registration uses existing
curtained panes and the real instanced streetlamp lens transform; destroyed
streetlamps release the point-light slot. Ruined-city panes remain dark.

Application lifecycle integration now passes full typecheck and focused tests:
prepare after ally/authority visual construction, before warm compilation;
explicit late-visual registration; no per-frame scene scan; strict spotting and
death admission; reset on Garage return. This is checkpointed at `0ddf6ec8a`.
`c4351617a` adds actual authored lens masks. Eight high/low sample builds have
identical geometry/material-order/transform digests against the recovered
checkpoint. T-90A X headlights remain an identified unregistered exception;
a complete playable-fleet census is underway.

`103fb14a2` adds streetlamp lens masks/activity and initially registered the
curtain material as occupied windows. Native review subsequently found that
the curtain bucket also contains some fabric and beacon geometry. That blanket
registration is **not accepted**; semantic per-pane masking is being added.
The late streetlamp material appends to the original live retained-material
collection; replacing that collection would lose shader-only/unused resource
ownership. Regression coverage verifies all 17 materials and 34 textures
release together when a streetlamp family is present.

The native production day/night probe at
`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/night-lights-r1`
completed six map/tier cases and 25 screenshots without page, GL, shader or
cleanup errors. Both observed contexts use native Apple M5 Max/ANGLE Metal.
Its property/lifecycle gates pass, including active-night-to-Garage restoration.
**Visual acceptance fails:** M1A1 front lenses still look dark, night is too
dim, and the fallback window closeup is inside roof geometry. Those defects
remain open despite the machine-readable probe's `passed: true`. The probe
suspends adaptivity for staged comparisons, so it is not performance evidence.
Owned Chrome/preview cleanup succeeded and the shared capture FIFO was released.

`9877e9331` corrects the M1A1/Tejas-family registration: the old helper lenses
were behind three newer hull surfaces. The existing exposed bow-pod faces now
own illumination instead. Six variants at high/low geometry pass the actual
forward-occlusion test, and eighteen current/baseline builds preserve all shape,
normal, UV, color, index, instance-matrix and scene-transform bytes. Mask storage
for the larger existing dark bucket is 25.9–33.3 KB per Tejas vehicle; there are
no new meshes, materials or draws. Native verification remains required.

`3b38d65cd` replaces blanket curtain emission with authored outward pane faces
and red beacon bulbs. Three-seed coverage identifies 190 pane faces, twelve
bulbs and six unlit cloth panels; original geometry/RNG receipts remain intact.
The diagnostic camera now ray-checks a real pane instead of guessing from a
merged material bucket. Structural checks explicitly do not certify visual
quality. `d3fcc3710` separately lifts night ambient/fill/vehicle readability
without new lights, geometry, passes or daytime changes. The next fresh native
run must review these corrections together.

The fresh `night-lights-r2` native run used that integrated public build.
Its three completed Verdant images show improved tank readability, one clearly
glowing exposed headlight and a soft road-light pool. The opposite lens is not
proved visible from this angle. The run then **failed** because no unobstructed
authored window passed the closeup check. There are no page/console/cleanup
errors, but it never reached the streetlamp, Shtora or tablet captures. Preserve
the failed report; do not count this as a complete visual pass. A bounded
same-build pane/first-occluder census is being added before changing geometry.

### Fresh phase-resource baseline

The unchanged `c57968388` public build completed the maintained native
Garage → fixed-roster Verdant battle → Garage probe:

`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/baseline-phase-r1.json`

No browser, console or resource errors occurred. Active battle main-thread
task cost was 7.353 ms per presented frame; returned Garage used 0.007 core
equivalent while its animation/shadow work slept. The baseline nevertheless
**fails eleven existing resource ceilings**, including Garage triangles,
battle scene/geometric/material/texture counts and returned geometry counts.
Those raw failures are retained; the thresholds were not relaxed. This is a
failed baseline, not a new-lighting performance pass. A same-procedure candidate
run is still required. The owned browser/preview and FIFO wrapper exited.

The integrated `candidate-phase-r1.json` completed the same procedure without
browser/console/resource errors. Active managed heap is 273.4 MB versus 296 MB
in the baseline; returned Garage is 188.4 MB versus 201 MB. Active scene objects
fell from 1,486 to 1,356 and geometry/material/texture residency also fell. This
does **not** pass the gate: eleven existing ceilings remain exceeded, and the
new active-battle CPU sample is 17.465 ms/render (46.44 rendered FPS), exceeding
the unchanged 11.5 ms/render ceiling and the baseline's 7.353 ms/render. A
profile and controlled repeat are required. New checkpoint-only environment,
native-GPU and effective-quality receipts will prevent unrecorded atmosphere
or adaptive-quality differences from being mistaken for matched comparisons.

### Shoreline candidate and fresh visual review

`37271a90b` replaces Polders' 27 overlapping cells with five shared 16-station
contours (29,061 m² total), re-seats shoreline trees, and shifts two unsafe
deployment pads 18m east. Dense pad/approach checks pass for three seeds.
Water-only road elevations remain exact; existing spawn flattening changes
some nearby old road heights by up to 0.925m. Legacy contour comparisons pass
23,865 samples. Mangrove's southern willow row now follows the actual bank.

Matched native Polders/Frosthollow captures live at
`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/candidate-maps-r1`.
They render without page errors. Polders removes the repeated L/T lobes, but
its five compact basins still look too alike in the overhead view. A more
distinct drainage/bay/hooked-basin composition remains open. Source/test
checkpointing is not art acceptance. Neither these staged timings nor tree
buffer savings establish ordinary-play performance parity.

## Recovery round 2 — retained source and native evidence

- `56924f7bf` integrates five differently proportioned Polders drainage
  contours and order-independent support for overlapping authored bank aprons.
  Three-seed road, deployment-pad, bank-slope and tree-clearance checks pass;
  29 other maps retain exact height/normal/water query hashes. Native review at
  `candidate-maps-r2` shows a long narrow drain, offset retention bays and a
  flatter coastal horizon. The shapes remain deliberately simple at map scale;
  this is not a claim of photorealistic shoreline detail. Frosthollow's frozen
  bank, boat contact and surrounding terrain render without visible gaps in
  the reviewed views. Capture errors are empty. These staged captures do not
  certify ordinary gameplay performance.
- `72f73c156` exposes the farmhouse/alpine panes above their existing wooden
  backing and fixes a diagnostic Raycaster-origin alias. Exact-build native
  `window-census-r2` proved six eligible Verdant pane faces were all blocked
  by wood approximately 6.09 cm in front; increasing the search limit was not
  the fix. Geometry/RNG/non-pane parity tests preserve the rest of the village.
- `fc6f06f18` masks existing intact structure windows, the relay warning bulb
  and the lighthouse lantern. Per-instance destruction/reset activity remains
  event-driven. Twenty structure families across three seeds retain exact
  shape/UV/color/topology and RNG; debris and unrelated surfaces remain unlit.
  The fixed two-spot/one-point projection budget is unchanged. New fixtures
  still need native closeups before visual acceptance.
- `candidate-phase-r2.json` records the actual native GPU, build, daytime
  atmosphere and effective quality around its profiling window. Its CPU
  profile is diagnostic, not an unprofiled performance repeat. The active
  nighttime owner was detached, so active night lights do not explain the
  earlier daytime sample. Baseline/candidate enemy visibility differs, making
  raw attached-resource and heap deltas unsuitable as an optimization claim.
  The Garage resource/triangle excess itself predates this candidate.
- Current production has advanced to `c7089f069`; preserve its cooperative
  multiplayer entry warming on integration. An immutable current-main
  baseline and three normal, unprofiled phase runs are being acquired with the
  same maintained probe. Do not relax existing resource ceilings.

## Recovery round 3 — native review and fixture coverage

`all-map-review-r1` captures the other 28 maps from the immutable `56924f7bf`
map-review build. Together with `candidate-maps-r2`, all thirty maps have fresh
1440×900 native establishing views. Browser errors and structural-quality
failures are empty. All thirty establishing views and selected water/building
closeups were visually reviewed. They show distinct layouts and continuous
reviewed shore contacts, not photorealistic/WoT parity or complete motion
acceptance. The staged timings are not ordinary gameplay performance evidence.

`b2f3aa9a8` registers existing authored vehicle lamp apertures. The complete
201-model, high/low oracle has 402 exact geometry/material/draw/order matches
against `13b9497dd`; semantic masks add no shape or draw owners. That result
precedes the deliberately separate physical repairs in `37de0b6aa`: the M1A3
lamp assemblies move forward 55 mm, MBT-70 assemblies 115 mm authored
(108.1 mm installed), and T-90M/Proryv's existing four discs are seated in their
canted cassettes. Eight high/low aperture checks pass with unchanged main-hull
geometry and mesh/material/vertex counts. Anatomy/release and native repair
closeups are still required.

`6f2709ede` detaches inactive cached Garage pedestal roots without freeing or
rebuilding them. Focused tests cover same-object A→B→A reuse, changed Garage
height, actual eviction, stale async work, external disposal and battle/Studio
handoffs. This reduces attached-scene traversal, not retained GPU allocations.

The immutable `c7089f069` production comparison completed three unprofiled
phase runs (`current-main-phase-r1.json` through `r3.json`). Active battle
task costs were 13.137, 15.561 and 11.958 ms/render at 57.99, 58.37 and 57.24
rendered FPS. All three retain the same thirteen failing resource/workload
ceilings, including the existing 11.5 ms/render limit. Browser errors are
empty. These are measured baseline failures, not a reason to loosen budgets.

`current-main-residency-r1.json` records eighteen native map activations, three
ordered sweeps of Verdant, Coastal, Delta, Monsoon, Autumn and Urban, using
the immutable `residency-cameras-r1.json`. It fails repeated residency:
renderer textures grow by 78 per six-map sweep, with roughly 133 MB of managed
heap and 673 MB of backing storage retained per sweep. Source inspection
identifies exactly thirteen unowned shader textures per map in that production
revision: ten terrain, one props grime, one canopy detail and one horizon
detail. Integration already contains their explicit ownership/disposal in
`23b82f0bc`, plus world-specific disposal in `79d424360`. The connection to
CSM-held build closures explains the direction of CPU/backing retention but
is not heap-snapshot-proven. The identical candidate sweep must demonstrate
bounded residency before the leak is called fixed. No new cleanup patch or
quality reduction was made merely from this baseline result.

## Remaining acceptance gates

1. Polders contour/terrain/route tests and matched native before/after views.
2. Night source and lifecycle integration, spotting/death/Garage tests.
3. Night native rendering and brightness/glow/contact review on several maps.
4. Matched normal-control frame timing, retained-memory and cache-eviction runs.
5. Full 30-map identity/visual/terrain/collision review; refresh affected map
   imagery/minimaps and collision manifests only from the accepted build.
6. Current-main integration and final release verification. No push yet.
