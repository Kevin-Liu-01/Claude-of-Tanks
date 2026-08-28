import assert from 'node:assert/strict';
import { createPlayerFrameInput } from './playerFrameInput.ts';

function createInput() {
  const actions = new Map();
  const down = new Set();
  const state = {
    forward: false,
    back: false,
    left: false,
    right: false,
    handbrake: false,
    fire: false,
  };
  const runtime = {
    state,
    down,
    virtual: { active: false, x: 0, y: 0 },
    mouse: { x: 0, y: 0 },
    cursor: { x: 0, y: 0 },
    settings: { rmbMode: 'hold' },
    locked: false,
    pad: false,
    cursorAim: false,
    virtualActive: false,
    onAction(action, listener) {
      let group = actions.get(action);
      if (!group) actions.set(action, group = new Set());
      group.add(listener);
      return () => group.delete(listener);
    },
    press(action) {
      for (const listener of actions.get(action) || []) listener();
    },
    getState: () => state,
    getVirtualMove(out) {
      out.x = runtime.virtual.x;
      out.y = runtime.virtual.y;
      return runtime.virtual.active;
    },
    isLocked: () => runtime.locked,
    padActive: () => runtime.pad,
    isCursorAim: () => runtime.cursorAim,
    virtualActive: () => runtime.virtualActive,
    consumeMouseDelta(out) {
      out.x = runtime.mouse.x;
      out.y = runtime.mouse.y;
      runtime.mouse.x = 0;
      runtime.mouse.y = 0;
      return out;
    },
    getCursorNdc(out) {
      out.x = runtime.cursor.x;
      out.y = runtime.cursor.y;
      return out;
    },
    getSettings: () => runtime.settings,
    isDown: (action) => down.has(action),
  };
  return runtime;
}

const input = createInput();
let ammo = true;
let forced = false;
const owner = createPlayerFrameInput({
  input,
  hasAmmo: () => ammo,
  forceFire: () => forced,
});
const player = {
  combat: { destroyed: false },
  input: {
    throttle: 9, steer: 9, brake: true, fire: true, shellSlot: 0, aimLocked: true,
  },
};
const sample = {
  dtSeconds: 1 / 60,
  inBattle: false,
  paused: false,
  killcamActive: false,
  cameraLocked: false,
  rigMode: 'ARCADE',
  player,
};

owner.poll(sample);
assert.deepEqual(player.input, {
  throttle: 0, steer: 0, brake: false, fire: false, shellSlot: 0, aimLocked: false,
}, 'non-battle frames clear every driving edge');

sample.inBattle = true;
input.state.forward = true;
input.state.right = true;
input.state.handbrake = true;
input.state.fire = true;
input.locked = true;
input.mouse = { x: 0.12, y: -0.08 };
input.press('zoomIn');
input.press('zoomIn');
input.press('zoomIn');
input.press('zoomIn');
let camera = owner.poll(sample);
assert.equal(player.input.throttle, 1);
assert.equal(player.input.steer, -1, 'right input follows the positive-yaw convention');
assert.equal(player.input.brake, true);
assert.equal(player.input.fire, true);
assert.equal(camera.mouseDX, 0.12);
assert.equal(camera.mouseDY, -0.08);
assert.equal(camera.wheel, 3, 'wheel notches accumulate and clamp inside a frame');
assert.equal(owner.poll(sample).wheel, 0, 'wheel accumulation is consumed once');

ammo = false;
owner.poll(sample);
assert.equal(player.input.fire, false, 'empty shell cards close every fire lane');
forced = true;
owner.poll(sample);
assert.equal(player.input.fire, false, 'debug fire still obeys ammunition');
ammo = true;
assert.equal(owner.poll(sample).wheel, 0);
assert.equal(player.input.fire, true);

forced = false;
input.state.fire = false;
input.state.forward = false;
input.state.right = false;
input.virtual = { active: true, x: 0.4, y: 0.7 };
owner.poll(sample);
assert.equal(player.input.throttle, 0.7);
assert.equal(player.input.steer, -0.4);

input.virtual.active = false;
input.cursorAim = true;
input.cursor = { x: 0.45, y: -0.3 };
camera = owner.poll(sample);
assert.equal(camera.cursorAim, true);
assert.equal(camera.cursorX, 0.45);
assert.equal(camera.cursorY, -0.3);

input.down.add('freeCamera');
camera = owner.poll(sample);
assert.equal(camera.aimHold, true);
assert.equal(camera.rmb, false, 'cursor aiming never engages gun-lock free look');

input.settings.rmbMode = 'toggle';
camera = owner.poll(sample);
assert.equal(camera.shiftPressed, true);
assert.equal(camera.aimHold, false);

input.settings.rmbMode = 'freelook';
camera = owner.poll(sample);
assert.equal(camera.shiftPressed, true, 'cursor fallback maps freelook RMB to sniper toggle');
input.cursorAim = false;
camera = owner.poll(sample);
assert.equal(camera.rmb, true);
assert.equal(player.input.aimLocked, true,
  'RMB free-look holds the physical gun while the sight remains live');
assert.equal(camera.shiftPressed, false);

input.down.delete('freeCamera');
input.down.add('freeLook');
assert.equal(owner.poll(sample).rmb, true, 'dedicated free-look remains mode independent');
assert.equal(player.input.aimLocked, true,
  'the dedicated Caps/RB action publishes the same gun-hold state');

sample.paused = true;
input.mouse = { x: 1, y: 1 };
input.press('zoomOut');
camera = owner.poll(sample);
assert.equal(camera.mouseDX, 0);
assert.equal(camera.mouseDY, 0);
assert.equal(camera.wheel, 0);
assert.equal(player.input.throttle, 0);
assert.equal(player.input.fire, false);
assert.equal(player.input.aimLocked, false, 'pausing releases the held gun state');

sample.paused = false;
sample.cameraLocked = true;
input.down.add('sniperToggle');
camera = owner.poll(sample);
assert.equal(camera.shiftPressed, false);
assert.equal(camera.rmb, false);
assert.equal(player.input.aimLocked, false, 'camera-locked phases cannot retain gun hold');

sample.cameraLocked = false;
sample.killcamActive = true;
input.state.forward = true;
owner.poll(sample);
assert.equal(player.input.throttle, 0, 'killcam frames cannot leak driving input');
assert.equal(player.input.aimLocked, false, 'killcam frames cannot retain a physical-gun hold');

owner.dispose();
sample.killcamActive = false;
input.press('zoomIn');
assert.equal(owner.poll(sample).wheel, 0, 'disposed owners detach action listeners');

console.log('playerFrameInput.selftest: movement, fire, camera modes, and frame consumption passed');
