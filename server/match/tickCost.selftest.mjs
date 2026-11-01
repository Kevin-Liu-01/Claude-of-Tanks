import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../../src/vehicles/tankFactory.ts';
import { ALL_TANK_IDS, getSpec } from '../../src/vehicles/specs.ts';
import { MESSAGE_TYPE, PROTOCOL_VERSION } from '../../src/mp/wire/constants.ts';
import { encodeMessage, peekMessageType } from '../../src/mp/wire/codec.ts';
import { createLoopbackLink } from './link.ts';
import { createMatchActor } from './matchActor.ts';
import { threadCpuMs } from '../../tools/starvation-meter.mjs';

// The charter's phase-1 gate: 28 bots (14v14) on the six heaviest maps of the
// round-59 perf table (by cpuP95Max) plus the map with the most collision
// parts, dedicated collision shards, 60 Hz fixed steps; tick p95 <= 6 ms.
// Measured twice per map: headless (authority + pose history only) and with
// 28 spectator viewers attached (the full 30 Hz per-viewer publish path).
// (267, the load1 class) A tick's cost is the CPU this thread spent on it (tools/starvation-meter.mjs threadCpuMs): the
// wall time around it also holds what a loaded machine withheld (load 74-82 read p95 8.76 ms on a tree that measures 3-4
// quiet, and the old receipt only reported above 1.5x the CPUs). The budget is asserted at any load, on CPU; the wall
// p95 is reported beside it. A planted control proves the clock: ticks blocked without CPU are not charged, ticks that
// spend it are.
const table = JSON.parse(readFileSync(new URL('../../docs/references/perf/round59-map-perf-audit.json', import.meta.url), 'utf8'));
const heaviest = Object.entries(table.maps)
  .map(([id, rows]) => ({ id, cpuP95Max: rows.main.cpuP95Max }))
  .sort((a, b) => b.cpuP95Max - a.cpuP95Max)
  .slice(0, 6)
  .map((row) => row.id);
const shards = JSON.parse(readFileSync(new URL('../world-collision-manifests/index.json', import.meta.url), 'utf8'));
const mostParts = Object.entries(shards.maps)
  .map(([id, entry]) => ({ id, parts: entry.obstacles + entry.colliders }))
  .sort((a, b) => b.parts - a.parts)[0].id;
const maps = [...new Set([...heaviest, mostParts])];
const specs = ALL_TANK_IDS.filter((id) => ['mbt', 'medium', 'heavy', 'light'].includes(getSpec(id).role)).slice(0, 14);
assert.equal(specs.length, 14);

const TICK_MS = 1000 / 60;
const WARM_TICKS = 120;
const MEASURE_TICKS = 600;
const BUDGET_MS = 6;
const rows = [];
const flush = () => new Promise((resolve) => setImmediate(resolve));
const quantile = (values, q) => values.slice().sort((a, b) => a - b)[Math.min(values.length - 1, Math.max(0, Math.ceil(q * values.length) - 1))];
// each tick's CPU and wall time, `plant(tick)` run inside the authority's step (the negative control's seam)
async function measureTicks(actor, clock, ticks, plant = null) {
  const step = actor.authority.step;
  let tick = 0;
  if (plant) actor.authority.step = function plantedStep(...args) { plant(tick); return step.apply(this, args); };
  const cpu = [], wall = [];
  try {
    for (; tick < ticks; tick++) {
      clock.nowMs += TICK_MS;
      const cpuFrom = threadCpuMs(), wallFrom = performance.now();
      actor.advance(clock.nowMs);
      wall.push(performance.now() - wallFrom);
      cpu.push(threadCpuMs() - cpuFrom);
      if (tick % 60 === 0) await flush();
    }
  } finally { actor.authority.step = step; }
  return { cpu, wall };
}

for (const mapId of maps) {
  for (const viewers of [0, 28]) {
    let nowMs = 0;
    const bots = [];
    for (let index = 0; index < 28; index++) {
      bots.push({ playerId: `bot-${index}`, name: `Bot ${index}`, team: index < 14 ? 'alpha' : 'bravo', specId: specs[index % 14] });
    }
    const seats = [];
    for (let index = 0; index < viewers; index++) seats.push({ seat: index, playerId: `viewer-${index}`, name: `Viewer ${index}`, team: 'spectator', specId: '' });
    const loaded = performance.now();
    const actor = createMatchActor({
      roomId: `tick-${mapId}-${viewers}`, mapId, seed: 1337, countdownS: 0, seats, bots, world: 'dedicated',
      now: () => nowMs, schedule: () => () => {},
    });
    const loadMs = performance.now() - loaded;
    const links = [];
    for (let index = 0; index < viewers; index++) {
      const link = createLoopbackLink(`viewer-${index}`);
      // a viewer that acknowledges every snapshot it receives (the delta path, as a real client would)
      link.client.onMessage((bytes) => {
        if (peekMessageType(bytes) !== MESSAGE_TYPE.SNAPSHOT) return;
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        link.client.send(encodeMessage({ type: MESSAGE_TYPE.SNAPSHOT_ACK, tick: view.getUint32(2, true) }));
      });
      const hello = { type: MESSAGE_TYPE.HELLO, protocolVersion: PROTOCOL_VERSION, capabilities: 0, token: '', clientBuild: 'tick' };
      assert.ok(actor.attach(link.server, hello, { v: 1, roomId: actor.roomId, seat: index, playerId: `viewer-${index}`, name: 'v', team: 'spectator', specId: '', iat: 0, exp: 1 }));
      links.push(link);
    }
    for (let tick = 0; tick < WARM_TICKS; tick++) { nowMs += TICK_MS; actor.advance(nowMs); }
    const measured = { nowMs };
    const { cpu, wall } = await measureTicks(actor, measured, MEASURE_TICKS);
    const stats = actor.stats();
    const egressKBps = viewers ? stats.bytesOut / viewers / (MEASURE_TICKS / 60) / 1024 : 0;
    rows.push({ mapId, viewers, loadMs: Math.round(loadMs), p50: quantile(cpu, 0.5), p95: quantile(cpu, 0.95), max: Math.max(...cpu),
      mean: cpu.reduce((sum, ms) => sum + ms, 0) / cpu.length, wallP95: quantile(wall, 0.95), egressKBps, events: stats.events,
      alive: actor.authority.entities.filter((entity) => !entity.combat.destroyed).length });
    actor.stop();
  }
}

console.log('tickCost.selftest: 28 bots (14v14), 720 ticks per map (120 warm-up), dedicated collision shards');
console.log('map            viewers  load ms  CPU ms: p50  p95  max  mean  wall p95  egress KB/s/viewer  alive');
for (const row of rows) {
  console.log(`${row.mapId.padEnd(14)} ${String(row.viewers).padStart(7)}  ${String(row.loadMs).padStart(7)}  ${row.p50.toFixed(2).padStart(10)}  ${row.p95.toFixed(2).padStart(5)}  ${row.max.toFixed(2).padStart(5)}  ${row.mean.toFixed(2).padStart(5)}  ${row.wallP95.toFixed(2).padStart(8)}  ${row.egressKBps.toFixed(1).padStart(18)}  ${String(row.alive).padStart(5)}`);
}
const worstHeadless = Math.max(...rows.filter((row) => row.viewers === 0).map((row) => row.p95));
const worstViewers = Math.max(...rows.filter((row) => row.viewers === 28).map((row) => row.p95));
const worstWall = Math.max(...rows.map((row) => row.wallP95));
console.log(`tickCost.selftest: worst CPU p95 headless ${worstHeadless.toFixed(2)} ms, with 28 viewers ${worstViewers.toFixed(2)} ms (budget ${BUDGET_MS} ms; wall p95 up to ${worstWall.toFixed(2)} ms)`);
assert.ok(worstHeadless <= BUDGET_MS, `28-bot tick p95 must stay within ${BUDGET_MS} ms of CPU (${worstHeadless.toFixed(2)})`);
assert.ok(worstViewers <= BUDGET_MS, `28-bot tick p95 with 28 viewers must stay within ${BUDGET_MS} ms of CPU (${worstViewers.toFixed(2)})`);

// The negative control, on the lightest of the maps, headless: in one stretch a fifth of the ticks block PLANT_MS
// without CPU inside the authority's step (a stand-in for the machine taking the thread), in the next a fifth spend
// PLANT_MS of CPU there (a stall the server causes). The first must not be charged, the second must.
const PLANT_MS = 10;
const PLANT_TICKS = 200;
{
  const mapId = rows.filter((row) => row.viewers === 0).sort((a, b) => a.p95 - b.p95)[0].mapId;
  const bots = Array.from({ length: 28 }, (_, index) => ({ playerId: `bot-${index}`, name: `Bot ${index}`, team: index < 14 ? 'alpha' : 'bravo', specId: specs[index % 14] }));
  const clock = { nowMs: 0 };
  const actor = createMatchActor({ roomId: `tick-plant-${mapId}`, mapId, seed: 1337, countdownS: 0, seats: [], bots, world: 'dedicated',
    now: () => clock.nowMs, schedule: () => () => {} });
  for (let tick = 0; tick < WARM_TICKS; tick++) { clock.nowMs += TICK_MS; actor.advance(clock.nowMs); }
  const blockedOn = new Int32Array(new SharedArrayBuffer(4));
  const blocked = await measureTicks(actor, clock, PLANT_TICKS, (tick) => { if (tick % 5 === 0) Atomics.wait(blockedOn, 0, 0, PLANT_MS); });
  const busy = await measureTicks(actor, clock, PLANT_TICKS, (tick) => {
    if (tick % 5 !== 0) return;
    const from = threadCpuMs();
    while (threadCpuMs() - from < PLANT_MS) { /* the server's own stall: CPU */ }
  });
  actor.stop();
  const blockedCpu = quantile(blocked.cpu, 0.95), blockedWall = quantile(blocked.wall, 0.95), busyCpu = quantile(busy.cpu, 0.95);
  console.log(`tickCost.selftest: negative control on ${mapId}: blocked ${PLANT_MS} ms in a fifth of the ticks, CPU p95 ${blockedCpu.toFixed(2)} ms (wall ${blockedWall.toFixed(2)}); spinning ${PLANT_MS} ms, CPU p95 ${busyCpu.toFixed(2)} ms`);
  assert.ok(blockedWall >= PLANT_MS && blockedCpu < busyCpu - PLANT_MS / 2, 'a tick blocked without CPU is not charged');
  assert.ok(busyCpu >= PLANT_MS && busyCpu > BUDGET_MS, 'a tick that spends the CPU is charged');
}
