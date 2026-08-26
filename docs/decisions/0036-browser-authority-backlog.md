# ADR 0036: Browser authority retains and gradually drains long stalls

- Status: accepted
- Date: 2026-08-26

## Context

Browser-hosted private matches advance authority from the rendered host page.
The runtime used one six-tick value for both maximum work per frame and maximum
retained wall time. A renderer or OS stall longer than 100 ms therefore deleted
match time; increasing that same value would instead run seconds of simulation
in one frame and visibly snap tanks.

## Decision

Separate retained backlog from per-call catch-up. Browser hosts retain at most
five seconds, preserve the existing six-tick policy for ordinary short gaps,
and drain a long backlog at two ticks per presented frame. Dedicated authority
keeps the prior defaults because its scheduler is independent of rendering.

## Consequences

- A bounded browser freeze no longer shortens or skips the match timeline.
- Recovery adds at most one extra fixed step per frame instead of a burst.
- Tabs stalled beyond five seconds still discard excess time rather than
  attempting an unsafe unbounded fast-forward.
- New diagnostics report backlog high-water time and recovery-frame count.

## Verification

    node src/net/net.selftest.mjs
    node src/net/privateMatchHandoff.selftest.mjs
    npm run test:net:seven:full
    npm run test:net:render
