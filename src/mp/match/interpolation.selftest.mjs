import assert from 'node:assert/strict';
import { ENTITY_FLAGS, PHASE, quantizeAngle, zeroEntityRow } from '../wire/index.ts';
import { RemoteInterpolator, hermite, monotoneHermite } from './interpolation.ts';

const INTERVAL = 1000 / 30;

function row(entityId, { x = 0, y = 0, z = 0, speed = 0, verticalSpeed = 0, yaw = 0, flags = 0, turretYaw = 0 } = {}) {
  return { ...zeroEntityRow(entityId), x, y, z, speed, verticalSpeed, yaw, turretYaw, flags, hp: 100, maxHp: 100 };
}

function frame(tick, entities, extra = {}) {
  return {
    tick, serverTimeMs: Math.round(tick * 1000 / 60), ackedInputTick: tick, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 2,
    meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: Math.round(tick * 1000 / 60), verdict: 0, verdictReason: '', destructibleRevision: 0 },
    destroyed: [], entities, shells: [], viewer: null, modeStateJson: null, ...extra,
  };
}

// ------------------------------------------------------------ hermite primitives
assert.equal(hermite(0, 1, 1, 1, 0.5, 1), 0.5, 'a straight line stays straight');
assert.ok(monotoneHermite(0, 40, 1, 0, 0.5, 1) <= 1 && monotoneHermite(0, 40, 1, 0, 0.5, 1) >= 0, 'monotone never leaves the interval');
assert.ok(hermite(0, 40, 1, 0, 0.5, 1) > 1, 'plain hermite overshoots with a stale tangent');
assert.ok(monotoneHermite(0, -40, 1, 40, 0.5, 1) >= 0, 'a tangent against the secant is dropped');
assert.equal(monotoneHermite(3, 5, 3, -5, 0.4, 1), 3, 'a flat segment stays flat whatever the tangents say');

// ------------------------------------------------------------ steady motion at 2 intervals of delay
{
  const interp = new RemoteInterpolator();
  const speedMps = 10;
  const arrival = (serverTimeMs) => serverTimeMs + 50;
  let tick = 0;
  const pushFrame = () => {
    const serverTimeMs = Math.round(tick * 1000 / 60);
    const rows = [row(1, { z: Math.round(speedMps * serverTimeMs), speed: speedMps * 100, yaw: quantizeAngle(0) })];
    assert.equal(interp.push(frame(tick, rows), serverTimeMs, arrival(serverTimeMs)), true);
    tick += 2;
  };
  for (let n = 0; n < 6; n++) pushFrame();
  assert.equal(interp.stats().arrivalJitterMs, 0, 'a perfectly regular arrival has no jitter');
  assert.ok(Math.abs(interp.stats().targetDelayMs - 2 * INTERVAL) < 1e-9, 'the target delay is two intervals');
  let serverNow = arrival(Math.round((tick - 2) * 1000 / 60)) - 50;
  let last = null;
  let maxStep = 0;
  let minStep = Infinity;
  let lastRender = -Infinity;
  for (let f = 0; f < 120; f++) {
    serverNow += 1000 / 60;
    while (Math.round(tick * 1000 / 60) <= serverNow) pushFrame();
    const sample = interp.sample(serverNow);
    assert.ok(sample.renderTimeMs >= lastRender, 'the render clock never runs backward');
    lastRender = sample.renderTimeMs;
    assert.ok(Math.abs(serverNow - sample.renderTimeMs - interp.delay) < 1e-6, 'renders at now − delay');
    const entity = sample.entities[0];
    assert.equal(entity.entityId, 1);
    assert.equal(sample.extrapolatedMs, 0, 'a filled buffer never extrapolates');
    assert.ok(Math.abs(entity.vz - speedMps) < 1e-6 && Math.abs(entity.vx) < 1e-6, 'velocity decodes from speed along yaw');
    if (last !== null) {
      const step = entity.z - last;
      maxStep = Math.max(maxStep, step);
      minStep = Math.min(minStep, step);
    }
    last = entity.z;
    assert.equal(entity.snapped, false);
  }
  assert.ok(maxStep < speedMps / 60 * 1.02 && minStep > speedMps / 60 * 0.98, `steps are v·dt (${minStep.toFixed(4)}..${maxStep.toFixed(4)})`);
  assert.equal(interp.stats().extrapolatedSamples, 0);
  assert.equal(interp.stats().snappedSamples, 0);
}

// ------------------------------------------------------------ jitter and loss grow the delay, bounded by 4 intervals
{
  const interp = new RemoteInterpolator();
  let random = 0x9e37;
  const next = () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random / 0x100000000; };
  for (let n = 0; n < 200; n++) {
    const serverTimeMs = n * INTERVAL;
    interp.push(frame(n * 2, [row(1)]), serverTimeMs, serverTimeMs + 60 + (next() * 2 - 1) * 25, n % 30 === 0);
  }
  const stats = interp.stats();
  assert.ok(stats.arrivalJitterMs > 5, `arrival jitter is measured: ${stats.arrivalJitterMs}`);
  assert.ok(stats.targetDelayMs > 2 * INTERVAL && stats.targetDelayMs <= 4 * INTERVAL, `target between 2 and 4 intervals: ${stats.targetDelayMs}`);
  // The delay slews up at half the elapsed time and never beyond the target while the stream keeps flowing.
  let serverNow = 200 * INTERVAL;
  let previous = interp.delay;
  let n = 200;
  for (let f = 0; f < 60; f++) {
    serverNow += 1000 / 60;
    while (n * INTERVAL + 60 <= serverNow) { interp.push(frame(n * 2, [row(1)]), n * INTERVAL, n * INTERVAL + 60); n++; }
    interp.sample(serverNow);
    // Grows toward the target, and only ever follows the target down (a quiet stream lowers it slowly).
    assert.ok(interp.delay <= Math.max(previous, interp.stats().targetDelayMs) + 1e-9 && interp.delay <= 4 * INTERVAL + 1e-9);
    previous = interp.delay;
  }
  assert.ok(interp.delay > 2 * INTERVAL, 'the delay grew');
  assert.equal(interp.stats().stalledSamples, 0, 'a flowing stream never stalls the render clock');
  // Extreme jitter is clamped to four intervals.
  for (; n < 320; n++) interp.push(frame(n * 2, [row(1)]), n * INTERVAL, n * INTERVAL + 60 + (n % 2 ? 200 : 0));
  assert.ok(Math.abs(interp.stats().targetDelayMs - 4 * INTERVAL) < 1e-9, 'the ceiling is four intervals');
}

// ------------------------------------------------------------ extrapolation capped at one interval
{
  const interp = new RemoteInterpolator();
  for (let n = 0; n < 4; n++) interp.push(frame(n * 2, [row(1, { z: n * 500, speed: 1500 })]), n * INTERVAL, n * INTERVAL + 40);
  const lastServerTime = 3 * INTERVAL;
  const positions = [];
  for (let f = 0; f < 14; f++) {
    const sample = interp.sample(lastServerTime + 2 * INTERVAL + f * (1000 / 60));
    positions.push([sample.entities[0].z, sample.extrapolatedMs]);
  }
  const extrapolated = positions.map(([, ms]) => ms);
  assert.ok(Math.max(...extrapolated) <= INTERVAL + 1e-9, 'never more than one interval of extrapolation');
  const final = positions.at(-1)[0];
  assert.ok(Math.abs(final - (1.5 + 15 * INTERVAL / 1000)) < 1e-6, 'the entity holds one interval past the newest frame');
  assert.ok(interp.stats().maxExtrapolatedMs <= INTERVAL + 1e-9);
  assert.ok(interp.stats().extrapolatedSamples > 0);
  assert.ok(interp.stats().stalledSamples > 0, 'a dry buffer stalls the render clock at the horizon');
  // When the stream resumes after a short outage, presentation continues from the held pose: no jump, and the
  // extra delay the stall left releases at a tenth of real time (the render clock runs at 1.1×).
  const resumeAt = lastServerTime + 2 * INTERVAL + 13 * (1000 / 60);
  const stalledDelay = interp.delay;
  assert.ok(stalledDelay > 2 * INTERVAL + 100, `the stall grew the delay (${stalledDelay.toFixed(1)} ms)`);
  let last = final;
  let biggest = 0;
  let m = 4;
  for (let f = 14; f < 120; f++) {
    const serverNow = lastServerTime + 2 * INTERVAL + f * (1000 / 60);
    while (m < 60 && (m <= 5 ? resumeAt : m * INTERVAL + 40) <= serverNow) { interp.push(frame(m * 2, [row(1, { z: m * 500, speed: 1500 })]), m * INTERVAL, serverNow); m++; }
    const sample = interp.sample(serverNow);
    assert.equal(sample.resynced, false, 'a short outage is not a resync');
    biggest = Math.max(biggest, sample.entities[0].z - last);
    last = sample.entities[0].z;
  }
  assert.ok(biggest <= 15 * (1000 / 60) / 1000 * 1.11 + 1e-6, `resumption steps stay at v·dt × 1.1 (${biggest.toFixed(4)})`);
  assert.ok(interp.delay < stalledDelay - 50, `the stall-grown delay releases toward the target (${interp.delay.toFixed(1)} ms)`);
  assert.equal(interp.stats().resyncs, 0);
  // A stall past the budget is an outage: the clock jumps once instead of playing back at 1.1× for seconds.
  const outage = new RemoteInterpolator();
  for (let n = 0; n < 4; n++) outage.push(frame(n * 2, [row(1, { z: n * 500, speed: 1500 })]), n * INTERVAL, n * INTERVAL + 40);
  for (let f = 0; f < 40; f++) outage.sample(3 * INTERVAL + 2 * INTERVAL + f * (1000 / 60));
  assert.equal(outage.stats().resyncs, 0, 'the clock holds while the outage is inside the budget');
  const resumed = 3 * INTERVAL + 2 * INTERVAL + 40 * (1000 / 60);
  for (let n = 4; n < 30; n++) outage.push(frame(n * 2, [row(1, { z: n * 500, speed: 1500 })]), n * INTERVAL, resumed);
  const jump = outage.sample(resumed + 1);
  assert.equal(jump.resynced, true, 'a stall beyond 400 ms resyncs once frames return');
  assert.equal(jump.entities[0].snapped, true);
  assert.ok(outage.delay <= 4 * INTERVAL + 1e-9, 'the delay returns to its target after the jump');
  // An outage longer than the buffer holds resyncs once: the timeline jumps and every entity is flagged snapped.
  const gap = new RemoteInterpolator({ capacity: 8 });
  for (let n = 0; n < 4; n++) gap.push(frame(n * 2, [row(1, { z: n * 500, speed: 1500 })]), n * INTERVAL, n * INTERVAL + 40);
  gap.sample(3 * INTERVAL + 2 * INTERVAL);
  for (let n = 40; n < 52; n++) gap.push(frame(n * 2, [row(1, { z: n * 500, speed: 1500 })]), n * INTERVAL, 52 * INTERVAL);
  const jumped = gap.sample(53 * INTERVAL);
  assert.equal(jumped.resynced, true);
  assert.equal(jumped.entities[0].snapped, true, 'a resynced sample presents as a teleport');
  assert.equal(gap.stats().resyncs, 1);
  assert.equal(gap.sample(53 * INTERVAL + 16).resynced, false, 'the next sample is ordinary again');
}

// ------------------------------------------------------------ shortest arc, teleport, visibility
{
  const interp = new RemoteInterpolator();
  const nearPi = quantizeAngle(Math.PI - 0.05);
  const pastPi = quantizeAngle(-Math.PI + 0.05);
  interp.push(frame(0, [row(1, { yaw: nearPi, turretYaw: nearPi }), row(2, { x: 1000 })]), 0, 40);
  interp.push(frame(2, [row(1, { yaw: pastPi, turretYaw: pastPi }), row(2, { x: 1500 })]), INTERVAL, INTERVAL + 40);
  interp.push(frame(4, [row(1, { yaw: pastPi }), row(2, { x: 80000 })]), 2 * INTERVAL, 2 * INTERVAL + 40);
  interp.push(frame(6, [row(1, { yaw: pastPi })]), 3 * INTERVAL, 3 * INTERVAL + 40);
  const mid = interp.sample(2 * INTERVAL + INTERVAL / 2);
  const hull = mid.entities.find((entity) => entity.entityId === 1);
  assert.ok(Math.abs(Math.abs(hull.yaw) - Math.PI) < 0.06, `yaw crosses ±π on the short arc: ${hull.yaw}`);
  assert.ok(Math.abs(Math.abs(hull.turretYaw) - Math.PI) < 0.06, 'turret yaw too');
  assert.equal(hull.snapped, false);
  const later = interp.sample(3 * INTERVAL + INTERVAL / 2);
  const jumped = later.entities.find((entity) => entity.entityId === 2);
  assert.equal(jumped.snapped, true, 'a 78 m jump is a teleport, not a blend');
  assert.equal(jumped.x, 80);
  const gone = interp.sample(4 * INTERVAL + INTERVAL / 2);
  assert.equal(gone.entities.some((entity) => entity.entityId === 2), false, 'a hidden entity leaves the sample');
  assert.equal(gone.entities.length, 1);
  interp.push(frame(8, [row(1, { yaw: pastPi }), row(2, { x: 80500 })]), 4 * INTERVAL, 4 * INTERVAL + 40);
  interp.push(frame(10, [row(1, { yaw: pastPi }), row(2, { x: 81000 })]), 5 * INTERVAL, 5 * INTERVAL + 40);
  const back = interp.sample(6 * INTERVAL + INTERVAL / 2);
  const returned = back.entities.find((entity) => entity.entityId === 2);
  assert.ok(returned && returned.snapped === false, 'a returning entity blends again once it has two frames');
}

// ------------------------------------------------------------ grounded vs airborne height, shells, meta, mode state
{
  const interp = new RemoteInterpolator();
  const shell = (id, z) => ({ id, shooterEntityId: 1, x: 0, y: 20000, z, vx: 0, vy: 0, vz: 9000, shellType: 0, flags: 0 });
  interp.push(frame(0, [row(1, { y: 1000, verticalSpeed: 900 }), row(2, { y: 1000, verticalSpeed: 900, flags: ENTITY_FLAGS.AIRBORNE })],
    { shells: [shell(7, 0)], modeStateJson: '{"a":1}' }), 0, 40);
  interp.push(frame(2, [row(1, { y: 1000, verticalSpeed: 900 }), row(2, { y: 1000, verticalSpeed: 900, flags: ENTITY_FLAGS.AIRBORNE })],
    { shells: [shell(7, 30000)], modeStateJson: '{"a":2}' }), INTERVAL, INTERVAL + 40);
  const sample = interp.sample(2 * INTERVAL + INTERVAL / 4);
  const grounded = sample.entities.find((entity) => entity.entityId === 1);
  const airborne = sample.entities.find((entity) => entity.entityId === 2);
  assert.equal(grounded.y, 1, 'a grounded chassis between two equal heights stays put (monotone)');
  assert.ok(airborne.y > 1, 'an airborne hull follows its ballistic tangent');
  assert.equal(sample.shells.length, 1);
  assert.ok(sample.shells[0].z > 0 && sample.shells[0].z < 30, 'shells blend between frames');
  assert.equal(sample.shells[0].shellType, 'AP');
  assert.equal(sample.modeStateJson, '{"a":2}', 'mode state is the newer frame\'s JSON');
  assert.ok(sample.meta.battleTimeMs > 0 && sample.meta.battleTimeMs < Math.round(2 * 1000 / 60), 'the battle clock interpolates');
  assert.equal(sample.meta.phase, PHASE.PLAYING);
  assert.equal(interp.push(frame(1, [row(1)]), 5, 50), false, 'an older tick is refused');
  interp.clear();
  assert.equal(interp.sample(0), null, 'cleared: nothing to sample');
  assert.equal(interp.bufferedFrames, 0);
}

console.log('mp interpolation: v·dt steps at two intervals of delay, jitter/loss adaptation bounded at four, one-interval extrapolation cap, shortest-arc angles, teleports snap, hidden entities leave, monotone ground / ballistic air, shells + meta pass');
