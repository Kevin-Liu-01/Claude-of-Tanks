#!/usr/bin/env node
// Click-to-next-paint for every in-game click path (2026-10-24, click-perf-244; the owner: "make clicking through a lot
// more performant"; the web rules: shell first, never block a navigation, no pops).
//
//   node tools/click-timeline.mjs --base=<label>=<url> [--base=<label>=<url>] --out=<dir> [--paths=all|<doc>|<id>,…]
//        [--profile=desktop|phone] [--reps=6] [--lock] [--place=<key>] [--budget-min=18]
//   node tools/click-timeline.mjs --report=<dir> [--labels=base,after] [--dist=<label>=<dist dir>]
//   node tools/click-timeline.mjs --list
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
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer';

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
  await handle.evaluate((el) => el.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  if (touch) await handle.tap();
  else await handle.click();
}

const expression = (body) => `(() => { const shown = window.__click.shown; const visible = window.__click.visible; return (${body}); })()`;

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
async function measure(page, { selector, key = null, shown = null, done = null, shownTimeoutMs = 15000, doneTimeoutMs = 30000, touch, quietMs, cpuProfile = null }) {
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
  if (key) await page.keyboard.press(key).catch((cause) => { error = firstLine(cause); });
  else await press(page, selector, touch).catch((cause) => { error = firstLine(cause); });
  // the press's task and its next two frames: what the layout tracer (when on) attributes
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))).catch(() => {});
  const layoutReads = await page.evaluate(() => { window.__click.layoutArmed = false; return window.__click.layoutReads.splice(0); }).catch(() => []);
  if (profiler) {
    const { profile } = await profiler.send('Profiler.stop').catch(() => ({ profile: null }));
    if (profile) {
      mkdirSync(cpuProfile.dir, { recursive: true });
      writeFileSync(join(cpuProfile.dir, `${cpuProfile.name}.cpuprofile`), JSON.stringify(profile));
    }
    await profiler.detach().catch(() => {});
  }
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
    doneMs: doneAt == null ? null : Math.round(doneAt - t0), ...data };
}

const pressKey = (page, key) => page.keyboard.press(key);
const tapOrClick = (page, selector, { touch }) => press(page, selector, touch);
const closeSettings = async (page, ctx) => {
  if (!await page.evaluate(() => window.__click.shown('.cot-settings.open'))) return;
  await tapOrClick(page, '.cot-settings.open .cot-set-close, .cot-settings.open .resume', ctx).catch(() => pressKey(page, 'Escape'));
  await waitFor(page, `!shown('.cot-settings.open')`, 10000);
};
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
const GARAGE_BACK = `shown('.cot-garage') && window.__GAME_READY === true && (!window.__GARAGE_ENTRY || window.__GARAGE_ENTRY.presentationUnready === false)`;

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
    press: (page, i) => target(page, '#cot-battle-menu .cot-battle-choice[data-game-mode], #cot-battle-menu .cot-battle-choice[data-mode=solo]', i + 1),
    teardown: async (page, ctx) => { await tapOrClick(page, await target(page, '#cot-battle-menu .cot-battle-choice[data-mode=solo], #cot-battle-menu .cot-battle-choice', 0), ctx).catch(() => {});
      await closeDeploy(page, ctx); } },
  { id: 'deploy-sides', doc: 'game', reps: 4, setup: openDeploy,
    press: (page, i) => target(page, `#cot-battle-menu .cot-sides-choice[data-sides="${i % 2 ? '7v7' : '14v14'}"]`), teardown: closeDeploy },
  { id: 'deploy-time', doc: 'game', reps: 4, setup: openDeploy,
    press: (page, i) => target(page, '#cot-battle-menu .cot-time-choice', Math.floor(i / 2)), teardown: closeDeploy },
  { id: 'deploy-tab', doc: 'game', reps: 4, setup: openDeploy,
    press: (page, i) => target(page, `#cot-battle-menu .cot-deploy-tab[data-tab="${i % 2 ? 'quick' : 'campaign'}"]`), teardown: closeDeploy },
  { id: 'deploy-map', doc: 'game', reps: 3, setup: openDeploy, teardown: closeDeploy,
    script: async (page, i, run) => {
      await run('deploy-field', () => target(page, '#cot-battle-menu [data-deploy-field]'), { shown: `shown('.cot-map-card .cot-map-select')` });
      await run('deploy-map-pick', () => target(page, '.cot-map-card .cot-map-select', i + 1), {});
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
      await pressKey(page, 'Escape');
      await waitFor(page, GARAGE_BACK, 60000);
      // the press waits out the exit's transition (a press during it is not taken), as a player's would
      await waitFor(page, `!shown('.cot-trans.on')`, 30000).catch(() => {});
      await sleep(800);
      await run('studio-reenter', studio, { shown: `shown('.cot-studio')`, shownTimeoutMs: 60000,
        done: `window.__STUDIO && shown('.cot-studio') && !shown('.cot-trans.on')`, doneTimeoutMs: 120000 });
      await pressKey(page, 'Escape');
      await waitFor(page, GARAGE_BACK, 60000).catch(() => {});
      await waitFor(page, `!shown('.cot-trans.on')`, 30000).catch(() => {});
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
        garage: !!document.querySelector('.cot-garage'), button: (() => { const b = document.querySelector('[data-nav=studio]');
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
      await pressKey(page, 'Escape');
      await waitFor(page, GARAGE_BACK, 60000).catch(() => {});
      await waitFor(page, `!shown('.cot-trans.on')`, 30000).catch(() => {});
      await sleep(1500);
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
    press: (page, i) => target(page, `[data-mode="${['armor', 'modules', 'crew', 'appearance'][i % 4]}"]`),
    done: `window.__TANK_GALLERY?.getState?.().mode === document.querySelector('[data-click-target]')?.dataset.mode
      && (window.__TANK_GALLERY.getState().mode === 'appearance' || window.__TANK_GALLERY.getState().overlayCount > 0)`, doneTimeoutMs: 60000 },
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
      + `  shown ${sample.shownMs ?? '-'}  done ${sample.doneMs ?? '-'}${sample.error ? `  ERROR ${sample.error}` : ''}`);
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
  const paths = PATHS.filter((path) => wanted.includes('all') || wanted.includes(path.id) || wanted.includes(path.doc));
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
    page.on('pageerror', (error) => log(`  [${base.label}:${doc} page error] ${firstLine(error)}`));
    if (DOCS[doc].automation) await page.evaluateOnNewDocument('window.__cotAutomation = true;');
    if (flag('layout-trace')) await page.evaluateOnNewDocument('window.__cotLayoutTrace = true;');
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
    const browser = await puppeteer.launch({
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
  const kinds = new Map();
  for (const label of labels) {
    if (!existsSync(join(dir, label))) continue;
    for (const file of readdirSync(join(dir, label)).filter((f) => f.endsWith('.json'))) {
      const run = JSON.parse(readFileSync(join(dir, label, file), 'utf8'));
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
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
