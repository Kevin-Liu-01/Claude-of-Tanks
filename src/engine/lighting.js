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

const CASCADES = 3;
const SHADOW_MAX_FAR_M = 250; // ≲ fog end so shadows never pop in unfogged range
const SHADOW_MAP_SIZE = 2048;
const SHADOW_BIAS = -0.0002;
const SHADOW_NORMAL_BIAS = 0.02; // kills acne on terrain slopes (CSM only exposes shadowBias)
const SUN_INTENSITY = 3; // ACES-friendly high-sun value (physically based r185 lighting)
const HEMI_SKY_COLOR = 0xbfd5ff;
const HEMI_GROUND_COLOR = 0x8c7a5b;
const HEMI_INTENSITY = 0.45;

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
