// thermalGroundAndEmbers.selftest.mjs — (ac130-fx-228 follow-up, the coordinator) two things a 152 mm burst leaves behind:
//  1. the heat lens: "a 152 mm impact keeps a hot ground signature that fades over 10-20 s" — the heavy shell's crater
//     mark (the rayed kind) emits CRATER_HEAT_PEAK x exp(-age / CRATER_HEAT_S) on its pit and scorch halo under a
//     heat-imaging camera only (craterMarks uHeatView, set by effects from the camera each frame); the grade images
//     luminance over ~1.55, so the ground reads hot for 10-20 s; no other lens evaluates it, no other mark kind has it.
//  2. the night: "the night 152 mm smoke column holds its height for about 4 s ... light it so it reads" — the gunship
//     class's heavy bursts (the starburst on the ground, a hull burst of 8 kg and up) lay one ember light (volumeMedia
//     ember: its own two slots, the night level only, slow to fade) on their column; every other burst lays none. A
//     heat-imaging lens sees no ember (its blind critic: the lens's fire gain on the ember light veiled the target at night).
// Read on the real runtime (createFx) and through a recording blast context.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createFx } from './effects.ts';
import { CRATER_HEAT_PEAK, CRATER_HEAT_S, markKindFor } from './craterMarks.ts';
import { groundBurst, plateBurst } from './blastRecipes.ts';

const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
globalThis.document ??= { createElement: () => createCanvas(1, 1) };

// ---- 1. the hot ground ----
assert.equal(markKindFor('howitzer', true), 'rayed'); assert.equal(markKindFor('missile', true), 'rayed');
// the grade's heat threshold (engine/post.ts thermalHeat: smoothstep(1.55, 3.1, luminance)); the pit's own light is ~0.1
const hotFor = Math.log(CRATER_HEAT_PEAK / 1.55) * CRATER_HEAT_S, whiteFor = Math.log(CRATER_HEAT_PEAK / 3.1) * CRATER_HEAT_S;
assert.ok(hotFor >= 10 && hotFor <= 20, `the ground reads hot for ${hotFor.toFixed(1)} s (10-20 s)`);
assert.ok(whiteFor >= 3 && whiteFor < hotFor, `white-hot for ${whiteFor.toFixed(1)} s first`);
const craterSrc = readFileSync(new URL('./craterMarks.ts', import.meta.url), 'utf8');
assert.match(craterSrc, /if \( uHeatView > 0\.5 && kind > 3\.5 && kind < 4\.5 \) \{\s*col \+= vec3\( \$\{CRATER_HEAT_PEAK\.toFixed\(2\)\} \) \* exp\( -age \/ \$\{CRATER_HEAT_S\.toFixed\(2\)\} \)/,
  'only the rayed kind, only under the heat lens, by its age');

function runtime(userData, night = false) {
  const scene = new THREE.Scene();
  if (night) scene.userData.lightRig = { sunIntensity: 0.6 };
  const camera = new THREE.PerspectiveCamera(55 / 3.6, 16 / 9, 0.5, 5000);
  camera.position.set(0, 240, -90); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  Object.assign(camera.userData, userData);
  const fx = createFx({ scene, camera, renderer: null, anisotropy: 1, setupShadowMaterial: () => {}, releaseShadowMaterial: () => {} },
    { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0) }, { seed: 3 });
  scene.add(fx.group);
  const handlers = new Map();
  const bus = { on(n, f) { (handlers.get(n) ?? handlers.set(n, []).get(n)).push(f); return () => {}; }, off() {},
    emit(n, p) { for (const f of handlers.get(n) ?? []) f(p); } };
  fx.bindBus(bus);
  bus.emit('shell:expired', { shellId: 'h1', pos: [0, 0, 0], hitTerrain: true, munition: 'howitzer', chargeKg: 20, caliberMm: 152, shellType: 'HE', dir: [0, -0.8, 0.6] });
  for (let i = 0; i < 3; i++) fx.update(1 / 60, [], camera, () => null);
  const crater = fx.group.getObjectByName('fx-crater-marks')?.material;
  let ember = null;
  fx.group.getObjectByName('fx-volume-media')?.traverse((o) => { if (!ember && o.material?.uniforms?.uEmberK) ember = o.material.uniforms; });
  return { heatView: crater?.uniforms?.uHeatView?.value, ember, emberLevel: ember?.uGrade2?.value.z };
}
assert.equal(runtime({ thermalFlight: true, flightVision: 1 }).heatView, 1, 'the infrared lens sees the ground heat');
assert.equal(runtime({ thermalFlight: true, flightVision: 2 }).heatView, 1, 'so does the thermal lens');
assert.equal(runtime({ thermalFlight: true, flightVision: 0 }).heatView, 0, 'the daylight lens does not');
assert.equal(runtime({ thermalFlight: true, flightVision: 3 }).heatView, 0, 'nor the image intensifier');
assert.equal(runtime({}).heatView, 0, 'nor a ground camera');

// ---- 2. the night embers ----
const day = runtime({});
assert.ok(day.ember, 'the media carry the ember uniforms');
const live = day.ember.uEmberK.value.filter((k) => k.z > 0);
assert.equal(live.length, 1, 'the gunship\'s 152 mm lays one ember light');
assert.ok(Math.abs(live[0].z - 4.5) < 1e-9 && live[0].y > 0, `for ${live[0].z} s`);
const vol = readFileSync(new URL('./volumeMedia.ts', import.meta.url), 'utf8');
assert.match(vol, /if \( uGrade2\.z > 0\.0 \) \{\s*for \( int i = 0; i < \$\{EMBER_SLOTS\}; i\+\+ \)/, 'the embers light only at their level');
assert.match(vol, /gl \+= uGrade2\.z \* ek\.y \* \( 1\.0 - f \* f \)/, 'scaled by it, slow to fade');
// their level: the night level, for every camera but a heat-imaging one
assert.equal(day.emberLevel, 0, 'by day the embers are dark');
const nightLevel = runtime({}, true).ember.uGrade2.value.y;
assert.ok(nightLevel > 0.99, `the night rig reads as night (${nightLevel})`);
for (const [name, u] of [['a ground camera', {}], ['the daylight lens', { thermalFlight: true, flightVision: 0 }],
  ['the image intensifier', { thermalFlight: true, flightVision: 3 }]]) {
  assert.equal(runtime(u, true).emberLevel, nightLevel, `${name} sees the night embers`);
}
for (const [name, u] of [['the infrared lens', { thermalFlight: true, flightVision: 1 }], ['the thermal lens', { thermalFlight: true, flightVision: 2 }],
  ['a sensor imaging heat', { sensorVision: 1 }]]) {
  assert.equal(runtime(u, true).emberLevel, 0, `${name} sees no ember at night (no veil over the target)`);
}

function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function embersOf(run) {
  let n = 0; const scratch = () => new Proxy({}, { get(t, key) { if (typeof key === 'symbol' || key === 'toJSON' || key === 'then') return t[key];
    if (!(key in t)) t[key] = [0, 0, 0, 0]; return t[key]; } });
  const C = { tier: 1, m: scratch(), k: scratch(), lp: scratch(), ls: scratch(), lj: scratch(), rand: mulberry(4), groundY: () => 0, distBoost: () => 1,
    media() {}, chunk() {}, flash() {}, fire() {}, sparks() {}, jet() {}, shockRing() {}, lightPulse() {}, glow() {}, ember: () => { n++; } };
  run(C); return n;
}
const g = (munition, chargeKg, plunge, earthOnly = false) => embersOf((C) => groundBurst(C, { x: 0, y: 0, z: 0, munition, chargeKg, surface: 'soil',
  birthOffset: 0, ...(plunge ? { dx: 0, dy: -0.8, dz: 0.6 } : {}), ...(earthOnly ? { earthOnly: true, crowd: 0 } : {}) }));
const h = (munition, chargeKg) => embersOf((C) => plateBurst(C, { x: 0, y: 1.8, z: 0, nx: 0, ny: 1, nz: 0, munition, chargeKg, ground: 'soil', birthOffset: 0 }));
assert.equal(g('howitzer', 20, true), 1, 'the gunship\'s 152 mm on the ground: one ember');
assert.equal(g('missile', 11, true), 1, 'its missile: one');
assert.equal(h('howitzer', 20), 1, 'on a hull (its earth adds none): one');
for (const [name, n] of [['a field howitzer', g('howitzer', 6.8, false)], ['a plain HE round', g('he', 20, false)], ['a shaped charge', g('heat', 3, false)],
  ['an earth-only burst', g('howitzer', 12, true, true)], ['a light hull hit', h('howitzer', 6.8)], ['a SAM on a hull', h('missile', 0.62)]]) {
  assert.equal(n, 0, `${name} lays no ember`);
}
console.log(`thermalGroundAndEmbers: a 152 mm crater reads hot to the heat lens for ${hotFor.toFixed(1)} s (white-hot ${whiteFor.toFixed(1)} s), no other lens or mark; the gunship's heavy bursts light their column at night for 4.5 s, no other burst, and no heat lens sees it`);
