// 2026-11-02 audit F1: the countdown's two hazards. `battle:rollout` had two emitters with different guards (the
// rollout runtime's open() at 0, unlatched; the frame runtime's count edge, latched), and the warm hold froze the
// count on PREPARING with no limit when its release never came.
import assert from 'node:assert/strict';

import { createBattleFrameRuntime } from './battleFrameRuntime.ts';
import { createBattleRolloutRuntime } from './battleRolloutRuntime.ts';
import * as countdownPolicy from './preBattleCountdown.ts';
import { createBus } from './stateCore.ts';

function createCountdown({ warmPending = () => false } = {}) {
  const game = { phase: 'battle', preBattleS: Infinity, result: null, player: { input: {}, combat: {} } };
  const events = [];
  const bus = createBus((type, payload) => { if (type === 'battle:rollout') events.push(payload); });
  const expiries = [];
  let frame = null;
  frame = createBattleFrameRuntime({
    game,
    settings: { isOpen: () => false },
    killcam: { isActive: () => false },
    input: { camera: {}, poll() {}, dispose() {} },
    network: { isActive: () => false, pump() {} },
    countdown: {
      isWarmPending: warmPending,
      advance: countdownPolicy.advancePreBattleCountdown,
      show() {},
      rollout: (late = false) => bus.emit('battle:rollout', late ? { late: true } : {}),
      holdExpired: (heldS) => expiries.push(heldS),
    },
    presentation: { captureSoloPose() {}, update() {}, updateResult() {} },
    getRigMode: () => 'ARCADE',
    stepSimulation() {},
    emitPause() {},
  });
  // main's composition: the rollout runtime's open-at-0 goes through the frame runtime's one latch
  const rollout = createBattleRolloutRuntime({
    game,
    bus,
    rollout: () => (typeof frame.rollout === 'function' ? frame.rollout(false) : bus.emit('battle:rollout', {})),
    audio: { resume() {}, ambientOn() {} },
    getHud: () => null,
    defaultPreBattleSeconds: 3,
  });
  return { game, events, expiries, frame, rollout };
}

// One battle rolls out once: the count's fall to 0, then a second open (the start's own open and the loader's, the
// non-deferred start path) used to emit a second rollout.
{
  const { game, events, frame, rollout } = createCountdown();
  rollout.open(3);
  for (let at = 0; at < 4 && game.preBattleS > 0; at += 1) frame.advance(1, 1, at * 1000, false);
  assert.equal(game.preBattleS, 0);
  assert.equal(events.length, 1, 'the count rolls out once');
  rollout.open(3);
  assert.equal(events.length, 1, 'a second open of a live battle cannot roll it out again');
  frame.advance(1 / 60, 1 / 60, 5000, false);
  assert.equal(events.length, 1);
}

// A battle opened at 0 rolls out through the same latch; the next battle (armed) rolls out again.
{
  const { game, events, frame, rollout } = createCountdown();
  game.preBattleS = 0;
  rollout.open(0);
  rollout.open(0);
  assert.equal(events.length, 1, 'open at 0 rolls out once');
  game.preBattleS = Infinity; // the next battle armed
  frame.advance(1 / 60, 1 / 60, 100, false);
  rollout.open(2);
  for (let at = 0; at < 4 && game.preBattleS > 0; at += 1) frame.advance(1, 1, 200 + at * 1000, false);
  assert.equal(events.length, 2, 'a new battle rolls out again');
}

// The warm hold has a limit: a release that never comes holds the count at its top numeral for the limit, then the
// count runs on (the warm is optional and finishes behind live play).
{
  const { game, events, expiries, frame, rollout } = createCountdown({ warmPending: () => true });
  rollout.open(5);
  let frames = 0;
  while (game.preBattleS > 0 && frames < 200) { frame.advance(1, 1, frames * 1000, false); frames += 1; }
  assert.equal(game.preBattleS, 0, 'a warm whose release never came no longer holds the count forever');
  assert.equal(events.length, 1);
  assert.equal(expiries.length, 1, 'the expiry is reported once');
  assert.ok(expiries[0] >= countdownPolicy.PRE_BATTLE_WARM_HOLD_LIMIT_S);
  assert.ok(frames >= countdownPolicy.PRE_BATTLE_WARM_HOLD_LIMIT_S + 2, 'the hold still held the count for its limit');
}

// A warm released inside the limit keeps today's behaviour (PREPARING on 3, then 3-2-1).
{
  let pending = true;
  const { game, events, expiries, frame, rollout } = createCountdown({ warmPending: () => pending });
  rollout.open(3);
  for (let at = 0; at < 5; at += 1) frame.advance(1, 1, at * 1000, false);
  assert.equal(game.preBattleS, 3, 'held on its top numeral while warm work is pending');
  pending = false;
  for (let at = 5; at < 9 && game.preBattleS > 0; at += 1) frame.advance(1, 1, at * 1000, false);
  assert.equal(game.preBattleS, 0);
  assert.equal(events.length, 1);
  assert.deepEqual(expiries, []);
}

const { warmHoldActive, warmHoldElapsed, PRE_BATTLE_WARM_HOLD_LIMIT_S } = countdownPolicy;
assert.equal(warmHoldElapsed(0, 4, 1, true), 0, 'counting down to the hold is not holding');
assert.equal(warmHoldElapsed(0, 3, 1, true), 1);
assert.equal(warmHoldElapsed(2, 3, 1, false), 2);
assert.equal(warmHoldElapsed(0, Infinity, 1, true), 0);
assert.equal(warmHoldActive(PRE_BATTLE_WARM_HOLD_LIMIT_S - 0.01, true), true);
assert.equal(warmHoldActive(PRE_BATTLE_WARM_HOLD_LIMIT_S, true), false);

console.log('battleCountdownEdges.selftest: one rollout a battle, and a warm hold with a limit passed');
