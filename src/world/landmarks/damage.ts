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
    const tilt = fall === 'drop' ? 0.5 + rng() * 1.4 : 0.14 + rng() * 0.3, ta = rng() * Math.PI * 2;
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

/** Lay a piece's own triangles at a pose (role rubble); false when the stage's writer has no room for it. */
function layPiece(p: KeptPiece, pose: Pose, out: DamageWriters, bend?: (x: number, y: number, z: number, o: number[]) => boolean): boolean {
  let need = 0;
  for (const run of p.runs) need += run.pos.length / 3;
  if (out.mesh.capacity - out.mesh.vertices < need) return false;
  const n = [0, 0, 0], q = [0, 0, 0];
  for (const run of p.runs) {
    if (!out.mesh.begin(run.bucket, 'rubble')) return false;
    for (let i = 0, v = 0; i < run.pos.length; i += 9) {
      const ids = [0, 0, 0];
      for (let k = 0; k < 3; k++, v++) {
        const j = i + k * 3;
        let turned = true;
        if (bend) turned = bend(run.pos[j], run.pos[j + 1], run.pos[j + 2], q);
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
  for (const p of plan.pieces) {
    // (a piece an earlier stage took lies where that stage laid it: laid again there, the two copies agree)
    if (plan.lattice && gl > 1e-3 && p.at === 'collapse' && p.max[1] > hinge) {
      const dx = given![0] / gl, dz = given![1] / gl, e = Math.max(a.w, a.d) / 2;
      const c = Math.cos(TOPPLE_LIE), s = Math.sin(TOPPLE_LIE);
      // (the mask's topple: over the leading edge of its foot at the hinge, sunk by the hinge as it lands)
      const bend = (x: number, y: number, z: number, o: number[]): boolean => {
        const q = y - hinge;
        if (q <= 0) { o[0] = x; o[1] = y; o[2] = z; return false; }
        const along = x * dx + z * dz, s0 = along - e, lx = x - dx * along, lz = z - dz * along;
        const s1 = s0 * c + q * s, q1 = q * c - s0 * s;
        o[0] = lx + dx * (s1 + e); o[1] = q1; o[2] = lz + dz * (s1 + e);
        return true;
      };
      // what went over: its lowest point on the ground where it lies
      let low = Infinity;
      const o = [0, 0, 0];
      for (const run of p.runs) for (let i = 0; i < run.pos.length; i += 3) {
        if (bend(run.pos[i], run.pos[i + 1], run.pos[i + 2], o)) low = Math.min(low, o[1] - pieceGroundAt(p.ground, o[0], o[2]));
      }
      const drop = Number.isFinite(low) ? low + EMBED_M : 0;
      const pose: Pose = { r: rotation(dz, 0, -dx, TOPPLE_LIE), px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0 };
      if (layPiece(p, pose, out, (x, y, z, q) => { const t = bend(x, y, z, q); if (t) q[1] -= drop; return t; })) {
        res.hides.push({ section: null, partClass: null, piece: p.name });
      }
      continue;
    }
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
