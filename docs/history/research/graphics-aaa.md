# AAA Visual Quality in Pure Three.js — Implementation Spec

**Target: three@0.185.1 (verified against `node_modules/three`).** Every import path,
constructor signature, and default below was checked against the installed source.
Constraint: 100% procedural — no downloaded assets, no CDN. All geometry via
BufferGeometry composition, all textures canvas/noise-generated, all audio WebAudio.
Must satisfy `docs/SCREENSHOT_CONTRACT.md`: deterministic views, zero console errors.

Import style: both `three/examples/jsm/<path>` and `three/addons/<path>` resolve via
the package `exports` map (Vite handles both). This doc uses `three/examples/jsm/`.

---

## 1. Renderer setup

```js
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({
  antialias: false,           // AA comes from the post chain (SMAA) — don't pay twice
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // budget cap, see §13
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;   // default in r185, set explicitly
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;                 // tune 0.8–1.2 with the sky
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;   // VSMShadowMap leaks on thin tank parts
```

Critical r185 facts:

- **Lighting is physically based, period.** `useLegacyLights` was removed (r165).
  DirectionalLight intensity ~1–3, HemisphereLight ~0.3–0.8, ambient via
  `scene.environment` (see §2). Do not copy pre-r155 intensity values from old tutorials.
- **When rendering through EffectComposer, tone mapping + sRGB conversion happen in
  `OutputPass`**, which reads `renderer.toneMapping` / `outputColorSpace`. All
  intermediate passes run linear HalfFloat (EffectComposer's internal target is
  `{ type: HalfFloatType }` by default in r185 — verified in EffectComposer.js:69).
  Do NOT add a GammaCorrectionShader; that era is over.
- WebGL2 is the only path in r185; `DepthTexture` is always available (§9).
- Albedo/color textures you generate must get `texture.colorSpace = THREE.SRGBColorSpace`.
  Normal/roughness/height/data textures stay linear (default `NoColorSpace`).

## 2. Light rig: sun + hemisphere + IBL-ish ambient

Three layers, all cheap:

1. **Sun**: the CSM module owns the DirectionalLights (§3). Do not add a second
   directional sun or you double-light. `lightIntensity: 3` is the CSM default and a
   good ACES starting point for a noon sun; ~1.5 for low sun.
2. **HemisphereLight** — sky/ground bounce, no shadow cost:
   ```js
   scene.add(new THREE.HemisphereLight(0xbfd5ff /*sky*/, 0x8c7a5b /*ground*/, 0.45));
   ```
3. **IBL from the procedural sky** — this is the single biggest "AAA-ness" lever:
   PBR materials get real specular ambient instead of flat gray.
   ```js
   import { Sky } from 'three/examples/jsm/objects/Sky.js';

   const pmrem = new THREE.PMREMGenerator(renderer);
   function bakeEnvironment(sunDir) {
     const envScene = new THREE.Scene();
     const envSky = new Sky();               // SEPARATE instance from the visible sky
     envSky.scale.setScalar(50);             // PMREMGenerator.fromScene far plane = 100
     envSky.material.uniforms.sunPosition.value.copy(sunDir);
     envSky.material.uniforms.turbidity.value = 6;
     envSky.material.uniforms.rayleigh.value = 1.5;
     envScene.add(envSky);
     const rt = pmrem.fromScene(envScene);
     scene.environment = rt.texture;
     scene.environmentIntensity = 0.5;       // exists on Scene in r185 (Scene.js:95)
     return rt;                               // keep to .dispose() on re-bake
   }
   ```
   Bake once at startup (sun is static per map). Baking takes ~10ms — do it before
   setting `window.__GAME_READY`. If you ever animate time-of-day, re-bake at ≤1 Hz.

## 3. Cascaded shadows over large terrain — CSM

`three/examples/jsm/csm/CSM.js` exists and is WebGLRenderer-only (fine; we're WebGL).
Verified constructor: **single `data` object**, defaults: `cascades: 3`,
`maxFar: 100000`, `mode: 'practical'`, `shadowMapSize: 2048`, `shadowBias: 0.000001`,
`lightIntensity: 3`, `lightMargin: 200`, `fade: false` (post-construction property).

```js
import { CSM } from 'three/examples/jsm/csm/CSM.js';

const csm = new CSM({
  camera,                    // the gameplay camera
  parent: scene,             // CSM adds its DirectionalLights here
  cascades: 3,
  maxFar: 250,               // shadows visible to 250 m — do NOT leave at 100000
  mode: 'practical',
  shadowMapSize: 2048,       // 3 × 2048² depth maps ≈ 48 MB, fine on Apple Silicon
  shadowBias: -0.0002,       // tune against acne on tank hulls; pair with normalBias below
  lightDirection: sunDir.clone().negate().normalize(), // points FROM sun
  lightIntensity: 3,
});
csm.fade = true;             // smooth cascade transitions
csm.updateFrustums();        // REQUIRED after changing fade / camera.fov / aspect

// per frame, after camera matrices are current:
csm.update();
```

Non-obvious requirements (all verified in CSM.js source):

- **`csm.setupMaterial(mat)` must be called for every material that should receive
  cascaded shadows** (terrain, tanks, buildings). It sets `defines.USE_CSM`,
  `CSM_CASCADES`, and **assigns `material.onBeforeCompile`** — so if a material also
  needs custom shader injection (terrain splat §7, grass wind §8), set up CSM first,
  then wrap:
  ```js
  csm.setupMaterial(mat);
  const csmHook = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, rdr) => { csmHook(shader, rdr); mySplatHook(shader); };
  ```
- CSM globally patches `ShaderChunk.lights_fragment_begin/lights_pars_begin` at
  construction (CSM.js:415-418). Harmless for non-CSM materials but construct CSM
  before compiling any materials to keep program cache keys stable.
- Set `light.shadow.normalBias = 0.02` on `csm.lights[i].shadow` after construction to
  kill acne on terrain slopes (CSM only exposes `shadowBias`).
- On window resize: `camera.updateProjectionMatrix(); csm.updateFrustums();`
- **Shadow casters are the cost.** `terrain.castShadow = false, receiveShadow = true`
  (terrain self-shadowing comes free from slope-darkened splat albedo + GTAO). Cast
  from tanks, trees, rocks, buildings only. Grass neither casts nor receives.

Fallback (quality toggle / perf escape hatch): one DirectionalLight, 4096 map,
ortho shadow camera ±60 m following the player, position snapped to shadow-texel grid
(`texel = (right-left)/mapSize`; snap light position and target to multiples) to stop
shadow shimmer. ~40% cheaper than 3 cascades; keep behind a settings flag.

## 4. Post-processing chain — verified passes and safe order

All verified present in `three/examples/jsm/postprocessing/`: `EffectComposer`,
`RenderPass`, `UnrealBloomPass`, `SSAOPass`, **`GTAOPass`** (use this — best AO in
r185; N8AO is NOT installed and external deps are off-limits), `SMAAPass`,
`FXAAPass`, `OutputPass`, `BokehPass`, `OutlinePass`.

Verified signatures:
- `new GTAOPass(scene, camera, width = 512, height = 512, parameters?, aoParameters?, pdParameters?)`
- `new UnrealBloomPass(resolution: Vector2, strength = 1, radius, threshold)`
- `new SMAAPass()` — **no arguments in r185** (old `(width,height)` signature is gone)
- `new FXAAPass()` — new class in r185, extends ShaderPass, auto `setSize`
- `new OutputPass()` — no arguments

Ordering rules straight from the r185 source comments: SMAAPass "operates in
linear-srgb so this pass must be executed **before** OutputPass"; FXAA needs sRGB so
it must come **after** OutputPass. Recommended chain:

```js
import { EffectComposer }  from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass }        from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass }        from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass }      from 'three/examples/jsm/postprocessing/OutputPass.js';

const size = renderer.getDrawingBufferSize(new THREE.Vector2());
// custom target so particles can sample scene depth later (§9):
const target = new THREE.WebGLRenderTarget(size.x, size.y, {
  type: THREE.HalfFloatType,
  depthTexture: new THREE.DepthTexture(size.x, size.y),
});
const composer = new EffectComposer(renderer, target);

composer.addPass(new RenderPass(scene, camera));           // 1. scene, linear HDR

const gtao = new GTAOPass(scene, camera, size.x, size.y);  // 2. AO multiply
gtao.output = GTAOPass.OUTPUT.Default;
gtao.updateGtaoMaterial({ radius: 0.3, distanceExponent: 1, thickness: 1, scale: 1, samples: 12 });
gtao.blendIntensity = 0.9;
composer.addPass(gtao);

const bloom = new UnrealBloomPass(size.clone(), 0.35, 0.55, 0.85); // 3. HDR bloom
composer.addPass(bloom);                                   // muzzle flash/fire pop here

composer.addPass(new SMAAPass());                          // 4. AA (linear, pre-output)
composer.addPass(new OutputPass());                        // 5. ACES + sRGB — LAST

// resize: composer.setSize(w, h); composer.setPixelRatio(pr); gtao.setSize handled by composer.
```

Notes:
- Bloom `threshold 0.85` works because the buffer is HDR-linear; sun/flash pixels
  exceed 1.0 and bloom naturally. Keep `strength ≤ 0.4` or everything glows.
- GTAO is the most expensive pass (~2–3 ms at 1080p on M1). It ships with a Poisson
  denoiser (pdParameters). Quality toggle: swap `gtao.enabled = false`.
- Optional cheaper AA alternative: skip SMAA, give the composer target
  `samples: 4` (WebGL2 MSAA on the composer RT) — but MSAA + depthTexture on the same
  target is not allowed; if you need soft particles keep SMAA. SMAA is the recommended
  default (crisper than FXAA on HUD-free 3D).
- Render via `composer.render()` only — never also call `renderer.render` per frame.

## 5. Procedural sky + horizon-matched fog

```js
import { Sky } from 'three/examples/jsm/objects/Sky.js';

const sky = new Sky();
sky.scale.setScalar(10000);                 // inside camera.far (use far = 2000–20000)
scene.add(sky);
const u = sky.material.uniforms;            // verified uniform names (Sky.js:80-84)
u.turbidity.value = 6;                      // hazier = more battlefield mood
u.rayleigh.value = 1.5;
u.mieCoefficient.value = 0.005;
u.mieDirectionalG.value = 0.8;

const sunDir = new THREE.Vector3().setFromSphericalCoords(
  1, THREE.MathUtils.degToRad(90 - 35 /*elevation*/), THREE.MathUtils.degToRad(140 /*azimuth*/));
u.sunPosition.value.copy(sunDir);
```

**Fog must match the sky at the horizon or the terrain edge gives the whole game away.**
The Sky shader is not affected by scene.fog, so pick the fog color to match its horizon
band. Two options; use (a):

(a) Sample it: after the env bake (§2), read one pixel of the PMREM at horizon level —
or simpler and fully deterministic: render the sky once to a tiny 16×16 RT with a
horizontal camera and `readRenderTargetPixels`, average the middle row, use that color.
(b) Hand-tune per time-of-day preset (e.g. `0xc4d3dd` for noon-hazy) and lerp.

```js
scene.fog = new THREE.Fog(horizonColor, 150, 1200);   // linear reads better than Exp2
// for heavier atmosphere: new THREE.FogExp2(horizonColor, 0.0012)
```
Fog distances must cover the terrain far edge; set `csm.maxFar` ≲ fog end so shadows
never pop inside visible-but-unfogged range. Optional sun glare:
`Lensflare`/`LensflareElement` from `three/examples/jsm/objects/Lensflare.js`
(verified) with small canvas-generated flare textures — cheap AAA garnish; hide it in
`sniper_view`.

## 6. Terrain — heightmap, chunking, normals

- **Noise**: `import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js'`
  — methods `noise(x, y)`, `noise3d`, `noise4d` (verified). Constructor takes an
  optional object with `random()` — pass a seeded PRNG (mulberry32) so height is
  deterministic across runs (screenshot contract) and shared with physics:
  ```js
  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
  const simplex = new SimplexNoise({ random: mulberry32(1337) });
  ```
- **Height function** (pure, CPU, single source of truth for render + wheels + shells):
  fBm 5 octaves, lacunarity 2, gain 0.5, base wavelength ~180 m, amplitude ~14 m, plus
  one low-frequency domain-warped octave for ridgelines, plus flattening mask around
  spawn/road areas (`h *= smoothstep` masks). Keep max slope ≤ ~35° where tanks drive.
- **Chunking**: 1024×1024 m map = 8×8 chunks of 128 m. Per chunk one
  `PlaneGeometry(128,128,segs,segs).rotateX(-Math.PI/2)` with vertices displaced by
  the height function, `segs` per LOD: 96 / 48 / 24 (near/mid/far by chunk-center
  distance). Add a 1-vertex skirt (edge ring pulled down 2 m) so LOD seams never show
  cracks — far cheaper than stitching indices. Chunks are static; build once, LOD by
  swapping pre-built index buffers or 3 pre-built geometries per chunk (memory is
  cheap: ~64 MB total worst case, fine).
- **Normals**: analytic from the height function, not `computeVertexNormals()` —
  central differences with world-space epsilon = one vertex spacing gives seam-free
  normals across chunk borders:
  `n = normalize(vec3(h(x-e,z)-h(x+e,z), 2e, h(x,z-e)-h(x,z+e)))`.

## 7. Splat-blended procedural PBR terrain material

**Strategy: one `MeshStandardMaterial` + `onBeforeCompile` splat injection** (keeps
full PBR lighting, env map, CSM shadows — a raw ShaderMaterial would forfeit all of
that). Blend weights computed in-shader from slope + height + noise: zero splatmap
memory, infinite resolution.

### 7.1 Canvas texture generation (albedo / roughness / normal per layer)

Generate 4 layers — grass, dirt, rock, mud — each 512×512, tileable. Tileability: use
3D/4D simplex sampled on a torus (`noise4d(cos u, sin u, cos v, sin v)` scaled) or
wrap-blend the canvas edges. Per layer:

```js
function makeLayer(seed, params) {
  const s = 512, px = new Uint8ClampedArray(s*s*4), height = new Float32Array(s*s);
  const n = new SimplexNoise({ random: mulberry32(seed) });
  // fill: base color +/- value noise, macro variation octave, speckle
  // (grass: hue 90±12, blade streaks via high-freq anisotropic noise;
  //  dirt: 30±8 with clod blobs; rock: desaturated 220 gray + cracks via
  //  ridged noise |n|; mud: dark brown + puddle low-roughness blobs)
  // ... write px (albedo RGB) and height[] (for the normal map)
  const albedo = canvasToTexture(px, s);
  albedo.colorSpace = THREE.SRGBColorSpace;   // ONLY albedo is sRGB
  return { albedo, normal: normalFromHeight(height, s, 2.0), rough: roughnessTex };
}
function canvasToTexture(px, s) {
  const c = document.createElement('canvas'); c.width = c.height = s;
  c.getContext('2d').putImageData(new ImageData(px, s, s), 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
```

### 7.2 Normal maps from height — Sobel, the believable way

```js
function normalFromHeight(h, s, strength = 2.0) {
  const px = new Uint8ClampedArray(s*s*4);
  const H = (x, y) => h[((y+s)%s)*s + ((x+s)%s)];        // wrap => tileable
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    // Sobel gives smoother results than central diff for noisy height:
    const dx = (H(x+1,y-1)+2*H(x+1,y)+H(x+1,y+1)) - (H(x-1,y-1)+2*H(x-1,y)+H(x-1,y+1));
    const dy = (H(x-1,y+1)+2*H(x,y+1)+H(x+1,y+1)) - (H(x-1,y-1)+2*H(x,y-1)+H(x+1,y-1));
    const v = new THREE.Vector3(-dx*strength, -dy*strength, 1).normalize();
    const i = (y*s+x)*4;
    px[i]=v.x*127.5+127.5; px[i+1]=v.y*127.5+127.5; px[i+2]=v.z*127.5+127.5; px[i+3]=255;
  }
  return canvasToTexture(px, s);              // linear (no colorSpace assignment)
}
```
Believability rules: normal strength ≈ 1.5–3 (subtle!), give each layer TWO height
frequencies (macro 8-tile bumps + micro grain) before Sobel, and bake cavity darkening
into the albedo (`albedo *= 0.7 + 0.3*heightNorm`) — cavity-in-albedo is what makes
procedural textures stop looking like noise. Roughness maps: grass 0.85±noise,
dirt 0.95, rock 0.75 with crack-darkened 0.6, mud 0.45 in puddle blobs (specular mud
reads instantly as wet).

### 7.3 Shader injection

```js
const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
csm.setupMaterial(mat);                       // FIRST (see §3 wrap pattern)
const csmHook = mat.onBeforeCompile;
mat.onBeforeCompile = (shader, rdr) => {
  csmHook(shader, rdr);
  shader.uniforms.uGrassA = { value: grass.albedo };   // ... 4×(albedo,normal,rough)
  shader.uniforms.uNoiseScale = { value: 0.08 };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNormal;')
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = worldPosition.xyz;\nvWNormal = normalize(mat3(modelMatrix) * normal);');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + SPLAT_GLSL)  // weights + samplers
    .replace('#include <map_fragment>',      'diffuseColor.rgb *= splatAlbedo(vWPos, vWNormal);')
    .replace('#include <normal_fragment_maps>', SPLAT_NORMAL_GLSL)     // blended TS normal
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * splatRough(vWPos, vWNormal);');
};
mat.customProgramCacheKey = () => 'terrain-splat-v1';
```

Weight logic in `SPLAT_GLSL` (per-fragment, UV = `vWPos.xz * tiling`):
`slope = 1.0 - vWNormal.y` → rock when `slope > 0.35` (smoothstep 0.25–0.45);
mud where `height < mudLevel` (pass height via vWPos.y); dirt from a 0.02-frequency
noise mask (bake a tiny 256² noise texture rather than computing simplex in GLSL);
grass = remainder. Blend top-2 layers only (select two highest weights) to halve
texture fetches. Normal blending: UDN (`normalize(vec3(n1.xy + n2.xy, n1.z))`) is
sufficient. Also add distance-based tiling break: sample each layer at 1× and 0.23×
scale and mix by fragment distance — kills visible repetition, the #1 procedural
tell.

## 8. Instanced vegetation with GPU wind

- **Grass**: one `THREE.InstancedMesh` per terrain chunk (culling granularity), geometry =
  two crossed quads (`PlaneGeometry(0.9, 0.6)` merged, pivot at base), material
  `MeshStandardMaterial({ map: grassCardTex, alphaTest: 0.45, side: THREE.DoubleSide })`
  — **alphaTest, never transparent** (keeps depth writes, no sorting). Card texture:
  canvas-drawn blade cluster (8–12 tapered quadratic strokes, gradient dark base → light
  tip; the baked base darkening is your fake AO). 2,000–4,000 instances/chunk in the 3
  nearest rings only (~40k max visible). Neither casts nor receives shadows; tint
  instance color (`setColorAt`) by sampling the terrain albedo logic so it grounds.
- **Wind** via the same onBeforeCompile pattern (no CSM on grass, so no wrap needed):
  ```js
  shader.uniforms.uTime = grassTimeUniform;   // shared { value: 0 } object, tick per frame
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
    #include <begin_vertex>
    vec4 wp = instanceMatrix * vec4(transformed, 1.0);
    float sway = uv.y * uv.y;                                   // stiff base, loose tip
    float phase = wp.x * 0.35 + wp.z * 0.28;
    transformed.x += sway * (0.12 * sin(uTime * 1.6 + phase) + 0.05 * sin(uTime * 3.7 + phase * 2.3));
    transformed.z += sway * 0.08 * cos(uTime * 1.3 + phase);
  `);
  ```
  For the screenshot contract, `__SHOTS.set()` freezes `uTime` to a fixed value.
- **Trees**: procedural pine = jittered cone stack (3–4 cones, radius noise per ring) +
  cylinder trunk, ~600 tris; oak = trunk + 5–8 icosphere blobs with vertex-noise
  displacement, ~900 tris. Two LODs as separate InstancedMeshes (full ≤120 m, billboard
  card beyond — bake the card by rendering the tree once to a 256² RT at startup;
  that's still "procedural", no external asset). Trees cast shadows (they sell the CSM),
  `castShadow = true` on the near-LOD InstancedMesh only. Wind: tiny whole-instance
  shear on canopy vertices (`transformed.xz += normal-independent sway * step(trunkTop, position.y)`).
- **InstancedMesh gotcha**: one bounding sphere for all instances — compute it after
  placement (`mesh.computeBoundingSphere()`) or set `frustumCulled = false` on
  chunk-local meshes (chunk parent culling handles it).

## 9. Particles — smoke / fire / dust, soft where it counts

**Do not use THREE.Points** (gl_PointSize clamps vary; ANGLE/Metal limits break big
explosion sprites). Use `InstancedBufferGeometry` (one unit quad + per-instance
attributes) with a custom ShaderMaterial, billboarded in the vertex shader from the
view matrix columns:

```glsl
vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
vec3 wpos = iOrigin + iVel * age + 0.5 * vec3(0, iGravity, 0) * age * age
          + (camRight * position.x + camUp * position.y) * size(age);
```

- **Fully GPU-animated**: per-instance attrs `iOrigin, iVel, iBirth, iLife, iSeed,
  iRot`; uniform `uTime`; `age = uTime - iBirth`; dead particles collapse to zero size.
  CPU cost per frame ≈ 0. Emission = write a few attr slots in a ring buffer
  (`attr.needsUpdate = true` with `updateRanges` for the touched span). Pools:
  smoke 2048, fire 1024, dust 1024, sparks 512, debris (small InstancedMesh boxes with
  the same ballistic math) 256.
- **Textures**: 128² canvas radial gradient × blurred noise for smoke puffs; fire uses
  the same puff but additive. Smoke: `NormalBlending`, `depthWrite: false`, color ramp
  black→gray→light gray over life, grows 1→3×. Fire: `AdditiveBlending`, HDR-ish color
  (set `color * 3.0` in shader so bloom catches it), life 0.3–0.6 s. Muzzle flash: 4–6
  additive cards + one 20 ms PointLight flash (intensity 50, distance 12 — budget: max
  2 dynamic PointLights alive at once). Tracer: stretched additive quad along velocity.
- **Soft particles**: WebGL2 depth texture is guaranteed. The composer target already
  owns a `DepthTexture` (§4) — but a pass cannot sample the depth buffer it is
  writing. Correct approach: **depth prepass** — once per frame render opaque layers
  (`camera.layers` mask excluding particles) with `scene.overrideMaterial = new
  THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })` into a half-res RT;
  particles sample it: `fade = clamp((sceneDepth - fragViewDepth) * uSoftness, 0., 1.)`.
  Cost ~1 ms. **Ship tier 1 first**: no prepass, hide intersections by shrinking alpha
  near `age→0` and spawning puffs ≥0.5 m above ground; add the prepass as tier 2 if
  explosion shots (screenshot view `explosion`) show hard clipping.

## 10. Tread decals

Ribbon ring-buffer per tank, not projected decals (projection is overkill on terrain
you can query):

- One `BufferGeometry` per tank with pre-allocated 256 quads (positions/uv/alpha
  attrs, `DynamicDrawUsage`). Each track lays a quad pair per ~0.6 m of travel:
  corners = wheel-contact points, `y = terrainHeight(x,z) + 0.03`, oriented by hull yaw.
- Material: `MeshBasicMaterial`-level custom or MeshStandardMaterial with canvas tread
  texture (two rows of dark chevrons, alpha elsewhere), `transparent: true`,
  `depthWrite: false`, `polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4`,
  `renderOrder = 1` (after terrain). Multiply a per-vertex alpha attribute that fades
  with segment age; when the ring wraps, oldest quads are overwritten — the fade hides
  the pop. Darken rather than texture at distance (fragment `mix` by distance) so it
  stays readable in the `battlefield` wide shot.

## 11. Camera shake

Trauma model (Squirrel Eiserloh) — additive **rotational** shake only (positional shake
clips geometry in the chase cam):

```js
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js'; // .noise(x,y,z) verified
let trauma = 0;                                  // add: fire 0.25, hit 0.45, near-explosion 0.7 (clamp 1)
function applyShake(dt, t) {
  trauma = Math.max(0, trauma - 1.4 * dt);
  const s = trauma * trauma;
  camera.rotation.x += 0.045 * s * noise.noise(t * 11, 0, 0);
  camera.rotation.y += 0.045 * s * noise.noise(0, t * 11, 0);
  camera.rotation.z += 0.030 * s * noise.noise(0, 0, t * 11);
}
```
Apply AFTER the chase-cam solve, BEFORE `csm.update()`. Scale ×0.3 in `sniper_view`.
For screenshots, `combat_firing`/`explosion` views set a fixed trauma and a frozen `t`.

## 12. LOD strategy

| Asset | Near | Mid | Far |
|---|---|---|---|
| Terrain chunk | 96² segs (<160 m) | 48² (<400 m) | 24² + skirts |
| Tanks | full (~12k tris, <60 m) | reduced (~3k, <180 m) | hull box + turret prism |
| Trees | mesh (<120 m) | — | baked billboard card |
| Grass | full density (<45 m) | 40% (<80 m) | none |
| Shadows | casters within cascade range only; terrain never casts | | |

Use `THREE.LOD` for tanks (few objects, it's fine); terrain/vegetation LOD is manual
per-chunk swap (hysteresis of 10% on thresholds to prevent flicker). Grass fade-out:
scale instances to 0 over the last 10 m in the wind shader (`smoothstep` on camera
distance) — no popping. Merge every static material into as few shader programs as
possible; target < 30 unique programs so the pre-ready `renderer.compile(scene, camera)`
warm-up (§14) is exhaustive.

## 13. Performance budget — 60 fps @ 1080p, Apple Silicon (M1-class, ANGLE/Metal)

| Slice | Budget | Notes |
|---|---|---|
| Opaque scene render | 5.5 ms | < 300 draw calls, < 1.2 M tris on screen |
| CSM (3×2048) | 2.5 ms | < 80 casting objects; instanced casters count as 1 draw each |
| GTAO | 2.5 ms | first thing to drop to half-res or disable on weaker HW |
| Bloom | 0.9 ms | 5 mips, fixed |
| SMAA + Output | 1.0 ms | |
| Particles + transparents | 1.0 ms | GPU-animated, ≤ 4 fill-heavy overlapping layers |
| JS: sim + culling + emit | 3.0 ms | no per-frame allocations in the loop (reuse Vector3s) |
| **Total** | **~16.4 ms** | |

Hard rules: `renderer.info.render.calls` displayed in a debug HUD from day one;
pixelRatio capped at 1.5 (native 2× retina = 4× fragment cost — GTAO+bloom will not
hold); no `MeshPhysicalMaterial` (clearcoat etc. costs ~1.5× Standard — Standard +
good env map is indistinguishable on tanks); texture memory < 200 MB; zero
`new` in the render loop; `object.matrixAutoUpdate = false` for all static objects
(terrain, trees via instancing anyway); one `Clock`, fixed-timestep sim decoupled from
render.

## 14. Screenshot-contract integration (do not skip)

- Seed ALL randomness (terrain, textures, vegetation placement, particle seeds) with
  mulberry32; `__SHOTS.set(name)` must also (a) set the shared `uTime`-style uniforms to
  a per-view constant, (b) set trauma/particle emission to a scripted state, (c) place
  the camera and call `camera.updateProjectionMatrix(); csm.updateFrustums(); csm.update()`.
- Before `window.__GAME_READY = true`: bake env (§2), generate all canvas textures,
  then `renderer.compile(scene, camera)` (sync) or `await renderer.compileAsync(scene, camera)`,
  then render 2 warm frames through the composer. This guarantees the first captured
  frame has final lighting and no shader-compile flashes.
- Zero-console-error rule: guard `getContext` loss, never `console.error` in reachable
  code paths, and validate every `.replace()` shader injection actually matched (assert
  the shader string changed — a silent non-match is the classic three-version-drift bug).

## Appendix: verified import cheat sheet (three@0.185.1)

```js
import { EffectComposer }  from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass }        from 'three/examples/jsm/postprocessing/GTAOPass.js';   // preferred AO
import { SSAOPass }        from 'three/examples/jsm/postprocessing/SSAOPass.js';   // exists; inferior
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass }        from 'three/examples/jsm/postprocessing/SMAAPass.js';   // new SMAAPass() — no args
import { FXAAPass }        from 'three/examples/jsm/postprocessing/FXAAPass.js';   // must go AFTER OutputPass
import { OutputPass }      from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BokehPass }       from 'three/examples/jsm/postprocessing/BokehPass.js';  // optional sniper DoF
import { CSM }             from 'three/examples/jsm/csm/CSM.js';                   // new CSM({ data }) object arg
import { Sky }             from 'three/examples/jsm/objects/Sky.js';
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js';
import { SimplexNoise }    from 'three/examples/jsm/math/SimplexNoise.js';         // .noise(x,y)/.noise3d/.noise4d
import { ImprovedNoise }   from 'three/examples/jsm/math/ImprovedNoise.js';        // .noise(x,y,z)
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
```
Not available / not installed: N8AO (external npm pkg — do not add), `three/webgpu`
path exists but WebGPURenderer is out of scope (CSM module is WebGL-only anyway).
