# 0297 — The Leopard profile family has a strict TypeScript owner

## Decision

Move `src/vehicles/profiles/leopard.js` to
`src/vehicles/profiles/leopard.ts` and model the family-specific hull, turret,
running-gear, ERA, cage, camouflage, fitting, and receipt data passed through
its procedural helpers. Keep the lazy family registry and authored runtime
geometry unchanged.

## Why

The Leopard owner serves German, Swedish, and experimental variants through a
large collection of compound surfaces and equipment packages. Implicit tuple,
side, material, and attachment shapes made it possible for a malformed derived
profile to fail far inside a vehicle build. A narrow checked boundary now
rejects incomplete builders before any geometry is allocated, while named
contracts document how fittings and protection layers attach to their owner.

## Consequences

- All Leopard helpers are checked without `any`, TypeScript suppression, or
  double assertions.
- German and Swedish derivative builders retain their smaller public ports;
  the two shared Leopard entry points validate the complete capability port at
  runtime before construction.
- The `gearFloor` option is correctly represented as a boolean opt-in rather
  than a numeric dimension.
- Runtime build order, geometry, transforms, materials, visual receipts,
  gameplay behavior, and demand-loading boundaries are unchanged.
- Merkava is the final runtime JavaScript vehicle-profile owner. Removing
  `allowJs` remains contingent on migrating that owner and auditing the small
  non-profile JavaScript remainder.

## Verification

- `npm run typecheck`
- `node src/vehicles/tankFactoryCore.selftest.mjs`
- all focused `src/vehicles/profiles/leopard*.selftest.mjs` checks
- `npm run tank:anatomy:update` (zero generated deltas)
- `npm run tank:anatomy:check`
- targeted Leopard-family release checks
- `npm test`
- `npm run build`
