# ADR 0040: RTC sessions own expiring TURN credential generations

- Status: accepted
- Date: 2026-08-26

## Context

Private rooms retain signaling membership for 24 hours, while production TURN
credentials normally expire after eight hours. The original room configuration
was captured once. A late peer join or replacement connection could therefore
reuse expired relay credentials even though signaling and the room were healthy.
The room-session owner was also one of the remaining untyped network boundaries.

## Decision

Migrate `privateRoomSession` to strict TypeScript. Give each host/client session
an `RtcIceLease` initialized from the room-entry configuration. Before a late
host join or replacement peer generation, refresh only when the credential
lease is near expiry. Deduplicate concurrent refreshes and retain a still-valid
TURN generation when the credential endpoint temporarily degrades to STUN.

Production certification is executable: `npm run net:prod:check` requires both
distributed Redis signaling readiness and at least one `turn:` or `turns:` URL.

## Consequences

- Long-lived rooms no longer reuse an expired TURN generation indefinitely.
- A transient credential-service outage cannot discard a relay that is still
  valid.
- Initial room entry remains non-blocking and keeps the existing direct/STUN
  degraded path.
- TURN remains an external deployment dependency. Code cannot make a restrictive
  NAT pair reliable while `/api/ice` is unconfigured.

## Verification

    node src/net/rtcIceLease.selftest.mjs
    node src/net/privateMatchHandoff.selftest.mjs
    node tools/production-multiplayer-check.selftest.mjs
    npm run typecheck
    npm run net:prod:check
