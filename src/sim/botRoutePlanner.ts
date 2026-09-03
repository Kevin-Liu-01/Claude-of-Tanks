import {
  TERRAIN_MARGIN_EPS,
  groundResistanceFor,
  terrainSlopeMargin,
  terrainTravelCostFactor,
} from './terrainMobility.ts';
import type { TerrainMobilitySpec } from './terrainMobility.ts';

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

interface Position2 {
  x: number;
  z: number;
}

interface NavigationHeightField {
  getHeightAt(x: number, z: number): number;
  getGroundType?(x: number, z: number): string;
}

interface NavigationObstacle {
  min: readonly number[];
  max: readonly number[];
  crushed?: boolean;
  crushable?: boolean;
}

type ObstacleQuery<T extends NavigationObstacle = NavigationObstacle> = (
  minX: number, minZ: number, maxX: number, maxZ: number, out: T[],
) => T[];

export interface BotNavigationGrid {
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
    if (x >= obstacle.min[0] - 3.5 && x <= obstacle.max[0] + 3.5
      && z >= obstacle.min[2] - 3.5 && z <= obstacle.max[2] + 3.5) return true;
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
  return Object.freeze({ heights, blocked, groundTypes });
}

function isValidNavigationGrid(navigation: BotNavigationGrid): boolean {
  const count = GRID_N * GRID_N;
  return navigation.heights instanceof Float32Array
    && navigation.blocked instanceof Uint8Array
    && navigation.groundTypes instanceof Uint8Array
    && navigation.heights.length === count
    && navigation.blocked.length === count
    && navigation.groundTypes.length === count;
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
): void {
  const [dx, dz, distanceScale] = step;
  const nx = node.ix + dx;
  const nz = node.iz + dz;
  if (isOutsideGrid(nx, nz)) return;
  const { navigation, closed, costs, parents, heap, spec } = search;
  const nextIndex = cellIndex(nx, nz);
  if (closed[nextIndex] || navigation.blocked[nextIndex]) return;
  if (diagonalCornerIsBlocked(node, dx, dz, navigation.blocked)) return;
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
  const heuristic = Math.hypot(search.goalX - nx, search.goalZ - nz) * CELL_M;
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

function simplifyRoute(raw: readonly BotRoutePoint[], goal: Position2): BotRoutePoint[] {
  if (!raw.length) return [];
  const points: BotRoutePoint[] = [];
  for (let index = 1; index < raw.length; index++) {
    const prior = raw[index - 1];
    const current = raw[index];
    const next = raw[index + 1];
    const turns = !!next
      && (Math.sign(current[0] - prior[0]) !== Math.sign(next[0] - current[0])
        || Math.sign(current[1] - prior[1]) !== Math.sign(next[1] - current[1]));
    if (turns || index % 3 === 0 || index === raw.length - 1) points.push(current);
  }
  points[points.length - 1] = [goal.x, goal.z];
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
