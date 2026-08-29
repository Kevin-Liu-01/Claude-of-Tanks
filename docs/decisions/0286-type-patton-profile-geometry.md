# 0286 — Patton profile geometry has a strict TypeScript owner

## Decision

Keep the Pershing, Patton, M48, M60, and M60A2 procedural family in
`src/vehicles/profiles/patton.ts`. Model its builder boundary with explicit
loft, hull, running-gear, turret, gun, roof-fitting, ERA-placement, and
material-lifetime contracts.

## Why

This demand-loaded family is one of the fleet's largest authored geometry
owners. Its JavaScript boundary hid asymmetric casting sections, terrain-ready
running gear, M48 fitting inventories, M60 ERA surface frames, and mutable
low-profile transforms behind implicit values. Invalid section and fitting
configurations could therefore fail later as corrupt geometry instead of at
their owner boundary.

## Consequences

- Existing coordinates, topology, materials, transforms, profile order, and
  demand-loaded chunk ownership remain unchanged.
- M48 and M60 variants declare their complete inputs without widening the
  shared procedural-builder contract.
- Empty lofts, missing bustle racks, and invalid profile indices fail at the
  family boundary instead of emitting incomplete meshes.
- New Pershing/Patton variants must satisfy the typed registry and family-local
  contracts.

## Verification

- `npm run typecheck`
- `node tools/local-import-integrity.selftest.mjs`
- `node src/vehicles/fleetLazy.selftest.mjs`
- `node src/vehicles/profiles/pattonLowTurrets.selftest.mjs`
- `node src/vehicles/profiles/m60FamilyAttachments.selftest.mjs`
- `npm run tank:anatomy:check`
- `npm run build`
- `node tools/public-repo-hygiene.selftest.mjs`
