# 0162 — Typed inhabiting-prop registry

Status: accepted

## Decision

The inhabiting-object registry is strict TypeScript. Every entry declares its
render material, contact class, collision footprint, intact builder, optional
broken-state builder, and the physics, toppling, wall, fence, or explosive
metadata required by its behavior.

## Why

The registry is a shared seam between procedural geometry, instanced
rendering, shell collision, tank overrun, loose-body physics, destruction, and
reset. An incomplete entry could previously survive boot and fail only when a
particular object was hit or pushed. Typed discriminants and builders make the
entire behavior surface reviewable at the source table.

## Consequences

- Intact and broken geometry, palettes, seeded variation, and material routing
  are unchanged.
- Break, topple, and physics classes retain their existing runtime behavior.
- Optional collision and dynamics knobs remain explicit rather than becoming
  defaults hidden in a renderer.
- An empty geometry merge fails at authoring time with a targeted error.
