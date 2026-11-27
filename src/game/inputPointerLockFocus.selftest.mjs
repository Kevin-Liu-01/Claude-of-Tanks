import assert from 'node:assert/strict';
import { CHROME_ESCAPE_REFUSAL_MS, createChromePointerLockPage } from './chromePointerLockPage.test-support.mjs';
import { relockWaitMs } from './input.ts';
import { createPlayerFrameInput } from './playerFrameInput.ts';

// Item 243 (owner 2026-10-23: "clicking buttons like resume, x etc ... the tank ends up stuck looking at the cursor's
// last click position on one of those buttons"). The input layer runs against a fake page whose pointer lock follows
// Chrome's MouseLockController (chromePointerLockPage.test-support.mjs, shared with garageReturnState.selftest.mjs):
// Esc while locked is the browser's unlock gesture, every request in the 1250 ms after it is refused, and after a user
// unlock a request without transient activation is refused. Refusals reject the promise and fire 'pointerlockerror',
// as Chrome does.

let clock = 1000;
const flush = () => new Promise((resolve) => setImmediate(resolve));
/** Past a relock's wait (input.ts relockWaitMs): the page's clock moves on, and the wait's real timer runs out. */
async function passWindow() {
  clock += CHROME_ESCAPE_REFUSAL_MS + 300;
  await new Promise((resolve) => setTimeout(resolve, 1700));
  await flush();
}

/** The shared Chrome model on this file's clock (its post-Esc window modelled), with two menu buttons to click. */
function createPage(options = {}) {
  return { ...createChromePointerLockPage({ ...options, now: () => clock }),
    resumeButton: new EventTarget(), closeButton: new EventTarget() };
}

/** What Settings does: Esc opens the panel (input off), RESUME/X closes it and relocks inside the click. */
function openSettings(page) {
  page.input.setEnabled(false);
  page.input.releaseLock('settings');
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

// 1. Three fast Esc -> RESUME cycles inside Chrome's post-Esc refusal window: (photo-from-pause-279) no Resume asks
//    inside it, so none is refused (a refused one reopened Settings); each waits it out and the last one's lock lands as
//    it closes. Nothing latches cursor aim, and the gun keeps aiming through the screen centre (never at the RESUME
//    button).
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
    assert.equal(page.stats.attempts, 1, 'no RESUME inside Chrome\'s refusal window asks the browser');
    assert.equal(page.stats.refused, 0, 'so none is refused');
    assert.deepEqual(refusals, [], 'and no caller hears a refusal');
    assert.equal(page.input.isLocked(), false, 'the lock waits for the window');
    assert.equal(page.input.isCursorAim(), false, 'waiting UI relocks never latch cursor aim');
    assert.equal(deniedEvents, 0, 'no cursor-aim notice for a browser cooldown');
    const aim = frameAim(page.input);
    assert.ok(aimsAtCentre(aim), `the gun aims through the screen centre, not the RESUME button (${JSON.stringify(aim)})`);
    const ndc = page.input.getCursorNdc({ x: 9, y: 9 });
    assert.deepEqual(ndc, { x: 0, y: 0 }, 'a cursor parked on a menu button is never an aim point');

    // a canvas press inside the same window is refused too, and does not count either
    page.input.requestLock();
    await flush();
    assert.equal(page.stats.refused, 1, 'a battle click inside the window asks, and is refused');
    assert.equal(page.input.isCursorAim(), false, 'a battle click inside the refusal window is not evidence either');

    await passWindow();
    assert.equal(page.input.isLocked(), true, "the last Resume's wait ends in the lock as the window closes");
    assert.deepEqual(refusals, [], 'with no refusal on the way');
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

// 5. (round 5 Q2) releaseLock withdraws an attempt still in flight: Chrome grants a lock a task after the request, so a
//    caller that asked and then gave the cursor back (a battle start refused while it waited for a Garage return, a
//    Settings panel opened) lost nothing it held, and the lock landed over it after the release. A later request
//    supersedes the withdrawal. (review r1) An answered attempt, its lock engaged or refused, is never withdrawn: a
//    release with nothing in flight marks nothing (input.ts lockEngagedAttempt, lockDeniedAttempt). input.ts is the
//    page's only requester, Chrome answers each request once and a later request supersedes a mark, so only a lock that
//    lands with no request since (the page model's landWithoutRequest) can show a mark left on an answered attempt.
{
  const page = createPage();
  try {
    page.input.requestLock();
    page.input.releaseLock('battle-start'); // before the browser's answer
    await flush();
    await flush();
    assert.equal(page.document.pointerLockElement, null, 'a lock released while in flight does not stand when it lands');
    assert.equal(page.input.isLocked(), false);
    assert.equal(page.input.isCursorAim(), false, 'and the withdrawal is no refusal');
    page.input.requestLock();
    page.input.releaseLock('battle-start');
    page.input.requestLock(); // asked again before the first answer
    await flush();
    await flush();
    assert.equal(page.input.isLocked(), true, 'a later request supersedes the withdrawal');
  } finally {
    page.restore();
  }
}
for (const answered of ['engaged', 'refused']) {
  const page = createPage();
  try {
    page.input.requestLock();
    await flush();
    assert.equal(page.input.isLocked(), true);
    page.userEscape(); // the player's Esc drops it
    if (answered === 'refused') {
      page.input.requestLock(); // inside Chrome's post-Esc window
      await flush();
      assert.equal(page.stats.refused, 1, '(refused)');
    }
    clock += CHROME_ESCAPE_REFUSAL_MS + 100;
    page.input.releaseLock('battle-start'); // nothing in flight: the last attempt was answered
    page.landWithoutRequest();
    await flush();
    assert.equal(page.input.isLocked(), true, `a release after an attempt ${answered} withdraws nothing`);
  } finally {
    page.restore();
  }
}

// 6. (settings-unify-278 fix-back) Who owns a free pointer. The battle's Settings opens only on an unclaimed unlock (the
//    player's Esc, a lost page); photo mode's own release, unnamed, read as that Esc and opened Settings under its bar.
//    A release names its owner, which owns the free pointer until the next lock; a mode that holds the pointer free while
//    it runs (a kill-cam replay, a focused editor) claims every unlock while it holds.
{
  const page = createPage();
  try {
    page.input.requestLock();
    await flush();
    assert.equal(page.input.pointerUnlockOwner(), null, 'a held lock has no unlock owner');
    page.userEscape();
    assert.equal(page.input.pointerUnlockOwner(), null, "the player's Esc is an unclaimed unlock (Settings opens)");
    clock += CHROME_ESCAPE_REFUSAL_MS + 100;
    page.input.requestLock();
    await flush();
    page.input.releaseLock('photo-mode');
    await flush();
    assert.equal(page.input.isLocked(), false);
    assert.equal(page.input.pointerUnlockOwner(), 'photo-mode', "photo mode's release is photo mode's unlock");
    page.input.requestLock();
    await flush();
    assert.equal(page.input.pointerUnlockOwner(), null, 'the next lock ends the claim');
    page.userEscape();
    assert.equal(page.input.pointerUnlockOwner(), null, 'and the next Esc after it is unclaimed again');
    // a release that withdraws a request in flight owns the unlock that follows its landing
    clock += CHROME_ESCAPE_REFUSAL_MS + 100;
    page.input.requestLock();
    page.input.releaseLock('battle-start');
    await flush();
    await flush();
    assert.equal(page.input.isLocked(), false);
    assert.equal(page.input.pointerUnlockOwner(), 'battle-start', 'a withdrawn lock keeps its owner through its landing');
    // a holding claim owns every unlock while it holds, the player's Esc included
    let live = true;
    const drop = page.input.claimPointerUnlock('presentation', () => live);
    page.input.requestLock();
    await flush();
    page.userEscape();
    assert.equal(page.input.pointerUnlockOwner(), 'presentation', "a kill-cam replay's Esc is the replay's skip");
    live = false;
    assert.equal(page.input.pointerUnlockOwner(), null, 'a claim that no longer holds owns nothing');
    live = true;
    drop();
    assert.equal(page.input.pointerUnlockOwner(), null, 'a dropped claim owns nothing');
  } finally {
    page.restore();
  }
}

// 7. (photo-from-pause-279, Kevin 2026-11-26) Resume works at once after an Esc: a UI relock asked on a press inside the
//    post-Esc window waits it out (input.ts relockWaitMs) instead of asking, being refused and reopening Settings. A
//    release withdraws the wait (Settings reopened, photo mode opened by P from the battle Resume ran), a withdrawn
//    attempt's refusal reaches nobody, and the page's own unlock starts no wait.
{
  const page = createPage();
  try {
    page.input.requestLock();
    await flush();
    page.userEscape();
    openSettings(page);
    clock += 200;
    const refusals = [];
    clickToClose(page, page.resumeButton, 1180, 760, refusals);
    await flush();
    assert.equal(page.stats.attempts, 1, 'Resume 200 ms after the Esc asks nothing yet');
    // P from the running battle: photo mode releases the pointer, withdrawing the wait
    page.input.releaseLock('photo-mode');
    await passWindow();
    assert.equal(page.input.isLocked(), false, "the withdrawn wait never locks the photo mode's free pointer");
    assert.equal(page.stats.attempts, 1);
    assert.deepEqual(refusals, []);
    // photo mode's Esc back to the battle: the window has passed, so its relock asks at once and locks
    page.input.requestLock({ fromUi: true });
    await flush();
    assert.equal(page.input.isLocked(), true);

    // an Esc that closes Settings carries no activation: it asks at once (a wait would end in the same refusal later);
    // P lands before the refusal does, and that refusal reaches nobody (it reopened Settings over photo mode)
    page.userEscape();
    openSettings(page);
    page.activation.isActive = false;
    page.input.setEnabled(true);
    page.input.requestLock({ fromUi: true, onRefused: (retryInMs) => refusals.push(retryInMs) });
    assert.equal(page.stats.attempts, 3, 'a relock with no activation asks at once');
    page.input.releaseLock('photo-mode');
    await flush();
    await flush();
    assert.equal(page.stats.refused, 1, 'the browser refused it');
    assert.deepEqual(refusals, [], 'and the release that withdrew it kept the refusal from its caller');
    page.activation.isActive = true;
    await passWindow();
    page.input.requestLock();
    await flush();
    assert.equal(page.input.isLocked(), true);

    // the page's own unlock (photo mode's, from the locked battle) starts no wait: its relock asks at once and locks
    page.input.releaseLock('photo-mode');
    await flush();
    clock += 100;
    page.input.requestLock({ fromUi: true });
    assert.equal(page.stats.attempts, 5, "no wait after the page's own unlock");
    await flush();
    assert.equal(page.input.isLocked(), true);
  } finally {
    page.restore();
  }
}
{
  const fromUi = { fromUi: true };
  assert.equal(relockWaitMs(fromUi, 1000, 1500, 1200, true), 1300, 'the rest of the window');
  assert.equal(relockWaitMs(fromUi, 1000, 1500, 2600, true), 0, 'past the window');
  assert.equal(relockWaitMs(fromUi, 1000, 1500, 1200, false), 0, 'no activation: ask at once');
  assert.equal(relockWaitMs({}, 1000, 1500, 1200, true), 0, "a battle click is the player's own ask");
  assert.equal(relockWaitMs(fromUi, -Infinity, 1500, 1200, true), 0, 'no Esc yet');
}

console.log('inputPointerLockFocus selftest: OK');
