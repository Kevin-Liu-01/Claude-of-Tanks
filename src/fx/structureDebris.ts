/**
 * structureDebris.ts — what a building's damage stages write, drawn in the building's own materials
 * (destruction-fx lane, 2026-10-07; DESTRUCTION.md §16).
 *
 * A stage builder (the default kit, a regional or landmark kit) writes two things through the writers this module
 * hands it (src/world/destructionKit.ts DamageWriters):
 *
 *  - MESH runs (DamageMeshWriter): triangles in one of the building's buckets for a role — a breach's broken rim,
 *    the room it opens, the stubs a collapse leaves standing, the pile. They are drawn with that bucket's own
 *    material object (the world's, already compiled: no new program), so a rim of brick IS the wall's brick. Built
 *    once per stage event (event time, never per frame), kept for the match.
 *  - PIECES (DamagePieceWriter): debris of a shape (brick, beam, tile, splinter ...) in a bucket, from a pose with a
 *    velocity. They are drawn by one shared, GPU-animated program (ballistic flight with drag, a tumble that damps
 *    when the piece lands on the ground under it, a shrink-out at the end of life) that samples the bucket's own
 *    albedo map, box-projected, tinted by the piece's colour. One pool per (bucket map, shape): a cloned material
 *    over one program, so a collapse adds draws but never a compile.
 *
 * Frames: the builders write in the structure's BODY frame (origin on the ground at the placement, yaw about +Y);
 * this module carries poses and velocities to the world frame (rotateY(yaw) then translate).
 */
import * as THREE from 'three';
import type {
  DamageMeshWriter, DamagePieceWriter, DamageRole, DamageWriters, DebrisShape,
} from '../world/destructionKit.ts';
import { mulberry32 } from './particles.ts';

export const DEBRIS_SHAPES: readonly DebrisShape[] = Object.freeze([
  'chunk', 'brick', 'block', 'stone', 'plate', 'splinter', 'beam', 'tile', 'slate', 'sheet', 'shard', 'clod', 'straw',
  'rebar',
] as const);
const VARIANTS = 4;

// ---------------------------------------------------------------------------------------------------------------
// The default fracture palette: unit-sized pieces (about a metre on the longest axis), four variants each
// ---------------------------------------------------------------------------------------------------------------

function displaceCorners(geo: THREE.BufferGeometry, rand: () => number, amount: number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const moved = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${x.toFixed(4)}|${y.toFixed(4)}|${z.toFixed(4)}`;
    let d = moved.get(key);
    if (!d) { d = [(rand() - 0.5) * amount, (rand() - 0.5) * amount, (rand() - 0.5) * amount]; moved.set(key, d); }
    pos.setXYZ(i, x + d[0], y + d[1], z + d[2]);
  }
  return geo;
}

function finish(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const flat = geo.index ? geo.toNonIndexed() : geo;
  flat.deleteAttribute('uv');
  flat.computeVertexNormals();
  flat.computeBoundingSphere();
  return flat;
}

/** One palette piece. Boxes are segmented a little so corner jitter breaks their straight edges. */
export function paletteGeometry(shape: DebrisShape, variant: number, seed = 0x5eedd): THREE.BufferGeometry {
  const rand = mulberry32((seed + DEBRIS_SHAPES.indexOf(shape) * 977 + variant * 131) | 0);
  const v = (a: number, b: number) => a + (b - a) * rand();
  switch (shape) {
    case 'brick':
      // a brick (2:1:0.6 proportions), its ends knocked
      return finish(displaceCorners(new THREE.BoxGeometry(1, 0.3, 0.5, 2, 1, 1), rand, 0.06 + 0.04 * variant));
    case 'block':
      return finish(displaceCorners(new THREE.BoxGeometry(1, 0.6, 0.7, 2, 1, 1), rand, 0.08));
    case 'stone':
      return finish(displaceCorners(new THREE.DodecahedronGeometry(0.5, 0), rand, 0.22));
    case 'chunk':
      return finish(displaceCorners(new THREE.IcosahedronGeometry(0.5, 0), rand, 0.3));
    case 'clod':
      return finish(displaceCorners(new THREE.IcosahedronGeometry(0.45, 0), rand, 0.25).scale(1, 0.7, 1));
    case 'plate':
      // a slab of concrete or plaster: flat, its outline broken
      return finish(displaceCorners(new THREE.BoxGeometry(1, 0.12, v(0.6, 0.9), 2, 1, 2), rand, 0.1));
    case 'tile':
    case 'slate': {
      const geo = new THREE.BoxGeometry(shape === 'tile' ? 0.8 : 1, 0.05, shape === 'tile' ? 1 : 0.7, 1, 1, 2);
      if (shape === 'tile') {
        // the curve of a clay tile
        const p = geo.getAttribute('position');
        for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + 0.08 * Math.cos(p.getX(i) * Math.PI * 1.1));
      }
      return finish(displaceCorners(geo, rand, 0.04));
    }
    case 'splinter': {
      const geo = new THREE.BoxGeometry(1, 0.07, 0.12, 4, 1, 1);
      const p = geo.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const t = Math.abs(p.getX(i)) * 2;
        p.setY(i, p.getY(i) * (1 - 0.6 * t * t));
        p.setZ(i, p.getZ(i) * (1 - 0.7 * t * t) + (rand() - 0.5) * 0.03);
      }
      return finish(geo);
    }
    case 'beam': {
      // a timber with one snapped end
      const geo = new THREE.BoxGeometry(1, 0.18, 0.2, 3, 1, 1);
      const p = geo.getAttribute('position');
      for (let i = 0; i < p.count; i++) if (p.getX(i) > 0.45) p.setXYZ(i, p.getX(i) - rand() * 0.2, p.getY(i) * v(0.4, 1), p.getZ(i) * v(0.4, 1));
      return finish(geo);
    }
    case 'sheet': {
      const geo = new THREE.PlaneGeometry(1, 0.7, 3, 1);
      const p = geo.getAttribute('position');
      const bend = v(-0.3, 0.3);
      for (let i = 0; i < p.count; i++) p.setZ(i, bend * p.getX(i) * p.getX(i) * 2 + (rand() - 0.5) * 0.03);
      return finish(geo);
    }
    case 'shard': {
      const geo = new THREE.CircleGeometry(0.5, 3 + variant);
      const p = geo.getAttribute('position');
      for (let i = 0; i < p.count; i++) p.setXY(i, p.getX(i) * v(0.6, 1.1), p.getY(i) * v(0.4, 1));
      return finish(geo.rotateX(-Math.PI / 2));
    }
    case 'straw':
      return finish(displaceCorners(new THREE.CylinderGeometry(0.3, 0.45, 0.25, 6, 1), rand, 0.15));
    case 'rebar':
    default: {
      const geo = new THREE.CylinderGeometry(0.02, 0.02, 1, 4, 3);
      const p = geo.getAttribute('position');
      const k = v(0.1, 0.35);
      for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + k * Math.pow(p.getY(i) + 0.5, 2));
      return finish(geo.rotateZ(Math.PI / 2));
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The piece program
// ---------------------------------------------------------------------------------------------------------------

const PIECE_VERT = /* glsl */ `
attribute vec4 aPB;   // origin.xyz, birth
attribute vec4 aVL;   // velocity.xyz, life
attribute vec4 aQ;    // start orientation (unit quaternion)
attribute vec4 aSS;   // scale.xyz, tumble rate (rad/s)
attribute vec4 aCG;   // tint.rgb, rest height (the ground under the piece)
uniform float uTime;
varying vec3 vNormalW;
varying vec3 vTint;
varying vec3 vBox;
varying vec3 vBoxN;
#ifdef USE_FOG
  varying float vFogDepth;
#endif
vec3 qrot( vec4 q, vec3 v ) { return v + 2.0 * cross( q.xyz, cross( q.xyz, v ) + q.w * v ); }
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
    vNormalW = vec3( 0.0, 1.0, 0.0 ); vTint = vec3( 0.0 ); vBox = vec3( 0.0 ); vBoxN = vec3( 0.0, 1.0, 0.0 );
    gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
    #ifdef USE_FOG
      vFogDepth = 1.0;
    #endif
    return;
  }
  // ballistic with a little drag; the piece stops on the ground under it
  float k = 0.35;
  float s = ( 1.0 - exp( -k * age ) ) / k;
  vec3 c = aPB.xyz + aVL.xyz * s + vec3( 0.0, -4.9 * age * age, 0.0 );
  float halfH = 0.3 * min( aSS.x, min( aSS.y, aSS.z ) );
  float rest = aCG.w + halfH;
  float moving = step( 0.01, dot( aVL.xyz, aVL.xyz ) );
  float landed = moving * step( c.y, rest );
  c.y = moving > 0.5 ? max( c.y, rest ) : c.y;
  // tumble about an axis from the piece's own seed (its start quaternion), damped once it lies
  vec3 axisRaw = vec3( aQ.y + 0.31, aQ.z - 0.17, aQ.x + 0.23 );
  vec3 axis = axisRaw / max( length( axisRaw ), 1e-4 );
  float ang = aSS.w * ( landed > 0.5 ? min( age, 0.6 ) : age ) * moving;
  vec3 lp = position * aSS.xyz;
  // (round 7) a landed piece lies most of its life, then settles into the ground over the last third; the last few
  // percent shrink
  c.y -= landed * halfH * 2.2 * smoothstep( 0.66, 1.0, age / life );
  lp *= 1.0 - smoothstep( 0.95, 1.0, age / life );
  vec3 p = axisAngle( axis, ang ) * qrot( aQ, lp );
  vec3 n = axisAngle( axis, ang ) * qrot( aQ, normal );
  vNormalW = n;
  vTint = aCG.rgb;
  vBox = position * aSS.xyz;
  vBoxN = normal;
  vec4 mv = viewMatrix * vec4( c + p, 1.0 );
  #ifdef USE_FOG
    vFogDepth = -mv.z;
  #endif
  gl_Position = projectionMatrix * mv;
}
`;

const PIECE_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uHasMap;
uniform float uMapScale;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform vec3 uGroundCol;
varying vec3 vNormalW;
varying vec3 vTint;
varying vec3 vBox;
varying vec3 vBoxN;
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
  // the bucket's own albedo, box-projected in the piece's local frame (a broken brick shows brick)
  vec3 an = abs( vBoxN );
  vec2 uv = an.x > an.y && an.x > an.z ? vBox.zy : ( an.y > an.z ? vBox.xz : vBox.xy );
  vec3 albedo = vTint;
  if ( uHasMap > 0.5 ) albedo *= texture2D( uMap, uv * uMapScale + 0.5 ).rgb;
  // (round 7, wave 276/277: pieces read as "flat unlit black squares") faces from the sun still take the sky and the
  // ground's bounce, and a little sun wraps round the broken edges
  float nl = dot( n, uSunDir );
  float diff = max( nl, 0.0 ) * 0.8 + 0.2 * ( nl * 0.5 + 0.5 );
  vec3 amb = mix( uGroundCol, uSkyCol, n.y * 0.5 + 0.5 ) * 1.25;
  vec3 col = albedo * ( uSunCol * diff + amb );
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

const PIECE_ATTRS = ['aPB', 'aVL', 'aQ', 'aSS', 'aCG'] as const;
type PieceAttr = typeof PIECE_ATTRS[number];

interface PiecePool {
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  arrays: Record<PieceAttr, Float32Array>;
  attrs: Record<PieceAttr, THREE.InstancedBufferAttribute>;
  cursor: number;
  high: number;
  liveUntil: number;
  dirtyLo: number;
  dirtyHi: number;
}

/** A structure stage's body-frame placement in the world. */
export interface BodyPlacement { x: number; y: number; z: number; yaw: number }

/** How a stage's static runs join their building (structureStages.ts). */
export interface StageRunOptions {
  /** aDamage for every run vertex (0: none — a collapse's own stubs and pile stay where they lie). */
  tag?: number;
  /** A bucket's shadow depth material (the world's patched one), so a tagged run's shadow falls with it. */
  depthFor?: (bucket: string) => THREE.Material | null;
  /** false: the builder lays no static runs (the mesh writer's begin() refuses them), only throws its pieces — a wall
   *  panel falling with its storey, whose own fall lays what is left standing. */
  meshes?: boolean;
  /** false: the builder throws no pieces (the pieces writer's capacity is 0), only lays its runs — a collapse after the
   *  P2 cascade, whose storeys threw theirs as they dropped. */
  pieces?: boolean;
}

export interface StructureDebrisOptions {
  now: () => number;
  scene?: THREE.Scene | null;
  /** The ground a thrown piece comes to rest on (as drawn: the battle's craters and rubble mounds in it). */
  groundY: (x: number, z: number) => number;
  /** The undeformed ground (no overlay): a collapse's pile and stubs (untagged rubble and remnant runs, written over the
   *  placement's height) are seated on it per vertex, so a sloped plot's uphill side does not bury them (facades
   *  2026-10-08: the kit's heights stand over the sim's mound already). Absent: the placement's height. */
  baseGroundY?: (x: number, z: number) => number;
  /** Pieces per pool (a pool is a bucket map and a shape). */
  poolCapacity?: number;
  /** Mesh-run vertices per stage (the stage's cap; DESTRUCTION.md §16.3). */
  stageVertexCap?: number;
  /** Falling pieces per stage (the phone tier throws fewer). */
  pieceCap?: number;
}

export interface StructureDebris {
  readonly group: THREE.Group;
  /**
   * Writers for one stage of one structure; `materialFor` resolves a bucket's material (the seam's spans) for a run of
   * that role (a pieces pool asks without one). `delayS` delays the pieces and the static runs (a collapse shows its
   * pile under the dust, not before the fall).
   */
  begin(placement: BodyPlacement, materialFor: (bucket: string, role?: DamageRole) => THREE.Material | null, delayS?: number,
    settled?: boolean, options?: StageRunOptions): DamageWriters;
  /** Build the stage's static runs and start its pieces; the runs it laid. */
  commit(): readonly THREE.Mesh[];
  /** A structure's standing runs (those tagged STAGE_RUN_TAG + its index + 1: a breach's rim and room, a roof's patch). */
  standingRuns(tag: number): readonly THREE.Mesh[];
  /** A standing run goes with the section it stood in: hidden, and never shown (a delayed stage's run included). */
  dropRun(mesh: THREE.Mesh): void;
  update(): void;
  shiftTime(delta: number): void;
  reset(): void;
  stats(): { pools: number; pieces: number; meshes: number; vertices: number };
}

export function createStructureDebris(o: StructureDebrisOptions): StructureDebris {
  const group = new THREE.Group();
  group.name = 'fx-structure-debris';
  group.matrixAutoUpdate = false;
  const poolCapacity = o.poolCapacity ?? 96;
  const stageCap = o.stageVertexCap ?? 24000;
  const uTime = { value: 0 };
  const uSunDir = { value: new THREE.Vector3(0.527, 0.574, -0.627).normalize() };
  const uSunCol = { value: new THREE.Vector3(1.3, 1.25, 1.15) };
  const uSkyCol = { value: new THREE.Vector3(0.3, 0.32, 0.36) };
  const uGroundCol = { value: new THREE.Vector3(0.14, 0.13, 0.11) };
  const baseMaterial = new THREE.ShaderMaterial({
    vertexShader: PIECE_VERT,
    fragmentShader: PIECE_FRAG,
    uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
      uTime, uSunDir, uSunCol, uSkyCol, uGroundCol,
      uMap: { value: null as THREE.Texture | null }, uHasMap: { value: 0 }, uMapScale: { value: 0.5 },
    }),
    fog: true,
    side: THREE.DoubleSide,
  });
  // geometry per shape and variant (built once, shared by every pool of that shape)
  const geometries = new Map<string, THREE.BufferGeometry>();
  const geometryFor = (shape: DebrisShape, variant: number): THREE.BufferGeometry => {
    const key = `${shape}:${variant % VARIANTS}`;
    let g = geometries.get(key);
    if (!g) { g = paletteGeometry(shape, variant % VARIANTS); geometries.set(key, g); }
    return g;
  };
  // pools per (map id, shape, variant)
  const pools = new Map<string, PiecePool>();
  const materialsByMap = new Map<string, THREE.ShaderMaterial>();
  const pieceMaterial = (map: THREE.Texture | null): THREE.ShaderMaterial => {
    const key = map ? map.uuid : 'none';
    let m = materialsByMap.get(key);
    if (!m) {
      m = baseMaterial.clone();
      // the clone shares the uniform objects that every pool animates and lights by; the map is its own
      for (const k of ['uTime', 'uSunDir', 'uSunCol', 'uSkyCol', 'uGroundCol'] as const) m.uniforms[k] = baseMaterial.uniforms[k];
      m.uniforms.uMap = { value: map };
      m.uniforms.uHasMap = { value: map ? 1 : 0 };
      materialsByMap.set(key, m);
    }
    return m;
  };
  function poolFor(map: THREE.Texture | null, shape: DebrisShape, variant: number): PiecePool {
    const key = `${map ? map.uuid : 'none'}|${shape}|${variant % VARIANTS}`;
    let p = pools.get(key);
    if (p) return p;
    const base = geometryFor(shape, variant);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('normal', base.getAttribute('normal'));
    geo.instanceCount = 0;
    const arrays = {} as Record<PieceAttr, Float32Array>;
    const attrs = {} as Record<PieceAttr, THREE.InstancedBufferAttribute>;
    for (const name of PIECE_ATTRS) {
      const arr = new Float32Array(poolCapacity * 4);
      const attr = new THREE.InstancedBufferAttribute(arr, 4);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, attr);
      arrays[name] = arr; attrs[name] = attr;
    }
    const mesh = new THREE.Mesh(geo, pieceMaterial(map));
    mesh.name = `fx-structure-pieces-${shape}`;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = false;
    group.add(mesh);
    p = { mesh, arrays, attrs, cursor: 0, high: 0, liveUntil: -Infinity, dirtyLo: -1, dirtyHi: -1 };
    pools.set(key, p);
    return p;
  }

  // ---- the stage being written ------------------------------------------------------------------------------
  let place: BodyPlacement = { x: 0, y: 0, z: 0, yaw: 0 };
  let cosY = 1, sinY = 0;
  let resolveMaterial: (bucket: string, role?: DamageRole) => THREE.Material | null = () => null;
  let stageDelay = 0;
  let stageBirth = 0;
  let stageSettled = false;
  let stageTag = 0;
  let stageDepth: ((bucket: string) => THREE.Material | null) | null = null;
  let stageMeshes = true;
  let stagePiecesOn = true;
  // mesh runs: one growing set of arrays per (bucket, role) of the stage
  interface Run { bucket: string; role: DamageRole; pos: number[]; nrm: number[]; uv: number[]; col: number[]; idx: number[] }
  const runs: Run[] = [];
  let current: Run | null = null;
  let runBase = 0;
  let stageVertices = 0;
  const staticMeshes: THREE.Mesh[] = [];
  let totalVertices = 0;

  const toWorld = (bx: number, by: number, bz: number, out: number[] | Float32Array, at: number): void => {
    out[at] = place.x + bx * cosY + bz * sinY;
    out[at + 1] = place.y + by;
    out[at + 2] = place.z - bx * sinY + bz * cosY;
  };

  const meshWriter: DamageMeshWriter = {
    begin(bucket: string, role: DamageRole): boolean {
      if (!stageMeshes || stageVertices >= stageCap) return false;
      current = runs.find((r) => r.bucket === bucket && r.role === role) ?? null;
      if (!current) { current = { bucket, role, pos: [], nrm: [], uv: [], col: [], idx: [] }; runs.push(current); }
      runBase = current.pos.length / 3;
      return true;
    },
    vertex(px, py, pz, nx, ny, nz, u, v, r, g, b): number {
      const run = current;
      if (!run) return -1;
      const at = run.pos.length;
      run.pos.length += 3;
      toWorld(px, py, pz, run.pos, at);
      // normals rotate with the body (no translation)
      run.nrm.push(nx * cosY + nz * sinY, ny, -nx * sinY + nz * cosY);
      run.uv.push(u, v);
      run.col.push(r, g, b);
      stageVertices++;
      return at / 3 - runBase;
    },
    triangle(a, b, c): void {
      const run = current;
      if (!run) return;
      run.idx.push(runBase + a, runBase + b, runBase + c);
    },
    end(): void { current = null; },
    get vertices() { return stageVertices; },
    get capacity() { return stageCap; },
  };

  const _q = new THREE.Quaternion();
  const _qy = new THREE.Quaternion();
  const _up = new THREE.Vector3(0, 1, 0);
  let stagePieces = 0;
  const pieceCap = Math.max(0, o.pieceCap ?? 1024);
  const pieceWriter: DamagePieceWriter = {
    push(bucket, shape, variant, px, py, pz, qx, qy, qz, qw, sx, sy, sz, r, g, b, vx, vy, vz): boolean {
      // a settled stage (a late joiner, a migration) lays down its static runs only: nothing falls
      if (stageSettled || !stagePiecesOn || stagePieces >= pieceCap) return false;
      const mat = resolveMaterial(bucket) as (THREE.Material & { map?: THREE.Texture | null }) | null;
      const map = mat && 'map' in mat ? (mat.map ?? null) : null;
      const pool = poolFor(map, shape, variant);
      const i = pool.cursor;
      pool.cursor = (pool.cursor + 1) % poolCapacity;
      pool.high = Math.max(pool.high, i + 1);
      pool.mesh.geometry.instanceCount = pool.high;
      const j = i * 4;
      const A = pool.arrays;
      toWorld(px, py, pz, A.aPB, j);
      A.aPB[j + 3] = stageBirth;
      // velocity rotates with the body
      A.aVL[j] = vx * cosY + vz * sinY; A.aVL[j + 1] = vy; A.aVL[j + 2] = -vx * sinY + vz * cosY;
      const moving = vx * vx + vy * vy + vz * vz > 1e-4;
      // a thrown piece lies where it lands (round 7: they vanished at ~10 s): ~24 s, then settles in
      A.aVL[j + 3] = moving ? 22 + (i % 7) * 0.6 : 60;
      // orientation: body yaw, then the piece's own
      _qy.setFromAxisAngle(_up, place.yaw);
      _q.set(qx, qy, qz, qw).normalize().premultiply(_qy);
      A.aQ[j] = _q.x; A.aQ[j + 1] = _q.y; A.aQ[j + 2] = _q.z; A.aQ[j + 3] = _q.w;
      A.aSS[j] = sx; A.aSS[j + 1] = sy; A.aSS[j + 2] = sz; A.aSS[j + 3] = moving ? 3 + ((i * 7919) % 100) * 0.06 : 0;
      A.aCG[j] = r; A.aCG[j + 1] = g; A.aCG[j + 2] = b;
      A.aCG[j + 3] = o.groundY(A.aPB[j], A.aPB[j + 2]);
      if (stageBirth + A.aVL[j + 3] > pool.liveUntil) pool.liveUntil = stageBirth + A.aVL[j + 3];
      pool.dirtyLo = pool.dirtyLo < 0 ? i : Math.min(pool.dirtyLo, i);
      pool.dirtyHi = Math.max(pool.dirtyHi, i + 1);
      stagePieces++;
      return true;
    },
    get count() { return stagePieces; },
    get capacity() { return stagePiecesOn ? pieceCap : 0; },
  };
  const writers: DamageWriters = { mesh: meshWriter, pieces: pieceWriter };

  let showAt: { mesh: THREE.Mesh; at: number }[] = [];

  return {
    group,
    begin(placement, materialFor, delayS = 0, settled = false, options = {}) {
      place = placement;
      stageSettled = settled;
      stageTag = options.tag && options.tag > 0 ? options.tag : 0;
      stageDepth = options.depthFor ?? null;
      stageMeshes = options.meshes !== false;
      stagePiecesOn = options.pieces !== false;
      cosY = Math.cos(placement.yaw); sinY = Math.sin(placement.yaw);
      resolveMaterial = materialFor;
      stageDelay = settled ? 0 : delayS;
      stageBirth = o.now() + stageDelay;
      runs.length = 0;
      current = null;
      stageVertices = 0;
      stagePieces = 0;
      return writers;
    },
    commit() {
      const made: THREE.Mesh[] = [];
      for (const run of runs) {
        if (!run.idx.length) continue;
        if (!stageTag && o.baseGroundY && (run.role === 'rubble' || run.role === 'remnant')) {
          // seated per vertex on the ground under it: body y over the undeformed ground instead of over placement.y
          const P = run.pos;
          for (let i = 0; i < P.length; i += 3) P[i + 1] = o.baseGroundY(P[i], P[i + 2]) + (P[i + 1] - place.y);
        }
        const material = resolveMaterial(run.bucket, run.role);
        if (!material) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(run.pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(run.nrm, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(run.uv, 2));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(run.col, 3));
        if (stageTag > 0) geo.setAttribute('aDamage', new THREE.BufferAttribute(new Uint16Array(run.pos.length / 3).fill(stageTag), 1));
        geo.userData.stageTag = stageTag;
        geo.setIndex(run.idx);
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, material);
        mesh.name = `fx-structure-${run.role}-${run.bucket}`;
        mesh.matrixAutoUpdate = false;
        mesh.castShadow = run.role !== 'debris';
        mesh.receiveShadow = true;
        // a tagged run casts through its bucket's patched depth material: its shadow falls with the building
        const depth = stageTag > 0 && stageDepth ? stageDepth(run.bucket) : null;
        if (depth) mesh.customDepthMaterial = depth;
        mesh.visible = stageDelay <= 0;
        group.add(mesh);
        staticMeshes.push(mesh);
        made.push(mesh);
        totalVertices += run.pos.length / 3;
        if (stageDelay > 0) showAt.push({ mesh, at: stageBirth });
      }
      runs.length = 0;
      for (const p of pools.values()) {
        if (p.dirtyLo < 0) continue;
        for (const name of PIECE_ATTRS) {
          const attr = p.attrs[name];
          attr.addUpdateRange(p.dirtyLo * 4, (p.dirtyHi - p.dirtyLo) * 4);
          attr.needsUpdate = true;
        }
        p.dirtyLo = p.dirtyHi = -1;
      }
      return made;
    },
    update() {
      const now = o.now();
      uTime.value = now;
      if (showAt.length) {
        let k = 0;
        for (const s of showAt) { if (now >= s.at) s.mesh.visible = s.mesh.userData.dropped !== true; else showAt[k++] = s; }
        showAt.length = k;
      }
      let any = false;
      for (const p of pools.values()) {
        const live = now <= p.liveUntil && p.high > 0;
        p.mesh.visible = live;
        any = any || live;
      }
      if (!any) return;
      const ud = o.scene?.userData as { sunDirWorld?: THREE.Vector3; lightRig?: { sunIntensity?: number; sunColor?: THREE.Color;
        hemiIntensity?: number; hemiSky?: THREE.Color; hemiGround?: THREE.Color } } | undefined;
      const sd = ud?.sunDirWorld;
      if (sd && sd.lengthSq() > 1e-8) uSunDir.value.copy(sd).normalize();
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
    },
    shiftTime(delta) {
      for (const p of pools.values()) {
        const pb = p.arrays.aPB, vl = p.arrays.aVL;
        for (let i = 0; i < p.high; i++) if (vl[i * 4 + 3] > 0) pb[i * 4 + 3] += delta;
        p.attrs.aPB.clearUpdateRanges();
        p.attrs.aPB.addUpdateRange(0, p.high * 4);
        p.attrs.aPB.needsUpdate = true;
        if (Number.isFinite(p.liveUntil)) p.liveUntil += delta;
      }
      for (const s of showAt) s.at += delta;
    },
    reset() {
      for (const m of staticMeshes) { m.removeFromParent(); m.geometry.dispose(); }
      staticMeshes.length = 0;
      totalVertices = 0;
      showAt = [];
      for (const p of pools.values()) {
        p.arrays.aVL.fill(0);
        p.attrs.aVL.clearUpdateRanges();
        p.attrs.aVL.needsUpdate = true;
        p.cursor = 0; p.high = 0; p.liveUntil = -Infinity;
        p.mesh.geometry.instanceCount = 0;
        p.mesh.visible = false;
      }
    },
    standingRuns(tag) {
      return staticMeshes.filter((m) => m.geometry.userData.stageTag === tag && m.userData.dropped !== true);
    },
    dropRun(mesh) {
      mesh.userData.dropped = true;
      mesh.visible = false;
    },
    stats() {
      let pieces = 0;
      for (const p of pools.values()) pieces += p.high;
      return { pools: pools.size, pieces, meshes: staticMeshes.length, vertices: totalVertices };
    },
  };
}
