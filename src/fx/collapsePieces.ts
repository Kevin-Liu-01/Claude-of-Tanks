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

export type CollapsePieceKind = 'wall' | 'floor' | 'roof' | 'gable' | 'chimney';

/** A box of a piece's proxy, in the piece's own frame (its centre and axes). */
export interface CollapseBox {
  center: [number, number, number];
  half: [number, number, number];
}

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
  /** Its start velocity (body frame, m/s) and spin (body frame, rad/s). */
  readonly velocity: [number, number, number];
  readonly spin: [number, number, number];
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
  /** Bounds in (e, f) about p. */
  e0: number; e1: number; f0: number; f1: number;
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
  piece: number;
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
}

export interface CollapsePlanOptions {
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
export function quatFromAxes(x: Vec3, y: Vec3, z: Vec3): [number, number, number, number] {
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
export function wallThickness(face: DamageFace): number {
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
  const rng = damageRng(damageSeed(anatomy.seed, 0x7c01, anatomy.structureIdx));
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
    const f = norm(cross(n, e));
    const p: Vec3 = [(c0[0] + c1[0] + c2[0] + c3[0]) / 4, (c0[1] + c1[1] + c2[1] + c3[1]) / 4, (c0[2] + c1[2] + c2[2] + c3[2]) / 4];
    let e0 = Infinity, e1 = -Infinity, f0 = Infinity, f1 = -Infinity;
    for (const c of slab.corners) {
      const d: Vec3 = [c[0] - p[0], c[1] - p[1], c[2] - p[2]];
      const de = dot(d, e), df = dot(d, f);
      e0 = Math.min(e0, de); e1 = Math.max(e1, de); f0 = Math.min(f0, df); f1 = Math.max(f1, df);
    }
    if (!(e1 - e0 > 0.4 && f1 - f0 > 0.4)) continue;
    slabs.push({ p, n, e, f, e0, e1, f0, f1, cuts: [], pieces: [] });
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
  const chimneys: ChimneyPlan[] = anatomy.chimneys.filter((c) => c.y1 - c.y0 > 0.5 && c.sx > 0.15 && c.sz > 0.15).map((c) => ({
    min: [c.x - c.sx / 2 - 0.04, c.y0 - 0.04, c.z - c.sz / 2 - 0.04] as Vec3,
    max: [c.x + c.sx / 2 + 0.04, c.y1 + 0.04, c.z + c.sz / 2 + 0.04] as Vec3,
    // a stack from the ground keeps a half to most of itself (the kit's remnant rule); one from the roof falls whole
    breakY: c.y0 <= groundY + 1 ? c.y0 + (c.y1 - c.y0) * (0.45 + rng() * 0.35) : -Infinity,
    piece: -1,
  }));
  const fixedCount = (parts: number) => slabs.length * parts + gableFaces.length + chimneys.length
    + Math.max(0, storeys.length - 1);

  // the walls' panel width: as wide as the cap needs
  const roofParts = (s: RoofSlabPlan, long: number) => (s.e1 - s.e0 > long ? 2 : 1);
  let target = shed ? Infinity : large ? 5.5 : 3.8;
  let longSlab = large ? 9 : 6.5;
  const panelsFor = (face: DamageFace) => (Number.isFinite(target) ? Math.max(1, Math.min(4, Math.round(face.width / target))) : 1);
  const count = () => storeys.reduce((a, st) => a + st.faces.reduce((b, f) => b + panelsFor(f), 0), 0)
    + slabs.reduce((a, s) => a + roofParts(s, longSlab), 0) + gableFaces.length + chimneys.length + Math.max(0, storeys.length - 1);
  for (let guard = 0; guard < 24 && count() > cap; guard++) {
    if (Number.isFinite(target) && target < 16) target *= 1.25;
    else if (longSlab < 40) longSlab *= 1.5;
    else break;
  }
  void fixedCount;

  const pieces: CollapsePiece[] = [];
  const add = (piece: Omit<CollapsePiece, 'index'>): number => {
    if (pieces.length >= cap) return -1;
    pieces.push({ ...piece, index: pieces.length });
    return pieces.length - 1;
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
      const splits = faceSplits(face, n, rng);
      const fp: FacePlan = { face, index: fi, side, thickness, splits, panels: [], stubTop: [], pierTop: [0, 0], pierW: 0 };
      plan.faces.push(fp);
      if (!plan.bySide[side]) plan.bySide[side] = fp;
      // the ground storey's stubs: over the heap banked against the wall, irregular by panel, a pier at each corner
      if (s === 0) {
        const rem = anatomy.remnant;
        const bank = (u: number) => Math.max(0, bodyMoundHeightAt(anatomy, face.origin[0] + face.u[0] * u, face.origin[2] + face.u[2] * u));
        const cuts = [-face.width / 2, ...splits, face.width / 2];
        for (let k = 0; k + 1 < cuts.length; k++) {
          const mid = (cuts[k] + cuts[k + 1]) / 2;
          const top = bank(mid) + Math.max(0.25, rem.stubHeightM) * (0.7 + 0.45 * rng());
          fp.stubTop.push(Math.min(face.height - 0.6, Math.max(0.3, top)));
        }
        if (rem.corners && face.width > 3.2) {
          fp.pierW = Math.min(0.9, face.width * 0.16);
          fp.pierTop = [
            Math.min(face.height - 0.4, bank(-face.width / 2) + 2 + rng() * 0.5),
            Math.min(face.height - 0.4, bank(face.width / 2) + 2 + rng() * 0.5),
          ];
        }
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
      // the faces along x stop short of the corners the faces along z hold (no proxy starts inside another)
      const alongZ = fp.side >= 2;
      const corner = (end: number): number => {
        if (alongZ) return 0;
        const other = plan.bySide[end < 0 ? 2 : 3] ?? plan.bySide[end < 0 ? 3 : 2];
        return other ? other.thickness + GAP_M : 0;
      };
      const delay = sideDelay(fp.side);
      for (let k = 0; k + 1 < cuts.length; k++) {
        const u0 = cuts[k] + (k === 0 ? corner(-1) : GAP_M / 2);
        const u1 = cuts[k + 1] - (k + 2 === cuts.length ? corner(1) : GAP_M / 2);
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
        const boxes: CollapseBox[] = [{ center: [0, 0, 0], half: [(u1 - u0) / 2, (yt - yb) / 2, T / 2 - GAP_M / 2] }];
        // an end panel of the ground storey stands over its corner pier: notched (a box beside the pier, one over it)
        if (plan.index === 0 && fp.pierW > 0) {
          for (const end of [0, 1] as const) {
            if ((end === 0 && k !== 0) || (end === 1 && k + 2 !== cuts.length)) continue;
            const pierTop = fp.pierTop[end] + GAP_M;
            if (pierTop <= yb + 0.2 || pierTop >= yt - 0.3) continue;
            const pu0 = end === 0 ? u0 : u1 - fp.pierW, pu1 = end === 0 ? u0 + fp.pierW : u1;
            if (u1 - u0 - fp.pierW < 0.5) continue;
            // the box beside the pier (its full height) and the one over it, in the piece frame (x along xAxis)
            const sgn = flip ? -1 : 1;
            const restU0 = end === 0 ? pu1 : u0, restU1 = end === 0 ? u1 : pu0;
            const b0: CollapseBox = { center: [sgn * ((restU0 + restU1) / 2 - uc), 0, 0], half: [(restU1 - restU0) / 2, (yt - yb) / 2, T / 2 - GAP_M / 2] };
            const b1: CollapseBox = { center: [sgn * ((pu0 + pu1) / 2 - uc), (pierTop + yt) / 2 - yc, 0], half: [(pu1 - pu0) / 2, (yt - pierTop) / 2, T / 2 - GAP_M / 2] };
            boxes.splice(0, boxes.length, b0, b1);
          }
        }
        const area = (u1 - u0) * (yt - yb);
        const massKg = Math.max(30, area * T * wallDensity(face) * (1 - openingShare(face, u0, u1, yb, yt)));
        // the start: the struck face pushed in by the blow (hardest nearest its point), the rest off their feet with
        // a tip, outward more often than in
        let push: number, tip: number;
        if (fp.side === struckSide) {
          const near = blowPoint ? Math.max(0.35, 1 - Math.hypot(center[0] - blowPoint[0], center[1] - blowPoint[1], center[2] - blowPoint[2]) / 9) : 0.7;
          push = -struckPush * near * (0.8 + 0.4 * rng());
          tip = -(0.5 + 0.6 * rng()) * near;
        } else {
          const outward = rng() < 0.62 ? 1 : -1;
          push = outward * (0.35 + 0.35 * rng());
          tip = outward * (0.35 + 0.55 * rng());
        }
        const spinAxis = cross(up, zAxis); // tips the top along +out
        const releaseS = delay + (plan.index === 0 ? 0.12 + rng() * 0.3 : rng() * 0.2) * (fp.side === struckSide ? 0.3 : 1);
        const index = add({
          kind: 'wall', center, rotation: quatFromAxes(xAxis, up, zAxis), boxes, massKg,
          material: face.members.length ? 'timber' : coreOf(face).material, core: coreOf(face), back: backOf(face),
          face: { storey: plan.index, face: fp.index, u0, u1, y0: yb, y1: yt, thickness: T }, releaseS,
          velocity: [zAxis[0] * push, 0, zAxis[2] * push],
          spin: [spinAxis[0] * tip, 0, spinAxis[2] * tip],
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
    plan.floorPiece = add({
      kind: 'floor', center: [cx, (fy0 + fy1) / 2, cz], rotation: [0, 0, 0, 1],
      boxes: [{ center: [0, 0, 0], half: [hw, (fy1 - fy0) / 2, hd] }], massKg: Math.max(200, area * kgM2),
      material: slot.material, core: slot, back: ceilingOf(slot), face: null,
      releaseS: 0.25 + rng() * 0.3, velocity: [0, 0, 0], spin: [0, 0, 0],
    });
  }

  // the roof's slabs (halved across their eave when long), the gables over the eaves, the chimneys
  const covering = roof?.covering;
  for (const slab of slabs) {
    const parts = roofParts(slab, longSlab);
    slab.cuts = parts === 2 ? [(slab.e0 + slab.e1) / 2 + (rng() - 0.5) * 0.15 * (slab.e1 - slab.e0)] : [];
    const edges = [slab.e0, ...slab.cuts, slab.e1];
    const t = Math.max(0.1, Math.min(0.4, roof!.thicknessM || 0.22));
    for (let k = 0; k + 1 < edges.length; k++) {
      const a = edges[k] + GAP_M / 2, b = edges[k + 1] - GAP_M / 2;
      // a triangular slab (a hip) gets a box inside its outline
      const tri = slabIsTriangle(roof!.slabs[slabs.indexOf(slab)]?.corners);
      const ia = tri ? a + (b - a) * 0.15 : a, ib = tri ? b - (b - a) * 0.15 : b;
      const fa = tri ? slab.f0 : slab.f0, fb = tri ? slab.f0 + (slab.f1 - slab.f0) * 0.7 : slab.f1;
      const ec = (ia + ib) / 2, fc = (fa + fb) / 2;
      const center: [number, number, number] = [
        slab.p[0] + slab.e[0] * ec + slab.f[0] * fc - slab.n[0] * t / 2,
        slab.p[1] + slab.e[1] * ec + slab.f[1] * fc - slab.n[1] * t / 2,
        slab.p[2] + slab.e[2] * ec + slab.f[2] * fc - slab.n[2] * t / 2,
      ];
      const areaM2 = (b - a) * (slab.f1 - slab.f0) * (tri ? 0.5 : 1);
      const kg = (COVERING_KG_M2[covering?.material ?? 'tile'] ?? 45) + ROOF_FRAME_KG_M2;
      // the roof drops into the building as its walls go: straight down, tipping toward the struck side
      const sx = struckSide >= 0 ? SIDES[struckSide] : [0, 0, 0];
      const tipAxis = cross(up, [-sx[0], 0, -sx[2]]);
      const index = add({
        kind: 'roof', center, rotation: quatFromAxes(slab.e, slab.n, cross(slab.e, slab.n)),
        boxes: [{ center: [0, 0, 0], half: [(ib - ia) / 2, t / 2, (fb - fa) / 2] }], massKg: Math.max(60, areaM2 * kg),
        material: covering?.material ?? 'tile', core: roof!.structure, back: roof!.structure, face: null,
        releaseS: 0.12 + rng() * 0.25, velocity: [-sx[0] * 0.4, -0.3, -sx[2] * 0.4],
        spin: [tipAxis[0] * 0.25, 0, tipAxis[2] * 0.25],
      });
      slab.pieces.push(index);
    }
  }
  for (const g of gableFaces) {
    const face = g.face;
    const T = g.thickness;
    const base = eaveY - face.origin[1], apex = (roof!.ridgeY - face.origin[1]);
    const hgt = apex - base;
    const yb = base + GAP_M, yt = base + hgt * 0.4;
    const halfU = face.width / 2 * 0.5;
    const zAxis = norm(face.out), xAxis = norm(cross(up, zAxis));
    const center: [number, number, number] = [face.origin[0] - face.out[0] * T / 2, face.origin[1] + (yb + yt) / 2, face.origin[2] - face.out[2] * T / 2];
    const areaM2 = face.width * hgt / 2;
    const outward = rng() < 0.7 ? 1 : -1;
    const spinAxis = cross(up, zAxis);
    g.piece = add({
      kind: 'gable', center, rotation: quatFromAxes(xAxis, up, zAxis),
      boxes: [{ center: [0, 0, 0], half: [halfU, (yt - yb) / 2, T / 2 - GAP_M / 2] }], massKg: Math.max(40, areaM2 * T * wallDensity(face)),
      material: coreOf(face).material, core: coreOf(face), back: backOf(face), face: null,
      releaseS: 0.2 + rng() * 0.3, velocity: [zAxis[0] * outward * 0.5, 0, zAxis[2] * outward * 0.5],
      spin: [spinAxis[0] * outward * 0.6, 0, spinAxis[2] * outward * 0.6],
    });
  }
  for (const c of chimneys) {
    const y0 = Number.isFinite(c.breakY) ? c.breakY + GAP_M : c.min[1] + 0.04;
    const y1 = c.max[1] - 0.04;
    if (!(y1 - y0 > 0.4)) continue;
    const hx = (c.max[0] - c.min[0]) / 2 - 0.04, hz = (c.max[2] - c.min[2]) / 2 - 0.04;
    const slot: FractureSlot = { material: 'brick', bucket: anatomy.chimneys[chimneys.indexOf(c)]?.bucket ?? 'brick', tint: [0.6, 0.42, 0.34], thicknessM: 0.24, share: 0 };
    const tipDir = struckSide >= 0 ? SIDES[struckSide ^ 1] : [1, 0, 0];
    const tipAxis = cross(up, tipDir as Vec3);
    c.piece = add({
      kind: 'chimney', center: [(c.min[0] + c.max[0]) / 2, (y0 + y1) / 2, (c.min[2] + c.max[2]) / 2], rotation: [0, 0, 0, 1],
      boxes: [{ center: [0, 0, 0], half: [hx, (y1 - y0) / 2, hz] }], massKg: Math.max(80, 8 * hx * hz * (y1 - y0) / 2 * 0.7 * DENSITY.brick),
      material: 'brick', core: slot, back: slot, face: null, releaseS: 0.3 + rng() * 0.4,
      velocity: [0, 0, 0], spin: [tipAxis[0] * 0.5, 0, tipAxis[2] * 0.5],
    });
  }
  return { pieces, structureIdx: anatomy.structureIdx, groundY, eaveY, cx, cz, hw, hd, storeys: storeyPlans, roof: slabs, gables: gableFaces,
    chimneys, struckSide };
}

function slabIsTriangle(corners: readonly [Vec3, Vec3, Vec3, Vec3] | undefined): boolean {
  if (!corners) return false;
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.05) return true;
  }
  return false;
}

/** A wall's inner face: a render over its core shows inside as plaster; a bare wall shows its own material. */
function backOf(face: DamageFace): FractureSlot {
  const skin = skinOf(face);
  if (skin.material === 'plaster') return { ...skin, tint: [Math.min(1, skin.tint[0] * 1.05), Math.min(1, skin.tint[1] * 1.04), Math.min(1, skin.tint[2] * 1.02)] };
  return coreOf(face);
}

/** A floor's underside: the ceiling's lime under timber joists, the slab's own concrete. */
function ceilingOf(slot: FractureSlot): FractureSlot {
  if (slot.material === 'concrete') return slot;
  return { ...slot, tint: [Math.min(1, slot.tint[0] * 1.1), Math.min(1, slot.tint[1] * 1.08), Math.min(1, slot.tint[2] * 1.05)] };
}

// ---- the partition: the building's own triangles between its pieces ------------------------------------------------

/** Floats a partitioned vertex carries: position, normal, uv, colour. */
export const PIECE_VERTEX_STRIDE = 11;
/** The static remnant's index in the partition's output (the stubs, piers, plinth and footings). */
export const STATIC_PIECE = -1;

const MAX_SPLITS = 10;
const _cent: [number, number, number] = [0, 0, 0];

type Poly = Float64Array[];

/** The polygon's vertices on either side of the plane n·p = d (each a fresh array; attributes interpolated). */
function splitPoly(poly: Poly, nx: number, ny: number, nz: number, d: number, front: Poly, back: Poly): void {
  front.length = 0; back.length = 0;
  const count = poly.length;
  for (let i = 0; i < count; i++) {
    const a = poly[i], b = poly[(i + 1) % count];
    const sa = nx * a[0] + ny * a[1] + nz * a[2] - d, sb = nx * b[0] + ny * b[1] + nz * b[2] - d;
    if (sa >= 0) front.push(a); else back.push(a);
    if ((sa >= 0) !== (sb >= 0)) {
      const t = sa / (sa - sb);
      const v = new Float64Array(PIECE_VERTEX_STRIDE);
      for (let k = 0; k < PIECE_VERTEX_STRIDE; k++) v[k] = a[k] + (b[k] - a[k]) * t;
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
 * Cut the building's triangles (body frame, non-indexed, PIECE_VERTEX_STRIDE floats a vertex) between the plan's
 * pieces. Returns each piece's triangles (same layout), and the static remnant's (STATIC_PIECE: the stubs and piers,
 * the plinth, the chimney feet), keyed by piece index. A triangle that crosses a cut is split along it.
 */
export function partitionTriangles(plan: CollapsePlan, vertices: Float32Array | Float64Array, triangles: number): Map<number, number[]> {
  const out = new Map<number, number[]>();
  const emit = (piece: number, poly: Poly): void => {
    if (poly.length < 3) return;
    let list = out.get(piece);
    if (!list) { list = []; out.set(piece, list); }
    const a = poly[0];
    for (let i = 1; i + 1 < poly.length; i++) {
      const b = poly[i], c = poly[i + 1];
      for (let k = 0; k < PIECE_VERTEX_STRIDE; k++) list.push(a[k]);
      for (let k = 0; k < PIECE_VERTEX_STRIDE; k++) list.push(b[k]);
      for (let k = 0; k < PIECE_VERTEX_STRIDE; k++) list.push(c[k]);
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

  const assign = (poly: Poly, depth: number): void => {
    // the chimneys first: a polygon wholly inside a stack's box is the stack's (its foot below the break stays)
    for (const c of plan.chimneys) {
      if (!poly.every((v) => v[0] >= c.min[0] && v[0] <= c.max[0] && v[1] >= c.min[1] && v[1] <= c.max[1] && v[2] >= c.min[2] && v[2] <= c.max[2])) continue;
      if (Number.isFinite(c.breakY)) {
        if (across(poly, 0, 1, 0, c.breakY, depth, (h, s) => emit(s > 0 && c.piece >= 0 ? c.piece : STATIC_PIECE, h))) return;
        if (centroid(poly)[1] < c.breakY || c.piece < 0) { emit(STATIC_PIECE, poly); return; }
      }
      emit(c.piece >= 0 ? c.piece : STATIC_PIECE, poly);
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
      if (st.floorPiece >= 0 && c[1] >= st.floorY0 && c[1] < st.floorY1) { emit(st.floorPiece, poly); return; }
      if (c[1] < st.floorY1 || st === plan.storeys[plan.storeys.length - 1]) { storey = st; break; }
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
    emit(piece >= 0 ? piece : STATIC_PIECE, poly);
  };

  // over the stub: an end panel's corner pier stays to its top
  const pierAssign = (poly: Poly, depth: number, fp: FacePlan, k: number, piece: number): void => {
    const f = fp.face;
    const last = k === fp.splits.length;
    if (fp.pierW > 0 && (k === 0 || last)) {
      const uOff = f.u[0] * f.origin[0] + f.u[1] * f.origin[1] + f.u[2] * f.origin[2];
      for (const end of [0, 1] as const) {
        if ((end === 0 && k !== 0) || (end === 1 && !last)) continue;
        const edge = end === 0 ? -f.width / 2 + fp.pierW : f.width / 2 - fp.pierW;
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
    emit(piece >= 0 ? piece : STATIC_PIECE, poly);
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
      if (below || !plan.roof.length) { emit(g.piece, poly); return; }
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
    emit(piece >= 0 ? piece : STATIC_PIECE, poly);
  };

  for (let t = 0; t < triangles; t++) {
    const poly: Poly = [];
    for (let k = 0; k < 3; k++) {
      const v = new Float64Array(PIECE_VERTEX_STRIDE);
      const o = (t * 3 + k) * PIECE_VERTEX_STRIDE;
      for (let j = 0; j < PIECE_VERTEX_STRIDE; j++) v[j] = vertices[o + j];
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
}

/**
 * The faces a piece needs beyond the building's own skin: a wall panel's back (its inner face, its openings left open)
 * and its four broken edges in its core; a floor's six faces (its boards, its ceiling, its edges); a roof part's
 * underside and edges; a gable's back; a chimney's broken top and foot. Body frame.
 */
export function capPiece(plan: CollapsePlan, piece: CollapsePiece): CapQuad[] {
  const caps: CapQuad[] = [];
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, n: Vec3, slot: FractureSlot, shade: number) => {
    caps.push({ corners: [a, b, c, d], n, slot, shade });
  };
  const boxCaps = (skip: (axis: number, sign: number) => boolean, slotFor: (axis: number, sign: number) => FractureSlot,
    shadeFor: (axis: number, sign: number) => number) => {
    const [qx, qy, qz, qw] = piece.rotation;
    const rot = (x: number, y: number, z: number): Vec3 => {
      const cx = qy * z - qz * y + qw * x, cy = qz * x - qx * z + qw * y, cz = qx * y - qy * x + qw * z;
      return [x + 2 * (qy * cz - qz * cy), y + 2 * (qz * cx - qx * cz), z + 2 * (qx * cy - qy * cx)];
    };
    for (const box of piece.boxes) {
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
        quad(c[0], c[1], c[2], c[3], n, slotFor(axis, sign), shadeFor(axis, sign));
      }
    }
  };
  switch (piece.kind) {
    case 'wall':
    case 'gable':
      // the face's own skin is the building's (+z); its back (−z) and its four edges are the caps
      boxCaps((axis, sign) => axis === 2 && sign > 0, (axis, sign) => (axis === 2 && sign < 0 ? piece.back : piece.core),
        (axis, sign) => (axis === 2 && sign < 0 ? 0.92 : 0.82));
      break;
    case 'floor':
      boxCaps(() => false, (axis, sign) => (axis === 1 && sign < 0 ? piece.back : piece.core), (axis) => (axis === 1 ? 0.95 : 0.8));
      break;
    case 'roof':
      // the covering on top is the building's; its underside and edges
      boxCaps((axis, sign) => axis === 1 && sign > 0, () => piece.core, (axis, sign) => (axis === 1 && sign < 0 ? 0.85 : 0.75));
      break;
    case 'chimney':
      // a stack's sides are the building's; its broken top and foot
      boxCaps((axis) => axis !== 1, () => piece.core, () => 0.78);
      break;
  }
  void plan;
  return caps;
}
