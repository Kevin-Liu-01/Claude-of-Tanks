#!/usr/bin/env node
// Navigation timelines: record each public and in-game navigation from the click to settled, on a desktop and a mid
// phone, with a cold and a warm cache (2026-10-22, nav-perf-240; the owner's web rules: never block a navigation,
// keep static chrome in the layout, no visual pops).
//
//   node tools/nav-timeline.mjs --base=<label>=<url> [--base=<label>=<url>] --out=<dir> [--journeys=all|id,group]
//        [--profiles=desktop,phone] [--caches=cold,warm] [--lock] [--budget-min=18] [--soft-gl]
//   node tools/nav-timeline.mjs --list
//   node tools/nav-timeline.mjs --report=<dir> [--labels=base,after]     Markdown tables of a recorded run
//
// Serve each build with tools/vercel-static-preview.mjs (production headers) and pass a non-loopback name
// (http://cot.test:<port>/): the tool maps cot.test to 127.0.0.1, so the star counter and every host check behave
// as in production. Several --base pairs interleave the builds run by run (A/B under the same machine load).
//
// A journey is a start page and a chain of steps in one tab; each step is one recorded navigation. Per step and
// profile × cache the tool writes `<label>/<step>.<profile>.<cache>.json` and a filmstrip PNG (the frame on screen at
// fixed offsets after the click). All times are from the click (or the address-bar navigation):
//   response   the first frame that differs from the one before the input (until then the old view is held);
//   fcp / lcp  a new document's first and largest contentful paints;
//   content    the step's "meaningful content is visible" predicate (images decoded, not a skeleton);
//   ready      the step's "destination is usable" predicate (defaults to content);
//   settled    ready or the last layout shift, whichever is later;
//   abrupt     every frame that differs from the one before it (a jump, a swap, a flash; also a playing loop);
//   cls        layout-shift score without recent input (the web-vitals definition); `shift` counts every shift,
//              including those a click's 500 ms input window excuses (each jump a player sees), with their sources.
// Frames come from a Chrome trace (devtools.screenshot). `navigator.webdriver` is hidden: the game skips its
// transition veils and its boot gate under automation (src/ui/transition.ts, src/ui/bootScreen.ts), and a recording
// must show what a player sees. Cold = a fresh browser context (empty HTTP cache); warm = the same context running
// the journey again. --lock takes a normal ticket in the shared capture queue (tools/capture-lock.mjs) and stops
// starting journeys after --budget-min minutes of holding it.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer';

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const hit = argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const options = (name) => argv.filter((value) => value.startsWith(`--${name}=`)).map((value) => value.slice(name.length + 3));
const flag = (name) => argv.includes(`--${name}`);

const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36';
const PROFILES = {
  desktop: {
    viewport: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
    cpu: 1,
    network: { latency: 40, download: 50e6 / 8, upload: 10e6 / 8 },
  },
  phone: {
    viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    cpu: 4,
    network: { latency: 150, download: 9e6 / 8, upload: 2e6 / 8 },
    userAgent: PHONE_UA,
  },
};

/** Filmstrip offsets after the click (ms). */
const STRIP_OFFSETS = [0, 100, 200, 300, 400, 600, 800, 1000, 1300, 1600, 2000, 2500, 3000, 4000, 5000, 6500, 8000,
  10000, 13000, 16000, 20000, 25000, 30000, 40000, 50000, 60000, 80000, 100000];

// Predicate helpers, evaluated in the page every frame.
const HELPERS = `const visible = (sel) => { const el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!el) return false;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= innerHeight) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false; }
    return true; };
  const decoded = (sel) => { const shown = [...document.querySelectorAll(sel)].filter((img) => visible(img));
    return shown.length > 0 && shown.every((img) => img.complete && img.naturalWidth > 0); };
  const any = (sel) => [...document.querySelectorAll(sel)].some((el) => visible(el));`;
const when = (body) => `(() => { ${HELPERS} return (${body}); })()`;

const tapOrClick = async (page, ctx, selector) => {
  await page.waitForSelector(selector, { visible: true, timeout: 120000 });
  if (ctx.touch) await page.tap(selector);
  else await page.click(selector);
};
const click = (selector) => Object.assign((page, ctx) => tapOrClick(page, ctx, selector), { target: selector });
/** An address-bar navigation: the recording starts with it, so it is not awaited. */
const direct = (path) => async (page, ctx) => {
  page.goto(new URL(path, ctx.base).href, { waitUntil: 'domcontentloaded', timeout: 240000 }).catch(() => {});
};
const pressOrTap = (key, selector) => async (page, ctx) => {
  if (ctx.touch) await tapOrClick(page, ctx, selector);
  else await page.keyboard.press(key);
};
/** The boot gate takes any key or pointer press; a player taps or clicks the middle of the screen. */
const passGate = async (page, ctx) => {
  await page.waitForSelector('#cot-boot-gate.on', { visible: true, timeout: 240000 });
  const { width, height } = page.viewport();
  if (ctx.touch) await page.touchscreen.tap(Math.round(width / 2), Math.round(height * 0.62));
  else await page.mouse.click(Math.round(width / 2), Math.round(height * 0.62));
};
const waitFor = (expr, timeout = 240000) => (page) => page.waitForFunction(when(expr), { timeout, polling: 250 });

const GARAGE = `visible('.cot-garage') && !document.querySelector('.cot-garage.awaiting-boot') && any('.cot-garage .cot-card')`;
const HERO_DECODED = `decoded('#cot-boot-hero img')`;
const SHOW_TIMEOUT = 240000;

// Journeys. `start` loads first (not recorded) and `startReady` waits for it; `setup` runs after that. Steps run in
// order in the same tab: `act` is the click, `content` / `ready` are predicates, `window` the ms recorded after ready.
const JOURNEYS = [
  { id: 'home', group: 'public', steps: [
    { id: 'home-load', act: direct('/home'), window: 3000,
      content: when(`visible('.v5-hero h1') && decoded('.v5-hero-rail img.is-active')`) },
    { id: 'home-to-gallery', act: click('.public-nav__links a[href="/gallery"]'), window: 3000,
      content: when(`location.pathname === '/gallery' && any('#vehicleList .vehicle-card')`),
      ready: when(`location.pathname === '/gallery' && window.__TANK_GALLERY_READY === true`) },
    { id: 'gallery-dossier', act: click('#vehicleList .vehicle-card:not(.active)'), window: 2500,
      content: when(`document.querySelector('#vehicleList .vehicle-card.active')?.dataset.id !== 'm1a1_abrams_hc' && document.getElementById('loadingState')?.hidden === true`) },
    { id: 'gallery-to-docs', act: click('.public-nav__links a[href="/docs"]'), window: 3000,
      content: when(`location.pathname === '/docs' && visible('h1')`) },
    { id: 'docs-to-topic', act: click('a[href="/docs/build"]'), window: 3000,
      content: when(`location.pathname === '/docs/build' && visible('#topicRoot h1')`) },
  ] },
  { id: 'docs', group: 'public', start: '/docs', startReady: `visible('h1')`, steps: [
    { id: 'docs-archive', act: click('#docsArchiveOpen'), window: 2500,
      content: when(`visible('#docsArchive h2') && document.querySelector('#docsArchive .media-archive-card')`),
      ready: when(`[...document.querySelectorAll('#docsArchive .media-archive-card img')].slice(0, 4).every((img) => img.complete && img.naturalWidth > 0)`) },
  ] },
  { id: 'misc', group: 'public', steps: [
    { id: 'not-found', act: direct('/no-such-page'), window: 2500, content: when(`visible('h1')`) },
    { id: 'cn-home', act: direct('/cn/home'), window: 3000,
      content: when(`visible('.v5-hero h1') && decoded('.v5-hero-rail img.is-active')`) },
  ] },
  { id: 'studio', group: 'game', start: '/home', startReady: `visible('.v5-hero h1')`, steps: [
    { id: 'home-to-studio', act: click('.public-nav__links a[href="/studio"]'), window: 3000, timeoutMs: SHOW_TIMEOUT,
      content: when(`location.pathname === '/studio' && ${HERO_DECODED}`),
      ready: when(`visible('.cot-studio') || visible('#cot-boot-gate.on')`) },
  ] },
  { id: 'game', group: 'game', steps: [
    { id: 'game-boot', act: direct('/'), window: 1500, timeoutMs: SHOW_TIMEOUT,
      content: when(HERO_DECODED), ready: when(`visible('#cot-boot-gate.on')`) },
    { id: 'gate-to-garage', act: passGate, window: 3000, timeoutMs: SHOW_TIMEOUT,
      content: when(GARAGE), ready: when(`${GARAGE} && !document.getElementById('cot-boot')`) },
    { id: 'garage-battle-setup', act: click('.cot-battle-mode'), window: 1500,
      content: when(`visible('#cot-battle-menu.open')`) },
    { id: 'battle-setup-close', act: click('#cot-battle-menu [data-battle-close]'), window: 1500,
      content: when(`!document.querySelector('#cot-battle-menu.open')`) },
    { id: 'garage-settings', act: click('.cot-settings-slot .cot-gear'), window: 1500,
      content: when(`visible('.cot-settings.open')`) },
    { id: 'settings-close', act: pressOrTap('Escape', '.cot-settings.open .cot-set-close'), window: 1500,
      content: when(`!document.querySelector('.cot-settings.open')`) },
    { id: 'garage-private-lobby', act: click('.cot-multiplayer-entry'), window: 1500,
      content: when(`visible('.cot-play.show')`) },
    { id: 'lobby-close', act: pressOrTap('Escape', '.cot-play.show .close'), window: 1500,
      content: when(`!document.querySelector('.cot-play.show')`) },
    { id: 'garage-to-battle', act: click('.cot-garage .cot-battle'), window: 3000, timeoutMs: SHOW_TIMEOUT,
      content: when(`visible('.cot-bl.on')`),
      ready: when(`visible('.cot-hud') && !document.querySelector('.cot-bl.on, .cot-bl.leaving')`) },
  ] },
  { id: 'battle-end', group: 'game', start: '/?debug=1',
    setup: async (page, ctx) => {
      await passGate(page, ctx);
      await waitFor(GARAGE)(page);
      await tapOrClick(page, ctx, '.cot-garage .cot-battle');
      await waitFor(`visible('.cot-hud') && !document.querySelector('.cot-bl.on, .cot-bl.leaving') && window.__DEBUG?.game?.phase === 'battle'`)(page);
      await waitFor(`!(window.__DEBUG.game.preBattleS > 0)`, 60000)(page);
    },
    steps: [
      { id: 'battle-to-end', act: (page) => page.evaluate(() => { window.__DEBUG.slayEnemies(); window.__DEBUG.fastForward(1); }),
        window: 2500, timeoutMs: 60000, content: when(`visible('.cot-es.show')`) },
      { id: 'end-to-garage', act: click('.cot-es.show .cot-es-btn.ghost'), window: 3000, timeoutMs: SHOW_TIMEOUT,
        content: when(GARAGE), ready: when(`${GARAGE} && window.__GARAGE_ENTRY?.presentationUnready === false`) },
    ] },
];

function parseBases() {
  const raw = options('base');
  if (!raw.length) return [{ label: 'run', url: 'http://cot.test:4180/' }];
  return raw.map((value, index) => {
    const at = value.indexOf('=');
    return at > 0 && !/^https?:/.test(value) ? { label: value.slice(0, at), url: value.slice(at + 1) } : { label: `b${index}`, url: value };
  });
}

/** The in-page probe: layout shifts with their sources and the step's content / ready predicates, every frame. */
const PROBE = `(() => {
  if (window.__navProbe) return;
  Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true });
  const probe = window.__navProbe = { shifts: [], contentAt: null, readyAt: null, inputAt: null, spec: window.__navSpec || null, lcp: null };
  const onInput = () => { if (probe.spec && probe.inputAt === null) { probe.inputAt = performance.timeOrigin + performance.now(); console.timeStamp('nav:input'); } };
  for (const type of ['pointerdown', 'touchstart', 'keydown']) addEventListener(type, onInput, { capture: true, passive: true });
  const describe = (node) => { if (!node || node.nodeType !== 1) return node ? node.nodeName : null;
    const cls = typeof node.className === 'string' ? node.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
    return node.tagName.toLowerCase() + (node.id ? '#' + node.id : '') + (cls ? '.' + cls : ''); };
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) probe.shifts.push({
      at: performance.timeOrigin + e.startTime, value: e.value, recent: e.hadRecentInput,
      sources: (e.sources || []).slice(0, 3).map((s) => ({ node: describe(s.node),
        from: [Math.round(s.previousRect.x), Math.round(s.previousRect.y), Math.round(s.previousRect.width), Math.round(s.previousRect.height)],
        to: [Math.round(s.currentRect.x), Math.round(s.currentRect.y), Math.round(s.currentRect.width), Math.round(s.currentRect.height)] })) }); })
      .observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => { const e = list.getEntries().at(-1); if (e) probe.lcp = performance.timeOrigin + e.startTime; })
      .observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => { for (const e of list.getEntries()) if (e.name === 'first-contentful-paint') probe.fcp = performance.timeOrigin + e.startTime; })
      .observe({ type: 'paint', buffered: true });
  } catch (_) {}
  const check = (source) => { try { return Boolean((0, eval)(source)); } catch (_) { return false; } };
  const tick = () => {
    const spec = probe.spec || window.__navSpec;
    if (spec) {
      const now = performance.timeOrigin + performance.now();
      if (probe.contentAt === null && check(spec.content)) { probe.contentAt = now; console.timeStamp('nav:content'); }
      if (probe.contentAt !== null && probe.readyAt === null && (!spec.ready || check(spec.ready))) probe.readyAt = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`;

async function cpuBenchmark(page) {
  return page.evaluate(() => {
    const end = performance.now() + 250;
    let n = 0;
    while (performance.now() < end) { let s = ''; for (let i = 0; i < 200; i += 1) s += String.fromCharCode(65 + (i % 26)); n += s.length; }
    return Math.round(n / 250);
  });
}

async function applyProfile(page, profile) {
  await page.setViewport(profile.viewport);
  if (profile.userAgent) await page.setUserAgent(profile.userAgent);
  await page.emulateNetworkConditions(profile.network);
  await page.emulateCPUThrottling(profile.cpu);
}

/** Decode trace screenshots in a helper page into tiny greyscale thumbnails for the frame diff. */
async function thumbnails(helper, frames) {
  const out = [];
  for (let i = 0; i < frames.length; i += 24) {
    out.push(...await helper.evaluate(async (list) => {
      const W = 96; const H = 64;
      const canvas = new OffscreenCanvas(W, H); const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const result = [];
      for (const b64 of list) {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob());
        ctx.drawImage(bitmap, 0, 0, W, H);
        const { data } = ctx.getImageData(0, 0, W, H);
        const grey = new Array(W * H);
        for (let p = 0; p < W * H; p += 1) grey[p] = (data[p * 4] * 3 + data[p * 4 + 1] * 6 + data[p * 4 + 2]) / 10;
        result.push(grey);
      }
      return result;
    }, frames.slice(i, i + 24).map((frame) => frame.jpeg)));
  }
  return out;
}

const changedFraction = (a, b) => {
  let n = 0;
  for (let i = 0; i < a.length; i += 1) if (Math.abs(a[i] - b[i]) > 40) n += 1;
  return n / a.length;
};

async function filmstrip(helper, picks, portrait, heading) {
  return helper.evaluate(async (items, tall, title) => {
    const cols = tall ? 8 : 4;
    const bitmaps = [];
    for (const item of items) bitmaps.push(await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${item.jpeg}`)).blob()));
    const w = tall ? 180 : 360;
    const h = Math.round(w * bitmaps[0].height / bitmaps[0].width);
    const rows = Math.ceil(items.length / cols);
    const canvas = new OffscreenCanvas(cols * (w + 8) + 8, rows * (h + 30) + 40);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#101214'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#e8ecef'; ctx.font = '600 15px Helvetica, Arial, sans-serif'; ctx.fillText(title, 10, 24);
    items.forEach((item, i) => {
      const x = 8 + (i % cols) * (w + 8); const y = 36 + Math.floor(i / cols) * (h + 30);
      ctx.drawImage(bitmaps[i], x, y, w, h);
      ctx.strokeStyle = item.mark ? '#e0b341' : '#2c3136'; ctx.lineWidth = item.mark ? 3 : 1; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = '#c9d1d7'; ctx.font = '13px Menlo, monospace';
      ctx.fillText(`+${item.offset} ms${item.mark ? `  ${item.mark}` : ''}`, x, y + h + 18);
    });
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let s = ''; for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }, picks, portrait, heading);
}

function traceEvents(buffer) {
  const parsed = JSON.parse(Buffer.from(buffer).toString('utf8'));
  return Array.isArray(parsed) ? parsed : parsed.traceEvents || [];
}

async function recordStep({ page, helper, step, ctx, profile, stem, outDir }) {
  const spec = { content: step.content, ready: step.ready || null };
  const specScript = await page.evaluateOnNewDocument((value) => { window.__navSpec = value; }, spec);
  if (step.act.target) {
    // A player scrolls to a control before pressing it: the scroll is not part of the navigation.
    await page.waitForSelector(step.act.target, { visible: true, timeout: 120000 }).catch(() => {});
    await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'center', behavior: 'instant' }), step.act.target).catch(() => {});
    await new Promise((r) => setTimeout(r, 500));
  }
  await page.evaluate((value) => {
    if (!window.__navProbe) return;
    Object.assign(window.__navProbe, { spec: value, contentAt: null, readyAt: null, inputAt: null });
  }, spec).catch(() => {});
  // The frame on screen before the input: the reference the first response is measured against.
  const before = await page.screenshot({ type: 'jpeg', quality: 40, optimizeForSpeed: true, encoding: 'base64' }).catch(() => null);
  await page.tracing.start({ screenshots: true, categories: ['devtools.timeline', 'disabled-by-default-devtools.screenshot'] });
  let clickAt = await page.evaluate(() => { console.timeStamp('nav:click'); return performance.timeOrigin + performance.now(); });
  const wallStart = Date.now();
  let error = null;
  await step.act(page, ctx).catch((cause) => { error = String(cause?.message || cause).split('\n')[0]; });
  const deadline = Date.now() + (step.timeoutMs || 90000);
  let seen = null;
  while (Date.now() < deadline) {
    seen = await page.evaluate(() => window.__navProbe && { content: window.__navProbe.contentAt, ready: window.__navProbe.readyAt }).catch(() => null);
    if (seen?.ready) break;
    await new Promise((r) => setTimeout(r, 120));
  }
  if (!seen?.ready && !error) error = seen?.content ? 'ready timeout' : 'content timeout';
  if (error) {
    // What the step was stuck on, for the report.
    const stuck = await page.screenshot({ type: 'jpeg', quality: 60 }).catch(() => null);
    if (stuck) writeFileSync(join(outDir, `${stem}.stuck.jpg`), stuck);
  }
  // Keep recording while layout shifts keep arriving: `window` ms of quiet, at most twice that.
  const windowMs = step.window || 3000;
  let lastCount = -1; let quietSince = Date.now(); const settleDeadline = Date.now() + windowMs * 2;
  while (Date.now() < settleDeadline) {
    const n = await page.evaluate(() => window.__navProbe?.shifts.length ?? 0).catch(() => 0);
    if (n !== lastCount) { lastCount = n; quietSince = Date.now(); }
    if (Date.now() - quietSince >= windowMs) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  const final = await page.evaluate(() => ({ shifts: window.__navProbe?.shifts || [], lcp: window.__navProbe?.lcp ?? null,
    fcp: window.__navProbe?.fcp ?? null, path: location.pathname + location.search })).catch(() => ({ shifts: [], lcp: null, fcp: null, path: null }));
  const trace = traceEvents(await page.tracing.stop());
  await page.removeScriptToEvaluateOnNewDocument(specScript.identifier).catch(() => {});

  const stamp = (message) => trace.find((e) => e.name === 'TimeStamp' && e.args?.data?.message === message)?.ts;
  // A press measures from its input event (the automation's own round trips are not the page's latency), an
  // address-bar navigation from the request.
  const requestTs = stamp('nav:click');
  const inputTs = stamp('nav:input');
  if (requestTs !== undefined && inputTs !== undefined && inputTs > requestTs) clickAt += (inputTs - requestTs) / 1000;
  const clickTs = inputTs ?? requestTs;
  let shots = clickTs === undefined ? [] : trace.filter((e) => e.name === 'Screenshot' && e.args?.snapshot)
    .map((e) => ({ t: Math.round((e.ts - clickTs) / 1000), jpeg: e.args.snapshot })).sort((a, b) => a.t - b.t);
  // Frames from before the input collapse into the reference frame the response is measured against.
  const lead = shots.filter((f) => f.t <= 0).at(-1);
  shots = [lead ? { ...lead, t: 0 } : before ? { t: 0, jpeg: before } : null, ...shots.filter((f) => f.t > 0)].filter(Boolean);
  shots = shots.filter((f, i, all) => i === 0 || f.t - all[i - 1].t >= 40 || i === all.length - 1);
  const thumbs = shots.length ? await thumbnails(helper, shots) : [];
  // `response`: the first frame that differs from the reference (a fade counts once it has gone far enough);
  // `abrupt`: frames that differ from the frame before them (a jump, a swap, a flash).
  const abrupt = [];
  let response = null;
  for (let i = 1; i < shots.length; i += 1) {
    if (response === null && changedFraction(thumbs[i], thumbs[0]) >= 0.04) response = shots[i].t;
    const delta = changedFraction(thumbs[i], thumbs[i - 1]);
    if (delta >= 0.04) abrupt.push({ t: shots[i].t, delta: Number(delta.toFixed(3)) });
  }
  const rel = (at) => (at ? Math.round(at - clickAt) : null);
  const content = rel(seen?.content);
  const ready = rel(seen?.ready);
  const after = final.shifts.filter((s) => s.at >= clickAt - 5);
  const cls = after.filter((s) => !s.recent).reduce((sum, s) => sum + s.value, 0);
  const shift = after.reduce((sum, s) => sum + s.value, 0);
  const lastShift = after.length ? Math.round(Math.max(...after.map((s) => s.at)) - clickAt) : 0;
  // Settled: ready and the last layout shift. Abrupt frame changes are listed, not folded in (a hero rail or a playing
  // loop changes frames on its own schedule).
  const settled = Math.max(ready ?? content ?? 0, lastShift) || null;
  const result = {
    step: step.id, path: final.path, error, response, content, ready, settled,
    fcp: final.fcp && final.fcp > clickAt ? Math.round(final.fcp - clickAt) : null,
    lcp: final.lcp && final.lcp > clickAt ? Math.round(final.lcp - clickAt) : null,
    cls: Number(cls.toFixed(4)), shift: Number(shift.toFixed(4)),
    shifts: after.map((s) => ({ t: Math.round(s.at - clickAt), value: Number(s.value.toFixed(4)), recent: s.recent, sources: s.sources })),
    abrupt, frames: shots.length, wallMs: Date.now() - wallStart,
  };
  const end = Math.max(1000, (settled ?? 3000) + 1000);
  const picks = [];
  for (const offset of STRIP_OFFSETS) {
    if (offset > end && picks.length >= 8) break;
    const frame = [...shots].reverse().find((f) => f.t <= offset) || shots[0];
    if (!frame) break;
    const marks = [];
    if (content !== null && offset >= content && !picks.some((p) => p.mark.includes('content'))) marks.push('content');
    if (ready !== null && ready !== content && offset >= ready && !picks.some((p) => p.mark.includes('ready'))) marks.push('ready');
    picks.push({ offset, jpeg: frame.jpeg, mark: marks.join(' ') });
  }
  if (picks.length) {
    const png = await filmstrip(helper, picks, profile.viewport.isMobile,
      `${stem}   response ${result.response ?? '-'} ms   content ${content ?? '-'} ms   ready ${ready ?? '-'} ms   settled ${settled ?? '-'} ms   CLS ${result.cls}   shift ${result.shift}`);
    writeFileSync(join(outDir, `${stem}.png`), Buffer.from(png, 'base64'));
  }
  writeFileSync(join(outDir, `${stem}.json`), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

async function runJourney({ page, helper, journey, profile, profileName, cacheName, base, outDir }) {
  const ctx = { base, touch: profile.viewport.hasTouch };
  const results = [];
  await page.goto('about:blank');
  if (journey.start) {
    await page.goto(new URL(journey.start, base).href, { waitUntil: 'domcontentloaded', timeout: 180000 });
    if (journey.startReady) await waitFor(journey.startReady)(page);
    if (journey.setup) await journey.setup(page, ctx);
    await new Promise((r) => setTimeout(r, 1200));
  }
  for (const step of journey.steps) {
    const stem = `${step.id}.${profileName}.${cacheName}`;
    const result = await recordStep({ page, helper, step, ctx, profile, stem, outDir })
      .catch((error) => ({ step: step.id, error: String(error?.message || error).split('\n')[0] }));
    results.push(result);
    console.log(`${outDir.split('/').at(-1).padEnd(6)} ${step.id.padEnd(22)} ${profileName.padEnd(7)} ${cacheName.padEnd(4)} `
      + `response ${String(result.response ?? '-').padStart(6)}  content ${String(result.content ?? '-').padStart(6)}  `
      + `ready ${String(result.ready ?? '-').padStart(6)}  settled ${String(result.settled ?? '-').padStart(6)}  `
      + `cls ${result.cls ?? '-'}  shift ${result.shift ?? '-'}${result.error ? `  ERROR ${result.error}` : ''}`);
    if (result.error && /timeout|waiting for selector/i.test(result.error)) break;
    await new Promise((r) => setTimeout(r, 600));
  }
  return results;
}

/**
 * `--report=<dir>`: one Markdown table per profile × cache from the run files under <dir>/<label>/, a column group per
 * label (base, after, …), in journey order. `blocked` is the response time (the old view held), `jumps` the number of
 * layout shifts and their summed score (input-excused ones included), `CLS` the web-vitals score.
 */
function report(dir) {
  const labels = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    .filter((name) => readdirSync(join(dir, name)).some((f) => f.endsWith('.json')));
  const order = option('labels', '').split(',').filter(Boolean);
  labels.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b));
  const read = (label, stem) => { try { return JSON.parse(readFileSync(join(dir, label, `${stem}.json`), 'utf8')); } catch { return null; } };
  const cell = (r, key) => (r?.[key] ?? null) === null ? '-' : String(r[key]);
  const lines = [];
  for (const profile of Object.keys(PROFILES)) {
    for (const cache of ['cold', 'warm']) {
      const rows = [];
      for (const journey of JOURNEYS) for (const step of journey.steps) {
        const stem = `${step.id}.${profile}.${cache}`;
        const results = labels.map((label) => read(label, stem));
        if (results.every((r) => !r)) continue;
        rows.push(`| ${step.id} | ${results.map((r) => r?.error && r.content === null ? `${r.error} | | | | |`
          : `${cell(r, 'response')} | ${cell(r, 'content')} | ${cell(r, 'settled')} | ${r ? `${r.shifts.length} / ${r.shift}` : '-'} | ${cell(r, 'cls')} |`).join(' ')}`);
      }
      if (!rows.length) continue;
      lines.push(`### ${profile}, ${cache} cache`, '');
      lines.push(`| step | ${labels.map((l) => `${l} blocked | ${l} content | ${l} settled | ${l} jumps | ${l} CLS |`).join(' ')}`);
      lines.push(`|---|${labels.map(() => '---:|---:|---:|---:|---:|').join('')}`);
      lines.push(...rows, '');
    }
  }
  console.log(lines.join('\n'));
}

async function main() {
  if (option('report', '')) { report(resolve(option('report', ''))); return; }
  if (flag('list')) {
    for (const journey of JOURNEYS) console.log(`${journey.id.padEnd(12)} ${journey.group.padEnd(7)} ${journey.steps.map((s) => s.id).join(' → ')}`);
    return;
  }
  const out = resolve(option('out', 'nav-timeline-out'));
  const bases = parseBases();
  const wanted = option('journeys', 'all').split(',');
  // A word names a journey when one has that id, else a group.
  const ids = new Set(JOURNEYS.map((j) => j.id));
  const journeys = wanted.includes('all') ? JOURNEYS
    : JOURNEYS.filter((j) => wanted.includes(j.id) || wanted.some((w) => !ids.has(w) && w === j.group));
  const profiles = option('profiles', 'desktop,phone').split(',');
  const caches = option('caches', 'cold,warm').split(',');
  const holdDeadline = Number(process.env.NAV_HOLD_DEADLINE || 0);
  const budgetMs = Math.min(Number(option('budget-min', '18')) * 60000, holdDeadline ? holdDeadline - Date.now() - 90000 : Infinity);
  let lock = null;
  if (flag('lock')) {
    lock = await import('./capture-lock.mjs');
    console.log('nav-timeline: waiting for a capture ticket');
    await lock.acquireCaptureLock(4 * 3600 * 1000);
    console.log(`nav-timeline: capture lock held ${new Date().toISOString()}`);
  }
  const heartbeat = lock ? setInterval(() => lock.refreshCaptureLock(), 30000) : null;
  const holdStarted = Date.now();
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 360000, timeout: 180000, defaultViewport: null,
    args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required', `--host-resolver-rules=MAP ${option('host-map', 'cot.test')} 127.0.0.1`,
      '--disable-blink-features=AutomationControlled', '--window-size=1440,1000',
      ...(flag('soft-gl') ? ['--disable-gpu', '--enable-unsafe-swiftshader'] : [])],
  });
  // A wall-clock alarm or the hold's own deadline ends the run: never leave the browser behind.
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGALRM', 'SIGHUP']) {
    process.on(signal, () => { browser.process()?.kill('SIGKILL'); process.exit(143); });
  }
  const runs = [];
  let stopped = false;
  let runIndex = 0;
  try {
    const helper = await browser.newPage();
    helper.setDefaultTimeout(180000);
    const bench = await cpuBenchmark(helper);
    console.log(`nav-timeline: cpu benchmark ${bench} (unthrottled)`);
    for (const journey of journeys) {
      for (const profileName of profiles) {
        const profile = PROFILES[profileName];
        // Alternate which build goes first: the first run of a browser compiles shaders and warms the GPU process,
        // and a fixed order would hand the second build that head start every time.
        const order = (runIndex += 1) % 2 ? bases : [...bases].reverse();
        for (const base of order) {
          if (Date.now() - holdStarted > budgetMs) { stopped = true; break; }
          const outDir = join(out, base.label);
          mkdirSync(outDir, { recursive: true });
          const context = await browser.createBrowserContext();
          try {
            const page = await context.newPage();
            page.setDefaultTimeout(180000);
            await page.evaluateOnNewDocument(PROBE);
            await applyProfile(page, profile);
            for (const cacheName of caches) {
              const results = await runJourney({ page, helper, journey, profile, profileName, cacheName, base: base.url, outDir })
                .catch((error) => [{ step: journey.id, error: String(error?.message || error).split('\n')[0] }]);
              for (const result of results) runs.push({ label: base.label, journey: journey.id, profile: profileName, cache: cacheName, ...result, shifts: undefined, abrupt: undefined });
              if (results.at(-1)?.error) console.log(`${base.label} ${journey.id} ${profileName} ${cacheName}: ${results.at(-1).error}`);
            }
          } finally {
            await context.close().catch(() => {});
          }
        }
        if (stopped) break;
      }
      if (stopped) break;
    }
    if (stopped) console.log('nav-timeline: budget reached, stopped starting journeys');
    writeFileSync(join(out, `summary.${bases.map((b) => b.label).join('-')}.${Date.now()}.json`), `${JSON.stringify({
      startedAt: new Date(holdStarted).toISOString(), holdMinutes: Number(((Date.now() - holdStarted) / 60000).toFixed(1)),
      cpuBenchmark: bench, stopped, profiles: Object.fromEntries(profiles.map((p) => [p, PROFILES[p]])), bases, runs }, null, 2)}\n`);
  } finally {
    await browser.close().catch(() => {});
    if (heartbeat) clearInterval(heartbeat);
    if (lock) lock.releaseCaptureLock();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
