# 0161 — Typed structure catalog

Status: accepted

## Decision

The shared battlefield-structure catalog is strict TypeScript. Heavy landmark
builders use the common geometry-bucket and footprint contracts. Lightweight
destructible buildings have explicit intact-geometry, collision, material,
instance-tint, and persistent-debris builder contracts.

## Why

The catalog combines authored facade parts, merged landmark geometry,
instanced lightweight buildings, collision metadata, and broken-state meshes.
Implicit arrays and string-indexed buckets obscured failures until a specific
map, variant, or destruction event happened. The typed boundary proves those
relationships before the geometry reaches the runtime world.

## Consequences

- All 15 heavyweight and 20 destructible structure families retain their
  exact geometry, palettes, seeded variation, and draw-call behavior.
- Connectivity is still certified before lightweight parts are merged.
- Broken-state builders are required for every destructible family.
- An empty geometry merge now fails at authoring time with a targeted error.
