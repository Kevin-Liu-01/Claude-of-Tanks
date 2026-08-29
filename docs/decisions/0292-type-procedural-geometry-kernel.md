# 0292 — Procedural geometry primitives have a strict TypeScript kernel

## Decision

Move the deterministic, vehicle-agnostic geometry operations out of
`src/vehicles/tankFactoryCore.js` and into
`src/vehicles/factoryGeometry.ts`. Keep profile selection, rig composition,
running gear, presentation state, damage visuals, and material policy in the
factory owner until their contracts can be migrated independently.

## Why

Renaming the complete factory exposed more than one thousand genuine type
failures across implicit builder, fitting, material, animation, and runtime
state contracts. Suppressing those failures or disguising them behind broad
casts would make the extension cosmetic. The geometry kernel is a real
dependency seam: it only accepts numbers and Three.js geometries, has no fleet
registration state, and is shared by every procedural vehicle family.

## Consequences

- Primitive boxes, cylinders, spheres, lathes, slabs, frustums, turret lofts,
  transforms, box UVs, and geometry merging now compile under strict
  TypeScript without compiler suppression.
- `tankFactoryCore.js` is 228 lines smaller and no longer owns this reusable
  mathematical implementation.
- Triangle order, winding, vertex coordinates, UV generation, seeded random
  behavior, and merge disposal behavior remain compatible with the original
  implementation.
- The extraction does not add an eager fleet import or change the browser's
  demand-loading boundary.
- Remaining factory migration must type actual builder and runtime contracts;
  a file-extension-only conversion is not acceptable.

## Verification

- `npm run typecheck`
- `node src/vehicles/tankFactoryCore.selftest.mjs`
- `npm run tank:anatomy:check`
- `npm run build`
- `npm test`
