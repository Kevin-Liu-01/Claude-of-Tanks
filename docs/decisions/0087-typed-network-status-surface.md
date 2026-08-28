# ADR 0087: Reconnect status has one strict typed surface

- Status: accepted
- Date: 2026-08-27

## Context

The reconnect banner and optional F3 diagnostics surface consumes nested
transport, jitter-buffer, acknowledgement, and prediction measurements. Its
unchecked JavaScript contract allowed diagnostics payload drift to fail only
inside a live multiplayer session.

## Decision

Move `src/ui/networkStatus.js` to `src/ui/networkStatus.ts` and define the
connection-state, diagnostics, and controller contracts at the lazy battle
module boundary. Preserve DOM, CSS, keyboard ownership, sampling cadence,
local preference storage, and all rendered diagnostic text.

No `any`, `@ts-ignore`, or `@ts-nocheck` escape hatch is introduced.

## Consequences

- Lazy battle acquisition validates the reconnect surface at compile time.
- Transport and prediction diagnostics can evolve through an explicit payload
  contract instead of ad hoc nested objects.
- Multiplayer presentation behavior and bundle timing remain unchanged.

## Verification

    npm run typecheck
    node src/game/battleModuleAccess.selftest.mjs
    node src/ui/mobileLayout.selftest.mjs
    npm run build
