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
`worldBuildCoordinator.ts` owns map transfer, construction joins, background
pacing, cancellation, residency, and eviction. `map.js` composes maps,
`terrain.js` provides the height field and world-local shared LOD index pools,
`collision.js` owns broad phase/shapes, `maps/` owns layouts, and vegetation,
props, destructibles, toppling, and wrecks own their visual/runtime layers.
`propsModelStore.ts` owns the bounds-checked packed runtime representation of
the attributed `props-models.json` authoring source; regenerate it with
`npm run world:props:pack` after intentional source changes.
`headlessCollisionWorld.js` inflates the captured authored records for a
dedicated server without importing any renderer or DOM state.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
Keep height/collision queries deterministic and headless-capable. Bound per-frame
LOD/vegetation work, reuse world caches, and reset destruction on rematch.
Certify structure connectivity before material-bucket or instanced-geometry
merges; merged geometry is too late to identify a floating authored fixture.
Keep large baked numeric streams out of executable chunks. Start their bounded
transfer with explicit Battle intent, overlap it with independent construction,
and verify the packed representation against its authoring source.
World meshes authored only as low-polygon shadow casters must use
`markShadowOnly()` from `src/engine/renderLayers.ts`; keep visible geometry on
the presentation layer and verify that native shadow submissions are unchanged.
Terrain position/normal buffers remain chunk-local, but identical LOD topology
must share one Uint16 index attribute per resolution within each world.
Register off-tree streamed LOD geometries with the world root's retained
resource lifetime so cache eviction can dispose them.
Use the warmed one-metre height cache for live non-authoring presentation. Keep
the analytic sampler for deterministic captures and construction receipts.
Deferred grass may prepare only a half-chunk beyond its unchanged fade band;
larger invisible lookahead jobs steal CPU from the opening drive.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
Identify the canonical height/collision source, add a focused world selftest,
then inspect all twenty maps and constrained-device frame metrics. Regenerate
the server collision manifest after changing authored obstacles or cover.

## Gotchas
<!-- agent-docs:fill:gotchas -->
The garage keeps the battle world dormant. Do not wake or build heavy map work
on the garage boot path. AI navigation must use traversability, not visuals.
