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
 *                 (armour-limited poses skipped), whatever they stand on; turret runs clear the gun's pitch range and
 *                 the hull's solids during traverse (where the turret's own surface next to the run already meets a
 *                 hull part, that part is at fault, not the run)
 *   R6 no hang    a run with no passing seat is not built; the caller records it as rejected
 *   R7 visible    the run's top face must see outside in at least 30 % of a hemisphere of directions
 *   (a run the solver moves, or a decor run on a new station, is new visible stowage: it must clear the motion by 6 cm
 *   and see outside in half the hemisphere)
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
  if (/^(hull|turret)Track(Links)?$/.test(bucket)) return 'run';
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
      const half = count >> 1;
      this.select(cent, axis, start, start + count - 1, start + half);
      const left = this.alloc(start, half);
      const right = this.alloc(start + half, count - half);
      this.nodeLeft[node] = left;
      if (right !== left + 1) throw new Error('SeatSoup: non-adjacent children');
      todo.push([right, start + half, count - half], [left, start, half]);
    }
  }

  /** Quickselect: order[k] holds the k-th centroid along `axis`, smaller ones before it (ties by index). */
  private select(cent: Float32Array, axis: number, lo: number, hi: number, k: number): void {
    const o = this.order;
    const key = (i: number): number => cent[o[i] * 3 + axis];
    const less = (a: number, b: number): boolean => key(a) < key(b) || (key(a) === key(b) && o[a] < o[b]);
    const swap = (a: number, b: number): void => { const t = o[a]; o[a] = o[b]; o[b] = t; };
    while (hi > lo) {
      const mid = (lo + hi) >> 1;
      if (less(mid, lo)) swap(mid, lo);
      if (less(hi, lo)) swap(hi, lo);
      if (less(hi, mid)) swap(hi, mid);
      swap(mid, hi - 1 >= lo ? hi - 1 : hi);
      const pivot = hi - 1 >= lo ? hi - 1 : hi;
      let i = lo, j = pivot;
      for (;;) {
        do i++; while (i < pivot && less(i, pivot));
        do j--; while (j > lo && less(pivot, j));
        if (i >= j) break;
        swap(i, j);
      }
      if (i < pivot) swap(i, pivot);
      if (i === k) return;
      if (k < i) hi = i - 1; else lo = i + 1;
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

  /** True when the ray meets, within [0, far], any triangle (either frame) whose role is in `codes`. */
  meetsRole(origin: THREE.Vector3, dir: THREE.Vector3, far: number, codes: ReadonlySet<number>): boolean {
    if (!this.count) return false;
    const ox = origin.x, oy = origin.y, oz = origin.z, dx = dir.x, dy = dir.y, dz = dir.z;
    const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
    let sp = 0;
    this.stack[sp++] = 0;
    while (sp) {
      const node = this.stack[--sp];
      const b = node * 6;
      let t0 = 0, t1 = far;
      let ta = (this.nodeBox[b] - ox) * ix, tb = (this.nodeBox[b + 3] - ox) * ix;
      if (ta > tb) { const q = ta; ta = tb; tb = q; }
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
      ta = (this.nodeBox[b + 1] - oy) * iy; tb = (this.nodeBox[b + 4] - oy) * iy;
      if (ta > tb) { const q = ta; ta = tb; tb = q; }
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
      ta = (this.nodeBox[b + 2] - oz) * iz; tb = (this.nodeBox[b + 5] - oz) * iz;
      if (ta > tb) { const q = ta; ta = tb; tb = q; }
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
      const left = this.nodeLeft[node];
      if (left >= 0) { if (sp + 2 <= this.stack.length) { this.stack[sp++] = left + 1; this.stack[sp++] = left; } continue; }
      const end = this.nodeStart[node] + this.nodeCount[node];
      for (let i = this.nodeStart[node]; i < end; i++) {
        const t = this.order[i];
        if (!codes.has(this.role[t])) continue;
        const d = this.intersect(t, ox, oy, oz, dx, dy, dz);
        if (d >= 0 && d <= far) return true;
      }
    }
    return false;
  }

  /** The farthest hit along the ray within [0, far] on triangles of `owner` (the run's own underside), or -1. */
  deepestOwn(origin: THREE.Vector3, dir: THREE.Vector3, far: number, owner: number): number {
    if (!this.count || !owner) return -1;
    const ox = origin.x, oy = origin.y, oz = origin.z, dx = dir.x, dy = dir.y, dz = dir.z;
    const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
    let deepest = -1, sp = 0;
    this.stack[sp++] = 0;
    while (sp) {
      const node = this.stack[--sp];
      const b = node * 6;
      let t0 = 0, t1 = far;
      let ta = (this.nodeBox[b] - ox) * ix, tb = (this.nodeBox[b + 3] - ox) * ix;
      if (ta > tb) { const q = ta; ta = tb; tb = q; }
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
      ta = (this.nodeBox[b + 1] - oy) * iy; tb = (this.nodeBox[b + 4] - oy) * iy;
      if (ta > tb) { const q = ta; ta = tb; tb = q; }
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
      ta = (this.nodeBox[b + 2] - oz) * iz; tb = (this.nodeBox[b + 5] - oz) * iz;
      if (ta > tb) { const q = ta; ta = tb; tb = q; }
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
      if (t0 > t1 || t1 <= deepest) continue;
      const left = this.nodeLeft[node];
      if (left >= 0) {
        if (sp + 2 <= this.stack.length) { this.stack[sp++] = left + 1; this.stack[sp++] = left; }
        continue;
      }
      const end = this.nodeStart[node] + this.nodeCount[node];
      for (let i = this.nodeStart[node]; i < end; i++) {
        const t = this.order[i];
        if (this.owner[t] !== owner) continue;
        const d = this.intersect(t, ox, oy, oz, dx, dy, dz);
        if (d >= 0 && d <= far && d > deepest) deepest = d;
      }
    }
    return deepest;
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
  /** The gun's widest half-width |x| and its reach from the pitch axis (any slice corner), for a cheap pose filter. */
  xAbs: number;
  reach: number;
}

/** Build the gun's slices from gun-local geometry sources (the gun, gun-dark and mantlet buckets). */
export function seatGunSlices(sources: readonly SeatSource[], step = 0.05): SeatGunSlices | null {
  // every triangle is clipped into the 5 cm slabs it crosses: a barrel's side faces carry vertices only at their ends
  const tris: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let z0 = Infinity, z1 = -Infinity;
  for (const s of sources) {
    const pos = s.geometry.getAttribute('position');
    if (!pos) continue;
    const index = s.geometry.index;
    const n = index ? index.count : pos.count;
    for (let t = 0; t + 2 < n; t += 3) {
      a.fromBufferAttribute(pos, index ? index.getX(t) : t);
      b.fromBufferAttribute(pos, index ? index.getX(t + 1) : t + 1);
      c.fromBufferAttribute(pos, index ? index.getX(t + 2) : t + 2);
      if (s.matrix) { a.applyMatrix4(s.matrix); b.applyMatrix4(s.matrix); c.applyMatrix4(s.matrix); }
      tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      z0 = Math.min(z0, a.z, b.z, c.z); z1 = Math.max(z1, a.z, b.z, c.z);
    }
  }
  if (!(z1 > z0)) return null;
  const count = Math.max(1, Math.ceil((z1 - z0) / step) + 1);
  const bins = new Float32Array(count * 4).fill(NaN);
  const put = (k: number, x: number, y: number): void => {
    const o = k * 4;
    if (!(bins[o] <= x)) bins[o] = x;
    if (!(bins[o + 1] >= x)) bins[o + 1] = x;
    if (!(bins[o + 2] <= y)) bins[o + 2] = y;
    if (!(bins[o + 3] >= y)) bins[o + 3] = y;
  };
  // Sutherland-Hodgman against one z plane, on flat [x, y, z] arrays
  const clip = (poly: number[], z: number, keepAbove: boolean): number[] => {
    const out: number[] = [];
    const m = poly.length / 3;
    for (let i = 0; i < m; i++) {
      const p = i * 3, q = ((i + 1) % m) * 3;
      const pin = keepAbove ? poly[p + 2] >= z : poly[p + 2] <= z, qin = keepAbove ? poly[q + 2] >= z : poly[q + 2] <= z;
      if (pin) out.push(poly[p], poly[p + 1], poly[p + 2]);
      if (pin !== qin) {
        const f = (z - poly[p + 2]) / (poly[q + 2] - poly[p + 2]);
        out.push(poly[p] + (poly[q] - poly[p]) * f, poly[p + 1] + (poly[q + 1] - poly[p + 1]) * f, z);
      }
    }
    return out;
  };
  for (let t = 0; t < tris.length; t += 9) {
    const tz0 = Math.min(tris[t + 2], tris[t + 5], tris[t + 8]), tz1 = Math.max(tris[t + 2], tris[t + 5], tris[t + 8]);
    const k0 = Math.max(0, Math.floor((tz0 - z0) / step)), k1 = Math.min(count - 1, Math.floor((tz1 - z0) / step));
    const tri = tris.slice(t, t + 9);
    for (let k = k0; k <= k1; k++) {
      if (k0 === k1) { for (let v = 0; v < 9; v += 3) put(k, tri[v], tri[v + 1]); break; }
      const slab = clip(clip(tri, z0 + k * step, true), z0 + (k + 1) * step, false);
      for (let v = 0; v < slab.length; v += 3) put(k, slab[v], slab[v + 1]);
    }
  }
  let xAbs = 0, reach = 0;
  for (let k = 0; k < count; k++) {
    const o = k * 4;
    if (Number.isNaN(bins[o])) continue;
    xAbs = Math.max(xAbs, Math.abs(bins[o]), Math.abs(bins[o + 1]));
    const zf = Math.max(Math.abs(z0 + k * step), Math.abs(z0 + (k + 1) * step));
    reach = Math.max(reach, Math.hypot(zf, Math.max(Math.abs(bins[o + 2]), Math.abs(bins[o + 3]))));
  }
  return { z0, step, bins, count, xAbs, reach };
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

/** The turret's lowest solid by turret angle and radius (turret frame), for the traverse exemption of turret runs. */
export interface SeatAngularProfile { step: number; angBins: number; radBins: number; values: Float32Array }

/** Lowest solid of `sources` (turret frame) per (angle about +Y, radius) bin, sampled 5 cm apart on every triangle. */
export function seatAngularLow(sources: readonly SeatSource[], step = 0.02, angBins = 72, rMax = 6): SeatAngularProfile {
  const radBins = Math.ceil(rMax / step) + 2;
  const values = new Float32Array(angBins * radBins).fill(Infinity);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
  const put = (q: THREE.Vector3): void => {
    const r = Math.hypot(q.x, q.z);
    if (r > rMax) return;
    const ai = ((Math.floor((Math.atan2(q.x, q.z) + Math.PI) / (Math.PI * 2) * angBins) % angBins) + angBins) % angBins;
    const k = ai * radBins + Math.floor(r / step);
    if (q.y < values[k]) values[k] = q.y;
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
      const k = Math.min(24, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / 0.05));
      if (k <= 1) { put(a); put(b); put(c); continue; }
      for (let i = 0; i <= k; i++) for (let j = 0; j <= k - i; j++) {
        p.copy(a).multiplyScalar(1 - (i + j) / k).addScaledVector(b, i / k).addScaledVector(c, j / k);
        put(p);
      }
    }
  }
  return { step, angBins, radBins, values };
}

/** The lowest turret solid near (turret angle `ang`, radius `r`), within `halfArc` metres of arc and 2 cm of radius. */
function angularLowAt(P: SeatAngularProfile, r: number, ang: number, halfArc: number): number {
  const span = Math.max(1, Math.ceil((halfArc / Math.max(r, 0.05)) / (Math.PI * 2) * P.angBins));
  const a0 = Math.floor((ang + Math.PI) / (Math.PI * 2) * P.angBins);
  const k0 = Math.floor(r / P.step);
  let v = Infinity;
  for (let da = -span; da <= span; da++) {
    const ai = (((a0 + da) % P.angBins) + P.angBins) % P.angBins;
    for (let k = k0 - 1; k <= k0 + 1; k++) {
      if (k < 0 || k >= P.radBins) continue;
      const x = P.values[ai * P.radBins + k];
      if (x < v) v = x;
    }
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
  /** The turret's own lowest solid by turret angle and radius (turret frame), built on demand. */
  turretAngularLow: () => SeatAngularProfile | null;
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
  /** The footprint's 90th-percentile gap beyond the design standoff (m). */
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

/** One tier of seat rules (lengths m, shares 0-1). */
interface SeatTier {
  supportMin: number; airMax: number; gapTolM: number; gapP90Max: number; embedMax: number; sunkShareMax: number;
  /** A probe counts toward the sunk share when the host rises this far into the run (m). */
  sunkProbeM: number;
  normalMaxDeg: number; minorForbiddenMax: number; cutMaxM: number; clearScale: number; sweepClearM: number;
  exposureMin: number;
}
/**
 * Seat rules in two tiers.
 * - authored: a seat as its profile (or an old decor station) placed it is kept unchanged when it reads as resting and
 *   in the open. Its margins sit inside the receipt's gates (HANGING: support 50 %, air 25 %; INTERSECTING: 5 cm, or
 *   20 % of the probes sunk over 2.5 cm, a cut measured by how far a part reaches in; WEIRD: on, or within 1 cm of, a forbidden role; BURIED), and the motion margin keeps the
 *   plan's 3 cm, so a gun or turret that grazes a run still moves it. At most one probe may land on a minor foreign
 *   part (decor, another run, a fitting, a soft load, running gear), never on the gun, a hatch, a grille, ERA or a
 *   weapon.
 * - chosen: a seat the solver picks (a re-seated run, a new decor station, a plane-fit pose) is new visible stowage and
 *   is held to the strict rules: support 80 %, air 10 %, a 12 mm gap, 1 cm embed, 20 degrees, every forbidden role
 *   clear by its full margin, 6 cm from anything that moves, and half the hemisphere open.
 */
export const SEAT_RULES = Object.freeze({
  airReachM: 0.3, exposureReachM: 0.8, cutTolM: 0.01,
  authored: Object.freeze<SeatTier>({ supportMin: 0.5, airMax: 0.2, gapTolM: 0.03, gapP90Max: Infinity, embedMax: 0.05,
    sunkShareMax: 0.2, sunkProbeM: 0.025, normalMaxDeg: 30, minorForbiddenMax: 1, cutMaxM: 0.05, clearScale: 0.34,
    sweepClearM: 0.03,
    exposureMin: 0.3 }),
  chosen: Object.freeze<SeatTier>({ supportMin: 0.8, airMax: 0.1, gapTolM: 0.012, gapP90Max: 0.012, embedMax: 0.01,
    sunkShareMax: 0, sunkProbeM: 0.01, normalMaxDeg: 20, minorForbiddenMax: 0, cutMaxM: 0.01, clearScale: 1,
    sweepClearM: 0.06,
    exposureMin: 0.5 }),
});
/** Foreign parts a kept authored seat may touch with one probe (never the gun, hatches, grilles, ERA, weapons...). */
const MINOR_CODES = new Set([ROLE_CODE.decor, ROLE_CODE.run, ROLE_CODE.fitting, ROLE_CODE.soft, ROLE_CODE.gear]);

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
const _triBox = new THREE.Box3();
const _side = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const GUN_CODES: ReadonlySet<number> = new Set([ROLE_CODE.gun, ROLE_CODE.mantlet]);
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
  /** Per gun yaw, the first pitch step the gun clears the host armour seen by this soup (filled on demand). */
  armourFloors?: Map<number, number>;
}

/**
 * Measure one pose against R1-R5 and R7. Early-outs once a rule fails (the remaining measures stay at their
 * neutral values), unless `full` asks for every measure (receipts).
 */
export function measureSeat(env: SeatEnv, shape: SeatRunShape, pose: SeatPose, owner: number, full = false,
  chosen = false, rack = false): SeatMeasure {
  const R = SEAT_RULES;
  const T = chosen ? R.chosen : R.authored;
  const out: SeatMeasure = { ok: false, reason: null, support: 0, air: 0, gapP90: 0, maxEmbed: 0, forbidden: 0,
    forbiddenRole: null, spreadDeg: 0, clear: Infinity, clearRole: null, cut: 0, sweep: Infinity, exposure: 1 };
  const fail = (reason: string): boolean => { if (!out.reason) out.reason = reason; return !full; };
  const ax = runAxes(shape);
  const base = shape.box.min.getComponent(ax.n);
  const top = shape.box.max.getComponent(ax.n);
  const n = _nrm.set(0, 0, 0).setComponent(ax.n, 1).applyQuaternion(pose.quat).normalize().clone();
  const lift = top - base + 0.04;
  const designHost = base + shape.embedM;
  // ---- R1-R3: the probe grid from outside the run, along -n. Each column's gap is measured from the run's own
  // underside in that column (its feet, rails or link backs; the base plane where the run is not in the soup) down to
  // the first other surface (where the run is not in the soup, from its link backs: the design host plane plus the
  // standoff): a rigid run rests where the gap closes, and a surface above its underside sinks into it.
  const gaps: number[] = [];
  let supported = 0, air = 0, forbidden = 0, majorForbidden = 0, sunk = 0, total = 0, maxEmbed = -Infinity, spread = 0;
  const noOwnBottom = lift - shape.embedM - shape.standoffM;  // probe start to the link backs of a run not in the soup
  for (const fu of U_FRACTIONS) {
    for (const fv of V_FRACTIONS) {
      total++;
      localPoint(shape, ax, fu, fv, designHost, _local);
      _world.copy(_local).applyQuaternion(pose.quat).add(pose.pos);
      const start = _world.addScaledVector(n, lift - shape.embedM);
      _dir.copy(n).negate();
      const reach = lift + R.airReachM;
      const own = env.soup.deepestOwn(start, _dir, lift + 0.005, owner);
      const bottom = own >= 0 ? own : noOwnBottom;
      if (!env.soup.raycast(start, _dir, reach, owner, false, _hit)) { air++; gaps.push(R.airReachM); continue; }
      const d = _hit.t - bottom;                        // + air under the run's underside, - host above it
      if (d > R.airReachM) { air++; gaps.push(R.airReachM); continue; }
      const embed = -d;                                 // how far the host rises into the run
      if (embed > maxEmbed) maxEmbed = embed;
      if (embed > T.sunkProbeM) sunk++;
      gaps.push(Math.max(0, d));
      if (!_hit.host) {
        forbidden++;
        if (!MINOR_CODES.has(ROLE_CODE[_hit.role])) majorForbidden++;
        if (!out.forbiddenRole || !MINOR_CODES.has(ROLE_CODE[_hit.role])) out.forbiddenRole = _hit.role;
        continue;
      }
      const angle = Math.acos(Math.min(1, Math.max(-1, _hit.n.dot(n)))) * 180 / Math.PI;
      if (d <= shape.standoffM + T.gapTolM && embed <= T.embedMax && angle <= T.normalMaxDeg) {
        supported++;
        if (angle > spread) spread = angle;
      }
    }
  }
  gaps.sort((p, q) => p - q);
  out.support = supported / total;
  out.air = air / total;
  out.forbidden = forbidden / total;
  out.gapP90 = Math.max(0, (gaps[Math.min(gaps.length - 1, Math.ceil(gaps.length * 0.9) - 1)] ?? 0) - shape.standoffM);
  out.maxEmbed = Number.isFinite(maxEmbed) ? maxEmbed : 0;
  out.spreadDeg = spread;
  if ((majorForbidden > 0 || forbidden > T.minorForbiddenMax) && fail(`host:${out.forbiddenRole}`)) return out;
  if (rack) {
    // a run on its rack (rackSeat) stands clear of everything under it; its posts, not its footprint, carry it
    if (out.maxEmbed > 0.004 && fail('sunk')) return out;
  } else {
    if ((out.maxEmbed > T.embedMax || sunk / total > T.sunkShareMax) && fail('sunk')) return out;
    if (out.air > T.airMax && fail('air')) return out;
    if (out.support < T.supportMin && fail('support')) return out;
    if (out.gapP90 > T.gapP90Max && fail('gap')) return out;
  }
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
  let clear = Infinity, clearRole = null as SeatRole | null, cut = 0;
  env.soup.forEachInBox(placed, owner, (t) => {
    env.soup.triangle(t, _tri);
    _tri.a.applyMatrix4(_mi); _tri.b.applyMatrix4(_mi); _tri.c.applyMatrix4(_mi);
    const role = env.soup.roleOf(t);
    if (HOST_CODES.has(ROLE_CODE[role])) {
      if (links.max.getComponent(ax.n) > links.min.getComponent(ax.n) && links.intersectsTriangle(_tri)) {
        // depth: how far the triangle reaches into the links along its thinnest way in. A plate across the run cuts
        // to its height above the link backs; a wall that only enters a run's end cuts by how far it enters.
        _triBox.setFromPoints([_tri.a, _tri.b, _tri.c]).intersect(local);
        let depth = Math.min(_triBox.max.getComponent(ax.n), local.max.getComponent(ax.n)) - (designHost + shape.standoffM);
        for (const k of [ax.u, ax.v]) {
          const lo = local.min.getComponent(k), hi = local.max.getComponent(k);
          const inLo = _triBox.max.getComponent(k) - lo, inHi = hi - _triBox.min.getComponent(k);
          // entering from one side: the part inside from that side; spanning both sides: the whole width
          depth = Math.min(depth, Math.min(inLo, inHi) < hi - lo - 1e-6 ? Math.min(inLo, inHi) : hi - lo);
        }
        cut = Math.max(cut, depth);
      }
      return;
    }
    // other decor is the decor's own overlap ledger's to keep apart (commit()); the box here is too coarse for it
    if (role === 'decor') return;
    if (clearRole && !full) return;                 // a candidate already failed R4: the rest is receipt detail
    const need = ROLE_CLEAR_M(ROLE_CODE[role]) * T.clearScale;
    grown.copy(local).expandByScalar(need);
    if (!grown.intersectsTriangle(_tri)) return;
    // the clearance actually kept: the largest margin (1 mm) at which the box still misses the triangle
    let lo = 0, hi = need;
    grown.copy(local);
    if (grown.intersectsTriangle(_tri)) hi = 0;
    while (hi - lo > 0.001) {
      const mid = (lo + hi) / 2;
      grown.copy(local).expandByScalar(mid);
      if (grown.intersectsTriangle(_tri)) hi = mid; else lo = mid;
    }
    const kept = hi === 0 ? 0 : lo;
    if (kept < clear || !clearRole) { clear = kept; clearRole = role; }
  });
  out.clear = clear;
  out.clearRole = clearRole;
  out.cut = cut;
  if (clearRole && fail(`clear:${clearRole}`)) return out;
  if (cut > T.cutMaxM && fail('cut')) return out;
  // ---- R9: never under the main gun (its footprint on the deck, seen from above at rest, 5 cm wide of it). A seat the
  // solver chooses always; an authored one where the gun is fixed in the hull, which never moves off it.
  if ((chosen || !env.motion) && underGun(env, shape, ax, pose) && fail('under-gun')) return out;
  // a chosen seat sits in open plate: no host part rises beside its links (a rail upright, a wall, a step)
  if (chosen) {
    const side = local.clone();
    side.min.setComponent(ax.n, designHost + shape.standoffM + 2 * R.cutTolM);
    side.expandByVector(_side.set(0.03, 0.03, 0.03).setComponent(ax.n, 0));
    let crowded = false;
    env.soup.forEachInBox(placed, owner, (t) => {
      if (crowded || !HOST_CODES.has(env.soup.role[t])) return;
      env.soup.triangle(t, _tri);
      _tri.a.applyMatrix4(_mi); _tri.b.applyMatrix4(_mi); _tri.c.applyMatrix4(_mi);
      if (side.intersectsTriangle(_tri)) crowded = true;
    });
    if (crowded && fail('crowded')) return out;
  }
  // ---- R5: motion, and R7: line-of-sight exposure of the top face. A candidate (not `full`) takes the cheaper
  // exposure first; a receipt reports motion first.
  const exposed = env.exposure === false || full ? true
    : (out.exposure = exposureOf(env, shape, ax, pose, n, owner, T.exposureMin)) >= T.exposureMin;
  if (!exposed && fail('buried')) return out;
  if (env.motion) {
    out.sweep = motionClearance(env, shape, ax, pose, owner, full ? -Infinity : T.sweepClearM);
    if (out.sweep < T.sweepClearM && fail('sweep')) return out;
  }
  if (env.exposure !== false && full) {
    out.exposure = exposureOf(env, shape, ax, pose, n, owner);
    if (out.exposure < T.exposureMin && fail('buried')) return out;
  }
  out.ok = !out.reason;
  return out;
}

/** R9: any top-face point of the placed run, or one 5 cm outside it, with the gun or its mantlet straight above. */
function underGun(env: SeatEnv, shape: SeatRunShape, ax: Axes, pose: SeatPose): boolean {
  const b = shape.box, m = 0.05;
  const u0 = b.min.getComponent(ax.u) - m, u1 = b.max.getComponent(ax.u) + m;
  const v0 = b.min.getComponent(ax.v) - m, v1 = b.max.getComponent(ax.v) + m;
  const p = new THREE.Vector3();
  for (let i = 0; i <= 6; i++) {
    for (let j = 0; j <= 2; j++) {
      p.set(0, 0, 0).setComponent(ax.n, b.max.getComponent(ax.n))
        .setComponent(ax.u, u0 + (u1 - u0) * i / 6).setComponent(ax.v, v0 + (v1 - v0) * j / 2);
      p.applyQuaternion(pose.quat).add(pose.pos);
      if (env.soup.meetsRole(p, _up, 3, GUN_CODES)) return true;
    }
  }
  return false;
}

const EXPOSURE_POINTS = [0.2, 0.5, 0.8];
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

/**
 * Share of the top face's hemisphere rays that leave the vehicle. With `decide`, stop as soon as the share is known
 * to land on one side of it (a candidate's pass or fail), returning a share on that side.
 */
function exposureOf(env: SeatEnv, shape: SeatRunShape, ax: Axes, pose: SeatPose, n: THREE.Vector3, owner: number,
  decide = NaN, reach: number = SEAT_RULES.exposureReachM): number {
  const top = shape.box.max.getComponent(ax.n) + 0.01;
  _q.setFromUnitVectors(EXPOSURE_DIRS[0], n);
  const total = EXPOSURE_POINTS.length * EXPOSURE_DIRS.length;
  let clear = 0, blocked = 0;
  const origin = new THREE.Vector3();
  for (const fu of EXPOSURE_POINTS) {
    localPoint(shape, ax, fu, 0.5, top, origin).applyQuaternion(pose.quat).add(pose.pos);
    for (const d of EXPOSURE_DIRS) {
      _dir.copy(d).applyQuaternion(_q);
      if (!env.soup.raycast(origin, _dir, reach, owner, true, _hit2)) clear++; else blocked++;
      if (clear / total >= decide) return clear / total;
      if ((total - blocked) / total < decide) return (total - blocked) / total;
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
const GUN_PITCH_STEP = Math.PI / 180;

/** Minimum clearance (m) of the run from everything that moves round it (Infinity when nothing reaches it). */
function motionClearance(env: SeatEnv, shape: SeatRunShape, ax: Axes, pose: SeatPose, owner: number,
  stopBelow = -Infinity): number {
  const M = env.motion!;
  const pts = runSamples(shape, ax, pose);
  let clear = Infinity;
  if (env.frame === 'hull') {
    // the turret's own body over the full traverse: a point under the turret's lowest solid at its radius clears it
    // by the gap; a point at or above it is inside the traverse, whatever it stands on (a run on a fender bin the
    // bustle sweeps, or on the deck inside a dome turret, is hit as the turret turns)
    const T = M.turreted ? M.turretLow : null;
    if (T) {
      for (const p of pts) {
        const r = Math.hypot(p.x - M.pivot.x, p.z - M.pivot.z);
        if (r > T.maxR + 0.05) continue;
        const low = profileAt(T, r, true);
        if (!Number.isFinite(low)) continue;
        clear = Math.min(clear, low - p.y);
      }
    }
    if (clear < stopBelow) return clear;
    // the gun at every yaw it can take, over its pitch range
    if (M.gun && (M.turreted || M.arc > 0)) {
      const yawCount = M.turreted ? Math.round(Math.PI * 2 / GUN_YAW_STEP)
        : Math.floor(2 * M.arc / GUN_YAW_STEP + 1e-9) + 1;
      const yaw0 = M.turreted ? 0 : -M.arc;
      const G = M.gun, nearX = G.xAbs + SEAT_RULES.chosen.sweepClearM, nearR = G.reach + SEAT_RULES.chosen.sweepClearM;
      const nearR2 = nearR * nearR;
      // a candidate first takes every fourth degree of yaw and pitch: a run in the gun's path fails there at a
      // sixteenth of the cost; only a run that passes it pays for every degree
      for (const stride of stopBelow > -Infinity ? [4, 1] : [1]) {
        for (let j = 0; j < yawCount; j += stride) {
          const yaw = yaw0 + j * GUN_YAW_STEP;
          // a yaw where no run point is within the gun's half-width and reach of its pitch axis cannot come close
          const cy = Math.cos(yaw), sy = Math.sin(yaw);
          let near = false;
          for (const p of pts) {
            const dx = p.x - M.pivot.x, dz = p.z - M.pivot.z;
            const tx = cy * dx - sy * dz - M.gunPivot.x, tz = sy * dx + cy * dz - M.gunPivot.z;
            const ty = p.y - M.pivot.y - M.gunPivot.y;
            if (Math.abs(tx) <= nearX && ty * ty + tz * tz <= nearR2) { near = true; break; }
          }
          if (!near) continue;
          // every degree of the pitch range this yaw allows (a gun with a long sleeve can dip its tail as it lifts);
          // poses that already put the gun inside the host armour are armour-limited and skipped
          const lo = M.pitchMin(yaw);
          const steps = Math.floor((M.pitchMax - lo) / GUN_PITCH_STEP + 1e-9);
          let floor = -1;
          for (let i = 0; i <= steps; i += stride) {
            const c = gunClearanceAt(M, pts, yaw, lo + i * GUN_PITCH_STEP, true);
            if (c >= clear) continue;
            if (c < SEAT_RULES.chosen.sweepClearM) {
              if (floor < 0) floor = armourFloor(env, M, yaw, lo, steps, owner);
              if (i < floor) continue;
            }
            clear = c;
            if (clear < stopBelow) return clear;
          }
        }
      }
    }
  } else {
    // turret run: the gun's pitch range in the turret frame (yaw 0)
    if (M.gun) {
      let lo = 0;
      for (let y = 0; y < Math.PI * 2; y += Math.PI / 36) lo = Math.min(lo, M.pitchMin(y));
      for (let pitch = lo; pitch <= M.pitchMax + 1e-9; pitch += GUN_PITCH_STEP) {
        const c = gunClearanceAt(M, pts, 0, pitch, false);
        if (c < clear) clear = c;
        if (clear < stopBelow) return clear;
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
          // the turret's own surface next to this point (15 cm of arc): if it already reaches the hull's top at this radius,
          // the hull part is in the turret's way by itself (HOST_SWEEP), not the run's fault
          const ang = M.turretAngularLow();
          const own = ang ? angularLowAt(ang, r, Math.atan2(p.x, p.z), 0.15) + M.pivot.y : Infinity;
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
 * otherwise turret coordinates.
 */
function gunClearanceAt(M: SeatMotion, pts: readonly THREE.Vector3[], yaw: number, pitch: number,
  hullFrame: boolean): number {
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
    if (lateral > SEAT_RULES.chosen.sweepClearM) continue;
    // clearance below the gun's underside (a run sits below the gun) or above its top; inside its span, the depth
    const vertical = Math.max(ymin - gy, gy - ymax);
    const c = vertical > 0 ? Math.sqrt(lateral * lateral + vertical * vertical)
      : lateral > 0 ? lateral : -Math.min(gy - ymin, ymax - gy);
    if (c < clear) clear = c;
  }
  return clear;
}

/**
 * The first pitch step (from `lo`, of `steps`) at which the gun at `yaw` is no longer inside the host armour: a pose
 * below it is armour-limited and skipped, since the gun cannot reach the run there (gunPitchByYawDeg owns that fix,
 * not the stowage). Lowering the gun only drives it deeper, so the floor is found by bisection and kept per yaw.
 */
function armourFloor(env: SeatEnv, M: SeatMotion, yaw: number, lo: number, steps: number, owner: number): number {
  const floors = env.armourFloors ??= new Map();
  const key = Math.round(yaw * 1e4) * 4096 + Math.round(lo * 1e3);
  const known = floors.get(key);
  if (known !== undefined) return known;
  let a = 0, b = steps + 1;                // a: first step that may be free; b: first step known free
  if (!armourLimited(env, M, yaw, lo, owner)) b = 0;
  else if (armourLimited(env, M, yaw, lo + steps * GUN_PITCH_STEP, owner)) a = b;
  else {
    a = 1; b = steps;
    while (a < b) {
      const mid = (a + b) >> 1;
      if (armourLimited(env, M, yaw, lo + mid * GUN_PITCH_STEP, owner)) a = mid + 1; else b = mid;
    }
  }
  const floor = Math.min(a, b);
  floors.set(key, floor);
  return floor;
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
    if (gz < 0.5) continue; // the breech and cradle ride inside the turret: only the gun out past its mantlet can be stopped
    // gun -> turret -> hull
    const ty = cp * gy + sp * gz + M.gunPivot.y, tz = -sp * gy + cp * gz + M.gunPivot.z, tx = gx + M.gunPivot.x;
    _g.set(cy * tx + sy * tz + M.pivot.x, ty + M.pivot.y, -sy * tx + cy * tz + M.pivot.z);
    _from.copy(_g); _from.y += 1.5;
    if (!env.soup.raycast(_from, _down, 1.5, owner, false, _hit2)) continue;
    if (_hit2.host && _hit2.p.y > _g.y + 0.02) return true;
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

/** No search: the authored seat and its lift only. */
export const NO_SEARCH: SeatSearch = Object.freeze({ along: [], across: [], yaw: [] });

/** S2: ±0.30 m along the plate and ±15 degrees of yaw round the authored seat. */
export const AUTHORED_SEARCH: SeatSearch = Object.freeze({
  along: [0, 0.1, -0.1, 0.2, -0.2, 0.3, -0.3],
  across: [0, 0.1, -0.1, 0.2, -0.2, 0.3, -0.3],
  yaw: [0, 15 * Math.PI / 180, -15 * Math.PI / 180],
});

export interface SeatResult {
  ok: boolean;
  /** 'authored' when the hint passed unchanged, 'reseated' when the search moved it. */
  seat: 'authored' | 'lifted' | 'reseated' | null;
  pose: SeatPose | null;
  measure: SeatMeasure;
  /** The hint's own measure (why it moved). */
  hint: SeatMeasure;
  /** The search station that seated it (index into the sorted search), -1 when none did, null when the hint passed. */
  station: number | null;
}

/**
 * S2: accept the authored pose unchanged when it passes; otherwise seat the run from outside at nearby stations
 * (nearest first: offset, then yaw) and return the first that passes; else not ok.
 *
 * `planned` is the search's recorded answer for this run (spareTrackSeatPlan.ts): -1 skips the search (the run is
 * not built), a station index is measured first. Either way only a seat that passes is built; a plan entry that no
 * longer passes falls back to the full search.
 */
export function solveSpareTrackSeat(env: SeatEnv, shape: SeatRunShape, hint: SeatPose, owner: number,
  search: SeatSearch = AUTHORED_SEARCH, planned?: number, failedHint?: SeatMeasure): SeatResult {
  // `failedHint`: the caller already measured the authored seat and its lift, and both failed; search only
  const hintMeasure = failedHint ?? measureSeat(env, shape, hint, owner, true);
  if (hintMeasure.ok) return { ok: true, seat: 'authored', pose: hint, measure: hintMeasure, hint: hintMeasure, station: null };
  const none: SeatResult = { ok: false, seat: null, pose: null, measure: hintMeasure, hint: hintMeasure, station: -1 };
  const lifted = failedHint ? null : liftOntoMount(env, shape, hint, owner, hintMeasure);
  if (lifted) return { ok: true, seat: 'lifted', pose: lifted.pose, measure: lifted.measure, hint: hintMeasure, station: null };
  if (planned === -1) return none;
  const ax = runAxes(shape);
  const n0 = new THREE.Vector3().setComponent(ax.n, 1).applyQuaternion(hint.quat).normalize();
  const eu = new THREE.Vector3().setComponent(ax.u, 1).applyQuaternion(hint.quat).normalize();
  const ev = new THREE.Vector3().setComponent(ax.v, 1).applyQuaternion(hint.quat).normalize();
  const stations: Array<{ du: number; dv: number; yaw: number; cost: number }> = [];
  for (const du of search.along) for (const dv of search.across) for (const yaw of search.yaw) {
    stations.push({ du, dv, yaw, cost: Math.hypot(du, dv) + Math.abs(yaw) * 0.5 });
  }
  stations.sort((p, q) => p.cost - q.cost);
  const order = stations.map((_, k) => k);
  if (planned !== undefined && planned >= 0 && planned < stations.length) { order.splice(planned, 1); order.unshift(planned); }
  const base = shape.box.min.getComponent(ax.n);
  const center = localPoint(shape, ax, 0.5, 0.5, base + shape.embedM, new THREE.Vector3());
  for (const k of order) {
    const s = stations[k];
    const quat = new THREE.Quaternion().setFromAxisAngle(n0, s.yaw).multiply(hint.quat);
    // the design host point of the hint, moved in plane; cast from far outside along -n for the outermost surface
    const target = center.clone().applyQuaternion(hint.quat).add(hint.pos).addScaledVector(eu, s.du).addScaledVector(ev, s.dv);
    const pose = seatFromOutside(env, shape, ax, quat, target, n0, owner);
    if (!pose) continue;
    const m = measureSeat(env, shape, pose, owner, false, true);
    if (m.ok) {
      return { ok: true, seat: 'reseated', pose, measure: measureSeat(env, shape, pose, owner, true, true), hint: hintMeasure,
        station: k };
    }
  }
  return none;
}

/** The farthest an authored run is lifted off its own mount before it counts as moved (m). */
const LIFT_MAX_M = 0.06;
/**
 * Authored mounts first: a run that sinks into its own mount (the host rises into its links) is lifted straight off it,
 * along its mount normal, by the least that clears it, and kept there when it then passes as authored. A mount that is
 * itself wrong (a grille, the gun, air, a buried station) is not a lift's to fix.
 */
function liftOntoMount(env: SeatEnv, shape: SeatRunShape, hint: SeatPose, owner: number,
  hintMeasure: SeatMeasure): { pose: SeatPose; measure: SeatMeasure } | null {
  if (hintMeasure.reason !== 'sunk' && hintMeasure.reason !== 'cut') return null;
  const need = Math.max(hintMeasure.maxEmbed, hintMeasure.cut);
  if (!(need > 0) || need > LIFT_MAX_M) return null;
  const ax = runAxes(shape);
  const n = new THREE.Vector3().setComponent(ax.n, 1).applyQuaternion(hint.quat).normalize();
  for (const d of [need + 0.003, need + 0.01]) {
    if (d > LIFT_MAX_M) break;
    const pose = { pos: hint.pos.clone().addScaledVector(n, d), quat: hint.quat.clone() };
    const m = measureSeat(env, shape, pose, owner, true);
    if (m.ok) return { pose, measure: m };
  }
  return null;
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
  // onto the plane without twisting the run in plan: its long axis keeps its heading, projected into the new plane
  const u0 = new THREE.Vector3().setComponent(ax.u, 1).applyQuaternion(quat);
  const u1 = u0.clone().addScaledVector(normal, -u0.dot(normal));
  if (u1.lengthSq() < 1e-6) return null;
  u1.normalize();
  const v1 = new THREE.Vector3().crossVectors(normal, u1);
  const cols: THREE.Vector3[] = [];
  cols[ax.n] = normal; cols[ax.u] = u1; cols[ax.v] = v1;
  const basis = new THREE.Matrix4().makeBasis(cols[0], cols[1], cols[2]);
  if (basis.determinant() < 0) { v1.negate(); basis.makeBasis(cols[0], cols[1], cols[2]); }
  const q = new THREE.Quaternion().setFromRotationMatrix(basis);
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

/**
 * Fix the mount, don't remove (the owner's standing rule): a run whose authored station holds nowhere, even after the
 * local search, is offered every other station its own frame carries, nearest first on the face it was authored on.
 * Candidates come from rays cast inward onto the frame's sides, rear, front and top every 15 cm: each first hit on the
 * frame's own armour that faces the ray, seated from outside on the plane its footprint meets, the run's long side
 * level (along the hull on a side, across it elsewhere). The caller measures them at the strict tier.
 */
export function remountSeats(env: SeatEnv, shape: SeatRunShape, hint: SeatPose, frameBox: THREE.Box3, owner: number,
  limit = 400): SeatPose[] {
  const ax = runAxes(shape);
  const hintN = new THREE.Vector3().setComponent(ax.n, 1).applyQuaternion(hint.quat).normalize();
  const centre = localPoint(shape, ax, 0.5, 0.5, shape.box.min.getComponent(ax.n) + shape.embedM, new THREE.Vector3())
    .applyQuaternion(hint.quat).add(hint.pos);
  type Face = { key: string; dir: THREE.Vector3; u: THREE.Vector3; minDot: number };
  const faces: Face[] = [
    { key: '+x', dir: new THREE.Vector3(-1, 0, 0), u: new THREE.Vector3(0, 0, 1), minDot: Math.cos(30 * Math.PI / 180) },
    { key: '-x', dir: new THREE.Vector3(1, 0, 0), u: new THREE.Vector3(0, 0, 1), minDot: Math.cos(30 * Math.PI / 180) },
    { key: '-z', dir: new THREE.Vector3(0, 0, 1), u: new THREE.Vector3(1, 0, 0), minDot: Math.cos(30 * Math.PI / 180) },
    { key: '+z', dir: new THREE.Vector3(0, 0, -1), u: new THREE.Vector3(1, 0, 0), minDot: Math.cos(35 * Math.PI / 180) },
    { key: '+y', dir: new THREE.Vector3(0, -1, 0), u: new THREE.Vector3(1, 0, 0), minDot: 0.5 },
  ];
  const faceOf = (n: THREE.Vector3): string => {
    let best = faces[0].key, dot = -Infinity;
    for (const f of faces) { const d = -f.dir.dot(n); if (d > dot) { dot = d; best = f.key; } }
    return best;
  };
  const hintFace = faceOf(hintN);
  const step = 0.15, inset = 0.08;
  const cands: Array<{ pose: SeatPose; key: string; d: number }> = [];
  const origin = new THREE.Vector3(), hit = newHit(), first = newHit();
  const b = frameBox;
  for (const f of faces) {
    const k = f.dir.x !== 0 ? 0 : f.dir.y !== 0 ? 1 : 2;      // the cast axis
    const [a1, a2] = [0, 1, 2].filter((i) => i !== k);
    const lo1 = b.min.getComponent(a1) + inset, hi1 = b.max.getComponent(a1) - inset;
    const lo2 = b.min.getComponent(a2) + inset, hi2 = b.max.getComponent(a2) - inset;
    const start = f.dir.getComponent(k) < 0 ? b.max.getComponent(k) + 0.5 : b.min.getComponent(k) - 0.5;
    const reach = b.max.getComponent(k) - b.min.getComponent(k) + 1;
    for (let p1 = lo1; p1 <= hi1 + 1e-9; p1 += step) {
      for (let p2 = lo2; p2 <= hi2 + 1e-9; p2 += step) {
        origin.set(0, 0, 0).setComponent(k, start).setComponent(a1, p1).setComponent(a2, p2);
        if (!env.soup.raycast(origin, f.dir, reach, owner, false, hit) || !hit.host) continue;
        if (-hit.n.dot(f.dir) < f.minDot) continue;
        // a station the other frame covers (the hull deck under the turret) is never in the open
        if (env.soup.raycast(origin, f.dir, reach, owner, true, first) && first.t < hit.t - 0.01) continue;
        // the run's long side level and in the plane: its mount normal onto the hit's, the long axis the face's (and on
        // a deck or glacis also along the hull, for a fender top or a narrow plate)
        const n = hit.n.clone();
        for (const along of f.key === '+y' ? [f.u, new THREE.Vector3(0, 0, 1)] : [f.u]) {
          const u = along.clone().addScaledVector(n, -along.dot(n));
          if (u.lengthSq() < 1e-4) continue;
          u.normalize();
          const v = new THREE.Vector3().crossVectors(n, u);
          const cols: THREE.Vector3[] = [];
          cols[ax.n] = n; cols[ax.u] = u; cols[ax.v] = v;
          const basis = new THREE.Matrix4().makeBasis(cols[0], cols[1], cols[2]);
          if (basis.determinant() < 0) { v.negate(); basis.makeBasis(cols[0], cols[1], cols[2]); }
          const quat = new THREE.Quaternion().setFromRotationMatrix(basis);
          const pose = seatFromOutside(env, shape, ax, quat, hit.p.clone(), n, owner);
          if (!pose) continue;
          const at = localPoint(shape, ax, 0.5, 0.5, shape.box.min.getComponent(ax.n) + shape.embedM, new THREE.Vector3())
            .applyQuaternion(pose.quat).add(pose.pos);
          if (cands.some((c) => c.pose.pos.distanceToSquared(pose.pos) < 0.01 && c.pose.quat.angleTo(pose.quat) < 0.2)) continue;
          cands.push({ pose, key: f.key, d: at.distanceTo(centre) });
        }
      }
    }
  }
  // nearest first on the face it was authored on, then the other faces; every face keeps its nearest stations
  cands.sort((p, q) => (p.key === hintFace ? 0 : 1) - (q.key === hintFace ? 0 : 1) || p.d - q.d);
  const perFace = new Map<string, number>();
  const kept = cands.filter((c) => {
    const k = (perFace.get(c.key) ?? 0) + 1;
    perFace.set(c.key, k);
    return k <= Math.ceil(limit / 3);
  });
  return kept.slice(0, limit).map((c) => c.pose);
}

/** The local search's stations as plain poses round the authored one (in-plane offsets and yaw), nearest first. */
export function searchPoses(shape: SeatRunShape, hint: SeatPose, search: SeatSearch = AUTHORED_SEARCH): SeatPose[] {
  const ax = runAxes(shape);
  const n0 = new THREE.Vector3().setComponent(ax.n, 1).applyQuaternion(hint.quat).normalize();
  const eu = new THREE.Vector3().setComponent(ax.u, 1).applyQuaternion(hint.quat).normalize();
  const ev = new THREE.Vector3().setComponent(ax.v, 1).applyQuaternion(hint.quat).normalize();
  const centre = localPoint(shape, ax, 0.5, 0.5, shape.box.min.getComponent(ax.n), new THREE.Vector3())
    .applyQuaternion(hint.quat).add(hint.pos);
  const stations: Array<{ du: number; dv: number; yaw: number; cost: number }> = [];
  for (const du of search.along) for (const dv of search.across) for (const yaw of search.yaw) {
    stations.push({ du, dv, yaw, cost: Math.hypot(du, dv) + Math.abs(yaw) * 0.5 });
  }
  stations.sort((p, q) => p.cost - q.cost);
  return stations.map((st) => {
    const turn = new THREE.Quaternion().setFromAxisAngle(n0, st.yaw);
    const quat = turn.clone().multiply(hint.quat);
    // the run turns about its own centre and moves in plane
    const pos = hint.pos.clone().sub(centre).applyQuaternion(turn).add(centre).addScaledVector(eu, st.du).addScaledVector(ev, st.dv);
    return { pos, quat };
  });
}

/**
 * The share of a placed run's top-face hemisphere that leaves the vehicle within `reach` (m): a moved run's second,
 * longer look (a frame-wide soup), so a station under a far overhang (a bustle rack 1.5 m up) is not taken as open.
 */
export function seatExposure(env: SeatEnv, shape: SeatRunShape, pose: SeatPose, owner: number, reach: number): number {
  const ax = runAxes(shape);
  const n = new THREE.Vector3().setComponent(ax.n, 1).applyQuaternion(pose.quat).normalize();
  return exposureOf(env, shape, ax, pose, n, owner, NaN, reach);
}

/** A rack's longest post (m): a run stands at most this far off the plate under its posts. */
export const RACK_POST_MAX_M = 0.16;
/** Where a rack's four posts stand under a run (fractions of its long side u and its width v). */
export const RACK_POSTS: ReadonlyArray<readonly [number, number]> = [[0.08, 0.18], [0.08, 0.82], [0.92, 0.18], [0.92, 0.82]];

/** A run on a rack: the pose lifted clear of the plate under it, and each post's foot on the host (frame coords). */
export interface RackSeat { pose: SeatPose; posts: Array<{ top: THREE.Vector3; foot: THREE.Vector3 }>; measure: SeatMeasure }

/**
 * Fix the mount, don't remove: a run with no flush seat is carried on a rack, a frame on four posts welded to the
 * plate, the way crews carry links over an uneven deck or a curved turret wall. The run keeps its station's plane and
 * heading, is lifted clear of the highest point under its footprint (5 mm), and each post must find the frame's own
 * armour within RACK_POST_MAX_M straight below it. Everything else (forbidden parts under it, clearance, motion, the
 * gun's footprint, open plate, exposure) is the strict tier's.
 */
export function rackSeat(env: SeatEnv, shape: SeatRunShape, pose: SeatPose, owner: number, full = false): RackSeat | null {
  const ax = runAxes(shape);
  const base = shape.box.min.getComponent(ax.n);
  const n = new THREE.Vector3().setComponent(ax.n, 1).applyQuaternion(pose.quat).normalize();
  const down = n.clone().negate();
  const from = new THREE.Vector3(), hit = newHit();
  // the highest host point under the footprint (a 7 x 5 grid): the rack's underside clears it
  let rise = -Infinity;
  for (let i = 0; i <= 6; i++) {
    for (let j = 0; j <= 4; j++) {
      localPoint(shape, ax, i / 6, j / 4, base, from).applyQuaternion(pose.quat).add(pose.pos).addScaledVector(n, 0.6);
      if (!env.soup.raycast(from, down, 0.6 + RACK_POST_MAX_M, owner, false, hit)) continue;
      rise = Math.max(rise, 0.6 - hit.t);
    }
  }
  if (!Number.isFinite(rise)) return null;
  const lifted = { pos: pose.pos.clone().addScaledVector(n, Math.max(0, rise) + 0.005), quat: pose.quat.clone() };
  const posts: RackSeat['posts'] = [];
  for (const [fu, fv] of RACK_POSTS) {
    const top = localPoint(shape, ax, fu, fv, base, new THREE.Vector3()).applyQuaternion(lifted.quat).add(lifted.pos);
    from.copy(top).addScaledVector(n, 0.002);
    if (!env.soup.raycast(from, down, RACK_POST_MAX_M + 0.002, owner, false, hit) || !hit.host) return null;
    posts.push({ top, foot: hit.p.clone() });
  }
  const measure = measureSeat(env, shape, lifted, owner, full, true, true);
  return measure.ok || full ? { pose: lifted, posts, measure } : null;
}

/** A receipt row for one seated run (lengths in cm, shares in %, rounded). */
export interface SpareTrackSeatReceipt {
  site: string;
  frame: 'hull' | 'turret';
  source: 'fitting' | 'strip' | 'adhoc' | 'decor';
  seat: 'authored' | 'lifted' | 'reseated' | 'racked' | 'decor';
  support: number; air: number; gapP90Cm: number; maxEmbedCm: number; clearCm: number | null; cutCm: number;
  sweepCm: number | null; exposure: number;
  /** A re-seated run: why its authored seat failed, and how far the solver moved and turned it. */
  moved?: { reason: string | null; cm: number; deg: number; authored?: Record<string, number | null> };
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
