# Multiplayer smoothness and reliability — September 2026

Date: 2026-09-05. Baseline commit: `da5e0cf0af4e4ddf7a29ec78d7e1c120ce12755b`.

Current deployment status: release `adbcf2aaf` is live on the canonical website
with Cloudflare room signaling and the existing TURN service. The old canonical
Redis signaling route returns HTTP 410 and requests a refresh. See the final
Cloudflare section and [hosting receipt](../MULTIPLAYER-HOSTING.md) for exact
versions, production checks and limitations. Earlier **not deployed** statements
below describe their historical verification phase, not the current cutover.
The abandoned-room follow-up at the end records its initial local checkpoint;
the [subsequent live release receipt](multiplayer-response-latency-2026-09.md#production-release-and-repeat-measurements)
includes production cleanup verification.
The [firing-response follow-up](multiplayer-response-latency-2026-09.md#production-warmup-follow-up-shells-and-guided-missiles)
records the subsequent actual-compositor warmup, first-shot improvement and
retained adverse frame measurements. The Cloudflare room Worker remains the
verified `10ac577de` backend; these later changes concern browser rendering only.

Pre-cutover verification: focused verification, strict LAN and severe impaired-private rendering,
four-/14-human capacity, persistent-room reconnect/rematch, natural rendered
host/client matches, and actual hidden-tab behavior are recorded below. The
earlier Redis-free hardening boundary passed all 457 ordered tests, typecheck
and public/private builds. The subsequent user-approved private/LAN-only product
and broken-room UX slice passed its focused, browser, typecheck and public-build
gates; the strict suite's responsive-policy failure and successful tail rerun
are recorded in the final verification section below. At that earlier boundary,
production room creation was blocked by the signaling database's exhausted
monthly command quota and those changes had not yet been deployed.
Hidden-browser hosting slowdown and the failed CPU-rate-4 budget are documented
limitations. This record does not claim zero network latency or certify an
untested production deployment.

## Scope and success criteria

The reported symptoms were wobbly tanks, glitches, and lag across multiplayer.
The investigation covered LAN, private Internet rooms, and dedicated/ranked
transport; local and remote tanks; healthy and damaged movement; alternative
game modes; packet loss/reordering/backpressure; death/respawn; and cold entry.
Solo remains the comparison baseline, not a replacement network architecture.

Success means responsive local movement and aiming, bounded and physically
plausible remote presentation, no preventable stale-input backlog, lifecycle
transitions that do not fabricate motion, recoverable transport errors, and
evidence from the actual player entry surfaces. Hits, damage, reloads, spotting,
consumables, and match results remain authoritative.

## Shared architecture and ownership

| Player path | Simulation authority | Delivery | Presentation owner |
| --- | --- | --- | --- |
| Solo vs bots | In-page integration of shared simulation modules | Direct, no network runtime | Existing local battle frame path |
| LAN host | Browser `AuthoritativeMatchRuntime` | Synchronous in-process host client plus WebRTC peers | Shared bridge and local predictor |
| LAN/private guest | Host browser | Reliable ordered control/events; unordered zero-retransmit RTC state/input lane | Local predictor plus buffered remote snapshots |
| Private Internet host/guest | Host browser | Same RTC path, with TURN when required | Same presentation code as LAN |
| Ranked/dedicated client | Dedicated Node match | Authenticated WebSocket with replaceable-state coalescing | Same bridge, predictor, and snapshot buffer |

The ranked row documents the retained internal compatibility implementation.
The current player-facing contract is Solo, Private and LAN only. The selected
Internet deployment uses Cloudflare per-room Durable Objects and the existing
TURN service; LAN can use the local in-memory helper. Neither requires
ranked/dedicated simulation, Redis, Supabase or rating storage. See
[the deployment/runbook](../MULTIPLAYER-HOSTING.md). The earlier self-hosted
single-process implementation remains an alternative, not the live backend.

The authoritative match runs at 60 Hz and publishes snapshots at 20 Hz.
Browser input upload cadence is separate from render cadence. The local tank
responds every display frame using the shared movement integrator in bounded
semi-fixed steps: at most `1/60 s` per substep, with a fractional remainder and
a `100 ms` per-call catch-up ceiling. This is not bit-identical fixed-step
integration at every display refresh rate; the measured difference is recorded
below. Replacing it with held 60 Hz poses without render interpolation would
introduce another visible cadence defect.

The first smoothness release's browser own-entity sample already accounted for the sampled network time.
That path does not replay unacknowledged render durations a second time. The
raw-authority-only predictor path retains explicit unacknowledged-input replay.
Both discarded confirmed input history using real sequence acknowledgements.
The subsequent [response-latency wave](multiplayer-response-latency-2026-09.md)
supersedes that browser policy: raw own authority plus bounded input replay
removes the second smoothed/extrapolated reconciliation target. The earlier
measurements below remain historical, not evidence for the new code path.

`snapshot.ts` pairs the own tank's latest pose and `localPrediction` metadata
at one authority tick. Remote objects and their presentation metadata remain on
the interpolation timeline. `browserBattleBridge.ts` applies viewer-specific
movement dependencies before reconciliation; it never computes combat results.
The host and dedicated service serialize only that viewer's dependency record,
not another vehicle's concealed module, crew, or equipment state.

## Reproduced defects and fixes

### 1. A parked hold followed contact noise on real browser frames

The old parked-tank test called `present()` between snapshots. Actual browsers
also call `advancePrediction(idle, dt)`, which advances terrain support and hull
springs. A fixed correction offset follows those changing simulation values,
so it was not actually holding the displayed hull.

The regression now uses a flat contact field, an authoritative `0.017 m`
settled support height, alternating `±0.01 m` height noise and small pitch/roll
noise at 20 Hz, plus idle prediction at 30/60/120/144 Hz. It runs three seconds
and measures the final two seconds.

| Deterministic measurement | Baseline | Patched |
| --- | --- | --- |
| Parked height range at 30 Hz | `0.018160623 m` | `0 m` |
| Parked height/pitch/roll range at each of 30/60/120/144 Hz | Baseline fails the first 30 Hz height gate | All three channels measure `0` in this fixture |
| Regression acceptance budgets | Height `<1 mm`; pitch/roll `<0.2 mrad` | Pass at all four refresh rates |

The predictor now recomputes only the presentation hull correction after an
idle integration step while the actual state remains inside the established
rest budget. Simulation, terrain collision, and authority are untouched. The
existing reusable pose record avoids an added allocation per frame.

Drive input, hull yaw rate, airborne/overturned/auto-righting state, meaningful
authority vertical movement, active hydraulic aim, or displacement outside the
rest budget releases the hold. Sight-driven casemate auto-traverse also releases
it on the first frame, even without a manual steering input. Turret and gun
correction remain independent; parked stabilization cannot freeze aiming.

### 2. Local prediction lacked authoritative movement dependencies

The shared movement model depends on engine/transmission/track damage,
turret-ring or gun-mount condition, gun condition, driver/gunner availability,
equipment multipliers, and game-mode mobility. Existing basic pose/HP snapshots
did not reconstruct all of these dependencies. A client could therefore keep
predicting healthy motion while authority slowed or immobilized it.

`predictionAuthorityState.ts` now captures a bounded, viewer-ID-bound metadata
record. Authority adds it to snapshot metadata, the sampler carries it beside
the latest own pose, and the bridge applies it before prediction. Existing
authored module objects are updated, not replaced or invented: adding a fake
`turretRing` to a casemate would incorrectly mask its `gunMount` fallback.
Missing or wrong-viewer metadata is not applied.

The predictor also follows the authority-enabled `suspensionAim` flag and
`modeSpeedMultiplier` on every advance/replay, and copies predicted suspension
lay into presentation. Turbo Ball's `1.85` mobility multiplier is no longer
silently dropped. Local action bits do not self-authorize a special mode.

Focused tests compare real M1A2 and UDES 03 movement for 120 steps with healthy,
damaged, immobilized, crew/equipment, and mode modifiers; the tested authority
and predicted paths agree within `1e-12`. Additional predictor tests prove
hydraulic activation/deactivation and exact shared movement at the normal and
Turbo Ball speed policies.

### 3. Grounded extrapolation treated suspension velocity as free flight

Remote extrapolation used the last `vy` directly even when a grounded tank's
support probe produced a transient or reversed derivative. A packet gap could
therefore send its chassis through the floor, followed by a correction upward.

The grounded path now requires continuous prior support samples and consistent
velocity direction, then bounds vertical continuation by three times the
observed height secant. Airborne tanks retain authoritative vertical velocity;
the local predictor retains its own raw authority/support path.

| Fixture, sampled 100 ms beyond the latest row | Baseline | Patched |
| --- | --- | --- |
| Last support `2.02 m`, stale opposing `vy = -5 m/s` | `1.52 m` | `2.02 m` |
| Last support `2.01 m`, observed ascent `0.2 m/s`, support spike `vy = 5 m/s` | `2.51 m` | At most about `2.07 m` |
| Consistent `+1 m/s` ramp from `2.05 m` | Must preserve ascent | `2.15 m` |
| Consistent `-1 m/s` ramp from `2.05 m` | Must preserve descent | `1.95 m` |

This does not add a second collision authority or claim collision-perfect
extrapolation. Unexpected contact during lost packets still requires a later
authoritative correction.

### 4. Interpolation crossed lifecycle discontinuities

Ordinary interpolation previously blended teleports, nearby respawns, and
vehicle replacements as though they were continuous driving. Rest anchors could
also survive spotting gaps, while dead snapshots retained stale drive velocity.

The sampler now classifies identity/team/death transitions and implausible
displacement as discontinuities. A respawn starts at its new pose, including
spawns below the usual teleport-distance threshold. A destroyed vehicle does
not extrapolate a pre-death velocity; a later authoritative push still moves
the wreck. A visibility gap releases the prior presentation cache and rest
anchor. Airborne apex and auto-righting motion do not use parked deadzones.

Measured regressions include a `0→100 m` teleport whose midpoint was formerly
`50 m` and is now the authoritative `100 m`; a wreck at `0.5 m` with stale
`10 m/s` velocity formerly reached `1.5 m` after a `100 ms` gap and now remains
at `0.5 m`; a re-spotted pose at `0.02 m` formerly reused an old `0 m` anchor
and now starts at `0.02 m`.

The local predictor separately treats terminal state and respawn as lifecycle
boundaries. First authority may already describe a wreck: it clears input
history, records one terminal transition, and rejects local movement/aim input.
Terminal reconciliation does not replay pending drive inputs beyond the final
pose. A later live authority sample resets correction, input/contact history,
and drivetrain state, even when the new spawn is only three meters away.
Legitimate respawns do not inflate network hard-snap diagnostics.

A final review caught an over-broad terminal early return in the first patch:
disabling input/simulation also stopped the wreck's presentation correction
between incoming snapshots. The terminal branch now advances correction only
on display frames. With no subsequent snapshot, a `1 m` staged offset formerly
remained `1 m` after one second; it now settles to about `0.000113 m`, while
simulation position remains unchanged and pending input stays zero. The
regression alternates held driving and null controls to ensure neither can
restart a terminal vehicle.
The frame pump now forwards null controls once per display frame in both host
and client paths, so the actual death path reaches that correction-only branch
without recording an invented input. Focused pump coverage verifies the wiring.

Snapshot timing configuration now rejects non-finite values and fractional
capacity. Newer ticks with regressing authority time cannot poison the buffer;
clearing it also clears render-clock/rest/visibility state.

### 5. Native send queues accumulated obsolete inputs and poses

Byte ceilings alone were insufficient: many small packets fit below a native
queue's threshold, but bytes already enqueued cannot be replaced by newer state.
A simulated stalled channel accepted 60 obsolete native packets before the fix.

Replaceable state/input now enters the native queue only after it drains; the
application retains one newest pending packet per replaceable lane. The same
fixture sends one native state packet plus one newest pending packet. Reliable
control retains its byte-budget headroom. When both replaceable slots share a
channel, input has initial preference and successful admissions then alternate;
continuous input cannot starve snapshots or vice versa. A 12-drain regression
replenishes both slots continuously and checks fairness and newest payloads.
A packet larger than its own lane budget is rejected rather than accepted
into an impossible-to-flush slot.

Native `OperationError` and `InvalidStateError` cases now follow the transport
failure contract. Replaceable queue-space failure can retain the newest pending
packet; closed-state races become `TransportClosedError`. Client send failure
produces one disconnect/recovery edge instead of throwing a DOM exception
through the frame pump or falsely reporting successful input upload.

This bounds application-created stale backlog. It cannot remove bytes already
inside browser/OS/network buffers or eliminate WebSocket head-of-line blocking.

### 6. Acknowledgement and admission edges lost actions or poisoned ordering

`Number(null)` equals zero, but a snapshot's null input acknowledgement means
no input has been received. Treating it as acknowledgement zero could retire
the first fire/repair input after that packet was lost. Null now remains null,
and action edges continue retrying until a real accepted receipt arrives.

Authority now commits envelope and input sequence watermarks only after full
input admission, including tick and snapshot-ack validation. Invalid high
sequence packets cannot suppress later legitimate controls. An old missing-
baseline delta arriving after a newer accepted snapshot is discarded instead
of resetting the valid baseline receipt. Input acknowledgement is applied only
after snapshot assembly, round admission, and buffer acceptance, so an obsolete
round cannot retire current-round actions.

Tests cover first-packet loss, exact-once repair consumption, malformed/future
inputs, invalid snapshot acknowledgements, reordered deltas, stale rounds, and
single-edge recovery on native closure/backpressure. Control authority and
sequence validation remain intact; invalid data is not tolerated to improve
apparent smoothness.

### 7. Cold entry retained the previous result until code loaded

The full-render gate seeded `game.result = 'victory'`, invoked the real debug
entry surface, and immediately inspected the handoff. Warm entry reset result
state synchronously; cold entry showed an opaque loader but awaited multiplayer
composition before clearing the previous result. The failure was the
`collectFullRenderer` entry-reset assertion, not a new match deciding victory.

The four-field round reset now lives in the boot-safe `networkRoundState.ts`
leaf and is shared by the loaded round lifecycle and cold intent cover.
`main.ts` passes the game port to that existing cover. Cold and warm paths clear
result, result reason, elapsed match time, and pre-battle timing consistently.
The focused regression failed with the prior victory/91-second state and now
passes before any import/await. The browser assertion remains enabled.

### 8. Production diagnostics hid the dependency that actually failed

Distributed signaling's mandatory REST-command health decides whether room
operations are available. When command and optional subscriber checks both
failed, error selection could report the subscriber cause instead. Error
priority now follows the mandatory command path.

The production checker retains sanitized signaling health status, named error
codes, HTTP status, and allowlisted request/cache identifiers on failure. It
checks signaling and ICE independently so one failure cannot mask the other.
It does not log raw provider responses, TURN credentials, auth tokens, or
arbitrary error text from credential-bearing payloads. Better diagnostics are
not a repair of an unavailable external service; production state needs its
own receipt below.

Authenticated provider diagnosis then proved that `PING` remained successful
after ordinary commands exceeded the monthly allowance. Health now checks a
reserved short-lived `SET` with a ten-second TTL, sharing one on-demand probe
per process for five seconds, including failures. There is no background probe
timer. The internal `redis_request_limit_exceeded` code becomes a clear
`signaling_capacity_exhausted` user-facing error. That code suppresses the
immediate create/join store-retry burst. Existing room-poll discard/reconnect
and room-resume backoff retries remain, allowing recovery after capacity is
restored; this is not a blanket prohibition on all automatic retries.

Room TTL renewal was also needlessly repeated on every mailbox poll. Renewal
now occurs at most once per minute per local membership, or a quarter of room
TTL when shorter; mailbox delivery polling itself is unchanged. At the existing
500 ms idle-lobby polling cadence, the EVAL-plus-renewal path changes from about
`240` to `121` Redis RPCs per minute per peer. At the existing two-second battle
cadence it changes from `60` to `31`. These are direct call counts, not billing
or monthly cost projections: they exclude Lua-internal accounting, pub/sub,
relays, room mutations, and health checks. Redundant post-drain `LLEN`/`DEL`
calls were removed because popping the last list item already removes its key.
Tests retain delivery, TTL renewal, shared health, and quota-specific errors.

### 9. Terrain contact geometry differed between authority and prediction

Further integration review found that the browser predictor received prepared
visual contact geometry while authority used its simulation fallback. This is
a real difference in support height, support length, attitude, and downstream
terrain traction, not merely a correction-envelope tuning issue.

Geometry-only first-party vehicle construction followed by
`prepareForSimulation` reproduced the following against otherwise identical
specs and inputs for 600 ticks:

| Vehicle | Flat-field support-height difference | Wavy-field maximum Y difference | Wavy-field maximum 3D position difference | Wavy-field maximum pitch difference |
| --- | --- | --- | --- | --- |
| M1A2 | `0.064 m` | `0.19208 m` | `2.43726 m` | `0.05145 rad` |
| T-90M | `0.057 m` | `0.14284 m` | `0.70155 m` | `0.02214 rad` |
| UDES 03 | `0.0595 m` | `0.15142 m` | `0.84682 m` | `0.02215 rad` |

The wavy fixture uses `h = 0.25 sin(z/2) + 0.15 sin(x/2)`, throttle `1`,
steer `0.2`, and ten seconds of simulation. For the M1A2, the prepared geometry's
half-length was `2.315 m` versus the fallback `3.5685 m`, with bottom offset
`-0.064 m` versus `0`. These differences explain recurring terrain corrections
even when networking itself delivers cleanly.

The bridge now passes `contactGeom: null` to prediction, matching the headless
authority's spec-derived footprint. The visual retains its authored
`visual.contactGeom`; vehicle builders, visual geometry, and combat anatomy
were not changed. This is a scoped simulation-input parity fix, not a fleet
geometry redesign.

A regression constructs all three actual authored vehicles, prepares their
geometry, and advances the real bridge predictor alongside authority over the
same 600-tick wavy-field fixture. Maximum 3D position error is below `1e-9 m`
for all three, compared with up to `2.43726 m` before the fix. This closes the
specific real-browser contact seam that synthetic-spec or flat-field tests
alone could not certify. It does not prove every terrain/contact interaction
under arbitrary packet loss.

### 10. The binary codec lost null receipts and guided-shell identity

Object-level snapshot tests did not expose a second `Number(null)` coercion in
the binary decoder. The real wire round trip now preserves null input receipts
and rejects non-null receipts outside the protocol's integer sequence range.
The null-receipt fix is therefore covered at both codec and runtime admission.

The compact shell row also omitted `guided`, so a guided missile could enter
the ordinary ballistic presentation path after transport. The codec now carries
guided shell IDs in a reserved metadata sidecar while preserving the existing
nine-column shell row. Older clients can still decode the row and ignore the
unknown metadata; newer clients restore the flag and remove the codec-only
sidecar before returning gameplay metadata. Sidecar IDs must be unique,
nonnegative integers belonging to the already-visible shell rows, with the
existing 256-shell bound. No hidden entity coordinates are added. Old senders
without the sidecar retain conservative non-guided decoding.

### 11. Ranked queue work could outlive the user's intent

Ranked setup performs asynchronous profile refresh, queue join, polling, and
match handoff. A mode switch or dismissal could occur before a ticket existed;
a later HTTP response could then update a replacement search or reopen a
canceled handoff.

`rankedQueueLifecycle.ts` now assigns one attempt before the first await. It
owns its abort signal and exact ticket, prevents duplicate simultaneous joins,
and invalidates synchronously on cancel. A late queued ticket is canceled by
that attempt without touching a replacement attempt. UI updates, poll callbacks,
errors, and handoff all check current ownership. A handed-off match is no longer
treated as a queued ticket to cancel; disposing the menu cancels active intent.
An additional review found that awaiting failed-attempt cleanup before throwing
to an outer click handler could still overwrite a replacement search. Error
and button UI now commit synchronously while the failed attempt is current;
its exact-ticket cleanup continues without a stale throw into later UI state.
Focused tests cover pre-ticket cancellation, late join/replacement, and matched
handoff. These are local lifecycle guarantees, not proof of ranked production
availability.

### 12. Garage worker transfer changed per-instance data into per-vertex data

The first full natural-combat host gate failed native WebGL `1282`. The added
phase probes localized the error to before measured combat: pre-combat `1282`,
before/after the shadow probe both `0`. Captured warning-level messages identified
invalid instanced draws whose vertex buffers were too small for their draw call.
This was not a new shadow-probe failure or evidence against network pose logic.

The opt-in `--gl-buffer-diagnostics` harness then captured eight distinct failing
garage display-tank running-gear objects. For `gearRoadWheelDiscs` under the
worker-rebuilt Abrams exhibit, the native call drew 888 vertices for 14 instances.
Its GPU matrix allocation was the correct `896 bytes` for 14 matrices, but all
four matrix attribute columns had divisor `0` instead of `1`. GPU state therefore
advanced through matrices per vertex and requested data beyond that allocation.
Road tires/insets, return rollers, suspension links/bosses, and track pads showed
the same defect during the garage phase.

`garageWorkshopTransfer.ts` had rebuilt matrix/color arrays with ordinary
`BufferAttribute` and then cast them to `InstancedBufferAttribute` in TypeScript.
A type assertion cannot create the runtime instancing flag or divisor. Both
fields now use the actual `THREE.InstancedBufferAttribute` constructor. Received
typed arrays, values, normalization, geometry, materials, and transfer cadence
are unchanged; vertex positions remain ordinary per-vertex attributes. No
larger buffers, hidden objects, altered draw counts, or suppressed GL errors
were used to pass the gate.

A streamed worker-reply→`createVisual()` regression failed before the fix on
the matrix's runtime type, then passed for matrix/color instancing, divisor 1,
normalization, exact array reuse, reconstructed transforms, ordinary vertex
inputs, and cloned instance state. The same instrumented 14-player host browser
run subsequently passed: `329,309` instanced draws, zero retained native errors,
zero WebGL warnings, zero captured browser errors, and all three phase error
values `0`. It recorded 42 shots from all 14 shooters and no prediction hard
snaps. This 15-second diagnostic run did not complete a natural match or produce
visual destructions; it closes the reproduced buffer error, not every rendered
combat gate. Instrumentation is intentionally expensive, so its frame timings
are not performance evidence.

Before/after receipts are
`/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/gl-buffer-before.json` and
`/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/gl-buffer-after.json`;
the corrected command log is
`/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/gl-buffer-fixed.log`.

### 13. Backgrounding the browser stopped authority but retained held controls

The old scheduler intentionally suspended hidden/unfocused rendering, but the
same frame path also owned the browser-hosted match. A real scheduler/authority
regression kept RTC open while simulating 100 timer callbacks over ten seconds
after blur: authority tick remained `3→3`. Separately, previously received
throttle/fire intent could remain active after the sender stopped supplying it.

Active network sessions now have a background-only service callback, requested
every `50 ms` while backgrounded; the existing `100 ms` foreground/solo/garage
watchdog policy remains. The callback advances the host or updates the client
without bridge application, local prediction, UI, FX, or GPU work. One cached
neutral input preserves aim and ammunition selection while setting throttle,
steer, fire, and actions to zero, with brake and aim lock enabled. The focus
boundary clears input-runtime latches, raw keyboard/touch/aim state, and pending
fire/action retry intent. It does not replace another peer's fresh input.

The real Node integration composes scheduler→browser session→frame pump→local
protocol client→authority, plus an independent remote peer. Over ten seconds of
scheduled background callbacks, tick advances `1→601` (600 fixed ticks), with
unchanged renderer/presentation-application/prediction counters; the remote's renewed `0.6`
throttle remains admitted. Both visible-but-unfocused and hidden cases pass.
Pending fire/repair edges go from two to zero. A ten-second OS scheduling gap
is capped to `100 ms` of catch-up (at most six ticks); a simultaneous focus and
visibility return cannot consume the same elapsed time twice.

Authority also limits held input to `500 ms` of simulation time since the last
fully admitted fresh input. Exactly 500 ms remains valid; the first later tick
uses zero movement/fire/actions with brake and aim lock enabled, retaining aim,
ammunition selection, and the last real acknowledgement. Queued action edges
are cleared, but held-action deduplication survives until an actual release;
an outage must not turn the same repair hold into a second consumable use.
Simulation time is intentional here: this is not a wall-clock timer that
advances a suspended browser's world. For an actual UDES 03, failing to lock
stale aim left `0.001655193912 rad` of late casemate yaw drift over two seconds;
the final neutral policy measures zero. Detached/missing driver input uses the
same aim-lock/action-free policy. Client intent clearing resets retry owners,
not packet sequences or snapshot baselines, and is shared by blur, reconnect,
and round reset.

Resume review found that only draining newly received events was insufficient:
an effect already admitted to the bridge's queue could still play on return,
and a hidden death/respawn could retain prediction from the previous life.
Blur now clears the queued presentation effects and marks local prediction for
a fresh authority seed on return. Background samples retain only bounded
lifecycle/destruction metadata, never visual, HP, asset, or effect writes.
Current wreck cause survives so an actual ammo-rack wreck still has the correct
appearance; monotonic round/tick and the last observed live battle time reject
old-round or prior-life causes. Actual bridge regressions prove a queued second
shot and hidden fire/destruction events emit no delayed FX, a nearby unseen
respawn seeds exactly at `x = 3 m` with zero correction and no hard-snap count,
and valid ammo-rack cause survives while old-life/round causes do not.

These are deterministic integration receipts, not proof of a guaranteed 20 Hz
timer in a background browser. The optional real-browser `--background-check`
probe removes the harness's timer/renderer/occlusion overrides, foregrounds a
separate blank tab, and checks actual visibility/focus, continued authority
progress, neutral input receipts, and no hidden rendering. That browser run
passes functional servicing, but demonstrates a remaining hosting slowdown:
over `2002.8 ms` of actual hidden/unfocused state, only two background callbacks
ran, despite the requested 50 ms interval. The latest accepted raw authority
snapshot tick advanced `396→399`; this is `MatchClientRuntime.lastSnapshotTick`,
not an interpolated render tick or a direct read of every host simulation tick.
Renderer submission counter remained `6945`, display-frame counter `364`, and
neutral input packets advanced `2→4`, with no drive/fire/action retry packets
and cleared held controls. The observed roughly 1 Hz timer schedule, combined
with bounded catch-up, is a demonstrated browser-host background slowdown,
not singleplayer-equivalent background hosting. Browser and OS limits remain.

### 14. Readiness silently excluded required seats that had not connected

The authority's explicit required-peer list previously filtered out absent
peers before checking readiness. A fast host could therefore release the match
before a cold opponent arrived. Every explicit required seat must now exist,
complete its welcome, and signal ready. Pre-start departure restores the barrier;
rejoin must satisfy it again. The existing empty-list observer/bot fallback
remains, rather than accidentally requiring a nonexistent human seat.

Focused direct-runtime, private-host handoff, and authenticated dedicated tests
cover missing/late peers, pre-start disconnect, and rejoin. Existing real
WebSocket, private handoff, network, adverse delivery, and authority tests pass.
This closes admission ordering; it does not by itself impose a new loading
timeout or ranked-ticket expiration policy. The subsequent scoped dedicated
cleanup adds an explicit three-minute loading deadline: a match that has never
started and has no result is removed at or after `180,000 ms` from creation,
using an injected housekeeping clock. A final ready seat at `179,999 ms` starts
normally and remains active beyond that deadline. This is not a new combat
duration limit.

Native WebSocket closure reports code `4008`, reason `loading_expired`; the
dedicated client reports a terminal failure without auto-reconnecting or
auto-queueing, and disposes transport listeners/timers even if the protocol
client already observed closure. A final regression found that disposing only
the adverse-network wrapper still left one native WebSocket listener. The
connection now owns disposal of both layers for native/terminal close, failed
authentication or timeout, explicit close, and cancellation during connection.
The wrapped real-WebSocket case failed with one retained listener before the
fix; raw and impaired (`1 ms` latency) variants now pass with zero retained
listeners and timers. The ranked registry frees the exact account
reservations and unstarted-match rating bookkeeping without creating a result
or changing Elo. Expired public tickets remain available for two minutes for
status observation, then are reclaimed. Real local authenticated WebSocket and
ranked tests cover missing seats, timely final readiness, cleanup, and no rated
result. Browser readiness already has its separate 60-second user-visible
failure/garage return; that UI policy was not changed.

## Change map

| Source boundary | Changes and protecting checks |
| --- | --- |
| `src/net/localTankPrediction.ts` | Real-frame parked correction, mobility/hydraulic policy, terminal/respawn state, correction-only wreck settling; expanded `localTankPrediction.selftest.mjs` |
| `src/net/networkFramePump.ts` | Forward null controls for terminal presentation, service background network state without rendering, and share elapsed-time ownership; expanded frame-pump regression |
| `src/engine/frameLoopScheduler.ts`, `src/net/networkBrowserSessionRuntime.ts`, `src/game/input.ts`, `src/main.ts` | Background-only network servicing and input relinquishment; scheduler/input checks and real `networkBackgroundLifecycle.selftest.mjs` integration |
| `src/net/predictionAuthorityState.ts`, `src/sim/authoritativeMatch.ts`, `src/net/browserBattleBridge.ts` | Viewer-only mobility dependencies, latest-pose application, authority-matched contact input; focused helper, authority/privacy, and bridge regressions |
| `src/net/snapshot.ts` | Support-aware extrapolation, lifecycle/rest/visibility/clock guards, latest own dependency metadata; new `snapshot.selftest.mjs` |
| `src/net/snapshotWireCodec.ts` | Null receipt fidelity and backward-compatible guided-shell sidecar; real binary round-trip cases in the snapshot suite |
| `src/net/channelTransport.ts` | Native admission and newest-only pending state/input, budget and native-send error contract; new `channelTransport.selftest.mjs` |
| `src/net/matchRuntime.ts` | Atomic input admission, accepted-round/baseline ACK handling, failed-send recovery, held-input expiry and required-seat readiness; new `matchRuntimeDelivery.selftest.mjs`, handoff/dedicated regressions, corrected future-tick fixture in `net.selftest.mjs` |
| `src/net/networkRoundState.ts`, `networkRoundLifecycle.ts`, `networkBattleIntentCover.ts`, `src/main.ts` | Shared synchronous four-field reset on warm and cold entry; intent-cover and lifecycle regressions |
| `src/net/rankedQueueLifecycle.ts`, `src/ui/playMenu.ts` | Per-attempt queue ownership/cancellation and guarded UI/handoff; new `rankedQueueLifecycle.selftest.mjs` |
| `src/game/garageWorkshopTransfer.ts` | Reconstruct actual instanced matrix/color attributes from worker replies; new streamed `garageWorkshopTransfer.selftest.mjs` |
| `server/distributedRoomStore.ts`, `tools/production-multiplayer-check.mjs` | Real-command coalesced health, quota-specific errors, reduced redundant TTL/mailbox commands, and safe independent dependency diagnostics; signaling and production-check selftests |
| `server/dedicatedMatchRegistry.ts`, `server/dedicatedMatchServer.ts`, `server/rankedMatchmaker.ts`, `src/net/dedicatedClient.ts` | Unstarted-room deadline, exact reservation/rating cleanup, explicit terminal loading failure and native listener disposal; authenticated dedicated/ranked regressions |
| `tools/multiplayer-render-perf.mjs`, `tools/multiplayer-live-combat.mjs`, `tools/multiplayer-gl-buffer-probe.mjs`, `tools/selftest-suites.mjs` | Measured elapsed fixture time, destruction-burst failure details, phase-attributed retained WebGL errors/warnings, opt-in native instanced-buffer attribution, and registered focused suites; budgets not relaxed |
| `docs/MULTIPLAYER-ARCHITECTURE.md`, this record | Correct integration/contact contracts, preserve evidence and uncertainty, and link the operational record |

No playable vehicle geometry, renderer material, server tick-rate, combat
authority, or spotting trust boundary was changed for this investigation.

## Research and applied decisions

The following primary sources were read during this investigation. The code's
specific thresholds are project policy validated by its tests, not values
claimed to come from these articles.

- [Glenn Fiedler, Fix Your Timestep!](https://gafferongames.com/post/fix_your_timestep/):
  distinguishes fixed from semi-fixed integration and explains why displaying
  unmatched fixed ticks without interpolation stutters. We retained the bounded
  render-paced local path and measured refresh-rate divergence instead of
  describing it as exact fixed-step equivalence.
- [Gabriel Gambetta, Client-Side Prediction and Server Reconciliation](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html):
  motivates immediate local response while the server remains final authority,
  and using real input receipts to remove confirmed history. The game's sampled
  held-input path must also avoid double replay of elapsed network time.
- [Glenn Fiedler, Snapshot Interpolation](https://gafferongames.com/post/snapshot_interpolation/):
  explains the latency/smoothness tradeoff of buffering and how floor/contact
  extrapolation can diverge. We retained interpolation and bounded extrapolation,
  and made grounded support continuation respect observed contact direction.
- [Glenn Fiedler, State Synchronization](https://gafferongames.com/post/state_synchronization/):
  distinguishes authoritative simulation correction from visual error offsets
  and identifies divergence from unsynchronized movement state. Our rest hold
  changes presentation only; movement dependencies accompany the viewer's pose.
- [W3C WebRTC Recommendation, data-channel send and buffering](https://www.w3.org/TR/webrtc/#rtcdatachannel):
  specifies native queue-space failure and low-buffer notifications. Queue
  budgets cannot guarantee a native `send()` succeeds; failure and drain paths
  are tested explicitly.
- [MDN, RTCDataChannel.bufferedAmount](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/bufferedAmount):
  the exposed count covers bytes queued in the user agent, not all OS/network
  buffering or protocol overhead. An empty application queue is not a zero-
  latency link; the implementation bounds what it controls.
- [MDN, RTCDataChannel.bufferedAmountLowThreshold](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/bufferedAmountLowThreshold):
  drain notification occurs when buffered bytes cross from above the threshold
  to at or below it, and closed channels do not deliver that event. Latest-only
  admission must handle both drain and closure rather than await a future event
  unconditionally.
- [RFC 8831, WebRTC Data Channels](https://www.rfc-editor.org/rfc/rfc8831.html):
  ordered/unordered and partial/full reliability are configurable, but data
  channels share SCTP association congestion control. Separate control/state
  lanes do not create unlimited independent bandwidth; bounded message size
  and stale-state coalescing remain necessary.
- [MDN, Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API):
  browsers commonly suspend background animation callbacks and apply timer
  throttling. A hidden host cannot rely on display frames to drive its match.
- [Chrome, chained-timer throttling introduced in Chrome 88](https://developer.chrome.com/blog/timer-throttling-in-chrome-88):
  documents WebRTC-specific conditions and background timer batching, rather
  than a general promise that an open data channel preserves 60 Hz execution.
  This historical policy illustrates the constraint; it is not a current,
  universal timing guarantee for every browser or operating system.
- [Vercel, WebSocket public beta, June 22, 2026](https://vercel.com/changelog/websocket-support-is-now-in-public-beta)
  and [Vercel, connection lifetime and durable state](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections):
  Vercel Functions now support WebSockets. Existing connections are pinned for
  the Function's maximum duration, but later connections need not reach the
  same instance. WebSocket support alone does not establish a persistent,
  single-owner 60 Hz match host; the hosting implications below are a project
  architecture inference from those documented constraints.
- [Upstash, ERR max requests limit exceeded](https://upstash.com/docs/redis/troubleshooting/max_requests_limit):
  identifies exhausted monthly command allowance, distinct from stored data
  size. Reduced future command demand or an approved service-plan change can
  address the quota constraint; deleting room data does not undo commands
  already counted. Billing changes require explicit approval.
- [Upstash, Redis plan/command accounting](https://upstash.com/pricing/redis):
  explicitly excludes `PING` from charged commands, supporting the distinction
  between transport liveness and ordinary-command readiness. The observed
  exhausted allowance was verified separately against the actual resource.
- [Redis, LPOP](https://redis.io/docs/latest/commands/lpop/):
  removing the last list item removes the key. The mailbox drain need not issue
  another length check and delete solely to remove that empty list.
- [MDN, WebGLRenderingContext.getError](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/getError):
  native invalid-operation state is distinct from shader compilation or a
  JavaScript exception. Diagnostic attribution must preserve the error rather
  than treat an empty console-error list as a clean renderer.
- [MDN, WebGL2 vertexAttribDivisor](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/vertexAttribDivisor)
  and [Three.js r185 InstancedBufferAttribute implementation](https://github.com/mrdoob/three.js/blob/r185/src/core/InstancedBufferAttribute.js):
  instance attributes require actual runtime state governing advancement rate.
  The native divisor capture and worker reconstruction regression validate that
  contract; a TypeScript-only cast does not establish it.

No third-party networking library or copied source implementation was added.

## Performance evidence and limits

The four-second drive→turn→brake→stop fixture compares checkpoints every half
second at 30/60/120/144 Hz. All throttle, steering, and brake edges affect the
first render frame. Every tested checkpoint stays within `5 cm` and `3 mrad`
of the 60 Hz reference; every run reaches a complete stop. Final horizontal
offsets relative to 60 Hz were about `3.375 cm` at 120 Hz and `3.95 cm` at
144 Hz; 30/60 Hz were identical. This bounded semi-fixed difference is not
proof of arbitrary-terrain or cross-platform bitwise determinism.

A warmed Node microbenchmark sampled 14 synthetic entities 30,000 times.
Interpolation was approximately `0.0066→0.0072 ms/sample`; packet-gap sampling
was `0.0022→0.0051 ms/sample`. These are diagnostic CPU microbenchmarks, not
browser FPS, device power, graphics, or production latency claims. Browser
measurements must compare identical roster/map/settings and hardware load.

Existing network limits remain intentional: authority 60 Hz, snapshots 20 Hz,
remote extrapolation at most 250 ms, local input history 240 entries, local
per-call catch-up 100 ms, ordinary local hard snap above 7 m. Current base/max
remote buffering is host `50/120 ms`, LAN guest `65/180 ms`, private guest
`85/220 ms`, and dedicated `100/220 ms`. Adaptive buffering and the server-clock
slew trade latency for continuity; none of this changes the speed of the link.

Normal horizontal/support/aim correction envelopes remain `110/160/75 ms`;
recent contact extends horizontal/support envelopes to `180/240 ms` for a
`300 ms` hold. These are presentation policies, not server physics damping.

Singleplayer has neither network propagation nor snapshot/transport overhead.
Multiplayer can deliver immediate predicted local input and comparable frame
rendering on measured hardware, but cannot promise identical cost, zero remote
latency, perfect contact prediction during an outage, or stability under every
network/device failure. Long packet gaps must eventually freeze bounded
prediction, correct, reconnect, or fail visibly rather than invent authority.

## Verification matrix

“Pass” below means the named check was executed for this investigation.
“Pending” is a release requirement, not an implied success. Re-run checks after
any later integration changes; append exact commands and artifact paths.

| Layer | Check | Status / evidence |
| --- | --- | --- |
| Local prediction | `node src/net/localTankPrediction.selftest.mjs` | Pass: realistic idle frames, four refresh rates, hydraulic/mode parity, terminal/near respawn, existing replay/sequence/correction tests |
| Prediction coverage | `npm run quality:coverage:prediction` | Final pass after presentation-resume helper: 100% statements, branches, functions, and lines for `localTankPrediction.ts`; `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/prediction-coverage-final.log`. Coverage measures exercised code, not universal gameplay correctness |
| Background network integration | `node src/net/networkBackgroundLifecycle.selftest.mjs` plus scheduler/input/session/frame-pump/bridge regressions | Pass: ten-second visible-unfocused/hidden fixtures, 600 authority ticks without presentation, local release/remote retention, bounded OS-gap recovery, no duplicated elapsed time, no delayed FX, near-respawn reseed, and current-life destruction-cause isolation; final source-owner typecheck passed |
| Remote sampling and wire fidelity | `node src/net/snapshot.selftest.mjs` | Pass: 14 cases including ground gaps, real ramps, lifecycle/visibility/clock guards, binary null receipts, and guided-shell row compatibility |
| Viewer mobility | `node src/net/predictionAuthorityState.selftest.mjs` | Pass: 7 cases, including real-spec movement parity, wrong-viewer rejection, and actual prepared-geometry bridge parity |
| Native delivery | `node src/net/channelTransport.selftest.mjs` | Pass: newest-only backlog, dual-slot drain, oversize/native failure cases |
| Protocol delivery | `node src/net/matchRuntimeDelivery.selftest.mjs` | Pass: null receipts, atomic admission, reordered delta/round isolation, failed-send recovery |
| Ranked intent lifetime | `node src/net/rankedQueueLifecycle.selftest.mjs` | Pass: duplicate/pre-ticket cancellation, late join/replacement isolation, matched handoff |
| Existing network integration | `node src/net/net.selftest.mjs`, `node src/net/browserInputRuntime.selftest.mjs`, `node src/net/privateMatchHandoff.selftest.mjs`, `node src/net/browserBattleBridge.selftest.mjs`, `node src/net/networkFramePump.selftest.mjs` | Pass in focused runs |
| Movement and hydraulic actions | `node src/sim/movement.selftest.mjs`, `node src/sim/specialActions.selftest.mjs` | Pass; movement reports 135 checks |
| Cold/round lifecycle | Intent-cover, round-lifecycle, battle-launch, and battle-composition selftests | Pass; synchronous prior-result regression retained |
| Local service transport | Signaling, dedicated match, ranked HTTP/matchmaker/rating tests | Pass in transport-owner runs, including real local WebSocket clients/auth/reconnect; not production proof |
| Shared authority modes and terrain | Match-modes, authority/privacy, spotting, dedicated-world-collision, authoritative-bots, and battle-pacing selftests | Pass: five modes, spotting 99 checks, 20-map collision/bot runs; 80-match pacing median 454.1 s, no matches below 120 s, 10 timeouts accepted by the existing gate |
| Static integration | `npm run typecheck` and core unused checks | Pass after predictor, terminal, near-respawn, and cold-cover changes |
| Import integrity | `node tools/local-import-integrity.selftest.mjs` | Pass: 1,148 repository modules at that run |
| Changed predictor/lifecycle complexity | `node tools/code-quality-metrics.ts src/net/localTankPrediction.ts src/net/networkBattleIntentCover.ts src/net/networkRoundLifecycle.ts src/net/networkRoundState.ts --gate` | Pass: 4 files, 41 functions, zero violations/`any`/`unknown` |
| Diagnostic/garage tool complexity | `node tools/code-quality-metrics.ts tools/multiplayer-render-perf.mjs tools/multiplayer-live-combat.mjs tools/multiplayer-gl-buffer-probe.mjs src/game/garageWorkshopTransfer.ts --gate` | Pass: 4 files, 318 functions, zero violations/`any`/`unknown` |
| Changed-source quality review | ReactDoctor, scope changed relative to `origin/main` | Score 85, seven warnings: five test-only and two bounded background-event lookups. The latter execute only for valid destruction events over at most 32 sampled entities (14-event batch at most 448 comparisons). Reviewed without suppression; this changed-file score is not comparable to the earlier full-tree score 49 / 249 findings |
| Complete initial suite | `npm test` | Pass: pre/core/post completed with exit 0; `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/full-test.log`. Run began before garage-transfer registration and subsequent background-network changes, so it is not a full final-tree receipt |
| Final incremental integration | Newly registered/changed focused checks plus exact final `npm run typecheck` | Pass after final dedicated-wrapper disposal changes; `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/typecheck-exact-final.log`; final complete suite is tracked separately |
| Final complete suite | `npm test` | Running; `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/full-test-final.log`. Do not promote partial progress to a full passing receipt |
| Production builds | `npm run build`, `npm run build:private` | Exact final source pass after dedicated-wrapper disposal: `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/build-exact-public.log` and `build-exact-private.log` in that directory; no deployment performed |
| Full renderer: solo/LAN host/guest | `npm run test:net:render` | Pass on stable background-source tree: CPU rate 1, eight seconds per role; solo 463 frames/p95 21 ms, host 482/25.1 ms, guest 481/18.2 ms; network has zero stalls/hard snaps/freezes. `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/render-stable-lan.log` |
| Historical private-client impaired renderer | Strict private client, CPU rate 1, 45±15 ms latency, 5% snapshot/3% input loss, eight seconds | Earlier pass: 481 frames, p95 19.2 ms, zero stalls/hard snaps/freezes. Its headless-authority timer was subsequently corrected, so it is not a valid final baseline/patch performance comparison. The stronger stable-source 120±40 ms profile below has its own passing receipt |
| Private Internet-style renderer with impairment | `node tools/multiplayer-render-perf.mjs --only=client --room-mode=private --seconds=8 --cpu=1 --latency=120 --jitter=40 --loss=10 --input-loss=10` | Pass on stable source and corrected fixture clock: 476 frames, p95 18.8 ms, maximum 27.4 ms, measured RTT 294.8 ms, zero stalls/hard snaps/freezes; `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/render-stable-adverse.log` |
| CPU-constrained full renderer | Strict CPU rate 4 | Earlier patched full run failed at solo with 128 active frames/eight seconds; separate baseline-only solo run also failed with 235 below the 240-frame floor. Differing concurrent GPU load prevents numeric regression attribution. CPU-rate-4 performance is not certified |
| Persistent-room two-player lifecycle | `npm run test:net:browser` | Pass: active reload 222.9 ms, session rotated, 22.24 m displacement, 23 snapshots, rematch round 2, clean departure |
| Pristine guest entry | Actual invite/join UI, reload recovery, and cancel return | Pass: fresh-context guest entry, recovery 4593.7 ms, cancel returns to garage without failure or retained network runtime; `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/guest-entry-final.log` |
| Human 2v2 capacity | `npm run test:net:four` | Pass: four fresh browser clients / three guest RTC sessions, all handshakes/start transition, synchronized at tick 735 under 45±15 ms one-way latency, 5% snapshot/3% input loss, five seconds plus three-second settle, zero catch-up drop and clean departure; `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/four-human-final.log` |
| Human 7v7 capacity | `npm run test:net:seven` | Pass: 14 browser clients, 13 RTC peers, all synchronized at tick 708 under 45±15 ms one-way latency, 5% snapshot/3% input loss; five seconds plus three-second settle, clean departure |
| Rendered 7v7 combat / complete results | `npm run test:net:seven:full` | Pass after garage fix: natural rendered host and impaired client, 14 shooters, real damage/destruction, retained room and reset readiness, no WebGL errors or hard snaps. `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/live-full-final.log`; later background/readiness changes remain outside this run |
| Actual browser background lifecycle | `node tools/multiplayer-render-perf.mjs --only=host --cpu=1 --seconds=4 --background-check` | Functional pass: actual hidden/unfocused state, raw authority snapshot progress, no hidden rendering or held input/retries, strict foreground return. Demonstrated ~1 Hz callbacks and severe background-host slowdown, not continuous 60 Hz hosting; `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/background-browser-final.log` |
| WebGL diagnostic contract | `node --check tools/multiplayer-live-combat.mjs` plus in-memory tests of its exact observer/gate functions | Pass: all clean phases accepted; any nonzero/missing phase and legacy error rejected; relevant warnings retained without dropping existing console errors. Browser attribution and fixed rerun completed in section 12 |
| Actual instanced-buffer attribution/fix | `node tools/multiplayer-live-combat.mjs --only=host --gl-buffer-diagnostics` | Pass after fix: 329,309 instrumented draws, no native error/warning, all three phase values 0; before/after receipts in section 12. Not an FPS benchmark |
| Worker instance reconstruction | `node src/game/garageWorkshopTransfer.selftest.mjs` | Fails before/pass after: streamed matrix/color runtime type, divisor, normalization, exact bytes, transforms, clone, and ordinary vertex-input separation |
| Live production signaling | `npm run net:prod:check` dependency path and real room creation | Historical GET 503; latest dependency GET 200/ready still followed by actual `RoomSignalingClient.createRoom()` failure (`signaling_store_unavailable`). Quota diagnosis remains 500,002 / 500,000 monthly commands; no restored room creation certified |
| Production TURN allocation | Pristine browser, relay-only ICE allocation | Pass: 12 UDP relay candidates in release-owner check. Candidate allocation is not proof of peer connection, room creation, or completed production match |
| Live production UI multiplayer | Independent host/guest sessions, actual entry/play/reconnect/rematch | Attempted with two browser sessions; host Create 1v1 failed twice before room creation. No production match completed |
| Live ranked availability | Configured service health/authenticated client match | Default ranked endpoint returned HTTP 404; configured-service confirmation and a live match remain unverified |
| Real prepared contact geometry | Actual authored M1A2, T-90M, UDES 03 through the bridge predictor, 600 wavy-terrain steps each | Pass: maximum 3D position error below `1e-9 m` for all three after matching authority's spec-derived contact footprint |

The new snapshot, prediction-authority, channel-delivery, runtime-delivery,
ranked-queue, and garage-transfer suites are included in the core suite manifest.
Existing predictor and lifecycle suites remain in their established suites.

### Browser and production observations recorded so far

These are partial receipts, not release completion:

- The first baseline LAN-host render run failed the synchronous prior-result
  assertion. A diagnostic-only rerun with `--enforce=0 --entry-reset=0` measured
  p95 frame intervals of host `17.4 ms`, guest `25 ms`, and solo `33.3 ms`.
  Those bypassed assertions do not constitute a passing baseline gate. Solo
  rendered 14 tanks versus four in the network scenario, so these values are
  not a strict singleplayer/multiplayer performance comparison.
- The patched LAN-host strict repeat passed: 480 frames over eight seconds,
  p95 `17.5 ms`, zero movement stalls, zero hard snaps, and a destruction-window
  maximum frame interval of `17.6 ms`. The preceding strict run failed one
  destruction-burst freeze; a clean repeat alone does not resolve an
  intermittent failure. Retain both outcomes and investigate with diagnostics.
- The strict full LAN run after the contact fix passed with fresh browser
  contexts, `1280×720`, desktop quality, CPU rate 1, and eight seconds per role.
  Solo: 468 frames, p95 `17.7 ms`, maximum `33.8 ms`; host: 481 frames, p95
  `25 ms`, maximum `25.6 ms`; guest: 481 frames, p95 `17.5 ms`, maximum `25.8 ms`.
  Both network roles recorded zero movement stalls, hard snaps, and freezes,
  including zero destruction-burst freezes. Host maximum free-position error /
  correction step were `0.08157 / 0.01659 m`; guest `0.33465 / 0.06852 m`.
  Source receipt:
  `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/final-render.log`.
  This passes the existing budgets; unequal rosters and non-isolated hardware
  still prevent a literal singleplayer-cost claim. The earlier intermittent
  failure remains historical evidence, not a failure proven impossible now.
- The strict CPU-rate-4 adverse full run stopped on the solo baseline gate,
  before network execution: 128 active frames in eight seconds, below the
  configured 30 FPS floor. Source receipt:
  `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/adverse-render.log`.
  This is a failed stress check, not evidence attributing the failure to
  networking. A lower-contention CPU-rate-4 comparison remains pending; the
  separate CPU-rate-1 private-client result below does not replace that gate.
- A later strict baseline-only solo run at CPU rate 4 also failed: 235 active
  frames over eight seconds, below the 240-frame minimum. Source receipt:
  `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/baseline-solo-cpu4.log`.
  The earlier patched solo run's 128 frames occurred under different concurrent
  GPU workload; comparing those two numbers as a patch regression would be
  unsound. The 4× CPU budget remains uncertified. Unrelated Chromium GPU work
  was still active, so subsequent functional browser passes must not be
  described as isolated FPS benchmarks.
- The private-client strict impaired run passed at CPU rate 1 with `45±15 ms`
  one-way latency, 5% snapshot loss, and 3% input loss over eight seconds:
  481 frames, p95 `19.2 ms`, maximum `25.4 ms`, zero movement stalls, hard snaps,
  and freezes. Maximum free-position error was `1.4705 m`, maximum correction
  step `0.20002 m`, maximum vertical correction step `0.0193 m`, and last error
  `0.1324 m`. Source receipt:
  `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/private-client-render.log`.
  Passing budgets is not zero correction or latency-perfect motion; these
  measured correction costs remain visible in the receipt.
  The log also contains a preceding Vite transient parse error while the
  predictor file was being patched concurrently. The final run reports success,
  but the log is not represented as error-free; a final static/build check and
  any certification rerun must use a settled source tree.
  Later review found that this render fixture advanced its headless host by
  exactly `16.667 ms` per browser timer callback, although callbacks can arrive
  early/late. That made authority speed differ from elapsed wall time and
  confounded the earlier correction measurements. The fixture now passes
  measured `performance.now()` deltas, like the real frame pump. Baseline and
  patched comparisons must both use the corrected clock; the earlier numbers
  remain historical receipts, not final evidence of the corrected fixture.
- The 14-browser 7v7 capacity soak established 13 RTC peer links; all 14 clients
  synchronized at authority tick 708. With `45±15 ms` one-way impairment, 5%
  snapshot loss and 3% input loss, the five-second run plus three-second settle
  recorded mean authority step `0.427 ms`, maximum `3.3 ms`, zero catch-up drops,
  and clean departure. These are room-capacity and authority CPU results, not
  14 simultaneously rendered battlefield FPS or full-match completion proof.
  Source receipt:
  `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/seven-soak.log`.
- The exact four-human 2v2 command also passed in fresh contexts with three
  guest RTC sessions, all ready/start/authority handshakes, and synchronization
  at tick 735. The profile used `45±15 ms` one-way latency, 5% snapshot loss,
  3% input loss, five seconds plus three-second settle. Authority advance mean
  was `0.231 ms`, maximum `1.9 ms`, with zero catch-up drop and clean departure.
  Source receipt:
  `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/four-human-final.log`.
  Concurrent CPU builds/tests make this a functional capacity/lifecycle receipt,
  not an isolated performance benchmark. The harness closed its owned browser
  contexts and local servers.
- The persistent-room two-player browser test passed active reload in `222.9 ms`,
  session rotation, resumed movement of `22.24 m`, 23 snapshots, rematch into
  round 2, and clean departure. This exercises local real-browser lifecycle;
  it does not replace live Internet/TURN or ranked verification.
  The overall six-second profile used `85±35 ms` latency and 12% snapshot loss
  with fresh contexts; the active-reload metrics above are its recovery phase,
  not the overall motion totals. Source receipt:
  `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/persistent-room.log`.
- An unrelated agent-browser GPU workload was active at roughly 40% CPU during
  these measurements. The samples are not isolated hardware benchmarks, and
  this record does not attribute every frame outlier to the patch or claim
  cross-device FPS parity.
- Two production browser sessions opened successfully, but host Create 1v1
  failed twice with `signaling room store unavailable`. No room was created,
  no guest joined, and no production match could be certified. Both sessions
  were closed. The failure screenshot was captured at
  `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/production-room-failure.png`
  (temporary local evidence; archive with the final release receipt).
- Safe production health checks returned HTTP 503 with
  `redis.command = unavailable` and `redis.subscriber = ready`. The default
  ranked leaderboard endpoint returned HTTP 404. These observations concern
  the tested deployment/endpoints; they do not establish the state of any
  separately configured ranked service.
- The later dependency-only production GET passed and reported distributed
  readiness, with six ICE URLs including two secure relay URLs. A scoped real
  WebSocket `RoomSignalingClient.createRoom()` immediately still failed with
  `signaling_store_unavailable`; the client was closed afterward. Logs are
  `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/production-final.log` and
  `production-room-final.log` in the same directory. The currently deployed
  health result is therefore not an actual room-readiness certificate. The
  historical HTTP 503 is retained as an earlier observation, not asserted as
  the latest GET status; no production recovery, quota purchase, data deletion,
  or configuration change occurred.
- The independent production TURN allocation check passed in a fresh browser
  profile with relay-only policy and 12 UDP relay candidates. This verifies
  actual allocation rather than only TURN URL configuration. It does not remove
  the signaling-room quota blocker or certify a peer-to-peer match.
- Authenticated provider diagnosis confirmed `500,002` commands against the
  database's `500,000` monthly allowance; `PING` still returned `PONG` while
  mandatory room commands failed. A successful transport/subscriber probe is
  therefore insufficient service readiness. The provider documents this as
  monthly request exhaustion, not storage exhaustion. Clearing room data does
  not replenish counted requests. A paid change requires user approval; no
  quota increase, data deletion, deployment, or recovered production match is
  claimed here. See [Upstash's quota diagnosis](https://upstash.com/docs/redis/troubleshooting/max_requests_limit).
- The rendered host's natural 7v7 combat reached a defeat result and performed
  12 real visual destructions. The 32.625-second measured trace recorded 1,818
  frames, p95 `21.4 ms`, maximum `40.6 ms`, no measured freezes, no reported
  shader errors, and no captured JavaScript/console errors. Nevertheless the
  strict gate failed native WebGL `1282` (`INVALID_OPERATION`). The failure log
  is `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/live-full.log`.
  The diagnostic was read from `.qa-dev/multiplayer-live-7v7/host-diagnostic.json`
  at that run; later harness runs replace that working artifact. These partial
  metrics are not a passing rendered-combat certificate.
  The old harness queried WebGL only after a diagnostic shadow toggle/render/
  readback transaction, so the sticky error could have arisen during startup,
  combat, or the probe. It also omitted warning-level browser messages.
  The committed harness now retains pre-combat, pre-probe, and post-probe error
  values and relevant WebGL warnings; any nonzero or missing phase still fails.
  Source-only review found no direct application begin/end-query calls, but
  could not identify the offending GPU command at that stage. The later native
  draw capture proved the garage-worker instanced-attribute defect and the
  fixed rerun passed; see section 12. No error was waived or drained solely to
  obtain a green gate.
- After the instancing fix, the uninstrumented complete-match gate passed both
  host and impaired client roles. Each match had all 14 shooters, 55 shots,
  55 hits, 13 destruction events, a natural result, and the gate's retained-room/
  cleared-readiness checks. Host damage was `34,270`; client damage `34,894`.
  Host recorded 1,521 frames, p95 `25.1 ms`, maximum `34.2 ms`; client 1,472
  frames, p95 `24.4 ms`, maximum `29.1 ms`. Pre-combat/live hard snaps were zero
  in both roles, as were all three WebGL phase errors, warning arrays, and
  browser-error arrays. The complete-run command log is
  `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/live-full-final.log`;
  copied host/client diagnostics are `live-full-final-host.json` and
  `live-full-final-client.json` in that same evidence directory. These are
  functional natural-match passes, not isolated FPS comparisons. Subsequent
  background-transition and readiness-barrier changes need their own final
  integration receipt; this run does not certify code changed afterward.
- After the background lifecycle source settled, the opt-in native browser
  background probe passed, with real visibility transitions and Puppeteer's
  timer/renderer/occlusion throttling overrides removed from both explicit and
  default arguments. Section 13 records the demonstrated hidden-host slowdown
  and clean input/render separation. After returning to foreground, the same
  run passed the unchanged strict four-second motion/render gate: 215 frames,
  p95 `32.2 ms`, maximum `38 ms`, zero movement stalls, hard snaps, and freezes.
  The destruction burst had zero freezes and maximum `43.7 ms`; browser errors
  were absent. Source receipt:
  `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/background-browser-final.log`.
  This is not an isolated FPS benchmark, a complete replay of every final
  scenario, or proof of 60 Hz authority while the host tab is hidden.
- A subsequent strict full solo/LAN host/guest renderer run used the stable
  background-lifecycle source and eight seconds per role at CPU rate 1. Solo:
  463 frames, p95 `21 ms`; host: 482 frames, p95 `25.1 ms`; guest: 481 frames,
  p95 `18.2 ms`. Both network roles had zero movement stalls, hard snaps, and
  freezes. Maximum free-position errors before the destruction phase were
  `0.1743 m` for the host and `0.2168 m` for the guest; these are bounded measured
  corrections, not zero-error motion. Source receipt:
  `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/render-stable-lan.log`.
  Unequal solo/network rosters and unrelated GPU work still preclude a literal
  singleplayer-cost or isolated FPS claim.
- The stable-source private-client renderer then passed the stronger profile:
  `120±40 ms` one-way latency, 10% snapshot loss and 10% input loss, CPU rate 1,
  eight seconds, and the corrected elapsed-time authority fixture. It recorded
  476 frames, p95 `18.8 ms`, maximum `27.4 ms`, measured RTT `294.8 ms`, and zero
  movement stalls, hard snaps, and freezes. Maximum free-position error was
  `0.2158 m`; destruction-burst maximum was `30.9 ms`. This demonstrates bounded
  behavior at the measured high-latency profile, not zero propagation delay or
  absence of corrections. Source receipt:
  `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/render-stable-adverse.log`.

## Reproduction and operating runbook

### Establish a comparable baseline

1. Record source revision, deployment URL/revision, browser version, viewport,
   device class, actual refresh rate, graphics tier, map, roster, game mode,
   active browser count, CPU throttling, and network impairment values.
2. Use separate pristine browser contexts for host and guest. A shared context
   can share cached resources, storage, or identity and is not a first-visit
   two-player test. Keep unrelated GPU/browser work out of performance samples.
3. Run the existing solo and multiplayer render scenarios with unchanged
   budgets. Do not disable `--entry-reset` or `--enforce` to obtain a green run.
4. Compare input-to-first-motion, rest variance, turn/brake continuity, frame
   gaps/long frames, local correction and hard-snap metrics, snapshot age/loss,
   input acknowledgement lag, coalescing/backlog, and console errors. FPS alone
   cannot distinguish networking jitter from renderer stalls.

### Exercise loss and gameplay transitions

Use the committed harnesses above. For interactive QA, the built-in impairment
query is `?netSim=1&netLatency=120&netJitter=40&netLoss=10&netInputLoss=10&netdiag=1`.
Latency is one-way; reliable control remains reliable, while replaceable state
and explicitly selected input loss are impaired. Record the exact values.

Exercise parked aim, throttle onset, sustained drive, pivot/rolling turn,
reverse steering, brake-to-stop, slopes/crests/landings, nearby dynamic contact,
track/engine damage and repair, casemate auto-traverse, hydraulic aim, Turbo
Ball, death, nearby respawn, spectator/visibility transitions, retained-room
rematch, and temporary connection loss. A small local frame test is not a
replacement for these rendered multi-instance scenarios.

For ranked entry, also cancel during profile refresh, immediately after join,
and during polling; switch modes and start a replacement search before the old
response arrives. Verify the old ticket is canceled without changing the new
attempt or launching an unwanted match. Exercise guided shells through the
actual binary codec, not only object-level snapshots.

### Diagnose the failing layer

| Observation | First owner/check |
| --- | --- |
| Frame gaps affect solo and multiplayer together | Renderer/device/CPU evidence before network tuning |
| Parked local hull chatters at snapshot cadence | Predictor rest hold with actual idle integration, authority/contact pose parity |
| Damaged vehicle repeatedly drives ahead then corrects | Latest own `localPrediction` metadata and bridge module/crew/equipment application |
| Remote grounded hull dives during gaps | Snapshot support secant, `vy`, grounded/airborne flags, extrapolation age |
| Input feels progressively older with modest queued bytes | Replaceable native admission, pending/coalesced counts, input receipts |
| First fire/repair disappears under loss | Null versus zero input receipt, redundant action edges, authority deduplication |
| Guided missile follows a ballistic presentation arc | Real binary round trip and bounded guided-ID sidecar, not only object snapshots |
| Old wreck slides toward a new spawn | Lifecycle continuity classification and predictor respawn reset |
| Wreck correction stalls between snapshots | Terminal correction-only display-frame advancement; keep simulation/input disabled |
| Instanced draw reports insufficient vertex buffers | Capture object, active attribute divisor, and CPU/GPU capacity; validate real InstancedBufferAttribute reconstruction instead of increasing buffers |
| Canceled ranked queue returns or launches later | Current attempt ownership across refresh, join, polling, and handoff |
| First entry shows stale result or fails the render gate | Cold intent cover and shared round reset; preserve the synchronous assertion |
| Production room creation fails before RTC begins | Distributed signaling mandatory command health and sanitized HTTP receipt |
| Redis transport is healthy but room commands fail | Command quota and exact service error; `PING`/subscriber readiness alone are insufficient |
| Room exists but peers cannot connect across networks | ICE/TURN allocation and selected candidate type, not just presence of TURN URLs |

### Production checks and evidence handling

Run `npm run net:prod:check -- --url=https://cot.kevinliu.studio` against the
intended deployment. `--dependency-only` is a diagnostic option: it omits real
browser relay allocation and must be labeled accordingly. Successful ICE
configuration alone is not proof that a relay candidate was allocated, that
two peers connected, or that a match completed.

Use isolated test rooms/accounts where needed, avoid unrelated live players,
and do not turn verification into a load test without explicit scope. Capture
safe diagnostic codes, request identifiers, room lifecycle outcomes, candidate
types, console errors, and measured motion/frame evidence. Never copy TURN
credentials, authorization headers, session tokens, or provider secrets into
this document or test artifacts. Dependency failures require provider/service
repair followed by the same tests; a local patch does not establish that repair.

Keep signaling and authority deployment requirements separate. Vercel's current
WebSocket support removes the old blanket transport restriction, but does not
guarantee room affinity across fresh connections or authority continuity beyond
one Function invocation. The distributed Redis-backed signaling design fits
that stateless lifecycle. A dedicated match deployment still needs one durable
room owner, continuous simulation, authenticated reconnect routing, and safe
handoff/recovery. Merely exporting the in-memory Node match server as a Function
does not prove those properties. No hosting migration is part of this patch.
See the current [Vercel connection lifecycle](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections).

Include host/guest tab hiding, window minimization, and return-to-foreground in
the lifecycle test plan. Network servicing must be separable from rendering,
and held controls must expire or release when their owner stops supplying them.
An application-level hidden-tab pump can improve ordinary background behavior;
it cannot override browser or OS suspension, battery-saving policies, or process
termination. Do not certify a minimized browser host as an always-on dedicated
server solely because WebRTC remains connected. Exact background behavior needs
browser/device-specific receipts. See [MDN's visibility and scheduling limits](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).

Close only browser contexts and servers started by the test. Do not kill shared
development sessions or manually edit evidence JSON. A deployment/rollback must
name the exact tested revision and remain within its explicit authorization.

For native instancing failures, the committed live-combat harness supports
`--gl-buffer-diagnostics`. It records native draw arguments, active attribute
locations/names/divisors/allocated bytes, and available Three.js object/geometry/
material ancestry. Its consumed native errors are retained and still fail the
gate. This is an intentionally slow attribution mode: do not use its timings
for FPS certification, and disable it for the final production-like render run.

### Final release receipt — pending

Append deployment/source revision, final complete-suite/build results, exact
browser commands and artifacts, actual production host/guest outcomes, TURN and
ranked service evidence, remaining reproducible failures, and any deployment
authority blocker. Until these are recorded, describe the result as verified
code fixes with incomplete production certification, not “bulletproof.”

## Redis-free deployment addendum — 2026-09-05

The subsequent deployment direction keeps the Vercel frontend and its existing
`/api/ice` TURN credential service, while moving signaling and ranked authority
to one always-on backend host. `Dockerfile.multiplayer`,
`compose.multiplayer.yaml`, and `deploy/Caddyfile.multiplayer` implement that
explicit alternative; the distributed Vercel adapter retains its Redis guard.
The [Redis-free hosting runbook](../MULTIPLAYER-HOSTING.md) documents the endpoint
split, exact origin allowlist, single-owner restriction, persistent rating
volume, restart limits, and cutover/rollback checks. No public host, DNS change,
production deployment, or Redis deletion is established by this local work.

The Redis-free audit reproduced an existing signaling takeover: a connection
knowing an invite and host player ID could replace that host membership and
close the room. Both adapters now require a private hashed resume capability;
public identity, page-session IDs, peer summaries and invite links are not
authorization. Generation fences reject old relay/poll/leave traffic, and
room/generation-specific Redis mailboxes prevent cross-room or replacement
connections from consuming one another's messages. A terminal `room_closed`
notification remains drainable after explicit host departure deletes its room.

Resume credentials now use bounded, endpoint/room/player-scoped `localStorage`,
the same browser-profile trust boundary as the existing persistent player ID.
The original close-tab/reopen-room workflow is preserved; a fresh independent
browser context without the capability cannot take over the same ID. Current
and proposed-next credentials are persisted before rotation so uncertain replies
can be retried. Exact-owner prepare/accept checks and cleanup protect successor
storage without rejecting the actual server-admitted winner of competing pending
proposals. Even two retries sharing an identical pending token cannot make a
fenced older tab automatically reclaim the seat: poll fencing is terminal and
does not delete the successor's shared credential. Public client results/events
strip the token, including duplicate private response frames.

Focused tests cover guessed-host denial, stale tokens/connections, lost-reply
rotation, reload/reopen, stale storage writes and acknowledgements, competing
pending proposals, and identical-token two-tab ownership. The distributed suite
also passed against real Redis 7 Lua in a disposable loopback-only Colima
container: distinct concurrent rotations produced exactly one winner; cross-room
delivery and delayed host-departure delivery passed. That owned container was
stopped and automatically removed; no cloud Redis data was accessed. The default
Redis namespace changes to `cot:signaling:v2`, requiring one-time active-room
recreation. Old clients can freshly join but ID-only resume fails closed; they
must refresh. Old stored rooms and older server code are not silently treated as
secured or migration-compatible.

The real **loopback-only Docker** gateway, signaling process and dedicated match
process were exercised without Redis. These are native HTTP/WebSocket service
receipts, not a browser performance run or a public TLS/TURN connectivity test:

- `backend-gateway-local.log` records both health endpoints passing, a real
  temporary room create/join/guest-departure/host-removal sequence passing,
  untrusted WebSocket Origin rejection (HTTP 403), and the unprovided backend
  `/api/ice` route returning 404. TURN deliberately remains on the frontend.
- `backend-ranked-restart.log` records two real ranked players paired, two
  authenticated match sockets, advancing snapshots with measured tick skew
  zero, and the same identities and existing tokens accepted after restarting
  the Docker match service. Both replacement queues were canceled. The receipt
  explicitly reports `unfinishedMatchesRestored: false`: rating/identity
  persistence is not live-match recovery.
- `backend-gateway-check.log` records the expected checker rejection when an
  HTTPS frontend is paired with an HTTP-only loopback backend. The mixed-content
  guard was not bypassed. The successful local room receipt used the direct
  native lifecycle probe; it must not be mislabeled as a passing end-to-end
  production checker or browser relay allocation.
- `backend-gateway-tls-final.log` exercises the rebuilt backend through the
  same Caddy configuration using loopback HTTPS/WSS. Caddy's local CA was passed
  only through that command's `NODE_EXTRA_CA_CERTS`; certificate verification
  stayed enabled and the operating-system trust store was not changed. The
  split-deployment checker passed standalone health, actual room lifecycle,
  dedicated health and the real existing Vercel ICE configuration (six relay
  URLs, two secure). `--dependency-only` deliberately omitted browser TURN
  allocation. This is local TLS routing proof, not a public backend deployment.
- `backend-ranked-tls-restart-final.log` repeats the real two-player ranked
  pairing, authenticated snapshots, and persistent-identity restart checks
  through that HTTPS/WSS gateway. The final image was
  `sha256:0e2e4381bfd68b284daa089f6af418d3f91d45bdc01d459a98b3f56b832e49a5`.
  An immediate probe while the manually restarted match container was still
  starting correctly failed with HTTP 502; that receipt remains
  `backend-gateway-tls-starting.log`. After service readiness, the unchanged
  probe and ranked restart passed. Compose has explicit health dependencies;
  neither a container start nor HTTP gateway availability is match readiness.

The final deployment review also found and fixed fail-open origin parsing:
explicit empty, whitespace-only or comma-only signaling allowlists now fail
before listening. Constructor and real CLI regressions cover those cases;
omitted library/development configuration keeps its intentional local behavior.
The focused signaling suite and typecheck passed after this fix. All four owned
Docker QA containers, the disposable local rating/certificate volumes and the
test network were removed after verification; no production data or provider
resource was deleted.

Those logs are in `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/`.
The checker now requires explicit `--signal-mode=standalone` and validates both
the standalone health schema and actual room writability/cleanup. A coherent
`--backend-url` selects signaling and dedicated health; ICE remains independent.
Its focused regression suite passes with a real loopback signaling server;
fixture ICE and match-health responses in that unit suite are explicitly
stubbed and do not replace the separate real Docker receipts above.

A clean Linux image build exposed missing optional `@emnapi/core` and
`@emnapi/runtime` lock entries. Refreshing the lock with npm 11.19 repaired the
clean-install boundary; `backend-image-build.log` records the successful
runtime-only image build. This is image-build evidence, not a production
rollout or a complete application test-suite result.

Verification boundary: the earlier initial complete suite passed, but the later
`full-test-final.log` run stopped without completion and must remain labeled
**incomplete**. The fresh Redis-free source run `redis-free-full-test.log`
completed with **exit 0: 84 pre + 346 core + 27 post = 457 self-test files**.
All three ordered stages emitted their PASS marker. On the final
profile-scoped reconnect runtime, `redis-free-typecheck-final.log`,
`redis-free-public-build-final.log`, and `redis-free-private-build-final.log`
all completed successfully. `backend-image-build-final.log` records the rebuilt
Linux runtime image. Earlier browser passes apply to their recorded source
boundaries, not automatically to this new deployment boundary. The
production room outage, observed hidden-browser host slowdown, and failed
CPU-rate-4 budget remain unresolved certification limits.

Source boundary: these receipts describe the isolated, uncommitted
`codex/multiplayer-smoothness-r1` worktree based on
`da5e0cf0af4e4ddf7a29ec78d7e1c120ce12755b`, not a deployed release commit.
A read-only remote check during verification observed `origin/main` at
`2c22d203d8726cfceefbe427f3930a000524da32`. Main integration and verification on
that resulting source are still required before release. No commit, push,
production environment change, DNS change, paid resource, or public deployment
was performed in this continuation. The shared dirty checkout was not edited.

### Final reconnect browser receipts — 2026-09-05

These functional checks ran against the profile-scoped resume-capability runtime
after the endpoint and stale-generation fixes. They used dynamically allocated
loopback signaling/Vite ports and separate pristine host/guest browser contexts;
they do not certify a public backend, external TURN allocation, mobile behavior,
hidden-tab scheduling, or a fresh FPS/performance budget.

- The original, unchanged `npm run test:net:browser` passed. With the existing
  85 ± 35 ms one-way impairment and 12% replaceable-state loss profile, both
  local and remote motion reported zero backward frames. Both signaling
  connections recovered; closing the active guest tab and opening a new tab in
  that same browser context recovered in 385.9 ms, rotated its page session,
  received 23 snapshots and resumed 20.64 m of movement. Round-two rematch and
  clean departure passed. Receipt: `redis-free-browser-soak.log`.
- That unchanged new-tab assertion initially failed when the proposed resume
  storage was tab-scoped. The runtime was corrected to match the existing
  profile-persistent player-ID/reopen contract; the assertion was not removed
  or changed to same-tab reload. The failing receipt remains
  `redis-free-browser-soak.before-shared-identity-fix.log`.
- `npm run test:net:entry` passed twice consecutively with its original real
  clicks, timeouts and assertions. Both runs showed a fully opaque loading
  cover on the first hidden-lobby frame, no exposed garage frames, successful
  full-application live reload with the same player/room identity and an
  authenticated battle connection, and safe cancellation back to the garage
  with no late network owner or entry-failure state. Reload recovery measured
  11,878.6 ms and 12,626.9 ms. Receipts:
  `redis-free-guest-entry.pass-1.log` and `redis-free-guest-entry.log`.
- An earlier entry run timed out after 10 seconds waiting for a real garage
  room-reminder click to reopen the lobby. Initial room entry, retained room
  membership and reminder visibility had passed. Adding bounded click-target
  capture and failure-only DOM/status diagnostics was the only subsequent
  harness change; no runtime patch, timeout extension or assertion weakening
  was made. The miss did not recur in either rerun, so its cause remains
  **unexplained**, not fixed or attributed to signaling. Preserve
  `redis-free-guest-entry.before-reminder-diagnostics.log` with the passes.

Independent Node/native-WebSocket checks also exercised simultaneous helpers
loaded from the same saved credential, late acknowledgements after a successor
prepared its next rotation, and two idempotent lost-reply resumptions admitted
before either acknowledgement. The retired client received terminal
`resume_denied`, made no third takeover admission, and could close without
deleting the winner's identical stored capability; a further fresh page still
resumed successfully. A separate storage-less client guessing the same player
ID was rejected. These cases are retained in the signaling membership/native
client regressions, not inferred from a sequential reload alone.

All named receipts are in
`/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/`. Each harness closed its own
browser and local servers in `finally`; process checks found no remaining owned
browser/test processes after completion. The initial failures remain evidence,
and these passes do not erase the production/deployment limits above.

### Final functional-capacity receipts — 2026-09-05

The unchanged `npm run test:net:four` and `npm run test:net:seven` were run
sequentially against the final profile-scoped resume-capability source. These
committed functional harnesses use dynamic loopback ports, pristine browser
contexts, 45 ± 15 ms one-way impairment, 5% replaceable-state loss and 3% input
loss, with the original 5-second drive and 3-second drain. No runtime code,
test assertion, timeout or budget was changed for these runs.

- `test:net:four` exited **0**. All four players joined, synchronized a balanced
  2v2 lobby, completed the authority handoff and match handshake, moved in sync,
  and departed cleanly. The authority advanced to tick 673 with 0 ms dropped
  catch-up time, 0.369 ms mean and 3 ms maximum measured advance time. Remote
  clients received 204–216 snapshots, had 87.4–96.4 ms measured RTT and input
  ACK lag of 6–8 ticks, and observed actual dropped inputs. Receipt:
  `redis-free-four-player.log`.
- `test:net:seven` exited **1**. All fourteen pages loaded and the host room
  was created, but parallel guest joining ended with player 14 reporting
  `page_unavailable: Protocol error (Runtime.callFunctionOn): Target closed`.
  The emitted session-error list was empty; the run never reached the
  all-thirteen-guests-ready checkpoint or battle handoff. The browser-target
  closure's cause is **unresolved**, and this receipt does **not** certify
  fourteen-player capacity on the final source. Receipt:
  `redis-free-seven-player.log`. This original failure is retained alongside
  the diagnostic comparison below; no weakened test was substituted.

Both complete logs are in
`/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/`. Harness `finally` cleanup
completed; process checks found no remaining owned harness or its fourteen-page
Chrome process/profile. An unrelated task's browser was left untouched. These
are lightweight network/authority functional checks with background throttling
disabled, not full-battlefield GPU FPS, hidden-tab scheduling, production
hosting, or external TURN certification. Earlier capacity passes remain tied
to their earlier source boundary and do not override this final-run failure.

The bounded follow-up added only failure diagnostics to
`tools/multiplayer-four-player-soak.mjs`: immediate guest-evaluation rejection
before its extra diagnostic page call, pre-cleanup page crash/closure and
browser disconnect events, the primary exception, and browser exit status.
Assertions, timeouts, impairment and runtime code were unchanged. The original
catch awaited another page evaluation before throwing; the complete original
log contains no earlier exception, and its cleanup ordering alone cannot
explain the first target closure.

One diagnostic candidate rerun, recorded in
`redis-free-seven-player.diagnostic-rerun.log`, exited **1** with Puppeteer's
`TimeoutError: Timed out after waiting 30000ms` before the fourteen-pages-ready
checkpoint or any room creation. Its browser had launched; no pre-cleanup
crash/closure/disconnect event was recorded and `browserErrors` was empty. The
browser exited normally with code 0 during cleanup. This earlier setup failure
does not reproduce or explain the first run's guest-joining target closure.

An unchanged baseline comparison then ran `npm run test:net:seven` from
`/private/tmp/cot-multiplayer-baseline-r1.N0xxmS/worktree`, tracked source clean
at `da5e0cf0af4e4ddf7a29ec78d7e1c120ce12755b`. Its only untracked item was the
pre-existing `node_modules` symlink to the candidate's installed dependencies;
neither baseline source nor dependencies were modified. No other test-browser
main process or multiplayer/world-residency harness was observed before this
comparison. `baseline-seven-player-current.log` also exited **1** with the
same 30-second Puppeteer timeout before fourteen-pages-ready or room creation.
Thus the baseline comparison also failed before multiplayer admission and
cannot certify capacity or attribute the setup problem to these runtime
changes. The original target closure remains separately unexplained; no cause
was assigned to unrelated work or host load without evidence. No further
reruns or game-runtime changes were made in response. Both harnesses completed
their cleanup, and final process checks found no remaining owned browser or
multiplayer test process. The diagnostic harness passes `node --check` and
the worktree passes `git diff --check`.

## Private/LAN product boundary and broken-room recovery — 2026-09-05

The user chose private rooms and LAN instead of a public ranked service. The
menu and Garage now expose Solo, Private and LAN; saved `ranked` intent maps
to Private. Existing dedicated/ranked implementations remain internal
compatibility code, not player-facing acquisition or required deployment.
`compose.multiplayer.yaml` provisions only the in-memory signaling process and
TLS gateway. It does not provision Redis, Supabase, a match server or a rating
store. The website and existing TURN credential service remain on Vercel.
The hosting runbook documents the local helper, single-process limitation,
public endpoint cutover and exact verification commands. No production
deployment, resource deletion, billing change or endpoint cutover was made.

Broken-room handling uses curated codes rather than reflecting raw service
messages. The angular error panel distinguishes unavailable signaling,
invalid/full/expired rooms, host departure, removed/replaced seats, timeout,
recovery exhaustion and host simulation failure. Retry is explicit; terminal
membership failures cannot start takeover loops. Keyboard focus, `role=alert`,
native controls with 44-pixel targets, narrow viewport bounds and a direct
Return to garage action are part of the UI checks.

Accepted authority receipts drive the frame watchdog. Five seconds without
new authority starts a bounded recovery warning; a sixty-second grace cannot
be extended by an open channel, WELCOME alone or a cached same-tick snapshot.
Natural ICE recovery can complete from a fresh accepted snapshot without
requiring another WELCOME. Outage entry clears unsubmitted actions and
unacknowledged intent once, rejects action edges during recovery, and requires
a fresh authority receipt before admitting new ones. Physical held controls
are sampled anew after recovery; this is not a claim that every held key is
released. Server-side input expiry independently neutralizes stale admitted
controls. Explicit leave and terminal failure do not fabricate match results
or progression.

Live full-application tests found two failures not covered by the earlier
lightweight recovery tests:

- Synchronous network teardown left the game in battle phase during the
  asynchronous Garage restore. The frame loop briefly attempted the unloaded
  solo runtime, producing repeated `Solo battle runtime is not ready` errors.
  A per-battle network ownership latch now prevents solo simulation, disposed
  presentation or result processing during that retirement gap. Explicit
  simulation reset and Garage exit release the latch for the next solo battle.
  Regression cases cover between-frame and same-frame closure, including a
  subsequent solo entry without an intermediate rendered Garage frame.
- A frozen authority reached its deadline and returned to Garage correctly,
  but the error panel stayed hidden. Intentional transport close did not
  invoke the menu's native terminal callback, leaving the initial handed-off
  acquisition marked current. Detach now retires only that exact handed-off
  session without closing transport twice. Newer pending/waiting rooms remain
  protected. Coordinator generation fences cover delayed imports, clear,
  presentation, retained controls and scheduled rematches, including a
  successor with the same room code.

Independent composition tests also reproduced a Return-to-garage race during
retained-room rematch loading: the old settings/end-overlay callback retained
the room and completed Garage restoration, then an uncancelled late import
activated the battle again. The shared explicit-return callback now tests the
network launcher's own pending lease (not generic solo-loading state), cancels
the round and lets the launcher restore Garage once. Cold entry and rematch
tests compose the actual entry, round and Garage owners and execute the actual
main callback. They require no late activation, one restore, no error alert
for intentional leave, and unchanged healthy-room retention on ordinary exit.

The strict original failures are preserved in `private-lan-host-loss.log`,
`private-lan-host-stall.log` and `private-lan-host-stall.diagnostic.log`, alongside
their follow-up receipts. The host-loss rerun after the frame fix returned to
Garage with no false result/progression and zero console/page errors in
`private-lan-host-loss.after-frame-fix.log`. No timeout or assertion was weakened.
Current-boundary final verification is recorded below; earlier
capacity, production and performance limitations still apply.

The first post-ownership stalled-host rerun passed the bounded Garage/error
checkpoint but failed the next assertion because the closed room's invite URL
was retained (`private-lan-host-stall.after-owner-fix.log`). Successful exact-owner
detach now clears both the URL and invitation state; rejected stale cleanup
must preserve a replacement room's invite. This failure is preserved too.

### Final Private/LAN verification

This is the uncommitted `codex/multiplayer-smoothness-r1` lane based on
`da5e0cf0af4e4ddf7a29ec78d7e1c120ce12755b`, not a deployed revision. Artifacts
listed below are under `/private/tmp/cot-multiplayer-smoothness-r1.MC1LVQ/`.

- The strict `npm test` attempt passed all 84 pre checks and the first 345 of
  352 core checks, then failed the existing mobile-layout invariant: new room
  styling used an independent 600-pixel breakpoint. The fix moved the narrow
  error layout into the existing semantic phone/compact rules in
  `responsiveSurfaces.css`; the invariant was not weakened. The actual
  responsive controller is also installed in the browser fixture. The exact
  failed core file and all remaining core files (7), then all 27 post files,
  passed in the same original order using the same Node spawn behavior. Logs:
  `private-lan-full-test.log` and `private-lan-suite-resume.log`. Thus every
  one of the 463 ordered files has passing coverage across the attempt and
  resumed tail, but **one uninterrupted final `npm test` run is not claimed**.
- Fourteen affected UI, launch, room ownership, frame-pump, teardown, test
  inventory and deployment-check suites passed again in
  `private-lan-focused-final.log`. The final host-removal wording regression
  passed in `private-lan-error-copy-final.log`; being kicked is not described
  as a voluntary departure.
- Desktop (1280 × 900) and phone (390 × 844) native room UI checks passed in
  `private-room-errors-responsive/report.json`: actual create/join errors and
  retry, terminal no-auto-retry, keyboard/focus actions, frame-driven close
  before deferred attach, retained-room close, replacement-owner fencing, and
  the connection-status exit. Phone actions use the real coarse/phone semantic
  bands, remain within x=25–365, have at least 44-pixel targets and no horizontal
  overflow. Console/page errors: zero. The phone error image was inspected.
- TypeScript plus the core-unused check passed in
  `private-lan-typecheck-final.log`. The public production build passed in
  `private-lan-build-final.log`. The nine changed core-owner files measured
  276 functions with zero complexity, `any` or `unknown` violations in
  `private-lan-quality-final.log`. `git diff --check` passed.

The real application guest tests use two pristine browser contexts, actual
WebSocket signaling/WebRTC and a browser-hosted authority. Each starts through
the native invite/room UI, closes and reopens the lobby, enters a battle and
successfully reloads the live guest. The final harness additionally waits for
the reloaded battle to be fully revealed, with no loading or room overlay,
before injecting live host loss or a stopped authority timer. Cold-entry loss
instead deliberately reloads again and closes the host behind its loader.

| Final unattended scenario | Garage + visible error after injection | Native return interaction | Receipt |
| --- | --- | --- | --- |
| Host stops authority; RTC/signaling remain open | 67,841.5 ms, including the bounded recovery grace | 232.1 ms | `private-lan-host-stall.revealed-final.log` |
| Host closes during the revealed battle | 2,568.5 ms | 37.7 ms | `private-lan-host-loss.revealed-final.log` |
| Host closes during cold entry | 1,878.3 ms | 49.8 ms | `private-lan-cold-entry.revealed-final.log` |

All three exited 0 without manual intervention. They assert the expected
failure reason, cleared network owner and invite URL, hidden loading overlay,
visible Garage/error, working Return to garage button, unchanged local profile
and no fabricated cold-entry exception or result. Console/page errors were
zero. These are local functional timings, not Internet latency or FPS budgets.
The harness closes only its owned browsers, signaling process and Vite server.

### Retained browser-interaction diagnostic

Earlier host-stall runs reached the correct Garage/error checkpoint but stalled
inside Puppeteer's Return-button click (`private-lan-host-stall.final.log` and
`private-lan-host-stall.diagnostic-final.log`). Read-only inspection found the
button enabled, visible and correctly hit-tested; timers/evaluation worked,
but bounded native animation-frame and IntersectionObserver probes did not
complete. Puppeteer waits for IntersectionObserver before sending click input.
A diagnostic native pointer move allowed the pending click to complete. That
manually aided run is **not** unattended proof or valid recovery timing, and no
browser/compositor/GPU or application root cause was established.

The final harness first hit-tests the visible control, sends a trusted mouse
move to its center, then performs the unchanged normal Puppeteer click and all
exit assertions. Both pointer operations have separate ten-second limits;
room recovery time is recorded before any input. It does not invoke a DOM
click, change application visibility/scheduling or extend recovery limits.
`private-lan-host-stall.pointer-approach.log` and all three stricter revealed
receipts above passed unattended. This certifies that actual pointer interaction
path, not resolution of the earlier idle animation-frame/observer diagnostic.
The inspection browser session was closed. No application render-loop change
was made to hide that automation failure.

The deployment and capacity limits elsewhere in this record remain in force:
no production endpoint was deployed/cut over, no Redis data was cleared and no
cloud resources or paid plans were changed. Fourteen-player final capacity,
CPU-rate-4 frame budgets and hidden-host 60 Hz are not certified by these checks.

## Read-only Redis command-count audit — 2026-09-05

The reported Friday dashboard count of **499,914 commands** is consistent with
the legacy polling design, but does not identify the callers responsible.
This audit used local source, existing sanitized production receipts and
provider documentation only: no Redis requests, provider mutations or new
production probes were made.

The relevant signaling client, private-room session, distributed store and
Vercel adapter are identical between lane baseline `da5e0cf0af4e4ddf7a29ec78d7e1c120ce12755b`
and the inspected `origin/main` revision `2c22d203d8726cfceefbe427f3930a000524da32`.
Their empty `room_poll` performs `PEXPIRE` and one `EVAL` containing `LPOP`,
`LLEN` and `DEL`, even when there is no mailbox message. The provider's
[command-cost examples](https://upstash.com/docs/redis/sdks/ratelimit-ts/costs)
explicitly count both `EVAL` and its inner Redis calls. Thus the model is five
counted commands per empty poll, not two commands merely because two Redis
RPCs were sent.

| Legacy connected state | Poll cadence | Empty-poll model per hour |
| --- | --- | --- |
| Browser host; low-level signaling client default | 500 ms | 36,000 commands |
| Guest after initial WebRTC transport attaches, including a waiting lobby | 2,000 ms | 9,000 commands |
| One host plus thirteen established guests | Mixed above | 153,000 commands |

At these rates, 499,914 commands corresponds to about **13.89 client-hours**
at the 500 ms cadence, or **3.27 hours** for an established fourteen-player
room. These are illustrative empty-mailbox calculations, not reconstructed
usage. They exclude create/join/relay work, pub/sub wake drains, reconnects,
health checks, initial immediate polls and other database users. Browser
throttling and the client's one-in-flight-poll guard can reduce the rate. No
regional replication multiplier is assumed from the screenshot alone.

The isolated legacy-store patch removes redundant empty-list `LLEN`/`DEL`,
adds a required generation-validation `GET`, and renews room TTL at most once
per minute per warm membership. Its steady 500 ms empty-poll model is therefore
approximately 21,660 counted commands/hour (`EVAL` + `GET` + `LPOP`, plus TTL
renewal), while the earlier 240-to-121 figure measures **RPCs/minute**, not
provider-counted commands. This local reduction does not make Redis-free
hosting deployed or prove that existing production clients stopped polling.

The recorded default browser-pair, four/fourteen-player, live-combat and
guest-entry harnesses explicitly create loopback signaling servers and pass
their `ws://127.0.0.1` endpoints; they do not obtain Redis through production
environment defaults. Pair/capacity tools now support an explicit
`--signal-url` override, but the retained command receipts above contain no
such override. The deliberate production readiness/room probes are different:
they can consume real commands and cannot be assigned a zero contribution.
Their sanitized receipts do not expose a per-request command ledger.

**Confidence:** high in the source-level amplification and the arithmetic;
high that retained default local harness runs used loopback signaling. Existing
production receipts establish the distributed backend and its room-command
quota failure, but do not establish the exact deployed commit, each caller's
connected duration, the dashboard's complete accounting window, or ownership
of every counted command. It is therefore not justified to attribute exactly
499,914 commands to this QA run, a particular player, abuse, or a single bug.

## Cloudflare release verification — 2026-09-05

This phase supersedes the earlier **not deployed** status for the room Worker,
not the limitations of those earlier measurements. With explicit owner approval,
the private-room Worker was deployed to
`https://cot-private-rooms.kk23907751.workers.dev`, version
`8404b0d3-345f-4f6d-be9c-dac1e8d06b60`. The website cutover is recorded separately
after verifying its actual deployed build. No Redis data, credential or paid
plan was deleted, revoked or upgraded.

The isolated release was applied onto unchanged main base
`2c22d203d8726cfceefbe427f3930a000524da32`, preserving upstream vehicle and
prediction-test additions. Source/test Cloudflare typechecks, 13 real Workers
integration tests, root typecheck (including the unused-core check), public
build, 41 changed/new root selftests, and the additional production-peer-probe
selftest passed. Desktop/mobile real-module room error UI checks had no page
errors or horizontal overflow and retained accessible retry/cancel/exit actions.

The exact release's two-browser impaired-network run against the local Worker
passed with 148 snapshots, zero sampled own/remote backward frames, zero missing
baselines or extrapolation, 375 ms reload recovery, credential rotation, rematch
and clean leave. Production native room checks passed create/join, reconnect,
two-way signaling, departure and cleanup. Two pristine production-origin browser
contexts then established an actual TURN-only peer pair: both local/remote
selected candidates were UDP relays, negotiation traversed the live Worker,
both directions delivered data-channel payloads, and the room/sockets/browsers
were closed. Credentials, SDP, ICE addresses and room capabilities are excluded
from the printed receipts. These browsers ran on one machine, not two physical
networks; this is not an Internet gameplay FPS certificate.

The full root test command encountered the existing four-minute timeout in
`src/vehicles/fleetLazy.selftest.mjs`. An independent clean worktree of the exact
unchanged main base reproduced the same 240,000 ms child timeout and SIGTERM;
the test is byte-identical. This distinguishes an upstream/host-condition failure
from this multiplayer diff, but does not establish its underlying cause. No
timeout was raised and no vehicle code was changed to bypass it. Remaining
ordered tests were resumed separately and passed through the remaining pre
checks and the early core checks. That optional broad run was deliberately
stopped during the unrelated `surfaceMarkupFleet` check after more than
32 minutes, not reported as a passing full suite. All changed/new multiplayer
checks were run separately. Do not describe the complete `npm test` as passing
unless that full gate is subsequently rerun successfully.

The deployment procedure, storage lifetime, hibernation boundaries, rate limits,
rollback constraints and supported LAN setup are in
[`MULTIPLAYER-HOSTING.md`](../MULTIPLAYER-HOSTING.md). Browser-hosted play still
ends when the host leaves; a backgrounded or suspended host cannot guarantee
single-player frame pacing. Fourteen rendered players and throttled-device
performance remain uncertified.

### Final room-capacity and native production follow-up

A deterministic full-room review found a legitimate negotiation burst that
the initial 120-message/10-second socket budget rejected: 13 guests × (one
offer + 12 ICE messages) = 169 host messages. The host's canonical authenticated
room membership now determines a bounded capacity allowance, up to 448 for
14 seats; guests and unauthenticated sockets retain 120. Payload role claims
cannot increase it. The 169-message fixture failed before the correction and
passes after it; all 15 real Workers tests, source/test typechecks and focused
quality checks pass. The corrected Worker is live at version
`119c2871-40b7-4964-8fdb-03de3c82c040`.

The deployed frontend was exercised through native controls in two fresh
browser contexts: create Private 1v1, invite join, select map, both ready,
start, both connected battles, advancing snapshot/input counters, native exit,
room closure and guest return to Garage. Zero page errors; owned rooms and
browsers closed. This passed before and after the capacity correction, and a
fresh TURN-only production peer-pair check also passed after it. The committed
`production-private-room-ui` probe and its deterministic guards/cleanup test
make that same deployed-frontend check reproducible with an explicit origin.
The earlier failed agent-browser session-continuity attempt created no rooms
and is not counted as gameplay proof. These remain short functional receipts,
not full-capacity rendered or different-physical-network performance guarantees.

## Abandoned-room lifecycle follow-up — initial local audit

The following records the initial local-only checkpoint. The subsequent
`10ac577de6618a594c3a38b2bb64e0cbd103d109` release is now live, the repaired
repository test segments pass, and real production 90/180-second expiry was
verified. See the [current response and cleanup release receipts](multiplayer-response-latency-2026-09.md#production-release-and-repeat-measurements)
for current deployment, measurements and remaining limits.

Base: `b970e9caadb681903b9b35ae1dfecb3650598dfa`. The audit found that the
old room-wide 24-hour idle timeout did not bound individual disconnected seats.
An active guest could keep a dead host's room touched indefinitely, and restoring
a room without surviving sockets needed to preserve historical timestamps rather
than invent new activity at every wake.

The shared store now uses per-member leases: a recorded disconnect has up to
90 seconds of reconnect grace, capped by the 180-second valid-traffic deadline.
A host expiry closes the room; a guest expiry frees its seat. Valid traffic from
one player cannot renew another. Cloudflare restores activity from durable
snapshots plus surviving server-written socket attachments, repairs alarms on
wake, and deletes empty actors' SQL metadata, key-value state and alarm. The LAN
adapter applies the same lease policy with local socket housekeeping. The browser
client treats expiry as terminal even before a lobby subscriber is installed,
so no orphan polling/reconnect loop remains after the expired-room event.

Expired guest identities retain bounded capability hashes outside active room
capacity. This avoids an expired-seat cleanup opening an identity-takeover window
while the host is disconnected. The original browser can explicitly rejoin with
its private proof if the room and match still admit it. Proofs are not dropped to
make room for unlimited identities; the room instead has a bounded identity
budget. Host closure removes the entire room, including these fences.

The 15 new real workerd regressions cover native socket abandonment, apparently
open but silent peers, exact grace/deadline boundaries, healthy heartbeats across
multiple lease windows, invalid traffic, hibernation and missing-alarm repair,
just-in-time reconnect, late predecessor callbacks, repeated cleanup alarms,
same-code reuse, expired-ID proof fencing, and failed SQL/deallocation retries.
All 30 Worker tests (15 existing + 15 new), source/test Cloudflare typechecks,
root typecheck and public build pass. Shared-store expiry/security and routed
client lifecycle regression checks also pass. The full fleet-wide root test run
is not represented as passing; its previously recorded unrelated timeout remains
outside this targeted verification.

The 14 native LAN WebSocket regressions also pass, including unauthenticated
15-second admission expiry, shared host/guest lease behavior, a dropped host,
late renewals rejected before a periodic sweep, stale predecessor closes,
admission completing after its socket expired, a superseded post-commit join,
and shutdown during a stalled/rejected optional store sweep. Repeated shutdown
shares one promise and closes the store once. The old adapter reproduced the
unauthenticated-socket leak in an isolated in-memory baseline import. Existing
signaling and dedicated-world-collision tests pass on the final change, as does
root typecheck; the combined focused quality gate has zero complexity violations,
`any` or `unknown` annotations. The test registry discovers all 474 ordered
checks, including both new root cleanup checks; discovery is not an execution
claim for the unrelated fleet suite.

These are local verification results, not a new production deployment. The
existing production room/UI/TURN receipts above remain tied to their recorded
versions. A sleeping actor created before this policy ships can retain its old
alarm until its first wake; this change does not bulk enumerate/delete existing
rooms. Cloudflare alarm delivery is at least once and may be delayed or exhaust
provider retries after repeated failures, so the lease is an admission deadline,
not an exact wall-clock deletion guarantee. See the
[cleanup runbook](../MULTIPLAYER-HOSTING.md#abandoned-rooms-and-reconnect-leases).
