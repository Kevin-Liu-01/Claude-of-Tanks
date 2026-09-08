# ERA descriptor construction checkpoint — 2026-09-08

## Scope

This independent checkpoint starts from main
`57bf9fc131a7ac56406ed50707840a898edeb859`. The user's standing authorization
permits verified, scoped checkpoints; it does not waive failed fleet gates.

The only runtime change extracts the existing legacy surface deduplicator
from `src/vehicles/tankFactoryCore.ts` into
`src/vehicles/eraSurfaceDeduplication.ts`. The helper computes each input
surface's center and normal once per invocation and retains that descriptor
for subsequent candidate comparisons. Replacement updates the corresponding
descriptor. It preserves the exact arithmetic, strict `> 0.995` normal and
`< 0.05` distance tests, first-match order and outward-face replacement rule.

There is no persistent cache, cross-build state, whole-fit memo, renderer
change, new dependency, geometry simplification, material change or fleet
registry/profile edit. Exact authored ERA facets still bypass this legacy
deduplicator. Current-main night-lighting integration remains untouched.
The focused selftest has one row in `tools/selftest-suites.mjs`.

No source models, temporary QA files, unrelated WIP or generated asset sweep
belong in this checkpoint. Byte-identical geometry is the acceptance boundary;
this is not a newly qualified vehicle batch.

## Independent comparison and construction effort

The test reads the original complete descriptor/deduplication block from
commit `12a5b9aec317107782b5f6505065ada7c721f290` and authenticates its SHA-256:
`c652114d6069f49f556e598bce72de19de1176b0032c3131d0b3fe15982188b7`.
That same block was verified unchanged in this checkpoint's fresh main base.
The oracle is not an expected result generated from the candidate.

Ninety fixed-legacy cases cover strict threshold boundaries, opposite faces,
first-match/replacement chains, seeded/reversed collections and caller edits
between invocations. Selected surface references, order and input vertices
remain exact. A separated 300-face fixture records 316,050 legacy point reads
versus 2,100 current reads, with no timing threshold.

The additional native test constructs 32 complete Node procedural visuals:
M1A2, Challenger 3X, Challenger 2 and Leopard 2 Revolution, HIGH and LOW, two
build/dispose/revisit cycles, separately under legacy and current selection.
Its loader observes the one actual native deduplication call; it does not
replace profiles, source surfaces, frames, gear or authored-face collection.
For every collected input it compares the concrete center/normal, exact
selected face references/order and unchanged vertices. Complete geometry and
instance buffers, hierarchy, transforms, LOD, draw ranges, fitting metadata
and serialized material definitions match between old and new constructions.
Only random UUID values are normalized through a deterministic bijection.

Per actual build, the instrumented `Vector3.fromArray` reads are:

| Vehicle | Quality | Invocations | Input faces | Legacy reads | Current reads |
| --- | --- | ---: | ---: | ---: | ---: |
| M1A2 | HIGH and LOW, independently | 110 | 6,258 | 721,742 | 43,806 |
| Challenger 3X | HIGH and LOW, independently | 198 | 11,012 | 1,308,972 | 77,084 |
| Challenger 2 | HIGH and LOW, independently | 0 | 0 | 0 | 0 |
| Leopard 2 Revolution | HIGH and LOW, independently | 0 | 0 | 0 | 0 |

Revisits reproduce those results. This is causal evidence of approximately
16.48× / 16.98× less descriptor point-read work on the affected native builds,
not that complete tank construction, GPU work or switching became that much
faster. Node uses explicit geometry-only materials, not browser texture pixels.

## Guarded verification

All 13 checks passed, completing at `2026-09-08T18:03:16.542Z`. Every command
used the shared capture FIFO. This isolated worktree has independently installed
dependencies. All 32,278 repository/dependency and executed QA-runner/hook input
entries stayed unchanged from start through exit, with no excluded changed
files. Input manifest SHA-256:
`b6306f3761c23070899efc80ec0799699fe1e6e9167f6ac419ead7f9f2aad0e5`.
This document was added after the guard; tested code was not edited afterward.

| Check | Result |
| --- | --- |
| `eraSurfaceDeduplication.selftest.mjs` | PASS |
| `eraAuthoredFaces.selftest.mjs` | PASS |
| `eraBindingReceipt.selftest.mjs` | PASS |
| `eraGameplayRegistration.selftest.mjs` | PASS |
| `src/game/eraActivation.selftest.mjs` | PASS |
| `tankFactoryCore.selftest.mjs` | PASS |
| `garagePresentation.selftest.mjs` | PASS |
| `vehicleNightLighting.selftest.mjs` | PASS |
| `tools/selftest-suites.selftest.mjs` | PASS |
| `tools/local-import-integrity.selftest.mjs` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| Maintained current-browser garage smoke | PASS, limited scope below |

The unchanged gameplay-registration test audits every registered tank's ERA
inverse bindings and reports 73 ERA vehicles, 351 depletable zones, 9,184 fitted
faces and 452 reactive visual sectors. It verifies actual hit, visual removal,
spent collision and reset behavior. This is one fleet-wide ERA check, not a
complete fleet lifecycle/release pass.

The Three.js skill's read-only scanner remained 44/100 overall (558→561
findings). The three additional `no-eval` findings are in the selftest's
authenticated fixed-commit/local-source oracle evaluation, not runtime or an
untrusted-input execution path. They were inspected, not suppressed. The
tracked-change scan reported no findings; it excludes the untracked new
helper/test, hence the separate full scan. No scanner setup or dependency was
added, and unrelated existing findings remain open.

## Rendered smoke and remaining performance issue

The unchanged maintained `tools/switch-latency-probe.mjs` ran headless Chromium
at 1280×800 and default 1× CPU, with 600 ms dwell. Its six-stage sequence was
M1A2, Challenger 3X, Challenger 2, Revolution, M1A2, Challenger 3X. All six
pedestal visuals reached the probe's visible-ready boundary with no page
errors; median was 144 ms and maximum 158 ms. The final captured garage frame
was inspected and contains the rendered Challenger 3X hero.

The probe stages the production pedestal directly, not trusted country/card
clicks; the selected-card/dossier UI deliberately stays on the initial M1A3.
Its timings are a JS readiness boundary, not measured GPU presentation.
A temporary loader changes only Vite's generated optimizer `cacheDir` into
the QA output directory; the maintained browser logic, runtime source and
installed dependencies remain unchanged. That loader and its exact patch were
included in the input guard. Browser and server closed on normal completion.

**This is not a switching-lag acceptance.** The same current-only run still
records frame-gap p95 605.1 ms, maximum 616.7 ms and idle-prefetch maximum
1,090.8 ms. No paired browser baseline was measured here. Those stalls remain
an important open issue; a helper-level work reduction does not close it.

The local unshipped receipt, logs, manifest and screenshot are in
`.qa-dev/era-descriptor-checkpoint-TR4WvI/`. The committed selftest reproduces
the functional/native comparison without that directory. The remaining fleet
triangle budgets, new running-gear primitives, return rollers, thicker tracks,
chassis/shoulder closure and semantic materials still require their separate
current per-vehicle evidence. Previous failed or interrupted release gates
are not superseded by this checkpoint.

## Post-rebase verification

Rebased onto `b9c45b91b0f0c46846f758d97038a0e232a3722c`, retaining the
published rounded-box cache and fitting-ownership disposal changes. All 13
checks above passed again, finishing at 2026-09-08 18:18:53 UTC. All 32,282
guarded input files remained unchanged; manifest SHA-256
`322cc95f55b85cadf7cabd7e69708c4a7f2eb41943c9d248cc554ceecca47099`.
The local receipt is `.qa-dev/era-descriptor-checkpoint-kROOeP/receipt.json`.
The repeated six-stage smoke reached all six visuals (median 144 ms, maximum
151 ms), but still reports frame-gap p95 602.4 ms and idle-prefetch maximum
1,099.1 ms. The switching-lag issue therefore remains open. Only this evidence
paragraph was added after the guard; tested code was not changed.
