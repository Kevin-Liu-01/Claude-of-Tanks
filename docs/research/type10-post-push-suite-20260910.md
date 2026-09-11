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
