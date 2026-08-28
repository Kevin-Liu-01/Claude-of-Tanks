# 0190 — Multiplayer menu handoffs share canonical wire contracts

Status: accepted

## Decision

The Garage play-surface loader consumes the public `playMenu.ts` contracts
directly. Private-room, LAN, ranked, and lobby callbacks no longer cross a
parallel `Record<string, unknown>` API in the loader or application root.

Ranked queue state describes the public match assignment and roster carried by
the service. Retained-room presentation validates that a match-room packet has
the complete serialized-lobby shape before attaching it to the menu.

## Why

The former duplicate interfaces compiled even when the menu, loader, room
coordinator, and ranked client disagreed about nullable vehicle selection or
the match ticket nested inside a queue response. A shallow match-room packet
could also be passed to UI code that requires the complete lobby, turning a
recoverable network anomaly into a late rendering exception.

## Consequences

- Battle-mode intent, invite fields, solo rules, private handoff, ranked
  assignment, and lobby callbacks use one compile-time contract.
- A missing selected vehicle is rejected before either a first battle or a
  retained-room rematch starts.
- Partial or malformed room packets remain outside the complete lobby UI; a
  later canonical state can restore presentation without recreating transport.
- Existing room acquisition, endpoints, layout, gameplay, and lazy-loading
  behavior remain unchanged.
- Typecheck, menu retry, room/rematch, ranked-client, private handoff, and
  production-build gates certify the boundary.
