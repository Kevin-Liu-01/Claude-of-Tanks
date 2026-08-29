# 0293 — The T-90 profile family has a strict TypeScript owner

## Decision

Move the nine-variant T-90 family from
`src/vehicles/profiles/t90.js` to `src/vehicles/profiles/t90.ts`. Define the
family's geometry, material, builder, running-gear, and profile-registration
contracts locally, and validate the legacy factory boundary before an authored
builder receives it.

## Why

The T-90 family is one of the largest remaining unchecked fleet owners. Its
geometry helpers, variant options, tuple-shaped station data, mutable armor
metadata, and late running-gear correction previously relied on implicit
JavaScript shapes. A file rename without explicit contracts would make the
migration cosmetic and leave malformed factory integration to fail deep inside
an 8,000-line builder.

## Consequences

- T-90A, T-90, T-90MS, T-90A Burlak, PT-91M, T-90SM, T-90A Vladimir, T-90M,
  and T-90M Proryv now compile under the strict project configuration.
- The one-argument profile adapter accepts the temporary legacy boundary as
  `unknown` and validates its complete required builder surface once before
  construction.
- Geometry constants, build order, materials, transforms, generated anatomy,
  markings, presentation anchors, and demand-loading group remain unchanged.
- Two unused `weldFlat` option fields were removed. The receiving helper never
  read them, so this does not alter emitted geometry.
- Four unchecked runtime JavaScript owners remain: the Abrams, Leopard, and
  Merkava profiles plus `tankFactoryCore.js`. They remain migration work, not
  a permanent architecture tier.
- The family release gate still reports the same pre-existing PT-91M track
  clipping and T-90SM continuity defects as the clean pre-migration baseline.
  This migration neither introduces nor conceals those fleet-quality failures.

## Verification

- `npm run typecheck`
- `npm run tank:anatomy:update`
- `npm run tank:anatomy:check`
- `npm run tank:release:check -- --ids=t90a,t90,t90ms,t90a_burlak,pt91m,t90sm,t90a_vladimir,t90m,t90m_proryv --gate`
- Clean-baseline `tank-standard-check.mjs` comparison for the same nine IDs
- `npm run build`
- `npm test`
