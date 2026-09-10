# T-14 X fitted-roller recovery — 2026-09-10

## Frozen release qualification

The complete release passed at `f33618e066d63236d658c735751ccccec7ba4b44`
on base `77639501dbb87399e3796f76b50edcf81c0c471e`. The local commits
`0a7543223`, `57bb259a1` and `f33618e06` contain the recovered fitting,
bounded test-order change and selected generated assets. Final-main integration
and publication are recorded separately below; this is not permission to replay
the older mixed K2/T-14 branch wholesale.

The fitting is recovered from `154ddf0cd` / `1b17c1eef` / `e81a12f16`, with a
fresh measured-clamp regression. K2 X remains outside this checkpoint: its
90.8137 source score still fails the unchanged 92-point floor.

## Physical and visual scope

- Four inferred stations per side, eight closed two-material rollers and eight
  finite painted hull spindles. The shared efficient primitive costs 160 HIGH /
  80 LOW triangles per complete assembly, or 1,280 / 640 for the eight assemblies.
- All original hull/turret/fitting emissions, road/end-wheel axes and the loaded
  lower course are preserved. The supported upper course restores Y 1.085 m.
- Nine native builds, 128 measured poses and three failing negative controls.
  Every road axle reaches the actual +0.30 / −0.22 m clamps. Conservative
  finite-road clearance is at least 22.7499 mm; continuous shoe clearance is
  at least 63 mm. Band-contact roundoff stays within the 2 µm tolerance.
- At 15 / 75 / 200 m and 27 phases, worst visible-support gaps are 0.770 mm
  HIGH and 3.067 mm LOW. The legacy LOW control still fails at 6.851 mm.
  Independent track-side spin, battle ownership and exactly-once disposal pass.
- Neutral and colored native turntable/source boards were inspected, including
  articulation strips. The hull recesses and turret negative space remain.
  Concealed rollers are counted/contact-tested in geometry, not guessed from
  an occluded screenshot. The four-per-side layout remains an inferred fit.

This is not completion of country-matched track thickness or the full 59-vehicle
style/performance contract. It does not modify K2 or the original playable T-14.

## Gates and retained evidence

Local receipts are retained under `.qa-dev/` and are not public source assets:

- `t14-recovery-preflight-NhQ9Ku/receipt.json`: eight focused tests, strict code
  metrics, source/geometry checks, types and scoped Doctor passed.
- `t14-recovery-assets-EMCF9S/receipt.json`: remains **FAIL**. Complete anatomy
  generation and selected images passed, but the old projection center failed
  the subsequent full anatomy check. This failure was not relabeled or spliced.
- `t14-presentation-sync-E3ZJnm/`: the maintained `--sync-assets --ids=t14_x`
  path verified saved hashes against fresh rendering, then corrected only the
  selected projection center Y from 1.8864 to 1.8885 m. Anchors, half-extents and
  every unselected record stayed unchanged. Centering/assets/order controls pass.
- `t14-recovery-release-5gBMkZ/receipt.json`: a fresh **complete** anatomy check,
  all twelve release stages, types, scoped Doctor and public build passed.
  The one uninterrupted npm lifecycle passed **947 files: 301 pre, 608 core,
  38 post**. Private build also passed. Doctor has zero errors and one low-risk
  test-only repeated-property-access warning, not a production-loop finding.

Strict raw geometry minimum is **94.86282807496896 / 92**; native source fidelity
is **97.0** rounded. Track/sweep intersections and continuity holes are zero.
Centering residual is 0.00 px, exported top residual 0.03 px. The selected module
probe has zero failures and outside-envelope hits; muzzle/circularity checks pass.
The full fleet module probe has zero failures and 83 retained dimension warnings.

Private comparison oracle SHA-256:
`48745114206a2123e687f75477526caac0ad3896bd677639f44995d44b97e769`.
It is a converted local oracle, distinct from the raw owner-file SHA in the
[source record](../references/tanks/t14_x.md). Neither file enters the game or commit.

## Test throughput

The unchanged four-worker policy now groups eleven long whole-fleet tests at
the start of their existing phases. Exact membership, phase ownership, remaining
order, fresh-process execution and browser barriers are retained. The full run
took 1,424.710 s (23m44.710s), including 232.649 s measured runner FIFO wait;
summed overlapping child time was 3,525.876 s. These are measured totals, not
a matched speedup percentage. No test, assertion or gate was removed.

## Final-main integration

Pending after the frozen release; the newer renderer checkpoint is integrated
with separately identified focused checks, without claiming those checks form
another complete npm lifecycle.
