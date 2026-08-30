import type { CollisionRecord } from '../world/collision.ts';

export const GARAGE_BATTLEFIELD_CLEARANCE_M = 24;
const GARAGE_BATTLEFIELD_MAX_CENTER_M = 424;

interface GaragePlacementHeightField {
  getHeightAt(x: number, z: number): number;
  getNormalAt(x: number, z: number): { y: number };
  getGroundType(x: number, z: number): string;
}

export interface GaragePlacementWorld {
  mapId: string;
  heightField: GaragePlacementHeightField;
  spawnPoints: {
    player: { pos: readonly [number, number, number]; yaw?: number };
  };
  getObstacles(): CollisionRecord[];
}

export interface GarageBattlefieldPlacement {
  mapId: string;
  x: number;
  y: number;
  z: number;
  cameraX: number;
  cameraZ: number;
  obstacleClearanceM: number;
  reliefM: number;
  minNormalY: number;
  offsetFromSpawnM: number;
  auditedCandidateCount: number;
  source: 'player-deployment-clearance-scan';
  clear: boolean;
}

const TERRAIN_PROBES = Object.freeze([
  [0, 0], [-18, 0], [18, 0], [0, -18], [0, 18],
  [-14, -14], [14, -14], [-14, 14], [14, 14],
] as const);

function distanceToObstacle(x: number, z: number, obstacle: CollisionRecord): number {
  const dx = Math.max(obstacle.min[0] - x, 0, x - obstacle.max[0]);
  const dz = Math.max(obstacle.min[2] - z, 0, z - obstacle.max[2]);
  return Math.hypot(dx, dz);
}

interface AuditedCandidate {
  x: number;
  y: number;
  z: number;
  obstacleClearanceM: number;
  reliefM: number;
  minNormalY: number;
  clear: boolean;
}

function auditCandidate(
  world: GaragePlacementWorld,
  obstacles: CollisionRecord[],
  x: number,
  z: number,
): AuditedCandidate {
  const heights: number[] = [];
  let minNormalY = 1;
  let hardGround = true;
  for (const [dx, dz] of TERRAIN_PROBES) {
    heights.push(world.heightField.getHeightAt(x + dx, z + dz));
    minNormalY = Math.min(minNormalY, world.heightField.getNormalAt(x + dx, z + dz).y);
    hardGround &&= world.heightField.getGroundType(x + dx, z + dz) !== 'soft';
  }
  const reliefM = Math.max(...heights) - Math.min(...heights);
  let obstacleClearanceM = Infinity;
  for (const obstacle of obstacles) {
    if (obstacle.dead) continue;
    obstacleClearanceM = Math.min(obstacleClearanceM, distanceToObstacle(x, z, obstacle));
  }
  const clear = Math.max(Math.abs(x), Math.abs(z)) <= GARAGE_BATTLEFIELD_MAX_CENTER_M
    && hardGround
    && minNormalY >= 0.86
    && reliefM <= 5
    && obstacleClearanceM >= GARAGE_BATTLEFIELD_CLEARANCE_M;
  return { x, y: heights[0], z, obstacleClearanceM, reliefM, minNormalY, clear };
}

/**
 * Seat the outdoor Garage inside the real battlefield's authored player
 * deployment. The canonical spawn is preferred, followed by deterministic
 * nearby rings; rugged maps fall back to a bounded map-wide grid. This handles
 * authored spawn-side props without inventing a proxy scene or hiding
 * obstacles. Every candidate is measured against the fully built map.
 */
export function resolveGarageBattlefieldPlacement(
  world: GaragePlacementWorld,
): GarageBattlefieldPlacement {
  const [spawnX, , spawnZ] = world.spawnPoints.player.pos;
  const spawnLength = Math.hypot(spawnX, spawnZ) || 1;
  const inwardX = -spawnX / spawnLength;
  const inwardZ = -spawnZ / spawnLength;
  const lateralX = -inwardZ;
  const lateralZ = inwardX;
  const offsets: Array<readonly [number, number]> = [[0, 0]];
  const directions = Array.from({ length: 16 }, (_, index) => {
    const angle = (index / 16) * Math.PI * 2;
    return [Math.cos(angle), Math.sin(angle)] as const;
  });
  for (const radius of [28, 56, 84, 112, 140, 168, 196, 224]) {
    for (const [di, dl] of directions) offsets.push([di * radius, dl * radius]);
  }
  const obstacles = world.getObstacles();
  const candidates = offsets.map(([inward, lateral]) => auditCandidate(
    world,
    obstacles,
    spawnX + inwardX * inward + lateralX * lateral,
    spawnZ + inwardZ * inward + lateralZ * lateral,
  ));
  let clearCandidates = candidates.filter((candidate) => candidate.clear);
  // A few deliberately rugged maps have no showroom-sized clearing near the
  // deployment. Only then, scan a coarse bounded grid across the real map;
  // this is a one-time covered Garage transition, not frame-loop work.
  if (!clearCandidates.length) {
    for (let gridZ = -400; gridZ <= 400; gridZ += 32) {
      for (let gridX = -400; gridX <= 400; gridX += 32) {
        candidates.push(auditCandidate(world, obstacles, gridX, gridZ));
      }
    }
    clearCandidates = candidates.filter((candidate) => candidate.clear);
  }
  const candidateScore = (candidate: AuditedCandidate) => {
    const openness = Math.min(candidate.obstacleClearanceM, 200);
    const distance = Math.hypot(candidate.x - spawnX, candidate.z - spawnZ);
    return openness - candidate.reliefM * 4 - distance * 0.02;
  };
  const selected = clearCandidates.reduce<AuditedCandidate | null>(
    (best, candidate) => !best || candidateScore(candidate) > candidateScore(best)
      ? candidate : best,
    null,
  ) ?? candidates[0];
  const { x, y, z, obstacleClearanceM, reliefM, minNormalY, clear } = selected;

  // Put the camera just outside the deployment and look through the vehicle
  // into the battlefield. A fixed +X/+Z camera aimed out of south-edge maps
  // was the reason the real environment previously read like an empty wall.
  const outwardLength = Math.hypot(x, z) || 1;
  const outwardX = x / outwardLength;
  const outwardZ = z / outwardLength;
  const quarterTurn = 0.48;
  const cameraX = outwardX * Math.cos(quarterTurn) - outwardZ * Math.sin(quarterTurn);
  const cameraZ = outwardX * Math.sin(quarterTurn) + outwardZ * Math.cos(quarterTurn);
  return Object.freeze({
    mapId: world.mapId,
    x,
    y,
    z,
    cameraX,
    cameraZ,
    obstacleClearanceM: Number.isFinite(obstacleClearanceM)
      ? +obstacleClearanceM.toFixed(2) : 999,
    reliefM: +reliefM.toFixed(2),
    minNormalY: +minNormalY.toFixed(3),
    offsetFromSpawnM: +Math.hypot(x - spawnX, z - spawnZ).toFixed(2),
    auditedCandidateCount: candidates.length,
    source: 'player-deployment-clearance-scan',
    clear,
  });
}
