# Foliage atlas color padding

This candidate extends the published grass padding repair to the four existing
tree atlas families: broadleaf clusters, needle sprays, palm fronds and winter
twigs. It uploads the already-produced straight-alpha ImageData directly rather
than losing transparent RGB in a Canvas round trip. Painting, palette callbacks,
radial alpha falloff, geometry, shader code and sampling policy are unchanged.

There is still one diffuse atlas per existing species. Broadleaf remains512² on
desktop/256² on mobile; the other three painters retain their existing256² size.
Each texture retains its pixel buffer instead of its painter canvas. The canvas
and old discarded-copy path are no longer retained by that texture. Logical
RGBA8 source sizes are unchanged; this is not a complete browser-heap measurement.
No new texture, material, sampler, instance, draw call or render-loop work is added.

## Focused verification

-64 real Canvas cases: four atlas families, four biome palettes, two seeds and
  both actual device tiers. An independent copy of the previous finalization
  starts from the real painted Canvas and verifies exact intended pixel bytes.
  Previous final alpha and fully opaque RGB are exact;2,914,212 previously lost
  transparent colored texels are retained. Native mip/appearance review is separate.
-Texture sampling/upload properties and ordinary disposal match the prior path;
  deterministic pixels and RNG tails repeat. Restoring Canvas fails a control.
-All30-biome resource retention,13-species shader-program keys, grass padding,
  lighting, native TypeScript7 and strict changed-file complexity checks pass.
  React Doctor reports no findings in five changed files; no dependency installed.
-Two old lighting-test assumptions failed and were corrected explicitly: mock
  ImageData now has its real width/height contract, and the constructor-count
  assertion includes ordinary Texture along with Canvas/DataTexture. The total
  six allocation sites and actual resource budgets remain unchanged.

Native matched Verdant/Winter/Desert baseline: published7e7fdae30, output
`foliage-padding-before-r1` in the external environment-recovery-20260907 evidence
directory. Candidate native review and public build are pending at this checkpoint.
