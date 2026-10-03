import assert from 'node:assert/strict';
import {
  ATMOSPHERES, airAbsorptionCutoffHz, atmosphereForMap, bandWeight, dbToGain, distanceAttenuationDb,
  dopplerRatio, equalPowerFade, gainToDb, mulberry32, panFromRelative, propagationDelayS, rampBetween,
  smoothingAlpha, toListenerFrame,
} from './audioMath.ts';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

// Seeded variation is deterministic and in [0, 1).
const a = mulberry32(42), b = mulberry32(42);
for (let i = 0; i < 100; i++) {
  const x = a();
  assert.equal(x, b());
  assert.ok(x >= 0 && x < 1);
}

// Level conversion round-trips.
near(gainToDb(dbToGain(-12)), -12, 1e-9, 'dB round trip');
assert.equal(gainToDb(0), -180);

// Inverse-distance law: −6 dB per doubling past the reference (rolloff 1, no excess).
assert.equal(distanceAttenuationDb(5, 10), 0, 'inside the reference distance there is no loss');
near(distanceAttenuationDb(20, 10, 1, 0), -6.02, 0.01, 'one doubling');
near(distanceAttenuationDb(40, 10, 1, 0), -12.04, 0.01, 'two doublings');
assert.ok(distanceAttenuationDb(1000, 10, 1, 6) < distanceAttenuationDb(1000, 10, 1, 0), 'excess attenuation darkens the far field');

// Air absorption (ISO 9613-1 folded): ~6.5 kHz at 100 m, ~2.9 kHz at 300 m, ~1.1 kHz at 1 km.
near(airAbsorptionCutoffHz(100), 6460, 300, '100 m cutoff');
near(airAbsorptionCutoffHz(300), 2930, 200, '300 m cutoff');
near(airAbsorptionCutoffHz(1000), 1060, 120, '1 km cutoff');
assert.ok(airAbsorptionCutoffHz(0) >= 19000, 'no absorption at the listener');
assert.ok(airAbsorptionCutoffHz(200, ATMOSPHERES.earth, 2) < airAbsorptionCutoffHz(200), 'sensitive cues darken sooner');

// Mars carries sound slower and darker; the Moon carries none.
assert.equal(atmosphereForMap('mars').id, 'mars');
assert.equal(atmosphereForMap('moon').id, 'vacuum');
assert.equal(atmosphereForMap('verdant').id, 'earth');
assert.ok(airAbsorptionCutoffHz(50, ATMOSPHERES.mars) < airAbsorptionCutoffHz(50), 'Mars eats the top end');
assert.ok(ATMOSPHERES.vacuum.transmissionDb <= -50, 'vacuum transmits nothing audible');

// The flash precedes the boom.
assert.equal(propagationDelayS(10), 0, 'close events are instant');
near(propagationDelayS(343), 1, 1e-9, '343 m is one second on Earth');
near(propagationDelayS(240, ATMOSPHERES.mars), 1, 1e-9, '240 m is one second on Mars');
assert.equal(propagationDelayS(5000), 4, 'delay is capped');

// Doppler: approaching raises pitch, receding lowers it, both clamped.
assert.ok(dopplerRatio(20) > 1 && dopplerRatio(-20) < 1);
assert.equal(dopplerRatio(1e6), 1.4);
assert.equal(dopplerRatio(-1e6), 0.7);

// Crossfades keep unit power across bands.
for (const t of [0, 0.25, 0.5, 0.75, 1]) {
  const [x, y] = equalPowerFade(t);
  near(x * x + y * y, 1, 1e-9, `equal power at ${t}`);
}
const centres = [0.3, 0.5, 0.72, 0.95];
for (const rpm of [0.3, 0.41, 0.5, 0.63, 0.72, 0.9, 0.95]) {
  const power = centres.reduce((sum, _, i) => sum + bandWeight(rpm, centres, i) ** 2, 0);
  near(power, 1, 1e-9, `band power at rpm ${rpm}`);
}
assert.equal(bandWeight(0.1, centres, 0), 1, 'below the first band the idle loop owns the mix');
assert.equal(bandWeight(1.2, centres, 3), 1, 'above the last band the top loop owns it');

assert.equal(rampBetween(5, 10, 20), 0);
assert.equal(rampBetween(15, 10, 20), 0.5);
assert.equal(rampBetween(25, 10, 20), 1);
near(smoothingAlpha(0.1, 0.1), 1 - Math.exp(-1), 1e-12, 'frame-rate independent smoothing');

// Listener frame follows the camera: looking along +Z, three.js projects world
// −X to the RIGHT half of the screen (verified with Vector3.project), so a
// source there must pan right. The previous engine had this mirrored.
const frame = { x: 0, y: 0, z: 0, fx: 0, fz: 1 };
const rel = { right: 0, up: 0, ahead: 0, distance: 0 };
toListenerFrame(frame, 0, 0, 10, rel);
near(rel.ahead, 10, 1e-9, 'ahead');
near(rel.right, 0, 1e-9, 'centred');
toListenerFrame(frame, -10, 0, 0, rel);
assert.ok(panFromRelative(rel) > 0, 'world −X is screen-right when looking along +Z');
toListenerFrame(frame, 10, 0, 0, rel);
assert.ok(panFromRelative(rel) < 0, 'world +X is screen-left when looking along +Z');
// Looking along +X, screen-right is +Z.
toListenerFrame({ x: 0, y: 0, z: 0, fx: 1, fz: 0 }, 0, 0, 10, rel);
assert.ok(panFromRelative(rel) > 0, 'world +Z is screen-right when looking along +X');

console.log('audioMath.selftest: distance law, air absorption, atmospheres, delay, Doppler, crossfades and listener frame passed');
