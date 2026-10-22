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
  anatomyCentre, damageRng, damageSeed, registerStructureDamageKit, structureDamageKitChain,
  type BreachSpec, type DamageHide, type DamageMeshWriter, type DamageStageResult, type DamageWriters, type StructureCut, type StructureDamageAnatomy,
  type StructureDamageKit, type StructureDescribeInput,
} from '../destructionKit.ts';
import { DEFAULT_STRUCTURE_DAMAGE_KIT, describeDefault } from '../destructionDefaultKit.ts';
import { LANDMARK_KINDS } from './plan.ts';
import { isLandmarkParts, landmarkPiecesOf, pieceGroundAt, type LandmarkPiece } from './pieces.ts';
import { toppleHingeM } from '../toppleHinge.ts'; // (227, lane B co-hold: the mask's hinge and this one, one rule)

/** The set pieces that are open frames (members, not walls). */
export const LATTICE_LANDMARKS: ReadonlySet<string> = new Set(['guyedMast', 'fireLookout', 'headframe', 'troposcatter', 'conveyor']);
/** The shaft topple's hinge and lie (fx/structureStages TOPPLE_HINGE_M, fx/structureMask TOPPLE_LIE): the lying frame
 *  matches where the mask laid the standing one down. */
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
  /** (destruction-slabs 227 round 4) Every part is a named piece's (the Polders tower mill since main's standing shaft
   *  piece and this lane's chunked upper tower): the body lays nothing of its own — no hole rim, no heap, no remnant on an
   *  anatomy read from the whole set piece's box (a 21 m remnant run stood past its walls). */
  bodyless: boolean;
  pieces: KeptPiece[];
  /** (destruction-slabs 233) The named pieces too large to keep (PIECE_TRI_CAP): never laid, never the body's either —
   *  they stand through every stage but the collapse (polders' tower mill's stage, 4,416 triangles, round its shaft). */
  standing: Array<{ top: number; floor: number; outline: Float32Array }>;
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

/** Directions of a standing piece's plan outline (planSupport). */
const PLAN_DIRS = 32;
/** (233) A named piece's plan outline as its reach along PLAN_DIRS level directions (set piece frame; a ring stands as a
 *  ring, never as the box round it): reach k = max x cos(2πk/N) + z sin(2πk/N) over its vertices. */
function planSupport(input: StructureDescribeInput, name: string): Float32Array {
  const sup = new Float32Array(PLAN_DIRS).fill(-Infinity);
  const cs = Array.from({ length: PLAN_DIRS }, (_, k) => [Math.cos((2 * Math.PI * k) / PLAN_DIRS), Math.sin((2 * Math.PI * k) / PLAN_DIRS)] as const);
  for (const list of Object.values(input.parts)) for (const g of list as readonly BufferGeometry[]) {
    if (g.userData.damagePiece !== name) continue;
    const P = g.getAttribute('position');
    if (!P) continue;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), z = P.getZ(i);
      for (let k = 0; k < PLAN_DIRS; k++) { const v = x * cs[k]![0] + z * cs[k]![1]; if (v > sup[k]!) sup[k] = v; }
    }
  }
  return sup;
}
/** (238) A named piece's floor (set piece frame, m): the height its up-facing surface covers most (a stage's deck under its
 *  railing), to the decimetre; `top` where it has none. */
function floorOf(input: StructureDescribeInput, name: string, top: number): number {
  const bins = new Map<number, number>();
  for (const list of Object.values(input.parts)) for (const g of list as readonly BufferGeometry[]) {
    if (g.userData.damagePiece !== name) continue;
    const P = g.getAttribute('position');
    if (!P) continue;
    const ix = g.getIndex();
    const n = ix ? ix.count : P.count;
    for (let t = 0; t + 2 < n; t += 3) {
      const ia = ix ? ix.getX(t) : t, ib = ix ? ix.getX(t + 1) : t + 1, ic = ix ? ix.getX(t + 2) : t + 2;
      const ux = P.getX(ib) - P.getX(ia), uy = P.getY(ib) - P.getY(ia), uz = P.getZ(ib) - P.getZ(ia);
      const vx = P.getX(ic) - P.getX(ia), vy = P.getY(ic) - P.getY(ia), vz = P.getZ(ic) - P.getZ(ia);
      const ny = uz * vx - ux * vz, l = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx);
      if (!(l > 0) || ny < 0.9 * l) continue;
      const k = Math.round(((P.getY(ia) + P.getY(ib) + P.getY(ic)) / 3) * 10);
      bins.set(k, (bins.get(k) ?? 0) + l / 2);
    }
  }
  let best = top, area = 0;
  for (const [k, w] of bins) if (w > area) { area = w; best = k / 10; }
  return best;
}
/** A plan outline's reach along the level unit direction (dx, dz): its nearest table direction's either side, the larger. */
function reachOf(sup: Float32Array, dx: number, dz: number): number {
  const a = ((Math.atan2(dz, dx) / (2 * Math.PI)) * PLAN_DIRS + PLAN_DIRS) % PLAN_DIRS;
  const k0 = Math.floor(a) % PLAN_DIRS, k1 = (k0 + 1) % PLAN_DIRS;
  return Math.max(sup[k0]!, sup[k1]!);
}

/** The body's reading: the parts without the named pieces, through the map's regional kit, else the default. */
function describeBody(input: StructureDescribeInput): StructureDamageAnatomy {
  const parts: Record<string, BufferGeometry[]> = {};
  // (227, lane B: an open frame's body reads its members through the default — its kits never lay them — not the default's stone)
  const open = !!landmarkPiecesOf(input.parts)?.some((p) => p.kind === 'lattice');
  for (const [bucket, list] of Object.entries(input.parts)) parts[bucket] = (list as readonly BufferGeometry[]).filter((g) => open || !g.userData.damagePiece);
  // (destruction-slabs 227) the body's own box (its parts less the named pieces: no sails' sweep, no tail pole), not the
  // whole set piece's
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = 0;
  for (const list of Object.values(parts)) for (const g of list) {
    if (!g.boundingBox) g.computeBoundingBox();
    const box = g.boundingBox;
    if (!box || box.isEmpty()) continue;
    minX = Math.min(minX, box.min.x); maxX = Math.max(maxX, box.max.x); minZ = Math.min(minZ, box.min.z); maxZ = Math.max(maxZ, box.max.z);
    maxY = Math.max(maxY, box.max.y);
  }
  const measured = !open && Number.isFinite(minX) ? { w: Math.max(0.5, maxX - minX), d: Math.max(0.5, maxZ - minZ), h: Math.max(0.5, maxY) } : {};
  const bodyInput: StructureDescribeInput = { ...input, ...measured, parts };
  for (const kit of open ? [] : structureDamageKitChain('', input.style)) {
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
  const lattice = LATTICE_LANDMARKS.has(input.builder) || named.some((p) => p.kind === 'lattice');
  if (!named.length && !lattice) return null;
  const body = describeBody(input);
  const pieces: KeptPiece[] = [];
  const standing: LandmarkPlan['standing'] = [];
  named.forEach((p, index) => {
    if (p.triangles <= PIECE_TRI_CAP) pieces.push({ ...p, index, runs: keepRuns(input, p.name) });
    else standing.push({ top: p.max[1], floor: floorOf(input, p.name, p.max[1]), outline: planSupport(input, p.name) });
  });
  let own = 0;
  for (const list of Object.values(input.parts)) for (const g of list as readonly BufferGeometry[]) if (!g.userData.damagePiece) own++;
  const plan: LandmarkPlan = { kind: 'landmark-pieces', body, lattice, bodyless: !lattice && own === 0, pieces, standing };
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

/** A rigid pose: world = R (p - pivot) + pivot + t (R row-major); `crumble`: the piece cannot fall clear of what stands
 *  under it (fallWay) and breaks up where it stands instead. */
interface Pose { r: number[]; px: number; py: number; pz: number; tx: number; ty: number; tz: number; crumble?: boolean }
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
  // (destruction-slabs 227) about the body's own centre (the default reading's faces stand about its walls' box)
  const [cx, cz] = anatomyCentre(a);
  return cx * dx + cz * dz + Math.abs(dx) * a.w / 2 + Math.abs(dz) * a.d / 2;
}

/** How high over what stands a falling piece passes it (m), and the farthest it is thrown past its own place (m). */
const THROW_MARGIN_M = 0.4, THROW_MAX_M = 10;
/**
 * (destruction-slabs 233; the critics' polders #46: its upper tower's wall chunks sank straight down through the standing
 * stage round the shaft and came to rest on the mound under it, gone from sight in one step) a piece too large to keep
 * (plan.standing: never laid, never the body's) stands while the others fall, and is no thing to fall through. A fall
 * goes out at its throw's pace and down at gravity's (structureStages fallMatrix: its throw as its time, its drop as the
 * square of it), so it passes over a thing in its way only once it is past that thing's far side by the time it has come
 * down to its top: the nearest a piece must land along (dx, dz) for that (`need`; -Infinity where nothing stands in its
 * way: the collapse, where everything comes down, and an open frame's members, through which what falls goes), and the
 * farthest a throw may take its nearest point (`limit`: THROW_MAX_M past where it stands). `crumble` where it stands no
 * higher than such a thing's top (it stands on it: a tower's lower course on its stage).
 */
function fallWay(plan: LandmarkPlan, p: KeptPiece, dx: number, dz: number): { need: number; limit: number } | 'crumble' {
  if (p.at === 'collapse' || plan.lattice || !plan.standing.length) return { need: -Infinity, limit: Infinity };
  // the piece as it stands: its nearest point along the fall, its span across it, its foot over the ground under it
  let near0 = Infinity, far0 = -Infinity, l0 = Infinity, l1 = -Infinity;
  for (const run of p.runs) for (let i = 0; i < run.pos.length; i += 3) {
    const x = run.pos[i], z = run.pos[i + 2], along = x * dx + z * dz, across = z * dx - x * dz;
    if (along < near0) near0 = along; if (along > far0) far0 = along;
    if (across < l0) l0 = across; if (across > l1) l1 = across;
  }
  if (!Number.isFinite(near0)) return { need: -Infinity, limit: Infinity };
  // (a piece laid flat turns as it falls: its middle's height, not its lowest point's — a sail's tip over the stage)
  const foot = (p.fall ?? 'topple') === 'flat' ? (p.min[1] + p.max[1]) / 2 : p.min[1];
  const drop = foot - pieceGroundAt(p.ground, (p.min[0] + p.max[0]) / 2, (p.min[2] + p.max[2]) / 2);
  let need = -Infinity;
  let crumble = false;
  const consider = (top: number, outline: Float32Array): void => {
    // in its way: across the fall where it is, ahead of its nearest point, and under it (its top under the piece's)
    const far = reachOf(outline, dx, dz), nearO = -reachOf(outline, -dx, -dz), a1 = reachOf(outline, -dz, dx), a0 = -reachOf(outline, dz, -dx);
    if (a1 < l0 || a0 > l1 || far <= near0 + 0.1 || nearO >= far0 || top >= p.max[1]) return;
    const over = foot - top - THROW_MARGIN_M;
    if (!(over > 0) || !(drop > 0)) { crumble = true; return; }
    // the share of its fall's time by which it has come down to that top: its throw must have taken it past the far side
    const u = Math.sqrt(Math.min(1, over / drop));
    need = Math.max(need, near0 + (far + THROW_MARGIN_M - near0) / u);
  };
  for (const st of plan.standing) consider(st.top, st.outline);
  return crumble ? 'crumble' : { need, limit: near0 + THROW_MAX_M };
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
    // (destruction-slabs 227, Longleaf's fire lookout: its 6.9 x 5.1 m deck toppled through a right angle and stood on its
    // edge at the tower's foot, a dark board in the open) a piece much wider than it is tall lands near flat
    const edge = Math.abs(dx) * hx + Math.abs(dz) * hz;
    const flatPiece = p.max[1] - p.min[1] < 0.35 * Math.max(p.max[0] - p.min[0], p.max[2] - p.min[2]);
    const tilt = flatPiece ? 0.12 + rng() * 0.3 : 1.36 + rng() * 0.3;
    pose = { r: rotation(dz, 0, -dx, tilt), px: cx + dx * edge, py: p.min[1], pz: cz + dz * edge, tx: 0, ty: 0, tz: 0 };
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
    // (destruction-slabs 227 round 2: a tower mill's stage ring, 12 m across, slumped 25 degrees: its far side stood 5 m up
    // over the stump, a crown of plates) a piece much wider than it is tall slumps only a few degrees
    const flatPiece = p.max[1] - p.min[1] < 0.35 * Math.max(p.max[0] - p.min[0], p.max[2] - p.min[2]);
    const tilt = fall === 'drop' ? (tallish ? 0.9 + rng() * 0.6 : 0.12 + rng() * 0.3) : flatPiece ? 0.05 + rng() * 0.07 : 0.14 + rng() * 0.3, ta = rng() * Math.PI * 2;
    // (destruction-slabs 227 round 4; saltwind #19's house row: a 5.6 x 3 m board dropped off its wall stood upright on the
    // ground beside it — wider than it is tall, it "landed near flat" by its height alone) a plate standing up (thin in
    // plan, a man's height and more) lies on its broad side, out from where it stood
    const ex = p.max[0] - p.min[0], ey = p.max[1] - p.min[1], ez = p.max[2] - p.min[2], thinPlan = Math.min(ex, ez);
    if (thinPlan <= 0.6 && thinPlan < 0.2 * Math.min(ey, Math.max(ex, ez)) && ey >= 1.2) {
      const sign = Math.cos(ta) < 0 ? -1 : 1;
      const lay = ez <= ex ? rotation(1, 0, 0, sign * Math.PI / 2) : rotation(0, 0, 1, sign * Math.PI / 2);
      pose = { r: multiply(rotation(Math.cos(ta), 0, Math.sin(ta), Math.min(tilt, 0.15)), lay), px: cx, py: (p.min[1] + p.max[1]) / 2, pz: cz, tx: 0, ty: 0, tz: 0 };
    } else pose = { r: rotation(Math.cos(ta), 0, Math.sin(ta), tilt), px: cx, py: (p.min[1] + p.max[1]) / 2, pz: cz, tx: 0, ty: 0, tz: 0 };
    if (fall === 'drop') { const out = 0.3 + rng() * 1.2; pose.tx = dx * out; pose.tz = dz * out; }
  }
  // clear of what it stood on: a piece that stood above the ground lands beyond the body's plan along its fall (a piece
  // laid flat comes down under where it hung — a banner under its arch — unless its spec names a clearance)
  if (high && fall !== 'slump' && (fall !== 'flat' || p.clear !== undefined)) {
    let near = Infinity;
    forEachVertex(p, pose, (x, _y, z) => { near = Math.min(near, x * dx + z * dz); });
    let edge = p.clear !== undefined ? cx * dx + cz * dz + p.clear : reachAlong(plan.body, dx, dz) + 0.15;
    // (233) and past what stands in its way, or it crumbles where it stands (on it, or no throw within reach clears it)
    const way = fallWay(plan, p, dx, dz);
    if (way === 'crumble' || way.need > Math.max(edge, way.limit)) pose.crumble = true;
    else edge = Math.max(edge, way.need);
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

/** The steepest a fallen piece is laid along the ground under it (rad). */
const GROUND_TILT_MAX = 35 * Math.PI / 180;
/** A piece this thin (m, its least extent) is draped over the ground under it where that ground is no plane. */
const DRAPE_THIN_M = 0.6;
/**
 * (destruction-slabs 227: Polders' mound windmill laid its 5.4 x 4.4 m sails flat by their lowest point, standing 1.5 m
 * out over the slope) a piece laid flat, dropped or toppled lies along the ground under it: turned onto the least-squares plane of
 * the ground under its footprint (35 degrees at most), then seated by its lowest point over the whole footprint. Returns
 * the plane (y = ax + bz + c) for a drape, or null.
 */
function fitGround(p: KeptPiece, pose: Pose): [number, number, number] | null {
  const fall = p.fall ?? 'topple';
  // (and a toppled one: Polders' tower mill's upper tower went over onto the mound's flank on its rim, its broken end a
  // 6 m disc standing 5 m over the slope)
  if (fall !== 'flat' && fall !== 'drop' && fall !== 'topple') return null;
  let total = 0;
  for (const run of p.runs) total += run.pos.length / 3;
  const every = Math.max(1, Math.floor(total / 96));
  let n = 0, sx = 0, sz = 0, sg = 0, sxx = 0, szz = 0, sxz = 0, sxg = 0, szg = 0, cy = 0, i = 0;
  forEachVertex(p, pose, (x, y, z) => {
    if (i++ % every) return;
    const g = pieceGroundAt(p.ground, x, z);
    n++; sx += x; sz += z; sg += g; sxx += x * x; szz += z * z; sxz += x * z; sxg += x * g; szg += z * g; cy += y;
  });
  if (n < 3) return null;
  const mx = sx / n, mz = sz / n, mg = sg / n;
  const cxx = sxx / n - mx * mx, czz = szz / n - mz * mz, cxz = sxz / n - mx * mz, cxg = sxg / n - mx * mg, czg = szg / n - mz * mg;
  const det = cxx * czz - cxz * cxz;
  if (!(Math.abs(det) > 1e-9)) return null;
  let ga = (cxg * czz - czg * cxz) / det, gb = (czg * cxx - cxg * cxz) / det;
  const slope = Math.hypot(ga, gb), cap = Math.tan(GROUND_TILT_MAX);
  if (slope > cap) { ga *= cap / slope; gb *= cap / slope; }
  const gc = mg - ga * mx - gb * mz;
  // the turn from up onto the plane's normal (-a, 1, -b), about the footprint's centre
  const nl = Math.hypot(ga, 1, gb), nx = -ga / nl, ny = 1 / nl, nz = -gb / nl;
  const angle = Math.acos(Math.min(1, ny));
  if (angle > 1e-4) {
    const q = rotation(nz, 0, -nx, angle);
    const cx = mx, cyy = cy / n, cz = mz;
    const wx = pose.px + pose.tx - cx, wy = pose.py + pose.ty - cyy, wz = pose.pz + pose.tz - cz;
    apply(q, wx, wy, wz, _q);
    pose.r = multiply(q, pose.r);
    pose.tx = _q[0] + cx - pose.px; pose.ty = _q[1] + cyy - pose.py; pose.tz = _q[2] + cz - pose.pz;
  }
  return [ga, gb, gc];
}

/** How long a piece that crumbles stands after its stage before it breaks up (s): its own seed's share of the span. */
/** (238; the critic's polders #46: the upper walls, cap and sails hung over the stage the lower course had left) it stands
 *  while what stood on it leaves it, then goes before the cap coming down could reach it. */
const CRUMBLE_S = [0.35, 0.55] as const;
/** The debris a crumbling piece breaks into (238): how many, their size (m), the gravity their throw is solved under. */
const BREAK_PIECES = 36, BREAK_SIZE_M = [0.3, 0.75] as const, BREAK_G = 9.81;
/**
 * (238; the critic's polders #46 film: the tower's lower course "vanishes with no debris" while the upper walls, cap and
 * sails hung over the bared stage) a piece that crumbles breaks into pieces of its own wall where it stands, sampled over
 * its surface by area, each thrown out from the set piece's middle hard enough to pass over what stands under it (a piece
 * too large to keep: its outline's reach along the throw, its floor) — up first where it starts within a hand of that
 * floor. The presentation throws them as the piece breaks up (DamageFall.debris: structureStages crumblePiece).
 */
function breakUp(a: StructureDamageAnatomy, plan: LandmarkPlan, p: KeptPiece): { bucket: string; debris: number[] } | null {
  const run = p.runs.reduce<PieceRun | null>((best, r) => (!best || r.pos.length > best.pos.length ? r : best), null);
  if (!run) return null;
  const rng = damageRng(damageSeed(a.seed, 0xb2e4, p.index));
  const tris = run.pos.length / 9;
  const cum = new Float32Array(tris);
  let total = 0;
  for (let t = 0; t < tris; t++) {
    const o = t * 9;
    const ux = run.pos[o + 3] - run.pos[o], uy = run.pos[o + 4] - run.pos[o + 1], uz = run.pos[o + 5] - run.pos[o + 2];
    const vx = run.pos[o + 6] - run.pos[o], vy = run.pos[o + 7] - run.pos[o + 1], vz = run.pos[o + 8] - run.pos[o + 2];
    total += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    cum[t] = total;
  }
  if (!(total > 0)) return null;
  const debris: number[] = [];
  const pcx = (p.min[0] + p.max[0]) / 2, pcz = (p.min[2] + p.max[2]) / 2;
  for (let i = 0; i < BREAK_PIECES; i++) {
    // a point of its surface (by area), its colour there
    const at = rng() * total;
    let lo = 0, hi = tris - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid]! < at) lo = mid + 1; else hi = mid; }
    let r1 = rng(), r2 = rng();
    if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
    const o = lo * 9;
    const x = run.pos[o] + (run.pos[o + 3] - run.pos[o]) * r1 + (run.pos[o + 6] - run.pos[o]) * r2;
    const y = run.pos[o + 1] + (run.pos[o + 4] - run.pos[o + 1]) * r1 + (run.pos[o + 7] - run.pos[o + 1]) * r2;
    const z = run.pos[o + 2] + (run.pos[o + 5] - run.pos[o + 2]) * r1 + (run.pos[o + 8] - run.pos[o + 2]) * r2;
    // out from the middle (the piece's own middle where it stands on it), a little to either side
    let dx = Math.hypot(x, z) > 0.3 ? x : pcx, dz = Math.hypot(x, z) > 0.3 ? z : pcz;
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl; dz /= dl;
    const side = (rng() - 0.5) * 0.6;
    const ex = dx - dz * side, ez = dz + dx * side, el = Math.hypot(ex, ez) || 1;
    let vy = 0.3 + rng() * 1.6;
    let vout = 1.5 + rng() * 2;
    const r0 = x * dx + z * dz;
    for (const st of plan.standing) {
      const reach = reachOf(st.outline, dx, dz) + 0.3;
      if (reach <= r0) continue;
      const over = y - (st.floor + 0.2);
      if (over < 0.6) vy = Math.max(vy, 2.6 - Math.max(0, over));
      // (when it comes down to the floor) — the program's drag (0.35/s) taken back off the throw
      const tf = (vy + Math.sqrt(Math.max(0, vy * vy + 2 * BREAK_G * over))) / BREAK_G;
      if (tf > 0.05) vout = Math.max(vout, ((reach - r0) / tf) / Math.max(0.5, 1 - 0.175 * tf));
    }
    vout = Math.min(10, vout * (1 + rng() * 0.2));
    const sz = BREAK_SIZE_M[0] + rng() * (BREAK_SIZE_M[1] - BREAK_SIZE_M[0]), spin = rng() * Math.PI * 2;
    const k = lo * 3, c = run.col;
    debris.push(x, y, z, (ex / el) * vout, vy, (ez / el) * vout, sz, c ? c[k * 3]! : 0.7, c ? c[k * 3 + 1]! : 0.7, c ? c[k * 3 + 2]! : 0.7, spin);
  }
  return { bucket: run.bucket, debris };
}
/** A piece comes off: its spans hidden, its triangles laid where it rests, chips thrown. */
function detach(a: StructureDamageAnatomy, plan: LandmarkPlan, p: KeptPiece, out: DamageWriters, res: DamageStageResult): void {
  const pose = restPose(a, plan, p);
  if (pose.crumble) {
    // (233) it cannot fall clear of what stands under it: it breaks up where it stands — (238) into pieces of its own
    // wall thrown over what stands under it (breakUp), its dust and shards (structureStages crumblePiece); nothing of it
    // laid whole
    res.hides.push({ section: null, partClass: null, piece: p.name } satisfies DamageHide);
    const rng = damageRng(damageSeed(a.seed, 0xc7b1e, p.index));
    const broken = breakUp(a, plan, p);
    (res.falls ??= []).push({ piece: p.name, r: [1, 0, 0, 0, 1, 0, 0, 0, 1], pivot: [0, 0, 0], t: [0, 0, 0],
      crumbleS: CRUMBLE_S[0] + rng() * (CRUMBLE_S[1] - CRUMBLE_S[0]),
      ...(broken ? { debris: broken.debris, debrisBucket: broken.bucket } : {}) });
    // (a late joiner's settled stage throws none: a few chips lie where it broke)
    chips(p, a, out, 6);
    return;
  }
  const plane = fitGround(p, pose);
  seat(p, pose);
  // a thin piece over ground that is no plane (a mound's crest) drapes over it, vertex by vertex
  let drape = false;
  if (plane) {
    let gapMax = 0;
    const least = Math.min(p.max[0] - p.min[0], p.max[1] - p.min[1], p.max[2] - p.min[2]);
    forEachVertex(p, pose, (x, y, z) => { gapMax = Math.max(gapMax, y - pieceGroundAt(p.ground, x, z)); });
    drape = least <= DRAPE_THIN_M && gapMax > 0.45 + least;
  }
  const ok = drape
    ? layPiece(p, pose, out, (x, y, z, q) => {
      apply(pose.r, x - pose.px, y - pose.py, z - pose.pz, q);
      q[0] += pose.px + pose.tx; q[1] += pose.py + pose.ty; q[2] += pose.pz + pose.tz;
      q[1] += pieceGroundAt(p.ground, q[0], q[2]) - (plane![0] * q[0] + plane![1] * q[2] + plane![2]);
      return true;
    })
    : layPiece(p, pose, out);
  // (destruction-slabs 227, Polders' tower mill: its upper tower took the stage's room, and the sails left standing on the
  // fallen tower's hub hung in the air) a piece the stage has no room to lay still comes off: gone in its chips
  res.hides.push({ section: null, partClass: null, piece: p.name } satisfies DamageHide);
  // (round 5) laid by one rigid turn: the presentation shows its fall there (a draped piece's to the plane it was turned
  // onto: the drape's last few decimetres over the mound's crest are all that changes when its laid copy shows)
  if (ok) (res.falls ??= []).push({ piece: p.name, r: pose.r, pivot: [pose.px, pose.py, pose.pz], t: [pose.tx, pose.ty, pose.tz] });
  chips(p, a, out, ok ? 6 : 12);
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
  // its dark inside: a disc across the vessel behind the hole (a radome's toward its far wall, behind its radar)
  if (out.mesh.begin('dark', 'rim')) {
    const back = (v.insideM ?? 0.6) * v.r, n = 10, ids: number[] = [];
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
  // (destruction-slabs 227: drawn in the 'dark' bucket — the world's window material, untextured — it read as a black
  // plate) a wet or burnt stain on the ground's own stone, its tint darkened; grain its straw
  const spillBucket = v.contents === 'grain' ? 'straw' : 'stone';
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
  // (destruction-slabs 227 round 4; Polders' tower mill in a late joiner's page after its first hole: the breached pieces
  // — its upper tower, cap and windshaft — off, its first sail, a damaged piece, left on the hub 19 m up) a breach takes the
  // damaged pieces with its own (one taken before is laid again where it lay: the two copies agree)
  for (const p of plan.pieces) {
    if (p.at !== stage && !(stage === 'breached' && p.at === 'damaged')) continue;
    if (p.kind === 'tank') rupture(a, p, dirX, dirZ, out, res);
    else detach(a, plan, p, out, res);
  }
}

// ---------------------------------------------------------------------------------------------------------- the kit

/** The set piece's plan with its body carrying what the world measured on the set piece (its heap, its intact form, its
 *  drawn enclosure: destruction-slabs 227 — the body kit's writers place against them). */
function synced(a: StructureDamageAnatomy): LandmarkPlan | null {
  const plan = landmarkPlanOf(a);
  if (!plan) return null;
  plan.body.mound = a.mound;
  if (a.intact) plan.body.intact = a.intact;
  if (a.enclosure) plan.body.enclosure = a.enclosure;
  return plan;
}

function damagedLandmark(a: StructureDamageAnatomy, seed: number, out: DamageWriters): DamageStageResult {
  const plan = synced(a);
  const res: DamageStageResult = { cuts: [], hides: [] };
  if (!plan) return res;
  // an open frame has no wall to spall
  if (!plan.lattice && !plan.bodyless) merge(res, bodyKit(plan, 'damaged').damaged!.call(bodyKit(plan, 'damaged'), plan.body, seed, out));
  takeStage(a, plan, 'damaged', 0, 0, out, res);
  return res;
}

function breachLandmark(a: StructureDamageAnatomy, hole: BreachSpec, out: DamageWriters): DamageStageResult {
  const plan = synced(a);
  const res: DamageStageResult = { cuts: [], hides: [] };
  if (!plan) return res;
  // an open frame takes no round hole (a round passes its members)
  if (!plan.lattice && !plan.bodyless) merge(res, bodyKit(plan, 'breach').breach!.call(bodyKit(plan, 'breach'), plan.body, hole, out));
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
  const plan = synced(a);
  const res: DamageStageResult = { cuts: [], hides: [] };
  if (!plan) return res;
  const kit = bodyKit(plan, 'collapse');
  if (!plan.lattice && !plan.bodyless) merge(res, kit.collapse!.call(kit, plan.body, seed, out)); // (227, lane B: an open frame's pieces lay its whole fall, footings and sheds standing among them; no body heap)
  const given = (out as DamageWriters & { fallAxis?: [number, number] }).fallAxis ?? ((t: number): [number, number] => [Math.cos(t), Math.sin(t)])(damageRng(damageSeed(a.seed, 11))() * Math.PI * 2);
  const gl = given ? Math.hypot(given[0], given[1]) : 0;
  // a frame that toppled lies along its line, bent at its hinge as the mask laid it down; every other piece where it rests
  const H = Math.max(1, a.h), hinge = toppleHingeM(H, plan.lattice);
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
    if (!(plan.lattice && gl > 1e-3 && p.kind === 'lattice' && p.at === 'collapse')) continue; // (227, lane B: an open piece under the hinge stands; a detach piece comes off whole)
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

/** An open frame's writers for the body kit's section and storey falls: its stubs, rooms and remnants are not laid (its
 *  members are no wall: lane B's open frames, round 4). */
function openFrameWriters(out: DamageWriters): DamageWriters {
  const m = out.mesh;
  const mesh: DamageMeshWriter = {
    begin: (bucket, role) => (role === 'remnant' || role === 'room' || role === 'rim' ? false : m.begin(bucket, role)),
    vertex: (px, py, pz, nx, ny, nz, u, v, r, g, b) => m.vertex(px, py, pz, nx, ny, nz, u, v, r, g, b),
    triangle: (a, b, c) => m.triangle(a, b, c),
    end: () => m.end(),
    get vertices() { return m.vertices; },
    get capacity() { return m.capacity; },
  };
  return { ...out, mesh };
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
        const plan = synced(a);
        // (round 4) a bodyless set piece's sections are its pieces' to lay (no stub along an anatomy face it never drew); an
        // open frame's hide what they hide but lay no stub, room or remnant (copper_mesa #38's headframe: a 34 m course of
        // steel units along its anatomy's face at its feet)
        if (!plan || plan.bodyless) return { cuts: [], hides: [] };
        const kit = bodyKit(plan, 'sectionDown');
        return kit.sectionDown!.call(kit, plan.body, section, seed, plan.lattice ? openFrameWriters(out) : out);
      },
      storeyDown: (a, storey, seed, out) => {
        const plan = synced(a);
        if (!plan || plan.bodyless) return { cuts: [], hides: [] };
        const kit = bodyKit(plan, 'storeyDown');
        return kit.storeyDown!.call(kit, plan.body, storey, seed, plan.lattice ? openFrameWriters(out) : out);
      },
    });
  }
}
registerLandmarkDamageKits();
