#!/usr/bin/env node
// Click-to-next-paint for every in-game click path (2026-10-24, click-perf-244; the owner: "make clicking through a lot
// more performant"; the web rules: shell first, never block a navigation, no pops).
//
//   node tools/click-timeline.mjs --base=<label>=<url> [--base=<label>=<url>] --out=<dir> [--paths=all|<doc>|<id>,…]
//        [--profile=desktop|phone] [--reps=6] [--lock] [--place=<key>] [--budget-min=18]
//   node tools/click-timeline.mjs --report=<dir> [--labels=base,after] [--dist=<label>=<dist dir>]
//   node tools/click-timeline.mjs --list
//   node tools/click-timeline.mjs --base=<label>=<url> --out=<dir> --paths=steps,access   the interaction census's receipts
//
// Serve each build with tools/vercel-static-preview.mjs and pass a non-loopback name (http://cot.test:<port>/): the
// tool maps cot.test to 127.0.0.1. One profile per run and one browser at a time: every page the chosen paths start in
// is loaded and brought to its starting state while the capture ticket waits (tools/capture-hold.mjs), frozen, and
// thawed for the hold. Chrome runs with a 3 GB V8 heap per renderer, and the run aborts if any renderer passes 6 GB.
//
// A path presses one control `reps` times (`press(i)`: the control for sample i, `shown`: the page expression that
// holds once its result is on screen, `done`: once its slow tail has landed, `after`: what undoes it), or runs a
// `script` that measures several kinds of press (the battle paths). Per press the page reports, through the Event
// Timing API, the interaction's duration from the input to the next paint after its handlers (INP's measure; under
// 16 ms an interaction reports no entry and counts as 16), its processing time, the long animation frames (LoAF) that
// overlapped it with each frame's scripts (invoker, source URL, function, character position), and the time until
// `shown` and `done`. `--report` folds the samples into p50 / p95 per path and build and resolves each script's
// position through the build's hidden source maps (`vite build --sourcemap hidden`) to a source file and line.
//
// The probe hides navigator.webdriver, so the transitions, veils and idle warm-ups run as they do for a player. The
// battle document boots with it visible (the game then installs `__DEBUG`, which the battle paths use to end a
// battle) and hides it once the Garage is up.
import { launchGuardedBrowser } from './browser-launch.mjs';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { accessProblems } from './interaction-access.mjs';
import { STEP_PATHS } from './interaction-steps.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const hit = argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const options = (name) => argv.filter((value) => value.startsWith(`--${name}=`)).map((value) => value.slice(name.length + 3));
const flag = (name) => argv.includes(`--${name}`);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const firstLine = (cause) => String(cause?.message || cause).split('\n')[0];

const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36';
const PROFILES = {
  desktop: { viewport: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false }, cpu: 1 },
  phone: { viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, cpu: 4, userAgent: PHONE_UA },
};
const RENDERER_LIMIT_KB = 6 * 1024 * 1024;
const INPUT_EVENTS = ['pointerdown', 'pointerup', 'click', 'mousedown', 'mouseup', 'keydown', 'keyup', 'touchstart', 'touchend'];

/** The in-page recorder: event timing, long animation frames and long tasks from document start, and the visibility
 *  test the paths use. `window.__cotAutomation` decides what navigator.webdriver reads. */
const PROBE = `(() => {
  if (window.__click) return;
  Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => window.__cotAutomation === true, configurable: true });
  const rec = window.__click = { events: [], loafs: [], longtasks: [] };
  rec.visible = (el) => { if (!el || el.nodeType !== 1) return false;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false; }
    return true; };
  rec.shown = (sel) => rec.visible(document.querySelector(sel));
  // --layout-trace: while armed, each layout-reading DOM call records its caller (the frame below this probe)
  rec.layoutReads = []; rec.layoutArmed = false;
  const traceRead = (name) => { if (!rec.layoutArmed) return;
    const frames = String(new Error().stack || '').split('\\n').slice(3, 6).map((line) => line.trim());
    rec.layoutReads.push({ name, frames }); };
  const wrapMethod = (proto, name) => { const original = proto[name]; if (typeof original !== 'function') return;
    proto[name] = function (...args) { traceRead(name); return original.apply(this, args); }; };
  const wrapGetter = (proto, name) => { const d = Object.getOwnPropertyDescriptor(proto, name); if (!d || !d.get) return;
    Object.defineProperty(proto, name, { ...d, get() { traceRead(name); return d.get.call(this); } }); };
  if (window.__cotLayoutTrace) {
    for (const name of ['getBoundingClientRect', 'getClientRects', 'scrollIntoView']) wrapMethod(Element.prototype, name);
    for (const name of ['offsetWidth', 'offsetHeight', 'offsetLeft', 'offsetTop']) wrapGetter(HTMLElement.prototype, name);
    for (const name of ['clientWidth', 'clientHeight', 'scrollWidth', 'scrollHeight', 'scrollTop', 'scrollLeft']) wrapGetter(Element.prototype, name);
    const gcs = window.getComputedStyle; window.getComputedStyle = function (...args) { traceRead('getComputedStyle'); return gcs.apply(window, args); };
  }
  const describe = (node) => { if (!node || node.nodeType !== 1) return null;
    const cls = typeof node.className === 'string' ? node.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
    return node.tagName.toLowerCase() + (node.id ? '#' + node.id : '') + (cls ? '.' + cls : ''); };
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) rec.events.push({ name: e.name, start: e.startTime,
      duration: e.duration, processingStart: e.processingStart, processingEnd: e.processingEnd, id: e.interactionId, target: describe(e.target) }); })
      .observe({ type: 'event', durationThreshold: 16, buffered: true });
    new PerformanceObserver((list) => { for (const e of list.getEntries()) rec.loafs.push({ start: e.startTime, duration: e.duration,
      blocking: e.blockingDuration, renderStart: e.renderStart, styleAndLayoutStart: e.styleAndLayoutStart,
      scripts: (e.scripts || []).map((s) => ({ invoker: s.invoker, type: s.invokerType, url: s.sourceURL, fn: s.sourceFunctionName,
        pos: s.sourceCharPosition, start: s.startTime, duration: s.duration, layout: s.forcedStyleAndLayoutDuration })) }); })
      .observe({ type: 'long-animation-frame', buffered: true });
    new PerformanceObserver((list) => { for (const e of list.getEntries()) rec.longtasks.push({ start: e.startTime, duration: e.duration }); })
      .observe({ type: 'longtask', buffered: true });
  } catch (_) {}
  // (UI-LOCKDOWN A) each canvas's context type, so the canvas check tells the UI's canvases from the 3D views
  rec.contextKind = new WeakMap();
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const context = getContext.call(this, type, ...rest);
    if (context && !rec.contextKind.has(this)) rec.contextKind.set(this, String(type));
    return context;
  };
  // every animation-callback interval past one refresh and a half (25 ms: at least one dropped frame at 60 Hz); the
  // census counts the 33 ms ones (two refreshes) and the dropped frames (UI-LOCKDOWN D/E, 2026-10-25)
  rec.frames = [];
  let lastFrame = 0;
  const frameTick = (t) => { if (lastFrame && t - lastFrame > 25) rec.frames.push({ start: lastFrame, duration: t - lastFrame });
    lastFrame = t; requestAnimationFrame(frameTick); };
  requestAnimationFrame(frameTick);
})();`;

const GARAGE = `window.__GAME_READY === true && __click.shown('.cot-garage') && !document.querySelector('.cot-garage.awaiting-boot')
  && document.querySelector('.cot-cards .cot-card') && document.querySelector('.cot-settings') && document.querySelector('#cot-battle-menu .cot-deploy-diff')`;

/** The documents a path starts in: where each loads, when it is ready, what runs once it is (the entry gate is skipped by
 *  `?nogate`). */
const DOCS = {
  game: { url: '/?nogate', ready: GARAGE },
  battle: {
    url: '/?nogate', ready: `${GARAGE} && window.__DEBUG && typeof window.__DEBUG.slayEnemies === 'function'`, automation: true,
    after: async (page) => { await page.evaluate(() => { window.__cotAutomation = false; }); },
  },
  gallery: { url: '/gallery', ready: `window.__TANK_GALLERY_READY === true && document.querySelector('#vehicleList .it[data-id]')` },
};

/** Mark the `index`-th visible match of `selector` (wrapping) as the press target; its selector, or a throw. */
async function target(page, selector, index = 0) {
  const found = await page.evaluate((sel, i) => {
    for (const node of document.querySelectorAll('[data-click-target]')) node.removeAttribute('data-click-target');
    const list = [...document.querySelectorAll(sel)].filter((el) => window.__click.visible(el) && !el.disabled);
    if (!list.length) return false;
    list[i % list.length].setAttribute('data-click-target', '');
    return true;
  }, selector, index);
  if (!found) throw new Error(`nothing visible matches ${selector}`);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  return '[data-click-target]';
}

/** Press a control the way the profile does: a mouse click, or a tap on a touch screen. */
async function press(page, selector, touch) {
  const handle = await page.waitForSelector(selector, { timeout: 15000 });
  // the press lands on the target, never on a bar or sheet over it: a phone tap on the Gallery's second dossier tab
  // went to whatever covered the tab's centre and left the Gallery (canvas-ui's phone run, 2026-10-25). Covered at
  // `nearest`, the target is centred and checked again; still covered, the press throws instead of pressing that.
  const cover = (block) => handle.evaluate((el, b) => {
    el.scrollIntoView({ block: b, inline: 'nearest' });
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!hit || hit === el || el.contains(hit) || hit.contains(el)) return null;
    return `${hit.tagName.toLowerCase()}${hit.id ? `#${hit.id}` : ''}${typeof hit.className === 'string' && hit.className ? `.${hit.className.trim().split(/\s+/).join('.')}` : ''}`;
  }, block);
  const covered = await cover('nearest') && await cover('center');
  if (covered) throw new Error(`${selector} is covered by ${covered}`);
  if (touch) await handle.tap();
  else await handle.click();
}

const expression = (body) => `(() => { const shown = window.__click.shown; const visible = window.__click.visible; return (${body}); })()`;
// --gate (2026-10-25): the game document loads as a player's does, with its entry gate, which the warm-up presses. Its
// press opens the audio device (main.ts prepareAudioForEntry), so no measured press pays that (under ?nogate the first
// press anywhere does: a Settings press read 262 ms of lazyAudio unlockContext).
if (flag('gate')) {
  DOCS.game = { url: '/', ready: `window.__GAME_READY === true && !!document.querySelector('#cot-boot-gate.on')`,
    after: async (page) => {
      await page.keyboard.press('Enter');
      await page.waitForFunction(expression(GARAGE), { timeout: 240000, polling: 200 });
      await new Promise((done) => setTimeout(done, 2000));
    } };
}

/** Wait for a page expression (polled), bounded. */
async function waitFor(page, body, timeout = 120000, polling = 100) {
  await page.waitForFunction(expression(body), { timeout, polling });
}

/** Let the page go quiet after a press: no long task for `quietMs`, at most `maxMs`. */
async function settle(page, quietMs = 600, maxMs = 6000) {
  const started = Date.now();
  let last = await page.evaluate(() => window.__click.longtasks.length).catch(() => 0);
  let quietSince = Date.now();
  while (Date.now() - started < maxMs) {
    await sleep(150);
    const count = await page.evaluate(() => window.__click.longtasks.length).catch(() => last);
    if (count !== last) { last = count; quietSince = Date.now(); }
    if (Date.now() - quietSince >= quietMs) return;
  }
}

/** One measured press: INP, processing, input delay, the overlapping LoAF scripts, long tasks, time to shown / done. */
async function measure(page, { selector, key = null, shown = null, done = null, shownTimeoutMs = 15000, doneTimeoutMs = 30000, touch, quietMs, cpuProfile = null,
  idleMs = 0, action = null }) {
  // --census: the JS Self-Profiler samples the whole window (press to settled) so each long task names its code
  // (the page must be served with Document-Policy: js-profiling: vercel-static-preview --document-policy=js-profiling)
  const census = flag('census');
  const consoleFrom = page.__consoleLog?.length ?? 0;
  // --alloc (with --census): the sampling heap profiler over the same window, the objects minor and major GCs already
  // collected included, so short-lived garbage is counted
  const heap = census && flag('alloc') ? await page.createCDPSession().catch(() => null) : null;
  if (heap) {
    await heap.send('HeapProfiler.enable').catch(() => {});
    await heap.send('HeapProfiler.startSampling', { samplingInterval: 8192,
      includeObjectsCollectedByMinorGC: true, includeObjectsCollectedByMajorGC: true }).catch(() => {});
  }
  if (census) {
    await page.evaluate(() => {
      try { window.__cotProfiler = new Profiler({ sampleInterval: 10, maxBufferSize: 30000 }); window.__cotProfilerError = null; }
      catch (error) { window.__cotProfiler = null; window.__cotProfilerError = String(error).slice(0, 160); }
    }).catch(() => {});
  }
  // --cpu-profile=<dir>: a sampled V8 profile of the press and its next two frames, for attributing inside one handler
  // (it stalled on the game page's first press in click-perf-248; --layout-trace names the forced layouts instead)
  const profiler = cpuProfile ? await page.createCDPSession() : null;
  if (profiler) {
    await profiler.send('Profiler.enable');
    await profiler.send('Profiler.setSamplingInterval', { interval: 500 });
    await profiler.send('Profiler.start');
  }
  const t0 = await page.evaluate(() => { window.__click.layoutReads.length = 0; window.__click.layoutArmed = true; return performance.now(); });
  let error = null;
  if (idleMs) await sleep(idleMs);
  else if (action) await action(page).catch((cause) => { error = firstLine(cause); });
  else if (key) await page.keyboard.press(key).catch((cause) => { error = firstLine(cause); });
  else await press(page, selector, touch).catch((cause) => { error = firstLine(cause); });
  // the press's task and its next two frames: what the layout tracer (when on) attributes
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))).catch(() => {});
  const layoutReads = await page.evaluate(() => { window.__click.layoutArmed = false; return window.__click.layoutReads.splice(0); }).catch(() => []);
  // --cpu-profile-full: the profile runs to the end of the census window (the work that lands after the press too: a
  // background build's slices the press waited behind), stopped below
  const stopProfile = async () => {
    const { profile } = await profiler.send('Profiler.stop').catch(() => ({ profile: null }));
    if (profile) {
      mkdirSync(cpuProfile.dir, { recursive: true });
      writeFileSync(join(cpuProfile.dir, `${cpuProfile.name}.cpuprofile`), JSON.stringify(profile));
    }
    await profiler.detach().catch(() => {});
  };
  if (profiler && !flag('cpu-profile-full')) await stopProfile();
  const stamp = () => page.evaluate(() => performance.now());
  let shownAt = null;
  let doneAt = null;
  if (!error && shown) {
    await waitFor(page, shown, shownTimeoutMs, 'raf').then(async () => { shownAt = await stamp(); })
      .catch((cause) => { error = `not shown: ${firstLine(cause)}`; });
  }
  if (!error && done) {
    await waitFor(page, done, doneTimeoutMs).then(async () => { doneAt = await stamp(); })
      .catch((cause) => { error = `not done: ${firstLine(cause)}`; });
  }
  await settle(page, quietMs);
  const censusData = census ? await censusWindow(page, t0, consoleFrom) : null;
  if (profiler && flag('cpu-profile-full')) await stopProfile();
  if (censusData && flag('canvas')) censusData.canvas = await canvasCheck(page);
  if (heap && censusData) censusData.alloc = await allocationWindow(heap, censusData.windowMs);
  const data = await page.evaluate((from, inputs, spanEnd) => {
    const rec = window.__click;
    const events = rec.events.filter((e) => e.start >= from - 5 && inputs.includes(e.name));
    const first = events.find((e) => e.id) || events[0] || null;
    const group = first ? events.filter((e) => (first.id ? e.id === first.id : e === first)) : [];
    const slowest = [...group].sort((a, b) => b.duration - a.duration)[0] || null;
    const duration = slowest ? slowest.duration : 16;
    const end = from + duration + 1500;
    const loafs = rec.loafs.filter((l) => l.start + l.duration >= from && l.start <= end);
    const longtasks = rec.longtasks.filter((t) => t.start + t.duration >= from && t.start <= end);
    // Every event of the interaction ends at the same paint; its handlers' time is the largest of theirs (a click's
    // handlers, not its pointerdown's), its input delay the first event's.
    const processing = group.reduce((most, e) => Math.max(most, e.processingEnd - e.processingStart), 0);
    // a transition's whole window (press to done): its long frames, the longest first, so a covered load names what
    // held its main thread
    const spanLoafs = spanEnd == null ? null : rec.loafs.filter((l) => l.start + l.duration >= from && l.start <= spanEnd)
      .sort((a, b) => b.duration - a.duration).slice(0, 16);
    const spanLong = spanEnd == null ? null : rec.longtasks.filter((t) => t.start + t.duration >= from && t.start <= spanEnd);
    const lastSwitch = Array.isArray(window.__GARAGE_SWITCH) ? window.__GARAGE_SWITCH[window.__GARAGE_SWITCH.length - 1] : null;
    return { duration, processing: Math.round(processing),
      inputDelay: first ? Math.round(first.processingStart - first.start) : 0, event: slowest?.name ?? null, target: slowest?.target ?? null,
      loafs, longtaskMs: Math.round(longtasks.reduce((sum, t) => sum + t.duration, 0)), longtasks: longtasks.length,
      ...(spanLoafs ? { spanLoafs, spanLongtaskMs: Math.round(spanLong.reduce((sum, t) => sum + t.duration, 0)), spanLongtasks: spanLong.length } : {}),
      garageSwitch: lastSwitch ? JSON.parse(JSON.stringify(lastSwitch)) : null,
      garageEntry: window.__GARAGE_ENTRY ? JSON.parse(JSON.stringify(window.__GARAGE_ENTRY)) : null,
      battleLoad: window.__BATTLE_LOAD ? JSON.parse(JSON.stringify(window.__BATTLE_LOAD)) : null,
      studioLoad: window.__STUDIO_LOAD ? JSON.parse(JSON.stringify(window.__STUDIO_LOAD)) : null,
      studioReentry: window.__STUDIO_REENTRY ?? null,
      countdownWarm: window.__BATTLE_COUNTDOWN_WARM ? JSON.parse(JSON.stringify(window.__BATTLE_COUNTDOWN_WARM)) : null,
  deferredWarm: window.__BATTLE_DEFERRED_WARM ? JSON.parse(JSON.stringify(window.__BATTLE_DEFERRED_WARM)) : null,
  visualLoads: Array.isArray(window.__VISUAL_LOAD_TIMINGS) ? JSON.parse(JSON.stringify(window.__VISUAL_LOAD_TIMINGS.slice(-40))) : null };
  }, t0, INPUT_EVENTS, done && doneAt != null ? doneAt : null);
  return { error, layoutReads, selector: selector ?? key, shownMs: shownAt == null ? null : Math.round(shownAt - t0),
    doneMs: doneAt == null ? null : Math.round(doneAt - t0), ...data, ...(censusData ? { census: censusData } : {}) };
}

/** The sampling heap profile of a census window: bytes allocated, per second, and the sites that allocated most. */
async function allocationWindow(heap, windowMs) {
  const result = await heap.send('HeapProfiler.stopSampling').catch(() => null);
  await heap.detach().catch(() => {});
  if (!result?.profile) return null;
  const sites = new Map();
  let total = 0;
  const walk = (node, appFrame) => {
    const frame = node.callFrame;
    const own = /\/assets\//.test(frame.url) ? frame : appFrame;
    if (node.selfSize) {
      total += node.selfSize;
      const site = own ?? frame;
      const key = `${site.url}|${site.lineNumber}|${site.columnNumber}|${site.functionName}`;
      sites.set(key, (sites.get(key) || 0) + node.selfSize);
    }
    for (const child of node.children || []) walk(child, own);
  };
  walk(result.profile.head, null);
  return { bytes: total, perSecond: windowMs > 0 ? Math.round(total * 1000 / windowMs) : null,
    sites: [...sites].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([key, bytes]) => {
      const [url, line, column, name] = key.split('|');
      // the heap profiler's positions are zero-based: one-based line and column, as the self-profiler's
      return { url, line: Number(line) + 1, column: Number(column) + 1, name, bytes };
    }) };
}

/**
 * A census window (press to settled): every frame over 33 ms, every long task over 50 ms with the code its profiler
 * samples name (the leaf-most frames from the page's own scripts, the most sampled first), and the console's errors and
 * warnings.
 */
async function censusWindow(page, t0, consoleFrom) {
  const window_ = await page.evaluate(async (from) => {
    const rec = window.__click, end = performance.now();
    const profiler = window.__cotProfiler;
    window.__cotProfiler = null;
    const trace = profiler ? await profiler.stop().catch(() => null) : null;
    const late = rec.frames.filter((f) => f.start + f.duration >= from && f.start <= end);
    const frames = late.filter((f) => f.duration > 33);
    // the refreshes a late interval skipped (60 Hz): 26-41 ms one, 42-58 ms two, and so on
    const dropped = late.reduce((sum, f) => sum + Math.max(1, Math.round(f.duration / (1000 / 60)) - 1), 0);
    const seen = new Set();
    const longs = rec.longtasks.filter((t) => t.start + t.duration >= from && t.start <= end && t.duration > 50
      && !seen.has(t.start) && seen.add(t.start));
    const loafs = rec.loafs.filter((l) => l.start + l.duration >= from && l.start <= end && l.duration > 50);
    // each long task's samples: the leaf-most frame from an app script (assets/), else the leaf
    const attribute = (start, stop) => {
      if (!trace) return [];
      const counts = new Map();
      let total = 0;
      for (const sample of trace.samples) {
        if (sample.timestamp < start || sample.timestamp > stop) continue;
        total++;
        if (sample.stackId == null) continue;
        let leaf = null;
        for (let id = sample.stackId; id != null; id = trace.stacks[id].parentId) {
          const frame = trace.frames[trace.stacks[id].frameId];
          const url = frame.resourceId != null ? trace.resources[frame.resourceId] : '';
          if (!leaf) leaf = { frame, url };
          if (/\/assets\//.test(url)) { leaf = { frame, url }; break; }
        }
        if (!leaf) continue;
        const key = `${leaf.url}|${leaf.frame.line}|${leaf.frame.column}|${leaf.frame.name}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      // the sampler runs faster than its nominal interval: each site's share of the task's own samples, in the task's ms
      return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([key, n]) => {
        const [url, line, column, name] = key.split('|');
        return { url, line: Number(line) || null, column: Number(column) || null, name, ms: Math.round((n / total) * (stop - start)) };
      });
    };
    return {
      windowMs: Math.round(end - from), profiler: !!trace, profilerError: window.__cotProfilerError ?? null,
      frames33: frames.length, worstFrame: Math.round(Math.max(0, ...late.map((f) => f.duration))), droppedFrames: dropped,
      frames: frames.sort((a, b) => b.duration - a.duration).slice(0, 6).map((f) => ({ at: Math.round(f.start - from), ms: Math.round(f.duration) })),
      long50: longs.length, worstLong: Math.round(Math.max(0, ...longs.map((t) => t.duration))),
      longs: longs.sort((a, b) => b.duration - a.duration).slice(0, 6).map((t) => ({ at: Math.round(t.start - from), ms: Math.round(t.duration),
        code: attribute(t.start, t.start + t.duration) })),
      loafScripts: loafs.sort((a, b) => b.duration - a.duration).slice(0, 4).map((l) => ({ ms: Math.round(l.duration),
        scripts: l.scripts.slice(0, 3).map((x) => ({ invoker: x.invoker, url: x.url, pos: x.pos, fn: x.fn, ms: Math.round(x.duration) })) })),
    };
  }, t0).catch((cause) => ({ error: firstLine(cause) }));
  // Chrome ignores COOP on a plain-http origin and says so; the deployment is https, so that line is the preview's
  const logged = (page.__consoleLog ?? []).slice(consoleFrom)
    .filter((m) => !/Cross-Origin-Opener-Policy header has been ignored, because the URL's origin was untrustworthy/.test(m.text));
  return { ...window_, consoleErrors: logged.filter((m) => m.type === 'error').map((m) => m.text).slice(0, 8),
    consoleWarnings: logged.filter((m) => m.type === 'warn').length,
    consoleWarningTexts: logged.filter((m) => m.type === 'warn').map((m) => m.text).slice(0, 8) };
}

/** (UI-LOCKDOWN A) The device-pixel cap a UI canvas's backing store may take (src/ui/uiCanvas.ts). */
const CANVAS_CAP = 2;
/** Every on-screen UI canvas with a context (not a WebGL view: the 3D renderers own their resolution; not a canvas
 *  never given a context: it holds no store) against the canvas rule: shown,
 *  its backing store is its CSS box times min(devicePixelRatio, CANVAS_CAP) within a pixel (larger wastes memory and
 *  compounds, smaller blurs); hidden, it holds at most one pixel. */
const CANVAS_CHECK = `(() => {
  const rec = window.__click, dpr = devicePixelRatio, scale = Math.min(dpr, ${CANVAS_CAP});
  // the canvas and up to three ancestors (to the first with an id): an id-less canvas still names where it lives
  const label = (el) => { const cls = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).filter(Boolean).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : ''); };
  const describe = (node) => { const path = [label(node)];
    for (let el = node.parentElement, n = 0; el && el !== document.body && n < 3 && !path[0].includes('#'); el = el.parentElement, n++) path.unshift(label(el));
    return path.join(' > '); };
  // (canvas-ui, 2026-10-25) a primitive's canvas carries data-ui-canvas: a shown 2D canvas without it was made outside it
  const violations = [], outside = []; let checked = 0;
  for (const canvas of document.querySelectorAll('canvas')) {
    const kind = rec.contextKind && rec.contextKind.get(canvas) || null;
    // a WebGL view owns its resolution; a canvas never given a context allocates no store (a swatch not yet painted)
    if (!kind || /webgl/i.test(kind)) continue;
    checked++;
    const box = canvas.getBoundingClientRect();
    const shown = box.width > 0 && box.height > 0 && (!canvas.checkVisibility || canvas.checkVisibility({ checkVisibilityCSS: true }));
    // (canvas-ui, 2026-10-25) the store is sized to the element's own layout box (clientWidth/Height, what uiCanvas
    // measures), never a transform's: a collapsing touch tray scales its slots to .94 while they fade out
    const layoutW = canvas.clientWidth, layoutH = canvas.clientHeight;
    const entry = { canvas: describe(canvas), kind, w: canvas.width, h: canvas.height, box: [layoutW, layoutH], dpr };
    if (!shown) { if (canvas.width * canvas.height > 1) violations.push({ ...entry, state: 'hidden-held' }); continue; }
    if (!canvas.hasAttribute('data-ui-canvas')) outside.push(entry.canvas);
    // a canvas at opacity 0 is still composited (a fade-in needs its store): neither held nor sized against
    if (canvas.checkVisibility && !canvas.checkVisibility({ checkOpacity: true })) continue;
    const wantW = layoutW * scale, wantH = layoutH * scale;
    if (canvas.width > Math.ceil(wantW) + 1 || canvas.height > Math.ceil(wantH) + 1) violations.push({ ...entry, state: 'oversized' });
    else if (canvas.width < Math.floor(wantW) - 1 || canvas.height < Math.floor(wantH) - 1) violations.push({ ...entry, state: 'blurry' });
  }
  return { checked, violations, outside: [...new Set(outside)] };
})()`;
const canvasCheck = (page) => page.evaluate(CANVAS_CHECK).catch((cause) => ({ error: firstLine(cause) }));

/** (UI-LOCKDOWN A) A surface's canvases checked at its start, after each of its interactions, after three resizes and
 *  their return, and across a device-pixel-ratio flip and back: one recorded sample per check. */
const CANVAS_RESIZES = { desktop: [[1280, 800], [1024, 768], [1680, 1050]], phone: [[360, 780], [414, 896], [844, 390]] };
const canvasProbe = async (page, ctx, surface, interactions) => {
  // a retained canvas releases or redraws within its 0.5 s backstop sweep after it hides or shows (canvas-ui, 253)
  const record = async (step) => { await sleep(700); await settle(page, 300, 4000);
    ctx.record(`canvas:${surface}:${step}`, { canvas: await canvasCheck(page) }); };
  const home = new URL(page.url()).pathname;
  await record('start');
  for (let n = 0; n < interactions.length; n++) {
    try { await interactions[n](); } catch (cause) { ctx.record(`canvas:${surface}:act${n}`, { error: firstLine(cause) }); continue; }
    // a press that left the surface is recorded and undone: the steps after it check this surface, not another page
    const now = new URL(page.url()).pathname;
    if (now !== home) {
      ctx.record(`canvas:${surface}:act${n}`, { error: `left ${home} for ${now}` });
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await sleep(1500);
      continue;
    }
    await record(`act${n}`);
  }
  const base = page.viewport();
  for (const [width, height] of CANVAS_RESIZES[base.isMobile ? 'phone' : 'desktop']) {
    await page.setViewport({ ...base, width, height });
    await sleep(800);
    await record(`resize-${width}x${height}`);
  }
  await page.setViewport(base);
  await sleep(800);
  await record('resize-back');
  const flipped = base.deviceScaleFactor >= 2 ? 1 : 2;
  await page.setViewport({ ...base, deviceScaleFactor: flipped });
  await sleep(800);
  await record(`dpr-${flipped}`);
  await page.setViewport(base);
  await sleep(800);
  await record(`dpr-${base.deviceScaleFactor}`);
};

const pressKey = (page, key) => page.keyboard.press(key);
const tapOrClick = (page, selector, { touch }) => press(page, selector, touch);
const closeSettings = async (page, ctx) => {
  if (!await page.evaluate(() => window.__click.shown('.cot-settings.open'))) return;
  await tapOrClick(page, '.cot-settings.open .cot-set-close, .cot-settings.open .resume', ctx).catch(() => pressKey(page, 'Escape'));
  await waitFor(page, `!shown('.cot-settings.open')`, 10000);
};
// Leave the Studio only when it opened: an Escape over the Garage opens Settings, which then covers the bar for every
// later press (the brand lead's trace, 2026-10-24); a Settings left open is closed
const leaveStudio = async (page, ctx) => {
  if (await page.evaluate(expression(`shown('.cot-studio')`)).catch(() => false)) {
    await pressKey(page, 'Escape');
    await waitFor(page, GARAGE_BACK, 60000).catch(() => {});
  }
  if (await page.evaluate(expression(`shown('.cot-settings.open')`)).catch(() => false)) await closeSettings(page, ctx);
  await waitFor(page, `!shown('.cot-trans.on')`, 30000).catch(() => {});
};
// The Garage again after a sweep press: any panel, menu or modal it opened closed (Escape, Settings' close), the
// transition gone
const OPEN_OVERLAY = `shown('.cot-settings.open') || shown('#cot-battle-menu.open') || shown('#cot-record-modal')
  || [...document.querySelectorAll('[aria-modal="true"], [role="dialog"]')].some((el) => __click.visible(el))`;
const restoreGarage = async (page, ctx) => {
  for (let tries = 0; tries < 3; tries++) {
    if (!await page.evaluate(expression(OPEN_OVERLAY)).catch(() => false)) break;
    if (await page.evaluate(expression(`shown('.cot-settings.open')`)).catch(() => false)) await closeSettings(page, ctx).catch(() => {});
    else await pressKey(page, 'Escape');
    await sleep(400);
  }
  await waitFor(page, `!shown('.cot-trans.on')`, 30000).catch(() => {});
  await waitFor(page, GARAGE, 30000).catch(() => {});
};
// A Garage sweep presses every visible control on the Garage's screen except what leaves the page, starts a battle or
// a room, or switches the language (those have their own paths)
const SWEEP_DENY = ['[data-battle-launch]', '[data-campaign-launch]', '[data-battle-watch]',
  '[data-nav=home]', '[data-nav=gallery]', '[data-nav=docs]', '[data-nav=studio]', '[data-nav=github]', '.cot-github',
  '[data-mobile-nav=home]', '[data-mobile-nav=gallery]', '[data-mobile-nav=docs]', '[data-mobile-nav=studio]',
  '[data-mobile-nav=locale]', '[data-deploy-room]', '[data-tabbar=gallery]', '.cot-wordmark', 'a[href^="http"]',
  'a[href^="/"]', '[hreflang]', '[data-locale]', '[data-nav=locale]', '.cot-locale-switcher'].join(', ');
const openDeploy = async (page, ctx) => {
  if (await page.evaluate(() => window.__click.shown('#cot-battle-menu.open'))) return;
  await tapOrClick(page, await target(page, '[data-nav=deploy], .cot-battle-mode'), ctx);
  await waitFor(page, `shown('#cot-battle-menu.open')`, 15000);
};
const closeDeploy = async (page, ctx) => {
  if (!await page.evaluate(() => window.__click.shown('#cot-battle-menu.open'))) return;
  await tapOrClick(page, await target(page, '#cot-battle-menu .cot-deploy-back'), ctx).catch(() => pressKey(page, 'Escape'));
  await waitFor(page, `!shown('#cot-battle-menu.open')`, 10000);
};
const SETTINGS_TABS = ['controls', 'gameplay', 'sound', 'graphics', 'language'];
const ROSTER_SHOWN = `document.querySelector('[data-click-target].sel, .cot-card.sel[data-click-target]')`;
const ROSTER_DONE = `(() => { const id = document.querySelector('[data-click-target]')?.dataset.specId
  || document.querySelector('.cot-cards .cot-card.sel')?.dataset.specId; const list = window.__GARAGE_SWITCH;
  const last = Array.isArray(list) ? list[list.length - 1] : null; return !!(last && last.id === id && last.revealMs != null); })()`;
// (UI-LOCKDOWN E) the screens the memory-cycle path opens and closes
const MEMORY_CYCLES = 20;
const MEMORY_SCREENS = [
  { id: 'settings', open: '.cot-settings-slot .cot-gear, [data-nav=settings]', shown: `shown('.cot-settings.open')`, close: closeSettings },
  { id: 'deploy', open: '[data-nav=deploy], .cot-battle-mode', shown: `shown('#cot-battle-menu.open')`, close: closeDeploy },
  { id: 'record', open: '.cot-record-trigger', shown: `shown('#cot-record-modal')`,
    close: async (page) => { await pressKey(page, 'Escape'); await waitFor(page, `!shown('#cot-record-modal')`, 10000); } },
];
// (lockdown-251) roster-pick: the riding-station tanks (the RWS and M2 stations' sweeps), each between tanks far from it
// in the roster so a neighbour prebuild never builds the next pick ahead
const PICK_IDS = ['m1a1_abrams_hc', 't90m', 'm60a2', 'leo2a6', 'm1a1_abrams_aim', 'k2_black_panther', 'm551_sheridan', 'type10',
  'm1a1_abrams_fep'];
const GARAGE_BACK = `shown('.cot-garage') && window.__GAME_READY === true && (!window.__GARAGE_ENTRY || window.__GARAGE_ENTRY.presentationUnready === false)`;

// (interaction census) the surfaces the access path opens from the Garage, each judged as it stands
const ACCESS_SURFACES = [
  { id: 'garage', open: async () => {} },
  { id: 'deploy', open: openDeploy, scope: '#cot-battle-menu' },
  { id: 'battlefield', scope: '#cot-battle-menu',
    open: async (page, ctx) => { await openDeploy(page, ctx); await tapOrClick(page, await target(page, '#cot-battle-menu [data-deploy-field]'), ctx);
      await waitFor(page, `shown('[data-deploy-bf] .cot-c-picker__opt')`, 15000); } },
  { id: 'settings', scope: '.cot-settings',
    open: async (page, ctx) => { await tapOrClick(page, await target(page, '.cot-settings-slot .cot-gear, [data-nav=settings]'), ctx);
      await waitFor(page, `shown('.cot-settings.open')`, 15000); } },
  { id: 'record', open: async (page, ctx) => { await tapOrClick(page, await target(page, '.cot-record-trigger'), ctx);
    await waitFor(page, `shown('#cot-record-modal')`, 20000); } },
  { id: 'paint', open: async (page, ctx) => { await tapOrClick(page, await target(page, '.cot-lt-paint-all'), ctx);
    await waitFor(page, `shown('[data-picker="garage-camo"] .cot-c-picker__opt') || shown('.cot-camo-card')`, 15000); } },
  { id: 'equipment', open: async (page, ctx) => { await tapOrClick(page, await target(page, '.eqslot[data-slot]'), ctx);
    await waitFor(page, `shown('.cot-eqpick .cot-c-picker__opt')`, 15000); } },
  { id: 'rooms', scope: '.cot-play',
    open: async (page, ctx) => { await openDeploy(page, ctx); await tapOrClick(page, await target(page, '#cot-battle-menu [data-deploy-room="private"]'), ctx);
      await waitFor(page, `shown('.cot-play .panel')`, 30000); } },
  // the lobby's battlefield picker (a host in a fresh room: the rooms service or the LAN helper), the room left after
  { id: 'rooms-battlefield', scope: '.cot-play .battlefield-pick',
    open: async (page, ctx) => {
      await openDeploy(page, ctx);
      for (const [press, shown] of [['#cot-battle-menu [data-deploy-room="private"]', `shown('.cot-play .panel')`],
        ['.cot-play [data-action="create"]', `shown('.cot-play .roomhead .code')`],
        ['.cot-play [data-control="map"] [data-select-trigger]', `shown('.cot-play [data-picker="rooms-battlefield"]')`]]) {
        await tapOrClick(page, await target(page, press), ctx);
        await waitFor(page, shown, 30000);
      }
    } },
];
/** Undo a step path's task (not counted): close what it opened, leave the room, or end the battle it started. */
async function resetStepPath(page, ctx, reset) {
  if (reset === 'battle') {
    await waitFor(page, '!!window.__BATTLE_REVEAL', 240000);
    await page.evaluate(() => window.__DEBUG.slayEnemies());
    await waitFor(page, `shown('.cot-es.show') && shown('.cot-es [data-es-action="garage"]')`, 120000);
    await tapOrClick(page, await target(page, '.cot-es.show [data-es-action="garage"]'), ctx);
    await waitFor(page, GARAGE_BACK, 120000);
  } else if (reset === 'room') {
    if (await page.evaluate(expression(`shown('.cot-play [data-action="leave"]')`)).catch(() => false)) {
      await tapOrClick(page, await target(page, '.cot-play [data-action="leave"]'), ctx);
    }
    await restoreGarage(page, ctx);
  }
  await restoreGarage(page, ctx);
}

// Paths, after the 244 Garage (brand-ui Premiere). Doc 'game' runs the Garage, Deploy, settings and Studio presses;
// 'battle' runs DEPLOY into a battle, the end screen back to the Garage, Watch and its hops; 'gallery' the Gallery.
export const PATHS = [
  { id: 'garage-station', doc: 'game', reps: 6,
    press: (page, i) => target(page, '.cot-stations-list .cot-station', i + 1),
    shown: `document.querySelector('[data-click-target]')?.getAttribute('aria-selected') === 'true'` },
  { id: 'roster-card', doc: 'game', reps: 8,
    // Cards 1-4, twice: the first round builds each tank, the second reveals it from the hero cache.
    press: (page, i) => target(page, '.cot-cards .cot-card', (i % 4) + 1),
    shown: ROSTER_SHOWN, done: ROSTER_DONE, doneTimeoutMs: 60000 },
  // Garage tank switching by the carousel's next arrow and by the ArrowRight key (2026-10-24: "switching between tanks
  // in garage is very laggy"); a key press marks <body> so the switch's done check reads the selected card.
  { id: 'roster-next', doc: 'game', reps: 8,
    press: (page) => target(page, '.cot-car-arrow.next'), done: ROSTER_DONE, doneTimeoutMs: 60000 },
  { id: 'roster-key', doc: 'game', reps: 8, key: 'ArrowRight',
    press: (page) => target(page, 'body'), done: ROSTER_DONE, doneTimeoutMs: 60000 },
  { id: 'roster-chip', doc: 'game', reps: 5,
    press: (page, i) => target(page, '.cot-country-chips .cot-country-chip', i + 1), done: ROSTER_DONE, doneTimeoutMs: 60000,
    teardown: async (page, ctx) => { await tapOrClick(page, await target(page, '.cot-country-chips .cot-country-chip', 0), ctx).catch(() => {}); } },
  // INTERACTION-REDESIGN B, the camo try-on and the worn paint (main.ts garageCamoTryOn, window.__CAMO_TRY_ON). A hover on
  // one of the band's next swatches paints its 256 px tile and swaps it onto the hero (done: the try-on count); a press
  // wears the band's next paint and its full bake lands (done: the wear count). Each sample logs the try-on's paint and
  // swap, or the wear's press-to-bake, in milliseconds.
  { id: 'camo-try', doc: 'game', reps: 6,
    script: async (page, i, run) => {
      await page.mouse.move(2, 2);
      const before = await page.evaluate(() => window.__CAMO_TRY_ON?.tries ?? 0);
      await run('camo-try', () => target(page, '.cot-lt-paint .cot-c-picker__opt', 1 + (i % 3)),
        { action: (p) => p.hover('[data-click-target]'), done: `(window.__CAMO_TRY_ON?.tries ?? 0) > ${before}`, doneTimeoutMs: 15000 });
      const ms = await page.evaluate(() => window.__CAMO_TRY_ON?.lastTryMs ?? -1);
      console.log(`    camo-try #${i} tile paint and swap ${ms.toFixed(1)} ms`);
      await page.mouse.move(2, 2);
    } },
  { id: 'camo-wear', doc: 'game', reps: 6,
    script: async (page, i, run) => {
      const before = await page.evaluate(() => window.__CAMO_TRY_ON?.wears ?? 0);
      await run('camo-wear', () => target(page, '.cot-lt-paint .cot-c-picker__opt', 1),
        { done: `(window.__CAMO_TRY_ON?.wears ?? 0) > ${before}`, doneTimeoutMs: 60000 });
      const ms = await page.evaluate(() => window.__CAMO_TRY_ON?.lastWearMs ?? -1);
      console.log(`    camo-wear #${i} press to bake ${ms.toFixed(0)} ms`);
    } },
  { id: 'settings-open', doc: 'game', reps: 4,
    press: (page) => target(page, '.cot-settings-slot .cot-gear, [data-nav=settings]'), shown: `shown('.cot-settings.open')`,
    after: closeSettings },
  { id: 'settings-tab', doc: 'game', reps: 6,
    setup: async (page, ctx) => { await tapOrClick(page, await target(page, '.cot-settings-slot .cot-gear, [data-nav=settings]'), ctx);
      await waitFor(page, `shown('.cot-settings.open')`, 15000); },
    press: (page, i) => target(page, `.cot-set-tab[data-tab="${SETTINGS_TABS[(i + 1) % SETTINGS_TABS.length]}"]`),
    shown: `document.querySelector('[data-click-target]')?.classList.contains('sel')`, teardown: closeSettings },
  // the service record (Record in the top bar): its dialog, stylesheets and tooltip sheet load on first use
  { id: 'record-open', doc: 'game', reps: 3,
    press: (page) => target(page, '.cot-record-trigger'), shown: `shown('#cot-record-modal')`, shownTimeoutMs: 20000,
    after: async (page) => { await pressKey(page, 'Escape'); await waitFor(page, `!shown('#cot-record-modal')`, 10000).catch(() => {}); } },
  { id: 'deploy-open', doc: 'game', reps: 5,
    press: (page) => target(page, '[data-nav=deploy], .cot-battle-mode'), shown: `shown('#cot-battle-menu.open')`, after: closeDeploy },
  { id: 'deploy-mode', doc: 'game', reps: 6, setup: openDeploy,
    press: (page, i) => target(page, '#cot-battle-menu [data-deploy-modes] .cot-c-picker__opt', i + 1),
    teardown: async (page, ctx) => { await tapOrClick(page, await target(page, '#cot-battle-menu [data-deploy-modes] .cot-c-picker__opt[data-id="standard"]', 0), ctx).catch(() => {});
      await closeDeploy(page, ctx); } },
  { id: 'deploy-sides', doc: 'game', reps: 4, setup: openDeploy,
    press: (page, i) => target(page, `#cot-battle-menu .cot-battle-sides .cot-c-seg__opt[data-value="${i % 2 ? '7v7' : '14v14'}"]`), teardown: closeDeploy },
  { id: 'deploy-time', doc: 'game', reps: 4, setup: openDeploy,
    press: (page, i) => target(page, '#cot-battle-menu .cot-time-choice', Math.floor(i / 2)), teardown: closeDeploy },
  { id: 'deploy-tab', doc: 'game', reps: 4, setup: openDeploy,
    press: (page, i) => target(page, `#cot-battle-menu .cot-deploy-tab[data-tab="${i % 2 ? 'quick' : 'campaign'}"]`), teardown: closeDeploy },
  { id: 'deploy-map', doc: 'game', reps: 3, setup: openDeploy, teardown: closeDeploy,
    script: async (page, i, run) => {
      await run('deploy-field', () => target(page, '#cot-battle-menu [data-deploy-field]'), { shown: `shown('[data-deploy-bf] .cot-c-picker__opt')` });
      await run('deploy-map-pick', () => target(page, '[data-deploy-bf] .cot-c-picker__opt', i + 1), {});
    } },
  { id: 'studio-open', doc: 'game', reps: 3,
    press: (page) => target(page, '[data-nav=studio]'), shown: `shown('.cot-studio')`, shownTimeoutMs: 60000,
    done: `window.__STUDIO && shown('.cot-studio') && !shown('.cot-trans.on')`, doneTimeoutMs: 90000,
    after: async (page) => { await pressKey(page, 'Escape'); await waitFor(page, GARAGE_BACK, 60000); } },
  // a cold Studio entry left with Escape while its battlefield still streams, then entered again: the second press's
  // shell (shown) and its finished entry (done)
  { id: 'studio-reenter', doc: 'game', reps: 1,
    script: async (page, i, run, ctx) => {
      // a phone's Studio button is in the Garage's menu: the menu opens before the measured press
      const studio = async () => {
        const inBar = await page.$eval('[data-nav=studio]', (el) => el.getBoundingClientRect().width > 0
          && getComputedStyle(el).display !== 'none').catch(() => false);
        if (inBar) return target(page, '[data-nav=studio]');
        await tapOrClick(page, await target(page, '.cot-mobile-nav-trigger'), ctx);
        await waitFor(page, `shown('#cot-mobile-nav-menu')`, 10000);
        return target(page, '[data-mobile-nav="studio"]');
      };
      await run('studio-cold', studio, { shown: `shown('.cot-studio')`, shownTimeoutMs: 60000, quietMs: 1 });
      await page.evaluate(() => { window.__STUDIO_REENTRY = { loadingAtExit: !!(window.__STUDIO_LOAD && !window.__STUDIO_LOAD.done) }; });
      await leaveStudio(page, ctx);
      // the press waits out the exit's transition (a press during it is not taken), as a player's would
      await waitFor(page, `!shown('.cot-trans.on')`, 30000).catch(() => {});
      await sleep(800);
      await run('studio-reenter', studio, { shown: `shown('.cot-studio')`, shownTimeoutMs: 60000,
        done: `window.__STUDIO && shown('.cot-studio') && !shown('.cot-trans.on')`, doneTimeoutMs: 120000 });
      await leaveStudio(page, ctx);
      await sleep(1500);
    } },
  // a Studio press as soon as the Garage is back from a Studio exit, its transition still on (the press was dropped
  // before brand-ui-248 cb70fbec8a): whether the transition was on at the press is in studioReentry.transOnAtPress
  { id: 'studio-exit-press', doc: 'game', reps: 3,
    script: async (page, i, run, ctx) => {
      await tapOrClick(page, await target(page, '[data-nav=studio]'), ctx);
      await waitFor(page, `window.__STUDIO && shown('.cot-studio') && !shown('.cot-trans.on')`, 120000).catch(async (cause) => {
        console.log(`    #${i} entry did not open, state: ${JSON.stringify(await page.evaluate(() => ({
          phase: window.__DEBUG?.game?.phase ?? null, trans: !!document.querySelector('.cot-trans.on'),
          studioEl: !!document.querySelector('.cot-studio'), bodyData: Object.entries(document.body.dataset).map(([k, v]) => `${k}=${v}`).join(' ').slice(0, 300),
        })).catch(() => null))}`);
        throw cause;
      });
      await sleep(800);
      await pressKey(page, 'Escape');
      await waitFor(page, GARAGE_BACK, 60000);
      const studioState = () => page.evaluate(() => ({
        phase: window.__DEBUG?.game?.phase ?? null, studioActive: window.__STUDIO?.active ?? null,
        trans: !!document.querySelector('.cot-trans.on'), studioEl: !!document.querySelector('.cot-studio'),
        studioShown: !!document.querySelector('.cot-studio') && getComputedStyle(document.querySelector('.cot-studio')).display !== 'none',
        garage: !!document.querySelector('.cot-garage'), settings: !!document.querySelector('.cot-settings.open'),
        button: (() => { const b = document.querySelector('[data-nav=studio]');
          return b ? { disabled: b.disabled, aria: b.getAttribute('aria-disabled'), pe: getComputedStyle(b).pointerEvents } : null; })(),
        bodyData: Object.entries(document.body.dataset).map(([k, v]) => `${k}=${v}`).join(' ').slice(0, 300),
        studioLoad: window.__STUDIO_LOAD ? { done: window.__STUDIO_LOAD.done, stage: window.__STUDIO_LOAD.stage } : null,
      })).catch((error) => ({ error: String(error).slice(0, 120) }));
      const sample = await run('studio-exit-press', async () => {
        const selector = await target(page, '[data-nav=studio]');
        await page.evaluate(() => { window.__STUDIO_REENTRY = { transOnAtPress: !!document.querySelector('.cot-trans.on') }; });
        return selector;
      }, { shown: `shown('.cot-studio')`, shownTimeoutMs: 30000,
        done: `window.__STUDIO && shown('.cot-studio') && !shown('.cot-trans.on')`, doneTimeoutMs: 60000 });
      if (sample.error) console.log(`    #${i} missed press, state: ${JSON.stringify(await studioState())}`);
      await leaveStudio(page, ctx);
      await sleep(1500);
    } },
  // (lockdown-251) a fixed list of tanks selected by id (the debug surface), the same cold builds on both sides of an A/B
  { id: 'roster-pick', doc: 'battle', reps: 1,
    script: async (page, i, run) => {
      for (const id of PICK_IDS) {
        await run(`pick:${id}`, async () => null, { action: (tab) => tab.evaluate((spec) => { window.__DEBUG.selectGarageTank(spec); }, id),
          done: `(() => { const list = window.__GARAGE_SWITCH; const last = Array.isArray(list) ? list[list.length - 1] : null;
            return !!(last && last.id === ${JSON.stringify(id)} && last.revealMs != null); })()`, doneTimeoutMs: 60000, quietMs: 600 });
        await sleep(1500);
      }
    } },
  // (UI-LOCKDOWN E) memory flat across 20 open/close cycles of each Garage screen: the JS heap after a forced collection
  // and the DOM node count (Performance.getMetrics, detached nodes included), after two warm-up cycles and after twenty
  { id: 'memory-cycle', doc: 'game', reps: 1,
    script: async (page, i, run, ctx) => {
      const cdp = await page.createCDPSession();
      await cdp.send('Performance.enable');
      const measureMemory = async () => {
        for (let k = 0; k < 2; k++) await cdp.send('HeapProfiler.collectGarbage');
        const { usedSize } = await cdp.send('Runtime.getHeapUsage');
        const { metrics } = await cdp.send('Performance.getMetrics');
        const metric = (name) => metrics.find((m) => m.name === name)?.value ?? null;
        return { heapBytes: usedSize, nodes: metric('Nodes'), listeners: metric('JSEventListeners') };
      };
      for (const screen of MEMORY_SCREENS) {
        if (!await page.evaluate(expression(`[...document.querySelectorAll(${JSON.stringify(screen.open)})].some((el) => __click.visible(el))`)).catch(() => false)) {
          ctx.record(`memory:${screen.id}`, { error: 'no control on this layout' });
          continue;
        }
        const cycle = async () => {
          await tapOrClick(page, await target(page, screen.open), ctx);
          await waitFor(page, screen.shown, 30000);
          await settle(page, 300, 4000);
          await screen.close(page, ctx);
          await settle(page, 300, 4000);
        };
        try {
          for (let k = 0; k < 2; k++) await cycle();
          const before = await measureMemory();
          for (let k = 0; k < MEMORY_CYCLES; k++) await cycle();
          const after = await measureMemory();
          const sample = { cycles: MEMORY_CYCLES, before, after, heapDeltaBytes: after.heapBytes - before.heapBytes,
            nodeDelta: (after.nodes ?? 0) - (before.nodes ?? 0), listenerDelta: (after.listeners ?? 0) - (before.listeners ?? 0) };
          ctx.record(`memory:${screen.id}`, sample);
          console.log(`  memory:${screen.id.padEnd(10)} heap ${(sample.heapDeltaBytes / 1048576).toFixed(2)} MB  nodes ${sample.nodeDelta}  listeners ${sample.listenerDelta}`
            + ` over ${MEMORY_CYCLES} cycles`);
        } catch (cause) {
          ctx.record(`memory:${screen.id}`, { error: firstLine(cause) });
          console.log(`  memory:${screen.id} ERROR ${firstLine(cause)}`);
          await restoreGarage(page, ctx);
        }
      }
      await cdp.detach().catch(() => {});
    } },
  // (UI-LOCKDOWN A) the canvas rule over the Garage and its menus, then the Gallery (canvasProbe)
  { id: 'canvas-garage', doc: 'game', reps: 1,
    script: async (page, i, run, ctx) => {
      const pressOn = (selector) => async () => { await tapOrClick(page, await target(page, selector), ctx); };
      await canvasProbe(page, ctx, 'garage', [
        pressOn('.cot-car-arrow.next'), pressOn('.cot-car-arrow.next'), pressOn('.cot-car-arrow.next'),
        pressOn('.cot-settings-slot .cot-gear, [data-nav=settings]'), () => closeSettings(page, ctx),
        () => openDeploy(page, ctx), pressOn('#cot-battle-menu [data-deploy-modes] .cot-c-picker__opt'),
        () => closeDeploy(page, ctx),
        pressOn('.cot-record-trigger'), async () => { await pressKey(page, 'Escape'); await waitFor(page, `!shown('#cot-record-modal')`, 10000); },
      ]);
    } },
  // the battle's HUD canvases (the minimap, the sights, the aerial HUD): a solo battle, its pause menu and live frames
  { id: 'canvas-battle', doc: 'battle', reps: 1,
    script: async (page, i, run, ctx) => {
      await openDeploy(page, ctx);
      await tapOrClick(page, await target(page, '#cot-battle-menu [data-battle-launch], #cot-battle-menu .cot-battle'), ctx);
      await waitFor(page, `!!window.__BATTLE_REVEAL`, 240000);
      await settle(page, 800, 8000);
      const wait = () => sleep(900);
      const pause = async () => { await pressKey(page, 'Escape'); await waitFor(page, `shown('.cot-settings.open') || shown('.cot-pause')`, 10000).catch(() => {}); };
      const resume = async () => { await closeSettings(page, ctx).catch(() => pressKey(page, 'Escape')); await sleep(600); };
      await canvasProbe(page, ctx, 'battle-hud', [wait, wait, pause, resume, wait, wait, pause, resume, wait, wait]);
      await page.evaluate(() => window.__DEBUG.slayEnemies());
      await waitFor(page, `shown('.cot-es.show') && shown('.cot-es [data-es-action="garage"]')`, 120000).catch(() => {});
      await canvasProbe(page, ctx, 'battle-end', []);
      await tapOrClick(page, await target(page, '.cot-es.show [data-es-action="garage"]'), ctx).catch(() => {});
      await waitFor(page, GARAGE_BACK, 120000).catch(() => {});
    } },
  { id: 'canvas-gallery', doc: 'gallery', reps: 1,
    script: async (page, i, run, ctx) => {
      const pressOn = (selector, n = 0) => async () => { await tapOrClick(page, await target(page, selector, n), ctx); await sleep(600); };
      await canvasProbe(page, ctx, 'gallery', [
        pressOn('#vehicleList .it[data-id]:not([aria-selected=true])', 1), pressOn('#vehicleList .it[data-id]:not([aria-selected=true])', 4),
        pressOn('#vehicleList .it[data-id]:not([aria-selected=true])', 7),
        pressOn('#dossierTabs [role=tab][data-tab]', 1), pressOn('#dossierTabs [role=tab][data-tab]', 2), pressOn('#dossierTabs [role=tab][data-tab]', 0),
        pressOn('.layers [data-value="armor"]'), pressOn('.layers [data-value="appearance"]'),
        pressOn('#vehicleList .it[data-id]:not([aria-selected=true])', 10), pressOn('#vehicleList .it[data-id]:not([aria-selected=true])', 13),
      ]);
    } },
  // the Garage at rest: no frame or task may stall while nobody touches it
  { id: 'garage-idle', doc: 'game', reps: 1,
    script: async (page, i, run) => { await run('garage-idle', async () => null, { idleMs: 8000, quietMs: 1 }); } },
  // (lockdown-251) graceful recovery: the WebGL context lost in the Garage and restored 0.7 s later (the battle document,
  // for its debug surface's renderer; the Garage is where it opens); the window records
  // the restoration's frames, tasks and console, and the log says whether the Garage came back (context live, cover gone)
  { id: 'recover-context', doc: 'battle', reps: 2,
    script: async (page, i, run) => {
      await page.evaluate(() => {
        const lose = window.__DEBUG.renderer.getContext().getExtension('WEBGL_lose_context');
        window.__ctxLostAt = performance.now();
        lose.loseContext();
        setTimeout(() => lose.restoreContext(), 700);
      });
      await run('context-restore', async () => null, { idleMs: 7000, quietMs: 1 });
      // how long the cover took to clear (a 4x phone restores slower than the window), up to 30 s after the loss
      const state = await page.evaluate(async () => {
        while (document.getElementById('cot-ctxlost') && performance.now() - window.__ctxLostAt < 30000) {
          await new Promise((done) => setTimeout(done, 100));
        }
        return { lost: window.__DEBUG.renderer.getContext().isContextLost(), cover: !!document.getElementById('cot-ctxlost'),
          clearedMs: Math.round(performance.now() - window.__ctxLostAt), phase: window.__DEBUG.game?.phase ?? null,
          notice: document.querySelector('#cot-ctxlost-title')?.textContent ?? null };
      });
      console.log(`    context-restore #${i}: context ${state.lost ? 'STILL LOST' : 'live'}, cover ${state.cover
        ? `STILL SHOWN at ${state.clearedMs} ms (${state.notice})` : `gone ${state.clearedMs} ms after the loss`}, phase ${state.phase}`);
    } },
  // (lockdown-251) graceful recovery: the Studio's chunk fails to load (the network refuses it), then the press is retried
  { id: 'recover-chunk', doc: 'game', reps: 1,
    script: async (page, i, run, ctx) => {
      const refuse = (request) => (/\/assets\/studio-[^/]*\.js(\?|$)/.test(request.url()) ? request.abort('failed') : request.continue());
      await page.setRequestInterception(true);
      page.on('request', refuse);
      if (!(await page.evaluate(() => [...document.querySelectorAll('[data-nav=studio]')].some((el) => __click.visible(el))))) {
        page.off('request', refuse);
        await page.setRequestInterception(false);
        console.log('    chunk-fail-studio: no Studio control on this layout (desktop probe only)');
        return;
      }
      await run('chunk-fail-studio', () => target(page, '[data-nav=studio]'), { quietMs: 4000 });
      page.off('request', refuse);
      await page.setRequestInterception(false);
      const after = await page.evaluate(() => ({ studio: !!window.__STUDIO && __click.shown('.cot-studio'),
        garage: __click.shown('.cot-garage'), retry: !!document.querySelector('[data-boot-retry], .cot-boot-retry, #cot-boot-recovery'),
        toast: document.querySelector('.cot-toast, [role=alert]')?.textContent?.trim()?.slice(0, 80) ?? null }));
      console.log(`    chunk-fail-studio: ${JSON.stringify(after)}`);
      await waitFor(page, GARAGE, 120000); // the boot recovery may have reloaded the page
      await run('chunk-retry-studio', () => target(page, '[data-nav=studio]'), {
        done: `!!window.__STUDIO && shown('.cot-studio') && !shown('.cot-trans.on')`, doneTimeoutMs: 90000 });
      await leaveStudio(page, ctx);
    } },
  // every visible control on the Garage's screen, pressed once, the Garage restored between presses
  { id: 'garage-sweep', doc: 'game', reps: 1,
    script: async (page, i, run, ctx) => {
      const count = await page.evaluate((deny) => {
        const controls = [...document.querySelectorAll('button, [role=button], [role=tab], [role=switch], [role=option], select, '
          + 'input[type=checkbox], input[type=radio], a[href^="#"]')]
          .filter((el) => __click.visible(el) && !el.disabled && !el.matches(deny) && !el.closest(deny));
        controls.forEach((el, n) => el.setAttribute('data-sweep', String(n)));
        return controls.length;
      }, SWEEP_DENY);
      for (let n = 0; n < count; n++) {
        const selector = `[data-sweep="${n}"]`;
        const label = await page.evaluate((sel) => { const el = document.querySelector(sel);
          if (!el || !__click.visible(el)) return null;
          const text = el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || el.className || el.tagName;
          return String(text).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28) || el.tagName.toLowerCase(); }, selector);
        if (!label) continue;
        await run(`sweep:${n}:${label}`, async () => selector, { quietMs: 400 });
        await restoreGarage(page, ctx);
      }
    } },
  { id: 'studio-workspace', doc: 'game', reps: 6,
    setup: async (page, ctx) => { await tapOrClick(page, await target(page, '[data-nav=studio]'), ctx); await waitFor(page, `window.__STUDIO && shown('.cot-studio') && !shown('.cot-trans.on')`, 60000); },
    press: (page, i) => target(page, '.cot-studio .workspace-nav button', i + 1),
    teardown: async (page) => { await pressKey(page, 'Escape'); await waitFor(page, GARAGE_BACK, 60000); } },
  { id: 'battle', doc: 'battle', reps: 2,
    script: async (page, i, run, ctx) => {
      await page.evaluate(() => { window.__BATTLE_REVEAL = null; });
      await ctx.programs(`garage-${i}`);
      await openDeploy(page, ctx);
      await run('deploy-launch', () => target(page, '#cot-battle-menu [data-battle-launch], #cot-battle-menu .cot-battle'), {
        shown: `shown('.cot-bl.on')`, done: `!!window.__BATTLE_REVEAL`, doneTimeoutMs: 240000 });
      await ctx.programs(`battle-${i}`);
      // (lockdown-251) eight seconds of the live battle, untouched: its frames, tasks and (--alloc) allocation per second
      await run('battle-steady', async () => null, { idleMs: 8000, quietMs: 1 });
      await page.evaluate(() => window.__DEBUG.slayEnemies());
      await waitFor(page, `shown('.cot-es.show') && shown('.cot-es [data-es-action="garage"]')`, 120000);
      await settle(page, 800, 8000);
      await run('end-to-garage', () => target(page, '.cot-es.show [data-es-action="garage"]'), { shown: `shown('.cot-trans.on') || shown('.cot-garage')`,
        done: GARAGE_BACK, doneTimeoutMs: 120000 });
      await ctx.programs(`return-${i}`);
      if (i < 1) return;
      await openDeploy(page, ctx);
      await run('watch-enter', () => target(page, '#cot-battle-menu [data-battle-watch]'), {
        shown: `document.documentElement.dataset.watch != null`, shownTimeoutMs: 120000,
        done: `!!document.querySelector('.cot-watch .who b')?.textContent`, doneTimeoutMs: 240000 });
      await settle(page, 1500, 15000);
      for (let hop = 0; hop < 5; hop += 1) await run('watch-hop', () => target(page, `.cot-watch .wb.${hop % 2 ? 'prev' : 'next'}`), {});
      await run('watch-drone', () => target(page, '.cot-watch .wb.drone'), {});
    } },
  { id: 'gallery-row', doc: 'gallery', reps: 8,
    press: (page, i) => target(page, '#vehicleList .it[data-id]:not([aria-selected=true])', i * 3 + 1),
    shown: `document.querySelector('[data-click-target]')?.getAttribute('aria-selected') === 'true'`,
    done: `window.__TANK_GALLERY_READY === true
      && window.__TANK_GALLERY?.getState?.().selectedId === document.querySelector('[data-click-target]')?.dataset.id`, doneTimeoutMs: 60000 },
  { id: 'gallery-tab', doc: 'gallery', reps: 6,
    press: (page, i) => target(page, '#dossierTabs [role=tab][data-tab]', i + 1),
    shown: `document.querySelector('[data-click-target]')?.getAttribute('aria-selected') === 'true'` },
  { id: 'gallery-mode', doc: 'gallery', reps: 6,
    press: (page, i) => target(page, `.layers [data-value="${['armor', 'modules', 'crew', 'appearance'][i % 4]}"]`),
    // (lockdown-251) every read guarded: after a reload there is no target and no gallery, and an unguarded read threw
    // inside the page (a pageerror the census counted against the Gallery)
    done: `!!document.querySelector('[data-click-target]')
      && window.__TANK_GALLERY?.getState?.().mode === document.querySelector('[data-click-target]')?.dataset.mode
      && (window.__TANK_GALLERY?.getState?.().mode === 'appearance' || window.__TANK_GALLERY?.getState?.().overlayCount > 0)`, doneTimeoutMs: 60000 },
  // (interaction census, part D) the common paths, press by press (tools/interaction-steps.mjs): each press measured as
  // any other, then the path's presses and whether it finished; --report checks them against the baseline
  ...STEP_PATHS.map((path) => ({ id: `steps-${path.id}`, doc: path.doc, reps: 1, group: 'steps',
    script: async (page, i, run, ctx) => {
      await restoreGarage(page, ctx);
      let presses = 0;
      try {
        for (const step of path.setup ?? []) {
          await tapOrClick(page, await target(page, step.press, step.index ?? 0), ctx);
          await waitFor(page, step.shown, step.shownTimeoutMs ?? 30000);
        }
        for (const step of path.steps) {
          const sample = await run(`steps:${path.id}:${step.name}`, () => (step.key ? null : target(page, step.press, step.index ?? 0)),
            { key: step.key ?? null, shown: step.shown, shownTimeoutMs: step.shownTimeoutMs ?? 15000 });
          if (sample.error) throw new Error(`${step.name}: ${sample.error}`);
          presses += 1;
        }
      } finally {
        const done = await waitFor(page, path.done, 20000).then(() => true, () => false);
        ctx.record(`steps:${path.id}`, { presses, planned: path.steps.length, done });
        await resetStepPath(page, ctx, path.reset).catch((cause) => ctx.record(`steps:${path.id}:reset`, { error: firstLine(cause) }));
      }
    } })),
  // (interaction census, part D; UI-GAUNTLET line 12) keyboard and touch on each surface as it opens: names, reach, the kit's
  // focus ring (desktop: the Tab walk) and target sizes (44 px on a phone, 24 on a desktop)
  { id: 'access', doc: 'game', reps: 1, group: 'access',
    script: async (page, i, run, ctx) => {
      for (const surface of ACCESS_SURFACES) {
        await restoreGarage(page, ctx);
        try {
          await surface.open(page, ctx);
          const problems = await accessProblems(page, { phone: !!ctx.touch, scope: surface.scope ?? 'body' });
          ctx.record(`access:${surface.id}`, { problems });
        } catch (cause) {
          ctx.record(`access:${surface.id}`, { error: firstLine(cause) });
        }
      }
      await restoreGarage(page, ctx);
    } },
];

// The renderer's live programs (name, use count, key), so a path can diff the sets two states link: a long key keeps
// its head, its length and a hash of the whole.
const PROGRAM_KEYS = `(() => {
  const hash = (text) => { let h = 2166136261; for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return (h >>> 0).toString(16); };
  const programs = (window.__DEBUG?.renderer?.info?.programs ?? []).map((program) => {
    const key = String(program.cacheKey ?? '');
    return { name: program.name, used: program.usedTimes, hash: hash(key), key: key.length > 900 ? key.slice(0, 900) + '…' + key.length + ':' + hash(key) : key };
  });
  // every material in the scene with the program it last bound (hash of its key), the object and whether it draws
  const renderer = window.__DEBUG?.renderer;
  const materials = [];
  window.__DEBUG?.scene?.traverse?.((object) => {
    const list = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    if (!list.length) return;
    let shown = true;
    const chain = [];
    for (let node = object; node; node = node.parent) { shown = shown && node.visible; if (chain.length < 5) chain.push(node.name || node.type); }
    for (const material of list) {
      const program = renderer?.properties?.get?.(material)?.currentProgram;
      if (program) materials.push({ material: material.name || material.type, shown, chain: chain.join(' < '), hash: hash(String(program.cacheKey ?? '')),
        skin: /juggernaut/.test(String(material.onBeforeCompile)), burn: !!material.userData?.__burnU, id: material.id });
    }
  });
  // the scene's lights as a render collects them (visible down the chain), each with its owner chain
  const lights = [];
  window.__DEBUG?.scene?.traverse?.((object) => {
    if (!object.isLight) return;
    let shown = true;
    const chain = [];
    for (let node = object; node; node = node.parent) { shown = shown && node.visible; if (chain.length < 4) chain.push(node.name || node.type); }
    lights.push({ type: object.type, shown, intensity: object.intensity, shadow: !!object.castShadow, layers: object.layers.mask, chain: chain.join(' < ') });
  });
  return { programs, lights, materials, pedTrace: (window.__PED_TRACE ?? []).slice(-40) };
})()`;

async function runPath({ page, path, reps, touch, log, profileDir = null, outDir = null, label = '' }) {
  const samples = [];
  const ctx = {
    touch,
    // a sample a script measures itself (the memory cycles), stored beside the presses
    record: (kind, data, i = 0) => { samples.push({ kind, i, ...data }); },
    programs: async (name) => {
      if (!outDir) return;
      const list = await page.evaluate(PROGRAM_KEYS).catch(() => null);
      if (list) writeFileSync(join(outDir, `programs.${label}.${name}.json`), JSON.stringify(list, null, 1));
    },
  };
  const run = async (kind, pick, spec, i) => {
    let sample;
    try {
      const selector = await pick();
      const cpuProfile = profileDir ? { dir: profileDir, name: `${label}.${kind}.${i}` } : null;
      sample = await measure(page, { selector, touch, cpuProfile, ...spec });
    } catch (cause) {
      sample = { error: firstLine(cause), duration: null, loafs: [], longtaskMs: 0, longtasks: 0 };
    }
    samples.push({ kind, i, ...sample });
    log(`  ${kind.padEnd(18)} #${i} inp ${String(sample.duration == null ? '-' : Math.round(sample.duration)).padStart(5)}`
      + `  proc ${String(sample.processing ?? '-').padStart(4)}  long ${String(sample.longtaskMs).padStart(5)}/${sample.longtasks}`
      + `  shown ${sample.shownMs ?? '-'}  done ${sample.doneMs ?? '-'}${sample.error ? `  ERROR ${sample.error}` : ''}`
      + (sample.census ? `  | >33ms ${sample.census.frames33}/${sample.census.worstFrame}  >50ms ${sample.census.long50}/${sample.census.worstLong}`
        + `  errors ${sample.census.consoleErrors?.length ?? '-'}${sample.census.profiler ? '' : '  (no profiler)'}`
        + (sample.census.alloc ? `  alloc ${(sample.census.alloc.perSecond / 1048576).toFixed(1)} MB/s` : '') : ''));
    return sample;
  };
  let failures = 0;
  for (let i = 0; i < reps && failures < 2; i += 1) {
    if (path.script) {
      // a script that fails part way keeps the samples it took (the rest of the run goes on without it)
      try {
        await path.script(page, i, (kind, pick, spec) => run(kind, pick, spec, i), ctx);
      } catch (cause) {
        log(`  ${path.id} #${i} stopped: ${firstLine(cause)}`);
        break;
      }
    } else {
      const sample = await run(path.id, () => path.press(page, i), { shown: path.shown, done: path.done, doneTimeoutMs: path.doneTimeoutMs, key: path.key }, i);
      failures = sample.error ? failures + 1 : 0;
      if (path.after) await path.after(page, ctx).catch((cause) => log(`  after: ${firstLine(cause)}`));
    }
    await settle(page, 400, 4000);
  }
  return samples;
}

const quantile = (values, q) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
};

/** The largest RSS (kB) of any process under the browser: the run stops before a renderer passes 6 GB. */
function rendererPeakKb(rootPid) {
  try {
    const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss='], { encoding: 'utf8' }).trim().split('\n')
      .map((line) => line.trim().split(/\s+/).map(Number));
    const children = new Map();
    for (const [pid, ppid] of rows) { if (!children.has(ppid)) children.set(ppid, []); children.get(ppid).push(pid); }
    const rss = new Map(rows.map(([pid, , kb]) => [pid, kb]));
    let peak = 0;
    const stack = [rootPid];
    while (stack.length) { const pid = stack.pop(); for (const child of children.get(pid) || []) { peak = Math.max(peak, rss.get(child) || 0); stack.push(child); } }
    return peak;
  } catch { return 0; }
}

function parseBases() {
  return options('base').map((value, index) => {
    const at = value.indexOf('=');
    return at > 0 && !/^https?:/.test(value) ? { label: value.slice(0, at), url: value.slice(at + 1) } : { label: `b${index}`, url: value };
  });
}

async function main() {
  if (flag('list')) { for (const path of PATHS) console.log(`${path.id.padEnd(20)} ${path.doc}`); return; }
  if (option('report', '')) { await report(resolve(option('report', ''))); return; }
  const out = resolve(option('out', 'click-timeline-out'));
  const bases = parseBases();
  if (!bases.length) throw new Error('pass --base=<label>=<url>');
  const profileName = option('profile', 'desktop');
  const profile = PROFILES[profileName];
  if (!profile) throw new Error(`unknown profile ${profileName}`);
  const reps = Number(option('reps', '0')) || null;
  const wanted = option('paths', 'all').split(',');
  const paths = PATHS.filter((path) => wanted.includes(path.id) || wanted.includes(path.doc) || wanted.includes(path.group)
    || (wanted.includes('all') && !path.group));
  const docs = [...new Set(paths.map((path) => path.doc))];
  const host = option('host-map', 'cot.test');
  const budgetMs = Number(option('budget-min', '18')) * 60000;
  const touch = profile.viewport.hasTouch;
  const log = (line) => console.log(line);
  const { rememberWarm, rewarmPage } = await import('./capture-hold.mjs');

  // A page is warmed through capture-hold's records, so a page that reloads while frozen is re-warmed before the hold.
  const open = async (browser, base, doc) => {
    const page = await browser.newPage();
    page.setDefaultTimeout(180000);
    await page.setViewport(profile.viewport);
    if (profile.userAgent) await page.setUserAgent(profile.userAgent);
    page.__consoleLog = [];
    page.on('pageerror', (error) => { log(`  [${base.label}:${doc} page error] ${firstLine(error)}`);
      // the first frame of the stack names the code that threw
      const at = String(error?.stack ?? '').split('\n').find((line) => /^\s+at /.test(line))?.trim() ?? '';
      page.__consoleLog.push({ type: 'error', text: `pageerror: ${firstLine(error)}${at ? ` (${at})` : ''}`.slice(0, 320) }); });
    page.on('console', (message) => {
      const type = message.type();
      if (type === 'error' || type === 'warn' || type === 'warning') {
        // the script position that logged it (a browser intervention such as Canvas2D's readback notice names its caller
        // here, not in its text)
        const frame = message.stackTrace?.()?.[0] ?? message.location?.();
        const at = frame?.url ? ` @ ${frame.url.replace(/^.*\/assets\//, '')}:${(frame.lineNumber ?? 0) + 1}:${(frame.columnNumber ?? 0) + 1}` : '';
        page.__consoleLog.push({ type: type === 'error' ? 'error' : 'warn', text: `${message.text().slice(0, 240)}${at}` });
      }
    });
    if (DOCS[doc].automation) await page.evaluateOnNewDocument('window.__cotAutomation = true;');
    if (flag('layout-trace')) await page.evaluateOnNewDocument('window.__cotLayoutTrace = true;');
    // --busy=<everyMs>:<workMs>: a loaded main thread (a timer burning workMs every everyMs), as a polling probe or a busy
    // phone makes it
    const busy = option('busy', '');
    if (busy) {
      const [every, work] = busy.split(':').map(Number);
      await page.evaluateOnNewDocument(`setInterval(() => { const end = performance.now() + ${work}; while (performance.now() < end) {} }, ${every});`);
    }
    await page.evaluateOnNewDocument(PROBE);
    const url = new URL(DOCS[doc].url, base.url).href;
    rememberWarm(page, { url, ready: expression(DOCS[doc].ready), after: DOCS[doc].after ?? null });
    log(`warming ${base.label}:${doc} ${url}`);
    await rewarmPage(page);
    // the boot's own stage timings (main.ts BOOT_TIMINGS), kept beside the run
    const boot = await page.evaluate(() => ({ ms: window.__BOOT_MS ?? null, timings: window.__BOOT_TIMINGS ?? null })).catch(() => null);
    if (boot?.timings) {
      mkdirSync(join(out, base.label), { recursive: true });
      writeFileSync(join(out, base.label, `boot.${doc}.${profileName}.json`), `${JSON.stringify(boot, null, 1)}\n`);
    }
    return page;
  };

  const warm = async () => {
    for (const base of bases) {
      const reply = await fetch(base.url.replace(`//${host}`, '//127.0.0.1')).catch(() => null);
      if (!reply?.ok) throw new Error(`${base.label} (${base.url}) does not answer`);
    }
    const browser = await launchGuardedBrowser(puppeteer, {
      headless: 'new', protocolTimeout: 600000, timeout: 180000, defaultViewport: null,
      args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
        '--js-flags=--max-old-space-size=3072', `--host-resolver-rules=MAP ${host} 127.0.0.1`,
        '--disable-blink-features=AutomationControlled', '--window-size=1440,1000'],
    });
    try {
      const byKey = {};
      for (const base of bases) for (const doc of docs) byKey[`${base.label}:${doc}`] = await open(browser, base, doc);
      return { browser, pages: Object.values(byKey), byKey, close: () => browser.close() };
    } catch (error) {
      await browser.close().catch(() => {});
      throw error;
    }
  };

  const shoot = async ({ browser, byKey, signal }) => {
    const started = Date.now();
    const rootPid = browser.process()?.pid;
    let aborted = null;
    const guard = setInterval(() => {
      const peak = rendererPeakKb(rootPid);
      if (peak > RENDERER_LIMIT_KB) { aborted = `a renderer reached ${(peak / 1048576).toFixed(1)} GB`; browser.process()?.kill('SIGKILL'); }
    }, 5000);
    const results = [];
    try {
      for (const [index, path] of paths.entries()) {
        // Alternate which build goes first per path.
        const order = index % 2 ? [...bases].reverse() : bases;
        for (const base of order) {
          if (signal?.aborted || aborted || Date.now() - started > budgetMs) break;
          const page = byKey[`${base.label}:${path.doc}`];
          await page.bringToFront();
          await page.emulateCPUThrottling(profile.cpu);
          log(`${base.label} ${path.id} (${profileName})`);
          let samples = [];
          let error = null;
          mkdirSync(join(out, base.label), { recursive: true });
          try {
            if (path.setup) await path.setup(page, { touch });
            samples = await runPath({ page, path, reps: reps ?? path.reps, touch, log,
              profileDir: option('cpu-profile', '') ? resolve(option('cpu-profile', '')) : null, outDir: join(out, base.label),
              label: `${base.label}.${profileName}` });
            if (path.teardown) await path.teardown(page, { touch });
          } catch (cause) {
            error = firstLine(cause);
            log(`  ${path.id} ERROR ${error}`);
          } finally {
            await page.emulateCPUThrottling(1).catch(() => {});
          }
          const record = { label: base.label, path: path.id, profile: profileName, error, samples };
          results.push(record);
          mkdirSync(join(out, base.label), { recursive: true });
          writeFileSync(join(out, base.label, `${path.id}.${profileName}.json`), `${JSON.stringify(record, null, 1)}\n`);
        }
      }
    } finally {
      clearInterval(guard);
    }
    if (aborted) log(`click-timeline: aborted, ${aborted}`);
    return results;
  };

  if (flag('lock')) {
    const { runWarmHold } = await import('./capture-hold.mjs');
    await runWarmHold({ label: 'click-timeline', place: option('place', null), holdMinutes: Number(option('budget-min', '18')), warm, shoot });
    return;
  }
  const warmed = await warm();
  for (const name of ['SIGTERM', 'SIGINT', 'SIGALRM', 'SIGHUP']) process.on(name, () => { warmed.browser.process()?.kill('SIGKILL'); process.exit(143); });
  try { await shoot(warmed); } finally { await warmed.close().catch(() => {}); }
}

/** Fold the samples: p50 / p95 per press kind and build, and the scripts behind the slow frames, resolved to source. */
async function report(dir) {
  const labels = option('labels', '') ? option('labels', '').split(',')
    : readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  const dists = Object.fromEntries(options('dist').map((value) => value.split('=')));
  const { SourceMapConsumer } = await import('source-map-js');
  const consumers = new Map();
  const locate = (label, url, pos) => {
    const dist = dists[label];
    if (!dist || !url || pos == null || pos < 0) return null;
    let file;
    try { file = new URL(url).pathname; } catch { return null; }
    const key = `${label}:${file}`;
    if (!consumers.has(key)) {
      const js = join(dist, file);
      const map = `${js}.map`;
      consumers.set(key, existsSync(js) && existsSync(map)
        ? { text: readFileSync(js, 'utf8'), consumer: new SourceMapConsumer(JSON.parse(readFileSync(map, 'utf8'))) } : null);
    }
    const entry = consumers.get(key);
    if (!entry) return null;
    const before = entry.text.slice(0, pos);
    const line = before.split('\n').length;
    const column = pos - before.lastIndexOf('\n') - 1;
    const found = entry.consumer.originalPositionFor({ line, column });
    return found?.source ? `${found.source.replace(/^.*?\/src\//, 'src/')}:${found.line}${found.name ? ` ${found.name}` : ''}` : null;
  };
  // a profiler frame's position (1-based line and column) in its built file, as a source line
  const locateLineColumn = (label, url, line, column) => {
    const dist = dists[label];
    if (!dist || !url || !line) return null;
    let file;
    try { file = new URL(url).pathname; } catch { return null; }
    const key = `${label}:${file}`;
    if (!consumers.has(key)) {
      const js = join(dist, file);
      const map = `${js}.map`;
      consumers.set(key, existsSync(js) && existsSync(map)
        ? { text: readFileSync(js, 'utf8'), consumer: new SourceMapConsumer(JSON.parse(readFileSync(map, 'utf8'))) } : null);
    }
    const entry = consumers.get(key);
    if (!entry) return null;
    const found = entry.consumer.originalPositionFor({ line, column: Math.max(0, (column ?? 1) - 1) });
    return found?.source ? `${found.source.replace(/^.*?\/src\//, 'src/').replace(/^.*node_modules\//, '')}:${found.line}${found.name ? ` ${found.name}` : ''}` : null;
  };
  const kinds = new Map();
  for (const label of labels) {
    if (!existsSync(join(dir, label))) continue;
    for (const file of readdirSync(join(dir, label)).filter((f) => f.endsWith('.json'))) {
      const run = JSON.parse(readFileSync(join(dir, label, file), 'utf8'));
      if (!Array.isArray(run.samples)) continue;
      for (const sample of run.samples) {
        const key = `${sample.kind}.${run.profile}`;
        if (!kinds.has(key)) kinds.set(key, {});
        (kinds.get(key)[label] ??= []).push(sample);
      }
    }
  }
  const stat = (samples, field) => {
    const values = samples.filter((s) => !s.error && s[field] != null).map((s) => Math.round(s[field]));
    return values.length ? `${quantile(values, 0.5)} / ${quantile(values, 0.95)}` : '-';
  };
  const rows = [];
  const culprits = [];
  const ranked = [];
  for (const [key, byLabel] of [...kinds].sort()) {
    const cells = labels.map((label) => {
      const samples = byLabel[label] || [];
      const errors = samples.filter((s) => s.error).length;
      return `${stat(samples, 'duration')} | ${stat(samples, 'longtaskMs')} | ${stat(samples, 'shownMs')} | ${stat(samples, 'doneMs')} | ${samples.length - errors}${errors ? ` (${errors} err)` : ''}`;
    });
    rows.push(`| ${key} | ${cells.join(' | ')} |`);
    const first = byLabel[labels[0]] || [];
    const p95 = quantile(first.filter((s) => !s.error && s.duration != null).map((s) => s.duration), 0.95) ?? 0;
    ranked.push([key, p95]);
    for (const label of labels) {
      const scripts = new Map();
      const samples = byLabel[label] || [];
      for (const sample of samples) {
        for (const loaf of sample.loafs || []) for (const script of loaf.scripts) {
          const where = locate(label, script.url, script.pos) || `${(script.url || '').split('/').pop()} ${script.fn || script.invoker}`;
          const entry = scripts.get(where) || { ms: 0, layout: 0 };
          entry.ms += script.duration; entry.layout += script.layout || 0;
          scripts.set(where, entry);
        }
      }
      for (const [where, entry] of [...scripts].sort((a, b) => b[1].ms - a[1].ms).slice(0, 5)) {
        culprits.push(`| ${key} | ${label} | ${where} | ${Math.round(entry.ms / (samples.length || 1))} | ${Math.round(entry.layout / (samples.length || 1))} |`);
      }
    }
  }
  const head = labels.map((l) => `${l} INP p50 / p95 | long ms | shown ms | done ms | n`).join(' | ');
  console.log(`| press.profile | ${head} |\n|---|${labels.map(() => '---:|---:|---:|---:|---:|').join('')}`);
  console.log(rows.join('\n'));
  console.log(`\nWorst by ${labels[0]} INP p95: ${ranked.sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ')}`);
  console.log(`\n| press.profile | build | script (source) | ms per press | forced layout ms |\n|---|---|---|---:|---:|`);
  console.log(culprits.join('\n'));
  interactionReport(kinds, labels);
  // --census runs: every surface's spikes (frames over 33 ms, long tasks over 50 ms), console errors, and the code its
  // long tasks sampled, summed over the run
  const censusRows = [];
  const code = new Map();
  const errorsSeen = new Map();
  for (const [key, byLabel] of [...kinds].sort()) {
    for (const label of labels) {
      const samples = (byLabel[label] || []).filter((s) => s.census && !s.census.error);
      if (!samples.length) continue;
      const sum = (field) => samples.reduce((total, s) => total + (s.census[field] || 0), 0);
      const worst = (field) => Math.max(0, ...samples.map((s) => s.census[field] || 0));
      const errors = samples.flatMap((s) => s.census.consoleErrors || []);
      for (const text of errors) errorsSeen.set(`${label} | ${text}`, (errorsSeen.get(`${label} | ${text}`) || 0) + 1);
      censusRows.push({ row: `| ${key} | ${label} | ${samples.length} | ${sum('frames33')} | ${worst('worstFrame')} | ${sum('long50')} | ${worst('worstLong')} | ${errors.length} |`,
        weight: sum('long50') * 1000 + worst('worstLong') });
      for (const sample of samples) for (const long of sample.census.longs || []) for (const site of long.code || []) {
        const where = locateLineColumn(label, site.url, site.line, site.column) || `${(site.url || '').split('/').pop()} ${site.name}`;
        const entry = code.get(`${label} | ${where}`) || { ms: 0, tasks: 0, paths: new Set() };
        entry.ms += site.ms; entry.tasks += 1; entry.paths.add(key.split('.')[0].replace(/^sweep:\d+:/, 'sweep:'));
        code.set(`${label} | ${where}`, entry);
      }
    }
  }
  if (!censusRows.length) return;
  console.log(`\n| surface.profile | build | samples | frames >33 ms | worst frame | tasks >50 ms | worst task | console errors |\n|---|---|---:|---:|---:|---:|---:|---:|`);
  console.log(censusRows.sort((a, b) => b.weight - a.weight).map((r) => r.row).join('\n'));
  console.log(`\n| build | code in long tasks (source) | sampled ms | tasks | surfaces |\n|---|---|---:|---:|---|`);
  console.log([...code].sort((a, b) => b[1].ms - a[1].ms).slice(0, 40)
    .map(([where, e]) => `| ${where} | ${e.ms} | ${e.tasks} | ${[...e.paths].slice(0, 4).join(', ')} |`).join('\n'));
  const allocRows = [];
  const allocSites = new Map();
  for (const [key, byLabel] of [...kinds].sort()) {
    for (const label of labels) {
      const samples = (byLabel[label] || []).filter((s) => s.census?.alloc);
      if (!samples.length) continue;
      const bytes = samples.reduce((sum, s) => sum + s.census.alloc.bytes, 0);
      const ms = samples.reduce((sum, s) => sum + (s.census.windowMs || 0), 0);
      allocRows.push({ row: `| ${key} | ${label} | ${(bytes / 1048576).toFixed(1)} | ${ms ? (bytes / 1048.576 / ms).toFixed(2) : '-'} |`, bytes: ms ? bytes / ms : 0 });
      for (const sample of samples) for (const site of sample.census.alloc.sites) {
        const where = locateLineColumn(label, site.url, site.line, site.column) || `${(site.url || '').split('/').pop()} ${site.name}`;
        const entry = allocSites.get(`${label} | ${where}`) || { bytes: 0, paths: new Set() };
        entry.bytes += site.bytes; entry.paths.add(key.split('.')[0].replace(/^sweep:\d+:/, 'sweep:'));
        allocSites.set(`${label} | ${where}`, entry);
      }
    }
  }
  if (allocRows.length) {
    console.log(`\n| surface.profile | build | MB allocated | MB/s |\n|---|---|---:|---:|`);
    console.log(allocRows.sort((a, b) => b.bytes - a.bytes).map((r) => r.row).join('\n'));
    console.log(`\n| build | allocating code (source) | MB | surfaces |\n|---|---|---:|---|`);
    console.log([...allocSites].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 40)
      .map(([where, e]) => `| ${where} | ${(e.bytes / 1048576).toFixed(2)} | ${[...e.paths].slice(0, 4).join(', ')} |`).join('\n'));
  }
  if (errorsSeen.size) {
    console.log(`\n| build | console error | count |\n|---|---|---:|`);
    console.log([...errorsSeen].sort((a, b) => b[1] - a[1]).map(([text, n]) => `| ${text.replace(/\|/g, '/')} | ${n} |`).join('\n'));
  }
}

/** (interaction census, part D) each common path's presses against tools/interaction-baseline.json, which may only fall,
 *  and each surface's keyboard and touch problems; a path over its baseline, or one that did not finish, sets the exit code. */
function interactionReport(kinds, labels) {
  const baseline = JSON.parse(readFileSync(new URL('./interaction-baseline.json', import.meta.url), 'utf8'));
  const steps = [];
  const access = [];
  for (const [key, byLabel] of [...kinds].sort()) {
    const [kind, profile] = [key.slice(0, key.lastIndexOf('.')), key.slice(key.lastIndexOf('.') + 1)];
    for (const label of labels) {
      for (const sample of byLabel[label] || []) {
        if (/^steps:[^:]+$/.test(kind)) {
          const id = kind.slice(6);
          const over = sample.presses > (baseline.paths[id] ?? Infinity);
          if (over || !sample.done) process.exitCode = 1;
          steps.push(`| ${id} | ${profile} | ${label} | ${sample.presses} | ${baseline.paths[id] ?? '-'} | ${sample.done ? 'yes' : 'NO'} | ${over ? 'OVER' : 'ok'} |`);
        } else if (/^access:/.test(kind)) {
          access.push(`| ${kind.slice(7)} | ${profile} | ${label} | ${sample.error ? `error: ${sample.error}` : sample.problems.length} |`);
          for (const problem of sample.problems ?? []) access.push(`|  | | | ${problem.replace(/\|/g, '/')} |`);
        }
      }
    }
  }
  if (steps.length) console.log(`\n| common path | profile | build | presses | baseline | finished | |\n|---|---|---|---:|---:|---|---|\n${steps.join('\n')}`);
  if (access.length) console.log(`\n| surface | profile | build | keyboard and touch problems |\n|---|---|---|---|\n${access.join('\n')}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
