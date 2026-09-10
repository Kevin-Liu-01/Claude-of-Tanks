# Interactive performance investigation — 2026-09-09

Owner: this task's isolated `codex/interactive-performance-20260909` branch.
Baseline: `47e86743d` (`origin/main` when acquired). This is an open investigation,
not a zero-lag or release certificate.

## Current acceptance summary

Latest follow-up (2026-09-10): see
[covered deployment pacing and retained terrain programs](covered-deployment-pacing-20260910.md)
for the current publication, native action results, rejected image-decoding
experiment, and still-open cold-loading/Ready stalls. The dated checkpoints
below are retained history, not a replacement for that newer evidence.

Latest UI checkpoint (2026-09-10): hit-card preparation now uses an exact-output
worker with cooperative fallback. Native seven-case pixel parity, focused tests,
typecheck, public build and actual-controls day/night/Garage checks pass; see
the final sections for receipts and the still-open frame gaps. A final review
also preserves roster preparation across the ordinary network battle UI reset;
new roster preparation still supersedes older queued work.

Earlier integrated checkpoint (2026-09-10 04:29 UTC): the runtime is verified at
`889f7a6a80af90b1615c539c187b4e92fe6b1d45`; see the final integration evidence
below. All79 distinct planned affected/preservation checks have cumulative PASS
coverage, current typecheck/public build pass, and real-control day/night/Garage
plus audio ownership pass. The60-second full-roster camera probe responds to
all29 trusted inputs, but strict timing gates do NOT pass: p99=33.3ms and
median FPS=59.9. Other interactive-browser GPU activity also refuses timing
certification. This is a verified implementation checkpoint, not completion of
the zero-lag investigation. Earlier rows below retain their dated evidence.
Publication subsequently completed at `18e519d35`; production's exact-version
day/night/Garage and audio-state smoke passed at04:37UTC. Its338ms cold-loading
gap is retained below, not mislabeled as a smoothness pass.

| Deliverable | State and evidence |
| --- | --- |
| Runtime improvements | Implemented: HUD no-op filtering/ammo caching, allocation reuse, cooperative grass and exact private vehicle staging, responsive covered transitions, audio startup ordering, Garage/context recovery, full-scene GPU warm, batched program cohorts, exact sky-horizon caching, bounded prop conversion. R10 gates competing Garage work and stages shader submission; R11 coalesces overlapping Garage drains; R14 moves fixed and ordinary mutable base painting to a bounded worker with exact main-side roughness correction. |
| Type/build/static checks | R14 ten focused checks, full typecheck/public build, independent scoped review and metrics pass. The isolated checkpoint passed eight integration checks, fresh Doctor with zero findings, typecheck and build after rebasing onto main's test-runner update. A fresh unchanged-budget full-fleet check passes in 158.0 seconds (164 demand-loaded vehicles / 200 profiles); the initial timeout remains recorded with cause unproven. |
| Texture-worker fidelity | R14 compiled native parity passes seven base recipes, five fixed public-cache cases and two actual four-argument mutable-cache/promotion cases: all RGBA channels, feature plans and texture policies match exactly. All 16 native worker replies and owned cleanup are verified. This is fidelity evidence, not an application speedup measurement. |
| Functional/native interaction | R14 day battle, night rematch, Garage return and audio ownership pass with full 14-tank rosters; all three stills inspected. The application now constructs material workers; successful replies are proven separately by native parity. Raw callback gaps remain 250.7/134.3/51.9 ms; no causal speedup or smoothness certificate. R5 all-ten-Garage/mobile/switching/residency remains earlier evidence. |
| Broad regressions | All879 registered checks have cumulative PASS coverage after the narrow Mangrove correction passed its three affected tests at23:06:42 UTC. Historical failures and source cutovers remain recorded; this is not an uninterrupted green invocation or post-R9 certification. |
| Camera and frame budgets | R10 full-roster 60-second battle: 29/29 trusted camera inputs respond; 1.1 ms median/2.0 ms maximum observed-dispatch-to-camera latency; 16.8 ms p99 frame interval; 897 peak draws. The unchanged median-FPS gate still fails at 59.9 vs 60, and foreign GPU activity refuses certification. |
| Historical stall diagnosis | Several current transition costs are attributed and improved; the specific historical 214–319 ms gameplay stalls remain unproven. Native constructor/readback/upload calls can still block; covering them is not elimination. |
| Systems-language assessment | Documented C/Go/Zig/Rust/worker tradeoffs; no native/Wasm kernel benchmark or whole-game rewrite claimed. |
| Publication | Texture worker `bbc1d77f1`, retained HUD `1beb0c780`, and integrated runtime `889f7a6a8` are published. Production `18e519d35` (runtime plus evidence-only documentation) passed the exact-version actual-controls day/night/Garage and audio-state smoke. Strict performance acceptance remains open. |

The implementation and positive tests must not be summarized as “all lag fixed.”
A valid quiet-machine timing acquisition and remaining strict-budget work are
still required for that acceptance decision. No visual-quality or test-budget
reductions were used to turn failures into passes.

## Scope and proof contract

Cover cold boot, settled and interactive Garage, vehicle/environment switching,
solo loading/countdown, live camera/movement/shooting, and return/re-entry.
Preserve authored visual quality, deterministic 60 Hz simulation, input behavior,
and existing cache/cancellation ownership. Do not alter fleet geometry or world
art merely to obtain faster numbers. Multiplayer invariants remain regressions,
but this pass starts with ordinary solo battles.

Measure separately:

- Navigation, transfer, application work, covered loading, and first controllable
  frame. A covered freeze is still a responsiveness failure.
- Actual submitted-frame CPU work, rAF gaps, long tasks, GPU work where available,
  and input-to-presented-update latency. An rAF gap alone does not identify its cause.
- Heap, GPU/scene residency, draw calls and primitives over repeated phase cycles.
- Effective quality, hardware renderer, viewport/DPR, exact roster/map/camera,
  cache state, source/build hash, probe version, and other machine activity.

Use the maintained cold-load, Garage-entry, phase-resource, loading-budget and
motion probes. Keep their original gates; record failures, not just favorable
samples. Initial interactive target: no application-attributed task exceeding
50 ms, a 16.7 ms 60 Hz frame budget, and next-presented-frame input response.
Report actual percentiles and worst frames even when targets fail. These targets
are not promises of zero physical/network/display latency on arbitrary hardware.

Native browser probes run serially under `tools/capture-lock.mjs`. Do not compare
timing taken during another renderer or a saturating build/test. CPU profiles are
attribution runs, separate from unprofiled acceptance samples.

## Baseline inventory

- Plain Three.js/Vite/TypeScript; not React/R3F.
- Read-only React Doctor scanned 2,042 files: 43/100, 659 findings (68 errors,
  591 warnings). Its whole-repository heuristics include test fixtures and tools;
  findings must be confirmed in live hot paths before edits. This is not an FPS
  score. Raw diagnostics: `/var/folders/yl/sxf0v4tn14n2pkwqmf_21l540000gn/T/react-doctor-ef7aba9c-6489-4348-927e-f1398d82c1d9`.
- Previously shipped rounded-box caching, fitting-buffer ownership, ERA reuse,
  and one-bake night environment entry are already in this baseline.
- Historical 214–319 ms gameplay stalls remain unattributed. The previous
  release suite's separate Node/V8 native crash is not evidence of their cause.

## Work in progress

1. Acquire matched browser baselines and a bounded CPU profile.
2. Rank source-confirmed frame/input and transition costs against those traces.
3. Implement the highest-value verified change with independent regression tests.
4. Repeat identical unprofiled scenarios and inspect rendered interaction.
5. Evaluate worker/Wasm boundaries and language costs against measured work;
   do not substitute a language migration for a bottleneck diagnosis.

## First measured checkpoint

Raw local artifacts: `/private/tmp/cot-interactive-baseline.gsRCvU`.
`phase-production.json` is the unprofiled public-build baseline, index SHA-256
`3272c01e4e0f833f909b923588fce2405ebd0fca67a2914caa88b18fb89be54c`,
Chrome 151.0.7922.47, native Apple M5 Max ANGLE/Metal, 1280×577 DPR1,
high preset, dynamic scale 1, trim 0. The pinned mixed 14-tank Verdant battle
rendered 477 frames over 8 seconds and used 10.99 ms CPU-task time per rendered
frame. It performed 482 layouts and 493 style recalculations. This is an average
CPU-work measurement, not a worst-frame or input-latency certificate.

The original resource gates remain unchanged and failed 10 checks: Garage
309,447/313,093 submitted triangles before/after battle (limit 240,000), battle
1,356 objects, 233 programs, 741 renderer geometries, 318 renderer textures,
767 visible geometries, 258 visible materials, 132 visible textures and 28,914,944
visible texture pixels. No page/console/network errors. These baseline
failures are not made green by changing thresholds or lowering visual quality.
Idle Garage rendered only two frames in 8 seconds and used 0.011 CPU cores;
its 42.563 ms task-time-per-render amortizes unrelated idle work and must not be
reported as a 42.563 ms animation frame.

The earlier `phase.json`/`battle.cpuprofile` are **development attribution only**:
an invocation wrapper dropped the initial `--production` argument. They are
retained and explicitly excluded from production acceptance. That profile
identified repeated `battleHudLayout` observer DOM discovery/measurement
(approximately 177 ms querySelectorAll and 81 ms getClientRects in 8 seconds).
Source tracing confirms the special-action HUD removes an absent `pending`
class every frame; DOMTokenList still emits an observed attribute record.

Implemented, pending matched browser acceptance:

- Filter layout callbacks against retained final attribute values, seeded when
  each target is observed. A remove/re-add batch with the same final state does
  not trigger measurement, including its first callback and late-discovered
  targets. No old-value string capture is required. Retain genuine resize,
  visibility, child discovery and virtual-keyboard signals.
  Avoid unchanged CSS output writes. A deterministic observer test covers 600
  no-op records without a new layout, real changes and coalescing.
- Retain ammo DOM handles, copied primitive values and the current locale;
  unchanged frames do not repaint icons or relocalize labels. Mutable ammo cards,
  optimistic selection reconciliation, ATGM pending/depletion, drawer ARIA and
  reload sweeps remain live.
- Reuse bot support context and caller-owned module-repair output buffers;
  default repair API results remain independently owned. Six focused simulation
  tests passed, including combat 532, movement 135 and spotting 99 assertions.

The native world-owner A/B separately found deferred grass construction inside
supposed-settled frames (`world.update → advanceDeferredGrass → makeTuft`).
The urgent path could finish the previous job and an entire new chunk in one
update, bypassing the ordinary 250-candidate batch. Instance writes and bounding
sphere generation were also unsliced. The first bounded state-machine fix now
charges candidates, Float32 instance writes, exact ordered bounding-sphere unions
and final publication to a cooperative 1.5 ms / 250-step update. A step itself,
typed-array allocation, and GPU upload are not preemptible. Independent tests
compare the original RNG stream and output buffers under multiple slicing
policies; cancellation, exclusive staging ownership and rollback are covered.
The near-carpet cold/cell-crossing rebuild was a separate synchronous path.
It now uses a bounded cell/candidate/cache/write/publication controller with
inactive-buffer writes and atomic publication. It retains the original seeded
cell order, Float32 output, clearance, density and fades. The 4,096-step / 1.5 ms
cooperative cap is separate from the midfield cap: a 250-step write cap could
starve a 20,000-instance carpet while a vehicle continuously crossed cells.
Independent sustained-motion tests require publication to keep advancing;
they prove scheduler liveness, not a native frame-time budget. Cold placeholder
slot zero remains hidden while partial buffers upload.

Sixteen frozen focused regression files passed after these integrations,
including actual vegetation resource/clearance checks, loading ownership,
retained ammunition/observer updates, repair-buffer ownership and probe contracts.

An earlier changed-scope React Doctor invocation scanned 37 files and reported
49/100, six findings (five warnings, one error); the initial full scan used a
different scope, so the scores are not a percentage improvement comparison.
All five await-in-loop warnings concern intentional cooperative loading yields
or their tests; parallelizing them would break bounded work or generation
ownership. The eval finding is the renderer-free `loggingYardGrass` oracle's
`new Function` over exact locally read production source, not user/network input
or a runtime loading path. No scanner rule was suppressed. Raw final diagnostics:
`/var/folders/yl/sxf0v4tn14n2pkwqmf_21l540000gn/T/react-doctor-29d0344d-f59c-452b-9c03-423d89bf6d54`.

## Functional verification checkpoint

Frozen native Chrome HUD regression: 297 state/viewport checks passed with zero
browser errors. A second normal-motion run on desktop, short laptop, landscape
phone and portrait phone passed 74 checks, also with zero browser errors. Both
exercise the actual DOMTokenList/MutationObserver path and require no repeated
layout measurement for unchanged per-frame class removals. The exploratory first
run had one mobile ammo hide-animation overlap; the frozen full rerun and normal
motion subset use the same overlap gate and pass. This is functional evidence,
not a production frame-time certificate.

World readiness is now observable at probe checkpoints (pending visible/ahead
chunks and active work stage). Acceptance must compare it alongside submitted
geometry so merely delaying grass does not masquerade as a performance gain.
The original public bundle is retained at `baseline-dist` in the artifact folder
for matched acquisition against the candidate.

## First candidate: production evidence and limitations

`candidate-r1-dist` is a separate frozen public build (index SHA-256
`7369bb2932c41d9097b732bb1e948ce19c79eab80f1c632eef75aaa677ea72b9`).
It contains the HUD, repair/bot allocation and midfield scheduler changes; it
does **not** contain the later near-carpet scheduler, exact-camera loading or
Garage-return preload/recovery changes. Its typecheck and public build passed.

An attribution-only production CPU profile (`candidate-r1.cpuprofile`) has zero
sampled time in `querySelectorAll`, `getClientRects` and `getBoundingClientRect`.
This supports removal of the earlier repeated HUD discovery/measurement path;
it does not prove every layout is free. CDP still counts roughly one layout per
render, which is not evidence that the old observer hot path remains. Main
Three.js rendering/matrix/shadow work now dominates sampled active CPU time.
The profile includes profiling overhead and a probe GC; neither its GC samples
nor its frame durations identify the historical 214–319 ms stalls.

The matched eight-second phase pair retains the same effective quality and
resource counts. Baseline/candidate used 16.528/15.455 ms CPU-task time per
render. Both failed the same eleven unchanged resource/CPU gates. The earlier
baseline was 10.99 ms, so this single pair is **not** a reliable percentage speedup.
Candidate midfield checkpoints had no pending visible/ahead work.

The separate 60-second, native-cadence-requested, first-control-edge runs were
both explicitly refused certification due to machine contention. Baseline:
2,958 frames, median/p95/p99 16.7/25.6/33.4 ms, peak load 38.64 on 18 cores,
six foreign headless GPU processes. R1: 2,920 frames, 17.1/25.3/25.9 ms,
peak load 26.7, nine foreign headless GPU processes. Other interactive-browser
GPU CPU reached 287.7%/175.9%. No browser errors, quality scale 1 and trim 0.
These are retained diagnostic observations, not passing frame gates. R1 also
failed worst-frame draw calls (926 > 900) and raw/floor heap slope (1.43 MB/s > 1);
no pre-window GC was performed, so retained-growth is correctly unavailable.
Different later battle trajectories/actor visibility also preclude treating
their submitted triangle counts as a matched static A/B. Both actual starting
rosters are recorded rather than inferred from the requested preset label.

Raw receipts: `phase-matched-baseline.json`, `phase-matched-candidate-r1.json`,
`early-baseline.json`, `early-candidate-r1.json`, and their frame/log companions
under the artifact directory. Source edits during frozen-build acquisition are
reported independently; neither probe infers a bundle's source from the current
checkout hash. A quiet-machine repeat remains open.

## Second candidate: loading and interaction boundaries

The loading owner now prepares the actual solved opening camera before priming
ground cover. The former guessed warm-camera location could select a different
grass cell from the revealed camera. Solo deployment and network presentation
both use the exact view; observer entry supplies the selected spectator entity,
not the first roster row. Visible observer camera blends are unchanged.

Successful solo warming returns a generation-bound readiness guard. The loader
requires and rechecks it across Ready dwell, fallback priming and fade awaits.
Superseded generations and failures before completed ground cover reject rather
than taking the old reveal-anyway fallback. A shader-only fallback is retained
after completed ground cover. Tests compose the real loading, deployment and
ground-cover owners, including cancellation inside cover/FX/post/reveal/dwell/
fallback/fade. Borrowed FX state is restored on cancellation.

Spectator orbit, wheel and target cycling pause while `renderingCovered` or the
loading screen covers the battle. Covered cursor deltas are discarded. Initial
observer selection and revealed countdown controls remain available. The
actual-controller regression checks listeners, exposed cycling and cleanup.

Garage return code is preloaded only under covered solo/network module
acquisition, not on the boot path. Rematch pending waits occur under the veil;
their 15-second deadline rejects before teardown or report dismissal. Missing
or disabled real Garage Battle buttons fail immediately. An acknowledged async
click that never acquires loading coverage still has an explicit 15-second
deadline because the existing DOM route does not expose a completion promise.
Failures release the action latch, allow retry and lazily reuse the accessible
error modal. Canonical enter/restore and room/mode routing remain owners.

`candidate-r2-pre-recovery-dist` is an **intermediate**, separately frozen public
build (index `5a1bb2bb577740deb26638df02e2c40baacbb2ca9c5f9d6567f24719ab045862`).
It includes the grass, exact-camera and rematch work, but predates the final
composed cancellation guards and observer-input/focus fixes. Its typecheck and
public build passed. Do not attribute the final repairs to this native receipt.

The trusted-click `garage-actions-r2-pre-recovery/report.json` passes all three
functional actions: Battle, Battle Again and return to Garage. Battle ordinal,
selected vehicle/map, hero restoration and completed opening grass all match;
page and cleanup errors are zero. Cover acknowledgment took 373/203/109 ms.
Total action duration was 29.59/45.81/0.377 seconds. Reported maximum rAF gaps
were 17.52/33.73/0.122 seconds; these are NOT a loading-smoothness pass and require
separate timeline attribution. Functional success must not hide those failures.

The intermediate 30-second moving/camera sample is also not certified: median/
p95/p99 frame time 25/33.4/34.3 ms, worst draw calls 926 (limit 900), and severe
machine contention (peak load 38.76 on 18 cores; seven foreign headless GPU
processes; other interactive-browser GPU CPU up to 207.4%). Thirteen of fourteen
trusted camera pulses responded; one was refused because input was not quiet
after delayed commands bunched together. The incomplete input gate remains red,
not silently excluded. Subsequent final-build evidence must be recorded separately.

### Final source verification

All 28 final owner-focused regression files passed under the shared FIFO runner
(`final-owner-focused.log`, exit 0). This includes actual vegetation/resource
tests, composed loading/cancellation, camera and network warm integration,
rematch/recovery, observer controls, retained HUD and combat/AI ownership.
An independent read-only review found all three earlier reveal-boundary blockers
resolved. Native TypeScript checks and the final public build passed.

`candidate-r2-final-dist` is frozen with index SHA-256
`0d91e5cadaf2838256f378bdd2e4f14f1fe46a0b28caa9efe9b810b0e6492267`.
It includes the final cancellation and observer repairs. Source changes after
this build must not be attributed to it. Full `npm test` remains in progress;
the slow 164-visible-model demand sweep and 174-tank wheel-quality sweep passed.
The baseline's stale `loadingIntent` source assertion was also corrected: it
now requires both `precompile: false` and `atmosphere: 'covered-battle'`, with
wrong-atmosphere and eager-compilation negative controls. No product option was
changed to appease that test.

### R2 final native evidence — a real night-watchdog failure

The final normal-motion HUD run passed another 74/74 checks across all four
viewports, with zero browser errors (`hud-layout-final-motion/report.json`).

The final 30-second early-control moving-camera run observed all 14/14 trusted
camera pulses. Command dispatch to observed camera change was 0.5–3.3 ms;
next-rAF observation was 8.2–34.8 ms, not input-to-photon latency. The acquisition
now preserves actual two-second pulse spacing instead of catching up overdue
commands in a burst; insufficient remaining time is an explicit dropped pulse,
not a hidden pass. All 3,221 frames had median/p95/p99 8.3/16.7/17.6 ms. Original
numeric resource gates passed (545 median / 878 maximum draw calls, 4.50M median
triangles, 160.2 MB textures, negative measured heap slope). **Environment
certification was still refused:** peak machine load 11.41 exceeded the 9 limit,
and other interactive-browser GPU CPU reached 87.9%, despite zero foreign
headless GPU processes. Do not claim a clean-machine certificate or compare a
percentage improvement against the heavily contended earlier runs.
Raw receipt: `early-camera-r2-final.json` and its frame/log companions.

The unprofiled real-action test (`garage-actions-r2-final/report.json`) reached
all three correct destinations with zero browser/cleanup errors, but **failed**
the unchanged 500 ms cover gate on rematch: 557.5 ms. Battle and Garage cover
acknowledgments were 218.4 and 88.6 ms. Total durations were 7.465 / 30.384 /
0.348 seconds. Functional destination success is not smooth loading.

Bounded rAF endpoint and Long Task receipts now separate observed gaps from
their causes. The night rematch contains one 24,916 ms main-thread task covering
virtually its entire 24,917 ms callback gap while the Ready veil remained up.
The GL diagnostic recorded shadows-off, environment-off and fog-off retries,
each rejecting a valid dark scene with measured bands of 3.0–3.6 against a
threshold of 6. The final screenshot still renders the night town, terrain and
headlights correctly; there were no shader errors or successful rescue. This
is direct evidence of a false black-scene recovery path, not evidence that
terrain generation took 25 seconds. The loader's hide stage took 24,953 ms.
A bounded night-aware diagnostic and lifecycle-safe delayed callbacks are being
implemented without disabling true black-scene protection or lowering quality.

The daytime countdown also contains an 841 ms main-thread task after the veil
was gone. Enemy model builds had already completed; those individual builds
took 27–38 ms, so model construction alone does not explain it. An opt-in CDP
CPU profile is being acquired for function-level attribution. Its timings are
explicitly diagnostic-only and must not replace this unprofiled acceptance
receipt. Neither new stall establishes the cause of historical 214–319 ms
gameplay stalls.

### Function attribution and third-candidate repairs

The opt-in `garage-actions-r2-profile` acquisition uses the same frozen R2 index.
CPU sampling is attribution-only; profiler start/stop page-clock brackets leave
approximately 47–50 ms alignment uncertainty. It identifies four concrete paths:

| Observed task | Frozen source/call path | Dominant sampled operation |
| --- | --- | --- |
| Day countdown, 3,349 ms | Delayed solo scene watchdog → band measurement | Synchronous native `readPixels`, 3,346 ms |
| Night countdown, 32,182 ms | Same watchdog → false-black recovery ladder | Initial readback 3,234 ms; shader uniform reflection about 28,480 ms |
| Rematch, 737 ms before first opaque-cover observation | Garage GPU restore → `initializeSteps` → `getUniforms` | `getProgramParameter(ACTIVE_UNIFORMS)`, about 733 ms |
| Day countdown, 314 ms | `warmNewRendererProgramUniforms` | Cold uniform reflection; receipt independently records maximum 306 ms |

The watchdog caller is `main-DGCgxSlT.js`, line 2237 column 28440, scheduling
`Ea(...)` after 1,800 ms. The deferred enemy-visual stage's multi-second elapsed
duration includes the unrelated watchdog interruption; it is not evidence of
multi-second tank construction. Rare destruction-effect warming was zero in
both actions. The original profile and failed cover gate are retained.

Repairs being verified together: explicit authored-night probe normalization
with synchronous restoration; asynchronous PBO readback for healthy scheduled
checks, with in-flight scene-entry ownership; shader completion checkpoints
before cold uniform reflection; and real CSS-opacity plus a rendering
opportunity before transition work rather than a nominal fade timer. A hidden
tab must still progress, stale transitions cannot hide a newer veil, and a
visible veil that never becomes opaque fails finitely. This is not a physical
display acknowledgement or a reduced visual-quality workaround.

The frozen R3 source passed 12 final focused regression files, including the
actual uniform-warm/Garage owners, deferred-warm cancellation, synchronous and
asynchronous watchdogs, transition ownership, Garage return, probe contracts,
and discovery of all 874 ordered suite checks (`r3-final-focused.log`). Two
independent reviews approved the night/watchdog and transition lifetimes and
the final strict uniform-completion/cancellation repairs. An in-memory negative
control removing the transition caller's post-await owner guard makes the
actual-runtime regression fail; the positive test is not merely source-text
matching.

Strict Garage initialization rejects an invalidated or incomplete shader cohort
before fallback compilation, shadows, uploads or rendering. Legacy warm callers
retain their existing silent-cancellation contract. A rejected older deferred
warm task cannot cancel a newer successor. Composed tests cover real owner
invalidation at seven boundaries and stale work resuming after replacement.
The first R3 typecheck acquired source five seconds before the final return-type
patch and failed; that failure is retained in `candidate-r3-build.log`. The fresh
frozen-source typecheck and public build both passed
(`candidate-r3-final-build.log`). `candidate-r3-final-dist` has index SHA-256
`c1f236c6ad0d721d729302c7e304645d04cc41660e242271aa52d6ff59a13da3`.
The native R3 results below supersede its initially pending acceptance status;
unit success alone was not evidence that the measured stalls were gone.

### R3 acceptance caught a rematch regression

`garage-actions-r3-final/report.json` is retained as **FAIL**, not superseded
silently. The first Battle completed in 9.216 seconds, acknowledged cover in
279.2 ms, and recorded no black-scene recovery errors. Its six newly warmed
enemy programs reported 33 ms elapsed, zero rounded milliseconds for the
largest individual query/reflection operation, and zero failures. The largest
action callback gap was still 276.7 ms (a 267 ms main-thread task at initial
click), with additional 50–140 ms loading/model tasks; this is not a smoothness
certificate.

Rematch acknowledged opaque cover in 156 ms but failed with
`ProgramUniformPreparationError: budget`. The visible Retry loading modal
preserved a recoverable Garage rather than exposing incomplete resources. The
test timed out after 90 seconds because its original harness waited only for
success. A separate 806 ms main-thread task occurred during covered Garage
restore; its precise native operation needs attribution, not inference.

The subsequent same-build attribution run (`garage-actions-r3-profile`) failed
at the same budget boundary, with a shorter 571 ms rematch task. Within it,
443.172 ms of samples are native `getProgramParameter(ACTIVE_UNIFORMS)` and
47.256 ms are `texSubImage2D`, under the ordinary RAF/composer render. Warmup
samples precede that frame: failure unwinding its pending-only rendering guard
is better supported than a claim that rendering bypassed an active restore.
The profile's start/stop clock brackets narrow its page offset to
10,086.200–10,095.912 ms, and the dominant samples remain within the task across
that interval. These durations do not replace the separate unprofiled 806 ms
observation.

The same profile identifies a different first-click cost: 154.354 ms sampled at
`new AudioContext({ latencyHint: 'interactive' })`, reached from lazy audio
`resume()` in `soloBattleLoadingRuntime.begin` before the loader's first yield.
It is inside the profiled 188 ms first-click task for the full 2,932.941–2,962.041
ms alignment bracket. It is not a WebGL stall and does not establish the cause
of historical gameplay stalls.

Source inspection identified the missing integration condition: Garage restore
uses `createOpaqueLoadingYielder(8, Infinity)`, so even forced yields are only
JavaScript task opportunities. The new strict shader drain can consume its
1,024 pending-query rounds in about one second, before its five-second elapsed
deadline, without an animation/paint opportunity. The correction gives shader
readiness its own bounded paint checkpoint while retaining ordinary task-budget
yields for shadow/upload work. The original bounds and failure guards remain.
This follow-up must pass the actual browser flow before R3 can be called fixed.

The separate 60-second frozen-R3 movement/camera receipt observed all 29/29
trusted pulses, with no missed, unsupported or dropped inputs. Dispatch to
camera change was 0.7–3.9 ms; next-rAF observation was 22.3–42.1 ms, not displayed
input latency. The 3,525-frame sample had median/p95/p99 16.7/16.8/33.3 ms.
Original gates **failed** median FPS (59.9 < 60), p99 (33.3 > 25 ms) and worst
draw count (997 > 900). The 4.77M median triangles, 166.9 MB textures, 1.28-second
boot, measured heap slope and zero console errors pass their limits. Machine
certification remains **REFUSED**: another interactive browser's GPU process
reached 68% CPU (limit 15%), despite zero foreign headless GPU processes and
machine load below its limit. Raw receipt: `early-camera-r3-final.json`.

The R3 Garage environment probe passed selector-intent races, all ten authored
environments, persisted reload and responsive layouts. Each later environment
switch stayed at or below 33.4 ms maximum observed rAF gap; rapid intent was
16.7 ms and the 30 measured same-browser environment cycles reached 33.4 ms.
Renderer geometries/textures remained 359/98 before and after, with 6.3 MB heap
growth within the existing limit. This is controlled functional/residency
evidence, not a native-vsync certificate or repeated battle-return leak proof.

The same Garage probe still **failed** its workshop-completion interval:
899.9 ms maximum rAF gap across 7.28 seconds. That interval begins after the
first selector race, not at initial navigation, and includes all page activity
while optional exhibits finish. Existing asynchronous bay durations cannot
attribute that gap to a JavaScript call. A bounded profile and timestamped gap
endpoints are needed; no quality/content is removed to make this gate pass.

The independent vehicle lane subsequently reported seven new Abrams variants
on `origin/main` at `92b328a83` (documentation `5aab94fe3`): 181 roster rows,
2,258–5,216 gameplay armor records per added tank, and a 14.5→28.4 MB icon
manifest. These are separately reported future profiling costs, not changes in
our frozen 174-tank baseline or proof that this pass includes that new roster.
The environment lane's concurrent water/contact work is likewise outside this
frozen acceptance scope. No geometry/art changes are folded into these timings.

### R4: rematch readiness repaired; remaining costs retained

`candidate-r4-dist` index SHA-256 is
`62bf2c385d6b4a740f10aa83106299873e51293f38104c221f9ab0fa8e278148`.
Typecheck and public build passed. Three focused shader/Garage/deferred-owner
tests and an independent review passed. A composed negative control using the
old task-only checkpoint exhausts 1,024 polls; the real frame checkpoint succeeds
without weakening completion, lifetime or five-second guards.

The unprofiled actual-control run (`garage-actions-r4-final/report.json`) now
passes Battle, night Battle Again and return to Garage, with zero page, GL
diagnostic or cleanup errors and no black-scene rescue. Total durations are
8.334 / 6.508 / 0.486 seconds; cover acknowledgments 272.9 / 149.1 / 141.4 ms.
This is **functional-only PASS**, not loading-smoothness acceptance. Largest
callback gaps remain 270.5 / 365.6 / 159.7 ms and longest main-thread tasks
263 / 349 / 140 ms. The rematch's exact Garage settle render reports 343 ms
despite successful bounded hero-program initialization; a fresh profile is
required before attributing that remaining render cost. Final return reuses
resources and its settle render takes 4 ms.

The separate frozen-R4 action profile confirms remaining costs rather than
relabeling functional PASS as performance PASS. Its rematch settle task is
335 ms: about 251 ms sampled uniform reflection, 45 ms texture upload and 9 ms
shader submission inside the exact restore `post.render`. Hero-only preparation
and an empty scene-upload list are confirmed source/receipt gaps; CPU samples
alone do not identify the specific cold material. Garage world-services work
also renders a newly constructed sky-horizon probe, with 89–99 ms reflection
and 24–27 ms synchronous readback; environment validation adds more. A separate
267 ms covered task is Canvas `getImageData` in `heightToNormalSteps`, not that
WebGL settle frame. Raw profiles and page-clock brackets are preserved in
`garage-actions-r4-profile`.

The bounded workshop profile (`workshop-r4.cpuprofile`, its receipt and
`workshop-r4-run.json`) did **not** reproduce the earlier 899.9 ms stall. The
initial measured window lasted 6.637 seconds with a 25.3 ms worst callback gap;
all environment gates passed in this attribution-only run, with no GL recovery
or errors. Profiler startup preceded the frame sampler by 216.1 ms and can
perturb cold scheduling. No cause or fix for the earlier 899.9 ms observation
is inferred from this non-reproduction. GPU/program work is still sampled,
but there is no 900 ms native interval in this profile.

### R5 source checkpoint

The Garage-return owner now marks presentation unready before its first
scene/phase mutation. A failed restore retains that state after its pending
promise settles; a successful full covered retry releases it. Direct re-entry
coalesces, and the ordinary-frame guard applies the failed state only in Garage
while retaining network servicing. Four focused lifecycle/frame tests and an
independent review pass.

First solo Battle audio startup now crosses the existing paint/task checkpoint
when the browser positively reports prior sticky activation. Legacy/unknown
activation retains its synchronous gesture unlock; Ready preparation is
unchanged. Cancelled or superseded waits cannot revive loading audio. Device
failures use the existing covered entry recovery and failed mixer graphs are
not published as ready. Three focused tests, including actual composed owners,
and independent review pass. This moves unavoidable synchronous device startup
behind visible acknowledgement; it does not eliminate that native device cost.
Native acknowledgement and running-clock verification remain required.

The combined R5 source also prepares the entire visible Garage scene when its
hero/program set changes, not just the hero. A changed resident visual now
receives bounded texture/buffer uploads before the exact post frame; an unchanged
resident return still skips both warm passes. A composed two-mesh test catches
the previous hero-only omission, and strict failure/cancellation coverage remains
green. Independent review found no blocker. Native settle timing is still pending.

Repeated exact sky settings now reuse up to four renderer-scoped CPU horizon
colors. The cache includes the shader inputs and output/color-management state,
invalidates on context generation/loss, clones results and never retains temporary
GPU resources or failed/black reads. Misses preserve the authored probe and its
luminance clamp, with exact render-target/cube-face/mip restoration. First-use
sampling is not eliminated. Focused sky/cache tests pass.

The initially queued R5 build was cancelled before lease acquisition to combine
these fixes in one verified build. Its empty log is not a build result, and no R5
dist snapshot existed at that cancellation boundary. Native action timing also
now supports an optional passive audio gate: actual context-clock advancement
during covered loading and inactive loading/ambient owners after Garage return,
without autoplay overrides, injected unlock calls or synthetic audio playback.
This verifies clock/lifecycle behavior, not sound at physical speakers.

An intermediate experiment made temporary height canvases request
`willReadFrequently` on first context creation, before painting. This experiment
was subsequently rejected and reverted; it is not in the corrected R5 candidate.
Output/normal/grain canvases retained their policies.
Actual extracted painter tests cover eight size/finish variants, exact operation,
feature and RNG transcripts, normal/roughness bytes, missing-context failure,
and no-hint/late-hint/extra-RNG negative controls. These and the real CPU shared
texture lease lifecycle test passed on September 9 at 19:55 UTC. They do not
prove native raster parity or speed; the matched native benchmark measures total
painting plus readback and normal generation, not readback alone.

The passive audio tooling's three focused tests pass, with 75 functions and no
complexity/type-widening violations. A final source review then found an actual
recovery edge case: successful WebGL restoration alone could not clear a failed
canonical Garage return's retained readiness guard. The second queued R5 build
was also cancelled before acquiring its lease (no build or snapshot) to include
the canonical return recovery correction rather than releasing a known freeze.

### R5 measured rejection and verification follow-up

The retained reproduction tool is `tools/height-canvas-readback-probe.mjs`.
Run `node tools/height-canvas-readback-probe.mjs --out=/absolute/fresh-directory`
for the isolated painter/normal-generator A/B; it does not load the game or
measure end-to-end frame time. Keep the rejected candidate reproducible without
enabling its context hint in production.

The standalone native height-canvas A/B completed with Chrome 152 / native Apple
M5 Max at 1024 pixels, matched seed/finish, one warmup and three alternating
pairs (`height-readback-r5-ab/report.json`). **Reject the context-hint candidate**:
median total work increased from 12.1 to 26.1 ms. Painting rose from 0.6 to
15.3 ms while readback improved only from 4.3 to 3.3 ms. Height/normal pixels
were not exact (maximum channel differences 24/28). The original painter policy
is retained. This isolated benchmark does not reproduce the earlier live
267 ms backpressure stall or certify game frames; the full-scene warm correction
must be measured with the original painter in the actual action flow.

The first completed R5 build passed typecheck/public build at 20:04 UTC, index
SHA-256 `b62ebf7eb891017dbc08cae8235820cc0997e59ba40866c60bc5e638fc9a525a`.
It is an intermediate, not a release candidate: it contains the rejected hint
and precedes the final post-await context-lifetime checks. The snapshot remains
untouched at `candidate-r5-final-dist` for traceability.

The complete pre-test suite passed. Core then failed at
`src/fx/lazyRuntime.selftest.mjs:180`: its extracted network loading callback
fixture omitted the newly required `garageReturn` port and threw before optional
texture prefetch began. The production optional-download ordering is retained;
the fixture is corrected and strengthened for pending/rejected essential preload.
Resume the ordered core suite at that failed test and run post tests afterward;
do not describe the earlier stopped invocation as a full-suite pass.

The newer changed-scope React Doctor scan (`react-doctor-r3-final.log`) covers
48 files: 49/100, 21 findings (15 cooperative await-loop warnings and six local
source-oracle eval findings). Those oracles evaluate exact repository source in
Node tests, not user/network text in the application. No rule was suppressed;
this is neither an FPS score nor a comparable-scope speedup against the baseline.
Its raw diagnostics are at
`/var/folders/yl/sxf0v4tn14n2pkwqmf_21l540000gn/T/react-doctor-2edecae1-fd4c-4cf3-ada5-cd1622c44913`.

### Corrected R5: actual controls, audio, and Garage acceptance

`candidate-r5-corrected-dist` passed typecheck and public build at
2026-09-09T20:10:24.961Z. Its index SHA-256 is
`6c19d63d7756ea311f1f3178c243227e326e970f9951ed87ed7fb6a068911865`.
It contains the original height painter and the final context-recovery guards.
Actual renderer-listener and composed Garage-owner tests cover stale restoration
promises, repeated context loss, retained failed entry, and full canonical retry.
An old restoration cannot dismiss a newer failure overlay or clear readiness
after an intervening phase/context change. No native context-loss injection is
claimed by these source-level tests.

The real-button native Chrome 152 run at 1280×720, high quality, native M5 Max
passed all three actions and the optional passive audio-clock gate, with no page,
graphics, cleanup, or black-scene-recovery errors. Hashes before/after acquisition
match. Raw evidence: `garage-actions-r5-corrected/report.json`.

| Action | Total ms | Visible cover acknowledgment ms | Worst callback gap ms | Longest main-thread task ms |
| --- | ---: | ---: | ---: | ---: |
| Battle | 7,818.4 | 23.0 | 275.3 | 266 |
| Night Battle Again | 9,170.0 | 216.3 | 243.4 | 210 |
| Return to Garage | 480.5 | 105.8 | 170.9 | 155 |

Compared descriptively with R4, first Battle acknowledgment fell from 272.9 to
23.0 ms. The rematch's exact Garage settle fell from 343 to 3 ms, after the new
full-scene warm and 54 upload batches; unchanged final return settled in 4 ms
without program warming or uploads. However, rematch program warming rose from
734 ms/45 slices to 3,692 ms/220 slices and total rematch rose from 6.51 to
9.17 seconds. This is a real remaining scheduling cost, not a universal speedup.
The longest covered tasks still fail the 50 ms interaction goal. These are single
unprofiled runs, not isolated A/B proof of every timing change.

The audio gate positively observes the same native context's advancing clock
during painted covered loading for both battles. Loading is inactive at battle
completion and both loading/ambient owners are inactive after Garage return.
Dedicated witnesses survive bounded sample-ring drops. This does not prove
physical audibility, speaker output, or device-independent autoplay behavior.

The separate corrected-R5 Garage probe passes all ten variants, selection races,
persisted reload, iPad/phone layouts, and repeated switching. The initial measured
workshop-completion window is 8.52 seconds of asynchronous activity with a
**33.3 ms maximum callback gap**, not an 8.52-second blocking task. Later variant
switches reach 66.7 ms, rapid intent 16.7 ms, and the 30-cycle interval 50.1 ms,
all within the tool's unchanged 80 ms limit. Renderer residency remains exactly
359 geometries/98 textures before and after, with 6.31 MB measured heap growth.
Raw log: `garage-variants-r5-corrected.log`. Day/night battle, final Garage and
phone screenshots were visually inspected: rendered content and menus are
present, authored day/night lighting remains distinct, and the phone selector
stays inside its viewport. Still images do not certify temporal stability.
The older 899.9 ms workshop gap did not recur; its precise cause is not proven.

The 60-second R5 battle probe is **not acceptance evidence of smoothness**.
It records 2,802 frames, median/p95/p99 16.7/33.4/33.4 ms, median/worst draw calls
883/948, zero console errors, and passing memory/texture/load limits. Original
FPS, p99, and draw-call gates fail. Machine certification is refused: load rises
12.81→19.65 (maximum 20.05), ten foreign headless GPU processes are observed, and
other interactive GPU activity reaches 140.4% CPU. Of 29 planned camera pulses,
28 are sent and respond (1.6–4.4 ms dispatch-observed to camera change); one is
not attempted because the response window is exhausted. Coverage therefore
fails rather than labeling the unsent pulse successful. Next-rAF observations
are 26.8–68.8 ms, not input-to-photon latency.

This run also uses the tool's older seven-ID default roster request, whose
missing/ineligible picks are replaced by the game. It is not the explicit
13-ID roster used by R3; compare the actual roster receipts, not only the
requested `pinned:` label. Tool provenance must make that mismatch explicit
before another matched acceptance run. Raw evidence:
`early-camera-r5-corrected.json` and its frame dump.

The resumed core suite later stopped at the unchanged Garage architecture
headless construction limit: 150.6 ms against <100 ms. Its runtime owner and
assertion have no diff in this pass. Keep that failure; rerun the exact boundary
under the normal lease before deciding whether it is repeatable. Do not loosen
the timing gate or claim a complete suite pass while the ordered run is stopped.

### R6: bounded shader cohorts and validated battle workload

The final application snapshot, `candidate-r6-dist`, passed typecheck and public
build at 2026-09-09T20:32:43.760Z. Index SHA-256:
`7d20ac2328d800b58edf95c11019a925579ac1959802e2a5d090582db7f78cfe`.
The original painter remains unchanged. R6 retains every per-object native
compile, but accumulates newly submitted program wrappers into bounded cohorts
before strict completion/reflection draining. The admission watermark is 32
programs or 8 ms of CPU work, followed by mandatory final partial draining. One
compile can submit more than 32 variants; none are discarded. Context generation,
wrapper/native-handle identity, cancellation, and finite pending-time budgets
remain enforced. A controlled 65-program test requires three cohorts and two
reflection checkpoints instead of 65 serial paint waits.

This is bounded preparation of **newly submitted** programs plus unchanged
covered uploads/exact settle, not proof that every previously resident program
has already had reflection initialized. `programsPrepared` counts completed
cohort entries, including reused/disposed/skipped entries, not unique newly
reflected shaders. No material-only deduplication or geometry omission was added.

`garage-actions-r6/report.json` passes all three real-button actions and passive
audio-clock ownership, with no page, graphics, cleanup, or recovery errors. Its
build hashes before and after capture match. Native Chrome/M5 Max, 1280×720;
battle/rematch report high quality and the final Garage reports its authored
medium presentation preset.
The R6 day, night-rematch, and returned-Garage screenshots were visually inspected:
the tank/world, authored lighting, HUD and Garage controls remain present. The
diagnostics overlay is intentional. These stills do not establish frame pacing.

| Action | Total ms | Visible cover acknowledgment ms | Worst callback gap ms | Longest main-thread task ms |
| --- | ---: | ---: | ---: | ---: |
| Battle | 16,616.1 | 382.0 | 690.7 | 581 |
| Night Battle Again | 8,259.6 | 200.6 | 345.1 | 268 |
| Return to Garage | 697.8 | 173.7 | 260.9 | 209 |

The rematch's Garage program warm is 1,064 ms/61 slices, versus R5's
3,692 ms/220 slices. Compile work is 205 ms (maximum 6 ms), with 12 cohorts,
41 completed entries, maximum cohort five, and 14 CPU-budget slices. Its 58
covered upload batches reach 122 ms and exact settle is 6 ms. Final Garage return
requires no program compilation/upload and settles in 12 ms. These descriptive
comparisons support reducing serial scheduling overhead, **not** an isolated
A/B speedup or a no-stall claim. Cold battle and final return are slower overall.
Other tasks' headless browser GPU work was present; read-only process ownership
inspection found four browser sessions in the Personal Website workspace and
system load reached 41.5 on 18 cores. Those processes were not terminated or
modified. This capture is functional evidence, not clean timing certification.

The performance probe now preflights its served production catalog and uses the
same explicit 13 opponents as R3: `fv510_milan,bwp1,amx40,strv103a,t80b,t80bv,
type90,m60a2,type90a,m1a1ha,carro45t,ztz85_iii,m2a2_bradley`, plus the `m1a2`
player. It rejects unavailable, empty, duplicate, or incorrectly sized pinned
requests before entering battle. Entry and both sampling edges must retain the
full ordered entity/spec identities, production 7:7 teams, stable team assignment,
and battle phase; sampling additionally requires a finite released countdown.
Explicit random mode retains full-size stable seeded identities and is not a
reference-roster comparison. Gameplay roster behavior is unchanged.

Completed sample-edge evidence is copied before optional GC/inventory diagnostics;
failure cleanup preserves any available edge with a bounded 1.5-second read.
Dead-CDP and incomplete acquisition remain explicit failures, never synthesized
success. The three focused roster, camera-input and HUD checks passed after this
final tool-only correction (`r6-roster-edges-hud-focused.log`). No application
rebuild is needed for those acquisition changes. The first R6 camera waiter was
cancelled before lease acquisition and produced no samples; final evidence uses
new `early-camera-r6-verified` paths rather than overwriting it.

The unchanged Garage architecture boundary subsequently passed an isolated exact
rerun and the ordered resume, with its original <100 ms construction and <750 ms
transaction limits. The next resume passed 104/482 files before stopping at
`terrainFastGrid.selftest.mjs`: its source oracle still expected synchronous
`computeBoundingSphere()`, now replaced by exact cooperative sphere publication.
A test-only repair checks actual Three.js bounds, unchanged full tuft count,
front/rear frustum behavior and density-prefix changes, and rejects missing-sphere,
disabled-culling and truncated-count mutations. The next ordered run starts at
that boundary (`full-suite-r6-terrain-resume.log`); all earlier failed invocations
remain recorded rather than being relabeled green.

Final static validation after the roster correction covers 47 runtime/tool files
and 2,993 functions: no complexity-limit violations and no `any`/`unknown`
widening violations. Changed-scope React Doctor covers 83 files with 51 findings:
32 sequential-await findings (five cooperative runtime sites and 27 test sites),
15 local-source Node-test evaluations,
three checkpoint/test JSON clones, and one passive RAF observer. No rule is
suppressed; this scan is not a performance certificate. Source hashes remain
unchanged across the 20:43:49–20:44:11 UTC scan. Artifacts:
`quality-metrics-r6-roster-final.json`, `react-doctor-r6-roster-final.log`, and
`r6-roster-final-static-receipt.json`.
The later test-only terrain repair was scanned separately: six functions with
zero metrics violations, plus one Doctor `no-eval` diagnostic for evaluating
extracted tracked vegetation code and constant negative mutants in Node. There
is no external-input evaluation or suppression. Its raw `react-doctor-r6-terrain*`
evidence remains separate from the earlier 83-file snapshot.

The final R6 camera acquisition completed a real 60,014.2 ms early-control battle
window with 3,522 frames, the exact reference roster at all three checkpoints,
7:7 teams, and released controls at both sample edges. It retained native
1280×577 high output, dynamic scale 1, performance trim 0, and all four shadow
cascades on every frame. Results: mean 59.4 FPS; median/p95/p99
16.7/16.8/33.3 ms; median/worst draw calls 812/917; 4.762M median triangles;
166.9 MB textures; 2,419 ms load-to-ready; negative measured heap slope; no
console errors. Roster, memory, texture, load and p5 FPS gates pass. Median FPS
59.9 remains below the unchanged literal 60 gate, p99 exceeds 25 ms, and peak
draws exceed 900. **Overall acceptance fails.**

All 28 dispatched camera pulses respond, in 0.7–2.9 ms from browser-observed
dispatch to camera consumption. The following RAF is observed 23.6–39.5 ms later;
neither metric measures photons on screen. One of the 29 planned pulses cannot
be attempted with its full response window remaining, so coverage explicitly
fails. No missed or unsupported dispatched input is reported. This is not an
all-29-input comparison with R3.

Machine certification is refused again: load 17.16→15.12 (maximum 26.66), three
foreign headless GPU processes and up to 448.4% other GPU-process CPU
were observed during acquisition. The owning Personal Website task cooperatively
closed its four QA sessions, but the overlap and load history remain in this
receipt; they were not erased after the all-clear. Browser/preview closed and the
lease was released, and both cooperating tasks were told to resume normally.
Raw result: `early-camera-r6-verified.json`, frame dump with matching stem.
This is stronger workload/functional evidence, not proof that residual frame
tails originate solely outside the game or that historical 214–319 ms stalls
have been eliminated.
The probe's legacy `interactive-browser GPU cpu` label sums all non-owned
`--type=gpu-process` helpers, including headless Chromium/Electron helpers; it
does not attribute that whole value specifically to a user's interactive tab.

### Remaining CPU candidate: material-bucket conversion

Further read-only attribution review identifies one bounded next change in
`src/world/props.ts`'s `mergeMaterialBuckets()`. Before its first yield, it maps
every source geometry through `toNonIndexed()` and merges the entire bucket.
The existing R4 Battle CPU profile contains a contiguous 98.425 ms sampled
subtree here, including 64.323 ms in non-indexed conversion (profile-relative
5,377.060–5,475.485 ms); R3 records 49.133 ms in the same owner. These are
contention-affected attribution profiles, not isolated timing comparisons.
R6's 193.2 ms props slice is not independently attributed to this function.

Prepare conversion in count/time-bounded generator batches with unchanged
source order, exact attributes, borrowed/original ownership and one atomic
final material mesh. Retain curtain/glass preparation and eager synchronous
construction semantics, and close temporary converted owners on success,
cancellation and failure. The final merge/allocation remains indivisible in
this minimal change. The separate world-art owner confirmed no edit overlap in
this helper.

The reviewed R7 change was applied at **21:17:50 UTC**, at a completed-child
boundary after the 174-tank asset audit passed. The broad runner was waiting for
its next ordinary FIFO lease, with no active child. Rather than delay this
independent props change behind unrelated fleet geometry scans, the runner keeps
its already-captured 876-file list and continues against live R7 source. All R6
build/native snapshots remain immutable. The cumulative ledger explicitly
separates pre-cutover checks from later checks; it is not one frozen R6 run.
The new registered test is additionally run with all seven affected props/world
checks. The current registry has 877 entries; the old captured registry was
reconstructed and verified against its original SHA, not inferred from counts.

`propsMaterialGeometry.ts` yields after at most 64 source geometries, a 2 ms
conversion batch, or the final source. The deadline is checked after each native
call; one expensive conversion can still exceed it. An extra pre-merge checkpoint
also occurs for already non-indexed buckets. The merged geometry remains a single
atomic publication with unchanged attributes, order, materials and shadow flags.
Privately converted geometry is released on success, iterator return/throw,
rejected loading yields and conversion/merge failures; borrowed inputs remain
owned by their original caller. Tests compare native attribute bytes and reject
ordering, unbounded-count and cleanup mutants. The first three focused checks
(new helper, props scheduling, texture rows) passed. The fourth stopped at an
older `propsResources` fixture: its extracted production material stage called
`makeRoofMaterial`, but the fixture had not provided that existing dependency.
The test-only repair executes the actual tracked helper and checks roof texture
identity and the authored Foundry roughness, alongside existing suspension,
empty-bucket, shared-owner and final-eviction checks. That small fixture passes
directly. The original failed `r7-props-focused*` receipt is preserved; a fresh
`r7-props-focused-repaired*` run covers all seven checks and hashes the repaired
fixture too. All seven repaired-run checks and the helper metrics gate passed
at **21:30:03.291 UTC**, with unchanged source hashes throughout. These cover
native conversion parity, scheduling, texture rows, resource ownership, logging
yard placement/RNG, world coordination and profiler cancellation/ownership.
The helper has three functions and zero complexity/`any`/`unknown` violations.
R7 typecheck and public build passed at **21:32:13.521 UTC**, with matching
pre/post source hashes. The immutable `candidate-r7-dist` index SHA-256 is
`88b4eca3cf222fbe707164296685afdf50b2c7378dcd60c1a4ca77721efe16ae`.
The real-button/native audio regression completed at **21:34:04.827 UTC**
against this exact snapshot. The report, runner receipt and independently checked
index all match. All three trusted button actions, loading covers, phase and
battle-ordinal transitions pass; console, graphics, context-loss and reported
cleanup errors are empty. Each battle contains the full 14-tank, 7:7 roster.
The acquisition hash, map/spec/viewport, actual battle rosters/order/teams and
first-battle props warm-batch object counts match R6. All three R7 actions retain
high preset/DPR1/dynamic scale1/trim0; R6's final Garage used medium, so that last
comparison also differs in effective quality.

| R7 action | Click to ready | Painted cover | Worst actual callback gap | Longest task |
| --- | ---: | ---: | ---: | ---: |
| Battle | 10,738.8 ms | 86.8 ms | 451.8 ms | 343 ms |
| Night rematch | 6,058.0 ms | 186.5 ms | 194.6 ms | 114 ms |
| Return to Garage | 419.3 ms | 118.6 ms | 129.1 ms | 112 ms |

These callback-start intervals deliberately differ from the report's RAF
timestamp-gap values (450.5/194.3/128.8 ms). Props construction now records
2,944 slices, 2,848.1 ms synchronous work, and a maximum slice of 59.9 ms
(`ground-decals`), followed by `street-details` at 52.9 ms. The corresponding
R6 observations were 2,148 slices, 3,559.2 ms and 193.2 ms. Material conversion
no longer appears among the eight slowest R7 slices. These are observations,
**not a contention-controlled speedup or a 2 ms hard deadline**: the functional
probe does not certify a quiet machine, R6 had known foreign load, and native
allocation/merge/texture calls remain indivisible.

Rematch Garage program preparation records 561 ms across 34 slices, with
52 completed entries in 10 cohorts, maximum cohort9 and six CPU-budget slices.
Its exact settle frame takes3 ms; final-return settle takes8 ms, with no new
program preparation or texture upload. Passive audio confirms the same live
context advances during covered loading, and loading/ambient owners are off on
return. This is not PCM/audibility proof. The day, night and final Garage stills
show intact tank/world geometry, expected night emission, visible HUD/controls
and no black-render failure; stills cannot certify frame pacing.

The worst first-Battle gap is3319.6–3771.4 ms, overlapping separate80 ms and
343 ms long tasks. The world activation receipt starts at3764.9 ms, but Battle
intent can prefetch construction earlier; this timestamp alone does not rule
out height-field/terrain/module work. The report does not attribute this gap to
the later props stages. A separate R7 CPU-profile acquisition
is required for function attribution, without relabeling its timings as an
unprofiled acceptance result. Artifacts: `garage-actions-r7/report.json`, the
three PNGs and `garage-actions-r7-runner-receipt.json`.

R7's final explicit-file Doctor scan covers the helper, integration and two
fixtures with unchanged source hashes. Seven raw findings comprise five trusted
Node source-evaluation fixture sites, one sequential two-case test await, and
one unchanged props assertion outside the delta. No production-helper or
delegation finding is reported and no suppression is added. The earlier
unsupported `scope changed` invocation remains a failed invocation, not a scan.
Final receipt: `r7-props-final-static-receipt.json`; raw diagnostics and scoped
classification: `react-doctor-r7-props-final-raw/diagnostics.json` and
`react-doctor-r7-props-final-scope.json`.

The cumulative broad runner subsequently reached the unchanged `villageWear`
fixture, whose historical whole-map digest predated the published Foundry
`props.sourcedPalette='ironworks'` field. Removing only that later field from
the historical comparison reproduces the existing digest exactly. Its test-only
repair retains the original frozen hashes, asserts the current ironworks value,
and rejects missing/wrong palette and unrelated prop-plan mutations. All28
desktop/mobile pixel outputs, pilot masks, protected terrain/road/water/RNG and
resource checks pass. The scoped fixture scan reports38 functions and zero
metrics/Doctor violations. The ordered runner then stopped at the analogous
unchanged `mangroveWaterPalette` historical-config fixture; that failure remains
recorded separately. Its similarly narrow test-only historical view passed six
native sea bakes at21:43:28.647 UTC, retaining exact alpha, normals, physics,
resource and original other29/Mangrove hashes. The existing wreck-donor policy
is unchanged; missing/wrong current Foundry palette and unrelated-plan mutations
fail. Its scoped metrics/Doctor delta reports48 functions and zero violations.
The captured core continuation and35 post checks are still running.

## R7 CPU attribution and R8 follow-up

The additional immutable R7 action capture completed with all three functional
and passive audio-clock gates passing. It is attribution-only, not a replacement
for unprofiled timing. Its CPU/page-clock alignment uses the intersection of
start and stop brackets; uncertainty is133.5/65.6/10 ms for the three actions.
`r7-action-profile-analysis.md` records exact bundle locations and profile hashes.

The first Battle's499 ms callback gap contains a476 ms task. The synchronous
`new AudioContext({latencyHint:'interactive'})` caller accounts for196 CPU
samples totaling415.998 ms; at least roughly385 ms stays within the gap over
the entire alignment uncertainty. This establishes a **current audio-device
startup blocker**, already behind the painted loader. It does not establish the
cause of every historical214–319 ms gameplay stall. Height-field initialization
was not sampled: intent prefetch had advanced before profiling started.

A separate276 ms task samples roughly206 ms in native `ACTIVE_UNIFORMS`
reflection during `tankThumbs`' live hull/turret mask render. This is not the
packaged portrait icon path or the PBO readback. The existing mask warm-up already
reflects its captured programs. A subsequent artifact-only diagnostic identifies
the missed variant precisely: the first hull draw takes326 ms and creates16
new programs, with16 new `ACTIVE_UNIFORMS` queries. Their nearest compiled
parameter tuples differ only in the addition of `|burn-r6` to the material's
custom program-cache key. The turret draw then takes1.7 ms with no new programs.

Source ordering explains the race. `soloBattleStartRuntime` calls the damage
panel's `setTank`, which asynchronously borrows the player's live materials for
mask preparation. `soloBattleLoadingRuntime` subsequently awaits visual upload,
and `battleVisualStreamer` installs the disarmed burn shader on those same
materials. `applyBurnHook` updates both their cache key and material version.
The old prepared programs remain alive but are no longer the variants the first
mask draw needs. The candidate correction is to install the player's existing,
idempotent disarmed hook before exposing its visual to the damage panel. It does
not remove burn effects, clone the live materials, or reduce rendered quality.

The diagnostic used a separate instrumented copy of immutable R7, preserving
the original bundle and default `onBeforeCompile.toString()` cache keys. Hook
descriptors were restored before yielding; it introduced no additional renders
or shader reflection. Functional/audio-owner checks and cleanup pass. This is
causal attribution, not an uninstrumented frame-time acceptance run. Artifacts:
`garage-actions-r7-mask-diagnostic/` and its runner log.

The rematch also samples native camouflage
Canvas2D reads and synchronous vehicle factories. These are independent owners,
not evidence that props material conversion failed. The profile's Garage return
does not reproduce the earlier112 ms task: its owner is47 ms, so only cumulative
stage attribution is established for that earlier return.

An artifact-only four-fresh-browser ABBA test evaluated silent-sink construction
followed by asynchronous default-output selection. The API accepts a silent
sink and an asynchronous sink switch, but support is limited and failures must
not leave an apparently-running game silently disconnected. See
[AudioContext options](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext),
[setSinkId](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/setSinkId),
and [Chrome's implementation notes](https://developer.chrome.com/blog/audiocontext-setsinkid).
No sample rate was forced; all four trials selected48 kHz and ultimately ran
the default output with an advancing clock, then closed. No audio sources,
device enumeration, or permission request were used.

That first hypothesis is **rejected as a startup fix**: default constructors
took313.6/255.1 ms; silent-sink constructors still took221.3/207.4 ms, with
227/212.1 ms callback gaps. Sink setter calls themselves returned in0.1/0.2 ms
and settled in11.8/4.7 ms, but needed subsequent resume after switching.
The experiment's task-start filter omitted enclosing click tasks; its direct
constructor and callback measurements remain valid. Do not read the empty
LongTask arrays as absence of blocking. Artifact: `audio-sink-startup-abba/report.json`.
No experimental audio change was applied to the game. A second four-browser
ABBA experiment requested48 kHz explicitly in both arms to test whether preferred
hardware-rate discovery caused the constructor delay. It also failed: default
constructors252.4/222.2 ms, silent constructors205.5/271.5 ms; the corrected
overlap collector records254/206/272/223 ms tasks. All contexts still reached
the default output, advanced and closed cleanly. This does not justify changing
the rate on users' devices. The two rejected experiments are not PCM, cross-device
or OS cold-service-reset certification. Second receipt and analysis:
`audio-sink-startup-48k-abba/report.json` and `analysis.md`.

At21:54:22 UTC, with the broad runner stopped at a failed child, R8 applied a
separate action-lifetime correction: delayed Battle Again failure imports can
no longer open an obsolete dialog over a newer entry or room. Duplicate active
actions coalesce, retries do not wait for a failed notice transfer, and obsolete
notice dismissal does not restore focus into the old screen. The shared modal
also checks its open lifetime before its deferred focus callback. New composed
action and actual modal-callback tests are registered. Five focused tests and
the action/presenter metric gate passed, with no source drift, in
`r8-notice-focused-repaired-receipt.json`. Typecheck passed at22:03:20 UTC;
the seven-file Doctor scan found no production change finding. Its five raw
findings are one trusted Node adapter-source fixture, three intentionally
sequential deferred-event fixture sites, and one previously reviewed main-loop
wait outside this delta. No suppression or parallelization of ordered tests was
introduced. Receipt: `r8-notice-static-receipt.json` and its raw diagnostics.
The registry now contains879 files, versus the original captured876 plus the
three separately-tested additions. The cumulative broad run stopped at core477
on a tidal-mangrove stem/crown contact invariant. Renderer-free replay proves
both current and base47e86743d produce byte-identical far-willow buffers:
variant0 has0/30 cap vertices contained; variant1 has30/30. The pre-seam
0823acd74 geometry passed30/30 and25/30 respectively. This is a genuine gate
failure introduced by the already-published seam-closure change, not this
performance slice or a stale historical-hash oracle. The world owner has the
diagnostic for a contact fix; no geometry or contact assertion was changed here.
Remaining ordered diagnostics continue after the failed index, with that failure
retained explicitly rather than relabeled as a passing full suite. Evidence:
`tidal-far-stem-baseline-diagnostic-r2.log`.

At22:18:55 UTC, while the broad runner had no active child, the final R8 runtime
corrections were applied: early player burn-hook installation and budgeted
Garage-return checkpoints. The existing `soloBattleStartRuntime` test executes
real activation and the production shader hook on a real Three material. Both
direct and deferred entry preserve the same material, shader key, version and
burn-driver ownership when later staging repeats the hook. `uBurnT=-1` and zero
glow remain disarmed; a missing optional visual still uses the existing fallback.
Independent ownership review confirms materials/drivers are per visual; shared
textures, CSM registration, disposal and reset behavior are unchanged. No generic
material-retry infrastructure was added. An unrelated future shader mutation
during a borrowed-mask await is a separate robustness concern.

Garage return offers up to four cooperative checkpoints after publishing both
its unready ownership trace and Garage phase. The ordinary frame guard therefore
never renders partly reset roots. Each checkpoint is conditional on an8 ms
elapsed-slice budget and uses the existing bounded task/paint scheduler. This
is not a hard8 ms deadline or CPU-only measurement: an individual operation
cannot be preempted, and an existing await may make the elapsed budget eligible.
The owner keeps the original lifecycle order and reports added wait time/count
separately from the original stage accounting and total duration.

The actual main adapter captures renderer information/context identity for each
entry. Every outer continuation checks phase, transaction and graphics lifetime,
including the microtask gap after a helper's promise settles. Tests cover all
four checkpoints against seven cancellation/failure variants, no-yield fast
paths, coalesced callers, retained-room recovery and separate scheduling-time
accounting. A superseded entry cannot mutate later stages or release readiness.
Fourteen focused integration tests pass at22:21:24 UTC with unchanged source
hashes, including solo start/loading/deployment/entry, mask readiness, Garage
return/recovery, notices/modal focus and network presentation. Receipt:
`r8-final-focused-receipt.json`.

Final product static checks cover48 functions across the two full runtime owners
and the exact main scheduler adapter: no complexity or explicit any/unknown
violations. Doctor exits1 with21 raw findings: three trusted-source Node fixture
evaluations, two assertion-guarded test lookups, fifteen intentionally sequential
test awaits and one previously reviewed main generator wait. No suppression or
confirmed changed-production blocker. The final public build and typecheck pass;
immutable `candidate-r8-dist` index SHA-256 is
`c0cb33563b1924fc09c32e7b76be2d59dbad0bc4dcf31ff3dbf5580e4864205a`.
The build receipt hashes runtime/build/config sources and the fourteen focused
tests before/after; separately evolving Node-only source-oracle fixtures are
explicitly outside that build freeze. No runtime drift is detected.

The broad run later stopped at `loadingScreens`: its source-only assertions
still required the old unguarded yield spelling and exact pre-refactor option
shape. Those fixture repairs are separate from the frozen runtime build; failed
invocations remain recorded. No passing full-suite claim is made while the
remaining checks and the world-owner contact repair are outstanding.

R6's incomplete camera-input coverage is also distinct from a lost game input.
All28 dispatched events responded in0.7–2.9 ms; pulse29 has no event/response
record because it was deliberately never dispatched. The next allowed slot
(page time72,399.5 ms) exceeded the full-response-window cutoff (72,368 ms) by
31.5 ms. Initial delivery delay and accumulated event-spacing/CDP scheduling
overhead exhausted the window. This does not identify every source of that
delay, excuse the failed coverage gate, or prove displayed-frame latency. The
final R8 acquisition retains the same60-second/29-input policy and thresholds.

## Final R8 native receipts

The unchanged real-control action probe ran exactly once against the frozen R8
public build. Its acquisition hash is
`28e1d46161fa158f9224675abab1b9311165d4838a53ba662050a5b677da9a86`.
Chrome152/M5 Max,1280×720 DPR1, high preset, dynamic scale1 and trim0 are retained;
each day/night battle contains14 actual entities at7:7. Functional and passive
audio-clock/ownership gates pass, with no graphics, action or cleanup errors.
All three stills preserve the authored world, complete vehicle/HUD and restored
Verdant Garage; no partial roots or stuck cover. Owned preview5992 and browsers
are closed.

| Real control | Visible cover | Click to control | Worst callback gap | Largest LongTask |
| --- | ---: | ---: | ---: | ---: |
| Battle |21.4 ms|7,071.1 ms|229.7 ms|222 ms|
| Battle Again, night |145.4 ms|5,943.5 ms|203.3 ms|161 ms|
| Return to Garage |105.9 ms|389.9 ms|50.0 ms|None observed|

Return's canonical owner completes in91 ms, including three cooperative waits
totaling13 ms; its separate renderer restoration takes38 ms. The initial/rematch
pauses remain acceptance failures, not costs made acceptable by a loading cover.
The unprofiled report cannot identify the JS function behind its LongTasks.
Earlier R7 constructor/readback profiles are attribution evidence for that run,
not proof that every same-sized R8 gap has the same cause. This unchanged action
probe does not collect mask program counters; a separate attribution-only
acquisition below verifies the shader-order change.
This action run is functional-only, not multiplayer or quiet-machine certification.
Artifacts: `garage-actions-r8/report.json`, the three PNGs, and
`garage-actions-r8-runner-receipt.json`.

The unchanged60-second camera probe also ran once, retaining its native cadence,
29-input plan, full response windows, high quality,1280×577 DPR1 and recorded14-tank
Verdant roster. It reports median/p95/p99 frame gaps16.7/33.3/33.4 ms; median FPS59.9,
p5 FPS30, p1 FPS29.9 and mean instantaneous FPS57.7. Peak draws906 exceed900;
median triangles4,793,700, load-to-ready1,322 ms, scene textures166.9 MB and the
0.34 MB/s heap-slope gate pass. No console errors or context loss. All28 dispatched
camera events respond; the29th is explicitly unattempted because its next allowed
dispatch exceeds the final response-window cutoff. Coverage is incomplete, not
28 accepted inputs followed by one lost game input.

For the28 dispatched inputs, event-to-camera response is1.6 ms median/3.9 ms
maximum; event-to-next-rAF is30.4/47.7 ms. The undispatched final slot is832.2 ms
beyond its response-window cutoff. These distinguish actual input handling from
the incomplete scheduled coverage and display-callback latency.

Certification is refused: machine load rises6.46→11.02 on18 cores (limit9), with
two foreign headless GPU processes and66.9% other interactive-browser GPU CPU
(limit15%). These observations cannot distinguish app, GPU contention and OS
scheduling as causes of frame tails. A59.9 FPS median derived from quantized rAF
timestamps also is not evidence of16.7 ms application CPU work. No gate was
relaxed and no identical repeat was launched to fish for a passing sample.
Artifacts: `early-camera-r8.json`, its frame/log companions and
`early-camera-r8-runner-receipt.json`.

### R8 mask-race browser proof

One diagnostic acquisition completed at22:48:45 UTC, with the exact R8 build and
byte-identical R7 counter helper. Actual mask-load receipts map the four captured
calls to hull compile, hull draw, turret compile and turret draw. Hull compile
prepares20 new unique programs; **the first hull draw creates zero programs,
invokes zero compile hooks and makes zero synchronous ACTIVE_UNIFORMS queries**.
Turret compile/draw also create zero additional programs. R7's first hull draw
created16 programs and made16 such queries. Both masks and all three real controls
complete without page/cleanup errors. All hooks restore synchronously; all owned
browser/server processes terminate. This closes the tested M1A1 shader-race
diagnosis, not fleet-wide shader coverage or frame-budget certification.
Artifacts: `garage-actions-r8-mask-diagnostic/report.json` and
`garage-actions-r8-mask-diagnostic-runner-receipt.json`.

### R9 construction work in progress

The already-captured R7 CPU profile attributes119.9 ms of a single Merkava build:
about52 ms to decoration construction/seating,23.3 ms to its actual profile
builder,13.1 ms to contact-vertex measurement,10.9 ms to ERA attachment distances,
and the remainder to merge/finalization. Rounded-box caching already exists;
this is not evidence for adding it again. The corresponding R8 unprofiled build
still takes123 ms. Its texture prebake is a cache hit; this particular block
contains no material-painter/readback work.

R9 now exposes cooperative checkpoints after complete core ownership
and through decoration indexing, whole manifest rows and material merges. The
same geometry/RNG sequence, materials, triangle budget and published hierarchy
must remain exact. A draft tank stays private and is disposed when its owning
round/roster/renderer changes or its frame gate rejects. Existing synchronous
authoring/Gallery consumers retain their historical API and decoration fallback.
Scheduling waits are reported separately from non-await construction elapsed
time; that remainder is not a literal CPU measurement. No native
speedup or sub50-ms whole-factory result is claimed before R9 measurement.

Independent review found one cleanup blocker before integration: unpublished
decoration materials were disposed but remained registered in the owning CSM
shader map. The implementation pairs that registration with owning-context release,
including the pre-existing context-probe material on success or setup failure.
The final decoration draft passed25,148 assertions, including actual registry
membership with a preserved foreign entry. The combined factory draft passed
3,789 checks against six immutable pre-staging core outputs, including the
measured low-detail/batched Merkava1B. Disposal counters alone were not treated
as sufficient evidence. Product integration happened after those source-frozen
receipts; final application checks and native acceptance remain separate.

Before the final R9 freeze, the measured ERA-distance hotspot also received a
narrow allocation change: one triangle and closest-point vector per construction
owner replace repeated vertex/triangle allocation for every plate comparison.
Each fan iteration reloads current vertex coordinates, preserving arithmetic,
candidate order and ties; there is no geometry cache or cross-build scratch.
The maintained numeric oracle includes1,628 independent-original cases and
negative controls. These passed in the integrated run below; no native speedup
is implied by the numeric correctness result.

### R9 integrated gates

The22 focused checks all passed on2026-09-09, beginning23:44:17.805 UTC, with
no runtime/test hash drift. This includes3,134 decoration lifecycle/consistency
assertions,3,795 factory checks against six independent original-output fixtures,
the1,628 exact plate-distance cases and six rejecting mutants, roster cancellation,
private publication, loading/entry/return, context recovery and existing network
presentation contracts. The registry now discovers883 checks: the earlier879
cumulative closure plus four new maintained R9 suites. This is **not** a fresh
full883 run. Metrics also passed with no changed-scope violations or explicit
`any`/`unknown`; Doctor classification, build and browser acceptance follow.
Artifacts: `r9-final-focused.log`, `r9-final-focused-receipt.json`, and
`r9-final-static-metrics.log`.

The initial full typecheck rejected the extracted options object's widened
quality strings. Explicit `CreateTankOptions` and helper return annotations fix
that compile-time integration issue without changing emitted behavior. The fresh
22-check R2 run passed again, preserving the initial failed build receipt.
Native TypeScript and the actual public build are separate gates, not implied
by these Node tests. Artifacts: `candidate-r9-build.log` (failure),
`r9-final-focused-r2.log` and its unchanged-source receipt.

React Doctor's first integrated scan returned exit1 with20 findings, not a clean
scan. Review found no new runtime blocker: two instanced-buffer findings have
explicit owning-loop `needsUpdate` assignments; two eval findings are fixed
local-source test harnesses; five sequential-await warnings are deliberate
budget/ownership pacing or test sequencing; eleven array/cache sites match the
pinned baseline exactly. No suppressions or gates were weakened. Strict scoped
metrics cover594 functions and pass; two exactly unchanged legacy factory
functions outside the delta still reach a22-point threshold. Whole-factory
cleanliness is not claimed. R2 static receipts follow the later type correction.

Verification ownership was also tightened: interruption drains the owned
browser before releasing an acquired lease, never releases a foreign queued
lease, and cannot produce a passing interrupted receipt. The existing maintained
action-contract test gained57 lifecycle assertions; the artifact wrapper tests
passed82 assertions, including unchanged-index/changed-JavaScript rejection.
The five initial cleanup checks passed, including119-function scoped metrics.
The final wrapper points to the fresh R2 build receipt and is checked again.
Build phases release/rejoin FIFO between complete commands. Every generated
asset is hashed before/after native capture in addition to verifying the actual
served HTML hash. These are ownership/integrity checks, not speed measurements.

The full original879-registry coverage and failure/cutover evidence is preserved
in `cumulative-regression-r8-closeout-ledger.md`. The Mangrove correction applies
only commit196753a7a's four-file delta, not its unrelated parent vegetation work.

### R9 public build and native results

The R2 native TypeScript check and public build both passed, completing
2026-09-09 23:56:10.486 UTC. The immutable candidate contains3,328 hashed assets;
its index SHA256 is
`c226a4a70c97156f6cf68f4a83fe7d6e97c5e886a163ed46c0c154933c72d06b`.
The native Battle → night Battle Again → Garage probe verified the actual served
index and every generated asset before/after capture. Chrome152 used native
ANGLE Metal on Apple M5 Max at1280×720,DPR1,High,scale1,trim0,SMAA-high+FSR1.
All controls, audio-clock witness, full14-tank roster and day/night/Garage
restoration passed with zero page, graphics, context-loss or cleanup errors.
Independent review of all three screenshots found complete tanks and restored
Garage presentation, not an all-angle or pixel-parity certification.

The unprofiled timing result is **not a performance pass**:

| Action | Covered after | Total | Worst callback gap | Maximum LongTask |
| --- | ---: | ---: | ---: | ---: |
| Battle |19.8ms|6,652.6ms|234.4ms|228ms|
| Night Battle Again |138.5ms|5,787.3ms|147.5ms|109ms|
| Garage return |125.1ms|400.7ms|61.2ms|none|

Merkava1B now crosses181 construction checkpoints; aggregate non-await build
elapsed is82ms on first entry and74ms on rematch, with33/3ms of explicit waits.
These are not maximum slice measurements, literal CPU totals or a controlled
speedup claim against the earlier123ms build. The opaque loader yields tasks
within its18ms work budget and requests a frame at80ms intervals; forcing a
task checkpoint does not promise an immediately displayed frame.

Artifacts: `candidate-r9-r2-build-receipt.json`, `garage-actions-r9/report.json`,
the three screenshots, and `garage-actions-r9-runner-receipt.json`.

### R9 diagnostic attribution (not timing certification)

A separate same-build CPU-profile acquisition completed2026-09-10 00:02:39 UTC.
Its timing is attribution-only because profiler overhead changes the workload.
Page/profile alignment brackets are30.5ms for Battle,22.1ms for rematch and
27.3ms for Garage. The initial222.7ms gap samples175.9ms in the synchronous
AudioContext constructor, plus mixer setup; this reproduces a first-use audio
device stall, not proof of every historical in-battle214–319ms stall.

The rematch161.7ms gap samples109.2ms under `paintPatchRoughness` native
`getImageData` and25.1ms under `heightToNormalSteps` readback. The roughness
function contains two reads and this profile cannot separate them. Endpoint
alignment shifts preserve approximately109–111ms roughness attribution across
the full gap. Neither is the already-staged factory/decor construction.

Two further actionable sites appeared: a120ms Battle task includes98.7ms
readback in Garage dressing while battle loading is underway; another105ms
task coalesces42.9ms scene shader submission with37.8ms first-bind uniform
reflection. R10 investigates the Garage lifecycle and replaces that monolithic
submission with the existing exact-scene staged compiler, including a task
boundary before first bind. Native speedup is not yet verified.

The Garage96ms diagnostic gap includes environment baking/uniform reflection,
resource release, render work and the probe's own layout query. It has no
overlapping LongTask and does not establish a96ms application function.
Artifacts: `garage-actions-r9-profile/` and its unchanged-build runner receipt.

### R10: prevent competing Garage work and separate shader submission

The Garage scheduler now treats a committed or covered Battle entry as busy,
even while the game phase still says Garage. It checks admission after lease
acquisition and lazy loading, and passes the same guard into the dressing
runtime. All five asynchronous bay builders check it immediately after their
vehicle transfer. An already-started transfer may finish, but its completed
visual stays privately owned until a later quiet Garage window; it is neither
assembled nor revealed during Battle entry. Return while still covered defers
and retries rather than losing unfinished dressing work. Disposal releases a
late or retained visual once. Authored geometry and materials are unchanged.

Solo deployment now uses the existing exact-scene compiler's 8 ms submission
steps, with a guarded task boundary after every step and after the final step
before first FX binding. Cancellation is checked after the outer await as well
as inside the yield helper; tests cover the intervening microtask race. This
separates batches, but an individual native driver call can still exceed the
budget. Neither fix establishes a maximum native frame duration by itself.

The proposed bitmap-to-worker readback bridge was tested and **rejected**.
Across three native paired runs, height, normal, classification, roughness and
alpha bytes were identical, but `createImageBitmap(heightCanvas)` itself blocked
the main thread for 320.1 / 328.1 / 359.5 ms, then added 41.3–45.5 ms of worker
readback. Warm baseline height reads were 303.4–306.3 ms; the 951.5 ms cold
baseline remains recorded. The narrower classifier result was promising only
in isolation and does not identify which live roughness read caused the R9
stall. No readback replacement was integrated. The browser and worker closed
and the owned capture lease was released. These microbenchmark durations are
not directly comparable to the loaded-game probe.

Artifacts: `bitmap-readback-r10-findings.md`,
`bitmap-readback-r10-native/report.json`, and the experiment harness in the
artifact directory.

### R10 combined verification

The first combined run stopped at an old source-shape assertion requiring the
atomic `compile(scene)` call. The assertion now requires staged exact-scene
submission, prohibits the old atomic call, and requires the final guarded task
boundary before FX binding. Actual runtime cancellation tests remain separate.
The subsequent 13-file run passed with identical before/after source hashes;
the original failure is retained as `r10-final-focused-receipt.json`, and the
passing run is `r10-final-focused-r2-receipt.json`.

Native TypeScript and public build passed. The frozen R10 index SHA-256 is
`4445dac2df02cbe41fc6f19822f6f2225dbc78350db5dd46effb74df652de9bb`.
The native action probe checked the full generated-asset manifest and actual
served index before/after capture, completing 2026-09-10 00:25:52.327 UTC.
It retained High, 1280×720, DPR 1, scale 1, trim 0 and SMAA-high+FSR1 on native
Apple M5 Max ANGLE/Metal. Day entry, night rematch, Garage restoration and audio
clock/ownership witnesses passed, with no browser/graphics/context/cleanup
errors. The night scene retained 104 emitters; Garage return disabled them.
Root inspected all three screenshots for complete models, terrain, HUD and
restored Garage presentation. This is bounded visual inspection, not all-angle
pixel certification.

| Action | Cover after | Total | Maximum callback gap | Maximum LongTask |
| --- | ---: | ---: | ---: | ---: |
| Battle | 21.0 ms | 6,553.0 ms | 233.0 ms | 225 ms |
| Night rematch | 139.0 ms | 5,588.7 ms | 149.8 ms | 92 ms |
| Garage return | 107.1 ms | 340.8 ms | 47.1 ms | none |

The new compiler witness records six submission slices on each entry, with
maximum measured submission slices of 14.8 and 16.1 ms (48.4/46.5 ms aggregate),
followed by separate FX-binding cohorts of at most 33/30 ms. A requested 8 ms
budget cannot preempt an individual driver call. These witnesses confirm staged
execution; the surviving 233/150 ms whole-action gaps mean the overall latency
target still fails. The earlier profile's audio/readback attribution is not
silently assigned to this unprofiled run. The smaller Garage-return observation
is a single sample, not a controlled percentage improvement claim.

The nine-file R10 static receipt measures 338 functions plus the exact main
adapter: zero scoped complexity/type violations. Its raw Doctor exit is 1:
two trusted local-source test-harness eval warnings, three test-only lookup or
iteration warnings, and six intentional sequential cancellation/budget awaits.
No diagnostic was suppressed. The UI-oracle supplement passed its 36-function
metrics and scoped diff checks; Doctor exited 0 with five existing test-only
warnings. Original nine-file hashes remained unchanged. Together these receipts
cover 375 selected functions across ten files, with only the exact adapter
measured in main. They do not certify the full tree or a fresh full test suite.

### R10 60-second full-roster control check

The unchanged maintained probe ran once against the frozen R10 build, on its
actual preview port 5957. All 3,328 generated assets, source association and
acquisition hashes matched before/after. Native high-quality settings remained
unchanged; all three full 7:7 roster checkpoints passed, game time advanced
from 0 to 60 seconds, and there were no console errors. The 60,014.3 ms window
contains 3,586 sampled frames. All 29 trusted camera inputs were observed and
consumed, with no missed, unsupported or unattempted events.

- Browser-observed dispatch to camera change: 1.1 ms median, 2.0 ms maximum.
- Event timestamp to camera change: 7.1 ms median, 22.1 ms maximum.
- Browser-observed dispatch to next rAF: 25.0 ms median, 38.8 ms maximum;
  this is not input-to-photon latency.
- Frame p99: 16.8 ms; fifth-percentile FPS: 59.5; peak draws: 897.
- Median submitted triangles: 4,747,932; scene texture estimate: 166.9 MB.
- The unchanged median-FPS threshold remains red: 59.9 against at least 60.
  Other numeric budgets pass. The heap gate uses its raw/floor fallback
  (−0.61 MB/s), not a retained-GC growth measurement; no pre-window GC occurred.

Timing certification is still **refused**: nine foreign headless GPU processes
and 57.2% foreign interactive-browser GPU activity were observed. None were
stopped by this task. Child exit 0 means acquisition completed; the report's
`budget.pass=false` is the numeric outcome. This probe does not record a maximum
rAF gap or LongTask series, so p99 is not evidence that every frame was fast.
Owned probe/browser processes exited and the preview port closed, with no
cleanup errors. Artifacts: `early-camera-r10.json`, its log and runner receipt.

### R11 Garage capture ownership correction

Independent review found a reachable overlap in maintained Garage captures:
`__SHOTS.set('garage')` changes the phase and stops new idle scheduling, but an
already-running workshop pump can still be awaiting its vehicle transfer.
The capture's direct `ensureBuilt()` previously drained the same runtime
without joining that pending step. Both callers could request the same bay,
overwrite its prepared result and retain an unused visual until disposal.
This is a source-proven interleaving, not a duplicate observed in the R10
native run. Ordinary scheduler pumps were already serialized.

The two-file correction puts ownership at the runtime boundary: `pump()`
publishes one shared promise before invoking any work or caller predicate;
`ensureBuilt()` joins that promise before draining subsequent steps. The first
owner's validity guard remains authoritative for its step. A capture can then
resume a paused, privately retained visual without requesting it twice.
Success and failure both release only the matching pending owner, with no
detached rejecting cleanup promise. Disposal still prevents late publication.

Four focused Garage checks passed on 2026-09-10 at 00:42:47.748–00:42:49.773 UTC;
independent review found no blocker. The source-executing lifecycle checks
include two overlapping captures plus the idle scheduler, exact-once requests,
assembly, reveal and disposal across all five bays, cancellation and retained
resume, shared prepare/transfer rejection and retry, synchronous reentry, and
late disposal. Only `garageDressing.ts` and its existing lifecycle test changed
after the R10 runtime freeze. R10 build/native evidence remains associated with
its original sources; this correction is not retroactively included in those
performance measurements.

### R11 whole-painter feasibility: initialization failure retained

The next artifact-only experiment moves the actual complete paint generator
into a worker-owned fresh OffscreenCanvas, rather than snapshotting an already
painted main-thread canvas. It uses the same full authored dimensions, real
font bytes and selected NATO, digital and numbered USMC painters. There are
still no product changes to material painting.

The first run timed out during the worker initialization handshake after
120 seconds, before any worker paint or paired comparison completed. Its
individual main font loaded in 7.5 ms. The one retained NATO baseline took
1,478.8 ms as a deliberately synchronous full generator drain; its 1,479 ms
LongTask is valid, but the heartbeat failed to bracket that task and its
16.3 ms gap is not a responsive-paint result. Pixel parity, offload and main
installation cost are **unmeasured**, not failed, in this incomplete run.
Worker termination, zero pending requests, baseline canvas reset and font
removal completed. The immutable report remains under
`whole-painter-worker-r11-native/`.

The bounded R2 harness correction checks the exact individual font's loaded
status and set membership instead of waiting on the worker font set's broader
readiness lifecycle. It also brackets work with observed callback timestamps
and adds initialization breadcrumbs. Neither painter code nor dimensions were
changed. The complete result is retained separately in
`whole-painter-worker-r11-r2-native/report.json` (completed
2026-09-10T00:38:33.725Z).

R2 completed all three pairs, invalid-request handling, in-flight termination,
and cleanup on native Chrome 151 / Apple M5 Max. Whole-painter offload has a
real responsiveness benefit in this isolated test: maximum observed callback
gaps were 17.7 / 16.8 / 17.5 ms with no LongTasks, versus synchronous baseline
gaps of 1,084.0 / 81.9 / 82.6 ms for NATO / digital / numbered USMC. Main-thread
installation took 3.0 / 1.5 / 0.8 ms; cold worker initialization took 8.5 ms.
These are not application-loading or GPU-upload measurements. The baseline
deliberately drains the entire generator synchronously, unlike the covered
application loader's cooperative stages.

**Exact-output acceptance failed.** NATO's four diagnostic maps matched fully.
All three schemes matched albedo (including the actual numbered font), height,
normal, feature plan, RNG continuation, checkpoint count, and installed bytes.
However, digital roughness differed in 11,064 channels (maximum difference 12),
and numbered USMC roughness differed in 24 channels (maximum difference 9).
The earlier verified input maps do not prove that intermediate downsampling or
base roughness was identical; that attribution remains to be established.
No worker painter has been integrated into the game, and no pattern is quietly
exempted from the fidelity gate. A successful process exit here means the
experiment completed, not that its `exactParity:false` result passed.

### R12: localized roughness mismatch and exact hybrid feasibility

The single follow-up diagnostic captured the existing pre-modulation roughness
read, half-resolution classifier read and class IDs, without adding a new
raster read at those boundaries. Base roughness was exact in both realms.
Digital classification input differed in 8,914 channels by at most one byte,
which changed 401 class IDs and produced the same 11,064 final roughness
differences. USMC input differed in 1,197 channels by at most one byte, changing
one class ID and producing the same 24 final differences. Thus the native
downsampling boundary, not the numeric modulation or base painter, explains
the observed R11 mismatch.

One universal hybrid was tested: run the exact painters through base roughness
in the worker, transfer albedo, normal and base roughness, then install them on
main-thread canvases and run the unchanged main `paintPatchRoughness` owner.
All three schemes matched every final RGBA byte, classifier input and class
ID, feature plan and RNG continuation. Error handling, cancellation and owned
cleanup passed. No pattern-specific bypass or texture-quality reduction was
used. Receipt: `whole-painter-hybrid-r12-native/report.json`; rationale and
limits: `whole-painter-hybrid-r12-findings.md`.

Main installation took 4.3 / 1.1 / 1.6 ms; original roughness correction took
32.0 / 20.2 / 19.4 ms. Bracketed callback gaps were 50.5 / 23.4 / 35.8 ms with
no LongTasks. Cold NATO output readback still cost 718.6 ms, but occurred in the
worker while the UI continued servicing frames; it was not eliminated. The
warm export costs were 21.0 / 21.7 ms. This establishes feasibility, not a
full-fleet/browser or application-frame certificate. Integration must retain
the exact shared painter, native main correction, texture identity, bounded
worker lifetime, failure fallback and pending-lease ownership before an actual
application capture can support a performance claim.

### R13: exact shared painter worker integration

The feasibility path is now implemented, pending combined application validation.
`materialPainter.ts` owns the unchanged Canvas2D algorithms with an injected
canvas factory and no Three.js dependency. Of 33 original function declarations,
31 retain identical emitted JavaScript; only canvas creation/grain ownership
changed. All original seed draws, checkpoints and normal-copy operations remain.

Concrete texture identities use one serial worker through the existing
`PREBAKE_PENDING` owner. The worker loads the actual bundled font, paints through
base roughness, and transfers three independently owned RGBA buffers plus the
feature plan. The main owner installs private canvases and applies the unchanged
native roughness correction. No live canvas changes until the complete result
is ready. New entries adopt the canvases; promotions retain existing canvas and
THREE.Texture identities and their immutable-storage resize/disposal ritual.

The cache is checked again after worker completion and the caller scheduling
checkpoint: newer synchronous acquisitions or higher-quality promotions win.
Lease pins and owner-failure draining remain unchanged. Independent read-only
review found no blocking race in those paths. The bounded worker queue has an
absolute 15-second queue/work deadline, five-second idle teardown, strict reply
validation and legacy fallback on capability, font, transport or output failure.
The worker's focused protocol/lifecycle test passed 21 cases; its scoped metrics
passed 142 functions with no violations or explicit any/unknown. Combined lease,
painter, loader, build and native validation are not yet claimed by this entry.

This first integration accelerates fixed identities, not mutable Garage/global
selection jobs. Synchronous acquisition and repaint APIs retain the original
path. That ownership boundary is not a per-pattern visual exception: digital,
numbered, custom and ordinary paint all use the same painter and correction.
No texture-resolution, renderer-quality or acceptance-budget reduction is used.

The initial combined acquisition is retained as
`r13-texture-final-focused-receipt.json`: five checks passed; the sixth,
`fleetLazy.selftest.mjs`, hit its unchanged 240-second full-fleet subprocess
timeout. The run stopped there, with unchanged source hashes. It is not a
21-check pass. Concurrent builds/renderers were observed on the shared host,
but that observation alone does not establish the timeout's cause.

Review also found partial-allocation cleanup worth making explicit. Private
canvas allocation now tracks each successful canvas inside the guarded block;
failure on a later allocation clears those earlier canvases before legacy
fallback. Failed unpublished-entry setup disposes already assigned textures
and clears track/private canvases without publishing a cache entry. The added
public-boundary fault tests cover canvas and texture allocation 2/3, retry,
fallback output and cleanup. This test passed first in the distinct r2 run;
the rest of that combined run is not yet claimed complete here.
The modified worker integration's six declarations/13 functions pass scoped
metrics, with no violations or explicit any/unknown. Pinned Doctor 0.9.13 reports
zero diagnostics for the current full materials file; the scoped diff check
passes with unchanged source hashes. Evidence:
`material-worker-integration-static-receipt.json`.

The full-fleet timeout audit found that the unchanged test requests
`geometryReceipt:true`, bypassing material painting entirely. Its core/facade
sources match the earlier R9 receipts. An older full-suite log records a
passing 164-vehicle/200-profile sweep but has no per-test duration, so it cannot
establish a prior timing margin or the exact point of this new timeout.
The full-fleet timeout
remains a separate unresolved gate, not waived by selected-path validation.

R2 completed all 20 selected checks with unchanged source hashes
(`r13-texture-final-focused-r2-receipt.json`). The first full typecheck then
found TS2741 at the worker bootstrap: TypeScript did not retain the predicate's
narrowing on the special `globalThis` expression. That failed build receipt is
preserved, and no public build ran from it. Binding the same global to a local
constant fixes the narrowing without a cast or behavioral change. R3 repeated
the worker and public lease tests successfully against that one-file correction
(`r13-texture-final-focused-r3-receipt.json`); the original 20-check evidence is
retained separately, not relabeled as a new 20-check invocation.

The corrected full typecheck (including the core-unused check) and public build
passed. `candidate-r13-texture-r3-build-receipt.json` binds the full source and
output manifests to index SHA-256
`bee19cdb50a3d30c0fe2f3e1cff24cecf7651b4d04ee40792e5638ba2a67d179`.
That is an immutable diagnostic candidate, not a publication or a waived fleet
gate. Compiled native pixel parity and actual-button observations remain separate
from its CPU/build acceptance.

The single compiled native parity acquisition completed successfully at
2026-09-10T02:06:50.922Z (`r13-painter-parity-native/report.json`), on Chrome
152.0.7977.76 with native Apple M5 Max ANGLE/Metal. Seven base cases cover NATO,
digital, numbered USMC, custom strokes/transforms, non-power-of-two 1536/768
maps, Zimmerit with both bolted/welded rows, and the Claude SVG/even-odd path.
Every base map and final corrected roughness channel matches exactly, with
identical feature plans. Five actual `acquireSharedTextureLease` through
`createTankMaterials` cases also match all final maps and texture policy;
low-to-High promotion retains live identities and expected disposal counts.

Thirteen successful native worker replies are observed: fallback cannot silently
pass this gate. The real bundled font loaded and was removed; the owned worker
terminated, with no browser or cleanup errors. Source/input/output witnesses
remain stable. The diagnostic separately bundles the actual maintained modules,
not the application's identical chunk layout. Its control bakes, readbacks and
hash comparisons are deliberately fidelity diagnostics, not frame benchmarks.
The distinct immutable-application button test is still required for timing.

The distinct R13 actual-button run completed at 2026-09-10T02:14:16.215Z.
Its maintained functional/audio checks pass, with all 14 tanks, full High
1280×720 DPR1, scale 1, trim 0, native Metal and SMAA High/FSR1. Day → night
(104 emitters) → Garage (zero battlefield emitters) remains correct; visible
grass work is complete. All three saved stills were inspected. Browser,
graphics and cleanup errors are empty; owned browser/server processes closed.

| R13 action | Painted cover ms | Total ms | Maximum rAF gap ms | Maximum LongTask ms |
| --- | ---: | ---: | ---: | ---: |
| Battle | 35.5 | 7352.0 | 290.3 | 282 |
| Battle Again | 136.5 | 5735.0 | 154.7 | 138 |
| Return to Garage | 129.5 | 419.2 | 59.7 | none |

**The additional worker-execution gate fails.** Its passive witness observed
the sky and wreck workers and clean browser disconnection, but no material
worker. Source tracing confirms `battleVisualStreamer` calls
`prebakeSharedTextures` with four arguments: omitted selection resolves to the
mutable per-spec identity, excluded by R13's `identity.fixed` guard. Normal
solo loading therefore keeps the old path. The separate chunked repaint route
also remains main-thread work. Passing explicit public-cache fixtures is not
proof that the actual solo entry/rematch route is accelerated.

Evidence: `garage-actions-r13/report.json`, its three PNGs,
`garage-actions-r13-worker-witness.json` and the failed
`garage-actions-r13-runner-receipt.json`. These are retained unchanged. The
unprofiled callback intervals do not identify the exact cold constructor or
the historical gameplay-stall cause. Follow-up must preserve per-spec seeds,
mutable cache/texture identity and repaint RNG while fixing the actual route;
changing solo tanks onto different fixed keys would not preserve appearance.

### R14: ordinary battle base-paint integration

The R13 fleet-loader gate was rerun once with the exact maintained test,
unchanged environment and original 240,000 ms child timeout. It passed in
158,020.8 ms: 164 demand-loaded vehicles and 200 demand-owned profiles.
`fleet-lazy-maintained-r13-r1-receipt.json` records status 0, unchanged source
hashes, closed child process group and released ownership. This closes the
current regression gate, not the diagnosis of the earlier timeout.

The actual-game worker bypass has a narrow source cause: both early
`battleIntent.warmRosterTextures` and solo streaming call the four-argument
`prebakeSharedTextures` API. Its mutable cache key is the spec ID, whereas R13
only dispatched fixed camouflage lease identities. The earlier R9 CPU profile
also places its 109 ms roughness and 25 ms normal readbacks under
`bakeSharedCanvasesSteps` / `prebakeSharedTextures`, not the separate repaint
routine. Therefore this correction targets base warming; it does not introduce
a new repaint-worker mode or change the repaint RNG stream.

R14 keeps the mutable spec-ID key, seed, current cached recipe, canvas identities
and live THREE.Texture objects. Worker publication checks the original cache
owner, immutable recipe fingerprint, separately resolved global camouflage,
and a per-entry repaint revision. Chunked repaint ownership is counted and
joined before fallback, including cancellation/exception cleanup; a late base
result cannot overwrite an A→B→A repaint merely because the pattern ID matches.
After an idle join, the existing caller tick observes cancellation before a
legacy paint begins. Unsupported browsers retain synchronous-start behavior
when no repaint is active.

The fresh R14 focused wave passed all ten selected files at
2026-09-10T02:38:17.405Z, with no input drift. It covers mutable worker/cache
ownership, active A→B and A→B→A repaint races, cached A versus global B RNG
semantics, queued custom/biome/nested-palette/plate-line edits, cancellation
after both worker failure and repaint-idle waiting, fixed leases, exact material
quality, worker transport failure, camouflage policy/canvas/defaults, swatches,
solo visual streaming and multiplayer roster assets. Raw receipt:
`r14-texture-final-focused-receipt.json`. These ten checks do not replace earlier
historical whole-suite evidence or establish smooth gameplay by themselves.

R14 full typecheck/public build passed. Immutable app index:
`27b7de0779b0fd7098006c1f1c1fc819bc5340f7e363a28f3e38f2ff8ccf78e9`.
The focused children took 10.209 seconds combined (11.222 seconds including
between-child checks), following 52.546 seconds of queue/start overhead.
Typecheck ran for 5.784 seconds after 38.028 seconds of pre-command wait/overhead;
public build ran for 13.622 seconds after 54.772 seconds between commands.
These wait measurements include hash/start overhead and are not claimed as pure
FIFO measurements. Scoped static review: 15 declarations / 24 functions, zero
violations; maximum changed-function cyclomatic/cognitive complexity 19/19.

Native compiled-module parity completed at 2026-09-10T02:47:51.496Z on Chrome
with ANGLE/Metal Apple M5 Max. All seven base recipes, five fixed public-cache
cases and two actual omitted-selection mutable cases pass exact full RGBA,
feature-plan, original spec-ID seed and live texture/canvas identity checks.
All 16 native worker replies succeeded; error and cleanup lists are empty.
Raw receipt: `r14-painter-parity-native/report.json`. This acquisition ran its
comparisons for about nine seconds after about six minutes of waiting/startup;
it is an output-fidelity diagnostic, not an application acceleration benchmark.
The separate real-control application acquisition completed at
2026-09-10T02:52:21Z. Battle, night Rematch and Return to Garage pass functional,
audio and visual-continuity gates with no page, console, graphics or cleanup
errors. Both battles contain the full 14-tank, 7-versus-7 roster, ordinals 1→2;
Garage returns to an empty battle roster and complete M1A1 pedestal. All three
stills were inspected. Native High 1280×720, DPR 1, render scale 1, trim 0,
SMAA High and FSR1 remain unchanged. The full 3329-file before/after manifest
and immutable app index match. The owned browser exited and port 6004 closed.

Raw action timings for Battle / Rematch / Garage respectively: cover
259.9 / 137.4 / 106.2 ms, total 6659.3 / 5571.4 / 357.3 ms, largest callback
interval 250.7 / 134.3 / 51.9 ms, Long Task maximum 205 / 54 / none.
Three material-worker constructions were observed. That passive
`workercreated` observer establishes construction, not successful cache
installation; do not conflate it with the separate successful-reply parity
evidence. These current cold-transition gaps remain open performance work;
no zero-lag, quiet-machine FPS certification or historical-cause claim follows.

One separate frozen-build attribution run subsequently completed with the same
High settings and full-roster flow. Its bounded passive protocol observer saw
30 material requests and 30 matching successful replies, no worker errors,
no dropped observations and no outstanding requests at idle termination. This
proves real application base replies, not cache-install timing or acceleration.
Raw evidence: `garage-actions-r14-profile/` and
`garage-actions-r14-profile-worker-witness.json`; profiling/observer overhead
means its timings must not replace the unprofiled acceptance measurements.

The cold 196 ms Long Task contains 156.748 ms self time in the actual
`new AudioContext({ latencyHint: 'interactive' })` call in `lazyAudio.ts`, plus
25.518 ms inclusive in `audio.ts` buffer synthesis. This profile observed the
opaque cover at 27.8 ms, before that Long Task. The earlier unprofiled first
cover observation therefore does not prove the loader was absent throughout
audio startup. This identifies a current cold-loading cost, not the cause of
historical gameplay stalls. The longest rematch task happens after coverage,
during private tank-core construction (Leo2A4 in this trace, T-80U in the earlier
unprofiled row); it is not another base-texture-worker bypass. Cooperative
buffer synthesis and private-core staging are remaining application-owned
candidates; browser device startup remains a separately measured platform cost.

The exact eight worker/material/test files, two registry additions and focused
documentation were committed as `067dc0586` on the owner branch, then integrated
on current main as `bbc1d77f1`, direct child of `183f9bbcd`. Post-rebase eight
checks, pinned Doctor (zero diagnostics), typecheck and public build passed.
Total ordinary FIFO wait was 2.213 seconds; Doctor ran 3.829 seconds, typecheck
3.685 seconds and build 4.383 seconds. The push was non-forced and the remote
hash verified. Only the owned clean temporary integration worktree was removed;
this broad WIP, local evidence and shared root were preserved.

A production HTML read at 2026-09-10T03:10:32.354Z returned HTTP 200 and
`application-version=v1.0.0+g0a644340f`. Git verifies `0a644340f` is a direct
child of the published worker checkpoint. Thus the public deployment identifies
a revision containing this change; this read is not a production battle test
or a performance certification.

## Retained HUD: clean-main checkpoint

The exact8-file checkpoint (runtime, focused tests, browser gate, one registry
entry and documentation) is published at
`1beb0c780a9eadbc0cc488ff33ba520bd0d14b14`, a direct child of `0a644340f`.
Four focused checks pass. Pinned Doctor0.9.13 scans the two pre-existing parent
modules and all three candidate modules with zero diagnostics in each. Full
typecheck and public build pass. The unchanged normal-motion browser gate passes
all74 rows across desktop, short laptop, phone and landscape, with zero browser
errors. Root inspected the four combined-state screenshots. All source hashes
and HEAD stayed fixed, and all owned processes/leases closed.

Receipt: `clean-hud-checkpoint-1MItGG/receipt.json`. These are DOM behavior and
integration checks, not a new game FPS measurement. The temporary clean tree is
reused for the remaining performance integration to avoid worktree proliferation.

## R15: genuine paint opportunity before loading work

The paint-sensitive scheduler no longer accepts a 34 ms timer as evidence of a
visible frame. Visible documents require an actual animation callback followed
by a task boundary; a bounded 1000 ms deadline rejects instead of claiming a
paint. Hidden/no-rAF hosts retain the compatibility fallback. Visibility changes,
obsolete timer callbacks, cancellation paths and all owned listeners/timers are
covered. General non-paint-sensitive scheduling is unchanged. This provides a
rendering opportunity, not a physical display acknowledgement.

The first five-test acquisition had four passes and one fixture failure:
`transitionRuntime` supplied a document without EventTarget methods. The repaired
fixture uses a real EventTarget, asserts listener cleanup, and preserves its
supersession/error assertions. The fresh R15-r2 run passes all five checks;
pinned Doctor0.9.13 reports zero findings for the unchanged scheduler source.
Full typecheck/public build pass at 03:21:17 UTC. Both the first failure and the
fresh receipts remain in the local evidence directory; no failed run was erased.

One unprofiled native actual-controls smoke completed at 03:23:08 UTC on frozen
index `fb0988cd24e4a194449c9c401415057760b1432fb13204964b15db395ac4bc38`.
The entire 3329-file build manifest remained unchanged. Full 14-tank day Battle,
night Battle Again and Return to Garage pass, including audio-clock ownership,
with no page/graphics/rescue/cleanup errors. Root inspected all three stills.
Native Chrome152/Apple M5Max, High1280×720/DPR1/scale1/trim0/SMAA-High+FSR1
are unchanged. Owned browser/processes and port6006 are closed.

Raw Battle / Rematch / Garage: covers55.1/140.1/106.0 ms;
totals6720.7/5589.8/339.9 ms; largest callback gaps251.9/132.8/47.2 ms.
Cold coverage was observed at2453.7, before the187 ms Long Task at2518.3–2705.3
and the first running-audio sample at2706.6. This is an observed early visible
response; it does not eliminate the remaining audio-device or private-core task.
No smoothness, historical-gameplay-cause or native FPS certificate follows.
Raw evidence: `garage-actions-r15/report.json`, its three PNGs, and
`garage-actions-r15-runner-receipt.json`.

## Systems-language evaluation

Current decision: fix measured scheduling/DOM/allocation problems in the existing
TypeScript runtime first. A whole-game rewrite is not justified by these traces.
This is not a claim that native kernels cannot help: benchmark an isolated kernel
only after preserving numeric output, lifecycle and end-to-end transfer costs.
No C, Go, Zig, or Rust kernel was implemented or benchmarked in this pass; the
language comparison is an architecture assessment informed by the runtime traces.

- [Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)
  move CPU work off the UI thread but cannot access the DOM. Transferable numeric
  buffers fit the already-existing sky, Garage exhibit and wreck workers.
- [Rust's browser Wasm target](https://doc.rust-lang.org/rustc/platform-support/wasm32-unknown-unknown.html)
  does not make `std::thread::spawn` available. A main-thread Wasm call still
  blocks that thread; put an independently measured numeric kernel in a worker.
- [C/C++ pthreads through Emscripten](https://emscripten.org/docs/porting/pthreads.html)
  require the browser shared-memory security setup. Supporting environments
  without threading requires a separate non-threaded build. Main-thread waits
  and copied JS/Wasm interop can undo gains.
- [Zig WebAssembly](https://ziglang.org/documentation/master/#WebAssembly)
  is another explicit numeric-buffer implementation option, not an automatic
  replacement for Three.js or browser UI scheduling.
- [Go's browser Wasm support](https://go.dev/wiki/WebAssembly) includes a matching
  JavaScript runtime bridge. A Go migration is not an automatic removal of
  runtime/GC overhead; measure cold payload, memory and sustained work.
- [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
  permits worker rendering, but moving this engine also means migrating scene,
  input, resize and GPU lifetime ownership. It does not create a faster GPU.

Kernel gates: exact seeded candidate order and output buffers; Float64 math until
the existing Float32 boundary; no fast-math drift; cancellation and world
generation ownership; bounded concurrency; unsupported-platform fallback; and
cold/warm user-visible latency including transfer, hydration and GPU upload.
Terrain kernels remain coordinated with the world-owner task.

## Remaining runtime integration checkpoint

The remaining runtime work is integrated over `1beb0c780`, retaining main's
source-Abrams/native running-gear changes and world-art inputs. Four obsolete
local world copies were excluded. The registry keeps each test independent;
loading tests no longer invoke another registered suite internally.

The final audio change cooperatively prepares the existing seven PCM buffers
before the lazy mixer constructs its graph. White noise, wind, crackle, and four
gun beds retain their exact Float32 write order, normalization, sample rate,
and RNG continuation. Work yields after at most 16,384 sample operations or a
2 ms cooperative budget checked between bounded blocks. Existing synchronous
callers drain the same generator. Cancelled preparation discards private buffers
without closing a borrowed AudioContext. The shared facade coalesces acquisition
and applies the latest phase/loading intent after preparation.

This addresses the measured application synthesis work, not the browser's
unpreemptible AudioContext constructor or native buffer allocation. No audio
device, sink, quality or sample-rate change is being used to conceal those costs.

Independent review also found a post-await generation gap in terrain/FX/forward
warm-up. Producers now check current ownership at their own resume boundary,
before accessing an abandoned world or advancing another render cohort. Tests
exercise cancellation after the nested yielder's check has already passed.

Integration gates are recorded in the release receipt: 76 distinct affected and
main-preservation CPU suites, separate focused audio checks, differential pinned
Doctor, typecheck, public build, and an unchanged full-14 actual-controls
day Battle → night Battle Again → Garage smoke. This section describes the
implementation and required gates; it does not predeclare pending gates passed.
Historical 214–319 ms stalls, long-session frame budgets, and all-phase
responsiveness are not yet certified.

## Final integrated runtime validation — 2026-09-10

Runtime checkpoint: `889f7a6a80af90b1615c539c187b4e92fe6b1d45`, based on
published `57b05f0c0e2374c103f4285ff63d84871967894c`. The shared dirty checkout
and unrelated vehicle geometry were untouched. Current main's overlapping bush
sprays and all original world palettes/masks remain intact. Tests and artifacts
ran with unchanged budgets, visual quality and ordinary FIFO leases.

The separate test-only `57b05f0c0` checkpoint preserves the immutable original
Mangrove/village digests across independently authenticated Foundry palette,
Autumn foliage and Autumn/Delta crop additions. Exact current values and mutation
negative controls are checked before reconstructing only historical input views.
No map, runtime geometry, raster output or golden hash was changed. Mangrove's
six native water bakes, current Autumn construction and village's desktop/mobile
mask cases passed before that narrow checkpoint was pushed.

CPU evidence is cumulative and explicitly preserves failures: r1 passed13 then
stopped at a minimal fake-document fixture; r2 passed15 then stopped at the stale
historical map receipt. The corrected fixtures use EventTarget cleanup and exact
historical inputs rather than weakening runtime behavior. Final r3 passed all52
remaining/current-main checks, including the164-vehicle/200-profile lazy-fleet
check in136seconds under its original240-second budget. The union of passing
results covers all79 distinct planned files; this is NOT a new full `npm test`
run or a claim that all914 discoverable checks ran on this checkpoint.

Pinned Doctor0.9.13 raw output remains exit1. Its offsets are UTF-8 bytes, not
JavaScript UTF-16 indexes: the corrected artifact classifier establishes34
inherited findings and7 intentional ordered cooperative waits, with no newly
actionable finding. The raw diagnostics are retained. Current-head association
proves46 scanned runtime files byte-identical and vegetation equal to the prior
candidate plus the exact already-published bush replacement. No rescan, zero-raw-
warning claim, runtime suppression or concurrent advancement of shared generators
is implied. Full current typecheck and public build pass; owned children drained.

Build index: `0c4c7ad6efd25c4b3ff3ad23308ed16790f536117602fd3a11a8a50aa179e682`.
The unchanged native actual-controls probe passed full14 day Battle, full14 night
Battle Again and empty-roster Return to Garage, including audio-clock/loading
ownership. All3 stills were inspected; no page, graphics, rescue or cleanup errors.
High1280x720/DPR1/scale1/trim0/SMAA-High+FSR1 remain unchanged. Battle/Rematch/
Garage cover times were49.3/139.9/105.7ms, total times6850.1/5556.4/339.9ms and
largest callback gaps162.3/204.9/48.5ms. These are raw loading/transition timings,
not causal A/B speedups or proof that preparation no longer stalls.

The normal60-second Verdant battle used the exact reference14 roster,
High1280x577/DPR1/native cadence and the first control-release window, without
pre-window settling or forced GC. All29 planned trusted camera inputs responded;
roster, texture, draw-call, heap and console gates passed. Across3549frames,
median/p95/p99 intervals were16.7/16.8/33.3ms, median FPS59.9, peak draws837,
texture estimate156.1MB and raw heap growth-0.34MB/s. The unchanged median-FPS
and p99 gates FAIL. Certification was separately REFUSED because other
interactive-browser GPU CPU reached46.1% (limit15%); foreign headless GPU count
was0. No threshold was rounded/waived and no foreign process was stopped.

Raw local evidence under `/private/tmp/cot-interactive-baseline.gsRCvU`:

- `palette-oracle-main-checkpoint-r3-receipt.json` (three-test published checkpoint).
- `clean-performance-integration-focused-r3-receipt.json` (52/52 final continuation;
  r1/r2 failures and source cutovers remain alongside it).
- `clean-performance-doctor-review.json` and the unchanged raw scanner receipt.
- `clean-performance-current-build-99PIeb/receipt.json` (current source bridge,
  typecheck, build, index and process/lease cleanup).
- `garage-actions-integration/report.json`, three PNGs and runner receipt
  (functional PASS; full immutable dist witnessed before/after).
- `early-camera-integration.json` and runner receipt (input coverage PASS;
  strict frame gates FAIL and contended timing certification REFUSED).

Remaining acceptance is explicit: the specific historical214–319ms gameplay
stalls have no proven causal trace; sustained/all-phase frame budgets and
multi-device/OS-throttling guarantees are not established. Native audio-device
startup and atomic profile/GPU operations can still block. Publication of these
verified improvements must not be described as all lag eliminated.

## Production verification — 2026-09-10 04:37 UTC

Non-forced runtime publication is remote-verified at
`18e519d35c839fa08d38064b26d6d42ddbdb7d44` (runtime889f7a6a8 plus documentation).
Vercel deployment and GitHub catalog check both report success. Production HTML
before/after the actual-control probe identified `v1.0.0+g18e519d35` and the
same index SHA256
`dda7b24d03eb81ee27e13a1e36f428d3767966e35efd296a417e2387f8acbe5b`.
The browser loaded that exact index; this is not only an HTTP health check.

The real full14 day Battle, full14 night Battle Again and empty-roster Return to
Garage pass, with M1A1 preserved and battle ordinals1→2. Audio loading/ambient
ownership passes. High1280x720/DPR1/scale1/trim0/SMAA-High+FSR1 are unchanged,
native Chrome152.0.7977.83 uses ANGLE/Metal AppleM5Max. All3 screenshots were
inspected. Error, failure and cleanup lists are empty; the owned browser closed.
The runner waited under the ordinary shared FIFO before the acquisition.

Raw Battle/Rematch/Garage cover times:200.4/149.6/138.0ms. Totals:
12292.2/6065.9/454.7ms. Largest callback gaps:338.0/125.4/53.6ms. The functional
gate's500ms cover deadline passed; this is NOT a frame-budget or zero-stall pass.
The338ms cold-loading gap must remain visible in the open performance work and
does not establish the cause of the historical214–319ms gameplay stalls.

Receipts: `garage-actions-production/report.json`, its3PNG stills and
`garage-actions-production-runner-receipt.json` under the evidence root above.
The implementation source remaining in the original owner worktree matches the
published nine audio/generation-boundary files exactly; unrelated/stale world
copies are preserved there, not swept into main. The clean integration branch
contains the released runtime. This final production note changes documentation
only and does not require claiming a second runtime acquisition.

## Fresh production stall attribution — 2026-09-10

The existing actual-controls probe ran with `--profile-actions --audio-clock-gate`
against production `aa03ceb90`, index SHA256
`ecd1cfa27499687c23001f86f2ceaf10c9ece4c3167165e89858666a5f695b7e`.
The ordinary FIFO lease covered the acquisition. Full 14-tank day Battle, full 14-tank
night Battle Again and Return to Garage passed their functional/audio gates;
all 3 saved stills were inspected and page/failure/cleanup lists are empty.
CPU profiling adds diagnostic overhead: these timings are attribution evidence,
not an unprofiled speedup or smoothness certificate.

Cold Battle reproduced a 229.8 ms callback gap at page 3398.8–3628.6 ms and a
219 ms self Long Task at 3405.6–3624.6 ms. Its dominant sampled stack is
`startLoadingAfterPaint → resume → unlockContext → createContext`.
The exact published `main-0MGPh61Z.js:2182:174601` function constructs
`new AudioContext({latencyHint:'interactive'})`. Intersecting CDP start/stop
page-clock brackets leaves 30.878 ms alignment uncertainty. Even the conservative
per-sample lower overlap bound attributes 192.790 ms of that callback gap to this
constructor wrapper (midpoint 208.229 ms, conservative upper 212.931 ms). This
identifies the dominant work in this reproduced **cold loading** stall. It does
not retroactively establish the cause of unprofiled historical 214–319 ms
**gameplay** stalls or the exact earlier 334 ms loading task.

The [Web Audio specification](https://webaudio.github.io/web-audio-api/#AudioContext)
exposes AudioContext on Window and distinguishes its control thread from the
audio rendering thread. Moving DSP into AudioWorklet, or compiling application
code to Wasm, does not relocate this page-side constructor. The
[constructor's device options](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext)
also make clear that a `none` sink suppresses device playback; that is not an
equivalent performance fix. We keep the real output device, native sample rate,
interactive latency, gesture policy and existing post-cover startup boundary.
No native/browser-device limitation is being reported as eliminated.

Rematch's 122.8 ms callback gap contains sampled synchronous hit-card schematic
work: 14.834 ms in `bakeSchematic`, 13.695 ms in its full-image `getImageData`, and
5.141 ms in `toDataURL` at the midpoint alignment. Their conservative lower bounds
are 8.139/8.754/2.515 ms, with 21.342 ms clock uncertainty. The exact published
`hud-BmTL4PlN.js:535` resolves to the normal full-resolution luminance,
high-quality resize, sharpen and outline pipeline in `src/ui/shotInfo.ts`.
This is a concrete worker/cooperative-preparation candidate, not evidence that
it explains the entire gap. Native pixel-output parity and unprofiled validation
are required before claiming that a replacement improves the shipped path.

Garage's 50.9 ms callback gap includes 6.276 ms sampled `scrollIntoView`, 5.026 ms
program-parameter queries during environment baking, and 3.772 ms shader disposal.
Its 9.923 ms clock uncertainty and unaccounted work preclude a single-cause claim.

Raw evidence under `/private/tmp/cot-interactive-baseline.gsRCvU`:
`garage-actions-production-profile-r1/report.json`, the three `.cpuprofile`
files/PNGs, and `production-action-profile-r1-attribution.json`. The local
`analyze-production-action-profile-r1.mjs` records input hashes, page-clock
intersection, sampled stacks and conservative alignment bounds. It never edits
the captured receipts. Live gameplay still needs same-window raw callback,
Long Task and CPU-profile evidence; this loading acquisition does not replace it.

### Same-window gameplay evidence, not retrospective certainty

`early-camera-profile-baseline-r1.json` captured 60.014 seconds from first control
release on the preserved published `889f7a6a8` build, with the same pinned 14-tank
Verdant roster, native cadence, full high-quality graphics and four shadow
cascades. The raw CPU profile is retained with SHA256
`7b13c103558554bec3bcecad39c2a887b57d024b7770094e027c7f02c541723c`.
The existing sampler also recorded actual callback gaps and Long Tasks; no
second animation loop or gameplay mutation was introduced for those records.

The largest callback gap was 65.7 ms. Three self Long Tasks lasted 50, 56 and
51 ms. The historical 214–319 ms gameplay event did not recur. Clock-bracket
intersection leaves 63.605 ms uncertainty. In the 56 ms task, one 88.406 ms
sampling interval points to Three's `setValueV3f` through uniform upload,
`SceneAAPass.render`, postprocessing and the main render owner. Its conservative
overlap is 38.27–56 ms, but that sparse interval is not a measurement of active
CPU time inside the setter and does not identify a particular uniform or prove
a driver fault. The worst callback and 51 ms task mostly overlap an `(idle)`
sample. Input, obstacle avoidance and matrix-update samples elsewhere have zero
guaranteed overlap. None warrants changing input, AI, matrices or visual quality.
No schematic-processing stack was identified in these selected gameplay events.

This acquisition is explicitly **not a performance pass**: profiling overhead,
47.3% foreign interactive-browser GPU-process CPU, 28/29 camera inputs (one
properly dropped when its full response window no longer fit), and failed frame/
draw gates are retained. Median/p95/p99 frame intervals were 16.7/33.3/33.4 ms;
worst-frame draws reached 936. No thresholds, input spacing or roster were relaxed.
`early-camera-profile-baseline-r1-attribution.json` preserves the sampled bounds,
exact frozen bundle contexts and hashes. After acquisition and source mapping,
the old `dist` was preserved at `published-runtime889-dist` under the evidence
root before building the new UI candidate.

### Hit-card preparation fix and verification — 2026-09-10

The identified synchronous schematic preparation has been replaced with one
bounded worker queue. The full-resolution normalization, high-quality resize,
sharpening and outline recipe is unchanged. Unsupported or failed workers use
the same recipe in cooperative main-thread slices and asynchronous PNG encoding;
the original image remains available while preparation is pending. Queue bounds,
active-job deadlines, stale replies, retries, cancellation, image/canvas cleanup
and idle worker termination are covered. This does not change gameplay, audio,
graphics quality, or vehicle assets.

The final native Chromium regression (`shot-schematic-native-parity-r3/receipt.json`)
passes all seven independent legacy-reference comparisons: M1A2/T-90 top and side,
transparent edges, tiny output, and a single pixel. Worker and forced-fallback
outputs differ by **zero RGBA bytes** in every case. The production client
validator accepted seven actual worker replies, with zero fallback substitutions
in the worker leg. Browser errors, failed HTTP responses and cleanup errors are
empty; before/after source hashes match. Earlier failed fixture-route/favicon
runs remain preserved rather than being relabeled as passes.

Initial focused verification passes: 89 schematic assertions; hit-event formatting,
diagram projection, battle HUD and mobile layout; profiler-window and camera/
action timing tests; native-probe lifecycle and suite registration checks.
Typecheck and the public production build pass. The four runtime files have no
complexity-threshold violations or `any`/`unknown` uses. Pinned React Doctor
reported one unchanged small event-list iteration warning in `shotInfo.ts`;
it is not new per-frame work. Suite discovery reports 918 checks on this candidate;
that is **not** a claim that the whole 918-file suite was executed for this slice.

The unprofiled actual-controls candidate acquisition also passes full 14-tank
day Battle, full 14-tank night Rematch and Return to Garage, with all three
screenshots inspected and no page/failure/cleanup errors. Existing audio clock/
ownership checks pass. Its worst action callback gaps are still
**210.9 / 123.8 / 51.7 ms**, respectively. The cold gap overlaps a 208 ms Long Task;
the rematch and Garage gaps have no overlapping Long Task. Different randomly
selected rosters and these remaining gaps preclude a before/after speedup or
zero-stall claim. Evidence is retained in `garage-actions-schematic-candidate-r1/`
and the `loading-followup-*` logs under the evidence root. This ships a verified
removal of identified synchronous UI work, not a resolution of every historical
or browser/device scheduling stall.

Final review found and repaired an activation ordering edge: multiplayer warms
the roster immediately before the HUD's hidden-to-battle reset. That reset now
clears presentation state without cancelling immutable spec-keyed preparation.
New roster warming still cancels/supersedes old scheduled work. The executed
warm → reset → remaining-frames and stale-callback regressions bring schematic
coverage to **94 passing assertions**. The nine affected UI/profiler checks pass
after rebasing onto `c4b3c14ac`. The first combined runner then stopped on a
mistyped camera-test filename (not an assertion failure); its log is retained,
and the actual `perfprobe-camera-input.selftest.mjs` plus suite registration
are run separately before typecheck/build. No whole-suite pass is inferred.

### Published schematic fix — 2026-09-10 05:52 UTC

Runtime `b03285286b0bb3f5c8b50930efd432bb99bbc0cd` is pushed to main and deployed.
The final camera/registry checks, typecheck and public build pass after rebase;
the combined registry contains 919 discovered checks, not 919 newly executed ones.
Vercel and GitHub's catalog gate report success. Production HTML before, during
and after the actual-controls test has version `v1.0.0+gb03285286` and SHA256
`dfb7f85d2e93fe408dea550932886def3db972f85455585821861eb0d2eba8e8`.
The served schematic worker also matches the built worker byte-for-byte.

Full 14-tank day Battle, 14-tank night Rematch and Return to Garage pass, as do
the existing audio-clock/ownership gates. All three screenshots were inspected;
browser errors, failures and cleanup errors are empty, and owned processes exited.
No graphics settings were reduced. This is a **functional pass only**: worst
action callback gaps remain **276.0 / 102.2 / 51.4 ms**. Cold entry overlaps
263.9 ms of Long Tasks; the other two worst gaps do not overlap a Long Task.
This unprofiled run does not establish those functions' causes or a matched-roster
speedup. Historical gameplay-stall attribution and strict smoothness remain open.
Receipts: `schematic-production-release-r1.json` and
`garage-actions-schematic-production-r1/` under the evidence root above.

### Garage input ownership follow-up — 2026-09-10

Two concrete defects were found while following the remaining cold-audio cost:

- The renderer canvas also owns Garage orbit, but its battle pointer-recapture
  listener unconditionally called `audio.resume()` on every mouse-down. The
  live baseline records a native AudioContext constructor from **2306.8 to
  2474.9 ms (168.1 ms)** immediately after a trusted Garage pointer-down at
  2306.7 ms. This is unnecessary device/mixer initialization on camera input.
  The listener now uses the existing visible-battle phase predicate before
  resuming audio or recapturing. Battle entry/loading and touch recovery keep
  their existing sound owners; context options and sound quality are unchanged.
- The orbit measures a replaced pedestal root periodically. If a player drags
  the new tank before that poll, `settleNewSubject` used to replace the newer
  drag targets with the canonical hero targets. A real-engine regression fails
  on the previous code while the pointer is still held. A changed subject now
  preserves current/recent input and release momentum; explicit reset and the
  normal two-second idle-return policy remain authoritative.

The opt-in `--garage-gesture-audio-gate` uses the actual renderer canvas,
trusted pointer input and production camera state. A transparent constructor
Proxy preserves arguments, prototypes, subclass `newTarget`, native errors and
options. It records bounded call timing/counts only, never device identifiers,
test tones or replacement audio output. Battle, Rematch and Garage return must
then retain exactly one context and pass the existing clock/owner gate, so
skipping context creation or loading-owner activation cannot satisfy the gate.
Audible output is not certified: muted or silent output can still pass those
state checks. Passive held/released snapshots
also retain movement deltas, pointer capture, framing and frame-owner state.

Failure evidence is preserved. The first invocation mistakenly requested the
nonexistent `grass` map and was stopped through its owned cleanup; it is not a
baseline. `garage-audio-intent-production-baseline-r2/` used the intended
`urban` map, reproduced the 168.1 ms constructor and failed the camera-movement
gate; it also exceeded the 500 ms Rematch cover budget (560.6 ms). The audio-only
`garage-audio-intent-candidate-r1/` passes ordinary actions and audio ownership,
but still fails camera motion (45° to 44.995° after a 100 px drag). Neither is
reported as an acceptance pass. The independently failing delayed-subject CPU
receipt is `garage-late-subject-baseline-r1.log`.

Native startup also has a browser boundary: in the previously profiled Chrome
152 implementation, renderer Web Audio device creation queries output device
parameters, and `AudioOutputDevice::GetOutputDeviceInfo()` synchronously waits
on `did_receive_auth_`. See the version-pinned
[renderer device implementation](https://raw.githubusercontent.com/chromium/chromium/152.0.7977.83/content/renderer/media/renderer_webaudiodevice_impl.cc)
and [output device implementation](https://raw.githubusercontent.com/chromium/chromium/152.0.7977.83/media/audio/audio_output_device.cc).
This supports a blocking native-startup mechanism; it does **not** apportion
every millisecond of the recorded constructor to that wait, nor attribute the
historical gameplay stalls. AudioContext remains a Window API. Moving game
math to C/Rust/Zig/Wasm, changing sample rate, or silently preparing an audio
device at boot is not an evidenced cure for this particular wait. The current
fix removes the *unrequested Garage invocation*, not the necessary first
battle-audio startup or all remaining loading/frame stalls.

#### Matched Garage gesture acceptance

The extended live baseline (`garage-audio-intent-production-baseline-r3/`)
confirms a real input-reset defect, not lost test input: all ten trusted 10 px
moves arrive with the correct pointer capture. Camera yaw moves from 45° to
35.843° while held, then is back at 45° by the 1.008-second wall-clock
post-release observation (0.869 seconds of clamped showroom update time), before
the normal two-second idle return. Both Garage frame owners advance normally;
the page stays visible/focused and the graphics context stays healthy. That
baseline also constructs an AudioContext during Garage input (153.2 ms).

The combined candidate (`garage-audio-intent-candidate-r2/`) passes the same
frozen acquisition, SHA256
`4be85c77e2b4a9596a9046b8b8bd6956bc44b3e3543677409654626ca119f137`.
Garage input constructs **zero** contexts. Yaw moves from 45° to 35.572° while
held and continues to -61.065° with release momentum, without the stale reset.
Battle constructs exactly one context (145 ms); Rematch and Garage return keep
that context and pass the existing audio clock/ownership gates. All ordinary
actions pass, with no browser errors, failures or cleanup errors. Garage,
14-tank day Battle, 14-tank night Rematch and Garage-return screenshots were
inspected. Graphics remain high quality at 1280×720, DPR 1, render scale 1,
SMAA-high/FSR1 and four authored shadow cascades on native Apple M5 Max ANGLE.
These paired acquisitions used Chrome 151.0.7922.47; the earlier native-source
investigation above used Chrome 152 and is not mislabeled as this capture.

The input-preservation grace uses wall time rather than clamped simulation
delta: the idle Garage's five-second watchdog must not extend recent-input
ownership. Real-engine tests cover held input, release momentum, zoom, natural
idle return, explicit reset, a sparse-frame 5.1-second boundary, and stop/start.
Nine focused test files pass, with the final wall-clock boundary additionally
rerun with camera tests. Typecheck and the public build pass. The four-file
runtime metric gate finds 178 functions, zero complexity violations, and no
`any`/`unknown`; React Doctor reports 100/100 with no issues. The 920 discovered
suite entries are a registry count, not a claim of 920 fresh executions.

This is a local functional acceptance, not yet a production deployment receipt
and not a zero-lag claim. Candidate action callback maxima remain
**159.2 / 150.8 / 46.9 ms** for Battle/Rematch/Garage. Random battle rosters and
remaining native startup/Long Tasks prevent a controlled throughput comparison
or closure of the historical 214–319 ms gameplay-stall investigation.

#### Published Garage input fix — 2026-09-10 06:40 UTC

Runtime `08c0cb1f2` and its clarified documentation were pushed without force;
the deployed main boundary is `43321e687120b203c97facecce82a315fed5d752`.
Six focused checks, typecheck and public build pass on the combined tree above
the independent birch/aspen change. Production serves `v1.0.0+g43321e687` with
HTML SHA256 `346520787e80a2740a4aacd028f85e5409cc65fa57499205d621e8f8c212850a`
before, during and after the acquisition.

The unchanged frozen Garage acquisition passes on production in
`garage-audio-intent-production-r1/`: camera yaw 45° → 33.190° held → -60.971°
with release momentum, **zero** Garage audio constructors, then exactly one
context through Battle/Rematch/return. Existing loading-clock and owner gates
pass; audible output is not certified by those passive checks. All ordinary
actions pass, browser/failure/cleanup arrays are empty, and four final screenshots
were visually inspected with unchanged high-quality rendering. The owned native
browser and local preview exited; no foreign process was stopped.

The scope remains functional. First battle still spends **173.9 ms** in the
native AudioContext constructor. Action callback maxima are
**182.2 / 111.8 / 38.5 ms**, and first opaque-cover observations occur after
**132.2 / 139.6 / 91.2 ms**. Those are not a claim of steady-state gameplay
throughput, a matched-roster speedup, or resolution of all historical stalls.

#### Cold solo entry: cover before the real runtime download

The followup found a separate ordering gap: accepted Battle input awaited the
first `soloBattleLoadingRuntime` import before showing the loading UI. The
rendering-covered flag alone is not a visible DOM cover. Native AudioContext
construction was already after the subsequent cover/paint boundary; this is
not an audio-before-cover finding.

The accepted solo-entry lifecycle now calls `battleLoad.showPending()` before
that import. It reuses the existing canonical loader with localized generic
labels and empty rosters, then enriches the same element after acquisition.
Duplicate entry remains rejected; rejected imports restore Garage before the
paint boundary and fade. A failed recovery paint keeps the cover in place.
No audio settings, render quality, world content, or simulation behavior change.

Ten focused CPU checks passed during implementation; six final combined checks
also pass, including the new probe contracts and suite discovery. Typecheck and
public build pass. Runtime metrics: 567 functions, zero violations, zero
`any`/`unknown`. React Doctor reports 91/100 with four new warnings confined to
ordered microtask-await loops in the regression test. Applying its parallel-loop
suggestion is rejected: those assertions intentionally inspect successive
dependent async boundaries, an exception described by the canonical rule. No
suppression or runtime workaround was introduced. The 923 discovered entries
are a registry count, not a fresh full-suite execution claim.

The ordinary native action candidate (`solo-cold-import-actions-candidate-r1/`)
passes the unchanged Garage/input/audio/action acquisition. First cover is
observed after 2.2 ms; Battle, night Rematch and Garage return complete, and
screenshots retain authored high-quality graphics. This random-roster run is
functional evidence, not a controlled gameplay throughput comparison.

A separate frozen native probe holds exactly one real emitted loading-module
request for a 1.5-second observation, then releases it unchanged. It verifies
the served HTML and returned module hashes, one trusted Battle click,
fullscreen cover, same-root roster enrichment, completed battle, and owned
request/browser cleanup. Both runs use native Apple M5 Max graphics and the
ordinary FIFO; neither replaces runtime modules or disables audio/graphics.

- Negative control: local immutable `43321e687`, HTML SHA256
  `9de7cb7ae46dd1dd09452f3c69229d779b0f94f5ab3dff7412c20251bd525856`,
  `solo-cold-cover-baseline-held-r1/`: fails precisely because the held import
  has no visible loader and no timely cover. The real battle still completes
  after release. This is a local build, not the differently hashed live HTML.
- Candidate: runtime `480bb4339`, HTML SHA256
  `35cf7368d42dc7ae8289486855a225e98b934e3f4516efc0745e20caf6780d11`,
  `solo-cold-cover-candidate-held-r1/`: passes, first cover at **5.0 ms**,
  empty pending rosters while held, then 7/7 rows in the same loader and normal
  battle reveal. Screenshots of the held state and completed battle inspected.

Both use acquisition SHA256
`7ca344327b8f475b50aa271d93b53ee44b1519d0b9adea8746ca55986f33554a`
and release the identical 7,746-byte module, SHA256
`c17918bb11efcc7f3e9c01cb023cdbf316ec4e186164726ac2811149b06c62da`.
Both have empty browser/cleanup error arrays and close their owned browser and
release the FIFO. The preserved negative receipt is an expected test failure,
not a retry erased from the record. The DOM/rAF/screenshot evidence establishes
visible UI under a held request, not physical display scanout or zero lag.

These are pre-publication receipts. The historical 214–319 ms gameplay stalls
and remaining native cold-start costs are not closed by this loading fix.

#### Published cold-entry cover — 2026-09-10 07:07 UTC

The complete narrow checkpoint was pushed without force as
`1104b991686ffdb8c016f360c3812ab83bb61933`; exact-head typecheck/public build
and the six focused checks above pass. Vercel deployment
`AMDseyJ6R2spU5eb6Sz6vRpgu7mk` and Localization CI report success. Production
serves `v1.0.0+g1104b9916`, with HTML SHA256
`a4043f3cfc3c582f6622a4eec44e8f169d739b138d043e4fab7b2515cd648cc1`
before, during and after the final acquisition.

`solo-cold-cover-production-actions-r1/` passes the unchanged frozen ordinary
Garage/Battle/Rematch/return/input/audio acquisition. First Battle cover is
observed after **2.1 ms**. Rematch/return cover observations are 147.6/89.2 ms;
all three transitions complete. Garage gestures construct zero audio contexts;
the first Battle constructs one native context (155.0 ms), retained thereafter.
Browser errors, failures, and cleanup errors are empty. Four final screenshots
were inspected with native high-quality rendering unchanged. All owned preview
servers and the native probe exited; no unrelated process was stopped.

Action callback maxima remain **159.4 / 112.8 / 46.3 ms**. This confirms immediate
cold-entry feedback and preserved transition/input behavior, not elimination of
native startup cost, an audible-output certificate, or a universal frame-budget
guarantee. The delayed-import negative/positive proof above was local; this
production run exercises ordinary downloads and real UI controls.
