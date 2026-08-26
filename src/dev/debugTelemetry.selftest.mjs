import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDebugTelemetryOwner } from './debugTelemetry.ts';

const scene = new THREE.Scene();
const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
mesh.castShadow = true;
mesh.receiveShadow = true;
scene.add(mesh);

const canvas = { dataset: { renderScale: '0.875' } };
const renderer = {
  userData: { outputResolution: { native: false, budgetLimited: true, outputPixels: 100 } },
  domElement: canvas,
  shadowMap: { enabled: true },
  getDrawingBufferSize(out) { return out.set(20, 10); },
  getPixelRatio() { return 1.5; },
  getContext() { throw new Error('masked'); },
};
const game = {
  phase: 'battle', mapId: 'verdant', timeS: 12,
  tanks: [{ combat: { destroyed: false } }, { combat: { destroyed: true } }],
  shells: [1, 2],
};
const world = {
  group: scene,
  mapId: 'desert',
  destructibles: new Set([1, 2, 3]),
  tankWreckSpots: [1],
  getObstacles: () => [1, 2],
  getColliders: () => [1],
  getConcealment: () => [1, 2, 3, 4],
  getLoosePropStats: () => ({ total: 8, active: 3 }),
};

const owner = createDebugTelemetryOwner({
  renderer,
  scene,
  camera: new THREE.PerspectiveCamera(),
  lighting: { getShadowTelemetry: () => ({ cascades: 4 }), update() {} },
  post: { dynScale: 0.75, perfTrim: 1, upscaler: { telemetry: () => 'native' } },
  game,
  getWorld: () => world,
  getNetworkTelemetry: () => ({
    connected: true, rttMs: 42, rttJitterMs: 3,
    estimatedSnapshotLoss: 0.05, transportBufferedBytes: 64,
  }),
  resolvePresetName: () => 'high',
  getDeviceTier: () => 'desktop',
  now: () => 100,
});

const telemetry = owner.collect();
assert.equal(telemetry.quality.buffer, '20×10');
assert.equal(telemetry.quality.gpu, 'masked GPU');
assert.equal(telemetry.simulation.map, 'desert');
assert.equal(telemetry.simulation.alive, 1);
assert.equal(telemetry.world.destructibles, 3);
assert.equal(telemetry.shadows.casters, 1);
assert.equal(telemetry.shadows.receivers, 1);
assert.equal(telemetry.network.lossPct, 5);

mesh.geometry.dispose();
mesh.material.dispose();
console.log('debugTelemetry.selftest: typed collection and scene accounting passed');
