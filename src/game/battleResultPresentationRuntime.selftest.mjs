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

assert.throws(
  () => createBattleResultPresentationRuntime({ deathBeatMs: -1 }),
  /requires every lifecycle port|deathBeatMs/,
);

console.log('battleResultPresentationRuntime.selftest: replay, death beat, verdict, and reset pass');
