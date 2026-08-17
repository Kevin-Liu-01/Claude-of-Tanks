import assert from 'node:assert/strict';
import { safeAudioStart } from './audio.js';

assert.equal(safeAudioStart(0, -0.107), 0.001,
  'startup whizz clamps ahead of AudioContext time zero');
assert.equal(safeAudioStart(10, 10.18), 10.18,
  'normal scheduled lead-in keeps its authored time');
assert.equal(safeAudioStart(10, 9.8), 10.001,
  'late network/presentation event schedules just ahead of now');
assert.ok(Number.isFinite(safeAudioStart(0.05, -0.02)), 'automation time stays finite');

console.log('audioTiming.selftest: safe Web Audio scheduling passed');
