# ADR 0079: The live battle HUD has one typed frame owner

- Status: accepted
- Date: 2026-08-27

## Context

The render loop in `src/main.js` assembled the mutable HUD record, selected a
local-player or spectator perspective, refreshed spotting disclosure, resolved
gun aim, filtered opponents for scoped plate inspection, and updated the damage
panel. These rules were inseparable in behavior but scattered across the
composition root. They were also difficult to test without starting Three.js.

## Decision

`src/game/battleHudFrameRuntime.ts` owns the complete live HUD transaction. It
retains the frame, spotting view, and armor-target array and exposes four
operations:

- `update()` publishes one live player or spectator frame;
- `refreshSpotting()` supports deterministic capture staging;
- `redrawFrozen()` repaints a frozen capture frame;
- `reset()` releases the previous battle roster on Garage entry.

The composition root supplies concrete HUD, aim, overlay, damage-panel,
network-session, and kill-cam ports. It does not implement their ordering or
visibility policy. The owner is allocation-free on the ordinary frame path and
remains importable in Node without DOM or WebGL construction.

## Consequences

- Spectator perspective and local-player aim cannot diverge into parallel HUD
  implementations.
- Spotting and scoped armor disclosure have one testable visibility policy.
- `src/main.js` loses more than one hundred lines of mutable frame policy.
- Capture tooling uses the same retained frame as live play.
- Future HUD-frame behavior belongs in this owner, not in `tick()`.

## Verification

    node src/game/battleHudFrameRuntime.selftest.mjs
    node src/game/aimController.selftest.mjs
    node src/net/browserBattleBridge.selftest.mjs
    node src/ui/loadingScreens.selftest.mjs
    npm run typecheck
    npm test
    npm run build
