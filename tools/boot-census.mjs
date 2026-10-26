#!/usr/bin/env node
// boot-census.mjs — the cold first load, as a player meets it (UI-LOCKDOWN E, 2026-10-26).
// Copyright (c) 2026 Kevin B. Liu. First-party tool; see NOTICE.md.
//
// The owner, 2026-10-26: "when i first login its rellly laggy and even the claude tank animation doesnnt play bc its
// just loading". A fresh browser per profile (an empty HTTP cache) opens '/', the boot screen plays to "Ready for
// battle" (#cot-boot-gate.on), a press passes the gate, and the Garage's first frame ends the run. A Chrome trace covers
// it all; the tool writes, per profile:
//   - every main-thread task over 50 ms, in two windows: the boot screen (navigation to Ready) and the gate to the
//     Garage's first frame, each with its self time by kind (module evaluation, compile, function calls by chunk,
//     style, layout, paint, image decode, GC, parse);
//   - the frames of the boot window: the compositor's own reports (PipelineReporter: presented, dropped, partial; viz's
//     DroppedFrame events, per half second) and the main thread's animation frames (each gap over 1.5 frame intervals,
//     in frames lost);
//   - the GPU process's main thread tasks over 50 ms in the boot window (on a Mac the display compositor draws there, so
//     a long WebGL command drops every frame, the compositor's own animations included), and every WebGL program
//     reflection call over 20 ms, named from its shader source, with how long before it the program was linked.
// `navigator.webdriver` is hidden, so the game shows its boot gate and veils as it does for a player (as nav-timeline).
//
//   node tools/boot-census.mjs --dist=<dir> [--vercel-json=<path>] --label=<label> --out=<dir> [--profiles=desktop,phone]
//        [--lock] [--budget-min=20] [--gate]
// --gate (part E's boot budget): exit 4 when a task over 50 ms runs while the boot screen is up, or the boot window
// drops frames past --max-dropped (default 0) on any profile.
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createCaptureLock } from './capture-lock.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const dist = resolve(option('dist', 'dist'));
const vercelJson = option('vercel-json', '');
const label = option('label', 'build');
const out = resolve(option('out', 'boot-census'));
const profiles = option('profiles', 'desktop,phone').split(',').filter(Boolean);
const useLock = argv.includes('--lock');
const budgetMin = Number(option('budget-min', '20'));
const gate = argv.includes('--gate');
const maxDropped = Number(option('max-dropped', '0'));
// --no-js-profile: no V8 sampler in the trace (its signal can wedge a renderer in WebAudio's convolver FFT, the perf lane's
// 2026-10-25 finding); --no-convolver: the reverb's convolver a pass-through gain, so the sampler can run
const jsProfile = !argv.includes('--no-js-profile');
const noConvolver = argv.includes('--no-convolver');
const LONG_MS = 50;
const root = new URL('..', import.meta.url).pathname;

const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36';
const PROFILES = {
  desktop: { viewport: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false }, cpu: 1,
    network: { latency: 40, download: 50e6 / 8, upload: 10e6 / 8 } },
  phone: { viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, cpu: 4,
    network: { latency: 150, download: 9e6 / 8, upload: 2e6 / 8 }, userAgent: PHONE_UA },
};

function freePort() {
  return new Promise((done, fail) => {
    const probe = net.createServer();
    probe.once('error', fail);
    probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => done(port)); });
  });
}

// The in-page marks the trace places the windows by, and the main thread's animation frames.
const PROBE = `(() => {
  if (window.__bootCensus) return;
  Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true });
  const census = window.__bootCensus = { raf: [], readyAt: null, garageAt: null, gatePressedAt: null, docAt: performance.now(), programs: [], slowQueries: [] };
  performance.mark('boot-census:doc');
  // every three program the renderer acquires, with what was drawing it (the shadow pass or forward, the object and its
  // ancestors, its material) and the calling chunks past three's own frames
  let drawing = null;
  const path = (object) => { const names = []; for (let o = object, i = 0; o && i < 4; o = o.parent, i++) names.push((o.name || o.type || '?') + (o.visible === false ? '(hidden)' : '')); return names.join('<'); };
  const chunks = () => {
    const limit = Error.stackTraceLimit; Error.stackTraceLimit = 60;
    let stack = ''; try { stack = new Error().stack || ''; } finally { Error.stackTraceLimit = limit; }
    return stack.split(String.fromCharCode(10)).slice(3, 60).map((line) => (line.match(/([\\w.-]+\\.js):(\\d+)/) || [])[0] || '')
      .filter((frame) => frame && !/^(three\\.(module|core)|renderLayers)-/.test(frame)).filter((frame, i, all) => all.indexOf(frame) === i).slice(0, 5).join(' ');
  };
  const install = () => {
    const renderer = window.__DEBUG?.renderer;
    const programs = renderer?.info?.programs;
    if (!programs) return false;
    const direct = renderer.renderBufferDirect;
    renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
      const outer = drawing; drawing = { object, material, scene };
      try { return direct.call(this, camera, scene, geometry, material, object, group); } finally { drawing = outer; }
    };
    const push = programs.push;
    programs.push = function (...made) {
      for (const program of made) if (census.programs.length < 3000) census.programs.push({ t: performance.now(), name: program.name || program.type || '?',
        drawer: drawing ? (drawing.scene ? 'forward ' : 'shadow ') + path(drawing.object) + ' [' + (drawing.material?.name || drawing.material?.type || '?') + ']' : 'compile (no draw)',
        chunks: chunks() });
      return push.apply(this, made);
    };
    return true;
  };
  const installTimer = setInterval(() => { if (install()) clearInterval(installTimer); }, 20);
  // every program query that holds the main thread over 20 ms: its pname, whether the program had already reported its
  // link complete (and when), and what was drawing (a synchronous query waits on the GPU process's whole queue)
  const completedAt = new WeakMap();
  // the program's name from its own source (three's SHADER_NAME, or SHADER_TYPE for a built-in), so it reads without the
  // game's debug hooks (a real user's page: navigator.webdriver hidden, no window.__DEBUG)
  const nameOf = (gl, program) => {
    try {
      for (const shader of gl.getAttachedShaders(program) || []) {
        const source = gl.getShaderSource(shader) || '';
        const named = /#define SHADER_NAME (.+)/.exec(source) || /#define SHADER_TYPE (.+)/.exec(source);
        if (named) return named[1].trim();
      }
    } catch {}
    return '?';
  };
  // every program reflection or link-state call (three's first use reads the program's and shaders' logs, then its link
  // status, then its uniforms: the first of them waits for the link), and every link, so a slow call names its program
  // and says how long before it was linked (a program made in the same task, or one linked earlier and still pending)
  const linkedAt = new WeakMap(), programOf = new WeakMap();
  // each program's #define lines (both stages), and the last program linked under each name: a slow program made in a
  // frame says which defines it changed against the one before it (a light count, a shadow, a colour space, a key)
  const definesOf = new WeakMap(), lastByName = new Map(), changedOf = new WeakMap();
  const defineLines = (gl, program) => {
    const lines = [];
    try {
      for (const shader of gl.getAttachedShaders(program) || []) {
        const stage = gl.getShaderParameter(shader, gl.SHADER_TYPE) === gl.VERTEX_SHADER ? 'v' : 'f';
        for (const line of (gl.getShaderSource(shader) || '').split(String.fromCharCode(10))) {
          const trimmed = line.trim();
          if (trimmed.startsWith('#define ') && !trimmed.startsWith('#define SHADER_NAME')) lines.push(stage + ':' + trimmed.slice(8));
        }
      }
    } catch {}
    return lines;
  };
  for (const proto of [window.WebGL2RenderingContext?.prototype, window.WebGLRenderingContext?.prototype]) {
    if (!proto) continue;
    const link = proto.linkProgram;
    proto.linkProgram = function (program) {
      try { for (const shader of this.getAttachedShaders(program) || []) programOf.set(shader, program); } catch {}
      linkedAt.set(program, performance.now());
      try {
        const name = nameOf(this, program), lines = defineLines(this, program), before = lastByName.get(name);
        definesOf.set(program, lines);
        if (before) {
          const now = new Set(lines), was = new Set(before);
          const added = lines.filter((l) => !was.has(l)), removed = before.filter((l) => !now.has(l));
          changedOf.set(program, added.length || removed.length ? '+[' + added.slice(0, 6).join(', ') + '] -[' + removed.slice(0, 6).join(', ') + ']' : 'same defines');
        } else changedOf.set(program, 'first of its name');
        lastByName.set(name, lines);
      } catch {}
      return link.call(this, program);
    };
    for (const method of ['getProgramInfoLog', 'getShaderInfoLog', 'getProgramParameter', 'getShaderParameter', 'getActiveUniform',
      'getActiveAttrib', 'getUniformLocation', 'getAttribLocation', 'getUniformBlockIndex']) {
      const call = proto[method];
      if (typeof call !== 'function') continue;
      proto[method] = function (target, ...rest) {
        const t0 = performance.now();
        const value = call.call(this, target, ...rest);
        const t1 = performance.now();
        const program = method.includes('Shader') ? programOf.get(target) : target;
        if (method === 'getProgramParameter' && rest[0] === 0x91B1 && value === true && program && !completedAt.has(program)) completedAt.set(program, t1);
        if (t1 - t0 > 20 && census.slowQueries.length < 400) census.slowQueries.push({ t: t0, ms: t1 - t0, pname: method === 'getProgramParameter' || method === 'getShaderParameter' ? rest[0] : 0,
          method, name: program ? nameOf(this, program) : '?', linkedFor: program && linkedAt.has(program) ? Math.round(t0 - linkedAt.get(program)) : null,
          stack: chunks(), defines: program ? changedOf.get(program) ?? null : null, completeFor: program && completedAt.has(program) ? Math.round(t0 - completedAt.get(program)) : null,
          drawer: drawing ? path(drawing.object) + ' [' + (drawing.material?.name || drawing.material?.type || '?') + ']' : 'none' });
        return value;
      };
    }
  }
  const visible = (sel) => { const el = document.querySelector(sel); if (!el) return false;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false; }
    return true; };
  const garage = () => visible('.cot-garage') && !document.querySelector('.cot-garage.awaiting-boot')
    && [...document.querySelectorAll('.cot-garage .cot-card')].some((el) => el.getBoundingClientRect().width > 0);
  addEventListener('pointerdown', () => { if (census.readyAt !== null && census.gatePressedAt === null) { census.gatePressedAt = performance.now(); performance.mark('boot-census:gate'); } }, { capture: true });
  addEventListener('keydown', () => { if (census.readyAt !== null && census.gatePressedAt === null) { census.gatePressedAt = performance.now(); performance.mark('boot-census:gate'); } }, { capture: true });
  const tick = (t) => {
    if (census.raf.length < 20000) census.raf.push(t);
    if (census.readyAt === null && visible('#cot-boot-gate.on')) { census.readyAt = performance.now(); performance.mark('boot-census:ready'); }
    if (census.gatePressedAt !== null && census.garageAt === null && garage()) { census.garageAt = performance.now(); performance.mark('boot-census:garage'); }
    if (census.garageAt === null || performance.now() - census.garageAt < 1500) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`;

// the probe is a string: compile it here, so a syntax slip fails the run at launch rather than as a page error and a
// census that never marks (2026-10-26: after2's first run waited 300 s on marks the broken probe never set)
new Function(PROBE);

async function traced(page, run) {
  const session = await page.createCDPSession();
  await session.send('Tracing.start', {
    transferMode: 'ReturnAsStream',
    traceConfig: { includedCategories: ['toplevel', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8', 'v8.execute',
      'blink.user_timing', 'benchmark', 'disabled-by-default-devtools.timeline.frame', 'loading', 'graphics.pipeline', 'cc', 'viz', 'gpu', 'gpu.angle',
      ...(jsProfile ? ['disabled-by-default-v8.cpu_profiler'] : [])],
    excludedCategories: ['*'] },
  });
  try { await run(); } finally {
    // the trace ends whatever the run did, so a failed run still says where it stood
  }
  const done = new Promise((resolveDone) => session.once('Tracing.tracingComplete', resolveDone));
  await session.send('Tracing.end');
  const { stream } = await done;
  const chunks = [];
  for (;;) {
    const { data, base64Encoded, eof } = await session.send('IO.read', { handle: stream, size: 1 << 22 });
    chunks.push(Buffer.from(data, base64Encoded ? 'base64' : 'utf8'));
    if (eof) break;
  }
  await session.send('IO.close', { handle: stream }).catch(() => {});
  await session.detach().catch(() => {});
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  return Array.isArray(parsed) ? parsed : parsed.traceEvents || [];
}

const file = (url) => String(url || '').split('?')[0].split('/').pop() || '';
/** A trace event's kind, for the self-time tables: a function call by its chunk and name, a compile or an evaluation
 *  by its chunk, the rest by the event's own name. */
function kindOf(event) {
  const data = event.args?.data ?? {};
  switch (event.name) {
    case 'FunctionCall': return `call ${file(data.url)}${data.functionName ? ` ${data.functionName}` : ''}`;
    case 'EvaluateScript': return `evaluate ${file(data.url)}`;
    case 'v8.evaluateModule': return `evaluate module ${file(data.url ?? event.args?.url)}`;
    case 'v8.compile': case 'v8.compileModule': case 'V8.CompileCode': return `compile ${file(data.url ?? event.args?.fileName)}`;
    case 'TimerFire': return 'timer';
    case 'FireAnimationFrame': return 'animation frame';
    case 'EventDispatch': return `event ${data.type ?? ''}`;
    case 'MajorGC': case 'MinorGC': case 'V8.GCScavenger': case 'V8.GCFinalizeMC': case 'BlinkGC.AtomicPhase': return 'gc';
    case 'Decode Image': case 'ImageDecodeTask': case 'Decode LazyPixelRef': return 'image decode';
    default: return event.name;
  }
}

/** The page's main thread: the renderer thread whose events name this origin's chunks. */
function mainThread(events, origin) {
  const names = new Map();
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain') names.set(`${e.pid}:${e.tid}`, true);
  const score = new Map();
  for (const e of events) {
    const key = `${e.pid}:${e.tid}`;
    if (!names.has(key)) continue;
    const url = e.args?.data?.url ?? '';
    if (typeof url === 'string' && url.startsWith(origin)) score.set(key, (score.get(key) ?? 0) + 1);
  }
  return [...score].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function analyse(events, origin) {
  const main = mainThread(events, origin);
  if (!main) return { error: 'no main thread for the page found in the trace' };
  const [pid, tid] = main.split(':').map(Number);
  const marks = {};
  for (const e of events) {
    if (e.pid === pid && typeof e.name === 'string' && e.name.startsWith('boot-census:') && marks[e.name.slice(12)] === undefined) marks[e.name.slice(12)] = e.ts;
  }
  const thread = events.filter((e) => e.pid === pid && e.tid === tid && e.ph === 'X' && typeof e.dur === 'number').sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  // each event's parent by containment, then every task's self time by kind over its subtree
  const stack = [];
  const children = new Map();
  for (const e of thread) {
    while (stack.length && stack.at(-1).ts + stack.at(-1).dur <= e.ts) stack.pop();
    const parent = stack.at(-1);
    if (parent) { if (!children.has(parent)) children.set(parent, []); children.get(parent).push(e); }
    stack.push(e);
  }
  const tasks = thread.filter((e) => (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask') && e.dur > LONG_MS * 1000
    && !thread.some((o) => o !== e && (o.name === 'RunTask' || o.name === 'ThreadControllerImpl::RunTask') && o.ts <= e.ts && o.ts + o.dur >= e.ts + e.dur && o.dur > e.dur));
  let jsOf = () => ({});
  const describe = (task) => {
    const self = new Map();
    const walk = (e) => {
      const kids = children.get(e) ?? [];
      const own = e.dur - kids.reduce((sum, k) => sum + Math.min(k.dur, e.ts + e.dur - k.ts), 0);
      if (e !== task || own > 0) {
        const key = e === task ? '(task, unattributed)' : kindOf(e);
        self.set(key, (self.get(key) ?? 0) + Math.max(0, own));
      }
      for (const k of kids) walk(k);
    };
    walk(task);
    return { atMs: Math.round((task.ts - (marks.doc ?? task.ts)) / 1000), ms: Math.round(task.dur / 1000),
      self: [...self].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, us]) => `${Math.round(us / 1000)} ms ${k}`), ...jsOf(task) };
  };
  // V8's sampled profile of the page's process (ProfileChunk), so a task's microtasks and calls name their functions
  const profiles = new Map();
  // the main thread's profile alone: a worker's (the decor planner, the cloud bakes) shares the pid, and its samples
  // were billed to whichever main-thread task overlapped them
  for (const e of events) {
    if (e.pid !== pid) continue;
    if (e.name === 'Profile' && e.tid === tid && e.args?.data?.startTime !== undefined) profiles.set(e.id, { t: e.args.data.startTime, nodes: new Map(), samples: [] });
    else if (e.name === 'ProfileChunk') {
      const profile = profiles.get(e.id);
      if (!profile) continue;
      const cpu = e.args?.data?.cpuProfile ?? {};
      for (const node of cpu.nodes ?? []) profile.nodes.set(node.id, node);
      const deltas = e.args?.data?.timeDeltas ?? [];
      (cpu.samples ?? []).forEach((id, i) => { profile.t += deltas[i] ?? 0; profile.samples.push([profile.t, id]); });
    }
  }
  const frameLabel = (node) => `${node.callFrame?.functionName || '(anon)'} ${file(node.callFrame?.url)}:${(node.callFrame?.lineNumber ?? -1) + 1}`;
  jsOf = (task) => {
    const self = new Map(), total = new Map();
    for (const profile of profiles.values()) {
      for (let i = 0; i < profile.samples.length; i++) {
        const [ts, id] = profile.samples[i];
        if (ts < task.ts || ts > task.ts + task.dur) continue;
        const node = profile.nodes.get(id);
        if (!node || node.callFrame?.functionName === '(idle)') continue;
        const dt = (profile.samples[i + 1]?.[0] ?? ts + 500) - ts;
        self.set(frameLabel(node), (self.get(frameLabel(node)) ?? 0) + dt);
        const seen = new Set();
        for (let cur = node; cur; cur = cur.parent !== undefined ? profile.nodes.get(cur.parent) : null) {
          const l = frameLabel(cur);
          if (seen.has(l) || /^\((root|program)\)/.test(l)) continue;
          seen.add(l);
          total.set(l, (total.get(l) ?? 0) + dt);
        }
      }
    }
    const top = (map, k) => [...map].sort((a, b) => b[1] - a[1]).slice(0, k).map(([l, us]) => `${Math.round(us / 1000)} ms ${l}`);
    return { jsSelf: top(self, 8), jsTotal: top(total, 18) };
  };
  const between = (from, to) => tasks.filter((t) => from !== undefined && t.ts >= from && (to === undefined || t.ts < to)).map(describe);
  // the compositor's frames in the boot window (PipelineReporter's state), on any process
  const frames = { presented: 0, dropped: 0, partial: 0 };
  for (const e of events) {
    if (e.name !== 'PipelineReporter' || e.ph !== 'b' || marks.doc === undefined || marks.ready === undefined) continue;
    if (e.ts < marks.doc || e.ts > marks.ready) continue;
    const state = e.args?.chrome_frame_reporter?.state;
    if (state === 'STATE_DROPPED') frames.dropped++;
    else if (state === 'STATE_PRESENTED_PARTIAL') frames.partial++;
    else if (state) frames.presented++;
  }
  // the compositor's own frame events in the boot window (any process): drawn, dropped, begun
  const frameEvents = {};
  for (const e of events) {
    if (marks.doc === undefined || marks.ready === undefined || e.ts < marks.doc || e.ts > marks.ready) continue;
    if (!['DrawFrame', 'DroppedFrame', 'BeginFrame', 'Graphics.Pipeline', 'PipelineReporter', 'Frame'].includes(e.name)) continue;
    if (e.ph === 'e' || e.ph === 'E') continue;
    frameEvents[e.name] = (frameEvents[e.name] ?? 0) + 1;
  }
  // (2026-10-26) the GPU process: on a Mac the display compositor draws on the GPU main thread that also runs WebGL's
  // commands, so a long WebGL command (a draw waiting on a link, a large upload) drops every compositor frame, the
  // compositor's own animations included. Its long tasks in the boot window, what they ran, and the dropped frames per
  // half second
  const threadNames = new Map();
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') threadNames.set(`${e.pid}:${e.tid}`, e.args?.name);
  const gpuMain = [...threadNames].find(([, name]) => name === 'CrGpuMain')?.[0];
  const gpuTasks = [];
  if (gpuMain && marks.doc !== undefined && marks.ready !== undefined) {
    const [gpid, gtid] = gpuMain.split(':').map(Number);
    const gthread = events.filter((e) => e.pid === gpid && e.tid === gtid && e.ph === 'X' && typeof e.dur === 'number').sort((x, y) => x.ts - y.ts || y.dur - x.dur);
    const gkids = new Map(), gstack = [];
    for (const e of gthread) {
      while (gstack.length && gstack.at(-1).ts + gstack.at(-1).dur <= e.ts) gstack.pop();
      const parent = gstack.at(-1);
      if (parent) { if (!gkids.has(parent)) gkids.set(parent, []); gkids.get(parent).push(e); }
      gstack.push(e);
    }
    const top = gthread.filter((e) => (e.name === 'ThreadControllerImpl::RunTask' || e.name === 'RunTask') && e.dur > LONG_MS * 1000
      && e.ts >= marks.doc && e.ts <= marks.ready && !gthread.some((o) => o !== e && o.dur > e.dur && o.ts <= e.ts && o.ts + o.dur >= e.ts + e.dur
        && (o.name === 'ThreadControllerImpl::RunTask' || o.name === 'RunTask')));
    for (const task of top) {
      const self = new Map();
      const walk = (e) => {
        const kids = gkids.get(e) ?? [];
        const own = e.dur - kids.reduce((sum, k) => sum + Math.min(k.dur, e.ts + e.dur - k.ts), 0);
        if (e !== task) self.set(e.name, (self.get(e.name) ?? 0) + Math.max(0, own));
        for (const k of kids) walk(k);
      };
      walk(task);
      // what the page's main thread was running as this GPU task began
      const page = thread.find((e) => (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask') && e.ts <= task.ts && e.ts + e.dur >= task.ts);
      gpuTasks.push({ atMs: Math.round((task.ts - marks.doc) / 1000), ms: Math.round(task.dur / 1000),
        self: [...self].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, us]) => `${Math.round(us / 1000)} ms ${k}`),
        pageTask: page ? { atMs: Math.round((page.ts - marks.doc) / 1000), ms: Math.round(page.dur / 1000) } : null });
    }
  }
  const droppedTimeline = {};
  for (const e of events) {
    if (e.name !== 'DroppedFrame' || marks.doc === undefined || marks.ready === undefined || e.ts < marks.doc || e.ts > marks.ready) continue;
    if (e.ph === 'e' || e.ph === 'E') continue;
    const bucket = Math.floor((e.ts - marks.doc) / 500_000) * 500;
    droppedTimeline[bucket] = (droppedTimeline[bucket] ?? 0) + 1;
  }
  return {
    frameEvents,
    gpuTasks,
    droppedTimeline,
    marksMs: Object.fromEntries(Object.entries(marks).map(([k, ts]) => [k, Math.round((ts - marks.doc) / 1000)])),
    bootScreen: between(marks.doc, marks.ready),
    gateToGarage: between(marks.gate ?? marks.ready, marks.garage),
    compositorFrames: frames,
  };
}

/** The main thread's animation frames in the boot window: gaps over 1.5 intervals, in frames lost. */
function rafLoss(raf, from, to) {
  const ticks = raf.filter((t) => t >= from && t <= to);
  let lost = 0, worst = 0;
  for (let i = 1; i < ticks.length; i++) {
    const gap = ticks[i] - ticks[i - 1];
    worst = Math.max(worst, gap);
    if (gap > 25) lost += Math.round(gap / 16.67) - 1;
  }
  return { frames: ticks.length, lost, worstGapMs: Math.round(worst) };
}

const lock = useLock ? createCaptureLock() : null;
let server = null;
const results = { label, dist, profiles: {} };
let failed = false;
try {
  if (lock) {
    await lock.acquire(150 * 60 * 1000, { place: `boot-census-${label}` });
    setInterval(() => lock.refresh(), 30_000).unref();
    setTimeout(() => { console.error(`boot-census: past its ${budgetMin} min budget`); process.exit(3); }, budgetMin * 60_000).unref();
  }
  const port = await freePort();
  server = spawn(process.execPath, [join(root, 'tools/vercel-static-preview.mjs'), `--dist=${dist}`, `--port=${port}`,
    ...(vercelJson ? [`--vercel-json=${resolve(vercelJson)}`] : [])], { stdio: 'ignore' });
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100 && !await fetch(origin).then(() => true, () => false); i++) await new Promise((r) => setTimeout(r, 100));
  for (const name of profiles) {
    const profile = PROFILES[name];
    // a fresh browser: an empty HTTP cache, no service worker, no storage
    const browser = await puppeteer.launch({ headless: true, protocolTimeout: 360_000,
      args: ['--no-sandbox', '--use-gl=angle', '--enable-webgl', '--js-flags=--max-old-space-size=3072', '--window-size=1500,960'] });
    try {
      const page = await browser.newPage();
      await page.setViewport(profile.viewport);
      if (profile.userAgent) await page.setUserAgent(profile.userAgent);
      await page.emulateNetworkConditions(profile.network);
      await page.emulateCPUThrottling(profile.cpu);
      await page.evaluateOnNewDocument(PROBE);
      if (noConvolver) {
        await page.evaluateOnNewDocument(() => {
          for (const proto of [window.BaseAudioContext?.prototype, window.AudioContext?.prototype, window.OfflineAudioContext?.prototype]) {
            if (proto && 'createConvolver' in proto) proto.createConvolver = function () { return this.createGain(); };
          }
          if (window.ConvolverNode) window.ConvolverNode = function ConvolverNode(context) { return context.createGain(); };
        });
      }
      const consoleErrors = [];
      page.on('console', (m) => { if (m.type() === 'error' && consoleErrors.length < 20) consoleErrors.push(m.text().slice(0, 300)); });
      page.on('pageerror', (e) => { if (consoleErrors.length < 20) consoleErrors.push(`pageerror ${String(e?.message || e).slice(0, 300)}`); });
      // where the boot stood, when a wait gives up
      const standing = () => page.evaluate(() => ({ stage: document.querySelector('#cot-boot [data-boot-stage], #cot-boot .stage, #cot-boot-stage')?.textContent?.trim() ?? null,
        bootText: document.getElementById('cot-boot')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 200) ?? null,
        timings: window.__BOOT_TIMINGS ?? null, ready: window.__GAME_READY ?? null, phase: window.__DEBUG?.game?.phase ?? null,
        census: window.__bootCensus ? { readyAt: window.__bootCensus.readyAt, gatePressedAt: window.__bootCensus.gatePressedAt, garageAt: window.__bootCensus.garageAt } : null,
      })).catch((error) => ({ unreadable: String(error?.message || error).split('\n')[0] }));
      let census = null;
      const events = await traced(page, async () => {
        await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
        await page.waitForFunction(() => window.__bootCensus?.readyAt !== null && window.__bootCensus?.readyAt !== undefined, { timeout: 300_000, polling: 100 });
        await new Promise((r) => setTimeout(r, 500));
        const { width, height } = profile.viewport;
        if (profile.viewport.hasTouch) await page.touchscreen.tap(Math.round(width / 2), Math.round(height * 0.62));
        else await page.mouse.click(Math.round(width / 2), Math.round(height * 0.62));
        await page.waitForFunction(() => window.__bootCensus?.garageAt !== null && window.__bootCensus?.garageAt !== undefined, { timeout: 300_000, polling: 100 });
        await new Promise((r) => setTimeout(r, 1600));
        census = await page.evaluate(() => ({ ...window.__bootCensus, bootTimings: window.__BOOT_TIMINGS ?? null }));
      }).catch(async (error) => {
        const where = await standing();
        console.error(`boot-census: ${name}: ${String(error?.message || error).split('\n')[0]}\n  standing: ${JSON.stringify(where).slice(0, 1500)}\n  errors: ${JSON.stringify(consoleErrors).slice(0, 1500)}`);
        results.profiles[name] = { error: String(error?.message || error).split('\n')[0], standing: where, consoleErrors };
        throw error;
      });
      const analysis = analyse(events, origin);
      if (census) {
        for (const list of [analysis.bootScreen ?? [], analysis.gateToGarage ?? []]) for (const task of list) {
          const from = census.docAt + task.atMs, to = from + task.ms;
          const made = census.programs.filter((row) => row.t >= from && row.t <= to);
          // and those made in the 3 s before it: a task that binds programs made earlier, still linking, made none itself
          const before = census.programs.filter((row) => row.t >= from - 3000 && row.t < from);
          task.programs = { made: made.length, rows: made.slice(0, 40).map((row) => `${row.name} — ${row.drawer} — ${row.chunks}`),
            madeBefore: before.length, before: before.slice(-30).map((row) => `${Math.round(from - row.t)} ms before: ${row.name} — ${row.drawer} — ${row.chunks}`) };
        }
      }
      analysis.mainFrames = census ? rafLoss(census.raf, 0, census.readyAt) : null;
      analysis.bootTimings = census?.bootTimings ?? null;
      analysis.slowQueries = census?.slowQueries ?? [];
      analysis.readyMs = census ? Math.round(census.readyAt) : null;
      analysis.garageMs = census ? Math.round(census.garageAt) : null;
      results.profiles[name] = analysis;
      const boot = analysis.bootScreen ?? [];
      console.log(`${name}: ready ${analysis.readyMs} ms, garage ${analysis.garageMs} ms; boot screen: ${boot.length} tasks over ${LONG_MS} ms`
        + ` (${boot.reduce((a, t) => a + t.ms, 0)} ms), compositor frames ${JSON.stringify(analysis.compositorFrames)} events ${JSON.stringify(analysis.frameEvents)}, main frames ${JSON.stringify(analysis.mainFrames)}`);
      const show = (where, t) => console.log(`  ${where} @${t.atMs} ms ${t.ms} ms: ${t.self.join(' / ')}\n    js self: ${(t.jsSelf ?? []).join(' / ')}`
        + `\n    js total: ${(t.jsTotal ?? []).slice(0, 12).join(' / ')}`
        + (t.programs?.made ? `\n    programs made ${t.programs.made}:\n      ${t.programs.rows.slice(0, 16).join('\n      ')}` : '')
        + (t.ms >= 300 && t.programs?.madeBefore ? `\n    programs made in the 3 s before: ${t.programs.madeBefore}\n      ${t.programs.before.slice(-12).join('\n      ')}` : ''));
      if (analysis.gpuTasks?.length) console.log(`  GPU main thread tasks over ${LONG_MS} ms in the boot window: ${analysis.gpuTasks.length}\n    ${analysis.gpuTasks.slice(0, 24).map((g) => `@${g.atMs} ${g.ms} ms: ${g.self.join(' / ')}${g.pageTask ? ` (page task @${g.pageTask.atMs} ${g.pageTask.ms} ms)` : ''}`).join('\n    ')}`);
      if (analysis.droppedTimeline) console.log(`  dropped frames per 500 ms: ${JSON.stringify(analysis.droppedTimeline)}`);
      if (analysis.slowQueries?.length) console.log(`  program queries over 20 ms: ${analysis.slowQueries.length}\n    ${analysis.slowQueries.slice(0, 24).map((q) => `@${Math.round(q.t)} ${Math.round(q.ms)} ms ${q.method ?? 'getProgramParameter'}${q.pname ? ' ' + q.pname.toString(16) : ''} ${q.name}, linked ${q.linkedFor === null || q.linkedFor === undefined ? '?' : q.linkedFor + ' ms'} before, complete ${q.completeFor === null ? 'never' : q.completeFor + ' ms before'} — defines ${q.defines ?? '?'} — ${q.stack}`).join('\n    ')}`);
      if (analysis.bootTimings) console.log(`  boot timings: ${JSON.stringify(Object.fromEntries(Object.entries(analysis.bootTimings).filter(([, v]) => typeof v === 'number'))).slice(0, 1200)}`);
      for (const t of boot) show('boot', t);
      for (const t of analysis.gateToGarage ?? []) show('gate→garage', t);
      // the compositor's dropped frames: PipelineReporter's states when the trace has them, else viz's DroppedFrame events
      const dropped = Math.max(analysis.compositorFrames?.dropped ?? 0, analysis.frameEvents?.DroppedFrame ?? 0);
      if (gate) console.log(`  gate: ${boot.length} boot-screen tasks over ${LONG_MS} ms, ${dropped} dropped frames (max ${maxDropped}), `
        + `${analysis.gpuTasks?.length ?? 0} GPU main thread tasks over ${LONG_MS} ms`);
      if (gate && (boot.length > 0 || dropped > maxDropped)) failed = true;
    } finally {
      await browser.close().catch(() => {});
    }
  }
} catch (error) {
  console.error(`boot-census: ${String(error?.message || error).split('\n')[0]}`);
  results.error = String(error?.message || error).split('\n')[0];
  process.exitCode = 2;
} finally {
  server?.kill();
  await lock?.release();
}
mkdirSync(join(out, label), { recursive: true });
writeFileSync(join(out, label, 'boot-census.json'), `${JSON.stringify(results, null, 1)}\n`);
console.log(`boot-census: -> ${join(out, label, 'boot-census.json')}`);
if (gate && !process.exitCode) {
  if (failed) { console.error(`boot-census: GATE a task over ${LONG_MS} ms ran on the boot screen, or it dropped more than ${maxDropped} frames`); process.exitCode = 4; }
  else console.log('boot-census: GATE the boot screen held: no task over 50 ms, no dropped frames past the budget');
}
process.exit(process.exitCode ?? 0);
