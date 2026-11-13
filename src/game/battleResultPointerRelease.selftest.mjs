// Proof (implicit state machine audit, round 6 V6, 2026-11-07): the verdict gives the cursor back through the input
// layer. battleResultPresentationRuntime.ts update() asks its exitPointerLock port once, when it first sees the battle's
// result, and main.ts bound that port to document.exitPointerLock, which releases a lock already held and nothing else.
// A pointer lock lands a task after its request, so a canvas recapture asked in the frame before the verdict (a press on
// the battle canvas: pointerLockFeedbackRuntime.ts asks while battlePhasePolicy.ts canRecapturePointer holds, which
// stops once a result is in) was answered after the release and held the pointer over the result and its report. main
// now binds input.releaseLock(), which withdraws a request still in flight (input.ts, round 5 Q2: its lock is released
// as it lands). main.ts's own composition runs here (app/mainComposition.test-support.mjs) over the real runtime, input
// layer, recapture runtime and phase policy, on a page whose pointer lock answers as Chrome's
// (chromePointerLockPage.test-support.mjs, the one model the pointer-lock receipts share).
//   1. A recapture in flight at the verdict: no lock stands once it lands, and the next battle's recapture locks (the
//      withdrawal was that request's alone). Fails on b03868e697: the lock lands over the result.
//   2. The lock held at the verdict: released, as before.
// The browser half (Chrome's own answer timing) is not reproduced here.
import assert from 'node:assert/strict';
import { createChromePointerLockPage } from './chromePointerLockPage.test-support.mjs';
import { createBattleResultPresentationRuntime } from './battleResultPresentationRuntime.ts';
import { createBattlePhasePolicy } from './battlePhasePolicy.ts';
import { createPointerLockFeedbackRuntime } from './pointerLockFeedbackRuntime.ts';
import { createBus } from './stateCore.ts';
import { mainStatement, runMainStatements } from '../app/mainComposition.test-support.mjs';

const resultStatement = mainStatement('const battleResultPresentation = createBattleResultPresentationRuntime({');
/** Chrome answers a request a task later; a release lands as a microtask. */
const settle = async () => { for (let turn = 0; turn < 4; turn++) await new Promise((resolve) => setImmediate(resolve)); };

/** A battle on the page: main's result composition, the canvas recapture and the phase policy main builds them with. */
function battle() {
  const page = createChromePointerLockPage();
  const bus = createBus();
  const game = {
    phase: 'battle', result: null, resultReason: null, gameMode: 'standard', timeS: 30, matchModeState: null,
    ruleset: { respawnS: null }, player: { id: 'me', combat: { destroyed: false }, state: { pos: { x: 0, y: 0, z: 0 } } },
  };
  const presented = [];
  const runtime = runMainStatements(resultStatement, {
    game, bus, input: page.input, createBattleResultPresentationRuntime,
    killcam: { lastBeginWallMs: null, playForResult: () => false },
    rig: { release() {}, startDeathCam() {}, endDeathCam() {} },
    veilHud() {}, endOverlay: { show: (result) => presented.push(result) }, debugFlags: {},
    battleEndingCamera: { begin: () => false, frame() {}, end() {} },
  }, 'battleResultPresentation');
  // main.ts: battlePhase and createPointerLockFeedbackRuntime (the recapture's canvas is renderer.domElement)
  const battlePhase = createBattlePhasePolicy({
    getPhase: () => game.phase, hasResult: () => !!game.result,
    hasControllablePlayer: () => !!(game.player?.combat && !game.player.combat.destroyed),
    isKillcamActive: () => false, isBattleLoadVisible: () => false,
  });
  const feedback = createPointerLockFeedbackRuntime({
    input: page.input, bus, canvas: page.canvas, audioResume() {}, isBattleStageVisible: battlePhase.isBattleStageVisible,
    canRecapturePointer: () => battlePhase.canRecapturePointer({ settingsOpen: false, spectating: false }),
    ensureTouchControls: async () => null, notices: { show() {}, dismiss() {} },
  });
  return {
    page, game, runtime, presented,
    /** A press on the battle canvas. */
    press: () => page.canvas.dispatchEvent(new Event('mousedown')),
    dispose() { feedback.dispose(); page.restore(); },
  };
}

const wrong = [];

// ---- 1. a recapture in flight at the verdict
{
  const b = battle();
  try {
    b.runtime.update();
    b.press();
    assert.equal(b.page.stats.attempts, 1, 'setup: the press on the battle canvas asks for the lock');
    assert.equal(b.page.locked(), false, 'setup: the lock has not landed yet (Chrome answers a task later)');
    b.game.result = 'victory';
    b.runtime.update();
    assert.deepEqual(b.presented, ['victory'], 'setup: the verdict lands and its result is presented');
    await settle();
    if (b.page.locked()) {
      wrong.push('a recapture asked before the verdict landed after it and holds the pointer over the result');
    } else {
      b.press();
      await settle();
      assert.equal(b.page.stats.attempts, 1, 'setup: no recapture once the result is in (canRecapturePointer)');
      // the next battle: its own recapture locks
      b.runtime.reset();
      b.game.result = null;
      b.press();
      await settle();
      assert.equal(b.page.stats.attempts, 2, 'setup: the next battle\'s press asks for the lock');
      if (!b.page.locked()) wrong.push('the next battle\'s recapture did not lock (the withdrawal outlived its request)');
    }
  } finally {
    b.dispose();
  }
}

// ---- 2. the lock held at the verdict
{
  const b = battle();
  try {
    b.runtime.update();
    b.press();
    await settle();
    assert.equal(b.page.locked(), true, 'setup: the recapture locks the pointer');
    b.game.result = 'defeat';
    b.runtime.update();
    await settle();
    if (b.page.locked()) wrong.push('the lock held at the verdict was not released');
  } finally {
    b.dispose();
  }
}

if (wrong.length) {
  console.error(`battleResultPointerRelease: the verdict left the pointer locked:\n  ${wrong.join('\n  ')}`);
  assert.fail('the verdict gives the cursor back, a lock still in flight included');
}
console.log('battleResultPointerRelease: the verdict releases a held lock and withdraws a recapture still in flight '
  + '(main.ts binds the result presentation\'s exitPointerLock to input.releaseLock); the next battle\'s recapture '
  + 'locks PASS');
