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
// 140° put the sun almost directly BEHIND the standard chase/establishing
// cameras (which look NE, azimuth ~25°): frontal key light is the flattest
// possible setup — no visible form shading and every cast shadow hides behind
// its caster ("village looks pasted on", critique r2). 115° = 90° off the
// battlefield camera axis: a true side key. Shaded faces turn toward the
// camera and building/tree/pole shadows rake laterally across the frame.
const SUN_AZIMUTH_DEG = 115;
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
// Even after SKY_RADIANCE_SCALE the Mie halo around the sun spans hundreds of
// bloom-threshold-crossing pixels — UnrealBloom smears that huge area into a
// half-frame white-out whenever the camera faces the sun azimuth. Soft-knee
// compress the DOME's luminance: below SKY_KNEE untouched, above it an
// exponential shoulder asymptoting at SKY_KNEE + SKY_KNEE_RANGE = 1.6. The
// halo (lum ~2-6) lands ~1.2-1.35 → under the 1.35 bloom threshold, while the
// actual sun disc (lum >> 100) still reaches ~1.6 → blooms locally, reading
// as a compact bright disc + halo instead of a screen-edge blowout. Scene
// emissives (muzzle flash, tracers, fire) are untouched — Sky shader only.
const SKY_KNEE = 1.2;
const SKY_KNEE_RANGE = 0.4;
const SKY_KNEE_FALLOFF = 0.125; // 1/e width of the shoulder in luminance units
const SKY_FRAG_ANCHOR = 'gl_FragColor = vec4( texColor, 1.0 );';
const SKY_DOME_SCALE = 10000; // must stay inside camera.far
const ENV_SKY_SCALE = 50; // PMREMGenerator.fromScene far plane = 100
// IBL is fill, not key: at 1.1 it buried the sun's shadows in a flat milky
// wash, and even 0.45 diluted open-ground shadows to a ~1.3:1 luma ratio.
// 0.28 (with hemi 0.20, sun 4.2) keeps ~2:1 shadows — enough to anchor
// objects — without crushing backlit armor/foliage to black.
const ENV_INTENSITY = 0.28;
// Exponential fog replaces the old linear Fog(150, 1200) that whited out the
// midground by ~300 m. Density tuned so ~10% at 400 m, ~50% at 900 m.
const FOG_DENSITY = 0.00088;
// Aerial perspective: pull the sampled horizon color toward a desaturated
// blue so distance reads as cool atmosphere, never as white-out.
const FOG_BLUE_TINT_HEX = 0x7e97b8;
const FOG_BLUE_MIX = 0.55;
const HORIZON_RT_SIZE = 16;
const FALLBACK_HORIZON_HEX = 0xc4d3dd; // hand-tuned noon-hazy, doc §5 option (b)
// Procedural cumulus layer (r2 critique: "sky is a bare blue gradient, cloud
// noise reads as banding smears"). A seeded 3-octave FBM field, thresholded
// into clump shapes and lit by an emboss toward the sun, is baked once into a
// canvas and draped on an inside-out sphere between the terrain and the Sky
// dome. Deterministic (fixed seed), self-contained, tone-mapped with the
// scene, and always below the bloom threshold.
const CLOUD_SEED = 777;
const CLOUD_TEX_W = 1024;
const CLOUD_TEX_H = 512;
const CLOUD_COVER_LO = 0.55; // fbm threshold where cloud alpha starts
const CLOUD_COVER_HI = 0.70; // fbm value of a fully opaque cloud core
const CLOUD_DOME_RADIUS = 3400; // inside camera.far (4000), outside the map
const CLOUD_MAX_ALPHA = 0.9;

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
      `vec3 skyCol = texColor * ${SKY_RADIANCE_SCALE.toFixed(4)};
	float skyL = dot( skyCol, vec3( 0.2126, 0.7152, 0.0722 ) );
	if ( skyL > ${SKY_KNEE.toFixed(3)} ) {
		skyCol *= ( ${SKY_KNEE.toFixed(3)} + ${SKY_KNEE_RANGE.toFixed(3)} * ( 1.0 - exp( -( skyL - ${SKY_KNEE.toFixed(3)} ) * ${SKY_KNEE_FALLOFF.toFixed(4)} ) ) ) / skyL;
	}
	gl_FragColor = vec4( skyCol, 1.0 );`,
    );
    if (patched === shader.fragmentShader) {
      throw new Error('sky.js: radiance-scale injection anchor not found in Sky shader');
    }
    shader.fragmentShader = patched;
  };
  sky.material.needsUpdate = true;
}

/** Deterministic PRNG (Mulberry32). @param {number} a seed @returns {() => number} */
function mulberry32(a) {
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Bake the cumulus texture: X-tileable value-noise FBM → clump threshold →
 * sun-side emboss lighting → warm-lit tops / cool shaded bellies.
 *
 * @param {THREE.Vector3} sunDir - unit toward-sun vector (for the lit side)
 * @returns {THREE.CanvasTexture}
 */
function makeCloudTexture(sunDir) {
  const W = CLOUD_TEX_W;
  const H = CLOUD_TEX_H;
  const rng = mulberry32(CLOUD_SEED);

  // X-tileable value noise lattices, one per octave
  const OCTAVES = 4;
  const BASE = 6;
  const lattices = [];
  for (let o = 0; o < OCTAVES; o++) {
    const n = BASE << o;
    const grid = new Float32Array(n * (n / 2 + 2));
    for (let i = 0; i < grid.length; i++) grid[i] = rng();
    lattices.push({ n, grid });
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  function noise(o, u, v) {
    const { n, grid } = lattices[o];
    const rows = n / 2 + 1;
    const x = u * n;
    const y = v * (rows - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const xa = x0 % n;
    const xb = (x0 + 1) % n;
    const ya = Math.min(y0, rows - 1);
    const yb = Math.min(y0 + 1, rows - 1);
    const g00 = grid[ya * n + xa];
    const g10 = grid[ya * n + xb];
    const g01 = grid[yb * n + xa];
    const g11 = grid[yb * n + xb];
    return g00 + (g10 - g00) * fx + (g01 - g00) * fy + (g00 - g10 - g01 + g11) * fx * fy;
  }
  function fbm(u, v) {
    let sum = 0;
    let amp = 0.55;
    let tot = 0;
    for (let o = 0; o < OCTAVES; o++) {
      sum += noise(o, (u + o * 0.37) % 1, v) * amp;
      tot += amp;
      amp *= 0.55;
    }
    return sum / tot;
  }
  const density = (u, v) => {
    const d = (fbm(u, v) - CLOUD_COVER_LO) / (CLOUD_COVER_HI - CLOUD_COVER_LO);
    return d < 0 ? 0 : (d > 1 ? 1 : d);
  };

  // Lighting emboss is vertical (sample slightly toward the zenith): cloud
  // tops/sun-facing shoulders read lit, bellies read shaded. A longitude-
  // dependent emboss would need a sign flip at the anti-sun meridian, which
  // bakes a visible vertical seam into the dome — vertical-only is seamless.

  const cnv = document.createElement('canvas');
  cnv.width = W;
  cnv.height = H;
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(W, H);
  const px = img.data;
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1);
    // fade clouds out toward the horizon band so they melt into the haze
    // instead of clipping against the terrain silhouette (r2: "abrupt")
    const horizonFade = 1 - smoothstepNum(0.62, 0.97, v);
    // and thin them near the zenith pole to hide UV pinching
    const zenithFade = smoothstepNum(0.02, 0.14, v);
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const d = density(u, v);
      const o = (y * W + x) * 4;
      if (d <= 0) {
        px[o + 3] = 0;
        continue;
      }
      const lit = density(u, Math.max(0, v - 5 / H)) - d;
      const bright = clampNum(0.9 + lit * 2.4 - d * 0.38, 0.5, 1.0);
      // warm-white lit faces, cool grey-blue shaded bellies
      const cool = clampNum(1 - bright, 0, 1);
      px[o] = Math.round(255 * bright * (1 - 0.06 * cool));
      px[o + 1] = Math.round(255 * bright * (1 - 0.03 * cool));
      px[o + 2] = Math.round(255 * Math.min(1, bright * (1 + 0.10 * cool)));
      px[o + 3] = Math.round(255 * CLOUD_MAX_ALPHA * d * horizonFade * zenithFade);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** Numeric smoothstep. @param {number} a @param {number} b @param {number} x @returns {number} */
function smoothstepNum(a, b, x) {
  const t = clampNum((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Numeric clamp. @param {number} x @param {number} lo @param {number} hi @returns {number} */
function clampNum(x, lo, hi) {
  return x < lo ? lo : (x > hi ? hi : x);
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

  // Cumulus layer: inside-out sphere between the terrain and the Sky dome.
  // Transparent (renders after opaques, over the Sky box), never writes
  // depth, ignores fog (it fades itself into the horizon band instead).
  const cloudTex = makeCloudTexture(sunDir);
  const cloudMat = new THREE.MeshBasicMaterial({
    map: cloudTex,
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(CLOUD_DOME_RADIUS, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.52),
    cloudMat,
  );
  clouds.name = 'cloudLayer';
  clouds.frustumCulled = false;
  clouds.userData.aoExclude = true; // GTAO's override prepass ignores alpha
  scene.add(clouds);

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
