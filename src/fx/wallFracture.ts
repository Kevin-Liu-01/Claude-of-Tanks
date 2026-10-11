/**
 * wallFracture.ts — a building's walls breaking where they are struck, and coming down where they lose what holds
 * them (destruction core lane, 2026-10-10; the owner: "the destruction of buildings needs to be a lot better too, rn its
 * way to sporadic and ugly instead of behaving like it would with physics").
 *
 * Every face of every storey (StructureDamageAnatomy, body frame) is laid out as a grid of cells a few bricks across —
 * courses grouped to about 0.4 m, joints to about 0.5 m, every other row offset by half a cell in a bonded wall (brick,
 * stone, block, rubble, adobe) and square in a cast or framed one — the pieces the wall would break into. A strike
 * breaks the wall at its point:
 *  - cells inside the hole's lobed outline (destructionKit holeOutlineK, the round's own seed) are knocked through;
 *  - a ring round it loses its skin — the render or the brick face spalled off, the core showing: the recess;
 *  - a wider ring cracks;
 *  - damage adds up: a second round beside a first widens its hole, a third brings the courses between them down.
 * Then the load paths. A cell stands while a cell it bears on stands, row by row down to the footing (a bonded row bears
 * on the two cells under it, a square one on the one), an upper storey's bottom row on the storey below's top row; an
 * opening's lintel carries what stands over it while both its jambs bear. A cell that loses every path falls: the
 * triangle of brickwork over a breach, the wall over a window whose pier went, a whole upper corner. What falls comes
 * out as clusters (cells joined edge to edge), for the presentation's bodies; a cell that bears on only part of what it
 * did sags a few centimetres first.
 *
 * Pure: numbers only (no three.js), deterministic from the anatomy and each strike's own seed; a face's grid is laid at
 * the building's first strike (a few hundred cells a face), nothing per frame.
 */
import { holeOutlineK, type DamageFace, type FractureMaterial, type StructureDamageAnatomy, type Vec3 } from '../world/destructionKit.ts';

/** The cell a wall breaks into: wide and tall (m), before a face's own fitting. */
export const CELL_W_M = 0.5;
export const CELL_H_M = 0.4;

export const CELL_INTACT = 0;
/** Cracked: it stands and carries; the presentation draws its cracks. */
export const CELL_CRACKED = 1;
/** Its skin spalled off (the recess): it stands and carries on its core. */
export const CELL_SPALLED = 2;
/** Knocked through by a strike. */
export const CELL_GONE = 3;
/** Fell (lost its load path). */
export const CELL_FALLEN = 4;
/** An opening (a window, a door): never drawn by the field, never bears; the lintel over it carries. */
export const CELL_OPENING = 5;

/** Damage a cell takes before it cracks, spalls and goes. */
const CRACK_AT = 0.25;
const SPALL_AT = 0.5;
const GONE_AT = 1;
/** A sagging cell drops this far (m) at most: one that bears on less than half of what it did. */
const SAG_M = 0.035;

/** How a material's wall breaks: bonded rows (offset by half a cell) or square, and its cell size. */
function cellLaw(material: FractureMaterial): { bonded: boolean; w: number; h: number } {
  switch (material) {
    case 'brick': return { bonded: true, w: 0.46, h: 0.3 };
    case 'stone': return { bonded: true, w: 0.6, h: 0.42 };
    case 'rubble': return { bonded: true, w: 0.55, h: 0.4 };
    case 'adobe': return { bonded: true, w: 0.5, h: 0.38 };
    case 'concrete': return { bonded: false, w: 0.6, h: 0.5 };
    case 'plank': return { bonded: false, w: 0.22, h: 0.9 };
    case 'metal': return { bonded: false, w: 0.6, h: 0.9 };
    case 'timber': case 'infill': return { bonded: false, w: 0.5, h: 0.45 };
    default: return { bonded: true, w: CELL_W_M, h: CELL_H_M };
  }
}

/** One face of one storey as cells. */
export interface FaceGrid {
  readonly storey: number;
  /** Its index in its storey's faces, its section and its name. */
  readonly faceIndex: number;
  readonly section: number;
  readonly name: DamageFace['name'];
  /** Face frame (body frame): origin on the storey floor at the face's centre, u along it, out its outward normal. */
  readonly origin: Vec3;
  readonly u: Vec3;
  readonly out: Vec3;
  readonly width: number;
  readonly height: number;
  /** The wall behind the face (its layers' sum) and the skin a spall takes off (its outermost layer). */
  readonly thickness: number;
  readonly skinM: number;
  readonly material: FractureMaterial;
  readonly bonded: boolean;
  /** Row boundaries up the face from the storey floor (rows + 1), and each row's first cell (rows + 1). */
  readonly rowY: Float32Array;
  readonly rowStart: Int32Array;
  /** Each cell's span along u: [u0, u1] at 2·cell. */
  readonly cellU: Float32Array;
  readonly state: Uint8Array;
  readonly damage: Float32Array;
  /** How far each cell has sagged (m, down). */
  readonly sag: Float32Array;
}

export interface WallFracture {
  readonly anatomy: StructureDamageAnatomy;
  readonly faces: FaceGrid[];
  /** Each face name's faces bottom-up (the stack an upper storey's bottom row bears on). */
  readonly stacks: ReadonlyMap<string, number[]>;
}

export type WallStrikeKind = 'blast' | 'kinetic' | 'shaped';

/** A round on a wall, in the body frame. */
export interface WallStrike {
  x: number;
  y: number;
  z: number;
  /** The round's travel (horizontal, into the wall). */
  dirX: number;
  dirZ: number;
  /** The through hole's radius (m: the round's, structureStages strikeHoleRadius / pierceHoleRadius). */
  radiusM: number;
  kind: WallStrikeKind;
  /** The round's own seed (its outline's lobes). */
  seed: number;
}

/** What one strike did: the struck face, and its cells by what they became (cell indices in that face). */
export interface WallStrikeOutcome {
  face: number;
  /** The strike's point on the face (u along it, y over the storey floor). */
  u: number;
  v: number;
  knocked: number[];
  spalled: number[];
  cracked: number[];
  /** Clusters that lost their load path, as [face, cell, face, cell, …] (a cluster may run up through the storeys). */
  fallen: number[][];
  /** Cells that sag now (face, cell pairs). */
  sagged: number[];
}

function faceWallThickness(face: DamageFace): number {
  const t = face.layers.reduce((sum, layer) => sum + (layer.thicknessM || 0), 0);
  return Math.min(0.7, Math.max(0.12, t || 0.25));
}

/** The material the wall breaks as: its structural layer (the core under a render skin). */
function faceMaterial(face: DamageFace): FractureMaterial {
  const layers = face.layers;
  if (!layers.length) return 'brick';
  const structural = layers.find((layer) => layer.material !== 'plaster' && layer.material !== 'glass') ?? layers[0];
  return structural.material;
}

function layGrid(anatomy: StructureDamageAnatomy, storeyIndex: number, faceIndex: number): FaceGrid {
  const storey = anatomy.storeys[storeyIndex];
  const face = storey.faces[faceIndex];
  const material = faceMaterial(face);
  const law = cellLaw(material);
  const height = Math.max(0.3, face.height);
  // rows: the masonry's courses grouped to the law's height where the kit gave them, else even rows
  const rowsY: number[] = [0];
  const courses = face.masonry?.courses;
  if (courses && courses.length > 2) {
    let last = 0;
    for (const c of courses) if (c - last >= law.h * 0.85 && height - c >= law.h * 0.5) { rowsY.push(c); last = c; }
  } else {
    const rows = Math.max(1, Math.round(height / law.h));
    for (let r = 1; r < rows; r++) rowsY.push((height * r) / rows);
  }
  rowsY.push(height);
  const cols = Math.max(1, Math.round(face.width / law.w));
  const cw = face.width / cols;
  const rowStart: number[] = [];
  const cellU: number[] = [];
  for (let r = 0; r + 1 < rowsY.length; r++) {
    rowStart.push(cellU.length / 2);
    const shift = law.bonded && cols > 1 && r % 2 === 1 ? cw * 0.5 : 0;
    let u = -face.width / 2;
    if (shift > 0) { cellU.push(u, u + shift); u += shift; }
    while (u < face.width / 2 - 1e-6) {
      const u1 = Math.min(face.width / 2, u + cw);
      // a sliver at the row's end joins its neighbour
      if (face.width / 2 - u1 < cw * 0.25) { cellU.push(u, face.width / 2); break; }
      cellU.push(u, u1);
      u = u1;
    }
  }
  rowStart.push(cellU.length / 2);
  const n = cellU.length / 2;
  const state = new Uint8Array(n);
  // openings: a cell more than half inside one is the opening's
  for (let r = 0; r + 1 < rowsY.length; r++) {
    const y0 = rowsY[r], y1 = rowsY[r + 1];
    for (let c = rowStart[r]; c < rowStart[r + 1]; c++) {
      const u0 = cellU[2 * c], u1 = cellU[2 * c + 1];
      const area = (u1 - u0) * (y1 - y0);
      let covered = 0;
      for (const o of face.openings) {
        const du = Math.min(u1, o.u + o.w / 2) - Math.max(u0, o.u - o.w / 2);
        const dy = Math.min(y1, o.y0 + o.h) - Math.max(y0, o.y0);
        if (du > 0 && dy > 0) covered += du * dy;
      }
      if (covered > area * 0.5) state[c] = CELL_OPENING;
    }
  }
  const skin = face.layers.length > 1 ? Math.max(0.02, face.layers[0].thicknessM || 0.03) : Math.min(0.06, faceWallThickness(face) * 0.3);
  return {
    storey: storeyIndex, faceIndex, section: face.section, name: face.name,
    origin: face.origin, u: face.u, out: face.out, width: face.width, height,
    thickness: faceWallThickness(face), skinM: skin, material, bonded: law.bonded,
    rowY: Float32Array.from(rowsY), rowStart: Int32Array.from(rowStart), cellU: Float32Array.from(cellU),
    state, damage: new Float32Array(n), sag: new Float32Array(n),
  };
}

/** Lay every face of a building as cells (the building's first strike). */
export function createWallFracture(anatomy: StructureDamageAnatomy): WallFracture {
  const faces: FaceGrid[] = [];
  const stacks = new Map<string, number[]>();
  anatomy.storeys.forEach((storey, s) => storey.faces.forEach((_face, f) => {
    const grid = layGrid(anatomy, s, f);
    const list = stacks.get(grid.name) ?? [];
    list.push(faces.length);
    stacks.set(grid.name, list);
    faces.push(grid);
  }));
  for (const list of stacks.values()) list.sort((a, b) => faces[a].storey - faces[b].storey);
  return { anatomy, faces, stacks };
}

/** The face a body-frame point strikes: nearest plane within 1.2 m, inside its span (±0.3 m) and its storey. */
export function struckFace(wall: WallFracture, x: number, y: number, z: number): { face: number; u: number; v: number } | null {
  let best = -1, bestD = 1.2, bu = 0, bv = 0;
  wall.faces.forEach((g, i) => {
    const dx = x - g.origin[0], dy = y - g.origin[1], dz = z - g.origin[2];
    const along = dx * g.u[0] + dy * g.u[1] + dz * g.u[2];
    const v = dy;
    if (Math.abs(along) > g.width / 2 + 0.3 || v < -0.3 || v > g.height + 0.3) return;
    const depth = dx * g.out[0] + dy * g.out[1] + dz * g.out[2];
    // in front of the face or inside the wall's thickness
    const d = depth >= 0 ? depth : Math.max(0, -depth - g.thickness);
    if (d < bestD) { bestD = d; best = i; bu = along; bv = v; }
  });
  return best >= 0 ? { face: best, u: bu, v: bv } : null;
}

/** Raise a cell's damage and its state with it (never back: a gone cell stays gone). */
function hurt(grid: FaceGrid, cell: number, amount: number): number {
  const was = grid.state[cell];
  if (was === CELL_OPENING || was === CELL_GONE || was === CELL_FALLEN) return was;
  const d = (grid.damage[cell] += amount);
  const next = d >= GONE_AT ? CELL_GONE : d >= SPALL_AT ? CELL_SPALLED : d >= CRACK_AT ? CELL_CRACKED : CELL_INTACT;
  if (next > was) grid.state[cell] = next;
  return grid.state[cell];
}

const standing = (state: number): boolean => state <= CELL_SPALLED;

/**
 * A round on a wall: breaks the struck face round its point and lets fall whatever lost its load path (every face of
 * that face's stack: a breach low in a wall can bring down the storeys over it). False when the point strikes no face.
 */
export function strikeWall(wall: WallFracture, strike: WallStrike, out: WallStrikeOutcome): boolean {
  out.knocked.length = 0; out.spalled.length = 0; out.cracked.length = 0; out.fallen.length = 0; out.sagged.length = 0;
  const hit = struckFace(wall, strike.x, strike.y, strike.z);
  if (!hit) return false;
  const grid = wall.faces[hit.face];
  out.face = hit.face; out.u = hit.u; out.v = hit.v;
  const R = Math.max(0.08, strike.radiusM);
  // rings: knocked through, the skin's recess, the cracks (a penetrator's recess is tight round its hole; a blast's wide)
  const recess = strike.kind === 'kinetic' ? 1.35 : strike.kind === 'shaped' ? 1.5 : 1.75;
  const cracks = strike.kind === 'kinetic' ? 2.0 : 2.7;
  const rows = grid.rowY.length - 1;
  for (let r = 0; r < rows; r++) {
    const vc = (grid.rowY[r] + grid.rowY[r + 1]) / 2;
    const dv = vc - hit.v;
    if (Math.abs(dv) > R * cracks * 1.15) continue;
    for (let c = grid.rowStart[r]; c < grid.rowStart[r + 1]; c++) {
      if (grid.state[c] === CELL_OPENING) continue;
      const uc = (grid.cellU[2 * c] + grid.cellU[2 * c + 1]) / 2;
      const du = uc - hit.u;
      const k = holeOutlineK(Math.atan2(dv, du), strike.seed);
      // the cell's nearest point to the strike, so a big cell under the hole's edge breaks with it
      const halfW = (grid.cellU[2 * c + 1] - grid.cellU[2 * c]) / 2, halfH = (grid.rowY[r + 1] - grid.rowY[r]) / 2;
      const nu = Math.max(0, Math.abs(du) - halfW * 0.6), nv = Math.max(0, Math.abs(dv) - halfH * 0.6);
      const reach = Math.hypot(nu, nv);
      const d = reach / k;
      // the rings round the hole follow its lobes only a little (the cracks run on past a lobe's notch)
      const dr = reach / (0.75 + 0.25 * k);
      const before = grid.state[c];
      let after = before;
      // through inside the outline; the recess ring spalls (0.7 at its inner edge, 0.45 at its outer: most of it loses
      // its skin, its rim only cracks); the crack ring cracks its inner half; a second round on the same ring takes it
      if (d <= R) after = hurt(grid, c, 1.2);
      else if (dr <= R * recess) after = hurt(grid, c, 0.7 - 0.25 * Math.max(0, dr - R) / (R * (recess - 1)));
      else if (dr <= R * cracks) after = hurt(grid, c, 0.32 - 0.12 * (dr - R * recess) / (R * (cracks - recess)));
      if (after === before) continue;
      if (after === CELL_GONE) out.knocked.push(c);
      else if (after === CELL_SPALLED) out.spalled.push(c);
      else if (after === CELL_CRACKED) out.cracked.push(c);
    }
  }
  settleLoads(wall, grid.name, out);
  return true;
}

/**
 * The load paths of one face stack, bottom-up: every standing cell that bears on nothing standing falls (as clusters in
 * `out.fallen`), every one that bears on less than half its width sags. Returns the cells fallen.
 */
export function settleLoads(wall: WallFracture, name: string, out: Pick<WallStrikeOutcome, 'fallen' | 'sagged'>): number {
  const stack = wall.stacks.get(name);
  if (!stack) return 0;
  const fresh: number[] = []; // face, cell pairs that fell this pass
  // supported[i] per face: 1 bears (through to the footing), 0 not
  const supported = stack.map((f) => new Uint8Array(wall.faces[f].state.length));
  for (let s = 0; s < stack.length; s++) {
    const grid = wall.faces[stack[s]];
    const sup = supported[s];
    const rows = grid.rowY.length - 1;
    const below = s > 0 ? wall.faces[stack[s - 1]] : null;
    const belowSup = s > 0 ? supported[s - 1] : null;
    for (let r = 0; r < rows; r++) {
      for (let c = grid.rowStart[r]; c < grid.rowStart[r + 1]; c++) {
        if (!standing(grid.state[c])) continue;
        const u0 = grid.cellU[2 * c], u1 = grid.cellU[2 * c + 1];
        let bearing = 0;
        let lintel = false;
        if (r === 0) {
          if (!below || !belowSup) bearing = u1 - u0; // the footing
          else bearing = bearOn(below, belowSup, below.rowY.length - 2, u0, u1, grid, below) || floorCarries(below, u0, u1);
        } else {
          bearing = bearOn(grid, sup, r - 1, u0, u1, grid, grid);
          if (bearing <= 0) lintel = overOpening(grid, sup, r - 1, u0, u1);
        }
        if (bearing > 0 || lintel) {
          sup[c] = 1;
          // bearing on less than half of itself (an undercut cell): it sags a little (once)
          if (!lintel && bearing < (u1 - u0) * 0.5 && grid.sag[c] === 0) {
            grid.sag[c] = SAG_M * (1 - bearing / Math.max(1e-6, (u1 - u0) * 0.5));
            out.sagged.push(stack[s], c);
          }
        } else {
          grid.state[c] = CELL_FALLEN;
          fresh.push(stack[s], c);
        }
      }
    }
  }
  if (fresh.length) clusterFallen(wall, stack, fresh, out.fallen);
  return fresh.length / 2;
}

/** How much of [u0, u1] row `r` of `grid` bears under it (m of overlap with standing, supported cells). */
function bearOn(grid: FaceGrid, sup: Uint8Array, r: number, u0: number, u1: number, _self: FaceGrid, _under: FaceGrid): number {
  if (r < 0) return 0;
  let bearing = 0;
  for (let c = grid.rowStart[r]; c < grid.rowStart[r + 1]; c++) {
    const a = grid.cellU[2 * c], b = grid.cellU[2 * c + 1];
    if (b <= u0 || a >= u1) continue;
    if (!standing(grid.state[c]) || !sup[c]) continue;
    bearing += Math.min(b, u1) - Math.max(a, u0);
  }
  // a sliver of contact is no bearing (a corner on a corner)
  return bearing >= (u1 - u0) * 0.2 ? bearing : 0;
}

/** An upper storey's bottom row over a lower face that does not reach under it (a jetty, a narrower storey): the floor
 *  slab carries it while the lower face's top row stands under any of the slab's span. */
function floorCarries(below: FaceGrid, u0: number, u1: number): number {
  const half = below.width / 2;
  return u1 <= -half || u0 >= half ? u1 - u0 : 0;
}

/** Whether [u0, u1] over row `r` stands on an opening whose lintel's two jambs bear (cells beside it in that row). */
function overOpening(grid: FaceGrid, sup: Uint8Array, r: number, u0: number, u1: number): boolean {
  let left = -1, right = -1, onOpening = false;
  for (let c = grid.rowStart[r]; c < grid.rowStart[r + 1]; c++) {
    const a = grid.cellU[2 * c], b = grid.cellU[2 * c + 1];
    if (b <= u0 || a >= u1) continue;
    if (grid.state[c] !== CELL_OPENING) return false;
    onOpening = true;
    if (left < 0) left = c;
    right = c;
  }
  if (!onOpening) return false;
  // walk out to the jambs: the first non-opening cell each side
  let l = left - 1;
  while (l >= grid.rowStart[r] && grid.state[l] === CELL_OPENING) l--;
  let rr = right + 1;
  while (rr < grid.rowStart[r + 1] && grid.state[rr] === CELL_OPENING) rr++;
  const jambL = l >= grid.rowStart[r] && standing(grid.state[l]) && sup[l] === 1;
  const jambR = rr < grid.rowStart[r + 1] && standing(grid.state[rr]) && sup[rr] === 1;
  // a face's end is a corner: it bears as a jamb
  const endL = l < grid.rowStart[r], endR = rr >= grid.rowStart[r + 1];
  return (jambL || endL) && (jambR || endR);
}

/** Group the cells that fell into clusters joined edge to edge (across a row, and up/down where they overlap). */
function clusterFallen(wall: WallFracture, stack: readonly number[], fresh: number[], clusters: number[][]): void {
  const key = (f: number, c: number) => f * 65536 + c;
  const pending = new Map<number, [number, number]>();
  for (let i = 0; i < fresh.length; i += 2) pending.set(key(fresh[i], fresh[i + 1]), [fresh[i], fresh[i + 1]]);
  const order = stack.slice();
  while (pending.size) {
    const [seedKey, seed] = pending.entries().next().value as [number, [number, number]];
    pending.delete(seedKey);
    const cluster: number[] = [];
    const queue: [number, number][] = [seed];
    while (queue.length) {
      const [f, c] = queue.pop()!;
      cluster.push(f, c);
      const g = wall.faces[f];
      const r = rowOfCell(g, c);
      const u0 = g.cellU[2 * c], u1 = g.cellU[2 * c + 1];
      const visit = (ff: number, cc: number) => {
        const k = key(ff, cc);
        const hit = pending.get(k);
        if (hit) { pending.delete(k); queue.push(hit); }
      };
      if (c > g.rowStart[r]) visit(f, c - 1);
      if (c + 1 < g.rowStart[r + 1]) visit(f, c + 1);
      const overlap = (gg: FaceGrid, rr: number, ff: number) => {
        for (let cc = gg.rowStart[rr]; cc < gg.rowStart[rr + 1]; cc++) {
          const a = gg.cellU[2 * cc], b = gg.cellU[2 * cc + 1];
          if (b > u0 + 1e-6 && a < u1 - 1e-6) visit(ff, cc);
        }
      };
      const rows = g.rowY.length - 1;
      if (r + 1 < rows) overlap(g, r + 1, f);
      if (r > 0) overlap(g, r - 1, f);
      const si = order.indexOf(f);
      if (r + 1 === rows && si + 1 < order.length) overlap(wall.faces[order[si + 1]], 0, order[si + 1]);
      if (r === 0 && si > 0) { const gb = wall.faces[order[si - 1]]; overlap(gb, gb.rowY.length - 2, order[si - 1]); }
    }
    clusters.push(cluster);
  }
}

function rowOfCell(grid: FaceGrid, cell: number): number {
  let lo = 0, hi = grid.rowStart.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (grid.rowStart[mid] <= cell) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/** A cell's rectangle on its face: u0, u1, y0, y1 (y over the storey floor). */
export function cellRect(grid: FaceGrid, cell: number, out: [number, number, number, number]): [number, number, number, number] {
  const r = rowOfCell(grid, cell);
  out[0] = grid.cellU[2 * cell]; out[1] = grid.cellU[2 * cell + 1];
  out[2] = grid.rowY[r]; out[3] = grid.rowY[r + 1];
  return out;
}

/** The empty outcome a caller reuses. */
export function createWallStrikeOutcome(): WallStrikeOutcome {
  return { face: -1, u: 0, v: 0, knocked: [], spalled: [], cracked: [], fallen: [], sagged: [] };
}

/** receipts: cells by state over the building. */
export function wallFractureCensus(wall: WallFracture): Record<'intact' | 'cracked' | 'spalled' | 'gone' | 'fallen' | 'opening', number> {
  const census = { intact: 0, cracked: 0, spalled: 0, gone: 0, fallen: 0, opening: 0 };
  const names = ['intact', 'cracked', 'spalled', 'gone', 'fallen', 'opening'] as const;
  for (const g of wall.faces) for (let i = 0; i < g.state.length; i++) census[names[g.state[i]]]++;
  return census;
}
