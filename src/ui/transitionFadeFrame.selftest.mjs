import assert from 'node:assert/strict';
import { Object3D, PerspectiveCamera, Scene } from 'three';

import { createMainFrameRuntime } from '../app/mainFrameRuntime.ts';
import { createGarageFramePacer } from '../engine/garageFramePacer.ts';
import { createGarageReturnRuntime } from '../game/garageReturnRuntime.ts';
import { createGameState } from '../game/stateCore.ts';
import { createTransition } from './transition.ts';

// Only the browser host and subsystem I/O are controlled here. The transition,
// opacity barrier, frame/task scheduler, rematch/return owner, and rendered-frame
// owner are production implementations. In particular, no transition.run stub
// may invoke work before (or stand in for) the real paint barrier.
class ElementFixture {
  constructor() {
    this.style = {};
    this.children = new Map();
    this.classes = new Set();
    this.opacity = 0;
    this.classList = {
      add: (...values) => values.forEach(value => this.classes.add(value)),
      remove: (...values) => values.forEach(value => this.classes.delete(value)),
      contains: value => this.classes.has(value),
      toggle: (value, force = !this.classes.has(value)) => {
        if (force) this.classes.add(value); else this.classes.delete(value);
        return force;
      },
    };
  }
  set className(value) { this.classes = new Set(value.split(/\s+/)); }
  querySelector(selector) {
    if (!this.children.has(selector)) this.children.set(selector, new ElementFixture());
    return this.children.get(selector);
  }
  appendChild(child) { return child; }
  getClientRects() { return this.classes.has('on') ? [{}] : []; }
}

async function flushMicrotasks() {
  for (let index = 0; index < 30; index += 1) await Promise.resolve();
}

function deferred() {
  let resolve;
  const promise = new Promise(finish => { resolve = finish; });
  return { promise, resolve };
}

function installBrowserHost() {
  let nowMs = 0;
  let nextHandle = 1;
  const timers = new Map(), frames = new Map(), tasks = [];
  const roots = [], visibilityListeners = new Set();
  const documentEvents = new EventTarget();
  const head = new ElementFixture(), body = new ElementFixture();
  body.appendChild = child => { roots.push(child); return child; };
  const globals = {
    window: { location: { search: '', pathname: '/' } },
    navigator: { webdriver: false, language: 'en-US', languages: ['en-US'] },
    Image: undefined,
    document: {
      hidden: false, head, body,
      getElementById: () => null,
      createElement: () => new ElementFixture(),
      addEventListener(type, callback) {
        assert.equal(type, 'visibilitychange');
        visibilityListeners.add(callback);
        documentEvents.addEventListener(type, callback);
      },
      removeEventListener(type, callback) {
        visibilityListeners.delete(callback);
        documentEvents.removeEventListener(type, callback);
      },
    },
    performance: { now: () => nowMs },
    getComputedStyle: root => ({ opacity: String(root.opacity) }),
    requestAnimationFrame: callback => {
      const handle = nextHandle++;
      frames.set(handle, callback);
      return handle;
    },
    cancelAnimationFrame: handle => frames.delete(handle),
    setTimeout: (callback, milliseconds = 0) => {
      const handle = nextHandle++;
      timers.set(handle, { at: nowMs + milliseconds, callback });
      return handle;
    },
    clearTimeout: handle => timers.delete(handle),
    scheduler: { yield: () => new Promise(resolve => tasks.push(resolve)) },
  };
  const originals = new Map(Object.keys(globals)
    .map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  return {
    roots, frames, tasks, timers, visibilityListeners,
    now: () => nowMs,
    async advance(milliseconds) {
      const target = nowMs + milliseconds;
      for (;;) {
        const due = [...timers].filter(([, timer]) => timer.at <= target)
          .sort((left, right) => left[1].at - right[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        nowMs = due[1].at;
        due[1].callback();
        await flushMicrotasks();
      }
      nowMs = target;
      await flushMicrotasks();
    },
    async animationFrame() {
      assert.ok(frames.size > 0, 'the production paint scheduler requested a frame');
      const pending = [...frames];
      frames.clear();
      for (const [, callback] of pending) callback(nowMs);
      await flushMicrotasks();
    },
    async task() {
      assert.ok(tasks.length > 0, 'the production paint scheduler requested a following task');
      tasks.shift()();
      await flushMicrotasks();
    },
    restore() {
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    },
  };
}

function createComposition(host, { pendingPreviousEntry = false } = {}) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(70, 1, 0.1, 1000);
  const oldBattle = new Object3D(), garageScene = new Object3D(), newBattle = new Object3D();
  oldBattle.name = 'old-result-scene';
  garageScene.name = 'restored-garage-scene';
  newBattle.name = 'next-battle-scene';
  scene.add(oldBattle);
  const game = createGameState();
  game.phase = 'battle';
  game.mapId = 'verdant';
  const transition = createTransition();
  const root = host.roots.at(-1);
  const lifecycleCalls = [], frameCalls = [], paints = [];
  const restoreGate = deferred();
  const pacer = createGarageFramePacer();
  let previousEntryPending = pendingPreviousEntry;
  let nextEntryCovering = false;
  let reportVisible = true;
  const lifecycle = name => () => lifecycleCalls.push(name);
  const frame = name => () => frameCalls.push(name);
  const garageReturn = createGarageReturnRuntime({
    game,
    getSelectedSpecId: () => 'm1a2',
    presentation: {
      setAdaptiveSuspended: lifecycle('adaptive'),
      clearBattle: () => {
        assert.equal(transition.holdingSceneForFadeIn, false,
          'the real cover owner releases its scene lease before enter starts');
        assert.equal(transition.visible, true, 'teardown still runs behind the visible veil');
        assert.equal(root.opacity, 1, 'teardown sees the genuinely opaque host state');
        lifecycleCalls.push('clear-presentation');
      },
      resetBattleTank: lifecycle('reset-tank'),
      suspendEffects: lifecycle('suspend-effects'),
      setShotMode: lifecycle('shot-mode'),
      setCaptureHidden: lifecycle('capture-hidden'),
      unfreezeEffects: lifecycle('unfreeze-effects'),
      resetHudFrame: lifecycle('reset-hud'),
    },
    network: {
      shouldPreserveRoom: () => true,
      disposePresentation: lifecycle('dispose-network-presentation'),
      closeMatch: lifecycle('close-match'),
    },
    warm: {
      invalidate: lifecycle('invalidate-warm'),
      cancel: lifecycle('cancel-warm'),
      setPending: lifecycle('warm-pending'),
    },
    work: {
      noteActivity: lifecycle('garage-activity'),
      resetFramePacer: nowMs => { lifecycleCalls.push('reset-pacer'); pacer.reset(nowMs); },
      scheduleDressing: lifecycle('schedule-dressing'),
    },
    world: {
      currentMapId: () => 'verdant',
      ensureGaragePlacement: async () => {
        lifecycleCalls.push('garage-placement');
        scene.add(garageScene);
      },
      setDormant: lifecycle('world-dormant'),
      setFarCascadeDormant: lifecycle('cascade-dormant'),
      clearCamoOverrides: lifecycle('clear-camo'),
    },
    roster: {
      adoptBattlePlayer: () => { lifecycleCalls.push('adopt-player'); return oldBattle; },
      clearBattle: () => { lifecycleCalls.push('clear-roster'); scene.remove(oldBattle); },
      repaintHero: lifecycle('repaint-hero'),
    },
    settings: { isOpen: () => false, close: lifecycle('close-settings') },
    ui: {
      setGarageSpots: lifecycle('garage-spots'),
      setGarageSunTrim: lifecycle('garage-sun'),
      emitGaragePhase: lifecycle('garage-phase'),
      hideEndOverlay: () => { lifecycleCalls.push('hide-report'); reportVisible = false; },
      exitPointerLock: lifecycle('exit-pointer-lock'),
      hideHud: lifecycle('hide-hud'),
      showGarage: lifecycle('show-garage'),
      poseGarageCamera: lifecycle('garage-camera'),
      startShowroom: lifecycle('start-showroom'),
      triggerBattle: () => {
        lifecycleCalls.push('trigger-next-battle');
        scene.remove(garageScene);
        scene.add(newBattle);
        game.phase = 'battle';
        nextEntryCovering = true;
        return true;
      },
    },
    audio: { ambientOn: lifecycle('ambient'), playGarageSting: lifecycle('garage-sting') },
    transition,
    restoreGaragePresentation: () => {
      lifecycleCalls.push('restore-garage');
      return restoreGate.promise;
    },
    isBattleEntryPending: () => previousEntryPending,
    isBattleEntryCovering: () => nextEntryCovering,
    nowMs: host.now,
    sleep: milliseconds => {
      lifecycleCalls.push(`entry-wait:${milliseconds}`);
      return new Promise(resolve => setTimeout(resolve, milliseconds));
    },
  });
  const frameRuntime = createMainFrameRuntime({
    scene, camera, game,
    scheduleFrame: frame('schedule'),
    isGraphicsContextLost: () => false,
    syncViewportPixelRatio: () => { frameCalls.push('viewport'); return false; },
    battleEntryLifecycle: {
      get renderingCovered() { return nextEntryCovering; },
      noteBattleFrame: frame('battle-frame'),
    },
    getFx: () => ({ update: frame('fx') }),
    getWorld: () => ({ update: frame('world') }),
    getBaseFogDensity: () => 0,
    getStudio: () => ({ active: false, tick: frame('studio') }),
    getShotMode: () => false,
    getShotHudFrame: () => true,
    sniperFill: { update: frame('sniper') },
    updateNightLighting: frame('night-lights'),
    resolveFxSubject: () => null,
    battleHudFrame: { redrawFrozen: frame('frozen-hud'), update: frame('hud') },
    lighting: {
      updateFov: frame('lighting-fov'),
      setStaticPresentationDormant: frame('lighting-dormant'),
      update: frame('lighting'),
    },
    post: { render: () => {
      frameCalls.push('post');
      paints.push({ phase: game.phase, roots: scene.children.map(child => child.name) });
    } },
    showroom: { moving: false, update: frame('showroom') },
    pedestal: { switchPending: false },
    networkSession: { pump: frame('network') },
    garageFramePacer: pacer,
    battleFrame: { advance: dtSeconds => {
      frameCalls.push('simulation');
      return { dtSeconds, inBattle: game.phase === 'battle', paused: false,
        livePaused: false, killcamActive: false };
    } },
    isBattleLoadCovering: () => nextEntryCovering,
    isPresentationRestoreCovering: () => game.phase === 'garage'
      && !!garageReturn.lastTrace?.presentationUnready,
    isTransitionHoldingSceneForFadeIn: () => transition.holdingSceneForFadeIn,
    cameraInput: { autoAimPoint: null },
    getMobileAutoAim: () => null,
    rig: { cinematicActive: false, update: frame('camera-rig') },
    killcam: { fxTimeScale: 1, isActive: () => false, update: frame('killcam') },
    veilHud: frame('veil-hud'),
    worldFramePresentation: { update: frame('world-presentation') },
    matchModeWorld: { update: frame('match-mode') },
    audioListener: { update: frame('audio') },
    isGaragePresentationDirty: () => false,
    clearGaragePresentationDirty: frame('garage-clean'),
    perfHud: { update: frame('perf') },
  });
  return {
    transition, root, garageReturn, game, scene, oldBattle, lifecycleCalls, paints,
    get reportVisible() { return reportVisible; },
    finishPreviousEntry() { previousEntryPending = false; },
    finishRestore() { restoreGate.resolve({ totalMs: 0, resourcesReleased: false }); },
    finishNextEntry() { nextEntryCovering = false; },
    tick() {
      frameCalls.length = 0;
      frameRuntime.tick(host.now());
      return [...frameCalls];
    },
  };
}

function assertHeld(fixture, label) {
  assert.equal(fixture.transition.holdingSceneForFadeIn, true, `${label}: scene hold remains owned`);
  assert.equal(fixture.game.phase, 'battle', `${label}: the old phase is intact`);
  assert.equal(fixture.reportVisible, true, `${label}: the result report has not been dismissed`);
  assert.deepEqual(fixture.scene.children, [fixture.oldBattle], `${label}: scene roots have not changed`);
  assert.deepEqual(fixture.lifecycleCalls, [], `${label}: no entry wait, teardown, or next-battle work`);
  const paintsBefore = fixture.paints.length;
  assert.deepEqual(fixture.tick(), ['schedule', 'network'],
    `${label}: scheduling and transport progress, but viewport/simulation/world/FX/lighting/post do not`);
  assert.equal(fixture.paints.length, paintsBefore, `${label}: the last scene frame is retained`);
}

{
  const host = installBrowserHost();
  try {
    const fixture = createComposition(host, { pendingPreviousEntry: true });
    assert.equal(fixture.transition.holdingSceneForFadeIn, false);
    const baseline = fixture.tick();
    for (const name of ['schedule', 'viewport', 'simulation', 'world-presentation', 'fx', 'lighting', 'post']) {
      assert.ok(baseline.includes(name), `positive control: ordinary result frames reach ${name}`);
    }
    assert.deepEqual(fixture.paints.at(-1), { phase: 'battle', roots: ['old-result-scene'] });

    const rematch = fixture.garageReturn.battleAgain();
    void rematch.catch(() => {});
    assert.equal(fixture.garageReturn.battleAgain(), rematch, 'repeat clicks join the actual rematch owner');
    assertHeld(fixture, 'synchronous Battle Again click');
    await host.advance(30);
    assert.equal(fixture.root.classList.contains('lit'), true, 'the normal fade has started');
    fixture.root.opacity = 0.98;
    await host.animationFrame();
    assertHeld(fixture, 'partial-opacity animation callback');
    await host.task();
    assertHeld(fixture, 'partial-opacity following task');

    fixture.root.opacity = 0.998;
    await host.animationFrame();
    await host.task();
    assertHeld(fixture, 'nearly opaque is not the cover threshold');
    fixture.root.opacity = 1;
    await host.animationFrame();
    await host.task();
    assertHeld(fixture, 'opaque observation still requires its own final paint opportunity');
    assert.equal(host.frames.size, 1);
    await host.animationFrame();
    assert.equal(host.tasks.length, 1);
    assertHeld(fixture, 'final opaque animation callback is still a pre-paint checkpoint');

    await host.task();
    assert.equal(fixture.transition.holdingSceneForFadeIn, false,
      'the real post-opacity task releases the hold before covered work');
    assert.deepEqual(fixture.lifecycleCalls, ['entry-wait:150'],
      'the actual rematch work is now waiting on the previous entry, not tearing it down');
    assert.equal(fixture.transition.visible, true);
    assert.ok(fixture.tick().includes('post'),
      'the broad visible/active veil is not a rendering gate during covered work');
    assert.deepEqual(fixture.paints.at(-1).roots, ['old-result-scene']);

    fixture.finishPreviousEntry();
    await host.advance(150);
    assert.equal(fixture.lifecycleCalls.includes('clear-presentation'), true);
    assert.equal(fixture.lifecycleCalls.includes('hide-report'), true);
    assert.equal(fixture.lifecycleCalls.includes('restore-garage'), true);
    assert.equal(fixture.lifecycleCalls.includes('trigger-next-battle'), false);
    assert.equal(fixture.game.phase, 'garage');
    assert.equal(fixture.garageReturn.lastTrace.presentationUnready, true);
    assert.equal(fixture.transition.holdingSceneForFadeIn, false);
    assert.deepEqual(fixture.tick(), ['schedule', 'network'],
      'the distinct Garage restore owner still protects its incomplete scene');

    fixture.finishRestore();
    await flushMicrotasks();
    assert.equal(fixture.lifecycleCalls.includes('trigger-next-battle'), true);
    assert.equal(fixture.garageReturn.lastTrace.presentationUnready, false);
    assert.deepEqual(fixture.tick(), ['schedule', 'network'], 'next-entry coverage retains its own frame gate');
    await host.advance(420 - host.now());
    assert.equal(fixture.transition.visible, false, 'the actual rematch reaches fade-out');
    assert.equal(fixture.transition.active, true, 'fade-out still occupies layout');
    assert.equal(fixture.transition.holdingSceneForFadeIn, false);
    fixture.finishNextEntry();
    assert.ok(fixture.tick().includes('post'),
      'a ready next scene paints during fade-out, before the veil leaves layout');
    assert.deepEqual(fixture.paints.at(-1), { phase: 'battle', roots: ['next-battle-scene'] });
    await host.advance(180);
    await rematch;
    assert.equal(fixture.transition.active, false);
    assert.equal(fixture.garageReturn.transitioning, false);
    assert.ok(fixture.tick().includes('post'), 'ordinary frames continue after transition completion');
    assert.equal(host.visibilityListeners.size, 0);
    assert.equal(host.frames.size, 0);
    assert.equal(host.tasks.length, 0);
    assert.equal(host.timers.size, 0);
  } finally {
    host.restore();
  }
}

{
  const host = installBrowserHost();
  try {
    const fixture = createComposition(host);
    const rematch = fixture.garageReturn.battleAgain();
    const superseded = assert.rejects(rematch, { name: 'AbortError' });
    let successorWork = 0;
    const successor = fixture.transition.run(() => {
      successorWork += 1;
      assert.equal(fixture.transition.holdingSceneForFadeIn, false);
    }, { holdSceneDuringFadeIn: true, minShowMs: 0, title: 'Successor' });
    await host.animationFrame();
    assert.equal(host.tasks.length, 2);
    await host.task();
    await superseded;
    assertHeld(fixture, 'old rematch cancellation cannot release the successor lease');
    await host.task();
    fixture.root.opacity = 1;
    await host.animationFrame();
    await host.task();
    await host.animationFrame();
    assertHeld(fixture, 'successor also waits for its own post-opacity task');
    await host.task();
    assert.equal(successorWork, 1);
    assert.equal(fixture.transition.active, true);
    assert.equal(fixture.transition.visible, false);
    assert.equal(fixture.transition.holdingSceneForFadeIn, false);
    assert.ok(fixture.tick().includes('post'), 'supersession leaves no stale old-result frame hold');
    await host.advance(180);
    await successor;
    assert.deepEqual(fixture.lifecycleCalls, [], 'the canceled Battle Again never enters teardown');
    assert.equal(host.visibilityListeners.size, 0);
    assert.equal(host.frames.size, 0);
    assert.equal(host.tasks.length, 0);
    assert.equal(host.timers.size, 0);
  } finally {
    host.restore();
  }
}

console.log('transitionFadeFrame.selftest: real rematch cover, paint/task barrier, frame hold, reveal, and supersession pass');
