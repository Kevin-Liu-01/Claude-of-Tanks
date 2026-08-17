import assert from 'node:assert/strict';
import { getMapConfig, MAP_IDS } from './maps/index.js';

const EXPANSION = [
  'frontier', 'fjord', 'delta', 'badlands',
  'monsoon', 'alpine', 'caldera', 'foundry',
];

assert.equal(MAP_IDS.length, 16, 'the battlefield roster contains sixteen maps');
assert.equal(new Set(MAP_IDS).size, MAP_IDS.length, 'map ids are unique');
assert.deepEqual(MAP_IDS.slice(-8), EXPANSION, 'the eight-map expansion stays registered');

for (const mapId of MAP_IDS) {
  const config = getMapConfig(mapId);
  assert.equal(config.id, mapId, `${mapId}: config id matches registry`);
  assert.ok(config.name && config.blurb, `${mapId}: player-facing copy exists`);
  assert.ok(config.terrain && config.vegetation && config.props && config.sky,
    `${mapId}: complete biome configuration`);
  assert.equal(config.spawns.enemies.length, 7, `${mapId}: seven enemy spawn pads`);
  for (const spawn of [config.spawns.player, ...config.spawns.enemies]) {
    assert.ok(Number.isFinite(spawn.x) && Number.isFinite(spawn.z), `${mapId}: finite spawn`);
    assert.ok(Math.max(Math.abs(spawn.x), Math.abs(spawn.z)) <= 470,
      `${mapId}: spawn stays inside the playable bounds`);
  }
  assert.equal(config.shot.pos.length, 3, `${mapId}: establishing camera position`);
  assert.equal(config.shot.look.length, 3, `${mapId}: establishing camera target`);
}

for (const mapId of EXPANSION) {
  const config = getMapConfig(mapId);
  assert.ok(config.sub, `${mapId}: map-card location summary exists`);
  assert.ok(config.props.plan.length >= 14, `${mapId}: authored landmark plan is dense`);
  assert.equal(config.props.tankWrecks.era, 'modern', `${mapId}: modern wreck fleet`);
  assert.ok(config.props.tankWrecks.count >= 5, `${mapId}: multiple wreck story beats`);
  assert.equal(config.props.tankWrecks.debris, true, `${mapId}: detached debris enabled`);
  assert.ok(config.props.inhabit.modernClutter >= 18,
    `${mapId}: modern roadside and checkpoint clutter budget`);
  assert.ok(config.props.craters >= 48, `${mapId}: battlefield scarring budget`);
}

console.log('mapQuality.selftest: 16 complete maps and 8 detailed expansion biomes passed');
