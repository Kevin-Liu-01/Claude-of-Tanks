import { createBotNavigationGrid, createDryNavigationView, createNavigationReachability,
  navigationReachabilityContains } from './botRoutePlanner.ts';
import { collisionFootprintContainsPoint, type CollisionRecord, type ObstacleQuery } from '../world/collision.ts';
import type { PlacementAnchors, PlacementPoint, PlacementTerrain } from './matchPlacement.ts';

interface AccessWorld {
  heightField: PlacementTerrain;
  obstacles: readonly CollisionRecord[];
  queryObstacles?: ObstacleQuery | null;
}
// A roster-independent, ordinary tracked drivetrain, not a fleet-builder import.
const ACCESS_DRIVETRAIN = { enginePowerHp: 900, weightTons: 60,
  terrainResistance: { hard: 1, medium: 1.2, soft: 1.8 } };

export function createObjectiveAccess(world: AccessWorld, anchors: PlacementAnchors) {
  const field = world.heightField;
  const navigation = createBotNavigationGrid({ heightField: field, queryObstacles: world.queryObstacles,
  // The navigation builder reads but does not mutate these records.
  getObstacles: () => world.obstacles as CollisionRecord[] });
  const scratch: CollisionRecord[] = [];
  function connectorClear(from: PlacementPoint, to: PlacementPoint): boolean {
    const distance = Math.hypot(to.x - from.x, to.z - from.z);
    const samples = Math.max(1, Math.ceil(distance / 2));
    for (let sample = 0; sample <= samples; sample++) {
      const t = sample / samples, x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t;
      if ((world.heightField.getWaterMaskAt?.(x, z) ?? 0) > .05) return false;
      if ((world.heightField.getNormalAt?.(x, z).y ?? 1) < .85) return false;
      const obstacles = world.queryObstacles ? world.queryObstacles(x - 3.5, z - 3.5, x + 3.5, z + 3.5, scratch) : world.obstacles;
      if (obstacles.some(obstacle => !obstacle.crushed && !obstacle.dead && !obstacle.crushable
        && collisionFootprintContainsPoint(obstacle, x, z, 3.5))) return false;
    }
    return true;
  }
  const dryNavigation = createDryNavigationView(navigation, {
    getHeightAt: (x, z) => field.getHeightAt(x, z),
    getWaterMaskAt: (x, z) => field.getWaterMaskAt?.(x, z) ?? 0,
  }, (x, z) => connectorClear({ x, z }, { x, z }));
  const alpha = createNavigationReachability(dryNavigation, ACCESS_DRIVETRAIN,
    anchors.deployments?.alpha ?? [anchors.alpha], connectorClear);
  const bravo = createNavigationReachability(dryNavigation, ACCESS_DRIVETRAIN,
    anchors.deployments?.bravo ?? [anchors.bravo], connectorClear);
  return { navigation, dryNavigation, alpha, bravo,
    reachable: (point: PlacementPoint) => navigationReachabilityContains(dryNavigation, alpha, point, connectorClear)
      && navigationReachabilityContains(dryNavigation, bravo, point, connectorClear) };
}
