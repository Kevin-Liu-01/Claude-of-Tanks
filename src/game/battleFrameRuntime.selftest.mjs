import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createBattleFrameRuntime } from './battleFrameRuntime.ts';

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
    pump: (dtSeconds, nowMs) => networkPumps.push([dtSeconds, nowMs]),
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

console.log('battleFrameRuntime.selftest: pause, countdown, network, fixed-step, and presentation pass');
