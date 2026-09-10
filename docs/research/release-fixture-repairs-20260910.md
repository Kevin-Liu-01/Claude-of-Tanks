# Release fixture repairs — 2026-09-10

These repairs prevent already-published world/factory changes from stopping
otherwise unrelated tank releases. This checkpoint changes no playable vehicle,
source model, asset, geometry oracle, score floor or application runtime.

- Two historical world guards explicitly require the published birch/aspen
  `birchLeaves: true` flags, then compare their original palette hashes after
  projecting only those flags. Missing, false and string-valued flags fail.
- The legacy crop fixture binds the actual empty props configuration and uses
  a fixed source-owned virtual module, not `new Function`. Its original painter
  slice, RNG, color, alpha and dimension assertions are unchanged; the hook is
  always deregistered. The independent biome test still covers both opt-ins.
- The wharf guard permits exactly the published Autumn consumer, strictly
  between wharf construction and unconditional reference release. Missing,
  conditional, wrong-value and reordered releases fail. Actual three-seed
  ownership, geometry, collision and RNG checks are unchanged.
- Wreck attribution follows calls inside the actual owned construction
  generator. It does not time iterator creation or suspension. The original
  30-stage floor remains; stage-count and missing-owner controls were added.

Verified after rebasing on `1104b9916`: all eight focused tests in
`.qa-dev/check-release-fixtures.mjs`, typecheck/core-unused and pinned scoped
React Doctor pass (zero errors/warnings). The eight tests are village wear,
Mangrove palette, environment surface color, biome crop identity, actual wharf,
wreck profiler, wreck-paint benchmark, and suite registry. Independent review
found and closed an initial consumer-order guard gap before final execution.
Native Canvas assertions here are not an FPS or GPU appearance claim.

The separate three-tank geometry checkpoint is still awaiting its complete
release. Interrupted diagnostic prefixes are not counted as `npm test passed`.
Future releases retain the strict composed gate and full test/build tail.
