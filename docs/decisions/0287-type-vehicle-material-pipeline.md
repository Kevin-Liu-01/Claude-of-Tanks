# 0287 — The vehicle material pipeline has a strict TypeScript owner

## Decision

Keep camouflage painting, shared texture residency, vehicle shader hooks,
destroyed-vehicle atlases, decals, and semantic material construction in
`src/vehicles/materials.ts`. Express the painter inputs, shared-cache states,
paintable fitting roles, memoized bake records, renderer hooks, and material
lifetime as explicit strict TypeScript contracts.

## Why

This owner is shared by Garage, battle, Studio, Gallery, fleet builders, and
authoring tools. Its former JavaScript boundary allowed custom raster records
to look like browser `Path2D` objects, cache entries to look ready before their
textures existed, and asynchronous camouflage options to infer as null-only.
Those ambiguities made changes to loading, camouflage, and shadow composition
hard to review without executing every consumer.

## Consequences

- Painter constants, RNG order, canvas dimensions, shader source, material
  parameters, and public behavior remain unchanged.
- Cache entries fail explicitly if a consumer observes an incomplete texture
  or feature plan instead of propagating an undefined WebGL resource.
- Wheels, recessed wheels, fittings, and camouflage-aware canvas use a closed
  repaint-role vocabulary.
- Runtime and authoring consumers import the TypeScript owner directly; source
  GLBs remain outside the playable material path.
- Future material features must extend the local contracts without broad
  `any`, compiler suppression, or untyped cache records.

## Verification

- `npm run typecheck`
- `node src/vehicles/materialQuality.selftest.mjs`
- `node src/vehicles/factoryCamo.selftest.mjs`
- `node src/vehicles/profiles/t72CamoCoverage.selftest.mjs`
- `node src/vehicles/appearanceAudit.selftest.mjs`
- `node tools/run-selftests.mjs pre`
- `npm run build`
- `npm test`
