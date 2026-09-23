# Multiplayer entry: wake the existing frame owner

## Change and scope

A remote Start now wakes the existing application frame scheduler when battle
entry first covers rendering. The coverage flag is established before waking;
repeated coverage preserves the already-queued callback. The adapter remains
lazy because the frame owner is declared later in `main.ts`.

This is a scheduling fix, not a transport, shader, gameplay or quality change.
It preserves the private bridge, viewer-bearing first-authority barrier,
post-reveal READY, five-second battle countdown, single frame-loop owner, and
existing unfocused/hidden-page service. No vehicle or world geometry changes.

## Evidence

On deployed `e199032a3`, the unprofiled
`deployed-e199-dwell-timings-visual` capture recorded a 3,136 ms guest initial
snapshot wait. During 377 visible, focused observer callbacks, application
animation ticks stayed at 19, with no overlapping long tasks. An earlier
profiled control recorded the same starvation for 3,844 ms. These observations
do not establish when the first network packet arrived.

The covered frame branch already pumps networking without rendering, but its
coverage flag did not cancel a previously queued five-second Garage idle timer.
A host's local Start click wakes that timer through input; a guest's remote
Start has no equivalent input event. Waiting for a snapshot on a separate
animation callback does not itself sample the match.

The regression uses the real lifecycle, scheduler and browser-session owner
with injected clocks. It fails before the fix and passes afterward, checking
idle-timer cancellation, exactly one callback, repeated coverage, cancellation
before callback delivery, unfocused and focused-hidden recovery, disposal, and
no early input, bridge publication or READY.

## Verification boundary

Focused lifecycle, frame, session, activation, launch, abort, countdown,
protocol, input and private-handoff tests pass on the isolated landing tree.
Typecheck and production build pass (904 modules, 174 first-party procedural
playables; the pre-existing chunk-size warning remains).

A local two-client run combining this wake fix with an experimental shader
polling order reached the initial-snapshot stage below millisecond-rounded
resolution and passed the full 5-to-1 countdown, nonblack reveal, firing and
cleanup. Its shader experiment moved stalls into later rendering and is
explicitly excluded from this landing. Those combined timings are not an
isolated performance certificate for the wake change or an Internet-latency
claim. The shader investigation and exact historical 214–319 ms stall cause
remain open; this commit does not claim to resolve every loading slowdown.

The first attempted full-suite wrapper nested the capture lock already owned
by the selftest runner. It was terminated without a pass claim, and the suite
was restarted through its ordinary `npm test` entry point.

The isolated wake-only `wake-only-dwell-cpu-visual` browser pair subsequently
passed entry, completed waiting-room cache reuse, both full 5-to-1 countdowns,
firing, safe exit, both room closures and browser cleanup. Its runtime is
`e199032a3` plus only the lifecycle and adapter changes in this commit; the
landing additionally preserves the two newer environment-tooling commits.
Both initial-snapshot stages round to 0 ms, with host/guest loading totals of
1,849/1,721 ms. This run uses HIGH clear/night entry, unlike the clear/day
production control, so total loading times are not a controlled A/B benchmark.
Guest CPU profiling also adds overhead. The reviewed guest screenshot shows
the vehicle, snowy battlefield, sky and HUD rather than an empty black frame.

The fix does not remove rendering stalls: loading long tasks still reach
377/332 ms. Later normal adaptive gameplay uses LOW and reaches maximum frame
gaps of 52.4/43.6 ms, with zero hard snaps or observer failures. These residuals
remain open; they are not a reason to ship the rejected shader experiment.

## Final suite result and shipping boundary

The ordinary full `npm test` run on `a65e95402` exited 1 in the pre-test
sequence at `src/vehicles/sourceXFleet.selftest.mjs:21`: T-90M geometry produced
`27bb658d`, while the preservation receipt expects `ffbd40d4`. The remaining
core/post suites did not run, so this is not a full-suite pass.

An independent run of that exact selftest on the clean `db400d61b` baseline
reproduced the same assertion and both hashes. There is no `src/vehicles`,
`package.json` or `package-lock.json` delta between that baseline and
`a65e95402`. The mismatch therefore predates this multiplayer fix. Neither
vehicle geometry nor its expected receipt was changed to make this landing
green.

The wake fix is committed as `a65e95402` and remains an ancestor of the later
`66163345a` main tip. A subsequent shader polling/flush candidate is still
isolated and uncommitted: its native two-client run passed functional entry
checks but failed performance acceptance. It is not part of the shipped
multiplayer update. This documentation follow-up adds no runtime changes.
