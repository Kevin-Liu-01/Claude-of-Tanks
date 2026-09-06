# Multiplayer response latency — September 2026

Baseline: `b970e9caadb681903b9b35ae1dfecb3650598dfa`, canonical production,
2026-09-05. This is a follow-up to [the multiplayer reliability audit](multiplayer-smoothness-2026-09.md).
Implementation and release verification are still in progress; measurements below
must not be mistaken for a deployed fix or an unconditional zero-latency claim.

## What is being measured

Native private-room controls create and join a temporary 1v1 room on the actual
deployed website, launch Winter, drive/turn and click the canvas. Two fresh
browser contexts render on the same machine at 1280×800, DPR 1. Each foreground
role is sampled for 20 seconds while its partner remains connected. The probe
does not replace the production endpoint, inject tank state or alter ICE policy.

`tools/production-private-room-ui.mjs --url=https://cot.kevinliu.studio --performance`
records application input edge → own firing-event callback → next rAF callback.
These are scheduling measurements, **not** physical click-to-photon or speaker
latency. A callback and a frame being delivered do not establish when a display
or audio device presents them. Only events correlated with one ready local
trigger count; missing and ambiguous receipts remain explicit failures/gaps.
No room codes, player IDs, capabilities, SDP, IP addresses or raw network packets
are written into the report.

Application RTT is the game's smoothed reliable-control PING/PONG timing.
Selected candidate-pair RTT is separately labelled STUN/consent timing; neither
is interchangeable with input-to-feedback delay. The meaning of that candidate
statistic follows the [W3C WebRTC statistics specification](https://www.w3.org/TR/webrtc-stats/#dom-rtcicecandidatepairstats-currentroundtriptime).
Likewise [`bufferedAmount`](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/bufferedAmount)
only describes the browser's outgoing queued bytes, not total network latency.

## Production baseline

Both peers selected host UDP candidates; this is a same-machine production
frontend/signaling test, not geographically separated players or a TURN gameplay
certificate. Another task's tank-rendering job was paused for the baseline, but
unrelated browser CPU/GPU work was not controlled. Frame tails are recorded,
not used as an uncontended hardware-performance certificate.

| Measurement | Host | Guest |
| --- | ---: | ---: |
| Ready triggers / confirmed callbacks | 4 / 4 | 4 / 4 |
| Input → firing callback median | 84.8 ms | 53.3 ms |
| Input → firing callback maximum (4 samples) | 103.0 ms | 126.4 ms |
| Authority EVENT arrival → firing callback maximum | Loopback; not an RTC arrival | 84.9 ms |
| Application smoothed RTT p95 | 0 ms | 16.87 ms |
| Visible frame-gap p95 / p99 | 32.9 / 38.4 ms | 30.6 / 35.7 ms |
| Sampled last reconciliation error p95 | 0.3652 m | 0.7186 m |
| Hard snaps / dropped input history | 0 / 0 | 0 / 0 |

All eight ready clicks matched, with zero ambiguous shots, page errors or probe
observer failures. Native departure removed the room and closed the browser.
The sampled reconciliation-error distribution is the predictor's diagnostic,
not an external ground-truth path measurement; cumulative correction maxima are
also labelled as cumulative in the machine report, not reset-window maxima.

## Reproduced software delays

The existing 60 Hz simulation publishes snapshots at 20 Hz. Accepted firing
events were waiting for that snapshot boundary, then the own-player event was
waiting for remote interpolation and a one-heavy-effect-per-frame presentation
queue. A deterministic real-client fixture places the own shot last in a
14-shot volley at 2000 ms: receipt is immediate, interpolation eligibility is
2066.67 ms, but own presentation reaches 2283.33 ms. That is **283.33 ms of
software-imposed delay**, independent of actual packet transit.

Remote interpolation remains useful: it trades a bounded amount of delay for
stable movement under uneven snapshot arrival. It should not hold back the
local player's already accepted firing feedback. This distinction follows the
original [snapshot interpolation discussion](https://www.gafferongames.com/post/snapshot_interpolation/);
its example buffer values are not adopted as this game's tuning.

The upload cadence also discarded fractional phase after each send, so a
nominal 60 Hz held input stream became 45 Hz at a 90 Hz display and 48 Hz at
144 Hz. Retaining upload phase separately from actual replay duration avoids
that aliasing without sending catch-up bursts after pauses.

Local movement was being reconciled from a second smoothed/extrapolated pose,
with unacknowledged input replay disabled. Its correction decay was also applied
twice on frames receiving a new snapshot. The replacement is being verified
against the shared zero-network movement model with delayed input/snapshot
delivery, rather than comparing a deliberately leading prediction to the
server's past-time position.

## Local regression receipts (not a production result)

The accepted-shot fixture now flushes a real host's viewer-filtered shot after a
non-snapshot simulation tick. The own client presents it on the first display
frame after receipt, without serializing another snapshot. Other players' hidden
shots remain filtered, and reload, empty and disabled-weapon denials create no
accepted recoil. The local speculative presentation path uses an exact
intent/slot echo; execution tests of the production audio/FX receivers prove no
speculative whizz, crew call, shell ID or prop sweep, and no duplicate confirmed
flash/report. Camera tests cover the same dedup and disposal boundary.
An independent encoded-wire check caught two otherwise easy-to-miss defects:
the compact input codec initially omitted the intent echo, and a late shot plus
same-tick impact could register in reverse order. Both have checked-in regression
coverage. Negotiation keeps 18-column input packets for old hosts; new hosts
advertise the optional, strictly validated 19th intent column. Actual host
loopback, cannon, ATGM, held autocannon, denial and sequence-wrap cases pass.

The shared-model movement A/B fixture drives, turns, brakes and contacts an
obstacle. Error is relative to a present-time zero-network run, not authority's
past-time position:

| Fixture | Old mean trajectory error | Raw authority + replay |
| --- | ---: | ---: |
| 60 Hz display | 0.772 m | 0.026 m |
| 144 Hz display | 0.775 m | 0.124 m |
| Variable display, 90 ±15 ms each way, 3% input / 5% snapshot loss | 0.982 m | 0.253 m |
| Shared collision model, obstacle contact | 0.214 m | 0.023 m |

Largest backward contact step in that obstacle fixture fell from 0.9996 m to
0.0138 m. These synthetic inputs are reproducible regression receipts, not
claims about every map, connection or player. Predictor coverage passed 100%
lines/functions/branches/statements; bounds and lifecycle tests remain required.

A proposed unilateral 250 ms prediction freeze was **rejected by tests**: the
server's braking tank still coasts, while a downlink-only outage can leave it
driving. Freezing produced 26–33 m correction and a hard snap in a 2-second
blackout fixture. The implemented soft-gap policy instead applies coordinated
neutral/brake after 500 ms of missing advancing authority, both to upload and
the local shared movement model. It cancels pending fire/action intent once,
continues inertial movement and uses the existing reconnect status; a new
authority tick restores controls. The 5-second reconnect watchdog is unchanged.

The actual frame-pump regression combines a 2-second blackout with 90 ±15 ms
each-way delivery and 3% loss at 60/144/variable display rates. In both-way loss,
recovery errors of 8.874/9.053/9.118 m and one hard snap each become
0.363/0.657/0.677 m with no hard snaps or backward steps. Downlink-only remains
snap-free: 0.311/0.359/0.304 m becomes 0.120/0.416/0.248 m. The 144 Hz case has a
0.057 m larger correction, disclosed rather than hidden; authority is safely
braking instead of continuing unseen movement. Physical outages still interrupt
control—this is bounded recovery, not a promise to play through missing data.

Local Cloudflare runtime with real wall-clock timers and live WebSockets removed
an abruptly disconnected host's room after 90,005 ms and a silent-open host's
room after 179,995 ms. A guest kept heartbeating in both cases and did not prolong
the host lease. Both rooms returned `room_not_found` and all owned sockets closed.
This is distinct from the accelerated Workers unit tests and still requires
repetition against the deployed Worker.

The full suite exposed an explicit-Leave race in the LAN adapter: a native
client sends Leave and immediately starts closing, while an awaited cleanup
check postponed command dispatch. The old open-socket guard discarded the
already-received Leave. The fix admits only that authenticated, current-seat
Leave across the closing transition; closed create/join/relay and retired-seat
commands remain fenced. Fourteen native cleanup cases and the unchanged-deadline
production-readiness fixture pass.

The scoped React Doctor scan reports 83 with one warning: ordered awaited
notification delivery in the signaling adapter. This is a low-frequency room
lifecycle path whose delivery ordering is intentional, not a render-frame task.
It is not comparable to the earlier whole-repository score of 49. Direct code
quality gates for the audio/FX/camera changes pass (399 functions, zero complexity
violations), and actual receiver execution tests pass without requiring a GPU.

The rendered local comparison also passed its unchanged motion, correction,
entry/reset and frame-budget assertions: 1280×720 DPR 1, CPU rate 1, ten seconds
per role, private-room mode, added 90 ±15 ms each way, 5% state and 3% input loss.
This is the committed `multiplayer-render-perf.mjs` development harness, not
production or a like-for-like rendering workload: its solo roster has 14 tanks,
and its network fixture is 2v2. A fleet test used one CPU core concurrently.

| Rendered fixture | Frame-gap p95 | Freezes | Hard snaps | Moving-frame stalls |
| --- | ---: | ---: | ---: | ---: |
| Solo | 32.6 ms | 0 | N/A | 31 |
| Private host | 25.3 ms | 0 | 0 | 0 |
| Impaired private guest | 17.8 ms | 0 | 0 | 0 |

The guest measured 203.8 ms application RTT, 0 pending outgoing bytes, zero
decode errors and no dropped prediction history. Its largest free reconciliation
error was 0.6224 m and largest correction step 0.08894 m. These results establish
that the impaired peer passed the existing software gates; they do not establish
that multiplayer universally renders faster than single-player.

A separate 14-browser-context, seven-versus-seven WebRTC capacity run passed
balanced roster synchronization, authority handoff, every match handshake and
clean departure under the same impairment parameters. Over eight seconds of
driving plus three seconds of settling, authority advancement averaged 0.384 ms
and peaked at 3 ms, with no dropped catch-up time. This fixture runs real browser
networking and shared simulation without fourteen full Three.js renderers; it
is a capacity/protocol receipt, not a fourteen-rendered-player FPS certificate.

## Limits and release gate

Pre-release validation passed all three repository test segments (88 pre,
365 captured core, 28 post), plus the subsequently registered stale-authority
test and the final changed firing/probe tests. Suite discovery now reports
482 ordered checks. The original core run exposed the Leave race described
above; the repaired core segment was rerun to completion rather than treating
the first red run as green. An additional final pre-segment repeat is separate
from those completed receipts. Root and Workers typechecks, public build,
30 Workers tests and the 19-runtime-file quality gate pass (1,072 functions,
zero complexity violations, explicit `any` or `unknown`).

Hits, damage, ammunition, reload and results remain authoritative. Physical
network travel, host CPU stalls and browser suspension cannot be made zero by
presentation code. Packet loss and collisions sometimes require real corrections;
hiding those corrections or weakening authority is not success.
An immediate local flash/report can precede a denial caused by a server-side
change that has not reached the client yet (for example, newly destroyed gun
modules). Readiness freshness and one-intent-per-ready-cycle limits bound this;
they cannot remove that uncertainty without waiting for a round trip. No
speculative hit marker, projectile or ammunition change conceals a denial.

Before release: focused lifecycle/weapon/movement tests, adverse-network and
contact fixtures, typecheck/build, live-room closure/abandonment checks, and a
repeat of the exact production native-control measurement. Record the exact
shipped revision and measured results here when completed.
