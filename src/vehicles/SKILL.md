---
name: src-vehicles-skill
description: Work on first-party procedural tank specs, builders, materials, profiles, ordering, and asset provenance.
---

# claude-of-tanks / src/vehicles

## Purpose
<!-- agent-docs:fill:purpose -->
Own the playable fleet's canonical specs, first-party visuals, armor metadata,
materials, and garage ordering.

## Mental model & key files
<!-- agent-docs:fill:model -->
`specs.js` is the registry, `tankFactory.js` builds/synchronizes visuals,
`profiles/` owns authored families, `tier.js` and `fleetOrder.js` own metadata,
and `tankAssets.js` owns UI asset mappings.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
All playables use first-party runtime geometry; source GLBs are comparison-only.
Keep turret/gun parenting correct, derive track hit geometry from the running
gear profile, and land per-tank changes atomically with audits.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
Read current program state and the relevant family profile, inspect standard
side/top views, run focused geometry gates, then fleet/family/assets checks.

## Gotchas
<!-- agent-docs:fill:gotchas -->
The shared checkout often contains active tank-generation WIP. Never stage
builders, profiles, icons, GLBs, or generated geometry ledgers by directory.
