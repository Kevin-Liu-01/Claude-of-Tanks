# Self-test release throughput — 2026-09-10

## Qualified bounded pool is now the default

Ordinary `npm test` now uses `min(4, os.availableParallelism())` fresh CPU
workers instead of silently falling back to serial execution. One-, two- and
three-CPU hosts retain that smaller width. Explicit `COT_SELFTEST_WORKERS=1`
still selects serial debugging, and existing integer overrides 1–4 remain
supported. The suite catalog, assertions, fail-fast/drain behavior, compilation
cache, FIFO fairness and exclusive browser barriers do not change.

This promotes the already-qualified pool described below; it does not invent
a new scheduler or skip a release. The complete 933-entry four-worker release
and subsequent 947-entry grouped-order release are the retained qualification.
The small default-selection change has focused regressions for host widths,
overrides and invalid inputs, alongside the existing real-process overlap,
failure/signal/drain, exact catalog discovery and release-composition checks.
No full-suite speedup percentage is claimed: queue contention and the work
remaining in each checkpoint still affect elapsed time. The historical
opt-in-only descriptions below record earlier stages, not current defaults.

## Group whole-fleet CPU scans before the bounded drain

The 935-entry Merkava release at `99be9953c` records eleven independent
whole-fleet scans taking roughly 135–144 seconds each. Scattering them among
short tests leaves occupied batches waiting on one long child after the
45-second admission deadline. The catalog now groups four such checks at the
start of `pre`, six at the start of `core`, and the one long `post` check first.
No check moves between lifecycle phases; the remaining order is unchanged.
All checks still run exactly once in fresh processes. Worker limits, browser
barriers, lease draining, failure handling and every existing assertion stay
unchanged. The catalog regression protects the grouped entries as well as
complete exact-once discovery. This is scheduling work, not a skip-tests path.
The complete T-14 release at `f33618e06` qualifies the changed order with all
947 entries passing in one uninterrupted lifecycle: 301 pre / 608 core / 38 post.
Phase times were 560.249 / 718.733 / 145.728 seconds, totaling 23m44.710s;
232.649 seconds were explicitly measured runner FIFO wait. Summed overlapping
child time was 3,525.876 seconds. See the
[frozen qualification](t14-roller-release-20260910.md). No matched full-suite
speedup percentage is claimed from earlier, differently scoped runs.

## Four-worker extension (opt-in, no gate removals)

The fourteen-tank frozen-tree release now supplies full real qualification:
all **933 entries passed** in one uninterrupted four-worker npm lifecycle,
followed by private/public builds and type checks. See
[`fourteen-tank-recovery-release-20260910.md`](fourteen-tank-recovery-release-20260910.md)
for the exact candidate and retained receipts. Earlier focused-only and failed
qualification statements below are historical, not the latest release status.

Measured runner totals were 2,076.064 s elapsed (34m36s), 3,424.949 s summed
child execution, and 658.201 s explicitly measured runner FIFO wait (10m58s).
Child times overlap; browser-owned waiting remains inside those child times.
The complete twelve-stage tank release took 42m15s. There is no matched full
sequential run on this exact tree, so these numbers do not establish a speedup
percentage. Queue contention is a material part of the delay, not a failed or
cancelled check. Coordinate optional work and use one composed release for a
verified batch instead of repeating the whole suite per tank.

At this opt-in checkpoint, `COT_SELFTEST_WORKERS=4 npm test` allowed up to four
fresh CPU children; integer widths 1–4 were supported and the default was **1**. The machine
used for this recovery has 18 physical CPU cores and 128 GiB RAM. Browser
checks still run alone, every assertion still executes, and the 45-second
admission window still drains live children before rejoining the shared FIFO.
There is no result cache or new skip-tests path.

Expanded regressions pass at widths 3/4 for exact admission, exclusive browser
barriers, earliest-registry failure status, observer-error drain, FIFO requeue,
and repeated/mixed signals. A real fresh-process rendezvous requires all 2,
3, or 4 children to overlap and records distinct process IDs. All 930 catalog
entries remain discoverable. Independent static review found no blocker.

The same eight-file sample passed at both widths: two-worker elapsed
5.683 s (0.00045 s FIFO), four-worker elapsed 5.514 s (2.514 s FIFO).
Occupied time excluding explicitly measured queue wait was 5.683 versus
2.999 s. This is one small matched sample, not a full-suite speed guarantee;
it is not randomized and source compilation/OS caches are unspecified.
Receipt: `.qa-dev/throughput-Jo4TmQ/receipt.json` (local, not shipped).
Both runner modules pass strict metrics: 23 functions, zero complexity or
explicit-type violations. Typecheck/core-unused and scoped Doctor pass;
Doctor reports zero new findings. The focused tooling check itself does not
certify the complete suite; the subsequent composed release above does.

The sections below retain the original two-worker/sequential evidence.

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
