# 0165 — Typed terrain runtime

Status: accepted

## Decision

The battlefield terrain runtime is strict TypeScript. Map composition,
deterministic heightfields, fast-height tile warming, terrain material inputs,
procedural texture layers, LOD geometry, index-buffer ownership, and streaming
jobs have explicit contracts.

## Why

Terrain is both a first-battle loading bottleneck and a high-frequency
simulation dependency. Its former implicit object shapes crossed map configs,
headless authority, vehicle movement, vegetation placement, shader hooks,
resource disposal, and asynchronous LOD streaming. A malformed field could
therefore appear as a cold-load stall, a collision mismatch, or a leaked GPU
buffer far from its source.

## Consequences

- Height, normal, splat, texture, mesh, and shader calculations are unchanged.
- All twenty maps share typed spawn, road, wet-ground, landform, and material
  boundaries while retaining their authored configuration values.
- Streaming jobs cannot publish a missing geometry, and every dormant LOD
  buffer remains registered for deterministic disposal.
- The existing 16 m fast-height cache, shared Uint16 index pool, and
  opening-region LOD policy remain intact and benchmarked.
