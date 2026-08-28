# ADR 0095: Every match transport has one strict bounded contract

- Status: accepted
- Date: 2026-08-28

## Context

Solo, campaign, browser-hosted, and dedicated matches all use the same message
seam, but its loopback and channel implementations were JavaScript object
literals. Reliable control, replaceable state/input, backpressure, codec,
listener, closure, and diagnostics shapes were therefore implicit. WebRTC
declared a smaller duplicate transport interface that omitted the implemented
coalescing and diagnostic methods.

## Decision

Move `loopbackTransport.js` and `channelTransport.js` to strict TypeScript.
Export explicit message, loopback, codec, channel, statistics, and split-lane
contracts. Keep external channel and wire values `unknown` until structural
runtime checks admit them.

Preserve the asynchronous loopback default, zero-copy direct host link,
bounded queue behavior, reliable ordered control, unordered zero-retransmit
state lane, replaceable input/state coalescing, byte ceilings, close
propagation, and diagnostics exactly. Make WebRTC use the shared channel
transport type instead of a duplicate subset.

## Consequences

- Solo and network matches compile against the same transport contract.
- Backpressure and replacement statistics have explicit stable shapes.
- Unsupported or malformed channels fail before listeners are installed.
- No packet, queue, cadence, or runtime allocation behavior changes.

## Verification

    npm run typecheck
    node src/net/net.selftest.mjs
    node src/net/privateMatchHandoff.selftest.mjs
    node src/net/matchRuntime.deadPeer.selftest.mjs
    node server/signaling.selftest.mjs
    npm run test:net:entry
    npm run build
