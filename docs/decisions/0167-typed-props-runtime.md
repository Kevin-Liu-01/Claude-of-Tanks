# 0167 — Typed props runtime

Status: accepted

## Decision

The battlefield props runtime is strict TypeScript. Map dressing, procedural
surface generation, structure buckets, destructible pools, collision records,
loose-body physics, wreck baking, decals, and utility-network animation now use
explicit contracts.

## Why

`props` joins authored map plans to scene construction and live destruction.
Its former implicit object shapes crossed seeded generation, merged geometry,
GPU instances, collision broad phases, effects, and fixed-step loose-prop
physics. Shape mistakes could therefore appear much later as a loading stall,
missing cover, stale collider, or invalid animation state.

## Consequences

- Seeded random draw order, geometry build order, shader source, scene output,
  physics constants, and destruction behavior are unchanged.
- Complete runtime geometry buckets cannot omit a material class required by a
  map kit, while extension builders may continue to publish partial buckets.
- Destructible and loose-prop records expose their lifecycle explicitly, from
  intact pool slot through collision removal, animation, and reset.
- Canvas and generated-texture setup fails with a targeted diagnostic when a
  browser cannot provide the required 2D context.
- Texture authoring, building assembly, destructible orchestration, and decals
  remain good future extraction boundaries. This migration first secures their
  shared contracts so those splits can preserve behavior mechanically.

## Verification

The boundary is covered by strict type checking, focused structure, placement,
collision, wreck, topple, loose-physics, map-quality, and sourced-texture tests,
plus the production build and resource/loading gates.
