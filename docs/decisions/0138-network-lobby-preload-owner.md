# 0138: Lobby intent preparation is retryable and delta-based

## Status

Accepted — 2026-08-28

## Decision

`src/net/networkLobbyPreloader.ts` owns the preparation edge between a waiting
multiplayer room and round activation. It coalesces repeated room-state packets,
retries failed optional transfers, loads only newly introduced vehicle builders,
and changes background world intent only when the selected map changes.

The owner remains fire-and-forget: a slow or unavailable optional presentation
chunk cannot block room controls, readiness, chat, or signaling.

## Consequences

- Frequent lobby updates no longer allocate duplicate catch chains or restart
  identical map/roster preparation.
- First-time clients retain retry paths after transient chunk failures.
- `main.js` no longer owns multiplayer preload state or failure policy.
