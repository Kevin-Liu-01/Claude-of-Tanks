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

## Recovery round 4 — integrated build and native checks

`3c06d3352` integrates the current `237b9a12c` multiplayer entry work without
discarding either branch's load-stage and failed-world-activation coverage.
The `nightLighting` stage is explicitly included in the ordered network load
stage union. Focused network/world/FX checks and full typecheck pass.

The frozen review tree is
`/Users/kevinliu/.codex/worktrees/cot-environment-release-review-20260907`.
Its public build index SHA-256 is
`11357b5c63d0320b5e26046837f251ed4cdaab61d49c1c69ac9fee137b9342ea`.
This immutable source/build separates native acquisition from subsequent
anatomy artifact generation in integration.

`night-lights-r3` records fourteen native captures. The desktop Verdant,
Winter and Monsoon day/night/day cases pass every structural check, and
visual review confirms restored daylight, readable player silhouettes,
visible headlight apertures and road pools, and exposed glowing farmhouse
panes. The focused streetlamp case remains **failed**: its lamp material and
point-light position cycle correctly, but the camera is obstructed by a
roof/chimney. Its shared check also incorrectly demands a player spotlight
when the closeup is hundreds of metres from the player. These are diagnostic
defects to repair; those three frames are not accepted fixture evidence.

`candidate-residency-r1.json` uses the identical six-map, three-sweep native
scenario and camera manifest as the current-production comparison above.
All comparative memory checks pass. In the mature sweep, GPU geometry,
texture and program counts remain exactly stable for every revisited map,
as does backing storage (roughly 201–303 MiB, depending on the two cached
maps). Managed heap is much lower than the baseline but the strict repeated
heap gate still fails for Coastal (+2,169,488 bytes versus a 1,450,132-byte
allowance) and Delta (+1,565,372 versus 1,479,400). Browser errors are empty.
The overall result remains **failed**, pending retained-heap diagnosis;
no tolerance was changed and no allocation category was subtracted.

## Recovery round 5 — refreshed art, collision audit and bounded diagnostics

`d5ecd07a9` checkpoints all thirty reviewed native 3840×2160 map heroes and
their 512×288 picker derivatives. The source captures are in
`map-art-final-r1`; all sixty published WebPs passed dimension checks.
`5e0f10441` removes internal construction-lobe seams and overlapping opacity
from the minimap water painter without allocating another canvas or changing
the world-to-map projection. All thirty maps / 193 shoreline contours pass
the projection test. `818d11b90` checkpoints thirty newly rendered 440×440
minimaps and updates both loading paths to the `north-up-v7` cache key.
Visual review of Reservoir confirms one connected body instead of three
outlined construction cells. The 4K images themselves use the actual game
renderer, not generated concept artwork or upscaled lower-resolution captures.

The native collision refresh is audited in
`collision-manifest-audit-final-r1.json`. All thirty checksums, byte lengths
and decoded counts match the index, with unchanged construction seeds.
Twenty-seven maps retain their counts, **not** identical geometry: all thirty
include the shared seated wall refits; alpine structures, Orchard's bathhouse
and Mangrove's grounded fishery/tree placements also have intentional changes.
The changed exact Polders/Airfield/Reservoir counts come from authored drainage,
hardstand exclusion, and forked roads/assembly areas respectively. An Airfield
counterfactual changing only the shared vegetation exclusion restores the old
2,782 trees from the new 2,691. No collision tolerance is increased. The first
focused check exposed a stale Reservoir intake-height assertion, which must
track the taller closed, full-footprint service hood rather than the old cap.

All three unprofiled candidate phase runs are preserved in
`candidate-phase-final-r1.json` through `r3.json`, with their comparison in
`candidate-phase-final-comparison.json`. Active battle CPU/render is
11.885 / 6.967 / 7.168 ms, versus the baseline's 13.137 / 15.561 / 11.958 ms.
Median rendered FPS is 56.37 versus 57.99; candidate repetitions span
52.99–59.75. Existing budget failures are 11 / 10 / 10 versus 13 / 13 / 13.
Actual visibility/workload differences prevent attributing those timings to
one optimization or declaring an unconditional performance pass.

The retained-allocation diagnostic reproduces the strict Coastal heap failure.
Its two snapshots show 2,029,052 bytes of growth in V8 code objects, dominated
by instruction streams, trusted byte arrays and feedback vectors. Closure
count decreases by one; only the expected two actual world groups remain,
with fresh identities after eviction. This is evidence of VM code warm-up,
not permission to subtract that category from the original failed heap gate.
One additional, predeclared five-sweep ordinary acquisition is pending to
distinguish a warm-up plateau from continuing growth; no retry-until-pass or
tolerance change is authorized.

`cc3eb8a3c` repairs the rejected streetlamp camera/admission diagnostics.
`bd23fd678` forwards raw main-loop cadence to the existing quality governor
through battle, shot mode and Studio, while animation and simulation keep their
bounded deltas. This restores the existing hitch filter without changing any
resize policy, quality floor or acceptance gate. Focused tests and typecheck
pass; the DPR2 motion result still requires a fresh native acquisition.

`536499739` makes ordinary self-tests hold a renewable contiguous FIFO lease,
releasing it before the one browser test that owns its own lease. This fixes
real unqueued full-fleet CPU contention without nesting the release runner's
resource locks. Suite inventory and failure/signal/refresh tests pass.

The final client review is frozen at `818d11b90` in
`/Users/kevinliu/.codex/worktrees/cot-environment-final-r4-review-20260907`.
Its public build and final lighting/motion captures are pending. The complete
anatomy/marking check passes, but targeted lamp-model release verification
stopped at the fidelity harness's initial registry readiness, before scores or
images existed. Earlier eight release phases passed; this startup failure is
not a fidelity pass and must be diagnosed before continuation. No push yet.

## Recovery round 6 — accepted collision refresh and remaining failures

`846e24d35` commits the complete native collision refresh, the exact intake-hood
and adjoining-bank assertions, and all thirty per-map storage budgets. Dedicated
collision, codec and loader tests pass. The published corpus shrinks from
36,936,381 to 33,770,102 bytes; every individual shard is smaller. The original
codec test nevertheless failed because the raw corpus shrank faster, changing
encoded/raw from 77.17% to 80.16%. Its 20% dictionary-efficiency requirement now
uses a fixed mixed-primitive fixture, while the actual thirty-map corpus must
remain below **each** prior published byte ceiling. No codec/runtime algorithm,
quantization, collision tolerance or decoding correctness assertion changed.
This storage check is separate from runtime memory acceptance.

The five-sweep `candidate-residency-extended-r1.json` acquisition is complete.
It preserves thirteen strict managed-heap failures; same-map GPU geometry,
textures, programs and backing storage remain exactly stable. Managed growth
slows but does not establish a plateau. Offline comparison of the original
two Coastal snapshots resolves all 642 newly observed instruction streams to
preexisting function definitions. Their direct closure counts are individually
unchanged (793 total in each snapshot); replaced per-world closures remain
bounded. The actual CSM shader-map reference count is 604 in both snapshots.
Compilation/tier progression explains the instruction-byte increase, but is
not subtracted from the failed original managed-heap gate.

The R4 build passed with index SHA-256
`722f133c43716a44b7f1b8bae6d5942938c79b4e04b821489d8bac7a18ed05b1`.
Its default 31 lighting captures pass structural/lifecycle checks with no
console or cleanup errors. Visual review confirms actual streetlamp light on
walls and pavement, headlight road pools, window emission and restored daylight.
However, Shtora appears amber at night. `1969759bd` reduces only added red-mask
radiance to preserve red through ACES; native verification remains required.

Additional R4 fixture checks fail closed: Urban's relay camera cannot locate an
unobstructed authored aperture, and M1A3's exterior camera rays hit actual hull
faces roughly 41–47 mm before its headlights. The latter is a real remaining
placement defect: the earlier outward ray began inside single-sided hull
geometry and missed its backface. Neither partial fixture run is accepted.

`motion-one-r2` passes its live pan and scope but retains the DPR2-only scale
failure (0.91, internal ratio 1.365). The raw-cadence correction did not resolve
it. A bounded diagnostic on the same frozen build measured synchronous PNG
readbacks taking 49–69 ms at DPR1 and 181 ms at DPR2. Those stalls enter ordinary
frame cadence. The capture method is being corrected without changing quality
floors, adaptation, timeouts or parity requirements; no nine-case matrix is
unlocked by the failed receipt.

The four lamp-model release check ran, but is **not passed**. M1A3 and Proryv
have no registered local reference oracles. Separate remaining checks in
`lamp-remaining-gates-r2` report all four contiguity/fitting censuses passing;
MBT70's strict track test fails eight hull-detail voxels. Fresh registered
MBT70/T90M fidelity and geometry checks also fail. Their exact before/after
receipts are preserved separately; do not publish a passing qualification or
redesign unrelated vehicles merely to clear those scores. Attribution against
the actual lamp-only delta remains necessary.

The first full-suite attempt, `final-npm-test-r1.log`, stops on the
`sourceXOtherAuxArmor` full-scene fingerprint. The mismatch is being decomposed
before changing any expected digest. The suite is not reported as passing.

## Recovery round 7 — exterior lamp seating and nonblocking capture

`398deb8a3` corrects the actual exterior visibility of the existing M1A3 and
MBT-70 lamp assemblies. Their total authored forward offsets are now 110 mm
and 150 mm respectively; the housings still overlap their supporting hulls
by 12.18 mm and 7.67 mm. No meshes were added. Exterior-to-lens ray checks,
including both front quarter views, pass all 72 samples per model/quality.
The unchanged T-90M and Proryv placements pass 120 samples per quality.
The default regression now builds all four vehicles at both quality levels
and checks the actual exterior faces, replacing the misleading inside-out
ray as the visibility oracle. Canonical anatomy regeneration/check and fresh
native photographs of this correction remain required.

`abb174100` replaces synchronous motion-proof PNG encoding with asynchronous
`toBlob` encoding at the same rendered-frame receipt. The probe still takes
exactly three timed pan snapshots, preserves capture order and frame/pixel
pairing, and restores the render wrapper after the final requested snapshot.
Timeout, cancellation and failed readbacks retain fail-closed cleanup. No
quality policy, floor, camera route or acceptance limit changed. The single
Winter desktop acquisition in `motion-one-async-r1` passes on the unchanged
R4 public build, including DPR2 at dynamic scale 1. Its 484 actual pan frames,
six PNGs and 24-second video are retained; the saved-evidence gate also passes.
This is visual acquisition evidence, not a new FPS or memory benchmark. The
final client build still needs its own one-case gate and nine-case matrix.

`6fcb9f39e` and `2b1b5e625` preserve all fourteen Other and eighteen Soviet
legacy scene hashes. Exact attribute decomposition proves that the newly
registered `nightEmissionMask` is the only mismatch. Shape hashes still cover
every former geometry/instance/transform attribute; the mask has its own
strict byte type, layout, count and value checks. Malformed mask, unknown
attribute and position-mutation controls prevent silent geometry exclusions.
Focused Other/Soviet tests pass; unchanged Western and optimization checks
also pass, including 15,975 optimization controls. The prior failed full-suite
receipt is retained, and a final complete run remains required.

`ea90a8901` adds a diagnostic-only exact-fixture census. It establishes that
Urban has no relay instance at all, while Airfield has a real authored radar
relay. The verification camera now targets that existing fixture; no prop was
invented or moved to satisfy the test. Census reports cannot qualify a release.

The eight MBT-70 rear hull-detail/track overlap voxels are confirmed unchanged
by the lamp work: full mesh inventories/matrices and every rear vertex match
the pre-lamp source, with only forward fixture positions changed. Existing
MBT-70/T-90M reference-fidelity failures likewise remain documented, and M1A3
and Proryv still have no registered comparison oracle. No fake reference,
passing ledger, geometry tolerance or tank redesign has been substituted.
Owner direction on publishing this focused lighting work with those existing
qualification limitations has been requested; publication remains pending.

The complete 29-test post suite and TypeScript/core-unused checks pass.
The core suite's unrelated repository-hygiene failure was a missing allowlist
entry for the already tracked and indexed tank-generation handbook;
`deddbd62c` repairs it, and `8297588ec` keeps its stable handbook link outside
the generated directory index. Agent-docs scaffold/doctor passes all four
checks. The queued second core run was canceled before any test began so the
scoped source repairs could complete; it is neither a pass nor a test failure.

## Final client freeze — R5

`03972db04` checkpoints the final physical lamp source and twelve reviewed
technical diagrams plus their manifest. Canonical anatomy update and check
both pass: 174 current receipts, 56 demand groups, 1,496 modules, 348 track
sides, zero failures/outside-envelope modules, and 522 current technical
assets. The 79 preexisting published-dimension warnings remain visible. Each
changed diagram differs at only 5–11 bow-lamp pixels; no labels, layouts,
portraits or other catalog records changed.

`6a5b50a81` integrates `98b24722c` from main. The two merge conflicts were the
network load-stage union and its ordering regression: both `nightLighting`
and the new `panelMasks` stage are retained before shader compilation.
Focused network presentation/input/transport/handoff checks and full
TypeScript/core-unused checks pass in `final-integration-check-r1.log`.
An independent read-only review found no lost lamp preparation, late-visual
registration, Garage reset, readback cleanup or lazy fleet boundary.

The immutable client is
`/Users/kevinliu/.codex/worktrees/cot-environment-final-r5-review-20260907`.
Its public build passes (`final-r5-public-build.log`) with index SHA-256
`985c766d9f307883c119c1e8f439c85a7de0899d17c01170bb422195a7c5b428`.
The public registry retains 174 first-party procedural playables and zero
runtime GLB sources. Fresh R5 night/fixture and motion acceptance is pending;
the passing R4 one-case result is not reused as this build's admission gate.

## R5 acquisition results

All three fresh native lighting reports pass their structural/lifecycle gates:
`night-lights-r5` (31 images), `world-lights-r3` (9), and `vehicle-lights-r3`
(12). All 52 PNGs were individually reviewed; page, console and cleanup error
lists are empty. The frozen source and build hash are unchanged. Reviewed
views show both M1A3 front lamps, the selected MBT-70 front lamp, near-side
T-90M/Proryv cassette lenses, red/red-orange Shtora, the red Airfield relay cap,
warm Coastal lighthouse glass, building panes, and light on roads/walls.
Daylight restores, and Garage detaches the light pool with zero emitters and
all three light intensities zero. This is native Chromium visual evidence,
not physical Safari/iPad or an ordinary performance certification.

The MBT-70 framing crops the far lamp off-screen. Its selected near lamp has
actual aperture/line-of-sight/radiance/day-reset evidence; the four-model CPU
regression covers both lamp seats separately. Do not claim both MBT-70 lamps
were visually certified by that one closeup. Exact review and owner/face
details are in `lighting-r5-review.md`.

`motion-final-r5-one-r1` remains **failed**. Its 473 actual live submissions
advance 8.1168 positive-delta seconds at unchanged quality, and x8 scope passes.
The DPR2 checkpoint has dynamic scale 0.91/internal ratio 1.365; returning to
DPR1 restores scale 1. A partial-evidence request and context/video finalization
also time out, leaving no qualified recording. The browser finally closes
gracefully, the preview stops and the queue is released. The acquisition hash
matches the earlier passing R4 run exactly; neither that earlier pass nor the
successful lighting captures unlocks this build's nine-case motion matrix.

Offline comparison finds no postprocessing/adaptive/viewport/resolution/world
or main-frame runtime difference between the two frozen builds. It does not
establish a cause for the DPR2 reduction. The 16.3761-second gap between resize
receipts includes 16.1167 seconds of game advance and 17,620 renderer submissions,
so it is not evidence that the game was frozen throughout. Synchronous `toBlob`
snapshot cost, encode callback timing and host delivery time were not measured.
The DPR2 scale is sampled before its own PNG request, which therefore cannot
cause that already-recorded scale on the same frame.

`31b5cb91a` fixes a proven capture-cleanup defect without changing the runtime
or motion gate: completed acquisitions no longer retransfer an already-saved
PNG during partial recovery. Interrupted acquisitions still recover evidence;
layout inspection and context/video cleanup proceed independently if recovery
fails. Focused CPU controls pass. The three existing whole-tool complexity
violations are unchanged, with baseline metric equality recorded separately;
the new cleanup owner is within limits. The updated acquisition fingerprint is
`75b8a7cb4c5f03fb246670cf1fbf91256b6ae0e89a49acac007868bc0306474b`.
No further native run was made, and the old failed receipt was not relabeled.

The private build also passes (`final-private-build-r1.log`). Its status
receipt records only concurrent authorized documentation/test changes, no
generated runtime or asset mutations, and no staged comparison GLBs. The R5
public build was not rebuilt or replaced.

## Full-suite checkpoint

The single complete `npm test` attempt in `final-npm-test-r2.log` runs on an
unchanged, clean `74e2c3439` source. It stops at pre-suite file 26,
`roadWheelRestHeights.selftest.mjs`: 25 of 252 pre tests passed; the 496 core
and 29 post tests did not start. The earlier separately passing post run is
not represented as completion of this invocation. Its exact JSON receipt
retains the nonzero exit and source/status equality.

Bounded decomposition recovers all eight original road-wheel hashes and
every original height/support/movement assertion. The only added attributes
are all-zero masks on three high-detail M1A2 gear meshes and one low-detail
gear mesh; no physical byte changed. `60e533d78` keeps all eight original
digests and passes the focused test with strict all-zero metadata checks and
malformed-mask/physical-mutation controls.

The bounded vehicle batch passes sixteen tests unchanged. Its only failure,
`returnRollerOutset.selftest.mjs`, has the same inherited all-zero M1A2 gear
attributes. Exact decomposition recovers all four original digests, including
both unchanged Leopard 2A5 tiers. `b88d7cd48` preserves those digests and passes
the focused roller/attachment tests with equivalent negative controls.

The nine-test world batch passes eight unchanged. Reservoir's historical
partition hash is the remaining failure under investigation. No failing
physical digest is silently replaced and no broad geometry attribute is
dropped from the existing oracle. These focused results do not turn the
failed complete-suite invocation into a pass.

## Acceptance checklist

1. Polders contour/terrain/route tests and matched native views: completed.
2. Night source/lifecycle integration and spotting/death/Garage tests: completed.
3. Final native night brightness/glow/contact review: completed for the stated
   captured views; DPR motion acceptance remains failed.
4. Frame timing and cache-eviction acquisitions: recorded; strict memory and
   quality acceptance remain open as detailed above.
5. Thirty-map visual/art/minimap refresh and native collision refresh: completed;
   exact waterworks, census, codec and loader checks pass.
6. Current-main integration is checkpointed; final release verification and
   non-forced publication remain pending.
