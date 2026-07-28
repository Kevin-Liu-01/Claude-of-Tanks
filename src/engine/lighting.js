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
import { getPreset, onPresetChange } from './quality.js';

const CASCADES = 4;
// Battlefield establishing shots read objects out to ~500 m; with the clearer
// exp2 fog (sky.js) shadows must hold that far or buildings/trees float.
// PERF: shadow range and per-cascade map sizes now come from the graphics
// quality preset (src/engine/quality.js — ultra/high keep the tuned
// 520 m / [4096,4096,2048,2048]; medium/low trade range+resolution for fill
// rate). The two FAR cascades cover 100s of meters — one texel is already
// subpixel on a 1080p screen out there, so halving their resolution is
// visually free and saves 96 MB of GPU RTs plus shadow fill rate. (CSM's
// texel-snap uses the uniform near-cascade grid; the finer snap on a smaller
// far map is a <1-texel offset at 250m+ — subpixel.)
// PERF: far cascades re-render every OTHER frame (round-robin, one per frame)
// — they hold ~2/3 of all shadow draw calls, and one frame of staleness at
// 250-520 m is a fraction of a texel of camera motion. Near cascades (player
// tank, closeups) still update every frame. `update(true)` forces both far
// cascades (shot mode / map switch / FOV change) for deterministic captures.
const FAR_CASCADE_START = 2;
const SHADOW_BIAS = -0.0002;
const SHADOW_NORMAL_BIAS = 0.045; // kills acne on terrain slopes (CSM only exposes shadowBias)
// r4 penumbra: r185's PCF getShadow() is a 5-tap Vogel disk rotated per-pixel
// by interleaved gradient noise, and its disk radius comes straight from
// `shadow.radius` (in shadow-map texels). The default 1.0 produced razor-hard
// edges at every distance ("single untuned shadow map" read). Radii widen per
// cascade — a cheap PCSS-style distance-widening approximation.
// r5: [2.2, 3.0, 3.6, 4.2] → [1.3, 1.7, 2.1, 2.5] — pole/tree shadows read as
// "extremely wide, over-blurred dark stripes" and the tank shadow had no
// crisp contact core. Penumbra width must track occluder thickness, not
// drown it: near-cascade contact shadows now stay tight under the hull, and
// the far cascades (bumped to 4096 in quality.js so their texels shrank 2x)
// keep a modest distance softening instead of a smear.
// r6: [1.3, 1.7, 2.1, 2.5] → [1.5, 2.2, 3.0, 3.8] — the r5 values swung too
// tight: fence/pole shadows read "uniformly hard at every distance, no
// penumbra widening". Cascade 0 keeps a near-crisp contact core (1.5 texels
// on a 4096 map is ~2 cm of penumbra); the widening now roughly DOUBLES per
// cascade band, the PCSS-style distance ramp, and cascades 1-2 run at 4096
// (quality.js) so even 3.0 texels stays a soft edge, not a smear.
const SHADOW_RADII = [1.5, 2.2, 3.0, 3.8];
// Key-to-fill ratio is THE readability lever: the warm sun must dominate the
// cool sky ambient ~7-8:1 so cast shadows and form shading actually register
// after ACES. Pixel-measured on the battlefield shot: at 3.2/0.26/0.45 the
// lit:shadow luma ratio on open grass was only ~1.3:1 (shadows read as faint
// smudges); at 4.2/0.14/0.22 it lands ~2.3:1 — the WoT footage ballpark.
// Ambient fill lives in hemi (below) + sky.js ENV_INTENSITY.
const SUN_INTENSITY = 4.5;
const SUN_COLOR = 0xfff1dc; // warm noon-afternoon key
const HEMI_SKY_COLOR = 0xaac8f5; // cool sky fill against the warm key
const HEMI_GROUND_COLOR = 0x8c7a5b;
// r3 rebalance: fill shifted FROM the omnidirectional IBL (sky.js
// ENV_INTENSITY 0.28 → 0.20 — omni fill is what flattened building/hull form
// at midrange) TO the hemisphere (0.20 → 0.32), whose sky-above/ground-below
// split keeps form shading directional: shadowed faces go cooler AND darker
// instead of just dimmer. Sun 4.2 → 4.5 keeps the key:fill ratio ~3:1+ and
// lifts the amorphous near-black canopy-shadow masses out of the crushed
// range (they read as artifacts, not shade, at hemi 0.2).
// r6: 0.32 → 0.36 — with the punchier grade S-curve (post.js GRADE_CONTRAST
// 1.34) canopy-shadow interiors were crushing to structureless near-black
// masses ("blotchy dark patch" read); a small hemisphere lift keeps color and
// grass detail alive inside shade while the key:fill ratio stays ~2:1 on
// open ground after ACES.
const HEMI_INTENSITY = 0.36;
// Backlit-rescue fill: a shadowless DirectionalLight from the anti-sun azimuth
// at ~30° elevation. Sun-shadowed VERTICAL faces (tree canopies, barn walls,
// hay bales seen against the light) currently drop to hemi+IBL only (~5% of
// sky luminance) and render as pure black cutouts in sniper view. A counter
// fill mostly hits exactly those anti-sun-facing surfaces (dot ≈ 0 for
// ground/up-facing geometry), so ground-shadow contrast — the 2.3:1 luma
// ratio tuned above — is preserved while backlit silhouettes lift to ~15-20%.
// CSM-safe: three's CSMShader lights all directionals beyond
// NUM_DIR_LIGHT_SHADOWS through a dedicated non-shadow loop.
const FILL_COLOR = 0xbdd2f2; // same cool-sky family as the hemi
// r3: 1.0 → 0.55. At 1.0 the anti-sun fill lit shadowed building walls and
// hull sides to ~25% of key — the "shadowed faces nearly the same luminance
// as sunlit faces" flatness the critic flagged. 0.55 (with hemi raised to
// 0.32) still lifts backlit canopies/walls out of black but restores a clear
// lit-vs-shaded form step at midrange.
// r6: 0.55 → 0.65 — the closeup orbit cameras sit on the anti-sun side; with
// the deeper grade the shadowed hull flank dropped near-black. 0.65 keeps a
// clear lit-vs-shaded step (r3's flatness came at 1.0) while armor detail on
// the shade side stays readable.
const FILL_INTENSITY = 0.65;
// Low elevation (~17°): vertical anti-sun faces catch ~cos(17°) ≈ 0.96 of the
// fill while up-facing ground only gets sin(17°) ≈ 0.29 — backlit walls and
// canopies lift out of black without flattening ground-shadow contrast.
const FILL_ELEV_Y = 70;
const FILL_HORIZ_M = 230;

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
  const preset = getPreset();
  const csm = new CSM({
    camera,
    parent: scene,
    cascades: CASCADES,
    maxFar: preset.shadowMaxFar,
    mode: 'practical',
    shadowMapSize: preset.shadowMapSizes[0],
    shadowBias: SHADOW_BIAS,
    lightDirection: sunDir.clone().negate().normalize(), // CSM wants FROM-sun direction
    lightIntensity: SUN_INTENSITY,
  });
  csm.fade = true;
  csm.updateFrustums(); // required after changing fade

  /** Apply per-cascade shadow map sizes; dispose old RTs so three reallocates. */
  function applyShadowSizes(sizes) {
    for (let i = 0; i < csm.lights.length; i++) {
      const size = sizes[Math.min(i, sizes.length - 1)];
      const shadow = csm.lights[i].shadow;
      if (shadow.mapSize.x !== size) {
        shadow.mapSize.set(size, size);
        if (shadow.map) {
          shadow.map.dispose();
          shadow.map = null;
        }
        shadow.needsUpdate = true;
      }
    }
    csm.shadowMapSize = sizes[0]; // texel-snap grid follows the near cascades
  }

  for (let i = 0; i < csm.lights.length; i++) {
    csm.lights[i].shadow.normalBias = SHADOW_NORMAL_BIAS;
    csm.lights[i].shadow.radius = SHADOW_RADII[Math.min(i, SHADOW_RADII.length - 1)];
    csm.lights[i].color.setHex(SUN_COLOR);
    // PERF: far cascades update round-robin via needsUpdate (see update())
    if (i >= FAR_CASCADE_START) {
      csm.lights[i].shadow.autoUpdate = false;
      csm.lights[i].shadow.needsUpdate = true; // first frame renders all
    }
  }
  // PERF: per-cascade map size (before the first render allocates the RTs)
  applyShadowSizes(preset.shadowMapSizes);
  // Live quality switching (settings UI → quality.setPresetName)
  onPresetChange((p) => {
    applyShadowSizes(p.shadowMapSizes);
    if (csm.maxFar !== p.shadowMaxFar) {
      csm.maxFar = p.shadowMaxFar;
      csm.updateFrustums();
    }
    forceFarCascades();
  });
  let rrIndex = 0; // round-robin cursor over the far cascades

  /** Mark every throttled (far) cascade for re-render on the next frame. */
  function forceFarCascades() {
    for (let i = FAR_CASCADE_START; i < csm.lights.length; i++) {
      csm.lights[i].shadow.needsUpdate = true;
    }
  }

  const hemi = new THREE.HemisphereLight(HEMI_SKY_COLOR, HEMI_GROUND_COLOR, HEMI_INTENSITY);
  scene.add(hemi);

  // Anti-sun sky fill (see FILL_* above): castShadow stays false — it must
  // sort AFTER the CSM cascade lights so the CSM shader treats it as a plain
  // directional light.
  const fill = new THREE.DirectionalLight(FILL_COLOR, FILL_INTENSITY);
  fill.castShadow = false;
  {
    const fx = -sunDir.x;
    const fz = -sunDir.z;
    const fl = Math.hypot(fx, fz) || 1;
    fill.position.set((fx / fl) * FILL_HORIZ_M, FILL_ELEV_Y, (fz / fl) * FILL_HORIZ_M);
  }
  fill.target.position.set(0, 0, 0);
  scene.add(fill);
  scene.add(fill.target);

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
     * @param {boolean} [force=false] - re-render ALL cascades this frame
     *   (deterministic screenshot captures); otherwise the two far cascades
     *   alternate, one per frame.
     * @returns {void}
     */
    update(force = false) {
      csm.update();
      if (force) {
        forceFarCascades();
      } else {
        const span = csm.lights.length - FAR_CASCADE_START;
        if (span > 0) {
          rrIndex = (rrIndex + 1) % span;
          csm.lights[FAR_CASCADE_START + rrIndex].shadow.needsUpdate = true;
        }
      }
    },

    /**
     * Recompute cascade splits. Call whenever `camera.fov`, `camera.aspect`
     * or `camera.far` changes (window resize, sniper zoom FOV change).
     * @returns {void}
     */
    updateFrustums() {
      csm.updateFrustums();
      forceFarCascades(); // cascade boxes jumped — stale far maps would smear
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

    /**
     * Re-target the light rig to a map's sky preset (map switch): sun
     * direction (CSM cascades follow on the next update()), sun color +
     * intensity, hemisphere fill, and the anti-sun rescue fill position.
     * @param {THREE.Vector3} dir unit vector FROM origin TOWARD the sun
     * @param {{sunIntensity?:number, sunColorHex?:number, hemiIntensity?:number}} [opts]
     * @returns {void}
     */
    setSun(dir, opts = {}) {
      csm.lightDirection.copy(dir).negate().normalize();
      const intensity = opts.sunIntensity ?? SUN_INTENSITY;
      const colorHex = opts.sunColorHex ?? SUN_COLOR;
      csm.lightIntensity = intensity;
      for (let k = 0; k < csm.lights.length; k++) {
        csm.lights[k].intensity = intensity;
        csm.lights[k].color.setHex(colorHex);
      }
      hemi.intensity = opts.hemiIntensity ?? HEMI_INTENSITY;
      const fx = -dir.x, fz = -dir.z;
      const fl = Math.hypot(fx, fz) || 1;
      fill.position.set((fx / fl) * FILL_HORIZ_M, FILL_ELEV_Y, (fz / fl) * FILL_HORIZ_M);
      csm.update();
      forceFarCascades(); // sun moved — every cascade must re-render
    },

    hemi,
  };
}
