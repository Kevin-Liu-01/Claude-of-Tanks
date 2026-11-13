// playerInputStage.selftest.mjs — one seat's input stage (268, couch mode), the authority's and the local seats' alike.
// driverStepParity.selftest.mjs proves the two drivers step a staged hull identically; this pins the stage's own rules on
// a stand-in hull, no fleet built:
// 1. No driver, an inactive hull and a wreck all brake, hold the trigger off and the lay (aimLocked), and press nothing.
// 2. The controls land as sent: fireIntentSeq only as a safe integer, action bits as an integer, aimLocked as a boolean.
// 3. A slot past the rack is the last one; an empty slot is refused, the trigger held off, the refusal emitted once
//    while it is asked for, and again after a slot that was taken or a request of the slot held (round 8 Y1 s2-10: a
//    seat that turns back to the round it holds and asks for the empty one again is told again).
// 4. The aim decodes from the hull's position, from its drone's while one flies, into the hull's own aim point.
// 5. A bot (applyBotInput): a live hull's lay is handed back before its controller writes; a wreck's controller still
//    runs (it zeroes its own drive) with the lay left held; the slot it asks for is taken when stocked, else the request
//    falls back to the slot held, fired or not.
import assert from 'node:assert/strict';
import { applyBotInput, applyPlayerInput } from './playerInputStage.ts';
import { decodeAimIntent, encodeAimIntent } from './aimIntent.ts';

const point = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } });
function hull() {
  return {
    id: 'seat-1',
    spec: { era: 'modern', hp: 100, gun: { reloadS: 6, shells: [{ name: 'AP' }, { name: 'HE' }, { name: 'ATGM', guided: true }] } },
    combat: { destroyed: false, shellSlot: 0, ammo: [10, 4, 0], ammoCapacity: [10, 4, 2], reload: { t: 0 } },
    state: { pos: { x: 100, y: 5, z: -40 } },
    input: { throttle: 0, steer: 0, brake: false, fire: false, fireIntentSeq: null, aimLocked: false, actionBits: 0, shellSlot: 0, aimPoint: point() },
  };
}
const drive = (overrides = {}) => ({ throttle: 0.75, steer: -0.5, brake: false, fire: true, fireIntentSeq: 12, aimLocked: false,
  shellSlot: 0, actionBits: 5, aimYaw: 0.4, aimPitch: 0.05, aimDistance: 300, ...overrides });
const events = [];
const emit = (type, payload) => events.push({ type, ...payload });

// 1. no driver, inactive, wreck
for (const [label, prepare, input] of [
  ['no driver', () => {}, null],
  ['an inactive hull', (entity) => { entity.modeActive = false; }, drive()],
  ['a wreck', (entity) => { entity.combat.destroyed = true; }, drive()],
]) {
  const entity = hull();
  Object.assign(entity.input, { throttle: 1, steer: 1, brake: false, fire: true, aimLocked: false, actionBits: 9 });
  prepare(entity);
  applyPlayerInput(entity, input, emit);
  const { throttle, steer, brake, fire, aimLocked, actionBits } = entity.input;
  assert.deepEqual({ throttle, steer, brake, fire, aimLocked, actionBits },
    { throttle: 0, steer: 0, brake: true, fire: false, aimLocked: true, actionBits: 0 }, `${label} brakes and holds`);
}

// 2. the controls as sent
{
  const entity = hull();
  applyPlayerInput(entity, drive({ actionBits: 5.9, aimLocked: 1 }), emit);
  assert.equal(entity.input.throttle, 0.75);
  assert.equal(entity.input.steer, -0.5);
  assert.equal(entity.input.fire, true);
  assert.equal(entity.input.fireIntentSeq, 12);
  assert.equal(entity.input.actionBits, 5, 'action bits are an integer');
  assert.equal(entity.input.aimLocked, true, 'aimLocked is a boolean');
  applyPlayerInput(entity, drive({ fireIntentSeq: 1.5 }), emit);
  assert.equal(entity.input.fireIntentSeq, null, 'a fractional fire intent is none');
  applyPlayerInput(entity, drive({ fireIntentSeq: undefined, aimLocked: undefined }), emit);
  assert.equal(entity.input.fireIntentSeq, null);
  assert.equal(entity.input.aimLocked, false);
}

// 3. the rack: clamp, refusal once, re-armed after a taken slot
{
  const entity = hull();
  events.length = 0;
  applyPlayerInput(entity, drive({ shellSlot: 1 }), emit);
  assert.equal(entity.combat.shellSlot, 1);
  assert.equal(entity.input.shellSlot, 1);
  for (let tick = 0; tick < 3; tick++) applyPlayerInput(entity, drive({ shellSlot: 99 }), emit);
  assert.equal(entity.combat.shellSlot, 1, 'the empty last slot is not taken');
  assert.equal(entity.input.shellSlot, 1, 'the stage reports the slot it holds');
  assert.equal(entity.input.fire, false, 'the trigger is held off while the empty slot is asked for');
  assert.deepEqual(events, [{ type: 'ammo_selection_denied', id: 'seat-1', slot: 2, reason: 'AMMO_EMPTY', guided: true }],
    'a slot past the rack asks for the last; its refusal is emitted once while it is asked for');
  applyPlayerInput(entity, drive({ shellSlot: 0 }), emit);
  assert.equal(entity.combat.shellSlot, 0);
  assert.equal(entity.input.fire, true);
  applyPlayerInput(entity, drive({ shellSlot: 2 }), emit);
  assert.equal(events.length, 2, 'asked for again after a slot was taken, the refusal is emitted again');
}
// (round 8 Y1 s2-10) the request turns back to the slot held, then asks for the empty one again: a new press, told again
{
  const entity = hull();
  events.length = 0;
  for (let tick = 0; tick < 3; tick++) applyPlayerInput(entity, drive({ shellSlot: 2 }), emit);
  for (let tick = 0; tick < 2; tick++) applyPlayerInput(entity, drive({ shellSlot: 0 }), emit);
  assert.equal(entity.combat.shellSlot, 0, 'the slot held is still held');
  for (let tick = 0; tick < 3; tick++) applyPlayerInput(entity, drive({ shellSlot: 2 }), emit);
  assert.deepEqual(events.map(({ type, slot }) => `${type}:${slot}`), ['ammo_selection_denied:2', 'ammo_selection_denied:2'],
    'asked for again after the request came back to the slot held, the refusal is emitted again (once per request)');
}

// 4. the aim's origin
{
  const entity = hull();
  const target = { x: 160, y: 9, z: 210 };
  const intent = encodeAimIntent(entity.state.pos, target);
  const aimPoint = entity.input.aimPoint;
  applyPlayerInput(entity, drive(intent), emit);
  assert.equal(entity.input.aimPoint, aimPoint, 'the aim point is the hull\'s own, written in place');
  for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(aimPoint[axis] - target[axis]) < 1e-9, `the hull's aim lands on the target (${axis})`);
  entity.aerial = { active: true, x: 40, y: 80, z: 15 };
  applyPlayerInput(entity, drive(intent), emit);
  const fromDrone = decodeAimIntent(intent, entity.aerial, point());
  assert.deepEqual([aimPoint.x, aimPoint.y, aimPoint.z], [fromDrone.x, fromDrone.y, fromDrone.z], 'a flying drone\'s seat aims from the drone');
  entity.aerial.active = false;
  applyPlayerInput(entity, drive(intent), emit);
  assert.ok(Math.abs(aimPoint.x - target.x) < 1e-9, 'a parked drone hands the aim back to the hull');
}

// 5. a bot
{
  const entity = hull();
  const seen = [];
  let ask = 1;
  entity.aiCtl = { update(dt, timeS) { seen.push([dt, timeS, entity.input.aimLocked]); entity.input.shellSlot = ask; entity.input.fire = false; } };
  entity.input.aimLocked = true;
  applyBotInput(entity, 1 / 60, 2.5);
  assert.deepEqual(seen, [[1 / 60, 2.5, false]], 'a live bot\'s lay is handed back before its controller writes');
  assert.equal(entity.combat.shellSlot, 1, 'a stocked slot is taken without a shot');
  ask = 2;
  applyBotInput(entity, 1 / 60, 2.6);
  assert.equal(entity.combat.shellSlot, 1, 'an empty slot is not taken');
  assert.equal(entity.input.shellSlot, 1, 'the request falls back to the slot held');
  ask = 9;
  entity.combat.ammo[2] = 1;
  applyBotInput(entity, 1 / 60, 2.7);
  assert.equal(entity.combat.shellSlot, 2, 'a request past the rack takes the last slot');
  entity.combat.destroyed = true;
  entity.input.aimLocked = true;
  applyBotInput(entity, 1 / 60, 2.8);
  assert.equal(seen.length, 4, 'a wreck\'s controller still runs');
  assert.equal(seen[3][2], true, 'a wreck\'s lay stays held');
}

console.log('playerInputStage.selftest: no driver, an inactive hull and a wreck brake and hold the lay; the controls land as sent '
  + '(fire intent a safe integer, action bits an integer); a slot past the rack is the last, an empty one refused with the trigger '
  + 'held off and its refusal emitted once, again after a taken slot or a request of the held one; the aim decodes from the hull, from its drone while one flies; '
  + 'a bot\'s lay handed back before its controller, a wreck\'s controller run with the lay held, its slot taken when stocked, else held');
