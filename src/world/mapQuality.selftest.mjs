import assert from 'node:assert/strict';
import { getMapConfig, MAP_IDS } from './maps/index.js';

const EXPANSION = [
  'frontier', 'fjord', 'delta', 'badlands',
  'monsoon', 'alpine', 'caldera', 'foundry',
];
const LEGACY = ['verdant', 'desert', 'winter', 'urban',
  'coastal', 'autumn', 'steppe', 'railyard'];
const MODERN_FAMILIES = [
  'm1a2', 't90m', 'leo2a7', 'm1a1', 't90a', 't80u', 'challenger2',
  'leclerc', 'merkava3d', 'k2', 'type99a', 'type10', 'kf51', 'ariete',
];
const CLUTTER_FAMILIES = ['barrier', 'roadsign', 'cone', 'transformer', 'cablespool'];

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

const legacyWreckFamilies = new Set();
const legacyMobileWreckFamilies = new Set();
for (const mapId of LEGACY) {
  const config = getMapConfig(mapId);
  const wrecks = config.props.tankWrecks;
  assert.equal(config.props.telegraph, true, `${mapId}: linked utility-pole network enabled`);
  assert.equal(wrecks.era, 'modern', `${mapId}: modern wreck backport`);
  assert.equal(wrecks.debris, true, `${mapId}: detached wreck debris backport`);
  assert.equal(wrecks.ids.length, wrecks.count, `${mapId}: deliberate no-repeat wreck cast`);
  wrecks.ids.forEach((id) => legacyWreckFamilies.add(id));
  wrecks.ids.slice(0, 2).forEach((id) => legacyMobileWreckFamilies.add(id));
  const clutter = config.props.inhabit.modernClutter;
  assert.equal(typeof clutter, 'object', `${mapId}: authored modern-clutter mix`);
  for (const kind of CLUTTER_FAMILIES) {
    assert.ok(clutter[kind] >= 3, `${mapId}: ${kind} family backported`);
  }
}
assert.deepEqual([...legacyWreckFamilies].sort(), [...MODERN_FAMILIES].sort(),
  'legacy maps collectively cover the complete modern wreck roster');
assert.deepEqual([...legacyMobileWreckFamilies].sort(), [...MODERN_FAMILIES].sort(),
  'two-wreck mobile budgets collectively cover the complete modern wreck roster');

console.log('mapQuality.selftest: 16 complete maps; legacy family/wreck backport passed');
