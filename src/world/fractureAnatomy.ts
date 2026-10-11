/**
 * fractureAnatomy.ts — what a destructible kit hands the destruction core so its build can break physically
 * (destruction core lane with the destructible-buildings redesign lane, 2026-10-10; the owner: "the destruction of
 * buildings needs to be a lot better too, rn its way to sporadic and ugly instead of behaving like it would with
 * physics").
 *
 * A kit builds its kind as it always has (one intact, non-indexed geometry a kind a map, in one material) and lays its
 * pieces in it as contiguous triangle runs: every piece — a footing, a post, a panel of boards, a roof sheet, a cast
 * section — is exactly its own run, so the core never searches for islands. Beside the triangles the kit says what each
 * piece is (its role and material), where it is (an oriented box that encloses its triangles within 2 cm: the body's
 * shape when it falls), what it weighs, where it snaps (scores along one of its box axes) and what holds what (links,
 * the support graph). Anchors (footings, buried piers, a cast base) hold everything that reaches them through unbroken
 * links; a piece that loses every path to an anchor falls as a rigid body (fx/debrisPhysics.ts), comes to rest and stays
 * where it lies.
 *
 * Who does what: the kit owns the design (the geometry, materials, detail and the art of a broken edge: `edge` below);
 * the core owns the behaviour (which pieces a hit breaks and where, which links fail, what falls, the bodies, the heap,
 * the dust and the sound) and calls the kit's edge art once a kind a map at build, caching the snapped halves.
 *
 * Conventions (all numbers; THREE-free; deterministic from the kit's own rng):
 *  - The prop frame: base at y = 0, centred on the footprint, +Z along the kind's length (its `hl`), +Y up — the frame
 *    the pool draws the kind in and the core's body frame.
 *  - Units SI: metres, kilograms, seconds, newtons, joules.
 *  - `q` is a unit quaternion (x, y, z, w) turning the box's local axes into the prop frame; `h` its half extents
 *    along those axes; `c` its centre.
 *  - `scores` are signed metres from `c` along local axis `scoreAxis` (default: the axis of the largest half extent),
 *    each within ±h[scoreAxis]; at most six a piece.
 *  - Links are undirected. `strengthN` is the load a link carries before it fails (absent: the core's table by link
 *    kind and material); a piece's `toughnessJ` overrides the core's table by material.
 *  - Caps: at most 48 pieces a light kind (a shed, a hide, a hut), 64 a fortified one (a pillbox); boards go in panels
 *    of three to five with internal scores. The world's body pool is shared (about 128 live bodies).
 *
 * Carried on the kind's intact build: `geometry.userData.fracture = KitFractureAnatomy`.
 */
import type { FractureMaterial } from './destructionKit.ts';

export type Vec3 = readonly [number, number, number];

export type FractureRole = 'footing' | 'slab' | 'wall' | 'roof' | 'post' | 'stud' | 'sill' | 'plate' | 'girt' | 'purlin'
  | 'rafter' | 'brace' | 'board' | 'sheet' | 'door' | 'shutter' | 'frame' | 'bag' | 'fitting' | 'chimney';

/** The face a piece belongs to (a hit's point and normal find the struck face's pieces first). */
export type FractureFace = 'front' | 'right' | 'back' | 'left' | 'roof' | 'floor';

export type FractureLinkKind = 'rest' | 'nail' | 'bolt' | 'cast' | 'weld' | 'lash' | 'mortar';

export interface FracturePiece {
  role: FractureRole;
  material: FractureMaterial;
  /** The props bucket it draws in (the kind's one material: 'structureWood', 'structureMetal', 'structureCanvas' …). */
  bucket: string;
  /** Its contiguous run in the non-indexed intact geometry, in triangles: [tri0, tri0 + triN). */
  tri0: number;
  triN: number;
  /** Its oriented box in the prop frame (encloses its triangles within 2 cm). */
  c: Vec3;
  h: Vec3;
  q: readonly [number, number, number, number];
  massKg: number;
  /** A root of the support graph (a footing, a buried pier, a cast base): never falls. */
  anchor?: true;
  face?: FractureFace;
  /** The box's local axis its scores lie along (default: the axis of its largest half extent). */
  scoreAxis?: 0 | 1 | 2;
  /** Where it snaps: at most six, signed metres from `c` along `scoreAxis`. */
  scores?: readonly number[];
  /** Concrete's reinforcement (a cast section cracks on its rebar and hangs on it before it lets go). */
  rebar?: { pitchM: number; diaM: number };
  toughnessJ?: number;
  /** Contact points in the piece's box frame for a piece its box fits badly (a curled sheet, a chimney): the physics
   *  lane's box contact points, rounded by `edgeRadiusM`. */
  points?: readonly Vec3[];
  edgeRadiusM?: number;
}

export interface FractureLink {
  a: number;
  b: number;
  kind: FractureLinkKind;
  strengthN?: number;
}

export interface KitFractureAnatomy {
  /** The kind (structureKit / inhabitKit type id). */
  kind: string;
  pieces: readonly FracturePiece[];
  links: readonly FractureLink[];
}

/** Pieces a kind may carry: a light kind (a shed, a hide, a hut) or a fortified one (a pillbox). */
export const FRACTURE_PIECE_CAP = { light: 48, fortified: 64 } as const;
/** Scores a piece may carry. */
export const FRACTURE_SCORE_CAP = 6;
/** How far a piece's triangles may stand outside its box (m). */
export const FRACTURE_BOX_SLACK_M = 0.02;

/**
 * Everything wrong with a kind's anatomy against its intact geometry's positions (non-indexed, xyz per corner), or an
 * empty list. The kit lanes run it in their receipts; the core runs it before it takes a kind (a kind that fails is
 * drawn and broken the old way, never half-physically).
 */
export function checkKitFracture(anatomy: KitFractureAnatomy, positions: ArrayLike<number>,
  cap: number = FRACTURE_PIECE_CAP.light): string[] {
  const problems: string[] = [];
  const say = (text: string): void => { if (problems.length < 24) problems.push(text); };
  const { pieces, links } = anatomy;
  const triangles = Math.floor(positions.length / 9);
  if (positions.length % 9 !== 0) say(`positions are not whole triangles (${positions.length} floats)`);
  if (!pieces.length) say('no pieces');
  if (pieces.length > cap) say(`${pieces.length} pieces, over the cap of ${cap}`);
  // runs: contiguous, in range, disjoint, covering every triangle (the live draw draws pieces only)
  const order = pieces.map((_piece, index) => index).sort((a, b) => pieces[a].tri0 - pieces[b].tri0);
  let next = 0;
  for (const index of order) {
    const piece = pieces[index];
    if (!Number.isInteger(piece.tri0) || !Number.isInteger(piece.triN) || piece.triN <= 0) { say(`piece ${index}: bad run`); continue; }
    if (piece.tri0 !== next) say(`piece ${index}: run starts at ${piece.tri0}, expected ${next} (gap or overlap)`);
    next = piece.tri0 + piece.triN;
  }
  if (next !== triangles) say(`runs end at triangle ${next} of ${triangles}`);
  let anchors = 0;
  pieces.forEach((piece, index) => {
    if (!piece.bucket) say(`piece ${index}: no bucket`);
    if (!(piece.massKg > 0)) say(`piece ${index}: mass ${piece.massKg}`);
    if (piece.anchor) anchors++;
    const [qx, qy, qz, qw] = piece.q;
    const norm = Math.hypot(qx, qy, qz, qw);
    if (Math.abs(norm - 1) > 1e-3) { say(`piece ${index}: quaternion not unit (${norm.toFixed(4)})`); return; }
    if (!piece.h.every((value) => value > 0)) say(`piece ${index}: half extents ${piece.h.join(', ')}`);
    const axis = piece.scoreAxis ?? (piece.h[0] >= piece.h[1] && piece.h[0] >= piece.h[2] ? 0 : piece.h[1] >= piece.h[2] ? 1 : 2);
    if ((piece.scores?.length ?? 0) > FRACTURE_SCORE_CAP) say(`piece ${index}: ${piece.scores!.length} scores`);
    for (const score of piece.scores ?? []) {
      if (!(Math.abs(score) < piece.h[axis])) say(`piece ${index}: score ${score} outside its box (±${piece.h[axis]})`);
    }
    // its triangles inside its box: each corner turned into the box frame by the inverse rotation
    let worst = 0;
    const end = Math.min(triangles, piece.tri0 + piece.triN) * 9;
    for (let i = Math.max(0, piece.tri0) * 9; i < end; i += 3) {
      const dx = positions[i] - piece.c[0], dy = positions[i + 1] - piece.c[1], dz = positions[i + 2] - piece.c[2];
      // v' = conj(q) v q: t = 2 (−q × v); v' = v + w t + (−q) × t
      const tx = 2 * (-qy * dz + qz * dy), ty = 2 * (-qz * dx + qx * dz), tz = 2 * (-qx * dy + qy * dx);
      const lx = dx + qw * tx + (-qy * tz + qz * ty);
      const ly = dy + qw * ty + (-qz * tx + qx * tz);
      const lz = dz + qw * tz + (-qx * ty + qy * tx);
      worst = Math.max(worst, Math.abs(lx) - piece.h[0], Math.abs(ly) - piece.h[1], Math.abs(lz) - piece.h[2]);
    }
    if (worst > FRACTURE_BOX_SLACK_M) say(`piece ${index}: triangles ${worst.toFixed(3)} m outside its box`);
  });
  if (!anchors) say('no anchor');
  // links in range, distinct, and every piece held: a path of links to an anchor
  const adjacency: number[][] = pieces.map(() => []);
  const seen = new Set<string>();
  links.forEach((link, index) => {
    const { a, b } = link;
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= pieces.length || b >= pieces.length || a === b) {
      say(`link ${index}: bad ends ${a}-${b}`);
      return;
    }
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(key)) say(`link ${index}: ${key} twice`);
    seen.add(key);
    if (link.strengthN !== undefined && !(link.strengthN > 0)) say(`link ${index}: strength ${link.strengthN}`);
    adjacency[a].push(b);
    adjacency[b].push(a);
  });
  const held = new Uint8Array(pieces.length);
  const queue: number[] = [];
  pieces.forEach((piece, index) => { if (piece.anchor) { held[index] = 1; queue.push(index); } });
  while (queue.length) for (const other of adjacency[queue.pop()!]) if (!held[other]) { held[other] = 1; queue.push(other); }
  const loose = pieces.map((_piece, index) => index).filter((index) => !held[index]);
  if (loose.length) say(`pieces not held by any anchor: ${loose.slice(0, 8).join(', ')}${loose.length > 8 ? ' …' : ''}`);
  return problems;
}
