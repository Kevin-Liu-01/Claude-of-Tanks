# Self-test release throughput — 2026-09-10

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
