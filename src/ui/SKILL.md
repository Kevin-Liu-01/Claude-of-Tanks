---
name: src-ui-skill
description: Work on garage, HUD, settings, mobile controls, transitions, and battle presentation UI.
---

# claude-of-tanks / src/ui

## Purpose
<!-- agent-docs:fill:purpose -->
Present game and session state with fast, legible desktop/mobile interactions.

## Mental model & key files
<!-- agent-docs:fill:model -->
`garage.js` owns roster/loadout presentation; `playMenu.js` owns direct Solo,
Private, LAN, and Ranked deployment; `networkStatus.js` owns reconnect feedback;
`hud.js` owns live battle chrome; `minimapAssetRuntime.ts` owns baked-map load
coalescing, stale-world rejection, and the procedural cartography fallback;
`settings.js` and `touchControls.js` own input-facing UI; `transition.ts`,
`battleLoad.ts`, and `endScreen.js` own flow beats.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
Consume canonical state rather than duplicating policy. Keep large/high-cost
screens lazy. Preserve large touch targets and test desktop plus mobile. Baked
minimap requests must pass through `minimapAssetRuntime.ts`; keep active-world
and prepared-service checks at the asynchronous completion edge.
Decorative metadata such as repository stars must use release-verified local
values; never add third-party network traffic to boot or Garage presentation.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
Inspect the live rendered surface, locate event/callback ownership, change the
smallest screen module, then run its selftest and browser verification.

## Gotchas
<!-- agent-docs:fill:gotchas -->
Several modules inject substantial CSS/DOM from JavaScript. Avoid boot-critical
imports and do not leave XP/currency labels after progression removal.
