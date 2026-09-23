# Multiplayer stalled-frame attribution and room scale — September 2026

Follow-up to [response latency](multiplayer-response-latency-2026-09.md).
Source baseline and pre-change verified live frontend: `9afc1d5f5`
(`v1.0.0+g9afc1d5f5`).
The requested remaining work is historical 214–319 ms frame-gap attribution and
broader multiplayer testing. On September 6 the user explicitly chose testing
on this workstation instead of supplying another physical device/network.
The requested [WebTransport/Bun evaluation](webtransport-bun-assessment-2026-09.md)
is separate from measured runtime improvements; no transport migration is made.

## Evidence boundaries

- Separate browser contexts are isolated profiles, **not separate devices**.
- Real TURN gameplay proves relay use, not geographically separated players.
- Seeded artificial delay/jitter/loss is a controlled network stress test, not
  an observation of a distant network. Browser scheduling remains variable.
- Local firing-event and next-rAF callbacks are not physical click-to-photon.
- Chrome tracing changes overhead. Instrumented runs diagnose causes; they do
  not certify uninstrumented frame time, zero ping or an absence of future stalls.
- Current Winter weather varies by battle seed. The production probe records
  weather, day/night, precipitation count and graphics context without changing
  them. Historical pre-weather and current-weather samples are not matched A/Bs.

## Historical finding

The old ±250 ms diagnostic window was centered on a gap's **end**, omitting
the predecessor and start of a 319.1 ms interval. Long-task export also discarded
the browser entry's start/duration and retained only notification-delivery time.
Neither missing entry established that the main thread was idle.

The 214.2 ms guest pause ended with less heap, while the 224.8 ms repeat ended
with more heap; its heap dropped later during a normal frame. Resource counts
stayed stable. These observations do **not** identify GC as the cause. The
already-fixed cold first-shot hitch had program/texture growth and is a separate
issue. Host and guest samples were sequential, not simultaneous wall-clock events.

The original receipts specify CPU rate 1, 1280×800/DPR 1 and two loaded full-game
contexts on this workstation. External GPU contention was explicitly uncontrolled;
there is no retained FIFO/process receipt establishing either isolation or
contamination. Endpoint frame flags were zero, but omitted visibility lifecycle
events cannot rule out an intervening focus change. The original probes used
application diagnostics, not Chrome tracing or the optional CPU-counter sampler.
Later weather changes cannot explain those earlier pauses. None of these limits
invalidates the measured gaps or supplies a retrospective causal diagnosis.

## Diagnostic corrections

`multiplayer-feedback-probe` retains the full worst interval and predecessor
within its existing 48-frame limit. Actual long-task start and duration survive
redaction, including late observer delivery. Ordinary aggregates remain unchanged.

`--frame-trace` on the production UI probe records bounded Chrome task/GC/layout/
compositor durations. A pair of page performance marks aligns Chrome and page
clocks and verifies coverage of the actual gameplay sample. Collection has a
30-second deadline, 32 MiB Chrome buffer and 50,000 retained-duration limit.
Missing markers, loss, overflow and incomplete coverage remain explicit. Raw
arguments, URLs, stacks, room codes, addresses and identities are not exported.
CPU-side GPU/compositor events are not GPU hardware-duration measurements.
Both full and delayed live-combat captures require a finite clock drift within
±2 ms, in addition to collector completeness. Same-turn session-creation timeout
and resolution are regression-tested: the recorder retains ownership and
detaches exactly once, even if detach itself fails, without replacing the
original measurement error.
The optional CPU-counter sampler has the same bounded ownership guarantee and
regressions for a session resolving at its startup deadline, failed/stuck cleanup,
and preservation of the primary error. This fixes a diagnostic-session leak,
not a demonstrated gameplay-frame cause.
The `gcDetail: 'top-level-pause-events'` receipt labels GC scope: `devtools.timeline`
retains V8's top-level `MinorGC`/`MajorGC` pause events, including durations below
0.1 ms; verbose `disabled-by-default-v8.gc` is not requested. Some internal
`v8-gc` events can still arrive through `devtools.timeline`; the label is not a
claim that capture is phase-free.
This reduces source volume without enlarging the bounds or relaxing completeness
checks; a clean rerun is still required after overflow. See
[V8's DevTools trace scopes](https://chromium.googlesource.com/v8/v8/+/master/src/heap/heap.cc).

The protocol's completion event means that trace buffers have finished flushing,
not that gameplay was fully covered; the runner separately checks that interval.
See [Chrome's Tracing protocol](https://chromedevtools.github.io/devtools-protocol/tot/Tracing/).

For the fourteen-seat probe, opt-in `--frame-trace-window=8000,8000` schedules an
8-second capture after an 8-second delay from measurement invocation. It requires
`--frame-trace`; the default capture is unchanged. The receipt labels the requested
window rather than whole-battle coverage. Early completion cancels pending startup;
an unstarted or shortened window fails the trace gate. Delay and duration each
remain bounded at 30 seconds, with the same buffer, row and completeness limits.
Both full and delayed live-combat capture receipts also require finite clock
drift within ±2 ms for `complete`/`attributionValid`; collector completeness alone
does not prove alignment. Missing/nonfinite/excessive-drift regressions fail.

`--force-relay --performance` changes only the test browser's ICE policy while
retaining deployed ICE servers. It checks selected relay candidates and active
game channels throughout native movement/firing. No production origin policy,
endpoint or secret configuration is changed. Default runs retain their native
ICE policy. Additional RTC polling is labeled in the receipt.

Relay verification requires each endpoint's selected **local** candidate to be
relayed, with open game channels and advancing traffic. A remote candidate may
be learned as peer-reflexive during connectivity checks; that label alone does
not establish that the local TURN allocation was bypassed. See
[RFC 8445 §5.1.1.2](https://www.rfc-editor.org/rfc/rfc8445.html#section-5.1.1.2)
and [§7.3.1.3–4](https://www.rfc-editor.org/rfc/rfc8445.html#section-7.3.1.3).

A selected relay pair can temporarily report `in-progress` while still carrying
gameplay: libwebrtc's `Connection::Ping` sets that checklist state for a consent
check, separately from its selected/writable state, and `ReceivedPingResponse`
restores `succeeded`. See the [primary implementation](https://webrtc.googlesource.com/src/+/340cb5e46ac75af5ac253639e02adb558ea9ba9d/p2p/base/connection.cc#864)
and [W3C stats state definition](https://www.w3.org/TR/webrtc-stats/#dom-rtcstatsicecandidatepairstate).
The harness accepts only `succeeded` or `in-progress` on a currently connected
peer's selected local relay, with live game channels and advancing traffic.
Every active peer must also have an observed successful check during the current
monitoring interval; private peer-object tracking prevents replacements or later
runs from inheriting that evidence. Other checklist states still fail. Receipts
retain bounded observed states without exposing peer identities.

`--seed` on the capacity probe derives distinct per-guest `netSeed` streams.
Four counters distinguish stale input/state sequence completions in each
direction. Incoming counts measure actual decoded listener delivery; outgoing
counts measure base-transport acceptance, **not physical wire acknowledgement**.
Reliable control stays ordered. Lost, cancelled and rejected sends do not count.
Packets with no remaining message consumer at delivery time do not advance
receive-order counters or their sequence watermark; replacement listeners and
31-bit sequence wrap have explicit coverage.

## Validation ledger

Browser runs use the shared FIFO capture lease and attempt cleanup of their owned
browser and rooms; failures to verify native room departure are recorded below.
Other tasks' processes are preserved. Local artifact root for this
investigation: `/private/tmp/cot-multiplayer-stall-scale-r2.rHkb4G`.

| Check | Status and measured scope |
| --- | --- |
| Four-seat baseline | PASS; 45±15 ms configured delay, 5% state/3% input loss; synchronized, clean departure; max observed RTT 90.8 ms; authority max advance 5.4 ms; no dropped catch-up time |
| Fourteen-seat baseline | PASS; same profile; synchronized, clean departure; max observed RTT 99 ms; authority max advance 3.4 ms; no dropped catch-up time |
| Seeded fourteen-seat stress | PASS; seed 20260906; 120±40 ms configured delay, 10% state/input loss; max observed RTT 263.4 ms; every guest delivered 9–26 stale state sequences; max input ACK lag 13; synchronized and clean departure; authority max advance 3.1 ms, no dropped catch-up time |
| New diagnostic and seeded-impairment selftests | PASS; full-gap retention, delayed long tasks, private-data exclusion, actual reordered completion, seed/wrap/cancellation, relay and trace guards |
| Full fourteen-seat rendered combat (`scale-full.log`) | Overall FAIL: host passed, max frame gap 40.3 ms, authority max 4.5 ms; client had one 52.1 ms frame, failing the unchanged zero-50-ms-spike gate. Client authority max 4 ms, zero hard snaps/GL errors; no demonstrated cause for that frame |
| Fourteen-seat host after terrain change (`scale-full-after-terrain.log`) | FAIL: one 50.5 ms frame at +11,952.4 ms; heap dropped 482.01→348.38 MB across that interval, but no direct GC trace in this run. Frame p95/p99 27.3/32.2 ms; zero freezes, long tasks, hard snaps or dropped simulation time. Authority average/max 0.635/20.2 ms. Original receipt retained in `full14-after-failure/host-health.json`; this failure is not overwritten by later successes |
| Fourteen-seat host diagnostic trace (`scale-host-trace-after-terrain-2.log`) | Invalid attribution: Chrome 32 MiB buffer filled, end marker absent, 19,209 retained rows dropped. Gameplay max 32.9 ms, zero frame spikes/freezes and no reproduction of the prior 50.5 ms pause; these facts do not repair the incomplete trace. A prior attempt timed out waiting for FIFO and launched no browser |
| Fourteen-seat host trace 3 (reduced GC category request) | Still invalid: 32 MiB filled, end marker absent, 20,195 retained rows dropped. Game p95/max 26.4/40.9 ms, no hard snaps or dropped simulation time; authority average/max 0.616/4.9 ms. Both receipts retained in `full14-trace3-invalid/`. A bounded middle-of-battle window is required for this workload; memory and completeness limits remain unchanged |
| Fourteen-seat delayed host trace (`scale-host-window-after-terrain.log`) | PASS measured-combat and requested-window gates: 1,026 frames over 17.5635 s including settle; p95/p99/max 20.8/25.0/35.5 ms, zero spikes/freezes/long tasks/hard snaps/dropped history. All 14 seats fired, 42 shots/hits; authority average/max 0.432/1.8 ms, no invalid messages or dropped simulation time. Valid 8.0137-second trace, 41,955 rows, no loss/truncation/malformed/overflow/open in-window durations. This instrumented, host-only run did not request natural match completion and did not reproduce 214–319 ms |
| Final complete host, no Chrome trace (`scale-host-final.log`) | FAIL unchanged zero-50-ms-live-spike gate: 50.6 ms at +17,260.5 ms and 63.3 ms at +18,505.4 ms. 1,189 frames over 25.0481 s including settle; p95/p99 28.6/37.0 ms. Natural result and retained-room assertions completed, all 14 seats fired, 55 shots/hits; final clients connected with ACK lag/buffers zero. Authority average/max 0.561/2.9 ms, no invalid messages/dropped simulation time, hard snaps, dropped history or browser/GL errors. Exact failure retained in `full14-final-host-failure/host-health.json`; the earlier successful short window does not supersede this failure |
| Complete host with late trace (`scale-host-late-window.log`) | PASS unchanged full-combat, natural completion and requested-window gates: 1,479 frames, p95/max 27.7/48.4 ms, no spikes/freezes/hard snaps/errors; 56 shots from 14 seats, 57 hits, 34,311 damage. Natural elimination draw at tick 2,576, all 14 room sessions retained. Authority average/max 0.557/6.2 ms, no dropped catch-up time. Valid 8.0079-second capture, 44,121 rows, drift −0.036 ms, no loss/drop/malformed/overflow/open in-window durations. Receipts retained in `full14-late-window-OmgZUY/`; prior failed frame gates remain failures |
| Fourteen-seat client after terrain change (`scale-client-after-terrain.log`) | PASS unchanged full-combat gates and natural match completion/room return; 1,308 frames over 25.56 s, p95/p99/max 24.4/28.8/39.9 ms, zero spikes/freezes/long tasks/hard snaps/dropped history. All 14 participants fired, 55 shots and 55 hits, damage 35,267. Authority average/max 0.537/4.3 ms, zero dropped catch-up time; impaired client ended synchronized with input ACK lag and pending buffers zero |
| Production trace 1–3 | FAILED measurement, peers still connected: attempt 1 has no narrower diagnosis; 2 reports `frame_trace_stop_failed`; 3 identifies trace-flush timeout. All browsers closed; room cleanup unverified in 1–2, verified in 3 |
| Production trace 4 | Functional UI PASS, all eight shots confirmed and clean departure; frame maxima host 49.3 / guest 46.1 ms. Both traces invalid: data loss and 50,000-row truncation, absent end alignment/coverage |
| Production trace 5 | Functional UI PASS, all eight shots confirmed and clean departure; frame maxima 55.7 / 79.4 ms. Clock alignment and sample coverage pass, but both traces remain invalid because retained rows overflowed and duration events remained open |
| Production trace 6 | Functional UI PASS, all eight shots confirmed, zero hard snaps, clean departure. Host trace valid, no loss/drop/open in-window durations; max frame 48.3 ms, no historical 214–319 ms reproduction. Guest max 45.1 ms, aligned/covered and no dropped rows, but attribution remains invalid: three open durations belong only to the other page at the stop boundary, not proven unfinished guest work |
| Production relay 1–2 | FAILED relay verification while both peers remained connected. Attempt 2 narrows this to the guest pair after 39 polls, but neither artifact retains its exact candidate pair; do not retroactively label either a TURN outage or successful relay. Browsers closed; native guest departure unverified |
| Production relay 3 | PASS actual TURN gameplay: 47 polls, both local candidates relay (remote candidates also relay in this receipt), two open game channels per peer, advancing traffic, all eight shots confirmed, four guest predictions exactly deduplicated, zero hard snaps, clean room/browser close. Frame p95/max: host 47.2/80.1 ms; guest 41.5/67 ms—not hitch-free |
| Production relay + trace 1 (`production-relay-trace-1.log`) | FAILED harness check, now diagnosed: after 29 successful roster polls the connected guest's selected relay/relay pair reported `in-progress`, with live game channels and all eight shots completed. The successful-only checklist assertion incorrectly rejected a consent check. Serialized regression now passes with the corrected bounded rule above; this is a harness correction, not a faster game or a retrospective PASS for the failed run. Browser closed and host departure verified; native guest cleanup unverified. Corrected relay rerun recorded below |
| Production relay 4 (corrected harness) | PASS on baseline production: 48 roster polls, selected relay/relay, successful checks observed for both peers, two open game channels each, all eight shots confirmed and exact guest prediction deduplication; zero hard snaps, both native room departures and browser closure verified. Fog/day, low preset, scale 1. Frame p95/max host 42.5/62.1 ms, guest 40.7/55.1 ms; guest RTT median/max 20.5/23.4 ms. This is functional/relay success, not a zero-stall frame certification |
| Chrome trace protocol control | PASS on an otherwise blank owned page over 20 seconds; aligned start/end marks, 6,088 retained rows, no lost/malformed/overflowed rows; four tasks starting after the end mark are reported separately |
| Historical stall cause | Unresolved: no reproduction or causal runtime fix demonstrated in this wave |

### Source gates

All **557 scheduled selftests** completed successfully in the original suite order
on the final source tree, in aggregate. The single-command run did not finish
within its owned time budget: an initial 10-minute run and a subsequent 30-minute
run were stopped without an assertion failure. The second run completed 143 pre
checks and the first 328 core checks; an explicit continuation completed the
remaining 86 core/post checks. This is not a claim that one uninterrupted
`npm test` command exited successfully. The late CPU-sampler cleanup regressions
were rerun separately after that edit and passed.

Typecheck and production build pass. The build retains its existing large-chunk
warning. Complexity gates pass for ten changed runtime/tool source files: 824
functions, no complexity violations or `any`/`unknown` findings. Changed-file
Doctor reports 92/100, no errors and one warning in the production UI **selftest**:
JSON round-tripping intentionally converts a VM-realm result into the same plain
serialized data shape that the browser automation boundary returns. This is a
high-confidence non-runtime performance warning; no rule was suppressed. The
Doctor changed-file scan covered 15 tracked files, not the new untracked files,
and is not directly comparable to the earlier full-repository baseline.

The logs are `final-test.log`, `final-tail-tests.log`, `final-tail-gates.log`,
`final-typecheck.log`, `final-build.log`, `final-doctor-changed.log` and
`final-code-quality.log` under the artifact root. The CPU-sampler source was also
checked separately after its late cleanup fix. Browser failures in the ledger
remain valid despite these source gates.

Baseline capacity probes have actual non-bot WebRTC seats but lightweight pages,
not fourteen simultaneous game renderers or fourteen human participants.

The full-combat probe renders the measured host/client role sequentially with
fourteen actual network seats. Its failed client's original evidence survives in
`/private/tmp/cot-multiplayer-stall-scale-r2.rHkb4G/full14-first-failure/client-diagnostic.json`.
Later tool changes persist
sanitized health and timing windows **before** assertions; this is evidence
retention, not a repair or relaxation of the failed frame gate.

Relay 3 used native ammo slot 2 and 20 seconds per role on this workstation.
Host input-to-confirmed callback median/max was 16.7/31.6 ms; guest first predicted
callback 10.8/15.1 ms and authoritative confirmation 38.5/52.4 ms. Guest measured
RTT median/max was 19.7/21.7 ms. These callbacks and the additional one-second RTC
polling are not click-to-photon or distant-device measurements.

Native cleanup also handles the guest being returned to the garage by the
host's departure before its own Leave click. A missing button is **not** enough:
cleanup succeeds only with garage phase, no network session and no room invite
in the URL. Partial return, retained session and retained invite fixtures fail.

The combined relay/trace attempt also retained a fully valid guest trace: frame
max 49.9 ms, longest page-main task 20.745 ms, zero lost/dropped/malformed rows
or open in-window durations, clock drift +0.007 ms. Its host max was 50.3 ms but
that trace remained invalid due to an open GPU-thread duration at the stop
boundary. The valid host trace 6 and valid guest combined trace are separate
samples, not simultaneous attribution of one stall. None reproduced 214–319 ms.

The valid delayed host receipts are preserved in `full14-valid-window/host-health.json`
and `host-frame-trace.json` under the artifact root. Start/end marks differ
by 8,013.700 ms with −0.009 ms clock drift. The game-trace clock reading spans
0.7 ms; alignment places capture at approximately +8,080.1 to +16,093.8 ms.
This covers the three worst measured intervals, not the whole run: the final
approximately 1.09 seconds is the existing settle period after 15 seconds of
active controls. Twenty-five open intervals begin only after the end mark.

The worst 35.5 ms gap ends at +12,994.3 ms and contains a 34.597 ms page-main
task, including a 31.283 ms animation-frame callback; no top-level GC pause
overlaps it. A separate 34.1 ms gap ending at +11,879.2 ms includes a 9.333 ms
major-GC pause, which does not explain the entire interval. Twenty-five captured
page-main minor pauses peak at 1.212 ms. These are direct observations of this
instrumented window, not attribution of the earlier 50.5 ms failure or historical
214–319 ms stalls; those causes remain unresolved. Prior failures stay in the
ledger and are not overwritten by this successful sample.

The final complete-host failure has no optional Chrome trace. Both spike
endpoints retain 301 programs, 1,017 geometries and 212 textures; heap rises
389.16→391.01 MB and 379.66→381.55 MB respectively. The windows contain only
the spike marker, with no recorded long task. Neither stable resources nor
missing long-task entries establishes a cause or proves an idle main thread.
The natural-completion helper performs real observer work: it reads only the
authority at no more than roughly 10 Hz, projecting at most 14 living entities.
The fourteen-page room check starts only after an authority result; screenshots
precede measurement reset and final report collection follows the sampled window.
There is no recorded timing link between those polls and either spike, so
measurement-side interference remains unproven. These 50.6/63.3 ms failures also
do not reproduce or explain the historical 214–319 ms intervals.

The late host trace covers game time approximately +14,308.4 to +22,316.3 ms,
not exactly the requested +14–22 seconds. Its worst 48.4 ms frame ends at
+14,852.4 ms: a 44.800 ms page-main task contains a 42.388 ms animation callback
and a 17.866 ms major-GC event. GC therefore contributes to **this** frame, but
does not account for its entire duration or establish the older stalls' cause.
Nested GC durations cannot be added together, and concurrent long other-thread
tasks are not blocked page-main time. Later 46.2/43.7 ms frames fall outside the
Chrome interval and remain unattributed. Twenty-one open tasks start only after
the end marker. Health is deliberately saved before assertions; the final report
and log establish PASS. Normal runner completion executed its cleanup path,
without a separately persisted native-departure verification flag. This local,
low-quality 1440×900/DPR 1 host test is not production or distant-device proof.

## Incremental terrain runtime change

The original live terrain path synchronously built a 99×99 fine-height grid and the
requested chunk geometry before returning to the frame loop. Existing generator
checkpoints were drained synchronously there. This is a concrete bounded source
candidate, **not proof of the historical 319.1 ms pause**. Original Verdant
benchmark live-build max was 9.6 ms (`terrain-baseline-2.log`). Subsequent Winter
baselines completed 264 jobs each: native max 7.3 ms (`terrain-winter-1x.log`),
4× CPU max 34.4 ms (`terrain-winter-4x.log`). These are completed-job update costs,
not all updates or whole gameplay frames.

Live terrain now advances one pending generator in one-row slices, checking a
2 ms deadline between checkpoints with a hard ceiling of 32 checkpoints. The
last row/skirt/index/bounds operation is atomic, so this is a work target, not a
hard frame-time guarantee. A new job starts at the existing four-update cadence;
pending work advances each update. Only finished geometry becomes visible and
publication uses the latest camera. Countdown warming finishes the same partial
job; zero budget stays zero and zero completions still means no remaining work.
There is no new timer or independent resource owner.

All 20 maps retain pre-change exact height, position, normal, index and bounds
bytes for sampled chunks at all three LODs and direct-far construction, including
adjacent seams, skirts and mixed-LOD borders. Scheduler/lifecycle tests cover
camera reversal, warm/live handoff, dormant resources and retained-geometry
disposal. Independent review found no correctness blocker.

Winter A/B uses seed 1337 and the identical 181-position, 724-update route, with
three streamed runs. New measurements include **every update**, including work
that finishes no geometry; measuring only publication would hide partial cost.

| CPU profile | Original completed-job max | New all-update max / p95 / p99 | Completed geometries per route, original → new |
| --- | --- | --- | --- |
| Native | 7.3 ms | 2.1 / 2.0 / 2.0 ms | 88 → 87 |
| 4× slowdown | 34.4 ms | 3.3 / 2.5 / 2.8 ms | 88 → 85 |

Artifacts: `terrain-winter-after-cap32-1x.log` and
`terrain-winter-after-cap32-4x.log`. An earlier eight-checkpoint candidate completed
only 69 upgrades/route and was rejected for slow catch-up despite its low 1.2 ms
maximum. The selected version preserves finished detail but deliberately allows
a small amount of refinement to complete later. These results fix a measured
terrain blocking source; they do **not** establish that it caused the historical
214–319 ms frame stalls. Covered startup material generation is separate and
unchanged.

Reproduction entrypoints (browser runs must hold the shared FIFO lease):

```sh
npm run test:net:seven:full
node tools/multiplayer-four-player-soak.mjs --players=14 --team-size=7 --seed=20260906 --latency=120 --jitter=40 --loss=10 --input-loss=10 --duration=15000 --settle=5000
npm run test:net:seven:live -- --only=host --frame-trace --frame-trace-window=8000,8000
node tools/production-private-room-ui.mjs --url=https://cot.kevinliu.studio --performance --ammo-slot=2 --frame-trace
node tools/production-private-room-ui.mjs --url=https://cot.kevinliu.studio --performance --ammo-slot=2 --force-relay
npm run perf:terrain-stream -- --map=verdant --cpu=1
npm run perf:terrain-stream -- --map=winter --cpu=1
npm run perf:terrain-stream -- --map=winter --cpu=4
```

Trace loss handling, stop-boundary classification, relay diagnostics and failure
receipt preservation are harness corrections. Their improved observability must
not be reported as faster game execution or resolution of the historical stalls.

## Production release verification

Runtime change `f7003cc46d72492341237c8ae31435e34620f83e` was pushed normally to
`origin/main` and automatically deployed by the existing Git integration.
Vercel deployment `dpl_5hENMGhtRBKFeucG2xBMRTLoCWTG` reached READY, with
`cot.kevinliu.studio` serving `v1.0.0+gf7003cc46`. That version was checked both
before and after the final native room test. No Worker, API, hosting plan,
database or transport migration was made in this wave.

`production-release-relay.log` records the owned FIFO interval beginning
September 6 at 20:50:17.898 UTC and native exit at 20:51:42.007 UTC. Functional
result: PASS. Two fresh profiles joined through the normal private invite,
readied and launched; 49 bounded polls verified real relay gameplay with two
open game channels per peer. Both observed successful connectivity checks; the
guest also traversed a live `in-progress` consent check. All **seven of seven**
ready firing attempts were confirmed (host three, guest four), and the guest's
four predicted presentations were exactly deduplicated against confirmation.
Both native room departures and browser closure were verified. Page errors,
hard snaps and observer failures were zero. The deployment's bounded Vercel
error-log query returned no entries; that is not a fleet-wide/Worker log audit.

**Frame performance did not pass a smooth-play standard.**

| Measured role | Frames / sample duration | Frame p50 / p95 / maximum |
| --- | --- | --- |
| Host | 398 / 20.086 s | 50.0 / 67.1 / 109.6 ms |
| Guest | 517 / 20.387 s | 38.9 / 51.1 / 63.5 ms |

This is sustained slow cadence, not merely one outlier. The host's worst frame
precedes its first click; the guest's worst is more than 3.5 seconds after its
last click. Their retained windows show stable program/geometry/texture counts,
scale 1 and only frame-spike events, not first-shot shader growth or an observed
combat burst. Both windows include heap drops, but no Chrome or CPU-counter trace
was enabled, so GC, CPU, GPU, weather and external contention cannot be assigned
as causes. Post-sample context reports low quality, day/snow, intensity 0.661 and
zero precipitation particles; the earlier fog sample is not a controlled A/B.

The local authority's application RTT is zero and its send buffer remains empty,
despite slower host frames. Guest RTT median/max is 21.7/56.1 ms, send-buffer
p95/max 0/219 bytes and input ACK lag p95/max 5/6. This does not show a sustained
transport backlog or establish that a WebTransport/Bun change would help.
Guest predicted-event callback median/max is 1.5/13.7 ms, but its next-rAF callback
median/max is 52.1/59.8 ms—not physical click-to-photon or instant visible firing.

Zero hard snaps does not mean zero motion error: sampled position-error maxima
are 2.215 m host and 2.096 m guest; cumulative correction-step maxima are
0.2194/0.2097 m, not measurement-window-only deltas. The functional PASS must not
be described as single-player-equivalent or consistently smooth performance.
Historical 214–319 ms attribution and these newly retained production frame
limits remain open. All owned capture resources were closed; unrelated worktrees,
processes and Redis were left untouched.

## Follow-up: cold height queries and render attribution (September 6)

The follow-up starts from `ff68c3d6c61b405f6e528572c76f210ebc519849`.
The historical 214–319 ms events remain an attribution question: a new hot-path
finding does not retroactively explain an old event without a matching trace.

### On-demand height cache

`getHeightAtFast` previously evaluated a whole 17×17 tile when an aiming ray
first requested any cell in that tile. A bilinear read requires only four
vertices. A long ray could therefore synchronously evaluate many mostly unused
tiles outside the deployment warm region, separately from the already-budgeted
terrain **mesh** streaming work.

The cache now evaluates those four vertices on demand, with a per-heightfield
131,329-byte validity bitset. Completed deployment tiles retain their existing
fast path. Explicit tile warmup still finishes a complete tile before yielding,
reusing any vertices calculated by earlier reads. A partial read is deliberately
not reported as a completed warm tile. Zero and NaN heights are valid cached
values; no value sentinel is used. Float32 storage, interpolation order, clamp
behavior, analytic geometry and the simulation field are unchanged.

`tools/terrain-fast-cache-benchmark.mjs` compares the current runtime with an
immutable pre-change cache fixture, rather than comparing two copies of the new
code. Its selftest pins that fixture's digest. Tests cover exact ray hits,
shared borders, partial/full/cancelled warmup, independent worlds and non-finite
inputs. The prototype's Winter cold-ray workload reduced analytic evaluations
from 69,071 to 9,829 (85.8%). That is evidence of removed synchronous work, not a
claim of an 85.8% frame-rate improvement. Candidate and production receipts must
be assessed separately.

The exact runtime candidate subsequently passed seven alternating Winter pairs
in `terrain-fast-cache-candidate.log`: median 24-ray cold total
**41.074 → 6.879 ms**, median per-run maximum cold ray **5.989 → 0.810 ms**,
and identical returned hit distances. Repeated partial-cache and fully warmed
2,400-ray medians were 15.111 → 15.263 ms and 14.865 → 15.213 ms respectively;
those small, overlapping timing differences are not a warm-path speedup claim.
Explicit warmup still pays the deferred 53,455 evaluations across 239 remaining
tiles (31.751 ms median when the benchmark drains all yields synchronously).

### Source profiler and measurement overhead

The native private-room probe now has an opt-in `--source-profile=host|guest`
diagnostic. Its bounded statistical CPU profile retains sanitized generated
application locations, category weights and time bins; it does not export raw
source, private URLs, room identifiers or frame arguments. Inclusive nested
function weights overlap and must not be added together. It is mutually
exclusive with the other timeline/trace capture modes. The default probe does
not attach a profiler.

The first diagnostic capture (`r3-prod-source-host.json`) included a 634.1 ms
startup pause while `Profiler.start` was in progress; its first sample interval
was 600.149 ms. This is a **measurement artifact**, not a new game-stall finding.
The source-profile path now starts gameplay observation after that command,
reports the excluded setup duration and incomplete boundary frame explicitly,
and begins trusted movement afterward. Ending observation also precedes
profiler stop/report generation. No game clock, simulation state or application
trace history is cleared. Deterministic regressions cover the setup pause and
late/failing cleanup. CPU-profile totals still describe their declared profile
scope, not a magically overhead-free gameplay interval.

### Rendering evidence and limits

An initial production cost capture observed CPU post-processing submission
around 9 ms per frame while whole-frame gaps were substantially longer. Source
sampling localized much of the application work to the scene/post chain, with
smaller aiming, collision and HUD costs. This does not, alone, prove GPU hardware
duration or a networking cause.

A separate same-machine diagnostic used asynchronous WebGL elapsed queries,
checking availability and disjoint state and releasing every query. The
[WebGL extension specification](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/)
defines these asynchronous results; the test does not insert a blocking finish.
The seeded `r3-prod-gpu-seeded` capture retained GPU-interval p50/p95/max of
11.52/79.37/162.44 ms on the host and 27.07/54.21/79.94 ms on the guest. CPU post
submission remained around 9–10 ms on average. These are sampled intervals,
subject to diagnostic overhead and shared-device scheduling—not exclusive GPU
busy time, complete frame coverage, or a final performance gate.

The machine is an Apple M5 Max; Chromium reported its ANGLE Metal renderer.
Cooperating test workloads use the shared FIFO lease, but unrelated user apps
remain untouched. Both players run on this one machine and the same network,
using forced live TURN relay; this is not separate-device or distant-network
certification. The seeded repeat uses clear/day Winter at the same 1280×800,
DPR 1, CPU 1, scale 1 presentation. Earlier unseeded snow samples are not an
identical-scene before/after comparison. Functional room/shooting PASS must
continue to be reported separately from smooth-frame acceptance.

The subsequent rotated pass capture (`r3-prod-gpu-passes-seeded`) still showed
highly variable elapsed results even for simple fullscreen operations, so it
does not justify assigning their complete elapsed interval to shader work. A
proposed one-copy render-graph optimization was **not applied** without a useful
measured benefit and image-parity result. Graphics settings, pass count and
shadow quality/cadence are unchanged in this candidate.

The unprofiled, fixed-seed production control (`r3-prod-seeded-before.json`)
verified `v1.0.0+gff68c3d6c` before and after: host frame p50/p95/max
**32.5/43.3/64.0 ms**, guest **29.9/39.3/50.7 ms**. Both samples are 20 seconds,
with the same native inputs and live relay. This already differs from the older
unseeded 109.6/63.5 ms maxima **before the candidate is deployed**, illustrating
why neither weather changes nor run-to-run variation may be credited to the fix.
All ready firing attempts matched, with zero hard snaps/page errors and verified
native room/browser cleanup; these functional results do not pass a strict
50 ms maximum-frame gate.

Candidate verification: twelve focused terrain/movement/world-presentation,
frame-loop and diagnostic test modules pass; the registry discovers 559 ordered
checks (not a claim that all 559 were rerun here). Typecheck/core-unused and the
public production build pass. The explicit five-runtime-file quality gate
checks 402 functions with zero complexity violations, `any` or `unknown`;
changed-file Doctor reports no findings, score 92. Independent cache and
diagnostic lifecycle reviews found no remaining blocker. No vehicle asset,
terrain geometry, authority protocol, Worker or paid-service setting changed.

### Live release and corrected same-machine workload accounting

The cache and bounded diagnostic changes landed in
`466244989d8e2bbeb32a197bc2b806bf1b587780`. The normal Git deployment reached
READY as `dpl_3ubWdxdeYTfoyciHcNVEkQR6QCa8`, with production reporting
`v1.0.0+g466244989` before and after both subsequent captures. There was no
Worker, alias, Redis or billing change.

The unprofiled seeded repeat (`r3-prod-seeded-after.json`) reports host frame
p50/p95/max **33.4/43.4/51.6 ms**, guest **32.4/41.3/53.1 ms**. Compared with
the identically seeded pre-release control, this is mixed: host maximum falls,
guest maximum rises, and typical cadence does not improve. Neither role passes
the strict 50 ms maximum gate. All ready shots, room flow and native cleanup
pass, with zero page errors or hard snaps. The isolated cold-height benchmark
is the verified runtime improvement; these frame results are not evidence of
a general FPS improvement.

The bounded source-profile repeat (`r3-prod-source-bounded-after.json`) verifies
the new measurement boundary: 481.3 ms of setup and one straddling frame are
explicitly excluded from the gameplay observer. Host observed maximum is
63.5 ms, not the profiler's 449.66 ms startup sample interval. The whole-profile
weights still include startup, as declared. `sampleFullyCovered` is true; only
fully covered 100 ms bins 5 through 202 are safe for observed-window analysis.
This diagnostic is not the unprofiled acceptance run.

Read-only focus and frame-scheduler snapshots uncovered a separate harness
assumption. `bringToFront()` does **not** suspend the other independent headless
browser context on this machine: both report focused/visible. During the host
sample their animation ticks advanced 754 and 751; during the guest sample,
642 and 641. Background ticks and suspensions remained zero. Thus the earlier
"foreground roles measured sequentially" label describes the **observer**, not
one renderer at a time. These receipts remain valid **two-renderer stress
results**, but are not single-visible-game measurements.

A bounded blank-page control (`native-window-focus-probe.json`) proved native
window minimization works in both directions: the selected page advances about
60 RAF callbacks/s; the minimized peer is genuinely unfocused/hidden, advances
zero RAF callbacks, and retains its 100 ms timer. No visibility/focus getter or
game setting was overridden. The
[Chrome DevTools Browser window API](https://chromedevtools.github.io/devtools-protocol/tot/Browser/)
is used only for the two owned windows, restoring their original state before
closing. The game control must additionally prove continued background
authority/network progress before and throughout measurement. This identifies
concurrent test rendering; it does **not** retrospectively prove the cause of
the historical 214–319 ms events.

A read-only source review also avoids misattributing bundled filenames:
`battlefieldBounds-B0FPWe9A.js` contains the sampled obstacle-grid query and
ray/convex collision functions; the hot entries are not the playable-boundary
clamp. Retained interior-bin self weights average approximately 0.555 ms/frame
for those selected collision functions, 0.156 ms/frame for selected HUD slot
updates, and 0.203 ms/frame for reload text/drawing. These are statistical
steady-work estimates, not maximum-frame attribution or completely removable
cost. The HUD's sampled generated line was verified byte-identical against the
public production chunk. No speculative HUD/collision rewrite was added to
this fix.

Both older receipts (`production-performance-missile.log`, 319.1/214.2 ms,
and `production-release-relay.log`, 109.6/63.5 ms) explicitly recorded two fresh
rendered contexts on one machine, but did not retain inactive-page focus/tick
observations or the executed harness SHA. The documented `6604fbdad` and
`f7003cc46` tool revisions use separate live headless contexts and sequential
`bringToFront()` observation, without native minimization or visibility
emulation. The latter receipt pins the live frontend to `f7003cc46`; the former
frontend revision is documented separately, not in that log itself. This
establishes a dual-context test configuration, **not** direct proof of its
instant-by-instant historical render concurrency. The newly measured behavior
is a plausible workload confound, not retrospective attribution of those peaks.

The first temporary native-window game control
(`r3-prod-native-foreground-a-failure.json`) passed both pre-sample admissions:
the peer rendered zero frames while background ticks, inputs and snapshots
advanced. Observed host p50/p95/max was 16.7/24.6/41.2 ms, guest
18.8/26.7/83.1 ms. The guest spike occurred 16.232 s into observation with stable
program/geometry counts, not at the focus transition. This run is **not a
release PASS**: the temporary wrapper incorrectly reapplied its window policy
during repeated exit actions, causing native room-exit verification to fail.
The owned browser closed, but explicit room closure was not verified. The
complete failed receipt is retained. Admission-only proof also must not be
upgraded to a whole-sample concurrency guarantee.

The durable controller applies window policy only around the two timed samples,
then restores original owned bounds/state before normal room teardown. It
verifies the actual counter/state conditions across each complete observation,
not only before it, and records a sanitized browser product/version. The default
remains the two-context stress configuration with read-only concurrency
observations. No runtime focus, visibility or rendering policy is changed.
Timeout/cancellation tests cover pending native operations and conservative
cleanup failure when an unresolved command prevents certified restoration.

The durable-controller run (`r3-prod-native-foreground-b.json`) verifies
production `466244989` before/after on Chrome 151.0.7922.47, with the same clear
Winter seed 20260906, low preset, scale 1 and real TURN relay:

| Measured role | Frame p50 / p95 / p99 / maximum | Frames |
| --- | --- | --- |
| Host | 16.7 / 25.2 / 27.7 / **42.5 ms** | 1,186 |
| Guest | 18.8 / 26.8 / 33.0 / **49.0 ms** | 1,064 |

Both admissions and both complete role observations classify as
`single-foreground-live-background-observed`. During the host observation the
guest rendered **zero** animation frames while advancing 465 background ticks,
465 input packets and 465 snapshots. During the guest observation the host
rendered **zero** frames while advancing 410 background ticks/inputs and 376
snapshots. Original windows were restored, sessions detached, native room
closure verified, and the owned browser closed. Hard snaps and page errors were
zero. This run passes the strict 50 ms maximum-frame check, not a universal
16.7 ms frame budget or a separate-device performance certification.

Its shooting report still has two ambiguous guest attempts after native window
restoration lost pointer lock; one gesture reacquired mouse capture instead of
being an eligible shot. Host 4/4 and the remaining guest 3/3 ready firing
attempts matched; the report retains the two ambiguous attempts rather than
erasing them. Guest predicted callback median/max was 6.9/18.2 ms and next-RAF
callback median/max 36.9/41.5 ms. These are application callback latencies, not
instant click-to-photon. A native pre-measurement input-readiness step is needed
before using this window-control scenario as a clean shooting-response test.

### Final native-input control and scope of completion

The final unprofiled production repeat (`r3-prod-native-foreground-c.json`)
verified `v1.0.0+g466244989` before and after with the same browser, seed,
presentation and forced live TURN connection. The explicit
`--performance --render-workload=single-foreground` option now checks native
canvas pointer lock and settled input before starting the observation. It uses
at most one trusted click, never fabricates input/focus or refunds ammunition,
and reports preparation actions separately. Default dual-render tests are
unchanged. Any real preparation shot remains counted and would preclude a
cold-first-shot claim.

| Measured role | Frame p50 / p95 / p99 / maximum | Frames | Timed shots |
| --- | --- | --- | --- |
| Host | 16.7 / 25.3 / 27.2 / **35.3 ms** | 1,180 | 4/4 matched |
| Guest | 19.1 / 29.3 / 37.1 / **46.5 ms** | 1,043 | 4/4 matched |

Host preparation required no click; the guest required one capture click and
321 ms of preparation. Both reported **zero preparation shots** and unchanged
ammunition `[24, 4, 18]`. All eight timed attempts were eligible and matched,
with no ambiguous attempts. Guest predicted effect callback median/maximum was
**5.3/10.8 ms**, and its next-RAF callback was **32.6/46.5 ms**. Authoritative
guest confirmation took **49.9/87.7 ms** median/maximum; neither number is a
click-to-photon measurement or a promise of zero network latency.

Both complete observation windows pass the single-foreground/live-background
classification: inactive guest animation delta 0 with 465 background ticks,
inputs and snapshots; inactive host animation delta 0 with 416 of each. Relay
verification sampled 48 times. There were zero hard snaps, missing-snapshot
estimates, dropped histories, observer failures or page errors. Both native
windows were restored, diagnostic sessions detached, explicit room exit and
closure verified, and the owned browser closed. No user/foreign process was
stopped.

Five focused tool/registry selftests pass on the final source. The registry
discovers **560 ordered checks**, not a claim that the entire 560-check suite
was rerun. The three changed tool modules pass the quality gate across 338
functions with zero complexity violations, `any` or `unknown`; diff checks
pass. The runtime typecheck, public build and terrain gates above cover the
already-deployed cache change; this follow-up is tools/tests/documentation only.

Two completed corrected workload runs pass the 50 ms maximum-frame check.
The cache benchmark demonstrates less cold aiming work, while the window
control corrects test workload accounting rather than changing the game's
renderer. The old dual-render receipts, the failed 83.1 ms native control,
and profiler-overhead evidence remain retained. **The exact cause of the
historical 214–319 ms pauses is still not proven.** These short same-machine
relay tests do not establish universal 60 FPS, different-device behavior,
distant-network performance or the absence of every future stall.
