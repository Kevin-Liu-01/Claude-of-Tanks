/**
 * rubbleBodies.ts — a building's falling pieces as rigid bodies of the game's one physics engine (destruction stream,
 * 2026-10-12; the owner: "make the physics for stuff falling around and pieces of buildings and destruction use the same
 * kind of physics engine. like how turrets popping off is now using natural, grounded physics with no snappiness and
 * jerkiness or reliance on exceptions", and "rubble ... properly falls down onto ground that can potentially be uneven",
 * "instead of ... having its rubble come down the same exact way and end up on a flat 2d plane").
 *
 * The turret pops run on sim/rigidBody.ts (the wreck body, wire 5); the destruction stages' pieces were a GPU ballistic
 * program clamped to one height. Here the stages' larger pieces — the blocks, bricks, stones, chunks, slabs and beams a
 * breach, a falling panel or a collapse throws — become bodies in that same engine (fx/debrisPhysics.ts, the engine's
 * presentation pool): they fall from the pose and velocity the kit gave them, tumble, strike the ground as drawn (its
 * slopes, a crater, the rubble heap the sim raised), the standing walls and records, and each other, and they come to
 * rest where they come to rest — a different pile every time, on whatever lies under it. The small stuff (grit, shards,
 * splinters, the rest past a stage's body budget) stays in the GPU program, which now lands each piece where its flight
 * meets the ground (structureDebris.pieceLanding).
 *
 * Presentation only, like the pieces: every peer runs the same bodies from the same stage event (the kit's seeded pieces,
 * the fx clock's fixed steps) over its own world; the sim's mound and the destroyed lists stay the authority.
 *
 * Budget: a pool of `capacity` bodies (the desktop 56, the phone 0: its pieces stay in the program); a stage asks for at
 * most its own budget (structureStages: a strike by its charge, a collapse the most). A body that has slept a while stays
 * drawn where it lies and leaves the engine when the pool needs its slot (the pool's oldest sleeper first): rubble that
 * has settled is static instances, one draw per material and shape, never a cost per frame. Bodies are drawn in the
 * building's own bucket texture, box-projected at the wall's tile density, tinted per piece, lit and shadowed as the
 * world is.
 */
import * as THREE from 'three';
import { createRigidBox, type RigidEnvironment, type RigidShape } from '../sim/rigidBody.ts';
import type { DebrisShape } from '../world/destructionKit.ts';
import { createDebrisPhysics, type DebrisPhysics } from './debrisPhysics.ts';
import { paletteGeometry } from './structureDebris.ts';

/** The shapes a body may take (the rest stay pieces: too thin or too small to be worth a body). */
const BODY_SHAPES: ReadonlySet<DebrisShape> = new Set(['chunk', 'brick', 'block', 'stone', 'plate', 'beam', 'clod', 'tile', 'slate', 'sheet']);
/** Each palette shape's unit extents (x, y, z m before a piece's scale; structureDebris SHAPE_EXTENTS). */
const EXTENTS: Readonly<Partial<Record<DebrisShape, readonly [number, number, number]>>> = Object.freeze({
  chunk: [0.9, 0.9, 0.9], brick: [1, 0.3, 0.5], block: [1, 0.6, 0.7], stone: [0.9, 0.9, 0.9], plate: [1, 0.12, 0.75],
  beam: [1, 0.18, 0.2], clod: [0.9, 0.63, 0.9], tile: [0.8, 0.07, 1], slate: [1, 0.05, 0.7], sheet: [1, 0.06, 0.7],
});
/** What each shape weighs (kg/m^3) and how it meets the ground (restitution, friction). */
function bodyMaterial(shape: DebrisShape): { density: number; restitution: number; friction: number } {
  switch (shape) {
    case 'beam': return { density: 600, restitution: 0.18, friction: 0.7 };
    case 'sheet': return { density: 1200, restitution: 0.1, friction: 0.55 };
    case 'tile': case 'slate': return { density: 1900, restitution: 0.12, friction: 0.75 };
    case 'clod': return { density: 1500, restitution: 0.05, friction: 0.9 };
    default: return { density: 1800, restitution: 0.14, friction: 0.82 };
  }
}
/** The smallest piece worth a body: its longest side (m) and its thinnest (m). */
const BODY_MIN_LONG_M = 0.22;
const BODY_MIN_THIN_M = 0.035;
/** Body slots by tier. */
export const RUBBLE_BODY_CAPACITY = 56;
/** Instances a (texture, shape) mesh keeps: the oldest settled one gives way past it. */
const INSTANCES = 160;
/** The wall tile density (repeats a metre) the bodies' box projection uses. */
const TILE_PER_M = 0.5;

export interface RubbleBodiesOptions {
  now(): number;
  /** What the bodies meet: the ground as drawn (its craters and heaps) and the world's records. Null: they wait. */
  environment(): RigidEnvironment | null;
  /** A bucket's own material (for its albedo map); null: an untextured tinted body. */
  materialFor(bucket: string): THREE.Material | null;
  /** The engine context's cascade setup for a lit material (lighting.ts setupShadowMaterial). */
  setupMaterial?(material: THREE.Material): unknown;
  capacity?: number;
}

export interface RubbleBodies {
  readonly group: THREE.Group;
  /** Whether a piece of this shape and size is a body's (else it stays a piece). */
  takes(shape: DebrisShape, lengthX: number, lengthY: number, lengthZ: number): boolean;
  /**
   * A piece as a body: world pose (centre, unit quaternion), its full extents (m), its velocity and spin, its tint, and
   * the delay before it is let go (it is not drawn before). False when the pool or the handles are full.
   */
  throw(bucket: string, shape: DebrisShape, x: number, y: number, z: number, qx: number, qy: number, qz: number, qw: number,
    lx: number, ly: number, lz: number, vx: number, vy: number, vz: number, wx: number, wy: number, wz: number,
    r: number, g: number, b: number, delayS: number, structureIdx?: number): boolean;
  /**
   * Every body mesh a bucket's pieces can take (each palette shape in its material), made now rather than at a first
   * throw mid-battle: the battle warm calls it with the world's buckets, and a bucket's first throw makes all of its own
   * (destruction stream, 2026-10-13; the collapse frame's bar). Returns the meshes made.
   */
  prewarm(buckets: Iterable<string>): number;
  /** Per render frame: the engine's fixed steps on the fx clock, the moving bodies' instances. */
  update(): void;
  shiftTime(delta: number): void;
  reset(): void;
  stats(): { bodies: number; awake: number; waiting: number; live: number; settled: number; meshes: number };
  readonly pool: DebrisPhysics;
}

interface BodyMesh {
  mesh: THREE.InstancedMesh;
  /** next instance slot (a ring); per slot the handle it follows (-1 settled or empty) */
  cursor: number;
  used: number;
  slotHandle: Int32Array;
}

interface LiveBody { mesh: BodyMesh; index: number; sx: number; sy: number; sz: number; releaseAt: number; still: number }

const BODY_VERT_UV = /* glsl */ `
#include <uv_vertex>
#ifdef USE_MAP
  {
    // the bucket's own tile, box-projected on the piece's scaled faces (a broken brick shows its brick at the wall's scale)
    vec3 bodyScale = vec3( length( instanceMatrix[ 0 ].xyz ), length( instanceMatrix[ 1 ].xyz ), length( instanceMatrix[ 2 ].xyz ) );
    vec3 bodyLocal = position * bodyScale;
    vec3 bodyN = abs( normal );
    vec2 bodyUv = bodyN.x > bodyN.y && bodyN.x > bodyN.z ? bodyLocal.zy : ( bodyN.y > bodyN.z ? bodyLocal.xz : bodyLocal.xy );
    vMapUv = bodyUv * ${TILE_PER_M.toFixed(3)} + 0.5;
  }
#endif
`;

export function createRubbleBodies(o: RubbleBodiesOptions): RubbleBodies {
  const capacity = Math.max(0, o.capacity ?? RUBBLE_BODY_CAPACITY) | 0;
  const pool = createDebrisPhysics({ capacity: Math.max(1, capacity), handles: Math.max(4, capacity * 3) });
  const group = new THREE.Group();
  group.name = 'fx-rubble-bodies';
  group.matrixAutoUpdate = false;
  // shapes cached by kind and size (5 cm steps): a collapse spawns from the cache, never builds per piece
  const shapes = new Map<string, RigidShape>();
  function shapeFor(shape: DebrisShape, hx: number, hy: number, hz: number): RigidShape {
    const q = (v: number) => Math.max(1, Math.round(v * 20));
    const key = `${shape}:${q(hx)}:${q(hy)}:${q(hz)}`;
    let s = shapes.get(key);
    if (!s) {
      const m = bodyMaterial(shape);
      // (the destruction check: a 56-body heap cost 3-10 ms a frame at its p95, a few pieces creeping in it 12 s on) a
      // rubble piece's own drag and rolling resistance settle a heap in a few seconds, a coarser sphere grid halves its
      // contacts, and one that still creeps after 7 s sleeps where it lies (the turret's body keeps the engine's own)
      s = createRigidBox(q(hx) / 20, q(hy) / 20, q(hz) / 20, m.density, { restitution: m.restitution, friction: m.friction,
        rolling: 0.6, linearDrag: 0.05, angularDrag: 0.35, maxSpheres: 14, forceSleepS: 7 });
      shapes.set(key, s);
    }
    return s;
  }
  // materials by albedo map: the world's texture under the world's lighting
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  function materialFor(bucket: string): THREE.MeshStandardMaterial {
    const source = o.materialFor(bucket) as (THREE.Material & { map?: THREE.Texture | null }) | null;
    const map = source?.map ?? null;
    const key = map ? map.uuid : 'none';
    let m = materials.get(key);
    if (!m) {
      const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0 });
      mat.name = 'fx-rubble-body';
      mat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', BODY_VERT_UV);
      };
      mat.customProgramCacheKey = () => 'fx-rubble-body-v1';
      o.setupMaterial?.(mat);
      materials.set(key, mat);
      m = mat;
    }
    return m;
  }
  const meshes = new Map<string, BodyMesh>();
  function meshFor(bucket: string, shape: DebrisShape): BodyMesh {
    const material = materialFor(bucket);
    const key = `${material.uuid}|${shape}`;
    let bm = meshes.get(key);
    if (!bm) {
      const geometry = paletteGeometry(shape, 1);
      const mesh = new THREE.InstancedMesh(geometry, material, INSTANCES);
      mesh.name = `fx-rubble-body-${shape}`;
      mesh.count = 0;
      // (a prewarmed mesh no body has used yet draws nothing: no draw call, no shadow pass)
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.castShadow = shape !== 'tile' && shape !== 'slate' && shape !== 'sheet';
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, new THREE.Color(1, 1, 1));
      bm = { mesh, cursor: 0, used: 0, slotHandle: new Int32Array(INSTANCES).fill(-1) };
      group.add(mesh);
      meshes.set(key, bm);
    }
    return bm;
  }

  // (the stage probe: pieces born inside their own building's wall records were thrown hundreds of metres by the
  // engine's depenetration) the records of a building that is throwing pieces are not solid to bodies for a while: its
  // pieces leave its walls, they never start inside one; the neighbours' walls and every other record stay solid
  const passUntil = new Map<number, number>();
  const PASS_S = 6;
  /** The fx clock as of the last throw or update (the pass windows run on it). */
  let clockS = o.now();
  let bound: RigidEnvironment | null = null;
  let wrapped: RigidEnvironment | null = null;
  function environment(): RigidEnvironment | null {
    const env = o.environment();
    if (!env) return null;
    if (env !== bound || !wrapped) {
      bound = env;
      const solid = env.isSolid;
      wrapped = {
        groundAt: env.groundAt,
        ...(env.queryStatic ? { queryStatic: env.queryStatic } : {}),
        isSolid: (record) => {
          if (solid ? !solid(record) : (record.crushed || record.dead)) return false;
          const idx = record.structureIdx;
          if (idx === undefined || !passUntil.size) return true;
          const until = passUntil.get(idx);
          return until === undefined || clockS > until;
        },
      };
    }
    return wrapped;
  }
  const live = new Map<number, LiveBody>();
  let settled = 0;
  const pose = new Float64Array(7);
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  const _c = new THREE.Color();
  const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
  let last = o.now();

  // a sleeper the full pool lets go of lies where it rests: its instance keeps its last pose, nothing follows it
  pool.onEvict((handle, at) => {
    const body = live.get(handle);
    if (!body) return;
    write(body, at);
    body.mesh.slotHandle[body.index] = -1;
    live.delete(handle);
    settled++;
  });

  function write(body: LiveBody, at: Float64Array): void {
    _p.set(at[0], at[1], at[2]);
    _q.set(at[3], at[4], at[5], at[6]);
    _s.set(body.sx, body.sy, body.sz);
    _m.compose(_p, _q, _s);
    body.mesh.mesh.setMatrixAt(body.index, _m);
    body.mesh.mesh.instanceMatrix.needsUpdate = true;
  }

  const warmed = new Set<string>();
  function prewarmBucket(bucket: string): number {
    if (warmed.has(bucket)) return 0;
    warmed.add(bucket);
    const before = meshes.size;
    for (const shape of BODY_SHAPES) meshFor(bucket, shape);
    return meshes.size - before;
  }

  return {
    group,
    pool,
    prewarm(buckets) {
      if (capacity <= 0) return 0;
      let made = 0;
      for (const bucket of buckets) made += prewarmBucket(bucket);
      return made;
    },
    takes(shape, lx, ly, lz) {
      if (capacity <= 0 || !BODY_SHAPES.has(shape)) return false;
      const e = EXTENTS[shape];
      if (!e) return false;
      const a = e[0] * lx, b = e[1] * ly, c = e[2] * lz;
      return Math.max(a, b, c) >= BODY_MIN_LONG_M && Math.min(a, b, c) >= BODY_MIN_THIN_M;
    },
    throw(bucket, shape, x, y, z, qx, qy, qz, qw, lx, ly, lz, vx, vy, vz, wx, wy, wz, r, g, b, delayS, structureIdx) {
      if (capacity <= 0) return false;
      const e = EXTENTS[shape];
      if (!e) return false;
      const env = environment();
      if (!env) return false;
      // a hard cap: a body needs a slot now or at its release — a free one, or a sleeper the pool may let go of; a pool
      // full of moving bodies refuses (the piece stays in the program, never a body waiting in the air)
      const w = pool.world;
      let inWorld = 0, sleepers = 0;
      for (let i = 0; i < w.capacity; i++) if (w.active[i]) { inWorld++; sleepers += w.asleep[i]!; }
      const reserved = inWorld + pool.stats().waiting;
      if (reserved >= capacity && sleepers <= reserved - capacity) return false;
      pool.bind(env);
      clockS = o.now();
      if (structureIdx !== undefined && structureIdx >= 0) passUntil.set(structureIdx, clockS + Math.max(0, delayS) + PASS_S);
      // the palette piece is about a unit on its longest side: its body is the box of its own extents at this scale
      const hx = Math.max(0.02, e[0] * lx * 0.5), hy = Math.max(0.02, e[1] * ly * 0.5), hz = Math.max(0.02, e[2] * lz * 0.5);
      const handle = pool.spawn(shapeFor(shape, hx, hy, hz), { x, y, z, qx, qy, qz, qw, vx, vy, vz, wx, wy, wz }, Math.max(0, delayS));
      if (handle < 0) return false;
      prewarmBucket(bucket);
      const bm = meshFor(bucket, shape);
      // its instance: the next slot of the ring; a settled body there gives way (the oldest rubble first), a live one
      // that still owns it is let go of where it is
      const index = bm.cursor;
      bm.cursor = (bm.cursor + 1) % INSTANCES;
      const prior = bm.slotHandle[index]!;
      if (prior >= 0) { live.delete(prior); pool.release(prior); } else if (bm.used >= INSTANCES) settled = Math.max(0, settled - 1);
      bm.used = Math.min(INSTANCES, bm.used + 1);
      bm.mesh.count = Math.max(bm.mesh.count, index + 1);
      bm.mesh.visible = true;
      bm.slotHandle[index] = handle;
      bm.mesh.setColorAt(index, _c.setRGB(r, g, b));
      if (bm.mesh.instanceColor) bm.mesh.instanceColor.needsUpdate = true;
      const body: LiveBody = { mesh: bm, index, sx: lx, sy: ly, sz: lz, releaseAt: o.now() + Math.max(0, delayS), still: 0 };
      live.set(handle, body);
      if (delayS > 0) { bm.mesh.setMatrixAt(index, HIDDEN); bm.mesh.instanceMatrix.needsUpdate = true; }
      else if (pool.framePoseAt(handle, pose)) write(body, pose);
      return true;
    },
    update() {
      const now = o.now();
      const dt = now - last;
      last = now;
      clockS = now;
      if (!live.size) return;
      if (dt > 0) {
        const env = environment();
        if (env) { pool.bind(env); pool.advance(dt); }
      }
      for (const [handle, body] of live) {
        if (now < body.releaseAt) continue;
        if (!pool.inWorld(handle)) {
          // due but the pool had no slot for it: hidden, and given up on after a moment (never hung where it was born)
          if (now - body.releaseAt > 0.25) {
            live.delete(handle);
            pool.release(handle);
            body.mesh.slotHandle[body.index] = -1;
            body.mesh.mesh.setMatrixAt(body.index, HIDDEN);
            body.mesh.mesh.instanceMatrix.needsUpdate = true;
          }
          continue;
        }
        if (pool.asleep(handle)) {
          // asleep: written once more where it came to rest, then left alone
          if (body.still++ > 1) continue;
        } else body.still = 0;
        if (pool.framePoseAt(handle, pose)) write(body, pose);
      }
    },
    shiftTime(delta) {
      last += delta;
      clockS += delta;
      for (const [k, v] of passUntil) passUntil.set(k, v + delta);
      for (const body of live.values()) body.releaseAt += delta;
    },
    reset() {
      pool.reset();
      live.clear();
      passUntil.clear();
      settled = 0;
      for (const bm of meshes.values()) {
        bm.mesh.count = 0;
        bm.mesh.visible = false;
        bm.cursor = 0;
        bm.used = 0;
        bm.slotHandle.fill(-1);
      }
      last = o.now();
    },
    stats() {
      const s = pool.stats();
      return { bodies: s.bodies, awake: s.awake, waiting: s.waiting, live: live.size, settled, meshes: meshes.size };
    },
  };
}
