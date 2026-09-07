# Multiplayer entry and visible countdown — September 2026

## Scope

This change covers private/LAN and dedicated-adapter battle entry, the visible
five-second countdown, and covered recovery to Garage. It does not change
authority, vehicle geometry, network tick rates, or gameplay balance.

## Defects and corrections

1. **Countdown consumed by loading.** Previously READY preceded atomic visual
   activation, shader/first-frame verification, and loader fade. The authority
   correctly counted five seconds, but a slow first frame hid part of them.
   Entry now prepares the exact roster and initial snapshot, warms presentation,
   activates it atomically, verifies/paints the frame, and awaits loader fade
   before declaring READY. Gameplay remains authority-gated. Early peers see
   `WAITING FOR COMMANDERS / READY`; a late join displays the real remaining
   countdown (or live phase), never a fabricated new five seconds.
2. **Serial lazy initialization.** Battle-visual initialization ran before the
   parallel acquisition barrier. It now joins the module branch alongside world
   preparation and connection. Bridge creation still waits for all required
   initialization. Hosts still wait for collision before creating authority;
   guests can connect while constructing their own local world.
3. **Uncovered error recovery.** Failed entry uncovered rendering and hid the
   loader before restoring Garage. It now reacquires an opaque cover if needed,
   closes the owned match, restores Garage, allows its first paint, then fades.
   A failed restoration retains the opaque loader instead of exposing an
   incomplete scene. Private entry, rematch, dedicated entry, cancellation, and
   failures after reveal share this path.
4. **Late world activation after recovery.** A rejected sibling in acquisition
   could restore Garage while world acquisition still mutated the shared scene.
   Failure now settles that world operation before recovery, retaining the first
   error. It does not wait for a hung transport; late connections remain subject
   to the existing entry-abort publication check and teardown.

The HUD countdown controller owns only DOM state and its release timer. Hiding
the HUD clears waiting/countdown state and pending timers. Numeral animation
restarts only when the displayed second changes, not every frame.
Portrait phone layouts place the countdown below the initial minimap/chat
stack; the first phone capture exposed the previously obscured kicker.

## Verification

- Deferred-clock regressions model a 2,200 ms reveal and 230 ms fade before READY
  and verify that the authority still has its full 5,000 ms afterward.
- Late countdown/playing snapshots, delayed initialization, cancellation, and
  prime/fade/readiness failures are tested without changing authority policy.
- Deferred Garage/paint tests cover private, rematch, and dedicated entry before
  and after reveal, including exactly-once cleanup and failed restoration.
- Acquisition regressions test failure while the world is still pending, first
  error preservation, and an unrelated pending/rejected transport.
- `preBattleOverlay.selftest.mjs` verifies waiting, second deduplication, release,
  rematch/solo reset, and timer cancellation. It is registered in `npm test`.
- Run `node tools/multiplayer-guest-entry.mjs` for the real guest handoff and
  countdown; host-left and host-stall variants exercise browser recovery. This
  tool uses one actual rendered guest and a protocol host, not two rendering
  devices or a distant-network latency certification.

Recovered-tree checks passed: all 56 `src/net` selftest files plus seven
entry/HUD/failure/version suites (63 files total), `npm run typecheck` including
core-unused checks, and `npm run build`. The five focused typed entry/overlay
owners passed code-quality metrics with no complexity violations or explicit
`any`/`unknown`. React Doctor's changed-file scan reported four test-only
warnings (small array assertions and intentionally sequential failure cases),
no runtime findings; its repository score remained 49/100. This is not a claim
that the unrelated complete fleet test suite was rerun or that the whole
repository has a clean scanner score.

Fresh local browser verification passed on September 7, 2026, using the real
guest application, separate pristine Chromium contexts, local WebRTC/signaling,
Frosthollow 1v1, and the existing protocol-host regression harness:

| Scenario | Guest viewport | Entry receipt | World stage | Result |
| --- | --- | ---: | ---: | --- |
| Cold-entry cancellation | 800×600 desktop | 6,143 ms | 3,295 ms | Pass |
| Host closes | 390×844 emulated touch | 6,412 ms | 3,546 ms | Pass |
| Host stops authority, transport stays open | 390×844 emulated touch | 6,089 ms | 3,182 ms | Pass |

Every run recorded visible `5,4,3,2,1`, a nonblack initial frame without rescue,
no uncovered pre-battle frame, successful live-seat reload, no browser errors,
and an actionable Garage-return error after failure. The final phone screenshot
also confirms the countdown label is clear of chat. The stalled-host path
displayed `Host not responding` and completed its existing bounded recovery
policy in approximately 67.3 seconds; this change does not shorten that policy.
The additional mobile-layout selftest passed (51 representative viewport
contracts), bringing the selected top-level selftest total to 64.

Reproduce with `node tools/multiplayer-guest-entry.mjs --out=<qa-dir>`, adding
`--mobile --failure-scenario=host-left` or
`--mobile --failure-scenario=host-stall`. Use the shared capture queue and run
these GPU checks serially. The optional output saves the countdown timeline,
load/black-frame receipts, recovery report, and screenshot; transient captures
are not committed. These are local dev-server regression runs, not production
performance benchmarks or physical-phone/distant-network certification.

The displayed application version remains revision-derived by `tools/appVersion.ts`;
this commit changes the version label without an unrelated package-version bump.

## Performance evidence and remaining investigation

An earlier baseline on revision `12a5b9aec` used two pristine browser contexts,
desktop 1280×900 low graphics, M1A3 1v1, Frosthollow, local signaling/WebRTC,
and one Apple M5 Max machine. Recorded entry totals were 23,145 ms host and
25,235 ms guest; guest world preparation alone was 18,365 ms. One browser long
task lasted 9,578 ms while the last visible loading label was `Sealing
battlefield`. Both first-frame checks were nonblack. The host's first visible
five had only approximately 757 ms left after fade. Temporary raw capture files
were lost when that temporary worktree disappeared, so these are historical
observations, not a retained reproducible performance certificate.

The 9,578 ms task's exact function is **not yet proven**. The label spans more
than assembly: `ensureWorld` also synchronously compiles the world and warms
shadows before returning. The compile reaches one `renderer.compile` call;
shadow warm's top-level cohorts are whole terrain, vegetation, and props
subtrees. Those are inspection-based suspects, not measured attribution.
Next isolate assembly, forward compile, and shadow warm with timestamped partial
receipts, then profile the same scenario. Do not claim historical 214–319 ms
battle-frame stalls are explained by this separate cold-entry observation.

Entry stages overlap; do not add them together. Moving visual initialization
into the measured module stage changes what that stage includes. Compare the
same click-to-visible interval, viewport, cache state, renderer count, and
network conditions before making a speedup claim. This lifecycle fix is not a
claim of zero lag, a universal load-time budget, or perfect multiplayer.

## World-warm follow-up

`__WORLD_LOAD` now publishes copied stage snapshots at start, each boundary,
and completion/failure. `startedAt`, `endedAt`, and `stageIntervals` use the
page's `performance.now()` clock, so a long task must be attributed using its
`startTime`/duration overlap, not the UI label present when its observer callback
finally runs. Pending intervals omit `endTime`; failure closes the active stage
and retains available build timings. Telemetry exceptions cannot replace an
activation error or reject an otherwise successful load.

Inspection confirmed a redundant multiplayer-only warm: `entry.loadWorld`
previously compiled the world while Garage SpotLights were still attached,
before the initial authoritative weather was applied. Three's program key
contains the visible spot-light count. Later combat warm therefore prepares a
different light variant after Garage shutdown. The early shadow render is not
even a readiness guarantee for cached worlds: dormant world roots can still be
detached from the rendered scene until activation.

The candidate removes only that acquisition-time warm with
`ensureWorld(..., { precompile:false })`. Construction, collision/services,
cloud readiness, final battle-light/effect warm, real-frame validation, loader
fade, and the subsequent READY barrier remain unchanged. Global world defaults,
Solo, Studio, geometry, graphics quality, and transport policy are unchanged.
This must be accepted or rejected using the same two-app entry scenario and
total time/long-task/pixel evidence; moving cost to the final reveal is not a win.

### Retained two-renderer attribution baseline

The follow-up baseline uses the production build, two fresh cache-disabled
browser contexts, 1280×800/DPR 1/high graphics, native 1v1 room controls on
Frosthollow, and local in-memory signaling plus WebRTC. No endpoint or game-state
override is injected. Both clients' animation/render counters advance; neither
records background-service ticks. One peer per run has the opt-in statistical
CPU profiler. This is not a distant-network or production-latency certificate.

| Capture | Authority weather | Host entry / largest task | Guest entry / largest task |
| --- | --- | --- | --- |
| Baseline, host profiled | Clear/day | 7,815 / 1,602 ms | 7,857 / 1,720 ms |
| Baseline, guest profiled | Clear/night | 8,908 / 1,981 ms | 8,906 / 1,764 ms |

All four clients displayed the full foreground 5→1 countdown, had nonblack
reveal checks without rescue, and completed room/browser cleanup. Timings differ
with authority weather and profiler overhead; they are observations, not fixed
budgets. Transient raw reports are retained under `.qa-world-warm-r4/` in the
isolated worktree and deliberately excluded from source control.

In the first run, the host's 1,602 ms task lies wholly inside `shadowWarm`
(task 11,283.4–12,885.4; stage 11,280.0–12,956.3 on its page clock). The guest's
1,720 ms task likewise lies wholly inside that stage (task 6,172.2–7,892.2;
stage 6,164.1–7,966.2). Assembly took only 7/4 ms. Renderer/program counters and
the retained generated call chain localize these pauses to the first full-scene
offscreen render, not merely to the stale loading label or final assembly.

`warmShadowFrame → warmSceneOffscreen → renderer.render(scene, camera)` is a
complete render, not exclusively shadow work. Statistical samples cannot
separate shader linking, uniform discovery, buffer upload, driver synchronization,
and GPU execution. The profile also samples a separate early `new AudioContext`
cost; that must not be mislabeled as rendering. These findings do not prove the
cause of the lost 9,578 ms capture or historical 214–319 ms battle-frame stalls.

The first two candidate captures became unreadable on the CPU-profiled peer
(host, then guest), while the opposite peer remained responsive. Their profile
stop and room-cleanup receipts are incomplete. They are failed validation runs,
not speedup evidence or proof of an application crash. Timing-only observations
and explicit crash/command-failure classification are required before accepting
this candidate.

### Timing-only comparison and accepted warm order

`tools/production-private-room-ui.mjs --entry-profile=timings` records the same
bounded DOM/RAF/long-task observations without attaching the CPU profiler. Use
the shared capture-command FIFO. `--local-signaling` is opt-in and accepts only
a loopback frontend whose **built default** endpoint is loopback `/signal`;
production endpoint validation remains unchanged. It never overrides the app's
endpoint. Failures retain sanitized command categories and renderer-crash versus
app-exception event counts; intentional browser teardown is excluded.

The following native two-renderer runs all used clear/day authority weather and
high graphics during entry. `totalMs` includes the peer readiness barrier, not
the five-second countdown. The controls restored only the two candidate runtime
changes to the shipped revision; instrumentation stayed identical. Browser
contexts are fresh, but OS/driver shader-cache coldness is not guaranteed.

| Runtime | Host entry / largest task | Guest entry / largest task |
| --- | --- | --- |
| Shipped warm order (unprofiled control) | 6,855 / 1,162 ms | 6,626 / 955 ms |
| Skip early acquisition warm only | 5,599 / 1,034 ms | 5,491 / 761 ms |
| Also compile before effects | 4,901 / 319 ms | 4,899 / 584 ms |

The combined change keeps the final battle-light compile but moves it after
wreck-material hook installation and **before** the opening-effects compositor
draw. Previously that full-scene compile happened after the first complete
effects draw, too late to spread its program preparation. The late FX/scar
compile and actual compositor submission remain intact. `wreckWarm` now has its
own timing stage, so the new `combatWarm` is not directly comparable to the old
combined wreck/effects stage. All progress remains monotonic. Cancellation during
the compile boundary cannot reach effects, activation, reveal, or READY; a
driver compile failure retains the existing real-render fallback.

Every timing-only run above showed foreground 5→1 on both peers, unchanged
nonblack reveal measurements (109.968/137.073) without rescue, zero renderer
crashes/app exceptions, and verified room/browser cleanup. Visual runs also
exercised native movement and four confirmed shots per peer, including four
locally predicted guest shots without duplicate confirmation. That later combat
probe deliberately selects the existing low-preset benchmark and must **not** be
represented as high-preset gameplay certification. Its 20-second samples still
had frame-gap maxima of 45.6/70.3 ms (skip-only) and 72.3/44.3 ms (combined), with
zero hard snaps. First-person/view-dependent visual quality and historical
network/frame tails are not solved by this entry-only change.

Residual loading pauses remain: the combined run's maximum RAF gaps were
548.3/587.2 ms despite shorter largest tasks. These numbers are evidence of an
improvement, not a promise of hitch-free loading. Future work should separate
remaining first-use shader/reflection/upload and task-coalescing costs using
absolute stage intervals; do not remove the final warm/reveal checks or reduce
graphics quality to satisfy a timing threshold.

An independent combined-order repeat received clear/night authority weather.
Host/guest entry was 5,249/5,045 ms, with largest tasks of 649/652 ms and maximum
RAF gaps of 833.0/655.3 ms. Both retained foreground 5→1, nonblack night reveal
measurements of 15.5814/18.8902 without rescue, zero background-service ticks or
browser exceptions/crashes, and verified room/browser cleanup. This night run
is not a like-for-like comparison against the unprofiled day control; it also
demonstrates that the shorter day-run pauses are not a universal upper bound.

Follow-up verification passed 21 focused selftest entrypoints, including the
new observer and failure-evidence tests imported by the registered production-UI
suite. Typecheck/core-unused checks, production builds, and diff checks passed.
Six changed runtime/tool owners passed code-quality metrics (310 functions,
zero complexity or explicit any/unknown violations). The changed-file React
Doctor scan reported 91/100 with one test-only array-lookup warning and no runtime
findings. Independent read-only review found no blocking lifecycle, endpoint,
diagnostic-bound, or cleanup issues. This does not claim a fresh full-fleet test
run, production deployment verification, or physical-device/network coverage.

### Production confirmation of the combined warm order

On September 7 the public site exposed revision `43f3e4651`. A fresh native
two-client test against `https://cot.kevinliu.studio/`, its built-default
Cloudflare signaling, and WebRTC passed without endpoint/state overrides.
Both cache-disabled 1280×800/DPR 1 clients used high graphics, clear/day
Frosthollow, displayed foreground 5→1, passed the nonblack check without rescue,
and returned through native room exit. Room deletion and browser cleanup were
verified; no page exceptions or renderer crashes were recorded.

| Production peer | Entry total | Largest long task | Maximum RAF gap |
| --- | ---: | ---: | ---: |
| Host | 5,429 ms | 322 ms | 593.5 ms |
| Guest | 5,261 ms | 369 ms | 592.4 ms |

This confirms the deployment and entry behavior, **not** hitch-free animation.
The capture is entry-only, not a new movement/shooting or distant-network
certificate. Its retained local report is `production-timings-r4/report.json`
under the excluded QA directory.

### Cooperative particle-atlas preparation

The next source-level defect is pre-paint work coalescing: resolving a promise
inside `requestAnimationFrame` resumes its continuation before repaint. The
network opening-effects warm previously synchronously drained the six-atlas
procedural bake before its first yield. The existing chunked method could not
be substituted directly because its default waits for optional image loads and
decode, which may remain unresolved. These are confirmed execution contracts,
not proof that either alone explains the historical frame-stall measurements.
See MDN's [animation callback timing](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
and [scheduler task continuation](https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield).

Network entry now crosses an animation callback **and a following task** before
texture preparation and before the atomic effects draw. Its atlas generation
uses the existing seeded generator with an 8 ms cooperative budget, preserving
image dimensions, texture identities, material quality, and bake order. This
budget is checked between existing tiles; it is not an 8 ms maximum-task
guarantee. `nextPaintFrame` offers a rendering opportunity, not a displayed-frame
or GPU-completion acknowledgement. The legacy `nextFrame` implementation and
unrelated callers are unchanged; its hidden-document fallback remains bounded.

The opt-in `{ assets: 'ready-only' }` policy uses already-decoded atlases or
generates them without starting/waiting on image requests. Default Studio asset
preloading is preserved. Once a generator starts, late decoded assets or a
concurrent warmer cannot replace part of its output. After preparation, scar
attachment, effect staging, late-layer compilation, the real compositor draw,
and cleanup remain atomic. The verified reveal/fade still precedes READY.

A rejected scheduling yield now rejects only that caller. It does not discard
the shared generator: another suspended caller or a retry completes the same
seeded bake. The regression first reproduced a concurrent caller reporting
success with incomplete textures, then verifies complete output and exact
generator-level pixel/Canvas-command parity with a synchronous reference.
Actual generator-execution exceptions retain their existing handling; this is
not a general recovery guarantee for a failing Canvas implementation.

The accepted local candidate and an immediately following synchronous-warm
control both passed native high-preset, clear/day, two-client entry, foreground
5→1, nonblack/no-rescue reveal, native exit, and verified room/browser cleanup.
The control changed only the network warm call back to synchronous preparation
plus `nextFrame`; the candidate call was restored afterward.

| Run | Host entry / largest task / maximum RAF gap | Guest entry / largest task / maximum RAF gap |
| --- | --- | --- |
| Chunked preparation | 6,477 / 535 / 537.1 ms | 6,489 / 645 / 696.7 ms |
| Synchronous control | 6,231 / 671 / 985.8 ms | 6,114 / 836 / 940.1 ms |

These observations support reduced task coalescing in this comparison, **not a
total-load-time speedup or a stable frame-budget certificate**. World acquisition
alone varied by about 300 ms; other tasks had active browsers on this machine,
and OS/driver cache state was uncontrolled. Residual half-second pauses remain.
Reports are `candidate-c-timings-final` and `candidate-c-control-timings` in the
excluded QA directory. An earlier candidate visual/combat run disconnected from
the browser after entry and could not verify room cleanup; its multi-second
pauses are retained as failed evidence, not attributed to this change. Another
rerun failed in guest invitation before effects preparation, then cleaned up
successfully. Neither failed run is counted as a pass. The owned in-memory
signaling server was restarted before the accepted candidate/control pair.

Focused scheduler, texture, warm/reveal, cancellation, Garage return, countdown,
barrier, launch, version, and import-integrity checks passed (21 selftest
entrypoints), as did typecheck/core-unused, public builds, and diff checks.
Four changed runtime owners passed quality metrics (287 functions, no complexity
or explicit any/unknown violations). Independent review checked atlas ownership,
late decode, scheduling rejection, deterministic retry, and atomic draw cleanup.
The Node texture parity probe is not native Canvas rasterization/GPU upload
certification. This follow-up does not claim a full-fleet suite, clean combat
performance run, distant-network test, or explanation of historical 214–319 ms
battle-frame stalls.

The changed-file React Doctor scan remained 84/100 across this follow-up's
initial and final scans, with six test-only warnings and no runtime findings.
The flagged timer lookups follow exact timer-list assertions; sequential tests
own global timer fixtures, and the microtask loop deliberately advances promise
continuations. The remaining membership lookup checks six fake images, not a
render loop. No scanner rules were suppressed. This score is not comparable to
the earlier 91/100 scan of a different changed-file slice.

Next throughput experiment: start optional atlas preloading when the existing
network-only FX acquisition resolves, while world acquisition is still pending.
Keep that promise outside readiness barriers, catch synchronous/asynchronous
preload failure, and preserve the ready-only fallback. This is not implemented
by the cooperative-warming slice and must separately prove no passive Garage
work and no delay from hung downloads.

### Production C follow-up and overlapping optional atlases (D)

Production revision `c7089f069` passed the native two-client entry/exit check
(`production-c-timings-r5`): both peers saw foreground 5→1, the battlefield
was nonblack without rescue, no application errors or browser failures were
recorded, and the private room/browser were cleaned up. This was functional
entry evidence, not a performance pass:

| Peer | Entry | Largest task | Maximum RAF gap | Effects warm |
| --- | --- | --- | --- | --- |
| Host | 7,998 ms | 1,445 ms | 1,447.9 ms | 1,018 ms |
| Guest | 7,952 ms | 945 ms | 946.8 ms | 1,030 ms |

The largest tasks followed the effects progress label and ended around the
first Ready/battle callback. They did not overlap world construction or the
earlier scene-compile interval. The host task exceeded the entire recorded
effects duration: it spans more than texture preparation, so blaming the
whole stall on texture generation is unsupported. The old network receipt
retained rounded durations only; progress labels and callback counters cannot
attribute individual render calls precisely. The historical 214–319 ms combat
stalls remain a separate, unproven cause.

The next narrow change starts optional atlas downloads/decode when the existing
network-only FX runtime resolves. Required FX construction stays in the module
barrier; the optional promise does not. A hung request, synchronous preload
throw, or rejected preload cannot hold up world acquisition, reveal, or READY.
Covered warming uses the existing ready-only policy: reuse a complete decoded
batch or cooperatively generate the seeded fallback. No extra Garage work,
frame-loop work, image quality changes, or network protocol changes are added.

The regression executes the actual composition-root callback and first failed
because no download started while the world was pending. It now covers ready,
hung, synchronously throwing and rejected image work, as well as fatal FX
construction failure and the network-only lazy boundary. An older source guard
was refreshed to match the already-existing concurrent battle-visual loader.

The network receipt now also retains absolute page-performance intervals for
its ten fixed stages, plus activation, black watchdog, first reveal and loader
fade. Pending operations remain open; success/failure closes their intervals.
The observer exports only allowlisted names and finite numeric timestamps, with
each interval array capped at 32. This adds no renders, GPU queries or yields.
Tests cover pending/failing reveal, original application error identity under
the normal clock, caught watchdog failure, and bounded/malformed exports.

Two native local-loopback, fresh-context, high-preset 1v1 runs passed entry,
foreground 5→1, nonblack/no-rescue reveal, live input/snapshot progress, native
Garage exit and verified room/browser cleanup, with no application exceptions:

| Run / conditions | Host entry / largest task / max RAF gap | Guest entry / largest task / max RAF gap |
| --- | --- | --- |
| D visual, clear/day | 5,195 / 671 / 674.3 ms | 5,195 / 549 / 617.4 ms |
| D host CPU profile, clear/night | 5,681 / 702 / 705.3 ms | 5,705 / 721 / 723.9 ms |

The visual run's effects preparation was 373/209 ms. The profile run, rebuilt
with the new interval receipt, measured 462/507 ms. Different lighting, active
foreign renderers, cache state and profiler overhead prevent an attributable
speedup claim versus production C. The later visual-run combat probe explicitly
switched to LOW: 20 seconds per foreground role reached 49.6/84.8 ms maximum
frame gaps. It is not a HIGH-preset or stable-frame-budget certificate.

The exact profile receipt locates the host's 702 ms task across 443.5 ms of
effects preparation, 6.2 ms of activation and 252.1 ms of black watchdog. The
guest's 721 ms task similarly spans 488.6/6.4/225.8 ms. Separate 441/339 ms
tasks fall wholly inside loader fade, after first reveal resolved. Consequently,
faster atlas preparation alone cannot remove these stalls. The sampled CPU
profile is not GPU timing; its 276.7 ms largest sample gap and clock-alignment
uncertainty also prohibit precise per-function attribution. Follow-up should
isolate final-camera draw/program initialization and the watchdog's synchronous
readback while preserving safety checks and the covered reveal barrier.

Fifteen focused test entrypoints, typecheck/core-unused, the public build and
diff checks pass. Independent review found no warm-order, ownership or privacy
regression. The changed-file React Doctor scan is 49/100 with one test-only
`no-eval` finding: the Node regression executes a callback extracted from this
repository's trusted source, not user/network input or browser runtime. This is
a high-confidence false positive; no rule was suppressed. Its earlier optional
test lookup warning was resolved with an explicit membership assertion. Scanner
scores across differently scoped slices are not comparable. No full-fleet suite,
separate-device or distant-network claim is made. QA captures remain excluded
from the commit; the historical combat-stall cause remains unproven.

Production D (`84246dce3`, exact served version checked before the run) also
passed native production signaling/invite/launch, foreground 5→1 for both peers,
nonblack/no-rescue reveal, live input/snapshot progress, native Garage exit and
verified room/browser cleanup, with zero application errors. This was two
fresh contexts on one machine, HIGH, clear/day, Frosthollow:

| Peer | Entry | Largest task | Maximum RAF gap | Effects / watchdog / fade |
| --- | --- | --- | --- | --- |
| Host | 7,638 ms | 1,286 ms | 1,289.4 ms | 921 / 375.1 / 597.4 ms |
| Guest | 7,625 ms | 1,323 ms | 1,326.8 ms | 933 / 401 / 527 ms |

This remains a functional pass, not a smooth-loading certificate. Production
captures are retained as `production-d-timings` in the excluded QA directory.
No separate-device/distant-network or historical-combat-stall conclusion follows.

The local D CPU profile additionally points to deferred damage-panel masks:
`networkBattleActivationRuntime` calls `damagePanel.setTank`, which calls
`tankThumbs.getTopDownMasks`. Its timer performs separate hull/turret renders and
synchronous 384×384 readbacks using a shared renderer/target/pixel buffer. The
mask chain has about 442 ms inclusive sampled weight (436 ms below
`renderMaskPixels`), making it a strong candidate for the host's 441 ms fade
task, not proof of exact GPU duration. Existing effects warm and shot-card warm
do not explicitly prepare these masks. Next measure the transaction and each
render/readback, then consider awaitable covered preparation, yielding only
between completed passes after restoring renderer state and consuming shared
pixels. Preserve per-spec pending/cache ownership and shared-resource lifetime;
moving the timer later would merely move the hitch into countdown or gameplay.

### Covered damage-panel masks (E)

An instrumented, behavior-unchanged baseline (`mask-baseline-timings`, local
loopback, two fresh HIGH/clear/day Frosthollow clients) confirms a specific fade
stall. The host mask timer occupies a 335 ms task; the guest occupies a 480 ms
task. Absolute intervals locate both wholly inside loader fade. Hull render
took 307.7/401.8 ms, hull readback 7.8/20.2 ms, turret render 12.0/24.7 ms and
turret readback 3.7/27.4 ms. These are main-thread operation durations, not GPU
timings. Most of this particular pause is first-render preparation rather than
the pixel copy. Whole-entry maxima were still 767/491 ms (RAF 768.2/548.7 ms),
so removing masks from fade does not explain every loading stall.

The player panel now exposes nonmutating, awaitable cache preparation. Private,
LAN and dedicated-adapter entry await the exact viewer entity's masks under
the opaque loader, before final scene/effects warm and atomic activation.
Spectators skip that player-only step. Abort checks bracket it; synchronous
`setTank` adopts completed masks without scheduling GPU work during reveal.
The shared lazy API still serves solo callers. No authority or countdown policy
changes, eager Garage warming, geometry edits or image-quality reductions occur.

Mask programs compile with the actual unlit scene, camera and target, then
restore target/cube face/mip before bounded readiness polling. Unlike the pinned
Three.js `compileAsync`, the poll owns exact program references rather than
re-reading mutable material properties. It detects context loss and destroyed
programs, preserves failures and stops after five seconds. This avoids the
native timer's uncaught exception/hung promise when Garage cancellation disposes
the source materials; another world render cannot substitute a ready program.
The [renderer API's asynchronous compilation guidance](https://threejs.org/docs/pages/WebGLRenderer.html#compileAsync)
motivated preparing programs before their first mask draw, but its native timer
is not reused. Borrowed programs are never disposed by the mask owner.
Both 384×384 RGBA passes retain their exact camera, alpha threshold, row flip,
plan bounds and 192×192 downscale. A small WebGL2 pixel-pack-buffer/fence owner
submits each readback, restores bindings before yielding, polls at 4 ms with a
five-second deadline, then copies and releases the buffer/fence on every exit.
The pinned Three.js async readback was inspected but not reused: it leaves its
PBO bound across polling and lacks rejection cleanup. Dependencies are unchanged.

Different tank preparations serialize through both passes and canvas copies;
same-ID callers join one promise. Pending ownership is separate from the bounded
completed cache so eviction cannot launch overlapping work into shared pixels.
Borrowed hierarchy clones never dispose the live vehicle's geometry/materials;
source-disposal listeners cover queued time and every asynchronous pass boundary,
and detach on settlement. Owned factory fallback builds dispose even when
rendering or callbacks fail.
Clone-only instanced buffers and batched geometry/control textures are explicitly
released after pending work drains. Batched control data is detached in the
synchronous native-clone transaction, with original data identities/upload
versions restored even on cloning failure; colored batch controls are preserved.
Source invalidation does not negatively cache the spec, so the next match can
prepare the same tank from its fresh visual. Ordinary GPU failures retain the
bounded negative-cache policy.
Failure retains the existing vector fallback. Diagnostics export only the latest
transaction's allowlisted finite stage clocks, capped at 16 intervals—no tank
identity, room data, URLs or raw error contents.

Candidate E's first local entry run (`mask-async-timings-visual`) confirmed that
both masks finished before activation, with no mask work in fade. Hull draws
were 2.0/2.0 ms and turret draws 1.2/1.3 ms, versus the baseline's hundreds of
milliseconds. Entry took 5,948/5,778 ms; largest tasks were 474/438 ms and RAF
gaps 477.9/440.5 ms. Both peers showed the full foreground 5→1 countdown and
nonblack reveal without application exceptions. However, the subsequent LOW
combat/feedback probe failed without a classified diagnostic or completed
performance receipt. Browser cleanup succeeded but room cleanup was not
verified. That entire run is a failure, not a performance certificate.

The entry-only repeat (`mask-async-repeat-timings`) passed native Garage exit,
room/browser cleanup, countdown, nonblack reveal and zero application errors.
Mask draws remained 2.4/2.5 ms and 1.5/1.8 ms. It nevertheless reached a separate
2,236/2,234 ms black-watchdog interval, 2,967/2,974 ms largest tasks and
2,970.6/2,976.5 ms RAF gaps (entry 8,675/8,452 ms). Thus removing the mask hitch
is not evidence that all loading is smooth. The watchdog's final-camera draw
and synchronous readback remain candidates requiring finer operation-level
instrumentation; these intervals do not establish a unique cause. Neither run
used separate devices, distant networks or relay-only transport, and neither
explains the historical combat stalls. Both preceded the final bounded-program
poll and source-lifetime hardening.

Regression coverage includes exact pixels/cameras and borrowed-source pose,
per-ID coalescing, more than ten pending jobs, completed/failed cache eviction,
callback exceptions, program replacement/destruction, context loss, timeout,
null/OOM PBO allocation, binding restoration and cleanup. A failed renderer
restore still drains a submitted readback before releasing shared pixels to
the next job. The existing observer and browser-failure tests now have explicit
suite entries instead of hidden imports, satisfying the repository's exactly-one
lifecycle-owner rule. Temporary profiles, screenshots and room artifacts are
not release contents.

The full `npm test` attempt did not pass: its pre suite stopped in the unchanged
`src/vehicles/fleetLazy.selftest.mjs` child-process fleet sweep at the existing
240-second timeout (`ETIMEDOUT`, no failed assertion). This slice changes no
vehicle builders or that test, and no timeout was weakened. Machine contention
was present during verification, but its contribution was not isolated. The
focused multiplayer/UI checks and full application typecheck are separate
passing evidence, not substitutes for a claimed full-suite pass.

Final typed metrics over the four changed mask/presentation owners report 113
functions, zero complexity violations, zero explicit `any` and zero `unknown`.
The staged-file React Doctor scan is 87/100 over 14 files: all 25 warnings are
in tests, with no runtime finding. Sequential fake-clock/failure scenarios must
settle before the next shared fixture; short event-array projections improve
assertion readability; JSON roundtrips verify the observer's transport/cross-VM
boundary. These reviewed test-only warnings were not suppressed. The earlier
89/100 scan covered only nine already-tracked files, so it excluded the new
regression fixtures and is not a like-for-like regression score.
