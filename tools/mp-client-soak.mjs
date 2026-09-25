#!/usr/bin/env node
/**
 * Multiplayer v2 client soak: N headless MatchClients on impaired loopback
 * links against an in-process server, on one virtual clock, measuring the
 * charter's client gates (docs/MULTIPLAYER-V2.md §4, §9) and the bytes each
 * client receives per second.
 *
 *   node tools/mp-client-soak.mjs                       4 clients, 120 s, 100 ms RTT ± 30 ms, 3 % loss, the real MatchActor
 *   node tools/mp-client-soak.mjs --server=fixture      the scripted server fixture (src/mp/match/scriptedServer.test-support.ts)
 *   node tools/mp-client-soak.mjs --clients=8 --seconds=30 --rtt=160 --jitter=40 --loss=0.05 --map=alpine
 *   node tools/mp-client-soak.mjs --json                machine-readable report
 *
 * Gates (exit 1 when any fails): no hard snaps; remote and own presented pose
 * steps ≤ 0.5 m per frame; correction release ≤ 0.25 m per frame; input ack
 * lag p50 ≤ RTT + 2 ticks; every missing baseline recovered by a keyframe; the
 * client still live at the end; the presentation adapter saw frames. Bytes per
 * client per second are reported against the charter's 12–18 KB/s budget
 * (sized for 28 players; a small roster reads low).
 *
 * The actor mode runs `server/match/matchActor.ts` (the authority, its bots,
 * lag compensation and publisher) driven by `actor.advance(nowMs)` on the same
 * virtual clock; seats are admitted through signed seat tokens exactly as the
 * service does. Everything is deterministic for a seed.
 */
import { fileURLToPath } from 'node:url';
import { createLoopbackPair } from '../src/mp/transport/index.ts';
import { HeadlessMatchClientDriver, MatchClient } from '../src/mp/match/index.ts';
import { RecordingPresentation, bindMatchPresentation, createPredictionWorld } from '../src/mp/presentation/index.ts';
import { ScriptedMatchServer } from '../src/mp/match/scriptedServer.test-support.ts';
import { MESSAGE_TYPE, NO_ENTITY, TEAM, TICK_HZ, decodeMessage, encodeMessage } from '../src/mp/wire/index.ts';

const TICK_MS = 1000 / TICK_HZ;
const SEAT_SECRET = 'mp-client-soak-seat-secret-0123456789';

export const SOAK_SPEC = {
  enginePowerHp: 1500, weightTons: 60, topSpeedKmh: 65, reverseSpeedKmh: 30, hullTraverseDegS: 42,
  turretTraverseDegS: 40, gunPitchDegS: 25, gunElevationDeg: 20, gunDepressionDeg: 10, pivotStyle: 'neutral',
  terrainResistance: { hard: 0.8, medium: 1, soft: 1.8 },
  dims: { hullLengthM: 7.8, overallLengthM: 9.8, widthM: 3.7, heightM: 2.4 },
  gun: { caliberMm: 120, baseAccuracy: 0.3, aimTimeS: 2, bloom: { move: 0.1, hullRot: 0.1, turret: 0.08, afterShot: 3 } },
  armor: { boundingRadiusM: 4.8, turretPivot: [0, 1.5, 0], gunPivot: [0, 0.3, 0.2], gunBarrel: { lengthM: 5.3 } },
};
const wavy = (x, z) => 0.25 * Math.sin(z / 2) + 0.15 * Math.sin(x / 2);
const FIXTURE_FIELD = { getHeightAt: wavy, getHeightAtFast: wavy, getGroundType: () => 'hard' };
// An ordered socket never loses a frame outright: loss models the server dropping a stale
// snapshot under backpressure and a datagram transport losing inputs.
const LOSSY_TYPES = new Set([MESSAGE_TYPE.SNAPSHOT, MESSAGE_TYPE.INPUT]);

function mulberry(value) {
  let state = value >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let v = Math.imul(state ^ (state >>> 15), state | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 0x100000000;
  };
}

/** Each client drives a different pattern so the roster keeps crossing, turning and shooting. */
function controlsFor(index, aimAt) {
  const phase = index * 97;
  return (tick) => {
    const t = tick + phase;
    const aim = aimAt ? aimAt() : null;
    return {
      throttle: t > 150 ? (t % 1400 < 1100 ? 1 : 0.2) : 0,
      steer: Math.sin(t / 240) * 0.6,
      brake: false,
      fire: t % 240 === 0 && t > 200,
      aimLocked: !aim,
      aimYaw: aim ? aim.yaw : Math.sin(t / 400) * 1.2,
      aimPitch: 0,
      aimDistance: aim ? aim.distance : 300,
      shellSlot: 0,
      actionPresses: t % 900 === 0 && t > 300 ? 1 : 0,
    };
  };
}

function seatList(clientCount) {
  return Array.from({ length: clientCount }, (_, index) => ({
    seat: index, entityId: index + 1, specId: 'm1a2', playerId: `p${index + 1}`, name: `Player ${index + 1}`,
    team: index % 2 === 0 ? 'alpha' : 'bravo', token: `tok-${index + 1}`,
    x: (index % 4) * 40 - 60, z: Math.floor(index / 4) * 40, yaw: index,
  }));
}

async function createFixtureServer({ clock, clientCount, seats }) {
  const bots = Array.from({ length: Math.max(0, 8 - clientCount) }, (_, index) => ({
    entityId: clientCount + index + 1, specId: 'm1', team: index % 2 === 0 ? TEAM.ALPHA : TEAM.BRAVO,
    x: 80 + index * 20, z: -60 + index * 25, yaw: index,
    drive: (t) => ({ throttle: 0.8, steer: Math.sin((t + index * 50) / 120) * 0.5 }), fireEveryTicks: 240 + index * 30,
  }));
  const server = new ScriptedMatchServer({
    clock, heightField: FIXTURE_FIELD, specFor: () => SOAK_SPEC,
    seats: seats.map((seat) => ({ ...seat, team: seat.team === 'alpha' ? TEAM.ALPHA : TEAM.BRAVO, specId: 'm1' })),
    bots, countdownTicks: 120,
  });
  return {
    kind: 'fixture',
    attach: (transport) => server.attach(transport),
    advance: (t) => server.advance(t),
    stats: () => server.stats,
    predictionFor: () => ({ world: { heightField: FIXTURE_FIELD }, specFor: () => SOAK_SPEC }),
    entityPosition: (entityId) => server.entity(entityId)?.state.pos ?? null,
    dispose: () => server.dispose(),
  };
}

/** The real MatchActor on the virtual clock; seats admitted through signed tokens like the service does. */
async function createActorServer({ clock, clientCount, seats, mapId, seed }) {
  const [{ createMatchActor }, { signSeatToken, verifySeatToken }, { getSpec }] = await Promise.all([
    import('../server/match/matchActor.ts'),
    import('../server/match/seatToken.ts'),
    import('../src/vehicles/specs.ts'),
  ]);
  const wallClock = () => 1_700_000_000_000 + clock();
  const actorSeats = seats.map((seat) => ({ seat: seat.seat, playerId: seat.playerId, name: seat.name, team: seat.team, specId: seat.specId }));
  for (const seat of seats) {
    const iat = wallClock();
    seat.token = signSeatToken(SEAT_SECRET, {
      v: 1, roomId: 'soak', seat: seat.seat, playerId: seat.playerId, name: seat.name, team: seat.team, specId: seat.specId,
      iat, exp: iat + 24 * 3600 * 1000,
    });
  }
  const bots = Array.from({ length: Math.max(0, 8 - clientCount) }, (_, index) => ({
    playerId: `bot${index + 1}`, name: `Bot ${index + 1}`, team: index % 2 === 0 ? 'alpha' : 'bravo',
    specId: index % 2 ? 't90m' : 'm1a2', difficulty: 'normal',
  }));
  const actor = createMatchActor({
    roomId: 'soak', mapId, seed, seats: actorSeats, bots, world: 'terrain', countdownS: 2,
    now: clock, schedule: () => () => {}, autoStart: true, endedLingerTicks: 600,
  });
  const entityIdOf = new Map(actor.authority.entities.map((entity, index) => [index + 1, entity]));
  return {
    kind: 'actor',
    actor,
    attach(transport) {
      let listener = null;
      let closeListener = null;
      const link = {
        label: 'soak',
        get bufferedAmount() { return transport.bufferedBytes; },
        get closed() { return transport.state === 'closed'; },
        send(bytes) {
          if (!transport.send(bytes) && transport.state !== 'open') throw new Error('link closed');
        },
        close(reason, detail = '') {
          if (transport.state === 'closed') return;
          transport.send(encodeMessage({ type: MESSAGE_TYPE.CLOSE, reason, detail }));
          transport.close('server', detail);
        },
        onMessage(next) { listener = next; },
        onClose(next) { closeListener = next; },
      };
      let admitted = false;
      transport.onFrame((bytes) => {
        if (admitted) { listener?.(bytes); return; }
        admitted = true;
        const decoded = decodeMessage(bytes, { maxBytes: 4096 });
        if (!decoded.ok || decoded.message.type !== MESSAGE_TYPE.HELLO) { link.close(10, 'hello first'); return; }
        const verified = verifySeatToken(SEAT_SECRET, decoded.message.token, wallClock());
        if (!verified.ok) { link.close(2, verified.reason); return; }
        actor.attach(link, decoded.message, verified.claims);
      });
      transport.onState((change) => {
        if (change.state === 'closed') closeListener?.();
        if (change.state === 'reconnecting' || (change.state === 'open' && change.resumed)) admitted = false;
      });
      if (transport.state === 'idle') transport.open();
    },
    advance: (t) => actor.advance(t),
    stats: () => {
      const stats = actor.stats();
      return {
        ticks: stats.tick, phase: stats.phase, clients: stats.clients, snapshots: stats.snapshots, keyframes: stats.keyframes,
        droppedSnapshots: stats.droppedSnapshots, events: stats.events, rejectedInputs: stats.rejectedInputs,
        tickP50Ms: Math.round(stats.tickMs.p50 * 100) / 100, tickP95Ms: Math.round(stats.tickMs.p95 * 100) / 100,
        lagComp: stats.lagComp, verdict: stats.verdict, bytesOut: stats.bytesOut,
      };
    },
    /** The authority's height field, the playable bounds and the disclosed hulls (what the presentation collides with). */
    predictionFor: (client, presentation, seat) => {
      const ownSpec = getSpec(seat.specId);
      const specOf = new Map();
      const others = function* () {
        for (const pose of presentation.poses.values()) {
          if (pose.entityId === client.ownEntityId) continue;
          let spec = specOf.get(pose.entityId);
          if (!spec) {
            const entry = client.roster.find((row) => row.entityId === pose.entityId);
            if (!entry) continue;
            spec = getSpec(entry.specId);
            specOf.set(pose.entityId, spec);
          }
          yield { spec, state: { pos: pose, yaw: pose.yaw }, collidable: true };
        }
      };
      const world = createPredictionWorld({
        worldCollision: { heightField: actor.authority.heightField, getObstacles: () => [] },
        ownSpec, ownState: () => client.predictionState, others,
      });
      return { world, specFor: (specId) => getSpec(specId) };
    },
    entityPosition: (entityId) => entityIdOf.get(entityId)?.state.pos ?? null,
    dispose: () => actor.stop(),
  };
}

export async function runClientSoak({
  clients: clientCount = 4,
  seconds = 120,
  rttMs = 100,
  jitterMs = 30,
  loss = 0.03,
  server: serverKind = 'actor',
  mapId = 'verdant',
  seed = 0x50ac,
  onProgress = null,
} = {}) {
  let nowMs = 100_000;
  const clock = () => nowMs;
  const seats = seatList(clientCount);
  const world = serverKind === 'fixture'
    ? await createFixtureServer({ clock, clientCount, seats })
    : await createActorServer({ clock, clientCount, seats, mapId, seed });
  const link = { latencyMs: rttMs / 2, jitterMs: jitterMs / 2, loss, lossFilter: (frame) => LOSSY_TYPES.has(frame[1]) };
  const pairs = [];
  const pump = (t) => { for (const pair of pairs) pair.pump(t); world.advance(t); for (const pair of pairs) pair.pump(t); };
  const clients = seats.map((seat, index) => {
    const pair = createLoopbackPair({ clock, clientToServer: link, serverToClient: link, random: mulberry(seed + index * 7919) });
    pairs.push(pair);
    world.attach(pair.server);
    const presentation = new RecordingPresentation(64);
    let client = null;
    // Aim at the nearest disclosed enemy so the authority's bots have something to answer.
    const aimAt = () => {
      const own = client?.localTank;
      const frame = presentation.frames.at(-1);
      if (!own || !frame) return null;
      let best = null;
      for (const entry of client.roster) {
        if (entry.entityId === client.ownEntityId || entry.team === client.welcome?.team) continue;
        const position = world.entityPosition(entry.entityId);
        if (!position) continue;
        const dx = position.x - own.pos.x, dz = position.z - own.pos.z;
        const distance = Math.hypot(dx, dz);
        if (!best || distance < best.distance) best = { distance, yaw: Math.atan2(dx, dz) - own.yaw };
      }
      return best;
    };
    client = new MatchClient({
      transport: pair.client, token: seat.token, clock, controls: controlsFor(index, aimAt), clientBuild: 'soak',
    });
    client.enablePrediction(world.predictionFor(client, presentation, seat));
    bindMatchPresentation(client, presentation);
    const driver = new HeadlessMatchClientDriver({ client, advanceClock: () => nowMs, pump, warmupFrames: 180 });
    client.connect();
    return { seat, client, driver, presentation, pair };
  });

  const startedAt = performance.now();
  const frames = Math.round(seconds * 60);
  for (let frame = 0; frame < frames; frame++) {
    nowMs += 1000 / 60;
    for (const entry of clients) entry.driver.step(nowMs);
    if (onProgress && frame % 600 === 599) onProgress(frame / 60);
  }
  const wallMs = performance.now() - startedAt;

  const rows = clients.map((entry) => {
    const gates = entry.driver.gates();
    const stats = entry.client.stats();
    const rttTicks = Math.ceil((gates.rttMs ?? 0) / TICK_MS);
    const failures = [];
    if (gates.hardSnaps > 0) failures.push(`hard snaps ${gates.hardSnaps}`);
    if (gates.remoteStepsOver > 0) failures.push(`remote steps over 0.5 m: ${gates.remoteStepsOver} (max ${gates.maxRemoteStepM.toFixed(3)})`);
    if (gates.ownStepsOver > 0) failures.push(`own steps over 0.5 m: ${gates.ownStepsOver} (max ${gates.maxOwnStepM.toFixed(3)})`);
    if (gates.maxCorrectionStepM > 0.25) failures.push(`correction release ${gates.maxCorrectionStepM.toFixed(3)} m`);
    if (gates.intrinsicAckLagP50 > rttTicks + 2) failures.push(`ack lag p50 ${gates.intrinsicAckLagP50} (raw ${gates.ackLagP50}) > RTT ${rttTicks} + 2 ticks`);
    if (gates.missingBaselines > gates.keyframeRecoveries) failures.push(`missing baselines ${gates.missingBaselines} > recoveries ${gates.keyframeRecoveries}`);
    if (stats.phase !== 'live') failures.push(`phase ${stats.phase}`);
    if (entry.presentation.frames.length === 0) failures.push('the presentation adapter saw no frames');
    if (entry.client.ownEntityId === NO_ENTITY) failures.push('not seated');
    return {
      player: entry.seat.playerId,
      phase: stats.phase,
      rttMs: gates.rttMs === null ? null : Math.round(gates.rttMs * 10) / 10,
      jitterMs: Math.round(stats.rttJitterMs * 10) / 10,
      lossRate: Math.round(stats.lossRate * 1000) / 1000,
      delayMs: Math.round(stats.interpolationDelayMs * 10) / 10,
      bytesInPerS: Math.round(gates.bytesIn / seconds),
      bytesOutPerS: Math.round(gates.bytesOut / seconds),
      snapshots: stats.snapshotsAccepted,
      keyframes: gates.keyframes,
      missingBaselines: gates.missingBaselines,
      keyframeRecoveries: gates.keyframeRecoveries,
      hardSnaps: gates.hardSnaps,
      maxRemoteStepM: Math.round(gates.maxRemoteStepM * 1000) / 1000,
      maxOwnStepM: Math.round(gates.maxOwnStepM * 1000) / 1000,
      maxCorrectionStepM: Math.round(gates.maxCorrectionStepM * 1000) / 1000,
      maxMispredictionM: Math.round((stats.prediction?.maxPositionErrorM ?? 0) * 1000) / 1000,
      reconciliations: stats.prediction?.reconciliations ?? 0,
      ackLagP50: gates.intrinsicAckLagP50,
      ackLagP95: gates.intrinsicAckLagP95,
      rawAckLagP50: gates.ackLagP50,
      rawAckLagP95: gates.ackLagP95,
      rttTicks,
      leadTicks: stats.inputLeadTicks,
      events: gates.eventsDelivered,
      ownShots: gates.ownShotsDelivered,
      predictedShots: gates.predictedShots,
      extrapolatedSamples: gates.extrapolatedSamples,
      stalls: stats.stalls,
      presentationFrames: entry.presentation.frames.length,
      presentationEvents: entry.presentation.events.length,
      failures,
    };
  });
  const report = {
    server: serverKind, mapId: serverKind === 'actor' ? mapId : 'fixture', clients: clientCount, seconds, rttMs, jitterMs, loss, seed,
    wallMs: Math.round(wallMs), serverStats: world.stats(), rows, pass: rows.every((row) => row.failures.length === 0),
  };
  for (const entry of clients) entry.client.dispose();
  world.dispose();
  return report;
}

export function formatReport(report) {
  const lines = [];
  lines.push(`mp client soak: ${report.clients} clients × ${report.seconds} s at ${report.rttMs} ms RTT ± ${report.jitterMs} ms, ${(report.loss * 100).toFixed(1)} % loss, server=${report.server}${report.server === 'actor' ? ` map=${report.mapId}` : ''} (${report.wallMs} ms wall)`);
  for (const row of report.rows) {
    lines.push(`  ${row.player}: phase ${row.phase}, rtt ${row.rttMs} ms (jitter ${row.jitterMs}), loss ${row.lossRate}, delay ${row.delayMs} ms, ` +
      `down ${(row.bytesInPerS / 1024).toFixed(1)} KB/s, up ${(row.bytesOutPerS / 1024).toFixed(2)} KB/s, snapshots ${row.snapshots} (keyframes ${row.keyframes}, ` +
      `missing baselines ${row.missingBaselines}/${row.keyframeRecoveries} recovered), hard snaps ${row.hardSnaps}, steps remote ${row.maxRemoteStepM} own ${row.maxOwnStepM}, ` +
      `release ${row.maxCorrectionStepM} m, misprediction ${row.maxMispredictionM} m over ${row.reconciliations} reconciliations, ack lag p50 ${row.ackLagP50} p95 ${row.ackLagP95} ticks (raw ${row.rawAckLagP50}/${row.rawAckLagP95} with the lead of ${row.leadTicks}; RTT ${row.rttTicks} ticks), ` +
      `events ${row.events}, own shots ${row.ownShots}/${row.predictedShots} predicted, extrapolated ${row.extrapolatedSamples}, stalls ${row.stalls}, presentation ${row.presentationFrames} frames / ${row.presentationEvents} events` +
      (row.failures.length ? `\n    FAIL: ${row.failures.join('; ')}` : ''));
  }
  lines.push(`  server: ${JSON.stringify(report.serverStats)}`);
  lines.push(report.pass ? 'mp client soak: PASS' : 'mp client soak: FAIL');
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = new Map(process.argv.slice(2).map((arg) => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    return [key, value];
  }));
  const number = (key, fallback) => (args.has(key) ? Number(args.get(key)) : fallback);
  const json = args.has('json');
  const report = await runClientSoak({
    clients: number('clients', 4), seconds: number('seconds', 120), rttMs: number('rtt', 100), jitterMs: number('jitter', 30),
    loss: number('loss', 0.03), server: args.get('server') ?? 'actor', mapId: args.get('map') ?? 'verdant', seed: number('seed', 0x50ac),
    onProgress: json ? null : (elapsed) => process.stderr.write(`  ${elapsed.toFixed(0)} s\r`),
  });
  console.log(json ? JSON.stringify(report, null, 2) : formatReport(report));
  process.exitCode = report.pass ? 0 : 1;
}
