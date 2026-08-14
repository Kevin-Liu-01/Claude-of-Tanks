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
`movement.js` owns tank state and terrain contact; `armor.js` owns hit geometry;
`ballistics.js` owns shells; `damage.js` owns penetration/modules/crew/fire;
`spotting.js` owns visibility and team intel.

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
