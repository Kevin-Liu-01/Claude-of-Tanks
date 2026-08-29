# 0296 — The procedural tank factory has a strict TypeScript owner

## Decision

Move the cycle-free procedural vehicle implementation from
`src/vehicles/tankFactoryCore.js` to `src/vehicles/tankFactoryCore.ts`. Model
the builder port, material buckets, running gear, destructible ERA, marking
seats, presentation contacts, animation state, and resource ownership as
explicit contracts. Keep the lazy fleet facade as the only browser-facing
construction entry point.

## Why

The factory is the shared boundary between more than one hundred procedural
vehicle profiles and the garage, battle, studio, anatomy, and release tools.
Its former implicit object shapes allowed a malformed profile or pose packet
to fail deep inside a large geometry build. The same ambiguity obscured which
GPU resources and scene nodes each visual owns at disposal time.

## Consequences

- Profile builders receive one typed capability port; geometry transforms,
  articulation groups, markings, ERA clusters, and running gear can no longer
  silently disagree on their data shape.
- Public pose and engine-context inputs remain compatible with existing
  callers but are validated once at the boundary before the hot path uses
  them.
- The factory records geometry, materials, textures, static detail groups,
  and shadow proxies under explicit lifecycle types without adding per-frame
  allocation.
- Runtime build order, procedural geometry, materials, transforms, animation,
  visuals, battle behavior, and demand-loading boundaries are unchanged.
- Remaining fleet-profile JavaScript can migrate independently behind this
  stable TypeScript contract.

## Verification

- `npm run typecheck`
- `node src/vehicles/tankFactoryCore.selftest.mjs`
- `npm run tank:anatomy:update`
- `npm run tank:anatomy:check`
- `npm run build`
- `npm test`
