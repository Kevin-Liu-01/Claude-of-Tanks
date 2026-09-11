# Abrams fixed drive-surface construction

Draft on `codex/launch-abrams-construction-20260911`, based on
`31827ead9`. This is part of the fleet selection-performance work, not a
replacement for the outstanding SEP v2 source/track qualification.

## Problem and change

Every source-X Abrams construction recalculated the same two cone surfaces,
including iterative triangulation balancing, even after another family member
had built that quality. An attribution-only Node profile of 60 alternating
HIGH/LOW drive builds recorded 935 of 1777 samples in `balancePass`, another
196 in `balancedTriangles`, and 102 in `oppositeAngle`.

The draft memoizes the immutable numeric position template for each of the two
qualities. It creates a fresh geometry and all attributes on every call, in
the same allocation order. It retains no GPU resource, material, mutable
attribute or tank object. The first construction at each quality still computes
the original surface. Legacy stock uses the existing HIGH surface path.

This changes construction work only. Axles, track stock, drive-wheel shape,
topology, normal generation and material order are unchanged. No altered
silhouette or performance threshold is accepted by this draft.

## Verification and retained failures

- R1 CPU profile: `.qa-dev/launch/abrams-construction-r1/`.
- R4 exact comparison: six quality/legacy/revisit combinations preserve every
  drive attribute, index, group and draw range, with the same number of geometry
  allocations. All seven source-X Abrams at HIGH and LOW preserve the complete
  geometry scene, including transforms and instance attributes, against the
  unmodified source-frame worktree.
- Mutation/disposal test: corrupting a tank's geometry cannot change a live
  sibling or a later build; tested both qualities and legacy stock.
- Native TypeScript and core unused checks pass.
- The first two comparison harness attempts used the wrong `createTank`
  argument position and entered the canvas path. Both failures are retained.
  R4 uses the actual `null` engine context and third-argument options.
- All 28 affected family/gear tests pass, including source guide, end-wheel,
  wheel-quality and source-X construction checks. The private build is queued.
  Browser selection observations are pending; no browser speedup is claimed.
- R5 repeats the attribution profile on the candidate. The dominant balancing
  samples fall to 27 of 325, with seven in `balancedTriangles`; later calls
  spend their work constructing fresh attributes and remaining stock instead.
  These are sampled CPU-attribution results, not a controlled browser timing
  comparison or a first-construction speed claim.

The browser protocol uses actual country/card clicks in Garage and Gallery,
first visits, fleet eviction/revisits and warm alternation. It records long
tasks, frame gaps, available construction phase timings and readiness after
model/UI convergence and animation callbacks (plus a completed Garage post
frame). This is not physical display-presentation latency. Foreign CPU/GPU
activity remains a limitation; no favorable smoothness threshold is invented.
The initial browser wrapper stopped before acquisition on the incorrect
`challenger3` control identifier; R2 uses registered `challenger_3`.

Source models, temporary probes, build outputs and QA captures remain outside
the publication set. Nothing from this draft has been published.
