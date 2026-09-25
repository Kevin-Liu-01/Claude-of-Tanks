import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OLYMPUS_SETTLEMENT } from './marsSettlement.ts';
import { DESTRUCTIBLE_BUILDING_TYPES } from './structureKit.ts';
import { getMapConfig, MAP_IDS } from './index.ts';
import { createHeightField } from '../terrain.ts';
import { sampleObbGround } from '../propPlacement.ts';

const config = getMapConfig('mars'), hf = createHeightField(1337, config);
assert.equal(OLYMPUS_SETTLEMENT.length, 24, 'four full authored districts');
assert.equal(new Set(OLYMPUS_SETTLEMENT.map(s => s.id)).size, 24);
for (const id of MAP_IDS.filter(id => id !== 'mars')) assert.equal(getMapConfig(id).props.orbitalSettlement, undefined);
for (const site of OLYMPUS_SETTLEMENT) {
  const type = DESTRUCTIBLE_BUILDING_TYPES[site.structure];
  assert(type && type.family === 'orbital', `${site.id}: station uses aerospace structures`);
  const support = sampleObbGround(hf, site.x, site.z, type.hw, type.hl, site.yawDeg * Math.PI / 180);
  assert(support.spread < .6, `${site.id}: foundation sits on supported ground`);
  assert(!hf._noVeg(site.x, site.z));
  assert(hf._roadDist(site.x, site.z) > Math.hypot(type.hw, type.hl) + 6, `${site.id}: tank service road remains clear`);
  assert(Math.hypot(site.x - config.spawns.player.x, site.z - config.spawns.player.z) > 30);
  for (const other of OLYMPUS_SETTLEMENT) {
    if (other === site) continue;
    const b = DESTRUCTIBLE_BUILDING_TYPES[other.structure];
    assert(Math.hypot(site.x - other.x, site.z - other.z) > Math.hypot(type.hw, type.hl) * .72 + Math.hypot(b.hw, b.hl) * .72 + 1.5,
      `${site.id}/${other.id}: actual placement reservations leave separate structures`);
  }
}
for (const id of ['missioncontrol', 'greenhouse', 'ascentlander', 'rovergarage']) {
  const type = DESTRUCTIBLE_BUILDING_TYPES[id], geometry = type.build(() => .5);
  const triangles = (geometry.index?.count ?? geometry.attributes.position.count) / 3;
  assert(triangles < 2000, `${id}: bounded shared structure geometry`);
  assert(geometry.userData.structureConnectivity.parts >= 30, `${id}: detailed connected assembly`);
  assert.equal(geometry.userData.structureConnectivity.connected, geometry.userData.structureConnectivity.parts);
  const bounds = new THREE.Box3().setFromBufferAttribute(geometry.attributes.position);
  assert(Math.abs(bounds.min.y) < .01 && bounds.max.y <= type.h + .01);
  geometry.dispose();
}
console.log('marsSettlement: 24 supported, separated, road-clear placements; four connected aerospace kits; other maps unchanged');
