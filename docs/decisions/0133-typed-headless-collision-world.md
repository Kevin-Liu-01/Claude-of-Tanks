# 0133: Typed headless collision world

## Status

Accepted — 2026-08-28

## Decision

`src/world/headlessCollisionWorld.ts` owns the strict boundary between packed
authored battlefield manifests and the dedicated server's movement, shell, and
concealment queries. It describes packed and inflated collision shapes, terrain
queries, ray hits, destruction state, and the returned headless-world facade.

The implementation remains renderer- and DOM-free. Query scratch arrays and
ray-march vectors stay match-local and reusable; only durable ray-hit results
allocate vectors that callers may retain.

## Consequences

- Dedicated collision data cannot silently drift between packed shape kinds.
- Multiplayer world authority retains the same exact visual-map geometry.
- Future server TypeScript migration has a typed world contract to consume.
