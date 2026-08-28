# 0174 — Dedicated match transport service is strict TypeScript

Status: accepted

## Decision

The dedicated Node HTTP/WebSocket service is a strict TypeScript boundary. It
owns typed server options and service handles, bounded JSON input, origin and
bearer handling, WebSocket authentication, transport rate limits, fixed-step
timer ownership, health reporting, and orderly shutdown.

## Why

This is the public ranked-session trust boundary. Previously, request bodies,
authentication packets, server addresses, timers, registry attachment, and
shutdown callbacks were inferred JavaScript values. A malformed cold-client
request or lifecycle drift could therefore fail only after a socket or timer
had already been acquired.

## Consequences

- HTTP bodies remain capped at 16 KiB and must now be JSON objects before they
  reach ranked identity or queue operations.
- WebSocket authentication remains required within five seconds; packets are
  narrowed before credentials reach the match registry.
- Per-socket payload, buffered-byte, message-rate, and compression limits are
  unchanged.
- The returned service exposes an already-validated TCP address and typed
  advance/close ownership, while the 60 Hz authority remains unchanged.
- The temporary constructors around the still-JavaScript rating and ranked
  services make that remaining migration boundary explicit.
- Typecheck, four-player reconnect, ranked HTTP/client, import integrity, and
  production build checks certify the migration.
