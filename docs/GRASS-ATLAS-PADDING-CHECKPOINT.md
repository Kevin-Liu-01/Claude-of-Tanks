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

Native before/after images, GL upload validation and final release acceptance
are pending. Do not treat this local checkpoint as a shipped visual fix.
