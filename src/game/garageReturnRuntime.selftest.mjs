import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createGarageReturnRuntime } from './garageReturnRuntime.ts';
import { createGameState } from './stateCore.ts';

function createFixture({ transitionGate = false } = {}) {
  const game = createGameState();
  game.phase = 'battle';
  game.preBattleS = 3;
  game.mapId = 'verdant';
  const calls = [];
  const traces = [];
  let now = 100;
  let preserveRoom = true;
  let entryPending = false;
  let releaseTransition = null;
  let triggerCount = 0;
  const adoptedVisual = { id: 'hero' };

  const runtime = createGarageReturnRuntime({
    game,
    getSelectedSpecId: () => 'm1a2',
    presentation: {
      setAdaptiveSuspended: (value) => calls.push(['adaptive', value]),
      clearBattle: () => calls.push(['clearPresentation']),
      resetBattleTank: () => calls.push(['resetBattleTank']),
      suspendEffects: () => calls.push(['suspendEffects']),
      setShotMode: (value) => calls.push(['shotMode', value]),
      setCaptureHidden: (value) => calls.push(['captureHidden', value]),
      unfreezeEffects: () => calls.push(['unfreezeEffects']),
      resetHudFrame: () => calls.push(['resetHudFrame']),
      settleStaticShadows: () => calls.push(['settleStaticShadows']),
    },
    network: {
      shouldPreserveRoom: () => preserveRoom,
      disposePresentation: () => calls.push(['disposeNetworkPresentation']),
      closeMatch: (reason) => calls.push(['closeMatch', reason]),
    },
    warm: {
      invalidate: () => calls.push(['invalidateWarm']),
      cancel: () => calls.push(['cancelWarm']),
      setPending: (value) => calls.push(['warmPending', value]),
    },
    work: {
      noteActivity: () => calls.push(['noteActivity']),
      resetFramePacer: (at) => calls.push(['resetFramePacer', at]),
      scheduleDressing: () => calls.push(['scheduleDressing']),
    },
    world: {
      currentMapId: () => 'urban',
      ensureGaragePlacement: async () => calls.push(['garagePlacement']),
      setDormant: (value) => calls.push(['worldDormant', value]),
      setFarCascadeDormant: (value) => calls.push(['farDormant', value]),
      clearCamoOverrides: () => calls.push(['clearCamoOverrides']),
    },
    roster: {
      adoptBattlePlayer: (specId) => {
        calls.push(['adoptBattlePlayer', specId]);
        return adoptedVisual;
      },
      clearBattle: (visual) => calls.push(['clearBattle', visual]),
      repaintHero: (specId) => calls.push(['repaintHero', specId]),
    },
    settings: {
      isOpen: () => true,
      close: (options) => calls.push(['closeSettings', options]),
    },
    ui: {
      setGarageSpots: (value) => calls.push(['garageSpots', value]),
      setGarageSunTrim: (value) => calls.push(['garageSunTrim', value]),
      emitGaragePhase: () => calls.push(['emitGaragePhase', game.phase]),
      hideEndOverlay: () => calls.push(['hideEndOverlay']),
      exitPointerLock: () => calls.push(['exitPointerLock']),
      hideHud: () => calls.push(['hideHud']),
      showGarage: (specId) => calls.push(['showGarage', specId]),
      poseGarageCamera: () => calls.push(['poseGarageCamera']),
      startShowroom: () => calls.push(['startShowroom']),
      triggerBattle: () => {
        triggerCount += 1;
        calls.push(['triggerBattle']);
      },
    },
    audio: {
      ambientOn: (value) => calls.push(['ambient', value]),
      playGarageSting: () => calls.push(['garageSting']),
    },
    transition: {
      run: async (work, options) => {
        calls.push(['transitionStart', options]);
        const gate = transitionGate
          ? new Promise((resolve) => { releaseTransition = resolve; })
          : null;
        await work();
        if (gate) await gate;
        calls.push(['transitionEnd']);
      },
    },
    resumeGarageGpu: async () => { calls.push(['resumeGarageGpu']); },
    isBattleEntryPending: () => entryPending,
    nowMs: () => now,
    sleep: async (milliseconds) => {
      calls.push(['sleep', milliseconds]);
      now += milliseconds;
      if (calls.filter(([name]) => name === 'sleep').length === 2) entryPending = false;
    },
    publishTrace: (trace) => traces.push(trace),
  });

  return {
    game,
    calls,
    traces,
    runtime,
    adoptedVisual,
    setPreserveRoom(value) { preserveRoom = value; },
    setEntryPending(value) { entryPending = value; },
    releaseTransition() { releaseTransition?.(); },
    get triggerCount() { return triggerCount; },
  };
}

const direct = createFixture();
await direct.runtime.enter();
assert.equal(direct.game.phase, 'garage');
assert.equal(direct.game.preBattleS, 0);
assert.equal(direct.traces.length, 1);
assert.equal(direct.runtime.lastTrace, direct.traces[0]);
assert.equal(typeof direct.runtime.lastTrace.totalMs, 'number');
assert.deepEqual(direct.calls.find(([name]) => name === 'clearBattle'),
  ['clearBattle', direct.adoptedVisual]);
assert.ok(direct.calls.findIndex(([name]) => name === 'resetBattleTank')
  < direct.calls.findIndex(([name]) => name === 'disposeNetworkPresentation'),
  'tank-owned FX and pose state clear before retained network presentation');
assert.ok(direct.calls.findIndex(([name]) => name === 'resetBattleTank')
  < direct.calls.findIndex(([name]) => name === 'suspendEffects'),
  'battle effects reset before their inactive GPU graph is suspended');
assert.equal(direct.calls.some(([name]) => name === 'closeMatch'), false,
  'default retained rooms dispose only their battle presentation');
assert.ok(direct.calls.findIndex(([name]) => name === 'worldDormant')
  < direct.calls.findIndex(([name]) => name === 'adoptBattlePlayer'),
  'the battle world sleeps before its player visual changes owners');
assert.ok(direct.calls.findIndex(([name]) => name === 'emitGaragePhase')
  < direct.calls.findIndex(([name]) => name === 'showGarage'),
  'the Garage phase publishes before its UI is exposed');
assert.equal(direct.calls.at(-2)[0], 'resumeGarageGpu');
assert.equal(direct.calls.at(-1)[0], 'settleStaticShadows');
assert.ok(direct.runtime.lastTrace.stages.shadowSettle >= 0,
  'return trace owns the completed static shadow receipt');

const closed = createFixture();
closed.setPreserveRoom(true);
await closed.runtime.enter({ preserveRoom: false });
assert.deepEqual(closed.calls.find(([name]) => name === 'closeMatch'),
  ['closeMatch', 'returned_to_garage']);
assert.equal(closed.calls.some(([name]) => name === 'disposeNetworkPresentation'), false);

const leaving = createFixture({ transitionGate: true });
const firstLeave = leaving.runtime.leave();
const secondLeave = leaving.runtime.leave();
assert.equal(firstLeave, secondLeave, 'concurrent leave requests share one transition');
assert.equal(leaving.runtime.transitioning, true);
assert.equal(leaving.calls.filter(([name]) => name === 'transitionStart').length, 1);
assert.equal(leaving.calls[0][0], 'clearPresentation',
  'replay input state releases before the transition veil waits');
assert.equal(leaving.calls.find(([name]) => name === 'transitionStart')[1].minShowMs, 760);
leaving.releaseTransition();
await firstLeave;
assert.equal(leaving.runtime.transitioning, false);

const rematch = createFixture();
rematch.setEntryPending(true);
await rematch.runtime.battleAgain();
assert.equal(rematch.calls.filter(([name]) => name === 'sleep').length, 2);
assert.equal(rematch.calls.find(([name]) => name === 'transitionStart')[1].minShowMs, 420);
assert.equal(rematch.triggerCount, 1);
assert.ok(rematch.calls.findIndex(([name]) => name === 'transitionEnd')
  < rematch.calls.findIndex(([name]) => name === 'triggerBattle'),
  'the canonical Battle action fires only after the Garage transition completes');

assert.throws(() => createGarageReturnRuntime({}), /requires every lifecycle port/);

const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
assert.doesNotMatch(mainSource, /function enterGarage\(/,
  'main must not own the Garage return transaction');
assert.doesNotMatch(mainSource, /let leavingBattle\s*=/,
  'main must not retain transition-coalescing state');
assert.match(mainSource, /const garageReturn = createGarageReturnRuntime\(/,
  'the composition root must delegate Garage return ownership');

console.log('garageReturnRuntime.selftest: room preservation, teardown, leave, and rematch pass');
