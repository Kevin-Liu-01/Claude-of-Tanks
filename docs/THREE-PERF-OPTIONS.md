# Three.js performance options: evidence-led shortlist

Round 19 profiles make the next optimization target concrete. The first live
10 seconds had 81/82 program births on normal/2x-CPU runs. SwiftShader did not
reach game-ready in 70 seconds: 68.3 seconds were long tasks, led by
`paintPatchRoughness` (29.5 s self), `heightToNormal` (19.5 s), Three.js
`onFirstUse` (13.3 s), and synchronous render-target readback (2.0 s).

This is the ranked replacement/benchmark list. A library is not adopted until
its isolated local benchmark wins and its output passes the existing visual
views.

## 1. Move procedural texture pixels off the main thread

Best next benchmark. `paintPatchRoughness` and `heightToNormal` are custom
per-pixel CPU loops over large canvases. Three.js' official
[OffscreenCanvas worker guide](https://threejs.org/manual/en/offscreencanvas.html)
shows the supported worker boundary and transferable canvas pattern. Keep the
renderer on the main thread initially; move only deterministic height,
roughness, and normal-map generation into a module worker, return an
`ImageBitmap`, then upload through one shared `THREE.Texture` identity.

This removes the measured CPU loops from input/render scheduling. It does not
pretend that GPU resources can be shared between separate WebGL contexts; the
official guide's worker-renderer architecture is a larger migration.

## 2. Prefer offline baked maps for static combinations

Nation/pattern/vehicle maps are deterministic and mostly static. Bake them in
the asset pipeline, deduplicate them, and load them instead of regenerating
megapixels during battle entry. [glTF Transform](https://github.com/donmccurdy/glTF-Transform)
provides maintained `dedup`, `prune`, texture resize/compress, Meshopt, and
Basis/KTX2 workflows. Three.js' [`KTX2Loader`](https://threejs.org/docs/pages/KTX2Loader.html)
transcodes Basis textures to a GPU-supported compressed format and uses a
worker pool.

Benchmark UASTC for normal/metallic-roughness maps and ETC1S for albedo-like
content. This is a better fit than adding a runtime image-processing package:
the hot work disappears from the player device altogether.

## 3. Remove synchronous GPU readbacks

The official [`WebGLRenderer` API](https://threejs.org/docs/pages/WebGLRenderer.html)
recommends `readRenderTargetPixelsAsync()` over the blocking form. Audit the
sky, device diagnostic, thumbnail, and HUD readbacks. Convert non-boot-critical
ones to the async method, or keep the result GPU-side. The SwiftShader profile
specifically attributed 2.0 seconds to `readRenderTargetPixels`.

The same API exposes `initTexture()` to pay decode/upload before reveal and
`compileAsync()` to use `KHR_parallel_shader_compile`. This repository has a
documented disposal race in its current `compileAsync` integration, so the
existing explicit hidden compile window remains the safe default until a
focused current-Three re-test passes. `initTexture()` is independently useful.

## 4. Reduce material variants before adding batching

The first-10-second 81/82 program births and `WebGLUniforms` self time point to
material/program diversity. Share material classes and express camo variation
through textures/uniforms where visually equivalent. Three.js
[`BatchedMesh`](https://threejs.org/docs/pages/BatchedMesh.html) and
`SceneOptimizer` reduce draw calls for objects sharing materials; they do not
replace the texture bakes and do not merge unlike shader programs. Benchmark
them only after the program-family inventory identifies a compatible repeated
prop/decor set.

## 5. Keep WebGPU/TSL as an experimental lane

Three.js [WebGPURenderer](https://threejs.org/manual/en/webgpurenderer) and
[TSL compute/storage textures](https://threejs.org/docs/TSL.html) could generate
normal/roughness textures on the GPU and combine post passes. The renderer is
still documented as experimental and requires node-material/post-processing
porting. It is not a smallest-fix answer for the current WebGL game. Build a
standalone texture-bake proof only after the worker/offline benchmarks.

## 6. Use `three-mesh-bvh` only for proven ray hotspots

[`three-mesh-bvh`](https://github.com/gkjohnson/three-mesh-bvh) supplies
accelerated first-hit raycasts, batched-mesh BVHs, and worker/parallel BVH
generation. It is a strong candidate for repeated floor-fit/contact/pedestal
rays. It cannot fix the texture loops, shader births, or GPU readbacks exposed
here, so install it only when a ray-specific profile demonstrates an isolated
win over build and memory cost.

## Rejected as current fixes

- Full OffscreenCanvas renderer migration: too broad for an instrumentation
  round and requires proxying input/DOM state.
- `BatchedMesh` as a generic cure: targets draw calls, not the top four measured
  stalls.
- WebGPU conversion: promising, but experimental and high migration risk.
- A new runtime image library: still does avoidable work on the player's
  device; worker/offline generation has the better causal fit.
