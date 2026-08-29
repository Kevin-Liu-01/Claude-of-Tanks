/**
 * particles.ts — fx-internal instanced GPU particle engine.
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
import { LATE_FX_LAYER } from './layers.ts';

type Rng = () => number;
type Noise2D = (x: number, y: number) => number;
type FlipbookStyle = 'smoke' | 'dust' | 'fire' | 'prop';
type Vec3Tuple = readonly [number, number, number];
type ParticlePoolName = 'smoke' | 'fire' | 'billow' | 'psmoke' | 'dust'
  | 'flash' | 'jet' | 'sparks' | 'debris';

interface ParticleEngineContext {
  readonly scene?: {
    readonly userData?: {
      readonly sunDirWorld?: THREE.Vector3;
    };
  };
}

interface PuffOptions {
  readonly pos: Vec3Tuple;
  readonly vel: Vec3Tuple;
  readonly life: number;
  readonly size0: number;
  readonly size1: number;
  readonly col0: Vec3Tuple;
  readonly col1: Vec3Tuple;
  readonly alpha: number;
  readonly birthOffset?: number;
  readonly rot?: number;
  readonly rotVel?: number;
  readonly grav?: number;
}

interface StreakOptions {
  readonly pos: Vec3Tuple;
  readonly vel: Vec3Tuple;
  readonly life: number;
  readonly width: number;
  readonly stretch: number;
  readonly col: Vec3Tuple;
  readonly alpha: number;
  readonly birthOffset?: number;
  readonly grav?: number;
  readonly seed?: number;
}

interface DebrisOptions {
  readonly pos: Vec3Tuple;
  readonly vel: Vec3Tuple;
  readonly life: number;
  readonly axis: Vec3Tuple;
  readonly spin: number;
  readonly scale: number;
  readonly groundY: number;
  readonly birthOffset?: number;
  readonly hot?: boolean | number;
  readonly seed?: number;
}

interface JetOptions {
  readonly pos: Vec3Tuple;
  readonly axis: Vec3Tuple;
  readonly life: number;
  readonly width: number;
  readonly len0: number;
  readonly len1: number;
  readonly col: Vec3Tuple;
  readonly alpha: number;
  readonly birthOffset?: number;
  readonly seed?: number;
}

interface ParticleOptionsByPool {
  smoke: PuffOptions;
  fire: PuffOptions;
  billow: PuffOptions;
  psmoke: PuffOptions;
  dust: PuffOptions;
  flash: PuffOptions;
  jet: JetOptions;
  sparks: StreakOptions;
  debris: DebrisOptions;
}

interface CapacityGeometry extends THREE.InstancedBufferGeometry {
  _capacity: number;
}

// Transparent combat FX render after the opaque/world post passes so their
// shaders can sample resolved scene depth without a framebuffer feedback loop.
// Layer 30 is reserved for this late pass by engine/post.ts.
export { LATE_FX_LAYER };

/** Canonical PRNG (ARCHITECTURE §1.4). @param {number} a seed @returns {() => number} */
export function mulberry32(a: number): Rng {return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const POOL_SIZES = { smoke: 2048, fire: 1024, billow: 256, psmoke: 384, dust: 1024, sparks: 512, debris: 256, flash: 128, jet: 64 };
const PARTICLE_TEXTURE_ASSETS = Object.freeze({
  smoke: '/fx/particles-smoke.png',
  fire: '/fx/particles-fire.png',
  prop: '/fx/particles-prop.png',
  dust: '/fx/particles-dust.png',
  flash: '/fx/particles-flash.png',
  jet: '/fx/particles-jet.png',
});

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
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  varying float vFogDepth;
#endif
`;
// Additive passes fade OUT with fog (never toward fog color).
const FOG_SCALE_F = `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( -fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
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

// Near-camera fade (r7 "scope flood"/"screen-filling wash"): a card within a
// few meters of the lens subtends most of the frame and — additively stacked —
// floods it white (peek-fire over cover in sniper, impact sprays at 3-8 m).
// Fade alpha out as the CARD CENTER approaches the camera; uNearFade =
// (fullyGoneM, fullOnM) per pool. The scene-depth half lives below.
const NEARFADE_GLSL = `
uniform vec2 uNearFade;
float nearFade( vec3 wpos ) {
  return smoothstep( uNearFade.x, uNearFade.y, distance( wpos, cameraPosition ) );
}
`;

// Depth-aware soft-particle intersection. post.ts first renders the world,
// resolves its DepthTexture, then draws the late-FX layer into a target whose
// hardware depth attachment is a copy. The shader samples the resolved SOURCE
// (never its attached destination) for exact terrain/vehicle occlusion and a
// short contact fade instead of a hard slice at ridges, hulls and the ground.
const SOFT_DEPTH_GLSL = `
uniform sampler2D uSceneDepth;
uniform vec2 uSoftViewport;
uniform float uCameraNear;
uniform float uCameraFar;
varying float vParticleDepth;
float perspectiveDepthToViewZSoft( float depth, float nearV, float farV ) {
  return ( nearV * farV ) / ( ( farV - nearV ) * depth - farV );
}
float softDepthFade() {
  vec2 suv = gl_FragCoord.xy / max( uSoftViewport, vec2( 1.0 ) );
  float rawDepth = texture2D( uSceneDepth, suv ).x;
  float sceneDepthM = -perspectiveDepthToViewZSoft( rawDepth, uCameraNear, uCameraFar );
  float gapM = sceneDepthM - vParticleDepth;
  float featherM = clamp( vParticleDepth * 0.005, 0.65, 3.5 );
  return smoothstep( 0.0, featherM, gapM );
}
`;

// Per-card HDR soft-knee (r7 "diagonal additive wash"): each additive card
// used to push 2-3.5 into the HDR buffer, so 4-6 overlapping cards stacked to
// 10+ and ACES clipped the whole footprint to a featureless white sheet.
// Reinhard-knee each card's contribution so a single card tops out ~2.4 and
// a deep stack grows sub-linearly — cores still cross the 1.55 bloom
// threshold, but the stack keeps its color gradient instead of washing out.
const TONECAP_GLSL = `
vec3 toneCap( vec3 c ) {
  float m = max( c.r, max( c.g, c.b ) );
  return c / ( 1.0 + 0.30 * m );
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
uniform float uTiles;
uniform vec3 uSunDirW;
varying vec2 vUv;
varying vec2 vUvA;
varying vec2 vUvB;
varying float vFMix;
varying vec4 vColor;
varying float vT;
varying vec2 vShade;
varying float vParticleDepth;
${FOG_PARS_V}
${DISPLACE_GLSL}
${NEARFADE_GLSL}
void main() {
  float life = aVL.w;
  float age = uTime - aPB.w;
  if ( life <= 0.0 || age < 0.0 || age > life ) {
    vUv = uv; vUvA = uv; vUvB = uv; vFMix = 0.0;
    vColor = vec4( 0.0 ); vT = 0.0; vShade = vec2( 0.0 );
    vParticleDepth = 1e9;
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
  // flipbook: cycle the uTiles x uTiles atlas over the particle life, with
  // cross-fade between adjacent frames — media rolls/combusts instead of a
  // static sprite scaling up (uTiles = 1 degrades to a plain single sample)
  float frames = uTiles * uTiles;
  float ff = t * ( frames - 1.0 );
  float f0 = floor( ff );
  float f1 = min( f0 + 1.0, frames - 1.0 );
  vFMix = ff - f0;
  vUvA = ( vec2( mod( f0, uTiles ), floor( f0 / uTiles ) ) + uv ) / uTiles;
  vUvB = ( vec2( mod( f1, uTiles ), floor( f1 / uTiles ) ) + uv ) / uTiles;
  // tier-1 soft handling: alpha-in at birth, long fade-out (+ lens fade)
  float alpha = aC1.w * smoothstep( 0.0, 0.12, t ) * ( 1.0 - smoothstep( 0.5, 1.0, t ) )
    * nearFade( wpos );
  vColor = vec4( mix( aC0.rgb, aC1.rgb, smoothstep( 0.0, 1.0, t ) ), alpha );
  vUv = uv;
  vec4 mvPosition = viewMatrix * vec4( wpos, 1.0 );
  vParticleDepth = -mvPosition.z;
  ${FOG_V}
  gl_Position = projectionMatrix * mvPosition;
}
`;

const PUFF_FRAG_NORMAL = `
uniform sampler2D uMap;
varying vec2 vUv;
varying vec2 vUvA;
varying vec2 vUvB;
varying float vFMix;
varying vec4 vColor;
varying float vT;
varying vec2 vShade;
${FOG_PARS_F}
${SOFT_DEPTH_GLSL}
void main() {
  float tex = mix( texture2D( uMap, vUvA ).a, texture2D( uMap, vUvB ).a, vFMix );
  // edges thin out with age so old puffs wisp away instead of popping
  float a = pow( tex, 1.0 + vT * 1.2 ) * vColor.a * softDepthFade();
  if ( a < 0.004 ) discard;
  // fake directional lighting: sun-facing side of the billboard brightens,
  // opposite side falls into shadow — smoke reads volumetric, not flat.
  // Density-weighted: thick texels shade deeper, thin rim texels catch a
  // sun-side rim light so even near-black columns keep internal structure.
  vec2 p = vUv * 2.0 - 1.0;
  float sun = clamp( 0.5 + 0.8 * dot( p, vShade ), 0.0, 1.0 );
  float light = 0.52 + 0.72 * sun + 0.35 * sun * ( 1.0 - tex );
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
varying vec2 vUvA;
varying vec2 vUvB;
varying float vFMix;
varying vec4 vColor;
varying float vT;
varying vec2 vShade;
${FOG_PARS_F}
${TONECAP_GLSL}
${SOFT_DEPTH_GLSL}
void main() {
  float tex = mix( texture2D( uMap, vUvA ).a, texture2D( uMap, vUvB ).a, vFMix );
  // erosion-style dissolve: the alpha threshold rises with age so the noisy
  // texture breaks apart from its thin texels inward — edges churn and burn
  // away instead of the whole card fading uniformly. Band widened 0.24 ->
  // 0.42 (r6): the narrow band binarized the noise into hard-edged speckle
  // by mid-life — coarse GIF-dither confetti over the trees instead of
  // half-transparent churn.
  // r5 anti-stipple: the erosion band now WIDENS with age (0.40 -> 0.92).
  // The fixed 0.42 band binarized the flipbook's high-frequency octaves by
  // mid-life — at 100% zoom the fireball boundary resolved to discrete
  // alpha-dither speckle instead of soft billowing lobes. A widening band
  // keeps the front torn early yet dissolves late edges as translucent
  // gradients, so lobes billow away instead of pixel-popping.
  // r2 anti-static: the per-pixel gl_FragCoord hash jitter is GONE. It was
  // screen-pinned white noise on the erosion threshold — under a moving
  // texture every near-threshold texel flickered per pixel, and with no TAA
  // the whole eroding footprint sizzled as TV static (the r2 critical
  // "hash-dither alpha" kill read). The widening smoothstep band alone keeps
  // the dissolve soft; the flipbook supplies all the ragged structure.
  // lighting_post r3 (round 3): base band 0.40 -> 0.60 (~1.5x) — fire edges
  // still stippled at 2x crops; wider gate dissolves them as gradients.
  // r5 anti-stipple: erosion runs through an ultra-wide band (0.72 -> 1.2)
  // so the flipbook's high-frequency octaves resolve as translucent
  // gradients, never binarized speckle (r4 "dither-speckled additive cards
  // chewing every edge, hundreds of dark stipple dots").
  float er = vT * 0.30;
  float a = smoothstep( er, er + 0.72 + 0.48 * vT, tex ) * vColor.a * softDepthFade();
  if ( a < 0.004 ) discard;
  ${FOG_SCALE_F}
  // blackbody interior: texels well above the erosion front read white-hot,
  // the dissolving rim cools through orange to deep red as vT -> 1
  float heat = clamp( ( tex - er ) * 2.6, 0.0, 1.0 );
  float hot = 0.45 + heat * heat * ( 2.2 - vT * 1.6 );
  vec3 col = vColor.rgb * hot * ( 1.0 - vT * vT * 0.45 );
  // rim tint — r5: the hard 0.0-0.55 gate stamped a saturated RED BAND onto
  // the rim (r4 "hard red banding"). The ramp now walks white -> yellow ->
  // orange -> sooty umber across a wide gate so no single hue bands.
  col = mix( vec3( 0.86, 0.34, 0.10 ) * ( 0.4 + 0.6 * vColor.r ), col, smoothstep( 0.0, 0.80, heat ) );
  // r5 combustion chemistry: saturation must fall BEFORE value. The old ramp
  // held saturated deep red through the whole back half of a fire card's
  // life, so 1.5-2.9 s post-blast the dying flare rendered as a floating
  // maroon/dried-blood fog puff mid-column. Real fire desaturates to sooty
  // grey-orange fast once it stops burning — pull the late-life color toward
  // its own luma (grey) and dim it, so flame hands off to the smoke pool's
  // grey-black instead of holding red.
  // r2: soot onset 0.42 -> 0.30 — the fire pool must go dark-first so the
  // paint-to-char beat never passes through a bright desaturated stage.
  float soot = smoothstep( 0.30, 0.85, vT );
  float luma = dot( col, vec3( 0.299, 0.587, 0.114 ) );
  col = mix( col, vec3( luma * 0.5 ), soot );
  a *= 1.0 - soot * 0.45;
  // HDR push so UnrealBloom catches fire/flash pixels — per-card soft knee
  // keeps a deep additive stack from clipping to a white sheet
  gl_FragColor = vec4( toneCap( col * uIntensity ) * ( 1.0 - fogFactor ), a );
}
`;

// --- billow (fireball body: depth-sorted normal-blended fire-in-smoke) ------
// r1 fireball structure rebuild: the additive fire pool alone stacked into a
// translucent orange haze wall with the background showing through the
// "core". Billow cards are NORMAL-blended (they OCCLUDE what is behind them)
// with an erosion-dissolve mask and a blackbody ramp — white-hot pockets
// inside rolling sooty lobes — so the fireball mass owns a silhouette. The
// smoke pool draws before, the additive fire/flash pools glow on top.
const PUFF_FRAG_BILLOW = `
uniform sampler2D uMap;
uniform float uIntensity;
varying vec2 vUv;
varying vec2 vUvA;
varying vec2 vUvB;
varying float vFMix;
varying vec4 vColor;
varying float vT;
varying vec2 vShade;
${FOG_PARS_F}
${SOFT_DEPTH_GLSL}
void main() {
  float tex = mix( texture2D( uMap, vUvA ).a, texture2D( uMap, vUvB ).a, vFMix );
  // r2 anti-static: screen-space hash jitter removed (see PUFF_FRAG_ADDITIVE
  // note) — the jitter binarized the erosion front into per-pixel sizzle over
  // the wreck and the ground for the fireball's whole life. Band widened a
  // touch to keep the front torn without it.
  // r5 anti-stipple: band 0.34 -> 0.46 base — the billow rim was the other
  // stipple source at 2x crops (r4 "screen-door dither chewing every edge");
  // 0.52 over-thinned the whole fireball body, 0.46 keeps the mass.
  float er = vT * 0.30;
  float a = smoothstep( er, er + 0.46 + 0.45 * vT, tex ) * vColor.a * softDepthFade();
  if ( a < 0.004 ) discard;
  // blackbody interior: dense texels above the erosion front burn white-hot,
  // cooling through orange -> deep ember red -> soot as the card ages and
  // its rim dissolves. vColor supplies the SOOT base (col0 -> col1 over life)
  // so the burnt-out card hands off seamlessly to the smoke pool's greys.
  // r1 tune: white reserved for the very densest texels (the first pass sent
  // most of the crown into the white band — cotton-ball read); the body of
  // the lobe lives in ember-red/orange with sooty shoulders.
  float heat = clamp( ( tex - er ) * ( 2.0 - 0.9 * vT ), 0.0, 1.0 );
  // r2 dark-first dissolve: h2 collapses harder with age and the white band
  // shrank to the very densest texels — the old ramp held a bright
  // desaturated "noisy white plaster" stage over the hull for ~2 s (r2
  // major). paint -> ember orange -> charcoal, never through ash white.
  // r5: ramp stops widened + the deep-red band lifted toward burnt orange —
  // the tight 0.30-0.72 orange gate left a hard red ring where it met the
  // 0.06-0.32 band (r4 "hard red banding at the rim"). The overlapping
  // gates now walk soot -> ember -> orange -> near-white as one gradient.
  float h2 = heat * ( 1.0 - vT * 0.95 );
  vec3 col = mix( vColor.rgb, vec3( 0.46, 0.10, 0.03 ), smoothstep( 0.04, 0.40, h2 ) );
  col = mix( col, vec3( 1.0, 0.44, 0.07 ), smoothstep( 0.25, 0.85, h2 ) );
  col = mix( col, vec3( 1.28, 1.08, 0.80 ), smoothstep( 0.80, 0.99, h2 ) );
  // combustion chemistry: saturation falls BEFORE value — past mid-life the
  // card desaturates to sooty grey and dims, handing off to the smoke pool
  // (without this the aged billow mass froze as a translucent MAROON wall
  // over the trees at 1.6 s — the exact r5 dried-blood-fog regression)
  // r2: onset 0.35 -> 0.26 (dark-first, see h2 note)
  float sootF = smoothstep( 0.26, 0.72, vT );
  float luma = dot( col, vec3( 0.299, 0.587, 0.114 ) );
  col = mix( col, vec3( luma ), sootF * 0.9 );
  col *= 1.0 - 0.3 * sootF;
  // sooty outer shell catches sun-side shading so the crown reads volumetric;
  // burning pockets stay self-lit
  vec2 p = vUv * 2.0 - 1.0;
  float sun = clamp( 0.5 + 0.8 * dot( p, vShade ), 0.0, 1.0 );
  col *= mix( 0.58 + 0.62 * sun, 1.0, smoothstep( 0.12, 0.5, h2 ) );
  ${FOG_SCALE_F}
  #ifdef USE_FOG
    col = mix( col, fogColor, fogFactor );
  #endif
  gl_FragColor = vec4( col * uIntensity, a );
}
`;

// --- propellant smoke (muzzle discharge mass: normal-blended, EROSION-masked)
// r6 (critic major: "propellant smoke has no internal texture — 3-5 detached
// soft gaussian puffs / airbrushed beige gradient"): the plain smoke pool's
// pow(tex, ...) falloff is soft by design (columns, wakes), so 1-2 m muzzle
// cards resolve as untextured gaussians at 100% zoom. This variant runs the
// SAME widening erosion-band dissolve the fireball billow uses — the flipbook
// octaves gate alpha, so every card carries torn billow structure and the
// cloud reads as one turbulent connected mass — but with NO blackbody ramp:
// cold grey powder smoke, sun-shaded like the normal pool.
const PUFF_FRAG_PROP = `
uniform sampler2D uMap;
varying vec2 vUv;
varying vec2 vUvA;
varying vec2 vUvB;
varying float vFMix;
varying vec4 vColor;
varying float vT;
varying vec2 vShade;
${FOG_PARS_F}
${SOFT_DEPTH_GLSL}
void main() {
  float tex = mix( texture2D( uMap, vUvA ).a, texture2D( uMap, vUvB ).a, vFMix );
  // erosion dissolve: threshold rises with age, band widens so late edges go
  // translucent instead of binarizing (see PUFF_FRAG_ADDITIVE anti-stipple)
  float er = vT * 0.36;
  float a = smoothstep( er, er + 0.44 + 0.50 * vT, tex ) * vColor.a * softDepthFade();
  if ( a < 0.004 ) discard;
  // density-weighted sun shading (same model as the normal smoke pool,
  // response toned down — the propellant mass must stay a grey-brown cloud,
  // never a bright cream fog bank)
  vec2 p = vUv * 2.0 - 1.0;
  float sun = clamp( 0.5 + 0.8 * dot( p, vShade ), 0.0, 1.0 );
  float light = 0.46 + 0.60 * sun + 0.28 * sun * ( 1.0 - tex );
  vec3 col = vColor.rgb * light;
  ${FOG_SCALE_F}
  #ifdef USE_FOG
    col = mix( col, fogColor, fogFactor );
  #endif
  gl_FragColor = vec4( col, a );
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
${NEARFADE_GLSL}
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
  float alpha = aC.w * ( 1.0 - smoothstep( 0.55, 1.0, t ) ) * nearFade( wpos );
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
${TONECAP_GLSL}
void main() {
  float dy = abs( vUv.y * 2.0 - 1.0 );
  float dx = abs( vUv.x * 2.0 - 1.0 );
  float profile = ( 1.0 - dy * dy ) * ( 1.0 - dx * dx * dx );
  float core = smoothstep( 0.55, 0.0, dy );
  // r5 (critic: "dead-straight hairline streaks that read as vector lines"):
  // a soft bright GLOW HEAD at the leading end + a tail that thins to
  // nothing makes each streak read as a falling ember with a motion smear,
  // not a uniform-width rod.
  float head = smoothstep( 0.30, 0.92, vUv.x );
  float a = profile * vColor.a * ( 0.38 + 0.62 * head );
  if ( a < 0.004 ) discard;
  ${FOG_SCALE_F}
  // incandescent cooling ramp: white-hot core -> orange -> deep red over life
  vec3 base = mix( vColor.rgb, vec3( 1.0, 0.30, 0.04 ), clamp( vT * 1.5, 0.0, 0.92 ) );
  vec3 col = toneCap( ( base * ( 0.55 + 0.45 * head )
    + vec3( core ) * ( 0.35 + 0.55 * head ) * ( 1.0 - vT * 0.85 ) ) * uIntensity );
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
${NEARFADE_GLSL}
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
  float alpha = aC.w * pow( 1.0 - t, 1.3 ) * nearFade( wpos );
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
${TONECAP_GLSL}
void main() {
  // seeded UV jitter so no two jets sample the identical noise
  vec2 uv = vec2( vUv.x * ( 0.82 + 0.18 * fract( vSeed * 7.31 ) ),
                  clamp( vUv.y + ( fract( vSeed * 13.7 ) - 0.5 ) * 0.16, 0.0, 1.0 ) );
  float tex = texture2D( uMap, uv ).a;
  // r1 detached-bolt fix: erosion is biased DOWNRANGE (vUv.x) so a dying jet
  // burns off from the tip back toward the bore — the surviving bright mass
  // stays welded to the muzzle instead of freezing as a detached mid-cone
  // blob 1.5-2 m downrange while the bore is already dark.
  // r2 anti-static: screen-space hash jitter removed (see PUFF_FRAG_ADDITIVE)
  float er = 0.06 + vT * ( 0.45 + 0.75 * vUv.x );
  // 0.28 -> 0.46 band (r5): jet tips dissolved into hard noise speckle at
  // the flash frame edges — wider band keeps the cone ragged but soft
  float a = smoothstep( er, er + 0.46, tex ) * vColor.a;
  if ( a < 0.004 ) discard;
  ${FOG_SCALE_F}
  // incandescent core near the muzzle end, cooling toward the ragged tip
  float heat = clamp( ( tex - er ) * 2.4, 0.0, 1.0 );
  float hot = 0.6 + heat * heat * ( 1.0 - vUv.x * 0.55 ) * 2.2;
  vec3 col = vColor.rgb * hot * ( 1.0 - vT * 0.35 );
  col = mix( vec3( 1.0, 0.30, 0.05 ) * ( 0.5 + 0.5 * vColor.r ), col, smoothstep( 0.0, 0.5, heat ) );
  gl_FragColor = vec4( toneCap( col * uIntensity ) * ( 1.0 - fogFactor ), a );
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
varying vec3 vWorldPos;
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
    vLocal = vec3( 0.0 ); vSeed = 0.0; vWorldPos = vec3( 0.0 );
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
  // per-instance irregular chunk: seeded nonuniform scale + mild shear so no
  // two fragments read alike. Minimum thickness kept high — a chunk squashed
  // below ~0.6 of its width reads as a flat paper cutout in flight.
  float h1 = fract( aSG.w * 37.719 );
  float h2 = fract( aSG.w * 61.113 );
  float h3 = fract( aSG.w * 91.537 );
  // wider anisotropy than r6 (plates vs lumps) + stronger shear: with the
  // torn-plate composite base this yields shard/scrap silhouettes, never the
  // r7 "flat orange boxes"
  vec3 lp = position * vec3( 0.62 + h1 * 0.85, 0.42 + h2 * 0.95, 0.62 + h3 * 0.85 );
  lp.x += lp.y * ( h2 - 0.5 ) * 0.7;
  lp.z += lp.y * ( h1 - 0.5 ) * 0.55;
  vec3 off = rot * ( lp * aSG.x * fade );
  // r5 motion cue: velocity-aligned stretch on fast airborne chunks — a
  // tumbling slab frozen against the sky read as a static 2D card; smearing
  // the silhouette along the flight path reads as speed in every still.
  vec3 vcur = aVL.xyz * exp( -0.12 * age ) + vec3( 0.0, -21.6 * age, 0.0 );
  float spd = length( vcur );
  if ( spd > 1.0 && grounded < 0.5 ) {
    vec3 vdir = vcur / spd;
    off += vdir * dot( off, vdir ) * clamp( spd * 0.045, 0.0, 0.85 );
  }
  vec3 wpos = center + off;
  vNormalW = rot * normal;
  vLocal = lp;
  vSeed = aSG.w;
  vWorldPos = wpos;
  // charred-metal albedo — r5 (critic: "pale salmon-PINK flat chips"): the
  // 0.185/0.140/0.105 warm-brown top of the range, lit by the warm sun +
  // blast light, tone-mapped to salmon confetti on the grass. The range now
  // tops out at dark gunmetal-brown so lit chunks stay wreckage-dark; the
  // ember pockets supply all the orange.
  vTint = mix( vec3( 0.055, 0.052, 0.048 ), vec3( 0.115, 0.092, 0.070 ), h3 );
  // ember glow: airborne wreckage leaves the fireball HOT — near-full glow
  // through the first ~0.5 s (the r5 "flat matte-black slabs against sky"
  // window), then cools fast so grounded chunks never read orange popcorn.
  // r2: hold full glow 0.55 s and cool over ~1 s more (was gone by ~0.75 s)
  // so airborne wreckage visibly cools ember-orange -> dark in flight.
  // r6 (critic: "embers read as confetti ... static orange flecks pasted
  // flat on the grass, holding constant brightness"): per-chunk FLICKER
  // (seeded rate/phase — frozen frames catch a spread of phases, live
  // frames breathe) + a hard glow cut once grounded so landed chips read
  // as dying embers, never painted-on orange dots.
  float flick = 0.70 + 0.30 * sin( uTime * ( 12.0 + h1 * 11.0 ) + aSG.w * 61.0 );
  vHot = aSG.z * exp( -max( age - 0.55, 0.0 ) * ( 2.6 + grounded * 2.4 ) )
    * ( 0.40 + h2 * 0.60 ) * flick * mix( 1.0, 0.45, grounded );
  vFade = fade;
  vec4 mvPosition = viewMatrix * vec4( wpos, 1.0 );
  ${FOG_V}
  gl_Position = projectionMatrix * mvPosition;
}
`;

const DEBRIS_FRAG = `
uniform vec3 uSunDir;
// NOTE (hud_ui r5 build fix): no cameraPosition redeclaration here — three's
// ShaderMaterial prefixes 'uniform vec3 cameraPosition;' into FRAGMENT
// shaders too, so an explicit declaration is a GLSL redefinition error.
varying vec3 vNormalW;
varying vec3 vTint;
varying float vHot;
varying float vFade;
varying vec3 vLocal;
varying float vSeed;
varying vec3 vWorldPos;
${FOG_PARS_F}
void main() {
  if ( vFade <= 0.001 ) discard;
  vec3 n = normalize( vNormalW );
  float nl = max( dot( n, uSunDir ), 0.0 );
  // r5: hemisphere ambient raised + a view-dependent sky rim so a chunk
  // tumbling against the bright sky reads as a LIT 3D object with a cool
  // rim-lit edge, never an unlit matte-black 2D card.
  // r2: ambient floor + rim raised again — the r1 values still froze the
  // shard cloud as flat black polygon confetti against the fireball
  // (kill0 crop major). A wreck chunk in daylight reads mid-grey scorched
  // steel with a clear sky rim, never a light-swallowing cutout.
  float hemi = 0.46 + 0.38 * ( n.y * 0.5 + 0.5 );
  vec3 col = vTint * ( hemi + nl * 1.35 ) + vec3( 0.028, 0.026, 0.024 ) * hemi;
  vec3 viewDir = normalize( cameraPosition - vWorldPos );
  float rim = pow( 1.0 - abs( dot( n, viewDir ) ), 2.0 );
  // r5 (critic: "pale salmon-PINK flat chips scatter around the kill"): the
  // cool blue-grey rim ADDED onto the warm ember glow + blast light mixed to
  // salmon on any chip catching both. Rim is now a dim neutral grey and it
  // FADES OUT while the chunk is ember-hot, so hot chips stay gunmetal with
  // orange pockets and cold chips keep only a whisper of sky rim.
  col += vec3( 0.30, 0.32, 0.35 ) * rim * ( 0.10 + 0.16 * ( n.y * 0.5 + 0.5 ) )
    * ( 1.0 - clamp( vHot * 2.0, 0.0, 0.85 ) );
  // cooling ember glow (bloom feed): NOT a flat face tint — SMOOTH seeded
  // noise blotches so irregular PATCHES of the scorched chunk glow orange
  // while the rest stays charred black. r1: the old floor()-cell hash read as
  // a hard checkerboard-dither texture on chunks near the camera — value
  // noise (hashed lattice corners, smoothstep-interpolated) keeps the pockets
  // irregular but CONTINUOUS.
  // r5: sun-side ember floor 0.40 -> 0.28 + tighter pocket gate below — a
  // fully-lit landed chip used to glow across its whole top face, reading
  // as a pastel salmon petal on the grass instead of a cooling ember core.
  float edge = 0.28 + 0.72 * ( 1.0 - nl );
  vec3 lp3 = vLocal * 3.6 + vSeed * 29.0;
  vec3 c0 = floor( lp3 );
  vec3 f3 = lp3 - c0;
  f3 = f3 * f3 * ( 3.0 - 2.0 * f3 );
  #define DHASH(o) fract( sin( dot( c0 + o, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 )
  float n00 = mix( DHASH(vec3(0.,0.,0.)), DHASH(vec3(1.,0.,0.)), f3.x );
  float n10 = mix( DHASH(vec3(0.,1.,0.)), DHASH(vec3(1.,1.,0.)), f3.x );
  float n01 = mix( DHASH(vec3(0.,0.,1.)), DHASH(vec3(1.,0.,1.)), f3.x );
  float n11 = mix( DHASH(vec3(0.,1.,1.)), DHASH(vec3(1.,1.,1.)), f3.x );
  float pat = smoothstep( 0.60, 0.92, mix( mix( n00, n10, f3.y ), mix( n01, n11, f3.y ), f3.z ) );
  col += vec3( 1.35, 0.30, 0.04 ) * vHot * edge * ( 0.05 + 0.95 * pat );
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
function makeValueNoise(rng: Rng, grid: number): Noise2D {
  const g = new Float32Array(grid * grid);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  return (x: number, y: number): number => {
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
 * fbm turbulence built on seeded value noise, output ~[0,1].
 * (Exported for effects.ts procedural canvas textures.)
 * @param {() => number} rng
 * @param {number} [octaves=4] 4 or 5 — the 5th (grid 64) adds the fine churn
 *   detail the fire flipbook needs so its erosion front never resolves into
 *   coarse GIF-dither stipple at 5-7 m card sizes (r6 explosion critique)
 * @returns {(x: number, y: number) => number}
 */
export function makeFbm(rng: Rng, octaves = 4): Noise2D {
  const o1 = makeValueNoise(rng, 4);
  const o2 = makeValueNoise(rng, 8);
  const o3 = makeValueNoise(rng, 16);
  const o4 = makeValueNoise(rng, 32);
  const o5 = octaves >= 5 ? makeValueNoise(rng, 64) : null;
  if (o5) {
    return (x: number, y: number): number =>
      (o1(x, y) * 0.5 + o2(x, y) * 0.25 + o3(x, y) * 0.125 + o4(x, y) * 0.0625 +
        o5(x, y) * 0.03125) / 0.96875;
  }
  return (x: number, y: number): number =>
    (o1(x, y) * 0.5 + o2(x, y) * 0.25 + o3(x, y) * 0.125 + o4(x, y) * 0.0625) / 0.9375;
}

/**
 * Multiply a canvas's alpha channel by seeded fbm turbulence — breaks the
 * "smooth untextured blob" read on every particle that samples it.
 * @param {HTMLCanvasElement} cv @param {() => number} rng
 * @param {number} strength 0..1 how deep the turbulence cuts
 * @param {number} [alphaPower=1] optional base-alpha shaping fused into the
 *   same readback so callers never need a second getImageData/putImageData pass
 */
function applyFbmAlpha(
  cv: HTMLCanvasElement,
  rng: Rng,
  strength: number,
  alphaPower = 1,
): void {
  const fbm = makeFbm(rng);
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  const w = cv.width, h = cv.height;
  let alphaLut = null;
  if (alphaPower !== 1) {
    alphaLut = new Uint8Array(256);
    for (let a = 0; a < 256; a++) {
      alphaLut[a] = Math.round(255 * Math.pow(a / 255, alphaPower));
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm(x / w, y / h);
      const m = 1 - strength + strength * Math.min(1, n * 1.7);
      const i = (y * w + x) * 4 + 3;
      const shaped = alphaLut ? alphaLut[d[i]] : d[i];
      d[i] = Math.min(255, shaped * m);
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Procedural 4x4 flipbook atlas of noise-eroded billow frames (generated on
 * a canvas at boot). Frame k rotates + advects the fbm domain and raises the
 * erosion floor, so cycling the tiles over a particle's life reads as
 * rolling, combusting media instead of a static sprite scaling up.
 * Alpha-only payload (RGB white); tiles ordered row-major, frame 0 top-left.
 * @param {() => number} rng
 * @param {'smoke'|'dust'|'fire'|'prop'} style contrast/churn profile
 * @returns {Generator<void, THREE.CanvasTexture, void>}
 */
function* makeFlipbookTextureSteps(
  rng: Rng,
  style: FlipbookStyle,
): Generator<void, THREE.CanvasTexture, void> {
  // fire tiles at 176 px with 5-octave churn (was 128/4-oct for all styles):
  // a destruction fireball card reaches 5-7 m, and the coarse noise scaled to
  // ~25 cm/texel is what read as GIF-dither stipple once the erosion front
  // ate into it (r6). smoke/dust keep 128 — they never erode as hard.
  const fire = style === 'fire';
  // r6 'prop' style: the muzzle propellant mass — mid-res tiles with HIGH
  // per-texel churn contrast so the erosion-band shader (PUFF_FRAG_PROP) has
  // real internal structure to gate; the cloud reads as torn billows, never
  // an airbrushed gradient.
  const prop = style === 'prop';
  // lighting_post r3 (round 3): fire 176 → 256 — tiles still resolved as
  // stipple in 2x crops of 5-7 m cards (one-time bake cost ~+40 ms).
  const TILES = 4, T = fire ? 256 : (prop ? 192 : 128), S = TILES * T;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d')!;
  const warp = makeFbm(rng, (fire || prop) ? 5 : 4);
  const churn = makeFbm(rng, (fire || prop) ? 5 : 4);
  const img = ctx.createImageData(S, S);
  const d = img.data;
  // r5 anti-stipple: fire churn contrast 0.26/1.10 -> 0.44/0.72 and smoke
  // 0.48/0.78 -> 0.52/0.62 — the old per-texel contrast is what the erosion
  // front binarized into GIF-dither confetti on 5-7 m cards at 100% zoom.
  // Billow structure now comes from the low octaves; the fine octaves only
  // modulate, never gate.
  // r5: fire per-texel contrast cut again (0.44/0.72 -> 0.55/0.55) — the
  // erosion smoothstep still binarized the top octave into stipple on 5-7 m
  // destruction cards (r4 "hundreds of dark stipple dots").
  // prop: high per-texel contrast IS the point — PUFF_FRAG_PROP's wide
  // erosion band dissolves it as translucent billow gradients, never speckle.
  const churnLo = fire ? 0.55 : (prop ? 0.36 : (style === 'dust' ? 0.58 : 0.52));
  const churnHi = fire ? 0.55 : (prop ? 0.88 : (style === 'dust' ? 0.62 : 0.62));
  const gamma = fire ? 0.88 : (prop ? 0.98 : 1.06);
  for (let k = 0; k < TILES * TILES; k++) {
    const q = k / (TILES * TILES - 1);          // 0 -> 1 over the sequence
    const tx = (k % TILES) * T, ty = Math.floor(k / TILES) * T;
    const rot = q * 1.35;                        // domain rotation = roll
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const zoom = 1 / (1 + 0.5 * q);              // features grow as it rolls
    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        const nx = (x + 0.5) / T - 0.5, ny = (y + 0.5) / T - 0.5;
        const r = Math.sqrt(nx * nx + ny * ny) * 2;
        const ux = (nx * cs - ny * sn) * zoom + 0.5 + q * 0.23;
        const uy = (nx * sn + ny * cs) * zoom + 0.5;
        const w = warp(ux, uy);
        const c = churn(ux * 1.9 + 3.7, uy * 1.9 + 1.3);
        const rw = r + (w - 0.5) * (0.40 + 0.42 * q); // raggedness grows
        let a = 1 - (rw - 0.14) / (0.76 - 0.14 * q);
        a = Math.max(0, Math.min(1, a));
        a *= churnLo + churnHi * c;
        // erosion floor rises over the sequence: late frames break apart
        a = Math.max(0, (a - 0.20 * q) / (1 - 0.20 * q));
        a = Math.pow(Math.min(1, a), gamma);
        // hard radial cap: tile edges must stay fully transparent (no seams)
        const capT = Math.max(0, Math.min(1, (r - 0.84) / 0.15));
        a *= 1 - capT * capT * (3 - 2 * capT);
        const i = ((ty + y) * S + tx + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = 255;
        d[i + 3] = Math.round(a * 255);
      }
    }
    // A whole six-atlas bake measured above 200 ms on constrained hardware,
    // Long Animation Frame just after splash teardown. A tile is the
    // smallest deterministic boundary: all RNG consumption and pixel order
    // stay byte-for-byte identical, while the garage idle path can paint
    // between tiles. The synchronous combat fallback simply drains these
    // yields before any effect becomes visible.
    yield;
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
function makeJetTexture(rng: Rng): THREE.CanvasTexture {
  const w = 256, h = 96;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
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
 * Muzzle/detonation flash: layered SOFT-core discharge — compact blinding
 * core, feathered combustion halo whose silhouette is fbm-ragged, and a few
 * faint irregular petals (never hard cartoon star spikes). Alpha-only.
 * @param {() => number} rng
 * @returns {THREE.CanvasTexture}
 */
function makeFlashTexture(rng: Rng): THREE.CanvasTexture {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
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
  // r5 lighting_post: alpha^1.8 falloff prevents a translucent disc edge;
  // FBM bites the halo rim. Fuse both alpha transforms into one pixel pass —
  // a second readback triggered Chromium's read-frequency fallback warning.
  applyFbmAlpha(cv, rng, 0.32, 1.8);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// ---------------------------------------------------------------------------
// Pool plumbing
// ---------------------------------------------------------------------------

/** Unit billboard quad: position.xy in [-0.5, 0.5], uv in [0,1]. */
function makeQuadGeometry(count: number): CapacityGeometry {
  const geo = new THREE.InstancedBufferGeometry() as CapacityGeometry;
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
function makeChunkGeometry(count: number, rng: Rng): CapacityGeometry {
  // r7 "flat orange boxes": the displaced icosahedron kept a convex, roundish
  // silhouette that read as a box at range. Scrap armor is a torn CHUNK with
  // a thin bent PLATE welded off one side — the concave composite silhouette
  // plus the per-instance shear in DEBRIS_VERT kills the popcorn read.
  const chunk = new THREE.IcosahedronGeometry(0.52, 0);
  {
    const pos = chunk.getAttribute('position');
    const disp = new Map<string, number>();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const key = `${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}`;
      let m = disp.get(key);
      if (m === undefined) { m = 0.38 + rng() * 1.15; disp.set(key, m); }
      pos.setXYZ(i, x * m, y * m, z * m);
    }
  }
  // thin torn plate: a squashed, corner-displaced octahedron sticking out
  const plate = new THREE.IcosahedronGeometry(0.55, 0);
  {
    const pos = plate.getAttribute('position');
    const disp = new Map<string, number>();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const key = `${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}`;
      let m = disp.get(key);
      if (m === undefined) { m = 0.55 + rng() * 0.9; disp.set(key, m); }
      // flatten to a plate, then offset/tilt off the chunk's flank
      pos.setXYZ(i, x * m * 1.25, y * m * 0.16, z * m * 0.95);
    }
    plate.rotateZ(0.55);
    plate.rotateX(-0.35);
    plate.translate(0.34, 0.18, -0.12);
  }
  const merged = mergeGeoms([chunk, plate]);
  merged.computeVertexNormals(); // non-indexed => hard facet normals
  const geo = new THREE.InstancedBufferGeometry() as CapacityGeometry;
  geo.setAttribute('position', merged.getAttribute('position'));
  geo.setAttribute('normal', merged.getAttribute('normal'));
  geo.setAttribute('uv', merged.getAttribute('uv'));
  geo.instanceCount = 0;
  geo._capacity = count;
  return geo;
}

/** Minimal non-indexed position/normal/uv concat (avoids the examples dep). */
function mergeGeoms(geoms: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vcount = 0;
  for (const g of geoms) vcount += g.getAttribute('position').count;
  const pos = new Float32Array(vcount * 3);
  const uv = new Float32Array(vcount * 2);
  let o3 = 0, o2 = 0;
  for (const g of geoms) {
    pos.set(g.getAttribute('position').array, o3);
    const u = g.getAttribute('uv');
    if (u) uv.set(u.array, o2);
    o3 += g.getAttribute('position').count * 3;
    o2 += g.getAttribute('position').count * 2;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

/**
 * A ring-buffered instanced pool. `layout` maps attr name -> itemSize.
 * Writes go through a staging cursor; touched spans upload via updateRanges.
 */
class Pool {
  declare readonly name: string;
  declare readonly capacity: number;
  declare cursor: number;
  declare highWater: number;
  declare readonly lifeAttr: string;
  declare readonly lifeComp: number;
  declare dirtyStart: number;
  declare dirtyEnd: number;
  declare dirtyStart2: number;
  declare dirtyEnd2: number;
  declare readonly attrs: Record<string, THREE.InstancedBufferAttribute>;
  declare readonly attrList: THREE.InstancedBufferAttribute[];
  declare readonly geometry: THREE.InstancedBufferGeometry;
  declare readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.Material>;

  constructor(
    name: string,
    geometry: THREE.InstancedBufferGeometry,
    material: THREE.Material,
    layout: Readonly<Record<string, number>>,
    capacity: number,
    lifeAttr: string,
    lifeComp: number,
  ) {
    this.name = name;
    this.capacity = capacity;
    this.cursor = 0;
    this.highWater = 0;
    this.lifeAttr = lifeAttr;
    this.lifeComp = lifeComp;
    // Particle recipes often write dozens of adjacent slots for one shot.
    // Defer GPU upload marking until the frame flush so that becomes one
    // bufferSubData span per attribute, not one driver call per particle.
    this.dirtyStart = -1;
    this.dirtyEnd = -1;
    this.dirtyStart2 = -1;
    this.dirtyEnd2 = -1;
    this.attrs = {};
    this.attrList = [];
    for (const key of Object.keys(layout)) {
      const itemSize = layout[key];
      const attr = new THREE.InstancedBufferAttribute(
        new Float32Array(capacity * itemSize), itemSize);
      attr.setUsage(THREE.DynamicDrawUsage);
      this.attrs[key] = attr;
      this.attrList.push(attr);
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
  claim(): number {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.highWater = Math.max(this.highWater, i + 1);
    this.geometry.instanceCount = this.highWater;
    return i;
  }

  /** Mark one instance's span dirty on every attribute. */
  dirty(i: number): void {
    if (this.dirtyStart < 0) {
      this.dirtyStart = i;
      this.dirtyEnd = i + 1;
    } else if (i === this.dirtyEnd) {
      this.dirtyEnd = i + 1;
    } else if (i + 1 === this.dirtyStart) {
      this.dirtyStart = i;
    } else if (i < this.dirtyStart) {
      // Ring-buffer wrap creates at most one second contiguous range during
      // a frame. Keep it separate instead of uploading the whole pool.
      if (this.dirtyStart2 < 0) {
        this.dirtyStart2 = i;
        this.dirtyEnd2 = i + 1;
      } else {
        this.dirtyStart2 = Math.min(this.dirtyStart2, i);
        this.dirtyEnd2 = Math.max(this.dirtyEnd2, i + 1);
      }
    } else {
      this.dirtyEnd = Math.max(this.dirtyEnd, i + 1);
    }
  }

  /** Commit all CPU writes as one or two contiguous ranges per attribute. */
  flush(): void {
    if (this.dirtyStart < 0) return;
    for (const a of this.attrList) {
      // ACCUMULATE ranges — never clearUpdateRanges() here. The renderer
      // consumes AND clears them itself after upload (three r185
      // WebGLAttributes.update sorts + merges + bufferSubDatas +
      // clearUpdateRanges), so with one flush per rendered frame this is
      // identical to before. Clearing here instead WIPED any ranges a
      // previous flush queued when several fx.update() steps run between
      // renders — the SCENE STUDIO's stepped timeline (advanceFx) does
      // exactly that, and every particle emitted before the final step
      // stayed stale on the GPU (invisible smoke columns / engine smoke
      // while one-burst fireballs rendered). Ranges can only accumulate
      // within one synchronous multi-step advance (every rendered frame
      // drains them), and three merges the list in one sort, so unbounded
      // accumulation is not a perf risk.
      a.addUpdateRange(this.dirtyStart * a.itemSize,
        (this.dirtyEnd - this.dirtyStart) * a.itemSize);
      if (this.dirtyStart2 >= 0) {
        a.addUpdateRange(this.dirtyStart2 * a.itemSize,
          (this.dirtyEnd2 - this.dirtyStart2) * a.itemSize);
      }
      a.needsUpdate = true;
    }
    this.dirtyStart = this.dirtyEnd = this.dirtyStart2 = this.dirtyEnd2 = -1;
  }

  /** Kill every live particle (zero the life component) and reset the ring. */
  killAll(): void {
    const a = this.attrs[this.lifeAttr];
    const arr = a.array;
    const k = a.itemSize;
    for (let i = 0; i < this.capacity; i++) arr[i * k + this.lifeComp] = 0;
    a.clearUpdateRanges();
    a.needsUpdate = true;
    this.dirtyStart = this.dirtyEnd = this.dirtyStart2 = this.dirtyEnd2 = -1;
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
 * @param {object} engineCtx render bundle (§2.8)
 * @param {{ seed?: number }} [opts]
 * @returns {Particles} { group, update(dt), setFrozen(frozen, atTimeS), emit(poolName, opts), pools, resetAll() }
 */
export function createParticleSystem(
  engineCtx: ParticleEngineContext,
  { seed = 5000 }: { seed?: number } = {},
) {
  const texRng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'fx-particles';
  group.matrixAutoUpdate = false;

  const uTime = { value: 0 };
  const uSceneDepth = { value: null };
  const uSoftViewport = { value: new THREE.Vector2(1, 1) };
  const uCameraNear = { value: 0.5 };
  const uCameraFar = { value: 4000 };
  let lateFxUntil = -Infinity;
  let frozen = false;

  // post.ts owns the copied depth texture and updates these shared uniforms
  // before drawing layer 30. Keeping one uniform object across every puff
  // material avoids per-pool state churn and gives the post pass a tiny,
  // explicit integration seam instead of reaching into materials by name.
  const softParticles = {
    layer: LATE_FX_LAYER,
    uSceneDepth,
    uSoftViewport,
    uCameraNear,
    uCameraFar,
    isActive: () => uTime.value <= lateFxUntil,
  };
  group.userData.softParticles = softParticles;

  // LOADING PERF (boot r9): the six procedural sprite bakes (~200 ms of
  // canvas/fbm work) used to run inline here, on the boot-critical path — for
  // textures nothing can sample before the first battle/shot frame (the
  // garage emits no fx). Each material now starts on a 4×4 transparent
  // placeholder CanvasTexture and warmTextures() paints the real canvases in
  // by image-swap. DETERMINISM: the bakes still consume the SAME seeded
  // texRng stream in the SAME order as before — only later — so every frozen
  // capture keeps its exact noise layout. main.ts calls warmTextures() from a
  // post-ready painted-frame slices and synchronously from
  // warmCombatPipeline(), which startBattle()/__SHOTS.set() already run
  // before any fx frame can render.
  const lazyTex = () => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 4;
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  };
  const smokeTex = lazyTex();
  const fireTex = lazyTex();
  const propTex = lazyTex();
  const dustTex = lazyTex();
  const flashTex = lazyTex();
  const jetTex = lazyTex();
  let texturesBaked = false;
  let textureBakeGen: Generator<void, void, void> | null = null;
  let textureAssetImages: Record<keyof typeof PARTICLE_TEXTURE_ASSETS, HTMLImageElement> | null = null;
  let textureAssetPromise: Promise<boolean> | null = null;

  function installBakedTexture(tex: THREE.CanvasTexture, baked: THREE.CanvasTexture): void {
    // STUDIO selftest fix: the 4×4 placeholder HAS usually been uploaded by
    // now — pool meshes render every frame at instanceCount 0, and a zero-
    // instance draw still binds the material and allocates the sampler's GL
    // storage. Swapping `image` to a different-sized canvas with only
    // needsUpdate re-uses that 4×4 allocation and the upload silently
    // no-ops, leaving every puff pool sampling fully-transparent texels
    // (fireballs/smoke/dust invisible in battle AND studio; proven by a
    // dispose-then-recapture probe). dispose() first, so the next bind
    // re-creates the GL object at the real sprite-sheet size.
    tex.dispose();
    tex.image = baked.image;
    tex.needsUpdate = true;
    // the baked wrapper itself was never uploaded; dropping it frees only
    // CPU-side state
    baked.dispose();
  }

  function installTextureImage(tex: THREE.Texture, image: HTMLImageElement): void {
    tex.dispose();
    tex.image = image;
    tex.needsUpdate = true;
  }

  function loadTextureImage(src: string): Promise<HTMLImageElement> {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = async () => {
        // onload guarantees bytes/dimensions, not that every browser has
        // completed PNG decode. Resolve only after decode so the first
        // renderer.initTexture cannot inherit a synchronous image decode.
        try { await image.decode?.(); } catch (_) { /* onload is fallback */ }
        resolve(image);
      };
      image.onerror = () => reject(new Error(`Particle atlas failed to load: ${src}`));
      image.src = src;
    });
  }

  function preloadTextures(): Promise<boolean> {
    if (texturesBaked || textureAssetImages) return Promise.resolve(true);
    if (!textureAssetPromise) {
      textureAssetPromise = Promise.all(Object.entries(PARTICLE_TEXTURE_ASSETS).map(
        async ([name, src]) => [name, await loadTextureImage(src)] as const,
      )).then((entries) => {
        textureAssetImages = Object.fromEntries(entries) as Record<
          keyof typeof PARTICLE_TEXTURE_ASSETS,
          HTMLImageElement
        >;
        return true;
      }).catch(() => false);
    }
    return textureAssetPromise;
  }

  function installTextureAssets(): boolean {
    if (texturesBaked || !textureAssetImages) return texturesBaked;
    installTextureImage(smokeTex, textureAssetImages.smoke);
    installTextureImage(fireTex, textureAssetImages.fire);
    installTextureImage(propTex, textureAssetImages.prop);
    installTextureImage(dustTex, textureAssetImages.dust);
    installTextureImage(flashTex, textureAssetImages.flash);
    installTextureImage(jetTex, textureAssetImages.jet);
    texturesBaked = true;
    return true;
  }

  function* warmTextureSteps(): Generator<void, void, void> {
    // Exact original bake order — the shared RNG stream must not shift.
    const flipbookJobs: ReadonlyArray<readonly [THREE.CanvasTexture, FlipbookStyle]> = [
      [smokeTex, 'smoke'],
      [fireTex, 'fire'],
      [propTex, 'prop'],
      [dustTex, 'dust'],
    ];
    for (const [tex, style] of flipbookJobs) {
      const steps = makeFlipbookTextureSteps(texRng, style);
      let result = steps.next();
      while (!result.done) {
        yield;
        result = steps.next();
      }
      installBakedTexture(tex, result.value);
      yield;
    }
    installBakedTexture(flashTex, makeFlashTexture(texRng));
    yield;
    installBakedTexture(jetTex, makeJetTexture(texRng));
  }

  function finishTextureBake(g: Generator<void, void, void>): void {
    if (textureBakeGen !== g) return;
    textureBakeGen = null;
    texturesBaked = true;
  }

  function warmTextures(): void {
    if (texturesBaked) return;
    if (installTextureAssets()) return;
    const g = textureBakeGen || (textureBakeGen = warmTextureSteps());
    try {
      for (;;) {
        if (textureBakeGen !== g) return;
        const result = g.next();
        if (result.done) { finishTextureBake(g); return; }
      }
    } catch (err) {
      if (textureBakeGen === g) textureBakeGen = null;
      throw err;
    }
  }

  async function warmTexturesChunked(yieldFrame: () => Promise<void>): Promise<void> {
    if (texturesBaked) return;
    if (await preloadTextures()) {
      installTextureAssets();
      return;
    }
    const g = textureBakeGen || (textureBakeGen = warmTextureSteps());
    try {
      for (;;) {
        if (textureBakeGen !== g) return;
        const result = g.next();
        if (result.done) { finishTextureBake(g); return; }
        await yieldFrame();
      }
    } catch (err) {
      if (textureBakeGen === g) textureBakeGen = null;
      throw err;
    }
  }

  const fogUniforms = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
  // Shared world-space sun direction for every media/debris material. Seeded
  // to the default sky, then updated from the active map's real lighting rig
  // each frame so dust lobes, smoke rims and flying debris never shade from a
  // stale Verdant-only key after a map/studio atmosphere switch.
  const sunDirW = new THREE.Vector3(0.527, 0.574, -0.627).normalize();

  function puffMaterial(
    map: THREE.Texture,
    additive: boolean,
    drag: number,
    intensity: number,
    tiles = 1,
    nearFade: readonly [number, number] = [0.5, 2.2],
  ): THREE.ShaderMaterial {
    const mat = new THREE.ShaderMaterial({
      vertexShader: PUFF_VERT,
      fragmentShader: additive ? PUFF_FRAG_ADDITIVE : PUFF_FRAG_NORMAL,
      uniforms: Object.assign(fogUniforms(), {
        uTime,
        uMap: { value: map },
        uDrag: { value: drag },
        uIntensity: { value: intensity },
        uTiles: { value: tiles },
        uSunDirW: { value: sunDirW },
        uNearFade: { value: new THREE.Vector2(nearFade[0], nearFade[1]) },
        uSceneDepth,
        uSoftViewport,
        uCameraNear,
        uCameraFar,
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

  const pools: Record<ParticlePoolName, Pool> = {
    smoke: new Pool('smoke', makeQuadGeometry(POOL_SIZES.smoke),
      puffMaterial(smokeTex, false, 0.9, 1, 4), PUFF_LAYOUT, POOL_SIZES.smoke, 'aVL', 3),
    fire: new Pool('fire', makeQuadGeometry(POOL_SIZES.fire),
      // intensity 1.05: hot enough to bloom where sprites overlap without the
      // stacked-additive HDR clipping the fireball core to a featureless sheet.
      // Additive pools carry a longer lens fade (r7 scope flood): a fire card
      // 3 m from the eye is a screen-filling wash, not feedback.
      puffMaterial(fireTex, true, 1.6, 0.66, 4, [1.2, 4.6]), PUFF_LAYOUT, POOL_SIZES.fire, 'aVL', 3),
    billow: new Pool('billow', makeQuadGeometry(POOL_SIZES.billow),
      // normal-blended fireball body (see PUFF_FRAG_BILLOW): occluding
      // fire-in-smoke lobes that give the blast a rolling silhouette
      (() => {
        const m = puffMaterial(fireTex, false, 1.4, 1.0, 4, [1.2, 4.6]);
        m.fragmentShader = PUFF_FRAG_BILLOW;
        return m;
      })(), PUFF_LAYOUT, POOL_SIZES.billow, 'aVL', 3),
    psmoke: new Pool('psmoke', makeQuadGeometry(POOL_SIZES.psmoke),
      // muzzle propellant mass (see PUFF_FRAG_PROP): erosion-masked cold grey
      // powder smoke — torn billow structure instead of gaussian cotton balls
      (() => {
        const m = puffMaterial(propTex, false, 0.9, 1.0, 4, [0.8, 3.0]);
        m.fragmentShader = PUFF_FRAG_PROP;
        return m;
      })(), PUFF_LAYOUT, POOL_SIZES.psmoke, 'aVL', 3),
    dust: new Pool('dust', makeQuadGeometry(POOL_SIZES.dust),
      puffMaterial(dustTex, false, 1.4, 1, 4), PUFF_LAYOUT, POOL_SIZES.dust, 'aVL', 3),
    flash: new Pool('flash', makeQuadGeometry(POOL_SIZES.flash),
      // 1.7: bright enough to bloom without clipping to a featureless sheet
      puffMaterial(flashTex, true, 0.6, 1.7, 1, [1.2, 4.6]), PUFF_LAYOUT, POOL_SIZES.flash, 'aVL', 3),
    jet: new Pool('jet', makeQuadGeometry(POOL_SIZES.jet),
      new THREE.ShaderMaterial({
        vertexShader: JET_VERT,
        fragmentShader: JET_FRAG,
        uniforms: Object.assign(fogUniforms(), {
          uTime, uMap: { value: jetTex }, uIntensity: { value: 1.6 },
          uNearFade: { value: new THREE.Vector2(1.2, 4.6) },
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
          uNearFade: { value: new THREE.Vector2(0.9, 3.4) },
        }),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,   // streak ribbon winding flips with view direction
        fog: true,
      }), STREAK_LAYOUT, POOL_SIZES.sparks, 'aVL', 3),
    // LOADING PERF (boot r9): the chunk shards get a DEDICATED stream — they
    // used to pull texRng AFTER the six texture bakes, and with those bakes
    // deferred (warmTextures) this call would otherwise consume texRng FIRST
    // and shift every sprite sheet's noise layout. On a private stream the
    // deferred bakes read the exact values the old boot-path bakes read
    // (textures ran first, values 1..K); only the shard silhouettes re-roll
    // once, at identical distribution/quality.
    debris: new Pool('debris', makeChunkGeometry(POOL_SIZES.debris, mulberry32((seed ^ 0x51ed) | 0)),
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
  const poolList = Object.values(pools);

  // Draw order: opaque debris first (default), then dust → smoke → billow →
  // fire → sparks (the occluding billow body draws over the smoke mass; the
  // additive fire/flash glow layers on top of it)
  pools.debris.mesh.renderOrder = 0;
  pools.dust.mesh.renderOrder = 20;
  pools.smoke.mesh.renderOrder = 21;
  pools.psmoke.mesh.renderOrder = 21.2; // propellant mass rides over the wake
  pools.billow.mesh.renderOrder = 21.5;
  pools.fire.mesh.renderOrder = 22;
  pools.jet.mesh.renderOrder = 23;
  pools.flash.mesh.renderOrder = 23;
  pools.sparks.mesh.renderOrder = 23;
  for (const [key, pool] of Object.entries(pools)) {
    // Opaque debris still belongs to the primary world pass. Every
    // transparent combat card shares the late pass so their established
    // renderOrder relationship remains intact after the layer split.
    if (key !== 'debris') pool.mesh.layers.set(LATE_FX_LAYER);
  }
  for (const pool of poolList) group.add(pool.mesh);

  // --- emit dispatch --------------------------------------------------------

  function emitPuff(pool: Pool, o: PuffOptions): void {
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
    lateFxUntil = Math.max(lateFxUntil, birth + Math.max(0, o.life || 0));
    pool.dirty(i);
  }

  function emitStreak(pool: Pool, o: StreakOptions): void {
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
    lateFxUntil = Math.max(lateFxUntil, birth + Math.max(0, o.life || 0));
    pool.dirty(i);
  }

  function emitDebris(pool: Pool, o: DebrisOptions): void {
    const i = pool.claim();
    const birth = uTime.value + (o.birthOffset || 0);
    const A = pool.attrs;
    const pb = A.aPB.array, vl = A.aVL.array, ar = A.aAR.array, sg = A.aSG.array;
    const j = i * 4;
    pb[j] = o.pos[0]; pb[j + 1] = o.pos[1]; pb[j + 2] = o.pos[2]; pb[j + 3] = birth;
    vl[j] = o.vel[0]; vl[j + 1] = o.vel[1]; vl[j + 2] = o.vel[2]; vl[j + 3] = o.life;
    ar[j] = o.axis[0]; ar[j + 1] = o.axis[1]; ar[j + 2] = o.axis[2]; ar[j + 3] = o.spin;
    // hot accepts a float (0..1) — fractional heat lets blast wreckage carry
    // a faint fire-rim glow so airborne chunks never read matte-black cards
    sg[j] = o.scale; sg[j + 1] = o.groundY;
    sg[j + 2] = typeof o.hot === 'number' ? o.hot : (o.hot ? 1 : 0);
    sg[j + 3] = o.seed || 0;
    pool.dirty(i);
  }

  function emitJet(pool: Pool, o: JetOptions): void {
    const i = pool.claim();
    const birth = uTime.value + (o.birthOffset || 0);
    const A = pool.attrs;
    const pb = A.aPB.array, al = A.aAL.array, wl = A.aWL.array, c = A.aC.array;
    const j = i * 4;
    pb[j] = o.pos[0]; pb[j + 1] = o.pos[1]; pb[j + 2] = o.pos[2]; pb[j + 3] = birth;
    al[j] = o.axis[0]; al[j + 1] = o.axis[1]; al[j + 2] = o.axis[2]; al[j + 3] = o.life;
    wl[j] = o.width; wl[j + 1] = o.len0; wl[j + 2] = o.len1; wl[j + 3] = o.seed || 0;
    c[j] = o.col[0]; c[j + 1] = o.col[1]; c[j + 2] = o.col[2]; c[j + 3] = o.alpha;
    lateFxUntil = Math.max(lateFxUntil, birth + Math.max(0, o.life || 0));
    pool.dirty(i);
  }

  const EMITTERS = {
    smoke: (o: PuffOptions) => emitPuff(pools.smoke, o),
    fire: (o: PuffOptions) => emitPuff(pools.fire, o),
    billow: (o: PuffOptions) => emitPuff(pools.billow, o),
    psmoke: (o: PuffOptions) => emitPuff(pools.psmoke, o),
    dust: (o: PuffOptions) => emitPuff(pools.dust, o),
    flash: (o: PuffOptions) => emitPuff(pools.flash, o),
    jet: (o: JetOptions) => emitJet(pools.jet, o),
    sparks: (o: StreakOptions) => emitStreak(pools.sparks, o),
    debris: (o: DebrisOptions) => emitDebris(pools.debris, o),
  };

  return {
    group,
    pools,
    softParticles,

    /**
     * Bake the real sprite sheets into the placeholder textures (idempotent).
     * LOADING PERF (boot r9): must run before the first frame that samples an
     * fx material — warmCombatPipeline() covers every battle/shot path.
     */
    warmTextures,
    warmTexturesChunked,
    preloadTextures,

    /** Current internal clock (seconds). @returns {number} */
    getTime() { return uTime.value; },

    /**
     * Advance the shared particle clock (no-op while frozen).
     * @param {number} dt seconds
     */
    update(dt: number): void {
      if (!frozen) uTime.value += dt;
      const liveSun = engineCtx?.scene?.userData?.sunDirWorld;
      if (liveSun && liveSun.lengthSq() > 1e-8) sunDirW.copy(liveSun).normalize();
      for (const pool of poolList) pool.flush();
    },

    /**
     * Freeze/unfreeze GPU animation; optionally pin the clock.
     * @param {boolean} f
     * @param {number|null} [atTimeS]
     */
    setFrozen(f: boolean, atTimeS: number | null = null): void {
      frozen = f;
      if (atTimeS !== null && atTimeS !== undefined) uTime.value = atTimeS;
    },

    /**
     * Spawn one particle into a named pool.
     * @param {'smoke'|'fire'|'billow'|'psmoke'|'dust'|'flash'|'jet'|'sparks'|'debris'} poolName
     * @param {object} opts pool-specific fields (pos, vel, life, ...; birthOffset backdates)
     */
    emit<Name extends ParticlePoolName>(
      poolName: Name,
      opts: ParticleOptionsByPool[Name],
    ): void {
      const fn = EMITTERS[poolName] as (options: ParticleOptionsByPool[Name]) => void;
      if (!fn) throw new Error(`particles: unknown pool '${poolName}'`);
      fn(opts);
    },

    /**
     * Shift every live particle's birth stamp by `delta` seconds (r4 clock
     * REBASE): when the debug/screenshot pipeline re-pins the shared clock
     * far from its current value (setFrozen(atTimeS) with a big jump), the
     * particles already in flight must keep their AGE rather than instantly
     * expiring — a wreck that started burning 0.8 s ago must still be a
     * 0.8 s-old fire after the pin. Live gameplay never takes this path.
     * @param {number} delta seconds to add to every live birth stamp
     */
    shiftTime(delta: number): void {
      for (const pool of poolList) {
        const pb = pool.attrs.aPB;
        const life = pool.attrs[pool.lifeAttr];
        const n = pool.highWater;
        for (let i = 0; i < n; i++) {
          if (life.array[i * 4 + pool.lifeComp] <= 0) continue;
          pb.array[i * 4 + 3] += delta;
        }
        pb.clearUpdateRanges();
        pb.addUpdateRange(0, n * 4);
        pb.needsUpdate = true;
      }
      if (Number.isFinite(lateFxUntil)) lateFxUntil += delta;
    },

    /** Kill all live particles and reset every ring buffer. */
    resetAll() {
      for (const pool of poolList) pool.killAll();
      lateFxUntil = -Infinity;
    },
  };
}
