import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createBattleFrameRuntime } from './battleFrameRuntime.ts';
import { createReplayTrackBuilder } from './replay/replayTrack.ts';
import { createReplayViewer } from './replay/replayViewer.ts';

const game = {
  phase: 'garage',
  preBattleS: 0,
  result: null,
  player: { input: {}, combat: {} },
};
let settingsOpen = false;
let killcamActive = false;
let networkActive = false;
let warmPending = false;
let simulationSteps = 0;
let capturedPoses = 0;
let resultUpdates = 0;
const inputSamples = [];
const networkPumps = [];
const countdownFrames = [];
const pauseEdges = [];
const presentationFrames = [];
let rollouts = 0;
let onNetworkPump = () => {};

const runtime = createBattleFrameRuntime({
  game,
  settings: { isOpen: () => settingsOpen },
  killcam: { isActive: () => killcamActive },
  input: {
    camera: {},
    poll: (sample) => { inputSamples.push({ ...sample }); },
    dispose: () => {},
  },
  network: {
    isActive: () => networkActive,
    pump: (dtSeconds, nowMs) => {
      networkPumps.push([dtSeconds, nowMs]);
      onNetworkPump();
    },
  },
  countdown: {
    isWarmPending: () => warmPending,
    advance: (seconds, wallDtSeconds, pending) => pending && seconds <= 1
      ? seconds
      : Math.max(0, seconds - wallDtSeconds),
    show: (seconds) => countdownFrames.push(seconds),
    rollout: () => { rollouts += 1; },
  },
  presentation: {
    captureSoloPose: () => { capturedPoses += 1; },
    update: (dtSeconds, alpha) => presentationFrames.push([dtSeconds, alpha]),
    updateResult: () => { resultUpdates += 1; },
  },
  getRigMode: () => 'ARCADE',
  stepSimulation: () => { simulationSteps += 1; },
  emitPause: (paused) => pauseEdges.push(paused),
});

const stableReceipt = runtime.receipt;
const garageReceipt = runtime.advance(0.01, 0.01, 100, false);
assert.equal(garageReceipt, stableReceipt, 'the frame receipt is retained');
assert.equal(garageReceipt.inBattle, false);
assert.equal(networkPumps.length, 0, 'Garage network pumping remains before its early return');
assert.equal(inputSamples[0].player, game.player);
assert.deepEqual(presentationFrames[0], [0.01, 0]);

game.phase = 'battle';
game.preBattleS = 3;
runtime.advance(0.1, 0.5, 200, true);
assert.equal(game.preBattleS, 2.5);
assert.equal(countdownFrames.at(-1), 2.5);
assert.equal(simulationSteps, 0);
assert.equal(resultUpdates, 1);
assert.equal(inputSamples.at(-1).cameraLocked, true);
assert.deepEqual(networkPumps.at(-1), [0.1, 200]);

game.preBattleS = 1;
warmPending = true;
runtime.advance(0.1, 0.5, 300, false);
assert.equal(game.preBattleS, 1, 'the final countdown second waits for warm work');
warmPending = false;
game.preBattleS = 0.1;
runtime.advance(0.1, 0.5, 400, false);
assert.equal(game.preBattleS, 0);
assert.equal(rollouts, 1, 'countdown crossing emits one rollout edge');

runtime.advance(1 / 30, 1 / 30, 500, false);
assert.equal(simulationSteps, 2, 'fixed-step debt advances at 60 Hz');
assert.equal(capturedPoses, 2);
assert.ok(Math.abs(runtime.receipt.presentationAlpha) < 1e-9);
runtime.advance(0.2, 0.2, 600, false);
assert.equal(simulationSteps, 6, 'catch-up is bounded to four steps');

networkActive = true;
runtime.advance(0.05, 0.05, 700, false);
assert.equal(simulationSteps, 6, 'network authority never runs local simulation');
assert.equal(runtime.receipt.presentationAlpha, 1);
assert.equal(countdownFrames.at(-1), game.preBattleS);

networkActive = false;
const beforeNetworkRetirement = {
  simulationSteps, capturedPoses, resultUpdates, frames: presentationFrames.length,
};
for (let frame = 0; frame < 6; frame++) runtime.advance(0.1, 0.1, 710 + frame, false);
assert.deepEqual({ simulationSteps, capturedPoses, resultUpdates, frames: presentationFrames.length },
  beforeNetworkRetirement,
  'a closed network session cannot advance solo truth, results or disposed presentation during Garage return');
game.phase = 'garage';
runtime.advance(0.01, 0.01, 720, false);
game.phase = 'battle';
runtime.advance(0.05, 0.05, 730, false);
assert.equal(simulationSteps, beforeNetworkRetirement.simulationSteps + 3,
  'the next genuine solo battle resumes its normal simulation after Garage');
settingsOpen = true;
runtime.advance(0.1, 0.1, 800, false);
assert.equal(runtime.receipt.livePaused, true);
assert.deepEqual(pauseEdges, [true]);
assert.equal(presentationFrames.at(-1)[0], 0.05, 'live pause freezes presentation');
settingsOpen = false;
runtime.advance(0.1, 0.1, 900, false);
assert.equal(runtime.receipt.dtSeconds, 1 / 60, 'resume integrates at most one fixed step');
assert.equal(runtime.pauseInfo.resumes, 1);
assert.equal(runtime.pauseInfo.lastResumeDtR, 1 / 60);
assert.deepEqual(pauseEdges, [true, false]);

killcamActive = true;
const presentationCount = presentationFrames.length;
runtime.advance(0.05, 0.05, 1000, false);
assert.equal(presentationFrames.length, presentationCount, 'killcam freezes gameplay presentation');
assert.equal(inputSamples.at(-1).killcamActive, true);

killcamActive = false;
runtime.resetSimulationAccumulator();
runtime.advance(1 / 120, 1 / 120, 1100, false);
assert.equal(runtime.receipt.presentationAlpha, 0.5, 'explicit reset clears old fixed-step debt');

networkActive = true;
onNetworkPump = () => { networkActive = false; };
const beforeSameFrameClose = { simulationSteps, resultUpdates, frames: presentationFrames.length };
runtime.advance(1 / 60, 1 / 60, 1200, false);
assert.deepEqual({ simulationSteps, resultUpdates, frames: presentationFrames.length },
  beforeSameFrameClose, 'a terminal callback inside the first network pump cannot fall into solo');
onNetworkPump = () => {};
runtime.resetSimulationAccumulator(); // Solo entry resets even if Garage never rendered a frame.
runtime.advance(1 / 60, 1 / 60, 1300, false);
assert.equal(simulationSteps, beforeSameFrameClose.simulationSteps + 1,
  'explicit solo setup releases the network retirement lease without a rendered Garage frame');

// a replay being watched (docs/REPLAY.md §5): posed each frame, never stepped, no countdown, drawn at alpha 1; paused
// with the menu like any battle, and off again the frame it stops
{
  const replayGame = { phase: 'battle', preBattleS: 3, result: null, player: { input: {}, combat: {} } };
  let replayActive = true, replayPaused = false, steps = 0;
  const advanced = [], frames = [], counted = [], rolled = [], order = [];
  const replayRuntime = createBattleFrameRuntime({
    game: replayGame,
    settings: { isOpen: () => replayPaused },
    killcam: { isActive: () => false },
    input: { camera: {}, poll: () => {}, dispose: () => {} },
    network: { isActive: () => false, pump: () => {} },
    countdown: { isWarmPending: () => false, advance: (seconds, wall) => Math.max(0, seconds - wall), show: (seconds) => counted.push(seconds),
      rollout: (late) => rolled.push(late) },
    presentation: { captureSoloPose: () => order.push('capture'), update: (dt, alpha) => frames.push(alpha), updateResult: () => {} },
    getRigMode: () => 'ARCADE',
    stepSimulation: () => { steps += 1; },
    emitPause: () => {},
    replay: { isActive: () => replayActive, advance: (dt) => { advanced.push(dt); order.push('pose'); } },
  });
  replayRuntime.advance(0.05, 0.05, 0, false);
  replayRuntime.advance(0.05, 0.05, 50, false);
  assert.deepEqual(advanced, [0.05, 0.05], 'a replay advances by the frame');
  assert.equal(steps, 0, 'a replay never steps the simulation');
  assert.deepEqual(counted, [0], 'its count closes at once (the recorded battle starts after its count)');
  assert.equal(replayGame.preBattleS, 0);
  assert.deepEqual(rolled, [true], 'and it rolls out once, late (no cues)');
  assert.deepEqual(frames, [1, 1], 'its presentation draws the posed state (alpha 1)');
  // (replay-fixes-277, Kevin 11-25 "no one is actually moving") the solo presentation draws its render poses, which only a
  // capture advances: every posed frame captures the posed state after the poser wrote it, or the tanks stand still
  assert.deepEqual(order, ['pose', 'capture', 'pose', 'capture'], 'each posed frame advances the render poses from the posed state');
  replayPaused = true;
  replayRuntime.advance(0.05, 0.05, 100, false);
  assert.equal(advanced.length, 2, 'the menu pauses a replay');
  replayPaused = false;
  replayActive = false;
  replayRuntime.advance(1 / 60, 1 / 60, 150, false);
  assert.equal(advanced.length, 2);
  assert.equal(steps, 1, 'once the replay stops, the battle steps again');
}

// one Play reaches the clock (the viewer stills, round 3: a Play enabled under the entry's load screen was pressed there
// and never played): a real viewer behind the replay port is not posed while the entry covers the battle, so it offers
// no transport and refuses a Play; the first uncovered frame poses it, and one Play then moves its clock within
// PLAY_FRAMES frames
{
  const PLAY_FRAMES = 2;
  const hull = (id, team) => ({ id, specId: `${id}_spec`, team,
    state: { pos: { x: 0, y: 0, z: 0 }, yaw: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0, gunPitch: 0, speed: 0 },
    combat: { hp: 100, maxHp: 100, destroyed: false, fire: { burning: false } } });
  const recorded = { tanks: [hull('a', 'alpha')], shells: [], tick: 0 };
  const builder = createReplayTrackBuilder(recorded);
  for (let tick = 1; tick <= 600; tick++) { recorded.tick = tick; recorded.tanks[0].state.pos.x = tick / 60; builder.afterStep(recorded); }
  const index = { header: { roster: [{ id: 'a', specId: 'a_spec', team: 'alpha', bot: false }] }, end: { ticks: 600 }, events: [],
    track: builder.finish(), indexedSteps: 600, lastTick: 600, problem: null };
  const view = [hull('a', 'alpha')];
  const viewer = createReplayViewer(index, { hulls: view, watch: { rideId: () => true, drone: () => {}, focusId: null },
    visuals: { setPresent: () => {}, setCondition: () => {} }, feed: { kill: () => {} } });
  const runtime = createBattleFrameRuntime({
    game: { phase: 'battle', preBattleS: 0, result: null, player: { input: {}, combat: {} } },
    settings: { isOpen: () => false },
    killcam: { isActive: () => false },
    input: { camera: {}, poll: () => {}, dispose: () => {} },
    network: { isActive: () => false, pump: () => {} },
    countdown: { isWarmPending: () => false, advance: () => 0, show: () => {}, rollout: () => {} },
    presentation: { captureSoloPose: () => {}, update: () => {}, updateResult: () => {} },
    getRigMode: () => 'ARCADE',
    stepSimulation: () => {},
    emitPause: () => {},
    replay: { isActive: () => true, advance: (dt) => viewer.advance(dt) },
  });
  let nowMs = 0;
  const frame = (covered) => { nowMs += 1000 / 60; runtime.advance(1 / 60, 1 / 60, nowMs, covered); };
  for (let i = 0; i < 10; i++) frame(true);
  assert.equal(viewer.posing, false, 'the entry covers the battle: the replay is not posed');
  viewer.key('toggle');
  assert.equal(viewer.clock.playing, false, 'a Play under the cover is refused');
  frame(false);
  assert.equal(viewer.posing, true, 'the first uncovered frame poses it and offers the transport');
  assert.equal(viewer.clock.timeS, 0, 'paused at the start');
  viewer.key('toggle');
  let played = 0;
  while (played < PLAY_FRAMES && viewer.clock.timeS === 0) { frame(false); played += 1; }
  assert.ok(viewer.clock.timeS > 0, `one Play moves the clock within ${PLAY_FRAMES} frames`);
  assert.ok(view[0].state.pos.x > 0, 'and poses the hull from the track');
}

assert.throws(() => createBattleFrameRuntime({}), /requires every frame port/);
assert.throws(() => createBattleFrameRuntime({
  game, settings: {}, killcam: {}, input: {}, network: {}, countdown: {}, presentation: {},
  getRigMode() {}, stepSimulation() {}, emitPause() {}, simulationDt: 0,
}), /requires every frame port|simulationDt/);

const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
const mainFrameSource = await readFile(new URL('../app/mainFrameRuntime.ts', import.meta.url), 'utf8');
assert.doesNotMatch(mainSource, /let simAcc\s*=/,
  'main must not retain fixed-step debt');
assert.doesNotMatch(mainSource, /const pauseInfo\s*=\s*\{/,
  'main must not retain pause transition state');
assert.match(mainSource, /createMainFrameRuntime\(/,
  'the composition root delegates rendered frames through one owner');
assert.match(mainFrameSource, /battleFrame\.advance\(/,
  'the frame owner delegates gameplay advancement through one state machine');

console.log('battleFrameRuntime.selftest: pause, countdown, network, replay, fixed-step, and presentation pass');
