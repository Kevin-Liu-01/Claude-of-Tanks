import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { getSpec } from '../vehicles/specs.ts';
import { ensureTankBuilder } from '../vehicles/fleetFactory.ts';
import { createCombatState } from '../sim/damage.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { LocalTankPredictor } from './localTankPrediction.ts';
import { NetworkInputCadence } from './inputCadence.ts';
import { SnapshotBuffer, captureWorldSnapshot } from './snapshot.ts';
import { isSequenceNewer, nextSequence } from './protocol.ts';

await ensureTankBuilder('udes03');

// A deterministic two-way impaired link around the actual shared tank model.
// The zero-network reference consumes the same controls at 60 Hz. Comparing
// only against the delayed server position would penalize correct local lead.
function randomSource() {
  let state = 81723;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
}

function makeField(waves) {
  const normal = new Vector3(0, 1, 0);
  const height = (x, z) => waves ? 0.25 * Math.sin(z / 2) + 0.15 * Math.sin(x / 2) : 0;
  return { getHeightAt: height, getHeightAtFast: height,
    getGroundType: () => 'hard',
    getNormalAt: (x, z) => normal.set(waves ? -0.075 * Math.cos(x / 2) : 0,
      1, waves ? -0.125 * Math.cos(z / 2) : 0).normalize() };
}

function controls(timeS, wall) {
  return { throttle: timeS < 1 || timeS >= 8 ? 0 : 1,
    steer: wall || timeS < 3 || timeS >= 7 ? 0 : timeS < 5 ? 0.6 : -0.6,
    brake: timeS >= 8, aimLocked: true, aimYaw: 0, aimPitch: 0, fire: false };
}

function makeTank(spec) {
  return { id: 'viewer', spec, state: createTankState(spec, new Vector3(), 0),
    combat: createCombatState(spec),
    input: { throttle: 0, steer: 0, aimLocked: true, aimPoint: new Vector3(0, 0, 500) } };
}

function staticContact(enabled, entity, position, radius, push) {
  push.set(0, 0, 0);
  if (!enabled || position.z + radius <= 24) return false;
  push.z = 24 - radius - position.z;
  entity._predictionStaticContacts = (entity._predictionStaticContacts || 0) + 1;
  return true;
}

function linkQueue(random, { delayMs, jitterMs = 0, loss = 0 }) {
  const queue = [];
  return {
    send(value, atS) {
      if (random() < loss) return;
      const variation = (random() * 2 - 1) * jitterMs;
      queue.push({ value, atS: atS + Math.max(0, delayMs + variation) / 1000 });
      queue.sort((a, b) => a.atS - b.atS);
    },
    drain(timeS, receive) {
      while (queue[0]?.atS <= timeS + 1e-9) receive(queue.shift().value);
    },
  };
}

function sampleAuthority(server, tick, atS, ackInputSeq) {
  return captureWorldSnapshot({ tick, serverTimeMs: atS * 1000,
    entities: [server], viewerId: 'viewer', ackInputSeq });
}

function observe(metrics, entity, ideal, previous, dt) {
  const state = entity.state;
  const error = state.pos.distanceTo(ideal.state.pos);
  const dx = state.pos.x - previous.x;
  const dy = state.pos.y - previous.y;
  const dz = state.pos.z - previous.z;
  metrics.maxIdealErrorM = Math.max(metrics.maxIdealErrorM, error);
  metrics.errorIntegral += error * dt;
  metrics.maxPoseStepM = Math.max(metrics.maxPoseStepM, Math.hypot(dx, dy, dz));
  metrics.maxBackwardStepM = Math.max(metrics.maxBackwardStepM,
    -(dx * Math.sin(state.yaw) + dz * Math.cos(state.yaw)));
  previous.copy(state.pos);
}

function createFixture(scenario) {
  const spec = getSpec(scenario.specId || 'm1a2');
  const server = makeTank(spec);
  const ideal = makeTank(spec);
  const entity = makeTank(spec);
  const field = makeField(scenario.waves);
  const collide = (owner, position, radius, push) =>
    staticContact(scenario.wall, owner, position, radius, push);
  const prediction = new LocalTankPredictor({ entity, heightField: field, collide });
  const random = randomSource();
  const uploads = linkQueue(random, { delayMs: scenario.delayMs,
    jitterMs: scenario.jitterMs, loss: scenario.inputLoss });
  const downloads = linkQueue(random, { delayMs: scenario.delayMs,
    jitterMs: scenario.jitterMs, loss: scenario.snapshotLoss });
  const buffer = new SnapshotBuffer({ immediateEntityId: 'viewer' });
  buffer.push(sampleAuthority(server, 0, 0, null));
  prediction.reconcile(buffer.sample(0).immediateAuthority);
  return { server, ideal, entity, field, collide, prediction, uploads, downloads, buffer,
    cadence: new NetworkInputCadence(), timeS: 0, tick: 0, nextTickS: SIM_DT,
    inputSeq: 0x7ffffffe, ackInputSeq: null,
    serverCollide: (position, radius, push) => collide(server, position, radius, push),
    idealCollide: (position, radius, push) => collide(ideal, position, radius, push) };
}

function advanceServer(fixture, scenario, timeS) {
  const f = fixture;
  while (f.nextTickS <= timeS + 1e-9) {
    f.uploads.drain(f.nextTickS, (packet) => {
      if (f.ackInputSeq != null && !isSequenceNewer(packet.seq, f.ackInputSeq)) return;
      Object.assign(f.server.input, packet.input);
      f.ackInputSeq = packet.seq;
    });
    updateTank(f.server, f.field, SIM_DT, f.serverCollide);
    Object.assign(f.ideal.input, controls(f.nextTickS, scenario.wall));
    updateTank(f.ideal, f.field, SIM_DT, f.idealCollide);
    f.tick++;
    if (f.tick % 3 === 0) {
      f.downloads.send(sampleAuthority(f.server, f.tick, f.nextTickS, f.ackInputSeq), f.nextTickS);
    }
    f.nextTickS += SIM_DT;
  }
}

function advanceClient(fixture, input, timeS, dt) {
  const f = fixture;
  f.cadence.advance(dt);
  if (f.cadence.shouldSend(input)) {
    f.uploads.send({ input, seq: f.inputSeq }, timeS);
    f.prediction.recordInput(input, f.cadence.commit(input), f.inputSeq, dt);
    f.inputSeq = nextSequence(f.inputSeq);
  } else f.prediction.advancePrediction(input, dt);
  f.downloads.drain(timeS, (snapshot) => f.buffer.push(snapshot, timeS * 1000));
  return f.buffer.sample(timeS * 1000);
}

function run(scenario, legacy = false) {
  const f = createFixture(scenario);
  const previous = f.entity.state.pos.clone();
  const metrics = { maxIdealErrorM: 0, errorIntegral: 0, maxPoseStepM: 0, maxBackwardStepM: 0 };
  const frameTimes = scenario.frameTimes || [1 / scenario.refreshHz];
  for (let index = 0; f.timeS < 12 - 1e-9; index++) {
    const dt = Math.min(frameTimes[index % frameTimes.length], 12 - f.timeS);
    f.timeS += dt;
    advanceServer(f, scenario, f.timeS);
    const frame = advanceClient(f, controls(f.timeS, scenario.wall), f.timeS, dt);
    // Exact former bridge policy, retained only as the A/B reference: sampled
    // extrapolation bypassed replay and spent the display decay time twice.
    if (legacy) f.prediction.reconcile({ ...frame.immediateAuthority,
      sampledEntity: frame.entities[0] }, dt);
    else f.prediction.reconcile(frame.immediateAuthority, 0);
    observe(metrics, f.entity, f.ideal, previous, dt);
  }
  return { ...metrics, meanIdealErrorM: metrics.errorIntegral / 12,
    stats: f.prediction.getStats(), contacts: f.server._predictionStaticContacts || 0 };
}

const scenarios = [
  { name: '90ms-each-way-60Hz', refreshHz: 60, delayMs: 90 },
  { name: '90ms-each-way-144Hz', refreshHz: 144, delayMs: 90 },
  { name: 'jitter-loss-variable', delayMs: 90, jitterMs: 15, inputLoss: 0.03, snapshotLoss: 0.05,
    frameTimes: [1 / 120, 1 / 60, 1 / 90, 1 / 144, 1 / 165] },
  { name: 'wave-m1a2', refreshHz: 60, delayMs: 90, jitterMs: 15, waves: true },
  { name: 'wave-t90m', specId: 't90m', refreshHz: 144, delayMs: 90, jitterMs: 15, waves: true },
  { name: 'wave-udes03', specId: 'udes03', refreshHz: 60, delayMs: 90, jitterMs: 15, waves: true },
  { name: 'obstacle-stop', refreshHz: 60, delayMs: 90, jitterMs: 15,
    inputLoss: 0.03, snapshotLoss: 0.05, wall: true },
];

for (const scenario of scenarios) {
  const before = run(scenario, true);
  const after = run(scenario);
  console.log(JSON.stringify({ scenario: scenario.name,
    before: { meanIdealErrorM: before.meanIdealErrorM, maxIdealErrorM: before.maxIdealErrorM,
      backwardStepM: before.maxBackwardStepM },
    after: { meanIdealErrorM: after.meanIdealErrorM, maxIdealErrorM: after.maxIdealErrorM,
      backwardStepM: after.maxBackwardStepM, maxCorrectionM: after.stats.maxPositionErrorM,
      maxVerticalCorrectionStepM: after.stats.maxVerticalCorrectionStepM, contacts: after.contacts } }));
  assert.ok(after.meanIdealErrorM < before.meanIdealErrorM * 0.65,
    `${scenario.name}: actual raw-authority replay materially reduces delayed-control tracking error`);
  assert.equal(after.stats.hardSnaps, 0, `${scenario.name}: no teleport masking`);
  assert.equal(after.stats.droppedHistory, 0, `${scenario.name}: no discarded input history`);
  assert.ok(after.maxPoseStepM < 0.5, `${scenario.name}: existing live pose-step budget`);
  assert.ok(after.maxBackwardStepM < 0.3, `${scenario.name}: existing live backward-step budget`);
  assert.ok(after.stats.maxVerticalCorrectionStepM < 0.15,
    `${scenario.name}: existing live support-height release budget`);
  if (scenario.wall) assert.ok(after.contacts > 0, 'obstacle fixture must actually make contact');
}

console.log('localTankPredictionNetwork.selftest: real movement latency, loss, terrain and contact gates passed');
