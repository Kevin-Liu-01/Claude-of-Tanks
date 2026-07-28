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
const SKY_KNEE_RANGE = 0.5; // r4: 0.4 → 0.5 — the sun disc blooms a touch brighter
const SKY_KNEE_FALLOFF = 0.125; // 1/e width of the shoulder in luminance units
// Horizon haze treatment (r3 critique: "horizon band blows out to near pure
// white with no hue — reads as fog-card overexposure"). Inside the low-
// elevation band the dome's luminance is soft-compressed to sit ~10-15% below
// white after ACES, and a faint luminance-preserving pale-blue hue floor is
// mixed in so the haze reads as atmosphere, never as blown white. A tiny
// screen-space dither breaks up banding on these low-frequency ramps.
// r4: ceiling 0.80 → 0.72 and tint mix 0.30 → 0.45 — the band still read as a
// uniform near-white stripe that abruptly desaturated the sky-terrain
// junction; it now grades into a clearly blue-grey atmospheric wash, and the
// fog color (sampled from this same band) follows automatically so distance
// haze inherits the same hue instead of going white.
// r5: ceiling 0.72 → 0.64 and a clearly BLUE tint at mix 0.58 (was a barely
// blue 0.45) — the band still read as near-white neutral gray, and because
// the fog color is SAMPLED from this band, the whole far field inherited
// that gray ("flat fog-card mountains"). The horizon now sits a solid step
// below white with an unmistakable blue-atmosphere hue, and distance haze
// downstream (fog + aerial scatter-in) follows automatically.
const HAZE_MAX_LUM = 0.64; // linear pre-ACES luminance ceiling in the band
const HAZE_COMPRESS = 0.18; // slope retained above the ceiling
const HAZE_BAND_TOP = 0.18; // direction.y where the haze treatment fades out
const HAZE_TINT = [0.78, 0.90, 1.10]; // blue hue floor (unit-luma-ish)
const HAZE_TINT_MIX = 0.58;
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
// r5 ("neutral gray fog ramp monochromes everything past 400m — cut density
// roughly in half"): the engine now interprets a preset's fogDensity as the
// map's TOTAL atmosphere thickness and splits it between the material-level
// FogExp2 (this share) and post.js's directional aerial scatter-in, which
// owns hue. Maps keep their relative art direction (winter stays the
// foggiest) while every map's ramp thins enough that saturation survives to
// ~800 m and horizon ridges keep silhouette detail.
const FOG_EXTINCTION_SHARE = 0.55;
// Aerial perspective: pull the sampled horizon color toward a desaturated
// blue so distance reads as cool atmosphere, never as white-out.
const FOG_BLUE_TINT_HEX = 0x7e97b8;
const FOG_BLUE_MIX = 0.55;
const HORIZON_RT_SIZE = 16;
const FALLBACK_HORIZON_HEX = 0xc4d3dd; // hand-tuned noon-hazy, doc §5 option (b)
// Procedural cloud system, rebuilt AGAIN for r4. The r3 implementation draped
// an equirect-baked cumulus texture over two inside-out sphere shells; the
// equirect u-axis pinches toward the zenith, so any cloud mass overhead
// smeared into a tall VERTICAL WHITE STREAK (the "stretched billboard
// artifact" in battlefield.png), and isolated mid-elevation blobs read as
// cotton-puff sprites. Replaced with the standard approach for fair-weather
// decks: two FLAT CLOUD PLANES (low cumulus + high wind-sheared cirrus) with
// world-XZ planar UVs — no polar pinching by construction, natural
// perspective foreshortening toward the horizon — sampling both-axes-tileable
// baked textures, dissolved into the horizon haze with a camera-relative
// distance fade + aerial-perspective tint (distant bases go haze-grey, never
// clip against the terrain silhouette). The cumulus bake keeps the r3 shading
// recipe: domain-warped FBM carved by a hard coverage threshold (crisp
// cauliflower edges), macro clustering, and a per-texel light march toward
// the sun (bright sun-facing rims, grey-blue shaded cores); the march
// direction is fixed in texture space and the SAMPLING is rotated per map so
// shading always agrees with the sun azimuth. NOTE: the Sky shader's own
// built-in cloud noise stays force-disabled in configureSkyUniforms.
const CLOUD_SEED = 777;
const CLOUD_TEX = 1024; // cumulus deck bake, tileable in BOTH axes
const CIRRUS_TEX = 512; // thin high-veil bake
const CLOUD_THR = 0.53; // r5: 0.545 → 0.53 — a touch more coverage so the deck reads from every camera
const CLOUD_EDGE = 0.03; // clear→rim ramp width in FBM units (crisp edge)
const CLOUD_CORE = 0.16; // rim→opaque-core ramp width in FBM units
const CLOUD_CLUSTER = 0.09; // macro-noise threshold modulation (cloud grouping)
const CLOUD_WARP = 0.06; // domain-warp strength (cauliflower edge crinkle)
const CLOUD_MARCH_STEPS = 12; // light-march samples toward the in-texture sun
const CLOUD_MARCH_STEP_PX = 3;
// r5: shade K 0.32 → 0.46 and a darker shade pole — the baked sun-lit rim /
// dark base contrast was too subtle after the distance haze mix, so clouds
// read as flat alpha blobs; bases now sit ~25% under the lit faces.
const CLOUD_SHADE_K = 0.46; // optical-depth scale: bright rims, dark cores
const CLOUD_LIT = [1.0, 0.98, 0.94]; // warm-white sunlit faces
const CLOUD_SHADE = [0.50, 0.57, 0.73]; // cool grey-blue shaded bellies
// r5: per-cloud macro opacity variation — breaks the uniform cotton-blob read
// (each mass gets its own 0.74-1.0 alpha weight from the clustering noise).
const CLOUD_ALPHA_VAR = 0.26;
const CLOUD_ALT = 620; // cumulus deck altitude (m): over terrain, under far plane
const CIRRUS_ALT = 1350;
const CLOUD_PLANE_SIZE = 9000; // covers the fade radius from any battle camera
const CLOUD_UV_METERS = 3400; // meters per cumulus texture repeat
const CIRRUS_UV_METERS = 5600;
// Camera-relative dissolve (m). End slant distances stay inside camera.far
// (4000) so the geometric clip circle is always fully transparent.
// r5: starts pushed 1400/1700 → 2400/2600 — at 1400 the cumulus deck (620 m
// altitude) was fully faded below ~26 degrees of elevation, so any camera
// pitched near the horizon (combat_firing) saw a naked sky while the
// establishing shot had painted cumulus overhead: "sky is inconsistent
// between cameras". Clouds now hold down to ~15 degrees, where the horizon
// haze takes over — one persistent deck from every camera.
const CLOUD_FADE_START = 2400;
const CLOUD_FADE_END = 3850;
const CIRRUS_FADE_START = 2600;
const CIRRUS_FADE_END = 3950;
const CLOUD_MAX_ALPHA = 0.94;
const CLOUD_LAYER2_OPACITY = 0.6; // default for preset field cloudOpacity2 (cirrus)

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
  // r4 ran a x1.5 Mie response so the sun registered off-azimuth; r5 pulls it
  // back to x1.1 — the widened wedge was the "gray haze band swallowing
  // two-thirds of the sky" in sun-facing frames (combat_firing). At x1.1 the
  // sun still reads as a warm glow at the frame edge, but blue sky dominates
  // above ~15-20 degrees of elevation on every camera.
  u.mieCoefficient.value = preset.mieCoefficient * 1.1;
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
 * Build a multi-octave value-noise FBM sampler tileable in BOTH axes
 * (period 1 in u and v) — required so the planar cloud decks repeat
 * seamlessly across the world with no visible tile boundary.
 *
 * @param {() => number} rng - seeded PRNG that fills the per-octave lattices
 * @param {number} octaves
 * @param {number} base - lattice resolution of octave 0 (doubles per octave)
 * @returns {(u: number, v: number) => number} fbm in ~[0,1], tileable in u AND v
 */
function makeFbm(rng, octaves, base) {
  const lattices = [];
  for (let o = 0; o < octaves; o++) {
    const n = base << o;
    const grid = new Float32Array(n * n);
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
      let uu = (u + o * 0.37) % 1;
      if (uu < 0) uu += 1;
      let vv = (v + o * 0.61) % 1;
      if (vv < 0) vv += 1;
      const x = uu * n;
      const y = vv * n;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = smooth(x - x0);
      const fy = smooth(y - y0);
      const xa = x0 % n;
      const xb = (x0 + 1) % n;
      const ya = y0 % n;
      const yb = (y0 + 1) % n;
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
 * Bake the cumulus deck texture (see the CLOUD_* constant block for the
 * recipe): domain-warped FBM carved by a hard coverage threshold into
 * distinct cloud masses, then shaded per-texel by a light march toward -v —
 * warm-white sun-facing rims, cool grey-blue shaded cores. Tileable in both
 * axes (the march wraps too); the deck shader rotates its sampling so the
 * baked -v march direction always points at the map's sun azimuth.
 *
 * @returns {THREE.CanvasTexture}
 */
function makeCloudTexture() {
  const W = CLOUD_TEX;
  const H = CLOUD_TEX;
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
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      let wu = (u + (fbmWX(u, v) - 0.5) * CLOUD_WARP) % 1;
      if (wu < 0) wu += 1;
      let wv = (v + (fbmWY(u, v) - 0.5) * CLOUD_WARP) % 1;
      if (wv < 0) wv += 1;
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
  // toward -v (the in-texture sun): thin rims facing the sun stay near 1
  // (bright, silver-lined), texels behind thick cloud fall toward 0.
  const cnv = document.createElement('canvas');
  cnv.width = W;
  cnv.height = H;
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(W, H);
  const px = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const o = i * 4;
      const m = mask[i];
      if (m <= 0) {
        px[o + 3] = 0;
        continue;
      }
      let occl = 0;
      for (let s = 1; s <= CLOUD_MARCH_STEPS; s++) {
        let yy = (y - s * CLOUD_MARCH_STEP_PX) % H; // wraps: tileable shading
        if (yy < 0) yy += H;
        occl += sigma[yy * W + x];
      }
      const lit = Math.pow(Math.exp(-CLOUD_SHADE_K * occl), 0.85);
      px[o] = Math.round(255 * (CLOUD_SHADE[0] + (CLOUD_LIT[0] - CLOUD_SHADE[0]) * lit));
      px[o + 1] = Math.round(255 * (CLOUD_SHADE[1] + (CLOUD_LIT[1] - CLOUD_SHADE[1]) * lit));
      px[o + 2] = Math.round(255 * (CLOUD_SHADE[2] + (CLOUD_LIT[2] - CLOUD_SHADE[2]) * lit));
      // per-cloud opacity variation keyed on the macro clustering field: each
      // mass gets its own density so the deck never reads as uniform cotton
      const macroA = 1 - CLOUD_ALPHA_VAR * (1 - fbmM(x / W, y / H));
      px[o + 3] = Math.round(255 * CLOUD_MAX_ALPHA * macroA * m * (0.42 + 0.58 * core[i]));
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Bake the thin high-altitude veil: wind-sheared streaks (fbm sampled with a
 * 4x faster v frequency elongates features along u), low alpha, near-white.
 * Tileable in both axes.
 *
 * @returns {THREE.CanvasTexture}
 */
function makeCirrusTexture() {
  const W = CIRRUS_TEX;
  const H = CIRRUS_TEX;
  const rng = mulberry32(CLOUD_SEED + 11);
  const fbm = makeFbm(rng, 4, 4);
  const fbmW = makeFbm(rng, 2, 3);
  const cnv = document.createElement('canvas');
  cnv.width = W;
  cnv.height = H;
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(W, H);
  const px = img.data;
  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      let wu = (u + (fbmW(u, v) - 0.5) * 0.10) % 1;
      if (wu < 0) wu += 1;
      const s = fbm(wu, (v * 4) % 1); // v-frequency x4 => horizontal shear streaks
      const a = smoothstepNum(0.52, 0.86, s);
      const o = (y * W + x) * 4;
      const lum = 0.90 + 0.10 * a;
      px[o] = Math.round(250 * lum);
      px[o + 1] = Math.round(252 * lum);
      px[o + 2] = 255;
      px[o + 3] = Math.round(255 * a * 0.85);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
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
  // Publish the live sun direction for post.js's directional aerial scatter
  // (same Vector3 instance — applyPreset mutates it in place, so the post
  // chain always sees the current map's sun without an explicit re-wire).
  scene.userData.sunDirWorld = sunDir;

  // Cloud decks: two flat planes (low cumulus + high cirrus veil) between the
  // terrain and the Sky dome. Transparent (render after opaques, over the Sky
  // box), never write depth, own their aerial fade (no scene fog). renderOrder
  // < 0: distance sorting would misplace the huge planes in FRONT of
  // smoke/flash sprites — force them before all default-order transparents.
  const CLOUD_VERT = /* glsl */ `
    varying vec3 vWPos;
    void main() {
      vec4 wp = modelMatrix * vec4( position, 1.0 );
      vWPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`;
  const CLOUD_FRAG = /* glsl */ `
    uniform sampler2D uMap;
    uniform vec2 uRot;    // (cos, sin): rotates world XZ so -v faces the sun azimuth
    uniform float uScale; // meters per texture repeat
    uniform vec2 uOff;    // per-deck decorrelation offset
    uniform vec3 uTint;
    uniform float uOpacity;
    uniform vec3 uHaze;   // horizon haze color (linear) the deck dissolves into
    uniform vec2 uFade;   // (start, end) camera-relative fade distances (m)
    varying vec3 vWPos;
    void main() {
      vec2 p = vWPos.xz;
      vec2 uv = vec2( p.x * uRot.x - p.y * uRot.y, p.x * uRot.y + p.y * uRot.x ) / uScale + uOff;
      vec4 c = texture2D( uMap, uv );
      float d = distance( p, cameraPosition.xz );
      float fade = 1.0 - smoothstep( uFade.x, uFade.y, d );
      // aerial perspective: distant cloud bases melt toward the horizon haze
      float haze = smoothstep( uFade.x * 0.35, uFade.y, d );
      vec3 col = mix( c.rgb * uTint, uHaze, haze * 0.88 );
      gl_FragColor = vec4( col, c.a * uOpacity * fade );
    }`;
  /** (cos,sin) rotation mapping the toward-sun XZ direction onto texture -v. */
  const cloudSunRot = (dir) => {
    const l = Math.hypot(dir.x, dir.z) || 1;
    return [-dir.z / l, -dir.x / l];
  };
  const mkCloudDeck = (tex, alt, uvMeters, opacity, fadeStart, fadeEnd, off, name) => {
    const rot = cloudSunRot(sunDir);
    const mat = new THREE.ShaderMaterial({
      vertexShader: CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      uniforms: {
        uMap: { value: tex },
        uRot: { value: new THREE.Vector2(rot[0], rot[1]) },
        uScale: { value: uvMeters },
        uOff: { value: new THREE.Vector2(...off) },
        uTint: { value: new THREE.Color(0xffffff) },
        uOpacity: { value: opacity },
        uHaze: { value: new THREE.Color(0xdde6ee) }, // re-set from horizon sample below
        uFade: { value: new THREE.Vector2(fadeStart, fadeEnd) },
      },
      transparent: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(CLOUD_PLANE_SIZE, CLOUD_PLANE_SIZE), mat);
    mesh.rotation.x = Math.PI / 2; // face down toward the camera
    mesh.position.y = alt;
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.userData.aoExclude = true; // GTAO's override prepass ignores alpha
    scene.add(mesh);
    return mesh;
  };
  const cloudsFar = mkCloudDeck(
    makeCirrusTexture(), CIRRUS_ALT, CIRRUS_UV_METERS, CLOUD_LAYER2_OPACITY,
    CIRRUS_FADE_START, CIRRUS_FADE_END, [0.31, 0.77], 'cloudLayerFar',
  );
  cloudsFar.renderOrder = -3;
  const clouds = mkCloudDeck(
    makeCloudTexture(), CLOUD_ALT, CLOUD_UV_METERS, 1.0,
    CLOUD_FADE_START, CLOUD_FADE_END, [0, 0], 'cloudLayer',
  );
  clouds.renderOrder = -2;

  const horizonColor = sampleHorizonColor(renderer, sunDir, preset);

  /** Sync deck uniforms to the current preset + horizon sample. */
  const updateCloudDecks = () => {
    const cloudTint = new THREE.Color(preset.cloudTintHex);
    const rot = cloudSunRot(sunDir);
    const haze = horizonColor.clone().lerp(new THREE.Color(preset.fogTintHex), preset.fogMix);
    for (const deck of [clouds, cloudsFar]) {
      const u = deck.material.uniforms;
      u.uTint.value.copy(cloudTint);
      u.uRot.value.set(rot[0], rot[1]);
      u.uHaze.value.copy(haze);
    }
    clouds.material.uniforms.uOpacity.value = preset.cloudOpacity;
    clouds.visible = preset.cloudOpacity > 0.01;
    cloudsFar.material.uniforms.uOpacity.value = preset.cloudOpacity2;
    cloudsFar.visible = preset.cloudOpacity2 > 0.01;
  };
  updateCloudDecks();

  let pmrem = null;
  let envTarget = null;

  // Sourced-HDRI environment override (experiment flag; null = procedural
  // bake, the shipping configuration). Set to an equirect .hdr URL to test.
  const HDRI_ENV_URL = null;
  let hdriPromise = null;
  const loadHdriEnvironment = (url) => {
    if (!hdriPromise) {
      hdriPromise = import('three/examples/jsm/loaders/RGBELoader.js')
        .then(({ RGBELoader }) => new RGBELoader().loadAsync(url));
    }
    hdriPromise.then((tex) => {
      const nextTarget = pmrem.fromEquirectangular(tex);
      if (envTarget !== null) envTarget.dispose();
      envTarget = nextTarget;
      scene.environment = envTarget.texture;
      scene.environmentIntensity = preset.envIntensity;
    }).catch((e) => console.warn('[sky] HDRI env failed, procedural bake kept —', e.message));
  };

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

      // Deep-hunt IBL experiment (2026-07): sourced Poly Haven HDRI as
      // scene.environment instead of the procedural-sky bake. Judged worse —
      // the HDRI's baked-in sun cannot track the per-map sun azimuth /
      // elevation driving the CSM, so specular highlights detach from the
      // shadow direction on 3 of 4 maps. Flag kept for future re-testing
      // with per-map matched HDRIs.
      if (HDRI_ENV_URL) {
        loadHdriEnvironment(HDRI_ENV_URL);
        return;
      }
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
      // preset.fogDensity is total atmosphere; the exp2 fog takes only its
      // extinction share — post.js's aerial pass carries the scatter-in hue
      // (see FOG_EXTINCTION_SHARE).
      targetScene.fog = new THREE.FogExp2(fogColor, preset.fogDensity * FOG_EXTINCTION_SHARE);
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
      horizonColor.copy(sampleHorizonColor(renderer, sunDir, preset));
      updateCloudDecks(); // tint/opacity/sun-rotation/haze follow the preset
      rig.bakeEnvironment();
      rig.applyFog(targetScene);
    },
  };
  return rig;
}
