// The match timeline stays on the wall's grid through a server stall (267, Main: a stall over ~1 s froze real players'
// tanks for 10-30 s). The loop kept its ticks contiguous through a drop, so server time (tick * TICK_MS, every stamp)
// fell behind the wall by the drop; the clients' clocks, slewing at 50 ms/s, aimed their controls up to seconds ahead,
// past the server's input ring, and nothing was applied until they came back. Here a seat driven by the real client's
// clock and input stream (src/mp/match/clock.ts and inputStream.ts, fed as matchClient.ts feeds them) rides server
// stalls of 1.0, 1.7 and 3.2 s, its frames held while the server is stalled and read after its wake (the timer first, as
// Node orders them) or before it (the PONG then stamps the timeline's time, and leads are taken over the tick due, not
// the last tick run): the server's time stays the wall's, the client's clock never resyncs, no frame is refused, and the
// seat never brakes longer than one snapshot interval. Negative control: the clock a drop used to leave (the client 1.7 s
// ahead) has its frames refused and the seat braking for seconds.
// First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { MESSAGE_TYPE, NO_TICK, PROTOCOL_VERSION, SNAPSHOT_HZ, TICK_HZ } from '../../src/mp/wire/constants.ts';
import { applySnapshotPacket, decodeMessage, encodeMessage } from '../../src/mp/wire/codec.ts';
import { ServerClock, TickClock, TimeUnwrapper } from '../../src/mp/match/clock.ts';
import { InputStream } from '../../src/mp/match/inputStream.ts';
import { ensureAuthorityFleet } from '../../src/vehicles/authorityFleet.ts';
import { createLoopbackLink } from './link.ts';
import { createMatchActor } from './matchActor.ts';

await ensureAuthorityFleet();

const TICK_MS = 1000 / TICK_HZ;
const SNAPSHOT_TICKS = TICK_HZ / SNAPSHOT_HZ;
const PING_EVERY_MS = 250;
const DRIVE = { throttle: 1, steer: 0, brake: false, fire: false, aimLocked: true, aimYaw: 0, aimPitch: 0, aimDistance: 300, shellSlot: 0, actionPresses: 0 };
let nowMs = 10_000;
const now = () => nowMs;
const flush = () => new Promise((resolve) => setImmediate(resolve));
// an opposing seat keeps the match playing (one side alone has already won)
const seats = [
  { seat: 0, playerId: 'p1', name: 'One', team: 'alpha', specId: 'm1a1_abrams_hc' },
  { seat: 1, playerId: 'p2', name: 'Two', team: 'bravo', specId: 't90am' },
];

/** One seat's client: the real clock and input stream; `held` keeps its frames while the server is stalled. */
function attachClient(actor, { plantAheadMs = 0 } = {}) {
  const link = createLoopbackLink('p1');
  const serverClock = new ServerClock();
  const tickClock = new TickClock(TICK_HZ);
  const unwrap = new TimeUnwrapper();
  const stream = new InputStream();
  const pings = new Map();
  const history = new Map();
  const client = { held: null, snapshots: [], ackTick: NO_TICK, serverClock, frames: 0 };
  const send = (message) => {
    const bytes = encodeMessage(message);
    if (client.held) client.held.push(bytes);
    else link.client.send(bytes);
  };
  const helloAtMs = nowMs;
  link.client.onMessage((bytes) => {
    const decoded = decodeMessage(bytes, { resolveBaseline: (tick) => history.get(tick) ?? null });
    assert.ok(decoded.ok, decoded.ok ? '' : decoded.error.code);
    const message = decoded.message;
    if (message.type === MESSAGE_TYPE.WELCOME) {
      const serverTimeMs = unwrap.unwrap(message.serverTimeMs);
      tickClock.observe(message.serverTick, serverTimeMs);
      serverClock.observePong(helloAtMs, nowMs, serverTimeMs);
      // the control: the offset a drop used to leave, which the clock then slews back from at 50 ms/s
      if (plantAheadMs) serverClock.seed(serverTimeMs + plantAheadMs, nowMs);
      const startTick = Math.floor(tickClock.tickAt(serverClock.serverNow(nowMs))) + stream.lead + 1;
      stream.start(Math.max(message.serverTick, startTick));
    } else if (message.type === MESSAGE_TYPE.PONG) {
      const sentAtMs = pings.get(message.clientTimeMs);
      if (sentAtMs === undefined) return;
      pings.delete(message.clientTimeMs);
      serverClock.observePong(sentAtMs, nowMs, unwrap.unwrap(message.serverTimeMs));
    } else if (message.type === MESSAGE_TYPE.CLOSE) {
      client.closed = message;
    } else if (message.type === MESSAGE_TYPE.SNAPSHOT) {
      const frame = applySnapshotPacket(message, message.keyframe ? null : history.get(message.baseTick) ?? null);
      history.set(frame.tick, frame);
      const serverTimeMs = unwrap.unwrap(frame.serverTimeMs);
      client.snapshots.push({ tick: frame.tick, serverTimeMs, atMs: nowMs });
      tickClock.observe(frame.tick, serverTimeMs);
      stream.acknowledge(frame, nowMs);
      client.ackTick = frame.tick;
      send({ type: MESSAGE_TYPE.SNAPSHOT_ACK, tick: frame.tick });
    }
  });
  /** One display frame, as matchClient.sampleInputs and maintainPings run it. */
  client.frame = () => {
    if (!stream.isStarted) return;
    serverClock.advance(nowMs);
    const target = tickClock.tickAt(serverClock.serverNow(nowMs) + (serverClock.rttMs ?? 0) / 2) + stream.lead;
    const due = stream.dueTicks(target, 4, 8);
    for (let index = 0; index < due; index++) stream.sample(DRIVE);
    if (due > 0) {
      const message = stream.frame(client.ackTick, 100);
      if (message) { send(message); client.frames++; }
    }
    if (nowMs - (client.lastPingMs ?? -Infinity) >= PING_EVERY_MS) {
      const key = (client.pingKey = (client.pingKey ?? 0) + 1);
      pings.set(key, nowMs);
      client.lastPingMs = nowMs;
      send({ type: MESSAGE_TYPE.PING, clientTimeMs: key, snapshotAckTick: client.ackTick });
    }
  };
  client.release = () => {
    const held = client.held ?? [];
    client.held = null;
    for (const bytes of held) link.client.send(bytes);
    return held.length;
  };
  const hello = { type: MESSAGE_TYPE.HELLO, protocolVersion: PROTOCOL_VERSION, capabilities: 1, token: 'x', clientBuild: 'stall-timeline' };
  actor.attach(link.server, hello, { v: 1, roomId: actor.roomId, seat: 0, playerId: 'p1', name: 'p1', team: 'alpha', specId: 'm1a1_abrams_hc', iat: 0, exp: 1 });
  return client;
}

const seatInput = (actor, client) => {
  assert.equal(client.closed, undefined, `the seat was closed: ${JSON.stringify(client.closed)}`);
  assert.equal(actor.stopped, false, `the match stopped (${actor.authority.phase})`);
  return actor.clientStats()[0].input;
};

/** Server time less the wall at the newest snapshot (the actor's stamps against the fake clock that drives it). */
const stampOffset = (client) => { const last = client.snapshots.at(-1); return last.serverTimeMs - last.atMs; };

async function run(actor, client, ms, offsets) {
  for (const end = nowMs + ms; nowMs < end;) {
    nowMs += TICK_MS;
    client.frame();
    actor.advance(nowMs);
    await flush();
    if (offsets && client.snapshots.at(-1)?.atMs === nowMs) offsets.push(stampOffset(client));
  }
}

/** A server stall of `ms`: the client runs on, its frames held; the server wakes and reads them, timer or I/O first. */
async function stall(actor, client, ms, order) {
  client.held = [];
  const end = nowMs + ms;
  while (nowMs + TICK_MS < end) { nowMs += TICK_MS; client.frame(); }
  nowMs = end;
  let held;
  if (order === 'timer') { actor.advance(nowMs); held = client.release(); }
  else { held = client.release(); await flush(); actor.advance(nowMs); }
  await flush();
  return held;
}

for (const order of ['timer', 'io']) {
  const actor = createMatchActor({ roomId: `stall-${order}`, mapId: 'verdant', seed: 7, seats, world: 'terrain', countdownS: 0, now, schedule: () => () => {} });
  const client = attachClient(actor);
  const offsets = [];
  await run(actor, client, 2000, offsets);
  const rows = [];
  for (const ms of [1000, 1700, 3200]) {
    const before = { ...seatInput(actor, client), dropped: actor.stats().loop.droppedTicks, tick: actor.tick };
    const held = await stall(actor, client, ms, order);
    const woke = { ...seatInput(actor, client), tick: actor.tick };
    await run(actor, client, 2000, offsets);
    const after = { ...seatInput(actor, client), dropped: actor.stats().loop.droppedTicks };
    rows.push({ ms, held, droppedTicks: after.dropped - before.dropped, refusedAtWake: woke.refused - before.refused,
      refusedAfter: after.refused - woke.refused, longestDry: after.longestDry });
    assert.equal(after.refused - woke.refused, 0, `${order} ${ms} ms: a frame sent after the stall was refused`);
    assert.ok(after.longestDry <= SNAPSHOT_TICKS, `${order} ${ms} ms: the seat braked ${after.longestDry} ticks (one snapshot interval is ${SNAPSHOT_TICKS})`);
    assert.equal(woke.refused - before.refused, 0, `${order} ${ms} ms: frames held through the stall were refused`);
  }
  const spread = Math.max(...offsets) - Math.min(...offsets);
  assert.ok(spread <= 2 * TICK_MS, `${order}: server time stays the wall's through the stalls (stamps less the wall spread ${spread.toFixed(1)} ms)`);
  assert.equal(client.serverClock.hardResyncs, 0, `${order}: the client's clock never resynced`);
  const lead = Math.abs(client.serverClock.serverNow(nowMs) - (client.snapshots.at(-1).serverTimeMs + (nowMs - client.snapshots.at(-1).atMs)));
  assert.ok(lead <= 2 * TICK_MS, `${order}: the client's server time is the server's (${lead.toFixed(1)} ms off)`);
  console.log(`stallTimeline.selftest (${order} first): ${rows.map((row) => `${row.ms} ms stall dropped ${row.droppedTicks} ticks, `
    + `${row.refusedAtWake} of ${row.held} held frames refused at the wake, ${row.refusedAfter} after, longest brake ${row.longestDry}`).join('; ')}; `
    + `stamps less the wall within ${spread.toFixed(1)} ms; no clock resync`);
  actor.stop();
}

// ---- negative control: a client 1.7 s ahead (the clock a drop used to leave) is refused and its tank brakes for seconds
{
  const actor = createMatchActor({ roomId: 'stall-control', mapId: 'verdant', seed: 7, seats, world: 'terrain', countdownS: 0, now, schedule: () => () => {} });
  const client = attachClient(actor, { plantAheadMs: 1700 });
  await run(actor, client, 3000);
  const input = seatInput(actor, client);
  assert.ok(input.refused >= 60, `control: the frames 1.7 s ahead are refused (${input.refused})`);
  assert.ok(input.dry >= 60, `control: the seat brakes for seconds (${input.dry} ticks)`);
  console.log(`stallTimeline.selftest: control, a client 1.7 s ahead: ${input.refused} frames refused, ${input.dry} braking ticks in 3 s`);
  actor.stop();
}
