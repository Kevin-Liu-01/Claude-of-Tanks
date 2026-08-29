# 0291 — The battle HUD has a strict TypeScript owner

## Decision

Keep the battle-only presentation graph demand-loaded through
`src/ui/battleHudAccess.ts`, while moving the HUD implementation to
`src/ui/hud.ts`. Give frame input, aim state, tank presentation, spotting,
minimap, reticle, ammunition, event payload, DOM, and Canvas2D boundaries
explicit contracts.

## Why

The HUD is a large integration surface shared by solo and multiplayer battles.
Its former JavaScript boundary relied on implicit event shapes and nullable DOM
queries, allowing malformed payloads or missing markup to fail inside a render
frame. Explicit contracts make the boundary reviewable without changing the
visual system or adding work to its hot loops.

## Consequences

- HUD layout, animation, minimap, reticle, spotting, combat feedback, and
  multiplayer presentation remain behaviorally and visually unchanged.
- Garage startup still excludes the battle HUD; the access facade imports it
  only when battle presentation is requested.
- Required DOM and Canvas2D surfaces are validated once during construction.
- Event payloads are narrowed at the bus boundary, and shell-hit presentation
  rejects incomplete coordinates or damage values before rendering them.
- Existing scratch state, canvas caches, minimap pools, and repaint throttles
  retain their allocation and update cadence.
- Future HUD changes must extend the local contracts without `any`, compiler
  suppression, or an eager boot import.

## Verification

- `npm run typecheck`
- `node src/ui/hudMagazine.selftest.mjs`
- `node src/ui/minimapOrientation.selftest.mjs`
- `node src/ui/topAccentBorders.selftest.mjs`
- `node src/ui/spectatorSwitcher.selftest.mjs`
- `node src/ui/mobileLayout.selftest.mjs`
- `node src/ui/loadingScreens.selftest.mjs`
- `node src/game/battleHudFrameRuntime.selftest.mjs`
- `node src/ui/touchControls.selftest.mjs`
- `npm run build`
- `npm test`
