# Rounded-box construction cache checkpoint — 2026-09-08

## Scope and publication boundary

This is an independent shared-factory construction improvement, extracted onto
main base `ff15e968e4b4732d81d0648f6d4a5c0fa26aa2ae`. It does not publish the
remaining fleet geometry WIP or claim that tank-switch lag is fully fixed.
The user's standing instruction permits verified, scoped checkpoints; it is
not permission to publish failing release gates as-is.

The entire runtime change is a new `src/vehicles/roundedBoxGeometryCache.ts`
helper and two line substitutions in `src/vehicles/factoryGeometry.ts`: the
import and existing rounded-box constructor call. Constructor dimensions,
radius, segment selection and the tiny-box branch are unchanged. The helper
depends only on Three.js, not fleet builders, profiles or new running gear.
Its focused selftest is registered in `tools/selftest-suites.mjs`.

Private CPU templates are bounded to 128 entries and 4 MiB of geometry buffers,
with exact recipe keys and LRU eviction. Every caller receives independently
owned attributes, parameters and metadata. Caller transforms, painting and
disposal cannot change another tank or a retained template. Exceptional
recipes bypass the cache and preserve the original constructor's behavior.

No authored geometry, triangle count, model registry, armor profile or material
policy is changed. No source models, experiments, generated tank asset sweep
or temporary QA files belong in this checkpoint.

## Verification

The completed guarded run finished at `2026-09-08T17:28:59.669Z`. It used this
isolated worktree's independently installed dependencies and the shared FIFO
for each command. All 32,251 repository/dependency input entries remained
unchanged from start through exit; there are no excluded changed-input files.
Input manifest SHA-256:
`d58fdf114e4ee3a1844290cf026e6b7e97096f7f7b23619b12ce4397f6fb267f`.
This documentation was added after that guard completed; the four tested code
and registry files were not modified afterward.

| Check | Result |
| --- | --- |
| `src/vehicles/roundedBoxGeometryCache.selftest.mjs` | PASS |
| `src/vehicles/tankFactoryCore.selftest.mjs` | PASS |
| `tools/selftest-suites.selftest.mjs` | PASS |
| `tools/local-import-integrity.selftest.mjs` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |

The focused test covers six exact rounded recipes, six exceptional recipes
(including NaN and signed zero), eight actual factory threshold/bypass cases,
bounded eviction, oversized uncached results, default-singleton integration,
mutation isolation and one-owner disposal.

It also constructs **32 complete native procedural tanks**: M1A2, Challenger 2,
Leclerc and Leopard 2 Revolution, each at HIGH and LOW, with two full build /
disposal / revisit cycles, separately under the original and cached factory.
The reference inverts exactly the two factory substitutions in an isolated
process. All geometry and instance buffers, hierarchy, transforms, LOD, draw
ranges and serialized material definitions match exactly. No mesh,
decoration, instance or geometry attribute is filtered. Random UUID values
alone are normalized with a deterministic bijection. Warm revisits are exact
after intervening builds and disposal.

These are actual Node procedural constructions, not GPU renders or browser
canvas-texel measurements. The 400-construction diagnostic measured 65.86 ms
for the original constructor and 5.78 ms with reusable templates in this run;
it is not a timing gate or a measured end-to-end switching improvement.

The local unshipped receipt is
`.qa-dev/rounded-box-checkpoint-OFqM3P/receipt.json`, with command logs and full
input manifest alongside it. The committed selftest reproduces the functional
and native-model comparison without that temporary directory.

After rebasing onto `3cca022ff825f60f68a6bac037c530112e53515f`, all six checks
passed again at `2026-09-08T17:35:15.072Z`. All 32,254 guarded inputs remained
unchanged; manifest SHA-256
`225364be87c734cef06cb063176e347605458df483fc9edb241768780a411e20`.
The retained local receipt is
`.qa-dev/rounded-box-checkpoint-RCdJue/receipt.json`. This paragraph is the only
post-validation edit; tested runtime and test files remain unchanged.

## Remaining work

This checkpoint preserves one verified shared improvement, not completion of
the fleet request. The outstanding per-tank triangle budgets, fitted running
gear, return rollers, thicker tracks, shoulder/chassis closure, paint and
equipment material acceptance, and actual browser switching performance still
need their own current evidence. The full fleet lifecycle was not rerun for
this byte-preserving helper. Previous failed or interrupted geometry release
gates are not superseded by these focused passes.
