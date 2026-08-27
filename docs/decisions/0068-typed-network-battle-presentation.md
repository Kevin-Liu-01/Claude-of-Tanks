# ADR 0068: Cold network battle presentation has one typed owner

- Status: accepted
- Date: 2026-08-27

## Context

Private, LAN, and dedicated matches already shared typed launch, acquisition,
barrier, and activation modules, but `src/main.js` still implemented the
roughly 230-line transition connecting them. That code owned order-sensitive
cold-client behavior: loader state, parallel module/world/transport work,
bridge construction, exact roster preparation, initial authority, terrain and
combat warmup, all-peer readiness, black-frame validation, and reveal.

The implementation had two real production adapters and a realistic in-memory
test adapter, yet its policy could only be exercised through the entire browser
composition root. A slow or failed first visit could therefore regress the most
important bridge-publication and cleanup ordering without a focused test.

## Decision

`src/net/networkBattlePresentationRuntime.ts` is a strict-TypeScript deep
module with one public `present()` operation. The composition root injects map,
loader, transport, bridge, renderer, warmup, and activation ports. The module:

- overlaps module, battlefield, and match-channel acquisition;
- keeps the new bridge private until exact roster preparation and a
  viewer-bearing authoritative snapshot both succeed;
- disposes that unpublished bridge on either failure;
- runs terrain, wreck, effect, shader, and all-peer readiness work while the
  opaque loader owns the screen; and
- delegates atomic activation, validates the resulting frame, then reveals.

`src/net/networkBattlePresentationAccess.ts` is the retryable intent boundary
above that owner. Garage and solo boot import only the small access module; a
network-mode hover, waiting-room update, or actual entry transfers the deep
runtime chunk. Concrete adapter closures are assembled only after that chunk
succeeds, and a failed transfer may be retried without reloading the page.

## Consequences

- `src/main.js` falls from 3,616 to 3,489 lines while retaining concrete
  renderer, world, UI, and transport wiring.
- Private/LAN and dedicated paths cannot drift into different cold-start
  ordering because both call the same operation.
- The lifecycle is Node-testable without WebGL, signaling, a room service, or
  a real battlefield.
- Garage and solo boot no longer evaluate multiplayer-only presentation policy
  or allocate its adapter object graph.
- The production main chunk is 570.20 kB minified / 194.00 kB gzip; the deep
  presentation owner is a separate 3.96 kB / 1.71 kB gzip intent chunk.
- No protocol, authority, simulation, visual, loader copy, or warmup behavior
  changes; this commit moves ownership and adds proof.

## Verification

```sh
node src/net/networkBattlePresentationAccess.selftest.mjs
node src/net/networkBattlePresentationRuntime.selftest.mjs
node src/game/loadingIntent.selftest.mjs
node src/net/networkBattleLaunchRuntime.selftest.mjs
node src/net/networkBattleActivationRuntime.selftest.mjs
npm run typecheck
npm run build
npm run perf:resources:gate
npm run test:net:entry
npm run test:net:seven:full
```

The complete-match gate uses 28 pristine browser contexts across two 7v7 runs.
Both host and impaired-client renderers completed with all 14 commanders firing,
zero pre-combat hard snaps, zero live hard snaps, and no browser errors.
