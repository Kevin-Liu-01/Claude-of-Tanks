# Grass atlas transparent-color padding

## Observed defect and candidate

The integrated Verdant/Coastal views show dark grass speckles. Source inspection
found that `finishAlphaTexture` paints RGB into transparent texels, then writes
those pixels back through Canvas. A native Canvas round trip changed a padded
`[140,165,105,0]` texel to `[0,0,0,0]`: its intended mip padding was lost.
The WebGL specification explicitly describes Canvas premultiplication as a
lossy upload path and supports `ImageData` directly as a `TexImageSource`.
[Khronos specification](https://registry.khronos.org/webgl/specs/latest/1.0/#TEXTURE_OBJECTS)

This isolated candidate uploads the existing padded ImageData buffer directly
for the two grass atlases. It preserves painting, seeded RNG, alpha, fully
opaque pigment, tone callbacks, texture dimensions, filtering, flip-Y, color
space and mip generation. Tree leaf/needle atlases remain on their existing
Canvas path; this is not a claim that every foliage issue is corrected.

There are still two 128×128 RGBA8 grass sources (65,536 bytes each), with no
new sampler, geometry, material, instance or render-loop work. Each texture
retains ImageData instead of Canvas; its painter canvas becomes unreferenced
after construction. Logical pixel dimensions are unchanged, but native/browser
retained-memory and upload-cost parity still require measurement.

## Focused checks

- 24 real `@napi-rs/canvas` cases: two variants, three seeds, and Verdant,
  Coastal, Winter and Desert tones. Alpha and opaque pigment remain exact.
- The old Canvas round trip is retained as a failing control. At 3,500
  first-mip edge cells with identical surviving alpha, the candidate supplies
  colored padding instead of black. This is a CPU mechanism test, not a GPU
  mip-readback, final appearance, FPS or stability certification.
- Texture sampling/upload properties match the previous CanvasTexture and
  ordinary Texture disposal still fires once.
- Grass lighting, all-30-biome retained-resource and expanded shader-key
  tests passed. Native TypeScript7 passed.
- Strict changed-helper/test metrics passed; the changed runtime functions
  have maximum cyclomatic10, cognitive17 and Halstead24.89. A scoped
  React Doctor scan found no runtime issue and one test-only repeated-property
  lookup warning. The first invalid CLI invocation was corrected; no scanner
  suppressions or configuration changes were added.

## Native visual acceptance

The isolated `d08fcf0407f2f69c238e20cc19a0f21080c09d27` public build passed.
Its index SHA-256 is
`3d2d670fad168bafcbae44e558f9864aa52a783fd5ce7bee655e1711c6674ddb`.
The source-identical grass change was integrated as `a38ab190d`.

Native reports live in `grass-padding-before-r1` and `grass-padding-after-r1`
under the external `environment-recovery-20260907` evidence directory. Their
SHA-256 hashes are respectively
`a7c07a2fa3b67729abad4215800a2bf3d1f43430cffae4787741c167bdfb5f7a` and
`47c683d5bc740faad6c00ce60494b1d10dae3b710927d9902a526a6484b15ce3`.

Both runs completed normally with empty browser errors. All 16 saved camera
receipts across Coastal and Verdant are exact; acquisition settings, browser,
quality and complete scene/subtree/material/texture inventories also match.
Coastal remains at 172 geometries, 32 materials, 40 textures and 36,665
instances; Verdant at 177 geometries, 35 materials, 46 textures and 102,195
instances. The two grass images are still 128×128 RGBA8.

The primary agent personally compared Verdant's establishing/detail views and
Coastal's foliage view. Fine grass no longer turns into black speckling in the
middle distance; close blades retain their silhouettes, and tree/horizon
geometry is unchanged. This fixes transparent-edge contamination, not all
grass tone, distribution, tree geometry or overall scene composition issues.

This is a visual/resource acceptance, not a controlled frame-cost or complete
browser heap measurement. The short frame intervals are mixed and cannot be
used as a performance win. Runtime acquisition receipts differ in generated
world UUIDs and remaining terrain-job counts (Coastal16→17, Verdant16→15),
despite exact saved scene inventories; do not label the full acquisition
objects identical or use these runs for a fixed-work timing comparison.
