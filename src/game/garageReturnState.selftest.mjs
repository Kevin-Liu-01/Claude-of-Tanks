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
import { createGameState } from './stateCore.ts';
import { mainSource, mainStatement, runMainStatements } from '../app/mainComposition.test-support.mjs';

const { createGarageReturnRuntime, GARAGE_RETURN_EDGES = {} } = garageReturnModule;

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const flush = async (turns = 12) => { for (let i = 0; i < turns; i += 1) await Promise.resolve(); };

function createFixture({ restore = null, clearBattle = () => {}, phase = 'battle', placement = null, entryScheduler = null,
  showGarage = () => {}, transitionRun = null } = {}) {
  const game = createGameState();
  game.phase = phase;
  const announcements = [];
  const lifecycle = createAppLifecycle({ game, announce: (announcement) => announcements.push(announcement) });
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
    ui: { setGarageSpots: noop, setGarageSunTrim: noop, emitGaragePhase: noop, hideEndOverlay: noop, exitPointerLock: noop, hideHud: noop,
      showGarage, poseGarageCamera: noop, startShowroom: noop,
      triggerBattle: () => { game.phase = 'battle'; setTimeout(() => setCovering(true), 5); return true; } },
    audio: { ambientOn: noop, playGarageSting: noop },
    transition: { run: transitionRun ?? (async (work) => { const gate = transitionWork?.(); if (gate) await gate; return work(); }) },
    restoreGaragePresentation: async () => { observe(); if (restore) return restore(); return { totalMs: 1 }; },
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
// way out: the failed return's notice with its Retry, or, for a return a context change cut short over the Garage with the
// graphics live again, the return itself. main's own exits, Leave, solo entry, hand-over rule and room launch, and
// garage.ts's own press, over the real return, the real entry latch and the real solo entry.
const garageSource = readFileSync(new URL('../ui/garage.ts', import.meta.url), 'utf8');
function owedGarageMain(runtime, game, { contextLost = () => false } = {}) {
  const events = [];
  const notices = [];
  const slice = (source, head, close) => {
    const start = source.indexOf(`\n${head}`);
    assert.ok(start >= 0, head);
    return source.slice(start + 1, source.indexOf(close, start + 1) + close.length);
  };
  const mainFn = (head) => slice(mainSource, head, '\n}\n');
  const garageAt = mainSource.indexOf('\nconst garage: MainGarageRuntime = ');
  const garageOptions = mainSource.slice(garageAt, mainSource.indexOf('\n}));', garageAt));
  const onBattle = garageOptions.match(/\n {2}onBattle: (\(specId, mapId, options\) => \(\s+beginLocalBattleEntry\(specId, mapId, options\)\s+\)),/)?.[1];
  assert.ok(onBattle, "main binds the Garage press to the solo entry");
  const refusesBattle = garageOptions.match(/\n {2}refusesBattle: ([^\n]+),\n/)?.[1] ?? 'undefined'; // (absent on 92f415e879)
  const scope = {
    game, garageReturn: runtime, battleEntryLifecycle: createBattleEntryLifecycle({ nextFrame: async () => {}, now: () => 0 }),
    onlineMatch: { current: { beginRoom: async () => { events.push(`room@${game.phase}`); return true; } } },
    createSoloBattleEntryRuntime, canTransitionAppPhase, AppPhaseTransitionError: appLifecycleModule.AppPhaseTransitionError,
    GarageScreenUnsettledError,
    soloBattleLoading: { begin: async () => { events.push(`load@${game.phase}`); } },
    battleLoad: { showPending: () => events.push(`cover@${game.phase}`), hide: async () => {} },
    audio: { loadingOn() {} }, nextPaintFrame: async () => {},
    bus: { emit: (type) => events.push(`emit:${type}`) },
    battleEntryIntent: { begin() {} }, terrainVariantFor: () => null,
    VISIBLE_TANK_IDS: ['m1a1_abrams_hc'], garage: { getSelected: () => 'm1a1_abrams_hc', getSelectedMap: () => 'verdant' },
    loadFailure: async () => ({ showSoloEntryFailure() {}, showGarageReturnFailure: (error, retry) => notices.push({ error, retry }) }),
    get graphicsContextLost() { return contextLost(); },
    // garage.ts launchBattle's own names: its failed-load gate, its emit (the bus), the selected mode
    pressFailed: () => false, battleBtn: {}, emit: (type) => events.push(`emit:${type}`), battleGameMode: 'standard',
    console: { error() {}, warn() {}, info() {} },
  };
  const main = runMainStatements([
    exitStatements, leaveStatement,
    mainStatement('const soloBattleEntry = createSoloBattleEntryRuntime({').replace("import('./ui/garageReturnFailure.ts')", 'loadFailure()'),
    ...(mainSource.includes('\nfunction battleSceneRefusal(') ? [mainFn('function battleSceneRefusal(')] : []),
    mainFn('function takeSceneForRound('), mainFn('function beginMultiplayerV2Battle('), mainFn('function beginLocalBattleEntry('),
    `const onBattle = ${onBattle};`, `const opts = { refusesBattle: ${refusesBattle} };`,
    slice(garageSource, '  function launchBattle(', '\n  }\n'),
  ], scope, '{ leave: leaveBattleToGarage, launchBattle, beginMultiplayerV2Battle, retryGarageReturn }');
  return { ...main, events, notices };
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
  await flush();
  assert.deepEqual(main.events, started, 'and the next press starts its battle');
}
// a return a context change cut short over the Garage: the recovery's while the graphics are lost; with them live again
// and no recovery coming, a press runs the return again
{
  let contextCurrent = true;
  let losses = 1;
  let lost = false;
  const f = createFixture({
    entryScheduler: { isCurrent: () => contextCurrent, yieldControl: async () => {} },
    placement: () => { if (losses-- > 0) { contextCurrent = false; lost = true; } },
  });
  const main = owedGarageMain(f.runtime, f.game, { contextLost: () => lost });
  await main.leave();
  await flush();
  assert.equal(f.runtime.state, 'superseded');
  assert.equal(f.game.phase, 'garage');
  main.events.length = 0;
  press(main);
  await flush();
  assert.deepEqual(main.events, [], 'with the graphics lost the press is refused (92f415e879: cover and load in the Garage)');
  assert.equal(f.runtime.state, 'superseded', 'and the context recovery keeps the return: no second return beside it');
  assert.equal(main.notices.length, 0);
  contextCurrent = true;
  lost = false; // the device is back, and nothing retried the return
  press(main);
  for (let index = 0; index < 8 && f.runtime.state !== 'idle'; index += 1) await flush();
  assert.equal(f.runtime.state, 'idle', 'the press runs the return again (6ab835cbb4: nothing happened)');
  assert.deepEqual(main.events, [], 'and announces no battle');
  assert.equal(main.notices.length, 0);
  press(main);
  await flush();
  assert.deepEqual(main.events, started);
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
  assert.deepEqual(main.events, ['emit:ui:click', 'emit:ui:battleStart'], 'the press waits for the return (6ab835cbb4: refused at the press)');
  fadeIn.resolve();
  for (let index = 0; index < 8 && f.runtime.state !== 'idle'; index += 1) await flush();
  await flush();
  assert.equal(f.runtime.state, 'idle');
  assert.deepEqual(main.events, started, 'and starts its battle once the return lands');
}
// a press during a Retry that fails again: the waiting start is refused and the notice comes back
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
  assert.deepEqual(main.events, ['emit:ui:click', 'emit:ui:battleStart'], '(the press waits for the Retry)');
  hold.resolve();
  for (let index = 0; index < 8 && main.notices.length < 3; index += 1) await flush();
  assert.equal(f.runtime.state, 'failed');
  assert.deepEqual(main.events, ['emit:ui:click', 'emit:ui:battleStart'], 'no cover and no load under the return that failed again');
  assert.equal(main.notices.length, 3, "the Retry's own notice and the refused start's (one presenter, one modal)");
  assert.ok(main.notices.slice(1).some((notice) => notice.retry === main.retryGarageReturn), "the refused start's offers the return again");
}

console.log('garageReturnState.selftest: explicit return state, named busy refusals, event-driven Battle Again, a failed return\'s exit for every caller, superseded returns open nothing passed');
