# Covered deployment pacing — 2026-09-10

Follow-up to [frame/matrix measurement](frame-matrix-reuse-20260910.md).
Evidence root: `/private/tmp/cot-interactive-baseline.gsRCvU`.

## Attribution before the change

The maintained production action profiler completed Battle, Battle Again and
Return to Garage with no application, contract or cleanup errors. Its directory
is `terrain-preparation-production-profile-r1/`; HTML SHA256 is
`cd8c9269fb102778d882082c56beb5636a970c7026b20c744c9bced79d900cbc`.
This is statistical CPU attribution, not a speed certificate.

The largest Battle callback gap was 180.7 ms, from page time 6419.5 to 6600.2.
The passive constructor observer recorded native `AudioContext` construction
at 6449.8–6595.5 (145.7 ms), entirely inside that gap and its 150 ms long task.
The CPU profile independently contains 146.275 ms of native constructor self
sample weight. Intersecting start/stop clock brackets gives a profile-start
page-time range of 5050.400–5083.718 ms; 118.133 ms of whole-sample weight is
guaranteed inside the gap despite that uncertainty. This identifies the browser
constructor, not its internal device/driver implementation. No context options,
audio fidelity, gesture rules or loading-clock behavior were changed.

Do **not** transfer this attribution to the earlier unprofiled 185.0 ms gap in
`matrix-cadence-production-actions-r1/`. That gap was at 4979.2–5164.2, while
its constructor was at 4405.4–4558.4 on the same `performance.now()` clock.
Its terrain label and 149.9 ms long-task overlap do not identify a function.
The initial terrain investigation found atomic texture/noise/mask producers,
but no terrain rewrite was made on the strength of a label alone.

The profiled rematch had a distinct 121 ms gap at 17831.5–17952.5 during allied
vehicle preparation. Its profile-start range is 15679.400–15700.559 ms.
Within the guaranteed interior, 84.587 ms of samples descend through the
actual visual streamer/roster construction, including 83.072 ms through the
tank factory. Several private builds ran between animation opportunities.

## Scoped correction and invariants

`soloBattleDeploymentRuntime` previously selected an 18 ms cooperative task
budget and an 80 ms animation-request interval. It now uses **12/32 ms**,
matching foreground world preparation. Existing private factory checkpoints,
generation guards, full roster, camouflage, texture uploads, program warming,
day/night setup and reveal barrier are unchanged. A task yield is not a paint;
the shorter interval explicitly requests an animation callback more often.
It cannot preempt one synchronous checkpoint or certify a physical paint.

The focused regression composes the real visual streamer and scheduler with
injected time: six allied builds, ten private 4 ms checkpoints each, an already
staged player and seven deferred enemies. It requires task release at 12 ms,
frame requests at 32 ms intervals, unchanged spec/quality inputs, exact actor
publication and all 14 roster identities. Cancellation before a checkpoint or
inside task/frame waits closes the private iterator without publishing stale
visuals or entering downstream warm/reveal. The former 18/80 policy cannot
satisfy these cadence expectations.

Focused deployment, streamer and scheduler tests passed, as did typecheck,
core-unused, public build and whitespace checks. Broad read-only Doctor remained
42/100 (97 errors/697 warnings already present). Changed-scope Doctor was
92/100 with one existing sequential-test-await warning, not a runtime warning.
Logs: `rematch-pacing-{doctor-before,checks}-r1.log`.

Before landing, the owner branch incorporated upstream `4aa008627` without
conflicts. The same three focused tests, typecheck/core-unused and public build
passed again on that integrated tree (`rematch-pacing-rebased-checks-r1.log`).
The native candidate receipts below predate those unrelated upstream terrain
and three-tank changes; they are not mislabeled as an integrated-tree capture.

## Unprofiled native candidate check

`rematch-pacing-candidate-actions-r1/` used native Apple M5 Max ANGLE,
1280×720, DPR/scale 1, high graphics, trim 0 and SMAA-high/FSR1. Build HTML
SHA256: `6849653d5dc969748ec1f0fa3d2448b0023cea286c8722e72f38f88c4f0cbadb`.
All actual controls, passive audio-clock/intent gates and cleanup passed.
Battle/rematch and returned-Garage screenshots were inspected.

| Action | Click → opaque cover | Click → ready | Largest callback-start gap |
| --- | ---: | ---: | ---: |
| Battle | 2.6 ms | 6520.8 ms | 156.7 ms |
| Battle Again | 140.0 ms | 5639.9 ms | 69.5 ms |
| Return to Garage | 87.7 ms | 438.1 ms | 77.1 ms |

Rematch gaps whose endpoints both said `Preparing allied vehicles` peaked at
65.2 ms, versus 109.8 ms in the earlier unprofiled production receipt. The new
largest rematch gap moved to `Priming deployment view`; no rematch long tasks
were observed. This local-versus-production observation is not a repeated,
matched-acquisition speedup certificate. Cold entry still paused; Garage return
was worse than the earlier sample. Do not present the patch as fixing those.

## Fresh gameplay diagnostic and remaining limits

The once-retried maintained 60-second early-control-release/native-cadence
profile completed successfully, unlike the previously inconclusive acquisition
timeout. Report: `rematch-pacing-gameplay-profile-r1.json`; raw profile SHA256:
`25a653af072e37d34c678ada280521f3b783fc5cc745a074b55bd26405924ebd`.
It used the same candidate build, Verdant, full eligible 7:7 roster, high
graphics, scale 1/trim 0, and 29/29 observed trusted camera inputs. Admission
passed; no foreign headless/GPU contention or application errors were recorded.
All profile cleanup completed. No 50 ms long tasks occurred during gameplay;
the largest callback-start interval was 35.3 ms. Submission p95/p99 were
18.2/25.0 ms. These are diagnostic observations under profiling overhead.

The unchanged budget correctly **failed**: median 59.9 FPS is below 60 and
maximum 944 draw calls exceeds 900. The harness exited 1 and explicitly refused
speed certification. This neither certifies repeatable smoothness nor explains
the historical untraced 214–319 ms stalls. Their exact cause, cold native audio
startup, remaining terrain/loading/return pauses, heavy-scene tails and physical
multi-device/network validation remain open. Browser/OS suspension limits are
unchanged. Language and transport evaluations are already documented separately;
this patch does not claim a C/Go/Zig/Rust rewrite or new transport deployment.
