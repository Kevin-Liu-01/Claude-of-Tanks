# 0006 — Network input cadence is independent from display refresh

## Context

The renderer supports high-refresh displays, but the authoritative simulation
advances at 60 Hz. Uploading an unchanged held control state once per rendered
frame made 120–240 Hz clients perform proportionally more serialization, RTC,
host, and prediction-history work without adding authority resolution. It also
made a healthy round trip appear as a large sequence backlog.

## Decision

- Keep rendering and presentation at the display refresh rate.
- Upload replaceable held input at no more than 60 Hz.
- Bypass the interval for fire transitions, consumables and other action bits,
  shell selection, braking, and meaningful throttle/steering changes.
- Commit cadence state only after the transport accepts the packet.
- Bound accumulated prediction time so a suspended or backpressured page
  cannot apply a large catch-up step.
- Keep this policy in typed, DOM-free `src/net/inputCadence.ts`; transport,
  authority, and presentation remain separate owners.

## Consequences

High-refresh clients retain their visual frame rate and immediate discrete
controls while reducing replaceable traffic and authority fan-in. Input
sequence lag becomes proportional to the 60 Hz simulation cadence instead of
the monitor refresh rate. A future authority tick-rate change must revisit the
default cadence deliberately.

## Verification

- `src/net/inputCadence.selftest.mjs` proves a 240 Hz caller emits about 60
  held-state uploads per second and that urgent edges bypass the interval.
- Every multiplayer browser certification uses an isolated pristine context
  per participant.
- The rendered 7v7 gate covers host and impaired client play, fourteen moving
  and firing peers, transport loss/jitter, input acknowledgement, prediction,
  frame pacing, and visible rubber-band limits.
