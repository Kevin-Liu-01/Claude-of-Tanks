---
name: src-sim-skill
description: Work on deterministic movement, armor, ballistics, damage, and spotting simulation.
---

# claude-of-tanks / src/sim

## Purpose
<!-- agent-docs:fill:purpose -->
Own authoritative armored-combat math at a fixed 60 Hz step.

## Mental model & key files
<!-- agent-docs:fill:model -->
`movement.ts` owns tank state and terrain contact through named fixed-step
phases for debuffs, drivetrain, gun lay, collision, attitude, support sampling,
and ride contact; `armor.ts` owns hit geometry;
`ballistics.ts` owns typed shells, gravity, guidance, penetration falloff, gun
lay, and dispersion; `damage.ts` owns penetration/modules/crew/fire;
`spotting.ts` owns strict renderer-free visibility and team-intel contracts;
`authoritativeMatch.ts` composes
those rules with match-local world collision for every network authority;
`specialActionPolicy.ts` and `specialActions.ts` own the strict shared state
machine for guided missiles, suspension aim, and manual magazine reloads;
`magazineIndicator.ts` is the one derivation of the reticle's multi-round indicator
(cannon magazine or guided rack salvo group) that the solo aim frame, the snapshot
and the reload event read;
`terrainMobility.ts` owns the allocation-free drivetrain/grip capability math
shared by movement and bot navigation;
`botRoutePlanner.ts` builds one typed seeded traversability grid per match and feeds
renderer-free openings into the game AI controller;
`deployment.ts` is the one symmetric deployment law (each bravo slot the rotation of its
alpha slot about the anchors' midpoint) that `matchPlacement.ts` resolves on the ground
(`terrainDeployment`, the world's `deploymentClearings`) and on the world (`deploymentSlot`)
for the authority, the browser host and the solo sim alike. Every spawn seat and revive also
faces open ground (the hull's lane holds no solid and no stretch steeper than `CLIFF_GRADE`;
a blocked heading turns up to 60°) and departs into both deployments' dry flood where the mode
built one; a plain respawn keeps the ruleset's `respawnSafeM` from live enemies. Keep spawn
laws in the match stage: the world dressing reads the ground stage, so changing it moves trees
and props and stales the collision manifests. `tools/spawn-points-probe.mjs` measures every
map x mode x seed headlessly (one process, 4 GB heap).

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
**One core, two drivers** (the owner, 2026-10-29; docs/ARCHITECTURE.md §1.6). This directory is the shared core, with the
bots (`src/game/ai.ts`, `botAbilities.ts`) and the world's collision. It imports nothing from either driver: no `src/mp`,
no `server/`, no `main.ts` or `src/app`, no browser global, and no three.js beyond its math. The local driver
(`game/state.ts` `simStep` on the page) and the online driver's authority (`authoritativeMatch.ts` in a room's host) step
the same core. From one seed, world, hulls and inputs they leave a byte-identical world. Guards:
`node tools/driver-boundaries.selftest.mjs` and `node src/sim/driverStepParity.selftest.mjs`. A rule added to one loop's
step goes into the other's in the same change (the two loops are not folded yet). Run the parity receipt after touching
either step.
Use meters/seconds/radians, injected seeded RNG, and reusable scratch math.
Never trust client hit/damage data. Visual track/hull geometry and combat
hitboxes must derive from the same authored profile where specified. Movement's
module-scoped scratch records make each module instance allocation-free but
non-reentrant: advance tanks sequentially inside a fixed-step owner.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
Read the matching selftest and architecture contract, add a failing invariant,
then edit. Run movement, combat, and spotting tests after shared-state changes.

## Gotchas
<!-- agent-docs:fill:gotchas -->
Render attitude has locked sign/order conventions. Do not introduce wall-clock
time, frame-rate-dependent integration, or Three.js renderer dependencies.
Run `node src/sim/authoritativeMatch.selftest.mjs` after changing match
composition, snapshot visibility, or multiplayer identity seams. A change to the
deployment law or its slot ground moves the world's spawn clearings: recapture the
collision shards and run `node src/sim/deployment.selftest.mjs` and
`node src/game/deploymentParity.selftest.mjs`. Bot route
changes must also pass `node server/authoritativeBots.selftest.mjs` on all maps.
Vehicle and decor code never imports `matchRuleset.ts`: a rule a vehicle build
also reads (the drone dock's launch height) lives in a leaf the ruleset reads and
re-exports (`droneDockRules.ts`), so a ruleset edit does not re-run some 600
vehicle receipts (`node src/sim/droneDockRules.selftest.mjs`).
Counter-drone (roof stations, the weapon profiles' drone fields, `AERIAL_RULES.drone`)
holds the owner's 226 rule: run `node src/sim/counterDroneEngagement.selftest.mjs` (data
only: every station carries its class's 226 numbers, the elevation ratchet),
`node src/sim/weaponReload.selftest.mjs` (the pinned hovers on the authority and in the
solo battle) and `node src/sim/counterDroneRuns.selftest.mjs` (every pinned pilot run
exactly, the owner's band), and for new or re-armed stations
`node tools/counter-drone-engage.mjs --ids=<ids> --check` (per vehicle: class, hovers
against the owner's literal counts, attack runs, elevation reach, the pins).
