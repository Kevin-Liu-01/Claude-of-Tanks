# Deployment upload program readiness: rejection and qualified followup

The preserved native actual-control run is
`/private/tmp/cot-interactive-baseline.gsRCvU/deployment-upload-programs-candidate-actions-r1/report.json`.
It exercised local integrated revision `7d38f72d644435130c47a6568fa065100b7fc5c5`,
HTML SHA256 `f2029ae8e1faa7409c3619e2edc997f9f2283ce6efd8e64f9bb20933fa3e4714`,
and acquisition SHA256 `4be85c77e2b4a9596a9046b8b8bd6956bc44b3e3543677409654626ca119f137`.
The ordinary high-quality 14-tank Battle, Rematch, and Garage-return controls
completed on Chrome 151 / native Apple M5 Max graphics. The browser and local
preview were closed, the FIFO released, and browser/cleanup error arrays empty.

**This candidate failed required first-entry warm readiness.** The first
`__BATTLE_COUNTDOWN_WARM` trace has `done: true`, `doneBeforeRollout: false`, and
`ProgramUniformPreparationError: Program uniform preparation incomplete: budget`.
It has no completed deployment shadow/upload receipt. The old functional and
audio-only gates nevertheless reported top-level `pass: true`; those gates did
not require successful covered warmup. First cover/ready were 2.9/6528.4 ms,
but that ready time is not a speedup: required later work was skipped after the
caught warm failure. This receipt must not be used as a successful first-draw
or matched-roster comparison.

The completed Rematch receipt is diagnostic scheduling evidence: five upload
variants took 518 synchronous steps in 7 ms of covered elapsed time, with 516
uniform yields, 526 readiness queries, a 1.4 ms maximum step, and 4.2 ms summed
step time. A forced `createOpaqueLoadingYielder(12, 32)` yield may only advance a
task until the paint interval is due. Hundreds of task-only steps can therefore
exhaust the unchanged strict readiness round budget before native readiness
advances. The trace supports this scheduling diagnosis; it does not establish
which native shader/driver operation caused the older first-draw stall.

The narrow followup places the existing `nextPaintFrame` boundary only between
upload-program preparation generator steps. The caller's covered lifetime
guard runs before and after each frame wait; actual object materials and all
temporary renderer/scene state are restored before awaiting. Iterator cleanup
retains strict cancellation, context-loss, disposal, and failure behavior.
Geometry batches, generic loader policy, shader poll/deadline budgets, graphics
quality, roster content, and final scene state are unchanged. CPU regression
coverage uses the actual task-only loading yielder and a fake compiler that
becomes ready only after frame opportunities. Native acceptance of this
scheduling followup was pending at this checkpoint; the r1 failure evidence
is immutable. The later integrated qualification below does not replace it.

The separate acquisition followup adds opt-in `--warm-readiness-gate`. It
requires both Battle and Rematch countdown traces to have `done: true`,
`doneBeforeRollout: true`, and no error. Missing traces fail closed; Garage
return's stale trace is not accepted as new entry evidence. The functional
receipt remains separate, while a requested warm failure makes the final probe
result and process exit nonzero. Applying this checker to the preserved r1
report rejects its first-entry error and late readiness; it does not rewrite
the saved report or retroactively turn that run into a passing candidate.

## Followup validation before integration

Five focused engine checks passed through the ordinary FIFO:
`deploymentUploadPrograms`, `deploymentShadowWarm`, `offscreenWarm`,
`programWarm`, and `frameScheduler`. Exact `npm run typecheck` (including
core-unused) and `npm run build` passed; the public asset check retained 181
playables and zero GLB-sourced playables. Four runtime files / 161 functions
have zero complexity violations and zero `any`/`unknown`. Docs Doctor reports
4 pass / 0 fail / 0 warn. Changed-code React Doctor reports no issues across
six files (score and supply-chain scan disabled; no score claim).

The owner's final focused integration batch also passed:
`src/app/combatWarmComposition.selftest.mjs` and
`tools/garage-battle-actions-contract.selftest.mjs` (181 lifecycle assertions,
including combined warm/source gates). The initial combined runner
stopped after the five passing engine checks because its command mistakenly
used `src/engine/combatWarmComposition.selftest.mjs`. The corrective two-test
admission was canceled before execution to preserve the higher-priority fleet
release window, then completed in the explicitly admitted 17-file CPU batch
on integrated revision `be1844806` on September 10. All 17 passed; the longest
child took 1032 ms.

## Integrated native followup

`integrated-performance-actions-r1/report.json` under the same evidence root
exercised revision `0ca81d5c15c6a9f6a18b7ee15d18885231245c2c`, public HTML SHA256
`9222174966244462ec136475112af8128026a1ae240ff1220066e824a7b38e07`,
on Chrome 151.0.7922.47 / native ANGLE Metal Apple M5 Max. Both Battle and
Rematch pass the now-combined functional, audio, covered-warm and source-ready
gates. Required work completes before rollout; no error or missing trace is
accepted as success. Garage return also passes its separate lifecycle checks.

First entry prepares five upload variants in eight steps, with six frame
yields and eleven readiness queries: 73.5 ms covered elapsed, 2.3 ms summed
synchronous work, maximum step 1.6 ms. Its 104 geometry batches total 35 ms,
maximum 13 ms. Rematch prepares five variants in three steps: 15.7 ms covered
elapsed, 1.5 ms synchronous work, maximum 1.3 ms; its 105 batches total 2 ms,
maximum 1 ms. These are instrumented CPU/submission receipts, not GPU timing.

First click-to-activation remains 6616.0 ms including normal staged readiness;
the first callback gap peaks at 180.8 ms. A 154.6 ms native AudioContext
constructor lies inside that interval. Rematch peaks at 84.1 ms and includes
an unassigned 60 ms long task. Required warm readiness is fixed; neither cold
audio startup nor every transition stall is resolved. See
[integrated qualification](interactive-performance-qualification-20260910.md)
for the complete passing and failing acceptance results.
