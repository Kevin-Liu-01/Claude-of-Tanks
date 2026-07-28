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
// Horizon haze treatment (r3 critique: "horizon band blows out to near pure
// white with no hue — reads as fog-card overexposure"). Inside the low-
// elevation band the dome's luminance is soft-compressed to sit ~10-15% below
// white after ACES, and a faint luminance-preserving pale-blue hue floor is
// mixed in so the haze reads as atmosphere, never as blown white. A tiny
// screen-space dither breaks up banding on these low-frequency ramps.
const HAZE_MAX_LUM = 0.80; // linear pre-ACES luminance ceiling in the band
const HAZE_COMPRESS = 0.22; // slope retained above the ceiling
const HAZE_BAND_TOP = 0.14; // direction.y where the haze treatment fades out
const HAZE_TINT = [0.87, 0.92, 1.02]; // pale-blue hue floor (unit-luma-ish)
const HAZE_TINT_MIX = 0.30;
const SKY_DITHER = 0.004; // linear-space dither amplitude ~1 display LSB
const SKY_FRAG_ANCHOR = 'gl_FragColor = vec4( texColor, 1.0 );';
const SKY_DOME_SCALE = 10000; // must stay inside camera.far
const ENV_SKY_SCALE = 50; // PMREMGenerator.fromScene far plane = 100
// IBL is fill, not key: at 1.1 it buried the sun's shadows in a flat milky
// wash, and even 0.45 diluted open-ground shadows to a ~1.3:1 luma ratio.
// r3: 0.28 → 0.20 — omnidirectional IBL fill is the flattest of the three
// ambient layers (it lights shadowed and lit faces identically), so the fill
// budget moved to the directional HemisphereLight (lighting.js hemi 0.32),
// which keeps shadowed faces cooler AND darker. Total fill is unchanged-ish;
// form readability at midrange is not.
const ENV_INTENSITY = 0.2;
// Exponential fog replaces the old linear Fog(150, 1200) that whited out the
// midground by ~300 m. r3: density dropped 0.00088 → 0.00074 — the milky wash
// was flattening the battlefield shot; the distance cue is now shared with
// the depth-driven aerial-perspective pass in post.js (uniform desaturation),
// so the fog itself can stay thinner and keep midground color alive.
const FOG_DENSITY = 0.00074;
// Aerial perspective: pull the sampled horizon color toward a desaturated
// blue so distance reads as cool atmosphere, never as white-out.
const FOG_BLUE_TINT_HEX = 0x7e97b8;
const FOG_BLUE_MIX = 0.55;
const HORIZON_RT_SIZE = 16;
const FALLBACK_HORIZON_HEX = 0xc4d3dd; // hand-tuned noon-hazy, doc §5 option (b)
// Procedural cumulus layer, rebuilt for r3 ("clouds read as blurred airbrush
// smears — no lit tops, no shadowed undersides, no crisp edges"). The old
// soft-ramp emboss is replaced by: domain-warped 5-octave FBM carved by a
// HARD coverage threshold (crisp cauliflower edges), a macro-noise threshold
// modulation so clouds cluster into distinct masses with clear-sky gaps, and
// a per-texel vertical light march toward the sun that yields bright warm
// tops, grey-blue shaded bellies and naturally silver-lined rims. Baked once
// (fixed seed, deterministic) into a canvas and draped on two inside-out
// sphere shells for parallax depth. NOTE: the Sky shader's own built-in cloud
// noise is force-disabled in configureSkyUniforms (cloudCoverage = 0) — it
// was the main source of the airbrush smears.
const CLOUD_SEED = 777;
const CLOUD_TEX_W = 2048;
const CLOUD_TEX_H = 1024;
const CLOUD_THR = 0.535; // base FBM coverage threshold that carves cloud shapes
const CLOUD_EDGE = 0.03; // clear→rim ramp width in FBM units (crisp edge)
const CLOUD_CORE = 0.16; // rim→opaque-core ramp width in FBM units
const CLOUD_CLUSTER = 0.08; // macro-noise threshold modulation (cloud grouping)
const CLOUD_WARP = 0.05; // domain-warp strength (cauliflower edge crinkle)
const CLOUD_MARCH_STEPS = 12; // light-march samples toward the zenith/sun
const CLOUD_MARCH_STEP_PX = 3;
const CLOUD_SHADE_K = 0.30; // optical-depth scale: bright tops, dark bellies
const CLOUD_LIT = [1.0, 0.98, 0.94]; // warm-white sunlit faces
const CLOUD_SHADE = [0.55, 0.62, 0.76]; // cool grey-blue shaded bellies
const CLOUD_DOME_RADIUS = 3400; // inside camera.far (4000), outside the map
const CLOUD_DOME_RADIUS_2 = 3800; // second, farther shell for layered depth
const CLOUD_LAYER2_OPACITY = 0.6;
const CLOUD_LAYER2_YAW = 2.4; // radians — decorrelates the two shells
// Repeats MUST be integers: the cloud texture tiles in X, and a fractional
// repeat puts a mid-texture discontinuity at the sphere's UV wrap — a hard
// vertical seam across the sky. Repeat 2 on the near shell doubles effective
// angular resolution (a 1080p frame sees a ~55° slice of the dome — at
// repeat 1 that is only ~300 texture px stretched across 1920 screen px,
// which reads as airbrush blur no matter how sharp the texture is).
const CLOUD_LAYER1_REPEAT = 2;
const CLOUD_LAYER2_REPEAT = 3; // finer tiling on the far shell
const CLOUD_MAX_ALPHA = 0.94;

/**
 * @typedef {object} SkyRig
 * @property {THREE.Vector3} sunDir - unit vector FROM origin TOWARD the sun (fixed)
 * @property {() => void} bakeEnvironment - PMREM bake; sets `scene.environment`
 * @property {THREE.Color} horizonColor - linear-space sky color at the horizon
 * @property {(scene: THREE.Scene) => void} applyFog - installs horizon-matched linear fog
 */

// Per-map sky preset defaults — map configs (src/world/maps/*) override any
// subset via createSky(...).applyPreset(preset, scene).
const DEFAULT_PRESET = Object.freeze({
  sunElevationDeg: SUN_ELEVATION_DEG,
  sunAzimuthDeg: SUN_AZIMUTH_DEG,
  turbidity: TURBIDITY,
  rayleigh: RAYLEIGH,
  mieCoefficient: MIE_COEFFICIENT,
  mieDirectionalG: MIE_DIRECTIONAL_G,
  fogDensity: FOG_DENSITY,
  fogTintHex: FOG_BLUE_TINT_HEX,
  fogMix: FOG_BLUE_MIX,
  envIntensity: ENV_INTENSITY,
  cloudOpacity: 1.0,
  cloudOpacity2: CLOUD_LAYER2_OPACITY,
  cloudTintHex: 0xffffff,
});

/** Apply the shared atmosphere parameters to a Sky instance. @param {Sky} sky @param {THREE.Vector3} sunDir @param {object} [preset] */
function configureSkyUniforms(sky, sunDir, preset = DEFAULT_PRESET) {
  const u = sky.material.uniforms;
  u.turbidity.value = preset.turbidity;
  u.rayleigh.value = preset.rayleigh;
  u.mieCoefficient.value = preset.mieCoefficient;
  u.mieDirectionalG.value = preset.mieDirectionalG;
  u.sunPosition.value.copy(sunDir);
  // The r180+ Sky shader ships its own screen-projected FBM cloud layer
  // (cloudCoverage defaults to 0.4!) — soft 30%-smoothstep blobs with no
  // shading, the exact "airbrush smear" the critic flagged. Kill it; the
  // shaped cumulus dome below owns clouds.
  if (u.cloudCoverage) u.cloudCoverage.value = 0;
  sky.material.onBeforeCompile = (shader) => {
    const patched = shader.fragmentShader.replace(
      SKY_FRAG_ANCHOR,
      `vec3 skyCol = texColor * ${SKY_RADIANCE_SCALE.toFixed(4)};
	const vec3 lumW = vec3( 0.2126, 0.7152, 0.0722 );
	// horizon haze: compress the near-white band ~10-15% below white and mix
	// in a faint pale-blue hue floor so it reads as atmosphere, not overexposure
	float hazeBand = 1.0 - smoothstep( 0.0, ${HAZE_BAND_TOP.toFixed(3)}, direction.y );
	float hazeL = dot( skyCol, lumW );
	if ( hazeL > ${HAZE_MAX_LUM.toFixed(3)} && hazeBand > 0.001 ) {
		float hazeTarget = ${HAZE_MAX_LUM.toFixed(3)} + ( hazeL - ${HAZE_MAX_LUM.toFixed(3)} ) * ${HAZE_COMPRESS.toFixed(3)};
		skyCol *= mix( 1.0, hazeTarget / hazeL, hazeBand );
	}
	skyCol = mix( skyCol, dot( skyCol, lumW ) * vec3( ${HAZE_TINT[0].toFixed(3)}, ${HAZE_TINT[1].toFixed(3)}, ${HAZE_TINT[2].toFixed(3)} ), hazeBand * ${HAZE_TINT_MIX.toFixed(3)} );
	float skyL = dot( skyCol, lumW );
	if ( skyL > ${SKY_KNEE.toFixed(3)} ) {
		skyCol *= ( ${SKY_KNEE.toFixed(3)} + ${SKY_KNEE_RANGE.toFixed(3)} * ( 1.0 - exp( -( skyL - ${SKY_KNEE.toFixed(3)} ) * ${SKY_KNEE_FALLOFF.toFixed(4)} ) ) ) / skyL;
	}
	// break up gradient banding on the low-frequency sky ramps
	skyCol += ( fract( sin( dot( gl_FragCoord.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) - 0.5 ) * ${SKY_DITHER.toFixed(4)};
	gl_FragColor = vec4( max( skyCol, vec3( 0.0 ) ), 1.0 );`,
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
 * Build an X-tileable multi-octave value-noise FBM sampler.
 *
 * @param {() => number} rng - seeded PRNG that fills the per-octave lattices
 * @param {number} octaves
 * @param {number} base - lattice resolution of octave 0 (doubles per octave)
 * @returns {(u: number, v: number) => number} fbm in ~[0,1], tileable in u
 */
function makeFbm(rng, octaves, base) {
  const lattices = [];
  for (let o = 0; o < octaves; o++) {
    const n = base << o;
    const rows = (n >> 1) + 2;
    const grid = new Float32Array(n * rows);
    for (let i = 0; i < grid.length; i++) grid[i] = rng();
    lattices.push({ n, grid });
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  return function fbm(u, v) {
    let sum = 0;
    let amp = 0.55;
    let tot = 0;
    for (let o = 0; o < octaves; o++) {
      const { n, grid } = lattices[o];
      const rows = (n >> 1) + 1;
      let uu = (u + o * 0.37) % 1;
      if (uu < 0) uu += 1;
      const x = uu * n;
      const y = clampNum(v, 0, 1) * (rows - 1);
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
      sum += (g00 + (g10 - g00) * fx + (g01 - g00) * fy + (g00 - g10 - g01 + g11) * fx * fy) * amp;
      tot += amp;
      amp *= 0.5;
    }
    return sum / tot;
  };
}

/**
 * Bake the cumulus texture (see the CLOUD_* constant block for the recipe):
 * domain-warped FBM carved by a hard coverage threshold into distinct cloud
 * masses, then shaded per-texel by a vertical light march toward the sun —
 * warm-white lit tops, cool grey-blue shaded bellies, silver-lined rims.
 *
 * The light march is vertical (texture v == dome elevation, sun is high):
 * a longitude-dependent march would need a sign flip at the anti-sun
 * meridian, which bakes a visible vertical seam into the dome.
 *
 * @returns {THREE.CanvasTexture}
 */
function makeCloudTexture() {
  const W = CLOUD_TEX_W;
  const H = CLOUD_TEX_H;
  const rng = mulberry32(CLOUD_SEED);
  const fbmD = makeFbm(rng, 6, 8); // density field — primary cloud forms
  const fbmWX = makeFbm(rng, 3, 5); // domain warp u
  const fbmWY = makeFbm(rng, 3, 5); // domain warp v
  const fbmM = makeFbm(rng, 2, 3); // macro clustering (masses + clear gaps)

  // Pass 1 — carve the coverage field. mask = alpha shape (hard edge),
  // core = interior opacity ramp, sigma = optical density for the light march.
  const mask = new Float32Array(W * H);
  const core = new Float32Array(W * H);
  const sigma = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1);
    for (let x = 0; x < W; x++) {
      const u = x / W;
      let wu = (u + (fbmWX(u, v) - 0.5) * CLOUD_WARP) % 1;
      if (wu < 0) wu += 1;
      const wv = clampNum(v + (fbmWY(u, v) - 0.5) * CLOUD_WARP, 0, 1);
      const d = fbmD(wu, wv);
      const thr = CLOUD_THR + (fbmM(u, v) - 0.5) * 2 * CLOUD_CLUSTER;
      const i = y * W + x;
      const m = smoothstepNum(thr, thr + CLOUD_EDGE, d);
      const c = smoothstepNum(thr + CLOUD_EDGE, thr + CLOUD_EDGE + CLOUD_CORE, d);
      mask[i] = m;
      core[i] = c;
      sigma[i] = m * (0.3 + 0.7 * c);
    }
  }

  // Pass 2 — shade + write pixels. Transmittance from the accumulated density
  // above each texel: tops and thin rims stay near 1 (bright, silver-lined),
  // texels under thick cloud fall toward 0 (shaded belly).
  const cnv = document.createElement('canvas');
  cnv.width = W;
  cnv.height = H;
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(W, H);
  const px = img.data;
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1);
    // fade clouds out toward the horizon band so they melt into the haze
    // instead of clipping against the terrain silhouette. The band is kept
    // low (v 0.80+ ≈ elevation < 13°) so cumulus visibly march toward the
    // horizon in gameplay-pitch framing instead of hiding at the zenith.
    const horizonFade = 1 - smoothstepNum(0.80, 0.965, v);
    // and thin them near the zenith pole to hide UV pinching
    const zenithFade = smoothstepNum(0.02, 0.10, v);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const o = i * 4;
      const m = mask[i];
      if (m <= 0 || horizonFade <= 0 || zenithFade <= 0) {
        px[o + 3] = 0;
        continue;
      }
      let occl = 0;
      for (let s = 1; s <= CLOUD_MARCH_STEPS; s++) {
        const yy = y - s * CLOUD_MARCH_STEP_PX;
        if (yy < 0) break;
        occl += sigma[yy * W + x];
      }
      const lit = Math.pow(Math.exp(-CLOUD_SHADE_K * occl), 0.85);
      px[o] = Math.round(255 * (CLOUD_SHADE[0] + (CLOUD_LIT[0] - CLOUD_SHADE[0]) * lit));
      px[o + 1] = Math.round(255 * (CLOUD_SHADE[1] + (CLOUD_LIT[1] - CLOUD_SHADE[1]) * lit));
      px[o + 2] = Math.round(255 * (CLOUD_SHADE[2] + (CLOUD_LIT[2] - CLOUD_SHADE[2]) * lit));
      px[o + 3] = Math.round(
        255 * CLOUD_MAX_ALPHA * m * (0.42 + 0.58 * core[i]) * horizonFade * zenithFade,
      );
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
function sampleHorizonColor(renderer, sunDir, preset = DEFAULT_PRESET) {
  const rt = new THREE.WebGLRenderTarget(HORIZON_RT_SIZE, HORIZON_RT_SIZE, {
    depthBuffer: false,
    stencilBuffer: false,
  });
  const sampleScene = new THREE.Scene();
  const sampleSky = new Sky();
  sampleSky.scale.setScalar(ENV_SKY_SCALE);
  configureSkyUniforms(sampleSky, sunDir, preset);
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
  let preset = { ...DEFAULT_PRESET };
  const sunDir = new THREE.Vector3().setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(90 - preset.sunElevationDeg),
    THREE.MathUtils.degToRad(preset.sunAzimuthDeg),
  );

  const sky = new Sky();
  sky.scale.setScalar(SKY_DOME_SCALE);
  configureSkyUniforms(sky, sunDir, preset);
  scene.add(sky);

  // Cumulus layers: two inside-out sphere shells between the terrain and the
  // Sky dome (near shell full-strength, far shell thinner + decorrelated for
  // layered depth). Transparent (render after opaques, over the Sky box),
  // never write depth, ignore fog (they fade into the horizon band instead).
  // renderOrder < 0: both spheres are centered at the origin, so distance
  // sorting would misplace them in FRONT of smoke/flash sprites — force them
  // to draw before all default-order transparents.
  const cloudTex = makeCloudTexture();
  const mkCloudShell = (radius, opacity, name) => {
    const mat = new THREE.MeshBasicMaterial({
      map: cloudTex,
      transparent: true,
      opacity,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.52),
      mat,
    );
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.userData.aoExclude = true; // GTAO's override prepass ignores alpha
    scene.add(mesh);
    return mesh;
  };
  const cloudsFar = mkCloudShell(CLOUD_DOME_RADIUS_2, CLOUD_LAYER2_OPACITY, 'cloudLayerFar');
  cloudsFar.rotation.y = CLOUD_LAYER2_YAW;
  cloudsFar.renderOrder = -3;
  cloudsFar.material.map = cloudTex.clone();
  cloudsFar.material.map.repeat.x = CLOUD_LAYER2_REPEAT;
  cloudsFar.material.map.needsUpdate = true;
  const clouds = mkCloudShell(CLOUD_DOME_RADIUS, 1.0, 'cloudLayer');
  clouds.renderOrder = -2;
  clouds.material.map = cloudTex.clone();
  clouds.material.map.repeat.x = CLOUD_LAYER1_REPEAT;
  clouds.material.map.needsUpdate = true;

  const horizonColor = sampleHorizonColor(renderer, sunDir, preset);

  let pmrem = null;
  let envTarget = null;

  const rig = {
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
      configureSkyUniforms(envSky, sunDir, preset);
      envScene.add(envSky);

      const nextTarget = pmrem.fromScene(envScene);
      if (envTarget !== null) envTarget.dispose();
      envTarget = nextTarget;

      scene.environment = envTarget.texture;
      scene.environmentIntensity = preset.envIntensity;

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
        .lerp(new THREE.Color(preset.fogTintHex), preset.fogMix);
      targetScene.fog = new THREE.FogExp2(fogColor, preset.fogDensity);
    },

    /**
     * Re-target the whole atmosphere to a map's sky preset (map switch):
     * sun direction + dome uniforms + cloud opacity/tint + horizon resample +
     * environment rebake + fog rebuild. `sunDir` is mutated IN PLACE so
     * lighting rigs holding the reference stay correct.
     * @param {?object} p partial preset (fields of DEFAULT_PRESET)
     * @param {THREE.Scene} targetScene scene whose fog is replaced
     * @returns {void}
     */
    applyPreset(p, targetScene) {
      preset = { ...DEFAULT_PRESET, ...(p || {}) };
      sunDir.setFromSphericalCoords(
        1,
        THREE.MathUtils.degToRad(90 - preset.sunElevationDeg),
        THREE.MathUtils.degToRad(preset.sunAzimuthDeg),
      );
      configureSkyUniforms(sky, sunDir, preset);
      const cloudTint = new THREE.Color(preset.cloudTintHex);
      clouds.material.opacity = preset.cloudOpacity;
      clouds.material.color.copy(cloudTint);
      clouds.visible = preset.cloudOpacity > 0.01;
      cloudsFar.material.opacity = preset.cloudOpacity2;
      cloudsFar.material.color.copy(cloudTint);
      cloudsFar.visible = preset.cloudOpacity2 > 0.01;
      horizonColor.copy(sampleHorizonColor(renderer, sunDir, preset));
      rig.bakeEnvironment();
      rig.applyFog(targetScene);
    },
  };
  return rig;
}
