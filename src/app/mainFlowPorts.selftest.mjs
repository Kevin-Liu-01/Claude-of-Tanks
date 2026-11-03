// 2026-11-02 audit F2/F3 review: main's own flow-port bindings, run from main.ts's actual compositions. The runtimes
// default these ports (announce and whenGarageSettled to no-ops, canReveal to true, the lifecycle readers to false,
// holdExpired to nothing), so deleting main's line brought a hazard back with every runtime test green: the Play
// menu's and campaign's battles recorded no profile history without `announce: ... ui:battleStart`.
import assert from 'node:assert/strict';
import { createAppLifecycle } from '../game/appLifecycle.ts';
import { createBattleEntryLifecycle } from '../game/battleEntryLifecycle.ts';
import { createBattleFrameRuntime } from '../game/battleFrameRuntime.ts';
import { advancePreBattleCountdown, PRE_BATTLE_WARM_HOLD_LIMIT_S, transitionBattleCountdown } from '../game/preBattleCountdown.ts';
import { createSoloBattleEntryRuntime } from '../game/soloBattleEntryRuntime.ts';
import { mainSource, mainStatement, runMainStatements } from './mainComposition.test-support.mjs';

const flush = async (turns = 12) => { for (let index = 0; index < turns; index += 1) await Promise.resolve(); };

// The solo entry: main's announce, whenGarageSettled and presentReturnFailure bindings.
const entryStatement = mainStatement('const soloBattleEntry = createSoloBattleEntryRuntime({');
assert.equal(entryStatement.split("import('./ui/garageReturnFailure.ts')").length, 2, 'one lazy notice import in the entry composition');
function soloEntry({ whenSettled = () => null, begin = async () => {}, enterGarage = async () => {} } = {}) {
  const events = [];
  const scope = {
    createSoloBattleEntryRuntime,
    battleEntryLifecycle: createBattleEntryLifecycle({ nextFrame: async () => {}, now: () => 0 }),
    bus: { emit: (type, payload) => events.push([type, payload]) },
    garageReturn: { whenSettled },
    soloBattleLoading: { begin: async (...args) => { events.push(['load', args[0], args[1]]); return begin(); } },
    battleLoad: { showPending: () => events.push(['cover']), hide: async () => events.push(['hide']) },
    audio: { loadingOn() {} },
    enterGarage: async () => { events.push(['garage']); return enterGarage(); },
    nextPaintFrame: async () => {},
    VISIBLE_TANK_IDS: ['m1a1_abrams_hc', 'leopard2a4'],
    garage: { getSelected: () => 'm1a1_abrams_hc', getSelectedMap: () => 'desert', noteBattleLoadFailed() {} },
    isChunkFailure: () => false,
    loadFailure: async () => ({ showSoloEntryFailure: () => events.push(['entry-notice']) }),
    presentGarageReturnFailure: (error, retry) => { events.push(['return-notice', error.message, typeof retry]); },
    console: { error() {}, warn() {}, info() {} },
  };
  const entry = runMainStatements(entryStatement.replace("import('./ui/garageReturnFailure.ts')", 'loadFailure()'), scope, 'soloBattleEntry');
  return { entry, events, lifecycle: scope.battleEntryLifecycle };
}

{
  // A Play-menu or campaign start (beginSelected) announces its battle on main's bus, inside the press, before its cover.
  const { entry, events } = soloEntry();
  await entry.beginSelected({ specId: 'leopard2a4', mapId: 'winter', gameMode: 'standard', campaignOperationId: 'op-1' });
  assert.deepEqual(events[0], ['ui:battleStart', { specId: 'leopard2a4', mapId: 'winter', gameMode: 'standard', campaignOperationId: 'op-1' }],
    "main binds the entry's announce to ui:battleStart (profile history for menu and campaign battles)");
  assert.deepEqual(events.slice(1).map(([type]) => type), ['cover', 'load']);
  // The Garage button announced its own press: begin() does not announce twice.
  const button = soloEntry();
  await button.entry.begin('m1a1_abrams_hc', 'desert');
  assert.equal(button.events.some(([type]) => type === 'ui:battleStart'), false);
}

{
  // A start accepted while a Garage return is in flight waits for it: main binds whenGarageSettled to the return.
  let settle;
  const settled = new Promise((resolve) => { settle = resolve; });
  const { entry, events } = soloEntry({ whenSettled: () => settled });
  const pending = entry.beginSelected();
  await flush();
  assert.deepEqual(events.map(([type]) => type), ['ui:battleStart'], 'no cover and no load while the return is in flight');
  settle();
  await pending;
  assert.deepEqual(events.map(([type]) => type), ['ui:battleStart', 'cover', 'load']);
}

{
  // A failed entry whose recovery return fails too: main binds presentReturnFailure to the return notice.
  const { entry, events, lifecycle } = soloEntry({
    begin: async () => { throw new Error('world build failed'); },
    enterGarage: async () => { throw new Error('restore failed'); },
  });
  const quiet = console.error;
  console.error = () => {}; // the entry's default reportError
  try { await entry.beginSelected(); } finally { console.error = quiet; }
  assert.deepEqual(events.slice(-2), [['hide'], ['return-notice', 'restore failed', 'function']],
    'the cover comes down and the return notice offers its retry');
  assert.equal(lifecycle.renderingCovered, false);
}

// The reveal: main's canReveal reads the battle's scene (isPresentable runs over the real scheduler in
// battleEntryReveal.selftest.mjs).
{
  const game = { phase: 'garage', tanks: [] };
  const lifecycle = runMainStatements(mainStatement('const battleEntryLifecycle = createBattleEntryLifecycle({'), {
    createBattleEntryLifecycle, game, graphicsContextLost: false, frameLoop: { presenting: true },
    nextFrame: async () => {}, revealTimeoutForField: () => 1000, sceneWatchdogEntryGeneration: 0, coveredBattleWatchdog: null,
  }, 'battleEntryLifecycle');
  await assert.rejects(lifecycle.run(() => lifecycle.primeReveal(), 'busy'), /left the screen/,
    'a reveal whose battle is not on screen abandons at once');
  assert.match(mainStatement('const battleEntryLifecycle = createBattleEntryLifecycle({'),
    /isPresentable: \(\) => !graphicsContextLost && frameLoop\.presenting,/, "the reveal's clock is the frame owner's own");
}

// The lifecycle's late-bound readers: an entry's cover is 'loading', a return that owes the screen is 'returning'.
{
  const game = { phase: 'battle', preBattleS: 0, result: null, resultTimeS: null, timeS: 0 };
  const appLifecycle = createAppLifecycle({ game, announce() {} });
  const scope = {
    appLifecycle,
    battleEntryLifecycle: { pending: true, renderingCovered: false },
    battleLoad: { covering: true },
    garageReturn: { state: 'idle' },
  };
  runMainStatements(mainStatement('appLifecycle.setReaders({'), scope, 'null');
  assert.equal(appLifecycle.state, 'loading', "main binds the entry cover reader");
  scope.battleEntryLifecycle.pending = false;
  assert.equal(appLifecycle.state, 'live');
  appLifecycle.transition('garage', { reason: 'test', announce: false });
  scope.garageReturn.state = 'entering';
  assert.equal(appLifecycle.state, 'returning', 'main binds the return-owed reader');
  appLifecycle.transition('garage', { reason: 'test' });
  scope.garageReturn.state = 'idle';
  assert.equal(appLifecycle.state, 'garage');
}

// The battle frame: main's countdown ports (the warm hold's expiry beacon, the rollout on main's bus).
{
  const game = { phase: 'battle', preBattleS: 0, result: null, player: { input: {}, combat: {} } };
  const events = [];
  const warnings = [];
  const frame = runMainStatements(mainStatement('const battleFrame = createBattleFrameRuntime({'), {
    createBattleFrameRuntime, game, advancePreBattleCountdown,
    settings: { isOpen: () => false },
    killcam: { isActive: () => false },
    playerFrameInput: { camera: {}, poll() {}, dispose() {} },
    onlineMatchActive: () => false,
    onlinePump: { pump() {} },
    battleWarmHold: { pending: true },
    currentHud: () => null,
    bus: { emit: (type, payload) => events.push([type, payload]) },
    console: { warn: (message) => warnings.push(message), error() {}, info() {} },
    battlePresentation: { captureSoloPoses() {}, update() {} },
    battleResultPresentation: { update() {} },
    rig: { mode: 'ARCADE' },
    simStep() {},
    SIM_DT: 1 / 60,
  }, 'battleFrame');
  transitionBattleCountdown(game, 'arm');
  transitionBattleCountdown(game, 'open', 3);
  let frames = 0;
  while (game.preBattleS > 0 && frames < 1000) { frame.advance(0.1, 0.1, frames * 100, false); frames += 1; }
  assert.equal(warnings.length, 1, "main binds the hold's expiry beacon");
  assert.match(warnings[0], new RegExp(`warm hold passed ${PRE_BATTLE_WARM_HOLD_LIMIT_S} s`));
  assert.deepEqual(events.filter(([type]) => type === 'battle:rollout'), [['battle:rollout', {}]], 'one rollout on main\'s bus');
}

// Every Garage return caller without an exit of its own takes main's (garageReturnState.selftest.mjs runs it).
assert.match(mainSource, /setGarageSpots, setGarageSunTrim, enterGarage: enterGarageWithExit,/, "the Studio's exit");
assert.match(mainSource, /enterGarage: enterGarageWithExit,\n\s+returnToGarage: \(\) => garageReturn\.leave\(\),/, "the room's covered restore");
assert.match(mainStatement('const soloBattleEntry = createSoloBattleEntryRuntime({'),
  /presentReturnFailure: \(error, retry\) => presentGarageReturnFailure\(error, retry\),/, "the solo entry's recovery");
assert.match(mainStatement('const battleAgainAction = createBattleAgainAction({'),
  /getRetry: \(\) => \(garageReturn\.state === 'failed' \? retryGarageReturn : null\),/, "Battle Again's notice");

console.log('mainFlowPorts.selftest: main binds the entry announce, return wait and notice, reveal, lifecycle readers and countdown beacons passed');
