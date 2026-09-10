# Self-test release throughput — 2026-09-10

## Bounded CPU scheduling (opt-in checkpoint)

`COT_SELFTEST_WORKERS=2 npm test` admits at most two top-level CPU test files
at once. The default remains one worker until a complete real two-worker
qualification establishes parity. Every lifecycle entry still runs in its own
fresh Node process; neither results nor module instances are reused. This is
an optional scheduling change, not a skip-tests or relaxed-gate path.

`tools/selftest-cpu-pool.mjs` shares the runner's ordinary capture lease between
those two children. Browser-owned-lease tests are exclusive barriers. After
45 seconds it stops admission, drains active children and rejoins the FIFO.
The first observed failure stops admission; already launched peers are drained
and the earliest failed registry entry supplies the deterministic exit status.
Persistent signal handlers survive repeated/mixed cancellation until each
child closes. Log totals distinguish wall elapsed time, summed child time
(which can overlap), and runner FIFO wait.

`tools/selftest-cpu-pool.selftest.mjs` covers exact coverage, browser exclusion,
FIFO boundaries, heartbeat cleanup, invalid options, spawn/observer failures,
both failure orders, repeated/mixed signals with two and then one live child,
and actual fresh-process overlap using a two-process rendezvous. The existing
sequential runner and registry guards also pass. Independent static review
found no concrete same-file/port collision among the inspected fixtures, but
does not certify every indirect side effect or peak fleet-test memory use.
Full two-worker qualification and end-to-end speed measurement remain pending;
do not describe these focused controls as a complete `npm test` pass.

One matched six-file real sample (four T-90 X fitting checks and two crop/color
checks) passed sequentially and with two workers. Sequential elapsed was
54.156 s, including 44.415 s runner FIFO; two-worker elapsed was 72.137 s,
including 67.162 s FIFO. Excluding that explicitly measured queue wait, occupied
time was 9.741 s versus 4.975 s. This single sample demonstrates useful overlap,
not a fleet-wide speedup certificate: total elapsed was worse in this acquisition
because it waited longer for other resource owners. Keep the ordinary FIFO and
report both costs. Local raw receipt: `.qa-dev/cpu-pool-receipt.json`.

The concurrent *sequential* three-tank release snapshot after 417 completed
checks recorded 1,606.917 s child execution and 782.803 s runner FIFO wait.
Five full-fleet checks alone took 688.585 s: machine-gun attachment 141.995 s,
wheel quality 139.590 s, ERA gameplay registration 137.736 s, lazy fleet
registration 136.649 s, and selectable surface markup 132.615 s. These are
observed partial-run costs, not final totals. They explain the long pauses
without treating them as stalled processes. The pending fourteen-tank recovery
must use one composed batch release, not fourteen full `npm test` repetitions.
Keep every per-tank geometric/visual gate; do not merge interrupted test prefixes
and label them a successful full-suite invocation.

Final focused qualification: ten real checks passed through two-worker
scheduling; both changed runner modules passed the strict complexity gate
(23 functions, zero violations); TypeScript/core-unused checks passed; scoped
Doctor analyzed all four changed tool modules with zero errors or warnings.
Independent review accepted cancellation ownership and the extracted admission
loop. This is the initial opt-in release boundary, not full-fleet parallel parity.

Integration with `40e60226b` also registers its new
`tools/late-fx-matrix.browser.selftest.mjs` as an exclusive, self-owned-lease
browser test. Without this registration, either runner would retain the outer
lease while the child waited for that same FIFO. Default and two-worker tests
cover the real entry and reject the old missing-entry configuration. The native
pixel assertions are unchanged; the engine checkpoint owns their passing
twelve-case receipt.

The historical sequential checkpoint below remains unchanged.

This tooling checkpoint changes no playable geometry, quality threshold or
release gate. It addresses avoidable work in the existing 889-check suite.

- Removed 36 static/dynamic imports that executed another self-test inside a
  test. Every imported check already has its own lifecycle entry. Expensive
  examples included full fleet-floor clearance, camouflage and running gear.
- The registry guard now parses tests with the pinned TypeScript AST, rejects
  nested self-test imports and retains its exact-one-owner/full-discovery checks.
- Each check still executes in a fresh Node process. Node's source-validated
  compilation cache is reused; results and module instances are never cached.
  Explicit cache settings, opt-outs and coverage environments are respected.
- Logs distinguish child execution from runner FIFO wait. Browser-owned queue
  wait remains explicitly included in that child's time. Sequential execution,
  fail-fast, signals, heartbeat and bounded 45-second FIFO batches are unchanged.
- AI's accidental dependency on another test registering vehicle specs was
  replaced with the actual production registry import.
- Two stale loading guards now assert the current explicit `covered-battle`
  atmosphere, while still requiring deferred precompile/world services.

Validation: all 31 changed self-tests passed through the real bounded runner,
including the 181-tank asset check. Registry: 889 checks. Runner regressions
prove actual fresh child execution, changed-source failure despite a warm cache,
timing attribution, signal/failure cleanup and queue ownership. Changed runner
complexity gate: 13 functions, zero violations. `git diff --check` passed.

No full-suite speedup percentage or complete fleet release is claimed. The
separate Type 10 release passed its geometry stages and pre suite but stopped
in `villageWear.selftest.mjs`'s unrelated frozen parent-config assertion. This
checkpoint neither deletes that check nor turns that failure into a pass.
Reducing full-suite repetition per tank remains a separate release-cadence
decision; these optimizations do not implement a skip-tests path.

## Separate repair of the observed terrain release blocker

The frozen village-wear config digest predates three published prop fields:
Ironworks' palette (`0823acd74`) and Autumn/Delta crop identity (`3bfd72f90`).
Removing exactly those fields from the historical comparison reproduces the
original digest byte-for-byte. The test now also checks their current values,
including adversarial mutations, so the historical projection cannot hide
future changes. No production maps, frozen digests or pixel expectations were
changed. The complete village-wear test passed: all 28 non-pilot masks at both
resolutions, both pilots across three seeds, protected channels, activity
coverage, field equivalence and existing negative controls. This fixes that
specific blocker; it does not certify the rest of the interrupted release.
