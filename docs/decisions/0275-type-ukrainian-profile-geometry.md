# 0275 — Ukrainian profile geometry has a strict TypeScript owner

## Decision

Keep the Ukrainian T-64BV, T-80BV, T-80U Kursk, Oplot-M, and field-caged M1A1
procedural builds in `src/vehicles/profiles/ukraine.ts`. Express the family
through a narrow builder port plus explicit contracts for ERA cassettes,
cast-dome rings, welded face quads, fittings, receipts, and cage stations.

## Why

These builders derive armor placement from real carrier surfaces and share a
demand-loaded registration boundary. Leaving their builder, material, tuple,
and receipt shapes implicit made visual regressions easy to introduce and made
the fleet loader harder to decompose safely. Strict types expose those geometry
and ownership contracts without widening the boot bundle.

## Consequences

- Existing geometry coordinates, materials, seeds, transforms, and build order
  remain unchanged.
- ERA modules continue to seat from cast-dome or welded-face normals rather
  than approximate Euler offsets.
- The Ukrainian M1A1 donor-id swap remains bounded and restores the canonical
  spec identity before cage construction.
- Browser consumers retain the exact demand-loaded family boundary; audit
  tooling can still acquire the same profile record through the typed adapter.
