# ADR 0028: Cold RTC recovery preserves the public room-ready promise

- Status: accepted
- Date: 2026-08-26

## Context

A first-visit guest can still be loading modules or gathering relay candidates
when the first `RTCPeerConnection` reaches its bounded connection deadline.
The room session already knew how to rotate its signaling epoch and construct
a replacement peer, but that path assumed a `MatchClientRuntime` existed. If
the first generation failed before runtime construction, the replacement could
connect behind an already-rejected `session.ready` promise and the lobby stayed
on its error state.

## Decision

`PrivateRoomClientSession` now treats the initial RTC generation as replaceable.
Its original public `ready` promise follows a bounded sequence of fresh peer
generations. Each retry rotates the signaling session id, discards stale SDP and
ICE, lets the host build a matching offer, and creates exactly one client
runtime from the winning generation. Post-connect recovery continues to reuse
that runtime and presentation identity.

Generation checks reject a transport that opens after its peer was replaced,
preventing two data-channel owners from attaching to the same room session.

## Consequences

- A slow or lost opening handshake no longer leaves a successfully replaced
  peer hidden behind a failed lobby promise.
- Recovery remains bounded and fail-visible; it is not an infinite loading
  screen.
- Internet connectivity still requires a deployed TURN service. Retrying RTC
  generations cannot route through a symmetric NAT by itself.

## Verification

    npm run typecheck
    node src/net/privateMatchHandoff.selftest.mjs
    node tools/multiplayer-browser-soak.mjs --duration=12000 --latency=120 --jitter=60 --loss=15
