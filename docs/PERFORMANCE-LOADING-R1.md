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

In the original R1 policy, an exact selected map prefetched after four quiet
seconds and promoted
the same in-progress build if battle starts. In a diagnostic mobile Verdant run,
the world stage fell from 1,874 ms to 407 ms (-78.3%) and click-to-control fell
from 7,585 ms to 5,668 ms (-25.3%). This transition comparison is useful but is
not certification evidence because the shared host was contended. The isolated
terrain and bundle measurements above are the stable acceptance evidence.

The 2026-08-27 static-phase audit superseded passive map prefetch: it consumed
heap and CPU on a screen that did not establish Battle intent. The same world
promise still starts on Battle hover/focus/touch or joined-room intent and is
still reused by covered entry.

## Implementation boundaries

- Studio is a route-level dynamic import and does not enter the initial garage
  graph.
- Explicit exact-map prefetch respects the world-cache capacity, cancels stale
  selections, and never starts from passive Garage dwell.
- Async worlds create only the initially visible terrain LOD. Remaining LODs
  stream at one job per four rendered world updates with one-level lookahead.
- The synchronous screenshot path remains eager and deterministic.
- Six deterministic first-party particle atlases load after garage ready. The
  seeded procedural generator remains a fallback.
- Simulation, collision heightfields, vegetation, props, armor, and damage rules
  are unchanged.

### Packed environment geometry

The 2026-08-27 follow-up removes `props-models.json` from the normal map module
graph. `propsModelStore.ts` transfers a 190.7 KB deterministic gzip archive in
parallel with terrain and vegetation, validates its bounds, and presents
zero-copy typed-array views. The executable map chunk is now about 268 KB
instead of 1.51 MB. The JSON remains the attributed authoring source and is
available only through a demand-loaded compatibility fallback.

Run `npm run world:props:pack` after an intentional JSON edit. The focused
self-test compares every decoded float, index, bound, and model name against
the source before release.

### Static-phase and terrain-resource follow-up

The 2026-08-27 production lifecycle gate expanded acceptance beyond FPS. A
settled initial or returned Garage now paints at 0.2 Hz and submits no shadow
work; paired 1280×720 captures preserve the selected tank, lighting, shadows,
and interface. Initial Garage task residency fell from 0.014 to 0.004
core-equivalent and the complete safety frame fell from 496 to 290 calls.

Battle terrain now shares three world-local Uint16 index attributes across 116
live LOD geometries. The exact receipt records 153,216 unique bytes,
3,888,000 duplicate Uint16 bytes avoided, and 7,929,216 bytes removed versus
the former per-geometry Uint32 representation. The same gate measured 260.5 MB active
battle heap, versus 265.4 MB immediately before topology pooling, while all
visible triangle, material, LOD, collision, and quality contracts stayed fixed.

The phase-residency follow-up evicts the detached workshop's renewable GPU
allocations during battle while retaining its CPU graph and compiled material
programs. On the pinned 14-vehicle Verdant lifecycle, active renderer residency
fell from 723 to 556 geometries and from 321 to 292 textures. Initial Garage
remains 290 calls, 205,569 triangles, about 63 MB forced-GC heap, and roughly
0.004–0.005 of one CPU core while settled. Active battle measured about 260–264
MB heap, 222 programs, 556 geometries, and 292 textures; the returned Garage
restored behind its transition at 256 programs rather than the rejected
compile-isolation result of 295. Host task-duration readings varied under local
contention, so the release gate retains the independent frame-health trace and
resource ceilings instead of treating FPS as the only acceptance signal.

The same round removed an incorrect full-roster wreck-cohort draw from covered
entry. Exact patchable materials and shared maps warm directly; a real isolated
fallback draw occurs only when the roster contains non-patchable source
geometry. Multiplayer reconciliation now clears impact decals before a wreck
swap, preventing a normal-less decal from becoming an opaque burnt material and
creating physical/depth programs during live combat. A fresh rendered 14-player
host match consequently entered in 7.459 seconds, completed naturally with all
14 shooters active, and recorded zero live frame gaps above 40 ms or hard
prediction snaps.

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
