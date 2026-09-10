# Demand-owned terrain source composition

## What the profile establishes

The retained native profile of `texture-preparation-local-profile-r2` contains
three rooted `prepareSourcedTerrain.tryCreateLayer → composeSet → composeAlbedo`
runs. Their sampled weights are 65.735, 53.900 and 52.348 ms (119 samples).
Native `getImageData` totals 141.271 ms of sampled weight across 95 samples.
These are sampling observations, not exact function timings. They establish
that the prepared-terrain cold-cache path bypassed the asynchronous compositor;
they do not identify the leaf of the separate 142.6 ms production continuation,
or retrospectively prove the cause of the historical 214–319 ms gameplay stalls.

The old path started image IO early, then synchronously composed already-loaded
images at material construction. The earlier bitmap scheduling change affected
worker callers, so this separate synchronous consumer could still block loading.

## Bounded correction

Async terrain construction requests each source layer at its existing material
checkpoint, through the existing worker compositor. Image prefetch by itself
remains IO-only. The constructor consumes completed CPU canvases; it cannot
start another inline cold-cache composition when images arrive late. Synchronous
authoring is unchanged. No terrain geometry, painter constants, resolution,
source bytes, shading, simulation or cache limits are changed.

Missing or pending images retain procedural painting and the existing explicit
late-source readiness result. Cached compositions remain reusable. Unsupported
or failed workers retain the exact synchronous fallback, which can still block.
This is not a universal off-main-thread guarantee.

Each preparation has a final cancellation owner. Generation/pacing checks bracket
the awaited checkpoint before layer textures can be allocated. Abandoned builds
close their private iterator and cancel their preparation while preserving the
original error, including falsy thrown values. Final world disposal cancels source
publication before existing teardown. Temporary GPU texture disposal does not
cancel a live source consumer. Cancellation during an awaited worker operation
is observed by the post-await guard; it does not immediately interrupt that wait.

## Qualification

Focused preparation, adoption, worker-client/worker, map-policy and terrain
contracts passed, including 824 full-byte comparisons across 103 source-policy
variants. The additional `--native` preparation check uses `@napi-rs/canvas` for
raster parity; it is not a browser-worker pixel matrix. Final generator-checkpoint
coverage passed preparation, splat-field and road-lookup tests. Typecheck,
unused-code check, no-new-or-increased source-metric check and public build passed.
React Doctor scored 92: its three warnings are deliberate serial test assertions,
not production loops. Independent review found no concrete lifecycle blocker.

Native real-button controls passed on Chrome 151.0.7922.47 / ANGLE Metal Apple M5
Max, high quality, 1280×720, DPR 1, dynamic scale 1 and no trimming. This fixture
uses the no-splash Garage gesture/audio path, not the separate boot-audio gate;
it must not be compared as a matched speed experiment against that fixture.
Garage gesture/audio, audio-clock ownership, warm-readiness and source-readiness
gates all passed, as did the functional actions. Errors and cleanup errors were
empty. Both first day-battle and night-rematch reveal receipts were settled with
six of six requested terrain/building sources applied, no pending sources and no
failures. All five before/after, battle, rematch and Garage screenshots were
inspected. The probe and its owned preview server closed.

| Action | Cover observed | Click to probe-ready | Largest callback-start gap |
| --- | ---: | ---: | ---: |
| Battle | 2.8 ms | 7,227.1 ms | 191.7 ms |
| Rematch | 144.6 ms | 5,812.1 ms | 74.0 ms |
| Garage | 105.3 ms | 383.1 ms | 60.6 ms |

The first gap overlaps a 179.8 ms native AudioContext construction; these timings
are not a measured terrain speedup. Source-readiness confirms settled rendering,
not native worker routing or GPU duration. Queue admission time is excluded from
the action measurements. No CPU-profiler or extra Canvas diagnostic was run for
this candidate.

Receipt: `/private/tmp/cot-interactive-baseline.gsRCvU/terrain-source-worker-local-r1/report.json`,
SHA-256 `cb882eaecc4deae0be6a33260bbf4d0ea5484d1c0df037263e97a2d7e96f0817`.
Built HTML SHA-256 `f0e4b4a3d20059683284c62c39413f356e91594bf082c9182766c6aa7c1ff579`.
Focused/build logs: `terrain-source-worker-qualification-r1.log` and
`terrain-source-worker-qualification-r2.log` in the same artifact root. The final
combined countdown/terrain/track runtime also passed typecheck, public build and
Doctor; log `loading-closure-combined-build-r1.log`.

This change does not close the separate frame-budget and resource-inventory
failures documented in `source-texture-decode-20260910.md`.
