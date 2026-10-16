// src/world/landmarks/damage.ts — the set pieces' damage kit (props lane A, E12, 2026-10-14; WORKLIST E12, the landmark
// set-piece fracture path; docs/DESTRUCTION.md §16).
//
// Before this a set piece found no kit of its own (destructionKit.ts structureDamageKitChain): its map's regional kit or
// the default read it as a house of walls, so a statue's figure, a gate's merlons, a windmill's sails or a mast's lattice
// were walls that spalled and opened round holes, and nothing ever came off. This kit is registered under every set-piece
// kind and wraps the reading the piece had before (the body: the regional kit's, else the default's, of its parts less
// its named pieces), adding what the builder named (landmarks/pieces.ts):
//   - a piece that comes off (a figure, a merlon, a sail, a stele's top, a cab's roof) goes at its stage: the stage hides
//     its own spans (DamageHide.piece) and lays its own triangles where it comes to rest — over about its foot, off its
//     seat or down where it stood, away from the piece's middle, seated on the ground the composer sampled round it,
//     beyond the plinth or the wall it stood on — with a few chips of it thrown;
//   - a tank ruptures at its stage: the shell torn open on the side the blow came from (a cut and the torn petals round
//     it), its dark inside, and what it held spilled on the ground under it (water, fuel's burn, grain's heap);
//   - an open frame (a guyed mast, a fire lookout, a headframe, a troposcatter's frame, a conveyor's trestles) is no wall:
//     no spalls and no round holes, only its named members coming off;
//   - a light set piece's collapse (sim/structureDamage.ts: under 200 m³ a set piece falls) lays every piece where it
//     rests, and an open frame that toppled (the shaft topple's line, structureStages structureTopple) lies along it,
//     bent at its hinge as the mask laid it down.
// Stateless: a piece's resting pose comes from its own seed (damageSeed(anatomy, piece)), so the stage that lays it and a
// collapse that lays it again agree; strikes between stages take nothing off (a late joiner's settled stages lay the same).
// A set piece with no named piece and no frame describes nothing here: its reading is the one it had.
import type { BufferGeometry } from 'three';
import {
  damageRng, damageSeed, registerStructureDamageKit, structureDamageKitChain,
  type BreachSpec, type DamageHide, type DamageStageResult, type DamageWriters, type StructureCut, type StructureDamageAnatomy,
  type StructureDamageKit, type StructureDescribeInput,
} from '../destructionKit.ts';
import { DEFAULT_STRUCTURE_DAMAGE_KIT, describeDefault } from '../destructionDefaultKit.ts';
import { LANDMARK_KINDS } from './plan.ts';
import { isLandmarkParts, landmarkPiecesOf, pieceGroundAt, type LandmarkPiece } from './pieces.ts';

/** The set pieces that are open frames (members, not walls). */
export const LATTICE_LANDMARKS: ReadonlySet<string> = new Set(['guyedMast', 'fireLookout', 'headframe', 'troposcatter', 'conveyor']);
/** The shaft topple's hinge and lie (fx/structureStages TOPPLE_HINGE_M, fx/structureMask TOPPLE_LIE): the lying frame
 *  matches where the mask laid the standing one down. */
const TOPPLE_HINGE_M = 1.5;
const TOPPLE_LIE = 1.5;
/** Triangles of a piece the kit keeps to lay again (a larger piece is left standing). */
const PIECE_TRI_CAP = 4000;
/** A fallen piece's bed in the ground (m). */
const EMBED_M = 0.03;

/** One bucket's triangles of a piece, in the set piece's frame (positions, normals, uvs, colours or white). */
interface PieceRun { bucket: string; pos: Float32Array; nrm: Float32Array; uv: Float32Array; col: Float32Array | null }
interface KeptPiece extends LandmarkPiece { index: number; runs: PieceRun[] }
interface LandmarkPlan {
  kind: 'landmark-pieces';
  /** The reading the set piece had (its regional kit's or the default's), and that kit's id. */
  body: StructureDamageAnatomy;
  lattice: boolean;
  pieces: KeptPiece[];
}

export function landmarkPlanOf(anatomy: StructureDamageAnatomy): LandmarkPlan | null {
  const plan = (anatomy.kitPlan as { landmark?: LandmarkPlan } | undefined)?.landmark;
  return plan?.kind === 'landmark-pieces' ? plan : null;
}

function keepRuns(input: StructureDescribeInput, name: string): PieceRun[] {
  const runs: PieceRun[] = [];
  for (const [bucket, list] of Object.entries(input.parts)) {
    for (const g of list as readonly BufferGeometry[]) {
      if (g.userData.damagePiece !== name) continue;
      const source = g.index ? g.toNonIndexed() : g;
      const P = source.getAttribute('position'), N = source.getAttribute('normal'), U = source.getAttribute('uv'), C = source.getAttribute('color');
      if (!P || !N) continue;
      runs.push({
        bucket, pos: Float32Array.from(P.array as ArrayLike<number>), nrm: Float32Array.from(N.array as ArrayLike<number>),
        uv: U ? Float32Array.from(U.array as ArrayLike<number>) : new Float32Array((P.count) * 2),
        col: C ? Float32Array.from(C.array as ArrayLike<number>) : null,
      });
      if (source !== g) source.dispose();
    }
  }
  return runs;
}

/** The body's reading: the parts without the named pieces, through the map's regional kit, else the default. */
function describeBody(input: StructureDescribeInput): StructureDamageAnatomy {
  const parts: Record<string, BufferGeometry[]> = {};
  for (const [bucket, list] of Object.entries(input.parts)) parts[bucket] = (list as readonly BufferGeometry[]).filter((g) => !g.userData.damagePiece);
  const bodyInput: StructureDescribeInput = { ...input, parts };
  for (const kit of structureDamageKitChain('', input.style)) {
    if (kit === DEFAULT_STRUCTURE_DAMAGE_KIT || !kit.describe) continue;
    try {
      const anatomy = kit.describe(bodyInput);
      if (anatomy) return anatomy;
    } catch {
      // a kit that cannot read it leaves it to the default
    }
  }
  return describeDefault(bodyInput);
}

function describeLandmark(input: StructureDescribeInput): StructureDamageAnatomy | null {
  // (a regional kit's own building that shares a set piece's name — a church, a granary — is no set piece)
  if (!isLandmarkParts(input.parts)) return null;
  const named = landmarkPiecesOf(input.parts) ?? [];
  const lattice = LATTICE_LANDMARKS.has(input.builder);
  if (!named.length && !lattice) return null;
  const body = describeBody(input);
  const pieces: KeptPiece[] = [];
  named.forEach((p, index) => { if (p.triangles <= PIECE_TRI_CAP) pieces.push({ ...p, index, runs: keepRuns(input, p.name) }); });
  const plan: LandmarkPlan = { kind: 'landmark-pieces', body, lattice, pieces };
  const bodyShaft = (body.kitPlan as { damage?: { shaft?: unknown } } | undefined)?.damage?.shaft;
  // a light frame goes over whole when it falls (the shaft topple); a body read as a shaft keeps its own topple
  const shaft = lattice && input.massClass !== 'landmark' ? { lattice: true } : bodyShaft;
  return { ...body, kit: input.builder, kitPlan: { landmark: plan, ...(shaft ? { damage: { shaft } } : {}) } };
}

// ---------------------------------------------------------------------------------------------------------- the body

type Member = 'damaged' | 'breach' | 'collapse' | 'sectionDown' | 'storeyDown';
function bodyKit(plan: LandmarkPlan, member: Member): StructureDamageKit {
  if (plan.body.kit === 'default') return DEFAULT_STRUCTURE_DAMAGE_KIT;
  const kit = structureDamageKitChain(plan.body.kit, null).find((k) => k.id === plan.body.kit);
  return kit && kit[member] ? kit : DEFAULT_STRUCTURE_DAMAGE_KIT;
}
function merge(into: DamageStageResult, from: DamageStageResult | null | undefined): void {
  if (!from) return;
  for (const cut of from.cuts ?? []) into.cuts.push(cut);
  for (const hide of from.hides ?? []) into.hides.push(hide);
}

// ---------------------------------------------------------------------------------------------------------- the falls

/** A rigid pose: world = R (p - pivot) + pivot + t (R row-major). */
interface Pose { r: number[]; px: number; py: number; pz: number; tx: number; ty: number; tz: number }
function rotation(ax: number, ay: number, az: number, angle: number): number[] {
  const l = Math.hypot(ax, ay, az) || 1, x = ax / l, y = ay / l, z = az / l, c = Math.cos(angle), s = Math.sin(angle), k = 1 - c;
  return [c + x * x * k, x * y * k - z * s, x * z * k + y * s, y * x * k + z * s, c + y * y * k, y * z * k - x * s, z * x * k - y * s, z * y * k + x * s, c + z * z * k];
}
function multiply(a: number[], b: number[]): number[] {
  const o: number[] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o.push(a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]);
  return o;
}
const apply = (r: number[], x: number, y: number, z: number, out: number[]): void => {
  out[0] = r[0] * x + r[1] * y + r[2] * z; out[1] = r[3] * x + r[4] * y + r[5] * z; out[2] = r[6] * x + r[7] * y + r[8] * z;
};
const _q = [0, 0, 0];

/** The body's half extent along a level direction (its plan's box). */
function reachAlong(a: StructureDamageAnatomy, dx: number, dz: number): number {
  return Math.abs(dx) * a.w / 2 + Math.abs(dz) * a.d / 2;
}

/** Where a piece comes to rest (its own seed): the pose before its seat on the ground. */
function restPose(a: StructureDamageAnatomy, plan: LandmarkPlan, p: KeptPiece): Pose {
  const rng = damageRng(damageSeed(a.seed, 0x51ece, p.index));
  const cx = (p.min[0] + p.max[0]) / 2, cz = (p.min[2] + p.max[2]) / 2;
  // away from the set piece's middle (a merlon off the wall head, a figure off its plinth), jittered; or any way
  let ang = rng() * Math.PI * 2;
  if (p.toward) ang = Math.atan2(p.toward[1], p.toward[0]) + (rng() - 0.5) * 0.7;
  else if (p.outward !== false && Math.hypot(cx, cz) > 0.15) ang = Math.atan2(cz, cx) + (rng() - 0.5) * 0.9;
  const dx = Math.cos(ang), dz = Math.sin(ang);
  const fall = p.fall ?? 'topple';
  const hx = (p.max[0] - p.min[0]) / 2, hz = (p.max[2] - p.min[2]) / 2;
  const high = p.min[1] > 0.3;
  let pose: Pose;
  if (fall === 'topple') {
    // over about its foot's edge on the fall side, top toward the fall
    const edge = Math.abs(dx) * hx + Math.abs(dz) * hz;
    pose = { r: rotation(dz, 0, -dx, 1.36 + rng() * 0.3), px: cx + dx * edge, py: p.min[1], pz: cz + dz * edge, tx: 0, ty: 0, tz: 0 };
  } else if (fall === 'flat') {
    // laid on its thinnest side (a sail, a dish, a panel), turned a little, out from where it hung
    const ex = p.max[0] - p.min[0], ey = p.max[1] - p.min[1], ez = p.max[2] - p.min[2];
    const sign = rng() < 0.5 ? -1 : 1;
    const flat = ey <= ex && ey <= ez ? rotation(0, 1, 0, 0) : ez <= ex ? rotation(1, 0, 0, sign * Math.PI / 2) : rotation(0, 0, 1, sign * Math.PI / 2);
    const r = multiply(rotation(0, 1, 0, (rng() - 0.5) * 1.2), flat);
    const out = 0.2 + rng() * 0.8;
    pose = { r, px: cx, py: (p.min[1] + p.max[1]) / 2, pz: cz, tx: dx * out, ty: 0, tz: dz * out };
  } else {
    // tumbled off its seat (a drop) or tipped where it stood (a slump)
    // (the E12 film: a lookout's roof dropped on its edge, five metres up) a dropped piece wider than it is tall lands near
    // flat; a tall one goes down on its side
    const tallish = p.max[1] - p.min[1] > Math.max(p.max[0] - p.min[0], p.max[2] - p.min[2]);
    const tilt = fall === 'drop' ? (tallish ? 0.9 + rng() * 0.6 : 0.12 + rng() * 0.3) : 0.14 + rng() * 0.3, ta = rng() * Math.PI * 2;
    pose = { r: rotation(Math.cos(ta), 0, Math.sin(ta), tilt), px: cx, py: (p.min[1] + p.max[1]) / 2, pz: cz, tx: 0, ty: 0, tz: 0 };
    if (fall === 'drop') { const out = 0.3 + rng() * 1.2; pose.tx = dx * out; pose.tz = dz * out; }
  }
  // clear of what it stood on: a piece that stood above the ground lands beyond the body's plan along its fall (a piece
  // laid flat comes down under where it hung — a banner under its arch — unless its spec names a clearance)
  if (high && fall !== 'slump' && (fall !== 'flat' || p.clear !== undefined)) {
    let near = Infinity;
    forEachVertex(p, pose, (x, _y, z) => { near = Math.min(near, x * dx + z * dz); });
    const edge = p.clear !== undefined ? cx * dx + cz * dz + p.clear : reachAlong(plan.body, dx, dz) + 0.15;
    if (near < edge) { pose.tx += dx * (edge - near); pose.tz += dz * (edge - near); }
  }
  return pose;
}

function forEachVertex(p: KeptPiece, pose: Pose, visit: (x: number, y: number, z: number) => void): void {
  for (const run of p.runs) for (let i = 0; i < run.pos.length; i += 3) {
    apply(pose.r, run.pos[i] - pose.px, run.pos[i + 1] - pose.py, run.pos[i + 2] - pose.pz, _q);
    visit(_q[0] + pose.px + pose.tx, _q[1] + pose.py + pose.ty, _q[2] + pose.pz + pose.tz);
  }
}

/** Seat a pose on the piece's ground: its lowest point there, bedded a little. */
function seat(p: KeptPiece, pose: Pose): void {
  let low = Infinity;
  forEachVertex(p, pose, (x, y, z) => { low = Math.min(low, y - pieceGroundAt(p.ground, x, z)); });
  if (Number.isFinite(low)) pose.ty -= low + EMBED_M;
}

/**
 * A run's triangles cut at the level `h`, every attribute carried to the cut: a member that crosses a lattice's hinge
 * breaks there, its foot left standing with what rests on it (a stair's lowest treads on their stringers) and its upper
 * part gone over with the frame (2026-10-14, the coordinator's E12 review: treads the stump kept floated off stringers
 * whose upper ends had gone over whole).
 */
function splitRunAt(run: PieceRun, h: number): PieceRun {
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], col: number[] = [];
  // (a cut vertex sits a fifth of a millimetre to its triangle's side: the bend turns an upper triangle whole, its foot
  // at the cut with it, and leaves a lower one whole)
  let side = 0;
  const emit = (a: number, b: number, t: number) => {
    let nl = 0;
    const nn = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      pos.push(run.pos[a * 3 + k] + (run.pos[b * 3 + k] - run.pos[a * 3 + k]) * t + (k === 1 && t > 0 && t < 1 ? side * 2e-4 : 0));
      nn[k] = run.nrm[a * 3 + k] + (run.nrm[b * 3 + k] - run.nrm[a * 3 + k]) * t; nl += nn[k] * nn[k];
      if (run.col) col.push(run.col[a * 3 + k] + (run.col[b * 3 + k] - run.col[a * 3 + k]) * t);
    }
    nl = Math.sqrt(nl) || 1;
    nrm.push(nn[0] / nl, nn[1] / nl, nn[2] / nl);
    for (let k = 0; k < 2; k++) uv.push(run.uv[a * 2 + k] + (run.uv[b * 2 + k] - run.uv[a * 2 + k]) * t);
  };
  for (let tri = 0; tri * 9 < run.pos.length; tri++) {
    const ids = [tri * 3, tri * 3 + 1, tri * 3 + 2];
    const up = ids.map((i) => run.pos[i * 3 + 1] > h);
    const n = up.filter(Boolean).length;
    if (n === 0 || n === 3) { for (const i of ids) emit(i, i, 0); continue; }
    // the vertex alone on its side of the cut, then the other two in the triangle's own order
    const lone = n === 1 ? up.indexOf(true) : up.indexOf(false);
    const a = ids[lone], b = ids[(lone + 1) % 3], c = ids[(lone + 2) % 3];
    const ya = run.pos[a * 3 + 1], tb = (h - ya) / (run.pos[b * 3 + 1] - ya), tc = (h - ya) / (run.pos[c * 3 + 1] - ya);
    side = up[lone] ? 1 : -1;
    emit(a, a, 0); emit(a, b, tb); emit(a, c, tc);
    side = -side;
    emit(a, b, tb); emit(b, b, 0); emit(c, c, 0);
    emit(a, b, tb); emit(c, c, 0); emit(a, c, tc);
  }
  return { bucket: run.bucket, pos: new Float32Array(pos), nrm: new Float32Array(nrm), uv: new Float32Array(uv), col: run.col ? new Float32Array(col) : null };
}

/**
 * Per vertex of a piece's runs, how far its member (its welded island, positions to a millimetre) sinks when the frame
 * goes over: a member on the ground under it, and a member resting on a standing one (its box within a few centimetres
 * of that one's, its foot above that one's: a stair's lowest treads on their stringers), stay at the hinge (0); a member
 * that stood on what the fall takes away (a guy's lower length on its anchor, a stair's foot on its concrete) comes down
 * where it stood, its lowest point to the ground (the coordinator's E12 review: nothing left in the air).
 */
function standingVertices(runs: readonly PieceRun[], ground: (x: number, z: number) => number, hinge: number): Float32Array[] {
  interface Island { lo: number; box: number[]; stands: boolean }
  const islands: Island[] = [];
  const perRun = runs.map((run) => {
    const n = run.pos.length / 3, parent = new Int32Array(n), seen = new Map<string, number>();
    for (let i = 0; i < n; i++) parent[i] = i;
    const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const join = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
    for (let i = 0; i < n; i++) {
      const key = `${Math.round(run.pos[i * 3] * 1000)},${Math.round(run.pos[i * 3 + 1] * 1000)},${Math.round(run.pos[i * 3 + 2] * 1000)}`;
      const at = seen.get(key);
      if (at === undefined) seen.set(key, i); else join(at, i);
      if (i % 3) join(i - (i % 3), i);
    }
    const index = new Map<number, number>(), of = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const r = find(i);
      let k = index.get(r);
      if (k === undefined) { k = islands.length; index.set(r, k); islands.push({ lo: Infinity, box: [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], stands: false }); }
      of[i] = k;
      const x = run.pos[i * 3], y = run.pos[i * 3 + 1], z = run.pos[i * 3 + 2], b = islands[k].box;
      islands[k].lo = Math.min(islands[k].lo, y - ground(x, z));
      b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.min(b[2], z); b[3] = Math.max(b[3], x); b[4] = Math.max(b[4], y); b[5] = Math.max(b[5], z);
    }
    return of;
  });
  for (const isl of islands) isl.stands = isl.lo <= STANDING_M;
  const near = (a: number[], b: number[]) => a[0] <= b[3] + 0.03 && b[0] <= a[3] + 0.03 && a[1] <= b[4] + 0.03 && b[1] <= a[4] + 0.03 && a[2] <= b[5] + 0.03 && b[2] <= a[5] + 0.03;
  for (let changed = true, pass = 0; changed && pass < 8; pass++) {
    changed = false;
    for (const isl of islands) {
      if (isl.stands || isl.box[1] > hinge) continue;
      // (resting on it: its foot within the standing member's height, not hung below it)
      if (islands.some((o) => o.stands && o !== isl && near(isl.box, o.box) && isl.box[1] >= o.box[1] + 0.02)) { isl.stands = true; changed = true; }
    }
  }
  return perRun.map((of) => Float32Array.from(of, (k) => (islands[k].stands ? 0 : Math.max(0, islands[k].lo - EMBED_M))));
}
/** How near the ground a member's foot must be to stand when its frame goes over. */
const STANDING_M = 0.12;

/** Lay a piece's own triangles at a pose (role rubble); false when the stage's writer has no room for it. */
function layPiece(p: KeptPiece, pose: Pose, out: DamageWriters,
  bend?: (x: number, y: number, z: number, o: number[], run: number, vertex: number) => boolean): boolean {
  let need = 0;
  for (const run of p.runs) need += run.pos.length / 3;
  if (out.mesh.capacity - out.mesh.vertices < need) return false;
  const n = [0, 0, 0], q = [0, 0, 0];
  for (const [ri, run] of p.runs.entries()) {
    if (!out.mesh.begin(run.bucket, 'rubble')) return false;
    for (let i = 0, v = 0; i < run.pos.length; i += 9) {
      const ids = [0, 0, 0];
      for (let k = 0; k < 3; k++, v++) {
        const j = i + k * 3;
        let turned = true;
        if (bend) turned = bend(run.pos[j], run.pos[j + 1], run.pos[j + 2], q, ri, v);
        else {
          apply(pose.r, run.pos[j] - pose.px, run.pos[j + 1] - pose.py, run.pos[j + 2] - pose.pz, q);
          q[0] += pose.px + pose.tx; q[1] += pose.py + pose.ty; q[2] += pose.pz + pose.tz;
        }
        if (turned) apply(pose.r, run.nrm[j], run.nrm[j + 1], run.nrm[j + 2], n);
        else { n[0] = run.nrm[j]; n[1] = run.nrm[j + 1]; n[2] = run.nrm[j + 2]; }
        const c = run.col;
        ids[k] = out.mesh.vertex(q[0], q[1], q[2], n[0], n[1], n[2], run.uv[v * 2], run.uv[v * 2 + 1],
          c ? c[j] : 1, c ? c[j + 1] : 1, c ? c[j + 2] : 1);
      }
      out.mesh.triangle(ids[0], ids[1], ids[2]);
    }
    out.mesh.end();
  }
  return true;
}

/** A few chips of the piece where it broke off (its main bucket), thrown a little along its fall. */
function chips(p: KeptPiece, a: StructureDamageAnatomy, out: DamageWriters, count: number): void {
  const run = p.runs.reduce<PieceRun | null>((best, r) => (!best || r.pos.length > best.pos.length ? r : best), null);
  if (!run) return;
  const rng = damageRng(damageSeed(a.seed, 0xc41b5, p.index));
  const cx = (p.min[0] + p.max[0]) / 2, cz = (p.min[2] + p.max[2]) / 2, y = p.min[1] + 0.1;
  const c = run.col;
  for (let i = 0; i < count; i++) {
    const s = 0.05 + rng() * 0.12, spin = rng() * Math.PI * 2;
    if (!out.pieces.push(run.bucket, rng() < 0.5 ? 'chunk' : 'splinter', Math.floor(rng() * 4), cx + (rng() - 0.5) * 0.6, y + rng() * 0.4, cz + (rng() - 0.5) * 0.6,
      0, Math.sin(spin / 2), 0, Math.cos(spin / 2), s, s * 0.6, s * 0.8, c ? c[0] : 0.7, c ? c[1] : 0.7, c ? c[2] : 0.7,
      (rng() - 0.5) * 2, 0.5 + rng() * 1.5, (rng() - 0.5) * 2)) break;
  }
}

/** A piece comes off: its spans hidden, its triangles laid where it rests, chips thrown. */
function detach(a: StructureDamageAnatomy, plan: LandmarkPlan, p: KeptPiece, out: DamageWriters, res: DamageStageResult): void {
  const pose = restPose(a, plan, p);
  seat(p, pose);
  if (!layPiece(p, pose, out)) return;
  res.hides.push({ section: null, partClass: null, piece: p.name } satisfies DamageHide);
  chips(p, a, out, 6);
}

/** A tank ruptures on the side the blow came from (body frame `dirX`, `dirZ`): the cut, the torn petals, its dark inside
 *  and what it held spilled under it. */
function rupture(a: StructureDamageAnatomy, p: KeptPiece, dirX: number, dirZ: number, out: DamageWriters, res: DamageStageResult): void {
  const v = p.vessel;
  if (!v) return;
  const rng = damageRng(damageSeed(a.seed, 0x7a4c, p.index));
  let nx = -dirX, nz = -dirZ;
  const l = Math.hypot(nx, nz);
  if (l < 1e-3) { const ang = rng() * Math.PI * 2; nx = Math.cos(ang); nz = Math.sin(ang); } else { nx /= l; nz /= l; }
  const H = v.y1 - v.y0, radius = Math.min(1.4, 0.3 * H, 0.6 * v.r) * (0.8 + rng() * 0.3);
  const cy = v.y0 + Math.min(H - radius - 0.1, Math.max(radius + 0.1, H * (0.25 + rng() * 0.3)));
  const sx = v.x + nx * v.r, sz = v.z + nz * v.r;
  res.cuts.push({ x: sx, y: cy, z: sz, nx, nz, radiusM: radius, depthM: 0.35, outsideM: 0.15 } satisfies StructureCut);
  const run = p.runs.reduce<PieceRun | null>((best, r) => (!best || r.pos.length > best.pos.length ? r : best), null);
  const bucket = run?.bucket ?? 'structureMetal';
  const tint: [number, number, number] = run?.col ? [run.col[0], run.col[1], run.col[2]] : [0.6, 0.6, 0.6];
  // the petals: the shell's sheet torn outward round the hole, curled
  const ux = -nz, uz = nx;
  if (out.mesh.begin(bucket, 'rim')) {
    const petals = 7;
    for (let k = 0; k < petals; k++) {
      const a0 = (k / petals) * Math.PI * 2, a1 = ((k + 1) / petals) * Math.PI * 2, am = (a0 + a1) / 2;
      const r0 = radius * (0.9 + rng() * 0.15), len = radius * (0.35 + rng() * 0.4), curl = 0.3 + rng() * 0.5;
      const at = (ang: number, r: number, outM: number): [number, number, number] =>
        [sx + ux * Math.cos(ang) * r + nx * outM, cy + Math.sin(ang) * r, sz + uz * Math.cos(ang) * r + nz * outM];
      const b0 = at(a0, r0, 0), b1 = at(a1, r0, 0), tip = at(am, r0 + len * Math.cos(curl), len * Math.sin(curl));
      const e1 = [b1[0] - b0[0], b1[1] - b0[1], b1[2] - b0[2]], e2 = [tip[0] - b0[0], tip[1] - b0[1], tip[2] - b0[2]];
      let fx = e1[1] * e2[2] - e1[2] * e2[1], fy = e1[2] * e2[0] - e1[0] * e2[2], fz = e1[0] * e2[1] - e1[1] * e2[0];
      const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
      if (fx * nx + fz * nz < 0) { fx = -fx; fy = -fy; fz = -fz; }
      const ids = [b0, b1, tip].map((q, i) => out.mesh.vertex(q[0], q[1], q[2], fx, fy, fz, i * 0.5, i === 2 ? 1 : 0, tint[0], tint[1], tint[2]));
      out.mesh.triangle(ids[0], ids[1], ids[2]);
      const back = [b1, b0, tip].map((q, i) => out.mesh.vertex(q[0], q[1], q[2], -fx, -fy, -fz, i * 0.5, i === 2 ? 1 : 0, tint[0] * 0.6, tint[1] * 0.6, tint[2] * 0.6));
      out.mesh.triangle(back[0], back[1], back[2]);
    }
    out.mesh.end();
  }
  // its dark inside: a disc across the vessel behind the hole
  if (out.mesh.begin('dark', 'rim')) {
    const back = 0.6 * v.r, n = 10, ids: number[] = [];
    const centre = out.mesh.vertex(sx - nx * back, cy, sz - nz * back, nx, 0, nz, 0.5, 0.5, 1, 1, 1);
    for (let k = 0; k <= n; k++) {
      const ang = (k / n) * Math.PI * 2;
      ids.push(out.mesh.vertex(sx - nx * back + ux * Math.cos(ang) * radius * 0.95, cy + Math.sin(ang) * radius * 0.95, sz - nz * back + uz * Math.cos(ang) * radius * 0.95,
        nx, 0, nz, 0.5, 0.5, 1, 1, 1));
    }
    for (let k = 0; k < n; k++) out.mesh.triangle(centre, ids[k + 1], ids[k]);
    out.mesh.end();
  }
  // what it held, on the ground under the hole: a wet stain (water), a burn (fuel), a heap (grain); a radome held air
  if (v.contents === 'none') return;
  const spillBucket = v.contents === 'grain' ? 'straw' : 'dark';
  if (out.mesh.begin(spillBucket, 'rubble')) {
    const reach = v.contents === 'grain' ? 1.2 + rng() * 0.8 : 1.8 + rng() * 1.6;
    const mx = sx + nx * reach * 0.6, mz = sz + nz * reach * 0.6, n = 12;
    const heap = v.contents === 'grain' ? 0.35 + rng() * 0.3 : 0.015;
    const k = v.contents === 'fuel' ? 0.35 : v.contents === 'water' ? 0.55 : 1;
    const g0 = pieceGroundAt(p.ground, mx, mz);
    const centre = out.mesh.vertex(mx, g0 + heap, mz, 0, 1, 0, 0.5, 0.5, k, k, k);
    const ring: number[] = [];
    for (let i = 0; i <= n; i++) {
      const ang = (i / n) * Math.PI * 2, r = reach * (0.75 + 0.25 * Math.sin(3 * ang + rng()));
      const x = mx + Math.cos(ang) * r, z = mz + Math.sin(ang) * r;
      ring.push(out.mesh.vertex(x, pieceGroundAt(p.ground, x, z) + 0.02, z, 0, 1, 0, 0.5 + Math.cos(ang) * 0.5, 0.5 + Math.sin(ang) * 0.5, k, k, k));
    }
    for (let i = 0; i < n; i++) out.mesh.triangle(centre, ring[i + 1], ring[i]);
    out.mesh.end();
  }
}

/** Every piece of `stage` comes off (a tank ruptures, toward the blow when there is one). */
function takeStage(a: StructureDamageAnatomy, plan: LandmarkPlan, stage: 'damaged' | 'breached', dirX: number, dirZ: number,
  out: DamageWriters, res: DamageStageResult): void {
  for (const p of plan.pieces) {
    if (p.at !== stage) continue;
    if (p.kind === 'tank') rupture(a, p, dirX, dirZ, out, res);
    else detach(a, plan, p, out, res);
  }
}

// ---------------------------------------------------------------------------------------------------------- the kit

function damagedLandmark(a: StructureDamageAnatomy, seed: number, out: DamageWriters): DamageStageResult {
  const plan = landmarkPlanOf(a);
  const res: DamageStageResult = { cuts: [], hides: [] };
  if (!plan) return res;
  // an open frame has no wall to spall
  if (!plan.lattice) merge(res, bodyKit(plan, 'damaged').damaged!.call(bodyKit(plan, 'damaged'), plan.body, seed, out));
  takeStage(a, plan, 'damaged', 0, 0, out, res);
  return res;
}

function breachLandmark(a: StructureDamageAnatomy, hole: BreachSpec, out: DamageWriters): DamageStageResult {
  const plan = landmarkPlanOf(a);
  const res: DamageStageResult = { cuts: [], hides: [] };
  if (!plan) return res;
  // an open frame takes no round hole (a round passes its members)
  if (!plan.lattice) merge(res, bodyKit(plan, 'breach').breach!.call(bodyKit(plan, 'breach'), plan.body, hole, out));
  // the breach stage's own hole (slot 0) is the stage: its pieces come off; a strike's (slot 1 on) takes nothing off
  if (hole.hole === 0) takeStage(a, plan, 'breached', hole.dirX, hole.dirZ, out, res);
  return res;
}

/** How high a fallen frame may lie over its ground: one that would stand higher is crushed down to it, all alike. */
const LIE_TOP_M = 3;
/**
 * The way a lattice frame goes over: along the blow (dx, dz), unless the frame's plan above its hinge is a long, thin
 * wall (its long axis over 2.5 times its short one: a billboard's face, a gantry) — then across it, on the side the blow
 * came from.
 */
function frameFallAxis(plan: LandmarkPlan, hinge: number, dx: number, dz: number): [number, number] {
  let n = 0, mx = 0, mz = 0, sxx = 0, szz = 0, sxz = 0;
  for (const p of plan.pieces) {
    if (p.at !== 'collapse' || p.kind !== 'lattice') continue;
    for (const run of p.runs) for (let i = 0; i < run.pos.length; i += 3) {
      if (run.pos[i + 1] <= hinge) continue;
      const x = run.pos[i], z = run.pos[i + 2];
      n++; mx += x; mz += z; sxx += x * x; szz += z * z; sxz += x * z;
    }
  }
  if (n < 3) return [dx, dz];
  mx /= n; mz /= n;
  const cxx = sxx / n - mx * mx, czz = szz / n - mz * mz, cxz = sxz / n - mx * mz;
  const tr = cxx + czz, det = cxx * czz - cxz * cxz, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const big = tr / 2 + disc, small = Math.max(1e-6, tr / 2 - disc);
  if (big / small < 2.5 * 2.5) return [dx, dz];
  // the short axis (the eigenvector of the smaller eigenvalue), turned to the blow's side
  let ax = cxz, az = small - cxx;
  if (Math.hypot(ax, az) < 1e-9) { ax = small - czz; az = cxz; }
  if (Math.hypot(ax, az) < 1e-9) return [dx, dz];
  const l = Math.hypot(ax, az), sign = ax * dx + az * dz < 0 ? -1 : 1;
  return [sign * ax / l, sign * az / l];
}
/** A slack guy's height over the ground it lies on (its wire's own girth). */
const SLACK_M = 0.03;
/** The frame's turn as it goes over along (dx, dz): the normals of what it laid down. */
function pose0(dx: number, dz: number): Pose {
  return { r: rotation(dz, 0, -dx, TOPPLE_LIE), px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0 };
}

function collapseLandmark(a: StructureDamageAnatomy, seed: number, out: DamageWriters): DamageStageResult {
  const plan = landmarkPlanOf(a);
  const res: DamageStageResult = { cuts: [], hides: [] };
  if (!plan) return res;
  plan.body.mound = a.mound;
  const kit = bodyKit(plan, 'collapse');
  merge(res, kit.collapse!.call(kit, plan.body, seed, out));
  const given = (out as DamageWriters & { fallAxis?: [number, number] }).fallAxis;
  const gl = given ? Math.hypot(given[0], given[1]) : 0;
  // a frame that toppled lies along its line, bent at its hinge as the mask laid it down; every other piece where it rests
  const H = Math.max(1, a.h), hinge = Math.min(TOPPLE_HINGE_M, H * 0.2);
  // (the E12 film: the troposcatter's face, toppled along its own plane, stood on its edge fifteen metres high) a frame
  // whose plan is a long, thin wall (a billboard's face) goes over across it, toward the side the blow pushed it
  const [fdx, fdz] = gl > 1e-3 ? frameFallAxis(plan, hinge, given![0] / gl, given![1] / gl) : [0, 0];
  const dx = fdx, dz = fdz, e = Math.max(a.w, a.d) / 2;
  const c = Math.cos(TOPPLE_LIE), s = Math.sin(TOPPLE_LIE);
  const far = 1.25 * Math.max(a.w, a.d) / 2 + 0.5;
  // the frame's pieces that go over, each cut at the hinge (a piece anchored out past the frame's plan — a mast's guys —
  // whole), laid in a second pass: the frame buckles as one
  const frames: Array<{ p: KeptPiece; cut: KeptPiece; standing: Float32Array[]; reach: boolean; drop: number; top: number }> = [];
  const bendWith = (standing: Float32Array[]) => (x: number, y: number, z: number, o: number[], run = -1, vertex = -1): boolean => {
    // (the mask's topple: over the leading edge of its foot at the hinge, sunk by the hinge as it lands)
    const q = y - hinge;
    if (q <= 0) { o[0] = x; o[1] = y - (run < 0 ? 0 : standing[run][vertex]); o[2] = z; return false; }
    const along = x * dx + z * dz, s0 = along - e, lx = x - dx * along, lz = z - dz * along;
    const s1 = s0 * c + q * s, q1 = q * c - s0 * s;
    o[0] = lx + dx * (s1 + e); o[1] = q1; o[2] = lz + dz * (s1 + e);
    return true;
  };
  for (const p of plan.pieces) {
    if (!(plan.lattice && gl > 1e-3 && p.at === 'collapse' && p.max[1] > hinge)) continue;
    let reach = false;
    for (const run of p.runs) for (let i = 0; i < run.pos.length && !reach; i += 3) {
      const x = run.pos[i], y = run.pos[i + 1], z = run.pos[i + 2];
      if (y - pieceGroundAt(p.ground, x, z) <= 0.4 && Math.hypot(x, z) > far) reach = true;
    }
    const cut: KeptPiece = reach ? p : { ...p, runs: p.runs.map((r) => splitRunAt(r, hinge)) };
    const standing = reach ? cut.runs.map((r) => new Float32Array(r.pos.length / 3))
      : standingVertices(cut.runs, (x, z) => pieceGroundAt(p.ground, x, z), hinge);
    // what went over: its lowest point on the ground where it lies, and how high it then stands
    let low = Infinity, high = -Infinity;
    const o = [0, 0, 0], bend = bendWith(standing);
    if (!reach) for (const [ri, run] of cut.runs.entries()) for (let i = 0; i < run.pos.length; i += 3) {
      if (!bend(run.pos[i], run.pos[i + 1], run.pos[i + 2], o, ri, i / 3)) continue;
      const up = o[1] - pieceGroundAt(p.ground, o[0], o[2]);
      low = Math.min(low, up); high = Math.max(high, up);
    }
    const drop = Number.isFinite(low) ? low + EMBED_M : 0;
    frames.push({ p, cut, standing, reach, drop, top: Number.isFinite(high) ? high - drop : 0 });
  }
  // (the E12 film: a fire lookout's frame lay on its side as tall as its foot is wide, ten metres) a frame that went over
  // buckles where it lands, all of it alike (what rests on another piece still rests on it): crushed to LIE_TOP_M
  const crush = Math.min(1, LIE_TOP_M / Math.max(1e-3, ...frames.filter((f) => !f.reach).map((f) => f.top)));
  for (const { p, cut, standing, reach, drop } of frames) {
    const bend = bendWith(standing);
    if (reach) {
      // (the E12 film: a guy bent whole with the frame swung its run behind the hinge up into the air, its far half
      // standing over the heap) a guy goes slack as the frame it holds goes over: from its anchor on the ground to where
      // its end on the frame now lies, every point of it at its share of the way, on the ground under it
      let ax = 0, az = 0, na = 0, minR = Infinity;
      for (const run of cut.runs) for (let i = 0; i < run.pos.length; i += 3) {
        const x = run.pos[i], y = run.pos[i + 1], z = run.pos[i + 2], r = Math.hypot(x, z);
        if (y - pieceGroundAt(p.ground, x, z) <= 0.4 && r > far) { ax += x; az += z; na++; }
        minR = Math.min(minR, r);
      }
      let mx = 0, mz = 0, nm = 0;
      for (const run of cut.runs) for (let i = 0; i < run.pos.length; i += 3) {
        if (Math.hypot(run.pos[i], run.pos[i + 2]) <= minR + 0.3) { mx += run.pos[i]; mz += run.pos[i + 2]; nm++; }
      }
      ax /= Math.max(1, na); az /= Math.max(1, na); mx /= Math.max(1, nm); mz /= Math.max(1, nm);
      const span = Math.max(0.5, Math.hypot(mx - ax, mz - az)), ga = pieceGroundAt(p.ground, ax, az), end = [0, 0, 0];
      const slack = (x: number, y: number, z: number, o: number[]): boolean => {
        const t = Math.min(1, Math.hypot(x - ax, z - az) / span);
        // the height on the frame this run of wire makes fast at, and where that point of the frame now lies
        bend(mx, ga + (y - ga) / Math.max(t, 0.05), mz, end);
        o[0] = ax + (end[0] - ax) * t; o[2] = az + (end[2] - az) * t;
        o[1] = pieceGroundAt(p.ground, o[0], o[2]) + SLACK_M;
        return true;
      };
      if (layPiece(cut, pose0(dx, dz), out, slack)) res.hides.push({ section: null, partClass: null, piece: p.name });
      continue;
    }
    if (layPiece(cut, pose0(dx, dz), out, (x, y, z, q, ri, v) => {
      const t = bend(x, y, z, q, ri, v);
      if (t) { q[1] -= drop; const g = pieceGroundAt(p.ground, q[0], q[2]); q[1] = g + (q[1] - g) * crush; }
      return t;
    })) {
      res.hides.push({ section: null, partClass: null, piece: p.name });
    }
  }
  const laid = new Set(frames.map((f) => f.p));
  for (const p of plan.pieces) {
    // (a piece an earlier stage took lies where that stage laid it: laid again there, the two copies agree)
    if (laid.has(p)) continue;
    // (a tank an earlier stage ruptured keeps that hole; one left to the fall ruptures now)
    if (p.kind === 'tank') { if (p.at === 'collapse') rupture(a, p, 0, 0, out, res); continue; }
    detach(a, plan, p, out, res);
  }
  return res;
}

/** The kit, under every set-piece kind (destructionKit.ts structureDamageKitChain finds a set piece's builder first). */
export function registerLandmarkDamageKits(): void {
  for (const kind of Object.keys(LANDMARK_KINDS)) {
    registerStructureDamageKit({
      id: kind,
      describe: describeLandmark,
      damaged: damagedLandmark,
      breach: breachLandmark,
      collapse: collapseLandmark,
      // sections (P2) stay the body's
      sectionDown: (a, section, seed, out) => {
        const plan = landmarkPlanOf(a);
        if (!plan) return { cuts: [], hides: [] };
        const kit = bodyKit(plan, 'sectionDown');
        return kit.sectionDown!.call(kit, plan.body, section, seed, out);
      },
      storeyDown: (a, storey, seed, out) => {
        const plan = landmarkPlanOf(a);
        if (!plan) return { cuts: [], hides: [] };
        const kit = bodyKit(plan, 'storeyDown');
        return kit.storeyDown!.call(kit, plan.body, storey, seed, out);
      },
    });
  }
}
registerLandmarkDamageKits();
