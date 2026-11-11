// Round 2 (2026-11-03 critic U31, Q15): the killcam's suppression hides the battle FX runtime's visuals (fx/effects.ts)
// by one switch it alone writes, the veil every visual is made under; it never rewrites a subsystem's own visibility.
// Round one hid each child of the group every frame and recorded what it hid, so an owner's hide during the suppression
// read as the suppression's own: the release showed it again. The case the critic named, on the real runtime: the
// AC-130's lens guns, posed while the camera rides the gimbal lens and hidden once when a killcam takes the camera off
// it, came back over the killcam's end. Asserted:
//  - the suppression hides every visual (by an ancestor) and keeps the pooled lights in the scene (the light count);
//  - an owner's one-time hide during the suppression stands at the release (the lens guns), and its show comes back;
//  - the suppression writes no subsystem's own flag (a child under the visuals sees no write from it).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { createFx } from './effects.ts';

const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
globalThis.document ??= { createElement: () => createCanvas(1, 1) };

const ORBIT = new THREE.Vector3(0, 240, 90), AIM = new THREE.Vector3(0, 0, 0);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1.6, 0.5, 4000);
const onLens = () => { camera.position.set(ORBIT.x, ORBIT.y + 0.12, ORBIT.z); camera.lookAt(AIM); camera.updateMatrixWorld(true); };
const offLens = () => { camera.position.set(60, 8, 220); camera.lookAt(ORBIT); camera.updateMatrixWorld(true); };
onLens();
Object.assign(camera.userData, { thermalFlight: true, aerialPilotId: null, flightVision: 0, sensorVision: 0 });
const gunship = { id: 'pilot', team: 'alpha', aerial: { kind: 'gunship', active: true, x: ORBIT.x, y: ORBIT.y, z: ORBIT.z },
  state: { pos: ORBIT.clone(), yaw: 0 }, visual: { root: new THREE.Group() }, spec: { id: 'm1a1_abrams_hc', nation: 'USA', gun: { caliberMm: 120, shells: [] } } };
const fx = createFx({ scene, camera, renderer: null, anisotropy: 1, setupShadowMaterial: () => {}, releaseShadowMaterial: () => {} },
  { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0) },
  { seed: 3, resolveEntity: (id) => (id === 'pilot' ? gunship : null), auxiliaryEntities: () => [gunship] });
scene.add(fx.group);
fx.bindBus({ on() { return () => {}; }, off() {}, emit() {} });
const subject = (id) => (id === 'pilot' ? gunship : null);
const frame = (shells = []) => fx.update(1 / 60, shells, camera, subject);
/** drawn: it and every ancestor up to the scene visible */
const drawn = (o) => { for (let n = o; n && n !== scene; n = n.parent) if (!n.visible) return false; return true; };

frame();
for (let i = 0; i < 50 && !fx.group.getObjectByName('AC-130 lens guns'); i++) await new Promise((r) => setTimeout(r, 10));
frame();
const guns = fx.group.getObjectByName('AC-130 lens guns');
assert.ok(guns, 'the gimbal lens loads the guns (from the airframe\'s chunk)');
assert.equal(drawn(guns), true, 'posed on the lens');
const lights = [];
fx.group.traverse((o) => { if (o.isPointLight) lights.push(o); });
assert.equal(lights.length, 2, 'the runtime\'s two pooled lights');

// a child the runtime's visuals live beside, whose owner (the test) writes its flag: every write counted
const home = guns.parent;
const owned = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
owned.name = 'owned-child';
let shown = true;
const writes = [];
Object.defineProperty(owned, 'visible', { configurable: true, get: () => shown, set: (v) => { writes.push(v); shown = v; } });
home.add(owned);

// ---- the killcam begins on the lens, then takes the camera off it ----
fx.setReplaySuppressed(true);
assert.equal(drawn(guns), false, 'the suppression hides the lens guns');
assert.equal(drawn(owned), false, 'and every visual beside them');
assert.ok(lights.every(drawn), 'the pooled lights stay in the scene (the light count keeps the programs)');
offLens();
for (let i = 0; i < 4; i++) frame();
assert.equal(guns.visible, false, 'the camera off the lens: the lens guns\' own hide');
writes.length = 0;
owned.visible = false; // its owner empties it, once, during the suppression
for (let i = 0; i < 4; i++) frame();
assert.deepEqual(writes, [false], `the suppression writes no subsystem's own flag (${JSON.stringify(writes)})`);
fx.setReplaySuppressed(false);
assert.equal(drawn(guns), false, 'the release leaves the lens guns hidden: the killcam left the lens');
assert.equal(drawn(owned), false, 'an owner\'s hide during the suppression stands');
assert.deepEqual(writes, [false], 'and the release writes none either');
assert.ok(lights.every(drawn));

// ---- back on the lens after the killcam: the owners show their own ----
onLens();
// (the runtime looks for the aircraft the camera rides at most every 30 frames while it rides none)
for (let i = 0; i < 40 && !drawn(guns); i++) frame();
assert.equal(drawn(guns), true, 'the lens guns come back with the lens');
owned.visible = true;
fx.setReplaySuppressed(true);
assert.equal(drawn(owned), false);
fx.resetAll();
assert.equal(drawn(owned), true, 'a reset lifts the suppression: its owner\'s show stands');
home.remove(owned);
console.log('replayVeil.selftest: the killcam\'s suppression hides the visuals by one switch, keeps the lights, and leaves every owner\'s own visibility standing (the lens guns)');
