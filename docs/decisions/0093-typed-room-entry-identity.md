# ADR 0093: Room entry and commander identity are strict TypeScript

- Status: accepted
- Date: 2026-08-28

## Context

Cold private-room entry begins before multiplayer authority exists. The browser
must normalize a commander name, parse an untrusted invite, and select a
same-deployment or local-network signaling endpoint. Those small public
boundaries were JavaScript and repeated implicit string contracts across the
composition root, lobby policy, menu, ranked service, and tests.

## Decision

Move `playerNames.js`, `roomInvite.js`, and `signalEndpoint.js` to strict
TypeScript. Accept URL, identity, and configuration inputs as `unknown`, expose
literal private/LAN invite modes, and preserve current normalization, fallback,
RFC1918, localhost, `.local`, IPv6, and same-origin endpoint behavior.

Update every browser, server, and test consumer to import the typed owners
directly. Keep invite host names presentational: canonical identity continues
to come from signaling after join.

## Consequences

- Malformed first-visit URLs fail closed before room acquisition begins.
- UI, lobby, and ranked allocation share one commander-name contract.
- LAN and production signaling selection remain deployment-aware and explicit.
- The migration changes no network request, room code, or production payload.

## Verification

    npm run typecheck
    node src/net/roomInvite.selftest.mjs
    node src/net/net.selftest.mjs
    node server/rankedMatchmaker.selftest.mjs
    npm run test:net:entry
    npm run build
