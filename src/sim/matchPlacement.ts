/** Deterministic construction/event-time placement. No renderer, fleet or RNG owner. */
import { collisionFootprintContainsPoint, type CollisionRecord, type ObstacleQuery } from '../world/collision.ts';
import { MATCH_OBJECTIVE_LAYOUTS, MATCH_MODE_ARENA_HALF_EXTENT_M } from './matchObjectiveLayouts.ts';
import { PLAYABLE_HALF_EXTENT_M } from '../world/battlefieldBounds.ts';
import { createObjectiveAccess } from './matchPlacementAccess.ts';
import type { BotNavigationGrid } from './botRoutePlanner.ts';
import {
  createDeployment, deploymentFrame, DEPLOYMENT_CLEARED_SLOTS, DEPLOYMENT_LATTICE_M, DEPLOYMENT_SLOT_RADIUS_M,
  DEPLOYMENT_SLOT_SPACING_M, type Deployment, type DeploymentCheck, type DeploymentFrame, type DeploymentPoint,
  type DeploymentSlot, type DeploymentSpawns, type DeploymentTeam,
} from './deployment.ts';

export interface PlacementPoint { x: number; z: number }
interface PlacementSpawn extends PlacementPoint { yaw: number }
export interface PlacementTerrain {
  getHeightAt(x: number, z: number): number;
  getNormalAt?(x: number, z: number): { y: number };
  getWaterMaskAt?(x: number, z: number): number;
  getGroundType?(x: number, z: number): string;
  size?: number;
  navigationWaterPolicy?: 'avoid-liquid';
  /** Round 61: the bridge decks the dry-route proof crosses on (sim/bridgeDeckNavigation.ts). */
  readonly bridgeDecks?: readonly import('./bridgeDeckNavigation.ts').NavigationBridgeDeck[];
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
interface PlacementOptions extends PlacementWorld { anchors: PlacementAnchors; mode: string; mapId?: string; assaultLines?: readonly (PlacementPoint | null)[] | null }
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

/** The authored pads a placement's anchors carry (matchPlacementAnchors keeps the enemy pads as bravo's deployments). */
function deploymentSpawnsOf(anchors: PlacementAnchors): DeploymentSpawns {
  const pads = anchors.deployments?.bravo;
  return { player: anchors.alpha, enemies: pads && pads.length ? pads : [anchors.bravo] };
}

/** A deployment slot's ground: the spawn footprint at the fleet's largest placement radius, whole inside the playable square. */
const SLOT_FOOTPRINT: Footprint = { radius: DEPLOYMENT_SLOT_RADIUS_M, relief: 2, normalY: SPAWN_NORMAL_Y, halfExtent: PLAYABLE_HALF_EXTENT_M };

/** Own half by the placement's rule: a slot stands its radius and 16 m off the middle line, on its side. */
function deploymentSideCheck(frame: DeploymentFrame): (team: DeploymentTeam, point: PlacementPoint) => boolean {
  const { pivot, forward } = frame;
  return (team, point) => {
    // forward points from bravo's anchor toward alpha's: alpha stands on the positive side
    const toward = (point.x - pivot.x) * forward.x + (point.z - pivot.z) * forward.z;
    return (team === 'alpha' ? toward : -toward) >= SLOT_FOOTPRINT.radius + 16;
  };
}

function spacedFrom(point: PlacementPoint, held: readonly PlacementPoint[]): boolean {
  for (const other of held) if (Math.hypot(point.x - other.x, point.z - other.z) < DEPLOYMENT_SLOT_SPACING_M - 1e-6) return false;
  return true;
}

/** The ground a deployment's slots are judged on: the height field's ground reads, nothing of the world on it. */
type DeploymentGround = Pick<PlacementTerrain, 'getHeightAt' | 'getNormalAt' | 'getWaterMaskAt' | 'getGroundType' | 'size'>;

interface GroundStage { deployment: Deployment; ground: SlotGround }
type SlotGround = (team: DeploymentTeam, point: PlacementPoint) => boolean;
const terrainDeployments = new WeakMap<object, Map<string, GroundStage>>();
const clearingsByDeployment = new WeakMap<Deployment, readonly PlacementPoint[]>();

/** The slot footprint's samples in placementTerrainSafe's own arithmetic: the 2 m disc lattice, then the boundary. */
const SLOT_LATTICE: readonly (readonly [number, number])[] = (() => {
  const r = DEPLOYMENT_SLOT_RADIUS_M, out: [number, number][] = [];
  for (let dz = -r; dz <= r; dz += 2) for (let dx = -r; dx <= r; dx += 2) if (dx * dx + dz * dz <= r * r) out.push([dx, dz]);
  return out;
})();
const SLOT_BOUNDARY: readonly (readonly [number, number])[] = (() => {
  const r = DEPLOYMENT_SLOT_RADIUS_M, count = Math.max(16, Math.ceil(2 * Math.PI * r / 2)), out: [number, number][] = [];
  for (let i = 0; i < count; i++) { const angle = i / count * Math.PI * 2; out.push([Math.sin(angle) * r, Math.cos(angle) * r]); }
  return out;
})();

/**
 * The slot footprint's ground test: placementTerrainSafe's law at SLOT_FOOTPRINT (inside the map; every lattice and
 * boundary sample finite, dry, firm and under the spawn slope; the relief under 2 m), with each side's lattice samples
 * cached. The joint search seats its moved candidates on a side's 2 m lattice (alpha's: the world's; bravo's: its
 * rotation about the pivot), so the footprints one search tries share their reads, and the cheap reads (height, water,
 * ground) decide before the slope, which costs four height reads a sample. An off-lattice point (an authored pad) reads
 * directly. The deployment receipt holds it equal to placementTerrainSafe on lattice and off-lattice points.
 */
function createSlotGround(field: DeploymentGround, pivot: DeploymentPoint): SlotGround {
  const terrain = field as PlacementTerrain;
  const edge = placementLimit(terrain, SLOT_FOOTPRINT), normalY = SLOT_FOOTPRINT.normalY, relief = SLOT_FOOTPRINT.relief;
  const level = (x: number, z: number): number => {
    const y = terrain.getHeightAt(x, z);
    if (!Number.isFinite(y) || (terrain.getWaterMaskAt?.(x, z) ?? 0) > .05 || terrain.getGroundType?.(x, z) === 'soft') return NaN;
    return y;
  };
  const gentle = (x: number, z: number): boolean => {
    if (terrain.getNormalAt) return terrain.getNormalAt(x, z).y >= normalY;
    const dx = (terrain.getHeightAt(x + 1, z) - terrain.getHeightAt(x - 1, z)) * .5;
    const dz = (terrain.getHeightAt(x, z + 1) - terrain.getHeightAt(x, z - 1)) * .5;
    return 1 / Math.hypot(dx, dz, 1) >= normalY;
  };
  const levels = { alpha: new Map<number, number>(), bravo: new Map<number, number>() };
  const slopes = { alpha: new Map<number, boolean>(), bravo: new Map<number, boolean>() };
  const step = DEPLOYMENT_LATTICE_M;
  /** The point's node on the side's lattice (bravo's lattice is alpha's rotated about the pivot), or null when off it. */
  const nodeOf = (team: DeploymentTeam, point: PlacementPoint): [number, number] | null => {
    const u = team === 'alpha' ? point.x : 2 * pivot.x - point.x, v = team === 'alpha' ? point.z : 2 * pivot.z - point.z;
    const gx = Math.round(u / step), gz = Math.round(v / step);
    return Math.abs(u - gx * step) < 1e-6 && Math.abs(v - gz * step) < 1e-6 ? [gx, gz] : null;
  };
  const sign = { alpha: 1, bravo: -1 };
  return (team, point) => {
    if (!Number.isFinite(point.x + point.z) || Math.abs(point.x) > edge || Math.abs(point.z) > edge) return false;
    const node = nodeOf(team, point), s = sign[team];
    const key = (dx: number, dz: number) => node ? (node[0] + s * dx / step + 4096) * 8192 + (node[1] + s * dz / step + 4096) : 0;
    let low = Infinity, high = -Infinity;
    for (const [dx, dz] of SLOT_LATTICE) {
      let y: number | undefined;
      if (node) {
        const k = key(dx, dz);
        y = levels[team].get(k);
        if (y === undefined) levels[team].set(k, y = level(point.x + dx, point.z + dz));
      } else y = level(point.x + dx, point.z + dz);
      if (Number.isNaN(y)) return false;
      if (y < low) low = y;
      if (y > high) high = y;
      if (high - low > relief) return false;
    }
    for (const [dx, dz] of SLOT_BOUNDARY) {
      const y = level(point.x + dx, point.z + dz);
      if (Number.isNaN(y)) return false;
      if (y < low) low = y;
      if (y > high) high = y;
      if (high - low > relief) return false;
    }
    for (const [dx, dz] of SLOT_LATTICE) {
      let ok: boolean | undefined;
      if (node) {
        const k = key(dx, dz);
        ok = slopes[team].get(k);
        if (ok === undefined) slopes[team].set(k, ok = gentle(point.x + dx, point.z + dz));
      } else ok = gentle(point.x + dx, point.z + dz);
      if (!ok) return false;
    }
    for (const [dx, dz] of SLOT_BOUNDARY) if (!gentle(point.x + dx, point.z + dz)) return false;
    return true;
  };
}

/**
 * The deployment's ground stage (sim/deployment.ts): both sides' slots moved, jointly and symmetrically, onto ground a
 * slot's footprint holds (dry, firm, under 2 m of relief, inside the map, on its own half, the slot spacing apart).
 * It reads only the height field, so the world dressing keeps its clearings round these slots before any prop stands,
 * and the match stage (createMatchPlacement) starts from them. Memoized per field and authored spawns.
 */
export function terrainDeployment(field: DeploymentGround, spawns: DeploymentSpawns): Deployment {
  return groundStage(field, spawns).deployment;
}

/** The ground stage's cached slot test (the deployment receipt holds it equal to placementTerrainSafe at the slot). */
export function deploymentGroundSafe(field: DeploymentGround, spawns: DeploymentSpawns, team: DeploymentTeam,
  point: PlacementPoint): boolean {
  return groundStage(field, spawns).ground(team, point);
}

function groundStage(field: DeploymentGround, spawns: DeploymentSpawns): GroundStage {
  let byField = terrainDeployments.get(field);
  if (!byField) terrainDeployments.set(field, byField = new Map());
  const key = JSON.stringify([spawns.player.x, spawns.player.z, ...spawns.enemies.flatMap((pad) => [pad.x, pad.z])]);
  let stage = byField.get(key);
  if (!stage) {
    const frame = deploymentFrame(spawns), onSide = deploymentSideCheck(frame), ground = createSlotGround(field, frame.pivot);
    const check: DeploymentCheck = (team, point, held) => onSide(team, point) && spacedFrom(point, held) && ground(team, point);
    byField.set(key, stage = { deployment: createDeployment(frame, check), ground });
  }
  return stage;
}

/**
 * The deployment's own spawn clearings: both sides' ground-stage slots up to the 14 v 14 preset. The world dressing keeps
 * the authored pads' clearings with its own rules; round these slots it leaves out what its seeded passes would stand
 * there AFTER their draws — the trees within 26 m (vegetation.ts excludeVegetation), the understorey (its admission) and
 * snags (their hash), the scatter destructibles within 20 m + r (props.ts addDestructible's veto), the boulders within
 * 16 m (tryRock) and the rock-field formations (scenery.ts) — so everything outside them stays exactly where it was.
 * `spawns` defaults to the field's own layout.
 */
export function deploymentClearings(field: DeploymentGround & { _layout?: { spawns?: DeploymentSpawns } },
  spawns: DeploymentSpawns | undefined = field._layout?.spawns): readonly PlacementPoint[] {
  if (!spawns) throw new TypeError('deployment clearings need the authored spawns');
  if (!spawns.enemies?.length) return [];
  const deployment = terrainDeployment(field, spawns);
  const cached = clearingsByDeployment.get(deployment);
  if (cached) return cached;
  const points: PlacementPoint[] = [];
  for (const team of ['alpha', 'bravo'] as const) {
    for (const slot of deployment.slots(team, DEPLOYMENT_CLEARED_SLOTS)) points.push(Object.freeze({ x: slot.x, z: slot.z }));
  }
  const frozen = Object.freeze(points);
  clearingsByDeployment.set(deployment, frozen);
  return frozen;
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
  /** Frontline Assault lines carved into the terrain (assault-trenches worlds), else null. */
  readonly assaultLines: readonly (PlacementPoint | null)[] | null;
  /** Slot k of a side's symmetric deployment (sim/deployment.ts), on this world and clear of this mode's objectives. */
  deploymentSlot(team: DeploymentTeam, k: number): DeploymentSlot;
  /** The centroid of a side's first `count` slots: where its spawn marker stands. */
  deploymentCenter(team: DeploymentTeam, count: number): PlacementPoint;
  /** The match stage's deployment itself (receipts read its pairs and moves). */
  deployment(): Deployment;
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
    ? reserve(MATCH_OBJECTIVE_LAYOUTS[options.mapId ?? '']?.kickoff ?? originalMiddle, { radius: 12, relief: 3, normalY: OBJECTIVE_NORMAL_Y, solidOnly: true, halfExtent: MATCH_MODE_ARENA_HALF_EXTENT_M }, 'kickoff')
    : mode === 'ac130' ? reserve(originalMiddle, {radius:30,relief:7,normalY:OBJECTIVE_NORMAL_Y,solidOnly:true}, 'extraction') : originalMiddle;
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
  const zones = mode === 'zone_control' || mode === 'mars' ? placeZones() : [];

  // The deployment's match stage: the ground stage's slots, moved (jointly, symmetrically) off this world's solids and
  // clear of this mode's objective reservations, so every vehicle the placement seats stands exactly on its slot.
  const spawnsOf = deploymentSpawnsOf(anchors);
  const objectiveReservations = reservations.slice();
  let deployment: Deployment | null = null;
  const deploymentOf = (): Deployment => {
    if (deployment) return deployment;
    const stage = groundStage(options.heightField, spawnsOf), ground = stage.deployment;
    const onSide = deploymentSideCheck(ground.frame);
    const check: DeploymentCheck = (team, point, held) => {
      if (!onSide(team, point) || !spacedFrom(point, held)) return false;
      for (const other of objectiveReservations) {
        if (Math.hypot(point.x - other.x, point.z - other.z) < SLOT_FOOTPRINT.radius + other.radius + 3) return false;
      }
      return !blockedByWorld(options, point, SLOT_FOOTPRINT, scratch) && stage.ground(team, point);
    };
    return deployment = createDeployment(ground.frame, check, (k) => ground.pair(k));
  };

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
    assaultLines: options.assaultLines ?? null,
    deployment: deploymentOf,
    deploymentSlot: (team, k) => deploymentOf().slot(team, k),
    deploymentCenter(team, count) {
      const slots = deploymentOf().slots(team, Math.max(1, Math.floor(count)));
      let x = 0, z = 0;
      for (const slot of slots) { x += slot.x; z += slot.z; }
      return { x: x / slots.length, z: z / slots.length };
    },
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
