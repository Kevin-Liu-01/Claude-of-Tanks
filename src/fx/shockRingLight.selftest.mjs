// shockRingLight.selftest.mjs — (lane ac130-fx-228 r3, the blind critic's night "full-lens tan wash" through the
// gunship's 3.6x lens, on the base build as well; the r5 critic's "the night ring is effectively invisible") a blast's
// pressure ring is dust, not light: it takes the battle pools' light tint (sceneLightTint.ts) as the prints, the decals
// and the scars do, and while it is young and small by the fireball, the burst's own warm light. Under a clear day's rig
// it draws its own tan exactly as before at every age; at night it leaves the burst lit warm and has fallen to the
// pools' dim moonlit blue by the time it spreads wide (never the old daylight tan glowing across the lens).
// Measured on the real runtime: the ring a 152 mm ground burst launches, read at two ages under each rig.
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

/** the visible pressure rings' colours (copied: the pool's materials are reused) `frames` sixtieths after a 152 mm ground
 *  burst under `lightRig` */
function ringsUnder(lightRig, id, frames) {
  scene.userData.lightRig = lightRig;
  bus.emit('shell:expired', { shellId: `ring-${id}`, pos: [0, 0, 0], hitTerrain: true, munition: 'howitzer', chargeKg: 20,
    caliberMm: 152, shellType: 'HE' });
  for (let i = 0; i < frames; i++) fx.update(1 / 60, [], camera, () => null);
  const rings = [];
  fx.group.traverse((o) => { if (o.isMesh && o.visible && o.geometry?.type === 'CircleGeometry' && o.material?.map)
    rings.push({ color: o.material.color.clone(), scale: o.scale.x, opacity: o.material.opacity }); });
  fx.resetAll();
  return rings;
}

const base = C(0x90887a);
const same = (a, b, why) => assert.ok(Math.abs(a.r - b.r) < 1e-6 && Math.abs(a.g - b.g) < 1e-6 && Math.abs(a.b - b.b) < 1e-6,
  `${why} (${a.getHexString()} vs ${b.getHexString()})`);
// by day: its own tan at every age (the day's white tint outweighs the burst's light)
for (const frames of [3, 18]) {
  const day = ringsUnder(DAY, `day${frames}`, frames);
  assert.ok(day.length >= 1, `a 152 mm ground burst launches a pressure ring (${frames} frames)`);
  for (const m of day) same(m.color, base, `by day the ring keeps its own tan ${frames} frames in`);
}
const tint = battleLightTintForRig(NIGHT, new THREE.Color());
// at night, young and small by the fireball: lit warm by its own burst, never the full daylight tan
const young = ringsUnder(NIGHT, 'night-young', 3);
assert.ok(young.length >= 1, 'the night burst launches its ring');
for (const m of young) {
  assert.ok(m.color.r > m.color.b * 1.4, `the young night ring is lit warm by its burst (${m.color.getHexString()})`);
  assert.ok(lum(m.color) > 2 * lum(base.clone().multiply(tint)) && lum(m.color) < 0.65 * lum(base),
    `the young night ring reads (${lum(m.color).toFixed(3)}) between the moonlit dust and the daylight tan (${lum(base).toFixed(3)})`);
}
// at night, spread wide (the 3.6x lens's frame): the moonlit dust, dim and blue
const wide = ringsUnder(NIGHT, 'night-wide', 18);
assert.ok(wide.length >= 1 && wide.every((m) => m.scale > young[0].scale * 2), 'the ring has spread wide 0.3 s in');
for (const m of wide) {
  assert.ok(lum(m.color) < 0.2 * lum(base) && m.color.b > m.color.r, `the spread night ring is dim and moonlit (${m.color.getHexString()})`);
  assert.ok(lum(m.color) <= lum(base.clone().multiply(tint)) * 1.25, 'the spread night ring is (about) the pools\' moonlit tint');
}
// through a heat-imaging lens (the gunship's infrared): dust at the ground's temperature, a quarter of its opacity and
// never the burst's light (the r5 critic's "hard-edged grey arc band" in the thermal lens)
const dayYoung = ringsUnder(DAY, 'day-ref', 3);
camera.userData.thermalFlight = true; camera.userData.flightVision = 1;
const heatYoung = ringsUnder(NIGHT, 'heat-young', 3);
const heatDay = ringsUnder(DAY, 'heat-day', 3);
camera.userData.thermalFlight = false; camera.userData.flightVision = 0;
assert.ok(heatYoung.length >= 1 && heatDay.length >= 1, 'the heat lens still sees the ring launch');
for (const m of heatDay) assert.ok(m.opacity <= dayYoung[0].opacity * 0.26, `the heat lens draws the ring at a quarter of its opacity (${m.opacity.toFixed(3)} vs ${dayYoung[0].opacity.toFixed(3)})`);
for (const m of heatYoung) same(m.color, base.clone().multiply(tint), 'through the heat lens the night ring takes no burst light');
// the next day's burst is tan again (the colour is set every frame, never left at the night's)
const again = ringsUnder(DAY, 'again', 3);
assert.ok(again.length >= 1 && again.every((m) => m.color.getHex() === base.getHex()), 'back under the day rig, the ring is its own tan');
console.log(`shockRingLight: a 152 mm burst's pressure ring keeps its tan by day (${base.getHexString()}) at every age; at night it leaves the burst lit warm (${young[0].color.getHexString()}) and spreads as moonlit dust (${wide[0].color.getHexString()})`);
