// 2026-11-02 audit round 3 A9 (U22 / IR15 / Q16): the kill-cam replay's lifecycle on the real controller
// (src/game/killcam.ts createKillCam, driven through onShellHit, playForResult, the Esc exit and update()) and the real
// battle input owner on the same bus (src/ui/battleInputOwner.ts battleInputOwnerFor, which the Esc menu, the veil and the
// report gate follow by its onChange). `active` is the one "a replay owns the screen" fact (killcamScreen.ts); begin() is
// its only setter and teardown() its only clearer, and every clear emits 'killcam:done':
//  - a replay that throws while it is being built (a disposed victim visual in configureReplayActors, a camera rig that
//    throws in the first beat) leaves the screen: `active` clears, the begin edge gets its done, the overlay, the body
//    veil class, the capture listeners and the fx suppression are undone, and playForResult answers false so the caller's
//    no-replay path runs (base: the throw reached the battle flow with `active` stuck true and no done edge, so Esc, the
//    veil and the kill-cam mix stayed held until a cancel());
//  - the controller starts the next replay after a failed one;
//  - a throw in the completion callback (the integration's onDone) still emits killcam:done, so the input owner tells
//    its listeners at once (base: the edge was dropped and the report gate waited for its 16 s watchdog), and still
//    lifts the exit's black fade (base: the fade stayed over the battle);
//  - a restore step that throws at teardown (a disposed wreck visual) still clears `active`, runs onDone and emits done.
// (round 3 A9, review round 1) also:
//  - a 'killcam:begin' listener that throws (an input owner's subscriber, the kill-cam mix) is a failed build: the flag
//    clears and the begin edge gets its done (before, the edge was emitted outside begin's try: `active` stayed true);
//  - a throwing spectate handover (spectate.maybeStart after a death replay) still emits the done edge, and with a
//    throwing onDone too the first error (onDone's) is the one that surfaces;
//  - a throwing light-set read at teardown (deps.battleLightsActive) still emits the done edge.
// A failure anywhere in this receipt fails it: an unexpected throw is reported with the soft checks, and a late throw on
// an exit timer sets the exit code at once (before, the uncaughtException listener that records late throws swallowed a
// hard assertion's throw too, and the receipt exited 0 with no output).
// The browser half (a real WebGL frame, the DOM overlay's paint) is not reproduced here.
import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera, Group, Vector3 } from 'three';

class ClassList {
  constructor() { this.names = new Set(); }
  add(...names) { for (const name of names) this.names.add(name); }
  remove(...names) { for (const name of names) this.names.delete(name); }
  toggle(name, on) {
    const next = on === undefined ? !this.names.has(name) : !!on;
    if (next) this.names.add(name); else this.names.delete(name);
    return next;
  }
  contains(name) { return this.names.has(name); }
}
const context2d = () => new Proxy({}, {
  get: (_target, key) => (key === 'measureText' ? () => ({ width: 10 })
    : key === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) })
      : key.startsWith?.('create') ? () => ({ addColorStop() {} }) : () => {}),
  set: () => true,
});
class FakeElement {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.classList = new ClassList();
    this.style = { setProperty() {}, removeProperty() {} };
    this.dataset = {};
    this.attributes = {};
    this.hidden = false;
    this.textContent = '';
    this.innerHTML = '';
    this.offsetWidth = 0;
    this.parentElement = null;
    this.className = '';
  }
  appendChild(child) { this.children.push(child); child.parentElement = this; return child; }
  append(...nodes) { for (const node of nodes) if (typeof node === 'object') this.appendChild(node); }
  insertAdjacentHTML() {}
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  remove() {
    const parent = this.parentElement;
    if (parent) parent.children = parent.children.filter((child) => child !== this);
    this.parentElement = null;
  }
  querySelector() { return new FakeElement('span'); }
  querySelectorAll() { return []; }
  addEventListener() {}
  removeEventListener() {}
  closest() { return null; }
  getContext() { return context2d(); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 20, right: 100, bottom: 20 }; }
}

const saved = {
  window: globalThis.window, document: globalThis.document, Element: globalThis.Element,
  getComputedStyle: globalThis.getComputedStyle,
};
const listeners = new Map();
globalThis.window = {
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  addEventListener(type, listener) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(listener);
  },
  removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
};
globalThis.document = {
  body: new FakeElement('body'), head: new FakeElement('head'), pointerLockElement: null,
  createElement: (tag) => new FakeElement(tag),
  createElementNS: (_ns, tag) => new FakeElement(tag),
  getElementById: () => null,
};
globalThis.Element = FakeElement;
globalThis.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1', getPropertyValue: () => '' });

let fakeNow = 1000;
const realPerformance = globalThis.performance;
Object.defineProperty(globalThis, 'performance', { value: { now: () => fakeNow }, configurable: true, writable: true });

const { createKillCam } = await import('./killcam.ts');
const { getSpec } = await import('../vehicles/specs.ts');
const { battleInputOwnerFor } = await import('../ui/battleInputOwner.ts');
const { killcamOwnsScreen } = await import('./killcamScreen.ts');

const spec = getSpec('m1a1_abrams_hc');
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
// the exit's wall-clock handover runs later on a timer: a replay left active throws there again (base). Only a timer's
// throw reaches this listener (the cases below run inside a try whose catch reports), and it fails the run at once.
const lateThrows = [];
const onLateThrow = (error) => {
  lateThrows.push(error?.message ?? String(error));
  process.exitCode = 1;
  console.error(`FAIL a late throw after its replay left the screen: ${error?.stack ?? error}`);
};
process.on('uncaughtException', onLateThrow);

/** One battle: a fresh controller on its own bus, the real input owner on that bus, a dead player hit by a shell.
 *  `breakGame()` makes the battle state throw when the spectate handover reads it; `breakLights()` the light-set read. */
function battle({ visual = {}, rig = {} } = {}) {
  const scene = new Scene();
  const edges = [];
  const handlers = new Map();
  const bus = {
    on(type, handler) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(handler);
    },
    emit(type, payload) {
      edges.push(type);
      for (const handler of handlers.get(type) || []) handler(payload);
    },
  };
  const owner = battleInputOwnerFor(bus, { now: () => fakeNow });
  let notified = 0;
  owner.onChange(() => { notified++; });
  const fxCalls = [];
  const player = {
    id: 'p', isPlayer: true, team: 'ally', spec, specId: 'm1a1_abrams_hc',
    state: { pos: new Vector3(0, 0, 0), yaw: 0, turretYaw: 0, gunPitch: 0, visualPitch: 0, visualRoll: 0 },
    combat: { destroyed: true, crew: {}, modules: {} },
    visual: {
      root: new Group(), isDestroyed: () => true, wreckState: () => 'plain',
      setDestroyed() {}, resetDestroyed() {}, syncFromState() {}, setVisible() {},
      ...visual,
    },
  };
  let gameBroken = false, lightsBroken = false;
  const game = {
    phase: 'battle', timeS: 10, tanks: [player], tankById: new Map([['p', player]]),
    // read only by the spectate handover (spectate.maybeStart) in the controller
    get result() { if (gameBroken) throw new Error('the battle state is gone'); return null; },
  };
  const rigCalls = new Proxy({}, { get: (_target, key) => (key === 'then' ? undefined : rig[key] || (() => {})) });
  const killcam = createKillCam({
    scene, camera: new PerspectiveCamera(), heightField: { getHeightAt: () => 0 },
    getPlayer: () => player, getGame: () => game, isBattleEntryCovered: () => false,
    getFx: () => ({ setReplaySuppressed: (on) => fxCalls.push(on) }),
    battleLightsActive: () => { if (lightsBroken) throw new Error('the light set is gone'); return true; },
    rig: rigCalls,
  });
  killcam.bindBus(bus);
  killcam.onShellHit({
    shellId: null, targetId: 'p', attackerId: 'e', destroyed: true, timeS: 10, pos: [0, 1, 0], normal: [0, 0, 1],
    localPos: [0, 1, 0], localDir: [0, 0, -1], modulesHit: [], crewHit: [], shellType: 'APFSDS', zone: 'hull',
  }, player);
  return { scene, bus, edges, owner, killcam, fxCalls, player, notifiedCount: () => notified,
    breakGame: () => { gameBroken = true; }, breakLights: () => { lightsBroken = true; } };
}

const replayGroup = (scene) => scene.children.some((child) => child.name === 'killcam');
const captureListeners = () => (listeners.get('keydown')?.size || 0) + (listeners.get('pointerdown')?.size || 0);
const bodyVeiled = () => document.body.classList.contains('cot-kc-live');
const fades = () => document.body.children.filter((child) => child.className === 'cot-kc-fadeblk');
const pressEscape = () => {
  for (const listener of [...(listeners.get('keydown') || [])]) {
    listener({ code: 'Escape', preventDefault() {}, stopImmediatePropagation() {} });
  }
};
/** The exit's handover on the frame clock (update()'s second driver once EXIT_HOLD_MS has passed). */
const runExit = (killcam) => {
  fakeNow += 5000;
  killcam.update(1 / 60);
};

const reported = [];
function play(world, onDone) {
  let played, thrown = null;
  const consoleError = console.error;
  console.error = (message) => { reported.push(String(message)); };
  try { played = world.killcam.playForResult('defeat', 10, onDone); } catch (error) { thrown = error; } finally {
    console.error = consoleError;
  }
  return { played, thrown };
}

/** After a replay left the screen, nothing it held is still held. */
function released(world, label) {
  check(world.killcam.isActive() === false, `${label}: the controller's flag is clear`);
  check(killcamOwnsScreen(world.bus) === false, `${label}: no replay owns the screen for the bus's readers`);
  check(world.owner.state === 'play', `${label}: the input owner is back in play (Esc, the veil) [${world.owner.state}]`);
  const begins = world.edges.filter((edge) => edge === 'killcam:begin').length;
  const dones = world.edges.filter((edge) => edge === 'killcam:done').length;
  check(begins === dones, `${label}: every killcam:begin has its killcam:done [${world.edges.join(', ')}]`);
  check(!replayGroup(world.scene), `${label}: the replay's scene group is gone`);
  check(!bodyVeiled(), `${label}: the body's replay veil class is gone`);
  check(captureListeners() === 0, `${label}: the replay's capture listeners are gone`);
}

try {
  // 1. a throw while the replay's actors are built: the victim's visual is disposed (configureReplayActors)
  {
    const world = battle({ visual: { isDestroyed() { throw new Error('the victim visual was disposed'); } } });
    let doneRan = 0;
    const { played, thrown } = play(world, () => { doneRan++; });
    check(thrown === null, `a replay that fails to build answers the battle flow, never throws into it [${thrown?.message}]`);
    check(played === false, 'a replay that fails to build answers false, so the caller runs its no-replay path');
    check(doneRan === 0, "a replay that never started runs no onDone (the caller's own path presents the result)");
    released(world, 'a failed build');
    check(world.notifiedCount() >= 2, `the input owner told its listeners of the release [${world.notifiedCount()}]`);
    check(reported.some((line) => line.startsWith('[killcam] the replay failed to start')),
      'the failed build is reported, not swallowed');
  }

  // 2. a throw in the replay's first beat, after the overlay opened and the fx were suppressed (the camera rig)
  {
    let rigGone = true;
    const world = battle({ rig: { setExternalPose() { if (rigGone) throw new Error('the camera rig is gone'); } } });
    const { played, thrown } = play(world, () => {});
    check(thrown === null && played === false, 'a replay whose first beat throws answers false');
    released(world, 'a failed first beat');
    check(world.fxCalls.at(-1) === false, `the fx suppression is lifted [${world.fxCalls.join(',')}]`);

    // 3. the same controller starts the next replay and runs it to its end
    rigGone = false;
    let doneRan = 0;
    const next = play(world, () => { doneRan++; });
    check(next.thrown === null && next.played === true, 'the next replay starts after a failed one');
    check(world.killcam.isActive() === true && world.owner.state === 'presentation', 'and owns the screen');
    pressEscape();
    let surfaced = null;
    try { runExit(world.killcam); } catch (error) { surfaced = error; }
    check(surfaced === null, `a replay that ran to its exit hands back without a throw [${surfaced?.message}]`);
    check(doneRan === 1, 'and hands the screen back through its onDone');
    released(world, 'a replay that ran to its exit');
  }

  // 4. a throw in the completion callback still emits the done edge and lifts the exit's fade
  {
    const world = battle();
    const onDoneError = new Error('the end overlay failed');
    const { played } = play(world, () => { throw onDoneError; });
    check(played === true, 'a replay with a throwing onDone starts');
    const earlierFades = new Set(fades());
    pressEscape();
    const fade = fades().find((element) => !earlierFades.has(element));
    check(!!fade, 'the exit lays its black fade');
    const before = world.notifiedCount();
    let surfaced = null;
    try { runExit(world.killcam); } catch (error) { surfaced = error; }
    check(surfaced === onDoneError, "the completion callback's own error still surfaces");
    released(world, 'a throwing onDone');
    check(world.notifiedCount() > before, "the input owner told its listeners at once (the report gate's edge)");
    await new Promise((resolve) => setTimeout(resolve, 80));
    check(!!fade?.classList.contains('lift'), 'the exit lifts its black fade');
    await new Promise((resolve) => setTimeout(resolve, 480));
  }

  // 5. a restore step that throws at teardown (the victim's wreck visual) still ends the replay and runs onDone
  {
    let wrecked = false;
    const world = battle({
      visual: {
        isDestroyed: () => !wrecked,
        resetDestroyed() { wrecked = true; },
        setDestroyed() { throw new Error('the wreck visual was disposed'); },
      },
    });
    let doneRan = 0;
    const { played } = play(world, () => { doneRan++; });
    check(played === true, 'a replay whose restore will throw starts');
    pressEscape();
    let surfaced = null;
    try { runExit(world.killcam); } catch (error) { surfaced = error; }
    check(surfaced?.message === 'the wreck visual was disposed', `the restore's error still surfaces [${surfaced?.message}]`);
    check(doneRan === 1, 'the integration onDone still runs (the result is presented)');
    released(world, 'a throwing restore');
    await new Promise((resolve) => setTimeout(resolve, 600));
  }

  // 6. (review round 1) a 'killcam:begin' listener that throws: the begin edge is part of the build, so the replay leaves
  //    the screen with its done edge and the battle flow takes its no-replay path
  {
    const world = battle();
    world.bus.on('killcam:begin', () => { throw new Error('a begin listener threw'); });
    let doneRan = 0;
    const before = reported.length;
    const { played, thrown } = play(world, () => { doneRan++; });
    check(thrown === null && played === false, `a replay whose begin listener throws answers false [${played}, ${thrown?.message}]`);
    check(doneRan === 0, 'and runs no onDone');
    released(world, 'a throwing begin listener');
    check(reported.slice(before).some((line) => line.startsWith('[killcam] the replay failed to start')),
      'the throwing begin listener is reported as a failed start');
  }

  // 7. (review round 1) the spectate handover after a death replay throws: the done edge is still emitted and the error
  //    surfaces (publishReplayCompletion's second step)
  {
    const world = battle();
    let doneRan = 0;
    const { played } = play(world, () => { doneRan++; });
    check(played === true, 'a death replay whose spectate handover will throw starts');
    pressEscape();
    world.breakGame();
    let surfaced = null;
    try { runExit(world.killcam); } catch (error) { surfaced = error; }
    check(surfaced?.message === 'the battle state is gone', `the spectate handover's error surfaces [${surfaced?.message}]`);
    check(doneRan === 1, 'the integration onDone ran before the handover');
    released(world, 'a throwing spectate handover');
    await new Promise((resolve) => setTimeout(resolve, 600));
  }

  // 8. (review round 1) onDone and the spectate handover both throw: the first error (onDone's) is the one that surfaces
  {
    const world = battle();
    const onDoneError = new Error('the end overlay failed first');
    const { played } = play(world, () => { throw onDoneError; });
    check(played === true, 'a replay whose onDone and handover will throw starts');
    pressEscape();
    world.breakGame();
    let surfaced = null;
    try { runExit(world.killcam); } catch (error) { surfaced = error; }
    check(surfaced === onDoneError, `with two throwing completion steps the first error surfaces [${surfaced?.message}]`);
    released(world, 'two throwing completion steps');
    await new Promise((resolve) => setTimeout(resolve, 600));
  }

  // 9. (review round 1) the host's light-set read throws at teardown: the done edge is still emitted
  {
    const world = battle();
    let doneRan = 0;
    const { played } = play(world, () => { doneRan++; });
    check(played === true, 'a replay whose light-set read will throw starts');
    pressEscape();
    world.breakLights();
    let surfaced = null;
    try { runExit(world.killcam); } catch (error) { surfaced = error; }
    check(surfaced?.message === 'the light set is gone', `the light-set read's error surfaces [${surfaced?.message}]`);
    check(doneRan === 1, 'the integration onDone still runs');
    released(world, 'a throwing light-set read');
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
} catch (error) {
  // an unexpected throw is a failure reported with the soft checks (never left to the late-throw listener)
  failures.push(`an unexpected throw in the cases: ${error?.stack ?? error}`);
} finally {
  globalThis.window = saved.window;
  globalThis.document = saved.document;
  globalThis.Element = saved.Element;
  globalThis.getComputedStyle = saved.getComputedStyle;
  Object.defineProperty(globalThis, 'performance', { value: realPerformance, configurable: true, writable: true });
}

process.off('uncaughtException', onLateThrow);
check(lateThrows.length === 0, `no exit timer throws after its replay left the screen [${lateThrows.join('; ')}]`);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  assert.fail(`killcamReplayLifecycle: ${failures.length} failure(s)`);
}
console.log('killcamReplayLifecycle.selftest: a failed build, a throwing onDone and a throwing restore all leave the screen with their done edge');
