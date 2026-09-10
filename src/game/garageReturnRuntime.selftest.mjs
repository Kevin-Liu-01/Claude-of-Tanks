import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createGarageReturnRuntime } from './garageReturnRuntime.ts';
import { createGameState } from './stateCore.ts';

function createFixture({
  transitionGate = false, battleCoverDelay = 0, pendingClearsAfter = 2,
  triggerAccepted = true, triggerError = null,
  onClearPresentation = null, placement = null, restore = null,
  createEntryScheduler = undefined, onResetHudFrame = null, onShowGarage = null,
} = {}) {
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
  let pendingPolls = 0;
  const adoptedVisual = { id: 'hero' };

  const runtime = createGarageReturnRuntime({
    game,
    getSelectedSpecId: () => 'm1a2',
    presentation: {
      setAdaptiveSuspended: (value) => calls.push(['adaptive', value]),
      clearBattle: () => {
        calls.push(['clearPresentation']);
        onClearPresentation?.(runtime);
      },
      resetBattleTank: () => calls.push(['resetBattleTank']),
      suspendEffects: () => calls.push(['suspendEffects']),
      setShotMode: (value) => calls.push(['shotMode', value]),
      setCaptureHidden: (value) => calls.push(['captureHidden', value]),
      unfreezeEffects: () => calls.push(['unfreezeEffects']),
      resetHudFrame: () => { calls.push(['resetHudFrame']); onResetHudFrame?.(); },
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
      ensureGaragePlacement: async () => {
        calls.push(['garagePlacement']);
        await placement?.();
      },
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
      showGarage: (specId) => { calls.push(['showGarage', specId]); onShowGarage?.(); },
      poseGarageCamera: () => calls.push(['poseGarageCamera']),
      startShowroom: () => calls.push(['startShowroom']),
      triggerBattle: () => {
        triggerCount += 1;
        calls.push(['triggerBattle']);
        if (triggerError) throw triggerError;
        if (!triggerAccepted) return false;
        if (battleCoverDelay === 0) entryCovering = true;
        return true;
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
        try {
          await work();
          if (gate) await gate;
        } finally {
          calls.push(['transitionEnd']);
        }
      },
    },
    restoreGaragePresentation: async () => {
      calls.push(['restoreGaragePresentation']);
      if (restore) return restore();
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
    createEntryScheduler,
    isBattleEntryPending: () => entryPending,
    isBattleEntryCovering: () => entryCovering,
    nowMs: () => now,
    sleep: async (milliseconds) => {
      calls.push(['sleep', milliseconds]);
      now += milliseconds;
      if (entryPending) {
        pendingPolls += 1;
        if (pendingPolls >= pendingClearsAfter) entryPending = false;
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
    advanceMs(milliseconds) { now += milliseconds; },
    setPreserveRoom(value) { preserveRoom = value; },
    setEntryPending(value) { entryPending = value; },
    setTriggerAccepted(value) { triggerAccepted = value; },
    setTriggerError(value) { triggerError = value; },
    setPlacement(value) { placement = value; },
    setRestore(value) { restore = value; },
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
assert.equal(direct.runtime.lastTrace.presentationUnready, false,
  'only the completed exact Garage restore releases return readiness');

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
const firstRematch = rematch.runtime.battleAgain();
assert.equal(firstRematch, rematch.runtime.battleAgain(),
  'repeat result clicks join the pending return instead of re-entering');
await firstRematch;
assert.equal(rematch.calls.filter(([name]) => name === 'sleep').length, 2);
assert.equal(rematch.calls[0][0], 'transitionStart',
  'the result veil starts before waiting for an existing entry');
assert.ok(rematch.calls.findIndex(([name]) => name === 'sleep')
  < rematch.calls.findIndex(([name]) => name === 'clearPresentation'),
  'the existing battle and report survive until the previous entry finishes');
assert.equal(rematch.calls.find(([name]) => name === 'transitionStart')[1].minShowMs, 420);
assert.equal(rematch.calls.find(([name]) => name === 'transitionStart')[1].holdSceneDuringFadeIn, true,
  'only Battle Again opts into retaining the old result frame during fade-in');
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

const stuckEntry = createFixture({ pendingClearsAfter: Infinity });
stuckEntry.setEntryPending(true);
await assert.rejects(stuckEntry.runtime.battleAgain(), /previous battle is still loading/);
assert.equal(stuckEntry.game.phase, 'battle', 'timeout does not mutate the entry-owned phase');
assert.equal(stuckEntry.game.preBattleS, 3, 'timeout does not cancel the entry-owned countdown');
assert.equal(stuckEntry.triggerCount, 0);
assert.equal(stuckEntry.calls.some(([name]) => name === 'clearPresentation'), false,
  'timeout must fail closed before teardown, report dismissal, or room disposal');
assert.equal(stuckEntry.calls.some(([name]) => name === 'garagePlacement'), false);
assert.equal(stuckEntry.calls.at(-1)[0], 'transitionEnd', 'failure releases the veil');
assert.equal(stuckEntry.runtime.transitioning, false, 'failure releases the action latch');
stuckEntry.setEntryPending(false);
await stuckEntry.runtime.battleAgain();
assert.equal(stuckEntry.triggerCount, 1, 'a later click retries after entry finishes');

const unavailableBattle = createFixture({ triggerAccepted: false });
await assert.rejects(unavailableBattle.runtime.battleAgain(), /Battle Again is unavailable/);
assert.equal(unavailableBattle.calls.some(([name]) => name === 'sleep'), false,
  'a missing or disabled action fails immediately, not after a silent 15-second wait');
assert.equal(unavailableBattle.game.phase, 'garage');
assert.ok(unavailableBattle.calls.findIndex(([name]) => name === 'restoreGaragePresentation')
  < unavailableBattle.calls.findIndex(([name]) => name === 'triggerBattle'),
  'an unavailable action leaves the complete restored Garage, never a skipped restore');
assert.equal(unavailableBattle.calls.at(-1)[0], 'transitionEnd');
assert.equal(unavailableBattle.runtime.transitioning, false);
unavailableBattle.setTriggerAccepted(true);
await unavailableBattle.runtime.battleAgain();
assert.equal(unavailableBattle.triggerCount, 2, 'the next enabled action can recover normally');

const triggerFailure = new Error('battle routing failed');
const throwingBattle = createFixture({ triggerError: triggerFailure });
await assert.rejects(throwingBattle.runtime.battleAgain(), (error) => error === triggerFailure);
assert.equal(throwingBattle.game.phase, 'garage');
assert.equal(throwingBattle.runtime.transitioning, false);
assert.equal(throwingBattle.calls.at(-1)[0], 'transitionEnd');
throwingBattle.setTriggerError(null);
await throwingBattle.runtime.battleAgain();
assert.equal(throwingBattle.triggerCount, 2, 'throwing adapter releases the latch for retry');

const missingCover = createFixture({ battleCoverDelay: Infinity });
await assert.rejects(missingCover.runtime.battleAgain(), /next battle did not start/);
assert.equal(missingCover.game.phase, 'garage');
assert.equal(missingCover.calls.at(-1)[0], 'transitionEnd');
assert.equal(missingCover.runtime.transitioning, false,
  'failed loading-cover handoff is explicit and cannot retain the rematch latch');

assert.throws(() => createGarageReturnRuntime({}), /requires every lifecycle port/);

const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
const restoreCoverExpression = mainSource.match(/isPresentationRestoreCovering: \(\) => ([^\n]+),\n/)?.[1];
assert.ok(restoreCoverExpression, 'exercise the actual one-line main restore adapter');
const restoreCover = new Function('game', 'garagePhasePresentation', 'garageReturn',
  `return ${restoreCoverExpression};`);
const isCovered = (fixture, restoringGpu = false) => restoreCover(
  fixture.game, { restoringGpu }, { current: fixture.runtime },
);
assert.equal(restoreCover({ phase: 'garage' }, { restoringGpu: false }, { current: null }), false,
  'pristine Garage boot never acquires or waits on a return owner');
assert.equal(isCovered(direct, true), true, 'the existing active GPU restore guard is retained');

{
  let finishPlacement;
  let reentered;
  const fixture = createFixture({
    placement: () => new Promise((resolve) => { finishPlacement = resolve; }),
    onClearPresentation(runtime) {
      assert.equal(runtime.lastTrace.presentationUnready, true,
        'entry ownership is published before the first scene-mutating adapter');
      reentered = runtime.enter({ preserveRoom: false });
    },
  });
  const entered = fixture.runtime.enter();
  assert.equal(reentered, entered, 'synchronous re-entry joins the already-owned entry');
  assert.equal(fixture.runtime.enter(), entered, 'direct recovery callers coalesce across placement waits');
  assert.equal(fixture.calls.filter(([name]) => name === 'clearPresentation').length, 1);
  assert.equal(fixture.calls.some(([name]) => name === 'closeMatch'), false,
    'a coalesced caller cannot change the original retained-room policy');
  assert.equal(isCovered(fixture), true, 'ordinary Garage frames remain blocked before GPU warming begins');
  finishPlacement();
  await entered;
  assert.equal(isCovered(fixture), false);
}

for (const failure of ['placement', 'restore', 'missing-receipt']) {
  const error = new Error(`Garage ${failure} failed`);
  const fixture = createFixture({
    placement: failure === 'placement' ? async () => { throw error; } : null,
    restore: failure === 'restore' ? async () => { throw error; }
      : failure === 'missing-receipt' ? async () => null : null,
  });
  const failed = fixture.runtime.leave();
  await assert.rejects(failed, (caught) => failure === 'missing-receipt'
    ? /without a presentation restore receipt/.test(caught.message) : caught === error);
  assert.equal(fixture.runtime.transitioning, false, 'failed return releases its action latch for retry');
  const failedTrace = fixture.runtime.lastTrace;
  assert.equal(failedTrace.presentationUnready, true,
    `${failure}: settling the failed promise does not declare Garage presentation ready`);
  assert.equal(isCovered(fixture), true, `${failure}: ordinary frames cannot cold-render after failure unwind`);
  assert.equal(fixture.calls.some(([name]) => name === 'adaptive'), false);
  for (const phase of ['battle', 'ended', 'shot']) {
    fixture.game.phase = phase;
    assert.equal(isCovered(fixture), false, `${phase}: stale failed Garage state cannot freeze an alternate phase`);
  }
  fixture.game.phase = 'garage';
  fixture.setPlacement(null);
  let finishRestore;
  fixture.setRestore(() => new Promise((resolve) => { finishRestore = resolve; }));
  const retry = fixture.runtime.leave();
  for (let i = 0; i < 20 && !finishRestore; i += 1) await Promise.resolve();
  assert.ok(finishRestore, 'covered retry reaches the exact restore owner');
  assert.equal(isCovered(fixture), true, 'retry remains blocked across the actual restore wait');
  finishRestore(direct.runtime.lastTrace.presentationRestore);
  await retry;
  assert.equal(isCovered(fixture), false, 'successful covered retry releases the current presentation');
  assert.equal(failedTrace.presentationUnready, true, 'failed historical receipt is never rewritten as success');
  assert.notEqual(fixture.runtime.lastTrace, failedTrace);
}

assert.equal(unavailableBattle.runtime.lastTrace.presentationUnready, false,
  'a failed Battle trigger after a successful restore leaves a usable Garage');
assert.equal(stuckEntry.runtime.lastTrace.presentationUnready, false,
  'a later successful retry owns a complete restore receipt');
assert.doesNotMatch(mainSource, /function enterGarage\(/,
  'main must not own the Garage return transaction');
assert.doesNotMatch(mainSource, /let leavingBattle\s*=/,
  'main must not retain transition-coalescing state');
assert.match(mainSource, /const garageReturn = createGarageReturnAccess(?:<[^>]+>)?\(\{/,
  'the composition root must delegate Garage return ownership through the lazy facade');
assert.doesNotMatch(mainSource, /import \{ createGarageReturnRuntime \}/,
  'Garage return implementation must remain outside the boot-critical graph');

const contextRestoreBody = mainSource.match(/async onRestored\(\) \{([\s\S]*?)\n  \},\n\};/)?.[1];
assert.ok(contextRestoreBody, 'exercise the actual production context-restored adapter');
function contextRecoveryFixture(fixture) {
  let lost = false;
  let gpuRestores = 0;
  let rearmed = 0;
  const renderer = { info: {}, getContext: () => ({ isContextLost: () => lost }) };
  const adapter = new Function('ports', `
    const {renderer, game, garageReturn, garagePhasePresentation} = ports;
    const combatWarmComposition = { resetRendererWarmState() {} };
    const getDeviceTier = () => 'desktop';
    const nextFrame = async () => {};
    const viewport = { apply() {} };
    const post = { resetAdaptiveResolution() {}, setAdaptiveSuspended() {} };
    const lighting = { update() {} };
    const rearmRafAfterContext = ports.rearm;
    let graphicsContextLost = true;
    let garagePresentationDirty = true;
    return { async restore() { ${contextRestoreBody} },
      get blocked() { return graphicsContextLost; },
      get dirty() { return garagePresentationDirty; } };
  `)({ renderer, game: fixture.game, garageReturn: fixture.runtime,
    garagePhasePresentation: { async restoreGpu() { gpuRestores += 1; } },
    rearm() { rearmed += 1; } });
  return { adapter, renderer, loseContext() { lost = true; },
    get gpuRestores() { return gpuRestores; }, get rearmed() { return rearmed; } };
}

for (const preserveRoom of [true, false]) {
  const fixture = createFixture({ placement: async () => { throw new Error('context lost during placement'); } });
  await assert.rejects(fixture.runtime.enter({ preserveRoom }), /context lost/);
  const interrupted = fixture.runtime.lastTrace;
  fixture.setPreserveRoom(!preserveRoom);
  fixture.setPlacement(null);
  const recovery = contextRecoveryFixture(fixture);
  await recovery.adapter.restore();
  assert.equal(fixture.calls.filter(([name]) => name === 'garagePlacement').length, 2,
    'a GPU-only receipt cannot certify the interrupted placement transaction');
  assert.equal(fixture.calls.filter(([name]) => name === (preserveRoom ? 'disposeNetworkPresentation' : 'closeMatch')).length, 2,
    'canonical recovery retains the originally resolved room policy, not current session inference');
  assert.equal(recovery.gpuRestores, 0, 'canonical entry owns the single complete GPU restore');
  assert.equal(interrupted.presentationUnready, true, 'the old failed trace remains historical');
  assert.equal(isCovered(fixture), false, 'actual main render guard releases only the new complete return');
  assert.equal(recovery.adapter.blocked, false);
  assert.equal(recovery.rearmed, 1);
}

{
  let rejectPlacement;
  const fixture = createFixture({ placement: () => new Promise((_resolve, reject) => { rejectPlacement = reject; }) });
  const entry = fixture.runtime.enter();
  const rejectedEntry = assert.rejects(entry, /old context/);
  const recovery = contextRecoveryFixture(fixture);
  const restored = recovery.adapter.restore();
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  assert.equal(recovery.adapter.blocked, true);
  assert.equal(recovery.gpuRestores, 0, 'recovery waits for original teardown to settle');
  fixture.setPlacement(null);
  rejectPlacement(new Error('old context'));
  await Promise.all([rejectedEntry, restored]);
  assert.equal(isCovered(fixture), false);
  assert.equal(recovery.adapter.blocked, false);
}

{
  const fixture = createFixture({ restore: async () => { throw new Error('lost device'); } });
  await assert.rejects(fixture.runtime.enter(), /lost device/);
  let finishRestore;
  fixture.setRestore(() => new Promise((resolve) => { finishRestore = resolve; }));
  const first = fixture.runtime.recoverAfterContextRestore(() => true);
  assert.equal(first, fixture.runtime.recoverAfterContextRestore(() => true), 'concurrent recovery shares one canonical retry');
  for (let i = 0; i < 20 && !finishRestore; i += 1) await Promise.resolve();
  assert.equal(isCovered(fixture), true);
  finishRestore(direct.runtime.lastTrace.presentationRestore);
  assert.equal(await first, true);
  assert.equal(fixture.calls.filter(([name]) => name === 'clearPresentation').length, 2);
}

for (const phase of ['battle', 'ended', 'shot']) {
  const fixture = createFixture({ placement: async () => { throw new Error('lost device'); } });
  await assert.rejects(fixture.runtime.enter(), /lost device/);
  fixture.game.phase = phase;
  const callCount = fixture.calls.length;
  const recovery = contextRecoveryFixture(fixture);
  await recovery.adapter.restore();
  assert.equal(fixture.game.phase, phase, 'context recovery must not steal a newer non-Garage phase');
  assert.equal(fixture.calls.length, callCount);
  assert.equal(recovery.gpuRestores, 0);
}

for (const boundary of ['before-retry', 'placement', 'restore']) {
  const fixture = createFixture({ placement: async () => { throw new Error('lost device'); } });
  await assert.rejects(fixture.runtime.enter(), /lost device/);
  fixture.setPlacement(null);
  const recovery = contextRecoveryFixture(fixture);
  if (boundary === 'before-retry') recovery.loseContext();
  if (boundary === 'placement') fixture.setPlacement(async () => { recovery.renderer.info = {}; });
  if (boundary === 'restore') fixture.setRestore(async () => {
    recovery.loseContext(); return direct.runtime.lastTrace.presentationRestore;
  });
  await assert.rejects(recovery.adapter.restore(), /context|superseded/);
  assert.equal(isCovered(fixture), true, `${boundary}: stale completion never releases return ownership`);
  assert.equal(recovery.adapter.blocked, true, `${boundary}: actual main retains graphics safety on failure`);
  assert.equal(recovery.rearmed, 0);
  if (boundary !== 'restore') assert.equal(fixture.calls.some(([name]) => name === 'restoreGaragePresentation'), false);
}

{
  const fixture = createFixture({ placement: async () => { throw new Error('lost device'); } });
  await assert.rejects(fixture.runtime.enter(), /lost device/);
  fixture.setPlacement(null);
  const recovery = fixture.runtime.recoverAfterContextRestore(() => true);
  const newerEntry = fixture.runtime.enter({ preserveRoom: false });
  await Promise.all([newerEntry, recovery]);
  assert.equal(fixture.calls.filter(([name]) => name === 'clearPresentation').length, 2,
    'a recovery queued before a newer direct entry joins it rather than starting an older-policy third entry');
  assert.equal(fixture.calls.filter(([name]) => name === 'closeMatch').length, 1);
  assert.equal(isCovered(fixture), false);
}

{
  const fixture = createFixture();
  fixture.game.phase = 'garage';
  const recovery = contextRecoveryFixture(fixture);
  await recovery.adapter.restore();
  assert.equal(fixture.calls.length, 0, 'ordinary Garage context recovery has no return teardown to replay');
  assert.equal(recovery.gpuRestores, 1, 'ordinary Garage keeps the existing GPU-only restore path');
}

{
  const fixture = createFixture({ placement: async () => { throw new Error('lost first device'); } });
  await assert.rejects(fixture.runtime.enter(), /lost first device/);
  let finishOldPlacement;
  let placements = 0;
  fixture.setPlacement(() => {
    placements += 1;
    if (placements === 1) return new Promise((resolve) => { finishOldPlacement = resolve; });
  });
  const recovery = contextRecoveryFixture(fixture);
  const first = recovery.adapter.restore();
  const expired = assert.rejects(first, /superseded|context/);
  for (let i = 0; i < 20 && !finishOldPlacement; i += 1) await Promise.resolve();
  assert.ok(finishOldPlacement);
  recovery.renderer.info = {}; // Three's second restored renderer lifetime.
  const second = recovery.adapter.restore();
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  assert.equal(placements, 1, 'healthy second context waits for stale transaction cleanup');
  assert.equal(recovery.adapter.blocked, true);
  finishOldPlacement();
  await expired;
  await second;
  assert.equal(placements, 2, 'second context retries with its own live predicate');
  assert.equal(fixture.calls.filter(([name]) => name === 'restoreGaragePresentation').length, 1,
    'the expired context cannot reach presentation restore');
  assert.equal(isCovered(fixture), false);
  assert.equal(recovery.adapter.blocked, false);
  assert.equal(recovery.rearmed, 1, 'only the healthy restoration resumes frame ownership');
}

for (const boundary of ['context', 'phase']) {
  const fixture = createFixture({ placement: async () => { throw new Error('old placement'); } });
  await assert.rejects(fixture.runtime.enter(), /old placement/);
  let finishNewPlacement;
  fixture.setPlacement(() => new Promise((resolve) => { finishNewPlacement = resolve; }));
  const recovery = contextRecoveryFixture(fixture);
  const oldRecovery = recovery.adapter.restore();
  const result = boundary === 'context' ? assert.rejects(oldRecovery, /expired context/) : oldRecovery;
  // The actual adapter has entered recovery, which captured the old failed
  // trace but has not resumed its initial await. A direct user return wins.
  await Promise.resolve();
  const newerEntry = fixture.runtime.enter({ preserveRoom: false });
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  assert.ok(finishNewPlacement, 'newer canonical entry is pending under the context cover');
  if (boundary === 'context') recovery.renderer.info = {};
  else fixture.game.phase = 'battle';
  finishNewPlacement();
  await Promise.all([newerEntry, result]);
  assert.equal(recovery.gpuRestores, 0,
    `${boundary}: obsolete recovery cannot perform a GPU-only restore after the newer-entry wait`);
  assert.equal(recovery.adapter.dirty, true,
    `${boundary}: obsolete Garage continuation cannot clear another presentation's dirty state`);
  if (boundary === 'context') {
    assert.equal(recovery.adapter.blocked, true);
    assert.equal(recovery.rearmed, 0);
  } else assert.equal(fixture.game.phase, 'battle');
}

{
  const fixture = createFixture();
  fixture.game.phase = 'garage';
  const recovery = contextRecoveryFixture(fixture);
  fixture.runtime.recoverAfterContextRestore = async () => {
    recovery.renderer.info = {};
    return false;
  };
  await assert.rejects(recovery.adapter.restore(), /superseded/);
  assert.equal(recovery.gpuRestores, 0,
    'actual main adapter revalidates the async owner result before starting the GPU fallback');
  assert.equal(recovery.adapter.dirty, true);
  assert.equal(recovery.adapter.blocked, true);
  assert.equal(recovery.rearmed, 0);
}

// Execute the actual browser adapter with deterministic device and scheduling
// ports. No sleep substitution: each chosen checkpoint has its own deferred task.
const schedulerBody = mainSource.match(/createEntryScheduler: \(\) => \{([\s\S]*?)\n  \},\n  isBattleEntryPending/)?.[1];
assert.ok(schedulerBody, 'main supplies a per-entry renderer-lifetime scheduler');
const makeMainEntryScheduler = new Function('renderer', 'createOpaqueLoadingYielder', 'nextPaintFrame',
  `return () => {${schedulerBody}\n};`);

function createScheduledFixture({ workMs = 10 } = {}) {
  const pendingYields = [];
  const frameOpportunity = () => Promise.resolve();
  let contextLost = false;
  let afterNextValidityCheck;
  let context = { isContextLost: () => {
    const callback = afterNextValidityCheck;
    afterNextValidityCheck = undefined;
    if (callback) queueMicrotask(callback);
    return contextLost;
  } };
  const renderer = { info: {}, getContext: () => context };
  let factoryCalls = 0;
  let fixture;
  const createEntryScheduler = makeMainEntryScheduler(renderer,
    (budgetMs, paintEveryMs, options) => {
      factoryCalls += 1;
      assert.equal(budgetMs, 8);
      assert.equal(paintEveryMs, 32);
      assert.equal(options.yieldFrame, frameOpportunity,
        'the existing bounded paint-and-task primitive supplies paint opportunities');
      return (force) => {
        assert.equal(force, true, 'spent owner budget cannot turn into a scheduler no-op');
        assert.equal(fixture.game.phase, 'garage');
        assert.equal(fixture.runtime.lastTrace.presentationUnready, true);
        assert.equal(isCovered(fixture), true,
          'actual main blocks ordinary rendering of partial roots at every scheduling boundary');
        return new Promise((resolve, reject) => pendingYields.push({ resolve, reject }));
      };
    }, frameOpportunity);
  fixture = createFixture({
    createEntryScheduler,
    onClearPresentation: () => fixture.advanceMs(workMs),
    placement: () => fixture.advanceMs(workMs),
    onResetHudFrame: () => fixture.advanceMs(workMs),
    onShowGarage: () => fixture.advanceMs(workMs),
  });
  return Object.assign(fixture, {
    pendingYields,
    renderer,
    loseContext() { contextLost = true; },
    replaceContext() { context = { isContextLost: () => false }; },
    restoreContext() { contextLost = false; renderer.info = {}; },
    afterNextValidityCheck(callback) { afterNextValidityCheck = callback; },
    getFactoryCalls() { return factoryCalls; },
  });
}

async function takeCheckpoint(fixture, index) {
  for (let step = 0; step < 30 && !fixture.pendingYields[index]; step += 1) await Promise.resolve();
  assert.ok(fixture.pendingYields[index], `checkpoint ${index + 1} is reached without timers`);
  return fixture.pendingYields[index];
}

{
  const fixture = createScheduledFixture();
  const entered = fixture.runtime.enter();
  assert.equal(fixture.runtime.enter({ preserveRoom: false }), entered,
    'a second return joins rather than steals a yielded transaction');
  const nextCalls = ['noteActivity', 'closeSettings', 'repaintHero', 'poseGarageCamera'];
  for (let index = 0; index < 4; index += 1) {
    const checkpoint = await takeCheckpoint(fixture, index);
    assert.equal(fixture.calls.some(([name]) => name === nextCalls[index]), false,
      `${nextCalls[index]} cannot run before its preceding checkpoint completes`);
    fixture.advanceMs(100);
    checkpoint.resolve();
  }
  await entered;
  assert.deepEqual(fixture.calls.map(([name]) => name), direct.calls.map(([name]) => name),
    'all original lifecycle calls remain in their original order');
  assert.equal(fixture.getFactoryCalls(), 1, 'coalesced callers never allocate another scheduler');
  assert.equal(fixture.runtime.lastTrace.cooperativeYieldCount, 4);
  assert.equal(fixture.runtime.lastTrace.cooperativeYieldMs, 400);
  assert.equal(Object.values(fixture.runtime.lastTrace.stages).reduce((sum, value) => sum + value, 0), 40,
    '400 ms of deferred scheduling is not reported as stage work');
  assert.equal(fixture.runtime.lastTrace.totalMs, 440, 'total owner duration honestly retains scheduling time');
  assert.equal(isCovered(fixture), false);
  assert.equal(fixture.calls.some(([name]) => name === 'closeMatch'), false);
}

{
  const fixture = createScheduledFixture({ workMs: 0 });
  await fixture.runtime.enter();
  assert.equal(fixture.pendingYields.length, 0, 'unspent work budgets incur no added await or forced frame');
  assert.equal(fixture.runtime.lastTrace.cooperativeYieldCount, 0);
  assert.equal(fixture.runtime.lastTrace.cooperativeYieldMs, 0);
}

for (const kind of ['phase', 'context-loss', 'info-replacement', 'context-replacement',
  'scheduler-rejection', 'outer-resume-phase', 'outer-resume-context']) {
  for (let canceledCheckpoint = 0; canceledCheckpoint < 4; canceledCheckpoint += 1) {
    const fixture = createScheduledFixture();
    const rejectedYield = new Error('checkpoint task failed');
    const entered = fixture.runtime.enter();
    const rejected = assert.rejects(entered, (error) => kind === 'scheduler-rejection'
      ? error === rejectedYield : /superseded|context changed/.test(error.message));
    for (let index = 0; index <= canceledCheckpoint; index += 1) {
      const checkpoint = await takeCheckpoint(fixture, index);
      if (index < canceledCheckpoint) { checkpoint.resolve(); continue; }
      if (kind === 'phase') fixture.game.phase = 'battle';
      else if (kind === 'context-loss') fixture.loseContext();
      else if (kind === 'info-replacement') fixture.renderer.info = {};
      else if (kind === 'context-replacement') fixture.replaceContext();
      else if (kind === 'outer-resume-phase') fixture.afterNextValidityCheck(() => { fixture.game.phase = 'battle'; });
      else if (kind === 'outer-resume-context') fixture.afterNextValidityCheck(() => { fixture.renderer.info = {}; });
      const callsBeforeResume = fixture.calls.length;
      fixture.advanceMs(75);
      if (kind === 'scheduler-rejection') checkpoint.reject(rejectedYield);
      else checkpoint.resolve();
      await rejected;
      assert.equal(fixture.calls.length, callsBeforeResume,
        `${kind}/${index}: no further reset, placement, UI, GPU restore, or readiness mutation runs`);
      assert.equal(fixture.runtime.lastTrace.presentationUnready, true);
      assert.equal(fixture.runtime.lastTrace.cooperativeYieldCount, canceledCheckpoint + 1);
      assert.equal(fixture.runtime.lastTrace.cooperativeYieldMs, 75,
        'failed or canceled checkpoints still retain their real scheduling wait');
      assert.equal(isCovered(fixture), kind !== 'phase' && kind !== 'outer-resume-phase',
        'an abandoned Garage remains blocked without freezing a newer battle phase');
      assert.equal(fixture.calls.some(([name]) => name === 'adaptive'), false);
    }
  }
}

{
  const fixture = createScheduledFixture();
  const entered = fixture.runtime.enter({ preserveRoom: true });
  const rejected = assert.rejects(entered, /context changed/);
  (await takeCheckpoint(fixture, 0));
  fixture.loseContext();
  fixture.pendingYields[0].resolve();
  await rejected;
  fixture.restoreContext();
  fixture.setPreserveRoom(false);
  const recovered = fixture.runtime.recoverAfterContextRestore(() => true);
  for (let index = 1; index <= 4; index += 1) (await takeCheckpoint(fixture, index)).resolve();
  assert.equal(await recovered, true);
  assert.equal(fixture.getFactoryCalls(), 2, 'canonical recovery captures a fresh graphics lifetime');
  assert.equal(fixture.calls.some(([name]) => name === 'closeMatch'), false,
    'canonical recovery retains the interrupted entry room policy');
  assert.equal(isCovered(fixture), false);
}

console.log('garageReturnRuntime.selftest: room preservation, canonical recovery, budgeted covered checkpoints, leave, and rematch pass');
