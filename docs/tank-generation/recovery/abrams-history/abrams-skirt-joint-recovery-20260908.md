# Abrams X aft skirt witness recovery — 2026-09-08

**Focused tests PASS; not a fleet release. Runtime geometry unchanged.**

The interrupted lifecycle check 134 expected permanent upper-joint stock at
local `(-1.85, .90, -2.635)` on M1A1 X. This contradicted the existing source20
lower wheel-view relief, which the independent shoulder-closure test preserves
at `y=.903945, z=-2.642035`. The owner explicitly chose upper-gap closure with
lower road wheels still visible.

The actual finite carrier's lower edge interpolates to `y=.9147337` at
`z=-2.635`. Bilateral emitted-geometry FrontSide rays at `.90` therefore miss,
while rays at `1.00` hit the outward `hullTrackGuardL/R` face at `x=±1.825`.
This was not a missing material bucket, flipped normal or absent upper sheet.

Only `src/vehicles/abramsSourceXSkirtArmor.selftest.mjs` changed:

- Move that one aft positive witness to fixed `y=1.00`, consistent with the
  separately specified upper shoulder-closure station; every other joint stays
  at its original `.90` height.
- Retain the original `.90, -2.635` witness as an explicit negative stock and
  armor check, and add the independent source20 `.903945, -2.642035` negative.
- Preserve all sheet positions, sub-micron contact tolerances, armor values,
  original donor guards, finalized-layer checks and intact/spent/reset flows.

## Frozen proof

Local ignored receipt:
`.qa-dev/reports/abrams-skirt-joint-recovery-bKf7T9/receipt.json`.
Finished `2026-09-08T17:00:12.028Z`.

The source, tools/configuration and complete `node_modules` directory were
copied to an independent snapshot; no linked shared dependency/cache exemption
was used. All 18,675 inputs matched before/after copying and remained unchanged
through both queued tests. Manifest SHA-256:
`c7868f2b3b93d67f66d90a32d1d3bf3b68b8fcd1c06055814cac763d487f4e4c`.

| Test | Result |
| --- | --- |
| `abramsSourceXSkirtArmor.selftest.mjs` | PASS: all seven variants in HIGH/LOW, 14 actual native builds, 42 poses, 1,860 positive contacts, 1,260 negative/receiving checks, 432 seams, 24 spent/reset flows. Maximum native/source error `6.242370625182621e-8 m`. |
| `abramsSourceXShoulderClosure.selftest.mjs` | PASS unchanged: 14 actual native builds, 196 original gap counterexamples, 420 receiving contacts, 196 preserved-air checks. |

The skirt run also retained 24 finalized-flow checks, 24 old Cartesian-layer
counterexamples and 384 bank faces, without mutating the original donors or
live finalized armor metadata. Both tests exited zero. This resolves the
specific contradictory witness; it does not certify other fleet gaps,
performance, historical equipment bridges or the interrupted 843-check suite.

