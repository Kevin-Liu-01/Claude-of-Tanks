# Broadleaf branchlets — material checkpoint

The shared near-broadleaf atlas draws pointed leaves attached to 115 short
twigs. It replaces the rounded leaf daubs, dark backing discs and circular
hole punches. Smaller blades leave actual gaps between leaves while keeping
the original radial clump distribution, rather than drawing a whole-card fan.

This is a material change, not a new tree or shrub geometry system. Near oak,
poplar, willow, acacia and eucalyptus use it, including the shrubs sharing
those materials: 24 maps have affected tree species. Conifer, palm, birch/aspen,
grass and twig painters, far canopies, planting, concealment and collision
remain unchanged. The existing species palettes still determine biome color.

## Resource and code checks

- One existing species-owned texture: 512 square on desktop, 256 on mobile;
  unchanged straight-alpha upload, sRGB, anisotropy, mip generation and alpha
  cutoff. No new material, geometry, texture owner or per-frame work.
- The seeded stream through the last leaf is identical. Only the unused
  final 210 draws for the removed punches disappear; production atlas callers
  own isolated seeded streams, not a shared placement stream.
- `broadleafBranchlets.selftest.mjs` covers 122 paired native-Canvas cases
  across both tiers, nine seeds and all 24 maps' actual broadleaf palettes,
  plus 12 unchanged sibling-painter pairs. It tests actual transformed
  blade-to-twig attachment, retained footprint, alpha at reduced resolutions,
  deterministic pixels, ownership and sampling, with negative controls.
- The final CPU packet passes all 27 stages: related foliage, placement,
  map/gameplay integration and loading checks, test registry, strict changed
  function metrics, full TS7, Doctor (zero errors/warnings), diff and public
  build. No test thresholds were relaxed to accept the smaller blades.

The first candidate was rejected after native review: its 54% passing-alpha
coverage, versus the original 44%, made folded crowns read as continuous
painted skins despite better individual leaves. The revised blades cover
40.31% desktop / 40.02% mobile at seed 2052, retaining the full radial outline.
Its analytical 16px alpha coverage is 41.80%. These are Canvas/source-alpha
observations, not GPU mip readbacks or a guarantee about rendered cost.

## Evidence

Local evidence root:
`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/`.

- Rejected first candidate: `shrub-branch-atlas-native-r1.jYWOBu` contains
  all 12 before/after originals, complete inventories, raw normal and
  separately synchronized frame samples, and `rejected-runtime.patch`.
- The bounded three-size desktop/mobile comparison is retained in
  `branchlet-coverage-probe-r2.VXwKU7`; the selected 0.72 blade coefficients
  are implemented in the actual runtime, not a capture-only override.
- Passing final CPU/build packet: `broadleaf-branchlet-release-r2.uv1XqP`.
- Native revised candidate: `shrub-branch-atlas-native-r2.6cV4hq` authenticates
  and reuses the first packet's six unchanged baseline originals, exact
  cameras, source/build manifests and inventories. Its six new originals
  cover Autumn front/reverse, Verdant near/far, Coastal and Desert.

Runtime source SHA-256:
`0df30028abf00c0dff4423b6018bdf569e528229034743c29aa8d6cd3e8bceaf`.
Public build index:
`7ddd332dcd7d4289817a3acbee51cc8baf1e9826e93c54944e07e9993b3c8a7f`.

## Native review and limits

All six pairs were visually reviewed by the primary agent and an independent
reviewer. Accepted as a modest shared-material improvement: finer leaf
separation, less dark-edged daub pattern and reopened gaps, without new large
crown holes or exposed bare limbs. Verdant's distant silhouettes stay coherent;
Coastal is primarily an unchanged conifer control, while Desert covers small
broadleaf crowns beneath unchanged palms. Pale planar crown patches, folded
egg-like shrubs and dark rear faces remain. This is not foliage-form completion.

All six native inventory comparisons pass with zero observed storage deltas.
Geometry, instance arrays, materials, texture sizes and sampling, shader keys,
renderer resource counts, and 120 normal foliage submission rows stay exact.
Only the authenticated broadleaf source pixels differ. This establishes the
inspected resource boundary, not whole-device heap/GPU-memory certification.

Separate 120-frame synchronized render medians, baseline to candidate in ms:
Autumn front 2.2 to 2.1, reverse 3.3 to 3.3; Verdant near 2.8 to 2.7,
far 4.25 to 4.2; Coastal 2.3 to 2.2; Desert 2.0 to 1.9. The maintained sampler
uses `gl.finish()`: CPU-plus-GPU serialized throughput, not pure GPU time or
native FPS. These noncontemporaneous samples show no consistent increase;
normal submission/cadence tails remain mixed and all raw outliers are kept.
No blanket no-regression claim is made. Natural grass readiness still exceeds
the prior 20-second acquisition cap in Autumn, Verdant near and Coastal;
the unchanged 90-second settled-art cap passed. This is not startup clearance,
motion/LOD-transition or physical-iPad certification.

The larger environment pass remains incomplete. The remaining folded canopy
form requires geometry work; repeatedly enlarging this atlas's leaf coverage
does not solve it. Water/contact and rail-coal fixes remain separate published
checkpoints.
