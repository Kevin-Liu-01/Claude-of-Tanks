# 0129 — Utility conductors use typed deterministic topology

## Status

Accepted — 2026-08-28

## Context

Utility wires share stable instanced slots while fallen poles deform only their
adjacent spans. The topology and catenary sampler run without Three.js, but the
JavaScript boundary left pole, hinge, adjacency, and output-buffer contracts
implicit.

## Decision

`src/world/utilityNetwork.ts` owns normalized poles, validated span topology,
stable conductor indices, live hinge state, and catenary sampling into a
caller-owned `Float64Array`. Construction may allocate topology; live span
updates mutate retained state and caller storage only.

## Consequences

- Invalid pole indices remain rejected during network construction.
- Falling poles update only their stable adjacent-span list.
- Rematch reset restores the original deterministic catenary.
- The renderer retains one instanced mesh and performs no per-frame wire-array
  allocation.
