# 0284 — Challenger profile geometry has a strict TypeScript owner

## Decision

Keep Challenger 1, Challenger 2, Challenger 2E, Ukrainian Challenger 2,
Challenger 3, and Challenger 3X geometry in
`src/vehicles/profiles/challenger.ts`. Extend the British builder contract only
with Challenger-specific running-gear metadata, ERA placement, equipment, and
post-assembly capabilities.

## Why

The family module owns several large, independently authored hull and turret
lofts plus variant protection packages. Its JavaScript boundary obscured the
shape of geometry stations, ERA callbacks, roof-seat receipts, contact
metadata, and the cross-family dependency on the British construction kit.

## Consequences

- Existing coordinates, topology, materials, transforms, profile order, and
  demand-loaded chunk ownership remain unchanged.
- Challenger loft sections, surface frames, roof seats, ERA placements, and
  family-scale receipts have explicit contracts.
- The family reuses the exported British builder contract rather than
  duplicating its implicit geometry surface.
- New Challenger profiles and direct builders must satisfy typed registries.

## Verification

- `npm run typecheck`
- `node tools/local-import-integrity.selftest.mjs`
- `node src/vehicles/fleetLazy.selftest.mjs`
- `npm run tank:anatomy:check`
- `npm run build`
