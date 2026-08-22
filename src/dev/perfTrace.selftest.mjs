import assert from 'node:assert/strict';
import { createDevTraceCore } from './perfTrace.js';
import { buildQaSummary, debugModeRequested } from '../ui/perfHud.js';

let clock = 1000;
const game = {
  phase: 'battle', timeS: 1, preBattleS: 0, result: null,
  player: { input: { throttle: 0.5, steer: -0.25, fire: false } },
};
const renderer = {
  info: {
    programs: [{}, {}],
    memory: { geometries: 42, textures: 17 },
    render: { frame: 1, calls: 12, triangles: 3456 },
  },
};
const actionHandlers = new Map();
const input = {
  actionDefs: [{ id: 'reload' }, { id: 'sniperToggle' }],
  onAction(id, fn) { actionHandlers.set(id, fn); },
};
const trace = createDevTraceCore({
  enabled: true, now: () => clock,
  eventCapacity: 5, frameCapacity: 8,
});
trace.configure({
  game, renderer, input,
  getContext: () => ({ cameraMode: 'CHASE', renderScale: 0.75 }),
  getTelemetry: () => ({ quality: { preset: 'mobile' } }),
});
trace.clear();

const reused = { id: 7, nested: { hp: 900 }, loop: null };
reused.loop = reused;
trace.event('tank:damaged', reused);
reused.id = 99;
reused.nested.hp = 0;
const copied = trace.tail(1, 'bus')[0];
assert.equal(copied.data.id, 7, 'bus payload is copied at emission time');
assert.equal(copied.data.nested.hp, 900);
assert.equal(copied.data.loop, '[Circular]');

actionHandlers.get('reload')('KeyR');
assert.equal(trace.tail(1, 'action')[0].name, 'reload');

clock += 16;
trace.frame(16);
clock += 16;
game.timeS += 0.016;
renderer.info.render.frame++;
trace.frame(16);

// A marked, synthetic main-thread stall must be classified as a screen freeze.
clock += 320;
trace.frame(100);
clock += 448;
trace.frame(100);
let anomalies = trace.tail(20, 'anomaly');
assert.ok(anomalies.some((row) => row.name === 'screen:freeze'));
assert.ok(anomalies.some((row) => row.name === 'sim:freeze'));
assert.ok(anomalies.some((row) => row.name === 'render:freeze'));

clock += 16;
game.timeS += 0.016;
renderer.info.render.frame++;
trace.frame(16);
anomalies = trace.tail(20, 'anomaly');
assert.ok(anomalies.some((row) => row.name === 'sim:resume'));
assert.ok(anomalies.some((row) => row.name === 'render:resume'));

for (let i = 0; i < 12; i++) trace.event(`bounded:${i}`, { i });
const stats = trace.stats();
assert.equal(stats.frames, 5);
assert.equal(stats.events, 5);
assert.ok(stats.eventsDropped > 0, 'bounded event ring reports overwritten rows');
assert.ok(stats.freezes >= 2);
assert.ok(stats.maxGapMs >= 448);

const snapshot = trace.snapshot();
assert.deepEqual(snapshot.frameSchema.slice(0, 5), ['tMs', 'gapMs', 'dtMs', 'simS', 'preBattleS']);
assert.equal(snapshot.frames[0][0], 16, 'clear resets the trace-relative clock');
assert.equal(snapshot.frames[0].length, snapshot.frameSchema.length);
const columns = Object.fromEntries(snapshot.frameSchema.map((name, i) => [name, i]));
assert.equal(snapshot.frames[0][columns.geometries], 42);
assert.equal(snapshot.frames[0][columns.textures], 17);
assert.equal(snapshot.frames[0][columns.renderScale], 0.75);
assert.equal(snapshot.telemetry.quality.preset, 'mobile');
assert.equal(trace.snapshot({ frames: false, events: false }).frames.length, 0);
const exported = JSON.parse(trace.exportJson());
assert.equal(exported?.version, 1);
const exportedWithoutFrames = JSON.parse(trace.exportJson(false, { frames: false, gpu: false }));
assert.equal(exportedWithoutFrames?.frames?.length, 0);

assert.equal(debugModeRequested('?debug=1'), true);
assert.equal(debugModeRequested('?debug=off'), false);
const qaSummary = buildQaSummary({
  capturedAt: '2026-08-22T00:00:00.000Z', traceStats: { frames: 120 },
  hudSnapshot: { stats: { fps: 55.5 }, telemetry: { quality: { preset: 'mobile' } } },
});
assert.equal(qaSummary.trace.frames, 120);
assert.equal(qaSummary.frame.fps, 55.5);
assert.equal(qaSummary.telemetry.quality.preset, 'mobile');

console.log('perfTrace selftest: pass');
