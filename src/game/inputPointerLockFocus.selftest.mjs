import assert from 'node:assert/strict';
import { createInput } from './input.ts';
import { createPlayerFrameInput } from './playerFrameInput.ts';

// Item 243 (owner 2026-10-23: "clicking buttons like resume, x etc ... the tank ends up stuck looking at the cursor's
// last click position on one of those buttons"). The input layer runs against a fake page whose pointer lock follows
// Chrome's MouseLockController: Esc while locked is the browser's unlock gesture, every request in the 1250 ms after
// it is refused, and after a user unlock a request without transient activation is refused. Refusals reject the
// promise and fire 'pointerlockerror', as Chrome does.

const CHROME_ESCAPE_REFUSAL_MS = 1250;
let clock = 1000;
const flush = () => new Promise((resolve) => setImmediate(resolve));

class FakeMouseEvent extends Event {
  constructor(type, { target, clientX = 0, clientY = 0, button = 0 } = {}) {
    super(type, { cancelable: true });
    this.fakeTarget = target;
    this.clientX = clientX;
    this.clientY = clientY;
    this.button = button;
    this.movementX = 0;
    this.movementY = 0;
  }
  get target() { return this.fakeTarget; }
}

function createPage({ lock = 'chrome', input: inputMode = 'fine' } = {}) {
  const activation = { isActive: true };
  const page = new EventTarget();
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    pointerLockElement: null,
    body: { dataset: { cotInput: inputMode } },
    exitPointerLock() {
      if (!document.pointerLockElement) return;
      unlockedByTarget = true;
      document.pointerLockElement = null;
      queueMicrotask(() => document.dispatchEvent(new Event('pointerlockchange')));
    },
  });
  const canvas = Object.assign(new EventTarget(), {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }),
  });
  const resumeButton = new EventTarget();
  const closeButton = new EventTarget();
  let lastUserEscape = -Infinity;
  let unlockedByTarget = true;
  const stats = { attempts: 0, refused: 0 };
  const refuse = () => {
    stats.refused += 1;
    setImmediate(() => document.dispatchEvent(new Event('pointerlockerror')));
    return Promise.reject(new Error('pointer lock refused'));
  };
  if (lock === 'chrome') {
    canvas.requestPointerLock = () => {
      stats.attempts += 1;
      if (!unlockedByTarget && !activation.isActive) return refuse();
      if (clock < lastUserEscape + CHROME_ESCAPE_REFUSAL_MS) return refuse();
      setImmediate(() => {
        document.pointerLockElement = canvas;
        document.dispatchEvent(new Event('pointerlockchange'));
      });
      return Promise.resolve();
    };
  } else if (lock === 'sandboxed') {
    canvas.requestPointerLock = () => {
      stats.attempts += 1;
      throw new DOMException('The root document of this element is not valid for pointer lock.', 'SecurityError');
    };
  } else if (lock === 'refuse-all') {
    canvas.requestPointerLock = () => { stats.attempts += 1; return refuse(); };
  }
  // touch phones: 'none' leaves requestPointerLock undefined (a call would throw a TypeError)

  const globals = {
    window: page,
    document,
    localStorage: { getItem: () => null, setItem() {} },
    navigator: { userActivation: activation },
    performance: { now: () => clock },
    matchMedia: (query) => ({ matches: inputMode === 'coarse' ? query === '(pointer: coarse)' : query === '(pointer: fine)' }),
  };
  const prior = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  const restore = () => {
    for (const [key, descriptor] of Object.entries(prior)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  };
  const input = createInput({ lockElement: canvas });
  const mouse = (type, target, clientX, clientY) =>
    page.dispatchEvent(new FakeMouseEvent(type, { target, clientX, clientY }));
  return {
    input, document, canvas, resumeButton, closeButton, activation, stats, restore, mouse,
    /** The player's Esc while locked: Chrome consumes it and drops the lock. */
    userEscape() {
      lastUserEscape = clock;
      unlockedByTarget = false;
      document.pointerLockElement = null;
      document.dispatchEvent(new Event('pointerlockchange'));
    },
  };
}

/** What Settings does: Esc opens the panel (input off), RESUME/X closes it and relocks inside the click. */
function openSettings(page) {
  page.input.setEnabled(false);
  page.input.releaseLock();
}
function clickToClose(page, button, x, y, refusals) {
  page.mouse('mousemove', button, x, y);
  page.mouse('mousedown', button, x, y);
  page.mouse('mouseup', button, x, y);
  page.input.setEnabled(true);
  page.input.requestLock({ fromUi: true, onRefused: (retryInMs) => refusals.push(retryInMs) });
}

function frameAim(input) {
  const frame = createPlayerFrameInput({ input, hasAmmo: () => true, forceFire: () => false });
  const player = { input: { throttle: 0, steer: 0, brake: false, fire: false, shellSlot: 0 }, combat: {} };
  const camera = frame.poll({ dtSeconds: 1 / 60, inBattle: true, paused: false, killcamActive: false,
    cameraLocked: false, rigMode: 'ARCADE', player });
  const aim = { cursorAim: camera.cursorAim, x: camera.cursorX, y: camera.cursorY };
  frame.dispose();
  return aim;
}
const aimsAtCentre = (aim) => !aim.cursorAim || (aim.x === 0 && aim.y === 0);

// 1. Three fast Esc -> RESUME cycles inside Chrome's post-Esc refusal window: the refusals never latch cursor aim, the
//    gun keeps aiming through the screen centre (never at the RESUME button), and the next canvas click locks.
{
  const page = createPage();
  try {
    let lockedEvents = 0;
    let deniedEvents = 0;
    page.input.onLockDenied(() => { deniedEvents += 1; });
    page.input.onLockRestored(() => { lockedEvents += 1; });
    page.mouse('mousemove', page.canvas, 640, 400);
    page.input.requestLock();
    await flush();
    assert.equal(page.input.isLocked(), true, 'the battle click locks the pointer');

    const refusals = [];
    for (let cycle = 0; cycle < 3; cycle++) {
      if (page.input.isLocked()) page.userEscape();
      openSettings(page);
      clock += 150;
      clickToClose(page, page.resumeButton, 1180, 760, refusals);
      await flush();
      clock += 150;
    }
    assert.equal(page.stats.refused, 3, 'every RESUME landed inside Chrome\'s refusal window');
    assert.equal(page.input.isLocked(), false);
    assert.equal(page.input.isCursorAim(), false, 'refusals of the UI relock never latch cursor aim');
    assert.equal(deniedEvents, 0, 'no cursor-aim notice for a browser cooldown');
    assert.equal(refusals.length, 3, 'each refused relock reports once (promise rejection and event are one attempt)');
    assert.ok(refusals[0] > 0 && refusals[0] <= 1600, `the first refusal says when to retry (${refusals[0]} ms)`);
    const aim = frameAim(page.input);
    assert.ok(aimsAtCentre(aim), `the gun aims through the screen centre, not the RESUME button (${JSON.stringify(aim)})`);
    const ndc = page.input.getCursorNdc({ x: 9, y: 9 });
    assert.deepEqual(ndc, { x: 0, y: 0 }, 'a cursor parked on a menu button is never an aim point');

    // a canvas press inside the same window is refused too, and does not count either
    page.input.requestLock();
    await flush();
    assert.equal(page.input.isCursorAim(), false, 'a battle click inside the refusal window is not evidence either');

    clock += CHROME_ESCAPE_REFUSAL_MS;
    page.input.requestLock();
    await flush();
    assert.equal(page.input.isLocked(), true, 'the first click after the window locks again');
    assert.equal(lockedEvents, 0, 'no restore notice: the fallback never engaged');
  } finally {
    page.restore();
  }
}

// 2. Esc closes Settings: a keyboard close carries no user activation, so Chrome refuses the relock however long the
//    panel stayed open. Three such cycles never latch cursor aim either.
{
  const page = createPage();
  try {
    page.input.requestLock();
    await flush();
    const refusals = [];
    for (let cycle = 0; cycle < 3; cycle++) {
      if (page.input.isLocked()) page.userEscape();
      openSettings(page);
      clock += 2000;
      page.activation.isActive = false;
      page.input.setEnabled(true);
      page.input.requestLock({ fromUi: true, onRefused: (retryInMs) => refusals.push(retryInMs) });
      await flush();
    }
    assert.equal(page.stats.refused, 3);
    assert.equal(page.input.isCursorAim(), false, 'gesture-less Settings relocks never latch cursor aim');
    assert.deepEqual(refusals, [0, 0, 0], 'outside the refusal window there is nothing to wait for: click to resume');
    page.activation.isActive = true;
    page.input.requestLock();
    await flush();
    assert.equal(page.input.isLocked(), true, 'the resume click locks');
  } finally {
    page.restore();
  }
}

// 3. Environments that can never lock still fall back to cursor aim: a synchronous SecurityError latches at once
//    (and stops re-asking), three refused battle clicks latch an asynchronous refuser. Cursor aim follows the
//    cursor only once it moved over the battle, and a click on a menu control re-centres it.
{
  const page = createPage({ lock: 'sandboxed' });
  try {
    let deniedEvents = 0;
    page.input.onLockDenied(() => { deniedEvents += 1; });
    page.mouse('mousemove', page.resumeButton, 1180, 760);
    page.input.requestLock();
    assert.equal(page.input.isCursorAim(), true, 'a synchronous SecurityError latches cursor aim immediately');
    assert.equal(deniedEvents, 1, 'the cursor-aim notice shows once');
    page.input.requestLock();
    assert.equal(page.stats.attempts, 1, 'a structurally lock-free page is not asked again');
    assert.ok(aimsAtCentre(frameAim(page.input)), 'a cursor that never crossed the battle aims through the centre');
    page.mouse('mousemove', page.canvas, 960, 200);
    const aim = frameAim(page.input);
    assert.equal(aim.cursorAim, true);
    assert.deepEqual([aim.x, aim.y], [0.5, 0.5], 'cursor aim follows the cursor over the battle');
    openSettings(page);
    page.mouse('mousemove', page.closeButton, 1240, 40);
    page.mouse('mousedown', page.closeButton, 1240, 40);
    page.input.setEnabled(true);
    page.input.requestLock({ fromUi: true });
    assert.equal(page.input.isCursorAim(), true, 'the fallback stays on after Settings');
    assert.ok(aimsAtCentre(frameAim(page.input)), 'after X the gun aims through the centre until the mouse moves');
    page.mouse('mousemove', page.canvas, 320, 600);
    assert.deepEqual(page.input.getCursorNdc({ x: 0, y: 0 }), { x: -0.5, y: -0.5 }, 'then it follows the cursor again');
  } finally {
    page.restore();
  }
}
{
  const page = createPage({ lock: 'refuse-all' });
  try {
    for (let click = 1; click <= 3; click++) {
      assert.equal(page.input.isCursorAim(), false, `refused battle click ${click - 1} is not yet durable`);
      page.input.requestLock();
      await flush();
    }
    assert.equal(page.input.isCursorAim(), true, 'three refused battle clicks latch cursor aim where lock never works');
  } finally {
    page.restore();
  }
}

// 4. Touch phones never ask for pointer lock, and taps on Settings' X / RESUME never become an aim point: the
//    synthetic mouse events a tap leaves behind sit on the button, and the swipe-aimed gun keeps the screen centre.
for (const lock of ['none', 'refuse-all']) {
  const page = createPage({ lock, input: 'coarse' });
  try {
    let refused = 0;
    for (const button of [page.closeButton, page.resumeButton, page.closeButton]) {
      openSettings(page);
      page.mouse('mousemove', button, 790, 30);
      page.mouse('mousedown', button, 790, 30);
      page.mouse('mouseup', button, 790, 30);
      page.input.setEnabled(true);
      page.input.requestLock({ fromUi: true, onRefused: () => { refused += 1; } });
      await flush();
    }
    assert.equal(page.stats.attempts, 0, `touch layout never requests pointer lock (${lock})`);
    assert.equal(refused, 0, 'so there is nothing to resume from');
    assert.equal(page.input.isCursorAim(), false, `a tap on X never switches touch aim to cursor aim (${lock})`);
    page.input.addVirtualAim(24, 0);
    const out = { x: 0, y: 0 };
    page.input.consumeMouseDelta(out, 1 / 60);
    assert.ok(out.x < 0, 'a swipe still turns the gun');
    assert.ok(aimsAtCentre(frameAim(page.input)), 'and the aim stays on the screen centre, not the X button');
  } finally {
    page.restore();
  }
}

console.log('inputPointerLockFocus selftest: OK');
