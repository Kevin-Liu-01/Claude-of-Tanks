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
