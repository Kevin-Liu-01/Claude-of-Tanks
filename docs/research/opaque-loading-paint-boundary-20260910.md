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
