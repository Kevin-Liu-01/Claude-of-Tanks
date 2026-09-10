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
