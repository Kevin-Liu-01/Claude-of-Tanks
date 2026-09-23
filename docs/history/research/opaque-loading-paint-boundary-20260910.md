# Opaque loading: leave the pre-paint continuation

The only runtime policy change is the default frame port of
`createOpaqueLoadingYielder`: `nextFrame` becomes the existing `nextPaintFrame`.
Budgets, periodic-frame intervals, task-only checkpoints, explicit overrides,
direct `nextFrame` callers and visible/simulation clocks are unchanged.

## Source rationale and limits

`nextFrame` resolves inside rAF, so awaited loading work can continue in that
frame's microtask checkpoint. MDN describes microtasks draining before subsequent
tasks and rendering work in its [microtask guide](https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide/In_depth).
The existing `nextPaintFrame` additionally awaits a task, using
[`scheduler.yield()`](https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield)
when available and a timer otherwise. This leaves the pre-paint continuation;
it offers a rendering opportunity, not proof of GPU completion or display.

Production Long Animation Frame diagnostics motivated this review. A script
entry attributed to the rAF resolver does not identify the expensive leaf work
inside its asynchronous continuation, prove every historical stall's cause, or
establish the benefit of this default change. Atomic construction/native calls
and explicit direct `nextFrame` waits can still stall a frame. No native
comparison or frame-time improvement is claimed at this checkpoint.

The periodic default now updates its slice and frame-interval baselines after
the following task completes. `paintEveryMs = Infinity` stays task-only.
Default consumers include covered foreground world construction, solo loading
and deployment, initial Garage vehicle preparation and Studio effects. Existing
Garage-entry and shader-readiness paths already using `nextPaintFrame` keep their
behavior. Dedicated shader-readiness frame waits must not be replaced with
task-only polling; see the retained [failed upload experiment](deployment-upload-program-readiness-20260910.md).

The adopted helper requires rAF while visible and rejects on its existing
configured 1,000 ms missing-frame deadline. Hidden/no-document/no-rAF hosts keep
the 34 ms fallback followed by a task; browser timer throttling still applies.
Visibility changes and settlement release the timer, frame and listener owners.
There is no new AbortSignal API. Existing caller cancellation checks and failure
recovery remain responsible for interrupted construction.

## Focused qualification

The new default-path regression fails on the unchanged runtime with
`opaque default cannot resume in the rAF microtask checkpoint` in
`/private/tmp/cot-interactive-baseline.gsRCvU/opaque-paint-default-before-r1.log`.
That deliberate failing-before receipt is retained.

After the one-line policy correction, all six ordinary FIFO entries pass in
`opaque-paint-default-cpu-r1.log`: `frameScheduler`,
`soloBattleDeploymentRuntime`, `garageReturnRuntime`, native TypeScript,
`core-unused-check` and the strict scheduler metric gate. The latter reports
20 functions, zero complexity violations and zero explicit `any`/`unknown`.

Default-path tests prove no continuation before the post-frame task, both
baselines anchored to task completion, unchanged Infinity/override/visible
behavior, timeout and task-error propagation, retry without falsely serviced
deadlines, and hidden-transition cleanup. Existing helper tests retain timer
fallback, visibility-return, stale callback and setup-error coverage. No build,
full-suite, browser or native acquisition was run for this isolated commit.

## Root integration and native acquisition

Root integrated the correction as `e7735a2ff`. The integration log
`opaque-paint-integration-gates-r1.log` passes scheduler, solo-deployment,
Garage-return and world-coordinator selftests, native TypeScript, core-unused
and the public production build. The `opaque-paint-local-r1` native action probe
uses Chrome 151 / ANGLE Metal Apple M5 Max, high quality, Urban, 14 vehicles,
1280×720 DPR 1, scale 1 and trim 0. Its actual controls, audio ownership, complete
warm/source readiness and cleanup gates pass. This is an unprofiled functional
capture, not a sustained strict performance certificate.

Battle / rematch / Garage: cover 3.1 / 133.2 / 90.9 ms; ready
6684.3 / 5516.3 / 333.3 ms; maximum callback gaps 111.8 / 116.1 / 47.2 ms.
The prior foundation-only acquisition and this run retain equal first/rematch
rosters and the same quality settings. One sequential comparison is insufficient
to attribute all variation to the scheduler change. No speedup percentage or
maximum-lag guarantee is claimed.

The first 111.8 ms gap (2731.6–2843.4) remains under `Surveying terrain` and
contains a 98 ms Long Task starting at 2745.7. LoAF attributes only the preceding
12.6 ms scheduler continuation, not that task's nested owner. The rematch gap
(10292.7–10408.8) contains no overlapping ≥50 ms Long Task, and has a 93.6 ms
LoAF without script attribution. Atomic work outside the corrected frame
checkpoint and unclassified browser work remain open. Props maximum atomic
slice is 22.3 ms; the foundation family is absent from the eight slowest slices.

Report SHA256: `702c187ac0f2f91338eec325c8f5eedba1042f6640521f7ed9317aac67343fd1`.
HTML SHA256: `1b02dba11b8eb706f9fb0a198b47b9c39bc010015c9f44bce86816da5c2dd98a`.
Acquisition SHA256: `ca9af05238ca4f5c0fb1d2941892f9f19519f95cfa3196038d91f36d469262a4`.
Evidence remains under `/private/tmp/cot-interactive-baseline.gsRCvU/`.

The three native screenshots were visually reviewed: day Battle, night rematch
and Garage retain their vehicles, lighting, environment and UI. This is a visual
sanity check, not pixel-difference or sustained-performance certification.

The required post-change React Doctor scan completed with three `await-in-loop`
warnings in `frameScheduler.selftest.mjs` (two) and `propsScheduling.selftest.mjs`
(one), and no runtime finding. These loops intentionally serialize fake global
browser clocks and cancellation fixtures. Parallelizing them would mix fixture
ownership; they are retained without disabling a rule or changing the score.
The scan's 49/100 result is not a clean-code or performance certificate.

## Full-suite clock-fixture regression

The first complete-suite attempt (`opaque-paint-full-suite-r1.log`) passed all
302 pre checks, then stopped with 317 core passes and one failure out of 318
executed core entries. `browserBattleBridge.selftest.mjs` exited 13 with an
unsettled top-level await. Its hidden-document fake host ran the 34 ms fallback
but did not service the following task now required by the default paint port.
This was not an assertion waiver or a passing full-suite result.

The corrected fixture holds and explicitly resolves `scheduler.yield()`, proving
that the fallback alone cannot complete roster preparation. It checks frame and
timer release, late-callback idempotence and all five global descriptor restores.
The actual bridge/default scheduler remain under test; no runtime fallback or
injected `yieldFrame` bypass was added. Cleanup restores the real host before
awaiting any later work. The focused run passes in
`opaque-paint-bridge-fixture-r1.log`; an independent read-only review found no
blocker. This covers hidden-host completion, not visible-paint certification.

### Resumed-suite action-probe fixture correction

The resumed suite (`opaque-paint-suite-resume-r1.log`) subsequently stopped at
`garage-battle-actions-contract.selftest.mjs`. Its late browser-close cancellation
case expected one functional-gate invocation but observed zero. The SIGTERM
exit-code assertion had already passed; cancellation was not reporting success.
The stripped-import fixture omitted the new `withGarageActionTrace` binding, so
the first action instead failed with a `ReferenceError` before reaching its gate.

The fixture now supplies the actual disabled trace wrapper and additionally
requires all three actions to complete before the closing-phase signal, with
only the interruption retained as a failure. The probe, cancellation contract
and functional/readiness gates are unchanged. This repairs fixture coverage,
not a production runtime defect or the remaining loading pauses.

The focused ordinary-FIFO run passes, including all 183 lifecycle assertions;
see `opaque-paint-actions-contract-fixture-r1.log`. The original failed resume
receipt remains retained; this focused result is not a completed full-suite run.
