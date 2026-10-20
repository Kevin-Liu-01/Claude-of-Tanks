// shockRingLight.selftest.mjs — (lane ac130-fx-228 r3, the blind critic's night "full-lens tan wash" through the
// gunship's 3.6x lens, on the base build as well) a blast's pressure ring is dust, not light: it takes the battle pools'
// light tint (sceneLightTint.ts) as the prints, the decals and the scars do. Under a clear day's rig it draws its own
// tan exactly as before; under the night rig it falls to the pools' dim blue instead of glowing at the daylight level.
// Measured on the real runtime: the ring a 152 mm ground burst launches, read after the same frames under each rig.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { createFx } from './effects.ts';
import { battleLightTintForRig } from './sceneLightTint.ts';

const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
globalThis.document ??= { createElement: () => createCanvas(1, 1) };

const C = (hex) => new THREE.Color(hex);
const rig = (sunI, sun, hemiI, sky, ground, fillI, fill) => ({ sunIntensity: sunI, sunColor: C(sun), hemiIntensity: hemiI,
  hemiSky: C(sky), hemiGround: C(ground), fillIntensity: fillI, fillColor: C(fill) });
// the engine's noon rig and the night rig of sceneLightTint.selftest (the moon .6, sky .6 under a navy dome, fill .3)
const DAY = rig(4.5, 0xfff1dc, 0.36, 0xaac8f5, 0x94815f, 0.66, 0xbdd2f2);
const NIGHT = rig(0.6, 0xafc3ec, 0.6, 0x3a4d68, 0x1c2230, 0.3, 0x3a4d68);
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55 / 3.6, 16 / 9, 0.5, 5000);
camera.position.set(0, 240, -90);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld(true);
const fx = createFx({ scene, camera, renderer: null, anisotropy: 1, setupShadowMaterial: () => {}, releaseShadowMaterial: () => {} },
  { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0) }, { seed: 91 });
scene.add(fx.group);
const handlers = new Map();
const bus = { on(n, f) { (handlers.get(n) ?? handlers.set(n, []).get(n)).push(f); return () => {}; }, off() {},
  emit(n, p) { for (const f of handlers.get(n) ?? []) f(p); } };
fx.bindBus(bus);

/** the visible pressure rings' colours (copied: the pool's materials are reused) after a 152 mm ground burst under `lightRig` */
function ringsUnder(lightRig, id) {
  scene.userData.lightRig = lightRig;
  bus.emit('shell:expired', { shellId: `ring-${id}`, pos: [0, 0, 0], hitTerrain: true, munition: 'howitzer', chargeKg: 20,
    caliberMm: 152, shellType: 'HE' });
  for (let i = 0; i < 3; i++) fx.update(1 / 60, [], camera, () => null);
  const rings = [];
  fx.group.traverse((o) => { if (o.isMesh && o.visible && o.geometry?.type === 'CircleGeometry' && o.material?.map) rings.push({ color: o.material.color.clone() }); });
  fx.resetAll();
  return rings;
}

const base = C(0x90887a);
const day = ringsUnder(DAY, 'day');
assert.ok(day.length >= 1, 'a 152 mm ground burst launches a pressure ring');
for (const m of day) assert.ok(Math.abs(m.color.r - base.r) < 1e-6 && Math.abs(m.color.g - base.g) < 1e-6 && Math.abs(m.color.b - base.b) < 1e-6,
  `by day the ring keeps its own tan exactly (${m.color.getHexString()})`);
const night = ringsUnder(NIGHT, 'night');
assert.ok(night.length >= 1, 'the night burst launches its ring too');
const tint = battleLightTintForRig(NIGHT, new THREE.Color());
const want = base.clone().multiply(tint);
for (const m of night) {
  assert.ok(Math.abs(m.color.r - want.r) < 1e-6 && Math.abs(m.color.g - want.g) < 1e-6 && Math.abs(m.color.b - want.b) < 1e-6,
    `at night the ring takes the pools' tint (${m.color.getHexString()} vs ${want.getHexString()})`);
  assert.ok(lum(m.color) < 0.2 * lum(base) && m.color.b > m.color.r, `at night the ring is dim and moonlit (${m.color.getHexString()})`);
}
// the next day's burst is tan again (the colour is set every frame, never left at the night's)
const again = ringsUnder(DAY, 'again');
assert.ok(again.length >= 1 && again.every((m) => m.color.getHex() === base.getHex()), 'back under the day rig, the ring is its own tan');
console.log(`shockRingLight: a 152 mm burst's pressure ring keeps its tan by day (${base.getHexString()}) and takes the night's light (${night[0].color.getHexString()}) instead of glowing in a moonlit lens`);
