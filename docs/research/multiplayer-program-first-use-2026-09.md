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
Changed runtime-owner metrics pass: 159 functions, zero complexity violations
and zero explicit `any`/`unknown`. React Doctor's read-only changed scan reports
89/100 with three warnings: two test-only iteration patterns and the intentional
serial await that releases a paint checkpoint. Parallelizing that await would
defeat the bounded-work and cancellation contract; no warning is suppressed.
This scan covers different files from the previous 49/100 scan, so the scores
are not a controlled improvement measurement.

The first local candidate (`invite-wreck-r1`, `main-qYjQNADc.js`) passed the
native multiplayer flow, but typecheck caught a second, synchronous solo/capture
caller of the removed helper. Its warm-only catch had hidden the missing call
from the existing tests. The original helper is restored for that caller only;
a red-first public `createCombatRareWarmSteps` regression now asserts actual
new-program uniform calls, continuation after a driver error, exclusion of old
programs, and exact destruction/visibility restoration. The initial candidate
was not pushed as a passing release.

That first local observation was clear/day (not the production night case):
loading totals were 1,936/2,049 ms, wreck phases 118/145 ms, and later native
readiness queries still reached 197.6/199.9 ms. It is useful functional evidence,
not proof that the night-loading problem or remaining shader stalls are fixed.

### Final integrated acceptance

The corrected solo helper passed typecheck, the public build and the native
`invite-wreck-r2` flow at `35d33b7e4`. That clear/day run observed loading totals
of 2,034/2,123 ms and wreck phases of 116/172 ms (host/guest), with both full
countdowns and verified cleanup. Its later LOW maximum frame gaps were
47.9/51.6 ms. It was not the final integrated tree.

Rebasing onto `4a563382c` changed only the independent diagnostics-retention
slice outside these multiplayer files. At integrated runtime `8b6aa6b08`, all
15 focused checks, the additional perfHud regression, typecheck, changed-owner
metrics and the public build passed. Independent scope/caller review found no
blocker. The full-suite limitation above remains; no vehicle receipt was edited.

`invite-wreck-r3` then exercised the frozen local public build
`v1.0.0+g8b6aa6b08.dirty` / `main-BqbyioQ8.js` with two fresh native contexts,
local signaling and guest CPU profiling. The dirty suffix reflects untracked
QA artifacts; tracked source was unchanged. The served build index SHA-256 was
`2bd5313a16047c80aacd17226ca2fd1d3d8cef01756d9439ea197701baeb76af`.
Both clients reused the prepared Winter map, showed `5,4,3,2,1` in foreground,
moved/fired, returned to Garage and closed the room. Page/observer errors and
black-frame rescues were zero; browser and room cleanup were verified. The
inspected image shows native Apple M5 Max ANGLE, the tank, terrain and HUD.

This final run selected clear/**night**, HIGH/scale 1 during entry. It passed
functional acceptance, but **not smooth-loading performance acceptance**:

| Integrated night loading | Host | Guest |
| --- | ---: | ---: |
| Loading total, including ready barrier | 10,992 ms | 11,063 ms |
| Wreck preparation | 1,049 ms | 1,095 ms |
| Scene compile / first-use | 3,928 ms | 968 ms |
| Combat warm | 1,617 ms | 1,573 ms |
| Largest recorded entry task | 1,604 ms | 1,561 ms |
| Watchdog render / asynchronous readback | 711 / 2,122 ms | 639 / 2,768 ms |

Neither peer recorded a 50-ms-or-longer task starting inside the wreck interval.
The largest tasks instead overlap combat warm; that timing overlap is not a
complete driver/root-cause attribution. The later, separate LOW dual-render
moving/firing sample reached 43.2/45.0 ms maximum callback gaps with zero hard
snaps. Room seeds, driver caches, external contention and profiling overhead
are not controlled. These observations do not establish a matched production
speedup, eliminate the remaining night stalls, or certify HIGH gameplay and
separate-device/network performance. Final publication changes only this ledger
after the frozen runtime checks; temporary runners and capture files stay out.

### Remaining first-combat stall: source attribution

The preserved `invite-wreck-r3` guest CPU profile places 1,542.61 ms of inclusive
sample weight inside the actual compositor call from network opening-effects
warmup, versus the measured 1,561-ms task. The base SceneAA pass reaches Three's
`setProgram → getUniforms → onFirstUse → WebGLUniforms` path. Inclusive samples
overlap and must not be summed into a second wall-time measurement. The profile
has ±118.65-ms clock uncertainty and a 236.14-ms largest sample; it identifies
the driver-facing path, not a particular material or shader handle.

Source inspection finds a concrete coverage hole: the first vehicle armor scar
attaches a lazy decal mesh and submits its shader **after** the main scene's
bounded reflection pass. The next operation stages effects and draws the real
compositor without a readiness/reflection checkpoint for that new cohort.
Preparing that exact cohort cooperatively is a candidate correction, not yet
proof that this one effect accounts for the complete pause. The new
`scarCompile` observer field retains only the same bounded numeric counters as
`programCompile`, separately, to test that hypothesis without retaining object
names, URLs, or identities.

The proposed alternative explanation—new muzzle lights changing the compile
variant—is not supported by the fresh-entry source. Both pooled point lights
are already attached and visible during the scene compile; changing their
intensity does not change Three's point-light count. Nor is the standalone
offscreen/post-pass warmer a drop-in replacement for the full compositor: it
has different pass enablement, render targets, depth copying and temporal
history. The real complete draw and reveal gate remain required.

The later 639-ms watchdog draw has a distinct sampled path through
`WebGLUniforms.upload → texture sampler upload → texSubImage2D`. Its subsequent
2.8-second asynchronous readback is yielded elapsed time, not an additional
2.8-second synchronous upload. The profile does not retain the offending
texture identity. This cost remains open independently of the scar-program
coverage fix.

### Published preload build: production recheck

`production-f520626e0-r1` exercised the actual Cloudflare-backed website at
`v1.0.0+gf520626e0` with two fresh native browser contexts and guest profiling.
This is the published **pre-scar-fix baseline**, not evidence for the new local
candidate. Both prepared Winter maps were complete before launch and reused
without promotion. Both foreground clients displayed `5,4,3,2,1`, moved/fired,
returned to Garage and closed the room; browser closure and room cleanup passed.
Page/observer errors, profile failures, hard snaps and black-frame rescues were
zero. The inspected guest image shows the tank/world/HUD on native Apple M5 Max
ANGLE.

This run selected clear/day, HIGH/scale 1 during entry. Loading including the
ready barrier took 2,026/2,089 ms (host/guest), after an explicit waiting-room map
preparation dwell. It is **not** a two-second cold-navigation claim. Combat warm
took 121/113 ms; the largest entry tasks were 311/335 ms. Those tasks align with
the main cohort's native readiness queries (`maxExistingQueryMs` 311.5/335.2),
while uniform reflection itself totaled only 4.1/5.9 ms. Thus the large night
compositor stall did not recur in this sample, but smooth-loading acceptance
still fails: native readiness queries can themselves block despite the bounded
JavaScript scheduler. The later, separate LOW moving/firing samples reached
39.4/50.0-ms maximum callback gaps. Scenario randomness, driver caches, foreign
GPU activity and profiling remain uncontrolled.

### Cooperative scar preparation candidate

The local candidate captures the exact newly submitted scar wrapper/native
program pairs, restores the vehicle and camera immediately, then consumes the
existing bounded readiness/reflection job between paints. Only the temporary
scar stays hidden; the same attached mesh is shown again for the unchanged real
compositor draw. No muzzle effect is allowed to age away during those waits.

The entry AbortSignal now reaches this stage. Renderer-info/context identity,
context loss and warm-generation invalidation stop abandoned work, including
inside cooperative texture preparation. A one-shot removal listener restores
temporary mesh visibility **before** decal pooling can lend it to a different
owner; same-root reuse also invalidates the old job. Camera, FX-group and tank
visibility are saved/restored around each synchronous mutation rather than
rewinding newer state after an await. Cancelled pre-draw work does not reset a
newer owner's live FX. Synchronous solo/capture warming is unchanged.

Fourteen focused selftest commands passed, including the real FX-graph staging
contract, exact production compositor callback, presentation/launch/activation,
readiness, countdown, Garage return, and bounded observer privacy. The new
scar test was red before implementation. Typecheck and changed-owner complexity
gates passed (617 functions across the three touched runtime modules, zero
violations, zero explicit `any`/`unknown`). Independent source/caller review
found no remaining blocker. These are code/behavior checks, not native
performance acceptance.

React Doctor reported 49/100 with six `await-in-loop` warnings on the changed
files: five sequential test-case loops and the intentional paint-yield loop.
The latter must remain serial to bound work and validate ownership between
native calls; parallelizing the tests would overlap shared lifecycle fixtures.
No warning is suppressed. The initial scan had no changed files, and earlier
scores covered different file sets, so no controlled score improvement is
claimed. The full-suite upstream vehicle-receipt limitation recorded above
remains outside this multiplayer change.

### Scar candidate native acceptance

`scar-cohort-r1` tested the frozen candidate at
`v1.0.0+gf520626e0.dirty` (index SHA-256
`b9eb0f0c81a61694f20aa218b74c78b3daee7b5b665633893d5184fa9f49389a`).
Two fresh native browser contexts used local-loopback signaling and the normal
private-room UI. This was a local candidate test, not a production deployment.
Both cached Winter maps completed before launch; both clients displayed the
full foreground `5,4,3,2,1` countdown, moved/fired, returned to Garage and closed
the room. Page errors, observer failures, black-frame rescues and hard snaps were
zero; browser and room cleanup passed. The inspected guest capture shows the
live tank, battlefield and HUD on native Apple M5 Max ANGLE.

Both clients captured exactly one new scar program, reflected it before the
real compositor draw, and finished with zero pending programs or failures.
The scar job yielded once on each peer. This verifies that the previously
missing native cohort is now admitted, not that all first-use stalls are gone.
Clear/day HIGH entry took 1,938/2,068 ms (host/guest), after a 6.45-second
waiting-room preparation dwell. Combat warm took 151/104 ms. Largest recorded
entry tasks remained 235/223 ms, and maximum entry callback gaps were
239.3/224.0 ms. The guest's 223-ms task aligns with the main cohort's existing
program readiness query, separate from the new scar job. The later LOW
dual-render movement/firing sample reached 54.4/45.2-ms maximum callback gaps.
This is functional acceptance with an observed coverage correction, **not**
smooth-loading acceptance or a controlled before/after speedup. Night loading,
driver-query stalls and deferred texture uploads remain open.

### Main integration acceptance

Runtime commit `8867f6bc8` rebased cleanly onto `c0dcf8255`, preserving the
concurrent i18n and dormant snow-atlas work. The same fourteen focused selftest
commands, typecheck, public build and three-owner complexity gate passed on
that integrated tree. `scar-integrated-r2` then passed the native two-client
private-room flow, foreground `5,4,3,2,1`, firing, nonblack reveal, Garage return
and room/browser cleanup, with no page errors or hard snaps. Each client
prepared one scar program with zero failures/pending work; the guest yielded
three times while it became ready. Its inspected capture shows the live
battlefield and HUD. The build was `v1.0.0+g8867f6bc8.dirty` solely because local
QA artifacts were untracked; the recorded tracked runtime diff was empty.

This second local clear/day HIGH run took 2,101/2,158 ms after a 6.50-second
waiting-room map dwell. Maximum entry tasks remained 307/226 ms; later LOW
dual-render callback gaps reached 43.0/46.8 ms. Thus integration is functionally
verified, but the smooth-loading limitation remains. The initial integrated
runner refused an incorrect expected version before opening any browser; the
fresh `r2` run used the actual frozen build stamp. This publication adds only
the scoped multiplayer change and this evidence ledger, not the QA artifacts.

### Next measured cost: repeated native readiness work

The integrated guest's 226-ms task is wholly inside scene preparation and
matches `maxExistingQueryMs=226.2`. Its retained CPU profile maps to
`queryCapturedProgram → gl.getProgramParameter`; main uniform reflection
itself totaled only 4.7 ms. The host's 307-ms task instead overlaps combat
warm and activation, but the host was not profiled, so its underlying driver
operation is not established. These are distinct remaining costs.

[KHR parallel compilation](https://developer.mozilla.org/en-US/docs/Web/API/KHR_parallel_shader_compile)
provides a readiness-polling mechanism; it does not make total linking work
disappear. The pinned Three 0.185.1 `WebGLProgram` implementation additionally
caches uniform and attribute reflection per wrapper/native handle. A successful
uniform call alone is insufficient proof: attribute initialization can throw
after the uniform cache has already been assigned.

The next candidate retains renderer-lifetime, weak-identity evidence only after
both tables have been successfully obtained from a still-live exact program.
Only those proven pairs may skip repeat native readiness/reflection calls.
Renderer-list membership, an earlier KHR result, or an ordinary unobserved draw
does not qualify. The numeric `uniformReused` counter distinguishes avoided
calls from actual `uniformCount` attempts. An additional `openingRenderMs`
receipt measures the existing synchronous compositor draw and target restoration
separately from surrounding effects staging. Its regression executes the exact
production callback and preserves restoration/error propagation on draw failure.
Both new observer fields retain only finite numeric data in the existing
bounded allowlist. Native benefit and full smooth-loading acceptance remain
unproven until the candidate is measured.

### Successful-program reuse checkpoint

The implementation now shares strict successful-reflection witnesses between
scene preparation, scoped wreck/scar jobs, and the guarded Garage initializer.
Cancellation, renderer/info/context replacement, disposal, native-handle
replacement, and explicit invalidation all prevent stale reuse. Partial
uniform/attribute failures never publish proof; unsupported reflection results
remain on the ordinary path. Actual scene submissions and covered draws are
unchanged.

The frozen candidate passed `program-proof-r1` through the committed two-client
native UI regression, using local signaling and two pristine browser contexts
on one machine. Source base was `2828ee43e`, build stamp
`v1.0.0+g2828ee43e.dirty`, index SHA-256
`b36a7ac83978bffed567e15769348c180fbee34df503dee5ac0ab25279ed77db`,
and tracked runtime-diff SHA-256
`87a1d3815c3121c8f54a4975cf4497c73548486cb7f4a1099f55923f717f3f08`.
The source remained frozen throughout acquisition. Raw reports/screenshots stay
in the excluded `.qa-entry/program-proof-r1/` directory.

Observed conditions were clear/day Winter, HIGH/scale 1 during entry and LOW
during the later gameplay sample. After 6,360 ms waiting-room map dwell, entry
took 1,877/1,975 ms host/guest. Both clients reused 18 exact witnessed programs;
uniform failures and pending counts were zero. Remaining maximum existing
native queries were 222.1/229.4 ms: selective reuse works, but it has **not**
removed the loading stall. The newly isolated opening draw measured
93.4/92.7 ms; watchdog draws were 71.0/45.1 ms. These are observations, not a
matched-seed speedup claim. Nighttime and broader-network acceptance remain open.

Both clients observed the full foreground 5,4,3,2,1 countdown, with zero page
errors, no black-frame rescue, zero hard snaps, and successful native Garage
return, room closure, and browser cleanup. Later 20-second gameplay samples
had maximum frame gaps of 42.3/44.9 ms. Both saved battlefield frames were
visually checked; the tank, world, and HUD rendered on native Apple Metal.

Sixteen focused entry/engine/FX/tool selftest commands, typecheck, public build,
and changed-module complexity gates passed (593 functions, zero violations,
zero explicit `any`/`unknown`). React Doctor's changed-file scan returned 49
with one `no-eval` finding on the existing source-execution selftest: the test
evaluates a fixed callback read from this repository, not external input or a
runtime client payload. Reviewed as a test-only false positive, with no rule
suppression. No new full-suite pass is claimed; the separately documented
T-90M preservation-receipt failure remains outside this multiplayer checkpoint.
