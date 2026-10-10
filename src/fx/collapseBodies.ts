/**
 * collapseBodies.ts — a collapsing building's pieces as bodies (destruction core lane, 2026-10-10; the owner: "make
 * thier collapses much more natural" and "just let physics work for these kinds of things").
 *
 * At a collapse (structureStages: a building's 'collapsed' stage, live) the building as it stands — its own triangles
 * from the world's merged buckets (the seam's spans) and the rims its breaches redrew — is cut between the plan's
 * pieces (collapsePieces.ts: wall panels over the stubs, floor slabs, roof slabs, gables, chimneys), each piece's
 * broken edges and back are capped in its core, and every piece becomes a mesh in the building's own materials (no new
 * program) that follows a body in the presentation's debris pool (debrisPhysics.ts). The standing building is hidden
 * the same frame: the eye sees it break, not swap. What stays standing (the stubs, the corner piers, the plinth, a
 * chimney's foot) is the building's own geometry too, kept static, and is solid to the pieces.
 *
 * The pieces wait, asleep and solid, for their release (the struck face at once, the roof and the faces beside it a
 * beat later, the far face last) unless something strikes them or their support goes: the collapse comes down as one
 * thing. The pool's ground is the drawn ground, the battle's heaps in it, but a collapsing building's own heap rises
 * under its pieces as they come down (it is the sim's at once). Hard landings make their dust and their recorded sound
 * (collapseImpacts.ts). When every piece of a collapse has lain still a while, its pieces are baked into one static mesh
 * a material and their bodies leave the pool.
 */
import * as THREE from 'three';
import type { RigidEnvironment } from '../sim/rigidBody.ts';
import type { CollisionRecord } from '../world/collision.ts';
import type { StructureDamageSeam } from '../world/structureDamageSeam.ts';
import type { StructureDamageAnatomy } from '../world/destructionKit.ts';
import { rubbleMoundHeightAt, type RubbleMound } from '../sim/terrainDeformation.ts';
import type { DebrisPhysics } from './debrisPhysics.ts';
import {
  STATIC_PIECE, capPiece, capStubs, partitionTriangles, pieceKick, pieceShape, pieceSpawn, planCollapsePieces, stubRecords,
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

export interface CollapseBodiesOptions {
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
}

/** A wall panel the blow's failure reached (CollapsePiece.shatterS): its building and its place on its face. */
export type CollapseShatterHandler = (seam: StructureDamageSeam, piece: CollapsePiece, e: CollapseBodiesEvent) => void;

export interface CollapseBodies {
  /**
   * The building comes down as bodies: false when it cannot (no storeys, no pool room, too few pieces) and the caller
   * keeps its scripted collapse. `standing` are the stage runs that stood with it (a breach's rim and room): they are
   * cut with it and the caller drops them.
   */
  collapse(seam: StructureDamageSeam, e: CollapseBodiesEvent, standing: readonly THREE.Mesh[],
    materialFor?: (bucket: string) => THREE.Material | null): boolean;
  /** The fx clock's delta: the pool steps, every piece follows its body. */
  update(dtS: number): void;
  /** Collapses in flight (their pieces not all baked). */
  readonly active: number;
  /** Who bursts a shattered panel into the kit's pieces and dust (structureStages). */
  onShatter(handler: CollapseShatterHandler | null): void;
  reset(): void;
  stats(): { collapses: number; pieces: number; meshes: number; vertices: number; baked: number };
}

/** A material's vertex layout: position, normal, then its other attributes in order (sizes). */
interface Layout {
  names: string[];
  sizes: number[];
  stride: number;
}

interface LivePiece {
  piece: CollapsePiece;
  handle: number;
  meshes: THREE.Mesh[];
  /** Seconds lain still (asleep). */
  still: number;
  sounds: number;
  dusts: number;
  /** Its kick given (at its release); its burst done (a panel the failure reached). */
  kicked: boolean;
  shattered: boolean;
  /** The last pose written (to skip a still piece's matrix). */
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
const CAP_UV_DENSITY = 0.55;
export function createCollapseBodies(o: CollapseBodiesOptions): CollapseBodies {
  const pool = o.pool;
  const live: LiveCollapse[] = [];
  const byHandle = new Map<number, { c: LiveCollapse; p: LivePiece }>();
  const falling = new Set<number>();
  const stubRecords_: CollisionRecord[] = [];
  let clockS = 0;
  let bakedCount = 0;
  let wakeTimer = 0;
  const pose = new Float64Array(7);
  const impulse = new Float64Array(6);
  const vel = new Float64Array(6);
  let shatterHandler: CollapseShatterHandler | null = null;
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
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
        const k = t <= RISE_FROM_S ? 0 : (t - RISE_FROM_S) / (RISE_TO_S - RISE_FROM_S);
        const rise = k * k * (3 - 2 * k);
        if (x < c.box[0] || x > c.box[2] || z < c.box[1] || z > c.box[3]) continue;
        g -= (1 - rise) * rubbleMoundHeightAt(c.mound, x, z);
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
      if (record.structureIdx !== undefined && falling.has(record.structureIdx) && !stubRecords_.includes(record)) return false;
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
    writePose(hit.p, final);
    hit.p.handle = -1;
    byHandle.delete(handle);
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
  /** An attribute a source lacks, as the material would read it absent: a colour and the weathering's tint and shade
   *  white, anything else 0. */
  function neutral(name: string): number {
    return name === 'color' || name === 'tint' || name === 'shade' ? 1 : 0;
  }

  function writePose(p: LivePiece, src: ArrayLike<number>): void {
    let same = true;
    for (let k = 0; k < 7; k++) if (p.pose[k] !== src[k]) { same = false; p.pose[k] = src[k]; }
    if (same) return;
    _p.set(src[0], src[1], src[2]);
    _q.set(src[3], src[4], src[5], src[6]);
    for (const mesh of p.meshes) {
      mesh.matrix.compose(_p, _q, _s);
      mesh.matrixWorldNeedsUpdate = true;
    }
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
        else for (let j = 0; j < size; j++) list.push(name === 'tint' ? 1 : name === 'shade' ? 1 : 0);
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

  function collapse(seam: StructureDamageSeam, e: CollapseBodiesEvent, standing: readonly THREE.Mesh[],
    resolve: (bucket: string) => THREE.Material | null = o.materialFor): boolean {
    const anatomy: StructureDamageAnatomy = seam.anatomy;
    if (!anatomy.storeys.length || !seam.spans.length) return false;
    bind();
    const { placement } = anatomy;
    const c = Math.cos(placement.yaw), s = Math.sin(placement.yaw);
    // world → body (the inverse of rotateY(yaw) then translate)
    const toBodyX = (x: number, z: number) => (x - placement.x) * c - (z - placement.z) * s;
    const toBodyZ = (x: number, z: number) => (x - placement.x) * s + (z - placement.z) * c;
    const dl = Math.hypot(e.dirX || 0, e.dirZ || 0);
    const blow: CollapseBlow = {
      cause: e.cause,
      dirX: dl > 1e-6 ? (e.dirX * c - e.dirZ * s) / dl : 0,
      dirZ: dl > 1e-6 ? (e.dirX * s + e.dirZ * c) / dl : 0,
      point: Number.isFinite(e.x) && Number.isFinite(e.z) ? [toBodyX(e.x, e.z), (e.y ?? placement.y) - placement.y, toBodyZ(e.x, e.z)] : null,
    };
    const plan = planCollapsePieces(anatomy, blow, { cap: o.cap });
    if (plan.pieces.length < 3) return false;

    // the building's own triangles, a material at a time, into the body frame, cut between the pieces
    interface Group { material: THREE.Material; layout: Layout; lists: Map<number, number[]> }
    const groups = new Map<THREE.Material, Group>();
    const groupFor = (material: THREE.Material, layout: Layout): Group => {
      let g = groups.get(material);
      if (!g) { g = { material, layout, lists: new Map() }; groups.set(material, g); }
      return g;
    };
    // each material's layout: the union of its sources' (first pass), so no source's triangles are left out
    const sources: Array<{ geometry: THREE.BufferGeometry; material: THREE.Material; first: number; count: number; world: THREE.Matrix4 | null }> = [];
    const cut = (geometry: THREE.BufferGeometry, material: THREE.Material, first: number, count: number, world: THREE.Matrix4 | null): void => {
      const g = groups.get(material)!;
      const layout = g.layout;
      const pos = geometry.getAttribute('position'), nrm = geometry.getAttribute('normal');
      const attrs = layout.names.map((name) => (geometry.getAttribute(name) as THREE.BufferAttribute | undefined) ?? null);
      const tris = Math.floor(count / 3);
      if (!tris) return;
      const soup = new Float64Array(tris * 3 * layout.stride);
      const v = new THREE.Vector3(), nv = new THREE.Vector3();
      const nm = world ? new THREE.Matrix3().getNormalMatrix(world) : null;
      for (let i = 0; i < tris * 3; i++) {
        const src = first + i, o2 = i * layout.stride;
        v.set(pos.getX(src), pos.getY(src), pos.getZ(src));
        if (world) v.applyMatrix4(world);
        if (nrm) { nv.set(nrm.getX(src), nrm.getY(src), nrm.getZ(src)); if (nm) nv.applyMatrix3(nm).normalize(); } else nv.set(0, 1, 0);
        soup[o2] = toBodyX(v.x, v.z); soup[o2 + 1] = v.y - placement.y; soup[o2 + 2] = toBodyZ(v.x, v.z);
        soup[o2 + 3] = nv.x * c - nv.z * s; soup[o2 + 4] = nv.y; soup[o2 + 5] = nv.x * s + nv.z * c;
        let k = o2 + 6;
        for (let a = 0; a < attrs.length; a++) {
          const attr = attrs[a], size = layout.sizes[a];
          for (let j = 0; j < size; j++) soup[k++] = attr && j < attr.itemSize ? attr.getComponent(src, j) : neutral(layout.names[a]);
        }
      }
      const parts = partitionTriangles(plan, soup, tris, layout.stride);
      for (const [piece, list] of parts) {
        const into = g.lists.get(piece);
        if (into) for (let i = 0; i < list.length; i++) into.push(list[i]); else g.lists.set(piece, list);
      }
    };
    for (const span of seam.spans) {
      const mesh = span.mesh as THREE.Mesh;
      const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
      if (!geometry?.getAttribute) continue;
      const material = resolve(span.bucket);
      if (!material) continue;
      // the merged buckets are in world space (identity matrices under the world root)
      sources.push({ geometry, material, first: span.first, count: span.count, world: null });
    }
    const expanded: THREE.BufferGeometry[] = [];
    for (const run of standing) {
      const geometry = run.geometry as THREE.BufferGeometry;
      const material = run.material as THREE.Material;
      if (!geometry?.getAttribute || Array.isArray(run.material)) continue;
      run.updateWorldMatrix(true, false);
      // a stage run is indexed: expanded
      const flat = geometry.getIndex() ? geometry.toNonIndexed() : geometry;
      if (flat !== geometry) expanded.push(flat);
      sources.push({ geometry: flat, material, first: 0, count: flat.getAttribute('position').count, world: run.matrixWorld });
    }
    for (const src of sources) {
      const layout = layoutOf(src.geometry);
      const g = groups.get(src.material);
      if (!g) groups.set(src.material, { material: src.material, layout, lists: new Map() });
      else g.layout = unionLayout(g.layout, layout);
    }
    for (const src of sources) cut(src.geometry, src.material, src.first, src.count, src.world);
    for (const flat of expanded) flat.dispose();
    if (!groups.size) return false;

    // the caps: each piece's broken edges and back, the remnant's broken tops, in their slots' materials
    const fallbackGroup = groups.values().next().value as Group;
    const capInto = (piece: number, cap: CapQuad): void => {
      const material = resolve(cap.slot.bucket);
      const g = material ? groupFor(material, groups.get(material)?.layout ?? defaultLayout(material)) : fallbackGroup;
      let list = g.lists.get(piece);
      if (!list) { list = []; g.lists.set(piece, list); }
      pushCap(list, g.layout, cap);
    };
    for (const piece of plan.pieces) for (const cap of capPiece(plan, piece)) capInto(piece.index, cap);
    for (const cap of capStubs(plan)) capInto(STATIC_PIECE, cap);

    // the collapse: its remnant (static, world space), its pieces (meshes in their own frames, bodies in the pool)
    const t0 = clockS;
    const mound = anatomy.mound ?? null;
    const reach = mound ? Math.max(mound.hw, mound.hd) + 8 : Math.max(anatomy.w, anatomy.d) / 2 + 8;
    const cx = mound ? mound.cx : placement.x, cz = mound ? mound.cz : placement.z;
    const lc: LiveCollapse = { structureIdx: anatomy.structureIdx, plan, yaw: placement.yaw, seam, event: { ...e }, t0, pieces: [], remnant: [], stubs: [], mound,
      box: [cx - reach, cz - reach, cx + reach, cz + reach], lastSoundS: -1, lastDustS: -1, baked: [], done: false };
    const toWorld = (bx: number, by: number, bz: number, out: number[] | Float32Array, at: number): void => {
      out[at] = placement.x + bx * c + bz * s; out[at + 1] = placement.y + by; out[at + 2] = placement.z - bx * s + bz * c;
    };
    const geometryOf = (layout: Layout, list: number[], transform: (src: number[], at: number, pos: Float32Array, nrm: Float32Array, o3: number) => void): THREE.BufferGeometry => {
      const verts = list.length / layout.stride;
      const pos = new Float32Array(verts * 3), nrm = new Float32Array(verts * 3);
      const extra = layout.sizes.map((size) => new Float32Array(verts * size));
      for (let i = 0; i < verts; i++) {
        const at = i * layout.stride;
        transform(list, at, pos, nrm, i * 3);
        let k = at + 6;
        for (let a = 0; a < layout.sizes.length; a++) {
          const size = layout.sizes[a];
          for (let j = 0; j < size; j++) extra[a][i * size + j] = list[k++];
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      layout.names.forEach((name, a) => geo.setAttribute(name, new THREE.BufferAttribute(extra[a], layout.sizes[a])));
      geo.computeBoundingSphere();
      return geo;
    };
    const meshOf = (geo: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh => {
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = name;
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      o.group.add(mesh);
      return mesh;
    };
    // the remnant: the building's own stubs, piers and plinth where they stood
    for (const g of groups.values()) {
      const list = g.lists.get(STATIC_PIECE);
      if (!list?.length) continue;
      const geo = geometryOf(g.layout, list, (src, at, pos, nrm, o3) => {
        toWorld(src[at], src[at + 1], src[at + 2], pos, o3);
        const nx = src[at + 3], ny = src[at + 4], nz = src[at + 5];
        nrm[o3] = nx * c + nz * s; nrm[o3 + 1] = ny; nrm[o3 + 2] = -nx * s + nz * c;
      });
      const mesh = meshOf(geo, g.material, `fx-collapse-remnant-${anatomy.structureIdx}`);
      mesh.matrix.identity();
      lc.remnant.push(mesh);
    }
    // the stubs as records (obb prisms, world): the pieces stand and land on them
    for (const record of stubRecords(plan, placement)) { lc.stubs.push(record); stubRecords_.push(record); }
    // the pieces: their meshes in their own frames, their bodies resting where they stood until their release
    for (const piece of plan.pieces) {
      if (piece.shatterS === 0) { shatterHandler?.(seam, piece, e); continue; }
      const qp = new THREE.Quaternion(piece.rotation[0], piece.rotation[1], piece.rotation[2], piece.rotation[3]);
      const inv = qp.clone().invert();
      const pc = piece.center;
      const meshes: THREE.Mesh[] = [];
      for (const g of groups.values()) {
        const list = g.lists.get(piece.index);
        if (!list?.length) continue;
        const v = new THREE.Vector3();
        const geo = geometryOf(g.layout, list, (src, at, pos, nrm, o3) => {
          v.set(src[at] - pc[0], src[at + 1] - pc[1], src[at + 2] - pc[2]).applyQuaternion(inv);
          pos[o3] = v.x; pos[o3 + 1] = v.y; pos[o3 + 2] = v.z;
          v.set(src[at + 3], src[at + 4], src[at + 5]).applyQuaternion(inv);
          nrm[o3] = v.x; nrm[o3 + 1] = v.y; nrm[o3 + 2] = v.z;
        });
        meshes.push(meshOf(geo, g.material, `fx-collapse-${piece.kind}-${anatomy.structureIdx}-${piece.index}`));
      }
      if (!meshes.length) continue;
      const spawn = pieceSpawn(piece, placement);
      const handle = pool.spawn(pieceShape(piece), { ...spawn, asleep: true }, piece.releaseS);
      const lp: LivePiece = { piece, handle, meshes, still: 0, sounds: 0, dusts: 0, kicked: false, shattered: false, pose: new Float64Array(7).fill(NaN) };
      writePose(lp, [spawn.x, spawn.y, spawn.z, spawn.qx, spawn.qy, spawn.qz, spawn.qw]);
      lc.pieces.push(lp);
      if (handle >= 0) byHandle.set(handle, { c: lc, p: lp });
    }
    falling.add(anatomy.structureIdx);
    live.push(lc);
    return true;
  }

  function defaultLayout(material: THREE.Material): Layout {
    void material;
    return { names: ['uv', 'color'], sizes: [2, 3], stride: 11 };
  }

  /** Every piece of a settled collapse into one static mesh a material, world space; their bodies leave the pool. */
  function bake(lc: LiveCollapse): void {
    const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const p of lc.pieces) {
      for (const mesh of p.meshes) {
        const geo = mesh.geometry.clone().applyMatrix4(mesh.matrix);
        const list = byMaterial.get(mesh.material as THREE.Material) ?? [];
        list.push(geo);
        byMaterial.set(mesh.material as THREE.Material, list);
        mesh.removeFromParent();
        mesh.geometry.dispose();
      }
      p.meshes.length = 0;
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
  }

  return {
    collapse,
    update(dtS) {
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
      pool.advance(dtS);
      for (let i = 0; i < live.length; i++) {
        const c = live[i];
        if (c.done) continue;
        let allStill = true, allSlow = true;
        const age = clockS - c.t0;
        for (const p of c.pieces) {
          if (p.handle < 0) continue;
          if (pool.framePoseAt(p.handle, pose)) writePose(p, pose);
          // the failure reaching a wall that held: it bursts where it stands and whatever rested on it is woken
          if (!p.shattered && p.piece.shatterS > 0 && age >= p.piece.shatterS) {
            p.shattered = true;
            byHandle.delete(p.handle);
            pool.release(p.handle);
            p.handle = -1;
            for (const m of p.meshes) { m.removeFromParent(); m.geometry.dispose(); }
            p.meshes.length = 0;
            const r = Math.max(...p.piece.boxes.map((b) => Math.hypot(...b.center) + Math.hypot(...b.half))) + 0.8;
            pool.world.wakeInBox(pose[0] - r, pose[1] - r, pose[2] - r, pose[0] + r, pose[1] + r, pose[2] + r);
            shatterHandler?.(c.seam, p.piece, c.event);
            // its dust, rolling out from its foot
            o.onLanding?.(pose[0], pose[1] - (p.piece.face ? (p.piece.face.y1 - p.piece.face.y0) / 2 : 0), pose[2], 6, p.piece.massKg, c.structureIdx);
            continue;
          }
          // its release: the shove that lets it go (from where it stands now: a piece struck sooner is already moving)
          if (!p.kicked && age >= p.piece.releaseS) {
            p.kicked = true;
            if (pieceKick(p.piece, { yaw: c.yaw }, pose, impulse)) pool.impulse(p.handle, impulse[0], impulse[1], impulse[2], impulse[3], impulse[4], impulse[5]);
          }
          if (pool.asleep(p.handle) && age > p.piece.releaseS + 0.5) p.still += dtS; else { p.still = 0; allStill = false; }
          if (p.still < BAKE_STILL_S) allStill = false;
          if (allSlow && pool.velocity(p.handle, vel)
            && (Math.hypot(vel[0], vel[1], vel[2]) > SLOW_MPS || Math.hypot(vel[3], vel[4], vel[5]) > SLOW_RADS)) allSlow = false;
        }
        if (allStill || (allSlow && age > BAKE_SLOW_AGE_S) || age > BAKE_AGE_S) {
          bake(c);
          falling.delete(c.structureIdx);
        }
      }
    },
    get active() { return live.filter((c) => !c.done).length; },
    onShatter(handler) { shatterHandler = handler; },
    reset() {
      for (const c of live) {
        for (const p of c.pieces) for (const m of p.meshes) { m.removeFromParent(); m.geometry.dispose(); }
        for (const m of [...c.remnant, ...c.baked]) { m.removeFromParent(); m.geometry.dispose(); }
      }
      live.length = 0;
      byHandle.clear();
      falling.clear();
      stubRecords_.length = 0;
      pool.reset();
      bound = false;
      clockS = 0;
    },
    stats() {
      let pieces = 0, meshes = 0, vertices = 0;
      for (const c of live) {
        for (const p of c.pieces) { if (p.handle >= 0) pieces++; for (const m of p.meshes) { meshes++; vertices += m.geometry.getAttribute('position').count; } }
        for (const m of [...c.remnant, ...c.baked]) { meshes++; vertices += m.geometry.getAttribute('position').count; }
      }
      return { collapses: live.length, pieces, meshes, vertices, baked: bakedCount };
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
