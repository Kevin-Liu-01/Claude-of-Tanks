import assert from 'node:assert/strict';
import { createAuthoritativeMatch } from '../src/sim/authoritativeMatch.js';
import { ALL_TANK_IDS, getSpec } from '../src/vehicles/specs.js';
import { MAP_IDS } from '../src/world/maps/index.js';
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

  for (let tick = 0; tick < 90 * 60 && !match.result; tick++) {
    match.step({ dt: 1 / 60, inputs: new Map() });
    if ((tick + 1) % 60 !== 0) continue;
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
    }
  }

  const mobileBots = [...maxDistance.values()].filter((distance) => distance >= 12).length;
  const worstStuck = Math.max(...maxStuckSeconds.values());
  assert.ok(mobileBots >= 4, `${mapId}: at least four of six bots must make route progress`);
  assert.ok(worstStuck <= 12, `${mapId}: deliberate-drive stall exceeded 12 s (${worstStuck})`);
  console.log(`${mapId}: mobile=${mobileBots}/6 worstStuck=${worstStuck}s result=${match.result || 'live'}`);
}

console.log('authoritativeBots.selftest: all-map route progress and stuck bounds passed');
