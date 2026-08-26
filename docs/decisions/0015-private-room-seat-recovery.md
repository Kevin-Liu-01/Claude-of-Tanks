# ADR 0015: RTC loss preserves the private-room seat

- Status: accepted
- Date: 2026-08-26

## Context

Private matches treated an RTC data-channel close as an immediate player
departure. A transient radio change could therefore remove the player from the
canonical room, end the local result flow, and reject a replacement connection
while a round was active. Signaling already retained durable membership, but
the match runtime discarded the corresponding seat too early.

## Decision

Transport loss and explicit room departure are separate operations. An
unexpected data-channel close marks the existing lobby player disconnected and
stops its authority input while preserving its identity, team, vehicle, and
round seat. A replacement RTC epoch may reattach that identity during the
active round. Explicit leave and signaling `peer_left` still remove the seat.

The client first attempts ICE restart. If that remains failed, it creates a new
peer connection and rotates its signaling runtime epoch so the browser host
builds a matching offer. Presentation keeps one `MatchClientRuntime`; the game
freezes the last valid state for a bounded 60-second recovery window rather
than declaring an immediate result. Active signaling rooms live for 24 hours,
and durable rendezvous mailboxes retain ten minutes of bounded messages.

TURN remains a deployment requirement for peers whose NATs cannot form a
direct route. The client may fall back to public STUN so room creation remains
available during credential-service failure, but that degraded path is not a
cross-network reliability guarantee.

## Consequences

- Short network changes no longer evict a player or create result/UI spasms.
- Reconnect uses the same entity and presentation ownership instead of
  mounting a parallel match.
- The persistent-room browser gate destroys a live guest document, rejoins
  with the same stable player ID, and requires fresh snapshots and controls
  before the round may continue.
- Explicit departure remains deterministic and releases the room slot.
- Production release checks must prove `/api/ice` returns at least one TURN
  URL; a signaling health check alone is insufficient.

## Verification

    node server/signaling.selftest.mjs
    node src/net/privateMatchHandoff.selftest.mjs
    npm run test:net:browser
    npm run test:net:entry
    npm run typecheck
