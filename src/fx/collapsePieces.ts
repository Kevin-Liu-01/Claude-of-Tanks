/**
 * collapsePieces.ts — how a building comes apart when it collapses (destruction core lane, 2026-10-10; the owner:
 * "make thier collapses much more natural" and "just let physics work for these kinds of things").
 *
 * The plan cuts the building as its kit described it (StructureDamageAnatomy, body frame) into the pieces its collapse
 * throws, for the presentation's debris pool (fx/debrisPhysics.ts) to let fall:
 *  - every storey's faces into wall panels, split between their openings (3.8 m apart on a house, wider on a hall,
 *    one a face on a shed, wider still when the building would throw more than its cap);
 *  - the ground storey's walls only above their stubs: the stubs (a hand to a metre over the heap banked against the
 *    wall, a pier at each corner) stay standing, and the panels stand on them;
 *  - a floor slab at every storey line, resting on the walls below it and carrying the walls above it;
 *  - the roof's slabs, halved when long; the gables over the eaves; the chimneys (a ground stack keeps its foot).
 * Each piece is a box proxy (centre, half extents, rotation in the body frame; an end panel's pier notch makes it two
 * boxes), with its mass by its material, the slots its skin and broken edges draw in, and its start: the struck face's
 * panels pushed in by the blow, the rest let go a little later with a push off their feet and a tip, so they fall as
 * they lose what held them (the pool's bodies wait, asleep and solid, until then or until something strikes them).
 *
 * The plan also partitions the building's own triangles (`partitionTriangles`): every piece draws exactly the part of
 * the building it was — its facade, windows, trims and roof covering — and `capPiece` closes its broken edges in its
 * core and its back in its inner face, so the swap from the standing building to its pieces shows nothing.
 *
 * Pure (no three.js, no DOM), allocation at plan and partition time only, deterministic from the anatomy's seed and the
 * blow: Node-runnable for its receipt (collapsePieces.selftest.mjs).
 */
import {
  bodyMoundHeightAt, damageRng, damageSeed,
  type DamageFace, type FractureMaterial, type FractureSlot, type StructureDamageAnatomy, type Vec3,
} from '../world/destructionKit.ts';
import type { CollisionRecord } from '../world/collision.ts';
import { createRigidBox, createRigidShape, type RigidShape } from '../sim/rigidBody.ts';

type CollapsePieceKind = 'wall' | 'floor' | 'roof' | 'gable' | 'chimney' | 'drum' | 'crown';

/** A box of a piece's proxy, in the piece's own frame (its centre and axes; its own rotation in that frame when it is
 *  a chimney riding a roof slab, which also lays no caps: the stack's own faces are the building's). */
interface CollapseBox {
  center: [number, number, number];
  half: [number, number, number];
  rotation?: [number, number, number, number];
}

/**
 * A part of a piece that breaks off when it lands hard (a wall panel cracks into two to four on its first heavy landing):
 * its box in the piece's frame, its mass and its rectangle on the face.
 */
interface CollapsePart {
  readonly center: [number, number, number];
  readonly half: [number, number, number];
  readonly massKg: number;
  readonly rect: { u0: number; u1: number; y0: number; y1: number };
}

/** A partition key's stride: a piece's key is its index × this + its part (a piece has fewer parts than this). */
export const PART_STRIDE = 16;

export interface CollapsePiece {
  readonly index: number;
  readonly kind: CollapsePieceKind;
  /** The piece's frame in the body frame: its centre and rotation (x along the face, y up, z out for a wall). */
  readonly center: [number, number, number];
  readonly rotation: [number, number, number, number];
  /** The proxy: one box, or two for an end panel notched over its corner pier (the piece's own frame). */
  readonly boxes: CollapseBox[];
  readonly massKg: number;
  /** What it sounds and breaks like. */
  readonly material: FractureMaterial;
  /** Its broken edges' slot, and its back's (a wall's inner face, a roof's underside, a floor's ceiling). */
  readonly core: FractureSlot;
  readonly back: FractureSlot;
  /** A wall panel's place on its face (u along it, y over the storey floor, its thickness behind the face). */
  readonly face: { storey: number; face: number; u0: number; u1: number; y0: number; y1: number; thickness: number } | null;
  /** Seconds after the collapse it is let go (it stands until then, or until something strikes it). */
  readonly releaseS: number;
  /**
   * What lets it go then: the velocity a push gives the point `kickAt` (piece frame) — a wall's top shoved over, the
   * struck face's driven in, a roof slab's low corner dropped; 0 for a piece that waits for its support to go (a floor).
   * Body frame, m/s (the impulse is the piece's mass times it).
   */
  readonly kick: [number, number, number];
  readonly kickAt: [number, number, number];
  /**
   * When the blow's failure reaches it (s after the collapse; −1: never): it bursts into the kit's pieces and its dust
   * where it stood and leaves the pool, and what it held (the floor, the walls above, the roof) loses its support there.
   * The struck face's ground storey goes at once; on a building of storeys the faces beside it a beat later (a wall
   * held down by the floor over it cannot be shoved over: its foot gives), and the floor and all over it fold into the
   * gap; the far face is shoved over last.
   */
  readonly shatterS: number;
  /** The parts it breaks into on its first hard landing (none: it stays whole), and their cuts: along `u` and `v` of
   *  its part frame (a wall's face: u along it, v up; a floor's: the body's x and z; a roof slab's: along its eave and up
   *  its slope), measured from the frame's origin. */
  readonly parts: readonly CollapsePart[];
  readonly partCutsU: readonly number[];
  readonly partCutsY: readonly number[];
  readonly partFrame: { origin: Vec3; u: Vec3; v: Vec3 } | null;
}

/** The blow that brought it down, in the body frame (the stage event's direction and point). */
export interface CollapseBlow {
  cause: 'blast' | 'kinetic' | 'ram' | string | null;
  /** Direction into the building (body frame); 0, 0 for none. */
  dirX: number;
  dirZ: number;
  /** The blow's point (body frame), or null. */
  point: [number, number, number] | null;
}

interface FacePlan {
  face: DamageFace;
  index: number;
  side: number;
  thickness: number;
  /** u splits between its panels (ascending, inside the face) and each panel's piece index. */
  splits: number[];
  panels: number[];
  /** The ground storey's stub tops (y over the storey floor) by panel, and the corner piers' tops. */
  stubTop: number[];
  pierTop: [number, number];
  pierW: number;
  /** Its own extent along u: a face along x stops short of the corners the faces along z hold. */
  uMin: number;
  uMax: number;
}

interface StoreyPlan {
  index: number;
  /** The wall band (body y): from its floor (or the stub cut) to under the next floor slab (or the eaves). */
  y0: number;
  y1: number;
  bySide: (FacePlan | null)[];
  faces: FacePlan[];
  /** The floor slab over this storey's walls (the next storey's floor): piece index and band, or -1. */
  floorPiece: number;
  floorY0: number;
  floorY1: number;
}

interface RoofSlabPlan {
  /** A point on the covering's plane and its normal (up and out). */
  p: Vec3;
  n: Vec3;
  /** In-plane axes: e along the eave, f up the slope. */
  e: Vec3;
  f: Vec3;
  /** Bounds in (e, f) about p; the top edge's along e (a trapezoid's ridge is shorter than its eave). */
  e0: number; e1: number; f0: number; f1: number;
  topE0: number; topE1: number;
  /** Its outline in (e, f), in order (a hip's triangle repeats a corner). */
  outline: [number, number][];
  /** Its parts: cut across e at these offsets; each part's piece. */
  cuts: number[];
  pieces: number[];
}

interface GablePlan {
  face: DamageFace;
  thickness: number;
  piece: number;
}

interface ChimneyPlan {
  min: Vec3;
  max: Vec3;
  /** Below this (body y) the stack stays standing; −Infinity when it all falls. */
  breakY: number;
  /** Its own piece above the roof (−1: none — it stands, all of it, or goes with the roof's triangles). */
  piece: number;
  /** The roof's covering at its highest over the stack's footprint (body y; −Infinity: no slab over it). */
  roofY: number;
  /** A chimney rising from the roof: its attic part (under the covering) is dropped, not kept. */
  fromRoof: boolean;
}

/** The plan: the pieces, and what the partition needs to cut the building's triangles between them. */
export interface CollapsePlan {
  readonly pieces: readonly CollapsePiece[];
  readonly structureIdx: number;
  /** Below this (body y) everything stays (the plinth, the footings). */
  readonly groundY: number;
  readonly eaveY: number;
  readonly cx: number;
  readonly cz: number;
  readonly hw: number;
  readonly hd: number;
  readonly storeys: readonly StoreyPlan[];
  readonly roof: readonly RoofSlabPlan[];
  readonly gables: readonly GablePlan[];
  readonly chimneys: readonly ChimneyPlan[];
  /** The struck face's side (0 +x, 1 −x, 2 +z, 3 −z), or −1. */
  readonly struckSide: number;
  /** The chimneys' bucket (a stack's broken top draws in it). */
  readonly chimneyBucket: string;
  /**
   * A shaft (a stack, a water tower, a minaret, a tower: the kit reads it as one) topples as a stack of drums over its
   * stump instead: its stump's top, the drums' bounds up it (ascending, from the stump's top) and their pieces, its crown.
   */
  readonly shaft: { stumpY: number; bounds: number[]; drums: number[]; crown: { min: Vec3; max: Vec3; piece: number } | null;
    slot: FractureSlot } | null;
}

interface CollapsePlanOptions {
  /** Pieces at most (default: 24; a shed 12). */
  cap?: number;
}

// ---- materials ---------------------------------------------------------------------------------------------------

/** Bulk density (kg/m³) of a wall's core by its material. */
const DENSITY: Readonly<Record<FractureMaterial, number>> = Object.freeze({
  brick: 1800, stone: 2300, rubble: 2000, concrete: 2300, adobe: 1600, plaster: 1500, timber: 550, infill: 1150,
  plank: 500, metal: 7800, glass: 2500, tile: 1800, slate: 2700, thatch: 250, earth: 1500, canvas: 300,
});
/** A roof covering's weight (kg/m²); its structure adds ROOF_FRAME_KG_M2. */
const COVERING_KG_M2: Readonly<Partial<Record<FractureMaterial, number>>> = Object.freeze({
  tile: 55, slate: 45, thatch: 40, earth: 250, metal: 12, plank: 25, canvas: 3, concrete: 420, timber: 30,
});
const ROOF_FRAME_KG_M2 = 25;
/** A sheet or plank wall is thin whatever its layers say. */
const THIN_WALL_M = 0.08;
const MIN_WALL_M = 0.12;
const MAX_WALL_M = 0.7;
/** Gaps between stacked or neighbouring proxies (m): no body starts inside another. */
const GAP_M = 0.012;
/** The top storey's proxies stop this far under the eaves (the roof slab's box dips over the wall plate). */
const EAVE_GUARD_M = 0.22;

const SIDES: readonly Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];

function sideOf(out: Vec3): number {
  return Math.abs(out[0]) >= Math.abs(out[2]) ? (out[0] >= 0 ? 0 : 1) : (out[2] >= 0 ? 2 : 3);
}

function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** The rotation whose columns are x, y, z (an orthonormal right-handed basis). */
function quatFromAxes(x: Vec3, y: Vec3, z: Vec3): [number, number, number, number] {
  const m00 = x[0], m01 = y[0], m02 = z[0], m10 = x[1], m11 = y[1], m12 = z[1], m20 = x[2], m21 = y[2], m22 = z[2];
  const tr = m00 + m11 + m22;
  let qx: number, qy: number, qz: number, qw: number;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    qw = 0.25 * s; qx = (m21 - m12) / s; qy = (m02 - m20) / s; qz = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    qw = (m21 - m12) / s; qx = 0.25 * s; qy = (m01 + m10) / s; qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    qw = (m02 - m20) / s; qx = (m01 + m10) / s; qy = 0.25 * s; qz = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    qw = (m10 - m01) / s; qx = (m02 + m20) / s; qy = (m12 + m21) / s; qz = 0.25 * s;
  }
  const l = Math.hypot(qx, qy, qz, qw) || 1;
  return [qx / l, qy / l, qz / l, qw / l];
}

/** A face's wall thickness behind its plane (its layers, within the bounds; thin for sheet and boards). */
function wallThickness(face: DamageFace): number {
  const sum = face.layers.reduce((a, l) => a + (Number.isFinite(l.thicknessM) ? l.thicknessM : 0), 0);
  const skin = face.layers[0]?.material;
  if (skin === 'metal' || skin === 'plank' || skin === 'canvas') return Math.max(THIN_WALL_M, Math.min(0.2, sum || THIN_WALL_M));
  return Math.max(MIN_WALL_M, Math.min(MAX_WALL_M, sum || 0.3));
}

function coreOf(face: DamageFace): FractureSlot {
  const layers = face.layers;
  return layers[layers.length - 1] ?? { material: 'rubble', bucket: face.bucket, tint: [0.6, 0.58, 0.55], thicknessM: 0.3, share: 1 };
}

function skinOf(face: DamageFace): FractureSlot {
  return face.layers[0] ?? coreOf(face);
}

/** A wall's mass density, its framed members and infill averaged. */
function wallDensity(face: DamageFace): number {
  if (face.members.length) return 0.5 * (DENSITY.timber + DENSITY[coreOf(face).material === 'timber' ? 'infill' : coreOf(face).material]);
  return DENSITY[coreOf(face).material] ?? 1800;
}

/** The share of a face rectangle (u0..u1 × y0..y1, face coordinates) its openings take. */
function openingShare(face: DamageFace, u0: number, u1: number, y0: number, y1: number): number {
  const area = Math.max(1e-6, (u1 - u0) * (y1 - y0));
  let open = 0;
  for (const op of face.openings) {
    const a0 = Math.max(u0, op.u - op.w / 2), a1 = Math.min(u1, op.u + op.w / 2);
    const b0 = Math.max(y0, op.y0), b1 = Math.min(y1, op.y0 + op.h);
    if (a1 > a0 && b1 > b0) open += (a1 - a0) * (b1 - b0);
  }
  return Math.min(0.85, open / area);
}

/** Panel splits along a face of width `width`, `n` panels, kept off its openings (into the piers between them). */
function faceSplits(face: DamageFace, n: number, rng: () => number): number[] {
  const width = face.width;
  const splits: number[] = [];
  for (let k = 1; k < n; k++) {
    let u = -width / 2 + (k + (rng() - 0.5) * 0.24) * (width / n);
    // a split inside an opening moves to its nearer jamb, 12 cm into the pier
    for (const op of face.openings) {
      const a = op.u - op.w / 2, b = op.u + op.w / 2;
      if (u > a - 0.12 && u < b + 0.12) u = u - a < b - u ? a - 0.12 : b + 0.12;
    }
    const last = splits.length ? splits[splits.length - 1] : -width / 2;
    if (u - last >= 0.9 && width / 2 - u >= 0.9) splits.push(u);
  }
  return splits;
}

// ---- the plan ------------------------------------------------------------------------------------------------------

/**
 * The collapse's pieces for a building as its kit described it, the blow in its body frame, seeded by the anatomy and
 * the structure (the same on every peer and tier).
 */
export function planCollapsePieces(anatomy: StructureDamageAnatomy, blow: CollapseBlow, options: CollapsePlanOptions = {}): CollapsePlan {
  // two streams: the building's cut (its panels, stubs, piers, roof parts — the same whatever the blow, so a partition
  // laid before the collapse holds) and the fall (who goes first, how hard)
  const geo = damageRng(damageSeed(anatomy.seed, 0x7c01, anatomy.structureIdx));
  const rng = damageRng(damageSeed(anatomy.seed, 0x7c02, anatomy.structureIdx));
  const shaftPlan = (anatomy.kitPlan as { damage?: { shaft?: { crown?: ShaftCrown | null } } } | undefined)?.damage?.shaft;
  if (shaftPlan && anatomy.storeys.length) return planShaft(anatomy, blow, shaftPlan.crown ?? null, geo, rng);
  const shed = anatomy.massClass === 'shed';
  const large = anatomy.massClass === 'large';
  const cap = Math.max(4, options.cap ?? (shed ? 12 : 24));
  const storeys = anatomy.storeys;
  const roof = anatomy.roof;
  const st0 = storeys[0];
  let cx = 0, cz = 0;
  if (st0?.faces.length) {
    for (const f of st0.faces) { cx += f.origin[0]; cz += f.origin[2]; }
    cx /= st0.faces.length; cz /= st0.faces.length;
  }
  const hw = anatomy.w / 2, hd = anatomy.d / 2;
  const groundY = st0 ? st0.y0 : 0;
  const topWall = storeys.length ? storeys[storeys.length - 1].y1 : anatomy.h;
  const eaveY = roof ? Math.min(Math.max(groundY + 0.5, roof.eaveY), roof.ridgeY) : topWall;

  // the struck side: the face the blow came through (its out normal against the blow), else the seed's
  const bl = Math.hypot(blow.dirX, blow.dirZ);
  let struckSide = -1;
  if (bl > 1e-6) {
    let best = Infinity;
    for (let s = 0; s < 4; s++) {
      const d = (SIDES[s][0] * blow.dirX + SIDES[s][2] * blow.dirZ) / bl;
      if (d < best) { best = d; struckSide = s; }
    }
  } else struckSide = Math.floor(rng() * 4);
  const blowPoint = blow.point;

  // roof slabs (planes and parts), gables, chimneys: counted first, the walls take the rest of the cap
  const slabs: RoofSlabPlan[] = [];
  if (roof) for (const slab of roof.slabs) {
    const [c0, c1, c2, c3] = slab.corners;
    const a: Vec3 = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]];
    const b: Vec3 = [c3[0] - c0[0], c3[1] - c0[1], c3[2] - c0[2]];
    let n = norm(cross(a, b));
    if (!(Math.hypot(...n) > 0.5)) n = norm(cross([c2[0] - c0[0], c2[1] - c0[1], c2[2] - c0[2]], b));
    if (n[1] < 0) n = [-n[0], -n[1], -n[2]];
    // e along the eave: the slab's most level edge
    const edges: Vec3[] = [a, [c2[0] - c1[0], c2[1] - c1[1], c2[2] - c1[2]], [c3[0] - c2[0], c3[1] - c2[1], c3[2] - c2[2]], b];
    let e = norm(edges.reduce((best, v) => (Math.abs(norm(v)[1]) < Math.abs(norm(best)[1]) && Math.hypot(...v) > 0.3 ? v : best), a));
    // in the plane exactly
    const en = dot(e, n);
    e = norm([e[0] - n[0] * en, e[1] - n[1] * en, e[2] - n[2] * en]);
    let f = norm(cross(n, e));
    // f up the slope (toward the ridge)
    if (f[1] < 0) { e = [-e[0], -e[1], -e[2]]; f = [-f[0], -f[1], -f[2]]; }
    const p: Vec3 = [(c0[0] + c1[0] + c2[0] + c3[0]) / 4, (c0[1] + c1[1] + c2[1] + c3[1]) / 4, (c0[2] + c1[2] + c2[2] + c3[2]) / 4];
    let e0 = Infinity, e1 = -Infinity, f0 = Infinity, f1 = -Infinity;
    for (const c of slab.corners) {
      const d: Vec3 = [c[0] - p[0], c[1] - p[1], c[2] - p[2]];
      const de = dot(d, e), df = dot(d, f);
      e0 = Math.min(e0, de); e1 = Math.max(e1, de); f0 = Math.min(f0, df); f1 = Math.max(f1, df);
    }
    if (!(e1 - e0 > 0.4 && f1 - f0 > 0.4)) continue;
    let topE0 = Infinity, topE1 = -Infinity;
    for (const c of slab.corners) {
      const d: Vec3 = [c[0] - p[0], c[1] - p[1], c[2] - p[2]];
      if (dot(d, f) < f1 - 0.25) continue;
      topE0 = Math.min(topE0, dot(d, e)); topE1 = Math.max(topE1, dot(d, e));
    }
    const outline = slab.corners.map((c) => {
      const d: Vec3 = [c[0] - p[0], c[1] - p[1], c[2] - p[2]];
      return [dot(d, e), dot(d, f)] as [number, number];
    });
    slabs.push({ p, n, e, f, e0, e1, f0, f1, topE0, topE1, outline, cuts: [], pieces: [] });
  }
  const gableFaces: GablePlan[] = [];
  if (roof && (roof.kind === 'gable' || roof.kind === 'halfhip') && slabs.length && storeys.length) {
    // the top storey's faces along which the slopes do not fall (their out normal across every slab's fall line)
    const top = storeys[storeys.length - 1];
    for (const face of top.faces) {
      const along = slabs.every((s) => Math.abs(dot(face.out, [s.f[0], 0, s.f[2]])) < 0.35 * Math.hypot(s.f[0], s.f[2]) + 1e-6);
      if (along && roof.ridgeY - eaveY > 0.8) gableFaces.push({ face, thickness: wallThickness(face), piece: -1 });
    }
  }
  // the chimneys: over the roof line a piece of their own, resting on the roof's slabs (no box of theirs starts inside a
  // slab's); a stack from the ground stands to the roof line (the kit's remnant rule kept a half to most of it), a
  // chimney rising from the roof leaves its attic part (hidden under the covering before, nothing after)
  const roofOver = (x: number, z: number): number => {
    let best = -Infinity;
    for (const sl of slabs) {
      if (!(sl.n[1] > 0.2)) continue;
      const y = sl.p[1] - ((x - sl.p[0]) * sl.n[0] + (z - sl.p[2]) * sl.n[2]) / sl.n[1];
      const d: Vec3 = [x - sl.p[0], y - sl.p[1], z - sl.p[2]];
      const de = dot(d, sl.e), df = dot(d, sl.f);
      if (de < sl.e0 - 0.3 || de > sl.e1 + 0.3 || df < sl.f0 - 0.3 || df > sl.f1 + 0.3) continue;
      best = Math.max(best, y);
    }
    return best;
  };
  const chimneys: ChimneyPlan[] = anatomy.chimneys.filter((c) => c.y1 - c.y0 > 0.5 && c.sx > 0.15 && c.sz > 0.15).map((c) => {
    const hx = c.sx / 2, hz = c.sz / 2;
    const roofY = Math.max(roofOver(c.x, c.z), roofOver(c.x - hx, c.z - hz), roofOver(c.x + hx, c.z - hz), roofOver(c.x - hx, c.z + hz),
      roofOver(c.x + hx, c.z + hz));
    const fromRoof = c.y0 > groundY + 1;
    const breakY = Number.isFinite(roofY) ? Math.max(fromRoof ? c.y0 : c.y0 + (c.y1 - c.y0) * 0.45, roofY + 0.04)
      : fromRoof ? -Infinity : c.y0 + (c.y1 - c.y0) * (0.45 + geo() * 0.35);
    return {
      min: [c.x - hx - 0.04, c.y0 - 0.04, c.z - hz - 0.04] as Vec3,
      max: [c.x + hx + 0.04, c.y1 + 0.04, c.z + hz + 0.04] as Vec3,
      breakY, piece: -1, roofY, fromRoof,
    };
  });

  // the walls' panel width: as wide as the cap needs
  const roofParts = (s: RoofSlabPlan, long: number) => (s.e1 - s.e0 > long ? 2 : 1);
  let target = shed ? Infinity : large ? 5.5 : 3.8;
  let longSlab = large ? 9 : 6.5;
  const panelsFor = (face: DamageFace) => (Number.isFinite(target) ? Math.max(1, Math.min(4, Math.round(face.width / target))) : 1);
  const count = () => storeys.reduce((a, st) => a + st.faces.reduce((b, f) => b + panelsFor(f), 0), 0)
    + slabs.reduce((a, s) => a + roofParts(s, longSlab), 0) + gableFaces.length + Math.max(0, storeys.length - 1)
    + chimneys.filter((c) => Number.isFinite(c.breakY)).length;
  for (let guard = 0; guard < 24 && count() > cap; guard++) {
    if (Number.isFinite(target) && target < 16) target *= 1.25;
    else if (longSlab < 40) longSlab *= 1.5;
    else break;
  }

  const pieces: CollapsePiece[] = [];
  const add = (piece: Omit<CollapsePiece, 'index' | 'parts' | 'partCutsU' | 'partCutsY' | 'partFrame'>
    & Partial<Pick<CollapsePiece, 'parts' | 'partCutsU' | 'partCutsY' | 'partFrame'>>): number => {
    if (pieces.length >= cap) return -1;
    pieces.push({ parts: [], partCutsU: [], partCutsY: [], partFrame: null, ...piece, index: pieces.length });
    return pieces.length - 1;
  };
  /** Cuts across a span [a, b] into n parts, jittered, kept 0.6 m apart (the building's own stream). */
  const spanCuts = (a: number, b: number, n: number): number[] => {
    const cuts: number[] = [];
    for (let j = 1; j < n; j++) {
      const c = a + (j + (geo() - 0.5) * 0.3) * (b - a) / n;
      if (c - (cuts.length ? cuts[cuts.length - 1] : a) > 0.6 && b - c > 0.6) cuts.push(c);
    }
    return cuts;
  };
  const up: Vec3 = [0, 1, 0];

  // the struck face goes first; the faces beside it a beat later; the far face last. Storeys: the upper ones go
  // with the roof, the ground storey's panels when their stubs give.
  const sideDelay = (side: number): number => {
    if (side === struckSide) return 0;
    const opposite = struckSide >= 0 && (side ^ 1) === struckSide;
    return opposite ? 0.55 + rng() * 0.45 : 0.18 + rng() * 0.35;
  };
  const cause = blow.cause ?? 'blast';
  const struckPush = cause === 'ram' ? 1.9 : cause === 'kinetic' ? 1.1 : 2.6;

  // the corners that keep a pier (one or two of the four, the kit's ruin silhouette): never as high as the floor over
  // them (a floor that came to rest on its piers would stand), and never all round (a slab on four piers stands)
  const cornerPier = [false, false, false, false];
  if (anatomy.remnant.corners) {
    const order = [0, 1, 2, 3].map((k) => ({ k, r: geo() })).sort((a, b) => a.r - b.r).map((e) => e.k);
    cornerPier[order[0]] = true;
    if (geo() < 0.55) cornerPier[order[1]] = true;
  }
  const cornerOf = (x: number, z: number): number => (x >= cx ? 1 : 0) + (z >= cz ? 2 : 0);
  const storeyPlans: StoreyPlan[] = [];
  for (let s = 0; s < storeys.length; s++) {
    const st = storeys[s];
    const next = storeys[s + 1];
    const floorT = next?.floor ? Math.max(0.12, Math.min(0.4, next.floor.thicknessM)) : 0;
    const bandTop = next ? next.y0 - floorT : Math.min(st.y1, eaveY);
    const plan: StoreyPlan = { index: s, y0: st.y0, y1: bandTop, bySide: [null, null, null, null], faces: [], floorPiece: -1,
      floorY0: bandTop, floorY1: next ? next.y0 : bandTop };
    storeyPlans.push(plan);
    for (let fi = 0; fi < st.faces.length; fi++) {
      const face = st.faces[fi];
      const side = sideOf(face.out);
      const thickness = wallThickness(face);
      const n = panelsFor(face);
      const splits = faceSplits(face, n, geo);
      const fp: FacePlan = { face, index: fi, side, thickness, splits, panels: [], stubTop: [], pierTop: [0, 0], pierW: 0,
        uMin: -face.width / 2, uMax: face.width / 2 };
      plan.faces.push(fp);
      if (!plan.bySide[side]) plan.bySide[side] = fp;
      // the ground storey's stubs: over the heap banked against the wall, irregular by panel, a pier at each corner
      if (s === 0) {
        const rem = anatomy.remnant;
        const bank = (u: number) => Math.max(0, bodyMoundHeightAt(anatomy, face.origin[0] + face.u[0] * u, face.origin[2] + face.u[2] * u));
        const cuts = [-face.width / 2, ...splits, face.width / 2];
        for (let k = 0; k + 1 < cuts.length; k++) {
          const mid = (cuts[k] + cuts[k + 1]) / 2;
          const top = bank(mid) + Math.max(0.25, rem.stubHeightM) * (0.7 + 0.45 * geo());
          fp.stubTop.push(Math.min(face.height - 0.6, Math.max(0.3, top)));
        }
        if (rem.corners && face.width > 3.2) {
          // the band under the next floor (or the eaves): a pier stops 0.8 m short of it
          const room = Math.min(face.height, (next ? next.y0 - (next.floor ? Math.max(0.12, Math.min(0.4, next.floor.thicknessM)) : 0) : eaveY) - face.origin[1]) - 0.8;
          const at = (end: number) => {
            const u = end * face.width / 2;
            const corner = cornerOf(face.origin[0] + face.u[0] * u, face.origin[2] + face.u[2] * u);
            const k = end < 0 ? 0 : fp.stubTop.length - 1;
            return cornerPier[corner] ? Math.max(fp.stubTop[k], Math.min(room, bank(u) + 2 + geo() * 0.5)) : fp.stubTop[k];
          };
          fp.pierW = Math.min(0.9, face.width * 0.16);
          fp.pierTop = [at(-1), at(1)];
        }
      }
    }
  }

  // the faces along x stop short of the corners the faces along z hold (no proxy starts inside another): its ends in by
  // the thickness of the face that holds that corner (which end meets which face: by the corner's side along z)
  for (const plan of storeyPlans) {
    for (const fp of plan.faces) {
      if (fp.side >= 2) continue;
      const f = fp.face;
      for (const end of [-1, 1] as const) {
        const tipZ = f.origin[2] + f.u[2] * end * f.width / 2;
        const other = plan.bySide[tipZ - cz >= 0 ? 2 : 3];
        const inset = other ? other.thickness + GAP_M : 0;
        if (end < 0) fp.uMin = -f.width / 2 + inset; else fp.uMax = f.width / 2 - inset;
      }
    }
  }

  // wall panels (storey by storey, face by face)
  for (const plan of storeyPlans) {
    const st = storeys[plan.index];
    const topStorey = plan.index === storeys.length - 1;
    for (const fp of plan.faces) {
      const face = fp.face;
      const T = fp.thickness;
      const cuts = [-face.width / 2, ...fp.splits, face.width / 2];
      const delay = sideDelay(fp.side);
      for (let k = 0; k + 1 < cuts.length; k++) {
        const first = k === 0, last = k + 2 === cuts.length;
        const u0 = first ? fp.uMin : cuts[k] + GAP_M / 2;
        const u1 = last ? fp.uMax : cuts[k + 1] - GAP_M / 2;
        // face coordinates: y over the storey floor
        const yb = (plan.index === 0 ? fp.stubTop[k] : 0) + GAP_M;
        const yt = Math.min(face.height, plan.y1 - face.origin[1] - (topStorey && roof ? EAVE_GUARD_M : 0)) - GAP_M;
        if (!(u1 - u0 > 0.3 && yt - yb > 0.3)) { fp.panels.push(-1); continue; }
        const uc = (u0 + u1) / 2, yc = (yb + yt) / 2;
        const center: [number, number, number] = [
          face.origin[0] + face.u[0] * uc - face.out[0] * T / 2,
          face.origin[1] + yc,
          face.origin[2] + face.u[2] * uc - face.out[2] * T / 2,
        ];
        const zAxis = norm(face.out), xAxis = norm(cross(up, zAxis));
        // the face's u runs along xAxis or against it: the box is symmetric, but the pier notch is not
        const flip = dot(xAxis, face.u) < 0;
        const halfT = T / 2 - GAP_M / 2;
        let boxes: CollapseBox[] = [{ center: [0, 0, 0], half: [(u1 - u0) / 2, (yt - yb) / 2, halfT] }];
        // an end panel of the ground storey stands over its corner pier (both, a face of one panel): notched — the box
        // between the piers to its full height, a box over each pier from the pier's top (piece frame: x along xAxis)
        if (plan.index === 0 && fp.pierW > 0) {
          const sgn = flip ? -1 : 1;
          const notch = (end: 0 | 1): number => {
            if ((end === 0 && !first) || (end === 1 && !last)) return -1;
            const top = fp.pierTop[end] + GAP_M;
            return top > yb + 0.05 ? top : -1;
          };
          const lt = notch(0), rt = notch(1);
          const m0 = lt > 0 ? u0 + fp.pierW + GAP_M : u0, m1 = rt > 0 ? u1 - fp.pierW - GAP_M : u1;
          if ((lt > 0 || rt > 0) && m1 - m0 > 0.4) {
            const next: CollapseBox[] = [{ center: [sgn * ((m0 + m1) / 2 - uc), 0, 0], half: [(m1 - m0) / 2, (yt - yb) / 2, halfT] }];
            if (lt > 0 && yt - lt > 0.2) next.push({ center: [sgn * ((u0 + m0) / 2 - uc), (lt + yt) / 2 - yc, 0], half: [(m0 - u0) / 2, (yt - lt) / 2, halfT] });
            if (rt > 0 && yt - rt > 0.2) next.push({ center: [sgn * ((m1 + u1) / 2 - uc), (rt + yt) / 2 - yc, 0], half: [(u1 - m1) / 2, (yt - rt) / 2, halfT] });
            boxes = next;
          }
        }
        const area = (u1 - u0) * (yt - yb);
        const massKg = Math.max(30, area * T * wallDensity(face) * (1 - openingShare(face, u0, u1, yb, yt)));
        // where it cracks when it lands hard: two or three across (between its openings), and once up a tall one (the
        // building's cut: its own stream, whatever the blow)
        const partCutsU: number[] = [], partCutsY: number[] = [];
        const parts: CollapsePart[] = [];
        if (boxes.length === 1 && area >= 4.5) {
          const width = u1 - u0, height = yt - yb;
          const nU = width > 3.4 ? 3 : width > 1.9 ? 2 : 1;
          const nY = height > 2.6 && nU < 3 ? 2 : 1;
          for (let j = 1; j < nU; j++) {
            let cu = u0 + (j + (geo() - 0.5) * 0.3) * width / nU;
            for (const op of face.openings) {
              const oa = op.u - op.w / 2, ob = op.u + op.w / 2;
              if (cu > oa - 0.1 && cu < ob + 0.1) cu = cu - oa < ob - cu ? oa - 0.1 : ob + 0.1;
            }
            if (cu - (partCutsU.length ? partCutsU[partCutsU.length - 1] : u0) > 0.6 && u1 - cu > 0.6) partCutsU.push(cu);
          }
          if (nY === 2) {
            let cy = yb + height * (0.45 + geo() * 0.15);
            for (const op of face.openings) {
              if (Math.abs(op.u - (u0 + u1) / 2) > width / 2 + op.w / 2) continue;
              if (cy > op.y0 - 0.1 && cy < op.y0 + op.h + 0.1) cy = cy - op.y0 < op.y0 + op.h - cy ? op.y0 - 0.1 : op.y0 + op.h + 0.1;
            }
            if (cy - yb > 0.6 && yt - cy > 0.6) partCutsY.push(cy);
          }
          const us = [u0, ...partCutsU, u1], ys = [yb, ...partCutsY, yt];
          if (us.length > 2 || ys.length > 2) {
            const sgn = dot(norm(cross(up, norm(face.out))), face.u) < 0 ? -1 : 1;
            for (let iy = 0; iy + 1 < ys.length; iy++) for (let iu = 0; iu + 1 < us.length; iu++) {
              const pu0 = us[iu], pu1 = us[iu + 1], py0 = ys[iy], py1 = ys[iy + 1];
              parts.push({
                center: [sgn * ((pu0 + pu1) / 2 - (u0 + u1) / 2), (py0 + py1) / 2 - (yb + yt) / 2, 0],
                half: [(pu1 - pu0) / 2 - GAP_M / 2, (py1 - py0) / 2 - GAP_M / 2, T / 2 - GAP_M / 2],
                massKg: massKg * (pu1 - pu0) * (py1 - py0) / area, rect: { u0: pu0, u1: pu1, y0: py0, y1: py1 },
              });
            }
          } else { partCutsU.length = 0; partCutsY.length = 0; }
        }
        // the start: a shove at its top — the struck face's in, hardest nearest the blow; the others' over, outward more
        // often than in (a wall goes as its foot gives: it topples, it is not thrown); the upper storeys lighter, they
        // ride what they stand on
        let push: number;
        if (fp.side === struckSide) {
          const near = blowPoint ? Math.max(0.45, 1 - Math.hypot(center[0] - blowPoint[0], center[1] - blowPoint[1], center[2] - blowPoint[2]) / 10) : 0.75;
          push = -struckPush * near * (0.85 + 0.3 * rng());
        } else {
          const outward = rng() < 0.62 ? 1 : -1;
          push = outward * (plan.index === 0 ? 1.0 + 0.8 * rng() : 0.6 + 0.6 * rng());
        }
        // (over storeys that give way, the top storey is shoved as it comes down onto them, not while it still stands on
        // its floor: it would ride the drop down whole)
        const dropS = storeys.length > 1 && plan.index === storeys.length - 1 ? 0.28 * (storeys.length - 2) + 0.45 + rng() * 0.35 : 0;
        const releaseS = dropS + delay + (plan.index === 0 ? 0.08 + rng() * 0.25 : rng() * 0.15) * (fp.side === struckSide ? 0.3 : 1);
        const index = add({
          kind: 'wall', center, rotation: quatFromAxes(xAxis, up, zAxis), boxes, massKg,
          material: face.members.length ? 'timber' : coreOf(face).material, core: coreOf(face), back: backOf(face),
          face: { storey: plan.index, face: fp.index, u0, u1, y0: yb, y1: yt, thickness: T }, releaseS,
          kick: [zAxis[0] * push, 0, zAxis[2] * push], kickAt: [0, (yt - yb) / 2 * 0.85, 0],
          // (a wall under a floor is held down by it and cannot be shoved over: under a floor every storey gives — the
          // ground storey first, the struck face first and the far face last, each storey over it a beat later as what it
          // carries comes down — and the top storey's walls are shoved over; a single storey's struck face bursts)
          // (a single storey under its roof is held down by it too: its struck face bursts, the faces beside it give a
          // beat later, and the far face is shoved over as the roof comes down into the gap)
          shatterS: plan.index === storeys.length - 1 && plan.index > 0 ? -1
            : fp.side === struckSide ? 0.28 * plan.index
              : struckSide < 0 ? -1
                : storeys.length < 2 ? ((fp.side ^ 1) === struckSide ? -1 : 0.22 + rng() * 0.25)
                  : 0.28 * plan.index + ((fp.side ^ 1) === struckSide ? 0.55 + rng() * 0.3 : 0.16 + rng() * 0.22),
          parts, partCutsU, partCutsY,
          partFrame: parts.length ? { origin: face.origin, u: face.u, v: [0, 1, 0] } : null,
        });
        fp.panels.push(index);
      }
      void st;
    }
  }

  // floor slabs: over each storey's walls but the top one, carrying the walls above
  for (let s = 0; s + 1 < storeys.length; s++) {
    const plan = storeyPlans[s];
    const next = storeys[s + 1];
    if (!next.floor || !(plan.floorY1 - plan.floorY0 > 0.05)) continue;
    const fy0 = plan.floorY0 + GAP_M / 2, fy1 = plan.floorY1 - GAP_M / 2;
    const slot = next.floor.structure;
    const concrete = slot.material === 'concrete';
    const area = anatomy.w * anatomy.d;
    const kgM2 = concrete ? (fy1 - fy0) * DENSITY.concrete : 95;
    // it cracks across its joists when it lands: two or three each way by its size (body x and z about its centre)
    const longX = hw >= hd;
    const fx = spanCuts(-hw, hw, longX && hw * 2 > 7 ? 3 : 2), fz = spanCuts(-hd, hd, !longX && hd * 2 > 7 ? 3 : 2);
    const xs = [-hw, ...fx, hw], zs = [-hd, ...fz, hd];
    const floorParts: CollapsePart[] = [];
    for (let iz = 0; iz + 1 < zs.length; iz++) for (let ix = 0; ix + 1 < xs.length; ix++) {
      const a0 = xs[ix], a1 = xs[ix + 1], b0 = zs[iz], b1 = zs[iz + 1];
      floorParts.push({ center: [(a0 + a1) / 2, 0, (b0 + b1) / 2], half: [(a1 - a0) / 2 - GAP_M / 2, (fy1 - fy0) / 2, (b1 - b0) / 2 - GAP_M / 2],
        massKg: Math.max(200, area * kgM2) * (a1 - a0) * (b1 - b0) / (4 * hw * hd), rect: { u0: a0, u1: a1, y0: b0, y1: b1 } });
    }
    plan.floorPiece = add({
      kind: 'floor', center: [cx, (fy0 + fy1) / 2, cz], rotation: [0, 0, 0, 1],
      boxes: [{ center: [0, 0, 0], half: [hw, (fy1 - fy0) / 2, hd] }], massKg: Math.max(200, area * kgM2),
      material: slot.material, core: slot, back: ceilingOf(slot), face: null,
      // its struck side drops into the gap the burst wall left; the rest of it follows as its walls go
      releaseS: 0.1 + rng() * 0.12, kick: [0, -1.1 - 0.5 * rng(), 0],
      kickAt: struckSide >= 0 ? [SIDES[struckSide][0] * hw * 0.85, 0, SIDES[struckSide][2] * hd * 0.85] : [0, 0, 0], shatterS: -1,
      parts: floorParts.length > 1 ? floorParts : [], partCutsU: floorParts.length > 1 ? fx : [], partCutsY: floorParts.length > 1 ? fz : [],
      partFrame: floorParts.length > 1 ? { origin: [cx, 0, cz], u: [1, 0, 0], v: [0, 0, 1] } : null,
    });
  }

  // the roof's slabs (halved across their eave when long), the gables over the eaves, the chimneys
  const covering = roof?.covering;
  for (const slab of slabs) {
    const parts = roofParts(slab, longSlab);
    slab.cuts = parts === 2 ? [(slab.e0 + slab.e1) / 2 + (geo() - 0.5) * 0.15 * (slab.e1 - slab.e0)] : [];
    const edges = [slab.e0, ...slab.cuts, slab.e1];
    const t = Math.max(0.1, Math.min(0.4, roof!.thicknessM || 0.22));
    // where two slabs meet at the ridge or along a hip their boxes, each under its own covering, would cross: each keeps
    // back from the ridge and from a sloping side by its thickness × the pitch
    const tanPitch = Math.sqrt(Math.max(0, 1 - slab.n[1] * slab.n[1])) / Math.max(0.2, slab.n[1]);
    const back = t * tanPitch + GAP_M;
    const topF = slab.f1 - back;
    // the proxy: up to three bands up the slope, each as wide as the outline at its top (a rectangle's one box, a
    // trapezoid's and a triangle's narrowing stack), each inset from a sloping side
    const width = (f: number): [number, number] => {
      let lo = Infinity, hi = -Infinity;
      const o = slab.outline;
      for (let i = 0; i < o.length; i++) {
        const [ea, fa] = o[i], [eb, fb] = o[(i + 1) % o.length];
        if ((fa - f) * (fb - f) > 0 || Math.abs(fb - fa) < 1e-9 && Math.abs(fa - f) > 1e-9) continue;
        const k = Math.abs(fb - fa) < 1e-9 ? 0 : (f - fa) / (fb - fa);
        const ee = ea + (eb - ea) * Math.max(0, Math.min(1, k));
        lo = Math.min(lo, ee); hi = Math.max(hi, ee);
        if (Math.abs(fb - fa) < 1e-9) { lo = Math.min(lo, ea, eb); hi = Math.max(hi, ea, eb); }
      }
      return [lo, hi];
    };
    const bottomW = width(slab.f0 + 0.01), topW = width(topF);
    const narrowing = (bottomW[1] - bottomW[0]) - (topW[1] - topW[0]) > 0.3;
    const bands = narrowing ? 3 : 1;
    const kg = (COVERING_KG_M2[covering?.material ?? 'tile'] ?? 45) + ROOF_FRAME_KG_M2;
    for (let k = 0; k + 1 < edges.length; k++) {
      const a = edges[k] + GAP_M / 2, b = edges[k + 1] - GAP_M / 2;
      const rects: Array<[number, number, number, number]> = [];
      for (let j = 0; j < bands; j++) {
        const fa = slab.f0 + (topF - slab.f0) * (j / bands), fb = slab.f0 + (topF - slab.f0) * ((j + 1) / bands);
        const [lo, hi] = width(fb);
        const sideIn = narrowing ? back : 0;
        const ea = Math.max(a, lo + sideIn), eb = Math.min(b, hi - sideIn);
        if (eb - ea > 0.25 && fb - fa > 0.1) rects.push([ea, eb, fa + (j ? GAP_M / 2 : 0), fb]);
      }
      if (!rects.length) { slab.pieces.push(-1); continue; }
      // the piece's frame at its lowest (widest) band's centre
      const [ea0, eb0, fa0, fb0] = rects[0];
      const ec = (ea0 + eb0) / 2, fc = (fa0 + fb0) / 2;
      const center: [number, number, number] = [
        slab.p[0] + slab.e[0] * ec + slab.f[0] * fc - slab.n[0] * t / 2,
        slab.p[1] + slab.e[1] * ec + slab.f[1] * fc - slab.n[1] * t / 2,
        slab.p[2] + slab.e[2] * ec + slab.f[2] * fc - slab.n[2] * t / 2,
      ];
      // local axes: x = e, y = n, z = e × n = −f
      const rotation = quatFromAxes(slab.e, slab.n, cross(slab.e, slab.n));
      const boxes: CollapseBox[] = rects.map(([ea, eb, fa, fb]) => ({
        center: [(ea + eb) / 2 - ec, 0, -((fa + fb) / 2 - fc)], half: [(eb - ea) / 2, t / 2, (fb - fa) / 2],
      }));
      const areaM2 = polygonArea(slab.outline) * Math.max(0.05, Math.min(1, (b - a) / Math.max(0.1, slab.e1 - slab.e0)));
      // a plain slab cracks when it lands: across its eave if wide, along it if its slope is long (a hip's narrowing
      // bands stay whole)
      const roofParts: CollapsePart[] = [];
      let ru: number[] = [], rv: number[] = [];
      if (rects.length === 1) {
        const [ea, eb, fa, fb] = rects[0];
        ru = spanCuts(ea, eb, eb - ea > 3.5 ? 2 : 1);
        rv = spanCuts(fa, fb, fb - fa > 4.5 ? 2 : 1);
        const us = [ea, ...ru, eb], vs = [fa, ...rv, fb];
        if (us.length > 2 || vs.length > 2) for (let iv = 0; iv + 1 < vs.length; iv++) for (let iu = 0; iu + 1 < us.length; iu++) {
          const u0 = us[iu], u1 = us[iu + 1], v0 = vs[iv], v1 = vs[iv + 1];
          roofParts.push({ center: [(u0 + u1) / 2 - ec, 0, -((v0 + v1) / 2 - fc)], half: [(u1 - u0) / 2 - GAP_M / 2, t / 2, (v1 - v0) / 2 - GAP_M / 2],
            massKg: Math.max(60, areaM2 * kg) * (u1 - u0) * (v1 - v0) / Math.max(0.01, (eb - ea) * (fb - fa)), rect: { u0, u1, y0: v0, y1: v1 } });
        }
      }
      // the roof drops into the building as its walls go: straight down, tipping toward the struck side
      const sx = struckSide >= 0 ? SIDES[struckSide] : [0, 0, 0];
      const index = add({
        kind: 'roof', center, rotation, boxes, massKg: Math.max(60, areaM2 * kg),
        material: covering?.material ?? 'tile', core: roof!.structure, back: roof!.structure, face: null,
        // its low edge dropped (the struck side's slabs first, the far side's as their walls go)
        releaseS: (dot([slab.n[0], 0, slab.n[2]], sx as Vec3) > 0.3 ? 0.08 : 0.2) + rng() * 0.2,
        kick: [-sx[0] * 0.3, -0.7 - 0.4 * rng(), -sx[2] * 0.3], kickAt: [0, 0, boxes[0].half[2] * 0.8], shatterS: -1,
        parts: roofParts, partCutsU: roofParts.length ? ru : [], partCutsY: roofParts.length ? rv : [],
        partFrame: roofParts.length ? { origin: slab.p, u: slab.e, v: slab.f } : null,
      });
      slab.pieces.push(index);
    }
  }
  // the chimneys over the roof line: a piece each, resting on the roof (it falls when the roof does)
  for (let i = 0; i < chimneys.length; i++) {
    const c = chimneys[i], src = anatomy.chimneys.filter((cc) => cc.y1 - cc.y0 > 0.5 && cc.sx > 0.15 && cc.sz > 0.15)[i];
    if (!Number.isFinite(c.breakY)) continue;
    const y0 = c.breakY + GAP_M, y1 = c.max[1] - 0.04;
    if (!(y1 - y0 > 0.35)) continue;
    const hx = (c.max[0] - c.min[0]) / 2 - 0.04, hz = (c.max[2] - c.min[2]) / 2 - 0.04;
    const slot: FractureSlot = { material: 'brick', bucket: src?.bucket ?? 'brick', tint: [0.6, 0.42, 0.34], thicknessM: 0.24, share: 0 };
    const tipDir = struckSide >= 0 ? SIDES[struckSide ^ 1] : [1, 0, 0];
    c.piece = add({
      kind: 'chimney', center: [(c.min[0] + c.max[0]) / 2, (y0 + y1) / 2, (c.min[2] + c.max[2]) / 2], rotation: [0, 0, 0, 1],
      boxes: [{ center: [0, 0, 0], half: [hx, (y1 - y0) / 2, hz] }], massKg: Math.max(80, 8 * hx * hz * (y1 - y0) / 2 * 0.7 * DENSITY.brick),
      material: 'brick', core: slot, back: slot, face: null, releaseS: 0.4 + rng() * 0.4,
      kick: [tipDir[0] * (0.7 + 0.5 * rng()), 0, tipDir[2] * (0.7 + 0.5 * rng())], kickAt: [0, (y1 - y0) / 2 * 0.8, 0], shatterS: -1,
    });
  }
  // a gable: the triangle over the eaves, its proxy a wide low box and a narrow tall one inside its outline, kept under
  // the roof slabs' boxes over its sloping edges (their thickness, plumb)
  const roofT = Math.max(0.1, Math.min(0.4, roof?.thicknessM || 0.22));
  const cosPitch = slabs.length ? Math.max(0.25, slabs.reduce((a, sl) => a + sl.n[1], 0) / slabs.length) : 1;
  for (const g of gableFaces) {
    const face = g.face;
    const T = g.thickness;
    const base = eaveY - face.origin[1], apex = (roof!.ridgeY - face.origin[1]);
    const H = apex - base, W2 = face.width / 2;
    const plumb = roofT / cosPitch + 0.06;
    const a1 = 0.62 * W2, a2 = 0.28 * W2;
    const y1 = H * (1 - 0.62) - plumb, y2 = H * (1 - 0.28) - plumb;
    if (!(y1 > 0.25)) continue;
    const yTop = y2 > y1 + 0.2 ? y2 : y1;
    const yc = (GAP_M + yTop) / 2;
    const zAxis = norm(face.out), xAxis = norm(cross(up, zAxis));
    const center: [number, number, number] = [face.origin[0] - face.out[0] * T / 2, face.origin[1] + base + yc, face.origin[2] - face.out[2] * T / 2];
    const halfT = T / 2 - GAP_M / 2;
    const boxes: CollapseBox[] = [{ center: [0, (GAP_M + y1) / 2 - yc, 0], half: [a1, (y1 - GAP_M) / 2, halfT] }];
    if (y2 > y1 + 0.2) boxes.push({ center: [0, (GAP_M + y2) / 2 - yc, 0], half: [a2, (y2 - GAP_M) / 2, halfT] });
    const areaM2 = face.width * H / 2;
    // it cracks when it lands: its middle under the ridge and its two sides (vertical cuts a third of the way out)
    const cut = W2 * (0.3 + geo() * 0.08);
    const sgn = dot(xAxis, face.u) < 0 ? -1 : 1;
    const gm = Math.max(40, areaM2 * T * wallDensity(face));
    const midTop = Math.max(0.3, H * (1 - cut / W2) - plumb), sideTop = Math.max(0.2, 0.45 * H * (1 - cut / W2) - plumb);
    const sideEnd = cut + 0.55 * (W2 - cut);
    const gableParts: CollapsePart[] = W2 > 1.6 ? [
      { center: [sgn * -(cut + sideEnd) / 2, GAP_M + sideTop / 2 - yc, 0], half: [(sideEnd - cut) / 2, sideTop / 2, halfT],
        massKg: gm * (1 - cut / W2) ** 2 / 2, rect: { u0: -W2, u1: -cut, y0: base, y1: apex } },
      { center: [0, GAP_M + midTop / 2 - yc, 0], half: [cut - GAP_M, midTop / 2, halfT],
        massKg: gm * (1 - (1 - cut / W2) ** 2), rect: { u0: -cut, u1: cut, y0: base, y1: apex } },
      { center: [sgn * (cut + sideEnd) / 2, GAP_M + sideTop / 2 - yc, 0], half: [(sideEnd - cut) / 2, sideTop / 2, halfT],
        massKg: gm * (1 - cut / W2) ** 2 / 2, rect: { u0: cut, u1: W2, y0: base, y1: apex } },
    ] : [];
    // the struck face's gable drops into the gap its wall left (a nudge in); another tips out more often than in
    const struck = sideOf(face.out) === struckSide;
    const outward = struck ? -0.4 : rng() < 0.7 ? 1 : -1;
    g.piece = add({
      kind: 'gable', center, rotation: quatFromAxes(xAxis, up, zAxis), boxes, massKg: gm,
      material: coreOf(face).material, core: coreOf(face), back: backOf(face), face: null,
      releaseS: (struck ? 0.04 : 0.2) + rng() * 0.3, kick: [zAxis[0] * outward * (1 + 0.6 * rng()), 0, zAxis[2] * outward * (1 + 0.6 * rng())],
      kickAt: [0, yTop - yc, 0], shatterS: -1,
      parts: gableParts, partCutsU: gableParts.length ? [-cut, cut] : [], partCutsY: [],
      partFrame: gableParts.length ? { origin: face.origin, u: face.u, v: [0, 1, 0] } : null,
    });
  }
  return { pieces, structureIdx: anatomy.structureIdx, groundY, eaveY, cx, cz, hw, hd, storeys: storeyPlans, roof: slabs, gables: gableFaces,
    chimneys, struckSide, chimneyBucket: anatomy.chimneys[0]?.bucket ?? 'brick', shaft: null };
}

/** A shaft's crown as its kit hands it over (regional/shaft.ts ShaftExtras.crown). */
interface ShaftCrown { y0: number; y1: number; x0: number; x1: number; z0: number; z1: number; bucket: string; tint: readonly [number, number, number] }

/**
 * A shaft's collapse (dcore 2026-10-10; it toppled along a closed-form rod to a fixed landing): its stump stands a metre
 * to three and a half over its foot (the kit's rule), and over it the shaft goes over toward the blow as one body (a
 * stack of free drums stood on its stump, or flew apart), about the edge of its foot; when it strikes the ground it
 * breaks into its drums — two to six, a couple of its widths each — and its crown, each with the shaft's motion there.
 * Toward the blow, as the mask's topple (structureStages structureTopple; wave 322: one that went over away from the
 * shooter vanished behind its own stump and dust): the struck side's foot is gone and it leans into the gap.
 */
function planShaft(anatomy: StructureDamageAnatomy, blow: CollapseBlow, crown: ShaftCrown | null, geo: () => number, rng: () => number): CollapsePlan {
  const bands = anatomy.storeys, b0 = bands[0];
  let cx = 0, cz = 0;
  for (const f of b0.faces) { cx += f.origin[0]; cz += f.origin[2]; }
  cx /= Math.max(1, b0.faces.length); cz /= Math.max(1, b0.faces.length);
  const hw = anatomy.w / 2, hd = anatomy.d / 2;
  const baseY = b0.y0, topWall = bands[bands.length - 1].y1;
  const H = (crown ? crown.y1 : topWall) - baseY;
  const bank = Math.max(0, bodyMoundHeightAt(anatomy, cx, cz));
  const stumpY = baseY + bank + 1.2 + geo() * Math.min(2.3, H * 0.15);
  const wallSlot = b0.faces[0]?.layers[b0.faces[0].layers.length - 1] ?? anatomy.rubble[0]
    ?? { material: 'brick', bucket: b0.faces[0]?.bucket ?? 'brick', tint: [0.6, 0.45, 0.38], thicknessM: 0.4, share: 1 };
  // the topple: toward the blow (against its travel, body frame), else its own way; started just past what tips it
  // over its foot's edge
  const bl = Math.hypot(blow.dirX, blow.dirZ);
  const ang = rng() * Math.PI * 2;
  const tx = bl > 1e-6 ? -blow.dirX / bl : Math.cos(ang), tz = bl > 1e-6 ? -blow.dirZ / bl : Math.sin(ang);
  // the drums: a couple of its widths each, two to six (the building's cut: its own stream)
  const span = Math.max(0.5, topWall - stumpY);
  const width = Math.max(anatomy.w, anatomy.d);
  const n = Math.max(2, Math.min(6, Math.round(span / Math.max(2.5, 2.2 * width))));
  const bounds = [stumpY];
  for (let k = 1; k < n; k++) bounds.push(stumpY + span * (k + (geo() - 0.5) * 0.3) / n);
  bounds.push(topWall);
  const bandAt = (y: number) => bands.find((b) => y >= b.y0 && y <= b.y1) ?? bands[bands.length - 1];
  // its parts, drum by drum, then the crown; the body's frame at its foot's centre over the stump
  const y0 = stumpY + GAP_M / 2, yTop = crown && crown.y1 > topWall ? crown.y1 : topWall;
  const frameY = (y0 + yTop) / 2;
  const parts: CollapsePart[] = [];
  const drumParts: number[] = [];
  let massKg = 0;
  for (let k = 0; k + 1 < bounds.length; k++) {
    const a = bounds[k] + GAP_M / 2, b = bounds[k + 1] - GAP_M / 2;
    if (!(b - a > 0.3)) { drumParts.push(-1); continue; }
    const band = bandAt((a + b) / 2);
    const across = (band.faces[0]?.width ?? anatomy.w) / 2 * 0.98, thick = (band.faces[1]?.width ?? anatomy.d) / 2 * 0.98;
    const slot = band.faces[0]?.layers[band.faces[0].layers.length - 1] ?? wallSlot;
    const m = Math.max(150, 8 * across * thick * (b - a) / 2 * 0.45 * (DENSITY[slot.material] ?? 1800));
    drumParts.push(parts.length);
    parts.push({ center: [0, (a + b) / 2 - frameY, 0], half: [across, (b - a) / 2, thick], massKg: m, rect: { u0: -across, u1: across, y0: a, y1: b } });
    massKg += m;
  }
  let crownBox: { min: Vec3; max: Vec3; piece: number } | null = null;
  let crownPart = -1;
  if (crown && crown.y1 - Math.max(crown.y0, topWall) > 0.3) {
    const a = Math.max(crown.y0, topWall) + GAP_M / 2, b = crown.y1;
    const hx = Math.max(0.1, (crown.x1 - crown.x0) / 2), hz = Math.max(0.1, (crown.z1 - crown.z0) / 2);
    const m = Math.max(100, 8 * hx * hz * (b - a) / 2 * 120);
    crownPart = parts.length;
    parts.push({ center: [(crown.x0 + crown.x1) / 2 - cx, (a + b) / 2 - frameY, (crown.z0 + crown.z1) / 2 - cz], half: [hx, (b - a) / 2, hz], massKg: m,
      rect: { u0: crown.x0, u1: crown.x1, y0: a, y1: b } });
    massKg += m;
    crownBox = { min: [crown.x0 - 0.05, Math.max(crown.y0, topWall) - 0.05, crown.z0 - 0.05], max: [crown.x1 + 0.05, crown.y1 + 0.05, crown.z1 + 0.05], piece: 0 };
  }
  // the turn that just tips it over its foot's edge (its centre of mass over the edge), and a little more; given as a
  // push at its centre of percussion, so it turns about that edge and its foot does not kick back off the stump
  const L = yTop - y0, halfBase = Math.min(parts[0]?.half[0] ?? hw, parts[0]?.half[2] ?? hd);
  const hc = L / 2;
  const rise = Math.hypot(halfBase, hc) - hc;
  const inertia = (L * L + 4 * halfBase * halfBase) / 3;
  const omega = Math.sqrt((2 * 9.81 * rise) / Math.max(1, inertia)) * (1.15 + rng() * 0.2);
  const percussion = (L * L + 4 * halfBase * halfBase) / (6 * Math.max(0.5, L));
  const pieces: CollapsePiece[] = [{
    index: 0, kind: 'drum', center: [cx, frameY, cz], rotation: [0, 0, 0, 1],
    boxes: parts.map((pp) => ({ center: pp.center, half: pp.half })), massKg, material: wallSlot.material, core: wallSlot, back: wallSlot, face: null,
    releaseS: 0, kick: [tx * omega * hc, 0, tz * omega * hc], kickAt: [0, Math.min(hc, percussion), 0], shatterS: -1,
    // its parts are its drums: by their bounds up the shaft (and the crown, whose box claims its own triangles first)
    parts, partCutsU: [], partCutsY: bounds.slice(1, -1), partFrame: { origin: [cx, 0, cz], u: [1, 0, 0], v: [0, 1, 0] },
  }];
  return { pieces, structureIdx: anatomy.structureIdx, groundY: baseY, eaveY: topWall, cx, cz, hw, hd, storeys: [], roof: [], gables: [],
    chimneys: [], struckSide: -1, chimneyBucket: wallSlot.bucket,
    shaft: { stumpY, bounds, drums: drumParts, crown: crownBox ? { ...crownBox, piece: crownPart } : null, slot: wallSlot } };
}

/** A polygon's area (its outline in order). */
function polygonArea(o: readonly (readonly [number, number])[]): number {
  let a = 0;
  for (let i = 0; i < o.length; i++) { const [x0, y0] = o[i], [x1, y1] = o[(i + 1) % o.length]; a += x0 * y1 - x1 * y0; }
  return Math.abs(a) / 2;
}

/** A wall's inner face: a render over its core shows inside as plaster; a bare wall shows its own material. */
function backOf(face: DamageFace): FractureSlot {
  const skin = skinOf(face);
  if (skin.material === 'plaster') return { ...skin, tint: [Math.min(1, skin.tint[0] * 1.05), Math.min(1, skin.tint[1] * 1.04), Math.min(1, skin.tint[2] * 1.02)] };
  return coreOf(face);
}

/** A floor's underside: its joists and boards under the dust of the fall (a broad bright face read as a clean sheet
 *  in the street), the slab's own concrete. */
function ceilingOf(slot: FractureSlot): FractureSlot {
  if (slot.material === 'concrete') return slot;
  return { ...slot, tint: [slot.tint[0] * 0.78, slot.tint[1] * 0.76, slot.tint[2] * 0.74] };
}

// ---- the partition: the building's own triangles between its pieces ------------------------------------------------

/** Floats a partitioned vertex carries: position, normal, uv, colour. */
const PIECE_VERTEX_STRIDE = 11;
/** The static remnant's index in the partition's output (the stubs, piers, plinth and footings). */
export const STATIC_PIECE = -1;
/** What the collapse drops (a roof chimney's attic part, under the covering before and nothing after). */
const DROPPED_PIECE = -2;

const MAX_SPLITS = 10;
const _cent: [number, number, number] = [0, 0, 0];

type Poly = Float64Array[];

/** The polygon's vertices on either side of the plane n·p = d (each a fresh array; attributes interpolated). */
function splitPoly(poly: Poly, nx: number, ny: number, nz: number, d: number, front: Poly, back: Poly): void {
  front.length = 0; back.length = 0;
  const count = poly.length;
  const stride = poly[0].length;
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

/** Which side of the plane the polygon lies: 1 all in front, −1 all behind, 0 across it. */
function sidePoly(poly: Poly, nx: number, ny: number, nz: number, d: number): number {
  let pos = false, neg = false;
  for (const v of poly) {
    const s = nx * v[0] + ny * v[1] + nz * v[2] - d;
    if (s > 1e-5) pos = true; else if (s < -1e-5) neg = true;
    if (pos && neg) return 0;
  }
  return neg ? -1 : 1;
}

function centroid(poly: Poly): [number, number, number] {
  let x = 0, y = 0, z = 0;
  for (const v of poly) { x += v[0]; y += v[1]; z += v[2]; }
  _cent[0] = x / poly.length; _cent[1] = y / poly.length; _cent[2] = z / poly.length;
  return _cent;
}

/**
 * Cut the building's triangles (body frame, non-indexed, `stride` floats a vertex: position, normal, then any other
 * attributes, interpolated) between the plan's pieces. Returns each piece's triangles (same layout), and the static
 * remnant's (STATIC_PIECE: the stubs and piers, the plinth, the chimney feet), keyed by piece index. A triangle that
 * crosses a cut is split along it.
 */
export function partitionTriangles(plan: CollapsePlan, vertices: Float32Array | Float64Array, triangles: number,
  stride = PIECE_VERTEX_STRIDE): Map<number, number[]> {
  if (stride < 6) throw new Error('a partition vertex carries a position and a normal');
  const out = new Map<number, number[]>();
  // a probe: one vertex through the same rules, its key recorded instead of emitted (the fast path below); a key is the
  // piece × PART_STRIDE + its part (the remnant and what is dropped keep their negative codes)
  let probing = false, probed = 0;
  const emit = (piece: number, poly: Poly, part = 0): void => {
    const key = piece < 0 ? piece : piece * PART_STRIDE + part;
    if (probing) { probed = key; return; }
    if (poly.length < 3) return;
    let list = out.get(key);
    if (!list) { list = []; out.set(key, list); }
    const a = poly[0];
    for (let i = 1; i + 1 < poly.length; i++) {
      const b = poly[i], c = poly[i + 1];
      for (let k = 0; k < stride; k++) list.push(a[k]);
      for (let k = 0; k < stride; k++) list.push(b[k]);
      for (let k = 0; k < stride; k++) list.push(c[k]);
    }
  };
  const front: Poly = [], back: Poly = [];
  // split by a plane and go on with both halves (or classify the whole when it lies on one side)
  const across = (poly: Poly, nx: number, ny: number, nz: number, d: number, depth: number,
    next: (half: Poly, side: number, depth: number) => void): boolean => {
    const side = sidePoly(poly, nx, ny, nz, d);
    if (side !== 0 || depth >= MAX_SPLITS) return false;
    splitPoly(poly, nx, ny, nz, d, front, back);
    const f = front.slice(), b = back.slice();
    if (f.length >= 3) next(f, 1, depth + 1);
    if (b.length >= 3) next(b, -1, depth + 1);
    return true;
  };

  const shaftAssign = (poly: Poly, depth: number): void => {
    const sh = plan.shaft!;
    // the crown: a polygon wholly inside its box (the shaft's last part)
    const cr = sh.crown;
    if (cr && poly.every((v) => v[0] >= cr.min[0] && v[0] <= cr.max[0] && v[1] >= cr.min[1] && v[1] <= cr.max[1] && v[2] >= cr.min[2] && v[2] <= cr.max[2])) {
      emit(0, poly, cr.piece);
      return;
    }
    // the stump stands; the drums by their bounds up the shaft (a polygon across a bound is cut along it)
    for (const b of sh.bounds) if (across(poly, 0, 1, 0, b, depth, (h, _s, dd) => shaftAssign(h, dd))) return;
    const y = centroid(poly)[1];
    if (y < sh.stumpY) { emit(STATIC_PIECE, poly); return; }
    let k = 0;
    while (k + 1 < sh.bounds.length - 1 && y >= sh.bounds[k + 1]) k++;
    const part = sh.drums[k] ?? -1;
    emit(0, poly, part >= 0 ? part : Math.max(0, sh.drums.findIndex((d) => d >= 0)));
  };

  const assign = (poly: Poly, depth: number): void => {
    if (plan.shaft) { shaftAssign(poly, depth); return; }
    // the chimneys first: a polygon wholly inside a stack's box is the stack's (its foot below the break stays)
    for (const c of plan.chimneys) {
      // (a roof's chimney over no slab goes with the roof's triangles round it)
      if (!Number.isFinite(c.breakY)) continue;
      if (!poly.every((v) => v[0] >= c.min[0] && v[0] <= c.max[0] && v[1] >= c.min[1] && v[1] <= c.max[1] && v[2] >= c.min[2] && v[2] <= c.max[2])) continue;
      // under its break: a ground stack's standing part, a roof chimney's attic part (dropped); over it, its piece (a
      // roof chimney too short for one drops whole, a ground stack's stands)
      const under = c.fromRoof ? DROPPED_PIECE : STATIC_PIECE;
      const over = c.piece >= 0 ? c.piece : under;
      if (across(poly, 0, 1, 0, c.breakY, depth, (h, s) => emit(s > 0 ? over : under, h))) return;
      emit(centroid(poly)[1] < c.breakY ? under : over, poly);
      return;
    }
    // under the ground storey: the plinth and footings stay
    if (across(poly, 0, 1, 0, plan.groundY + 0.02, depth, (h, s, dd) => (s > 0 ? assign(h, dd) : emit(STATIC_PIECE, h)))) return;
    if (centroid(poly)[1] < plan.groundY + 0.02) { emit(STATIC_PIECE, poly); return; }
    // the roof over the eaves, the walls under them
    if (across(poly, 0, 1, 0, plan.eaveY, depth, (h, s, dd) => (s > 0 ? roofAssign(h, dd) : wallAssign(h, dd)))) return;
    if (centroid(poly)[1] >= plan.eaveY) roofAssign(poly, depth); else wallAssign(poly, depth);
  };

  const wallAssign = (poly: Poly, depth: number): void => {
    // the storey bands and the floor slabs between them
    for (const st of plan.storeys) {
      if (st.floorPiece >= 0) {
        if (across(poly, 0, 1, 0, st.floorY0, depth, (h, _s, dd) => wallAssign(h, dd))) return;
        if (across(poly, 0, 1, 0, st.floorY1, depth, (h, _s, dd) => wallAssign(h, dd))) return;
      }
    }
    const c = centroid(poly);
    let storey = plan.storeys[plan.storeys.length - 1];
    for (const st of plan.storeys) {
      if (st.floorPiece >= 0 && c[1] >= st.floorY0 && c[1] < st.floorY1) { partAssign(poly, depth, null, st.floorPiece); return; }
      if (c[1] < st.floorY1 || st === plan.storeys[plan.storeys.length - 1]) { storey = st; break; }
    }
    // a level surface deep inside (a ceiling under the attic, a room's floor plane): no wall's — it goes with the floor
    // over the storey if there is one, else the collapse drops it (it was hidden inside)
    {
      let ny = 0;
      for (const v of poly) ny += v[4];
      ny /= poly.length;
      const deep = Math.min(plan.hw - Math.abs(c[0] - plan.cx), plan.hd - Math.abs(c[2] - plan.cz));
      const wall = storey.faces.reduce((m, f) => Math.max(m, f.thickness), 0.3);
      if (Math.abs(ny) > 0.85 && deep > wall + 0.9) {
        if (storey.floorPiece >= 0) partAssign(poly, depth, null, storey.floorPiece); else emit(DROPPED_PIECE, poly);
        return;
      }
    }
    // the side by the footprint's diagonals
    const dx = plan.hd, dz = plan.hw;
    if (across(poly, dx, 0, -dz, dx * plan.cx - dz * plan.cz, depth, (h, _s, dd) => wallAssign(h, dd))) return;
    if (across(poly, dx, 0, dz, dx * plan.cx + dz * plan.cz, depth, (h, _s, dd) => wallAssign(h, dd))) return;
    const rx = c[0] - plan.cx, rz = c[2] - plan.cz;
    const side = Math.abs(rx) * plan.hd >= Math.abs(rz) * plan.hw ? (rx >= 0 ? 0 : 1) : (rz >= 0 ? 2 : 3);
    const fp = storey.bySide[side] ?? storey.faces[0];
    if (!fp) { emit(STATIC_PIECE, poly); return; }
    const f = fp.face;
    // the panel along the face (its splits are vertical planes across it)
    const uOff = f.u[0] * f.origin[0] + f.u[1] * f.origin[1] + f.u[2] * f.origin[2];
    for (const s of fp.splits) {
      if (across(poly, f.u[0], f.u[1], f.u[2], uOff + s, depth, (h, _s, dd) => wallAssign(h, dd))) return;
    }
    const cc = centroid(poly);
    const u = f.u[0] * cc[0] + f.u[1] * cc[1] + f.u[2] * cc[2] - uOff;
    let k = 0;
    while (k < fp.splits.length && u >= fp.splits[k]) k++;
    const piece = fp.panels[k] ?? -1;
    // the ground storey's stubs and corner piers stay standing
    if (storey.index === 0 && fp.stubTop.length) {
      const stub = f.origin[1] + (fp.stubTop[k] ?? 0);
      if (across(poly, 0, 1, 0, stub, depth, (h, s, dd) => (s > 0 ? pierAssign(h, dd, fp, k, piece) : emit(STATIC_PIECE, h)))) return;
      if (cc[1] < stub) { emit(STATIC_PIECE, poly); return; }
      pierAssign(poly, depth, fp, k, piece);
      return;
    }
    partAssign(poly, depth, fp, piece);
  };

  // a piece that cracks on landing: its parts by their cuts in its part frame
  const partAssign = (poly: Poly, depth: number, _fp: FacePlan | null, piece: number): void => {
    if (piece < 0) { emit(STATIC_PIECE, poly); return; }
    const p = plan.pieces[piece];
    const pf = p.partFrame;
    if (!p.parts.length || !pf) { emit(piece, poly); return; }
    const { origin: o, u: U, v: V } = pf;
    const uOff = U[0] * o[0] + U[1] * o[1] + U[2] * o[2], vOff = V[0] * o[0] + V[1] * o[1] + V[2] * o[2];
    for (const cut of p.partCutsU) {
      if (across(poly, U[0], U[1], U[2], uOff + cut, depth, (h, _s, dd) => partAssign(h, dd, null, piece))) return;
    }
    for (const cut of p.partCutsY) {
      if (across(poly, V[0], V[1], V[2], vOff + cut, depth, (h, _s, dd) => partAssign(h, dd, null, piece))) return;
    }
    const c = centroid(poly);
    const u = U[0] * c[0] + U[1] * c[1] + U[2] * c[2] - uOff, v = V[0] * c[0] + V[1] * c[1] + V[2] * c[2] - vOff;
    let iu = 0, iv = 0;
    while (iu < p.partCutsU.length && u >= p.partCutsU[iu]) iu++;
    while (iv < p.partCutsY.length && v >= p.partCutsY[iv]) iv++;
    emit(piece, poly, iu + (p.partCutsU.length + 1) * iv);
  };

  // over the stub: an end panel's corner pier stays to its top
  const pierAssign = (poly: Poly, depth: number, fp: FacePlan, k: number, piece: number): void => {
    const f = fp.face;
    const last = k === fp.splits.length;
    if (fp.pierW > 0 && (k === 0 || last)) {
      const uOff = f.u[0] * f.origin[0] + f.u[1] * f.origin[1] + f.u[2] * f.origin[2];
      for (const end of [0, 1] as const) {
        if ((end === 0 && k !== 0) || (end === 1 && !last)) continue;
        const edge = end === 0 ? fp.uMin + fp.pierW : fp.uMax - fp.pierW;
        const top = f.origin[1] + fp.pierTop[end];
        const inPier = (h: Poly): boolean => {
          const c = centroid(h);
          const u = f.u[0] * c[0] + f.u[1] * c[1] + f.u[2] * c[2] - uOff;
          return (end === 0 ? u < edge : u > edge) && c[1] < top;
        };
        // split at the pier's inner edge and its top; the part inside stays
        if (across(poly, f.u[0], f.u[1], f.u[2], uOff + edge, depth, (h, _s, dd) => pierAssign(h, dd, fp, k, piece))) return;
        if (across(poly, 0, 1, 0, top, depth, (h, _s, dd) => pierAssign(h, dd, fp, k, piece))) return;
        if (inPier(poly)) { emit(STATIC_PIECE, poly); return; }
      }
    }
    partAssign(poly, depth, fp, piece);
  };

  const roofAssign = (poly: Poly, depth: number): void => {
    // a gable's wall: near its face's plane and under the roof's covering
    for (const g of plan.gables) {
      if (g.piece < 0) continue;
      const f = g.face;
      const oOff = f.out[0] * f.origin[0] + f.out[1] * f.origin[1] + f.out[2] * f.origin[2];
      const inner = oOff - g.thickness - 0.3;
      const c = centroid(poly);
      const o = f.out[0] * c[0] + f.out[1] * c[1] + f.out[2] * c[2];
      if (o < inner - 0.5) continue;
      if (across(poly, f.out[0], f.out[1], f.out[2], inner, depth, (h, _s, dd) => roofAssign(h, dd))) return;
      if (o < inner) continue;
      // under every slab's plane by more than its covering: the gable's (the verge's tiles stay the roof's)
      const below = plan.roof.every((s) => (c[0] - s.p[0]) * s.n[0] + (c[1] - s.p[1]) * s.n[1] + (c[2] - s.p[2]) * s.n[2] < -0.06);
      if (below || !plan.roof.length) { partAssign(poly, depth, null, g.piece); return; }
    }
    if (!plan.roof.length) { emit(STATIC_PIECE, poly); return; }
    // the nearest slab's plane, split on the bisector with the runner-up where the polygon's corners disagree
    const nearest = (v: Float64Array | number[]): number => {
      let best = 0, bd = Infinity;
      for (let i = 0; i < plan.roof.length; i++) {
        const s = plan.roof[i];
        const dd = Math.abs((v[0] - s.p[0]) * s.n[0] + (v[1] - s.p[1]) * s.n[1] + (v[2] - s.p[2]) * s.n[2])
          + outsideSlab(s, v) * 2;
        if (dd < bd) { bd = dd; best = i; }
      }
      return best;
    };
    const first = nearest(poly[0]);
    let other = -1;
    for (const v of poly) { const n = nearest(v); if (n !== first) { other = n; break; } }
    if (other >= 0) {
      const a = plan.roof[first], b = plan.roof[other];
      const nx = a.n[0] - b.n[0], ny = a.n[1] - b.n[1], nz = a.n[2] - b.n[2];
      const d = dot(a.n, a.p) - dot(b.n, b.p);
      if (Math.hypot(nx, ny, nz) > 1e-3 && across(poly, nx, ny, nz, d, depth, (h, _s, dd) => roofAssign(h, dd))) return;
    }
    const slab = plan.roof[nearest(centroid(poly).slice() as unknown as number[])];
    const eOff = dot(slab.e, slab.p);
    for (const cut of slab.cuts) {
      if (across(poly, slab.e[0], slab.e[1], slab.e[2], eOff + cut, depth, (h, _s, dd) => roofAssign(h, dd))) return;
    }
    const c = centroid(poly);
    const e = slab.e[0] * c[0] + slab.e[1] * c[1] + slab.e[2] * c[2] - eOff;
    let k = 0;
    while (k < slab.cuts.length && e >= slab.cuts[k]) k++;
    const piece = slab.pieces[k] ?? -1;
    partAssign(poly, depth, null, piece);
  };

  // most triangles lie inside one piece: each corner probed alone (no plane can split a point), and when all three
  // agree the triangle is copied whole; only a triangle across a cut goes through the splitting rules
  const probe: Poly = [new Float64Array(stride)];
  const pieceOf = (t: number, k: number): number => {
    const o = (t * 3 + k) * stride, v = probe[0];
    for (let j = 0; j < stride; j++) v[j] = vertices[o + j];
    probing = true;
    probed = STATIC_PIECE;
    assign(probe, 0);
    probing = false;
    return probed;
  };
  for (let t = 0; t < triangles; t++) {
    const p0 = pieceOf(t, 0);
    if (pieceOf(t, 1) === p0 && pieceOf(t, 2) === p0) {
      let list = out.get(p0);
      if (!list) { list = []; out.set(p0, list); }
      const o = t * 3 * stride;
      for (let j = 0; j < 3 * stride; j++) list.push(vertices[o + j]);
      continue;
    }
    const poly: Poly = [];
    for (let k = 0; k < 3; k++) {
      const v = new Float64Array(stride);
      const o = (t * 3 + k) * stride;
      for (let j = 0; j < stride; j++) v[j] = vertices[o + j];
      poly.push(v);
    }
    assign(poly, 0);
  }
  return out;
}

/** How far a point's projection lies outside a slab's rectangle (0 inside). */
function outsideSlab(s: RoofSlabPlan, v: Float64Array | number[]): number {
  const dx = v[0] - s.p[0], dy = v[1] - s.p[1], dz = v[2] - s.p[2];
  const e = dx * s.e[0] + dy * s.e[1] + dz * s.e[2], f = dx * s.f[0] + dy * s.f[1] + dz * s.f[2];
  const oe = e < s.e0 ? s.e0 - e : e > s.e1 ? e - s.e1 : 0;
  const of = f < s.f0 ? s.f0 - f : f > s.f1 ? f - s.f1 : 0;
  return Math.hypot(oe, of);
}

// ---- caps: a piece's broken edges and its back --------------------------------------------------------------------

/** One quad of a cap: its corners (body frame, wound to face `n`), its normal, its slot, its uv density (per metre). */
export interface CapQuad {
  corners: [Vec3, Vec3, Vec3, Vec3];
  n: Vec3;
  slot: FractureSlot;
  /** A shade on the slot's tint (dust on a broken edge, the light inside a room). */
  shade: number;
  /** The part of its piece it belongs to (0 for a piece that stays whole). */
  part?: number;
}

/**
 * The faces a piece needs beyond the building's own skin: a wall panel's back (its inner face, its openings left open)
 * and its four broken edges in its core; a floor's six faces (its boards, its ceiling, its edges); a roof part's
 * underside and edges; a gable's back; a chimney's broken top and foot. Body frame.
 */
export function capPiece(plan: CollapsePlan, piece: CollapsePiece): CapQuad[] {
  const caps: CapQuad[] = [];
  const boxCaps = (skip: (axis: number, sign: number) => boolean, slotFor: (axis: number, sign: number) => FractureSlot,
    shadeFor: (axis: number, sign: number) => number) => {
    const [qx, qy, qz, qw] = piece.rotation;
    const rot = (x: number, y: number, z: number): Vec3 => {
      const cx = qy * z - qz * y + qw * x, cy = qz * x - qx * z + qw * y, cz = qx * y - qy * x + qw * z;
      return [x + 2 * (qy * cz - qz * cy), y + 2 * (qz * cx - qx * cz), z + 2 * (qx * cy - qy * cx)];
    };
    const capBoxes: Array<CollapseBox & { part: number }> = piece.parts.length
      ? piece.parts.map((pp, k) => ({ center: pp.center, half: pp.half, part: k }))
      : piece.boxes.map((b) => ({ ...b, part: 0 }));
    for (const box of capBoxes) {
      if (box.rotation) continue;
      const [bx, by, bz] = box.center, [hx, hy, hz] = box.half;
      const P = (sx: number, sy: number, sz: number): Vec3 => {
        const r = rot(bx + sx * hx, by + sy * hy, bz + sz * hz);
        return [piece.center[0] + r[0], piece.center[1] + r[1], piece.center[2] + r[2]];
      };
      for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
        if (skip(axis, sign)) continue;
        const n = rot(axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0);
        // the face's corners counter-clockwise seen from outside
        let c: [Vec3, Vec3, Vec3, Vec3];
        if (axis === 0) c = [P(sign, -1, -sign), P(sign, -1, sign), P(sign, 1, sign), P(sign, 1, -sign)];
        else if (axis === 1) c = [P(-1, sign, -sign), P(1, sign, -sign), P(1, sign, sign), P(-1, sign, sign)];
        else c = [P(-sign, -1, sign), P(sign, -1, sign), P(sign, 1, sign), P(-sign, 1, sign)];
        caps.push({ corners: [c[0], c[1], c[2], c[3]], n, slot: slotFor(axis, sign), shade: shadeFor(axis, sign), part: box.part });
      }
    }
  };
  const fp = piece.face ? plan.storeys[piece.face.storey]?.faces.find((f) => f.index === piece.face!.face) ?? null : null;
  switch (piece.kind) {
    case 'wall':
      if (fp && piece.face) {
        // its parts' (or its boxes') rectangles on the face: each its back with the openings left open, and its edges
        const where = piece.face, f = fp.face, T = where.thickness;
        const uc = (where.u0 + where.u1) / 2, yc = (where.y0 + where.y1) / 2;
        const sgn = dot(norm(cross([0, 1, 0], norm(f.out))), f.u) < 0 ? -1 : 1;
        const rects = piece.parts.length ? piece.parts.map((p) => p.rect)
          : piece.boxes.map((b) => ({ u0: uc + sgn * b.center[0] - b.half[0], u1: uc + sgn * b.center[0] + b.half[0],
            y0: yc + b.center[1] - b.half[1], y1: yc + b.center[1] + b.half[1] }));
        const P = (u: number, y: number, o: number): Vec3 => [f.origin[0] + f.u[0] * u + f.out[0] * o, f.origin[1] + y, f.origin[2] + f.u[2] * u + f.out[2] * o];
        const inN: Vec3 = [-f.out[0], -f.out[1], -f.out[2]], uN: Vec3 = [f.u[0], f.u[1], f.u[2]];
        rects.forEach((r, part) => {
          // the back: the rectangle cut by its openings' edges into cells, those inside an opening left open
          const us = [r.u0, r.u1], ys = [r.y0, r.y1];
          for (const op of f.openings) {
            for (const u of [op.u - op.w / 2, op.u + op.w / 2]) if (u > r.u0 && u < r.u1) us.push(u);
            for (const y of [op.y0, op.y0 + op.h]) if (y > r.y0 && y < r.y1) ys.push(y);
          }
          us.sort((a, b) => a - b); ys.sort((a, b) => a - b);
          for (let i = 0; i + 1 < us.length; i++) for (let j = 0; j + 1 < ys.length; j++) {
            const mu = (us[i] + us[i + 1]) / 2, my = (ys[j] + ys[j + 1]) / 2;
            if (us[i + 1] - us[i] < 0.01 || ys[j + 1] - ys[j] < 0.01) continue;
            if (f.openings.some((op) => Math.abs(mu - op.u) < op.w / 2 && my > op.y0 && my < op.y0 + op.h)) continue;
            caps.push({ corners: [P(us[i], ys[j], -T), P(us[i + 1], ys[j], -T), P(us[i + 1], ys[j + 1], -T), P(us[i], ys[j + 1], -T)],
              n: inN, slot: piece.back, shade: 0.92, part });
          }
          // the broken edges: top and foot, and its two ends, through the wall's depth
          const edge = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, n: Vec3) => caps.push({ corners: [a, b, c, d], n, slot: piece.core, shade: 0.82, part });
          edge(P(r.u0, r.y1, 0), P(r.u1, r.y1, 0), P(r.u1, r.y1, -T), P(r.u0, r.y1, -T), [0, 1, 0]);
          edge(P(r.u0, r.y0, 0), P(r.u1, r.y0, 0), P(r.u1, r.y0, -T), P(r.u0, r.y0, -T), [0, -1, 0]);
          edge(P(r.u1, r.y0, 0), P(r.u1, r.y1, 0), P(r.u1, r.y1, -T), P(r.u1, r.y0, -T), uN);
          edge(P(r.u0, r.y0, 0), P(r.u0, r.y1, 0), P(r.u0, r.y1, -T), P(r.u0, r.y0, -T), [-uN[0], -uN[1], -uN[2]]);
        });
        break;
      }
      boxCaps((axis, sign) => axis === 2 && sign > 0, (axis, sign) => (axis === 2 && sign < 0 ? piece.back : piece.core),
        (axis, sign) => (axis === 2 && sign < 0 ? 0.92 : 0.82));
      break;
    case 'gable':
      // the face's own skin is the building's (+z); its back (−z) and its four edges are the caps
      boxCaps((axis, sign) => axis === 2 && sign > 0, (axis, sign) => (axis === 2 && sign < 0 ? piece.back : piece.core),
        (axis, sign) => (axis === 2 && sign < 0 ? 0.92 : 0.82));
      break;
    case 'floor':
      boxCaps(() => false, (axis, sign) => (axis === 1 && sign < 0 ? piece.back : piece.core), (axis) => (axis === 1 ? 0.82 : 0.75));
      break;
    case 'roof':
      // the covering on top is the building's; its underside and edges
      boxCaps((axis, sign) => axis === 1 && sign > 0, () => piece.core, (axis, sign) => (axis === 1 && sign < 0 ? 0.85 : 0.75));
      break;
    case 'chimney':
    case 'drum':
      // a stack's (a drum's) sides are the building's; its broken top and foot
      boxCaps((axis) => axis !== 1, () => piece.core, () => 0.78);
      break;
    case 'crown':
      boxCaps((axis, sign) => !(axis === 1 && sign < 0), () => piece.core, () => 0.7);
      break;
  }
  void plan;
  return caps;
}

// ---- the stubs: what stays standing ---------------------------------------------------------------------------------

/** A static box of the remnant (a stub's run along its face, a corner pier), body frame: centre, its face's u axis and
 *  out normal, half length along u, half thickness, and its foot and top. */
interface StubBox {
  center: Vec3;
  u: Vec3;
  out: Vec3;
  halfU: number;
  halfT: number;
  y0: number;
  y1: number;
}

/** The ground storey's stubs and corner piers as boxes (the bodies stand and land on them). */
function stubBoxes(plan: CollapsePlan): StubBox[] {
  const boxes: StubBox[] = [];
  if (plan.shaft) {
    // a shaft's stump
    const y0 = plan.groundY, y1 = plan.shaft.stumpY;
    if (y1 > y0 + 0.1) boxes.push({ center: [plan.cx, (y0 + y1) / 2, plan.cz], u: [1, 0, 0], out: [0, 0, 1], halfU: plan.hw * 0.98, halfT: plan.hd * 0.98, y0, y1 });
    return boxes;
  }
  const st = plan.storeys[0];
  if (!st) return boxes;
  for (const fp of st.faces) {
    if (!fp.stubTop.length) continue;
    const f = fp.face, T = fp.thickness;
    const cuts = [-f.width / 2, ...fp.splits, f.width / 2];
    const box = (u0: number, u1: number, y0: number, y1: number) => {
      if (!(u1 - u0 > 0.05 && y1 - y0 > 0.05)) return;
      const uc = (u0 + u1) / 2;
      boxes.push({
        center: [f.origin[0] + f.u[0] * uc - f.out[0] * T / 2, f.origin[1] + (y0 + y1) / 2, f.origin[2] + f.u[2] * uc - f.out[2] * T / 2],
        u: f.u, out: f.out, halfU: (u1 - u0) / 2, halfT: T / 2, y0: f.origin[1] + y0, y1: f.origin[1] + y1,
      });
    };
    cuts[0] = fp.uMin; cuts[cuts.length - 1] = fp.uMax;
    for (let k = 0; k + 1 < cuts.length; k++) box(cuts[k], cuts[k + 1], 0, fp.stubTop[k]);
    if (fp.pierW > 0) {
      box(fp.uMin, fp.uMin + fp.pierW, fp.stubTop[0], fp.pierTop[0]);
      box(fp.uMax - fp.pierW, fp.uMax, fp.stubTop[fp.stubTop.length - 1], fp.pierTop[1]);
    }
  }
  // the chimneys that stand: a ground stack to its break (whole, when nothing of it falls)
  for (const c of plan.chimneys) {
    if (c.fromRoof || !Number.isFinite(c.breakY)) continue;
    const top = c.piece >= 0 ? c.breakY : c.max[1] - 0.04;
    const y0 = c.min[1] + 0.04;
    if (!(top > y0 + 0.1)) continue;
    boxes.push({ center: [(c.min[0] + c.max[0]) / 2, (y0 + top) / 2, (c.min[2] + c.max[2]) / 2], u: [1, 0, 0], out: [0, 0, 1],
      halfU: (c.max[0] - c.min[0]) / 2 - 0.04, halfT: (c.max[2] - c.min[2]) / 2 - 0.04, y0, y1: top });
  }
  return boxes;
}

/**
 * The remnant's cut faces: each stub's broken top in its core and its inner face (the building's own skin is its
 * outer face), a pier's top and the side it broke from. Body frame.
 */
export function capStubs(plan: CollapsePlan): CapQuad[] {
  const caps: CapQuad[] = [];
  if (plan.shaft) {
    // a shaft's stump: its broken top
    const y = plan.shaft.stumpY, x0 = plan.cx - plan.hw, x1 = plan.cx + plan.hw, z0 = plan.cz - plan.hd, z1 = plan.cz + plan.hd;
    caps.push({ corners: [[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], n: [0, 1, 0], slot: plan.shaft.slot, shade: 0.75 });
    return caps;
  }
  // a ground stack broken off at the roof line: its broken top
  for (const c of plan.chimneys) {
    if (c.piece < 0 || c.fromRoof || !Number.isFinite(c.breakY)) continue;
    const y = c.breakY, x0 = c.min[0] + 0.04, x1 = c.max[0] - 0.04, z0 = c.min[2] + 0.04, z1 = c.max[2] - 0.04;
    caps.push({ corners: [[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], n: [0, 1, 0],
      slot: { material: 'brick', bucket: plan.chimneyBucket, tint: [0.55, 0.38, 0.3], thicknessM: 0.24, share: 0 }, shade: 0.8 });
  }
  const st = plan.storeys[0];
  if (!st) return caps;
  for (const fp of st.faces) {
    if (!fp.stubTop.length) continue;
    const f = fp.face, T = fp.thickness;
    const core = coreOf(f), back = backOf(f);
    const P = (u: number, y: number, o: number): Vec3 => [f.origin[0] + f.u[0] * u + f.out[0] * o, f.origin[1] + y, f.origin[2] + f.u[2] * u + f.out[2] * o];
    const upN: Vec3 = [0, 1, 0], inN: Vec3 = [-f.out[0], -f.out[1], -f.out[2]];
    const top = (u0: number, u1: number, y: number) => caps.push({ corners: [P(u0, y, 0), P(u1, y, 0), P(u1, y, -T), P(u0, y, -T)], n: upN, slot: core, shade: 0.8 });
    const inner = (u0: number, u1: number, y0: number, y1: number) => caps.push({ corners: [P(u1, y0, -T), P(u0, y0, -T), P(u0, y1, -T), P(u1, y1, -T)], n: inN, slot: back, shade: 0.9 });
    const cuts = [fp.uMin, ...fp.splits, fp.uMax];
    for (let k = 0; k + 1 < cuts.length; k++) {
      top(cuts[k], cuts[k + 1], fp.stubTop[k]);
      inner(cuts[k], cuts[k + 1], 0, fp.stubTop[k]);
      // a step between neighbouring stubs: the taller one's broken end
      if (k + 2 < cuts.length) {
        const a = fp.stubTop[k], b = fp.stubTop[k + 1], u = cuts[k + 1];
        if (Math.abs(a - b) > 0.02) {
          const lo = Math.min(a, b), hi = Math.max(a, b), sgn = a > b ? 1 : -1;
          const n: Vec3 = [f.u[0] * sgn, 0, f.u[2] * sgn];
          caps.push({ corners: sgn > 0 ? [P(u, lo, -T), P(u, lo, 0), P(u, hi, 0), P(u, hi, -T)] : [P(u, lo, 0), P(u, lo, -T), P(u, hi, -T), P(u, hi, 0)], n, slot: core, shade: 0.8 });
        }
      }
    }
    if (fp.pierW > 0) {
      for (const end of [0, 1] as const) {
        const y0 = end === 0 ? fp.stubTop[0] : fp.stubTop[fp.stubTop.length - 1], y1 = fp.pierTop[end];
        if (!(y1 > y0 + 0.05)) continue;
        const u0 = end === 0 ? fp.uMin : fp.uMax - fp.pierW, u1 = end === 0 ? fp.uMin + fp.pierW : fp.uMax;
        top(u0, u1, y1);
        inner(u0, u1, y0, y1);
        // its inner side, where the wall beside it broke away
        const u = end === 0 ? u1 : u0, sgn = end === 0 ? 1 : -1;
        const n: Vec3 = [f.u[0] * sgn, 0, f.u[2] * sgn];
        caps.push({ corners: sgn > 0 ? [P(u, y0, -T), P(u, y0, 0), P(u, y1, 0), P(u, y1, -T)] : [P(u, y0, 0), P(u, y0, -T), P(u, y1, -T), P(u, y1, 0)], n, slot: core, shade: 0.8 });
      }
    }
  }
  return caps;
}

/**
 * The stubs and piers as static collision prisms in the world (obb records: hw along the face, hl through the wall),
 * for the debris pool: the falling pieces stand on them and land against them. `placement` is the body frame's.
 */
export function stubRecords(plan: CollapsePlan, placement: { x: number; y: number; z: number; yaw: number }): CollisionRecord[] {
  const c = Math.cos(placement.yaw), s = Math.sin(placement.yaw);
  const out: CollisionRecord[] = [];
  for (const b of stubBoxes(plan)) {
    const wcx = placement.x + b.center[0] * c + b.center[2] * s, wcz = placement.z - b.center[0] * s + b.center[2] * c;
    const ux = b.u[0] * c + b.u[2] * s, uz = -b.u[0] * s + b.u[2] * c;
    // obb: hw along right (cos yaw, −sin yaw) = the face's u, hl along forward = its normal
    const yaw = Math.atan2(-uz, ux);
    const ex = Math.abs(ux) * b.halfU + Math.abs(uz) * b.halfT, ez = Math.abs(uz) * b.halfU + Math.abs(ux) * b.halfT;
    const y0 = placement.y + b.y0, y1 = placement.y + b.y1;
    out.push({
      min: [wcx - ex, y0, wcz - ez], max: [wcx + ex, y1, wcz + ez],
      shape2: { kind: 'obb', cx: wcx, cz: wcz, hw: b.halfU, hl: b.halfT, yaw, y0, y1 },
      kind: 'remnant',
    } as CollisionRecord);
  }
  return out;
}

// ---- the bodies -------------------------------------------------------------------------------------------------

const shapeCache = new Map<string, RigidShape>();
const SHAPE_CACHE_MAX = 384;

/** A piece's rigid shape (sim/rigidBody.ts): its box or notched pair, its mass; masonry lands dead and grips. Cached by
 *  its dimensions and density (a shape allocates). */
export function pieceShape(piece: CollapsePiece): RigidShape {
  const volume = piece.boxes.reduce((a, b) => a + 8 * b.half[0] * b.half[1] * b.half[2], 0) || 1;
  const density = Math.max(60, Math.min(4000, piece.massKg / volume));
  const q = (v: number) => Math.round(v * 100);
  const key = `${Math.round(density / 10)}|${piece.boxes.map((b) => `${b.center.map(q).join(',')}:${b.half.map(q).join(',')}${b.rotation ? `@${b.rotation.map((v) => Math.round(v * 1e4)).join(',')}` : ''}`).join(';')}`;
  const hit = shapeCache.get(key);
  if (hit) return hit;
  // masonry lands dead (restitution 0.12-0.18, the physics lane's reading) and grips (0.7): a slab lies where it falls
  const opts = { restitution: 0.14, friction: 0.72, rolling: 0.15 };
  let shape: RigidShape;
  const one = piece.boxes.length === 1 && !piece.boxes[0].rotation && piece.boxes[0].center.every((v) => Math.abs(v) < 1e-6);
  if (one) {
    const [hx, hy, hz] = piece.boxes[0].half;
    shape = createRigidBox(Math.max(0.03, hx), Math.max(0.03, hy), Math.max(0.03, hz), density, opts);
  } else {
    shape = createRigidShape(piece.boxes.map((b) => ({
      kind: 'box' as const, center: b.center, rotation: b.rotation,
      half: [Math.max(0.03, b.half[0]), Math.max(0.03, b.half[1]), Math.max(0.03, b.half[2])] as [number, number, number],
      mass: density * 8 * b.half[0] * b.half[1] * b.half[2],
    })), opts);
  }
  if (shapeCache.size >= SHAPE_CACHE_MAX) shapeCache.delete(shapeCache.keys().next().value!);
  shapeCache.set(key, shape);
  return shape;
}

/** A piece's world spawn: its frame's pose, standing where it stood (it rests, asleep, until its kick). */
export function pieceSpawn(piece: CollapsePiece, placement: { x: number; y: number; z: number; yaw: number }): {
  x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number;
} {
  const c = Math.cos(placement.yaw), s = Math.sin(placement.yaw);
  const [px, py, pz] = piece.center;
  // q = rotY(yaw) · q_piece
  const hy = Math.sin(placement.yaw / 2), hw = Math.cos(placement.yaw / 2);
  const [ax, ay, az, aw] = piece.rotation;
  return {
    x: placement.x + px * c + pz * s, y: placement.y + py, z: placement.z - px * s + pz * c,
    qx: hw * ax + hy * az, qy: hw * ay + hy * aw, qz: hw * az - hy * ax, qw: hw * aw - hy * ay,
  };
}

/**
 * A piece's kick as a world impulse at a world point, from its pose now ([x, y, z, qx, qy, qz, qw]): its mass times its
 * kick (body frame, carried to the world) at its kick point; null for a piece that waits for its support.
 */
export function pieceKick(piece: CollapsePiece, placement: { yaw: number }, pose: ArrayLike<number>, out: Float64Array | number[]): boolean {
  const [kx, ky, kz] = piece.kick;
  if (!(kx * kx + ky * ky + kz * kz > 1e-6)) return false;
  const c = Math.cos(placement.yaw), s = Math.sin(placement.yaw);
  const m = piece.massKg;
  out[0] = m * (kx * c + kz * s); out[1] = m * ky; out[2] = m * (-kx * s + kz * c);
  const qx = pose[3], qy = pose[4], qz = pose[5], qw = pose[6];
  const [x, y, z] = piece.kickAt;
  const cx = qy * z - qz * y + qw * x, cy = qz * x - qx * z + qw * y, cz = qx * y - qy * x + qw * z;
  out[3] = pose[0] + x + 2 * (qy * cz - qz * cy);
  out[4] = pose[1] + y + 2 * (qz * cx - qx * cz);
  out[5] = pose[2] + z + 2 * (qx * cy - qy * cx);
  return true;
}

/** A part's own rigid shape once it has broken off (its box, its mass; cached as a piece's). */
export function partShape(part: CollapsePart): RigidShape {
  const [hx, hy, hz] = part.half;
  const volume = 8 * hx * hy * hz || 1;
  const density = Math.max(60, Math.min(4000, part.massKg / volume));
  const key = `part|${Math.round(density / 10)}|${part.half.map((v) => Math.round(v * 100)).join(',')}`;
  const hit = shapeCache.get(key);
  if (hit) return hit;
  const shape = createRigidBox(Math.max(0.03, hx), Math.max(0.03, hy), Math.max(0.03, hz), density, { restitution: 0.14, friction: 0.72, rolling: 0.15 });
  if (shapeCache.size >= SHAPE_CACHE_MAX) shapeCache.delete(shapeCache.keys().next().value!);
  shapeCache.set(key, shape);
  return shape;
}
