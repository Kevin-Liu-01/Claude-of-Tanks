# 0273 — The second modern fleet pack is strict TypeScript

## Decision

Keep the Leopard 2A4, T-80U, Leclerc, Type 99A, Leopard 1A5, MBT-70, and T-14
combat rows and procedural builders in `src/vehicles/modern2.ts`. The module
uses explicit contracts for combat armor inputs, the factory builder surface,
ERA placement callbacks, geometry transforms, and variable-height turret
lofts.

Mutable armor elevation remains a deliberate local operation. Plate vertices
are rebuilt as exact four-point tuples, while module and crew bounds retain
their established mutable runtime arrays without weakening the shared public
armor schema.

## Why

This on-demand pack combines authoritative combat metadata with some of the
largest modern vehicle builders. Strict typing catches malformed spec rows,
incomplete builder adapters, widened construction arrays, and invalid bucket
ownership without changing fleet loading or authored geometry.

## Consequences

- Browser demand loading and fleet audit tooling import `modern2.ts`.
- Runtime registrations stay idempotent and all playables remain procedural.
- The pack remains demand-owned; it does not add code to the initial Garage
  boot path.
- Visual geometry, combat values, and assembly behavior are unchanged.
