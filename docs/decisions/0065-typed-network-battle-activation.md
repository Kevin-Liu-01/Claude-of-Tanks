# ADR 0065: Network battle activation is one atomic presentation transition

- Status: accepted
- Date: 2026-08-27

## Context

After network acquisition, roster construction, the first authority snapshot,
shader warming, and the all-peer readiness barrier, `src/main.js` performed a
long sequence of mutable presentation changes. Player and spectator paths had
to agree on world reset, camouflage, HUD identity, effects, result state,
phase events, camera ownership, and Garage shutdown. A partial edit could expose
a battle with stale Garage or previous-round state even though authority was
healthy.

## Decision

`src/net/networkBattleActivationRuntime.ts` owns the atomic transfer from a
fully prepared network bridge to the live battle phase. It receives presentation
capabilities as ports and exposes one `activate()` operation for both players
and spectators.

The operation resets transient presentation state before publishing the battle
phase, keeps selected-vehicle and damage UI work out of spectator entry, starts
the correct chase or observer camera, and stops the Garage showroom last. Match
connection, authority, warming, and readiness remain separate owners.

## Consequences

- The composition root no longer duplicates the mutable activation sequence.
- Player and spectator activation order is executable in Node.
- Rematches pass through the same result, effects, world, HUD and camera reset.
- The module remains renderer- and DOM-independent; it changes presentation
  state but never becomes authoritative for combat or match results.

## Verification

    node src/net/networkBattleActivationRuntime.selftest.mjs
    node src/net/networkBattleLaunchRuntime.selftest.mjs
    node src/net/networkRoomCoordinator.selftest.mjs
    npm run test:net:browser
    npm run typecheck
    npm run build
