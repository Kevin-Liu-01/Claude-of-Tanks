# Cold splat-field row pacing

This bounded change splits the cold shared shader/vegetation noise bake in
`src/world/terrain.ts`. The prior bake computed both 256² Float32 fields in one
call: four torus-noise samples per pixel, or 262,144 `noise4d` evaluations.
The observed 55.9 ms `Scheduler.yield` continuation during terrain construction
motivates subdivision but does not identify this leaf as its cause. No browser
timing improvement or historical-stall attribution is claimed here.

## Preserved output and scheduling

One shared generator retains the original seed, formulas, arithmetic order,
row/pixel order and Float32 assignments. It yields after each completed row
(1,024 noise evaluations), including the last row before publication. This is
a work bound, not a hard millisecond deadline. The existing texture quantizer
and sampled-query functions are unchanged. Canvas operations, fallback painters,
mask creation, tone/normal loops and texture upload behavior are not modified.
The unchanged wet-layer selection expression moves to a small typed helper to
keep the touched material constructor within the strict function-complexity gate.

The cold material path delegates these checkpoints at its existing noise stage.
Fine construction receives 256 additional material-phase checkpoints with the
same progress values. Coarse construction and the synchronous wrapper drain
them without additional progress callbacks. Warm synchronous reads return the
existing cache before constructing any iterator; warm material construction
does not enter the new generator.

The two partial arrays remain private. A synchronous consumer or another bake
may publish while a generator is paused; the resumed generator adopts that exact
completed cache identity without another row or replacement. Cancellation cannot
publish a partial cache, even after the final row. A retry starts fresh private
arrays unless another consumer has already completed the shared cache.

## Cancellation scope

The async terrain wrapper now closes its generator on pacing failure. The manual
material loop forwards that close, and `yield*` reaches the private field bake.
Cleanup errors cannot mask the original pacing rejection; no later noise texture,
material or chunk is published from that canceled continuation.

This is **not** comprehensive failed-world cleanup. Horizon objects and layer/mask
textures created before cancellation retain their existing ownership limitations;
this patch does not add disposal, abort sourced-image promises or change external
asset lifetimes. Partial field arrays contain CPU data only and can be collected
after their closed iterator is released.

## Frozen oracle and focused checks

The new `terrainSplatFields.selftest.mjs` embeds the prechange synchronous field
function from `b1c6629a30132381a120cf4961aa10cfa5a46109`, SHA-256
`9ed5073c8629745ec7caa5bff05f6428eac3addd4a09930cc46c6f5fc3445873`.
It also freezes the unchanged field sampler, sampled-query and RGBA-quantizer
source hashes. The comparator is not reconstructed from the candidate generator.
The original wet-selector declaration is independently frozen and compared
across every branch, ice precedence, tone identity and zero/null/negative/NaN
roughness overrides, preserving exact painter arguments and returned identity.

Tests compare every Float32/RGBA byte and sampled outputs, including boundary
and nonfinite queries; they exercise row bounds, cache identity, interleaved
consumers, first/middle/final-row cancellation, throwing close, actual async
terrain/material delegation and exact coarse versus fine progress. Expensive
unrelated painters and chunk emitters are stubbed only in the scheduling fixture;
existing sourced-layer and 30-map terrain-streaming tests remain separate guards.
This isolated qualification uses only ordinary FIFO CPU checks, not a native
capture, build, full suite or performance certificate.

The first batch stopped before runtime assertions because the test harness sent
a top-level `return` through Node's TypeScript stripper. The retained failure is
`/private/tmp/cot-interactive-baseline.gsRCvU/splat-field-yield-cpu-r1.log`.
The fixture repair appends that return after stripping declarations; runtime,
frozen comparator and expected hashes are unchanged.
The second batch passed all six functional/type/registry entries, then stopped
on material-selector complexity (24/24), recorded in `splat-field-yield-cpu-r2.log`.
The wet-layer expression extraction addresses that gate without changing painter
behavior or weakening its threshold.

The final `splat-field-yield-cpu-r3.log` passes all seven ordinary FIFO entries:
new splat-field test (including the frozen wet selector), sourced preparation,
30-map terrain streaming, suite registry (956 checks), native TypeScript,
core unused-code check and changed-function metrics. All six changed/new runtime
functions pass the strict metrics with zero explicit `any`/`unknown`; the material
selector is now 19 cyclomatic / 18 cognitive and the terrain builder 19 / 20.
This is a changed-function gate, not a claim that the entire legacy terrain file
has no complexity violations. The earlier failed logs remain retained.
