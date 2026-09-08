# Multiplayer opening-draw attribution — 2026-09-08

## Production baseline

The private-room browser driver completed a real invite, Ready, launch, the
visible `5,4,3,2,1` countdown, movement/firing, Garage return and explicit room
closure on `https://cot.kevinliu.studio`. The document stayed at
`v1.0.0+gd1173a47d`, main bundle `main-D0PoBj7q.js`, before and after the run.
The document SHA-256 was
`8af83e258a08ef33f45f240c714368fdca015d8d975c6f74254a53e99c87809f`.
Both contexts rendered on the same Apple M5 Max/Metal machine. This is not
separate-device, distant-network or relay evidence.

The raw, untracked receipt is
`.qa-entry/production-panel-profile-r1/report.json` in the multiplayer invite
worktree. Entry used cached Winter, clear/day, high quality at scale 1. The
subsequent dual-render movement samples used normal adaptive quality (low at
scale 1); do not present their frame times as high-quality entry measurements.

| Measurement | Host | Guest |
| --- | ---: | ---: |
| Launch to first observed hidden loader | 1,897.5 ms | 1,948.0 ms |
| Remaining panel join | 0 ms | 0 ms |
| Opening compositor draw | 62.5 ms | 89.4 ms |
| Slowest final shadow cascade | 93 ms | 54 ms |
| Black-scene verification draw | 29.9 ms | 80.6 ms |
| Follow-on movement frame-gap p99 | 33.2 ms | 36.4 ms |
| Follow-on movement maximum gap | 46.1 ms | 42.6 ms |

No page errors or black-scene rescue occurred. Both rooms were closed, the
owned browser closed, and native-window/session cleanup completed. The guest
screenshot shows the world, vehicle, damage panel and HUD rendering normally;
it is not a pixel-parity comparison or an exhaustive visual acceptance gate.

## What the source profile does and does not prove

The guest V8 profile covered entry. Its exact served Three.js vendor stack
`getUniforms -> onFirstUse -> WebGLUniforms` carries 146.378 ms aggregate
inclusive sampled weight. These functions query active uniforms and their
locations. The explicit scene/scar preparation measured only 4.8/0 ms of
reflection. First-use reflection therefore remains a relevant cost category.

This does **not** locate that reflection in one particular draw. The retained
bins contain leaf/self weights, not inclusive call stacks; the profile start
uncertainty is approximately ±125.15 ms and its maximum sample interval is
249.351 ms. The `WebGLUniforms.upload` frame is uniform upload, not evidence of
texture upload. Normal frame rendering also contributes to this profile.
The watchdog's program count is unchanged across its draw (193 -> 193 guest,
234 -> 234 host); that excludes newly created programs there, not first use
of an existing cached program.

The historical 214–319 ms stalls are not causally explained by this capture.

## Exact-pass diagnostic

The covered opening compositor call now records bounded pass ordinals,
synchronous call durations and program counts. It still calls the native
`EffectComposer.render(0)` once, with all enabled passes and their actual
ping-pong routing intact. It neither disables neighboring passes nor changes
quality, resolution, shadows or simulation time. Temporary instrumentation and
target/cube/mip bindings are restored even when a draw throws.

This deliberately precedes any decision to split the draw: one slow SceneAA
pass cannot be made cooperative merely by yielding after it. The older
`warmFirstFrame` method disables neighboring passes and is not an equivalent
replacement for this transaction. Any future asynchronous draw must also keep
the exact staged effects alive until all passes finish, and preserve the final
black-scene/reveal/READY barriers.

The public diagnostic serializer retains at most sixteen numeric pass rows,
not material names, arbitrary labels, room IDs or player data. Legacy receipts
without these rows remain distinguishable from a measured empty chain.

## Native diagnostic checkpoint

The local production-build run at
`.qa-entry/opening-pass-timings-r1/report.json` passed the native private-room
flow on the same machine. It used the in-memory local signaling service, not
the production Cloudflare endpoint. The build was
`v1.0.0+gd1173a47d.dirty`, with index SHA-256
`158697a6d99f73aea20004ac2ffeca069ac387d21915a8604aab6d01007b60fc`.
The wrapper verified unchanged tracked runtime bytes and separately hashed
the new, then-untracked helper and selftest before and after capture.

Both entries used cached Winter, clear/day, high quality at scale 1. The
follow-on movement samples again used ordinary adaptive low quality at scale
1. Both clients showed `5,4,3,2,1`, then moved and fired; neither had a page
error, renderer crash, app exception or black-scene rescue. Garage return,
room closure and owned-browser cleanup passed.

| Measurement | Host | Guest |
| --- | ---: | ---: |
| Launch to first observed hidden loader | 1,679.4 ms | 1,779.4 ms |
| Opening compositor total | 56.0 ms | 99.6 ms |
| Slot 0: SceneAA call | 18.0 ms | 46.3 ms |
| Slot 3: LateFX call | 37.4 ms | 52.5 ms |
| Slowest final shadow cascade | 98 ms | 40 ms |
| Black-scene verification draw | 41.2 ms | 74.5 ms |
| Follow-on movement frame-gap p99 | 37.6 ms | 36.6 ms |
| Follow-on movement maximum gap | 42.6 ms | 43.7 ms |

The two SceneAA calls each added two cached programs. Neither LateFX call
added a program. Their synchronous durations include driver waiting and do
not isolate shader reflection, GPU execution or historical stalls. Slot 2
(GTAO) was disabled and correctly emitted no row; slots 1 and 4–7 were each
at most 0.2 ms in this run. No new scheduling or quality policy is shipped.

This is one local diagnostic run versus a separate production profiled run,
not a matched performance experiment. Do not claim the lower entry total as
a speedup or the remaining 99.6 ms opening draw as fixed. The checkpoint
narrows future investigation to the real SceneAA and LateFX call boundaries.

## Validation and release scope

- Focused selftests passed for the compositor helper, production observer,
  battle warmup, entry lifecycle, activation and network presentation.
- The suite registry passed with 788 ordered checks discoverable; this is a
  discovery check, not a claim that all 788 executed successfully.
- Typecheck/core-unused and the production build passed. The helper's strict
  complexity gate passed with no violations or explicit `any`/`unknown`.
- Changed-source React Doctor scored 91/100. Its sole warning is JSON
  serialization in the observer selftest: the test deliberately exercises the
  public JSON boundary and normalizes cross-context values. It is not a
  runtime/frame-loop clone; no rule was suppressed.
- Independent code review found no blocking issues. The native check above
  verifies functional entry and exit, not exhaustive rendering parity.

The previous full `npm test` run remains blocked in
`src/vehicles/sourceXFleet.selftest.mjs` by the existing T-90M geometry
fingerprint mismatch (`27bb658d` actual, `ffbd40d4` expected). No vehicle
source or receipt is changed by this checkpoint, and the full suite is not
reported as green. Raw QA artifacts remain untracked and outside the release.

## Rejected atlas-upload scheduling pilot

On 2026-09-08 a candidate explicitly uploaded the six final particle atlas
textures after CPU baking, with one paint opportunity after each native
`renderer.initTexture` call, before staging any live pooled effects. It kept
the exact texture identities, samplers, compositor chain and quality. Its
lease checks covered abort, entry invalidation and renderer/context renewal.

The candidate passed the particle, covered warmup, observer, entry-lifecycle
and network-presentation selftests, typecheck/core-unused and production build.
Independent review found no correctness blocker. Changed-source React Doctor
scored 84/100: two intentional sequential-await warnings (the upload loop and
its serial lifecycle test) and a JSON-boundary assertion in the observer test.
No rule was suppressed. Those checks establish correctness, not a speedup.

The native two-client run used the same local in-memory signaling, cached
Winter clear/day, high-quality scale-1 entry protocol as the preceding local
checkpoint. Both contexts used the same Apple M5 Max/Metal machine. The exact
build was `v1.0.0+g7a43597e9.dirty`, based on
`7a43597e9d2415b1b64b9d265367a2da626210d8`, with document SHA-256
`998418c1dd99819c494fe9604c8b8a480b02df71160bcf657bca5fa6cb4dad46`.
The wrapper verified unchanged source/build identity across the capture.

| Measurement | Previous host / guest | Candidate host / guest |
| --- | ---: | ---: |
| Launch to first hidden loader | 1,679.4 / 1,779.4 ms | 1,844.6 / 1,927.3 ms |
| Combat warm stage | 92 / 156 ms | 132 / 209 ms |
| Opening compositor total | 56.0 / 99.6 ms | 60.3 / 92.7 ms |
| SceneAA call | 18.0 / 46.3 ms | 18.6 / 44.0 ms |
| LateFX call | 37.4 / 52.5 ms | 41.3 / 48.0 ms |
| Explicit six-atlas upload calls, total | Not measured | 12.9 / 12.3 ms |
| Slowest explicit atlas upload call | Not measured | 5.5 / 5.1 ms |

Each candidate client recorded six uploads and six paint opportunities. These
are synchronous native-call durations, not GPU-completion measurements.
Both clients showed `5,4,3,2,1`, moved and fired, returned to Garage and closed
their rooms. Page errors were zero; neither client needed black-scene rescue.
The owned browser and server processes exited. The retained screenshots show
the tank, world and HUD; this is not a pixel-parity or exhaustive visual gate.
Follow-on adaptive-low scale-1 movement p99 gaps were 39.3/36.5 ms, with
54.9/41.8 ms maxima, not evidence of consistent frame budgets.

**Decision: do not ship this scheduling change.** The explicit uploads were
small, LateFX remained expensive, and combat warming acquired additional waits.
One before/after run cannot prove a regression or its cause, but it provides
no convincing performance benefit to justify adding the six waits. It also
does not explain the historical 214–319 ms stalls. The seven candidate source
and test files were restored to the current main bytes; this release adds only
this evidence note. Earlier loading/countdown/cleanup improvements stay intact.

The rejected implementation remains recoverable locally in
`.qa-entry/atlas-upload-timings-r1/candidate.patch` (SHA-256
`8dd43161a6c013e090edec2fa925f5430e46813391ec5e4168e971ddc6f726dd`).
Its complete native receipt is in the same directory as `report.json`
(SHA-256 `b49ea737f08ce46ec80ee8a5695a6e3af6eac3945f81ef2b8ee777ca74d7c62a`).
These local artifacts are deliberately not part of the public repository.
Post-withdrawal runtime and tool bytes match main; focused checks and the
789-entry registry discovery pass. The unrelated full-suite vehicle failure
described above remains unresolved and is not reported as passing.

## Native-operation attribution checkpoint

The next diagnostic checkpoint times existing renderer calls and a closed set
of existing GL queries within the same single covered compositor submission.
It adds no GL query, render, yield, quality change or readiness shortcut.
Wrappers are temporary, preserve native arguments/results/errors, and restore
own/inherited descriptors on success and failure. Receipts retain at most
sixteen pass rows, fixed numeric counters and seven program-type counts—not
shader logs, uniform names or material identifiers. Durations are inclusive
synchronous wall time with instrumentation overhead; nested counters must not
be summed or interpreted as GPU-completion time.

The native local two-client check used cached Winter clear/day, high-quality
scale-1 entry on one Apple M5 Max/Metal machine, with in-memory signaling.
Build `v1.0.0+g8f2805d05.dirty` had document SHA-256
`120c1e290f4d07b2cc227ce55cc8a435bbf9e6c6d8652e20da2ff9c6e865c6f8`
and runtime-diff SHA-256
`351cbc62d48d29ceedcd1468b8af3d2018627e869c93eda6a3e15a4a1746e572`.
The wrapper verified unchanged runtime/build identity across acquisition and
no untracked runtime source. This is not a production or distant-network test.

| Synchronous measurement | Host | Guest |
| --- | ---: | ---: |
| Opening compositor total | 75.1 ms | 88.2 ms |
| SceneAA pass | 18.5 ms | 27.9 ms |
| SceneAA ACTIVE_UNIFORMS queries, two calls | 5.1 ms | 14.4 ms |
| Newly created SceneAA programs | 2 depth | 2 depth |
| LateFX pass | 55.6 ms | 59.2 ms |
| LateFX texture-copy call | 42.7 ms | 45.3 ms |
| LateFX getParameter queries, five calls | 42.4 ms | 44.9 ms |
| Slowest LateFX getParameter call | 41.1 ms | 41.5 ms |

This identifies the measured LateFX pause at the state-query boundary and
confirms that the two new SceneAA programs are depth variants. Source inspection
of pinned Three 0.185.1 identifies five UNPACK-state reads before its depth-copy
branch; those values are irrelevant to the depth blit itself. It does not prove
which earlier queued GPU work the synchronous reads wait for, nor that moving
the queries will reduce total loading time. Exact native shadow-variant warmup
and avoiding unnecessary depth-copy state queries are now concrete follow-ups,
not changes included in this checkpoint. Raw custom-depth-material compilation
would not necessarily match Three's final native shadow variants.

Both peers showed `5,4,3,2,1`, entered battle, moved/fired, returned to Garage
and closed their rooms. Page errors were zero; black-scene rescue was unused.
The inspected screenshots contain the tank, world and HUD; no exhaustive
pixel/visual-parity claim is made. Launch-to-hidden-loader time was
1,849.7/1,915.5 ms. Follow-on adaptive-low scale-1 movement gaps were
40.5/38.4 ms p99 and 46.7/47.1 ms maximum. These are not a speedup result or a
solution to the historical 214–319 ms stalls. Owned browsers/servers exited.

The complete local receipt remains untracked at
`.qa-entry/opening-native-operations-r1/report.json`, SHA-256
`5643a5734b4172dbdb00476b82eb7aeaae40fc6a80203dbb174dccaacf8392ae`.
Focused compositor/observer/warmup/entry/network tests, typecheck/core-unused,
production build and strict changed-module complexity gates pass. Registry
discovery reports 789 checks, not 789 executed passes. Changed React Doctor is
91/100; its one chained-iteration warning is a small test-only assertion,
not runtime work. Independent review found no blocker. A direct rerun of
`sourceXFleet.selftest.mjs` reconfirmed the unrelated T-90M fingerprint failure
above; the full suite is not declared green here.

## Query-free resolved-depth copy

The measured state-query boundary now has a narrow replacement at the existing
LateFX depth handoff. `copyResolvedDepth` performs the same full-size
`DEPTH_BUFFER_BIT`/`NEAREST` blit as pinned Three 0.185.1 without the generic
CPU-upload path's five UNPACK-state reads. It does not change color copying,
the source depth sampler, hardware depth testing, compositor order, quality,
loading barriers, countdown, shadow priming or black-scene verification.

The fast path accepts only initialized, distinct, compatible ordinary 2D
targets with an already-resolved source and a current single-sample destination.
It reads fresh framebuffer/texture ownership and uploaded-version properties
on every invocation; no native handles are cached across resize, disposal or
context restoration. It binds through Three's state owner and independently
unbinds READ and DRAW, retaining the existing following `setRenderTarget` call.
Unsupported states or a Three revision change take the original native path
before any mutation. Errors after a blit is attempted are propagated after
both cleanup attempts; they are never retried through the fallback.

`node tools/resolved-depth-copy.browser.selftest.mjs` passed all twelve native
cases on Chrome 151.0.7922.47, Apple M5 Max/ANGLE Metal, Three r185. The cases
cover actual 0/4-sample source framebuffers, empty cleared depth, resize,
renderer state reset, disposal/reinitialization, and real WebGL context loss
and restoration. Native and candidate results are byte-identical; copying
depth preserves deliberately different destination color. Independent no-copy
and wrong-source-sampler negative controls fail pixel parity as intended.
Every candidate call records exactly one depth-only blit, zero native state
queries, and zero native fallbacks. The fixture source hash is
`e684ab3013d7a84462b05585eca53f5a58624827c524428cebc38224780b314a`.
This establishes tested rendering equivalence, not universal hardware coverage
or proof that earlier queued GPU work disappeared.

Two complete local private-room runs also passed on that hardware, using the
production build, in-memory signaling, two fresh browser contexts, 1280×800
DPR 1 and cached Winter. The frozen build was `v1.0.0+g5d998fbfc.dirty`, index
SHA-256 `2de600107f8476d73ae97bdd112f31d5bc5724a923b2ae26606d088580f7d6f1`,
runtime-diff SHA-256
`038fd2eb97ce71b5f8504d1305c56de6c12c276c693ad408e3576d7b86a034f2`.
Both captures verified unchanged source/build identity. Run 1 was clear/day;
run 2's actual room receipt was clear/night, so it is additional functional
coverage, **not a matched timing replication**. Entry remained high quality,
scale 1 in both. The room flow selected its ordinary environment; no timing
result is discarded or relabeled to hide the differing condition.

| Synchronous measurement, host / guest | Previous day checkpoint | Candidate day | Candidate night |
| --- | ---: | ---: | ---: |
| Opening compositor | 75.1 / 88.2 ms | 34.1 / 69.7 ms | 32.7 / 72.0 ms |
| LateFX pass | 55.6 / 59.2 ms | 13.9 / 44.0 ms | 13.2 / 36.1 ms |
| LateFX renderer draws, total | 12.9 / 13.8 ms | 13.8 / 43.7 ms | 13.1 / 35.9 ms |
| Final shadow priming, total | 160 / 79 ms | 150 / 107 ms | 106 / 113 ms |
| Black-scene verification draw | 43.0 / 93.5 ms | 25.4 / 71.5 ms | 28.4 / 46.5 ms |
| Black-scene readback, including waits | 119.7 / 119.6 ms | 133.3 / 92.7 ms | 128.2 / 106.5 ms |
| Launch to first hidden loader | 1,849.7 / 1,915.5 ms | 1,800.7 / 1,909.0 ms | 1,688.1 / 1,821.3 ms |

Neither candidate opening pass called the native texture-copy fallback or its
five `getParameter` queries. However, the guest's following renderer draw is
more expensive: removing a synchronization boundary did not remove all queued
GPU work. End-to-end loading is still variable, and the day guest's total is
essentially unchanged. Ship this narrowly verified removal of unnecessary
synchronous queries; do not describe it as eliminating 42–45 ms of GPU work,
a general loading-speed percentage, or a fix for historical 214–319 ms stalls.

Both runs displayed `5,4,3,2,1`, moved/fired, returned to Garage, closed both
room memberships and exited their owned browser/server processes. Page errors
were zero and black-scene rescue was unused. Inspected day screenshots show
the world, tank and HUD; whole-game pixel parity is not claimed. Follow-on day
movement p99 gaps were 40.3/35.7 ms, with 51.8/40.4 ms maxima; the host had
adapted to medium and the guest to low, both scale 1. Night p99 gaps were
37.0/37.5 ms with 49.6/48.1 ms maxima, both adaptive low scale 1. These differing
effective workloads do not establish a live frame-budget improvement.

Raw receipts remain untracked at `.qa-entry/depth-copy-query-free-r1/report.json`
(SHA-256 `37e105912f0dcdad2812f92daede9e33faf18dafe5a7ee19699525d5061d76a9`)
and `.qa-entry/depth-copy-query-free-r2/report.json`
(SHA-256 `913ac706333ef67379402730be61240eca42e933b4de9077040ebf17ec3c22b2`).
These are local tests, not production, remote-device, distant-network or relay
certification. Independent exact-file review found no blocker. Focused CPU
tests, typecheck/core-unused, public build and strict changed-module complexity
checks pass. The staged six-file React Doctor scan scored 92/100; its two
warnings concern property reads in the small CPU test's expected-call table,
not the frame loop. No rule is suppressed. Registry discovery has 791 checks;
the pre-existing full-suite T-90M geometry failure remains outside this release.

### Production verification of 9221988ff

The real production private-room flow passed at `https://cot.kevinliu.studio`
with two pristine contexts on the same Apple M5 Max and Chrome 151.0.7922.47.
Both acquisition boundaries reported `v1.0.0+g9221988ff`, script
`/assets/main-vWsZatNV.js`, and index SHA-256
`df978d413f4791cf3aa2a2698b76c2dce14e99612377714416c3cb0adc6e5835`.
This used deployed signaling/WebRTC, not the local in-memory server.

Both peers displayed `5,4,3,2,1`, moved/fired, returned to Garage and closed
their memberships. Page errors were zero; neither black-scene check needed a
rescue. The owned browser closed. Entry was clear/day Winter, high quality,
scale 1. Launch-to-hidden-loader was 1,891.7 ms host / 1,834.2 ms guest;
opening compositor time was 82.6 / 46.0 ms. Its SceneAA pass still created two
depth programs per peer. Final shadow priming took 98 / 139 ms in total
(79 / 97 ms maximum cascade); black-scene draw took 35.9 / 43.3 ms and
readback including waits took 113.5 / 81.3 ms. These results support targeting
redundant covered shadow work next, not declaring all loading stalls fixed.

Follow-on movement p99 gaps were 38.6 / 36.9 ms and maxima 56.0 / 48.5 ms.
The host had adapted to medium and the guest to low, both scale 1; this is not
a matched-quality performance comparison or separate-device certification.
The complete untracked receipt is
`.qa-entry/production-depth-copy-r1/report.json`, SHA-256
`c161e5c9f794b3689a9c4a69857312ceaa2254fac84b381d03bef95cf50db027`.

## Rejected cold-shadow deferral pilot

A narrowly scoped candidate suppressed only the two global native shadow-update
flags during the existing synchronous, fully covered opening compositor draw.
It kept shadow enablement, shader variants, light membership and the complete
final-camera shadow/black-check/reveal/READY sequence unchanged, restoring the
captured update flags in `finally`. Focused CPU tests covered every initial
flag pair, nested calls, exact thrown values and replacement renderer owners.
Independent source review found no lifecycle blocker; that was not native
rendering acceptance.

The native two-light fixture rejected the candidate on Apple M5 Max/Metal,
Chrome 151.0.7922.47 and pinned Three r185. The ordinary cold-renderer baseline
performed two covered and two final shadow draws, allocated both maps, and
passed its no-caster pixel control (534 changed pixels). The deferred case
performed zero covered shadow draws and two final draws, but retained a WebGL
error. Final map allocation and restored flags alone are therefore insufficient
correctness gates. The run stopped at that failure: no complete six-case matrix,
whole-game timing improvement or final-image parity is claimed.

The localized repeat measured `NO_ERROR` before the covered draw,
`INVALID_OPERATION` (1282) immediately after it, and `NO_ERROR` after final
render and readback. The baseline stayed error-free at every measured stage.
All owned browser/server/lock cleanup completed. The fixture/source hash was
`92ffdb8601c7cda2d4afb60bd8e2fad745d38b56963716d8940d762abfa3b2c4`.
The rejected helper/tests and copied native receipt remain recoverable locally
under `.qa-entry/rejected-covered-shadow-r1/`, outside the release; the receipt
SHA-256 is `d5629dcec281f52e398c0f0876dec0440b7cda23a1371e404b8f760001406738`.

Pinned-source inspection identifies an unsafe cold-map path: the
`sampler2DShadow[]` setter in `WebGLUniforms.js` uses `emptyShadowTexture`
without setting its comparison function, whereas the single-sampler setter
does set it. `DepthTexture` starts with `compareFunction = null`, and
`WebGLTextures.js` enables comparison mode only when a comparison function is
present. Skipping the initial map allocation can expose this fallback. This
explains why source-level flag restoration tests cannot certify the proposed
optimization; it is not an explanation of the historical 214–319 ms stalls.

**Decision: withdraw the runtime change.** Do not mask GL errors, disable
shadows, weaken the reveal barrier, or mutate the shared Three dependency to
force this pilot through. The shipping rendering path remains the validated
`9221988ff` implementation. A separate stale `lazyRuntime` selftest fixture is
corrected to invoke the real covered-compositor helper, checking offscreen
target restoration, exact errors, actual pass receipts and unavailable-clock
semantics. That regression-test repair does not alter the live runtime.

The final changed-source React Doctor scan covers one selftest and scores
49/100 with one `no-eval` error at its pre-existing `new Function` constructor.
Review confirmed a fixed local `src/main.ts` source slice, not network, user or
environment-supplied code; this is trusted repository test execution, not a
new production injection path. The scanner correctly detects dynamic code
execution, so this is not reported as a clean scan. No rule is suppressed.
Independent review found no blocker in the test's helper injection, synchronous
clock restoration or assertions. The initial 93/100 scan covered a different
candidate/file set and is not a comparable score baseline.

Post-withdrawal focused checks passed for `lazyRuntime`, `coveredComposerWarm`,
`networkBattlePresentationRuntime`, `shadowPrime`, `battleWarmRuntime`,
`battleEntryLifecycle` and `battleEntryAcquisition`. Registry discovery passes
with 791 ordered checks after archived experiments are excluded from executable
selftest filenames. The final release changes only this document and the
`lazyRuntime` regression fixture; candidate typecheck/build jobs were canceled
before execution after native rejection. No new runtime build or full-suite
pass is claimed. The existing full-suite T-90M fingerprint failure remains
outside this change.

## Canonical lobby preparation and verified reveal recovery

The next review found a distinct source-backed loading regression. A Not Ready
guest can close the room overlay and browse Garage maps without changing the
host's canonical map. The Garage callback previously cancelled background
worlds according to that local selection. A permanent map-ID latch in
`networkLobbyPreloader` then prevented later unchanged room packets from
requesting the cancelled map again. The same latch also stranded failed,
capacity-rejected, or subsequently evicted preparation. This is not evidence
for the exact cause of the historical 214–319 ms live-frame stalls.

Waiting-room intent now reasserts the canonical map through the existing world
coordinator, which owns cache/in-flight deduplication and capacity admission.
The room coordinator exposes the same intent boundary to Garage map browsing
and Solo-button hovering. Both pending and retained rooms take precedence over
local Solo preparation, including while Not Ready; only accepted host room
state changes the prepared map. Random is a handled intent with no fixed map.
No scene budget, build pacing, renderer quality, transport, or authority policy
changes. A cancelled job that is still draining remains owned until settlement;
a later waiting packet can retry, and foreground acquisition retains its
existing drain-before-replacement behavior.

Null lobby callbacks are deliberately not treated as a blanket cancellation:
the same notification is used by successful lobby-to-match handoff. Leaving
clears room ownership, so subsequent independent Garage/Solo activity resumes
its ordinary policy without a stale preparation latch.

The integrated regression uses the real room coordinator, lobby preloader and
world-build coordinator with deferred map construction. Before the fix, its
unchanged-packet retry test failed (`1 !== 2` builds). Afterward all 13 cases
pass, including exact original in-flight Promise/world identity, duplicate
packets, accepted map changes, Random, capacity/eviction/cancellation retry,
leave/rejoin, retained-state priority and null handoff. Actual `main.ts`
callbacks also have source-contract checks; no dynamic source evaluation is
introduced. Independent review found no new authority or hot-loop regression.

A second review closed an unexpected graphics-watchdog rejection escape hatch.
The watchdog already owns drained asynchronous readback and fresh synchronous
compatibility fallback. An unexpected throw/rejection is now a failed graphics
receipt, not permission to reveal. The existing awaited resource lifetime,
timing closure and cancellation-precedence checkpoint remain intact. No
reveal, fade, READY, countdown consumption or successful loading-state reset
is permitted on that path. The launch owner continues its covered Garage
recovery. Updated synchronous/four-outcome asynchronous regressions were red
before the runtime change; presentation, launch/recovery and all 33 async
black-watchdog cases pass afterward.

The temporary-workspace reset removed earlier untracked raw QA archives named
above. Their historical summaries/hashes remain documentation, not newly
available raw evidence. This recovery uses a persistent isolated worktree and
fresh immutable baseline/candidate evidence, without touching the shared dirty
checkout or unrelated vehicle work.

Release CPU validation passes every registered `src/net` check plus the
world-build/covered-compositor/async-watchdog owners (60 files total),
typecheck/core-unused, the public build, import integrity and 793-entry test
discovery. Strict complexity checks pass on all three changed network owners.
The broad `npm test` attempt was intentionally interrupted in the unrelated
wheel-quality sweep; that interrupted line is not a wheel regression. A
separate direct run of `sourceXFleet.selftest.mjs` reconfirmed the pre-existing
T-90M fingerprint failure (`27bb658d` actual versus `ffbd40d4` expected). No
full-suite pass or vehicle receipt fix is claimed for this multiplayer slice.

### Fresh native before-Ready regression evidence

The committed `tools/lobby-prefetch-before-ready.browser.selftest.mjs` runs
CPU-only guards by default. Explicit acquisition uses an immutable public
build, two pristine native browser contexts, trusted UI clicks and read-only
observation. It rejects a missed race, software rendering, incomplete evidence
or an existing output directory. FIFO capture admission has a separate bounded
deadline so another lane's GPU work cannot consume the scenario clock. Resource
acquisitions retain ownership inside the producer and drain before cleanup;
CPU tests include late lock, preview and browser settlement after a deadline.

The initial acquisition timed out while queued, before creating a browser or
room, and is retained as an acquisition failure rather than runtime evidence.
The subsequent baseline and candidate used the same acquisition SHA-256:
`1647148d6ed83217e01d6925b729a324d33c480abeaae6d6d97c769af7cf5b7b`.
Both ran Chrome 151.0.7922.47 on Apple M5 Max ANGLE/Metal, 1280×800 at DPR 1,
with loopback signaling and real WebRTC between two clients on one machine.
No rendering, readiness, clock, quality or endpoint substitution was applied.

| Evidence | Immutable baseline | Fixed candidate |
|---|---|---|
| Build index SHA-256 | `45a7579b693db580b9e3eea9141d4999b5146f64e9a7168913f311b0665be013` | `18d5ffe6e79b40c3acc651c1ca6d4f80044cf9d343457da75048ff4d5250e421` |
| Report SHA-256 | `a14a0036b322f32af4e0aaae62c9e869e72c964b6fa1abf7c95de8c85fe72cdf` | `e8a76aea34848381096113992167f653225c82ac15eac2021d19594a80bf7e99` |
| Trusted guest Desert click | Canonical Winter actively building; both Not Ready | Same captured precondition |
| Guest Winter preparation | Cancelled once; never completed before the 15-second deadline | Original request completed before Ready; zero cancellations or promotions |
| Result | Regression reproduced | Pass: both clients consume cached Winter and enter battle |

Candidate countdown observation captured 5, 4, 3, 2, 1 on both clients, then
ROLL OUT after 5000.1 ms on the host and 4911 ms on the guest from the first
observed 5. Snapshots advanced by 49 on each client and inputs by 90/81.
Native host/guest screenshots were inspected: Winter terrain, tanks, HUD and
ROLL OUT are visible, with no black canvas or context corruption. Screenshot
SHA-256 values are
`70840c0c5693d40fe8f088268cfd2499b4bc71291bade4f2adad5b1b42cb2093`
and `e36b284e0952051451276414dd1a22c22c08268c7bf8151fa25ca4c047db26b9`.
Both owned room memberships closed; browser, preview and capture lease cleanup
completed, and immutable build identity remained unchanged. The separate owned
loopback signaling process was stopped after acquisition.

Raw reports and PNGs remain local under
`.qa-lobby-before-ready-baseline-r2-20260908/` and
`.qa-lobby-before-ready-candidate-r1-20260908/`; build output and QA artifacts
are not committed. These are loading/reveal regressions, not production,
remote-device, firing, movement-smoothness or sustained frame-budget
certification. They do not establish the cause of the historical stalls.

Changed-source React Doctor scans reported no issues for the five-file
preparation set (91/100) and the later eight-file runtime/test set (89/100).
The populations differ, so their scores are not a comparable regression
baseline; no rule was suppressed and no score improvement is claimed.
The final staged ten-file source/test scan, including the browser regression,
also reports 89/100 with no issues. Independent final review found no concrete
shipping blocker. All owned QA processes were stopped; foreign browser work
was left untouched.

### Retained-room replacement-map dependency

The requirement-by-requirement follow-up found a separate rematch ordering
defect. First-entry hosts already declare `connectAfterWorld`; retained hosts
did not, even though `prepareRound` reads the currently installed world's
collision. Changing maps between rounds could therefore prepare new-map
authority against the preceding map. Retaining a transport does not make the
authority's world dependency disappear.

The regression composes the real launch owner and real battle-entry acquisition
with a deferred Verdant-to-Winter replacement. Before the fix, the host admitted
`connect` while only `world-start` was expected. The rematch host now declares
the same dependency as initial host entry. Tests prove exact new collision
identity reaches `prepareRound` only after the replacement settles, while
guests continue connecting concurrently and never prepare authority. Rejected
replacement worlds perform no stale collision read or authority preparation;
they close the retained transport and restore/paint Garage under the opaque
cover before fading it. Focused launcher, acquisition, presentation, activation
and barrier checks pass, as does typecheck/core-unused. The changed runtime
has 31 functions, zero strict complexity violations and no explicit any/unknown.

The changed-pair React Doctor scan scores 49/100 and reports existing test-only
array traversal/indexing warnings and the existing `new Function` execution of
a fixed repository `main.ts` callback slice. Source review confirmed those
pre-existing test paths; no runtime evaluation or untrusted input was added,
and no scanner rule was suppressed. This is not a clean scan or a comparable
score to the previous ten-file release population.

### Live immediate-start check of `6dbc1de07`

The canonical site and main asset stayed at `v1.0.0+g6dbc1de07` and
`/assets/main-lZPx77og.js` before and after a fresh two-context production run.
The HTML SHA-256 was
`e0fd5e32b2f541f7e8ea07977f297a2214fb346c130ea42903de0ab8148a9bad`.
The committed production UI driver used real Private 1v1 controls, the built
Cloudflare endpoint, native invite, Ready and immediate Start. Browser caches
were disabled; this does not establish cold OS/driver caches. The run used
high graphics, scale 1, clear/night Winter. It did not force authority weather.

| Live measurement | Host | Guest |
|---|---:|---:|
| Start to first observed hidden loader | 5,406.6 ms | 5,307.4 ms |
| World acquisition | 3,251 ms | 2,576 ms |
| Match connection | 7 ms | 76 ms |
| Total entry including ready barrier | 5,430 ms | 5,510 ms |
| Largest entry long task | 208 ms | 190 ms |
| Maximum entry callback gap | 210.1 ms | 251.3 ms |

Both foreground observations contained `5,4,3,2,1`; first-observed 5 to
ROLL OUT was 4,930.9/4,921.6 ms, not a new three-second countdown. Each
graphics receipt was nonblack (23.3845/29.0554 initial luminance), with no
rescue or error, and reveal was primed before loading disappeared. No
observation drops, page exceptions, renderer crashes or browser disconnects
were recorded. Host native exit closed the room and returned the guest to
Garage; both memberships, the browser and capture lease were cleaned up.

The guest's reveal was not slower in this run. Construction and covered GPU
preparation, not the 7/76 ms connection step, remain the larger entry costs.
Cold props-generator slices reached 185.4/170.8 ms, so this is not a smooth-
animation completion claim. Existing stage intervals and slice ordinals
provide the next attribution targets; the old historical stalls remain a
separate, unproven cause. This run also predates the retained-host rematch
dependency fix described above and cannot certify that fix's native path.

Raw report: `.qa-entry-production-6dbc-immediate-20260908/report.json`, SHA-256
`50c67a974208a66b5adc46cae98295b2a12417a6452c4c55a283ed27fb99c67d`.
This timing-only driver records launch policy but does not retain an unmasked
GPU identity or final PNG, so no hardware-renderer or image-parity claim is
made from this report alone.
