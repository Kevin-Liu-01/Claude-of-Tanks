# Foliage atlas color padding

This candidate extends the published grass padding repair to the four existing
tree atlas families: broadleaf clusters, needle sprays, palm fronds and winter
twigs. It uploads the already-produced straight-alpha ImageData directly rather
than losing transparent RGB in a Canvas round trip. Painting, palette callbacks,
radial alpha falloff, geometry, shader code and sampling policy are unchanged.

There is still one diffuse atlas per existing species. Broadleaf remains 512² on
desktop/256² on mobile; the other three painters retain their existing 256² size.
Each texture retains its pixel buffer instead of its painter canvas. The canvas
and old discarded-copy path are no longer retained by that texture. Logical
RGBA8 source sizes are unchanged; this is not a complete browser-heap measurement.
No new texture, material, sampler, instance, draw call or render-loop work is added.

## Focused verification

- 64 real Canvas cases: four atlas families, four biome palettes, two seeds and
  both actual device tiers. An independent copy of the previous finalization
  starts from the real painted Canvas and verifies exact intended pixel bytes.
  Previous final alpha and fully opaque RGB are exact; 2,914,212 previously lost
  transparent colored texels are retained. Native mip/appearance review is separate.
- Texture sampling/upload properties and ordinary disposal match the prior path;
  deterministic pixels and RNG tails repeat. Restoring Canvas fails a control.
- All-30-biome resource retention, 13-species shader-program keys, grass padding,
  lighting, native TypeScript7 and strict changed-file complexity checks pass.
  React Doctor reports no findings in five changed files; no dependency installed.
- Two old lighting-test assumptions failed and were corrected explicitly: mock
  ImageData now has its real width/height contract, and the constructor-count
  assertion includes ordinary Texture along with Canvas/DataTexture. The total
  six allocation sites and actual resource budgets remain unchanged.

## Native visual acceptance

Candidate `5e837a92dfed504c160184e1d45b3a483bb68c94` passed the public build.
Index SHA256: `85b4245027d7d0ff45c6c92f175004f2ddb3f3a65d4ae9b1db6601d316fd5292`.
Baseline is published `7e7fdae30`, index
`bc69084df62637f64cd0ab2d280eb519ac22f05894532dacdfd6eb73aed03b79`.
Both roots stayed clean and frozen throughout their captures. The runtime is
integrated separately as `090bdcb1d`; the frozen candidate was not rewritten.

Reports are `foliage-padding-before-r1` and `foliage-padding-after-r1` in
`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/`.
Their respective SHA256 hashes are
`ce393a24b23def8a8b44a92ff336e96a11d6c815e925fb17ea4d2751b0972642` and
`0adfe0819d0cc65ec6d6e70081fd067b74382694254664d14e464f6ee8a703ce`.

All 22 saved poses are exact across Verdant, Winter and Desert. Acquisition
settings/state, full scene/subtree counts and complete material/texture
inventories match; both browser-error lists are empty. Native Chrome
151.0.7922.47, ANGLE Metal, 1440×900 DPR1 desktop. Resource counts remain:

| Map | Geometries | Materials | Textures | Instances | Scene triangles |
|---|---:|---:|---:|---:|---:|
| Verdant | 177 | 35 | 46 | 102,195 | 2,540,578 |
| Winter | 174 | 32 | 41 | 12,006 | 2,042,800 |
| Desert | 160 | 29 | 37 | 45,962 | 1,456,026 |

The primary agent viewed all three foliage before/after pairs and the Verdant
establishing pair. Tree edges retain more pigment; this is a subtle correction,
not a tree-shape redesign. Existing card-shaped crowns, winter snow clumps,
grass distribution and terrain forms remain visible and are not claimed fixed.
No new halo or alpha-silhouette expansion was observed in those views.

Short screenshot frame intervals are not a controlled performance comparison.
These captures verify native appearance/resources, not whole-browser heap,
all-map frame-cost parity, physical iPad rendering or completion of the art goal.
