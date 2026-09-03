import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createGarageReturnRuntime } from './garageReturnRuntime.ts';
import { createGameState } from './stateCore.ts';

function createFixture({ transitionGate = false, battleCoverDelay = 0 } = {}) {
  const game = createGameState();
  game.phase = 'battle';
  game.preBattleS = 3;
  game.mapId = 'verdant';
  const calls = [];
  const traces = [];
  let now = 100;
  let preserveRoom = true;
  let entryPending = false;
  let entryCovering = false;
  let coverPolls = 0;
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
        if (battleCoverDelay === 0) entryCovering = true;
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
    restoreGaragePresentation: async () => {
      calls.push(['restoreGaragePresentation']);
      return {
        totalMs: 12,
        resourcesReleased: false,
        programWarmMs: 3,
        programWarmSlices: 1,
        programCompileMs: 2,
        programCompileMaxMs: 2,
        programCompileObject: 'garage-hero',
        linkerSlices: 0,
        shadowPasses: [4, 3],
        shadowPassMax: 4,
        shadowCascadeCount: 2,
        sceneUploadBatches: [],
        sceneUploadMax: 0,
        settleFrameMs: 4,
      };
    },
    isBattleEntryPending: () => entryPending,
    isBattleEntryCovering: () => entryCovering,
    nowMs: () => now,
    sleep: async (milliseconds) => {
      calls.push(['sleep', milliseconds]);
      now += milliseconds;
      if (entryPending && calls.filter(([name]) => name === 'sleep').length === 2) {
        entryPending = false;
      }
      if (triggerCount > 0 && !entryCovering) {
        coverPolls += 1;
        if (coverPolls >= battleCoverDelay) entryCovering = true;
      }
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
assert.equal(direct.calls.at(-1)[0], 'adaptive');
assert.ok(direct.calls.findIndex(([name]) => name === 'adaptive')
  > direct.calls.findIndex(([name]) => name === 'restoreGaragePresentation'),
  'the quality governor resumes only after covered Garage restoration');
assert.ok(direct.runtime.lastTrace.stages.presentationRestore >= 0,
  'return trace owns the completed Garage presentation receipt');
assert.equal(direct.runtime.lastTrace.presentationRestore.shadowPassMax, 4,
  'return trace retains bounded shadow and upload measurements');
assert.equal(direct.runtime.lastTrace.presentationRestore.resourcesReleased, false,
  'return trace records the residency decision that shaped its work');

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
assert.deepEqual(
  leaving.calls.find(([name]) => name === 'transitionStart')[1],
  {
    kicker: 'Leaving battle',
    title: 'Garage',
    mapId: 'urban',
    progress: false,
    minShowMs: 150,
    pace: 'quick',
  },
  'battle exit uses the resident-state pace without changing transition content',
);
leaving.releaseTransition();
await firstLeave;
assert.equal(leaving.runtime.transitioning, false);

const rematch = createFixture();
rematch.setEntryPending(true);
await rematch.runtime.battleAgain();
assert.equal(rematch.calls.filter(([name]) => name === 'sleep').length, 2);
assert.equal(rematch.calls.find(([name]) => name === 'transitionStart')[1].minShowMs, 420);
assert.equal(rematch.triggerCount, 1);
assert.ok(rematch.calls.findIndex(([name]) => name === 'triggerBattle')
  < rematch.calls.findIndex(([name]) => name === 'transitionEnd'),
  'the canonical Battle action fires while the result transition still covers Garage');

const coveredHandoff = createFixture({ battleCoverDelay: 2 });
await coveredHandoff.runtime.battleAgain();
assert.equal(coveredHandoff.calls.filter(([name, milliseconds]) => (
  name === 'sleep' && milliseconds === 16
)).length, 2, 'the result veil waits until the pre-battle screen owns coverage');
assert.ok(coveredHandoff.calls.findIndex(([name]) => name === 'triggerBattle')
  < coveredHandoff.calls.findIndex(([name]) => name === 'transitionEnd'),
  'the pre-battle cover handoff completes before the result veil exits');

assert.throws(() => createGarageReturnRuntime({}), /requires every lifecycle port/);

const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
assert.doesNotMatch(mainSource, /function enterGarage\(/,
  'main must not own the Garage return transaction');
assert.doesNotMatch(mainSource, /let leavingBattle\s*=/,
  'main must not retain transition-coalescing state');
assert.match(mainSource, /const garageReturn = createGarageReturnAccess(?:<[^>]+>)?\(\{/,
  'the composition root must delegate Garage return ownership through the lazy facade');
assert.doesNotMatch(mainSource, /import \{ createGarageReturnRuntime \}/,
  'Garage return implementation must remain outside the boot-critical graph');

console.log('garageReturnRuntime.selftest: room preservation, teardown, leave, and rematch pass');
