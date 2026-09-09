# Coastal worn-ground candidate

Base: `d6cc60fe38bfef5143075c900728603797a27e94`. The scoped visual change
was accepted after native before/after review and integrated as `c97e20fd2`.
This is not acceptance of the complete coastal scene or measured heap/frame
cost parity.

Coastal and inherited Saltwind use `wornDirtStrength: 0.22`; the other 28 maps
retain the exact `0.84` default. Only the noise-driven D-material contribution
is reduced before competing with road shoulders and authored town wear.
Explicit beach, shoal and road sample paths remain unchanged. Transition pixels
can still change where ambient worn sand previously dominated their blend.

The source diagnosis is that Coastal's D layer is pale beach sand, so broad
noise-driven wear was turning inland pasture into conspicuous sandy islands.
Raw noise and worn-field definitions, CPU grass admission/RNG, textures and
geometry are unchanged. Desert and Oasis do not opt into this adjustment.

## Resource scope

One logical scalar float uniform and its `{ value }` wrapper are added to the
existing material compilation hook. This is one 32-bit shader component, not an
exact driver-buffer or retained-heap measurement. There are no new texture
reads, textures, attributes, draw calls, caches or per-frame callbacks. The
existing source still contains 78 texture-fetch expressions and unchanged
procedural texture dimensions. The shader program key advances to v26.

## Focused checks

- `terrainWornDirt`: 810 actual-source scalar cases, all-30 authored scope,
  legacy dry behavior, protected road/town weights, explicit zero/clamping,
  raw grass-field agreement, resource checks and failing mutation controls.
- `terrainProjection`, `terrainSandCoverage`, `terrainSurfaceDetail`, and
  `terrainRoadMaterial`: passed.
- Native TypeScript 7.0.2 `tsc -p tsconfig.json --noEmit`: passed.
- Strict metrics for the new test and history helper: 26 functions, zero
  violations, zero `any`/`unknown`. Changed uniform helper remains below all
  strict thresholds. `git diff --check`: passed.
- React Doctor changed-source scan: two test-only `new Function` diagnostics
  for executing local source-controlled GLSL/TS scalar expressions; no runtime
  diagnostic. These were not suppressed or relabeled as a passing scan.

The historical palette projection removes only this later Coastal/Saltwind
setting alongside the separately guarded shore-relief setting. Its original
RGBA/config receipts are not refreshed; current scope is independently tested,
including a mutation the historical projection would otherwise hide.

Fresh build, native palette and visual acquisition receipts belong under
`coastal-worn-ground-candidate-r1.HCEVZU` and `coastal-worn-ground-r1` in the
external environment-recovery evidence directory.

## Completed native review

The public candidate build passed at `2c9d47d55637240d9ce0b6ee108f54c955c8aab8`
(index SHA-256 `5e2ea5419fb5d3468d4062b63c7be90add5f49be940d8ca905d0fd8a8b522e52`).
Its runtime files are unchanged in the integration checkpoint. The original
native palette regression also passed without updating its image hashes.

`coastal-worn-ground-r1` contains both original 1440×900, DPR1 native views,
their exact camera receipts, `comparison.json` and `ANALYSIS.md`. The report
SHA-256 is `1dfa194e8ee330b457fd54c2d4d5d91e261cd3f3cd0921efce1add45607955d5`.
Both images were independently viewed by the primary agent. Inland pale
swirls are substantially reduced, while the beach, roads and authored town
wear remain legible. Large sandy town footprints and grass rows remain;
this checkpoint does not claim to fix those separate composition problems.

The before/after pairs use the same Chrome151.0.7922.47 / ANGLE Metal M5 Max,
camera, quality and acquisition state. Scene/subtree counts and texture
inventories match exactly: Coastal has 172 geometries, 32 materials and 40
textures; Saltwind has 166 geometries, 33 materials and 42 textures. Browser
errors are empty and the maintained capture tool completed cleanup. These
are matched visual/resource checks, not a controlled timing or retained-heap
measurement; the added uniform wrapper remains explicitly disclosed above.
