/**
 * structureFracture.ts — a building's walls drawn as they break (destruction core lane, 2026-10-10; the owner: "the
 * destruction of buildings needs to be a lot better too, rn its way to sporadic and ugly instead of behaving like it
 * would with physics").
 *
 * The first round that strikes a face takes that face out of the world's merged buckets (its triangles flattened in
 * place, kept for the reset) and draws it again from its own triangles cut between its cells (wallFracture.ts): the
 * standing cells as one mesh a material, each broken edge closed across the wall's thickness in its core (the hole's
 * reveal), a spalled cell's skin gone and its core showing a few centimetres back (the recess), a sagging cell a few
 * centimetres down. What a round knocks through flies off along it as bodies — a few chunks of the wall's own brick,
 * render and window, the rest is dust — and what loses its load path falls as bodies, whole clusters of courses, in the
 * presentation's debris pool (fx/debrisPhysics.ts): they tumble, strike, pile and lie where they came to rest, baked
 * into a static mesh a material once still (never faded). A dark room stands behind a holed storey. Hard landings make
 * their dust and their sound (fx/clock.ts emitDebrisLanding, the rubble's one channel), by mass and speed.
 *
 * Presentation only: the simulation's stage, hit points and (sections on, DESTRUCTION.md §3.4) its holes and falls stay
 * the authority — with sections on, a hole the sim opened breaks the wall there (its radius) and a fallen wall section
 * comes down as its cells (`dropFace`), the storeys over a fallen face held by their floor as the sim holds them.
 * Deterministic from the building's anatomy and each round's own seed, so every peer draws the same breaks from the same
 * bursts; its work is spread over the updates after a strike in fixed units (never a wall-clock budget, so a re-film
 * spawns the same bodies on the same frames). Event time only, but the poses of live bodies each frame, which allocate
 * nothing (2026-10-15 port onto integ/226: the house hitch).
 */
import * as THREE from 'three';
import type { MunitionClass } from '../sim/destructionEvents.ts';
import { createRigidShape, type RigidEnvironment, type RigidPartSpec } from '../sim/rigidBody.ts';
import { damageSeed, type FractureSlot } from '../world/destructionKit.ts';
import { storeyInterior } from '../world/structureEnclosure.ts';
import type { StructureDamageSeam, StructureSpan } from '../world/structureDamageSeam.ts';
import type { DebrisPhysics } from './debrisPhysics.ts';
import { emitDebrisLanding } from './clock.ts';
import { profEnd, profStart } from './fxProf.ts';
import { createPlateHold, layPerchedPlates, layUprightPlates, type PlateDrawing, type WatchedPlate } from './uprightPlates.ts';
import {
  CELL_CRACKED, CELL_FALLEN, CELL_GONE, CELL_OPENING, CELL_SPALLED, CELL_VOID, CRACK_AT, SPALL_AT, cellRect, createWallFracture,
  createWallStrikeOutcome, dropFace, gableTopAt, strikeWall, struckFace, type FaceGrid, type WallFracture, type WallStrikeKind,
} from './wallFracture.ts';

interface StructureFractureOptions {
  pool: DebrisPhysics;
  group: THREE.Group;
  /** A bucket's material for a building (its spans' own, else the world's). */
  materialFor(seam: StructureDamageSeam, bucket: string): THREE.Material | null;
  /** The fx clock (s). */
  now(): number;
  /** Keep a span's original positions before the first change (the owner's reset restores them). */
  keepSpan(span: StructureSpan): void;
  /** A hard landing (its dust): world point, speed, mass, the building. */
  onLanding?(x: number, y: number, z: number, speedMps: number, massKg: number, structureIdx: number): void;
  /** Bodies a round throws at most (chunks knocked through and clusters fallen together; default 10). */
  bodiesPerStrike?: number;
  /** The pool's bodies this fracture holds at once at most (default 64, half the pool): a collapse always finds room. */
  poolShare?: number;
  /** The room behind a holed storey's material for a bucket (structureStages' fx-structure-room in that bucket's texture:
   *  dim, vertex-tinted, compiled at the battle warm); absent, the wall's own. */
  roomMaterial?(seam: StructureDamageSeam, bucket: string): THREE.Material | null;
  /**
   * Cells that fell or were knocked through but found no body (the share full of moving bodies, the pool refusing): never
   * left standing in the air nor lost — the caller throws them through the program path (structureDebris pieces, which
   * land where their flight meets the ground). World centre, size (m), the wall's material and core slot, a velocity.
   */
  onRefused?(seam: StructureDamageSeam, x: number, y: number, z: number, sizeM: number, slot: FractureSlot, vx: number, vy: number,
    vz: number): void;
  /** A face drawn again from its cells (storey, face index): the caller lets go of whatever it laid on it (the kit's runs
   *  over a hole would hang); `claimed` on the redraw that took the face out of the buckets. */
  onRedrawn?(seam: StructureDamageSeam, storey: number, face: number, claimed: boolean): void;
  /** Work units an update spends on the strikes' drawing (sorting a triangle 1, cutting one 3, a body 240, a face's
   *  redraw 320); default 3600. */
  workUnits?: number;
  /** A body lain still at this height that must stay a body (it rests on a floor its storey may yet drop from under it:
   *  baked, it would stay in the air). */
  holdBake?(structureIdx: number, y: number): boolean;
  /** The ground as the pieces land on it (world y): what a baked piece laid flat lies on (uprightPlates.ts). */
  groundAt?(x: number, z: number): number;
  /** The world's records the bodies meet (what holds a baked plate: uprightPlates' perch). */
  environment?(): RigidEnvironment | null;
  /** Another owner's drawings of a building lying still (fx/collapseBodies.ts: its baked heaps and remnants): what a baked
   *  plate rests on. */
  statics?(structureIdx: number): readonly THREE.Mesh[];
}

export interface StructureFracture {
  /**
   * A round on a wall (world point and travel): the faces it took and redrew, as [storey, face index] pairs, when it
   * broke one (the caller lays no hole of its own; the kit's runs on those faces go as each is redrawn, onRedrawn); null
   * when it struck none.
   */
  strike(seam: StructureDamageSeam, x: number, y: number, z: number, dirX: number, dirZ: number, munition: MunitionClass,
    chargeKg: number, caliberMm: number, radiusM?: number, settled?: boolean): number[] | null;
  /**
   * A wall section fell (sections on: the sim's `sectionDown` for a storey's face): every cell of that face from
   * `stubV` up (m over its storey floor; a ground storey keeps its stub, a door its gap down to the sill) comes down as
   * bodies, with what lost its load path over it; `dirX`, `dirZ` the blow (world). False when it has no such face.
   */
  dropFace(seam: StructureDamageSeam, storey: number, faceIndex: number, stubV: number, dirX: number, dirZ: number, settled?: boolean): boolean;
  /** With sections on the sim holds a storey over a fallen face on its floor until its own fall: so does the field. */
  holdStoreys(structureIdx: number, seam: StructureDamageSeam): void;
  /** Whether a building's queued drawing is done (its faces drawn as they stand). */
  idle(structureIdx: number): boolean;
  /** How many times a building's faces have been drawn again (a collapse's cut laid before is stale past it). */
  version(structureIdx: number): number;
  /** Whether a building has faces drawn here. */
  has(structureIdx: number): boolean;
  /** Its standing faces' meshes (world space): a collapse cuts them with the building. */
  standing(structureIdx: number): THREE.Mesh[];
  /** Its rooms' meshes (world space). */
  rooms(structureIdx: number): THREE.Mesh[];
  /** Its heap: the bodies baked where they lay (each mesh under its matrix). */
  heapOf(structureIdx: number): THREE.Mesh[];
  /** One room out (its walls went round it). */
  dropRoom(structureIdx: number, mesh: THREE.Mesh): void;
  /** A building's roof fell (sections on, its roof section's fall): a room laid in its top storey from now on has no
   *  ceiling (round 4). */
  roofFell(structureIdx: number): void;
  /** Pieces of its faces cut loose (structureHanging.ts: touching nothing that stands): their cells fall as a body each. */
  dropPieces(structureIdx: number, pieces: ReadonlyArray<{ mesh: THREE.Mesh; tris: readonly number[] }>): void;
  /** The building came down: its standing faces leave (the collapse drew them); its bodies and heaps stay. */
  release(structureIdx: number): void;
  /** A storey dropped (sections on): the rooms laid in it and over it go (destruction-slabs 227: they stood in the air). */
  dropRooms(structureIdx: number, fromStorey: number, only?: boolean): void;
  /**
   * A storey's fall lowers what stands over it by `dropM` (destruction-slabs 227 round 3: the faces the fracture had
   * taken stood at their heights over the fallen storey while the world's spans came down — a late joiner saw a house's
   * upper floors hang over its empty ground floor): `baked`, for good (its faces' cells and grids move, later strikes and
   * cells with them); otherwise as shown in flight (the faces' matrices) until the fall's end bakes it.
   */
  lowerOver(structureIdx: number, storey: number, dropM: number, baked: boolean): void;
  /** Per frame (after the pool's step): the strikes' drawing within its budget, live bodies' poses, still ones baked. */
  update(): void;
  /** Finish every queued strike's drawing now (receipts, a settle), or one building's (a storey dropping with its face). */
  flush(structureIdx?: number): void;
  /** Bodies in the pool now (the pool steps while any owner has some). */
  liveBodies(): number;
  reset(): void;
  stats(): { buildings: number; faces: number; bodies: number; baked: number; skipped: number };
}

/** A face is a wall the fracture takes when its slab's triangles facing along it cover this share of it (round 4). */
const WALL_FILL_MIN = 0.5;
/** The raster that coverage is read at (m). */
const WALL_FILL_CELL_M = 0.25;
/** A triangle counts toward a face's wall when it faces along the face within 16° (a pipe's or a round tower's facets
 *  turned past that are no flat wall). */
const WALL_FILL_COS = 0.96;

/** A round's hole on a wall by its munition (structureStages strikeHoleRadius / pierceHoleRadius, the same law). */
function holeFor(munition: MunitionClass, chargeKg: number, caliberMm: number): { radiusM: number; kind: WallStrikeKind } {
  const kinetic = munition === 'kinetic' || munition === 'autocannon_ap';
  if (kinetic) return { radiusM: Math.min(0.45, Math.max(0.22, 0.1 + 0.0024 * (caliberMm > 0 ? caliberMm : 105))), kind: 'kinetic' };
  const shaped = munition === 'atgm' || munition === 'heat' || munition === 'drone_fpv';
  if (!(chargeKg > 0)) return { radiusM: 0, kind: 'blast' };
  const r = munition === 'howitzer' || munition === 'missile' ? 1.5
    : munition === 'rocket' || munition === 'hesh' ? 1.2
      : munition === 'he' ? 0.55 + 0.25 * Math.min(2, Math.sqrt(chargeKg))
        : shaped ? 0.6 : munition === 'autocannon_he' ? 0.32 : 0.4;
  return { radiusM: chargeKg < 0.3 ? Math.min(r, 0.35) : r, kind: shaped ? 'shaped' : 'blast' };
}

/** A vertex layout: position and normal, then the named attributes (uv, color, …) as the bucket carries them. */
interface Layout { names: string[]; sizes: number[]; stride: number }

/** The face's triangles past its rectangle (a plinth's lip, an eave's board): they stand with it whatever its cells do. */
const STATIC_CELL = -1;
/** What reaches over a gable's apex (the roof's cap over it): it stands while the gable's top row does, and goes with it
 *  (destruction-slabs 227 round 3: standing with the face, it was left in the sky as two triangles when the gable fell). */
const HEAD_CELL = -2;
/** A cell's reveals in a face mesh's ranges: CAP_CELL - cell (after the cells' own triangles). */
const CAP_CELL = -1000;

interface FaceGroup {
  material: THREE.Material;
  layout: Layout;
  /** Triangles by cell while the face is cut (body frame, layout stride a vertex); emptied once packed. */
  cells: Map<number, number[]>;
  /** Packed, by cell: the core's triangles (what stays when the skin spalls) and the skin's (centroid within the skin's
   *  depth, or proud of the face: render, brick face, sills, frames). */
  core: Map<number, Float32Array>;
  skin: Map<number, Float32Array>;
}

interface FaceDraw {
  seam: StructureDamageSeam;
  grid: FaceGrid;
  face: number;
  /** Whether the face drew any triangle of the building (destruction-slabs 227: a face of the anatomy's box over no wall
   *  drew none, yet its broken edges, its chunks and a room were laid there) — none: no edges, no chunks, no room. */
  drawn: boolean;
  groups: Map<THREE.Material, FaceGroup>;
  meshes: THREE.Mesh[];
  core: FractureSlot;
  /** Each cell's depth through the wall to the proudest part it carries (m along the face's normal): its body's box. */
  depthMin: Float32Array;
  depthMax: Float32Array;
  /** Cells whose broken edges are no longer drawn: a reveal the hanging sweep found touching nothing (a lattice's cell
   *  whose few members stand away from its rectangle's edge drew its reveal as a strip in the air). */
  noCap: Set<number>;
}

/** A face's share of the building's triangles (sortByFaceSlice): copied by material, and where each lies in its bucket. */
interface FaceSort {
  soups: Map<THREE.Material, { layout: Layout; soup: number[] }>;
  flat: Array<[StructureSpan, number]>;
}

interface LiveBody {
  structureIdx: number;
  handle: number;
  meshes: THREE.Mesh[];
  massKg: number;
  material: string;
  still: number;
  age: number;
  sounds: number;
  pose: Float64Array;
  /** Its geometry per material, in the building's body frame (the copy its cells were packed in: no per-vertex work). */
  parts: Array<{ material: THREE.Material; geometry: THREE.BufferGeometry }>;
  /** From the body frame to its own (its box's) frame: a mesh's matrix is its pose times this. */
  fromBody: THREE.Matrix4;
  /** Its cells (face, cell pairs) and whether it has cracked on a landing (a chunk of courses breaks into clumps). */
  cells: number[];
  cracked: boolean;
  /** Its extent from its frame's origin along its axes (along the face, up, out), and whether it has been looked at
   *  once at rest (tipped over if it stood on its edge). */
  half: [number, number, number];
  tipped: boolean;
  /** (round 4) Times it was found still on its edge when it would bake, and pushed over again. */
  retips?: number;
}

interface Live {
  seam: StructureDamageSeam;
  wall: WallFracture;
  faces: Map<number, FaceDraw>;
  /** The roof's sag applied so far, per span: each vertex's drop (m), so a new sag moves it by the difference. */
  sag: Map<StructureSpan, Float32Array>;
  /** The roof's corners over the eaves (body frame, as they stood) and the gaps the sag last answered. */
  roofCorners: Array<{ span: StructureSpan; idx: Int32Array; xyz: Float32Array }> | null;
  sagSignature: string;
  /** Its standing faces went with a collapse: its queued drawing is dropped. */
  released: boolean;
  /** Faces being cut a slice at a time: their draw, their sorted triangles and how far the cut has come. */
  claiming: Map<number, { draw: FaceDraw; entry: FaceSort | null;
    materials: THREE.Material[]; m: number; tri: number }>;
  /** How far the sort by face has come (span, triangle) while it runs in slices. */
  sortAt: [number, number];
  sorting: Map<number, FaceSort> | null;
  /** The building's triangles sorted by face (sortByFace, at its first strike), each face's dropped once taken. */
  byFace: Map<number, FaceSort> | null;
  room: THREE.Mesh[];
  /** The rooms laid (storey and enclosed component keys: structureEnclosure storeyInterior). */
  roomStoreys: Set<string>;
  /** (destruction-slabs 227 round 3) Per storey: how far a storey's fall under it has lowered it (m; its faces' cells and
   *  their grids carry it, its rooms by their matrix), and how far a fall in flight shows it lowered so far. */
  sunk: Float32Array;
  flight: Float32Array;
  baked: THREE.Mesh[];
  /** Baked bodies' meshes waiting to join the building's merged heap, and that heap (one mesh a material and layout:
   *  a hundred clumps lying still drew a hundred draw calls and their shadows each, the decisive wave's hitch probe). */
  bakedPending: THREE.Mesh[];
  bakedMerged: Map<string, THREE.Mesh>;
  mergedAt: number;
  /** (destruction-slabs 227 round 5) Per merged heap (its key), each vertex's body (its bake's count): a body's pieces do
   *  not hold one another up there either. */
  heapBody: Map<string, Int32Array>;
  /** (round 5; the round-4 critic's airfield #0 tower, seed 1147584926: a 3.7 x 3.2 m plate of its heap 1.3 m up, held
   *  when it baked by the tower's standing storey, 62-95 % over nothing for 4.5 s as the storeys under it fell) the heap's
   *  plates held when they baked, judged again: five times a second while the building changes, once a second after. */
  watch: Array<WatchedPlate & { key: string }>;
  watchedAt: number;
  /** When the building last changed here (a strike, a face's fall, a storey's, its release; fx s). */
  touchedAt: number;
  strikes: number;
  /** Its faces' redraws so far (collapseBodies' cut laid before the last is stale). */
  version: number;
  /** The last strike's point and time (fx s): the same burst's breach stage there a moment later is that round. */
  lastX: number;
  lastY: number;
  lastZ: number;
  lastAt: number;
}

const BAKE_STILL_S = 1;
/** (round 5) A heap's watched plates are judged this often (fx s) while their building changes and this long after. */
const WATCH_EVERY_S = 0.2, WATCH_AFTER_S = 6;
/** (round 5) And at all only this long after its building last changed (fx s): what holds a plate then is its building's
 *  heap and remnants at rest, which change only with the building (a touch watches its plates again). */
const WATCH_KEEP_S = 20;
/** A fracture body's rigid shape options: masonry lands dead and grips, rolls little and stops turning soon; one that
 *  still creeps four seconds on sleeps where it lies (integ's engine: rubbleBodies' law), so a heap leaves the solver
 *  within seconds (2026-10-15, the port's house probe: a heap of a hundred awake clumps was most of the frame). */
const BODY_SHAPE = { restitution: 0.12, friction: 0.78, rolling: 0.6, linearDrag: 0.05, angularDrag: 0.45, forceSleepS: 4 };
/** Clumps a chunk cracks into at most on a landing (each one more body for the solver). */
const CRACK_CLUMPS_MAX = 3;
/** Cracks an update performs at most (each makes a few bodies' geometry): the rest wait a frame, still whole. */
const CRACKS_PER_UPDATE = 1;
/** Work units an update spends by default (WORK_* below). */
const WORK_UNITS = 3600;
const WORK_SORT = 1, WORK_CUT = 3, WORK_BODY = 240, WORK_REDRAW = 320;
/** A body still this long (s) may bake early to make room in the fracture's share of the pool for a new round's body. */
const SHARE_STILL_S = 0.5;
const BAKE_AGE_S = 30;
/** A body this old moving slower than these is baked where it is (it rocks on the heap). */
const SLOW_AGE_S = 6, SLOW_MPS = 0.35, SLOW_RADS = 0.6;
/** What counts as all but stopped for the shove over of a piece standing on its edge (m/s, rad/s). */
const TIP_MPS = 0.3, TIP_RADS = 0.5;
const SOUND_GAP_S = 0.06;
/** (dcore 2026-10-11, wave 388a: "carton-like sections need chipping") a fallen chunk of six cells or more cracks on a
 *  landing this hard (m/s) into clumps of three or four cells along its courses, while the pool has room for them. */
const CRACK_MPS = 3;
/** (the decisive wave's barn: "bright, undusted, same-size bricks") how far what broke off is greyed toward its own dust. */
const DUST_COAT = 0.42;
/** A room's light behind a breach (its walls; the floor and ceiling by their own shade): the wall's colour in shade. */
const ROOM_SHADE = 0.6;
/** (round 5) A room's floor this far over its floor line (m): the storey under it draws its own top there. */
const ROOM_FLOOR_LIFT_M = 0.02;
const CRACK_MIN_CELLS = 6;
/** A gable's void cell's home (cutIntoCells): its row's nearest cell that is no void, else the nearest in the rows under it;
 *  none (STATIC_CELL) when the face has no such cell. */
function gableHome(grid: FaceGrid, cell: number): number {
  const rows = grid.rowStart.length - 1;
  let r = 0;
  while (r + 1 < rows && grid.rowStart[r + 1]! <= cell) r++;
  const u = (grid.cellU[2 * cell]! + grid.cellU[2 * cell + 1]!) / 2;
  for (let rr = r; rr >= 0; rr--) {
    let best = -1, bd = Infinity;
    for (let c = grid.rowStart[rr]!; c < grid.rowStart[rr + 1]!; c++) {
      if (grid.state[c] === CELL_VOID) continue;
      const d = Math.abs((grid.cellU[2 * c]! + grid.cellU[2 * c + 1]!) / 2 - u);
      if (d < bd) { bd = d; best = c; }
    }
    if (best >= 0) return best;
  }
  return STATIC_CELL;
}
/** Whether a gable face's topmost drawn row has a cell standing (HEAD_CELL stands while it does). */
function headStands(grid: FaceGrid): boolean {
  for (let r = grid.rowStart.length - 2; r >= 0; r--) {
    let any = false;
    for (let c = grid.rowStart[r]!; c < grid.rowStart[r + 1]!; c++) {
      if (grid.state[c] === CELL_VOID) continue;
      any = true;
      if (grid.state[c]! <= CELL_SPALLED || grid.state[c] === CELL_OPENING) return true;
    }
    if (any) return false;
  }
  return false;
}

/** (dcore 2026-10-11, wave 397: "from 1.80 s to 2.46 s the whole front hangs in its own plane as a staggered mosaic of
 *  loose rectangular panels") a wall that lost its footing leans out off its foot: every piece of a fallen cluster
 *  leaves with the cluster's lean (rad/s about the cluster's lowest course, along the wall), so its upper pieces go out
 *  over the street as they drop and its lowest slump into the breach, never a stack of blocks standing in the plane. */
const TOPPLE_W = 0.55;
const CAP_UV_DENSITY = 0.55;

function neutral(name: string): number {
  return name === 'color' || name === 'cotTint' || name === 'aTint' ? 1 : 0;
}

export function createStructureFracture(o: StructureFractureOptions): StructureFracture {
  const lives = new Map<number, Live>();
  const bodies = new Map<number, LiveBody>();
  /** The live bodies in a list as well (the update walks it: no iterator a frame); a body leaves it by swap. */
  const list: LiveBody[] = [];
  function unlist(b: LiveBody): void {
    if (bodies.get(b.handle) !== b) return;
    bodies.delete(b.handle);
    const i = list.indexOf(b);
    if (i >= 0) { list[i] = list[list.length - 1]; list.length--; }
  }
  const layouts = new WeakMap<THREE.BufferGeometry, Layout>();
  // (the coordinator's budget test, 2026-10-11: the house came down as whole slabs and a bare frame once the hitch's cuts
  // were in) ten bodies a round, as wave 397 judged it
  const bodiesPerStrike = Math.max(1, o.bodiesPerStrike ?? 8);
  // (wave 422: the house's upper storey and roof stood on a bare frame over the heap from 7 s to 12 s, its collapse
  // waiting outside a pool its cracked clumps had filled) the fracture holds half the pool at most: a round's body past
  // that takes the place of one that has lain still a while (baked into the heap a little early), else it is lost in
  // the round's dust; a chunk cracks into no more clumps than the share has room for
  const poolShare = Math.max(2, o.poolShare ?? 48);
  let skipped = 0;
  /** Buildings whose roof has fallen (round 4: their top storey's room is laid open to the sky). */
  const roofGone = new Set<number>();
  const outcome = createWallStrikeOutcome();
  let lastSoundS = -1;
  /** Chunks that landed hard this step (cracked after it: no body is spawned inside the pool's report). */
  const cracking: LiveBody[] = [];
  let lastUpdateS = o.now();
  let bakedCount = 0;

  o.pool.onImpact((x, y, z, speed, mass, handle) => {
    const b = bodies.get(handle);
    if (!b) return;
    if (!b.cracked && b.cells.length >= CRACK_MIN_CELLS * 2 && speed >= CRACK_MPS) { b.cracked = true; cracking.push(b); }
    o.onLanding?.(x, y, z, speed, mass, b.structureIdx);
    const t = o.now();
    if (b.sounds >= 3 || t - lastSoundS < SOUND_GAP_S) return;
    b.sounds++;
    lastSoundS = t;
    emitDebrisLanding(x, y, z, speed, mass);
  });
  o.pool.onEvict((handle, final) => {
    const b = bodies.get(handle);
    if (!b) return;
    writePose(b, final);
    // the pool gave it up already: baked where it lies, nothing to release
    bake(b, false);
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

  // ---- body frame -------------------------------------------------------------------------------------------------
  /** world = R(yaw)·body + placement (three's rotateY: x' = x c + z s, z' = −x s + z c). */
  function toWorld(live: Live, bx: number, by: number, bz: number, out: THREE.Vector3): THREE.Vector3 {
    const { x, y, z, yaw } = live.seam.anatomy.placement;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return out.set(x + bx * c + bz * s, y + by, z - bx * s + bz * c);
  }
  function dirToWorld(live: Live, bx: number, bz: number, out: THREE.Vector3): THREE.Vector3 {
    const yaw = live.seam.anatomy.placement.yaw, c = Math.cos(yaw), s = Math.sin(yaw);
    return out.set(bx * c + bz * s, 0, -bx * s + bz * c);
  }

  // ---- a face taken out of the buckets and cut between its cells ---------------------------------------------------
  /** The face a body-frame triangle belongs to: the nearest plane it lies on (or proud of, a sill, a shutter), inside
   *  the face's span and storey; its normal breaks a tie at a corner. −1 for none. */
  function faceOfTriangle(wall: WallFracture, cx: number, cy: number, cz: number, nx: number, ny: number, nz: number, wallPart = true,
    roofPart = false): number {
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < wall.faces.length; i++) {
      const g = wall.faces[i];
      const dx = cx - g.origin[0], dy = cy - g.origin[1], dz = cz - g.origin[2];
      const v = dy;
      if (v < -0.06 || v > g.height + 0.06) continue;
      const along = dx * g.u[0] + dz * g.u[2];
      if (Math.abs(along) > g.width / 2 + 0.06) continue;
      // over the storey's wall only the gable itself (under its sloping edges: never the roof's verge over them)
      if (v > g.wallHeight + 0.06 && v > gableTopAt(g, along) + 0.06) continue;
      const depth = dx * g.out[0] + dz * g.out[2];
      // (destruction-slabs 227 round 3) and over the wall no trim standing proud of the gable: the roof's verge
      // boards and barge (taken into the face, they stood as an A-frame over the roofless walls when the roof fell; left in
      // the world, the roof's fall takes them) — the gable's own timbers and frames lie flush with it or in it
      if (!wallPart && v > g.wallHeight + 0.06 && depth > 0.04) continue;
      // (and the roof's own triangles only as a gable over the wall: an eave's overhang a side face took stood on in its
      // top cells as long slivers in the air when the roof fell)
      if (roofPart && !(g.gableTop && v > g.wallHeight + 0.06)) continue;
      if (depth < -g.thickness - 0.15 || depth > 0.4) continue;
      const facing = nx * g.out[0] + ny * g.out[1] + nz * g.out[2];
      const score = Math.abs(depth > 0 ? depth : depth < -g.thickness ? -g.thickness - depth : 0) + Math.abs(depth) * 0.25 - 0.08 * Math.max(0, facing);
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return best;
  }

  /** Claim face `f`: every triangle of the building that is the face's, copied (body frame) and flattened in place. */
  /**
   * The building's triangles sorted by face, once (its first strike): each face's triangles copied in the body frame by
   * material, and where each lies in its bucket (to flatten it when its face is taken). A triangle no face owns (the
   * roof, a chimney, an interior) is left alone.
   */
  /** One slice of the sort, until done (true) or the update's work units are spent. */
  function sortByFaceSlice(live: Live): boolean {
    if (live.byFace) return true;
    const byFace = live.sorting ?? (live.sorting = new Map());
    const seam = live.seam;
    const { x: px, y: py, z: pz, yaw } = seam.anatomy.placement;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (let si = live.sortAt[0]; si < seam.spans.length; si++, live.sortAt[1] = 0) {
      live.sortAt[0] = si;
      const span = seam.spans[si];
      const mesh = span.mesh as THREE.Mesh;
      const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
      if (!geometry?.getAttribute || span.count < 3) continue;
      const material = o.materialFor(seam, span.bucket);
      if (!material) continue;
      const layout = layoutOf(geometry);
      const arr = span.position.array as Float32Array;
      const nrm = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
      const attrs = layout.names.map((name) => (geometry.getAttribute(name) as THREE.BufferAttribute | undefined) ?? null);
      for (let t = live.sortAt[1]; t + 2 < span.count; t += 3) {
        // a slice ends between triangles once the update's units are spent
        if ((t & 63) === 0 && t > live.sortAt[1] && units <= 0) { live.sortAt[1] = t; return false; }
        units -= WORK_SORT;
        const i0 = span.first + t;
        // its centroid and normal in the body frame (the buckets stand at identity: world = the attribute)
        let cx = 0, cy = 0, cz = 0;
        for (let k = 0; k < 3; k++) { cx += arr[(i0 + k) * 3]; cy += arr[(i0 + k) * 3 + 1]; cz += arr[(i0 + k) * 3 + 2]; }
        cx /= 3; cy /= 3; cz /= 3;
        // a flattened triangle (a clamp, a fallen section) has no area: skip it
        const ax = arr[i0 * 3], ay = arr[i0 * 3 + 1], az = arr[i0 * 3 + 2];
        const ux = arr[(i0 + 1) * 3] - ax, uy = arr[(i0 + 1) * 3 + 1] - ay, uz = arr[(i0 + 1) * 3 + 2] - az;
        const vx = arr[(i0 + 2) * 3] - ax, vy = arr[(i0 + 2) * 3 + 1] - ay, vz = arr[(i0 + 2) * 3 + 2] - az;
        const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
        const area2 = Math.hypot(fx, fy, fz);
        if (!(area2 > 1e-9)) continue;
        const wx = cx - px, wz = cz - pz;
        const bx = wx * c - wz * s, by = cy - py, bz = wx * s + wz * c;
        const bnx = (fx * c - fz * s) / area2, bny = fy / area2, bnz = (fx * s + fz * c) / area2;
        const f = faceOfTriangle(live.wall, bx, by, bz, bnx, bny, bnz, span.partClass !== 'trim', span.partClass === 'roof');
        if (f < 0) continue;
        let entry = byFace.get(f);
        if (!entry) { entry = { soups: new Map(), flat: [] }; byFace.set(f, entry); }
        let g = entry.soups.get(material);
        if (!g) { g = { layout, soup: [] }; entry.soups.set(material, g); }
        const soup = g.soup;
        for (let k = 0; k < 3; k++) {
          const at = i0 + k;
          const vxw = arr[at * 3] - px, vzw = arr[at * 3 + 2] - pz;
          soup.push(vxw * c - vzw * s, arr[at * 3 + 1] - py, vxw * s + vzw * c);
          let nx = bnx, ny = bny, nz = bnz;
          if (nrm) { const wnx = nrm.getX(at), wnz = nrm.getZ(at); nx = wnx * c - wnz * s; ny = nrm.getY(at); nz = wnx * s + wnz * c; }
          soup.push(nx, ny, nz);
          for (let a = 0; a < attrs.length; a++) {
            const attr = attrs[a], size = layout.sizes[a];
            for (let j = 0; j < size; j++) soup.push(attr && j < attr.itemSize ? attr.getComponent(at, j) : neutral(layout.names[a]));
          }
        }
        entry.flat.push([span, i0]);
      }
    }
    live.byFace = byFace;
    live.sorting = null;
    return true;
  }

  /** Take face `f`: its triangles flattened in their buckets (kept for the reset) and drawn again from its cells. */
  /** Triangles a slice of a face's cut takes between its budget checks. */
  const CUT_SLICE = 160;
  /** The current update's work units left (advanceWork sets them; Infinity for a flush). */
  let units = 0;
  /**
   * One slice of taking face `f` (true when it is taken): its triangles cut between its cells a slice at a time; once
   * whole, flattened in their buckets (kept for the reset) and the face drawn from its cells — the swap in one frame.
   */
  function claimFaceSlice(live: Live, f: number): boolean {
    if (live.faces.has(f) || live.wall.faces[f]!.notWall) return true;
    let job = live.claiming.get(f);
    if (!job) {
      const grid = live.wall.faces[f];
      // (round 4) a face whose slab draws no flat wall is not taken: its triangles stay where they are drawn, no cell of it
      // is drawn, no chunk of it is thrown, and no later round breaks it (lane B's penstock: a pipe's face drawn as a flat
      // patch of wall with its bands as bars in front of the pipe)
      if (!flatWallDrawn(grid, live.byFace!.get(f) ?? null)) {
        grid.notWall = true;
        for (let c = 0; c < grid.state.length; c++) grid.state[c] = CELL_VOID;
        return true;
      }
      const face = live.seam.anatomy.storeys[grid.storey].faces[grid.faceIndex];
      const core = face.layers.find((l) => l.material !== 'plaster' && l.material !== 'glass') ?? face.layers[face.layers.length - 1]
        ?? { material: grid.material, bucket: face.bucket, tint: [1, 1, 1], thicknessM: grid.thickness, share: 1 };
      const entry = live.byFace!.get(f) ?? null;
      let drawn = false;
      if (entry) for (const soup of entry.soups.values()) if (soup.soup.length) { drawn = true; break; }
      const draw: FaceDraw = { seam: live.seam, grid, face: f, drawn, groups: new Map(), meshes: [], core,
        depthMin: new Float32Array(grid.state.length).fill(-grid.thickness), depthMax: new Float32Array(grid.state.length), noCap: new Set() };
      job = { draw, entry, materials: entry ? [...entry.soups.keys()] : [], m: 0, tri: 0 };
      live.claiming.set(f, job);
    }
    const { draw, entry } = job;
    const grid = draw.grid;
    while (entry && job.m < job.materials.length) {
      const material = job.materials[job.m];
      const { layout, soup } = entry.soups.get(material)!;
      let g = draw.groups.get(material);
      if (!g) { g = { material, layout, cells: new Map(), core: new Map(), skin: new Map() }; draw.groups.set(material, g); }
      const tris = soup.length / (3 * layout.stride);
      while (job.tri < tris) {
        const to = Math.min(tris, job.tri + CUT_SLICE);
        cutIntoCells(grid, soup, layout.stride, g.cells, job.tri, to);
        units -= (to - job.tri) * WORK_CUT;
        job.tri = to;
        if (job.tri < tris && units <= 0) return false;
      }
      packGroup(draw, g);
      job.m++;
      job.tri = 0;
      if (job.m < job.materials.length && units <= 0) return false;
    }
    // whole: out of the buckets (flattened onto its first corner, back at the reset) and into the world drawn as cells
    if (entry) {
      const touchedSpans = new Set<StructureSpan>();
      for (const [span, i0] of entry.flat) {
        if (!touchedSpans.has(span)) { o.keepSpan(span); touchedSpans.add(span); }
        const arr = span.position.array as Float32Array;
        const ax = arr[i0 * 3], ay = arr[i0 * 3 + 1], az = arr[i0 * 3 + 2];
        for (let k = 1; k < 3; k++) { arr[(i0 + k) * 3] = ax; arr[(i0 + k) * 3 + 1] = ay; arr[(i0 + k) * 3 + 2] = az; }
      }
      for (const span of touchedSpans) { span.position.addUpdateRange(span.first * 3, span.count * 3); span.position.needsUpdate = true; }
      live.byFace!.delete(f);
    }
    live.claiming.delete(f);
    live.faces.set(f, draw);
    // drawn at once (a face out of its bucket must stand in the same frame)
    redraw(live, draw);
    o.onRedrawn?.(live.seam, grid.storey, grid.faceIndex, true);
    return true;
  }

  /**
   * Whether a face's slab draws a flat wall: its triangles facing along the face's normal (WALL_FILL_COS) cover WALL_FILL_MIN
   * or more of the face's wall below its gable (its cells over no drawn wall left out), rasterised at WALL_FILL_CELL_M.
   */
  function flatWallDrawn(grid: FaceGrid, entry: FaceSort | null): boolean {
    if (!entry) return false;
    const W = grid.width, H = grid.wallHeight;
    const nu = Math.max(1, Math.min(160, Math.ceil(W / WALL_FILL_CELL_M))), nv = Math.max(1, Math.min(80, Math.ceil(H / WALL_FILL_CELL_M)));
    const du = W / nu, dv = H / nv;
    const counted = new Uint8Array(nu * nv), covered = new Uint8Array(nu * nv);
    let total = 0;
    const rows = grid.rowY.length - 1;
    for (let j = 0; j < nv; j++) {
      const v = (j + 0.5) * dv;
      let r = 0;
      while (r < rows - 1 && v >= grid.rowY[r + 1]!) r++;
      for (let i = 0; i < nu; i++) {
        const u = -W / 2 + (i + 0.5) * du;
        let cell = -1;
        for (let c = grid.rowStart[r]!; c < grid.rowStart[r + 1]!; c++) if (u >= grid.cellU[2 * c]! && u <= grid.cellU[2 * c + 1]!) { cell = c; break; }
        if (cell >= 0 && (grid.absent[cell] || grid.state[cell] === CELL_VOID)) continue;
        counted[j * nu + i] = 1; total++;
      }
    }
    if (!total) return false;
    const ox = grid.origin[0], oy = grid.origin[1], oz = grid.origin[2];
    const ux = grid.u[0], uz = grid.u[2], outx = grid.out[0], outz = grid.out[2];
    for (const { layout, soup } of entry.soups.values()) {
      const st = layout.stride;
      for (let t = 0; t + 3 * st <= soup.length; t += 3 * st) {
        const ax = soup[t]!, ay = soup[t + 1]!, az = soup[t + 2]!;
        const bx = soup[t + st]!, by = soup[t + st + 1]!, bz = soup[t + st + 2]!;
        const cx = soup[t + 2 * st]!, cy = soup[t + 2 * st + 1]!, cz = soup[t + 2 * st + 2]!;
        const e1x = bx - ax, e1y = by - ay, e1z = bz - az, e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
        const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
        const nl = Math.hypot(nx, ny, nz);
        if (!(nl > 1e-9) || Math.abs(nx * outx + nz * outz) < WALL_FILL_COS * nl) continue;
        // its corners on the face (u, v)
        const pu0 = (ax - ox) * ux + (az - oz) * uz, pv0 = ay - oy;
        const pu1 = (bx - ox) * ux + (bz - oz) * uz, pv1 = by - oy;
        const pu2 = (cx - ox) * ux + (cz - oz) * uz, pv2 = cy - oy;
        const i0 = Math.max(0, Math.floor((Math.min(pu0, pu1, pu2) + W / 2) / du)), i1 = Math.min(nu - 1, Math.floor((Math.max(pu0, pu1, pu2) + W / 2) / du));
        const j0 = Math.max(0, Math.floor(Math.min(pv0, pv1, pv2) / dv)), j1 = Math.min(nv - 1, Math.floor(Math.max(pv0, pv1, pv2) / dv));
        const d = (pv1 - pv2) * (pu0 - pu2) + (pu2 - pu1) * (pv0 - pv2);
        if (Math.abs(d) < 1e-9) continue;
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const k = j * nu + i;
          if (!counted[k] || covered[k]) continue;
          const u = -W / 2 + (i + 0.5) * du, v = (j + 0.5) * dv;
          const l0 = ((pv1 - pv2) * (u - pu2) + (pu2 - pu1) * (v - pv2)) / d, l1 = ((pv2 - pv0) * (u - pu2) + (pu0 - pu2) * (v - pv2)) / d;
          if (l0 >= -0.02 && l1 >= -0.02 && l0 + l1 <= 1.02) covered[k] = 1;
        }
      }
    }
    let n = 0;
    for (let k = 0; k < covered.length; k++) n += covered[k]!;
    return n >= WALL_FILL_MIN * total;
  }

  // ---- cutting a soup between a face's cells ------------------------------------------------------------------------
  type Poly = Float64Array[];
  function clip(poly: Poly, nx: number, ny: number, nz: number, d: number, front: Poly, back: Poly): void {
    front.length = 0; back.length = 0;
    const count = poly.length, stride = poly[0].length;
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
  function emitPoly(list: number[], poly: Poly): void {
    const a = poly[0];
    for (let i = 1; i + 1 < poly.length; i++) {
      for (const v of [a, poly[i], poly[i + 1]]) for (let k = 0; k < v.length; k++) list.push(v[k]);
    }
  }
  function cutIntoCells(grid: FaceGrid, soup: number[], stride: number, cells: Map<number, number[]>, from = 0, to = Infinity): void {
    const rows = grid.rowY.length - 1;
    const oy = grid.origin[1];
    const ux = grid.u[0], uz = grid.u[2];
    const ou = grid.origin[0] * ux + grid.origin[2] * uz;
    const front: Poly = [], back: Poly = [];
    const tris = Math.min(to, soup.length / (3 * stride));
    const listOf = (cell0: number): number[] => {
      // (a gable's void cells over its sloping edges hold nothing: what reaches into one stands with the face)
      // (destruction-slabs 227 round 3: a gable's apex and the slivers of its edge over the sampled outline stood in the sky
      // as two triangles when the cells under them fell — they go with the gable's nearest cell; a stretch where no wall is
      // drawn stands with the face as before)
      const cell = cell0 < 0 || grid.state[cell0] !== CELL_VOID ? cell0 : grid.absent[cell0] === 1 ? STATIC_CELL : gableHome(grid, cell0);
      let list = cells.get(cell);
      if (!list) { list = []; cells.set(cell, list); }
      return list;
    };
    const keep = (poly: Poly | null): void => { if (poly) emitPoly(listOf(STATIC_CELL), poly); };
    /** The part of `poly` on the near side of a plane (back: n·p < d); what lies past it stays with the face (static). */
    const within = (poly: Poly | null, nx: number, ny: number, nz: number, d: number): Poly | null => {
      if (!poly) return null;
      clip(poly, nx, ny, nz, d, front, back);
      if (front.length >= 3) keep(front.slice());
      return back.length >= 3 ? back.slice() : null;
    };
    const half = grid.width / 2;
    const y0Face = oy + grid.rowY[0], y1Face = oy + grid.rowY[rows];
    /** The row a height falls in (clamped inside the face). */
    const rowOf = (y: number): number => {
      let r = 0;
      while (r < rows - 1 && y > oy + grid.rowY[r + 1]) r++;
      return r;
    };
    /** The cell of row `r` a face coordinate u falls in (clamped). */
    const cellOf = (r: number, u: number): number => {
      let c = grid.rowStart[r];
      while (c < grid.rowStart[r + 1] - 1 && u > grid.cellU[2 * c + 1]) c++;
      return c;
    };
    for (let t = from; t < tris; t++) {
      const base = t * 3 * stride;
      // the triangle's extent on the face (height, and u along it)
      let yMin = Infinity, yMax = -Infinity, uMin = Infinity, uMax = -Infinity;
      for (let k = 0; k < 3; k++) {
        const at = base + k * stride;
        const y = soup[at + 1], u = soup[at] * ux + soup[at + 2] * uz - ou;
        if (y < yMin) yMin = y; if (y > yMax) yMax = y;
        if (u < uMin) uMin = u; if (u > uMax) uMax = u;
      }
      const eps = 1e-5;
      const inside = yMin >= y0Face - eps && yMax <= y1Face + eps && uMin >= -half - eps && uMax <= half + eps;
      // the fast path: a triangle inside one cell (most of a building's detail) goes to it whole, nothing cut
      if (inside) {
        const r = rowOf((yMin + yMax) / 2);
        if (yMin >= oy + grid.rowY[r] - eps && yMax <= oy + grid.rowY[r + 1] + eps) {
          const c = cellOf(r, (uMin + uMax) / 2);
          if (uMin >= grid.cellU[2 * c] - eps && uMax <= grid.cellU[2 * c + 1] + eps) {
            const list = listOf(c);
            for (let i = 0; i < 3 * stride; i++) list.push(soup[base + i]);
            continue;
          }
        }
      }
      const poly0: Poly = [0, 1, 2].map((k) => Float64Array.from(soup.slice(base + k * stride, base + (k + 1) * stride)));
      // the face's own rectangle: what reaches past its foot, its head or its ends (a plinth's lip, an eave's board, a
      // corner's trim) stays standing with the face, never with a cell
      let poly: Poly | null = poly0;
      if (!inside) {
        poly = within(poly, 0, -1, 0, -y0Face);
        // (destruction-slabs 227 round 3) a gable's head is its apex: what reaches over it (the roof's cap over the gable,
        // drawn in the roof's bucket) goes with the gable's top cell under it — standing with the face, it was left in the
        // sky as two triangles when the gable's cells fell under it
        if (grid.gableTop && poly) {
          clip(poly, 0, 1, 0, y1Face, front, back);
          if (front.length >= 3) emitPoly(listOf(HEAD_CELL), front.slice());
          poly = back.length >= 3 ? back.slice() : null;
        } else poly = within(poly, 0, 1, 0, y1Face);
        // (destruction-slabs 227 round 3) what reaches past its ends (a sill beam running round the corner, an end board) goes
        // with its row's end cell — standing with the face, a 10 m rail stood in the air over a storey's fallen cells
        for (const side of [1, -1] as const) {
          if (!poly) break;
          clip(poly, ux * side, 0, uz * side, side > 0 ? ou + half : -(ou - half), front, back);
          const keepBack = back.length >= 3 ? back.slice() : null;
          if (front.length >= 3) {
            // row by row (a corner board the face's height falls a row at a time with its end cells)
            let rest: Poly | null = front.slice();
            let ylo = Infinity, yhi = -Infinity;
            for (const v of rest) { if (v[1]! < ylo) ylo = v[1]!; if (v[1]! > yhi) yhi = v[1]!; }
            const r1 = rowOf(Math.min(y1Face, yhi));
            for (let r = rowOf(Math.max(y0Face, ylo)); r <= r1 && rest; r++) {
              let inRow: Poly | null;
              if (r === r1) { inRow = rest; rest = null; }
              else {
                clip(rest, 0, 1, 0, oy + grid.rowY[r + 1]!, front, back);
                inRow = back.length >= 3 ? back.slice() : null;
                rest = front.length >= 3 ? front.slice() : null;
              }
              if (inRow) emitPoly(listOf(side > 0 ? grid.rowStart[r + 1]! - 1 : grid.rowStart[r]!), inRow);
            }
          }
          poly = keepBack;
        }
        if (!poly) continue;
      }
      // rows the polygon spans, from its lowest: peel each row off (what is under its top is that row's)
      let rest: Poly | null = poly;
      const r1 = rowOf(Math.min(y1Face, yMax));
      for (let r = rowOf(Math.max(y0Face, yMin)); r <= r1 && rest; r++) {
        const top = oy + grid.rowY[r + 1];
        let inRow: Poly | null;
        if (r === r1) { inRow = rest; rest = null; }
        else {
          clip(rest, 0, 1, 0, top, front, back);
          inRow = back.length >= 3 ? back.slice() : null;
          rest = front.length >= 3 ? front.slice() : null;
        }
        if (!inRow) continue;
        // the cells it spans along u, from its leftmost: peel each cell off
        let restU: Poly | null = inRow;
        const c1 = cellOf(r, Math.min(half, uMax));
        for (let cIdx = cellOf(r, Math.max(-half, uMin)); cIdx <= c1 && restU; cIdx++) {
          let inCell: Poly | null;
          if (cIdx === c1) { inCell = restU; restU = null; }
          else {
            clip(restU, ux, 0, uz, ou + grid.cellU[2 * cIdx + 1], front, back);
            inCell = back.length >= 3 ? back.slice() : null;
            restU = front.length >= 3 ? front.slice() : null;
          }
          if (inCell) emitPoly(listOf(cIdx), inCell);
        }
      }
    }
  }

  // ---- what stands: one mesh a material, the reveals and recesses ---------------------------------------------------
  const rect: [number, number, number, number] = [0, 0, 0, 0];
  const nb: [number, number, number, number] = [0, 0, 0, 0];
  const standingState = (state: number): boolean => state <= CELL_SPALLED;
  /** A cap quad (body frame corners, its outward normal) into a material's list in its layout, tinted. */
  function pushQuad(list: number[], layout: Layout, a: number[], b: number[], cc: number[], d: number[], n: number[],
    tint: readonly number[], shade: number): void {
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    const uvOf = (p: number[]): [number, number] => (ax >= ay && ax >= az ? [p[2] * CAP_UV_DENSITY, p[1] * CAP_UV_DENSITY]
      : ay >= az ? [p[0] * CAP_UV_DENSITY, p[2] * CAP_UV_DENSITY] : [p[0] * CAP_UV_DENSITY, p[1] * CAP_UV_DENSITY]);
    const vert = (p: number[]): void => {
      list.push(p[0], p[1], p[2], n[0], n[1], n[2]);
      for (let i = 0; i < layout.names.length; i++) {
        const name = layout.names[i], size = layout.sizes[i];
        if (name === 'uv') { const uv = uvOf(p); list.push(uv[0], uv[1]); for (let j = 2; j < size; j++) list.push(0); }
        else if (name === 'color') { list.push(tint[0] * shade, tint[1] * shade, tint[2] * shade); for (let j = 3; j < size; j++) list.push(1); }
        else for (let j = 0; j < size; j++) list.push(neutral(name));
      }
    };
    const tri = (p: number[], q: number[], r: number[]): void => {
      const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], wx = r[0] - p[0], wy = r[1] - p[1], wz = r[2] - p[2];
      const facing = (uy * wz - uz * wy) * n[0] + (uz * wx - ux * wz) * n[1] + (ux * wy - uy * wx) * n[2] >= 0;
      if (facing) { vert(p); vert(q); vert(r); } else { vert(p); vert(r); vert(q); }
    };
    tri(a, b, cc);
    tri(a, cc, d);
  }
  /** A face point (u along it, v over the storey floor, depth along its outward normal) in the body frame. */
  function facePoint(g: FaceGrid, u: number, v: number, depth: number): number[] {
    return [g.origin[0] + g.u[0] * u + g.out[0] * depth, g.origin[1] + v, g.origin[2] + g.u[2] * u + g.out[2] * depth];
  }
  function capGroup(draw: FaceDraw): FaceGroup | null {
    const material = o.materialFor(draw.seam, draw.core.bucket);
    if (material) {
      let g = draw.groups.get(material);
      if (!g) {
        g = { material, layout: { names: ['uv', 'color'], sizes: [2, 3], stride: 11 }, cells: new Map(), core: new Map(), skin: new Map() };
        draw.groups.set(material, g);
      }
      return g;
    }
    return draw.groups.values().next().value ?? null;
  }
  /** Whether the neighbour cells over [u0, u1] in row `r` are gone (or fallen); a face's edge is no neighbour. */
  function openSpans(g: FaceGrid, r: number, u0: number, u1: number, out: number[]): void {
    out.length = 0;
    if (r < 0 || r >= g.rowY.length - 1) return;
    for (let c = g.rowStart[r]; c < g.rowStart[r + 1]; c++) {
      const a = Math.max(u0, g.cellU[2 * c]), b = Math.min(u1, g.cellU[2 * c + 1]);
      if (b - a < 1e-4) continue;
      const st = g.state[c];
      if (st === CELL_GONE || st === CELL_FALLEN) out.push(a, b);
    }
  }
  const _spans: number[] = [];
  /**
   * How far a cracked cell stands out of its face (m: mostly out, a few pushed back), from the cell's own hash: (wave
   * 397: "at 1.00 s the whole gable has already split into a uniform mosaic of chunks") only one cell in two, and by how
   * far its damage has gone past the crack toward a spall, so the courses near a hole stand loose and the crack ring
   * farther out lies flush with its cracks between.
   */
  function looseOf(g: FaceGrid, cell: number): number {
    const h = (Math.imul(cell + 1, 0x9e3779b1) ^ Math.imul(Math.round(g.origin[0] * 100) + g.storey * 131, 0x85ebca6b)) >>> 0;
    const h01 = (h % 1000) / 1000;
    const k = Math.min(1, Math.max(0, (g.damage[cell] - CRACK_AT) / (SPALL_AT - CRACK_AT)));
    if (h01 < 0.5 || k <= 0) return 0;
    return k * ((h01 - 0.5) * 2 * 0.045 - 0.012);
  }
  /** Rebuild a face's standing meshes from its cells. */
  /** A face group's cut triangles packed by cell into its core and its skin (typed: a redraw copies them whole), and each
   *  cell's depth bounds widened to what it carries. */
  function packGroup(draw: FaceDraw, fg: FaceGroup): void {
    const g = draw.grid, stride = fg.layout.stride;
    for (const [cell, list] of fg.cells) {
      if (cell < 0) { fg.core.set(cell, Float32Array.from(list)); continue; }
      let skinN = 0;
      const isSkin = new Uint8Array(list.length / (stride * 3));
      for (let t = 0, i = 0; i < list.length; t++, i += stride * 3) {
        let depth = 0;
        for (let k = 0; k < 3; k++) {
          const at = i + k * stride;
          const d = (list[at] - g.origin[0]) * g.out[0] + (list[at + 2] - g.origin[2]) * g.out[2];
          depth += d;
          if (d < draw.depthMin[cell]) draw.depthMin[cell] = d;
          if (d > draw.depthMax[cell]) draw.depthMax[cell] = d;
        }
        if (depth / 3 > -g.skinM) { isSkin[t] = 1; skinN++; }
      }
      const tri = stride * 3;
      const core = new Float32Array((isSkin.length - skinN) * tri), skin = new Float32Array(skinN * tri);
      for (let t = 0, c = 0, k = 0; t < isSkin.length; t++) {
        const from = t * tri;
        if (isSkin[t]) { for (let j = 0; j < tri; j++) skin[k * tri + j] = list[from + j]; k++; }
        else { for (let j = 0; j < tri; j++) core[c * tri + j] = list[from + j]; c++; }
      }
      if (core.length) fg.core.set(cell, core);
      if (skin.length) fg.skin.set(cell, skin);
    }
    fg.cells.clear();
  }

  /** Rebuild a face's standing meshes from its packed cells (typed copies; the per-vertex work only where a cell sags or
   *  stands loose). */
  function redraw(live: Live, draw: FaceDraw): void {
    for (const mesh of draw.meshes) { o.group.remove(mesh); mesh.geometry.dispose(); }
    draw.meshes.length = 0;
    const g = draw.grid;
    const rows = g.rowY.length - 1;
    // the reveals and recesses in the wall's core (small: a few quads a broken edge); none on a face that drew nothing
    const caps: number[] = [];
    /** Each capped cell's reveals in `caps`: [from, to, cell] (floats). */
    const capRanges: number[] = [];
    const cg = draw.drawn ? capGroup(draw) : null;
    if (cg) {
      const tint = draw.core.tint;
      const T = g.thickness;
      // (destruction-slabs 227 round 3) only a cell that draws something has a broken edge to cap: a standing cell over no
      // drawn wall (a frame's open bay, a wall the face runs past) drew its reveals as long bare strips in the air
      const filled = new Set<number>();
      for (const fg of draw.groups.values()) { for (const cell of fg.core.keys()) filled.add(cell); for (const cell of fg.skin.keys()) filled.add(cell); }
      for (let r = 0; r < rows; r++) {
        for (let c = g.rowStart[r]; c < g.rowStart[r + 1]; c++) {
          const st = g.state[c];
          if (!standingState(st) || !filled.has(c) || draw.noCap.has(c)) continue;
          const capFrom = caps.length;
          cellRect(g, c, rect);
          const [u0, u1, y0, y1] = rect;
          const sag = g.sag[c];
          const front = st === CELL_SPALLED ? -g.skinM : 0;
          if (st === CELL_SPALLED) {
            // the recess: the core a skin's depth back, darker (wave 407: "the dart hits leave crisp brick-shaped voids
            // with no spall crater, chipping or cracks round them": the crater round a hole reads dark)
            pushQuad(caps, cg.layout, facePoint(g, u0, y0 - sag, front), facePoint(g, u1, y0 - sag, front), facePoint(g, u1, y1 - sag, front),
              facePoint(g, u0, y1 - sag, front), [g.out[0], 0, g.out[2]], tint, 0.66);
          } else if (st === CELL_CRACKED && g.bonded) {
            // the cracks round a hole: dark lines along a course's joints, the nearer the hole (the more hurt) the wider and
            // the more of them, a bed joint or a head joint by the cell's own hash, so they step through the bond
            const k = Math.min(1, Math.max(0, (g.damage[c] - CRACK_AT) / (SPALL_AT - CRACK_AT)));
            if (k >= 0.15) {
              const h = (Math.imul(c + 1, 0x85ebca6b) ^ Math.imul(g.storey + 3, 0x9e3779b1)) >>> 0;
              const w = 0.007 + 0.012 * k, z = Math.max(0, looseOf(g, c)) + 0.004;
              const nOut = [g.out[0], 0, g.out[2]];
              if ((h & 3) !== 0 || k > 0.6) {
                // its bed joint over it
                pushQuad(caps, cg.layout, facePoint(g, u0, y1 - sag - w, z), facePoint(g, u1, y1 - sag - w, z), facePoint(g, u1, y1 - sag + w, z),
                  facePoint(g, u0, y1 - sag + w, z), nOut, tint, 0.28);
              }
              if ((h & 4) !== 0) {
                // a head joint at one end
                const ue = (h & 8) !== 0 ? u1 : u0;
                pushQuad(caps, cg.layout, facePoint(g, ue - w, y0 - sag, z), facePoint(g, ue + w, y0 - sag, z), facePoint(g, ue + w, y1 - sag, z),
                  facePoint(g, ue - w, y1 - sag, z), nOut, tint, 0.28);
              }
            }
          }
          // the reveal on each side that opens onto a gone or fallen cell (an opening has its own)
          const side = (pa: number[], pb: number[], n: number[], shade: number): void => {
            pushQuad(caps, cg.layout, pa, pb, [pb[0] - g.out[0] * (T + front), pb[1], pb[2] - g.out[2] * (T + front)],
              [pa[0] - g.out[0] * (T + front), pa[1], pa[2] - g.out[2] * (T + front)], n, tint, shade);
          };
          const goneState = (state: number): boolean => state === CELL_GONE || state === CELL_FALLEN;
          if (c > g.rowStart[r] && goneState(g.state[c - 1])) side(facePoint(g, u0, y0 - sag, front), facePoint(g, u0, y1 - sag, front), [-g.u[0], 0, -g.u[2]], 0.7);
          if (c + 1 < g.rowStart[r + 1] && goneState(g.state[c + 1])) side(facePoint(g, u1, y1 - sag, front), facePoint(g, u1, y0 - sag, front), [g.u[0], 0, g.u[2]], 0.7);
          openSpans(g, r + 1, u0, u1, _spans);
          for (let k = 0; k < _spans.length; k += 2) side(facePoint(g, _spans[k + 1], y1 - sag, front), facePoint(g, _spans[k], y1 - sag, front), [0, 1, 0], 0.85);
          openSpans(g, r - 1, u0, u1, _spans);
          for (let k = 0; k < _spans.length; k += 2) side(facePoint(g, _spans[k], y0 - sag, front), facePoint(g, _spans[k + 1], y0 - sag, front), [0, -1, 0], 0.55);
          if (caps.length > capFrom) capRanges.push(capFrom, caps.length, c);
        }
      }
    }
    for (const fg of draw.groups.values()) {
      const stride = fg.layout.stride;
      // what stands: a standing cell's core, its skin unless spalled; an opening's frame while its jambs stand
      let total = fg === cg ? caps.length : 0;
      const head = headStands(g);
      for (const [cell, arr] of fg.core) if (cell === STATIC_CELL || (cell === HEAD_CELL ? head : drawnCore(g.state[cell]))) total += arr.length;
      for (const [cell, arr] of fg.skin) if (drawnSkin(g.state[cell])) total += arr.length;
      if (!total) continue;
      const buf = new Float32Array(total);
      let at = 0;
      // (each cell's triangles in the mesh: a piece of it cut loose is found by its cells)
      const ranges: number[] = [];
      const put = (cell: number, arr: Float32Array): void => {
        ranges.push(at / (3 * stride), (at + arr.length) / (3 * stride), cell);
        buf.set(arr, at);
        if (cell >= 0) {
          // (dcore 2026-10-11, the decisive wave's house: a plastered timber frame's cracked cells shoved in and out read
          // as a mosaic of loose tiles with dark slivers between) only coursed masonry stands loose in its course
          const sag = g.sag[cell], loose = g.bonded && g.state[cell] === CELL_CRACKED ? looseOf(g, cell) : 0;
          if (sag > 0 || loose !== 0) {
            for (let i = at; i < at + arr.length; i += stride) {
              buf[i + 1] -= sag;
              buf[i] += g.out[0] * loose; buf[i + 2] += g.out[2] * loose;
            }
          }
        }
        at += arr.length;
      };
      for (const [cell, arr] of fg.core) if (cell === STATIC_CELL || (cell === HEAD_CELL ? head : drawnCore(g.state[cell]))) put(cell, arr);
      for (const [cell, arr] of fg.skin) if (drawnSkin(g.state[cell])) put(cell, arr);
      if (fg === cg) {
        for (let i = 0; i < caps.length; i++) buf[at + i] = caps[i];
        for (let k = 0; k < capRanges.length; k += 3) ranges.push((at + capRanges[k]!) / (3 * stride), (at + capRanges[k + 1]!) / (3 * stride), CAP_CELL - capRanges[k + 2]!);
      }
      const mesh = new THREE.Mesh(interleavedOf(fg.layout, buf, faceSphere(g)), fg.material);
      mesh.matrixAutoUpdate = false;
      bodyToWorld(live, mesh.matrix);
      mesh.matrix.elements[13] -= live.flight[g.storey] ?? 0;
      // (dcore 2026-10-11: a face drawn in the body frame was never carried to the world — a matrix set by hand under a
      // static group is left out of the world update unless flagged, so the redrawn front stood at the world's origin and
      // the house showed a hole where its face was)
      mesh.matrixWorldNeedsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.structureFractureFace = true;
      mesh.userData.cellRanges = ranges;
      mesh.name = `fx-fracture-face-${live.seam.structureIdx}`;
      o.group.add(mesh);
      draw.meshes.push(mesh);
    }
    live.seam.touchShadows();
  }
  const drawnCore = (state: number): boolean => state <= CELL_SPALLED || state === CELL_OPENING;
  const drawnSkin = (state: number): boolean => state < CELL_SPALLED || state === CELL_OPENING;

  /** A packed list as a geometry with no copy: its stride as one interleaved buffer, the attributes at their offsets
   *  (the building's body frame; the mesh's matrix carries it to the world). */
  function interleavedOf(layout: Layout, list: Float32Array, sphere: THREE.Sphere | null = null): THREE.BufferGeometry {
    const buffer = new THREE.InterleavedBuffer(list, layout.stride);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(buffer, 3, 0));
    geometry.setAttribute('normal', new THREE.InterleavedBufferAttribute(buffer, 3, 3));
    let offset = 6;
    layout.names.forEach((name, a) => { geometry.setAttribute(name, new THREE.InterleavedBufferAttribute(buffer, layout.sizes[a], offset)); offset += layout.sizes[a]; });
    // the culling sphere from what the caller knows (a face's rectangle, a body's box): a pass over every corner of an
    // interleaved buffer was a strike's slowest step
    if (sphere) geometry.boundingSphere = sphere; else geometry.computeBoundingSphere();
    return geometry;
  }
  /** A face's culling sphere in the body frame: its rectangle, the wall behind it and a margin for what stands proud. */
  function faceSphere(g: FaceGrid): THREE.Sphere {
    const c = facePoint(g, 0, g.height / 2, -g.thickness / 2);
    return new THREE.Sphere(new THREE.Vector3(c[0], c[1], c[2]), Math.hypot(g.width / 2, g.height / 2, g.thickness) + 0.6);
  }
  /** The building's body frame to the world (its placement: rotateY(yaw), then the translation). */
  function bodyToWorld(live: Live, out: THREE.Matrix4): THREE.Matrix4 {
    const { x, y, z, yaw } = live.seam.anatomy.placement;
    return out.compose(_v.set(x, y, z), _q.setFromAxisAngle(_up, yaw), _s);
  }

  // ---- the room behind a holed storey -------------------------------------------------------------------------------
  /**
   * (destruction-slabs 227) the room behind a holed storey is its drawn enclosure behind the hole (structureEnclosure
   * storeyInterior: the enclosed component behind its gone cells, under what covers it), never the box the anatomy's
   * faces span about the origin; none where the band encloses under half its box (a frame, a pipe run, a tank farm).
   */
  function roomFor(live: Live, storey: number, draw: FaceDraw): void {
    const a = live.seam.anatomy;
    const st = a.storeys[storey];
    const cg = capGroup(draw);
    if (!cg || !st) return;
    // the hint: the middle of the face's gone cells, behind the wall
    const g = draw.grid;
    let su = 0, sn = 0;
    for (let c = 0; c < g.state.length; c++) {
      if (g.state[c] !== CELL_GONE && g.state[c] !== CELL_FALLEN) continue;
      cellRect(g, c, rect);
      su += (rect[0] + rect[1]) / 2; sn++;
    }
    const hu = sn ? su / sn : 0;
    const back = g.thickness + 0.5;
    const hx = g.origin[0] + g.u[0] * hu - g.out[0] * back, hz = g.origin[2] + g.u[2] * hu - g.out[2] * back;
    const interior = storeyInterior(a, storey, hx, hz, (a.storeys[storey + 1]?.y0 ?? st.y1) - 0.02);
    if (!interior || live.roomStoreys.has(interior.key)) return;
    live.roomStoreys.add(interior.key);
    const roomLayout: Layout = { names: ['uv', 'color'], sizes: [2, 3], stride: 11 };
    const room = o.roomMaterial?.(live.seam, draw.core.bucket) ?? null;
    const layout = room ? roomLayout : cg.layout;
    const material = room ?? cg.material;
    const { y0, y1 } = interior;
    // (destruction-slabs 227 round 3, the owner's "dark grey-navy slabs" and the visual critic's: a blown-out facade showed
    // the room's far wall as one flat untextured dark plane filling the building) the room in the wall's own colour, in
    // shade — an interior, its texture readable — never the near-black void the anatomy's interior colour drew
    const col = room ? draw.core.tint : a.interior.color;
    const list: number[] = [];
    // inward-facing walls, floor and ceiling of the storey's room
    // (round 4, tavern #7) the top storey's room under a roof that has fallen has no ceiling: open to the sky, never a lid —
    // (round 5) and lit as the sky lights it, not in an interior's shade
    const open = storey === a.storeys.length - 1 && !!a.roof && roofGone.has(live.seam.structureIdx);
    const q = (p0: number[], p1: number[], p2: number[], p3: number[], n: number[], shade: number) =>
      pushQuad(list, layout, p0, p1, p2, p3, n, col, room && !open ? shade * ROOM_SHADE : shade);
    for (const [ax, az, bx, bz, nx, nz] of interior.walls) q([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], [nx, 0, nz], Math.abs(nx) > 0.5 ? 0.9 : 1);
    // (round 5) its floor a hand over the floor line, where the storey under it draws its top
    const fy = y0 + ROOM_FLOOR_LIFT_M;
    for (const [x0, z0, x1, z1] of interior.rects) q([x0, fy, z0], [x1, fy, z0], [x1, fy, z1], [x0, fy, z1], [0, 1, 0], 0.9);
    // (the ceilings last: a roof that falls after this room was laid takes them by the draw range)
    const ceilFrom = list.length / layout.stride;
    if (!open) for (const [x0, z0, x1, z1] of interior.rects) q([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, -1, 0], 0.7);
    if (!list.length) return;
    const mesh = new THREE.Mesh(interleavedOf(layout, Float32Array.from(list)), material);
    mesh.name = `fx-fracture-room-${live.seam.structureIdx}`;
    mesh.userData.storey = storey;
    mesh.userData.roomKey = interior.key;
    mesh.userData.ceilFrom = ceilFrom;
    mesh.userData.roomShade = room && !open ? ROOM_SHADE : 1;
    mesh.matrixAutoUpdate = false;
    bodyToWorld(live, mesh.matrix);
    mesh.matrix.elements[13] -= (live.sunk[storey] ?? 0) + (live.flight[storey] ?? 0);
    mesh.matrixWorldNeedsUpdate = true;
    mesh.receiveShadow = true;
    o.group.add(mesh);
    live.room.push(mesh);
  }

  // ---- the roof sags over a wall that went from under it (S2) --------------------------------------------------------
  /**
   * Where the top storey's walls lost their top courses, the roof over them has lost its bearing: it sags there, most
   * at the eave over the middle of the gap and nothing at the ridge (its rafters pivot there), as far as the gap is wide
   * (a metre and a half lets it down a few centimetres, three metres or more a good half metre). The building's roof
   * triangles move in the buckets (kept for the reset), by the difference from what they sagged before.
   */
  function sagRoof(live: Live): void {
    const a = live.seam.anatomy;
    const roof = a.roof;
    if (!roof || !a.storeys.length) return;
    const top = a.storeys.length - 1;
    // each top-storey face's gaps along its top row: [face index, u0, u1] in its own frame
    const gaps: Array<[FaceGrid, number, number]> = [];
    live.wall.faces.forEach((g) => {
      if (g.storey !== top) return;
      let r = g.rowY.length - 2;
      while (r > 0 && g.rowY[r + 1] > g.wallHeight + 1e-4) r--;
      let run0 = NaN;
      for (let c = g.rowStart[r]; c <= g.rowStart[r + 1]; c++) {
        const gone = c < g.rowStart[r + 1] && (g.state[c] === CELL_GONE || g.state[c] === CELL_FALLEN);
        if (gone && Number.isNaN(run0)) run0 = g.cellU[2 * c];
        if (!gone && !Number.isNaN(run0)) {
          const run1 = g.cellU[2 * (c - 1) + 1];
          if (run1 - run0 >= 1.2) gaps.push([g, run0, run1]);
          run0 = NaN;
        }
      }
    });
    if (!gaps.length && !live.sag.size) return;
    const { x: px, y: py, z: pz, yaw } = a.placement;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const eave = roof.eaveY, rise = Math.max(0.3, roof.ridgeY - roof.eaveY);
    // the sag a body-frame point takes from every gap (the deepest wins)
    const sagAt = (bx: number, by: number, bz: number): number => {
      if (by < eave - 0.15) return 0;
      let drop = 0;
      for (const [g, u0, u1] of gaps) {
        const dx = bx - g.origin[0], dz = bz - g.origin[2];
        const along = dx * g.u[0] + dz * g.u[2];
        const inward = -(dx * g.out[0] + dz * g.out[2]); // from the face's plane into the building
        if (along <= u0 || along >= u1 || inward < -1.2) continue;
        const span = u1 - u0, t = (along - u0) / span;
        const depth = Math.min(0.6, 0.06 * span * span);
        // over the face: full at the eave line, nothing at the ridge (by height up the roof)
        const toRidge = Math.max(0, Math.min(1, 1 - (by - eave) / rise));
        drop = Math.max(drop, depth * 4 * t * (1 - t) * toRidge * (inward < 0 ? 1 + inward / 1.2 : 1));
      }
      return drop;
    };
    // the gaps as they stand: nothing to do when they are what they were at the last strike
    const signature = gaps.map(([g, u0, u1]) => `${live.wall.faces.indexOf(g)}:${u0.toFixed(2)}:${u1.toFixed(2)}`).join('|');
    if (signature === live.sagSignature) return;
    live.sagSignature = signature;
    // the roof's corners over the eaves (body frame, as they stood), gathered once a building
    if (!live.roofCorners) {
      live.roofCorners = [];
      for (const span of live.seam.spans) {
        if (span.partClass !== 'roof' && span.partClass !== 'trim') continue;
        const arr = span.position.array as Float32Array;
        const idx: number[] = [], xyz: number[] = [];
        for (let k = 0; k < span.count; k++) {
          const i = span.first + k;
          const by = arr[i * 3 + 1] - py;
          if (by < eave - 0.15) continue;
          const wx = arr[i * 3] - px, wz = arr[i * 3 + 2] - pz;
          idx.push(k); xyz.push(wx * c - wz * s, by, wx * s + wz * c);
        }
        if (idx.length) live.roofCorners.push({ span, idx: Int32Array.from(idx), xyz: Float32Array.from(xyz) });
      }
    }
    let changed = false;
    for (const { span, idx, xyz } of live.roofCorners) {
      const arr = span.position.array as Float32Array;
      let applied = live.sag.get(span);
      let moved = false;
      for (let n = 0; n < idx.length; n++) {
        const k = idx[n];
        const before = applied ? applied[k] : 0;
        const drop = sagAt(xyz[n * 3], xyz[n * 3 + 1], xyz[n * 3 + 2]);
        if (Math.abs(drop - before) < 1e-4) continue;
        if (!applied) { o.keepSpan(span); applied = new Float32Array(span.count); live.sag.set(span, applied); }
        arr[(span.first + k) * 3 + 1] -= drop - before;
        applied[k] = drop;
        moved = true;
      }
      if (moved) { span.position.addUpdateRange(span.first * 3, span.count * 3); span.position.needsUpdate = true; changed = true; }
    }
    if (changed) live.seam.touchShadows();
  }

  // ---- bodies --------------------------------------------------------------------------------------------------------
  const _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1), _v = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _basis = new THREE.Matrix4();
  /**
   * A body of cells (face, cell pairs; every cell of one face stack, so one face frame): its triangles and its caps in
   * its own frame, its box parts, spawned with the given velocity (world, m/s) and spin.
   */
  function spawnCells(live: Live, cells: number[], vx: number, vy: number, vz: number, spin: number, seed: number,
    at: THREE.Matrix4 | null = null, lean: readonly number[] | null = null): boolean {
    if (!cells.length) return false;
    if (bodies.size >= poolShare && !bakeStillest()) { skipped++; refuse(live, cells, vx, vy, vz, at); return false; }
    const g0 = live.wall.faces[cells[0]];
    // the body's frame: the cells' centre, axes along the face (u, up, out)
    let cu = 0, cv = 0, n = 0, mass = 0;
    // every cell in g0's face frame: an upper storey's face may stand out over the one below (a jetty) or off its centre
    const rects: Array<[number, number, number, number, FaceGrid, number, number]> = [];
    for (let i = 0; i < cells.length; i += 2) {
      const g = live.wall.faces[cells[i]];
      cellRect(g, cells[i + 1], nb);
      const ox = g.origin[0] - g0.origin[0], oz = g.origin[2] - g0.origin[2];
      const du = ox * g0.u[0] + oz * g0.u[2], dd = ox * g0.out[0] + oz * g0.out[2];
      const v0 = nb[2] + g.origin[1] - g0.origin[1], v1 = nb[3] + g.origin[1] - g0.origin[1];
      rects.push([nb[0] + du, nb[1] + du, v0, v1, g, cells[i + 1], dd]);
      const area = (nb[1] - nb[0]) * (v1 - v0);
      cu += ((nb[0] + nb[1]) / 2 + du) * area; cv += (v0 + v1) / 2 * area; n += area;
      mass += area * g.thickness * densityOf(g.material);
    }
    cu /= n; cv /= n;
    const T = g0.thickness;
    const centre = facePoint(g0, cu, cv, -T / 2);
    _basis.makeBasis(new THREE.Vector3(g0.u[0], 0, g0.u[2]), new THREE.Vector3(0, 1, 0), new THREE.Vector3(g0.out[0], 0, g0.out[2]));
    const qBody = new THREE.Quaternion().setFromRotationMatrix(_basis);
    // parts: each cell a box (its rect; through the wall from its inner face to the proudest part it carries — a sill, a
    // shutter, a frame — so what it draws never sinks past what it stands on), in the body's frame
    // each cell's depth through the wall to the proudest part it carries (a sill, a shutter, a frame), packed at its cut
    const depthOf = (g: FaceGrid, cell: number): [number, number] => {
      const draw = live.faces.get(live.wall.faces.indexOf(g));
      return draw ? [draw.depthMin[cell], draw.depthMax[cell]] : [-g.thickness, 0];
    };
    // the body's parts: a box a run of cells along one row of one face (merged edge to edge), through the wall to what
    // its cells carry, so what it draws never sinks past what it stands on
    const runs: Array<{ g: FaceGrid; v0: number; v1: number; u0: number; u1: number; d0: number; d1: number; dd: number; mass: number }> = [];
    const byRow = rects.slice().sort((p, q) => (p[2] - q[2]) || (p[0] - q[0]));
    for (const [u0, u1, v0, v1, g, cell, dd] of byRow) {
      const [d0, d1] = depthOf(g, cell);
      const mass = Math.max(1, (u1 - u0) * (v1 - v0) * g.thickness * densityOf(g.material));
      const last = runs[runs.length - 1];
      if (last && last.g === g && Math.abs(last.v0 - v0) < 1e-4 && Math.abs(last.u1 - u0) < 1e-3) {
        last.u1 = u1; last.d0 = Math.min(last.d0, d0); last.d1 = Math.max(last.d1, d1); last.mass += mass;
      } else runs.push({ g, v0, v1, u0, u1, d0, d1, dd, mass });
    }
    // runs stacked edge to edge with the same span along the face become one box
    for (let i = 0; i < runs.length; i++) {
      for (let j = i + 1; j < runs.length; j++) {
        const a = runs[i], b = runs[j];
        if (a.g !== b.g || Math.abs(a.u0 - b.u0) > 1e-3 || Math.abs(a.u1 - b.u1) > 1e-3 || Math.abs(a.v1 - b.v0) > 1e-3) continue;
        a.v1 = b.v1; a.d0 = Math.min(a.d0, b.d0); a.d1 = Math.max(a.d1, b.d1); a.mass += b.mass;
        runs.splice(j, 1);
        j = i;
      }
    }
    // (2026-10-15, the port's house probe: on integ's engine a pair of bodies costs its spheres times the other's solids,
    // and a heap of hundred-sphere clumps of a dozen boxes each was 40 ms a step) a body is two boxes at most: a clump of
    // more runs is the box round them all (what it draws stays inside it), with a dozen or sixteen contact spheres
    if (runs.length > 2) {
      const all = runs[0];
      for (let i = 1; i < runs.length; i++) {
        const r = runs[i];
        all.u0 = Math.min(all.u0, r.u0); all.u1 = Math.max(all.u1, r.u1); all.v0 = Math.min(all.v0, r.v0); all.v1 = Math.max(all.v1, r.v1);
        all.d0 = Math.min(all.d0, r.d0 + r.dd - all.dd); all.d1 = Math.max(all.d1, r.d1 + r.dd - all.dd); all.mass += r.mass;
      }
      runs.length = 1;
    }
    const parts: RigidPartSpec[] = runs.map((run) => ({
      kind: 'box' as const,
      center: [(run.u0 + run.u1) / 2 - cu, (run.v0 + run.v1) / 2 - cv, (run.d0 + run.d1) / 2 + run.dd + T / 2] as [number, number, number],
      half: [Math.max(0.04, (run.u1 - run.u0) / 2), Math.max(0.04, (run.v1 - run.v0) / 2), Math.max(0.04, (run.d1 - run.d0) / 2)] as [number, number, number],
      mass: run.mass,
    }));
    // (its spheres by its size: a patch of wall two metres across on a dozen rocks on the heap)
    let faceArea = 0;
    for (const part of parts) if (part.kind === 'box') faceArea = Math.max(faceArea, 4 * part.half[0] * part.half[1]);
    const shape = createRigidShape(parts, { ...BODY_SHAPE, maxSpheres: Math.min(24, (parts.length > 1 ? 16 : 12) + Math.round(faceArea * 2)) });
    // the body's culling sphere (body frame, round its centre): the farthest corner of its parts, and a margin
    let bodyRadius = 0.3;
    for (const part of parts) {
      if (part.kind !== 'box') continue;
      bodyRadius = Math.max(bodyRadius, Math.hypot(Math.abs(part.center[0]) + part.half[0], Math.abs(part.center[1]) + part.half[1],
        Math.abs(part.center[2]) + part.half[2]) + 0.1);
    }
    // geometry: each cell's triangles, its caps on every side and its back
    // each material's packed cell arrays (copied whole below) and its caps
    const byMaterial = new Map<THREE.Material, { layout: Layout; arrays: Float32Array[]; list: number[] }>();
    for (const [su0, su1, v0, v1, g, cell] of rects) {
      const draw = live.faces.get(live.wall.faces.indexOf(g));
      const shift = (g.origin[0] - g0.origin[0]) * g0.u[0] + (g.origin[2] - g0.origin[2]) * g0.u[2];
      const u0 = su0 - shift, u1 = su1 - shift;
      if (!draw) continue;
      for (const fg of draw.groups.values()) {
        for (const src of [fg.core.get(cell), fg.skin.get(cell)]) {
          if (!src?.length) continue;
          let e = byMaterial.get(fg.material);
          if (!e) { e = { layout: fg.layout, arrays: [], list: [] }; byMaterial.set(fg.material, e); }
          e.arrays.push(src);
        }
      }
      const cg = g.opening[cell] || !draw.drawn ? null : capGroup(draw);
      if (cg) {
        let e = byMaterial.get(cg.material);
        if (!e) { e = { layout: cg.layout, arrays: [], list: [] }; byMaterial.set(cg.material, e); }
        const tint = draw.core.tint, dv = g.origin[1] - g0.origin[1];
        const y0 = v0 - dv, y1 = v1 - dv;
        const p = (u: number, v: number, d: number) => facePoint(g, u, v, d);
        // back (the inner face), and the four sides across this cell's own wall (an upper storey's may be thinner)
        const t = g.thickness;
        pushQuad(e.list, e.layout, p(u0, y0, -t), p(u1, y0, -t), p(u1, y1, -t), p(u0, y1, -t), [-g.out[0], 0, -g.out[2]], tint, 0.6);
        pushQuad(e.list, e.layout, p(u0, y0, 0), p(u0, y1, 0), p(u0, y1, -t), p(u0, y0, -t), [-g.u[0], 0, -g.u[2]], tint, 0.7);
        pushQuad(e.list, e.layout, p(u1, y0, 0), p(u1, y1, 0), p(u1, y1, -t), p(u1, y0, -t), [g.u[0], 0, g.u[2]], tint, 0.7);
        pushQuad(e.list, e.layout, p(u0, y1, 0), p(u1, y1, 0), p(u1, y1, -t), p(u0, y1, -t), [0, 1, 0], tint, 0.85);
        pushQuad(e.list, e.layout, p(u0, y0, 0), p(u1, y0, 0), p(u1, y0, -t), p(u0, y0, -t), [0, -1, 0], tint, 0.55);
      }
    }
    if (!byMaterial.size) return false;
    const frame = { c: centre, q: qBody };
    // one typed list a material: the cells' packed arrays copied whole, then their caps
    const merged = new Map<THREE.Material, { layout: Layout; list: Float32Array }>();
    for (const [material, e] of byMaterial) {
      let n = e.list.length;
      for (const a of e.arrays) n += a.length;
      const list = new Float32Array(n);
      let at = 0;
      for (const a of e.arrays) { list.set(a, at); at += a.length; }
      for (let i = 0; i < e.list.length; i++) list[at + i] = e.list[i];
      // (dcore 2026-10-11, wave 388a: "clean whole bricks") what broke off wears its break's grit: its colours DUST_COAT
      // of the way to a greyed dust of themselves (the standing face keeps its own)
      const ci = e.layout.names.indexOf('color');
      if (ci >= 0 && e.layout.sizes[ci] >= 3) {
        let off = 6;
        for (let a = 0; a < ci; a++) off += e.layout.sizes[a];
        const stride = e.layout.stride;
        // (wave 407: "clean, saturated single bricks or uniform cubes") no two chunks alike: each its own share of grit
        // (0.7-1.4 of the coat) and its own value (a sooted or a dusted one)
        const hv = ((Math.imul(seed + 13, 0x9e3779b1) >>> 0) % 1000) / 1000, hw = ((Math.imul(seed + 71, 0x85ebca6b) >>> 0) % 1000) / 1000;
        const coat = Math.min(0.75, DUST_COAT * (0.7 + 0.7 * hv)), value = 0.84 + 0.22 * hw;
        for (let i = off; i + 2 < list.length; i += stride) {
          const r = list[i], gg = list[i + 1], b = list[i + 2];
          const d = (0.2126 * r + 0.7152 * gg + 0.0722 * b) * 0.85 + 0.1;
          list[i] = (r + (d * 1.02 - r) * coat) * value; list[i + 1] = (gg + (d - gg) * coat) * value; list[i + 2] = (b + (d * 0.93 - b) * coat) * value;
        }
      }
      merged.set(material, { layout: e.layout, list });
    }
    // (receipts: every drawn corner inside one of the parts, else it sinks into what it lands on)
    if ((globalThis as { __fractureDebug?: boolean }).__fractureDebug) {
      // every drawn corner inside one of the parts (body frame: x along the face, y up, z out)
      let worst = 0, worstP: number[] = [];
      for (const { layout, list } of merged.values()) {
        for (let i = 0; i < list.length; i += layout.stride) {
          const rx = list[i] - centre[0], ry = list[i + 1] - centre[1], rz = list[i + 2] - centre[2];
          const lx = rx * g0.u[0] + rz * g0.u[2], ly = ry, lz = rx * g0.out[0] + rz * g0.out[2];
          let best = Infinity;
          for (const part of parts) {
            if (part.kind !== 'box') continue;
            const ox = Math.abs(lx - part.center[0]) - part.half[0], oy = Math.abs(ly - part.center[1]) - part.half[1], oz = Math.abs(lz - part.center[2]) - part.half[2];
            best = Math.min(best, Math.max(ox, oy, oz));
          }
          if (best > worst) { worst = best; worstP = [lx, ly, lz]; }
        }
      }
      if (worst > 0.03) console.log(`[fracture-debug] body of ${cells.length / 2} cells, ${parts.length} parts: a corner ${worst.toFixed(3)} m outside (${worstP.map((v) => v.toFixed(2))})`);
    }
    const partsOut: LiveBody['parts'] = [];
    const meshes: THREE.Mesh[] = [];
    for (const [material, { layout, list }] of merged) {
      const geometry = interleavedOf(layout, list, new THREE.Sphere(new THREE.Vector3(centre[0], centre[1], centre[2]), bodyRadius));
      partsOut.push({ material, geometry });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `fx-fracture-body-${live.seam.structureIdx}`;
      mesh.matrixAutoUpdate = false;
      // (the decisive wave's hitch probe: 2400 draw calls at a house's collapse) a clump of three cells or fewer casts no
      // shadow of its own while it flies (the heap it bakes into does)
      mesh.castShadow = cells.length >= 8;
      mesh.receiveShadow = true;
      o.group.add(mesh);
      meshes.push(mesh);
    }
    // spawn: the body frame's pose to the world (a cracked chunk's clumps: through where the chunk lies now)
    let qWorld: THREE.Quaternion;
    if (at) {
      _v.set(centre[0], centre[1], centre[2]).applyMatrix4(at);
      at.decompose(_atP, _atQ, _atS);
      qWorld = _atQ.clone().multiply(qBody);
    } else {
      toWorld(live, centre[0], centre[1], centre[2], _v);
      const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), live.seam.anatomy.placement.yaw);
      qWorld = yawQ.multiply(qBody);
    }
    const rng = mulberry(seed);
    const handle = o.pool.spawn(shape, {
      x: _v.x, y: _v.y, z: _v.z, qx: qWorld.x, qy: qWorld.y, qz: qWorld.z, qw: qWorld.w,
      vx, vy, vz, wx: (rng() - 0.5) * spin + (lean ? lean[0] : 0), wy: (rng() - 0.5) * spin + (lean ? lean[1] : 0),
      wz: (rng() - 0.5) * spin + (lean ? lean[2] : 0),
    });
    if (handle < 0) {
      for (const m of meshes) { o.group.remove(m); m.geometry.dispose(); }
      skipped++;
      refuse(live, cells, vx, vy, vz, at);
      return false;
    }
    const half: [number, number, number] = [0.04, 0.04, 0.04];
    for (const part of parts) if (part.kind === 'box') for (let k = 0; k < 3; k++) half[k] = Math.max(half[k], Math.abs(part.center[k]) + part.half[k]);
    const body: LiveBody = { structureIdx: live.seam.structureIdx, handle, meshes, massKg: mass, material: g0.material, still: 0, age: 0, sounds: 0,
      pose: new Float64Array(7).fill(NaN), parts: partsOut, cells: cells.slice(), cracked: cells.length < CRACK_MIN_CELLS * 2, half, tipped: false,
      fromBody: new THREE.Matrix4().compose(_atP.set(frame.c[0], frame.c[1], frame.c[2]), frame.q, _s).invert() };
    bodies.set(handle, body);
    list.push(body);
    _pose[0] = _v.x; _pose[1] = _v.y; _pose[2] = _v.z; _pose[3] = qWorld.x; _pose[4] = qWorld.y; _pose[5] = qWorld.z; _pose[6] = qWorld.w;
    writePose(body, _pose);
    return true;
  }
  /**
   * Cells no body could take (the share full of moving bodies, the pool refusing): thrown through the program path
   * (onRefused: pieces of the wall's own core, at most six for a cluster, landing where their flight meets the ground),
   * never left standing nor lost. `at`: where the cells lie now (a cracked chunk's frame), else where they stood.
   */
  function refuse(live: Live, cells: number[], vx: number, vy: number, vz: number, at: THREE.Matrix4 | null): void {
    if (!o.onRefused) return;
    const n = cells.length / 2, step = Math.max(1, Math.ceil(n / 6));
    for (let i = 0; i < n; i += step) {
      const g = live.wall.faces[cells[2 * i]];
      cellRect(g, cells[2 * i + 1], rect);
      const p = facePoint(g, (rect[0] + rect[1]) / 2, (rect[2] + rect[3]) / 2, -g.thickness / 2);
      if (at) _v.set(p[0], p[1], p[2]).applyMatrix4(at); else toWorld(live, p[0], p[1], p[2], _v);
      const face = live.seam.anatomy.storeys[g.storey]?.faces[g.faceIndex];
      const slot = face?.layers.find((l) => l.material !== 'plaster' && l.material !== 'glass') ?? face?.layers[0];
      if (!slot) continue;
      const size = Math.min(0.7, Math.max(0.2, Math.sqrt((rect[1] - rect[0]) * (rect[3] - rect[2]) * Math.min(step, 4))));
      o.onRefused(live.seam, _v.x, _v.y, _v.z, size, slot, vx, vy, vz);
    }
  }
  /** (the share full) the body that has lain still longest, half a second at least, bakes into its heap now. */
  function bakeStillest(): boolean {
    let pick: LiveBody | null = null;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.still >= SHARE_STILL_S && (!pick || b.still > pick.still) && !o.holdBake?.(b.structureIdx, b.pose[1])) pick = b;
    }
    if (!pick) return false;
    bake(pick);
    return true;
  }
  const _pose = new Float64Array(7);
  const _vel = new Float64Array(6);
  const _atP = new THREE.Vector3(), _atQ = new THREE.Quaternion(), _atS = new THREE.Vector3(), _atM = new THREE.Matrix4();
  const _crackVel = new Float64Array(6);
  /**
   * A chunk that landed hard breaks across its courses into clumps of one to five cells, each a body where its cells lie
   * in the chunk now, with the chunk's motion and a tumble of its own; the chunk leaves the pool. Skipped without room.
   */
  function crackBody(b: LiveBody): void {
    const live = lives.get(b.structureIdx);
    if (!live || bodies.get(b.handle) !== b) return;
    // (wave 407: "the masonry breaks into clean, saturated single bricks or uniform cubes, sometimes peeling off in evenly
    // spaced rows") its cells into clumps of one to five grown from seeds across its courses (edge to edge along a row, and
    // up or down a course where they overlap), so what lands is a mix of blocks, short runs and stepped lumps, never rows
    const n = b.cells.length / 2;
    const rowOf = new Int32Array(n), uOf = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const f = b.cells[2 * i], c = b.cells[2 * i + 1], g = live.wall.faces[f];
      let r = 0;
      while (r + 1 < g.rowStart.length && g.rowStart[r + 1] <= c) r++;
      rowOf[i] = r; uOf[2 * i] = g.cellU[2 * c]; uOf[2 * i + 1] = g.cellU[2 * c + 1];
    }
    const touches = (i: number, j: number): boolean => b.cells[2 * i] === b.cells[2 * j] && (rowOf[i] === rowOf[j]
      ? Math.abs(uOf[2 * i + 1] - uOf[2 * j]) < 1e-3 || Math.abs(uOf[2 * j + 1] - uOf[2 * i]) < 1e-3
      : Math.abs(rowOf[i] - rowOf[j]) === 1 && Math.min(uOf[2 * i + 1], uOf[2 * j + 1]) - Math.max(uOf[2 * i], uOf[2 * j]) > 0.05);
    const hashOf = (i: number, salt: number): number => (Math.imul(b.handle + 1, 0x9e3779b1) ^ Math.imul(i + salt, 0x85ebca6b)) >>> 0;
    const order = Array.from({ length: n }, (_, i) => i).sort((p, q) => hashOf(p, 3) - hashOf(q, 3) || p - q);
    const owner = new Int32Array(n).fill(-1);
    const clumps: number[][] = [];
    for (const seed of order) {
      if (owner[seed] >= 0) continue;
      const u = hashOf(clumps.length, 17) % 100;
      const want = u < 12 ? 1 : u < 37 ? 2 : u < 67 ? 3 : u < 87 ? 4 : 5;
      const members = [seed];
      owner[seed] = clumps.length;
      const off = hashOf(clumps.length, 29) % n;
      for (let m = 0; m < members.length && members.length < want; m++) {
        for (let t = 0; t < n && members.length < want; t++) {
          const j = (t + off) % n;
          if (owner[j] < 0 && touches(members[m], j)) { owner[j] = clumps.length; members.push(j); }
        }
      }
      const clump: number[] = [];
      for (const i of members) clump.push(b.cells[2 * i], b.cells[2 * i + 1]);
      clumps.push(clump);
    }
    if (clumps.length < 2) return;
    const capacity = (o.pool.world as { capacity?: number }).capacity ?? 128;
    // (the budget test) it cracks whatever else is awake: into as many clumps as the pool has room for (within the
    // fracture's share of it, the chunk's own place counted), neighbours merged, never left whole while there is room for two
    const room = Math.min(capacity - o.pool.world.awakeCount, poolShare - bodies.size) + 1;
    if (room < 2) return;
    while (clumps.length > Math.min(room, CRACK_CLUMPS_MAX)) { const last = clumps.pop()!; clumps[clumps.length - 1].push(...last); }
    if (!o.pool.framePoseAt(b.handle, _pose)) return;
    o.pool.velocity(b.handle, _crackVel);
    // where its cells lie now: the chunk's pose through its body frame
    _atM.compose(_atP.set(_pose[0], _pose[1], _pose[2]), _atQ.set(_pose[3], _pose[4], _pose[5], _pose[6]), _s).multiply(b.fromBody);
    const at = _atM.clone();
    unlist(b);
    o.pool.release(b.handle);
    for (const m of b.meshes) { o.group.remove(m); m.geometry.dispose(); }
    clumps.forEach((clump, i) => {
      spawnCells(live, clump, _crackVel[0] * 0.8, _crackVel[1] * 0.8 + 0.6, _crackVel[2] * 0.8, 4, damageSeed(b.handle * 31 + 7, i), at);
    });
  }
  /**
   * (wave 407: "a timber door or infill panel stays standing upright on its edge at the right of the heap") a chunk that
   * comes to rest standing on its edge (its thin side across the world's level) is shoved over once at its top: what
   * fell lies down on the heap. True when it was tipped.
   */
  function tipIfStanding(b: LiveBody, pose: ArrayLike<number>): boolean {
    const h = b.half;
    let thin = 0;
    for (let k = 1; k < 3; k++) if (h[k] < h[thin]) thin = k;
    _q.set(pose[3], pose[4], pose[5], pose[6]);
    _tipA.set(thin === 0 ? 1 : 0, thin === 1 ? 1 : 0, thin === 2 ? 1 : 0).applyQuaternion(_q);
    if (Math.abs(_tipA.y) > 0.4) return false;
    let up = 0;
    for (let k = 0; k < 3; k++) { _tipB.set(k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0).applyQuaternion(_q); up += h[k] * Math.abs(_tipB.y); }
    // (a door and its lintel stand on their sill a box round the plinth and the rail they carry: two and a half times
    // as tall as that is deep is on its end)
    if (up < 2.5 * h[thin]) return false;
    const hl = Math.hypot(_tipA.x, _tipA.z) || 1;
    // over the way it leans (its thin axis dips away from the side its top leans to), else a side of its own; a stockier
    // piece harder
    const lean = -_tipA.y;
    const side = Math.abs(lean) > 0.02 ? Math.sign(lean) : (Math.imul(b.handle + 7, 0x9e3779b1) >>> 0) % 2 ? 1 : -1;
    const k = 1.2 + 0.8 * Math.min(1, Math.max(0, (3 - up / h[thin]) / 0.5));
    const j = b.massKg * k * side / hl;
    o.pool.impulse(b.handle, _tipA.x * j, 0, _tipA.z * j, pose[0], pose[1] + up * 0.8, pose[2]);
    return true;
  }
  const _tipA = new THREE.Vector3(), _tipB = new THREE.Vector3();
  /** A body standing on its edge laid flat where it stands (its pose in `pose`, rewritten): its thin axis turned up about
   *  its lowest point, its yaw kept (round 4). */
  function layFlat(b: LiveBody, pose: Float64Array | number[]): void {
    const h = b.half;
    let thin = 0;
    for (let k = 1; k < 3; k++) if (h[k] < h[thin]) thin = k;
    _q.set(pose[3]!, pose[4]!, pose[5]!, pose[6]!);
    _tipA.set(thin === 0 ? 1 : 0, thin === 1 ? 1 : 0, thin === 2 ? 1 : 0).applyQuaternion(_q);
    let up = 0;
    for (let k = 0; k < 3; k++) { _tipB.set(k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0).applyQuaternion(_q); up += h[k]! * Math.abs(_tipB.y); }
    // the turn that takes its thin axis to the vertical (the shortest), about its lowest point
    _tipB.set(0, _tipA.y >= 0 ? 1 : -1, 0);
    _layQ.setFromUnitVectors(_tipA, _tipB).multiply(_q);
    const floor = pose[1]! - up;
    pose[1] = floor + h[thin]! + 0.02;
    pose[3] = _layQ.x; pose[4] = _layQ.y; pose[5] = _layQ.z; pose[6] = _layQ.w;
    writePose(b, pose);
  }
  const _layQ = new THREE.Quaternion(), _bakePose = new Float64Array(7);
  /**
   * (round 4; the hostomel tower: a clump whose box is thick — two faces at a corner — drew one plate 3.9 x 2.5 m standing
   * upright on the ground, a box no push turns) a body whose drawing is one flat plate standing up 1.5 m and more is laid
   * on its broad side as it bakes: turned about its middle so the plate lies flat, its lowest point kept.
   */
  function flattenStandingPlate(b: LiveBody): void {
    let n = 0, mx = 0, my = 0, mz = 0, y0 = Infinity, y1 = -Infinity;
    const c = [0, 0, 0, 0, 0, 0];
    for (const m of b.meshes) {
      const pos = m.geometry.getAttribute('position');
      if (!pos) continue;
      for (let i = 0; i < pos.count; i++) {
        _plv.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(m.matrix);
        n++; mx += _plv.x; my += _plv.y; mz += _plv.z;
        c[0] += _plv.x * _plv.x; c[1] += _plv.x * _plv.y; c[2] += _plv.x * _plv.z; c[3] += _plv.y * _plv.y; c[4] += _plv.y * _plv.z; c[5] += _plv.z * _plv.z;
        if (_plv.y < y0) y0 = _plv.y; if (_plv.y > y1) y1 = _plv.y;
      }
    }
    if (n < 3 || y1 - y0 < 1.5) return;
    mx /= n; my /= n; mz /= n;
    const cov = [c[0] / n - mx * mx, c[1] / n - mx * my, c[2] / n - mx * mz, c[3] / n - my * my, c[4] / n - my * mz, c[5] / n - mz * mz];
    // the plate's normal: the covariance's least axis (inverse iteration on cov + εI from the vertical's complement)
    const nrm = leastAxis(cov);
    if (!nrm || Math.abs(nrm[1]) > 0.45) return;
    // thin: its spread along the normal a hand at most (a plate, not a block)
    let lo = Infinity, hi = -Infinity;
    for (const m of b.meshes) {
      const pos = m.geometry.getAttribute('position');
      if (!pos) continue;
      for (let i = 0; i < pos.count; i++) {
        _plv.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(m.matrix);
        const d = (_plv.x - mx) * nrm[0] + (_plv.y - my) * nrm[1] + (_plv.z - mz) * nrm[2];
        if (d < lo) lo = d; if (d > hi) hi = d;
      }
    }
    if (hi - lo > 0.6) return;
    _pln.set(nrm[0], nrm[1], nrm[2]);
    _plu.set(0, nrm[1] >= 0 ? 1 : -1, 0);
    _plq.setFromUnitVectors(_pln, _plu);
    // about its middle, then down so it lies where its foot stood
    _plm.makeTranslation(mx, my, mz).multiply(_plm2.makeRotationFromQuaternion(_plq)).multiply(_plm3.makeTranslation(-mx, -my, -mz));
    let ny0 = Infinity;
    for (const m of b.meshes) {
      m.matrix.premultiply(_plm);
      const pos = m.geometry.getAttribute('position');
      if (!pos) continue;
      for (let i = 0; i < pos.count; i++) { _plv.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(m.matrix); if (_plv.y < ny0) ny0 = _plv.y; }
    }
    for (const m of b.meshes) { m.matrix.elements[13] += y0 - ny0 + 0.02; m.matrixWorldNeedsUpdate = true; }
  }
  const _plv = new THREE.Vector3(), _pln = new THREE.Vector3(), _plu = new THREE.Vector3(), _plq = new THREE.Quaternion();
  const _plm = new THREE.Matrix4(), _plm2 = new THREE.Matrix4(), _plm3 = new THREE.Matrix4();
  /** A symmetric 3×3's (xx xy xz yy yz zz) least eigenvector (Jacobi), or null. */
  function leastAxis(cv: readonly number[]): [number, number, number] | null {
    const a = [[cv[0]!, cv[1]!, cv[2]!], [cv[1]!, cv[3]!, cv[4]!], [cv[2]!, cv[4]!, cv[5]!]];
    const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let sweep = 0; sweep < 24; sweep++) {
      let off = 0;
      for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p]![q]! * a[p]![q]!;
      if (off < 1e-18) break;
      for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p]![q]!) < 1e-20) continue;
        const theta = (a[q]![q]! - a[p]![p]!) / (2 * a[p]![q]!);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const cs = 1 / Math.sqrt(t * t + 1), sn = t * cs;
        for (let k = 0; k < 3; k++) { const akp = a[k]![p]!, akq = a[k]![q]!; a[k]![p] = cs * akp - sn * akq; a[k]![q] = sn * akp + cs * akq; }
        for (let k = 0; k < 3; k++) { const apk = a[p]![k]!, aqk = a[q]![k]!; a[p]![k] = cs * apk - sn * aqk; a[q]![k] = sn * apk + cs * aqk; }
        for (let k = 0; k < 3; k++) { const vkp = v[k]![p]!, vkq = v[k]![q]!; v[k]![p] = cs * vkp - sn * vkq; v[k]![q] = sn * vkp + cs * vkq; }
      }
    }
    let best = 0;
    for (let k = 1; k < 3; k++) if (a[k]![k]! < a[best]![best]!) best = k;
    const out: [number, number, number] = [v[0]![best]!, v[1]![best]!, v[2]![best]!];
    const l = Math.hypot(out[0], out[1], out[2]);
    return l > 1e-9 ? [out[0] / l, out[1] / l, out[2] / l] : null;
  }
  /** Whether a body at `pose` stands on its edge (its thin axis within 24° of level, reaching 2.5 times its thickness up)
   *  1.5 m tall or more. */
  function onEdge(b: LiveBody, pose: ArrayLike<number>): boolean {
    const h = b.half;
    let thin = 0;
    for (let k = 1; k < 3; k++) if (h[k] < h[thin]) thin = k;
    _q.set(pose[3], pose[4], pose[5], pose[6]);
    _tipA.set(thin === 0 ? 1 : 0, thin === 1 ? 1 : 0, thin === 2 ? 1 : 0).applyQuaternion(_q);
    if (Math.abs(_tipA.y) > 0.4) return false;
    let up = 0;
    for (let k = 0; k < 3; k++) { _tipB.set(k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0).applyQuaternion(_q); up += h[k] * Math.abs(_tipB.y); }
    if (up < 2.5 * h[thin]) return false;
    return 2 * up >= 1.5;
  }
  function writePose(b: LiveBody, src: ArrayLike<number>): void {
    let same = true;
    for (let k = 0; k < 7; k++) if (b.pose[k] !== src[k]) { same = false; b.pose[k] = src[k]; }
    if (same) return;
    _v.set(src[0], src[1], src[2]);
    _q.set(src[3], src[4], src[5], src[6]);
    _m4.compose(_v, _q, _s).multiply(b.fromBody);
    for (const mesh of b.meshes) { mesh.matrix.copy(_m4); mesh.matrixWorldNeedsUpdate = true; }
  }
  /** A body at rest into its building's heap: its geometry baked where it lies (one static mesh a body). */
  function bake(b: LiveBody, release = true): void {
    // (round 4) never baked standing on its edge, whatever bakes it (its rest, the pool's eviction, the share's room): laid
    // flat where it stands (the census's hostomel tower: its dark interior plate baked upright beside the tower)
    if (Number.isFinite(b.pose[0]!) && onEdge(b, b.pose)) { _bakePose.set(b.pose); layFlat(b, _bakePose); }
    else flattenStandingPlate(b);
    unlist(b);
    if (release) o.pool.release(b.handle);
    const live = lives.get(b.structureIdx);
    // (the mesh keeps its last matrix: a baked body is a static mesh where it lies, its geometry untouched) — until it
    // joins the building's merged heap (mergeBaked, a batch at a time)
    for (let i = 0; i < b.meshes.length; i++) {
      const mesh = b.meshes[i];
      mesh.matrixWorldNeedsUpdate = true;
      if (live) { live.bakedPending.push(mesh); pendingBody.set(mesh, bakedCount); } else { o.group.remove(mesh); mesh.geometry.dispose(); }
    }
    bakedCount++;
  }

  const _mv = new THREE.Vector3(), _mn = new THREE.Vector3(), _mN = new THREE.Matrix3();
  /** What holds a plate baked (the records, the pool's bodies): uprightPlates' perch. */
  const plateHold = createPlateHold(() => o.environment?.() ?? null, o.pool.world);
  /** A pending mesh's body (its bake's count): a body's meshes do not hold one another up. */
  const pendingBody = new WeakMap<THREE.Mesh, number>();
  /**
   * A building's baked bodies into its merged heap: every pending mesh's interleaved vertices carried through its matrix
   * (positions and normals) and appended to its material's heap (a new buffer: the old one's vertices copied first), the
   * pending meshes then gone — one draw call (and its shadow passes) a material for everything that lies still.
   */
  function mergeBaked(live: Live): void {
    if (!live.bakedPending.length) return;
    const groups = new Map<string, { material: THREE.Material; stride: number; meshes: THREE.Mesh[]; floats: number }>();
    // (round 4; airfield #0's tower, caldera #28's warehouse: a clump's dark interior plate or a sheet face baked upright
    // beside the ruin, its body lying well on its box) no piece of what lies still stands on its edge
    for (const mesh of live.bakedPending) layUprightPlates(mesh.geometry, mesh.matrix, o.groundAt ? (x, z) => o.groundAt!(x, z) : null);
    // (round 4, third pass; the census's airfield #0 tower: a 3.8 x 2.8 m plate baked into its heap 1.7 m up, 57 % of it over
    // nothing) nor lies perched: held by what it lies on (the heap, the building's collapse lying still, the records, the
    // bodies) or laid down onto the ground — never by its own body's other pieces beside it (fourth pass: the same tower at
    // another seed, a clump's skin and its dark interior plate each holding the other 1.7 m up)
    // (round 5) and what it lies on now may go: the plates held now are watched (their vertices in the merged heap)
    const held: Array<WatchedPlate & { e: number }> = [];
    if (o.groundAt) {
      const also: PlateDrawing[] = [];
      for (const m of [...live.baked, ...(o.statics?.(live.seam.structureIdx) ?? [])]) also.push({ geometry: m.geometry, matrix: m.matrix });
      for (const [key, m] of live.bakedMerged) also.push({ geometry: m.geometry, matrix: m.matrix, bodyOf: live.heapBody.get(key) });
      layPerchedPlates(live.bakedPending.map((m) => ({ geometry: m.geometry, matrix: m.matrix, body: pendingBody.get(m) })), also, (x, z) => o.groundAt!(x, z), plateHold, held);
    }
    const placed = new Map<THREE.Mesh, { key: string; base: number }>();
    for (const mesh of live.bakedPending) {
      const pos = mesh.geometry.getAttribute('position') as THREE.InterleavedBufferAttribute;
      const data = pos?.data;
      if (!data) continue;
      const material = mesh.material as THREE.Material;
      const key = `${material.uuid}:${data.stride}`;
      let g = groups.get(key);
      if (!g) { g = { material, stride: data.stride, meshes: [], floats: 0 }; groups.set(key, g); }
      g.meshes.push(mesh);
      g.floats += data.array.length;
    }
    for (const [key, g] of groups) {
      const old = live.bakedMerged.get(key);
      const oldData = old ? (old.geometry.getAttribute('position') as THREE.InterleavedBufferAttribute).data : null;
      const out = new Float32Array((oldData ? oldData.array.length : 0) + g.floats);
      let at = 0;
      if (oldData) { out.set(oldData.array as Float32Array, 0); at = oldData.array.length; }
      const oldBody = live.heapBody.get(key);
      const bodyOf = new Int32Array(out.length / g.stride);
      if (oldBody) bodyOf.set(oldBody.subarray(0, Math.min(oldBody.length, bodyOf.length)), 0);
      for (const mesh of g.meshes) {
        const src = (mesh.geometry.getAttribute('position') as THREE.InterleavedBufferAttribute).data.array as Float32Array;
        placed.set(mesh, { key, base: at / g.stride });
        bodyOf.fill(pendingBody.get(mesh) ?? -1, at / g.stride, (at + src.length) / g.stride);
        out.set(src, at);
        _mN.getNormalMatrix(mesh.matrix);
        for (let i = at; i < at + src.length; i += g.stride) {
          _mv.set(out[i], out[i + 1], out[i + 2]).applyMatrix4(mesh.matrix);
          out[i] = _mv.x; out[i + 1] = _mv.y; out[i + 2] = _mv.z;
          _mn.set(out[i + 3], out[i + 4], out[i + 5]).applyMatrix3(_mN).normalize();
          out[i + 3] = _mn.x; out[i + 4] = _mn.y; out[i + 5] = _mn.z;
        }
        at += src.length;
        o.group.remove(mesh);
        mesh.geometry.dispose();
      }
      // the layout as the first mesh carried it (every mesh of a key shares it)
      const first = g.meshes[0].geometry;
      const geometry = new THREE.BufferGeometry();
      const buffer = new THREE.InterleavedBuffer(out, g.stride);
      for (const [name, attr] of Object.entries(first.attributes)) {
        const ia = attr as THREE.InterleavedBufferAttribute;
        geometry.setAttribute(name, new THREE.InterleavedBufferAttribute(buffer, ia.itemSize, ia.offset));
      }
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, g.material);
      mesh.name = `fx-fracture-heap-${live.seam.structureIdx}`;
      mesh.matrixAutoUpdate = false;
      mesh.matrixWorldNeedsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      o.group.add(mesh);
      if (old) { o.group.remove(old); old.geometry.dispose(); }
      live.bakedMerged.set(key, mesh);
      live.heapBody.set(key, bodyOf);
    }
    // the held plates, in their heap's vertices now (a pending mesh is non-indexed: triangle t is its vertices 3t..3t+2)
    for (const h of held) {
      const at = placed.get(live.bakedPending[h.e]!);
      if (!at) continue;
      live.watch.push({ key: at.key, verts: h.verts.map((i) => i + at.base), tris: h.tris.map((t) => t + at.base / 3), body: h.body });
    }
    live.bakedPending.length = 0;
  }

  /**
   * (round 5) The heap's watched plates judged again (the records, the bodies and the drawings as they lie now): one
   * whose hold went is laid down as a plate coming to rest is; the rest stay watched.
   */
  function judgeWatched(live: Live): void {
    live.watchedAt = o.now();
    if (!live.watch.length || !o.groundAt) return;
    const byKey = new Map<string, WatchedPlate[]>();
    for (const w of live.watch) { let l = byKey.get(w.key); if (!l) byKey.set(w.key, l = []); l.push(w); }
    const edit: PlateDrawing[] = [], keys: string[] = [], also: PlateDrawing[] = [];
    for (const [key, m] of live.bakedMerged) {
      const ws = byKey.get(key), bodyOf = live.heapBody.get(key);
      if (ws) { edit.push({ geometry: m.geometry, matrix: m.matrix, bodyOf, pieces: ws }); keys.push(key); } else also.push({ geometry: m.geometry, matrix: m.matrix, bodyOf });
    }
    for (const m of live.baked) also.push({ geometry: m.geometry, matrix: m.matrix });
    for (const m of live.bakedPending) also.push({ geometry: m.geometry, matrix: m.matrix, body: pendingBody.get(m) });
    for (const m of o.statics?.(live.seam.structureIdx) ?? []) also.push({ geometry: m.geometry, matrix: m.matrix });
    const still: Array<WatchedPlate & { e: number }> = [];
    if (layPerchedPlates(edit, also, (x, z) => o.groundAt!(x, z), plateHold, still)) live.seam.touchShadows();
    live.watch = still.map((w) => ({ key: keys[w.e]!, verts: w.verts, tris: w.tris, body: w.body }));
  }

  function densityOf(material: string): number {
    switch (material) {
      case 'concrete': return 2300;
      case 'stone': return 2400;
      case 'brick': return 1800;
      case 'rubble': return 2000;
      case 'adobe': return 1600;
      case 'timber': case 'plank': case 'infill': return 600;
      case 'metal': return 400;
      default: return 1700;
    }
  }
  function mulberry(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** The cells knocked through: a few chunks (one or two cells each) thrown along the round, the rest dust. */
  /** A body to spawn: its cells (face, cell pairs), its launch (world m/s) and spin, its seed. */
  interface BodySpec { cells: number[]; vx: number; vy: number; vz: number; spin: number; seed: number; lean?: [number, number, number] }

  /** The cells knocked through: a few chunks (one cell each) thrown along the round, the rest dust. */
  function planKnocked(live: Live, face: number, knocked: number[], dirBX: number, dirBZ: number, kind: WallStrikeKind,
    hitU: number, hitV: number, budget: number, seed: number, out: BodySpec[]): number {
    if (!knocked.length || budget <= 0) return 0;
    const g = live.wall.faces[face];
    const rng = mulberry(seed);
    // the nearest cells to the point first: they carry the round's push
    const order = knocked.slice().sort((a, b) => {
      cellRect(g, a, rect); const da = Math.hypot((rect[0] + rect[1]) / 2 - hitU, (rect[2] + rect[3]) / 2 - hitV);
      cellRect(g, b, rect); const db = Math.hypot((rect[0] + rect[1]) / 2 - hitU, (rect[2] + rect[3]) / 2 - hitV);
      return da - db || a - b;
    });
    // (dcore 2026-10-11, waves 385/388a: "a spray of near-identical clean brick blocks") a few of the cells fly as
    // mortared clumps of two or three (at most the budget); the rest are pulverized into the burst's broken bits
    const chunks = Math.min(budget, Math.max(1, Math.round(order.length / 5)));
    const dir = dirToWorld(live, dirBX, dirBZ, new THREE.Vector3());
    const used = new Set<number>();
    const centre = (cell: number): [number, number] => { cellRect(g, cell, rect); return [(rect[0] + rect[1]) / 2, (rect[2] + rect[3]) / 2]; };
    let made = 0;
    for (let i = 0; i < chunks; i++) {
      const cell = order[Math.floor(i * order.length / chunks)];
      if (used.has(cell)) continue;
      used.add(cell);
      const cells = [face, cell];
      const [cu, cv] = centre(cell);
      const want = 1 + (rng() < 0.5 ? 1 : 0);
      // its nearest knocked neighbours, edge to edge (within a cell and a half)
      const near = order.filter((c) => !used.has(c)).map((c) => { const [u, v] = centre(c); return [Math.hypot(u - cu, v - cv), c] as [number, number]; })
        .filter(([d]) => d < 0.75).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      for (let k = 0; k < want && k < near.length; k++) { used.add(near[k][1]); cells.push(face, near[k][1]); }
      const speed = kind === 'kinetic' ? 7 + rng() * 6 : 4 + rng() * 6;
      // a blast throws inward along the round and some back out of the wall; a penetrator's spall goes in
      const back = kind === 'blast' && rng() < 0.3 ? -0.6 : 1;
      const vx = (dir.x * back + (rng() - 0.5) * 0.6) * speed, vz = (dir.z * back + (rng() - 0.5) * 0.6) * speed;
      out.push({ cells, vx, vy: 0.8 + rng() * 2.2, vz, spin: 9, seed: damageSeed(seed, i) });
      made++;
    }
    return made;
  }

  /**
   * The clusters that fell: every cell of them goes down as part of a body (nothing that fell may vanish), let go with
   * a nudge off the wall and the cluster's lean off its foot (TOPPLE_W: a piece's speed out grows with its height over
   * the cluster's lowest course, and it turns with the lean). Within the round's budget of bodies: a cluster is cut into
   * pieces of as many cells as it takes (six at the least: a few courses wide), largest clusters first.
   */
  function planFallen(live: Live, fallen: number[][], budget: number, seed: number, out: BodySpec[]): void {
    if (!fallen.length) return;
    const order = fallen.slice().sort((a, b) => b.length - a.length || a[1] - b[1]);
    const cells = order.reduce((n, cl) => n + cl.length / 2, 0);
    const per = Math.min(24, Math.max(6, Math.ceil(cells / Math.max(1, budget))));
    const heightOf = (f: number, c: number, at: number): number => { const g = live.wall.faces[f]; cellRect(g, c, rect); return g.origin[1] + rect[2] + (rect[3] - rect[2]) * at; };
    let n = 0;
    for (let i = 0; i < order.length; i++) {
      const cluster = order[i];
      let foot = Infinity;
      for (let k = 0; k < cluster.length; k += 2) foot = Math.min(foot, heightOf(cluster[k], cluster[k + 1], 0));
      for (const piece of splitCluster(live, cluster, per)) {
        const g = live.wall.faces[piece[0]];
        let mid = 0;
        for (let k = 0; k < piece.length; k += 2) mid += heightOf(piece[k], piece[k + 1], 0.5);
        const up = Math.max(0, mid / (piece.length / 2) - foot);
        const w = dirToWorld(live, g.out[0], g.out[2], new THREE.Vector3());
        const speed = 0.4 + TOPPLE_W * up;
        // the lean's axis along the wall (up x out): the top goes out
        out.push({ cells: piece, vx: w.x * speed, vy: -0.2, vz: w.z * speed, spin: 1.5, seed: damageSeed(seed, i, n++),
          lean: [w.z * TOPPLE_W, 0, -w.x * TOPPLE_W] });
      }
    }
  }
  /**
   * A cluster cut into pieces of at most `max` cells, compact ones (2026-10-15, the port's destruction check: cut in the
   * order it was gathered, a piece snaked across a wall, its box six metres long round a few cells, and rocked on the
   * heap for seconds): its cells taken by blocks of a metre and a half along the face and four courses up (face by face),
   * so each piece is a patch of wall a few courses high that hangs together.
   */
  function splitCluster(live: Live, cells: number[], max: number): number[][] {
    if (cells.length / 2 <= max) return [cells];
    const n = cells.length / 2;
    const keyOf = new Float64Array(n), order = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const f = cells[2 * i], c = cells[2 * i + 1], g = live.wall.faces[f];
      cellRect(g, c, rect);
      const bu = Math.floor(((rect[0] + rect[1]) / 2 + g.width / 2) / 1.5), bv = Math.floor((g.origin[1] + (rect[2] + rect[3]) / 2) / 1.3);
      keyOf[i] = f * 1e8 + bv * 1e4 + bu + ((rect[0] + rect[1]) / 2 + g.width / 2) * 1e-3;
      order[i] = i;
    }
    const sorted = Array.from(order).sort((a, b) => keyOf[a] - keyOf[b] || a - b);
    const out: number[][] = [];
    for (let i = 0; i < n; i += max) {
      const piece: number[] = [];
      for (let k = i; k < Math.min(n, i + max); k++) piece.push(cells[2 * sorted[k]], cells[2 * sorted[k] + 1]);
      out.push(piece);
    }
    return out;
  }

  /**
   * A strike's drawing, done over the frames after it in fixed work units an update (the burst's flash and dust cover
   * the few frames it takes): the building's triangles sorted by face (once, in slices), each face it touched taken and
   * cut, its bodies spawned one at a time, its faces redrawn, the roof's sag. The wall's state is the strike's at once.
   */
  interface Work { live: Live; faces: number[]; bodies: BodySpec[]; step: number; claimed: number; spawned: number; drawn: number }
  const work: Work[] = [];
  const workUnits = Math.max(400, o.workUnits ?? WORK_UNITS);
  /** Advance the queued strikes' drawing until done or this update's units are spent (Infinity: all); `only`: that
   *  building's alone. */
  function advanceWork(budget: number, only: Live | null = null): void {
    units = budget;
    for (let i = 0; i < work.length;) {
      const w = work[i];
      const live = w.live;
      if (only && live !== only) { i++; continue; }
      if (!lives.has(live.seam.structureIdx) || live.released) { work.splice(i, 1); continue; }
      if (w.step === 0) {
        if (!sortByFaceSlice(live)) return;
        w.step = 1;
      }
      if (w.step === 1) {
        while (w.claimed < w.faces.length) {
          if (!claimFaceSlice(live, w.faces[w.claimed])) return;
          w.claimed++;
          if (units <= 0) return;
        }
        w.step = 2;
      }
      if (w.step === 2) {
        while (w.spawned < w.bodies.length) {
          const b = w.bodies[w.spawned++];
          // (round 4) none of a face that draws no flat wall: it threw no chunk
          let cells = b.cells;
          for (let i = 0; i < cells.length; i += 2) if (live.wall.faces[cells[i]!]!.notWall) { cells = cells.filter((_, k) => !live.wall.faces[cells[k - (k & 1)]!]!.notWall); break; }
          if (!cells.length) continue;
          spawnCells(live, cells, b.vx, b.vy, b.vz, b.spin, b.seed, null, b.lean ?? null);
          units -= WORK_BODY;
          if (units <= 0) return;
        }
        w.step = 3;
      }
      if (w.step === 3) {
        while (w.drawn < w.faces.length) {
          const draw = live.faces.get(w.faces[w.drawn++]);
          if (!draw) continue;
          if (draw.drawn && draw.grid.state.some((st) => st === CELL_GONE || st === CELL_FALLEN)) roomFor(live, draw.grid.storey, draw);
          redraw(live, draw);
          live.version++;
          o.onRedrawn?.(live.seam, draw.grid.storey, draw.grid.faceIndex, false);
          units -= WORK_REDRAW;
          if (units <= 0) return;
        }
        sagRoof(live);
      }
      work.splice(i, 1);
    }
  }

  function liveOf(seam: StructureDamageSeam): Live | null {
    const a = seam.anatomy;
    if (!a.storeys.length) return null;
    let live = lives.get(seam.structureIdx);
    if (!live) {
      live = { seam, wall: createWallFracture(a), faces: new Map(), sag: new Map(), roofCorners: null, sagSignature: '', released: false,
        claiming: new Map(), sortAt: [0, 0], sorting: null, byFace: null, room: [], roomStoreys: new Set(), baked: [], bakedPending: [],
        sunk: new Float32Array(a.storeys.length), flight: new Float32Array(a.storeys.length),
        bakedMerged: new Map(), mergedAt: 0, heapBody: new Map(), watch: [], watchedAt: -1e9, touchedAt: -1e9,
        strikes: 0, version: 0, lastX: 0, lastY: 0, lastZ: 0, lastAt: -1e9 };
      lives.set(seam.structureIdx, live);
    }
    return live;
  }
  /** The faces an outcome touched, its bodies planned, its drawing queued; the [storey, face] pairs. */
  function queue(live: Live, bdx: number, bdz: number, kind: WallStrikeKind, seed: number, settled = false): number[] {
    // the faces it touched: the struck one, and every one a fallen cluster runs through
    const touched = new Set<number>(outcome.face >= 0 ? [outcome.face] : []);
    for (const cl of outcome.fallen) for (let i = 0; i < cl.length; i += 2) touched.add(cl[i]);
    for (let i = 0; i < outcome.sagged.length; i += 2) touched.add(outcome.sagged[i]);
    // bodies: the knocked chunks, then what fell (planned now, spawned as the drawing goes); a settled event (a late
    // joiner's log, destruction-slabs 227) cuts its cells and draws them at once and throws nothing
    const specs: BodySpec[] = [];
    if (!settled) {
      const budget = bodiesPerStrike - (outcome.face >= 0 ? planKnocked(live, outcome.face, outcome.knocked, bdx, bdz, kind, outcome.u, outcome.v,
        Math.ceil(bodiesPerStrike / 2), seed, specs) : 0);
      planFallen(live, outcome.fallen, budget, damageSeed(seed, 2), specs);
    }
    work.push({ live, faces: [...touched], bodies: specs, step: live.byFace ? 1 : 0, claimed: 0, spawned: 0, drawn: 0 });
    if (settled) advanceWork(Infinity, live);
    const faces: number[] = [];
    for (const f of touched) faces.push(live.wall.faces[f].storey, live.wall.faces[f].faceIndex);
    return faces;
  }

  return {
    strike(seam, x, y, z, dirX, dirZ, munition, chargeKg, caliberMm, radiusM, settled = false) {
      const a = seam.anatomy;
      const hole = holeFor(munition, chargeKg, caliberMm);
      if (radiusM !== undefined && radiusM > 0) hole.radiusM = radiusM;
      if (!(hole.radiusM > 0)) return null;
      const live = liveOf(seam);
      if (!live) return null;
      // the same burst's breach stage a moment after its round's own strike (or the reverse): that round, once
      const t = o.now();
      live.touchedAt = t;
      // (a late joiner's settled log lays every hole at one instant: each its own)
      if (!settled && t - live.lastAt < 1 && Math.hypot(live.lastX - x, live.lastY - y, live.lastZ - z) < 0.5) return null;
      // the round in the body frame
      const { x: px, y: py, z: pz, yaw } = a.placement;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const wx = x - px, wz = z - pz;
      const bx = wx * c - wz * s, by = y - py, bz = wx * s + wz * c;
      const dl = Math.hypot(dirX, dirZ) || 1;
      const bdx = (dirX * c - dirZ * s) / dl, bdz = (dirX * s + dirZ * c) / dl;
      // (round 4) a round on a face that draws no flat wall takes nothing and lays nothing — no kit rim either: one laid
      // straight across a round tower's wall stood half in the air (the census's reservoir #17 valve tower)
      const near = struckFace(live.wall, bx, by, bz, true);
      if (near && live.wall.faces[near.face]!.notWall) return [];
      const seed = damageSeed(a.seed, 7001, live.strikes++, Math.round(bx * 100), Math.round(by * 100), Math.round(bz * 100));
      if (!strikeWall(live.wall, { x: bx, y: by, z: bz, dirX: bdx, dirZ: bdz, radiusM: hole.radiusM, kind: hole.kind, seed }, outcome)) {
        return null;
      }
      live.lastX = x; live.lastY = y; live.lastZ = z; live.lastAt = t;
      return queue(live, bdx, bdz, hole.kind, seed, settled);
    },
    dropFace(seam, storey, faceIndex, stubV, dirX, dirZ, settled = false) {
      const live = liveOf(seam);
      if (!live) return false;
      live.touchedAt = o.now();
      const f = live.wall.faces.findIndex((g) => g.storey === storey && g.faceIndex === faceIndex);
      if (f < 0 || live.wall.faces[f]!.notWall) return false;
      const yaw = seam.anatomy.placement.yaw, c = Math.cos(yaw), s = Math.sin(yaw);
      const dl = Math.hypot(dirX, dirZ) || 1;
      const bdx = (dirX * c - dirZ * s) / dl, bdz = (dirX * s + dirZ * c) / dl;
      const seed = damageSeed(seam.anatomy.seed, 7002, live.strikes++, storey, faceIndex);
      dropFace(live.wall, f, stubV, outcome);
      outcome.face = -1;
      if (!outcome.fallen.length) return true;
      queue(live, bdx, bdz, 'blast', seed, settled);
      return true;
    },
    holdStoreys(structureIdx, seam) {
      const live = lives.get(structureIdx) ?? liveOf(seam);
      if (live) { live.wall.floorsHold = true; live.touchedAt = o.now(); }
    },
    idle(structureIdx) {
      for (let i = 0; i < work.length; i++) if (work[i].live.seam.structureIdx === structureIdx) return false;
      return true;
    },
    version: (structureIdx) => lives.get(structureIdx)?.version ?? 0,
    has(structureIdx) { return lives.has(structureIdx); },
    standing(structureIdx) {
      const live = lives.get(structureIdx);
      if (!live) return [];
      const out: THREE.Mesh[] = [];
      for (const d of live.faces.values()) out.push(...d.meshes);
      return out;
    },
    rooms: (structureIdx) => [...(lives.get(structureIdx)?.room ?? [])],
    heapOf(structureIdx) {
      const live = lives.get(structureIdx);
      return live ? [...live.baked, ...live.bakedPending, ...live.bakedMerged.values()] : [];
    },
    roofFell(structureIdx) {
      roofGone.add(structureIdx);
      // (a room laid before the fall loses its ceiling with the roof: it stood as a lid over the roofless top storey)
      const live = lives.get(structureIdx);
      if (!live) return;
      const top = live.seam.anatomy.storeys.length - 1;
      for (const m of live.room) {
        if (m.userData.storey !== top || !Number.isFinite(m.userData.ceilFrom)) continue;
        m.geometry.setDrawRange(0, m.userData.ceilFrom as number);
        // (round 5; the round-4 critics' films: tavern #7, depot #8, urban church #15 — the roofless storey under one flat dark
        // plane, its room's walls and floor laid in an interior's shade) open to the sky, lit as the sky lights it
        const shade = Number(m.userData.roomShade ?? 1);
        if (m.userData.openToSky === true || !(shade < 1)) continue;
        m.userData.openToSky = true;
        const col = m.geometry.getAttribute('color') as THREE.InterleavedBufferAttribute | undefined;
        if (!col) continue;
        const n = m.userData.ceilFrom as number;
        for (let i = 0; i < n; i++) col.setXYZ(i, col.getX(i) / shade, col.getY(i) / shade, col.getZ(i) / shade);
        col.data.needsUpdate = true;
      }
    },
    dropPieces(structureIdx, pieces) {
      const live = lives.get(structureIdx);
      if (!live) return;
      live.touchedAt = o.now();
      // per mesh: the cells its loose pieces lie in, and what of its standing-with-the-face content they are
      const byMesh = new Map<THREE.Mesh, { draw: FaceDraw; f: number; cells: Set<number>; caps: Set<number>; still: Map<number, Set<number>> }>();
      for (const { mesh, tris } of pieces) {
        let entry = byMesh.get(mesh);
        if (!entry) {
          let draw: FaceDraw | null = null, f = -1;
          for (const [face, d] of live.faces) if (d.meshes.includes(mesh)) { draw = d; f = face; break; }
          if (!draw) continue;
          entry = { draw, f, cells: new Set(), caps: new Set(), still: new Map() };
          byMesh.set(mesh, entry);
        }
        const ranges = mesh.userData.cellRanges as number[] | undefined;
        if (!ranges) continue;
        for (const t of tris) for (let k = 0; k < ranges.length; k += 3) {
          if (t < ranges[k]! || t >= ranges[k + 1]!) continue;
          const c = ranges[k + 2]!;
          // (what stands with the face — past its rectangle, over no drawn wall — has no cell to fall with: it goes where it hung)
          if (c <= CAP_CELL) entry.caps.add(CAP_CELL - c);
          else if (c >= 0) entry.cells.add(c);
          else { let set = entry.still.get(c); if (!set) entry.still.set(c, set = new Set()); set.add(t - ranges[k]!); }
          break;
        }
      }
      const redrawn = new Set<FaceDraw>();
      let salt = 0;
      for (const [mesh, { draw, f, cells, caps, still }] of byMesh) {
        // a reveal cut loose (its cell's own triangles stand away from its rectangle's edge): that cell's edges are drawn no more
        for (const c of caps) if (!cells.has(c)) { draw.noCap.add(c); redrawn.add(draw); }
        if (still.size) {
          const fg = [...draw.groups.values()].find((g) => g.material === mesh.material);
          if (fg) for (const [c, local] of still) {
            const arr = fg.core.get(c);
            if (!arr) continue;
            const per = 3 * fg.layout.stride, n = Math.floor(arr.length / per);
            const keep = new Float32Array(arr.length);
            let o = 0;
            for (let t = 0; t < n; t++) if (!local.has(t)) { keep.set(arr.subarray(t * per, (t + 1) * per), o); o += per; }
            fg.core.set(c, keep.slice(0, o));
          }
          redrawn.add(draw);
        }
        const list: number[] = [];
        for (const c of cells) if (draw.grid.state[c] !== CELL_FALLEN && draw.grid.state[c] !== CELL_GONE) list.push(f, c);
        if (!list.length) continue;
        for (let k = 0; k < list.length; k += 2) draw.grid.state[list[k + 1]!] = CELL_FALLEN;
        spawnCells(live, list, 0, -0.5, 0, 0.6, damageSeed(live.seam.anatomy.seed, 7004, structureIdx, salt++));
        redrawn.add(draw);
      }
      for (const d of redrawn) { redraw(live, d); live.version++; }
    },
    dropRoom(structureIdx, mesh) {
      const live = lives.get(structureIdx);
      if (!live) return;
      const i = live.room.indexOf(mesh);
      if (i < 0) return;
      o.group.remove(mesh); mesh.geometry.dispose();
      live.room.splice(i, 1);
    },
    release(structureIdx) {
      const live = lives.get(structureIdx);
      if (!live) return;
      live.released = true;
      live.touchedAt = o.now();
      for (const d of live.faces.values()) for (const m of d.meshes) { o.group.remove(m); m.geometry.dispose(); }
      for (const m of live.room) { o.group.remove(m); m.geometry.dispose(); }
      live.faces.clear();
      live.room.length = 0;
    },
    dropRooms(structureIdx, fromStorey, only = false) {
      const live = lives.get(structureIdx);
      if (!live) return;
      live.touchedAt = o.now();
      for (let i = live.room.length - 1; i >= 0; i--) {
        const m = live.room[i];
        const st = m.userData.storey as number;
        if (only ? st !== fromStorey : !(st >= fromStorey)) continue;
        o.group.remove(m); m.geometry.dispose();
        live.roomStoreys.delete(m.userData.roomKey as string);
        live.room.splice(i, 1);
      }
    },
    lowerOver(structureIdx, storey, dropM, baked) {
      const live = lives.get(structureIdx);
      if (!live || !(dropM > 0)) return;
      live.touchedAt = o.now();
      const over = (st: number): boolean => st > storey;
      if (!baked) {
        // in flight: shown lowered, the data as it stood
        for (let st = storey + 1; st < live.flight.length; st++) live.flight[st] = dropM;
        for (const d of live.faces.values()) {
          if (!over(d.grid.storey)) continue;
          for (const m of d.meshes) { bodyToWorld(live, m.matrix); m.matrix.elements[13] -= dropM; m.matrixWorldNeedsUpdate = true; }
        }
        for (const m of live.room) {
          const st = m.userData.storey as number;
          if (!over(st)) continue;
          bodyToWorld(live, m.matrix); m.matrix.elements[13] -= live.sunk[st]! + dropM; m.matrixWorldNeedsUpdate = true;
        }
        live.seam.touchShadows();
        return;
      }
      // for good: the faces over it (their grids, cut cells and sorted triangles) lowered, then drawn again
      for (let st = storey + 1; st < live.sunk.length; st++) { live.sunk[st] += dropM; live.flight[st] = 0; }
      const shift = (list: { length: number; [i: number]: number }, stride: number): void => {
        for (let i = 1; i < list.length; i += stride) list[i] -= dropM;
      };
      live.wall.faces.forEach((g, f) => {
        if (!over(g.storey)) return;
        (g.origin as unknown as number[])[1] -= dropM;
        const sorted = live.byFace?.get(f) ?? live.sorting?.get(f);
        if (sorted) for (const soup of sorted.soups.values()) shift(soup.soup, soup.layout.stride);
      });
      for (const d of live.faces.values()) {
        if (!over(d.grid.storey)) continue;
        for (const g of d.groups.values()) {
          for (const list of g.cells.values()) shift(list, g.layout.stride);
          for (const arr of g.core.values()) shift(arr, g.layout.stride);
          for (const arr of g.skin.values()) shift(arr, g.layout.stride);
        }
        redraw(live, d);
      }
      for (const m of live.room) {
        const st = m.userData.storey as number;
        if (!over(st)) continue;
        bodyToWorld(live, m.matrix); m.matrix.elements[13] -= live.sunk[st]!; m.matrixWorldNeedsUpdate = true;
      }
      // the roof's sag reads its corners again
      live.roofCorners = null; live.sagSignature = '';
      live.version++;
      live.seam.touchShadows();
    },
    flush(structureIdx) {
      if (structureIdx !== undefined) { const live = lives.get(structureIdx); if (live) advanceWork(Infinity, live); return; }
      advanceWork(Infinity);
      while (cracking.length) crackBody(cracking.pop()!);
    },
    update() {
      const tWork = profStart();
      if (work.length) advanceWork(workUnits);
      profEnd('fr.work', tWork);
      const t = o.now();
      const dt = Math.max(0, Math.min(0.25, t - lastUpdateS));
      lastUpdateS = t;
      const tCrack = profStart();
      // a chunk a frame cracks (its clumps' geometry is made then): the rest wait whole, still moving
      for (let k = 0; k < CRACKS_PER_UPDATE && cracking.length; k++) crackBody(cracking.shift()!);
      profEnd('fr.crack', tCrack);
      const tMerge = profStart();
      for (const live of lives.values()) {
        if (live.bakedPending.length && (live.bakedPending.length >= 6 || t - live.mergedAt > 1)) { mergeBaked(live); live.mergedAt = t; }
        // (round 5) its watched plates while it changes, five times a second, and once a second for a while after (the
        // bodies under them settle)
        if (live.watch.length && t - live.touchedAt <= WATCH_KEEP_S && t - live.watchedAt >= (t - live.touchedAt <= WATCH_AFTER_S ? WATCH_EVERY_S : 1)) judgeWatched(live);
      }
      profEnd('fr.merge', tMerge);
      if (!list.length) return;
      const tPose = profStart();
      // backwards: a bake swaps the last body into this one's place
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        if (!o.pool.framePoseAt(b.handle, _pose)) { unlist(b); continue; }
        writePose(b, _pose);
        b.age += dt;
        b.still = o.pool.asleep(b.handle) ? b.still + dt : 0;
        // (the port's receipt, 2026-10-16: a door and its lintel came down onto their own sill upright and stood there,
        // creeping, for seconds) one that has all but stopped standing on its edge is shoved over as one at rest is
        if (!b.tipped && (b.still > 0.25 || (b.age > 0.6 && o.pool.velocity(b.handle, _vel)
          && Math.hypot(_vel[0], _vel[1], _vel[2]) < TIP_MPS && Math.hypot(_vel[3], _vel[4], _vel[5]) < TIP_RADS))) {
          const tipped = tipIfStanding(b, _pose);
          if (tipped || b.still > 0.25) b.tipped = true;
          if (tipped) { b.still = 0; continue; }
        }
        // (one that only creeps, rocking on the heap, six seconds on lies where it is: woken by its neighbours its sleep
        // never came)
        const old = b.age >= SLOW_AGE_S && o.pool.velocity(b.handle, _vel)
          && Math.hypot(_vel[0], _vel[1], _vel[2]) < SLOW_MPS && Math.hypot(_vel[3], _vel[4], _vel[5]) < SLOW_RADS;
        if ((b.still >= BAKE_STILL_S || b.age >= BAKE_AGE_S || old) && !o.holdBake?.(b.structureIdx, b.pose[1])) {
          // (destruction-slabs 227 round 4; the census: wall panels of a fallen tower and a depot baked into their heaps
          // standing on their edges beside the ruin, 4-6 m² plates upright on the ground) one still on its edge when it would
          // bake cracks into its clumps, or (too few cells) is pushed over again, twice at most
          if (b.age < BAKE_AGE_S && onEdge(b, _pose)) {
            if (!b.cracked && b.cells.length >= CRACK_MIN_CELLS * 2) { b.cracked = true; cracking.push(b); b.still = 0; continue; }
            if ((b.retips ?? 0) < 2) { b.retips = (b.retips ?? 0) + 1; b.tipped = false; b.still = 0; tipIfStanding(b, _pose); continue; }
            // (still on its edge, propped where no push turns it: it lies down flat where it stood, its broad side down)
            layFlat(b, _pose);
          }
          bake(b);
        }
      }
      profEnd('fr.poses', tPose);
    },
    liveBodies() { return bodies.size; },
    reset() {
      for (const b of list) { o.pool.release(b.handle); for (const m of b.meshes) { o.group.remove(m); m.geometry.dispose(); } }
      bodies.clear();
      list.length = 0;
      cracking.length = 0;
      skipped = 0;
      roofGone.clear();
      for (const live of lives.values()) {
        for (const d of live.faces.values()) for (const m of d.meshes) { o.group.remove(m); m.geometry.dispose(); }
        for (const m of [...live.room, ...live.baked, ...live.bakedPending, ...live.bakedMerged.values()]) { o.group.remove(m); m.geometry.dispose(); }
      }
      lives.clear();
      work.length = 0;
      bakedCount = 0;
    },
    stats() {
      let faces = 0;
      for (const live of lives.values()) faces += live.faces.size;
      return { buildings: lives.size, faces, bodies: bodies.size, baked: bakedCount, skipped };
    },
  };
}

