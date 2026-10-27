// The battle spike census's analysis (tools/battle-spike-analysis.mjs; docs/PERF-SPIKES.md) on a synthetic battle whose
// causes are known: a frame whose bots stage ran long, a worker reply that built a wreck between frames, a GC inside a
// frame, a first-use program link, the main thread idle while the GPU held a frame, and a long task outside any frame.
// Each spike is named by its dominant bucket; the clean frames are not spikes; the trace's clock meets performance.now()
// through the sync mark; the long tasks split as the spikes do; the summary counts by cause.
import assert from 'node:assert/strict';
import { FRAME_STAGE_NAMES } from '../src/game/frameStages.ts';
import { analyzeBattle, causeOfBucket, drawsOf, framesOf, gcOf, heapOf, mainThreadEvents, rendererMainThread } from './battle-spike-analysis.mjs';

const COLUMNS = ['tMs', 'rafMs', 'workMs', 'simSteps', 'programs', 'textures', 'geometries', 'heapMB', 'simS', 'flags', 'tanks', 'shells',
  'events', 'eventMs', 'topEvent0', 'topEventMs0', 'topEvent1', 'topEventMs1', 'topEvent2', 'topEventMs2',
  'links', 'linkMs', 'texMs', 'bufMs', 'gapLinks', 'gapLinkMs', 'gapTexMs', 'gapBufMs'];
const FLAGS = { battle: 1, countdown: 2, paused: 4, killcam: 8, result: 16, rendered: 32 };
const EVENTS = ['(other)', 'structure:stage', 'tank:fire'];

/** A frame row: its start, work, stages and extras. */
function frame(tMs, { work = 8, stages = { post: 4, bots: 2, movement: 2 }, programs = 40, heapMB = 120, extra = {}, flags = FLAGS.battle | FLAGS.rendered, top = [] } = {}) {
  const row = new Array(COLUMNS.length + FRAME_STAGE_NAMES.length).fill(0);
  const set = (name, value) => { row[COLUMNS.indexOf(name)] = value; };
  set('tMs', tMs); set('rafMs', tMs - 0.5); set('workMs', work); set('simSteps', 1); set('programs', programs); set('heapMB', heapMB);
  set('simS', tMs / 1000); set('flags', flags); set('tanks', 28);
  for (let slot = 0; slot < 3; slot++) { set(`topEvent${slot}`, top[slot]?.[0] ?? -1); set(`topEventMs${slot}`, top[slot]?.[1] ?? 0); }
  for (const [key, value] of Object.entries(extra)) set(key, value);
  for (const [name, ms] of Object.entries(stages)) row[COLUMNS.length + FRAME_STAGE_NAMES.indexOf(name)] = ms;
  return row;
}

// frames at 16.7 ms, then the spikes
const rows = [];
let t = 1000;
const step = (ms, options) => { rows.push(frame(t, options)); t += ms; };
step(16.7); step(16.7);
// A: the bots stage ran 40 ms (in-frame) → interval 50
const aAt = t; step(50, { work: 44, stages: { post: 4, bots: 40 } });
step(16.7);
// B: a 52 ms worker reply between frames (FunctionCall in brokenVehicleBuild) → interval 70
const bAt = t; step(70);
step(16.7);
// C: a frame with a 30 ms GC inside its 38 ms of movement → interval 45
const cAt = t; step(45, { work: 40, stages: { movement: 38, post: 2 } });
step(16.7);
// D: a 30 ms first-use program link in the frame (the recorder took it out of post) → interval 48
const dAt = t; step(48, { work: 36, stages: { post: 6 }, extra: { links: 2, linkMs: 30 } });
rows.push(frame(t, { programs: 42 })); t += 16.7;
// E: an 8 ms frame and then the main thread idle (the GPU held the frame) → interval 70
const eAt = t; step(70);
step(16.7);
// F: a destruction listener: the destruction stage 36 ms of which the stage event's listeners took 34 → interval 50
const fAt = t; step(50, { work: 40, stages: { destruction: 36, post: 4 }, top: [[1, 34]] });
step(16.7);
// a paused frame and a veiled (not rendered) one are never spikes
const pausedAt = t; step(200, { flags: FLAGS.battle | FLAGS.paused | FLAGS.rendered });
step(16.7, { flags: FLAGS.battle });
step(16.7); step(16.7);
const readout = { columns: COLUMNS, stages: FRAME_STAGE_NAMES, events: EVENTS, flags: FLAGS, frames: rows, dropped: 0 };

// the trace: the renderer main thread (pid 7 tid 1), the clock 5,000 ms ahead of performance.now()
const OFFSET = 5000;
const us = (ms) => Math.round((ms + OFFSET) * 1000);
const X = (name, startMs, durMs, args = {}) => ({ ph: 'X', pid: 7, tid: 1, name, ts: us(startMs), dur: Math.round(durMs * 1000), args });
const events = [
  { ph: 'M', pid: 7, tid: 1, name: 'thread_name', args: { name: 'CrRendererMain' } },
  { ph: 'M', pid: 9, tid: 1, name: 'thread_name', args: { name: 'CrRendererMain' } },
  { ph: 'R', pid: 7, tid: 1, name: 'sync-mark', ts: us(500) },
  // every frame's task: the rAF callback around the recorded work, and 1 ms of style and layout after it
];
for (const row of rows) {
  const tMs = row[0], work = row[2];
  events.push(X('RunTask', tMs - 0.2, work + 1.4), X('FireAnimationFrame', tMs - 0.1, work + 0.2), X('FunctionCall', tMs - 0.05, work + 0.1, { data: { url: 'http://127.0.0.1/assets/main-abcdef12.js', functionName: 'tick' } }),
    X('UpdateLayoutTree', tMs + work + 0.2, 0.5), X('Layout', tMs + work + 0.7, 0.4));
}
// B's worker reply: a 52 ms task 4 ms after the frame's work
events.push(X('RunTask', bAt + 13, 52), X('EventDispatch', bAt + 13.1, 51.8, { data: { type: 'message' } }),
  X('FunctionCall', bAt + 13.2, 51.6, { data: { url: 'http://127.0.0.1/assets/brokenVehicleBuild-1a2b3c4d.js', functionName: 'apply' } }));
// C's GC inside the frame's work
events.push(X('MinorGC', cAt + 5, 30));
// a long task outside every frame (an idle callback compiling a lazy chunk), while the battle is paused
events.push(X('RunTask', pausedAt + 20, 58), X('FireIdleCallback', pausedAt + 20.1, 57.8), X('v8.compile', pausedAt + 20.2, 50, { data: { url: 'http://127.0.0.1/assets/terrainDetail-99887766.js' } }));
// the other renderer's thread has more events but no sync mark
for (let i = 0; i < 400; i++) events.push({ ph: 'X', pid: 9, tid: 1, name: 'RunTask', ts: us(i), dur: 10 });

const main = rendererMainThread(events, 'sync-mark');
assert.deepEqual([main.pid, main.tid], [7, 1], 'the main thread is the one that carries the sync mark, not the busiest renderer');
const mainEvents = mainThreadEvents(events, main, OFFSET);
const gc = mainEvents.find((e) => e.name === 'MinorGC');
assert.ok(Math.abs(gc.start - (cAt + 5)) < 1e-6, 'trace time meets performance.now() through the offset');
assert.equal(gc.parent?.name, 'FunctionCall', 'a GC inside the callback nests in it');

const trace = { events, syncName: 'sync-mark', syncPerfMs: 500 };
const result = analyzeBattle({ readout, trace });
const at = (ms) => result.spikes.find((s) => Math.abs(s.atMs - ms) < 0.6);
assert.equal(result.spikes.length, 6, `six spikes (${result.spikes.map((s) => `${s.atMs}:${s.cause}`).join(', ')})`);
assert.equal(at(aAt).cause, 'bots', 'A: the bots stage');
assert.equal(at(aAt).dominant, 'stage:bots');
assert.equal(at(bAt).cause, 'destruction', 'B: the wreck build between frames (its chunk names it)');
assert.equal(at(bAt).dominant, 'script:brokenVehicleBuild');
assert.equal(at(cAt).cause, 'gc', 'C: the GC inside the frame, taken out of its stages');
assert.ok(at(cAt).buckets['stage:movement'] < 10, `C: movement keeps its own time only (${at(cAt).buckets['stage:movement']})`);
assert.equal(at(dAt).cause, 'program link', 'D: the first-use program link');
assert.equal(at(dAt).programs, 2, 'D: the programs the renderer gained');
assert.equal(at(eAt).cause, 'gpu/present', 'E: the main thread idle while the frame was held');
assert.equal(at(fAt).cause, 'destruction', 'F: the destruction stage event\'s listeners');
assert.equal(at(fAt).dominant, 'event:structure:stage');
assert.ok(at(aAt).buckets.dom > 0, 'the rendering pipeline after the callback is DOM work');
assert.equal(result.intervals.over33, 6, 'the paused and veiled frames are not counted');

// long tasks: the bots frame (in a frame) and the idle-callback compile (outside), the worker reply (outside)
const long = result.longTasks.map((task) => `${task.inFrame ? 'frame' : 'task'}:${task.cause}`).sort();
assert.deepEqual(long, ['task:chunk load', 'task:destruction'], `the long tasks (${long.join(', ')})`);
assert.equal(result.summary.gc.spikes, 1);
assert.equal(result.summary.destruction.spikes, 2);
assert.equal(result.summary.destruction.longTasks, 1);

// without a trace the recorder alone still names the in-frame causes; the rest is the gap
const untraced = analyzeBattle({ readout });
assert.equal(untraced.traced, false);
assert.equal(untraced.spikes.find((s) => Math.abs(s.atMs - aAt) < 0.6).cause, 'bots');
assert.equal(untraced.spikes.find((s) => Math.abs(s.atMs - dAt) < 0.6).cause, 'program link');

// the heap: rises are allocation, a drop past 0.25 MB a collection; the first-use links of the shown frames
assert.deepEqual(heapOf([{ heapMB: 100, tMs: 0 }, { heapMB: 102, tMs: 500 }, { heapMB: 90, tMs: 1000 }, { heapMB: 89.9, tMs: 1500 }]),
  { allocMBPerS: 1.33, gcDrops: 1, gcDropMB: 12, peakMB: 102 });
assert.equal(result.links.links, 2, 'the program links the battle made');
assert.equal(result.links.framesLinking, 1);

// a loaded machine: every interval 42 ms (a 20 ms render, the rest waiting), so none is a hitch; one 100 ms interval
// whose bots took 50 ms is, and its cause is the stage past its own median (the render is 20 ms in it as in every other)
{
  const loaded = [];
  let at = 1000;
  for (let i = 0; i < 60; i++) { loaded.push(frame(at, { work: 22, stages: { post: 20, bots: 2 } })); at += i === 30 ? 100 : 42; }
  const hitchAt = 1000 + 30 * 42;
  loaded[30] = frame(hitchAt, { work: 72, stages: { post: 20, bots: 52 } });
  // the GPU process busy through a second hitch's idle wait (pid 8: CrGpuMain)
  loaded.push(frame(at, { work: 22, stages: { post: 20, bots: 2 } })); const gpuAt = at; at += 130;
  loaded.push(frame(at, { work: 22, stages: { post: 20, bots: 2 } })); at += 42;
  loaded.push(frame(at, { work: 22, stages: { post: 20, bots: 2 } }));
  const traceEvents = [
    { ph: 'M', pid: 7, tid: 1, name: 'thread_name', args: { name: 'CrRendererMain' } },
    { ph: 'M', pid: 8, tid: 3, name: 'thread_name', args: { name: 'CrGpuMain' } },
    { ph: 'R', pid: 7, tid: 1, name: 'sync-mark', ts: us(500) },
    { ph: 'X', pid: 8, tid: 3, name: 'RunTask', ts: us(gpuAt + 30), dur: 90000 },
  ];
  for (const row of loaded) traceEvents.push(X('RunTask', row[0] - 0.2, row[2] + 0.4));
  const r = analyzeBattle({ readout: { ...readout, frames: loaded }, trace: { events: traceEvents, syncName: 'sync-mark', syncPerfMs: 500 } });
  assert.equal(r.intervals.medianMs, 42);
  assert.equal(r.intervals.hitchMs, 84, 'a hitch is past twice the median on a loaded machine');
  assert.ok(r.intervals.over33 >= 60, 'every interval is past 33 ms');
  assert.equal(r.spikes.length, 2, `two hitches (${r.spikes.map((x) => `${x.intervalMs}:${x.cause}`).join(', ')})`);
  assert.equal(r.spikes[0].cause, 'bots', 'the bots past their median, not the render that is 20 ms in every frame');
  assert.equal(r.spikes[1].cause, 'gpu busy', 'the main thread waited while the GPU process worked');
}

// the trace's collections: the allocation rate from each scavenge's heap before it and the one before's after
assert.deepEqual(gcOf([
  { name: 'MinorGC', start: 0, dur: 1, heapBefore: 40 * 1048576, heapAfter: 10 * 1048576 },
  { name: 'MinorGC', start: 500, dur: 6, heapBefore: 30 * 1048576, heapAfter: 11 * 1048576 },
  { name: 'MinorGC', start: 1000, dur: 1, heapBefore: 31 * 1048576, heapAfter: 12 * 1048576 },
  { name: 'MajorGC', start: 1200, dur: 20 },
]), { allocMBPerS: 40, scavenges: 3, scavengeMs: 8, scavengesOver5: 1, markCompacts: 1, markCompactMs: 20, heapAfterMB: 12 });

// the readout's rows as objects; the cause table
assert.equal(framesOf(readout)[2].stages.bots, 40);
assert.equal(causeOfBucket('script:audioEngine'), 'audio');
assert.equal(causeOfBucket('stage:world'), 'streaming');
assert.equal(causeOfBucket('gl:tex'), 'upload');
// (battle-spikes-253) the draw-count summary: rendered frames only, the post stage as the submission, per draw
{
  const frame = (draws, switches, used, postMs, rendered = true) => ({ rendered, draws, programSwitches: switches, programsUsed: used, stages: { post: postMs } });
  const d = drawsOf([frame(1000, 300, 120, 20), frame(1200, 320, 125, 24), frame(800, 280, 118, 16), frame(0, 0, 0, 0, false)]);
  assert.equal(d.frames, 3, 'unrendered frames are out');
  assert.deepEqual(d.draws, { median: 1000, p90: 1200 });
  assert.deepEqual(d.programsUsed, { median: 120, p90: 125 });
  assert.deepEqual(d.submitMs, { median: 20, p90: 24 });
  assert.equal(d.usPerDraw, 20, '20 ms over 1000 draws is 20 us a draw');
  assert.equal(drawsOf([{ rendered: true, stages: { post: 5 } }]), null, 'a readout without the draw columns has none');
}
console.log(`battle-spike-analysis.selftest: 6 spikes named (bots, wreck build, GC, program link, GPU hold, destruction listeners); `
  + 'long tasks split in and out of frames; the trace clock synced; untraced readouts still name in-frame causes PASS');
