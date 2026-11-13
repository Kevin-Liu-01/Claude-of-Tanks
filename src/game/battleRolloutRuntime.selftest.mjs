import assert from 'node:assert/strict';

import { createBattleRolloutRuntime } from './battleRolloutRuntime.ts';
import { createBus } from './stateCore.ts';

const game = { preBattleS: Infinity };
const events = [];
const bus = createBus((type, payload) => events.push([type, payload]));
const countdowns = [];
const audioCalls = [];
const runtime = createBattleRolloutRuntime({
  game,
  // (2026-11-02 audit F1) the battle's one rollout edge is the frame runtime's latch; the harness latches the same way
  rollout: () => bus.emit('battle:rollout', {}),
  audio: {
    resume: () => audioCalls.push('resume'),
    ambientOn: (active) => audioCalls.push(`ambient:${active}`),
  },
  getHud: () => ({ preBattleCountdown: (seconds) => countdowns.push(seconds) }),
  defaultPreBattleSeconds: 5,
});

runtime.open();
assert.equal(game.preBattleS, 5);
assert.deepEqual(countdowns, [5]);
assert.deepEqual(audioCalls, ['resume', 'ambient:true']);
assert.deepEqual(events, []);

runtime.open(2);
assert.equal(game.preBattleS, 5, 'an armed countdown is never restarted during reveal');
game.preBattleS = 0;
runtime.open(0);
assert.deepEqual(events, [['battle:rollout', {}]]);
assert.throws(() => runtime.open(-1), /finite and non-negative/);
assert.throws(() => createBattleRolloutRuntime({}), /valid state and presentation ports/);
assert.throws(() => createBattleRolloutRuntime({
  game, bus, audio: { resume() {}, ambientOn() {} }, getHud: () => null, defaultPreBattleSeconds: 5,
}), /valid state and presentation ports/, 'a bus is no rollout port: the frame runtime owns the edge');

console.log('battleRolloutRuntime.selftest: countdown, audio, and rollout edge pass');
