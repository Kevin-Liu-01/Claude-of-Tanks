# 0178 — The complete signaling deployment closure is strict TypeScript

Status: accepted

## Decision

The Vercel signaling and ICE entrypoints, WebSocket/HTTP signaling service,
in-memory room store, durable Redis room store, and room-code generator are one
strict TypeScript deployment closure. Vercel function configuration names the
TypeScript entries directly, and both server and API sources participate in the
repository compiler gate.

## Why

Private-room failures occurred at the seams between cold serverless entry,
Redis REST/pub-sub, local WebSocket ownership, durable mailboxes, RTC payload
validation, and reconnecting page sessions. Keeping those values inferred in
six JavaScript modules made a production-only packaging or lifecycle drift
possible even when local browser code was typed.

## Consequences

- Room creation and joining retain stable player IDs, session epochs, 24-hour
  room TTLs, bounded capacity, host identity, and explicit-host-leave closure.
- Unclean WebSocket loss still detaches only the process-local connection;
  membership remains durable so a cold/reloaded client can reclaim its seat.
- Redis REST remains authoritative while pub/sub is only a latency hint; the
  capped, expiring mailbox and serialized drains recover missed delivery once.
- SDP, ICE, payload-size, origin, message-rate, target-session, and health
  boundaries are narrowed before use.
- TURN credentials remain short-lived, origin-gated, no-store responses; static
  and Cloudflare-issued server lists share one validated schema.
- Dead peer-ID factories were removed because stable browser player IDs have
  owned signaling identity since reconnect support landed.
- ADR 0125's JavaScript-only packaging constraint is superseded now that the
  entire Vercel closure compiles and deploys as TypeScript.
- Typecheck, ICE, Redis mailbox, signaling cold/retry/rejoin/relay/closure,
  browser soak, import integrity, build, and production probes certify this
  boundary.
