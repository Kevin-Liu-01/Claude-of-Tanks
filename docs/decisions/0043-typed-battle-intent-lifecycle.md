# ADR 0043: Battle intent has one typed lifecycle owner

- Status: accepted
- Date: 2026-08-27

## Context

Battle hover, focus, passive garage dwell, and the eventual solo click operated
on the same future battle, but their policy was spread across `src/main.js`.
Separate timer, Random-map plan, texture generation, texture promise, and
camouflage handoff variables made their shared lifecycle implicit. Structural
tests could see individual calls but could not prove coalescing,
cancellation, or that the clicked Random battle consumed the world warmed on
hover.

## Decision

`src/game/battleIntentRuntime.ts` is the sole owner of speculative Battle work
and its covered roster handoff. The composition root supplies loaders, roster
planning, camouflage, scheduling, and presentation ports. The runtime exposes
only explicit preload, map-plan invalidation and consumption, covered roster
preparation, and disposal. Passive Garage dwell is deliberately not Battle
intent and cannot allocate a battlefield.

The runtime preserves these invariants:

- repeated intent coalesces the exact roster texture work;
- one `(spec, battleCount)` pair reserves one concrete Random map until click;
- tank/map changes and battle consumption invalidate the reservation;
- world construction starts only from explicit Battle intent, room roster
  intent, or covered entry—not from an idle Garage timer;
- speculative loader failures never block the covered entry path;
- covered preparation waits for an in-flight hover bake before changing shared
  camouflage canvases, cancels the stale generation, and resumes with the
  opaque loading-screen yielder;
- only selected-roster builders, textures, minimap, world, and battle-owned
  modules are requested—never the full fleet.

## Consequences

- `src/main.js` loses another 100 lines and returns to connecting ports.
- Random-map prefetch and battle selection cannot diverge.
- The module remains DOM- and WebGL-free, so lifecycle behavior is tested
  directly through its public interface.
- Rendering, texture resolution, map generation, camouflage, roster policy,
  and battle gameplay are unchanged.

## Verification

    npm run typecheck
    node src/game/battleIntentRuntime.selftest.mjs
    node src/game/loadingIntent.selftest.mjs
    node src/ui/loadingScreens.selftest.mjs
    node src/fx/lazyRuntime.selftest.mjs
    npm test
    npm run build
