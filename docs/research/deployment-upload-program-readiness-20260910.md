# Deployment upload program readiness: rejected first native candidate

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
scheduling followup is still pending; the r1 failure evidence is immutable.

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
child took 1032 ms. No native scheduling-followup run has been performed.
