// 2026-11-02 audit F4: the result presentation's death beat and ending beats are presentation time, not wall time.
// The runtime is updated only while the battle frame runs (battleFrameRuntime skips it while Settings is open, and a
// hidden tab runs no frames), so a wall-clock deadline that passed during a pause fired the beat the moment play
// resumed. The beat clock advances only across updates (one frame step at most per update), so a pause holds the beat.
// Also: the ending camera validates a plan before it writes anything, so a second begin cannot corrupt a running beat.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBattleResultPresentationRuntime } from './battleResultPresentationRuntime.ts';
import { createBattleEndingCamera } from './battleEndingCamera.ts';

function harness({ ending = false } = {}) {
  const calls = [];
  const plays = [];
  let wallMs = 100;
  const game = {
    result: null, resultReason: null, gameMode: 'standard', timeS: 12,
    player: { combat: { destroyed: false }, state: { pos: { x: 10, y: 3, z: -20 } } },
    matchModeState: null,
  };
  const runtime = createBattleResultPresentationRuntime({
    game,
    killcam: {
      lastBeginWallMs: null,
      playForResult(result, timeS, onDone, options) { plays.push({ result, onDone, options }); return false; },
    },
    rig: { release: () => calls.push('release'), startDeathCam: () => calls.push('deathCam') },
    veilHud: () => {},
    showEndOverlay: (result) => calls.push(`show:${result}`),
    emitPresented: () => {},
    exitPointerLock: () => {},
    recordFlow: () => {},
    ending: ending ? {
      camera: { begin: () => true, frame: (u) => calls.push(`frame:${Math.round(u * 100) / 100}`), end: () => calls.push('end') },
      modeState: () => null,
      emitBeat: (phase) => calls.push(`beat:${phase}`),
    } : null,
    now: () => wallMs,
    deathBeatMs: 2600,
  });
  /** Run frames at 60 Hz up to `toMs` (each frame updates the runtime). */
  const framesTo = (toMs) => {
    while (wallMs < toMs) {
      wallMs = Math.min(toMs, wallMs + 16);
      runtime.update();
    }
  };
  /** No frames for `ms` (Settings open, a hidden tab): wall time passes, the runtime is not updated. */
  const pause = (ms) => { wallMs += ms; };
  return { game, runtime, calls, plays, framesTo, pause, get now() { return wallMs; } };
}

// the death beat: a pause in the middle of it holds the beat; the remaining time runs after the resume
{
  const h = harness();
  h.game.player.combat.destroyed = true;
  h.runtime.update();
  assert.equal(h.runtime.snapshot().pendingDeadlineMs, 2700, 'the beat is due 2.6 s of presentation after the death');
  h.framesTo(1100); // 1.0 s of the beat on screen
  h.pause(30_000); // the player opens Settings (the live battle pauses)
  h.runtime.update(); // the first frame after the panel closes
  assert.equal(h.plays.length, 0, 'a death beat due during the pause does not fire the moment play resumes');
  // (the resume frame counts one frame step, at most 100 ms, of the pause)
  h.framesTo(h.now + 1400);
  assert.equal(h.plays.length, 0, 'the beat still has its remaining time to run');
  h.framesTo(h.now + 200);
  assert.equal(h.plays.length, 1, 'the beat fires once its 2.6 s of presentation have run');
}

// steady frames: the beat fires on its deadline, as before (no stretch at 60 Hz)
{
  const h = harness();
  h.game.player.combat.destroyed = true;
  h.runtime.update();
  h.framesTo(2690);
  assert.equal(h.plays.length, 0);
  h.framesTo(2700);
  assert.equal(h.plays.length, 1, 'unpaused, the death beat fires at 2.6 s of wall time');
}

// an ending camera beat: a pause holds its progress; the report waits for the rest of the beat
{
  const h = harness({ ending: true });
  h.game.result = 'draw';
  h.game.resultReason = 'time_limit';
  h.runtime.update(); // the time's-up beat (2.5 s) begins
  assert.equal(h.runtime.snapshot().beat, 'timesUp');
  h.framesTo(100 + 1000);
  h.pause(60_000); // a hidden tab: no frames
  h.runtime.update();
  assert.equal(h.calls.some((call) => call.startsWith('show:')), false, 'the beat did not end behind the pause');
  const lastFrame = Number(h.calls.filter((call) => call.startsWith('frame:')).at(-1).slice(6));
  assert.ok(lastFrame > 0.39 && lastFrame < 0.45, `the beat resumes where it stood (u ${lastFrame})`);
  h.framesTo(h.now + 1600);
  assert.equal(h.calls.filter((call) => call.startsWith('show:')).length, 1, 'then it ends into the report');
  assert.equal(h.runtime.snapshot().beat, null);
}

// the ending camera: a second begin with a plan that frames nothing leaves a running beat's framing untouched
{
  const poses = [];
  const rig = {
    setExternalPose(position, target) { poses.push([position.x, position.y, position.z, target.x, target.y, target.z]); },
    release() {},
  };
  const camera = { position: new THREE.Vector3(40, 10, 40) };
  const endingCamera = createBattleEndingCamera({ rig, camera, getPlayerYaw: () => 0, getHeightAt: () => 0, win: null });
  const plan = { beat: 'wreckOrbit', durationS: 3, focus: { kind: 'wreck', x: 0, z: 0, y: 0, radiusM: 6, id: 'me' } };
  assert.equal(endingCamera.begin(plan, () => {}), true);
  endingCamera.frame(0.8);
  const before = poses.at(-1);
  assert.equal(endingCamera.begin({ beat: 'none', durationS: 0, focus: null }, () => {}), false);
  endingCamera.frame(0.8);
  assert.deepEqual(poses.at(-1), before, 'a refused begin never rewrites the running beat\'s focus');
  assert.equal(endingCamera.active, true);
  endingCamera.end();
  assert.equal(endingCamera.active, false);
}

console.log('battleResultBeatClock.selftest: death beat and ending beat hold through a pause, steady frames keep their deadline, a refused begin keeps the running beat pass');
