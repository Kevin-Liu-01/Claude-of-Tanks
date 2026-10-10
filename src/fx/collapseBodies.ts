/**
 * collapseBodies.ts — a collapsing building's pieces as bodies (destruction core lane, 2026-10-10; the owner: "make
 * thier collapses much more natural", "just let physics work for these kinds of things" and "not slow down the game so
 * much").
 *
 * At a collapse (structureStages: a building's 'collapsed' stage, live) the building as it stands — its own triangles
 * from the world's merged buckets (the seam's spans) and the rims its breaches redrew — is cut between the plan's
 * pieces (collapsePieces.ts: wall panels over the stubs, floor slabs, roof slabs, gables, chimneys), each piece's
 * broken edges and back are capped in its core, and every piece becomes a mesh in the building's own materials (no new
 * program) that follows a body in the presentation's debris pool (debrisPhysics.ts). The standing building is hidden
 * the same frame: the eye sees it break, not swap. What stays standing (the stubs, the corner piers, the plinth, a
 * chimney's foot) is the building's own geometry too, kept static, and is solid to the pieces.
 *
 * The cut is laid before the collapse (a building damaged or breached is prepared a few hundred triangles a frame,
 * within a small budget: the plan's cut does not depend on the blow), so the collapse's own frame only builds the
 * meshes and spawns the bodies; a building that falls before its cut is laid finishes it then.
 *
 * The pieces wait, asleep and solid, for their release (the struck face at once, the roof and the faces beside it a
 * beat later, the far face last) unless something strikes them or their support goes: the collapse comes down as one
 * thing. A wall panel lands whole and cracks into its parts on its first hard landing (each part's own body takes the
 * panel's motion there). The pool's ground is the drawn ground, the battle's heaps in it, but a collapsing building's
 * own heap rises under its pieces as they come down (it is the sim's at once). Hard landings make their dust and their
 * recorded sound (collapseImpacts.ts). When every piece of a collapse has lain still a while (or only creeps), its
 * pieces are baked into one static mesh a material and their bodies leave the pool.
 */
import * as THREE from 'three';
import type { RigidEnvironment } from '../sim/rigidBody.ts';
import type { CollisionRecord } from '../world/collision.ts';
import type { StructureDamageSeam } from '../world/structureDamageSeam.ts';
import type { StructureDamageAnatomy } from '../world/destructionKit.ts';
import { rubbleMoundHeightAt, type RubbleMound } from '../sim/terrainDeformation.ts';
import type { DebrisPhysics } from './debrisPhysics.ts';
import type { WreckTurretTank } from '../sim/wreckTurrets.ts';
import {
  PART_STRIDE, STATIC_PIECE, capPiece, capStubs, partShape, partitionTriangles, pieceKick, pieceShape, pieceSpawn,
  planCollapsePieces, stubRecords,
  type CapQuad, type CollapseBlow, type CollapsePiece, type CollapsePlan,
} from './collapsePieces.ts';
import { emitCollapseImpact } from './collapseImpacts.ts';

/** A live collapse's stage event (StructureStageEvent's fields this module reads). */
export interface CollapseBodiesEvent {
  structureId: number;
  cause: string | null;
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirZ: number;
}

interface CollapseBodiesOptions {
  pool: DebrisPhysics;
  /** Where the pieces and the remnant are drawn (the fx group). */
  group: THREE.Group;
  /** A bucket's own material (the world's plain mesh material: compiled already). */
  materialFor(bucket: string): THREE.Material | null;
  /** The ground as drawn (the battle's craters and heaps in it). */
  groundAt(x: number, z: number): number;
  /** The world's static records for the bodies (sim/wreckTurrets createWreckEnvironment), or null. */
  environment(): RigidEnvironment | null;
  /** A hard landing (its dust): world point, speed, mass, the building. */
  onLanding?(x: number, y: number, z: number, speedMps: number, massKg: number, structureIdx: number): void;
  /** Pieces at most per collapse (default: the plan's, 24 and 12 a shed). */
  cap?: number;
  /** The vehicles drawn this frame: their hulls and turrets shove the pieces (kinematic boxes in the pool). */
  hulls?(): Iterable<unknown> | null;
  /** The preparation's budget a frame (ms of wall clock; default 2). */
  prepareBudgetMs?: number;
  /** A clock for that budget (default performance.now). */
  now?(): number;
}

/** A wall panel the blow's failure reached (CollapsePiece.shatterS): its building and its place on its face. */
type CollapseShatterHandler = (seam: StructureDamageSeam, piece: CollapsePiece, e: CollapseBodiesEvent) => void;

export interface CollapseBodies {
  /**
   * A building that may come down soon (damaged, breached): its cut is laid in the background, a little a frame.
   */
  prepare(seam: StructureDamageSeam, materialFor?: (bucket: string) => THREE.Material | null): void;
  /**
   * The building comes down as bodies: false when it cannot (no storeys, too few pieces) and the caller keeps its
   * scripted collapse. `standing` are the stage runs that stood with it (a breach's rim and room): they are cut with it
   * and the caller drops them. `ready` runs when its pieces stand in its place (the caller hides it then): at once for a
   * building whose cut was laid ahead; a building felled whole by one blow finishes its cut over the next frames
   * (4 ms a frame, a third of a second at most) and stands, in the blow's dust, until then.
   */
  collapse(seam: StructureDamageSeam, e: CollapseBodiesEvent, standing: readonly THREE.Mesh[],
    materialFor?: (bucket: string) => THREE.Material | null, ready?: () => void): boolean;
  /** The fx clock's delta: the pool steps, every piece follows its body; preparations advance within their budget. */
  update(dtS: number): void;
  /** Collapses in flight (their pieces not all baked). */
  readonly active: number;
  /** Whether this structure came down as bodies (its dust is thinner: the pieces kick their own). */
  took(structureIdx: number): boolean;
  /** Who bursts a shattered panel into the kit's pieces and dust (structureStages). */
  onShatter(handler: CollapseShatterHandler | null): void;
  reset(): void;
  stats(): { collapses: number; pieces: number; meshes: number; vertices: number; baked: number; prepared: number };
}

/** A material's vertex layout: position, normal, then its other attributes in order (sizes). */
interface Layout {
  names: string[];
  sizes: number[];
  stride: number;
}

/** One source of a building's triangles: a span of a merged bucket, or a stage run. */
interface Source {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  first: number;
  count: number;
  world: THREE.Matrix4 | null;
}

interface Group {
  material: THREE.Material;
  layout: Layout;
  /** Partitioned triangles by key (piece × PART_STRIDE + part, or STATIC_PIECE), body frame. */
  lists: Map<number, number[]>;
}

/** A building's cut, laid ahead: its plan's geometry, its sources and how far through them it is. */
interface Prepared {
  structureIdx: number;
  seam: StructureDamageSeam;
  plan: CollapsePlan;
  groups: Map<THREE.Material, Group>;
  sources: Source[];
  source: number;
  tri: number;
  done: boolean;
  /** For the eviction of a cut never used. */
  touched: number;
  resolve: (bucket: string) => THREE.Material | null;
  /** Its geometries by key once the cut is laid (caps in): the collapse only makes meshes of them. Built a list at a
   *  time too (`queue`: what is left to build; null before the caps are in). */
  built: Map<number, Array<{ material: THREE.Material; geometry: THREE.BufferGeometry }>> | null;
  queue: Array<[Group, number]> | null;
}

interface LivePart {
  meshes: THREE.Mesh[];
  /** Its offset in the piece's frame (glued), and as a matrix. */
  offset: THREE.Vector3;
  offsetM: THREE.Matrix4 | null;
  handle: number;
  pose: Float64Array;
}

interface LivePiece {
  piece: CollapsePiece;
  /** The whole piece's body (−1 once it has broken or burst, or was given up). */
  handle: number;
  parts: LivePart[];
  broken: boolean;
  /** Seconds lain still (asleep). */
  still: number;
  sounds: number;
  dusts: number;
  /** Its kick given (at its release); its burst done (a panel the failure reached). */
  kicked: boolean;
  shattered: boolean;
  /** The last pose written (to skip a still piece's matrices). */
  pose: Float64Array;
}

interface LiveCollapse {
  structureIdx: number;
  plan: CollapsePlan;
  yaw: number;
  seam: StructureDamageSeam;
  event: CollapseBodiesEvent;
  t0: number;
  pieces: LivePiece[];
  remnant: THREE.Mesh[];
  stubs: CollisionRecord[];
  mound: RubbleMound | null;
  /** The mound's world box (wake its sleepers while it rises). */
  box: [number, number, number, number];
  lastSoundS: number;
  lastDustS: number;
  baked: THREE.Mesh[];
  done: boolean;
}

/** The heap rises under the pieces from this long after the collapse to this (s). */
const RISE_FROM_S = 0.7;
const RISE_TO_S = 3.4;
/** A collapse whose pieces have all lain still this long is baked; one this old whose pieces only creep (under these
 *  speeds: a slab easing on a wedge) is too; any collapse this old is. */
const BAKE_STILL_S = 3;
const BAKE_SLOW_AGE_S = 7;
const SLOW_MPS = 0.3;
const SLOW_RADS = 0.5;
const BAKE_AGE_S = 40;
/** Landings heard: at most one a collapse every this long, and this many a piece. */
const SOUND_GAP_S = 0.07;
const SOUNDS_PER_PIECE = 3;
/** Landings that kick dust: this many a piece, one a collapse every this long. */
const DUSTS_PER_PIECE = 3;
const DUST_GAP_S = 0.05;
/** A panel cracks into its parts on a landing this hard (a fall from 0.6 m). */
const BREAK_MPS = 3.4;
const CAP_UV_DENSITY = 0.55;
/** Triangles a preparation takes at a time (between budget checks), and the cuts kept laid at most. */
const PREPARE_CHUNK = 192;
const PREPARED_MAX = 8;

/** An attribute a source lacks, as the material would read it absent: a colour and the weathering's tint and shade
 *  white, anything else 0. */
function neutral(name: string): number {
  return name === 'color' || name === 'tint' || name === 'shade' ? 1 : 0;
}

export function createCollapseBodies(o: CollapseBodiesOptions): CollapseBodies {
  const pool = o.pool;
  const now = o.now ?? (() => performance.now());
  const budgetMs = o.prepareBudgetMs ?? 2;
  const live: LiveCollapse[] = [];
  const byHandle = new Map<number, { c: LiveCollapse; p: LivePiece; part: number }>();
  const prepared = new Map<number, Prepared>();
  const falling = new Set<number>();
  const stubRecords_: CollisionRecord[] = [];
  const breaking: Array<{ c: LiveCollapse; p: LivePiece }> = [];
  /** Collapses waiting for their cut (felled before it was laid): finished a little a frame, then brought down. */
  const waiting: Array<{ seam: StructureDamageSeam; e: CollapseBodiesEvent; standing: readonly THREE.Mesh[]; resolve: (bucket: string) => THREE.Material | null;
    ready: (() => void) | undefined; since: number; job: Prepared }> = [];
  let clockS = 0;
  /** The waiting collapses' clock (it runs while nothing is live). */
  let clockWait = 0;
  let bakedCount = 0;
  let wakeTimer = 0;
  let touch = 0;
  const pose = new Float64Array(7);
  const impulse = new Float64Array(6);
  const vel = new Float64Array(6);
  let shatterHandler: CollapseShatterHandler | null = null;
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _m = new THREE.Matrix4();
  const _o = new THREE.Vector3(), _w = new THREE.Vector3();
  const hullList: WreckTurretTank[] = [];
  const layouts = new WeakMap<THREE.BufferGeometry, Layout>();

  // what the bodies meet: the world's records (the falling buildings' own skipped), the remnants' stubs, and the ground
  // as drawn less the heaps still rising under their pieces
  let base: RigidEnvironment | null = null;
  const env: RigidEnvironment = {
    groundAt(x, z) {
      let g = o.groundAt(x, z);
      for (const c of live) {
        if (!c.mound) continue;
        const t = clockS - c.t0;
        if (t >= RISE_TO_S) continue;
        if (x < c.box[0] || x > c.box[2] || z < c.box[1] || z > c.box[3]) continue;
        const k = t <= RISE_FROM_S ? 0 : (t - RISE_FROM_S) / (RISE_TO_S - RISE_FROM_S);
        g -= (1 - k * k * (3 - 2 * k)) * rubbleMoundHeightAt(c.mound, x, z);
      }
      return g;
    },
    queryStatic(minX, minZ, maxX, maxZ, out) {
      out.length = 0;
      if (base?.queryStatic) base.queryStatic(minX, minZ, maxX, maxZ, out);
      for (const r of stubRecords_) {
        if (r.max[0] < minX || r.min[0] > maxX || r.max[2] < minZ || r.min[2] > maxZ) continue;
        out.push(r);
      }
      return out;
    },
    isSolid(record) {
      if (record.structureIdx !== undefined && falling.has(record.structureIdx)) return false;
      return base?.isSolid ? base.isSolid(record) : !record.crushed && !record.dead;
    },
  };
  let bound = false;
  const bind = (): void => {
    const next = o.environment();
    if (next !== base || !bound) { base = next; pool.bind(env); bound = true; }
  };

  pool.onImpact((x, y, z, speed, mass, handle) => {
    const hit = byHandle.get(handle);
    if (!hit) return;
    const { c, p } = hit;
    if (!(speed >= 2.2)) return;
    // a panel landing hard cracks into its parts (after this step: no body is spawned inside the pool's report)
    if (!p.broken && p.parts.length > 1 && speed >= BREAK_MPS && hit.part < 0) { p.broken = true; breaking.push({ c, p }); }
    if (p.dusts < DUSTS_PER_PIECE && clockS - c.lastDustS >= DUST_GAP_S) {
      p.dusts++;
      c.lastDustS = clockS;
      o.onLanding?.(x, y, z, speed, mass, c.structureIdx);
    }
    if (p.sounds >= SOUNDS_PER_PIECE || clockS - c.lastSoundS < SOUND_GAP_S) return;
    p.sounds++;
    c.lastSoundS = clockS;
    emitCollapseImpact(x, y, z, speed, mass, p.piece.material);
  });
  pool.onEvict((handle, final) => {
    const hit = byHandle.get(handle);
    if (!hit) return;
    // a sleeper the pool gave up: it lies where it came to rest, static
    byHandle.delete(handle);
    if (hit.part < 0) { writeWhole(hit.p, final); hit.p.handle = -1; } else { writePart(hit.p.parts[hit.part], final); hit.p.parts[hit.part].handle = -1; }
  });

  function layoutOf(geometry: THREE.BufferGeometry): Layout {
    let layout = layouts.get(geometry);
    if (layout) return layout;
    const names: string[] = [], sizes: number[] = [];
    for (const [name, attr] of Object.entries(geometry.attributes)) {
      if (name === 'position' || name === 'normal' || name === 'aDamage' || name === 'batchId') continue;
      names.push(name);
      sizes.push((attr as THREE.BufferAttribute).itemSize);
    }
    layout = { names, sizes, stride: 6 + sizes.reduce((a, b) => a + b, 0) };
    layouts.set(geometry, layout);
    return layout;
  }
  /** The union of layouts (a bucket drawn by more than one merge: an attribute one carries and another not). */
  function unionLayout(a: Layout, b: Layout): Layout {
    const names = [...a.names], sizes = [...a.sizes];
    b.names.forEach((name, i) => { if (!names.includes(name)) { names.push(name); sizes.push(b.sizes[i]); } });
    return names.length === a.names.length ? a : { names, sizes, stride: 6 + sizes.reduce((x, y) => x + y, 0) };
  }

  /** A glued piece's pose onto all its parts' meshes. */
  function writeWhole(p: LivePiece, src: ArrayLike<number>): void {
    let same = true;
    for (let k = 0; k < 7; k++) if (p.pose[k] !== src[k]) { same = false; p.pose[k] = src[k]; }
    if (same) return;
    _p.set(src[0], src[1], src[2]);
    _q.set(src[3], src[4], src[5], src[6]);
    _m.compose(_p, _q, _s);
    for (const part of p.parts) {
      for (const mesh of part.meshes) {
        mesh.matrix.copy(_m);
        if (part.offsetM) mesh.matrix.multiply(part.offsetM);
        mesh.matrixWorldNeedsUpdate = true;
      }
    }
  }
  /** A broken-off part's own pose onto its meshes. */
  function writePart(part: LivePart, src: ArrayLike<number>): void {
    let same = true;
    for (let k = 0; k < 7; k++) if (part.pose[k] !== src[k]) { same = false; part.pose[k] = src[k]; }
    if (same) return;
    _p.set(src[0], src[1], src[2]);
    _q.set(src[3], src[4], src[5], src[6]);
    for (const mesh of part.meshes) { mesh.matrix.compose(_p, _q, _s); mesh.matrixWorldNeedsUpdate = true; }
  }

  /** A cap quad's two triangles into a material's list (its layout: uv and colour where it has them, 0 elsewhere). */
  function pushCap(list: number[], layout: Layout, cap: CapQuad): void {
    const [a, b, c, d] = cap.corners;
    const n = cap.n;
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    const uvOf = (p: readonly number[]): [number, number] => (ax >= ay && ax >= az ? [p[2] * CAP_UV_DENSITY, p[1] * CAP_UV_DENSITY]
      : ay >= az ? [p[0] * CAP_UV_DENSITY, p[2] * CAP_UV_DENSITY] : [p[0] * CAP_UV_DENSITY, p[1] * CAP_UV_DENSITY]);
    const tint = cap.slot.tint, k = cap.shade;
    const vert = (p: readonly number[]): void => {
      list.push(p[0], p[1], p[2], n[0], n[1], n[2]);
      for (let i = 0; i < layout.names.length; i++) {
        const name = layout.names[i], size = layout.sizes[i];
        if (name === 'uv') { const uv = uvOf(p); list.push(uv[0], uv[1]); for (let j = 2; j < size; j++) list.push(0); }
        else if (name === 'color') { list.push(tint[0] * k, tint[1] * k, tint[2] * k); for (let j = 3; j < size; j++) list.push(1); }
        else for (let j = 0; j < size; j++) list.push(neutral(name));
      }
    };
    // each half wound to face n
    const tri = (p: readonly number[], q: readonly number[], r: readonly number[]): void => {
      const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], wx = r[0] - p[0], wy = r[1] - p[1], wz = r[2] - p[2];
      const facing = (uy * wz - uz * wy) * n[0] + (uz * wx - ux * wz) * n[1] + (ux * wy - uy * wx) * n[2] >= 0;
      if (facing) { vert(p); vert(q); vert(r); } else { vert(p); vert(r); vert(q); }
    };
    tri(a, b, c);
    tri(a, c, d);
  }

  /** The body frame of a building (world → body: the inverse of rotateY(yaw) then translate). */
  function frameOf(anatomy: StructureDamageAnatomy): { c: number; s: number; x: number; y: number; z: number } {
    const { placement } = anatomy;
    return { c: Math.cos(placement.yaw), s: Math.sin(placement.yaw), x: placement.x, y: placement.y, z: placement.z };
  }

  /** A building's sources: its spans, then any stage runs given; each material's layout the union of its sources'. */
  function addSources(job: Prepared, sources: Source[]): void {
    for (const src of sources) {
      const layout = layoutOf(src.geometry);
      const g = job.groups.get(src.material);
      if (!g) job.groups.set(src.material, { material: src.material, layout, lists: new Map() });
      else if (g.lists.size === 0) g.layout = unionLayout(g.layout, layout);
      job.sources.push(src);
    }
  }

  /** Cut `count` triangles of a source from `tri` on into the job's lists. */
  function cutChunk(job: Prepared, src: Source, tri: number, count: number): void {
    const g = job.groups.get(src.material)!;
    const layout = g.layout;
    const geometry = src.geometry;
    const f = frameOf(job.seam.anatomy);
    const pos = geometry.getAttribute('position'), nrm = geometry.getAttribute('normal');
    const attrs = layout.names.map((name) => (geometry.getAttribute(name) as THREE.BufferAttribute | undefined) ?? null);
    const soup = new Float64Array(count * 3 * layout.stride);
    const v = new THREE.Vector3(), nv = new THREE.Vector3();
    const nm = src.world ? new THREE.Matrix3().getNormalMatrix(src.world) : null;
    for (let i = 0; i < count * 3; i++) {
      const at = src.first + tri * 3 + i, o2 = i * layout.stride;
      v.set(pos.getX(at), pos.getY(at), pos.getZ(at));
      if (src.world) v.applyMatrix4(src.world);
      if (nrm) { nv.set(nrm.getX(at), nrm.getY(at), nrm.getZ(at)); if (nm) nv.applyMatrix3(nm).normalize(); } else nv.set(0, 1, 0);
      const dx = v.x - f.x, dz = v.z - f.z;
      soup[o2] = dx * f.c - dz * f.s; soup[o2 + 1] = v.y - f.y; soup[o2 + 2] = dx * f.s + dz * f.c;
      soup[o2 + 3] = nv.x * f.c - nv.z * f.s; soup[o2 + 4] = nv.y; soup[o2 + 5] = nv.x * f.s + nv.z * f.c;
      let k = o2 + 6;
      for (let a = 0; a < attrs.length; a++) {
        const attr = attrs[a], size = layout.sizes[a];
        for (let j = 0; j < size; j++) soup[k++] = attr && j < attr.itemSize ? attr.getComponent(at, j) : neutral(layout.names[a]);
      }
    }
    const parts = partitionTriangles(job.plan, soup, count, layout.stride);
    for (const [key, list] of parts) {
      const into = g.lists.get(key);
      if (into) for (let i = 0; i < list.length; i++) into.push(list[i]); else g.lists.set(key, list);
    }
  }

  /** Advance a job until it is done or the deadline passes (Infinity: to the end). */
  function advanceJob(job: Prepared, deadline: number): void {
    while (!job.done) {
      const src = job.sources[job.source];
      if (!src) { job.done = true; break; }
      const tris = Math.floor(src.count / 3);
      const count = Math.min(PREPARE_CHUNK, tris - job.tri);
      if (count > 0) cutChunk(job, src, job.tri, count);
      job.tri += Math.max(0, count);
      if (job.tri >= tris) { job.source++; job.tri = 0; }
      if (now() >= deadline) break;
    }
  }

  function jobFor(seam: StructureDamageSeam, resolve: (bucket: string) => THREE.Material | null): Prepared | null {
    const anatomy = seam.anatomy;
    if (!anatomy.storeys.length || !seam.spans.length) return null;
    const existing = prepared.get(seam.structureIdx);
    if (existing) { existing.touched = ++touch; return existing; }
    // the cut does not depend on the blow: a neutral one
    const plan = planCollapsePieces(anatomy, { cause: null, dirX: 0, dirZ: 0, point: null }, { cap: o.cap });
    const job: Prepared = { structureIdx: seam.structureIdx, seam, plan, groups: new Map(), sources: [], source: 0, tri: 0, done: false,
      touched: ++touch, resolve, built: null, queue: null };
    const sources: Source[] = [];
    for (const span of seam.spans) {
      const geometry = (span.mesh as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      if (!geometry?.getAttribute) continue;
      const material = resolve(span.bucket);
      if (!material) continue;
      // the merged buckets are in world space (identity matrices under the world root)
      sources.push({ geometry, material, first: span.first, count: span.count, world: null });
    }
    addSources(job, sources);
    // a cut never used gives way to a newer one
    if (prepared.size >= PREPARED_MAX) {
      let oldest: Prepared | null = null;
      for (const j of prepared.values()) if (!oldest || j.touched < oldest.touched) oldest = j;
      if (oldest) { prepared.delete(oldest.structureIdx); disposeBuilt(oldest); }
    }
    prepared.set(seam.structureIdx, job);
    return job;
  }

  /** A laid cut's caps: each piece's (each part's) broken edges and back, the remnant's broken tops, in their slots'
   *  materials. */
  function addCaps(job: Prepared): void {
    const plan = job.plan, groups = job.groups;
    const defaultLayout: Layout = { names: ['uv', 'color'], sizes: [2, 3], stride: 11 };
    const capInto = (key: number, cap: CapQuad): void => {
      const material = job.resolve(cap.slot.bucket);
      let g = material ? groups.get(material) : groups.values().next().value as Group | undefined;
      if (!g && material) { g = { material, layout: defaultLayout, lists: new Map() }; groups.set(material, g); }
      if (!g) return;
      let list = g.lists.get(key);
      if (!list) { list = []; g.lists.set(key, list); }
      pushCap(list, g.layout, cap);
    };
    for (const piece of plan.pieces) for (const cap of capPiece(plan, piece)) capInto(piece.index * PART_STRIDE + (cap.part ?? 0), cap);
    for (const cap of capStubs(plan)) capInto(STATIC_PIECE, cap);
  }
  const _v = new THREE.Vector3(), _iq = new THREE.Quaternion();
  /** One list's geometry: the remnant's in world space, a piece's part in its own frame. */
  function geometryOfList(job: Prepared, g: Group, key: number, list: number[]): THREE.BufferGeometry {
    const plan = job.plan, layout = g.layout, f = frameOf(job.seam.anatomy);
    const verts = list.length / layout.stride;
    const pos = new Float32Array(verts * 3), nrm = new Float32Array(verts * 3);
    const extra = layout.sizes.map((size) => new Float32Array(verts * size));
    const piece = key >= 0 ? plan.pieces[Math.floor(key / PART_STRIDE)] : null;
    const off = piece ? piece.parts[key % PART_STRIDE]?.center ?? [0, 0, 0] : [0, 0, 0];
    if (piece) _iq.set(-piece.rotation[0], -piece.rotation[1], -piece.rotation[2], piece.rotation[3]);
    for (let i = 0; i < verts; i++) {
      const at = i * layout.stride, o3 = i * 3;
      if (piece) {
        const pc = piece.center;
        _v.set(list[at] - pc[0], list[at + 1] - pc[1], list[at + 2] - pc[2]).applyQuaternion(_iq);
        pos[o3] = _v.x - off[0]; pos[o3 + 1] = _v.y - off[1]; pos[o3 + 2] = _v.z - off[2];
        _v.set(list[at + 3], list[at + 4], list[at + 5]).applyQuaternion(_iq);
        nrm[o3] = _v.x; nrm[o3 + 1] = _v.y; nrm[o3 + 2] = _v.z;
      } else {
        const x = list[at], y = list[at + 1], z = list[at + 2];
        pos[o3] = f.x + x * f.c + z * f.s; pos[o3 + 1] = f.y + y; pos[o3 + 2] = f.z - x * f.s + z * f.c;
        const nx = list[at + 3], ny = list[at + 4], nz = list[at + 5];
        nrm[o3] = nx * f.c + nz * f.s; nrm[o3 + 1] = ny; nrm[o3 + 2] = -nx * f.s + nz * f.c;
      }
      let k = at + 6;
      for (let a = 0; a < layout.sizes.length; a++) {
        const size = layout.sizes[a];
        for (let j = 0; j < size; j++) extra[a][i * size + j] = list[k++];
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    layout.names.forEach((name, a) => geometry.setAttribute(name, new THREE.BufferAttribute(extra[a], layout.sizes[a])));
    geometry.computeBoundingSphere();
    return geometry;
  }
  /** Build a laid cut's geometries until done or the deadline (Infinity: all of them); its lists are let go as built. */
  function buildJob(job: Prepared, deadline = Infinity, caps = true): void {
    if (!job.queue) {
      if (caps) addCaps(job);
      job.built = new Map();
      job.queue = [];
      for (const g of job.groups.values()) for (const [key, list] of g.lists) if (list.length && key >= STATIC_PIECE) job.queue.push([g, key]);
    }
    while (job.queue.length) {
      const [g, key] = job.queue.pop()!;
      const list = g.lists.get(key)!;
      const geometry = geometryOfList(job, g, key, list);
      g.lists.delete(key);
      let entry = job.built!.get(key);
      if (!entry) { entry = []; job.built!.set(key, entry); }
      entry.push({ material: g.material, geometry });
      if (now() >= deadline) return;
    }
  }
  /** A cut's geometries, all of them (the rims laid at the collapse: no caps of their own). */
  function geometriesOf(job: Prepared, caps: boolean): Map<number, Array<{ material: THREE.Material; geometry: THREE.BufferGeometry }>> {
    buildJob(job, Infinity, caps);
    return job.built!;
  }
  function disposeBuilt(job: Prepared): void {
    if (job.built) for (const list of job.built.values()) for (const { geometry } of list) geometry.dispose();
    job.built = null;
    job.queue = null;
  }

  function collapse(seam: StructureDamageSeam, e: CollapseBodiesEvent, standing: readonly THREE.Mesh[],
    resolve: (bucket: string) => THREE.Material | null = o.materialFor, ready?: () => void): boolean {
    const job = jobFor(seam, resolve);
    if (!job) return false;
    if (job.plan.pieces.length < 3) { prepared.delete(seam.structureIdx); return false; }
    // its cut laid ahead: down now; felled before: it waits for its cut, a little a frame
    if (job.done && job.queue && !job.queue.length) { bringDown(job, seam, e, standing); ready?.(); return true; }
    if (!waiting.some((w) => w.seam.structureIdx === seam.structureIdx)) waiting.push({ seam, e: { ...e }, standing, resolve, ready, since: clockWait, job });
    return true;
  }

  /** The collapse itself, its cut laid: the plan with its blow, the meshes and the bodies. */
  function bringDown(job: Prepared, seam: StructureDamageSeam, e: CollapseBodiesEvent, standing: readonly THREE.Mesh[]): void {
    const anatomy: StructureDamageAnatomy = seam.anatomy;
    bind();
    const f = frameOf(anatomy);
    const { placement } = anatomy;
    const dl = Math.hypot(e.dirX || 0, e.dirZ || 0);
    const bx = (x: number, z: number) => (x - f.x) * f.c - (z - f.z) * f.s, bz = (x: number, z: number) => (x - f.x) * f.s + (z - f.z) * f.c;
    const blow: CollapseBlow = {
      cause: e.cause,
      dirX: dl > 1e-6 ? (e.dirX * f.c - e.dirZ * f.s) / dl : 0,
      dirZ: dl > 1e-6 ? (e.dirX * f.s + e.dirZ * f.c) / dl : 0,
      point: Number.isFinite(e.x) && Number.isFinite(e.z) ? [bx(e.x, e.z), (e.y ?? placement.y) - placement.y, bz(e.x, e.z)] : null,
    };
    // the fall's plan: the same cut as the job's (its own stream), the blow's order and shoves
    const plan = planCollapsePieces(anatomy, blow, { cap: o.cap });
    // the rest of the cut now (a building that fell before its cut was laid), then the rims the breaches laid since
    advanceJob(job, Infinity);
    buildJob(job);
    prepared.delete(seam.structureIdx);
    const built = job.built!;
    const runs: Source[] = [];
    const expanded: THREE.BufferGeometry[] = [];
    for (const run of standing) {
      const geometry = run.geometry as THREE.BufferGeometry;
      if (!geometry?.getAttribute || Array.isArray(run.material)) continue;
      run.updateWorldMatrix(true, false);
      const flat = geometry.getIndex() ? geometry.toNonIndexed() : geometry;
      if (flat !== geometry) expanded.push(flat);
      runs.push({ geometry: flat, material: run.material as THREE.Material, first: 0, count: flat.getAttribute('position').count, world: run.matrixWorld });
    }
    let rimBuilt: Map<number, Array<{ material: THREE.Material; geometry: THREE.BufferGeometry }>> | null = null;
    if (runs.length) {
      const rims: Prepared = { ...job, groups: new Map(), sources: [], source: 0, tri: 0, done: false, built: null, queue: null };
      addSources(rims, runs);
      advanceJob(rims, Infinity);
      rimBuilt = geometriesOf(rims, false);
    }
    for (const flat of expanded) flat.dispose();

    // the collapse: its remnant (static, world space), its pieces (meshes in their parts' frames, bodies in the pool)
    const mound = anatomy.mound ?? null;
    const reach = mound ? Math.max(mound.hw, mound.hd) + 8 : Math.max(anatomy.w, anatomy.d) / 2 + 8;
    const mx = mound ? mound.cx : placement.x, mz = mound ? mound.cz : placement.z;
    const lc: LiveCollapse = { structureIdx: anatomy.structureIdx, plan, yaw: placement.yaw, seam, event: { ...e }, t0: clockS, pieces: [],
      remnant: [], stubs: [], mound, box: [mx - reach, mz - reach, mx + reach, mz + reach], lastSoundS: -1, lastDustS: -1, baked: [], done: false };
    const meshOf = (geo: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh => {
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = name;
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      o.group.add(mesh);
      return mesh;
    };
    const geometriesFor = (key: number) => [...(built.get(key) ?? []), ...(rimBuilt?.get(key) ?? [])];
    // the remnant: the building's own stubs, piers and plinth where they stood
    for (const { material, geometry } of geometriesFor(STATIC_PIECE)) {
      const mesh = meshOf(geometry, material, `fx-collapse-remnant-${anatomy.structureIdx}`);
      mesh.matrix.identity();
      lc.remnant.push(mesh);
    }
    // the stubs as records (obb prisms, world): the pieces stand and land on them
    for (const record of stubRecords(plan, placement)) { lc.stubs.push(record); stubRecords_.push(record); }
    // the pieces
    for (const piece of plan.pieces) {
      if (piece.shatterS === 0) {
        shatterHandler?.(seam, piece, e);
        for (let k = 0; k < Math.max(1, piece.parts.length); k++) for (const g of geometriesFor(piece.index * PART_STRIDE + k)) g.geometry.dispose();
        continue;
      }
      const nParts = Math.max(1, piece.parts.length);
      const parts: LivePart[] = [];
      for (let k = 0; k < nParts; k++) {
        const off = piece.parts[k]?.center ?? [0, 0, 0];
        const meshes = geometriesFor(piece.index * PART_STRIDE + k)
          .map(({ material, geometry }) => meshOf(geometry, material, `fx-collapse-${piece.kind}-${anatomy.structureIdx}-${piece.index}.${k}`));
        const offset = new THREE.Vector3(off[0], off[1], off[2]);
        parts.push({ meshes, offset, offsetM: offset.lengthSq() > 0 ? new THREE.Matrix4().makeTranslation(off[0], off[1], off[2]) : null,
          handle: -1, pose: new Float64Array(7).fill(NaN) });
      }
      if (!parts.some((pp) => pp.meshes.length)) continue;
      const spawn = pieceSpawn(piece, placement);
      const handle = pool.spawn(pieceShape(piece), { ...spawn, asleep: true }, piece.releaseS);
      if (handle < 0) {
        // the pool is full (a barrage's collapses at once): this piece bursts where it stands rather than hang there
        for (const pp of parts) for (const m of pp.meshes) { m.removeFromParent(); m.geometry.dispose(); }
        if (piece.face) shatterHandler?.(seam, piece, e);
        continue;
      }
      const lp: LivePiece = { piece, handle, parts, broken: false, still: 0, sounds: 0, dusts: 0, kicked: false, shattered: false,
        pose: new Float64Array(7).fill(NaN) };
      writeWhole(lp, [spawn.x, spawn.y, spawn.z, spawn.qx, spawn.qy, spawn.qz, spawn.qw]);
      lc.pieces.push(lp);
      if (handle >= 0) byHandle.set(handle, { c: lc, p: lp, part: -1 });
    }
    falling.add(anatomy.structureIdx);
    live.push(lc);
  }

  /** A panel's parts each into its own body: at their places on the panel now, with the panel's motion there. */
  function breakApart(c: LiveCollapse, p: LivePiece): void {
    if (p.handle < 0) return;
    pool.framePoseAt(p.handle, pose);
    pool.velocity(p.handle, vel);
    byHandle.delete(p.handle);
    pool.release(p.handle);
    p.handle = -1;
    _q.set(pose[3], pose[4], pose[5], pose[6]);
    _w.set(vel[3], vel[4], vel[5]);
    for (let k = 0; k < p.parts.length; k++) {
      const part = p.parts[k], spec = p.piece.parts[k];
      if (!spec || !part.meshes.length) continue;
      _o.copy(part.offset).applyQuaternion(_q);
      // v at the part = v + w × r
      const vx = vel[0] + (_w.y * _o.z - _w.z * _o.y), vy = vel[1] + (_w.z * _o.x - _w.x * _o.z), vz = vel[2] + (_w.x * _o.y - _w.y * _o.x);
      const h = pool.spawn(partShape(spec), {
        x: pose[0] + _o.x, y: pose[1] + _o.y, z: pose[2] + _o.z, qx: pose[3], qy: pose[4], qz: pose[5], qw: pose[6],
        vx, vy, vz, wx: vel[3], wy: vel[4], wz: vel[5],
      });
      part.handle = h;
      if (h >= 0) {
        byHandle.set(h, { c, p, part: k });
        writePart(part, [pose[0] + _o.x, pose[1] + _o.y, pose[2] + _o.z, pose[3], pose[4], pose[5], pose[6]]);
      } else {
        // no room for it: it goes (it would hang where the panel cracked)
        for (const m of part.meshes) { m.removeFromParent(); m.geometry.dispose(); }
        part.meshes.length = 0;
      }
    }
  }

  /** Every piece of a settled collapse into one static mesh a material, world space; their bodies leave the pool. */
  function bake(lc: LiveCollapse): void {
    const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const p of lc.pieces) {
      for (const part of p.parts) {
        for (const mesh of part.meshes) {
          const geo = mesh.geometry.clone().applyMatrix4(mesh.matrix);
          const list = byMaterial.get(mesh.material as THREE.Material) ?? [];
          list.push(geo);
          byMaterial.set(mesh.material as THREE.Material, list);
          mesh.removeFromParent();
          mesh.geometry.dispose();
        }
        part.meshes.length = 0;
        if (part.handle >= 0) { byHandle.delete(part.handle); pool.release(part.handle); part.handle = -1; }
      }
      if (p.handle >= 0) { byHandle.delete(p.handle); pool.release(p.handle); p.handle = -1; }
    }
    for (const [material, geos] of byMaterial) {
      const merged = mergeSameLayout(geos);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = `fx-collapse-baked-${lc.structureIdx}`;
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      o.group.add(mesh);
      lc.baked.push(mesh);
    }
    lc.done = true;
    bakedCount++;
    falling.delete(lc.structureIdx);
  }

  return {
    prepare(seam, resolve = o.materialFor) { jobFor(seam, resolve); },
    collapse,
    update(dtS) {
      clockWait += Math.max(0, dtS);
      // the collapses waiting for their cut: 4 ms a frame, at most a third of a second, then down
      for (let i = 0; i < waiting.length;) {
        const w = waiting[i];
        const deadline = clockWait - w.since > 0.33 ? Infinity : now() + 4;
        if (!w.job.done) advanceJob(w.job, deadline);
        if (w.job.done) buildJob(w.job, deadline);
        if (w.job.done && w.job.queue && !w.job.queue.length) {
          waiting.splice(i, 1);
          bringDown(w.job, w.seam, w.e, w.standing);
          w.ready?.();
          continue;
        }
        i++;
      }
      // the cuts laid ahead, within the frame's budget
      if (prepared.size) {
        const deadline = now() + budgetMs;
        for (const job of prepared.values()) {
          if (job.queue && !job.queue.length) continue;
          if (!job.done) advanceJob(job, deadline);
          if (job.done && now() < deadline) buildJob(job, deadline);
          if (now() >= deadline) break;
        }
      }
      if (!live.length) return;
      bind();
      clockS += Math.max(0, dtS);
      // a heap rising under its pieces wakes those lying on it
      wakeTimer -= dtS;
      if (wakeTimer <= 0) {
        wakeTimer = 0.2;
        for (const c of live) {
          const t = clockS - c.t0;
          if (c.done || t < RISE_FROM_S || t > RISE_TO_S + 0.3) continue;
          pool.world.wakeInBox(c.box[0], -1e4, c.box[1], c.box[2], 1e4, c.box[3]);
        }
      }
      // the vehicles shove what lies in their way (and a slab lands on a deck)
      hullList.length = 0;
      const hulls = o.hulls?.();
      if (hulls) for (const t of hulls) if (t && (t as WreckTurretTank).state && (t as WreckTurretTank).spec) hullList.push(t as WreckTurretTank);
      pool.setHulls(hullList);
      pool.advance(dtS);
      // the panels that landed hard crack now (outside the pool's report)
      while (breaking.length) { const b = breaking.pop()!; breakApart(b.c, b.p); }
      for (let i = 0; i < live.length; i++) {
        const c = live[i];
        if (c.done) continue;
        let allStill = true, allSlow = true;
        const age = clockS - c.t0;
        const settle = (handle: number, p: LivePiece): void => {
          if (pool.asleep(handle) && age > p.piece.releaseS + 0.5) p.still += dtS; else { p.still = 0; allStill = false; }
          if (p.still < BAKE_STILL_S) allStill = false;
          if (allSlow && pool.velocity(handle, vel)
            && (Math.hypot(vel[0], vel[1], vel[2]) > SLOW_MPS || Math.hypot(vel[3], vel[4], vel[5]) > SLOW_RADS)) allSlow = false;
        };
        for (const p of c.pieces) {
          if (p.handle >= 0) {
            if (pool.framePoseAt(p.handle, pose)) writeWhole(p, pose);
            // the failure reaching a wall that held: it bursts where it stands and whatever rested on it is woken
            if (!p.shattered && p.piece.shatterS > 0 && age >= p.piece.shatterS) {
              p.shattered = true;
              byHandle.delete(p.handle);
              pool.release(p.handle);
              p.handle = -1;
              for (const part of p.parts) { for (const m of part.meshes) { m.removeFromParent(); m.geometry.dispose(); } part.meshes.length = 0; }
              const r = Math.max(...p.piece.boxes.map((b) => Math.hypot(...b.center) + Math.hypot(...b.half))) + 0.8;
              pool.world.wakeInBox(pose[0] - r, pose[1] - r, pose[2] - r, pose[0] + r, pose[1] + r, pose[2] + r);
              shatterHandler?.(c.seam, p.piece, c.event);
              // its dust, rolling out from its foot
              o.onLanding?.(pose[0], pose[1] - (p.piece.face ? (p.piece.face.y1 - p.piece.face.y0) / 2 : 0), pose[2], 6, p.piece.massKg, c.structureIdx);
              continue;
            }
            // its release: the shove that lets it go (from where it stands now: a piece struck sooner is moving already)
            if (!p.kicked && age >= p.piece.releaseS) {
              p.kicked = true;
              if (pieceKick(p.piece, { yaw: c.yaw }, pose, impulse)) pool.impulse(p.handle, impulse[0], impulse[1], impulse[2], impulse[3], impulse[4], impulse[5]);
            }
            settle(p.handle, p);
          } else if (p.broken) {
            for (const part of p.parts) {
              if (part.handle < 0) continue;
              if (pool.framePoseAt(part.handle, pose)) writePart(part, pose);
              settle(part.handle, p);
            }
          }
        }
        if (allStill || (allSlow && age > BAKE_SLOW_AGE_S) || age > BAKE_AGE_S) bake(c);
      }
    },
    get active() { return live.filter((c) => !c.done).length; },
    took: (structureIdx) => live.some((c) => c.structureIdx === structureIdx) || waiting.some((w) => w.seam.structureIdx === structureIdx),
    onShatter(handler) { shatterHandler = handler; },
    reset() {
      for (const c of live) {
        for (const p of c.pieces) for (const part of p.parts) for (const m of part.meshes) { m.removeFromParent(); m.geometry.dispose(); }
        for (const m of [...c.remnant, ...c.baked]) { m.removeFromParent(); m.geometry.dispose(); }
      }
      live.length = 0;
      byHandle.clear();
      for (const job of prepared.values()) disposeBuilt(job);
      prepared.clear();
      falling.clear();
      breaking.length = 0;
      waiting.length = 0;
      stubRecords_.length = 0;
      pool.reset();
      bound = false;
      clockS = 0;
    },
    stats() {
      let pieces = 0, meshes = 0, vertices = 0;
      for (const c of live) {
        for (const p of c.pieces) {
          if (p.handle >= 0) pieces++;
          for (const part of p.parts) {
            if (part.handle >= 0) pieces++;
            for (const m of part.meshes) { meshes++; vertices += m.geometry.getAttribute('position').count; }
          }
        }
        for (const m of [...c.remnant, ...c.baked]) { meshes++; vertices += m.geometry.getAttribute('position').count; }
      }
      return { collapses: live.length, pieces, meshes, vertices, baked: bakedCount, prepared: prepared.size };
    },
  };
}

/** Non-indexed geometries with the same attributes into one (null when they disagree or are empty). */
function mergeSameLayout(geos: readonly THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!geos.length) return null;
  const names = Object.keys(geos[0].attributes);
  if (!geos.every((g) => Object.keys(g.attributes).length === names.length && names.every((n) => !!g.attributes[n]))) return null;
  const total = geos.reduce((a, g) => a + g.getAttribute('position').count, 0);
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = (geos[0].getAttribute(name) as THREE.BufferAttribute).itemSize;
    const arr = new Float32Array(total * size);
    let at = 0;
    for (const g of geos) {
      const a = g.getAttribute(name) as THREE.BufferAttribute;
      arr.set(a.array as Float32Array, at);
      at += a.count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}
