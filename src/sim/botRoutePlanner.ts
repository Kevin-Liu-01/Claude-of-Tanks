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
    for (let ix = 0; ix < GRID_N; ix++) {
      const index = cellIndex(ix, iz);
      const x = worldCoord(ix);
      const z = worldCoord(iz);
      heights[index] = heightField.getHeightAt(x, z);
      groundTypes[index] = encodeGroundType(
        typeof heightField.getGroundType === 'function'
          ? heightField.getGroundType(x, z)
          : 'medium',
      );
      const nearby = queryObstacles
        ? queryObstacles(x - 4.5, z - 4.5, x + 4.5, z + 4.5, candidates)
        : obstacles;
      for (const obstacle of nearby) {
        if (obstacle.crushed || obstacle.crushable) continue;
        if (x >= obstacle.min[0] - 3.5 && x <= obstacle.max[0] + 3.5 &&
            z >= obstacle.min[2] - 3.5 && z <= obstacle.max[2] + 3.5) {
          blocked[index] = 1;
          break;
        }
      }
    }
  }
  return Object.freeze({ heights, blocked, groundTypes });
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
  const { heights, blocked, groundTypes } = grid;
  if (!(heights instanceof Float32Array) || !(blocked instanceof Uint8Array) ||
      !(groundTypes instanceof Uint8Array) ||
      heights.length !== GRID_N * GRID_N || blocked.length !== GRID_N * GRID_N ||
      groundTypes.length !== GRID_N * GRID_N) {
    throw new TypeError('navigation must be a bot navigation grid');
  }

  function nearestOpen(ix: number, iz: number): [number, number] {
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

  function solve(from: Position2, to: Position2): RouteSolution {
    const [sx, sz] = nearestOpen(worldCell(from.x), worldCell(from.z));
    const [gx, gz] = nearestOpen(worldCell(to.x), worldCell(to.z));
    const startIndex = cellIndex(sx, sz);
    const goalIndex = cellIndex(gx, gz);
    const count = GRID_N * GRID_N;
    const costs = new Float64Array(count);
    costs.fill(Infinity);
    const parents = new Int32Array(count);
    parents.fill(-1);
    const closed = new Uint8Array(count);
    const heap = new MinHeap();
    costs[startIndex] = 0;
    heap.push({ index: startIndex, ix: sx, iz: sz, score: 0 });
    while (heap.length) {
      const node = heap.pop();
      if (!node) break;
      if (closed[node.index]) continue;
      closed[node.index] = 1;
      if (node.index === goalIndex) break;
      for (const [dx, dz, distanceScale] of NEIGHBOR_STEPS) {
        const nx = node.ix + dx;
        const nz = node.iz + dz;
        if (nx < 0 || nz < 0 || nx >= GRID_N || nz >= GRID_N) continue;
        const nextIndex = cellIndex(nx, nz);
        if (closed[nextIndex] || blocked[nextIndex]) continue;
        if (dx && dz && (blocked[cellIndex(node.ix + dx, node.iz)] ||
          blocked[cellIndex(node.ix, node.iz + dz)])) continue;
        const distance = CELL_M * distanceScale;
        const signedGrade = (heights[nextIndex] - heights[node.index]) / distance;
        const fromGround = decodeGroundType(groundTypes[node.index]);
        const toGround = decodeGroundType(groundTypes[nextIndex]);
        const ground = groundResistanceFor(spec, toGround) >= groundResistanceFor(spec, fromGround)
          ? toGround : fromGround;
        if (terrainSlopeMargin(spec, ground, signedGrade) <= TERRAIN_MARGIN_EPS) continue;
        const terrainCost = terrainTravelCostFactor(spec, ground, signedGrade);
        const variability = 1 + hashNoise(seed, nx, nz) * 0.22;
        const nextCost = costs[node.index] + distance * terrainCost * variability;
        if (nextCost >= costs[nextIndex]) continue;
        costs[nextIndex] = nextCost;
        parents[nextIndex] = node.index;
        const heuristic = Math.hypot(gx - nx, gz - nz) * CELL_M;
        heap.push({ index: nextIndex, ix: nx, iz: nz, score: nextCost + heuristic });
      }
    }
    if (parents[goalIndex] < 0 && goalIndex !== startIndex) {
      return { points: [], cost: Infinity };
    }
    const path: BotRoutePoint[] = [];
    let current = goalIndex;
    while (current >= 0) {
      const ix = current % GRID_N;
      const iz = Math.floor(current / GRID_N);
      path.push([worldCoord(ix), worldCoord(iz)]);
      if (current === startIndex) break;
      current = parents[current];
    }
    path.reverse();
    return { points: path, cost: costs[goalIndex] };
  }

  const dx = goal.x - start.x;
  const dz = goal.z - start.z;
  const direct = solve(start, goal);
  let raw = direct.points;
  if (useRoleDetour) {
    const distance = Math.hypot(dx, dz) || 1;
    const lateralX = dz / distance;
    const lateralZ = -dx / distance;
    const offset = roleOffset(role, rng);
    const fraction = role === 'sniper' ? 0.34 + rng() * 0.16 : 0.42 + rng() * 0.2;
    const via = {
      x: clamp(start.x + dx * fraction + lateralX * offset, WORLD_MIN + 15, WORLD_MAX - 15),
      z: clamp(start.z + dz * fraction + lateralZ * offset, WORLD_MIN + 15, WORLD_MAX - 15),
    };
    const first = solve(start, via);
    const second = solve(via, goal);
    const viaValid = first.points.length > 0 && second.points.length > 0;
    const viaCost = first.cost + second.cost;
    // Role openings intentionally take longer geometric lanes; that spacing
    // is part of battle pacing and must not be optimized away. Compare only
    // the EXTRA terrain burden after normalizing the requested detour length.
    const directDistance = Math.max(distance, 1);
    const viaDistance = Math.hypot(via.x - start.x, via.z - start.z) +
      Math.hypot(goal.x - via.x, goal.z - via.z);
    const geometricDetour = Math.max(1, viaDistance / directDistance);
    const terrainBurden = direct.points.length
      ? (viaCost / Math.max(direct.cost, 1)) / geometricDetour
      : 1;
    if (viaValid && (!direct.points.length || terrainBurden <= 1.25)) {
      raw = first.points.concat(second.points.slice(1));
    }
  }
  if (!raw.length) return [];

  const points: BotRoutePoint[] = [];
  for (let index = 1; index < raw.length; index++) {
    const prior = raw[index - 1];
    const current = raw[index];
    const next = raw[index + 1];
    const turns = next &&
      (Math.sign(current[0] - prior[0]) !== Math.sign(next[0] - current[0]) ||
       Math.sign(current[1] - prior[1]) !== Math.sign(next[1] - current[1]));
    if (turns || index % 3 === 0 || index === raw.length - 1) points.push(current);
  }
  points[points.length - 1] = [goal.x, goal.z];
  return points;
}
