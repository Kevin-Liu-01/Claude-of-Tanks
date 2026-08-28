# 0186 — The post-processing pipeline is strict TypeScript

Status: accepted

## Decision

The scene resolve, temporal reconstruction, GTAO, aerial perspective, bloom,
output grading, late transparent effects, and final anti-aliasing chain are
owned by `src/engine/post.ts` behind the exported `PostRuntime` contract.

Render-target and depth-texture ownership is explicit. Runtime-only extensions
to Three.js addon passes are represented by narrow compatibility interfaces,
and battle-only soft-particle state is validated when it attaches to the
already-live Garage post stack.

## Why

This is a boot-critical and allocation-sensitive renderer boundary. The former
JavaScript implementation mixed nullable depth resources, addon-private fields,
shader uniforms, reconstruction telemetry, and adaptive-quality state without
compiler-visible contracts. That made a malformed lazy FX attachment or a
Three.js addon change capable of failing late in a transition or render frame.

## Consequences

- Shader sources, pass order, visual constants, quality presets, render-scale
  policy, and update cadence remain unchanged.
- Scene and late-FX depth textures have named owners before their render targets
  are constructed, eliminating implicit nullable reads.
- Malformed battle FX state is rejected at its one attachment boundary rather
  than leaking unchecked values into the render loop.
- FSR, GTAO, SMAA, and output-grade addon extensions remain local and cannot
  weaken the rest of the engine with broad casts or compiler suppressions.
- The composition root consumes `createPost()` directly without a duplicate
  legacy runtime interface.
- Strict typecheck, render-policy, lazy-FX, resource-lifetime, production build,
  repository-integrity, and cold-browser gates certify the migration.
