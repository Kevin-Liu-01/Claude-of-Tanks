import assert from 'node:assert/strict';
import {
  AUDIO_DISTANCE_MODEL,
  AUDIO_PERSPECTIVE_MIX,
  WEAPON_REPORT_PROFILES,
  distanceLowpassHz,
  engineAudibleAtDistance,
  resolveWeaponReportProfile,
  safeAudioStart,
  worldDistanceGain,
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

const ranges = [12, 80, 250, 600, 900];
const gains = ranges.map(worldDistanceGain);
assert.equal(gains[0], 1, 'sources inside the reference distance remain full level');
for (let i = 1; i < gains.length; i++) {
  assert.ok(gains[i] < gains[i - 1], `distance gain falls from ${ranges[i - 1]} m to ${ranges[i]} m`);
}
assert.ok(gains.at(-1) > 0.003,
  `900 m battlefield report remains faintly audible (${gains.at(-1)})`);

const cutoffs = ranges.map(distanceLowpassHz);
for (let i = 1; i < cutoffs.length; i++) {
  assert.ok(cutoffs[i] < cutoffs[i - 1], `air absorption darkens ${ranges[i]} m sources`);
}
assert.ok(cutoffs.at(-1) >= 450 && cutoffs.at(-1) < 1000,
  `distant source keeps a low thunder band (${cutoffs.at(-1)} Hz)`);

assert.equal(engineAudibleAtDistance(AUDIO_DISTANCE_MODEL.engineHearInM), true,
  'a new engine can enter at the far hearing horizon');
assert.equal(engineAudibleAtDistance(AUDIO_DISTANCE_MODEL.engineHearInM + 1), false,
  'a new engine outside the horizon does not consume a voice');
assert.equal(engineAudibleAtDistance(AUDIO_DISTANCE_MODEL.engineHearOutM - 1, true), true,
  'active engine hysteresis prevents boundary chatter');
assert.equal(engineAudibleAtDistance(AUDIO_DISTANCE_MODEL.engineHearOutM + 1, true), false,
  'an active engine eventually leaves the mix');

assert.ok(AUDIO_PERSPECTIVE_MIX.sniper.engineGain >= AUDIO_PERSPECTIVE_MIX.arcade.engineGain,
  'scope keeps the occupied engine present');
assert.ok(AUDIO_PERSPECTIVE_MIX.sniper.engineCutoffHz < 2000,
  'scope uses an interior/headset engine spectrum');
assert.ok(AUDIO_PERSPECTIVE_MIX.sniper.cannonGain >= 0.9,
  'scope does not mute the occupied cannon');
assert.ok(AUDIO_PERSPECTIVE_MIX.sniper.cannonDistanceBiasM > 100,
  'scope filters exposed muzzle crack while retaining pressure');

console.log('audioTiming.selftest: scheduling, weapon reports, distance and perspective mixes passed');
