// The map's air (2026-10-22): the per-map table, the tier and time gates, the seeded cards and the runtime's frame.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { MAP_IDS } from './maps/mapIds.ts';
import {
  AMBIENCE_KINDS, AMBIENCE_TIMES, MAP_AMBIENCE, ambienceCount, ambienceHash, ambienceLayersFor, ambienceTimeOf,
} from './mapAmbienceTable.ts';
import { ambienceSeeds, createMapAmbience } from './mapAmbience.ts';
import { LATE_FX_LAYER } from '../fx/layers.ts';

// every battlefield has a row of at most two layers (two draws); the Moon carries nothing
for (const id of MAP_IDS) {
  const rows = MAP_AMBIENCE[id];
  assert.ok(Array.isArray(rows), `${id} has an ambience row`);
  assert.ok(rows.length <= 2, `${id}: at most two layers`);
  for (const layer of rows) {
    assert.ok(Object.hasOwn(AMBIENCE_KINDS, layer.kind), `${id}: known kind ${layer.kind}`);
    assert.equal(layer.palette.length, 3, `${id}/${layer.kind}: three colours`);
    for (const time of layer.times ?? []) assert.ok(AMBIENCE_TIMES.includes(time), `${id}/${layer.kind}: time ${time}`);
  }
  for (const time of AMBIENCE_TIMES) assert.ok(ambienceLayersFor(id, time).length <= 2);
}
assert.equal(MAP_AMBIENCE.moon.length, 0, 'vacuum carries nothing');
assert.equal(ambienceLayersFor('nowhere', 'day').length, 0);
// the hour gates: Verdant's down flies by day, its fireflies at night
assert.deepEqual(ambienceLayersFor('verdant', 'day').map((l) => l.kind), ['fluff']);
assert.deepEqual(ambienceLayersFor('verdant', 'night').map((l) => l.kind), ['firefly']);
assert.deepEqual(ambienceLayersFor('autumn', 'sunset').map((l) => l.kind), ['leaf', 'dust']);
assert.equal(ambienceTimeOf('dusk'), 'night');
assert.equal(ambienceTimeOf('golden'), 'sunset');
assert.equal(ambienceTimeOf('morning'), 'day');
// the tiers: Ultra Low draws nothing, the full tier the authored count
const leaf = MAP_AMBIENCE.autumn[0];
assert.equal(ambienceCount(leaf, 0), 0);
assert.equal(ambienceCount(leaf, 1), AMBIENCE_KINDS.leaf.count);
assert.ok(ambienceCount(leaf, 0.4) < ambienceCount(leaf, 1));
assert.equal(ambienceCount(leaf, Number.NaN), 0);

// the seeds come from the battle seed in the ambience's own domain: same seed, same cards; never Math.random
assert.notEqual(ambienceHash(7, 1), ambienceHash(8, 1));
const a = ambienceSeeds(1234, 0, AMBIENCE_KINDS.snow, 64), b = ambienceSeeds(1234, 0, AMBIENCE_KINDS.snow, 64);
assert.deepEqual(a.seeds, b.seeds);
assert.deepEqual(a.rands, b.rands);
assert.notDeepEqual(ambienceSeeds(1235, 0, AMBIENCE_KINDS.snow, 64).seeds, a.seeds);
assert.notDeepEqual(ambienceSeeds(1234, 1, AMBIENCE_KINDS.snow, 64).seeds, a.seeds, 'each layer its own stream');
for (const v of a.seeds) assert.ok(v >= 0 && v < 1);
// a swarm shares one speed class, so it never comes apart
const swarm = ambienceSeeds(9, 0, AMBIENCE_KINDS.insect, 30);
for (let i = 0; i < 30; i += 10) for (let j = 1; j < 10; j++) assert.equal(swarm.rands[(i + j) * 4 + 3], swarm.rands[i * 4 + 3]);
for (const file of ['./mapAmbience.ts', './mapAmbienceTable.ts']) {
  assert.ok(!/Math\.random/.test(readFileSync(new URL(file, import.meta.url), 'utf8')), `${file}: no Math.random`);
}

// the runtime: one late-FX draw per layer, the tier, the toggle, a pinned clock's frame
const scene = new THREE.Scene();
let tier = 1, clock = 12.5;
const air = createMapAmbience({
  parent: scene, scene, getHeightAt: () => 4, getSunDirection: () => new THREE.Vector3(0.3, 0.6, 0.2),
  clock: () => clock, getTierScale: () => tier,
});
air.prepare(42, 'autumn', 'day');
assert.ok(air.group.parent === scene);
assert.equal(air.group.children.length, 2);
assert.equal(air.stats.draws, 2);
assert.ok(air.isActive());
for (const mesh of air.group.children) {
  assert.ok(mesh.layers.isEnabled(LATE_FX_LAYER) && !mesh.layers.isEnabled(0), 'drawn in the late-FX pass only');
  assert.equal(mesh.userData.lateFxSceneAgnostic, true);
  assert.equal(mesh.frustumCulled, false);
}
assert.equal(scene.userData.mapAmbience, air.stats);
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);
camera.position.set(100, 9, -40);
camera.updateMatrixWorld();
const renderer = { info: { render: { frame: 1 } }, getRenderTarget: () => null, domElement: { height: 1080 } };
const leafMesh = air.group.children[0];
leafMesh.onBeforeRender(renderer, scene, camera);
const u = leafMesh.material.uniforms;
assert.equal(u.uOrigin.value.x, 100 - AMBIENCE_KINDS.leaf.radiusM);
assert.equal(u.uOrigin.value.y, 4 + AMBIENCE_KINDS.leaf.bandM[0], 'the band stands on the ground under the camera');
assert.equal(u.uTime.value, 12.5);
for (const key of ['uOffset0', 'uOffset1', 'uOffset2']) {
  const o = u[key].value, box = u.uBox.value;
  assert.ok(o.x >= 0 && o.x < box.x && o.y >= 0 && o.y < box.y && o.z >= 0 && o.z < box.z, `${key} wraps into the box`);
}
const pinned = u.uOffset1.value.clone();
// the same pinned clock films the same frame; a later one drifts
renderer.info.render.frame = 2;
leafMesh.onBeforeRender(renderer, scene, camera);
assert.deepEqual(u.uOffset1.value.toArray(), pinned.toArray());
clock = 13.5; renderer.info.render.frame = 3;
leafMesh.onBeforeRender(renderer, scene, camera);
assert.notDeepEqual(u.uOffset1.value.toArray(), pinned.toArray());
// the toggle and the tier
air.setEnabled(false);
assert.equal(air.stats.draws, 0);
assert.ok(!air.isActive());
air.setEnabled(true);
tier = 0; air.refreshTier();
assert.equal(air.stats.draws, 0, 'Ultra Low draws no air');
tier = 0.4; air.refreshTier();
assert.equal(leafMesh.geometry.instanceCount, ambienceCount(MAP_AMBIENCE.autumn[0], 0.4));
air.setDensityOverride(1);
assert.equal(leafMesh.geometry.instanceCount, AMBIENCE_KINDS.leaf.count);
air.setDensityOverride(null);
// a re-prepare of the same battle keeps the cards; a new hour rebuilds; the Garage clears them
air.prepare(42, 'autumn', 'day');
assert.ok(air.group.children[0] === leafMesh);
air.prepare(42, 'verdant', 'night');
assert.deepEqual(air.stats.layers.map((l) => l.kind), ['firefly']);
air.prepare(42, 'moon', 'day');
assert.equal(air.stats.draws, 0);
air.reset();
assert.ok(air.group.parent === null);
assert.equal(scene.userData.mapAmbience, undefined);
air.dispose();
assert.throws(() => air.prepare(1, 'verdant', 'day'));

console.log('mapAmbience.selftest: 33 maps, at most two late-FX draws each, seeded cards, tier/time gates, pinned frames');
