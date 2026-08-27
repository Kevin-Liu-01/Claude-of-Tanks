# ADR 0044: Baked minimaps have one typed async owner

- Status: accepted
- Date: 2026-08-27

## Context

The battle HUD starts from procedural tactical cartography and asynchronously
upgrades to the shipped supersampled map image. Generation tokens, pending
promise identity, installed-map state, active-world checks, trace mutation,
and fallback policy lived directly in `src/main.js`. A map could change while
decode was in flight, so this is one lifecycle rather than a simple asset call.

## Decision

`src/ui/minimapAssetRuntime.ts` owns the baked minimap request lifecycle. The
composition root provides active-world, prepared-service, HUD load, procedural
fallback, URL, clock, and trace-publication ports. The runtime exposes only
`queue(world)` and `dispose()`.

The runtime preserves these invariants:

- repeated requests for one world share one promise;
- an installed map is not loaded twice;
- a result may install only when its generation, active world object, and
  prepared service map are all still current;
- a superseded success is marked stale and cannot overwrite the new map;
- an asset error invokes procedural cartography only for the still-current
  prepared world;
- HUD absence and disposal start no work.

## Consequences

- `src/main.js` no longer owns minimap generation or promise state.
- The lifecycle is tested without a browser, GPU, HUD DOM, or real image.
- Asset bytes, tactical-map geometry, rendering, URL versioning, and fallback
  quality remain unchanged.

## Verification

    npm run typecheck
    node src/ui/minimapAssetRuntime.selftest.mjs
    node src/ui/loadingScreens.selftest.mjs
    node src/ui/battleHudAccess.selftest.mjs
    npm test
    npm run build
