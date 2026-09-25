import assert from 'node:assert/strict';
import { createBattleResultPresentationRuntime } from './battleResultPresentationRuntime.ts';

function createHarness({ ending = false } = {}) {
  const calls = [];
  const plays = [];
  const beats = [];
  let wallMs = 100;
  let playResult = true;
  let cameraAccepts = true;
  let skip = null;
  const game = {
    result: null,
    resultReason: null,
    gameMode: 'standard',
    timeS: 12,
    player: { combat: { destroyed: false }, state: { pos: { x: 10, y: 3, z: -20 } } },
    matchModeState: null,
  };
  const killcam = {
    lastBeginWallMs: 80,
    playForResult(result, timeS, onDone, options) {
      plays.push({ result, timeS, onDone, options });
      calls.push(['play', result]);
      return playResult;
    },
  };
  const endingPorts = ending ? {
    camera: {
      begin(plan, onSkip) { calls.push(['camera.begin', plan.beat]); beats.push(plan); skip = onSkip; return cameraAccepts; },
      frame(u) { calls.push(['camera.frame', Math.round(u * 100) / 100]); },
      end() { calls.push(['camera.end']); skip = null; },
    },
    modeState: () => game.matchModeState,
    emitBeat: (phase, plan) => calls.push(['beat', phase, plan.beat]),
  } : null;
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
    ending: endingPorts,
    now: () => wallMs,
    deathBeatMs: 2600,
  });
  return {
    game,
    killcam,
    runtime,
    calls,
    plays,
    beats,
    get skip() { return skip; },
    set now(value) { wallMs = value; },
    set playResult(value) { playResult = value; },
    set cameraAccepts(value) { cameraAccepts = value; },
  };
}

const names = (calls) => calls.map((call) => call[0]);

// a fresh elimination victory: the killcam is asked for the final kill with the fresh-kill wreck hold
const fresh = createHarness();
fresh.game.result = 'victory';
fresh.game.resultReason = 'elimination';
fresh.game.player.combat.destroyed = true;
fresh.runtime.update();
assert.deepEqual(fresh.plays[0].options, { freshKill: true, finalKill: true, ownDeath: true });
assert.deepEqual(fresh.calls.slice(0, 3), [
  ['unlock'],
  ['play', 'victory'],
  ['receipt', {
    played: true,
    result: 'victory',
    timeS: 12,
    resultWallMs: 100,
    kcBeginWallMs: 80,
    beat: 'finalKill',
    ran: 'replay',
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

// a draw by elimination (a double kill on the wire) asks the killcam for the final kill too; without a chain
// and without the ending ports it presents at once — never a replay of nothing
const direct = createHarness();
direct.playResult = false;
direct.game.result = 'draw';
direct.runtime.update();
assert.equal(direct.plays.length, 1, 'a draw by elimination asks the killcam for the final kill');
assert.deepEqual(direct.plays[0].options, { freshKill: false, finalKill: true, ownDeath: true });
assert.equal(direct.calls.some(([name, value]) => name === 'show' && value === 'draw'), true);
assert.equal(direct.calls.some(([name]) => name === 'deathCam'), false);
assert.deepEqual(direct.calls.find(([name]) => name === 'receipt')[1], {
  played: false, result: 'draw', timeS: 12, resultWallMs: 100, kcBeginWallMs: 80, beat: 'finalKill', ran: 'none',
});

// a disconnect never plays a beat: the report explains it
const disconnected = createHarness({ ending: true });
disconnected.game.result = 'draw';
disconnected.game.resultReason = 'network_disconnect';
disconnected.runtime.update();
assert.equal(disconnected.plays.length, 0);
assert.deepEqual(names(disconnected.calls), ['unlock', 'veil', 'show', 'presented', 'release', 'receipt']);
assert.equal(disconnected.calls.at(-1)[1].beat, 'none');

const delayed = createHarness();
delayed.game.player.combat.destroyed = true;
delayed.runtime.update();
assert.deepEqual(delayed.runtime.snapshot(), {
  endShown: false,
  deathCamShown: true,
  pendingDeadlineMs: 2700,
  beat: null,
});
assert.deepEqual(delayed.calls, [['unlock'], ['deathCam']],
  'local destruction releases pointer ownership before the death beat');
delayed.runtime.update();
assert.equal(delayed.calls.filter(([name]) => name === 'unlock').length, 1,
  'the destroyed-state edge does not repeatedly request pointer unlock');
delayed.game.result = 'defeat';
delayed.game.resultReason = 'elimination';
delayed.now = 500;
delayed.runtime.update();
assert.equal(delayed.plays.length, 0, 'the original death-beat deadline is preserved');
delayed.playResult = false;
delayed.now = 2700;
delayed.runtime.update();
assert.equal(delayed.plays.length, 1);
assert.equal(delayed.plays[0].result, 'defeat');
assert.deepEqual(delayed.plays[0].options, { freshKill: false, finalKill: true, ownDeath: true },
  'the redirected death beat asks for the own death or the final kill');
assert.equal(delayed.calls.filter(([name]) => name === 'deathCam').length, 2,
  'defeat verdict returns to a wreck orbit after the replay fallback');

delayed.game.result = null;
delayed.runtime.reset();
assert.deepEqual(delayed.runtime.snapshot(), {
  endShown: false,
  deathCamShown: false,
  pendingDeadlineMs: null,
  beat: null,
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
assert.deepEqual(reviving.runtime.snapshot(), { endShown: false, deathCamShown: false, pendingDeadlineMs: null, beat: null });
reviving.game.player.combat.destroyed = false;
reviving.game.result = 'victory';
reviving.runtime.update();
assert.equal(reviving.plays.length, 1, 'the final verdict still reaches the replay pipeline');
assert.equal(reviving.plays[0].result, 'victory');
assert.deepEqual(reviving.plays[0].options, { freshKill: false, finalKill: true, ownDeath: true });
const revivingNull = createHarness();
revivingNull.game.ruleset = { respawnS: null };
revivingNull.game.player.combat.destroyed = true;
revivingNull.runtime.update();
assert.deepEqual(revivingNull.calls, [['unlock'], ['deathCam']], 'a null respawn timer keeps the death beat');

// owner 2026-09-21 ("in respawn modes youre registered as dead even if you respawned at end ... if u die before
// end it shows a kill cam of that end"): a revived player alive at the verdict gets no replay of an earlier
// life — the killcam is asked for the final kill only (ownDeath false) and presents at once when it has none
const revivedAlive = createHarness();
revivedAlive.playResult = false;
revivedAlive.game.ruleset = { respawnS: 6 };
revivedAlive.game.player.combat.destroyed = true; // died mid-battle …
revivedAlive.runtime.update();
revivedAlive.game.player.combat.destroyed = false; // … and came back at spawn
revivedAlive.game.result = 'defeat';
revivedAlive.runtime.update();
assert.equal(revivedAlive.plays.length, 1);
assert.deepEqual(revivedAlive.plays[0].options, { freshKill: false, finalKill: true, ownDeath: false },
  'no death replay for a player alive at the end of a reviving mode');
assert.deepEqual(revivedAlive.calls, [
  ['unlock'],
  ['play', 'defeat'],
  ['veil', false],
  ['show', 'defeat'],
  ['presented', 'defeat'],
  ['release'],
  ['deathCam'],
  ['receipt', { played: false, result: 'defeat', timeS: 12, resultWallMs: 100, kcBeginWallMs: 80, beat: 'finalKill', ran: 'none' }],
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
assert.deepEqual(revivedDead.plays[0].options, { freshKill: true, finalKill: true, ownDeath: true });
assert.deepEqual(revivedDead.calls.at(-1), ['veil', true]);

// a mid-battle death replay already ran: the verdict may replay the final kill but never that death again
const replayedDeath = createHarness();
replayedDeath.game.player.combat.destroyed = true;
replayedDeath.runtime.update();
replayedDeath.now = 2700;
replayedDeath.runtime.update(); // the death beat fires the mid-battle replay
assert.equal(replayedDeath.plays.length, 1);
replayedDeath.game.result = 'defeat';
replayedDeath.game.resultReason = 'elimination';
replayedDeath.now = 30000;
replayedDeath.runtime.update();
assert.equal(replayedDeath.plays.length, 2, 'the verdict asks the killcam again — for the final kill');
assert.deepEqual(replayedDeath.plays[1].options, { freshKill: false, finalKill: true, ownDeath: false });

// non-reviving modes are untouched: a defeat with a living player (a campaign clock running out) presents
// through the time's-up beat instead of a replay request
const clockDefeat = createHarness({ ending: true });
clockDefeat.game.ruleset = { respawnS: null };
clockDefeat.game.result = 'defeat';
clockDefeat.game.resultReason = 'time_limit';
clockDefeat.runtime.update();
assert.equal(clockDefeat.plays.length, 0, 'a clock ending never asks for a replay');
assert.deepEqual(names(clockDefeat.calls), ['unlock', 'camera.begin', 'beat', 'receipt', 'camera.frame'],
  'the beat opens the report gate before its first frame');
assert.equal(clockDefeat.beats[0].beat, 'timesUp');
assert.equal(clockDefeat.beats[0].clockFlash, true);
assert.deepEqual(clockDefeat.beats[0].focus, { kind: 'player', x: 10, z: -20, y: 3, radiusM: 6, id: null });
assert.deepEqual(clockDefeat.calls.find(([name]) => name === 'receipt')[1], {
  played: false, result: 'defeat', timeS: 12, resultWallMs: 100, kcBeginWallMs: 80, beat: 'timesUp', ran: 'timesUp',
});
assert.equal(clockDefeat.runtime.snapshot().beat, 'timesUp');
// the beat runs 2.5 s through the camera, then presents and releases the report gate
clockDefeat.now = 100 + 1250;
clockDefeat.runtime.update();
assert.deepEqual(clockDefeat.calls.at(-1), ['camera.frame', 0.5]);
assert.equal(clockDefeat.calls.some(([name]) => name === 'show'), false, 'the report waits for the beat');
clockDefeat.now = 100 + 2500;
clockDefeat.runtime.update();
assert.deepEqual(names(clockDefeat.calls).slice(-8),
  ['camera.frame', 'camera.end', 'veil', 'show', 'presented', 'release', 'deathCam', 'beat'],
  'the beat ends into the ordinary defeat presentation, then the report gate opens');
assert.deepEqual(clockDefeat.calls.at(-1), ['beat', 'done', 'timesUp']);
assert.equal(clockDefeat.runtime.snapshot().beat, null);
clockDefeat.now = 100 + 9000;
clockDefeat.runtime.update();
assert.equal(clockDefeat.calls.filter(([name]) => name === 'show').length, 1, 'presented exactly once');

// any key / click skips a camera beat
const skipped = createHarness({ ending: true });
skipped.game.result = 'draw';
skipped.game.resultReason = 'time_limit';
skipped.runtime.update();
assert.equal(typeof skipped.skip, 'function', 'the camera armed the skip');
skipped.now = 400;
skipped.skip();
skipped.runtime.update();
assert.deepEqual(names(skipped.calls).slice(-7), ['camera.frame', 'camera.end', 'veil', 'show', 'presented', 'release', 'beat']);
assert.equal(skipped.calls.some(([name, value]) => name === 'show' && value === 'draw'), true, 'a skipped beat presents at once');
assert.deepEqual(skipped.calls.at(-1), ['beat', 'done', 'timesUp']);

// an objective ending frames the deciding objective from the observed facts and the live mode state
const objective = createHarness({ ending: true });
objective.game.gameMode = 'capture_the_flag';
objective.game.matchModeState = {
  id: 'capture_the_flag', perspectiveTeam: 'alpha',
  flags: [
    { team: 'alpha', x: -300, z: -300, baseX: -320, baseZ: -310, status: 'home' },
    { team: 'bravo', x: 300, z: 300, baseX: 320, baseZ: 310, status: 'home' },
  ],
};
objective.runtime.observe('mode:flag_captured', { team: 'bravo', by: 'e1', score: 3 });
objective.game.result = 'defeat';
objective.game.resultReason = 'flag_limit';
objective.runtime.update();
assert.equal(objective.beats[0].beat, 'objective');
assert.deepEqual(objective.beats[0].focus, { kind: 'objective', x: 320, z: 310, y: null, radiusM: 18, id: 'flag:bravo' });
assert.deepEqual(objective.beats[0].caption, { key: 'ending.flagCaptured' });
assert.equal(objective.plays.length, 0);

// the horde last stand: the death replay first; when the killcam has nothing, the wreck orbit
const horde = createHarness({ ending: true });
horde.playResult = false;
horde.game.gameMode = 'endless_horde';
horde.game.matchModeState = { id: 'endless_horde', horde: { wave: 4 } };
horde.runtime.observe('tank:destroyed', { id: 'me', pos: [12, 4, -21], cause: 'ammorack', killerId: 'e2' });
horde.game.player.combat.destroyed = true;
horde.game.result = 'defeat';
horde.game.resultReason = 'horde_overrun';
horde.runtime.update();
assert.deepEqual(horde.plays[0].options, { freshKill: true, finalKill: false, ownDeath: true }, 'the last stand is the own death');
assert.equal(horde.beats[0].beat, 'wreckOrbit', 'no chain: the wreck orbit');
assert.deepEqual(horde.beats[0].focus, { kind: 'wreck', x: 12, z: -21, y: 4, radiusM: 6, id: 'me' });
assert.deepEqual(horde.beats[0].caption, { key: 'ending.lastStand', values: { wave: '4' } });
assert.deepEqual(horde.calls.find(([name]) => name === 'receipt')[1], {
  played: false, result: 'defeat', timeS: 12, resultWallMs: 100, kcBeginWallMs: 80, beat: 'lastStand', ran: 'wreckOrbit',
});

// the camera declines (nothing to frame): the report at once, no dangling beat
const declined = createHarness({ ending: true });
declined.cameraAccepts = false;
declined.game.result = 'victory';
declined.game.resultReason = 'time_limit';
declined.runtime.update();
assert.deepEqual(names(declined.calls), ['unlock', 'camera.begin', 'veil', 'show', 'presented', 'release', 'receipt']);
assert.equal(declined.runtime.snapshot().beat, null);

// a reset (garage return, battle again) cancels a running beat and closes the report gate
const cancelled = createHarness({ ending: true });
cancelled.game.result = 'draw';
cancelled.game.resultReason = 'time_limit';
cancelled.runtime.update();
cancelled.runtime.reset();
assert.deepEqual(names(cancelled.calls).slice(-2), ['camera.end', 'beat']);
assert.deepEqual(cancelled.calls.at(-1), ['beat', 'done', 'timesUp']);
assert.equal(cancelled.calls.some(([name]) => name === 'show'), false, 'a cancelled beat presents nothing');

assert.throws(
  () => createBattleResultPresentationRuntime({ deathBeatMs: -1 }),
  /requires every lifecycle port|deathBeatMs/,
);
assert.throws(
  () => createHarness({ ending: true }).runtime && createBattleResultPresentationRuntime({
    game: {}, killcam: { playForResult() { return false; } }, rig: { release() {} }, veilHud() {}, showEndOverlay() {},
    emitPresented() {}, exitPointerLock() {}, recordFlow() {}, ending: { camera: {} },
  }),
  /battle ending presentation requires/,
);

console.log('battleResultPresentationRuntime.selftest: replay, death beat, reviving modes (alive at the verdict: no death replay; dead: last-life replay), final-kill requests, the director\'s camera beats (time\'s up, objective, wreck orbit, skip, decline, reset) and the verdict receipt pass');
