# 0164 — Typed horizon renderer

Status: accepted

## Decision

The map-authored horizon generator is strict TypeScript. Horizon styles,
profile rows, texture-composition options, treeline layers, map atmosphere,
and the skyline mesh builder now have explicit contracts.

## Why

The horizon path combines deterministic geometry, CPU-baked Canvas2D
textures, custom shader uniforms, and map-specific atmosphere during first
battle construction. Invalid style or row data could otherwise surface as a
missing skyline, a stalled fresh-session load, or a shader defect only on one
battlefield.

## Consequences

- Ridge profiles, geometry density, texture sizes, material constants, shader
  source, and treeline presentation are unchanged.
- Canvas2D absence now fails with a targeted horizon-texture diagnostic.
- Node-runnable skyline and treeline samplers remain the visual-regression
  boundary for all twenty battlefield configurations.
- The renderer remains demand-loaded with the battlefield runtime.
