---
name: src-world-skill
description: Work on terrain, maps, collision, vegetation, props, destructibles, and world streaming.
---

# claude-of-tanks / src/world

## Purpose
<!-- agent-docs:fill:purpose -->
Own deterministic battlefield geometry, collision queries, destruction, LOD,
and map presentation.

## Mental model & key files
<!-- agent-docs:fill:model -->
`map.js` composes maps, `terrain.js` provides the height field,
`collision.js` owns broad phase/shapes, `maps/` owns layouts, and vegetation,
props, destructibles, toppling, and wrecks own their visual/runtime layers.
`headlessCollisionWorld.js` inflates the captured authored records for a
dedicated server without importing any renderer or DOM state.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
Keep height/collision queries deterministic and headless-capable. Bound per-frame
LOD/vegetation work, reuse world caches, and reset destruction on rematch.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
Identify the canonical height/collision source, add a focused world selftest,
then inspect all twenty maps and constrained-device frame metrics. Regenerate
the server collision manifest after changing authored obstacles or cover.

## Gotchas
<!-- agent-docs:fill:gotchas -->
The garage keeps the battle world dormant. Do not wake or build heavy map work
on the garage boot path. AI navigation must use traversability, not visuals.
