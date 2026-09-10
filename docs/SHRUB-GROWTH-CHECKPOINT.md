# Folded shrub clusters — shape checkpoint

Sixteen convex clusters replace the previous 32 crossed flat sprays. Each
cluster has two wings and an outward crease, with one continuous atlas across
four triangles. Four lower branches are seated from their actual lowest
corner; eight overlapping clusters fill the body; four upper clusters arch
over it instead of repeating the upright skirt as tall blades.

Each of the two prototypes still uses 64 triangles, 192 nonindexed vertices
and 9,216 bytes across its five vertex attributes. The same 176 random draws
are consumed. No new texture, material, instance or per-frame code is added;
changed screen coverage can still change fragment cost.
World placement and spotting concealment remain separate from visual shape.

## Verification

Evidence root:
`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/`.

- `shrub-growth-checks-r3b.GHIXbL/report.json`: all 18 stage exits pass,
  including 60 map-palette/prototype cases, folded winding/UV/fold/ground
  negative controls, complete Autumn/Verdant producer parity, near/far and
  resource contracts, map integration, full TS7, strict function metrics,
  diff and public build. Doctor records one test-only chained-iteration
  warning; its single-loop cleanup requires the final release recheck.
- Complete producer comparisons cover 986 Autumn and 1,051 Verdant shrubs.
  Every placement/instance-color/fade/LOD buffer, concealment disc, seeded
  stream and non-bush geometry remains exact against the pinned predecessor.
  All 2,037 shrubs have at least one emitted vertex at/below terrain.
  This is an envelope check, not proof of opaque-leaf contact on every slope.
- Matched native candidate packet: `shrub-growth-native-r3.Aa2Til`.
  All four originals were visually reviewed: Autumn front/reverse and Verdant
  near/far. The crown reads as a fuller, rounded shrub without the earlier
  floating rim. Accepted as an incremental shape improvement. Coarse folded
  panels, thin edges and very dark rear faces remain; this is not full foliage
  realism or whole-biome art acceptance.
- All four native resource comparisons pass. Only the two bush prototypes'
  position/normal/color/UV bytes and derived bounds differ. Atlas base/mips,
  other geometry, instance buffers, material settings/keys, storage ownership,
  renderer resource counts and 120-frame draw/triangle submissions remain
  exact. The immutable baseline's poses, originals and inventories were
  authenticated and reused; they were not recaptured.
- Native submission-wall median/p95 milliseconds, baseline to candidate:
  Autumn 2.3/3.0 to 2.4/3.0; reverse 3.3/3.6 to 3.3/3.8; Verdant near 3.1/5.2
  to 2.8/3.2; far 4.2/4.5 to 4.4/4.7. Mixed, separate-context observations
  do not certify completed GPU cost or no performance regression. Natural
  readiness was 33.403/1.711/30.406/5.058 seconds: front/near still fail the
  prior 20-second acquisition check. This checkpoint does not accept startup
  performance. No physical-iPad, motion or long-run memory claim is made.

The first outward/up orientation trial was rejected as a floating saucer:
818/986 Autumn and 848/1,051 Verdant shrubs had every sampled vertex above
terrain. The second trial fixed that gap but still made pointed leaf-covered
blades. Both rejected runtime diffs and original images are retained in
`shrub-growth-native-r1.4eeB8U` and `shrub-growth-native-r2.VvPPZ8`; neither
was published. This candidate closes the upper crown as well as its base.

Tested world source SHA-256:
`51cb2a27da5e7ee4e7bdfbb0ee5ef1219914dd6e59db72197e93c49ea625c24d`.
Candidate public build index:
`bf26c74d72dce2633e215a2014cb7ddf51805e195149e8b328bb1d25c22fab06`.
Baseline: `cd62def6e`. Water/contact and rail-coal repairs remain separate
published checkpoints. This does not complete the broader environment pass.
