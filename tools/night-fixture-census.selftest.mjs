import assert from 'node:assert/strict';
import * as THREE from 'three';
import { collectNightFixtureCensus } from './night-fixture-census.mjs';
import { DESTRUCTIBLE_BUILDING_TYPES } from '../src/world/maps/structureKit.ts';
import { prepareWorldStructureNightFixture, setWorldNightFixtureActive } from '../src/world/worldNightFixtureInstances.ts';
import { inspectNightWorldFixture } from '../src/dev/nightWorldFixtureInspection.ts';
import { inspectNightHeadlight } from '../src/dev/nightWindowInspection.ts';
import { markVehicleNightLens, prepareVehicleNightLensParts, registerVehicleNightLensMesh } from '../src/vehicles/vehicleNightLighting.ts';

const previous = globalThis.window, root = new THREE.Group(), tank = new THREE.Group();
const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 5, 10);
const geometry = DESTRUCTIBLE_BUILDING_TYPES.relaystation.build(() => .5);
const material = new THREE.MeshStandardMaterial(), relay = new THREE.InstancedMesh(geometry, material, 2);
relay.name = 'destructible-relaystation'; relay.setMatrixAt(0, new THREE.Matrix4());
relay.setMatrixAt(1, new THREE.Matrix4().makeTranslation(20, 0, 0));
prepareWorldStructureNightFixture(relay, true); setWorldNightFixtureActive(relay, 0, false); root.add(relay);
const lensGeometry = markVehicleNightLens(new THREE.BoxGeometry(.2, .2, .04), 'headlight');
prepareVehicleNightLensParts([lensGeometry]);
const lensMaterial = new THREE.MeshStandardMaterial(), lens = new THREE.Mesh(lensGeometry, lensMaterial);
lens.name = 'hullGlass'; registerVehicleNightLensMesh(lens, [lensGeometry]); tank.add(lens);
const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, .1), new THREE.MeshBasicMaterial());
wall.name = 'rendered-hull'; wall.position.z = .04; tank.add(wall);
globalThis.window = { __DEBUG: { world: { group: root, mapId: 'fixture' }, camera,
  game: { player: { visual: { root: tank } } },
  inspectNightWorldFixture: kind => inspectNightWorldFixture(root, camera.position, kind),
  inspectNightHeadlight: () => inspectNightHeadlight(tank, camera.position) } };
try {
  const result = await collectNightFixtureCensus({ moduleUrl: 'three', kind: 'relay-beacon' });
  assert(result.originalInspection); assert.notEqual(result.firstPassingRank, null);
  assert(result.rows.every(row => row.slot === 1 && row.mask === 2));
  assert.deepEqual(result.owners[0].slots.map(slot => slot.active), [0, 1]);
  assert(result.rows.some(row => row.pass && row.hit.owner === relay.name && row.hit.instanceId === 1));
  relay.visible = false;
  const hidden = await collectNightFixtureCensus({ moduleUrl: 'three', kind: 'relay-beacon' });
  assert.equal(hidden.candidateCount, 0); assert.equal(hidden.owners[0].ancestry[0].visible, false);
  const blocked = await collectNightFixtureCensus({ moduleUrl: 'three', kind: 'headlight' });
  assert.equal(blocked.originalInspection, null); assert.equal(blocked.firstPassingRank, null);
  assert(blocked.rows.every(row => row.hit.owner === 'rendered-hull' && !row.frontPass));
  assert(blocked.rows.every(row => row.hit.ancestry.every(owner => owner.visible)));
  wall.visible = false;
  const clear = await collectNightFixtureCensus({ moduleUrl: 'three', kind: 'headlight' });
  assert(clear.originalInspection); assert.notEqual(clear.firstPassingRank, null);
  assert(clear.rows.every(row => row.camera[2] > 3.9), 'reverse rays cannot move the inspection camera');
  await assert.rejects(collectNightFixtureCensus({ moduleUrl: 'three', kind: 'headlight', limit: 257 }), /1–256/);
  await assert.rejects(collectNightFixtureCensus({ moduleUrl: 'three', kind: 'glass' }), /Unsupported/);
} finally { globalThis.window = previous; }
for (const part of [geometry, lensGeometry, wall.geometry]) part.dispose();
for (const mat of [material, lensMaterial, wall.material]) mat.dispose(); relay.dispose();
console.log('night-fixture-census: bounded actual masks, active slots, visible ancestry, exterior occluders and preserved failed gates PASS');
