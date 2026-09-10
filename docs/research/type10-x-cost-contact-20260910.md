# Type 10 X — efficient closed skirts and mounted return rollers

Status: **release PASS; wider-track redesign remains open**.
Base: `85aa9224a`. Worktree: `/private/tmp/cot-japan-running-gear.PUiEBf`.
Original source checkpoint: `a57476e9a`; rebased source: `4d0ab00b1`.
Rebased selected assets: `cf1454da0`; integration base: `d06a0ef56`.

## Actual change

Only `type10_x` changes. Its ten fixed folded skirts already carried hull
camouflage in published `4aa008627`; this does not repaint them again.
Replace uniform 49-section sheets with 13–20 stations at the authored bends,
with extra subdivisions where diagonal interpolation needs them. Keep the
inner skin, thickness, end caps, outer extrema, gaps and attachment crowns.
Actual sheet triangles fall **9,760 → 3,120** (6,640 fewer; 68% reduction).
This is a part-level count, not a whole-tank reduction or tank-switch timing.

The instance-expanded, visible, LOD-selected whole-model census measures HIGH
**76,990 → 70,542** triangles and LOW **72,430 → 65,886**, including the six
new supports below. With `batchStatic:false`, visible mesh counts are 41 → 44
and 39 → 42 respectively. These are scene counts, not measured GPU submissions
or proof of lower switching latency. There is still substantial running-gear
cost to address.

The three existing return rollers on each side retain their radius, axes,
articulation, materials and tread course. Six shared spindle primitives now
join their hubs to the actual narrow lower hull. Native surface rays check
positive hull and hub overlap on both sides at three yaw poses, plus air
beside each shaft. HIGH adds 192 support triangles; LOW adds 96.

Road wheels remain on the shared flanged-twelve structural wheel builder.
Their painted dishes already stand outside the rubber faces. Wheel positions,
radius, tires, tracks, turret, gun, armor metadata and accessory colors are
unchanged. Track gauge and the broader running-gear budget remain open.

## Evidence and honest limits

- Closed-stock regression checks every welded edge has two opposite incident
  triangles and rejects degenerate faces. HIGH/LOW source surface, thin inner
  skin, real aperture, U-strap and fascia contact tests pass.
- Historical full-source and full-native hashes remain unchanged. Explicit
  test-only inverses reconstruct only the prior sheet stations, the prior
  fixed-panel finish and the missing six supports. Actual current geometry
  still runs all physical armor, source-air and projectile checks.
- The unchanged auxiliary-armor gate checks 2,320 independent native rays per
  quality; maximum transverse error is 2.3023 mm, below its existing 3 mm
  limit. No threshold or reference geometry changed.
- Early strict source-shape preflight: 93.6/92. Final composed validation is
  recorded in `.qa-dev/type10-release-NwGauA/receipt.json`; do not equate the
  early shape result with full release completion.
- The complete official release also passed source fidelity (95.3),
  centering, calibrated module alignment and module hits (nine modules,
  two track sides, no failures or outside-envelope results). All **955**
  lifecycle checks passed uninterrupted: 302 pre, 614 core and 39 post,
  followed by the private build and the separate public build.
- Fresh initial standard native views are byte-identical to the previously
  published Type 10 paint checkpoint's four views. The new run's final views
  are separately captured under the release directory. Source GLB SHA-256:
  `fb6c2aa30119ac45b49fdfb7393a13760109ce4c9cc3f6244e579eb4944879fe`.
  It remains ignored, local and comparison-only.
- Baseline read-only Doctor: 43/100, 853 repository-wide findings. This is not
  evidence of a new Type 10 defect, nor authority to change unrelated code.
- Changed-file read-only Doctor: six files scanned, no issues, 92/100. Its
  scope differs from the repository-wide baseline; these scores are not an
  apples-to-apples quality improvement measurement.
- Final standard native angle/front/side/top views inspected: armor and fixed
  skirts remain camouflaged, glass stays glass, the lower wheel faces remain
  visible, and the reduced sheet tessellation introduces no visible open edge
  in these views. Hidden roller engagement is verified by the physical tests,
  not inferred from the closed-skirt screenshots.

Earlier local diagnostic failures remain saved: one inferred literal-array
type needed an explicit `number[]` annotation; an uncommitted release driver
initially named a nonexistent `wheelPatterns.selftest.mjs`. Corrected final
execution completed uninterrupted; failed prefixes are not combined into
an npm pass. The first post-rebase diagnostic driver misspelled two test
filenames; its failed result remains separate from the complete corrected run.

## Integration verification

The 17 upstream commits through `d06a0ef56` changed no vehicle source or assets.
After rebase, all seven frozen Type 10 source/test SHA-256 values still match
the complete release receipt. Twelve focused checks cover the changed frame
scheduler, sky cache, bridge, world scheduling, terrain fields, action timing,
frame trace and test/release scheduling. All twelve passed, followed by fresh typecheck,
selected Type 10 asset validation, private build and public build.
The complete original release is `.qa-dev/type10-release-NwGauA/receipt.json`;
the final integration receipt is `.qa-dev/type10-integration-dm4PlG/receipt.json`.
The first push safely refused a concurrent main advance; the final integration
additionally verifies its sky-cache change. The rebased tree has 957 registered
tests; this record does not claim a second uninterrupted 957-test invocation.
Native geometry, armor/ballistics checks,
full anatomy and the original uninterrupted 955-test release remain tied to
their unchanged frozen inputs.

## Release policy

Use one full release on the frozen composed candidate after cheap contact,
source, type and primitive checks. The existing four-worker selftest runner
preserves test isolation; browser stages retain the shared FIFO capture lease.
Regenerate full-fleet anatomy as required, but publish only selected Type 10
assets and genuinely changed generated receipts. Source models, scratch native
images and temporary release drivers are excluded from commits.
