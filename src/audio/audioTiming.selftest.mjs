import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  AUDIO_DISTANCE_MODEL,
  AUDIO_MIX_PROFILE,
  AUDIO_PERSPECTIVE_MIX,
  ENGINE_SOUND_PROFILES,
  WEAPON_REPORT_PROFILES,
  distanceLowpassHz,
  engineAudibleAtDistance,
  resolveReloadCuePlan,
  resolveEngineSoundProfile,
  resolveWeaponReportProfile,
  safeAudioStart,
  worldDistanceGain,
} from './audioPolicy.ts';

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

assert.ok(AUDIO_MIX_PROFILE.compressorRatio <= 4,
  'master dynamics preserve shot transients instead of crushing the mix');
assert.ok(AUDIO_MIX_PROFILE.compressorAttackS >= 0.008,
  'master compressor attack leaves the authored pressure front intact');
assert.ok(AUDIO_MIX_PROFILE.limiterKnee >= 0.7,
  'volley guard does not saturate ordinary single events');
assert.ok(AUDIO_MIX_PROFILE.combatPresenceGainDb < 0,
  'combat mix trims the former tin-can presence region');
assert.ok(AUDIO_MIX_PROFILE.combatBodyGainDb > 0,
  'combat mix preserves low-mid physical body');

assert.equal(resolveEngineSoundProfile('m1a2_legacy', { era: 'modern', class: 'mbt' }).kind, 'turbine',
  'Abrams uses its turbine profile');
assert.equal(resolveEngineSoundProfile('t80u', { era: 'modern', class: 'mbt' }).kind, 'turbine',
  'T-80 turbine is not misclassified as a generic diesel');
assert.equal(resolveEngineSoundProfile('t90m', { era: 'modern', class: 'mbt' }).kind, 'modernDiesel',
  'modern diesel MBTs retain a distinct powertrain bed');
assert.equal(resolveEngineSoundProfile('tiger1', { era: 'ww2', class: 'heavy' }).kind, 'legacyDiesel',
  'WWII heavy tanks use the uneven legacy diesel profile');
assert.equal(resolveEngineSoundProfile('recon_tank', { era: 'modern', class: 'light', weightTons: 18 }).kind, 'lightDiesel',
  'light tracked vehicles do not sound like 60-tonne MBTs');
for (const profile of Object.values(ENGINE_SOUND_PROFILES)) {
  assert.ok(profile.trackQ < 1, `${profile.kind} tread noise is broad rather than a resonant squeak`);
  assert.ok(profile.trackGain <= 0.15 && profile.clatterGain <= 0.2,
    `${profile.kind} running gear stays subordinate to the powertrain`);
  assert.ok(profile.trackHz < 700 && profile.clatterHz < 700,
    `${profile.kind} running gear avoids the former 1.45 kHz metal ring`);
}

const rapidReload = resolveReloadCuePlan(0.3, 'shell', 30);
assert.equal(rapidReload.profile, 'rapid', 'rapid autocannon cycle reuses the weapon action layer');
assert.equal(rapidReload.cues.length, 0, 'rapid cycles do not allocate overlapping reload voices');
assert.equal(rapidReload.ready, false, 'rapid cycles do not spam a ready latch');

const shellReload = resolveReloadCuePlan(7.5, 'shell', 125);
assert.deepEqual(shellReload.cues.map((cue) => cue.type),
  ['breechOpen', 'extract', 'shellLift', 'shellLift', 'ram', 'breechClose'],
  'large conventional reload follows open/extract/handle/ram/close order');
for (let i = 1; i < shellReload.cues.length; i++) {
  assert.ok(shellReload.cues[i].at > shellReload.cues[i - 1].at,
    'conventional reload cue thresholds are strictly ordered');
}

const magazineReload = resolveReloadCuePlan(18, 'magazine', 120);
assert.equal(magazineReload.profile, 'magazine', 'full magazine loads use the autoloader mechanism');
assert.equal(magazineReload.cues.filter((cue) => cue.type === 'index').length, 3,
  'full magazine load has three audible conveyor indexes');
assert.ok(magazineReload.cues.at(-1).at < 1, 'final breech cue precedes the authoritative ready edge');

const audioSource = await readFile(new URL('./audio.ts', import.meta.url), 'utf8');
const loadingStartBody = audioSource.slice(
  audioSource.indexOf('function loadingStart()'),
  audioSource.indexOf('function loadingStop()'),
);
assert.match(loadingStartBody, /if \(loadingRig \|\| !ctx\) return;/,
  'loading sound is idempotent and inert before AudioContext unlock');
assert.doesNotMatch(loadingStartBody, /setInterval|setTimeout/,
  'loading sound must not add timers or frame work to the transition');
assert.match(audioSource, /get loadingActive\(\) \{ return !!loadingRig; \}/,
  'audio QA surface exposes the loading-bed lifecycle');
assert.match(audioSource, /synthExplosion\(lx, ly, lz, 1\.8, false, true, 0\);/,
  'battle warm primes the heavy destruction fallback at zero gain');
assert.match(audioSource, /synthGunshot\(lx, ly, lz, 152, true, null, -1, 0\);/,
  'battle warm primes the exact synthesized player-gun graph at zero gain');
assert.match(audioSource, /bakedGunshot\(lx, ly, lz, 152, true, null, -1, 0\);/,
  'battle warm primes decoded player-gun layers when samples are already resident');
assert.match(audioSource, /bakedTankExplosion\(lx, ly, lz, 'ammorack', 0\);/,
  'decoded tank-destruction samples are primed silently before live combat');

console.log('audioTiming.selftest: scheduling, weapon reports, reload mechanisms, distance and perspective mixes passed');
