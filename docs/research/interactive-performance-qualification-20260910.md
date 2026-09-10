# Interactive performance: integrated qualification, September 10

## Decision and scope

This packet qualifies three bounded changes, not a claim of zero latency:
frame-separated deployment-program preparation, a persistent cold-building
texture-composition worker, and separate retained light state for late effects.
No graphics tier, resolution, roster, warm-readiness deadline, or performance
threshold was weakened. No audio runtime workaround or C/Go/Zig/Rust rewrite
is included. Native cold audio construction and complete performance-budget
clearance remain open.

Frozen integrated code: `0ca81d5c15c6a9f6a18b7ee15d18885231245c2c`, based on
fleet release `e4ca00b6c35ab4b1f6b5b1872765254336a05e44`. Public HTML SHA256:
`9222174966244462ec136475112af8128026a1ae240ff1220066e824a7b38e07`.
Evidence directory: `/private/tmp/cot-interactive-baseline.gsRCvU/`.
Browser: Chrome 151.0.7922.47, native ANGLE Metal Apple M5 Max. Integrated
controls use 1280×720, DPR1, high quality, scale1 and trim0. These are local
native-browser measurements, not yet production or separate-device acceptance.

## Actual controls and presentation

`integrated-performance-actions-r1/report.json` passes functional behavior,
audio clock/gesture ownership, required warm readiness, and sourced-art
readiness. Both first Battle and Rematch have the exact requested six source
layers applied before their first uncovered frame, with no errors. The gate
binds the original world, state and reveal ordinal; later completion cannot
rewrite a failed reveal. All fourteen tank identities and teams match the
retained live upload-batching comparison. Intervening fleet and renderer work
means this is not an isolated one-patch speed comparison.

| Control | Click → cover ms | Click → activation ms | Maximum callback gap ms |
| --- | ---: | ---: | ---: |
| Battle | 2.7 | 6616.0 | 180.8 |
| Rematch | 140.7 | 5648.8 | 84.1 |
| Garage return | 89.9 | 340.9 | 45.1 |

The first worst gap contains native AudioContext construction of 154.6 ms.
First-entry long tasks are 67/161/57/54 ms; only the constructor overlap has
that direct attribution. Rematch retains a 60 ms long task. Return has none
at or above 50 ms. Day battle, night rematch and Garage screenshots were
visually inspected: world, tank, HUD and return screen render normally. Tool
error, failure and cleanup arrays are empty; owned browser/server are closed.
Acquisition SHA256:
`e2999b989dad467629d07eede3a8daf51c7e65d31bb7e2fb553d5c8546a1496f`.

`late-fx-scene-view-native-r1/report.json` passes all twelve MSAA0/4,
AO-handoff and moving-frame cases with zero differing pixels. All four
negative controls detect missing effects/depth or stale geometry/camera.
The fixture proves ownership and pixels, not frame rate. It adds no render
call or GPU resource. See [light-state mechanism](late-fx-light-state-20260910.md).

## Persistent source composition: fidelity passes, timing is mixed

`sourced-image-persistent-native-r1/report.json` passes 18 fresh contexts,
52 exact RGBA comparisons and all ownership checks. Nine workers handle
18 requests; all 46 transferred bitmaps are detached/closed. No worker
composition performs a main-thread readback. Contexts, workers, browser,
server and capture ownership are closed, with no retries or errors.
Report SHA256:
`c3c0b1087869320acbfb0d9e4981c9d3bcacfb59e4042bbc74539d4bc86ec176`.

Only cold async building plaster, wood and brick families use the production
worker path. Terrain, synchronous authoring and cache hits keep their existing
paths. One serial worker, bounded queue, transferred input ownership,
strict protocol validation, cancellation, timeout and idle disposal are tested.
Overflow or unsupported environments retain the existing fallback; this does
not claim every possible main-thread readback has disappeared.

Across nine native cases, first-composition completion is 4.6–11.3 ms slower,
while the maximum callback gap improves by 11.3–24.6 ms. For the three shipped
building families, first completion is 4.9–7.6 ms slower and callback gaps
improve by 17–24.6 ms. The integrated reveal gate above still passes. Forced
delayed recomposition is slower overall and worsens callback gaps in eight
of nine cases; it is not a cache-hit improvement. The complete paired tables
remain in the report. Acceptance is exact fidelity, lifecycle correctness and
less blocking first-use work, not a blanket end-to-end speedup.

## Sustained gameplay: strict certificate still fails

Both `integrated-gameplay-profile-r1.json` and
`integrated-gameplay-unprofiled-r1.json` use the same pinned fourteen-tank
roster for sixty seconds after control release, with W/A/D movement, firing,
and all 29 trusted camera pulses observed. Quality and scale remain unchanged.

| Measure | Profiled diagnostic | Unprofiled acceptance | Existing limit |
| --- | ---: | ---: | ---: |
| Median FPS | 59.9 | 59.9 | ≥60 |
| p99 submission interval ms | 25.7 | 24.9 | ≤25 |
| Median / peak draw calls | 756 / 838 | 772 / 923 | peak ≤900 |
| Raw heap growth MB/s | diagnostic | 1.34 | ≤1 |

The profiled diagnostic has zero long tasks ≥50 ms and a maximum callback
duration of 41.1 ms; CPU-profiler overhead independently refuses speed
certification. The unprofiled report does not enable that long-task observer,
so it must not inherit the diagnostic's zero-long-task claim. Unprofiled p99
passes, but median FPS, peak draws and heap-growth checks fail. All failure
statuses and nonzero process exits are preserved; no repeat-until-green run
or budget relaxation was used.

Unprofiled heap starts at 269 MB, ends at 348.2 MB and drops to 266 MB in the
post-window forced collection. There was no forced pre-window collection:
this does not prove a leak, nor provide a valid retained-growth comparison.
Raw/floor growth still fails the existing gate. Submission intervals are
renderer-call cadence, not display presentation acknowledgement or GPU time.

A read-only certification review distinguishes measurement limits from code
defects. The sampler's reciprocal of a 16.7 ms median rounds to 59.9 FPS;
3,598 positive submission intervals in 60.0001 seconds are consistent with
the 60-FPS cap and timestamp precision. That does not change its failed
threshold. The 923-draw peak is a genuine counted overrun of 23 draws (2.6%);
all observed frames keep the intended four-cascade refresh mask. The report
lacks object/pass attribution for that peak, so it cannot justify a particular
batching or culling patch. Peak draw submission work is the next concrete
optimization target, without hiding content or reducing shadow cadence.

The exact cause of historical untraced 214–319 ms stalls remains unproven.
Current cold constructor attribution must not be projected onto those old
samples. Browser/OS scheduling and background-host constraints also remain.

## Code gates

The seventeen-file focused integration batch passes. Exact integrated
typecheck, core-unused and public build pass, retaining 181 public playables
and zero GLB-backed playables. Strict metrics on ten changed runtime modules
cover 280 functions with zero complexity violations and zero any/unknown.
Docs Doctor has four passes, zero failures/warnings.

Changed-code React Doctor 0.9.13 reports zero errors and fifteen warnings
across 44 files. Thirteen serial-await findings cover intentional readiness
frame boundaries or ordered test lifecycles. One small protocol-field lookup
is bounded cold validation, not an unbounded render loop. The manual-rAF
warning belongs to a browser measurement fixture, whose purpose is observing
callback edges rather than owning the Three animation loop. None was hidden
by suppression, and score/supply-chain scans were disabled without a score
claim.

Full `COT_SELFTEST_WORKERS=4 npm test` passes with exit0: 299 preliminary,
607 core and 38 post checks, 944 files total. Runtime, tooling and HEAD remained
frozen at `0ca81d5c15c6a9f6a18b7ee15d18885231245c2c`; only these three
research-note updates were prepared while the run completed. Full log:
`integrated-full-tests-r1.log`, 974,959 bytes, SHA256
`2af78e81f586b8c8975e92e04372b50b501232cf625c88fc807ed07834cccdea`.
No failed performance acquisition was relabeled by this regression result.
