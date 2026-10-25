#!/usr/bin/env node
// The multiplayer scaling bench (mp-scale-251; docs/MULTIPLAYER-V2.md §13.30): how a host's cost and every viewer's
// stream grow with the player count. Each room is the real match actor in Node on the map's dedicated collision, on a
// virtual clock: `humans` seated players (scripted drive, turn and fire; each acknowledges its snapshots in its INPUT
// as the shipped client does) and the room's bots filling each side to `teamSize`. Per room it reports:
// - the host per tick (ms): the authority's step and of it the spotting update, the event fan-out, and per viewer frame
//   the build (spotting-filtered snapshot, tiered rows, meta), the encode and the send, with the whole tick's p50/p95;
// - every viewer's downlink: snapshot bytes per second split keyframe / delta, event bytes, and the same frames encoded
//   whole (the "full" column: what the stream would cost without the delta codec and the tiers);
// - one viewer's client cost per snapshot (decode + assemble + interpolator push) and per 60 Hz frame (sample);
// - the tiers' entity-viewer populations (near / mid / far) and rows held.
// Rooms are `<teamSize>v<teamSize>:<humans>`; a team size over the room's 14 is the dev override (MAX_ENTITIES 64).
//   node --max-old-space-size=4096 tools/mp-scale-bench.mjs [--map=verdant] [--seconds=20] [--warm=4]
//     [--rooms=1v1:2,7v7:2,7v7:14,14v14:2,14v14:14,14v14:28,32v32:28,32v32:63] [--snapshot-hz=20] [--uplink=<bps>, 0: no budget]
//     [--json=out.json]
import { writeFileSync } from 'node:fs';
import '../src/vehicles/tankFactory.ts';
import { ALL_TANK_IDS, getSpec } from '../src/vehicles/specs.ts';
import { MESSAGE_TYPE, NO_TICK, PROTOCOL_VERSION, TICK_HZ } from '../src/mp/wire/constants.ts';
import { buildSnapshotPacket, decodeMessage, encodeMessage, peekMessageType } from '../src/mp/wire/codec.ts';
import { quantizeAimDistance, quantizeAngle } from '../src/mp/wire/quantize.ts';
import { encodeEventPayload } from '../src/mp/wire/eventPayload.ts';
import { SnapshotStream } from '../src/mp/match/snapshotStream.ts';
import { RemoteInterpolator } from '../src/mp/match/interpolation.ts';
import { createLoopbackLink } from '../server/match/link.ts';
import { createMatchActor } from '../server/match/matchActor.ts';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const mapId = arg('map', 'verdant');
const seconds = Number(arg('seconds', 20));
const warmSeconds = Number(arg('warm', 4));
const snapshotHz = Number(arg('snapshot-hz', 20));
const roomsArg = arg('rooms', '1v1:2,7v7:2,7v7:14,14v14:2,14v14:14,14v14:28,32v32:28,32v32:63');
const uplinkTargetBps = arg('uplink', '') === '' ? undefined : Number(arg('uplink', ''));
const jsonOut = arg('json', '');
const TICK_MS = 1000 / TICK_HZ;
const specs = ALL_TANK_IDS.filter((id) => ['mbt', 'medium', 'heavy', 'light'].includes(getSpec(id).role)).slice(0, 14);
// --views=snapshot,observe,observe,snapshot: each room once per view in that order (an in-process A/B of the frame view)
const views = arg('views', 'observe').split(',');
const rooms = roomsArg.split(',').map((text) => {
  const match = /^(\d+)v\1:(\d+)$/.exec(text.trim());
  if (!match) throw new Error(`room "${text}" is not <n>v<n>:<humans>`);
  const teamSize = Number(match[1]), humans = Number(match[2]);
  if (humans < 1 || humans > teamSize * 2) throw new Error(`room "${text}": humans must be 1..${teamSize * 2}`);
  return { label: text.trim(), teamSize, humans };
});

const flush = () => new Promise((resolve) => setImmediate(resolve));
// --keys: every event payload key viewer 0 reads, by count (the binary event codec's key table)
const keyCounts = process.argv.includes('--keys') ? new Map() : null;
function countKeys(value) {
  if (Array.isArray(value)) { for (const item of value) countKeys(item); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) { keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1); countKeys(item); }
}
const results = [];

for (const baseRoom of rooms) for (const frameView of views) {
  const room = { ...baseRoom, label: views.length > 1 ? `${baseRoom.label}/${frameView}` : baseRoom.label };
  let nowMs = 0;
  const seats = [], bots = [];
  const humansOn = { alpha: Math.ceil(room.humans / 2), bravo: Math.floor(room.humans / 2) };
  for (let index = 0; index < room.humans; index++) {
    const team = index % 2 === 0 ? 'alpha' : 'bravo';
    seats.push({ seat: index, playerId: `p${index}`, name: `Player ${index}`, team, specId: specs[index % specs.length] });
  }
  for (const team of ['alpha', 'bravo']) {
    for (let n = 0; n < room.teamSize - humansOn[team]; n++) {
      bots.push({ playerId: `bot-${team}-${n}`, name: `Bot ${team} ${n}`, team, specId: specs[(n + (team === 'bravo' ? 7 : 0)) % specs.length] });
    }
  }
  const profile = { clock: () => performance.now(), stepMs: 0, spottingMs: 0, eventsMs: 0, buildMs: 0, viewMs: 0, encodeMs: 0, sendMs: 0, ticks: 0, frames: 0 };
  const actor = createMatchActor({
    roomId: `scale-${room.teamSize}v${room.teamSize}-${room.humans}`, mapId, seed: 1337, countdownS: 0, seats, bots,
    world: 'dedicated', snapshotHz, now: () => nowMs, schedule: () => () => {}, profile,
    ...(uplinkTargetBps !== undefined ? { uplinkTargetBps } : {}), frameView,
  });
  // every seat: a loopback client that queues what it receives (decoded after the tick, outside the host's timings)
  const viewers = seats.map((seat, index) => {
    const link = createLoopbackLink(seat.playerId);
    const viewer = {
      index, link, queue: [], ackTick: NO_TICK, fireSeq: 0,
      snapshotBytes: 0, keyframeBytes: 0, keyframes: 0, deltaBytes: 0, deltas: 0, eventBytes: 0, fullBytes: 0, measured: false,
    };
    link.client.onMessage((bytes) => viewer.queue.push(bytes));
    const hello = { type: MESSAGE_TYPE.HELLO, protocolVersion: PROTOCOL_VERSION, capabilities: 0, token: '', clientBuild: 'scale' };
    const claims = { v: 1, roomId: actor.roomId, seat: seat.seat, playerId: seat.playerId, name: seat.name, team: seat.team, specId: seat.specId, iat: 0, exp: 1 };
    if (!actor.attach(link.server, hello, claims)) throw new Error(`seat ${index} refused`);
    return viewer;
  });
  // viewer 0 runs the client's own path: decode against its assembled baselines, the stream, the interpolator
  const stream = new SnapshotStream({ ticksPerSnapshot: TICK_HZ / snapshotHz });
  const interpolator = new RemoteInterpolator();
  const client = { decodeMs: 0, decoded: 0, sampleMs: 0, samples: 0, failures: 0 };
  // the host's uplink per snapshot tick (every viewer's snapshot together) and viewer 0's event bytes by kind
  const burst = [];
  let tickBytes = 0, tickSnapshotBytes = 0, tickKeyframes = 0, worst = { bytes: 0, snapshotBytes: 0, keyframes: 0, tick: 0 };
  const eventKinds = new Map();

  function control(viewer, tick) {
    const t = tick / TICK_HZ + viewer.index * 0.7;
    const phase = t % 20;
    const steer = phase < 6 ? 0 : phase < 9 ? 0.35 : phase < 14 ? 0 : -0.35;
    if (tick % 240 === viewer.index % 240) viewer.fireSeq = (viewer.fireSeq + 1) & 0xffff;
    return {
      throttle: 110, steer: Math.round(steer * 127), flags: 0,
      aimYaw: quantizeAngle(viewer.index % 2 === 0 ? 0 : Math.PI), aimPitch: 0, aimDistance: quantizeAimDistance(400),
      shellSlot: 0, fireSeq: viewer.fireSeq, actionSeq: 0, actionBits: 0,
    };
  }

  function drain(viewer, measuring) {
    for (const bytes of viewer.queue) {
      const type = peekMessageType(bytes);
      if (type === MESSAGE_TYPE.EVENT) {
        if (measuring) {
          viewer.eventBytes += bytes.byteLength;
          tickBytes += bytes.byteLength;
          if (viewer.index === 0) {
            const decoded = decodeMessage(bytes);
            if (decoded.ok) for (const event of decoded.message.events) {
              if (keyCounts) countKeys(event.payload);
              const entry = eventKinds.get(event.kind) ?? { count: 0, bytes: 0 };
              entry.count++; entry.bytes += encodeEventPayload(event.payload).byteLength + 3;
              eventKinds.set(event.kind, entry);
            }
          }
        }
        continue;
      }
      if (measuring) { tickBytes += bytes.byteLength; tickSnapshotBytes += bytes.byteLength; if (bytes[10] & 1) tickKeyframes++; }
      if (type !== MESSAGE_TYPE.SNAPSHOT) continue;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const tick = view.getUint32(2, true);
      if (viewer.index === 0) {
        const started = performance.now();
        const decoded = decodeMessage(bytes, { resolveBaseline: stream.resolveBaseline });
        if (!decoded.ok) { client.failures++; stream.noteMissingBaseline(); viewer.ackTick = stream.ackTick; continue; }
        const accepted = stream.accept(decoded.message);
        if (accepted.ok) interpolator.push(accepted.frame, accepted.frame.serverTimeMs, nowMs);
        const ended = performance.now();
        viewer.ackTick = stream.ackTick;
        if (measuring && accepted.ok) {
          client.decodeMs += ended - started; client.decoded++;
          // the same frame whole: what the stream would cost without deltas and tiers
          viewer.fullBytes += encodeMessage(buildSnapshotPacket(accepted.frame, null), null).byteLength;
        }
        if (measuring) {
          viewer.snapshotBytes += bytes.byteLength;
          if (decoded.message.keyframe) { viewer.keyframeBytes += bytes.byteLength; viewer.keyframes++; } else { viewer.deltaBytes += bytes.byteLength; viewer.deltas++; }
        }
      } else {
        viewer.ackTick = tick;
        if (measuring) {
          viewer.snapshotBytes += bytes.byteLength;
          // the keyframe flag: the byte after tick (u32) and server time (u32)
          if (bytes[10] & 1) { viewer.keyframeBytes += bytes.byteLength; viewer.keyframes++; } else { viewer.deltaBytes += bytes.byteLength; viewer.deltas++; }
        }
      }
    }
    viewer.queue.length = 0;
  }

  const warmTicks = Math.round(warmSeconds * TICK_HZ), measureTicks = Math.round(seconds * TICK_HZ);
  let measuring = false;
  const tickWall = [];
  for (let n = 0; n < warmTicks + measureTicks; n++) {
    if (n === warmTicks) {
      measuring = true;
      for (const key of ['stepMs', 'spottingMs', 'eventsMs', 'buildMs', 'viewMs', 'encodeMs', 'sendMs', 'ticks', 'frames']) profile[key] = 0;
      actor.loop.tickCost.reset();
    }
    const tick = actor.tick;
    for (const viewer of viewers) {
      viewer.link.client.send(encodeMessage({
        type: MESSAGE_TYPE.INPUT, clientTick: tick + 2, snapshotAckTick: viewer.ackTick, interpDelayMs: 100, controls: [control(viewer, tick + 2)],
      }));
    }
    await Promise.resolve();
    nowMs += TICK_MS;
    const started = performance.now();
    actor.advance(nowMs);
    if (measuring) tickWall.push(performance.now() - started);
    tickBytes = 0; tickSnapshotBytes = 0; tickKeyframes = 0;
    for (const viewer of viewers) drain(viewer, measuring);
    if (measuring && tickBytes) {
      burst.push(tickBytes);
      if (tickBytes > worst.bytes) worst = { bytes: tickBytes, snapshotBytes: tickSnapshotBytes, keyframes: tickKeyframes, tick };
    }
    if (measuring && stream.latest) {
      const sampled = performance.now();
      interpolator.sample(nowMs);
      client.sampleMs += performance.now() - sampled; client.samples++;
    }
    if (n % 60 === 0) await flush();
  }
  const stats = actor.stats();
  tickWall.sort((a, b) => a - b);
  const pct = (q) => tickWall[Math.min(tickWall.length - 1, Math.floor(q * tickWall.length))] ?? 0;
  const perTick = (ms) => ms / Math.max(1, profile.ticks);
  const kbps = (bytes) => (bytes * 8) / 1000 / seconds;
  const viewerMean = (key) => viewers.reduce((sum, v) => sum + v[key], 0) / viewers.length;
  const v0 = viewers[0];
  const row = {
    room: room.label, teamSize: room.teamSize, humans: room.humans, entities: room.teamSize * 2,
    alive: actor.authority.entities.filter((entity) => !entity.combat.destroyed).length,
    host: {
      tickP50: pct(0.5), tickP95: pct(0.95), stepMs: perTick(profile.stepMs), spottingMs: perTick(profile.spottingMs),
      eventsMs: perTick(profile.eventsMs), buildMs: perTick(profile.buildMs), encodeMs: perTick(profile.encodeMs), sendMs: perTick(profile.sendMs),
      perFrameUs: { build: (profile.buildMs / Math.max(1, profile.frames)) * 1000, view: (profile.viewMs / Math.max(1, profile.frames)) * 1000, encode: (profile.encodeMs / Math.max(1, profile.frames)) * 1000 },
      uplinkKbps: kbps(viewers.reduce((sum, v) => sum + v.snapshotBytes + v.eventBytes, 0)),
    },
    viewer: {
      snapshotKbps: kbps(viewerMean('snapshotBytes')), eventKbps: kbps(viewerMean('eventBytes')),
      keyframeShare: viewerMean('keyframeBytes') / Math.max(1, viewerMean('snapshotBytes')),
      meanKeyframeB: viewerMean('keyframeBytes') / Math.max(1, viewerMean('keyframes')), meanDeltaB: viewerMean('deltaBytes') / Math.max(1, viewerMean('deltas')),
      fullKbpsViewer0: kbps(v0.fullBytes), deltaKbpsViewer0: kbps(v0.snapshotBytes),
    },
    client: {
      applyUs: (client.decodeMs / Math.max(1, client.decoded)) * 1000, sampleUs: (client.sampleMs / Math.max(1, client.samples)) * 1000, failures: client.failures,
    },
    tiers: { population: stats.interest.population, published: stats.interest.published, held: stats.interest.held, deferred: stats.interest.deferred ?? 0 },
    worstTick: worst,
    burst: (() => { const sorted = [...burst].sort((a, b) => a - b); return { p50: sorted[sorted.length >> 1] ?? 0, p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0, max: sorted.at(-1) ?? 0 }; })(),
    eventKinds: Object.fromEntries([...eventKinds].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 8).map(([kind, entry]) => [kind, { count: entry.count, kbps: (entry.bytes * 8) / 1000 / seconds }])),
    dropped: stats.droppedSnapshots, events: stats.events,
  };
  results.push(row);
  const h = row.host;
  console.log(`${row.room.padEnd(18)} ${String(row.entities).padStart(3)} ent ${String(row.humans).padStart(2)} viewers | tick p50 ${h.tickP50.toFixed(2)} p95 ${h.tickP95.toFixed(2)} ms: step ${h.stepMs.toFixed(2)} (spot ${h.spottingMs.toFixed(2)}) events ${h.eventsMs.toFixed(2)} build ${h.buildMs.toFixed(2)} encode ${h.encodeMs.toFixed(2)} send ${h.sendMs.toFixed(2)} | frame build ${h.perFrameUs.build.toFixed(0)} us (view ${h.perFrameUs.view.toFixed(0)}) encode ${h.perFrameUs.encode.toFixed(0)} us | host up ${h.uplinkKbps.toFixed(0)} kbit/s, per viewer ${row.viewer.snapshotKbps.toFixed(1)} + events ${row.viewer.eventKbps.toFixed(1)} kbit/s (key ${row.viewer.meanKeyframeB.toFixed(0)} B, delta ${row.viewer.meanDeltaB.toFixed(0)} B; full ${row.viewer.fullKbpsViewer0.toFixed(1)}) | client apply ${row.client.applyUs.toFixed(0)} us, sample ${row.client.sampleUs.toFixed(0)} us | tiers ${row.tiers.population.join('/')} deferred ${row.tiers.deferred} | burst p50 ${(row.burst.p50 / 1024).toFixed(1)} p95 ${(row.burst.p95 / 1024).toFixed(1)} max ${(row.burst.max / 1024).toFixed(1)} KB`);
  console.log(`   worst tick ${row.worstTick.tick}: ${(row.worstTick.bytes / 1024).toFixed(1)} KB, snapshots ${(row.worstTick.snapshotBytes / 1024).toFixed(1)} KB with ${row.worstTick.keyframes} keyframes`);
  console.log(`   viewer 0 events: ${Object.entries(row.eventKinds).map(([kind, e]) => `${kind} ${e.count} (${e.kbps.toFixed(1)} kbit/s)`).join(', ')}`);
  actor.stop();
  await flush();
}
if (keyCounts) console.log(`keys: ${[...keyCounts].sort((a, b) => b[1] - a[1]).map(([key, count]) => `${key}:${count}`).join(' ')}`);
if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify({ mapId, seconds, snapshotHz, results }, null, 2)}\n`);
process.exit(0);
