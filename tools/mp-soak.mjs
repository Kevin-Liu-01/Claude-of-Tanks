#!/usr/bin/env node
/**
 * Multiplayer v2 headless soak: N Node clients speaking the real binary wire to
 * the match service through injected latency, jitter and loss on both directions.
 * The server runs as a child `node server/match/main.ts` by default (its own event
 * loop, rooms created through the bearer-guarded admin API, stats read over HTTP);
 * --server=inprocess hosts it in this process (the short receipt: quick, seeded).
 *
 *   npm run test:net:v2:soak                      28 clients, 14v14, 5 minutes, heaviest map, tick-cost child
 *   node tools/mp-soak.mjs --short                4 clients, 20 s, deterministic seed (the core receipt)
 *   node tools/mp-soak.mjs --short --plant-stall  the receipt: plus the negative control below
 *   node tools/mp-soak.mjs --clients=28 --duration=300 --map=monsoon --latency=60 --jitter=20 --loss=3
 *
 * (267) Starvation: the soak measures host time in a thread it shares with the machine. It measures what the machine
 * withheld from that thread (tools/starvation-meter.mjs: wall time CPU and idling do not cover) and judges each gate
 * net of it: a round trip, an acknowledgement or a pose step without the starvation inside its own span; in-process,
 * the server's dropped ticks only past those its gap's starved ms account for, a second's tick rate on the loop's own
 * timeline (ticks run, dropped and owed are counted, not the wall clock read mid-catch-up), tick cost only for ticks
 * the thread was not preempted in. The negative control (--plant-stall) spends 400 ms of CPU inside one server tick;
 * the ticks it drops must be charged to the server. The child server's own thread is not measured: its gates read as
 * before.
 *
 * Gates (exit 1 on any): every client welcomed and spawned; snapshot cadence per
 * client (the rate its WELCOME names — SNAPSHOT_HZ by default, P3b: 20 — +- jitter); input acknowledgement lag p95
 * (the lead the client chose at send time subtracted) <= RTT p95 + one tick + one snapshot interval (+ the server's
 * jitter buffer growth beyond one tick);
 * pose continuity of interpolated remote samples at a 2..4-interval delay (no
 * sampler-introduced step > 0.5 m beyond the motion the wire carries, no backwards
 * step > 0.3 m the wire does not carry); an EVENT delivered to every client; no
 * backpressure close; server tick p95 <= 6 ms; RSS drift < 10 % over the run
 * (full runs); half the clients leave mid-match without a tick stall; the
 * creator's socket is killed and the match runs on. The full run also spawns
 * server/match/tickCost.selftest.mjs (28 bots on the heaviest maps).
 *
 * Loss is applied to replaceable frames only (INPUT, SNAPSHOT): the transport is
 * TCP, so a "lost" frame is one the client or server never gets to see, which is
 * what a dropped UDP datagram would have meant for that lane.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import {
  CLOSE_REASON, CONTROL_FLAGS, MESSAGE_TYPE, NO_TICK, PROTOCOL_VERSION, SNAPSHOT_HZ, TEAM, TICK_HZ, TICK_MS,
} from '../src/mp/wire/constants.ts';
import { applySnapshotPacket, decodeMessage, encodeMessage, peekMessageType } from '../src/mp/wire/codec.ts';
import { dequantizePosition, quantizeAimDistance, quantizeAngle } from '../src/mp/wire/quantize.ts';
import { createLogger } from '../server/match/log.ts';
import { createMatchService } from '../server/match/service.ts';
import { createStarvationMeter, threadCpuMs } from './starvation-meter.mjs';

// ------------------------------------------------------------ arguments
function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((entry) => entry.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : fallback;
}
function numberArg(name, fallback) {
  const value = Number(argValue(name, fallback));
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be a non-negative number`);
  return value;
}
const short = process.argv.includes('--short');
const clientCount = Math.floor(numberArg('clients', short ? 4 : 28));
const teamSize = Math.floor(numberArg('team-size', clientCount / 2));
if (clientCount !== teamSize * 2 || clientCount < 2 || clientCount > 56) throw new RangeError('clients must be two equal teams (2..56)');
const durationS = numberArg('duration', short ? 20 : 300);
const latencyMs = numberArg('latency', short ? 40 : 60);
const jitterMs = numberArg('jitter', short ? 10 : 20);
const lossPercent = numberArg('loss', short ? 2 : 3);
const seed = Math.floor(numberArg('seed', short ? 7 : 1));
const mapArg = argValue('map', short ? 'verdant' : 'heaviest');
const serverMode = argValue('server', short ? 'inprocess' : 'child');
if (serverMode !== 'child' && serverMode !== 'inprocess') throw new TypeError('server must be child or inprocess');
const runTickCost = !short && !process.argv.includes('--no-tick-cost');
const diag = process.argv.includes('--diag');
const plantStall = process.argv.includes('--plant-stall');
const secret = 'mp-soak-seat-secret-0123456789abcdef';
const TICK_BUDGET_MS = 6;
// (267) the planted stall: 400 ms of CPU drops the ticks beyond the loop's catch-up window (server/match/loop.ts
// maxCatchUpTicks, the actor keeps its default 6), 16 at least with rounding; and the least ticks the cost gate judges for a verdict
const PLANT_STALL_CPU_MS = 400;
const LOOP_CATCH_UP_TICKS = 6;
// a tick's wall time against its interval's CPU: the clocks' own disagreement, not preemption
const TICK_WALL_TOLERANCE_MS = 1;
const PLANT_MIN_DROPPED = Math.floor(PLANT_STALL_CPU_MS / TICK_MS) - LOOP_CATCH_UP_TICKS - 2;
const MIN_JUDGED_TICKS = 300;
// The snapshot interval is the server's choice and rides the WELCOME (P3b, 2026-09-29): every client reads its own
// (`client.intervalTicks`, this default until it is welcomed) for its sampler, its gap counting and the gates.
const DEFAULT_SNAPSHOT_INTERVAL_TICKS = TICK_HZ / SNAPSHOT_HZ;
const INTERP_DELAY_MIN_INTERVALS = 2;
const INTERP_DELAY_MAX_INTERVALS = 4;

function mulberry32(value) {
  let state = value >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(seed);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Bounded sample reservoir: the soak's own metrics must not become the memory it measures. */
function createReservoir(capacity = 20_000) {
  const values = [];
  let seen = 0;
  return {
    values,
    push(value) {
      seen++;
      if (values.length < capacity) values.push(value);
      else {
        const slot = Math.floor(rng() * seen);
        if (slot < capacity) values[slot] = value;
      }
    },
    get length() { return seen; },
  };
}
const quantile = (values, q) => {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
};

async function heaviestMap() {
  const { readFileSync } = await import('node:fs');
  const table = JSON.parse(readFileSync(new URL('../docs/references/perf/round59-map-perf-audit.json', import.meta.url), 'utf8'));
  return Object.entries(table.maps).sort((a, b) => b[1].main.cpuP95Max - a[1].main.cpuP95Max)[0][0];
}

// ------------------------------------------------------------ impaired socket
/** Order-preserving delay + jitter both ways; loss on replaceable frames only. */
function createImpairedSocket(url, { onFrame, onClose, onOpen }) {
  const socket = new WebSocket(url, { origin: 'http://127.0.0.1' });
  socket.binaryType = 'nodebuffer';
  let lastInDelivery = 0;
  let lastOutDelivery = 0;
  const stats = { sent: 0, droppedOut: 0, received: 0, droppedIn: 0 };
  const delay = () => latencyMs + (rng() * 2 - 1) * jitterMs;
  const replaceable = (type) => type === MESSAGE_TYPE.INPUT || type === MESSAGE_TYPE.SNAPSHOT;
  socket.on('open', () => onOpen());
  socket.on('message', (raw, isBinary) => {
    if (!isBinary) return;
    const bytes = new Uint8Array(raw);
    if (replaceable(peekMessageType(bytes)) && rng() * 100 < lossPercent) { stats.droppedIn++; return; }
    const at = Math.max(lastInDelivery, performance.now() + delay());
    lastInDelivery = at;
    setTimeout(() => { if (!closed) { stats.received++; onFrame(bytes); } }, Math.max(0, at - performance.now()));
  });
  let closed = false;
  socket.on('close', (code, reason) => { closed = true; onClose(code, String(reason)); });
  socket.on('error', () => {});
  return {
    stats,
    get readyState() { return socket.readyState; },
    send(bytes) {
      if (replaceable(peekMessageType(bytes)) && rng() * 100 < lossPercent) { stats.droppedOut++; return; }
      const at = Math.max(lastOutDelivery, performance.now() + delay());
      lastOutDelivery = at;
      setTimeout(() => { if (socket.readyState === WebSocket.OPEN) { stats.sent++; socket.send(bytes, { binary: true }); } }, Math.max(0, at - performance.now()));
    },
    close() { socket.close(1000, 'soak'); },
    terminate() { socket.terminate(); },
  };
}

// ------------------------------------------------------------ headless client
function createSoakClient(index, url, token, { creator = false } = {}) {
  const client = {
    index, creator, welcome: null, entityId: 0, team: null, closed: null, closeReason: null,
    frames: [], history: new Map(), missingBaselines: 0,
    snapshotGaps: createReservoir(), firstSnapshotTick: null, lastSnapshotTick: null, snapshotsReceived: 0, snapshotHz: SNAPSHOT_HZ, intervalTicks: DEFAULT_SNAPSHOT_INTERVAL_TICKS,
    sentTicks: new Map(), ackLags: createReservoir(), intrinsicAckLags: createReservoir(), acked: -1, minMargin: Infinity, leadAdjustedAt: 0,
    // (267) the judge's records: [sentAt, ackedAt, lag net of the lead over the measured server tick] and [sentAt, at, rtt]
    ackSamples: createReservoir(), rttSpans: createReservoir(),
    rttSamples: [], serverOffsetMs: 0, serverTickAt: null, clockOffsetTicks: null, clockTargetTicks: null,
    events: 0, eventMessages: 0, chatSeen: false, errors: [],
    lead: 3, margin: null,
    poseSteps: createReservoir(), backwardSteps: 0, maxStep: 0, maxExcess: 0, lastSample: new Map(), lastSampleAt: 0, lastRenderTick: null,
    // (267) steps with any sampler excess or a backwards step: [dependsFromMs, atMs, excess m, backwards m, wire m/tick,
    // ticks the clock was ahead of the server tick last measured]
    poseFlags: [],
    interpDelayIntervals: INTERP_DELAY_MIN_INTERVALS, underruns: 0, delayRelaxedAt: 0,
    frameStepMax: 0, frameStepsOver: 0,
    fireSeq: 0, actionSeq: 0, controls: [], clientTick: 0,
    left: false, killed: false, socket: null, timers: [],
  };
  const socket = createImpairedSocket(url, {
    onOpen() {
      socket.send(encodeMessage({ type: MESSAGE_TYPE.HELLO, protocolVersion: PROTOCOL_VERSION, capabilities: 1, token, clientBuild: 'mp-soak' }));
    },
    onFrame(bytes) { receive(client, bytes); },
    onClose(code, reason) { client.closed = { code, reason }; stopTimers(); },
  });
  client.socket = socket;
  function stopTimers() { for (const timer of client.timers) clearInterval(timer); client.timers.length = 0; }
  client.stop = stopTimers;

  const localTicks = () => performance.now() / TICK_MS;
  /** Estimated server tick: local ticks + an offset that slews at most 0.05 tick per sample toward the measured target. */
  function serverTickNow() {
    if (client.clockOffsetTicks == null) return 0;
    return localTicks() + client.clockOffsetTicks;
  }
  client.serverTickNow = serverTickNow;
  function observeServerTick(tick) {
    const owdTicks = (quantile(client.rttSamples, 0.5) / 2) / TICK_MS;
    client.clockTargetTicks = tick + owdTicks - localTicks();
    if (client.clockOffsetTicks == null) client.clockOffsetTicks = client.clockTargetTicks;
  }
  function slewClock() {
    if (client.clockOffsetTicks == null || client.clockTargetTicks == null) return;
    const error = client.clockTargetTicks - client.clockOffsetTicks;
    client.clockOffsetTicks += Math.max(-0.05, Math.min(0.05, error));
  }

  function receive(target, bytes) {
    const decoded = decodeMessage(bytes, { resolveBaseline: (tick) => target.history.get(tick) ?? null });
    if (!decoded.ok) { target.errors.push(`decode:${decoded.error.code}`); return; }
    const message = decoded.message;
    switch (message.type) {
      case MESSAGE_TYPE.WELCOME:
        target.welcome = message;
        target.entityId = message.entityId;
        target.team = message.team;
        // the server's rate (P3b): the sampler, the gap counting and the gates follow it
        target.snapshotHz = message.snapshotHz;
        target.intervalTicks = Math.max(1, Math.round(TICK_HZ / message.snapshotHz));
        observeServerTick(message.serverTick);
        startTimers();
        break;
      case MESSAGE_TYPE.SNAPSHOT: {
        let frame;
        try {
          frame = applySnapshotPacket(message, message.keyframe ? null : target.history.get(message.baseTick) ?? null);
        } catch (error) {
          if (error?.code === 'missing_baseline') { target.missingBaselines++; return; }
          throw error;
        }
        target.snapshotsReceived++;
        target.firstSnapshotTick ??= frame.tick;
        frame.byId = new Map(frame.entities.map((row) => [row.entityId, row]));
        if (target.lastSnapshotTick != null && frame.tick > target.lastSnapshotTick) target.snapshotGaps.push((frame.tick - target.lastSnapshotTick) / target.intervalTicks);
        if (target.lastSnapshotTick == null || frame.tick > target.lastSnapshotTick) {
          const previous = target.frames.at(-1);
          if (previous) {
            const span = frame.tick - previous.tick;
            for (const row of frame.entities) {
              const before = previous.byId.get(row.entityId);
              if (!before) continue;
              const perTick = Math.hypot(row.x - before.x, row.y - before.y, row.z - before.z) / 1000 / span;
              if (perTick > target.frameStepMax) target.frameStepMax = perTick;
              if (perTick > 0.5) target.frameStepsOver++;
            }
          }
          target.lastSnapshotTick = frame.tick;
          target.frames.push(frame);
          if (target.frames.length > 8) target.frames.shift();
          // the server clock: the snapshot's tick was current one way-delay ago
          observeServerTick(frame.tick);
        }
        target.history.set(frame.tick, frame);
        if (target.history.size > 64) target.history.delete(target.history.keys().next().value);
        const margin = frame.inputMarginTicks === 127 ? null : frame.inputMarginTicks;
        if (frame.ackedInputTick !== NO_TICK && frame.ackedInputTick > target.acked) {
          target.acked = frame.ackedInputTick;
          for (const [tick, sent] of target.sentTicks) {
            if (tick <= frame.ackedInputTick) {
              const lag = performance.now() - sent.at;
              target.ackLags.push(lag);
              // the part of the lag the client chose (sending the control ahead of the server's tick) is not latency
              target.intrinsicAckLags.push(lag - Math.max(0, sent.leadTicks) * TICK_MS);
              // (267) nor is the part its clock was ahead of the server's tick: after the server drops ticks the clock slews
              // them out at 3 ticks/s (as the real client's does, clock.ts), and every control sent meanwhile waits for a
              // tick further off than the client meant. The lead is taken over the server tick this acknowledging
              // snapshot measures (a control sent before the next snapshot reported a drop was sent on a stale estimate);
              // the drops themselves are judged where they happen, by the tick gates.
              const leadOverServer = sent.leadTicks + sent.offsetTicks - target.clockTargetTicks;
              target.ackSamples.push([sent.at, sent.at + lag, lag - Math.max(0, leadOverServer) * TICK_MS]);
              target.sentTicks.delete(tick);
            }
          }
        }
        if (margin != null) {
          target.margin = margin;
          target.minMargin = Math.min(target.minMargin, margin);
          // adapt the lead once per second from the window's minimum margin, aiming for 1..3 ticks
          const now = performance.now();
          if (now - target.leadAdjustedAt >= 1000) {
            if (target.minMargin < 1) target.lead = Math.min(12, target.lead + 1);
            else if (target.minMargin > 3) target.lead = Math.max(1, target.lead - 1);
            target.minMargin = Infinity;
            target.leadAdjustedAt = now;
          }
        }
        break;
      }
      case MESSAGE_TYPE.EVENT:
        target.eventMessages++;
        target.events += message.events.length;
        if (message.events.some((event) => event.kind === 'chat')) target.chatSeen = true;
        break;
      case MESSAGE_TYPE.PONG: {
        const receivedAt = performance.now();
        const rtt = receivedAt - message.clientTimeMs;
        target.rttSamples.push(rtt);
        target.rttSpans.push([receivedAt - rtt, receivedAt, rtt]);
        if (target.rttSamples.length > 32) target.rttSamples.shift();
        // the first round trip seeds the lead: one way delay plus a two-tick margin
        if (target.rttSamples.length === 1) target.lead = Math.max(1, Math.min(12, Math.ceil(rtt / 2 / TICK_MS) + 2));
        break;
      }
      case MESSAGE_TYPE.ERROR: target.errors.push(`error:${message.reason}`); break;
      case MESSAGE_TYPE.CLOSE: target.closeReason = message.reason; break;
      default: break;
    }
  }

  function control(now) {
    const phase = (now / 1000 + index * 0.7) % 20;
    const steer = phase < 6 ? 0 : phase < 9 ? 0.35 : phase < 14 ? 0 : -0.35;
    // aim at the nearest visible enemy from the newest frame, else straight ahead
    const frame = client.frames.at(-1);
    let aimYaw = client.team === TEAM.BRAVO ? Math.PI : 0;
    let aimDistance = 500;
    const own = frame?.entities.find((row) => row.entityId === client.entityId);
    if (frame && own) {
      let best = null;
      for (const row of frame.entities) {
        const entry = client.welcome.roster.find((r) => r.entityId === row.entityId);
        if (!entry || entry.team === client.team) continue;
        const dx = dequantizePosition(row.x - own.x), dz = dequantizePosition(row.z - own.z);
        const distance = Math.hypot(dx, dz);
        if (!best || distance < best.distance) best = { distance, yaw: Math.atan2(dx, dz) };
      }
      if (best) { aimYaw = best.yaw; aimDistance = best.distance; }
    }
    const fire = Math.floor(now / 4000) !== Math.floor((now - TICK_MS) / 4000);
    if (fire) client.fireSeq = (client.fireSeq + 1) & 0xffff;
    return {
      throttle: 110, steer: Math.round(steer * 127), flags: 0,
      aimYaw: quantizeAngle(aimYaw), aimPitch: 0, aimDistance: quantizeAimDistance(aimDistance),
      shellSlot: 0, fireSeq: client.fireSeq, actionSeq: client.actionSeq, actionBits: 0,
    };
  }

  function startTimers() {
    let lastInputAt = performance.now();
    client.timers.push(setInterval(() => {
      if (client.left || client.killed) return;
      const now = performance.now();
      // one control per elapsed tick, the last three ride every frame
      const due = Math.min(3, Math.max(1, Math.round((now - lastInputAt) / TICK_MS)));
      lastInputAt = now;
      for (let n = 0; n < due; n++) client.controls.push(control(now));
      while (client.controls.length > 3) client.controls.shift();
      // the intended server tick: never behind what was already sent, never ratcheting ahead of the estimate
      const clientTick = Math.max(client.clientTick, Math.floor(serverTickNow()) + client.lead);
      if (clientTick === client.clientTick && client.clientTick > 0) return;
      client.clientTick = clientTick;
      // remember when the control left and how far ahead of the estimated server tick it was sent
      client.sentTicks.set(clientTick, { at: now, leadTicks: clientTick - serverTickNow(), offsetTicks: client.clockOffsetTicks });
      if (client.sentTicks.size > 120) client.sentTicks.delete(client.sentTicks.keys().next().value);
      socket.send(encodeMessage({
        type: MESSAGE_TYPE.INPUT, clientTick, snapshotAckTick: client.lastSnapshotTick ?? NO_TICK,
        interpDelayMs: Math.round(client.interpDelayIntervals * client.intervalTicks * TICK_MS), controls: client.controls.slice(),
      }));
    }, TICK_MS));
    client.timers.push(setInterval(() => {
      socket.send(encodeMessage({ type: MESSAGE_TYPE.PING, clientTimeMs: Math.round(performance.now()) & 0xffffffff, snapshotAckTick: client.lastSnapshotTick ?? NO_TICK }));
    }, 1000));
    // the presentation sampler: remote entities at now - 2 intervals, linear between the bracketing
    // frames, extrapolated along the row velocity for at most one interval past the newest frame
    client.timers.push(setInterval(() => {
      slewClock();
      const frames = client.frames;
      const sampleNow = performance.now();
      const sampleScale = client.lastSampleAt ? TICK_MS / Math.max(TICK_MS, sampleNow - client.lastSampleAt) : 1;
      // (267) what a step depends on: the frames for the render tick, in flight from a delay plus one way before the
      // previous sample until now; a starved or planted interval there can move it
      const dependsFromMs = (client.lastSampleAt || sampleNow) - client.interpDelayIntervals * client.intervalTicks * TICK_MS - (latencyMs + jitterMs);
      client.lastSampleAt = sampleNow;
      if (frames.length < 2) return;
      const renderTick = serverTickNow() - client.interpDelayIntervals * client.intervalTicks;
      let older = null, newer = null;
      for (let i = frames.length - 1; i >= 0; i--) {
        if (frames[i].tick <= renderTick) { older = frames[i]; newer = frames[i + 1] ?? null; break; }
      }
      // adaptive delay (charter section 4): an underrun past the newest frame widens the delay up to
      // four intervals at once; ten quiet seconds relax it by one interval
      if (!newer && client.interpDelayIntervals < INTERP_DELAY_MAX_INTERVALS) {
        client.interpDelayIntervals++;
        client.underruns++;
        client.delayRelaxedAt = sampleNow;
      } else if (client.interpDelayIntervals > INTERP_DELAY_MIN_INTERVALS && sampleNow - client.delayRelaxedAt > 10_000) {
        client.interpDelayIntervals--;
        client.delayRelaxedAt = sampleNow;
      }
      if (!older) return;
      const extrapolateTicks = newer ? 0 : Math.min(client.intervalTicks, renderTick - older.tick);
      const t = newer ? Math.max(0, Math.min(1, (renderTick - older.tick) / (newer.tick - older.tick))) : 0;
      const renderAdvance = client.lastRenderTick == null ? 1 : Math.max(0, renderTick - client.lastRenderTick);
      client.lastRenderTick = renderTick;
      const seen = new Set();
      for (const row of older.entities) {
        if (row.entityId === client.entityId) continue;
        const next = newer ? newer.byId.get(row.entityId) : row;
        if (!next) continue;
        const yaw = row.yaw / 65536 * Math.PI * 2;
        const vx = Math.sin(yaw) * row.speed / 100, vz = Math.cos(yaw) * row.speed / 100, vy = row.verticalSpeed / 100;
        const extrapolateS = extrapolateTicks * TICK_MS / 1000;
        const x = dequantizePosition(row.x + (next.x - row.x) * t) + vx * extrapolateS;
        const y = dequantizePosition(row.y + (next.y - row.y) * t) + vy * extrapolateS;
        const z = dequantizePosition(row.z + (next.z - row.z) * t) + vz * extrapolateS;
        // the motion the wire itself carries across this sample's span: the pair's per-tick displacement
        const span = newer ? Math.max(1, newer.tick - older.tick) : 1;
        const wirePerTick = newer ? Math.hypot(next.x - row.x, next.y - row.y, next.z - row.z) / 1000 / span : Math.hypot(vx, vy, vz) * TICK_MS / 1000;
        const last = client.lastSample.get(row.entityId);
        if (last) {
          const dx = x - last.x, dy = y - last.y, dz = z - last.z;
          // a late sampler tick spans several simulation ticks; judge the step a 60 Hz frame would have seen
          const step = Math.hypot(dx, dy, dz) * sampleScale;
          // what the wire's own motion accounts for; the rest is the sampler's (an underrun catch-up, a clock jump)
          const expected = Math.max(wirePerTick, last.wirePerTick) * Math.max(1, renderAdvance) * sampleScale;
          const excess = Math.max(0, step - expected);
          client.poseSteps.push(step);
          if (step > client.maxStep) client.maxStep = step;
          if (excess > client.maxExcess) client.maxExcess = excess;
          const speed = Math.hypot(last.vx, last.vz);
          let back = 0;
          if (speed > 0.5) {
            const along = (dx * last.vx + dz * last.vz) / speed * sampleScale;
            const wireAlong = newer ? ((next.x - row.x) * last.vx + (next.z - row.z) * last.vz) / 1000 / speed / span : 0;
            if (along < -0.3 && wireAlong >= -0.05) { client.backwardSteps++; back = -along; }
          }
          if (excess > 0 || back > 0) client.poseFlags.push([dependsFromMs, sampleNow, excess, back, Math.max(wirePerTick, last.wirePerTick) * sampleScale, client.clockOffsetTicks - client.clockTargetTicks]);
        }
        client.lastSample.set(row.entityId, { x, y, z, vx, vz, wirePerTick });
        seen.add(row.entityId);
      }
      // an entity that left the viewer's interest set (hidden by spotting) reappears as a new sample, not a step
      for (const entityId of client.lastSample.keys()) if (!seen.has(entityId)) client.lastSample.delete(entityId);
    }, TICK_MS));
  }
  return client;
}

// ------------------------------------------------------------ server access (child process or in-process)
const roomBody = (mapId, seats) => ({ roomId: 'soak', mapId, seed, countdownS: 1, seats, world: 'dedicated', endedLingerTicks: 600 });

async function startChildServer() {
  const script = fileURLToPath(new URL('../server/match/main.ts', import.meta.url));
  const child = spawn(process.execPath, ['--expose-gc', script], {
    env: { ...process.env, COT_MATCH_HOST: '127.0.0.1', COT_MATCH_PORT: '0', COT_MATCH_SEAT_SECRET: secret, COT_MATCH_MAX_ACTORS: '2', COT_MATCH_LOG_LEVEL: 'info' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const url = await new Promise((resolve, reject) => {
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        let entry = null;
        try { entry = JSON.parse(line); } catch { /* not a log line */ }
        if (entry?.msg === 'match service listening') resolve(entry.url);
        else if (entry && (entry.level === 'warn' || entry.level === 'error')) console.log(`[mp-soak:server] ${line}`);
      }
    });
    child.once('exit', (code) => reject(new Error(`match service exited early (${code})`)));
    setTimeout(() => reject(new Error('match service did not start within 60 s')), 60_000).unref();
  });
  const base = url.replace(/^ws/, 'http').replace(/\/match$/, '');
  const headers = { authorization: `Bearer ${secret}`, 'content-type': 'application/json' };
  const api = async (path, init = {}) => {
    const response = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    if (!response.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${response.status} ${await response.text()}`);
    return response.json();
  };
  let roomId = null;
  return {
    mode: 'child',
    url,
    async createRoom(mapId, seats) {
      const room = await api('/rooms', { method: 'POST', body: JSON.stringify(roomBody(mapId, seats)) });
      roomId = room.roomId;
      return { tokens: new Map(Object.entries(room.tokens)) };
    },
    async inspect() { return api(`/rooms/${roomId}`); },
    async memory() { return (await api('/metrics?gc=1')).service.rssMb * 1048576; },
    async close() {
      child.kill('SIGTERM');
      await new Promise((resolve) => { child.once('exit', resolve); setTimeout(resolve, 15_000).unref(); });
    },
  };
}

async function startInProcessServer() {
  const log = createLogger({ level: 'warn' });
  const service = await createMatchService({ host: '127.0.0.1', port: 0, allowedOrigins: null, seatSecret: secret, log, maxActors: 2 });
  let actor = null;
  // (267) the loop's tick costs as they are pushed (its histogram keeps a summary only), and the end of each batch of
  // ticks it runs: read there, the counts owe it nothing (a read between a starved gap and its catch-up came up short)
  const tickCostListeners = [];
  let batchWaiters = [];
  return {
    mode: 'inprocess',
    url: service.url,
    /** (267) the room's actor: its loop shares this thread with the clients, so the starvation meter judges it too. */
    get actor() { return actor; },
    onTickCost(listener) { tickCostListeners.push(listener); },
    async createRoom(mapId, seats) {
      const room = service.rooms.createRoom(roomBody(mapId, seats));
      actor = room.actor;
      const histogram = actor.loop.tickCost;
      const push = histogram.push;
      histogram.push = (cost) => {
        push.call(histogram, cost);
        for (const listener of tickCostListeners) listener(cost);
        if (batchWaiters.length) {
          const waiters = batchWaiters;
          batchWaiters = [];
          // a loop wake runs its whole batch synchronously: the microtask runs after it
          queueMicrotask(() => { for (const resolve of waiters) resolve(); });
        }
      };
      return { tokens: room.tokens };
    },
    async inspect() {
      if (actor.loop.running) await new Promise((resolve) => batchWaiters.push(resolve));
      return { stats: actor.stats(), clients: actor.clientStats() };
    },
    async memory() { if (typeof globalThis.gc === 'function') globalThis.gc(); return process.memoryUsage().rss; },
    async close() { await service.close(); },
  };
}

// ------------------------------------------------------------ the run
async function main() {
  const mapId = mapArg === 'heaviest' ? await heaviestMap() : mapArg;
  const server = serverMode === 'child' ? await startChildServer() : await startInProcessServer();
  const seats = [];
  for (let index = 0; index < clientCount; index++) {
    seats.push({ playerId: `c${index}`, name: `Soak ${index}`, team: index < teamSize ? 'alpha' : 'bravo', specId: index % 2 ? 't90am' : 'm1a1_abrams_hc' });
  }
  const room = await server.createRoom(mapId, seats);
  const url = server.url;
  const { loadavg } = await import('node:os');
  console.log(`[mp-soak] map=${mapId} clients=${clientCount} (${teamSize}v${teamSize}) duration=${durationS}s latency=${latencyMs}ms jitter=${jitterMs}ms loss=${lossPercent}% seed=${seed} server=${server.mode} url=${url} load1=${loadavg()[0].toFixed(1)}`);

  const clients = seats.map((seat, index) => createSoakClient(index, url, room.tokens.get(seat.playerId), { creator: index === 0 }));
  const started = performance.now();

  // (267, main's load class: 265's default tier failed tick rate, tick p95, half leave and ack lag beside 8 workers
  // and passed alone) the clients and the in-process server share this thread, so the time the machine withheld from it
  // is measured (starvation-meter.mjs) and every host-time gate is judged net of it. The child server's own thread is not
  // measured: its gates stay as they were.
  const actor = server.actor ?? null;
  const loop = actor?.loop ?? null;
  const judged = { tickCosts: [], ticksUnjudged: 0, stalls: [] };
  const ticksSince = [];
  let stallsSeen = loop ? loop.stats.stalls : 0;
  let droppedSeen = loop ? loop.stats.droppedTicks : 0;
  let previousInterval = null;
  const meter = createStarvationMeter({
    onInterval(interval) {
      if (!loop) return;
      // a tick's cost is judged when the CPU this thread had over the interval covers the wall time of its ticks
      let wall = 0;
      for (const cost of ticksSince) wall += cost;
      if (wall <= interval.cpuMs + TICK_WALL_TOLERANCE_MS) judged.tickCosts.push(...ticksSince);
      else judged.ticksUnjudged += ticksSince.length;
      ticksSince.length = 0;
      // a stall drops the ticks its gap held beyond the catch-up window. The server's share is what the thread's own time
      // in that gap (the longer of this interval and the last: the loop and the meter wake in either order after it) would
      // have dropped on its own, its CPU and idling past the window; the rest is the machine's. (267, load1 248: crediting
      // the machine a tick per starved TICK_MS took the catch-up of a second, starved gap in the same interval out of the
      // planted stall's share: 15 ticks of its 18.)
      if (loop.stats.stalls > stallsSeen) {
        const gap = previousInterval && previousInterval.wallMs > interval.wallMs ? previousInterval : interval;
        const dropped = loop.stats.droppedTicks - droppedSeen;
        const serverTicks = Math.min(dropped, Math.max(0, Math.floor((gap.cpuMs + meter.periodMs) / TICK_MS) - LOOP_CATCH_UP_TICKS));
        judged.stalls.push({ startMs: gap.startMs, atMs: interval.endMs, dropped, droppedAfter: loop.stats.droppedTicks, machineTicks: dropped - serverTicks });
      }
      stallsSeen = loop.stats.stalls;
      droppedSeen = loop.stats.droppedTicks;
      previousInterval = interval;
    },
  });
  if (loop) server.onTickCost((cost) => ticksSince.push(cost));
  meter.start();
  // the negative control (--plant-stall, the receipt): at 35 % of the run one server tick spends PLANT_STALL_CPU_MS of
  // CPU inside the authority's step; its stall and its tick-rate window must be judged the server's, never starvation
  let plant = null;
  if (plantStall) {
    if (!actor) throw new Error('--plant-stall plants inside the in-process server');
    const authority = actor.authority;
    const step = authority.step;
    authority.step = function plantedStep(...args) {
      if (!plant && performance.now() - started >= durationS * 1000 * 0.35) {
        const startMs = performance.now();
        const cpuFrom = threadCpuMs();
        while (threadCpuMs() - cpuFrom < PLANT_STALL_CPU_MS) { /* CPU, not wall: a preempted plant still spends it */ }
        plant = { startMs, endMs: performance.now(), tick: actor.tick };
      }
      return step.apply(this, args);
    };
  }

  const rssSamples = [];
  const rateWindows = [];
  let last = await server.inspect();
  let lastTickSample = { tick: last.stats.tick, dropped: last.stats.loop.droppedTicks, at: performance.now() };
  let departure = null;
  let departed = false;
  let killed = false;
  let chatSent = false;
  const gates = [];
  const fail = (name, detail) => gates.push({ name, ok: false, detail });
  const pass = (name, detail) => gates.push({ name, ok: true, detail });

  while (performance.now() - started < durationS * 1000) {
    await sleep(1000);
    const elapsed = (performance.now() - started) / 1000;
    last = await server.inspect();
    const now = performance.now();
    rateWindows.push({ fromMs: lastTickSample.at, toMs: now, ticks: last.stats.tick - lastTickSample.tick, droppedFrom: lastTickSample.dropped, droppedTo: last.stats.loop.droppedTicks });
    lastTickSample = { tick: last.stats.tick, dropped: last.stats.loop.droppedTicks, at: now };
    if (elapsed >= 30 && Math.round(elapsed) % 10 === 0) {
      // retained memory of the server: a forced collection first (the child runs with --expose-gc)
      const rss = await server.memory();
      rssSamples.push(rss);
      if (diag) {
        const live = clients.filter((c) => c.welcome && !c.left && !c.killed);
        console.log(`[mp-soak:diag] t=${elapsed.toFixed(0)}s rss=${(rss / 1048576).toFixed(0)}MB tick=${last.stats.tick} lead p50=${quantile(live.map((c) => c.lead), 0.5)} margin p50=${quantile(live.map((c) => c.margin ?? 0), 0.5)} clockErr p50=${quantile(live.map((c) => (c.clockTargetTicks ?? 0) - (c.clockOffsetTicks ?? 0)), 0.5).toFixed(2)} rtt p50=${quantile(live.flatMap((c) => c.rttSamples), 0.5).toFixed(0)} serverTick-est p50=${quantile(live.map((c) => c.serverTickNow() - last.stats.tick), 0.5).toFixed(1)} delay p50=${quantile(live.map((c) => c.interpDelayIntervals), 0.5)}`);
      }
    }
    if (!chatSent && elapsed > 3 && clients[1].welcome) {
      clients[1].socket.send(encodeMessage({ type: MESSAGE_TYPE.CHAT, text: 'soak chat' }));
      chatSent = true;
    }
    if (!killed && elapsed >= durationS * 0.25) {
      killed = true;
      clients[0].killed = true;
      clients[0].stop();
      clients[0].socket.terminate();
    }
    if (!departed && elapsed >= durationS * 0.5) {
      departed = true;
      const before = await server.inspect();
      const fromMs = performance.now();
      for (let index = 1; index < clientCount; index += 2) {
        clients[index].left = true;
        clients[index].stop();
        clients[index].socket.send(encodeMessage({ type: MESSAGE_TYPE.LEAVE, reason: CLOSE_REASON.CLIENT_LEAVE }));
      }
      await sleep(2000);
      const after = await server.inspect();
      departure = {
        fromMs, toMs: performance.now(), ticks: after.stats.tick - before.stats.tick, stallsBefore: before.stats.loop.stalls,
        droppedFrom: before.stats.loop.droppedTicks, droppedTo: after.stats.loop.droppedTicks,
      };
    }
  }
  for (const client of clients) client.stop();
  meter.stop();
  const final = await server.inspect();
  const stats = final.stats;

  // ------------------------------------------------------------ gates
  const welcomed = clients.filter((client) => client.welcome);
  if (welcomed.length === clientCount && welcomed.every((client) => client.entityId > 0)) pass('welcomed+spawned', `${welcomed.length}/${clientCount}`);
  else fail('welcomed+spawned', `${welcomed.length}/${clientCount}`);
  const survivors = clients.filter((client) => !client.left && !client.killed);
  // (267) the judge: each measurement is taken net of the starvation inside its own span (the time this thread was owed
  // and did not get), and what the planted stall touched is the negative control's; the gates' bounds are unchanged
  const planted = (fromMs, toMs) => plant !== null && toMs > plant.startMs && fromMs < plant.endMs;
  const starvedIn = (fromMs, toMs) => meter.starvedIn(fromMs, toMs);
  const starved = (name, detail) => gates.push({ name, ok: true, starved: true, detail });
  // a stall's drops the starvation does not account for are the server's
  const serverDropped = (stall) => stall.dropped - stall.machineTicks;
  const cadenceBad = survivors.filter((client) => {
    // (267) the frames the server's ticks called for, first to last: a starved server ticks less, and the ticks it drops
    // are the tick-rate gate's
    const expected = client.firstSnapshotTick === null ? Infinity : (client.lastSnapshotTick - client.firstSnapshotTick) / client.intervalTicks + 1;
    return client.snapshotsReceived < expected * (1 - lossPercent / 100) * 0.85 || quantile(client.snapshotGaps.values, 0.95) > 3;
  });
  const cadenceDetail = `min ${Math.min(...survivors.map((c) => c.snapshotsReceived))} snapshots at ${Math.max(...survivors.map((c) => c.snapshotHz))} Hz, gap p95 ${Math.max(...survivors.map((c) => quantile(c.snapshotGaps.values, 0.95)))} intervals, missing baselines ${survivors.reduce((sum, c) => sum + c.missingBaselines, 0)}`;
  if (!cadenceBad.length) pass('snapshot cadence', cadenceDetail); else fail('snapshot cadence', `${cadenceBad.length} clients: ${cadenceDetail}`);
  // a round trip and an acknowledgement, each net of the starvation inside its span (at most that much later for it)
  const unplanted = (spans) => spans.filter(([from, to]) => !planted(from, to));
  const net = (spans) => spans.map(([from, to, ms]) => ms - starvedIn(from, to));
  const rttJudged = net(unplanted(survivors.flatMap((client) => client.rttSpans.values)));
  const ackSamples = unplanted(survivors.flatMap((client) => client.ackSamples.values));
  const ackJudged = net(ackSamples);
  const rttP95 = quantile(rttJudged, 0.95);
  const ackP95 = quantile(survivors.flatMap((client) => client.ackLags.values), 0.95);
  const intrinsicP95 = quantile(ackJudged, 0.95);
  // RTT + one tick + one snapshot interval: applied on the next tick, acknowledged by the next snapshot at the rate the WELCOME
  // named (two ticks at 30 Hz, three at 20); plus the jitter buffer beyond one tick
  const bufferTicks = Math.max(1, ...final.clients.map((entry) => entry.bufferTicks));
  const intervalTicks = Math.max(...survivors.map((client) => client.intervalTicks));
  const ackBound = rttP95 + (1 + intervalTicks + bufferTicks - 1) * TICK_MS;
  const rttP50 = quantile(rttJudged, 0.5);
  const intrinsicP50 = quantile(ackJudged, 0.5);
  const ackJudgedDetail = `p95 ${quantile(ackSamples.map((sample) => sample[2]), 0.95).toFixed(0)} ms before taking out the starvation inside each span`;
  if (intrinsicP95 <= ackBound && survivors.every((client) => client.ackLags.length > 0)) pass('input ack lag', `p50 ${intrinsicP50.toFixed(0)} / p95 ${intrinsicP95.toFixed(0)} ms (raw p95 ${ackP95.toFixed(0)} incl. lead) <= rtt p95 ${rttP95.toFixed(0)} (p50 ${rttP50.toFixed(0)}) + ${1 + intervalTicks + bufferTicks - 1} ticks (one tick + one snapshot at ${Math.max(...survivors.map((c) => c.snapshotHz))} Hz + the buffer beyond one); ${ackJudgedDetail}`);
  else fail('input ack lag', `p50 ${intrinsicP50.toFixed(0)} / p95 ${intrinsicP95.toFixed(0)} ms (raw ${ackP95.toFixed(0)}) vs bound ${ackBound.toFixed(0)} ms (rtt p95 ${rttP95.toFixed(0)}, buffer ${bufferTicks}); ${ackJudgedDetail}`);
  const maxStep = Math.max(...survivors.map((client) => client.maxStep));
  // a step net of the motion the starvation in its frames' flight could hold back (a tick of wire motion per starved
  // TICK_MS) and of the ticks the clock ran ahead of the server tick past a tick of estimate noise: after the server drops
  // ticks the render tick runs past the newest frame until the clock slews them out (the ack gate's rule; the drops are
  // the tick gates')
  const poseFlags = survivors.flatMap((client) => client.poseFlags).filter(([from, to]) => !planted(from, to));
  const held = ([from, to, , , perTick, aheadTicks]) => perTick * (starvedIn(from, to) / TICK_MS + Math.max(0, aheadTicks - 1));
  const maxExcess = Math.max(0, ...poseFlags.map((flag) => flag[2] - held(flag)));
  const backward = poseFlags.filter((flag) => flag[3] - held(flag) > 0.3).length;
  const poseUnjudged = poseFlags.filter((flag) => (flag[2] > 0.5 && flag[2] - held(flag) <= 0.5) || (flag[3] > 0.3 && flag[3] - held(flag) <= 0.3)).length;
  const steps = survivors.reduce((sum, client) => sum + client.poseSteps.length, 0);
  const frameStepMax = Math.max(...survivors.map((client) => client.frameStepMax));
  const frameStepsOver = survivors.reduce((sum, client) => sum + client.frameStepsOver, 0);
  // the gate judges what the sampler adds beyond the motion the wire carries: an underrun catch-up or a clock
  // jump fails it; the simulation's own per-tick motion (ram pushes, structure steps) is reported beside it
  const delayDetail = `delay ${quantile(survivors.map((c) => c.interpDelayIntervals), 0.5)} intervals median, ${survivors.reduce((sum, c) => sum + c.underruns, 0)} underruns; sim motion on the wire max ${frameStepMax.toFixed(3)} m/tick (${frameStepsOver} frame steps over 0.5); ${poseUnjudged} steps over the bounds the machine's`;
  if (maxExcess <= 0.5 && backward === 0 && steps > 0) pass('pose continuity', `sampler excess max ${maxExcess.toFixed(3)} m (raw step max ${maxStep.toFixed(3)} m) over ${steps} samples, backwards 0; ${delayDetail}`);
  else fail('pose continuity', `sampler excess max ${maxExcess.toFixed(3)} m (raw step max ${maxStep.toFixed(3)} m), backwards ${backward}, samples ${steps}; ${delayDetail}`);
  const eventless = welcomed.filter((client) => client.events === 0);
  const chatMissing = survivors.filter((client) => !client.chatSeen);
  if (!eventless.length && !chatMissing.length) pass('event delivery', `${welcomed.reduce((s, c) => s + c.events, 0)} events, chat to every survivor`);
  else fail('event delivery', `${eventless.length} clients without events, ${chatMissing.length} without the chat`);
  if (stats.backpressureCloses === 0 && survivors.every((client) => !client.closed)) pass('no backpressure closes', `dropped snapshots ${stats.droppedSnapshots}`);
  else fail('no backpressure closes', `closes ${stats.backpressureCloses}, survivors closed ${survivors.filter((c) => c.closed).length}`);
  // in-process, the ticks a starved interval preempted are not judged (their wall cost is the machine's)
  const tickCosts = loop ? { p95: quantile(judged.tickCosts, 0.95), p50: quantile(judged.tickCosts, 0.5), max: Math.max(0, ...judged.tickCosts) } : stats.tickMs;
  const tickDetail = loop ? `; ${judged.tickCosts.length} ticks judged, ${judged.ticksUnjudged} preempted (all ticks p95 ${stats.tickMs.p95.toFixed(2)} ms)` : '';
  if (loop && judged.tickCosts.length < MIN_JUDGED_TICKS) starved('server tick p95', `${judged.tickCosts.length} ticks judged, ${judged.ticksUnjudged} preempted`);
  else if (tickCosts.p95 <= TICK_BUDGET_MS) pass('server tick p95', `${tickCosts.p95.toFixed(2)} ms (p50 ${tickCosts.p50.toFixed(2)}, max ${tickCosts.max.toFixed(2)})${tickDetail}`);
  else fail('server tick p95', `${tickCosts.p95.toFixed(2)} ms > ${TICK_BUDGET_MS}${tickDetail}`);
  if (durationS >= 60 && rssSamples.length >= 2) {
    const first = rssSamples[0], lastRss = rssSamples.at(-1);
    const drift = (lastRss - first) / first;
    if (Math.abs(drift) < 0.1) pass('memory stable', `server rss ${(first / 1048576).toFixed(0)} -> ${(lastRss / 1048576).toFixed(0)} MB (${(drift * 100).toFixed(1)} % from 30 s, after forced gc)`);
    else fail('memory stable', `server rss drift ${(drift * 100).toFixed(1)} % (${(first / 1048576).toFixed(0)} -> ${(lastRss / 1048576).toFixed(0)} MB)`);
  } else pass('memory stable', `skipped (run < 60 s), server rss ${((await server.memory()) / 1048576).toFixed(0)} MB`);
  // in-process, a window is judged on the loop's own timeline: every tick it was due is run or dropped, and a drop is the
  // server's only past the ticks its gap's starved ms account for (matched by the loop's drop counter). A wall-clock
  // count came up short under load: starvation inside the loop's last batch left it owing ticks at the window's end.
  const machineTicksIn = (window) => (loop ? judged.stalls : [])
    .filter((stall) => stall.droppedAfter > window.droppedFrom && stall.droppedAfter <= window.droppedTo)
    .reduce((sum, stall) => sum + stall.machineTicks, 0);
  const timelineShare = (window) => (window.ticks + machineTicksIn(window)) / Math.max(1, window.ticks + window.droppedTo - window.droppedFrom);
  if (!departure) fail('half leave, no stall', 'the departures never ran');
  else {
    const machineTicks = machineTicksIn(departure);
    const due = departure.ticks + departure.droppedTo - departure.droppedFrom;
    // 110 of the 120 ticks of 2 s: in-process, that share of the ticks due
    const ran = loop ? Math.round(timelineShare(departure) * 120) : departure.ticks;
    const leaveStalls = judged.stalls.filter((stall) => stall.atMs >= departure.fromMs && !planted(stall.startMs, stall.atMs));
    const stallsAfter = loop ? leaveStalls.filter((stall) => serverDropped(stall) > 0).length : stats.loop.stalls - departure.stallsBefore;
    const leaveDetail = loop
      ? `${departure.ticks} ticks run and ${machineTicks} taken by the machine of ${due} due in the 2 s after ${Math.floor(clientCount / 2)} departures (${ran} of 120), stalls ${stallsAfter} (${leaveStalls.length - stallsAfter} more the machine's)`
      : `${departure.ticks} ticks in the 2 s after ${Math.floor(clientCount / 2)} departures, stalls ${stallsAfter}`;
    if (ran >= 110 && stallsAfter === 0) pass('half leave, no stall', leaveDetail);
    else fail('half leave, no stall', leaveDetail);
  }
  const creatorGone = clients[0].killed && final.clients.every((entry) => entry.playerId !== 'c0');
  if (creatorGone && stats.phase === 'playing' && !stats.verdict) pass('creator killed, match runs', `tick ${stats.tick}, phase ${stats.phase}`);
  else fail('creator killed, match runs', `phase ${stats.phase}, verdict ${stats.verdict}, creator present ${!creatorGone}`);
  // in-process, a second's rate is its timeline share at 60 Hz, and the timeline itself must keep up with the wall clock
  // (ticks run and dropped over the measured run: a loop that ticked slow without dropping fails here)
  const windowRate = (window) => (loop ? timelineShare(window) * TICK_HZ : window.ticks / ((window.toMs - window.fromMs) / 1000));
  const rateJudged = rateWindows.filter((window) => !planted(window.fromMs, window.toMs));
  const rate = quantile(rateJudged.map(windowRate), 0.05);
  const wallRate = quantile(rateWindows.map((window) => window.ticks / ((window.toMs - window.fromMs) / 1000)), 0.05);
  const runMs = rateWindows.length ? rateWindows.at(-1).toMs - rateWindows[0].fromMs : 0;
  const runDue = rateWindows.reduce((sum, window) => sum + window.ticks + window.droppedTo - window.droppedFrom, 0);
  const timelineKept = loop ? runDue / (runMs / TICK_MS) : 1;
  const machineStalls = judged.stalls.filter((stall) => serverDropped(stall) === 0).length;
  const rateDetail = `dropped ${stats.loop.droppedTicks}, stalls ${stats.loop.stalls}${loop ? ` (${machineStalls} wholly the machine's, ${judged.stalls.reduce((sum, stall) => sum + stall.machineTicks, 0)} of the dropped ticks the machine's); wall p05 ${wallRate.toFixed(1)} Hz, timeline ${(timelineKept * 100).toFixed(1)} % of the wall clock` : ''}, late wake max ${stats.loop.lateWakeupMaxMs.toFixed(0)} ms`;
  if (rate >= 57 && timelineKept >= 0.98) pass('tick rate', `p05 ${rate.toFixed(1)} Hz, ${rateDetail}`);
  else fail('tick rate', `p05 ${rate.toFixed(1)} Hz, ${rateDetail}`);
  // the negative control: the planted stall spent its CPU, so the ticks it dropped are the server's
  if (plantStall) {
    const plantStalls = judged.stalls.filter((stall) => planted(stall.startMs, stall.atMs));
    const plantDropped = plantStalls.reduce((sum, stall) => sum + serverDropped(stall), 0);
    const plantWindow = rateWindows.find((window) => planted(window.fromMs, window.toMs));
    const plantDetail = plant
      ? `${PLANT_STALL_CPU_MS} ms of CPU in tick ${plant.tick} (${(plant.endMs - plant.startMs).toFixed(0)} ms wall): ${plantDropped} ticks dropped by the server (${PLANT_MIN_DROPPED} at least), ${plantStalls.reduce((sum, stall) => sum + stall.machineTicks, 0)} by the machine; its second ${plantWindow ? `${windowRate(plantWindow).toFixed(1)} Hz` : 'missing'}`
      : 'never planted';
    if (plant && plantDropped >= PLANT_MIN_DROPPED) pass('negative control', plantDetail);
    else fail('negative control', plantDetail);
  }
  const meterSummary = meter.summary();
  console.log(`[mp-soak] starvation: this thread lost ${meterSummary.starvedMs.toFixed(0)} ms in ${meterSummary.starvedIntervals} of ${meterSummary.intervals} intervals (longest ${meterSummary.longestMs.toFixed(0)} ms)`);

  // ------------------------------------------------------------ table
  const egress = stats.bytesOut / clientCount / durationS / 1024;
  console.log('\n[mp-soak] gate                          result  detail');
  for (const gate of gates) console.log(`[mp-soak] ${gate.name.padEnd(30)} ${gate.starved ? 'STARVED' : gate.ok ? 'PASS   ' : 'FAIL   '}  ${gate.detail}`);
  console.log(`[mp-soak] snapshots ${stats.snapshots} (keyframes ${stats.keyframes}), events ${stats.events}, egress ${egress.toFixed(1)} KB/s per client, ingress ${(stats.bytesIn / clientCount / durationS / 1024).toFixed(1)} KB/s per client`);
  console.log(`[mp-soak] lag compensation: ${stats.lagComp.rewoundShots} rewound shots, reticle mismatch removed mean ${stats.lagComp.mismatchMeanM.toFixed(2)} m max ${stats.lagComp.mismatchMaxM.toFixed(2)} m; rewind ${quantile(final.clients.map((c) => c.rewindTicks), 0.5)} ticks median, buffer ${quantile(final.clients.map((c) => c.bufferTicks), 0.5)} ticks median, margin ${quantile(final.clients.map((c) => c.inputMargin ?? 0), 0.5)}`);
  const errorSummary = new Map();
  for (const client of clients) for (const error of client.errors) errorSummary.set(error, (errorSummary.get(error) || 0) + 1);
  if (errorSummary.size) console.log(`[mp-soak] client errors: ${[...errorSummary].map(([k, v]) => `${k}x${v}`).join(' ')}`);

  let tickCostOk = true;
  if (runTickCost) {
    console.log('\n[mp-soak] tick cost with 28 bots on the heaviest maps (server/match/tickCost.selftest.mjs):');
    const child = spawn(process.execPath, [fileURLToPath(new URL('../server/match/tickCost.selftest.mjs', import.meta.url))], { stdio: 'inherit' });
    const code = await new Promise((resolve) => child.on('close', resolve));
    tickCostOk = code === 0;
    console.log(`[mp-soak] tick cost receipt exit=${code}`);
  }

  for (const client of clients) { try { client.socket.close(); } catch { /* closing */ } }
  await server.close();
  const failed = gates.filter((gate) => !gate.ok);
  if (failed.length || !tickCostOk) {
    console.log(`[mp-soak] FAILED: ${failed.map((gate) => gate.name).join(', ')}${tickCostOk ? '' : ', tick cost'}`);
    process.exit(1);
  }
  console.log('[mp-soak] all gates passed');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
