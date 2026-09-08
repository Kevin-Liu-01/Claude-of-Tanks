import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import '../vehicles/tankFactory.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { createHeightField } from '../world/terrain.ts';
import { MAP_IDS, getMapConfig } from '../world/maps/index.ts';
import { ALL_TANK_IDS, getSpec } from '../vehicles/specs.ts';
import { tankContactRect } from './tankContactShape.ts';

const roster = ['t84', 'jpz_e100', 'm1a2', 'k2', 't95', 'jpz_e100', 'leclerc'];
const players = ['alpha', 'bravo'].flatMap(team => roster.map((specId, index) => ({ id: `${team}-${index}`, team, specId })));
function make(field, records = players) {
  return createAuthoritativeMatch({ players: records, mapId: 'reservoir', countdownS: 0, worldCollision: { heightField: field } });
}
function rows(match) {
  return match.entities.map(entity => ({ id: entity.id, pos: entity.state.pos.toArray(), yaw: entity.state.yaw }));
}

// Unconfigured layouts must preserve the exact existing authored deployment,
// including canonical thirty-step terrain settling, not just raw nominal Y.
for (const mapId of MAP_IDS) {
  const field = createHeightField(1337, getMapConfig(mapId)), pads = field._layout.spawns;
  const nominal = players.map((record, index) => {
    const slot = index % 7, pad = record.team === 'alpha' ? pads.player : pads.enemies[slot];
    return { ...record, spawn: record.team === 'alpha'
      ? { x: pad.x + (slot % 4 - 1.5) * 8, z: pad.z - Math.floor(slot / 4) * 10, yaw: pad.yaw }
      : pad };
  });
  // An integrated opt-in map is tested separately below. Default maps retain
  // this old-formula guard permanently; do not replace it with current output.
  if (!pads.player.formation) assert.deepEqual(rows(make(field)), rows(make(field, nominal)), `${mapId}: default formation unchanged`);
}

const up = new Vector3(0, 1, 0);
const template = createHeightField(1337, getMapConfig('reservoir'));
// Any mixed row pair must fit, including asymmetric contact center offsets.
const rects = ALL_TANK_IDS.map(id => tankContactRect(getSpec(id)));
const frontExtent = Math.max(...rects.map(rect => rect.centerZ + rect.halfLength));
const rearExtent = Math.max(...rects.map(rect => rect.halfLength - rect.centerZ));
const rightExtent = Math.max(...rects.map(rect => rect.centerX + rect.halfWidth));
const leftExtent = Math.max(...rects.map(rect => rect.halfWidth - rect.centerX));
assert.ok(13 - frontExtent - rearExtent >= .5, '13m facing rows retain real full-fleet mixed-hull clearance');
assert.ok(8 - rightExtent - leftExtent >= .5, '8m columns retain real full-fleet mixed-hull clearance');
for (const yaw of [0, Math.PI / 2, -Math.PI / 2, Math.PI, .31, -.77]) {
  const field = { ...template, getHeightAt: () => 0, getHeightAtFast: () => 0,
    getNormalAt: () => up, getWaterMaskAt: () => 0, getGroundType: () => 'hard',
    _layout: { ...template._layout, spawns: { ...template._layout.spawns,
      player: { x: 20, z: -30, yaw, formation: { columnSpacingM: 8, rowSpacingM: 13 } } } } };
  const deployed = make(field);
  for (let index = 0; index < 7; index++) {
    const state = deployed.entities[index].state, dx = state.pos.x - 20, dz = state.pos.z + 30;
    assert.ok(Math.abs(dx * Math.cos(yaw) - dz * Math.sin(yaw) - (index % 4 - 1.5) * 8) < 1e-10, 'columns follow tank right');
    assert.ok(Math.abs(dx * Math.sin(yaw) + dz * Math.cos(yaw) + Math.floor(index / 4) * 13) < 1e-10, 'rows follow tank backward');
  }
  const explicit = players.map(record => ({ ...record, spawn: { x: 70, z: 80, yaw: .2 } }));
  assert.ok(rows(make(field, explicit)).every(row => row.pos[0] === 70 && row.pos[2] === 80 && row.yaw === .2), 'explicit placements precede the formation policy');
  const unconfigured = { ...field, _layout: { ...field._layout, spawns: { ...field._layout.spawns, player: { x: 20, z: -30, yaw } } } };
  assert.deepEqual(rows(deployed).slice(7), rows(make(unconfigured)).slice(7), 'Bravo authored pads unchanged');
  for (const formation of [{ columnSpacingM: 0, rowSpacingM: 13 }, { columnSpacingM: 8, rowSpacingM: NaN }, { columnSpacingM: Infinity, rowSpacingM: 13 }]) {
    const bad = { ...field, _layout: { ...field._layout, spawns: { ...field._layout.spawns,
      player: { ...field._layout.spawns.player, formation } } } };
    assert.throws(() => make(bad), /finite and positive/, 'malformed opt-in spacing fails explicitly');
  }
}
console.log('formationPlacement.selftest: default-map settlement, six facing orientations, explicit spawns, Bravo, and malformed policy passed');
