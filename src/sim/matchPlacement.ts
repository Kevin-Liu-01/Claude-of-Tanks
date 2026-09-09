/** Deterministic construction/event-time placement. No renderer, fleet or RNG owner. */
import { collisionFootprintContainsPoint, type CollisionRecord, type ObstacleQuery } from '../world/collision.ts';
import { MATCH_OBJECTIVE_LAYOUTS, MATCH_MODE_ARENA_HALF_EXTENT_M } from './matchObjectiveLayouts.ts';
import { createObjectiveAccess } from './matchPlacementAccess.ts';
import type { BotNavigationGrid } from './botRoutePlanner.ts';

export interface PlacementPoint { x: number; z: number }
export interface PlacementSpawn extends PlacementPoint { yaw: number }
export interface PlacementTerrain {
  getHeightAt(x: number, z: number): number;
  getNormalAt?(x: number, z: number): { y: number };
  getWaterMaskAt?(x: number, z: number): number;
  getGroundType?(x: number, z: number): string;
  size?: number;
  navigationWaterPolicy?: 'avoid-liquid';
}
export interface PlacementAnchors {
  alpha: PlacementSpawn; bravo: PlacementSpawn;
  deployments?: { alpha: readonly PlacementPoint[]; bravo: readonly PlacementPoint[] };
}
interface Reservation extends PlacementPoint { radius: number; key: string }
interface OccupiedPlacement extends PlacementPoint { radius: number }
interface PlacementWorld {
  heightField: PlacementTerrain;
  obstacles: readonly CollisionRecord[];
  queryObstacles?: ObstacleQuery | null;
}
interface PlacementOptions extends PlacementWorld { anchors: PlacementAnchors; mode: string; mapId?: string }
interface Footprint { radius: number; relief: number; normalY: number; solidOnly?: boolean; halfExtent?: number }
const SPAWN_NORMAL_Y = .90;
const OBJECTIVE_NORMAL_Y = .94;
const SEARCH_RADII = [8, 16, 24, 32, 48, 64, 80, 104, 128, 160, 200, 248, 304, 368];

/** Uses ALL authored pads, never the selected roster or relocated vehicles. */
export function matchPlacementAnchors(spawns: {
  player: PlacementPoint & { yaw?: number };
  enemies: readonly (PlacementPoint & { yaw?: number })[];
}): PlacementAnchors {
  const alpha = { ...spawns.player, yaw: spawns.player.yaw ?? 0 };
  if (!spawns.enemies.length) return { alpha, bravo: { x: alpha.x, z: alpha.z + 300, yaw: Math.PI } };
  let x = 0, z = 0;
  for (const point of spawns.enemies) { x += point.x; z += point.z; }
  x /= spawns.enemies.length; z /= spawns.enemies.length;
  return { alpha, bravo: { x, z, yaw: Math.atan2(alpha.x - x, alpha.z - z) },
    deployments: { alpha: [alpha], bravo: spawns.enemies } };
}

function safeTerrainPoint(field: PlacementTerrain, x: number, z: number, normalY: number): boolean {
  if (!Number.isFinite(field.getHeightAt(x, z))) return false;
  if ((field.getWaterMaskAt?.(x, z) ?? 0) > .05) return false;
  if (field.getGroundType?.(x, z) === 'soft') return false;
  if (field.getNormalAt) return field.getNormalAt(x, z).y >= normalY;
  const dx = (field.getHeightAt(x + 1, z) - field.getHeightAt(x - 1, z)) * .5;
  const dz = (field.getHeightAt(x, z + 1) - field.getHeightAt(x, z - 1)) * .5;
  return 1 / Math.hypot(dx, dz, 1) >= normalY;
}

function footprintProbesSafe(field: PlacementTerrain, point: PlacementPoint, radius: number, normalY: number): boolean {
  // Cheap centre/cardinal rejection comes first; it never replaces the dense
  // interior or boundary checks needed to catch narrow wet/steep intrusions.
  for (let i = 0; i < 5; i++) {
    const x = point.x + (i === 1 ? radius : i === 2 ? -radius : 0);
    const z = point.z + (i === 3 ? radius : i === 4 ? -radius : 0);
    if (!safeTerrainPoint(field, x, z, normalY)) return false;
  }
  return true;
}

function placementLimit(field: PlacementTerrain, footprint: Footprint): number {
  return Math.min(footprint.halfExtent ?? 480, (field.size ?? 1024) * .5 - 24) - footprint.radius;
}

/** Sample the full disc interior at 2 m spacing, plus its exact boundary.
 * This is a bounded terrain-footprint test, not proof of global route access. */
export function placementTerrainSafe(field: PlacementTerrain, point: PlacementPoint, footprint: Footprint): boolean {
  const { radius, relief, normalY } = footprint;
  const edge = placementLimit(field, footprint);
  if (!Number.isFinite(point.x + point.z) || Math.abs(point.x) > edge || Math.abs(point.z) > edge) return false;
  if (!footprintProbesSafe(field, point, radius, normalY)) return false;
  let low = Infinity, high = -Infinity;
  for (let dz = -radius; dz <= radius; dz += 2) {
    for (let dx = -radius; dx <= radius; dx += 2) {
      if (dx * dx + dz * dz > radius * radius) continue;
      const x = point.x + dx, z = point.z + dz;
      if (!safeTerrainPoint(field, x, z, normalY)) return false;
      const y = field.getHeightAt(x, z); low = Math.min(low, y); high = Math.max(high, y);
      if (high - low > relief) return false;
    }
  }
  const count = Math.max(16, Math.ceil(2 * Math.PI * radius / 2));
  for (let i = 0; i < count; i++) {
    const angle = i / count * Math.PI * 2, x = point.x + Math.sin(angle) * radius, z = point.z + Math.cos(angle) * radius;
    if (!safeTerrainPoint(field, x, z, normalY)) return false;
    const y = field.getHeightAt(x, z); low = Math.min(low, y); high = Math.max(high, y);
    if (high - low > relief) return false;
  }
  return true;
}

function blockedByWorld(world: PlacementWorld, point: PlacementPoint, footprint: Footprint,
  scratch: CollisionRecord[]): boolean {
  const { x, z } = point, radius = footprint.radius;
  const obstacles = world.queryObstacles
    ? world.queryObstacles(x - radius, z - radius, x + radius, z + radius, scratch) : world.obstacles;
  const floor = world.heightField.getHeightAt(x, z);
  for (const obstacle of obstacles) {
    if (obstacle.crushed || obstacle.dead || (footprint.solidOnly && obstacle.crushable)) continue;
    if (obstacle.max[1] < floor - .5 || obstacle.min[1] > floor + 5) continue;
    if (x < obstacle.min[0] - radius || x > obstacle.max[0] + radius
      || z < obstacle.min[2] - radius || z > obstacle.max[2] + radius) continue;
    if (collisionFootprintContainsPoint(obstacle, x, z, radius)) return true;
  }
  return false;
}

export interface MatchPlacement {
  readonly navigation: BotNavigationGrid | null;
  readonly anchors: PlacementAnchors;
  readonly centers: PlacementAnchors;
  readonly middle: PlacementPoint;
  readonly zones: readonly PlacementPoint[];
  spawn(point: PlacementSpawn, key: string, radius?: number, explicit?: boolean,
    occupied?: readonly OccupiedPlacement[]): PlacementSpawn;
  respawn(point: PlacementSpawn, key: string, occupied: readonly OccupiedPlacement[]): PlacementSpawn | null;
  pickup(point: PlacementPoint, occupied?: readonly OccupiedPlacement[]): PlacementPoint | null;
}

/** Fail closed if the bounded search has no safe solution; never silently
 * return the known blocked/wet/steep original coordinate. */
export function createMatchPlacement(options: PlacementOptions): MatchPlacement {
  const { anchors, mode } = options;
  const reservations: Reservation[] = [], scratch: CollisionRecord[] = [];
  const explicitKeys = new Set<string>();
  const axisX = anchors.bravo.x - anchors.alpha.x, axisZ = anchors.bravo.z - anchors.alpha.z;
  const axisLength = Math.hypot(axisX, axisZ) || 1;
  const ux = axisX / axisLength, uz = axisZ / axisLength;
  const originalMiddle = { x: (anchors.alpha.x + anchors.bravo.x) * .5, z: (anchors.alpha.z + anchors.bravo.z) * .5 };
  const access = mode === 'standard' ? null : createObjectiveAccess(options, anchors);

  function acceptable(point: PlacementPoint, footprint: Footprint, key: string,
    half: number, occupied: readonly (PlacementPoint & { radius: number })[]): boolean {
    const along = (point.x - originalMiddle.x) * ux + (point.z - originalMiddle.z) * uz;
    if (half && along * half < footprint.radius + 16) return false;
    for (const other of reservations) {
      if (other.key !== key && Math.hypot(point.x - other.x, point.z - other.z) < footprint.radius + other.radius + 3) return false;
    }
    for (const other of occupied) {
      if (Math.hypot(point.x - other.x, point.z - other.z) < footprint.radius + other.radius + 1) return false;
    }
    return !blockedByWorld(options, point, footprint, scratch)
      && placementTerrainSafe(options.heightField, point, footprint)
      && (!footprint.solidOnly || !access || access.reachable(point));
  }

  function find(preferred: PlacementPoint, footprint: Footprint, key: string, half = 0,
    occupied: readonly (PlacementPoint & { radius: number })[] = []): PlacementPoint | null {
    if (acceptable(preferred, footprint, key, half, occupied)) return { x: preferred.x, z: preferred.z };
    const point = { x: 0, z: 0 };
    for (const radius of SEARCH_RADII) {
      const steps = Math.max(16, Math.ceil(radius * Math.PI * 2 / 16));
      for (let step = 0; step < steps; step++) {
        const angle = step / steps * Math.PI * 2;
        point.x = preferred.x + Math.sin(angle) * radius;
        point.z = preferred.z + Math.cos(angle) * radius;
        if (acceptable(point, footprint, key, half, occupied)) return { ...point };
      }
    }
    // Sparse local rings can miss a clearing on the opposite map edge. One
    // bounded 20 m lattice finds the nearest valid global fallback without
    // lowering terrain, water, footprint or reservation requirements.
    let best: PlacementPoint | null = null, bestDistance = Infinity;
    const limit = placementLimit(options.heightField, footprint);
    for (let z = -limit; z <= limit; z += 20) for (let x = -limit; x <= limit; x += 20) {
      const distance = (x - preferred.x) ** 2 + (z - preferred.z) ** 2;
      if (distance >= bestDistance) continue;
      point.x = x; point.z = z;
      if (!acceptable(point, footprint, key, half, occupied)) continue;
      best = { ...point }; bestDistance = distance;
    }
    return best;
  }

  function reserve(point: PlacementPoint, footprint: Footprint, key: string, half = 0): PlacementPoint {
    const found = find(point, footprint, key, half);
    if (!found) throw new Error(`No safe ${key} placement within the bounded map search`);
    reservations.push({ ...found, radius: footprint.radius, key });
    return found;
  }

  const centers = { alpha: { ...anchors.alpha }, bravo: { ...anchors.bravo } };
  if (mode === 'capture_the_flag' || mode === 'turbo_ball') {
    const radius = mode === 'turbo_ball' ? 18 : 12;
    const halfExtent = mode === 'turbo_ball' ? MATCH_MODE_ARENA_HALF_EXTENT_M : undefined;
    for (const [team, half] of [['alpha', -1], ['bravo', 1]] as const) {
      Object.assign(centers[team], reserve(anchors[team], { radius, relief: 5, normalY: OBJECTIVE_NORMAL_Y, solidOnly: true, halfExtent }, `base-${team}`, half));
    }
  }
  const middle = mode === 'turbo_ball'
    ? reserve(originalMiddle, { radius: 12, relief: 3, normalY: OBJECTIVE_NORMAL_Y, solidOnly: true, halfExtent: MATCH_MODE_ARENA_HALF_EXTENT_M }, 'kickoff')
    : originalMiddle;
  function placeZones(): PlacementPoint[] {
    const targets = MATCH_OBJECTIVE_LAYOUTS[options.mapId ?? '']?.zones
      ?? [-105, 0, 105].map(offset => ({ x: originalMiddle.x + uz * offset, z: originalMiddle.z - ux * offset }));
    const footprint = { radius: 30, relief: 7, normalY: OBJECTIVE_NORMAL_Y, solidOnly: true };
    const start = reservations.length;
    // Try each zone-order permutation before concluding that three clear
    // areas do not fit. Greedily using the centre first can strand a flank.
    for (const order of [[0, 1, 2], [2, 1, 0], [1, 0, 2], [1, 2, 0], [0, 2, 1], [2, 0, 1]]) {
      reservations.length = start;
      const placed: PlacementPoint[] = [];
      for (const index of order) {
        const key = `zone-${index + 1}`, found = find(targets[index], footprint, key);
        if (!found) break;
        placed[index] = found;
        reservations.push({ ...found, radius: footprint.radius, key });
      }
      if (reservations.length === start + 3) return placed;
    }
    throw new Error('No safe three-zone layout within the bounded map search');
  }
  const zones = mode === 'zone_control' ? placeZones() : [];

  function resolveSpawn(point: PlacementSpawn, key: string, radius: number | undefined,
    explicit: boolean, occupied: readonly OccupiedPlacement[]): PlacementSpawn | null {
    if (explicit) explicitKeys.add(key);
    const old = reservations.find(entry => entry.key === key);
    radius = radius ?? old?.radius ?? 4.5;
    const footprint = { radius, relief: 2, normalY: SPAWN_NORMAL_Y };
    const along = (point.x - originalMiddle.x) * ux + (point.z - originalMiddle.z) * uz;
    const half = Math.abs(along) > 60 ? Math.sign(along) : 0;
    const found = explicitKeys.has(key) ? point : find(point, footprint, key, half, occupied);
    if (!found) return null;
    if (old) Object.assign(old, found, { radius });
    else reservations.push({ ...found, radius, key });
    return { ...found, yaw: point.yaw };
  }

  return {
    navigation: access?.navigation ?? null,
    anchors, centers, middle, zones,
    spawn(point, key, radius, explicit = false, occupied = []) {
      const found = resolveSpawn(point, key, radius, explicit, occupied);
      if (!found) throw new Error(`No safe spawn placement for ${key}`);
      return found;
    },
    respawn: (point, key, occupied) => resolveSpawn(point, key, undefined, false, occupied),
    pickup(point, occupied = []) {
      return find(point, { radius: 7, relief: 2, normalY: SPAWN_NORMAL_Y, solidOnly: true }, 'pickup', 0, occupied);
    },
  };
}

export function placementTankRadius(spec: { dims?: { hullLengthM?: number; widthM?: number } }): number {
  return Math.max(3.5, Math.hypot((spec.dims?.hullLengthM ?? 7) * .5, (spec.dims?.widthM ?? 3.5) * .5) + .6);
}
