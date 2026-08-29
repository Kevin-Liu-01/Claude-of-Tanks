# 0222 — The German OTCO profile adapter is strict TypeScript

Status: accepted

## Decision

Keep the Leopard 2A4 OTCO procedural profile adapter in
`src/vehicles/profiles/germany.ts` with explicit assembly, transform, owner,
quad, and profile-record contracts.

The certified Leopard donor and shared geometry kit remain unchanged. The
profile remains in the same demand-loaded German family boundary.

## Why

The adapter composes armor plates, mirrored slabs, fittings, weapon furniture,
and decals across hull and turret coordinate spaces. Untyped owners, transform
tuples, or malformed quads could silently attach geometry to the wrong assembly
or create an invalid procedural profile.

## Consequences

- Hull/turret ownership and all three-axis transforms are compile-time checked.
- Mirrored slabs require exactly four lower and four upper vertices.
- Build order, geometry, transforms, seeds, materials, and lazy-loading behavior
  are unchanged.
- Typecheck, focused German asset/anatomy checks, import integrity, and the
  production build certify the migration.
