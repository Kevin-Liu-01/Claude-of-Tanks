# ADR 0038: RTC lobby-to-match ownership is explicit

- Status: accepted
- Date: 2026-08-26

## Context

Private rooms retain their established WebRTC data channels when a lobby starts
a match. The old transfer removed the lobby message listener, returned the
channel, and then installed the authoritative match listener. A READY packet
sent in that small interval was a valid reliable data-channel message, but the
browser had no JavaScript listener to receive it. First-visit and backgrounded
clients made the race visible as a healthy connected room stuck at the loading
barrier. Lobby state and match authority also use independent outbound sequence
spaces, so the final lobby packet could make match WELCOME sequence zero appear
stale.

## Decision

Install a bounded temporary handoff inbox immediately when releasing each lobby
transport. The match authority first attaches its listener, then closes the
temporary inbox and replays every captured packet in order. READY remains
idempotent and clients continue retransmitting it until the match phase
acknowledges readiness. The client explicitly rebinds its runtime listener at
handoff and treats WELCOME as the authenticated sequence-space boundary. A
slow first visit receives a 60-second hard admission ceiling instead of the
old 10-20 second synthetic/client barrier.

## Consequences

- There is no listener-free interval on a live RTC control channel.
- Early HELLO, READY, input, and ping packets remain ordered and bounded.
- Match loading time and browser timer throttling no longer decide whether a
  peer crosses the readiness barrier.

## Verification

    node src/net/net.selftest.mjs
    node src/net/privateMatchHandoff.selftest.mjs
    npm run test:net:render
