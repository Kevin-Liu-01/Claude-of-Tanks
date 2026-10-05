/**
 * combat/clods.ts — thrown clods, chips and chunks in the ground's own colour (combat-fx lane, 2026-10-05).
 *
 * The battle debris pool (particles.ts) draws charred metal shards with an ember glow — right for wreckage, wrong
 * for soil. A shell striking the ground throws CLODS of the ground it hit: dark earth, pale sand clumps, snow chunks,
 * black mud, grey rock chips. Same GPU law as the debris (ballistic flight with a light drag, tumbling, a hard stop on
 * the ground with the spin bled off), a per-chunk albedo, and the scene rig's sun and sky light. Opaque, drawn in the
 * world pass like the debris.
 */
import * as THREE from 'three';
import { mulberry32 } from '../particles.ts';

export interface ClodRecord {
  px: number; py: number; pz: number; birthOffset: number;
  vx: number; vy: number; vz: number; life: number;
  ax: number; ay: number; az: number; spin: number;
  /** restY: the ground height where the chunk lands; landS: its flight time (see landClod) */
  scale: number; restY: number; seed: number; landS: number;
  r: number; g: number; b: number; wet: number;
}

export function makeClodRecord(): ClodRecord {
  return { px: 0, py: 0, pz: 0, birthOffset: 0, vx: 0, vy: 0, vz: 0, life: 2, ax: 0, ay: 1, az: 0, spin: 8,
    scale: 0.12, restY: 0, seed: 0, landS: 1, r: 0.05, g: 0.04, b: 0.03, wet: 0 };
}

/** The flight law the clod shader integrates (drag k on the launch velocity, gravity G). */
export const CLOD_DRAG = 0.35;
export const CLOD_GRAVITY = 9.8;

/**
 * Fly the chunk on the shader's own law against the ground under it (8 ms steps) and record where and when it lands:
 * it stops dead there (no sliding, no spinning in place) and its resting height is the ground AT the landing point.
 */
export function landClod(o: ClodRecord, groundY: (x: number, z: number) => number): void {
  const k = CLOD_DRAG;
  let t = 0;
  for (let step = 0; step < 600; step++) {
    t += 0.008;
    const s = (1 - Math.exp(-k * t)) / k;
    const x = o.px + o.vx * s, z = o.pz + o.vz * s;
    const y = o.py + o.vy * s - 0.5 * CLOD_GRAVITY * t * t;
    const vy = o.vy * Math.exp(-k * t) - CLOD_GRAVITY * t;
    const g = groundY(x, z);
    if (vy < 0 && y <= g + o.scale * 0.35) { o.landS = t; o.restY = g; return; }
  }
  o.landS = t; o.restY = groundY(o.px, o.pz);
}

const CLOD_VERT = /* glsl */ `
attribute vec4 aPB;   // origin.xyz, birth
attribute vec4 aVL;   // vel.xyz, life
attribute vec4 aAR;   // spin axis.xyz, spin rate
attribute vec4 aSG;   // scale, rest height, seed, landing time (s)
attribute vec4 aCL;   // albedo.rgb, wetness
uniform float uTime;
varying vec3 vNormalW;
varying vec4 vAlbedo;
varying float vFade;
#ifdef USE_FOG
  varying float vFogDepth;
#endif
mat3 axisAngle( vec3 a, float ang ) {
  float c = cos( ang ), s = sin( ang ), ic = 1.0 - c;
  return mat3(
    ic*a.x*a.x + c,     ic*a.x*a.y + a.z*s, ic*a.x*a.z - a.y*s,
    ic*a.x*a.y - a.z*s, ic*a.y*a.y + c,     ic*a.y*a.z + a.x*s,
    ic*a.x*a.z + a.y*s, ic*a.y*a.z - a.x*s, ic*a.z*a.z + c );
}
void main() {
  float life = aVL.w;
  float age = uTime - aPB.w;
  if ( life <= 0.0 || age < 0.0 || age > life ) {
    vNormalW = vec3( 0.0, 1.0, 0.0 ); vAlbedo = vec4( 0.0 ); vFade = 0.0;
    gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
    #ifdef USE_FOG
      vFogDepth = 1.0;
    #endif
    return;
  }
  // flight until the recorded landing, then a dead stop on the ground there (CLOD_DRAG / CLOD_GRAVITY)
  float te = min( age, aSG.w );
  float s = ( 1.0 - exp( -0.35 * te ) ) / 0.35;
  vec3 center = aPB.xyz + aVL.xyz * s + vec3( 0.0, -4.9 * te * te, 0.0 );
  if ( age >= aSG.w ) center.y = aSG.y + aSG.x * 0.35;
  float h1 = fract( aSG.z * 37.719 ), h2 = fract( aSG.z * 61.113 ), h3 = fract( aSG.z * 91.537 );
  float spin = aAR.w * te;
  mat3 rot = axisAngle( normalize( aAR.xyz + vec3( 1e-4 ) ), spin );
  // the last fifth of life the chunk sinks into the ground and shrinks away (no popping)
  float t = age / life;
  float fade = 1.0 - smoothstep( 0.8, 1.0, t );
  vec3 lp = position * vec3( 0.7 + h1 * 0.7, 0.5 + h2 * 0.6, 0.7 + h3 * 0.7 );
  vec3 wpos = center + rot * ( lp * aSG.x * fade ) - vec3( 0.0, ( 1.0 - fade ) * aSG.x * 0.5, 0.0 );
  vNormalW = rot * normal;
  vAlbedo = aCL;
  vFade = fade;
  vec4 mvPosition = viewMatrix * vec4( wpos, 1.0 );
  #ifdef USE_FOG
    vFogDepth = -mvPosition.z;
  #endif
  gl_Position = projectionMatrix * mvPosition;
}
`;

const CLOD_FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform vec3 uGroundCol;
varying vec3 vNormalW;
varying vec4 vAlbedo;
varying float vFade;
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
void main() {
  if ( vFade <= 0.001 ) discard;
  vec3 n = normalize( vNormalW );
  float ndl = max( dot( n, uSunDir ), 0.0 );
  vec3 amb = mix( uGroundCol, uSkyCol, n.y * 0.5 + 0.5 );
  vec3 col = vAlbedo.rgb * ( uSunCol * ndl + amb );
  // wet clods (mud, water-logged soil) keep a dull sheen on their sun-facing facets
  col += uSunCol * vAlbedo.a * 0.08 * pow( ndl, 8.0 );
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( -fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    col = mix( col, fogColor, fogFactor );
  #endif
  gl_FragColor = vec4( col, 1.0 );
}
`;

/** Irregular low-poly lump: a corner-displaced icosahedron, flat-shaded (hard facet normals). */
function makeClodGeometry(seed: number): THREE.BufferGeometry {
  const rng = mulberry32((seed ^ 0x0c10d5) | 0);
  const ico = new THREE.IcosahedronGeometry(0.5, 0);
  const pos = ico.getAttribute('position');
  const disp = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}`;
    let m = disp.get(key);
    if (m === undefined) { m = 0.62 + rng() * 0.75; disp.set(key, m); }
    pos.setXYZ(i, x * m, y * m, z * m);
  }
  // PolyhedronGeometry is already non-indexed: per-face normals are hard facets
  ico.computeVertexNormals();
  return ico;
}

const CLOD_ATTRS = ['aPB', 'aVL', 'aAR', 'aSG', 'aCL'] as const;
type ClodAttr = typeof CLOD_ATTRS[number];

export class ClodPool {
  readonly capacity: number;
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly attrs: Record<ClodAttr, THREE.InstancedBufferAttribute>;
  private readonly arrays: Record<ClodAttr, Float32Array>;
  private cursor = 0;
  private highWater = 0;
  private dirtyLo = -1;
  private dirtyHi = -1;

  constructor(capacity: number, seed: number, uniforms: Record<string, THREE.IUniform>) {
    this.capacity = capacity;
    const base = makeClodGeometry(seed);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('normal', base.getAttribute('normal'));
    geo.instanceCount = 0;
    const attrs = {} as Record<ClodAttr, THREE.InstancedBufferAttribute>;
    const arrays = {} as Record<ClodAttr, Float32Array>;
    for (const key of CLOD_ATTRS) {
      const array = new Float32Array(capacity * 4);
      const attr = new THREE.InstancedBufferAttribute(array, 4);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(key, attr);
      attrs[key] = attr; arrays[key] = array;
    }
    this.attrs = attrs; this.arrays = arrays; this.geometry = geo;
    const material = new THREE.ShaderMaterial({
      vertexShader: CLOD_VERT,
      fragmentShader: CLOD_FRAG,
      uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uniforms),
      fog: true,
    });
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.name = 'Combat clods';
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
  }

  emit(o: ClodRecord, now: number): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    if (i + 1 > this.highWater) { this.highWater = i + 1; this.geometry.instanceCount = this.highWater; }
    const j = i * 4, A = this.arrays;
    let a = A.aPB; a[j] = o.px; a[j + 1] = o.py; a[j + 2] = o.pz; a[j + 3] = now + o.birthOffset;
    a = A.aVL; a[j] = o.vx; a[j + 1] = o.vy; a[j + 2] = o.vz; a[j + 3] = o.life;
    a = A.aAR; a[j] = o.ax; a[j + 1] = o.ay; a[j + 2] = o.az; a[j + 3] = o.spin;
    a = A.aSG; a[j] = o.scale; a[j + 1] = o.restY; a[j + 2] = o.seed; a[j + 3] = o.landS;
    a = A.aCL; a[j] = o.r; a[j + 1] = o.g; a[j + 2] = o.b; a[j + 3] = o.wet;
    if (this.dirtyLo < 0) { this.dirtyLo = i; this.dirtyHi = i + 1; }
    else { this.dirtyLo = Math.min(this.dirtyLo, i); this.dirtyHi = Math.max(this.dirtyHi, i + 1); }
  }

  flush(): void {
    if (this.dirtyLo < 0) return;
    for (const key of CLOD_ATTRS) {
      const attr = this.attrs[key];
      attr.addUpdateRange(this.dirtyLo * 4, (this.dirtyHi - this.dirtyLo) * 4);
      attr.needsUpdate = true;
    }
    this.dirtyLo = this.dirtyHi = -1;
  }

  shiftTime(delta: number): void {
    const pb = this.arrays.aPB, vl = this.arrays.aVL;
    for (let i = 0; i < this.highWater; i++) if (vl[i * 4 + 3] > 0) pb[i * 4 + 3] += delta;
    const attr = this.attrs.aPB;
    attr.clearUpdateRanges();
    attr.addUpdateRange(0, this.highWater * 4);
    attr.needsUpdate = true;
  }

  reset(): void {
    const vl = this.arrays.aVL;
    for (let i = 0; i < this.capacity; i++) vl[i * 4 + 3] = 0;
    const attr = this.attrs.aVL;
    attr.clearUpdateRanges();
    attr.needsUpdate = true;
    this.cursor = 0; this.highWater = 0; this.geometry.instanceCount = 0;
    this.dirtyLo = this.dirtyHi = -1;
  }

  get count(): number { return this.highWater; }
}
