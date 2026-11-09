// 2026-11-02 audit F3: the Garage return's state. It lived in three promises, a preparing flag, a generation and the
// published trace's flags (`presentationUnready` gated every Garage frame); a Leave during Battle Again (or the reverse)
// silently became the other operation; Battle Again polled the entry latch every 150 ms and 16 ms for 15 s.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as garageReturnModule from './garageReturnRuntime.ts';
import * as appLifecycleModule from './appLifecycle.ts';
import { assertGarageScreenSettled, canTransitionAppPhase, createAppLifecycle, GarageScreenUnsettledError, isGarageScreenSettled, transitionAppPhase } from './appLifecycle.ts';
import { createBattleEntryLifecycle } from './battleEntryLifecycle.ts';
import { createSoloBattleEntryRuntime } from './soloBattleEntryRuntime.ts';
import { createBattleAgainAction } from './battleAgainAction.ts';
import { createBus, createGameState } from './stateCore.ts';
import { createChromePointerLockPage } from './chromePointerLockPage.test-support.mjs';
import { createPointerLockFeedbackRuntime } from './pointerLockFeedbackRuntime.ts';
import { mainSource, mainStatement, runMainStatements } from '../app/mainComposition.test-support.mjs';
import { GarageRestoreAbandonedError } from '../engine/garageGpuWarmRuntime.ts';

const { createGarageReturnRuntime, GARAGE_RETURN_EDGES = {} } = garageReturnModule;

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const flush = async (turns = 12) => { for (let i = 0; i < turns; i += 1) await Promise.resolve(); };

function createFixture({ restore = null, clearBattle = () => {}, phase = 'battle', placement = null, entryScheduler = null,
  showGarage = () => {}, transitionRun = null, bus = null, exitPointerLock = () => {} } = {}) {
  const game = createGameState();
  game.phase = phase;
  const announcements = [];
  // (bus: main's, where the lifecycle announces phase:change)
  const lifecycle = createAppLifecycle({ game, announce: (announcement) => {
    announcements.push(announcement);
    bus?.emit('phase:change', announcement);
  } });
  const sleeps = [];
  let now = 0;
  let entryPending = false;
  let entryCovering = false;
  const settled = [];
  const covered = [];
  const states = [];
  let transitionWork = null;
  const noop = () => {};
  let runtime;
  const observe = () => states.push(runtime.state);
  runtime = createGarageReturnRuntime({
    game,
    getSelectedSpecId: () => 'm1a1_abrams_hc',
    presentation: { setAdaptiveSuspended: noop, clearBattle, resetBattleTank: noop, suspendEffects: noop,
      setShotMode: noop, setCaptureHidden: noop, unfreezeEffects: noop, resetHudFrame: noop },
    network: { shouldPreserveRoom: () => false, disposePresentation: noop, closeMatch: noop },
    warm: { invalidate: noop, cancel: noop, setPending: noop },
    work: { noteActivity: noop, resetFramePacer: noop, scheduleDressing: noop },
    world: { currentMapId: () => 'verdant', ensureGaragePlacement: async () => { observe(); await placement?.(); }, setDormant: noop,
      setFarCascadeDormant: noop, clearCamoOverrides: noop },
    roster: { adoptBattlePlayer: () => null, clearBattle: noop, repaintHero: noop },
    settings: { isOpen: () => false, close: noop },
    // (emitGaragePhase: the port of old, ignored now that the session's lifecycle announces the phase)
    // (exitPointerLock: main's own binding, document.exitPointerLock, when a case runs a page's pointer lock)
    ui: { setGarageSpots: noop, setGarageSunTrim: noop, emitGaragePhase: noop, hideEndOverlay: noop, exitPointerLock, hideHud: noop,
      showGarage, poseGarageCamera: noop, startShowroom: noop,
      triggerBattle: () => { game.phase = 'battle'; setTimeout(() => setCovering(true), 5); return true; } },
    audio: { ambientOn: noop, playGarageSting: noop },
    transition: { run: transitionRun ?? (async (work) => { const gate = transitionWork?.(); if (gate) await gate; return work(); }) },
    restoreGaragePresentation: async (isCurrent) => { observe(); if (restore) return restore(isCurrent); return { totalMs: 1 }; },
    ...(entryScheduler ? { createEntryScheduler: () => entryScheduler } : {}),
    isBattleEntryPending: () => entryPending,
    isBattleEntryCovering: () => entryCovering,
    whenBattleEntrySettled: () => (entryPending ? new Promise((resolve) => settled.push(resolve)) : Promise.resolve()),
    whenBattleEntryCovering: () => (entryCovering ? Promise.resolve() : new Promise((resolve) => covered.push(resolve))),
    nowMs: () => now,
    // (a fake clock: a short poll resolves at once and advances time, so the polling of old fails rather than hangs)
    sleep: (milliseconds, signal) => {
      sleeps.push(milliseconds);
      if (milliseconds < 1000) { now += milliseconds; return Promise.resolve(); }
      return new Promise((resolve) => signal?.addEventListener('abort', () => resolve(), { once: true }));
    },
  });
  function setPending(value) { entryPending = value; if (!value) for (const resolve of settled.splice(0)) resolve(); }
  function setCovering(value) { entryCovering = value; if (value) for (const resolve of covered.splice(0)) resolve(); }
  return { game, lifecycle, runtime, states, sleeps, setPending, setCovering, announcements,
    holdTransition(gate) { transitionWork = () => gate; } };
}

// The state is explicit and moves along its edges: a Leave, a preparation and its handoff, Battle Again.
{
  const f = createFixture();
  assert.equal(f.runtime.state, 'idle');
  assert.equal(f.runtime.framesSuppressed, false, 'a pristine Garage is not suppressed');
  assert.equal(f.runtime.whenSettled(), null, 'nothing in flight: nothing to wait for');
  const leaving = f.runtime.leave();
  await flush(2);
  assert.ok(f.runtime.whenSettled() instanceof Promise, 'a return in flight can be waited for');
  await leaving;
  assert.deepEqual(f.states, ['entering', 'entering'], 'placement and restore run while entering');
  assert.equal(f.runtime.state, 'idle');
  assert.equal(f.runtime.framesSuppressed, false);
  assert.equal(f.lifecycle.state, 'garage');

  f.game.phase = 'battle';
  f.states.length = 0;
  assert.equal(await f.runtime.prepare(), true);
  assert.equal(f.runtime.state, 'prepared');
  assert.equal(f.runtime.framesSuppressed, true, 'a prepared Garage stays suppressed behind the report');
  assert.equal(f.runtime.awaitingHandoff, true);
  assert.equal(f.runtime.owesGarage, false, '(round 3 B2) a battle may still start from it: the report\'s');
  assert.deepEqual(f.states, ['preparing', 'preparing']);
  await f.runtime.leave();
  assert.equal(f.runtime.state, 'idle', 'the handoff hands over a restored Garage');

  f.game.phase = 'battle';
  await f.runtime.battleAgain();
  assert.equal(f.runtime.state, 'restoreSkipped', "Battle Again leaves the Garage's restore unpaid");
  assert.equal(f.runtime.framesSuppressed, true);
  assert.equal(f.runtime.owesGarage, false, "(round 3 B2) Battle Again's own next battle takes the scene");
}

// A failed return is 'failed' (frames stay suppressed); the next return retries from there.
{
  let fail = true;
  const f = createFixture({ restore: async () => { if (fail) throw new Error('lost device'); return { totalMs: 1 }; } });
  await assert.rejects(f.runtime.leave(), /lost device/);
  assert.equal(f.runtime.state, 'failed');
  assert.equal(f.runtime.framesSuppressed, true, 'a failed return never cold-renders its partial Garage');
  assert.equal(f.runtime.owesGarage, true, '(round 3 B2) and owes the Garage: no battle takes the scene from it');
  assert.equal(f.lifecycle.screenPhase, 'garage');
  fail = false;
  await f.runtime.enter();
  assert.equal(f.runtime.state, 'idle', 'a retry from failed hands over the restored Garage');
  assert.equal(f.runtime.owesGarage, false);
}

// (round 2 U21) A start accepted while a Leave's veil still fades in (the Leave holds the return, its entry has not
// begun: a tool's click or a key press on the BATTLE control, a menu start) waits for that Leave as well. whenSettled
// read only the entry in flight, so it was null there, and the start ran its cover and its load under the veil, where
// the return's teardown then cleared them.
{
  const f = createFixture();
  const gate = deferred();
  f.holdTransition(gate.promise);
  const leaving = f.runtime.leave();
  await flush(2);
  assert.equal(f.runtime.state, 'idle', "(the Leave's entry has not begun)");
  const settled = f.runtime.whenSettled();
  assert.ok(settled instanceof Promise, 'a Leave whose veil is still fading in is a return in flight');
  let done = false;
  void settled.then(() => { done = true; });
  await flush();
  assert.equal(done, false);
  gate.resolve();
  await leaving;
  await flush();
  assert.equal(done, true, 'it settles once the Leave has handed over the Garage');
  assert.equal(f.game.phase, 'garage');
  assert.equal(f.runtime.whenSettled(), null);
  // Battle Again's own trigger starts the next battle inside its lease: it never waits for itself
  f.game.phase = 'battle';
  let seen = 'unread';
  await f.runtime.battleAgain(() => {
    seen = f.runtime.whenSettled();
    f.game.phase = 'battle';
    setTimeout(() => f.setCovering(true), 5);
    return true;
  });
  assert.equal(seen, null, "Battle Again's trigger is not queued behind Battle Again");
}

// (round 2 U21, review 2) A start queued behind a Leave covers under the Leave's veil, before the veil fades out. The
// wait covered the Leave's whole lease, the veil's dwell and fade-out included (transition.ts run() then hide()), while
// the queued start held the entry latch with no cover: main's lifecycle read 'garage' (the return idle, the entry not
// covering), so F8, the Studio button and the Studio's own entry passed over the uncovered Garage (.cot-trans.out passes
// presses), and the start then announced, covered and loaded its battle over the Studio. The wait ends when the Leave's
// entry settles: the restored Garage is the scene, and the start's cover lands in that same microtask chain.
{
  const fadeIn = deferred();
  const fadeOut = deferred();
  let veil = 'off';
  const f = createFixture({
    // transition.ts run(): fade in, the work under the opaque veil, then the dwell and hide()'s fade-out, awaited
    transitionRun: async (work) => {
      veil = 'fading-in';
      await fadeIn.promise;
      veil = 'opaque';
      const result = await work();
      veil = 'dwell'; // still opaque: run() holds minShowMs on a timer, then hide() adds .out (presses pass) and fades
      await new Promise((resolve) => setTimeout(resolve, 0));
      veil = 'fading-out';
      await fadeOut.promise;
      veil = 'off';
      return result;
    },
  });
  const battleEntryLifecycle = createBattleEntryLifecycle({ nextFrame: async () => {}, now: () => 0 });
  const battleLoad = { covering: false };
  // main's own late readers (main.ts appLifecycle.setReaders) over the real latch and this return
  runMainStatements(mainStatement('appLifecycle.setReaders({'), {
    appLifecycle: f.lifecycle, battleEntryLifecycle, battleLoad, onlineMatch: { current: null }, garageReturn: f.runtime,
  }, 'null');
  const covers = [];
  const loads = [];
  const loadGate = deferred();
  const solo = createSoloBattleEntryRuntime({
    lifecycle: battleEntryLifecycle,
    // (the battle's load holds until the end: the start is loading, under its cover, through the Leave's fade-out)
    loading: { begin: async () => { loads.push(f.game.phase); await loadGate.promise; } },
    battleLoad: { showPending: () => { covers.push(`${f.game.phase}/${veil}`); battleLoad.covering = true; }, hide: async () => { battleLoad.covering = false; } },
    audio: { loadingOn() {} }, enterGarage: async () => {}, nextFrame: async () => {}, isVisibleSpecId: () => true,
    getSelectedSpecId: () => 'm1a1_abrams_hc', getSelectedMapId: () => 'verdant', reportError: () => {},
    whenGarageSettled: () => f.runtime.whenSettled(),
  });
  /** F8 / the Studio button / Window.__STUDIO.load at this moment: studio.ts doEnter writes 'studio' when let in. */
  const studioOpens = () => {
    let refusedBy = null;
    try { assertGarageScreenSettled(f.game, 'studio:enter'); } catch (error) { refusedBy = error; }
    const opens = f.game.phase === 'garage' && isGarageScreenSettled(f.game) && refusedBy === null;
    if (opens) transitionAppPhase(f.game, 'studio', { reason: 'studio:enter' });
    return opens;
  };
  const leaving = f.runtime.leave();
  const start = solo.beginSelected({}); // a menu start (or a press) accepted during the Leave's fade-in
  await flush();
  assert.equal(veil, 'fading-in');
  assert.deepEqual(covers, [], "no cover while the Leave's entry has not run");
  assert.equal(studioOpens(), false, "the battle's scene refuses the Studio during the fade-in");
  fadeIn.resolve();
  await flush(200);
  assert.equal(veil, 'dwell', "(the Leave's entry landed: the veil dwells)");
  assert.equal(f.game.phase, 'garage');
  assert.deepEqual(covers, ['garage/dwell'], "the queued start's cover lands under the Leave's opaque veil, before its fade-out");
  await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal(veil, 'fading-out');
  assert.equal(f.lifecycle.state, 'loading', "the lifecycle reads the start's cover, never 'garage', during the fade-out");
  assert.throws(() => assertGarageScreenSettled(f.game, 'studio:enter'), (error) => error instanceof GarageScreenUnsettledError && error.state === 'loading');
  assert.equal(studioOpens(), false, 'F8, the Studio button and the Studio\'s own entry are refused during the fade-out');
  fadeOut.resolve();
  await leaving;
  loadGate.resolve();
  await start;
  await flush();
  assert.deepEqual(loads, ['garage'], 'the start loaded its battle from the Garage, never over a Studio');
}

// (round 3 B2) A start queued behind a Leave whose return then fails is refused when the wait ends. main bound the start's
// scene check to the edge table alone, and garage -> battle (or battle -> battle, a return that failed before its scene
// write) is an edge: the start announced, covered and loaded its battle under the failed return's notice (Garage frames
// suppressed), whose Retry, the return again, then tore that battle down. main's own entry composition and its one
// hand-over rule (battleSceneRefusal) over the real return, the real entry latch and the real solo entry.
{
  const f = createFixture({ restore: () => { throw new Error('the Garage presentation did not restore'); } });
  const fadeIn = deferred();
  f.holdTransition(fadeIn.promise);
  const battleEntryLifecycle = createBattleEntryLifecycle({ nextFrame: async () => {}, now: () => 0 });
  const covers = [];
  const loads = [];
  const announced = [];
  const scope = {
    game: f.game, garageReturn: f.runtime, onlineMatch: { current: null }, battleEntryLifecycle, createSoloBattleEntryRuntime,
    canTransitionAppPhase, AppPhaseTransitionError: appLifecycleModule.AppPhaseTransitionError, GarageScreenUnsettledError,
    soloBattleLoading: { begin: async () => { loads.push(f.game.phase); } },
    battleLoad: { showPending: () => covers.push(f.game.phase), hide: async () => {} },
    audio: { loadingOn() {} }, enterGarage: async () => {}, nextPaintFrame: async () => {},
    bus: { emit: (type) => announced.push(type) },
    battleEntryIntent: { begin() {} }, terrainVariantFor: () => null,
    VISIBLE_TANK_IDS: ['m1a1_abrams_hc'], garage: { getSelected: () => 'm1a1_abrams_hc', getSelectedMap: () => 'verdant' },
    // (review r1) main's return exits too: a refused start brings back the failed return's notice (offerOwedGarageReturn)
    loadFailure: async () => ({ showSoloEntryFailure() {}, showGarageReturnFailure: (error, retry) => notices.push({ error, retry }) }),
    graphicsContextLost: false,
    console: { error() {}, warn() {}, info() {} },
  };
  const notices = [];
  const rule = mainSource.includes('\nfunction battleSceneRefusal(') ? [(() => {
    const start = mainSource.indexOf('\nfunction battleSceneRefusal(');
    return mainSource.slice(start + 1, mainSource.indexOf('\n}\n', start + 1) + 2);
  })()] : [];
  const { soloBattleEntry, retryGarageReturn } = runMainStatements([
    sliceExitStatements(),
    mainStatement('const soloBattleEntry = createSoloBattleEntryRuntime({').replace("import('./ui/garageReturnFailure.ts')", 'loadFailure()'),
    ...rule,
  ], scope, '{ soloBattleEntry, retryGarageReturn }');
  const leaving = f.runtime.leave().then(() => null, (error) => error);
  const start = soloBattleEntry.beginSelected({ specId: 'm1a1_abrams_hc', mapId: 'verdant' }); // a menu start under the veil
  await flush();
  assert.deepEqual(covers, [], 'the start waits for the Leave');
  fadeIn.resolve();
  assert.ok((await leaving) instanceof Error, '(the Leave\'s return failed)');
  await start;
  await flush();
  assert.equal(f.runtime.state, 'failed', '(its notice is the screen, Garage frames suppressed)');
  assert.deepEqual([covers, loads, announced], [[], [], []],
    'the queued start is refused once the wait ends: no announcement, cover or load under the failed return (before: all three)');
  assert.equal(f.runtime.owesGarage, true, 'the failed return owes the Garage');
  assert.equal(battleEntryLifecycle.pending, false, 'and the latch is free for the Retry\'s Garage');
  // (review r1) and the refusal is never silent: it brings back the failed return's notice, whose Retry is the return
  // (the Leave's own exit opens the same notice: one presenter, one modal)
  assert.equal(notices.length, 1, 'the refused start shows the failed return\'s notice');
  assert.equal(notices[0].error.message, 'the Garage presentation did not restore');
  assert.equal(notices[0].retry, retryGarageReturn);
}

// The edge table is closed: every target is a declared state, and the in-flight states only settle.
{
  const states = Object.keys(GARAGE_RETURN_EDGES);
  assert.equal(states.length, 9, 'every declared return state has its edges');
  for (const [from, targets] of Object.entries(GARAGE_RETURN_EDGES)) {
    for (const to of targets) assert.ok(states.includes(to), `${from} -> ${to}`);
  }
  assert.deepEqual([...GARAGE_RETURN_EDGES.entering].sort(), ['failed', 'idle', 'restoreSkipped', 'superseded']);
  assert.deepEqual([...GARAGE_RETURN_EDGES.superseded].sort(), ['entering', 'preparing'], 'a superseded return is retried, never settled');
}

// A Leave during Battle Again, and Battle Again during a Leave, are refused by name; the same operation joins.
{
  const f = createFixture();
  const gate = deferred();
  f.holdTransition(gate.promise);
  const again = f.runtime.battleAgain();
  assert.equal(f.runtime.operation, 'battleAgain');
  assert.equal(f.runtime.battleAgain(), again, 'a repeated click joins');
  await assert.rejects(f.runtime.leave(), (error) => error?.name === 'GarageReturnBusyError'
    && error.active === 'battleAgain' && error.requested === 'leave');
  gate.resolve();
  await again;
  assert.equal(f.runtime.operation, null);

  f.game.phase = 'battle';
  const gate2 = deferred();
  f.holdTransition(gate2.promise);
  const leaving = f.runtime.leave();
  await assert.rejects(f.runtime.battleAgain(), { name: 'GarageReturnBusyError', code: 'garage_return_busy' });
  gate2.resolve();
  await leaving;
  assert.equal(f.game.phase, 'garage', 'the Leave kept the screen');
}

// Battle Again waits on the entry lifecycle's edges under one deadline: no polling.
{
  const f = createFixture();
  f.setPending(true);
  const again = f.runtime.battleAgain();
  await flush();
  assert.deepEqual(f.sleeps, [15_000], 'one deadline while the previous entry finishes');
  f.setPending(false);
  await again;
  assert.deepEqual(f.sleeps, [15_000, 15_000], 'one deadline for the next entry\'s cover; no 150 ms or 16 ms polls');
  assert.equal(f.runtime.state, 'restoreSkipped');
}

// (2026-11-02 audit F3 review) Every return caller gets the Leave's exit. main's own return exits (its actual
// statements), over the real return: a return that fails and still owes the screen opens the return notice, whose
// retry runs the return again ('failed' -> 'entering' -> 'idle') and announces the Garage.
const exitStatements = sliceExitStatements();
// (hoisted: round 3 B2's queued start, above, runs main's refusal exit too)
function sliceExitStatements() {
  const start = mainSource.indexOf('\nconst enterGarage = garageReturn.enter;');
  const end = mainSource.indexOf('\nappLifecycle.setReaders({', start);
  assert.ok(start > 0 && end > start, "main's return exits sit between the return and the lifecycle's readers");
  const statements = mainSource.slice(start + 1, end);
  assert.equal(statements.split("import('./ui/garageReturnFailure.ts')").length, 2, 'one lazy notice import');
  return statements.replace("import('./ui/garageReturnFailure.ts')", 'loadFailure()');
}
function mainExits(runtime) {
  const notices = [];
  const errors = [];
  const exits = runMainStatements(exitStatements, {
    garageReturn: runtime,
    console: { error: (...args) => errors.push(args), info() {}, warn() {} },
    loadFailure: async () => ({ showGarageReturnFailure: (error, retry) => notices.push({ error, retry }) }),
  }, '{ enterGarageWithExit, retryGarageReturn, presentGarageReturnFailure }');
  return { ...exits, notices, errors };
}

// The Studio's exit: the return fails before its scene write (a Studio-shaped enter: screen and scene 'studio').
{
  let failClear = true;
  const f = createFixture({ phase: 'studio', clearBattle: () => { if (failClear) { failClear = false; throw new Error('studio teardown failed'); } } });
  assert.equal(f.lifecycle.screenPhase, 'studio');
  const main = mainExits(f.runtime);
  await assert.rejects(main.enterGarageWithExit(), /studio teardown failed/, 'the Studio still sees its rejection');
  await flush();
  assert.equal(f.runtime.state, 'failed');
  assert.equal(f.game.phase, 'studio', 'failed before the scene changed hands');
  assert.equal(f.lifecycle.screenPhase, 'studio');
  assert.equal(main.notices.length, 1, 'a failed Studio exit says so: it was a frozen screen with no Garage UI, no Leave, no F8');
  assert.equal(main.notices[0].error.message, 'studio teardown failed');
  assert.equal(main.notices[0].retry, main.retryGarageReturn, 'and offers the return again');
  main.notices[0].retry();
  for (let index = 0; index < 8 && f.runtime.state !== 'idle'; index += 1) await flush();
  assert.equal(f.runtime.state, 'idle', "the notice's retry hands over a restored Garage");
  assert.equal(f.game.phase, 'garage');
  assert.deepEqual(f.announcements.map(({ phase, from }) => `${from}->${phase}`), ['studio->garage'], 'and announces it once');
  assert.equal(main.notices.length, 1);
}

// (audit F3 review) A return cut short is not a failure, over the real return. A network round that activates while the
// return builds the Garage takes the scene: the notice used to open over that battle, and its Retry cleared it.
const isSuperseded = (by) => (error) => error?.name === 'GarageReturnSupersededError' && error.code === 'garage_return_superseded' && error.by === by;
{
  let f;
  let activate = true;
  f = createFixture({
    entryScheduler: { isCurrent: () => true, yieldControl: async () => {} },
    placement: () => { if (activate) { activate = false; transitionAppPhase(f.game, 'battle', { reason: 'network-activation' }); } },
  });
  const main = mainExits(f.runtime);
  await assert.rejects(main.enterGarageWithExit(), isSuperseded('presentation'), 'the caller still sees the rejection');
  await flush();
  assert.equal(f.runtime.state, 'superseded', 'superseded, not failed');
  assert.equal(f.runtime.framesSuppressed, true, 'the Garage was never handed over restored');
  assert.equal(f.game.phase, 'battle', 'the round owns the scene');
  assert.equal(f.runtime.owesGarage, false, '(round 3 B2) and the battle that took it owes nothing to it (its next round may start)');
  assert.equal(main.notices.length, 0, 'no return notice over the battle that took the scene');
  // the Leave's catch and the solo recovery reach the same notice: it opens nothing for a superseded return
  await main.presentGarageReturnFailure(Object.assign(new Error('cut short'), { code: 'garage_return_superseded' }), () => {});
  await flush();
  assert.equal(main.notices.length, 0);
  // the round's own exit returns later: 'superseded' -> 'entering' -> 'idle'
  await main.enterGarageWithExit();
  assert.equal(f.runtime.state, 'idle');
  assert.equal(f.game.phase, 'garage');
}

// A graphics-context change during the return: no notice (whose Retry made a newer trace, so the context recovery
// ended in 'The newer Garage return is not ready' and the Reload overlay); the recovery retries the return itself.
{
  let contextCurrent = true;
  let losses = 1;
  const f = createFixture({
    entryScheduler: { isCurrent: () => contextCurrent, yieldControl: async () => {} },
    placement: () => { if (losses-- > 0) contextCurrent = false; }, // the context is lost while the Garage placement builds
  });
  const main = mainExits(f.runtime);
  await assert.rejects(main.enterGarageWithExit(), isSuperseded('context'));
  await flush();
  assert.equal(f.runtime.state, 'superseded');
  assert.equal(f.runtime.owesGarage, true, '(round 3 B2) over the Garage\'s scene the recovery owes it: no battle takes the scene');
  assert.equal(main.notices.length, 0, 'no return notice while the context recovery owes the return');
  contextCurrent = true; // the device is restored
  assert.equal(await f.runtime.recoverAfterContextRestore(() => true), true, 'the recovery retries the interrupted return');
  assert.equal(f.runtime.state, 'idle');
  assert.equal(main.notices.length, 0);
}

// main's Leave, over the real return: a failed one opens the notice with its retry (the Leave again); a superseded one
// opens none. (round 2 U20) The exit is the return's declared state, not the caller's error: a Leave whose veil was
// taken over before its work ran (transition.ts AbortError, the return never began) owes the player nothing, and opened
// the notice over the battle that still had the screen.
const leaveStatement = (() => {
  const start = mainSource.indexOf('\nconst leaveBattleToGarage = ');
  const end = mainSource.indexOf('\n};\n', start);
  assert.ok(start > 0 && end > start);
  return mainSource.slice(start + 1, end + 3);
})();
function mainLeave(runtime) {
  const exits = mainExits(runtime);
  const leave = runMainStatements([exitStatements.replace("import('./ui/garageReturnFailure.ts')", 'loadFailure()'), leaveStatement], {
    onlineMatch: { current: null }, battleEntryLifecycle: { pending: false }, garageReturn: runtime,
    console: { error() {}, info() {}, warn() {} },
    loadFailure: async () => ({ showGarageReturnFailure: (error, retry) => exits.notices.push({ error, retry }) }),
  }, 'leaveBattleToGarage');
  return { leave, notices: exits.notices };
}
{
  let failRestore = true;
  const failed = createFixture({ restore: async () => { if (failRestore) throw new Error('restore failed'); return { totalMs: 1 }; } });
  const main = mainLeave(failed.runtime);
  await main.leave();
  await flush();
  assert.equal(failed.runtime.state, 'failed');
  assert.equal(main.notices.length, 1, 'a failed Leave says so');
  failRestore = false;
  main.notices[0].retry();
  for (let index = 0; index < 8 && failed.runtime.state !== 'idle'; index += 1) await flush();
  assert.equal(failed.runtime.state, 'idle', "its retry (the Leave again) restores the Garage");

  let activate = true;
  const cut = createFixture({
    entryScheduler: { isCurrent: () => true, yieldControl: async () => {} },
    placement: () => { if (activate) { activate = false; transitionAppPhase(cut.game, 'battle', { reason: 'network-activation' }); } },
  });
  const cutMain = mainLeave(cut.runtime);
  await cutMain.leave();
  await flush();
  assert.equal(cut.runtime.state, 'superseded');
  assert.equal(cutMain.notices.length, 0, 'a superseded Leave opens no notice');

  const covered = createFixture({ transitionRun: async () => { throw new DOMException('Transition cover was superseded', 'AbortError'); } });
  const coveredMain = mainLeave(covered.runtime);
  await coveredMain.leave();
  await flush();
  assert.equal(covered.runtime.state, 'idle', 'the return never began');
  assert.equal(covered.game.phase, 'battle', 'the battle still has the screen');
  assert.equal(coveredMain.notices.length, 0, 'and no notice opens over it');
}

// (round 8 Y4 s2-03) The restore's own yield. 269 made a Leave's GPU restore current only while the Garage is the phase
// (garageReturnRuntime.ts performEntrySteps), so a phase writer that does not wait for the return (a dev still,
// window.__SHOTS: garage -> shot) abandons it at its next step. Its GarageRestoreAbandonedError reached fail() as an
// ordinary error: the return landed 'failed', main's Leave opened the failure notice over the still, and owesGarage then
// refused every later start. A restore abandoned because another presentation took the scene is superseded by it, and one
// abandoned because its caller or graphics context expired is superseded by the context (the recovery retries it, which
// is also b03868e697's context-loss case: it landed 'failed' and its notice raced the recovery).
{
  let restoreCurrent = null;
  let abandon = null;
  const f = createFixture({
    restore: (isCurrent) => new Promise((_resolve, reject) => {
      restoreCurrent = isCurrent;
      abandon = () => reject(new GarageRestoreAbandonedError());
    }),
  });
  const main = mainLeave(f.runtime);
  const leaving = main.leave();
  for (let turns = 0; turns < 40 && !restoreCurrent; turns += 1) await flush();
  assert.ok(restoreCurrent, "the Leave reached its GPU restore");
  assert.equal(restoreCurrent(), true);
  transitionAppPhase(f.game, 'shot', { reason: 'dev-still' }); // window.__SHOTS.set: it never waits for the return
  assert.equal(restoreCurrent(), false, 'the still abandons the restore at its next step');
  abandon();
  await leaving;
  await flush();
  assert.equal(f.runtime.state, 'superseded', 'superseded by the still, not failed (before: failed)');
  assert.equal(f.runtime.owesGarage, false, 'the still owes the Garage nothing');
  assert.equal(main.notices.length, 0, 'no failure notice over the still (before: one)');
  const refusal = runMainStatements(mainSource.slice(mainSource.indexOf('\nfunction battleSceneRefusal(') + 1,
    mainSource.indexOf('\n}\n', mainSource.indexOf('\nfunction battleSceneRefusal(')) + 2), {
    game: f.game, garageReturn: f.runtime, canTransitionAppPhase,
    AppPhaseTransitionError: appLifecycleModule.AppPhaseTransitionError, GarageScreenUnsettledError,
  }, "battleSceneRefusal('solo-start')");
  assert.equal(refusal, null, "a later start is not refused (main's battleSceneRefusal; before: 'a Garage return still owes the screen')");
}
{
  let contextCurrent = true;
  let restoreCurrent = null;
  let abandon = null;
  let first = true;
  const f = createFixture({
    entryScheduler: { isCurrent: () => contextCurrent, yieldControl: async () => {} },
    restore: (isCurrent) => {
      if (!first) return { totalMs: 1 };
      first = false;
      return new Promise((_resolve, reject) => {
        restoreCurrent = isCurrent;
        abandon = () => reject(new GarageRestoreAbandonedError());
      });
    },
  });
  const main = mainExits(f.runtime);
  const entering = main.enterGarageWithExit();
  for (let turns = 0; turns < 40 && !restoreCurrent; turns += 1) await flush();
  assert.ok(restoreCurrent, 'the return reached its GPU restore');
  contextCurrent = false; // the graphics context is lost while the restore runs
  assert.equal(restoreCurrent(), false);
  abandon();
  await assert.rejects(entering, (error) => isSuperseded('context')(error) && /abandoned/.test(error.message)
    && error.cause?.name === 'GarageRestoreAbandonedError', 'superseded by the context, the restore\'s error its cause');
  await flush();
  assert.equal(f.runtime.state, 'superseded', 'superseded, not failed (before: failed)');
  assert.equal(main.notices.length, 0, 'no notice races the context recovery (before: one)');
  contextCurrent = true; // the device is restored
  assert.equal(await f.runtime.recoverAfterContextRestore(() => true), true, 'the recovery retries the return');
  assert.equal(f.runtime.state, 'idle');
  assert.equal(main.notices.length, 0);
}

// (round 2 U20) The room's own returns (its room closed or left, or the seat dropped, during a revealed battle) take the
// Leave's exit too: main bound them to a bare garageReturn.leave(), whose failure reached only the room's reportError,
// so a failed room return froze the Garage with no notice and no Retry.
{
  const binding = mainSource.match(/\n\s+returnToGarage: ([^\n]+),\n/)?.[1];
  assert.ok(binding, "main binds the room's returnToGarage");
  let failRestore = true;
  const f = createFixture({ restore: async () => { if (failRestore) throw new Error('restore failed'); return { totalMs: 1 }; } });
  const notices = [];
  const room = runMainStatements(exitStatements, {
    garageReturn: f.runtime,
    console: { error() {}, info() {}, warn() {} },
    loadFailure: async () => ({ showGarageReturnFailure: (error, retry) => notices.push({ error, retry }) }),
  }, `{ returnToGarage: (${binding}) }`);
  await assert.rejects(room.returnToGarage(), /restore failed/, 'the room still sees the rejection');
  await flush();
  assert.equal(f.runtime.state, 'failed');
  assert.equal(notices.length, 1, 'a failed room return says so over the frozen Garage');
  assert.equal(typeof notices[0].retry, 'function', 'and offers the return again');
  failRestore = false;
  notices[0].retry();
  for (let index = 0; index < 8 && f.runtime.state !== 'idle'; index += 1) await flush();
  assert.equal(f.runtime.state, 'idle', "the notice's retry restores the Garage");
  assert.equal(f.game.phase, 'garage');
  assert.equal(notices.length, 1);
}

// (round 2 U20) The context recovery decides from the return's state, never its trace's diagnostics: a handoff that
// failed (state 'failed'; its trace's presentationUnready is false, since its preparation restored the Garage) was
// never retried after a context restore, so the Garage stayed frozen under frames the failed state suppresses.
{
  let failShow = false;
  const f = createFixture({ showGarage: () => { if (failShow) { failShow = false; throw new Error('garage ui failed'); } } });
  assert.equal(await f.runtime.prepare(), true, 'prepared behind the report');
  failShow = true;
  await assert.rejects(f.runtime.leave(), /garage ui failed/);
  assert.equal(f.runtime.state, 'failed', 'the handoff failed');
  assert.equal(f.runtime.lastTrace.presentationUnready, false, '(its preparation had restored the Garage)');
  assert.equal(await f.runtime.recoverAfterContextRestore(() => true), true, 'the recovery retries the failed handoff');
  assert.equal(f.runtime.state, 'idle', 'and hands over a restored Garage');
  assert.equal(f.runtime.framesSuppressed, false);
  assert.equal(f.lifecycle.screenPhase, 'garage');
  // nothing owed: nothing to recover
  assert.equal(await f.runtime.recoverAfterContextRestore(() => true), false);
}

// Battle Again whose skipped restore throws (the trigger found no battle): the visible Garage was frozen and its
// notice had no action. main's Battle Again wiring now offers the return again when the return is 'failed'.
{
  let failRestore = false;
  const f = createFixture({ restore: async () => { if (failRestore) throw new Error('restore failed'); return { totalMs: 1 }; } });
  const main = mainExits(f.runtime);
  const notices = [];
  const wiring = mainStatement('const battleAgainAction = createBattleAgainAction({')
    .replace("import('./ui/garageReturnFailure.ts')", 'loadFailure()');
  const action = runMainStatements(wiring, {
    createBattleAgainAction,
    garageReturn: { battleAgain: () => f.runtime.battleAgain(() => false), get state() { return f.runtime.state; } },
    retryGarageReturn: main.retryGarageReturn,
    game: f.game,
    battleEntryLifecycle: { entrySerial: 0 },
    onlineMatch: { current: null },
    console: { error() {}, info() {}, warn() {} },
    loadFailure: async () => ({ showGarageReturnFailure: (error, retry) => notices.push({ error, retry }), hideGarageReturnFailure() {} }),
  }, 'battleAgainAction');
  failRestore = true;
  await action.run();
  await flush();
  assert.equal(f.runtime.state, 'failed', 'the skipped restore threw');
  assert.equal(f.lifecycle.screenPhase, 'garage', 'over the visible (frozen) Garage');
  assert.equal(notices.length, 1);
  assert.equal(notices[0].retry, main.retryGarageReturn, 'the Battle Again notice offers the return again');
  failRestore = false;
  notices[0].retry();
  for (let index = 0; index < 8 && f.runtime.state !== 'idle'; index += 1) await flush();
  assert.equal(f.runtime.state, 'idle', 'and its retry restores the Garage');
}

// A Battle Again whose return was cut short opens no notice either.
{
  const notices = [];
  const action = createBattleAgainAction({
    action: () => Promise.reject(Object.assign(new Error('cut short'), { code: 'garage_return_superseded' })),
    loadFailure: async () => ({ showGarageReturnFailure: (error, retry) => notices.push({ error, retry }), hideGarageReturnFailure() {} }),
    getPhase: () => 'battle', getEntryGeneration: () => 0, getRoom: () => null, reportError() {},
  });
  await action.run();
  await flush();
  assert.equal(notices.length, 0);
}

// Battle Again that failed with the Garage restored offers no retry (the Garage is up; choose a battle there).
{
  const f = createFixture();
  const notices = [];
  const wiring = mainStatement('const battleAgainAction = createBattleAgainAction({')
    .replace("import('./ui/garageReturnFailure.ts')", 'loadFailure()');
  const action = runMainStatements(wiring, {
    createBattleAgainAction,
    garageReturn: { battleAgain: () => f.runtime.battleAgain(() => false), get state() { return f.runtime.state; } },
    retryGarageReturn: () => {},
    game: f.game,
    battleEntryLifecycle: { entrySerial: 0 },
    onlineMatch: { current: null },
    console: { error() {}, info() {}, warn() {} },
    loadFailure: async () => ({ showGarageReturnFailure: (error, retry) => notices.push({ error, retry }), hideGarageReturnFailure() {} }),
  }, 'battleAgainAction');
  await action.run();
  await flush();
  assert.equal(f.runtime.state, 'idle');
  assert.equal(notices.length, 1);
  assert.equal(notices[0].retry, null);
}

// (round 3 B2, review r1) A failed return's notice closes by its X, Escape or a press beside it, which runs nothing, and
// the return stays 'failed' until a return lands. The refusal (owesGarage) then made every Garage BATTLE press and every
// room launch a silent no-op, after the press had announced its battle (ui:battleStart: the pointer lock grabbed, the play
// surface hidden, the loading hold set); on 92f415e879 the press loaded a battle under the frozen return instead. A press
// now asks before it announces (garage.ts launchBattle's refusesBattle, bound by main), and every refusal brings back the
// way out: the failed return's notice with its Retry (a return a context change cut short over the Garage is the
// context recovery's: round 4 E13). main's own exits, Leave, solo entry, hand-over rule and room launch, and
// garage.ts's own press, over the real return, the real entry latch and the real solo entry.
// (round 4 F1) A press that waits for a return in flight announces nothing until its entry is accepted after the wait:
// garage.ts hands its announcement to the entry (onBattle's fourth argument), so a start refused after the wait leaves
// no ui:battleStart effect standing (the pointer lock over the return's notice, settings' battle state, the hidden play
// surface, post's 'loading' hold), over the Leave's Retry and the bare one (retryGarageReturn) alike.
const garageSource = readFileSync(new URL('../ui/garage.ts', import.meta.url), 'utf8');
function owedGarageMain(runtime, game, { contextRecovery = false, bus = null, loadFails = false, input = null,
  noticeState = null } = {}) {
  const events = [];
  const notices = [];
  // (review r2: `bus`, a real one the records listen on, takes main's and garage.ts's emits too; `loadFails`, the
  // entry's load throws, as a failed cold import or world build does)
  // (round 5 Q2: `input`, the real input layer main's own bindings ask for the pointer lock; `noticeState`, what a case
  // reads as each notice opens)
  const emit = (type, payload) => { events.push(`emit:${type}`); bus?.emit(type, payload); };
  const slice = (source, head, close) => {
    const start = source.indexOf(`\n${head}`);
    assert.ok(start >= 0, head);
    return source.slice(start + 1, source.indexOf(close, start + 1) + close.length);
  };
  const mainFn = (head) => slice(mainSource, head, '\n}\n');
  const garageAt = mainSource.indexOf('\nconst garage: MainGarageRuntime = ');
  const garageOptions = mainSource.slice(garageAt, mainSource.indexOf('\n}));', garageAt));
  // (round 4 F1: the binding passes the press's announcement on; 0edd0e1ab5's took three arguments)
  const onBattle = garageOptions.match(/\n {2}onBattle: (\([^)]*\) => \(\s+beginLocalBattleEntry\([^)]*\)\s+\)),/)?.[1];
  assert.ok(onBattle, "main binds the Garage press to the solo entry");
  const refusesBattle = garageOptions.match(/\n {2}refusesBattle: ([^\n]+),\n/)?.[1] ?? 'undefined'; // (absent on 92f415e879)
  const scope = {
    game, garageReturn: runtime, battleEntryLifecycle: createBattleEntryLifecycle({ nextFrame: async () => {}, now: () => 0 }),
    onlineMatch: { current: { beginRoom: async () => { events.push(`room@${game.phase}`); return true; } } },
    createSoloBattleEntryRuntime, canTransitionAppPhase, AppPhaseTransitionError: appLifecycleModule.AppPhaseTransitionError,
    GarageScreenUnsettledError,
    soloBattleLoading: { begin: async () => {
      events.push(`load@${game.phase}`);
      if (loadFails) throw new Error('the battle did not load');
    } },
    battleLoad: { showPending: () => events.push(`cover@${game.phase}`), hide: async () => {} },
    audio: { loadingOn() {} }, nextPaintFrame: async () => {}, isChunkFailure: () => false,
    bus: { emit },
    battleEntryIntent: { begin() {} }, terrainVariantFor: () => null,
    VISIBLE_TANK_IDS: ['m1a1_abrams_hc'], garage: { getSelected: () => 'm1a1_abrams_hc', getSelectedMap: () => 'verdant' },
    loadFailure: async () => ({ showSoloEntryFailure() {}, showGarageReturnFailure: (error, retry) => notices.push(
      noticeState ? { error, retry, at: noticeState() } : { error, retry }) }),
    ...(input ? { input } : {}),
    // main's `let`, written by its own context recovery (onLost, onRestored) when the case runs it
    graphicsContextLost: false,
    renderer: { info: {}, getContext: () => ({ isContextLost: () => false }), userData: {} },
    // garage.ts launchBattle's own names: its failed-load gate, its emit (the bus), the selected mode
    pressFailed: () => false, battleBtn: {}, emit, battleGameMode: 'standard',
    console: { error() {}, warn() {}, info() {} },
  };
  const main = runMainStatements([
    exitStatements, leaveStatement,
    mainStatement('const soloBattleEntry = createSoloBattleEntryRuntime({').replace("import('./ui/garageReturnFailure.ts')", 'loadFailure()'),
    ...(mainSource.includes('\nfunction battleSceneRefusal(') ? [mainFn('function battleSceneRefusal(')] : []),
    mainFn('function takeSceneForRound('), mainFn('function beginMultiplayerV2Battle('), mainFn('function beginLocalBattleEntry('),
    `const onBattle = ${onBattle};`, `const opts = { refusesBattle: ${refusesBattle} };`,
    slice(garageSource, '  function launchBattle(', '\n  }\n'),
    // (round 4 E13) main's own context recovery: onLost, and onRestored, which retries the return before it clears
    // graphicsContextLost
    ...(contextRecovery ? [slice(mainSource, 'renderer.userData.contextRecovery = {', '\n};\n')] : []),
  ], scope, '{ leave: leaveBattleToGarage, launchBattle, beginMultiplayerV2Battle, retryGarageReturn }');
  return { ...main, events, notices, scope, contextRecovery: scope.renderer.userData.contextRecovery ?? null };
}
const press = (main) => main.launchBattle('m1a1_abrams_hc', 'verdant'); // the Garage BATTLE button
const started = ['emit:ui:click', 'emit:ui:battleStart', 'cover@garage', 'load@garage'];
// a failed return whose notice was closed: the press and the room launch bring the notice back; its Retry lands
{
  let failRestore = true;
  const f = createFixture({ restore: async () => { if (failRestore) throw new Error('the Garage presentation did not restore'); return { totalMs: 1 }; } });
  const main = owedGarageMain(f.runtime, f.game);
  await main.leave();
  await flush();
  assert.equal(f.runtime.state, 'failed');
  assert.equal(main.notices.length, 1, "(the failed Leave's notice, which the player then closes: nothing runs)");
  main.events.length = 0;
  press(main);
  await flush();
  assert.deepEqual(main.events.filter((event) => /^(cover|load)@/.test(event)), [],
    'no battle loads under the failed return (92f415e879: cover and load in the Garage)');
  assert.equal(main.notices.length, 2, "the press brings back the failed return's notice (6ab835cbb4: nothing happened)");
  assert.equal(main.notices[1].error.message, 'the Garage presentation did not restore');
  assert.equal(main.notices[1].retry, main.retryGarageReturn, 'with its Retry, the return again');
  assert.deepEqual(main.events, [], 'and announces no battle: no ui:battleStart for a start that does not follow');
  await assert.rejects(main.beginMultiplayerV2Battle({}), (error) => error instanceof GarageScreenUnsettledError);
  await flush();
  assert.equal(main.notices.length, 3, 'a room launch from that Garage brings it back too (6ab835cbb4: a menu status line)');
  assert.deepEqual(main.events, [], 'and begins no round');
  failRestore = false;
  main.notices[2].retry();
  for (let index = 0; index < 8 && f.runtime.state !== 'idle'; index += 1) await flush();
  assert.equal(f.runtime.state, 'idle', 'the Retry restores the Garage');
  press(main);
  // (round 4 F1) with no return in flight the entry accepts the press at once: its announcement and its cover land
  // inside the press's task, as before (the pointer lock's request keeps its gesture)
  assert.deepEqual(main.events.slice(0, 3), started.slice(0, 3), "the press's announcement and cover, inside its task");
  await flush();
  assert.deepEqual(main.events, started, 'and the next press starts its battle');
}
// a return a context change cut short over the Garage: the context recovery's. While the graphics are lost a press is
// refused with no return notice (the context recovery's notice is the screen). (round 4 E13) Then main's own
// onRestored: it retries the return (garageReturn.recoverAfterContextRestore) before it clears graphicsContextLost, and
// only a return writes the 'garage' phase, so the graphics are never live over a return the recovery still owes; the
// press after it starts its battle. (Round three drove a state the product does not reach: the graphics live again with
// nothing retried.)
{
  let contextCurrent = true;
  let losses = 1;
  let main = null;
  const lostDuringRetry = [];
  const f = createFixture({
    entryScheduler: { isCurrent: () => contextCurrent, yieldControl: async () => {} },
    placement: () => {
      // lost while the Garage placement builds: main's onLost
      if (losses-- > 0) { contextCurrent = false; main.contextRecovery.onLost(); }
      else lostDuringRetry.push(main.scope.graphicsContextLost);
    },
  });
  main = owedGarageMain(f.runtime, f.game, { contextRecovery: true });
  assert.equal(typeof main.contextRecovery?.onRestored, 'function', "main's context recovery");
  await main.leave();
  await flush();
  assert.equal(f.runtime.state, 'superseded');
  assert.equal(f.game.phase, 'garage');
  assert.equal(main.scope.graphicsContextLost, true, "(main's onLost)");
  main.events.length = 0;
  press(main);
  await flush();
  assert.deepEqual(main.events, [], 'with the graphics lost the press is refused (92f415e879: cover and load in the Garage)');
  assert.equal(f.runtime.state, 'superseded', 'and the context recovery keeps the return: no second return beside it');
  assert.equal(main.notices.length, 0);
  contextCurrent = true; // the device is back
  assert.equal(await main.contextRecovery.onRestored(new AbortController().signal), true,
    "main's onRestored completes");
  assert.equal(f.runtime.state, 'idle', 'its recovery retried the interrupted return');
  assert.deepEqual(lostDuringRetry, [true], 'while graphicsContextLost still held: the graphics were not live over it');
  assert.equal(main.scope.graphicsContextLost, false, 'then the graphics are live, over the restored Garage');
  assert.equal(main.notices.length, 0);
  press(main);
  await flush();
  assert.deepEqual(main.events, started, 'and the press starts its battle');
}
// a press during the Retry's return waits for it: owesGarage is false while a return is in flight (that return decides),
// the window a Leave's veil fades in over the failed return included, where the state is still 'failed'
{
  let failRestore = true;
  const f = createFixture({
    restore: async () => { if (failRestore) throw new Error('the Garage presentation did not restore'); return { totalMs: 1 }; },
  });
  const main = owedGarageMain(f.runtime, f.game);
  await main.leave();
  await flush();
  assert.equal(f.runtime.state, 'failed');
  failRestore = false;
  const fadeIn = deferred();
  f.holdTransition(fadeIn.promise);
  main.notices[0].retry(); // the failed Leave's Retry: the Leave again, its veil fading in
  await flush();
  assert.equal(f.runtime.state, 'failed', "(the Retry's veil fades in: its entry has not begun)");
  assert.equal(f.runtime.owesGarage, false, 'a return in flight owes nothing yet');
  main.events.length = 0;
  press(main);
  await flush();
  // (round 4 F1) and announces nothing while it waits: the return decides whether its battle begins at all
  assert.deepEqual(main.events, ['emit:ui:click'],
    'the press waits for the return, unannounced (6ab835cbb4: refused at the press; 0edd0e1ab5: ui:battleStart at the press)');
  fadeIn.resolve();
  for (let index = 0; index < 8 && f.runtime.state !== 'idle'; index += 1) await flush();
  await flush();
  assert.equal(f.runtime.state, 'idle');
  assert.deepEqual(main.events, started, 'and announces and starts its battle once the return lands');
}
// a press during a Retry that fails again: the waiting start is refused, the notice comes back, and (round 4 F1) no
// effect of the press's announcement stands under it: none was made
{
  let hold = null;
  const f = createFixture({
    restore: async () => { throw new Error('the Garage presentation did not restore'); },
    placement: () => hold?.promise,
  });
  const main = owedGarageMain(f.runtime, f.game);
  await main.leave();
  await flush();
  assert.equal(main.notices.length, 1);
  hold = deferred();
  main.notices[0].retry();
  await flush();
  main.events.length = 0;
  press(main);
  await flush();
  assert.deepEqual(main.events, ['emit:ui:click'], '(the press waits for the Retry, unannounced)');
  hold.resolve();
  for (let index = 0; index < 8 && main.notices.length < 3; index += 1) await flush();
  assert.equal(f.runtime.state, 'failed');
  assert.deepEqual(main.events, ['emit:ui:click'],
    'no announcement, cover or load under the return that failed again (0edd0e1ab5: ui:battleStart at the press, then refused)');
  assert.equal(main.notices.length, 3, "the Retry's own notice and the refused start's (one presenter, one modal)");
  assert.ok(main.notices.slice(1).some((notice) => notice.retry === main.retryGarageReturn), "the refused start's offers the return again");
}
// (round 4 F1) the bare Retry: the refused press's notice offers the return again with no veil (retryGarageReturn, a
// bare enterGarage: the Garage UI is up while it restores, the press most likely to land here). A press while it runs
// waits unannounced; if it fails again the start is refused with nothing announced and the notice comes back; if it
// lands the press announces and starts its battle. (0edd0e1ab5: ui:battleStart at the press, standing after the
// refusal.)
{
  let failRestore = true;
  let hold = null;
  const f = createFixture({
    restore: async () => { if (failRestore) throw new Error('the Garage presentation did not restore'); return { totalMs: 1 }; },
    placement: () => hold?.promise,
  });
  const main = owedGarageMain(f.runtime, f.game);
  await main.leave();
  await flush();
  assert.equal(f.runtime.state, 'failed');
  main.events.length = 0;
  press(main); // the closed notice: the press brings it back, with the bare Retry
  await flush();
  assert.deepEqual(main.events, []);
  assert.equal(main.notices.at(-1).retry, main.retryGarageReturn, '(the refused press offers the bare Retry)');
  for (const lands of [false, true]) {
    const label = lands ? 'a bare Retry that lands' : 'a bare Retry that fails again';
    failRestore = !lands;
    hold = deferred();
    const shown = main.notices.length;
    main.notices.at(-1).retry();
    await flush();
    assert.equal(f.runtime.state, 'entering', `${label}: (its return runs, no veil)`);
    main.events.length = 0;
    press(main);
    await flush();
    assert.deepEqual(main.events, ['emit:ui:click'], `${label}: the press waits for it, unannounced`);
    hold.resolve();
    const settled = () => (lands ? main.events.length >= started.length : main.notices.length >= shown + 2);
    for (let index = 0; index < 12 && !settled(); index += 1) await flush();
    if (lands) {
      assert.equal(f.runtime.state, 'idle', label);
      assert.deepEqual(main.events, started, `${label}: the press announces and starts its battle once it lands`);
    } else {
      assert.equal(f.runtime.state, 'failed', label);
      assert.deepEqual(main.events, ['emit:ui:click'],
        `${label}: the start is refused and nothing it announced stands`);
      assert.equal(main.notices.length, shown + 2, `${label}: its notice and the refused start's`);
      assert.equal(main.notices.at(-1).retry, main.retryGarageReturn, `${label}: the bare Retry again`);
    }
  }
}

// (round 5 U15, Q2) What a press's ui:battleStart leaves standing, on a page whose pointer lock behaves as Chrome's
// (chromePointerLockPage.test-support.mjs, the model inputPointerLockFocus.selftest.mjs drives; given no clock, its
// 1250 ms post-Esc window is not modelled: these presses come after the Leave, its failed return and its notice): a
// request lands a task later; after the player's own unlock (Esc) one with no user activation (about 5 s after a press)
// is refused, after the page's own exitPointerLock it is not (Chrome's MouseLockController: last_unlocked_by_target).
// The real input layer (input.ts) asks for it, through the real pointer lock owner (pointerLockFeedbackRuntime.ts),
// main's own ui:battleStart listeners (the play surface, post's loading hold) and settings.ts's own (its battle state,
// which a 'garage' announcement clears) on one bus.
const tick = () => new Promise((resolve) => setImmediate(resolve));
const settingsSource = readFileSync(new URL('../ui/settings.ts', import.meta.url), 'utf8');
function battleStartEffects(page) {
  const bus = createBus();
  const state = { playSurfaceHidden: false, loadingHold: false, battleSettings: false };
  const feedback = createPointerLockFeedbackRuntime({
    input: page.input, bus, canvas: page.canvas, audioResume() {}, isBattleStageVisible: () => false,
    canRecapturePointer: () => false, ensureTouchControls: async () => null, notices: { show() {}, dismiss() {} },
  });
  const line = (source, text) => {
    assert.equal(source.split(`\n${text}\n`).length, 2, text);
    return text.trim();
  };
  runMainStatements([
    mainStatement("bus.on('ui:battleStart', () => {"),
    line(mainSource, "bus.on('ui:battleStart', () => post.setAdaptiveHold('loading', true));"),
  ], {
    bus, pedestal: { current: null }, parkGarageTankEnergyVisual() {}, garageModePreview: { clear() {} },
    playSurface: { hideForBattle: () => { state.playSurfaceHidden = true; } },
    post: { setAdaptiveHold: (hold, on) => { if (hold === 'loading') state.loadingHold = on; } },
  }, 'null');
  const phaseAt = settingsSource.indexOf("\n    bus.on('phase:change', (ev) => {");
  assert.ok(phaseAt > 0, "settings' phase listener");
  runMainStatements([
    settingsSource.slice(phaseAt + 1, settingsSource.indexOf('\n    });', phaseAt) + 8),
    line(settingsSource, "    bus.on('ui:battleStart', () => { battleUiVisibility.setBattle(true); updateGear(); });"),
  ], {
    bus, updateGear() {}, hideResumeVeil() {}, hideHints() {},
    battleUiVisibility: { setBattle: (battle) => { state.battleSettings = battle; } },
  }, 'null');
  return {
    bus,
    /** What stands now: the pointer lock, the hidden play surface, post's loading hold, settings' battle state. */
    standing: () => ({ pointerLock: page.locked(), ...state }),
    dispose: () => feedback.dispose(),
  };
}
const nothingStands = { pointerLock: false, playSurfaceHidden: false, loadingHold: false, battleSettings: false };
const battleStands = { pointerLock: true, playSurfaceHidden: true, loadingHold: true, battleSettings: true };
// (round 5 U15) the bare Retry's restore window: the press lands after the Retry's showGarageScreen (its 'garage'
// announcement and exitPointerLock), while its restore runs, where the Garage UI is up. (Case 5 above holds the Garage
// placement, before that screen, whose exitPointerLock released a lock a base press took there.) If the restore fails
// again the start is refused and none of its announcement's effects stands over the notice; if it lands the press
// starts its battle with them. (0edd0e1ab5: ui:battleStart at the press, and its pointer lock, hidden play surface,
// loading hold and battle settings stood over the notice that came back.)
{
  const page = createChromePointerLockPage();
  const effects = battleStartEffects(page);
  try {
    let failRestore = true;
    let hold = null;
    let restoring = false;
    const f = createFixture({
      bus: effects.bus, exitPointerLock: page.exitPointerLock,
      restore: async () => {
        restoring = true;
        await hold?.promise;
        restoring = false;
        if (failRestore) throw new Error('the Garage presentation did not restore');
        return { totalMs: 1 };
      },
    });
    // (round 5 Q2: main's own bindings ask the same input layer for the lock)
    const main = owedGarageMain(f.runtime, f.game, { bus: effects.bus, input: page.input });
    await main.leave();
    await flush();
    assert.equal(f.runtime.state, 'failed');
    press(main); // the closed notice: the press brings it back, with the bare Retry
    await flush();
    assert.equal(main.notices.at(-1).retry, main.retryGarageReturn, '(the refused press offers the bare Retry)');
    assert.deepEqual(effects.standing(), nothingStands, '(nothing announced)');
    for (const lands of [false, true]) {
      const label = lands ? 'the restore window, a Retry that lands' : 'the restore window, a Retry that fails again';
      failRestore = !lands;
      hold = deferred();
      const shown = main.notices.length;
      main.notices.at(-1).retry();
      for (let index = 0; index < 12 && !restoring; index += 1) await flush();
      assert.equal(restoring, true, `${label}: (its restore runs)`);
      assert.deepEqual(f.announcements.at(-1), { phase: 'garage', from: 'garage', reason: 'garage-return:screen' },
        `${label}: (after its showGarageScreen: the Garage's screen is up)`);
      main.events.length = 0;
      press(main);
      await flush();
      await tick();
      assert.deepEqual(main.events, ['emit:ui:click'], `${label}: the press waits for the restore, unannounced`);
      hold.resolve();
      const settled = () => (lands ? main.events.length >= started.length : main.notices.length >= shown + 2);
      for (let index = 0; index < 12 && !settled(); index += 1) await flush();
      await tick();
      if (lands) {
        assert.equal(f.runtime.state, 'idle', label);
        assert.deepEqual(main.events, started, `${label}: the press announces and starts its battle once it lands`);
        assert.deepEqual(effects.standing(), battleStands, `${label}: with its announcement's effects`);
      } else {
        assert.equal(f.runtime.state, 'failed', label);
        assert.equal(main.notices.length, shown + 2, `${label}: its notice and the refused start's`);
        assert.equal(main.notices.at(-1).retry, main.retryGarageReturn, `${label}: the bare Retry again`);
        assert.deepEqual(effects.standing(), nothingStands,
          `${label}: no pointer lock, hidden play surface, loading hold or battle settings stand over the notice`);
        assert.deepEqual(main.events, ['emit:ui:click'], `${label}: the start is refused and announced nothing`);
      }
    }
  } finally {
    effects.dispose();
    page.restore();
  }
}

// (round 5 Q2) A long return keeps the press's pointer lock. Since round 4 F1 the press's announcement, whose listener
// asks for the lock (pointerLockFeedbackRuntime.ts), runs after the return's wait; after the player's own unlock (the
// Esc that left the battle) Chrome refuses a lock with no user activation, which lasts about 5 s after the press, so a
// longer restore lost it and the battle began unlocked until a canvas click. The entry now asks for it in the press's
// task when it must wait (soloBattleEntryRuntime.ts holdPointerLock, main's binding): a press in the restore window
// keeps it through the restore; a press before the Retry's showGarageScreen loses it to that screen's exitPointerLock,
// the page's own unlock, after which the announcement's request needs no activation. (f60d0aa200: refused after the
// wait in both windows.)
for (const during of ['restore', 'placement']) {
  const page = createChromePointerLockPage();
  const effects = battleStartEffects(page);
  try {
    page.input.requestLock(); // the battle the player left held the lock; their Esc dropped it (a user unlock)
    await tick();
    assert.equal(page.locked(), true);
    page.userEscape();
    let failRestore = true;
    let hold = null;
    let held = false;
    const holdIn = (step) => async () => {
      if (step === during && hold) { held = true; await hold.promise; }
      if (step === 'restore' && failRestore) throw new Error('the Garage presentation did not restore');
      return { totalMs: 1 };
    };
    const f = createFixture({ bus: effects.bus, exitPointerLock: page.exitPointerLock, placement: holdIn('placement'),
      restore: holdIn('restore') });
    const main = owedGarageMain(f.runtime, f.game, { bus: effects.bus, input: page.input });
    await main.leave();
    await flush();
    assert.equal(f.runtime.state, 'failed');
    press(main); // the closed notice: the press brings it back, with the bare Retry
    await flush();
    failRestore = false;
    hold = deferred();
    main.notices.at(-1).retry();
    for (let index = 0; index < 12 && !held; index += 1) await flush();
    assert.equal(held, true, `${during} window: (the Retry's return runs)`);
    main.events.length = 0;
    press(main); // in its gesture
    await flush();
    await tick();
    assert.deepEqual(main.events, ['emit:ui:click'], `${during} window: (the press waits, unannounced)`);
    page.activation.isActive = false; // a long return: the press's user activation has expired
    hold.resolve();
    for (let index = 0; index < 12 && main.events.length < started.length; index += 1) await flush();
    await tick();
    await tick();
    assert.deepEqual(main.events, started, `${during} window: the press starts its battle once the return lands`);
    assert.equal(page.locked(), true,
      `${during} window: with its pointer lock (f60d0aa200: asked only after the wait, and refused)`);
    assert.equal(page.input.isCursorAim(), false);
  } finally {
    effects.dispose();
    page.restore();
  }
}
// (round 5 Q2) The refusal half: a start refused after the wait releases the lock its press took (the page's own unlock,
// main's binding: input.releaseLock) before the refused start's notice opens, and a lock that lands only after the
// refusal is released as it lands (input.ts withdraws the attempt in flight). Nothing stands over the notice and the
// next press locks again. (review r1) The failed Retry's own notice opens first, while the press still waits: main
// frees the cursor before every return notice opens (presentGarageReturnFailure), so neither notice opens under the
// press's lock (7705cfeb18: the Retry's did). (review r2: no lock request is refused here, so the cursor-aim fallback
// is pinned below, on a page that refuses every lock.)
for (const lockLandsFirst of [true, false]) {
  const label = lockLandsFirst ? 'a lock that landed during the wait' : 'a lock still in flight at the refusal';
  const page = createChromePointerLockPage();
  const effects = battleStartEffects(page);
  try {
    let failRestore = true;
    let hold = null;
    let held = false;
    const f = createFixture({
      bus: effects.bus, exitPointerLock: page.exitPointerLock,
      restore: async () => {
        if (hold) { held = true; await hold.promise; }
        if (failRestore) throw new Error('the Garage presentation did not restore');
        return { totalMs: 1 };
      },
    });
    const main = owedGarageMain(f.runtime, f.game, { bus: effects.bus, input: page.input, noticeState: () => page.locked() });
    await main.leave();
    await flush();
    press(main); // the closed notice: the press brings it back, with the bare Retry
    await flush();
    hold = deferred();
    const shown = main.notices.length;
    main.notices.at(-1).retry();
    for (let index = 0; index < 12 && !held; index += 1) await flush();
    main.events.length = 0;
    const attempts = page.stats.attempts;
    press(main);
    assert.equal(page.stats.attempts, attempts + 1, `${label}: the press asks for the lock in its own task (its gesture)`);
    if (lockLandsFirst) {
      await tick();
      assert.equal(page.locked(), true, `${label}: (held while the press waits)`);
    }
    hold.resolve();
    for (let index = 0; index < 12 && main.notices.length < shown + 2; index += 1) await flush();
    assert.equal(main.notices.length, shown + 2, `${label}: (the Retry's notice and the refused start's)`);
    assert.deepEqual(main.notices.slice(shown).map((notice) => notice.at), [false, false],
      `${label}: no lock over the Retry's own notice or the refused start's`);
    await tick();
    await tick();
    assert.deepEqual(effects.standing(), nothingStands, `${label}: nothing stands after the refusal`);
    assert.deepEqual(main.events, ['emit:ui:click']);
    failRestore = false;
    hold = null;
    main.notices.at(-1).retry();
    for (let index = 0; index < 12 && f.runtime.state !== 'idle'; index += 1) await flush();
    press(main);
    await flush();
    await tick();
    assert.deepEqual(effects.standing(), battleStands, `${label}: the next press starts its battle with the lock`);
  } finally {
    effects.dispose();
    page.restore();
  }
}
// (round 5 Q2, review r1) The entry's own release, where no return notice opens: a network round the room's session
// entered during the wait has the screen (main's isNetworkRoundEntering), the Retry lands, and the start is refused
// with no notice to free the cursor; its press's lock is released all the same (soloBattleEntryRuntime.ts run()).
{
  const page = createChromePointerLockPage();
  const effects = battleStartEffects(page);
  try {
    let failRestore = true;
    let hold = null;
    let held = false;
    const f = createFixture({
      bus: effects.bus, exitPointerLock: page.exitPointerLock,
      restore: async () => {
        if (hold) { held = true; await hold.promise; }
        if (failRestore) throw new Error('the Garage presentation did not restore');
        return { totalMs: 1 };
      },
    });
    const main = owedGarageMain(f.runtime, f.game, { bus: effects.bus, input: page.input });
    await main.leave();
    await flush();
    press(main); // the closed notice: the press brings it back, with the bare Retry
    await flush();
    failRestore = false;
    hold = deferred();
    const shown = main.notices.length;
    main.notices.at(-1).retry();
    for (let index = 0; index < 12 && !held; index += 1) await flush();
    main.events.length = 0;
    press(main);
    await tick();
    assert.equal(page.locked(), true, '(the press holds the lock while it waits)');
    main.scope.onlineMatch.current.entering = true; // a round the room's session entered meanwhile
    hold.resolve();
    for (let index = 0; index < 12 && f.runtime.state !== 'idle'; index += 1) await flush();
    await tick();
    assert.equal(f.runtime.state, 'idle', '(the Retry landed)');
    assert.equal(main.notices.length, shown, '(no return notice opens)');
    assert.deepEqual(main.events, ['emit:ui:click'], 'the start is refused: the round has the screen');
    assert.deepEqual(effects.standing(), nothingStands, "the press's lock is released all the same");
  } finally {
    effects.dispose();
    page.restore();
  }
}
// (round 5 Q2, review r2) The hold's own refusal is no evidence the page cannot lock: main's binding asks with fromUi,
// so a waiting press counts one refusal toward the cursor-aim fallback, the one its announcement's request draws
// (pointerLockFeedbackRuntime.ts), as every press did on f60d0aa200, never two. On a page that refuses every lock
// (input.ts LOCK_DENY_LATCH_STREAK, 3), two waiting presses leave the fallback off and one more counted refusal turns
// it on. (Without fromUi the second press's hold turned it on.)
{
  const page = createChromePointerLockPage({ lock: 'refuse-all' });
  const effects = battleStartEffects(page);
  try {
    for (const nth of [1, 2]) {
      let failRestore = true;
      let hold = null;
      let held = false;
      const f = createFixture({
        bus: effects.bus, exitPointerLock: page.exitPointerLock,
        restore: async () => {
          if (hold) { held = true; await hold.promise; }
          if (failRestore) throw new Error('the Garage presentation did not restore');
          return { totalMs: 1 };
        },
      });
      const main = owedGarageMain(f.runtime, f.game, { bus: effects.bus, input: page.input });
      await main.leave();
      await flush();
      const before = page.stats.attempts;
      press(main); // the closed notice: the press brings it back, with the bare Retry
      await flush();
      assert.equal(page.stats.attempts, before, `press ${nth}: (a press refused at once asks for nothing)`);
      failRestore = false;
      hold = deferred();
      main.notices.at(-1).retry();
      for (let index = 0; index < 12 && !held; index += 1) await flush();
      main.events.length = 0;
      press(main);
      assert.equal(page.stats.attempts, before + 1, `press ${nth}: (the waiting press asks in its own task)`);
      await tick();
      hold.resolve();
      for (let index = 0; index < 12 && main.events.length < started.length; index += 1) await flush();
      await tick();
      assert.deepEqual(main.events, started, `press ${nth}: (its battle starts once the return lands)`);
      assert.equal(page.stats.attempts, before + 2, `press ${nth}: (its announcement asks again)`);
      assert.equal(page.stats.refused, page.stats.attempts, `press ${nth}: (and every request was refused)`);
      assert.equal(page.input.isCursorAim(), false,
        `press ${nth}: the hold's refusal is not counted toward cursor aim, only its announcement's`);
    }
    page.input.requestLock(); // a counted refusal: a canvas click's
    await tick();
    assert.equal(page.input.isCursorAim(), true,
      'the third counted refusal turns cursor aim on: each press counted one');
  } finally {
    effects.dispose();
    page.restore();
  }
}
// (round 5 Q2, review r1) Every Garage return notice opens with the cursor free: main's presentGarageReturnFailure
// releases the lock (input.releaseLock) before the notice. A room's own return (its room closed during a revealed
// battle, whose lock the player holds) that fails before its screen's exitPointerLock, here at its placement, opened
// its notice under the battle's lock on f60d0aa200, so the Retry could not be clicked before an Esc.
{
  const binding = mainSource.match(/\n\s+returnToGarage: ([^\n]+),\n/)?.[1];
  assert.ok(binding, "main binds the room's returnToGarage");
  const page = createChromePointerLockPage();
  try {
    page.input.requestLock(); // the revealed battle holds the lock
    await tick();
    assert.equal(page.locked(), true);
    const f = createFixture({ exitPointerLock: page.exitPointerLock,
      placement: async () => { throw new Error('the Garage placement failed'); } });
    const notices = [];
    const room = runMainStatements(exitStatements, {
      garageReturn: f.runtime, input: page.input,
      console: { error() {}, info() {}, warn() {} },
      loadFailure: async () => ({
        showGarageReturnFailure: (error, retry) => notices.push({ error, retry, at: page.locked() }),
      }),
    }, `{ returnToGarage: (${binding}) }`);
    await assert.rejects(room.returnToGarage(), /the Garage placement failed/, 'the room still sees the rejection');
    await flush();
    assert.equal(f.runtime.state, 'failed', '(before its screen: its exitPointerLock never ran)');
    assert.deepEqual(notices.map((notice) => notice.at), [false], "no lock over the failed room return's notice");
    await tick();
    assert.equal(page.locked(), false, 'and none stands after it');
  } finally {
    page.restore();
  }
}

// (round 4 F1, review r1) The records drop a battle's tally at every Garage again (profile.ts, serviceRecord.ts). Round 2
// U19 kept a tally that had not reached its battle through a 'garage' announced from a battle's screen, for one producer:
// the Garage press announced under a return's veil, before that return handed the screen over. Round 4 F1 announces that
// press after the return, as every other announcer already waited (the solo entry; a network round, main's
// takeSceneForRound), so the battle before's 'garage' always comes first. What still reached the exception was an entry
// that never reached its battle: a kept room's rematch announced over the report (browserComposition's
// roster.emitBattleStart, main's bus emit), which then failed, and whose covered restore (failRound: room.enterGarage,
// main's enterGarageWithExit) announced the Garage from the battle's screen. Its tally survived, and the next battle its
// entry did not announce (the debug hook) was recorded under the rematch's vehicle. The real return, the real app
// lifecycle, the real profile and service record.
/** The records' own listeners (profile.ts, serviceRecord.ts) on a bus of their own, which the return's lifecycle
 * announces its phases on. */
async function recordsBus() {
  globalThis.localStorage ??= (() => {
    const storage = new Map();
    return {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    };
  })();
  const { installBattleRecords, getPlayerRecord } = await import('./profile.ts');
  const { installServiceRecord, getServiceRecord } = await import('./serviceRecord.ts');
  const bus = createBus();
  installBattleRecords(bus);
  installServiceRecord(bus, {
    playerId: () => 'me', playerTeam: () => 'player', teamOf: () => null, gameMode: () => 'standard', clockS: () => 0,
    playerHpFraction: () => 1, playerMaxHp: () => 2000, playerNation: () => 'Germany', playerAerialKind: () => null,
    respawns: () => false, playerObjectiveTeam: () => null,
  });
  return { bus, getPlayerRecord, getServiceRecord };
}
{
  const { bus, getPlayerRecord, getServiceRecord } = await recordsBus();
  const f = createFixture({ phase: 'garage', bus });
  // the room's round: announced, fought and ended; its report is the screen
  bus.emit('ui:battleStart', { playerId: 'me', specId: 'm1a1_abrams_hc', mapId: 'verdant' });
  transitionAppPhase(f.game, 'battle', { reason: 'network-activation' });
  bus.emit('battle:ended', { result: 'victory', durationS: 61, mapId: 'verdant', gameMode: 'standard', roster: [] });
  const matches = getPlayerRecord().matches;
  const rows = getServiceRecord().history.length;
  // the kept room's rematch is announced over the report, and fails before its battle: its covered restore
  bus.emit('ui:battleStart', { playerId: 'me', specId: 'leo2_improved', mapId: 'urban' });
  await f.runtime.enter();
  assert.equal(f.runtime.state, 'idle');
  assert.deepEqual(f.announcements.at(-1), { phase: 'garage', from: 'battle', reason: 'garage-return:screen' },
    "(the restore announces the Garage from the battle's screen)");
  // a battle no entry announced (the debug hooks __DEBUG.beginBattleEntry and __DEBUG.startBattle, QA's
  // debugStartBattle) is fought and ends
  transitionAppPhase(f.game, 'battle', { reason: 'solo-start' });
  bus.emit('battle:ended', { result: 'defeat', durationS: 12, mapId: 'desert', gameMode: 'standard', roster: [] });
  assert.equal(getPlayerRecord().matches, matches,
    "the failed rematch's tally records no later battle (0edd0e1ab5: the debug battle, under leo2_improved)");
  assert.equal(getServiceRecord().history.length, rows + 1, '(the service record tracks the debug battle afresh)');
  assert.notEqual(getServiceRecord().history[0]?.vehicleId, 'leo2_improved',
    "and its row is not the failed rematch's (0edd0e1ab5: the rematch's tracker, kept through its restore)");
}
// (round 4 F1, review r2) The service record drops a battle's tracker at every Garage too, as profile.ts drops its tally.
// It dropped one only when a battle was left, so an entry that failed before its battle kept its tracker through its
// recovery return, which announces the Garage from the Garage, and the next battle no entry announced (the debug hook)
// was recorded under the failed entry's vehicle; the profile dropped its tally there. The Garage BATTLE press over
// main's solo entry, whose load fails: the real recovery return, app lifecycle, profile and service record.
{
  const { bus, getPlayerRecord, getServiceRecord } = await recordsBus();
  const f = createFixture({ phase: 'garage', bus });
  const main = owedGarageMain(f.runtime, f.game, { bus, loadFails: true });
  const matches = getPlayerRecord().matches;
  const rows = getServiceRecord().history.length;
  // (the entry reports its failure through the console's error, which the case keeps)
  const reported = [];
  const consoleError = console.error;
  console.error = (...args) => reported.push(args);
  try {
    press(main); // accepted at once: announced, covered and loaded, and the load fails
    for (let index = 0; index < 12 && !f.announcements.length; index += 1) await flush();
    await flush();
  } finally {
    console.error = consoleError;
  }
  assert.deepEqual(main.events, started, '(the press is announced, covers and loads)');
  assert.ok(reported.some(([message]) => message === '[battle] entry failed'), '(and its load fails)');
  assert.equal(f.runtime.state, 'idle');
  assert.deepEqual(f.announcements, [{ phase: 'garage', from: 'garage', reason: 'garage-return:screen' }],
    "(the entry's recovery return announces the Garage from the Garage)");
  // a battle no entry announced (__DEBUG.beginBattleEntry) is fought and ends
  transitionAppPhase(f.game, 'battle', { reason: 'solo-start' });
  bus.emit('battle:ended', { result: 'defeat', durationS: 12, mapId: 'desert', gameMode: 'standard', roster: [] });
  assert.equal(getPlayerRecord().matches, matches, "the failed entry's tally records no later battle (as on 0edd0e1ab5)");
  assert.equal(getServiceRecord().history.length, rows + 1, '(the service record tracks the debug battle afresh)');
  assert.notEqual(getServiceRecord().history[0]?.vehicleId, 'm1a1_abrams_hc',
    "and its row is not the failed entry's (0edd0e1ab5, 38dde77787: its tracker, kept through the recovery's Garage)");
}

console.log('garageReturnState.selftest: explicit return state, named busy refusals, event-driven Battle Again, a failed return\'s exit for every caller, superseded returns open nothing passed');
