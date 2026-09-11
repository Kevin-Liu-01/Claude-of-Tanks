# Completed post-frame accounting

## Problem and scope

Native Battle and Garage captures showed the diagnostics HUD reporting one draw
call and one triangle despite complete scenes. This is explained by the pinned
Three.js counter contract, not evidence of missing geometry: every native
`WebGLRenderer.render` increments `info.render.frame` and, by default, resets the
draw counters. The post chain ends in a `FullScreenQuad` whose geometry is one
triangle. Reading `renderer.info.render` afterward reports that final pass.

The HUD previously exposed these tail counts without a scope label and included
them in its exported `frame` summary. Existing resource-probe counters were
already independent whole-transaction totals, so the HUD error does not
invalidate those measured totals.

## Ownership and unchanged behavior

`src/engine/postFrameAccounting.ts` wraps the existing complete `post.render`
transaction. It retains one readonly-view receipt in place, with explicit
`last-completed-post-frame` scope and a monotonically increasing completion
serial. Before the first success the receipt is null. Skipped or failed renders
retain the last successful receipt; individual warm/debug pass renders do not
replace it. Consumers needing a historical record must copy this borrowed view.

With native automatic resets enabled, the owner resets counters once before the
whole transaction and restores the original flag in `finally`. When an external
probe already disabled automatic resets, it computes deltas without clearing
the probe's accumulated work. Native `info.render.frame` increments are
unchanged; resetting counters does not reset this cache epoch. No shaders,
passes, geometry, quality policy, cadence, or GPU resource ownership change.

The lazy HUD receives the explicit post receipt provider. It shows unavailable
draw totals before completion, labels the last frame's all-pass totals, and
exports the receipt scope and serial. Program/geometry/texture residency counts
remain separate native renderer statistics.

The resource probe additionally starts an explicit sample epoch at its existing
phase-history reset boundary and requires a completed receipt from that sample
and phase. It no longer substitutes raw final-pass counters or accepts a prior
Battle/previous-Garage receipt when Garage produced no fresh completed frame.
The existing numerical resource thresholds, waits, and cadence rules are
unchanged; no additional render is forced to make a sample pass.

These receipts measure submitted scene, shadow, and post work inside complete
application transactions. They do not acknowledge GPU completion or display
presentation, and exclude offscreen draws outside the transaction.

## Focused validation

The focused checks are CPU-only and use the actual production owners:

- `postFrameAccounting.selftest.mjs`: real pinned Three composer, fullscreen
  passes, geometry and counter owner; actual application frame-boundary source;
  final-pass negative control; total primitives; external counter accumulation;
  native cache epochs; first/later failure, recovery, context info replacement,
  and one retained receipt across skipped or outside renders.
- `perfHud.selftest.mjs`: actual HUD and accounting owner; unavailable state,
  displayed all-pass totals, exported scope/serial, no raw-counter fallback,
  and preserved residency statistics and existing update/visibility behavior.
- `phase-resource-frame-accounting.selftest.mjs`: actual installed probe owner
  and snapshot/gate consumers; fresh/missing/stale/mismatched-phase receipts,
  complete multipass counters, shadow attribution, and failure cleanup.

The production-source execution in these selftests is narrowly bounded to
repository-owned functions so the checks cover actual wiring without launching
a browser. Static Doctor warnings about source execution are this intentional
test technique, not production dynamic evaluation. Focused command results and
integrated/native evidence are recorded below after execution.

### Pre-landing results (2026-09-10)

- Seven focused accounting/post/HUD checks passed, including the negative
  control that reproduces the old one-call/one-triangle reading.
- The combined thirteen-check loading/accounting batch passed. Its first
  typecheck caught the omitted `PostRuntime.lastCompletedFrame` declaration;
  adding the public typed contract resolved it. The repeated accounting/HUD/
  probe checks, full typecheck, public build, and whitespace check passed.
- The complete staged Doctor scan inspected twelve files and returned 49/100:
  two dynamic-source-execution errors in the CPU-only accounting selftest and
  one separate-mesh warning in the FX readiness selftest. The executed strings
  come only from repository-owned production source and pinned Three.js source,
  never user/network input. The separate meshes are independent warm-cohort
  positive controls. These findings were reviewed without rule suppression;
  the scan is not described as green or as a runtime performance score.
- Local raw evidence is retained in
  `.local-evidence/post-frame-accounting-focused-r2.log`,
  `.local-evidence/loading-accounting-integrated-r2.log`,
  `.local-evidence/loading-accounting-type-build-r3.log`, and
  `.local-evidence/loading-accounting-doctor-staged.log` (not release assets).

This validates counter ownership and loading recovery, not sustained frame
budgets. Fresh production rendering and transition evidence is still required;
the historical 214–319 ms stalls are not claimed fixed by this accounting change.
