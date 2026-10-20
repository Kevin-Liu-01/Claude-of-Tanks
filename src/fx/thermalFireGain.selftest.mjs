// thermalFireGain.selftest.mjs — (lane ac130-fx-228 r3, the r5 blind critic's MAJOR "the 152 mm burst has essentially no
// hot signature" in the gunship's infrared lens) the heat lens images the HDR luminance over ~1.55-3.1 (engine/post.ts
// thermalHeat) and the media's fire is white-hot only on its first frame, so its cooling orange heart read cold a frame
// later. Under a heat-imaging camera (infrared or thermal: the gunship's lens, a drone's or a scope's sensor) the volume
// media's fire emission is THERMAL_FIRE_GAIN brighter; daylight, the image intensifier and every ground camera unchanged.
// Measured on the real runtime: the media's own emission uniform after the same 152 mm burst, seen by each camera.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { createFx } from './effects.ts';

const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
globalThis.document ??= { createElement: () => createCanvas(1, 1) };

const gain = Number(readFileSync(new URL('./effects.ts', import.meta.url), 'utf8').match(/^const THERMAL_FIRE_GAIN = ([0-9.]+);/m)?.[1]);
assert.ok(gain > 1, 'effects.ts keeps THERMAL_FIRE_GAIN');

/** the media's fire emission gain (uGrade.y) after a 152 mm ground burst, seen by a camera with `userData` */
function emissionFor(userData) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55 / 3.6, 16 / 9, 0.5, 5000);
  camera.position.set(0, 240, -90);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  Object.assign(camera.userData, userData);
  const fx = createFx({ scene, camera, renderer: null, anisotropy: 1, setupShadowMaterial: () => {}, releaseShadowMaterial: () => {} },
    { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0) }, { seed: 41 });
  scene.add(fx.group);
  const handlers = new Map();
  const bus = { on(n, f) { (handlers.get(n) ?? handlers.set(n, []).get(n)).push(f); return () => {}; }, off() {},
    emit(n, p) { for (const f of handlers.get(n) ?? []) f(p); } };
  fx.bindBus(bus);
  bus.emit('shell:expired', { shellId: 'heat-1', pos: [0, 0, 0], hitTerrain: true, munition: 'howitzer', chargeKg: 20,
    caliberMm: 152, shellType: 'HE' });
  for (let i = 0; i < 4; i++) fx.update(1 / 60, [], camera, () => null);
  const media = fx.group.getObjectByName('fx-volume-media');
  assert.ok(media, 'the burst draws the volume media');
  let k = null;
  media.traverse((o) => { if (k == null && o.material?.uniforms?.uGrade) k = o.material.uniforms.uGrade.value.y; });
  assert.ok(Number.isFinite(k), 'the media carry their emission uniform');
  fx.resetAll();
  return k;
}

const ground = emissionFor({});
const daylightLens = emissionFor({ thermalFlight: true, flightVision: 0 });
const infraredLens = emissionFor({ thermalFlight: true, flightVision: 1 });
const thermalLens = emissionFor({ thermalFlight: true, flightVision: 2 });
const defaultLens = emissionFor({ thermalFlight: true });
const intensifier = emissionFor({ thermalFlight: true, flightVision: 3 });
const sensor = emissionFor({ sensorVision: 1 });
assert.ok(ground > 0, 'a ground camera sees the fire at its own emission');
for (const [name, k] of [['the gunship lens in daylight', daylightLens], ['the image intensifier', intensifier]]) {
  assert.equal(k, ground, `${name} sees the fire as a ground camera does`);
}
for (const [name, k] of [['the infrared lens', infraredLens], ['the thermal lens', thermalLens], ['the lens\'s default (infrared)', defaultLens],
  ['a sensor imaging heat', sensor]]) {
  assert.ok(Math.abs(k - ground * gain) < 1e-9, `${name} sees the fire ${gain}x brighter (${k} vs ${ground})`);
}
console.log(`thermalFireGain: a heat-imaging lens sees the media's fire ${gain}x brighter (its cooling heart stays hot); daylight, the intensifier and the ground unchanged`);
