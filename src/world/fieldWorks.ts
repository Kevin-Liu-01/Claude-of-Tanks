// src/world/fieldWorks.ts — the field boundaries' built works (the scenery lane, 2026-10-03; the coordinator: the
// ground lane's land use marks a map's field boundaries — landUse.ts landUseAt: boundary 0 margin, 1 ditch, 2 bund,
// 3 wall, edgeM the distance to the field's edge). The karst's dry stone walls stand on the grid's wall boundaries and
// a bocage's hedge lines get their earth banks, on the same layout the terrain draws (the boundary band, the same field
// gate: off the villages, the roads, the water and the slopes), so a wall stands exactly where the ground shows its
// footing. They are decor: a low rubble wall or a bank is crossed, not cover — no collision (should they ever matter in
// play they become crushable like the fences, never blocking), no taller than a metre, kept off the roads, the bridges
// and their approaches, the aprons and yards, every mode's objective discs and the spawn pads (the maps lane owns the
// layouts these keep clear); one welded mesh, casting no shadow: the walls (group 0) on their own stone (the face
// print, fieldWallFace.ts), the banks (group 1) on the props rock material.
//
// The walls (the scenery lane, b13; gauntlet wave 87, Saltwind: "a smooth grey kerb-like strip of even width ... cast
// concrete rather than a drystone wall", "a wall built like stacked cinder blocks", and on corner-ne a wall that ran
// through the wall it met and ended in the open with its head drawn inside out): each line is laid as dry stone —
// slots a top stone long, a stepped crown, faces a little uneven stone by stone under the print's courses, a fallen
// stretch, a breach, lower heads facing out, the odd stone at the foot — and a line that crosses another within a
// stub's reach of its end is cut at the crossing.
//
// The land use reaches the props through the height field's hook (`_landUseAt`, terrain.ts), so this module imports
// nothing of it; a map without a field system, or a world built without the hook, builds nothing.
import * as THREE from 'three';
import type { SimplexNoise } from '../engine/simplexFast.ts';
import { DRY_WALL_CROWN_MID_V, DRY_WALL_TILE_M } from './fieldWallFace.ts';

/** The land-use sample fields this pass reads (landUse.ts LandFieldSample). */
interface FieldSample { active: number; edgeM: number; boundary: number; track: number; hedge: number }

interface FieldWorksGround {
  getHeightAt(x: number, z: number): number;
  getHeightAtFast?(x: number, z: number): number;
  getNormalAt(x: number, z: number): { y: number };
  getWaterMaskAt(x: number, z: number): number;
  _roadDist(x: number, z: number): number;
  _villageMask?(x: number, z: number): number;
  /** The stands' cover (0..1), when the world has applied it: no field is drawn under a closed canopy. */
  _woodsAt?(x: number, z: number): number;
  _landUseAt?(x: number, z: number, out: FieldSample): FieldSample;
}

/** A placed solid's footprint (props obstacles): the works keep off it. */
interface FieldWorksSolid { min: ArrayLike<number>; max: ArrayLike<number> }

/** An oriented rectangle the works keep off: its centre, its unit axis along, its half extents along and across. */
export interface FieldWorksRect { x: number; z: number; ux: number; uz: number; halfAlong: number; halfAcross: number }

/** The layout's footprints the works keep off (scenery.ts builds them): discs [x, z, r] and oriented rectangles. */
export interface FieldWorksKeepOut {
  discs: ReadonlyArray<readonly [number, number, number]>;
  rects: readonly FieldWorksRect[];
}

/** The tallest a field wall or a bank stands above its own ground (m): a low wall, never the cover the game gives. */
const FIELD_WORKS_MAX_M = 1.0;
/** A wall's batter: its faces run from the foot's half width to the crown's at this height over the ground (m). */
const BATTER_H = 0.9;

interface FieldWorksOptions {
  walls: boolean;
  banks: boolean;
  spawns: ReadonlyArray<{ x: number; z: number }>;
  /** The hard solids already placed (buildings, walls, rock masses): a wall or a bank never runs through one. */
  solids?: readonly FieldWorksSolid[];
  /** The layout's aprons, yards, bridges, trenches and objective discs. */
  keepOut?: FieldWorksKeepOut;
  mobile: boolean;
  /** sRGB HSL base tones of the wall stone and the bank's earth. */
  wallTone?: readonly [number, number, number];
  bankTone?: readonly [number, number, number];
}

export interface FieldWorksReceipt {
  wallPieces: number;
  bankPieces: number;
  /** Approximate lengths laid (m); a 'piece' is one swept chain. */
  wallM: number;
  bankM: number;
  triangles: number;
  scanned: number;
}

type FieldWorksSlice = { fine: true; progress: false; stage: string };

/** What the works build: the walls (the dry-stone print's) and the banks (the rock material's); `geometry` is the one there is. */
export interface FieldWorksBuilt {
  geometry: THREE.BufferGeometry | null;
  wallGeometry: THREE.BufferGeometry | null;
  bankGeometry: THREE.BufferGeometry | null;
  receipt: FieldWorksReceipt;
}

const SQUARE = 466;
/** The spawn pads' flat (terrain.ts levels a pad out to 22 m) and a berth. */
const SPAWN_CLEAR = 24;
/** The road's painted core at its widest (terrain.ts: a 3.85 m half width and its edge noise): a work's toe stays out. */
const FIELD_WORKS_ROAD_CORE_M = 5.7;
/** A work's half width at its toe (a wall's fallen stones lie up to 0.87 m out; a bank's base with its lump). */
const TOE_M = [0.9, 1.36] as const;

function smooth(a: number, b: number, x: number): number { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

const _c = new THREE.Color();
function hsl(h: number, s: number, l: number): [number, number, number] {
  _c.setHSL(((h % 1) + 1) % 1, Math.min(1, Math.max(0, s)), Math.min(1, Math.max(0, l)), THREE.SRGBColorSpace);
  return [_c.r, _c.g, _c.b];
}

/**
 * Lay the map's field-boundary works. A grid at 1.5 m (2 m on phones) finds the boundary band (a wall's band, or a
 * hedge line's on a margin boundary); each point in it drops onto the boundary's line down the distance field's
 * gradient and, where the field gate admits it and no foot stands within 0.9 m, becomes a foot of the line. The feet
 * chain along their lines and every chain is swept as one continuous wall or bank. A generator: one slice every forty
 * rows of the scan and every two hundred chains.
 */
export function* buildFieldWorks(
  ground: FieldWorksGround, noise: SimplexNoise, options: FieldWorksOptions,
): Generator<FieldWorksSlice, FieldWorksBuilt, void> {
  const receipt: FieldWorksReceipt = { wallPieces: 0, bankPieces: 0, wallM: 0, bankM: 0, triangles: 0, scanned: 0 };
  const landAt = ground._landUseAt;
  if (!landAt || (!options.walls && !options.banks)) return { geometry: null, wallGeometry: null, bankGeometry: null, receipt };
  const s: FieldSample = { active: 0, edgeM: 0, boundary: 0, track: 0, hedge: 0 };
  const edgeAt = (x: number, z: number) => landAt(x, z, s).edgeM;
  const heightAt = ground.getHeightAtFast ? (x: number, z: number) => ground.getHeightAtFast!(x, z) : (x: number, z: number) => ground.getHeightAt(x, z);
  const fieldGate = (x: number, z: number): boolean => {
    const vm = ground._villageMask ? ground._villageMask(x, z) : 0;
    const woods = ground._woodsAt ? ground._woodsAt(x, z) : 0;
    const w = (1 - smooth(0.05, 0.30, vm)) * smooth(5.0, 8.0, ground._roadDist(x, z))
      * (1 - smooth(0.02, 0.06, 1 - ground.getNormalAt(x, z).y)) * (1 - smooth(0.02, 0.10, ground.getWaterMaskAt(x, z)))
      * (1 - smooth(0.10, 0.45, woods));
    return w > 0.5;
  };
  // the placed solids on an 8 m grid (their footprints grown by the work's half width and a margin)
  const SOLID_CELL = 8, solidGrid = new Map<number, number[]>();
  const solids = options.solids ?? [];
  const solidKey = (cx: number, cz: number) => (cx + 1024) * 2048 + (cz + 1024);
  solids.forEach((solid, k) => {
    const x0 = Math.floor((solid.min[0] - 2) / SOLID_CELL), x1 = Math.floor((solid.max[0] + 2) / SOLID_CELL);
    const z0 = Math.floor((solid.min[2] - 2) / SOLID_CELL), z1 = Math.floor((solid.max[2] + 2) / SOLID_CELL);
    if (x1 - x0 > 16 || z1 - z0 > 16) return; // a map-sized record is not a placed solid
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const list = solidGrid.get(solidKey(cx, cz)); if (list) list.push(k); else solidGrid.set(solidKey(cx, cz), [k]);
    }
  });
  const inSolid = (x: number, z: number, r: number): boolean => {
    const list = solidGrid.get(solidKey(Math.floor(x / SOLID_CELL), Math.floor(z / SOLID_CELL)));
    if (!list) return false;
    for (const k of list) {
      const solid = solids[k];
      if (x > solid.min[0] - r && x < solid.max[0] + r && z > solid.min[2] - r && z < solid.max[2] + r) return true;
    }
    return false;
  };
  // the layout's keep-out footprints on the same 8 m grid (by their bounds)
  const keepGrid = new Map<number, number[]>();
  const discs = options.keepOut?.discs ?? [], rects = options.keepOut?.rects ?? [];
  const indexBounds = (k: number, x0: number, z0: number, x1: number, z1: number) => {
    for (let cx = Math.floor(x0 / SOLID_CELL); cx <= Math.floor(x1 / SOLID_CELL); cx++) {
      for (let cz = Math.floor(z0 / SOLID_CELL); cz <= Math.floor(z1 / SOLID_CELL); cz++) {
        const list = keepGrid.get(solidKey(cx, cz)); if (list) list.push(k); else keepGrid.set(solidKey(cx, cz), [k]);
      }
    }
  };
  const PAD_MAX = 2;
  discs.forEach(([x, z, r], k) => indexBounds(k, x - r - PAD_MAX, z - r - PAD_MAX, x + r + PAD_MAX, z + r + PAD_MAX));
  rects.forEach((rect, k) => {
    const ex = Math.abs(rect.ux) * rect.halfAlong + Math.abs(rect.uz) * rect.halfAcross + PAD_MAX;
    const ez = Math.abs(rect.uz) * rect.halfAlong + Math.abs(rect.ux) * rect.halfAcross + PAD_MAX;
    indexBounds(discs.length + k, rect.x - ex, rect.z - ez, rect.x + ex, rect.z + ez);
  });
  /** Inside a keep-out footprint grown by `pad` (the work's half width and a margin). */
  const inKeepOut = (x: number, z: number, pad: number): boolean => {
    const list = keepGrid.get(solidKey(Math.floor(x / SOLID_CELL), Math.floor(z / SOLID_CELL)));
    if (!list) return false;
    for (const k of list) {
      if (k < discs.length) {
        const [dx, dz, r] = discs[k];
        if (Math.hypot(x - dx, z - dz) < r + pad) return true;
        continue;
      }
      const rect = rects[k - discs.length];
      const ox = x - rect.x, oz = z - rect.z;
      if (Math.abs(ox * rect.ux + oz * rect.uz) < rect.halfAlong + pad && Math.abs(-ox * rect.uz + oz * rect.ux) < rect.halfAcross + pad) return true;
    }
    return false;
  };
  const step = options.mobile ? 2 : 1.5;
  // the feet on a 2 m hash: one foot a metre or so along a line
  const cell = 2, hash = new Map<number, number[]>();
  const key = (x: number, z: number) => (Math.floor(x / cell) + 4096) * 8192 + (Math.floor(z / cell) + 4096);
  const near = (x: number, z: number, r: number): boolean => {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const list = hash.get((cx + i + 4096) * 8192 + (cz + j + 4096));
      if (!list) continue;
      for (let k = 0; k < list.length; k += 2) if (Math.hypot(list[k] - x, list[k + 1] - z) < r) return true;
    }
    return false;
  };
  // the boundary's feet: a point on the line, the line's direction, the work it carries (0 a wall, 1 a bank)
  const feet: number[] = []; // x, z, dx, dz, kind
  let rowIndex = 0;
  for (let x = -SQUARE; x <= SQUARE; x += step, rowIndex++) {
    if (rowIndex % 40 === 39) yield { fine: true, progress: false, stage: 'field-works' };
    for (let z = -SQUARE; z <= SQUARE; z += step) {
      receipt.scanned++;
      landAt(x, z, s);
      if (!s.active) continue;
      const wall = options.walls && s.boundary === 3 && s.edgeM < 1.05 && s.track < 0.5;
      const bank = options.banks && s.boundary === 0 && s.hedge > 0.85 && s.edgeM < 1.1 && s.track < 0.5;
      if (!wall && !bank) continue;
      // down the distance field's gradient onto the boundary's line; the line runs square to it (a point right on the
      // line, where the field folds, reads its gradient from a step to the side)
      let px = x, pz = z, e0 = s.edgeM;
      let gx = edgeAt(px + 0.4, pz) - edgeAt(px - 0.4, pz), gz = edgeAt(px, pz + 0.4) - edgeAt(px, pz - 0.4);
      for (const [ox, oz] of [[0.55, 0.3], [-0.3, 0.55]]) {
        if (Math.hypot(gx, gz) >= 0.2) break;
        px = x + ox; pz = z + oz; e0 = edgeAt(px, pz);
        gx = edgeAt(px + 0.4, pz) - edgeAt(px - 0.4, pz); gz = edgeAt(px, pz + 0.4) - edgeAt(px, pz - 0.4);
      }
      const gl = Math.hypot(gx, gz);
      if (gl < 0.2) continue;
      const ux = gx / gl, uz = gz / gl;
      const fx = px - ux * e0, fz = pz - uz * e0;
      if (near(fx, fz, 0.9)) continue;
      if (!fieldGate(fx, fz) || inSolid(fx, fz, wall ? 1.0 : 1.5) || inKeepOut(fx, fz, wall ? 1.0 : 1.8)) continue;
      if (ground._roadDist(fx, fz) < FIELD_WORKS_ROAD_CORE_M + TOE_M[wall ? 0 : 1]) continue;
      if (options.spawns.some((p) => Math.hypot(p.x - fx, p.z - fz) < SPAWN_CLEAR)) continue;
      const list = hash.get(key(fx, fz));
      if (list) list.push(fx, fz); else hash.set(key(fx, fz), [fx, fz]);
      feet.push(fx, fz, -uz, ux, wall ? 0 : 1);
    }
  }
  yield { fine: true, progress: false, stage: 'field-works' };
  // chain the feet along their lines into walls and banks: each foot names its nearest neighbour ahead and behind along
  // its own line (within 2.6 m, nearly in line, the same work, a line running the same way); two feet link when each
  // names the other, so every foot links to at most two, and every chain is swept continuously
  const count0 = feet.length / 5;
  const byCell = new Map<number, number[]>();
  for (let i = 0; i < count0; i++) { const k = key(feet[i * 5], feet[i * 5 + 1]); const l = byCell.get(k); if (l) l.push(i); else byCell.set(k, [i]); }
  const fwd = new Int32Array(count0).fill(-1), back = new Int32Array(count0).fill(-1);
  for (let i = 0; i < count0; i++) {
    // (b13: a slice every four thousand feet: a map's twenty thousand feet were one long task)
    if ((i & 4095) === 4095) yield { fine: true, progress: false, stage: 'field-works' };
    const x = feet[i * 5], z = feet[i * 5 + 1], dx = feet[i * 5 + 2], dz = feet[i * 5 + 3], kind = feet[i * 5 + 4];
    let bf = -1, bb = -1, df = 3.4, db = 3.4;
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const l = byCell.get((cx + a + 4096) * 8192 + (cz + b + 4096));
      if (!l) continue;
      for (const j of l) {
        if (j === i || feet[j * 5 + 4] !== kind) continue;
        const ox = feet[j * 5] - x, oz = feet[j * 5 + 1] - z, d = Math.hypot(ox, oz);
        if (d < 0.3) continue;
        const along = (ox * dx + oz * dz) / d;
        if (Math.abs(along) < 0.85 || Math.abs(feet[j * 5 + 2] * dx + feet[j * 5 + 3] * dz) < 0.8) continue;
        if (along > 0 && d < df) { df = d; bf = j; }
        if (along < 0 && d < db) { db = d; bb = j; }
      }
    }
    fwd[i] = bf; back[i] = bb;
  }
  // (and the ground between them must admit the work too: a link never bridges a road, a yard or a ditch)
  const links = (i: number, j: number) => {
    if (j < 0 || (fwd[j] !== i && back[j] !== i)) return false;
    const mx = (feet[i * 5] + feet[j * 5]) * 0.5, mz = (feet[i * 5 + 1] + feet[j * 5 + 1]) * 0.5;
    const wallLink = feet[i * 5 + 4] === 0;
    return fieldGate(mx, mz) && !inSolid(mx, mz, wallLink ? 1.0 : 1.5) && !inKeepOut(mx, mz, wallLink ? 1.0 : 1.8)
      && ground._roadDist(mx, mz) >= FIELD_WORKS_ROAD_CORE_M + TOE_M[wallLink ? 0 : 1];
  };
  const edgeA = new Int32Array(count0).fill(-1), edgeB = new Int32Array(count0).fill(-1);
  yield { fine: true, progress: false, stage: 'field-works' };
  for (let i = 0; i < count0; i++) {
    if ((i & 4095) === 4095) yield { fine: true, progress: false, stage: 'field-works' };
    if (links(i, fwd[i])) edgeA[i] = fwd[i];
    if (links(i, back[i])) edgeB[i] = back[i];
  }
  const degree = (i: number) => (edgeA[i] >= 0 ? 1 : 0) + (edgeB[i] >= 0 ? 1 : 0);
  const seen = new Uint8Array(count0);
  const walk = (start: number): number[] => {
    const chain = [start];
    seen[start] = 1;
    let prev = -1, cur = start;
    for (;;) {
      const a = edgeA[cur], b = edgeB[cur];
      const next = a >= 0 && a !== prev && !seen[a] ? a : b >= 0 && b !== prev && !seen[b] ? b : -1;
      if (next < 0) break;
      seen[next] = 1; chain.push(next); prev = cur; cur = next;
    }
    return chain;
  };
  // the chains as point lines (the feet in walk order), the open lines first (from a foot with one link), then any ring
  const lines: Array<{ pts: number[]; wall: boolean }> = [];
  for (const pass of [1, 2]) {
    for (let start = 0; start < count0; start++) {
      if (seen[start] || (pass === 1 && degree(start) !== 1) || degree(start) === 0) continue;
      const chain = walk(start);
      if (chain.length < 2) continue;
      const pts: number[] = [];
      for (const i of chain) pts.push(feet[i * 5], feet[i * 5 + 1]);
      lines.push({ pts, wall: feet[start * 5 + 4] === 0 });
    }
  }
  yield { fine: true, progress: false, stage: 'field-works' };
  trimFieldWorksOvershoots(lines);
  yield { fine: true, progress: false, stage: 'field-works' };

  // walls first, then banks: two groups, the walls on their own stone, the banks on the props rock material
  const wallBuf = newBuffers(), bankBuf = newBuffers();
  const [wh, ws, wl] = options.wallTone ?? [0.11, 0.06, 0.8];
  const [bh, bs, bl] = options.bankTone ?? [0.2, 0.28, 0.24];
  let lineIndex = 0;
  for (const line of lines) {
    if (line.wall) layWall(line.pts, wallBuf); else sweepBank(line.pts, bankBuf);
    if (++lineIndex % 20 === 0) yield { fine: true, progress: false, stage: 'field-works' };
  }

  function newBuffers() {
    return { positions: [] as number[], normals: [] as number[], colors: [] as number[], grounds: [] as number[], uvs: [] as number[], index: [] as number[] };
  }
  type Buffers = ReturnType<typeof newBuffers>;
  type Tone = (p: number[]) => [number, number, number];
  type Uv = (p: number[]) => [number, number];

  /** Vertices of one flat face (its normal given), indexed from `base`. */
  function face(buf: Buffers, pts: number[][], nx: number, ny: number, nz: number, col: Tone, uv: Uv): number {
    const base = buf.positions.length / 3;
    for (const p of pts) {
      buf.positions.push(p[0], p[1], p[2]); buf.normals.push(nx, ny, nz); buf.grounds.push(p[3]);
      const [r, g, bb] = col(p); buf.colors.push(r, g, bb);
      const [u, v] = uv(p); buf.uvs.push(u, v);
    }
    return base;
  }

  /** One triangle, its normal flat, its colour from the tone, its uv as given. */
  function tri(buf: Buffers, a: number[], b: number[], c: number[], col: Tone, uv: Uv): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (!(l > 1e-9)) return; // a degenerate sliver draws nothing
    const base = face(buf, [a, b, c], nx / l, ny / l, nz / l, col, uv);
    buf.index.push(base, base + 1, base + 2);
  }

  /** One quad (a b c d wound as the triangles a b c and a c d), four vertices sharing the normal its diagonals give. */
  function quad(buf: Buffers, a: number[], b: number[], c: number[], d: number[], col: Tone, uv: Uv): void {
    const px = c[0] - a[0], py = c[1] - a[1], pz = c[2] - a[2], qx = d[0] - b[0], qy = d[1] - b[1], qz = d[2] - b[2];
    const nx = py * qz - pz * qy, ny = pz * qx - px * qz, nz = px * qy - py * qx;
    const l = Math.hypot(nx, ny, nz);
    if (!(l > 1e-9)) return;
    const base = face(buf, [a, b, c, d], nx / l, ny / l, nz / l, col, uv);
    buf.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /**
   * A dry-stone wall along a line (the scenery lane, b13; wave 87: "a smooth grey kerb-like strip of even width ...
   * cast concrete rather than a drystone wall"). The line is cut into slots, each a top stone's length (0.32-0.8 m; a
   * phone's 0.8-1.6 m): the faces are battered and a little uneven slot by slot (a stone standing proud here, a course
   * line there), continuous so no crack opens, carrying the face print's courses (fieldWallFace.ts); the crown steps
   * from top stone to top stone, each tipped its own way, the odd one standing high, the odd one low. Along the wall
   * a stretch has fallen in (its upper courses tumbled at its foot), a breach opens here and there with its stones in
   * the gap, the heads are lower, and a fallen stone lies at the foot now and then. Deterministic for the line's place.
   */
  function layWall(pts: number[], buf: Buffers): void {
    const n = pts.length / 2;
    const S = [0];
    for (let k = 1; k < n; k++) S.push(S[k - 1] + Math.hypot(pts[k * 2] - pts[k * 2 - 2], pts[k * 2 + 1] - pts[k * 2 - 1]));
    const L = S[n - 1];
    if (L < 1.0) return;
    // the direction at each point from its neighbours (smooth along the line)
    const dir: number[] = [];
    for (let k = 0; k < n; k++) {
      const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1);
      let dx = pts[b * 2] - pts[a * 2], dz = pts[b * 2 + 1] - pts[a * 2 + 1];
      const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      dir.push(dx, dz);
    }
    let seg = 0;
    const at = (s: number): [number, number, number, number] => {
      while (seg < n - 2 && S[seg + 1] < s) seg++;
      while (seg > 0 && S[seg] > s) seg--;
      const t = Math.min(1, Math.max(0, (s - S[seg]) / Math.max(1e-6, S[seg + 1] - S[seg])));
      const x = pts[seg * 2] + (pts[seg * 2 + 2] - pts[seg * 2]) * t, z = pts[seg * 2 + 1] + (pts[seg * 2 + 3] - pts[seg * 2 + 1]) * t;
      let dx = dir[seg * 2] + (dir[seg * 2 + 2] - dir[seg * 2]) * t, dz = dir[seg * 2 + 1] + (dir[seg * 2 + 3] - dir[seg * 2 + 1]) * t;
      const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      return [x, z, dx, dz];
    };
    const rand = lineRng(pts[0], pts[1], pts[pts.length - 2], pts[pts.length - 1]);
    const mobile = options.mobile;
    const H0 = 0.8 + rand() * 0.12;
    const uFace = rand() * 7, uTop = rand() * 7;
    // the slots, and what each is: whole, fallen in (its height a share of the wall's) or a breach (none)
    type Slot = { s0: number; s1: number; h0: number; h1: number; lean: number; tone: number; kind: 0 | 1 | 2; ridge: number; crest: number };
    const slots: Slot[] = [];
    let s = 0, fallUntil = -1, fallH = 1, breachUntil = -1;
    while (s < L - 1e-3) {
      let len = mobile ? 1.0 + rand() * 1.0 : 0.34 + rand() * 0.5;
      if (L - (s + len) < (mobile ? 0.6 : 0.22)) len = L - s;
      const mid = s + len / 2;
      const inner = s > 2 && L - (s + len) > 2;
      if (inner && s >= fallUntil && s >= breachUntil) {
        const r = rand();
        if (r < len / 55) breachUntil = s + 0.7 + rand() * 0.9;
        else if (r < len / 55 + len / 30) { fallUntil = s + 1.4 + rand() * 2.8; fallH = 0.28 + rand() * 0.27; }
      }
      const kind: 0 | 1 | 2 = s < breachUntil ? 2 : s < fallUntil ? 1 : 0;
      // the height: the wall's, breathing along it, lower toward its heads; a stone standing high, a dip
      const head = Math.min(1, Math.min(mid, L - mid) / 1.2);
      let h = H0 * (0.93 + 0.14 * (noise.noise(mid * 0.09 + pts[0] * 0.01, 3.1) * 0.5 + 0.5)) * (0.72 + 0.28 * head);
      const pick = rand();
      if (kind === 0 && pick < 0.07) h += 0.06 + rand() * 0.05; else if (kind === 0 && pick < 0.13) h -= 0.06 + rand() * 0.07;
      if (kind === 1) h *= fallH * (0.8 + rand() * 0.4);
      const tilt = (rand() - 0.5) * 0.05;
      // (its top rounded: a ridge a little off the wall's middle, 2.5-6 cm above its edges)
      slots.push({ s0: s, s1: s + len, h0: h + tilt, h1: h - tilt, lean: (rand() - 0.5) * 0.04, tone: rand(), kind,
        ridge: (rand() - 0.5) * 0.12, crest: mobile ? 0 : 0.025 + rand() * 0.035 });
      s += len;
    }
    // (a phone's crown is continuous: each slot starts where the last ended, upright, so it draws no step)
    if (mobile) for (let i = 0; i < slots.length; i++) {
      slots[i].lean = 0;
      if (i > 0 && slots[i - 1].kind !== 2 && slots[i].kind !== 2) slots[i].h0 = slots[i - 1].h1;
    }
    // a fallen stretch eases in and out over a slot (the courses step down, not a cliff)
    for (let i = 0; i < slots.length; i++) {
      if (slots[i].kind !== 0) continue;
      const prev = slots[i - 1], next = slots[i + 1];
      if (prev && prev.kind === 1) slots[i].h0 = (slots[i].h0 + prev.h1) / 2;
      if (next && next.kind === 1) slots[i].h1 = (slots[i].h1 + next.h0) / 2;
    }
    // the stations: each slot boundary's centre, direction, half widths and ground (a station is shared by the two
    // slots either side, so the base and the course line are continuous)
    const cache = new Map<number, Station>();
    type Station = { x: number; z: number; ax: number; az: number; hb: number; ht: number; sink: number };
    const station = (sv: number): Station => {
      const key = Math.round(sv * 1e4);
      let st = cache.get(key);
      if (st) return st;
      const [x, z, dx, dz] = at(sv);
      const wob = noise.noise(x * 0.7 + 11.3, z * 0.7 - 4.1);
      const hb = (mobile ? 0.44 : 0.43 + wob * 0.03) + (rand() - 0.5) * 0.03;
      const ht = 0.2 + (rand() - 0.5) * 0.05;
      // the foot sunk into the drawn ground, deeper on a slope (the terrain mesh strays further from its height field)
      const sink = 0.15 + 0.6 * Math.min(0.1, 1 - ground.getNormalAt(x, z).y);
      st = { x, z, ax: -dz, az: dx, hb, ht, sink };
      cache.set(key, st);
      return st;
    };
    // a point of the wall: the station, the side (-1 left, +1 right), the half width, the height over its own ground
    const P = (st: Station, side: number, half: number, above: number): number[] => {
      const px = st.x + st.ax * half * side, pz = st.z + st.az * half * side;
      const g = heightAt(px, pz);
      return [px, g + Math.min(FIELD_WORKS_MAX_M - 0.01, above), pz, g];
    };
    /** A crown point: on the station's batter line (foot hb at -sink to ht at BATTER_H), so every crown at a station
     *  lies on one line and two slots' faces meet along it whatever their heights (no sliver opens between them). */
    const C = (st: Station, side: number, above: number): number[] =>
      P(st, side, st.hb + (st.ht - st.hb) * Math.min(1.15, Math.max(0, (above + st.sink) / (BATTER_H + st.sink))), above);
    const R = (st: Station, across: number, above: number): number[] => {
      const px = st.x + st.ax * across, pz = st.z + st.az * across;
      const g = heightAt(px, pz);
      return [px, g + Math.min(FIELD_WORKS_MAX_M - 0.01, above), pz, g];
    };
    /** A quad turned to face (fx, fz) (a riser between two top stones). */
    const facing = (a: number[], b: number[], c: number[], d: number[], fx: number, fz: number, col: Tone, uv: Uv) => {
      const px = c[0] - a[0], py = c[1] - a[1], pz = c[2] - a[2], qx = d[0] - b[0], qy = d[1] - b[1], qz = d[2] - b[2];
      const nx = py * qz - pz * qy, nz = px * qy - py * qx;
      if (nx * fx + nz * fz < 0) quad(buf, a, d, c, b, col, uv); else quad(buf, a, b, c, d, col, uv);
    };
    const tone = (slotTone: number) => (p: number[]): [number, number, number] => {
      const above = p[1] - p[3];
      const mott = noise.noise(p[0] * 1.3 + 31, p[2] * 1.3 - 17) * 0.5 + 0.5;
      return hsl(wh + (mott - 0.5) * 0.02 + (slotTone - 0.5) * 0.012, ws * (0.8 + mott * 0.4),
        wl * (0.86 + mott * 0.12 + (slotTone - 0.5) * 0.08) * (0.66 + 0.34 * smooth(-0.1, 0.3, above)));
    };
    const fallen = (cx: number, cz: number, size: number, slotTone: number): void => {
      // a fallen stone: a squat, knocked octahedron half sunk where it fell (at most 0.22 m across its plan from its
      // middle: with its offset, every stone lies within 0.86 m of the wall's line)
      const a = size * (0.7 + rand() * 0.3), b = size * (0.55 + rand() * 0.3), c = size * (0.45 + rand() * 0.3);
      const yaw = rand() * Math.PI, cy = Math.cos(yaw), sy = Math.sin(yaw);
      const g0 = heightAt(cx, cz);
      const v = (lx: number, ly: number, lz: number): number[] => {
        const j = 0.85 + rand() * 0.3;
        const x = cx + (lx * cy - lz * sy) * j, z = cz + (lx * sy + lz * cy) * j;
        return [x, g0 - c * 0.4 + ly * j, z, heightAt(x, z)];
      };
      const top = v(0, c, 0), bot = v(0, -c * 0.7, 0), e = v(a, 0, 0), w = v(-a, 0, 0), nn = v(0, 0, b), ss = v(0, 0, -b);
      const col = tone(slotTone * 0.6);
      const uv = (p: number[]): [number, number] => [p[0] / DRY_WALL_TILE_M + uTop, DRY_WALL_CROWN_MID_V + ((p[2] / DRY_WALL_TILE_M) % 0.1)];
      // (its lower half lies under the ground: only the upper faces are drawn)
      void bot;
      for (const [p, q] of [[e, nn], [nn, w], [w, ss], [ss, e]]) tri(buf, top, q, p, col, uv);
    };
    // the face print's uv: along the wall (the left face runs the other way, so the two faces are not one stamp) and
    // up from the sunk foot; the crown's top across its centre line
    const faceUv = (side: number, sv: number, sink: number) => (p: number[]): [number, number] =>
      [side > 0 ? uFace + sv / DRY_WALL_TILE_M : uFace + 0.37 - sv / DRY_WALL_TILE_M, Math.max(0, p[1] - p[3] + sink) / DRY_WALL_TILE_M];
    let piece = false;
    for (let i = 0; i < slots.length; i++) {
      const sl = slots[i];
      if (sl.kind === 2) {
        if (piece) { endFace(slots[i - 1], false); piece = false; }
        // the breach's stones lie in the gap and spill to either side
        if (!mobile || rand() < 0.5) for (let k = 0, m = 1 + Math.floor(rand() * 2); k < m; k++) {
          const [x, z] = at(sl.s0 + rand() * (sl.s1 - sl.s0));
          const st = station(sl.s0);
          const off = (rand() - 0.5) * 1.1;
          fallen(x + st.ax * off, z + st.az * off, 0.12 + rand() * 0.08, sl.tone);
        }
        continue;
      }
      if (!piece) { startFace(sl); piece = true; receipt.wallPieces++; }
      const A = station(sl.s0), B = station(sl.s1);
      const col = tone(sl.tone);
      for (const side of [-1, 1]) {
        const ba = P(A, side, A.hb, -A.sink), bb = P(B, side, B.hb, -B.sink);
        const ca = C(A, side, sl.h0 + side * sl.lean), cb = C(B, side, sl.h1 + side * sl.lean);
        const uvA = faceUv(side, sl.s0, A.sink), uvB = faceUv(side, sl.s1, B.sink);
        const uvOf = (p: number[]) => (p === ba || p === ca ? uvA(p) : uvB(p));
        // (the faces wound outward: the right face (side +1) sees +across)
        const sideQuad = (p0: number[], p1: number[], q1: number[], q0: number[]) => {
          if (side > 0) quad(buf, p0, p1, q1, q0, col, uvOf); else quad(buf, p0, q0, q1, p1, col, uvOf);
        };
        sideQuad(ba, bb, cb, ca);
      }
      // the top stone, and the step up or down to the next one
      const la = C(A, -1, sl.h0 - sl.lean), ra = C(A, 1, sl.h0 + sl.lean);
      const lb = C(B, -1, sl.h1 - sl.lean), rb = C(B, 1, sl.h1 + sl.lean);
      const topUv = (p: number[]): [number, number] => {
        const across = (p[0] - A.x) * A.ax + (p[2] - A.z) * A.az;
        const along = sl.s0 + (p[0] - A.x) * -A.az + (p[2] - A.z) * A.ax;
        return [uTop + along / DRY_WALL_TILE_M, DRY_WALL_CROWN_MID_V + across / DRY_WALL_TILE_M];
      };
      // (the top wound to face up — left at A, right at A, right at B — in two halves either side of its ridge)
      const ka = R(A, sl.ridge, sl.h0 + sl.crest), kb = R(B, sl.ridge, sl.h1 + sl.crest);
      if (sl.crest > 0) { quad(buf, la, ka, kb, lb, col, topUv); quad(buf, ka, ra, rb, kb, col, topUv); }
      else quad(buf, la, ra, rb, lb, col, topUv);
      const nx = slots[i + 1];
      if (nx && nx.kind !== 2) {
        const nl = C(B, -1, nx.h0 - nx.lean), nr = C(B, 1, nx.h0 + nx.lean), nk = R(B, nx.ridge, nx.h0 + nx.crest);
        const rise = (nx.h0 - sl.h1);
        const riserUv = (p: number[]): [number, number] => {
          const across = (p[0] - B.x) * B.ax + (p[2] - B.z) * B.az;
          return [uTop + 0.5 + across / DRY_WALL_TILE_M, DRY_WALL_CROWN_MID_V + 0.08 + (p[1] - p[3]) / DRY_WALL_TILE_M * 0.5];
        };
        // the riser faces the lower top stone: back along the wall when the next one stands higher, ahead when lower
        if (Math.abs(rise) > 0.004) {
          const f = rise > 0 ? -1 : 1, fx = B.az * f, fz = -B.ax * f; // along the wall is (az, -ax) at a station
          facing(lb, kb, nk, nl, fx, fz, col, riserUv); facing(kb, rb, nr, nk, fx, fz, col, riserUv);
        }
      } else {
        endFace(sl, true);
        piece = false;
      }
      receipt.wallM += sl.s1 - sl.s0;
      // the fallen stones: below a fallen stretch two or three a metre on one side, and now and then at a sound foot
      const lenS = sl.s1 - sl.s0;
      const nFallen = sl.kind === 1 ? Math.round(lenS * (mobile ? 1 : 2.4) * (0.6 + rand() * 0.8)) : (!mobile && rand() < lenS * 0.12 ? 1 : 0);
      const fallSide = (Math.floor(sl.s0 * 0.31 + pts[0]) & 1) ? 1 : -1;
      for (let k = 0; k < nFallen; k++) {
        const sv = sl.s0 + rand() * lenS, [x, z] = at(sv), st = station(sl.s0);
        const off = (sl.kind === 1 ? fallSide : rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.14);
        fallen(x + st.ax * off, z + st.az * off, sl.kind === 1 ? 0.1 + rand() * 0.09 : 0.08 + rand() * 0.06, sl.tone);
      }
    }
    if (piece) endFace(slots[slots.length - 1], true);

    /** A wall head: the section's outline at the slot's start (facing back) or end (facing ahead), fanned from its foot. */
    function endFace(sl: Slot, atEnd: boolean): void {
      const st = station(atEnd ? sl.s1 : sl.s0), h = atEnd ? sl.h1 : sl.h0;
      const outline: number[][] = [];
      for (const side of [-1, 1]) {
        const ring = [P(st, side, st.hb, -st.sink), C(st, side, h + side * sl.lean)];
        if (side < 0) outline.push(...ring, R(st, sl.ridge, h + sl.crest)); else outline.push(...ring.reverse());
      }
      // the outline runs left foot, up, across the crown, down to the right foot (fanned from the foot's middle: the
      // start's fan wound to face back along the wall, the end's ahead)
      const centre = [st.x, (outline[0][1] + outline[outline.length - 1][1]) / 2, st.z, heightAt(st.x, st.z)];
      const col = tone(sl.tone);
      const uv = (p: number[]): [number, number] => {
        const across = (p[0] - st.x) * st.ax + (p[2] - st.z) * st.az;
        return [uFace + 0.71 + across / DRY_WALL_TILE_M, Math.max(0, p[1] - p[3] + st.sink) / DRY_WALL_TILE_M];
      };
      for (let k = 0; k + 1 < outline.length; k++) {
        if (atEnd) tri(buf, centre, outline[k], outline[k + 1], col, uv); else tri(buf, centre, outline[k + 1], outline[k], col, uv);
      }
    }
    function startFace(sl: Slot): void { endFace(sl, false); }
  }

  /**
   * Sweep one bank: a section at every point — the foot sunk in the ground, the battered faces, the crown lumpy where
   * the clods lie — welded point to point, its two ends capped facing out; the tone mottled clod by clod, darker at
   * the foot.
   */
  function sweepBank(pts: number[], buf: Buffers): void {
    const halfBase = 1.3, halfTop = 0.5;
    const section: Array<[number, number]> = options.mobile
      ? [[-halfBase, -0.1], [-halfTop, 1.0], [halfTop, 1.0], [halfBase, -0.1]]
      : [[-halfBase, -0.1], [-halfBase * 0.6, 0.55], [-halfTop, 1.0], [halfTop, 1.0], [halfBase * 0.6, 0.55], [halfBase, -0.1]];
    const ns = section.length;
    const rows: number[][][] = [];
    const len = pts.length / 2;
    for (let c = 0; c < len; c++) {
      const x = pts[c * 2], z = pts[c * 2 + 1];
      const pi = Math.max(0, c - 1), ni = Math.min(len - 1, c + 1);
      let dx = pts[ni * 2] - pts[pi * 2], dz = pts[ni * 2 + 1] - pts[pi * 2 + 1];
      const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      const ax = -dz, az = dx;
      const endTaper = Math.min(1, Math.min(c, len - 1 - c) / 1.5) * 0.35 + 0.65;
      const height = 0.78 * (0.82 + 0.36 * (noise.noise(x * 0.11 + 5.1, z * 0.11 - 3.3) * 0.5 + 0.5)) * endTaper;
      const row: number[][] = [];
      for (const [a, b] of section) {
        const lump = b > 0.9 ? noise.noise(x * 2.1 + a * 3, z * 2.1) * 0.06 : noise.noise(x * 1.7 + 9, z * 1.7 + a) * 0.04;
        const px = x + ax * (a + (b > 0 && b < 0.9 ? lump : 0)), pz = z + az * (a + (b > 0 && b < 0.9 ? lump : 0));
        const g = heightAt(px, pz);
        row.push([px, g + Math.min(FIELD_WORKS_MAX_M, b * height + (b > 0.9 ? lump : 0)), pz, g]);
      }
      rows.push(row);
    }
    const col = (p: number[]): [number, number, number] => {
      const above = p[1] - p[3];
      const mott = noise.noise(p[0] * 0.9 + 31, p[2] * 0.9 - 17) * 0.5 + 0.5;
      return hsl(bh + (mott - 0.5) * 0.02, bs * (0.85 + mott * 0.3), bl * (0.72 + mott * 0.36) * (0.62 + 0.38 * smooth(0, 0.3, above)));
    };
    const uv = (p: number[]): [number, number] => [p[0] * 0.37 + p[1] * 0.21, p[2] * 0.37 - p[1] * 0.17];
    for (let c = 0; c + 1 < len; c++) {
      const r0 = rows[c], r1 = rows[c + 1];
      for (let k = 0; k + 1 < ns; k++) { tri(buf, r0[k], r0[k + 1], r1[k], col, uv); tri(buf, r0[k + 1], r1[k + 1], r1[k], col, uv); }
    }
    // the ends: a fan over the section, facing out of the bank (the start back along it, the end ahead)
    const capAt = (r: number[][], atEnd: boolean) => {
      const mx = (r[0][0] + r[ns - 1][0]) / 2, mz = (r[0][2] + r[ns - 1][2]) / 2, mg = (r[0][3] + r[ns - 1][3]) / 2;
      const centre = [mx, mg + 0.05, mz, mg];
      for (let k = 0; k + 1 < ns; k++) { if (atEnd) tri(buf, centre, r[k], r[k + 1], col, uv); else tri(buf, centre, r[k + 1], r[k], col, uv); }
    };
    capAt(rows[0], false);
    capAt(rows[len - 1], true);
    receipt.bankPieces++; receipt.bankM += (len - 1) * 1.4;
  }

  /**
   * The buffers as an indexed geometry: the walls without the rock material's ground and with byte colours. Copied
   * into typed arrays a few hundred thousand values a slice (a map's walls are a million and more vertices).
   */
  function* build(buf: Buffers, wall: boolean): Generator<FieldWorksSlice, THREE.BufferGeometry | null, void> {
    if (!buf.index.length) return null;
    const CHUNK = 400_000;
    function* copy<T extends Float32Array | Uint8Array | Uint32Array>(from: number[], to: T, scale = 0): Generator<FieldWorksSlice, T, void> {
      for (let i = 0; i < from.length; i += CHUNK) {
        const end = Math.min(from.length, i + CHUNK);
        if (scale) for (let k = i; k < end; k++) to[k] = Math.round(Math.min(1, Math.max(0, from[k])) * scale);
        else for (let k = i; k < end; k++) to[k] = from[k];
        yield { fine: true, progress: false, stage: 'field-works' };
      }
      return to;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(yield* copy(buf.positions, new Float32Array(buf.positions.length)), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(yield* copy(buf.normals, new Float32Array(buf.normals.length)), 3));
    g.setAttribute('color', wall
      ? new THREE.BufferAttribute(yield* copy(buf.colors, new Uint8Array(buf.colors.length), 255), 3, true)
      : new THREE.BufferAttribute(yield* copy(buf.colors, new Float32Array(buf.colors.length)), 3));
    if (!wall) g.setAttribute('aRockGround', new THREE.BufferAttribute(yield* copy(buf.grounds, new Float32Array(buf.grounds.length)), 1));
    g.setAttribute('uv', new THREE.BufferAttribute(yield* copy(buf.uvs, new Float32Array(buf.uvs.length)), 2));
    g.setIndex(new THREE.BufferAttribute(yield* copy(buf.index, new Uint32Array(buf.index.length)), 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    receipt.triangles += buf.index.length / 3;
    return g;
  }
  yield { fine: true, progress: false, stage: 'field-works' };
  const wallGeometry = yield* build(wallBuf, true);
  const bankGeometry = yield* build(bankBuf, false);
  return { geometry: wallGeometry ?? bankGeometry, wallGeometry, bankGeometry, receipt };
}

/** A line's own stream: seeded by its two ends' places (never by the order the scan walked it). */
function lineRng(x0: number, z0: number, x1: number, z1: number): () => number {
  const qa = Math.round(x0 * 100) * 73856093 ^ Math.round(z0 * 100) * 19349663;
  const qb = Math.round(x1 * 100) * 83492791 ^ Math.round(z1 * 100) * 2971215073;
  let a = (Math.min(qa, qb) * 31 + Math.max(qa, qb)) | 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * The stubs cut back (wave 87, Saltwind corner-ne: a wall ran on two metres through the wall it met and ended in the
 * open): a line whose end runs through another line within FIELD_WORKS_STUB_M of that end is cut where it crosses, so
 * the two meet in a T (its head inside the other wall), not an X with a stub.
 */
const FIELD_WORKS_STUB_M = 3.5;
export function trimFieldWorksOvershoots(lines: Array<{ pts: number[]; wall: boolean }>): void {
  const CELL = 4, segs = new Map<number, number[]>(); // line index, segment index
  const key = (cx: number, cz: number) => (cx + 1024) * 4096 + (cz + 1024);
  lines.forEach((line, li) => {
    const p = line.pts;
    for (let k = 0; k + 3 < p.length; k += 2) {
      const x0 = Math.floor(Math.min(p[k], p[k + 2]) / CELL), x1 = Math.floor(Math.max(p[k], p[k + 2]) / CELL);
      const z0 = Math.floor(Math.min(p[k + 1], p[k + 3]) / CELL), z1 = Math.floor(Math.max(p[k + 1], p[k + 3]) / CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const list = segs.get(key(cx, cz)); if (list) list.push(li, k); else segs.set(key(cx, cz), [li, k]);
      }
    }
  });
  const cross = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): number => {
    const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz, den = rx * sz - rz * sx;
    if (Math.abs(den) < 1e-9) return -1;
    const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den;
    return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6 ? t : -1;
  };
  const orig = lines.map((line) => line.pts.slice());
  lines.forEach((line, li) => {
    for (const atEnd of [false, true]) {
      const p = line.pts, n = p.length / 2;
      if (n < 3) return;
      // walk in from the end over the stub's reach: the first crossing of another line
      let run = 0;
      for (let step = 0; step < n - 1 && run < FIELD_WORKS_STUB_M; step++) {
        const a = atEnd ? n - 1 - step : step, b = atEnd ? a - 1 : a + 1;
        const ax = p[a * 2], az = p[a * 2 + 1], bx = p[b * 2], bz = p[b * 2 + 1];
        const segLen = Math.hypot(bx - ax, bz - az);
        let best = -1;
        for (let cx = Math.floor(Math.min(ax, bx) / CELL); cx <= Math.floor(Math.max(ax, bx) / CELL); cx++) {
          for (let cz = Math.floor(Math.min(az, bz) / CELL); cz <= Math.floor(Math.max(az, bz) / CELL); cz++) {
            const list = segs.get(key(cx, cz));
            if (!list) continue;
            for (let q = 0; q < list.length; q += 2) {
              if (list[q] === li) continue;
              const o = orig[list[q]], k = list[q + 1];
              const t = cross(ax, az, bx, bz, o[k], o[k + 1], o[k + 2], o[k + 3]);
              if (t >= 0 && (best < 0 || t < best)) best = t;
            }
          }
        }
        if (best >= 0 && run + best * segLen < FIELD_WORKS_STUB_M) {
          // cut here: the end becomes the crossing (its head inside the other wall)
          const cx = ax + (bx - ax) * best, cz = az + (bz - az) * best;
          const keep = atEnd ? p.slice(0, (a) * 2) : p.slice((a + 1) * 2);
          line.pts = atEnd ? [...keep, cx, cz] : [cx, cz, ...keep];
          break;
        }
        run += segLen;
      }
    }
  });
}
