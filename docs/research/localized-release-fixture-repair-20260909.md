# Release fixture repairs (2026-09-09 UTC)

Test-only repair against `2dbddba5b`; no application, renderer, route, tank,
localization, or loading behavior changes.

- Garage/mobile source contracts now require the canonical translation keys
  instead of obsolete English literals. Authoritative ammunition interpolation,
  semantic roles, active selection, warning distinctions, and layout rules remain.
- Loading intent requires the current room-preparation guard and Solo fallback,
  rather than the obsolete direct callback assignment.
- The depth-copy test serves its private document before public route rewriting.
  Previously the public 404 page rendered all twelve native cases successfully,
  but correctly failed the strict empty-console gate. The test now additionally
  requires HTTP 200 and its own document marker. No error is filtered or waived.

Verified: all three focused UI entrypoints (including 51 representative viewport
contracts), full typecheck/core-unused check, and all twelve native depth-copy
cases on Chrome 151 / ANGLE Metal Apple M5 Max / Three 185. Native cases retain
byte parity, color preservation, no-copy/wrong-sampler negative controls, zero
fallbacks, context restoration, and browser/server/lock cleanup; errors are empty.

This removes four existing suite failures. It is not a full-suite or tank-release
PASS; independent world and profiling fixture failures remain under repair.

Subsequent seven-tank release retry on the repaired main passed anatomy,
centering, modules, assets, tracks and bores, then timed out at the fidelity
page's initial registry wait (90 seconds), before scoring a vehicle. The
runner now reports captured browser errors on acquisition failure without
changing the timeout or acceptance thresholds. A focused Burlak retry passed
96.6 with no acquisition error; the original timeout's cause is unconfirmed.
The full release remains failed until a complete fresh run passes.

Later comparator acquisition failures exposed HTTP 504 `Outdated Optimize Dep`:
separate worktrees shared the node_modules dependency-optimizer cache. The
comparator now owns a unique temporary cache and disables late dependency
discovery. An unchanged K2 baseline passed on its first load (95.25 aggregate,
minimum 92.97). This diagnoses the observed 504 failures, not retroactively
proving the cause of the earlier uninstrumented timeout. Scoring, source
transforms, acceptance floors and timeouts remain unchanged.

On `1415c90fe`, the comparator also guards cache/server/browser/page acquisition
and attempts every owned release even when another close fails. Primary
failures are preserved, secondary cleanup failures are reported, and only the
run's own cache is removed. Eighteen browser-free lifecycle cases passed,
including startup and cleanup failures, combined failures and unchanged scorer
success/failure behavior. These are tool-lifecycle tests, not native rendering
or a full-suite PASS.

Fresh closeout evidence on that revision includes successful TypeScript and
core-unused checks plus the complete anatomy update/check: 174 anatomy and
174 marking-seat receipts current, 1,496 modules and 348 track sides with zero
failures or outside-module results, all 79 existing dimension-drift warnings
retained, and 522 technical-card files current with no tracked generation drift.
The current seven-ID full release remains pending. See the
[integration checkpoint](seven-tank-bodywork-integration-20260909.md#current-full-release--pending)
for completed phases and the explicit unfinished release boundary; no earlier
failure is erased by these narrow passes.
