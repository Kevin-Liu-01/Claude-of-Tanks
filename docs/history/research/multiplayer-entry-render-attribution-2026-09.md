# Multiplayer entry: renderer attribution and withheld checkpoint

## Scope

The guest scheduler wake fix is already on main as `a65e95402`. Its final
verification boundary is recorded in
[the entry wake report](multiplayer-entry-idle-wake-2026-09.md). This follow-up
investigates remaining covered-loading and reveal stalls without changing
network authority, graphics quality, the five-second countdown, or the
nonblack-frame requirement.

## Correct the profiler before interpreting its output

The generated-location filter in `tools/multiplayer-source-profile.mjs`
accepted ordinary application chunks but rejected the pinned build's
`three.module-<hash>.js` and `three.core-<hash>.js` names. Their samples therefore
fell into `other`; their function names and source positions were discarded.
The older receipt cannot be repaired from its sanitized summary.

The filter now admits exactly those two additional same-origin chunk prefixes.
Credentialed URLs, query strings, fragments, foreign origins, arbitrary dotted
assets and nested asset paths remain excluded. Node/sample/function/bin limits,
generated one-based coordinates and statistical sample weighting are unchanged.
Regression tests first reproduced the missing application weights, then proved
both accepted names, unchanged self/inclusive/bin accounting and privacy rules.

This is diagnostic-only: no additional instrumentation runs in ordinary games.
Older `other` sample weights must not be described as native GPU or IPC time;
they can include rejected Three.js JavaScript frames.

## Source-proven coalescing, not an individual-stall explanation

The rejected `explicit-flush-dwell-cpu-visual` experiment retained a 6,684 ms
guest long task covering about 3,475 ms of opening-effects preparation,
5 ms of activation and 3,204 ms of watchdog rendering. The latter two operations
followed the resolved effects promise without a paint/task checkpoint. A
separate approximately 2,046 ms task during loader fade retained the ordinary
postprocessing render stack; it was not evidence of a two-second CSS timer.

These are distinct from the earlier waiting stages: panel preparation took
about 1,650 ms but included asynchronous shader and readback waits. The host's
wreck preparation and guest's atmosphere delay also preceded scene compilation.
Consequently that experiment does not establish that its shader flush caused
all observed delays, nor that changing query order fixed them.

## Corrected production baseline

A fresh native private 1v1 on production `v1.0.0+g33f821154` passed with two
cache-disabled contexts on one machine. Both finished fixed-map waiting-room
prefetch before launch; both entered Winter at HIGH, clear/day, render scale 1.
Both displayed `5,4,3,2,1`, exchanged inputs/snapshots, fired, and returned to
Garage. Page errors were zero; both room exits and browser closure were verified.
The inspected guest screenshot shows a rendered tank, terrain and HUD, not a
black canvas. The later moving/firing sample deliberately uses the existing LOW
quality probe; it does not certify sustained HIGH-quality frame budgets.

| Covered loading measurement | Host | Guest |
| --- | ---: | ---: |
| Total, including ready barrier | 1,903 ms | 1,808 ms |
| Initial snapshot wait (rounded) | 0 ms | 0 ms |
| Scene compile | 195 ms | 409 ms |
| Largest readiness query | 43.5 ms | 224.5 ms |
| Effects/cards warm | 78 ms | 87 ms |
| Watchdog render, excluding readback | 307.8 ms | 105.3 ms |

The guest's largest 345 ms task lies wholly in scene compilation; readiness
queries account for 344.7 ms. Its next 193 ms task spans effects, activation and
watchdog rendering. The corrected source profile, checked against the exact
served Three.js bundle, retains about 232.2 ms inclusive in the `WebGLUniforms`
constructor and `WebGLProgram.onFirstUse`, 218.0 ms in `getUniforms`, and
229.1 ms in `setProgram`. These overlapping sampled weights are **not additive**.
They identify lazy uniform reflection as a concrete follow-up target; they do
not distinguish native `getActiveUniform` from `getUniformLocation`, prove a
GPU-driver cause, or explain every historical stall.

The 239.1 ms maximum sampling interval and ±121.75 ms clock uncertainty prohibit
fine per-call/stage attribution. The conservative profile end bound misses
loader-hidden by 0.116 ms (`entryFullyCovered: false`). The earlier approximately
13-second experimental entry did not reproduce. No experimental shader flush,
query reordering or uniform initialization is included in this change.

## Candidate checkpoint — not shipped

In the isolated candidate `289358212`, after effects/cards warming completes,
the presentation owner awaits its
existing frame port before activation starts the next native render. The candidate's
network-loading adapter uses `nextPaintFrame`, which leaves the RAF microtask
checkpoint for a task/rendering opportunity. This is **not** an acknowledgement
of GPU completion or proof that a physical frame was displayed.

The loader stays opaque. Cancellation is checked immediately after the await;
activation, watchdog, reveal and READY cannot run before it settles. Failure or
cancellation closes the pending trace interval. The existing verified nonblack
frame, awaited loader fade, all-peer readiness and full five-second authority
countdown remain required. The candidate makes no authority, simulation, quality, camera or cleanup
policy changes.

Red-first public-owner tests cover pending, successful, cancelled and rejected
checkpoints, trace closure and preserved 5,000 ms countdown. An integration
assertion verifies the real adapter uses the paint-sensitive helper.

## Candidate browser result and publication decision

The native `checkpoint-dwell-cpu-visual` run passed functional private 1v1
checks on local production build `v1.0.0+g289358212.dirty` (bundle
`main-CU8g7_FZ.js`; only temporary QA files were untracked). Both clients
entered HIGH, clear/night, scale 1 after waiting-room map prefetch. Both showed
`5,4,3,2,1`; firing, movement, Garage returns, room closure and browser cleanup
passed with zero page errors and no black-frame rescue. Both saved screenshots
were inspected and show the nighttime tank, terrain and HUD.

Performance acceptance did **not** pass: host/guest covered entry took
14,934/14,834 ms, effects about 4,882 ms each, and watchdog rendering about
4,159 ms each. The longest task was 4,865 ms. The checkpoint separated effects
from activation/watchdog, but did not reduce those native stalls sufficiently.
This is not a controlled speed comparison with the clear/day production
baseline: lighting, build origin, native scheduling and cache state differ.
Nor does one run prove the checkpoint caused the regression. The safe
publication decision is nevertheless to **withhold the runtime checkpoint**
until its performance impact is understood and repeatable.

The corrected candidate profile retains approximately 12,175 ms inclusive in
Three's uniform-table constructor, nested under `onFirstUse`/`getUniforms`.
Effects warming, watchdog rendering and the first ordinary postprocessed draw
account for the corresponding sampled render paths. These are overlapping
weights, not an additive breakdown or a measurement of GPU execution time.
The small 18 ms maximum readiness query is not readiness success: polling
exhausted 24 pending yields. Guest new-cohort query calls total 27, including
repeated pending queries, against 78 added programs. The next investigation
must preserve those distinctions and cancellation/context ownership rather
than treating a low query duration as proof of completed shader preparation.

The actual landing contains only the profiler's generated-location correction,
its tests and this report. It changes no `src/` file. The checkpoint commit and
all raw QA evidence remain preserved on the isolated candidate branch.

## Validation boundary

On the isolated candidate, focused input, protocol, private handoff,
presentation, activation, lifecycle, frame scheduler and diagnostic tests,
typecheck, production build and changed-owner code metrics pass. React Doctor's changed-file scan reports 90/100 with one cold-test
property-access warning, not a runtime hot-loop regression; the whole repository
scan reports 43/100 and is not a comparable changed-file score.

The previously documented full-suite failure in `sourceXFleet.selftest.mjs`
(T-90M receipt `27bb658d` versus `ffbd40d4`) remains outside this multiplayer
slice. Do not claim a green full suite from the focused checks.

On the diagnostic-only landing, the source-profile, production-entry observer
and production-private-room guard/cleanup selftests pass. Changed-tool code
metrics and diff checks pass. No native browser or runtime improvement is claimed
for a diagnostic-only change. Raw reports, temporary runners and screenshots
remain untracked QA artifacts, not production assets.
