# View-first loading R1

Measured on 2026-08-20 against `origin/main@7c8e781b`. Production builds used
the same machine, Chromium profile, mobile viewport, and constrained-network
probe configuration for before/after comparisons.

## Results

| Area | Before | After | Change |
| --- | ---: | ---: | ---: |
| Initial `main` transfer | 655,495 B | 614,478 B | -41,017 B (-6.26%) |
| Initial module graph (gzip) | 1,600,694 B | 1,573,106 B | -27,588 B (-1.72%) |
| Constrained cold garage ready | 13,577 ms | 13,301 ms | -276 ms (-2.03%) |
| Failed-main recovery | 3,003 ms | 2,850 ms | -153 ms (-5.09%) |
| Terrain construction median | 419.4 ms | 344.5 ms | -74.9 ms (-17.86%) |
| Initial terrain geometries | 192 | 64 | -128 (-66.67%) |
| Particle atlas main-thread generation | 211.9 ms | 7.9 ms load/decode | -204.0 ms (-96.27%) |

The terrain benchmark traverses from the player spawn to the enemy base so it
also exercises deferred LOD creation. A final post-rebase sample measured
569.2 ms eager versus 462.6 ms streamed (-18.73%); the isolated samples saved
17.86-18.73%. Each traversal admitted 234 deferred jobs, with a 5.4 ms worst
individual job across the recorded runs.

An exact selected map now prefetches only after eight quiet seconds and promotes
the same in-progress build if battle starts. In a diagnostic mobile Verdant run,
the world stage fell from 1,874 ms to 407 ms (-78.3%) and click-to-control fell
from 7,585 ms to 5,668 ms (-25.3%). This transition comparison is useful but is
not certification evidence because the shared host was contended. The isolated
terrain and bundle measurements above are the stable acceptance evidence.

## Implementation boundaries

- Studio is a route-level dynamic import and does not enter the initial garage
  graph.
- Exact-map prefetch respects the existing world-cache capacity, cancels stale
  selections, pauses during garage interaction, and never builds Random.
- Async worlds create only the initially visible terrain LOD. Remaining LODs
  stream at one job per four rendered world updates with one-level lookahead.
- The synchronous screenshot path remains eager and deterministic.
- Six deterministic first-party particle atlases load after garage ready. The
  seeded procedural generator remains a fallback.
- Simulation, collision heightfields, vegetation, props, armor, and damage rules
  are unchanged.

## Reproduction

```sh
npm run build
npm run perf:terrain-stream
npm run perf:cold
npm run perf:transitions
npm run fx:textures:bake
```

The FX bake is reproducible: its self-test verifies the exact dimensions and
SHA-256 digest of all six generated atlases.
