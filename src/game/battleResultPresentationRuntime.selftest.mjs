import assert from 'node:assert/strict';
import { createBattleResultPresentationRuntime } from './battleResultPresentationRuntime.ts';

function createHarness() {
  const calls = [];
  const plays = [];
  let wallMs = 100;
  let playResult = true;
  const game = {
    result: null,
    timeS: 12,
    player: { combat: { destroyed: false } },
  };
  const killcam = {
    lastBeginWallMs: 80,
    playForResult(result, timeS, onDone, options) {
      plays.push({ result, timeS, onDone, options });
      calls.push(['play', result]);
      return playResult;
    },
  };
  const runtime = createBattleResultPresentationRuntime({
    game,
    killcam,
    rig: {
      release: () => calls.push(['release']),
      startDeathCam: () => calls.push(['deathCam']),
    },
    veilHud: (on) => calls.push(['veil', on]),
    showEndOverlay: (result) => calls.push(['show', result]),
    emitPresented: (result) => calls.push(['presented', result]),
    exitPointerLock: () => calls.push(['unlock']),
    recordFlow: (receipt) => calls.push(['receipt', receipt]),
    now: () => wallMs,
    deathBeatMs: 2600,
  });
  return {
    game,
    killcam,
    runtime,
    calls,
    plays,
    set now(value) { wallMs = value; },
    set playResult(value) { playResult = value; },
  };
}

const fresh = createHarness();
fresh.game.result = 'victory';
fresh.game.player.combat.destroyed = true;
fresh.runtime.update();
assert.deepEqual(fresh.plays[0].options, { freshKill: true });
assert.deepEqual(fresh.calls.slice(0, 3), [
  ['unlock'],
  ['play', 'victory'],
  ['receipt', {
    played: true,
    result: 'victory',
    timeS: 12,
    resultWallMs: 100,
    kcBeginWallMs: 80,
  }],
]);
assert.deepEqual(fresh.calls.at(-1), ['veil', true]);
fresh.plays[0].onDone();
assert.deepEqual(fresh.calls.slice(-4), [
  ['veil', false],
  ['show', 'victory'],
  ['presented', 'victory'],
  ['release'],
]);

const direct = createHarness();
direct.playResult = false;
direct.game.result = 'draw';
direct.runtime.update();
assert.equal(direct.plays.length, 0, 'a draw bypasses the victory/defeat replay pipeline');
assert.equal(direct.calls.some(([name, value]) => name === 'show' && value === 'draw'), true);
assert.equal(direct.calls.some(([name]) => name === 'deathCam'), false);

const delayed = createHarness();
delayed.game.player.combat.destroyed = true;
delayed.runtime.update();
assert.deepEqual(delayed.runtime.snapshot(), {
  endShown: false,
  deathCamShown: true,
  pendingDeadlineMs: 2700,
});
assert.deepEqual(delayed.calls, [['unlock'], ['deathCam']],
  'local destruction releases pointer ownership before the death beat');
delayed.runtime.update();
assert.equal(delayed.calls.filter(([name]) => name === 'unlock').length, 1,
  'the destroyed-state edge does not repeatedly request pointer unlock');
delayed.game.result = 'defeat';
delayed.now = 500;
delayed.runtime.update();
assert.equal(delayed.plays.length, 0, 'the original death-beat deadline is preserved');
delayed.playResult = false;
delayed.now = 2700;
delayed.runtime.update();
assert.equal(delayed.plays.length, 1);
assert.equal(delayed.plays[0].result, 'defeat');
assert.equal(delayed.plays[0].options, undefined);
assert.equal(delayed.calls.filter(([name]) => name === 'deathCam').length, 2,
  'defeat verdict returns to a wreck orbit after the replay fallback');

delayed.game.result = null;
delayed.runtime.reset();
assert.deepEqual(delayed.runtime.snapshot(), {
  endShown: false,
  deathCamShown: false,
  pendingDeadlineMs: null,
});
delayed.game.player.combat.destroyed = true;
delayed.runtime.update();
assert.notEqual(delayed.runtime.snapshot().pendingDeadlineMs, null);
delayed.runtime.clearPending();
assert.equal(delayed.runtime.snapshot().pendingDeadlineMs, null);

// reviving modes: a destroyed player triggers no death cam, no replay and no pointer unlock; the verdict
// pipeline still presents the final result when the mode ends
const reviving = createHarness();
reviving.game.ruleset = { respawnS: 3 };
reviving.game.player.combat.destroyed = true;
reviving.runtime.update();
reviving.now = 100 + 5000;
reviving.runtime.update();
assert.deepEqual(reviving.calls, [], 'a reviving player keeps the live view: no unlock, death cam or replay');
assert.equal(reviving.plays.length, 0);
assert.deepEqual(reviving.runtime.snapshot(), { endShown: false, deathCamShown: false, pendingDeadlineMs: null });
reviving.game.player.combat.destroyed = false;
reviving.game.result = 'victory';
reviving.runtime.update();
assert.equal(reviving.plays.length, 1, 'the final verdict still reaches the replay pipeline');
assert.equal(reviving.plays[0].result, 'victory');
assert.deepEqual(reviving.plays[0].options, { freshKill: false });
const revivingNull = createHarness();
revivingNull.game.ruleset = { respawnS: null };
revivingNull.game.player.combat.destroyed = true;
revivingNull.runtime.update();
assert.deepEqual(revivingNull.calls, [['unlock'], ['deathCam']], 'a null respawn timer keeps the death beat');

// owner 2026-09-21 ("in respawn modes youre registered as dead even if you respawned at end ... if u die before
// end it shows a kill cam of that end"): a revived player alive at the verdict gets the ordinary defeat
// cinematic at once — no death replay of an earlier life
const revivedAlive = createHarness();
revivedAlive.game.ruleset = { respawnS: 6 };
revivedAlive.game.player.combat.destroyed = true; // died mid-battle …
revivedAlive.runtime.update();
revivedAlive.game.player.combat.destroyed = false; // … and came back at spawn
revivedAlive.game.result = 'defeat';
revivedAlive.runtime.update();
assert.equal(revivedAlive.plays.length, 0, 'no death replay for a player alive at the end of a reviving mode');
assert.deepEqual(revivedAlive.calls, [
  ['unlock'],
  ['receipt', { played: false, result: 'defeat', timeS: 12, resultWallMs: 100, kcBeginWallMs: 80 }],
  ['veil', false],
  ['show', 'defeat'],
  ['presented', 'defeat'],
  ['release'],
  ['deathCam'],
], 'the ordinary defeat cinematic presents immediately');

// reviving mode, dead at the verdict: the replay is asked for (the killcam holds only the last life's lethal
// chain) and opens on the live wreck, since no mid-battle death cam ran
const revivedDead = createHarness();
revivedDead.game.ruleset = { respawnS: 6 };
revivedDead.game.player.combat.destroyed = true;
revivedDead.game.result = 'defeat';
revivedDead.runtime.update();
assert.equal(revivedDead.plays.length, 1, 'a player dead at the end of a reviving mode gets the death replay');
assert.equal(revivedDead.plays[0].result, 'defeat');
assert.deepEqual(revivedDead.plays[0].options, { freshKill: true });
assert.deepEqual(revivedDead.calls.at(-1), ['veil', true]);

// non-reviving modes are untouched: a defeat with a living player (a campaign clock running out) still asks
// the killcam exactly as before
const clockDefeat = createHarness();
clockDefeat.game.ruleset = { respawnS: null };
clockDefeat.game.result = 'defeat';
clockDefeat.runtime.update();
assert.equal(clockDefeat.plays.length, 1, 'a non-reviving defeat keeps its replay request');
assert.deepEqual(clockDefeat.plays[0].options, { freshKill: false });

assert.throws(
  () => createBattleResultPresentationRuntime({ deathBeatMs: -1 }),
  /requires every lifecycle port|deathBeatMs/,
);

console.log('battleResultPresentationRuntime.selftest: replay, death beat, reviving modes (alive at the verdict: no death replay; dead: last-life replay), verdict, and reset pass');
