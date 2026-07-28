/**
 * particles.js — fx-internal instanced GPU particle engine.
 *
 * InstancedBufferGeometry billboards (never THREE.Points) per graphics-aaa §9.
 * Pools (locked sizes): smoke 2048 / fire 1024 / dust 1024 / sparks 512 /
 * debris 256 (instanced shaded irregular chunks) / flash 128 (star-spike
 * discharge cards). Fully GPU-animated: the CPU only writes
 * attribute slots into a ring buffer at emit time (partial uploads via
 * addUpdateRange). A single shared `uTime` uniform drives every pool, so
 * setFrozen() deterministically pins the whole system for screenshots.
 *
 * Zero top-level side effects — all canvas/GL work happens inside
 * createParticleSystem().
 */
import * as THREE from 'three';

/** Canonical PRNG (ARCHITECTURE §1.4). @param {number} a seed @returns {() => number} */
export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const POOL_SIZES = { smoke: 2048, fire: 1024, dust: 1024, sparks: 512, debris: 256, flash: 128, jet: 64 };

// ---------------------------------------------------------------------------
// GLSL — shared helpers
// ---------------------------------------------------------------------------

const FOG_PARS_V = `
#ifdef USE_FOG
  varying float vFogDepth;
#endif
`;
const FOG_V = `
#ifdef USE_FOG
  vFogDepth = -mvPosition.z;
#endif
`;
const FOG_PARS_F = `
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  varying float vFogDepth;
#endif
`;
// Additive passes fade OUT with fog (never toward fog color).
const FOG_SCALE_F = `
#ifdef USE_FOG
  float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
#else
  float fogFactor = 0.0;
#endif
`;

// Ballistic displacement with exponential drag:
// x(t) = v0 * (1 - e^{-k t}) / k  (k -> 0 limit = v0 t), plus 0.5 g t^2 up.
const DISPLACE_GLSL = `
vec3 particleDisplace( vec3 vel, float grav, float age, float drag ) {
  float k = max( drag, 1e-4 );
  float s = ( 1.0 - exp( -k * age ) ) / k;
  return vel * s + vec3( 0.0, 0.5 * grav * age * age, 0.0 );
}
`;

// --- puff (smoke / fire / dust) --------------------------------------------

const PUFF_VERT = `
attribute vec4 aPB;   // origin.xyz, birth
attribute vec4 aVL;   // vel.xyz, life
attribute vec4 aSR;   // size0, size1, rot0, rotVel
attribute vec4 aC0;   // color0.rgb, gravity (+up)
attribute vec4 aC1;   // color1.rgb, peakAlpha
uniform float uTime;
uniform float uDrag;
uniform vec3 uSunDirW;
varying vec2 vUv;
varying vec4 vColor;
varying float vT;
varying vec2 vShade;
${FOG_PARS_V}
${DISPLACE_GLSL}
void main() {
  float life = aVL.w;
  float age = uTime - aPB.w;
  if ( life <= 0.0 || age < 0.0 || age > life ) {
    vUv = uv; vColor = vec4( 0.0 ); vT = 0.0; vShade = vec2( 0.0 );
    gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
    ${FOG_V.replace('-mvPosition.z','1.0')}
    return;
  }
  float t = age / life;
  vT = t;
  vec3 wpos = aPB.xyz + particleDisplace( aVL.xyz, aC0.w, age, uDrag );
  float size = mix( aSR.x, aSR.y, t );
  float ang = aSR.z + aSR.w * age;
  float ca = cos( ang ), sa = sin( ang );
  vec2 corner = vec2( position.x * ca - position.y * sa,
                      position.x * sa + position.y * ca ) * size;
  vec3 camRight = vec3( viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0] );
  vec3 camUp    = vec3( viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1] );
  wpos += camRight * corner.x + camUp * corner.y;
  // sun direction projected into the billboard plane (fake lit-smoke normal)
  vShade = vec2( dot( uSunDirW, camRight ), dot( uSunDirW, camUp ) );
  // tier-1 soft handling: alpha-in at birth, long fade-out
  float alpha = aC1.w * smoothstep( 0.0, 0.12, t ) * ( 1.0 - smoothstep( 0.5, 1.0, t ) );
  vColor = vec4( mix( aC0.rgb, aC1.rgb, smoothstep( 0.0, 1.0, t ) ), alpha );
  vUv = uv;
  vec4 mvPosition = viewMatrix * vec4( wpos, 1.0 );
  ${FOG_V}
  gl_Position = projectionMatrix * mvPosition;
}
`;

const PUFF_FRAG_NORMAL = `
uniform sampler2D uMap;
varying vec2 vUv;
varying vec4 vColor;
varying float vT;
varying vec2 vShade;
${FOG_PARS_F}
void main() {
  float tex = texture2D( uMap, vUv ).a;
  // edges thin out with age so old puffs wisp away instead of popping
  float a = pow( tex, 1.0 + vT * 1.2 ) * vColor.a;
  if ( a < 0.004 ) discard;
  // fake directional lighting: sun-facing side of the billboard brightens,
  // opposite side falls into shadow — smoke reads volumetric, not flat
  vec2 p = vUv * 2.0 - 1.0;
  float light = 0.60 + 0.55 * clamp( 0.55 + 0.7 * dot( p, vShade ), 0.0, 1.0 );
  vec3 col = vColor.rgb * light;
  ${FOG_SCALE_F}
  #ifdef USE_FOG
    col = mix( col, fogColor, fogFactor );
  #endif
  gl_FragColor = vec4( col, a );
}
`;

const PUFF_FRAG_ADDITIVE = `
uniform sampler2D uMap;
uniform float uIntensity;
varying vec2 vUv;
varying vec4 vColor;
varying float vT;
varying vec2 vShade;
${FOG_PARS_F}
void main() {
  float tex = texture2D( uMap, vUv ).a;
  // erosion-style dissolve: the alpha threshold rises with age so the noisy
  // texture breaks apart from its thin texels inward — edges churn and burn
  // away instead of the whole card fading uniformly
  float er = vT * 0.62;
  float a = smoothstep( er, er + 0.24, tex ) * vColor.a;
  if ( a < 0.004 ) discard;
  ${FOG_SCALE_F}
  // blackbody interior: texels well above the erosion front read white-hot,
  // the dissolving rim cools through orange to deep red as vT -> 1
  float heat = clamp( ( tex - er ) * 2.6, 0.0, 1.0 );
  float hot = 0.45 + heat * heat * ( 2.2 - vT * 1.6 );
  vec3 col = vColor.rgb * hot * ( 1.0 - vT * vT * 0.45 );
  // rim tint: pixels near the burning front shift toward deep ember red
  col = mix( vec3( 1.0, 0.22, 0.03 ) * ( 0.4 + 0.6 * vColor.r ), col, smoothstep( 0.0, 0.55, heat ) );
  // HDR push so UnrealBloom catches fire/flash pixels
  gl_FragColor = vec4( col * uIntensity * ( 1.0 - fogFactor ), a );
}
`;

// --- streak (sparks / ricochet) --------------------------------------------

const STREAK_VERT = `
attribute vec4 aPB;   // origin.xyz, birth
attribute vec4 aVL;   // vel.xyz, life
attribute vec4 aWS;   // width, stretch (s of length per m/s), gravity, seed
attribute vec4 aC;    // color.rgb, peakAlpha
uniform float uTime;
uniform float uDrag;
varying vec2 vUv;
varying vec4 vColor;
varying float vT;
${FOG_PARS_V}
${DISPLACE_GLSL}
void main() {
  float life = aVL.w;
  float age = uTime - aPB.w;
  if ( life <= 0.0 || age < 0.0 || age > life ) {
    vUv = uv; vColor = vec4( 0.0 ); vT = 0.0;
    gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
    ${FOG_V.replace('-mvPosition.z','1.0')}
    return;
  }
  float t = age / life;
  vT = t;
  vec3 grav = vec3( 0.0, aWS.z, 0.0 );
  vec3 wpos = aPB.xyz + particleDisplace( aVL.xyz, aWS.z, age, uDrag );
  vec3 vcur = aVL.xyz * exp( -uDrag * age ) + grav * age;
  float speed = max( length( vcur ), 0.01 );
  vec3 axis = vcur / speed;
  float halfLen = max( aWS.x, speed * aWS.y * 0.5 );
  vec3 viewDir = normalize( cameraPosition - wpos );
  vec3 side = cross( axis, viewDir );
  float sl = length( side );
  side = sl > 1e-4 ? side / sl : vec3( viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0] );
  wpos += axis * ( position.x * 2.0 * halfLen ) + side * ( position.y * 2.0 * aWS.x );
  float alpha = aC.w * ( 1.0 - smoothstep( 0.55, 1.0, t ) );
  vColor = vec4( aC.rgb, alpha );
  vUv = uv;
  vec4 mvPosition = viewMatrix * vec4( wpos, 1.0 );
  ${FOG_V}
  gl_Position = projectionMatrix * mvPosition;
}
`;

const STREAK_FRAG = `
uniform float uIntensity;
varying vec2 vUv;
varying vec4 vColor;
varying float vT;
${FOG_PARS_F}
void main() {
  float dy = abs( vUv.y * 2.0 - 1.0 );
  float dx = abs( vUv.x * 2.0 - 1.0 );
  float profile = ( 1.0 - dy * dy ) * ( 1.0 - dx * dx * dx );
  float core = smoothstep( 0.55, 0.0, dy );
  float a = profile * vColor.a;
  if ( a < 0.004 ) discard;
  ${FOG_SCALE_F}
  // incandescent cooling ramp: white-hot core -> orange -> deep red over life
  vec3 base = mix( vColor.rgb, vec3( 1.0, 0.30, 0.04 ), clamp( vT * 1.5, 0.0, 0.92 ) );
  vec3 col = ( base + vec3( core ) * 0.7 * ( 1.0 - vT * 0.85 ) ) * uIntensity;
  gl_FragColor = vec4( col * ( 1.0 - fogFactor ), a );
}
`;

// --- jet (axis-oriented muzzle-blast cones, NOT camera-facing) ---------------

const JET_VERT = `
attribute vec4 aPB;   // origin.xyz, birth
attribute vec4 aAL;   // axis.xyz (unit), life
attribute vec4 aWL;   // width, len0, len1, seed
attribute vec4 aC;    // color.rgb, peakAlpha
uniform float uTime;
varying vec2 vUv;
varying vec4 vColor;
varying float vT;
varying float vSeed;
${FOG_PARS_V}
void main() {
  float life = aAL.w;
  float age = uTime - aPB.w;
  if ( life <= 0.0 || age < 0.0 || age > life ) {
    vUv = uv; vColor = vec4( 0.0 ); vT = 0.0; vSeed = 0.0;
    gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
    ${FOG_V.replace('-mvPosition.z', '1.0')}
    return;
  }
  float t = age / life;
  vT = t;
  vSeed = aWL.w;
  vec3 axis = aAL.xyz;
  // fast initial expansion, then hold while alpha decays (sub-100ms flash)
  float len = mix( aWL.y, aWL.z, pow( t, 0.3 ) );
  float u = position.x + 0.5;               // 0 at muzzle -> 1 at tip
  vec3 tipPos = aPB.xyz + axis * ( u * len );
  vec3 viewDir = normalize( cameraPosition - tipPos );
  vec3 side = cross( axis, viewDir );
  float sl = length( side );
  side = sl > 1e-4 ? side / sl : vec3( viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0] );
  // cone envelope: narrow at the brake, widening toward the tip
  float env = 0.30 + 1.05 * u;
  vec3 wpos = tipPos + side * ( position.y * 2.0 * aWL.x * env );
  float alpha = aC.w * pow( 1.0 - t, 1.3 );
  vColor = vec4( aC.rgb, alpha );
  vUv = uv;
  vec4 mvPosition = viewMatrix * vec4( wpos, 1.0 );
  ${FOG_V}
  gl_Position = projectionMatrix * mvPosition;
}
`;

const JET_FRAG = `
uniform sampler2D uMap;
uniform float uIntensity;
varying vec2 vUv;
varying vec4 vColor;
varying float vT;
varying float vSeed;
${FOG_PARS_F}
void main() {
  // seeded UV jitter so no two jets sample the identical noise
  vec2 uv = vec2( vUv.x * ( 0.82 + 0.18 * fract( vSeed * 7.31 ) ),
                  clamp( vUv.y + ( fract( vSeed * 13.7 ) - 0.5 ) * 0.16, 0.0, 1.0 ) );
  float tex = texture2D( uMap, uv ).a;
  float er = 0.06 + vT * 0.6;
  float a = smoothstep( er, er + 0.28, tex ) * vColor.a;
  if ( a < 0.004 ) discard;
  ${FOG_SCALE_F}
  // incandescent core near the muzzle end, cooling toward the ragged tip
  float heat = clamp( ( tex - er ) * 2.4, 0.0, 1.0 );
  float hot = 0.6 + heat * heat * ( 1.0 - vUv.x * 0.55 ) * 2.2;
  vec3 col = vColor.rgb * hot * ( 1.0 - vT * 0.35 );
  col = mix( vec3( 1.0, 0.30, 0.05 ) * ( 0.5 + 0.5 * vColor.r ), col, smoothstep( 0.0, 0.5, heat ) );
  gl_FragColor = vec4( col * uIntensity * ( 1.0 - fogFactor ), a );
}
`;

// --- debris (instanced shaded boxes) ----------------------------------------

const DEBRIS_VERT = `
attribute vec4 aPB;   // origin.xyz, birth
attribute vec4 aVL;   // vel.xyz, life
attribute vec4 aAR;   // spinAxis.xyz, spinRate
attribute vec4 aSG;   // scale, groundY, hot(0|1), seed
uniform float uTime;
varying vec3 vNormalW;
varying vec3 vTint;
varying float vHot;
varying float vFade;
varying vec3 vLocal;
varying float vSeed;
${FOG_PARS_V}
${DISPLACE_GLSL}
mat3 axisAngle( vec3 axis, float ang ) {
  float c = cos( ang ), s = sin( ang ), ic = 1.0 - c;
  vec3 a = axis;
  return mat3(
    ic*a.x*a.x + c,     ic*a.x*a.y + a.z*s, ic*a.x*a.z - a.y*s,
    ic*a.x*a.y - a.z*s, ic*a.y*a.y + c,     ic*a.y*a.z + a.x*s,
    ic*a.x*a.z + a.y*s, ic*a.y*a.z - a.x*s, ic*a.z*a.z + c );
}
void main() {
  float life = aVL.w;
  float age = uTime - aPB.w;
  if ( life <= 0.0 || age < 0.0 || age > life ) {
    vNormalW = vec3( 0.0, 1.0, 0.0 ); vTint = vec3( 0.0 ); vHot = 0.0; vFade = 0.0;
    vLocal = vec3( 0.0 ); vSeed = 0.0;
    gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
    ${FOG_V.replace('-mvPosition.z','1.0')}
    return;
  }
  float t = age / life;
  vec3 center = aPB.xyz + particleDisplace( aVL.xyz, -21.6, age, 0.12 );
  float grounded = step( center.y, aSG.y + aSG.x * 0.45 );
  center.y = max( center.y, aSG.y + aSG.x * 0.45 );
  float spin = aAR.w * age * mix( 1.0, 0.06, grounded );
  mat3 rot = axisAngle( normalize( aAR.xyz ), spin );
  float fade = 1.0 - smoothstep( 0.82, 1.0, t );
  // per-instance irregular chunk: seeded nonuniform scale + shear so no two
  // fragments read as the same primitive
  float h1 = fract( aSG.w * 37.719 );
  float h2 = fract( aSG.w * 61.113 );
  float h3 = fract( aSG.w * 91.537 );
  vec3 lp = position * vec3( 0.55 + h1 * 0.95, 0.5 + h2 * 1.0, 0.55 + h3 * 0.95 );
  lp.x += lp.y * ( h2 - 0.5 ) * 0.8;
  lp.z += lp.y * ( h1 - 0.5 ) * 0.6;
  vec3 wpos = center + rot * ( lp * aSG.x * fade );
  vNormalW = rot * normal;
  vLocal = lp;
  vSeed = aSG.w;
  // charred-metal albedo: near-black soot to dark scorched brown
  vTint = mix( vec3( 0.045, 0.040, 0.036 ), vec3( 0.145, 0.110, 0.085 ), h3 );
  // ember glow cools fast (orange -> black), scaled per-instance so chunks
  // glow unevenly rather than as flat confetti
  vHot = aSG.z * exp( -age * 1.7 ) * ( 0.35 + h2 * 0.75 );
  vFade = fade;
  vec4 mvPosition = viewMatrix * vec4( wpos, 1.0 );
  ${FOG_V}
  gl_Position = projectionMatrix * mvPosition;
}
`;

const DEBRIS_FRAG = `
uniform vec3 uSunDir;
varying vec3 vNormalW;
varying vec3 vTint;
varying float vHot;
varying float vFade;
varying vec3 vLocal;
varying float vSeed;
${FOG_PARS_F}
void main() {
  if ( vFade <= 0.001 ) discard;
  vec3 n = normalize( vNormalW );
  float nl = max( dot( n, uSunDir ), 0.0 );
  float hemi = 0.28 + 0.22 * ( n.y * 0.5 + 0.5 );
  vec3 col = vTint * ( hemi + nl * 1.1 );
  // cooling ember glow (bloom feed): NOT a flat face tint — modulated by a
  // smooth local-space pattern so only cracks/patches of the scorched chunk
  // glow orange while the rest stays charred black
  float edge = 0.40 + 0.60 * ( 1.0 - nl );
  float pat = 0.5 + 0.5 * sin( vLocal.x * 23.0 + vSeed * 61.0 )
                        * sin( vLocal.y * 19.0 + vSeed * 23.0 )
                        * sin( vLocal.z * 27.0 + vSeed * 43.0 );
  pat *= pat;
  col += vec3( 1.5, 0.38, 0.05 ) * vHot * edge * ( 0.10 + 1.15 * pat );
  ${FOG_SCALE_F}
  #ifdef USE_FOG
    col = mix( col, fogColor, fogFactor );
  #endif
  gl_FragColor = vec4( col, 1.0 );
}
`;

// ---------------------------------------------------------------------------
// Procedural textures (canvas, seeded)
// ---------------------------------------------------------------------------

/**
 * Seeded 2D value noise (bilinear, smoothstep-eased, tileable).
 * @param {() => number} rng @param {number} grid lattice size
 * @returns {(x: number, y: number) => number} sampler, x/y in [0,1)
 */
function makeValueNoise(rng, grid) {
  const g = new Float32Array(grid * grid);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  return (x, y) => {
    const fx = (x - Math.floor(x)) * grid;
    const fy = (y - Math.floor(y)) * grid;
    const x0 = Math.floor(fx) % grid, y0 = Math.floor(fy) % grid;
    const x1 = (x0 + 1) % grid, y1 = (y0 + 1) % grid;
    let tx = fx - Math.floor(fx), ty = fy - Math.floor(fy);
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const a = g[y0 * grid + x0], b = g[y0 * grid + x1];
    const c = g[y1 * grid + x0], d = g[y1 * grid + x1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

/**
 * 4-octave fbm turbulence built on seeded value noise, output ~[0,1].
 * @param {() => number} rng
 * @returns {(x: number, y: number) => number}
 */
function makeFbm(rng) {
  const o1 = makeValueNoise(rng, 4);
  const o2 = makeValueNoise(rng, 8);
  const o3 = makeValueNoise(rng, 16);
  const o4 = makeValueNoise(rng, 32);
  return (x, y) =>
    (o1(x, y) * 0.5 + o2(x, y) * 0.25 + o3(x, y) * 0.125 + o4(x, y) * 0.0625) / 0.9375;
}

/**
 * Multiply a canvas's alpha channel by seeded fbm turbulence — breaks the
 * "smooth untextured blob" read on every particle that samples it.
 * @param {HTMLCanvasElement} cv @param {() => number} rng
 * @param {number} strength 0..1 how deep the turbulence cuts
 */
function applyFbmAlpha(cv, rng, strength) {
  const fbm = makeFbm(rng);
  const ctx = cv.getContext('2d');
  const img = ctx.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  const w = cv.width, h = cv.height;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm(x / w, y / h);
      const m = 1 - strength + strength * Math.min(1, n * 1.7);
      d[(y * w + x) * 4 + 3] = Math.min(255, d[(y * w + x) * 4 + 3] * m);
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Turbulent combustion sprite: fbm-warped radius gives a ragged silhouette,
 * a second fbm field gives high-contrast interior churn. Built for the
 * erosion dissolve in PUFF_FRAG_ADDITIVE (dense core survives, edges burn
 * away). Alpha-only payload.
 * @param {() => number} rng
 * @returns {THREE.CanvasTexture}
 */
function makeFireTexture(rng) {
  const s = 160;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  const warp = makeFbm(rng);
  const churn = makeFbm(rng);
  const img = ctx.createImageData(s, s);
  const d = img.data;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const nx = x / s, ny = y / s;
      const dx = nx - 0.5, dy = ny - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2; // 0 center -> 1 edge
      // domain-warped radius: silhouette bulges and bites, never a disc
      const rw = r + (warp(nx, ny) - 0.5) * 0.75;
      let a = 1 - (rw - 0.18) / 0.72;             // soft falloff from warped core
      a = Math.max(0, Math.min(1, a));
      // interior turbulence: bright filaments and dark pockets
      const c = churn(nx * 1.7, ny * 1.7);
      a *= 0.38 + 0.85 * c;
      a = Math.pow(Math.min(1, a), 1.1);
      const i = (y * s + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Horizontal muzzle-blast jet: bright attached base, expanding noisy cone,
 * ragged dissolving tip (+x is downrange). Alpha-only payload.
 * @param {() => number} rng
 * @returns {THREE.CanvasTexture}
 */
function makeJetTexture(rng) {
  const w = 256, h = 96;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const fbm = makeFbm(rng);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;                 // along the jet
      const v = (y / h) * 2 - 1;       // across, -1..1
      const n = fbm(u * 1.6, y / h);
      // expanding cone envelope with noisy boundary
      const half = 0.20 + 0.72 * u;
      const dcone = Math.abs(v) / half + (n - 0.5) * 0.55;
      let a = 1 - Math.max(0, Math.min(1, (dcone - 0.25) / 0.75));
      // ragged tip fade + hard attach at the muzzle end
      a *= 1 - Math.max(0, Math.min(1, (u + (n - 0.5) * 0.4 - 0.55) / 0.42));
      a *= Math.min(1, u / 0.05);
      // filament structure along the flow
      a *= 0.45 + 0.75 * fbm(u * 3.2 + 7.1, (y / h) * 1.3 + 3.3);
      a = Math.pow(Math.max(0, Math.min(1, a)), 0.95);
      const i = (y * w + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Soft puff sprite: radial gradient modulated by seeded blob noise so smoke
 * reads as vapor, not a flat disc. Alpha-only payload (RGB white).
 * @param {() => number} rng
 * @param {number} blobbiness 0..1 — how broken-up the silhouette is
 * @returns {THREE.CanvasTexture}
 */
function makePuffTexture(rng, blobbiness) {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  // Base radial falloff
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.8, 'rgba(255,255,255,0.12)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  // Seeded sub-puff blobs (lighten) + bite-outs (destination-out) for texture
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2;
    const r = (0.10 + rng() * 0.24) * s;
    const cx = s / 2 + Math.cos(a) * rng() * s * 0.22;
    const cy = s / 2 + Math.sin(a) * rng() * s * 0.22;
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    bg.addColorStop(0, 'rgba(255,255,255,0.30)');
    bg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, s, s);
  }
  ctx.globalCompositeOperation = 'destination-out';
  const bites = Math.round(6 + blobbiness * 10);
  for (let i = 0; i < bites; i++) {
    const a = rng() * Math.PI * 2;
    const d = (0.28 + rng() * 0.22) * s;
    const cx = s / 2 + Math.cos(a) * d;
    const cy = s / 2 + Math.sin(a) * d;
    const r = (0.06 + rng() * 0.14) * s * (0.5 + blobbiness);
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    bg.addColorStop(0, `rgba(0,0,0,${0.35 + blobbiness * 0.35})`);
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, s, s);
  }
  ctx.globalCompositeOperation = 'source-over';
  // fbm pass: per-pixel turbulence so even large screen-covering puffs keep
  // internal cauliflower structure instead of reading as smooth blobs
  applyFbmAlpha(cv, rng, 0.5 + blobbiness * 0.25);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex; // alpha map, stays linear
}

/**
 * Muzzle/detonation flash: layered SOFT-core discharge — compact blinding
 * core, feathered combustion halo whose silhouette is fbm-ragged, and a few
 * faint irregular petals (never hard cartoon star spikes). Alpha-only.
 * @param {() => number} rng
 * @returns {THREE.CanvasTexture}
 */
function makeFlashTexture(rng) {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  ctx.globalCompositeOperation = 'lighter';
  const c = s / 2;
  // wide soft halo (fast falloff — reads as air-glow, not a sticker)
  let g = ctx.createRadialGradient(c, c, 0, c, c, s * 0.5);
  g.addColorStop(0.0, 'rgba(255,255,255,0.62)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.30)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.07)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  // faint irregular combustion petals — broad soft lobes, randomized length
  // and width, alpha low enough that they read as unburnt-powder flare
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng() * 1.2;
    const len = s * (0.18 + rng() * 0.14);
    const w = s * (0.07 + rng() * 0.06);
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    ctx.scale(len, w);
    const rg = ctx.createRadialGradient(0.35, 0, 0, 0.35, 0, 1);
    rg.addColorStop(0, 'rgba(255,255,255,0.34)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // compact blinding core with a soft shoulder
  g = ctx.createRadialGradient(c, c, 0, c, c, s * 0.16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  ctx.globalCompositeOperation = 'source-over';
  // ragged silhouette: turbulence bites the halo rim so the frozen frame
  // never shows a clean radial-gradient disc
  applyFbmAlpha(cv, rng, 0.32);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// ---------------------------------------------------------------------------
// Pool plumbing
// ---------------------------------------------------------------------------

/** Unit billboard quad: position.xy in [-0.5, 0.5], uv in [0,1]. */
function makeQuadGeometry(count) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(
    [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.instanceCount = 0;
  geo._capacity = count;
  return geo;
}

/**
 * Irregular fractured-chunk hull: a low-poly icosahedron whose corners are
 * displaced (consistently across shared vertices) then flat-shaded. Combined
 * with the per-instance nonuniform scale/shear in DEBRIS_VERT this kills the
 * "axis-aligned box confetti" read.
 */
function makeChunkGeometry(count, rng) {
  const base = new THREE.IcosahedronGeometry(0.62, 0).toNonIndexed();
  const pos = base.getAttribute('position');
  const disp = new Map();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}`;
    let m = disp.get(key);
    if (m === undefined) { m = 0.5 + rng() * 1.0; disp.set(key, m); }
    pos.setXYZ(i, x * m, y * m, z * m);
  }
  base.computeVertexNormals(); // non-indexed => hard facet normals
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', base.getAttribute('position'));
  geo.setAttribute('normal', base.getAttribute('normal'));
  geo.setAttribute('uv', base.getAttribute('uv'));
  geo.instanceCount = 0;
  geo._capacity = count;
  return geo;
}

/**
 * A ring-buffered instanced pool. `layout` maps attr name -> itemSize.
 * Writes go through a staging cursor; touched spans upload via updateRanges.
 */
class Pool {
  constructor(name, geometry, material, layout, capacity, lifeAttr, lifeComp) {
    this.name = name;
    this.capacity = capacity;
    this.cursor = 0;
    this.highWater = 0;
    this.lifeAttr = lifeAttr;
    this.lifeComp = lifeComp;
    this.attrs = {};
    for (const key of Object.keys(layout)) {
      const itemSize = layout[key];
      const attr = new THREE.InstancedBufferAttribute(
        new Float32Array(capacity * itemSize), itemSize);
      attr.setUsage(THREE.DynamicDrawUsage);
      this.attrs[key] = attr;
      geometry.setAttribute(key, attr);
    }
    this.geometry = geometry;
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
  }

  /** Claim the next ring slot; returns the instance index. */
  claim() {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.highWater = Math.max(this.highWater, i + 1);
    this.geometry.instanceCount = this.highWater;
    return i;
  }

  /** Mark one instance's span dirty on every attribute. */
  dirty(i) {
    for (const key of Object.keys(this.attrs)) {
      const a = this.attrs[key];
      a.addUpdateRange(i * a.itemSize, a.itemSize);
      a.needsUpdate = true;
    }
  }

  /** Kill every live particle (zero the life component) and reset the ring. */
  killAll() {
    const a = this.attrs[this.lifeAttr];
    const arr = a.array;
    const k = a.itemSize;
    for (let i = 0; i < this.capacity; i++) arr[i * k + this.lifeComp] = 0;
    a.clearUpdateRanges();
    a.needsUpdate = true;
    this.cursor = 0;
    this.highWater = 0;
    this.geometry.instanceCount = 0;
  }
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Create the pooled instanced particle system.
 * @param {import('../engine/renderer.js').EngineCtx|object} engineCtx render bundle (§2.8)
 * @param {{ seed?: number }} [opts]
 * @returns {Particles} { group, update(dt), setFrozen(frozen, atTimeS), emit(poolName, opts), pools, resetAll() }
 */
export function createParticleSystem(engineCtx, { seed = 5000 } = {}) {
  const texRng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'fx-particles';
  group.matrixAutoUpdate = false;

  const uTime = { value: 0 };
  let frozen = false;

  const smokeTex = makePuffTexture(texRng, 0.65);
  const fireTex = makeFireTexture(texRng);
  const dustTex = makePuffTexture(texRng, 0.8);
  const flashTex = makeFlashTexture(texRng);
  const jetTex = makeJetTexture(texRng);

  const fogUniforms = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
  // world-space sun direction matching the sky/lighting rig
  // (elevation 35°, azimuth 140° — see src/engine/sky.js)
  const sunDirW = new THREE.Vector3(0.527, 0.574, -0.627).normalize();

  function puffMaterial(map, additive, drag, intensity) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: PUFF_VERT,
      fragmentShader: additive ? PUFF_FRAG_ADDITIVE : PUFF_FRAG_NORMAL,
      uniforms: Object.assign(fogUniforms(), {
        uTime,
        uMap: { value: map },
        uDrag: { value: drag },
        uIntensity: { value: intensity },
        uSunDirW: { value: sunDirW },
      }),
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: true,
    });
    return mat;
  }

  const PUFF_LAYOUT = { aPB: 4, aVL: 4, aSR: 4, aC0: 4, aC1: 4 };
  const STREAK_LAYOUT = { aPB: 4, aVL: 4, aWS: 4, aC: 4 };
  const DEBRIS_LAYOUT = { aPB: 4, aVL: 4, aAR: 4, aSG: 4 };
  const JET_LAYOUT = { aPB: 4, aAL: 4, aWL: 4, aC: 4 };

  const pools = {
    smoke: new Pool('smoke', makeQuadGeometry(POOL_SIZES.smoke),
      puffMaterial(smokeTex, false, 0.9, 1), PUFF_LAYOUT, POOL_SIZES.smoke, 'aVL', 3),
    fire: new Pool('fire', makeQuadGeometry(POOL_SIZES.fire),
      // intensity 1.05: hot enough to bloom where sprites overlap without the
      // stacked-additive HDR clipping the fireball core to a featureless sheet
      puffMaterial(fireTex, true, 1.6, 1.05), PUFF_LAYOUT, POOL_SIZES.fire, 'aVL', 3),
    dust: new Pool('dust', makeQuadGeometry(POOL_SIZES.dust),
      puffMaterial(dustTex, false, 1.4, 1), PUFF_LAYOUT, POOL_SIZES.dust, 'aVL', 3),
    flash: new Pool('flash', makeQuadGeometry(POOL_SIZES.flash),
      // 1.7: bright enough to bloom without clipping to a featureless sheet
      puffMaterial(flashTex, true, 0.6, 1.7), PUFF_LAYOUT, POOL_SIZES.flash, 'aVL', 3),
    jet: new Pool('jet', makeQuadGeometry(POOL_SIZES.jet),
      new THREE.ShaderMaterial({
        vertexShader: JET_VERT,
        fragmentShader: JET_FRAG,
        uniforms: Object.assign(fogUniforms(), {
          uTime, uMap: { value: jetTex }, uIntensity: { value: 1.6 },
        }),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,   // cone quad winding flips with view direction
        fog: true,
      }), JET_LAYOUT, POOL_SIZES.jet, 'aAL', 3),
    sparks: new Pool('sparks', makeQuadGeometry(POOL_SIZES.sparks),
      new THREE.ShaderMaterial({
        vertexShader: STREAK_VERT,
        fragmentShader: STREAK_FRAG,
        uniforms: Object.assign(fogUniforms(), {
          // 1.45: sparks bloom but keep their orange hue instead of
          // tone-mapping to uniform white confetti
          uTime, uDrag: { value: 1.1 }, uIntensity: { value: 1.45 },
        }),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,   // streak ribbon winding flips with view direction
        fog: true,
      }), STREAK_LAYOUT, POOL_SIZES.sparks, 'aVL', 3),
    debris: new Pool('debris', makeChunkGeometry(POOL_SIZES.debris, texRng),
      new THREE.ShaderMaterial({
        vertexShader: DEBRIS_VERT,
        fragmentShader: DEBRIS_FRAG,
        uniforms: Object.assign(fogUniforms(), {
          uTime,
          uSunDir: { value: sunDirW },
        }),
        fog: true,
      }), DEBRIS_LAYOUT, POOL_SIZES.debris, 'aVL', 3),
  };

  // Draw order: opaque debris first (default), then dust → smoke → fire → sparks
  pools.debris.mesh.renderOrder = 0;
  pools.dust.mesh.renderOrder = 20;
  pools.smoke.mesh.renderOrder = 21;
  pools.fire.mesh.renderOrder = 22;
  pools.jet.mesh.renderOrder = 23;
  pools.flash.mesh.renderOrder = 23;
  pools.sparks.mesh.renderOrder = 23;
  for (const key of Object.keys(pools)) group.add(pools[key].mesh);

  // --- emit dispatch --------------------------------------------------------

  function emitPuff(pool, o) {
    const i = pool.claim();
    const birth = uTime.value + (o.birthOffset || 0);
    const A = pool.attrs;
    const pb = A.aPB.array, vl = A.aVL.array, sr = A.aSR.array,
          c0 = A.aC0.array, c1 = A.aC1.array;
    let j = i * 4;
    pb[j] = o.pos[0]; pb[j + 1] = o.pos[1]; pb[j + 2] = o.pos[2]; pb[j + 3] = birth;
    vl[j] = o.vel[0]; vl[j + 1] = o.vel[1]; vl[j + 2] = o.vel[2]; vl[j + 3] = o.life;
    sr[j] = o.size0; sr[j + 1] = o.size1; sr[j + 2] = o.rot || 0; sr[j + 3] = o.rotVel || 0;
    c0[j] = o.col0[0]; c0[j + 1] = o.col0[1]; c0[j + 2] = o.col0[2]; c0[j + 3] = o.grav || 0;
    c1[j] = o.col1[0]; c1[j + 1] = o.col1[1]; c1[j + 2] = o.col1[2]; c1[j + 3] = o.alpha;
    pool.dirty(i);
  }

  function emitStreak(pool, o) {
    const i = pool.claim();
    const birth = uTime.value + (o.birthOffset || 0);
    const A = pool.attrs;
    const pb = A.aPB.array, vl = A.aVL.array, ws = A.aWS.array, c = A.aC.array;
    const j = i * 4;
    pb[j] = o.pos[0]; pb[j + 1] = o.pos[1]; pb[j + 2] = o.pos[2]; pb[j + 3] = birth;
    vl[j] = o.vel[0]; vl[j + 1] = o.vel[1]; vl[j + 2] = o.vel[2]; vl[j + 3] = o.life;
    ws[j] = o.width; ws[j + 1] = o.stretch; ws[j + 2] = (o.grav !== undefined ? o.grav : -21.6);
    ws[j + 3] = o.seed || 0;
    c[j] = o.col[0]; c[j + 1] = o.col[1]; c[j + 2] = o.col[2]; c[j + 3] = o.alpha;
    pool.dirty(i);
  }

  function emitDebris(pool, o) {
    const i = pool.claim();
    const birth = uTime.value + (o.birthOffset || 0);
    const A = pool.attrs;
    const pb = A.aPB.array, vl = A.aVL.array, ar = A.aAR.array, sg = A.aSG.array;
    const j = i * 4;
    pb[j] = o.pos[0]; pb[j + 1] = o.pos[1]; pb[j + 2] = o.pos[2]; pb[j + 3] = birth;
    vl[j] = o.vel[0]; vl[j + 1] = o.vel[1]; vl[j + 2] = o.vel[2]; vl[j + 3] = o.life;
    ar[j] = o.axis[0]; ar[j + 1] = o.axis[1]; ar[j + 2] = o.axis[2]; ar[j + 3] = o.spin;
    sg[j] = o.scale; sg[j + 1] = o.groundY; sg[j + 2] = o.hot ? 1 : 0; sg[j + 3] = o.seed || 0;
    pool.dirty(i);
  }

  function emitJet(pool, o) {
    const i = pool.claim();
    const birth = uTime.value + (o.birthOffset || 0);
    const A = pool.attrs;
    const pb = A.aPB.array, al = A.aAL.array, wl = A.aWL.array, c = A.aC.array;
    const j = i * 4;
    pb[j] = o.pos[0]; pb[j + 1] = o.pos[1]; pb[j + 2] = o.pos[2]; pb[j + 3] = birth;
    al[j] = o.axis[0]; al[j + 1] = o.axis[1]; al[j + 2] = o.axis[2]; al[j + 3] = o.life;
    wl[j] = o.width; wl[j + 1] = o.len0; wl[j + 2] = o.len1; wl[j + 3] = o.seed || 0;
    c[j] = o.col[0]; c[j + 1] = o.col[1]; c[j + 2] = o.col[2]; c[j + 3] = o.alpha;
    pool.dirty(i);
  }

  const EMITTERS = {
    smoke: (o) => emitPuff(pools.smoke, o),
    fire: (o) => emitPuff(pools.fire, o),
    dust: (o) => emitPuff(pools.dust, o),
    flash: (o) => emitPuff(pools.flash, o),
    jet: (o) => emitJet(pools.jet, o),
    sparks: (o) => emitStreak(pools.sparks, o),
    debris: (o) => emitDebris(pools.debris, o),
  };

  return {
    group,
    pools,

    /** Current internal clock (seconds). @returns {number} */
    getTime() { return uTime.value; },

    /**
     * Advance the shared particle clock (no-op while frozen).
     * @param {number} dt seconds
     */
    update(dt) {
      if (!frozen) uTime.value += dt;
    },

    /**
     * Freeze/unfreeze GPU animation; optionally pin the clock.
     * @param {boolean} f
     * @param {number|null} [atTimeS]
     */
    setFrozen(f, atTimeS = null) {
      frozen = f;
      if (atTimeS !== null && atTimeS !== undefined) uTime.value = atTimeS;
    },

    /**
     * Spawn one particle into a named pool.
     * @param {'smoke'|'fire'|'dust'|'flash'|'jet'|'sparks'|'debris'} poolName
     * @param {object} opts pool-specific fields (pos, vel, life, ...; birthOffset backdates)
     */
    emit(poolName, opts) {
      const fn = EMITTERS[poolName];
      if (!fn) throw new Error(`particles: unknown pool '${poolName}'`);
      fn(opts);
    },

    /** Kill all live particles and reset every ring buffer. */
    resetAll() {
      for (const key of Object.keys(pools)) pools[key].killAll();
    },
  };
}
