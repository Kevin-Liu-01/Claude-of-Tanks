/**
 * sky.js — procedural atmosphere: visible sky dome, PMREM environment bake
 * (the IBL ambient layer), and horizon-matched fog.
 *
 * Implements docs/research/graphics-aaa.md §2.3 and §5, ARCHITECTURE.md §3.1.3.
 * Sun is fixed for the map: elevation 35°, azimuth 140°.
 *
 * The fog color is SAMPLED from the actual sky shader (doc §5 option (a)):
 * the sky is rendered once to a 16×16 render target through a horizontal
 * camera facing away from the sun, and the middle row is averaged. Rendering
 * to an offscreen target skips tone mapping and output encoding, so the bytes
 * read back are linear-light values — exactly the space `scene.fog` wants.
 * This guarantees the terrain edge dissolves into the sky instead of banding
 * against it, for any sky parameter tweak, deterministically.
 */
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

const SUN_ELEVATION_DEG = 32; // slightly lower sun → longer, more readable shadows
const SUN_AZIMUTH_DEG = 140;
const TURBIDITY = 4; // hazy but not white-out
const RAYLEIGH = 1.2;
const MIE_COEFFICIENT = 0.006; // visible sun disc + warm halo at the sun azimuth
const MIE_DIRECTIONAL_G = 0.82;
// The Sky shader emits radiance well above 1.0 across the whole dome at
// exposure 1.0 (the upstream demo runs exposure 0.5). Left unscaled it (a)
// clamps the horizon-fog readback to pure white and (b) makes UnrealBloom
// smear the entire sky. Scale the dome's output back into ACES-friendly range
// and compensate the environment bake with a higher ENV_INTENSITY.
const SKY_RADIANCE_SCALE = 0.38;
const SKY_FRAG_ANCHOR = 'gl_FragColor = vec4( texColor, 1.0 );';
const SKY_DOME_SCALE = 10000; // must stay inside camera.far
const ENV_SKY_SCALE = 50; // PMREMGenerator.fromScene far plane = 100
// IBL is fill, not key: at 1.1 it buried the sun's shadows in a flat milky
// wash. 0.45 keeps specular sky response while letting CSM shadows read.
const ENV_INTENSITY = 0.45;
// Exponential fog replaces the old linear Fog(150, 1200) that whited out the
// midground by ~300 m. Density tuned so ~10% at 400 m, ~50% at 900 m.
const FOG_DENSITY = 0.00088;
// Aerial perspective: pull the sampled horizon color toward a desaturated
// blue so distance reads as cool atmosphere, never as white-out.
const FOG_BLUE_TINT_HEX = 0x7e97b8;
const FOG_BLUE_MIX = 0.55;
const HORIZON_RT_SIZE = 16;
const FALLBACK_HORIZON_HEX = 0xc4d3dd; // hand-tuned noon-hazy, doc §5 option (b)

/**
 * @typedef {object} SkyRig
 * @property {THREE.Vector3} sunDir - unit vector FROM origin TOWARD the sun (fixed)
 * @property {() => void} bakeEnvironment - PMREM bake; sets `scene.environment`
 * @property {THREE.Color} horizonColor - linear-space sky color at the horizon
 * @property {(scene: THREE.Scene) => void} applyFog - installs horizon-matched linear fog
 */

/** Apply the shared atmosphere parameters to a Sky instance. @param {Sky} sky @param {THREE.Vector3} sunDir */
function configureSkyUniforms(sky, sunDir) {
  const u = sky.material.uniforms;
  u.turbidity.value = TURBIDITY;
  u.rayleigh.value = RAYLEIGH;
  u.mieCoefficient.value = MIE_COEFFICIENT;
  u.mieDirectionalG.value = MIE_DIRECTIONAL_G;
  u.sunPosition.value.copy(sunDir);
  sky.material.onBeforeCompile = (shader) => {
    const patched = shader.fragmentShader.replace(
      SKY_FRAG_ANCHOR,
      `gl_FragColor = vec4( texColor * ${SKY_RADIANCE_SCALE.toFixed(4)}, 1.0 );`,
    );
    if (patched === shader.fragmentShader) {
      throw new Error('sky.js: radiance-scale injection anchor not found in Sky shader');
    }
    shader.fragmentShader = patched;
  };
  sky.material.needsUpdate = true;
}

/**
 * Render a throwaway sky to a 16×16 target with a horizon-level camera facing
 * away from the sun, average the middle pixel row, and return the linear color.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Vector3} sunDir - unit toward-sun vector
 * @returns {THREE.Color} linear-space horizon color
 */
function sampleHorizonColor(renderer, sunDir) {
  const rt = new THREE.WebGLRenderTarget(HORIZON_RT_SIZE, HORIZON_RT_SIZE, {
    depthBuffer: false,
    stencilBuffer: false,
  });
  const sampleScene = new THREE.Scene();
  const sampleSky = new Sky();
  sampleSky.scale.setScalar(ENV_SKY_SCALE);
  configureSkyUniforms(sampleSky, sunDir);
  sampleScene.add(sampleSky);

  // Horizontal camera looking directly away from the sun's azimuth, at the horizon.
  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, ENV_SKY_SCALE * 2);
  cam.position.set(0, 0, 0);
  cam.lookAt(-sunDir.x, 0, -sunDir.z);
  cam.updateMatrixWorld();

  const prevTarget = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(sampleScene, cam);
  renderer.setRenderTarget(prevTarget);

  const row = new Uint8Array(HORIZON_RT_SIZE * 4);
  renderer.readRenderTargetPixels(rt, 0, HORIZON_RT_SIZE >> 1, HORIZON_RT_SIZE, 1, row);

  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < HORIZON_RT_SIZE; i++) {
    r += row[i * 4];
    g += row[i * 4 + 1];
    b += row[i * 4 + 2];
  }
  const inv = 1 / (HORIZON_RT_SIZE * 255);
  r *= inv;
  g *= inv;
  b *= inv;

  rt.dispose();
  sampleSky.geometry.dispose();
  sampleSky.material.dispose();

  // Guard the degenerate case (context hiccup → black readback): fall back to
  // the hand-tuned preset rather than fogging the world to black.
  if (r + g + b < 0.01) return new THREE.Color(FALLBACK_HORIZON_HEX);
  return new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
}

/**
 * Build the visible sky dome, sample the horizon color, and return the rig
 * that owns the environment bake and fog.
 *
 * Call order (ARCHITECTURE.md §4): createRenderer → createSky →
 * rig.bakeEnvironment() → createLighting(scene, camera, rig.sunDir) → …
 * → rig.applyFog(scene).
 *
 * @param {THREE.Scene} scene - the visible sky dome is added here
 * @param {THREE.WebGLRenderer} renderer - used for the PMREM bake + horizon sample
 * @returns {SkyRig}
 */
export function createSky(scene, renderer) {
  const sunDir = new THREE.Vector3().setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(90 - SUN_ELEVATION_DEG),
    THREE.MathUtils.degToRad(SUN_AZIMUTH_DEG),
  );

  const sky = new Sky();
  sky.scale.setScalar(SKY_DOME_SCALE);
  configureSkyUniforms(sky, sunDir);
  scene.add(sky);

  const horizonColor = sampleHorizonColor(renderer, sunDir);

  let pmrem = null;
  let envTarget = null;

  return {
    sunDir,

    /**
     * Bake the procedural sky into a PMREM environment map and install it as
     * `scene.environment` (the IBL specular-ambient layer — the biggest single
     * AAA-ness lever per graphics-aaa.md §2). Uses a SEPARATE Sky instance
     * scaled to fit PMREMGenerator's internal far plane. Safe to call again
     * (re-bake); the previous target is disposed.
     * @returns {void}
     */
    bakeEnvironment() {
      if (pmrem === null) pmrem = new THREE.PMREMGenerator(renderer);

      const envScene = new THREE.Scene();
      const envSky = new Sky();
      envSky.scale.setScalar(ENV_SKY_SCALE);
      configureSkyUniforms(envSky, sunDir);
      envScene.add(envSky);

      const nextTarget = pmrem.fromScene(envScene);
      if (envTarget !== null) envTarget.dispose();
      envTarget = nextTarget;

      scene.environment = envTarget.texture;
      scene.environmentIntensity = ENV_INTENSITY;

      envSky.geometry.dispose();
      envSky.material.dispose();
    },

    horizonColor,

    /**
     * Install exponential-squared fog: near field stays crisp, distant hills
     * shift toward a cool desaturated blue (aerial perspective) instead of
     * washing to white, and the terrain edge still dissolves toward the
     * sky-sampled horizon color (doc §5).
     * @param {THREE.Scene} targetScene - scene to receive the fog
     * @returns {void}
     */
    applyFog(targetScene) {
      const fogColor = horizonColor.clone()
        .lerp(new THREE.Color(FOG_BLUE_TINT_HEX), FOG_BLUE_MIX);
      targetScene.fog = new THREE.FogExp2(fogColor, FOG_DENSITY);
    },
  };
}
