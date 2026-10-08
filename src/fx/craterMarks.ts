/**
 * craterMarks.ts — the ground a blast leaves behind (destruction-fx lane, 2026-10-07; crater-render-spec §D).
 *
 * Two kinds of mark in one draw:
 *
 *  - CRATERS: a deforming crater the core dug (terrain:crater). The ground lane moves the terrain into the bowl; this
 *    lays the crater's own surface over it — scorched, churned soil darkest in the bowl, broken soil on the rim, the
 *    ejecta blanket thinning to 1.6 R — draped on the deformed ground (base + the bound overlay, the same frame the
 *    mesh follows), with the edge ragged by the simulation's own wobble (craterWobblePhases: the decal's rim follows the
 *    bowl's). 160 slots, kept for the match (the simulation's own cap).
 *  - MARKS: a burst that dug nothing (small rounds, hard ground, past the caps, craters off): the same look at its
 *    size, flat on the ground, a seeded ragged outline. 96 slots, the oldest recycled first.
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
/** A mark's disc reaches 2.4 rim radii (its ejecta); a crater's 1.6 R (the simulation's reach). */
const MARK_REACH = 2.4;
const CRATER_REACH = 1.6;

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
attribute vec4 aInfo;   // birth, surface index, explosive (0/1), seed (0..1)
attribute vec4 aShape;  // wobble phases p1, p2, p3 (a crater) and its rim's share of the disc (0: a mark)
attribute vec4 aSoil;   // the turned soil (linear rgb), cover
attribute vec2 aDisc;   // disc coordinates (-1..1, scaled to the disc's reach)
uniform float uTime;
varying vec2 vDisc;
varying vec4 vInfo;
varying vec4 vShape;
varying vec4 vSoil;
#ifdef USE_FOG
  varying float vFogDepth;
#endif
void main() {
  vDisc = aDisc;
  vInfo = aInfo;
  vShape = aShape;
  vSoil = aSoil;
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
  float ang = atan( vDisc.y, vDisc.x );
  bool crater = vShape.w > 0.0;
  // q: the distance in rim radii (the rim at 1), ragged: a crater by the simulation's own wobble (the bowl's edge), a
  // mark by a seeded noise
  float rimShare = crater ? vShape.w : ${(1 / MARK_REACH).toFixed(5)};
  float reachQ = 1.0 / rimShare;
  float q = r / rimShare;
  if ( crater ) {
    float w = 1.0 + 0.08 * ( 0.5 * sin( 3.0 * ang + vShape.x ) + 0.3 * sin( 5.0 * ang + vShape.y ) + 0.2 * sin( 7.0 * ang + vShape.z ) );
    q /= w;
  } else {
    q *= 1.0 + 0.32 * ( fbm( vec2( ang * 2.2, 0.0 ) + so ) - 0.5 );
  }
  if ( q > reachQ ) discard;
  float fine = fbm( vDisc * 9.0 + so );
  float clumps = fbm( vDisc * 18.0 + so.yx );
  float rays = fbm( vec2( ang * 5.0, q * 0.6 ) + so * 0.5 );
  int kind = int( vInfo.y + 0.5 );
  float explosive = vInfo.z;
  // profile in rim radii: the pit's floor, the inner wall, the rim's crest, its outer flank, the ejecta blanket (to the
  // disc's reach), the churned surface's ragged edge at 1.15
  float pit = 1.0 - smoothstep( 0.42, 0.8, q );
  float wall = smoothstep( 0.38, 0.8, q ) * ( 1.0 - smoothstep( 0.8, 1.05, q ) );
  float crest = smoothstep( 0.8, 1.0, q ) * ( 1.0 - smoothstep( 1.0, 1.32, q ) );
  float churn = 1.0 - smoothstep( 1.05, 1.15 + 0.12 * ( clumps - 0.5 ), q );
  float blanket = 1.0 - smoothstep( 1.08, reachQ, q );
  float ejecta = blanket * smoothstep( 0.42, 0.75, rays * 0.6 + clumps * 0.6 ) * ( 0.55 + 0.45 * smoothstep( 0.4, 0.7, fine ) );
  // the rim lit as a slope: the inner wall faces the centre, the crest's outer flank faces out
  vec2 out2 = r > 1e-4 ? vDisc / r : vec2( 0.0 );
  vec3 nWall = normalize( vec3( -out2.x * 0.9, 1.0, -out2.y * 0.9 ) );
  vec3 nFlank = normalize( vec3( out2.x * 0.6, 1.0, out2.y * 0.6 ) );
  vec3 n = normalize( mix( vec3( 0.0, 1.0, 0.0 ), wall > crest ? nWall : nFlank, clamp( wall + crest, 0.0, 1.0 ) ) );
  float ndl = clamp( dot( n, uSunDir ), 0.0, 1.0 );
  // the place's turned soil: the pit darkest and wettest, the rim broken soil, the ejecta the soil itself
  vec3 soil = vSoil.rgb;
  vec3 pitC = soil * 0.38, rimC = soil * 0.72, ejC = soil;
  if ( kind == 2 ) ejC = vec3( 0.32, 0.33, 0.35 ); // snow: dark soil in the bowl and on the rim, white powder thrown out
  vec3 col = mix( ejC, rimC, clamp( crest + wall * 0.6 + churn * 0.35, 0.0, 1.0 ) );
  col = mix( col, pitC, pit );
  col *= 0.75 + 0.5 * fine;
  // soot: the blast's black heart and streaks along the rays
  float soot = explosive * ( pit * 0.85 + wall * 0.6 + smoothstep( 0.55, 0.8, rays ) * blanket * 0.55 ) * ( 0.7 + 0.3 * fine );
  col = mix( col, vec3( 0.007, 0.006, 0.005 ), clamp( soot, 0.0, 0.88 ) );
  float a = max( max( pit, wall ), max( max( crest * 0.95, churn * 0.9 ), ejecta * 0.85 ) );
  a = max( a, blanket * ( 0.18 + 0.22 * explosive ) * smoothstep( 0.3, 0.6, fine ) );
  a *= vSoil.a * smoothstep( 0.0, 0.35, uTime - vInfo.x );  // the ejecta lands over the first third of a second
  if ( a < 0.01 ) discard;
  col *= uSunCol * ( 0.35 + 0.65 * ndl ) + uSkyCol;
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( -fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    col = mix( col, fogColor, fogFactor );
  #endif
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
  /** 0..1 (the event's 16-bit seed / 65536) */
  seed: number;
  /** its birth on the fx clock (a settled crater: long past) */
  birth: number;
}

export interface CraterMarks {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  /** A deforming crater's surface, draped on `heightAt` (the deformed ground) over its 1.6 R reach. */
  crater(c: CraterSurfaceInput, heightAt: (x: number, z: number) => number): void;
  /** A burst that dug nothing: rim radius (m), the surface and climate, explosive (soot), a seed 0..1, its birth. */
  stamp(x: number, z: number, rimRadiusM: number, surface: SurfaceKind, explosive: boolean, seed: number, birth: number,
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
  geo.setAttribute('position', pos);
  geo.setAttribute('aDisc', new THREE.BufferAttribute(disc, 2));
  geo.setAttribute('aInfo', inf);
  geo.setAttribute('aShape', shp);
  geo.setAttribute('aSoil', sol);
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
  let craterCursor = 0, craterCount = 0;
  let markCursor = 0, markCount = 0;
  let highest = -1;
  const soil: [number, number, number, number] = [0, 0, 0, 0];

  function write(slot: number, x: number, z: number, radius: number, yaw: number, heightAt: (x: number, z: number) => number,
    lift: number, birth: number, surfaceIndex: number, explosive: boolean, seed: number,
    p1: number, p2: number, p3: number, rimShare: number): void {
    const base = slot * VERTS;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    for (let v = 0; v < VERTS; v++) {
      const lx = template[v * 2], lz = template[v * 2 + 1];
      const wx = x + (lx * cy - lz * sy) * radius;
      const wz = z + (lx * sy + lz * cy) * radius;
      const o = (base + v) * 3;
      positions[o] = wx; positions[o + 1] = heightAt(wx, wz) + lift; positions[o + 2] = wz;
      const q = (base + v) * 4;
      info[q] = birth; info[q + 1] = surfaceIndex; info[q + 2] = explosive ? 1 : 0; info[q + 3] = seed;
      shapes[q] = p1; shapes[q + 1] = p2; shapes[q + 2] = p3; shapes[q + 3] = rimShare;
      soils[q] = soil[0]; soils[q + 1] = soil[1]; soils[q + 2] = soil[2]; soils[q + 3] = soil[3];
    }
    pos.addUpdateRange(base * 3, VERTS * 3);
    inf.addUpdateRange(base * 4, VERTS * 4);
    shp.addUpdateRange(base * 4, VERTS * 4);
    sol.addUpdateRange(base * 4, VERTS * 4);
    pos.needsUpdate = inf.needsUpdate = shp.needsUpdate = sol.needsUpdate = true;
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
      write(slot, c.x, c.z, c.radiusM * CRATER_REACH, 0, heightAt, 0.05, c.birth, SURFACE_INDEX[c.surface], c.explosive, c.seed,
        c.p1, c.p2, c.p3, 1 / CRATER_REACH);
    },
    stamp(x, z, rimRadiusM, surface, explosive, seed, birth, groundY, climate = 'vegetated') {
      const slot = CRATER_SLOTS + markCursor;
      markCursor = (markCursor + 1) % MARK_SLOTS;
      markCount = Math.min(MARK_SLOTS, markCount + 1);
      craterSoil(surface, climate, soil);
      write(slot, x, z, rimRadiusM * MARK_REACH, seed * Math.PI * 2, groundY, 0.04, birth, SURFACE_INDEX[surface], explosive, seed,
        0, 0, 0, 0);
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
      inf.clearUpdateRanges();
      inf.addUpdateRange(0, info.length);
      inf.needsUpdate = true;
    },
    reset() {
      info.fill(-1e9);
      positions.fill(0);
      inf.clearUpdateRanges(); inf.needsUpdate = true;
      pos.clearUpdateRanges(); pos.needsUpdate = true;
      craterCursor = craterCount = markCursor = markCount = 0;
      highest = -1;
      geo.setDrawRange(0, 0);
      mesh.visible = false;
    },
    get count() { return craterCount + markCount; },
    get craters() { return craterCount; },
  };
}
