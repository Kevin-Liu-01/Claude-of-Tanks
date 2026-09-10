# Track image residency without shared scrolling

`createTankMaterials` previously constructed two `CanvasTexture` objects from
the same immutable track canvas. Three.js allocates texture storage by `Source`
identity and sampler state, not canvas identity, so that created two GPU images.

The right texture now clones the left texture. This retains two distinct texture
views, materials and UV transforms, but shares their pixel `Source`. The pinned
Three.js `Texture.copy` shares `source` and copies offset/repeat/center/matrix
values into distinct objects. `WebGLTextures` excludes UV transforms from its
storage key and reference-counts the matching source/sampler allocation. Scrolling
still changes each side's `offset.y` independently. Painter constants, image
pixels, material properties, geometry and quality are unchanged.

The shared material cache creates the track canvas once. Camouflage repaint and
paint-quality promotion do not mutate or replace that track image. Temporary
GPU disposal and final material-owner disposal remain separate, supported paths.

## Qualification

The added actual-factory contract first failed on the original distinct Source
identities. With the clone, three focused material checks pass. The regression
checks exact sampler settings, independent UV objects and transformations,
actual paint promotion/repaint with unchanged track pixels, and per-view cleanup.

A separate registered native WebGL regression compares the real track materials
against independently sourced reference textures using the same images. It
requires byte-identical rendered pixels at three independent offset poses and
after disposal/re-upload, a coupled-offset negative control, actual GPU storage
counts and complete final resource cleanup. Native r2 passed on Chrome
151.0.7922.47 / ANGLE Metal Apple M5 Max. All five cases had zero differing
channels and maximum difference zero. The deliberately coupled-offset control
changed 9,149 channels, and the rendered output contained 34 visible values.
Actual GPU handles proved two distinct reference allocations versus one shared
candidate allocation. Disposing one view retained its sibling's storage;
disposing/re-uploading one or both views preserved exact pixels. Final texture
and geometry counts were zero. Browser, server, temporary cache and FIFO lease
cleanup all passed; errors and cleanup errors were empty.

The first native run is retained as a failed fixture, not omitted. It stopped
before pixel comparisons: the first real MeshStandardMaterial draw also uploads
Three.js's global 16×16 RG/HalfFloat `DFG_LUT`, yielding three total allocations
rather than the assumed two. The corrected fixture identifies the actual LUT
from the rendered material's uniforms, verifies its dimensions/type/format and
distinct live handle, and accounts for that one helper separately. The private
renderer's final cleanup explicitly disposes that captured helper. Neither
runtime code nor the 2-versus-1 and final-zero assertions was relaxed.

Native receipt: `/private/tmp/cot-interactive-baseline.gsRCvU/track-texture-source-native-r2.log`.
Fixture source-bundle SHA-256:
`6c1dbb548b65eb17ce285a0ee7265084a3b1fd5ab4b08fe3c316ab8feaf84a3a`.
Failed predecessor: `track-texture-source-native-r1.log` in the same directory.
CPU logs: `track-source-sharing-cpu-before.log` (negative witness),
`track-source-sharing-cpu-positive-r1.log` (three passes), and
`track-source-sharing-registries-r1.log` (three runner/registry passes).
The new browser regression is registered with its own capture lease, so the
parent runner cannot double-lock it. Full `npm test` was not rerun to completion
for this slice; discovery of 959 suite entries is not a 959-test pass.

This optimization cannot lower draw calls, triangles, the number of logical
texture-view objects, or a diagnostic that sums canvas pixels separately for
each view. Those resource-budget failures must not be declared fixed by sharing
one underlying GPU image.
