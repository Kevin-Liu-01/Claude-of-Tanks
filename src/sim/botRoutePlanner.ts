import {
  BRIDGE_SNAP_DECK, BRIDGE_SNAP_NONE, bridgeDeckOver, snapToBridgeDeck,
  type BridgeDeckSnap, type NavigationBridgeDeck,
} from './bridgeDeckNavigation.ts';
import { createNavigationLiquidSafety } from './navigationLiquidSafety.ts';
type LiquidCorridorGuard = NonNullable<ReturnType<typeof createNavigationLiquidSafety>>;
import {
  TERRAIN_MARGIN_EPS,
  driveGroundTypeAt,
  groundResistanceFor,
  terrainSlopeMargin,
  terrainTravelCostFactor,
} from './terrainMobility.ts';
import type { TerrainMobilitySpec } from './terrainMobility.ts';
import { tankBodyTopM, tankContactRect } from './tankContactShape.ts';
import {
  collisionFootprintContainsPoint,
  hullPassesObstacleTop,
  setObbShape,
  rayCollisionFootprintEntry2,
  type CollisionRecord,
  type CollisionShape,
  type SimpleCollisionShape,
} from '../world/collision.ts';

const WORLD_MIN = -500;
const WORLD_MAX = 500;
const CELL_M = 25;
const GRID_N = Math.floor((WORLD_MAX - WORLD_MIN) / CELL_M) + 1;
const SQRT2 = Math.SQRT2;
const GROUND_HARD = 0;
const GROUND_MEDIUM = 1;
const GROUND_SOFT = 2;
const NEIGHBOR_STEPS: ReadonlyArray<readonly [number, number, number]> = [
  [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
  [-1, -1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [1, 1, SQRT2],
];
const FORWARD_STEPS = [1, 3, 6, 7] as const;
const FORWARD_STEPS_COUNT = 4;
const OPPOSITE_STEP = [1, 0, 3, 2, 7, 6, 5, 4] as const;
/**
 * Hull clearance (bots lane, 2026-10-02): one grid serves every hull, so its edges are cleared for the widest body
 * contact in the fleet (the Jagdpanzer E100 X, 2.24 m half-width; botRoutePlanner.selftest measures the fleet against
 * this bound). Steinburg's routes ran a diagonal edge through a block whose two buildings stand 0.6 m apart, and led a
 * courtyard out through a 1 m gap in the row behind it.
 */
export const NAV_HULL_HALF_WIDTH_M = 2.25;
/** A route leg keeps this far from every solid footprint: the widest hull and half a metre of steering each side, so
 * no leg runs through a gap narrower than 5.5 m. */
const NAV_LEG_CLEARANCE_M = NAV_HULL_HALF_WIDTH_M + 0.5;
/** A leg that starts (a hull parked by a wall) or ends (a goal by a rock) inside that margin need only stay off it. */
const NAV_LEG_TOUCH_M = 0.25;
/** A part whose bottom stands this far above the route clears the tallest body (3.16 m): the gorge under a deck. */
const NAV_OVERHEAD_M = 3.5;
/** A grid cell further than this above or below a hull is another level, not where it can drive from. */
const NAV_LEVEL_M = 10;
/** A grid edge whose straight line is not clear may bend once round the cover: at these fractions of its length, this
 * far to either side (inside the two cells' squares). Steinburg's census: three in four blocked edges had such a bend. */
const NAV_BEND_FRACTIONS = [0.5, 0.3, 0.7] as const;
const NAV_BEND_OFFSETS_M = [3, 5.5, 8, 11] as const;
/** Or it shifts its whole lane sideways by this much: a street off the lattice line, one a wreck narrows. */
const NAV_LANE_SHIFTS_M = [1, 2, 3, 4.5] as const;
/** Per cell and forward step, the way of an open edge whose straight line is not clear: up to two points (x, z),
 * NaN when unused. */
const WAY_FLOATS = 4;
const WAY_STRIDE = FORWARD_STEPS_COUNT * WAY_FLOATS;
/** Interior terrain samples along each edge for its steepest stretch (a cliff between two cell centres whose heights
 * alone read as a climb: a gorge wall, a deck's cliff edge). One every quarter: a rise of CLIFF_GRADE over 6.25 m. */
const EDGE_STEEP_SAMPLES = 3;
/**
 * Each interior sample also reads the side slope across the edge's line, over this much ground either side of it
 * (about a hull's half track), and the edge holds it to the same two-way rule as its grade (bots lane, 2026-10-03).
 * Redrock Divide's plateau face (55-63 degrees) carried edges along it and slanting across it, because an edge read
 * only the grade along its own line: defenders bound for the plateau were routed across the face and fell off it.
 */
const EDGE_SIDE_HALF_M = 2;
/** Detour points tried round a leg's blocked end: rings of twelve bearings. */
const NAV_VIA_RINGS_M = [8, 14, 20] as const;
const NAV_VIA_BEARINGS = 12;

type GroundType = 'hard' | 'medium' | 'soft';
export type BotRoutePoint = [number, number];
/** Map-authored route preference, not a depth/drowning or collision rule. */
export type NavigationWaterPolicy = 'avoid-liquid';

interface Position2 {
  x: number;
  z: number;
  /** A hull's own height: a start under a bridge deck routes from the gorge floor, not from the deck above it, and a
   * goal on a deck ends on the deck (a goal without one ends at the nearest open cell, whatever its level). */
  y?: number;
}

interface NavigationHeightField {
  readonly navigationWaterPolicy?: NavigationWaterPolicy;
  /** Round 61: the bridge decks the field is exempted under (terrain.ts); dry ground at the deck's height for routing. */
  readonly bridgeDecks?: readonly NavigationBridgeDeck[];
  getWaterMaskAt?(x: number, z: number): number;
  getHeightAt(x: number, z: number): number;
  getGroundType?(x: number, z: number): string;
  getDriveGroundType?(x: number, z: number): string;
}

interface NavigationObstacle {
  min: readonly number[];
  max: readonly number[];
  shape2?: CollisionShape;
  crushed?: boolean;
  crushable?: boolean;
  dead?: boolean;
}

/** Straight-leg clearance against the grid's own obstacles, for the legs off the grid (from a hull, to a goal). */
interface NavigationClearance {
  legClear(ax: number, az: number, ah: number, bx: number, bz: number, bh: number, touchStart: boolean,
    touchEnd: boolean): boolean;
}

type ObstacleQuery<T extends NavigationObstacle = NavigationObstacle> = (
  minX: number, minZ: number, maxX: number, maxZ: number, out: T[],
) => T[];

export interface BotNavigationGrid {
  readonly navigationWaterPolicy?: NavigationWaterPolicy;
  /** One bit per NEIGHBOR_STEPS edge; allocated only for explicit dry routing. */
  readonly waterBlockedEdges?: Uint8Array;
  /** Bridge parapets are not entrances, even when both grid endpoints are dry. */
  readonly bridgeBlockedEdges?: Uint8Array;
  readonly liquidField?: NavigationHeightField;
  readonly exactConnectorClear?: (x: number, z: number) => boolean;
  readonly heights: Float32Array;
  readonly blocked: Uint8Array;
  readonly groundTypes: Uint8Array;
  /** Round 61: the point each cell routes through (x, z interleaved) — the cell centre, or the deck axis for a cell
   * that belongs to a bridge crossing. Allocated only when the field publishes bridge decks. */
  readonly cellPositions?: Float32Array;
  /** One bit per NEIGHBOR_STEPS edge the widest hull cannot drive: no clear straight line and no clear single bend. */
  readonly hullBlockedEdges?: Uint8Array;
  /** The way (one bend or a lane shift's two points, x z x z) of an open edge whose straight line is not clear, per cell
   * and forward step (NaN where unused). */
  readonly hullBends?: Float32Array;
  /** Connected cells under the hull edges (slope aside): a route starts on the goal's side when a clear leg allows. */
  readonly hullComponents?: Int32Array;
  readonly hullClearance?: NavigationClearance;
  /** Wrecks narrow streets after the grid is built (navigationWrecks below): the edges they close or bend. */
  readonly wreckOverlay?: WreckOverlay;
  /**
   * Re-read the grid round a footprint that changed after the build (destruction, docs/DESTRUCTION.md §6: a structure
   * collapsed, its rubble raised the ground): the cells near it (blocked, height, ground, liquid), their edges' grade
   * and liquid, the hull edges and bends within reach of it, and the components. The authority and the solo step call
   * it with the same footprint; returns how many cells it re-read.
   */
  readonly refreshArea?: (minX: number, minZ: number, maxX: number, maxZ: number) => number;
  /** Per cell and NEIGHBOR_STEPS direction, the steepest uphill stretch of that edge, or the steepest side slope across
   * its line at its interior samples when that is steeper (percent grade, capped at 255): the route search holds every
   * edge to it both ways, as it holds the cell-to-cell grade. */
  readonly edgeSteepness?: Uint8Array;
}

/** A wreck's footprint for the grid: its contact rectangle and the vertical span it fills. */
export interface NavigationWreck {
  x: number;
  z: number;
  yaw: number;
  halfLength: number;
  halfWidth: number;
  minY: number;
  maxY: number;
}

interface WreckOverlay {
  /** The synced footprints and their obstacle records (index-aligned). */
  footprints: NavigationWreck[];
  records: CollisionRecord[];
  count: number;
  /** One bit per NEIGHBOR_STEPS edge a wreck closed for the widest hull; allocated on the first wreck. */
  blockedEdges: Uint8Array | null;
  /** The way round wrecks (and cover) of an edge whose own way they block, laid out as BotNavigationGrid.hullBends. */
  bends: Float32Array | null;
  /** Re-test the edges round changed wrecks; false when nothing moved more than the sync tolerance. */
  sync(wrecks: readonly NavigationWreck[], count: number): boolean;
  /** The cover under the overlay changed (a collapse): the next sync re-tests every wreck's edges. */
  invalidate(): void;
}

interface BotNavigationGridOptions<T extends NavigationObstacle = NavigationObstacle> {
  heightField?: NavigationHeightField;
  queryObstacles?: ObstacleQuery<T> | null;
  getObstacles?: () => T[];
}

interface BotRouteOptions extends BotNavigationGridOptions {
  start?: Position2;
  goal?: Position2;
  navigation?: BotNavigationGrid | null;
  rng?: () => number;
  role?: string;
  spec?: TerrainMobilitySpec;
  useRoleDetour?: boolean;
  /** Only a route that arrives on the goal's own level (goal.y) is wanted: none ([]) when it cannot get there. */
  requireGoalLevel?: boolean;
}

interface HeapNode {
  index: number;
  ix: number;
  iz: number;
  score: number;
}

interface RouteSolution {
  points: BotRoutePoint[];
  /** The grid cell behind each point. */
  cells: number[];
  cost: number;
  /** False when the goal cell lies beyond the reachable cells and the route ends at the one nearest it. */
  reached: boolean;
  /** False when a goal given its level (goal.y) has no open cell on that level near it. */
  levelGoal?: boolean;
}

interface RouteSearchState {
  projectReachableGoal?: boolean;
  navigation: BotNavigationGrid;
  spec: TerrainMobilitySpec;
  seed: number;
  costs: Float64Array;
  parents: Int32Array;
  closed: Uint8Array;
  heap: MinHeap;
  goalX: number;
  goalZ: number;
}

function encodeGroundType(type: string) {
  return type === 'hard' ? GROUND_HARD : type === 'soft' ? GROUND_SOFT : GROUND_MEDIUM;
}

function decodeGroundType(type: number): GroundType {
  return type === GROUND_HARD ? 'hard' : type === GROUND_SOFT ? 'soft' : 'medium';
}

function clamp(value: number, min: number, max: number) {
  return value < min ? min : value > max ? max : value;
}

function cellIndex(ix: number, iz: number) {
  return iz * GRID_N + ix;
}

function worldCell(value: number) {
  return clamp(Math.round((value - WORLD_MIN) / CELL_M), 0, GRID_N - 1);
}

function worldCoord(index: number) {
  return WORLD_MIN + index * CELL_M;
}

/** The point a cell routes through: its centre, or the bridge-deck axis point the grid snapped it to (round 61). */
function cellX(positions: Float32Array | undefined, index: number) {
  return positions ? positions[index * 2] : worldCoord(index % GRID_N);
}
function cellZ(positions: Float32Array | undefined, index: number) {
  return positions ? positions[index * 2 + 1] : worldCoord(Math.floor(index / GRID_N));
}
const _deckSnap: BridgeDeckSnap = { x: 0, z: 0, y: 0 };

function hashNoise(seed: number, ix: number, iz: number) {
  let value = seed ^ Math.imul(ix + 17, 0x9e3779b1) ^ Math.imul(iz + 31, 0x85ebca6b);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 0x100000000;
}

class MinHeap {
  items: HeapNode[];
  constructor() { this.items = []; }
  push(node: HeapNode) {
    const items = this.items;
    items.push(node);
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (items[parent].score <= node.score) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = node;
  }
  pop(): HeapNode | null {
    const items = this.items;
    if (!items.length) return null;
    const root = items[0];
    const tail = items.pop();
    if (items.length) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        if (left >= items.length) break;
        const right = left + 1;
        const child = right < items.length && items[right].score < items[left].score
          ? right : left;
        if (items[child].score >= tail!.score) break;
        items[index] = items[child];
        index = child;
      }
      items[index] = tail!;
    }
    return root;
  }
  get length() { return this.items.length; }
}

function roleOffset(role: string, rng: () => number) {
  const magnitude = role === 'scout' ? 150 + rng() * 100
    : role === 'flanker' ? 90 + rng() * 100
      : role === 'sniper' ? 55 + rng() * 95
        : 15 + rng() * 60;
  return magnitude * (rng() < 0.5 ? -1 : 1);
}

function isSolidObstacleAt(
  obstacles: readonly NavigationObstacle[],
  x: number,
  z: number,
): boolean {
  for (const obstacle of obstacles) {
    if (obstacle.crushed || obstacle.crushable) continue;
    if (x < obstacle.min[0] - 3.5 || x > obstacle.max[0] + 3.5
      || z < obstacle.min[2] - 3.5 || z > obstacle.max[2] + 3.5) continue;
    if (collisionFootprintContainsPoint(obstacle as CollisionRecord, x, z, 3.5)) return true;
  }
  return false;
}

function sampleNavigationRow<T extends NavigationObstacle>(
  iz: number,
  heightField: NavigationHeightField,
  queryObstacles: ObstacleQuery<T> | null,
  obstacles: readonly T[],
  candidates: T[],
  heights: Float32Array,
  groundTypes: Uint8Array,
  blocked: Uint8Array,
  positions: Float32Array | undefined,
): void {
  for (let ix = 0; ix < GRID_N; ix++) {
    sampleNavigationCell(ix, iz, heightField, queryObstacles, obstacles, candidates, heights, groundTypes, blocked, positions);
  }
}

/** One cell of the grid (the build's row pass, and a refresh round a changed footprint). */
function sampleNavigationCell<T extends NavigationObstacle>(
  ix: number,
  iz: number,
  heightField: NavigationHeightField,
  queryObstacles: ObstacleQuery<T> | null,
  obstacles: readonly T[],
  candidates: T[],
  heights: Float32Array,
  groundTypes: Uint8Array,
  blocked: Uint8Array,
  positions: Float32Array | undefined,
): void {
  const index = cellIndex(ix, iz);
  let x = worldCoord(ix);
  let z = worldCoord(iz);
  if (positions) {
    // round 61: a cell within half a cell of a bridge crossing's road axis routes through that axis — over an
    // approach it is sampled there like any road cell; over the span it IS the deck: the deck's height, stone, and
    // the deck's own record is its floor, not an obstacle
    const snap = snapToBridgeDeck(heightField.bridgeDecks!, x, z, CELL_M / 2, _deckSnap);
    if (snap !== BRIDGE_SNAP_NONE) { x = _deckSnap.x; z = _deckSnap.z; }
    positions[index * 2] = x;
    positions[index * 2 + 1] = z;
    if (snap === BRIDGE_SNAP_DECK) {
      heights[index] = _deckSnap.y;
      groundTypes[index] = GROUND_HARD;
      blocked[index] = 0;
      return;
    }
  }
  heights[index] = heightField.getHeightAt(x, z);
  const ground = driveGroundTypeAt(heightField, x, z);
  groundTypes[index] = encodeGroundType(ground);
  const nearby = queryObstacles
    ? queryObstacles(x - 4.5, z - 4.5, x + 4.5, z + 4.5, candidates)
    : obstacles;
  blocked[index] = isSolidObstacleAt(nearby, x, z) ? 1 : 0;
}

/**
 * One construction-only water pass. Preserve the original terrain/obstacle
 * sampling order above; opt-out maps allocate/query nothing here.
 *
 * This is sampled centerline safety, not depth or a swept-hull certificate.
 * Both directions share one edge test; segment intervals are at most 2.5 m.
 */
function navigationSampleIsLiquid(field: NavigationHeightField, x: number, z: number): boolean {
  // round 61: the water under a bridge deck is liquid; the deck over it is the dry ground a hull rides
  if (field.bridgeDecks && bridgeDeckOver(field.bridgeDecks, x, z)) return false;
  // Called only after addDryNavigationPolicy validates the field capability.
  const mask = field.getWaterMaskAt!(x, z);
  if (!Number.isFinite(mask) || mask < 0 || mask > 1) {
    throw new TypeError('navigation liquid coverage must be finite and within 0..1');
  }
  return mask > 0;
}

function navigationEdgeCrossesLiquid(
  field: NavigationHeightField, ix: number, iz: number,
  step: readonly [number, number, number], positions: Float32Array | undefined,
): boolean {
  const [dx, dz, distanceScale] = step;
  const intervals = Math.ceil(CELL_M * distanceScale / 2.5);
  // the edge runs between the points the two cells route through (their centres, or a bridge deck's axis)
  const from = cellIndex(ix, iz), to = cellIndex(ix + dx, iz + dz);
  const x0 = cellX(positions, from), z0 = cellZ(positions, from);
  const x1 = cellX(positions, to), z1 = cellZ(positions, to);
  for (let sample = 1; sample < intervals; sample++) {
    const fraction = sample / intervals;
    if (navigationSampleIsLiquid(field, x0 + (x1 - x0) * fraction, z0 + (z1 - z0) * fraction)) return true;
  }
  return false;
}

function addDryNavigationPolicy(
  heightField: NavigationHeightField,
  heights: Float32Array,
  blocked: Uint8Array,
  groundTypes: Uint8Array,
  exactConnectorClear: (x: number, z: number) => boolean,
  cellPositions?: Float32Array,
): Readonly<BotNavigationGrid> {
  if (typeof heightField.getWaterMaskAt !== 'function') {
    throw new TypeError('avoid-liquid navigation requires getWaterMaskAt');
  }
  const waterBlockedEdges = new Uint8Array(GRID_N * GRID_N);
  for (let index = 0; index < blocked.length; index++) {
    if (navigationSampleIsLiquid(heightField, cellX(cellPositions, index), cellZ(cellPositions, index))) {
      blocked[index] = 1;
    }
  }
  const forwardSteps = [1, 3, 6, 7] as const;
  const opposite = [1, 0, 3, 2, 7, 6, 5, 4] as const;
  for (let index = 0; index < blocked.length; index++) {
    if (blocked[index]) continue;
    const ix = index % GRID_N, iz = Math.floor(index / GRID_N);
    for (const direction of forwardSteps) {
      const [dx, dz] = NEIGHBOR_STEPS[direction];
      const nx = ix + dx, nz = iz + dz;
      if (isOutsideGrid(nx, nz) || blocked[cellIndex(nx, nz)]) continue;
      if (!navigationEdgeCrossesLiquid(heightField, ix, iz, NEIGHBOR_STEPS[direction], cellPositions)) continue;
      waterBlockedEdges[index] |= 1 << direction;
      waterBlockedEdges[cellIndex(nx, nz)] |= 1 << opposite[direction];
    }
  }
  return Object.freeze({
    heights, blocked, groundTypes, navigationWaterPolicy: 'avoid-liquid', waterBlockedEdges,
    liquidField: heightField, exactConnectorClear,
    ...(cellPositions ? { cellPositions } : {}),
  });
}

function bridgeSideEdges(decks: readonly NavigationBridgeDeck[], positions: Float32Array): Uint8Array {
  const edges = new Uint8Array(GRID_N * GRID_N);
  for (let iz = 0; iz < GRID_N; iz++) for (let ix = 0; ix < GRID_N; ix++) {
    const index = cellIndex(ix, iz), x = cellX(positions, index), z = cellZ(positions, index);
    for (let direction = 0; direction < NEIGHBOR_STEPS.length; direction++) {
      const [dx, dz] = NEIGHBOR_STEPS[direction];
      if (isOutsideGrid(ix + dx, iz + dz)) continue;
      const next = cellIndex(ix + dx, iz + dz);
      const nx = cellX(positions, next), nz = cellZ(positions, next);
      for (const deck of decks) {
        const along = (x - deck.x) * deck.ux + (z - deck.z) * deck.uz;
        const side = (x - deck.x) * deck.uz - (z - deck.z) * deck.ux;
        const da = (nx - x) * deck.ux + (nz - z) * deck.uz;
        const ds = (nx - x) * deck.uz - (nz - z) * deck.ux;
        if (Math.abs(ds) < 1e-6) continue;
        for (const sign of [-1, 1]) {
          const t = (sign * deck.halfWidth - side) / ds;
          if (t >= 0 && t <= 1 && Math.abs(along + t * da) < deck.halfLength - .01) {
            edges[index] |= 1 << direction;
          }
        }
      }
    }
  }
  return edges;
}

const _legPart: CollisionRecord = { min: [0, 0, 0], max: [0, 0, 0] };

/** One footprint (a whole simple record, or one part of a compound) as a record the 2D footprint tests read. */
function legProbe(record: NavigationObstacle, part: SimpleCollisionShape | null): CollisionRecord {
  if (!part) return record as CollisionRecord;
  _legPart.shape2 = part;
  return _legPart;
}

/** Is (x, z) on a bridge deck or within `margin` of it (where a route runs onto the deck from its approach)? */
function nearBridgeDeck(decks: readonly NavigationBridgeDeck[], x: number, z: number, margin: number): boolean {
  for (let i = 0; i < decks.length; i++) {
    const deck = decks[i], dx = x - deck.x, dz = z - deck.z;
    if (Math.abs(dx * deck.ux + dz * deck.uz) <= deck.halfLength + margin
      && Math.abs(dx * deck.uz - dz * deck.ux) <= deck.halfWidth + margin) return true;
  }
  return false;
}

/** Does the leg pass inside `reach` of one footprint where the hull meets it, at the route's height there? A part
 * high over the route (the deck above a gorge) is no wall; on and beside a bridge deck, neither is a part the hull
 * rides onto or over (the deck slab, the piers under it), by the same rule the hull's collision uses. */
function legMeetsFootprint(
  record: NavigationObstacle, part: SimpleCollisionShape | null, y0: number, y1: number,
  decks: readonly NavigationBridgeDeck[] | null, ax: number, az: number, ah: number, ux: number, uz: number,
  length: number, bh: number, reach: number,
): boolean {
  const entry = rayCollisionFootprintEntry2(legProbe(record, part), ax, az, ux, uz, length, reach);
  if (entry == null) return false;
  const h = ah + (bh - ah) * (entry / length);
  if (y0 >= Math.max(h, record.min[1]) + NAV_OVERHEAD_M) return false;
  // the entry lies the clearance outside the part, and a deck slab runs a metre or two past the span
  return !(decks && nearBridgeDeck(decks, ax + ux * entry, az + uz * entry, reach + 2)
    && hullPassesObstacleTop(h, y1, y0, !record.crushable));
}

/** Is a leg end inside `margin` of any footprint of the record (a hull parked by a building, a goal by a rock)? */
function legEndInside(record: NavigationObstacle, x: number, z: number, margin: number): boolean {
  const shape = record.shape2;
  if (!shape || shape.kind !== 'compound') return collisionFootprintContainsPoint(record as CollisionRecord, x, z, margin);
  for (let k = 0; k < shape.parts.length; k++) {
    if (collisionFootprintContainsPoint(legProbe(record, shape.parts[k]), x, z, margin)) return true;
  }
  return false;
}

function legMeetsSolid(
  obstacles: readonly NavigationObstacle[], decks: readonly NavigationBridgeDeck[] | null,
  ax: number, az: number, ah: number, bx: number, bz: number, bh: number, margin: number,
  touchStart = false, touchEnd = false,
): boolean {
  const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
  if (!(length > 1e-3)) return false;
  const ux = dx / length, uz = dz / length;
  for (let i = 0; i < obstacles.length; i++) {
    const record = obstacles[i];
    if (record.crushed || record.crushable || record.dead) continue;
    if (Math.max(ax, bx) < record.min[0] - margin || Math.min(ax, bx) > record.max[0] + margin
      || Math.max(az, bz) < record.min[2] - margin || Math.min(az, bz) > record.max[2] + margin) continue;
    // an end already inside the record's margin only has to keep the leg off the record itself
    const reach = (touchStart && legEndInside(record, ax, az, margin)) || (touchEnd && legEndInside(record, bx, bz, margin))
      ? NAV_LEG_TOUCH_M : margin;
    const shape = record.shape2;
    if (shape && shape.kind === 'compound') {
      for (let k = 0; k < shape.parts.length; k++) {
        const part = shape.parts[k];
        if (legMeetsFootprint(record, part, part.y0 ?? record.min[1], part.y1 ?? record.max[1], decks,
          ax, az, ah, ux, uz, length, bh, reach)) return true;
      }
    } else if (legMeetsFootprint(record, null, record.min[1], record.max[1], decks,
      ax, az, ah, ux, uz, length, bh, reach)) return true;
  }
  return false;
}

/** The bend slot of a forward step (1, 3, 6, 7), else -1. */
function forwardSlot(direction: number): number {
  return direction === 1 ? 0 : direction === 3 ? 1 : direction === 6 ? 2 : direction === 7 ? 3 : -1;
}

/** Does either leg of a bend sample liquid (only for a field that opts into avoid-liquid routing)? */
function bendCrossesLiquid(field: NavigationHeightField | null, ax: number, az: number, vx: number, vz: number,
  bx: number, bz: number): boolean {
  if (!field) return false;
  for (const [x0, z0, x1, z1] of [[ax, az, vx, vz], [vx, vz, bx, bz]]) {
    const intervals = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 2.5));
    for (let sample = 1; sample <= intervals; sample++) {
      const f = sample / intervals;
      if (navigationSampleIsLiquid(field, x0 + (x1 - x0) * f, z0 + (z1 - z0) * f)) return true;
    }
  }
  return false;
}

interface EdgeWay {
  n: number;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

/** How a hull may drive one grid edge: straight (0), round the shortest clear way left in `way` (1: one bend, or a
 * lane shifted sideways at both ends), or not at all (2). Every leg keeps the widest hull's clearance of every listed
 * footprint, and a way's legs stay dry where the field opts into avoid-liquid routing. */
function evaluateHullEdge(
  lists: readonly (readonly NavigationObstacle[])[], decks: readonly NavigationBridgeDeck[] | null,
  ax: number, az: number, ah: number, bx: number, bz: number, bh: number,
  liquidField: NavigationHeightField | null, way: EdgeWay,
): 0 | 1 | 2 {
  const margin = NAV_LEG_CLEARANCE_M;
  const meets = (x0: number, z0: number, h0: number, x1: number, z1: number, h1: number) => {
    for (const list of lists) if (legMeetsSolid(list, decks, x0, z0, h0, x1, z1, h1, margin)) return true;
    return false;
  };
  if (!meets(ax, az, ah, bx, bz, bh)) return 0;
  const ex = bx - ax, ez = bz - az, length = Math.hypot(ex, ez), px = -ez / length, pz = ex / length;
  const inside = (x: number, z: number) => Math.max(Math.abs(x), Math.abs(z)) <= WORLD_MAX;
  let best = Infinity;
  for (const fraction of NAV_BEND_FRACTIONS) {
    for (const offset of NAV_BEND_OFFSETS_M) {
      for (const side of [-1, 1]) {
        const vx = ax + ex * fraction + px * offset * side, vz = az + ez * fraction + pz * offset * side;
        const travel = Math.hypot(vx - ax, vz - az) + Math.hypot(bx - vx, bz - vz);
        if (travel >= best || !inside(vx, vz)) continue;
        const vh = ah + (bh - ah) * fraction;
        if (meets(ax, az, ah, vx, vz, vh) || meets(vx, vz, vh, bx, bz, bh)
          || bendCrossesLiquid(liquidField, ax, az, vx, vz, bx, bz)) continue;
        best = travel;
        way.n = 1; way.x1 = vx; way.z1 = vz; way.x2 = way.z2 = NaN;
      }
    }
  }
  for (const shift of NAV_LANE_SHIFTS_M) {
    for (const side of [-1, 1]) {
      const sx = px * shift * side, sz = pz * shift * side;
      const travel = length + 2 * shift;
      const a2x = ax + sx, a2z = az + sz, b2x = bx + sx, b2z = bz + sz;
      if (travel >= best || !inside(a2x, a2z) || !inside(b2x, b2z)) continue;
      if (meets(ax, az, ah, a2x, a2z, ah) || meets(a2x, a2z, ah, b2x, b2z, bh) || meets(b2x, b2z, bh, bx, bz, bh)
        || bendCrossesLiquid(liquidField, ax, az, a2x, a2z, b2x, b2z)
        || bendCrossesLiquid(liquidField, a2x, a2z, b2x, b2z, bx, bz)) continue;
      best = travel;
      way.n = 2; way.x1 = a2x; way.z1 = a2z; way.x2 = b2x; way.z2 = b2z;
    }
  }
  return best < Infinity ? 1 : 2;
}

function storeWay(ways: Float32Array, index: number, slot: number, way: EdgeWay): void {
  const at = index * WAY_STRIDE + slot * WAY_FLOATS;
  ways[at] = way.x1; ways[at + 1] = way.z1;
  ways[at + 2] = way.n > 1 ? way.x2 : NaN; ways[at + 3] = way.n > 1 ? way.z2 : NaN;
}

const _edgeBend: EdgeWay = { n: 0, x1: 0, z1: 0, x2: 0, z2: 0 };
const _oneList: (readonly NavigationObstacle[])[] = [[]];

/**
 * The hull pass over every edge between open cells: clear when its straight line keeps the widest hull's clearance
 * of solid cover; else open through the shortest clear single bend inside the two cells' squares (kept in `bends`);
 * else blocked for every hull.
 */
function hullEdgePass<T extends NavigationObstacle>(
  decks: readonly NavigationBridgeDeck[] | null, queryObstacles: ObstacleQuery<T> | null,
  obstacles: readonly T[], candidates: T[], blocked: Uint8Array, heights: Float32Array,
  positions: Float32Array | undefined, liquidField: NavigationHeightField | null,
): { blockedEdges: Uint8Array; bends: Float32Array | null } {
  const blockedEdges = new Uint8Array(GRID_N * GRID_N);
  let bends: Float32Array | null = null;
  const margin = NAV_LEG_CLEARANCE_M, bendReach = NAV_BEND_OFFSETS_M[NAV_BEND_OFFSETS_M.length - 1];
  // one obstacle query spans a run of HULL_PASS_RUN cells along a row and their forward edges (and, when one of
  // those edges needs a bend, one wider query its bends): the pass adds a few hundred queries to the grid build
  const HULL_PASS_RUN = 4;
  for (let iz = 0; iz < GRID_N; iz++) {
    for (let runStart = 0; runStart < GRID_N; runStart += HULL_PASS_RUN) {
      let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
      for (let ix = runStart; ix < Math.min(GRID_N, runStart + HULL_PASS_RUN); ix++) {
        const index = cellIndex(ix, iz);
        if (blocked[index]) continue;
        for (const direction of FORWARD_STEPS) {
          const [dx, dz] = NEIGHBOR_STEPS[direction];
          if (isOutsideGrid(ix + dx, iz + dz) || blocked[cellIndex(ix + dx, iz + dz)]) continue;
          for (const cell of [index, cellIndex(ix + dx, iz + dz)]) {
            const x = cellX(positions, cell), z = cellZ(positions, cell);
            minX = Math.min(minX, x); minZ = Math.min(minZ, z); maxX = Math.max(maxX, x); maxZ = Math.max(maxZ, z);
          }
        }
      }
      if (minX > maxX) continue;
      let wide = false;
      _oneList[0] = queryObstacles
        ? queryObstacles(minX - margin, minZ - margin, maxX + margin, maxZ + margin, candidates) : obstacles;
      for (let ix = runStart; ix < Math.min(GRID_N, runStart + HULL_PASS_RUN); ix++) {
        const index = cellIndex(ix, iz);
        if (blocked[index]) continue;
        const ax = cellX(positions, index), az = cellZ(positions, index), ah = heights[index];
        for (let slot = 0; slot < FORWARD_STEPS.length; slot++) {
          const direction = FORWARD_STEPS[slot], [dx, dz] = NEIGHBOR_STEPS[direction];
          if (isOutsideGrid(ix + dx, iz + dz)) continue;
          const next = cellIndex(ix + dx, iz + dz);
          if (blocked[next]) continue;
          const bx = cellX(positions, next), bz = cellZ(positions, next), bh = heights[next];
          if (!legMeetsSolid(_oneList[0], decks, ax, az, ah, bx, bz, bh, margin)) continue;
          if (queryObstacles && !wide) {
            _oneList[0] = queryObstacles(minX - margin - bendReach, minZ - margin - bendReach,
              maxX + margin + bendReach, maxZ + margin + bendReach, candidates);
            wide = true;
          }
          if (evaluateHullEdge(_oneList, decks, ax, az, ah, bx, bz, bh, liquidField, _edgeBend) === 1) {
            bends ??= new Float32Array(GRID_N * GRID_N * WAY_STRIDE).fill(NaN);
            storeWay(bends, index, slot, _edgeBend);
            continue;
          }
          blockedEdges[index] |= 1 << direction;
          blockedEdges[next] |= 1 << OPPOSITE_STEP[direction];
        }
      }
    }
  }
  _oneList[0] = [];
  return { blockedEdges, bends };
}

/** The wreck footprints rebuild the edges round them when they appear or move; see BotNavigationGrid.wreckOverlay. */
const WRECK_SYNC_MOVE_M = 1;
const WRECK_SYNC_TURN_RAD = 0.15;
/** Cells within this many rings of a wreck's cell can have an edge (or a bend of one) it reaches. */
const WRECK_RINGS = 2;

function createWreckOverlay<T extends NavigationObstacle>(
  decks: readonly NavigationBridgeDeck[] | null, queryObstacles: ObstacleQuery<T> | null,
  obstacles: readonly T[], blocked: Uint8Array, heights: Float32Array, positions: Float32Array | undefined,
  hullBlockedEdges: Uint8Array, liquidField: NavigationHeightField | null,
): WreckOverlay {
  const candidates: T[] = [];
  const lists: (readonly NavigationObstacle[])[] = [[], []];
  const margin = NAV_LEG_CLEARANCE_M, reach = margin + NAV_BEND_OFFSETS_M[NAV_BEND_OFFSETS_M.length - 1];
  let stale = false;
  const overlay: WreckOverlay = {
    footprints: [], records: [], count: 0, blockedEdges: null, bends: null,
    invalidate() { stale = true; },
    sync(wrecks, count) {
      let changed = count !== overlay.count || stale;
      stale = false;
      for (let i = 0; !changed && i < count; i++) {
        const a = wrecks[i], b = overlay.footprints[i];
        changed = Math.hypot(a.x - b.x, a.z - b.z) > WRECK_SYNC_MOVE_M
          || Math.abs(Math.atan2(Math.sin(a.yaw - b.yaw), Math.cos(a.yaw - b.yaw))) > WRECK_SYNC_TURN_RAD;
      }
      if (!changed) return false;
      for (let i = 0; i < count; i++) {
        const source = wrecks[i];
        const footprint = overlay.footprints[i] ??= { x: 0, z: 0, yaw: 0, halfLength: 0, halfWidth: 0, minY: 0, maxY: 0 };
        Object.assign(footprint, source);
        const record = overlay.records[i] ??= { min: [0, 0, 0], max: [0, 0, 0], kind: 'wreck' };
        setObbShape(record, source.x, source.z, source.halfWidth, source.halfLength, source.yaw);
        record.min[1] = source.minY; record.max[1] = source.maxY;
      }
      overlay.footprints.length = overlay.records.length = overlay.count = count;
      if (!count && !overlay.blockedEdges) return true;
      overlay.blockedEdges ??= new Uint8Array(GRID_N * GRID_N);
      overlay.bends ??= new Float32Array(GRID_N * GRID_N * WAY_STRIDE);
      overlay.blockedEdges.fill(0);
      overlay.bends.fill(NaN);
      lists[1] = overlay.records;
      for (let i = 0; i < count; i++) {
        const wreck = overlay.footprints[i];
        const cx = worldCell(wreck.x), cz = worldCell(wreck.z);
        for (let iz = cz - WRECK_RINGS; iz <= cz + WRECK_RINGS; iz++) {
          for (let ix = cx - WRECK_RINGS; ix <= cx + WRECK_RINGS; ix++) {
            if (isOutsideGrid(ix, iz)) continue;
            const index = cellIndex(ix, iz);
            if (blocked[index]) continue;
            const ax = cellX(positions, index), az = cellZ(positions, index), ah = heights[index];
            for (let slot = 0; slot < FORWARD_STEPS.length; slot++) {
              const direction = FORWARD_STEPS[slot], [dx, dz] = NEIGHBOR_STEPS[direction];
              if (isOutsideGrid(ix + dx, iz + dz)) continue;
              const next = cellIndex(ix + dx, iz + dz);
              if (blocked[next] || hullBlockedEdges[index] & (1 << direction)) continue;
              if (overlay.blockedEdges[index] & (1 << direction)
                || Number.isFinite(overlay.bends[index * WAY_STRIDE + slot * WAY_FLOATS])) continue;
              const bx = cellX(positions, next), bz = cellZ(positions, next), bh = heights[next];
              // only an edge some wreck reaches is re-tested
              let touched = false;
              for (let k = 0; k < count && !touched; k++) {
                const r = overlay.records[k];
                touched = Math.max(ax, bx) + reach >= r.min[0] && Math.min(ax, bx) - reach <= r.max[0]
                  && Math.max(az, bz) + reach >= r.min[2] && Math.min(az, bz) - reach <= r.max[2];
              }
              if (!touched) continue;
              lists[0] = queryObstacles
                ? queryObstacles(Math.min(ax, bx) - reach, Math.min(az, bz) - reach,
                  Math.max(ax, bx) + reach, Math.max(az, bz) + reach, candidates) : obstacles;
              const verdict = evaluateHullEdge(lists, decks, ax, az, ah, bx, bz, bh, liquidField, _edgeBend);
              if (verdict === 0) continue;
              if (verdict === 1) {
                storeWay(overlay.bends, index, slot, _edgeBend);
                continue;
              }
              overlay.blockedEdges[index] |= 1 << direction;
              overlay.blockedEdges[next] |= 1 << OPPOSITE_STEP[direction];
            }
          }
        }
      }
      lists[0] = [];
      return true;
    },
  };
  return overlay;
}

/** The way points on the edge between two neighbouring cells, in the order of travel (into `out`); returns how many
 * (0 for a straight edge). A wreck's way replaces the edge's own way round cover. */
function edgeWay(navigation: BotNavigationGrid, from: number, to: number, out: number[]): number {
  const wreckWays = navigation.wreckOverlay?.count ? navigation.wreckOverlay.bends : null;
  const ways = navigation.hullBends;
  if (!ways && !wreckWays) return 0;
  const dx = (to % GRID_N) - (from % GRID_N), dz = Math.floor(to / GRID_N) - Math.floor(from / GRID_N);
  let slot = -1, owner = from, reversed = false;
  for (let direction = 0; direction < NEIGHBOR_STEPS.length; direction++) {
    if (NEIGHBOR_STEPS[direction][0] !== dx || NEIGHBOR_STEPS[direction][1] !== dz) continue;
    slot = forwardSlot(direction);
    if (slot < 0) { slot = forwardSlot(OPPOSITE_STEP[direction]); owner = to; reversed = true; }
    break;
  }
  if (slot < 0) return 0;
  for (const source of [wreckWays, ways]) {
    if (!source) continue;
    const at = owner * WAY_STRIDE + slot * WAY_FLOATS;
    if (!Number.isFinite(source[at] + source[at + 1])) continue;
    const two = Number.isFinite(source[at + 2] + source[at + 3]);
    if (!two) { out[0] = source[at]; out[1] = source[at + 1]; return 1; }
    const first = reversed ? 2 : 0, second = reversed ? 0 : 2;
    out[0] = source[at + first]; out[1] = source[at + first + 1];
    out[2] = source[at + second]; out[3] = source[at + second + 1];
    return 2;
  }
  return 0;
}

/** Label the cells joined by edges every hull may drive (cover, liquid, parapets and hull clearance; slope aside). */
function hullComponentLabels(blocked: Uint8Array, waterEdges: Uint8Array | undefined, bridgeEdges: Uint8Array | undefined,
  hullEdges: Uint8Array): Int32Array {
  const labels = new Int32Array(GRID_N * GRID_N).fill(-1), queue = new Int32Array(GRID_N * GRID_N);
  let label = 0;
  for (let seed = 0; seed < labels.length; seed++) {
    if (blocked[seed] || labels[seed] >= 0) continue;
    let read = 0, write = 0;
    labels[seed] = label;
    queue[write++] = seed;
    while (read < write) {
      const index = queue[read++], ix = index % GRID_N, iz = Math.floor(index / GRID_N);
      for (let direction = 0; direction < NEIGHBOR_STEPS.length; direction++) {
        const [dx, dz] = NEIGHBOR_STEPS[direction], nx = ix + dx, nz = iz + dz;
        if (isOutsideGrid(nx, nz)) continue;
        const next = cellIndex(nx, nz), bit = 1 << direction;
        if (blocked[next] || labels[next] >= 0) continue;
        if (dx !== 0 && dz !== 0 && (blocked[cellIndex(nx, iz)] || blocked[cellIndex(ix, nz)])) continue;
        if ((waterEdges && waterEdges[index] & bit) || (bridgeEdges && bridgeEdges[index] & bit) || hullEdges[index] & bit) continue;
        labels[next] = label;
        queue[write++] = next;
      }
    }
    label++;
  }
  return labels;
}

interface WreckSource {
  modeActive?: boolean;
  combat: { destroyed: boolean };
  spec: Parameters<typeof tankContactRect>[0];
  state: { pos: { x: number; y: number; z: number }; yaw: number };
}

/** The battle's wrecks as grid footprints, in roster order, into `out` (entries reused); returns how many. */
export function collectNavigationWrecks(entities: readonly WreckSource[], out: NavigationWreck[]): number {
  let count = 0;
  for (const entity of entities) {
    if (!entity.combat.destroyed || entity.modeActive === false) continue;
    const wreck = out[count] ??= { x: 0, z: 0, yaw: 0, halfLength: 0, halfWidth: 0, minY: 0, maxY: 0 };
    const rect = tankContactRect(entity.spec), state = entity.state;
    const fx = Math.sin(state.yaw), fz = Math.cos(state.yaw);
    wreck.x = state.pos.x + fz * rect.centerX + fx * rect.centerZ;
    wreck.z = state.pos.z - fx * rect.centerX + fz * rect.centerZ;
    wreck.yaw = state.yaw;
    wreck.halfLength = rect.halfLength;
    wreck.halfWidth = rect.halfWidth;
    wreck.minY = state.pos.y - 0.5;
    wreck.maxY = state.pos.y + tankBodyTopM(entity.spec);
    count++;
  }
  return count;
}

/**
 * Bring the grid's wreck overlay up to date with the battle's wrecks (index-aligned, `count` of them): a street two
 * wrecks plug is closed to routes, a passage one narrows bends round it. Re-tests only the edges near wrecks, and
 * only when a wreck appeared, cleared or moved a metre; the authority and the solo step call it with the same wrecks.
 */
export function syncNavigationWrecks(navigation: BotNavigationGrid | null | undefined,
  wrecks: readonly NavigationWreck[], count: number): boolean {
  return !!navigation?.wreckOverlay && navigation.wreckOverlay.sync(wrecks, count);
}

/** The ground a route rides at (x, z): a bridge deck's own height over the span, else the terrain. */
/** The bridge deck over (x, z), or null. */
function deckOver(decks: readonly NavigationBridgeDeck[] | null, x: number, z: number): NavigationBridgeDeck | null {
  if (decks) {
    for (let i = 0; i < decks.length; i++) {
      const deck = decks[i], dx = x - deck.x, dz = z - deck.z;
      if (Math.abs(dx * deck.ux + dz * deck.uz) <= deck.halfLength
        && Math.abs(dx * deck.uz - dz * deck.ux) <= deck.halfWidth) return deck;
    }
  }
  return null;
}

/** The steepest uphill stretch of every edge between open cells, both ways, or the steepest side slope across its line
 * (see BotNavigationGrid.edgeSteepness). */
function edgeSteepnessPass(field: NavigationHeightField, decks: readonly NavigationBridgeDeck[] | null,
  blocked: Uint8Array, heights: Float32Array, positions: Float32Array | undefined): Uint8Array {
  const steep = new Uint8Array(GRID_N * GRID_N * 8);
  const samples = new Float64Array(EDGE_STEEP_SAMPLES + 2);
  for (let index = 0; index < blocked.length; index++) {
    if (blocked[index]) continue;
    for (const direction of FORWARD_STEPS) {
      edgeSteepness(field, decks, blocked, heights, positions, steep, samples, index, direction);
    }
  }
  return steep;
}

/** One forward edge's steepest stretch, both ways (the build's pass, and a refresh round a changed footprint). */
function edgeSteepness(field: NavigationHeightField, decks: readonly NavigationBridgeDeck[] | null,
  blocked: Uint8Array, heights: Float32Array, positions: Float32Array | undefined, steep: Uint8Array,
  samples: Float64Array, index: number, direction: number): void {
  const ix = index % GRID_N, iz = Math.floor(index / GRID_N);
  const [dx, dz] = NEIGHBOR_STEPS[direction];
  if (isOutsideGrid(ix + dx, iz + dz)) return;
  const next = cellIndex(ix + dx, iz + dz);
  if (blocked[index] || blocked[next]) return;
  const ax = cellX(positions, index), az = cellZ(positions, index);
  const bx = cellX(positions, next), bz = cellZ(positions, next);
  const intervals = EDGE_STEEP_SAMPLES + 1, span = Math.hypot(bx - ax, bz - az) / intervals;
  samples[0] = heights[index];
  samples[intervals] = heights[next];
  // the side slope across the edge's line at each interior sample: the terrain's own (a deck's sides are the deck's
  // rules; under a deck the gorge floor is read, not the deck above it)
  const sideScale = EDGE_SIDE_HALF_M / (span * intervals);
  const sideX = (bz - az) * sideScale, sideZ = -(bx - ax) * sideScale;
  let across = 0;
  for (let k = 1; k < intervals; k++) {
    const x = ax + (bx - ax) * k / intervals, z = az + (bz - az) * k / intervals;
    const deck = deckOver(decks, x, z);
    samples[k] = deck ? deck.deckY : field.getHeightAt(x, z);
    if (deck) continue;
    const side = Math.abs(field.getHeightAt(x + sideX, z + sideZ) - field.getHeightAt(x - sideX, z - sideZ))
      / (2 * EDGE_SIDE_HALF_M);
    if (side > across) across = side;
  }
  let up = across, down = across;
  for (let k = 0; k < intervals; k++) {
    const grade = (samples[k + 1] - samples[k]) / span;
    if (grade > up) up = grade;
    if (-grade > down) down = -grade;
  }
  steep[index * 8 + direction] = Math.min(255, Math.round(up * 100));
  steep[next * 8 + OPPOSITE_STEP[direction]] = Math.min(255, Math.round(down * 100));
}

/** Build the immutable terrain/cover grid once for every bot in a match. */
export function createBotNavigationGrid<T extends NavigationObstacle>({
  heightField,
  queryObstacles = null,
  getObstacles = () => [],
}: BotNavigationGridOptions<T> = {}): Readonly<BotNavigationGrid> {
  if (!heightField || typeof heightField.getHeightAt !== 'function') {
    throw new TypeError('heightField is required');
  }
  const heights = new Float32Array(GRID_N * GRID_N);
  const blocked = new Uint8Array(GRID_N * GRID_N);
  const groundTypes = new Uint8Array(GRID_N * GRID_N);
  // round 61: only a field with bridge decks routes any cell off its centre
  const cellPositions = heightField.bridgeDecks?.length ? new Float32Array(GRID_N * GRID_N * 2) : undefined;
  const candidates: T[] = [];
  const obstacles = getObstacles() || [];
  for (let iz = 0; iz < GRID_N; iz++) {
    sampleNavigationRow(iz, heightField, queryObstacles, obstacles, candidates,
      heights, groundTypes, blocked, cellPositions);
  }
  const bridgeBlockedEdges = cellPositions ? bridgeSideEdges(heightField.bridgeDecks!, cellPositions) : undefined;
  const decks = heightField.bridgeDecks?.length ? heightField.bridgeDecks : null;
  const edgeSteepness = edgeSteepnessPass(heightField, decks, blocked, heights, cellPositions);
  const liquidField = heightField.navigationWaterPolicy === 'avoid-liquid'
    && typeof heightField.getWaterMaskAt === 'function' ? heightField : null;
  const { blockedEdges: hullBlockedEdges, bends: builtBends } = hullEdgePass(decks, queryObstacles, obstacles,
    candidates, blocked, heights, cellPositions, liquidField);
  // allocated whether or not the build needed a bend: a later refresh (refreshArea) may store one
  const hullBends = builtBends ?? new Float32Array(GRID_N * GRID_N * WAY_STRIDE).fill(NaN);
  const legCandidates: T[] = [];
  const wreckOverlay = createWreckOverlay(decks, queryObstacles, obstacles, blocked, heights, cellPositions,
    hullBlockedEdges, liquidField);
  const hullClearance: NavigationClearance = Object.freeze({
    legClear(ax: number, az: number, ah: number, bx: number, bz: number, bh: number, touchStart: boolean,
      touchEnd: boolean): boolean {
      const margin = NAV_LEG_CLEARANCE_M;
      const nearby = queryObstacles
        ? queryObstacles(Math.min(ax, bx) - margin, Math.min(az, bz) - margin,
          Math.max(ax, bx) + margin, Math.max(az, bz) + margin, legCandidates)
        : obstacles;
      return !legMeetsSolid(nearby, decks, ax, az, ah, bx, bz, bh, margin, touchStart, touchEnd)
        && !(wreckOverlay.count
          && legMeetsSolid(wreckOverlay.records, decks, ax, az, ah, bx, bz, bh, margin, touchStart, touchEnd));
    },
  });
  if (heightField.navigationWaterPolicy === 'avoid-liquid') {
    const grid = addDryNavigationPolicy(heightField, heights, blocked, groundTypes, (x,z) => {
      const nearby = queryObstacles ? queryObstacles(x-4.5,z-4.5,x+4.5,z+4.5,candidates) : obstacles;
      return !isSolidObstacleAt(nearby,x,z);
    }, cellPositions);
    const hullComponents = hullComponentLabels(grid.blocked, grid.waterBlockedEdges, bridgeBlockedEdges,
      hullBlockedEdges);
    const refreshArea = createNavigationRefresh({ heightField, queryObstacles, obstacles, decks, liquidField,
      heights, blocked, groundTypes, cellPositions, waterBlockedEdges: grid.waterBlockedEdges, bridgeBlockedEdges,
      hullBlockedEdges, hullBends, hullComponents, edgeSteepness, wreckOverlay });
    return Object.freeze({ ...grid, ...(bridgeBlockedEdges ? { bridgeBlockedEdges } : {}), hullBlockedEdges,
      hullBends, hullComponents, hullClearance, wreckOverlay, edgeSteepness, refreshArea });
  }
  if (heightField.navigationWaterPolicy !== undefined) {
    throw new TypeError('unknown navigation water policy');
  }
  const hullComponents = hullComponentLabels(blocked, undefined, bridgeBlockedEdges, hullBlockedEdges);
  const refreshArea = createNavigationRefresh({ heightField, queryObstacles, obstacles, decks, liquidField,
    heights, blocked, groundTypes, cellPositions, waterBlockedEdges: undefined, bridgeBlockedEdges,
    hullBlockedEdges, hullBends, hullComponents, edgeSteepness, wreckOverlay });
  return Object.freeze({ heights, blocked, groundTypes, ...(cellPositions ? { cellPositions, bridgeBlockedEdges } : {}),
    hullBlockedEdges, hullBends, hullComponents, hullClearance, wreckOverlay, edgeSteepness, refreshArea });
}

interface NavigationRefreshInputs<T extends NavigationObstacle> {
  heightField: NavigationHeightField;
  queryObstacles: ObstacleQuery<T> | null;
  obstacles: readonly T[];
  decks: readonly NavigationBridgeDeck[] | null;
  liquidField: NavigationHeightField | null;
  heights: Float32Array;
  blocked: Uint8Array;
  groundTypes: Uint8Array;
  cellPositions: Float32Array | undefined;
  waterBlockedEdges: Uint8Array | undefined;
  bridgeBlockedEdges: Uint8Array | undefined;
  hullBlockedEdges: Uint8Array;
  hullBends: Float32Array;
  hullComponents: Int32Array;
  edgeSteepness: Uint8Array;
  wreckOverlay: WreckOverlay;
}

/**
 * The grid's refresh round a changed footprint (destruction, docs/DESTRUCTION.md §6), from the build's own per-cell,
 * per-edge and hull-edge rules: what the build would have read had the footprint been so from the start.
 */
function createNavigationRefresh<T extends NavigationObstacle>(inputs: NavigationRefreshInputs<T>) {
  const candidates: T[] = [];
  const samples = new Float64Array(EDGE_STEEP_SAMPLES + 2);
  const lists: (readonly NavigationObstacle[])[] = [[]];
  const { heightField, queryObstacles, obstacles, decks, liquidField, heights, blocked, groundTypes, cellPositions,
    waterBlockedEdges, bridgeBlockedEdges, hullBlockedEdges, hullBends, hullComponents } = inputs;
  const margin = NAV_LEG_CLEARANCE_M, bendReach = NAV_BEND_OFFSETS_M[NAV_BEND_OFFSETS_M.length - 1];
  const cellFrom = (value: number) => clamp(Math.ceil((value - WORLD_MIN) / CELL_M), 0, GRID_N - 1);
  const cellTo = (value: number) => clamp(Math.floor((value - WORLD_MIN) / CELL_M), 0, GRID_N - 1);
  return (minX: number, minZ: number, maxX: number, maxZ: number): number => {
    // cells whose sample point a footprint within 3.5 m (isSolidObstacleAt) or a raised ground could have moved
    const x0 = cellFrom(minX - 3.5), x1 = cellTo(maxX + 3.5), z0 = cellFrom(minZ - 3.5), z1 = cellTo(maxZ + 3.5);
    let cells = 0;
    for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
      sampleNavigationCell(ix, iz, heightField, queryObstacles, obstacles, candidates, heights, groundTypes, blocked,
        cellPositions);
      if (waterBlockedEdges && navigationSampleIsLiquid(heightField, cellX(cellPositions, cellIndex(ix, iz)),
        cellZ(cellPositions, cellIndex(ix, iz)))) blocked[cellIndex(ix, iz)] = 1;
      cells++;
    }
    // the grade and the liquid of every edge out of those cells and their neighbours
    for (let iz = Math.max(0, z0 - 1); iz <= Math.min(GRID_N - 1, z1 + 1); iz++) {
      for (let ix = Math.max(0, x0 - 1); ix <= Math.min(GRID_N - 1, x1 + 1); ix++) {
        const index = cellIndex(ix, iz);
        for (const direction of FORWARD_STEPS) {
          edgeSteepness(heightField, decks, blocked, heights, cellPositions, inputs.edgeSteepness, samples, index, direction);
          if (!waterBlockedEdges) continue;
          const [dx, dz] = NEIGHBOR_STEPS[direction];
          if (isOutsideGrid(ix + dx, iz + dz)) continue;
          const next = cellIndex(ix + dx, iz + dz);
          waterBlockedEdges[index] &= ~(1 << direction);
          waterBlockedEdges[next] &= ~(1 << OPPOSITE_STEP[direction]);
          if (blocked[index] || blocked[next]) continue;
          if (!navigationEdgeCrossesLiquid(heightField, ix, iz, NEIGHBOR_STEPS[direction], cellPositions)) continue;
          waterBlockedEdges[index] |= 1 << direction;
          waterBlockedEdges[next] |= 1 << OPPOSITE_STEP[direction];
        }
      }
    }
    // the hull edges within reach of the footprint: their clearance and their bends, as the build's hull pass reads them
    const reach = margin + bendReach + CELL_M;
    const hx0 = cellFrom(minX - reach), hx1 = cellTo(maxX + reach), hz0 = cellFrom(minZ - reach), hz1 = cellTo(maxZ + reach);
    for (let iz = Math.max(0, hz0 - 1); iz <= hz1; iz++) for (let ix = Math.max(0, hx0 - 1); ix <= hx1; ix++) {
      const index = cellIndex(ix, iz);
      const ax = cellX(cellPositions, index), az = cellZ(cellPositions, index), ah = heights[index];
      for (let slot = 0; slot < FORWARD_STEPS.length; slot++) {
        const direction = FORWARD_STEPS[slot], [dx, dz] = NEIGHBOR_STEPS[direction];
        if (isOutsideGrid(ix + dx, iz + dz)) continue;
        const next = cellIndex(ix + dx, iz + dz);
        hullBlockedEdges[index] &= ~(1 << direction);
        hullBlockedEdges[next] &= ~(1 << OPPOSITE_STEP[direction]);
        hullBends.fill(NaN, index * WAY_STRIDE + slot * WAY_FLOATS, index * WAY_STRIDE + (slot + 1) * WAY_FLOATS);
        if (blocked[index] || blocked[next]) continue;
        const bx = cellX(cellPositions, next), bz = cellZ(cellPositions, next), bh = heights[next];
        lists[0] = queryObstacles
          ? queryObstacles(Math.min(ax, bx) - margin - bendReach, Math.min(az, bz) - margin - bendReach,
            Math.max(ax, bx) + margin + bendReach, Math.max(az, bz) + margin + bendReach, candidates) : obstacles;
        if (!legMeetsSolid(lists[0], decks, ax, az, ah, bx, bz, bh, margin)) continue;
        if (evaluateHullEdge(lists, decks, ax, az, ah, bx, bz, bh, liquidField, _edgeBend) === 1) {
          storeWay(hullBends, index, slot, _edgeBend);
          continue;
        }
        hullBlockedEdges[index] |= 1 << direction;
        hullBlockedEdges[next] |= 1 << OPPOSITE_STEP[direction];
      }
    }
    lists[0] = [];
    hullComponents.set(hullComponentLabels(blocked, waterBlockedEdges, bridgeBlockedEdges, hullBlockedEdges));
    inputs.wreckOverlay.invalidate();
    return cells;
  };
}

function isValidNavigationGrid(navigation: BotNavigationGrid): boolean {
  const count = GRID_N * GRID_N;
  return navigation.heights instanceof Float32Array
    && navigation.blocked instanceof Uint8Array
    && navigation.groundTypes instanceof Uint8Array
    && navigation.heights.length === count
    && navigation.blocked.length === count
    && navigation.groundTypes.length === count
    && (navigation.cellPositions === undefined
      || (navigation.cellPositions instanceof Float32Array && navigation.cellPositions.length === count * 2))
    && (navigation.hullBlockedEdges === undefined
      || (navigation.hullBlockedEdges instanceof Uint8Array && navigation.hullBlockedEdges.length === count))
    && (navigation.hullBends === undefined
      || (navigation.hullBends instanceof Float32Array && navigation.hullBends.length === count * WAY_STRIDE))
    && (navigation.hullComponents === undefined
      || (navigation.hullComponents instanceof Int32Array && navigation.hullComponents.length === count))
    && (navigation.edgeSteepness === undefined
      || (navigation.edgeSteepness instanceof Uint8Array && navigation.edgeSteepness.length === count * 8))
    && (navigation.navigationWaterPolicy === undefined
      ? navigation.waterBlockedEdges === undefined
      : navigation.navigationWaterPolicy === 'avoid-liquid'
        && navigation.waterBlockedEdges instanceof Uint8Array
        && navigation.waterBlockedEdges.length === count);
}

/** Objective-only dry view: share immutable terrain values; never change the
 * bot owner's blocked bytes or authored navigation policy. It keeps the grid's
 * hull clearance and edge steepness (bots lane, 2026-10-02), so an objective is
 * placed only where the route search itself can drive a hull. */
export function createDryNavigationView(navigation: BotNavigationGrid, field: NavigationHeightField,
  connectorClear: (x: number, z: number) => boolean): Readonly<BotNavigationGrid> {
  if (!isValidNavigationGrid(navigation)) throw new TypeError('valid navigation grid required');
  if (navigation.navigationWaterPolicy === 'avoid-liquid') return navigation;
  const dry = addDryNavigationPolicy(field, navigation.heights, navigation.blocked.slice(),
    navigation.groundTypes, connectorClear, navigation.cellPositions);
  if (!navigation.hullBlockedEdges && !navigation.edgeSteepness) return dry;
  return Object.freeze({ ...dry,
    ...(navigation.hullBlockedEdges ? { hullBlockedEdges: navigation.hullBlockedEdges } : {}),
    ...(navigation.edgeSteepness ? { edgeSteepness: navigation.edgeSteepness } : {}) });
}

function connectedNavigationCells(navigation: BotNavigationGrid, point: Position2,
  clear: (from: Position2, to: Position2) => boolean, visit: (index: number) => boolean): boolean {
  const cx = worldCell(point.x), cz = worldCell(point.z);
  const target = { x: 0, z: 0 };
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const ix = cx + dx, iz = cz + dz;
    if (isOutsideGrid(ix, iz)) continue;
    const index = cellIndex(ix, iz);
    if (navigation.blocked[index]) continue;
    target.x = cellX(navigation.cellPositions, index); target.z = cellZ(navigation.cellPositions, index);
    if (clear(point, target) && visit(index)) return true;
  }
  return false;
}

function reachableNeighbor(node: HeapNode, direction: number, navigation: BotNavigationGrid,
  spec: TerrainMobilitySpec): number {
  const [dx, dz, scale] = NEIGHBOR_STEPS[direction], x = node.ix + dx, z = node.iz + dz;
  if (isOutsideGrid(x, z)) return -1;
  const index = cellIndex(x, z);
  if (navigation.blocked[index] || diagonalCornerIsBlocked(node, dx, dz, navigation.blocked)) return -1;
  if (navigation.waterBlockedEdges && navigation.waterBlockedEdges[node.index] & (1 << direction)) return -1;
  if (navigation.bridgeBlockedEdges && navigation.bridgeBlockedEdges[node.index] & (1 << direction)) return -1;
  // the route search's hull clearance (an edge no hull fits through closes it for objective access too)
  if (navigation.hullBlockedEdges && navigation.hullBlockedEdges[node.index] & (1 << direction)) return -1;
  const grade = (navigation.heights[index] - navigation.heights[node.index]) / (CELL_M * scale);
  const ground = routeGroundType(spec, navigation.groundTypes, node.index, index);
  // Objective access must permit carrying the flag/ball back out as well as
  // descending into a clearing. Route searches use the same two-way slope
  // constraint so the outward route cannot become a one-way cliff shortcut.
  if (terrainSlopeMargin(spec, ground, grade) <= TERRAIN_MARGIN_EPS
    || terrainSlopeMargin(spec, ground, -grade) <= TERRAIN_MARGIN_EPS) return -1;
  // and the edge's steepest stretch, both ways, as the route search holds it (a cliff the cell heights do not show)
  const steep = navigation.edgeSteepness;
  if (steep) {
    const up = steep[node.index * 8 + direction] * 0.01, down = steep[index * 8 + OPPOSITE_STEP[direction]] * 0.01;
    if ((up > 0 && (terrainSlopeMargin(spec, ground, up) <= TERRAIN_MARGIN_EPS
        || terrainSlopeMargin(spec, ground, -up) <= TERRAIN_MARGIN_EPS))
      || (down > 0 && (terrainSlopeMargin(spec, ground, down) <= TERRAIN_MARGIN_EPS
        || terrainSlopeMargin(spec, ground, -down) <= TERRAIN_MARGIN_EPS))) return -1;
  }
  return index;
}

/** Flood once from physically connected authored pads. No nearest-open-cell
 * teleport and no repeated A* search for each objective placement candidate. */
export function createNavigationReachability(navigation: BotNavigationGrid, spec: TerrainMobilitySpec,
  starts: readonly Position2[], connectorClear: (from: Position2, to: Position2) => boolean) {
  if (!isValidNavigationGrid(navigation)) throw new TypeError('valid navigation grid required');
  const mask = new Uint8Array(GRID_N * GRID_N), queue = new Int32Array(mask.length);
  let read = 0, write = 0;
  const add = (index: number): boolean => {
    if (!mask[index]) { mask[index] = 1; queue[write++] = index; }
    return false;
  };
  for (const start of starts) connectedNavigationCells(navigation, start, connectorClear, add);
  const node = { index: 0, ix: 0, iz: 0, score: 0 };
  while (read < write) {
    node.index = queue[read++]; node.ix = node.index % GRID_N; node.iz = Math.floor(node.index / GRID_N);
    for (let direction = 0; direction < NEIGHBOR_STEPS.length; direction++) {
      const index = reachableNeighbor(node, direction, navigation, spec);
      if (index >= 0) add(index);
    }
  }
  return mask;
}

export function navigationReachabilityContains(navigation: BotNavigationGrid, mask: Uint8Array,
  point: Position2, connectorClear: (from: Position2, to: Position2) => boolean): boolean {
  // Objectives must also support departure from the cell used by dry routing.
  // A reachable neighbour alone can accept a flag that has no return route.
  if (!Number.isFinite(point.x + point.z) || Math.max(Math.abs(point.x), Math.abs(point.z)) > WORLD_MAX) return false;
  const ix = worldCell(point.x), iz = worldCell(point.z), index = cellIndex(ix, iz);
  return !navigation.blocked[index] && mask[index] === 1
    && connectorClear(point, { x: cellX(navigation.cellPositions, index), z: cellZ(navigation.cellPositions, index) });
}

function nearestOpen(blocked: Uint8Array, ix: number, iz: number): [number, number] {
  for (let radius = 0; radius < 8; radius++) {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        const nx = ix + dx;
        const nz = iz + dz;
        if (nx < 0 || nz < 0 || nx >= GRID_N || nz >= GRID_N) continue;
        if (!blocked[cellIndex(nx, nz)]) return [nx, nz];
      }
    }
  }
  return [ix, iz];
}

function isOutsideGrid(ix: number, iz: number): boolean {
  return ix < 0 || iz < 0 || ix >= GRID_N || iz >= GRID_N;
}

function diagonalCornerIsBlocked(
  node: HeapNode,
  dx: number,
  dz: number,
  blocked: Uint8Array,
): boolean {
  return dx !== 0 && dz !== 0
    && (!!blocked[cellIndex(node.ix + dx, node.iz)]
      || !!blocked[cellIndex(node.ix, node.iz + dz)]);
}

function routeGroundType(
  spec: TerrainMobilitySpec,
  groundTypes: Uint8Array,
  fromIndex: number,
  toIndex: number,
): GroundType {
  const from = decodeGroundType(groundTypes[fromIndex]);
  const to = decodeGroundType(groundTypes[toIndex]);
  return groundResistanceFor(spec, to) >= groundResistanceFor(spec, from) ? to : from;
}

function relaxNeighbor(
  node: HeapNode,
  step: readonly [number, number, number],
  search: RouteSearchState,
  edgeBit = 0,
  direction = -1,
): void {
  const [dx, dz, distanceScale] = step;
  const nx = node.ix + dx;
  const nz = node.iz + dz;
  if (isOutsideGrid(nx, nz)) return;
  const { navigation, closed, costs, parents, heap, spec } = search;
  const nextIndex = cellIndex(nx, nz);
  if (closed[nextIndex] || navigation.blocked[nextIndex]) return;
  if (diagonalCornerIsBlocked(node, dx, dz, navigation.blocked)) return;
  if (navigation.waterBlockedEdges && (navigation.waterBlockedEdges[node.index] & edgeBit)) return;
  if (navigation.bridgeBlockedEdges && (navigation.bridgeBlockedEdges[node.index] & edgeBit)) return;
  if (navigation.hullBlockedEdges && (navigation.hullBlockedEdges[node.index] & edgeBit)) return;
  const wreckEdges = navigation.wreckOverlay?.count ? navigation.wreckOverlay.blockedEdges : null;
  if (wreckEdges && (wreckEdges[node.index] & edgeBit)) return;
  const distance = CELL_M * distanceScale;
  const signedGrade = (navigation.heights[nextIndex] - navigation.heights[node.index]) / distance;
  const ground = routeGroundType(spec, navigation.groundTypes, node.index, nextIndex);
  if (terrainSlopeMargin(spec, ground, signedGrade) <= TERRAIN_MARGIN_EPS
      || terrainSlopeMargin(spec, ground, -signedGrade) <= TERRAIN_MARGIN_EPS) return;
  // the edge's steepest stretch is held to the same two-way rule (a cliff the cell heights do not show)
  const steep = navigation.edgeSteepness;
  if (steep && direction >= 0) {
    const up = steep[node.index * 8 + direction] * 0.01, down = steep[nextIndex * 8 + OPPOSITE_STEP[direction]] * 0.01;
    if ((up > 0 && (terrainSlopeMargin(spec, ground, up) <= TERRAIN_MARGIN_EPS
        || terrainSlopeMargin(spec, ground, -up) <= TERRAIN_MARGIN_EPS))
      || (down > 0 && (terrainSlopeMargin(spec, ground, down) <= TERRAIN_MARGIN_EPS
        || terrainSlopeMargin(spec, ground, -down) <= TERRAIN_MARGIN_EPS))) return;
  }
  const terrainCost = terrainTravelCostFactor(spec, ground, signedGrade);
  const variability = 1 + hashNoise(search.seed, nx, nz) * 0.22;
  const nextCost = costs[node.index] + distance * terrainCost * variability;
  if (nextCost >= costs[nextIndex]) return;
  costs[nextIndex] = nextCost;
  parents[nextIndex] = node.index;
  const heuristic = search.projectReachableGoal
    ? 0 : Math.hypot(search.goalX - nx, search.goalZ - nz) * CELL_M;
  heap.push({ index: nextIndex, ix: nx, iz: nz, score: nextCost + heuristic });
}

const _way = [0, 0, 0, 0];
function reconstructRoute(
  parents: Int32Array,
  costs: Float64Array,
  startIndex: number,
  goalIndex: number,
  navigation: BotNavigationGrid,
  reached = true,
): RouteSolution {
  if (parents[goalIndex] < 0 && goalIndex !== startIndex) {
    return { points: [], cells: [], cost: Infinity, reached: false };
  }
  const path: number[] = [];
  let current = goalIndex;
  while (current >= 0) {
    path.push(current);
    if (current === startIndex) break;
    current = parents[current];
  }
  path.reverse();
  const positions = navigation.cellPositions;
  const points: BotRoutePoint[] = [];
  const cells: number[] = [];
  for (let i = 0; i < path.length; i++) {
    points.push([cellX(positions, path[i]), cellZ(positions, path[i])]);
    cells.push(path[i]);
    // an edge that bends round cover carries its way points (cell -1)
    const count = i + 1 < path.length ? edgeWay(navigation, path[i], path[i + 1], _way) : 0;
    for (let k = 0; k < count; k++) {
      points.push([_way[k * 2], _way[k * 2 + 1]]);
      cells.push(-1);
    }
  }
  return { points, cells, cost: costs[goalIndex], reached };
}

const _startCells = new Int32Array(25);
const _startDistances = new Float64Array(25);
/** The detour point a start or end leg goes through when no straight leg is clear (NaN when there is none). */
const _legVia = { x: NaN, z: NaN };
const NO_VIA: Readonly<Position2> = Object.freeze({ x: NaN, z: NaN });

/** The open cells within two rings of a point, nearest first (into the scratch arrays); returns the count. */
function nearbyOpenCells(navigation: BotNavigationGrid, point: Position2): number {
  const cx = worldCell(point.x), cz = worldCell(point.z);
  let count = 0;
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    const ix = cx + dx, iz = cz + dz;
    if (isOutsideGrid(ix, iz)) continue;
    const index = cellIndex(ix, iz);
    if (navigation.blocked[index]) continue;
    if (point.y !== undefined && Math.abs(navigation.heights[index] - point.y) > NAV_LEVEL_M) continue;
    const distance = Math.hypot(cellX(navigation.cellPositions, index) - point.x,
      cellZ(navigation.cellPositions, index) - point.z);
    let slot = count++;
    while (slot > 0 && _startDistances[slot - 1] > distance) {
      _startCells[slot] = _startCells[slot - 1];
      _startDistances[slot] = _startDistances[slot - 1];
      slot--;
    }
    _startCells[slot] = index;
    _startDistances[slot] = distance;
  }
  return count;
}

/** A detour point on rings round the blocked end (`aroundA`: a, else b) with a clear straight leg from a to it and
 * from it to b (into _legVia). An end that may already sit inside a footprint's margin is flagged `touchA`/`touchB`. */
function findLegVia(clearance: NavigationClearance, ax: number, az: number, ah: number, bx: number, bz: number,
  bh: number, aroundA: boolean, touchA: boolean, touchB: boolean): boolean {
  const cx = aroundA ? ax : bx, cz = aroundA ? az : bz, ch = aroundA ? ah : bh;
  for (const radius of NAV_VIA_RINGS_M) {
    for (let k = 0; k < NAV_VIA_BEARINGS; k++) {
      const angle = (k / NAV_VIA_BEARINGS) * Math.PI * 2;
      const x = cx + Math.sin(angle) * radius, z = cz + Math.cos(angle) * radius;
      if (!clearance.legClear(ax, az, ah, x, z, ch, touchA, false)) continue;
      if (!clearance.legClear(x, z, ch, bx, bz, bh, false, touchB)) continue;
      _legVia.x = x; _legVia.z = z;
      return true;
    }
  }
  return false;
}

/**
 * The cell a route starts from: the nearest open cell on the hull's own level that it reaches on a clear straight
 * leg — one on the goal cell's side of the hull edges first — else one it reaches through a detour point (left in
 * _legVia), else the nearest open cell as before.
 */
function routeStartCell(navigation: BotNavigationGrid, from: Position2, goalIndex: number): number {
  _legVia.x = _legVia.z = NaN;
  const clearance = navigation.hullClearance, components = navigation.hullComponents;
  if (clearance) {
    const count = nearbyOpenCells(navigation, from);
    const goalSide = components && goalIndex >= 0 ? components[goalIndex] : -1;
    for (const sameSide of goalSide >= 0 ? [true, false] : [false]) {
      for (let i = 0; i < count; i++) {
        const index = _startCells[i], h = navigation.heights[index];
        if (sameSide && components![index] !== goalSide) continue;
        if (clearance.legClear(from.x, from.z, from.y ?? h, cellX(navigation.cellPositions, index),
          cellZ(navigation.cellPositions, index), h, true, false)) return index;
      }
      for (let i = 0, tried = 0; i < count && tried < 9; i++) {
        const index = _startCells[i], h = navigation.heights[index];
        if (sameSide && components![index] !== goalSide) continue;
        tried++;
        if (findLegVia(clearance, from.x, from.z, from.y ?? h, cellX(navigation.cellPositions, index),
          cellZ(navigation.cellPositions, index), h, true, true, false)) return index;
      }
    }
  }
  const [sx, sz] = nearestOpen(navigation.blocked, worldCell(from.x), worldCell(from.z));
  return cellIndex(sx, sz);
}

/**
 * The cell a route ends at: the nearest open cell to the goal, unless that cell lies on another side of the hull
 * edges than the start — then the nearest cell on the start's side with a clear straight leg on to the goal.
 */
function routeGoalCell(navigation: BotNavigationGrid, to: Position2, startIndex: number, openIndex: number): number {
  const components = navigation.hullComponents, clearance = navigation.hullClearance;
  if (!components || !clearance || components[openIndex] === components[startIndex]) return openIndex;
  const side = components[startIndex];
  const count = nearbyOpenCells(navigation, to);
  for (let i = 0; i < count; i++) {
    const index = _startCells[i], h = navigation.heights[index];
    if (components[index] === side && clearance.legClear(cellX(navigation.cellPositions, index),
      cellZ(navigation.cellPositions, index), h, to.x, to.z, h, false, true)) return index;
  }
  return openIndex;
}

function solveRoute(
  from: Position2,
  to: Position2,
  navigation: BotNavigationGrid,
  spec: TerrainMobilitySpec,
  seed: number,
): RouteSolution {
  const [openX, openZ] = nearestOpen(navigation.blocked, worldCell(to.x), worldCell(to.z));
  // a goal with its own level ends on that level: the nearest open cell to it there (a deck, not the gorge under it)
  let openIndex = cellIndex(openX, openZ), levelGoal = true;
  if (to.y !== undefined && navigation.hullClearance) {
    if (nearbyOpenCells(navigation, to)) openIndex = _startCells[0];
    else levelGoal = false;
  }
  const startIndex = routeStartCell(navigation, from, openIndex);
  const goalIndex = routeGoalCell(navigation, to, startIndex, openIndex);
  const sx = startIndex % GRID_N, sz = Math.floor(startIndex / GRID_N);
  const goalX = goalIndex % GRID_N, goalZ = Math.floor(goalIndex / GRID_N);
  const costs = new Float64Array(GRID_N * GRID_N);
  costs.fill(Infinity);
  const parents = new Int32Array(GRID_N * GRID_N);
  parents.fill(-1);
  const closed = new Uint8Array(GRID_N * GRID_N);
  const heap = new MinHeap();
  const search: RouteSearchState = {
    navigation, spec, seed, costs, parents, closed, heap, goalX, goalZ,
  };
  costs[startIndex] = 0;
  heap.push({ index: startIndex, ix: sx, iz: sz, score: 0 });
  // a goal beyond the cells this hull can reach (behind gaps narrower than the widest hull) ends the route at the
  // reachable cell nearest it, never through the gap
  let nearestIndex = startIndex, nearestSq = Infinity;
  while (heap.length) {
    const node = heap.pop();
    if (!node) break;
    if (closed[node.index]) continue;
    closed[node.index] = 1;
    if (node.index === goalIndex) break;
    const gx = node.ix - goalX, gz = node.iz - goalZ, goalSq = gx * gx + gz * gz;
    if (goalSq < nearestSq) { nearestSq = goalSq; nearestIndex = node.index; }
    for (let direction = 0; direction < NEIGHBOR_STEPS.length; direction++) {
      relaxNeighbor(node, NEIGHBOR_STEPS[direction], search, 1 << direction, direction);
    }
  }
  const solution = closed[goalIndex] || !navigation.hullClearance
    ? reconstructRoute(parents, costs, startIndex, goalIndex, navigation)
    : reconstructRoute(parents, costs, startIndex, nearestIndex, navigation, false);
  solution.levelGoal = levelGoal;
  return solution;
}

/**
 * One bounded Dijkstra traversal, not a search per candidate bank. Select the
 * nearest reachable allowed cell using directed vehicle mobility, then path
 * cost and stable cell index as ties. A blocked rounded start fails closed:
 * this policy does not invent a path from a wet/solid deployment position.
 */
/**
 * The cell a dry route starts from (bots lane, 2026-10-02; Reservoir pacing seed 120006 on the maps lane's tree). The
 * hull's own cell, unless the grid refuses it (its sample is liquid) or the leg to its centre is not drivable: through
 * solid cover, or further into the liquid (the liquid guard's own rule, which lets a hull already in it drive out but
 * never deeper in). Then the nearest open cell within two rings with a drivable leg, and failing that the nearest open
 * cell, as the wet grid's start does. A hull whose own cell is refused can always plan out of it.
 */
function dryStartCell(navigation: BotNavigationGrid, from: Position2, safe: LiquidCorridorGuard | null): number {
  const own = cellIndex(worldCell(from.x), worldCell(from.z));
  const legDrivable = (index: number): boolean => {
    const x = cellX(navigation.cellPositions, index), z = cellZ(navigation.cellPositions, index);
    const distance = Math.hypot(x - from.x, z - from.z);
    if (distance < 0.5) return true;
    if (safe && !safe(from.x, from.z, Math.atan2(x - from.x, z - from.z), distance)) return false;
    const clearance = navigation.hullClearance, h = navigation.heights[index];
    return !clearance || clearance.legClear(from.x, from.z, from.y ?? h, x, z, h, true, false);
  };
  if (!navigation.blocked[own] && legDrivable(own)) return own;
  const count = nearbyOpenCells(navigation, from);
  for (let i = 0; i < count; i++) if (legDrivable(_startCells[i])) return _startCells[i];
  if (!navigation.blocked[own]) return own;
  const [sx, sz] = nearestOpen(navigation.blocked, worldCell(from.x), worldCell(from.z));
  const nearest = cellIndex(sx, sz);
  return navigation.blocked[nearest] ? -1 : nearest;
}

function solveDryRoute(
  from: Position2,
  to: Position2,
  navigation: BotNavigationGrid,
  spec: TerrainMobilitySpec,
  seed: number,
  safe: LiquidCorridorGuard | null = null,
): RouteSolution {
  if (from.x < WORLD_MIN || from.x > WORLD_MAX || from.z < WORLD_MIN || from.z > WORLD_MAX) {
    return { points: [], cells: [], cost: Infinity, reached: false };
  }
  const startIndex = dryStartCell(navigation, from, safe);
  if (startIndex < 0) return { points: [], cells: [], cost: Infinity, reached: false };
  const sx = startIndex % GRID_N, sz = Math.floor(startIndex / GRID_N);
  const costs = new Float64Array(GRID_N * GRID_N);
  costs.fill(Infinity);
  const parents = new Int32Array(GRID_N * GRID_N);
  parents.fill(-1);
  const closed = new Uint8Array(GRID_N * GRID_N);
  const heap = new MinHeap();
  const search: RouteSearchState = {
    navigation, spec, seed, costs, parents, closed, heap,
    goalX: worldCell(to.x), goalZ: worldCell(to.z), projectReachableGoal: true,
  };
  let bestIndex = startIndex;
  let bestDistanceSq = Infinity;
  costs[startIndex] = 0;
  heap.push({ index: startIndex, ix: sx, iz: sz, score: 0 });
  while (heap.length) {
    const node = heap.pop();
    if (!node) break;
    if (closed[node.index]) continue;
    closed[node.index] = 1;
    const dx = cellX(navigation.cellPositions, node.index) - to.x, dz = cellZ(navigation.cellPositions, node.index) - to.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq < bestDistanceSq || (distanceSq === bestDistanceSq
      && (costs[node.index] < costs[bestIndex]
        || (costs[node.index] === costs[bestIndex] && node.index < bestIndex)))) {
      bestIndex = node.index;
      bestDistanceSq = distanceSq;
    }
    for (let direction = 0; direction < NEIGHBOR_STEPS.length; direction++) {
      relaxNeighbor(node, NEIGHBOR_STEPS[direction], search, 1 << direction, direction);
    }
  }
  return reconstructRoute(parents, costs, startIndex, bestIndex, navigation,
    closed[worldCell(to.z) * GRID_N + worldCell(to.x)] === 1);
}

function roleDetourPoint(
  start: Position2,
  goal: Position2,
  role: string,
  rng: () => number,
): Position2 {
  const dx = goal.x - start.x;
  const dz = goal.z - start.z;
  const distance = Math.hypot(dx, dz) || 1;
  const offset = roleOffset(role, rng);
  const fraction = role === 'sniper' ? 0.34 + rng() * 0.16 : 0.42 + rng() * 0.2;
  return {
    x: clamp(start.x + dx * fraction + (dz / distance) * offset,
      WORLD_MIN + 15, WORLD_MAX - 15),
    z: clamp(start.z + dz * fraction - (dx / distance) * offset,
      WORLD_MIN + 15, WORLD_MAX - 15),
  };
}

function shouldUseRoleDetour(
  start: Position2,
  goal: Position2,
  via: Position2,
  direct: RouteSolution,
  first: RouteSolution,
  second: RouteSolution,
): boolean {
  if (!first.points.length || !second.points.length) return false;
  if (!direct.points.length) return true;
  const directDistance = Math.max(Math.hypot(goal.x - start.x, goal.z - start.z), 1);
  const viaDistance = Math.hypot(via.x - start.x, via.z - start.z)
    + Math.hypot(goal.x - via.x, goal.z - via.z);
  const geometricDetour = Math.max(1, viaDistance / directDistance);
  const terrainBurden = ((first.cost + second.cost) / Math.max(direct.cost, 1)) / geometricDetour;
  return terrainBurden <= 1.25;
}

function simplifyRoute(
  raw: readonly BotRoutePoint[], goal: Position2, preserveGridEndpoints = false,
): BotRoutePoint[] {
  if (!raw.length) return [];
  const points: BotRoutePoint[] = preserveGridEndpoints ? [raw[0]] : [];
  for (let index = 1; index < raw.length; index++) {
    const prior = raw[index - 1];
    const current = raw[index];
    const next = raw[index + 1];
    const turns = !!next
      && (Math.sign(current[0] - prior[0]) !== Math.sign(next[0] - current[0])
        || Math.sign(current[1] - prior[1]) !== Math.sign(next[1] - current[1]));
    if (turns || index % 3 === 0 || index === raw.length - 1) points.push(current);
  }
  if (!preserveGridEndpoints) points[points.length - 1] = [goal.x, goal.z];
  return points;
}

/**
 * The waypoints a hull drives, every straight leg clear of solid cover for the widest hull: the simplified grid route
 * (turns and every third cell) with a cell put back wherever the leg past dropped cells is not clear; the start leg
 * from the hull itself (through routeStartCell's detour point, an earlier cell, or a detour point of its own); and the
 * leg on to the exact goal, which keeps the goal cell, then a detour point round the goal, and otherwise ends the
 * route at the cell. `goal` null ends the route at its last cell; `startVia` is NaN when no detour was needed. A route
 * that ends short of an unreached goal goes on to it only on a clear leg of at most two cells.
 */
function clearRoute(
  solution: RouteSolution, start: Position2, goal: Position2 | null, navigation: BotNavigationGrid,
  startVia: Position2, keepStartCell: boolean,
): BotRoutePoint[] {
  const raw = solution.points, cells = solution.cells, clearance = navigation.hullClearance!;
  const last = raw.length - 1;
  // a start and goal in one cell: the snapped ingress alone, or (as the simplified grid route always had it) no route
  if (last < 1) return last === 0 && keepStartCell ? [raw[0]] : [];
  const heights = navigation.heights;
  // a way point (cell -1) lies between two cells: their mean height
  const cellH = (index: number) => {
    if (cells[index] >= 0) return heights[cells[index]];
    let before = index - 1, after = index + 1;
    while (before > 0 && cells[before] < 0) before--;
    while (after < last && cells[after] < 0) after++;
    return (heights[cells[before]] + heights[cells[after]]) * 0.5;
  };
  const keep = new Uint8Array(raw.length);
  for (let index = keepStartCell ? 0 : 1; index <= last; index++) {
    const prior = raw[index - 1], current = raw[index], next = raw[index + 1];
    const turns = !!next && !!prior
      && (Math.sign(current[0] - prior[0]) !== Math.sign(next[0] - current[0])
        || Math.sign(current[1] - prior[1]) !== Math.sign(next[1] - current[1]));
    if (index === 0 || turns || index % 3 === 0 || index === last) keep[index] = 1;
  }
  // a bend and the two cells it joins are waypoints: a leg through a bend is clear only from its own cells
  for (let index = 1; index < last; index++) {
    if (cells[index] < 0) keep[index - 1] = keep[index] = keep[index + 1] = 1;
  }
  // the start leg: from the hull, or the detour point it needed, to the first kept cell or the latest earlier one
  let viaX = startVia.x, viaZ = startVia.z, hasVia = Number.isFinite(viaX + viaZ);
  const startH = start.y ?? cellH(0);
  const fromStart = (index: number) => clearance.legClear(hasVia ? viaX : start.x, hasVia ? viaZ : start.z, startH,
    raw[index][0], raw[index][1], cellH(index), !hasVia, false);
  let first = 0;
  while (first < last && !keep[first]) first++;
  if (!keepStartCell && first === 0) {
    // the start cell, kept for a bend on the first edge, is skipped when the hull reaches the next waypoint straight
    let next = 1;
    while (next < last && !keep[next]) next++;
    if (fromStart(next)) { keep[0] = 0; first = next; }
  }
  if (!fromStart(first)) {
    let entry = -1;
    for (let index = first - 1; index >= 0 && entry < 0; index--) if (fromStart(index)) entry = index;
    if (entry < 0 && !hasVia && findLegVia(clearance, start.x, start.z, startH, raw[first][0], raw[first][1],
      cellH(first), true, true, false)) {
      viaX = _legVia.x; viaZ = _legVia.z; hasVia = true;
    }
    if (entry >= 0) keep[entry] = 1;
  }
  // a run of dropped cells repeats one clear straight edge, so the leg past it is clear; but cells snapped onto a
  // bridge axis break that collinearity, and there a run stays dropped only while the leg past it is clear
  let previous = -1;
  for (let index = 0; navigation.cellPositions && index <= last; index++) {
    if (!keep[index]) continue;
    if (previous >= 0 && index - previous > 1 && !clearance.legClear(raw[previous][0], raw[previous][1],
      cellH(previous), raw[index][0], raw[index][1], cellH(index), false, false)) {
      for (let between = previous + 1; between < index; between++) keep[between] = 1;
    }
    previous = index;
  }
  const points: BotRoutePoint[] = hasVia ? [[viaX, viaZ]] : [];
  let beforeLast = -1;
  for (let index = 0; index <= last; index++) {
    if (!keep[index]) continue;
    if (index < last) beforeLast = index;
    points.push(raw[index]);
  }
  if (!goal) return points;
  const goalH = cellH(last);
  if (!solution.reached) {
    const end = raw[last];
    if (Math.hypot(goal.x - end[0], goal.z - end[1]) <= 2 * CELL_M
      && clearance.legClear(end[0], end[1], goalH, goal.x, goal.z, goalH, false, true)) points.push([goal.x, goal.z]);
    return points;
  }
  // the goal leg replaces the last cell when it is clear from the point before; otherwise it follows the cell
  const clearToGoal = beforeLast >= 0
    ? clearance.legClear(raw[beforeLast][0], raw[beforeLast][1], cellH(beforeLast), goal.x, goal.z, goalH, false, true)
    : clearance.legClear(hasVia ? viaX : start.x, hasVia ? viaZ : start.z, startH, goal.x, goal.z, goalH, !hasVia,
      true);
  if (clearToGoal) {
    points[points.length - 1] = [goal.x, goal.z];
    return points;
  }
  const end = raw[last];
  if (clearance.legClear(end[0], end[1], goalH, goal.x, goal.z, goalH, false, true)) {
    points.push([goal.x, goal.z]);
  } else if (findLegVia(clearance, end[0], end[1], goalH, goal.x, goal.z, goalH, false, false, true)) {
    points.push([_legVia.x, _legVia.z], [goal.x, goal.z]);
  }
  return points;
}

function planDryRoute(
  start: Position2, goal: Position2, grid: BotNavigationGrid,
  spec: TerrainMobilitySpec, seed: number, rng: () => number,
  role: string, useRoleDetour: boolean,
): BotRoutePoint[] {
  const safe = createNavigationLiquidSafety(grid.liquidField, spec);
  const direct = solveDryRoute(start, goal, grid, spec, seed, safe);
  if (!direct.points.length) return [];
  const terminal = direct.points[direct.points.length - 1];
  const effectiveGoal = { x: terminal[0], z: terminal[1] };
  let raw = direct.points, rawCells = direct.cells;
  if (useRoleDetour) {
    const requestedVia = roleDetourPoint(start, effectiveGoal, role, rng);
    const first = solveDryRoute(start, requestedVia, grid, spec, seed, safe);
    const firstEnd = first.points[first.points.length - 1];
    if (firstEnd) {
      const effectiveVia = { x: firstEnd[0], z: firstEnd[1] };
      const second = solveDryRoute(effectiveVia, effectiveGoal, grid, spec, seed, safe);
      const secondEnd = second.points[second.points.length - 1];
      if (secondEnd && secondEnd[0] === terminal[0] && secondEnd[1] === terminal[1]
        && shouldUseRoleDetour(start, effectiveGoal, effectiveVia, direct, first, second)) {
        raw = first.points.concat(second.points.slice(1));
        rawCells = first.cells.concat(second.cells.slice(1));
      }
    }
  }
  // Preserve both snapped ingress and terminal. Never reinsert an exact wet
  // goal, or skip the snapped start and shortcut the first cached grid edge.
  const points = grid.hullClearance
    ? clearRoute({ points: raw, cells: rawCells, cost: 0, reached: true }, start, null, grid, NO_VIA, true)
    : simplifyRoute(raw, effectiveGoal, true);
  const last = points[points.length - 1];
  const dx = goal.x-last[0], dz=goal.z-last[1], distance=Math.hypot(dx,dz);
  if (safe && distance > 0 && distance < CELL_M && Math.max(Math.abs(goal.x),Math.abs(goal.z)) <= WORLD_MAX
    && safe(last[0],last[1],Math.atan2(dx,dz),distance)) {
    let clear = true, previousH = grid.liquidField!.getHeightAt(last[0],last[1]);
    const steps = Math.max(1,Math.ceil(distance/2));
    for (let i=1;i<=steps;i++) {
      const x=last[0]+dx*i/steps, z=last[1]+dz*i/steps;
      const h=grid.liquidField!.getHeightAt(x,z);
      const ground=driveGroundTypeAt(grid.liquidField!,x,z);
      if (!grid.exactConnectorClear!(x,z) || !Number.isFinite(terrainTravelCostFactor(spec,ground as GroundType,(h-previousH)/(distance/steps || 1)))) { clear=false; break; }
      previousH=h;
    }
    if (clear && distance > 0) points.push([goal.x,goal.z]);
  }
  return points;
}

/**
 * Plan a match-seeded global route over a 25 m battlefield grid.
 * Solid authored cover and vehicle-specific terrain limits are rejected
 * before the existing local AI controller receives the waypoints.
 */
export function planBotRoute({
  start,
  goal,
  navigation = null,
  heightField,
  queryObstacles = null,
  getObstacles = () => [],
  rng = Math.random,
  role = 'flanker',
  spec,
  useRoleDetour = true,
  requireGoalLevel = false,
}: BotRouteOptions = {}): BotRoutePoint[] {
  if (!start || !goal) {
    throw new TypeError('start and goal are required');
  }
  if (!spec || !spec.terrainResistance || !(Number(spec.enginePowerHp) > 0) ||
      !(Number(spec.weightTons) > 0)) {
    throw new TypeError('spec with drivetrain and terrain resistance is required');
  }
  const seed = (rng() * 0x100000000) >>> 0;
  const grid = navigation || createBotNavigationGrid({
    heightField,
    queryObstacles,
    getObstacles,
  });
  if (!isValidNavigationGrid(grid)) {
    throw new TypeError('navigation must be a bot navigation grid');
  }
  if (grid.navigationWaterPolicy === 'avoid-liquid') {
    const dry = planDryRoute(start, goal, grid, spec, seed, rng, role, useRoleDetour);
    if (!requireGoalLevel || !dry.length || goal.y === undefined) return dry;
    // the dry route ends at the reachable cell nearest the goal: wanted only when that cell is on the goal's level
    const end = dry[dry.length - 1], endCell = cellIndex(worldCell(end[0]), worldCell(end[1]));
    return Math.hypot(end[0] - goal.x, end[1] - goal.z) <= 2 * CELL_M
      && Math.abs(grid.heights[endCell] - goal.y) <= NAV_LEVEL_M ? dry : [];
  }
  const direct = solveRoute(start, goal, grid, spec, seed);
  const startVia = { x: _legVia.x, z: _legVia.z };
  let solution = direct;
  if (useRoleDetour) {
    const via = roleDetourPoint(start, goal, role, rng);
    const first = solveRoute(start, via, grid, spec, seed);
    // the second leg leaves from the cell the first one reached
    const firstEnd = first.points[first.points.length - 1];
    const second = firstEnd ? solveRoute({ x: firstEnd[0], z: firstEnd[1] }, goal, grid, spec, seed) : first;
    // Role openings may take longer geometric lanes, but not materially more
    // expensive terrain after normalizing that requested detour distance.
    if (direct.reached && first.reached && second.reached
      && shouldUseRoleDetour(start, goal, via, direct, first, second)) {
      solution = {
        points: first.points.concat(second.points.slice(1)), cells: first.cells.concat(second.cells.slice(1)),
        cost: first.cost + second.cost, reached: true,
      };
    }
  }
  if (!grid.hullClearance) return simplifyRoute(solution.points, goal);
  if (requireGoalLevel && (!solution.reached || direct.levelGoal === false)) return [];
  return clearRoute(solution, start, goal, grid, startVia, false);
}
