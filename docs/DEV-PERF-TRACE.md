# DEV performance flight recorder

Development builds keep a bounded gameplay and render timeline at
`window.__DEV_TRACE`. Ordinary production sessions do not load the recorder
and install no bus hook, observers, or lifecycle listeners. An explicit
optimized-build device-QA session with `?debug=1` lazy-loads the recorder and
also exposes it as `window.__QA_TRACE`.

The recorder captures:

- every game-bus emission, with an immediate payload snapshot;
- configured input-action edges and explicit diagnostic marks;
- every rendered frame's raw rAF gap, clamped game `dt`, phase, simulation
  time, countdown, input, render calls/triangles/frame, program/geometry/
  texture counts, heap, and dynamic render scale;
- long tasks, page/focus/visibility changes, JavaScript errors, rejected
  promises, and WebGL context loss/restoration;
- explicit `screen:freeze`, `sim:freeze`/`sim:resume`, and
  `render:freeze`/`render:resume` anomalies.

Frames use bounded typed columns (72,000 frames, about 20 minutes at 60 fps)
and event objects use a bounded 20,000-row ring. Both report dropped-row counts
instead of growing without limit.

## Console API

```js
__DEV_TRACE.stats()                 // compact live health summary
__DEV_TRACE.tail(50)                // newest event/action/anomaly rows
__DEV_TRACE.tail(50, 'anomaly')
__DEV_TRACE.mark('repro:corner', { note: 'after first shot' })
__DEV_TRACE.download()              // complete JSON trace
__DEV_TRACE.clear()                 // start a fresh relative timeline
__DEV_TRACE.console(true)           // opt-in mirror of every event (noisy)
```

In a production QA URL, substitute `__QA_TRACE`. The visible telemetry panel
also provides 44 px `MARK ISSUE`, `COPY SUMMARY`, and `EXPORT JSON` controls so
a remote tester can preserve a useful report without opening DevTools. Marks
include the current HUD and engine telemetry; exported snapshots embed the
current quality, resolution, simulation, world, shadow, network, and memory
state.

The downloaded JSON includes the environment and GPU renderer, summary
percentiles, a `frameSchema` array, compact frame rows, and the ordered event
timeline. Full console mirroring is off by default because logging every hot
event can itself create stalls; anomaly rows are stored, not printed, unless
mirroring is explicitly enabled.

## Persistence contract

The flight recorder is a bounded in-memory ring, not automatic permanent
storage. Reloading or closing the page discards a manual session unless
`__DEV_TRACE.download()` ran first. The repeatable probes export it as part of
their JSON automatically. Perf HUD numbers, browser console output, terminal
buffers, and screenshots displayed only in a Codex task are likewise not Git
artifacts unless the round archives them explicitly.

Every release-grade run follows [QA-ARCHIVE.md](QA-ARCHIVE.md): store the raw
trace/scorecard, required screenshots, and console failures; generate
`docs/qa-evidence-manifest.json`; then give the bytes a tracked or external
durable location. Do not describe a memory-only or `.qa-*`-only trace as
“archived.”

## Repeatable desktop and lower-end probes

Run one profile at a time:

```sh
npm run perf:dev -- --profile=normal --out=.qa-dev/normal.json
npm run perf:dev -- --profile=constrained --out=.qa-dev/constrained.json
npm run perf:dev -- --profile=software --out=.qa-dev/software.json
```

For the real player entry path, add `--entry=real --entry-gate=true`. The gate
requires warm-up ownership to remain under the transition and requires both
the countdown and first-live-five-second windows to have no long task, freeze,
or shader-program birth, with bounded p95 and worst-frame gaps.

`constrained` applies CDP 2x CPU throttling at the battle-open edge, covering
the first live frames and active play without letting the game's monolithic
constructor make DevTools itself unavailable. `software` adds SwiftShader from
boot. Chrome
DevTools Protocol does
not expose a calibrated GPU-throttling command, so SwiftShader is deliberately
labeled a severe stress floor—not a faithful model of a particular low-end
integrated GPU. Keep the hardware-GPU constrained result beside it.

Use `--cpu=4 --throttle-stage=boot` for a harsher constructor experiment. On
this content the single synchronous constructor task can itself make DevTools
unresponsive for multiple minutes. The exportable default keeps constructor
measurement on normal hardware and applies lower-end CPU pressure at the
countdown edge. Use `--open-timeout=60` to bound responsive failure paths;
timeout files contain the partial flight recorder and CPU profile whenever the
page can still answer DevTools.

Optional `--cores=4 --memory=4` navigator overrides are available for quality-
selection experiments. They are not silently mixed into the default CPU test.

Each probe preserves a boot trace checkpoint, then records battle
construction, the complete visible countdown as its own frame window, active
driving and firing, the first five and first ten seconds after `preBattleS`
reaches zero, a 0.5 ms V8 CPU sample profile, and the complete play trace.
The countdown and live summaries include effective FPS, average/p50/p95/p99
frame gaps, worst gap, program births, long tasks, and freezes, so transition
work cannot silently spill into either phase. At the end it injects a marked
320 ms main-thread block to falsify the detector. That synthetic block starts
only after the natural trace and CPU profile are captured, so it is never
counted as game performance.

The probe is diagnostic evidence. The ratified Mobile QA Lap in
`docs/MOBILE-QA.md` remains the release-budget gate.

For the optimized-build contract and the full device-less lifecycle lap, run:

```sh
npm run qa:trace
npm run qa:device
npm run qa:device:stress
```
