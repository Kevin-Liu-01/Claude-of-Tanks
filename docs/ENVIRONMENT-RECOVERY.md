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

## Pending high-value gates

1. Polders contour/terrain/route tests and matched native before/after views.
2. Night source and lifecycle integration, spotting/death/Garage tests.
3. Night native rendering and brightness/glow/contact review on several maps.
4. Matched normal-control frame timing, retained-memory and cache-eviction runs.
5. Full 30-map identity/visual/terrain/collision review; refresh affected map
   imagery/minimaps and collision manifests only from the accepted build.
6. Current-main integration and final release verification. No push yet.
