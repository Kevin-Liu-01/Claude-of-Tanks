#!/usr/bin/env node
/**
 * battle-entry-sweep.mjs — load into a battle on every battlefield the way a player does, and say which loads show
 * black, are refused, or stick (2026-10-09, the black-screen lane; the owner: "for black screens, check loading into
 * games and black screens showing up, and fix that. one that flagged it for me is cinder junction").
 *
 *   node tools/battle-entry-sweep.mjs <url> [options]          a deployment (production, a preview, a dev server)
 *   node tools/battle-entry-sweep.mjs --dist=<dir> [options]   a built dist, served from this process
 *
 * Why this exists. The covered solo entry runs its battle scene watchdog only outside automation
 * (main.ts scheduleBlackWatchdog: `if (!navigator.webdriver)`), so every headless smoke that leaves webdriver true
 * skips the probe that refuses a player's entry ("Battlefield scene watchdog could not validate a healthy frame"),
 * and a deploy smoke on one map (Verdant) never saw a map-specific refusal. Every run here reports
 * navigator.webdriver false, pins the solo time of day, and enters through __DEBUG.beginSoloBattle — the player's
 * covered path: loader, deployment warm, the scene watchdog, reveal.
 *
 * Per run it records the entry outcome, the battle watchdog row (window.__GL_DIAG.sceneWatchdogs: band, scale,
 * verdict, timings), the light model, the rescue bag, the load and warm traces, console errors, and screenshots after
 * the reveal judged for a black or flat frame.
 *
 * Verdicts (one per run):
 *   entered   the battle revealed, the watchdog passed without changing the picture, every sample has a picture
 *   refused   the entry failed and returned to the Garage (its reason is recorded)
 *   stuck     neither a reveal nor a failure within --entry-timeout-s
 *   black     a revealed sample is black or flat
 *   rescued   the watchdog applied a compatibility stage (shadows/environment/fog off): the picture changed
 * With --force-black, one more run enters that map with ?diagforce=blackout (a lit pipeline black under any light and
 * any rescue stage): the negative control, which must be refused ("control-refused"; "control-missed" fails the sweep),
 * so a sweep can never pass because the watchdog stopped looking.
 * Exit 0 only when every run entered (and the control was refused). A run also carries notes (a band within
 * --band-warn of the threshold, slow entries, console errors) that do not fail it.
 *
 * Options:
 *   --maps=all|<id,id>        battlefields (default all 33, src/world/maps/mapIds.ts)
 *   --times=day,sunset,night  solo times of day (default all three)
 *   --tier=desktop|mobile     adds ?tier=mobile for the phone tier (default desktop: no tier parameter)
 *   --tank=m1a2               the player's vehicle
 *   --viewport=1600x900       page size (CSS px), deviceScaleFactor 1
 *   --fresh=none|page|context|browser
 *                             none: one page for the whole sweep (a player switching maps in one session);
 *                             page (default): a new page per run in one profile (warm HTTP and shader caches);
 *                             context: a new incognito context per run (cold HTTP cache);
 *                             browser: a new browser with an empty profile per run (cold everything)
 *   --headful                 a visible window (real compositor); default headless
 *   --chrome=<path>|system    the browser binary (default puppeteer's own; system = /Applications/Google Chrome.app)
 *   --preset=<name>           localStorage cot.gfxPreset before boot (default: the game's auto choice)
 *   --entry-timeout-s=240     per entry
 *   --samples=0.5,2,5         seconds after the entry resolves to sample the picture
 *   --min-luma=10 --min-sd=2  a sample darker or flatter than this (centre region, 0-255 luma) is black
 *   --band-warn=9             note a watchdog band under this (the refusal threshold is 6)
 *   --force-black[=<map>]     add the negative-control run (default map railyard, the first --times entry)
 *   --out=<dir>               report.json, report.md and the JPEG samples (default ./battle-entry-sweep-<stamp>)
 *   --port=0                  --dist only: the local port (0 picks a free one)
 * A protected *.vercel.app deployment needs the project's automation bypass secret in COT_PROTECTION_BYPASS (read
 * from the environment only, never printed): the first document request asks for the bypass cookie, then request
 * interception is switched off so every request (dedicated workers included) rides the cookie.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { loadavg, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const WATCHDOG_THRESHOLD = 6;
const SYSTEM_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/**
 * One run's verdict from its observations (pure; tools/battle-entry-sweep.selftest.mjs).
 * @param {object} run  { entry: 'revealed'|'failed'|'timeout', reason?, watchdog?: {status, result?}, samples: [{mean, sd}] }
 * @param {{minLuma:number, minSd:number, bandWarn:number}} limits
 * @returns {{verdict: string, why: string, notes: string[]}}
 */
export function classifyRun(run, limits) {
  const notes = [];
  const w = run.watchdog ?? null;
  const result = w?.result ?? null;
  if (result && typeof result.before === 'number' && result.before < limits.bandWarn) {
    notes.push(`watchdog band ${result.before.toFixed(1)}${result.nightRadianceScale != null ? ` at scale ${(+result.nightRadianceScale).toFixed(3)}` : ''}`
      + ` is within ${(limits.bandWarn - WATCHDOG_THRESHOLD).toFixed(0)} of the refusal threshold ${WATCHDOG_THRESHOLD}`);
  }
  if (run.entry === 'failed') return { verdict: 'refused', why: run.reason || 'the entry failed', notes };
  if (run.entry !== 'revealed') return { verdict: 'stuck', why: run.reason || 'no reveal and no failure', notes };
  if (w && (w.status === 'failed' || result?.failed === true)) {
    return { verdict: 'refused', why: `the watchdog refused (band ${result?.before ?? '?'}) but the entry revealed`, notes };
  }
  if (result?.rescued) {
    return { verdict: 'rescued', why: `the watchdog applied ${result.stage} (band ${(+result.before).toFixed(1)} -> ${result.after == null ? '?' : (+result.after).toFixed(1)})`, notes };
  }
  const dark = (run.samples ?? []).find((s) => !(s.mean >= limits.minLuma) || !(s.sd >= limits.minSd));
  if (dark) return { verdict: 'black', why: `the sample at ${dark.at} s is black or flat (centre luma ${dark.mean}, sd ${dark.sd})`, notes };
  if (!(run.samples ?? []).length) notes.push('no picture sample');
  if (!w) notes.push('no battle watchdog row (the covered probe did not run)');
  if (run.entryPromise) notes.push(`entry promise ${run.entryPromise}`);
  return { verdict: 'entered', why: '', notes };
}

/** The negative control's verdict: the forced-black entry must come back refused by the scene watchdog. */
export function classifyControl(run) {
  const refusedByWatchdog = run.entry === 'failed' && /scene watchdog could not validate a healthy frame/i.test(run.reason ?? '');
  return refusedByWatchdog
    ? { verdict: 'control-refused', why: 'the forced-black entry was refused', notes: [] }
    : { verdict: 'control-missed', why: `the forced-black entry was not refused by the watchdog (${run.entry}${run.reason ? `: ${run.reason}` : ''})`, notes: [] };
}

/** Luma statistics of a decoded RGBA image over its centre (the HUD lives at the edges). */
export function lumaStats(data, width, height) {
  const x0 = Math.floor(width * 0.2), x1 = Math.ceil(width * 0.8), y0 = Math.floor(height * 0.2), y1 = Math.ceil(height * 0.75);
  let sum = 0, sq = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      sum += l; sq += l * l; n++;
    }
  }
  const mean = n ? sum / n : 0;
  return { mean: +mean.toFixed(1), sd: +Math.sqrt(Math.max(0, (n ? sq / n : 0) - mean * mean)).toFixed(1) };
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream',
  '.ktx2': 'image/ktx2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.m4a': 'audio/mp4',
  '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json',
};

/** A static server for a built dist (the vercel.json page rewrites for '/', home, docs and gallery). */
function serveDist(root, port) {
  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://local');
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/' || rel === '/studio') rel = '/index.html';
      else if (/^\/(home|docs|gallery)$/.test(rel)) rel = `${rel}.html`;
      const file = path.join(root, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
      if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        'Cross-Origin-Opener-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff' });
      createReadStream(file).pipe(res);
    } catch (error) { res.writeHead(500); res.end(String(error)); }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : fallback; };
  const flag = (name) => args.includes(`--${name}`);
  const { MAP_IDS } = await import(pathToFileURL(path.join(HERE, '../src/world/maps/mapIds.ts')).href);
  const mapsArg = opt('maps', 'all');
  const maps = mapsArg === 'all' ? [...MAP_IDS] : mapsArg.split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = maps.filter((m) => !MAP_IDS.includes(m));
  if (unknown.length) { console.error(`unknown map id(s): ${unknown.join(', ')}`); process.exit(2); }
  const times = opt('times', 'day,sunset,night').split(',').map((s) => s.trim()).filter(Boolean);
  if (times.some((t) => !['day', 'sunset', 'night'].includes(t))) { console.error('--times takes day, sunset, night'); process.exit(2); }
  const tier = opt('tier', 'desktop');
  if (!['desktop', 'mobile'].includes(tier)) { console.error('--tier takes desktop or mobile'); process.exit(2); }
  const tank = opt('tank', 'm1a2');
  const [vw, vh] = opt('viewport', '1600x900').split('x').map(Number);
  const fresh = opt('fresh', 'page');
  if (!['none', 'page', 'context', 'browser'].includes(fresh)) { console.error('--fresh takes none, page, context, browser'); process.exit(2); }
  const preset = opt('preset', '');
  const entryTimeoutMs = Number(opt('entry-timeout-s', '240')) * 1000;
  const sampleAt = opt('samples', '0.5,2,5').split(',').map(Number).filter((n) => Number.isFinite(n) && n >= 0);
  const limits = { minLuma: Number(opt('min-luma', '10')), minSd: Number(opt('min-sd', '2')), bandWarn: Number(opt('band-warn', '9')) };
  const chromeArg = opt('chrome', '');
  const executablePath = chromeArg === 'system' ? SYSTEM_CHROME : chromeArg || undefined;
  const out = path.resolve(opt('out', `battle-entry-sweep-${new Date().toISOString().replace(/[:.]/g, '-')}`));
  mkdirSync(out, { recursive: true });
  const BYPASS = process.env.COT_PROTECTION_BYPASS || '';
  const forceArg = args.find((a) => a === '--force-black' || a.startsWith('--force-black='));
  const controlMap = forceArg ? (forceArg.includes('=') ? forceArg.slice(forceArg.indexOf('=') + 1) : 'railyard') : null;
  if (controlMap && !MAP_IDS.includes(controlMap)) { console.error(`unknown --force-black map ${controlMap}`); process.exit(2); }

  let server = null;
  let base = args.find((a) => !a.startsWith('--'));
  const dist = opt('dist', '');
  if (dist) {
    const root = path.resolve(dist);
    if (!existsSync(path.join(root, 'index.html'))) { console.error(`--dist ${root} has no index.html`); process.exit(2); }
    server = await serveDist(root, Number(opt('port', '0')));
    base = `http://127.0.0.1:${server.address().port}/`;
  }
  if (!base) { console.error('usage: node tools/battle-entry-sweep.mjs <url> | --dist=<dir> [options]'); process.exit(2); }
  const origin = new URL(base).origin;

  const puppeteer = (await import('puppeteer')).default;
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const started = Date.now();
  const log = (m) => console.log(`[sweep ${String(Math.round((Date.now() - started) / 1000)).padStart(5)}s] ${m}`);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const launch = () => puppeteer.launch({
    headless: flag('headful') ? false : 'new', protocolTimeout: 600000, ...(executablePath ? { executablePath } : {}),
    ...(fresh === 'browser' ? { userDataDir: mkdtempSync(path.join(tmpdir(), 'cot-sweep-profile-')) } : {}),
    args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required', `--window-size=${vw},${vh + 120}`],
    defaultViewport: null,
  });

  const report = { tool: 'battle-entry-sweep', url: origin, dist: dist || null, startedAt: new Date().toISOString(),
    options: { maps, times, tier, tank, viewport: `${vw}x${vh}`, fresh, preset: preset || null, headful: flag('headful'), forceBlack: controlMap,
      chrome: executablePath ? (chromeArg === 'system' ? 'system' : 'custom') : 'puppeteer', limits, sampleAt },
    version: null, runs: [] };

  let browser = null, context = null, page = null, bootedTime = null, bootedControl = false;
  const consoleErrors = [];
  const pageErrors = [];

  async function newPage() {
    if (!browser || fresh === 'browser') {
      if (browser) { try { await browser.close(); } catch { /* closed */ } }
      browser = await launch();
    }
    if (fresh === 'context' || !context) {
      if (context && fresh === 'context') { try { await context.close(); } catch { /* closed */ } }
      context = fresh === 'context' ? await browser.createBrowserContext() : browser.defaultBrowserContext();
    }
    const p = await context.newPage();
    await p.setViewport({ width: vw, height: vh, deviceScaleFactor: 1 });
    p.setDefaultTimeout(entryTimeoutMs);
    await p.evaluateOnNewDocument((presetName) => {
      // The covered solo entry skips its scene watchdog under automation: report what a player's browser reports.
      Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true });
      try {
        localStorage.setItem('cot.telemetry', 'off');
        if (presetName) localStorage.setItem('cot.gfxPreset', presetName);
      } catch { /* storage blocked: defaults */ }
      const errors = (window.__SWEEP_ERRORS = []);
      const original = console.error.bind(console);
      console.error = (...parts) => {
        try {
          if (errors.length < 40) errors.push(parts.map((x) => (x && (x.stack || x.message)) || String(x)).join(' ').slice(0, 800));
        } catch { /* never alter the page */ }
        original(...parts);
      };
    }, preset);
    p.on('pageerror', (e) => { pageErrors.push(String(e?.stack ?? e).slice(0, 600)); });
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon/i.test(m.text())) consoleErrors.push(m.text().slice(0, 400)); });
    if (BYPASS) {
      await p.setRequestInterception(true);
      let intercepting = true;
      p.on('request', (req) => {
        if (!intercepting) return;
        let same = false; try { same = new URL(req.url()).origin === origin; } catch { /* data: */ }
        const headers = same ? { ...req.headers(), 'x-vercel-protection-bypass': BYPASS,
          ...(req.resourceType() === 'document' ? { 'x-vercel-set-bypass-cookie': 'true' } : {}) } : undefined;
        Promise.resolve().then(() => req.continue(headers ? { headers } : undefined)).catch(() => {});
      });
      p.once('load', () => { intercepting = false; p.setRequestInterception(false).catch(() => {}); });
    }
    return p;
  }

  async function boot(time, control = false) {
    const url = new URL('/', origin);
    url.searchParams.set('debug', '1');
    url.searchParams.set('nosplash', '1');
    url.searchParams.set('telemetry', 'off');
    if (tier === 'mobile') url.searchParams.set('tier', 'mobile');
    if (control) url.searchParams.set('diagforce', 'blackout');
    await page.evaluateOnNewDocument((t) => { try { localStorage.setItem('cot.battle.times.v2', JSON.stringify([t])); } catch { /* none */ } }, time);
    const t0 = Date.now();
    const res = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 180000 });
    if (!res || res.status() >= 400) throw new Error(`document status ${res?.status()}`);
    await page.waitForFunction('window.__GAME_READY === true && !!window.__DEBUG && window.__DEBUG.game?.phase === "garage"', { timeout: 180000, polling: 250 });
    report.version ??= await page.evaluate(() => document.querySelector('meta[name="application-version"]')?.content ?? null);
    bootedTime = time;
    bootedControl = control;
    return Date.now() - t0;
  }

  async function sample(label) {
    const file = path.join(out, `${label}.jpg`);
    const buf = await page.screenshot({ type: 'jpeg', quality: 72, path: file });
    const img = await loadImage(buf);
    const c = createCanvas(160, 90), ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, 160, 90);
    return { ...lumaStats(ctx.getImageData(0, 0, 160, 90).data, 160, 90), file: path.relative(out, file) };
  }

  const snapshot = () => page.evaluate(() => {
    const D = window.__DEBUG, g = D?.game, lm = D?.scene?.userData?.lightModel;
    const rows = window.__GL_DIAG?.sceneWatchdogs?.rows ?? [];
    const row = rows.filter((r) => r.context?.phase === 'battle').at(-1) ?? null;
    const warm = window.__BATTLE_COUNTDOWN_WARM ?? null;
    const load = window.__BATTLE_LOAD ?? null;
    let sun = null;
    try {
      D.scene.traverse((o) => {
        if (!o.isDirectionalLight || (sun && sun.intensity >= o.intensity)) return;
        const p = o.getWorldPosition(o.position.clone()), q = o.target?.getWorldPosition?.(o.position.clone()) ?? p.clone().set(0, 0, 0);
        const d = p.sub(q).normalize();
        sun = { intensity: +o.intensity.toFixed(3), elevationDeg: +(Math.asin(Math.max(-1, Math.min(1, d.y))) * 180 / Math.PI).toFixed(1) };
      });
    } catch { /* none */ }
    return {
      phase: g?.phase ?? null, mapId: g?.mapId ?? null, tanks: g?.tanks?.length ?? 0,
      light: lm ? { mode: lm.mode, night: +(+lm.night).toFixed(3), exposure: +(+lm.exposure).toFixed(3), illuminance: +(+lm.illuminance).toFixed(3),
        overcast: +(+lm.overcast).toFixed(3), deckClosure: +(+lm.deckClosure).toFixed(3) } : null,
      sun,
      clouds: !!D?.scene?.userData?.volumetricClouds,
      shadows: D?.renderer?.shadowMap?.enabled ?? null, environment: !!D?.scene?.environment, fog: !!D?.scene?.fog,
      contextLost: (() => { try { return D.isGraphicsContextLost(); } catch { return null; } })(),
      watchdog: row ? { id: row.id, status: row.status, error: row.error ?? null, mapId: row.context?.mapId ?? null,
        entryGeneration: row.context?.entryGeneration ?? null, result: row.result ?? null,
        measurements: (row.measurements ?? []).map((m) => ({ kind: m.kind, renderMs: m.renderMs, readbackMs: m.readbackMs,
          programsBeforeRender: m.programsBeforeRender, programsAfterRender: m.programsAfterRender, error: m.error ?? null })) } : null,
      rescue: window.__GL_DIAG?.rescue ?? null,
      diagNotes: (window.__GL_DIAG?.errors ?? []).slice(0, 8),
      load: load ? { status: load.status ?? null, totalMs: load.totalMs ?? null, stages: load.stages ?? null } : null,
      warm: warm ? { done: warm.done, error: warm.error ?? null, totalMs: warm.totalMs ?? null, stages: warm.stages ?? null } : null,
      reveal: window.__BATTLE_REVEAL ?? null,
      errors: (window.__SWEEP_ERRORS ?? []).slice(-6),
      sweep: window.__SWEEP ?? null,
    };
  });

  const runs = [];
  for (const time of times) for (const map of maps) runs.push({ time, map });
  if (controlMap) runs.push({ time: times[0], map: controlMap, control: true });
  let index = 0;
  try {
    for (const { time, map, control = false } of runs) {
      index++;
      const label = `${String(index).padStart(3, '0')}-${map}-${time}-${tier}${control ? '-forced-black' : ''}`;
      const row = { map, time, tier, label, ...(control ? { control: true } : {}), startedAt: new Date().toISOString(), load1: +loadavg()[0].toFixed(1) };
      consoleErrors.length = 0; pageErrors.length = 0;
      try {
        if (!page || fresh !== 'none' || control !== bootedControl) {
          if (page) { try { await page.close(); } catch { /* closed */ } }
          page = await newPage();
          row.bootMs = await boot(time, control);
        } else if (bootedTime !== time) {
          await page.evaluate((t) => { localStorage.setItem('cot.battle.times.v2', JSON.stringify([t])); }, time);
          bootedTime = time;
        }
        const t0 = Date.now();
        await page.evaluate((specId, mapId) => {
          const D = window.__DEBUG;
          window.__BATTLE_REVEAL = undefined;
          window.__SWEEP = { done: false, error: null, startedAt: performance.now() };
          (window.__SWEEP_ERRORS ?? []).length = 0;
          Promise.resolve(D.game.phase !== 'garage' ? D.enterGarage() : null)
            .then(() => D.beginSoloBattle({ specId, mapId, randomRoster: false }))
            .then(() => { window.__SWEEP.done = true; window.__SWEEP.endedAt = performance.now(); },
              (error) => { window.__SWEEP.done = true; window.__SWEEP.error = String(error?.stack ?? error).slice(0, 800); });
        }, tank, map);
        let entry = 'timeout';
        // The entry is over when its promise settles, or when the battle has revealed, the loader is gone and the sim
        // clock runs (a loaded machine can leave the promise unsettled for minutes after a playable reveal; seen at
        // load 300-400 on 2026-10-10, both before and after the watchdog fix).
        const entryState = () => page.evaluate(() => {
          const D = window.__DEBUG, loader = document.querySelector('.cot-bl');
          return { done: window.__SWEEP?.done === true, error: window.__SWEEP?.error ?? null, phase: D?.game?.phase ?? null,
            reveal: !!window.__BATTLE_REVEAL, loaderOn: !!loader?.classList.contains('on'), timeS: D?.game?.timeS ?? null,
            failed: (window.__SWEEP_ERRORS ?? []).find((e) => /\[battle\] entry failed/.test(e)) ?? null };
        });
        let state = null, playingSince = null, firstTimeS = null;
        const deadline = Date.now() + entryTimeoutMs;
        while (Date.now() < deadline) {
          try { state = await entryState(); } catch { state = null; }
          if (state?.failed || state?.error) break;
          if (state?.done) break;
          const playing = state && state.phase === 'battle' && state.reveal && !state.loaderOn && typeof state.timeS === 'number';
          if (playing) {
            playingSince ??= Date.now(); firstTimeS ??= state.timeS;
            if (Date.now() - playingSince >= 3000 && state.timeS > firstTimeS) { row.entryPromise = 'unsettled (revealed and playing)'; break; }
          } else { playingSince = null; firstTimeS = null; }
          await sleep(500);
        }
        if (state?.failed || state?.error) {
          entry = 'failed';
          row.reason = (state.failed ?? state.error).replace(/^\[battle\] entry failed\s*/, '').split('\n')[0].slice(0, 300);
        } else if (state && state.phase === 'battle' && state.reveal && (state.done || row.entryPromise)) {
          entry = 'revealed';
        } else if (state?.done) {
          entry = 'failed'; row.reason = `the entry resolved in phase ${state.phase} without a reveal`;
        } else {
          row.reason = `no reveal and no failure in ${entryTimeoutMs / 1000} s (last state ${JSON.stringify(state)})`;
        }
        row.entry = entry;
        row.entryMs = Date.now() - t0;
        row.samples = [];
        if (entry === 'revealed') {
          let waited = 0;
          for (const at of sampleAt) {
            await sleep(Math.max(0, at * 1000 - waited)); waited = at * 1000;
            row.samples.push({ at, ...(await sample(`${label}-t${at}`)) });
          }
        } else {
          row.samples = [];
          try { row.failureShot = (await sample(`${label}-outcome`)).file; } catch { /* page gone */ }
        }
        Object.assign(row, await snapshot());
        delete row.sweep;
      } catch (error) {
        row.entry = row.entry ?? 'timeout';
        row.reason = row.reason ?? `harness: ${String(error?.message ?? error).slice(0, 300)}`;
      }
      row.consoleErrors = consoleErrors.slice(0, 8);
      row.pageErrors = pageErrors.slice(0, 4);
      Object.assign(row, control ? classifyControl(row) : classifyRun(row, limits));
      runs[index - 1] = row;
      report.runs.push(row);
      const w = row.watchdog?.result;
      log(`${row.verdict.toUpperCase().padEnd(8)} ${map.padEnd(12)} ${time.padEnd(6)} ${tier}  entry ${(row.entryMs / 1000 || 0).toFixed(1)} s`
        + `  band ${w?.before != null ? (+w.before).toFixed(1) : '-'}${w?.nightRadianceScale != null ? ` @${(+w.nightRadianceScale).toFixed(3)}` : ''}`
        + `  luma ${row.samples?.map((s) => s.mean).join('/') || '-'}  load ${row.load1}${row.why ? `  — ${row.why}` : ''}${row.notes?.length ? `  [${row.notes.join('; ')}]` : ''}`);
      writeFileSync(path.join(out, 'report.json'), `${JSON.stringify(report, null, 1)}\n`);
      if (row.entry === 'revealed' && fresh === 'none') {
        try {
          await page.evaluate(() => window.__DEBUG.leaveBattleToGarage());
          await page.waitForFunction('window.__DEBUG.game.phase === "garage"', { timeout: 120000, polling: 250 });
        } catch { try { await page.close(); } catch { /* closed */ } page = null; }
      }
    }
  } finally {
    report.finishedAt = new Date().toISOString();
    const counts = {};
    for (const r of report.runs) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
    report.counts = counts;
    report.ok = report.runs.length === runs.length
      && report.runs.every((r) => (r.control ? r.verdict === 'control-refused' : r.verdict === 'entered'));
    writeFileSync(path.join(out, 'report.json'), `${JSON.stringify(report, null, 1)}\n`);
    const lines = [`# Battle entry sweep — ${origin}${report.version ? ` (${report.version})` : ''}`, '',
      `${report.runs.length} run(s): ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}; tier ${tier}; fresh ${fresh}; ${report.startedAt} → ${report.finishedAt}`, '',
      '| map | time | verdict | band (scale) | entry s | luma | why / notes |', '|---|---|---|---|---|---|---|'];
    for (const r of report.runs) {
      const w = r.watchdog?.result;
      lines.push(`| ${r.map} | ${r.time} | ${r.verdict} | ${w?.before != null ? (+w.before).toFixed(1) : '-'}${w?.nightRadianceScale != null ? ` (${(+w.nightRadianceScale).toFixed(3)})` : ''} | ${((r.entryMs ?? 0) / 1000).toFixed(1)} | ${r.samples?.map((s) => s.mean).join(' / ') || '-'} | ${[r.why, ...(r.notes ?? [])].filter(Boolean).join('; ')} |`);
    }
    writeFileSync(path.join(out, 'report.md'), `${lines.join('\n')}\n`);
    try { await browser?.close(); } catch { /* closed */ }
    server?.close();
    console.log(`sweep ${report.ok ? 'PASS' : 'FAIL'}: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')} -> ${path.join(out, 'report.md')}`);
    process.exitCode = report.ok ? 0 : 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error); process.exit(2); });
}
