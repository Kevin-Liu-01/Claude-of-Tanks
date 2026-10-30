---
name: src-mp-skill
description: Work on the online driver - rooms, the binary wire, transports, the match client's prediction and interpolation, the browser host and the session owner.
---

# claude-of-tanks / src/mp

## Purpose
<!-- agent-docs:fill:purpose -->
Own the **online driver**: a room with people (the Rooms Worker, LAN), its wire, transports, host and client. The module
map and layer contracts are in [README.md](README.md); the design and its history are in
[docs/MULTIPLAYER-V2.md](../../docs/MULTIPLAYER-V2.md).

## Mental model & key files
<!-- agent-docs:fill:model -->
**One core, two drivers** (the owner, 2026-10-29; docs/ARCHITECTURE.md §1.6, MULTIPLAYER-V2 §13.32). The shared core
(`src/sim`, the bots, the world's collision and kernels) is stepped by two drivers:
- **Online (this directory).** The authority, `server/match/matchActor.ts` in the room host's Worker
  (`host/matchHostCore.ts`) or in Node, runs the core's step (`src/sim/authoritativeMatch.ts`). The client (`match/`)
  predicts the own hull, interpolates the rest and reconciles, because the network is real. `session/` owns a room's
  session. `presentation/` draws the frames. The collision world's loader (`src/world/collisionWorldLoad.ts`; `host/worldCollision.ts`
  re-exports it) and the destruction mirror (`src/world/destructionMirror.ts`) are shared with the local Worker driver:
  keep them free of `src/mp` imports.
- **Local (`src/game/state.ts` and the `solo*` owners).** A solo battle, the campaign, the Proving Ground, Watch,
  replays and the Jev opponent step the core on the page. They never reach this directory.

`src/main.ts` composes this driver only in its online declarations: `onlineMatch` (the composition access),
`onlineMatchActive`, `onlinePump`, `loadMultiplayerV2Composition`, `multiplayerAppPorts`, the lobby and the Play menu.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
Nothing here is a local battle's. A private room with bots is an online room: it never pauses and never holds its
countdown for one page. Never route a local battle through a room, a loopback or the match client. Release 255's solo
local host and 261's solo sim Worker did, and the owner felt the rubberbanding (MULTIPLAYER-V2 §13.31, retired). A rule
the authority applies that the prediction lacks shows up as a snap. Mirror it in `presentation/predictionWorld.ts` and
the destruction mirror (`predictionStructureYield.selftest.mjs` is the pattern).

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
Read README.md's layer contract for the layer you touch, then run its receipts (`npm test -- --only='src/mp/**'`).
After touching the authority's step, run `node src/sim/driverStepParity.selftest.mjs`. After any new import into or out
of this directory, run `node tools/driver-boundaries.selftest.mjs`.

## Gotchas
<!-- agent-docs:fill:gotchas -->
`src/mp/session/compositionAccess.ts`, `roundState.ts` and `intentCover.ts` sit on the boot path for the online
composition's lazy owner and its loading cover. Keep them light. Name them in main.ts only inside the online declarations
(`tools/driver-boundaries.mjs` `MAIN_ONLINE_DECLARATIONS`).
