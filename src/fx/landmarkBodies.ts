/**
 * landmarkBodies.ts — a set piece's named pieces coming down as rigid bodies at its damage stages (destruction lane,
 * 2026-10-15, the coordinator's target for the fracture: Polders' lift bridge breaks through the fracture path — its
 * deck, its counterweights and its barrier arms come down as bodies that come to rest on the ground or in the water,
 * never left hanging).
 *
 * The contract is Lane A's E12 (landmarks/pieces.ts): the builder draws a piece it names with `piece(sink, spec, body)`
 * and finishes with `finishLandmark(sink)`, so the piece's geometries carry `userData.damagePiece` and the world's spans
 * carry the name (StructureSpan.piece). A piece listed here for its builder is the bodies': at its stage its spans leave
 * the buckets (kept for the reset) and their own triangles, in their own materials, follow a box body of the one engine
 * in the fracture's pool; the builder names it with `at: 'collapse'` so the E12 kit lays no settled copy of it (a set
 * piece of the bridge's size never collapses: sim/structureDamage.ts's landmark floor). Its own records (the deck it was)
 * stop being solid under it, so a leaf drops through the gap it spanned onto the bed under the water; the bridge's other
 * records stay solid (a counterweight lands on the approach's boards).
 *
 *   liftBridge (landmarks/bridges.ts, its short and long forms):
 *     'deck'                 the two leaves (split at their meeting line), at the breach stage, free ends first;
 *     'counterweight-<n>'    each balance's tail bar, at the breach stage;
 *     'barrier-arm-<n>-<k>'  a slagboom's raised arm (its bands k), at the damaged stage, over outward.
 *
 * Presentation only: the sim's stage is the authority (the bridge's movement surface and records are untouched);
 * deterministic from the stage event and the structure's seed. Event time, but the poses of live bodies each frame.
 */
import * as THREE from 'three';
import { createRigidBox } from '../sim/rigidBody.ts';
import { damageRng, damageSeed } from '../world/destructionKit.ts';
import type { StructureDamageSeam, StructureSpan } from '../world/structureDamageSeam.ts';
import type { DebrisPhysics } from './debrisPhysics.ts';
import { emitDebrisLanding } from './clock.ts';
import { createPlateHold, layPerchedPlates, layUprightPlates } from './uprightPlates.ts';
import type { RigidEnvironment } from '../sim/rigidBody.ts';

/** A body a builder's piece becomes: its stage, how it groups (one body a group), its density and how it leaves. */
interface PieceRule {
  match: RegExp;
  at: 'damaged' | 'breached';
  /** The group a piece name falls in (one body each); `split`: a group's triangles divided at the body frame's z = 0. */
  group(name: string): string;
  split?: boolean;
  density: number;
  kind: 'leaf' | 'drop' | 'topple';
}

const RULES: Readonly<Record<string, readonly PieceRule[]>> = Object.freeze({
  liftBridge: [
    { match: /^barrier-arm-(\d+)(?:-\d+)?$/, at: 'damaged', group: (n) => n.replace(/^(barrier-arm-\d+).*$/, '$1'), density: 420, kind: 'topple' },
    { match: /^deck(?:-\d+)?$/, at: 'breached', group: () => 'deck', split: true, density: 520, kind: 'leaf' },
    { match: /^counterweight(?:-\d+)?$/, at: 'breached', group: (n) => n, density: 2400, kind: 'drop' },
  ],
});

const STAGE_RANK: Readonly<Record<string, number>> = Object.freeze({ damaged: 1, breached: 2, collapsed: 3 });

/** What a building's damage left hanging comes down as (drop): a timber's weight, off where it hung. */
const HANGING_RULE: PieceRule = { match: /^$/, at: 'damaged', group: (n) => n, density: 450, kind: 'drop' };
/** Bodies a sweep throws at most (the rest go with their dust). */
const HANGING_BODIES = 6;

interface LandmarkBodiesOptions {
  pool: DebrisPhysics;
  group: THREE.Group;
  /** Keep a span's original positions before the first change (the stages' reset restores them). */
  keepSpan(span: StructureSpan): void;
  /** The ground as drawn under a point (a piece given up lies on it). */
  groundAt(x: number, z: number): number;
  /** A hard landing (its dust): world point, speed, mass, the structure. */
  onLanding?(x: number, y: number, z: number, speedMps: number, massKg: number, structureIdx: number): void;
  /** A record box of the structure its pieces start over is no longer solid (the deck a leaf was): world x/z bounds. */
  pass(structureIdx: number, minX: number, minZ: number, maxX: number, maxZ: number): void;
  /** (round 5) The world's records the bodies meet: what holds a piece's plate where it comes to rest (uprightPlates). */
  environment?(): RigidEnvironment | null;
}

export interface LandmarkBodies {
  /** A set piece's stage: its listed pieces of that stage (and any earlier one not yet taken) come down as bodies; a
   *  settled one (a late joiner) lays them at rest on the ground under where they stood. The pieces thrown. */
  stage(seam: StructureDamageSeam, stage: string, dirX: number, dirZ: number, settled?: boolean): number;
  /** Whether a builder has pieces here. */
  handles(builder: string): boolean;
  /**
   * (destruction-slabs 227 round 3) What a building's damage left hanging (structureHanging.ts): each group of triangles
   * out of the buckets and down as a body (the largest few; the rest go with their dust), or at rest on the ground under
   * where it hung (settled). The bodies thrown.
   */
  drop(seam: StructureDamageSeam, groups: ReadonlyArray<ReadonlyArray<{ span: StructureSpan; at: number }>>, settled?: boolean): number;
  /**
   * Pieces of the presentation's own meshes left hanging (a kit's rim chunk over a hole whose wall went round it): each a
   * copy of its triangles down as a body (the largest few; the rest their dust), or at rest under where it hung (settled).
   * The caller takes the triangles out of its mesh after. The bodies thrown.
   */
  dropMeshPieces(seam: StructureDamageSeam, pieces: ReadonlyArray<{ mesh: THREE.Mesh; tris: readonly number[] }>, settled?: boolean): number;
  update(dtS: number): void;
  liveBodies(): number;
  reset(): void;
  stats(): { bodies: number; baked: number; taken: number };
}

interface LiveBody { handle: number; meshes: THREE.Mesh[]; structureIdx: number; still: number; age: number; massKg: number;
  sounds: number; pose: Float64Array; laid?: boolean }

/** A material's vertex layout as a span's mesh carries it (position and normal first; the mask's tags left out). */
interface Layout { names: string[]; sizes: number[] }

const BAKE_STILL_S = 1.5, BAKE_AGE_S = 30;
/** (round 5) A body this old moving slower than these (m/s, rad/s) lies where it is (it rocks on the heap, never asleep). */
const CREEP_AGE_S = 6, CREEP_MPS = 0.3, CREEP_RADS = 0.5;

const _pn = new THREE.Vector3(), _pu = new THREE.Vector3();
/** A symmetric 3×3's (xx xy xz yy yz zz) least eigenvector (Jacobi), or null. */
function leastAxis3(cv: readonly number[]): [number, number, number] | null {
  const a = [[cv[0]!, cv[1]!, cv[2]!], [cv[1]!, cv[3]!, cv[4]!], [cv[2]!, cv[4]!, cv[5]!]];
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 24; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p]![q]! * a[p]![q]!;
    if (off < 1e-18) break;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(a[p]![q]!) < 1e-20) continue;
      const theta = (a[q]![q]! - a[p]![p]!) / (2 * a[p]![q]!);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const cs = 1 / Math.sqrt(t * t + 1), sn = t * cs;
      for (let k = 0; k < 3; k++) { const akp = a[k]![p]!, akq = a[k]![q]!; a[k]![p] = cs * akp - sn * akq; a[k]![q] = sn * akp + cs * akq; }
      for (let k = 0; k < 3; k++) { const apk = a[p]![k]!, aqk = a[q]![k]!; a[p]![k] = cs * apk - sn * aqk; a[q]![k] = sn * apk + cs * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = v[k]![p]!, vkq = v[k]![q]!; v[k]![p] = cs * vkp - sn * vkq; v[k]![q] = sn * vkp + cs * vkq; }
    }
  }
  let best = 0;
  for (let k = 1; k < 3; k++) if (a[k]![k]! < a[best]![best]!) best = k;
  const out: [number, number, number] = [v[0]![best]!, v[1]![best]!, v[2]![best]!];
  const l = Math.hypot(out[0], out[1], out[2]);
  return l > 1e-9 ? [out[0] / l, out[1] / l, out[2] / l] : null;
}

export function createLandmarkBodies(o: LandmarkBodiesOptions): LandmarkBodies {
  /** The ground a piece laid flat lies on (uprightPlates.ts). */
  const groundOf = (x: number, z: number): number => o.groundAt(x, z);
  /**
   * (destruction-slabs 227 round 5; the census's airfield #8 fire station on the phone, every face: a 4 m square plate of
   * what its sweep dropped, laid where its middle met the heap's flank, lay 1 m up with half of it over nothing to the end)
   * a piece laid on the ground under where it stood — no body to bring it to rest — lies as a plate coming to rest does:
   * none of it on its edge, none perched over nothing (tilted off what holds it to the ground, or lowered onto it).
   */
  const plateHold = createPlateHold(() => o.environment?.() ?? null, o.pool.world);
  const layDown = (meshes: readonly THREE.Mesh[]): void => {
    for (const m of meshes) layUprightPlates(m.geometry, m.matrix, groundOf);
    layPerchedPlates(meshes.map((m) => ({ geometry: m.geometry, matrix: m.matrix, body: 0 })), [], groundOf, plateHold);
  };
  const live: LiveBody[] = [];
  /** Hanging parts falling to where they lie (no body): world centre, heights, turns, clock. */
  const tweens: Array<{ meshes: THREE.Mesh[]; x: number; z: number; y0: number; y1: number; q0: THREE.Quaternion; q1: THREE.Quaternion;
    t: number; T: number; structureIdx: number; massKg: number }> = [];
  /** Every mesh a piece drew (live or lying still), for the reset. */
  const drawn: THREE.Mesh[] = [];
  const byHandle = new Map<number, LiveBody>();
  /** The pieces taken, per structure (a name once). */
  const taken = new Map<number, Set<string>>();
  let baked = 0;
  const pose = new Float64Array(7);
  const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
  const _m = new THREE.Matrix4(), _inst = new THREE.Matrix4(), _nm = new THREE.Matrix3();
  const _up = new THREE.Vector3(0, 1, 0), _fwd = new THREE.Vector3(0, 0, 1), _right = new THREE.Vector3(1, 0, 0), _tq = new THREE.Quaternion();
  const _vel = new Float64Array(6);
  let lastSound = -1, clock = 0;

  o.pool.onImpact((x, y, z, speed, mass, handle) => {
    const b = byHandle.get(handle);
    if (!b || !(speed >= 2.2)) return;
    o.onLanding?.(x, y, z, speed, mass, b.structureIdx);
    if (b.sounds >= 3 || clock - lastSound < 0.08) return;
    b.sounds++;
    lastSound = clock;
    emitDebrisLanding(x, y, z, speed, mass);
  });
  o.pool.onEvict((handle, final) => {
    const b = byHandle.get(handle);
    if (!b) return;
    write(b, final);
    unlist(b);
    baked++;
  });

  function unlist(b: LiveBody): void {
    byHandle.delete(b.handle);
    const i = live.indexOf(b);
    if (i >= 0) { live[i] = live[live.length - 1]; live.length--; }
  }
  function write(b: LiveBody, src: ArrayLike<number>): void {
    let same = true;
    for (let k = 0; k < 7; k++) if (b.pose[k] !== src[k]) { same = false; b.pose[k] = src[k]; }
    if (same) return;
    _m.compose(_v.set(src[0], src[1], src[2]), _q.set(src[3], src[4], src[5], src[6]), _s);
    for (let i = 0; i < b.meshes.length; i++) { const m = b.meshes[i]; m.matrix.copy(_m); m.matrixWorldNeedsUpdate = true; }
  }

  function layoutOf(geometry: THREE.BufferGeometry): Layout {
    const names: string[] = [], sizes: number[] = [];
    for (const [name, attr] of Object.entries(geometry.attributes)) {
      if (name === 'position' || name === 'normal' || name === 'aDamage' || name === 'batchId') continue;
      names.push(name);
      sizes.push((attr as THREE.BufferAttribute).itemSize);
    }
    return { names, sizes };
  }
  /** A span's world matrix (its mesh's, times its batch instance's). */
  function spanMatrix(span: StructureSpan): THREE.Matrix4 {
    const mesh = span.mesh as THREE.Object3D & { getMatrixAt?(index: number, target: THREE.Matrix4): THREE.Matrix4 };
    mesh.updateWorldMatrix(true, false);
    _m.copy(mesh.matrixWorld);
    if (span.instanceId !== null && typeof mesh.getMatrixAt === 'function') { mesh.getMatrixAt(span.instanceId, _inst); _m.multiply(_inst); }
    return _m;
  }

  interface Tri { span: StructureSpan; at: number }
  /** One group's body: its triangles (body frame bounds, their own attributes about the box's centre), thrown. */
  /** A group's drawing (body frame about its centre) read as a plate: its least axis and half its spread along it, when
   *  that spread is a hand at most; else null. */
  function plateAxis(byMat: Map<THREE.Material, { pos: number[] }>): [number, number, number, number] | null {
    let n = 0;
    const cv = [0, 0, 0, 0, 0, 0];
    let mx = 0, my = 0, mz = 0;
    for (const e of byMat.values()) for (let i = 0; i + 2 < e.pos.length; i += 3) { mx += e.pos[i]!; my += e.pos[i + 1]!; mz += e.pos[i + 2]!; n++; }
    if (n < 3) return null;
    mx /= n; my /= n; mz /= n;
    for (const e of byMat.values()) for (let i = 0; i + 2 < e.pos.length; i += 3) {
      const x = e.pos[i]! - mx, y = e.pos[i + 1]! - my, z = e.pos[i + 2]! - mz;
      cv[0] += x * x; cv[1] += x * y; cv[2] += x * z; cv[3] += y * y; cv[4] += y * z; cv[5] += z * z;
    }
    const ax = leastAxis3(cv);
    if (!ax) return null;
    let lo = Infinity, hi = -Infinity;
    for (const e of byMat.values()) for (let i = 0; i + 2 < e.pos.length; i += 3) {
      const d = (e.pos[i]! - mx) * ax[0] + (e.pos[i + 1]! - my) * ax[1] + (e.pos[i + 2]! - mz) * ax[2];
      if (d < lo) lo = d; if (d > hi) hi = d;
    }
    return hi - lo <= 0.6 ? [ax[0], ax[1], ax[2], Math.max(0.02, (hi - lo) / 2)] : null;
  }
  function throwGroup(seam: StructureDamageSeam, rule: PieceRule, tris: Tri[], salt: number, dirX: number, dirZ: number,
    settled: boolean, kinematic = false): boolean {
    if (!tris.length) return false;
    const a = seam.anatomy, { x: px, y: py, z: pz, yaw } = a.placement;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    // the bounds in the body frame
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const t of tris) {
      const M = spanMatrix(t.span), arr = t.span.position.array as Float32Array;
      for (let k = 0; k < 3; k++) {
        const i = t.at + k;
        _v.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).applyMatrix4(M);
        const wx = _v.x - px, wz = _v.z - pz, bx = wx * c - wz * s, by = _v.y - py, bz = wx * s + wz * c;
        if (bx < x0) x0 = bx; if (bx > x1) x1 = bx; if (by < y0) y0 = by; if (by > y1) y1 = by; if (bz < z0) z0 = bz; if (bz > z1) z1 = bz;
      }
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    const hx = Math.max(0.05, (x1 - x0) / 2), hy = Math.max(0.05, (y1 - y0) / 2), hz = Math.max(0.05, (z1 - z0) / 2);
    // its triangles by material, in the box's frame (the body frame's axes about its centre)
    const byMat = new Map<THREE.Material, { layout: Layout; geometry: THREE.BufferGeometry; pos: number[]; nrm: number[]; extra: number[][] }>();
    for (const t of tris) {
      const mesh = t.span.mesh as THREE.Mesh;
      const geometry = mesh.geometry as THREE.BufferGeometry;
      const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material;
      let e = byMat.get(material);
      if (!e) { const layout = layoutOf(geometry); e = { layout, geometry, pos: [], nrm: [], extra: layout.names.map(() => []) }; byMat.set(material, e); }
      const M = spanMatrix(t.span);
      _nm.getNormalMatrix(M);
      const arr = t.span.position.array as Float32Array, N = geometry.getAttribute('normal');
      for (let k = 0; k < 3; k++) {
        const i = t.at + k;
        _v.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).applyMatrix4(M);
        const wx = _v.x - px, wz = _v.z - pz;
        e.pos.push(wx * c - wz * s - cx, _v.y - py - cy, wx * s + wz * c - cz);
        if (N) { _n.set(N.getX(i), N.getY(i), N.getZ(i)).applyMatrix3(_nm).normalize(); e.nrm.push(_n.x * c - _n.z * s, _n.y, _n.x * s + _n.z * c); }
        else e.nrm.push(0, 1, 0);
        e.layout.names.forEach((name, j) => {
          const attr = (e!.geometry.getAttribute(name) as THREE.BufferAttribute | undefined) ?? null;
          const size = e!.layout.sizes[j];
          for (let q = 0; q < size; q++) e!.extra[j].push(attr && q < attr.itemSize ? attr.getComponent(i, q) : name === 'color' ? 1 : 0);
        });
      }
    }
    const meshes: THREE.Mesh[] = [];
    for (const [material, e] of byMat) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(e.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(e.nrm, 3));
      e.layout.names.forEach((name, j) => g.setAttribute(name, new THREE.Float32BufferAttribute(e.extra[j], e.layout.sizes[j])));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, material);
      mesh.name = `fx-landmark-piece-${seam.structureIdx}-${salt}`;
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      o.group.add(mesh);
      meshes.push(mesh);
      drawn.push(mesh);
    }
    // (round 4) a flat piece standing across its body frame's axes (a diagonal plate: its box a fat block round it, which
    // lands on its base and holds the plate upright) falls as a tween to its broad side, never as that box
    const plate = plateAxis(byMat);
    if (plate && Math.abs(plate[1]) < 0.5 && Math.max(Math.abs(plate[0]), Math.abs(plate[2])) < 0.9) kinematic = true;
    // (round 4; the census's delta #9: a farmhouse's roof slope, 12.6 x 4.1 m at 43 degrees across a box near square in
    // section, rolled on landing and stood on its edge in a late joiner's page) a plate its box does not lie along — the
    // box's thinnest axis not its own — falls as a tween to its broad side too
    if (plate && !kinematic) {
      const thin = hx <= hy && hx <= hz ? 0 : hy <= hz ? 1 : 2;
      if (Math.abs(plate[thin]) < 0.9) kinematic = true;
    }
    // the body: its box, its density; spawned where it stood, turned as the set piece is
    const massKg = 8 * hx * hy * hz * rule.density;
    const shape = createRigidBox(hx, hy, hz, rule.density, { restitution: 0.12, friction: 0.7, rolling: 0.3, forceSleepS: 8 });
    const wcx = px + cx * c + cz * s, wcy = py + cy, wcz = pz - cx * s + cz * c;
    _q.setFromAxisAngle(_up, yaw);
    const rng = damageRng(damageSeed(a.seed, 0x1b07, salt));
    // how it leaves (body frame, then the world's): a leaf tips about its hinge, its free end (toward the meeting line,
    // body z 0) first; a counterweight drops off its balance a little outward; an arm goes over outward from the road
    let wbx = 0, wby = (rng() - 0.5) * 0.2, wbz = 0, vbx = 0, vby = -0.3, vbz = 0;
    if (rule.kind === 'leaf') { wbx = (cz < 0 ? 1 : -1) * (0.7 + 0.3 * rng()); vby = -0.6; }
    else if (rule.kind === 'drop') { vbz = (cz < 0 ? -1 : 1) * (0.4 + 0.3 * rng()); wbx = (rng() - 0.5) * 0.8; }
    else { wbz = (cx < 0 ? 1 : -1) * (1.1 + 0.4 * rng()); vbx = (cx < 0 ? -1 : 1) * 0.3; }
    // a blow's push along it (the stage's direction, a little)
    const handle = settled || kinematic ? -1 : o.pool.spawn(shape, {
      x: wcx, y: wcy, z: wcz, qx: _q.x, qy: _q.y, qz: _q.z, qw: _q.w,
      vx: vbx * c + vbz * s + dirX * 0.4, vy: vby, vz: -vbx * s + vbz * c + dirZ * 0.4,
      wx: wbx * c + wbz * s, wy: wby, wz: -wbx * s + wbz * c,
    });
    if (handle < 0) {
      // settled, or no room (a barrage's collapses at once): it lies on the ground under where it stood, its thinnest side
      // down (an upright arm laid along the road's edge), never standing there
      const q0 = _q.clone();
      // (destruction-slabs 227 round 4; the census's delta #9 farmhouse: a 12.6 x 4.1 m plate diagonal in its body's plan
      // laid in a late joiner's page standing on its edge — its box read thin upright) a flat piece lies on its broad side
      // whatever its heading: its drawing's least axis turned up
      let half = Math.min(hx, hy, hz);
      if (plate) {
        _pn.set(plate[0], plate[1], plate[2]);
        _q.multiply(_tq.setFromUnitVectors(_pn, _pu.set(0, plate[1] >= 0 ? 1 : -1, 0)));
        half = plate[3];
      } else if (hx < hy && hx <= hz) _q.multiply(_tq.setFromAxisAngle(_fwd, Math.PI / 2));
      else if (hz < hy && hz < hx) _q.multiply(_tq.setFromAxisAngle(_right, Math.PI / 2));
      const restY = o.groundAt(wcx, wcz) + half + 0.02;
      if (kinematic && !settled) {
        // (destruction-slabs 227 round 3) a hanging part no box holds well (a mill's sails, a gutter round a corner): it
        // falls where it hung under gravity's time, turning over to lie on its broad side, no body to land on
        const T = Math.max(0.35, Math.min(1.4, Math.sqrt(2 * Math.max(0.1, wcy - restY) / 9.81)));
        tweens.push({ meshes, x: wcx, z: wcz, y0: wcy, y1: restY, q0, q1: _q.clone(), t: 0, T, structureIdx: seam.structureIdx, massKg });
        _m.compose(_v.set(wcx, wcy, wcz), q0, _s);
      } else _m.compose(_v.set(wcx, restY, wcz), _q, _s);
      for (const m of meshes) { m.matrix.copy(_m); m.matrixWorldNeedsUpdate = true; }
      // (round 4) laid at rest: no piece of its drawing stands upright on its edge (uprightPlates.ts)
      if (!(kinematic && !settled)) layDown(meshes);
      baked++;
      return true;
    }
    const b: LiveBody = { handle, meshes, structureIdx: seam.structureIdx, still: 0, age: 0, massKg, sounds: 0, pose: new Float64Array(7).fill(NaN) };
    live.push(b);
    byHandle.set(handle, b);
    pose[0] = wcx; pose[1] = wcy; pose[2] = wcz; pose[3] = _q.x; pose[4] = _q.y; pose[5] = _q.z; pose[6] = _q.w;
    write(b, pose);
    // what it stood over of its own records stops holding it (a leaf over its gap); world bounds of its footprint
    if (rule.kind === 'leaf') {
      let mx0 = Infinity, mz0 = Infinity, mx1 = -Infinity, mz1 = -Infinity;
      for (const [bx, bz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
        const wx = px + bx * c + bz * s, wz = pz - bx * s + bz * c;
        mx0 = Math.min(mx0, wx); mx1 = Math.max(mx1, wx); mz0 = Math.min(mz0, wz); mz1 = Math.max(mz1, wz);
      }
      o.pass(seam.structureIdx, mx0 - 0.2, mz0 - 0.2, mx1 + 0.2, mz1 + 0.2);
    }
    return true;
  }

  /** A triangle out of its bucket (onto its first corner; its span kept for the reset). */
  function hideTri(span: StructureSpan, at: number): void {
    o.keepSpan(span);
    const arr = span.position.array as Float32Array;
    for (let k = 1; k < 3; k++) { arr[(at + k) * 3] = arr[at * 3]; arr[(at + k) * 3 + 1] = arr[at * 3 + 1]; arr[(at + k) * 3 + 2] = arr[at * 3 + 2]; }
  }
  /** Whether a group's box holds it well enough to be its body (box-like, or small): a thin plate, a long rail or a sparse
   *  cross falls as a tween instead (a box round it would stand invisible where it lands). */
  function compact(seam: StructureDamageSeam, g: ReadonlyArray<{ span: StructureSpan; at: number }>): boolean {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    const { x: px, z: pz, yaw } = seam.anatomy.placement, c = Math.cos(yaw), s = Math.sin(yaw);
    for (const t of g) {
      const M = spanMatrix(t.span), arr = t.span.position.array as Float32Array;
      for (let k = 0; k < 3; k++) {
        _v.set(arr[(t.at + k) * 3], arr[(t.at + k) * 3 + 1], arr[(t.at + k) * 3 + 2]).applyMatrix4(M);
        const wx = _v.x - px, wz = _v.z - pz, bx = wx * c - wz * s, bz = wx * s + wz * c;
        if (bx < x0) x0 = bx; if (bx > x1) x1 = bx; if (_v.y < y0) y0 = _v.y; if (_v.y > y1) y1 = _v.y; if (bz < z0) z0 = bz; if (bz > z1) z1 = bz;
      }
    }
    // (and not standing tall: a chimney's box thrown upright stood on the floor and a roof slab leant on its head at the
    // eaves — a tall part falls over as it drops, to lie on its broad side)
    if (y1 - y0 > 1.5 * Math.max(x1 - x0, z1 - z0) && y1 - y0 > 1) return false;
    const e = [x1 - x0, y1 - y0, z1 - z0].sort((p, q) => q - p);
    return e[1]! <= 1.5 || e[2]! >= 0.3 * e[1]!;
  }
  /** Whether a group goes round the building's middle in plan (a mill's stage round its tower, a balcony's rail round a
   *  corner): no body or fall holds it as drawn (a box round it stood on its braces over the ruin, its deck in the air) —
   *  it breaks up where it hung. */
  function rings(seam: StructureDamageSeam, g: ReadonlyArray<{ span: StructureSpan; at: number }>): boolean {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    const { x: px, z: pz, yaw } = seam.anatomy.placement, c = Math.cos(yaw), s = Math.sin(yaw);
    for (const t of g) {
      const M = spanMatrix(t.span), arr = t.span.position.array as Float32Array;
      for (let k = 0; k < 3; k++) {
        _v.set(arr[(t.at + k) * 3], arr[(t.at + k) * 3 + 1], arr[(t.at + k) * 3 + 2]).applyMatrix4(M);
        const wx = _v.x - px, wz = _v.z - pz, bx = wx * c - wz * s, bz = wx * s + wz * c;
        if (bx < x0) x0 = bx; if (bx > x1) x1 = bx; if (bz < z0) z0 = bz; if (bz > z1) z1 = bz;
      }
    }
    return x0 < -0.5 && x1 > 0.5 && z0 < -0.5 && z1 > 0.5;
  }
  /** A span's triangles out of its bucket (onto their first corner; kept for the reset). */
  function hideSpan(span: StructureSpan): void {
    o.keepSpan(span);
    const arr = span.position.array as Float32Array;
    const x = arr[span.first * 3], y = arr[span.first * 3 + 1], z = arr[span.first * 3 + 2];
    for (let i = span.first; i < span.first + span.count; i++) { arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z; }
    span.position.addUpdateRange(span.first * 3, span.count * 3);
    span.position.needsUpdate = true;
  }

  /** A mesh's triangles copied out as a span of their own (non-indexed, the mesh's world matrix): a body's source. */
  function copySpan(mesh: THREE.Mesh, tris: readonly number[]): Tri[] {
    const g = mesh.geometry as THREE.BufferGeometry, ix = g.index;
    const out = new THREE.BufferGeometry();
    for (const [name, raw] of Object.entries(g.attributes)) {
      const attr = raw as THREE.BufferAttribute, size = attr.itemSize;
      const arr = new Float32Array(tris.length * 3 * size);
      tris.forEach((t, n) => {
        for (let k = 0; k < 3; k++) {
          const i = ix ? ix.getX(t * 3 + k) : t * 3 + k;
          for (let q = 0; q < size; q++) arr[(n * 3 + k) * size + q] = attr.getComponent(i, q);
        }
      });
      out.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    const copy = new THREE.Mesh(out, mesh.material);
    mesh.updateWorldMatrix(true, false);
    copy.matrix.copy(mesh.matrixWorld);
    copy.matrixAutoUpdate = false;
    const span = { mesh: copy, geometryId: null, instanceId: null, position: out.getAttribute('position'), bucket: '', partClass: '',
      first: 0, count: tris.length * 3, piece: null } as unknown as StructureSpan;
    return tris.map((_t, n) => ({ span, at: n * 3 }));
  }

  return {
    handles: (builder) => !!RULES[builder],
    dropMeshPieces(seam, pieces, settled = false) {
      const order = pieces.map((_p, i) => i).sort((p, q) => pieces[q]!.tris.length - pieces[p]!.tris.length || p - q);
      let thrown = 0;
      order.forEach((pi, n) => {
        const pc = pieces[pi]!;
        if (!pc.tris.length) return;
        const list = copySpan(pc.mesh, pc.tris);
        const salt = damageSeed(seam.structureIdx, 0x4a7, pi, pc.tris.length);
        if (n < HANGING_BODIES && !rings(seam, list) && throwGroup(seam, HANGING_RULE, list, salt, 0, 0, settled, !compact(seam, list))) thrown++;
        else if (!settled) {
          const t = list[0]!, arr = t.span.position.array as Float32Array;
          _v.set(arr[0], arr[1], arr[2]).applyMatrix4(spanMatrix(t.span));
          o.onLanding?.(_v.x, _v.y, _v.z, 3, 40, seam.structureIdx);
        }
      });
      return thrown;
    },
    drop(seam, groups, settled = false) {
      // the largest first (by triangles): a few bodies, the rest out with their dust
      const order = groups.map((_g, i) => i).sort((p, q) => groups[q]!.length - groups[p]!.length || p - q);
      let thrown = 0;
      const touched = new Set<StructureSpan>();
      order.forEach((gi, n) => {
        const g = groups[gi]!;
        if (!g.length) return;
        const salt = damageSeed(seam.structureIdx, 0x4a6, gi, g.length);
        if (n < HANGING_BODIES && !rings(seam, g) && throwGroup(seam, HANGING_RULE, g as Tri[], salt, 0, 0, settled, !compact(seam, g))) thrown++;
        else if (!settled) {
          // its dust where it was
          const t = g[0]!, arr = t.span.position.array as Float32Array, M = spanMatrix(t.span);
          _v.set(arr[t.at * 3], arr[t.at * 3 + 1], arr[t.at * 3 + 2]).applyMatrix4(M);
          o.onLanding?.(_v.x, _v.y, _v.z, 3, 40, seam.structureIdx);
        }
        for (const t of g) { hideTri(t.span, t.at); touched.add(t.span); }
      });
      for (const span of touched) { span.position.addUpdateRange(span.first * 3, span.count * 3); span.position.needsUpdate = true; }
      if (touched.size) seam.touchShadows();
      return thrown;
    },
    stage(seam, stage, dirX, dirZ, settled = false) {
      const rules = RULES[seam.builder];
      const rank = STAGE_RANK[stage] ?? 0;
      if (!rules || !rank) return 0;
      let done = taken.get(seam.structureIdx);
      if (!done) { done = new Set(); taken.set(seam.structureIdx, done); }
      // the groups due: every listed piece of this stage or an earlier one not taken yet
      const groups = new Map<string, { rule: PieceRule; spans: StructureSpan[] }>();
      for (const span of seam.spans) {
        const name = span.piece;
        if (!name || done.has(name) || span.count < 3) continue;
        const rule = rules.find((r) => r.match.test(name));
        if (!rule || (STAGE_RANK[rule.at] ?? 9) > rank) continue;
        const key = rule.group(name);
        let g = groups.get(key);
        if (!g) { g = { rule, spans: [] }; groups.set(key, g); }
        g.spans.push(span);
      }
      let thrown = 0, salt = 0;
      for (const [key, g] of groups) {
        // the triangles (a group split at the body frame's z 0: the two leaves)
        const sides: Tri[][] = g.rule.split ? [[], []] : [[]];
        const { x: px, z: pz, yaw } = seam.anatomy.placement;
        const c = Math.cos(yaw), s = Math.sin(yaw);
        for (const span of g.spans) {
          const M = spanMatrix(span), arr = span.position.array as Float32Array;
          const start = span.first + ((3 - (span.first % 3)) % 3);
          for (let i = start; i + 2 < span.first + span.count; i += 3) {
            let side = 0;
            if (g.rule.split) {
              let bz = 0;
              for (let k = 0; k < 3; k++) {
                _v.set(arr[(i + k) * 3], arr[(i + k) * 3 + 1], arr[(i + k) * 3 + 2]).applyMatrix4(M);
                bz += (_v.x - px) * s + (_v.z - pz) * c;
              }
              side = bz < 0 ? 0 : 1;
            }
            sides[side].push({ span, at: i });
          }
        }
        for (const tris of sides) if (throwGroup(seam, g.rule, tris, damageSeed(seam.structureIdx, salt++, key.length), dirX, dirZ, settled)) thrown++;
        for (const span of g.spans) { hideSpan(span); if (span.piece) done.add(span.piece); }
      }
      if (thrown) seam.touchShadows();
      return thrown;
    },
    update(dtS) {
      clock += Math.max(0, dtS);
      for (let i = tweens.length - 1; i >= 0; i--) {
        const w = tweens[i]!;
        w.t = Math.min(w.T, w.t + Math.max(0, dtS));
        const u = w.t / w.T;
        _tq.slerpQuaternions(w.q0, w.q1, Math.min(1, u * 1.4));
        _m.compose(_v.set(w.x, w.y0 + (w.y1 - w.y0) * u * u, w.z), _tq, _s);
        for (const m of w.meshes) { m.matrix.copy(_m); m.matrixWorldNeedsUpdate = true; }
        if (u >= 1) {
          layDown(w.meshes);
          o.onLanding?.(w.x, w.y1, w.z, Math.min(9, 9.81 * w.T), w.massKg, w.structureIdx);
          tweens[i] = tweens[tweens.length - 1]!; tweens.length--;
        }
      }
      for (let i = live.length - 1; i >= 0; i--) {
        const b = live[i];
        if (!o.pool.framePoseAt(b.handle, pose)) { unlist(b); continue; }
        write(b, pose);
        b.age += dtS;
        b.still = o.pool.asleep(b.handle) ? b.still + dtS : 0;
        // (round 4; the census's delta #9: a dropped wall's plate stood on its edge in a late joiner's page, its box lying
        // well, before the bake came round) asleep a moment: no piece of its drawing stands upright
        if (b.still >= 0.2 && !b.laid) { b.laid = true; for (const m of b.meshes) layUprightPlates(m.geometry, m.matrix, groundOf); }
        // still: it stays drawn where it lies, its body gone from the pool
        // (round 5: the census's airfield #8 fire station on the phone — a piece's body rocking on the heap for good, never
        // asleep, its plate held a metre up on the body's box) one in the world that has all but stopped a while on lies where it is
        const creeping = b.age >= CREEP_AGE_S && o.pool.inWorld(b.handle) && o.pool.velocity(b.handle, _vel) && Math.hypot(_vel[0]!, _vel[1]!, _vel[2]!) < CREEP_MPS
          && Math.hypot(_vel[3]!, _vel[4]!, _vel[5]!) < CREEP_RADS;
        if (b.still >= BAKE_STILL_S || b.age >= BAKE_AGE_S || creeping) {
          o.pool.release(b.handle); unlist(b); baked++;
          // (round 5: the same fire station's 4 m plate came to rest on a body a metre thick, half of it over nothing)
          layDown(b.meshes);
        }
      }
    },
    liveBodies: () => live.length,
    reset() {
      for (const b of live) o.pool.release(b.handle);
      live.length = 0;
      byHandle.clear();
      taken.clear();
      tweens.length = 0;
      for (const m of drawn) { m.removeFromParent(); m.geometry.dispose(); }
      drawn.length = 0;
      baked = 0;
    },
    stats: () => ({ bodies: live.length, baked, taken: [...taken.values()].reduce((n, set) => n + set.size, 0) }),
  };
}
