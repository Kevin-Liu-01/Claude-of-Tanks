# ADR 0089: Private match handoff is strict TypeScript

- Status: accepted
- Date: 2026-08-27

## Context

The persistent-room acquisition and browser session owners were typed, but the
final lobby-to-match handoff remained JavaScript. That boundary validates the
starting lobby, resolves Random maps, fills bot seats, creates browser-hosted
authority, transfers live RTC channels without a message gap, and preserves
the room across later rounds. Inferred object shapes at this seam could confuse
player IDs, vehicle IDs, lobby seats, transports, and simulations.

## Decision

Move `src/net/privateMatchHandoff.js` to strict
`src/net/privateMatchHandoff.ts`. Define explicit structural contracts for
starting lobbies, human and bot seats, host/client sessions, transferred
channels, match transports, simulations, authority, and client facades.

Legacy JavaScript implementations remain behind narrow constructor/function
adapters. The typed handoff neither imports browser presentation nor changes
protocol packets, timing, team fill, catch-up limits, room persistence, or RTC
channel ownership. All lazy imports and browser certification tools now target
the TypeScript module directly.

## Consequences

- Invalid or incomplete handoff shapes fail type checking before reaching a
  live room.
- Host and client return values have explicit public contracts.
- The hot match runtime and simulation remain demand loaded; Garage boot gains
  no multiplayer work.
- The remaining JavaScript match runtime can migrate later behind this stable
  boundary instead of widening the composition root.

## Verification

    npm run typecheck
    node src/net/privateMatchHandoff.selftest.mjs
    node src/game/battleModuleAccess.selftest.mjs
    npm run test:net:entry
    npm run test:net:seven:full
    npm run build
