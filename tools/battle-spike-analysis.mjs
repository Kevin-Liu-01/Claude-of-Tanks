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

/**
 * A bus event whose listeners took most of a stage names the cause more exactly than the stage (the game's names:
 * sim/destructionEvents.ts DESTRUCTION_BUS_EVENTS, the combat and UI events).
 */
export function causeOfEvent(name) {
  if (/^(structure:|terrain:crater|munition:blast|prop:)/.test(name)) return 'destruction';
  if (name === 'tank:destroyed') return 'kill';
  if (/^(tank:fire|tank:impact|shell:|weapon:|auxiliary:fired|drone:)/.test(name)) return 'combat fx';
  if (/^(ui:|service:|battle:|player:|spectate:|watch:)/.test(name)) return 'hud/dom';
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
  if (key === 'idle:gpu') return 'gpu busy';
  if (key === 'gap') return 'untraced gap';
  if (key.startsWith('other:')) return 'other';
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

/**
 * Whether a raw trace event can matter to the analysis (the census keeps these while it streams the trace, before it
 * knows the main thread): metadata, the sync mark, and the kinds the buckets name, past a tenth of a millisecond.
 */
export function traceEventOfInterest(e, syncName) {
  if (e.ph === 'M') return e.name === 'thread_name' || e.name === 'process_name';
  if (e.name === syncName) return true;
  if (!(TASK_EVENT.test(e.name) || GC_EVENT.test(e.name) || DOM_EVENT.test(e.name) || COMPILE_EVENT.test(e.name)
    || IMAGE_EVENT.test(e.name) || SCRIPT_EVENT.test(e.name))) return false;
  return e.ph !== 'X' || (e.dur ?? 0) >= 100;
}

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
    if (e.pid !== pid || e.tid !== tid || e.ph === 'M' || e.ph === 'I' || e.ph === 'R' || e.ph === 'n') continue;
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
    heapBefore: e.args?.usedHeapSizeBefore ?? null, heapAfter: e.args?.usedHeapSizeAfter ?? null,
  };
}

/** The bucket a trace event's self time goes to (scripts by the chunk of the nearest call that names one). */
export function bucketOfEvent(event, chunkOfUrl) {
  if (GC_EVENT.test(event.name)) return 'gc';
  if (DOM_EVENT.test(event.name)) return 'dom';
  if (COMPILE_EVENT.test(event.name)) return 'compile';
  if (IMAGE_EVENT.test(event.name)) return 'image';
  if (TASK_EVENT.test(event.name)) return 'task';
  // a detailed trace's other events (V8.Execute, a mojo message, a GPU sync …) by name, unless a script holds them
  if (!SCRIPT_EVENT.test(event.name) && !/^(V8\.|v8\.)/.test(event.name)) {
    for (let e = event.parent; e; e = e.parent) if (e.url) return `script:${chunkOfUrl(e.url)}`;
    return `other:${event.name}`;
  }
  for (let e = event; e; e = e.parent) if (e.url) return `script:${chunkOfUrl(e.url)}`;
  if (event.type) return `script:(${event.type})`;
  return 'script:(unknown)';
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

/** A frame interval past both SPIKE_FRAME_MS and this multiple of the battle's median interval is a hitch. */
export const HITCH_RATIO = 2;

/** Events by start time, with a look-back long enough for any event that starts before a window and runs into it. */
function indexEvents(events) {
  let lookback = 0;
  for (const e of events) if (!TASK_EVENT.test(e.name)) lookback = Math.max(lookback, Math.min(e.dur, 5000));
  const starts = events.map((e) => e.start);
  return {
    events, lookback,
    /** The index of the first event that may overlap a window opening at `from`. */
    first(from) {
      let lo = 0, hi = starts.length;
      const at = from - lookback;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (starts[mid] < at) lo = mid + 1; else hi = mid; }
      return lo;
    },
  };
}

function bucketsIn(index, buckets, from, to, chunkOfUrl, skip) {
  let added = 0;
  const { events } = index;
  for (let i = index.first(from); i < events.length && events[i].start < to; i++) {
    const event = events[i];
    if (event.end <= from || (skip && skip(event))) continue;
    const share = event.dur > 0 ? (Math.min(event.end, to) - Math.max(event.start, from)) / event.dur : 1;
    const ms = event.self * share;
    if (ms <= 0) continue;
    const key = bucketOfEvent(event, chunkOfUrl);
    buckets[key] = (buckets[key] ?? 0) + ms;
    added += ms;
  }
  return added;
}

function gcIn(index, from, to) {
  let ms = 0;
  const { events } = index;
  for (let i = index.first(from); i < events.length && events[i].start < to; i++) {
    const event = events[i];
    if (!GC_EVENT.test(event.name) || event.end <= from) continue;
    const share = event.dur > 0 ? (Math.min(event.end, to) - Math.max(event.start, from)) / event.dur : 1;
    ms += event.self * share;
  }
  return ms;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/**
 * One battle's frame intervals, hitches and long tasks.
 *
 * Every interval between consecutive shown frames is split into buckets: the earlier frame's stages (less the GC the
 * trace saw in its work, pro rata) and WebGL kinds, the rest of the main thread in the interval by kind, and the main
 * thread idle — the part the GPU process was busy through named apart. A **hitch** is an interval past SPIKE_FRAME_MS
 * and HITCH_RATIO × the battle's median: on a quiet machine every frame past 33 ms, on a loaded one the frames the load
 * alone does not explain. A hitch's cause is the bucket furthest past its median over the battle's ordinary intervals
 * (its excess, not its size: a render that takes 20 ms in every frame is not the cause of the one that took 200).
 *
 * @param readout the recorder's readout
 * @param trace { events, syncName, syncPerfMs, fromMs } or null (the recorder alone: the gap is untraced)
 * @param observers { tasks: [{t, ms}], loaf: [...], decodes: [...] } from the page
 * @param window { fromMs, toMs } performance.now() bounds of the battle the census measured (optional)
 */
export function analyzeBattle({ readout, trace = null, observers = {}, window = null, chunkOfUrl = defaultChunkOfUrl,
  spikeMs = SPIKE_FRAME_MS, longTaskMs = LONG_TASK_MS, hitchRatio = HITCH_RATIO } = {}) {
  const frames = framesOf(readout).filter((f) => !window || (f.tMs >= window.fromMs && f.tMs <= window.toMs));
  let events = [], tasks = [], gpuTasks = [];
  if (trace?.events?.length) {
    const main = rendererMainThread(trace.events, trace.syncName);
    const sync = trace.events.find((e) => e.name === trace.syncName && (!main || e.pid === main.pid));
    if (main && sync) {
      const offsetMs = sync.ts / 1000 - trace.syncPerfMs;
      events = mainThreadEvents(trace.events, main, offsetMs);
      tasks = events.filter((e) => TASK_EVENT.test(e.name) && !e.parent);
      const gpu = gpuMainThread(trace.events);
      if (gpu) gpuTasks = mainThreadEvents(trace.events, gpu, offsetMs).filter((e) => TASK_EVENT.test(e.name) && !e.parent);
    }
  }
  const traced = tasks.length > 0;
  const index = indexEvents(events);
  // the trace may begin after the entry (the census starts it when the battle phase begins): earlier gaps are untraced
  const tracedFrom = traced ? (trace.fromMs ?? -Infinity) : Infinity;
  const position = new Map(frames.map((f, i) => [f, i]));
  const shown = frames.filter((f) => f.battle && f.rendered && !f.paused);

  // every interval's buckets
  const rows = [];
  for (let k = 1; k < shown.length; k++) {
    const a = shown[k - 1], b = shown[k];
    // consecutive recorded frames only (a veil or a pause between them is not a hitch the player saw)
    if (position.get(b) !== position.get(a) + 1) continue;
    const interval = b.rafMs - a.rafMs;
    const workEnd = a.tMs + a.workMs;
    const tracedHere = a.tMs >= tracedFrom;
    const buckets = frameBuckets(a, tracedHere ? gcIn(index, a.tMs, workEnd) : 0);
    let busy = a.workMs;
    if (tracedHere) {
      // the rest of the main thread in the interval: the frame task's pipeline after the callback, and other tasks
      const gapTraced = bucketsIn(index, buckets, workEnd, b.tMs, chunkOfUrl, (e) => TASK_EVENT.test(e.name));
      const gapBusy = busyMs(tasks, workEnd, b.tMs);
      busy += gapBusy;
      // tasks with no traced children (their own time): charged as 'task:other'
      if (gapBusy - gapTraced > 0.5) buckets['task:other'] = (buckets['task:other'] ?? 0) + gapBusy - gapTraced;
    }
    // the gap's WebGL work happened inside those scripts: name it, and take it out of them
    moveGapGl(buckets, b);
    const rest = Math.max(0, interval - busy);
    if (rest > 0.5) {
      if (!tracedHere) buckets.gap = rest;
      else {
        // the main thread idle: the GPU process busy through it (a pipeline compile, a flush) or not (presentation)
        const gpuBusy = Math.min(rest, busyMs(gpuTasks, workEnd, b.tMs));
        if (gpuBusy > 0.5) buckets['idle:gpu'] = gpuBusy;
        if (rest - gpuBusy > 0.5) buckets.idle = rest - gpuBusy;
      }
    }
    rows.push({ a, b, interval, buckets });
  }

  const intervals = rows.map((r) => r.interval);
  const medianMs = median(intervals);
  const hitchMs = Math.max(spikeMs, hitchRatio * medianMs);
  // the ordinary interval's buckets: each key's median over the intervals that are not hitches
  const ordinary = rows.filter((r) => r.interval <= hitchMs);
  const keys = new Set();
  for (const r of rows) for (const key of Object.keys(r.buckets)) keys.add(key);
  const baseline = {};
  for (const key of keys) baseline[key] = median(ordinary.map((r) => r.buckets[key] ?? 0));

  // the recorder's first draws (a program into a framebuffer for the first time) by time, to name a hitch's new pipelines
  const drawRows = [...(readout?.firstDraws ?? [])].sort((x, y) => x.tMs - y.tMs);
  const drawsIn = (from, to) => {
    const names = {};
    for (const row of drawRows) { if (row.tMs >= to) break; if (row.tMs >= from) names[row.name] = (names[row.name] ?? 0) + 1; }
    return names;
  };
  const spikes = [];
  for (const { a, b, interval, buckets } of rows) {
    if (interval <= hitchMs) continue;
    const excess = {};
    for (const [key, ms] of Object.entries(buckets)) excess[key] = ms - (baseline[key] ?? 0);
    const key = dominant(excess);
    spikes.push({
      atMs: round(a.tMs, 1), simS: round(a.simS, 2), intervalMs: round(interval, 1), workMs: round(a.workMs, 1),
      cause: key ? causeOfBucket(key) : 'diffuse', dominant: key, excess: roundedBuckets(excess, 1), buckets: roundedBuckets(buckets),
      programs: b.programs - a.programs, simSteps: a.simSteps, links: a.links + b.gapLinks,
      firstDraws: (a.firstDraws ?? 0) + (b.gapFirstDraws ?? 0), firstDrawNames: drawsIn(a.tMs, b.tMs),
      topEvents: a.topEvents.map((e) => ({ name: e.name, ms: round(e.ms, 1) })), countdown: a.countdown, killcam: a.killcam,
    });
  }

  // long tasks: the trace's top-level tasks (else the observer's), each split as an interval is
  const longTasks = [];
  const source = traced ? tasks.filter((t) => t.dur > longTaskMs) : (observers.tasks ?? []).filter((t) => t.ms > longTaskMs)
    .map((t) => ({ start: t.t, end: t.t + t.ms, dur: t.ms }));
  for (const task of source) {
    if (window && (task.end < window.fromMs || task.start > window.toMs)) continue;
    const frame = frames.find((f) => f.tMs >= task.start - 0.5 && f.tMs + f.workMs <= task.end + 0.5 && f.workMs > 0);
    // on screen: the battle frame before the task drew the scene (behind the entry veil a task is entry time)
    let before = null;
    for (const f of frames) { if (f.tMs > task.start) break; before = f; }
    const visible = !!(frame ?? before)?.battle && !!(frame ?? before)?.rendered && !(frame ?? before)?.paused;
    const buckets = frame ? frameBuckets(frame, traced ? gcIn(index, frame.tMs, frame.tMs + frame.workMs) : 0) : {};
    if (traced) {
      bucketsIn(index, buckets, task.start, task.end, chunkOfUrl, (e) => e === task
        || (frame && e.end > frame.tMs && e.start < frame.tMs + frame.workMs));
      // the task's own time past what its events name
      const named = Object.values(buckets).reduce((sum, ms) => sum + ms, 0);
      if (task.dur - named > 0.5) buckets['task:other'] = task.dur - named;
    }
    const excess = {};
    for (const [key, ms] of Object.entries(buckets)) excess[key] = frame ? ms - (baseline[key] ?? 0) : ms;
    const key = dominant(excess);
    longTasks.push({
      atMs: round(task.start, 1), ms: round(task.dur, 1), inFrame: !!frame, visible, simS: round((frame ?? before)?.simS ?? 0, 2),
      cause: key ? causeOfBucket(key) : (frame ? 'diffuse' : 'untraced'), dominant: key, buckets: roundedBuckets(buckets),
    });
  }

  return {
    frames: shown.length, intervals: { ...summarizeIntervals(intervals), medianMs: round(medianMs, 1), hitchMs: round(hitchMs, 1), hitches: spikes.length },
    baseline: roundedBuckets(baseline, 0.3), heap: traced ? gcOf(events, tracedFrom) : heapOf(shown), links: linksOf(shown, readout?.links ?? []),
    firstDraws: firstDrawsOf(shown, drawRows), draws: drawsOf(shown),
    spikes, longTasks, summary: summarize(spikes, longTasks), traced,
  };
}

/**
 * (battle-spikes-253, the draw-count lever) The rendered battle frames' draw calls, program switches and distinct
 * programs, and the render's main-thread time (the 'post' stage: the composer's whole submission) — median and 90th
 * percentile, and the submission per draw. Null for a readout without the draw columns.
 */
export function drawsOf(frames) {
  const rendered = frames.filter((f) => f.rendered && typeof f.draws === 'number' && f.draws > 0);
  if (!rendered.length) return null;
  const pick = (values, q) => {
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  };
  const stat = (values) => ({ median: round(pick(values, 0.5), 1), p90: round(pick(values, 0.9), 1) });
  const submitMs = rendered.map((f) => f.stages?.post ?? 0);
  return {
    frames: rendered.length, draws: stat(rendered.map((f) => f.draws)), programSwitches: stat(rendered.map((f) => f.programSwitches ?? 0)),
    programsUsed: stat(rendered.map((f) => f.programsUsed ?? 0)), submitMs: stat(submitMs),
    usPerDraw: round(pick(rendered.map((f) => (f.stages?.post ?? 0) * 1000 / f.draws), 0.5), 1),
  };
}

/** First draws over the shown frames (a program into a framebuffer for the first time), and by program name. */
export function firstDrawsOf(frames, rows = []) {
  let count = 0;
  for (const f of frames) count += (f.firstDraws ?? 0) + (f.gapFirstDraws ?? 0);
  const from = frames[0]?.tMs ?? 0, to = (frames[frames.length - 1]?.tMs ?? 0) + (frames[frames.length - 1]?.workMs ?? 0);
  const names = {};
  for (const row of rows) if (row.tMs >= from && row.tMs <= to) names[row.name] = (names[row.name] ?? 0) + 1;
  return { count, names: Object.fromEntries(Object.entries(names).sort((x, y) => y[1] - x[1]).slice(0, 40)) };
}

/** The GPU process's main thread (CrGpuMain). */
export function gpuMainThread(events) {
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrGpuMain') return { pid: e.pid, tid: e.tid };
  return null;
}

/**
 * The main thread's collections from the trace: scavenges and mark-compacts, their time, the scavenges past 5 ms, and
 * the allocation rate (each scavenge's heap before it, less the heap the one before left).
 */
export function gcOf(events, fromMs = -Infinity) {
  const minor = events.filter((e) => e.name === 'MinorGC' && e.start >= fromMs);
  const major = events.filter((e) => e.name === 'MajorGC' && e.start >= fromMs);
  let allocated = 0;
  for (let i = 1; i < minor.length; i++) {
    const before = minor[i].heapBefore, after = minor[i - 1].heapAfter;
    if (before != null && after != null) allocated += Math.max(0, before - after);
  }
  const span = minor.length > 1 ? (minor[minor.length - 1].start - minor[0].start) / 1000 : 0;
  return {
    allocMBPerS: span > 0 ? round(allocated / 1048576 / span, 1) : null,
    scavenges: minor.length, scavengeMs: round(minor.reduce((sum, e) => sum + e.dur, 0), 1), scavengesOver5: minor.filter((e) => e.dur > 5).length,
    markCompacts: major.length, markCompactMs: round(major.reduce((sum, e) => sum + e.dur, 0), 1),
    heapAfterMB: minor.length ? round((minor[minor.length - 1].heapAfter ?? 0) / 1048576, 1) : null,
  };
}

/**
 * The JS heap across the shown frames (`--enable-precise-memory-info`): the allocation rate (the rises from frame to
 * frame, a GC's drop excluded), the collections the heap fell by (a drop past 0.25 MB) and the peak.
 */
export function heapOf(frames) {
  let rise = 0, drops = 0, dropMB = 0, peak = 0;
  for (let i = 1; i < frames.length; i++) {
    const delta = frames[i].heapMB - frames[i - 1].heapMB;
    if (delta >= 0) rise += delta;
    else if (delta < -0.25) { drops++; dropMB -= delta; }
    peak = Math.max(peak, frames[i].heapMB);
  }
  const seconds = frames.length > 1 ? (frames[frames.length - 1].tMs - frames[0].tMs) / 1000 : 0;
  return { allocMBPerS: seconds > 0 ? round(rise / seconds, 2) : null, gcDrops: drops, gcDropMB: round(dropMB, 1), peakMB: round(peak, 1) };
}

/**
 * First-use WebGL work over the shown frames: programs linked (in frames and between them), the frames that linked, the
 * time, and the programs by name (the recorder's link rows inside the frames' span).
 */
export function linksOf(frames, rows = []) {
  let links = 0, linkMs = 0, framesLinking = 0, texMs = 0, bufMs = 0;
  for (const f of frames) {
    const n = (f.links ?? 0) + (f.gapLinks ?? 0);
    links += n;
    if (n > 0) framesLinking++;
    linkMs += (f.linkMs ?? 0) + (f.gapLinkMs ?? 0);
    texMs += (f.texMs ?? 0) + (f.gapTexMs ?? 0);
    bufMs += (f.bufMs ?? 0) + (f.gapBufMs ?? 0);
  }
  const from = frames[0]?.tMs ?? 0, to = (frames[frames.length - 1]?.tMs ?? 0) + (frames[frames.length - 1]?.workMs ?? 0);
  const names = {};
  for (const row of rows) if (row.tMs >= from && row.tMs <= to) names[row.name] = (names[row.name] ?? 0) + 1;
  return { links, framesLinking, linkMs: round(linkMs, 1), texMs: round(texMs, 1), bufMs: round(bufMs, 1), names };
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

/** Counts and excess time (past one 16.7 ms frame) by cause; the long tasks a player saw (the veil's are entry time). */
export function summarize(spikes, longTasks) {
  const byCause = {};
  for (const spike of spikes) {
    const row = byCause[spike.cause] ??= { spikes: 0, excessMs: 0, longTasks: 0, longTaskMs: 0 };
    row.spikes++;
    row.excessMs = round(row.excessMs + Math.max(0, spike.intervalMs - 16.7), 1);
  }
  for (const task of longTasks) {
    if (!task.visible) continue;
    const row = byCause[task.cause] ??= { spikes: 0, excessMs: 0, longTasks: 0, longTaskMs: 0 };
    row.longTasks++;
    row.longTaskMs = round(row.longTaskMs + task.ms, 1);
  }
  return Object.fromEntries(Object.entries(byCause).sort((a, b) => b[1].excessMs + b[1].longTaskMs - a[1].excessMs - a[1].longTaskMs));
}
