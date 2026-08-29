# 0289 — Combat effects have a strict TypeScript owner

## Decision

Keep the demand-loaded combat-effects runtime in `src/fx/effects.ts`. Expose a
small `FxRuntime` lifecycle, type the event bus by event name and payload, and
give pooled mutable particle, light, tracer, trail, shell, smoke, and timer
records explicit local contracts.

## Why

Combat effects connect authoritative shell and vehicle events to particles,
lights, decals, terrain contact, destruction, and killcam presentation. The
former JavaScript owner left those payloads and pool records implicit, so an
invalid event or accidental allocation could cross several hot systems before
failing. This boundary also needs to stay out of Garage startup.

## Consequences

- Effect geometry, timing, seeded randomness, pool caps, material parameters,
  event order, and demand-loading behavior remain unchanged.
- The mapped event contract rejects mismatched event payloads at compile time.
- Mutable scratch and pool records remain reusable, preserving the established
  allocation-light update loops.
- Canvas and buffer-attribute assumptions fail at their owning boundary instead
  of leaking unchecked values through the runtime.
- Future combat effects must extend `FxRuntime` and its local contracts without
  `any`, compiler suppression, or an eager boot import.

## Verification

- `npm run typecheck`
- `node src/fx/fxRuntimeAccess.selftest.mjs`
- `node src/fx/lazyRuntime.selftest.mjs`
- `node src/fx/particleTextureAssets.selftest.mjs`
- `node src/fx/clock.selftest.mjs`
- `node src/fx/effectAttachments.selftest.mjs`
- `node src/fx/impactDecals.selftest.mjs`
- `node src/game/eraActivation.selftest.mjs`
- `node src/game/killcamPresentation.selftest.mjs`
- `node src/sim/combat.selftest.mjs`
- `node src/world/destructibleRenderPolicy.selftest.mjs`
- `npm run build`
- `npm test`
