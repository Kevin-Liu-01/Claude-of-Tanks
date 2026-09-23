# Fitting-buffer ownership checkpoint — 2026-09-08

## Exact scope

This independent checkpoint starts from freshly fetched main
`3cca022ff825f60f68a6bac037c530112e53515f`. It repairs a concrete resource-lifetime
defect without importing the remaining fleet geometry, fitting tessellation,
cooperative construction or material changes.

`profiles/kit.ts:fitAssemble` creates fresh merged fitting geometries outside
the factory's bucket disposal list. The new `ownedFittingGeometry.ts` records
only those buffers in a private WeakSet. One import/call pair in the kit
registers each merge; one import/call pair in `tankFactoryCore.ts` releases
registered buffers through its existing disposal traversal. Deleting the
registration before disposal makes repeated mesh references release once.
Unregistered geometry remains under its original owner.

All current-main night-lighting preparation, registration, transfer and
finalization code is retained. There is no geometry, primitive, material,
profile, rig, gameplay or batching-policy change. The existing disposal path
still reattaches distant detail before traversing it. No render-loop work is
added. This does not register separate Challenger tower primitives; that is a
different bounded lifetime change, not silently included here.

The six publishable paths are the new helper, its focused selftest, the two
existing runtime files, one `tools/selftest-suites.mjs` entry, and this report.
No source model, temporary QA artifact or generated fleet asset belongs in
this checkpoint.

## Current-main differential and lifetime proof

`src/vehicles/ownedFittingGeometry.selftest.mjs` runs the actual procedural
builders in **Node, with explicit geometry-only materials**. It does not
measure GPU residency, browser paint or switching latency.

The reference removes exactly the two import/call pairs in separate child
processes. Every other current-main runtime byte, including the lighting and
batching code, remains in both cases. The test constructs 32 complete tanks:
original M1A2 and Challenger 3X, HIGH and LOW, static batching enabled and
disabled, two simultaneously resident visuals, under both implementations.

All geometry and instance buffers, hierarchy, transforms, LOD, fitting
metadata and serialized geometry-only material definitions match exactly.
Only random UUID values are normalized, with a deterministic bijection.
No mesh, decoration or geometry attribute is filtered from the comparison.

The old path supplies **208 undisposed-buffer negative witnesses**. The
corrected path releases the same **208 fitting buffers exactly once**. Each
visual contains thirteen such buffers. Tests additionally cover duplicate
mesh references, explicitly unregistered stock, independent live visuals,
four real static-batching cases per implementation, and two real HIGH-detail
detach/dispose cases per implementation. Disposing the first tank leaves the
second tank's content and buffers unchanged.

## Guarded checks

The serial shared-FIFO run completed at `2026-09-08T17:44:50.218Z` using this
worktree's independently installed dependencies. All 32,273 source/dependency
input entries stayed unchanged through exit; the changed-input list is empty.
Input-manifest SHA-256:
`e1486353ab1ad2b79e89b056d0061398c4e6151d6e8e1a7d79ed3b6e602e950d`.
This report was added afterward; the five code/test/registry paths were not
changed after validation.

| Check | Result |
| --- | --- |
| `ownedFittingGeometry.selftest.mjs` | PASS |
| `tankFactoryCore.selftest.mjs` | PASS |
| `battleDetailLod.selftest.mjs` | PASS |
| `garagePresentation.selftest.mjs` | PASS |
| `vehicleNightLighting.selftest.mjs` | PASS |
| `tools/selftest-suites.selftest.mjs` | PASS |
| `tools/local-import-integrity.selftest.mjs` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |

Local unshipped evidence is in
`.qa-dev/fitting-ownership-checkpoint-SOFX5E/receipt.json`, alongside command
logs and the full input manifest. The committed focused test reproduces its
functional and differential proof without that temporary directory.

After integration onto published cache commit
`57bf9fc131a7ac56406ed50707840a898edeb859`, all nine checks passed again at
`2026-09-08T17:56:50.039Z`. Both suite entries were retained when resolving
their shared insertion point. All 32,277 guarded inputs stayed unchanged;
manifest SHA-256
`3565208aa08c9153a390bcac91056b81e153289a1beebb4caced5b9e9ff482ac`.
The local receipt is `.qa-dev/fitting-ownership-checkpoint-yxEM0h/receipt.json`.
This paragraph alone was added after that validation; tested code is unchanged.

The Three.js improvement skill informed the explicit ownership/lifetime audit.
Read-only React Doctor scans ran only against the independent worktree before
the guarded checks. The whole-project score remained 44/100 with substantial
pre-existing diagnostics, not a clean global scan. Its changed-file scan found
no issues in the three tracked modified files. The new selftest adds two
low-impact sequential-import warnings: its deliberate order completes native
fleet registration under the control loader before retrieving the registered
spec/state helpers. No runtime warning or rule suppression was introduced.
No scanner configuration, package dependency or project setup was changed.

## Acceptance boundary

This preserves one verified resource-lifetime repair under the user's standing
instruction to publish scoped checkpoints as they pass. It does not waive
remaining per-tank quality gates or certify the full fleet lifecycle. Fitted
running gear, triangle budgets, shoulders/chassis closure, paint/material
coverage, other resource owners and browser switching performance still need
their own current acceptance evidence.
