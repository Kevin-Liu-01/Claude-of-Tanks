# Type 10 post-push suite follow-up

Type 10 was published as `9e20c8b0a` after the owner's explicit approval to
push once affected checks passed and finish the complete suite separately.
Twelve affected checks and both builds had passed before that push.

The separate frozen `npm test` process subsequently exited 1. All 307 pre
checks passed. Core stopped after 67 completed checks (66 pass, one fail);
the remaining core checks and post phase did not run. The failure was
`src/fx/lazyRuntime.selftest.mjs`: its source slice still searched for the
former direct reveal call after that call had moved into a helper. Raw log:
`.qa-dev/durable-final-20260910/published-npm-test.log` in the durable Type 10
worktree. Do not describe this lifecycle as a complete-suite pass.

After the process terminated, this clean worktree fast-forwarded to
`3e6ff4978` (including the newer FX retry behavior in `0a5ec9819`). The test
repair bounds the actual covered interval using the production helper call,
requires completed cohorts AND staged submission, and requires both readiness
retirements inside the successful completion branch. Negative controls
replace either the conjunction or guard with `true` and must be rejected.
The adjacent production-behavior regression exercises successful and failed
cohorts, restoration and retry. No application code or tank geometry changed.

Targeted follow-up: lazyRuntime, soloBattleFxReadiness and
soloBattleDeploymentRuntime. Run log:
`.qa-dev/durable-final-20260910/fx-fixture-direct.log`: all three PASS.
The original queue wrapper was deliberately stopped while it had no child
test process (exit 143). These small CPU-only fixtures do not need the
exclusive full-fleet geometry/render lease. Running them directly completed
in approximately 0.53 seconds; no foreign job or queue artifact was removed.
The repair is a separate verified checkpoint; it does not certify
the unfinished complete suite or the separate Challenger geometry draft.

## Remaining-phase result at `1a28487e6`

The separately started `core && post` continuation exited 1. The runner
reported core progress through 621/627 and identified
`src/ui/loadingScreens.selftest.mjs` as failed; post did not execute.
This was remaining-phase coverage on a newer revision, not an all-phase
pass on the original Type 10 commit. The terminal output was truncated;
do not infer a precise total of passing checks from the progress counter.

A direct 0.13-second reproduction confirmed the failure at line 324:
the source slice for covered battle-entry program/FX staging is empty after
the readiness refactor. Evidence is saved in
`.qa-dev/durable-final-20260910/loading-screens-failure.log`.
The repaired test now locates the nullable submission declaration and validates
both source boundaries before slicing. Compiler batching and yield-order
assertions remain intact. A second stale slice now requires completed cohorts
AND staged submission, followed by retirement only inside the completed guard;
two negative controls reject unconditional completion or retirement.

The repaired loading-screen test passes in under one second, alongside
soloBattleFxReadiness (five behavior scenarios), soloBattleDeploymentRuntime
and lazyRuntime. Evidence: `loading-screens-retry.log` in the same scratch
directory plus the adjacent tests' terminal results. No production UI or tank
geometry changed. The suite remains non-green until outstanding checks and
post complete; this targeted repair is not a fresh full-suite pass.
