# ADR 0022: RTC rendezvous is scoped to page sessions

- Status: accepted
- Date: 2026-08-26

## Context

Room peer IDs intentionally survive browser reloads so a returning player can
reclaim the same seat. SDP and ICE mailboxes also survive transient signaling
loss. Peer identity alone therefore cannot identify one `RTCPeerConnection`:
an offer or candidate queued for the previous page could be delivered after a
new page replaced it, poisoning the replacement negotiation and causing a
reconnect loop.

## Decision

Each signaling delivery carries the sender and receiver page-session IDs. A
sender also declares the receiver session it intended; the room store rejects
the delivery if that session has already been replaced. Clients discard
mailbox deliveries addressed to another local session, and room sessions
discard deliveries from a superseded remote session.

Rotating the local page-session ID clears any queued SDP/ICE created by the
dead peer connection. Normal WebSocket recovery keeps the same session ID and
may still flush its queue. The stable player ID, lobby seat, authority entity,
and gameplay protocol are unchanged.

## Consequences

- Durable signaling cannot mix two browser/RTC generations that share a player ID.
- Fresh joins and reload recovery remain idempotent under mailbox replay.
- Cached clients that omit an intended receiver session remain temporarily
  compatible, while current clients take the generation-safe path.
- This does not replace TURN. A deployment still needs a relay service for
  network pairs that cannot establish a direct ICE route.

## Verification

    node src/net/net.selftest.mjs
    node src/net/privateMatchHandoff.selftest.mjs
    node server/signaling.selftest.mjs
    node server/distributedRoomStore.selftest.mjs
    npm run test:net:browser
    npm run typecheck
