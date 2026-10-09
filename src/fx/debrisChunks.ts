/**
 * debrisChunks.ts — thrown pieces of the struck material: soil clods, stones, bricks, splinters, tile and glass
 * shards, bent sheet (destruction-fx lane, 2026-10-07).
 *
 * The battle's debris pool (particles.ts) draws charred-metal wreckage: one dark palette, ember glow. A shell in a
 * field throws EARTH, a wall throws its own BRICKS, a shed its PLANKS — in the colour of the ground or the building
 * they came from (DESTRUCTION.md §16: the rubble is the building's own materials and colours). This pool draws them:
 * one instanced mesh per piece shape (at most six draws, only shapes with live pieces draw), per-instance colour,
 * GPU-animated ballistic flight with drag, a ground stop with a damped tumble, and a shrink-out at the end of life.
 * Lit by the scene's sun and sky (scene.userData), like the media.
 *
 * The CPU writes a piece once at emit (ring buffer per shape, dirty-span uploads as the battle pools do); a shared
 * clock ages everything. No per-frame allocation, nothing runs while no piece lives.
 */
import * as THREE from 'three';
import { mulberry32 } from './particles.ts';

export type ChunkShape = 'clod' | 'stone' | 'brick' | 'splinter' | 'shard' | 'sheet';
export const CHUNK_SHAPES: readonly ChunkShape[] = Object.freeze(['clod', 'stone', 'brick', 'splinter', 'shard', 'sheet']);

/** One piece's emit record (recipes keep ONE and mutate it). */
export interface ChunkPiece {
  shape: ChunkShape;
  x: number; y: number; z: number; birthOffset: number;
  vx: number; vy: number; vz: number; life: number;
  /** tumble axis (any length) and rate (rad/s) */
  ax: number; ay: number; az: number; spin: number;
  /** size (m, longest axis), the ground the piece stops on (m), drag (1/s) */
  scale: number; groundY: number; drag: number;
  /** linear albedo, heat at birth (0..1: an ember-hot piece glows and cools) */
  r: number; g: number; b: number; heat: number;
  seed: number;
}

export function makeChunkPiece(): ChunkPiece {
  return { shape: 'clod', x: 0, y: 0, z: 0, birthOffset: 0, vx: 0, vy: 0, vz: 0, life: 2, ax: 1, ay: 0, az: 0, spin: 8,
    scale: 0.2, groundY: 0, drag: 0.3, r: 0.1, g: 0.08, b: 0.06, heat: 0, seed: 0 };
}

const CHUNK_VERT = /* glsl */ `
attribute vec4 aPB;   // origin.xyz, birth
attribute vec4 aVL;   // vel.xyz, life
attribute vec4 aAR;   // spin axis.xyz, spin rate
attribute vec4 aSG;   // scale, groundY, drag, seed
attribute vec4 aCH;   // albedo.rgb, heat
uniform float uTime;
varying vec3 vNormalW;
varying vec3 vAlbedo;
varying float vHeat;
varying vec3 vWorldPos;
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
    vNormalW = vec3( 0.0, 1.0, 0.0 ); vAlbedo = vec3( 0.0 ); vHeat = 0.0; vWorldPos = vec3( 0.0 );
    gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
    #ifdef USE_FOG
      vFogDepth = 1.0;
    #endif
    return;
  }
  float k = max( aSG.z, 1e-3 );
  float s = ( 1.0 - exp( -k * age ) ) / k;
  vec3 center = aPB.xyz + aVL.xyz * s + vec3( 0.0, -4.9 * age * age, 0.0 );
  float rest = aSG.y + aSG.x * 0.32;
  float grounded = step( center.y, rest );
  center.y = max( center.y, rest );
  // (wave 276: pieces "lie on the grass at 3 s and then simply vanish") a piece that has landed lies where it fell for
  // most of its life, then settles into the ground over the last third of it; only the last few percent shrink
  float tl = age / life;
  center.y -= grounded * aSG.x * 1.15 * smoothstep( 0.66, 1.0, tl );
  // the tumble damps out once the piece lies on the ground (it slides a little, then stops)
  float spin = aAR.w * ( grounded > 0.5 ? min( age, 0.25 + 0.25 * fract( aSG.w * 7.3 ) ) : age );
  mat3 rot = axisAngle( normalize( aAR.xyz + vec3( 1e-4 ) ), spin );
  // per-piece proportions so no two read alike
  float h1 = fract( aSG.w * 37.719 ), h2 = fract( aSG.w * 61.113 ), h3 = fract( aSG.w * 91.537 );
  vec3 lp = position * vec3( 0.8 + h1 * 0.4, 0.8 + h2 * 0.4, 0.8 + h3 * 0.4 );
  float fade = 1.0 - smoothstep( 0.95, 1.0, tl );
  vec3 p = rot * ( lp * aSG.x * fade );
  // the shutter's smear: in flight a piece draws drawn out along its velocity by a 1/45 s exposure, the way a camera
  // films thrown earth (wave 276: still clods read as "black squares"); a resting piece is its own shape
  vec3 vel = aVL.xyz * exp( -k * age ) + vec3( 0.0, -9.8 * age, 0.0 );
  float speed = length( vel ) * ( 1.0 - grounded );
  if ( speed > 0.5 ) {
    vec3 vd = vel / speed;
    p += vd * dot( p, vd ) * min( speed * 0.022 / max( aSG.x, 0.02 ), 3.0 );
  }
  vec3 wpos = center + p;
  vNormalW = rot * normal;
  vAlbedo = aCH.rgb * ( 0.85 + 0.3 * h2 );
  vHeat = aCH.w * exp( -age * 1.6 ) * ( 1.0 - grounded * 0.6 );
  vWorldPos = wpos;
  vec4 mvPosition = viewMatrix * vec4( wpos, 1.0 );
  #ifdef USE_FOG
    vFogDepth = -mvPosition.z;
  #endif
  gl_Position = projectionMatrix * mvPosition;
}
`;

const CHUNK_FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform vec3 uGroundCol;
varying vec3 vNormalW;
varying vec3 vAlbedo;
varying float vHeat;
varying vec3 vWorldPos;
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
  vec3 n = normalize( vNormalW );
  if ( !gl_FrontFacing ) n = -n;
  float nl = dot( n, uSunDir );
  float ndl = max( nl, 0.0 );
  // (wave 276: "flat unlit pure-black squares") a lump of earth in daylight is never black: its faces turned from the
  // sun still take the sky and the ground's bounce, and a little of the sun wraps round its rough edges
  float diff = ndl * 0.8 + 0.2 * ( nl * 0.5 + 0.5 );
  vec3 amb = mix( uGroundCol, uSkyCol, n.y * 0.5 + 0.5 ) * 1.4;
  vec3 col = vAlbedo * ( uSunCol * diff + amb );
  // a hot piece glows in its crevices first, then cools to the material
  col += vec3( 1.4, 0.36, 0.06 ) * vHeat * ( 0.35 + 0.65 * ( 1.0 - ndl ) );
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( -fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    col = mix( col, fogColor, fogFactor );
  #endif
  // (2026-10-08, the owner's black screens) finite colour only
  if ( !( abs( col.r ) < 6.0e4 && abs( col.g ) < 6.0e4 && abs( col.b ) < 6.0e4 ) ) discard;
  gl_FragColor = vec4( col, 1.0 );
}
`;

/** Displace the corners of a low-poly solid consistently (shared vertices move together), then flat-shade it. */
function roughen(geo: THREE.BufferGeometry, rand: () => number, lo: number, hi: number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const disp = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}`;
    let m = disp.get(key);
    if (m === undefined) { m = lo + rand() * (hi - lo); disp.set(key, m); }
    pos.setXYZ(i, x * m, y * m, z * m);
  }
  const flat = geo.index ? geo.toNonIndexed() : geo;
  flat.computeVertexNormals();
  return flat;
}

function shapeGeometry(shape: ChunkShape, rand: () => number): THREE.BufferGeometry {
  switch (shape) {
    // a torn lump of earth: flattened a little and broken unevenly (round 7: the round icosahedra read as pellets)
    case 'clod': return roughen(new THREE.IcosahedronGeometry(0.5, 0), rand, 0.5, 1.25).scale(1, 0.78, 0.92);
    case 'stone': return roughen(new THREE.OctahedronGeometry(0.5, 0), rand, 0.55, 1.2).scale(1, 0.75, 0.85);
    case 'brick': {
      // a brick with a broken end: a box, one end's corners pulled in
      const g = new THREE.BoxGeometry(1, 0.32, 0.48).toNonIndexed();
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        if (p.getX(i) > 0.4) p.setXYZ(i, p.getX(i) - rand() * 0.25, p.getY(i) * (0.7 + rand() * 0.3), p.getZ(i) * (0.7 + rand() * 0.3));
      }
      g.computeVertexNormals();
      return g;
    }
    case 'splinter': {
      const g = new THREE.BoxGeometry(1, 0.08, 0.16, 3, 1, 1).toNonIndexed();
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        // tapered, torn ends
        const t = Math.abs(x) * 2;
        p.setXYZ(i, x + (rand() - 0.5) * 0.06, p.getY(i) * (1 - 0.5 * t), p.getZ(i) * (1 - 0.6 * t) + (rand() - 0.5) * 0.03);
      }
      g.computeVertexNormals();
      return g;
    }
    case 'shard': {
      // a thin irregular plate (tile, slate, glass)
      const g = new THREE.CylinderGeometry(0.5, 0.5, 0.06, 5, 1).toNonIndexed();
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const k = 0.6 + rand() * 0.5;
        p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * (0.5 + rand() * 0.6));
      }
      g.computeVertexNormals();
      return g;
    }
    case 'sheet':
    default: {
      // a bent sheet: a plane folded along its middle
      const g = new THREE.PlaneGeometry(1, 0.7, 2, 1).toNonIndexed();
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        p.setXYZ(i, x, p.getY(i), Math.abs(x) * 0.45 + (rand() - 0.5) * 0.05);
      }
      g.computeVertexNormals();
      return g;
    }
  }
}

const LAYOUT = { aPB: 4, aVL: 4, aAR: 4, aSG: 4, aCH: 4 } as const;
type AttrName = keyof typeof LAYOUT;
const NAMES = Object.keys(LAYOUT) as AttrName[];

class ShapePool {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  readonly capacity: number;
  private readonly arrays: Record<AttrName, Float32Array>;
  private readonly attrs: Record<AttrName, THREE.InstancedBufferAttribute>;
  private cursor = 0;
  private highWater = 0;
  private dirtyStart = -1;
  private dirtyEnd = -1;
  private wrapStart = -1;
  private wrapEnd = -1;
  liveUntil = -Infinity;

  constructor(shape: ChunkShape, capacity: number, material: THREE.ShaderMaterial, rand: () => number) {
    this.capacity = capacity;
    const base = shapeGeometry(shape, rand);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('normal', base.getAttribute('normal'));
    geo.instanceCount = 0;
    this.arrays = {} as Record<AttrName, Float32Array>;
    this.attrs = {} as Record<AttrName, THREE.InstancedBufferAttribute>;
    for (const name of NAMES) {
      const arr = new Float32Array(capacity * 4);
      const attr = new THREE.InstancedBufferAttribute(arr, 4);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, attr);
      this.arrays[name] = arr;
      this.attrs[name] = attr;
    }
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.name = `fx-chunks-${shape}`;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.visible = false;
  }

  emit(p: ChunkPiece, birth: number): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    if (i + 1 > this.highWater) { this.highWater = i + 1; this.mesh.geometry.instanceCount = this.highWater; }
    const j = i * 4;
    const A = this.arrays;
    A.aPB[j] = p.x; A.aPB[j + 1] = p.y; A.aPB[j + 2] = p.z; A.aPB[j + 3] = birth;
    A.aVL[j] = p.vx; A.aVL[j + 1] = p.vy; A.aVL[j + 2] = p.vz; A.aVL[j + 3] = p.life;
    A.aAR[j] = p.ax; A.aAR[j + 1] = p.ay; A.aAR[j + 2] = p.az; A.aAR[j + 3] = p.spin;
    A.aSG[j] = p.scale; A.aSG[j + 1] = p.groundY; A.aSG[j + 2] = p.drag; A.aSG[j + 3] = p.seed;
    A.aCH[j] = p.r; A.aCH[j + 1] = p.g; A.aCH[j + 2] = p.b; A.aCH[j + 3] = p.heat;
    if (birth + p.life > this.liveUntil) this.liveUntil = birth + p.life;
    if (this.dirtyStart < 0) { this.dirtyStart = i; this.dirtyEnd = i + 1; }
    else if (i === this.dirtyEnd) this.dirtyEnd = i + 1;
    else if (i < this.dirtyStart) {
      if (this.wrapStart < 0) { this.wrapStart = i; this.wrapEnd = i + 1; } else { this.wrapStart = Math.min(this.wrapStart, i); this.wrapEnd = Math.max(this.wrapEnd, i + 1); }
    } else this.dirtyEnd = Math.max(this.dirtyEnd, i + 1);
  }

  flush(now: number): void {
    this.mesh.visible = now <= this.liveUntil;
    if (this.dirtyStart < 0) return;
    for (const name of NAMES) {
      const attr = this.attrs[name];
      attr.addUpdateRange(this.dirtyStart * 4, (this.dirtyEnd - this.dirtyStart) * 4);
      if (this.wrapStart >= 0) attr.addUpdateRange(this.wrapStart * 4, (this.wrapEnd - this.wrapStart) * 4);
      attr.needsUpdate = true;
    }
    this.dirtyStart = this.dirtyEnd = this.wrapStart = this.wrapEnd = -1;
  }

  shiftTime(delta: number): void {
    const pb = this.arrays.aPB, vl = this.arrays.aVL;
    for (let i = 0; i < this.highWater; i++) if (vl[i * 4 + 3] > 0) pb[i * 4 + 3] += delta;
    const attr = this.attrs.aPB;
    attr.clearUpdateRanges();
    attr.addUpdateRange(0, this.highWater * 4);
    attr.needsUpdate = true;
    if (Number.isFinite(this.liveUntil)) this.liveUntil += delta;
  }

  reset(): void {
    const vl = this.arrays.aVL;
    for (let i = 0; i < this.capacity; i++) vl[i * 4 + 3] = 0;
    const attr = this.attrs.aVL;
    attr.clearUpdateRanges();
    attr.needsUpdate = true;
    this.cursor = 0;
    this.highWater = 0;
    this.mesh.geometry.instanceCount = 0;
    this.dirtyStart = this.dirtyEnd = this.wrapStart = this.wrapEnd = -1;
    this.liveUntil = -Infinity;
    this.mesh.visible = false;
  }

  get count(): number { return this.highWater; }
}

export interface DebrisChunks {
  readonly group: THREE.Group;
  emit(p: ChunkPiece): void;
  update(): void;
  shiftTime(delta: number): void;
  reset(): void;
  stats(): Record<ChunkShape, number>;
}

/** Capacities per shape (desktop); the phone tier halves them. (Round 7: a burst throws 100-300 clods that lie ~20 s.) */
const CAPACITY: Readonly<Record<ChunkShape, number>> = Object.freeze({
  clod: 1536, stone: 768, brick: 512, splinter: 256, shard: 256, sheet: 128,
});

export function createDebrisChunks(o: { seed: number; now: () => number; scene?: THREE.Scene | null; tier?: 'mobile' | 'desktop' }): DebrisChunks {
  const group = new THREE.Group();
  group.name = 'fx-debris-chunks';
  group.matrixAutoUpdate = false;
  const uTime = { value: 0 };
  const uSunDir = { value: new THREE.Vector3(0.527, 0.574, -0.627).normalize() };
  const uSunCol = { value: new THREE.Vector3(1.3, 1.25, 1.15) };
  const uSkyCol = { value: new THREE.Vector3(0.3, 0.32, 0.36) };
  const uGroundCol = { value: new THREE.Vector3(0.14, 0.13, 0.11) };
  const material = new THREE.ShaderMaterial({
    vertexShader: CHUNK_VERT,
    fragmentShader: CHUNK_FRAG,
    uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), { uTime, uSunDir, uSunCol, uSkyCol, uGroundCol }),
    fog: true,
    side: THREE.DoubleSide,
  });
  const rand = mulberry32((o.seed ^ 0xc10d5) | 0);
  const scale = o.tier === 'mobile' ? 0.5 : 1;
  const pools = {} as Record<ChunkShape, ShapePool>;
  for (const shape of CHUNK_SHAPES) {
    pools[shape] = new ShapePool(shape, Math.max(16, Math.round(CAPACITY[shape] * scale)), material, rand);
    group.add(pools[shape].mesh);
  }
  const _sun = new THREE.Vector3();
  function refreshLight(): void {
    const ud = o.scene?.userData as { sunDirWorld?: THREE.Vector3; lightRig?: { sunIntensity?: number; sunColor?: THREE.Color;
      hemiIntensity?: number; hemiSky?: THREE.Color; hemiGround?: THREE.Color } } | undefined;
    const sd = ud?.sunDirWorld;
    if (sd && sd.lengthSq() > 1e-8) uSunDir.value.copy(_sun.copy(sd).normalize());
    const rig = ud?.lightRig;
    if (rig) {
      const si = (rig.sunIntensity ?? 4.5) / Math.PI;
      const sc = rig.sunColor;
      uSunCol.value.set(sc ? sc.r * si : si, sc ? sc.g * si : si, sc ? sc.b * si : si);
      const hi = (rig.hemiIntensity ?? 0.4) * 1.6 / Math.PI;
      const sky = rig.hemiSky, gnd = rig.hemiGround;
      uSkyCol.value.set(sky ? sky.r * hi : hi, sky ? sky.g * hi : hi, sky ? sky.b * hi : hi);
      uGroundCol.value.set(gnd ? gnd.r * hi : hi, gnd ? gnd.g * hi : hi, gnd ? gnd.b * hi : hi);
    }
  }
  let anyLive = false;
  return {
    group,
    emit(p: ChunkPiece): void {
      pools[p.shape].emit(p, o.now() + p.birthOffset);
      anyLive = true;
    },
    update(): void {
      const now = o.now();
      uTime.value = now;
      if (!anyLive) return;
      refreshLight();
      let still = false;
      for (const shape of CHUNK_SHAPES) {
        pools[shape].flush(now);
        if (now <= pools[shape].liveUntil) still = true;
      }
      anyLive = still;
    },
    shiftTime(delta: number): void { for (const shape of CHUNK_SHAPES) pools[shape].shiftTime(delta); },
    reset(): void { for (const shape of CHUNK_SHAPES) pools[shape].reset(); anyLive = false; },
    stats(): Record<ChunkShape, number> {
      const out = {} as Record<ChunkShape, number>;
      for (const shape of CHUNK_SHAPES) out[shape] = pools[shape].count;
      return out;
    },
  };
}
