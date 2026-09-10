# Hidden shader readiness during the visible countdown

## Observed defect

The real-button production control run on `57fe26ac9` recorded an uncovered
183.9 ms rematch callback-start gap at countdown 1. A Long Animation Frame
contained a 169.2 ms scheduler continuation. Rounded stage reconstruction places
it inside hidden-variant warmup; the three recorded hidden draws were 8/5/5 ms.
This narrows the stage, not the exact native operation. It does not establish the
cause of the separate historical 214–319 ms gameplay stalls.

Source inspection found a concrete bypass: hidden-object compilation immediately
called `getUniforms()` on newly created programs, before checking parallel shader
link completion. The subsequent six-millisecond checkpoint cannot interrupt an
already-running native reflection call. A behavioral negative test reproduced
reflection before any ready witness.

## Correction and lifetime contract

Cooperative rare warmup now uses the existing finite-cohort program-readiness
helper. It captures exact newly submitted program wrappers/native handles while
the object is staged, restores visibility, then yields before native readiness
queries or reflection. Readiness checkpoints explicitly force the caller's
yielder. In the visible deferred owner that yielder uses `nextPaintFrame`;
generic callers still define their own checkpoint policy.

The coordinator carries one execution mode per generator. A synchronous drain
can take over the existing job without restarting destruction effects or spinning
an asynchronous polling loop. It closes the suspended helper and reflects only
its captured still-live program pairs. Cancellation, renderer/context replacement
and rejected waits must not retain the cohort or clear a successor job. Scope
render failures must restore the camera as well as object visibility.

The helper is bounded and best-effort, not a promise that every program is ready.
Its existing 120-round/five-second policy and unsupported-extension behavior are
unchanged. A pending or failed query can leave work for an actual draw. A single
native query/compile/reflection can still exceed the cooperative budget. Added
aggregate compile/query/reflection measurements are attribution aids, not GPU
execution or physical-display latency measurements. In particular, the shared
`uniformPending` field describes the most recently processed cohort, not a
global completion proof.

## Qualification

The frozen six-file runtime/test diff against `57fe26ac9` has SHA-256
`b87b2068c8d940d2054b52cc424b06d71089106bbe35f92b8341eb1dfe69fc90`.
Independent source review found no blocker. All three changed runtime files
remain below the existing complexity limits, with zero violations or explicit
`any`/`unknown`; the limits were not changed. Lifecycle regressions cover pending
link queries, current-context checks, removed/replaced/later program handles,
unsupported extension, failed query, cancellation, fresh/in-flight drain, stale
rejection and camera restoration. The before-fix negative test failed on one
cold reflection before a ready witness.

All seven exact-source focused checks passed: battle warm runtime, coordinator,
composition, deferred warm owner, program warm owner, frame scheduler and lazy
FX runtime. Typecheck (including unused-code enforcement) and public build passed.
The first typecheck correctly rejected a missing `pending` field on the new
invalidation error; the corrected error reports `pending: null`, and its test
asserts that contract. Both failed and corrected build logs are retained.

React Doctor scanned all six changed runtime/test files and reported 90/100,
seven warnings, versus the preceding different ten-file terrain/source scope's
92/100. This is not an unchanged-score claim. Four serial awaits belong to
lifecycle tests; the coordinator's serial wait is the checkpoint contract and
must not become concurrent. The two array warnings concern finite-cohort capture
and live membership checks in synchronous takeover, not an established per-frame
hot path. Their canonical recipes require measured impact before rewriting;
no profile attributes the pause to those iterations. They remain observations
needing evidence, not suppressed warnings or confirmed performance regressions.

## Native actual-control run

`hidden-readiness-local-r1/report.json` in
`/private/tmp/cot-interactive-baseline.gsRCvU/` passed all four boot, audio-clock,
warm-readiness and source-readiness gates, with no failures, browser errors or
cleanup errors. Both warm owners finished before rollout. All three resulting
Battle/Rematch/Garage screenshots were inspected; the owned browser closed.
This used the production-format local build, native ANGLE Metal Apple M5 Max,
1280×720/DPR1, high quality and normal transitions, without profiling.

Report SHA-256:
`8212aa5fe6dfa0b1be1e95c94e31415474f77cc8f7dcd92e1a65abc2a38a2d7e`.
Built HTML SHA-256:
`45fb3691c4562e6b69772b41d6d878fa8b3faa9e80895056cc2fe7b15ec4cd28`.

| Action | Cover | Click to probe-ready | Largest callback-start gap |
| --- | ---: | ---: | ---: |
| Battle | 3.7 ms | 7,704.8 ms | 109.3 ms |
| Rematch | 134.3 ms | 5,842.3 ms | 81.4 ms |
| Garage | 87.1 ms | 362.8 ms | 59.3 ms |

The hidden windows were 9838.7–10211.8 ms and 15289.9–15611.6 ms on the page
clock. Neither overlapped a recorded callback gap above 50 ms. Maximum individual
compile time was 1.2 ms in both; one reflected program took 6.5 ms in the first
Battle and 9.7 ms in Rematch. Readiness query maxima were 0 ms at this clock's
resolution, with four/three polls. Actual hidden draws remained 5/5/4 ms and
4/2/2 ms. This supports the specific mechanism, not universal native readiness.

**Other pauses remain.** Earlier uncovered Battle gaps were 91.5 and 58 ms;
Rematch had 55.7 ms before the hidden stage. Cold Battle props were 2367 ms wall
time with 1729.6 ms timed slices. Local/production source waits and fixture
rosters must not be treated as a matched throughput benchmark. This local run
predates the separate props-wait diagnostics integration. No production result
for the new combined build is claimed yet. See
[the loading/resource release receipt](loading-resource-release-20260910.md)
for the retained failed/refused sustained-frame and resource gates.
