# Deployment effects readiness

## Confirmed defect

The covered solo deployment staged effects and attempted their program
submission and isolated draws. The renderer-error catch continued loading, but
the subsequent `staged` flag alone marked opening and destruction effects ready.
Thus a compiler failure, failed first draw, or partially completed cohort could
prevent the real deferred coordinator from retrying the missing work. Staging
is not GPU preparation: its restoration resets those effects before the ordinary
reveal frame, so that frame is not evidence they were warmed.

## Regression evidence

`soloBattleFxReadiness.selftest.mjs` composes the production deployment runtime,
actual FX staging/restoration, armor-overlay visibility owner, isolated cohort
generator and opening-warm coordinator around real Three.js meshes. Only native
renderer I/O and unrelated world/entry ports are controlled.

The pre-fix FIFO run on `991940cd6` passed its successful case and failed exactly
three intended cases: compiler, first draw, and later draw. Positive invocation
counts and exact cleanup assertions passed before each readiness assertion.
All three failures incorrectly reported opening/destruction/covered readiness
and suppressed the retry. Raw log: `.local-evidence/solo-fx-readiness-red.log`.

## Correction

Readiness now requires the complete isolated-cohort loop, successful staging,
successful restoration and a current generation. The bounded FX receipt records
completion and at most 320 characters each for work/cleanup errors. A new
generation clears the previous covered-success receipt before its first await.
Ordinary renderer warm failures retain compatibility and remain eligible for
the real deferred retry; they no longer set opening/destruction readiness.

Acquisition is inside the borrowed-armor cleanup scope. Nested restoration
attempts armor cleanup even if effect cleanup throws. Uncertain cleanup is not
an optional renderer failure: it rejects to existing covered-entry recovery
before reveal. A successful graphics check alone cannot certify that staged
effects were removed.

The first corrected run passed five FX cases (including a real reset failure)
and existing deployment/loading tests. Its strict complexity gate failed at
cognitive complexity 22. Extracting cleanup alone retained that boundary;
removing a redundant synchronous current-generation branch then passed the
unchanged strict gate. Both failures remain in
`.local-evidence/solo-fx-readiness-fix-focused.log` and
`.local-evidence/solo-fx-readiness-final.log`.

Final FIFO checks pass in `.local-evidence/solo-fx-readiness-final-r2.log`:
five FX cases, deployment/loading/entry/deferred-warm regressions, registry
discovery, full typecheck/unused-owner check, public build/localization and diff
check. Metrics report 28 functions, zero complexity violations, zero explicit
`any` or `unknown`. The registry discovers 967 ordered checks; this focused run
does not claim to execute all 967.
Every new case seeds a prior successful receipt, verifies exact invocation and
cleanup counts, and checks actual retry eligibility rather than a mocked flag.

## Performance boundary

The earlier instrumented native acquisition had a 650 ms isolated FX draw.
The later covered-watchdog acquisition did not reproduce it: maximum FX batches
were 37 / 11 ms for first battle / rematch. No causal shader/driver leaf or
repeatable speedup is established by those different acquisitions. A separate
strict private-target program-preparation helper remains an unintegrated
experiment, not a shipped optimization. This correction is an error/retry
ownership fix, not proof that historical frame stalls are eliminated.

The preceding covered-watchdog release `991940cd6528f30257f63b096236d6b40c3b5a5e`
completed production workflow `34543872593`, and the public page exposes that
version. It does not contain this subsequent effects correction. A fresh
production actual-controls acquisition is required after this slice lands;
the older native screenshots are not a production test of this patch.
