# ADR 0003: Private-room connectivity uses direct ICE with TURN fallback

- Status: accepted
- Date: 2026-08-25

## Context

STUN-only WebRTC works on permissive home networks but cannot cross every
symmetric NAT, carrier NAT, or enterprise firewall. Shipping a shared TURN
password in the client would turn a connectivity fix into an open relay and a
credential leak. LAN rooms should not leave the local network.

## Decision

Private internet rooms request short-lived ICE credentials from same-origin
`/api/ice`. The server-side endpoint exchanges a deployment secret for
time-bounded Cloudflare Realtime TURN credentials, or reads an explicitly
configured static ICE-server JSON secret. The browser never receives the
long-lived API token. ICE keeps `relayOnly` false so direct UDP remains the
preferred low-latency route and TURN is selected only when direct candidates
cannot connect.

If the optional credential service is temporarily unavailable, room creation
continues with the prior public STUN set and records a degraded reason. LAN
rooms request neither STUN nor TURN.

## Consequences

- First-time players behind restrictive networks have an automatic relay path.
- A TURN provider and deployment secrets are required to certify internet-room
  connectivity across arbitrary networks.
- Expiring credentials bound abuse and outlive the six-hour room lease.
- Local development remains usable without cloud credentials.

## Verification

    npm run typecheck
    node src/net/iceConfig.selftest.mjs
    node api/ice.selftest.mjs
    npm run test:net:browser
    npm run test:net:render -- --room-mode=private
    npm run build
