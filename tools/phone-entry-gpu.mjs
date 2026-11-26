/**
 * Phone battle entry, GPU side (phone-ctxloss-277; Kevin 2026-11-25: "on mobile, multiplayer often just breaks, and the GPU
 * fails and restarts when I try to enter a battle"). A phone page (?tier=mobile, 390x844 at 3x, touch, an iPhone's agent)
 * enters battles one after another, solo or as a room's joiner, while an in-page tracker counts every byte the page asks the
 * GPU to hold: textures (each level and face, mip chains from texStorage and generateMipmap), buffers and renderbuffers,
 * less every delete. It is the allocation the browser's GPU process must find room for, which a phone's WebGL caps; a
 * page past the cap loses its context (the reset Kevin saw).
 *
 * Read per entry: the peak live bytes from the battle press to the reveal, the loader's stage at the peak, the programs
 * linked, the worlds resident (__DEBUG.worldCacheIds) at the press and at the peak, and every context loss.
 * --lose-over-mb=<n> models a phone's cap: the first time the live bytes pass it the tracker loses the context
 * (WEBGL_lose_context) and restores it a second later, so a run counts the resets a phone with that cap would see.
 *
 * Scenarios (--scenario):
 *   solo     each entry: the Garage plans --plan-maps[i] (the BATTLE control touched: garage.ts prefetches it, as a thumb on
 *            the button does), then a solo battle on --maps[i] (__DEBUG.beginSoloBattle), then back to the Garage.
 *            With --plan-maps equal to --maps the planned world is the battle's; different, a planned world is resident
 *            when another battlefield builds (the joiner's case: its Garage's plan, then the host's room).
 *   joiner   an in-process rooms service on --rooms-port (8792: the LAN helper a build with no VITE_ROOMS_URL dials), a desktop
 *            host page creating a LAN room on --maps[i], and the phone page joining it by code from its Garage after
 *            planning --plan-maps[i]; the host starts, and both leave to the Garage and the room after the reveal.
 *
 *   node tools/with-capture-lock.mjs --lock-class=render -- node tools/phone-entry-gpu.mjs --dist=dist --scenario=solo \
 *     --maps=verdant,winter,verdant --plan-maps=desert,desert,desert --out=.qa-dev/phone-entry-gpu/solo
 *
 * Out: <out>/report.json (every entry's numbers and the 250 ms timeline) and a still of each reveal.
 */
import { launchGuardedBrowser } from './browser-launch.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { preview } from 'vite';
import { readinessExpression } from './game-readiness.mjs';
import { isMainModule } from './map-probe-runtime.mjs';
import { farLodCensus } from './far-poses.mjs';

const root = new URL('..', import.meta.url).pathname;
function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((entry) => entry.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : fallback;
}
const scenario = argValue('scenario', 'solo');
const distDir = resolve(root, argValue('dist', 'dist'));
const outputDir = resolve(argValue('out', join(root, '.qa-dev', 'phone-entry-gpu', scenario)));
const previewPort = Number(argValue('port', 4262));
const roomsPort = Number(argValue('rooms-port', 8792));
const maps = argValue('maps', 'verdant,winter,verdant').split(',').filter(Boolean);
const planMaps = argValue('plan-maps', '').split(',').filter(Boolean);
const spec = argValue('spec', 'm1a2_abrams_sepv3');
const cpuRate = Number(argValue('cpu', 4));
const loseOverMb = Number(argValue('lose-over-mb', 0));
const settleS = Number(argValue('settle', 4));
const headful = process.argv.includes('--headful');
// --tier=desktop: the same entries on the desktop tier (a 1024x640 window), the comparison for the phone's numbers
const tier = argValue('tier', 'mobile');

const PHONE = {
  viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: false },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
};
// --query=<a=b&c=d> (far-hull-279): appended to the phone page's query, e.g. farHullDraw=0 for a far-hull control arm
const extraQuery = argValue('query', '');
const PHONE_QUERY = `nosplash=1&tier=${tier}&gfxreset=1${extraQuery ? `&${extraQuery}` : ''}`;
// --far-census (far-hull-279): after the settle, each entry records tools/far-poses.mjs farLodCensus on the phone page
// (the vehicles in the full far LOD, and how many have their one draw built), so a far-hull A/B can show it exercised the change
const farCensus = process.argv.includes('--far-census');
const HOST_QUERY = 'nosplash=1&tier=desktop&gfxreset=1';
const BROWSER_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows', '--use-gl=angle', '--enable-webgl', '--window-size=1100,900'];

const log = (line) => process.stderr.write(`[phone-entry-gpu] ${line}\n`);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const MB = (bytes) => +(bytes / 1048576).toFixed(1);
const report = { tier, scenario, maps, planMaps, spec, cpuRate, loseOverMb, entries: [], errors: [], failures: [] };

/**
 * In-page (self-contained): the GPU allocation tracker. Every WebGL context's texture, buffer and renderbuffer storage,
 * by the bytes its format holds (a phone driver pads RGB to RGBA), live and peak, with the programs linked and the losses.
 */
export function installGpuTracker(loseOverBytes) {
  if (window.__GPU_TRACK) return;
  const T = window.__GPU_TRACK = {
    live: 0, tex: 0, rt: 0, buf: 0, rb: 0, peak: 0, links: 0, losses: 0, restores: 0, generation: 0,
    loseOverBytes, modeledLosses: 0, windowPeak: 0, windowPeakAt: 0, windowPeakStage: '', windowPeakWorlds: null,
    stage: '', timeline: [], lostAt: [],
    // the bytes newly allocated since the last animation frame, and the largest such frame in the window
    frameBytes: 0, frameMax: 0, frameMaxAt: 0, frameMaxStage: '', frameItems: [], frameMaxItems: [], lastShape: '',
  };
  const records = new WeakMap(); // texture | buffer | renderbuffer -> { kind, parts: Map<key, bytes>, total, generation, shape }
  const liveRecords = new Set(); // the same records, for the census of the largest at the peak
  // the largest live allocations and the bytes by kind: what the peak is made of
  T.census = (count = 24) => {
    const rows = [...liveRecords].sort((a, b) => b.total - a.total);
    const byKind = {};
    for (const row of rows) byKind[row.kind] = (byKind[row.kind] ?? 0) + row.total;
    const byShape = {};
    for (const row of rows) {
      if (row.kind === 'buf') continue;
      const key = `${row.kind} ${row.shape}`;
      const entry = byShape[key] ??= { count: 0, mb: 0 };
      entry.count += 1; entry.mb += row.total / 1048576;
    }
    return {
      byKindMb: Object.fromEntries(Object.entries(byKind).map(([kind, bytes]) => [kind, +(bytes / 1048576).toFixed(1)])),
      largest: rows.slice(0, count).map((row) => ({ kind: row.kind, shape: row.shape, mb: +(row.total / 1048576).toFixed(2) })),
      shapes: Object.entries(byShape).sort((a, b) => b[1].mb - a[1].mb).slice(0, count)
        .map(([shape, entry]) => ({ shape, count: entry.count, mb: +entry.mb.toFixed(1) })),
      buffers: rows.filter((row) => row.kind === 'buf').length,
    };
  };
  const states = new WeakMap(); // context -> bindings
  const SIZED = {
    0x8229: 1, 0x822B: 2, 0x8051: 4, 0x8058: 4, 0x8C41: 4, 0x8C43: 4, 0x822D: 2, 0x822F: 4, 0x881B: 8, 0x881A: 8,
    0x822E: 4, 0x8230: 8, 0x8815: 16, 0x8814: 16, 0x8C3A: 4, 0x8C3D: 4, 0x8059: 4, 0x81A5: 2, 0x81A6: 4, 0x8CAC: 4,
    0x88F0: 4, 0x8CAD: 8, 0x8232: 1, 0x8231: 1, 0x8234: 2, 0x8233: 2, 0x8236: 4, 0x8235: 4, 0x8D7C: 4, 0x8D8E: 4,
    0x8238: 2, 0x8237: 2, 0x823A: 4, 0x8239: 4, 0x823C: 8, 0x823B: 8, 0x8D70: 16, 0x8D82: 16, 0x8D76: 8, 0x8D88: 8,
    0x8D62: 2, 0x8056: 2, 0x8057: 2, 0x8F94: 1, 0x8F95: 2, 0x8F96: 4, 0x8F97: 4,
  };
  const CHANNELS = { 0x1908: 4, 0x1907: 4, 0x1909: 1, 0x1906: 1, 0x190A: 2, 0x1902: 1, 0x84F9: 1, 0x1903: 1, 0x8227: 2 };
  const TYPE_BYTES = { 0x1401: 1, 0x1400: 1, 0x1403: 2, 0x1402: 2, 0x1405: 4, 0x1404: 4, 0x1406: 4, 0x140B: 2, 0x8D61: 2, 0x84FA: 4,
    0x8033: 2, 0x8034: 2, 0x8363: 2, 0x8C3B: 4, 0x8C3E: 4, 0x8368: 4 };
  const bpp = (internalformat, format, type) => {
    if (SIZED[internalformat]) return SIZED[internalformat];
    if (internalformat === 0x1902) return type === 0x1403 ? 2 : 4; // DEPTH_COMPONENT
    if (internalformat === 0x84F9) return 4; // DEPTH_STENCIL
    const channels = CHANNELS[internalformat] ?? CHANNELS[format] ?? 4;
    const packed = type === 0x8033 || type === 0x8034 || type === 0x8363 || type === 0x8C3B || type === 0x8C3E || type === 0x8368 || type === 0x84FA;
    return packed ? TYPE_BYTES[type] : channels * (TYPE_BYTES[type] ?? 1);
  };
  const state = (gl) => {
    let s = states.get(gl);
    if (!s) {
      s = { unit: 0, tex: new Map(), buf: new Map(), rb: null, vao: null, vaoElements: new WeakMap() };
      states.set(gl, s);
    }
    return s;
  };
  const CUBE_FACE = (target) => target >= 0x8515 && target <= 0x851A;
  const bindTarget = (target) => (CUBE_FACE(target) ? 0x8513 : target);
  const boundTexture = (gl, target) => state(gl).tex.get(`${state(gl).unit}:${bindTarget(target)}`) ?? null;
  const apply = (object, kind, key, bytes, shape = '') => {
    if (!object) return;
    let record = records.get(object);
    if (!record || record.generation !== T.generation) {
      record = { kind, parts: new Map(), total: 0, generation: T.generation, shape };
      records.set(object, record);
      liveRecords.add(record);
    }
    if (shape && (key === '*' || key.endsWith(':0') || key === '0')) record.shape = shape;
    const old = record.total;
    T.lastShape = record.shape || shape;
    // '*' (immutable storage) replaces every part
    if (key === '*') record.parts.clear();
    record.parts.set(key, bytes);
    let total = 0;
    for (const part of record.parts.values()) total += part;
    record.total = total;
    adjust(record.kind, total - old);
  };
  const release = (object) => {
    const record = object && records.get(object);
    if (!record || record.generation !== T.generation) return;
    adjust(record.kind, -record.total);
    records.delete(object);
    liveRecords.delete(record);
  };
  const adjust = (kind, delta) => {
    if (!delta) return;
    if (delta > 0) {
      T.frameBytes += delta;
      // what the frame allocated, by the allocation (1 MB and up): the largest frame's list says what it was made of
      if (delta >= 1048576 && T.frameItems.length < 64) T.frameItems.push({ kind, shape: T.lastShape, mb: +(delta / 1048576).toFixed(2) });
    }
    T[kind] += delta;
    T.live += delta;
    if (T.live > T.peak) T.peak = T.live;
    if (T.live > T.windowPeak) {
      T.windowPeak = T.live;
      T.windowPeakAt = Math.round(performance.now());
      T.windowPeakStage = T.stage;
      try { T.windowPeakWorlds = window.__DEBUG?.worldCacheIds ?? null; } catch { /* surface not ready */ }
      if (T.recording && T.live - (T.windowPeakCensusAt ?? 0) > 4 * 1048576) {
        T.windowPeakCensusAt = T.live;
        T.windowPeakCensus = T.census();
      }
    }
    if (T.loseOverBytes > 0 && T.live > T.loseOverBytes && T.armed !== false && T.gl) {
      T.armed = false;
      const ext = T.gl.getExtension('WEBGL_lose_context');
      if (ext) {
        T.modeledLosses += 1;
        setTimeout(() => ext.loseContext(), 0);
        setTimeout(() => ext.restoreContext(), 1000);
      }
    }
  };
  const levelBytes = (w, h, d, per) => Math.max(1, w) * Math.max(1, h) * Math.max(1, d) * per;
  const sourceSize = (source) => {
    if (!source) return [0, 0];
    const w = source.videoWidth || source.naturalWidth || source.displayWidth || source.width || 0;
    const h = source.videoHeight || source.naturalHeight || source.displayHeight || source.height || 0;
    return [w, h];
  };
  const wrap = (proto, name, after) => {
    const original = proto[name];
    if (typeof original !== 'function') return;
    proto[name] = function wrapped(...args) {
      const result = original.apply(this, args);
      try { after(this, args, result); } catch { /* the tracker never breaks a call */ }
      return result;
    };
  };
  for (const proto of [window.WebGL2RenderingContext?.prototype, window.WebGLRenderingContext?.prototype].filter(Boolean)) {
    wrap(proto, 'activeTexture', (gl, [unit]) => { state(gl).unit = unit - 0x84C0; });
    wrap(proto, 'bindTexture', (gl, [target, texture]) => { T.gl ??= gl; state(gl).tex.set(`${state(gl).unit}:${target}`, texture); });
    wrap(proto, 'deleteTexture', (gl, [texture]) => release(texture));
    wrap(proto, 'texImage2D', (gl, args) => {
      const [target, level, internalformat] = args;
      let w, h, format, type;
      if (args.length >= 8) { [, , , w, h, , format, type] = args; }
      else { [, , , format, type] = args; [w, h] = sourceSize(args[5]); }
      const face = CUBE_FACE(target) ? target - 0x8515 : 0;
      apply(boundTexture(gl, target), 'tex', `${face}:${level}`, levelBytes(w, h, 1, bpp(internalformat, format, type)),
        `${CUBE_FACE(target) ? 'cube ' : ''}${w}x${h} 0x${internalformat.toString(16)}`);
    });
    wrap(proto, 'copyTexImage2D', (gl, [target, level, internalformat, , , w, h]) => {
      const face = CUBE_FACE(target) ? target - 0x8515 : 0;
      apply(boundTexture(gl, target), 'tex', `${face}:${level}`, levelBytes(w, h, 1, bpp(internalformat, 0x1908, 0x1401)));
    });
    wrap(proto, 'texImage3D', (gl, [target, level, internalformat, w, h, d, , format, type]) => {
      apply(boundTexture(gl, target), 'tex', `0:${level}`, levelBytes(w, h, d, bpp(internalformat, format, type)), `${w}x${h}x${d} 0x${internalformat.toString(16)}`);
    });
    wrap(proto, 'compressedTexImage2D', (gl, args) => {
      const [target, level, , w, h, , data] = args;
      const face = CUBE_FACE(target) ? target - 0x8515 : 0;
      const bytes = typeof data === 'number' ? data : (data?.byteLength ?? Math.ceil(w / 4) * Math.ceil(h / 4) * 16);
      apply(boundTexture(gl, target), 'tex', `${face}:${level}`, bytes);
    });
    wrap(proto, 'compressedTexImage3D', (gl, args) => {
      const [target, level, , w, h, d, , data] = args;
      const bytes = typeof data === 'number' ? data : (data?.byteLength ?? Math.ceil(w / 4) * Math.ceil(h / 4) * d * 16);
      apply(boundTexture(gl, target), 'tex', `0:${level}`, bytes);
    });
    wrap(proto, 'texStorage2D', (gl, [target, levels, internalformat, w, h]) => {
      const per = bpp(internalformat, 0, 0);
      let total = 0;
      for (let level = 0; level < levels; level++) total += levelBytes(w >> level, h >> level, 1, per);
      apply(boundTexture(gl, target), 'tex', '*', total * (target === 0x8513 ? 6 : 1), `${target === 0x8513 ? 'cube ' : ''}${w}x${h} L${levels} 0x${internalformat.toString(16)}`);
    });
    wrap(proto, 'texStorage3D', (gl, [target, levels, internalformat, w, h, d]) => {
      const per = bpp(internalformat, 0, 0);
      let total = 0;
      for (let level = 0; level < levels; level++) total += levelBytes(w >> level, h >> level, target === 0x806F ? d >> level : d, per);
      apply(boundTexture(gl, target), 'tex', '*', total, `${w}x${h}x${d} L${levels} 0x${internalformat.toString(16)}`);
    });
    wrap(proto, 'generateMipmap', (gl, [target]) => {
      const texture = boundTexture(gl, target);
      const record = texture && records.get(texture);
      if (!record || record.generation !== T.generation) return;
      const faces = target === 0x8513 ? 6 : 1;
      for (let face = 0; face < faces; face++) {
        const base = record.parts.get(`${face}:0`);
        if (base) apply(texture, 'tex', `${face}:mips`, Math.round(base / 3));
      }
    });
    wrap(proto, 'bindBuffer', (gl, [target, buffer]) => {
      const s = state(gl);
      s.buf.set(target, buffer);
      if (target === 0x8893 && s.vao) s.vaoElements.set(s.vao, buffer);
    });
    wrap(proto, 'bindBufferBase', (gl, [target, , buffer]) => { state(gl).buf.set(target, buffer); });
    wrap(proto, 'bindBufferRange', (gl, [target, , buffer]) => { state(gl).buf.set(target, buffer); });
    wrap(proto, 'bindVertexArray', (gl, [vao]) => {
      const s = state(gl);
      s.vao = vao;
      s.buf.set(0x8893, vao ? (s.vaoElements.get(vao) ?? null) : null);
    });
    wrap(proto, 'bufferData', (gl, args) => {
      const [target, sizeOrData] = args;
      let bytes = 0;
      if (typeof sizeOrData === 'number') bytes = sizeOrData;
      else if (sizeOrData) {
        const element = sizeOrData.BYTES_PER_ELEMENT || 1;
        if (args.length >= 5 && args[4]) bytes = args[4] * element;
        else bytes = sizeOrData.byteLength - (args[3] ?? 0) * element;
      }
      apply(state(gl).buf.get(target) ?? null, 'buf', '0', bytes);
    });
    wrap(proto, 'deleteBuffer', (gl, [buffer]) => release(buffer));
    wrap(proto, 'bindRenderbuffer', (gl, [, renderbuffer]) => { state(gl).rb = renderbuffer; });
    wrap(proto, 'renderbufferStorage', (gl, [, internalformat, w, h]) => {
      apply(state(gl).rb, 'rb', '0', levelBytes(w, h, 1, bpp(internalformat, 0, 0)), `${w}x${h} 0x${internalformat.toString(16)}`);
    });
    wrap(proto, 'renderbufferStorageMultisample', (gl, [, samples, internalformat, w, h]) => {
      apply(state(gl).rb, 'rb', '0', levelBytes(w, h, 1, bpp(internalformat, 0, 0)) * Math.max(1, samples), `${w}x${h} x${samples} 0x${internalformat.toString(16)}`);
    });
    wrap(proto, 'deleteRenderbuffer', (gl, [renderbuffer]) => release(renderbuffer));
    const toRenderTarget = (texture) => {
      const record = texture && records.get(texture);
      if (!record || record.generation !== T.generation || record.kind !== 'tex') return;
      T.tex -= record.total; T.rt += record.total; record.kind = 'rt';
    };
    wrap(proto, 'framebufferTexture2D', (gl, [, , , texture]) => toRenderTarget(texture));
    wrap(proto, 'framebufferTextureLayer', (gl, [, , texture]) => toRenderTarget(texture));
    wrap(proto, 'linkProgram', () => { T.links += 1; });
  }
  // a lost context holds nothing: every record of the old generation is gone with it
  window.addEventListener('webglcontextlost', () => {
    T.losses += 1;
    T.lostAt.push({ atMs: Math.round(performance.now()), stage: T.stage, live: T.live });
    T.generation += 1;
    T.live = 0; T.tex = 0; T.rt = 0; T.buf = 0; T.rb = 0; liveRecords.clear();
  }, true);
  window.addEventListener('webglcontextrestored', () => { T.restores += 1; }, true);
  if (typeof window.requestAnimationFrame === 'function') {
    const frame = () => {
      if (T.recording && T.frameBytes > T.frameMax) {
        T.frameMax = T.frameBytes; T.frameMaxAt = Math.round(performance.now()); T.frameMaxStage = T.stage;
        T.frameMaxItems = T.frameItems;
      }
      T.frameBytes = 0;
      T.frameItems = [];
      window.requestAnimationFrame(frame);
    };
    window.requestAnimationFrame(frame);
  }
  setInterval(() => {
    const loader = document.querySelector('.cot-bl');
    const on = !!loader && loader.classList.contains('on');
    const pct = loader?.querySelector('.fpct')?.textContent?.trim() ?? '';
    const stage = loader?.querySelector('.fstage .st')?.textContent?.trim() ?? '';
    T.stage = on ? `${pct} ${stage}`.trim() : (window.__DEBUG?.game?.phase ?? '');
    if (T.recording && T.timeline.length < 20000) {
      let worlds = null;
      try { worlds = window.__DEBUG?.worldCacheIds?.length ?? null; } catch { /* surface not ready */ }
      T.timeline.push({ atMs: Math.round(performance.now()), live: T.live, tex: T.tex, rt: T.rt, buf: T.buf, rb: T.rb, links: T.links, stage: T.stage, worlds });
    }
  }, 250);
}

async function waitFor(page, predicate, label, timeoutMs, args = []) {
  try {
    await page.waitForFunction(predicate, { timeout: timeoutMs, polling: 250 }, ...args);
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      phase: window.__DEBUG?.game?.phase ?? null, lifecycle: window.__APP_LIFECYCLE?.state ?? null,
      stage: window.__GPU_TRACK?.stage ?? null, worlds: window.__DEBUG?.worldCacheIds ?? null,
      status: document.querySelector('.cot-play .status')?.textContent ?? '',
    })).catch(() => null);
    throw new Error(`${label}: ${error.message}; ${JSON.stringify(diagnostics)}`);
  }
}

async function phonePage(browser) {
  const page = await (await browser.createBrowserContext()).newPage();
  if (tier === 'mobile') await page.emulate(PHONE);
  else await page.setViewport({ width: 1024, height: 640, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(installGpuTracker, loseOverMb > 0 ? loseOverMb * 1048576 : 0);
  page.on('pageerror', (error) => report.errors.push({ kind: 'pageerror', text: String(error.message).slice(0, 400) }));
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.push({ kind: 'console', text: message.text().slice(0, 400) });
  });
  if (cpuRate > 1) await (await page.createCDPSession()).send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  return page;
}

async function boot(page, url, label) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 240_000 });
  await waitFor(page, readinessExpression('garage'), `${label} garage`, 300_000);
  await waitFor(page, () => !!window.__DEBUG?.scene && Array.isArray(window.__DEBUG?.worldCacheIds), `${label} debug surface`, 60_000);
}

/** The Garage plans a battlefield the way a thumb on BATTLE does (touchstart: garage.ts signalBattleIntent). */
async function plan(page, mapId) {
  await page.evaluate((id) => { window.__DEBUG?.garage?.setSelectedMap?.(id); }, mapId);
  await sleep(400);
  await page.evaluate(() => {
    const launch = document.querySelector('.cot-battle');
    launch?.dispatchEvent(new Event('touchstart', { bubbles: true }));
  });
  await waitFor(page, (id) => (window.__DEBUG?.worldCacheIds ?? []).some((key) => key === id || key.startsWith(`${id}#`)),
    `planned ${mapId} resident`, 240_000, [mapId]);
}

/**
 * In-page: the scene's vertex and index bytes by owner (each geometry counted once, where it is first met): the top-level
 * roots, a world root by its children, an instanced mesh's instance matrices and colours with its geometry. CPU-side
 * arrays, so the bytes a draw uploads; what is not drawn is not on the GPU (the tracker says what is).
 */
function geometryByOwner() {
  const scene = window.__DEBUG?.scene;
  if (!scene) return null;
  const seen = new Set();
  const bytesOf = (object) => {
    let bytes = 0;
    const geometry = object.geometry;
    if (geometry && !seen.has(geometry)) {
      seen.add(geometry);
      for (const attribute of Object.values(geometry.attributes ?? {})) {
        const array = attribute.array ?? attribute.data?.array;
        if (array && !seen.has(array)) { seen.add(array); bytes += array.byteLength; }
      }
      if (geometry.index?.array && !seen.has(geometry.index.array)) { seen.add(geometry.index.array); bytes += geometry.index.array.byteLength; }
    }
    for (const key of ['instanceMatrix', 'instanceColor']) {
      const array = object[key]?.array;
      if (array && !seen.has(array)) { seen.add(array); bytes += array.byteLength; }
    }
    return bytes;
  };
  const rows = [];
  const owner = (root, label) => {
    let bytes = 0, meshes = 0;
    root.traverse((object) => { const b = bytesOf(object); if (b) { bytes += b; meshes += 1; } });
    rows.push({ owner: label, visible: root.visible, meshes, mb: +(bytes / 1048576).toFixed(1) });
  };
  for (const child of scene.children) {
    if (child.name?.startsWith('world-')) {
      for (const part of child.children) owner(part, `${child.name}/${part.name || part.type}`);
    } else owner(child, child.name || child.type);
  }
  return rows.filter((row) => row.mb >= 0.5).sort((a, b) => b.mb - a.mb).slice(0, 40);
}

/**
 * In-page: every render target reachable from the debug surface's post, lighting, renderer and scene (a bounded object
 * walk), by the property path that holds it, with its size, type, samples and texture name: the owners of the targets the
 * tracker counts by shape.
 */
function renderTargetOwners() {
  const debug = window.__DEBUG;
  if (!debug) return null;
  const roots = { post: debug.post, lighting: debug.lighting, renderer: debug.renderer, scene: debug.scene, fx: debug.fx };
  const seen = new Set();
  const found = new Map();
  const walk = (value, path, depth) => {
    if (!value || typeof value !== 'object' || seen.has(value) || depth > 7) return;
    seen.add(value);
    if (value.isWebGLRenderTarget) {
      const texture = value.texture ?? value.textures?.[0];
      if (!found.has(value)) found.set(value, { path, w: value.width, h: value.height, type: texture?.type, format: texture?.format,
        internal: texture?.internalFormat ?? null, samples: value.samples ?? 0, depth: !!value.depthBuffer, depthTexture: !!value.depthTexture,
        name: texture?.name ?? '', count: value.textures?.length ?? 1 });
      return;
    }
    if (value.isObject3D && depth > 1 && path.startsWith('scene')) return;
    if (ArrayBuffer.isView(value) || value instanceof Element || value.isMaterial || value.isBufferGeometry) return;
    const keys = value instanceof Map ? [...value.keys()] : Object.keys(value);
    for (const key of keys.slice(0, 400)) {
      let child;
      try { child = value instanceof Map ? value.get(key) : value[key]; } catch { continue; }
      walk(child, `${path}.${String(key)}`, depth + 1);
    }
  };
  for (const [name, root] of Object.entries(roots)) walk(root, name, 0);
  return [...found.values()].sort((a, b) => b.w * b.h - a.w * a.h);
}

const resident = (page) => page.evaluate(() => ({
  worlds: window.__DEBUG?.worldCacheIds ?? null,
  garageGpu: (() => { try { return JSON.parse(JSON.stringify(window.__DEBUG?.garageGpuResidency ?? null)); } catch { return null; } })(),
  info: (() => { const m = window.__DEBUG?.renderer?.info?.memory; return m ? { geometries: m.geometries, textures: m.textures, programs: window.__DEBUG.renderer.info.programs?.length ?? null } : null; })(),
  canvas: (() => { const c = window.__DEBUG?.renderer?.domElement; return c ? [c.width, c.height] : null; })(),
}));

const beginWindow = (page) => page.evaluate(() => {
  const T = window.__GPU_TRACK;
  T.windowPeak = T.live; T.windowPeakAt = Math.round(performance.now()); T.windowPeakStage = T.stage;
  T.windowPeakWorlds = window.__DEBUG?.worldCacheIds ?? null;
  T.windowStartLinks = T.links; T.windowStartLosses = T.losses; T.windowStartModeled = T.modeledLosses;
  T.windowStartAt = Math.round(performance.now()); T.armed = true;
  T.windowPeakCensusAt = 0; T.windowPeakCensus = T.census();
  T.frameBytes = 0; T.frameMax = 0; T.frameMaxAt = 0; T.frameMaxStage = ''; T.frameItems = []; T.frameMaxItems = [];
  T.recording = true; T.timeline.length = 0;
  return { live: T.live, links: T.links };
});

const endWindow = (page) => page.evaluate(() => {
  const T = window.__GPU_TRACK;
  T.recording = false;
  return {
    peak: T.windowPeak, peakAtS: +((T.windowPeakAt - T.windowStartAt) / 1000).toFixed(1), peakStage: T.windowPeakStage,
    frameMax: T.frameMax, frameMaxItems: T.frameMaxItems, frameMaxAtS: +((T.frameMaxAt - T.windowStartAt) / 1000).toFixed(1), frameMaxStage: T.frameMaxStage,
    peakWorlds: T.windowPeakWorlds, peakCensus: T.windowPeakCensus, revealedCensus: T.census(), live: T.live, links: T.links - T.windowStartLinks,
    losses: T.losses - T.windowStartLosses, modeledLosses: T.modeledLosses - T.windowStartModeled, lostAt: T.lostAt.slice(-4),
    timeline: T.timeline.map((row) => ({ s: +((row.atMs - T.windowStartAt) / 1000).toFixed(2), mb: +(row.live / 1048576).toFixed(1),
      tex: +(row.tex / 1048576).toFixed(1), rt: +(row.rt / 1048576).toFixed(1), buf: +(row.buf / 1048576).toFixed(1), rb: +(row.rb / 1048576).toFixed(1), links: row.links, stage: row.stage, worlds: row.worlds })),
  };
});

function summarize(entry) {
  log(`entry ${entry.index} ${entry.map} (planned ${entry.planned ?? '-'}): peak ${MB(entry.window.peak)} MB at ${entry.window.peakAtS} s `
    + `"${entry.window.peakStage}" worlds ${JSON.stringify(entry.window.peakWorlds)}; at press ${MB(entry.atPress.live)} MB `
    + `worlds ${JSON.stringify(entry.atPressResident.worlds)}; revealed ${MB(entry.window.live)} MB; links ${entry.window.links}; `
    + `largest frame ${MB(entry.window.frameMax)} MB at ${entry.window.frameMaxAtS} s "${entry.window.frameMaxStage}"; `
    + `losses ${entry.window.losses} (modeled ${entry.window.modeledLosses}); reveal ${entry.revealS} s; at peak ${JSON.stringify(entry.window.peakCensus?.byKindMb)}`);
}

/** The run (a command only: the receipt imports the tracker, which starts nothing). */
async function main() {
  let server = null;
  let rooms = null;
  const browsers = [];
  const stopAll = async () => {
    for (const browser of browsers) await browser.close().catch(() => {});
    browsers.length = 0;
    if (server) await new Promise((done) => server.httpServer.close(() => done())).catch(() => {});
    server = null;
    if (rooms) await rooms.close().catch(() => {});
    rooms = null;
  };
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void stopAll().finally(() => process.exit(130)); });

  try {
    await mkdir(outputDir, { recursive: true });
    server = await preview({ root, logLevel: 'error', build: { outDir: distDir }, preview: { host: '127.0.0.1', port: previewPort, strictPort: true, open: false } });
    const origin = `http://127.0.0.1:${previewPort}`;
    const launch = async (label) => {
      const browser = await launchGuardedBrowser(puppeteer, { headless: !headful, protocolTimeout: 600_000, args: BROWSER_ARGS }, { label });
      browsers.push(browser);
      return browser;
    };
    const phone = await phonePage(await launch('phone-entry-gpu:phone'));
    await boot(phone, `${origin}/?${PHONE_QUERY}`, 'phone');
    report.boot = { ...(await resident(phone)), live: await phone.evaluate(() => window.__GPU_TRACK.live), peak: await phone.evaluate(() => window.__GPU_TRACK.peak),
      census: await phone.evaluate(() => window.__GPU_TRACK.census()) };
    log(`phone booted: ${MB(report.boot.live)} MB live (boot peak ${MB(report.boot.peak)} MB), canvas ${JSON.stringify(report.boot.canvas)}, `
      + `limits ${JSON.stringify(await phone.evaluate(() => window.__DEBUG?.residentLimits ?? null))}`);

    let host = null;
    if (scenario === 'joiner') {
      const { createRoomsServer } = await import('../server/rooms/serve.ts');
      const { openRooms, pressControl } = await import('./mp-rooms-entry.mjs');
      rooms = await createRoomsServer({ host: '127.0.0.1', port: roomsPort, seatSecret: randomBytes(24).toString('hex'), matchTransport: 'p2p' });
      host = await (await (await launch('phone-entry-gpu:host')).createBrowserContext()).newPage();
      await host.setViewport({ width: 1024, height: 640, deviceScaleFactor: 1 });
      await boot(host, `${origin}/?${HOST_QUERY}`, 'host');
      report.joinerTools = { openRooms, pressControl };
    }

    for (let index = 0; index < maps.length; index++) {
      const map = maps[index];
      const planned = planMaps[index] ?? planMaps.at(-1) ?? null;
      const entry = { index: index + 1, map, planned };
      if (planned) await plan(phone, planned);
      await sleep(1500);
      entry.atPressResident = await resident(phone);
      entry.atPress = await beginWindow(phone);
      const pressedAt = performance.now();
      if (scenario === 'solo') {
        await phone.evaluate((specId, mapId) => {
          window.__SOLO = { done: false, error: null };
          Promise.resolve(window.__DEBUG.beginSoloBattle({ specId, mapId, randomRoster: false }))
            .then(() => { window.__SOLO.done = true; }, (error) => { window.__SOLO.done = true; window.__SOLO.error = String(error?.message ?? error).slice(0, 300); });
        }, spec, map);
        await waitFor(phone, readinessExpression('battleRevealed'), `solo ${map} revealed`, 400_000);
      } else {
        const { openRooms, pressControl } = report.joinerTools;
        await host.evaluate((id) => { window.__DEBUG?.garage?.setSelectedMap?.(id); }, map);
        await sleep(300);
        await openRooms(host, {});
        await waitFor(host, () => document.querySelector('.cot-play')?.classList.contains('show'), 'host play menu', 30_000);
        await pressControl(host, '.cot-play .modes [data-value="lan"]');
        await host.evaluate(() => {
          const size = document.querySelector('.cot-play [data-field="create-size"]');
          if (size) size.value = '2';
        });
        await pressControl(host, '.cot-play [data-action="create"]');
        await waitFor(host, () => /[?&]room=[A-Z0-9]{6}/.test(location.search), 'host room', 30_000);
        const code = new URL(await host.evaluate(() => location.href)).searchParams.get('room');
        for (let waited = 0; rooms.roomService.rooms.get(code)?.snapshot?.settings?.mapId !== map && waited < 15_000; waited += 250) await sleep(250);
        await openRooms(phone, { touch: true });
        await waitFor(phone, () => document.querySelector('.cot-play')?.classList.contains('show'), 'phone play menu', 30_000);
        // (the LAN tab's box is 38 px on a phone, its tap area 44 with the track's 3 px inset: pressControl's touch check reads
      // the box, so it is pressed, not tapped)
        await pressControl(phone, '.cot-play .modes [data-value="lan"]');
        await phone.evaluate((roomCode) => {
          const field = document.querySelector('.cot-play [data-field="code"]');
          field.value = roomCode;
          field.dispatchEvent(new Event('input', { bubbles: true }));
        }, code);
        await pressControl(phone, '.cot-play [data-action="join"]', { touch: true });
        await waitFor(phone, () => (document.querySelector('.cot-play .lobby.show .players')?.children.length ?? 0) >= 2, 'phone joined', 60_000);
        await sleep(1500);
        entry.lobbyResident = await resident(phone);
        for (const page of [phone, host]) {
          await waitFor(page, () => document.querySelector('.cot-play [data-action="ready"]')?.disabled === false, 'ready', 60_000);
          if (await page.evaluate(() => document.querySelector('.cot-play [data-action="ready"]')?.classList.contains('needs-ready') === true)) {
            await pressControl(page, '.cot-play [data-action="ready"]', { touch: page === phone });
          }
        }
        await waitFor(host, () => !document.querySelector('.cot-play [data-action="start"]')?.disabled, 'host start', 30_000);
        await pressControl(host, '.cot-play [data-action="start"]');
        await waitFor(phone, `${readinessExpression('battleRevealed')} && window.__MULTIPLAYER_V2?.stats?.().inMatch === true`, `joiner ${map} revealed`, 400_000);
      }
      entry.revealS = +((performance.now() - pressedAt) / 1000).toFixed(1);
      await sleep(settleS * 1000);
      entry.window = await endWindow(phone);
      entry.revealed = await resident(phone);
      if (farCensus) {
        const census = await phone.evaluate(farLodCensus).catch((error) => ({ error: String(error).slice(0, 200) }));
        entry.farCensus = census.error ? census : { vehicles: census.vehicles, far: census.far, gear: census.gear, built: census.built, refused: census.refused, missing: census.missing.length };
        log(`far census: ${JSON.stringify(entry.farCensus)}`);
      }
      entry.geometry = await phone.evaluate(geometryByOwner).catch(() => null);
    entry.renderTargets = await phone.evaluate(renderTargetOwners).catch((error) => String(error));
      if (entry.geometry) log(`geometry by owner: ${entry.geometry.slice(0, 12).map((row) => `${row.owner} ${row.mb}`).join(' | ')}`);
      await phone.screenshot({ path: join(outputDir, `entry-${index + 1}-${map}.png`) }).catch(() => {});
      summarize(entry);
      report.entries.push(entry);
      // back to the Garage (and out of the room) for the next entry
      await phone.evaluate(() => window.__DEBUG.leaveBattleToGarage?.());
      if (host) await host.evaluate(() => window.__DEBUG.leaveBattleToGarage?.()).catch(() => {});
      await waitFor(phone, readinessExpression('garage'), 'phone back in the Garage', 300_000);
      if (host) {
        await waitFor(host, readinessExpression('garage'), 'host back in the Garage', 300_000);
        for (const page of [phone, host]) {
          await page.evaluate(() => document.querySelector('.cot-play [data-action="leave"]')?.click()).catch(() => {});
        }
        await sleep(1000);
      }
    }
    delete report.joinerTools;
    report.totals = {
      peakMb: Math.max(...report.entries.map((entry) => MB(entry.window.peak))),
      losses: report.entries.reduce((sum, entry) => sum + entry.window.losses, 0),
      modeledLosses: report.entries.reduce((sum, entry) => sum + entry.window.modeledLosses, 0),
      secondWorldAtPeak: report.entries.filter((entry) => (entry.window.peakWorlds?.length ?? 0) > 1).length,
    largestFrameMb: Math.max(...report.entries.map((entry) => MB(entry.window.frameMax))),
    };
    log(`totals ${JSON.stringify(report.totals)}; ${report.errors.length} page errors`);
  } catch (error) {
    report.failures.push(String(error.stack || error.message).slice(0, 1200));
    log(`FAIL ${error.message}`);
  } finally {
    delete report.joinerTools;
    await writeFile(join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`).catch(() => {});
    await stopAll();
  }
  process.exit(report.failures.length ? 1 : 0);
}

if (isMainModule(import.meta.url)) await main();
