# 0113 — Terrain simplex noise is typed and reference identical

## Context

Terrain, horizon, and world props call the optimized simplex implementation
thousands of times during world construction and height queries. It depends on
an injected deterministic random source, three typed permutation tables, and
the exact floating-point operation order of Three.js. An accidental shape or
arithmetic change would alter authored worlds or reintroduce boot cost.

## Decision

`simplexFast.ts` is the strict TypeScript owner for deterministic 2D, 3D, and
4D simplex noise. Its random-source and typed-array contracts are explicit;
the algorithm, table construction, and arithmetic order remain unchanged.

## Consequences

- World generation retains the existing allocation-free optimized path.
- Terrain, horizon, and prop consumers share one checked noise API.
- 1,152 seeded samples are certified bit-for-bit against Three.js across all
  supported dimensions.
- No terrain shape, seed behavior, visual, or runtime operation changes.

## Verification

- `npm run typecheck`
- `node src/engine/simplexFast.selftest.mjs`
- `node src/world/mapQuality.selftest.mjs`
- `npm run build`
