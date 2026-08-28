# 0130 — World contact policies are typed and allocation-light

## Status

Accepted — 2026-08-28

## Context

Trees, poles, and destructible props share hinge math, terrain-settled fall
angles, and root-sized contact decals. These policies affect destruction
motion and shadow stability but do not require renderer state.

## Decision

Move the policies to strict `topple.ts` and `treeGrounding.ts` boundaries.
Topple direction writes into caller-owned vector state. Terrain-rest samples
use a retained fraction table and direct height-field calls instead of creating
a sample array and closures for every fall. Root decal radius stays capped at
2.4 metres so it cannot become a canopy-sized overlapping shadow sheet.

## Consequences

- Props still fall toward impact and settle earlier uphill or farther downhill.
- Rematch/destruction presentation retains the same deterministic angles.
- Fall setup removes transient array and closure allocation.
- Dense groves retain bounded ground-contact fill under real CSM/GTAO shadows.
