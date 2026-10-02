// The snapshot rate is the host's choice (P3b, 2026-09-29; docs/MULTIPLAYER-V2.md §13.9.2): the real actor at 20 Hz and
// at 30 Hz, each with a real MatchClient over the loopback pair (its server end adapted to the actor's ClientLink) and
// the network status model on it. The WELCOME names the rate; the client adopts it — its interpolator's delay bounds
// and extrapolation cap follow in intervals (two to four of 50 ms at 20 Hz, of 33 ms at 30), its loss estimate counts
// gaps in the named cadence (no false gaps at 20 Hz), its own prediction reconciles every snapshot, the status model
// reads the named rate as the expected one (health good at 20 of 20, not degraded at 20 of 30); an unsupported rate
// (one that does not divide the tick rate) is refused by the codec before the client sees it.
import assert from 'node:assert/strict';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { createDedicatedWorldCollision } from '../../../server/dedicatedWorldCollision.ts';
import { INPUT_MARGIN_UNKNOWN, MESSAGE_TYPE, NO_TICK, PHASE, PROTOCOL_VERSION, TEAM, TICK_HZ, VERDICT, buildSnapshotPacket, decodeMessage, encodeMessage, zeroEntityRow } from '../wire/index.ts';
import { createLoopbackPair } from '../transport/loopbackTransport.ts';
import { MatchClient } from './matchClient.ts';
import { NetworkStatusModel } from '../session/networkStatus.ts';
import { createPredictionWorld } from '../presentation/predictionWorld.ts';
import { getSpec } from '../../vehicles/specs.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';

// The actor reads finalized combat anatomy; production hosts load their roster's groups first (Node: all).
await ensureAuthorityFleet();

const TICK_MS = 1000 / TICK_HZ;
let nowMs = 30_000;
const now = () => nowMs;
const schedule = () => () => {};
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** A real MatchClient attached to the actor through the loopback pair: the pair's server end is the actor's ClientLink; prediction on the same world. */
function attachClient(actor, world, seat, playerId, team = 'alpha') {
  const pair = createLoopbackPair({ clock: now, connectDelayMs: 0 });
  pair.server.open();
  let messageListener = null;
  let closeListener = null;
  let attached = false;
  const link = {
    label: playerId,
    get bufferedAmount() { return pair.server.bufferedBytes; },
    get closed() { return pair.server.state === 'closed'; },
    send(bytes) { if (!pair.server.send(bytes)) throw new Error('loopback refused'); pair.pump(now()); },
    close(reason, detail = '') { pair.server.close('server', detail || String(reason)); },
    onMessage(listener) { messageListener = listener; },
    onClose(listener) { closeListener = listener; },
  };
  pair.server.onFrame((bytes) => {
    if (attached) { messageListener?.(bytes); return; }
    const decoded = decodeMessage(bytes);
    assert.ok(decoded.ok && decoded.message.type === MESSAGE_TYPE.HELLO, 'the first frame is the HELLO');
    assert.equal(decoded.message.protocolVersion, PROTOCOL_VERSION);
    attached = true;
    assert.ok(actor.attach(link, decoded.message, { v: 1, roomId: actor.roomId, seat, playerId, name: playerId, team, specId: 'm1a2', iat: 0, exp: 1 }));
  });
  pair.server.onState((change) => { if (change.state === 'closed') closeListener?.(); });
  const spec = getSpec('m1a2');
  let live = null;
  const predictionWorld = createPredictionWorld({ worldCollision: world, ownSpec: spec, ownState: () => live?.predictionState ?? null, others: () => [], mode: 'standard' });
  assert.ok(predictionWorld, 'a prediction world on the dedicated collision');
  const client = new MatchClient({
    transport: pair.client, token: 'issued-elsewhere', clock: now, prediction: { world: predictionWorld, specFor: (id) => getSpec(id) },
    controls: (tick) => ({ throttle: 0.4, steer: Math.sin(tick / 90) * 0.3, brake: false, fire: false, aimLocked: false, aimYaw: 0, aimPitch: 0, aimDistance: 300, shellSlot: 0, actionPresses: 0 }),
  });
  live = client;
  const status = new NetworkStatusModel({ clock: now });
  status.attachMatch(client);
  client.connect();
  return { client, pair, status };
}

async function run(snapshotHz) {
  const world = createDedicatedWorldCollision('verdant', { retain: true });
  const actor = createMatchActor({
    roomId: `rate-${snapshotHz}`, mapId: 'verdant', seed: 9, countdownS: 0, world, now, schedule, snapshotHz,
    seats: [{ seat: 0, playerId: 'p1', name: 'One', team: 'alpha', specId: 'm1a2' }, { seat: 1, playerId: 'p2', name: 'Two', team: 'alpha', specId: 'm1a2' }],
  });
  const one = attachClient(actor, world, 0, 'p1');
  const two = attachClient(actor, world, 1, 'p2');
  await flush();
  const seconds = 4;
  for (let n = 0; n < seconds * TICK_HZ; n++) {
    nowMs += TICK_MS;
    for (const seat of [one, two]) { seat.pair.pump(nowMs); seat.client.update(nowMs, 1 / TICK_HZ); seat.status.update(nowMs); }
    actor.advance(nowMs);
    for (const seat of [one, two]) seat.pair.pump(nowMs);
    await flush();
  }
  const welcome = one.client.welcome;
  assert.ok(welcome, 'welcomed');
  assert.equal(welcome.snapshotHz, snapshotHz, 'the WELCOME names the host\'s rate');
  assert.equal(one.client.snapshotRateHz, snapshotHz, 'the client adopted it');
  const interval = 1000 / snapshotHz;
  assert.ok(Math.abs(one.client.interpolator.snapshotIntervalMs - interval) < 1e-9, 'the interpolator interval follows');
  assert.ok(Math.abs(one.client.interpolator.minDelayMs - 2 * interval) < 1e-9 && Math.abs(one.client.interpolator.maxDelayMs - 4 * interval) < 1e-9, 'the delay bounds are two to four intervals of the named rate');
  assert.ok(Math.abs(one.client.interpolator.maxExtrapolationMs - interval) < 1e-9, 'the extrapolation cap is one interval');
  assert.equal(one.client.snapshots.ticksPerSnapshot, TICK_HZ / snapshotHz, 'the loss estimate counts gaps in the named cadence');
  const stats = one.client.stats();
  assert.ok(stats.interpolationDelayMs >= 2 * interval - 1e-6 && stats.interpolationDelayMs <= 4 * interval + 1e-6, `the delay sits inside its bounds (${stats.interpolationDelayMs.toFixed(1)} ms)`);
  assert.equal(stats.lossRate, 0, `no false gaps at ${snapshotHz} Hz (loss ${stats.lossRate})`);
  assert.equal(one.client.snapshots.stats().estimatedMissing, 0);
  const expected = seconds * snapshotHz;
  assert.ok(Math.abs(stats.snapshotsAccepted - expected) <= 3, `${stats.snapshotsAccepted} snapshots in ${seconds} s at ${snapshotHz} Hz`);
  assert.ok(stats.prediction && stats.prediction.reconciliations >= expected - 4, `the own row reconciles every snapshot (${stats.prediction?.reconciliations})`);
  assert.ok(stats.prediction.maxPositionErrorM < 0.1, `own misprediction stays small at ${snapshotHz} Hz (${stats.prediction.maxPositionErrorM.toFixed(4)} m)`);
  assert.equal(stats.decodeErrors, 0);
  assert.equal(stats.serverErrors, 0);
  const s = one.status.snapshot;
  assert.equal(s.expectedSnapshotHz, snapshotHz, `the status model expects the named rate (${s.expectedSnapshotHz})`);
  assert.ok(Math.abs(s.snapshotHz - snapshotHz) <= 2, `and measures it (${s.snapshotHz})`);
  assert.notEqual(s.healthReason, 'cadence', `no cadence degradation at ${snapshotHz} of ${snapshotHz} Hz (${s.health}/${s.healthReason})`);
  actor.stop();
  await flush();
  return { delayMs: stats.interpolationDelayMs, snapshots: stats.snapshotsAccepted, predictionErrorM: stats.prediction.maxPositionErrorM, remoteSteps: stats.snappedSamples };
}

// ------------------------------------------------------------ a carried own row (P3b): the authority's exact pose at the frame's tick
// The own row is on the near tier — captured every snapshot and omitted from a delta only when identical — so a row a
// delta leaves untouched (carried with its older capture tick) is the authority's pose AT THE FRAME'S TICK, and the
// client reconciles there every frame. Reconciling at the row's own tick refused every frame of a hull held still against
// a hull the client cannot see and let the prediction drive on through it (3.6 m of misprediction in the client soak
// against 0.3 on the tree before: found by the landing's core suite, 2026-09-29). A hand-fed authority makes it exact.
{
  const pair = createLoopbackPair({ clock: now, connectDelayMs: 0 });
  pair.server.open();
  const world = createDedicatedWorldCollision('verdant', { retain: true });
  const spec = getSpec('m1a2');
  let live = null;
  const predictionWorld = createPredictionWorld({ worldCollision: world, ownSpec: spec, ownState: () => live?.predictionState ?? null, others: () => [], mode: 'standard' });
  const client = new MatchClient({ transport: pair.client, token: 'issued-elsewhere', clock: now, prediction: { world: predictionWorld, specFor: () => spec }, controls: () => ({ throttle: 1, steer: 0, brake: false, fire: false, aimLocked: false, aimYaw: 0, aimPitch: 0, aimDistance: 300, shellSlot: 0, actionPresses: 0 }) });
  live = client;
  const frames = [];
  let welcomed = false;
  pair.server.onFrame((bytes) => {
    const decoded = decodeMessage(bytes);
    if (decoded.ok && decoded.message.type === MESSAGE_TYPE.HELLO && !welcomed) {
      welcomed = true;
      pair.server.send(encodeMessage({
        type: MESSAGE_TYPE.WELCOME, protocolVersion: PROTOCOL_VERSION, tickHz: TICK_HZ, snapshotHz: 20, seat: 0, entityId: 1, team: TEAM.ALPHA,
        serverTick: 300, serverTimeMs: Math.round(300 * TICK_MS), seed: 1, capabilities: 1, roomId: 'carried', mapId: 'verdant', mode: 'standard', rulesetJson: '{"mode":"standard"}',
        roster: [{ entityId: 1, seat: 0, team: TEAM.ALPHA, bot: false, connected: true, playerId: 'p1', name: 'One', specId: 'm1a2' }],
      }));
    }
  });
  client.connect();
  for (let n = 0; n < 6; n++) { nowMs += TICK_MS; pair.pump(nowMs); client.update(nowMs, 1 / TICK_HZ); pair.pump(nowMs); await flush(); }
  assert.ok(client.welcome, 'welcomed by the hand-fed authority');
  // one own row, captured at tick 303, then held: the hull is blocked by something the client cannot see
  const ownRow = { ...zeroEntityRow(1), tick: 303, x: 12_000, y: 8_000, z: -40_000, hp: 100, maxHp: 100, speed: 0 };
  const meta = { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: 5000, verdict: VERDICT.NONE, verdictReason: '', destructibleRevision: 0 };
  let baseline = null;
  const sent = [];
  for (let tick = 303; tick <= 303 + 3 * 20; tick += 3) {
    const frame = { tick, serverTimeMs: Math.round(tick * TICK_MS), ackedInputTick: NO_TICK, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: INPUT_MARGIN_UNKNOWN, meta, destroyed: [], entities: [ownRow], shells: [], viewer: null, modeStateJson: null };
    const packet = buildSnapshotPacket(frame, baseline);
    if (baseline) assert.equal(packet.entities.length, 0, 'the held row is no patch at all on a delta');
    pair.server.send(encodeMessage(packet, baseline));
    sent.push(frame);
    baseline = frame;
    for (let n = 0; n < 3; n++) { nowMs += TICK_MS; pair.pump(nowMs); frames.push(client.update(nowMs, 1 / TICK_HZ)); pair.pump(nowMs); await flush(); }
  }
  const stats = client.stats();
  assert.equal(stats.snapshotsAccepted, sent.length, `every frame assembled (${stats.snapshotsAccepted})`);
  assert.equal(stats.missingBaselines, 0);
  const latest = client.retainedMigration().latestFrame;
  assert.equal(latest.tick, 303 + 3 * 20);
  assert.equal(latest.entities[0].tick, 303, 'the own row rode every delta carried, with its capture tick');
  // the first frame initializes the predictor (no reconciliation to count); every carried frame after it reconciles — a refusal would leave 0
  assert.equal(stats.prediction.reconciliations, sent.length - 1, `the client reconciled at every frame's tick on the carried row (${stats.prediction.reconciliations} of ${sent.length - 1})`);
  const presented = frames.at(-1);
  assert.equal(presented.viewer.authorityTick, latest.tick, 'the presented authority tick is the newest frame\'s');
  assert.equal(presented.viewer.row.tick, 303, 'and its row the carried one');
  assert.ok(Math.hypot(presented.viewer.state.pos.x - 12, presented.viewer.state.pos.z + 40) < 3, `the prediction is held at the authority's pose (${presented.viewer.state.pos.x.toFixed(2)}, ${presented.viewer.state.pos.z.toFixed(2)}), not driven on through it`);
  client.dispose();
  world.release();
  console.log('snapshotRate.selftest: a carried own row reconciles at every frame\'s tick and holds the prediction at the authority\'s pose');
}

const at20 = await run(20);
const at30 = await run(30);
assert.ok(at20.delayMs > at30.delayMs, `the delay is longer at 20 Hz (${at20.delayMs.toFixed(1)} vs ${at30.delayMs.toFixed(1)} ms)`);
assert.throws(() => createMatchActor({ roomId: 'rate-bad', mapId: 'verdant', seed: 1, seats: [{ seat: 0, playerId: 'p1', name: 'One', team: 'alpha', specId: 'm1a2' }], world: 'terrain', now, schedule, autoStart: false, snapshotHz: 25 }), /divisor/);
console.log(`snapshotRate.selftest: 20 Hz — ${at20.snapshots} snapshots in 4 s, delay ${at20.delayMs.toFixed(1)} ms, misprediction ${at20.predictionErrorM.toFixed(4)} m; 30 Hz — ${at30.snapshots}, delay ${at30.delayMs.toFixed(1)} ms, misprediction ${at30.predictionErrorM.toFixed(4)} m; the client adopts the WELCOME's rate, no false gaps, the status model expects it, a carried own row reconciles at its frame's tick, 25 Hz refused`);
