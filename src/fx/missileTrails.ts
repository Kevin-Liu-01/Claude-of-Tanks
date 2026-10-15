/**
 * missileTrails.ts — a missile's or rocket's smoke trail as a soft tube of smoke (FX lane, 2026-10-14).
 *
 * The owner: "make missile trails a lot better and not randomly get cut off like if i launch the missile the smoke
 * disappears either quickly or looks like its not actually attached to the missile and instead looks like a fixed width
 * ribbon flapping behind the missile". EF.04's ribbon (smokeRibbons.ts) was a flat strip turned to the eye about its
 * own line: seen down its length (the player's own launch) its side vector swung and it flapped; it held 240 m (96 points
 * 2.5 m apart) and overwrote its tail; a ribbon whose round's seed was negative counted as a free slot and was taken by
 * the next missile; its newest point lagged the nozzle by up to a point's spacing.
 *
 * Here the trail is a chain of segments between points the nozzle passed (each with the time it passed), and every
 * segment draws as a screen-space soft capsule: a quad around its projection, in which each pixel takes the smoke's
 * optical depth along the eye ray — the tube's profile across it, a Gaussian-blurred box along it (neighbouring
 * segments sum seamlessly at any spacing), and seen down its length a disc as deep as the stretch behind it (capped, so
 * a tank behind a trail stays readable). Alpha is 1 - e^-depth, so overlaps compose exactly in any order. The segment
 * from the last laid point to the nozzle is rewritten every frame: the smoke is born at the nozzle, with no gap.
 *
 * In the shader each point ages: its radius grows (the jet's first expansion, then the slow spread), its depth thins as
 * it spreads (its smoke conserved), the world wind carries it and it rises, its line wanders as the air shears it, a
 * noise in its own frame tears its edges and clumps its body (growing with age), a pulsing sustainer swells it every
 * few metres, and at the end of its life the noise eats it into wisps. A boost phase lays a denser, wider trail. It is
 * lit by the time of day (the media's light: sun through thin smoke, its round side, the sky and the ground) and the
 * motor's flame lights the few metres behind it.
 *
 * Budget: one instanced draw; TRAIL_SLOTS trails of TRAIL_SEGS segments in a fixed interleaved buffer (64 bytes a
 * segment). A segment is written once when its point is laid, the nozzle segment every frame; a trail that fills keeps
 * every other old point and lays the next twice as far apart (never cut short). A trail lives until its newest smoke has
 * dissolved, whatever happened to its missile. Nothing allocates per frame; nothing draws while no trail lives.
 */
import * as THREE from 'three';
import { LATE_FX_LAYER } from './layers.ts';
import type { MissileTrail } from './missileLooks.ts';
import type { SceneLightUniforms } from './sceneLight.ts';

export const TRAIL_SLOTS = 96;
export const TRAIL_SEGS = 160;
/** the trail looks the shader holds (each missile family one) */
export const TRAIL_LOOKS = 24;
const STRIDE = 16;
/** a point every this many metres of flight at least (the caller's step may be longer for a fast round) */
export const TRAIL_STEP_M = 2.5;
/** the newest points a filling trail keeps as laid (near the missile, where it is young and thin) */
const KEEP_NEW = 16;
/** how much deeper a stretch seen along its length may draw than seen from the side */
const OBLIQUE_CAP = 2;

export interface MissileTrails {
  readonly mesh: THREE.Mesh;
  /** The shader's index of a trail look (registered once). */
  lookIndex(look: MissileTrail): number;
  /** Start a trail for `key` (any number: a round's id hash); returns its slot. */
  begin(key: number, look: number, seed: number): number;
  /** The slot `key` holds, or -1. */
  slotOf(key: number): number;
  /** Lay a point the nozzle passed at fx time `birth`, `flightS` seconds after its motor lit, `step` metres after the last. */
  point(slot: number, x: number, y: number, z: number, birth: number, flightS: number): void;
  /** The nozzle now: the trail's newest stretch reaches it this frame. */
  head(slot: number, x: number, y: number, z: number, now: number, flightS: number): void;
  /** The motor is gone (struck, burst, burnt out, left the snapshot): the trail ends where it is (or at x, y, z). */
  end(slot: number, now: number, x?: number, y?: number, z?: number): void;
  /** The point spacing the trail lays now (it doubles each time the trail fills). */
  stepOf(slot: number): number;
  /** Per render frame: the fx clock, the wind; frees dissolved trails; hides when none lives. */
  update(now: number, windX: number, windZ: number): void;
  shiftTime(delta: number): void;
  reset(): void;
  /** receipts: trails alive (flying, ended), points laid, segments drawn this frame */
  stats(): { live: number; ended: number; points: number; segments: number };
  /** receipts: a trail's segments (ax, ay, az, aBirth, bx, by, bz, bBirth), oldest first */
  segmentsOf(slot: number): number[];
}

const VERT = /* glsl */ `
attribute vec4 iA;   // point A (world) and the time the nozzle passed it
attribute vec4 iB;   // point B (newer)
attribute vec4 iS;   // metres along the trail at A and B, seconds since the motor lit at A and B
attribute vec4 iK;   // look index, seed
uniform float uTime;
uniform vec3 uWind;
uniform vec4 uViewport;
uniform vec4 uLook[ ${TRAIL_LOOKS * 6} ];
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform vec3 uGroundCol;
varying vec4 vS;     // A and B on screen (px)
varying vec4 vW;     // clip w at A and B, radius (px) at A and B
varying vec4 vT;     // depth across at A and B, age at A and B
varying vec4 vG;     // along (m) at A and B, px per metre at A and B
varying vec4 vL;     // puff, puff spacing, churn, seed
varying vec4 vM;     // the segment's length (m), the sun on its sides, the sun through it, its life (s)
varying vec4 vX;     // the flame's light at A and B, fog depth, end-on
varying vec3 vAmb;
varying vec3 vSun;
float h1( float n ) { return fract( sin( n * 127.1 + 4.7 ) * 43758.5453 ); }
float vn1( float x ) { float i = floor( x ), f = fract( x ); return mix( h1( i ), h1( i + 1.0 ), f * f * ( 3.0 - 2.0 * f ) ); }
// the air takes a point: the wind (eased in as the exhaust's push dies), a slow rise, and its line wandering as the air
// shears it (a smooth function of the metres along the trail, so neighbouring segments wander together)
vec3 carry( float age, float along, float seed, vec4 L0, vec4 L2, vec4 L3 ) {
  float c = age - 0.5 * ( 1.0 - exp( -age / 0.5 ) );
  vec3 d = uWind * ( L3.y * c ) + vec3( 0.0, L3.x * ( age - 0.8 * ( 1.0 - exp( -age / 0.8 ) ) ), 0.0 );
  float m = L2.w * L0.z * 0.55 * smoothstep( 0.4, 5.0, age );
  float ph = along / 46.0 + seed * 13.0;
  d += vec3( vn1( ph ) - 0.5, ( vn1( ph + 31.7 ) - 0.5 ) * 0.5, vn1( ph + 63.1 ) - 0.5 ) * 2.0 * m;
  return d;
}
float boostOf( float fl, vec4 L1 ) { return 1.0 - smoothstep( L1.z * 0.85, L1.z * 1.15 + 0.05, fl ); }
// the jet's first expansion, then the slow spread (wider in the boost)
float radiusAt( float age, float fl, vec4 L0, vec4 L1, vec4 L2 ) {
  float r = L0.x + ( L0.y - L0.x ) * ( 1.0 - exp( -age / 0.1 ) ) + ( L0.z - L0.y ) * ( 1.0 - exp( -age / L0.w ) );
  return r * mix( 1.0, L2.x, boostOf( fl, L1 ) );
}
// its depth across: thinning as it spreads (its smoke conserved), denser in the boost, gone at the end of its life
float depthAt( float age, float fl, float r, vec4 L0, vec4 L1 ) {
  float t = L1.y * mix( 1.0, L1.w, boostOf( fl, L1 ) ) * pow( clamp( L0.y / max( r, 1e-3 ), 0.0, 2.0 ), 0.6 );
  return t * ( 1.0 - smoothstep( 0.62, 1.0, age / L1.x ) );
}
void main() {
  vS = vec4( 0.0 ); vW = vec4( 1.0 ); vT = vec4( 0.0 ); vG = vec4( 0.0 ); vL = vec4( 0.0 ); vM = vec4( 0.0 );
  vX = vec4( 0.0 ); vAmb = vec3( 0.0 ); vSun = vec3( 0.0 );
  int li = int( iK.x + 0.5 ) * 6;
  vec4 L0 = uLook[ li ], L1 = uLook[ li + 1 ], L2 = uLook[ li + 2 ], L3 = uLook[ li + 3 ], C0 = uLook[ li + 4 ], C1 = uLook[ li + 5 ];
  float ageA = uTime - iA.w, ageB = uTime - iB.w;
  // unwritten, not yet born, or dissolved: no area
  if ( iA.w < -1.0e8 || ageB < 0.0 || ageB >= L1.x ) { gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 ); return; }
  ageA = max( ageA, 0.0 );
  float gA = iS.x, gB = iS.y, fA = iS.z, fB = iS.w;
  vec3 cA = iA.xyz + carry( ageA, gA, iK.y, L0, L2, L3 );
  vec3 cB = iB.xyz + carry( ageB, gB, iK.y, L0, L2, L3 );
  vec4 eA = viewMatrix * vec4( cA, 1.0 ), eB = viewMatrix * vec4( cB, 1.0 );
  // the part in front of the eye
  const float ZN = -0.12;
  if ( eA.z > ZN && eB.z > ZN ) { gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 ); return; }
  if ( eA.z > ZN ) {
    float f = ( ZN - eB.z ) / ( eA.z - eB.z );
    eA = mix( eB, eA, f ); cA = mix( cB, cA, f ); ageA = mix( ageB, ageA, f ); gA = mix( gB, gA, f ); fA = mix( fB, fA, f );
  } else if ( eB.z > ZN ) {
    float f = ( ZN - eA.z ) / ( eB.z - eA.z );
    eB = mix( eA, eB, f ); cB = mix( cA, cB, f ); ageB = mix( ageA, ageB, f ); gB = mix( gA, gB, f ); fB = mix( fA, fB, f );
  }
  float rA = radiusAt( ageA, fA, L0, L1, L2 ), rB = radiusAt( ageB, fB, L0, L1, L2 );
  float tA = depthAt( ageA, fA, rA, L0, L1 ), tB = depthAt( ageB, fB, rB, L0, L1 );
  vec4 kA = projectionMatrix * eA, kB = projectionMatrix * eB;
  vec2 sA = ( kA.xy / kA.w * 0.5 + 0.5 ) * uViewport.zw + uViewport.xy;
  vec2 sB = ( kB.xy / kB.w * 0.5 + 0.5 ) * uViewport.zw + uViewport.xy;
  float pA = projectionMatrix[ 1 ][ 1 ] * 0.5 * uViewport.w / kA.w;
  float pB = projectionMatrix[ 1 ][ 1 ] * 0.5 * uViewport.w / kB.w;
  // never thinner than ~a pixel on screen (its depth pays the difference: a far trail thins, it never crawls)
  float qA = rA * pA, qB = rB * pB;
  float rpA = max( qA, 0.85 ), rpB = max( qB, 0.85 );
  tA *= qA / rpA; tB *= qB / rpB;
  // close to the lens a stretch thins rather than walling the frame: the launcher's own cameras sit a few metres from its
  // start, and through a zoomed sight a stretch 10 m out is as close as one at 1.5 m (its pixels per metre say how near
  // it reads); nor does any stretch wider than a fifth of the frame draw at full depth
  float zf = 0.5 * uViewport.w / 1080.0;
  tA *= smoothstep( 0.4, 2.5, -eA.z ) * ( 1.0 - smoothstep( 70.0 * zf, 300.0 * zf, pA ) ) * pow( min( 1.0, 0.2 * uViewport.w / rpA ), 2.0 );
  tB *= smoothstep( 0.4, 2.5, -eB.z ) * ( 1.0 - smoothstep( 70.0 * zf, 300.0 * zf, pB ) ) * pow( min( 1.0, 0.2 * uViewport.w / rpB ), 2.0 );
  // nothing left to draw (faded at the lens, dissolved at both ends): no quad, so a huge one at the eye costs no fill
  if ( max( tA, tB ) < 0.004 ) { gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 ); return; }
  // the quad: the projected segment, out past both ends and to either side by its widest (a puff, a torn edge)
  vec2 d = sB - sA;
  float L = length( d );
  vec2 t = L > 1e-3 ? d / L : vec2( 1.0, 0.0 );
  vec2 n = vec2( -t.y, t.x );
  float pk = 1.0 + 0.25 * L2.y + 0.3 * L2.w;
  float exA = 2.0 * rpA * pk + 1.5, exB = 2.0 * rpB * pk + 1.5;
  bool atA = position.x < 0.5;
  vec2 sp = atA ? sA - t * exA : sB + t * exB;
  sp += n * position.y * max( exA, exB );
  vec4 k = atA ? kA : kB;
  vec2 ndc = ( sp - uViewport.xy ) / uViewport.zw * 2.0 - 1.0;
  gl_Position = vec4( ndc * k.w, k.z, k.w );
  vS = vec4( sA, sB );
  vW = vec4( kA.w, kB.w, rpA, rpB );
  vT = vec4( tA, tB, ageA, ageB );
  vG = vec4( gA, gB, pA, pB );
  vL = vec4( L2.y, L2.z, L2.w, iK.y );
  // lit as the media are: the sun through thin smoke (brighter toward it), on the tube's round side, the sky, the ground
  float len3 = length( cB - cA );
  vec3 mid = 0.5 * ( cA + cB );
  vec3 V = normalize( cameraPosition - mid );
  vec3 T3 = len3 > 1e-4 ? ( cB - cA ) / len3 : vec3( 0.0, 0.0, 1.0 );
  vec3 sd = cross( T3, V );
  float sdl = length( sd );
  sd = sdl > 1e-4 ? sd / sdl : vec3( 0.0, 1.0, 0.0 );
  float endOn = abs( dot( T3, V ) );
  vM = vec4( len3, dot( sd, uSunDir ) * ( 1.0 - endOn ), dot( V, uSunDir ), L1.x );
  float am = 0.5 * ( ageA + ageB );
  vec3 albedo = mix( C0.rgb, C1.rgb, smoothstep( 0.0, 1.0, am / L1.x ) );
  float fwd = 0.55 + 0.45 * pow( max( 0.0, dot( -V, uSunDir ) ), 3.0 );
  float skyLum = dot( uSkyCol, vec3( 0.2126, 0.7152, 0.0722 ) );
  vAmb = albedo * ( mix( vec3( skyLum ), uSkyCol, 0.5 ) * 0.9 + uGroundCol * 0.25 );
  vSun = albedo * uSunCol * fwd * 0.62;
  // the motor's flame on the smoke just behind it (its first few metres; it shows against the night, hardly in sun)
  float sunLum = dot( uSunCol, vec3( 0.2126, 0.7152, 0.0722 ) );
  float gk = L3.z * mix( 1.0, 0.18, smoothstep( 0.15, 1.0, sunLum ) );
  vX = vec4( gk * exp( -ageA / 0.016 ), gk * exp( -ageB / 0.016 ), -0.5 * ( eA.z + eB.z ), endOn );
}
`;

const FRAG = /* glsl */ `
varying vec4 vS;
varying vec4 vW;
varying vec4 vT;
varying vec4 vG;
varying vec4 vL;
varying vec4 vM;
varying vec4 vX;
varying vec3 vAmb;
varying vec3 vSun;
#ifdef USE_FOG
  uniform vec3 fogColor;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif
float h1( float n ) { return fract( sin( n * 127.1 + 4.7 ) * 43758.5453 ); }
float vn1( float x ) { float i = floor( x ), f = fract( x ); return mix( h1( i ), h1( i + 1.0 ), f * f * ( 3.0 - 2.0 * f ) ); }
float h2( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float vn2( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( h2( i ), h2( i + vec2( 1.0, 0.0 ) ), u.x ), mix( h2( i + vec2( 0.0, 1.0 ) ), h2( i + 1.0 ), u.x ), u.y );
}
// the normal CDF (a logistic fit: within 0.01)
float cdf( float z ) { return 1.0 / ( 1.0 + exp( -1.702 * z ) ); }
void main() {
  vec2 ab = vS.zw - vS.xy;
  float L = length( ab );
  vec2 t = L > 1e-3 ? ab / L : vec2( 1.0, 0.0 );
  vec2 q = gl_FragCoord.xy - vS.xy;
  float x = dot( q, t ), y = dot( q, vec2( -t.y, t.x ) );
  float us = L > 1e-3 ? clamp( x / L, 0.0, 1.0 ) : 0.5;
  // perspective-correct along the segment
  float u3 = ( us / vW.y ) / ( ( 1.0 - us ) / vW.x + us / vW.y );
  float rp = mix( vW.z, vW.w, us );
  float ppm = mix( vG.z, vG.w, us );
  float along = mix( vG.x, vG.y, u3 );
  float age = mix( vT.z, vT.w, u3 );
  float tau = mix( vT.x, vT.y, u3 );
  // a pulsing sustainer's puffs: it swells and thickens every few metres
  float b = vn1( along / max( vL.y, 0.5 ) + vL.w * 37.0 ) - 0.5;
  float rk = 1.0 + vL.x * 0.5 * b;
  tau *= 1.0 + vL.x * 0.8 * b;
  // the profile's width: its edge (a quarter of its depth) at the radius
  float sig = 0.65 * rp * rk;
  // its own turbulence, in its own frame (it grows as the smoke does): torn edges, a clumped body; past the segment's
  // ends the frame runs on (seen down its length a stretch is a disc, textured all round, never streaked)
  float rw = rp / max( ppm, 1e-4 );
  float alongN = along + ( x - clamp( x, 0.0, L ) ) / max( ppm, 1e-4 );
  vec2 nq = vec2( alongN / ( 2.2 * rw * rk ), 0.75 * y / ( rp * rk ) ) + vec2( vL.w * 17.0 - age * 0.2, vL.w * 5.3 );
  float n = vn2( nq ) * 0.65 + vn2( nq * 2.07 + vec2( 5.1, 1.7 ) ) * 0.35;
  float ch = vL.z * ( 0.35 + 0.65 * smoothstep( 0.0, 1.2, age ) );
  float sp = sig * ( 1.0 + ch * 0.55 * ( n - 0.5 ) );
  float kx = mix( 3.0, 2.0, smoothstep( 0.0, 1.2, age ) );
  float across = exp( -0.5 * pow( abs( y ) / max( sp, 1e-3 ), kx ) );
  // along it: a Gaussian-blurred box (its neighbours sum seamlessly at any spacing), a little deeper where the eye looks
  // along it (to OBLIQUE_CAP); seen straight down its length a stretch adds only what its projection covers, so a
  // sight laid down the missile's own line still sees the target beyond it
  float sa = max( sig, 0.5 );
  float lenPx = vM.x * ppm;
  float A = ( cdf( x / sa ) - cdf( ( x - L ) / sa ) ) * min( lenPx / max( L, 1e-3 ), ${OBLIQUE_CAP.toFixed(1)} );
  float T = tau * across * A * clamp( 1.0 + ch * 1.1 * ( n - 0.5 ), 0.0, 2.0 );
  // the end of its life: the noise eats it into wisps as it fades
  float dT = smoothstep( 0.5, 1.0, age / vM.w ) * 1.05;
  T *= smoothstep( dT - 0.25, dT, n );
  float a = 1.0 - exp( -min( T, 8.0 ) );
  if ( a < 0.003 ) discard;
  // lit: dense smoke shows its shaded side; thin smoke is lit through
  float sN = clamp( y / ( 2.2 * sp ), -1.0, 1.0 );
  float ndl = vM.y * sN + vM.z * sqrt( 1.0 - sN * sN );
  float shade = mix( 1.0, 0.45 + 0.75 * max( ndl, 0.0 ), clamp( tau * 0.8, 0.0, 1.0 ) );
  vec3 col = vAmb + vSun * shade + vec3( 1.0, 0.52, 0.18 ) * mix( vX.x, vX.y, u3 );
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( -fogDensity * fogDensity * vX.z * vX.z );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vX.z );
    #endif
    col = mix( col, fogColor, fogFactor );
  #endif
  gl_FragColor = vec4( col, a );
}
`;

export function createMissileTrails(light: SceneLightUniforms): MissileTrails {
  const N = TRAIL_SLOTS * TRAIL_SEGS;
  const data = new Float32Array(N * STRIDE);
  const buf = new THREE.InstancedInterleavedBuffer(data, STRIDE, 1);
  buf.setUsage(THREE.DynamicDrawUsage);
  const geo = new THREE.InstancedBufferGeometry();
  // the quad's corners: x 0 at A, 1 at B; y -1 | +1 across
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 0, 1, 0, 1, -1, 0, 1, 1, 0], 3));
  geo.setIndex([0, 2, 1, 1, 2, 3]);
  geo.setAttribute('iA', new THREE.InterleavedBufferAttribute(buf, 4, 0));
  geo.setAttribute('iB', new THREE.InterleavedBufferAttribute(buf, 4, 4));
  geo.setAttribute('iS', new THREE.InterleavedBufferAttribute(buf, 4, 8));
  geo.setAttribute('iK', new THREE.InterleavedBufferAttribute(buf, 4, 12));
  geo.instanceCount = 0;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  // every segment unwritten
  for (let i = 0; i < N; i++) data[i * STRIDE + 3] = -1e9;
  const uLook = { value: Array.from({ length: TRAIL_LOOKS * 6 }, () => new THREE.Vector4()) };
  const uTime = { value: 0 };
  const uWind = { value: new THREE.Vector3() };
  const uViewport = { value: new THREE.Vector4(0, 0, 1920, 1080) };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
      uTime, uWind, uViewport, uLook,
      uSunDir: light.uSunDir, uSunCol: light.uSunCol, uSkyCol: light.uSkyCol, uGroundCol: light.uGroundCol,
    }),
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    fog: true,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'fx-missile-trails';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // the late pass: over the battle smoke (21), just under the volumetric media (21.4)
  mesh.renderOrder = 21.3;
  mesh.layers.set(LATE_FX_LAYER);
  mesh.visible = false;
  const _vp = new THREE.Vector4();
  mesh.onBeforeRender = (renderer) => {
    renderer.getCurrentViewport(_vp);
    uViewport.value.set(_vp.x, _vp.y, Math.max(1, _vp.z), Math.max(1, _vp.w));
  };

  const looks = new Map<MissileTrail, number>();
  const lifeOfLook = new Float32Array(TRAIL_LOOKS);
  // per slot: the round, its look, its seed, points laid, the last point (x, y, z, birth, along, flight), the step, alive
  const keys = new Float64Array(TRAIL_SLOTS);
  const used = new Uint8Array(TRAIL_SLOTS);
  const lookOf = new Int16Array(TRAIL_SLOTS);
  const seedOf = new Float32Array(TRAIL_SLOTS);
  const count = new Int32Array(TRAIL_SLOTS);
  const last = new Float64Array(TRAIL_SLOTS * 6);
  const step = new Float64Array(TRAIL_SLOTS).fill(TRAIL_STEP_M);
  const ended = new Uint8Array(TRAIL_SLOTS);
  const hasHead = new Uint8Array(TRAIL_SLOTS);
  const newest = new Float64Array(TRAIL_SLOTS).fill(-1e9);
  // each slot's dirty instance range this frame
  const dirtyLo = new Int32Array(TRAIL_SLOTS).fill(TRAIL_SEGS);
  const dirtyHi = new Int32Array(TRAIL_SLOTS).fill(-1);
  let points = 0, topSlot = -1, lastNow = 0;

  const dirty = (slot: number, k: number): void => {
    if (k < dirtyLo[slot]) dirtyLo[slot] = k;
    if (k > dirtyHi[slot]) dirtyHi[slot] = k;
  };
  function writeSeg(slot: number, k: number, ax: number, ay: number, az: number, ab: number, ag: number, af: number,
    bx: number, by: number, bz: number, bb: number, bg: number, bf: number): void {
    const o = (slot * TRAIL_SEGS + k) * STRIDE;
    data[o] = ax; data[o + 1] = ay; data[o + 2] = az; data[o + 3] = ab;
    data[o + 4] = bx; data[o + 5] = by; data[o + 6] = bz; data[o + 7] = bb;
    data[o + 8] = ag; data[o + 9] = bg; data[o + 10] = af; data[o + 11] = bf;
    data[o + 12] = lookOf[slot]; data[o + 13] = seedOf[slot]; data[o + 14] = 0; data[o + 15] = 0;
    dirty(slot, k);
  }
  function clearSeg(slot: number, k: number): void {
    const o = (slot * TRAIL_SEGS + k) * STRIDE;
    if (data[o + 3] < -1e8) return;
    data[o + 3] = -1e9;
    dirty(slot, k);
  }
  /** a full trail keeps the first point, every other older one and the newest KEEP_NEW as laid; the step doubles */
  function compact(slot: number): void {
    // its points: A of every laid segment, then the last point (segments 0..count-2 hold points 0..count-1)
    const segs = count[slot] - 1;
    const base = slot * TRAIL_SEGS;
    let w = 0; // segments written
    let ax = data[base * STRIDE], ay = data[base * STRIDE + 1], az = data[base * STRIDE + 2], ab = data[base * STRIDE + 3];
    let ag = data[base * STRIDE + 8], af = data[base * STRIDE + 10];
    for (let j = 0; j < segs; j++) {
      const o = (base + j) * STRIDE;
      const old = j < segs - KEEP_NEW;
      // skip the joint between segments j and j+1 when j is even and old (merge them)
      if (old && j % 2 === 0 && j + 1 < segs - KEEP_NEW) continue;
      const bx = data[o + 4], by = data[o + 5], bz = data[o + 6], bb = data[o + 7], bg = data[o + 9], bf = data[o + 11];
      writeSeg(slot, w, ax, ay, az, ab, ag, af, bx, by, bz, bb, bg, bf);
      ax = bx; ay = by; az = bz; ab = bb; ag = bg; af = bf;
      w++;
    }
    for (let j = w; j < TRAIL_SEGS; j++) clearSeg(slot, j);
    count[slot] = w + 1;
    step[slot] *= 2;
    hasHead[slot] = 0;
  }
  function freeSlot(slot: number): void {
    used[slot] = 0; count[slot] = 0; ended[slot] = 0; hasHead[slot] = 0; newest[slot] = -1e9; step[slot] = TRAIL_STEP_M;
    for (let k = 0; k < TRAIL_SEGS; k++) clearSeg(slot, k);
  }
  function flush(): void {
    for (let i = 0; i <= Math.max(topSlot, 0) && i < TRAIL_SLOTS; i++) {
      if (dirtyHi[i] < dirtyLo[i]) continue;
      buf.addUpdateRange((i * TRAIL_SEGS + dirtyLo[i]) * STRIDE, (dirtyHi[i] - dirtyLo[i] + 1) * STRIDE);
      buf.needsUpdate = true;
      dirtyLo[i] = TRAIL_SEGS; dirtyHi[i] = -1;
    }
  }

  return {
    mesh,
    lookIndex(look) {
      let i = looks.get(look);
      if (i !== undefined) return i;
      i = Math.min(looks.size, TRAIL_LOOKS - 1);
      looks.set(look, i);
      const v = uLook.value;
      v[i * 6].set(look.r0, look.rJet, look.r1, look.growS);
      v[i * 6 + 1].set(look.life, look.tau, look.boostS, look.boostK);
      v[i * 6 + 2].set(look.boostW, look.puff, look.puffM, look.churn);
      v[i * 6 + 3].set(look.rise, look.windK, look.glow, 0);
      v[i * 6 + 4].set(look.c0[0], look.c0[1], look.c0[2], 0);
      v[i * 6 + 5].set(look.c1[0], look.c1[1], look.c1[2], 0);
      lifeOfLook[i] = look.life;
      return i;
    },
    begin(key, look, seed) {
      // its own slot, else the lowest free one, else the trail whose newest smoke dissolves soonest
      let slot = -1, soonest = Infinity;
      for (let i = 0; i < TRAIL_SLOTS; i++) {
        if (used[i] && keys[i] === key) return i;
        if (!used[i]) { slot = i; break; }
        const out = newest[i] + lifeOfLook[lookOf[i]] + (ended[i] ? 0 : 1e6);
        if (out < soonest) { soonest = out; slot = i; }
      }
      if (used[slot]) freeSlot(slot);
      used[slot] = 1; keys[slot] = key; lookOf[slot] = look; seedOf[slot] = seed; count[slot] = 0; ended[slot] = 0;
      hasHead[slot] = 0; step[slot] = TRAIL_STEP_M;
      if (slot > topSlot) topSlot = slot;
      return slot;
    },
    slotOf(key) {
      for (let i = 0; i <= topSlot; i++) if (used[i] && keys[i] === key) return i;
      return -1;
    },
    point(slot, x, y, z, birth, flightS) {
      if (slot < 0 || !used[slot] || ended[slot]) return;
      const l = slot * 6;
      if (count[slot] > 0) {
        if (count[slot] >= TRAIL_SEGS) compact(slot);
        const along = last[l + 4] + Math.hypot(x - last[l], y - last[l + 1], z - last[l + 2]);
        writeSeg(slot, count[slot] - 1, last[l], last[l + 1], last[l + 2], last[l + 3], last[l + 4], last[l + 5],
          x, y, z, birth, along, flightS);
        last[l + 4] = along;
      } else last[l + 4] = 0;
      last[l] = x; last[l + 1] = y; last[l + 2] = z; last[l + 3] = birth; last[l + 5] = flightS;
      count[slot]++;
      hasHead[slot] = 0;
      if (birth > newest[slot]) newest[slot] = birth;
      points++;
    },
    head(slot, x, y, z, now, flightS) {
      if (slot < 0 || !used[slot] || ended[slot] || count[slot] < 1) return;
      if (count[slot] >= TRAIL_SEGS) compact(slot);
      const l = slot * 6;
      const along = last[l + 4] + Math.hypot(x - last[l], y - last[l + 1], z - last[l + 2]);
      writeSeg(slot, count[slot] - 1, last[l], last[l + 1], last[l + 2], last[l + 3], last[l + 4], last[l + 5],
        x, y, z, now, along, flightS);
      hasHead[slot] = 1;
      if (now > newest[slot]) newest[slot] = now;
    },
    end(slot, now, x, y, z) {
      if (slot < 0 || !used[slot] || ended[slot]) return;
      const l = slot * 6;
      if (x !== undefined && y !== undefined && z !== undefined && count[slot] > 0) {
        // out to where it ended (its strike), the last stretch laid now
        this.point(slot, x, y, z, now, last[l + 5]);
      } else if (hasHead[slot]) {
        // the newest stretch stays where the nozzle last was
        const o = (slot * TRAIL_SEGS + count[slot] - 1) * STRIDE;
        this.point(slot, data[o + 4], data[o + 5], data[o + 6], data[o + 7], data[o + 11]);
      }
      ended[slot] = 1;
    },
    stepOf(slot) {
      return slot >= 0 ? step[slot] : TRAIL_STEP_M;
    },
    update(now, windX, windZ) {
      lastNow = now;
      uTime.value = now;
      uWind.value.set(windX, 0, windZ);
      let top = -1;
      for (let i = 0; i <= topSlot; i++) {
        if (!used[i]) continue;
        // dissolved: its newest smoke is older than its life (a flying trail's newest is now)
        if (ended[i] && now - newest[i] > lifeOfLook[lookOf[i]]) { freeSlot(i); continue; }
        top = i;
      }
      flush();
      topSlot = top;
      geo.instanceCount = (top + 1) * TRAIL_SEGS;
      mesh.visible = top >= 0;
    },
    shiftTime(delta) {
      for (let i = 0; i < N; i++) {
        const o = i * STRIDE;
        if (data[o + 3] < -1e8) continue;
        data[o + 3] += delta; data[o + 7] += delta;
      }
      for (let i = 0; i < TRAIL_SLOTS; i++) { last[i * 6 + 3] += delta; newest[i] += delta; }
      buf.addUpdateRange(0, N * STRIDE);
      buf.needsUpdate = true;
      lastNow += delta;
    },
    reset() {
      for (let i = 0; i < TRAIL_SLOTS; i++) if (used[i]) freeSlot(i);
      flush();
      topSlot = -1;
      geo.instanceCount = 0;
      mesh.visible = false;
    },
    stats() {
      let live = 0, gone = 0, segments = 0;
      for (let i = 0; i <= topSlot; i++) {
        if (!used[i]) continue;
        if (ended[i]) gone++; else live++;
        for (let k = 0; k < TRAIL_SEGS; k++) {
          const o = (i * TRAIL_SEGS + k) * STRIDE;
          if (data[o + 3] > -1e8 && lastNow - data[o + 7] < lifeOfLook[lookOf[i]]) segments++;
        }
      }
      return { live, ended: gone, points, segments };
    },
    segmentsOf(slot) {
      const out: number[] = [];
      if (slot < 0) return out;
      for (let k = 0; k < TRAIL_SEGS; k++) {
        const o = (slot * TRAIL_SEGS + k) * STRIDE;
        if (data[o + 3] < -1e8) continue;
        out.push(data[o], data[o + 1], data[o + 2], data[o + 3], data[o + 4], data[o + 5], data[o + 6], data[o + 7]);
      }
      return out;
    },
  };
}
