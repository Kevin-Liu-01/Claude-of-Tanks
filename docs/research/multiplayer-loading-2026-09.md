# Multiplayer entry and visible countdown — September 2026

Follow-up: [exact-output props construction reductions and cold two-client
comparison](multiplayer-props-loading-2026-09.md). These reduce loading work;
they do not establish that historical gameplay stalls are solved.

Further investigation: [remaining native pauses and post-processing sizing
reuse](multiplayer-post-sizing-2026-09.md), including unchanged-build variation
and the separate countdown/reveal correctness gates.

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

Mask programs compile with the actual mask scene, camera and target, then
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

The final bounded-program/source-lifetime build (`f9b5549d1`,
`mask-final-timings-visual`) passed the complete native local two-client run:
invite, ready/launch, foreground 5→1 for both peers, masks complete before
activation, nonblack/no-rescue reveal, advancing input/snapshots, native Garage
exit and verified room/browser cleanup. There were zero application errors.
The screenshots show populated tank/module masks and the battle HUD without a
black reveal. Entry used HIGH, clear/day, Frosthollow, on one machine with local
loopback signaling:

| Peer | Entry | Largest task / maximum RAF gap | Panel preparation | Watchdog / fade |
| --- | --- | --- | --- | --- |
| Host | 4,527 ms | 544 / 545.2 ms | 92.5 ms | 148.3 / 231.5 ms |
| Guest | 4,402 ms | 421 / 422.2 ms | 140.0 ms | 181.2 / 248.8 ms |

Hull mask draws were 1.5/1.9 ms and turret draws 0.9/1.2 ms, with no mask work
in fade. Readback wall time includes yielded fence polling and is not GPU time.
The subsequent interaction probe explicitly used LOW, with two loaded/rendered
contexts and 20 seconds per foreground role, measured sequentially. Host frame
gaps were p50/p95/p99/max 21.9/28.8/35.9/47.1 ms; guest gaps were
21.0/35.5/42.9/57.1 ms. Both reported zero hard snaps, dropped input history,
estimated missing snapshots and observer failures. Native windows were restored
and sessions detached. These are functional and bounded observation receipts,
not consistent frame-budget, HIGH combat, relay, separate-device or historical
combat-stall certificates. The remaining watchdog pause still needs finer
render/readback attribution.

Production E served exactly `v1.0.0+gf9b5549d1` before the native live test
(`production-e-timings-visual`). The complete run passed production room
creation/invite, ready/launch, both foreground 5→1 countdowns, nonblack/no-rescue
reveal, live input/snapshot progress, interaction sampling, native Garage exit,
and verified room/browser/window cleanup, with zero application errors.
Both player masks finished before activation, and inspected screenshots show
their populated panel silhouettes. This again used two fresh contexts on the
same machine, HIGH clear/day Frosthollow entry:

| Peer | Entry | Largest task / maximum RAF gap | Panel preparation | Watchdog / fade |
| --- | --- | --- | --- | --- |
| Host | 7,777 ms | 1,494 / 1,494.3 ms | 706.4 ms | 214.4 / 231.0 ms |
| Guest | 7,645 ms | 1,481 / 1,482.5 ms | 708.4 ms | 213.5 / 230.8 ms |

Hull draws stayed at 1.7/1.9 ms and turret draws at 1.0/1.3 ms, with no mask
work in fade. Program-preparation intervals were approximately 657 ms for the
hull; these include asynchronous readiness waiting and are not synchronous-task
or GPU durations. Wreck warm occupied 1,506.7/1,492.2 ms and effects preparation
1,246.0/1,254.1 ms. The runtime is functionally verified, but loading is not
uniformly smooth and no end-to-end speedup is claimed from this noisy comparison.

The separate LOW gameplay sample used 20 seconds per foreground role with two
rendered contexts. Host frame p50/p95/p99/max was 23.3/31.5/42.6/53.6 ms; guest
was 20.7/28.8/38.6/45.9 ms. Both reported zero hard snaps, dropped history,
estimated missing snapshots and observer failures. This is not a stable 60 Hz,
larger-room, relay-only or separate-device certificate. This run's room was
closed and owned browsers/servers stopped; excluded QA artifacts remain local.

## Covered scene watchdog: synchronous GPU waits and cancellation

The next measured local baseline (`watchdog-baseline-timings`, based on
`bc4f36ac9` with timing-only instrumentation) used two fresh contexts, HIGH,
clear/day Frosthollow and loopback signaling. It passed native entry, both full
5→1 countdowns, nonblack/no-rescue reveal, input/snapshot progress, Garage return
and room/browser cleanup with zero application errors. Unlike the historical
samples, this receipt separates the actual watchdog draw from pixel readback:

| Peer | Watchdog draw | Synchronous readback | Watchdog total | Entry / largest task |
| --- | --- | --- | --- | --- |
| Host | 54.8 ms | 69.5 ms | 124.8 ms | 4,851 / 562 ms |
| Guest | 58.9 ms | 86.4 ms | 146.1 ms | 4,667 / 409 ms |

Program counts did not change during either diagnostic draw (245 and 207).
That excludes new program creation in those measured intervals, not lazy
uniform initialization, native driver work or GPU queue synchronization. It
does not establish the cause of historical combat stalls.

The candidate shares the existing bounded RGBA8 pixel-pack-buffer helper
between player-panel preparation and an asynchronous healthy-scene probe.
Bindings are restored before yielding; every submitted fence is settled before
its target is disposed. Entry cancellation is checked before any subsequent
scene access. Compatibility settings never remain tentatively changed across
an await: a black/unreadable sample, or changed shadow/environment/fog state,
triggers a fresh synchronous compatibility check. Failed rescue measurements
now roll back their tentative quality changes; a successfully confirmed rescue
survives consumer diagnostic callback failure.

Network entry awaits the check under the loader and checks cancellation before
releasing loading audio, displaying Ready, priming/fading or sending READY.
A known failed graphics receipt stays covered and goes through existing
Garage recovery. Ordinary optional diagnostic exceptions retain their previous
best-effort behavior. This adds no per-frame work, changes no match authority,
and does not lower scene quality.

Candidate A (`watchdog-async-a-timings-visual`) passed the complete native local
pair and inspected screenshots, but exposed a remaining synchronous setup
wait: its enqueue took 95.7/96.4 ms despite the subsequent 31.1/54.0 ms being
yielded fence waits. Watchdog totals were 233.5/231.4 ms; this is not evidence
of a watchdog speedup. Entry was 4,384/4,262 ms with largest tasks 384/348 ms;
different preparation/driver timing prevents attributing those end-to-end
differences to this candidate. The separate 20-second-per-role LOW interaction
sample reported max frame gaps 47.4/44.8 ms and zero hard snaps, dropped history,
estimated missing snapshots or observer failures. These same-machine samples
are functional checks, not a consistent frame-budget or remote-network certificate.

The instrumented repeat B (`watchdog-steps-b-timings`) isolated that enqueue
stall: `getBufferParameter(BUFFER_SIZE)` took 70.6/66.5 ms out of
70.8/66.6 ms submission. Other submission operations were 0–0.1 ms. The fix
keeps the allocation check, but performs it after the fence signals and before
copying/accepting pixels. A post-query deadline/context check prevents a slow
query from authorizing a late copy. Allocation failures are now reported after
the fence (or an earlier terminal timeout/context failure), with untouched
destination bytes and bounded cleanup. No `getError()` state is consumed.

Final local candidate C (`watchdog-final-c-timings-visual`) passed the same
complete native pair and inspected screenshots with zero application errors:

| Peer | Watchdog draw | Enqueue | Yielded/read completion | Size query | Entry / largest task |
| --- | --- | --- | --- | --- | --- |
| Host | 74.7 ms | 0.1 ms | 75.3 ms | 0.1 ms | 4,870 / 472 ms |
| Guest | 61.4 ms | 0.1 ms | 87.1 ms | 1.8 ms | 4,774 / 309 ms |

The lower-band luminance exactly matched the earlier candidates:
109.96803977272727 / 137.07291666666666, with no rescue or new watchdog
programs. Both masks completed before activation; both foreground countdowns
showed 5→1; native Garage return and room/browser/window cleanup passed.
Submission no longer contains the measured blocking size query. Watchdog wall
time still includes real rendering and yielded GPU waits (150.6/149.2 ms total),
and there is no claimed end-to-end loading speedup from these noisy samples.
Nested timing fields overlap and must not be summed as independent CPU costs.

The separate LOW 20-second-per-role interaction sample reported host
p50/p95/p99/max frame gaps 21.9/27.8/34.1/49.9 ms and guest
21.5/31.0/39.0/44.5 ms. Both had zero hard snaps, dropped history, estimated
missing snapshots and observer failures. Larger rooms, other weather/times,
remote devices, relay-only paths and the historical combat stall cause remain
outside this receipt.

Focused readback, mask, device, presentation, entry cancellation, launch,
production-UI harness and observer checks pass, including 25 synchronous and
33 asynchronous watchdog cases. The suite index verifies 687 registered checks;
that is not a claim that the full suite passed. The previous full-suite fleet
timeout documented above remains unresolved and was not weakened. Application
typecheck, unused-owner check and public production build pass. Four changed
runtime owners have 184 functions, zero complexity violations and no explicit
`any`/`unknown`. Final changed-file React Doctor is 88/100 over 13 files, with
14 reviewed test-only warnings (sequential fixture isolation, short assertion
projections and serialization-boundary checks), none suppressed. The clean
baseline scan skipped source analysis; an intermediate scan had incomplete
maintainability output, so no like-for-like score improvement is claimed.

### Production verification of the yielded watchdog

Production served exactly `v1.0.0+g40f93855d` before the fresh native two-client
run (`production-watchdog-c-timings-visual`). Production room creation/invite,
ready/launch, both foreground 5→1 countdowns, complete masks before activation,
nonblack/no-rescue reveal, advancing input/snapshots, native Garage return and
verified room/browser/window cleanup all passed, with zero application errors.
Both inspected screenshots show the rendered battlefield and populated player
panel masks. This was HIGH clear/day Frosthollow entry on one machine:

| Peer | Entry | Largest task / maximum RAF gap | Watchdog draw / enqueue | Watchdog total / fade |
| --- | --- | --- | --- | --- |
| Host | 4,745 ms | 324 / 326.2 ms | 78.5 / 0.1 ms | 208.3 / 230.5 ms |
| Guest | 4,597 ms | 315 / 318.1 ms | 80.6 / 0.1 ms | 211.4 / 231.0 ms |

Luminance again exactly matched the local candidates, with unchanged watchdog
program counts. Submission remained 0.1 ms for each peer, but completion is
**not guaranteed stall-free**: the guest's post-fence buffer-size validation
still took 53.7 ms (host 0 ms). Its enclosing 130.1 ms completion interval
includes that synchronous query and yielded waiting; it is not wholly yielded
time or a GPU-duration measurement. Moving the validation removed the observed
submission stall, not every possible driver query stall. Wreck warm was
123.2/123.0 ms, panel preparation 101.2/103.0 ms, scene compilation 322.8/319.3 ms
and opening effects 167.7/163.8 ms. Loading still has material pauses, and these
noisy samples do not establish an end-to-end speedup or the historical combat
stall cause.

The separate LOW interaction sample used two rendered contexts and 20 seconds
per foreground role, measured sequentially. Host frame p50/p95/p99/max was
21.9/27.6/31.6/39.1 ms; guest was 21.5/28.7/35.2/47.7 ms. Both reported zero hard
snaps, dropped input history, estimated missing snapshots and observer failures.
The functional runner has no frame-budget assertion. This is not stable 60 Hz,
HIGH gameplay, a larger-room/long-session test or a separate-device/distant/
relay-only network certificate. Production artifacts remain local and excluded
from the release. The full-suite timeout limitation above still applies.

### Scene submission and readiness-query audit

The next scoped probe separates target binding, native submission, restoration,
extension lookup, and readiness queries. Numeric-only receipts are bounded by
the production entry observer; time spent yielding is excluded from synchronous
query totals. Counts distinguish native queries from scheduler polling rounds.

On `98b24722c` plus timing-only instrumentation
(`scene-compile-baseline-timings`), native shader submission took 51.9/52.6 ms
for host/guest. The first polling round took 127.9/227.6 ms. That initial receipt
did **not** distinguish extension lookup from individual program queries.
Both peers added exactly 81 scene programs (136→217 and 98→179).

The candidate submits original renderables in bounded native batches against
the real scene, camera and HDR target. It includes hidden descendants and
multi-material/instanced variants without reparenting, cloning, mutating their
visibility or eagerly initializing uniforms. Target/cube-face/mip state is
restored before every yield. One renderer-lifetime owner spans submission,
the pre-poll checkpoint and readiness checks; cancellation preserves its original
reason, and context/owner invalidation stops stale work. The synchronous Studio
and ordinary subtree compile paths retain their existing behavior.

Candidate A (`scene-compile-sliced-a-timings`) used rAF checkpoints. It passed
the full native entry/return scenario, but was **not** a loading speedup:
entry was 5,783/5,639 ms, with largest tasks 753/754 ms. Submission totals were
99.8/97.4 ms in 9/10 scheduler slices, largest slice 17.0/20.4 ms. Compilation
wall time was 372.9/331.0 ms and both polls reached their 24-yield bound. Each
native batch repeats Three's full-scene light traversal, so batching overhead
must be measured, not assumed free. Other loading stages also slowed in this
run; those differences cannot be attributed solely to shader submission.

Candidate B (`scene-compile-sliced-b-timings-visual`) added a task boundary
after the final submission and detailed query timing. Native entry, both
foreground 5→1 countdowns, completed panel masks before activation, nonblack
reveal, advancing network traffic, native Garage return and room/browser/window
cleanup passed with zero application errors. Both inspected screenshots show
the battlefield, vehicle and populated panel. The exact scene luminance and
81-program increases matched the baseline. Entry was 4,662/4,563 ms; largest
tasks were 567/335 ms. Submission was 52.0/58.6 ms, largest slice 16.3/14.5 ms.
However, extension lookup cost only 0.1/0.0 ms, whereas completion queries took
135.4/303.3 ms total, including single calls of **113.8/277.0 ms**. This identifies
a concrete loading stall in `getProgramParameter(COMPLETION_STATUS_KHR)` on this
browser/driver, not the cause of the earlier historical combat stalls. A paint
opportunity alone did not eliminate it. Compile wall time was 304.9/374.5 ms.

The B LOW interaction sample (20 seconds per foreground role, sequential roles
with two rendered contexts on one machine) reported p50/p95/p99/max frame gaps
of 25.5/33.8/39.8/46.6 ms and 25.7/37.8/47.0/59.0 ms. Hard snaps, dropped history,
estimated missing snapshots and observer failures were zero. This remains a
functional sample, not stable 60 Hz or an end-to-end performance certificate.

The follow-up experiment places a bounded, zero-timeout WebGL2 fence poll
before shader-readiness queries. This gives queued GPU commands time to drain;
it does not infer shader readiness from fence completion. Existing KHR checks
remain in place, including the unsupported/failed/timed-out fence fallback.
The rationale follows MDN's [WebGL blocking-call guidance](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#avoid_blocking_api_calls_in_production)
and [zero-timeout sync status API](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/clientWaitSync).
Candidate C (`scene-compile-fence-c-timings-visual`) passed the same native
lifecycle scenario, but used clear/night instead of B's clear/day. The screenshots
show a rendered night battlefield and populated masks; luminance was 15.58/18.89
with no rescue, and the scene still added 81 programs per peer. Its submission
slices peaked at 9.6/13.2 ms. The fence took 146.7/344.7 ms of wall time, followed
by 27.3/132.5 ms of KHR queries; the largest individual query was 15.8/75.7 ms.
Compile wall time was 241.7/546.1 ms and entry was 4,889/4,796 ms. The LOW
interaction sample reached 49.3/45.9 ms maximum frame gaps, with no hard snaps,
dropped history, estimated missing snapshots or observer failures.

**Release decision:** the extra submission fence is not shipped. Different
lighting and mixed host/guest results do not establish a speedup; fence completion
also did not eliminate blocking shader queries. This does not prove the fence
caused the overall slowdown. Its experimental helper and tests were removed
from the release. Retain bounded native submission, one lifetime across submission
and readiness polling, rendering/task checkpoints, and numeric diagnostics;
preserve the existing KHR and real-render readiness checks. No shader/quality,
countdown, activation or Garage-return safety gate is weakened.

The fence-free release candidate D (`scene-compile-release-d-timings-visual`)
passed native room creation/invite, ready/launch, both foreground 5→1 countdowns,
completed masks before activation, nonblack/no-rescue reveal, advancing input
and snapshots, Garage return, and room/browser/window cleanup. Application errors
were zero. In HIGH clear/night, network-owner totals (including peer readiness)
were 6,102/5,899 ms; largest tasks were 667/734 ms. Submission was 97.0/86.1 ms
total, split into 7/9 scheduler slices with 20.1/17.7 ms maxima. Budgets are
cooperative, not a preemptive bound on native driver calls. Both KHR polls reached
their existing 24-yield limit; the subsequent real render remains the fallback.
World preparation and watchdog draw were also slower (3,328.7/3,185.3 ms and
239/261 ms). These variable samples do not certify overall faster loading.

D's LOW interaction sample reached 71.8/59.7 ms maximum frame gaps, with zero
hard snaps, dropped history, estimated missing snapshots or observer failures.
It is not stable 60 Hz, and the historical combat-stall cause remains unproven.
The release addresses indivisible scene submission and stale-work cancellation;
it does not claim to eliminate all driver or world-loading stalls.

Validation: 18 new scene-submission/identity/cancellation cases, the existing
program-warm tests, frame scheduler, 25 synchronous and 33 asynchronous watchdog
cases, entry-abort, presentation, launch, activation, handoff, countdown/teardown,
entry observer, private-room harness and revision-version tests pass. Production
build and typecheck pass. The unchanged full-suite fleet timeout documented above
remains unresolved; no full-suite pass is claimed. Runtime owner metrics report
zero complexity, `any`, or `unknown` violations. The observer's pre-existing
`receipt` function remains cyclomatic 17 / cognitive 25 (same as `98b24722c`);
new numeric projection is separate. React Doctor is 89/100 with two reviewed,
unsuppressed warnings: deliberate sequential yielding between shader batches,
and a test's intentional JSON serialization-boundary check. This is unchanged
from the earlier 89/100 scan, not a claimed baseline score improvement.

### Production verification of bounded scene submission

Vercel reported successful deployment of `e6d808eec`, and the live site served
exactly `v1.0.0+ge6d808eec` before `production-scene-release-d-timings-visual`.
The native two-client test passed room creation/invite, ready/launch, visible
5→1 countdowns for both peers, masks completed before activation, nonblack/no-rescue
reveal, advancing input/snapshots, movement/shooting feedback, Garage return and
verified room/browser/window cleanup. Application errors were zero. Both inspected
screenshots show the battlefield, player vehicle, and populated damage-panel mask.

On HIGH clear/day Frosthollow entry, host/guest network-owner totals were
4,976/4,831 ms, including peer readiness. Native submission totaled 57.4/55.8 ms,
distributed across 7/6 scheduler slices with 10.3/12.1 ms maxima. Programs added
remained exactly 81 per peer. Compilation wall time was 319.6/284.5 ms. KHR queries
still took 160.0/155.6 ms total, with single calls of 112.6/113.8 ms; watchdog draw
was 148.9/68.3 ms. Largest loading tasks were 312/233 ms. Loader fades took
231.1/230.3 ms, and luminance matched the earlier clear/day baseline exactly.
This confirms bounded submission, not a stall-free or overall faster entry.

The separate LOW interaction sample used two rendered contexts on one machine,
20 seconds per foreground role measured sequentially. Frame p50/p95/p99/max was
23.2/30.4/38.9/45.9 ms for host and 21.2/31.3/39.6/50.7 ms for guest. Both had zero
hard snaps, dropped history, estimated missing snapshots and observer failures.
The runner makes no frame-budget assertion. These results do not certify stable
60 Hz, larger rooms, long sessions, separate devices, distant networks or relays;
historical combat stalls remain unresolved. Only the approved multiplayer source,
tests and this report were pushed; local QA artifacts and vehicle work were excluded.

### Joined-room intent and redundant FX compilation

The next baseline (`shader-cohort-baseline-timings-visual`, `ed7054141` plus
numeric-only diagnostics) passed the native two-client entry/return scenario.
It added 81 scene programs per peer. Host/guest KHR query totals were
162.0/312.6 ms, all measured while querying programs already resident before
scene preparation; single calls reached 110.8/227.2 ms. The subsequent 81 new
program queries per peer measured 0 ms at the available clock resolution.

This is **call-site timing, not GPU compilation-cost attribution**. Three adds
programs to its cache immediately after linking is submitted; membership does
not prove readiness. Existing programs are queried first, so an earlier query
may absorb command-queue or driver work associated with newer programs. Other
rendering between preparation yields can also add programs to the new cohort.
Neither the zero-duration measurements nor the old/new split justifies skipping
readiness checks. The 24-yield bound limits pending retries, not the duration
of an individual native call or a scan of already-ready programs.

The scoped follow-up addresses two source-proven costs without changing those
readiness gates:

- An already-joined, waiting room with a fixed map now uses the existing
  `{ intent: true }` prefetch path. Previously it waited for 1,200 ms of Garage
  inactivity and used the lower-priority background lane. It still uses fine
  construction slices, cooperative background yields, bounded residency,
  stale-map cancellation and hidden cache completion. No passive Garage or
  random-map construction was added. This improves overlap during room dwell;
  it does not remove construction work or promise savings on immediate launch.
- Opening FX no longer subtree-compiles its scene-attached root immediately
  before the mandatory compositor warm draw. Pinned Three 0.185.1 collects
  lights from both the target scene and a distinct compile root, counting the
  FX root's two PointLights twice and requesting an unnecessary `N+2` variant.
  Whole-scene submission, lazy armor-scar compilation, the exact opaque/late-FX
  compositor draw, pooled staging/reset and visibility/layer restoration remain.
  Watchdog, final-camera reveal, awaited loader fade and all-peer READY/countdown
  ordering are unchanged.

Both behavior changes have red-first regressions. The real FX fixture reproduces
the duplicate-light traversal and still requires the production warm draw.
Coordinator coverage proves explicit intent bypasses inactivity while retaining
background pacing, hidden completion and cancelled-build lease release. Numeric
cohort diagnostics add no GL queries and remain opt-in.

Baseline HIGH clear/day entry was 4,437/4,474 ms, including peer readiness;
largest tasks were 261/313 ms. Both inspected LOW interaction screenshots show
the battlefield, player and populated panel, with no rescue or application error.
The separate 20-second sequential foreground samples reached 340.2/390.1 ms
maximum frame gaps despite zero hard snaps, dropped input history, estimated
missing snapshots or observer failures. This run has no CPU timeline attribution
for those gaps and no frame-budget assertion; it does not establish their cause
or resolve the historical combat-stall question.

The candidate (`intent-fx-candidate-timings-visual`) passed the same native
scenario in HIGH clear/day, with identical watchdog luminance, zero application
errors, completed masks before activation, both visible 5→1 countdowns and
verified room/browser/window cleanup. Both inspected interaction screenshots
show the battlefield, vehicle and populated panel. The program increase between
scene preparation and the watchdog fell from 28 to 14 for each peer; the watchdog
itself added no programs (231→231 host, 193→193 guest). This supports eliminating
redundant variants, not a claimed wall-time speedup.

Candidate host/guest entry was 5,693/5,519 ms, including peer readiness, slower
than this baseline. World/module/connect stages were 2,623.4/2,772.9 ms; scene
compilation was 349.6/508.3 ms and FX warm was 352.4/171.8 ms. Native queries
still reached 128.3/286.1 ms individually, and largest loading tasks were
436/407 ms. These variable samples do not isolate the effect of room dwell or
certify overall faster loading. The prefetch change is justified by explicit
intent and preserved background scheduling, not by asserting this sample won.

The candidate's separate LOW 20-second sequential foreground samples reported
p50/p95/p99/max frame gaps of 22.3/31.2/38.1/46.6 ms (host) and
19.9/27.5/34.3/41.0 ms (guest), with zero hard snaps, dropped history, estimated
missing snapshots and observer failures. That is not a stable-60-Hz or broad
network certificate, nor proof that the preceding baseline's large gaps are fixed.

Validation includes shader-owner tests and 19 scene-submission cases, FX staging,
room-intent/coordinator pacing, entry/activation/barrier/abort, handoff, countdown,
Garage return, observer and native-harness regressions. The outdated source-only
intent assertion was updated to require the new explicit-intent call; passive
Garage guards remain. Typecheck, production build and diff checks pass. Changed
runtime owner metrics have no complexity/`any`/`unknown` violations; the observer's
pre-existing cognitive-25 receipt is unchanged. React Doctor's expanded
eleven-source-file final changed scan reported 88/100 and no new diagnostics; its score
is not directly comparable to the earlier four-file 91/100 instrumentation-only
scan. No warnings were suppressed. The previously documented unchanged full-suite
fleet timeout remains unresolved; this is not a full `npm test` pass.

### Production verification of room intent and FX warm

Vercel reported success for `0fe2cf0e9`, and the live site served exactly
`v1.0.0+g0fe2cf0e9` before `production-intent-fx-timings-visual`. The native
two-client room/invite/ready/launch scenario passed, including both foreground
5→1 countdowns, completed panel masks before activation, nonblack/no-rescue
reveal, advancing snapshots/input, shooting and movement feedback, Garage return
and verified room/browser/window cleanup. Application errors were zero. Both
inspected screenshots show the battlefield, tank and populated panel.

HIGH clear/day host/guest network-owner totals were 5,128/4,954 ms, including
peer readiness. The post-scene program increase remained 14 per peer, with no
programs added by watchdog rendering (231→231 and 193→193). Luminance exactly
matched the earlier clear/day samples. These are repeatable structural and
functional checks, not proof of an overall speedup.

Loading pauses remain: largest tasks were 682/724 ms; FX warm took
454.5/489.4 ms and watchdog draw 239.2/246.9 ms. Both shader-readiness polls
reached their existing 24-yield limit and used the subsequent real-render
fallback. Therefore lower query totals in this run (117.4/8.6 ms) cannot be
read as complete linker-drain costs or evidence of eliminating shader stalls.
Awaited loader fades were 233.1/237.3 ms.

The separate LOW 20-second samples, measured sequentially with two rendered
contexts on one machine, produced frame p50/p95/p99/max of
24.0/39.5/54.2/78.6 ms and 20.7/38.4/49.7/56.1 ms. Both had zero hard snaps,
dropped input history, estimated missing snapshots and observer failures.
The runner has no frame-budget assertion. Stable 60 Hz, larger/longer sessions,
separate-device/distant/relay-only performance and the historical stall cause
are not certified by this release. The final 25 synchronous and 33 asynchronous
watchdog cases and revision-version test also passed. Owned local QA servers
were stopped; screenshots and temporary reports remain excluded from git.

### Budgeted roster preparation and retained diagnostic attribution

The next slice starts from `0cc774691`, including the newer environment work;
comparisons to the preceding environment are not matched baselines. Roster
preparation used a private raw-rAF helper for every texture-painter checkpoint
and every entity, including cache hits. That helper had no fallback when rAF
existed but stopped firing. It now shares the existing opaque-loading scheduler
across each preparation call: an 8 ms cooperative work budget and 50 ms progress
paint interval, with the scheduler's 34 ms fallback for suppressed callbacks.
These are checkpoint budgets, not a bound on an indivisible texture or tank
construction call. No new preload/cache residency, visual quality change,
authority change or early bridge publication was introduced.

A red-first cached fourteen-player fixture observed fourteen forced frames;
the same fixture now completes without scheduling any frame when below budget.
Other deterministic cases cover task/frame cadence, a fresh per-call budget,
shared painter/construction scheduling, a non-firing rAF and late callbacks,
spectator exclusion, immutable camo/quality tuples, distinct duplicate-spec
identities, hidden staging and unchanged private bridge publication. Independent
review found no changed scene/resource ownership or abort/reveal ordering.

The native production baseline (`roster-base-timings-visual`, serving exactly
`v1.0.0+g0cc774691`) and local public-build candidate
(`roster-candidate-timings-visual`) both passed the two-client room lifecycle,
foreground 5→1 countdown, complete masks before activation, nonblack/no-rescue
reveal, advancing input/snapshots, movement/shooting and verified Garage-return,
room/browser/window cleanup. Application errors were zero. Inspected screenshots
show the battlefield, tank and populated panel. HIGH clear/day Frosthollow
watchdog luminance was identical across the two runs.

Host/guest roster stages measured 429.2/520.7 ms in the production baseline
and 393.7/330.5 ms in the local candidate. This is consistent with removing
scheduling debt, but is not an isolated causal benchmark: signaling and asset
delivery differ, and total entry did not improve. Network-owner totals,
including peer readiness, were 7,214/6,949 ms versus 7,442/7,348 ms. World/module/
connect stages were 3,166.8/2,930.4 ms versus 4,014.7/3,992.3 ms. Largest tasks
remained 1,903/1,913 ms versus 1,288/1,361 ms. Known GPU warm work still stalls:
both runs hit the 24-yield linker limit; candidate FX warm was 954.9/1,026.9 ms
and watchdog rendering was 342.3/342.8 ms. No broad loading-speed or smoothness
certificate follows from this scheduling fix.

Separate LOW 20-second foreground samples on the same machine with two rendered
contexts reached 62.7/72.8 ms maximum frame gaps in the baseline and 82.3/92.5 ms
in the candidate. All reported zero hard snaps, dropped history, estimated
missing snapshots and observer failures. These are short sequential-role
samples, not stable-60-Hz, large-room, distant-network or long-session proof.

Two test-tool blind spots are also addressed without changing runtime behavior:

- The earlier production CPU capture (`production-entry-cpu-guest-visual`)
  reached live battle on both clients, then failed with only
  `source_profile_stop_failed` / `summarize` / `unknown`. Each profile validation
  exit now carries a fixed allowlisted failure code through the redacted error
  wrapper. Validation limits and accepted profiles are unchanged; this adds
  attribution rather than claiming the original cause is repaired.
- The entry observer previously discarded slow-slice arrays. It now retains up
  to eight fixed, source-owned stage tags or bounded anonymous slice indices,
  plus copied start/launch/end prefetch counters. Unknown strings, invalid
  durations, resource URLs, room/player data and arbitrary error messages remain
  excluded. These counters distinguish completed room-dwell preparation from a
  joined/promoted build that finishes only after launch.

Focused bridge, scheduler, entry, input, net, handoff and diagnostic suites,
typecheck and the public build pass. The three changed runtime/tool owners have
zero complexity, `any` or `unknown` violations. The observer's inherited
over-complex receipt was split at its existing world-receipt boundary. React
Doctor's six-file changed scan is 88/100: sequential cooperative awaits and
explicit serialization-boundary test copies remain unsuppressed. The full
repository baseline is 43/100 across 1,889 files and is not a comparable scoped
score; unrelated diagnostics were not changed.

The full `npm test` run passed its previously timing-out 200-profile lazy-fleet
gate and continued through the early fleet checks. It was intentionally stopped
during pretest to finish the explicitly requested scoped landing (SIGTERM / exit
143 at `m1a3Concept.selftest.mjs`); this is not a full-suite pass or a reproduced
test regression. The queued additional production CPU capture was cancelled
before acquisition and produced no new browser evidence. An unfinished optional
waiting-room-dwell probe is excluded from this commit, as are all transient QA
reports, screenshots and unrelated vehicle/environment changes.

### Completed waiting-room cache attribution

The native private-room probe now supports the explicit
`--entry-profile=timings --wait-for-room-map` scenario. Its default remains the
immediate native Start flow. The optional scenario observes both actual Winter
waiting rooms for at most 15 seconds before Start; it does not force map state,
readiness, camera, quality or resource completion. Pre-Start completion alone is
insufficient: both post-Start observations must report a completed cached Winter
activation with unchanged promotion counters. A joined build that finishes after
Start fails this attribution check instead of being described as a cache hit.

The bounded, allowlisted receipt is published before the first page read, then
updated after samples, so an outer deadline retains partial dwell evidence even
while a read is pending. Copied counter snapshots exclude room codes, arbitrary
map names, resource URLs and error messages. Deterministic cases cover completed
and pending peers, wrong map/phase, hidden rooms, invalid counters, read failures,
deadlines, cancellation during a deferred read and false cached-launch claims.
The probe, entry-observer and source-profile selftests pass. This is diagnostic
tooling, not a runtime loading change or a new live cache-performance certificate.

A separate immediate-start production CPU capture on `v1.0.0+g004ce1e04`
reached live battle on both peers and verified room/browser cleanup with zero
application exceptions. It failed during profile summarization with the newly
retained `sample-delta` validation code. No raw profile was retained. It therefore
does not establish the offending delta value, CPU attribution or a completed
countdown/lifecycle gate. The guest's counters show a partial prefetch promoted
after Start, and substantial world/FX/reveal tasks remain. The historical stall
cause and the pass-aware shader-warm experiment remain open; neither is claimed
fixed or included in this tooling commit.

### Pass-aware prewarm, intent pacing and profile normalization

The renderer change submits scene and late-FX shader variants using
their actual pass layer masks and intermediate render targets. Camera layers
and target state are restored before every cooperative boundary. Other callers
retain the default native descendant selection; no authored geometry, lighting,
shader quality, postprocessing or final nonblack/reveal gate is removed.

The retained native `pass-base-timings-visual` and
`pass-candidate-timings-visual` runs both passed the room lifecycle, foreground
5→1 countdowns, nonblack/no-rescue reveal and room/browser cleanup, with zero
application errors. Both used local-loopback signaling. However, the baseline
served `v1.0.0+gdb400d61b` at HIGH clear/night, while the candidate served
`v1.0.0+gdb400d61b.dirty` at HIGH clear/day. Network-owner totals, including
peer readiness, were 10,673/10,583 ms and 3,920/4,100 ms respectively; largest
tasks were 6,726/6,727 ms and 245/322 ms. Different atmosphere makes these
unmatched observations, not a causal speedup estimate
or proof that the night stall is fixed. The candidate guest still recorded a
311.8 ms single readiness query. Both immediate-start runs joined/promoted
unfinished prefetches; neither demonstrated completed waiting-room cache reuse.

The separate production `completed-dwell-timings` run on `gdb400d61b` failed
its 15-second waiting-room preparation deadline. Both peers still reported
zero completed maps before launch, so no cached launch was attempted or
certified; room/browser cleanup succeeded. Source accounting identified 838
fine terrain checkpoints: previously each explicit-intent checkpoint forced a
display-frame wait, independently of work consumed. The scheduler
change uses the existing 4 ms background budget for explicit intent while
retaining forced frames for passive prefetch, lease fairness, all construction
checkpoints, cancellation/disposal and foreground promotion. This removes
mandatory scheduling debt, not the underlying geometry work; 4 ms is not a
bound on an indivisible construction operation.

The profiler now accepts safe signed integer deltas, reconstructs bounded
relative timestamps and stably orders owned sample/timestamp pairs. This follows
[Chromium's cumulative timestamp and paired-sort handling](https://chromium.googlesource.com/devtools/devtools-frontend/+/9a696c4e723caa3c7e1f78886da353f1f06a79b0/front_end/core/sdk/CPUProfileDataModel.ts)
and the [CDP integer-delta schema](https://chromedevtools.github.io/devtools-protocol/tot/Profiler/#type-Profile).
The tool retains its documented prior-interval attribution, zero-weight ties
and input immutability; it rejects invalid cumulative bounds without clamping,
dropping samples or inventing a tail. Only bounded numeric normalization counts
are added. The prior production `sample-delta` value was not retained, so this
compatibility correction does not prove that failure's cause.

The final combined local-loopback `combined-dwell-cpu-visual` run passed. Both
peers completed Winter prefetch before Start after a 6,856 ms observed waiting-room
dwell, then activated cached worlds in 48/83 ms without promoting another build.
Both showed every foreground numeral 5→1, completed panel masks before world
activation, primed the reveal, fired, and closed their rooms; no application or
shader errors, black rescue, hard snaps or observer failures were recorded.
The screenshot review shows rendered tanks, terrain and HUD. This is native
Chromium on one machine, not a deployed-release or distant-network receipt.

The combined guest CPU profile now summarized successfully and fully covered
entry (6,696 ms profile; 238 ms maximum sampling interval). Its normalization
counts were all zero, so native negative-delta handling remains unexercised;
the deterministic signed/out-of-order cases provide that coverage. Profiling
adds overhead: the observed network-owner totals of 6,154/6,127 ms are not an
unprofiled speed benchmark. Largest loading tasks were 260/319 ms, including a
298 ms guest readiness query. Gameplay frame-gap maxima were 56.2/44.4 ms.
Neither the historical stall cause nor consistent frame budgets is resolved.

Validation: focused shader/scene identity and cancellation, frame scheduling,
world cache/activation/intent/lease disposal, entry/barrier/abort/launch, warm and
countdown, mask, handoff, profiler, browser-observer and failure-evidence suites
pass. Import integrity and suite registration pass. Typecheck and the production
build pass (904 modules; the existing chunk-size warning remains). The four
changed runtime/tool modules pass the quality gate: 652 functions, zero
complexity violations, zero explicit `any`/`unknown`. Full `npm test` was not
rerun for this landing; the earlier interrupted run is not a pass.

The expanded seven-file React Doctor scan reports 49/100, versus the earlier
four-file 90/100 scan. Its error is `new Function` in the Node-only adapter test:
the input is the fixed, checked-in `src/main.ts` body, not user/network content.
The test executes the real adapter with injected fixtures; it is not shipped
to the browser. This is not evidence of an untrusted-code runtime path. Remaining
warnings concern intentional cooperative/sequential awaits and test-only array
iteration/fixture lookup. No scanner suppression or runtime-quality reduction
was made; these differing scan scopes are not a whole-repository quality score.
