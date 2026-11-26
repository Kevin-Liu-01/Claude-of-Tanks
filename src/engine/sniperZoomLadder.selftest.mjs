// Settings › Controls › Increased zoom (scope-and-names-278; Main's ruling, option A). The sniper wheel ladder is ×2, ×4,
// ×8 by default; the toggle runs it on to ×16 and ×25, as the design planned (docs/history/research/movement-physics.md
// "increased zoom"). Before 278 the gate was rig._increasedZoom, which nothing ever set, so no player reached ×16 while
// the Reddit capture and a marketing recipe staged it through snapSniper.
// Copyright (c) 2026 Kevin B. Liu. First-party receipt; see NOTICE.md.
//
// Driven through the player's path: the setting is written by the input layer's own setter (Settings rows call
// input.setSetting), read back after a reload from storage, and handed to the rig as main.ts hands it
// (getCameraSettings: () => input.getSettings()); the sight is wheeled through rig.update. The zoom is read from the
// camera that draws: the vertical lens its projection matrix holds, divided into the 60-degree base lens; never rig.zoom.
// Control: with the setter's branch deleted (input.ts setSetting, `key === 'increasedZoom'`), the toggle-on ladder stops
// at ×8 and the receipt fails at "reaches ×16".
import assert from 'node:assert/strict';
import { Object3D, PerspectiveCamera, Vector3 } from 'three';
import { createCameraRig } from './cameraRig.ts';
import { createInput } from '../game/input.ts';

const BASE_FOV_DEG = 60;
const store = new Map();
for (const [key, value] of Object.entries({
  window: new EventTarget(),
  document: Object.assign(new EventTarget(), { body: { classList: { contains: () => false } } }), // a desktop layout
  localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { store.set(k, String(v)); } },
})) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });

const root = new Object3D();
const player = {
  state: { pos: new Vector3(), yaw: 0, turretYaw: 0 },
  input: { aimPoint: new Vector3() },
  visual: {
    root,
    turretTopWorld: (out) => out.set(0, 2, 0).applyMatrix4(root.matrixWorld),
    gunPivotWorld: (out) => out.set(0, 1.7, 0.2).applyMatrix4(root.matrixWorld),
  },
};
const idle = { mouseDX: 0, mouseDY: 0, wheel: 0, rmb: false, shiftPressed: false };

/** The zoom the camera draws, in the game's own terms (cameraRig.ts: lens = BASE_FOV / zoom): the vertical lens recovered
 *  from the projection matrix (P[5] = cot(fov / 2)), divided into the base lens. */
const drawnZoom = (camera) => +(BASE_FOV_DEG / ((2 * Math.atan(1 / camera.projectionMatrix.elements[5]) * 180) / Math.PI)).toFixed(2);

/** Scope in and wheel in notch by notch: the distinct magnifications drawn, in order. */
function wheelLadder(input) {
  const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 4000);
  const rig = createCameraRig(camera, {
    heightField: { getHeightAt: () => 0 }, raycast: () => null, getPlayer: () => player,
    getCameraSettings: () => input.getSettings(),
  });
  rig.update(1 / 60, idle);
  rig.enterSniper();
  const seen = [];
  for (let notch = 0; notch < 8; notch++) {
    rig.update(1 / 60, notch === 0 ? idle : { ...idle, wheel: 1 });
    rig.update(1 / 60, idle);
    camera.updateProjectionMatrix();
    const zoom = drawnZoom(camera);
    if (seen.at(-1) !== zoom) seen.push(zoom);
  }
  // and back out: every step down is drawn, the ladder leaves the sight past ×2
  const down = [];
  for (let notch = 0; notch < 8 && rig.mode === 'SNIPER'; notch++) {
    rig.update(1 / 60, { ...idle, wheel: -1 });
    rig.update(1 / 60, idle);
    if (rig.mode === 'SNIPER') down.push(drawnZoom(camera));
  }
  return { up: seen, down, mode: rig.mode };
}

const input = createInput({ lockElement: {} });
assert.equal(input.getSettings().increasedZoom, false, 'off by default: nothing changes for current players');
const off = wheelLadder(input);
assert.deepEqual(off.up, [2, 4, 8], 'off, the wheel stops at ×8');
assert.equal(off.mode, 'ARCADE', 'and wheels back out of the sight');

input.setSetting('increasedZoom', true);
const on = wheelLadder(input);
assert.ok(on.up.includes(16), `on, the wheel reaches ×16 (drew ${on.up.join(', ')})`);
assert.deepEqual(on.up, [2, 4, 8, 16, 25], 'on, ×16 then ×25, the top step');
assert.deepEqual(on.down, [16, 8, 4, 2], 'and steps back down through every rung');

// persisted: a fresh input layer (a reload) reads it back from storage
const reloaded = createInput({ lockElement: {} });
assert.equal(reloaded.getSettings().increasedZoom, true, 'the toggle survives a reload');
assert.deepEqual(wheelLadder(reloaded).up, [2, 4, 8, 16, 25]);
reloaded.setSetting('increasedZoom', false);
assert.deepEqual(wheelLadder(reloaded).up, [2, 4, 8], 'off again, ×8 is the top');

console.log('sniperZoomLadder.selftest: the drawn sight stops at ×8 by default and reaches ×16 and ×25 with Increased zoom on '
  + '(persisted; read from the camera\'s projection) PASS');
