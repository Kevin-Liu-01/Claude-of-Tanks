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
  CELL_FALLEN, CELL_GONE, CELL_OPENING, CELL_SPALLED, cellRect, createWallFracture, createWallStrikeOutcome, strikeWall,
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
  /** A round on a wall (world point and travel): true when it broke a face (the caller lays no hole of its own). */
  strike(seam: StructureDamageSeam, x: number, y: number, z: number, dirX: number, dirZ: number, munition: MunitionClass,
    chargeKg: number, caliberMm: number, radiusM?: number): boolean;
  /** Whether a building has faces drawn here. */
  has(structureIdx: number): boolean;
  /** Its standing faces' meshes (world space): a collapse cuts them with the building. */
  standing(structureIdx: number): THREE.Mesh[];
  /** The building came down: its standing faces leave (the collapse drew them); its bodies and heaps stay. */
  release(structureIdx: number): void;
  /** Per frame (after the pool's step): live bodies' poses, still ones baked. */
  update(): void;
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
  /** Triangles by cell (body frame, layout stride a vertex). */
  cells: Map<number, number[]>;
}

interface FaceDraw {
  seam: StructureDamageSeam;
  grid: FaceGrid;
  face: number;
  groups: Map<THREE.Material, FaceGroup>;
  meshes: THREE.Mesh[];
  core: FractureSlot;
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
  /** Its geometry per material in its own frame (kept for the bake). */
  parts: Array<{ material: THREE.Material; geometry: THREE.BufferGeometry }>;
}

interface Live {
  seam: StructureDamageSeam;
  wall: WallFracture;
  faces: Map<number, FaceDraw>;
  /** The roof's sag applied so far, per span: each vertex's drop (m), so a new sag moves it by the difference. */
  sag: Map<StructureSpan, Float32Array>;
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

  const _p = new THREE.Vector3(), _n = new THREE.Vector3();
  /** Claim face `f`: every triangle of the building that is the face's, copied (body frame) and flattened in place. */
  function claimFace(live: Live, f: number): FaceDraw {
    const existing = live.faces.get(f);
    if (existing) return existing;
    const grid = live.wall.faces[f];
    const seam = live.seam;
    const { x: px, y: py, z: pz, yaw } = seam.anatomy.placement;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const face = seam.anatomy.storeys[grid.storey].faces[grid.faceIndex];
    const core = face.layers.find((l) => l.material !== 'plaster' && l.material !== 'glass') ?? face.layers[face.layers.length - 1]
      ?? { material: grid.material, bucket: face.bucket, tint: [1, 1, 1], thicknessM: grid.thickness, share: 1 };
    const draw: FaceDraw = { seam, grid, face: f, groups: new Map(), meshes: [], core };
    const soups = new Map<THREE.Material, number[]>();
    for (const span of seam.spans) {
      const mesh = span.mesh as THREE.Mesh;
      const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
      if (!geometry?.getAttribute || span.count < 3) continue;
      const material = o.materialFor(seam, span.bucket);
      if (!material) continue;
      const layout = layoutOf(geometry);
      const pos = span.position;
      const arr = pos.array as Float32Array;
      const nrm = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
      const attrs = layout.names.map((name) => (geometry.getAttribute(name) as THREE.BufferAttribute | undefined) ?? null);
      let claimed = false;
      for (let t = 0; t + 2 < span.count; t += 3) {
        const i0 = span.first + t;
        // its centroid and normal in the body frame (the buckets stand at identity: world = the attribute)
        let cx = 0, cy = 0, cz = 0;
        for (let k = 0; k < 3; k++) { cx += arr[(i0 + k) * 3]; cy += arr[(i0 + k) * 3 + 1]; cz += arr[(i0 + k) * 3 + 2]; }
        cx /= 3; cy /= 3; cz /= 3;
        // a flattened triangle (an earlier claim, a clamp) has no area: skip it
        const ax = arr[i0 * 3], ay = arr[i0 * 3 + 1], az = arr[i0 * 3 + 2];
        const ux = arr[(i0 + 1) * 3] - ax, uy = arr[(i0 + 1) * 3 + 1] - ay, uz = arr[(i0 + 1) * 3 + 2] - az;
        const vx = arr[(i0 + 2) * 3] - ax, vy = arr[(i0 + 2) * 3 + 1] - ay, vz = arr[(i0 + 2) * 3 + 2] - az;
        const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
        const area2 = Math.hypot(fx, fy, fz);
        if (!(area2 > 1e-9)) continue;
        const wx = cx - px, wz = cz - pz;
        const bx = wx * c - wz * s, by = cy - py, bz = wx * s + wz * c;
        const bnx = (fx * c - fz * s) / area2, bny = fy / area2, bnz = (fx * s + fz * c) / area2;
        if (faceOfTriangle(live.wall, bx, by, bz, bnx, bny, bnz) !== f) continue;
        let soup = soups.get(material);
        if (!soup) { soup = []; soups.set(material, soup); }
        for (let k = 0; k < 3; k++) {
          const at = i0 + k;
          const vxw = arr[at * 3] - px, vzw = arr[at * 3 + 2] - pz;
          soup.push(vxw * c - vzw * s, arr[at * 3 + 1] - py, vxw * s + vzw * c);
          if (nrm) { _n.set(nrm.getX(at), nrm.getY(at), nrm.getZ(at)); } else _n.set(bnx, bny, bnz);
          soup.push(_n.x * c - _n.z * s, _n.y, _n.x * s + _n.z * c);
          for (let a = 0; a < attrs.length; a++) {
            const attr = attrs[a], size = layout.sizes[a];
            for (let j = 0; j < size; j++) soup.push(attr && j < attr.itemSize ? attr.getComponent(at, j) : neutral(layout.names[a]));
          }
        }
        if (!claimed) { o.keepSpan(span); claimed = true; }
        // flattened onto its first corner: gone from the bucket, back at the reset
        for (let k = 1; k < 3; k++) { arr[(i0 + k) * 3] = ax; arr[(i0 + k) * 3 + 1] = ay; arr[(i0 + k) * 3 + 2] = az; }
      }
      if (claimed) {
        pos.addUpdateRange(span.first * 3, span.count * 3);
        pos.needsUpdate = true;
        if (!draw.groups.has(material)) draw.groups.set(material, { material, layout, cells: new Map() });
      }
    }
    for (const [material, soup] of soups) {
      const g = draw.groups.get(material)!;
      cutIntoCells(grid, soup, g.layout.stride, g.cells);
    }
    live.faces.set(f, draw);
    seam.touchShadows();
    return draw;
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
  function cutIntoCells(grid: FaceGrid, soup: number[], stride: number, cells: Map<number, number[]>): void {
    const rows = grid.rowY.length - 1;
    const oy = grid.origin[1];
    const ux = grid.u[0], uz = grid.u[2];
    const ou = grid.origin[0] * ux + grid.origin[2] * uz;
    const front: Poly = [], back: Poly = [];
    const tris = soup.length / (3 * stride);
    const keep = (poly: Poly | null): void => {
      if (!poly) return;
      let list = cells.get(STATIC_CELL);
      if (!list) { list = []; cells.set(STATIC_CELL, list); }
      emitPoly(list, poly);
    };
    /** The part of `poly` on the near side of a plane (back: n·p < d); what lies past it stays with the face (static). */
    const within = (poly: Poly | null, nx: number, ny: number, nz: number, d: number): Poly | null => {
      if (!poly) return null;
      clip(poly, nx, ny, nz, d, front, back);
      if (front.length >= 3) keep(front.slice());
      return back.length >= 3 ? back.slice() : null;
    };
    const half = grid.width / 2;
    for (let t = 0; t < tris; t++) {
      const poly0: Poly = [0, 1, 2].map((k) => Float64Array.from(soup.slice((t * 3 + k) * stride, (t * 3 + k + 1) * stride)));
      // the face's own rectangle: what reaches past its foot, its head or its ends (a plinth's lip, an eave's board, a
      // corner's trim) stays standing with the face, never with a cell
      let poly: Poly | null = within(poly0, 0, -1, 0, -(oy + grid.rowY[0]));
      poly = within(poly, 0, 1, 0, oy + grid.rowY[rows]);
      poly = within(poly, ux, 0, uz, ou + half);
      poly = within(poly, -ux, 0, -uz, -(ou - half));
      if (!poly) continue;
      // rows: from the bottom, peel each row off (what is under its top is that row's)
      let rest: Poly | null = poly;
      for (let r = 0; r < rows && rest; r++) {
        const top = oy + grid.rowY[r + 1];
        let inRow: Poly | null;
        if (r === rows - 1) { inRow = rest; rest = null; }
        else {
          clip(rest, 0, 1, 0, top, front, back);
          inRow = back.length >= 3 ? back.slice() : null;
          rest = front.length >= 3 ? front.slice() : null;
        }
        if (!inRow) continue;
        // columns: along u, peel each cell off from the row's start
        let restU: Poly | null = inRow;
        for (let cIdx = grid.rowStart[r]; cIdx < grid.rowStart[r + 1] && restU; cIdx++) {
          const last = cIdx === grid.rowStart[r + 1] - 1;
          let inCell: Poly | null;
          if (last) { inCell = restU; restU = null; }
          else {
            clip(restU, ux, 0, uz, ou + grid.cellU[2 * cIdx + 1], front, back);
            inCell = back.length >= 3 ? back.slice() : null;
            restU = front.length >= 3 ? front.slice() : null;
          }
          if (!inCell) continue;
          let list = cells.get(cIdx);
          if (!list) { list = []; cells.set(cIdx, list); }
          emitPoly(list, inCell);
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
      if (!g) { g = { material, layout: { names: ['uv', 'color'], sizes: [2, 3], stride: 11 }, cells: new Map() }; draw.groups.set(material, g); }
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
  /** Rebuild a face's standing meshes from its cells. */
  function redraw(live: Live, draw: FaceDraw): void {
    for (const mesh of draw.meshes) { o.group.remove(mesh); mesh.geometry.dispose(); }
    draw.meshes.length = 0;
    const g = draw.grid;
    const rows = g.rowY.length - 1;
    const lists = new Map<THREE.Material, number[]>();
    // the cells' own triangles: a standing cell's, its skin left out where spalled, lowered where it sags
    for (const fg of draw.groups.values()) {
      const out: number[] = [];
      const stride = fg.layout.stride;
      for (const [cell, list] of fg.cells) {
        if (cell === STATIC_CELL) { for (let i = 0; i < list.length; i++) out.push(list[i]); continue; }
        const st = g.state[cell];
        // an opening's own triangles (its frame, sash, glass, door) stand while its jambs do
        if (!standingState(st) && st !== CELL_OPENING) continue;
        const sag = g.sag[cell];
        for (let i = 0; i < list.length; i += stride * 3) {
          if (st === CELL_SPALLED) {
            // a triangle of the skin (its centroid within the skin's depth, or proud of the face) goes with the spall
            let depth = 0;
            for (let k = 0; k < 3; k++) {
              const at = i + k * stride;
              depth += (list[at] - g.origin[0]) * g.out[0] + (list[at + 2] - g.origin[2]) * g.out[2];
            }
            if (depth / 3 > -g.skinM) continue;
          }
          for (let k = 0; k < stride * 3; k++) out.push(list[i + k]);
          if (sag > 0) for (let k = 0; k < 3; k++) out[out.length - stride * 3 + k * stride + 1] -= sag;
        }
      }
      lists.set(fg.material, out);
    }
    // the reveals and recesses in the wall's core
    const cg = capGroup(draw);
    if (cg) {
      let out = lists.get(cg.material);
      if (!out) { out = []; lists.set(cg.material, out); }
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
            // the recess: the core a skin's depth back, its edges a shade darker
            pushQuad(out, cg.layout, facePoint(g, u0, y0 - sag, front), facePoint(g, u1, y0 - sag, front), facePoint(g, u1, y1 - sag, front),
              facePoint(g, u0, y1 - sag, front), [g.out[0], 0, g.out[2]], tint, 0.82);
          }
          // the reveal on each side that opens onto a gone cell (or a cell whose skin is gone and this one's is not)
          const side = (pa: number[], pb: number[], n: number[], shade: number): void => {
            pushQuad(out!, cg.layout, pa, pb, [pb[0] - g.out[0] * (T + front), pb[1], pb[2] - g.out[2] * (T + front)],
              [pa[0] - g.out[0] * (T + front), pa[1], pa[2] - g.out[2] * (T + front)], n, tint, shade);
          };
          const goneState = (state: number): boolean => state === CELL_GONE || state === CELL_FALLEN;
          const leftGone = c > g.rowStart[r] && goneState(g.state[c - 1]);
          const rightGone = c + 1 < g.rowStart[r + 1] && goneState(g.state[c + 1]);
          if (leftGone) side(facePoint(g, u0, y0 - sag, front), facePoint(g, u0, y1 - sag, front), [-g.u[0], 0, -g.u[2]], 0.7);
          if (rightGone) side(facePoint(g, u1, y1 - sag, front), facePoint(g, u1, y0 - sag, front), [g.u[0], 0, g.u[2]], 0.7);
          openSpans(g, r + 1, u0, u1, _spans);
          for (let k = 0; k < _spans.length; k += 2) side(facePoint(g, _spans[k + 1], y1 - sag, front), facePoint(g, _spans[k], y1 - sag, front), [0, 1, 0], 0.85);
          openSpans(g, r - 1, u0, u1, _spans);
          for (let k = 0; k < _spans.length; k += 2) side(facePoint(g, _spans[k], y0 - sag, front), facePoint(g, _spans[k + 1], y0 - sag, front), [0, -1, 0], 0.55);
        }
      }
    }
    for (const [material, list] of lists) {
      if (!list.length) continue;
      const fg = [...draw.groups.values()].find((x) => x.material === material)!;
      const mesh = new THREE.Mesh(geometryOf(live, fg.layout, list, null), material);
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.structureFractureFace = true;
      o.group.add(mesh);
      draw.meshes.push(mesh);
    }
    live.seam.touchShadows();
  }

  /** A list's geometry: world space (frame null) or a body's own frame (its centre and rotation in the body frame). */
  function geometryOf(live: Live, layout: Layout, list: number[], frame: { c: number[]; q: THREE.Quaternion } | null): THREE.BufferGeometry {
    const verts = list.length / layout.stride;
    const pos = new Float32Array(verts * 3), nrm = new Float32Array(verts * 3);
    const extra = layout.sizes.map((size) => new Float32Array(verts * size));
    const { x: px, y: py, z: pz, yaw } = live.seam.anatomy.placement;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const iq = frame ? frame.q.clone().invert() : null;
    for (let i = 0; i < verts; i++) {
      const at = i * layout.stride, o3 = i * 3;
      if (frame && iq) {
        _p.set(list[at] - frame.c[0], list[at + 1] - frame.c[1], list[at + 2] - frame.c[2]).applyQuaternion(iq);
        pos[o3] = _p.x; pos[o3 + 1] = _p.y; pos[o3 + 2] = _p.z;
        _n.set(list[at + 3], list[at + 4], list[at + 5]).applyQuaternion(iq);
        nrm[o3] = _n.x; nrm[o3 + 1] = _n.y; nrm[o3 + 2] = _n.z;
      } else {
        const x = list[at], y = list[at + 1], z = list[at + 2];
        pos[o3] = px + x * c + z * s; pos[o3 + 1] = py + y; pos[o3 + 2] = pz - x * s + z * c;
        const nx = list[at + 3], ny = list[at + 4], nz = list[at + 5];
        nrm[o3] = nx * c + nz * s; nrm[o3 + 1] = ny; nrm[o3 + 2] = -nx * s + nz * c;
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
    const mesh = new THREE.Mesh(geometryOf(live, layout, list, null), material);
    mesh.matrixAutoUpdate = false;
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
    let changed = false;
    for (const span of live.seam.spans) {
      if (span.partClass !== 'roof' && span.partClass !== 'trim') continue;
      const arr = span.position.array as Float32Array;
      let applied = live.sag.get(span);
      for (let k = 0; k < span.count; k++) {
        const i = span.first + k;
        const wx = arr[i * 3] - px, wz = arr[i * 3 + 2] - pz;
        const before = applied ? applied[k] : 0;
        // the point as it stood (its sag so far undone)
        const by = arr[i * 3 + 1] + before - py;
        const drop = sagAt(wx * c - wz * s, by, wx * s + wz * c);
        if (Math.abs(drop - before) < 1e-4) continue;
        if (!applied) { o.keepSpan(span); applied = new Float32Array(span.count); live.sag.set(span, applied); }
        arr[i * 3 + 1] -= drop - before;
        applied[k] = drop;
        changed = true;
      }
      if (changed && applied) { span.position.addUpdateRange(span.first * 3, span.count * 3); span.position.needsUpdate = true; }
    }
    if (changed) live.seam.touchShadows();
  }

  // ---- bodies --------------------------------------------------------------------------------------------------------
  const _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1), _v = new THREE.Vector3();
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
    // each cell's depth through the wall to the proudest part it carries (a sill, a shutter, a frame)
    const depthOf = (g: FaceGrid, cell: number): [number, number] => {
      let dMin = -g.thickness, dMax = 0;
      const draw = live.faces.get(live.wall.faces.indexOf(g));
      if (draw) for (const fg of draw.groups.values()) {
        const src = fg.cells.get(cell);
        if (!src) continue;
        for (let i = 0; i < src.length; i += fg.layout.stride) {
          const d = (src[i] - g.origin[0]) * g.out[0] + (src[i + 2] - g.origin[2]) * g.out[2];
          if (d < dMin) dMin = d;
          if (d > dMax) dMax = d;
        }
      }
      return [dMin, dMax];
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
    const parts: RigidPartSpec[] = runs.map((run) => ({
      kind: 'box' as const,
      center: [(run.u0 + run.u1) / 2 - cu, (run.v0 + run.v1) / 2 - cv, (run.d0 + run.d1) / 2 + run.dd + T / 2] as [number, number, number],
      half: [Math.max(0.04, (run.u1 - run.u0) / 2), Math.max(0.04, (run.v1 - run.v0) / 2), Math.max(0.04, (run.d1 - run.d0) / 2)] as [number, number, number],
      mass: run.mass,
    }));
    const shape = createRigidShape(parts.slice(0, 24), { restitution: 0.12, friction: 0.75, maxSpheres: Math.min(96, 24 + parts.length * 8) });
    // geometry: each cell's triangles, its caps on every side and its back
    const byMaterial = new Map<THREE.Material, { layout: Layout; list: number[] }>();
    for (const [su0, su1, v0, v1, g, cell] of rects) {
      const draw = live.faces.get(live.wall.faces.indexOf(g));
      const shift = (g.origin[0] - g0.origin[0]) * g0.u[0] + (g.origin[2] - g0.origin[2]) * g0.u[2];
      const u0 = su0 - shift, u1 = su1 - shift;
      if (!draw) continue;
      for (const fg of draw.groups.values()) {
        const src = fg.cells.get(cell);
        if (!src?.length) continue;
        let e = byMaterial.get(fg.material);
        if (!e) { e = { layout: fg.layout, list: [] }; byMaterial.set(fg.material, e); }
        for (let i = 0; i < src.length; i++) e.list.push(src[i]);
      }
      const cg = g.opening[cell] ? null : capGroup(draw);
      if (cg) {
        let e = byMaterial.get(cg.material);
        if (!e) { e = { layout: cg.layout, list: [] }; byMaterial.set(cg.material, e); }
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
    // (receipts: every drawn corner inside one of the parts, else it sinks into what it lands on)
    if ((globalThis as { __fractureDebug?: boolean }).__fractureDebug) {
      // every drawn corner inside one of the parts (body frame: x along the face, y up, z out)
      let worst = 0, worstP: number[] = [];
      for (const { layout, list } of byMaterial.values()) {
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
    for (const [material, { layout, list }] of byMaterial) {
      const geometry = geometryOf(live, layout, list, frame);
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
      pose: new Float64Array(7).fill(NaN), parts: partsOut };
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
    _m4.compose(_v, _q, _s);
    for (const mesh of b.meshes) { mesh.matrix.copy(_m4); mesh.matrixWorldNeedsUpdate = true; }
  }
  /** A body at rest into its building's heap: its geometry baked where it lies (one static mesh a body). */
  function bake(b: LiveBody, release = true): void {
    bodies.delete(b.handle);
    if (release) o.pool.release(b.handle);
    const live = lives.get(b.structureIdx);
    _v.set(b.pose[0], b.pose[1], b.pose[2]);
    _q.set(b.pose[3], b.pose[4], b.pose[5], b.pose[6]);
    _m4.compose(_v, _q, _s);
    for (let i = 0; i < b.meshes.length; i++) {
      const mesh = b.meshes[i];
      mesh.geometry.applyMatrix4(_m4);
      mesh.matrix.identity();
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
  function throwKnocked(live: Live, face: number, knocked: number[], dirBX: number, dirBZ: number, kind: WallStrikeKind,
    hitU: number, hitV: number, budget: number, seed: number): number {
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
    let thrown = 0;
    const dir = dirToWorld(live, dirBX, dirBZ, new THREE.Vector3());
    for (let i = 0; i < chunks; i++) {
      const cell = order[Math.floor(i * order.length / chunks)];
      const speed = kind === 'kinetic' ? 7 + rng() * 6 : 4 + rng() * 6;
      // a blast throws inward along the round and some back out of the wall; a penetrator's spall goes in
      const back = kind === 'blast' && rng() < 0.3 ? -0.6 : 1;
      const vx = (dir.x * back + (rng() - 0.5) * 0.6) * speed, vz = (dir.z * back + (rng() - 0.5) * 0.6) * speed;
      const vy = 0.8 + rng() * 2.2;
      if (spawnCells(live, [face, cell], vx, vy, vz, 9, damageSeed(seed, i))) thrown++;
    }
    return thrown;
  }

  /**
   * The clusters that fell: every cell of them goes down as part of a body (nothing that fell may vanish), let go from
   * rest with a nudge off the wall. Within the round's budget of bodies: a cluster is cut into pieces of as many cells
   * as it takes (six at the least: a few courses wide), largest clusters first.
   */
  function dropFallen(live: Live, fallen: number[][], budget: number, seed: number): number {
    if (!fallen.length) return 0;
    const order = fallen.slice().sort((a, b) => b.length - a.length || a[1] - b[1]);
    const cells = order.reduce((n, cl) => n + cl.length / 2, 0);
    const per = Math.min(24, Math.max(6, Math.ceil(cells / Math.max(1, budget))));
    let dropped = 0;
    for (let i = 0; i < order.length; i++) {
      for (const piece of splitCluster(order[i], per)) {
        const g = live.wall.faces[piece[0]];
        const nudge = 0.4;
        const out = dirToWorld(live, g.out[0], g.out[2], new THREE.Vector3());
        if (spawnCells(live, piece, out.x * nudge, -0.2, out.z * nudge, 1.5, damageSeed(seed, i, dropped))) dropped++;
      }
    }
    return dropped;
  }
  /** A cluster cut into pieces of at most `max` cells, in the order it was gathered (edge to edge: each piece hangs
   *  together). */
  function splitCluster(cells: number[], max: number): number[][] {
    if (cells.length / 2 <= max) return [cells];
    const out: number[][] = [];
    for (let i = 0; i < cells.length; i += max * 2) out.push(cells.slice(i, i + max * 2));
    return out;
  }

  return {
    strike(seam, x, y, z, dirX, dirZ, munition, chargeKg, caliberMm, radiusM) {
      const a = seam.anatomy;
      if (!a.storeys.length) return false;
      const hole = holeFor(munition, chargeKg, caliberMm);
      if (radiusM !== undefined && radiusM > 0) hole.radiusM = radiusM;
      if (!(hole.radiusM > 0)) return false;
      let live = lives.get(seam.structureIdx);
      if (!live) {
        live = { seam, wall: createWallFracture(a), faces: new Map(), sag: new Map(), room: [], roomStoreys: new Set(), baked: [], strikes: 0 };
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
        return false;
      }
      // the faces it touched: the struck one, and every one a fallen cluster runs through
      const touched = new Set<number>([outcome.face]);
      for (const cl of outcome.fallen) for (let i = 0; i < cl.length; i += 2) touched.add(cl[i]);
      for (let i = 0; i < outcome.sagged.length; i += 2) touched.add(outcome.sagged[i]);
      for (const f of touched) claimFace(live, f);
      // bodies: the knocked chunks, then what fell
      let budget = bodiesPerStrike;
      budget -= throwKnocked(live, outcome.face, outcome.knocked, bdx, bdz, hole.kind, outcome.u, outcome.v, Math.ceil(budget / 2), seed);
      dropFallen(live, outcome.fallen, budget, damageSeed(seed, 2));
      for (const f of touched) {
        const draw = live.faces.get(f)!;
        if (draw.grid.state.some((st) => st === CELL_GONE || st === CELL_FALLEN)) roomFor(live, draw.grid.storey, draw);
        redraw(live, draw);
      }
      sagRoof(live);
      return true;
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
      for (const d of live.faces.values()) for (const m of d.meshes) { o.group.remove(m); m.geometry.dispose(); }
      for (const m of live.room) { o.group.remove(m); m.geometry.dispose(); }
      live.faces.clear();
      live.room.length = 0;
    },
    update() {
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
      bakedCount = 0;
    },
    stats() {
      let faces = 0;
      for (const live of lives.values()) faces += live.faces.size;
      return { buildings: lives.size, faces, bodies: bodies.size, baked: bakedCount };
    },
  };
}

