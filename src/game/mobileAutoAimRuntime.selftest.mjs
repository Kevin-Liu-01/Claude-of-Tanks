import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { createBus } from './stateCore.ts';
import { createMobileAutoAimRuntime } from './mobileAutoAimRuntime.ts';

const bus = createBus();
const camera = new PerspectiveCamera();
const player = {
  id: 'player', team: 'a', state: { pos: new Vector3() },
  spec: { name: 'Player', dims: { heightM: 2 } }, combat: { destroyed: false },
};
const enemy = {
  id: 'enemy', team: 'b', state: { pos: new Vector3(2, 0, 20) },
  spec: { name: 'Enemy Tank', dims: { heightM: 3 } }, combat: { destroyed: false },
};
const tanks = [player, enemy];
const byId = new Map(tanks.map((tank) => [tank.id, tank]));
let phase = 'battle';
let touch = true;
let visible = true;
let picks = 0;
const states = [];
bus.on('ui:autoAimState', (payload) => states.push(payload));

const runtime = createMobileAutoAimRuntime({
  bus,
  input: { isTouchLayout: () => touch },
  camera,
  getPhase: () => phase,
  getTanks: () => tanks,
  getPlayer: () => player,
  getTankById: (id) => byId.get(id) ?? null,
  isVisible: () => visible,
  pickTarget: () => { picks += 1; return enemy; },
  targetCenter: (tank, out) => out.copy(tank.state.pos).addScaledVector(
    new Vector3(0, 1, 0), tank.spec.dims.heightM * 0.5),
});

bus.emit('ui:autoAimToggle', {});
assert.equal(picks, 1);
assert.equal(runtime.targetId, enemy.id);
assert.deepEqual(states.at(-1), {
  on: true, targetId: enemy.id, targetName: enemy.spec.name, reason: '',
});
const point = runtime.sample(true);
assert.deepEqual(point?.toArray(), [2, 1.5, 20], 'sample follows target center mass');
assert.equal(runtime.sample(true), point, 'sample reuses one retained vector');
assert.equal(runtime.sample(false), null, 'paused camera ownership yields no aim point');
assert.equal(runtime.targetId, enemy.id, 'temporary camera ownership loss retains the lock');

visible = false;
assert.equal(runtime.sample(true), null, 'a hidden target is released');
assert.equal(states.at(-1).reason, 'TARGET LOST');

visible = true;
bus.emit('ui:autoAimToggle', {});
bus.emit('tank:destroyed', { id: enemy.id });
assert.equal(runtime.targetId, null);
assert.equal(states.at(-1).reason, 'TARGET DESTROYED');

bus.emit('ui:autoAimToggle', {});
phase = 'garage';
bus.emit('phase:change', { phase });
assert.equal(runtime.targetId, null, 'leaving battle clears the retained target');

touch = false;
phase = 'battle';
bus.emit('ui:autoAimToggle', {});
assert.equal(runtime.targetId, null, 'desktop input cannot acquire mobile auto-aim');

runtime.dispose();
touch = true;
bus.emit('ui:autoAimToggle', {});
assert.equal(runtime.targetId, null, 'dispose detaches all auto-aim listeners');

console.log('mobileAutoAimRuntime.selftest: acquisition, loss, phase and disposal passed');
