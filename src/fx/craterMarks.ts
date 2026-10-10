/**
 * craterMarks.ts — the ground a blast leaves behind (destruction-fx lane, 2026-10-07; crater-render-spec §D).
 *
 * Two kinds of mark in one draw:
 *
 *  - CRATERS: a deforming crater the core dug (terrain:crater). The ground lane moves the terrain into the bowl; this
 *    lays the crater's own surface over it — scorched, churned soil darkest in the bowl, broken soil on the rim, and the
 *    apron of thrown soil, torn turf and clods out to ~2.2 R (heavier where the core's rim stands higher) — draped on
 *    the deformed ground (base + the bound overlay, the same frame the mesh follows), with the edge ragged by the
 *    simulation's own wobble (craterWobblePhases: the decal's rim follows the bowl's). 160 slots, kept for the match
 *    (the simulation's own cap).
 *  - MARKS: a burst that dug nothing: an HE round's at its size (the same look), a shaped charge's scar (round 7,
 *    wave 276: a black star of soot out of a small pit, no bowl, no rim), HESH's shallow scorch, a kinetic gouge; flat
 *    on the ground, a seeded ragged outline. 96 slots, the oldest recycled first.
 *
 * The look is procedural in the shader (no texture): the pit darker and wetter than the rim, the rim's lip lit as a
 * slope (catching the sun on the side facing it), ejecta clumps and rays thinning outward, soot for explosives, and
 * the soil of the place: the surface kind under the burst and the map's ground climate (loam, sandy loam, sand, dark
 * soil through snow, black mud, grey chips on rock and road, ash).
 *
 * No per-frame work but the clock and the light: a stamp uploads its own slot.
 */
import * as THREE from 'three';
import type { SurfaceKind } from './surfaceLooks.ts';

const CRATER_SLOTS = 160;
const MARK_SLOTS = 96;
const SLOTS = CRATER_SLOTS + MARK_SLOTS;
const SEG = 28;
const RINGS = 6;
const VERTS = 1 + SEG * RINGS;
/** a centre fan plus (RINGS - 1) quad rings */
const INDICES_PER_SLOT = SEG * 3 + (RINGS - 1) * SEG * 6;
/** A disc reaches 2.4 rim radii (round 7: a crater's apron reaches ~2.2 R; the deformed ground fades by 2 R). */
const MARK_REACH = 2.4;
const CRATER_REACH = 2.4;

/** What kind of mark a burst leaves (round 7, wave 276): a kinetic gouge, an HE round's crater or mark, a shaped
 *  charge's scar (no bowl: the core never digs one), HESH's shallow scorch (never dug either). */
export type CraterMarkKind = 'gouge' | 'he' | 'scar' | 'hesh';
const KIND_INDEX: Readonly<Record<CraterMarkKind, number>> = Object.freeze({ gouge: 0, he: 1, scar: 2, hesh: 3 });
/** The mark a munition leaves (sim/destructionEvents.ts MunitionClass). */
export function markKindFor(munition: string, explosive: boolean): CraterMarkKind {
  if (!explosive) return 'gouge';
  if (munition === 'heat' || munition === 'atgm' || munition === 'drone_fpv') return 'scar';
  return munition === 'hesh' ? 'hesh' : 'he';
}

/** Surface index the shader knows (2: snow — dark soil under white ejecta). */
const SURFACE_INDEX: Readonly<Record<SurfaceKind, number>> = Object.freeze({
  soil: 0, sand: 1, snow: 2, mud: 3, rock: 4, concrete: 4, water: 0, wood: 0, metal: 4,
});

/** The map's ground climate (world/groundRedux.ts), with the volcanic maps' ash. */
export type CraterClimate = 'vegetated' | 'arid' | 'snow' | 'ash';

/**
 * The turned soil of a place (linear rgb) and how fully the mark covers the ground: the surface under the burst, then
 * the climate (an arid map's soil is a sandy loam, an ash field black-grey).
 */
export function craterSoil(surface: SurfaceKind, climate: CraterClimate, out: [number, number, number, number]): [number, number, number, number] {
  const set = (r: number, g: number, b: number, cover: number) => { out[0] = r; out[1] = g; out[2] = b; out[3] = cover; return out; };
  if (climate === 'ash' && (surface === 'soil' || surface === 'rock' || surface === 'mud')) return set(0.032, 0.031, 0.033, 0.95);
  switch (surface) {
    case 'sand': return set(0.29, 0.23, 0.155, 0.8);
    case 'snow': return set(0.05, 0.039, 0.027, 0.92);
    case 'mud': return set(0.038, 0.031, 0.022, 0.97);
    case 'rock': case 'concrete': case 'metal': return set(0.12, 0.116, 0.11, 0.78);
    default: return climate === 'arid' ? set(0.12, 0.092, 0.062, 0.92) : set(0.068, 0.054, 0.038, 0.95);
  }
}

const VERT = /* glsl */ `
attribute vec4 aInfo;   // birth, surface index, kind (0 gouge, 1 HE, 2 scar, 3 HESH), seed (0..1)
attribute vec4 aShape;  // wobble phases p1, p2, p3 (a crater) and its rim's share of the disc (0: a mark)
attribute vec4 aSoil;   // the turned soil (linear rgb), cover
attribute vec2 aDisc;   // disc coordinates (-1..1, scaled to the disc's reach)
attribute float aSize;  // the rim radius (m): the texture's metres
uniform float uTime;
varying vec2 vDisc;
varying vec4 vInfo;
varying vec4 vShape;
varying vec4 vSoil;
varying float vSize;
#ifdef USE_FOG
  varying float vFogDepth;
#endif
void main() {
  vDisc = aDisc;
  vInfo = aInfo;
  vShape = aShape;
  vSoil = aSoil;
  vSize = aSize;
  vec4 mvPosition = viewMatrix * vec4( position, 1.0 );
  #ifdef USE_FOG
    vFogDepth = -mvPosition.z;
  #endif
  gl_Position = ( uTime - aInfo.x < 0.0 ) ? vec4( 0.0, 0.0, 2.0, 1.0 ) : projectionMatrix * mvPosition;
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
varying vec2 vDisc;
varying vec4 vInfo;
varying vec4 vShape;
varying vec4 vSoil;
varying float vSize;
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
float h21( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float vnoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( h21( i ), h21( i + vec2( 1.0, 0.0 ) ), f.x ), mix( h21( i + vec2( 0.0, 1.0 ) ), h21( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
float fbm( vec2 p ) { return 0.55 * vnoise( p ) + 0.3 * vnoise( p * 2.13 + 7.1 ) + 0.15 * vnoise( p * 4.37 + 3.3 ); }
void main() {
  float seed = vInfo.w;
  vec2 so = vec2( fract( seed * 7.13 ), fract( seed * 3.71 ) ) * 40.0;
  float r = length( vDisc );
  // (2026-10-08) atan(0, 0) is undefined (NaN on some drivers) at the disc's centre
  float ang = r > 1e-5 ? atan( vDisc.y, vDisc.x ) : 0.0;
  bool crater = vShape.w > 0.0;
  // the mark's kind: 0 a kinetic gouge, 1 an HE burst (a crater or its mark), 2 a shaped charge's scar, 3 HESH's mark
  float kind = vInfo.z;
  bool scar = kind > 1.5 && kind < 2.5;
  bool hesh = kind > 2.5;
  float explosive = kind > 0.5 ? 1.0 : 0.0;
  float rimShare = crater ? vShape.w : ${(1 / MARK_REACH).toFixed(5)};
  float q = r / rimShare;
  // the rim's break round the crater (the core's craterProfile: its height x (1 + 0.45 (0.5 sin(2a+p2) + 0.3 sin(4a+p3)
  // + 0.2 sin(6a+p1)))): the apron is thrown farther and heavier where the rim stands higher; a mark's by noise
  float brk;
  if ( crater ) {
    float w = 1.0 + 0.08 * ( 0.5 * sin( 3.0 * ang + vShape.x ) + 0.3 * sin( 5.0 * ang + vShape.y ) + 0.2 * sin( 7.0 * ang + vShape.z ) );
    q /= w;
    brk = 1.0 + 0.45 * ( 0.5 * sin( 2.0 * ang + vShape.y ) + 0.3 * sin( 4.0 * ang + vShape.z ) + 0.2 * sin( 6.0 * ang + vShape.x ) );
  } else {
    q *= 1.0 + 0.32 * ( fbm( vec2( ang * 2.2, 0.0 ) + so ) - 0.5 );
    brk = 1.0 + 0.7 * ( fbm( vec2( ang * 1.7, 5.0 ) + so.yx ) - 0.5 );
  }
  // (wave 276: "concentric bullseye rings", "a stamped decal") no zone is a clean circle: the radius the zones read is
  // warped by noise; the disc's own edge is reached by nothing
  float qw = q * ( 1.0 + 0.3 * ( fbm( vDisc * 3.3 + so * 0.7 ) - 0.5 ) );
  vec2 wp = vDisc * ( vSize / rimShare );
  float fine = fbm( wp * 3.0 + so );
  float lumps = fbm( wp * 1.6 + so.yx );
  float rays = fbm( vec2( ang * 7.0, qw * 0.45 ) + so * 0.5 );
  float age = uTime - vInfo.x;
  float fresh = 1.0 - smoothstep( 20.0, 300.0, age );
  vec3 soil = vSoil.rgb;
  int surf = int( vInfo.y + 0.5 );
  vec3 col;
  float a;
  vec3 n = vec3( 0.0, 1.0, 0.0 );
  if ( scar ) {
    // a shaped charge's scar (wave 276: it left a bowl): a small black pit, a star of soot thrown out of it in streaks of
    // different lengths, a scorched halo, a thin scatter of fine soil; no bowl, no rim
    float star = fbm( vec2( ang * 9.0, 1.3 ) + so );
    float streak = ( 1.0 - smoothstep( 0.25, 0.7 + 1.1 * star, qw ) ) * smoothstep( 0.42, 0.62, star );
    float heart = 1.0 - smoothstep( 0.12, 0.38, qw );
    float halo = 1.0 - smoothstep( 0.3, 1.0 + 0.3 * lumps, qw );
    float spray = ( 1.0 - smoothstep( 0.6, min( 2.1, 1.7 * brk ), q ) ) * smoothstep( 0.55, 0.75, lumps * 0.6 + fine * 0.6 );
    float soot = clamp( heart * 0.95 + streak * 0.8 + halo * 0.35, 0.0, 1.0 ) * ( 0.45 + 0.55 * fresh );
    col = mix( soil * ( 0.9 + 0.3 * fine ), vec3( 0.014, 0.012, 0.011 ), soot );
    if ( surf == 2 ) col = mix( col, vec3( 0.42, 0.43, 0.45 ), ( 1.0 - soot ) * 0.5 );
    a = max( soot * 0.95, spray * 0.7 );
  } else {
    // a crater, or an HE round's mark: the pit's moist dark soil, the inner wall and the crest broken soil lit as slopes,
    // and the apron: the soil thrown out in rays and lumps over the ground to ~2.2 R (farther and heavier where the rim
    // stands higher), torn turf on it, clods punched in, a scorch halo round the pit for an explosive, all drying with
    // age (wave 276: "no apron of thrown dark soil, clods or torn turf", "no scorch")
    float pit = 1.0 - smoothstep( 0.45, 0.85, qw );
    float wall = smoothstep( 0.4, 0.85, qw ) * ( 1.0 - smoothstep( 0.85, 1.1, qw ) );
    float crest = smoothstep( 0.85, 1.0, qw ) * ( 1.0 - smoothstep( 1.0, 1.3, qw ) );
    float apronQ = min( 2.25, ( hesh ? 1.7 : 2.2 ) * ( 0.75 + 0.3 * brk ) );
    float apronT = 1.0 - smoothstep( 1.0, apronQ, q );
    float apron = apronT * smoothstep( 0.32, 0.62, rays * 0.65 + lumps * 0.55 + apronT * 0.3 - 0.15 ) * clamp( brk, 0.6, 1.4 );
    vec2 out2 = r > 1e-4 ? vDisc / r : vec2( 0.0 );
    vec3 nWall = normalize( vec3( -out2.x * 0.9, 1.0, -out2.y * 0.9 ) );
    vec3 nFlank = normalize( vec3( out2.x * 0.6, 1.0, out2.y * 0.6 ) );
    n = normalize( mix( vec3( 0.0, 1.0, 0.0 ), wall > crest ? nWall : nFlank, clamp( wall + crest, 0.0, 1.0 ) * ( crater ? 1.0 : 0.5 ) ) );
    // thrown soil: moist and dark when fresh, drying lighter (a late joiner's craters are old)
    vec3 wet = soil * ( 0.85 + 0.3 * fine ), dry = soil * 1.35 + vec3( 0.012, 0.01, 0.006 );
    vec3 thrown = mix( dry, wet, 0.35 + 0.65 * fresh );
    vec3 pitC = soil * ( 0.55 + 0.2 * fine );
    vec3 rimC = thrown * ( 0.95 + 0.25 * lumps );
    if ( surf == 2 ) {
      // snow: dark soil in the pit and on the rim; on the apron soil sprayed over dirty snow lumps (no pale ring)
      vec3 dirty = vec3( 0.46, 0.47, 0.49 );
      thrown = mix( dirty, soil * 1.4, clamp( 0.3 + 0.6 * smoothstep( 0.42, 0.7, rays ) + 0.3 * smoothstep( 0.55, 0.8, lumps ), 0.0, 1.0 ) );
      rimC = mix( soil, dirty, 0.15 );
    }
    col = mix( thrown, rimC, clamp( crest + wall * 0.6, 0.0, 1.0 ) );
    col = mix( col, pitC, pit );
    // torn turf on a vegetated ground's apron: sod thrown upside down (soil, roots, a little grass)
    if ( surf == 0 && explosive > 0.5 ) {
      vec2 tc = wp / 0.65 + so;
      vec2 ti = floor( tc ), tf = fract( tc ) - 0.5;
      float th = h21( ti + 5.3 );
      vec2 toff = vec2( h21( ti + 1.7 ), h21( ti + 9.2 ) ) - 0.5;
      float td = length( ( tf - toff * 0.4 ) * vec2( 1.0, 1.6 ) );
      float turf = step( 0.74, th ) * ( 1.0 - smoothstep( 0.18, 0.3, td ) ) * smoothstep( 1.05, 1.25, qw ) * ( 1.0 - smoothstep( 1.6, 2.0, q ) );
      col = mix( col, mix( soil * 1.2, vec3( 0.045, 0.06, 0.022 ), 0.45 + 0.3 * fine ), turf );
      apron = max( apron, turf * 0.95 );
    }
    // clods punched into the apron: dark dots
    vec2 cellP = wp * 1.4 + so;
    vec2 cellI = floor( cellP ), cellF = fract( cellP ) - 0.5;
    float cellH = h21( cellI + 3.7 );
    vec2 off = vec2( h21( cellI + 11.1 ), h21( cellI + 23.9 ) ) - 0.5;
    float pock = apronT * step( 0.8, cellH ) * ( 1.0 - smoothstep( 0.08, 0.16, length( cellF - off * 0.5 ) ) );
    col = mix( col, soil * 0.45, pock * 0.8 );
    // the scorch: the blast's black heart and a halo of soot streaked out over the rim, weathering
    float halo = ( 1.0 - smoothstep( 0.75, 1.45 + 0.25 * lumps, qw ) ) * smoothstep( 0.35, 0.62, fbm( vec2( ang * 5.0, 2.7 ) + so ) );
    float soot = explosive * ( ( 1.0 - smoothstep( 0.0, 0.6, qw ) ) * 0.7 + halo * ( hesh ? 0.75 : 0.55 ) )
      * ( 0.75 + 0.25 * fine ) * ( 0.35 + 0.65 * fresh );
    col = mix( col, vec3( 0.016, 0.014, 0.012 ), clamp( soot, 0.0, 0.85 ) );
    a = max( max( pit, wall ), crest * 0.97 );
    a = max( a, apron * ( 0.92 - 0.25 * ( 1.0 - fresh ) ) );
    a = max( a, max( pock, soot ) * 0.9 );
    // a faint stain over the whole apron ties its lumps together (broken by the grain: no clean edge)
    a = max( a, apronT * 0.3 * smoothstep( 0.25, 0.6, fine ) );
  }
  a *= vSoil.a * smoothstep( 0.0, 0.35, age );  // the ejecta lands over the first third of a second
  if ( a < 0.01 ) discard;
  float ndl = clamp( dot( n, uSunDir ), 0.0, 1.0 );
  col *= uSunCol * ( 0.35 + 0.65 * ndl ) + uSkyCol;
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( -fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    col = mix( col, fogColor, fogFactor );
  #endif
  // (2026-10-08, the owner's black screens) finite colour only
  if ( !( abs( col.r ) < 6.0e4 && abs( col.g ) < 6.0e4 && abs( col.b ) < 6.0e4 && abs( a ) < 6.0e4 ) ) discard;
  gl_FragColor = vec4( col, a );
}
`;

/** A deforming crater's surface (crater-render-spec §D). */
export interface CraterSurfaceInput {
  x: number; z: number;
  radiusM: number;
  /** the simulation's wobble phases (sim/terrainDeformation.ts craterWobblePhases) */
  p1: number; p2: number; p3: number;
  surface: SurfaceKind;
  climate: CraterClimate;
  explosive: boolean;
  /** the mark's kind (default: HE when explosive, else a gouge) */
  kind?: CraterMarkKind;
  /** 0..1 (the event's 16-bit seed / 65536) */
  seed: number;
  /** its birth on the fx clock (a settled crater: long past) */
  birth: number;
}

export interface CraterMarks {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  /** A deforming crater's surface, draped on `heightAt` (the deformed ground) over its 1.6 R reach. */
  crater(c: CraterSurfaceInput, heightAt: (x: number, z: number) => number): void;
  /** A burst that dug nothing: rim radius (m), the surface and climate, its kind (true: HE, false: a gouge), a seed
   *  0..1, its birth. */
  stamp(x: number, z: number, rimRadiusM: number, surface: SurfaceKind, kind: CraterMarkKind | boolean, seed: number, birth: number,
    groundY: (x: number, z: number) => number, climate?: CraterClimate): void;
  update(now: number, scene: THREE.Scene | null | undefined): void;
  shiftTime(delta: number): void;
  reset(): void;
  /** receipts: slots in use (craters + marks), craters alone */
  readonly count: number;
  readonly craters: number;
}

export function createCraterMarks(): CraterMarks {
  const template = new Float32Array(VERTS * 2);
  for (let ri = 1; ri <= RINGS; ri++) {
    for (let s = 0; s < SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      const rad = ri / RINGS;
      const v = 1 + (ri - 1) * SEG + s;
      template[v * 2] = Math.cos(a) * rad;
      template[v * 2 + 1] = Math.sin(a) * rad;
    }
  }
  const positions = new Float32Array(SLOTS * VERTS * 3);
  const disc = new Float32Array(SLOTS * VERTS * 2);
  const info = new Float32Array(SLOTS * VERTS * 4).fill(-1e9);
  const shapes = new Float32Array(SLOTS * VERTS * 4);
  const soils = new Float32Array(SLOTS * VERTS * 4);
  const sizes = new Float32Array(SLOTS * VERTS);
  const index: number[] = [];
  for (let c = 0; c < SLOTS; c++) {
    const base = c * VERTS;
    for (let v = 0; v < VERTS; v++) { disc[(base + v) * 2] = template[v * 2]; disc[(base + v) * 2 + 1] = template[v * 2 + 1]; }
    for (let s = 0; s < SEG; s++) index.push(base, base + 1 + (s + 1) % SEG, base + 1 + s);
    for (let ri = 1; ri < RINGS; ri++) {
      const a0 = base + 1 + (ri - 1) * SEG, b0 = base + 1 + ri * SEG;
      for (let s = 0; s < SEG; s++) {
        const s1 = (s + 1) % SEG;
        index.push(a0 + s, b0 + s1, b0 + s, a0 + s, a0 + s1, b0 + s1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(positions, 3);
  pos.setUsage(THREE.DynamicDrawUsage);
  const inf = new THREE.BufferAttribute(info, 4);
  inf.setUsage(THREE.DynamicDrawUsage);
  const shp = new THREE.BufferAttribute(shapes, 4);
  shp.setUsage(THREE.DynamicDrawUsage);
  const sol = new THREE.BufferAttribute(soils, 4);
  sol.setUsage(THREE.DynamicDrawUsage);
  const siz = new THREE.BufferAttribute(sizes, 1);
  siz.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pos);
  geo.setAttribute('aDisc', new THREE.BufferAttribute(disc, 2));
  geo.setAttribute('aInfo', inf);
  geo.setAttribute('aShape', shp);
  geo.setAttribute('aSoil', sol);
  geo.setAttribute('aSize', siz);
  geo.setIndex(index);
  geo.setDrawRange(0, 0);
  const uTime = { value: 0 };
  const uSunDir = { value: new THREE.Vector3(0.527, 0.574, -0.627).normalize() };
  const uSunCol = { value: new THREE.Vector3(1.3, 1.25, 1.15) };
  const uSkyCol = { value: new THREE.Vector3(0.3, 0.32, 0.36) };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), { uTime, uSunDir, uSunCol, uSkyCol }),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    side: THREE.DoubleSide,
    fog: true,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'fx-crater-marks';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = 2.5; // after the terrain and the wreck scorch, before every particle
  mesh.visible = false;   // out of the render list until the first mark
  // a whole upload (the first, a reset, a clock rebase) is never cut short by a stamp's range written before the
  // renderer gets to it (three uploads only the ranges when there are any): a reset's cleared slots would otherwise
  // keep the last match's craters on the GPU in the fixed crater region
  const attrs = [pos, inf, shp, sol, siz];
  let wholePending = true;
  pos.onUpload(() => { wholePending = false; });
  const whole = (): void => { wholePending = true; for (const a of attrs) { a.clearUpdateRanges(); a.needsUpdate = true; } };
  let craterCursor = 0, craterCount = 0;
  let markCursor = 0, markCount = 0;
  let highest = -1;
  const soil: [number, number, number, number] = [0, 0, 0, 0];

  function write(slot: number, x: number, z: number, radius: number, yaw: number, heightAt: (x: number, z: number) => number,
    lift: number, birth: number, surfaceIndex: number, kind: number, seed: number,
    p1: number, p2: number, p3: number, rimShare: number, rimM: number): void {
    const base = slot * VERTS;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    for (let v = 0; v < VERTS; v++) {
      const lx = template[v * 2], lz = template[v * 2 + 1];
      const wx = x + (lx * cy - lz * sy) * radius;
      const wz = z + (lx * sy + lz * cy) * radius;
      const o = (base + v) * 3;
      positions[o] = wx; positions[o + 1] = heightAt(wx, wz) + lift; positions[o + 2] = wz;
      const q = (base + v) * 4;
      info[q] = birth; info[q + 1] = surfaceIndex; info[q + 2] = kind; info[q + 3] = seed;
      shapes[q] = p1; shapes[q + 1] = p2; shapes[q + 2] = p3; shapes[q + 3] = rimShare;
      soils[q] = soil[0]; soils[q + 1] = soil[1]; soils[q + 2] = soil[2]; soils[q + 3] = soil[3];
      sizes[base + v] = rimM;
    }
    if (!wholePending) {
      pos.addUpdateRange(base * 3, VERTS * 3);
      inf.addUpdateRange(base * 4, VERTS * 4);
      shp.addUpdateRange(base * 4, VERTS * 4);
      sol.addUpdateRange(base * 4, VERTS * 4);
      siz.addUpdateRange(base, VERTS);
    }
    pos.needsUpdate = inf.needsUpdate = shp.needsUpdate = sol.needsUpdate = siz.needsUpdate = true;
    if (slot > highest) highest = slot;
    geo.setDrawRange(0, (highest + 1) * INDICES_PER_SLOT);
    mesh.visible = true;
  }

  return {
    mesh,
    crater(c, heightAt) {
      const slot = craterCursor;
      craterCursor = (craterCursor + 1) % CRATER_SLOTS;
      craterCount = Math.min(CRATER_SLOTS, craterCount + 1);
      craterSoil(c.surface, c.climate, soil);
      // world-aligned (no yaw): the shader's angle is the simulation's atan2(dz, dx)
      const kind = c.kind ?? (c.explosive ? 'he' : 'gouge');
      write(slot, c.x, c.z, c.radiusM * CRATER_REACH, 0, heightAt, 0.05, c.birth, SURFACE_INDEX[c.surface], KIND_INDEX[kind], c.seed,
        c.p1, c.p2, c.p3, 1 / CRATER_REACH, c.radiusM);
    },
    stamp(x, z, rimRadiusM, surface, kind, seed, birth, groundY, climate = 'vegetated') {
      const slot = CRATER_SLOTS + markCursor;
      markCursor = (markCursor + 1) % MARK_SLOTS;
      markCount = Math.min(MARK_SLOTS, markCount + 1);
      craterSoil(surface, climate, soil);
      const k: CraterMarkKind = kind === true ? 'he' : kind === false ? 'gouge' : kind;
      write(slot, x, z, rimRadiusM * MARK_REACH, seed * Math.PI * 2, groundY, 0.04, birth, SURFACE_INDEX[surface], KIND_INDEX[k], seed,
        0, 0, 0, 0, rimRadiusM);
    },
    update(now, scene) {
      uTime.value = now;
      if (highest < 0) return;
      const ud = scene?.userData as { sunDirWorld?: THREE.Vector3; lightRig?: { sunIntensity?: number; sunColor?: THREE.Color;
        hemiIntensity?: number; hemiSky?: THREE.Color } } | undefined;
      const sd = ud?.sunDirWorld;
      if (sd && sd.lengthSq() > 1e-8) uSunDir.value.copy(sd).normalize();
      const rig = ud?.lightRig;
      if (rig) {
        const si = (rig.sunIntensity ?? 4.5) / Math.PI;
        const sc = rig.sunColor;
        uSunCol.value.set(sc ? sc.r * si : si, sc ? sc.g * si : si, sc ? sc.b * si : si);
        const hi = (rig.hemiIntensity ?? 0.4) * 1.6 / Math.PI;
        const sky = rig.hemiSky;
        uSkyCol.value.set(sky ? sky.r * hi : hi, sky ? sky.g * hi : hi, sky ? sky.b * hi : hi);
      }
    },
    shiftTime(delta) {
      for (let i = 0; i < info.length; i += 4) if (info[i] > -1e8) info[i] += delta;
      whole();
    },
    reset() {
      info.fill(-1e9);
      positions.fill(0);
      whole();
      craterCursor = craterCount = markCursor = markCount = 0;
      highest = -1;
      geo.setDrawRange(0, 0);
      mesh.visible = false;
    },
    get count() { return craterCount + markCount; },
    get craters() { return craterCount; },
  };
}
