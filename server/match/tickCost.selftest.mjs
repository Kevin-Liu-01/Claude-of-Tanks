import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../../src/vehicles/tankFactory.ts';
import { ALL_TANK_IDS, getSpec } from '../../src/vehicles/specs.ts';
import { MESSAGE_TYPE, PROTOCOL_VERSION } from '../../src/mp/wire/constants.ts';
import { encodeMessage, peekMessageType } from '../../src/mp/wire/codec.ts';
import { createLoopbackLink } from './link.ts';
import { createMatchActor } from './matchActor.ts';

// The charter's phase-1 gate: 28 bots (14v14) on the six heaviest maps of the
// round-59 perf table (by cpuP95Max) plus the map with the most collision
// parts, dedicated collision shards, 60 Hz fixed steps; tick p95 <= 6 ms.
// Measured twice per map: headless (authority + pose history only) and with
// 28 spectator viewers attached (the full 30 Hz per-viewer publish path).
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
    actor.loop.tickCost.reset();
    let shots = 0;
    for (let tick = 0; tick < MEASURE_TICKS; tick++) {
      nowMs += TICK_MS;
      actor.advance(nowMs);
      if (tick % 60 === 0) await flush();
    }
    const stats = actor.stats();
    shots = stats.events;
    const summary = actor.loop.tickCost.summary();
    const egressKBps = viewers ? stats.bytesOut / viewers / (MEASURE_TICKS / 60) / 1024 : 0;
    rows.push({ mapId, viewers, loadMs: Math.round(loadMs), p50: summary.p50, p95: summary.p95, max: summary.max, mean: summary.mean, egressKBps, events: shots, alive: actor.authority.entities.filter((entity) => !entity.combat.destroyed).length });
    actor.stop();
  }
}

console.log('tickCost.selftest: 28 bots (14v14), 720 ticks per map (120 warm-up), dedicated collision shards');
console.log('map            viewers  load ms  p50 ms  p95 ms  max ms  mean ms  egress KB/s/viewer  alive');
for (const row of rows) {
  console.log(`${row.mapId.padEnd(14)} ${String(row.viewers).padStart(7)}  ${String(row.loadMs).padStart(7)}  ${row.p50.toFixed(2).padStart(6)}  ${row.p95.toFixed(2).padStart(6)}  ${row.max.toFixed(2).padStart(6)}  ${row.mean.toFixed(2).padStart(7)}  ${row.egressKBps.toFixed(1).padStart(18)}  ${String(row.alive).padStart(5)}`);
}
const worstHeadless = Math.max(...rows.filter((row) => row.viewers === 0).map((row) => row.p95));
const worstViewers = Math.max(...rows.filter((row) => row.viewers === 28).map((row) => row.p95));
console.log(`tickCost.selftest: worst p95 headless ${worstHeadless.toFixed(2)} ms, with 28 viewers ${worstViewers.toFixed(2)} ms (budget ${BUDGET_MS} ms)`);
assert.ok(worstHeadless <= BUDGET_MS, `28-bot tick p95 must stay within ${BUDGET_MS} ms (${worstHeadless.toFixed(2)})`);
assert.ok(worstViewers <= BUDGET_MS, `28-bot tick p95 with 28 viewers must stay within ${BUDGET_MS} ms (${worstViewers.toFixed(2)})`);
