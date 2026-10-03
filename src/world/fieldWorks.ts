// src/world/fieldWorks.ts — the field boundaries' built works (the scenery lane, 2026-10-03; the coordinator: the
// ground lane's land use marks a map's field boundaries — landUse.ts landUseAt: boundary 0 margin, 1 ditch, 2 bund,
// 3 wall, edgeM the distance to the field's edge). The karst's dry stone walls stand on the grid's wall boundaries and
// a bocage's hedge lines get their earth banks, on the same layout the terrain draws (the boundary band, the same field
// gate: off the villages, the roads, the water and the slopes), so a wall stands exactly where the ground shows its
// footing. They are decor: a low rubble wall or a bank is crossed, not cover — no collision (should they ever matter in
// play they become crushable like the fences, never blocking), no taller than a metre, kept off the roads, the bridges
// and their approaches, the aprons and yards, every mode's objective discs and the spawn pads (the maps lane owns the
// layouts these keep clear); one welded mesh on the props rock material, casting no shadow.
//
// The land use reaches the props through the height field's hook (`_landUseAt`, terrain.ts), so this module imports
// nothing of it; a map without a field system, or a world built without the hook, builds nothing.
import * as THREE from 'three';
import type { SimplexNoise } from '../engine/simplexFast.ts';

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

const SQUARE = 466;
/** The spawn pads' flat (terrain.ts levels a pad out to 22 m) and a berth. */
const SPAWN_CLEAR = 24;
/** The road's painted core at its widest (terrain.ts: a 3.85 m half width and its edge noise): a work's toe stays out. */
const FIELD_WORKS_ROAD_CORE_M = 5.7;
/** A work's half width at its toe (the swept section's base, with its lump), wall and bank. */
const TOE_M = [0.52, 1.36] as const;

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
): Generator<FieldWorksSlice, { geometry: THREE.BufferGeometry | null; receipt: FieldWorksReceipt }, void> {
  const receipt: FieldWorksReceipt = { wallPieces: 0, bankPieces: 0, wallM: 0, bankM: 0, triangles: 0, scanned: 0 };
  const landAt = ground._landUseAt;
  if (!landAt || (!options.walls && !options.banks)) return { geometry: null, receipt };
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
      if (!fieldGate(fx, fz) || inSolid(fx, fz, wall ? 0.7 : 1.5) || inKeepOut(fx, fz, wall ? 1.0 : 1.8)) continue;
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
    return fieldGate(mx, mz) && !inSolid(mx, mz, wallLink ? 0.7 : 1.5) && !inKeepOut(mx, mz, wallLink ? 1.0 : 1.8)
      && ground._roadDist(mx, mz) >= FIELD_WORKS_ROAD_CORE_M + TOE_M[wallLink ? 0 : 1];
  };
  const edgeA = new Int32Array(count0).fill(-1), edgeB = new Int32Array(count0).fill(-1);
  for (let i = 0; i < count0; i++) {
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
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], grounds: number[] = [], uvs: number[] = [];
  const [wh, ws, wl] = options.wallTone ?? [0.11, 0.07, 0.62];
  const [bh, bs, bl] = options.bankTone ?? [0.2, 0.28, 0.24];
  let chainIndex = 0;
  // the open lines first (from a foot with one link), then any closed ring
  for (const pass of [1, 2]) {
    for (let start = 0; start < count0; start++) {
      if (seen[start] || (pass === 1 && degree(start) !== 1) || degree(start) === 0) continue;
      const chain = walk(start);
      if (chain.length < 2) continue;
      sweep(chain, feet[start * 5 + 4] === 0);
      if (++chainIndex % 200 === 0) yield { fine: true, progress: false, stage: 'field-works' };
    }
  }

  /**
   * Sweep one chain: a section at every foot — the foot sunk in the ground, the battered faces, the crown lumpy where
   * the stones lie — welded station to station, the two ends capped; the tone mottled stone by stone (a wall) or clod
   * by clod (a bank), darker at the foot.
   */
  function sweep(chain: number[], wall: boolean): void {
    const halfBase = wall ? 0.46 : 1.3, halfTop = wall ? 0.2 : 0.5;
    const [h, sat, lum] = wall ? [wh, ws, wl] : [bh, bs, bl];
    // (a phone's section drops the shoulders: four points, three faces)
    const section: Array<[number, number]> = options.mobile
      ? (wall ? [[-halfBase, -0.12], [-halfTop, 1.0], [halfTop, 1.0], [halfBase, -0.12]] : [[-halfBase, -0.1], [-halfTop, 1.0], [halfTop, 1.0], [halfBase, -0.1]])
      : wall
        ? [[-halfBase, -0.12], [-halfBase * 0.86, 0.45], [-halfTop, 1.0], [halfTop, 1.0], [halfBase * 0.86, 0.45], [halfBase, -0.12]]
        : [[-halfBase, -0.1], [-halfBase * 0.6, 0.55], [-halfTop, 1.0], [halfTop, 1.0], [halfBase * 0.6, 0.55], [halfBase, -0.1]];
    const n = section.length;
    const rows: number[][] = [];
    const len = chain.length;
    for (let c = 0; c < len; c++) {
      const i = chain[c];
      const x = feet[i * 5], z = feet[i * 5 + 1];
      // the line's direction from the neighbours (smooth along the chain), across square to it
      const pi = chain[Math.max(0, c - 1)], ni = chain[Math.min(len - 1, c + 1)];
      let dx = feet[ni * 5] - feet[pi * 5], dz = feet[ni * 5 + 1] - feet[pi * 5 + 1];
      const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      const ax = -dz, az = dx;
      // the height breathes along the wall (stones fallen here, a high stretch there), lower toward a chain's ends
      const endTaper = Math.min(1, Math.min(c, len - 1 - c) / 1.5) * 0.35 + 0.65;
      // and stone by stone the crown is broken: a station's own jitter (a hash of its place, not of the walk's order)
      const hash = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453, jag = hash - Math.floor(hash);
      const height = (wall ? 0.62 : 0.78) * (0.82 + 0.36 * (noise.noise(x * 0.11 + 5.1, z * 0.11 - 3.3) * 0.5 + 0.5)) * endTaper
        * (wall ? 0.88 + 0.24 * jag : 1);
      const row: number[] = [];
      for (const [a, b] of section) {
        const lump = b > 0.9 ? noise.noise(x * 2.1 + a * 3, z * 2.1) * (wall ? 0.09 : 0.06) : noise.noise(x * 1.7 + 9, z * 1.7 + a) * (wall ? 0.05 : 0.04);
        const px = x + ax * (a + (b > 0 && b < 0.9 ? lump : 0)), pz = z + az * (a + (b > 0 && b < 0.9 ? lump : 0));
        const g = heightAt(px, pz);
        // the crown never stands above FIELD_WORKS_MAX_M over its own ground
        row.push(px, g + Math.min(FIELD_WORKS_MAX_M, b * height + (b > 0.9 ? lump : 0)), pz, g);
      }
      rows.push(row);
    }
    const tri = (a: number[], b: number[], c: number[]) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      for (const p of [a, b, c]) {
        positions.push(p[0], p[1], p[2]); normals.push(nx, ny, nz); grounds.push(p[3]);
        const above = p[1] - p[3];
        const mott = noise.noise(p[0] * (wall ? 1.6 : 0.9) + 31, p[2] * (wall ? 1.6 : 0.9) - 17) * 0.5 + 0.5;
        const [r, gg, bb] = hsl(h + (mott - 0.5) * 0.02, sat * (0.85 + mott * 0.3), lum * (0.72 + mott * 0.36) * (0.62 + 0.38 * smooth(0, 0.3, above)));
        colors.push(r, gg, bb);
        uvs.push(p[0] * 0.37 + p[1] * 0.21, p[2] * 0.37 - p[1] * 0.17);
      }
    };
    const P = (r: number[], k: number) => [r[k * 4], r[k * 4 + 1], r[k * 4 + 2], r[k * 4 + 3]];
    for (let c = 0; c + 1 < len; c++) {
      const r0 = rows[c], r1 = rows[c + 1];
      for (let k = 0; k + 1 < n; k++) { const a = P(r0, k), b = P(r0, k + 1), cc = P(r1, k), d = P(r1, k + 1); tri(a, b, cc); tri(b, d, cc); }
    }
    // the ends: a fan over the section, facing out of the chain
    const capAt = (r: number[], flip: boolean) => {
      const mx = (r[0] + r[(n - 1) * 4]) / 2, mz = (r[2] + r[(n - 1) * 4 + 2]) / 2, mg = (r[3] + r[(n - 1) * 4 + 3]) / 2;
      const centre = [mx, mg + 0.05, mz, mg];
      for (let k = 0; k + 1 < n; k++) { const a = P(r, k), b = P(r, k + 1); if (flip) tri(centre, b, a); else tri(centre, a, b); }
    };
    capAt(rows[0], false);
    capAt(rows[len - 1], true);
    if (wall) { receipt.wallPieces++; receipt.wallM += (len - 1) * 1.4; } else { receipt.bankPieces++; receipt.bankM += (len - 1) * 1.4; }
  }
  const count = positions.length / 3;
  if (!count) return { geometry: null, receipt };
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('aRockGround', new THREE.Float32BufferAttribute(grounds, 1));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeBoundingBox(); g.computeBoundingSphere();
  receipt.triangles = count / 3;
  return { geometry: g, receipt };
}
