# Multiplayer panel / scene preparation overlap — 2026-09-08

## Problem and scheduling change

The prior native two-client Winter entries still waited for the entire exact
player damage-panel mask job before beginning full-scene shader preparation.
The mask job includes asynchronous shader readiness and PBO waits, during
which useful scene preparation can proceed. The preceding shipped change
(`22cff8207`) overlaps the two mask layers; this experiment instead overlaps
that whole mask transaction with scene compilation.

The safe boundary is after the viewer-bearing snapshot and wreck warmup:

1. Apply the initial snapshot so the exact viewer visual is visible.
2. Finish atmosphere, night lighting, terrain and wreck preparation. Wreck
   preparation installs the final shared material shader hooks.
3. Start the player-only panel job, observing rejection immediately.
4. Yield the existing frame and compile the scene while panel work progresses.
5. Join both jobs before opening effects, activation, final shadows, verified
   battlefield frame, loader fade and READY. READY still starts the shared
   five-second countdown only after reveal.

Spectators and absent viewers skip the panel, without preparing another
player's tank. Player identity remains independent of the vehicle spec ID.
This does not replace exact diagrams, reduce quality, omit shader work or
move required preparation into the visible combat window.

## Ownership and failure behavior

The panel result is immediately reflected into a non-rejecting settled-result
promise. An early rejection or synchronous port throw cannot become unhandled
while scene compilation waits. Every exit from the overlapping block drains
that promise before the launcher can dispose its borrowed visual or restore
Garage. Compile-frame failure and cancellation keep their original error even
if the panel rejects later. A panel failure is rethrown after compilation has
settled. Ordinary optional shader-warm failure keeps its existing soft-failure
policy; actual first-frame verification remains required.

A final cancellation checkpoint follows the unconditional drain, including
its last microtask yield. Leaving at that exact boundary cannot invoke the
opening-effects port; the caller receives the normalized entry AbortError.

Both renderer paths submit synchronously and restore the then-current target,
cube face and mip before awaiting. Scene warming also restores main-camera
layers. The mask has its own clone/camera and independently owned readbacks;
it pins program wrappers immediately, so scene compilation cannot redirect its
readiness check by replacing a material's current-program selection. The next
real draw selects the correct scene/material variant and refreshes uniforms.

An independent source review found no new renderer-state or program-lifetime
blocker. It did identify a performance caveat: scene warming captures each
selected material's program cache and may include mask variants. Scheduling
overlap is therefore not itself proof of a proportional load-time reduction.

## Honest timing

`preparationSlices` contains the full actual `panelMasks` and `compile` job
intervals. They may overlap and must not be added. The contiguous main timeline
now has `compile` followed by `panelJoin`; the latter measures only residual
waiting, not the full panel lifetime. Skipped panel jobs create no slice. Error
cleanup remains inside the open serial stage until its owned work has drained.

The observer accepts at most two preparation intervals, allowlists both names
and numeric clocks, and omits the new field for legacy/malformed containers.
Historical `panelMasks` stages remain readable. Extra metadata and unknown
stage names cannot leak through the diagnostic serializer.

## Verification status

Focused tests cover both completion orders, early/synchronous rejection,
compile-frame failure, cancellation during frame/compile/panel waiting, panel
resolve or rejection during cleanup, preserved primary failure, soft optional
compile failure (including a simultaneous fatal panel rejection), cancellation
at the final drain microtask, exact viewer selection, spectator skipping, opaque loader,
and no effects/activation/reveal/READY before both jobs settle. Interval tests
separate actual overlapping lifetimes from the remaining panel wait.

The full `npm test` attempt on the candidate stopped in the pre-suite at
`src/vehicles/sourceXFleet.selftest.mjs`: the existing T-90M geometry fingerprint
is `27bb658d`, while the test expects `ffbd40d4`. This reproduces the known
failure on the unchanged upstream vehicle tree; neither vehicle code nor its
expected fingerprint was edited. The full suite is therefore not green.

Final typecheck, core-unused check, production build, focused presentation and
observer tests pass. The runtime complexity gate reports 28 functions, zero
violations and no explicit `any` or `unknown`. Independent final review accepted
the cancellation checkpoint and both failure-order regressions.

## Native candidate receipt

Fresh local two-client private-room run, using the committed production invite
and performance driver through `.qa-entry/run.mjs`, label
`panel-scene-overlap-timings-r1`, `--timings` (no CPU profiler). The frozen public
build is based on `22cff82078e7398b401058bc00efd5914c645e38`:

- Version: `v1.0.0+g22cff8207.dirty`.
- Build-index SHA-256: `89591f6458a95ecad63c6738988a2e1f34ebc764176dfb091e34c3a113494fba`.
- Source-diff SHA-256: `ae51695e3a25a04dbde89adbc294e5f6e8a75457bc54c109e09fc65d8292b4d6`.
- Entry: Winter, clear/night, HIGH at scale 1, native Apple M5 Max Metal renderer. Both clients
  used the normal invite, readiness, battle entry, exit and room-close paths.

| Measurement (ms) | Host | Guest |
| --- | ---: | ---: |
| Launch to first hidden loader | 1824.0 | 1907.6 |
| Full panel preparation | 426.1 | 562.0 |
| Actual scene compilation | 655.6 | 593.6 |
| Residual panel wait (rounded) | 0 | 0 |
| Largest observed entry long task | 96 | 99 |
| Follow-on movement/fire frame-gap maximum | 54.8 | 46.9 |

Both clients observed 5, 4, 3, 2, 1. There were no page exceptions, renderer
crashes, black-watchdog rescues or movement hard snaps. Both screenshots were
inspected: the battlefield and exact player damage panel are visible. Room
closure, browser closure and window/session cleanup passed.

The full panel jobs are now covered by scene preparation, but their individual
durations increased under overlapping GPU work. Compared with the prior
clear/night receipt, total entry times are similar; this single non-matched
run does not establish a repeatable end-to-end speedup. Follow-on dual-render
samples used the normal adaptive low preset at scale 1 and are not proof of a
16.7 ms frame budget. The 54.8/46.9 ms maxima remain visible residual debt.

This is local same-machine acceptance, not a new production, distant-network,
larger-room or historical-stall certification. Those wider goals remain open.
Raw QA artifacts remain local and are excluded from the source commit.
