# claude-of-tanks - Agent Index

> Pointer index for agents working in this repo. Keep this file lean: load linked
> files on demand, prune no-op instructions, and keep generated facts inside
> `agent-docs:auto` blocks.

## Overview
<!-- agent-docs:fill:overview -->
Browser-native Three.js armored combat game. The runtime combines a fixed-step
60 Hz simulation, procedural first-party vehicle fleet, sixteen battlefields,
garage/showroom presentation, bots, armor/ballistics/modules, and mobile input.
Treat current `origin/main` as active shared work: isolate broad changes in a
worktree and never stage generated tank work wholesale.

## Architecture Pointers
<!-- agent-docs:fill:architecture -->
- `docs/ARCHITECTURE.md` — original module contracts and simulation invariants.
- `docs/MULTIPLAYER-ARCHITECTURE.md` — authoritative multiplayer migration.
- `src/main.js` — boot, scene composition, UI flow, render loop, and legacy
  fixed-step integration; keep changes surgical.
- `src/game/state.js` — battle roster and authoritative simulation integration.
- `src/sim/` — movement, armor, damage, spotting, and ballistics logic.
- `src/net/` — transport-independent protocol, lobby, authority, and snapshots.

## Stack
<!-- agent-docs:auto:stack start -->
- **Name:** claude-of-tanks
- **Package manager:** npm
- **Languages:** typescript
- **Framework:** vite
<!-- agent-docs:auto:stack end -->

## Commands
<!-- agent-docs:auto:commands start -->
- Package scripts detected: 33. Use `package.json` as the exhaustive source.
- `npm run build` - VITE_PUBLIC_BUILD=1 vite build && node tools/strip-nc-assets.mjs
- `npm run test` - node src/dev/perfTrace.selftest.mjs && node src/engine/offscreenWarm.selftest.mjs && node src/engine/deviceDiag.selftest.mjs && node src/audio/voices.selftest.mjs && node src/audio/audioTiming.selftest.mjs && node src/net/net.selftest.mjs && node src/net/browserBattleBridge.selftest.mjs && node src/net/presentationEventQueue.selftest.mjs && node src/net/roomInvite.selftest.mjs && node src/net/localTankPrediction.selftest.mjs && node src/net/adverseNetworkTransport.selftest.mjs && node src/net/privateMatchHandoff.selftest.mjs && node src/net/rankedServiceClient.selftest.mjs && node server/signaling.selftest.mjs && node server/dedicatedWorldCollision.selftest.mjs && node server/dedicatedMatch.selftest.mjs && node server/ratingStore.selftest.mjs && node server/rankedMatchmaker.selftest.mjs && node server/rankedHttp.selftest.mjs && node server/authoritativeBots.selftest.mjs && node server/battlePacing.selftest.mjs && node src/sim/movement.selftest.mjs && node src/sim/combat.selftest.mjs && node src/sim/spotting.selftest.mjs && node src/sim/botRoutePlanner.selftest.mjs && node src/sim/authoritativeMatch.selftest.mjs && node src/sim/ai.aim.selftest.mjs && node src/game/ai.selftest.mjs && node src/game/profile.selftest.mjs && node src/game/equipment.selftest.mjs && node src/game/consumables.selftest.mjs && node src/game/mobileAutoAim.selftest.mjs && node src/game/matchmaking.selftest.mjs && node src/game/replayPose.selftest.mjs && node src/fx/impactDecals.selftest.mjs && node src/gallery/catalog.selftest.mjs && node src/vehicles/rosterPolicy.selftest.mjs && node src/vehicles/afvBalance.selftest.mjs && node src/vehicles/tier.selftest.mjs && node src/vehicles/appearanceAudit.selftest.mjs && node src/vehicles/vehicleMarkings.selftest.mjs && node src/vehicles/profiles/type99Armor.selftest.mjs && node src/vehicles/tankAssets.selftest.mjs && node src/vehicles/combatAnatomy.selftest.mjs && node src/vehicles/recoilRig.selftest.mjs && node src/world/mapQuality.selftest.mjs && node src/world/structureKit.selftest.mjs && node src/world/utilityNetwork.selftest.mjs && node src/world/wrecks.selftest.mjs && node src/world/topple.selftest.mjs && node src/world/loosePropPhysics.selftest.mjs && node src/world/collision.selftest.mjs && node src/world/propPlacement.selftest.mjs && node src/ui/endScreen.selftest.mjs && node src/ui/icons.selftest.mjs && node src/ui/flags.selftest.mjs && node src/ui/garageOrder.selftest.mjs && node src/ui/touchControls.selftest.mjs && node tools/track-geometry.selftest.mjs
- `npm run agent-docs` - node scripts/run-agent-docs.ts
- Keep this block compact. Put full command catalogs in a generated command index, not in AGENTS.md.
<!-- agent-docs:auto:commands end -->

## Directory index
<!-- agent-docs:auto:dirmap start -->
| Directory | Skill | Purpose |
|---|---|---|
| `server/` | [`server/SKILL.md`](server/SKILL.md) | Implement and operate Claude of Tanks signaling and dedicated authoritative multiplayer servers. |
| `src/audio/` | [`src/audio/SKILL.md`](src/audio/SKILL.md) | Work on event-driven spatial audio, radio voices, engines, weapons, ambience, and mix state. |
| `src/engine/` | [`src/engine/SKILL.md`](src/engine/SKILL.md) | Work on renderer, lighting, camera, postprocessing, device quality, and frame diagnostics. |
| `src/fx/` | [`src/fx/SKILL.md`](src/fx/SKILL.md) | Work on pooled particles, impacts, destruction effects, decals, and shared FX time. |
| `src/gallery/` | [`src/gallery/SKILL.md`](src/gallery/SKILL.md) | Build and verify the public Tank Gallery, its technical dossiers, and transient armor, module, and crew inspection overlays. |
| `src/game/` | [`src/game/SKILL.md`](src/game/SKILL.md) | Work on battle integration, bots, input, garage dressing, progression, replays, and studio state. |
| `src/net/` | [`src/net/SKILL.md`](src/net/SKILL.md) | Implement the transport-independent multiplayer protocol, lobby, authority, snapshots, and network adapters. |
| `src/sim/` | [`src/sim/SKILL.md`](src/sim/SKILL.md) | Work on deterministic movement, armor, ballistics, damage, and spotting simulation. |
| `src/ui/` | [`src/ui/SKILL.md`](src/ui/SKILL.md) | Work on garage, HUD, settings, mobile controls, transitions, and battle presentation UI. |
| `src/vehicles/` | [`src/vehicles/SKILL.md`](src/vehicles/SKILL.md) | Work on first-party procedural tank specs, builders, materials, profiles, ordering, and asset provenance. |
| `src/world/` | [`src/world/SKILL.md`](src/world/SKILL.md) | Work on terrain, maps, collision, vegetation, props, destructibles, and world streaming. |
| `tools/` | [`tools/SKILL.md`](tools/SKILL.md) | Maintain deterministic performance, screenshot, fleet, geometry, asset, and release verification tools. |
| `tools/marketing-shots/` | [`tools/marketing-shots/SKILL.md`](tools/marketing-shots/SKILL.md) | Generate deterministic branded marketing screenshots from staged game states. |
<!-- agent-docs:auto:dirmap end -->

## Repo graph sidecar (Graphify)
<!-- agent-docs:auto:repo-graph start -->
- Use Graphify for repo topology, path/explain/affected questions, PR risk, and unfamiliar codebase orientation.
- Use `rg` for exact strings; use Kevin-Wiki `qmd` for people, tools, decisions, and compiled wiki knowledge.
- Use `agent-browser` for browser/UI work; use Playwright only for committed regression tests.
- Runtime memories (Hermes/Hindsight/Honcho) are not project truth until written back to AGENTS.md, SKILL.md, or the wiki.
- Status: `cd ~/Documents/GitHub/kevin-wiki && npm run graphify:sidecar -- status --run outputs/graphify/claude-of-tanks`
- Build from this repo: `PROJECT_ROOT="$(pwd)" && cd ~/Documents/GitHub/kevin-wiki && npm run graphify:sidecar -- build "$PROJECT_ROOT" --run outputs/graphify/claude-of-tanks --no-viz`
- Query after build: `cd ~/Documents/GitHub/kevin-wiki && npm run graphify:sidecar -- query "what should I inspect first?" --run outputs/graphify/claude-of-tanks`
- Never run Graphify installers/hooks or commit generated `graphify-out/` artifacts.
<!-- agent-docs:auto:repo-graph end -->

## Environment variables (names only)
<!-- agent-docs:auto:env start -->
- (none detected)
<!-- agent-docs:auto:env end -->

## Conventions & invariants
<!-- agent-docs:fill:conventions -->
- Runtime units are meters, seconds, and radians; tank forward is local `+Z`.
- Simulation advances at `SIM_DT = 1/60`; rendering may be variable-rate.
- Simulation randomness is seeded/injected. Do not use wall-clock time or
  `Math.random()` in authoritative logic.
- Keep simulation and network modules Node-runnable and free of DOM/WebGL.
- No per-frame allocation in established hot loops; reuse scratch state.
- All playable tanks are first-party procedural runtime models. Source GLBs
  are comparison/authoring inputs, never a playable loading path.
- Add focused `*.selftest.mjs` coverage and include it in `npm test`.
- Any playable tank addition or geometry/profile change must run the complete
  combat-anatomy procedure: `npm run tank:anatomy:update`,
  `npm run tank:anatomy:check`, then the targeted
  `npm run tank:release:check -- --ids=<ids> --gate`. The update deliberately
  refreshes armor/module/crew receipts and all fleet technical diagrams.

## Gotchas / never-do-X
<!-- agent-docs:fill:gotchas -->
- Never modify or clean the shared dirty checkout to integrate unrelated work.
- Never equate a player/entity ID with a vehicle spec ID; duplicate tank picks
  are valid in multiplayer.
- Never send hidden enemy coordinates to a client and rely on rendering to hide
  them; spotting filters snapshots before serialization.
- Never make a client authoritative for hits, damage, reloads, or match result.
- Do not import full fleet builders into a new boot-critical module.

## Extending this project's agent system
<!-- agent-docs:fill:extending -->
Refresh generated blocks with `KEVIN_WIKI_ROOT=/Users/kevinliu/repos/Kevin-Wiki-v3
npm run agent-docs -- scaffold .`, then run the corresponding `doctor --json`.
Edit prose only below `agent-docs:fill` markers; generated auto blocks are owned
by the scaffold command.
