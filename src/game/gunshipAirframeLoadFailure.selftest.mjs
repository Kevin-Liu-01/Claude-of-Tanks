// gunshipAirframeLoadFailure.selftest.mjs — the AC-130's airframe chunk after a failed load (2026-11-02 audit R6, review
// round 2). Copyright © 2026 Kevin B. Liu.
//
// The airframe (game/gunshipAirframe.ts) is its own chunk, asked for by two callers that run every frame of an AC-130
// battle: the gunship's sync (battlePresentationRuntime.ts syncModeVisual -> syncGunshipVisual) and the FX runtime's lens
// guns (fx/effects.ts poseLensGuns). Both kept a memo or a latch that a failure cleared, so after one failed load (a
// network blip, a deployment that removed the chunk) each frame asked for it again and warned: 60 frames, 60 asks from
// the sync alone (the reviewer's probe). Both now ask through the one chunk of gunshipVisual.ts, under the one
// lazy-chunk policy (app/lazyChunk.ts): at once after the first failure, then past its backoff (2, 4, 8 ... s). A chunk
// "fails" as a browser's does when the network drops: its resolve throws.
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import * as THREE from 'three';

let clock = 0;
performance.now = () => clock; // the lazy chunk's default clock
let down = false;
let asks = 0;
registerHooks({
  resolve(specifier, context, next) {
    if (/(?:^|\/)gunshipAirframe\.ts$/.test(specifier) && /\/src\/(?:game\/gunshipVisual|fx\/effects)\.ts$/.test(context.parentURL ?? '')) {
      asks++;
      if (down) throw new TypeError('Failed to fetch dynamically imported module: /assets/gunshipAirframe-12345678.js');
    }
    return next(specifier, context);
  },
});
const warnings = [];
console.warn = (...args) => { warnings.push(args.map(String).join(' ')); };
const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
globalThis.document ??= { createElement: () => createCanvas(1, 1) };

const { createGunshipBattleVisual, loadGunshipAirframe, syncGunshipVisual } = await import('./gunshipVisual.ts');
const { createFx } = await import('../fx/effects.ts');
const turn = () => new Promise((resolve) => setImmediate(resolve)); // a failed import settles between frames

// the battle: the pilot's gunship (an anchor its sync poses) and the camera on its own gimbal lens (the lens guns)
const ORBIT = new THREE.Vector3(0, 240, 90);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1.6, 0.5, 4000);
camera.position.set(ORBIT.x, ORBIT.y + 0.12, ORBIT.z);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld(true);
Object.assign(camera.userData, { thermalFlight: true, aerialPilotId: null, flightVision: 0, sensorVision: 0 });
const gunship = { id: 'pilot', team: 'alpha', aerial: { kind: 'gunship', active: true, x: ORBIT.x, y: ORBIT.y, z: ORBIT.z },
  state: { pos: ORBIT.clone(), yaw: 0 }, visual: { root: new THREE.Group() }, spec: { id: 'm1a1_abrams_hc', nation: 'USA', gun: { caliberMm: 120, shells: [] } } };
const fx = createFx({ scene, camera, renderer: null, anisotropy: 1, setupShadowMaterial: () => {}, releaseShadowMaterial: () => {} },
  { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0) },
  { seed: 3, resolveEntity: (id) => (id === 'pilot' ? gunship : null), auxiliaryEntities: () => [gunship] });
scene.add(fx.group);
down = true; // the chunk fails from the battle's start: the carrier's own ask (createGunshipBattleVisual) is the first
const anchor = createGunshipBattleVisual('t90am');
scene.add(anchor.root);
const subject = (id) => (id === 'pilot' ? gunship : null);
const frame = async () => {
  clock += 1000 / 60;
  syncGunshipVisual(anchor.root, ORBIT, 0, 1 / 60, true, null);
  fx.update(1 / 60, [], camera, subject);
  await turn();
};
const lensGuns = () => fx.group.getObjectByName('AC-130 lens guns') ?? null;
/** the airframe the sync adds beside its anchor (the scene's one other child) */
const airframe = () => scene.children.find((o) => o !== anchor.root && o !== fx.group) ?? null;

// ---- one second of frames with the chunk failing: two asks (the first, and the policy's at once), not one a frame
{
  await loadGunshipAirframe(); // the covered entry's wait (the carrier's ask): it resolves though the chunk failed
  for (let i = 0; i < 60; i++) await frame();
  assert.equal(asks, 2, `the carrier and 60 frames of the sync and the lens guns ask a failed chunk twice, not every frame (asked ${asks} times)`);
  assert.equal(warnings.filter((line) => /airframe did not load/.test(line)).length, 2, 'and warn once per ask');
  assert.equal(lensGuns(), null, 'no lens guns while the chunk is out');
  assert.equal(airframe(), null, 'and no airframe');
  assert.equal(loadGunshipAirframe(), loadGunshipAirframe(), 'a caller asking every frame shares one settled promise');
}

// ---- the backoff passes and the network is back: the next frame's ask loads it, and both callers draw from it
{
  down = false;
  clock += 2000;
  for (let i = 0; i < 5 && !lensGuns(); i++) await frame();
  assert.equal(asks, 3, 'once the backoff has passed, one ask loads the chunk');
  assert.ok(lensGuns(), 'the lens guns build from the loaded chunk');
  assert.ok(airframe(), 'the sync draws the airframe beside its anchor');
  for (let i = 0; i < 30; i++) await frame();
  assert.equal(asks, 3, 'and nothing asks again once it is in');
}

fx.dispose?.();
anchor.dispose();
console.log('gunshipAirframeLoadFailure: a failed airframe chunk is asked twice over 60 frames of its sync and lens guns (was once a frame), then loads past the backoff for both');
