# 0008 — Battle UI is a demand-loaded runtime boundary

## Context

The first garage frame does not display the combat HUD, damage schematic,
vehicle top-mask renderer, or mobile driving controls. Static imports
nevertheless transferred and evaluated that complete graph on every first
visit. They also made the integration entry own construction order and retry
state for independent UI modules.

## Decision

- `src/ui/battleHudAccess.ts` owns loading and construction of the HUD, damage
  panel, and top-mask rig as one retryable runtime.
- `src/ui/touchControlsAccess.ts` applies the same contract to the mobile battle
  controls; desktop and mobile garage boot do not construct that hidden DOM.
- Garage boot keeps the battle UI absent. Battle hover/focus may preload it;
  every solo, network, ranked, and deterministic-capture entry must acquire the
  same runtime before using battlefield services.
- Concurrent callers share one promise. A failed transfer clears that promise
  so the next intent or entry can retry without reloading the page.
- Garage and Studio teardown paths treat the battle HUD and damage panel as
  optional. A pristine direct-to-Studio visit must be able to enter and return
  to the garage before either battle-only module has ever been transferred.
- The boundary narrows the legacy JavaScript modules to an explicit TypeScript
  construction contract. Rendering, HUD content, masks, and battle behavior do
  not change.

## Consequences

The initial main chunk is smaller and garage-only users do not construct hidden
battle UI. The first battle may pay this transfer when no prior intent occurred,
but it happens under the existing opaque loader with loading audio and can run
alongside other battle preparation. This is the preferred extraction pattern
for further `main.js` decomposition: one behavior owner, a retryable promise,
and an explicit acquisition barrier at every consumer.

## Verification

- `battleHudAccess.selftest.mjs` proves request coalescing, construction order,
  reuse, and recovery after a failed import.
- `loadingScreens.selftest.mjs` proves pristine Studio entry and exit do not
  dereference an absent battle HUD or damage panel.
- `npm run perf:cold -- --sessions 5` exercises independent cache-disabled
  first visits plus failed-download and failed-evaluation recovery.
- `npm run perf:loading -- --mode battle --maps verdant` crosses the real lazy
  boundary and verifies a playable battle.
- `npm run typecheck`, `npm test`, and `npm run build` remain release gates.
