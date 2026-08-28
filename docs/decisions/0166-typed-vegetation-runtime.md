# 0166 — Typed vegetation runtime

Status: accepted

## Decision

The battlefield vegetation runtime is strict TypeScript. Procedural foliage
textures, tree geometry families, grass streaming jobs, species palettes,
near/far instance partitions, visibility fades, collision records, and topple
state all use explicit contracts.

## Why

Vegetation spans cold battlefield construction and several live rendering hot
paths. Its former implicit shapes connected map configuration, Canvas2D texture
generation, shader injection, terrain sampling, GPU instance uploads, spotting,
crushable collision, and distance LOD. A malformed record could therefore
surface as a load stall, a missing stand, a full-buffer upload, or a tree that
failed to topple far from the original mistake.

## Consequences

- Seed order, placement predicates, geometry, materials, shaders, LOD radii,
  grass density, and authored map palettes are unchanged.
- Grass jobs and cache cells expose their bounded staging and upload state.
- Every tree instance has explicit near/far slots and LOD-transition state;
  partial species registries cannot silently publish an invalid mesh family.
- Tree obstacles retain their collision, spotting, and persistent topple
  contracts without making rendering authoritative.
- Canvas acquisition fails with a targeted diagnostic if a browser cannot
  provide the required 2D context.
