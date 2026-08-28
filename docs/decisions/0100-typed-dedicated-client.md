# ADR 0100: Dedicated browser matches have one strict reconnect owner

- Status: accepted
- Date: 2026-08-28

## Context

Ranked battle entry authenticates a WebSocket, waits for the shared match
protocol, and reconnects a player to the same authoritative entity. The
JavaScript owner left socket, ticket, client, and status shapes implicit. A
timeout or pre-authentication close could also leave channel listeners and an
unused socket resident until the browser reclaimed them.

## Decision

Move `src/net/dedicatedClient.js` to strict TypeScript. Define the authenticated
ticket, socket adapter, match client, connection, session, reconnect, and status
contracts. Give connection establishment one settled state and one cleanup path
for timeout, socket error, and pre-authentication close. Preserve the shared
match protocol, binary replaceable lanes, reconnect backoff, ready replay, and
authoritative entity continuity.

## Consequences

- Failed connection attempts release listeners and their socket immediately.
- Ranked entry and reconnect operate through an explicit session surface.
- Successful connections retain the same protocol and presentation behavior.
- The temporary typed constructor seam disappears when `matchRuntime` migrates.

## Verification

    npm run typecheck
    node server/dedicatedMatch.selftest.mjs
    node src/net/rankedServiceClient.selftest.mjs
    node src/game/battleModuleAccess.selftest.mjs
    npm run test:net:entry
    npm run build
