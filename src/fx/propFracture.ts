/**
 * propFracture.ts — a destructible kind with a fracture anatomy comes apart physically (destruction core lane,
 * 2026-10-11; the owner: "the destruction of buildings needs to be a lot better too, rn its way to sporadic and ugly
 * instead of behaving like it would with physics"; the kit contract: world/fractureAnatomy.ts, agreed with the
 * destructible-buildings redesign lane).
 *
 * When such a kind breaks live (a shed, a hide, a pillbox: props.ts breakRecord hands it here, its intact slot hidden),
 * its own pieces — each its own triangle run in the kind's geometry, in the pool's material and the record's tint —
 * stand where they stood and the blow takes them apart:
 *  - every piece the blow reaches breaks: its links fail, and one in the thick of it snaps at its scores into parts;
 *    it is thrown off the blow's point, harder the nearer it stood;
 *  - then the support graph: from the anchors (footings, a cast base) through every link that held, what is still held
 *    stands — solid, asleep, in the pool (a hull or a falling rafter knocks it over); what lost every path to an anchor
 *    falls;
 *  - the bodies tumble, strike, pile and come to rest, and each is baked where it lies (never faded); hard landings make
 *    their dust and their recorded sound by mass and speed.
 * The settled state (a late joiner, a migration, the phone) is the pool's broken geometry, as before.
 *
 * Presentation only (the simulation's destroyed record is the authority); deterministic from the record's seed and
 * the blow. Each piece draws as a count-1 instanced copy of its run in the pool's own material (the program the pool
 * compiled: no new program at a break); a settled piece is baked into its copy in place.
 */
import * as THREE from 'three';
import { createRigidShape, type RigidPartSpec, type RigidShape } from '../sim/rigidBody.ts';
import type { FracturePiece, KitFractureAnatomy } from '../world/fractureAnatomy.ts';
import type { DebrisPhysics } from './debrisPhysics.ts';
import { emitCollapseImpact } from './collapseImpacts.ts';

/** What props.ts hands over when a fracture-ready kind breaks live. */
export interface PropFractureRequest {
  /** The record (a stable id for the bodies' owner) and its kind. */
  index: number;
  kind: string;
  /** The kind's intact geometry (non-indexed, its pieces' runs) and the pool's material. */
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  /** The record's world matrix (the pool's instance matrix) and its tint (the pool's instance colour), if any. */
  matrix: THREE.Matrix4;
  color: THREE.Color | null;
  /** The blow: its point (world), its horizontal direction, what it was and how hard (a hull's speed). */
  point: THREE.Vector3;
  dirX: number;
  dirZ: number;
  cause: string;
  speedMps: number;
  /** The record's seed (its own breaks). */
  seed: number;
}

export interface PropFractureOptions {
  pool: DebrisPhysics;
  group: THREE.Group;
  now(): number;
  /** A hard landing (its dust): world point, speed, mass. */
  onLanding?(x: number, y: number, z: number, speedMps: number, massKg: number): void;
}

export interface PropFracture {
  /** A live break: false when the kind's anatomy is unusable (the caller shows its broken pool slot instead). */
  take(request: PropFractureRequest): boolean;
  /** Per frame, after the pool's step: bodies follow, the still ones are baked. */
  update(): void;
  liveBodies(): number;
  reset(): void;
  stats(): { breaks: number; bodies: number; standing: number; baked: number };
}

interface LivePiece {
  handle: number;
  mesh: THREE.InstancedMesh;
  massKg: number;
  material: string;
  still: number;
  age: number;
  sounds: number;
  pose: Float64Array;
  /** The world matrix of its own frame (its box's) at rest: for the bake. */
  standing: boolean;
}

const BAKE_STILL_S = 2.5;
const BAKE_AGE_S = 40;
const SOUND_GAP_S = 0.06;
/** The blow's reach on a light kind (m from its point): a round's, a burst's, a hull's. */
function reachOf(cause: string, speedMps: number): number {
  if (cause === 'ram' || cause === 'crush') return 1.2 + Math.min(1.5, speedMps * 0.1);
  if (cause === 'blast' || cause === 'he') return 2.6;
  return 1.8;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createPropFracture(o: PropFractureOptions): PropFracture {
  const pieces = new Map<number, LivePiece>();
  const baked: THREE.InstancedMesh[] = [];
  const shapes = new WeakMap<FracturePiece, RigidShape>();
  let breaks = 0, bakedCount = 0, lastSoundS = -1, lastUpdateS = o.now();
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
  const _pose = new Float64Array(7);

  o.pool.onImpact((x, y, z, speed, mass, handle) => {
    const lp = pieces.get(handle);
    if (!lp) return;
    o.onLanding?.(x, y, z, speed, mass);
    const t = o.now();
    if (lp.sounds >= 3 || t - lastSoundS < SOUND_GAP_S) return;
    lp.sounds++;
    lastSoundS = t;
    emitCollapseImpact(x, y, z, speed, mass, lp.material);
  });
  o.pool.onEvict((handle, final) => {
    const lp = pieces.get(handle);
    if (!lp) return;
    writePose(lp, final);
    bake(lp, false);
  });

  /** A piece's box as a rigid shape (its own frame: the box's centre and axes). */
  function shapeOf(piece: FracturePiece): RigidShape {
    let shape = shapes.get(piece);
    if (!shape) {
      const part: RigidPartSpec = { kind: 'box', center: [0, 0, 0], half: [Math.max(0.02, piece.h[0]), Math.max(0.02, piece.h[1]),
        Math.max(0.02, piece.h[2])], mass: Math.max(0.5, piece.massKg) };
      shape = createRigidShape([part], { restitution: 0.15, friction: 0.72 });
      shapes.set(piece, shape);
    }
    return shape;
  }

  /** A piece's triangle run in its box's frame (so its body's pose places it), as a geometry with the source's
   *  attributes. */
  function pieceGeometry(source: THREE.BufferGeometry, piece: FracturePiece): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const first = piece.tri0 * 3, count = piece.triN * 3;
    const inv = new THREE.Matrix4().compose(new THREE.Vector3(piece.c[0], piece.c[1], piece.c[2]),
      new THREE.Quaternion(piece.q[0], piece.q[1], piece.q[2], piece.q[3]), _s).invert();
    for (const [name, attr] of Object.entries(source.attributes)) {
      const a = attr as THREE.BufferAttribute;
      const size = a.itemSize;
      const out = new (a.array.constructor as new (n: number) => Float32Array)(count * size);
      for (let i = 0; i < count; i++) for (let k = 0; k < size; k++) out[i * size + k] = a.getComponent(first + i, k);
      geometry.setAttribute(name, new THREE.BufferAttribute(out, size, a.normalized));
    }
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) { _p.fromBufferAttribute(pos, i).applyMatrix4(inv); pos.setXYZ(i, _p.x, _p.y, _p.z); }
    const nrm = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
    if (nrm) {
      const rot = new THREE.Matrix3().setFromMatrix4(inv);
      for (let i = 0; i < nrm.count; i++) { _p.fromBufferAttribute(nrm, i).applyMatrix3(rot).normalize(); nrm.setXYZ(i, _p.x, _p.y, _p.z); }
    }
    geometry.computeBoundingSphere();
    return geometry;
  }

  function writePose(lp: LivePiece, src: ArrayLike<number>): void {
    let same = true;
    for (let k = 0; k < 7; k++) if (lp.pose[k] !== src[k]) { same = false; lp.pose[k] = src[k]; }
    if (same) return;
    _p.set(src[0], src[1], src[2]);
    _q.set(src[3], src[4], src[5], src[6]);
    _m.compose(_p, _q, _s);
    lp.mesh.setMatrixAt(0, _m);
    lp.mesh.instanceMatrix.needsUpdate = true;
  }

  /** A piece at rest: its geometry baked where it lies, its body out of the pool. */
  function bake(lp: LivePiece, release = true): void {
    pieces.delete(lp.handle);
    if (release) o.pool.release(lp.handle);
    _p.set(lp.pose[0], lp.pose[1], lp.pose[2]);
    _q.set(lp.pose[3], lp.pose[4], lp.pose[5], lp.pose[6]);
    _m.compose(_p, _q, _s);
    lp.mesh.geometry.applyMatrix4(_m);
    lp.mesh.setMatrixAt(0, new THREE.Matrix4());
    lp.mesh.instanceMatrix.needsUpdate = true;
    lp.mesh.geometry.computeBoundingSphere();
    baked.push(lp.mesh);
    bakedCount++;
  }

  return {
    take(r) {
      const anatomy = r.geometry.userData.fracture as KitFractureAnatomy | undefined;
      if (!anatomy?.pieces?.length) return false;
      const { pieces: list, links } = anatomy;
      const rng = mulberry(r.seed ^ 0x9e3779b1);
      // the record's frame: its world matrix; the blow's point in the prop frame
      const toLocal = r.matrix.clone().invert();
      const hit = r.point.clone().applyMatrix4(toLocal);
      const reach = reachOf(r.cause, r.speedMps);
      // 1. the pieces the blow reaches break (an anchor too: a footing the blow lifts stays put but holds nothing)
      const broken = new Uint8Array(list.length);
      const near = new Float32Array(list.length);
      list.forEach((piece, i) => {
        // the nearest point of the piece's box to the blow (in its box frame)
        const q = new THREE.Quaternion(piece.q[0], piece.q[1], piece.q[2], piece.q[3]).invert();
        const d = new THREE.Vector3(hit.x - piece.c[0], hit.y - piece.c[1], hit.z - piece.c[2]).applyQuaternion(q);
        const dx = Math.max(0, Math.abs(d.x) - piece.h[0]), dy = Math.max(0, Math.abs(d.y) - piece.h[1]), dz = Math.max(0, Math.abs(d.z) - piece.h[2]);
        const dist = Math.hypot(dx, dy, dz);
        near[i] = Math.max(0, 1 - dist / reach);
        if (near[i] > 0.15 && !piece.anchor) broken[i] = 1;
      });
      // 2. the support graph: held through links that held (neither end broken) from the anchors
      const adjacency: number[][] = list.map(() => []);
      for (const link of links) {
        if (broken[link.a] || broken[link.b]) continue;
        adjacency[link.a].push(link.b);
        adjacency[link.b].push(link.a);
      }
      const held = new Uint8Array(list.length);
      const queue: number[] = [];
      list.forEach((piece, i) => { if (piece.anchor && !broken[i]) { held[i] = 1; queue.push(i); } });
      while (queue.length) for (const j of adjacency[queue.pop()!]) if (!held[j]) { held[j] = 1; queue.push(j); }
      // 3. every piece a body (the anchors asleep where they stand, what is held asleep too: solid, knocked over by what
      //    strikes it; the rest falls), in the pool's own material and the record's tint
      const recordQ = new THREE.Quaternion(), recordP = new THREE.Vector3(), recordS = new THREE.Vector3();
      r.matrix.decompose(recordP, recordQ, recordS);
      const dir = new THREE.Vector3(r.dirX, 0, r.dirZ);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1); else dir.normalize();
      let spawned = 0;
      list.forEach((piece, i) => {
        const geometry = pieceGeometry(r.geometry, piece);
        const mesh = new THREE.InstancedMesh(geometry, r.material, 1);
        if (r.color) { mesh.setColorAt(0, r.color); if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        mesh.name = `fx-prop-piece-${r.kind}`;
        o.group.add(mesh);
        // its box's frame in the world: the record's matrix times the piece's box (scale from the record)
        const local = new THREE.Matrix4().compose(new THREE.Vector3(piece.c[0], piece.c[1], piece.c[2]),
          new THREE.Quaternion(piece.q[0], piece.q[1], piece.q[2], piece.q[3]), _s);
        const world = r.matrix.clone().multiply(local);
        const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
        world.decompose(wp, wq, ws);
        const falls = !held[i] && !piece.anchor;
        // thrown off the blow's point, harder the nearer it stood (a hull shoves along its travel)
        const push = broken[i] ? (r.cause === 'ram' || r.cause === 'crush' ? 2 + r.speedMps * 0.5 : 6) * near[i] : 0;
        const away = new THREE.Vector3(wp.x - r.point.x, 0, wp.z - r.point.z);
        if (away.lengthSq() < 1e-6) away.copy(dir); else away.normalize();
        const along = r.cause === 'ram' || r.cause === 'crush' ? dir : away.add(dir).normalize();
        const handle = o.pool.spawn(shapeOf(piece), {
          x: wp.x, y: wp.y, z: wp.z, qx: wq.x, qy: wq.y, qz: wq.z, qw: wq.w,
          vx: along.x * push, vy: push > 0 ? 1 + rng() * 2 * near[i] : 0, vz: along.z * push,
          wx: (rng() - 0.5) * push, wy: (rng() - 0.5) * push, wz: (rng() - 0.5) * push,
          asleep: !falls && !broken[i],
        });
        if (handle < 0) { o.group.remove(mesh); geometry.dispose(); return; }
        const lp: LivePiece = { handle, mesh, massKg: piece.massKg, material: piece.material, still: 0, age: 0, sounds: 0,
          pose: new Float64Array(7).fill(NaN), standing: !falls && !broken[i] };
        pieces.set(handle, lp);
        _pose[0] = wp.x; _pose[1] = wp.y; _pose[2] = wp.z; _pose[3] = wq.x; _pose[4] = wq.y; _pose[5] = wq.z; _pose[6] = wq.w;
        writePose(lp, _pose);
        spawned++;
      });
      if (!spawned) return false;
      breaks++;
      return true;
    },
    update() {
      const t = o.now();
      const dt = Math.max(0, Math.min(0.25, t - lastUpdateS));
      lastUpdateS = t;
      for (const lp of pieces.values()) {
        if (!o.pool.framePoseAt(lp.handle, _pose)) { pieces.delete(lp.handle); continue; }
        writePose(lp, _pose);
        lp.age += dt;
        lp.still = o.pool.asleep(lp.handle) ? lp.still + dt : 0;
        // a piece still standing in its place stays a body (a hull may yet knock it over); a fallen one at rest is baked
        if (!lp.standing && (lp.still >= BAKE_STILL_S || lp.age >= BAKE_AGE_S)) bake(lp);
      }
    },
    liveBodies() {
      let n = 0;
      for (const lp of pieces.values()) if (!lp.standing || !o.pool.asleep(lp.handle)) n++;
      return n;
    },
    reset() {
      for (const lp of pieces.values()) { o.pool.release(lp.handle); o.group.remove(lp.mesh); lp.mesh.geometry.dispose(); }
      pieces.clear();
      for (const m of baked) { o.group.remove(m); m.geometry.dispose(); }
      baked.length = 0;
      breaks = 0; bakedCount = 0;
    },
    stats() {
      let standing = 0;
      for (const lp of pieces.values()) if (lp.standing) standing++;
      return { breaks, bodies: pieces.size, standing, baked: bakedCount };
    },
  };
}
