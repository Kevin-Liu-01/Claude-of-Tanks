// The kill's light on the ground (fx 9: 8t, wave 405's critics on both arms: "the flat orange ground ellipse at 0.0 s").
// The pooled explosion light flashed 3.2 m over a killed hull with its 13 m reach tinted a ~12 m disc of ground orange on
// every kill. A plain kill (no ammunition explosion) now lights the hull and the ground round it in a small, brief,
// paler pool, the light low over the deck; an ammunition cook-off keeps its own pool, shortened and a little nearer; the
// wreck's fire light afterwards is unchanged; every other pulse of the pooled light keeps the 13 m reach.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { createFx } from './effects.ts';

const { createCanvas } = createRequire(import.meta.url)('@napi-rs/canvas');
const documentBefore = Object.getOwnPropertyDescriptor(globalThis, 'document');
globalThis.document = { createElement(tag) { if (tag !== 'canvas') throw new Error(tag); return createCanvas(1, 1); } };
try {
  const run = (cause) => {
    const fx = createFx({ anisotropy: 4 }, { getHeightAt: () => 0 }, { seed: 77 });
    const camera = new THREE.PerspectiveCamera();
    const lights = [];
    fx.group.traverse((o) => { if (o.isPointLight) lights.push(o); });
    const light = lights.find((l) => l.distance === 13);
    assert.ok(light, 'the pooled explosion light (13 m) is in the fx group');
    const samples = [];
    fx.destruction(new THREE.Vector3(0, 0, 0), null, cause);
    for (let t = 0; t < 1.2 - 1e-9; t += 1 / 60) {
      samples.push({ t, intensity: light.intensity, distance: light.distance, y: light.position.y, hex: light.color.getHex() });
      fx.update(1 / 60, [], camera, () => null);
    }
    return samples;
  };
  const plain = run('shot'), rack = run('ammorack');
  const p0 = plain[0], r0 = rack[0];
  assert.ok(p0.distance <= 7 && r0.distance <= 11 && r0.distance > p0.distance,
    `a plain kill's pool reaches ${p0.distance} m, a cook-off's ${r0.distance} m (was 13 m on both)`);
  assert.ok(p0.y <= 3.0 && r0.y >= 4, `the plain kill's light low over the deck (${p0.y.toFixed(1)} m), the cook-off's high (${r0.y.toFixed(1)} m)`);
  assert.ok(p0.intensity > 0 && p0.intensity < 0.4 * r0.intensity, `a plain kill's flash is the smaller (${p0.intensity.toFixed(0)} vs ${r0.intensity.toFixed(0)})`);
  const c = new THREE.Color(p0.hex), hsl = {}; c.getHSL(hsl);
  const k = new THREE.Color(r0.hex), hk = {}; k.getHSL(hk);
  assert.ok(hsl.s <= hk.s + 1e-6 && hsl.l > hk.l, 'and paler than the cook-off\'s orange');
  // brief: a plain kill's pulse is over by 0.3 s (the wreck's own fire light may follow, dim, at its 12 m reach);
  // the cook-off's by 0.55 s
  const after = (s, t) => s.find((x) => x.t >= t);
  assert.ok(after(plain, 0.3).distance !== p0.distance || after(plain, 0.3).intensity < 0.1 * p0.intensity, 'the plain kill\'s pool is gone by 0.3 s');
  assert.ok(after(rack, 0.55).distance !== r0.distance || after(rack, 0.55).intensity < 0.1 * r0.intensity, 'the cook-off\'s by 0.55 s');
  assert.ok(Math.max(...plain.filter((x) => x.t > 0.3).map((x) => x.intensity)) < 0.25 * p0.intensity, 'after it only the wreck\'s dim fire light');
  // every other pulse of the pooled light keeps its 13 m reach (a ground burst's, a hit's)
  {
    const fx = createFx({ anisotropy: 4 }, { getHeightAt: () => 0 }, { seed: 77 });
    const lights = []; fx.group.traverse((o) => { if (o.isPointLight) lights.push(o); });
    const light = lights.find((l) => l.distance === 13);
    fx.destruction(new THREE.Vector3(0, 0, 0), null, 'shot', null, { shellBurst: true });
    assert.equal(light.distance, 13, 'a shell burst on open ground keeps the pooled light\'s reach');
  }
  console.log(`killLight.selftest: a plain kill's pool ${p0.distance} m from ${p0.y.toFixed(1)} m, peak ${p0.intensity.toFixed(0)}, gone by 0.3 s; a cook-off's ${r0.distance} m, ${r0.intensity.toFixed(0)}, gone by 0.55 s`);
} finally {
  if (documentBefore) Object.defineProperty(globalThis, 'document', documentBefore); else delete globalThis.document;
}
