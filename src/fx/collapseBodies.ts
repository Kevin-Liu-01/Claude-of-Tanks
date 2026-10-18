/**
 * collapseBodies.ts — a collapsing building's pieces as bodies (destruction core lane, 2026-10-10; the owner: "make
 * thier collapses much more natural", "just let physics work for these kinds of things" and "not slow down the game so
 * much").
 *
 * At a collapse (structureStages: a building's 'collapsed' stage, live) the building as it stands — its own triangles
 * from the world's merged buckets (the seam's spans) and the rims its breaches redrew — is cut between the plan's
 * pieces (collapsePieces.ts: wall panels over the stubs, floor slabs, roof slabs, gables, chimneys), each piece's
 * broken edges and back are capped in its core, and every piece becomes a mesh in the building's own materials (no new
 * program) that follows a body in the presentation's debris pool (debrisPhysics.ts). The standing building is hidden
 * the same frame: the eye sees it break, not swap. What stays standing (the stubs, the corner piers, the plinth, a
 * chimney's foot) is the building's own geometry too, kept static, and is solid to the pieces.
 *
 * The cut is laid before the collapse (a building damaged or breached is prepared a few hundred triangles a frame,
 * within a small budget: the plan's cut does not depend on the blow), so the collapse's own frame only builds the
 * meshes and spawns the bodies; a building that falls before its cut is laid finishes it then.
 *
 * The pieces wait, asleep and solid, for their release (the struck face at once, the roof and the faces beside it a
 * beat later, the far face last) unless something strikes them or their support goes: the collapse comes down as one
 * thing. A wall panel lands whole and cracks into its parts on its first hard landing (each part's own body takes the
 * panel's motion there). The pool's ground is the drawn ground, the battle's heaps in it, but a collapsing building's
 * own heap rises under its pieces as they come down (it is the sim's at once). Hard landings make their dust and their
 * sound (fx/clock.ts emitDebrisLanding). When every piece of a collapse has lain still a while (or only creeps), its
 * pieces are baked into one static mesh a material and their bodies leave the pool.
 *
 * With sections on (DESTRUCTION.md §3.4) the cascade brings a building down a section at a time: its walls fall as their
 * own cells (structureFracture dropFace) and its roof here, at the roof's own event (`fallRoof`: the cut's roof slabs as
 * bodies, the rest left standing); the final collapse lays the pile without throwing from the full height.
 *
 * Nothing waits in the air: a piece the pool cannot take (spawn refused, or still outside the world a moment past its
 * release: the 2026-10-11 "roof on stilts") bursts into the program's pieces when it is a wall panel, else it is laid at
 * rest on the ground as drawn. The work is spread in fixed units an update (never a wall-clock budget: a re-film is the
 * same), and the per-frame loops allocate nothing (2026-10-15 port onto integ/226: the house hitch).
 */
import * as THREE from 'three';
import { createRigidShape, type RigidEnvironment, type RigidShape } from '../sim/rigidBody.ts';
import type { CollisionRecord } from '../world/collision.ts';
import type { StructureDamageSeam, StructureSpan } from '../world/structureDamageSeam.ts';
import { anatomyCentre, type StructureDamageAnatomy } from '../world/destructionKit.ts';
import { bandEnclosure, drawnOverAt, enclosedAt } from '../world/structureEnclosure.ts';
import { rubbleProfile, rubbleStampOf, type RubbleMound, type RubbleStamp } from '../sim/terrainDeformation.ts';
import type { DebrisPhysics } from './debrisPhysics.ts';
import type { WreckTurretTank } from '../sim/wreckTurrets.ts';
import {
  PART_STRIDE, STATIC_PIECE, capPiece, capStubs, partShape, partitionTriangles, pieceKick, pieceShape, pieceSpawn,
  planCollapsePieces, stubRecords,
  type CapQuad, type CollapseBlow, type CollapsePiece, type CollapsePlan,
} from './collapsePieces.ts';
import { emitDebrisLanding } from './clock.ts';
import { profEnd, profStart } from './fxProf.ts';
import { layUprightPlates } from './uprightPlates.ts';

/** A live collapse's stage event (StructureStageEvent's fields this module reads). */
export interface CollapseBodiesEvent {
  structureId: number;
  cause: string | null;
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirZ: number;
}

interface CollapseBodiesOptions {
  pool: DebrisPhysics;
  /** Where the pieces and the remnant are drawn (the fx group). */
  group: THREE.Group;
  /** A bucket's own material (the world's plain mesh material: compiled already). */
  materialFor(bucket: string): THREE.Material | null;
  /** The ground as drawn (the battle's craters and heaps in it). */
  groundAt(x: number, z: number): number;
  /** The world's static records for the bodies (sim/wreckTurrets createWreckEnvironment), or null. */
  environment(): RigidEnvironment | null;
  /** A hard landing (its dust): world point, speed, mass, the building. */
  onLanding?(x: number, y: number, z: number, speedMps: number, massKg: number, structureIdx: number): void;
  /** A piece breaking apart where it struck (a shaft's drums, a roof's sheets): the broken masonry and grit it throws,
   *  at a world point with the break's velocity there and the mass that broke. */
  onShards?(x: number, y: number, z: number, vx: number, vy: number, vz: number, massKg: number, structureIdx: number): void;
  /** Pieces at most per collapse (default: the plan's, 24 and 12 a shed). */
  cap?: number;
  /** The vehicles drawn this frame: their hulls and turrets shove the pieces (kinematic boxes in the pool). */
  hulls?(): Iterable<unknown> | null;
  /** Another owner's bodies in the same pool (fx/structureFracture.ts: a wall's knocked and fallen cells): the pool
   *  steps while either has any. */
  alsoLive?(): boolean;
  /** Triangles a cut laid ahead takes an update (default 900); a collapse waiting for its cut takes PREPARE_WAITING. */
  prepareTris?: number;
}

/** A wall panel the blow's failure reached (CollapsePiece.shatterS): its building and its place on its face. */
type CollapseShatterHandler = (seam: StructureDamageSeam, piece: CollapsePiece, e: CollapseBodiesEvent) => void;

export interface CollapseBodies {
  /**
   * A building that may come down soon (damaged, breached): its cut is laid in the background, a little an update, from
   * its spans and `standing` (its fracture's redrawn faces, its stages' standing runs: cut with it), as of `version` (the
   * caller's count of its redraws; a cut of another version is laid again). `roofOnly`: sections on — only what reaches
   * over its eaves is cut (the roof is all that falls here).
   */
  prepare(seam: StructureDamageSeam, materialFor?: (bucket: string) => THREE.Material | null, standing?: readonly THREE.Mesh[],
    version?: number, roofOnly?: boolean): void;
  /** The version a building's cut was laid at (−1: none), and whether it is laid. */
  preparedVersion(structureIdx: number): number;
  /**
   * Sections on: the roof fell (its section's event). Its slabs come down as bodies from the cut laid ahead (finished
   * now if it was not); the caller hides the standing roof as before. False when there is no roof to throw.
   */
  fallRoof(seam: StructureDamageSeam, e: CollapseBodiesEvent, materialFor?: (bucket: string) => THREE.Material | null, version?: number): boolean;
  /**
   * The building comes down as bodies: false when it cannot (no storeys, too few pieces) and the caller keeps its
   * scripted collapse. `standing` are the stage runs and redrawn faces that stood with it: they are cut with it (a cut
   * laid ahead of this `version` holds them already) and the caller drops them. `ready` runs when its pieces stand in its
   * place (the caller hides it then): at once for a building whose cut was laid ahead; one felled before its cut was laid
   * finishes it over the next updates (a third of a second at most) and stands, in the blow's dust, until then.
   */
  collapse(seam: StructureDamageSeam, e: CollapseBodiesEvent, standing: readonly THREE.Mesh[],
    materialFor?: (bucket: string) => THREE.Material | null, ready?: () => void, version?: number): boolean;
  /** A building whose own pieces fly (its walls struck): its records no longer stand in their way (a body born inside
   *  its wall would be thrown out by the engine), its upper floors catching what falls inside it (sections on). */
  markFalling(seam: StructureDamageSeam, floors: boolean): void;
  /** Sections on: a storey dropped (its floor line `storey`'s floor goes): what lay on it falls on. */
  dropFloor(structureIdx: number, storey: number): void;
  /** Whether a body lain still at height `y` rests on a floor of the building still standing (it stays a body: baked, it
   *  would stay in the air once that storey drops). */
  floorHolds(structureIdx: number, y: number): boolean;
  /** The fx clock's delta: the pool steps, every piece follows its body; preparations advance within their budget. */
  update(dtS: number): void;
  /** Collapses in flight (their pieces not all baked). */
  readonly active: number;
  /** Whether this structure came down as bodies (its dust is thinner: the pieces kick their own). */
  took(structureIdx: number): boolean;
  /** Who bursts a shattered panel into the kit's pieces and dust (structureStages). */
  onShatter(handler: CollapseShatterHandler | null): void;
  /** A building's cut laid ahead is stale (its walls were redrawn as they broke: structureFracture): it is laid again
   *  from what stands. */
  forget(structureIdx: number): void;
  reset(): void;
  stats(): { collapses: number; pieces: number; meshes: number; vertices: number; baked: number; prepared: number };
}

/** A material's vertex layout: position, normal, then its other attributes in order (sizes). */
interface Layout {
  names: string[];
  sizes: number[];
  stride: number;
}

/**
 * One source of a building's triangles: a span of a merged bucket (cut once: a triangle flattened out of its bucket since
 * — its face taken by the wall fracture, a damaged stage's glass — is left out of the build), or a stage run or a
 * redrawn face (cut again whenever the building's version moves: 2026-10-15, the port's house probe — a cut laid ahead
 * was thrown away whole at every strike, so a struck building's collapse waited for all of it in its own frames).
 */
interface Source {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  first: number;
  count: number;
  world: THREE.Matrix4 | null;
  /** A span's own: its positions read at the build; null for a run. */
  span: StructureSpan | null;
  /** The cut's number of its first triangle (spans), −1 a run's. */
  tri0: number;
}

interface Group {
  material: THREE.Material;
  layout: Layout;
  /** Partitioned triangles by key (piece × PART_STRIDE + part, or STATIC_PIECE), body frame, each vertex its layout's
   *  floats and its triangle's number in the cut (−1: a run's or a cap's): the spans' (kept, typed once cut), the runs'
   *  (cut again with the version) and the caps' (laid at each build). */
  lists: Map<number, number[] | Float32Array>;
  runLists: Map<number, number[]>;
  capLists: Map<number, number[]>;
}

/** A building's cut, laid ahead: its plan's geometry, its sources and how far through them it is. */
interface Prepared {
  structureIdx: number;
  seam: StructureDamageSeam;
  plan: CollapsePlan;
  groups: Map<THREE.Material, Group>;
  sources: Source[];
  source: number;
  tri: number;
  /** Its runs (the stage runs and redrawn faces standing with it at `version`) and how far through them it is. */
  runs: Source[];
  run: number;
  runTri: number;
  spansDone: boolean;
  /** The spans' triangles, and those flattened out of their buckets as of the last build. */
  spanTris: number;
  dead: Uint8Array | null;
  done: boolean;
  /** For the eviction of a cut never used. */
  touched: number;
  resolve: (bucket: string) => THREE.Material | null;
  /** Its geometries by key once the cut is laid (caps in): the collapse only makes meshes of them. Built a list at a
   *  time too (`queue`: what is left to build; null before the caps are in). */
  built: Map<number, Array<{ material: THREE.Material; geometry: THREE.BufferGeometry }>> | null;
  queue: Array<[Group, number]> | null;
  /** The caller's version of the building it was cut at; the pieces already brought down (a roof's, sections on); a
   *  roof-only cut (sections on: what reaches over the eaves). */
  version: number;
  used: Set<number>;
  roofOnly: boolean;
  /** Stage runs expanded to plain geometry for the cut (disposed once cut). */
  expanded: THREE.BufferGeometry[];
}

interface LivePart {
  meshes: THREE.Mesh[];
  /** Its offset in the piece's frame (glued), and as a matrix. */
  offset: THREE.Vector3;
  offsetM: THREE.Matrix4 | null;
  handle: number;
  pose: Float64Array;
  /** Landings that kicked dust once it broke off (each part its own, not its piece's). */
  dusts: number;
  /** Looked at once it first lay still: tipped over if it stood on its edge. */
  tipped: boolean;
  /** Its own body's shape once it breaks off when what it draws reaches past its planned box (a roof's eave boards). */
  shape: RigidShape | null;
  /** That shape's box [x0, y0, z0, x1, y1, z1] in its own frame (receipts read it). */
  box: number[] | null;
  /** Times shoved off a rest high past the walls (destruction-slabs 227 round 2); −1 once looked at and left. */
  shoves: number;
  /** How long it has crept (under 0.25 m/s and 0.4 rad/s): a sheet balanced on a stump never sleeps. */
  slowS: number;
  /** Times tipped over again, found standing on its edge past the walls (round 2; round 3: counted on a tip made, a sheet
   *  found lying is looked at again once it is knocked onto its edge). */
  retipped: number;
}

/**
 * What a roof's fall takes (a roof-only cut builds it, the fall spawns it): its slabs, and the chimneys rising from its
 * covering (destruction-slabs 227 round 2: a roof chimney's piece stood on in the world when its roof fell, in the sky).
 */
function ridesRoof(plan: CollapsePlan, index: number): boolean {
  const piece = plan.pieces[index];
  if (!piece) return false;
  if (piece.kind === 'roof') return true;
  return piece.kind === 'chimney' && plan.chimneys.some((ch) => ch.piece === index && ch.fromRoof);
}

/** How many times a roof slab or sheet at rest high past the walls is shoved off before it breaks up (round 4: once, a flat one
 * into a standing shell; round 2 shoved twice, the second out and harder). */
const ROOF_SHOVES = 1;

interface LivePiece {
  piece: CollapsePiece;
  /** Its body's centre of mass in its frame (a crack's levers run from it, not from the frame's origin). */
  com: readonly [number, number, number];
  /** The whole piece's body (−1 once it has broken or burst, or was given up). */
  handle: number;
  parts: LivePart[];
  broken: boolean;
  /** Seconds lain still (asleep). */
  still: number;
  sounds: number;
  dusts: number;
  /** Its kick given (at its release); its burst done (a panel the failure reached). */
  kicked: boolean;
  shattered: boolean;
  /** Looked at once it first lay still: tipped over if it stood on its edge. */
  tipped: boolean;
  /** The last pose written (to skip a still piece's matrices). */
  pose: Float64Array;
  /** Its spawn (pose, tumble) until its body is spawned. */
  spawn: { x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number; wx?: number; wz?: number } | null;
  /** Laid at rest on the ground (the pool never took it): static, still. */
  rested: boolean;
  /** Its body's shape: the plan's, or the box round what it draws when that reaches past it. */
  shape: RigidShape | null;
  /** Its body's extent from its frame's origin along its axes (the grown box's when it has one; null: the plan's). */
  half: [number, number, number] | null;
  /** Times shoved off a rest high past the walls (destruction-slabs 227 round 2: shoved, never laid down out of view);
   *  −1 once looked at at rest where it belongs. */
  shoves: number;
  /** Its body's box [x0, y0, z0, x1, y1, z1] in its frame (the grown box, or the planned boxes' bounds): where it lies is
   *  judged at this box, not at the frame's origin (round 2: a slab's frame sat 2.5 m under the slab it draws). */
  box: number[];
  /** How long it has crept (a roof slab's look waits for this or for sleep, not for sleep alone). */
  slowS: number;
  /** Times tipped over again, found standing on its edge past the walls (round 2; round 3: counted on a tip made, a sheet
   *  found lying is looked at again once it is knocked onto its edge). */
  retipped: number;
}

interface LiveCollapse {
  structureIdx: number;
  plan: CollapsePlan;
  yaw: number;
  seam: StructureDamageSeam;
  event: CollapseBodiesEvent;
  t0: number;
  pieces: LivePiece[];
  remnant: THREE.Mesh[];
  stubs: CollisionRecord[];
  mound: RubbleMound | null;
  /** The mound as a stamp (its crown once: the ground under the pieces samples it every step while it rises). */
  stamp: RubbleStamp | null;
  /** The mound's world box (wake its sleepers while it rises). */
  box: [number, number, number, number];
  lastSoundS: number;
  lastDustS: number;
  baked: THREE.Mesh[];
  done: boolean;
  /** The pieces whose bodies are not spawned yet (spread over the updates after it, each before its release). */
  spawnQueue: LivePiece[];
  /** A roof's fall (sections on): no remnant, no stubs; the building stands round it. */
  partial: boolean;
}

/** The heap rises under the pieces from this long after the collapse to this (s). */
const RISE_FROM_S = 0.7;
const RISE_TO_S = 3.4;
/** A collapse whose pieces have all lain still this long is baked; one this old whose pieces only creep (under these
 *  speeds: a slab easing on a wedge) is too; any collapse this old is. */
const BAKE_STILL_S = 1.2;
const BAKE_SLOW_AGE_S = 4.5;
const SLOW_MPS = 0.3;
const SLOW_RADS = 0.5;
const BAKE_AGE_S = 40;
/** Landings heard: at most one a collapse every this long, and this many a piece. */
const SOUND_GAP_S = 0.07;
const SOUNDS_PER_PIECE = 3;
/** Landings that kick dust: this many a piece, one a collapse every this long. */
const DUSTS_PER_PIECE = 3;
const DUST_GAP_S = 0.05;
/** A panel cracks into its parts on a landing this hard (a fall from 0.6 m), while the pool has fewer bodies awake than
 *  this (a step costs ~0.016 ms an awake body; at most four steps a frame). */
const BREAK_MPS = 3.4;
// (the coordinator's budget test, 2026-10-11) back to wave 397's: under 56 a busy house kept its panels whole
// (2026-10-15, integ/226's engine without the box manifold: a step costs its awake bodies' contacts) back under 56
const BREAK_AWAKE_MAX = 56;
/** (dcore 2026-10-11, waves 385/388a: "the roof lies as one flat intact lid"; "the tower lands whole") a roof slab
 *  cracks on any real landing, whatever else is awake, and a shaft breaks into its drums at its first touch of the
 *  ground once it leans this far (rad): the impact report alone missed both. */
const ROOF_BREAK_MPS = 2;
const SHAFT_BREAK_TILT = 0.6;
/** What a break adds to each part's own motion: a drum's tumble and sideways scatter, a roof sheet's buckle (rad/s,
 *  m/s), so the parts never lie on in a neat row or one plane. */
// (wave 401: "boxes that tumble and bounce like toy blocks") a drum's own tumble is a little under the fall's
const DRUM_SPIN = 1.0, DRUM_SCATTER = 2.6, DRUM_YAW = 1.8, ROOF_SPIN = 1.7, ROOF_SAG = 0.6;
/** A shaft's broken section's horizontal speed off the break at most (m/s). */
const DRUM_THROW_MAX = 4.5;
/** The share of a cracking piece's spin its parts keep (the physics lane's: a break costs energy). */
const CRACK_KEEP = 0.7;
/** A slab at rest counts as standing on its edge when it reaches this many times its half thickness up (a door, a sheet,
 *  an infill panel; a thick brick chunk standing on its own end is left as it lies); the shove that tips it over (m/s at
 *  its top across its thin side, times its mass). */
const STAND_TALL = 3, STAND_TIP_MPS = 1.2;
/** boxMiddle's and boxHalf's answers (one each, reused). */
/**
 * (destruction-slabs 227 round 4) A roof body at rest is perched — it breaks up where it lies — when its underside stands
 * PERCH_LIFT_M or more over the ground and either PERCH_SHARE or more of it has nothing under it within PERCH_BAND_M (the
 * ground, a solid record or floor, another body), or it stands steep (its thin axis within PERCH_STEEP of level) with its
 * middle PERCH_STEEP_LIFT_M up. (The detector flags 40 % over nothing a metre up: the runtime breaks up sooner.)
 */
const PERCH_LIFT_M = 0.9, PERCH_SHARE = 0.3, PERCH_BAND_M = 0.8, PERCH_STEEP = 0.57, PERCH_STEEP_LIFT_M = 1.5;
/** A sample under a slab counts another body's contact sphere as holding it within this plan distance (m). */
const PERCH_NEAR_M = 0.45;
/** A drawn mesh of a roof body judged for its perch draws this much or more (the detector's slab: 8 m² and more). */
const PERCH_PLATE_M2 = 4;
const _boxMid: [number, number] = [0, 0];
const _boxHalf = [0, 0, 0];
/** panelsStanding's body frame (one, reused: it runs each frame of a collapse's first 40 s). */
const panelFrame = { c: 1, s: 0, x: 0, z: 0 };
/** Times a panel found on its edge past the walls is tipped over again (round 3: counted on a tip made). */
const PANEL_TIPS = 2;
/** Whether half extents are a panel's: its least under 0.35 m, its middle over 0.75 m (no copy, no sort: per frame). */
function isPanel(h: readonly number[]): boolean {
  const a = h[0]!, b = h[1]!, c = h[2]!;
  const lo = Math.min(a, b, c), hi = Math.max(a, b, c), mid = a + b + c - lo - hi;
  return lo <= 0.35 && mid >= 0.75;
}
/** Whether a world point lies past the ground storey's drawn walls (body frame `f`: frameOf). */
function pastWalls(a: StructureDamageAnatomy, f: { c: number; s: number; x: number; z: number }, x: number, z: number): boolean {
  const bx = (x - f.x) * f.c - (z - f.z) * f.s, bz = (x - f.x) * f.s + (z - f.z) * f.c;
  return enclosedAt(a, bx, bz, 0.3, 0) === false;
}

/** A deterministic hash of three integers to [0, 1) (the presentation's own: a break looks the same on every client). */
function hash01(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x165667b1, 0x85ebca6b) ^ Math.imul((c | 0) + 0x9e3779b9, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const CAP_UV_DENSITY = 0.55;
/** Triangles a preparation takes at a time, and the cuts kept laid at most. */
const PREPARE_CHUNK = 192;
const PREPARED_MAX = 8;
/** Triangles an update: a cut laid ahead (in the background), and one a collapse waits for (it stands in its dust). */
const PREPARE_TRIS = 900;
const PREPARE_WAITING = 6000;
/** Geometries an update builds from a laid cut: in the background, and for a waiting collapse. */
const BUILD_LISTS = 6;
const BUILD_WAITING = 48;
/** A collapse waits for its cut this long at most (fx s), then finishes it at once. */
const WAIT_MAX_S = 0.33;
/** Bodies an update spawns of a collapse's pieces (the first, and those due within RELEASE_SOON_S, at once). */
const SPAWNS_PER_UPDATE = 4;
const RELEASE_SOON_S = 0.1;
/** Panels an update cracks into their parts (each spawns two to nine): the rest wait a frame, still whole. */
const BREAKS_PER_UPDATE = 2;
/** A piece still outside the world this long past its release (the pool full of moving bodies) is given up: it bursts
 *  (a wall panel) or lies at rest on the ground, never standing in the air. */
const REFUSED_GRACE_S = 0.12;


/** An attribute a source lacks, as the material would read it absent: a colour and the weathering's tint and shade
 *  white, anything else 0. */
function neutral(name: string): number {
  return name === 'color' || name === 'tint' || name === 'shade' ? 1 : 0;
}

export function createCollapseBodies(o: CollapseBodiesOptions): CollapseBodies {
  const pool = o.pool;
  const prepareTris = Math.max(PREPARE_CHUNK, o.prepareTris ?? PREPARE_TRIS);
  const live: LiveCollapse[] = [];
  const byHandle = new Map<number, { c: LiveCollapse; p: LivePiece; part: number }>();
  const prepared = new Map<number, Prepared>();
  /** Structures whose records do not stand in their own pieces' way. */
  const falling = new Set<number>();
  const stubRecords_: CollisionRecord[] = [];
  /** Sections on: the upper floors still standing in a building whose pieces fall inside it, by structure. */
  const floors = new Map<number, Array<{ storey: number; record: CollisionRecord }>>();
  /** Panels to crack (a collapse, a piece, by twos: no record a crack). */
  const breaking: Array<LiveCollapse | LivePiece> = [];
  /** Collapses waiting for their cut (felled before it was laid): finished a little an update, then brought down. */
  const waiting: Array<{ seam: StructureDamageSeam; e: CollapseBodiesEvent; resolve: (bucket: string) => THREE.Material | null;
    ready: (() => void) | undefined; since: number; job: Prepared }> = [];
  let clockS = 0;
  /** The waiting collapses' clock (it runs while nothing is live). */
  let clockWait = 0;
  let bakedCount = 0;
  let wakeTimer = 0;
  let touch = 0;
  const pose = new Float64Array(7);
  const impulse = new Float64Array(6);
  const vel = new Float64Array(6);
  let shatterHandler: CollapseShatterHandler | null = null;
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _m = new THREE.Matrix4();
  const _o = new THREE.Vector3(), _w = new THREE.Vector3();
  const _hq = new THREE.Quaternion(), _hv = new THREE.Vector3();
  const hullList: WreckTurretTank[] = [];
  const layouts = new WeakMap<THREE.BufferGeometry, Layout>();

  // what the bodies meet: the world's records (the falling buildings' own skipped), the remnants' stubs, the standing
  // upper floors of a building falling inside itself, and the ground as drawn less the heaps still rising under their
  // pieces
  let base: RigidEnvironment | null = null;
  const env: RigidEnvironment = {
    groundAt(x, z) {
      let g = o.groundAt(x, z);
      for (let i = 0; i < live.length; i++) {
        const c = live[i];
        if (!c.stamp || c.partial) continue;
        const t = clockS - c.t0;
        if (t >= RISE_TO_S) continue;
        if (x < c.box[0] || x > c.box[2] || z < c.box[1] || z > c.box[3]) continue;
        const k = t <= RISE_FROM_S ? 0 : (t - RISE_FROM_S) / (RISE_TO_S - RISE_FROM_S);
        g -= (1 - k * k * (3 - 2 * k)) * rubbleProfile(c.stamp, x, z);
      }
      return g;
    },
    queryStatic(minX, minZ, maxX, maxZ, out) {
      out.length = 0;
      if (base?.queryStatic) base.queryStatic(minX, minZ, maxX, maxZ, out);
      for (let i = 0; i < stubRecords_.length; i++) {
        const r = stubRecords_[i];
        if (r.max[0] < minX || r.min[0] > maxX || r.max[2] < minZ || r.min[2] > maxZ) continue;
        out.push(r);
      }
      if (floors.size) for (const list of floors.values()) for (let i = 0; i < list.length; i++) {
        const r = list[i].record;
        if (r.max[0] < minX || r.min[0] > maxX || r.max[2] < minZ || r.min[2] > maxZ) continue;
        out.push(r);
      }
      return out;
    },
    isSolid(record) {
      if (record.structureIdx !== undefined && falling.has(record.structureIdx) && (record as { kind?: string }).kind !== 'floor') return false;
      return base?.isSolid ? base.isSolid(record) : !record.crushed && !record.dead;
    },
  };
  let bound = false;
  const bind = (): void => {
    const next = o.environment();
    if (next !== base || !bound) { base = next; pool.bind(env); bound = true; }
  };

  pool.onImpact((x, y, z, speed, mass, handle) => {
    const hit = byHandle.get(handle);
    if (!hit) return;
    const { c, p } = hit;
    // a shaft leaning over breaks into its drums at its first touch, however soft the report
    if (!p.broken && p.piece.kind === 'drum' && hit.part < 0 && p.parts.length > 1 && leanOf(p.handle) > SHAFT_BREAK_TILT) {
      p.broken = true;
      breaking.push(c, p);
    }
    if (!(speed >= 2.2) && p.piece.kind !== 'roof') return;
    // a panel landing hard cracks into its parts (after this step: no body is spawned inside the pool's report)
    // (a busy pool — a barrage's collapses at once — keeps its panels whole: each crack adds bodies to step; a roof's
    // sheets crack whatever else is awake)
    const roof = p.piece.kind === 'roof';
    // (destruction-slabs 227 round 3, the visual critic: a tavern's roof came down onto its top floor whole and lay there as
    // one flat dark lid over the storey) a roof's fall onto a floor cracks into its sheets at its first touch however soft
    if (!p.broken && p.parts.length > 1 && hit.part < 0
      && (roof ? speed >= ROOF_BREAK_MPS || (c.partial && speed >= 0.6) : speed >= BREAK_MPS && pool.world.awakeCount < BREAK_AWAKE_MAX)) {
      p.broken = true;
      breaking.push(c, p);
    }
    if (!(speed >= 2.2)) return;
    // (dcore 2026-10-11, the decisive wave: a shaft's drums landed in silence after its first three) a broken-off part
    // kicks its own dust, twice at most; a whole piece three times
    const part = hit.part >= 0 ? p.parts[hit.part] : null;
    if ((part ? part.dusts < 2 : p.dusts < DUSTS_PER_PIECE) && clockS - c.lastDustS >= DUST_GAP_S) {
      if (part) part.dusts++; else p.dusts++;
      c.lastDustS = clockS;
      o.onLanding?.(x, y, z, speed, mass, c.structureIdx);
    }
    if (p.sounds >= SOUNDS_PER_PIECE || clockS - c.lastSoundS < SOUND_GAP_S) return;
    p.sounds++;
    c.lastSoundS = clockS;
    emitDebrisLanding(x, y, z, speed, mass);
  });
  pool.onEvict((handle, final) => {
    const hit = byHandle.get(handle);
    if (!hit) return;
    // a sleeper the pool gave up: it lies where it came to rest, static
    byHandle.delete(handle);
    if (hit.part < 0) { writeWhole(hit.p, final); hit.p.handle = -1; } else { writePart(hit.p.parts[hit.part], final); hit.p.parts[hit.part].handle = -1; }
  });

  function layoutOf(geometry: THREE.BufferGeometry): Layout {
    let layout = layouts.get(geometry);
    if (layout) return layout;
    const names: string[] = [], sizes: number[] = [];
    for (const [name, attr] of Object.entries(geometry.attributes)) {
      if (name === 'position' || name === 'normal' || name === 'aDamage' || name === 'batchId') continue;
      names.push(name);
      sizes.push((attr as THREE.BufferAttribute).itemSize);
    }
    layout = { names, sizes, stride: 6 + sizes.reduce((a, b) => a + b, 0) };
    layouts.set(geometry, layout);
    return layout;
  }
  /** The union of layouts (a bucket drawn by more than one merge: an attribute one carries and another not). */
  function unionLayout(a: Layout, b: Layout): Layout {
    const names = [...a.names], sizes = [...a.sizes];
    b.names.forEach((name, i) => { if (!names.includes(name)) { names.push(name); sizes.push(b.sizes[i]); } });
    return names.length === a.names.length ? a : { names, sizes, stride: 6 + sizes.reduce((x, y) => x + y, 0) };
  }

  const _lean = new Float64Array(7);
  const _l = new THREE.Vector3();
  /** How far a whole piece leans from upright (rad: its body's up axis against the world's). */
  function leanOf(handle: number): number {
    if (!pool.framePoseAt(handle, _lean)) return 0;
    const qx = _lean[3], qz = _lean[5];
    // the body's +y in the world: its y component is 1 - 2(qx² + qz²)
    return Math.acos(Math.max(-1, Math.min(1, 1 - 2 * (qx * qx + qz * qz))));
  }
  /** A leaning shaft's lowest part over the ground (its drums but the one on the stump): within a hand of it, it has
   *  touched down (the pose is the body's, the parts glued in it). */
  function shaftTouches(p: LivePiece, src: ArrayLike<number>): boolean {
    _q.set(src[3], src[4], src[5], src[6]);
    const upY = 1 - 2 * (src[3] * src[3] + src[5] * src[5]);
    const side = Math.sqrt(Math.max(0, 1 - upY * upY));
    for (let k = 1; k < p.piece.parts.length; k++) {
      const spec = p.piece.parts[k];
      _o.set(spec.center[0], spec.center[1], spec.center[2]).applyQuaternion(_q);
      const x = src[0] + _o.x, y = src[1] + _o.y, z = src[2] + _o.z;
      const reach = Math.abs(upY) * spec.half[1] + side * Math.max(spec.half[0], spec.half[2]);
      if (y - reach - env.groundAt(x, z) < 0.25) return true;
    }
    return false;
  }

  /** A glued piece's pose onto all its parts' meshes. */
  function writeWhole(p: LivePiece, src: ArrayLike<number>): void {
    let same = true;
    for (let k = 0; k < 7; k++) if (p.pose[k] !== src[k]) { same = false; p.pose[k] = src[k]; }
    if (same) return;
    _p.set(src[0], src[1], src[2]);
    _q.set(src[3], src[4], src[5], src[6]);
    _m.compose(_p, _q, _s);
    for (let i = 0; i < p.parts.length; i++) {
      const part = p.parts[i];
      for (let j = 0; j < part.meshes.length; j++) {
        const mesh = part.meshes[j];
        mesh.matrix.copy(_m);
        if (part.offsetM) mesh.matrix.multiply(part.offsetM);
        mesh.matrixWorldNeedsUpdate = true;
      }
    }
  }
  /** A broken-off part's own pose onto its meshes. */
  function writePart(part: LivePart, src: ArrayLike<number>): void {
    let same = true;
    for (let k = 0; k < 7; k++) if (part.pose[k] !== src[k]) { same = false; part.pose[k] = src[k]; }
    if (same) return;
    _p.set(src[0], src[1], src[2]);
    _q.set(src[3], src[4], src[5], src[6]);
    for (let j = 0; j < part.meshes.length; j++) { const mesh = part.meshes[j]; mesh.matrix.compose(_p, _q, _s); mesh.matrixWorldNeedsUpdate = true; }
  }

  /** A cap quad's two triangles into a material's list (its layout: uv and colour where it has them, 0 elsewhere; then
   *  the cut's triangle number, −1). */
  function pushCap(list: number[], layout: Layout, cap: CapQuad): void {
    const [a, b, c, d] = cap.corners;
    const n = cap.n;
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    const uvOf = (p: readonly number[]): [number, number] => (ax >= ay && ax >= az ? [p[2] * CAP_UV_DENSITY, p[1] * CAP_UV_DENSITY]
      : ay >= az ? [p[0] * CAP_UV_DENSITY, p[2] * CAP_UV_DENSITY] : [p[0] * CAP_UV_DENSITY, p[1] * CAP_UV_DENSITY]);
    const tint = cap.slot.tint, k = cap.shade;
    const vert = (p: readonly number[]): void => {
      list.push(p[0], p[1], p[2], n[0], n[1], n[2]);
      for (let i = 0; i < layout.names.length; i++) {
        const name = layout.names[i], size = layout.sizes[i];
        if (name === 'uv') { const uv = uvOf(p); list.push(uv[0], uv[1]); for (let j = 2; j < size; j++) list.push(0); }
        else if (name === 'color') { list.push(tint[0] * k, tint[1] * k, tint[2] * k); for (let j = 3; j < size; j++) list.push(1); }
        else for (let j = 0; j < size; j++) list.push(neutral(name));
      }
      // (no triangle of the cut's: a cap is never dead)
      list.push(-1);
    };
    // each half wound to face n
    const tri = (p: readonly number[], q: readonly number[], r: readonly number[]): void => {
      const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], wx = r[0] - p[0], wy = r[1] - p[1], wz = r[2] - p[2];
      const facing = (uy * wz - uz * wy) * n[0] + (uz * wx - ux * wz) * n[1] + (ux * wy - uy * wx) * n[2] >= 0;
      if (facing) { vert(p); vert(q); vert(r); } else { vert(p); vert(r); vert(q); }
    };
    tri(a, b, c);
    tri(a, c, d);
  }

  /** The body frame of a building (world → body: the inverse of rotateY(yaw) then translate). */
  function frameOf(anatomy: StructureDamageAnatomy): { c: number; s: number; x: number; y: number; z: number } {
    const { placement } = anatomy;
    return { c: Math.cos(placement.yaw), s: Math.sin(placement.yaw), x: placement.x, y: placement.y, z: placement.z };
  }

  /** A building's sources into their material's groups (each layout the union of its sources' before any is cut). */
  function addSources(job: Prepared, sources: Source[], runs: boolean): void {
    for (const src of sources) {
      const layout = layoutOf(src.geometry);
      const g = job.groups.get(src.material);
      if (!g) job.groups.set(src.material, { material: src.material, layout, lists: new Map(), runLists: new Map(), capLists: new Map() });
      else if (g.lists.size === 0 && g.runLists.size === 0) g.layout = unionLayout(g.layout, layout);
      if (runs) job.runs.push(src);
      else { src.tri0 = job.spanTris; job.spanTris += Math.floor(src.count / 3); job.sources.push(src); }
    }
  }
  /** The standing runs and redrawn faces as sources (world matrices; indexed runs expanded, disposed once cut). */
  function runSources(job: Prepared, standing: readonly THREE.Mesh[]): Source[] {
    const runs: Source[] = [];
    for (const run of standing) {
      const geometry = run.geometry as THREE.BufferGeometry;
      if (!geometry?.getAttribute || Array.isArray(run.material) || !run.visible) continue;
      run.updateWorldMatrix(true, false);
      const flat = geometry.getIndex() ? geometry.toNonIndexed() : geometry;
      if (flat !== geometry) job.expanded.push(flat);
      runs.push({ geometry: flat, material: run.material as THREE.Material, first: 0, count: flat.getAttribute('position').count,
        world: run.matrixWorld.clone(), span: null, tri0: -1 });
    }
    return runs;
  }

  /** The soup a chunk is read into (grown, never shrunk: no array a chunk). */
  let soupBuf = new Float64Array(PREPARE_CHUNK * 3 * 24);
  const _cv = new THREE.Vector3(), _cn = new THREE.Vector3(), _nm = new THREE.Matrix3();
  /** Cut `count` triangles of a source from `tri` on into the job's lists (a run's into its run lists). */
  function cutChunk(job: Prepared, src: Source, tri: number, count: number): void {
    const g = job.groups.get(src.material)!;
    const layout = g.layout, S = layout.stride + 1;
    const geometry = src.geometry;
    const f = frameOf(job.seam.anatomy);
    const pos = geometry.getAttribute('position'), nrm = geometry.getAttribute('normal');
    const attrs = layout.names.map((name) => (geometry.getAttribute(name) as THREE.BufferAttribute | undefined) ?? null);
    if (soupBuf.length < count * 3 * S) soupBuf = new Float64Array(count * 3 * S * 2);
    const soup = soupBuf;
    if (src.world) _nm.getNormalMatrix(src.world);
    // a roof-only cut (sections on) keeps what reaches over the eaves
    const eave = job.roofOnly ? job.plan.eaveY - 0.4 : -Infinity;
    let kept = 0;
    for (let t = 0; t < count; t++) {
      const o2t = kept * 3 * S;
      let top = -Infinity;
      const tid = src.tri0 >= 0 ? src.tri0 + tri + t : -1;
      for (let k = 0; k < 3; k++) {
        const at = src.first + (tri + t) * 3 + k, o2 = o2t + k * S;
        _cv.set(pos.getX(at), pos.getY(at), pos.getZ(at));
        if (src.world) _cv.applyMatrix4(src.world);
        if (nrm) { _cn.set(nrm.getX(at), nrm.getY(at), nrm.getZ(at)); if (src.world) _cn.applyMatrix3(_nm).normalize(); } else _cn.set(0, 1, 0);
        const dx = _cv.x - f.x, dz = _cv.z - f.z;
        soup[o2] = dx * f.c - dz * f.s; soup[o2 + 1] = _cv.y - f.y; soup[o2 + 2] = dx * f.s + dz * f.c;
        if (soup[o2 + 1] > top) top = soup[o2 + 1];
        soup[o2 + 3] = _cn.x * f.c - _cn.z * f.s; soup[o2 + 4] = _cn.y; soup[o2 + 5] = _cn.x * f.s + _cn.z * f.c;
        let kk = o2 + 6;
        for (let a = 0; a < attrs.length; a++) {
          const attr = attrs[a], size = layout.sizes[a];
          for (let j = 0; j < size; j++) soup[kk++] = attr && j < attr.itemSize ? attr.getComponent(at, j) : neutral(layout.names[a]);
        }
        soup[kk] = tid;
      }
      if (top >= eave) kept++;
    }
    if (!kept) return;
    const parts = partitionTriangles(job.plan, soup.subarray(0, kept * 3 * S), kept, S);
    const lists = src.tri0 >= 0 ? g.lists : g.runLists;
    for (const [key, list] of parts) {
      const into = lists.get(key) as number[] | undefined;
      if (into) for (let i = 0; i < list.length; i++) into.push(list[i]); else lists.set(key, list);
    }
  }

  /** Advance a job by up to `budget` triangles (Infinity: to the end), its spans then its runs; the triangles it took. */
  function advanceJob(job: Prepared, budget: number): number {
    let spent = 0;
    while (!job.spansDone && spent < budget) {
      const src = job.sources[job.source];
      if (!src) { finishSpans(job); break; }
      const tris = Math.floor(src.count / 3);
      const count = Math.min(PREPARE_CHUNK, tris - job.tri, Math.max(1, budget - spent));
      if (count > 0) cutChunk(job, src, job.tri, count);
      job.tri += Math.max(0, count);
      spent += Math.max(1, count);
      if (job.tri >= tris) { job.source++; job.tri = 0; }
    }
    if (!job.spansDone && !job.sources[job.source]) finishSpans(job);
    while (job.spansDone && !job.done && spent < budget) {
      const src = job.runs[job.run];
      if (!src) break;
      const tris = Math.floor(src.count / 3);
      const count = Math.min(PREPARE_CHUNK, tris - job.runTri, Math.max(1, budget - spent));
      if (count > 0) cutChunk(job, src, job.runTri, count);
      job.runTri += Math.max(0, count);
      spent += Math.max(1, count);
      if (job.runTri >= tris) { job.run++; job.runTri = 0; }
    }
    if (job.spansDone && !job.runs[job.run]) {
      job.done = true;
      if (job.expanded.length) { for (const g of job.expanded) g.dispose(); job.expanded.length = 0; }
    }
    return spent;
  }
  /** The spans are cut: their lists kept typed (half the memory, and nothing a build appends to them). */
  function finishSpans(job: Prepared): void {
    job.spansDone = true;
    for (const g of job.groups.values()) for (const [key, list] of g.lists) if (Array.isArray(list)) g.lists.set(key, Float32Array.from(list));
  }
  /** The building's version moved: its runs are cut again (its spans' cut holds), its geometries built again. */
  function restartRuns(job: Prepared, standing: readonly THREE.Mesh[], version: number): void {
    for (const g of job.groups.values()) g.runLists.clear();
    for (const g of job.expanded) g.dispose();
    job.expanded.length = 0;
    job.runs = [];
    addSources(job, runSources(job, standing), true);
    job.run = 0; job.runTri = 0;
    job.done = false;
    job.version = version;
    disposeBuilt(job);
  }

  function newJob(seam: StructureDamageSeam, resolve: (bucket: string) => THREE.Material | null, standing: readonly THREE.Mesh[],
    version: number, roofOnly: boolean): Prepared | null {
    const anatomy = seam.anatomy;
    if (!anatomy.storeys.length || !seam.spans.length) return null;
    // the cut does not depend on the blow: a neutral one
    const plan = planCollapsePieces(anatomy, { cause: null, dirX: 0, dirZ: 0, point: null }, { cap: o.cap });
    const job: Prepared = { structureIdx: seam.structureIdx, seam, plan, groups: new Map(), sources: [], source: 0, tri: 0,
      runs: [], run: 0, runTri: 0, spansDone: false, spanTris: 0, dead: null, done: false,
      touched: ++touch, resolve, built: null, queue: null, version, used: new Set(), roofOnly, expanded: [] };
    const sources: Source[] = [];
    for (const span of seam.spans) {
      const geometry = (span.mesh as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      if (!geometry?.getAttribute) continue;
      const material = resolve(span.bucket);
      if (!material) continue;
      // the merged buckets are in world space (identity matrices under the world root)
      sources.push({ geometry, material, first: span.first, count: span.count, world: null, span, tri0: 0 });
    }
    addSources(job, sources, false);
    if (standing.length) addSources(job, runSources(job, standing), true);
    return job;
  }
  function jobFor(seam: StructureDamageSeam, resolve: (bucket: string) => THREE.Material | null, standing: readonly THREE.Mesh[] = [],
    version = 0, roofOnly = false): Prepared | null {
    const existing = prepared.get(seam.structureIdx);
    if (existing && existing.roofOnly === roofOnly) {
      existing.touched = ++touch;
      // (another version: its runs again, its spans' cut kept)
      if (existing.version !== version) restartRuns(existing, standing, version);
      return existing;
    }
    if (existing) { prepared.delete(seam.structureIdx); disposeJob(existing); }
    const job = newJob(seam, resolve, standing, version, roofOnly);
    if (!job) return null;
    // a cut never used gives way to a newer one
    if (prepared.size >= PREPARED_MAX) {
      let oldest: Prepared | null = null;
      for (const j of prepared.values()) if (!oldest || j.touched < oldest.touched) oldest = j;
      if (oldest) { prepared.delete(oldest.structureIdx); disposeJob(oldest); }
    }
    prepared.set(seam.structureIdx, job);
    return job;
  }

  /** A laid cut's caps: each piece's (each part's) broken edges and back, the remnant's broken tops, in their slots'
   *  materials (laid again at each build into the caps' lists). */
  function addCaps(job: Prepared): void {
    const plan = job.plan, groups = job.groups;
    const defaultLayout: Layout = { names: ['uv', 'color'], sizes: [2, 3], stride: 11 };
    for (const g of groups.values()) g.capLists.clear();
    const capInto = (key: number, cap: CapQuad): void => {
      const material = job.resolve(cap.slot.bucket);
      let g = material ? groups.get(material) : groups.values().next().value as Group | undefined;
      if (!g && material) { g = { material, layout: defaultLayout, lists: new Map(), runLists: new Map(), capLists: new Map() }; groups.set(material, g); }
      if (!g) return;
      let list = g.capLists.get(key);
      if (!list) { list = []; g.capLists.set(key, list); }
      pushCap(list, g.layout, cap);
    };
    for (const piece of plan.pieces) {
      if (job.roofOnly && !ridesRoof(job.plan, piece.index)) continue;
      for (const cap of capPiece(plan, piece)) capInto(piece.index * PART_STRIDE + (cap.part ?? 0), cap);
    }
    if (!job.roofOnly) for (const cap of capStubs(plan)) capInto(STATIC_PIECE, cap);
  }
  /** The spans' triangles flattened out of their buckets since they were cut (their faces drawn by the wall fracture now,
   *  a damaged stage's glass): left out of the build. */
  function deadTriangles(job: Prepared): Uint8Array {
    const dead = job.dead && job.dead.length === job.spanTris ? job.dead : new Uint8Array(job.spanTris);
    dead.fill(0);
    for (const src of job.sources) {
      const arr = (src.span?.position?.array ?? src.geometry.getAttribute('position').array) as Float32Array;
      const n = Math.floor(src.count / 3);
      for (let t = 0; t < n; t++) {
        const i = (src.first + t * 3) * 3;
        if (arr[i] === arr[i + 3] && arr[i + 1] === arr[i + 4] && arr[i + 2] === arr[i + 5]
          && arr[i] === arr[i + 6] && arr[i + 1] === arr[i + 7] && arr[i + 2] === arr[i + 8]) dead[src.tri0 + t] = 1;
      }
    }
    job.dead = dead;
    return dead;
  }
  const _v = new THREE.Vector3(), _iq = new THREE.Quaternion();
  /** One key's geometry from its lists (the spans' less their dead triangles, the runs', the caps'): the remnant's in
   *  world space, a piece's part in its own frame. */
  function geometryOfList(job: Prepared, g: Group, key: number): THREE.BufferGeometry {
    const plan = job.plan, layout = g.layout, f = frameOf(job.seam.anatomy), S = layout.stride + 1;
    const dead = job.dead;
    const sources = [g.lists.get(key), g.runLists.get(key), g.capLists.get(key)];
    let verts = 0;
    for (const list of sources) {
      if (!list) continue;
      for (let t = 0; t + 3 * S <= list.length; t += 3 * S) {
        const tid = list[t + S - 1];
        if (!(tid >= 0 && dead && dead[tid])) verts += 3;
      }
    }
    const pos = new Float32Array(verts * 3), nrm = new Float32Array(verts * 3);
    const extra = layout.sizes.map((size) => new Float32Array(verts * size));
    const piece = key >= 0 ? plan.pieces[Math.floor(key / PART_STRIDE)] : null;
    const off = piece ? piece.parts[key % PART_STRIDE]?.center ?? [0, 0, 0] : [0, 0, 0];
    if (piece) _iq.set(-piece.rotation[0], -piece.rotation[1], -piece.rotation[2], piece.rotation[3]);
    let i = 0;
    for (const list of sources) {
      if (!list) continue;
      for (let t = 0; t + 3 * S <= list.length; t += 3 * S) {
        const tid = list[t + S - 1];
        if (tid >= 0 && dead && dead[tid]) continue;
        for (let v = 0; v < 3; v++, i++) {
          const at = t + v * S, o3 = i * 3;
          if (piece) {
            const pc = piece.center;
            _v.set(list[at] - pc[0], list[at + 1] - pc[1], list[at + 2] - pc[2]).applyQuaternion(_iq);
            pos[o3] = _v.x - off[0]; pos[o3 + 1] = _v.y - off[1]; pos[o3 + 2] = _v.z - off[2];
            _v.set(list[at + 3], list[at + 4], list[at + 5]).applyQuaternion(_iq);
            nrm[o3] = _v.x; nrm[o3 + 1] = _v.y; nrm[o3 + 2] = _v.z;
          } else {
            const x = list[at], y = list[at + 1], z = list[at + 2];
            pos[o3] = f.x + x * f.c + z * f.s; pos[o3 + 1] = f.y + y; pos[o3 + 2] = f.z - x * f.s + z * f.c;
            const nx = list[at + 3], ny = list[at + 4], nz = list[at + 5];
            nrm[o3] = nx * f.c + nz * f.s; nrm[o3 + 1] = ny; nrm[o3 + 2] = -nx * f.s + nz * f.c;
          }
          let k = at + 6;
          for (let a = 0; a < layout.sizes.length; a++) {
            const size = layout.sizes[a];
            for (let j = 0; j < size; j++) extra[a][i * size + j] = list[k++];
          }
        }
      }
    }
    // (dcore 2026-10-11, wave 388a: "carton-like sections", "clean, saturated debris") a falling piece wears the grit of
    // its own break: its colour a third of the way to a greyed dust of itself (the remnant keeps the building's)
    const ci = layout.names.indexOf('color');
    if (piece && ci >= 0 && layout.sizes[ci] >= 3) {
      // (wave 407: "clean, saturated single bricks or uniform cubes") each part its own share of grit and its own value
      const hv = hash01(key, plan.pieces.length, 31), hw = hash01(key, plan.pieces.length, 37);
      dustCoat(extra[ci], layout.sizes[ci], 0.26 + 0.24 * hv);
      const value = 0.86 + 0.2 * hw, col = extra[ci], size = layout.sizes[ci];
      for (let q = 0; q + 2 < col.length; q += size) { col[q] *= value; col[q + 1] *= value; col[q + 2] *= value; }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    layout.names.forEach((name, a) => geometry.setAttribute(name, new THREE.BufferAttribute(extra[a], layout.sizes[a])));
    geometry.computeBoundingSphere();
    return geometry;
  }
  /** Build a laid cut's geometries, up to `budget` of them (Infinity: all); its lists are kept (a later version builds
   *  again). The count built (its caps and dead triangles the first). */
  function buildJob(job: Prepared, budget = Infinity, caps = true): number {
    if (!job.queue) {
      if (caps) addCaps(job);
      deadTriangles(job);
      job.built = new Map();
      job.queue = [];
      for (const g of job.groups.values()) {
        const keys = new Set<number>([...g.lists.keys(), ...g.runLists.keys(), ...g.capLists.keys()]);
        for (const key of keys) {
          if (key < STATIC_PIECE) continue;
          // a roof-only cut builds its roof's pieces alone (the rest stands in the world's buckets)
          if (job.roofOnly && (key === STATIC_PIECE || !ridesRoof(job.plan, Math.floor(key / PART_STRIDE)))) continue;
          job.queue.push([g, key]);
        }
      }
    }
    let made = 0;
    while (job.queue.length && made < budget) {
      const [g, key] = job.queue.pop()!;
      const geometry = geometryOfList(job, g, key);
      made++;
      if (!geometry.getAttribute('position').count) { geometry.dispose(); continue; }
      let entry = job.built!.get(key);
      if (!entry) { entry = []; job.built!.set(key, entry); }
      entry.push({ material: g.material, geometry });
    }
    return Math.max(1, made);
  }
  function disposeBuilt(job: Prepared): void {
    if (job.built) for (const list of job.built.values()) for (const { geometry } of list) geometry.dispose();
    job.built = null;
    job.queue = null;
  }
  /** A cut given up whole: its geometries, its expanded runs and its lists. */
  function disposeJob(job: Prepared): void {
    disposeBuilt(job);
    for (const g of job.expanded) g.dispose();
    job.expanded.length = 0;
    job.groups.clear();
  }
  const isReady = (job: Prepared): boolean => job.done && !!job.queue && !job.queue.length;

  function collapse(seam: StructureDamageSeam, e: CollapseBodiesEvent, standing: readonly THREE.Mesh[],
    resolve: (bucket: string) => THREE.Material | null = o.materialFor, ready?: () => void, version = 0): boolean {
    const job = jobFor(seam, resolve, standing, version, false);
    if (!job) return false;
    // a cut of too few pieces (a degenerate building) keeps the scripted collapse; a shaft is one body of its drums (its
    // plan one glued piece: wave cb-3 filmed the scripted topple on both arms while this asked every plan for three)
    const plan = job.plan;
    if (plan.shaft ? !((plan.pieces[0]?.parts.length ?? 0) >= 2) : plan.pieces.length < 3) {
      prepared.delete(seam.structureIdx);
      disposeJob(job);
      return false;
    }
    // its cut laid ahead: down now; felled before: it waits for its cut, a little an update
    if (isReady(job)) { bringDown(job, seam, e); ready?.(); return true; }
    if (!waiting.some((w) => w.seam.structureIdx === seam.structureIdx)) waiting.push({ seam, e: { ...e }, resolve, ready, since: clockWait, job });
    return true;
  }

  /** A collapse's live record (its pieces to come). */
  function liveOf(seam: StructureDamageSeam, e: CollapseBodiesEvent, plan: CollapsePlan, partial: boolean): LiveCollapse {
    const anatomy = seam.anatomy, { placement } = anatomy;
    const mound = partial ? null : anatomy.mound ?? null;
    const reach = mound ? Math.max(mound.hw, mound.hd) + 8 : Math.max(anatomy.w, anatomy.d) / 2 + 8;
    const mx = mound ? mound.cx : placement.x, mz = mound ? mound.cz : placement.z;
    return { structureIdx: anatomy.structureIdx, plan, yaw: placement.yaw, seam, event: { ...e }, t0: clockS, pieces: [],
      remnant: [], stubs: [], mound, stamp: mound ? rubbleStampOf(mound) : null, box: [mx - reach, mz - reach, mx + reach, mz + reach], lastSoundS: -1, lastDustS: -1, baked: [],
      done: false, spawnQueue: [], partial };
  }
  const meshOf = (geo: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = name;
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    o.group.add(mesh);
    return mesh;
  };
  /** A piece's meshes from the cut (its parts' in their frames), standing where it stood; its body spawned now or soon. */
  function addPiece(lc: LiveCollapse, job: Prepared, piece: CollapsePiece, e: CollapseBodiesEvent, now: boolean): void {
    const seam = lc.seam, anatomy = seam.anatomy, { placement } = anatomy;
    const built = job.built!;
    job.used.add(piece.index);
    if (piece.shatterS === 0) {
      shatterHandler?.(seam, piece, e);
      for (let k = 0; k < Math.max(1, piece.parts.length); k++) for (const g of built.get(piece.index * PART_STRIDE + k) ?? []) g.geometry.dispose();
      return;
    }
    const nParts = Math.max(1, piece.parts.length);
    const parts: LivePart[] = [];
    for (let k = 0; k < nParts; k++) {
      const off = piece.parts[k]?.center ?? [0, 0, 0];
      const meshes = (built.get(piece.index * PART_STRIDE + k) ?? [])
        .map(({ material, geometry }) => meshOf(geometry, material, `fx-collapse-${piece.kind}-${anatomy.structureIdx}-${piece.index}.${k}`));
      built.delete(piece.index * PART_STRIDE + k);
      // (the decisive wave's hitch probe: 2400 draw calls at a house's collapse) only a piece with a face of three square
      // metres or more casts its own shadow while it falls (the baked heap casts them all)
      const big = piece.boxes.some((b) => Math.max(4 * b.half[0] * b.half[1], 4 * b.half[1] * b.half[2], 4 * b.half[0] * b.half[2]) >= 3);
      for (const m of meshes) m.castShadow = big;
      const offset = new THREE.Vector3(off[0], off[1], off[2]);
      parts.push({ meshes, offset, offsetM: offset.lengthSq() > 0 ? new THREE.Matrix4().makeTranslation(off[0], off[1], off[2]) : null,
        handle: -1, pose: new Float64Array(7).fill(NaN), dusts: 0, tipped: false, shape: null, box: null, shoves: 0, slowS: 0, retipped: 0 });
    }
    if (!parts.some((pp) => pp.meshes.length)) return;
    // (2026-10-15, the port's receipt: a hip roof's slab, its eave boards and verges past its banded boxes, lay a metre
    // into the ground) a body reaches as far as what it draws: a roof slab's or part's box grown to its triangles
    // (destruction-slabs 227: a tavern's slab body grown 3.7 m under its plane round the gable infill partitioned to it
    // rested on a floor while the slab drew flat over the eaves) it grows in the slab's plane only: along its normal (the
    // piece frame's y) it keeps the planned box, 0.35 m under it and 0.6 m over at most — what a piece draws never sets
    // its thickness
    let shape: RigidShape | null = null;
    let half: [number, number, number] | null = null;
    let shapeBox: number[] | null = null;
    if (piece.kind === 'roof') {
      const whole = boundsOf(parts, false);
      if (whole) clampNormal(whole, piece.boxes);
      // (and a covering drawn over its rafters' plane — over the planned box — gets its body there: a box under what it
      // draws leaves the drawn slab hovering over whatever the box rests on)
      if (whole && (reachesPast(whole, piece.boxes) || fallsShort(whole, piece.boxes))) {
        shape = boxShapeOf(whole, piece.massKg);
        shapeBox = whole;
        half = [Math.max(Math.abs(whole[0]), Math.abs(whole[3])), Math.max(Math.abs(whole[1]), Math.abs(whole[4])), Math.max(Math.abs(whole[2]), Math.abs(whole[5]))];
      }
      parts.forEach((pp, k) => {
        const spec = piece.parts[k];
        if (!spec) return;
        const b = boundsOf([pp], true);
        const own = [{ center: [0, 0, 0], half: spec.half }];
        if (b) clampNormal(b, own);
        if (b && (reachesPast(b, own) || fallsShort(b, own))) { pp.shape = boxShapeOf(b, spec.massKg); pp.box = b; }
      });
    }
    // (destruction-slabs 227) each mesh names the body box it rides in (its own frame): receipts measure what it draws
    // against what it rests on (a slab drawn metres off its body hovers)
    const whole0 = shapeBox;
    for (const pp of parts) {
      const boxes = whole0
        ? [{ c: [(whole0[0] + whole0[3]) / 2 - pp.offset.x, (whole0[1] + whole0[4]) / 2 - pp.offset.y, (whole0[2] + whole0[5]) / 2 - pp.offset.z],
          h: [(whole0[3] - whole0[0]) / 2, (whole0[4] - whole0[1]) / 2, (whole0[5] - whole0[2]) / 2] }]
        : piece.boxes.map((b) => ({ c: [b.center[0] - pp.offset.x, b.center[1] - pp.offset.y, b.center[2] - pp.offset.z], h: [...b.half] }));
      for (const m of pp.meshes) m.userData.bodyBoxes = boxes;
    }
    const spawn = pieceSpawn(piece, placement);
    // (the physics lane, 2026-10-11, wave 409: "a released piece with zero kick, perfectly upright, stays balanced unless
    // something hits it") a piece let go without a shove (a floor, a panel that waits for its support) leaves with a
    // small tumble of its own about a level axis, so nothing balances on an edge
    const [kx, ky, kz] = piece.kick;
    let tumble: { wx: number; wz: number } | null = null;
    if (!(kx * kx + ky * ky + kz * kz > 1e-6)) {
      const a = hash01(anatomy.structureIdx, piece.index, 41) * Math.PI * 2, w = 0.2 + 0.2 * hash01(anatomy.structureIdx, piece.index, 43);
      tumble = { wx: Math.cos(a) * w, wz: Math.sin(a) * w };
    }
    const lp: LivePiece = { piece, com: [0, 0, 0], handle: -1, parts, broken: false, still: 0, sounds: 0, dusts: 0, kicked: false,
      shattered: false, tipped: false, pose: new Float64Array(7).fill(NaN), spawn: { ...spawn, ...(tumble ?? {}) }, rested: false, shape, half,
      shoves: 0, box: shapeBox ?? plannedBox(piece), slowS: 0, retipped: 0 };
    writeWhole(lp, [spawn.x, spawn.y, spawn.z, spawn.qx, spawn.qy, spawn.qz, spawn.qw]);
    lc.pieces.push(lp);
    if (now) spawnBody(lc, lp); else lc.spawnQueue.push(lp);
  }
  /** What a piece's (or a part's) meshes draw, in its frame (`own`: a part's about its own centre) as [x0, y0, z0, x1, y1,
   *  z1]; null for none. */
  function boundsOf(parts: readonly LivePart[], own: boolean): number[] | null {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const pp of parts) for (const m of pp.meshes) {
      const p = m.geometry.getAttribute('position'), a = p.array as Float32Array;
      const ox = own ? 0 : pp.offset.x, oy = own ? 0 : pp.offset.y, oz = own ? 0 : pp.offset.z;
      for (let i = 0; i < p.count * 3; i += 3) {
        const x = a[i] + ox, y = a[i + 1] + oy, z = a[i + 2] + oz;
        if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (z < b[2]) b[2] = z;
        if (x > b[3]) b[3] = x; if (y > b[4]) b[4] = y; if (z > b[5]) b[5] = z;
      }
    }
    return b[3] >= b[0] ? b : null;
  }
  /** Bounds held to the planned boxes along the frame's y (a roof slab's normal): 0.35 m under them, 0.6 m over at most. */
  function clampNormal(b: number[], boxes: ReadonlyArray<{ center: readonly number[]; half: readonly number[] }>): void {
    let lo = Infinity, hi = -Infinity;
    for (const box of boxes) { lo = Math.min(lo, box.center[1] - box.half[1]); hi = Math.max(hi, box.center[1] + box.half[1]); }
    if (!(hi >= lo)) return;
    b[1] = Math.max(b[1], lo - 0.35); b[4] = Math.min(b[4], hi + 0.6);
    if (!(b[4] > b[1] + 0.06)) { b[1] = lo; b[4] = hi; }
  }
  /** Whether what is drawn stands more than 5 cm clear of the boxes' bottom along the frame's y (a slab's normal). */
  function fallsShort(b: number[], boxes: ReadonlyArray<{ center: readonly number[]; half: readonly number[] }>): boolean {
    let lo = Infinity;
    for (const box of boxes) lo = Math.min(lo, box.center[1] - box.half[1]);
    return b[1] > lo + 0.05;
  }
  /** Whether bounds reach more than 5 cm past every box's (in the same frame). */
  function reachesPast(b: number[], boxes: ReadonlyArray<{ center: readonly number[]; half: readonly number[] }>): boolean {
    const u = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const box of boxes) for (let k = 0; k < 3; k++) {
      u[k] = Math.min(u[k], box.center[k] - box.half[k]); u[k + 3] = Math.max(u[k + 3], box.center[k] + box.half[k]);
    }
    for (let k = 0; k < 3; k++) if (b[k] < u[k] - 0.05 || b[k + 3] > u[k + 3] + 0.05) return true;
    return false;
  }
  /** A box body round bounds (its frame's), of a mass. */
  function boxShapeOf(b: number[], massKg: number): RigidShape {
    return createRigidShape([{ kind: 'box', center: [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2],
      half: [Math.max(0.05, (b[3] - b[0]) / 2), Math.max(0.05, (b[4] - b[1]) / 2), Math.max(0.05, (b[5] - b[2]) / 2)], mass: Math.max(20, massKg) }],
    { restitution: 0.14, friction: 0.72, rolling: 0.15, angularDrag: 0.2, forceSleepS: 5, maxSpheres: 24 });
  }
  /** A piece's body (asleep, solid, waiting for its release); the pool refusing it: it bursts or lies at rest. */
  function spawnBody(lc: LiveCollapse, lp: LivePiece): void {
    const sp = lp.spawn;
    if (!sp) return;
    lp.spawn = null;
    const age = clockS - lc.t0;
    const shape = lp.shape ?? pieceShape(lp.piece);
    lp.com = [shape.com[0], shape.com[1], shape.com[2]];
    const handle = pool.spawn(shape, { x: sp.x, y: sp.y, z: sp.z, qx: sp.qx, qy: sp.qy, qz: sp.qz, qw: sp.qw,
      ...(sp.wx !== undefined ? { wx: sp.wx, wz: sp.wz } : {}), asleep: true }, Math.max(0, lp.piece.releaseS - age));
    if (handle < 0) { refusePiece(lc, lp); return; }
    lp.handle = handle;
    byHandle.set(handle, { c: lc, p: lp, part: -1 });
  }
  /**
   * A piece the pool cannot take (a barrage's collapses at once): never left standing where it stood. A wall panel
   * bursts into the kit's pieces where it stands (the program path: they land where their flight meets the ground);
   * anything else lies at rest on the ground under it as drawn, its thin side down, static.
   */
  function refusePiece(lc: LiveCollapse, lp: LivePiece): void {
    if (lp.handle >= 0) { byHandle.delete(lp.handle); pool.release(lp.handle); lp.handle = -1; }
    if (lp.piece.face && shatterHandler) {
      for (const part of lp.parts) { for (const m of part.meshes) { m.removeFromParent(); m.geometry.dispose(); } part.meshes.length = 0; }
      lp.shattered = true;
      shatterHandler(lc.seam, lp.piece, lc.event);
      return;
    }
    restOnGround(lp, lp.pose);
  }
  /**
   * Whether a body at `at` (world pose) with extents `half` (its frame's) lies 1.5 m or more over the ground and a tenth or
   * more of its plan outside the top storey's drawn walls (structureEnclosure: the building's walls and what they enclose).
   */
  function highPastWalls(c: LiveCollapse, at: ArrayLike<number>, box: readonly number[]): boolean {
    const a = c.seam.anatomy;
    // (round 2) at the body's box: its middle over the ground, its plan sampled across it
    _hq.set(at[3], at[4], at[5], at[6]);
    _hv.set((box[0]! + box[3]!) / 2, (box[1]! + box[4]!) / 2, (box[2]! + box[5]!) / 2).applyQuaternion(_hq);
    const mx = at[0] + _hv.x, my = at[1] + _hv.y, mz = at[2] + _hv.z;
    if (!(my - env.groundAt(mx, mz) >= 1.5)) return false;
    // (a standing building's top storey's walls; a fallen one's at the height it lies: a plate up on a stub over a storey
    // drawn smaller than the one under it lies past that storey's walls)
    let band = Math.max(0, a.storeys.length - 1);
    // (a roof fallen onto a standing building judged as a ruin's once the building has fallen under it)
    if (fallenUnder(c)) {
      const y = my - a.placement.y;
      for (let k = 0; k < a.storeys.length; k++) if (y < a.storeys[k]!.y1) { band = k; break; }
    }
    const f = frameOf(a);
    const ly = (box[1]! + box[4]!) / 2;
    let n = 0, out = 0;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      _hv.set(box[0]! + (box[3]! - box[0]!) * (i / 4), ly, box[2]! + (box[5]! - box[2]!) * (j / 4)).applyQuaternion(_hq);
      const wx = at[0] + _hv.x, wz = at[2] + _hv.z, yb = at[1] + _hv.y - a.placement.y;
      const bx = (wx - f.x) * f.c - (wz - f.z) * f.s, bz = (wx - f.x) * f.s + (wz - f.z) * f.c;
      n++;
      // past the walls of its band, or (round 2: a needle tower's one 41 m band took a slab on its podium's plan at 25 m)
      // over a spot where nothing is drawn within a metre and a half of its height (the plan at its height)
      if (enclosedAt(a, bx, bz, 0.3, band) === false || drawnOverAt(a, bx, bz, 1) < yb - 1.5) out++;
    }
    return out >= 0.1 * n;
  }
  /**
   * Whether a roof body at rest (pose `at`, `box` in its frame; `self` its handle) is perched (PERCH_*): the engineering
   * critic's saltwind #0 fishery, round 3 seed 41 — a 7.4 x 4 m slab at rest 1.4 m up over the heap inside the walls, 64 %
   * of it over nothing, which highPastWalls never reads (it is not past the walls); and roof sheets standing on their edges
   * high over the heap. Its underside sampled 4 x 4: each sample held by the ground, a solid record (a floor), or another
   * body's contact sphere under it.
   */
  function perchedAt(at: ArrayLike<number>, box: readonly number[], self: number, meshes: readonly THREE.Mesh[] | null = null): boolean {
    _hq.set(at[3]!, at[4]!, at[5]!, at[6]!);
    let thin = 0;
    for (let k = 1; k < 3; k++) if (box[k + 3]! - box[k]! < box[thin + 3]! - box[thin]!) thin = k;
    _hv.set(thin === 0 ? 1 : 0, thin === 1 ? 1 : 0, thin === 2 ? 1 : 0).applyQuaternion(_hq);
    const upY = _hv.y;
    // steep: its middle high over the ground
    if (Math.abs(upY) < PERCH_STEEP) {
      _hv.set((box[0]! + box[3]!) / 2, (box[1]! + box[4]!) / 2, (box[2]! + box[5]!) / 2).applyQuaternion(_hq);
      const mx = at[0]! + _hv.x, my = at[1]! + _hv.y, mz = at[2]! + _hv.z;
      return my - env.groundAt(mx, mz) >= PERCH_STEEP_LIFT_M;
    }
    // what it draws, mesh by mesh (the detector's reading: each drawn plate's area-weighted samples, its lift its lowest
    // point over the ground at its middle; a covering on its rafters is judged as the covering), else its box's underside
    const selfSlot = pool.slotOf?.(self) ?? -1;
    let any = false;
    if (meshes) for (const m of meshes) {
      const comps = componentsOf(m);
      for (let c = 0; c < comps; c++) {
        if (!drawnSamples(m, c)) continue;
        any = true;
        if (perchedSamples(selfSlot)) return true;
      }
    }
    if (any) return false;
    perchSamples.length = 0;
    pb[0] = Infinity; pb[1] = Infinity; pb[2] = Infinity; pb[3] = -Infinity; pb[4] = -Infinity; pb[5] = -Infinity;
    const ua = thin === 0 ? 1 : 0, va = thin === 2 ? 1 : 2, kc = upY > 0 ? box[thin]! : box[thin + 3]!;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      _perchLocal[thin] = kc;
      _perchLocal[ua] = box[ua]! + (box[ua + 3]! - box[ua]!) * (i + 0.5) / 4;
      _perchLocal[va] = box[va]! + (box[va + 3]! - box[va]!) * (j + 0.5) / 4;
      _hv.set(_perchLocal[0]!, _perchLocal[1]!, _perchLocal[2]!).applyQuaternion(_hq);
      const x = at[0]! + _hv.x, y = at[1]! + _hv.y, z = at[2]! + _hv.z;
      perchSamples.push(x, y, z, 1);
      grow(x, y, z);
    }
    return perchedSamples(selfSlot);
  }
  /** The perch samples' bounds [x0, y0, z0, x1, y1, z1]. */
  const pb = [0, 0, 0, 0, 0, 0];
  function grow(x: number, y: number, z: number): void {
    if (x < pb[0]!) pb[0] = x; if (y < pb[1]!) pb[1] = y; if (z < pb[2]!) pb[2] = z;
    if (x > pb[3]!) pb[3] = x; if (y > pb[4]!) pb[4] = y; if (z > pb[5]!) pb[5] = z;
  }
  /** A drawn mesh's area-weighted samples (world, its matrix) into perchSamples, when it draws PERCH_PLATE_M2 or more. */
  function drawnSamples(m: THREE.Mesh, comp: number): boolean {
    perchSamples.length = 0;
    pb[0] = Infinity; pb[1] = Infinity; pb[2] = Infinity; pb[3] = -Infinity; pb[4] = -Infinity; pb[5] = -Infinity;
    const pos = m.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pos) return false;
    const idx = m.geometry.index;
    const n = idx ? idx.count : pos.count;
    let areaAll = 0;
    for (let t = 0; t + 2 < n; t += 3) {
      if (perchComp[t / 3] !== comp) continue;
      for (let k = 0; k < 3; k++) {
        const v = idx ? idx.getX(t + k) : t + k;
        _pt[k]!.fromBufferAttribute(pos, v).applyMatrix4(m.matrix);
        grow(_pt[k]!.x, _pt[k]!.y, _pt[k]!.z);
      }
      _pe1.subVectors(_pt[1]!, _pt[0]!); _pe2.subVectors(_pt[2]!, _pt[0]!);
      const area = 0.5 * _pv.crossVectors(_pe1, _pe2).length();
      if (!(area > 1e-4)) continue;
      areaAll += area;
      const ks = Math.max(1, Math.min(24, Math.round(area / 0.25)));
      for (let q = 0; q < ks; q++) {
        let u = ((q + 0.5) * 0.618034) % 1, w = ((q + 0.5) * 0.754878) % 1;
        if (u + w > 1) { u = 1 - u; w = 1 - w; }
        perchSamples.push(_pt[0]!.x + _pe1.x * u + _pe2.x * w, _pt[0]!.y + _pe1.y * u + _pe2.y * w, _pt[0]!.z + _pe1.z * u + _pe2.z * w, area / ks);
      }
    }
    return areaAll >= PERCH_PLATE_M2;
  }
  /** A drawn mesh's connected pieces (corners welded at a millimetre): each triangle's piece in perchComp; their count. */
  function componentsOf(m: THREE.Mesh): number {
    const pos = m.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pos) return 0;
    const idx = m.geometry.index;
    const n = Math.floor((idx ? idx.count : pos.count) / 3);
    if (perchParent.length < n) { perchParent = new Int32Array(n * 2); perchComp = new Int32Array(n * 2); }
    for (let t = 0; t < n; t++) perchParent[t] = t;
    const find = (i: number): number => { while (perchParent[i] !== i) { perchParent[i] = perchParent[perchParent[i]!]!; i = perchParent[i]!; } return i; };
    perchWeld.clear();
    for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
      const v = idx ? idx.getX(t * 3 + k) : t * 3 + k;
      const key = `${Math.round(pos.getX(v) * 1000)},${Math.round(pos.getY(v) * 1000)},${Math.round(pos.getZ(v) * 1000)}`;
      const prev = perchWeld.get(key);
      if (prev === undefined) perchWeld.set(key, t);
      else { const a = find(prev), b = find(t); if (a !== b) perchParent[a] = b; }
    }
    perchWeld.clear();
    let count = 0;
    const ids = new Map<number, number>();
    for (let t = 0; t < n; t++) {
      const r = find(t);
      let id = ids.get(r);
      if (id === undefined) { id = count++; ids.set(r, id); }
      perchComp[t] = id;
    }
    return count;
  }
  let perchParent = new Int32Array(0), perchComp = new Int32Array(0);
  const perchWeld = new Map<string, number>();
  /** Whether the samples in perchSamples (bounds pb) are lifted and a share of them over nothing (PERCH_*). */
  function perchedSamples(selfSlot: number): boolean {
    const x0 = pb[0]!, y0 = pb[1]!, z0 = pb[2]!, x1 = pb[3]!, y1 = pb[4]!, z1 = pb[5]!;
    // lifted: its lowest point over the ground at its middle (the detector's lift)
    const lift = y0 - env.groundAt((x0 + x1) / 2, (z0 + z1) / 2);
    if (!(lift >= PERCH_LIFT_M)) return false;
    // what could hold it: the records round it (a live record holds as the detector reads it, the falling building's own
    // standing walls with them), the other bodies' contact spheres round it, in the world frame
    const recs = env.queryStatic ? env.queryStatic(x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, perchRecords) : perchRecords;
    if (!env.queryStatic) recs.length = 0;
    const w = pool.world;
    perchSpheres.length = 0;
    for (let slot = 0; slot < w.capacity; slot++) {
      if (!w.active[slot] || slot === selfSlot) continue;
      const sh = w.shape(slot);
      if (!sh) continue;
      const cx = w.px[slot]!, cy = w.py[slot]!, cz = w.pz[slot]!, r = sh.radius + PERCH_NEAR_M;
      if (cx + r < x0 || cx - r > x1 || cz + r < z0 || cz - r > z1 || cy - sh.radius > y1 + 0.1 || cy + sh.radius < y0 - PERCH_BAND_M) continue;
      _pq.set(w.qx[slot]!, w.qy[slot]!, w.qz[slot]!, w.qw[slot]!);
      for (let k = 0; k < sh.sphereCount; k++) {
        _pv.set(sh.spheres[k * 4]!, sh.spheres[k * 4 + 1]!, sh.spheres[k * 4 + 2]!).applyQuaternion(_pq);
        perchSpheres.push(cx + _pv.x, cy + _pv.y, cz + _pv.z, sh.spheres[k * 4 + 3]!);
      }
    }
    let total = 0, free = 0;
    for (let i = 0; i < perchSamples.length; i += 4) {
      const x = perchSamples[i]!, y = perchSamples[i + 1]!, z = perchSamples[i + 2]!, wt = perchSamples[i + 3]!;
      total += wt;
      if (env.groundAt(x, z) >= y - PERCH_BAND_M) continue;
      let held = false;
      for (let r = 0; r < recs.length && !held; r++) {
        const rec = recs[r]!;
        if (rec.crushed || rec.dead) continue;
        if (rec.max[1] >= y - PERCH_BAND_M && rec.min[1] <= y + 0.05 && x >= rec.min[0] - 0.3 && x <= rec.max[0] + 0.3 && z >= rec.min[2] - 0.3 && z <= rec.max[2] + 0.3) held = true;
      }
      for (let k = 0; k < perchSpheres.length && !held; k += 4) {
        const sx = perchSpheres[k]!, sy = perchSpheres[k + 1]!, sz = perchSpheres[k + 2]!, sr = perchSpheres[k + 3]!;
        if (Math.hypot(sx - x, sz - z) <= PERCH_NEAR_M + sr && sy + sr >= y - PERCH_BAND_M && sy - sr <= y + 0.1) held = true;
      }
      if (!held) free += wt;
    }
    return total > 0 && free >= PERCH_SHARE * total;
  }
  const perchSamples: number[] = [], perchSpheres: number[] = [];
  /** A whole piece's drawn meshes (every part's: a look at a slab, not each frame). */
  function piecesMeshes(p: LivePiece): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const part of p.parts) for (const m of part.meshes) out.push(m);
    return out;
  }
  const _pt = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], _pe1 = new THREE.Vector3(), _pe2 = new THREE.Vector3();
  const perchRecords: CollisionRecord[] = [];
  /** Whether a body (pose `at`, box in its frame) lies flat: its thin axis within 37° of the vertical. */
  function lyingFlat(at: ArrayLike<number>, box: readonly number[]): boolean {
    let thin = 0;
    for (let k = 1; k < 3; k++) if (box[k + 3]! - box[k]! < box[thin + 3]! - box[thin]!) thin = k;
    _hq.set(at[3]!, at[4]!, at[5]!, at[6]!);
    _hv.set(thin === 0 ? 1 : 0, thin === 1 ? 1 : 0, thin === 2 ? 1 : 0).applyQuaternion(_hq);
    return Math.abs(_hv.y) > 0.8;
  }
  const _pq = new THREE.Quaternion(), _pv = new THREE.Vector3(), _perchLocal = [0, 0, 0];
  /** Whether a collapse's building is down (a whole collapse, or a roof's fall onto a building fallen since). */
  function fallenUnder(c: LiveCollapse): boolean {
    return !c.partial || live.some((l) => l.structureIdx === c.structureIdx && !l.partial);
  }
  /**
   * A body at rest high past the walls shoved off it (destruction-slabs 227 round 2): level, away from the building's drawn
   * middle (or toward it: `inward`, into a standing shell), 2.4 m/s with a little lift, at a point over its centre so it
   * tips over the edge it lies across.
   */
  function shoveOff(c: LiveCollapse, handle: number, at: ArrayLike<number>, box: readonly number[], massKg: number, inward: boolean, nth = 1): void {
    const a = c.seam.anatomy, f = frameOf(a);
    const band0 = bandEnclosure(a, 0);
    const sb = band0?.solidBox;
    const [bcx, bcz] = sb && Number.isFinite(sb[0]) ? [(sb[0] + sb[2]) / 2, (sb[1] + sb[3]) / 2] : anatomyCentre(a);
    const mx = f.x + bcx * f.c + bcz * f.s, mz = f.z - bcx * f.s + bcz * f.c;
    _hq.set(at[3], at[4], at[5], at[6]);
    _hv.set((box[0]! + box[3]!) / 2, (box[1]! + box[4]!) / 2, (box[2]! + box[5]!) / 2).applyQuaternion(_hq);
    const px = at[0] + _hv.x, py = at[1] + _hv.y, pz = at[2] + _hv.z;
    let dx = px - mx, dz = pz - mz;
    const l = Math.hypot(dx, dz);
    if (l < 1e-3) { dx = 1; dz = 0; } else { dx /= l; dz /= l; }
    // (into the shell only from over it: a sheet leant on a wall outside goes out, away from it)
    if (inward) {
      const bx = (px - f.x) * f.c - (pz - f.z) * f.s, bz = (px - f.x) * f.s + (pz - f.z) * f.c;
      if (enclosedAt(a, bx, bz, 0.3, Math.max(0, a.storeys.length - 1)) !== false) { dx = -dx; dz = -dz; }
    }
    const thin = Math.min(box[3]! - box[0]!, box[4]! - box[1]!, box[5]! - box[2]!) / 2;
    // (round 2: 2.4 m/s slid a slab 0.4 m on the pile's friction) off its rest with a hop: out at 3.5 m/s (5 the second
    // time) and up at 1.6 m/s, pushed over its middle so it tips over the edge it lies across
    const m = Math.max(1, massKg), lift = Math.min(0.6, Math.max(0.15, thin + 0.1)), v = nth > 1 ? 5 : 3.5;
    pool.impulse(handle, dx * v * m, 1.6 * m, dz * v * m, px, py + lift, pz);
    wakeOver(px, py, pz, box);
  }
  /** Wake whatever rests on a slab at (x, y, z) of `box`'s size that moves or breaks up (baked asleep, it would hang). */
  function wakeOver(x: number, y: number, z: number, box: readonly number[]): void {
    const r = Math.hypot(box[3]! - box[0]!, box[4]! - box[1]!, box[5]! - box[2]!) / 2 + 0.6;
    pool.world.wakeInBox(x - r, y - 0.5, z - r, x + r, y + r + 1, z + r);
  }
  /** A piece (or its parts) laid at rest on the ground under `at` (its pose now), its thinnest side down. */
  function restOnGround(lp: LivePiece, at: ArrayLike<number>): void {
    const half = pieceHalf(lp.piece);
    let thin = 0;
    for (let k = 1; k < 3; k++) if (half[k] < half[thin]) thin = k;
    // its yaw kept (its long side's heading), its thin axis turned up
    _q.set(at[3], at[4], at[5], at[6]);
    const long = thin === 0 ? 2 : 0;
    _l.set(long === 0 ? 1 : 0, 0, long === 2 ? 1 : 0).applyQuaternion(_q);
    const yaw = Math.atan2(_l.x, _l.z);
    _q.setFromAxisAngle(_up, yaw - (long === 0 ? Math.PI / 2 : 0));
    if (thin !== 1) _q.multiply(_tq.setFromAxisAngle(thin === 0 ? _fwd : _right, Math.PI / 2));
    const gx = at[0], gz = at[2];
    const y = env.groundAt(gx, gz) + half[thin] + 0.02;
    _rest[0] = gx; _rest[1] = y; _rest[2] = gz; _rest[3] = _q.x; _rest[4] = _q.y; _rest[5] = _q.z; _rest[6] = _q.w;
    if (lp.broken) for (const part of lp.parts) { if (part.handle < 0) writePart(part, _rest); }
    else writeWhole(lp, _rest);
    lp.rested = true;
    lp.still = BAKE_STILL_S;
  }
  const _up = new THREE.Vector3(0, 1, 0), _fwd = new THREE.Vector3(0, 0, 1), _right = new THREE.Vector3(1, 0, 0), _tq = new THREE.Quaternion();
  const _rest = new Float64Array(7);

  /** The collapse itself, its cut laid: the plan with its blow, the meshes and the bodies. */
  function bringDown(job: Prepared, seam: StructureDamageSeam, e: CollapseBodiesEvent): void {
    const tProf = profStart();
    const anatomy: StructureDamageAnatomy = seam.anatomy;
    bind();
    const f = frameOf(anatomy);
    const { placement } = anatomy;
    const dl = Math.hypot(e.dirX || 0, e.dirZ || 0);
    const bx = (x: number, z: number) => (x - f.x) * f.c - (z - f.z) * f.s, bz = (x: number, z: number) => (x - f.x) * f.s + (z - f.z) * f.c;
    const blow: CollapseBlow = {
      cause: e.cause,
      dirX: dl > 1e-6 ? (e.dirX * f.c - e.dirZ * f.s) / dl : 0,
      dirZ: dl > 1e-6 ? (e.dirX * f.s + e.dirZ * f.c) / dl : 0,
      point: Number.isFinite(e.x) && Number.isFinite(e.z) ? [bx(e.x, e.z), (e.y ?? placement.y) - placement.y, bz(e.x, e.z)] : null,
    };
    // the fall's plan: the same cut as the job's (its own stream), the blow's order and shoves
    const plan = planCollapsePieces(anatomy, blow, { cap: o.cap });
    // the rest of the cut now (a building that fell before its cut was laid)
    advanceJob(job, Infinity);
    buildJob(job);
    prepared.delete(seam.structureIdx);
    const built = job.built!;
    const lc = liveOf(seam, e, plan, false);
    // the remnant: the building's own stubs, piers and plinth where they stood
    for (const { material, geometry } of built.get(STATIC_PIECE) ?? []) {
      const mesh = meshOf(geometry, material, `fx-collapse-remnant-${anatomy.structureIdx}`);
      mesh.matrix.identity();
      lc.remnant.push(mesh);
    }
    built.delete(STATIC_PIECE);
    // the stubs as records (obb prisms, world): the pieces stand and land on them
    for (const record of stubRecords(plan, placement)) { lc.stubs.push(record); stubRecords_.push(record); }
    // the pieces (a roof's that fell already, sections on, are gone); the first and those let go soonest get their
    // bodies now, the rest over the next updates
    for (const piece of plan.pieces) {
      if (job.used.has(piece.index)) continue;
      addPiece(lc, job, piece, e, piece.releaseS <= RELEASE_SOON_S);
    }
    for (const list of built.values()) for (const { geometry } of list) geometry.dispose();
    built.clear();
    falling.add(anatomy.structureIdx);
    floors.delete(anatomy.structureIdx);
    live.push(lc);
    profEnd('cb.bringDown', tProf);
  }

  /** Sections on: the roof's slabs from the cut (the rest of it kept for the building's later falls). */
  function fallRoof(seam: StructureDamageSeam, e: CollapseBodiesEvent, resolve: (bucket: string) => THREE.Material | null = o.materialFor,
    version = 0): boolean {
    // the cut laid ahead when it is of the building as it stands now (its walls' cells since drawn out of the buckets would
    // fall with its roof), else laid now
    const existing = prepared.get(seam.structureIdx);
    const job = existing && existing.version === version ? existing : jobFor(seam, resolve, [], version, true);
    if (!job || !job.plan.roof.length) return false;
    const tProf = profStart();
    bind();
    // finished now if it was not (a roof falls many blows after the building's first damage laid its cut)
    advanceJob(job, Infinity);
    buildJob(job);
    const plan = job.plan;
    const lc = liveOf(seam, e, plan, true);
    let n = 0;
    for (const piece of plan.pieces) {
      if (!ridesRoof(plan, piece.index) || job.used.has(piece.index)) continue;
      addPiece(lc, job, piece, e, n++ < SPAWNS_PER_UPDATE);
    }
    // a roof-only cut serves nothing more (the walls fall as their cells, the collapse lays the pile)
    if (job.roofOnly) { prepared.delete(seam.structureIdx); disposeJob(job); }
    if (!lc.pieces.length) return false;
    falling.add(seam.structureIdx);
    live.push(lc);
    profEnd('cb.fallRoof', tProf);
    return true;
  }

  /**
   * (wave 407: "a timber door or infill panel stays standing upright on its edge at the right of the heap"; wave 409's
   * near barn: a gate panel upright in front of the pile from 3.4 s to the end) a slab that comes to rest standing on its
   * edge is shoved over once, across its thin side at its top: panels lie down on the heap. `half`: its extent from its
   * frame's origin along its own axes. True when it was tipped.
   */
  function tipIfStanding(handle: number, half: readonly number[], massKg: number, salt: number, maxThinY = 0.4): boolean {
    if (!pool.framePoseAt(handle, pose)) return false;
    let thin = 0;
    for (let k = 1; k < 3; k++) if (half[k] < half[thin]) thin = k;
    _q.set(pose[3], pose[4], pose[5], pose[6]);
    _o.set(thin === 0 ? 1 : 0, thin === 1 ? 1 : 0, thin === 2 ? 1 : 0).applyQuaternion(_q);
    // lying: its thin side faces up or down
    if (Math.abs(_o.y) > maxThinY) return false;
    // standing: how high it reaches over its centre (its extents up the world's vertical)
    let up = 0;
    for (let k = 0; k < 3; k++) { _l.set(k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0).applyQuaternion(_q); up += half[k] * Math.abs(_l.y); }
    if (up < STAND_TALL * half[thin]) return false;
    const hl = Math.hypot(_o.x, _o.z) || 1;
    const j = massKg * STAND_TIP_MPS * (hash01(salt, handle, 11) < 0.5 ? -1 : 1) / hl;
    pool.impulse(handle, _o.x * j, 0, _o.z * j, pose[0], pose[1] + up * 0.8, pose[2]);
    return true;
  }
  /**
   * (wave 407: "the roof comes down as big, perfectly flat, unbroken grey corrugated sheets ... nothing bends, folds or
   * tears") a roof sheet cracking off where it struck buckles: it arches along its length away from what it lies on, and
   * one in two folds up along a line across it (10-25 degrees, the line within the middle three fifths). Its drawn shape
   * only: its body stays the sheet's box, so the arch and the fold rise off what it rests on, never into it. `q`: the
   * piece's rotation at the break (which side faces down).
   */
  function buckleSheet(part: LivePart, half: readonly number[], q: THREE.Quaternion, salt: number): void {
    let thin = 0, long = 0;
    for (let k = 1; k < 3; k++) { if (half[k] < half[thin]) thin = k; if (half[k] > half[long]) long = k; }
    if (thin === long) return;
    const L = Math.max(0.3, 2 * half[long]);
    // which way is up for it now: its thin axis in the world (a sheet on edge buckles either way)
    _l.set(thin === 0 ? 1 : 0, thin === 1 ? 1 : 0, thin === 2 ? 1 : 0).applyQuaternion(q);
    const up = Math.abs(_l.y) > 0.3 ? Math.sign(_l.y) : (hash01(salt, 1, 21) < 0.5 ? -1 : 1);
    const arch = up * Math.min(0.3, 0.08 * L) * (0.6 + 0.8 * hash01(salt, 2, 21));
    const fold = hash01(salt, 3, 21) < 0.5;
    const fAt = (hash01(salt, 4, 21) - 0.5) * 0.6 * L;
    const fSide = hash01(salt, 5, 21) < 0.5 ? -1 : 1;
    const fAng = up * (0.17 + 0.27 * hash01(salt, 6, 21));
    for (const m of part.meshes) {
      const pos = m.geometry.getAttribute('position') as THREE.BufferAttribute, nrm = m.geometry.getAttribute('normal') as THREE.BufferAttribute;
      if (!pos || !nrm) continue;
      for (let i = 0; i < pos.count; i++) {
        let pl = pos.getComponent(i, long), pt = pos.getComponent(i, thin);
        let nl = nrm.getComponent(i, long), nt = nrm.getComponent(i, thin);
        // the arch: up in the middle, the ends where they were; the normal turned with its slope
        const u = Math.max(-1, Math.min(1, 2 * pl / L));
        pt += arch * (1 - u * u);
        const a = Math.atan(-arch * 4 * pl / (L * L) * 2);
        let ca = Math.cos(a), sa = Math.sin(a);
        let t0 = nl * ca - nt * sa; nt = nl * sa + nt * ca; nl = t0;
        // the fold: past its line (on its side) the sheet turns up about it
        if (fold && (pl - fAt) * fSide > 0) {
          const d = pl - fAt;
          const g = fAng * fSide;
          ca = Math.cos(g); sa = Math.sin(g);
          t0 = fAt + d * ca - pt * sa; pt = d * sa + pt * ca; pl = t0;
          t0 = nl * ca - nt * sa; nt = nl * sa + nt * ca; nl = t0;
        }
        pos.setComponent(i, long, pl); pos.setComponent(i, thin, pt);
        nrm.setComponent(i, long, nl); nrm.setComponent(i, thin, nt);
      }
      pos.needsUpdate = true; nrm.needsUpdate = true;
      m.geometry.computeBoundingSphere();
    }
  }
  /** A piece's extent from its frame's origin along its axes (over its proxy boxes). */
  /** A piece's planned boxes' bounds in its frame [x0, y0, z0, x1, y1, z1]. */
  function plannedBox(piece: CollapsePiece): number[] {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const x of piece.boxes) for (let k = 0; k < 3; k++) {
      b[k] = Math.min(b[k]!, x.center[k]! - x.half[k]!); b[k + 3] = Math.max(b[k + 3]!, x.center[k]! + x.half[k]!);
    }
    return Number.isFinite(b[0]) ? b : [0, 0, 0, 0, 0, 0];
  }
  function pieceHalf(piece: CollapsePiece): [number, number, number] {
    const h: [number, number, number] = [0, 0, 0];
    for (const b of piece.boxes) for (let k = 0; k < 3; k++) h[k] = Math.max(h[k], Math.abs(b.center[k]) + b.half[k]);
    return h;
  }

  /** A panel's parts each into its own body: at their places on the panel now, with the panel's motion there. */
  function breakApart(c: LiveCollapse, p: LivePiece): void {
    if (p.handle < 0) return;
    const kind = p.piece.kind;
    const keen = kind === 'drum' || kind === 'roof';
    // room for its parts (sleepers give way; awake bodies do not): a panel without it stays whole rather than lose parts
    const capacity = (pool.world as { capacity?: number }).capacity ?? 128;
    if (!keen && capacity - pool.world.awakeCount + 1 < p.parts.length) { p.broken = false; return; }
    pool.framePoseAt(p.handle, pose);
    pool.velocity(p.handle, vel);
    byHandle.delete(p.handle);
    pool.release(p.handle);
    p.handle = -1;
    _q.set(pose[3], pose[4], pose[5], pose[6]);
    _w.set(vel[3], vel[4], vel[5]);
    // the shaft's axis in the world (a drum's scatter is across it)
    _p.set(0, 1, 0).applyQuaternion(_q);
    const ax = _p.x, az = _p.z, al = Math.hypot(ax, az) || 1;
    const sx = -az / al, sz = ax / al;
    const sid = c.structureIdx, pid = p.piece.index;
    for (let k = 0; k < p.parts.length; k++) {
      const part = p.parts[k], spec = p.piece.parts[k];
      if (!spec || !part.meshes.length) continue;
      _o.copy(part.offset).applyQuaternion(_q);
      // (the physics lane, 2026-10-11) v at the part = v + K w × r, r from the body's centre of mass (pool.velocity is the
      // centre's), and the break spends a share of the spin (K): the parts never whip off at the full rim speed
      _l.set(part.offset.x - p.com[0], part.offset.y - p.com[1], part.offset.z - p.com[2]).applyQuaternion(_q);
      let vx = vel[0] + CRACK_KEEP * (_w.y * _l.z - _w.z * _l.y), vy = vel[1] + CRACK_KEEP * (_w.z * _l.x - _w.x * _l.z);
      let vz = vel[2] + CRACK_KEEP * (_w.x * _l.y - _w.y * _l.x);
      let wx = CRACK_KEEP * vel[3], wy = CRACK_KEEP * vel[4], wz = CRACK_KEEP * vel[5];
      // the part's own speed into the ground at the break (its dust and its spill are the impact's, before the scatter)
      const ix = vx, iy = vy, iz = vz;
      if (keen) {
        // each part its own tumble (a drum's sideways scatter, a sheet's sag), so they never lie on in a row or a plane
        const spin = kind === 'drum' ? DRUM_SPIN : ROOF_SPIN;
        wx += (hash01(sid, pid * 16 + k, 1) * 2 - 1) * spin;
        wy += (hash01(sid, pid * 16 + k, 2) * 2 - 1) * spin * 0.5;
        wz += (hash01(sid, pid * 16 + k, 3) * 2 - 1) * spin;
        if (kind === 'drum') {
          // (the decisive wave's third head: seven drums still lay on in a row) the sections kick off the line to
          // alternate sides, spread along it from the middle and turn about the vertical, so the shaft lands broken into a
          // zigzag of sections, not a row with joints
          // (the decisive wave's fifth film: bounced high they read as giant dice, the crown thrown off out of sight) the
          // sections slump apart rather than leap: the last one (the crown) barely kicked
          const last = k === p.parts.length - 1 ? 0.4 : 1;
          const push = (k % 2 === 0 ? 1 : -1) * (0.55 + 0.45 * hash01(sid, pid * 16 + k, 4)) * DRUM_SCATTER * last;
          vx += sx * push; vz += sz * push;
          // (their end faces in contact rubbed the scatter away: the sections part along the line first)
          const along = (k - (p.parts.length - 1) / 2) * 0.7 * last;
          vx += (ax / al) * along; vz += (az / al) * along;
          wy += (hash01(sid, pid * 16 + k, 7) * 2 - 1) * DRUM_YAW;
          // every other drum lifted a little off the break (the shaft snaps as it bends), so they tumble over one another;
          // (wave 401: "bounce apart like toy blocks") masonry striking the ground does not leap: a hand's breadth
          vy += (k % 2 === 0 ? 0.35 : 0.05) + hash01(sid, pid * 16 + k, 5) * 0.25;
          // (wave 401: "one long slab is thrown into the foreground and lands without dust; cap the throw") a section
          // leaves the line at a walk's pace at most: the tip's whip is the shaft's own, its pieces do not fly on with it
          const hs = Math.hypot(vx, vz);
          if (hs > DRUM_THROW_MAX) { vx *= DRUM_THROW_MAX / hs; vz *= DRUM_THROW_MAX / hs; }
        } else vy -= hash01(sid, pid * 16 + k, 6) * ROOF_SAG;
      }
      // a drum parts from its neighbours at the break: a few centimetres along the shaft from its middle
      const gap = kind === 'drum' ? (k - (p.parts.length - 1) / 2) * 0.07 : 0;
      const gx = kind === 'drum' ? _p.x * gap : 0, gy = kind === 'drum' ? _p.y * gap : 0, gz = kind === 'drum' ? _p.z * gap : 0;
      const h = pool.spawn(part.shape ?? partShape(spec), {
        x: pose[0] + _o.x + gx, y: pose[1] + _o.y + gy, z: pose[2] + _o.z + gz, qx: pose[3], qy: pose[4], qz: pose[5], qw: pose[6],
        vx, vy, vz, wx, wy, wz,
      });
      {
        // (its body's box, read before the buckle reshapes what it draws: the grown box was read from the flat sheet)
        const own = part.shape ? part.box : null;
        const boxes = own ? [{ c: [(own[0] + own[3]) / 2, (own[1] + own[4]) / 2, (own[2] + own[5]) / 2], h: [(own[3] - own[0]) / 2, (own[4] - own[1]) / 2, (own[5] - own[2]) / 2] }]
          : [{ c: [0, 0, 0], h: [...spec.half] }];
        for (const m of part.meshes) m.userData.bodyBoxes = boxes;
      }
      if (kind === 'roof' && h >= 0) buckleSheet(part, spec.half, _q, sid * 977 + pid * 16 + k);
      if (keen && h >= 0) {
        // its landing's dust where it lies along the fall, and the broken masonry thrown off its broken ends
        // (wave 401: "a real fracture at the moment of impact ... a large dust burst, heaviest at the fast-moving top")
        // sized by the part's own speed into the ground, not its capped throw
        const x = pose[0] + _o.x, y = pose[1] + _o.y, z = pose[2] + _o.z;
        const speed = Math.max(3, Math.hypot(ix, iy, iz));
        if (kind === 'drum') o.onLanding?.(x, env.groundAt(x, z) + 0.2, z, speed, spec.massKg, sid);
        if (kind === 'drum' || k % 2 === 0) o.onShards?.(x, y, z, ix, iy, iz, spec.massKg, sid);
      }
      part.handle = h;
      _rest[0] = pose[0] + _o.x + gx; _rest[1] = pose[1] + _o.y + gy; _rest[2] = pose[2] + _o.z + gz;
      _rest[3] = pose[3]; _rest[4] = pose[4]; _rest[5] = pose[5]; _rest[6] = pose[6];
      if (h >= 0) {
        byHandle.set(h, { c, p, part: k });
        writePart(part, _rest);
      } else {
        // no room for it: it lies at rest on the ground under where the panel cracked (never hanging there, never lost)
        writePart(part, _rest);
        partOnGround(part, spec.half);
      }
    }
  }
  /** A broken-off part the pool refused: laid flat on the ground under its pose, static. */
  function partOnGround(part: LivePart, half: readonly number[]): void {
    let thin = 0;
    for (let k = 1; k < 3; k++) if (half[k] < half[thin]) thin = k;
    _q.set(part.pose[3], part.pose[4], part.pose[5], part.pose[6]);
    const long = thin === 0 ? 2 : 0;
    _l.set(long === 0 ? 1 : 0, 0, long === 2 ? 1 : 0).applyQuaternion(_q);
    _q.setFromAxisAngle(_up, Math.atan2(_l.x, _l.z) - (long === 0 ? Math.PI / 2 : 0));
    if (thin !== 1) _q.multiply(_tq.setFromAxisAngle(thin === 0 ? _fwd : _right, Math.PI / 2));
    const x = part.pose[0], z = part.pose[2];
    _rest[0] = x; _rest[1] = env.groundAt(x, z) + half[thin] + 0.02; _rest[2] = z;
    _rest[3] = _q.x; _rest[4] = _q.y; _rest[5] = _q.z; _rest[6] = _q.w;
    writePart(part, _rest);
  }

  /** Every piece of a settled collapse into one static mesh a material, world space; their bodies leave the pool. */
  function bake(lc: LiveCollapse): void {
    const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const p of lc.pieces) {
      for (const part of p.parts) {
        for (const mesh of part.meshes) {
          const geo = mesh.geometry.clone().applyMatrix4(mesh.matrix);
          // (round 4; coastal #0's farmhouse: a gable plate baked on its edge beside the heap) no piece of it upright
          layUprightPlates(geo);
          const list = byMaterial.get(mesh.material as THREE.Material) ?? [];
          list.push(geo);
          byMaterial.set(mesh.material as THREE.Material, list);
          mesh.removeFromParent();
          mesh.geometry.dispose();
        }
        part.meshes.length = 0;
        if (part.handle >= 0) { byHandle.delete(part.handle); pool.release(part.handle); part.handle = -1; }
      }
      if (p.handle >= 0) { byHandle.delete(p.handle); pool.release(p.handle); p.handle = -1; }
    }
    for (const [material, geos] of byMaterial) {
      const merged = mergeSameLayout(geos);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = `fx-collapse-baked-${lc.structureIdx}`;
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      o.group.add(mesh);
      lc.baked.push(mesh);
    }
    lc.done = true;
    bakedCount++;
    if (!lc.partial) falling.delete(lc.structureIdx);
  }

  // the update's walk over a collapse's pieces (no closure a frame): whether all lie still, all only creep
  let allStill = true, allSlow = true;
  /** Whether a body creeps (under 0.25 m/s and 0.4 rad/s): at rest to the eye, asleep or not. */
  function creeping(handle: number): boolean {
    if (pool.asleep(handle)) return true;
    if (!pool.velocity(handle, vel)) return false;
    return Math.hypot(vel[0], vel[1], vel[2]) < 0.25 && Math.hypot(vel[3], vel[4], vel[5]) < 0.4;
  }
  function settle(handle: number, p: LivePiece, age: number, dtS: number): void {
    if (pool.asleep(handle) && age > p.piece.releaseS + 0.5) p.still += dtS; else { p.still = 0; allStill = false; }
    if (p.still < BAKE_STILL_S) allStill = false;
    if (allSlow && pool.velocity(handle, vel)
      && (Math.hypot(vel[0], vel[1], vel[2]) > SLOW_MPS || Math.hypot(vel[3], vel[4], vel[5]) > SLOW_RADS)) allSlow = false;
  }
  function updateCollapse(c: LiveCollapse, dtS: number): void {
    allStill = true; allSlow = true;
    const age = clockS - c.t0;
    // the pieces still waiting for a body: a few an update, each before its release (it stands, drawn, until then)
    if (c.spawnQueue.length) {
      for (let k = 0; c.spawnQueue.length && k < SPAWNS_PER_UPDATE; k++) spawnBody(c, c.spawnQueue.shift()!);
      let q = 0;
      for (let i = 0; i < c.spawnQueue.length; i++) {
        const lp = c.spawnQueue[i];
        if (lp.piece.releaseS <= age) spawnBody(c, lp); else c.spawnQueue[q++] = lp;
      }
      c.spawnQueue.length = q;
      if (q) allStill = false;
    }
    for (let i = 0; i < c.pieces.length; i++) {
      const p = c.pieces[i];
      if (p.rested || p.shattered) continue;
      if (p.handle >= 0) {
        // the pool full of moving bodies a moment past its release: it never stands where it stood (the roof on stilts)
        if (age >= p.piece.releaseS + REFUSED_GRACE_S && !pool.inWorld(p.handle)) { refusePiece(c, p); continue; }
        if (pool.framePoseAt(p.handle, pose)) writeWhole(p, pose);
        // a leaning shaft touching down breaks into its drums (with the next frame's breaks)
        if (!p.broken && p.piece.kind === 'drum' && p.parts.length > 1 && age > p.piece.releaseS + 0.2
          && leanOf(p.handle) > SHAFT_BREAK_TILT && shaftTouches(p, pose)) { p.broken = true; breaking.push(c, p); }
        // the failure reaching a wall that held: it bursts where it stands and whatever rested on it is woken
        if (!p.shattered && p.piece.shatterS > 0 && age >= p.piece.shatterS) {
          p.shattered = true;
          byHandle.delete(p.handle);
          pool.release(p.handle);
          p.handle = -1;
          for (const part of p.parts) { for (const m of part.meshes) { m.removeFromParent(); m.geometry.dispose(); } part.meshes.length = 0; }
          let r = 0;
          for (const b of p.piece.boxes) r = Math.max(r, Math.hypot(b.center[0], b.center[1], b.center[2]) + Math.hypot(b.half[0], b.half[1], b.half[2]));
          r += 0.8;
          pool.world.wakeInBox(pose[0] - r, pose[1] - r, pose[2] - r, pose[0] + r, pose[1] + r, pose[2] + r);
          shatterHandler?.(c.seam, p.piece, c.event);
          // its dust, rolling out from its foot
          o.onLanding?.(pose[0], pose[1] - (p.piece.face ? (p.piece.face.y1 - p.piece.face.y0) / 2 : 0), pose[2], 6, p.piece.massKg, c.structureIdx);
          continue;
        }
        // its release: the shove that lets it go (from where it stands now: a piece struck sooner is moving already)
        if (!p.kicked && age >= p.piece.releaseS) {
          p.kicked = true;
          if (pieceKick(p.piece, { yaw: c.yaw }, pose, impulse)) pool.impulse(p.handle, impulse[0], impulse[1], impulse[2], impulse[3], impulse[4], impulse[5]);
        }
        settle(p.handle, p, age, dtS);
        if (!p.tipped && p.still > 0.25) { p.tipped = true; tipIfStanding(p.handle, p.half ?? pieceHalf(p.piece), p.piece.massKg, c.structureIdx * 131 + p.piece.index); }
        // (destruction-slabs 227) a roof slab come to rest high and out past the walls (a partial fall's across the wall heads,
        // its overhang over the street: "a giant flat roof"; a collapse's propped on a stub or a neighbour's wall) is shoved
        // off its rest — into the shell first while the building stands, out over the edge otherwise — and falls where it
        // goes (round 2: laid on the ground at once, it vanished from the wall heads between two frames); still there after
        // two shoves, it breaks into its sheets, or (none) lies on the ground under it
        // (one left at rest where it belongs is looked at again once it moves: a floor under it gave, the building fell)
        // (round 2: looked at only once asleep, a slab lay visibly still a second first, and one balanced never slept)
        if (p.piece.kind === 'roof') p.slowS = creeping(p.handle) ? p.slowS + dtS : 0;
        if (p.shoves < 0 && p.still === 0 && p.slowS === 0) p.shoves = 0;
        if (p.shoves >= 0 && (p.still > 0.2 || p.slowS > 0.35) && p.piece.kind === 'roof' && pool.framePoseAt(p.handle, pose)) {
          lookAtRoof(c, p);
        }
        // (a slab shoved off its rest is looked at again before the collapse bakes: baked as it went, it lay where the shove
        // left it, high on the pile)
        if (p.piece.kind === 'roof' && p.shoves > 0) { allStill = false; allSlow = false; }
      } else if (p.broken) {
        for (let k = 0; k < p.parts.length; k++) {
          const part = p.parts[k];
          if (part.handle < 0) continue;
          if (pool.framePoseAt(part.handle, pose)) writePart(part, pose);
          settle(part.handle, p, age, dtS);
          const spec = p.piece.parts[k];
          if (!part.tipped && spec && pool.asleep(part.handle) && age > p.piece.releaseS + 0.5) {
            part.tipped = true;
            // (wave 407: roof sheets "propped at steep angles like an open book") a roof sheet propped steeper than
            // about 45 degrees goes down onto the heap too
            tipIfStanding(part.handle, spec.half, spec.massKg, c.structureIdx * 131 + p.piece.index * 16 + k, p.piece.kind === 'roof' ? 0.7 : 0.4);
          }
          // (destruction-slabs 227) a roof sheet at rest high and out past the walls is shoved off it as its slab is; still
          // there after two shoves, it lies on the ground under it
          if (p.piece.kind === 'roof') part.slowS = creeping(part.handle) ? part.slowS + dtS : 0;
          if (part.shoves < 0 && !pool.asleep(part.handle) && part.slowS === 0) part.shoves = 0;
          if (part.shoves >= 0 && spec && p.piece.kind === 'roof' && ((part.tipped && pool.asleep(part.handle)) || part.slowS > 0.35)
            && pool.framePoseAt(part.handle, pose)) {
            lookAtSheet(c, p, k);
          }
          if (p.piece.kind === 'roof' && part.shoves > 0) { allStill = false; allSlow = false; }
        }
      }
    }
    const ready = allStill || (allSlow && age > BAKE_SLOW_AGE_S);
    // (round 2) and none of its roof's slabs or sheets lies high past the walls when it bakes: one the looks above missed (it
    // crept, never asleep) is shoved now and the bake waits for it
    // (a panel come to rest on its edge past the walls is tipped as soon as it rests, not only when the collapse would bake:
    // round 2, a caravanserai's roof sheet stood on edge in the yard until the end)
    // (round 3: a roof's fall onto a floor still standing returned before either look — its sheets stood on edge past the
    // walls and its slabs lay over the street until the floor went)
    const tipped = age <= BAKE_AGE_S && panelsStanding(c);
    const high = ready && age <= BAKE_AGE_S && roofLeftHigh(c);
    // (a roof come down onto a floor still standing stays bodies, asleep, until that floor goes: baked it would hang)
    if (c.partial && floors.get(c.structureIdx)?.length) return;
    if (high || (ready && age <= BAKE_AGE_S && tipped)) return;
    if (ready || age > BAKE_AGE_S) { const tBake = profStart(); bake(c); profEnd('cb.bake', tBake); }
  }
  /** A roof slab at rest looked at (its pose in `pose`): left where it belongs, or shoved off a rest high past the walls,
   *  or (shoved enough) broken into its sheets or laid on the ground under it. True when it was moved. */
  function lookAtRoof(c: LiveCollapse, p: LivePiece): boolean {
    if (!highPastWalls(c, pose, p.box)) {
      // (round 4) perched over nothing, or on its edge high over the heap: a slab of several sheets cracks into them (each
      // looked at in turn), a one-sheet slab breaks up where it lies
      if (perchedAt(pose, p.box, p.handle, piecesMeshes(p))) {
        p.shoves = -1;
        if (p.parts.length > 1 && !p.broken) { p.broken = true; breaking.push(c, p); return true; }
        byHandle.delete(p.handle); pool.release(p.handle); p.handle = -1;
        for (const part of p.parts) breakUp(c, part, p.box, p.piece.massKg / Math.max(1, p.parts.length));
        p.shattered = true;
        return true;
      }
      // (a shove's landing looked at once more: a slab come down on its edge goes over, as one that fell there does)
      if (p.shoves > 0) tipIfStanding(p.handle, p.half ?? pieceHalf(p.piece), p.piece.massKg, c.structureIdx * 131 + p.piece.index + 7, 0.7);
      p.shoves = -1;
      return false;
    }
    // (round 2: a 13 m roof side on the pile hopped 0.7 m a shove) a slab of several sheets breaks into them where it lies
    // (each looked at in turn: a sheet tips off the edge a whole side cannot); a one-sheet slab is shoved off, twice
    if (p.parts.length > 1 && !p.broken) { p.shoves = -1; p.broken = true; breaking.push(c, p); return true; }
    // (a one-sheet slab too big to tip off what holds it — 20 m² and more in its plane: a nave's whole side on a fallen
    // tower — breaks up where it lies at once, rather than hop on the pile)
    const plane = [p.box[3]! - p.box[0]!, p.box[4]! - p.box[1]!, p.box[5]! - p.box[2]!].sort((x, y) => y - x);
    if (p.shoves === 0 && plane[0]! * plane[1]! >= 20) p.shoves = ROOF_SHOVES;
    // (round 4; the engineering critic's films: a hip end shoved off its rest stood up on its point 10 m over the heap, and
    // a sheet shoved twice slid round a floor for three seconds and tumbled off a corner) one shove only, and only a flat
    // slab over a building still standing, into its shell; anything else breaks up where it lies
    if (p.shoves === 0 && (fallenUnder(c) || !lyingFlat(pose, p.box))) p.shoves = ROOF_SHOVES;
    if (p.shoves < ROOF_SHOVES) {
      p.shoves++; p.still = 0;
      shoveOff(c, p.handle, pose, p.box, p.piece.massKg, !fallenUnder(c) && p.shoves === 1, p.shoves);
      return true;
    }
    p.shoves = -1;
    // (round 2: laid on the ground under it, a slab vanished from the wall heads between two frames) still there: it breaks
    // up where it lies, its dust and broken tiles thrown
    {
      byHandle.delete(p.handle); pool.release(p.handle); p.handle = -1;
      for (const part of p.parts) breakUp(c, part, p.box, p.piece.massKg / Math.max(1, p.parts.length));
      p.shattered = true;
    }
    return true;
  }
  /** A roof sheet (or a one-sheet slab) at `pose` broken up where it lies: its meshes gone, its dust and shards thrown. */
  function breakUp(c: LiveCollapse, part: LivePart, box: readonly number[], massKg: number): void {
    _hq.set(pose[3], pose[4], pose[5], pose[6]);
    for (const [u, w] of [[0.5, 0.5], [0.2, 0.25], [0.8, 0.75]] as const) {
      _hv.set(box[0]! + (box[3]! - box[0]!) * u, (box[1]! + box[4]!) / 2, box[2]! + (box[5]! - box[2]!) * w).applyQuaternion(_hq);
      const x = pose[0] + _hv.x, y = pose[1] + _hv.y, z = pose[2] + _hv.z;
      const ox = x - pose[0], oz = z - pose[2], ol = Math.hypot(ox, oz) || 1;
      o.onShards?.(x, y, z, (ox / ol) * 2.5, 1.5, (oz / ol) * 2.5, massKg / 3, c.structureIdx);
      if (u === 0.5) o.onLanding?.(x, y, z, 5, massKg, c.structureIdx);
    }
    for (const m of part.meshes) { m.removeFromParent(); m.geometry.dispose(); }
    part.meshes.length = 0;
    _hv.set((box[0]! + box[3]!) / 2, (box[1]! + box[4]!) / 2, (box[2]! + box[5]!) / 2).applyQuaternion(_hq);
    wakeOver(pose[0] + _hv.x, pose[1] + _hv.y, pose[2] + _hv.z, box);
  }
  /** A broken slab's sheet at rest looked at (its pose in `pose`), as its slab is. True when it was moved. */
  function lookAtSheet(c: LiveCollapse, p: LivePiece, k: number): boolean {
    const part = p.parts[k]!, spec = p.piece.parts[k]!;
    const pbox = part.box ?? [-spec.half[0], -spec.half[1], -spec.half[2], spec.half[0], spec.half[1], spec.half[2]];
    if (!highPastWalls(c, pose, pbox)) {
      // (round 4) perched over nothing, or on its edge high over the heap: it breaks up where it lies
      if (perchedAt(pose, pbox, part.handle, part.meshes)) {
        part.shoves = -1;
        byHandle.delete(part.handle); pool.release(part.handle); part.handle = -1;
        breakUp(c, part, pbox, spec.massKg);
        return true;
      }
      if (part.shoves > 0) tipIfStanding(part.handle, spec.half, spec.massKg, c.structureIdx * 131 + p.piece.index * 16 + k + 7, 0.7);
      part.shoves = -1;
      return false;
    }
    if (part.shoves === 0 && (fallenUnder(c) || !lyingFlat(pose, pbox))) part.shoves = ROOF_SHOVES;
    if (part.shoves < ROOF_SHOVES) {
      part.shoves++;
      shoveOff(c, part.handle, pose, pbox, spec.massKg, !fallenUnder(c) && part.shoves === 1, part.shoves);
      return true;
    }
    part.shoves = -1;
    byHandle.delete(part.handle); pool.release(part.handle); part.handle = -1;
    breakUp(c, part, pbox, spec.massKg);
    return true;
  }
  /**
   * Whether a panel (a slab of any kind: a wall's, a gable's, a roof's sheet) stands on its edge past the ground storey's
   * walls before the bake (round 2: baked so, a 4.5 m wall panel stood upright in the yard): each is tipped once more, and
   * the bake waits for it to fall.
   */
  /** The world plan point of a body's box middle (its pose in `pose`; null box: the frame's origin): a panel's frame can sit
   *  metres off the sheet it draws (round 3: a roof sheet on its edge past the walls read as inside them). Reuses _boxMid. */
  function boxMiddle(box: readonly number[] | null | undefined): [number, number] {
    if (!box) { _boxMid[0] = pose[0]!; _boxMid[1] = pose[2]!; return _boxMid; }
    _hq.set(pose[3]!, pose[4]!, pose[5]!, pose[6]!);
    _hv.set((box[0]! + box[3]!) / 2, (box[1]! + box[4]!) / 2, (box[2]! + box[5]!) / 2).applyQuaternion(_hq);
    _boxMid[0] = pose[0]! + _hv.x; _boxMid[1] = pose[2]! + _hv.z;
    return _boxMid;
  }
  function panelsStanding(c: LiveCollapse): boolean {
    let moved = false;
    const a = c.seam.anatomy, pl = a.placement;
    const f = panelFrame;
    f.c = Math.cos(pl.yaw); f.s = Math.sin(pl.yaw); f.x = pl.x; f.z = pl.z;
    const sb = bandEnclosure(a, 0)?.solidBox;
    let bcx = 0, bcz = 0;
    if (sb && Number.isFinite(sb[0])) { bcx = (sb[0] + sb[2]) / 2; bcz = (sb[1] + sb[3]) / 2; }
    const midX = f.x + bcx * f.c + bcz * f.s, midZ = f.z - bcx * f.s + bcz * f.c;
    for (let i = 0; i < c.pieces.length; i++) {
      const p = c.pieces[i]!;
      if (p.rested || p.shattered) continue;
      if (!p.broken) {
        const h = p.half ?? pieceHalf(p.piece);
        if (p.handle < 0 || p.retipped > PANEL_TIPS || !isPanel(h) || !creeping(p.handle) || !pool.framePoseAt(p.handle, pose) || !pastWalls(a, f, ...boxMiddle(p.box))) continue;
        if (p.retipped < PANEL_TIPS) { if (tipOutward(p.handle, boxHalf(p.box, h), p.piece.massKg, midX, midZ, p.retipped)) { p.retipped++; moved = true; } continue; }
        // (still on its edge after its pushes: it breaks up where it stands, its dust and shards thrown)
        if (tipOutward(p.handle, boxHalf(p.box, h), p.piece.massKg, midX, midZ, 0, true)) {
          p.retipped++;
          byHandle.delete(p.handle); pool.release(p.handle); p.handle = -1;
          for (const part of p.parts) breakUp(c, part, p.box, p.piece.massKg / Math.max(1, p.parts.length));
          p.shattered = true; moved = true;
        }
        continue;
      }
      for (let k = 0; k < p.parts.length; k++) {
        const part = p.parts[k]!, spec = p.piece.parts[k];
        if (!spec || part.handle < 0 || part.retipped > PANEL_TIPS || !isPanel(spec.half) || !creeping(part.handle) || !pool.framePoseAt(part.handle, pose)
          || !pastWalls(a, f, ...boxMiddle(part.box))) continue;
        const ph = boxHalf(part.box, spec.half);
        if (part.retipped < PANEL_TIPS) { if (tipOutward(part.handle, ph, spec.massKg, midX, midZ, part.retipped)) { part.retipped++; moved = true; } continue; }
        if (tipOutward(part.handle, ph, spec.massKg, midX, midZ, 0, true)) {
          part.retipped++;
          const pbox = part.box ?? [-spec.half[0]!, -spec.half[1]!, -spec.half[2]!, spec.half[0]!, spec.half[1]!, spec.half[2]!];
          byHandle.delete(part.handle); pool.release(part.handle); part.handle = -1;
          breakUp(c, part, pbox, spec.massKg);
          moved = true;
        }
      }
    }
    return moved;
  }
  /** A panel standing on its edge (its pose in `pose`) pushed over away from the building's middle, at its top (it falls
   *  flat on the ground outside rather than back against the wall it leans on). False when it is not standing. */
  function tipOutward(handle: number, half: readonly number[], massKg: number, midX: number, midZ: number, times = 0, dry = false): boolean {
    let thin = 0;
    for (let k = 1; k < 3; k++) if (half[k]! < half[thin]!) thin = k;
    _hq.set(pose[3]!, pose[4]!, pose[5]!, pose[6]!);
    _hv.set(thin === 0 ? 1 : 0, thin === 1 ? 1 : 0, thin === 2 ? 1 : 0).applyQuaternion(_hq);
    if (Math.abs(_hv.y) > 0.5) return false;
    const hl = Math.hypot(_hv.x, _hv.z) || 1;
    let ox = _hv.x / hl, oz = _hv.z / hl;
    if (ox * (pose[0]! - midX) + oz * (pose[2]! - midZ) < 0) { ox = -ox; oz = -oz; }
    let up = 0;
    for (let k = 0; k < 3; k++) { _l.set(k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0).applyQuaternion(_hq); up += half[k]! * Math.abs(_l.y); }
    if (up < STAND_TALL * half[thin]!) return false;
    if (dry) return true;
    // (round 3: a sheet whose body is thicker than it draws stood up to the first push) harder each time
    const j = Math.max(1, massKg) * 2.5 * (1 + 1.5 * times);
    pool.impulse(handle, ox * j, 0, oz * j, pose[0]!, pose[1]! + up * 0.8, pose[2]!);
    return true;
  }
  /** A body's half extents from its box (or `fallback`): what it stands on, not what it draws. Reuses _boxHalf. */
  function boxHalf(box: readonly number[] | null | undefined, fallback: readonly number[]): readonly number[] {
    if (!box) return fallback;
    _boxHalf[0] = (box[3]! - box[0]!) / 2; _boxHalf[1] = (box[4]! - box[1]!) / 2; _boxHalf[2] = (box[5]! - box[2]!) / 2;
    return _boxHalf;
  }
  /** Whether a roof slab or sheet still lies high past the walls (each not yet looked at is, and is moved). */
  function roofLeftHigh(c: LiveCollapse): boolean {
    let moved = false;
    for (const p of c.pieces) {
      if (p.piece.kind !== 'roof' || p.rested || p.shattered) continue;
      if (!p.broken) {
        if (p.handle >= 0 && p.shoves >= 0 && pool.framePoseAt(p.handle, pose)) moved = lookAtRoof(c, p) || moved;
        continue;
      }
      for (let k = 0; k < p.parts.length; k++) {
        const part = p.parts[k]!;
        if (part.handle >= 0 && part.shoves >= 0 && p.piece.parts[k] && pool.framePoseAt(part.handle, pose)) moved = lookAtSheet(c, p, k) || moved;
      }
    }
    return moved;
  }

  /** A building's upper floors as records (sections on: what falls inside it lands on the floor it stands over). */
  function floorRecords(seam: StructureDamageSeam): Array<{ storey: number; record: CollisionRecord }> {
    const a = seam.anatomy, { placement } = a;
    const out: Array<{ storey: number; record: CollisionRecord }> = [];
    const c = Math.cos(placement.yaw), s = Math.sin(placement.yaw);
    for (let k = 1; k < a.storeys.length; k++) {
      const st = a.storeys[k];
      let t = 0.25;
      for (const f of st.faces) t = Math.max(t, f.layers.reduce((sum, l) => sum + (l.thicknessM || 0), 0));
      // (destruction-slabs 227) the storey's drawn enclosure (its interior's box), never the anatomy's w x d about the
      // origin (a floor solid past the walls held a roof slab out over the street); none where it encloses under half
      let bcx: number, bcz: number, hw: number, hl: number;
      const band = bandEnclosure(a, k);
      if (band) {
        const ib = band.interiorBox;
        if (!(band.share >= 0.5 && ib[2] - ib[0] > 0.9 && ib[3] - ib[1] > 0.9)) continue;
        bcx = (ib[0] + ib[2]) / 2; bcz = (ib[1] + ib[3]) / 2; hw = (ib[2] - ib[0]) / 2 - 0.05; hl = (ib[3] - ib[1]) / 2 - 0.05;
      } else {
        [bcx, bcz] = anatomyCentre(a);
        hw = a.w / 2 - t - 0.05; hl = a.d / 2 - t - 0.05;
      }
      if (!(hw > 0.4 && hl > 0.4)) continue;
      const y1 = placement.y + st.y0, y0 = y1 - 0.5;
      const wx = placement.x + bcx * c + bcz * s, wz = placement.z - bcx * s + bcz * c;
      // obb: hw along right (cos yaw, −sin yaw), hl along forward (sin yaw, cos yaw): the body frame's x and z
      const ex = Math.abs(c) * hw + Math.abs(s) * hl, ez = Math.abs(s) * hw + Math.abs(c) * hl;
      const record = {
        min: [wx - ex, y0, wz - ez], max: [wx + ex, y1, wz + ez],
        shape2: { kind: 'obb', cx: wx, cz: wz, hw, hl, yaw: placement.yaw, y0, y1 },
        kind: 'floor', structureIdx: seam.structureIdx,
      } as unknown as CollisionRecord;
      out.push({ storey: k, record });
    }
    return out;
  }

  return {
    prepare(seam, resolve = o.materialFor, standing = [], version = 0, roofOnly = false) { jobFor(seam, resolve, standing, version, roofOnly); },
    preparedVersion(structureIdx) { const job = prepared.get(structureIdx); return job ? job.version : -1; },
    fallRoof,
    collapse,
    markFalling(seam, withFloors) {
      falling.add(seam.structureIdx);
      if (withFloors && !floors.has(seam.structureIdx)) floors.set(seam.structureIdx, floorRecords(seam));
    },
    dropFloor(structureIdx, storey) {
      const list = floors.get(structureIdx);
      if (!list) return;
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].storey < storey) continue;
        const r = list[i].record;
        list.splice(i, 1);
        // what lay on it falls on (its sleepers woken over the footprint)
        pool.world.wakeInBox(r.min[0] - 1, r.min[1] - 0.5, r.min[2] - 1, r.max[0] + 1, r.max[1] + 30, r.max[2] + 1);
      }
      // a roof's fall that lay on it starts its settling over (woken, its pieces are still before they fall: the slow
      // rule would bake them where they hung)
      for (let i = 0; i < live.length; i++) {
        const c = live[i];
        if (c.done || !c.partial || c.structureIdx !== structureIdx) continue;
        c.t0 = clockS;
        for (const p of c.pieces) p.still = 0;
      }
    },
    floorHolds(structureIdx, y) {
      const list = floors.get(structureIdx);
      if (!list) return false;
      for (let i = 0; i < list.length; i++) if (y >= list[i].record.max[1] - 0.4) return true;
      return false;
    },
    update(dtS) {
      clockWait += Math.max(0, dtS);
      // the collapses waiting for their cut: PREPARE_WAITING triangles an update, at most WAIT_MAX_S, then down
      for (let i = 0; i < waiting.length;) {
        const w = waiting[i];
        const force = clockWait - w.since > WAIT_MAX_S;
        if (!w.job.done) advanceJob(w.job, force ? Infinity : PREPARE_WAITING);
        if (w.job.done && !isReady(w.job)) buildJob(w.job, force ? Infinity : BUILD_WAITING);
        if (isReady(w.job)) {
          waiting.splice(i, 1);
          bringDown(w.job, w.seam, w.e);
          w.ready?.();
          continue;
        }
        i++;
      }
      // the cuts laid ahead, a few hundred triangles an update (the oldest first)
      const tPrep = profStart();
      if (prepared.size) {
        let left = prepareTris, lists = BUILD_LISTS;
        for (const job of prepared.values()) {
          if (isReady(job)) continue;
          if (!job.done && left > 0) left -= advanceJob(job, left);
          if (job.done && lists > 0) lists -= buildJob(job, lists);
          if (left <= 0 && lists <= 0) break;
        }
      }
      profEnd('cb.prepare', tPrep);
      if (!live.length && !o.alsoLive?.()) return;
      bind();
      clockS += Math.max(0, dtS);
      // a heap rising under its pieces wakes those lying on it
      wakeTimer -= dtS;
      if (wakeTimer <= 0) {
        wakeTimer = 0.2;
        for (let i = 0; i < live.length; i++) {
          const c = live[i];
          const t = clockS - c.t0;
          if (c.done || c.partial || t < RISE_FROM_S || t > RISE_TO_S + 0.3) continue;
          pool.world.wakeInBox(c.box[0], -1e4, c.box[1], c.box[2], 1e4, c.box[3]);
        }
      }
      // the vehicles shove what lies in their way (and a slab lands on a deck)
      hullList.length = 0;
      const hulls = o.hulls?.();
      if (hulls) for (const t of hulls) if (t && (t as WreckTurretTank).state && (t as WreckTurretTank).spec) hullList.push(t as WreckTurretTank);
      pool.setHulls(hullList);
      const tAdv = profStart();
      pool.advance(dtS);
      profEnd('cb.poolAdvance', tAdv);
      // the panels that landed hard crack now (outside the pool's report), a couple an update
      const tBrk = profStart();
      for (let k = 0; k < BREAKS_PER_UPDATE && breaking.length; k++) {
        const c = breaking.shift() as LiveCollapse, p = breaking.shift() as LivePiece;
        breakApart(c, p);
      }
      profEnd('cb.break', tBrk);
      for (let i = 0; i < live.length; i++) if (!live[i].done) updateCollapse(live[i], dtS);
    },
    get active() { let n = 0; for (let i = 0; i < live.length; i++) if (!live[i].done) n++; return n; },
    took: (structureIdx) => live.some((c) => c.structureIdx === structureIdx && !c.partial) || waiting.some((w) => w.seam.structureIdx === structureIdx),
    onShatter(handler) { shatterHandler = handler; },
    forget(structureIdx) {
      const job = prepared.get(structureIdx);
      if (!job) return;
      prepared.delete(structureIdx);
      disposeJob(job);
    },
    reset() {
      for (const c of live) {
        for (const p of c.pieces) for (const part of p.parts) for (const m of part.meshes) { m.removeFromParent(); m.geometry.dispose(); }
        for (const m of [...c.remnant, ...c.baked]) { m.removeFromParent(); m.geometry.dispose(); }
      }
      live.length = 0;
      byHandle.clear();
      for (const job of prepared.values()) disposeJob(job);
      prepared.clear();
      falling.clear();
      floors.clear();
      breaking.length = 0;
      waiting.length = 0;
      stubRecords_.length = 0;
      pool.reset();
      bound = false;
      clockS = 0;
    },
    stats() {
      let pieces = 0, meshes = 0, vertices = 0;
      for (const c of live) {
        for (const p of c.pieces) {
          if (p.handle >= 0) pieces++;
          for (const part of p.parts) {
            if (part.handle >= 0) pieces++;
            for (const m of part.meshes) { meshes++; vertices += m.geometry.getAttribute('position').count; }
          }
        }
        for (const m of [...c.remnant, ...c.baked]) { meshes++; vertices += m.geometry.getAttribute('position').count; }
      }
      return { collapses: live.length, pieces, meshes, vertices, baked: bakedCount, prepared: prepared.size };
    },
  };
}

/** A dust coat on vertex colours in place: each colour `share` of the way to a pale greyed dust of itself (its luminance,
 *  lifted a little and warmed: masonry grit). Shared with the wall fracture's bodies. */
function dustCoat(colors: Float32Array, size: number, share: number, from = 0, to = colors.length): void {
  for (let i = from; i + 2 < to; i += size) {
    const r = colors[i], g = colors[i + 1], b = colors[i + 2];
    const dust = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const d = dust * 0.85 + 0.1;
    colors[i] = r + (d * 1.02 - r) * share;
    colors[i + 1] = g + (d - g) * share;
    colors[i + 2] = b + (d * 0.93 - b) * share;
  }
}

/** Non-indexed geometries with the same attributes into one (null when they disagree or are empty). */
function mergeSameLayout(geos: readonly THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!geos.length) return null;
  const names = Object.keys(geos[0].attributes);
  if (!geos.every((g) => Object.keys(g.attributes).length === names.length && names.every((n) => !!g.attributes[n]))) return null;
  const total = geos.reduce((a, g) => a + g.getAttribute('position').count, 0);
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = (geos[0].getAttribute(name) as THREE.BufferAttribute).itemSize;
    const arr = new Float32Array(total * size);
    let at = 0;
    for (const g of geos) {
      const a = g.getAttribute(name) as THREE.BufferAttribute;
      arr.set(a.array as Float32Array, at);
      at += a.count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}
