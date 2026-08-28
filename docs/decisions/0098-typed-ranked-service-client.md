# ADR 0098: Ranked browser service access is strict TypeScript

- Status: accepted
- Date: 2026-08-28

## Context

The ranked browser client owns persistent anonymous identity, authenticated
queue tickets, polling, cancellation, profiles, and leaderboard access. Its
JavaScript implementation trusted untyped HTTP bodies and left abort listeners
attached after successful polling delays.

## Decision

Move `src/net/rankedServiceClient.js` to strict TypeScript. Define the service,
identity, ticket, queue-state, storage, and wait contracts. Validate successful
JSON responses, identity credentials, ticket credentials, and queue status at
the HTTP boundary. Remove each abort listener when its polling delay settles.

Preserve endpoint normalization, bearer authentication, identity persistence,
poll cadence, queue semantics, and WebSocket URL conversion.

## Consequences

- Malformed service responses fail before reaching play-menu state.
- Ranked reloads retain only complete identities.
- Long queue waits do not accumulate settled abort listeners.
- Network behavior and rendered game presentation are unchanged.

## Verification

    npm run typecheck
    node src/net/rankedServiceClient.selftest.mjs
    node server/rankedHttp.selftest.mjs
    node server/dedicatedMatch.selftest.mjs
    npm run build
