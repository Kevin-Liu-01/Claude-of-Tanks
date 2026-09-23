# Multiplayer loading: exact wreck paint and progress deduplication

## Problem and scope

The preceding staged-wreck change improved cancellation granularity but did
not prove faster total loading. Its native Winter capture still needed about
four seconds per participant. The measured paint/progress iteration removes
repeated work rather than adding scheduling checkpoints. It does not alter networking,
authority, the five-second countdown, reveal gates, map contents, vehicle
quality, materials, or shadows.

The source baseline is `5a13dadb0a2239a9cb65a092b62f58296f727fb8`, preserved
with its complete public build at
`/private/tmp/cot-wreck-paint-baseline-5a13.oaaOGE/worktree`.
Its original `wrecks.ts` SHA-256 is
`b85d8ff80200391459bff5c7045daa305d01fd9c1919018d69922eddf5b0c9a8`.
The preserved native build has an older dirty build label, recorded below;
its bytes must not be described as a newly built clean `5a13dadb0` artifact.

The subsequent 32-donor public wreck policy and authored map-cast expansion
are outside both frozen performance source trees and both native builds in
this note. Their intentional content/placement changes cannot inherit this
output-parity or timing evidence.

## Changes and invariants

`worldBuildCoordinator` no longer republishes consecutive identical
label/fraction pairs. Stage timing still starts on the first checkpoint,
including the initial default value. Every checkpoint still releases its
background lease, checks cancellation, and invokes its scheduler. Late
listeners receive the current value immediately, throwing advisory listeners
cannot starve others, and A-to-B-to-A changes remain observable.

The regression fixture produces 1,007 scheduling checkpoints but only six
distinct notifications including initial subscription. The unchanged source
failed that test with 1,008 notifications. Cancellation during duplicate
progress still returns each lease once and prevents completion/caching.

Wreck colors are a deterministic function of the stored Float32 position and
normal plus one invocation-local rust phase. The new narrow preparation path
deduplicates those exact words before painting. First-occurrence order and
the original corner index remain unchanged. The storage-benefit decision
includes the future three RGB words; otherwise marginally beneficial inputs
would incorrectly change representation. Unsupported streams use the original
paint-then-generic-compact path. The generic compactor is unchanged semantically.

Exact first-party fixture results:

| Fixture | Original paint calls | Candidate | Removed |
| --- | ---: | ---: | ---: |
| T-90M, seed 2526, non-popped | 130,296 | 47,701 | 82,595 (63.4%) |
| K2, seed 2002, popped | 116,442 | 44,543 | 71,899 (61.7%) |

Visible position/normal/color arrays, index bytes/type/order, triangles,
bounds, and shadow geometry match the explicit original sequencing control.
Independent older M1A1/Type 10 fingerprints also pass. Tests cover the
future-color benefit threshold, a no-benefit tie, the 65,535/65,536 index
boundary, malformed-input fallback, every-checkpoint return/throw disposal,
and interleaved builds. Vehicle constructors remain synchronous.

## Verification to date

Four wreck tests and strict scoped metrics passed: 142 functions, no
complexity violations or explicit `any`/`unknown`. The coordinator regression
passed after its demonstrated negative control. Typecheck/core-unused and
the public build passed (925 modules, 18 localized routes, 174 first-party
playables, zero GLB loading paths).

The read-only changed-file React Doctor scan reports 49/100 and exits 1.
Its one reported error is the existing test-only `new Function` harness in
`wrecksSteps.selftest.mjs`, evaluating repository source with injected
fixtures, not user/network input. No rule was suppressed. This scan covered
seven tracked files and does not certify untracked new tools/tests.

## Six native Winter captures

Values are host/guest in milliseconds. Entry is the source network-preparation
total, not navigation time or the five-second countdown. Maximum loading rAF
is the largest consecutive observed frame gap between launch and the first
loader-hidden receipt; it is not attribution to a particular props slice.

| Report | Actual lighting | Entry | Props synchronous | Props max slice | Max loading rAF |
| --- | --- | ---: | ---: | ---: | ---: |
| [Baseline R1](/private/tmp/cot-wreck-paint-baseline-native-20260908-r1/report.json) | Night | 4083/4318 | 937.3/965.2 | 63.9/66.1 | 170.8/195.7 |
| [Candidate R1](/private/tmp/cot-wreck-paint-candidate-native-20260908-r1/report.json) | Day | 4080/4188 | 845.4/895.8 | 52.6/63.6 | 207.8/211.7 |
| [Baseline R2](/private/tmp/cot-wreck-paint-baseline-native-20260908-r2/report.json) | Day | 4596/4792 | 1011.5/1009.3 | 60.5/63.8 | 174.1/187.7 |
| [Candidate R2](/private/tmp/cot-wreck-paint-candidate-native-20260908-r2/report.json) | Night | 3554/3791 | 746.8/754.8 | 42.0/42.5 | 154.0/178.0 |
| [Baseline R3](/private/tmp/cot-wreck-paint-baseline-native-20260908-r3/report.json) | Night | 4424/4632 | 1033.2/1049.5 | 59.5/60.6 | 192.0/158.9 |
| [Candidate R3](/private/tmp/cot-wreck-paint-candidate-native-20260908-r3/report.json) | Night | 3241/3525 | 716.7/700.0 | 41.2/41.3 | 188.7/162.1 |

Props checkpoints are consistently **1,759 baseline versus 1,486 candidate**
on all peers. All captures used fresh cache-disabled contexts, local signaling,
timings-only observation with diagnostic overhead, native background scheduling,
clear weather, high preset, scale 1, and zero precipitation/particles. All
reported an unmasked ANGLE Metal Apple M5 Max hardware-like backend; weather,
lighting and quality were not forced.

All six reports pass: both peers enter live battle, show foreground 5/4/3/2/1,
pass the native nonblack check without rescue, return to Garage, and release
their rooms, browser, servers and capture lease. All twelve panel receipts
complete, shader uniform-pending counters end at zero, and no browser errors,
dropped observations, hidden/unfocused frame samples or owned rooms remain.
Nonblack readback is not a complete visual-quality or physical-display audit.

Like-numbered R1 and R2 have mismatched day/night conditions. R3 matches the
recorded nighttime conditions, but its guest maximum rAF is slightly worse
(162.1 versus 158.9 ms). Candidate R1 also has worse maximum gaps than baseline
R1. The samples support less recorded props work, not uniform frame-time
improvement or a universal entry-speed claim. Two contexts on one machine do
not certify production signaling, distant devices or smooth loading.

All six acquisitions retain the same tool closure hash
`e86b225ce456e32a33aab7e6e3c363e4319bfca56c0dc084e557210a7549bfdf`.
Native artifact identities are unchanged within and across each side's runs:

| Artifact | Embedded source label | `index.html` SHA-256 |
| --- | --- | --- |
| Baseline | `v1.0.0+gcd7939351.dirty` | `0772b702ccb3f37132605c41dd07f1bf9cf12e9d5fcee63c2e9a90ee3769cfbb` |
| Candidate | `v1.0.0+g5a13dadb0.dirty` | `c3d6cd9c95e7ac79b1f0e794c457489205b3f504dcdc7fb5874edd43a5d86dcb` |

Complete public-build hashes are
`71ea9444e3e542710350d406cf7971c2428c972948f9bc3726d1521020e62532`
(baseline) and
`c7079d6c737a1077ded4f6347fca07f2aa6164a337238001aa99be3b318d7085`
(candidate). Each has 3,143 files; the candidate adds 264 bytes overall.

## Fresh-process CPU comparison

The [CPU report](/private/tmp/cot-wreck-paint-cpu-comparison-20260908-r1/report.json)
passes exact-output checks for all twelve fresh Node workers: three samples
per fixture per side, baseline then candidate in each round, under the shared
capture lease. The benchmark's focused selftest also passes. There is no
timing threshold or statistical-significance gate. Apple M5 Max, Node 24.13.0
and pinned Three 0.185.1 were used without warmups or source instrumentation;
OS file-cache state is unspecified.

Both sides use the existing low-quality, geometry-only procedural wreck
factory contract, not a new quality reduction. Imports and builder acquisition
are measured separately from synchronous bake work. The latter includes
generator return and temporary-owner disposal, but excludes output hashing
and final returned-geometry disposal. Stage categories charge each `next()`
call to its returned checkpoint, so boundary tails may land in the next stage.

| Fixture | Sync median, baseline → candidate (ms) | Observed sync ranges (ms) | Paint median (ms) | Compaction median (ms) | Constructor median (ms) |
| --- | ---: | --- | ---: | ---: | ---: |
| T-90M 2526, non-popped | 159.46 → 153.84 | 158.65–182.04 → 147.50–156.44 | 12.75 → 6.33 | 14.07 → 12.57 | 122.08 → 122.15 |
| K2 2002, popped | 113.96 → 112.12 | 112.88–116.39 → 106.46–116.00 | 11.66 → 5.99 | 12.74 → 11.83 | 79.28 → 82.25 |

Painting approximately halves, while observed total median reductions are
only 5.62 ms and 1.84 ms. Constructors still dominate and were not optimized;
independent category medians are not additive causal savings. These headless
CPU measurements do not certify browser startup, GPU work or frame cadence.
Exact parity is a separate stronger claim: every sample matches the full
geometry/index/color/shadow/bounds receipt for its recipe, with the reduced
paint-row counts listed above. The report records no errors or interruption
and confirms capture-lease release.

The CPU candidate is preserved at
`/private/tmp/cot-wreck-paint-candidate-source.45vqCY/worktree`.
Both source trees report base revision `5a13dadb0a2239a9cb65a092b62f58296f727fb8`;
their 1,617-file source hashes distinguish the frozen patch:

- Baseline: `03aa449c4f685964fb9867bcb626bb6eb00bb04b9411cca2281dfa8b2b67c92a`.
- Candidate: `874ded004e312fa8eb4bb834f9a67b6ee21185f09e82d19fa1853d56e1fba662`.
- CPU report: `49777865de17bf7a2b191ffd8fc27b99b64073aebc26abdbc8d19d83e817e615`.

Remaining targets include atomic constructors, native depth-program first use,
shadow preparation, and animation/frame budgets. This iteration has not
resolved approximately 200 ms loading gaps or established a production speedup.

## Follow-up: omit discarded factory paint

The `geometry-only` factory mode still ran `boxUV` and `bakeDirt` when merging
camouflaged buckets. Both functions only replace UV/color attributes; neither
changes position, normal, index, geometry order, or RNG state. Wreck baking
then deletes these channels and generates its own final char/rust colors.
The Garage background geometry worker likewise serializes only position and
normal, using solid materials without vertex colors. Skipping this temporary
paint in `geometry-only` mode avoids unused attribute allocations and their
per-vertex calculations. Default rendered-mode and geometry-receipt inspection
keep their existing paint path. No new quality reduction or preload is added.

The existing constructor diagnostic at
`.qa-wreck-constructor-profile-t90m-2526-20260908/report.json` attributed
5.209 ms to nine `bakeDirt` calls inside a 12.038 ms bucket-merging stage.
That trace was captured from revision `3cca022f`; it identifies waste, not
a current browser speedup or the cause of all observed frame stalls.

`wreckDiscardedPaint.selftest.mjs` restores the old condition in memory as a
negative control, observes actual painted vertex rows, and compares exact
finished wreck streams, indices, bounds and shadow output. It also exercises
default-mode inspection and the actual full-detail M1A2 Garage factory options,
comparing transferable geometry, material properties, transforms, instancing,
LOD metadata and sharing. Its source hook is restricted to the repository-owned
factory; no user/network source is evaluated.

The focused test passes, observing zero temporary bucket-paint calls versus
58,638 T-90M, 21,264 K2, 17,964 M1A1 and 14,400 Type 10 painted vertex rows
in the old path. Existing independent M1A1/Type 10 wreck goldens and the full
typecheck/core-unused check pass. Both Garage controls emit the existing
`document is not defined` optional-decoration warning in this Node context;
the comparison certifies their resulting hierarchy, not browser decoration
completeness. No runtime warning handling or decoration behavior was changed.
The six earlier native captures do not include this follow-up and must not
be presented as validation of its timing. No new production speed claim is made.

The follow-up React Doctor command used `--include-untracked`, which expanded
into 3,150 saved QA-build files, including minified `.qa-lobby-baseline-dist`
chunks. That oversized read-only scan was intentionally canceled; it has no
passing score. The focused tests and typecheck preceding it had completed
successfully. The owned scan process and its child were confirmed terminal,
and the shared capture lease was released. No QA artifacts were deleted or
staged. The runtime change and its test remain uncommitted.

## Follow-up: move static wreck construction off the UI thread

The async browser map builder now uses one lazy, map-construction-scoped
module worker for its selected wreck recipes. The synchronous/headless builder
retains the existing cooperative bake. Both use the same fleet acquisition,
factory, destroyed pose, paint, compaction and bounds calculation; the browser
receives the finished visible/shadow typed arrays by transferable buffer,
without repainting, scanning vertices or recomputing bounds on the main thread.
Vite's worker format is ES modules so donor families stay on-demand imports
instead of being flattened into an eagerly evaluated full-fleet worker.

Placement order, seed selection, collision support, map-local recipe caching
and final material-bucket merging remain in the same generator. The worker is
terminated when map construction finishes, fails or is abandoned. It has no
global cache or permanent idle lifetime. While a reply is pending, real timer
tasks call the existing loading checkpoint at an unchanged fraction so map
ownership and cancellation remain observable. A reply stays unhydrated until
that checkpoint finishes. The generator owns any hydrated result until its
cache takes over, including cancellation immediately after transfer. Worker
transport errors and a 30-second unsettled-job limit propagate to the existing
loading error path; they do not silently resume expensive work on the UI
thread. A donor bake returning null retains the existing skip behavior.

`wreckBakeClient.selftest.mjs` passes lifecycle/error/timeout/cancellation
fixtures using the production client and transferable tiny geometries.
`propsScheduling.selftest.mjs` passes the actual wrapper and generator seams,
including no main-thread donor acquisition on the worker path, unchanged
progress while waiting, cache reuse and disposal of a transferred-but-not-yet
adopted result. The worker and wire real-donor parity tests, production build
and native loading recheck are separate gates; no timing improvement is claimed
from these scheduling fixtures alone.

### Completed worker verification and bounded native check

Worker startup now overlaps structure preparation: `prepare()` starts its
common module when concrete prop construction begins, but sends no donor job
until placement requests one. Explicit zero-wreck maps start no worker. Early
startup errors are retained, surfaced to the pending map build, and terminate
the worker. This preparation remains inside the generator/worker cleanup scope.

Completed checks on this uncommitted slice:

- Client lifecycle and prop scheduling tests, including early startup errors,
  zero-wreck maps, cancellation before hydration, timeout and cache ownership.
- Wire fixtures and actual T-90M, K2 and M551 Sheridan transfer round trips:
  exact visible/shadow streams, indices, bounds and metadata parity. Malformed
  partial hydration disposes both partial and already-created geometry.
- Real worker-thread execution of the production worker for T-90M and K2:
  exact sync/worker output parity and serviced main-thread timer tasks. This
  is CPU/ownership evidence, not browser frame-budget certification.
- Full typecheck/core-unused and public production build. The build used
  pinned `gt@2.20.1` from the npm cache because the linked dependency install
  lacked its executable; shared dependencies and translation files were not
  changed. The dry run sent no translation files.
- Independent worker lifecycle review and a final read-only, selected-five-file
  React Doctor scan. Its sole non-null warning is unchanged pole bookkeeping
  in `props.ts`, outside this slice; the scan did not calculate a score.

The existing native two-client loading probe ran against a frozen public build,
with fresh contexts and cache disabled, on Winter with owned local signaling.
The final report is
`/private/tmp/cot-wreck-worker-overlap.pOd2LJ/evidence/report.json`;
the frozen entry hash is
`9086f2af5d22d9d4d1b40f27ca7d1def462619c900e836cb1ed8c010f5580794`.
Both clients showed the complete foreground 5–4–3–2–1 countdown, primed
nonblack reveal without rescue, completed loading, and returned to the Garage.
There were no reported browser errors or dropped probe observations. Both
rooms closed; zero owned rooms remained; browser, preview and signaling were
closed and the capture lease released.

| Final native observation | Host | Guest |
| --- | ---: | ---: |
| Network preparation | 4,636 ms | 4,755 ms |
| Prop stage elapsed | 1,420 ms | 1,529 ms |
| Prop synchronous work | 540.0 ms | 620.8 ms |
| Largest prop slice | 37.0 ms | 38.8 ms |
| Largest loading rAF gap | 180.2 ms | 164.7 ms |
| Countdown to rollout | 4,920.9 ms | 4,909.8 ms |

An earlier worker run before startup overlap also passed the functional gates
but recorded 5,169/5,317 ms preparation and 198.9/203.2 ms largest rAF gaps.
Its separate report remains at
`/private/tmp/cot-wreck-worker-native.Lwb4qc/evidence/report.json`.
These are two observations, not repeated controlled proof of a speedup. The
older six native captures also used a different wreck roster, so they cannot
isolate the worker's timing effect. The latest gaps remain over budget; this
does not identify the exact historical stall cause, certify production timing,
or complete the broader smooth-loading objective. No renderer audit, production
deployment, commit or push was added to this bounded verification pass.

## Follow-up: isolate measured final-shadow first use

The last worker report exposes two different problems. Its headline host
180.2 ms rAF gap (page time 12,767.4–12,947.6) occurs during world construction
without an overlapping recorded long task. The guest's 164.7 ms maximum is
likewise not attributable to one synchronous task. These observations do not
establish an exact cause for either gap.

There is stronger evidence for a separate reveal stall: the host's 157 ms
long task at page time 15,201.5 aligns with `shadowPrime.maxMs = 157`, a
164.3 ms rAF gap, and seven new programs. Guest final shadow preparation has
the same signature at 94 ms. The existing path already yields between
cascades; another between-cascade yield cannot split that first render.

The candidate adds opt-in first-cascade caster preparation in `shadowPrime.ts`:
up to eight candidate casters or 45,000 position vertices per batch, with
indivisible oversized geometry reported honestly. Normal production frustum
culling still decides actual submissions. Each batch uses the production
camera, light and shadow target; cast/receive flags are restored before the
next task boundary. Every original complete cascade renders afterward. No
shadow resolution, geometry, material, final cascade selection or gameplay
clock changes. Garage does not opt in. Cancellation, renderer/context lifetime,
VSM receive-only casters, child traversal, failure precedence and empty work
have focused regression coverage. The native adapter retains preparation
timings separately from final-cascade timings, and the observer saves at most
128 batch timings without private scene metadata.

Focused shadow, Garage-warm, native-adapter, network-entry, observer and lazy-FX
tests pass, as do full typecheck/core-unused and public build. The shadow module
passes the repository complexity gate (34 functions, zero violations, no
explicit any/unknown). The pre-change scoped scanner's await-in-loop finding
is intentional: sequential task boundaries are required for renderer state
ownership and responsive loading; parallel native renders are not a safe fix.
Browser performance remains the acceptance gate for retaining this candidate.

### Native candidate result

The candidate's frozen public build is
`/private/tmp/cot-shadow-caster-warm.tjbo5A/dist`, entry hash
`10767cf5284cc514e1a450605f002cf8c5c42688485fc01ef8dfbf2dd509c128`.
`/private/tmp/cot-shadow-caster-warm.tjbo5A/evidence/report.json` passes the
same native Winter two-client flow: complete foreground countdown, nonblack
reveal, normal Garage return, no reported errors, zero remaining owned rooms,
and closed browser/preview/signaling with the capture lease released.

| Shadow observation | Previous host / guest | Candidate host / guest |
| --- | ---: | ---: |
| Largest complete-cascade render | 157 / 94 ms | 17 / 51 ms |
| Largest added warm batch | none | 43.3 / 42.6 ms |
| Total synchronous warm + final renders | 234 / 178 ms | 137.6 / 176.4 ms |
| Whole shadow stage including yields | 264.6 / 214.7 ms | 189.0 / 230.7 ms |

Each client prepared nine batches containing 51 candidate casters before the
same four complete cascades. Including both new preparation and final draws,
the largest measured shadow task is therefore 43.3/51 ms, not 17/51 ms.
The guest shadow stage added approximately 16 ms of elapsed time; host elapsed
time was lower. These single-run comparisons support retaining the scheduling
change for its bounded first-use behavior, not a universal percentage-speedup
claim. Shader compilation and other GPU work remain partly indivisible.

Overall network preparation was 5,086/5,323 ms versus 4,636/4,755 ms in the
previous capture. Module/world/connection and compile stages were also slower;
the largest overall loading rAF gaps remained 196.9/174.9 ms. Thus the new
shadow result does **not** establish faster total loading or resolve the
unattributed world-stage gaps. No production or separate-device claim is made.
The observer changed only to retain bounded warm telemetry; it did not change
the native flow or its acceptance thresholds.

The final scoped scanner reports two intentional await-in-loop warnings:
one for caster batches and the existing one for complete cascades. Both await
real presentation boundaries while all temporary object/binding state is
restored. Running them concurrently would violate renderer ownership. No rule
was suppressed, and no numerical scan score was requested. Full typecheck and
build, the targeted regressions and the complexity gate pass. All processes
started for this comparison and scan are terminal. This slice remains local
and uncommitted; the broader smooth-loading goal remains open.

## Bounded closeout: source attribution and rejected paint handoff

The immutable native probe now accepts optional `--entry-profile=host|guest`
using the existing bounded statistical profiler; its default remains `timings`.
Twenty CPU-only acquisition/lifecycle cases pass, including invalid or duplicate
role rejection before resource acquisition. Native gates are unchanged.

The same shadow-candidate build was profiled once at
`/private/tmp/cot-shadow-caster-warm.tjbo5A/profile-host/report.json`.
Its 212.9 ms headline gap occurred before launch, during profiler startup;
it is not battle-loading evidence. The largest host gap strictly inside
launch to both loaders hidden was 155.0 ms during world construction, with
no renderer activity or overlapping Long Task. Nearby profile bins contain
procedural noise, texture and props work. Clock uncertainty is ±102.9 ms,
the profile does not certify full entry coverage, and the initial 198.231 ms
sample interval is `(program)`, not a measured noise call. No exact single
function or historical 214–319 ms cause is established.

A narrow candidate added a task yield after the opaque loader's periodic rAF
yield, aiming to let paint occur before construction resumed. Focused scheduler,
world-coordinator, Garage-warm and shadow-adapter tests, typecheck, public build
and complexity checks passed. The scoped engine scan found only sequential
await warnings and test-fixture `find()` assertions; no production scheduling
defect was attributed to those diagnostics.

Native receipt: `/private/tmp/cot-loading-paint-handoff.46xRmx/evidence/report.json`;
rejected build entry hash
`ef0d087ccf10e43006251b992634d357dc4a07ca49780dec079a3bca456033a5`.
The complete five-second countdown, nonblack reveal and native cleanup passed,
but total preparation was 5,549/5,765 ms and worst rAF gaps 200.7/196.6 ms
(host/guest), versus 5,086/5,323 ms and 196.9/174.9 ms previously. These single
runs do not isolate causality, but provide no performance win. The handoff
change and its added test cases were therefore removed. Do not ship or reuse
that rejected frozen build as the accepted candidate. The previous shadow
candidate remains the retained runtime, without this extra yielding policy.

All browser, preview, signaling, build and scan jobs from this bounded pass
finished; both native rooms were closed and FIFO leases released. No new
production deployment, commit, or push was made. Remaining world-stage gaps
are documented rather than disguised by a profiler-start maximum or a slower
candidate.

## Sourced-terrain first construction

Async map construction now starts the existing terrain image requests alongside
prop-model transfer. At each original G/D/R material checkpoint it creates the
final sourced textures directly **only if that layer's images have settled**.
This avoids the noise/Sobel/Canvas work for procedural images that would be
immediately discarded. Download readiness never adds a wait to construction.
The synchronous builder, missing mandatory images, mud/ice/sea layers, and
desert/badlands procedural rock retain their original painters. Source
composition failures also fall back rather than aborting map loading.

Preparation owns only image references before consumption; it neither allocates
textures nor composes canvases in image-completion callbacks. Direct textures
have fresh per-world identities and no later mutation/upload from `apply`.
Their cached canvases, packed roughness, pixels, sampler/color-space settings,
and existing resource-retention path are unchanged. The legacy pending-source
swap contract remains unchanged for layers not ready at their checkpoint.

`sourcedTerrainPreparation.selftest.mjs` covers per-layer readiness, mandatory
and optional source failures, aliases/tints, abandonment, same final pixels and
texture settings, no redundant uploads, and the actual first four material
generator yields. It verifies G/D/R painter skipping with ready sources and
unchanged pending/synchronous/sandstone/wet paths. Both the fast fixture and
pinned `@napi-rs/canvas@0.1.100` native rasterizer mode passed. The latter used
the existing installation at
`/private/tmp/cot-burlak-main-finish.fjAASo/node_modules/@napi-rs/canvas/index.js`;
no dependency installation was needed.

The sourced-texture, source-failure, terrain resource-lifetime, terrain scheduler,
world-coordinator and twenty immutable-probe lifecycle cases pass, along with
typecheck, public build and diff check. The scoped read-only world scan reports
only test-fixture `new Function` source extraction, sequential checkpoint awaits,
and a small roster-test array lookup; no runtime diagnostic was reported or
suppressed. The full terrain geometry test has a **pre-existing Polders golden
mismatch**: actual `b933cb9c4bd67070e904ffe66696ec235014bb53398886534f920f1345bc5f51`
versus expected `701d4611153e67baea6505fa125c0a185bfdd1dbe2fad6df5ab98791554f722b`.
Loading the unmodified `HEAD:src/world/terrain.ts` through a read-only module
hook reproduces the identical failure. No terrain-shape golden was updated.
This is not a full-suite-green claim.

One frozen public build was checked through the maintained FIFO:
`/private/tmp/cot-terrain-source-first.LtGqLU/evidence/report.json`, entry SHA256
`b93a0b181a412acb353eec120d187b19f7383b85c4a965f5fea6691d442edca0`.
Its identity stayed unchanged. Both native clients completed the 5–4–3–2–1
countdown (4,985/4,879 ms to rollout), nonblack reveal without rescue, battle
progress, and normal room exit; page errors were zero. All owned browsers,
preview/signaling services and FIFO leases closed, leaving zero owned rooms.

| Observation (host / guest, ms) | Previous retained build | Sourced-first build |
| --- | ---: | ---: |
| Total preparation | 5,086 / 5,323 | 3,850 / 4,115 |
| World preparation | 2,986 / 2,967 | 1,927 / 2,127 |
| Largest observed rAF gap | 196.9 / 174.9 | 197.2 / 159.3 |
| Complete shadow-cascade maximum | 17 / 51 | 12 / 12 |
| Preparatory caster-batch maximum | 43.3 / 42.6 | 69.6 / 64 |

These once-only runs are directional evidence, not a repeated causal speedup
certification. The largest new gaps remain inside covered preparation with no
renderer-frame advance or overlapping Long Task; the largest post-reveal gaps
were 42.9/62.3 ms. Neither this optimization nor this test establishes the exact
cause of the historical 214–319 ms stalls or guarantees an uninterrupted frame
budget. The sourced-first change is retained for its verified elimination of
discarded work; no extra scheduling candidate or native retry was added.

This pass remains local and unpushed. The wreck expansion is independently
verified as documented in `wreck-roster-expansion-2026-09.md`; remaining frame
spikes must not be described as solved merely because total preparation fell.

## Deadline-first loading checkpoints

An exhausted work slice is no longer required before servicing an overdue
animation-frame deadline. Other preparation work can consume that deadline
while a task yield is pending; resetting the short slice must not hide it.
Foreground world construction now uses a 12 ms work budget and a 32 ms frame
request interval, rather than 24/80. Background pacing, cancellation, forced
checkpoints, and the existing hidden-document fallback remain unchanged.
This does not reintroduce the rejected extra task after every animation yield.

Deterministic tests cover intervening task wait time, exact deadline resets,
cheap checkpoints, forced selection, and rejection propagation. Restoring the
old policy in memory fails the new overdue-frame regression. The roster test
now expects its first frame at 52 ms / actor 13 rather than the formerly delayed
56 ms / actor 14. Scheduler, roster assets, battle bridge, solo loading and
deployment, shadow adapter, world coordinator, and all twenty immutable-probe
tests pass. Typecheck/core-unused, public build, and diff check pass. The engine
scan reports seven deliberate sequential-await warnings: six test loops and
the bounded shadow warmup loop that yields between renderer-owned batches.
Parallelizing those batches would violate their render-state ownership; no
suppression or unrelated scan-driven rewrite was made.

Final frozen receipt:
`/private/tmp/cot-loading-frame-deadline.SoPuNQ/evidence/report.json`, entry SHA256
`dd47c92d8ad012bb68883c55adc0e1760e017dc50b276508ffeab5341ae8f0d3`.
The native two-client private-room test passed, including the full five-second
5–4–3–2–1 countdown, nonblack reveal without rescue, battle progression, and
native room exit. Build identity remained unchanged; page errors were zero.
Both browser clients, preview/signaling services, and FIFO ownership closed;
zero owned rooms remained.

| Final observation | Host | Guest |
| --- | ---: | ---: |
| Total preparation | 4,016 ms | 4,136 ms |
| World preparation | 1,912 ms | 2,093 ms |
| Largest covered-preparation rAF gap | 182.3 ms | 165.5 ms |
| Largest post-reveal rAF gap | 49.6 ms | 49.0 ms |
| Complete shadow-cascade maximum | 6 ms | 14 ms |
| Preparatory caster-batch maximum | 16.8 ms | 76.5 ms |

This is one final validation run, not a statistical performance certification.
Compared with sourced-first alone, total preparation and worst gaps moved in
both directions; no isolated scheduling speedup is claimed. The deadline fix
is supported by its deterministic regression. The tighter interval requests
paint opportunities sooner but cannot guarantee a displayed-frame deadline.
The largest host gap spans 56 ms and 50 ms Long Tasks; the guest's largest gap
has no overlapping Long Task. Neither proves the historical 214–319 ms cause.
Remaining frame stalls are unresolved, not hidden by the successful countdown
or by averaging host and guest measurements. All changes remain local and
unpushed; the pre-existing Polders golden failure described above remains.

## Loading UI motion, separate from renderer-frame gaps

The loading progress bar previously animated `width`, requiring main-thread
layout during its 180 ms tween. It now keeps full width and animates a
left-origin `scaleX`, with a transform hint only while the loader is visible.
Its displayed precision and progress semantics are unchanged. Repeated fine
checkpoints no longer rewrite identical fill/text/ARIA/stage values. Nonfinite
NaN input resets to zero rather than emitting invalid CSS, and reduced-motion
users get an effectively immediate fill transition.

The pre-battle numeral was already transform/opacity animated, but restarted
its CSS animation with a forced `offsetWidth` read. Equivalent alternating
animation names now restart it without any layout/style query or additional
timer. Same-second snapshots return before DOM class updates. Authority still
owns all five countdown seconds and permission to move/fire; waiting, rollout,
teardown, and same-frame rematches retain their state contract.

The real loading adapter's new DOM regression covers numeric bounds, retained
stage labels, sub-percent accessibility dedup, 100 repeated no-op updates,
roster refreshes, exit cover ownership, and restaging. Countdown tests reject
layout/computed-style reads and check alternating actual HUD keyframes,
same-second no-ops, timers, waiting, and rematches. Both pass, as do the loading
screen contract test and responsive policy's 51 viewport cases. The loading
contract's stale direct-callback assertion was replaced with the current
stronger guarded Solo-intent wiring, preventing competing authoritative-room
preparation. A scoped read-only UI scan reports no findings.

The full `mobileLayout.selftest.mjs` still fails on its English-literal Garage
preview-markup assertion. Its test and consumed Garage/style files are unchanged
from HEAD; this UI motion change does not alter those surfaces. This remains
an explicit limitation, not a full-suite-green claim.

`tools/fixtures/loading-ui-motion.html` mounts the actual loading/HUD adapters,
fonts, motion rules and responsive policy without world/renderer construction,
so their motion can be inspected independently. A renderer rAF gap is not
itself proof of an equally long compositor-animation stall, and removing
layout work here is not a proven cause/fix for historical 214–319 ms stalls.

Typecheck/core-unused and the public build passed after this UI change. Actual
browser checks of the fixture passed at 1440×900 and 390×844: a 50% fill retained
the bar's full layout width with `matrix(0.5, 0, 0, 1, 0, 0)`, a left origin,
and transform-only transition; neither viewport overflowed horizontally.
One hundred identical progress updates produced zero observed DOM mutations.
All six actual CSS animation-start events alternated `cot-pb-pop` and
`cot-pb-pop-alt` for 5, 4, 3, 2, 1 and rollout. The explicitly timed fixture
reached rollout at 5,054.5 ms; this checks presentation, not a new network clock.
Reduced-motion computed durations were 1 ms for both progress and numeral.
Restaging during an old fade retained `visible`, `covering` and grid display.
No browser page errors were reported.

Reviewed screenshots are in `/private/tmp/cot-loading-ui-motion.wWBk9a/`:
`desktop-progress.png`, `mobile-progress.png`, and `mobile-countdown.png`.
This is isolated UI evidence, not a new two-client loading/performance receipt;
the earlier frozen native report predates these UI-only changes.

The browser was closed. Vite intercepted the fixture wrapper's SIGTERM before
its final release statement; PID 52839 and the port-5173 listener were confirmed
absent. Its still-held empty capture lease was identified by unchanged mtime
and explicitly released, without touching foreign queued jobs. Future inline
Vite capture wrappers must use the maintained command owner's exit hook rather
than relying only on asynchronous `finally` cleanup. No preview was left idle.

## Destructible preparation: discarded collision bands and wall batching

The saved Winter attribution maps the remaining props slices to actual source
work: slice 70 is the onion-church collision derivation; 139/140 are small/large
sandbag pool refits; 152 is stone-wall finalization. These are reconstructed
from the original 121-slice profile, the 49 added pre-building checkpoints,
and the unchanged ordered pool tail (+58, matching the 179-slice native run).
They are source-backed attribution, not fresh native per-function timings.

Non-building pools consumed only `.contact` from a full collision profile.
The contact-only path now shares the original filtering and band construction
but omits discarded shell bands. Building pools still derive the full profile
and source solids needed for ground-cover clearance. Polygon order, collision
math, geometry and runtime broad-phase behavior are unchanged.

Stone-wall preparation now yields between batches of eight complete terrain
fits. It preserves record order and each fit's vertex/sample reduction order.
The checkpoints do not advance the progress percentage or publish partial
instanced meshes. Untransferred geometry has an explicit IteratorClose owner;
cancellation releases it before broken geometry or another pool can build.
Completed pools retain the existing intact/broken meshes and material budget.

This narrows two measured preparation costs. It does not explain the historical
214–319 ms gaps, remove network latency, or establish a global frame deadline.

The focused collision reuse test passes exact full-profile/contact-only parity
on both real sourced sandbags, primitive/open/dense/ignored geometry, mutation
isolation, and invalid/error inputs. It asserts exactly one constructed runtime
band. A single same-process CPU sample measured small sandbags at 10.35 ms full
versus 5.87 ms contact-only, and large sandbags at 18.25 versus 11.22 ms; each
omits two unused shell bands. These samples are not a native-frame speedup or
a statistical timing gate. The collision test's owned FIFO runner exited 0.

Final focused verification passes: 351 real seeded wall placements, 42 complete
batch checkpoints, four suspended cancellations, refit/fit failure cleanup,
exact geometry/record/matrix/RNG parity, and three destruction/reset cycles.
The maintained wall fixture also now binds the real night-fixture helper used
by its extracted current-runtime lifecycle. Props scheduling, frame scheduling,
progress, countdown, typecheck/core-unused, public build and diff checks pass.
The public artifact still contains 174 procedural playables and zero GLB-sourced
playables. Results: `/private/tmp/cot-loading-pool-batches.ixtTxZ/checks.json`.

The read-only world scan exits 1 with eleven diagnostics, all in selftests:
eight trusted repository-source execution fixtures, one deliberate sequential
checkpoint loop, and two low-leverage test lookup/property-access warnings.
The source/arguments were inspected: none executes player/network input or
adds runtime per-frame work. No suppression or unrelated runtime rewrite was
made; this is an explained nonzero scan, not a clean scanner claim. The combined
runner released its capture lease and exited 1 solely for that scan result.

No fresh native two-client frame measurement was taken after this final pool
change; the earlier deadline-build receipt and separate actual-browser UI
checks remain explicitly dated evidence. No new whole-match speedup, stall-free
claim, production deployment, commit or push is asserted by this pass.

## Current-artifact closeout

The verified pool/UI build was frozen without rebuilding at
`/private/tmp/cot-loading-pool-batches.ixtTxZ/dist`, index SHA-256
`dafa1d53abe4a8078b8a813d77c349b0c5e334d4d790bb6152609fb22265924c`.
Its first native acquisition (`native/report.json`) failed during guest invite
joining, before Ready or battle loading. The 65.83-second scenario retained
zero page exceptions or renderer crashes; all owned rooms, browser, preview,
signaling service and capture lease closed. Complete artifact and acquisition
identities stayed unchanged. This failed attempt is not entry/performance
evidence and has not been overwritten.

The test previously grouped invite navigation and both membership waits into
one stage and reported this exception as `unknown`. Its diagnostic-only update
separates those three operations and recognizes Puppeteer timeout subclasses
that inherit `Error.name`. Public receipts still expose only safe enum values,
never arbitrary messages, URLs or room codes. Actions, selectors, timeouts,
focus policy and runtime build are unchanged. Executable verifier failures for
all three operations, cleanup and private-data rejection pass, alongside the
immutable acquisition helper's 20 CPU cases. A fresh `native-r2` output uses
the same runtime artifact with this explicitly changed diagnostic acquisition.

That retry passed on the frozen artifact. Acquisition SHA-256 is
`87c79278dd3c66c379c5fe2443828249855ffc9ce74e4d8167892c0dd039ce6c`;
build and acquisition identity stayed unchanged throughout the run. The native
scenario took 18.69 seconds after 339.26 seconds waiting in the shared FIFO.

| Current-build observation | Host | Guest |
| --- | ---: | ---: |
| Network preparation, excluding countdown | 3,139 ms | 3,312 ms |
| World acquisition | 1,460 ms | 1,537 ms |
| Compile stage | 625 ms | 467 ms |
| Props synchronous work | 450.3 ms | 436.7 ms |
| Largest props slice | 22.2 ms | 21.5 ms |
| Largest covered-loading rAF gap | 132.4 ms | 129.3 ms |
| Largest post-reveal sampled rAF gap | 35.4 ms | 38.5 ms |
| Native 5-to-rollout interval | 4,980.1 ms | 4,914.5 ms |

Both observers recorded 5/4/3/2/1 in foreground, complete preparation,
primed reveal, hidden loader and nonblack source readback without rescue.
Battle snapshots and inputs advanced, native Garage return succeeded, and
there were zero page exceptions, renderer crashes or dropped observations.
The owner closed both rooms, browser, preview, signaling and capture lease;
no owned job remains running. The earlier invite failure did not reproduce.

This closes current-artifact functional validation of the loading/wreck pass.
The sample is local two-client evidence, not a production deployment or a
controlled statistical speedup claim. In particular, the observed covered
gaps are not zero; historical 214–319 ms stalls remain unattributed. The
separate desktop/mobile motion fixture and explicit loading-work reductions
support the implemented improvements without claiming perfect frame cadence.
At that historical measurement boundary the changes were uncommitted.
They subsequently landed in published `deaf6bf112`; see
[the delivery record](wreck-multiplayer-delivery-2026-09.md). That landing
does not convert the measurements above into a zero-lag or fleet-wide
performance claim.
