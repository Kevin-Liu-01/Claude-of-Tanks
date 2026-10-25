---
name: src-techtree-skill
description: Maintain the read-only national tech trees the Garage draws - tree data, lineage, tiers as columns and the connector layout.
---

# claude-of-tanks / src/techTree

## Purpose
<!-- agent-docs:fill:purpose -->
The thirteen national tech trees the Garage's tech-tree screen draws (`src/ui/techTree.ts`): every production vehicle
once, its lines as rows and tiers as columns, twin builds on one node and a special lane under the lines. The view is
read-only and presentational: every vehicle is available, and nothing here grants, locks or costs anything.

## Mental model & key files
<!-- agent-docs:fill:model -->
- `model.ts`: the types (`TreeNode`, `NationTree`). A node's `tier` is its column in the drawing; the game's tier table
  (`src/vehicles/tier.ts`) is separate and untouched.
- `nations/<nation>.ts`: one tree each, generated together (the authoring script lives with the tree design, outside
  the repository); edit them only by regenerating, then re-pin the receipt.
- `trees.ts`: the registry (`TECH_TREES`, in the Garage's nation order), `nodeForVehicle` (a twin build resolves to
  its node), `rootOf` and `validateTree`.
- `layout.ts`: `layoutTree` places nodes and routes connectors in grid units; `layoutProblems` finds a connector
  through a node or two parents' connectors crossing or overlapping. The screen draws exactly these routes.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
- Pure data and geometry: no DOM, Node-runnable, imported only by the lazy tech-tree screen and the Garage's lazy
  opener, never by a boot module.
- A child never sits left of a parent; specials have no parents and no children; one root per tree.
- Every production vehicle is drawn exactly once, in its own nation's tree: a new playable vehicle needs a node.
- Nodes carry only the drawing (id, tier, line, lane, parents, slot, builds).

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
A new vehicle or a moved node: regenerate the nation files, then run `node src/techTree/techTree.selftest.mjs` and
re-pin the content hash it reports. A drawing fault: `layoutProblems(tree)` names the connector.

## Gotchas
<!-- agent-docs:fill:gotchas -->
The receipt checks the trees against `TANK_CATALOGS.production`: a vehicle added to the fleet without a node fails it.
