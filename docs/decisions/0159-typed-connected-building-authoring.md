# 0159 — Typed connected-building authoring

Status: accepted

## Decision

The shared exterior-detail pass and the urban, rail, and village landmark
builder registries are strict TypeScript. Geometry buckets, structure
builders, support records, building envelopes, inferred catalog profiles, and
connectivity receipts use explicit contracts before their meshes are merged
into the runtime world.

## Why

Procedural building detail is authored as many temporary geometries and then
collapsed for performance. A missing bucket or detached support could
previously become an invisible `undefined` access or a floating mesh only
after a full map build. The authoring boundary should reject those mistakes
while the parts still have semantic names and support relationships.

## Consequences

- Church, factory, rail, village, catalog, façade, service, roof, and attachment
  geometry is unchanged.
- Connectivity remains measured before merge, with the same 0.065 m support
  tolerance and zero additional runtime scene nodes.
- Building registries now share one typed builder and geometry-bucket shape.
- Missing authoring buckets fail with a targeted error during construction.
