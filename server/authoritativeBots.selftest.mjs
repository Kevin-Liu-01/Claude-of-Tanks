import assert from 'node:assert/strict';
import { createAuthoritativeMatch } from '../src/sim/authoritativeMatch.ts';
import { ALL_TANK_IDS, getSpec } from '../src/vehicles/specs.js';
import { MAP_IDS } from '../src/world/maps/index.ts';
import { createDedicatedWorldCollision } from './dedicatedWorldCollision.js';

const MAPS = MAP_IDS;
const SPECS = ALL_TANK_IDS
  .filter((id) => ['light', 'medium', 'heavy'].includes(getSpec(id).role))
  .slice(0, 6);
assert.equal(SPECS.length, 6, 'bot soak requires six mobile registered tanks');

for (let mapIndex = 0; mapIndex < MAPS.length; mapIndex++) {
  const mapId = MAPS[mapIndex];
  const players = SPECS.map((specId, index) => ({
    id: `bot-${mapIndex}-${index}`,
    specId,
    team: index < 3 ? 'alpha' : 'bravo',
    bot: true,
    difficulty: 'normal',
  }));
  const match = createAuthoritativeMatch({
    players,
    mapId,
    seed: 9000 + mapIndex,
    countdownS: 0,
    worldCollision: createDedicatedWorldCollision(mapId),
  });
  match.onMatchReady();
  const initial = new Map(match.entities.map((entity) => [entity.id, entity.state.pos.clone()]));
  const prior = new Map(match.entities.map((entity) => [entity.id, entity.state.pos.clone()]));
  const maxDistance = new Map(match.entities.map((entity) => [entity.id, 0]));
  const stuckSeconds = new Map(match.entities.map((entity) => [entity.id, 0]));
  const maxStuckSeconds = new Map(match.entities.map((entity) => [entity.id, 0]));
  const teamById = new Map(match.entities.map((entity) => [entity.id, entity.team]));
  let alliedRamEvents = 0;
  let yieldFrames = 0;

  for (let tick = 0; tick < 90 * 60 && !match.result; tick++) {
    match.step({ dt: 1 / 60, inputs: new Map() });
    if ((tick + 1) % 60 !== 0) continue;
    const snapshot = match.snapshot({ tick, serverTimeMs: tick * 1000 / 60 });
    for (const event of snapshot.events) {
      if (event.type === 'tank_ram' &&
          teamById.get(event.aId) === teamById.get(event.bId)) alliedRamEvents++;
    }
    match.afterSnapshotBroadcast();
    for (const entity of match.entities) {
      const distance = entity.state.pos.distanceTo(initial.get(entity.id));
      maxDistance.set(entity.id, Math.max(maxDistance.get(entity.id), distance));
      const moved = entity.state.pos.distanceTo(prior.get(entity.id));
      const driving = Math.abs(entity.input.throttle || 0) > 0.35 && !entity.combat.destroyed;
      const stuck = driving && moved < 0.35 ? stuckSeconds.get(entity.id) + 1 : 0;
      stuckSeconds.set(entity.id, stuck);
      maxStuckSeconds.set(entity.id, Math.max(maxStuckSeconds.get(entity.id), stuck));
      prior.get(entity.id).copy(entity.state.pos);
      assert.ok(Number.isFinite(entity.state.pos.x) && Number.isFinite(entity.state.pos.z));
      assert.ok(Math.abs(entity.state.pos.x) <= 510 && Math.abs(entity.state.pos.z) <= 510);
      if (entity.aiCtl?.debugInfo().allyYielding) yieldFrames++;
    }
  }

  const mobileBots = [...maxDistance.values()].filter((distance) => distance >= 12).length;
  const worstStuck = Math.max(...maxStuckSeconds.values());
  assert.ok(mobileBots >= 4, `${mapId}: at least four of six bots must make route progress`);
  assert.ok(worstStuck <= 12, `${mapId}: deliberate-drive stall exceeded 12 s (${worstStuck})`);
  assert.equal(alliedRamEvents, 0, `${mapId}: teammate contact must never become a damaging ram`);
  console.log(`${mapId}: mobile=${mobileBots}/6 worstStuck=${worstStuck}s allyRams=0 yields=${yieldFrames} result=${match.result || 'live'}`);
}

// Live close-contact calibration: four normal bots drive, turn, fire physical
// shells and damage one another through the authoritative runtime. This is a
// real moving battle sample rather than a mathematical dispersion mock.
let calibrationShots = 0;
let calibrationHits = 0;
for (let sample = 0; sample < 8; sample++) {
  const players = [
    { id: 'a0', specId: 'm1a2', team: 'alpha', bot: true, difficulty: 'normal', spawn: { x: -28, z: -125, yaw: 0 } },
    { id: 'a1', specId: 'leo2a7', team: 'alpha', bot: true, difficulty: 'normal', spawn: { x: 28, z: -125, yaw: 0 } },
    { id: 'b0', specId: 't90m', team: 'bravo', bot: true, difficulty: 'normal', spawn: { x: -28, z: 125, yaw: Math.PI } },
    { id: 'b1', specId: 'm1a2', team: 'bravo', bot: true, difficulty: 'normal', spawn: { x: 28, z: 125, yaw: Math.PI } },
  ];
  const match = createAuthoritativeMatch({
    players,
    mapId: 'verdant',
    seed: 42000 + sample * 97,
    countdownS: 0,
    worldCollision: createDedicatedWorldCollision('verdant'),
  });
  match.onMatchReady();
  for (let tick = 0; tick < 75 * 60 && !match.result; tick++) {
    match.step({ dt: 1 / 60, inputs: new Map() });
    if ((tick + 1) % 15 !== 0) continue;
    const snapshot = match.snapshot({ tick, serverTimeMs: tick * 1000 / 60 });
    for (const event of snapshot.events) {
      if (event.type === 'shell_fired') calibrationShots++;
      if (event.type === 'shell_hit') calibrationHits++;
    }
    match.afterSnapshotBroadcast();
  }
}
const movingHitRate = calibrationHits / Math.max(1, calibrationShots);
assert.ok(calibrationShots >= 50,
  `live moving-battle aim sample is meaningful (${calibrationShots} shots)`);
assert.ok(movingHitRate >= 0.12 && movingHitRate <= 0.64,
  `moving-battle hit rate stays useful but non-robotic (${(movingHitRate * 100).toFixed(1)}%)`);
console.log(`authoritativeBots.selftest: route/ally/aim gates passed; live moving-battle hit rate ${(movingHitRate * 100).toFixed(1)}% (${calibrationHits}/${calibrationShots})`);
