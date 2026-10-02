import assert from 'node:assert/strict';
import { ENGINE_FAMILIES } from './vehicleAudioProfiles.ts';
import { createVehicleAudioEvents, createVehicleAudioState, stepVehicleAudio } from './vehicleAudioModel.ts';

function input(overrides = {}) {
  return {
    dtS: 1 / 60, speedMps: 0, topSpeedMps: 18, reverseTopMps: 6, throttle: 0, brake: false, yawRate: 0,
    grounded: true, verticalSpeedMps: 0, landingImpactMps: 0, gripLost: false, engine: 'ok', immobilized: false,
    ...overrides,
  };
}

function run(family, frames, make) {
  const profile = ENGINE_FAMILIES[family];
  const state = createVehicleAudioState(profile);
  const events = createVehicleAudioEvents();
  const seen = [];
  for (let i = 0; i < frames; i++) {
    stepVehicleAudio(state, profile, make(i, state), events);
    for (let e = 0; e < events.count; e++) seen.push({ frame: i, type: events.items[e].type, strength: events.items[e].strength });
  }
  return { state, seen, profile };
}

// Idle: RPM settles at the family idle, load low, no events.
{
  const { state, seen, profile } = run('diesel_v12_soviet', 120, () => input());
  assert.ok(Math.abs(state.rpm - profile.idleRpm) < 0.02, `idle rpm ${state.rpm}`);
  assert.ok(state.load < 0.2);
  assert.equal(seen.length, 0);
}

// Accelerating a manual diesel: gear shifts up in order, RPM saws, load high.
{
  let speed = 0;
  const { state, seen } = run('diesel_v12_soviet', 900, () => { speed = Math.min(18, speed + 0.03); return input({ speedMps: speed, throttle: 1 }); });
  const ups = seen.filter((e) => e.type === 'shiftUp');
  assert.ok(ups.length >= 4, `manual gearbox shifted ${ups.length} times`);
  assert.ok(ups.every((e) => e.strength > 0.8), 'manual shifts clunk');
  assert.ok(state.gear >= 5, `top gear ${state.gear}`);
  assert.ok(state.load > 0.6, 'driving hard is high load');
  assert.ok(state.trackMps > 17, 'track speed follows the hull');
}

// Gas turbine: no gears, slow spool, high RPM on throttle even at a standstill.
{
  const { state, seen, profile } = run('turbine_agt', 30, () => input({ throttle: 1 }));
  assert.equal(seen.filter((e) => e.type === 'shiftUp' || e.type === 'shiftDown').length, 0, 'turbines never shift audibly');
  assert.ok(state.rpm < 0.7, 'spool lag: half a second of throttle has not reached full N2');
  const later = run('turbine_agt', 300, () => input({ throttle: 1 }));
  assert.ok(later.state.rpm > 0.9, `full spool ${later.state.rpm}`);
  assert.equal(profile.gears, 0);
}

// Braking hard at speed: one squeal event, brake and skid build.
{
  let speed = 15;
  const { state, seen } = run('diesel_v12_modern', 90, (i) => {
    speed = Math.max(0, speed - (i < 60 ? 0.12 : 0));
    return input({ speedMps: speed, brake: i < 60, throttle: 0 });
  });
  assert.equal(seen.filter((e) => e.type === 'brakeSqueal').length, 1, 'one squeal per stop');
  assert.ok(state.brake >= 0, 'brake value bounded');
}

// Pivot turn at a standstill scrubs the tracks.
{
  const { state } = run('diesel_v12_modern', 60, () => input({ yawRate: 0.8, throttle: 0.6 }));
  assert.ok(state.scrub > 0.5, `pivot scrub ${state.scrub}`);
  assert.ok(state.trackMps > 1, 'both tracks move in a pivot');
}

// Landing after airtime and a sharp bump.
{
  const { seen } = run('diesel_ifv', 40, (i) => i < 20
    ? input({ speedMps: 10, grounded: false, verticalSpeedMps: -6 })
    : input({ speedMps: 10, grounded: true, verticalSpeedMps: 0, landingImpactMps: 6 }));
  const land = seen.find((e) => e.type === 'land');
  assert.ok(land && land.strength > 0.3, 'a hard landing is reported');
}
{
  const { seen } = run('diesel_ifv', 10, (i) => input({ speedMps: 8, verticalSpeedMps: i === 5 ? 2.5 : 0 }));
  assert.ok(seen.some((e) => e.type === 'bump'), 'a jolt at speed is a bump');
}

// A red engine stalls and its repair restarts it; a yellow engine runs rough.
{
  const { seen, state } = run('diesel_v12_soviet', 200, (i) => input({ engine: i < 60 ? 'ok' : i < 140 ? 'red' : 'yellow' }));
  assert.deepEqual(seen.filter((e) => e.type === 'stall' || e.type === 'restart').map((e) => e.type), ['stall', 'restart']);
  assert.ok(state.rough > 0.3, 'damaged engine roughness');
}

// An immobilised hull's tracks do not turn.
{
  const { state } = run('diesel_v12_modern', 30, () => input({ speedMps: 5, immobilized: true }));
  assert.equal(state.trackMps, 0);
}

console.log('vehicleAudioModel.selftest: idle, manual gearbox, turbine spool, braking, pivot scrub, landings, stalls and immobilisation passed');
