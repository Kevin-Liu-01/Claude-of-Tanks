// The muzzle flash's light by calibre (229; the media lane's Q2 and the FX follow-up: "muzzle-flash point light flat peak
// regardless of calibre, pools white on snow"). One pooled muzzle light flashed 460 cd over a 12 m reach for every gun,
// so a rifle-calibre burst pooled the ground as a 125 mm shot did. Pinned on the live fx runtime (createFx, the camera
// side-on at 15 m so the view terms are equal for every bore):
//   - a 120-125 mm gun keeps the tuned pool (460 cd over 12 m, within the reference bore's few per cent);
//   - the light grows with the bore, peak and reach, from a machine gun's small kiss to a 152 mm gun's wider pool;
//   - a 7.62 mm gun's light is under a twentieth of a 125 mm gun's over at most 3.5 m; a 12.7 mm's under a tenth;
//   - every other pulse of the muzzle light (a rocket's ignition) keeps the 12 m reach.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { createFx } from './effects.ts';

const { createCanvas } = createRequire(import.meta.url)('@napi-rs/canvas');
const documentBefore = Object.getOwnPropertyDescriptor(globalThis, 'document');
globalThis.document = { createElement(tag) { if (tag !== 'canvas') throw new Error(tag); return createCanvas(1, 1); } };
try {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(15, 2, 0); camera.lookAt(0, 2, 0); camera.updateMatrixWorld();
  const fx = createFx({ anisotropy: 4, camera }, { getHeightAt: () => 0 }, { seed: 77 });
  const lights = [];
  fx.group.traverse((o) => { if (o.isPointLight) lights.push(o); });
  const light = lights.find((l) => l.distance === 12);
  assert.ok(light, 'the pooled muzzle light (12 m at rest) is in the fx group');
  const shot = (caliberMm, rocket = false) => {
    fx.muzzleFlash(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 0, 1), caliberMm, rocket);
    let peak = 0, reach = light.distance;
    for (let t = 0; t < 0.3; t += 1 / 60) {
      fx.update(1 / 60, [], camera, () => null);
      peak = Math.max(peak, light.intensity);
    }
    return { peak, reach };
  };
  const bores = [7.62, 12.7, 14.5, 20, 30, 40, 57, 76, 90, 105, 120, 125, 130, 152];
  const at = Object.fromEntries(bores.map((mm) => [mm, shot(mm)]));
  const ref = at[125].peak;
  assert.ok(ref > 0, 'a 125 mm shot lights its muzzle');
  // the tuned main-gun pool stands: 120 and 125 mm within the reference bore's few per cent, over the 12 m reach
  for (const mm of [120, 125]) {
    assert.ok(Math.abs(at[mm].reach - 12) < 0.25, `${mm} mm keeps the 12 m reach (${at[mm].reach.toFixed(2)})`);
  }
  assert.ok(at[120].peak > 0.93 * ref && at[120].peak < ref, '120 mm within a few per cent of 125 mm');
  // the light grows with the bore, peak and reach
  for (let i = 1; i < bores.length; i++) {
    const a = at[bores[i - 1]], b = at[bores[i]];
    assert.ok(b.peak > a.peak && b.reach > a.reach, `${bores[i]} mm lights more than ${bores[i - 1]} mm`);
  }
  assert.ok(at[7.62].peak < 0.05 * ref && at[7.62].reach <= 3.5, `a rifle-calibre gun's small kiss (${(at[7.62].peak / ref).toFixed(3)} x, ${at[7.62].reach.toFixed(1)} m)`);
  assert.ok(at[12.7].peak < 0.1 * ref && at[12.7].reach <= 4.5, `a heavy machine gun's (${(at[12.7].peak / ref).toFixed(3)} x, ${at[12.7].reach.toFixed(1)} m)`);
  assert.ok(at[30].peak < 0.25 * ref && at[30].reach < 7, `an autocannon's (${(at[30].peak / ref).toFixed(3)} x, ${at[30].reach.toFixed(1)} m)`);
  assert.ok(at[152].peak > 1.25 * ref && at[152].reach > 13, `a 152 mm gun's wider pool (${(at[152].peak / ref).toFixed(2)} x, ${at[152].reach.toFixed(1)} m)`);
  // every other pulse keeps the 12 m reach (a rocket's ignition)
  assert.equal(shot(70, true).reach, 12, 'a rocket\'s ignition keeps the 12 m reach');
  console.log(`muzzleLight.selftest: 7.62 mm ${at[7.62].peak.toFixed(0)} cd / ${at[7.62].reach.toFixed(1)} m, 12.7 mm ${at[12.7].peak.toFixed(0)} / ${at[12.7].reach.toFixed(1)}, `
    + `30 mm ${at[30].peak.toFixed(0)} / ${at[30].reach.toFixed(1)}, 125 mm ${ref.toFixed(0)} / ${at[125].reach.toFixed(1)}, 152 mm ${at[152].peak.toFixed(0)} / ${at[152].reach.toFixed(1)}`);
} finally {
  if (documentBefore) Object.defineProperty(globalThis, 'document', documentBefore); else delete globalThis.document;
}
