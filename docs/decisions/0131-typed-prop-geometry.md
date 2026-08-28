# 0131 — Shared prop geometry has a typed ownership boundary

## Status

Accepted — 2026-08-28

## Context

Map kits share UV-scaled boxes, gable prisms, seeded UV jitter, and a compact
telephone-pole distance representation. These helpers mutate or create GPU
geometry, so loose ownership can cause stretched materials, duplicate buffers,
or missed disposal.

## Decision

`src/world/propGeometry.ts` is the strict shared geometry boundary. Mutating
helpers preserve and return the caller's concrete geometry type. Constructors
return explicit Three.js geometry types. The telephone-pole builder converts
only indexed inputs, merges one colored distance silhouette, and disposes each
temporary geometry exactly once.

## Consequences

- Map kits retain their exact dimensions, UV scales, and seeded jitter draws.
- Thin slabs keep face-specific world-dimension UVs.
- Distance poles retain the authored 340-triangle silhouette.
- The conversion does not add meshes, materials, draw calls, or frame work.
