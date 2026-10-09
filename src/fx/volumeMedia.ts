/**
 * volumeMedia.ts — simulated volumetric media: smoke, dust, soil and fireball bodies (destruction-fx lane, 2026-10-07).
 *
 * The puffs sample flipbooks that tools/fx-volume-bake.mjs built as 3D billow volumes and ray-marched with the light
 * transport baked in (sheet A: light from card +x, +y, -x and coverage; sheet B: light from -y, emission, motion vectors). What
 * this layer does with them, and why (the FX round 6 diagnosis, 2026-10-07: outlined lobes, blue ghosts, one
 * silhouette everywhere, clouds that fall apart, spinning stickers, unsorted pops):
 *
 * LIGHT — six-way: the sun's direction in the card's frame weights the four baked axis responses; light from the
 * camera side and from behind the card follows from coverage (uniform-medium transport along the view ray: front =
 * 1 - a/2, back = tau (1 - a) / a), with a forward-scattering gain on the back term (silver linings where the sun
 * stands behind the smoke, never an outline). Sky light is the scene's own, DESATURATED toward its luminance (shaded
 * dust reads grey, never blue) and weighted by the up-facing response; the ground pole lights the underside. Bright
 * media (dust, spray, snow powder) lift their dark sides by a multiple-scattering term; soot does not.
 *
 * MOTION — every puff follows one law (the CPU sort evaluates the same one): launch velocity relaxing toward the
 * scene wind times its coupling plus a terminal rise, plus a ballistic term. No spin beyond a slow drift, no smear,
 * no camera-dependent squash. The flipbook advances on the sim's own time (warped by gamma, the bake's frame spacing)
 * over the puff's playSeconds, blending frames ALONG the baked motion vectors (no cross-fade ghosting).
 *
 * ORDER — normal-blended media must draw back to front. The pool keeps its records on the CPU and, every frame that
 * any puff is alive, writes the live ones into the instance buffers sorted by view depth (an insertion sort over the
 * previous order: nearly sorted, O(n)), one contiguous upload. Nothing allocates per frame; nothing runs while the
 * pool is empty.
 *
 * Budget: one draw call for every medium (all media share one atlas pair), capacity 640 puffs on desktop. Textures:
 * sheet A RGBA8 at 128 px tiles, sheet B baked at half resolution (its responses are smooth), lazy-loaded at battle
 * warm (warm()), never in the boot chunk, and decoded UN-premultiplied (createImageBitmap premultiplyAlpha 'none'): the
 * colour channels are light and motion data, not colour over coverage, so a premultiplied decode would crush them
 * wherever the alpha channel is low. The phone tier does not create this layer (effects.ts keeps its
 * pooled puffs there).
 */
import * as THREE from 'three';
import { LATE_FX_LAYER } from './layers.ts';

// ---------------------------------------------------------------------------------------------------------------
// Atlas layout (the bake's ledger; volumeMedia.selftest.mjs holds the two in step)
// ---------------------------------------------------------------------------------------------------------------

/** Media in the shared atlas, in band order (each medium owns `variants` consecutive bands). */
type VolumeMediumId = 'billow' | 'burst';

interface VolumeAtlasLayout {
  readonly columns: number;
  readonly rowsPerBand: number;
  readonly frames: number;
  readonly tile: number;
  /** Bands per medium, in atlas order. */
  readonly media: Readonly<Record<VolumeMediumId, { readonly firstBand: number; readonly variants: number;
    readonly gamma: number }>>;
  readonly bands: number;
  readonly flowScale: number;
  readonly urlA: string;
  readonly urlB: string;
}

export const VOLUME_ATLAS: VolumeAtlasLayout = Object.freeze({
  columns: 8,
  rowsPerBand: 8,
  frames: 64,
  tile: 128,
  media: Object.freeze({
    billow: Object.freeze({ firstBand: 0, variants: 1, gamma: 1.5 }),
    burst: Object.freeze({ firstBand: 1, variants: 1, gamma: 1.8 }),
  }),
  bands: 2,
  flowScale: 0.25,
  urlA: '/fx/vol-media-a.png',
  urlB: '/fx/vol-media-b.png',
});

// ---------------------------------------------------------------------------------------------------------------
// The puff record
// ---------------------------------------------------------------------------------------------------------------

/** One puff's emit record. Recipes keep ONE and mutate it per emit (no allocation). */
export interface VolumePuff {
  /** origin (m) and birth offset relative to now (s; negative backdates, positive delays) */
  x: number; y: number; z: number; birthOffset: number;
  /** launch velocity (m/s) and life (s) */
  vx: number; vy: number; vz: number; life: number;
  /** drag (1/s), terminal rise (m/s, + up), wind coupling (0..1.3), ballistic gravity (m/s², + up) */
  drag: number; rise: number; windK: number; grav: number;
  /** card size at birth and at the end of life (m), growth exponent (fast early growth > 1), rotation (rad) */
  size0: number; size1: number; growExp: number; rot: number;
  /** albedo at birth and at death (linear rgb), peak opacity, fade-in (s) */
  r0: number; g0: number; b0: number; density: number;
  r1: number; g1: number; b1: number; fadeIn: number;
  /** flipbook: medium, variant (taken modulo the medium's variants), mirrored, sim seconds the life plays, start frame */
  medium: VolumeMediumId; variant: number; mirror: boolean; playSeconds: number; startFrame: number;
  /** the card's width over its height (1 square; a base surge lies wide and flat, an ejecta jet stands tall) */
  aspect: number;
  /** heat at birth (emission gain), cooling rate (1/s), fade-out start (life fraction), slow spin (rad/s) */
  heat: number; cool: number; fadeOut: number; spin: number;
}

export function makeVolumePuff(): VolumePuff {
  return {
    x: 0, y: 0, z: 0, birthOffset: 0, vx: 0, vy: 0, vz: 0, life: 1,
    drag: 1, rise: 0, windK: 1, grav: 0, size0: 1, size1: 2, growExp: 2, rot: 0,
    r0: 0.5, g0: 0.5, b0: 0.5, density: 1, r1: 0.5, g1: 0.5, b1: 0.5, fadeIn: 0.05,
    medium: 'burst', variant: 0, mirror: false, playSeconds: 4, startFrame: 0, aspect: 1,
    heat: 0, cool: 1, fadeOut: 0.5, spin: 0,
  };
}

/** Floats per record (8 vec4 attributes). */
const STRIDE = 32;
const ATTRS = ['aPB', 'aVL', 'aDY', 'aSZ', 'aCA', 'aCB', 'aFB', 'aHT'] as const;

/**
 * The motion law, shared by the shader and the CPU sort (and by recipes that need a puff's position):
 *   target = wind * windK + up * rise
 *   x(t) = x0 + target t + (v0 - target)(1 - e^-kt)/k + up * grav t^2 / 2
 */
/** Wind shear (1/m): the wind a puff takes grows with its height over its birth (a column leans over as it climbs). */
export const VOLUME_SHEAR_K = 0.03;
/** Eddies: a puff wanders by this share of its size per second of age (up to 4 s), on slow seeded cycles. */
export const VOLUME_TURB_K = 0.05;

export function volumePositionAt(rec: ArrayLike<number>, o: number, windX: number, windZ: number, age: number,
  out: Float32Array | number[]): void {
  const k = Math.max(rec[o + 8], 1e-3);
  const tx = windX * rec[o + 10], ty = rec[o + 9], tz = windZ * rec[o + 10];
  const s = (1 - Math.exp(-k * age)) / k;
  out[0] = rec[o] + tx * age + (rec[o + 4] - tx) * s;
  out[1] = rec[o + 1] + ty * age + (rec[o + 5] - ty) * s + 0.5 * rec[o + 11] * age * age;
  out[2] = rec[o + 2] + tz * age + (rec[o + 6] - tz) * s;
  // the shear (the eddies, under a metre for most puffs, are left to the shader: the sort does not need them)
  const up = Math.max(0, out[1] - rec[o + 1]) * VOLUME_SHEAR_K * age * rec[o + 10];
  out[0] += windX * up;
  out[2] += windZ * up;
}

// ---------------------------------------------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------------------------------------------

const FOG_PARS_V = `
#ifdef USE_FOG
  varying float vFogDepth;
#endif
`;
const FOG_PARS_F = `
#ifdef USE_FOG
  uniform vec3 fogColor;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  varying float vFogDepth;
#endif
`;

/** Burst glow slots (a ring: the oldest is replaced). */
const GLOW_SLOTS = 4;

const VOLUME_VERT = /* glsl */ `
attribute vec4 aPB;
attribute vec4 aVL;
attribute vec4 aDY;
attribute vec4 aSZ;
attribute vec4 aCA;
attribute vec4 aCB;
attribute vec4 aFB;
attribute vec4 aHT;
uniform float uTime;
uniform vec3 uWind;
uniform vec3 uSunDir;
uniform vec4 uAtlas;      // columns, total rows, rows per band, frames
uniform vec2 uNearFade;
uniform vec4 uBandWarp[ ${VOLUME_ATLAS.bands} ]; // per band: 1/gamma, unused...
uniform vec4 uGlowP[ ${GLOW_SLOTS} ];  // a burst's light inside the medium: centre xyz, birth (fx clock)
uniform vec4 uGlowK[ ${GLOW_SLOTS} ];  // its radius (m), peak, duration (s), unused
varying float vGlow;
varying vec2 vUvA;
varying vec2 vUvB;
varying vec4 vTiles;      // tile min corners (atlas uv) of frames A and B
varying float vBlend;
varying vec4 vColor;
varying vec4 vW;          // six-way weights: +x, -x, +y, -y (card frame)
varying vec2 vWfb;        // front, back
varying float vHeat;
varying float vMirror;
varying float vT;
varying float vFade;
varying float vParticleDepth;
varying float vFeather;
varying vec2 vDetail;
${FOG_PARS_V}
void main() {
  float life = aVL.w;
  float age = uTime - aPB.w;
  if ( life <= 0.0 || age < 0.0 || age > life ) {
    vUvA = vec2( 0.0 ); vUvB = vec2( 0.0 ); vTiles = vec4( 0.0 ); vBlend = 0.0; vColor = vec4( 0.0 ); vDetail = vec2( 0.0 );
    vW = vec4( 0.0 ); vWfb = vec2( 0.0 ); vHeat = 0.0; vMirror = 1.0; vT = 0.0; vFade = 1.0; vParticleDepth = 1e9;
    vFeather = 1.0; vGlow = 0.0;
    gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
    #ifdef USE_FOG
      vFogDepth = 1.0;
    #endif
    return;
  }
  float t = age / life;
  vT = t;
  // --- motion
  float k = max( aDY.x, 1e-3 );
  vec3 target = uWind * aDY.z + vec3( 0.0, aDY.y, 0.0 );
  vec3 center = aPB.xyz + target * age + ( aVL.xyz - target ) * ( ( 1.0 - exp( -k * age ) ) / k )
    + vec3( 0.0, 0.5 * aDY.w * age * age, 0.0 );
  // (round 7b, wave m2: "chimney columns") the wind grows with height over the puff's birth: a column leans over
  // downwind as it climbs
  center.xz += uWind.xz * ( max( 0.0, center.y - aPB.y ) * ${VOLUME_SHEAR_K.toFixed(3)} * age * aDY.z );
  // --- size and the card
  float grow = 1.0 - pow( 1.0 - t, max( aSZ.z, 0.3 ) );
  float size = mix( aSZ.x, aSZ.y, grow );
  // eddies: slow seeded cycles push each puff about, more as it ages and the bigger it is (no two neighbours move alike)
  float ph1 = fract( aPB.w * 0.7548777 + aPB.x * 0.013 ) * 6.2832, ph2 = fract( aPB.w * 0.5698403 + aPB.z * 0.017 ) * 6.2832;
  center += vec3( sin( age * 0.83 + ph1 ), 0.4 * sin( age * 1.13 + ph2 ), cos( age * 0.71 + ph2 ) )
    * ( ${VOLUME_TURB_K.toFixed(3)} * size * min( age, 4.0 ) );
  float ang = aSZ.w + aHT.w * age;
  float ca = cos( ang ), sa = sin( ang );
  vec3 camRight = vec3( viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0] );
  vec3 camUp    = vec3( viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1] );
  vec3 camBack  = vec3( viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2] );
  // aFB.y: the card's aspect (width / height), negative when the card is mirrored
  float aspect = max( abs( aFB.y ), 0.25 );
  float px = position.x * aspect;
  vec2 corner = vec2( px * ca - position.y * sa, px * sa + position.y * ca ) * size;
  vec3 wpos = center + camRight * corner.x + camUp * corner.y;
  // --- flipbook: the sim's own clock (gamma-warped frame spacing), blended along the motion vectors
  float band = aFB.x;
  float mirror = aFB.y < 0.0 ? -1.0 : 1.0;
  vMirror = mirror;
  float invGamma = uBandWarp[ int( band + 0.5 ) ].x;
  float frames = uAtlas.w;
  float p = clamp( age / max( aFB.z, 0.05 ), 0.0, 1.0 );
  float fpos = clamp( aFB.w + ( frames - 1.0 ) * pow( p, invGamma ), 0.0, frames - 1.0 );
  float f0 = floor( fpos );
  float f1 = min( f0 + 1.0, frames - 1.0 );
  vBlend = fpos - f0;
  vec2 local = vec2( mirror < 0.0 ? 1.0 - uv.x : uv.x, uv.y );
  float cols = uAtlas.x, rows = uAtlas.y;
  vec2 tileA = vec2( mod( f0, cols ), rows - 1.0 - ( band * uAtlas.z + floor( f0 / cols ) ) );
  vec2 tileB = vec2( mod( f1, cols ), rows - 1.0 - ( band * uAtlas.z + floor( f1 / cols ) ) );
  vTiles = vec4( tileA / vec2( cols, rows ), tileB / vec2( cols, rows ) );
  vUvA = ( tileA + local ) / vec2( cols, rows );
  vUvB = ( tileB + local ) / vec2( cols, rows );
  // the fine tear riding the card: its own place in the tiling noise (from its birth), drifting up through it
  vDetail = local * 1.7 + fract( vec2( aPB.w * 0.6180339, aPB.w * 0.4142136 ) ) * 9.0 + vec2( 0.0, -0.06 * age );
  // --- six-way weights: the sun in the card's (rotated, mirrored) frame
  vec3 rightC = camRight * ca + camUp * sa;
  vec3 upC = -camRight * sa + camUp * ca;
  vec3 s = vec3( dot( uSunDir, rightC ) * mirror, dot( uSunDir, upC ), dot( uSunDir, camBack ) );
  vec3 sp = max( s, 0.0 ), sn = max( -s, 0.0 );
  vW = vec4( sp.x * sp.x, sn.x * sn.x, sp.y * sp.y, sn.y * sn.y );
  vWfb = vec2( sp.z * sp.z, sn.z * sn.z );
  // --- colour, opacity, heat
  float fadeIn = aCB.w > 0.0 ? smoothstep( 0.0, aCB.w, age ) : 1.0;
  // the fade-out dissolves the medium from its thin edges inward (the fragment shader's erosion), so a dying puff never
  // lingers as a uniformly faded ghost of its own silhouette
  vFade = smoothstep( aHT.z, 1.0, t );
  // (2026-10-08, the owner's "black screens") the medium thins as the camera enters it, judged from the puff's centre
  // against its own size: a corner's distance let a big dark puff round the camera (the 7c smoke reaches ~11 m on a
  // 125 mm burst, ~19 m on a 152 mm) draw one flat dark card over the whole frame for seconds
  float near = smoothstep( uNearFade.x + 0.25 * size, uNearFade.y + 0.6 * size, distance( center, cameraPosition ) );
  vColor = vec4( mix( aCA.rgb, aCB.rgb, smoothstep( 0.0, 1.0, t ) ), aCA.w * fadeIn * near );
  vHeat = aHT.x * exp( -aHT.y * age );
  // the bursts' light inside the medium: each recent burst lights the puffs round it for a moment, falling off with the
  // distance from its heart (its own fireball and soil, and the dust of an earlier burst it landed in)
  float gl = 0.0;
  for ( int i = 0; i < ${GLOW_SLOTS}; i++ ) {
    vec4 gp = uGlowP[ i ];
    vec4 gk = uGlowK[ i ];
    float ga = uTime - gp.w;
    if ( gk.z <= 0.0 || ga < 0.0 || ga > gk.z ) continue;
    float q = 1.0 - ga / gk.z;
    vec3 gd = center - gp.xyz;
    gl += gk.y * q * q * exp( -dot( gd, gd ) / max( gk.x * gk.x, 1e-3 ) );
  }
  vGlow = gl;
  vFeather = clamp( size * 0.22, 0.5, 6.0 );
  vec4 mvPosition = viewMatrix * vec4( wpos, 1.0 );
  vParticleDepth = -mvPosition.z;
  #ifdef USE_FOG
    vFogDepth = -mvPosition.z;
  #endif
  gl_Position = projectionMatrix * mvPosition;
}
`;

const VOLUME_FRAG = /* glsl */ `
uniform sampler2D uMapA;
uniform sampler2D uMapB;
uniform vec4 uAtlas;
uniform float uFlowScale;
uniform vec3 uSunCol;     // sun irradiance / pi (gained)
uniform vec3 uSkyCol;     // sky irradiance / pi, desaturated (gained)
uniform vec3 uGroundCol;  // ground pole / pi
uniform vec4 uGrade;      // alpha gain, emission gain, back-scatter gain, multiple-scatter lift
uniform sampler2D uSceneDepth;
uniform vec2 uSoftViewport;
uniform float uCameraNear;
uniform float uCameraFar;
uniform sampler2D uDetail;
uniform float uDetailK;
uniform float uWarpK;
varying vec2 vDetail;
varying vec2 vUvA;
varying vec2 vUvB;
varying vec4 vTiles;
varying float vBlend;
varying vec4 vColor;
varying vec4 vW;
varying vec2 vWfb;
varying float vHeat;
varying float vMirror;
varying float vT;
varying float vFade;
varying float vParticleDepth;
varying float vFeather;
varying float vGlow;
${FOG_PARS_F}
float softDepthFadeV() {
  vec2 suv = gl_FragCoord.xy / max( uSoftViewport, vec2( 1.0 ) );
  float rawDepth = texture2D( uSceneDepth, suv ).x;
  float sceneDepthM = -( uCameraNear * uCameraFar ) / ( ( uCameraFar - uCameraNear ) * rawDepth - uCameraFar );
  return smoothstep( 0.0, vFeather, sceneDepthM - vParticleDepth );
}
vec3 blackbody( float h ) {
  // ember red -> orange -> yellow -> white (linear; saturated so the filmic curve keeps it fire)
  vec3 c = mix( vec3( 0.55, 0.06, 0.01 ), vec3( 1.0, 0.30, 0.03 ), smoothstep( 0.05, 0.35, h ) );
  c = mix( c, vec3( 1.0, 0.58, 0.14 ), smoothstep( 0.3, 0.65, h ) );
  return mix( c, vec3( 1.0, 0.86, 0.55 ), smoothstep( 0.62, 1.0, h ) );
}
vec2 clampTile( vec2 uv, vec2 tileMin, vec2 tileSize ) {
  vec2 m = tileSize * 0.012;
  return clamp( uv, tileMin + m, tileMin + tileSize - m );
}
void main() {
  vec2 tileSize = 1.0 / uAtlas.xy;
  // motion vectors (tile uv per frame, x mirrored with the card) carry frame A forward and frame B back
  vec2 fl = ( texture2D( uMapB, vUvA ).ba * 2.0 - 1.0 ) * uFlowScale;
  fl.x *= vMirror;
  fl *= tileSize;
  // (round 7b, wave m2: "cotton-ball puffs") the card's lookup warped by a slow turbulent field: no silhouette is a clean
  // round ball, and the warp grows as the puff ages and spreads
  vec2 wn = vec2( texture2D( uDetail, vDetail * 0.37 + vec2( 0.11, 0.29 ) ).r, texture2D( uDetail, vDetail * 0.37 + vec2( 0.53, 0.71 ) ).r ) - 0.5;
  vec2 warp = wn * tileSize * uWarpK * ( 0.5 + 0.8 * vT );
  vec2 uvA = clampTile( vUvA - fl * vBlend + warp, vTiles.xy, tileSize );
  vec2 uvB = clampTile( vUvB + fl * ( 1.0 - vBlend ) + warp, vTiles.zw, tileSize );
  vec4 A = mix( texture2D( uMapA, uvA ), texture2D( uMapA, uvB ), vBlend );
  vec4 B = mix( texture2D( uMapB, uvA ), texture2D( uMapB, uvB ), vBlend );
  float cov = A.a;
  // erode from the thin edges inward as the puff dies (vFade 0 -> 1)
  float k = vFade;
  float covE = clamp( ( cov - 0.8 * k ) / max( 1.0 - 0.8 * k, 0.05 ), 0.0, 1.0 );
  // the thin rim tears into fine wisps at every distance (a tiling noise finer than the flipbook's texels); the dense
  // body keeps its shape
  float dn = texture2D( uDetail, vDetail ).r * 0.62 + texture2D( uDetail, vDetail * 2.31 + 0.37 ).r * 0.38;
  float er = uDetailK * ( 1.0 - smoothstep( 0.2, 0.9, cov ) ) * dn;
  covE = clamp( ( covE - er ) / max( 1.0 - er, 0.05 ), 0.0, 1.0 );
  float a = covE * vColor.a * ( 1.0 - k * k ) * uGrade.x;
  if ( a < 0.003 ) discard;
  a *= softDepthFadeV();
  if ( a < 0.003 ) discard;
  // decode (sqrt-stored) responses; a mirrored card swaps its left and right
  float rx = A.r * A.r, lx = A.b * A.b;
  float R = vMirror > 0.0 ? rx : lx;
  float L = vMirror > 0.0 ? lx : rx;
  float U = A.g * A.g, D = B.r * B.r;
  float tau = -log( max( 1.0 - cov * 0.995, 1e-3 ) );
  float front = 1.0 - 0.5 * cov;
  float back = clamp( tau * ( 1.0 - cov ) / max( cov, 1e-3 ), 0.0, 1.0 );
  float sunL = ( vW.x * R + vW.y * L + vW.z * U + vW.w * D + vWfb.x * front + vWfb.y * back * uGrade.z )
    * ( 0.88 + 0.24 * dn );
  float skyL = 0.5 * U + 0.15 * ( R + L ) + 0.2 * front;
  // multiple scattering: bright media (dust, powder, spray) lift their shaded side; soot stays dark
  float albedoL = dot( vColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  float ms = uGrade.w * smoothstep( 0.08, 0.5, albedoL );
  sunL = mix( sunL, sqrt( sunL ), ms );
  skyL = mix( skyL, sqrt( skyL ), ms * 0.6 );
  // dark media take the sky neutral: soot scatters what little it does without the sky's blue (round 4: a rocket's
  // smoke read as blue ghosts), bright dust keeps a little of it
  float skyLum = dot( uSkyCol, vec3( 0.2126, 0.7152, 0.0722 ) );
  vec3 skyC = mix( vec3( skyLum ), uSkyCol, smoothstep( 0.04, 0.3, albedoL ) );
  vec3 col = vColor.rgb * ( uSunCol * sunL + skyC * skyL + uGroundCol * ( 0.35 * D + 0.1 ) );
  // fire inside the medium: the baked temperature x the puff's heat, on a blackbody ramp; the soot it lights
  float tb = B.g * B.g;
  float h = clamp( tb * vHeat, 0.0, 1.6 );
  if ( h > 0.002 ) {
    // (round 7b, wave m2: "flat orange fireballs with no core") a white-yellow heart (the bake's hottest) inside a darker,
    // sooty shell: the heat rises at the core and falls at the rim, and the rim's own colour is the soot's
    float core = smoothstep( 0.3, 0.85, tb );
    float hc = h * ( 0.5 + 0.85 * core );
    vec3 glow = blackbody( min( hc, 1.0 ) ) * ( 6.5 * hc * hc ) * uGrade.y;
    col = col * ( 1.0 - 0.85 * smoothstep( 0.1, 0.55, hc ) ) * mix( 0.5, 1.0, core ) + glow;
  }
  // lit from inside by a burst: the thick body more than its thin rim, in the medium's own colour warmed by the fire
  if ( vGlow > 0.002 ) col += ( vColor.rgb * 0.6 + vec3( 0.55, 0.2, 0.05 ) ) * vGlow * ( 0.35 + 0.65 * cov ) * uGrade.y;
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( -fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    col = mix( col, fogColor, fogFactor );
  #endif
  // (2026-10-08, the owner's black screens) the emission stays far inside half-float range, and a NaN or Inf fragment
  // is dropped rather than written (the late composite's guard is the backstop behind this one)
  col = min( col, vec3( 4096.0 ) );
  if ( !( abs( col.r ) < 6.0e4 && abs( col.g ) < 6.0e4 && abs( col.b ) < 6.0e4 && abs( a ) < 6.0e4 ) ) discard;
  gl_FragColor = vec4( col, min( a, 1.0 ) );
}
`;

// ---------------------------------------------------------------------------------------------------------------
// The pool
// ---------------------------------------------------------------------------------------------------------------

interface SoftParticleUniforms {
  uSceneDepth: { value: unknown };
  uSoftViewport: { value: THREE.Vector2 };
  uCameraNear: { value: number };
  uCameraFar: { value: number };
}

interface LightRigLike {
  sunIntensity?: number; sunColor?: THREE.Color; hemiIntensity?: number; hemiSky?: THREE.Color; hemiGround?: THREE.Color;
}
interface LightModelLike {
  mode?: string; envIntensity?: number; envDiffuseGain?: number; groundRadiance?: readonly number[];
}
interface SceneLightData {
  sunDirWorld?: THREE.Vector3; lightRig?: LightRigLike; lightModel?: LightModelLike; skyIrradiance?: THREE.Color;
  surfaceWind?: { x: number; z: number } | null;
  volumetricClouds?: { currentPreset?: { windDirRad?: number; windSpeed?: number } | null } | null;
}

/** Ground wind from the cloud layer's wind aloft (m/s); the fixed fallback leans like main's columns did. */
const FALLBACK_WIND: readonly [number, number] = [1.6, 0.55];
function groundWindFromAloft(speedAloft: number): number {
  return Math.min(4.5, Math.max(1.2, speedAloft * 0.4));
}

/** Diagnostic grade (live-tunable through group.userData.volumeTune; play values below). */
// skySat 0.22 -> 0.12 (wave 273: thinning dust turned bluish)
const DEFAULT_TUNE = Object.freeze({ sun: 1.0, sky: 1.0, skySat: 0.12, alpha: 1.0, glow: 1.0, back: 1.6, ms: 0.55, detail: 0.55,
  warp: 0.16 });

interface VolumeMediaOptions {
  soft: SoftParticleUniforms;
  now: () => number;
  scene?: THREE.Scene | null;
  capacity?: number;
}

/** How far the detail tear eats into a puff's thin rim (0 off). */
const DETAIL_K = 0.55;

/** A tileable 128 x 128 fractal value noise (seeded; built once): the fine tear of the media's thin rims. */
function detailNoiseTexture(seed: number): THREE.DataTexture {
  const S = 128;
  const out = new Float32Array(S * S);
  let a = seed | 0;
  const rand = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let amp = 1, norm = 0;
  for (const period of [8, 16, 32, 64]) {
    const lat = new Float32Array(period * period);
    for (let i = 0; i < lat.length; i++) lat[i] = rand();
    const cell = S / period;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const gx = x / cell, gy = y / cell;
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      let fx = gx - x0, fy = gy - y0;
      fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
      const v00 = lat[y0 * period + x0], v10 = lat[y0 * period + x1], v01 = lat[y1 * period + x0], v11 = lat[y1 * period + x1];
      out[y * S + x] += amp * (v00 + (v10 - v00) * fx + (v01 - v00) * fy + (v00 - v10 - v01 + v11) * fx * fy);
    }
    norm += amp;
    amp *= 0.55;
  }
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    // stretch the sum's narrow middle toward 0..1
    const v = Math.min(1, Math.max(0, (out[i] / norm - 0.5) * 2.2 + 0.5));
    const b = Math.round(v * 255);
    data[i * 4] = b; data[i * 4 + 1] = b; data[i * 4 + 2] = b; data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S);
  t.name = 'fx-volume-detail';
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

export interface VolumeMedia {
  readonly group: THREE.Group;
  /** Start (or join) the atlas load; resolves true when both sheets are on their textures. */
  warm(): Promise<boolean>;
  readonly ready: boolean;
  emit(p: VolumePuff): void;
  /** Per render frame: light, wind, the depth sort and the upload (no work while nothing is alive). */
  update(camera: THREE.Camera | null | undefined): void;
  shiftTime(delta: number): void;
  reset(): void;
  isActive(): boolean;
  /** receipts: live count, capacity, the last frame's sorted count, the current wind */
  stats(): { live: number; capacity: number; drawn: number; wind: [number, number]; ready: boolean };
  /** receipts: the motion law's wind */
  readonly wind: THREE.Vector3;
  /** A burst's light inside the medium for `durS` from now + `birthOffset` (centre, radius m, peak 0..~1.5). */
  glow(x: number, y: number, z: number, radiusM: number, peak: number, durS: number, birthOffset?: number): void;
}

export function createVolumeMedia(o: VolumeMediaOptions): VolumeMedia {
  // (round 3: longer-lived column puffs; 1024 records hold six burning hulls and a barrage)
  const capacity = Math.max(16, o.capacity ?? 1536);
  const group = new THREE.Group();
  group.name = 'fx-volume-media';
  group.matrixAutoUpdate = false;

  // CPU records (emit slots, ring) and the GPU instance arrays (sorted live copy)
  const rec = new Float32Array(capacity * STRIDE);
  const live = new Int32Array(capacity);
  const order = new Int32Array(capacity);
  let orderCount = 0;
  const depth = new Float32Array(capacity);
  const inOrder = new Uint8Array(capacity);
  let cursor = 0;
  let liveUntil = -Infinity;

  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.instanceCount = 0;
  const gpu: Float32Array[] = [];
  const attrs: THREE.InstancedBufferAttribute[] = [];
  for (const name of ATTRS) {
    const arr = new Float32Array(capacity * 4);
    const attr = new THREE.InstancedBufferAttribute(arr, 4);
    attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(name, attr);
    gpu.push(arr);
    attrs.push(attr);
  }

  // textures: 1x1 transparent placeholders until warm() lands the sheets
  const placeholder = (): THREE.DataTexture => {
    const t = new THREE.DataTexture(new Uint8Array([128, 128, 128, 0]), 1, 1);
    t.needsUpdate = true;
    return t;
  };
  const mapA = { value: placeholder() as THREE.Texture };
  const mapB = { value: placeholder() as THREE.Texture };
  const uTime = { value: 0 };
  const uWind = { value: new THREE.Vector3(FALLBACK_WIND[0], 0, FALLBACK_WIND[1]) };
  const uSunDir = { value: new THREE.Vector3(0.527, 0.574, -0.627).normalize() };
  const uSunCol = { value: new THREE.Vector3(1.4, 1.35, 1.25) };
  const uSkyCol = { value: new THREE.Vector3(0.3, 0.32, 0.35) };
  const uGroundCol = { value: new THREE.Vector3(0.14, 0.13, 0.11) };
  const uGrade = { value: new THREE.Vector4(1, 1, DEFAULT_TUNE.back, DEFAULT_TUNE.ms) };
  const totalRows = VOLUME_ATLAS.bands * VOLUME_ATLAS.rowsPerBand;
  const bandWarp: THREE.Vector4[] = [];
  for (let b = 0; b < VOLUME_ATLAS.bands; b++) bandWarp.push(new THREE.Vector4(1, 0, 0, 0));
  for (const id of Object.keys(VOLUME_ATLAS.media) as VolumeMediumId[]) {
    const m = VOLUME_ATLAS.media[id];
    for (let v = 0; v < m.variants; v++) bandWarp[m.firstBand + v].x = 1 / m.gamma;
  }
  const tune = { ...DEFAULT_TUNE };
  const glowP: THREE.Vector4[] = [], glowK: THREE.Vector4[] = [];
  for (let i = 0; i < GLOW_SLOTS; i++) { glowP.push(new THREE.Vector4(0, 0, 0, -1e9)); glowK.push(new THREE.Vector4(1, 0, 0, 0)); }
  let glowNext = 0;
  const detail = detailNoiseTexture(0x5eedde7);
  const uDetailK = { value: DETAIL_K };
  const uWarpK = { value: DEFAULT_TUNE.warp };
  group.userData.volumeTune = tune;

  const material = new THREE.ShaderMaterial({
    vertexShader: VOLUME_VERT,
    fragmentShader: VOLUME_FRAG,
    uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
      uTime, uWind, uSunDir, uSunCol, uSkyCol, uGroundCol, uGrade,
      uMapA: mapA, uMapB: mapB,
      uAtlas: { value: new THREE.Vector4(VOLUME_ATLAS.columns, totalRows, VOLUME_ATLAS.rowsPerBand, VOLUME_ATLAS.frames) },
      uFlowScale: { value: VOLUME_ATLAS.flowScale },
      uBandWarp: { value: bandWarp },
      uGlowP: { value: glowP }, uGlowK: { value: glowK },
      uNearFade: { value: new THREE.Vector2(0.8, 3.4) },
      uDetail: { value: detail }, uDetailK, uWarpK,
      uSceneDepth: o.soft.uSceneDepth,
      uSoftViewport: o.soft.uSoftViewport,
      uCameraNear: o.soft.uCameraNear,
      uCameraFar: o.soft.uCameraFar,
    }),
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    fog: true,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'fx-volume-media';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // draw order in the late pass: the battle dust (20) and smoke (21) under it, the additive fire (22) over it
  mesh.renderOrder = 21.4;
  mesh.layers.set(LATE_FX_LAYER);
  mesh.visible = false;
  group.add(mesh);

  // --- the atlas load (lazy: warm() at battle warm or Studio entry)
  let ready = false;
  let loading: Promise<boolean> | null = null;
  async function loadSheet(src: string): Promise<ImageBitmap | HTMLImageElement> {
    if (typeof createImageBitmap === 'function' && typeof fetch === 'function') {
      try {
        const blob = await (await fetch(src)).blob();
        return await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none', imageOrientation: 'flipY' });
      } catch { /* fall back to an image element below */ }
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = async () => { try { await img.decode?.(); } catch { /* onload suffices */ } resolve(img); };
      img.onerror = () => reject(new Error(`volume media atlas failed: ${src}`));
      img.src = src;
    });
  }
  function sheetTexture(img: ImageBitmap | HTMLImageElement, name: string): THREE.Texture {
    const t = new THREE.Texture(img as unknown as HTMLImageElement);
    t.name = name;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.colorSpace = THREE.NoColorSpace; // data, not colour: the shader decodes it
    t.premultiplyAlpha = false;
    // an ImageBitmap arrives already flipped (imageOrientation 'flipY'); an image element flips on upload
    t.flipY = !(typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap);
    t.needsUpdate = true;
    return t;
  }
  function warm(): Promise<boolean> {
    if (ready) return Promise.resolve(true);
    if (typeof Image === 'undefined' && typeof createImageBitmap !== 'function') return Promise.resolve(false);
    if (!loading) {
      loading = Promise.all([loadSheet(VOLUME_ATLAS.urlA), loadSheet(VOLUME_ATLAS.urlB)]).then(([a, b]) => {
        (mapA.value as THREE.Texture).dispose();
        (mapB.value as THREE.Texture).dispose();
        mapA.value = sheetTexture(a, 'fx-volume-a');
        mapB.value = sheetTexture(b, 'fx-volume-b');
        ready = true;
        return true;
      }).catch(() => { loading = null; return false; });
    }
    return loading;
  }

  const o_now = o.now;
  // --- emit
  const bandOf = (p: VolumePuff): number => {
    const m = VOLUME_ATLAS.media[p.medium];
    return m.firstBand + (Math.abs(Math.floor(p.variant)) % m.variants);
  };
  function emit(p: VolumePuff): void {
    const i = cursor;
    cursor = (cursor + 1) % capacity;
    const o = i * STRIDE;
    const birth = o_now() + p.birthOffset;
    rec[o] = p.x; rec[o + 1] = p.y; rec[o + 2] = p.z; rec[o + 3] = birth;
    rec[o + 4] = p.vx; rec[o + 5] = p.vy; rec[o + 6] = p.vz; rec[o + 7] = p.life;
    rec[o + 8] = p.drag; rec[o + 9] = p.rise; rec[o + 10] = p.windK; rec[o + 11] = p.grav;
    rec[o + 12] = p.size0; rec[o + 13] = p.size1; rec[o + 14] = p.growExp; rec[o + 15] = p.rot;
    rec[o + 16] = p.r0; rec[o + 17] = p.g0; rec[o + 18] = p.b0; rec[o + 19] = p.density;
    rec[o + 20] = p.r1; rec[o + 21] = p.g1; rec[o + 22] = p.b1; rec[o + 23] = p.fadeIn;
    rec[o + 24] = bandOf(p); rec[o + 25] = (p.mirror ? -1 : 1) * Math.min(4, Math.max(0.25, p.aspect > 0 ? p.aspect : 1)); rec[o + 26] = p.playSeconds; rec[o + 27] = p.startFrame;
    rec[o + 28] = p.heat; rec[o + 29] = p.cool; rec[o + 30] = p.fadeOut; rec[o + 31] = p.spin;
    if (birth + p.life > liveUntil) liveUntil = birth + p.life;
  }

  // --- per frame
  const _pos = new Float32Array(3);
  const _camPos = new THREE.Vector3();
  const _camFwd = new THREE.Vector3();
  let drawn = 0;
  let liveCount = 0;
  function refreshLight(): void {
    const ud = (o.scene?.userData ?? null) as SceneLightData | null;
    const sunDir = ud?.sunDirWorld;
    if (sunDir && sunDir.lengthSq() > 1e-8) uSunDir.value.copy(sunDir).normalize();
    const rig = ud?.lightRig;
    if (rig) {
      const si = (rig.sunIntensity ?? 4.5) * tune.sun / Math.PI;
      const sc = rig.sunColor;
      uSunCol.value.set(sc ? sc.r * si : si, sc ? sc.g * si : si, sc ? sc.b * si : si);
      const model = ud?.lightModel;
      const irr = ud?.skyIrradiance;
      const physical = model?.mode === 'physical' && !!irr;
      const hi = (rig.hemiIntensity ?? 0.4) * (physical ? 1 : 2.2) * tune.sky / Math.PI;
      const sky = rig.hemiSky, gnd = rig.hemiGround;
      let sr = sky ? sky.r * hi : hi, sg = sky ? sky.g * hi : hi, sb = sky ? sky.b * hi : hi;
      let gr = gnd ? gnd.r * hi : hi, gg = gnd ? gnd.g * hi : hi, gb = gnd ? gnd.b * hi : hi;
      if (physical && irr) {
        const kk = (model?.envIntensity ?? 1) * (model?.envDiffuseGain ?? 1) * tune.sky;
        sr += irr.r * kk; sg += irr.g * kk; sb += irr.b * kk;
        const g2 = model?.groundRadiance;
        if (g2 && g2.length >= 3) { gr += g2[0] * kk; gg += g2[1] * kk; gb += g2[2] * kk; }
      }
      // desaturate the sky pole: light scattered inside dust and smoke mixes the sky with the sun and the ground —
      // a shaded face reads grey (FX round 6's thin puffs read sky-blue)
      const lum = 0.2126 * sr + 0.7152 * sg + 0.0722 * sb;
      const ks = tune.skySat;
      uSkyCol.value.set(lum + (sr - lum) * ks, lum + (sg - lum) * ks, lum + (sb - lum) * ks);
      uGroundCol.value.set(gr, gg, gb);
    }
    uGrade.value.set(tune.alpha, tune.glow, tune.back, tune.ms);
    uDetailK.value = tune.detail;
    uWarpK.value = tune.warp;
    const surfaceWind = ud?.surfaceWind;
    const preset = ud?.volumetricClouds?.currentPreset;
    if (surfaceWind && Number.isFinite(surfaceWind.x) && Number.isFinite(surfaceWind.z)) {
      uWind.value.set(surfaceWind.x, 0, surfaceWind.z);
    } else if (preset && Number.isFinite(preset.windDirRad) && Number.isFinite(preset.windSpeed)) {
      const speed = groundWindFromAloft(preset.windSpeed as number);
      uWind.value.set(Math.cos(preset.windDirRad as number) * speed, 0, Math.sin(preset.windDirRad as number) * speed);
    }
  }

  function update(camera: THREE.Camera | null | undefined): void {
    const now = o_now();
    uTime.value = now;
    if (!(now <= liveUntil)) {
      if (geo.instanceCount !== 0) geo.instanceCount = 0;
      // idle: out of the render list entirely (no program bind, no uniform upload, no draw)
      mesh.visible = false;
      drawn = 0; liveCount = 0; orderCount = 0;
      return;
    }
    refreshLight();
    // live set (birth <= now <= birth + life), keeping last frame's order for an almost-sorted start
    let n = 0;
    inOrder.fill(0);
    for (let q = 0; q < orderCount; q++) {
      const i = order[q];
      const ob = i * STRIDE;
      const age = now - rec[ob + 3];
      if (rec[ob + 7] > 0 && age >= 0 && age <= rec[ob + 7]) { live[n++] = i; inOrder[i] = 1; }
    }
    for (let i = 0; i < capacity; i++) {
      if (inOrder[i]) continue;
      const ob = i * STRIDE;
      const age = now - rec[ob + 3];
      if (rec[ob + 7] > 0 && age >= 0 && age <= rec[ob + 7]) live[n++] = i;
    }
    liveCount = n;
    // view depth along the camera's forward axis (farthest first)
    if (camera) {
      camera.getWorldPosition(_camPos);
      camera.getWorldDirection(_camFwd);
    }
    const wx = uWind.value.x, wz = uWind.value.z;
    for (let q = 0; q < n; q++) {
      const i = live[q];
      const ob = i * STRIDE;
      volumePositionAt(rec, ob, wx, wz, now - rec[ob + 3], _pos);
      depth[i] = (_pos[0] - _camPos.x) * _camFwd.x + (_pos[1] - _camPos.y) * _camFwd.y + (_pos[2] - _camPos.z) * _camFwd.z;
    }
    // insertion sort, descending depth (stable: equal depths keep their order)
    for (let q = 1; q < n; q++) {
      const i = live[q];
      const di = depth[i];
      let r = q - 1;
      while (r >= 0 && depth[live[r]] < di) { live[r + 1] = live[r]; r--; }
      live[r + 1] = i;
    }
    for (let q = 0; q < n; q++) order[q] = live[q];
    orderCount = n;
    // the sorted copy into the instance arrays, one contiguous range per attribute
    for (let q = 0; q < n; q++) {
      const ob = live[q] * STRIDE;
      const og = q * 4;
      for (let a = 0; a < 8; a++) {
        const g = gpu[a];
        const s = ob + a * 4;
        g[og] = rec[s]; g[og + 1] = rec[s + 1]; g[og + 2] = rec[s + 2]; g[og + 3] = rec[s + 3];
      }
    }
    for (let a = 0; a < 8; a++) {
      const attr = attrs[a];
      attr.clearUpdateRanges();
      if (n > 0) attr.addUpdateRange(0, n * 4);
      attr.needsUpdate = true;
    }
    geo.instanceCount = n;
    mesh.visible = n > 0;
    drawn = n;
  }

  function shiftTime(delta: number): void {
    for (let i = 0; i < capacity; i++) {
      const ob = i * STRIDE;
      if (rec[ob + 7] > 0) rec[ob + 3] += delta;
    }
    if (Number.isFinite(liveUntil)) liveUntil += delta;
    for (const g of glowP) if (g.w > -1e8) g.w += delta;
  }

  function reset(): void {
    for (let i = 0; i < capacity; i++) rec[i * STRIDE + 7] = 0;
    cursor = 0;
    orderCount = 0;
    liveUntil = -Infinity;
    geo.instanceCount = 0;
    mesh.visible = false;
    drawn = 0; liveCount = 0;
    for (let i = 0; i < GLOW_SLOTS; i++) { glowP[i].set(0, 0, 0, -1e9); glowK[i].set(1, 0, 0, 0); }
    glowNext = 0;
  }

  function glow(x: number, y: number, z: number, radiusM: number, peak: number, durS: number, birthOffset = 0): void {
    if (!(radiusM > 0) || !(peak > 0) || !(durS > 0)) return;
    const i = glowNext;
    glowNext = (glowNext + 1) % GLOW_SLOTS;
    glowP[i].set(x, y, z, o_now() + birthOffset);
    glowK[i].set(radiusM, peak, durS, 0);
  }

  return {
    group,
    warm,
    get ready() { return ready; },
    emit,
    update,
    shiftTime,
    reset,
    glow,
    isActive: () => o_now() <= liveUntil,
    stats: () => ({ live: liveCount, capacity, drawn, wind: [uWind.value.x, uWind.value.z], ready }),
    wind: uWind.value,
  };
}
