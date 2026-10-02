# PR #9 vehicle integration

This integration starts at main `689b7ad69616ac543c720617e5bee03b9c9d4818`
and selectively adapts [PR #9](https://github.com/Kevin-Liu-01/Claude-of-Tanks/pull/9),
pinned at `5c99a4ebf9c57b2439defffc53ec97eb91464bd2`.
It retains the current 219 playable vehicles, including all 14 national concepts.
It does not include PR commit `03d04c9e2` (balance cohorts and T-62 exemption),
the older paint catalog, or unrelated world and infrastructure cleanup.

## Changes

- Carry over the regenerated Jagdpanzer E100 interior fill, remove obsolete
  T-62MV-1 skirt hit planes, and count an articulated roof gun once rather
  than counting both its mount and physical gun.
- Remove superseded builders and unused vehicle declarations. The active
  procedural profiles remain the sole owners of their vehicle geometry.
- Register fleet metadata through one ordered module. Player, host authority,
  and tools read equivalent finalized specs; authority boot loads only the
  roster's required combat-anatomy groups, without importing vehicle builders.
- Replace historical source/geometry digests with live physical checks and a
  single reviewable HIGH/LOW geometry ledger. Independent dimensions, contact,
  articulation, armor traces, and negative controls remain in the receipts.
- Consolidate compatible fleet audits into HIGH, LOW, and default passes.
  Extend the PR's mutation guard to material properties, texture bindings and
  transforms, shader hooks, and semantic metadata, with failing-mutation and
  restored-state controls. A failing audit still fails the complete pass.
- Generate a compact roof-gun table from the current controls inventory, and
  share numerical/geometry assertion helpers without changing tolerances.
- Include vehicle runtime modules in the unused-declaration check.

Adapted PR commits: `514aeaf92`, `a7496427e`, `644bb4eb8`, `8cb3ca681`,
`83f2c6992`, `7a781e0a7`, `ed655f9de`, `cd3ca4245`, `2360e9cd7`,
`0010b8561`, `bfa8801e6`, `fa3da3ced`, `ebf3de1c3`, `d58e3204d`,
`9746573d8`, `7323c611a`, `3de11b4d8`, `12f6209b0`, `5f5d827e4`,
`7048acda0`, `c3d1287ec`, and `2de33f7d0`. Paths and overlapping hunks were
adapted to current main; this is not a whole-PR merge.

## Measured evidence

The pre-integration ledger was measured on `a8eacf16c`, whose vehicle sources
are identical to the integration base. Comparing that immutable baseline
with the integrated candidate yields **438 matching rows out of 438**
(219 vehicles × HIGH/LOW). The digest covers visible mesh geometry, rig
transforms, material scalars, and instances. Generated interior fills and
texture pixels are excluded; their physical/appearance checks remain separate.
This proves preservation of the measured models, not a performance gain.

Typecheck (including vehicle unused-declaration enforcement), suite discovery
(1,240 ordered checks), runner/cache/helper regressions, mutation-guard
negative controls, and ledger negative controls pass. The roof table matches
all 60 roof guns in the current inventory.

Full fleet parity, the consolidated fleet audits, controls/anatomy generation,
the complete suite, build, and targeted release checks are still pending.
No new publication waiver is inferred from the earlier `a8eacf16c` waiver.
The previous complete `a8eacf16c` suite finished 1,242 checks with 72 failures;
balance and unrelated world/multiplayer failures remain separate from this
vehicle cleanup.

Local command logs, the baseline, comparison, and run reports are retained in
`.qa-dev/pr9-integration/` in the isolated integration worktree. Update this
section with final results before publication.
