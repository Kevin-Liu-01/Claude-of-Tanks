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

## Integrated release checkpoint

Integrated runtime `995ab2aa1b0cdf3128dba2a347201af6b18562eb` is based on
`857a2a3e0ca09331a9408949ce3428aa35a1eb11`. It includes the already qualified
foundation-instance pacing and opaque-cover paint/task boundary; unrelated
vehicle work stays outside this branch. Evidence lives under
`/private/tmp/cot-interactive-baseline.gsRCvU/`.

All **956 current registered checks** have cumulative PASS coverage: 302 PRE,
615 CORE and 39 POST. CORE coverage comprises 317 initial passes, 146 in the
first resume, 151 in the second resume, and the new splat test in the final
integration batch. Both earlier failures were repaired test fixtures (the
bridge's hidden paint/task clock and the action probe's omitted trace binding);
their failed logs remain retained. This is **not** an uninterrupted green
`npm test` or a complete single-revision rerun. Coverage is recorded in
`opaque-paint-full-suite-r1.log`, `opaque-paint-suite-resume-r1.log`,
`opaque-paint-suite-resume-r2.log` and `loading-final-integration-r1.log`.

The final integration batch separately passes the splat oracle, sourced terrain,
all-30-map streaming, updated CPU-pool/956-check registry, typecheck/unused-code
and public/localized production build. Its Doctor entry exits 1: score 49,
three dynamic-evaluation errors and five serial-await warnings, all in test
fixtures. Independent review confirms checksum-pinned/fixed-local source
evaluation and deliberately serialized clock/cancellation cases, not untrusted
production evaluation or hot-loop awaits. No diagnostic was suppressed; the
eight-entry batch as a whole must not be reported green.

The unprofiled `loading-final-local-r1/report.json` passes real trusted splash,
Battle, day-to-night Battle Again and Return-to-Garage controls, audio ownership,
warm/source readiness and cleanup, with zero reported errors. Chrome
151.0.7922.47 uses native Metal on M5 Max, Urban with 14 tanks, high quality,
1280×720/DPR 1, render scale 1 and no scene trim. All three screenshots were
visually inspected: no missing terrain/textures or black transitions observed.

| Action | Click to opaque cover | Click to ready | Worst callback gap |
| --- | ---: | ---: | ---: |
| Battle | 5.9 ms | 6,622.4 ms | 94.3 ms |
| Battle Again | 140.6 ms | 5,532.2 ms | 68.1 ms |
| Return to Garage | 90.6 ms | 332.7 ms | 49.8 ms |

The cold Battle gap overlaps one 50 ms long task; 44.3 ms remains unattributed.
The rematch/Garage worst gaps overlap no ≥50 ms long task. These are
functional/readiness passes, **not** stall-free performance or causal speedup
evidence. Report SHA-256:
`ddd3c00768777bb43a843d8a45f22e47c06e0472b8015b10936cf9f07318a82c`.
Served HTML SHA-256:
`b830bca3d8fd5e5c036c11bd06c827ad101f59fb7119445aebbf28b5ceb60c6e`.

The separate 60-second `loading-final-camera-r1.json` uses the same clean runtime
and a matched full Verdant roster. It records 3,585 submission intervals,
29/29 trusted camera responses, no console errors, 16.7/17.3/25.0 ms
median/p95/p99 intervals and 790/847 median/maximum draws. The unchanged
median-FPS gate **fails at 59.9 versus ≥60**; other budget rows pass.
Certification is also **REFUSED** because another interactive-browser GPU
process reached 79.2% CPU against the 15% contention limit (not a GPU-utilization
measurement). No foreign process was stopped, threshold relaxed or favorable
rerun substituted. Report SHA-256:
`768a530b8cb568710143b60731f6768481c0236e281308afe77e1fd096908d0d`.

The historical 214–319 ms stall cause remains unproven. Native constructor,
readback, upload, browser scheduling and remaining unsplit work can still block;
this release does not claim every loading/Ready/frame-budget deliverable closed.
