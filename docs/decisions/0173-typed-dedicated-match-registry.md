# 0173 — Dedicated match lifecycle is strict TypeScript

Status: accepted

## Decision

The dedicated match registry is a strict TypeScript boundary. It owns typed
match tickets, credential authentication, authoritative simulation/runtime
composition, transport attachment, reconnect replacement, result retention,
and final resource cleanup. Server TypeScript files are included in the main
compiler gate.

## Why

This registry connects untrusted network credentials to persistent match
authority. In JavaScript, transport, player, token, and lifecycle state could
drift independently, and a late close event from a replaced socket could mark
the live replacement offline. The server needs machine-checked ownership at
that seam before the wider dedicated and signaling services are migrated.

## Consequences

- Match and player IDs keep the existing validation and per-player tokens are
  still stored only as SHA-256 hashes with timing-safe comparisons.
- Reconnects retain the authoritative entity, simulation clock, and combat
  state while atomically replacing the peer transport.
- Each connection now has a generation guard and owned close subscription, so
  a retired channel cannot change the replacement channel's connected state.
- Completed matches retain their existing 30-second final-snapshot window and
  then release peer listeners, transports, and registry state.
- The deterministic simulation remains shared with browser-hosted matches; the
  nullable wire-input adapter is isolated at the registry/runtime boundary.
- Typecheck, dedicated reconnect, ranked queue/HTTP, import integrity, build,
  and the multiplayer tests certify this migration.
