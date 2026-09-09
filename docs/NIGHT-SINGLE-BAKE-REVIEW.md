# First-night environment preparation

Covered battle entry now skips the intermediate authored-day environment bake.
The existing selected day/night owner still prepares the final environment
before combat warming and the first covered battle render. Ordinary Garage,
Studio and capture activation keep their existing full-preset behavior.

This changes three production files: `worldActivationRuntime.ts` owns the
deferred state and recovery; solo/network entry explicitly opts in; the
selected/reset callback acknowledges a successfully prepared active world.
It adds no light, texture, render pass or per-frame updater. It does not remove
day/night or alter lamp intensity, geometry, visibility or final night presets.

## Evidence

The preserved `night-pmrem-main-pair-r1.E86tFV` archive under
`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/`
contains original/resumed setup receipts, commands, native reports, images
and `ANALYSIS.md`. The first setup failed on a missing local compiler;
only the two new worktrees' dependency symlinks were repaired, and the
unexecuted preparation steps resumed. No failed result was overwritten.

Baseline123df3439 and candidate85c73815b both descend from85d68decd and use
the same guarded diagnostic sky getter. The getter is **not** part of this
shipping change. The maintained probe is239c88c70's
`tools/daynight-atmosphere-probe.mjs`; each native process owns one FIFO lease.

- Baseline: exactly two actual `sky.bakeEnvironment()` returns and changed
  CubeUV target installations before the first night render. The unchanged
  exactly-one assertion fails as expected; raw report is retained.
- Candidate: exactly one successful selected-night bake. Its installed target
  identity remains unchanged through the first completed ordinary battle
  render, under the opaque loading cover. Preparation/reveal order, headlight
  and streetlamp apertures, three screenshots and Garage return pass.
- Both use native Chrome152.0.7977.76 / Apple M5 Max Metal,1440×900 High.
  No console/context/cleanup errors; both owned browsers and servers stop.
  Root and independent review personally inspected all three candidate PNGs.
- Focused world-activation, solo-loading, atmosphere-access/runtime and
  diagnostic tests pass for both roots; observer tests, native TypeScript7
  and both private builds pass. Recovery tests cover stale/cancelled prepares,
  same/different maps, day/legacy seeds, cached rematches and ordinary callers.

Baseline report SHA-256:
`1c84ab3bece1937ee17517a8a7584ac29a7d48808fdf0527b7f07f0c07f23f49`.
Candidate report SHA-256:
`3d3a23beb34620104e04c883d7ee8fb4def609195ae382f8ce0a52ade18a70a2`.

The final integration on9dac657de, without the diagnostic getter overlay,
passed the same five focused tests, TypeScript7, core-unused, the four-module
strict quality gate (204 functions, zero violations) and normal public build.
Doctor scored92 with two sequential-await warnings in lifecycle tests; those
ordered transition scenarios are not runtime hot loops, and no suppression
was added. `night-single-bake-main-check.ic4Yk2/report.json` preserves the
12:58:15–12:58:33UTC FIFO run and unchanged hashes of all six source/test files.
The integrated public index hash is
`bc090d6b88f81d0264040cc3a99e138d84599f2dfbb441b4eba8cc4693aa0216`.

## Limits

Actual synchronous bake returns and target identity are not GPU-completion
timing or texture-pixel equality. This one first Urban/M1A3 entry is not an
all-map/network/rematch native matrix, physical iPad certification, retained
heap census or a general loading-speed benchmark. The raw5173→4648ms totals
include unrelated warm/construction variation and are not a causal speedup.
Baseline stops at its failed count gate, so the candidate images are visual
smoke evidence, not paired image-equality proof. Full environment-pass
performance/memory and whole-map art acceptance remain separate.
