import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readPhaseEnvironment } from './phase-environment-receipt.mjs';

const array = values => ({ toArray: () => [...values] });
const debug = {
  scene: {}, game: { battleCount: 1 }, world: { mapId: 'verdant' },
  battleAtmosphere: { current: { weather: { timeOfDay: 'day', condition: 'clear' } } },
  renderer: {
    getContext: () => ({ getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }),
      getParameter: () => 'ANGLE (Apple, Apple M5 Max)', isContextLost: () => false }),
    getPixelRatio: () => 1,
    domElement: { width: 1280, height: 577, dataset: { postAa: 'smaa-high+fsr1' } },
  },
  quality: { resolvePresetName: () => 'high' }, post: { dynScale: 1, perfTrim: 0 },
  camera: { position: array([1, 2, 3]), quaternion: array([0, 0, 0, 1]), fov: 55, near: .5, far: 4000 },
};
const context = vm.createContext({ window: { __DEBUG: debug } });
const read = () => JSON.parse(vm.runInContext(`JSON.stringify((${readPhaseEnvironment.toString()})())`, context));
const oldBuild = read();
assert.equal(oldBuild.grassWork, null, 'preserved builds without streaming telemetry remain readable');
let grassReads = 0;
const grassState = { built: 12, total: 64, visiblePending: 2, disposed: false };
debug.world.getGrassWorkState = () => { grassReads++; return grassState; };
const streaming = read();
assert.equal(grassReads, 1, 'a checkpoint only reads progress once, without draining work');
assert.deepEqual(streaming.grassWork, grassState);
grassState.built++;
assert.equal(streaming.grassWork.built, 12, 'receipt does not retain mutable progress state');
assert.equal(oldBuild.nightLighting.available, false);
assert.equal(oldBuild.nightLighting.attached, false);
assert.deepEqual(oldBuild.graphics.canvas, [1280, 577]);
assert.deepEqual(oldBuild.camera.position, [1, 2, 3]);
debug.nightLighting = { current: { group: { parent: debug.scene }, emitterCount: 4,
  lights: [{ type: 'SpotLight', intensity: 80, castShadow: false }] } };
debug.battleAtmosphere.current.weather.timeOfDay = 'night';
const night = read();
assert.equal(night.weather.timeOfDay, 'night');
assert.equal(night.nightLighting.attached, true);
assert.equal(night.nightLighting.emitters, 4);
debug.nightLighting.current.group.parent = null;
debug.nightLighting.current.emitterCount = 0;
debug.battleAtmosphere.current = null;
assert.equal(read().nightLighting.attached, false);
assert.equal(read().weather, null);
assert.equal(night.nightLighting.attached, true, 'Receipt must not retain mutable runtime owners');
console.log('phase-environment-receipt selftest passed');
