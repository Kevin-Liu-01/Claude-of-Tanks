# 0176 — Ranked matchmaking and ticket handoff is strict TypeScript

Status: accepted

## Decision

The bounded ranked queue, team balancer, map rotation, and dedicated-ticket
handoff are strict TypeScript. The module exports explicit queue, roster,
assignment, public-ticket, join, and health contracts and composes directly
with the typed match registry and rating store.

## Why

This service joins authenticated but untrusted HTTP input to authoritative
match creation. Its JavaScript state machine represented queue phases with
mutable nullable fields, inferred team arrays, and an unchecked ticket lookup.
That made queue expiry, settlement, and cold-client ticket exchange harder to
reason about than the underlying algorithm warrants.

## Consequences

- Team sizes remain 1, 2, 3, 5, or 7, with the same capacity, rating-band,
  queue TTL, match TTL, and result TTL limits.
- Vehicle eligibility, equipment sanitization, public camouflage fallback,
  unique callsigns, deterministic map rotation, seed generation, and rating
  balance are unchanged.
- Every roster player must receive an exact dedicated match ticket before the
  queue can transition to `matched`; a missing handoff now fails explicitly.
- Settlement accepts only authoritative `alpha`, `bravo`, or `draw` results
  and remains idempotent through the rating store.
- The dedicated server no longer needs constructor casts around the ranked
  service or rating store.
- Typecheck, ranked queue/HTTP/client, four-player dedicated reconnect, import
  integrity, and production build checks certify the migration.
