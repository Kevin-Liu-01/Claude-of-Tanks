#!/usr/bin/env node
/**
 * Replay design measurement (replay-system lane, 2026-11-22; docs/REPLAY.md). Node-only, no renderer, no browser.
 *
 * Plays one battle on the shared authority (src/sim/authoritativeMatch.ts) with scripted human seats and bots, and
 * RECORDS it the way the replay design does: the match setup, every human seat's step input as given (delta-coded per
 * field), and the event log. Then REPLAYS the recording alone (a fresh match, inputs decoded from the bytes) and
 * compares a state digest every `every` ticks. Reports bytes (raw, gzip), the recorder's cost per tick next to the
 * step's, and the first diverging tick.
 *
 *   node tools/replay-measure.mjs                             # verdant, 1 human + 13 bots, 7 min
 *   node tools/replay-measure.mjs --humans=2 --bots=12 --ticks=3600 --map=alpine --mode=standard
 */
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import '../src/vehicles/tankFactory.ts';
import { createAuthoritativeMatch } from '../src/sim/authoritativeMatch.ts';
import { SIM_DT } from '../src/sim/movement.ts';
import { createDedicatedWorldCollision } from '../server/dedicatedWorldCollision.ts';
import { quantizeAngle, dequantizeAngle, quantizeAimPitch, dequantizeAimPitch, quantizeAimDistance, dequantizeAimDistance, quantizeControlAxis, dequantizeControlAxis } from '../src/mp/wire/quantize.ts';

const arg = (name, fallback) => { const hit = process.argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const mapId = arg('map', 'verdant');
const gameMode = arg('mode', 'standard');
const ticks = Number(arg('ticks', 60 * 60 * 7));
const seed = Number(arg('seed', 7));
const humans = Number(arg('humans', 1));
const bots = Number(arg('bots', 13));
const every = Number(arg('every', 60));
// --quantize: the human's controls pass the wire's quantization before the step (as a room's remote seat's do), and the
// recorder keeps the integer units as zigzag varint deltas.
const quantize = process.argv.includes('--quantize');
const Q = { throttle: [quantizeControlAxis, dequantizeControlAxis], steer: [quantizeControlAxis, dequantizeControlAxis],
  aimYaw: [quantizeAngle, dequantizeAngle], aimPitch: [quantizeAimPitch, dequantizeAimPitch], aimDistance: [quantizeAimDistance, dequantizeAimDistance] };
function quantized(input) { if (!quantize) return input; const out = { ...input }; for (const k in Q) out[k] = Q[k][1](Q[k][0](input[k])); return out; }
const specs = ['m1a1_abrams_hc', 't90am', 'leo2_improved'];
const diffs = ['easy', 'normal', 'hard'];

// A human's mouse-and-keys stream: aim moves every tick, keys change a few times a second, fires every 4 s.
function humanInput(index, tick) {
  const t = tick + index * 97;
  return {
    throttle: t > 120 ? (t % 1400 < 1100 ? 1 : 0.2) : 0,
    steer: Math.round(Math.sin(t / 240) * 3) / 3,
    brake: false,
    fire: t % 240 === 0 && t > 200,
    fireIntentSeq: t % 240 === 0 && t > 200 ? Math.floor(t / 240) : null,
    aimLocked: false,
    shellSlot: 0,
    actionBits: 0,
    aimYaw: Math.sin(t / 400) * 1.2 + Math.sin(t / 37) * 0.01,
    aimPitch: 0.02 + Math.sin(t / 90) * 0.005,
    aimDistance: 300,
  };
}

function setup() {
  const players = [];
  for (let i = 0; i < humans; i++) players.push({ id: `h${i + 1}`, specId: specs[i % 3], team: i % 2 ? 'bravo' : 'alpha' });
  for (let i = 0; i < bots; i++) players.push({ id: `b${i + 1}`, specId: specs[(i + 1) % 3], team: (humans + i) % 2 ? 'bravo' : 'alpha', bot: true, difficulty: diffs[i % 3] });
  return { v: 1, mapId, gameMode, seed, countdownS: 0, players };
}

const round = (v) => Math.round(v * 1000) / 1000;
function digest(match) {
  const hash = createHash('sha256');
  for (const e of match.entities) {
    const s = e.state, c = e.combat;
    hash.update(`${e.id}|${round(s.pos.x)},${round(s.pos.y)},${round(s.pos.z)}|${round(s.yaw)}|${round(s.speed)}|${round(s.turretYaw)}|${round(s.gunPitch)}|${round(c.hp)}|${c.destroyed ? 1 : 0}|${e.kills}\n`);
  }
  const snap = match.snapshot({ tick: 0, serverTimeMs: 0, viewerId: '__replay__', ackInputSeq: null });
  for (const sh of snap.shells) hash.update(`s${sh.id} ${sh.x} ${sh.y} ${sh.z}\n`);
  hash.update(`d${JSON.stringify(snap.meta.destroyedObstacleIndices)}`);
  return hash.digest('hex').slice(0, 16);
}

// --- recorder: per tick, per human seat, a change mask then the changed fields (f64 for numbers: exact) ---
const FIELDS = ['throttle', 'steer', 'brake', 'fire', 'fireIntentSeq', 'aimLocked', 'shellSlot', 'actionBits', 'aimYaw', 'aimPitch', 'aimDistance', 'auxiliaryBits'];
class Writer {
  constructor() { this.buf = new Uint8Array(1 << 16); this.view = new DataView(this.buf.buffer); this.n = 0; }
  need(k) { if (this.n + k > this.buf.length) { const b = new Uint8Array(this.buf.length * 2); b.set(this.buf); this.buf = b; this.view = new DataView(b.buffer); } }
  u8(v) { this.need(1); this.buf[this.n++] = v; }
  u16(v) { this.need(2); this.view.setUint16(this.n, v, true); this.n += 2; }
  f64(v) { this.need(8); this.view.setFloat64(this.n, v, true); this.n += 8; }
  varint(v) { let z = v < 0 ? (-v * 2 - 1) : v * 2; do { let b = z % 128; z = Math.floor(z / 128); this.u8(z ? b | 128 : b); } while (z); }
  bytes() { return this.buf.slice(0, this.n); }
}
function encodeValue(w, v) {
  if (v === null || v === undefined) w.u8(0);
  else if (v === true) w.u8(1);
  else if (v === false) w.u8(2);
  else { w.u8(3); w.f64(v); }
}
function readVarint(r) { let v = 0, mul = 1, b; do { b = r.buf[r.n++]; v += (b & 127) * mul; mul *= 128; } while (b & 128); return v % 2 ? -(v + 1) / 2 : v / 2; }
function decodeValue(r) {
  const tag = r.buf[r.n++];
  if (tag === 0) return null; if (tag === 1) return true; if (tag === 2) return false;
  const v = r.view.getFloat64(r.n, true); r.n += 8; return v;
}

const events = [];
function play(match, inputsFor, onTick) {
  const inputs = new Map();
  const digests = [];
  let stepMs = 0;
  for (let tick = 1; tick <= ticks; tick++) {
    inputsFor(tick, inputs);
    const t0 = performance.now();
    match.step({ dt: SIM_DT, inputs });
    stepMs += performance.now() - t0;
    onTick?.(tick, inputs, match);
    match.afterEventBroadcast();
    if (tick % every === 0) digests.push(digest(match));
    if (match.result && match.resultTimeS !== null && match.timeS > match.resultTimeS + match.endingHoldS) { digests.push(`end@${tick}`); return { digests, stepMs, ticks: tick }; }
  }
  return { digests, stepMs, ticks };
}

const s = setup();
const humanIds = s.players.filter((p) => !p.bot).map((p) => p.id);

// RUN A: live battle, recorded
const worldA = createDedicatedWorldCollision(mapId, { retain: true });
const matchA = createAuthoritativeMatch({ players: s.players.map((p) => ({ ...p })), mapId, seed, countdownS: 0, gameMode, worldCollision: worldA });
matchA.onMatchReady();
const w = new Writer();
const last = new Map(humanIds.map((id) => [id, {}]));
let recordMs = 0;
let eventJson = [];
const a = play(matchA, (tick, inputs) => { for (const [i, id] of humanIds.entries()) inputs.set(id, quantized(humanInput(i, tick))); }, (tick, inputs, match) => {
  const t0 = performance.now();
  for (const id of humanIds) {
    const input = inputs.get(id), prev = last.get(id);
    let mask = 0;
    for (let f = 0; f < FIELDS.length; f++) if (!Object.is(input[FIELDS[f]], prev[FIELDS[f]])) mask |= 1 << f;
    w.u16(mask);
    for (let f = 0; f < FIELDS.length; f++) if (mask & (1 << f)) {
      const k = FIELDS[f], v = input[k];
      if (quantize && Q[k]) w.varint(Q[k][0](v) - (prev[k] === undefined ? 0 : Q[k][0](prev[k])));
      else encodeValue(w, v);
      prev[k] = v;
    }
  }
  for (const e of match.eventsForViewer('__replay__')) eventJson.push(e);
  recordMs += performance.now() - t0;
});
worldA.release?.();
const inputBytes = w.bytes();
const setupJson = JSON.stringify(s);
const eventsText = eventJson.map((e) => JSON.stringify(e)).join('\n');
const eventTypes = {};
for (const e of eventJson) eventTypes[e.type] = (eventTypes[e.type] ?? 0) + 1;

// RUN B: replay from the recording alone
const worldB = createDedicatedWorldCollision(mapId, { retain: true });
const parsed = JSON.parse(setupJson);
const matchB = createAuthoritativeMatch({ players: parsed.players, mapId: parsed.mapId, seed: parsed.seed, countdownS: parsed.countdownS, gameMode: parsed.gameMode, worldCollision: worldB });
matchB.onMatchReady();
const r = { buf: inputBytes, view: new DataView(inputBytes.buffer, inputBytes.byteOffset, inputBytes.byteLength), n: 0 };
const cur = new Map(humanIds.map((id) => [id, {}]));
const b = play(matchB, (tick, inputs) => {
  for (const id of humanIds) {
    const mask = r.view.getUint16(r.n, true); r.n += 2;
    const c = cur.get(id);
    for (let f = 0; f < FIELDS.length; f++) if (mask & (1 << f)) {
      const k = FIELDS[f];
      if (quantize && Q[k]) { const u = readVarint(r) + (c[k] === undefined ? 0 : Q[k][0](c[k])); c[k] = Q[k][1](u); continue; }
      const v = decodeValue(r); if (v === null) delete c[k]; else c[k] = v;
    }
    // a fresh object per tick, as the live stream gives (the step may keep a reference)
    inputs.set(id, { ...c, fireIntentSeq: c.fireIntentSeq ?? null });
  }
}, (tick, inputs, match) => { match.eventsForViewer('__replay__'); });
worldB.release?.();

let firstDiff = null;
for (let i = 0; i < Math.max(a.digests.length, b.digests.length); i++) if (a.digests[i] !== b.digests[i]) { firstDiff = (i + 1) * every; break; }
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const report = {
  mapId, gameMode, seed, humans, bots, quantize, ticksPlayed: a.ticks, battleS: round(a.ticks * SIM_DT),
  result: matchA.result, reason: matchA.resultReason,
  bytes: {
    setup: setupJson.length, setupGz: gzipSync(setupJson).length,
    inputs: inputBytes.length, inputsGz: gzipSync(inputBytes).length,
    events: eventsText.length, eventsGz: gzipSync(eventsText).length, eventCount: eventJson.length,
  },
  perHumanPerMinGz: kb(gzipSync(inputBytes).length / humans / (a.ticks * SIM_DT / 60)),
  totalGz: kb(gzipSync(setupJson).length + gzipSync(inputBytes).length + gzipSync(eventsText).length),
  stepMsPerTick: round(a.stepMs / a.ticks), recordMsPerTick: round(recordMs / a.ticks), recordShareOfStep: `${round(100 * recordMs / a.stepMs)}%`,
  replayIdentical: firstDiff === null, firstDiffTick: firstDiff,
  eventTypes,
};
console.log(JSON.stringify(report, null, 2));
process.exitCode = firstDiff === null ? 0 : 1;
