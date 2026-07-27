/**
 * lighting.js — sun (cascaded shadow maps) + hemisphere bounce light.
 *
 * Implements docs/research/graphics-aaa.md §2–§3 and ARCHITECTURE.md §3.1.2.
 * The CSM module owns the sun DirectionalLights — nothing else in the game may
 * add a second directional sun. CSM is constructed synchronously inside
 * `createLighting` (never deferred) so it patches the lighting shader chunks
 * before any lit material compiles.
 */
import * as THREE from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';

const CASCADES = 4;
// Battlefield establishing shots read objects out to ~500 m; with the clearer
// exp2 fog (sky.js) shadows must hold that far or buildings/trees float.
const SHADOW_MAX_FAR_M = 520;
const SHADOW_MAP_SIZE = 4096;
const SHADOW_BIAS = -0.0002;
const SHADOW_NORMAL_BIAS = 0.035; // kills acne on terrain slopes (CSM only exposes shadowBias)
// Key-to-fill ratio is THE readability lever: the warm sun must dominate the
// cool sky ambient ~7-8:1 so cast shadows and form shading actually register
// after ACES. Pixel-measured on the battlefield shot: at 3.2/0.26/0.45 the
// lit:shadow luma ratio on open grass was only ~1.3:1 (shadows read as faint
// smudges); at 4.2/0.14/0.22 it lands ~2.3:1 — the WoT footage ballpark.
// Ambient fill lives in hemi (below) + sky.js ENV_INTENSITY.
const SUN_INTENSITY = 4.2;
const SUN_COLOR = 0xfff1dc; // warm noon-afternoon key
const HEMI_SKY_COLOR = 0xb4cdf2; // cool sky fill against the warm key
const HEMI_GROUND_COLOR = 0x8c7a5b;
// 0.14 measured best-case shadow contrast but crushed backlit hull sides and
// conifer canopies to undifferentiated black; 0.20 keeps ~2:1 ground shadows
// while shaded armor still shows camo readably.
const HEMI_INTENSITY = 0.2;

/**
 * Build a coverage-preserving mip chain for an alpha-tested foliage texture.
 *
 * Default GPU box-filtered mips flatten a cutout card's alpha toward its mean:
 * past a few levels the whole quad's alpha sits on one side of `alphaTest`, so
 * distant grass/leaf cards pop into SOLID RECTANGLES of the flood color (the
 * sniper-view "boxes around every grass billboard" shipping blocker) or vanish
 * entirely. Classic fix (NVIDIA alpha-mipmap technique): per level, remap
 * alpha so the fraction of texels passing the cutoff matches level 0's
 * coverage, keeping the blade/leaf silhouette readable at every distance.
 *
 * @param {THREE.Texture} tex - CanvasTexture with an alpha cutout (square, POT)
 * @param {number} cutoff - the material's alphaTest reference (0..1)
 * @returns {void}
 */
function buildCoverageMipmaps(tex, cutoff) {
  const img = tex.image;
  if (!img || !img.width || (tex.mipmaps && tex.mipmaps.length > 0)) return;
  const size = img.width;
  if (size !== img.height || (size & (size - 1)) !== 0) return; // square POT only

  const cnv = document.createElement('canvas');
  cnv.width = size;
  cnv.height = size;
  const ctx = cnv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const level0 = ctx.getImageData(0, 0, size, size);

  const cutByte = Math.round(cutoff * 255);
  let passing = 0;
  const d0 = level0.data;
  for (let i = 3; i < d0.length; i += 4) if (d0[i] >= cutByte) passing++;
  const targetCov = passing / (d0.length / 4);

  const chain = [level0];
  let prev = level0;
  let s = size;
  while (s > 1) {
    s >>= 1;
    const cur = new ImageData(s, s);
    const pd = prev.data;
    const cd = cur.data;
    const pw = s * 2;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i00 = ((y * 2) * pw + x * 2) * 4;
        const i10 = i00 + 4;
        const i01 = i00 + pw * 4;
        const i11 = i01 + 4;
        const o = (y * s + x) * 4;
        for (let k = 0; k < 4; k++) {
          cd[o + k] = (pd[i00 + k] + pd[i10 + k] + pd[i01 + k] + pd[i11 + k] + 2) >> 2;
        }
      }
    }
    if (targetCov > 0 && s >= 2) {
      // Only correct levels whose pass-coverage actually drifted from level 0
      // (box-filtering pulls it toward all-pass or all-fail). Quantile-anchored
      // contrast: texels above the coverage quantile pass the cutoff, the rest
      // fall away — restores level-0 coverage while keeping internal
      // silhouette variation instead of an all-or-nothing rectangle.
      let pass = 0;
      for (let i = 3; i < cd.length; i += 4) if (cd[i] >= cutByte) pass++;
      const covNow = pass / (cd.length / 4);
      if (covNow < targetCov * 0.7 || covNow > targetCov * 1.3) {
        const alphas = [];
        for (let i = 3; i < cd.length; i += 4) alphas.push(cd[i]);
        alphas.sort((a, b) => b - a);
        const qi = Math.min(alphas.length - 1, Math.max(0, Math.round(targetCov * alphas.length) - 1));
        const q = Math.max(1, alphas[qi]);
        const boost = 3;
        for (let i = 3; i < cd.length; i += 4) {
          const v = cutByte + (cd[i] - q) * boost;
          cd[i] = v < 0 ? 0 : (v > 255 ? 255 : v);
        }
      }
    }
    chain.push(cur);
    prev = cur;
  }

  tex.mipmaps = chain;
  tex.generateMipmaps = false;
  tex.anisotropy = Math.max(tex.anisotropy, 8); // sharpen grazing-angle minification
  tex.needsUpdate = true;
}

/**
 * @typedef {object} Lighting
 * @property {CSM} csm - the cascaded-shadow-map instance (3×2048 cascades)
 * @property {(mat: THREE.Material, extraHook?: ?Function) => THREE.Material} setupShadowMaterial
 * @property {() => void} update - per-frame `csm.update()`; call AFTER the camera is final
 * @property {() => void} updateFrustums - call on resize / camera fov or aspect change
 * @property {(i: number) => void} setSunIntensity
 * @property {THREE.HemisphereLight} hemi
 */

/**
 * Build the full light rig: CSM sun cascades + hemisphere sky/ground bounce.
 * (IBL ambient comes from sky.js's PMREM environment bake — third layer.)
 *
 * Must be called before any lit material is compiled: CSM globally patches
 * `ShaderChunk.lights_fragment_begin/lights_pars_begin` at construction and
 * program cache keys must stay stable.
 *
 * @param {THREE.Scene} scene - CSM parents its DirectionalLights here
 * @param {THREE.PerspectiveCamera} camera - the gameplay camera (cascade fitting)
 * @param {THREE.Vector3} sunDir - unit vector FROM the origin TOWARD the sun
 * @returns {Lighting}
 */
export function createLighting(scene, camera, sunDir) {
  const csm = new CSM({
    camera,
    parent: scene,
    cascades: CASCADES,
    maxFar: SHADOW_MAX_FAR_M,
    mode: 'practical',
    shadowMapSize: SHADOW_MAP_SIZE,
    shadowBias: SHADOW_BIAS,
    lightDirection: sunDir.clone().negate().normalize(), // CSM wants FROM-sun direction
    lightIntensity: SUN_INTENSITY,
  });
  csm.fade = true;
  csm.updateFrustums(); // required after changing fade

  for (let i = 0; i < csm.lights.length; i++) {
    csm.lights[i].shadow.normalBias = SHADOW_NORMAL_BIAS;
    csm.lights[i].color.setHex(SUN_COLOR);
  }

  const hemi = new THREE.HemisphereLight(HEMI_SKY_COLOR, HEMI_GROUND_COLOR, HEMI_INTENSITY);
  scene.add(hemi);

  return {
    csm,

    /**
     * Register a material for cascaded shadows, then (optionally) chain a
     * custom `onBeforeCompile` shader-injection hook AFTER the CSM hook —
     * the required wrap pattern from graphics-aaa.md §3, since
     * `csm.setupMaterial` assigns `material.onBeforeCompile` itself.
     *
     * @param {THREE.Material} mat - any lit material (MeshStandardMaterial etc.)
     * @param {?((shader: object, renderer: THREE.WebGLRenderer) => void)} [extraHook=null]
     *   custom shader patch (terrain splat, grass wind, …), run after CSM's hook
     * @returns {THREE.Material} the same material, for chaining
     */
    setupShadowMaterial(mat, extraHook = null) {
      csm.setupMaterial(mat);
      if (extraHook) {
        const csmHook = mat.onBeforeCompile;
        mat.onBeforeCompile = (shader, rdr) => {
          csmHook(shader, rdr);
          extraHook(shader, rdr);
        };
      }
      // Alpha-tested foliage: replace the GPU-averaged mip chain with a
      // coverage-preserving one so distant cards keep their cutout silhouette
      // instead of resolving to solid alpha-flood rectangles (see
      // buildCoverageMipmaps). Idempotent — skips textures already fixed.
      if (mat.alphaTest > 0 && mat.map && mat.map.image) {
        buildCoverageMipmaps(mat.map, mat.alphaTest);
      }
      return mat;
    },

    /**
     * Per-frame cascade refit. Call after the camera's world matrix is final
     * for the frame (ARCHITECTURE.md §4 step 9) and before `post.render`.
     * @returns {void}
     */
    update() {
      csm.update();
    },

    /**
     * Recompute cascade splits. Call whenever `camera.fov`, `camera.aspect`
     * or `camera.far` changes (window resize, sniper zoom FOV change).
     * @returns {void}
     */
    updateFrustums() {
      csm.updateFrustums();
    },

    /**
     * Set the sun's intensity across all cascade lights (e.g. ~1.5 for a low
     * sun preset, 3 for high noon).
     * @param {number} i - DirectionalLight intensity, physically-based scale
     * @returns {void}
     */
    setSunIntensity(i) {
      csm.lightIntensity = i;
      for (let k = 0; k < csm.lights.length; k++) csm.lights[k].intensity = i;
    },

    hemi,
  };
}
