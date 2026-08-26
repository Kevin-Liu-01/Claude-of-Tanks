# ADR 0020: Browser room integration has one typed coordinator

- Status: accepted
- Date: 2026-08-26

## Context

Private-room state was spread across `src/main.js` globals for pending lobby
intent, active room subscriptions, garage status, menu attachment, chat
buffering, player selection, ready/start commands, and rematch claims. The
individual operations were small, but their lifetime and ordering formed one
state machine that was difficult to audit or test as a whole.

## Decision

`src/net/networkRoomCoordinator.ts` owns the browser room lifecycle from lobby
handoff through repeated rounds. Rendering, garage, menu, chat, and match
commands remain injected ports; the coordinator imports no Three.js, DOM, or
authoritative simulation code. One typed owner now handles subscription
cleanup, selection locks, bounded chat buffering, room presentation, and the
single rematch claim.

## Consequences

- Room state and subscription lifetimes no longer leak through entry code.
- Selection, ready, start, chat, and rematch ordering are Node-testable.
- Optional chat/menu failures are fail-soft and retry on later room activity.
- Existing WebRTC transport and all visual presentation remain unchanged.

## Verification

    node src/net/networkRoomCoordinator.selftest.mjs
    npm run typecheck
    npm run test:net:browser
    npm run test:net:render
