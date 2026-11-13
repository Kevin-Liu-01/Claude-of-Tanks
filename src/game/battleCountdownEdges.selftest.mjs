// 2026-11-02 audit F1: the countdown's hazards. `battle:rollout` had two emitters with different guards (the
// rollout runtime's open() at 0, unlatched; the frame runtime's count edge, latched); the warm hold froze the count on
// PREPARING with no limit when its release never came (and, in review, its limit counted a frame's whole wall delta,
// so one frame after a long focus loss expired it); and `preBattleS` had seven writers with no owner.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  const dt = 0.1;
  let frames = 0;
  while (game.preBattleS > 0 && frames < 1000) { frame.advance(dt, dt, frames * 100, false); frames += 1; }
  assert.equal(game.preBattleS, 0, 'a warm whose release never came no longer holds the count forever');
  assert.equal(events.length, 1);
  assert.equal(expiries.length, 1, 'the expiry is reported once');
  assert.ok(expiries[0] >= countdownPolicy.PRE_BATTLE_WARM_HOLD_LIMIT_S - 1e-9);
  assert.ok(frames * dt >= countdownPolicy.PRE_BATTLE_WARM_HOLD_LIMIT_S + 2, 'the hold still held the count for its limit');
}

// (review) The limit counts the frames that ran at the hold, each capped as the frame owner caps its delta: one frame
// after a focus loss or a hidden tab (a 40 s wall delta; the warm itself did not progress while the loop slept) is
// one frame at the hold. It used to expire the hold and roll the battle out at once, with no 3-2-1.
{
  let pending = true;
  const { game, events, expiries, frame, rollout } = createCountdown({ warmPending: () => pending });
  rollout.open(3);
  for (let at = 0; at < 240; at += 1) frame.advance(1 / 60, 1 / 60, at * 16, false);
  assert.equal(game.preBattleS, 3, 'held on its top numeral for four seconds');
  frame.advance(0.1, 40, 44_000, false);
  assert.equal(game.preBattleS, 3, 'a single 40 s frame does not end the hold');
  assert.deepEqual(expiries, []);
  assert.equal(events.length, 0, 'and does not roll the battle out');
  pending = false;
  for (let at = 0; at < 5 && game.preBattleS > 0; at += 1) frame.advance(1, 1, 45_000 + at * 1000, false);
  assert.equal(game.preBattleS, 0, 'the released warm counts 3-2-1');
  assert.equal(events.length, 1);
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

const { warmHoldActive, warmHoldElapsed, PRE_BATTLE_WARM_HOLD_LIMIT_S, WARM_HOLD_FRAME_CAP_S } = countdownPolicy;
assert.equal(warmHoldElapsed(0, 4, 0.05, true), 0, 'counting down to the hold is not holding');
assert.equal(warmHoldElapsed(0, 3, 0.05, true), 0.05);
assert.equal(warmHoldElapsed(0, 3, 40, true), WARM_HOLD_FRAME_CAP_S, 'one frame adds at most the frame cap');
assert.equal(warmHoldElapsed(2, 3, 1, false), 2);
assert.equal(warmHoldElapsed(0, Infinity, 1, true), 0);
assert.equal(warmHoldActive(PRE_BATTLE_WARM_HOLD_LIMIT_S - 0.01, true), true);
assert.equal(warmHoldActive(PRE_BATTLE_WARM_HOLD_LIMIT_S, true), false);

// (review) The countdown's owner: one transition function, an edge table, bad moves ignored or refused.
{
  const { transitionBattleCountdown: move, battleCountdownState: stateOf, BATTLE_COUNTDOWN_EDGES } = countdownPolicy;
  assert.deepEqual(Object.keys(BATTLE_COUNTDOWN_EDGES).sort(), ['armed', 'counting', 'open']);
  assert.deepEqual([Infinity, 3, 0.5, 0].map(stateOf), ['armed', 'counting', 'counting', 'open']);
  const game = { preBattleS: 0 };
  assert.equal(move(game, 'open', 3), false, 'a countdown that was never armed is not opened');
  assert.equal(game.preBattleS, 0);
  assert.equal(move(game, 'advance', 0), false, 'no count runs: nothing to advance');
  assert.equal(move(game, 'arm'), true);
  assert.equal(game.preBattleS, Infinity);
  assert.equal(move(game, 'advance', 2), false, 'an armed count is opened, never advanced');
  assert.equal(move(game, 'open', 3), true);
  assert.equal(game.preBattleS, 3);
  assert.equal(move(game, 'open', 5), false, 'a running count is never reopened');
  assert.equal(move(game, 'advance', 4), false, 'a count never rises');
  assert.equal(game.preBattleS, 3);
  assert.equal(move(game, 'advance', 2.5), true);
  assert.equal(move(game, 'advance', Number.NaN), false);
  assert.equal(move(game, 'follow', Infinity), false);
  assert.equal(move(game, 'follow', -1), false);
  assert.equal(game.preBattleS, 2.5, 'a count that is not a count writes nothing');
  assert.equal(move(game, 'advance', 0), true);
  assert.equal(stateOf(game.preBattleS), 'open');
  assert.equal(move(game, 'follow', 4), true, 'the network authority is followed from any state');
  assert.equal(game.preBattleS, 4);
  assert.equal(move(game, 'clear'), true);
  assert.equal(game.preBattleS, 0);
  assert.equal(move(game, 'arm'), true, 'a new battle arms over the last one');
  assert.equal(move(game, 'live'), true, 'the debug entry skips the count');
  assert.equal(game.preBattleS, 0);
}

// Source contract: every `preBattleS` writer in src/ goes through the owner (seven writers in six files before).
{
  const root = fileURLToPath(new URL('..', import.meta.url));
  const writers = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.(ts|js|mjs)$/.test(name) || /\.selftest\.mjs$|\.test-support\.mjs$/.test(name)) continue;
      const lines = readFileSync(full, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (/\.preBattleS\s*(=(?!=)|\+=|-=)/.test(line)) writers.push(`${relative(root, full)}:${index + 1}`);
      });
    }
  };
  walk(root);
  assert.deepEqual(writers.map((entry) => entry.split(':')[0]), ['game/preBattleCountdown.ts'],
    `every preBattleS write goes through transitionBattleCountdown (found ${writers.join(', ')})`);
}

console.log('battleCountdownEdges.selftest: one rollout a battle, a capped warm hold with a limit, one countdown writer passed');
