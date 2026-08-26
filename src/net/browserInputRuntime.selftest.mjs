import assert from 'node:assert/strict';
import { BrowserInputRuntime } from './browserInputRuntime.ts';
import { PLAYER_ACTION_BITS } from './protocol.js';

const runtime = new BrowserInputRuntime();
const player = {
  state: { pos: { x: 10, y: 2, z: -5 }, yaw: Math.PI / 2 },
  input: {
    throttle: 0.6,
    steer: -0.2,
    brake: false,
    fire: false,
    aimPoint: { x: 20, y: 4, z: -5 },
    shellSlot: 2,
  },
  combat: { destroyed: false },
};

runtime.queueConsumable(1);
runtime.queueAction('reloadMagazine');
let frame = runtime.frame(player);
assert.ok(frame);
assert.equal(frame.aimYaw, Math.PI / 2);
assert.equal(frame.shellSlot, 2);
assert.equal(frame.actionBits,
  PLAYER_ACTION_BITS.FIRST_AID | PLAYER_ACTION_BITS.RELOAD_MAGAZINE);

runtime.advance(1 / 30);
assert.equal(runtime.shouldSend(frame), true, 'first accepted frame sends immediately');
assert.equal(runtime.commit(frame), 1 / 30);
assert.equal(runtime.pendingActionBits, 0, 'accepted client frame consumes action edges');

runtime.queueAction('specialAction');
frame = runtime.frame(player);
runtime.acknowledge(frame.actionBits);
assert.equal(runtime.pendingActionBits, 0, 'host advance consumes submitted edges');
runtime.restore(frame.actionBits);
assert.equal(runtime.pendingActionBits, PLAYER_ACTION_BITS.SPECIAL_ACTION,
  'failed host advance restores the exact edge');

runtime.queueConsumable(8);
assert.equal(runtime.pendingActionBits, PLAYER_ACTION_BITS.SPECIAL_ACTION,
  'invalid consumable slots cannot escape the protocol mask');
assert.equal(runtime.frame({ ...player, combat: { destroyed: true } }), null);

runtime.reset();
assert.equal(runtime.pendingActionBits, 0);
console.log('browserInputRuntime.selftest: lazy aim, cadence, and action-edge ownership passed');
