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
/** Outside the wall: a gable face's cells over its sloping edges (dcore 2026-10-11) — nothing there, never drawn,
 *  never struck, never bears, no reveal against it. */
export const CELL_VOID = 6;

/** Damage a cell takes before it cracks, spalls and goes. */
export const CRACK_AT = 0.25;
export const SPALL_AT = 0.5;
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

/** mulberry32 over a seed (the face's own joints). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
  /** The grid's height: the storey's face, and over a gable end the gable to its apex. */
  readonly height: number;
  /** The storey's own face height (under a gable: where the gable starts). */
  readonly wallHeight: number;
  /** A gable end's outline (dcore 2026-10-11, wave 388a: "the gable hangs over a blown-out wall: the load path has to
   *  drop it"): its top edge over the face's floor at GABLE_SAMPLES even steps along u, or null. */
  readonly gableTop: Float32Array | null;
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
  /** 1 where the cell is an opening's (a window's, a door's): kept when it falls with what held it. */
  readonly opening: Uint8Array;
  readonly damage: Float32Array;
  /** How far each cell has sagged (m, down). */
  readonly sag: Float32Array;
}

export interface WallFracture {
  readonly anatomy: StructureDamageAnatomy;
  readonly faces: FaceGrid[];
  /** Each face name's faces bottom-up (the stack an upper storey's bottom row bears on). */
  readonly stacks: ReadonlyMap<string, number[]>;
  /**
   * Sections on (DESTRUCTION.md §3.4): the sim holds a storey on its floor until its own fall, whatever went from under
   * it, so the field's upper storeys bear on their floor line too (a fall inside a storey still settles as it does).
   */
  floorsHold: boolean;
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

/** Samples of a gable's top edge along its face. */
export const GABLE_SAMPLES = 33;

/** A gable's top edge at u along its face (m over the face's floor), from its samples. */
export function gableTopAt(g: FaceGrid, u: number): number {
  const top = g.gableTop;
  if (!top) return g.wallHeight;
  const t = Math.max(0, Math.min(GABLE_SAMPLES - 1, ((u + g.width / 2) / g.width) * (GABLE_SAMPLES - 1)));
  const i = Math.min(GABLE_SAMPLES - 2, Math.floor(t));
  return top[i] + (top[i + 1] - top[i]) * (t - i);
}

/**
 * The gable over a top storey's face (a gable or half-hipped roof's end wall: the slopes fall along it, not off it):
 * its top edge sampled along u — under each slab's plane where the face's line passes beneath it — or null when the face
 * carries no gable a metre high.
 */
function gableOver(anatomy: StructureDamageAnatomy, storeyIndex: number, face: DamageFace): Float32Array | null {
  const roof = anatomy.roof;
  if (!roof || (roof.kind !== 'gable' && roof.kind !== 'halfhip') || storeyIndex !== anatomy.storeys.length - 1) return null;
  if (!roof.slabs.length) {
    // a kit that gives no slabs (the default kit's gable): the ridge along the building's length, its ends the gables, the
    // outline a plain triangle from the eaves at the corners to the ridge over the middle
    if (roof.kind !== 'gable') return null;
    const alongX = anatomy.w >= anatomy.d;
    if (Math.abs(alongX ? face.out[0] : face.out[2]) < 0.9) return null;
    const eave = Math.max(face.height, roof.eaveY - face.origin[1]), apex = roof.ridgeY - face.origin[1];
    if (!(apex - face.height > 0.8)) return null;
    const top = new Float32Array(GABLE_SAMPLES);
    for (let i = 0; i < GABLE_SAMPLES; i++) {
      const t = Math.abs((2 * i) / (GABLE_SAMPLES - 1) - 1);
      top[i] = Math.max(face.height, eave + (apex - eave) * (1 - t));
    }
    return top;
  }
  const slabs = roof.slabs.map((slab) => {
    const [c0, c1, , c3] = slab.corners;
    const a = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]], b = [c3[0] - c0[0], c3[1] - c0[1], c3[2] - c0[2]];
    let nx = a[1] * b[2] - a[2] * b[1], ny = a[2] * b[0] - a[0] * b[2], nz = a[0] * b[1] - a[1] * b[0];
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const c of slab.corners) { minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]); minZ = Math.min(minZ, c[2]); maxZ = Math.max(maxZ, c[2]); }
    return { p: c0, nx, ny, nz, minX, maxX, minZ, maxZ };
  });
  // the slopes fall across the face's normal (a gable end), never toward it (an eaves wall)
  const along = slabs.every((sl) => sl.ny < 0.999 && Math.abs(face.out[0] * sl.nx + face.out[2] * sl.nz) < 0.35 * Math.hypot(sl.nx, sl.nz) + 1e-6);
  if (!along) return null;
  const top = new Float32Array(GABLE_SAMPLES);
  let apex = 0;
  for (let i = 0; i < GABLE_SAMPLES; i++) {
    const u = -face.width / 2 + (face.width * i) / (GABLE_SAMPLES - 1);
    const x = face.origin[0] + face.u[0] * u, z = face.origin[2] + face.u[2] * u;
    let y = Infinity;
    for (const sl of slabs) {
      if (!(sl.ny > 0.2) || x < sl.minX - 0.6 || x > sl.maxX + 0.6 || z < sl.minZ - 0.6 || z > sl.maxZ + 0.6) continue;
      y = Math.min(y, sl.p[1] - (sl.nx * (x - sl.p[0]) + sl.nz * (z - sl.p[2])) / sl.ny);
    }
    top[i] = Number.isFinite(y) ? Math.max(face.height, y - face.origin[1]) : face.height;
    apex = Math.max(apex, top[i]);
  }
  return apex - face.height > 0.8 ? top : null;
}

function layGrid(anatomy: StructureDamageAnatomy, storeyIndex: number, faceIndex: number): FaceGrid {
  const storey = anatomy.storeys[storeyIndex];
  const face = storey.faces[faceIndex];
  const material = faceMaterial(face);
  const law = cellLaw(material);
  const wallHeight = Math.max(0.3, face.height);
  const gableTop = gableOver(anatomy, storeyIndex, face);
  let height = wallHeight;
  if (gableTop) for (let i = 0; i < gableTop.length; i++) height = Math.max(height, gableTop[i]);
  // the face's own joints, from the building's seed (every peer lays the same)
  const rand = seeded((anatomy.seed ^ Math.imul(storeyIndex * 8 + faceIndex + 1, 0x9e3779b1)) >>> 0);
  // rows: the masonry's courses grouped to the law's height where the kit gave them, else even rows
  const rowsY: number[] = [0];
  const courses = face.masonry?.courses;
  if (courses && courses.length > 2) {
    let last = 0;
    for (const c of courses) if (c - last >= law.h * 0.85 && wallHeight - c >= law.h * 0.5) { rowsY.push(c); last = c; }
  } else {
    // even rows, each line nudged up or down a little (a cast or framed wall breaks in uneven bands, not a grid)
    const rows = Math.max(1, Math.round(wallHeight / law.h));
    for (let r = 1; r < rows; r++) rowsY.push((wallHeight * (r + (rand() - 0.5) * (law.bonded ? 0.15 : 0.35))) / rows);
  }
  rowsY.push(wallHeight);
  // the gable's courses over the wall, even to its apex
  if (height > wallHeight + 0.05) {
    const rows = Math.max(1, Math.round((height - wallHeight) / law.h));
    for (let r = 1; r <= rows; r++) rowsY.push(wallHeight + ((height - wallHeight) * r) / rows);
  }
  const cols = Math.max(1, Math.round(face.width / law.w));
  const cw = face.width / cols;
  const rowStart: number[] = [];
  const cellU: number[] = [];
  // each joint along a row nudged a little from the even pitch (a bonded wall's by a fifth of a cell, a cast or framed
  // one's by two fifths): the break follows uneven joints, never a ruled grid
  const nudge = (law.bonded ? 0.2 : 0.4) * cw;
  for (let r = 0; r + 1 < rowsY.length; r++) {
    rowStart.push(cellU.length / 2);
    const shift = law.bonded && cols > 1 && r % 2 === 1 ? cw * 0.5 : 0;
    let u = -face.width / 2;
    if (shift > 0) { const u1 = u + shift + (rand() - 0.5) * nudge * 0.5; cellU.push(u, u1); u = u1; }
    while (u < face.width / 2 - 1e-6) {
      const u1 = Math.min(face.width / 2, u + cw + (rand() - 0.5) * nudge);
      // a sliver at the row's end joins its neighbour
      if (face.width / 2 - u1 < cw * 0.35) { cellU.push(u, face.width / 2); break; }
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
      // over the gable's sloping edges: nothing there
      if (gableTop && y0 >= wallHeight - 1e-4) {
        const gtop = (u: number) => {
          const t = Math.max(0, Math.min(GABLE_SAMPLES - 1, ((u + face.width / 2) / face.width) * (GABLE_SAMPLES - 1)));
          const i = Math.min(GABLE_SAMPLES - 2, Math.floor(t));
          return gableTop[i] + (gableTop[i + 1] - gableTop[i]) * (t - i);
        };
        if (y0 >= Math.max(gtop(u0), gtop(u1), gtop((u0 + u1) / 2)) - 0.02) state[c] = CELL_VOID;
      }
    }
  }
  const skin = face.layers.length > 1 ? Math.max(0.02, face.layers[0].thicknessM || 0.03) : Math.min(0.06, faceWallThickness(face) * 0.3);
  return {
    storey: storeyIndex, faceIndex, section: face.section, name: face.name,
    origin: face.origin, u: face.u, out: face.out, width: face.width, height, wallHeight, gableTop,
    thickness: faceWallThickness(face), skinM: skin, material, bonded: law.bonded,
    rowY: Float32Array.from(rowsY), rowStart: Int32Array.from(rowStart), cellU: Float32Array.from(cellU),
    state, opening: Uint8Array.from(state, (v) => (v === CELL_OPENING ? 1 : 0)), damage: new Float32Array(n), sag: new Float32Array(n),
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
  return { anatomy, faces, stacks, floorsHold: false };
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
  if (was === CELL_OPENING || was === CELL_GONE || was === CELL_FALLEN || was === CELL_VOID) return was;
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
      if (grid.state[c] === CELL_VOID) continue;
      const opening = grid.state[c] === CELL_OPENING;
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
      // (dcore 2026-10-11, wave 397: "some AP darts still leave puffs on unbroken brick": three of fr-barn-ap's six darts
      // struck the barn's door, whose cells a round left be) a penetrator goes through a door's leaf or a window's sash
      // where it strikes; a burst tears out the middle of its hole, and what is left of the leaf hangs in its jambs or
      // falls with them (the rings round a hole leave an opening be)
      if (opening) {
        if (d <= (strike.kind === 'kinetic' ? R : R * 0.5)) { grid.state[c] = CELL_GONE; out.knocked.push(c); }
        continue;
      }
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
  const bearings = new Float32Array(64);
  for (let s = 0; s < stack.length; s++) {
    const grid = wall.faces[stack[s]];
    const sup = supported[s];
    const rows = grid.rowY.length - 1;
    const below = s > 0 ? wall.faces[stack[s - 1]] : null;
    const belowSup = s > 0 ? supported[s - 1] : null;
    // what spans a gap in a row: the wall's own bond or frame inside a storey, the floor's beams on a storey line
    const wallSpan = spanOf(grid.material);
    const floorSpan = s > 0 ? floorSpanOf(wall.anatomy.storeys[grid.storey]?.floor?.structure.material) : 0;
    for (let r = 0; r < rows; r++) {
      const c0 = grid.rowStart[r], c1 = grid.rowStart[r + 1];
      // 1. what each cell bears on below it (or an opening's lintel on both its jambs)
      for (let c = c0; c < c1; c++) {
        bearings[Math.min(63, c - c0)] = 0;
        if (!standing(grid.state[c])) continue;
        const u0 = grid.cellU[2 * c], u1 = grid.cellU[2 * c + 1];
        let bearing = 0;
        let lintel = false;
        if (r === 0) {
          if (!below || !belowSup || wall.floorsHold) bearing = u1 - u0; // the footing, or a floor the sim holds up
          else bearing = bearOn(below, belowSup, below.rowY.length - 2, u0, u1, grid, below) || floorCarries(below, u0, u1);
        } else {
          bearing = bearOn(grid, sup, r - 1, u0, u1, grid, grid);
          if (bearing <= 0) lintel = overOpening(grid, sup, r - 1, u0, u1);
        }
        if (bearing > 0 || lintel) {
          sup[c] = 1;
          bearings[Math.min(63, c - c0)] = lintel ? u1 - u0 : bearing;
        }
      }
      // 2. a run of cells that bear on nothing is carried across when it is short enough for what spans it (a bonded
      //    course arches over a brick's gap, a frame's rail over a panel's, a floor's beams over a pier's) and both its
      //    ends bear (a face's end is its corner: it bears)
      const span = r === 0 && s > 0 ? Math.max(wallSpan, floorSpan) : wallSpan;
      for (let c = c0; c < c1;) {
        if (!standing(grid.state[c]) || sup[c]) { c++; continue; }
        let e = c;
        while (e + 1 < c1 && standing(grid.state[e + 1]) && !sup[e + 1]) e++;
        const length = grid.cellU[2 * e + 1] - grid.cellU[2 * c];
        const leftEnd = c === c0 || (standing(grid.state[c - 1]) && sup[c - 1] === 1);
        const rightEnd = e === c1 - 1 || (standing(grid.state[e + 1]) && sup[e + 1] === 1);
        if (length <= span + 1e-6 && leftEnd && rightEnd) for (let k = c; k <= e; k++) sup[k] = 1;
        c = e + 1;
      }
      // 3. what still bears on nothing falls; what bears on less than half of itself sags a little (once)
      for (let c = c0; c < c1; c++) {
        if (!standing(grid.state[c])) continue;
        const u0 = grid.cellU[2 * c], u1 = grid.cellU[2 * c + 1];
        if (!sup[c]) {
          grid.state[c] = CELL_FALLEN;
          fresh.push(stack[s], c);
          continue;
        }
        const bearing = bearings[Math.min(63, c - c0)];
        if (bearing < (u1 - u0) * 0.5 && grid.sag[c] === 0) {
          grid.sag[c] = SAG_M * (1 - bearing / Math.max(1e-6, (u1 - u0) * 0.5));
          out.sagged.push(stack[s], c);
        }
      }
      // 4. an opening (its frame, its sash, its door) stands in its jambs: with both of them gone it falls too (a face's
      //    end is a corner and stands)
      for (let c = c0; c < c1;) {
        if (grid.state[c] !== CELL_OPENING) { c++; continue; }
        let e = c;
        while (e + 1 < c1 && grid.state[e + 1] === CELL_OPENING) e++;
        const leftStands = c === c0 || standing(grid.state[c - 1]);
        const rightStands = e === c1 - 1 || standing(grid.state[e + 1]);
        if (!leftStands && !rightStands) for (let k = c; k <= e; k++) { grid.state[k] = CELL_FALLEN; fresh.push(stack[s], k); }
        c = e + 1;
      }
    }
  }
  if (fresh.length) clusterFallen(wall, stack, fresh, out.fallen);
  return fresh.length / 2;
}

/**
 * A wall section fell (sections on: the sim's `sectionDown` for this storey's face): every standing cell of the face whose
 * row stands over `stubV` (m over the storey floor: the ground storey keeps its stub, an upper storey none) falls, and a
 * door's or a gate's (an opening down to the floor) with it whatever its height, so the stub leaves a gap down to the sill
 * and no leaf stands alone in a ruin; what lost its load path over it (a gable) follows. The clusters in `out.fallen`.
 */
export function dropFace(wall: WallFracture, face: number, stubV: number, out: WallStrikeOutcome): number {
  out.knocked.length = 0; out.spalled.length = 0; out.cracked.length = 0; out.fallen.length = 0; out.sagged.length = 0;
  const g = wall.faces[face];
  if (!g) return 0;
  const fresh: number[] = [];
  const rows = g.rowY.length - 1;
  for (let r = 0; r < rows; r++) {
    const over = (g.rowY[r] + g.rowY[r + 1]) / 2 >= stubV;
    for (let c = g.rowStart[r]; c < g.rowStart[r + 1]; c++) {
      const st = g.state[c];
      if (st === CELL_VOID || st === CELL_GONE || st === CELL_FALLEN) continue;
      if (!over && !(st === CELL_OPENING && openingReachesFloor(g, c))) continue;
      g.state[c] = CELL_FALLEN;
      fresh.push(face, c);
    }
  }
  // what stood on it loses its path too (its own clusters), then the face's own
  settleLoads(wall, g.name, out);
  const stack = wall.stacks.get(g.name) ?? [face];
  if (fresh.length) clusterFallen(wall, stack, fresh, out.fallen);
  return fresh.length / 2;
}

/** Whether an opening cell's opening reaches its face's floor (a door, a gate: its u span over row 0 is an opening's). */
function openingReachesFloor(g: FaceGrid, cell: number): boolean {
  const u0 = g.cellU[2 * cell], u1 = g.cellU[2 * cell + 1];
  for (let c = g.rowStart[0]; c < g.rowStart[1]; c++) {
    const a = g.cellU[2 * c], b = g.cellU[2 * c + 1];
    if (b > u0 + 1e-4 && a < u1 - 1e-4 && g.opening[c] === 1) return true;
  }
  return false;
}

/** The longest gap (m) a row of a wall of this material carries across inside a storey: a bonded course arches over a
 *  brick's width, a frame's rails over a panel's, cast concrete over its reinforcement's. */
function spanOf(material: FractureMaterial): number {
  switch (material) {
    case 'brick': case 'stone': case 'rubble': case 'adobe': return 0.6;
    case 'concrete': return 2.5;
    case 'timber': case 'infill': case 'plank': return 2.0;
    case 'metal': return 1.5;
    default: return 0.6;
  }
}

/** The longest gap (m) a storey line carries the storey over it across: its floor's beams (timber joists, a cast slab). */
function floorSpanOf(material: FractureMaterial | undefined): number {
  return material === 'concrete' ? 4.0 : 3.0;
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

/**
 * Whether [u0, u1] over row `r` stands on an opening whose lintel's two jambs bear (cells beside it in that row). The
 * opening is its frame as built (`grid.opening`): a leaf or a sash shot through under it carries nothing, so its lintel
 * still spans from jamb to jamb.
 */
function overOpening(grid: FaceGrid, sup: Uint8Array, r: number, u0: number, u1: number): boolean {
  let left = -1, right = -1, onOpening = false;
  for (let c = grid.rowStart[r]; c < grid.rowStart[r + 1]; c++) {
    const a = grid.cellU[2 * c], b = grid.cellU[2 * c + 1];
    if (b <= u0 || a >= u1) continue;
    if (grid.opening[c] !== 1) return false;
    onOpening = true;
    if (left < 0) left = c;
    right = c;
  }
  if (!onOpening) return false;
  // walk out to the jambs: the first non-opening cell each side
  let l = left - 1;
  while (l >= grid.rowStart[r] && grid.opening[l] === 1) l--;
  let rr = right + 1;
  while (rr < grid.rowStart[r + 1] && grid.opening[rr] === 1) rr++;
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
  for (const g of wall.faces) for (let i = 0; i < g.state.length; i++) if (g.state[i] !== CELL_VOID) census[names[g.state[i]]]++;
  return census;
}
