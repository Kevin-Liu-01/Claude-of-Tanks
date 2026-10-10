// A shell burst on open ground (the Scene Studio's stand-in blast, cause 'shot' with no tank) leaves a shorter,
// smoke-only column: no flame licks on a deck line nothing stands on and no ember smolder after it (2026-10-03: shell
// hits in the site fifty left 40 s of flame burning over bare ice and water). A destroyed tank's column is unchanged.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { createFx } from './effects.ts';

const { createCanvas } = createRequire(import.meta.url)('@napi-rs/canvas');
const documentBefore = Object.getOwnPropertyDescriptor(globalThis, 'document');
globalThis.document = { createElement(tag) { if (tag !== 'canvas') throw new Error(tag); return createCanvas(1, 1); } };
try {
  const fx = createFx({ anisotropy: 4 }, { getHeightAt: () => 0 }, { seed: 77 });
  const camera = new THREE.PerspectiveCamera();
  const step = (seconds) => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) fx.update(1 / 60, [], camera, () => null); };
  fx.destruction(new THREE.Vector3(0, 0, 0), null, 'shot', null, { shellBurst: true });
  fx.destruction(new THREE.Vector3(30, 0, 0), null, 'shot');
  step(1);
  let debug = fx.getAttachmentDebug();
  assert.equal(debug.worldFixedColumns, 2, 'the shell burst and the wreck each raise a column');
  assert.equal(debug.flamelessColumns, 1, 'only the shell burst column is smoke-only');
  step(14);
  debug = fx.getAttachmentDebug();
  assert.equal(debug.flamelessColumns, 0, 'the shell burst column is gone by 15 s, with no smolder stage');
  assert.equal(debug.worldFixedColumns, 1, 'the wreck column still burns at 15 s');
  console.log('shellBurstColumn.selftest: a shell burst leaves a 14 s smoke-only column; a wreck still burns');
} finally {
  if (documentBefore) Object.defineProperty(globalThis, 'document', documentBefore); else delete globalThis.document;
}
