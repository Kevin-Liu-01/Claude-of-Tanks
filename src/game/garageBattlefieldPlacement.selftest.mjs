import assert from 'node:assert/strict';
import {
  GARAGE_BATTLEFIELD_CLEARANCE_M,
  resolveGarageBattlefieldPlacement,
} from './garageBattlefieldPlacement.ts';
import { GARAGE_VARIANTS } from './garageVariants.ts';
import { getMapConfig } from '../world/maps/index.ts';

for (const variant of GARAGE_VARIANTS.slice(1)) {
  const config = getMapConfig(variant.mapId);
  const spawn = config.spawns.player;
  assert.ok(Math.max(Math.abs(spawn.x), Math.abs(spawn.z)) <= 424,
    `${variant.mapId}: staging deployment keeps the complete 24 m apron in bounds`);
}

const placement = resolveGarageBattlefieldPlacement({
  mapId: 'desert',
  spawnPoints: { player: { pos: [68, 3, -82] } },
  heightField: {
    getHeightAt: (x, z) => 3 + x * 0.001 + z * 0.001,
    getNormalAt: () => ({ y: 0.99 }),
    getGroundType: () => 'hard',
  },
  getObstacles: () => [],
});
assert.equal(placement.source, 'player-deployment-clearance-scan');
assert.equal(placement.clear, true);
assert.equal(placement.offsetFromSpawnM, 0);
assert.equal(placement.auditedCandidateCount, 129);
assert.ok(placement.obstacleClearanceM >= GARAGE_BATTLEFIELD_CLEARANCE_M);
assert.ok(placement.cameraZ < 0, 'south deployment camera stays outside and looks into the map');

const relocated = resolveGarageBattlefieldPlacement({
  mapId: 'relocated',
  spawnPoints: { player: { pos: [0, 0, -300] } },
  heightField: {
    getHeightAt: () => 0,
    getNormalAt: () => ({ y: 1 }),
    getGroundType: () => 'hard',
  },
  getObstacles: () => [{ min: [-2, 0, -302], max: [2, 4, -298] }],
});
assert.equal(relocated.clear, true, 'scan moves off a blocked canonical spawn');
assert.equal(relocated.offsetFromSpawnM, 224,
  'ranking selects the most open audited candidate rather than the first legal one');

const blocked = resolveGarageBattlefieldPlacement({
  mapId: 'blocked',
  spawnPoints: { player: { pos: [0, 0, -300] } },
  heightField: {
    getHeightAt: () => 0,
    getNormalAt: () => ({ y: 1 }),
    getGroundType: () => 'hard',
  },
  getObstacles: () => [{ min: [-500, 0, -500], max: [500, 4, 500] }],
});
assert.equal(blocked.clear, false, 'a real obstruction cannot be hidden by the presentation');

console.log('garageBattlefieldPlacement.selftest: real deployment clearance scan passes');
