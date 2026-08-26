# ADR 0019: Battle-only imports have one typed access owner

- Status: accepted
- Date: 2026-08-26

## Context

Garage intent and battle entry shared five independently managed dynamic-import
promises in `src/main.js`. Each repeated the same memoization and retry logic.
That made the boot graph harder to audit and made a failed cold transfer easy
to handle inconsistently.

## Decision

`src/game/battleModuleAccess.ts` owns the play-menu, browser-network, private
handoff, dedicated-client, and room-chat module requests. Concurrent callers
share one promise. A failed request clears only its own slot so the next intent
or click retries it. The imports remain dynamic and retain their existing chunk
boundaries.

## Consequences

- `src/main.js` no longer owns battle-module promise bookkeeping.
- Cold-transfer recovery has one tested policy.
- Garage boot still imports none of the battle-only implementations.
- Entry and hover-intent behavior remain unchanged.

## Verification

    node src/game/battleModuleAccess.selftest.mjs
    npm run typecheck
    npm run build
