# River reed contact candidate — local, art unreviewed

Base: published `1db45b0adf445d83deda74fe04b161d9d970161c`.
Only `mapKits.ts:reedClump` and its `addRiverBankReeds` argument seam change.
River reeds reuse the unchanged winter tapered-stem builder. Each existing
stem is planted 0.06m into its own terrain bed; the existing occasional head
attaches to the first emitted stem tip. Winter callers/output remain unchanged.
No clumps/root XZ draws, collision records, map shapes, palettes, material or
texture families are added or relocated. Saltwind's no-reeds policy remains.

## Measured scope

First normal FIFO packet: session67678, wrapper10851, worker27182, all terminal.
Evidence: `/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/river-reed-contact-r1.Dzj7Sk/`.
`report.json` retains commands/source hashes and identical before/after pins.
`river.log` records actual three-map geometry, exact RNG/placement/collision
and other-bucket comparisons; `inventory.json` contains every baseline/current
row from the three historical suites' separate diagnostic continuations.

| Seed1337 kit | Existing reed pieces | Premerge bytes, whole kit, before → after |
| --- | ---: | ---: |
| Autumn | 1,644 | 1,398,600 → 872,520 |
| Delta | 859 | 745,920 → 471,040 |
| Mangrove | 85 | 131,880 → 104,680 |

Pieces include occasional heads. Each still has12 triangles. Primitive
position/normal/UV/index storage decreases320B per piece (24→14 vertices),
but explicit Three nonindexed expansion preserves36 vertices/1,152 attribute
bytes per piece. **Final GPU bytes are unchanged, not reduced.** This expansion
model is not a claim that the entire production-world owner was captured.
Construction adds7–13 bed queries per clump (old1, new8–14); no timing,
retained-heap, GPU-performance or native visual acceptance claim is made.

## Checks and retained failures

- Focused source-executed geometry/RNG/bucket test PASS, including actual
  old-box, clump-center-bed and detached-head negative controls.
- Native TypeScript7 and strict changed runtime/test quality PASS
  (95functions; zero complexity/explicit-any/unknown violations).
- Doctor exits0; two test-only bounded three-map array-lookup warnings remain.
- Published1db already fails winter's nonwinter aggregate and Coastal's
  nonboat aggregate; its landing test passes. Candidate keeps those failures
  and adds the intended Mangrove reed-byte aggregate mismatch.
- Original assertions/goldens are untouched. Separate diagnostic continuations
  record mismatches instead of stopping only at those aggregates; all other
  physical/structural checks complete. Those continuations are NOT suite passes.
  Their all30×3 kit rows differ from1db only on Autumn/Delta/Mangrove.
- After this packet, only the focused test's brittle source-spelling assertion
  for bucket expansion was removed at review request. Geometry calculations
  remain unchanged; final test-only revision awaits its narrow rerun with the
  next approved batch. Runtime hash remains
  `d35667abf83d7b0a531e934e6d8572bfd6bee0f9df06af694c102d102e0a3481`.

## Next bounded visual comparison — prepared, not acquired

Use the same production preview/quality/cameras on1db and the candidate.
Suggested seed1337 root anchors already emitted by the actual kit:
Autumn `[-432.6583023,1.59687793,-192.6928101]`,
Delta `[-298.1047897,2.90088367,-328.1619797]`.
Prepare low near-bank views focused roughly0.8m above those roots and a
context view along the corresponding authored river reach. These are candidate
bank locations, not yet slope/visibility-certified camera receipts: verify the
actual local bed relief/occlusion once during approved capture preparation and
save fixed absolute poses before either build is viewed. No camera sweep,
extra plants or exclusion of a failed contact view is authorized by this note.
Inspect every visible root/head, remaining underwater stems, thin-stem aliasing
and mid-distance legibility. Existing per-disc clump distribution is unchanged;
this is not a union-shore relocation or whole-wetland composition improvement.
No native/build/collision/minimap acquisition has been performed for this candidate.
