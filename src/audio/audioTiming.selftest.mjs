import assert from 'node:assert/strict';
import {
  WEAPON_REPORT_PROFILES,
  resolveWeaponReportProfile,
  safeAudioStart,
} from './audio.js';

assert.equal(safeAudioStart(0, -0.107), 0.001,
  'startup whizz clamps ahead of AudioContext time zero');
assert.equal(safeAudioStart(10, 10.18), 10.18,
  'normal scheduled lead-in keeps its authored time');
assert.equal(safeAudioStart(10, 9.8), 10.001,
  'late network/presentation event schedules just ahead of now');
assert.ok(Number.isFinite(safeAudioStart(0.05, -0.02)), 'automation time stays finite');

const bushmaster = resolveWeaponReportProfile('m242-bushmaster');
const rarden = resolveWeaponReportProfile('rarden-l21a1');
const twin = resolveWeaponReportProfile('twin-2a42');
const tow = resolveWeaponReportProfile('tow-launch');
assert.equal(bushmaster.kind, 'autocannon', 'Bushmaster uses the autocannon runtime');
assert.equal(rarden.kind, 'autocannon', 'RARDEN uses the autocannon runtime');
assert.notEqual(bushmaster.rate, rarden.rate, 'real weapon families have distinct reports');
assert.equal(twin.twin, true, 'Terminator report carries its paired-action layer');
assert.equal(tow.kind, 'launcher', 'guided missiles use a launcher runtime, not a cannon boom');
assert.ok(tow.hissGain > 0 && tow.durationS > 0.5, 'launcher report includes a rocket tail');
assert.equal(resolveWeaponReportProfile('not-a-profile').kind, 'cannon',
  'unknown/legacy guns preserve the normal cannon fallback');

const signatures = new Set(Object.values(WEAPON_REPORT_PROFILES).map((profile) =>
  [profile.kind, profile.rate, profile.gain, profile.mechanicalHz, profile.toneHz].join('/')));
assert.ok(signatures.size >= 14,
  `weapon report library is too uniform (${signatures.size} distinct signatures)`);

console.log('audioTiming.selftest: safe scheduling and differentiated weapon reports passed');
