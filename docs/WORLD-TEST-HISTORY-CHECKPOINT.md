# Published environment regression checks

Test-only checkpoints `3fa2e9783`, `e81a26a9c`, `9a838226d` repair stale
fixtures and extracted closure dependencies after already-published environment
changes. No game runtime, original pixel digest, performance threshold or
resource budget is changed by these commits.

- Polders intentionally gained bank soil and irregular basins; Oasis gained a
  single authored contour; Reservoir's roads and apron changed. Exact historical
  inputs still reproduce all original shore-mask RGBA digests. Current maps
  receive separate physical water, dry-route, soil and resource checks.
- Mangrove's palette test retains its original `b66d67…` other-map digest and
  `ca35068…` non-palette digest using authenticated historical configs. Verdant's
  restored horizon has an explicit current-input guard and mutation negative;
  historical substitution cannot conceal a change to that restoration.
- Logging-yard, grass, wall and destruction harnesses now supply real imported
  dependencies from their extracted production closures. Existing geometry,
  collision, seeded RNG, reset and disposal checks remain.
- The texture-row test executes both real public props wrappers instead of
  counting an obsolete variable declaration. Native painter bytes, row budgets,
  RNG, owner publication and cancellation checks remain; four wrapper mutations
  are rejected.

Verification: all eight integration checks in `world-history-integration-r1.json`
pass, including original Verdant and current night-light integration. The
shore/palette pair passes on the supplemental source, including six native
Canvas sea bakes. The props row native Canvas test and integrated props
scheduling/resource checks pass. These focused results do not relabel the
separate full fleet release as passed; its owner must rerun that gate.

External evidence root:
`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/`.

- `world-test-history-repair-20260908.dzjNMK/RECEIPT.md`: original failures,
  authenticated Git inputs, unchanged golden values and first repair checks.
- `world-history-verdant-followup-r1.nhfJmc/REVIEW.md`: current-main Verdant
  supplement, exact runtime inventory and shore/native-palette logs.
- `world-history-integration-r1.json` and adjacent full logs: final integrated
  environment, channel, yard, destruction, wall, Verdant and night checks.
