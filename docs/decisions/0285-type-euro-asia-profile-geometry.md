# 0285 — Euro-Asian profile geometry has a strict TypeScript owner

## Decision

Keep Ariete, Leclerc, Leclerc XLR, AMX 56, T-80U, Type 90, Type 74, AMX-30,
AMX-30B2, and the shared reconnaissance profile in
`src/vehicles/profiles/misc.ts`. Model its procedural builder boundary with
explicit geometry, material, running-gear, ERA, decal, and post-assembly
capabilities.

## Why

This demand-loaded family contains several independent authored vehicles and
is also reused by typed Italian and Japanese variants. Its JavaScript boundary
hid non-uniform transforms, terrain-following wheel layers, ERA placement
callbacks, cast-turret seats, and Type 90's post-assembly articulation hook
behind implicit values.

## Consequences

- Existing coordinates, topology, materials, transforms, profile order, and
  demand-loaded chunk ownership remain unchanged.
- Shared fitting helpers, gun-frame additions, running-gear layers, ERA seats,
  and cast-plan rows have explicit contracts.
- The Type 90A caller declares the complete donor capability it supplies;
  duplicate vehicle picks and runtime builder behavior are unchanged.
- New profiles and direct builders in this family must satisfy the typed
  registry rather than relying on implicit JavaScript coercion.

## Verification

- `npm run typecheck`
- `node tools/local-import-integrity.selftest.mjs`
- `node src/vehicles/fleetLazy.selftest.mjs`
- `npm run tank:anatomy:check`
- `npm run build`
- `node tools/public-repo-hygiene.selftest.mjs`
