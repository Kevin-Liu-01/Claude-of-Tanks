import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { createBus } from './stateCore.ts';
import { createMobileAutoAimRuntime } from './mobileAutoAimRuntime.ts';
import { endLifeScope, lifeScopeFrame, lifeScopeSnapshot } from './lifeScope.ts';

const bus = createBus();
const camera = new PerspectiveCamera();
const player = {
  id: 'player', team: 'a', state: { pos: new Vector3() },
  spec: { id: 'player_spec', name: 'Player', dims: { heightM: 2 } }, combat: { destroyed: false },
};
const enemy = {
  id: 'enemy', team: 'b', state: { pos: new Vector3(2, 0, 20) },
  spec: { id: 'enemy_spec', name: 'Enemy Tank', dims: { heightM: 3 } }, combat: { destroyed: false },
};
const tanks = [player, enemy];
const byId = new Map(tanks.map((tank) => [tank.id, tank]));
let phase = 'battle';
let currentPlayer = player;
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
  getPlayer: () => currentPlayer,
  getTankById: (id) => byId.get(id) ?? null,
  isVisible: () => visible,
  pickTarget: () => { picks += 1; return enemy; },
  targetCenter: (tank, out) => out.copy(tank.state.pos).addScaledVector(
    new Vector3(0, 1, 0), tank.spec.dims.heightM * 0.5),
});

bus.emit('ui:autoAimToggle', {});
assert.equal(picks, 1);
assert.equal(runtime.targetId, enemy.id);
// (reds-sweep2-276) notices-276 (20d2f41710) put the target's spec id on the lock's state, for the render on the lock's
// notice (components/noticeArt.ts); the fixture specs carry ids so the state names the locked tank's, not ''
assert.deepEqual(states.at(-1), {
  on: true, targetId: enemy.id, targetName: enemy.spec.name, targetSpecId: enemy.spec.id, reason: '',
});
const point = runtime.sample(true);
assert.deepEqual(point?.toArray(), [2, 1.5, 20], 'sample follows target center mass');
assert.equal(runtime.sample(true), point, 'sample reuses one retained vector');
assert.equal(runtime.sample(false), null, 'paused camera ownership yields no aim point');
assert.equal(runtime.targetId, enemy.id, 'temporary camera ownership loss retains the lock');

runtime.clear();
currentPlayer = { ...player, state: null, combat: null };
bus.emit('ui:autoAimToggle', {});
assert.equal(runtime.targetId, null, 'garage-safe player records cannot acquire a target');
currentPlayer = player;
bus.emit('ui:autoAimToggle', {});

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
assert.equal(runtime.targetId, enemy.id, 'round 30 (owner 2026-09-20): the desktop T key acquires the same lock — the layout no longer gates it');
bus.emit('ui:autoAimToggle', {});
assert.equal(runtime.targetId, null, 'a second press releases it');
assert.equal(states.at(-1).reason, 'AUTO-AIM OFF');

// (life-reset-279) a lock is the life's (game/lifeScope.ts): the player's own death ends it, so the revived hull comes back
// unlocked, its touch button dark; the kill cam's sample(false) alone kept it through the death into the next life
lifeScopeFrame(player);
bus.emit('ui:autoAimToggle', {});
assert.equal(runtime.targetId, enemy.id, 'locked in this life');
lifeScopeFrame({ ...player, combat: { destroyed: true } }, player.id);
assert.equal(runtime.targetId, null, "the player's death releases the lock");
assert.deepEqual(states.at(-1), { on: false, targetId: null, targetName: '', targetSpecId: '', reason: '' }, 'released quietly');
lifeScopeFrame(player, player.id);
assert.equal(runtime.targetId, null, 'the revived hull starts unlocked');
bus.emit('ui:autoAimToggle', {});
bus.emit('ui:autoAimToggle', {}); // a lock released by hand leaves nothing on the life
assert.equal(lifeScopeSnapshot().live[0].counts.deferred, 0, 'a released lock unhooks from the life');
endLifeScope(player.id, 'test');

runtime.dispose();
touch = true;
bus.emit('ui:autoAimToggle', {});
assert.equal(runtime.targetId, null, 'dispose detaches all auto-aim listeners');

console.log('mobileAutoAimRuntime.selftest: acquisition, loss, phase, the life\'s end and disposal passed');
