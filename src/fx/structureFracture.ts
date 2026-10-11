/**
 * structureFracture.ts — a building's walls drawn as they break (destruction core lane, 2026-10-10; the owner: "the
 * destruction of buildings needs to be a lot better too, rn its way to sporadic and ugly instead of behaving like it
 * would with physics").
 *
 * The first round that strikes a face takes that face out of the world's merged buckets (its triangles flattened in
 * place, kept for the reset) and draws it again from its own triangles cut between its cells (wallFracture.ts): the
 * standing cells as one mesh a material, each broken edge closed across the wall's thickness in its core (the hole's
 * reveal), a spalled cell's skin gone and its core showing a few centimetres back (the recess), a sagging cell a few
 * centimetres down. What a round knocks through flies off along it as bodies — a few chunks of the wall's own brick,
 * render and window, the rest is dust — and what loses its load path falls as bodies, whole clusters of courses, in the
 * presentation's debris pool (fx/debrisPhysics.ts): they tumble, strike, pile and lie where they came to rest, baked
 * into a static mesh a material once still (never faded). A dark room stands behind a holed storey. Hard landings make
 * their dust and their recorded sound (collapseImpacts.ts), by mass and speed.
 *
 * Presentation only (P1: the simulation's stage and hit points stay the authority; with sections on its own holes are
 * the holes): deterministic from the building's anatomy and each round's own seed, so every peer draws the same breaks
 * from the same bursts. Event time only, but the poses of live bodies each frame.
 */
import * as THREE from 'three';
import type { MunitionClass } from '../sim/destructionEvents.ts';
import { createRigidShape, type RigidPartSpec } from '../sim/rigidBody.ts';
import { damageSeed, type FractureSlot } from '../world/destructionKit.ts';
import type { StructureDamageSeam, StructureSpan } from '../world/structureDamageSeam.ts';
import type { DebrisPhysics } from './debrisPhysics.ts';
import { emitCollapseImpact } from './collapseImpacts.ts';
import {
  CELL_CRACKED, CELL_FALLEN, CELL_GONE, CELL_OPENING, CELL_SPALLED, cellRect, createWallFracture, createWallStrikeOutcome, strikeWall,
  type FaceGrid, type WallFracture, type WallStrikeKind,
} from './wallFracture.ts';

export interface StructureFractureOptions {
  pool: DebrisPhysics;
  group: THREE.Group;
  /** A bucket's material for a building (its spans' own, else the world's). */
  materialFor(seam: StructureDamageSeam, bucket: string): THREE.Material | null;
  /** The fx clock (s). */
  now(): number;
  /** Keep a span's original positions before the first change (the owner's reset restores them). */
  keepSpan(span: StructureSpan): void;
  /** A hard landing (its dust): world point, speed, mass, the building. */
  onLanding?(x: number, y: number, z: number, speedMps: number, massKg: number, structureIdx: number): void;
  /** Bodies a round throws at most (chunks knocked through and clusters fallen together; default 10). */
  bodiesPerStrike?: number;
  /** The room behind a hole's material (structureStages' fx-structure-room: dim, vertex-tinted, warmed). */
  roomMaterial?: THREE.Material;
}

export interface StructureFracture {
  /**
   * A round on a wall (world point and travel): the faces it took and redrew, as [storey, face index] pairs, when it
   * broke one (the caller lays no hole of its own and lets the kit's runs on those faces go); null when it struck none.
   */
  strike(seam: StructureDamageSeam, x: number, y: number, z: number, dirX: number, dirZ: number, munition: MunitionClass,
    chargeKg: number, caliberMm: number, radiusM?: number): number[] | null;
  /** Whether a building has faces drawn here. */
  has(structureIdx: number): boolean;
  /** Its standing faces' meshes (world space): a collapse cuts them with the building. */
  standing(structureIdx: number): THREE.Mesh[];
  /** The building came down: its standing faces leave (the collapse drew them); its bodies and heaps stay. */
  release(structureIdx: number): void;
  /** Per frame (after the pool's step): the strikes' drawing within its budget, live bodies' poses, still ones baked. */
  update(): void;
  /** Finish every queued strike's drawing now (receipts, a settle). */
  flush(): void;
  /** Bodies in the pool now (the pool steps while any owner has some). */
  liveBodies(): number;
  reset(): void;
  stats(): { buildings: number; faces: number; bodies: number; baked: number };
}

/** A round's hole on a wall by its munition (structureStages strikeHoleRadius / pierceHoleRadius, the same law). */
function holeFor(munition: MunitionClass, chargeKg: number, caliberMm: number): { radiusM: number; kind: WallStrikeKind } {
  const kinetic = munition === 'kinetic' || munition === 'autocannon_ap';
  if (kinetic) return { radiusM: Math.min(0.45, Math.max(0.22, 0.1 + 0.0024 * (caliberMm > 0 ? caliberMm : 105))), kind: 'kinetic' };
  const shaped = munition === 'atgm' || munition === 'heat' || munition === 'drone_fpv';
  if (!(chargeKg > 0)) return { radiusM: 0, kind: 'blast' };
  const r = munition === 'howitzer' || munition === 'missile' ? 1.5
    : munition === 'rocket' || munition === 'hesh' ? 1.2
      : munition === 'he' ? 0.55 + 0.25 * Math.min(2, Math.sqrt(chargeKg))
        : shaped ? 0.6 : munition === 'autocannon_he' ? 0.32 : 0.4;
  return { radiusM: chargeKg < 0.3 ? Math.min(r, 0.35) : r, kind: shaped ? 'shaped' : 'blast' };
}

/** A vertex layout: position and normal, then the named attributes (uv, color, …) as the bucket carries them. */
interface Layout { names: string[]; sizes: number[]; stride: number }

/** The face's triangles past its rectangle (a plinth's lip, an eave's board): they stand with it whatever its cells do. */
const STATIC_CELL = -1;

interface FaceGroup {
  material: THREE.Material;
  layout: Layout;
  /** Triangles by cell while the face is cut (body frame, layout stride a vertex); emptied once packed. */
  cells: Map<number, number[]>;
  /** Packed, by cell: the core's triangles (what stays when the skin spalls) and the skin's (centroid within the skin's
   *  depth, or proud of the face: render, brick face, sills, frames). */
  core: Map<number, Float32Array>;
  skin: Map<number, Float32Array>;
}

interface FaceDraw {
  seam: StructureDamageSeam;
  grid: FaceGrid;
  face: number;
  groups: Map<THREE.Material, FaceGroup>;
  meshes: THREE.Mesh[];
  core: FractureSlot;
  /** Each cell's depth through the wall to the proudest part it carries (m along the face's normal): its body's box. */
  depthMin: Float32Array;
  depthMax: Float32Array;
}

interface LiveBody {
  structureIdx: number;
  handle: number;
  meshes: THREE.Mesh[];
  massKg: number;
  material: string;
  still: number;
  age: number;
  sounds: number;
  pose: Float64Array;
  /** Its geometry per material, in the building's body frame (the copy its cells were packed in: no per-vertex work). */
  parts: Array<{ material: THREE.Material; geometry: THREE.BufferGeometry }>;
  /** From the body frame to its own (its box's) frame: a mesh's matrix is its pose times this. */
  fromBody: THREE.Matrix4;
}

interface Live {
  seam: StructureDamageSeam;
  wall: WallFracture;
  faces: Map<number, FaceDraw>;
  /** The roof's sag applied so far, per span: each vertex's drop (m), so a new sag moves it by the difference. */
  sag: Map<StructureSpan, Float32Array>;
  /** The roof's corners over the eaves (body frame, as they stood) and the gaps the sag last answered. */
  roofCorners: Array<{ span: StructureSpan; idx: Int32Array; xyz: Float32Array }> | null;
  sagSignature: string;
  /** Its standing faces went with a collapse: its queued drawing is dropped. */
  released: boolean;
  /** Faces being cut a slice at a time: their draw, their sorted triangles and how far the cut has come. */
  claiming: Map<number, { draw: FaceDraw; entry: { soups: Map<THREE.Material, { layout: Layout; soup: number[] }>; flat: Array<[StructureSpan, number]> } | null;
    materials: THREE.Material[]; m: number; tri: number }>;
  /** How far the sort by face has come (span, triangle) while it runs in slices. */
  sortAt: [number, number];
  sorting: Map<number, { soups: Map<THREE.Material, { layout: Layout; soup: number[] }>; flat: Array<[StructureSpan, number]> }> | null;
  /** The building's triangles sorted by face (sortByFace, at its first strike), each face's dropped once taken. */
  byFace: Map<number, { soups: Map<THREE.Material, { layout: Layout; soup: number[] }>; flat: Array<[StructureSpan, number]> }> | null;
  room: THREE.Mesh[];
  roomStoreys: Set<number>;
  baked: THREE.Mesh[];
  strikes: number;
}

const BAKE_STILL_S = 2.5;
const BAKE_AGE_S = 30;
const SOUND_GAP_S = 0.06;
const CAP_UV_DENSITY = 0.55;

function neutral(name: string): number {
  return name === 'color' || name === 'cotTint' || name === 'aTint' ? 1 : 0;
}

export function createStructureFracture(o: StructureFractureOptions): StructureFracture {
  const lives = new Map<number, Live>();
  const bodies = new Map<number, LiveBody>();
  const layouts = new WeakMap<THREE.BufferGeometry, Layout>();
  const bodiesPerStrike = Math.max(1, o.bodiesPerStrike ?? 10);
  const outcome = createWallStrikeOutcome();
  let lastSoundS = -1;
  let lastUpdateS = o.now();
  let bakedCount = 0;

  o.pool.onImpact((x, y, z, speed, mass, handle) => {
    const b = bodies.get(handle);
    if (!b) return;
    o.onLanding?.(x, y, z, speed, mass, b.structureIdx);
    const t = o.now();
    if (b.sounds >= 3 || t - lastSoundS < SOUND_GAP_S) return;
    b.sounds++;
    lastSoundS = t;
    emitCollapseImpact(x, y, z, speed, mass, b.material);
  });
  o.pool.onEvict((handle, final) => {
    const b = bodies.get(handle);
    if (!b) return;
    writePose(b, final);
    // the pool gave it up already: baked where it lies, nothing to release
    bake(b, false);
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

  // ---- body frame -------------------------------------------------------------------------------------------------
  /** world = R(yaw)·body + placement (three's rotateY: x' = x c + z s, z' = −x s + z c). */
  function toWorld(live: Live, bx: number, by: number, bz: number, out: THREE.Vector3): THREE.Vector3 {
    const { x, y, z, yaw } = live.seam.anatomy.placement;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return out.set(x + bx * c + bz * s, y + by, z - bx * s + bz * c);
  }
  function dirToWorld(live: Live, bx: number, bz: number, out: THREE.Vector3): THREE.Vector3 {
    const yaw = live.seam.anatomy.placement.yaw, c = Math.cos(yaw), s = Math.sin(yaw);
    return out.set(bx * c + bz * s, 0, -bx * s + bz * c);
  }

  // ---- a face taken out of the buckets and cut between its cells ---------------------------------------------------
  /** The face a body-frame triangle belongs to: the nearest plane it lies on (or proud of, a sill, a shutter), inside
   *  the face's span and storey; its normal breaks a tie at a corner. −1 for none. */
  function faceOfTriangle(wall: WallFracture, cx: number, cy: number, cz: number, nx: number, ny: number, nz: number): number {
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < wall.faces.length; i++) {
      const g = wall.faces[i];
      const dx = cx - g.origin[0], dy = cy - g.origin[1], dz = cz - g.origin[2];
      const v = dy;
      if (v < -0.06 || v > g.height + 0.06) continue;
      const along = dx * g.u[0] + dz * g.u[2];
      if (Math.abs(along) > g.width / 2 + 0.06) continue;
      const depth = dx * g.out[0] + dz * g.out[2];
      if (depth < -g.thickness - 0.15 || depth > 0.4) continue;
      const facing = nx * g.out[0] + ny * g.out[1] + nz * g.out[2];
      const score = Math.abs(depth > 0 ? depth : depth < -g.thickness ? -g.thickness - depth : 0) + Math.abs(depth) * 0.25 - 0.08 * Math.max(0, facing);
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return best;
  }

  /** Claim face `f`: every triangle of the building that is the face's, copied (body frame) and flattened in place. */
  /**
   * The building's triangles sorted by face, once (its first strike): each face's triangles copied in the body frame by
   * material, and where each lies in its bucket (to flatten it when its face is taken). A triangle no face owns (the
   * roof, a chimney, an interior) is left alone.
   */
  function sortByFace(live: Live): void { sortByFaceSlice(live, Infinity); }
  /** One slice of the sort, until done (true) or past `deadline` (performance.now ms). */
  function sortByFaceSlice(live: Live, deadline: number): boolean {
    if (live.byFace) return true;
    const byFace = live.sorting ?? (live.sorting = new Map());
    const seam = live.seam;
    const { x: px, y: py, z: pz, yaw } = seam.anatomy.placement;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (let si = live.sortAt[0]; si < seam.spans.length; si++, live.sortAt[1] = 0) {
      live.sortAt[0] = si;
      const span = seam.spans[si];
      const mesh = span.mesh as THREE.Mesh;
      const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
      if (!geometry?.getAttribute || span.count < 3) continue;
      const material = o.materialFor(seam, span.bucket);
      if (!material) continue;
      const layout = layoutOf(geometry);
      const arr = span.position.array as Float32Array;
      const nrm = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
      const attrs = layout.names.map((name) => (geometry.getAttribute(name) as THREE.BufferAttribute | undefined) ?? null);
      for (let t = live.sortAt[1]; t + 2 < span.count; t += 3) {
        // a slice ends between triangles once its time is spent
        if ((t & 255) === 0 && t > live.sortAt[1] && performance.now() >= deadline) { live.sortAt[1] = t; return false; }
        const i0 = span.first + t;
        // its centroid and normal in the body frame (the buckets stand at identity: world = the attribute)
        let cx = 0, cy = 0, cz = 0;
        for (let k = 0; k < 3; k++) { cx += arr[(i0 + k) * 3]; cy += arr[(i0 + k) * 3 + 1]; cz += arr[(i0 + k) * 3 + 2]; }
        cx /= 3; cy /= 3; cz /= 3;
        // a flattened triangle (a clamp, a fallen section) has no area: skip it
        const ax = arr[i0 * 3], ay = arr[i0 * 3 + 1], az = arr[i0 * 3 + 2];
        const ux = arr[(i0 + 1) * 3] - ax, uy = arr[(i0 + 1) * 3 + 1] - ay, uz = arr[(i0 + 1) * 3 + 2] - az;
        const vx = arr[(i0 + 2) * 3] - ax, vy = arr[(i0 + 2) * 3 + 1] - ay, vz = arr[(i0 + 2) * 3 + 2] - az;
        const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
        const area2 = Math.hypot(fx, fy, fz);
        if (!(area2 > 1e-9)) continue;
        const wx = cx - px, wz = cz - pz;
        const bx = wx * c - wz * s, by = cy - py, bz = wx * s + wz * c;
        const bnx = (fx * c - fz * s) / area2, bny = fy / area2, bnz = (fx * s + fz * c) / area2;
        const f = faceOfTriangle(live.wall, bx, by, bz, bnx, bny, bnz);
        if (f < 0) continue;
        let entry = byFace.get(f);
        if (!entry) { entry = { soups: new Map(), flat: [] }; byFace.set(f, entry); }
        let g = entry.soups.get(material);
        if (!g) { g = { layout, soup: [] }; entry.soups.set(material, g); }
        const soup = g.soup;
        for (let k = 0; k < 3; k++) {
          const at = i0 + k;
          const vxw = arr[at * 3] - px, vzw = arr[at * 3 + 2] - pz;
          soup.push(vxw * c - vzw * s, arr[at * 3 + 1] - py, vxw * s + vzw * c);
          let nx = bnx, ny = bny, nz = bnz;
          if (nrm) { const wnx = nrm.getX(at), wnz = nrm.getZ(at); nx = wnx * c - wnz * s; ny = nrm.getY(at); nz = wnx * s + wnz * c; }
          soup.push(nx, ny, nz);
          for (let a = 0; a < attrs.length; a++) {
            const attr = attrs[a], size = layout.sizes[a];
            for (let j = 0; j < size; j++) soup.push(attr && j < attr.itemSize ? attr.getComponent(at, j) : neutral(layout.names[a]));
          }
        }
        entry.flat.push([span, i0]);
      }
    }
    live.byFace = byFace;
    live.sorting = null;
    return true;
  }

  /** Take face `f`: its triangles flattened in their buckets (kept for the reset) and drawn again from its cells. */
  function claimFace(live: Live, f: number): FaceDraw {
    sortByFace(live);
    claimFaceSlice(live, f, Infinity);
    return live.faces.get(f)!;
  }
  /** Triangles a slice of a face's cut takes between its budget checks. */
  const CUT_SLICE = 160;
  /**
   * One slice of taking face `f` (true when it is taken): its triangles cut between its cells a slice at a time; once
   * whole, flattened in their buckets (kept for the reset) and the face drawn from its cells — the swap in one frame.
   */
  function claimFaceSlice(live: Live, f: number, deadline: number): boolean {
    if (live.faces.has(f)) return true;
    let job = live.claiming.get(f);
    if (!job) {
      const grid = live.wall.faces[f];
      const face = live.seam.anatomy.storeys[grid.storey].faces[grid.faceIndex];
      const core = face.layers.find((l) => l.material !== 'plaster' && l.material !== 'glass') ?? face.layers[face.layers.length - 1]
        ?? { material: grid.material, bucket: face.bucket, tint: [1, 1, 1], thicknessM: grid.thickness, share: 1 };
      const draw: FaceDraw = { seam: live.seam, grid, face: f, groups: new Map(), meshes: [], core,
        depthMin: new Float32Array(grid.state.length).fill(-grid.thickness), depthMax: new Float32Array(grid.state.length) };
      const entry = live.byFace!.get(f) ?? null;
      job = { draw, entry, materials: entry ? [...entry.soups.keys()] : [], m: 0, tri: 0 };
      live.claiming.set(f, job);
    }
    const { draw, entry } = job;
    const grid = draw.grid;
    while (entry && job.m < job.materials.length) {
      const material = job.materials[job.m];
      const { layout, soup } = entry.soups.get(material)!;
      let g = draw.groups.get(material);
      if (!g) { g = { material, layout, cells: new Map(), core: new Map(), skin: new Map() }; draw.groups.set(material, g); }
      const tris = soup.length / (3 * layout.stride);
      while (job.tri < tris) {
        const to = Math.min(tris, job.tri + CUT_SLICE);
        cutIntoCells(grid, soup, layout.stride, g.cells, job.tri, to);
        job.tri = to;
        if (job.tri < tris && performance.now() >= deadline) return false;
      }
      packGroup(draw, g);
      job.m++;
      job.tri = 0;
      if (job.m < job.materials.length && performance.now() >= deadline) return false;
    }
    // whole: out of the buckets (flattened onto its first corner, back at the reset) and into the world drawn as cells
    if (entry) {
      const touchedSpans = new Set<StructureSpan>();
      for (const [span, i0] of entry.flat) {
        if (!touchedSpans.has(span)) { o.keepSpan(span); touchedSpans.add(span); }
        const arr = span.position.array as Float32Array;
        const ax = arr[i0 * 3], ay = arr[i0 * 3 + 1], az = arr[i0 * 3 + 2];
        for (let k = 1; k < 3; k++) { arr[(i0 + k) * 3] = ax; arr[(i0 + k) * 3 + 1] = ay; arr[(i0 + k) * 3 + 2] = az; }
      }
      for (const span of touchedSpans) { span.position.addUpdateRange(span.first * 3, span.count * 3); span.position.needsUpdate = true; }
      live.byFace!.delete(f);
    }
    live.claiming.delete(f);
    live.faces.set(f, draw);
    // drawn at once (a face out of its bucket must stand in the same frame)
    redraw(live, draw);
    return true;
  }

  // ---- cutting a soup between a face's cells ------------------------------------------------------------------------
  type Poly = Float64Array[];
  function clip(poly: Poly, nx: number, ny: number, nz: number, d: number, front: Poly, back: Poly): void {
    front.length = 0; back.length = 0;
    const count = poly.length, stride = poly[0].length;
    for (let i = 0; i < count; i++) {
      const a = poly[i], b = poly[(i + 1) % count];
      const sa = nx * a[0] + ny * a[1] + nz * a[2] - d, sb = nx * b[0] + ny * b[1] + nz * b[2] - d;
      if (sa >= 0) front.push(a); else back.push(a);
      if ((sa >= 0) !== (sb >= 0)) {
        const t = sa / (sa - sb);
        const v = new Float64Array(stride);
        for (let k = 0; k < stride; k++) v[k] = a[k] + (b[k] - a[k]) * t;
        const l = Math.hypot(v[3], v[4], v[5]) || 1;
        v[3] /= l; v[4] /= l; v[5] /= l;
        front.push(v); back.push(v);
      }
    }
  }
  function emitPoly(list: number[], poly: Poly): void {
    const a = poly[0];
    for (let i = 1; i + 1 < poly.length; i++) {
      for (const v of [a, poly[i], poly[i + 1]]) for (let k = 0; k < v.length; k++) list.push(v[k]);
    }
  }
  function cutIntoCells(grid: FaceGrid, soup: number[], stride: number, cells: Map<number, number[]>, from = 0, to = Infinity): void {
    const rows = grid.rowY.length - 1;
    const oy = grid.origin[1];
    const ux = grid.u[0], uz = grid.u[2];
    const ou = grid.origin[0] * ux + grid.origin[2] * uz;
    const front: Poly = [], back: Poly = [];
    const tris = Math.min(to, soup.length / (3 * stride));
    const listOf = (cell: number): number[] => {
      let list = cells.get(cell);
      if (!list) { list = []; cells.set(cell, list); }
      return list;
    };
    const keep = (poly: Poly | null): void => { if (poly) emitPoly(listOf(STATIC_CELL), poly); };
    /** The part of `poly` on the near side of a plane (back: n·p < d); what lies past it stays with the face (static). */
    const within = (poly: Poly | null, nx: number, ny: number, nz: number, d: number): Poly | null => {
      if (!poly) return null;
      clip(poly, nx, ny, nz, d, front, back);
      if (front.length >= 3) keep(front.slice());
      return back.length >= 3 ? back.slice() : null;
    };
    const half = grid.width / 2;
    const y0Face = oy + grid.rowY[0], y1Face = oy + grid.rowY[rows];
    /** The row a height falls in (clamped inside the face). */
    const rowOf = (y: number): number => {
      let r = 0;
      while (r < rows - 1 && y > oy + grid.rowY[r + 1]) r++;
      return r;
    };
    /** The cell of row `r` a face coordinate u falls in (clamped). */
    const cellOf = (r: number, u: number): number => {
      let c = grid.rowStart[r];
      while (c < grid.rowStart[r + 1] - 1 && u > grid.cellU[2 * c + 1]) c++;
      return c;
    };
    for (let t = from; t < tris; t++) {
      const base = t * 3 * stride;
      // the triangle's extent on the face (height, and u along it)
      let yMin = Infinity, yMax = -Infinity, uMin = Infinity, uMax = -Infinity;
      for (let k = 0; k < 3; k++) {
        const at = base + k * stride;
        const y = soup[at + 1], u = soup[at] * ux + soup[at + 2] * uz - ou;
        if (y < yMin) yMin = y; if (y > yMax) yMax = y;
        if (u < uMin) uMin = u; if (u > uMax) uMax = u;
      }
      const eps = 1e-5;
      const inside = yMin >= y0Face - eps && yMax <= y1Face + eps && uMin >= -half - eps && uMax <= half + eps;
      // the fast path: a triangle inside one cell (most of a building's detail) goes to it whole, nothing cut
      if (inside) {
        const r = rowOf((yMin + yMax) / 2);
        if (yMin >= oy + grid.rowY[r] - eps && yMax <= oy + grid.rowY[r + 1] + eps) {
          const c = cellOf(r, (uMin + uMax) / 2);
          if (uMin >= grid.cellU[2 * c] - eps && uMax <= grid.cellU[2 * c + 1] + eps) {
            const list = listOf(c);
            for (let i = 0; i < 3 * stride; i++) list.push(soup[base + i]);
            continue;
          }
        }
      }
      const poly0: Poly = [0, 1, 2].map((k) => Float64Array.from(soup.slice(base + k * stride, base + (k + 1) * stride)));
      // the face's own rectangle: what reaches past its foot, its head or its ends (a plinth's lip, an eave's board, a
      // corner's trim) stays standing with the face, never with a cell
      let poly: Poly | null = poly0;
      if (!inside) {
        poly = within(poly, 0, -1, 0, -y0Face);
        poly = within(poly, 0, 1, 0, y1Face);
        poly = within(poly, ux, 0, uz, ou + half);
        poly = within(poly, -ux, 0, -uz, -(ou - half));
        if (!poly) continue;
      }
      // rows the polygon spans, from its lowest: peel each row off (what is under its top is that row's)
      let rest: Poly | null = poly;
      const r1 = rowOf(Math.min(y1Face, yMax));
      for (let r = rowOf(Math.max(y0Face, yMin)); r <= r1 && rest; r++) {
        const top = oy + grid.rowY[r + 1];
        let inRow: Poly | null;
        if (r === r1) { inRow = rest; rest = null; }
        else {
          clip(rest, 0, 1, 0, top, front, back);
          inRow = back.length >= 3 ? back.slice() : null;
          rest = front.length >= 3 ? front.slice() : null;
        }
        if (!inRow) continue;
        // the cells it spans along u, from its leftmost: peel each cell off
        let restU: Poly | null = inRow;
        const c1 = cellOf(r, Math.min(half, uMax));
        for (let cIdx = cellOf(r, Math.max(-half, uMin)); cIdx <= c1 && restU; cIdx++) {
          let inCell: Poly | null;
          if (cIdx === c1) { inCell = restU; restU = null; }
          else {
            clip(restU, ux, 0, uz, ou + grid.cellU[2 * cIdx + 1], front, back);
            inCell = back.length >= 3 ? back.slice() : null;
            restU = front.length >= 3 ? front.slice() : null;
          }
          if (inCell) emitPoly(listOf(cIdx), inCell);
        }
      }
    }
  }

  // ---- what stands: one mesh a material, the reveals and recesses ---------------------------------------------------
  const rect: [number, number, number, number] = [0, 0, 0, 0];
  const nb: [number, number, number, number] = [0, 0, 0, 0];
  const standingState = (state: number): boolean => state <= CELL_SPALLED;
  /** A cap quad (body frame corners, its outward normal) into a material's list in its layout, tinted. */
  function pushQuad(list: number[], layout: Layout, a: number[], b: number[], cc: number[], d: number[], n: number[],
    tint: readonly number[], shade: number): void {
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    const uvOf = (p: number[]): [number, number] => (ax >= ay && ax >= az ? [p[2] * CAP_UV_DENSITY, p[1] * CAP_UV_DENSITY]
      : ay >= az ? [p[0] * CAP_UV_DENSITY, p[2] * CAP_UV_DENSITY] : [p[0] * CAP_UV_DENSITY, p[1] * CAP_UV_DENSITY]);
    const vert = (p: number[]): void => {
      list.push(p[0], p[1], p[2], n[0], n[1], n[2]);
      for (let i = 0; i < layout.names.length; i++) {
        const name = layout.names[i], size = layout.sizes[i];
        if (name === 'uv') { const uv = uvOf(p); list.push(uv[0], uv[1]); for (let j = 2; j < size; j++) list.push(0); }
        else if (name === 'color') { list.push(tint[0] * shade, tint[1] * shade, tint[2] * shade); for (let j = 3; j < size; j++) list.push(1); }
        else for (let j = 0; j < size; j++) list.push(neutral(name));
      }
    };
    const tri = (p: number[], q: number[], r: number[]): void => {
      const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], wx = r[0] - p[0], wy = r[1] - p[1], wz = r[2] - p[2];
      const facing = (uy * wz - uz * wy) * n[0] + (uz * wx - ux * wz) * n[1] + (ux * wy - uy * wx) * n[2] >= 0;
      if (facing) { vert(p); vert(q); vert(r); } else { vert(p); vert(r); vert(q); }
    };
    tri(a, b, cc);
    tri(a, cc, d);
  }
  /** A face point (u along it, v over the storey floor, depth along its outward normal) in the body frame. */
  function facePoint(g: FaceGrid, u: number, v: number, depth: number): number[] {
    return [g.origin[0] + g.u[0] * u + g.out[0] * depth, g.origin[1] + v, g.origin[2] + g.u[2] * u + g.out[2] * depth];
  }
  function capGroup(draw: FaceDraw): FaceGroup | null {
    const material = o.materialFor(draw.seam, draw.core.bucket);
    if (material) {
      let g = draw.groups.get(material);
      if (!g) {
        g = { material, layout: { names: ['uv', 'color'], sizes: [2, 3], stride: 11 }, cells: new Map(), core: new Map(), skin: new Map() };
        draw.groups.set(material, g);
      }
      return g;
    }
    return draw.groups.values().next().value ?? null;
  }
  /** Whether the neighbour cells over [u0, u1] in row `r` are gone (or fallen); a face's edge is no neighbour. */
  function openSpans(g: FaceGrid, r: number, u0: number, u1: number, out: number[]): void {
    out.length = 0;
    if (r < 0 || r >= g.rowY.length - 1) return;
    for (let c = g.rowStart[r]; c < g.rowStart[r + 1]; c++) {
      const a = Math.max(u0, g.cellU[2 * c]), b = Math.min(u1, g.cellU[2 * c + 1]);
      if (b - a < 1e-4) continue;
      const st = g.state[c];
      if (st === CELL_GONE || st === CELL_FALLEN) out.push(a, b);
    }
  }
  const _spans: number[] = [];
  /** How far a cracked cell stands out of its face (m: mostly out, a few pushed back), from the cell's own hash. */
  function looseOf(g: FaceGrid, cell: number): number {
    const h = (Math.imul(cell + 1, 0x9e3779b1) ^ Math.imul(Math.round(g.origin[0] * 100) + g.storey * 131, 0x85ebca6b)) >>> 0;
    return ((h % 1000) / 1000) * 0.045 - 0.012;
  }
  /** Rebuild a face's standing meshes from its cells. */
  /** A face group's cut triangles packed by cell into its core and its skin (typed: a redraw copies them whole), and each
   *  cell's depth bounds widened to what it carries. */
  function packGroup(draw: FaceDraw, fg: FaceGroup): void {
    const g = draw.grid, stride = fg.layout.stride;
    for (const [cell, list] of fg.cells) {
      if (cell === STATIC_CELL) { fg.core.set(cell, Float32Array.from(list)); continue; }
      let skinN = 0;
      const isSkin = new Uint8Array(list.length / (stride * 3));
      for (let t = 0, i = 0; i < list.length; t++, i += stride * 3) {
        let depth = 0;
        for (let k = 0; k < 3; k++) {
          const at = i + k * stride;
          const d = (list[at] - g.origin[0]) * g.out[0] + (list[at + 2] - g.origin[2]) * g.out[2];
          depth += d;
          if (d < draw.depthMin[cell]) draw.depthMin[cell] = d;
          if (d > draw.depthMax[cell]) draw.depthMax[cell] = d;
        }
        if (depth / 3 > -g.skinM) { isSkin[t] = 1; skinN++; }
      }
      const tri = stride * 3;
      const core = new Float32Array((isSkin.length - skinN) * tri), skin = new Float32Array(skinN * tri);
      for (let t = 0, c = 0, k = 0; t < isSkin.length; t++) {
        const from = t * tri;
        if (isSkin[t]) { for (let j = 0; j < tri; j++) skin[k * tri + j] = list[from + j]; k++; }
        else { for (let j = 0; j < tri; j++) core[c * tri + j] = list[from + j]; c++; }
      }
      if (core.length) fg.core.set(cell, core);
      if (skin.length) fg.skin.set(cell, skin);
    }
    fg.cells.clear();
  }

  /** Rebuild a face's standing meshes from its packed cells (typed copies; the per-vertex work only where a cell sags or
   *  stands loose). */
  function redraw(live: Live, draw: FaceDraw): void {
    for (const mesh of draw.meshes) { o.group.remove(mesh); mesh.geometry.dispose(); }
    draw.meshes.length = 0;
    const g = draw.grid;
    const rows = g.rowY.length - 1;
    // the reveals and recesses in the wall's core (small: a few quads a broken edge)
    const caps: number[] = [];
    const cg = capGroup(draw);
    if (cg) {
      const tint = draw.core.tint;
      const T = g.thickness;
      for (let r = 0; r < rows; r++) {
        for (let c = g.rowStart[r]; c < g.rowStart[r + 1]; c++) {
          const st = g.state[c];
          if (!standingState(st)) continue;
          cellRect(g, c, rect);
          const [u0, u1, y0, y1] = rect;
          const sag = g.sag[c];
          const front = st === CELL_SPALLED ? -g.skinM : 0;
          if (st === CELL_SPALLED) {
            // the recess: the core a skin's depth back, a shade darker
            pushQuad(caps, cg.layout, facePoint(g, u0, y0 - sag, front), facePoint(g, u1, y0 - sag, front), facePoint(g, u1, y1 - sag, front),
              facePoint(g, u0, y1 - sag, front), [g.out[0], 0, g.out[2]], tint, 0.82);
          }
          // the reveal on each side that opens onto a gone or fallen cell (an opening has its own)
          const side = (pa: number[], pb: number[], n: number[], shade: number): void => {
            pushQuad(caps, cg.layout, pa, pb, [pb[0] - g.out[0] * (T + front), pb[1], pb[2] - g.out[2] * (T + front)],
              [pa[0] - g.out[0] * (T + front), pa[1], pa[2] - g.out[2] * (T + front)], n, tint, shade);
          };
          const goneState = (state: number): boolean => state === CELL_GONE || state === CELL_FALLEN;
          if (c > g.rowStart[r] && goneState(g.state[c - 1])) side(facePoint(g, u0, y0 - sag, front), facePoint(g, u0, y1 - sag, front), [-g.u[0], 0, -g.u[2]], 0.7);
          if (c + 1 < g.rowStart[r + 1] && goneState(g.state[c + 1])) side(facePoint(g, u1, y1 - sag, front), facePoint(g, u1, y0 - sag, front), [g.u[0], 0, g.u[2]], 0.7);
          openSpans(g, r + 1, u0, u1, _spans);
          for (let k = 0; k < _spans.length; k += 2) side(facePoint(g, _spans[k + 1], y1 - sag, front), facePoint(g, _spans[k], y1 - sag, front), [0, 1, 0], 0.85);
          openSpans(g, r - 1, u0, u1, _spans);
          for (let k = 0; k < _spans.length; k += 2) side(facePoint(g, _spans[k], y0 - sag, front), facePoint(g, _spans[k + 1], y0 - sag, front), [0, -1, 0], 0.55);
        }
      }
    }
    for (const fg of draw.groups.values()) {
      const stride = fg.layout.stride;
      // what stands: a standing cell's core, its skin unless spalled; an opening's frame while its jambs stand
      let total = fg === cg ? caps.length : 0;
      for (const [cell, arr] of fg.core) if (cell === STATIC_CELL || drawnCore(g.state[cell])) total += arr.length;
      for (const [cell, arr] of fg.skin) if (drawnSkin(g.state[cell])) total += arr.length;
      if (!total) continue;
      const buf = new Float32Array(total);
      let at = 0;
      const put = (cell: number, arr: Float32Array): void => {
        buf.set(arr, at);
        if (cell !== STATIC_CELL) {
          const sag = g.sag[cell], loose = g.state[cell] === CELL_CRACKED ? looseOf(g, cell) : 0;
          if (sag > 0 || loose !== 0) {
            for (let i = at; i < at + arr.length; i += stride) {
              buf[i + 1] -= sag;
              buf[i] += g.out[0] * loose; buf[i + 2] += g.out[2] * loose;
            }
          }
        }
        at += arr.length;
      };
      for (const [cell, arr] of fg.core) if (cell === STATIC_CELL || drawnCore(g.state[cell])) put(cell, arr);
      for (const [cell, arr] of fg.skin) if (drawnSkin(g.state[cell])) put(cell, arr);
      if (fg === cg) for (let i = 0; i < caps.length; i++) buf[at + i] = caps[i];
      const mesh = new THREE.Mesh(interleavedOf(fg.layout, buf, faceSphere(g)), fg.material);
      mesh.matrixAutoUpdate = false;
      bodyToWorld(live, mesh.matrix);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.structureFractureFace = true;
      o.group.add(mesh);
      draw.meshes.push(mesh);
    }
    live.seam.touchShadows();
  }
  const drawnCore = (state: number): boolean => state <= CELL_SPALLED || state === CELL_OPENING;
  const drawnSkin = (state: number): boolean => state < CELL_SPALLED || state === CELL_OPENING;

  /** A packed list as a geometry with no copy: its stride as one interleaved buffer, the attributes at their offsets
   *  (the building's body frame; the mesh's matrix carries it to the world). */
  function interleavedOf(layout: Layout, list: Float32Array, sphere: THREE.Sphere | null = null): THREE.BufferGeometry {
    const buffer = new THREE.InterleavedBuffer(list, layout.stride);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(buffer, 3, 0));
    geometry.setAttribute('normal', new THREE.InterleavedBufferAttribute(buffer, 3, 3));
    let offset = 6;
    layout.names.forEach((name, a) => { geometry.setAttribute(name, new THREE.InterleavedBufferAttribute(buffer, layout.sizes[a], offset)); offset += layout.sizes[a]; });
    // the culling sphere from what the caller knows (a face's rectangle, a body's box): a pass over every corner of an
    // interleaved buffer was a strike's slowest step
    if (sphere) geometry.boundingSphere = sphere; else geometry.computeBoundingSphere();
    return geometry;
  }
  /** A face's culling sphere in the body frame: its rectangle, the wall behind it and a margin for what stands proud. */
  function faceSphere(g: FaceGrid): THREE.Sphere {
    const c = facePoint(g, 0, g.height / 2, -g.thickness / 2);
    return new THREE.Sphere(new THREE.Vector3(c[0], c[1], c[2]), Math.hypot(g.width / 2, g.height / 2, g.thickness) + 0.6);
  }
  /** The building's body frame to the world (its placement: rotateY(yaw), then the translation). */
  function bodyToWorld(live: Live, out: THREE.Matrix4): THREE.Matrix4 {
    const { x, y, z, yaw } = live.seam.anatomy.placement;
    return out.compose(_v.set(x, y, z), _q.setFromAxisAngle(_up, yaw), _s);
  }

  // ---- the room behind a holed storey -------------------------------------------------------------------------------
  function roomFor(live: Live, storey: number, draw: FaceDraw): void {
    if (live.roomStoreys.has(storey)) return;
    live.roomStoreys.add(storey);
    const a = live.seam.anatomy;
    const st = a.storeys[storey];
    const cg = capGroup(draw);
    if (!cg) return;
    const roomLayout: Layout = { names: ['uv', 'color'], sizes: [2, 3], stride: 11 };
    const layout = o.roomMaterial ? roomLayout : cg.layout;
    const material = o.roomMaterial ?? cg.material;
    const t = draw.grid.thickness + 0.04;
    const hw = a.w / 2 - t, hd = a.d / 2 - t;
    if (!(hw > 0.3 && hd > 0.3)) return;
    const y0 = st.y0 + 0.02, y1 = st.y1 - 0.02;
    const col = a.interior.color;
    const list: number[] = [];
    // inward-facing walls, floor and ceiling of the storey's room
    const q = (p0: number[], p1: number[], p2: number[], p3: number[], n: number[], shade: number) =>
      pushQuad(list, layout, p0, p1, p2, p3, n, col, shade);
    q([-hw, y0, hd], [hw, y0, hd], [hw, y1, hd], [-hw, y1, hd], [0, 0, -1], 1);
    q([-hw, y0, -hd], [hw, y0, -hd], [hw, y1, -hd], [-hw, y1, -hd], [0, 0, 1], 1);
    q([hw, y0, -hd], [hw, y0, hd], [hw, y1, hd], [hw, y1, -hd], [-1, 0, 0], 0.9);
    q([-hw, y0, -hd], [-hw, y0, hd], [-hw, y1, hd], [-hw, y1, -hd], [1, 0, 0], 0.9);
    q([-hw, y0, -hd], [hw, y0, -hd], [hw, y0, hd], [-hw, y0, hd], [0, 1, 0], 1.3);
    q([-hw, y1, -hd], [hw, y1, -hd], [hw, y1, hd], [-hw, y1, hd], [0, -1, 0], 0.7);
    const mesh = new THREE.Mesh(interleavedOf(layout, Float32Array.from(list)), material);
    mesh.matrixAutoUpdate = false;
    bodyToWorld(live, mesh.matrix);
    mesh.receiveShadow = true;
    o.group.add(mesh);
    live.room.push(mesh);
  }

  // ---- the roof sags over a wall that went from under it (S2) --------------------------------------------------------
  /**
   * Where the top storey's walls lost their top courses, the roof over them has lost its bearing: it sags there, most
   * at the eave over the middle of the gap and nothing at the ridge (its rafters pivot there), as far as the gap is wide
   * (a metre and a half lets it down a few centimetres, three metres or more a good half metre). The building's roof
   * triangles move in the buckets (kept for the reset), by the difference from what they sagged before.
   */
  function sagRoof(live: Live): void {
    const a = live.seam.anatomy;
    const roof = a.roof;
    if (!roof || !a.storeys.length) return;
    const top = a.storeys.length - 1;
    // each top-storey face's gaps along its top row: [face index, u0, u1] in its own frame
    const gaps: Array<[FaceGrid, number, number]> = [];
    live.wall.faces.forEach((g) => {
      if (g.storey !== top) return;
      const r = g.rowY.length - 2;
      let run0 = NaN;
      for (let c = g.rowStart[r]; c <= g.rowStart[r + 1]; c++) {
        const gone = c < g.rowStart[r + 1] && (g.state[c] === CELL_GONE || g.state[c] === CELL_FALLEN);
        if (gone && Number.isNaN(run0)) run0 = g.cellU[2 * c];
        if (!gone && !Number.isNaN(run0)) {
          const run1 = g.cellU[2 * (c - 1) + 1];
          if (run1 - run0 >= 1.2) gaps.push([g, run0, run1]);
          run0 = NaN;
        }
      }
    });
    if (!gaps.length && !live.sag.size) return;
    const { x: px, y: py, z: pz, yaw } = a.placement;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const eave = roof.eaveY, rise = Math.max(0.3, roof.ridgeY - roof.eaveY);
    // the sag a body-frame point takes from every gap (the deepest wins)
    const sagAt = (bx: number, by: number, bz: number): number => {
      if (by < eave - 0.15) return 0;
      let drop = 0;
      for (const [g, u0, u1] of gaps) {
        const dx = bx - g.origin[0], dz = bz - g.origin[2];
        const along = dx * g.u[0] + dz * g.u[2];
        const inward = -(dx * g.out[0] + dz * g.out[2]); // from the face's plane into the building
        if (along <= u0 || along >= u1 || inward < -1.2) continue;
        const span = u1 - u0, t = (along - u0) / span;
        const depth = Math.min(0.6, 0.06 * span * span);
        // over the face: full at the eave line, nothing at the ridge (by height up the roof)
        const toRidge = Math.max(0, Math.min(1, 1 - (by - eave) / rise));
        drop = Math.max(drop, depth * 4 * t * (1 - t) * toRidge * (inward < 0 ? 1 + inward / 1.2 : 1));
      }
      return drop;
    };
    // the gaps as they stand: nothing to do when they are what they were at the last strike
    const signature = gaps.map(([g, u0, u1]) => `${live.wall.faces.indexOf(g)}:${u0.toFixed(2)}:${u1.toFixed(2)}`).join('|');
    if (signature === live.sagSignature) return;
    live.sagSignature = signature;
    // the roof's corners over the eaves (body frame, as they stood), gathered once a building
    if (!live.roofCorners) {
      live.roofCorners = [];
      for (const span of live.seam.spans) {
        if (span.partClass !== 'roof' && span.partClass !== 'trim') continue;
        const arr = span.position.array as Float32Array;
        const idx: number[] = [], xyz: number[] = [];
        for (let k = 0; k < span.count; k++) {
          const i = span.first + k;
          const by = arr[i * 3 + 1] - py;
          if (by < eave - 0.15) continue;
          const wx = arr[i * 3] - px, wz = arr[i * 3 + 2] - pz;
          idx.push(k); xyz.push(wx * c - wz * s, by, wx * s + wz * c);
        }
        if (idx.length) live.roofCorners.push({ span, idx: Int32Array.from(idx), xyz: Float32Array.from(xyz) });
      }
    }
    let changed = false;
    for (const { span, idx, xyz } of live.roofCorners) {
      const arr = span.position.array as Float32Array;
      let applied = live.sag.get(span);
      let moved = false;
      for (let n = 0; n < idx.length; n++) {
        const k = idx[n];
        const before = applied ? applied[k] : 0;
        const drop = sagAt(xyz[n * 3], xyz[n * 3 + 1], xyz[n * 3 + 2]);
        if (Math.abs(drop - before) < 1e-4) continue;
        if (!applied) { o.keepSpan(span); applied = new Float32Array(span.count); live.sag.set(span, applied); }
        arr[(span.first + k) * 3 + 1] -= drop - before;
        applied[k] = drop;
        moved = true;
      }
      if (moved) { span.position.addUpdateRange(span.first * 3, span.count * 3); span.position.needsUpdate = true; changed = true; }
    }
    if (changed) live.seam.touchShadows();
  }

  // ---- bodies --------------------------------------------------------------------------------------------------------
  const _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1), _v = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _basis = new THREE.Matrix4();
  /**
   * A body of cells (face, cell pairs; every cell of one face stack, so one face frame): its triangles and its caps in
   * its own frame, its box parts, spawned with the given velocity (world, m/s) and spin.
   */
  function spawnCells(live: Live, cells: number[], vx: number, vy: number, vz: number, spin: number, seed: number): boolean {
    if (!cells.length) return false;
    const g0 = live.wall.faces[cells[0]];
    // the body's frame: the cells' centre, axes along the face (u, up, out)
    let cu = 0, cv = 0, n = 0, mass = 0;
    // every cell in g0's face frame: an upper storey's face may stand out over the one below (a jetty) or off its centre
    const rects: Array<[number, number, number, number, FaceGrid, number, number]> = [];
    for (let i = 0; i < cells.length; i += 2) {
      const g = live.wall.faces[cells[i]];
      cellRect(g, cells[i + 1], nb);
      const ox = g.origin[0] - g0.origin[0], oz = g.origin[2] - g0.origin[2];
      const du = ox * g0.u[0] + oz * g0.u[2], dd = ox * g0.out[0] + oz * g0.out[2];
      const v0 = nb[2] + g.origin[1] - g0.origin[1], v1 = nb[3] + g.origin[1] - g0.origin[1];
      rects.push([nb[0] + du, nb[1] + du, v0, v1, g, cells[i + 1], dd]);
      const area = (nb[1] - nb[0]) * (v1 - v0);
      cu += ((nb[0] + nb[1]) / 2 + du) * area; cv += (v0 + v1) / 2 * area; n += area;
      mass += area * g.thickness * densityOf(g.material);
    }
    cu /= n; cv /= n;
    const T = g0.thickness;
    const centre = facePoint(g0, cu, cv, -T / 2);
    _basis.makeBasis(new THREE.Vector3(g0.u[0], 0, g0.u[2]), new THREE.Vector3(0, 1, 0), new THREE.Vector3(g0.out[0], 0, g0.out[2]));
    const qBody = new THREE.Quaternion().setFromRotationMatrix(_basis);
    // parts: each cell a box (its rect; through the wall from its inner face to the proudest part it carries — a sill, a
    // shutter, a frame — so what it draws never sinks past what it stands on), in the body's frame
    // each cell's depth through the wall to the proudest part it carries (a sill, a shutter, a frame), packed at its cut
    const depthOf = (g: FaceGrid, cell: number): [number, number] => {
      const draw = live.faces.get(live.wall.faces.indexOf(g));
      return draw ? [draw.depthMin[cell], draw.depthMax[cell]] : [-g.thickness, 0];
    };
    // the body's parts: a box a run of cells along one row of one face (merged edge to edge), through the wall to what
    // its cells carry, so what it draws never sinks past what it stands on
    const runs: Array<{ g: FaceGrid; v0: number; v1: number; u0: number; u1: number; d0: number; d1: number; dd: number; mass: number }> = [];
    const byRow = rects.slice().sort((p, q) => (p[2] - q[2]) || (p[0] - q[0]));
    for (const [u0, u1, v0, v1, g, cell, dd] of byRow) {
      const [d0, d1] = depthOf(g, cell);
      const mass = Math.max(1, (u1 - u0) * (v1 - v0) * g.thickness * densityOf(g.material));
      const last = runs[runs.length - 1];
      if (last && last.g === g && Math.abs(last.v0 - v0) < 1e-4 && Math.abs(last.u1 - u0) < 1e-3) {
        last.u1 = u1; last.d0 = Math.min(last.d0, d0); last.d1 = Math.max(last.d1, d1); last.mass += mass;
      } else runs.push({ g, v0, v1, u0, u1, d0, d1, dd, mass });
    }
    // runs stacked edge to edge with the same span along the face become one box
    for (let i = 0; i < runs.length; i++) {
      for (let j = i + 1; j < runs.length; j++) {
        const a = runs[i], b = runs[j];
        if (a.g !== b.g || Math.abs(a.u0 - b.u0) > 1e-3 || Math.abs(a.u1 - b.u1) > 1e-3 || Math.abs(a.v1 - b.v0) > 1e-3) continue;
        a.v1 = b.v1; a.d0 = Math.min(a.d0, b.d0); a.d1 = Math.max(a.d1, b.d1); a.mass += b.mass;
        runs.splice(j, 1);
        j = i;
      }
    }
    const parts: RigidPartSpec[] = runs.map((run) => ({
      kind: 'box' as const,
      center: [(run.u0 + run.u1) / 2 - cu, (run.v0 + run.v1) / 2 - cv, (run.d0 + run.d1) / 2 + run.dd + T / 2] as [number, number, number],
      half: [Math.max(0.04, (run.u1 - run.u0) / 2), Math.max(0.04, (run.v1 - run.v0) / 2), Math.max(0.04, (run.d1 - run.d0) / 2)] as [number, number, number],
      mass: run.mass,
    }));
    const shape = createRigidShape(parts.slice(0, 24), { restitution: 0.12, friction: 0.75, maxSpheres: Math.min(48, 16 + parts.length * 4) });
    // the body's culling sphere (body frame, round its centre): the farthest corner of its parts, and a margin
    let bodyRadius = 0.3;
    for (const part of parts) {
      if (part.kind !== 'box') continue;
      bodyRadius = Math.max(bodyRadius, Math.hypot(Math.abs(part.center[0]) + part.half[0], Math.abs(part.center[1]) + part.half[1],
        Math.abs(part.center[2]) + part.half[2]) + 0.1);
    }
    // geometry: each cell's triangles, its caps on every side and its back
    // each material's packed cell arrays (copied whole below) and its caps
    const byMaterial = new Map<THREE.Material, { layout: Layout; arrays: Float32Array[]; list: number[] }>();
    for (const [su0, su1, v0, v1, g, cell] of rects) {
      const draw = live.faces.get(live.wall.faces.indexOf(g));
      const shift = (g.origin[0] - g0.origin[0]) * g0.u[0] + (g.origin[2] - g0.origin[2]) * g0.u[2];
      const u0 = su0 - shift, u1 = su1 - shift;
      if (!draw) continue;
      for (const fg of draw.groups.values()) {
        for (const src of [fg.core.get(cell), fg.skin.get(cell)]) {
          if (!src?.length) continue;
          let e = byMaterial.get(fg.material);
          if (!e) { e = { layout: fg.layout, arrays: [], list: [] }; byMaterial.set(fg.material, e); }
          e.arrays.push(src);
        }
      }
      const cg = g.opening[cell] ? null : capGroup(draw);
      if (cg) {
        let e = byMaterial.get(cg.material);
        if (!e) { e = { layout: cg.layout, arrays: [], list: [] }; byMaterial.set(cg.material, e); }
        const tint = draw.core.tint, dv = g.origin[1] - g0.origin[1];
        const y0 = v0 - dv, y1 = v1 - dv;
        const p = (u: number, v: number, d: number) => facePoint(g, u, v, d);
        // back (the inner face), and the four sides across this cell's own wall (an upper storey's may be thinner)
        const t = g.thickness;
        pushQuad(e.list, e.layout, p(u0, y0, -t), p(u1, y0, -t), p(u1, y1, -t), p(u0, y1, -t), [-g.out[0], 0, -g.out[2]], tint, 0.6);
        pushQuad(e.list, e.layout, p(u0, y0, 0), p(u0, y1, 0), p(u0, y1, -t), p(u0, y0, -t), [-g.u[0], 0, -g.u[2]], tint, 0.7);
        pushQuad(e.list, e.layout, p(u1, y0, 0), p(u1, y1, 0), p(u1, y1, -t), p(u1, y0, -t), [g.u[0], 0, g.u[2]], tint, 0.7);
        pushQuad(e.list, e.layout, p(u0, y1, 0), p(u1, y1, 0), p(u1, y1, -t), p(u0, y1, -t), [0, 1, 0], tint, 0.85);
        pushQuad(e.list, e.layout, p(u0, y0, 0), p(u1, y0, 0), p(u1, y0, -t), p(u0, y0, -t), [0, -1, 0], tint, 0.55);
      }
    }
    if (!byMaterial.size) return false;
    const frame = { c: centre, q: qBody };
    // one typed list a material: the cells' packed arrays copied whole, then their caps
    const merged = new Map<THREE.Material, { layout: Layout; list: Float32Array }>();
    for (const [material, e] of byMaterial) {
      let n = e.list.length;
      for (const a of e.arrays) n += a.length;
      const list = new Float32Array(n);
      let at = 0;
      for (const a of e.arrays) { list.set(a, at); at += a.length; }
      for (let i = 0; i < e.list.length; i++) list[at + i] = e.list[i];
      merged.set(material, { layout: e.layout, list });
    }
    // (receipts: every drawn corner inside one of the parts, else it sinks into what it lands on)
    if ((globalThis as { __fractureDebug?: boolean }).__fractureDebug) {
      // every drawn corner inside one of the parts (body frame: x along the face, y up, z out)
      let worst = 0, worstP: number[] = [];
      for (const { layout, list } of merged.values()) {
        for (let i = 0; i < list.length; i += layout.stride) {
          const rx = list[i] - centre[0], ry = list[i + 1] - centre[1], rz = list[i + 2] - centre[2];
          const lx = rx * g0.u[0] + rz * g0.u[2], ly = ry, lz = rx * g0.out[0] + rz * g0.out[2];
          let best = Infinity;
          for (const part of parts) {
            if (part.kind !== 'box') continue;
            const ox = Math.abs(lx - part.center[0]) - part.half[0], oy = Math.abs(ly - part.center[1]) - part.half[1], oz = Math.abs(lz - part.center[2]) - part.half[2];
            best = Math.min(best, Math.max(ox, oy, oz));
          }
          if (best > worst) { worst = best; worstP = [lx, ly, lz]; }
        }
      }
      if (worst > 0.03) console.log(`[fracture-debug] body of ${cells.length / 2} cells, ${parts.length} parts: a corner ${worst.toFixed(3)} m outside (${worstP.map((v) => v.toFixed(2))})`);
    }
    const partsOut: LiveBody['parts'] = [];
    const meshes: THREE.Mesh[] = [];
    for (const [material, { layout, list }] of merged) {
      const geometry = interleavedOf(layout, list, new THREE.Sphere(new THREE.Vector3(centre[0], centre[1], centre[2]), bodyRadius));
      partsOut.push({ material, geometry });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      o.group.add(mesh);
      meshes.push(mesh);
    }
    // spawn: the body frame's pose to the world
    toWorld(live, centre[0], centre[1], centre[2], _v);
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), live.seam.anatomy.placement.yaw);
    const qWorld = yawQ.multiply(qBody);
    const rng = mulberry(seed);
    const handle = o.pool.spawn(shape, {
      x: _v.x, y: _v.y, z: _v.z, qx: qWorld.x, qy: qWorld.y, qz: qWorld.z, qw: qWorld.w,
      vx, vy, vz, wx: (rng() - 0.5) * spin, wy: (rng() - 0.5) * spin, wz: (rng() - 0.5) * spin,
    });
    if (handle < 0) {
      for (const m of meshes) { o.group.remove(m); m.geometry.dispose(); }
      return false;
    }
    const body: LiveBody = { structureIdx: live.seam.structureIdx, handle, meshes, massKg: mass, material: g0.material, still: 0, age: 0, sounds: 0,
      pose: new Float64Array(7).fill(NaN), parts: partsOut,
      fromBody: new THREE.Matrix4().compose(_v.set(frame.c[0], frame.c[1], frame.c[2]), frame.q, _s).invert() };
    bodies.set(handle, body);
    _pose[0] = _v.x; _pose[1] = _v.y; _pose[2] = _v.z; _pose[3] = qWorld.x; _pose[4] = qWorld.y; _pose[5] = qWorld.z; _pose[6] = qWorld.w;
    writePose(body, _pose);
    return true;
  }
  const _pose = new Float64Array(7);
  function writePose(b: LiveBody, src: ArrayLike<number>): void {
    let same = true;
    for (let k = 0; k < 7; k++) if (b.pose[k] !== src[k]) { same = false; b.pose[k] = src[k]; }
    if (same) return;
    _v.set(src[0], src[1], src[2]);
    _q.set(src[3], src[4], src[5], src[6]);
    _m4.compose(_v, _q, _s).multiply(b.fromBody);
    for (const mesh of b.meshes) { mesh.matrix.copy(_m4); mesh.matrixWorldNeedsUpdate = true; }
  }
  /** A body at rest into its building's heap: its geometry baked where it lies (one static mesh a body). */
  function bake(b: LiveBody, release = true): void {
    bodies.delete(b.handle);
    if (release) o.pool.release(b.handle);
    const live = lives.get(b.structureIdx);
    // (the mesh keeps its last matrix: a baked body is a static mesh where it lies, its geometry untouched)
    for (let i = 0; i < b.meshes.length; i++) {
      const mesh = b.meshes[i];
      mesh.matrixWorldNeedsUpdate = true;
      live?.baked.push(mesh);
    }
    bakedCount++;
  }

  function densityOf(material: string): number {
    switch (material) {
      case 'concrete': return 2300;
      case 'stone': return 2400;
      case 'brick': return 1800;
      case 'rubble': return 2000;
      case 'adobe': return 1600;
      case 'timber': case 'plank': case 'infill': return 600;
      case 'metal': return 400;
      default: return 1700;
    }
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

  /** The cells knocked through: a few chunks (one or two cells each) thrown along the round, the rest dust. */
  /** A body to spawn: its cells (face, cell pairs), its launch (world m/s) and spin, its seed. */
  interface BodySpec { cells: number[]; vx: number; vy: number; vz: number; spin: number; seed: number }

  /** The cells knocked through: a few chunks (one cell each) thrown along the round, the rest dust. */
  function planKnocked(live: Live, face: number, knocked: number[], dirBX: number, dirBZ: number, kind: WallStrikeKind,
    hitU: number, hitV: number, budget: number, seed: number, out: BodySpec[]): number {
    if (!knocked.length || budget <= 0) return 0;
    const g = live.wall.faces[face];
    const rng = mulberry(seed);
    // the nearest cells to the point first: they carry the round's push
    const order = knocked.slice().sort((a, b) => {
      cellRect(g, a, rect); const da = Math.hypot((rect[0] + rect[1]) / 2 - hitU, (rect[2] + rect[3]) / 2 - hitV);
      cellRect(g, b, rect); const db = Math.hypot((rect[0] + rect[1]) / 2 - hitU, (rect[2] + rect[3]) / 2 - hitV);
      return da - db || a - b;
    });
    // a third of the cells fly as chunks (at most the budget), the rest are pulverized
    const chunks = Math.min(budget, Math.max(1, Math.round(order.length / 3)));
    const dir = dirToWorld(live, dirBX, dirBZ, new THREE.Vector3());
    for (let i = 0; i < chunks; i++) {
      const cell = order[Math.floor(i * order.length / chunks)];
      const speed = kind === 'kinetic' ? 7 + rng() * 6 : 4 + rng() * 6;
      // a blast throws inward along the round and some back out of the wall; a penetrator's spall goes in
      const back = kind === 'blast' && rng() < 0.3 ? -0.6 : 1;
      const vx = (dir.x * back + (rng() - 0.5) * 0.6) * speed, vz = (dir.z * back + (rng() - 0.5) * 0.6) * speed;
      out.push({ cells: [face, cell], vx, vy: 0.8 + rng() * 2.2, vz, spin: 9, seed: damageSeed(seed, i) });
    }
    return chunks;
  }

  /**
   * The clusters that fell: every cell of them goes down as part of a body (nothing that fell may vanish), let go from
   * rest with a nudge off the wall. Within the round's budget of bodies: a cluster is cut into pieces of as many cells
   * as it takes (six at the least: a few courses wide), largest clusters first.
   */
  function planFallen(live: Live, fallen: number[][], budget: number, seed: number, out: BodySpec[]): void {
    if (!fallen.length) return;
    const order = fallen.slice().sort((a, b) => b.length - a.length || a[1] - b[1]);
    const cells = order.reduce((n, cl) => n + cl.length / 2, 0);
    const per = Math.min(24, Math.max(6, Math.ceil(cells / Math.max(1, budget))));
    let n = 0;
    for (let i = 0; i < order.length; i++) {
      for (const piece of splitCluster(order[i], per)) {
        const g = live.wall.faces[piece[0]];
        const nudge = 0.4;
        const w = dirToWorld(live, g.out[0], g.out[2], new THREE.Vector3());
        out.push({ cells: piece, vx: w.x * nudge, vy: -0.2, vz: w.z * nudge, spin: 1.5, seed: damageSeed(seed, i, n++) });
      }
    }
  }
  /** A cluster cut into pieces of at most `max` cells, in the order it was gathered (edge to edge: each piece hangs
   *  together). */
  function splitCluster(cells: number[], max: number): number[][] {
    if (cells.length / 2 <= max) return [cells];
    const out: number[][] = [];
    for (let i = 0; i < cells.length; i += max * 2) out.push(cells.slice(i, i + max * 2));
    return out;
  }

  /**
   * A strike's drawing, done over the frames after it within a small budget (the burst's flash and dust cover the few
   * frames it takes): the building's triangles sorted by face (once, in slices), each face it touched taken and cut,
   * its bodies spawned one at a time, its faces redrawn, the roof's sag. The wall's state is the strike's at once.
   */
  interface Work { live: Live; faces: number[]; bodies: BodySpec[]; step: number; claimed: number; spawned: number; drawn: number }
  const work: Work[] = [];
  /** A frame's budget for the strikes' drawing (ms of wall clock); flush() runs it all. */
  const WORK_BUDGET_MS = 3;
  /** Advance the queued strikes' drawing until done or `deadline` (performance.now ms; Infinity: all). */
  function advanceWork(deadline: number): void {
    while (work.length) {
      const w = work[0];
      const live = w.live;
      if (!lives.has(live.seam.structureIdx) || live.released) { work.shift(); continue; }
      if (w.step === 0) {
        if (!sortByFaceSlice(live, deadline)) return;
        w.step = 1;
      }
      if (w.step === 1) {
        while (w.claimed < w.faces.length) {
          if (!claimFaceSlice(live, w.faces[w.claimed], deadline)) return;
          w.claimed++;
          if (performance.now() >= deadline) return;
        }
        w.step = 2;
      }
      if (w.step === 2) {
        while (w.spawned < w.bodies.length) {
          const b = w.bodies[w.spawned++];
          spawnCells(live, b.cells, b.vx, b.vy, b.vz, b.spin, b.seed);
          if (performance.now() >= deadline) return;
        }
        w.step = 3;
      }
      if (w.step === 3) {
        while (w.drawn < w.faces.length) {
          const draw = live.faces.get(w.faces[w.drawn++]);
          if (!draw) continue;
          if (draw.grid.state.some((st) => st === CELL_GONE || st === CELL_FALLEN)) roomFor(live, draw.grid.storey, draw);
          redraw(live, draw);
          if (performance.now() >= deadline) return;
        }
        sagRoof(live);
      }
      work.shift();
    }
  }

  return {
    strike(seam, x, y, z, dirX, dirZ, munition, chargeKg, caliberMm, radiusM) {
      const a = seam.anatomy;
      if (!a.storeys.length) return null;
      const hole = holeFor(munition, chargeKg, caliberMm);
      if (radiusM !== undefined && radiusM > 0) hole.radiusM = radiusM;
      if (!(hole.radiusM > 0)) return null;
      let live = lives.get(seam.structureIdx);
      if (!live) {
        live = { seam, wall: createWallFracture(a), faces: new Map(), sag: new Map(), roofCorners: null, sagSignature: '', released: false, claiming: new Map(), sortAt: [0, 0], sorting: null, byFace: null, room: [], roomStoreys: new Set(), baked: [], strikes: 0 };
        lives.set(seam.structureIdx, live);
      }
      // the round in the body frame
      const { x: px, y: py, z: pz, yaw } = a.placement;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const wx = x - px, wz = z - pz;
      const bx = wx * c - wz * s, by = y - py, bz = wx * s + wz * c;
      const dl = Math.hypot(dirX, dirZ) || 1;
      const bdx = (dirX * c - dirZ * s) / dl, bdz = (dirX * s + dirZ * c) / dl;
      const seed = damageSeed(a.seed, 7001, live.strikes++, Math.round(bx * 100), Math.round(by * 100), Math.round(bz * 100));
      if (!strikeWall(live.wall, { x: bx, y: by, z: bz, dirX: bdx, dirZ: bdz, radiusM: hole.radiusM, kind: hole.kind, seed }, outcome)) {
        return null;
      }
      // the faces it touched: the struck one, and every one a fallen cluster runs through
      const touched = new Set<number>([outcome.face]);
      for (const cl of outcome.fallen) for (let i = 0; i < cl.length; i += 2) touched.add(cl[i]);
      for (let i = 0; i < outcome.sagged.length; i += 2) touched.add(outcome.sagged[i]);
      // bodies: the knocked chunks, then what fell (planned now, spawned as the drawing goes)
      const bodies: BodySpec[] = [];
      const budget = bodiesPerStrike - planKnocked(live, outcome.face, outcome.knocked, bdx, bdz, hole.kind, outcome.u, outcome.v,
        Math.ceil(bodiesPerStrike / 2), seed, bodies);
      planFallen(live, outcome.fallen, budget, damageSeed(seed, 2), bodies);
      work.push({ live, faces: [...touched], bodies, step: live.byFace ? 1 : 0, claimed: 0, spawned: 0, drawn: 0 });
      const faces: number[] = [];
      for (const f of touched) faces.push(live.wall.faces[f].storey, live.wall.faces[f].faceIndex);
      return faces;
    },
    has(structureIdx) { return lives.has(structureIdx); },
    standing(structureIdx) {
      const live = lives.get(structureIdx);
      if (!live) return [];
      const out: THREE.Mesh[] = [];
      for (const d of live.faces.values()) out.push(...d.meshes);
      return out;
    },
    release(structureIdx) {
      const live = lives.get(structureIdx);
      if (!live) return;
      live.released = true;
      for (const d of live.faces.values()) for (const m of d.meshes) { o.group.remove(m); m.geometry.dispose(); }
      for (const m of live.room) { o.group.remove(m); m.geometry.dispose(); }
      live.faces.clear();
      live.room.length = 0;
    },
    flush() { advanceWork(Infinity); },
    update() {
      if (work.length) advanceWork(performance.now() + WORK_BUDGET_MS);
      const t = o.now();
      const dt = Math.max(0, Math.min(0.25, t - lastUpdateS));
      lastUpdateS = t;
      if (!bodies.size) return;
      // (a Map tolerates deleting the entry being visited: no list a frame)
      for (const b of bodies.values()) {
        if (!o.pool.framePoseAt(b.handle, _pose)) { bodies.delete(b.handle); continue; }
        writePose(b, _pose);
        b.age += dt;
        b.still = o.pool.asleep(b.handle) ? b.still + dt : 0;
        if (b.still >= BAKE_STILL_S || b.age >= BAKE_AGE_S) bake(b);
      }
    },
    liveBodies() { return bodies.size; },
    reset() {
      for (const b of bodies.values()) { o.pool.release(b.handle); for (const m of b.meshes) { o.group.remove(m); m.geometry.dispose(); } }
      bodies.clear();
      for (const live of lives.values()) {
        for (const d of live.faces.values()) for (const m of d.meshes) { o.group.remove(m); m.geometry.dispose(); }
        for (const m of [...live.room, ...live.baked]) { o.group.remove(m); m.geometry.dispose(); }
      }
      lives.clear();
      work.length = 0;
      bakedCount = 0;
    },
    stats() {
      let faces = 0;
      for (const live of lives.values()) faces += live.faces.size;
      return { buildings: lives.size, faces, bodies: bodies.size, baked: bakedCount };
    },
  };
}

