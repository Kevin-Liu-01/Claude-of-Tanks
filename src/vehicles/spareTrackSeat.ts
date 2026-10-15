/**
 * One seat solver for every spare-track run (VEH-13, the owner 2026-10-14: "fix the track randomly placed on the gun
 * of the strv. bruh, audit all these track decorations for placement and not hanging off or having weird placements").
 *
 * Four placement paths used to seat spare links with no shared rule: the decor slot solver posed a rigid run from one
 * ray hit (the Strv 103A's run lay on the 10 degree crown facet of its hull-printed L74), and the authored fittings,
 * strips and hand-drawn links were never re-checked against the armour that grew round them later (51 runs ended up
 * buried, others hang off plate edges or ride launchers and cloth). Every run now goes through this module:
 *
 *   R1 host       every footprint probe lands on structural armour (or painted equipment) of the run's own frame,
 *                 never on the gun, mantlet, weapons, sights, hatches, grilles, lights, launchers, antennas, ERA,
 *                 soft loads, decor, another run, running gear or a field suit
 *   R2 support    a 5 x 3 probe grid over the footprint meets that host within the design standoff + 12 mm, each hit
 *                 normal within 20 degrees of the seat normal (a run across a tube fails on the facet spread)
 *   R3 outside    the probes are cast from outside the run along the mount axis, so the first surface they meet is the
 *                 host; a run under a later armour plate meets the plate first and fails (link embed at most 1 cm)
 *   R4 static     the placed box keeps 5 cm from the gun and mantlet and 3 cm from every other forbidden role, and no
 *                 host surface cuts into the links
 *   R5 motion     hull runs clear the turret and the gun over the full traverse and the yaw-dependent pitch range
 *                 (armour-limited poses skipped); turret runs clear the gun's pitch range and the hull's solids during
 *                 traverse (where the turret's own surface already meets the hull, the host is at fault, not the run)
 *   R6 no hang    a run with no passing seat is not built; the caller records it as rejected
 *   R7 visible    the run's top face must see outside in at least 30 % of a hemisphere of directions
 *
 * R8 (one source per frame) is the decor's: a generic decor run never joins a frame that already carries an
 * authored one (decorations.ts).
 *
 * The solver is Node-runnable, draws no randomness and tries candidates in a fixed order. A run whose authored seat
 * passes is accepted unchanged (its geometry is not touched); a failing one is re-seated from outside by a local
 * search, or dropped. Build-time only, but scratch vectors are reused.
 */
import * as THREE from 'three';

// ---------------------------------------------------------------------------------------------------------------- roles

/** What a surface is, for seating: hosts are `armor` and `equipment`; every other role is forbidden under a run. */
export type SeatRole =
  | 'armor' | 'equipment' | 'gun' | 'mantlet' | 'weapon' | 'sight' | 'hatch' | 'grille' | 'light' | 'launcher'
  | 'antenna' | 'era' | 'soft' | 'decor' | 'run' | 'gear' | 'suit' | 'fitting' | 'ignore';

const ROLE_LIST: readonly SeatRole[] = ['armor', 'equipment', 'gun', 'mantlet', 'weapon', 'sight', 'hatch', 'grille',
  'light', 'launcher', 'antenna', 'era', 'soft', 'decor', 'run', 'gear', 'suit', 'fitting', 'ignore'];
const ROLE_CODE: Readonly<Record<SeatRole, number>> = Object.fromEntries(ROLE_LIST.map((r, i) => [r, i])) as
  Record<SeatRole, number>;
const HOST_CODES = new Set([ROLE_CODE.armor, ROLE_CODE.equipment]);
const IGNORE_CODE = ROLE_CODE.ignore;
/**
 * Static clearance per forbidden role (m): the main gun and its mantlet 5 cm, everything else 3 cm. Another run, the
 * running gear under a fender, a field suit and decor only may not be entered (an authored course of several carriers
 * side by side is one stowage arrangement; the decor keeps its own overlap ledger).
 */
const TOUCH_ONLY = new Set([ROLE_CODE.run, ROLE_CODE.gear, ROLE_CODE.suit, ROLE_CODE.decor]);
const ROLE_CLEAR_M = (code: number): number => (code === ROLE_CODE.gun || code === ROLE_CODE.mantlet ? 0.05
  : TOUCH_ONLY.has(code) ? 0 : 0.03);

/** The role a factory bucket's parts carry (before any part tag). */
export function seatRoleForBucket(bucket: string): SeatRole {
  if (/^gunMount/.test(bucket)) return /Glass$/.test(bucket) ? 'sight' : 'mantlet';
  if (/^(gun|hullGun)/.test(bucket)) return 'gun';
  if (/(Hatch|Cupola)$/.test(bucket)) return 'hatch';
  if (/Glass$/.test(bucket)) return 'sight';
  if (/(Cloth|CanvasPale|Wood|Bark|Rubber)$/.test(bucket)) return 'soft';
  if (/^(hull|turret)Track$/.test(bucket)) return 'run';
  if (/RunningGear|^gear/.test(bucket)) return 'gear';
  if (/Shadow$/.test(bucket)) return 'ignore';
  if (/OpenLattice|FittingPaint/.test(bucket)) return 'fitting';
  if (/Equipment$/.test(bucket)) return 'equipment';
  return 'armor';
}

/** Fitting types (profiles/kit.ts FITTINGS) by seat role; any other fitting is equipment that is not armour. */
const FITTING_ROLES: Readonly<Record<string, SeatRole>> = {
  pintleMG: 'weapon', americanM2: 'weapon', americanRws: 'weapon', openYokeRws: 'weapon', auxiliaryWeapon: 'weapon',
  smokeBank: 'launcher', lightCluster: 'light', antennaWhip: 'antenna', spareTrackLinks: 'run',
  stowageRack: 'soft', jerryCans: 'soft', towCable: 'soft', unditchingLog: 'soft',
};

/** The role of a scene mesh (merged bucket, fitting, decor, suit), or null to skip it entirely. */
export function seatRoleForMesh(mesh: THREE.Object3D): SeatRole | null {
  const name = mesh.name || '';
  const data = mesh.userData || {};
  if (data.fieldSuit === true || /ghillie/i.test(name)) return 'suit';
  if (data.runningGear === true || /^gear/.test(name)) return 'gear';
  if (data.__decor === true || name.startsWith('decor_')) return 'decor';
  if (/vehicleMarking|procShadow|muzzleBore|decal/i.test(name)) return null;
  if (typeof data.fitting === 'string') return FITTING_ROLES[data.fitting] ?? 'fitting';
  if (data.auxiliaryPivot || /auxiliary|sourceMachineGun/i.test(name)) return 'weapon';
  return seatRoleForBucket(name);
}

/** A part's own tag wins over its bucket: ERA, launchers, smoke tubes, lights, sights and explicit seat roles. */
export function seatRoleForPart(bucket: string, part: THREE.BufferGeometry, era = false): SeatRole {
  const data = part.userData || {};
  if (typeof data.seatRole === 'string' && (ROLE_LIST as readonly string[]).includes(data.seatRole)) {
    return data.seatRole as SeatRole;
  }
  if (data.spareTrackRun) return 'run';
  if (era) return 'era';
  if (data.weaponStock) return data.weaponStock.module === 'missileRack' ? 'launcher' : 'weapon';
  if (data.auxiliaryStation) return 'weapon';
  if (data.smokeAperture || data.openSmokeAperture) return 'launcher';
  if (data.vehicleNightLens) return 'light';
  if (data.glassSurround) return 'sight';
  return seatRoleForBucket(bucket);
}

const _tagSeatRole = (geometry: THREE.BufferGeometry, role: SeatRole): void => {
  geometry.userData.seatRole = role;
};

/**
 * Run `fill` with a port whose every added part carries `role` (grilles, louvres, exhausts drawn into ordinary
 * buckets). Semantic tagging where the part is drawn, never a position change.
 */
export function withSeatRole<P extends object>(P: P, role: SeatRole, fill: (port: P) => void): void {
  fill(taggingPort(P, (geometry) => _tagSeatRole(geometry, role)));
}

/** A hand-drawn spare-link run's registration (`withSpareTrackRun`). */
export interface SpareTrackRunTag {
  readonly site: string;
  readonly source: 'strip' | 'adhoc';
  /** Run-local frame rotation (Euler XYZ) the links were authored in: local +Y out of the host, links along Z. */
  readonly rotation: readonly [number, number, number];
  /** Run-local mount axis: 1 = +Y (strips and hand-drawn links), 2 = +Z (decor). */
  readonly axis?: 1 | 2;
  /** Height of the link backs above the design host plane (m): 0.018 for a railed carrier, 0 for bare links. */
  readonly standoffM?: number;
  /** How far the base is set into the host by design (m). */
  readonly embedM?: number;
}

/**
 * Register the parts `fill` adds as ONE rigid spare-track run (S3): the shapes are kept as drawn; the seat pass moves
 * the whole unit, or drops it when no seat passes. `rotation` is the frame the run was laid out in (its local +Y out
 * of the host). Each call is its own run, even with the same site name.
 */
export function withSpareTrackRun<P extends object>(P: P, tag: SpareTrackRunTag, fill: (port: P) => void): void {
  const run = spareTrackRunTag(tag);
  fill(taggingPort(P, (geometry) => { geometry.userData.spareTrackRun = run; }));
}
let runSerial = 0;
/** A fresh run registration: every geometry carrying the same object is one rigid run. */
export function spareTrackRunTag(tag: SpareTrackRunTag): SpareTrackRunTag & { readonly id: number } {
  return { ...tag, id: ++runSerial };
}
/** Mark one geometry as part of `run` (for sites that draw through a local helper rather than the port). */
export function spareTrackPart<G extends THREE.BufferGeometry>(run: SpareTrackRunTag & { readonly id: number }, geometry: G): G {
  geometry.userData.spareTrackRun = run;
  return geometry;
}

const TAGGED_ADDERS = new Set(['add', 'addEquipment', 'addHatch', 'addCupola', 'addExternalArmor', 'addMudguard',
  'addModuleVisual']);
function taggingPort<P extends object>(P: P, tag: (geometry: THREE.BufferGeometry) => void): P {
  return new Proxy(P, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (typeof key !== 'string' || !TAGGED_ADDERS.has(key) || typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        // the geometry follows the bucket (addMudguard and addModuleVisual lead with a label or module name)
        for (const arg of args) if (arg instanceof THREE.BufferGeometry) { tag(arg); break; }
        return Reflect.apply(value, target, args);
      };
    },
  });
}

// ----------------------------------------------------------------------------------------------------- triangle soup

/** One geometry feeding a soup: its triangles are mapped into the soup's frame by `matrix` (null = identity). */
export interface SeatSource {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4 | null;
  role: SeatRole;
  /** Vertex ranges (non-indexed vertex numbers) whose role differs from `role` (a merged bucket's tagged parts). */
  ranges?: ReadonlyArray<{ start: number; count: number; role: SeatRole }>;
  /** Run id this geometry belongs to (its own probes skip it), or 0. */
  owner: number;
  /** Not the run's own frame (the other articulation frame at rest): seen only by the exposure rays. */
  foreign?: boolean;
  /** Frame bounds, filled lazily. */
  bounds?: THREE.Box3;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _box = new THREE.Box3();

/** Bounds of a source in the soup frame (cached on the source). */
export function seatSourceBounds(source: SeatSource): THREE.Box3 {
  if (source.bounds) return source.bounds;
  const geometry = source.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox ? geometry.boundingBox.clone() : new THREE.Box3();
  if (source.matrix && !box.isEmpty()) box.applyMatrix4(source.matrix);
  source.bounds = box;
  return box;
}

/** Triangles of the sources overlapping a region, with their roles, owners and a BVH for rays and box queries. */
export class SeatSoup {
  readonly tri: Float32Array;
  readonly role: Uint8Array;
  readonly owner: Int32Array;
  readonly foreign: Uint8Array;
  readonly count: number;
  private readonly nodeBox: Float32Array;
  private readonly nodeLeft: Int32Array;
  private readonly nodeStart: Int32Array;
  private readonly nodeCount: Int32Array;
  private readonly order: Int32Array;
  private readonly stack: Int32Array;
  private nodes = 0;

  constructor(sources: readonly SeatSource[], region: THREE.Box3) {
    const tri: number[] = [], role: number[] = [], owner: number[] = [], foreign: number[] = [];
    for (const source of sources) {
      if (!seatSourceBounds(source).intersectsBox(region)) continue;
      const position = source.geometry.getAttribute('position');
      if (!position) continue;
      const index = source.geometry.index;
      const n = index ? index.count : position.count;
      const baseCode = ROLE_CODE[source.role];
      if (baseCode === IGNORE_CODE) continue;
      const ranges = source.ranges ?? [];
      for (let t = 0; t + 2 < n; t += 3) {
        const ia = index ? index.getX(t) : t, ib = index ? index.getX(t + 1) : t + 1, ic = index ? index.getX(t + 2) : t + 2;
        _a.fromBufferAttribute(position, ia); _b.fromBufferAttribute(position, ib); _c.fromBufferAttribute(position, ic);
        if (source.matrix) { _a.applyMatrix4(source.matrix); _b.applyMatrix4(source.matrix); _c.applyMatrix4(source.matrix); }
        _box.makeEmpty().expandByPoint(_a).expandByPoint(_b).expandByPoint(_c);
        if (!_box.intersectsBox(region)) continue;
        let code = baseCode;
        for (const r of ranges) if (t >= r.start && t < r.start + r.count) { code = ROLE_CODE[r.role]; break; }
        if (code === IGNORE_CODE) continue;
        tri.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, _c.x, _c.y, _c.z);
        role.push(code); owner.push(source.owner); foreign.push(source.foreign ? 1 : 0);
      }
    }
    this.tri = new Float32Array(tri);
    this.role = Uint8Array.from(role);
    this.owner = Int32Array.from(owner);
    this.foreign = Uint8Array.from(foreign);
    this.count = role.length;
    // median splits stop at four triangles, so a leaf holds at least two: at most count - 1 nodes
    const maxNodes = Math.max(1, 2 * this.count);
    this.nodeBox = new Float32Array(maxNodes * 6);
    this.nodeLeft = new Int32Array(maxNodes);
    this.nodeStart = new Int32Array(maxNodes);
    this.nodeCount = new Int32Array(maxNodes);
    this.order = new Int32Array(this.count);
    for (let i = 0; i < this.count; i++) this.order[i] = i;
    this.stack = new Int32Array(128);
    if (this.count) this.build();
  }

  private build(): void {
    const cent = new Float32Array(this.count * 3);
    for (let i = 0; i < this.count; i++) {
      const o = i * 9;
      for (let k = 0; k < 3; k++) cent[i * 3 + k] = (this.tri[o + k] + this.tri[o + 3 + k] + this.tri[o + 6 + k]) / 3;
    }
    const todo: Array<[number, number, number]> = [[this.alloc(0, this.count), 0, this.count]];
    while (todo.length) {
      const [node, start, count] = todo.pop()!;
      this.fitNode(node, start, count);
      if (count <= 4) continue;
      const b = node * 6;
      const ext = [this.nodeBox[b + 3] - this.nodeBox[b], this.nodeBox[b + 4] - this.nodeBox[b + 1],
        this.nodeBox[b + 5] - this.nodeBox[b + 2]];
      const axis = ext[0] >= ext[1] && ext[0] >= ext[2] ? 0 : ext[1] >= ext[2] ? 1 : 2;
      const slice = Array.from(this.order.subarray(start, start + count));
      slice.sort((p, q) => cent[p * 3 + axis] - cent[q * 3 + axis] || p - q);
      this.order.set(slice, start);
      const half = count >> 1;
      const left = this.alloc(start, half);
      const right = this.alloc(start + half, count - half);
      this.nodeLeft[node] = left;
      if (right !== left + 1) throw new Error('SeatSoup: non-adjacent children');
      todo.push([right, start + half, count - half], [left, start, half]);
    }
  }

  private alloc(start: number, count: number): number {
    const node = this.nodes++;
    this.nodeLeft[node] = -1;
    this.nodeStart[node] = start;
    this.nodeCount[node] = count;
    return node;
  }

  private fitNode(node: number, start: number, count: number): void {
    const b = node * 6;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = start; i < start + count; i++) {
      const o = this.order[i] * 9;
      for (let v = 0; v < 9; v += 3) {
        const x = this.tri[o + v], y = this.tri[o + v + 1], z = this.tri[o + v + 2];
        if (x < x0) x0 = x; if (y < y0) y0 = y; if (z < z0) z0 = z;
        if (x > x1) x1 = x; if (y > y1) y1 = y; if (z > z1) z1 = z;
      }
    }
    this.nodeBox[b] = x0; this.nodeBox[b + 1] = y0; this.nodeBox[b + 2] = z0;
    this.nodeBox[b + 3] = x1; this.nodeBox[b + 4] = y1; this.nodeBox[b + 5] = z1;
  }

  /**
   * Nearest triangle along the ray within [0, far] whose owner is not `skipOwner`; `foreignToo` admits the other
   * frame's triangles. The normal is the face normal turned toward the ray origin. Double-sided.
   */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, far: number, skipOwner: number, foreignToo: boolean,
    out: SeatHit): boolean {
    if (!this.count) return false;
    const ox = origin.x, oy = origin.y, oz = origin.z, dx = dir.x, dy = dir.y, dz = dir.z;
    const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
    let best = far, bestTri = -1, sp = 0;
    this.stack[sp++] = 0;
    while (sp) {
      const node = this.stack[--sp];
      const b = node * 6;
      let t0 = 0, t1 = best;
      let ta = (this.nodeBox[b] - ox) * ix, tb = (this.nodeBox[b + 3] - ox) * ix;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
      ta = (this.nodeBox[b + 1] - oy) * iy; tb = (this.nodeBox[b + 4] - oy) * iy;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
      ta = (this.nodeBox[b + 2] - oz) * iz; tb = (this.nodeBox[b + 5] - oz) * iz;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
      const left = this.nodeLeft[node];
      if (left >= 0) {
        if (sp + 2 > this.stack.length) continue;
        this.stack[sp++] = left + 1; this.stack[sp++] = left;
        continue;
      }
      const end = this.nodeStart[node] + this.nodeCount[node];
      for (let i = this.nodeStart[node]; i < end; i++) {
        const t = this.order[i];
        if (skipOwner && this.owner[t] === skipOwner) continue;
        if (!foreignToo && this.foreign[t]) continue;
        const d = this.intersect(t, ox, oy, oz, dx, dy, dz);
        if (d >= 0 && d < best) { best = d; bestTri = t; }
      }
    }
    if (bestTri < 0) return false;
    const o = bestTri * 9, tr = this.tri;
    const e1x = tr[o + 3] - tr[o], e1y = tr[o + 4] - tr[o + 1], e1z = tr[o + 5] - tr[o + 2];
    const e2x = tr[o + 6] - tr[o], e2y = tr[o + 7] - tr[o + 1], e2z = tr[o + 8] - tr[o + 2];
    out.n.set(e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x).normalize();
    if (out.n.x * dx + out.n.y * dy + out.n.z * dz > 0) out.n.negate();
    out.t = best;
    out.p.set(ox + dx * best, oy + dy * best, oz + dz * best);
    out.role = ROLE_LIST[this.role[bestTri]];
    out.host = HOST_CODES.has(this.role[bestTri]);
    out.tri = bestTri;
    return true;
  }

  private intersect(t: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number {
    const o = t * 9, tr = this.tri;
    const ax = tr[o], ay = tr[o + 1], az = tr[o + 2];
    const e1x = tr[o + 3] - ax, e1y = tr[o + 4] - ay, e1z = tr[o + 5] - az;
    const e2x = tr[o + 6] - ax, e2y = tr[o + 7] - ay, e2z = tr[o + 8] - az;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (det > -1e-12 && det < 1e-12) return -1;
    const inv = 1 / det;
    const sx = ox - ax, sy = oy - ay, sz = oz - az;
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) return -1;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) return -1;
    return (e2x * qx + e2y * qy + e2z * qz) * inv;
  }

  /** Visit every triangle (own frame only) whose bounds meet `box`. */
  forEachInBox(box: THREE.Box3, skipOwner: number, visit: (t: number) => void): void {
    if (!this.count) return;
    let sp = 0;
    this.stack[sp++] = 0;
    while (sp) {
      const node = this.stack[--sp];
      const b = node * 6;
      if (this.nodeBox[b] > box.max.x || this.nodeBox[b + 3] < box.min.x || this.nodeBox[b + 1] > box.max.y
        || this.nodeBox[b + 4] < box.min.y || this.nodeBox[b + 2] > box.max.z || this.nodeBox[b + 5] < box.min.z) continue;
      const left = this.nodeLeft[node];
      if (left >= 0) { if (sp + 2 <= this.stack.length) { this.stack[sp++] = left + 1; this.stack[sp++] = left; } continue; }
      const end = this.nodeStart[node] + this.nodeCount[node];
      for (let i = this.nodeStart[node]; i < end; i++) {
        const t = this.order[i];
        if ((skipOwner && this.owner[t] === skipOwner) || this.foreign[t]) continue;
        visit(t);
      }
    }
  }

  /** The triangle `t` into `target` (soup frame). */
  triangle(t: number, target: THREE.Triangle): THREE.Triangle {
    const o = t * 9, tr = this.tri;
    target.a.set(tr[o], tr[o + 1], tr[o + 2]);
    target.b.set(tr[o + 3], tr[o + 4], tr[o + 5]);
    target.c.set(tr[o + 6], tr[o + 7], tr[o + 8]);
    return target;
  }

  roleOf(t: number): SeatRole { return ROLE_LIST[this.role[t]]; }
}

export interface SeatHit { t: number; p: THREE.Vector3; n: THREE.Vector3; role: SeatRole; host: boolean; tri: number }
const newHit = (): SeatHit => ({ t: 0, p: new THREE.Vector3(), n: new THREE.Vector3(), role: 'armor', host: true, tri: -1 });

// ----------------------------------------------------------------------------------------------------------- motion

/** Gun rig sampled in 5 cm slices along its bore (gun-local: +Z out of the muzzle, pitch about +X at the origin). */
export interface SeatGunSlices {
  z0: number;
  step: number;
  /** xmin, xmax, ymin, ymax per slice (NaN when empty). */
  bins: Float32Array;
  count: number;
}

/** Build the gun's slices from gun-local geometry sources (the gun, gun-dark and mantlet buckets). */
export function seatGunSlices(sources: readonly SeatSource[], step = 0.05): SeatGunSlices | null {
  let z0 = Infinity, z1 = -Infinity;
  const v = new THREE.Vector3();
  const visit = (fn: (p: THREE.Vector3) => void): void => {
    for (const s of sources) {
      const pos = s.geometry.getAttribute('position');
      if (!pos) continue;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        if (s.matrix) v.applyMatrix4(s.matrix);
        fn(v);
      }
    }
  };
  visit((p) => { if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z; });
  if (!(z1 > z0)) return null;
  const count = Math.max(1, Math.ceil((z1 - z0) / step) + 1);
  const bins = new Float32Array(count * 4).fill(NaN);
  visit((p) => {
    const k = Math.min(count - 1, Math.max(0, Math.floor((p.z - z0) / step)));
    const o = k * 4;
    if (!(bins[o] <= p.x)) bins[o] = p.x;
    if (!(bins[o + 1] >= p.x)) bins[o + 1] = p.x;
    if (!(bins[o + 2] <= p.y)) bins[o + 2] = p.y;
    if (!(bins[o + 3] >= p.y)) bins[o + 3] = p.y;
  });
  return { z0, step, bins, count };
}

/** A radius profile around the turret axis (2 cm bins): the lowest (turret) or highest (hull) solid at each radius. */
export interface SeatRadialProfile { step: number; values: Float32Array; maxR: number }

/**
 * Lowest (`low`) or highest solid at each radius from the vertical axis through (ax, az), sampled on every triangle
 * at most `spacing` apart (a deck plate's middle counts, not only its corners), within [rMin, rMax] and, for a
 * highest profile, above `yFloor`.
 */
export function seatRadialProfile(sources: readonly SeatSource[], ax: number, az: number, low: boolean,
  rMin = 0, rMax = 8, yFloor = -Infinity, spacing = 0.05, step = 0.02): SeatRadialProfile {
  const n = Math.ceil(rMax / step) + 2;
  const values = new Float32Array(n).fill(low ? Infinity : -Infinity);
  let maxR = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
  const put = (q: THREE.Vector3): void => {
    const r = Math.hypot(q.x - ax, q.z - az);
    if (r < rMin || r > rMax) return;
    if (!low && q.y < yFloor) return;
    const k = Math.floor(r / step);
    if (low ? q.y < values[k] : q.y > values[k]) values[k] = q.y;
    if (r > maxR) maxR = r;
  };
  for (const s of sources) {
    if (ROLE_CODE[s.role] === IGNORE_CODE || s.role === 'gear' || s.role === 'suit' || s.role === 'run'
      || s.role === 'decor' || s.owner) continue;
    const pos = s.geometry.getAttribute('position');
    if (!pos) continue;
    const index = s.geometry.index;
    const cnt = index ? index.count : pos.count;
    for (let t = 0; t + 2 < cnt; t += 3) {
      a.fromBufferAttribute(pos, index ? index.getX(t) : t);
      b.fromBufferAttribute(pos, index ? index.getX(t + 1) : t + 1);
      c.fromBufferAttribute(pos, index ? index.getX(t + 2) : t + 2);
      if (s.matrix) { a.applyMatrix4(s.matrix); b.applyMatrix4(s.matrix); c.applyMatrix4(s.matrix); }
      const span = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
      const k = Math.min(24, Math.ceil(span / spacing));
      if (k <= 1) { put(a); put(b); put(c); continue; }
      for (let i = 0; i <= k; i++) {
        for (let j = 0; j <= k - i; j++) {
          const u = i / k, w = j / k;
          p.copy(a).multiplyScalar(1 - u - w).addScaledVector(b, u).addScaledVector(c, w);
          put(p);
        }
      }
    }
  }
  return { step, values, maxR };
}

function profileAt(profile: SeatRadialProfile, r: number, low: boolean): number {
  const k = Math.floor(r / profile.step);
  let v = low ? Infinity : -Infinity;
  for (let i = k - 1; i <= k + 1; i++) {
    if (i < 0 || i >= profile.values.length) continue;
    const x = profile.values[i];
    if (low ? x < v : x > v) v = x;
  }
  return v;
}

/** What moves round a run: the turret's traverse, the gun's pitch-by-yaw range, the casemate arc. */
export interface SeatMotion {
  /** Turret pivot (hull frame); the turret's rest pose is a pure translation to it. */
  pivot: THREE.Vector3;
  /** Gun pivot in the turret frame. */
  gunPivot: THREE.Vector3;
  /** True for a full-traverse turret; false for a casemate. */
  turreted: boolean;
  /** Gun yaw half-arc for a casemate with a moving mount (rad), 0 for a gun fixed in the hull. */
  arc: number;
  gun: SeatGunSlices | null;
  /** Lowest pitch (rad, negative = depressed) at a turret yaw, and the highest. */
  pitchMin(yaw: number): number;
  pitchMax: number;
  /** The turret's own lowest solid by radius (hull frame), excluding the gun rig. */
  turretLow: SeatRadialProfile | null;
  /** The hull's highest solid by radius (hull frame) for turret runs, built on demand. */
  hullHigh: (rMin: number, rMax: number, yFloor: number) => SeatRadialProfile | null;
}

// --------------------------------------------------------------------------------------------------------- the run

/** A rigid run as the solver sees it: its local bounds and how it mounts. */
export interface SeatRunShape {
  /** Local bounds of the whole unit (carrier and links). */
  box: THREE.Box3;
  /** Local mount axis: 1 = +Y (fittings, strips, hand-drawn), 2 = +Z (decor). */
  axis: 1 | 2;
  /** The base is set this far into the host by design (m). */
  embedM: number;
  /** Link backs stand this far above the design host plane (m). */
  standoffM: number;
}

export interface SeatPose { pos: THREE.Vector3; quat: THREE.Quaternion }

/** Measures of one pose (lengths m). */
export interface SeatMeasure {
  ok: boolean;
  reason: string | null;
  support: number;
  air: number;
  gapP90: number;
  maxEmbed: number;
  forbidden: number;
  forbiddenRole: SeatRole | null;
  spreadDeg: number;
  clear: number;
  clearRole: SeatRole | null;
  cut: number;
  sweep: number;
  exposure: number;
}

/** Seater thresholds (stricter than the receipt, which gates at support 50 %, air 20 %, cut 5 cm, sweep 2 cm). */
export const SEAT_RULES = Object.freeze({
  supportMin: 0.8, airMax: 0.1, gapP90Max: 0.012, gapTolM: 0.012, linkEmbedMax: 0.01, normalMaxDeg: 20,
  airReachM: 0.3, cutTolM: 0.01, sweepClearM: 0.03, exposureMin: 0.3, exposureReachM: 0.8,
});

const U_FRACTIONS = [0.04, 0.27, 0.5, 0.73, 0.96];
const V_FRACTIONS = [0.08, 0.5, 0.92];

interface Axes { n: number; u: number; v: number }
function runAxes(shape: SeatRunShape): Axes {
  const n = shape.axis;
  const others = [0, 1, 2].filter((k) => k !== n);
  const ext = (k: number): number => shape.box.max.getComponent(k) - shape.box.min.getComponent(k);
  const [u, v] = ext(others[0]) >= ext(others[1]) ? [others[0], others[1]] : [others[1], others[0]];
  return { n, u, v };
}

const _local = new THREE.Vector3(), _world = new THREE.Vector3(), _dir = new THREE.Vector3(), _nrm = new THREE.Vector3();
const _m = new THREE.Matrix4(), _mi = new THREE.Matrix4(), _tri = new THREE.Triangle(), _q = new THREE.Quaternion();
const _hit = newHit(), _hit2 = newHit();
const UNIT = new THREE.Vector3(1, 1, 1);

function localPoint(shape: SeatRunShape, ax: Axes, fu: number, fv: number, along: number, out: THREE.Vector3): THREE.Vector3 {
  const b = shape.box;
  out.set(0, 0, 0);
  out.setComponent(ax.u, b.min.getComponent(ax.u) + (b.max.getComponent(ax.u) - b.min.getComponent(ax.u)) * fu);
  out.setComponent(ax.v, b.min.getComponent(ax.v) + (b.max.getComponent(ax.v) - b.min.getComponent(ax.v)) * fv);
  out.setComponent(ax.n, along);
  return out;
}

/** Everything the solver reads round one run. */
export interface SeatEnv {
  frame: 'hull' | 'turret';
  soup: SeatSoup;
  motion: SeatMotion | null;
  /** Measure exposure (R7); off only in tests that isolate another rule. */
  exposure?: boolean;
}

/**
 * Measure one pose against R1-R5 and R7. Early-outs once a rule fails (the remaining measures stay at their
 * neutral values), unless `full` asks for every measure (receipts).
 */
export function measureSeat(env: SeatEnv, shape: SeatRunShape, pose: SeatPose, owner: number, full = false): SeatMeasure {
  const R = SEAT_RULES;
  const out: SeatMeasure = { ok: false, reason: null, support: 0, air: 0, gapP90: 0, maxEmbed: 0, forbidden: 0,
    forbiddenRole: null, spreadDeg: 0, clear: Infinity, clearRole: null, cut: 0, sweep: Infinity, exposure: 1 };
  const fail = (reason: string): boolean => { if (!out.reason) out.reason = reason; return !full; };
  const ax = runAxes(shape);
  const base = shape.box.min.getComponent(ax.n);
  const top = shape.box.max.getComponent(ax.n);
  const n = _nrm.set(0, 0, 0).setComponent(ax.n, 1).applyQuaternion(pose.quat).normalize().clone();
  const lift = top - base + 0.04;
  const designHost = base + shape.embedM;
  // ---- R1-R3: the probe grid from outside the run, along -n
  const gaps: number[] = [];
  let supported = 0, air = 0, forbidden = 0, total = 0, maxEmbed = -Infinity, spread = 0;
  for (const fu of U_FRACTIONS) {
    for (const fv of V_FRACTIONS) {
      total++;
      localPoint(shape, ax, fu, fv, designHost, _local);
      _world.copy(_local).applyQuaternion(pose.quat).add(pose.pos);
      const start = _world.addScaledVector(n, lift - shape.embedM);
      _dir.copy(n).negate();
      const reach = lift + R.airReachM;
      if (!env.soup.raycast(start, _dir, reach, owner, false, _hit)) { air++; gaps.push(R.airReachM); continue; }
      const d = _hit.t - (lift - shape.embedM);         // + host below the design plane, - host above it
      if (d > R.airReachM) { air++; gaps.push(R.airReachM); continue; }
      const embed = -d - shape.standoffM;               // how far the host rises into the links
      if (embed > maxEmbed) maxEmbed = embed;
      gaps.push(Math.max(0, d));
      if (!_hit.host) {
        forbidden++;
        if (!out.forbiddenRole) out.forbiddenRole = _hit.role;
        continue;
      }
      const angle = Math.acos(Math.min(1, Math.max(-1, _hit.n.dot(n)))) * 180 / Math.PI;
      if (d <= R.gapTolM && embed <= R.linkEmbedMax && angle <= R.normalMaxDeg) {
        supported++;
        if (angle > spread) spread = angle;
      }
    }
  }
  gaps.sort((p, q) => p - q);
  out.support = supported / total;
  out.air = air / total;
  out.forbidden = forbidden / total;
  out.gapP90 = gaps[Math.min(gaps.length - 1, Math.ceil(gaps.length * 0.9) - 1)] ?? 0;
  out.maxEmbed = Number.isFinite(maxEmbed) ? maxEmbed : 0;
  out.spreadDeg = spread;
  if (forbidden > 0 && fail(`host:${out.forbiddenRole}`)) return out;
  if (out.maxEmbed > R.linkEmbedMax && fail('sunk')) return out;
  if (out.air > R.airMax && fail('air')) return out;
  if (out.support < R.supportMin && fail('support')) return out;
  if (out.gapP90 > R.gapP90Max && fail('gap')) return out;
  // ---- R4: static clearance from forbidden roles, and no host surface into the links
  _m.compose(pose.pos, pose.quat, UNIT);
  _mi.copy(_m).invert();
  const local = shape.box;
  const placed = local.clone().applyMatrix4(_m).expandByScalar(0.06);
  const links = local.clone();
  links.min.setComponent(ax.n, designHost + shape.standoffM + R.cutTolM);
  links.min.setComponent(ax.u, local.min.getComponent(ax.u) + 0.01);
  links.max.setComponent(ax.u, local.max.getComponent(ax.u) - 0.01);
  links.min.setComponent(ax.v, local.min.getComponent(ax.v) + 0.01);
  links.max.setComponent(ax.v, local.max.getComponent(ax.v) - 0.01);
  const grown = new THREE.Box3();
  let clear = Infinity, clearRole: SeatRole | null = null, cut = 0;
  env.soup.forEachInBox(placed, owner, (t) => {
    env.soup.triangle(t, _tri);
    _tri.a.applyMatrix4(_mi); _tri.b.applyMatrix4(_mi); _tri.c.applyMatrix4(_mi);
    const role = env.soup.roleOf(t);
    if (HOST_CODES.has(ROLE_CODE[role])) {
      if (links.max.getComponent(ax.n) > links.min.getComponent(ax.n) && links.intersectsTriangle(_tri)) {
        // depth: the highest point of the triangle inside the link column above the link-back tolerance
        const h = Math.max(_tri.a.getComponent(ax.n), _tri.b.getComponent(ax.n), _tri.c.getComponent(ax.n));
        cut = Math.max(cut, Math.min(h, local.max.getComponent(ax.n)) - (designHost + shape.standoffM));
      }
      return;
    }
    const need = ROLE_CLEAR_M(ROLE_CODE[role]);
    grown.copy(local).expandByScalar(need);
    if (!grown.intersectsTriangle(_tri)) return;
    // the clearance actually kept: shrink the margin until it no longer meets (2 mm steps)
    let kept = need;
    while (kept > 0) { kept -= 0.002; grown.copy(local).expandByScalar(Math.max(0, kept)); if (!grown.intersectsTriangle(_tri)) break; }
    if (kept < clear || !clearRole) { clear = Math.max(0, kept); clearRole = role; }
  });
  out.clear = clear;
  out.clearRole = clearRole;
  out.cut = cut;
  if (clearRole && fail(`clear:${clearRole}`)) return out;
  if (cut > R.cutTolM && fail('cut')) return out;
  // ---- R5: motion
  if (env.motion) {
    out.sweep = motionClearance(env, shape, ax, pose, owner);
    if (out.sweep < R.sweepClearM && fail('sweep')) return out;
  }
  // ---- R7: line-of-sight exposure of the top face
  if (env.exposure !== false) {
    out.exposure = exposureOf(env, shape, ax, pose, n, owner);
    if (out.exposure < R.exposureMin && fail('buried')) return out;
  }
  out.ok = !out.reason;
  return out;
}

const EXPOSURE_DIRS: THREE.Vector3[] = (() => {
  const dirs = [new THREE.Vector3(0, 0, 1)];
  for (const polar of [35, 70]) {
    for (let k = 0; k < 8; k++) {
      const az = (k / 8) * Math.PI * 2 + (polar === 70 ? Math.PI / 8 : 0);
      const s = Math.sin(polar * Math.PI / 180);
      dirs.push(new THREE.Vector3(s * Math.cos(az), s * Math.sin(az), Math.cos(polar * Math.PI / 180)));
    }
  }
  return dirs;
})();

function exposureOf(env: SeatEnv, shape: SeatRunShape, ax: Axes, pose: SeatPose, n: THREE.Vector3, owner: number): number {
  const top = shape.box.max.getComponent(ax.n) + 0.01;
  _q.setFromUnitVectors(EXPOSURE_DIRS[0], n);
  let clear = 0, total = 0;
  const origin = new THREE.Vector3();
  for (const fu of [0.2, 0.5, 0.8]) {
    localPoint(shape, ax, fu, 0.5, top, origin).applyQuaternion(pose.quat).add(pose.pos);
    for (const d of EXPOSURE_DIRS) {
      _dir.copy(d).applyQuaternion(_q);
      total++;
      if (!env.soup.raycast(origin, _dir, SEAT_RULES.exposureReachM, owner, true, _hit2)) clear++;
    }
  }
  return clear / total;
}

/** Sample points of the placed run (frame coordinates): its corners and its top face. */
function runSamples(shape: SeatRunShape, ax: Axes, pose: SeatPose): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const b = shape.box;
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
    out.push(new THREE.Vector3(x, y, z).applyQuaternion(pose.quat).add(pose.pos));
  }
  const top = b.max.getComponent(ax.n);
  for (const fu of [0.25, 0.5, 0.75]) for (const fv of [0.25, 0.75]) {
    out.push(localPoint(shape, ax, fu, fv, top, new THREE.Vector3()).applyQuaternion(pose.quat).add(pose.pos));
  }
  return out;
}

const GUN_YAW_STEP = Math.PI / 180;

/** Minimum clearance (m) of the run from everything that moves round it (Infinity when nothing reaches it). */
function motionClearance(env: SeatEnv, shape: SeatRunShape, ax: Axes, pose: SeatPose, owner: number): number {
  const M = env.motion!;
  const pts = runSamples(shape, ax, pose);
  let clear = Infinity;
  const hostY = Math.min(...pts.map((p) => p.y));
  if (env.frame === 'hull') {
    // the turret's own body over the full traverse
    if (M.turreted && M.turretLow) {
      for (const p of pts) {
        const r = Math.hypot(p.x - M.pivot.x, p.z - M.pivot.z);
        if (r > M.turretLow.maxR + 0.05) continue;
        const low = profileAt(M.turretLow, r, true);
        if (!Number.isFinite(low)) continue;
        if (low <= hostY + 0.005) continue; // the turret meets the host itself there: the host's fault (HOST_SWEEP)
        clear = Math.min(clear, low - p.y);
      }
    }
    // the gun at every yaw it can take, at the ends of its pitch range
    if (M.gun && (M.turreted || M.arc > 0)) {
      const yaws: number[] = [];
      if (M.turreted) for (let y = 0; y < Math.PI * 2; y += GUN_YAW_STEP) yaws.push(y);
      else for (let y = -M.arc; y <= M.arc + 1e-9; y += GUN_YAW_STEP) yaws.push(y);
      for (const yaw of yaws) {
        const pitches = [M.pitchMin(yaw), 0, M.pitchMax];
        for (const pitch of pitches) {
          const c = gunClearanceAt(env, M, pts, yaw, pitch, true, owner);
          if (c < clear) clear = c;
        }
      }
    }
  } else {
    // turret run: the gun's pitch range in the turret frame (yaw 0)
    if (M.gun) {
      let lo = 0;
      for (let y = 0; y < Math.PI * 2; y += Math.PI / 36) lo = Math.min(lo, M.pitchMin(y));
      for (let pitch = lo; pitch <= M.pitchMax + 1e-9; pitch += Math.PI / 180) {
        const c = gunClearanceAt(env, M, pts, 0, pitch, false, owner);
        if (c < clear) clear = c;
      }
    }
    // the hull's solids under the traverse (the turret's own surface exempts a radius it already meets)
    if (M.turreted) {
      let rMin = Infinity, rMax = 0, yMin = Infinity;
      for (const p of pts) {
        const r = Math.hypot(p.x, p.z);
        rMin = Math.min(rMin, r); rMax = Math.max(rMax, r); yMin = Math.min(yMin, p.y + M.pivot.y);
      }
      const high = M.hullHigh(rMin - 0.05, rMax + 0.05, yMin - 0.3);
      if (high) {
        for (const p of pts) {
          const r = Math.hypot(p.x, p.z);
          const hullTop = profileAt(high, r, false);
          if (!Number.isFinite(hullTop)) continue;
          const own = M.turretLow ? profileAt(M.turretLow, r, true) : Infinity;
          if (own <= hullTop) continue;
          clear = Math.min(clear, p.y + M.pivot.y - hullTop);
        }
      }
    }
  }
  return clear;
}

const _g = new THREE.Vector3();
/**
 * Clearance of the run points from the gun at one pose. `hullFrame` points are hull coordinates (turret yaw applies);
 * otherwise turret coordinates. A pose that already drives the gun into the run's host armour is armour-limited and
 * skipped (Infinity): the gun cannot reach the run there (gunPitchByYawDeg owns that fix, not the stowage).
 */
function gunClearanceAt(env: SeatEnv, M: SeatMotion, pts: readonly THREE.Vector3[], yaw: number, pitch: number,
  hullFrame: boolean, owner: number): number {
  const G = M.gun!;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  let clear = Infinity;
  for (const p of pts) {
    // into the turret frame (inverse yaw about +Y), then the gun frame (inverse pitch about +X; +pitch raises +Z)
    let tx = p.x, ty = p.y, tz = p.z;
    if (hullFrame) {
      const dx = p.x - M.pivot.x, dz = p.z - M.pivot.z;
      tx = cy * dx - sy * dz; ty = p.y - M.pivot.y; tz = sy * dx + cy * dz;
    }
    tx -= M.gunPivot.x; ty -= M.gunPivot.y; tz -= M.gunPivot.z;
    const gy = cp * ty - sp * tz, gz = sp * ty + cp * tz;
    const k = Math.floor((gz - G.z0) / G.step);
    if (k < 0 || k >= G.count) continue;
    const o = k * 4;
    const xmin = G.bins[o], xmax = G.bins[o + 1], ymin = G.bins[o + 2], ymax = G.bins[o + 3];
    if (Number.isNaN(xmin)) continue;
    const lateral = Math.max(xmin - tx, tx - xmax, 0);
    if (lateral > SEAT_RULES.sweepClearM) continue;
    // clearance below the gun's underside (a run sits below the gun) or above its top; inside its span, the depth
    const vertical = Math.max(ymin - gy, gy - ymax);
    const c = vertical > 0 ? Math.hypot(lateral, vertical)
      : lateral > 0 ? lateral : -Math.min(gy - ymin, ymax - gy);
    if (c >= clear) continue;
    if (hullFrame && c < SEAT_RULES.sweepClearM && armourLimited(env, M, yaw, pitch, owner)) return Infinity;
    clear = c;
  }
  return clear;
}

const _down = new THREE.Vector3(0, -1, 0), _from = new THREE.Vector3();
/** True when the gun at (yaw, pitch) already sits inside the hull armour seen by the run's soup. */
function armourLimited(env: SeatEnv, M: SeatMotion, yaw: number, pitch: number, owner: number): boolean {
  const G = M.gun!;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  for (let k = 0; k < G.count; k++) {
    const o = k * 4;
    if (Number.isNaN(G.bins[o])) continue;
    const gz = G.z0 + (k + 0.5) * G.step, gy = G.bins[o + 2], gx = (G.bins[o] + G.bins[o + 1]) / 2;
    // gun -> turret -> hull
    const ty = cp * gy + sp * gz + M.gunPivot.y, tz = -sp * gy + cp * gz + M.gunPivot.z, tx = gx + M.gunPivot.x;
    _g.set(cy * tx + sy * tz + M.pivot.x, ty + M.pivot.y, -sy * tx + cy * tz + M.pivot.z);
    _from.copy(_g); _from.y += 1.5;
    if (!env.soup.raycast(_from, _down, 1.5, owner, false, _hit2)) continue;
    if (_hit2.host && _hit2.p.y > _g.y + 0.01) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------------------- the search

/** Where the solver may look for a seat. */
export interface SeatSearch {
  /** In-plane offsets along the run (m), tried nearest first. */
  along: readonly number[];
  /** In-plane offsets across the run (m). */
  across: readonly number[];
  /** Yaw turns about the mount axis (rad). */
  yaw: readonly number[];
}

/** S2: ±0.30 m along the plate and ±15 degrees of yaw round the authored seat. */
export const AUTHORED_SEARCH: SeatSearch = Object.freeze({
  along: [0, 0.1, -0.1, 0.2, -0.2, 0.3, -0.3],
  across: [0, 0.1, -0.1, 0.2, -0.2, 0.3, -0.3],
  yaw: [0, 15 * Math.PI / 180, -15 * Math.PI / 180],
});

export interface SeatResult {
  ok: boolean;
  /** 'authored' when the hint passed unchanged, 'reseated' when the search moved it. */
  seat: 'authored' | 'reseated' | null;
  pose: SeatPose | null;
  measure: SeatMeasure;
  /** The hint's own measure (why it moved). */
  hint: SeatMeasure;
}

/**
 * S2: accept the authored pose unchanged when it passes; otherwise seat the run from outside at nearby stations
 * (nearest first: offset, then yaw) and return the first that passes; else not ok.
 */
export function solveSpareTrackSeat(env: SeatEnv, shape: SeatRunShape, hint: SeatPose, owner: number,
  search: SeatSearch = AUTHORED_SEARCH): SeatResult {
  const hintMeasure = measureSeat(env, shape, hint, owner, true);
  if (hintMeasure.ok) return { ok: true, seat: 'authored', pose: hint, measure: hintMeasure, hint: hintMeasure };
  const ax = runAxes(shape);
  const n0 = new THREE.Vector3().setComponent(ax.n, 1).applyQuaternion(hint.quat).normalize();
  const eu = new THREE.Vector3().setComponent(ax.u, 1).applyQuaternion(hint.quat).normalize();
  const ev = new THREE.Vector3().setComponent(ax.v, 1).applyQuaternion(hint.quat).normalize();
  const stations: Array<{ du: number; dv: number; yaw: number; cost: number }> = [];
  for (const du of search.along) for (const dv of search.across) for (const yaw of search.yaw) {
    stations.push({ du, dv, yaw, cost: Math.hypot(du, dv) + Math.abs(yaw) * 0.5 });
  }
  stations.sort((p, q) => p.cost - q.cost);
  const base = shape.box.min.getComponent(ax.n);
  const center = localPoint(shape, ax, 0.5, 0.5, base + shape.embedM, new THREE.Vector3());
  for (const s of stations) {
    const quat = new THREE.Quaternion().setFromAxisAngle(n0, s.yaw).multiply(hint.quat);
    // the design host point of the hint, moved in plane; cast from far outside along -n for the outermost surface
    const target = center.clone().applyQuaternion(hint.quat).add(hint.pos).addScaledVector(eu, s.du).addScaledVector(ev, s.dv);
    const pose = seatFromOutside(env, shape, ax, quat, target, n0, owner);
    if (!pose) continue;
    const m = measureSeat(env, shape, pose, owner);
    if (m.ok) return { ok: true, seat: 'reseated', pose, measure: measureSeat(env, shape, pose, owner, true), hint: hintMeasure };
  }
  return { ok: false, seat: null, pose: null, measure: hintMeasure, hint: hintMeasure };
}

/**
 * Pose a run whose design host point should land on the outermost surface along -n0 through `target`: cast the
 * footprint's five points from 1.5 m outside, fit the plane they meet (a rigid run rests on the highest points), turn
 * the run onto that plane (at most 25 degrees from n0) and set its base on it.
 */
function seatFromOutside(env: SeatEnv, shape: SeatRunShape, ax: Axes, quat: THREE.Quaternion,
  target: THREE.Vector3, n0: THREE.Vector3, owner: number): SeatPose | null {
  const base = shape.box.min.getComponent(ax.n) + shape.embedM;
  const centerLocal = localPoint(shape, ax, 0.5, 0.5, base, new THREE.Vector3());
  const hits: THREE.Vector3[] = [];
  const normal = new THREE.Vector3();
  const back = n0.clone().negate();
  for (const [fu, fv] of [[0.5, 0.5], [0.1, 0.15], [0.9, 0.15], [0.1, 0.85], [0.9, 0.85]] as const) {
    const off = localPoint(shape, ax, fu, fv, base, new THREE.Vector3()).sub(centerLocal).applyQuaternion(quat);
    const from = target.clone().add(off).addScaledVector(n0, 1.5);
    if (!env.soup.raycast(from, back, 1.5 + SEAT_RULES.airReachM, owner, false, _hit)) return null;
    if (!_hit.host) return null;
    hits.push(_hit.p.clone());
    normal.add(_hit.n);
  }
  normal.normalize();
  if (normal.angleTo(n0) > 25 * Math.PI / 180) return null;
  const turn = new THREE.Quaternion().setFromUnitVectors(n0, normal);
  const q = turn.multiply(quat.clone());
  // the base plane through the highest hit along the new normal
  let h = -Infinity;
  for (const p of hits) h = Math.max(h, p.dot(normal));
  const at = target.clone().addScaledVector(normal, h - target.dot(normal));
  const pos = at.sub(centerLocal.clone().applyQuaternion(q));
  return { pos, quat: q };
}

/**
 * A pose's plane-fit refinement (S1): the same station seated from outside on the plane its footprint meets, instead
 * of the single ray hit the slot posed it from. Null when the footprint meets no host or the plane turns > 25 degrees.
 */
export function refineSeat(env: SeatEnv, shape: SeatRunShape, pose: SeatPose, owner = 0): SeatPose | null {
  const ax = runAxes(shape);
  const n0 = new THREE.Vector3().setComponent(ax.n, 1).applyQuaternion(pose.quat).normalize();
  const target = localPoint(shape, ax, 0.5, 0.5, shape.box.min.getComponent(ax.n) + shape.embedM, new THREE.Vector3())
    .applyQuaternion(pose.quat).add(pose.pos);
  return seatFromOutside(env, shape, ax, pose.quat, target, n0, owner);
}

/** A receipt row for one seated run (lengths in cm, shares in %, rounded). */
export interface SpareTrackSeatReceipt {
  site: string;
  frame: 'hull' | 'turret';
  source: 'fitting' | 'strip' | 'adhoc' | 'decor';
  seat: 'authored' | 'reseated' | 'decor';
  support: number; air: number; gapP90Cm: number; maxEmbedCm: number; clearCm: number | null; cutCm: number;
  sweepCm: number | null; exposure: number;
}

export function seatReceipt(site: string, frame: 'hull' | 'turret', source: SpareTrackSeatReceipt['source'],
  seat: SpareTrackSeatReceipt['seat'], m: SeatMeasure): SpareTrackSeatReceipt {
  const cm = (x: number): number => Math.round(x * 1000) / 10;
  return {
    site, frame, source, seat,
    support: Math.round(m.support * 100), air: Math.round(m.air * 100), gapP90Cm: cm(m.gapP90),
    maxEmbedCm: cm(Math.max(0, m.maxEmbed)), clearCm: Number.isFinite(m.clear) ? cm(m.clear) : null, cutCm: cm(m.cut),
    sweepCm: Number.isFinite(m.sweep) ? cm(m.sweep) : null, exposure: Math.round(m.exposure * 100),
  };
}
