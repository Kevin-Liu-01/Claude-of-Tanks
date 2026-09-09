import { createNavigationLiquidSafety } from './navigationLiquidSafety.ts';
import {
  TERRAIN_MARGIN_EPS,
  groundResistanceFor,
  terrainSlopeMargin,
  terrainTravelCostFactor,
} from './terrainMobility.ts';
import type { TerrainMobilitySpec } from './terrainMobility.ts';
import {
  collisionFootprintContainsPoint,
  type CollisionRecord,
  type CollisionShape,
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

type GroundType = 'hard' | 'medium' | 'soft';
export type BotRoutePoint = [number, number];
/** Map-authored route preference, not a depth/drowning or collision rule. */
export type NavigationWaterPolicy = 'avoid-liquid';

interface Position2 {
  x: number;
  z: number;
}

interface NavigationHeightField {
  readonly navigationWaterPolicy?: NavigationWaterPolicy;
  getWaterMaskAt?(x: number, z: number): number;
  getHeightAt(x: number, z: number): number;
  getGroundType?(x: number, z: number): string;
}

interface NavigationObstacle {
  min: readonly number[];
  max: readonly number[];
  shape2?: CollisionShape;
  crushed?: boolean;
  crushable?: boolean;
}

type ObstacleQuery<T extends NavigationObstacle = NavigationObstacle> = (
  minX: number, minZ: number, maxX: number, maxZ: number, out: T[],
) => T[];

export interface BotNavigationGrid {
  readonly navigationWaterPolicy?: NavigationWaterPolicy;
  /** One bit per NEIGHBOR_STEPS edge; allocated only for explicit dry routing. */
  readonly waterBlockedEdges?: Uint8Array;
  readonly liquidField?: NavigationHeightField;
  readonly exactConnectorClear?: (x: number, z: number) => boolean;
  readonly heights: Float32Array;
  readonly blocked: Uint8Array;
  readonly groundTypes: Uint8Array;
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
}

interface HeapNode {
  index: number;
  ix: number;
  iz: number;
  score: number;
}

interface RouteSolution {
  points: BotRoutePoint[];
  cost: number;
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
): void {
  for (let ix = 0; ix < GRID_N; ix++) {
    const index = cellIndex(ix, iz);
    const x = worldCoord(ix);
    const z = worldCoord(iz);
    heights[index] = heightField.getHeightAt(x, z);
    const ground = heightField.getGroundType?.(x, z) ?? 'medium';
    groundTypes[index] = encodeGroundType(ground);
    const nearby = queryObstacles
      ? queryObstacles(x - 4.5, z - 4.5, x + 4.5, z + 4.5, candidates)
      : obstacles;
    blocked[index] = isSolidObstacleAt(nearby, x, z) ? 1 : 0;
  }
}

/**
 * One construction-only water pass. Preserve the original terrain/obstacle
 * sampling order above; opt-out maps allocate/query nothing here.
 *
 * This is sampled centerline safety, not depth or a swept-hull certificate.
 * Both directions share one edge test; segment intervals are at most 2.5 m.
 */
function navigationSampleIsLiquid(field: NavigationHeightField, x: number, z: number): boolean {
  // Called only after addDryNavigationPolicy validates the field capability.
  const mask = field.getWaterMaskAt!(x, z);
  if (!Number.isFinite(mask) || mask < 0 || mask > 1) {
    throw new TypeError('navigation liquid coverage must be finite and within 0..1');
  }
  return mask > 0;
}

function navigationEdgeCrossesLiquid(
  field: NavigationHeightField, ix: number, iz: number,
  step: readonly [number, number, number],
): boolean {
  const [dx, dz, distanceScale] = step;
  const intervals = Math.ceil(CELL_M * distanceScale / 2.5);
  for (let sample = 1; sample < intervals; sample++) {
    const fraction = sample / intervals;
    if (navigationSampleIsLiquid(field,
      worldCoord(ix) + dx * CELL_M * fraction,
      worldCoord(iz) + dz * CELL_M * fraction)) return true;
  }
  return false;
}

function addDryNavigationPolicy(
  heightField: NavigationHeightField,
  heights: Float32Array,
  blocked: Uint8Array,
  groundTypes: Uint8Array,
  exactConnectorClear: (x: number, z: number) => boolean,
): Readonly<BotNavigationGrid> {
  if (typeof heightField.getWaterMaskAt !== 'function') {
    throw new TypeError('avoid-liquid navigation requires getWaterMaskAt');
  }
  const waterBlockedEdges = new Uint8Array(GRID_N * GRID_N);
  for (let index = 0; index < blocked.length; index++) {
    const ix = index % GRID_N, iz = Math.floor(index / GRID_N);
    if (navigationSampleIsLiquid(heightField, worldCoord(ix), worldCoord(iz))) {
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
      if (!navigationEdgeCrossesLiquid(heightField, ix, iz, NEIGHBOR_STEPS[direction])) continue;
      waterBlockedEdges[index] |= 1 << direction;
      waterBlockedEdges[cellIndex(nx, nz)] |= 1 << opposite[direction];
    }
  }
  return Object.freeze({
    heights, blocked, groundTypes, navigationWaterPolicy: 'avoid-liquid', waterBlockedEdges,
    liquidField: heightField, exactConnectorClear,
  });
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
  const candidates: T[] = [];
  const obstacles = getObstacles() || [];
  for (let iz = 0; iz < GRID_N; iz++) {
    sampleNavigationRow(iz, heightField, queryObstacles, obstacles, candidates,
      heights, groundTypes, blocked);
  }
  if (heightField.navigationWaterPolicy === 'avoid-liquid') {
    return addDryNavigationPolicy(heightField, heights, blocked, groundTypes, (x,z) => {
      const nearby = queryObstacles ? queryObstacles(x-4.5,z-4.5,x+4.5,z+4.5,candidates) : obstacles;
      return !isSolidObstacleAt(nearby,x,z);
    });
  }
  if (heightField.navigationWaterPolicy !== undefined) {
    throw new TypeError('unknown navigation water policy');
  }
  return Object.freeze({ heights, blocked, groundTypes });
}

function isValidNavigationGrid(navigation: BotNavigationGrid): boolean {
  const count = GRID_N * GRID_N;
  return navigation.heights instanceof Float32Array
    && navigation.blocked instanceof Uint8Array
    && navigation.groundTypes instanceof Uint8Array
    && navigation.heights.length === count
    && navigation.blocked.length === count
    && navigation.groundTypes.length === count
    && (navigation.navigationWaterPolicy === undefined
      ? navigation.waterBlockedEdges === undefined
      : navigation.navigationWaterPolicy === 'avoid-liquid'
        && navigation.waterBlockedEdges instanceof Uint8Array
        && navigation.waterBlockedEdges.length === count);
}

/** Objective-only dry view: share immutable terrain values; never change the
 * bot owner's blocked bytes or authored navigation policy. */
export function createDryNavigationView(navigation: BotNavigationGrid, field: NavigationHeightField,
  connectorClear: (x: number, z: number) => boolean): Readonly<BotNavigationGrid> {
  if (!isValidNavigationGrid(navigation)) throw new TypeError('valid navigation grid required');
  if (navigation.navigationWaterPolicy === 'avoid-liquid') return navigation;
  return addDryNavigationPolicy(field, navigation.heights, navigation.blocked.slice(),
    navigation.groundTypes, connectorClear);
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
    target.x = worldCoord(ix); target.z = worldCoord(iz);
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
  const grade = (navigation.heights[index] - navigation.heights[node.index]) / (CELL_M * scale);
  const ground = routeGroundType(spec, navigation.groundTypes, node.index, index);
  // Objective access must permit carrying the flag/ball back out as well as
  // descending into a clearing. This objective-only flood is conservative;
  // the bot planner's existing directional movement policy is unchanged.
  return terrainSlopeMargin(spec, ground, grade) > TERRAIN_MARGIN_EPS
    && terrainSlopeMargin(spec, ground, -grade) > TERRAIN_MARGIN_EPS ? index : -1;
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
  return connectedNavigationCells(navigation, point, connectorClear, index => mask[index] === 1);
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
  const distance = CELL_M * distanceScale;
  const signedGrade = (navigation.heights[nextIndex] - navigation.heights[node.index]) / distance;
  const ground = routeGroundType(spec, navigation.groundTypes, node.index, nextIndex);
  if (terrainSlopeMargin(spec, ground, signedGrade) <= TERRAIN_MARGIN_EPS) return;
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

function reconstructRoute(
  parents: Int32Array,
  costs: Float64Array,
  startIndex: number,
  goalIndex: number,
): RouteSolution {
  if (parents[goalIndex] < 0 && goalIndex !== startIndex) {
    return { points: [], cost: Infinity };
  }
  const points: BotRoutePoint[] = [];
  let current = goalIndex;
  while (current >= 0) {
    points.push([worldCoord(current % GRID_N), worldCoord(Math.floor(current / GRID_N))]);
    if (current === startIndex) break;
    current = parents[current];
  }
  points.reverse();
  return { points, cost: costs[goalIndex] };
}

function solveRoute(
  from: Position2,
  to: Position2,
  navigation: BotNavigationGrid,
  spec: TerrainMobilitySpec,
  seed: number,
): RouteSolution {
  const [sx, sz] = nearestOpen(navigation.blocked, worldCell(from.x), worldCell(from.z));
  const [goalX, goalZ] = nearestOpen(navigation.blocked, worldCell(to.x), worldCell(to.z));
  const startIndex = cellIndex(sx, sz);
  const goalIndex = cellIndex(goalX, goalZ);
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
  while (heap.length) {
    const node = heap.pop();
    if (!node) break;
    if (closed[node.index]) continue;
    closed[node.index] = 1;
    if (node.index === goalIndex) break;
    for (const step of NEIGHBOR_STEPS) relaxNeighbor(node, step, search);
  }
  return reconstructRoute(parents, costs, startIndex, goalIndex);
}

/**
 * One bounded Dijkstra traversal, not a search per candidate bank. Select the
 * nearest reachable allowed cell using directed vehicle mobility, then path
 * cost and stable cell index as ties. A blocked rounded start fails closed:
 * this policy does not invent a path from a wet/solid deployment position.
 */
function solveDryRoute(
  from: Position2,
  to: Position2,
  navigation: BotNavigationGrid,
  spec: TerrainMobilitySpec,
  seed: number,
): RouteSolution {
  if (from.x < WORLD_MIN || from.x > WORLD_MAX || from.z < WORLD_MIN || from.z > WORLD_MAX) {
    return { points: [], cost: Infinity };
  }
  const sx = worldCell(from.x), sz = worldCell(from.z);
  const startIndex = cellIndex(sx, sz);
  if (navigation.blocked[startIndex]) return { points: [], cost: Infinity };
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
    const dx = worldCoord(node.ix) - to.x, dz = worldCoord(node.iz) - to.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq < bestDistanceSq || (distanceSq === bestDistanceSq
      && (costs[node.index] < costs[bestIndex]
        || (costs[node.index] === costs[bestIndex] && node.index < bestIndex)))) {
      bestIndex = node.index;
      bestDistanceSq = distanceSq;
    }
    for (let direction = 0; direction < NEIGHBOR_STEPS.length; direction++) {
      relaxNeighbor(node, NEIGHBOR_STEPS[direction], search, 1 << direction);
    }
  }
  return reconstructRoute(parents, costs, startIndex, bestIndex);
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

function planDryRoute(
  start: Position2, goal: Position2, grid: BotNavigationGrid,
  spec: TerrainMobilitySpec, seed: number, rng: () => number,
  role: string, useRoleDetour: boolean,
): BotRoutePoint[] {
  const direct = solveDryRoute(start, goal, grid, spec, seed);
  if (!direct.points.length) return [];
  const terminal = direct.points[direct.points.length - 1];
  const effectiveGoal = { x: terminal[0], z: terminal[1] };
  let raw = direct.points;
  if (useRoleDetour) {
    const requestedVia = roleDetourPoint(start, effectiveGoal, role, rng);
    const first = solveDryRoute(start, requestedVia, grid, spec, seed);
    const firstEnd = first.points[first.points.length - 1];
    if (firstEnd) {
      const effectiveVia = { x: firstEnd[0], z: firstEnd[1] };
      const second = solveDryRoute(effectiveVia, effectiveGoal, grid, spec, seed);
      const secondEnd = second.points[second.points.length - 1];
      if (secondEnd && secondEnd[0] === terminal[0] && secondEnd[1] === terminal[1]
        && shouldUseRoleDetour(start, effectiveGoal, effectiveVia, direct, first, second)) {
        raw = first.points.concat(second.points.slice(1));
      }
    }
  }
  // Preserve both snapped ingress and terminal. Never reinsert an exact wet
  // goal, or skip the snapped start and shortcut the first cached grid edge.
  const points = simplifyRoute(raw, effectiveGoal, true);
  const safe = createNavigationLiquidSafety(grid.liquidField, spec);
  const last = points[points.length - 1];
  const dx = goal.x-last[0], dz=goal.z-last[1], distance=Math.hypot(dx,dz);
  if (safe && distance > 0 && distance < CELL_M && Math.max(Math.abs(goal.x),Math.abs(goal.z)) <= WORLD_MAX
    && safe(last[0],last[1],Math.atan2(dx,dz),distance)) {
    let clear = true, previousH = grid.liquidField!.getHeightAt(last[0],last[1]);
    const steps = Math.max(1,Math.ceil(distance/2));
    for (let i=1;i<=steps;i++) {
      const x=last[0]+dx*i/steps, z=last[1]+dz*i/steps;
      const h=grid.liquidField!.getHeightAt(x,z);
      const ground=grid.liquidField!.getGroundType?.(x,z) ?? 'medium';
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
    return planDryRoute(start, goal, grid, spec, seed, rng, role, useRoleDetour);
  }
  const direct = solveRoute(start, goal, grid, spec, seed);
  let raw = direct.points;
  if (useRoleDetour) {
    const via = roleDetourPoint(start, goal, role, rng);
    const first = solveRoute(start, via, grid, spec, seed);
    const second = solveRoute(via, goal, grid, spec, seed);
    // Role openings may take longer geometric lanes, but not materially more
    // expensive terrain after normalizing that requested detour distance.
    if (shouldUseRoleDetour(start, goal, via, direct, first, second)) {
      raw = first.points.concat(second.points.slice(1));
    }
  }
  return simplifyRoute(raw, goal);
}
