# Moving-tank jitter: suspension replay, turning and hidden-host service

September 6, 2026. Isolated implementation starts from `9cd2a6425`, rebases
over the unrelated home-page update `2fc0103aa`, and ships as `72d46c8f8`.
This follows [the stalled-frame/scale audit](multiplayer-stall-scale-2026-09.md).
The reported defect is movement that wobbles unlike solo bot battles, not
merely large position snaps. Previous zero-`hardSnaps` receipts did not test it.

## Reproduced causes and corrections

### Owned tank: the authority pose was not a complete movement checkpoint

The shared 60 Hz movement model retains vertical ride velocity, sampled support,
spring velocities, suspension, drivetrain and turning sway. Reconciliation
previously replaced the public pose but invalidated `_ride.supportY`, causing
the next movement step to reinitialize the ride at support height with zero
velocity. Other internal values still belonged to the predictor's later time.
Replaying inputs from that mixture is not equivalent to continuing solo movement.

A zero-delay, 20 Hz authority echo of the **same** deterministic moving tank
reproduced maximum vertical divergence of 0.1258 m on flat ground and 0.2911 m
on an uneven field. Maximum single-step vertical error was approximately
0.0761 m and 0.1383 m. A control without reconciliation matched continuous solo
movement. This isolates the defect without blaming latency, rendering or terrain
quality. The uneven test uses `0.25*sin(z/2) + 0.15*sin(x/2)`.

The fix adds an optional, versioned, fixed-size movement checkpoint to the
existing **viewer's own** `meta.localPrediction` sidecar. It restores 43 finite
scalars and ten state bits before replaying unacknowledged input. It includes
the retained support sample: the support solver's small pose-reuse tolerances
make that sample part of the integrator state, not merely an expendable cache.
Contact geometry remains a local reference and is never serialized.

The viewer identity, version, exact array size, finite bounded numbers and flags
must validate before any checkpoint field changes. Missing legacy checkpoints
continue through the existing fallback; missing and rejected checkpoints have
separate diagnostic counters and must not be reported as exact replay. Remote
entity rows and the existing compact snapshot version remain unchanged. Combat
decisions, hits, reloads and results remain authoritative. No hidden opponent
state is added.

Presentation now copies the movement model's suspension and sway and measures
correction against the **total rendered hull angle**, including their existing
visual scale factors. Correcting only base pitch/roll would introduce a second
visible discontinuity when those terms change. Local impact-flinch presentation
retains its existing owner.

Exact-input tests compare flat/uneven drive, turning and braking with continuous
solo at 0/100/200 ms authority delay. Separate regressions cover landing,
damaged/immobilized tracks, respawn, presentation resume, stale ticks,
malformed/version/identity rejection, and the actual compact-wire sidecar.
Exact-input equality is a regression oracle, **not a promise of exact live
position**: public pose quantization, unknown future inputs and real contacts
still require reconciliation.

The complete quantized chain (`captureWorldSnapshot` → compact codec →
`SnapshotBuffer.immediateAuthority` → predictor) is tested separately. On the
uneven moving M1A2 fixture, maximum vertical error improves from 0.300752 to
0.010166 m at zero delay, and from 0.205805 to 0.001149 m at 100 ms delay.
Maximum artificial vertical frame step improves from 0.134611 to 0.005023 m
and from 0.031656 to 0.001060 m respectively. These remaining millimetre-scale
errors are retained in the assertions, not rounded away. Independent review
also caught the pending landing impulse, consumed on the following tick:
snapshot-at-contact now retains it rather than losing a 7.9355 m/s impulse.

### Remote tank: position continued while angles froze

Remote snapshots already extrapolated position during short buffer underruns,
but held yaw, pitch and roll. A steady turn therefore paused and then caught
up when a packet arrived. Shared-model 60/120/144 Hz playback with 20 Hz
snapshots reproduced this under ordinary 50 ms delivery and 5% packet loss.

The fix continues the visible entity's shortest-arc angular secant for at most
one observed snapshot interval, within the existing extrapolation horizon.
It does not change the raw owned-authority sample, invent indefinite turning,
or continue across missing entities, spec changes, teleportation, death,
airborne transitions, overturning or auto-righting.

At 60 Hz with 5% loss, the steady-turn fixture's seven frozen-turn frames became
zero. Maximum yaw error fell from approximately 0.00794 rad to 0.000065 rad;
peak observed angular speed fell from 0.726 to 0.255 rad/s against approximately
0.249 rad/s shared-model truth. Release/reversal and uneven-support attitude
are tested separately so smoothness cannot conceal an incorrect trajectory.
These attitude tests cover the transmitted base hull angles, not full remote
amplified-suspension parity. Remote spring/sway replication is not added here.

Remote track presentation also used the same forward displacement for both
tracks, leaving track shoes stationary during a pivot. It now integrates the
observed shortest hull turn using the shared movement model's existing 1.5 m
track arm. First presentation and lifecycle transitions do not create fake
track travel. This is presentation only, not a second remote simulation.

### Hidden host: service on accepted input, not only throttled timers

A valid, fresh remote input may wake a background host's render-free pump.
The wake is rate-limited to 60 Hz, uses the existing wall-clock owner, is guarded
against recursion, and does not advance a foreground or closed session.
Malformed, stale or duplicate traffic cannot create a wake. The existing timer
fallback and 100 ms catch-up bound remain in place.

A composed scheduler/session/authority test with a 1 Hz timer and 30 Hz valid
remote input previously advanced 60 simulation ticks in ten seconds; it now
advances 600, with zero presentation work. Without callbacks/input, a frozen
host still cannot run. Background and resume diagnostics now record wall time
discarded by the upstream pump cap rather than misleadingly showing only the
authority's later catch-up counter. A ten-second frozen/resume interval admits
at most six ticks and reports the omitted 9.9 seconds.

This mitigates timer throttling **while the browser delivers network tasks**.
It cannot defeat a fully frozen/discarded tab, sleeping computer, closed host or
network outage. The existing room failure/cleanup policies still apply.

### Lifecycle evidence could previously miss a freeze

The opt-in trace recorder listened for `freeze`/`resume` on `window`, although
those lifecycle events target `document` and do not bubble. It now listens on
the correct owner and provides idempotent disposal for listeners, input
subscriptions and its long-task observer. Safe receipt export retains nine
fixed lifecycle names and boolean visibility/focus/persistence fields, within
the existing event limit. It does not export arbitrary event payloads. This
improves future attribution; the absence of lifecycle entries in old receipts
still cannot exclude a past interruption. See the
[Chrome page lifecycle guide](https://developer.chrome.com/docs/web-platform/page-lifecycle-api/).

## Evidence and remaining frame-budget work

New owned artifacts are retained at
`/private/tmp/cot-multiplayer-moving-jitter-r1.eLsViE/`.

The native pre-change observation `prod-before.json` used live
`v1.0.0+g9cd2a6425`, real TURN, two fresh browser contexts on one machine,
seed 20260906, and one foreground renderer with the other peer's window
minimized. It recorded maximum host/guest gaps of 32.3/42.5 ms. A later launcher
audit found that Puppeteer silently adds three background-throttling bypass
flags unless explicitly excluded. This baseline inherited them, so it is
**not native browser/OS background-throttling certification**. A read-only
source scan also overlapped part of this baseline, so it is not exclusive-machine
performance certification. Earlier 51.6/53.1 ms dual-renderer results remain
separate workloads; later weather removal also prevents treating all releases
as matched A/Bs.

`native-browser-launch.mjs` now explicitly excludes
`--disable-background-timer-throttling`,
`--disable-backgrounding-occluded-windows`, and
`--disable-renderer-backgrounding` from automation defaults. Both production
UI and TURN-allocation probes verify the actual child-process arguments
before creating pages/rooms or requesting TURN credentials, including for
injected launchers. Missing arguments or a remaining bypass fail closed and
close the owned browser. Receipts export only a boolean and counts, never
arguments, URLs, profile paths or secrets. This validates the tested launch
configuration; it does not promise that an OS cannot freeze that browser.

`multiplayer-motion-probe` is an opt-in, bounded observation of the owned tank,
rendered root and camera. It stores at most 12,000 numeric rows and admits each
actual game animation tick only once. It never samples opponents or changes
input, pose, ammunition, focus, simulation or quality. Euler wrap must be
handled when interpreting angular differences; a numerical ±pi crossing is not
itself a camera jump. The first baseline predates animation-tick deduplication
and retains its original schema, so repeated observer rows are not additional
game frames.

### Irregular display timing is still not exact solo equivalence

`movementDisplayCadence.selftest.mjs` keeps a separate variable-display oracle.
Its fixed 60 Hz authority with synchronized 60 Hz exact-input display matches
solo. At 120 Hz display the uneven-drive maximum height error is 5.58 mm and
excess vertical step is 1.49 mm. At alternating 16.7/25/11 ms display intervals,
these are 21.74/6.65 mm; excess total-hull pitch step reaches approximately
0.47 degrees. With 100 ms delivery delay, the variable fixture reaches
31.62/10.59 mm. Reconciliation itself remains same-frame continuous.

The same variable integrator without reconciliation drifts by 129.43 mm, so
checkpoint restoration materially reduces this residual rather than causing
it. Authority-before-upload timing also leaves a distinct ACK/time-phase
overlap: a whole unacknowledged upload interval may partially overlap time
already simulated using held input. Consequently the residual must not be
attributed exclusively to fractional integration. Fixing these remaining
phase/timestep differences requires a separately tested prediction-timeline
change; no rushed fixed-step redesign or unsupported production attribution
is bundled into this patch. The regression keeps explicit finite residual
bounds and continuity checks rather than pretending exact live parity.

The final 43-scalar checkpoint adds an average 631.5 bytes per viewer snapshot
in the representative fourteen-viewer fixture: approximately 164,190 extra
bytes/second for thirteen remote recipients at 20 Hz, before transport overhead.
It is a correctness/bandwidth tradeoff, not free compression. A warmed,
alternating seven-batch Node microbenchmark measured median fourteen-viewer
capture/encode/decode at 0.53238 ms before and 0.60720 ms after; six-tick
reconcile/replay at 0.01769 and 0.01805 ms. The broader CPU test suite overlapped
this microbenchmark, so these are approximate local cost observations, not
isolated browser frame-time certification. The exact receipt is
`movement-checkpoint-benchmark-final.log`.

The historical 214–319 ms gaps still lack the original contemporaneous trace
needed to prove their exact cause. Fixing reproducible suspension/turning bugs
does not establish that those bugs caused a historical frame stall. Current
release checks must report full frame distributions, scene/workload, authority
progress, checkpoint admission, firing response, errors and cleanup; passing
functional motion tests is not a universal 16.7 ms frame guarantee.

### Final local validation observations

The canonical typecheck (including the unused-core check), production build,
and scoped runtime/tool complexity gate pass. The predictor's configured
coverage gate passes at 100% statements, branches, functions and lines using
both its original and checkpoint regression suites. The mutation runner now
uses those same tests, but mutation testing was not run for this change.

The initial all-suite command passed all 143 pre-suite files before its owned
20-minute process timeout interrupted the core suite. The separate core run
passed its first 70 files, then failed an unchanged Garage construction timing
assertion at 100.5 ms against its strict 100 ms ceiling. Its original failure
is retained in `core-test.log`. That exact failed test passed in the continuation,
which reached 339/394 core files before its own twenty-minute process limit.
The final ordered continuation passed the remaining 55 files, then reran the
upstream home-page test, canonical typecheck and production build on the rebased
tree. All 143 pre, 394 core and 28 post entries therefore have passing receipts
(565 total), but this is **not an uninterrupted `npm test` pass**. Neither the
process limits nor the original 100.5 ms Garage failure is erased or relaxed.

The complete-match fourteen-seat rendered-host fixture (one full renderer,
thirteen real lightweight Chromium/WebRTC peers) completed combat with all
fourteen shooters represented, both teams dealing damage, zero browser/GL
errors, zero discarded authority time, and 887 accepted movement checkpoints
with none missing or rejected. It recorded zero hard snaps/history drops.
Its 1,503 measured frames had p50/p95/p99/max gaps of
20.9/27.6/32.9/51.7 ms. Two frames exceeded the unchanged 50 ms gate, so this
is a **failed frame-budget certification**, not an all-green result. The
snapshot, diagnostics and screenshots are preserved in `live-host-full/`.

The 51.7 ms gap coincides with a heap decrease and unchanged resource counts;
the 50.2 ms gap overlaps a 50 ms LongTask during combat. Neither receipt has
a source stack or measured collection duration. These observations motivate
a separate late-window trace, not a claim that GC or network code caused
either frame. The recorded draw-call count is the final rendering pass and
must not be mistaken for the entire scene's work.

The independent fourteen-seat rendered-client complete-match fixture also
completed combat and cleanup without browser/GL errors or lost authority
time. It accepted 927 checkpoints (none missing/rejected), replayed 3,982
input intervals, and had zero hard snaps/history drops. Its
1,404 frames measured 25.8/33.0/39.3/63.2 ms at p50/p95/p99/max, with two
live-frame spikes. The frame-budget gate therefore also failed; this is not
a claim of repeatable sub-50 ms larger-room rendering. Receipt:
`live-client-full/`. Both local fixtures have anti-throttling browser flags
and are not native background-host or multi-device certification.

A sixteen-second late-window trace exceeded its bounded event capacity
(12,032 rows dropped), lacked a valid final clock alignment, and correctly
failed the completeness gate. It is preserved in
`live-host-trace-incomplete/` and is **invalid for causal attribution**. A
shorter diagnostic window can refine current-frame evidence, but cannot
erase either complete-match frame-budget failure.

The sixty-second fourteen-player lightweight-browser soak passed with
120 ms configured latency, 40 ms jitter, 10% state/input loss, seeded 20260906,
and clean departures. It validates transport/simulation capacity, not fourteen
simultaneous full renderers or independent devices. The twenty-second
four-player run with its default three-second wall-clock drain failed the
unchanged 0.5 m shared-pose gate at 0.692 m; its original log is preserved.
The fixture compares an owned immediate presentation against a teammate's
delayed presentation, and advances a fixed simulation step per awaited browser
iteration, so three seconds of wall time need not mean three seconds of
braking simulation. More drain and explicit final motion diagnostics are
needed before claiming convergence; no runtime tolerances are relaxed. The
follow-up with eight seconds of drain passed the same 0.5 m gate and clean
departures; mean/max authority advance was 0.228/1.6 ms. This validates that
longer-drain fixture, not a claim that every three-second wall-time drain is
sufficient. Failure receipts now include bounded raw-authority motion/timing
and delayed/immediate pose diagnostics to distinguish those cases.

### Complete short trace: current cost is not a major-GC stall

`live-host-trace-short/` retains the complete follow-up trace: an 8,015.3 ms
window beginning twelve seconds into observation, 42,822 retained rows,
zero dropped/malformed/open-in-window events and 0.041 ms clock drift. The
complete fourteen-seat battle passed the unchanged 50 ms gate in this run:
1,817 frames, p50/p95/p99/max 16.7/25.1/33.7/43.4 ms; all fourteen shooters,
both teams dealing damage, zero hard snaps, and 876 accepted checkpoints with
none missing or rejected. Tracing has overhead, and one passing repetition
does not erase the earlier 51.7/63.2 ms failures.

Within the valid captured interval, main-thread tasks had p95/max elapsed
durations of 19.975/25.065 ms; animation callbacks had p95/max durations of
18.636/22.373 ms. Twenty-three minor-GC pauses totalled 19.917 ms, with a
1.379 ms maximum; no major GC occurred. The ten longest main tasks had zero
GC overlap. Thus ordinary frame work consumes the budget in this interval;
GC is a small measured contributor here. The category trace does not separate
JavaScript execution from synchronous renderer/driver waits or identify a
source function. Its window ends before the full-run 43.4 ms worst frame,
and cannot establish causes for any earlier historical stall.

### Native production baseline exposes a separate hidden-host failure

`prod-native-before.json` is the first pre-change run whose **actual** browser
arguments verify all three background overrides absent. It uses real TURN,
native window minimization and sequential foreground-role measurements.
Foreground host/guest frame maxima were only 29.0/30.6 ms, but the run failed
`relay_gameplay`: when the host was minimized, it serviced just 23 background
pumps and delivered 15 snapshots over 22.41 seconds. The guest admitted only
13 snapshots during its twenty-second sample, accumulated up to 115 input
ACK lag, and did not produce the required firing attempts/confirmations.
Its screenshot explicitly shows **Host not responding** despite 60 FPS.

This is a concrete production example of the throttled-timer service problem,
distinct from renderer frame spikes. Cleanup still verified room closure and
browser shutdown. Because the test failed before its final version-consistency
guard, it is retained as failed pre-change evidence, not a completed release
certification. A deployed repetition must verify both checkpoint admission and
normal hidden-host progress, not merely a high rendered FPS.

### Deployed follow-ups: movement fix delivered, performance remains open

The first native after-run on verified `v1.0.0+g72d46c8f8`
(`prod-native-after-a.json`) failed its guest workload-admission check: over
one second the minimized host advanced one background pump, while the visible
guest received no new snapshot. Both rooms and the browser were closed.
This failure is retained; it cannot be retroactively classified as passing.

The subsequent passive diagnostic run (`prod-native-diagnostic.json`) verified
the same release before and after, actual native browser launch arguments,
relay gameplay, both foreground roles, and cleanup. It retained channel
message/error counters and scheduler counters without adding scheduling,
changing focus, altering input, or relaxing the admission check. During the
guest observation the minimized host performed 842 background pumps and sent
426 snapshots in 21.36 seconds, with **zero animation frames**. The accepted-
input activity counter rose from 43 to 878. This demonstrates the shipped
event-driven service path working in a real minimized Chrome window, not just
a timer-injected unit test. It does not explain the prior admission failure.

In that run host/guest accepted 408/415 movement checkpoints with none missing
or rejected, no hard snaps, and no dropped prediction history. Maximum recorded
vertical correction steps were 5.66/10.37 mm. Both fired four confirmed ATGMs;
the guest's four predicted-effect callbacks arrived within 14.0 ms of the
application input event (not physical click-to-photon). Foreground frame maxima
were 35.2/54.8 ms. The functional/relay probe passed, **not** a consistent
sub-50 ms performance certification.

The passive movement rows also support the originally reported wobble fix.
Restricting each host run to moving, consecutive observed frames with 12–22 ms
intervals, baseline root-height step p95 was 14.85 cm on the first frame after
reconciliation versus 4.34 cm on other non-reconcile frames. After the fix these
were 5.27 versus 5.42 cm: the distinctive correction-phase pulse is absent.
Derived vertical-velocity change p95 on first-after-reconcile frames fell from
8.47 to 0.71 m/s, and sign reversals from 47% to 9%. This is a within-run
phase-correlation observation, not an exact live A/B: paths, cadence and host
graphics preset differ. The failed baseline guest barely moved, so it supplies
no valid moving-guest before/after comparison. The deterministic matched-input
regressions above provide the causal isolation that these native runs cannot.

A second native repetition (`prod-native-repeat.json`) also passed relay
gameplay, firing, hidden-host progress and room/browser cleanup on that same
release. Its host/guest accepted 427/304 checkpoints with none missing/rejected.
However, frame maxima were 40.7/**440.9 ms**, guest p95/p99 were 45.3/81.9 ms,
and the guest recorded one hard snap. Hidden-host diagnostics retained
2,506 ms of discarded elapsed time and a 996 ms worst service gap. This is a
real failed smoothness observation, not erased by functional success or the
previous passing repetition. `screen:freeze` is our frame-gap anomaly label,
not evidence of the browser's native Page Lifecycle `freeze` event.

An unrelated full fleet test was active during follow-up observation; ordinary
user Chrome renderer/GPU processes were also active. Those processes were
left untouched and coordination requested. These runs cannot certify isolated
machine performance; contention is a possible contributor, **not proven cause**
of the 440.9 ms gap. The historical 214–319 ms cause remains unproven as well.

The added `networkBackgroundPrivateTransport.selftest.mjs` exercises the actual
private host/client handoff, split transport, compact INPUT binary codec,
browser-session owner and scheduler. Thirty explicitly delivered messages
advance sixty authority ticks in one second without any timer callback or
background presentation. Undelivered messages and post-close delivery cannot
wake the host. It uses a lightweight simulation sink and native-like event
dispatch, so it certifies application wiring, not native-browser scheduling.
This new check and seven related focused checks pass; the ordered registry now
contains 566 checks. The prior aggregated 565-check receipts are not relabeled
as a fresh uninterrupted 566-check suite.

### Final statistical capture and remaining limits

The September 7 follow-up (`prod-native-profile.json`) again completed native
relay gameplay, both players' shots, hidden-host service and explicit room/
browser cleanup on `72d46c8f8`. Frame maxima were 43.4/69.6 ms; the guest
accepted 401 movement checkpoints with none missing/rejected and no hard snaps.
Its four predicted-shot callbacks arrived within 6.4 ms of the application
input event. This optional profiler run is diagnostic, not a timing certificate.

The guest's bounded statistical profile retained 4,356 samples over 20.89 s.
Render-path inclusive sample weight dominates the named application paths;
whole-profile self weights were approximately 2.52 s application, 7.11 s idle,
2.39 s program, 0.14 s GC and 8.73 s other/native/unmapped. These categories
are sample weights, not exact CPU/GPU durations. The maximum sampling interval
was **367.258 ms**, startup clock uncertainty 193.5 ms, and the profile did not
fully cover the gameplay sample. These limits prevent precise attribution of
individual frame gaps or interpreting a long sample as time executing its
named function. No historical 214–319 ms source stack was recovered, and the
440.9 ms frame did not recur in this capture.

All owned browser/test processes are terminal and owned test rooms explicitly
closed. Unrelated tests, user browsers, existing servers and failed artifacts
were preserved. The checkpoint/turning fixes are shipped; isolated frame-budget
certification, the unexplained native admission failure, and genuinely frozen
browser-host service remain open. Browser-hosted private rooms still cannot
advance while the browser/OS supplies no execution opportunity. Native open
WebRTC channels do not promise an unthrottled interval timer; see
[Chrome's background timer policy](https://developer.chrome.com/blog/timer-throttling-in-chrome-88/).
