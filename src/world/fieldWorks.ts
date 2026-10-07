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
// (b29; wave 184 on Saltmere Bay, both critics: "no hedge or bank silhouette anywhere", "flat, hard-edged colour
// changes"; the coordinator: "turf-toned with stone showing at the foot, casting shadow"; mr4, the maps owner: decor, its
// crest a metre at most wherever a hull can meet it, the hedge on top carrying the line) a bocage bank is the talus of
// the Pays de Leon: an earth bank up to a metre high (a map's own height, `bankHeightM`), faced at its foot with the
// field's granite, turfed over its flanks and crown. Its body is the ground's own (the terrain material draws it, as it
// draws the boulders' beds: the field's turf on the bank, the ground's earth and rock layer on the stone-faced foot,
// whose normals stay steep) and it casts; the odd granite block of the facing stands proud along each foot on the props
// rock material.
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
import { DRY_WALL_CROWN_MID_V, DRY_WALL_STONE_MID_V, DRY_WALL_TILE_M } from './fieldWallFace.ts';
import { layDryStoneFaceSteps, type DryStoneFaceStone } from './dryStoneCourses.ts';

/** The land-use sample fields this pass reads (landUse.ts LandFieldSample). */
interface FieldSample { active: number; edgeM: number; boundary: number; track: number; hedge: number }

interface FieldWorksGround {
  getHeightAt(x: number, z: number): number;
  getHeightAtFast?(x: number, z: number): number;
  getNormalAt(x: number, z: number): { x?: number; y: number; z?: number };
  /** (b29) The ground's fold (-1 crest .. +1 hollow, terrain.ts), the ground material's moisture and occlusion read it. */
  _foldAt?(x: number, z: number): number;
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

/** The tallest a field wall stands above its own ground (m): a low wall, never the cover the game gives. */
const FIELD_WORKS_MAX_M = 1.0;
/**
 * (b29) The tallest a bank's crown stands above its own ground (m): decor, no collision, so never over the metre a hull
 * drives over unremarked (mr4); a map's own height (`bankHeightM`) is clamped to it.
 */
export const BANK_MAX_M = FIELD_WORKS_MAX_M;
/** (b29) A bank's crown when its map names no height (m): Saltmere's talus. */
export const BANK_HEIGHT_M = 1.0;
/**
 * (b29) The bank's section, one foot over the crown to the other: across (m), height and whether the point is the stone
 * facing's (a facing point's height in metres, the turf's a share of the bank's height). The toe runs under the ground;
 * the facing stands near upright to its top; the turf's flank, shoulder and crown above it.
 */
// (the crown rounded, the coordinator: no ridge and no flat top a hull's lower edge would read against)
const BANK_SECTION: ReadonlyArray<readonly [number, number, boolean]> = [
  [-1.62, -0.22, true], [-1.5, 0.3, true], [-1.16, 0.58, false], [-0.8, 0.82, false], [-0.42, 0.96, false], [0, 1, false],
  [0.42, 0.96, false], [0.8, 0.82, false], [1.16, 0.58, false], [1.5, 0.3, true], [1.62, -0.22, true],
];
/** (b29) The phones' section: the flank, the shoulder and the crown's round on fewer points. */
const BANK_SECTION_MOBILE: ReadonlyArray<readonly [number, number, boolean]> = [
  [-1.62, -0.22, true], [-1.5, 0.3, true], [-0.95, 0.72, false], [-0.4, 0.96, false], [0.4, 0.96, false], [0.95, 0.72, false],
  [1.5, 0.3, true], [1.62, -0.22, true],
];
/** (b29) How far the turf's normals turn back toward the ground's: its flanks lit and layered as the field round it. */
const BANK_TURF_NORMAL = 0.55;

/**
 * (b29) The banks' crest law, pure, for the vegetation tier (the trees lane seats gorse and blackthorn on a bank's crown):
 * a land-use sample on a bocage bank's line — a hedged margin, no track — as the field works read it.
 */
export function isFieldBankSample(s: { boundary: number; hedge: number; edgeM: number; track: number }): boolean {
  return s.boundary === 0 && s.hedge > 0.85 && s.edgeM < 1.1 && s.track < 0.5;
}

/** A smooth value noise in 0..1 on an 11 m lattice, by place alone (the crown's breath: the same for every reader). */
function bankBreath(x: number, z: number): number {
  const fx = x / 11, fz = z / 11, x0 = Math.floor(fx), z0 = Math.floor(fz), tx = fx - x0, tz = fz - z0;
  const h = (i: number, k: number): number => ((Math.imul(i * 0x27d4eb2d ^ k * 0x165667b1, 0x85ebca6b) ^ Math.imul(k + 0x3c6ef372, i - 0x61c88647)) >>> 0) / 4294967296;
  const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
  const a = h(x0, z0), b = h(x0 + 1, z0), c = h(x0, z0 + 1), d = h(x0 + 1, z0 + 1);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sz;
}

/**
 * (b29) A bank's crown over its own ground at a place on its line (m), before its ends draw down: 0.86 to 1 of its map's
 * height (`heightM`, BANK_HEIGHT_M by default, clamped to BANK_MAX_M), breathing along the bank.
 */
export function fieldBankCrownAt(x: number, z: number, heightM = BANK_HEIGHT_M): number {
  return Math.min(BANK_MAX_M, heightM) * (0.86 + 0.14 * bankBreath(x, z));
}

/**
 * (b29) The banks as built, for the vegetation tier: every row of every bank's line — its place, its crown's height in the
 * world (its ends drawn down, every cut the layout made), the line's direction there — five floats a row; `lines` the
 * first row of each line and, last, the row count.
 */
export interface FieldBankCrests { points: Float32Array; lines: Uint32Array }
/** A wall's batter: its faces run from the foot's half width to the crown's at this height over the ground (m). */
const BATTER_H = 0.9;
/** (b17) How far the body's faces stand back behind the stones laid over them: the dry joints' depth (m). */
const JOINT_DEPTH = 0.045;
/** (b17) The body's faces seen in a joint: the stone's colour this much darker (a dry joint is the dark between stones). */
const JOINT_SHADE = 0.4;

interface FieldWorksOptions {
  walls: boolean;
  banks: boolean;
  spawns: ReadonlyArray<{ x: number; z: number }>;
  /** The hard solids already placed (buildings, walls, rock masses): a wall or a bank never runs through one. */
  solids?: readonly FieldWorksSolid[];
  /** The layout's aprons, yards, bridges, trenches and objective discs. */
  keepOut?: FieldWorksKeepOut;
  mobile: boolean;
  /** sRGB HSL base tones of the wall stone and the bank's earth (b29: the bank's body is the ground's own and its facing
   * the field's granite; the earth tone no longer reads). */
  wallTone?: readonly [number, number, number];
  bankTone?: readonly [number, number, number];
  /** (b29) The banks' crown over their ground (m): BANK_HEIGHT_M by default, at most BANK_MAX_M. */
  bankHeightM?: number;
  /** Also merge the walls' cells into one near and one far geometry (the receipts read them whole). */
  merged?: boolean;
}

export interface FieldWorksReceipt {
  wallPieces: number;
  bankPieces: number;
  /** Approximate lengths laid (m); a 'piece' is one swept chain. */
  wallM: number;
  bankM: number;
  /** The walls' near form (every cell) and the banks. */
  triangles: number;
  /** The walls' far form (every cell). */
  farTriangles: number;
  /** The cells the walls are laid in (FIELD_WALL_CELL_M square). */
  cells: number;
  scanned: number;
}

/** The side of a wall cell (m): its near form shows within a quality's near distance of the camera, its far form past it. */
export const FIELD_WALL_CELL_M = 64;

/** A wall cell: its box (both forms) and its near and far forms (a cell holding only a breach's stones has no far form). */
export interface FieldWallCell {
  box: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  near: THREE.BufferGeometry | null;
  far: THREE.BufferGeometry | null;
  /** (b17) The cell's key: buildFieldWallFine builds its stone form by it. */
  key: number;
}

/** (b17) What a cell's stone form is rebuilt from when the camera comes near (buildFieldWallFine): the wall lines, the
 * lines that touch each cell, and what they were laid against. */
export interface FieldWallFineSource {
  lines: number[][];
  cellLines: Map<number, number[]>;
  env: Omit<WallEnv, 'stones' | 'receipt'>;
}

/** The key of the wall cell holding a point (FIELD_WALL_CELL_M square). */
function wallCellKey(x: number, z: number): number {
  return (Math.floor(x / FIELD_WALL_CELL_M) + 512) * 1024 + (Math.floor(z / FIELD_WALL_CELL_M) + 512);
}

type FieldWorksSlice = { fine: true; progress: false; stage: string };

/** What the works build: the walls (the dry-stone print's) and the banks (the rock material's); `geometry` is the one there is. */
export interface FieldWorksBuilt {
  /** The merged walls' near form when asked for (options.merged), else the banks. */
  geometry: THREE.BufferGeometry | null;
  /** The walls by cell. */
  wallCells: FieldWallCell[];
  /** The merged walls, near and far, when asked for (options.merged). */
  wallGeometry: THREE.BufferGeometry | null;
  wallFarGeometry: THREE.BufferGeometry | null;
  /** The banks' facing stones (the rock material's). */
  bankGeometry: THREE.BufferGeometry | null;
  /** (b29) The banks' body, for the ground's own material: position, normal and the ground's fold, world space. */
  bankTurfGeometry: THREE.BufferGeometry | null;
  /** (b29) The banks' crests as built (null without banks). */
  bankCrests: FieldBankCrests | null;
  receipt: FieldWorksReceipt;
  /** (b17) The source of the cells' stone forms (desktop; null on a phone or without walls). */
  fine: FieldWallFineSource | null;
}

const SQUARE = 466;
/** The spawn pads' flat (terrain.ts levels a pad out to 22 m) and a berth. */
const SPAWN_CLEAR = 24;
/** The road's painted core at its widest (terrain.ts: a 3.85 m half width and its edge noise): a work's toe stays out. */
const FIELD_WORKS_ROAD_CORE_M = 5.7;
/** A work's half width at its toe (a wall's fallen stones lie up to 0.87 m out; a bank's base with its lump). */
const TOE_M = [0.9, 1.7] as const;

function smooth(a: number, b: number, x: number): number { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

const _c = new THREE.Color();
function hsl(h: number, s: number, l: number): [number, number, number] {
  _c.setHSL(((h % 1) + 1) % 1, Math.min(1, Math.max(0, s)), Math.min(1, Math.max(0, l)), THREE.SRGBColorSpace);
  return [_c.r, _c.g, _c.b];
}

function newBuffers() {
  return { positions: [] as number[], normals: [] as number[], colors: [] as number[], grounds: [] as number[], uvs: [] as number[], index: [] as number[] };
}
type Buffers = ReturnType<typeof newBuffers>;
type Tone = (p: number[]) => [number, number, number];
type Uv = (p: number[]) => [number, number];
/** (b17) Where a cell's stone form sends what falls in another cell: nothing is computed into it, nothing kept. */
const NULL_BUF: Buffers = newBuffers();
/** (b17) The point a dry pass hands back (its slot laid into NULL_BUF: no ground sampled). */
const DRY_POINT: readonly number[] = [0, 0, 0, 0];

/** Vertices of one flat face (its normal given), indexed from `base`. */
function face(buf: Buffers, pts: number[][], nx: number, ny: number, nz: number, col: Tone, uv: Uv): number {
  if (buf === NULL_BUF) return 0;
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
  if (buf === NULL_BUF) return;
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz);
  if (!(l > 1e-9)) return; // a degenerate sliver draws nothing
  const base = face(buf, [a, b, c], nx / l, ny / l, nz / l, col, uv);
  buf.index.push(base, base + 1, base + 2);
}

/**
 * (b17) A stone's face: a fan from its swelling middle to its corners, the normals smooth — the middle's the face's, each
 * corner's turned out toward its own corner — so the face reads as a rounded stone, not four facets. `n` the face's
 * outward normal; the triangles wound to face it.
 */
function stoneFan(buf: Buffers, mid: number[], ring: number[][], n: readonly [number, number, number], col: Tone, uv: Uv, round = 0.32): void {
  if (buf === NULL_BUF) return;
  const base = buf.positions.length / 3;
  const push = (p: number[], nx: number, ny: number, nz: number) => {
    buf.positions.push(p[0], p[1], p[2]); buf.normals.push(nx, ny, nz); buf.grounds.push(p[3]);
    const [r, g, b] = col(p); buf.colors.push(r, g, b);
    const [u, v] = uv(p); buf.uvs.push(u, v);
  };
  push(mid, n[0], n[1], n[2]);
  for (const p of ring) {
    let dx = p[0] - mid[0], dy = p[1] - mid[1], dz = p[2] - mid[2];
    const along = dx * n[0] + dy * n[1] + dz * n[2]; dx -= along * n[0]; dy -= along * n[1]; dz -= along * n[2]; // (in the face's plane)
    const l = Math.hypot(dx, dy, dz) || 1;
    let nx = n[0] + round * dx / l, ny = n[1] + round * dy / l, nz = n[2] + round * dz / l;
    const m = Math.hypot(nx, ny, nz) || 1; nx /= m; ny /= m; nz /= m;
    push(p, nx, ny, nz);
  }
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k], b = ring[(k + 1) % ring.length];
    const ux = a[0] - mid[0], uy = a[1] - mid[1], uz = a[2] - mid[2], vx = b[0] - mid[0], vy = b[1] - mid[1], vz = b[2] - mid[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const i = base + 1 + k, j = base + 1 + ((k + 1) % ring.length);
    if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) buf.index.push(base, i, j); else buf.index.push(base, j, i);
  }
}

/** One quad (a b c d wound as the triangles a b c and a c d), four vertices sharing the normal its diagonals give. */
function quad(buf: Buffers, a: number[], b: number[], c: number[], d: number[], col: Tone, uv: Uv): void {
  if (buf === NULL_BUF) return;
  const px = c[0] - a[0], py = c[1] - a[1], pz = c[2] - a[2], qx = d[0] - b[0], qy = d[1] - b[1], qz = d[2] - b[2];
  const nx = py * qz - pz * qy, ny = pz * qx - px * qz, nz = px * qy - py * qx;
  const l = Math.hypot(nx, ny, nz);
  if (!(l > 1e-9)) return;
  const base = face(buf, [a, b, c, d], nx / l, ny / l, nz / l, col, uv);
  buf.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
}


/** (b17) What a wall is laid against: the ground, the noise, the receipt, the tone, and whether it is laid stone by stone. */
interface WallEnv {
  ground: FieldWorksGround;
  noise: SimplexNoise;
  heightAt: (x: number, z: number) => number;
  receipt: FieldWorksReceipt;
  wallTone: readonly [number, number, number];
  mobile: boolean;
  /** The stone form (a cell's near form when the camera comes near: buildFieldWallFine), else the mid and far forms. */
  stones: boolean;
  /** (b17) The one cell the stone form is laid for: a stone, a through-stone or a slab elsewhere draws its randoms (so
   *  every stone is the same whichever cell is laid) and is never computed. */
  only?: number;
}

/** A piece's own stream for its stones: seeded by the line's start and the piece's first slot. */
function pieceRng(x0: number, z0: number, first: number): () => number {
  let a = (Math.round(x0 * 100) * 73856093 ^ Math.round(z0 * 100) * 19349663 ^ Math.imul(first + 1, 0x9e3779b1)) | 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
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
function* layWall(env: WallEnv, pts: number[], cellOf: (x: number, z: number, coarse: boolean) => Buffers): Generator<FieldWorksSlice, void, void> {
  const { ground, noise, heightAt, receipt } = env;
  const [wh, ws, wl] = env.wallTone;
  const stones = env.stones;
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
  const mobile = env.mobile;
  // (the near form is laid into the cell of each slot's middle, the far form into its segment's: buf is the current one)
  let buf: Buffers = cellOf(pts[0], pts[1], false);
  const slotCell = (s0: number, s1: number, coarse: boolean): Buffers => { const [x, z] = at((s0 + s1) / 2); return cellOf(x, z, coarse); };
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
    // (b26; wave 177: "smooth round-topped extrusions … a ragged head": a top stone standing high or sitting low one
    // slot in three, not one in eight, so the crown's skyline breaks along the wall in every form)
    if (kind === 0 && pick < 0.17) h += 0.05 + rand() * 0.06; else if (kind === 0 && pick < 0.33) h -= 0.05 + rand() * 0.07;
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
  type Station = { x: number; z: number; ax: number; az: number; hb: number; ht: number; hm: number; sink: number };
  const station = (sv: number): Station => {
    const key = Math.round(sv * 1e4);
    let st = cache.get(key);
    if (st) return st;
    const [x, z, dx, dz] = at(sv);
    const wob = noise.noise(x * 0.7 + 11.3, z * 0.7 - 4.1);
    // (b14, wave 97: "extruded kerbs": the wall's width and batter wander station by station, and its faces bulge
    // where a stone stands proud or sag where one has settled)
    const hb = (mobile ? 0.44 : 0.43 + wob * 0.04) + (rand() - 0.5) * 0.08;
    const ht = 0.2 + (rand() - 0.5) * 0.08;
    const hm = (hb + ht) / 2 + (rand() - 0.5) * 0.07;
    // the foot sunk into the drawn ground, deeper on a slope (the terrain mesh strays further from its height field)
    const sink = 0.15 + 0.6 * Math.min(0.1, 1 - ground.getNormalAt(x, z).y);
    st = { x, z, ax: -dz, az: dx, hb, ht, hm, sink };
    cache.set(key, st);
    return st;
  };
  // a point of the wall: the station, the side (-1 left, +1 right), the half width, the height over its own ground
  const P = (st: Station, side: number, half: number, above: number): number[] => {
    if (buf === NULL_BUF) return DRY_POINT as number[];
    const px = st.x + st.ax * half * side, pz = st.z + st.az * half * side;
    const g = heightAt(px, pz);
    return [px, g + Math.min(FIELD_WORKS_MAX_M - 0.01, above), pz, g];
  };
  /** A crown point: on the station's batter line (foot hb at -sink to ht at BATTER_H), so every crown at a station
   *  lies on one line and two slots' faces meet along it whatever their heights (no sliver opens between them). */
  const C = (st: Station, side: number, above: number, inset = 0): number[] =>
    P(st, side, st.hb + (st.ht - st.hb) * Math.min(1.15, Math.max(0, (above + st.sink) / (BATTER_H + st.sink))) - inset, above);
  const R = (st: Station, across: number, above: number): number[] => {
    if (buf === NULL_BUF) return DRY_POINT as number[];
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
    const dry = buf === NULL_BUF; // (its draws taken all the same)
    const g0 = dry ? 0 : heightAt(cx, cz);
    const v = (lx: number, ly: number, lz: number): number[] => {
      const j = 0.85 + rand() * 0.3;
      const x = cx + (lx * cy - lz * sy) * j, z = cz + (lx * sy + lz * cy) * j;
      return [x, g0 - c * 0.4 + ly * j, z, dry ? 0 : heightAt(x, z)];
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
  // (b17; gauntlet wave 121, Saltwind: "a smooth extruded strip with a blue-grey crazy-paving texture", "mortared, not
  // dry-stone"; "dry-stone needs individual stones with gaps, a batter and a coping") the near form is built stone by
  // stone (layStones, below): the body's faces stand back as the dark of the dry joints, the stones laid over them.
  // (b26) A whole slot's body stands a top stone's height under the wall's crown — its crown of rubble top stones
  // reaches the crown the mid form draws — and the body shows the rubble core (the print's crown band, darkened) in the
  // joints; the far form and the phones' walls keep the swept body. (The draws are the line's, taken in both forms.)
  const topDraws = slots.map((sl) => (sl.kind === 0 ? 0.18 + rand() * 0.07 : 0));
  const TOP = stones ? topDraws : null;
  const body = (k: number): Slot => (TOP && TOP[k] > 0
    ? { ...slots[k], h0: slots[k].h0 - TOP[k] * 0.5, h1: slots[k].h1 - TOP[k] * 0.5, crest: 0, ridge: 0 } : slots[k]);
  const inset = stones ? JOINT_DEPTH : 0;
  /** (b26) The rubble core's uv (the print's crown band) on a body face seen in the joints and on a head. */
  const coreUv = (u: number, above: number): [number, number] =>
    [u, DRY_WALL_CROWN_MID_V + Math.max(-0.075, Math.min(0.075, (above - 0.45) * 0.5 / DRY_WALL_TILE_M))];
  let piece = false, pieceFirst = 0;
  for (let i = 0; i < slots.length; i++) {
    if (stones && i % 24 === 23) yield { fine: true, progress: false, stage: 'field-wall-stones' };
    const sl = body(i);
    if (sl.kind === 2) {
      // (the piece before a breach closed with its head at its last slot, below)
      buf = slotCell(sl.s0, sl.s1, false);
      // the breach's stones lie in the gap and spill to either side
      if (!mobile || rand() < 0.5) for (let k = 0, m = 1 + Math.floor(rand() * 2); k < m; k++) {
        const [x, z] = at(sl.s0 + rand() * (sl.s1 - sl.s0));
        const st = station(sl.s0);
        const off = (rand() - 0.5) * 1.1;
        fallen(x + st.ax * off, z + st.az * off, 0.12 + rand() * 0.08, sl.tone);
      }
      continue;
    }
    buf = slotCell(sl.s0, sl.s1, false);
    if (!piece) { startFace(sl); piece = true; pieceFirst = i; receipt.wallPieces++; }
    const A = station(sl.s0), B = station(sl.s1);
    const col = tone(sl.tone);
    // (b17) the body's faces, behind the stones: the joints' dark
    const faceCol: Tone = inset ? (p) => { const c = col(p); return [c[0] * JOINT_SHADE, c[1] * JOINT_SHADE, c[2] * JOINT_SHADE]; } : col;
    for (const side of [-1, 1]) {
      const ba = P(A, side, A.hb - inset, -A.sink), bb = P(B, side, B.hb - inset, -B.sink);
      const ca = C(A, side, sl.h0 + side * sl.lean, inset), cb = C(B, side, sl.h1 + side * sl.lean, inset);
      // the mid row at 45 % of the slot's height, each station's bulge its own (shared by the slots either side; the
      // phones keep one quad a face)
      const ma = mobile ? null : P(A, side, A.hm - inset, 0.45 * (sl.h0 + side * sl.lean));
      const mb = mobile ? null : P(B, side, B.hm - inset, 0.45 * (sl.h1 + side * sl.lean));
      const uvA = faceUv(side, sl.s0, A.sink), uvB = faceUv(side, sl.s1, B.sink);
      const uvOf = inset
        ? (p: number[]): [number, number] => coreUv((p === ba || p === ca || p === ma ? uvA(p) : uvB(p))[0], p[1] - p[3])
        : (p: number[]) => (p === ba || p === ca || p === ma ? uvA(p) : uvB(p));
      // (the faces wound outward: the right face (side +1) sees +across)
      const sideQuad = (p0: number[], p1: number[], q1: number[], q0: number[]) => {
        if (side > 0) quad(buf, p0, p1, q1, q0, faceCol, uvOf); else quad(buf, p0, q0, q1, p1, faceCol, uvOf);
      };
      if (ma && mb) { sideQuad(ba, bb, mb, ma); sideQuad(ma, mb, cb, ca); } else sideQuad(ba, bb, cb, ca);
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
    // (b26: the stone form's body top is the rubble core between its top stones: the joints' dark)
    const topCol = inset ? faceCol : col;
    if (sl.crest > 0) { quad(buf, la, ka, kb, lb, topCol, topUv); quad(buf, ka, ra, rb, kb, topCol, topUv); }
    else quad(buf, la, ra, rb, lb, topCol, topUv);
    const nx = i + 1 < slots.length ? body(i + 1) : undefined;
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
        facing(lb, kb, nk, nl, fx, fz, topCol, riserUv); facing(kb, rb, nr, nk, fx, fz, topCol, riserUv);
      }
    } else {
      endFace(sl, true);
      piece = false;
      if (stones) yield* layStones(pieceFirst, i);
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
  if (piece) { endFace(body(slots.length - 1), true); if (stones) yield* layStones(pieceFirst, slots.length - 1); }
  // (the stone form is a cell's alone, built when the camera comes near: the far form is the load's)
  if (!stones) layFar();

  /** A quad wound to face (fx, fy, fz) (a stone's face, its bevels, a slab's sides). */
  function quadToward(a: number[], b: number[], c: number[], d: number[], fx: number, fy: number, fz: number, col: Tone, uv: Uv): void {
    const px = c[0] - a[0], py = c[1] - a[1], pz = c[2] - a[2], qx = d[0] - b[0], qy = d[1] - b[1], qz = d[2] - b[2];
    const nx = py * qz - pz * qy, ny = pz * qx - px * qz, nz = px * qy - py * qx;
    if (nx * fx + ny * fy + nz * fz < 0) quad(buf, a, d, c, b, col, uv); else quad(buf, a, b, c, d, col, uv);
  }

  /**
   * (b26; gauntlet wave 177, Saltwind: "neat stacks of uniform rectangular slabs with upright coping", "a jumbled,
   * collapsed pile of flat slabs at odd angles with no vertical face"; the coordinator: "one suhozid kit: rough,
   * irregular pale limestone of uneven sizes, a rubble core showing at the head, no upright coping … stony footing and
   * clutter at the foot") A piece's stones (its slots first..last, a breach either side of it or the wall's heads),
   * laid as a Dalmatian suhozid: each face by the coursing law (dryStoneCourses.ts) — chunky lumps of every size, the
   * footing's big stones bedded under the ground and standing proud, each stone on what is under it so the courses
   * wander, the odd stone two courses high, knocked corners leaving their voids — every stone's face swelling to a
   * rounded middle, its top and sides back to the body (the dark of the joints); through-stones jutting from both faces;
   * a crown of rubble top stones laid across the wall, lumps of their own heights and leans (its skyline ragged, no
   * stone on edge); the heads' rubble core between the two faces' end stones; stones lying at the foot. The beds follow
   * the ground along the wall vertex by vertex (b17's stones each sat on the ground under its own middle, so on a slope
   * they stepped and tipped into a heap). Nothing stands above a metre; every stone keeps to the wall's band.
   */
  function* layStones(first: number, last: number): Generator<FieldWorksSlice, void, void> {
    const sStart = slots[first].s0, sEnd = slots[last].s1;
    const rand = pieceRng(pts[0], pts[1], first);
    // (each stone goes to its own cell's buffer; the slot being laid gets its own back after: its fallen stones follow)
    const slotBuf = buf;
    try { yield* layPieceStones(); } finally { buf = slotBuf; }
    function* layPieceStones(): Generator<FieldWorksSlice, void, void> {
      let work = 0;
      let si = first;
      const slotAt = (sv: number): number => {
        while (si < last && slots[si].s1 <= sv) si++;
        while (si > first && slots[si].s0 > sv) si--;
        return si;
      };
      /** The body's crown along the piece (a fallen slot's its tumbled top), at most the metre's cap. */
      const crownAt = (sv: number): number => {
        const k = slotAt(sv), b = body(k), t = Math.min(1, Math.max(0, (sv - b.s0) / Math.max(1e-6, b.s1 - b.s0)));
        return Math.min(FIELD_WORKS_MAX_M - 0.02, b.h0 + (b.h1 - b.h0) * t);
      };
      /** A point across the wall: along the piece, `across` from its line (+ the right face's side), `above` its own ground. */
      const W = (sv: number, across: number, above: number): number[] => {
        const [x, z, dx, dz] = at(sv);
        const px = x - dz * across, pz = z + dx * across, g = heightAt(px, pz);
        return [px, g + Math.min(FIELD_WORKS_MAX_M - 0.01, above), pz, g];
      };
      /** The face's half width at a height (the station's batter, interpolated along the slot). */
      const halfAt = (sv: number, above: number): number => {
        const k = slotAt(sv), A = station(slots[k].s0), B = station(slots[k].s1);
        const t = Math.min(1, Math.max(0, (sv - slots[k].s0) / Math.max(1e-6, slots[k].s1 - slots[k].s0)));
        const hb = A.hb + (B.hb - A.hb) * t, ht = A.ht + (B.ht - A.ht) * t, sink = A.sink + (B.sink - A.sink) * t;
        return hb + (ht - hb) * Math.min(1.15, Math.max(0, (above + sink) / (BATTER_H + sink)));
      };
      /** A point on a face: along the piece, the side, its height over its own ground, standing `out` beyond the batter. */
      const faceAt = (sv: number, side: number, above: number, out: number): number[] => W(sv, (halfAt(sv, above) + out) * side, above);
      /** Whether what is centred at `sv` falls in the cell being laid (the stone form keeps its own cell's alone). */
      const inCell = (sv: number, across = 0): boolean => {
        if (env.only === undefined) return true;
        const [x, z, dx, dz] = at(sv);
        return wallCellKey(x - dz * across, z + dx * across) === env.only;
      };
      const shaded = (base: Tone, k: number): Tone => (p) => { const c = base(p); return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)]; };
      const yieldEvery = function* (n: number): Generator<FieldWorksSlice, void, void> {
        if (++work % n === 0) yield { fine: true, progress: false, stage: 'field-wall-stones' };
      };

      /**
       * A rubble lump (a top stone, a stone of the head's core, one at the foot): a ring of five corners round its plan
       * (an ellipse along and across the wall, each corner its own reach), a rounded top over it fanned from a high
       * point off its middle, its sides down to a ring a little inside it where it beds (`bed` its height over the
       * ground there, `h` its height over its bed). Every random is drawn whether it is laid or not.
       */
      const lump = (cs: number, cacross: number, bed: number, h: number, halfL: number, halfW: number, slotTone: number, sides = true): void => {
        const yaw = (rand() - 0.5) * 0.5, cy = Math.cos(yaw), sy = Math.sin(yaw), phase = rand() * 1.2566;
        const reach = [0, 0, 0, 0, 0].map(() => 0.78 + rand() * 0.3), lifts = [0, 0, 0, 0, 0].map(() => 0.6 + rand() * 0.28);
        const peakA = (rand() - 0.5) * 0.7, peakW = (rand() - 0.5) * 0.7, toneJ = (rand() - 0.5) * 0.45, shade = 0.84 + rand() * 0.28, u0 = rand() * 7;
        if (!inCell(cs, cacross)) return;
        buf = slotCell(cs - 0.01, cs + 0.01, false);
        const [, , dx, dz] = at(cs);
        const P2 = (la: number, lw: number, above: number): number[] => {
          // (the lump's own plan turned by its yaw on the wall's frame at its middle)
          const a = la * cy - lw * sy, w = la * sy + lw * cy;
          const [x, z] = at(cs);
          const px = x + dx * a - dz * (cacross + w), pz = z + dz * a + dx * (cacross + w), g = heightAt(px, pz);
          return [px, g + Math.min(FIELD_WORKS_MAX_M - 0.012, above), pz, g];
        };
        const shoulder: number[][] = [], foot: number[][] = [];
        for (let k = 0; k < 5; k++) {
          const ang = phase + k * 1.2566, ca = Math.cos(ang), sa = Math.sin(ang);
          // (a stone without sides is a mound out of what it lies in: its corners down at its bed)
          shoulder.push(P2(ca * halfL * reach[k], sa * halfW * reach[k], bed + h * lifts[k] * (sides ? 1 : 0.3)));
          foot.push(P2(ca * halfL * reach[k] * 0.86, sa * halfW * reach[k] * 0.86, bed - 0.01));
        }
        const top = P2(peakA * halfL, peakW * halfW, bed + h);
        const c0 = shaded(tone(slotTone + toneJ), shade)(top), c1: [number, number, number] = [c0[0] * 0.84, c0[1] * 0.84, c0[2] * 0.84];
        const flat: Tone = () => c0, flatDark: Tone = () => c1;
        const uvL = (p: number[]): [number, number] => [u0 + (p[0] + p[2]) * 0.37 / DRY_WALL_TILE_M * 2, DRY_WALL_STONE_MID_V + Math.max(-0.08, Math.min(0.08, (p[1] - top[1]) / DRY_WALL_TILE_M))];
        stoneFan(buf, top, shoulder, [0, 1, 0], flat, uvL, 0.55);
        // (a stone sunk in the grass or wedged in a gap shows its top alone)
        if (sides) for (let k = 0; k < 5; k++) {
          const a = shoulder[k], b = shoulder[(k + 1) % 5], fa = foot[(k + 1) % 5], fb = foot[k];
          const mx = (a[0] + b[0]) / 2 - top[0], mz = (a[2] + b[2]) / 2 - top[2];
          quadToward(a, b, fa, fb, mx, 0, mz, flatDark, uvL);
        }
      };

      // the two faces, by the coursing law: the footing bedded under the ground, the courses up to the body's crown
      for (const side of [-1, 1]) {
        const face = yield* courseSlices(layDryStoneFaceSteps(rand, sEnd - sStart, {
          crown: (s) => crownAt(sStart + s), foot: 0.08, footH: [0.2, 0.32], footL: [0.36, 0.78], courseH: [0.13, 0.27], courseL: [0.2, 0.62],
        }));
        for (const st of face) {
          // (every random of a stone drawn before it is tested against the cell: the same stones whichever cell is laid)
          const footing = st.kind === 1;
          const proud = (footing ? 0.022 : 0) + (rand() < 0.22 ? 0.016 + rand() * 0.018 : rand() * 0.012);
          const shade = (0.8 + rand() * 0.34) * (rand() < 0.1 ? 0.8 : 1), toneJ = (rand() - 0.5) * 0.6, u0 = rand() * 7;
          const swell = 0.02 + rand() * 0.025, midS = (rand() - 0.5) * 0.4, midY = (rand() - 0.5) * 0.4;
          // (each stone's face turned its own way out of the wall's plane, up to a quarter of a radian: one end or its
          // top standing out, so neighbours catch the light each their own way)
          const turnS = (rand() - 0.5) * 0.24, turnY = (rand() - 0.5) * 0.2;
          const n = st.pts.length / 2;
          let cs = 0, cy = 0;
          for (let k = 0; k < n; k++) { cs += st.pts[k * 2]; cy += st.pts[k * 2 + 1]; }
          cs = cs / n + (st.s1 - st.s0) * midS * 0.5; cy = cy / n + (st.y1 - st.y0) * midY * 0.5;
          const sv = sStart + cs;
          if (!inCell(sv, 0)) { yield* yieldEvery(64); continue; }
          buf = slotCell(sv - 0.01, sv + 0.01, false);
          // (a stone at a head shows its end and its depth there: the faces' end stones either side of the core)
          const span = sEnd - sStart, atStart = st.s0 < 0.012, atEnd = st.s1 > span - 0.012, depth = atStart || atEnd ? 0.2 : JOINT_DEPTH;
          const ring: number[][] = [], back: number[][] = [];
          let lowest = Infinity;
          for (let k = 0; k < n; k++) lowest = Math.min(lowest, turnS * (st.pts[k * 2] - cs) + turnY * (st.pts[k * 2 + 1] - cy));
          const outAt = (s0: number, y0: number): number => proud + turnS * (s0 - cs) + turnY * (y0 - cy) - lowest;
          for (let k = 0; k < n; k++) {
            const s0 = sStart + st.pts[k * 2], y0 = st.pts[k * 2 + 1];
            ring.push(faceAt(s0, side, y0, outAt(st.pts[k * 2], y0)));
            back.push(faceAt(s0, side, y0, -depth));
          }
          const mid = faceAt(sv, side, cy, outAt(cs, cy) + swell);
          const along = at(sv), tx = along[2], tz = along[3], ox = -tz * side, oz = tx * side; // the face's outward horizontal
          // the face's normal: across its outline (right minus left, top minus bottom), turned outward (the batter tips it up)
          const rr = ring[1], ll = ring[0], tt = ring[n - 1];
          let fnx = (rr[1] - ll[1]) * (tt[2] - ll[2]) - (rr[2] - ll[2]) * (tt[1] - ll[1]);
          let fny = (rr[2] - ll[2]) * (tt[0] - ll[0]) - (rr[0] - ll[0]) * (tt[2] - ll[2]);
          let fnz = (rr[0] - ll[0]) * (tt[1] - ll[1]) - (rr[1] - ll[1]) * (tt[0] - ll[0]);
          const fl = Math.hypot(fnx, fny, fnz) || 1, fs = (fnx * ox + fnz * oz) < 0 ? -1 / fl : 1 / fl;
          fnx *= fs; fny *= fs; fnz *= fs;
          // (one colour a stone, taken at its middle: its mottle the print's, its tone its own)
          const c0 = shaded(tone(slots[slotAt(sv)].tone + toneJ), shade)(mid);
          const cTop: [number, number, number] = [c0[0] * 0.95, c0[1] * 0.95, c0[2] * 0.95], cSide: [number, number, number] = [c0[0] * 0.78, c0[1] * 0.78, c0[2] * 0.78];
          // (its face darker toward its bed, where the soil splashes and its neighbours below shade it, lighter over its
          // top: one stone's volume, not one flat colour)
          const flat: Tone = (p) => {
            const t = Math.min(1, Math.max(0, (p[1] - p[3] - st.y0) / Math.max(0.03, st.y1 - st.y0))), k = 0.86 + 0.18 * t;
            return [Math.min(1, c0[0] * k), Math.min(1, c0[1] * k), Math.min(1, c0[2] * k)];
          };
          const ymid = (st.y0 + st.y1) / 2, squash = Math.min(1, 0.32 / Math.max(0.05, st.y1 - st.y0));
          const sOf = new Map<number[], [number, number]>();
          ring.forEach((p, k) => sOf.set(p, [st.pts[k * 2], st.pts[k * 2 + 1]]));
          sOf.set(mid, [cs, cy]);
          const uvS = (p: number[]): [number, number] => {
            const q = sOf.get(p) ?? [cs, cy];
            return [u0 + (q[0] - cs) / DRY_WALL_TILE_M, DRY_WALL_STONE_MID_V + (q[1] - ymid) * squash / DRY_WALL_TILE_M];
          };
          stoneFan(buf, mid, ring, [fnx, fny, fnz], flat, uvS, 0.5);
          // its sides back to the body, where they can be seen: its top and its sides (its bed's underside never is)
          for (let k = 0; k < n; k++) {
            const j = (k + 1) % n, ds = st.pts[j * 2] - st.pts[k * 2], dy = st.pts[j * 2 + 1] - st.pts[k * 2 + 1];
            const el = Math.hypot(ds, dy) || 1, ns = dy / el, ny = -ds / el; // (counter-clockwise: the outward normal)
            // (the sides between two stones of a course stand in their head joint, a centimetre or two from the next
            // stone's: the dark of the body there is the joint; a top or a knocked corner catches the light)
            const endEdge = (atStart && st.pts[k * 2] < 0.06 && st.pts[j * 2] < 0.06) || (atEnd && st.pts[k * 2] > span - 0.06 && st.pts[j * 2] > span - 0.06);
            // (a side whose stone stands out of the face past its neighbour's shows: its turned end)
            const standsOut = Math.max(outAt(st.pts[k * 2], st.pts[k * 2 + 1]), outAt(st.pts[j * 2], st.pts[j * 2 + 1])) > 0.03;
            if (ny < 0.3 && !endEdge && !(standsOut && ny > -0.35)) continue;
            // (an end stone's end at a head is a face of its own: a stone's colour, not a joint's side)
            const col: Tone = ny > 0.5 || endEdge ? () => cTop : () => cSide;
            const uvE = (p: number[]): [number, number] => [u0 + 0.31 + (p[0] + p[2]) * 0.21, DRY_WALL_STONE_MID_V + 0.06 + (p[1] - p[3] - ymid) * 0.2];
            quadToward(ring[k], ring[j], back[j], back[k], tx * ns + ox * 0.25, ny, tz * ns + oz * 0.25, col, uvE);
          }
          yield* yieldEvery(48);
        }
      }

      // the through-stones: one every metre or two, a little under half the body's height, jutting from both faces
      for (let sv = sStart + 0.6 + rand() * 0.8; sv < sEnd - 0.5; sv += 1.1 + rand() * 0.9) {
        const k = slotAt(sv);
        if (slots[k].kind !== 0) continue;
        const len = 0.24 + rand() * 0.14, hgt = 0.11 + rand() * 0.06, sa = sv - len / 2, sb = sv + len / 2;
        const crown = Math.min(crownAt(sa), crownAt(sb));
        const ya = crown * (0.36 + rand() * 0.14), yb = ya + hgt;
        if (yb > crown - 0.05) continue;
        const toneJ = (rand() - 0.5) * 0.4, shadeT = 0.92 + rand() * 0.2, u0 = rand() * 7, outs = [0.07 + rand() * 0.05, 0.07 + rand() * 0.05];
        if (!inCell(sv, 0)) continue;
        buf = slotCell(sa, sb, false);
        const tc = shaded(tone(slots[k].tone + toneJ), shadeT)(faceAt(sv, 1, ya, 0));
        const col: Tone = () => tc;
        const uvT = (p: number[]): [number, number] => [u0 + (p[0] - p[2]) * 0.37, DRY_WALL_STONE_MID_V + (p[1] - p[3] - ya) / DRY_WALL_TILE_M];
        for (const side of [-1, 1]) {
          const out = outs[side > 0 ? 1 : 0];
          const along = at(sv), ox = -along[3] * side, oz = along[2] * side, tx = along[2], tz = along[3];
          const f = (s0: number, y0: number, o: number) => faceAt(s0, side, y0, o);
          const a0 = f(sa, ya, out), a1 = f(sb, ya, out), a2 = f(sb, yb, out), a3 = f(sa, yb, out);
          const b0 = f(sa, ya, -JOINT_DEPTH), b1 = f(sb, ya, -JOINT_DEPTH), b2 = f(sb, yb, -JOINT_DEPTH), b3 = f(sa, yb, -JOINT_DEPTH);
          quadToward(a0, a1, a2, a3, ox, 0, oz, col, uvT); // its end
          quadToward(a3, a2, b2, b3, 0, 1, 0, col, uvT); // its top
          quadToward(a0, b0, b1, a1, 0, -1, 0, shaded(col, 0.8), uvT); // its underside
          quadToward(a1, b1, b2, a2, tx, 0, tz, shaded(col, 0.9), uvT); // its two sides
          quadToward(a0, a3, b3, b0, -tx, 0, -tz, shaded(col, 0.9), uvT);
        }
      }

      // the crown: rubble top stones laid across the body's crown along every slot — each its own length, height and
      // lean, bedded a few centimetres in, the odd small one wedged lower between two; a fallen stretch's tumbled top
      // fewer and lower, lying anyhow
      for (let k = first; k <= last; k++) {
        const sl = slots[k];
        if (sl.kind === 2) continue;
        const fallenTop = sl.kind === 1;
        let sv = sl.s0 + rand() * 0.04;
        while (sv < sl.s1 - 0.06) {
          const L = fallenTop ? 0.16 + rand() * 0.2 : 0.22 + rand() * 0.24, gap = 0.01 + rand() * (fallenTop ? 0.2 : 0.05);
          const mid = sv + L / 2;
          sv += L + gap;
          if (mid > sl.s1 - 0.02) continue;
          const crown = crownAt(mid), half = halfAt(mid, crown);
          const h = (fallenTop ? 0.07 + rand() * 0.07 : 0.1 + rand() * 0.075) * (rand() < 0.15 ? 1.25 : 1);
          const wide = rand(), place = rand() - 0.5;
          const halfW = fallenTop ? 0.1 + wide * 0.08 : (half + 0.02) * (0.68 + wide * 0.38);
          const across = fallenTop ? place * half : place * 2 * Math.max(0, half + 0.02 - halfW);
          lump(mid, across, crown - 0.03, h, L / 2, halfW, sl.tone);
          // a small one wedged lower in the gap after it, now and then
          if (!fallenTop && rand() < 0.3) lump(mid + L / 2 + gap / 2, (rand() - 0.5) * half, crown - 0.04, 0.06 + rand() * 0.04, 0.05 + rand() * 0.04, 0.07 + rand() * 0.05, sl.tone, false);
          yield* yieldEvery(48);
        }
      }

      // the heads (a breach's sides, the wall's two ends): the rubble core between the faces' end stones — small stones
      // packed in the section, standing a little out of it
      for (const [hs, dir] of [[sStart, 1], [sEnd, -1]] as const) {
        const crown = crownAt(hs + dir * 0.02);
        for (let k = 0, m = 7 + Math.floor(rand() * 4); k < m; k++) {
          const y = 0.02 + rand() * Math.max(0.05, crown - 0.13), half = halfAt(hs, y);
          lump(hs + dir * (0.01 + rand() * 0.05), (rand() - 0.5) * 1.4 * Math.max(0.05, half - 0.19), y, 0.08 + rand() * 0.06, 0.07 + rand() * 0.05, 0.07 + rand() * 0.05, slots[slotAt(hs)].tone);
        }
      }

      // the foot: stones lying in the grass by both faces, a few a metre, sunk to their middles
      for (const side of [-1, 1]) {
        for (let sv = sStart + rand() * 0.8; sv < sEnd; sv += 0.45 + rand() * 0.9) {
          // (every one within the wall's toe band, 0.9 m of its line, with its own reach)
          const out = halfAt(sv, 0) + 0.05 + Math.pow(rand(), 1.6) * 0.15, size = 0.05 + Math.pow(rand(), 1.4) * 0.06;
          lump(sv, out * side, -size * 0.35, size * 0.9, size * (1 + rand() * 0.4), size, slots[slotAt(Math.min(sEnd - 1e-3, sv))].tone * 0.7, false);
          yield* yieldEvery(48);
        }
      }
    }
  }

  /** (b26) A face's coursing in slices (the law yields every few dozen stones). */
  function* courseSlices(steps: Generator<void, DryStoneFaceStone[], void>): Generator<FieldWorksSlice, DryStoneFaceStone[], void> {
    let step = steps.next();
    while (!step.done) { yield { fine: true, progress: false, stage: 'field-wall-stones' }; step = steps.next(); }
    return step.value;
  }

  /** A wall head: the section's outline at the slot's start (facing back) or end (facing ahead), fanned from its foot. */
  function endFace(sl: Slot, atEnd: boolean, withMid = !mobile): void {
    const st = station(atEnd ? sl.s1 : sl.s0), h = atEnd ? sl.h1 : sl.h0;
    const outline: number[][] = [];
    for (const side of [-1, 1]) {
      // (the head's outline through the face's mid row, so the faces' bulge meets it; a far segment's faces have none)
      const ring = !withMid
        ? [P(st, side, st.hb, -st.sink), C(st, side, h + side * sl.lean)]
        : [P(st, side, st.hb, -st.sink), P(st, side, st.hm, 0.45 * (h + side * sl.lean)), C(st, side, h + side * sl.lean)];
      // (the ridge's point only where the top stone has one: a flat top's head is three triangles)
      if (side < 0) outline.push(...ring, ...(sl.crest > 0 ? [R(st, sl.ridge, h + sl.crest)] : [])); else outline.push(...ring.reverse());
    }
    // the outline runs left foot, up, across the crown, down to the right foot (fanned from the foot's middle: the
    // start's fan wound to face back along the wall, the end's ahead)
    if (buf === NULL_BUF) return;
    const centre = [st.x, (outline[0][1] + outline[outline.length - 1][1]) / 2, st.z, heightAt(st.x, st.z)];
    // (b26; the coordinator: "a rubble core showing at the head") the head is the core between the two faces: the
    // print's rubble band (the crown's), darkened in the stone form, whose own lumps stand out of it (layStones)
    // (the core is packed rubble, its voids the print's: a shade darker than the faces, not the joints' dark)
    const base = tone(sl.tone);
    const col: Tone = stones ? (p) => { const c = base(p); return [c[0] * 0.72, c[1] * 0.72, c[2] * 0.72]; } : base;
    const uv = (p: number[]): [number, number] => {
      const across = (p[0] - st.x) * st.ax + (p[2] - st.z) * st.az;
      return coreUv(uTop + 0.29 + across / DRY_WALL_TILE_M, p[1] - p[3]);
    };
    for (let k = 0; k + 1 < outline.length; k++) {
      if (atEnd) tri(buf, centre, outline[k], outline[k + 1], col, uv); else tri(buf, centre, outline[k + 1], outline[k], col, uv);
    }
  }
  function startFace(sl: Slot): void { endFace(sl, false); }

  /**
   * The far form (the scenery lane, b13; the coordinator: "full stones within a near radius, merged per cell, with a
   * simpler mid and far form"): the same wall on the same stations — its breaches, its fallen stretches and heads
   * where the near form has them — as segments of a few slots (3.6 m; a phone's 6 m) with a continuous upright crown
   * and no ridge, step or fallen stone: two faces and a top a segment. A segment never spans a cell or a change from
   * whole to fallen, so a cell's far form stands exactly where its near form does.
   */
  function layFar(): void {
    const SEG = mobile ? 6 : 3.6;
    let i = 0;
    while (i < slots.length) {
      if (slots[i].kind === 2) { i++; continue; }
      // a piece: the slots up to the next breach
      let j = i;
      while (j + 1 < slots.length && slots[j + 1].kind !== 2) j++;
      // its segments, the crown continuous: each boundary at the mean of the near form's two crowns there
      const crownAt = (k: number): number => {
        if (k <= i) return slots[i].h0;
        if (k > j) return slots[j].h1;
        return (slots[k - 1].h1 + slots[k].h0) / 2;
      };
      let a = i;
      // (a segment is laid in its slots' cell, the cell their near form is in)
      const segs: Array<{ sg: Slot; cell: Buffers }> = [];
      while (a <= j) {
        let b = a;
        const cellA = slotCell(slots[a].s0, slots[a].s1, true);
        while (b + 1 <= j && slots[b + 1].s1 - slots[a].s0 <= SEG && slots[b + 1].kind === slots[a].kind
          && slotCell(slots[b + 1].s0, slots[b + 1].s1, true) === cellA) b++;
        segs.push({ cell: cellA, sg: { s0: slots[a].s0, s1: slots[b].s1, h0: crownAt(a), h1: crownAt(b + 1), lean: 0,
          tone: slots[a].tone, kind: slots[a].kind, ridge: 0, crest: 0 } });
        a = b + 1;
      }
      for (let k = 0; k < segs.length; k++) {
        const { sg, cell } = segs[k];
        buf = cell;
        if (k === 0) endFace(sg, false, false);
        const A = station(sg.s0), B = station(sg.s1), col = tone(sg.tone);
        for (const side of [-1, 1]) {
          const ba = P(A, side, A.hb, -A.sink), bb = P(B, side, B.hb, -B.sink);
          const ca = C(A, side, sg.h0), cb = C(B, side, sg.h1);
          const uvA = faceUv(side, sg.s0, A.sink), uvB = faceUv(side, sg.s1, B.sink);
          const uvOf = (p: number[]) => (p === ba || p === ca ? uvA(p) : uvB(p));
          if (side > 0) quad(buf, ba, bb, cb, ca, col, uvOf); else quad(buf, ba, ca, cb, bb, col, uvOf);
        }
        const la = C(A, -1, sg.h0), ra = C(A, 1, sg.h0), lb = C(B, -1, sg.h1), rb = C(B, 1, sg.h1);
        const topUv = (p: number[]): [number, number] => {
          const across = (p[0] - A.x) * A.ax + (p[2] - A.z) * A.az;
          const along = sg.s0 + (p[0] - A.x) * -A.az + (p[2] - A.z) * A.ax;
          return [uTop + along / DRY_WALL_TILE_M, DRY_WALL_CROWN_MID_V + across / DRY_WALL_TILE_M];
        };
        quad(buf, la, ra, rb, lb, col, topUv);
        if (k === segs.length - 1) endFace(sg, true, false);
      }
      i = j + 1;
    }
  }
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
  const receipt: FieldWorksReceipt = { wallPieces: 0, bankPieces: 0, wallM: 0, bankM: 0, triangles: 0, farTriangles: 0, cells: 0, scanned: 0 };
  const landAt = ground._landUseAt;
  if (!landAt || (!options.walls && !options.banks)) return { geometry: null, wallCells: [], wallGeometry: null, wallFarGeometry: null, bankGeometry: null, bankTurfGeometry: null, bankCrests: null, receipt, fine: null };
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
      const bank = options.banks && isFieldBankSample(s);
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
      if (!fieldGate(fx, fz) || inSolid(fx, fz, wall ? 1.0 : 1.8) || inKeepOut(fx, fz, wall ? 1.0 : 2.1)) continue;
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
  // (b13: the walls by cell, a near form and a far form each; the banks one buffer)
  const wallCells = new Map<number, { fine: Buffers; coarse: Buffers; lines: Set<number> }>();
  let wallLine = -1;
  const cellOf = (x: number, z: number, coarse: boolean): Buffers => {
    const key = wallCellKey(x, z);
    let cell = wallCells.get(key);
    if (!cell) { cell = { fine: newBuffers(), coarse: newBuffers(), lines: new Set() }; wallCells.set(key, cell); }
    if (wallLine >= 0) cell.lines.add(wallLine);
    return coarse ? cell.coarse : cell.fine;
  };
  const wallLines: number[][] = [];
  const bankBuf = newBuffers();
  const turfBuf = { positions: [] as number[], normals: [] as number[], folds: [] as number[], index: [] as number[] };
  const crestRows: number[] = [], crestLines: number[] = [];
  const [wh, ws, wl] = options.wallTone ?? [0.11, 0.06, 0.8];
  let lineIndex = 0;
  const env: WallEnv = { ground, noise, heightAt, receipt, wallTone: [wh, ws, wl], mobile: options.mobile, stones: false };
  for (const line of lines) {
    if (line.wall) { wallLine = wallLines.length; wallLines.push(line.pts); yield* layWall(env, line.pts, cellOf); wallLine = -1; } else sweepBank(line.pts, bankBuf);
    if (++lineIndex % 20 === 0) yield { fine: true, progress: false, stage: 'field-works' };
  }

  /**
   * (b29) Sweep one bank, the talus: a section at every point of its line (BANK_SECTION) — the toe under the ground, the
   * granite facing near upright to its top a third of a metre up, the turf's flank, shoulder and crown above it, the
   * crown its map's height over the ground breathing along the bank and its flanks lumped — welded row to row into the
   * ground material's body (turfBuf: smooth normals, the turf's turned back toward the ground's, the facing's steep), its
   * ends drawn down to the ground over three metres and capped; and along each foot the odd block of the facing standing
   * proud on the props rock material (buf).
   */
  function sweepBank(pts: number[], buf: Buffers): void {
    const section = options.mobile ? BANK_SECTION_MOBILE : BANK_SECTION;
    const ns = section.length;
    // (no lump lifts a crown over its map's height, nor over the metre)
    const crownCap = Math.min(BANK_MAX_M, options.bankHeightM ?? BANK_HEIGHT_M);
    const len = pts.length / 2;
    const base = turfBuf.positions.length / 3;
    const rowGround: number[] = [];
    crestLines.push(crestRows.length / 5);
    const axis: number[] = [];
    for (let c = 0; c < len; c++) {
      const x = pts[c * 2], z = pts[c * 2 + 1];
      const pi = Math.max(0, c - 1), ni = Math.min(len - 1, c + 1);
      let dx = pts[ni * 2] - pts[pi * 2], dz = pts[ni * 2 + 1] - pts[pi * 2 + 1];
      const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      const ax = -dz, az = dx;
      axis.push(ax, az);
      // the ends drawn down to the ground over four metres (the chain's feet stand 1.4 m apart)
      const endM = Math.min(c, len - 1 - c) * 1.4;
      const taper = 0.22 + 0.78 * smooth(0, 4.2, endM);
      const height = fieldBankCrownAt(x, z, options.bankHeightM) * taper;
      crestRows.push(x, heightAt(x, z) + height, z, dx, dz);
      const footTop = Math.min(0.3, height * 0.42);
      for (const [a, b, facing] of section) {
        const lump = facing ? 0 : noise.noise(x * 1.3 + a * 2.1, z * 1.3 - a) * 0.07;
        const across = a * (facing ? 1 : 1 + lump * 0.6);
        const px = x + ax * across, pz = z + az * across;
        const g = heightAt(px, pz);
        const above = facing ? (b > 0 ? footTop : b) : Math.min(crownCap, Math.max(footTop + 0.04, b * height + (b > 0.95 ? lump * 0.8 : lump * 0.4)));
        turfBuf.positions.push(px, g + above, pz);
        const f = ground._foldAt ? ground._foldAt(px, pz) : 0;
        turfBuf.folds.push(Math.max(-127, Math.min(127, Math.round((f > 1 ? 1 : f < -1 ? -1 : f) * 127))));
        rowGround.push(g);
      }
    }
    const at = (c: number, k: number): number => base + c * ns + k;
    for (let c = 0; c + 1 < len; c++) for (let k = 0; k + 1 < ns; k++) {
      const a = at(c, k), b = at(c, k + 1), d = at(c + 1, k), e = at(c + 1, k + 1);
      turfBuf.index.push(a, d, b, b, d, e);
    }
    // the normals: the grid's own (across the section and along the line), the turf's turned back toward the ground's
    const P = turfBuf.positions;
    for (let c = 0; c < len; c++) for (let k = 0; k < ns; k++) {
      const i0 = at(Math.max(0, c - 1), k), i1 = at(Math.min(len - 1, c + 1), k), j0 = at(c, Math.max(0, k - 1)), j1 = at(c, Math.min(ns - 1, k + 1));
      const tx = P[i1 * 3] - P[i0 * 3], ty = P[i1 * 3 + 1] - P[i0 * 3 + 1], tz = P[i1 * 3 + 2] - P[i0 * 3 + 2];
      const sx = P[j1 * 3] - P[j0 * 3], sy = P[j1 * 3 + 1] - P[j0 * 3 + 1], sz = P[j1 * 3 + 2] - P[j0 * 3 + 2];
      let nx = sy * tz - sz * ty, ny = sz * tx - sx * tz, nz = sx * ty - sy * tx;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      if (!section[k][2]) {
        const i = at(c, k), gn = ground.getNormalAt(P[i * 3], P[i * 3 + 2]);
        const gx = gn.x ?? 0, gy = gn.y, gz = gn.z ?? 0;
        nx = gx + (nx - gx) * BANK_TURF_NORMAL; ny = gy + (ny - gy) * BANK_TURF_NORMAL; nz = gz + (nz - gz) * BANK_TURF_NORMAL;
        const m = Math.hypot(nx, ny, nz) || 1; nx /= m; ny /= m; nz /= m;
      }
      turfBuf.normals.push(nx, ny, nz);
    }
    // the ends capped: a fan over the end row from a point on the ground under the crown, facing out along the line
    for (const [c, sign] of [[0, -1], [len - 1, 1]] as const) {
      const mid = at(c, (ns - 1) >> 1);
      const cx = P[mid * 3], cz = P[mid * 3 + 2], cy = heightAt(cx, cz) - 0.05;
      const centre = turfBuf.positions.length / 3;
      const pi = Math.max(0, c - 1), ni = Math.min(len - 1, c + 1);
      let ox = pts[ni * 2] - pts[pi * 2], oz = pts[ni * 2 + 1] - pts[pi * 2 + 1];
      const ol = Math.hypot(ox, oz) || 1; ox = ox / ol * sign; oz = oz / ol * sign;
      turfBuf.positions.push(cx, cy, cz);
      turfBuf.normals.push(ox * 0.7, 0.71, oz * 0.7);
      turfBuf.folds.push(0);
      for (let k = 0; k + 1 < ns; k++) {
        if (sign > 0) turfBuf.index.push(centre, at(c, k), at(c, k + 1));
        else turfBuf.index.push(centre, at(c, k + 1), at(c, k));
      }
    }
    // the facing's blocks standing proud along each foot: one a few metres where the facing shows, set into it
    const blockTone = (p: number[]): [number, number, number] => {
      const mott = noise.noise(p[0] * 1.7 + 11, p[2] * 1.7 - 7) * 0.5 + 0.5;
      // (the field's granite, a weathered grey: the facing's blocks, not the bank's earth)
      return hsl(0.1 + (mott - 0.5) * 0.03, 0.07 * (0.6 + mott * 0.6), 0.48 * (0.84 + mott * 0.3) * (0.78 + 0.22 * smooth(0, 0.25, p[1] - p[3])));
    };
    const uv = (p: number[]): [number, number] => [p[0] * 0.37 + p[1] * 0.21, p[2] * 0.37 - p[1] * 0.17];
    const stride = options.mobile ? 4 : 2;
    for (let c = 1; c + 1 < len; c += stride) {
      for (const side of [-1, 1]) {
        const x = pts[c * 2], z = pts[c * 2 + 1], ax = axis[c * 2], az = axis[c * 2 + 1];
        const show = noise.noise(x * 0.31 + side * 7.3, z * 0.31 - side * 2.9) * 0.5 + 0.5;
        if (show < 0.42) continue;
        const half = 0.2 + 0.16 * (noise.noise(x * 2.3, z * 2.3 + side) * 0.5 + 0.5), hgt = 0.2 + 0.14 * show, deep = 0.16;
        const ux = az, uz = -ax; // along the line
        const cx = x + ax * side * 1.5, cz = z + az * side * 1.5, g = heightAt(cx, cz);
        // a box set into the facing: its outer face 6 cm proud, its back in the bank
        const corner = (al: number, out: number, up: number): number[] => {
          const px = cx + ux * al + ax * side * out, pz = cz + uz * al + az * side * out, gy = heightAt(px, pz);
          return [px, g - 0.06 + up, pz, gy];
        };
        const f0 = [corner(-half, 0.06, 0), corner(half, 0.06, 0), corner(half, 0.06, hgt), corner(-half, 0.06, hgt)];
        const b0 = [corner(-half, -deep, 0), corner(half, -deep, 0), corner(half, -deep, hgt), corner(-half, -deep, hgt)];
        const quad = (q: number[][]) => { tri(buf, q[0], q[1], q[2], blockTone, uv); tri(buf, q[0], q[2], q[3], blockTone, uv); };
        if (side > 0) { quad([f0[0], f0[1], f0[2], f0[3]]); quad([b0[3], b0[2], f0[2], f0[3]]); quad([f0[0], f0[3], b0[3], b0[0]]); quad([f0[1], b0[1], b0[2], f0[2]]); }
        else { quad([f0[1], f0[0], f0[3], f0[2]]); quad([f0[3], f0[2], b0[2], b0[3]]); quad([b0[0], b0[3], f0[3], f0[0]]); quad([f0[2], b0[2], b0[1], f0[1]]); }
      }
    }
    void rowGround;
    receipt.bankPieces++; receipt.bankM += (len - 1) * 1.4;
  }

  /**
   * The buffers as an indexed geometry: the walls without the rock material's ground and with byte colours. Copied
   * into typed arrays a slice every 400 000 values (a map's walls are a million and more vertices, in a few hundred
   * cells).
   */
  let copied = 0;
  function* copy<T extends Float32Array | Uint8Array | Uint32Array>(from: number[], to: T, scale = 0, offset = 0): Generator<FieldWorksSlice, T, void> {
    const CHUNK = 400_000;
    for (let i = 0; i < from.length;) {
      const end = Math.min(from.length, i + CHUNK - copied);
      if (scale) for (let k = i; k < end; k++) to[k] = Math.round(Math.min(1, Math.max(0, from[k])) * scale);
      else if (offset) for (let k = i; k < end; k++) to[k] = from[k] + offset;
      else for (let k = i; k < end; k++) to[k] = from[k];
      copied += end - i; i = end;
      if (copied >= CHUNK) { copied = 0; yield { fine: true, progress: false, stage: 'field-works' }; }
    }
    return to;
  }
  function* build(buf: Buffers, wall: boolean): Generator<FieldWorksSlice, THREE.BufferGeometry | null, void> {
    if (!buf.index.length) return null;
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
    return g;
  }
  /** Several buffers as one (the receipts' merged walls). */
  const concat = (list: Buffers[]): Buffers => {
    const out = newBuffers();
    for (const b of list) {
      const base = out.positions.length / 3;
      for (const key of ['positions', 'normals', 'colors', 'grounds', 'uvs'] as const) for (const v of b[key]) out[key].push(v);
      for (const k of b.index) out.index.push(k + base);
    }
    return out;
  };
  yield { fine: true, progress: false, stage: 'field-works' };
  const wallCellList: FieldWallCell[] = [];
  const cellLines = new Map<number, number[]>();
  for (const [key, cell] of wallCells) {
    const near = yield* build(cell.fine, true), far = yield* build(cell.coarse, true);
    if (!near && !far) continue;
    const box = new THREE.Box3();
    if (near) box.union(near.boundingBox!);
    if (far) box.union(far.boundingBox!);
    wallCellList.push({ near, far, key, box: { minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y, minZ: box.min.z, maxZ: box.max.z } });
    cellLines.set(key, [...cell.lines]);
    receipt.triangles += cell.fine.index.length / 3;
    receipt.farTriangles += cell.coarse.index.length / 3;
  }
  receipt.cells = wallCellList.length;
  const cellBuffers = [...wallCells.values()];
  const wallGeometry = options.merged ? yield* build(concat(cellBuffers.map((c) => c.fine)), true) : null;
  const wallFarGeometry = options.merged ? yield* build(concat(cellBuffers.map((c) => c.coarse)), true) : null;
  const bankGeometry = yield* build(bankBuf, false);
  if (bankGeometry) receipt.triangles += bankBuf.index.length / 3;
  // (b29) the banks' body for the ground's own material
  let bankTurfGeometry: THREE.BufferGeometry | null = null;
  if (turfBuf.index.length) {
    bankTurfGeometry = new THREE.BufferGeometry();
    bankTurfGeometry.setAttribute('position', new THREE.BufferAttribute(yield* copy(turfBuf.positions, new Float32Array(turfBuf.positions.length)), 3));
    bankTurfGeometry.setAttribute('normal', new THREE.BufferAttribute(yield* copy(turfBuf.normals, new Float32Array(turfBuf.normals.length)), 3));
    bankTurfGeometry.setAttribute('fold', new THREE.BufferAttribute(Int8Array.from(turfBuf.folds), 1, true));
    bankTurfGeometry.setIndex(new THREE.BufferAttribute(yield* copy(turfBuf.index, new Uint32Array(turfBuf.index.length)), 1));
    bankTurfGeometry.computeBoundingBox(); bankTurfGeometry.computeBoundingSphere();
    receipt.triangles += turfBuf.index.length / 3;
  }
  const bankCrests: FieldBankCrests | null = crestLines.length
    ? { points: Float32Array.from(crestRows), lines: Uint32Array.from([...crestLines, crestRows.length / 5]) } : null;
  // (b17) the cells' stone forms are built when the camera comes near (props.ts updateFieldWallLod), from the lines
  const fine = !options.mobile && wallLines.length
    ? { lines: wallLines, cellLines, env: { ground, noise, heightAt, wallTone: [wh, ws, wl] as const, mobile: false } } : null;
  return { geometry: wallGeometry ?? bankGeometry, wallCells: wallCellList, wallGeometry, wallFarGeometry, bankGeometry, bankTurfGeometry, bankCrests, receipt, fine };
}

/**
 * (b17) A wall cell's stone form, built when the camera comes near: every line that touches the cell or its neighbours
 * laid again stone by stone (layWall with stones on: the same line stream, so the same slots, stations, heads and
 * fallen stones as the cell's mid form, and each piece's stones from its own stream), what falls in the cell kept and
 * the rest let go. Deterministic: the same cell builds the same stones every time. Null when nothing falls in it.
 */
export function buildFieldWallFine(source: FieldWallFineSource, key: number): THREE.BufferGeometry | null {
  const steps = buildFieldWallFineSteps(source, key);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/** (b17) buildFieldWallFine in slices (a few dozen stones each): the props' switch runs it within a frame budget. */
export function* buildFieldWallFineSteps(source: FieldWallFineSource, key: number): Generator<FieldWorksSlice, THREE.BufferGeometry | null, void> {
  const target = newBuffers();
  const receipt: FieldWorksReceipt = { wallPieces: 0, bankPieces: 0, wallM: 0, bankM: 0, triangles: 0, farTriangles: 0, cells: 0, scanned: 0 };
  const env: WallEnv = { ...source.env, stones: true, receipt, only: key };
  const cellOf = (x: number, z: number, coarse: boolean): Buffers => (!coarse && wallCellKey(x, z) === key ? target : NULL_BUF);
  const lines = new Set<number>();
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const li of source.cellLines.get(key + dx * 1024 + dz) ?? []) lines.add(li);
  for (const li of [...lines].sort((a, b) => a - b)) {
    yield* layWall(env, source.lines[li], cellOf);
    yield { fine: true, progress: false, stage: 'field-wall-stones' };
  }
  if (!target.index.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(target.positions), 3));
  yield { fine: true, progress: false, stage: 'field-wall-stones' };
  g.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(target.normals), 3));
  yield { fine: true, progress: false, stage: 'field-wall-stones' };
  const colors = new Uint8Array(target.colors.length);
  for (let i = 0; i < colors.length; i++) { const v = target.colors[i]; colors[i] = Math.round((v < 0 ? 0 : v > 1 ? 1 : v) * 255); }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3, true));
  yield { fine: true, progress: false, stage: 'field-wall-stones' };
  g.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(target.uvs), 2));
  g.setIndex(new THREE.BufferAttribute(Uint32Array.from(target.index), 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
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
