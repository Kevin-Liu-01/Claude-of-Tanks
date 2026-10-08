/**
 * craterMarks.ts — the ground a blast leaves behind: the pit of turned earth, the rim of thrown soil, the ejecta
 * spread around it and, for an explosive, soot (destruction-fx lane, 2026-10-07).
 *
 * One draw for every crater: a ring of disc slots in one dynamic buffer, each disc draped over the terrain when it is
 * stamped (the core's deformed ground, when the crater moved it, is what groundY reads). The look is procedural in the
 * shader (no texture): a seeded ragged outline, the pit darker and wetter than the rim, the rim's lip catching the
 * sun on the side facing it and shadowed on the other, ejecta clumps and rays thinning outward, the surface's own
 * colours (dark soil on snow, darker sand, black mud, grey chips on rock and road) and, for explosives, soot.
 *
 * Craters persist for the match (a full ring replaces the oldest first, so the field keeps the latest 96). No per-frame
 * work: a stamp uploads its own slot, nothing else ever changes.
 */
import * as THREE from 'three';
import type { SurfaceKind } from './surfaceLooks.ts';

const SLOTS = 96;
const SEG = 20;
const RINGS = 3;
const VERTS = 1 + SEG * RINGS;
/** a centre fan plus (RINGS - 1) quad rings */
const INDICES_PER_SLOT = SEG * 3 + (RINGS - 1) * SEG * 6;

/** Surface index the shader knows. */
const SURFACE_INDEX: Readonly<Record<SurfaceKind, number>> = Object.freeze({
  soil: 0, sand: 1, snow: 2, mud: 3, rock: 4, concrete: 4, water: 0, wood: 0, metal: 4,
});

const VERT = /* glsl */ `
attribute vec4 aInfo;   // birth, surface index, explosive (0/1), seed
attribute vec2 aDisc;   // disc coordinates (-1..1, scaled to the ejecta reach)
uniform float uTime;
varying vec2 vDisc;
varying vec4 vInfo;
varying vec3 vWorld;
#ifdef USE_FOG
  varying float vFogDepth;
#endif
void main() {
  vDisc = aDisc;
  vInfo = aInfo;
  vWorld = position;
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
varying vec3 vWorld;
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
  // the disc spans the ejecta reach: the rim sits at r ~ 0.42, the pit inside 0.3
  float r = length( vDisc );
  float ang = atan( vDisc.y, vDisc.x );
  float edge = fbm( vec2( ang * 2.2, 0.0 ) + so ) - 0.5;
  float rr = r * ( 1.0 + 0.32 * edge );
  if ( rr > 1.0 ) discard;
  float fine = fbm( vDisc * 9.0 + so );
  float clumps = fbm( vDisc * 18.0 + so.yx );
  float rays = fbm( vec2( ang * 5.0, r * 1.5 ) + so * 0.5 );
  int kind = int( vInfo.y + 0.5 );
  float explosive = vInfo.z;
  // profile: pit floor, the inner wall, the rim's crest, its outer flank, the ejecta blanket
  float pit = 1.0 - smoothstep( 0.18, 0.34, rr );
  float wall = smoothstep( 0.16, 0.34, rr ) * ( 1.0 - smoothstep( 0.34, 0.44, rr ) );
  float crest = smoothstep( 0.34, 0.42, rr ) * ( 1.0 - smoothstep( 0.42, 0.56, rr ) );
  float blanket = ( 1.0 - smoothstep( 0.45, 1.0, rr ) );
  float ejecta = blanket * smoothstep( 0.42, 0.75, rays * 0.6 + clumps * 0.6 ) * ( 0.55 + 0.45 * smoothstep( 0.4, 0.7, fine ) );
  // the rim lit as a slope: the inner wall faces the centre, the crest's outer flank faces out
  vec2 out2 = r > 1e-4 ? vDisc / r : vec2( 0.0 );
  vec3 nWall = normalize( vec3( -out2.x * 0.9, 1.0, -out2.y * 0.9 ) );
  vec3 nFlank = normalize( vec3( out2.x * 0.6, 1.0, out2.y * 0.6 ) );
  vec3 n = normalize( mix( vec3( 0.0, 1.0, 0.0 ), wall > crest ? nWall : nFlank, clamp( wall + crest, 0.0, 1.0 ) ) );
  float ndl = clamp( dot( n, uSunDir ), 0.0, 1.0 );
  // colours of the turned ground (linear): soil, sand, snow (soil through powder), mud, rock / road / metal
  vec3 pitC = vec3( 0.026, 0.02, 0.014 ), rimC = vec3( 0.05, 0.039, 0.027 ), ejC = vec3( 0.068, 0.054, 0.038 );
  float cover = 0.95;
  if ( kind == 1 ) { pitC = vec3( 0.15, 0.115, 0.075 ); rimC = vec3( 0.22, 0.17, 0.11 ); ejC = vec3( 0.29, 0.23, 0.155 ); cover = 0.8; }
  else if ( kind == 2 ) { pitC = vec3( 0.03, 0.025, 0.02 ); rimC = vec3( 0.075, 0.065, 0.055 ); ejC = vec3( 0.32, 0.33, 0.35 ); cover = 0.92; }
  else if ( kind == 3 ) { pitC = vec3( 0.013, 0.011, 0.008 ); rimC = vec3( 0.027, 0.022, 0.016 ); ejC = vec3( 0.038, 0.031, 0.022 ); cover = 0.97; }
  else if ( kind == 4 ) { pitC = vec3( 0.035, 0.034, 0.032 ); rimC = vec3( 0.075, 0.072, 0.068 ); ejC = vec3( 0.12, 0.116, 0.11 ); cover = 0.78; }
  vec3 col = mix( ejC, rimC, clamp( crest + wall * 0.6, 0.0, 1.0 ) );
  col = mix( col, pitC, pit );
  col *= 0.75 + 0.5 * fine;
  // soot: the blast's black heart and streaks along the rays
  float soot = explosive * ( pit * 0.85 + wall * 0.6 + smoothstep( 0.55, 0.8, rays ) * blanket * 0.55 ) * ( 0.7 + 0.3 * fine );
  col = mix( col, vec3( 0.007, 0.006, 0.005 ), clamp( soot, 0.0, 0.88 ) );
  float a = max( max( pit, wall ), max( crest * 0.95, ejecta * 0.85 ) );
  a = max( a, blanket * ( 0.18 + 0.22 * explosive ) * smoothstep( 0.3, 0.6, fine ) );
  a *= cover * smoothstep( 0.0, 0.35, uTime - vInfo.x );  // the ejecta lands over the first third of a second
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

export interface CraterMarks {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  /** Stamp a crater: rim radius (m), the surface, explosive (soot), a seed 0..1, its birth on the fx clock. */
  stamp(x: number, z: number, rimRadiusM: number, surface: SurfaceKind, explosive: boolean, seed: number, birth: number,
    groundY: (x: number, z: number) => number): void;
  update(now: number, scene: THREE.Scene | null | undefined): void;
  shiftTime(delta: number): void;
  reset(): void;
  readonly count: number;
}

export function createCraterMarks(): CraterMarks {
  // template: centre + RINGS rings, the outer ring at the ejecta reach (2.4 x the rim radius)
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
  geo.setAttribute('position', pos);
  geo.setAttribute('aDisc', new THREE.BufferAttribute(disc, 2));
  geo.setAttribute('aInfo', inf);
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
  mesh.visible = false;   // out of the render list until the first crater
  let cursor = 0;
  let used = 0;
  const REACH = 2.4;
  return {
    mesh,
    stamp(x, z, rimRadiusM, surface, explosive, seed, birth, groundY) {
      const c = cursor;
      cursor = (cursor + 1) % SLOTS;
      used = Math.min(SLOTS, used + 1);
      const base = c * VERTS;
      const p = positions;
      const yaw = seed * Math.PI * 2;
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const radius = rimRadiusM * REACH;
      for (let v = 0; v < VERTS; v++) {
        const lx = template[v * 2], lz = template[v * 2 + 1];
        const wx = x + (lx * cy - lz * sy) * radius;
        const wz = z + (lx * sy + lz * cy) * radius;
        const o = (base + v) * 3;
        p[o] = wx; p[o + 1] = groundY(wx, wz) + 0.04; p[o + 2] = wz;
        const q = (base + v) * 4;
        info[q] = birth; info[q + 1] = SURFACE_INDEX[surface]; info[q + 2] = explosive ? 1 : 0; info[q + 3] = seed;
      }
      pos.addUpdateRange(base * 3, VERTS * 3);
      inf.addUpdateRange(base * 4, VERTS * 4);
      pos.needsUpdate = true;
      inf.needsUpdate = true;
      geo.setDrawRange(0, used * INDICES_PER_SLOT);
      mesh.visible = true;
    },
    update(now, scene) {
      uTime.value = now;
      if (!used) return;
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
      inf.clearUpdateRanges();
      inf.needsUpdate = true;
      cursor = 0;
      used = 0;
      geo.setDrawRange(0, 0);
      mesh.visible = false;
    },
    get count() { return used; },
  };
}
