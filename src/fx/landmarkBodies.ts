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
  update(dtS: number): void;
  liveBodies(): number;
  reset(): void;
  stats(): { bodies: number; baked: number; taken: number };
}

interface LiveBody { handle: number; meshes: THREE.Mesh[]; structureIdx: number; still: number; age: number; massKg: number;
  sounds: number; pose: Float64Array }

/** A material's vertex layout as a span's mesh carries it (position and normal first; the mask's tags left out). */
interface Layout { names: string[]; sizes: number[] }

const BAKE_STILL_S = 1.5, BAKE_AGE_S = 30;

export function createLandmarkBodies(o: LandmarkBodiesOptions): LandmarkBodies {
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
      if (hx < hy && hx <= hz) _q.multiply(_tq.setFromAxisAngle(_fwd, Math.PI / 2));
      else if (hz < hy && hz < hx) _q.multiply(_tq.setFromAxisAngle(_right, Math.PI / 2));
      const restY = o.groundAt(wcx, wcz) + Math.min(hx, hy, hz) + 0.02;
      if (kinematic && !settled) {
        // (destruction-slabs 227 round 3) a hanging part no box holds well (a mill's sails, a gutter round a corner): it
        // falls where it hung under gravity's time, turning over to lie on its broad side, no body to land on
        const T = Math.max(0.35, Math.min(1.4, Math.sqrt(2 * Math.max(0.1, wcy - restY) / 9.81)));
        tweens.push({ meshes, x: wcx, z: wcz, y0: wcy, y1: restY, q0, q1: _q.clone(), t: 0, T, structureIdx: seam.structureIdx, massKg });
        _m.compose(_v.set(wcx, wcy, wcz), q0, _s);
      } else _m.compose(_v.set(wcx, restY, wcz), _q, _s);
      for (const m of meshes) { m.matrix.copy(_m); m.matrixWorldNeedsUpdate = true; }
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
    const e = [x1 - x0, y1 - y0, z1 - z0].sort((p, q) => q - p);
    return e[1]! <= 1.5 || e[2]! >= 0.3 * e[1]!;
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

  return {
    handles: (builder) => !!RULES[builder],
    drop(seam, groups, settled = false) {
      // the largest first (by triangles): a few bodies, the rest out with their dust
      const order = groups.map((g, i) => i).sort((p, q) => groups[q]!.length - groups[p]!.length || p - q);
      let thrown = 0;
      const touched = new Set<StructureSpan>();
      order.forEach((gi, n) => {
        const g = groups[gi]!;
        if (!g.length) return;
        const salt = damageSeed(seam.structureIdx, 0x4a6, gi, g.length);
        if (n < HANGING_BODIES && throwGroup(seam, HANGING_RULE, g as Tri[], salt, 0, 0, settled, !compact(seam, g))) thrown++;
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
        // still: it stays drawn where it lies, its body gone from the pool
        if (b.still >= BAKE_STILL_S || b.age >= BAKE_AGE_S) { o.pool.release(b.handle); unlist(b); baked++; }
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
