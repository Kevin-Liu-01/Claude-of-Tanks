# Multiplayer selected-material first-use experiment

## Scope and evidence

This follows the corrected native profiles in
[the renderer attribution report](multiplayer-entry-render-attribution-2026-09.md).
Those profiles retain substantial inclusive weight under Three's lazy
`WebGLProgram.getUniforms` / `onFirstUse` / `WebGLUniforms` path. They do not
prove which native reflection query blocks, GPU execution duration, or the
cause of every historical frame stall.

The candidate enables first-use preparation only in the multiplayer covered
loading adapter. It does not alter graphics quality, authority, readiness,
countdown, world construction, or vehicle geometry. The earlier rejected
effects-to-activation checkpoint is not included.

## Finite work and lifetime

Pinned Three 0.185.1 returns materials from `compile`, not a receipt of the
exact programs used by that call. Each synchronous compile batch therefore
captures the submitted materials' program-cache values, including retained
back/front and shared-material variants. This is a **conservative
selected-material cache union**, not exact current-draw coverage and not a
renderer-wide sweep. Later unrelated additions cannot expand it. Wrapper and
native-handle identities are retained together.

The opt-in job checks cancellation, owner epoch, renderer-info identity,
context loss, program removal, and native-handle replacement around cooperative
checkpoints. Camera layers and render targets are restored before yielding.
When KHR parallel compilation is available, only an explicit completed query
permits reflection; unsupported KHR uses guarded synchronous reflection
without claiming observed link completion. Query failures
and unfinished programs retain the real-render fallback.

The first-use phase is bounded between native calls by five seconds and 120
unsuccessful readiness rounds. Individual native operations cannot be
preempted, so the wall-clock limit is not a hard cap on a driver call. Numeric
diagnostics retain total/max reflection duration, attempts, failures, yields,
and still-live unfinished programs. No room/player text or program identifiers
are added to the production capture's allowlist.

## Coverage limits

Ordinary `compile` does not submit all shadow depth/distance programs. Opening
effects, activation's camera change, and the canonical final-camera cascade
update can expose other cold variants. Therefore effects warming, real
watchdog rendering, nonblack-frame verification, loader fade, and the all-peer
five-second countdown remain mandatory. A completed cohort is not permission
to reveal an unrendered frame.

## Initial candidate publication status

**Runtime withheld.** Candidate `cdb7be8c9` is preserved on
`codex/multiplayer-program-first-use-r1`. The main landing contains only the
capture allowlist, its regression test, and this report. No `src/` changes are
included and no production speed improvement is claimed.

## Native result

The fresh `first-use-dwell-cpu-visual` private 1v1 passed functional checks on
local production build `v1.0.0+gcdb7be8c9.dirty`, `main-B3GIutgZ.js`. Tracked
runtime source was committed; only the temporary QA runner/output was
untracked. The build includes main's existing canopy changes at `ace937820`.
Two cache-disabled native contexts on one machine entered Winter, clear/day,
HIGH at render scale 1, after waiting-room map preparation. Both showed
`5,4,3,2,1`, moved, fired, returned to Garage, and closed their room connections.
There were zero page errors, no black-frame rescue, and browser closure was
verified. Both inspected screenshots show tank, terrain and HUD. The later
moving/firing probe uses its existing LOW settings and is not HIGH live-frame
certification; external GPU contention is not controlled by this probe.

| Covered loading measurement | Host | Guest |
| --- | ---: | ---: |
| Total, including ready barrier | 3,961 ms | 3,887 ms |
| Initial snapshot wait (rounded) | 0 ms | 0 ms |
| Scene compile / first-use phase | 1,484 ms | 1,281 ms |
| Uniform calls | 158 | 136 |
| Total / maximum uniform-call time | 6.5 / 0.2 ms | 7.1 / 0.2 ms |
| First-use yields | 159 | 137 |
| Uniform failures / live pending | 0 / 0 | 0 / 0 |
| Largest readiness query | 79.6 ms | 82.7 ms |
| Effects/cards warm | 180 ms | 217 ms |
| Watchdog render, excluding readback | 742.3 ms | 89.4 ms |
| Watchdog asynchronous readback | 61.0 ms | 703.2 ms |
| Largest observed loading long task | 910 ms | 295 ms |

The host's 910 ms task still coalesces effects, activation and watchdog work.
The guest's corrected profile retains about 681.5 ms inclusive under
`getUniforms`, whereas the explicit warm's measured calls total only 7.1 ms:
the selected-material warm does not eliminate later cold render work. Sampling
has a 234.5 ms maximum interval and about ±117.9 ms start-clock uncertainty;
although entry coverage is complete, this is not exact per-program attribution.
The later LOW moving/firing sample measured maximum callback gaps of
45.3/55.1 ms and zero hard snaps; it is not a frame-budget guarantee.

The unconditional yield after every tiny reflection creates substantial
scheduler overhead: 136–158 calls consume only 6.5–7.1 ms but require
137–159 separate checkpoints. The next candidate should use a bounded time
budget, retaining lifetime/readiness checks, rather than one checkpoint per
already-cheap call. Shadow/activation cohorts remain a separate unresolved
cost center. The earlier 1,903/1,808 ms production run is not a controlled A/B
for this build, but the present evidence is insufficient to publish this
candidate as faster or smoother. All failed/withheld evidence is retained.

## Validation boundary

Red-first program/scene tests pass, including 45 scene cases, reused variants,
pass restoration, exact handle lifetimes, unsupported KHR, failed reflection,
deadlines, and cancellation after the final pending yield. Typecheck and core
unused checks pass. Engine metrics report 51 functions with no complexity
violations or explicit any/unknown types. Focused presentation, activation,
entry lifecycle, session, scheduler, source-profile and private-room capture
tests pass. Production build passes (174 procedural playables; no GLB-backed
playables). These checks do not override failed performance acceptance.

React Doctor's changed-file scan reports 49/100: four cold-test chained-array
warnings and the intentionally sequential yield/await in the loading adapter.
The unchanged full-repository scan reports 43/100; the two scopes are not
directly comparable. No rules were disabled or graphics settings changed.
The pre-existing T-90M receipt failure remains reproducible in
`sourceXFleet.selftest.mjs` (`27bb658d` versus `ffbd40d4`), outside multiplayer;
the full suite is not claimed green.

For the diagnostic-only landing, the six optional uniform metrics are accepted
only as finite numbers; arbitrary strings/nested details remain excluded. Its
observer test first failed on the omitted fields, then passed. Source-profile,
private-room capture selftests, changed-tool metrics and whitespace checks pass.
No QA runner, report JSON, screenshots, build output, or unrelated work is staged.

## Follow-up: bounded first-use and final-camera shadows

The follow-up keeps the same finite selected-material cohort and lifetime
checks, but groups queries/reflection into four-millisecond work chunks
(caller bounds 1–8 ms). Every 32 visited entries also forces a checkpoint,
including failed, stale, completed and pending entries. Paint waits do not
consume the next work budget. Pending rounds still yield. Individual native
calls remain indivisible. The deterministic 136-cheap-program case performs
the same queries/reflections with five total waits instead of 137; this is
scheduler evidence, not a native speed claim.

After atomic player activation, while the loader still suppresses normal
scene paints, multiplayer now primes the final camera's four shadow cascades
one per task. This reuses the Garage's existing exact-cascade renderer path;
it does not lower shadow quality, omit far cascades, or add an alternative
render loop. Garage dormancy is released and the final camera FOV/fits are
published before priming. The next canonical frame consumes the primed maps.
The real watchdog, verified reveal frame, awaited fade, all-peer readiness,
and five-second countdown remain mandatory.
Spectators retain their existing watchdog and canonical redraw path: their
activation starts a moving camera blend, not a final snapped camera, so old-fit
maps must not be presented as final-camera priming.

The extracted shadow helper preserves the exact renderer callback, target,
face/mip, camera/light layers and original shadow flags on failure. Cancellation,
stale ownership and context changes reject entry without releasing readiness.
Cleanup attempts the remaining restorations even if target restoration throws;
an invalidated renderer never receives old native target bindings/disposal
hooks. Only successful priming publishes the reusable-frame flag.

The observer retains a bounded `finalShadows` interval plus finite cascade
count, total and maximum draw time, separately from the watchdog. New public
helper and presentation tests cover deferred work, failures, aborts, context
loss and exact restoration. Review also reproduced late cleanup context loss
and the helper-to-lighting await race; both now reject even without a caller
lease, and tests prove the next lighting update is not suppressed.

### Follow-up native acceptance

The `bounded-first-use-shadows-r1` capture passed on the frozen local public
build `v1.0.0+gee6a69389.dirty` (`main-BmgYa8u7.js`). The suffix records only
the untracked QA runner/artifacts; tracked runtime was committed. Acquisition
again used two fresh native contexts, Winter clear/day, HIGH/scale 1 during
entry, waiting-room map preparation, and guest CPU profiling. Both clients
rendered a verified frame, showed `5,4,3,2,1`, moved/fired, returned to Garage,
and closed the room. Page errors and black-frame rescues were zero; browser
closure was verified. Inspected images show tank/terrain/HUD and Apple M5 Max
ANGLE, not a black canvas or software renderer.

| Follow-up loading measurement | Host | Guest |
| --- | ---: | ---: |
| Total, including ready barrier | 2,139 ms | 2,282 ms |
| Scene compile / first-use phase | 320 ms | 369 ms |
| Uniform attempts / yields | 158 / 8 | 136 / 10 |
| Uniform time / failures / live pending | 4.4 ms / 0 / 0 | 4.8 ms / 0 / 0 |
| Four shadow draws: total / max | 116 / 92 ms | 64 / 36 ms |
| Watchdog render / asynchronous readback | 40.7 / 302.6 ms | 43.2 / 52.3 ms |
| Largest task starting inside network loading | 137 ms | 305 ms |
| Largest native readiness query | 136.4 ms | 212.4 ms |

This accepts the follow-up's functional behavior and removes the demonstrated
per-program scheduling overhead in the withheld candidate. It is one same-
machine observation, not a statistically controlled comparison to production:
room seeds, driver caches and external GPU contention are not controlled. The
guest's 305 ms loading task and long native queries remain unresolved; no hard
frame-budget or universally faster-than-main claim follows from these data.
The existing later LOW dual-render moving/firing sample observed maximum
callback gaps of 44.9/40.4 ms and zero hard snaps, not HIGH gameplay certification.

Focused renderer/presentation/barrier/launch tests, typecheck, production build
and changed-owner metrics pass (213 functions, zero complexity violations,
zero explicit any/unknown). React Doctor's changed score remains 49/100; new
warnings are cold test operations, not new live-frame work. The full suite is
still subject to the independently reproduced upstream T-90M receipt mismatch
documented above. No test expectation or graphics quality was weakened.

The final landing was rebased onto `427dc10a3`; focused checks, typecheck and
the public production build passed on that integrated tree. The ordered
`npm test` attempt was deliberately stopped during the unchanged wheel-quality
sweep after independently reproducing the existing T-90M receipt failure.
Its interrupted wheel test is not an assertion failure, and the ordered suite
did not complete. Full-suite green is not claimed.

## Invite entry and cooperative wreck preparation

Explicit private/LAN menu opens now start the same optional preloads as
hover/focus. Fresh invite links and touch users previously missed that path:
joined-room roster/map preparation did not acquire the common HUD/FX and
private-match handoff modules. The preload remains nonblocking and retryable;
solo and retained active-room guards do not acquire extra modules. Launcher
time before the presentation trace is not included in `networkLoad.totalMs`,
so that metric alone cannot quantify the invite transfer improvement.

The earlier guest 305 ms task overlapped `wreckWarm`, not the later scene
compile. The source profile attributes about 277 ms inclusive sampling to its
unguarded new-program `getUniforms()` loop (profile alignment has uncertainty;
this is not an exact driver CPU/GPU split). Wreck preparation now snapshots
new wrapper/native program identities immediately after each compile, restores
temporarily attached details and visibility, and consumes that finite cohort
through the existing four-millisecond/32-entry readiness/reflection scheduler.
This retains detached-cosmetic coverage; later scene compilation cannot safely
replace it. Renderer/context/entry lifetime guards fence every resumed job.
Entry cancellation reaches the wreck owner, and the real fallback probe draw,
watchdog, reveal, all-peer readiness and countdown remain required.

The five-second/120-round limit applies per visual, not to the entire roster.
An initial checkpoint per nonempty cohort adds a scheduling cost. A native
driver call is still indivisible; these changes do not promise a hard frame
ceiling or zero loading stalls. Regression tests cover exact cohort capture,
compaction and handle replacement, failed/pending queries, restoration before
yield, cancellation/context loss, bounded cheap/expensive batches, and fallback
draw cleanup. Independent review found no correctness blocker.

### Production baseline at 73c5f198e

`production-73c5f198e-r1` verified the actual deployed
`v1.0.0+g73c5f198e` / `main-CU0NSTJx.js` with two fresh native contexts and the
committed private-room UI probe. Both clients completed `5,4,3,2,1`, moved/fired,
returned to Garage and closed their room; page errors and black rescues were
zero, and browser closure was verified. The inspected guest image contains the
tank, terrain and HUD on native Apple M5 Max ANGLE.

This run observed Winter clear/**night**, HIGH/scale 1 at entry, unlike the
earlier clear/day local run. Room seeds, driver caches and foreign workload are
not controlled; it is not a matched timing comparison. It passed functional
acceptance but **not smooth-loading performance acceptance**:

| Production baseline measurement | Host | Guest |
| --- | ---: | ---: |
| Loading total, including ready barrier | 15,542 ms | 15,428 ms |
| Wreck preparation | 1,873 ms | 1,883 ms |
| Largest task in wreck preparation | 1,861 ms | 1,864 ms |
| Scene compile / first-use | 3,503 ms | 3,529 ms |
| Combat warm | 1,923 ms | 1,954 ms |
| Watchdog phase | 4,058 ms | 6,820 ms |

The guest watchdog asynchronous readback reached its five-second timeout and
then succeeded through the existing synchronous fallback. The later LOW
moving/firing sample is separate from this HIGH entry measurement. These
results are retained as failures of the desired loading budget, not hidden by
the probe's successful functional outcome.

### Follow-up source verification

Fifteen focused selftests pass across program/scene/wreck warming, explicit
preload intent and module retries, presentation/launch/activation/barrier,
Garage return, countdown, version identity and the production observer/probe.
Changed runtime-owner metrics pass: 158 functions, zero complexity violations
and zero explicit `any`/`unknown`. React Doctor's read-only changed scan reports
89/100 with three warnings: two test-only iteration patterns and the intentional
serial await that releases a paint checkpoint. Parallelizing that await would
defeat the bounded-work and cancellation contract; no warning is suppressed.
This scan covers different files from the previous 49/100 scan, so the scores
are not a controlled improvement measurement.
