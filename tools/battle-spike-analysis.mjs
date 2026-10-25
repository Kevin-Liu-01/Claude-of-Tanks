// The battle spike census's analysis (battle-spikes-253, docs/PERF-SPIKES.md; tools/battle-spike-census.mjs). Pure: it
// takes one battle's frame-stage readout (src/dev/frameStageRecorder.ts), the page's observers and the renderer main
// thread's trace events, and returns every frame interval over SPIKE_FRAME_MS and every main-thread task over
// LONG_TASK_MS with the time inside it split into buckets — the frame's stages, GC, WebGL program links and uploads,
// the rendering pipeline's DOM work, other tasks' scripts by chunk, script compiles, and the main thread idle (a frame
// the GPU or the compositor held) — and each one's dominant cause in the program's taxonomy.

/** A frame interval past this is a spike ("every frame over 33 ms"). */
export const SPIKE_FRAME_MS = 33.4;
/** A main-thread task past this is a long task. */
export const LONG_TASK_MS = 50;

/** Stage → cause (the directive's list: GC, first-use program links, streaming, sim tick, bots, destruction, audio, DOM). */
const STAGE_CAUSE = Object.freeze({
  other: 'other', input: 'input', network: 'network', countdown: 'hud/dom',
  spotting: 'sim tick', bots: 'bots', aerial: 'sim tick', movement: 'sim tick', contacts: 'sim tick', fire: 'sim tick',
  shells: 'sim tick', damage: 'sim tick', destruction: 'destruction', mode: 'sim tick', pose: 'presentation',
  presentation: 'presentation', camera: 'presentation', sniperFill: 'render cpu', world: 'streaming', fx: 'fx',
  matchWorld: 'presentation', hud: 'hud/dom', audio: 'audio', night: 'render cpu', lighting: 'render cpu', post: 'render cpu',
  perfHud: 'hud/dom',
});

/** A bus event whose listeners took most of a stage names the cause more exactly than the stage. */
export function causeOfEvent(name) {
  if (/^(destruction|prop:|building|wreck|crater)/.test(name)) return 'destruction';
  if (/^audio|radio|voice/.test(name)) return 'audio';
  if (/^(hud|ui|toast|killfeed|medal|award)/.test(name)) return 'hud/dom';
  return null;
}

/** Bucket key → cause. */
export function causeOfBucket(key) {
  if (key.startsWith('stage:')) return STAGE_CAUSE[key.slice(6)] ?? 'other';
  if (key.startsWith('event:')) return causeOfEvent(key.slice(6)) ?? 'sim tick';
  if (key === 'gc') return 'gc';
  if (key === 'gl:link') return 'program link';
  if (key === 'gl:tex' || key === 'gl:buf') return 'upload';
  if (key === 'dom') return 'hud/dom';
  if (key === 'compile') return 'chunk load';
  if (key === 'image') return 'image decode';
  if (key === 'idle') return 'gpu/present';
  if (key.startsWith('script:')) {
    const chunk = key.slice(7);
    if (/audio|sound|voice|radio|ambience|sfx|mixer/i.test(chunk)) return 'audio';
    if (/broken|wreck|destruct|collapse|crater|debris/i.test(chunk)) return 'destruction';
    if (/terrain|world|map|stream|vegetation|tree|grass|horizon|resid/i.test(chunk)) return 'streaming';
    if (/hud|ui|toast|garage|menu|panel/i.test(chunk)) return 'hud/dom';
    return 'script';
  }
  return 'other';
}

/** The readout's rows as objects (stages by name; the top bus events named). */
export function framesOf(readout) {
  if (!readout?.frames) return [];
  const col = Object.fromEntries(readout.columns.map((name, index) => [name, index]));
  const stageBase = readout.columns.length;
  return readout.frames.map((row) => {
    const frame = {};
    for (const name of readout.columns) frame[name] = row[col[name]];
    frame.stages = {};
    readout.stages.forEach((name, index) => { if (row[stageBase + index] > 0) frame.stages[name] = row[stageBase + index]; });
    frame.topEvents = [];
    for (let slot = 0; slot < 3; slot++) {
      const index = row[col[`topEvent${slot}`]];
      if (index >= 0) frame.topEvents.push({ name: readout.events[index] ?? '?', ms: row[col[`topEventMs${slot}`]] });
    }
    frame.battle = !!(frame.flags & readout.flags.battle);
    frame.rendered = readout.flags.rendered ? !!(frame.flags & readout.flags.rendered) : (frame.stages.post ?? 0) > 0;
    frame.paused = !!(frame.flags & readout.flags.paused);
    frame.killcam = !!(frame.flags & readout.flags.killcam);
    frame.countdown = !!(frame.flags & readout.flags.countdown);
    return frame;
  });
}

// ---------------------------------------------------------------------------------------------- the trace

const GC_EVENT = /^(MinorGC|MajorGC|V8\.GC|BlinkGC\.|ThreadState::|CppGC|GCEvent|V8\.ScavengeTask|V8\.MemoryReducer)/;
const DOM_EVENT = /^(UpdateLayoutTree|Layout|Paint|PrePaint|Layerize|Commit|RecalculateStyles|UpdateLayer|CompositeLayers|HitTest|ScrollLayer|ParseAuthorStyleSheet|IntersectionObserverController::computeIntersections|ResizeObserverController|UpdateLayerTree)$/;
const COMPILE_EVENT = /^(v8\.compile|v8\.compileModule|V8\.CompileCode|CompileScript|EvaluateScript|v8\.evaluateModule|v8\.produceCache|v8\.produceModuleCache|ParseHTML|v8\.parseOnBackground|V8\.CompileLazy)$/;
const IMAGE_EVENT = /^(Decode Image|ImageDecodeTask|Decode LazyPixelRef|Draw LazyPixelRef)$/;
const SCRIPT_EVENT = /^(FunctionCall|TimerFire|EventDispatch|FireAnimationFrame|FireIdleCallback|RunMicrotasks|v8\.run|V8\.Execute|XHRReadyStateChange|XHRLoad)$/;
const TASK_EVENT = /^(RunTask|ThreadControllerImpl::RunTask)$/;

/** The page's renderer main thread: the CrRendererMain whose process carries the sync mark (else the busiest). */
export function rendererMainThread(events, syncName) {
  const mains = new Map();
  for (const e of events) {
    if (e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain') mains.set(`${e.pid}:${e.tid}`, { pid: e.pid, tid: e.tid, count: 0 });
  }
  let marked = null;
  for (const e of events) {
    const key = `${e.pid}:${e.tid}`;
    const main = mains.get(key);
    if (!main) continue;
    main.count++;
    if (syncName && e.name === syncName) marked = main;
  }
  if (marked) return marked;
  let best = null;
  for (const main of mains.values()) if (!best || main.count > best.count) best = main;
  return best;
}

/**
 * The main thread's complete events in performance.now() milliseconds, sorted, with each one's self time: the events of
 * the kinds the buckets name, and the top-level tasks. `offsetMs` = trace ms − performance.now() ms (the sync mark).
 */
export function mainThreadEvents(events, { pid, tid }, offsetMs) {
  const out = [];
  const open = new Map();
  for (const e of events) {
    if (e.pid !== pid || e.tid !== tid) continue;
    if (!(TASK_EVENT.test(e.name) || GC_EVENT.test(e.name) || DOM_EVENT.test(e.name) || COMPILE_EVENT.test(e.name)
      || IMAGE_EVENT.test(e.name) || SCRIPT_EVENT.test(e.name))) continue;
    if (e.ph === 'X') out.push(eventOf(e, e.ts, e.dur ?? 0, offsetMs));
    else if (e.ph === 'B') { const stack = open.get(e.name) ?? []; stack.push(e); open.set(e.name, stack); }
    else if (e.ph === 'E') { const begin = open.get(e.name)?.pop(); if (begin) out.push(eventOf(begin, begin.ts, e.ts - begin.ts, offsetMs)); }
  }
  out.sort((a, b) => a.start - b.start || b.end - a.end);
  // self time: each event minus its direct children (a stack of the open ones)
  const stack = [];
  for (const event of out) {
    while (stack.length && stack[stack.length - 1].end <= event.start + 1e-6) stack.pop();
    const parent = stack[stack.length - 1] ?? null;
    if (parent) parent.self -= Math.min(event.end, parent.end) - event.start;
    event.parent = parent;
    stack.push(event);
  }
  for (const event of out) event.self = Math.max(0, event.self);
  return out;
}

function eventOf(e, ts, dur, offsetMs) {
  const start = ts / 1000 - offsetMs;
  const data = e.args?.data ?? e.args?.beginData ?? null;
  return {
    name: e.name, start, end: start + dur / 1000, dur: dur / 1000, self: dur / 1000,
    url: data?.url ?? data?.stackTrace?.[0]?.url ?? null, fn: data?.functionName ?? null, type: data?.type ?? null,
  };
}

/** The bucket a trace event's self time goes to (scripts by the chunk of the nearest call that names one). */
export function bucketOfEvent(event, chunkOfUrl) {
  if (GC_EVENT.test(event.name)) return 'gc';
  if (DOM_EVENT.test(event.name)) return 'dom';
  if (COMPILE_EVENT.test(event.name)) return 'compile';
  if (IMAGE_EVENT.test(event.name)) return 'image';
  if (TASK_EVENT.test(event.name)) return 'task';
  for (let e = event; e; e = e.parent) if (e.url) return `script:${chunkOfUrl(e.url)}`;
  if (event.type) return `script:(${event.type})`;
  return 'script:(unknown)';
}

/** Add the self time of the events inside [from, to) (clipped) to `buckets`; returns the busy time it added. */
function addTraceBuckets(buckets, events, from, to, chunkOfUrl, skip = null) {
  let added = 0;
  for (const event of events) {
    if (event.end <= from || event.start >= to || (skip && skip(event))) continue;
    // the clipped share of the event's self time
    const share = event.dur > 0 ? (Math.min(event.end, to) - Math.max(event.start, from)) / event.dur : 1;
    const ms = event.self * share;
    if (ms <= 0) continue;
    const key = bucketOfEvent(event, chunkOfUrl);
    buckets[key] = (buckets[key] ?? 0) + ms;
    added += ms;
  }
  return added;
}

const defaultChunkOfUrl = (url) => (url.split(/[?#]/)[0].split('/').pop() || url).replace(/\.m?js$/, '').replace(/-[a-z0-9_]{6,}$/i, '');

// ---------------------------------------------------------------------------------------------- attribution

/** In-frame buckets from the recorder: its stages (GC taken out pro rata when the trace saw one inside the work) and its WebGL kinds. */
function frameBuckets(frame, gcInWorkMs = 0) {
  const buckets = {};
  const stageTotal = Object.values(frame.stages).reduce((sum, ms) => sum + ms, 0);
  const keep = stageTotal > 0 ? Math.max(0, 1 - gcInWorkMs / stageTotal) : 1;
  for (const [name, ms] of Object.entries(frame.stages)) buckets[`stage:${name}`] = ms * keep;
  // a stage whose listeners took most of its time: the event names the cause (destruction:*, audio …)
  for (const top of frame.topEvents ?? []) {
    const cause = causeOfEvent(top.name);
    if (!cause || top.ms < 2) continue;
    for (const [key, ms] of Object.entries(buckets)) {
      if (key.startsWith('stage:') && ms >= top.ms) { buckets[key] = ms - top.ms; buckets[`event:${top.name}`] = (buckets[`event:${top.name}`] ?? 0) + top.ms; break; }
    }
  }
  if (frame.linkMs > 0) buckets['gl:link'] = frame.linkMs;
  if (frame.texMs > 0) buckets['gl:tex'] = frame.texMs;
  if (frame.bufMs > 0) buckets['gl:buf'] = frame.bufMs;
  if (gcInWorkMs > 0) buckets.gc = (buckets.gc ?? 0) + gcInWorkMs;
  return buckets;
}

function sumGc(events, from, to) {
  let ms = 0;
  for (const event of events) {
    if (!GC_EVENT.test(event.name) || event.end <= from || event.start >= to) continue;
    const share = event.dur > 0 ? (Math.min(event.end, to) - Math.max(event.start, from)) / event.dur : 1;
    ms += event.self * share;
  }
  return ms;
}

/** Busy main-thread time inside [from, to): the union of the top-level tasks there. */
function busyMs(tasks, from, to) {
  let busy = 0, cursor = from;
  for (const task of tasks) {
    if (task.end <= cursor || task.start >= to) continue;
    const start = Math.max(task.start, cursor), end = Math.min(task.end, to);
    if (end > start) { busy += end - start; cursor = end; }
  }
  return busy;
}

function dominant(buckets) {
  let key = null, ms = 0;
  for (const [k, v] of Object.entries(buckets)) if (v > ms) { key = k; ms = v; }
  return key;
}

const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
function roundedBuckets(buckets, floorMs = 0.5) {
  return Object.fromEntries(Object.entries(buckets).filter(([, ms]) => ms >= floorMs).sort((a, b) => b[1] - a[1]).map(([k, ms]) => [k, round(ms, 1)]));
}

/**
 * One battle's spikes and long tasks.
 * @param readout the recorder's readout
 * @param trace { events, syncName, syncPerfMs } or null (the recorder alone: the gap is idle-or-unknown)
 * @param observers { tasks: [{t, ms}], loaf: [...], decodes: [...] } from the page
 * @param window { fromMs, toMs } performance.now() bounds of the battle the census measured (optional)
 */
export function analyzeBattle({ readout, trace = null, observers = {}, window = null, chunkOfUrl = defaultChunkOfUrl,
  spikeMs = SPIKE_FRAME_MS, longTaskMs = LONG_TASK_MS } = {}) {
  const frames = framesOf(readout).filter((f) => !window || (f.tMs >= window.fromMs && f.tMs <= window.toMs));
  let events = [], tasks = [];
  if (trace?.events?.length) {
    const main = rendererMainThread(trace.events, trace.syncName);
    const sync = trace.events.find((e) => e.name === trace.syncName && (!main || e.pid === main.pid));
    if (main && sync) {
      const offsetMs = sync.ts / 1000 - trace.syncPerfMs;
      events = mainThreadEvents(trace.events, main, offsetMs);
      tasks = events.filter((e) => TASK_EVENT.test(e.name) && !e.parent);
    }
  }
  const traced = tasks.length > 0;
  const shown = frames.filter((f) => f.battle && f.rendered && !f.paused);
  const intervals = [];
  const spikes = [];
  for (let k = 1; k < shown.length; k++) {
    const a = shown[k - 1], b = shown[k];
    // consecutive recorded frames only (a veil or a pause between them is not a hitch the player saw)
    if (frames.indexOf(b) !== frames.indexOf(a) + 1) continue;
    const interval = b.rafMs - a.rafMs;
    intervals.push(interval);
    if (interval <= spikeMs) continue;
    const workEnd = a.tMs + a.workMs;
    const gcInWork = traced ? sumGc(events, a.tMs, workEnd) : 0;
    const buckets = frameBuckets(a, gcInWork);
    let busy = a.workMs;
    if (traced) {
      // the rest of the main thread in the interval: the frame task's pipeline after the callback, and other tasks
      const gapTraced = addTraceBuckets(buckets, events, workEnd, b.tMs, chunkOfUrl, (e) => TASK_EVENT.test(e.name));
      busy += busyMs(tasks, workEnd, b.tMs);
      // tasks with no traced children (their own time): charged as 'task:other'
      const untraced = busyMs(tasks, workEnd, b.tMs) - gapTraced;
      if (untraced > 0.5) buckets['task:other'] = (buckets['task:other'] ?? 0) + untraced;
      // the gap's WebGL work happened inside those scripts: name it, and take it out of them
      moveGapGl(buckets, b);
    } else {
      moveGapGl(buckets, b);
    }
    const idle = Math.max(0, interval - busy);
    if (idle > 0.5) buckets.idle = idle;
    const key = dominant(buckets);
    spikes.push({
      atMs: round(a.tMs, 1), simS: round(a.simS, 2), intervalMs: round(interval, 1), workMs: round(a.workMs, 1),
      cause: key ? causeOfBucket(key) : 'unknown', dominant: key, buckets: roundedBuckets(buckets),
      programs: b.programs - a.programs, heapDropMB: round(Math.max(0, a.heapMB - b.heapMB), 1), simSteps: a.simSteps,
      links: a.links + b.gapLinks, topEvents: a.topEvents.map((e) => ({ name: e.name, ms: round(e.ms, 1) })),
      countdown: a.countdown, killcam: a.killcam,
    });
  }

  // long tasks: the trace's top-level tasks (else the observer's), each split as a spike is
  const longTasks = [];
  const source = traced ? tasks.filter((t) => t.dur > longTaskMs) : (observers.tasks ?? []).filter((t) => t.ms > longTaskMs)
    .map((t) => ({ start: t.t, end: t.t + t.ms, dur: t.ms }));
  for (const task of source) {
    if (window && (task.end < window.fromMs || task.start > window.toMs)) continue;
    const frame = frames.find((f) => f.tMs >= task.start - 0.5 && f.tMs + f.workMs <= task.end + 0.5 && f.workMs > 0);
    const buckets = frame ? frameBuckets(frame, traced ? sumGc(events, frame.tMs, frame.tMs + frame.workMs) : 0) : {};
    if (traced) {
      addTraceBuckets(buckets, events, task.start, task.end, chunkOfUrl, (e) => e === task
        || (frame && e.end > frame.tMs && e.start < frame.tMs + frame.workMs));
      // the task's own time past what its events name
      const named = Object.values(buckets).reduce((sum, ms) => sum + ms, 0);
      if (task.dur - named > 0.5) buckets['task:other'] = task.dur - named;
    }
    const key = dominant(buckets);
    longTasks.push({
      atMs: round(task.start, 1), ms: round(task.dur, 1), inFrame: !!frame, battle: !!frame?.battle,
      cause: key ? causeOfBucket(key) : (frame ? 'unknown' : 'untraced'), dominant: key, buckets: roundedBuckets(buckets),
    });
  }

  return { frames: shown.length, intervals: summarizeIntervals(intervals), spikes, longTasks, summary: summarize(spikes, longTasks), traced };
}

function moveGapGl(buckets, b) {
  const gap = { 'gl:link': b.gapLinkMs ?? 0, 'gl:tex': b.gapTexMs ?? 0, 'gl:buf': b.gapBufMs ?? 0 };
  let moved = 0;
  for (const [key, ms] of Object.entries(gap)) if (ms > 0) { buckets[key] = (buckets[key] ?? 0) + ms; moved += ms; }
  // out of the gap's scripts, largest first
  const scripts = Object.keys(buckets).filter((k) => k.startsWith('script:') || k === 'task:other').sort((x, y) => buckets[y] - buckets[x]);
  for (const key of scripts) {
    if (moved <= 0) break;
    const take = Math.min(buckets[key], moved);
    buckets[key] -= take;
    moved -= take;
  }
}

function summarizeIntervals(intervals) {
  if (!intervals.length) return { count: 0 };
  const sorted = [...intervals].sort((a, b) => a - b);
  const at = (q) => round(sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))], 1);
  return { count: sorted.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: round(sorted[sorted.length - 1], 1),
    over33: sorted.filter((v) => v > SPIKE_FRAME_MS).length, over50: sorted.filter((v) => v > 50).length,
    over100: sorted.filter((v) => v > 100).length };
}

/** Counts and excess time (past one 16.7 ms frame) by cause. */
export function summarize(spikes, longTasks) {
  const byCause = {};
  for (const spike of spikes) {
    const row = byCause[spike.cause] ??= { spikes: 0, excessMs: 0, longTasks: 0, longTaskMs: 0 };
    row.spikes++;
    row.excessMs = round(row.excessMs + Math.max(0, spike.intervalMs - 16.7), 1);
  }
  for (const task of longTasks) {
    const row = byCause[task.cause] ??= { spikes: 0, excessMs: 0, longTasks: 0, longTaskMs: 0 };
    row.longTasks++;
    row.longTaskMs = round(row.longTaskMs + task.ms, 1);
  }
  return Object.fromEntries(Object.entries(byCause).sort((a, b) => b[1].excessMs + b[1].longTaskMs - a[1].excessMs - a[1].longTaskMs));
}
