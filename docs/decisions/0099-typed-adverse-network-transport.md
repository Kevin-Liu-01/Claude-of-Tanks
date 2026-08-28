# ADR 0099: Adverse network certification has a strict transport contract

- Status: accepted
- Date: 2026-08-28

## Context

Browser and headless multiplayer certification wrap real transports with
deterministic latency, jitter, snapshot loss, and input loss. The JavaScript
wrapper had no common contract for lane capabilities, timers, listeners, or
statistics, so TypeScript session owners had to cast it back into their match
transport shape.

## Decision

Move `src/net/adverseNetworkTransport.js` to strict TypeScript. Define the
simulatable transport, optional replaceable lanes, simulation settings,
statistics, timer ownership, and wrapped transport surface. Preserve reliable
ordering, millisecond timer separation, replaceable-lane loss behavior, and QA
query parameters exactly. Let session owners accept the explicit wrapper type
instead of casting it to a WebRTC channel transport.

## Consequences

- Private, dedicated, and test transports share one checked simulation seam.
- Match session code no longer claims the wrapper is a raw RTC channel.
- Timer cancellation and listener disposal remain bounded and inspectable.
- Production behavior is unchanged unless adverse-network QA is enabled.

## Verification

    npm run typecheck
    node src/net/adverseNetworkTransport.selftest.mjs
    node src/net/privateMatchHandoff.selftest.mjs
    node server/dedicatedMatch.selftest.mjs
    node tools/multiplayer-browser-soak.mjs
    npm run build
