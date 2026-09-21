import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';

import { createMobileBattleInputAccess } from './mobileBattleInputAccess.ts';
import { createBus } from './stateCore.ts';

const bus = createBus();
const camera = new PerspectiveCamera();
let touchLayout = false;
let soundMuted = null;
let touchLoads = 0;
let autoAimLoads = 0;
let autoAimCreates = 0;
let touchOptions;
let currentTouch = null;
const controls = { root: {}, isLayout: true, refresh() {} };
const autoAim = { targetId: null, sample: () => null, clear() {}, dispose() {} };
const player = {
  id: 'player', team: 'a', state: { pos: new Vector3() },
  spec: { name: 'Player', dims: { heightM: 2 } }, combat: { destroyed: false },
};
let failAutoAim = true;

const input = { isTouchLayout: () => touchLayout };
const access = createMobileBattleInputAccess({
  input,
  bus,
  camera,
  isBattleActive: () => true,
  openSettings() {},
  setSoundMuted: (muted) => { soundMuted = muted; },
  isSniper: () => false,
  getPhase: () => 'battle',
  getTanks: () => [player],
  getPlayer: () => player,
  getTankById: () => player,
  isVisible: () => true,
  pickTarget: () => null,
  targetCenter: (_tank, out) => out,
}, {
  createTouchAccess: (options) => {
    touchOptions = options;
    return {
      preload: async () => {
        if (currentTouch) return currentTouch;
        touchLoads += 1;
        currentTouch = controls;
        return controls;
      },
      get current() { return currentTouch; },
    };
  },
  loadAutoAim: async () => {
    autoAimLoads += 1;
    if (failAutoAim) throw new Error('simulated auto-aim chunk failure');
    return {
      createMobileAutoAimRuntime(options) {
        autoAimCreates += 1;
        assert.equal(options.bus, bus);
        assert.equal(options.input, input);
        assert.equal(options.camera, camera);
        return autoAim;
      },
    };
  },
});

// round 30 (owner 2026-09-20): the auto-aim lock serves the desktop T key too, so a desktop boot loads that one
// chunk (and surfaces its failure) while the touch controls stay touch-only
await assert.rejects(access.preload(), /simulated auto-aim chunk failure/, 'desktop boot loads the auto-aim chunk and nothing else');
assert.equal(touchLoads, 0, 'no touch controls on a desktop layout');
assert.equal(autoAimLoads, 1);
assert.equal(access.getAutoAim(), null);

touchOptions.onToggleSound();
assert.equal(soundMuted, true);
touchOptions.onToggleSound();
assert.equal(soundMuted, false);

touchLayout = true;
await assert.rejects(access.preload(), /simulated auto-aim chunk failure/);
assert.equal(touchLoads, 1);
assert.equal(autoAimLoads, 2);
assert.equal(access.getAutoAim(), null);
failAutoAim = false;
const first = access.preload();
const joined = access.preload();
assert.equal(first, joined, 'concurrent touch entry paths join one request');
assert.equal(await first, controls);
assert.equal(access.getAutoAim(), autoAim);
assert.equal(touchLoads, 1);
assert.equal(autoAimLoads, 3);
assert.equal(autoAimCreates, 1);
assert.equal(await access.preload(), controls);
assert.equal(autoAimLoads, 3, 'ready mobile input returns without retransferring chunks');
touchLayout = false;
assert.equal(await access.preload(), null, 'a ready auto-aim runtime makes a desktop preload a no-op');
assert.equal(autoAimLoads, 3);
touchLayout = true;

assert.throws(() => createMobileBattleInputAccess({}),
  /requires every lifecycle port/);

console.log('mobileBattleInputAccess.selftest: desktop exclusion, joined loading, retry, sound, and ownership pass');
