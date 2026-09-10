# Fleet WIP recovery — 2026-09-08

**Status: OPEN. This is a recovery/publication checkpoint, not a fleet release
certificate.** The owner requested continuation of all unfinished Abrams,
fleet-material, running-gear and performance work, with more frequent commits
and pushes to preserve verified progress.

Latest publication: `e4ca00b6c` released fourteen recovered tank updates after
the complete twelve-stage/933-test qualification; Type 10 X and the two
T-90A X Shtora corrections were already released in `4aa008627`.
Use [the current recovery boundary](tank-work-object-store-followup-20260909.md)
for present disposition. The interrupted-run counts below remain historical
evidence and must not be presented as the status of those shipped updates.

## Authority and scope

On 2026-09-08 the owner confirmed: **“Yes—push verified checkpoints as they
pass.”** This authorizes coherent, verified checkpoints of the requested work
and its necessary tests/docs directly to `origin/main`. It does not authorize
publishing failed candidates as-is, lowering fixed quality/performance gates,
unrelated experiments, private comparison/source models or temporary QA files.
Earlier batch-specific as-is exceptions are not a waiver for this work.

Keep the existing [fleet acceptance contract](../tank-generation/fleet-style-performance-priority.md)
and [quality gates](../tank-generation/quality-gates.md). The owner's subsequent
choices are part of that contract:

- Close upper shoulder/skirt wheel gaps; keep lower road-wheel faces visible.
- Prioritize fitted, efficient running-gear primitives when old links conflict
  with thickness/triangle budgets; preserve hull/turret silhouette and road-wheel
  stations instead of moving those to hide a fit problem.
- Painted bodywork, including broad M1/Burlak side sheets, must receive vehicle
  camouflage. Cloth, bags, accessories, optics, rubber and mechanisms retain
  their deliberately assigned material roles.

## Recovered worktrees and evidence boundary

The unfinished source tree is `cot-abrams-source-x-integrated-20260907`, branch
`codex/abrams-source-x-integrated-20260907`, at
`12a5b9aec317107782b5f6505065ada7c721f290`. The read-only recovery found a large
unstaged integration, not a small completed release. Do not modify/clean the
shared dirty checkout or stage that integration wholesale.

The clean checkpoint branch `codex/fleet-verified-checkpoints-20260908` started
from fetched `origin/main` at `f95bee586a6f09c483e93de8dfbad142b002aa03`, then
204 commits ahead of the integration base. These are historical coordinates,
not an instruction to reset current branches. Re-fetch and resolve overlaps
before each subsequent checkpoint.

The local receipt paths below are recovery locators in the integration's
ignored `.qa-dev` directory; they are intentionally not repository links or
publication payloads. Preserve them locally and copy only concise, reviewed
evidence into tracked docs. A receipt certifies its frozen inputs, not later
edits or a newer main integration.

## Interrupted lifecycle run: 179 of 843 completed

`reports/full-lifecycle-current-iGTqnX/receipt.json` records a collected
lifecycle-equivalent suite on `full-lifecycle-snapshot-zslHg5`, started
2026-09-08 at 14:21:02 UTC. The frozen source manifest contains 3,260 inputs,
SHA-256 `b22f5600925545d415937d1270e786b552646ce06116d9d01a06d7478c0c322a`.

At recovery, **179 checks had completed: 167 passed and 12 failed; 664 had no
completed result.** Check 179 (`profiles/leopard1A5Source.selftest.mjs`) passed;
check 180 (`profiles/leclercTrackCourse.selftest.mjs`) had only an empty log.
There was no final completion/pass field and no surviving lifecycle process
at the process check. A timeout, empty log or completed prefix is not a pass.

Paths in the table are relative to `src/vehicles/`. Numbers match the receipt
and its numbered logs. These are the failures of that frozen run; later narrow
repairs must not be spliced into it to manufacture a full-suite pass.

| # | Failing check | Recorded cause / recovery disposition |
| --- | --- | --- |
| 012 | `sourceXWesternAuxArmor.selftest.mjs` | Strv permanent-hull historical hash changed after receiving edits. Later four-check frozen auxiliary repair passed; see below. |
| 013 | `sourceXSovietAuxArmor.selftest.mjs` | B3 historical `hullRubber` component no longer matched after upper-skirt work. Same later bounded auxiliary repair passed. |
| 032 | `eraBindingReceipt.selftest.mjs` | Legacy PCA receipt hashes differed. Retain attribution and rerun the focused contract on the final snapshot; this recovery does not certify a later full run. |
| 059 | `profiles/type10XSkirts.selftest.mjs` | Crown witness could not find its expected fascia bucket. Later four-case HIGH/LOW, bilateral attribution found the exact old faces in `hullTrackGuardL/R`, not `hullDetail`; this was a stale selector, not authority to move geometry or tolerances. |
| 084 | `t72BUReceivingRuntime.selftest.mjs` | Exact LOW scene count was 43,496 versus historical 43,712 (216 fewer). Attribute that change narrowly; do not silently replace the fixed gate. |
| 097 | `leopardSideReceivingCasting.selftest.mjs` | A5 HIGH candidate had 264 nearby triangles against a fixed 140 budget. Candidate remains unqualified; redesign or retain it explicitly as a rejected experiment. |
| 116 | `abramsSourceXCrows.selftest.mjs` | Shared R4 equipment historical-source hash bridge failed. Requires a narrow, authenticated historical inverse and fresh test. |
| 119 | `abramsSourceXCitv.selftest.mjs` | Same shared R4 historical-source hash bridge failure. |
| 132 | `abramsSourceXMarkings.selftest.mjs` | Same shared R4 historical-source hash bridge failure. |
| 134 | `abramsSourceXSkirtArmor.selftest.mjs` | Separate M1A1 X permanent upper-joint ray missed at local `(-1.85, 0.90, -2.635)`. Diagnose physical stock, bucket/visibility and frame before changing a witness or geometry. |
| 135 | `abramsSourceXRackArmor.selftest.mjs` | Same shared R4 historical-source hash bridge failure. |
| 148 | `fleetLazy.selftest.mjs` | Child native-fleet sweep ended with `ETIMEDOUT`; no completed sweep pass. |

Completed rows reported no copied-source changes. The linked-input guard is
**not** an initial-to-final pass: `public` stayed exact, but four linked
`node_modules` paths differed from the initial manifest:

- `.cache/react-doctor/file-lint-cache.json`
- `.cache/react-doctor/scan-cache.json`
- `.cache/react-doctor/sidecar-lint-cache.json`
- `.vite/deps/_metadata.json`

Completed leases were exact within each lease, which is weaker than a stable
whole-run dependency snapshot. Do not delete other tasks' caches, hide these
differences with new exclusions or represent the guarded run as clean.

## Later/bounded evidence that may be reused only within its scope

| Local receipt locator (under `.qa-dev/`) | Verified scope | Does not establish |
| --- | --- | --- |
| `reports/aux-receiver-repairs-kB6NK0/receipt.json` | Four frozen checks passed by 14:58:49 UTC: Western auxiliary history, Soviet auxiliary history, Strv receiving and B3 skirt attachment. Inputs unchanged; historical fixture retained and current physical rays still tested. | A current whole-fleet or lifecycle release. |
| `reports/type10-skirt-crown-BZrSKL/receipt.json` | Four HIGH/LOW, bilateral current/old face comparisons passed with unchanged inputs; status `ATTRIBUTED_TO_STALE_TEST_BUCKET`. | A complete rerun of the Type 10 test or permission to weaken geometric stock tests. |
| `reports/fsp-final-decor-budget-4BsLcB/receipt.json` | All 53 actual decorated HIGH/LOW targets and the paired 21-ID selection/control scope passed at the recorded 14:13:49 UTC freeze. | Performance, source fidelity, all later material/fender changes, or fleet release. |
| `reports/small-fitting-frozen-fAP2zh/receipt.json` | Ten focused fitting/material/source/budget/typecheck checks passed at the 14:16:13 UTC freeze. | Later changes, all vehicle geometry or composed release readiness. |
| `reports/anatomy-frozen-4JTD96/receipt.json` | Anatomy update and anatomy check passed in that frozen copy. | Target release: it **failed** the following presentation-centering stage. |

The anatomy checkpoint's target release exceeded the 0.25-pixel centering
limit for all seven Abrams X models: SEPv2 X 2.66 px, TUSK X 2.05 px and the
other five 0.93 px each. Subsequent composed stages were not run. The receipt
also reports later live-input changes; its 177 changed generated outputs were
not a certified current-tree promotion. A later centering adjustment alone
does not complete the omitted stages or certify stale anatomy/portraits.

## Restart and publication order

1. Preserve the integration and ignored QA inputs. Confirm current owners and
   live processes; do not assume old session IDs still refer to running work.
2. Finish focused failures/attributions before another expensive lifecycle
   attempt. Keep historical counterexamples, source deviations, fixed triangle
   ceilings and physical-gap witnesses; no favorable rebaselining.
3. Finish per-ID track/end-wheel clearance, upper side closure, broad-sheet
   camouflage and real material checks. Return-roller or triangle-count passes
   alone do not establish fitted moving gear, painted armor or smooth switches.
4. For a coherent candidate, freeze exact code/dependency/assets and run its
   affected tests, actual native HIGH/LOW and spent/reset views, measured
   selection paths and fixed resource/latency gates. Heavy native tests and
   browser captures use the repository's serial capture queue.
5. Promote geometry only with fresh anatomy update/check, necessary generated
   assets, and the complete targeted release check. Then obtain a complete,
   unambiguous lifecycle/typecheck/build result on the publishable integration;
   an interrupted run is retained as evidence, never relabeled PASS.
6. Build the smallest independent checkpoint on current main, including every
   required runtime/test/receipt dependency and no unrelated WIP. Verify that
   exact staged scope, commit and push normally (no force), then verify the
   remote commit. Record remaining work and the next owner/action after each
   checkpoint instead of waiting for every remaining variant to finish.

This initial documentation-only checkpoint changes no playable tank, generated
asset, material, quality threshold or runtime behavior. It preserves the open
work and publication authority without asserting that unfinished changes ship.
