# 0277 — Scene Studio runtime has a strict TypeScript boundary

## Decision

Keep the Scene Studio compositor in `src/game/studio.ts` and make its world,
actor, movement, effect, storyboard, recording, transition, and panel
integration contracts explicit. Export the narrow panel-facing actor and API
contracts from `src/ui/studioPanel.ts` so the view and runtime are checked at
their actual seam without importing browser-heavy implementation code.

## Why

Scene Studio combines most of the game's presentation systems but remains
outside battle authority. Its former JavaScript implementation relied on
implicit object shapes for scene recipes and browser recording state, making
invalid authoring data and integration drift fail only after an interactive
Studio entry. A strict boundary makes that composition understandable while
retaining the existing deterministic timeline and lazy route.

## Consequences

- Studio scene recipes, actor poses, effect parameters, camera rails, and
  recording sessions are checked before they reach the live scene.
- Studio remains lazy-loaded and does not enlarge the Garage's critical path.
- The fixed-step effect timeline, visual recipes, capture dimensions, DOM,
  keyboard and pointer behavior, and exported `window.__STUDIO` API are
  unchanged.
- Malformed non-serializable actor references now normalize to their stable
  actor id at the JSON boundary.
