# Cold horizon construction evidence

This checkpoint adds a verification tool and its focused selftest only. It
does **not** publish the experimental forest-shell geometry, change any map,
remove existing nighttime lights, or approve the overall environment pass.

## Reproduce

```sh
node tools/horizon-construction-bench.mjs \
  --baseline-root=/absolute/clean/baseline \
  --candidate-root=/absolute/clean/candidate \
  --maps=verdant,coastal,frontier --seeds=1337,2049,7719 --pairs=3 \
  --out=/absolute/new-evidence.json
```

The tool owns one shared capture FIFO lease: do not wrap it in another lease.
Each adjacent baseline/candidate pair uses fresh Node processes with the same
map and seed; pair order alternates. It imports modules before measuring one
real `buildHorizonRing` call with native Canvas2D, then records canonical resource
disposal and signed forced-GC process-memory deltas. No warmup is discarded.
Both source roots must remain clean and unchanged. Failures and raw worker
outputs survive; output paths are exclusive-create.

Inventory hashes include actual typed geometry views, native texture pixels,
shader-retained resources and loaded native rasterizer binaries. Canvas's
`data()` method is not confused with a DataTexture's typed `data` field.
The focused test uses small fixtures and fake workers, not performance samples.

`pass` means a complete, source-stable, deterministic acquisition, **not** that
the candidate is faster. Construction excludes module-import time and says
nothing about GPU submission or live FPS. Post-disposal memory includes retained
runtime caches, native allocator residue and diagnostic bookkeeping; it is not
independently a leak, plateau, browser-residency or physical-device certificate.

## First real comparison and rejected artwork

On 2026-09-08, 54 fresh-process trials completed with exact source and inventory
checks: baseline `ee8e9734e56bee98ae89ea1504e34bcdc9389afb`, candidate
`e3793faadecf09b52a0a2fbfb9fc63a89f7a4cbd`. Both are preserved isolated worktrees.
Across the nine map/seed cases, median construction rose from approximately
144–157 ms to 164–183 ms. The candidate remains unaccepted. Its larger signed
post-disposal heap deltas are retained in full, not reclassified as a pass.

Local evidence root:
`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/`

- `horizon-grove-packed-construction-r1.json`: initial real acquisition failure
  exposed the native Canvas `data()` distinction; preserved unchanged.
- `horizon-grove-packed-construction-r2.json`: complete 54-trial acquisition.
- `forest-shell-pilot-after-r1/report.json` and `shots/`: 27 actual 1440×900
  Chromium/Apple Metal views, no page errors. Candidate build index SHA-256
  `24fa67c648358f94b53411a469e1c04f2d520aa9a12474fad527161064ae7030`.
- All 12 scope contracts match R6 exactly. Camera transforms/FOV match in all
  27 views; two Frontier arcade pose packets retain a different stored rigZoom
  (8 rather than 2), despite matching projection. Do not call the complete pose
  metadata byte-identical or use this as an identical-harness timing baseline.

Native visual review rejects the pilot: Coastal ES introduces a long dark
planar wedge instead of recognizable conifer crowns; Verdant and Frontier
still read as sparse single-file cutouts. Numerical contact and atlas checks
do not override that result. The full experimental branch must not be pushed
wholesale. Earlier accepted map/nighttime work remains on main.

The next visual experiment must first demonstrate an exposed, short, broken
crown outline in one representative scope and wide view before another broad
capture. No new weather, particles, model changes or performance waivers are
part of this checkpoint. The Three.js review workflow kept separate source,
geometry, native artwork, construction-cost and live-performance gates.
