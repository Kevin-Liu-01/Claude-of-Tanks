#!/usr/bin/env node
// The entry's main-thread CPU by loader stage (entry-cpu-278). First-party tooling: Kevin B. Liu.
//
//   node tools/entry-cpu-profile.mjs --run=<mp-two-peer-e2e --cpu-profile out dir> --dist=<the dist it served> [--top=10]
//
// Reads <run>/entry-trace.json (the harness's Chrome trace: V8's sampler, the Profile and ProfileChunk events) and
// <run>/entry-profile.json, rebuilds each renderer thread's profile, maps every main-thread sample to the loader stage
// on screen when it was taken (the harness's loader rows, on the page clock, aligned through the trace's user-timing
// mark) and every frame to its source through the dist's source maps (build it with `vite build --sourcemap`; without
// maps the minified names are reported). Prints, per stage and over the whole entry, the top self-time functions, the
// top self-time source files and the top inclusive functions (a sample counts once for each distinct first-party
// function on its stack), in ms of throttled main-thread time; and each worker thread's busy time and top functions.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SourceMapConsumer } from 'source-map-js';

function argValue(name, fallback) {
  const raw = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : fallback;
}
const runDir = resolve(argValue('run', '.'));
const distDir = argValue('dist', '') ? resolve(argValue('dist', '')) : null;
const top = Number(argValue('top', 10));
const asJson = process.argv.includes('--json');

const meta = JSON.parse(readFileSync(join(runDir, 'entry-profile.json'), 'utf8'));
const traceRaw = JSON.parse(readFileSync(join(runDir, 'entry-trace.json'), 'utf8'));
const events = Array.isArray(traceRaw) ? traceRaw : traceRaw.traceEvents;

// the page clock's anchor: the user-timing mark the harness set at the start (its trace ts against its startTime)
const markEvent = events.find((event) => event.name === meta.markName && event.cat?.includes('blink.user_timing'));
if (!markEvent) throw new Error(`no ${meta.markName} mark in the trace`);
const threadNames = new Map();
for (const event of events) if (event.ph === 'M' && event.name === 'thread_name') threadNames.set(`${event.pid}:${event.tid}`, event.args?.name ?? '');

/** Every sampled thread of the page's renderer process: { key, name, profile: { nodes, samples, timeDeltas, startTime } }. */
function threadProfiles() {
  const byId = new Map();
  for (const event of events) {
    if (event.pid !== markEvent.pid) continue;
    if (event.name === 'Profile') {
      byId.set(`${event.pid}:${event.id}`, { key: `${event.pid}:${event.tid}`, startTime: event.args.data.startTime, nodes: [], samples: [], timeDeltas: [] });
    } else if (event.name === 'ProfileChunk') {
      const entry = byId.get(`${event.pid}:${event.id}`);
      if (!entry) continue;
      const data = event.args.data;
      for (const node of data.cpuProfile?.nodes ?? []) entry.nodes.push(node);
      for (const sample of data.cpuProfile?.samples ?? []) entry.samples.push(sample);
      for (const delta of data.timeDeltas ?? []) entry.timeDeltas.push(delta);
    }
  }
  return [...byId.values()].map((entry) => ({ key: entry.key, name: threadNames.get(entry.key) ?? '?', profile: entry }));
}
const threads = threadProfiles();
const mainThread = threads.find((thread) => thread.key === `${markEvent.pid}:${markEvent.tid}`);
if (!mainThread) throw new Error('no sampled profile on the page main thread');
const consumers = new Map();
function consumerFor(url) {
  if (!distDir || !url) return null;
  let path;
  try { path = new URL(url).pathname; } catch { return null; }
  if (consumers.has(path)) return consumers.get(path);
  const mapPath = join(distDir, `${path}.map`);
  const consumer = existsSync(mapPath) ? new SourceMapConsumer(JSON.parse(readFileSync(mapPath, 'utf8'))) : null;
  consumers.set(path, consumer);
  return consumer;
}
// a map's sources are relative to the dist (../../../<worktree>/src/x.ts, ../../../<install>/node_modules/three/...):
// keep the repo-relative part
const cleanSource = (source) => {
  const path = source.replace(/^webpack:\/\//, '');
  const at = Math.max(path.lastIndexOf('/src/'), path.lastIndexOf('/node_modules/'));
  return at >= 0 ? path.slice(at + 1) : path.replace(/^(\.\.\/)+/, '');
};

// (trace chunks give each node its parent, not its children)
function indexNodes(profile) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map();
  for (const node of profile.nodes) if (node.parent !== undefined) parent.set(node.id, node.parent);
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  return { nodes, parent };
}
let { nodes, parent } = indexNodes(mainThread.profile);
let labelCache = new Map();
/** { fn, file } for a profile node: its source position through the map, else the raw frame. */
function label(id) {
  if (labelCache.has(id)) return labelCache.get(id);
  const { callFrame } = nodes.get(id);
  let fn = callFrame.functionName || '(anonymous)';
  let file = '';
  try { file = callFrame.url ? new URL(callFrame.url).pathname : ''; } catch { file = callFrame.url; }
  if (!callFrame.url && fn.startsWith('(')) file = fn;
  const consumer = consumerFor(callFrame.url);
  if (consumer) {
    const original = consumer.originalPositionFor({ line: callFrame.lineNumber + 1, column: callFrame.columnNumber });
    if (original.source) {
      file = cleanSource(original.source);
      fn = `${original.name || callFrame.functionName || '(anonymous)'} ${file}:${original.line}`;
    }
  } else if (callFrame.url) fn = `${fn} ${file}:${callFrame.lineNumber + 1}`;
  const value = { fn, file };
  labelCache.set(id, value);
  return value;
}

// the page clock of each sample: the profile starts at meta.profileClock (ms) on the page's performance clock
const rows = meta.loadRows ?? [];
function stageAt(pageMs) {
  let stage = '(before loader)';
  for (const row of rows) {
    if (row.atMs > pageMs) break;
    stage = row.on ? `${row.pct} ${row.stage}` : '(loader off)';
  }
  return stage;
}

const stages = new Map(); // stage -> { firstMs, lastMs, totalMs, self: Map, files: Map, incl: Map }
const whole = { firstMs: Infinity, lastMs: 0, totalMs: 0, self: new Map(), files: new Map(), incl: new Map() };
const add = (map, key, ms) => map.set(key, (map.get(key) ?? 0) + ms);
const profile = mainThread.profile;
// trace ts (µs) of a sample -> page clock (ms): the mark's ts is its startTime
const pageMsOf = (ts) => meta.profileClock + (ts - markEvent.ts) / 1000;
const t0Page = meta.profileClock;
const endTs = markEvent.ts + (meta.revealClock - meta.profileClock) * 1000;
let t = profile.startTime;
for (let index = 0; index < profile.samples.length; index++) {
  t += profile.timeDeltas[index];
  const nextDelta = profile.timeDeltas[index + 1] ?? 0;
  const ms = Math.max(0, Math.min(nextDelta, 50_000)) / 1000;
  if (t < markEvent.ts || t > endTs) continue;
  const id = profile.samples[index];
  const self = label(id);
  if (self.fn === '(idle)') continue;
  const pageMs = pageMsOf(t);
  const stage = stageAt(pageMs);
  if (!stages.has(stage)) stages.set(stage, { firstMs: pageMs, lastMs: pageMs, totalMs: 0, self: new Map(), files: new Map(), incl: new Map() });
  for (const bucket of [stages.get(stage), whole]) {
    bucket.firstMs = Math.min(bucket.firstMs, pageMs);
    bucket.lastMs = Math.max(bucket.lastMs, pageMs);
    bucket.totalMs += ms;
    add(bucket.self, self.fn, ms);
    add(bucket.files, self.file || '(unknown)', ms);
    const seen = new Set();
    for (let cursor = id; cursor !== undefined; cursor = parent.get(cursor)) {
      const frame = label(cursor);
      if (frame.file.startsWith('src/') && !seen.has(frame.fn)) { seen.add(frame.fn); add(bucket.incl, frame.fn, ms); }
    }
  }
}

// the other threads (workers): busy time inside the entry window and their top self-time functions
const workers = [];
for (const thread of threads) {
  if (thread === mainThread) continue;
  ({ nodes, parent } = indexNodes(thread.profile));
  labelCache = new Map();
  const self = new Map();
  let busy = 0;
  let tw = thread.profile.startTime;
  for (let index = 0; index < thread.profile.samples.length; index++) {
    tw += thread.profile.timeDeltas[index];
    const ms = Math.max(0, Math.min(thread.profile.timeDeltas[index + 1] ?? 0, 50_000)) / 1000;
    if (tw < markEvent.ts || tw > endTs) continue;
    const frame = label(thread.profile.samples[index]);
    if (frame.fn === '(idle)') continue;
    busy += ms;
    add(self, frame.fn, ms);
  }
  if (busy > 50) workers.push({ thread: thread.name, key: thread.key, busyMs: Math.round(busy), self: [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([key, value]) => ({ key, ms: +value.toFixed(1) })) });
}
const topOf = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, ms]) => ({ key, ms: +ms.toFixed(1) }));
const summary = {
  run: runDir, revealS: +((meta.revealClock - t0Page) / 1000).toFixed(1), busyMs: +whole.totalMs.toFixed(0), workers,
  whole: { self: topOf(whole.self, top * 2), files: topOf(whole.files, top * 2), incl: topOf(whole.incl, top * 2) },
  stages: [...stages.entries()].sort((a, b) => a[1].firstMs - b[1].firstMs).map(([stage, bucket]) => ({
    stage, fromS: +((bucket.firstMs - t0Page) / 1000).toFixed(1), toS: +((bucket.lastMs - t0Page) / 1000).toFixed(1),
    busyMs: +bucket.totalMs.toFixed(0), self: topOf(bucket.self, top), files: topOf(bucket.files, 5), incl: topOf(bucket.incl, top),
  })),
};
if (asJson) process.stdout.write(`${JSON.stringify(summary, null, 1)}\n`);
else {
  const line = (rowsOut) => rowsOut.map((row) => `    ${String(row.ms).padStart(8)} ms  ${row.key}`).join('\n');
  console.log(`${summary.run}\nreveal ${summary.revealS} s after the profile start; main thread busy ${summary.busyMs} ms (idle excluded)`);
  console.log(`\n== whole entry: self time by function\n${line(summary.whole.self)}`);
  console.log(`\n== whole entry: self time by source file\n${line(summary.whole.files)}`);
  console.log(`\n== whole entry: inclusive by first-party function\n${line(summary.whole.incl)}`);
  for (const worker of summary.workers) console.log(`\n== worker ${worker.thread} ${worker.key}: busy ${worker.busyMs} ms\n${line(worker.self)}`);
  for (const stage of summary.stages) {
    console.log(`\n== ${stage.stage}  (${stage.fromS}-${stage.toS} s, busy ${stage.busyMs} ms)`);
    console.log(`  self:\n${line(stage.self)}\n  files:\n${line(stage.files)}\n  inclusive:\n${line(stage.incl)}`);
  }
}
