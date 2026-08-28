# 0158 — Typed world compositor

Status: accepted

## Decision

The battlefield compositor and legacy prop-archive fallback are strict
TypeScript. `src/world/map.ts` now owns explicit contracts for the heightfield,
terrain stream, vegetation, props, collision queries, spawn points, minimap
features, destructible lifecycle, and retained world facade. Untyped terrain,
vegetation, and prop builders cross narrow structural adapters until those
large implementation modules migrate independently.

## Why

The world facade is consumed by simulation, rendering, Studio, multiplayer
collision, minimap generation, and lazy residency. Treating it as an arbitrary
object made partial battlefield construction or a missing destruction hook
indistinguishable from a valid world until a battle was already live. The
fallback JSON archive also needs the same typed geometry shape as the packed
production decoder.

## Consequences

- Synchronous and chunked world builds return the same `WorldRuntime` contract.
- The hot raycast retains its preallocated candidate and vector storage; no
  frame-path allocation or visual work was added.
- Exact terrain, vegetation, structures, spawn orientation, minimap data, and
  destruction behavior are unchanged.
- Browsers without `DecompressionStream` still demand-load the numeric JSON
  fallback, now checked against the packed archive model contract.
