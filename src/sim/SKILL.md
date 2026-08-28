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
`movement.ts` owns tank state and terrain contact; `armor.js` owns hit geometry;
`ballistics.ts` owns typed shells, gravity, guidance, penetration falloff, gun
lay, and dispersion; `damage.js` owns penetration/modules/crew/fire;
`spotting.js` owns visibility and team intel; `authoritativeMatch.js` composes
those rules with match-local world collision for every network authority;
`specialActionPolicy.ts` and `specialActions.ts` own the strict shared state
machine for guided missiles, suspension aim, and manual magazine reloads;
`terrainMobility.ts` owns the allocation-free drivetrain/grip capability math
shared by movement and bot navigation;
`botRoutePlanner.ts` builds one typed seeded traversability grid per match and feeds
renderer-free openings into the game AI controller.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
Use meters/seconds/radians, injected seeded RNG, and reusable scratch math.
Never trust client hit/damage data. Visual track/hull geometry and combat
hitboxes must derive from the same authored profile where specified.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
Read the matching selftest and architecture contract, add a failing invariant,
then edit. Run movement, combat, and spotting tests after shared-state changes.

## Gotchas
<!-- agent-docs:fill:gotchas -->
Render attitude has locked sign/order conventions. Do not introduce wall-clock
time, frame-rate-dependent integration, or Three.js renderer dependencies.
Run `node src/sim/authoritativeMatch.selftest.mjs` after changing match
composition, snapshot visibility, or multiplayer identity seams. Bot route
changes must also pass `node server/authoritativeBots.selftest.mjs` on all maps.
