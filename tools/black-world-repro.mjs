#!/usr/bin/env node
/**
 * black-world-repro.mjs — drive the real game from the Garage into a solo battle the way a player does and measure, every
 * `--interval` ms for `--seconds` after the loading cover lifts, whether the WORLD (sky, terrain, buildings, tanks) is
 * black while the HUD draws (2026-10-18, black-screen-228; the owner: "black screens are still coming up for me the first
 * time i load into maps ... redrock divide ... it can also happen when i esc out and come back in").
 *
 *   node --max-old-space-size=4096 tools/black-world-repro.mjs --target=prod|dev|<url> [options]
 *
 * A frame is BLACK-WORLD when more than --black-frac (0.6; the owner's own frame reads 0.846) of the world region's pixels (the HUD masked: the frame's
 * centre box x 16-84 %, y 14-80 %, minus the reticle) are near-black (luma <= --black-luma, 6 of 255) while the battle
 * HUD (.cot-hud) is visible. On the first BLACK-WORLD frame of a run (debug mode) the page's renderer diagnostics are
 * captured in-page: renderer.info, the composer's pass list and targets, every pass's output read back on one live frame
 * (NaN / Inf / zero / luma per pass), the cloud layer's state and render targets, non-finite uniforms, context-loss
 * events and offscreen probe renders of the scene with the cloud dome / environment / fog removed.
 *
 * Every run reports navigator.webdriver false (the covered entry's scene watchdog runs as on a player's machine), enters
 * through the real Garage controls (the map card, the BATTLE button) with the mode stored as a player's choice, and
 * holds the shared capture lock (tools/capture-lock.mjs) per part (a fresh ticket, holds under --hold-min minutes).
 *
 * Options:
 *   --target=prod|dev|<url>  prod: https://cot.kevinliu.studio; dev: a Vite dev server of this tree (started here)
 *   --maps=badlands[,id]     battlefields (src/world/maps/mapIds.ts ids)
 *   --mode=drone             the stored game mode (cot.game.mode.v1); 'standard' for the regular battle
 *   --tank=<spec id>         the Garage's remembered tank (cot.lastTank.v1), e.g. t72b3m_bulat_m (the owner's)
 *   --times=any|day,sunset,night  pinned solo times (cot.battle.times.v2); any = the game's default (all three)
 *   --runs=10                runs per map
 *   --scenario=cold|warm|esc|regarage
 *                            cold: a new browser with an empty profile per run (cold HTTP, shader and storage caches)
 *                            warm: one browser profile, a new page per run (warm HTTP + shader caches)
 *                            esc: one cold boot, then per run: Esc (pause menu), dwell, Resume, sample
 *                            regarage: one cold boot, then per run: Esc, LEAVE BATTLE, back in the Garage, BATTLE again
 *                            session: --plan=enter:badlands,esc,blur,escblur,leave:badlands,leave:desert (one page, in order)
 *   --preset=ultra|high|medium|low  the stored graphics preset (cot.gfxPreset; default the game's auto choice, 'high')
 *   --seconds=25 --interval=250
 *   --drive                  hold W, steer every 3 s and sweep the cursor during the window (a player's input)
 *   --control                positive control: the first window hides the scene pass (camera = late-FX layer) 10-13 s
 *   --stress=1..3            a second headless browser in the same hold: a heavy full-screen shader + busy workers
 *   --plain                  production without ?debug (no __DEBUG; screenshots and generic WebGL hooks only)
 *   --chrome=system          the installed Google Chrome (155 here; puppeteer's own is 152) with a temporary profile
 *   --headful                a visible window (default headless 'new' on the real GPU through ANGLE Metal)
 *   --viewport=1600x900 --dsf=1   (CSS size and device scale factor; 2 = a Retina Mac's backing store)
 *   --garage-dwell=0         seconds in the Garage before choosing the map and pressing BATTLE (a player's dwell)
 *   --pause-s=3              esc/regarage: seconds in the pause menu / Garage before returning
 *   --hold-min=18            the longest capture-lock hold before a fresh ticket
 *   --no-lock                skip the capture lock (never on a shared machine)
 *   --out=<dir>              report.jsonl, summary.json and frames (default the stream directory)
 *
 * (2026-10-19, black-screen-228 fix lane) the acceptance additions:
 *   --zero-frac=0.8          BLACK-WORLD = at least this share of the world region exactly 0,0,0 (the owner's frame: 0.812);
 *                            a frame over --black-frac near-black but under it is a 'suspect'
 *   --real-esc               Esc as a player's: the pointer locked by a real click on the canvas, Esc sent through CDP
 *                            Input.dispatchKeyEvent (the browser's unlock gesture: pointerlockchange, then the game's
 *                            panel or resume veil), RESUME clicked, the pointer locked again; the lock states are recorded
 *   --real-focus             no Document.prototype.hasFocus override: the window leaves and returns through a second
 *                            tab brought to the front (CDP Page.bringToFront), as the frame scheduler sees a real blur
 *   --gldiag                 ?gldiag=1: the guard's per-pass GL error watch after every resolution change (P8)
 *   session steps: inject:<fault> (applied ONCE; the black-world guard must heal it), inject:persist:<fault>:<s> (applied
 *                  every frame for s seconds), faults layers | roots | override | passes | viewport1 | nancloud | nanscene (a NaN over the
 *                  scene target inside the scene pass) | emptypass | control;
 *                  every inject row records the guard's receipts (window.__GL_DIAG.blackWorld) opened after the fault,
 *                  their class, heal rung and latency from the fault to the healthy verdict
 * Every row records the guard's incidents and stats (natural runs must show none).
 */
import { mkdirSync, mkdtempSync, writeFileSync, appendFileSync, existsSync, renameSync } from 'node:fs';
import { tmpdir, homedir, loadavg } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PROD_URL = 'https://cot.kevinliu.studio/';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : fallback; };
const flag = (name) => args.includes(`--${name}`);

const target = opt('target', 'prod');
const maps = opt('maps', 'badlands').split(',').map((s) => s.trim()).filter(Boolean);
const mode = opt('mode', 'drone');
const tank = opt('tank', '');
const preset = opt('preset', '');
const timesArg = opt('times', 'any');
const runsPerMap = Number(opt('runs', '10'));
const scenario = opt('scenario', 'cold');
const seconds = Number(opt('seconds', '25'));
const intervalMs = Number(opt('interval', '250'));
const plain = flag('plain');
const drive = flag('drive');
// --control: the positive control — in each run's first window, from 10 s to 13 s, the camera sees only the late-FX layer
// (the scene pass draws nothing: the owner's signature), so a sweep can never pass because the detector stopped seeing
const control = flag('control');
// --stress=<level>: a second headless browser inside the same capture hold drawing a heavy full-screen shader (GPU) and
// running busy workers (CPU), the contention a player's machine sees while another GPU job runs beside the game
const stress = Number(opt('stress', '0'));
const headful = flag('headful');
// --chrome=system: the installed Google Chrome (the owner's browser) with a temporary profile, never the owner's own
const chromeArg = opt('chrome', '');
const executablePath = chromeArg === 'system' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : chromeArg || undefined;
const [vw, vh] = opt('viewport', '1600x900').split('x').map(Number);
const dsf = Number(opt('dsf', '1'));
const pauseS = Number(opt('pause-s', '3'));
const injectSeconds = Number(opt('inject-seconds', '7'));
const cbv = flag('capture-beyond-viewport'); // the old (artifact-prone) capture, for the A/B only
const zeroFracThreshold = Number(opt('zero-frac', '0.8'));
const realEsc = flag('real-esc');
const realFocus = flag('real-focus');
const gldiag = flag('gldiag');
// --away-during-load=S: the player leaves the window while the battle loads (Cmd-Tab / another tab): S seconds after
// BATTLE with document.hasFocus() false + a window blur (+ document.hidden with --away-hidden), then back
const awayDuringLoadS = Number(opt('away-during-load', '0'));
const awayHidden = flag('away-hidden');
// --away-at=S: S seconds after BATTLE (default 1)
const awayAtS = Number(opt('away-at', '1'));
// --garage-dwell=S: seconds in the Garage (after the boot, and after a return) before the map card and BATTLE — a player
// looks around first, so the Garage's deferred work (dressing, GPU warm, camo bakes, idle preloads) finishes first
const garageDwellS = Number(opt('garage-dwell', '0'));
const holdMs = Number(opt('hold-min', '18')) * 60_000;
const useLock = !flag('no-lock');
// (calibrated on the owner's own frame, owner-redrock-black.webp: 84.6 % of its world region is at or under luma 6 and
// 81.4 % exactly 0,0,0 — the dust puffs cover the rest — so the brief's 85 % would miss it; healthy frames read <= 0.1 %)
const blackFrac = Number(opt('black-frac', '0.6'));
const suspectFrac = Number(opt('suspect-frac', '0.35')); // night maps read up to ~0.30 (Verdant, Cinder Junction night)
const blackLuma = Number(opt('black-luma', '6'));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.resolve(opt('out', path.join(homedir(), 'cot-launch-state/streams/black-screen-228/inv-repro', `run-${stamp}`)));
mkdirSync(out, { recursive: true });
mkdirSync(path.join(out, 'frames'), { recursive: true });
if (!['cold', 'warm', 'esc', 'regarage', 'session'].includes(scenario)) { console.error('bad --scenario'); process.exit(2); }

const { MAP_IDS } = await import(pathToFileURL(path.join(ROOT, 'src/world/maps/mapIds.ts')).href);
const unknown = maps.filter((m) => !MAP_IDS.includes(m));
if (unknown.length) { console.error(`unknown map id(s): ${unknown.join(', ')}`); process.exit(2); }

const puppeteer = (await import('puppeteer')).default;
const { createCanvas, loadImage } = await import('@napi-rs/canvas');
const { createCaptureLock } = await import('./capture-lock.mjs');
const { nativeBrowserLaunchOptions } = await import('./native-browser-launch.mjs');

const started = Date.now();
const log = (m) => console.log(`[bwr ${String(Math.round((Date.now() - started) / 1000)).padStart(5)}s] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------------------------------
// capture lock: one hold per part, a fresh ticket each time, never longer than --hold-min
// ---------------------------------------------------------------------------------------------------------------------
const lock = createCaptureLock();
let holdingSince = 0;
let refresher = null;
async function acquire() {
  if (!useLock || holdingSince) return;
  log('waiting for the capture lock (normal band)');
  const t0 = Date.now();
  await lock.acquire(6 * 3600 * 1000);
  holdingSince = Date.now();
  refresher = setInterval(() => lock.refresh(), 30_000);
  log(`capture lock held after ${Math.round((Date.now() - t0) / 1000)} s`);
}
function release() {
  if (!holdingSince) return;
  if (stressBrowser) { const b = stressBrowser; stressBrowser = null; b.close().catch(() => {}); }
  clearInterval(refresher); refresher = null;
  lock.release();
  log(`capture lock released after ${Math.round((Date.now() - holdingSince) / 1000)} s`);
  holdingSince = 0;
}
process.on('exit', () => { try { lock.release(); } catch { /* none */ } });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { try { lock.release(); } catch { /* none */ } process.exit(130); });
const holdLeftMs = () => (holdingSince ? holdMs - (Date.now() - holdingSince) : Infinity);

// ---------------------------------------------------------------------------------------------------------------------
// the server under test
// ---------------------------------------------------------------------------------------------------------------------
let viteServer = null;
async function baseUrl() {
  if (target === 'prod') return PROD_URL;
  if (target !== 'dev') return target;
  const { createServer } = await import('vite');
  viteServer = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0, strictPort: false, hmr: false } });
  await viteServer.listen();
  const address = viteServer.httpServer.address();
  return `http://localhost:${address.port}/`;
}

// ---------------------------------------------------------------------------------------------------------------------
// browser: the real GPU (ANGLE Metal), webdriver false, no automation background overrides
// ---------------------------------------------------------------------------------------------------------------------
let browser = null;
let profileDir = null;
// the run's own temporary profiles (~100 MB each, 9.5 GB over 170 runs) go to the Trash once their browser is closed
const ownTemp = [];
function trashOwnTemp(dir) {
  try {
    if (!dir || !path.basename(dir).startsWith('cot-bwr-') || path.dirname(dir) !== tmpdir() || !existsSync(dir)) return;
    const trash = path.join(homedir(), '.Trash', 'cot-bwr-profiles');
    mkdirSync(trash, { recursive: true });
    renameSync(dir, path.join(trash, `${path.basename(dir)}-${Date.now()}`));
  } catch { /* a profile left behind is only disk */ }
}
async function launchBrowser(fresh) {
  if (browser) { try { await browser.close(); } catch { /* closed */ } browser = null; }
  if (fresh && profileDir) { trashOwnTemp(profileDir); profileDir = null; }
  if (fresh || !profileDir) { profileDir = mkdtempSync(path.join(tmpdir(), 'cot-bwr-profile-')); ownTemp.push(profileDir); }
  const launchOptions = nativeBrowserLaunchOptions({
    headless: headful ? false : 'new', protocolTimeout: 600_000, defaultViewport: null, userDataDir: profileDir,
    ...(executablePath ? { executablePath } : {}),
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled', '--autoplay-policy=no-user-gesture-required',
      `--window-size=${vw},${vh + 120}`, '--enable-precise-memory-info'],
  });
  browser = await puppeteer.launch(launchOptions);
  return browser;
}

let stressBrowser = null;
const STRESS_HTML = (level) => `<!doctype html><html><body style="margin:0;background:#000"><canvas id="c" width="1920" height="1080"></canvas><script>
const gl = document.getElementById('c').getContext('webgl2');
const vs = '#version 300 es\\nin vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }';
const fs = '#version 300 es\\nprecision highp float; uniform float t; out vec4 o; void main(){ vec2 u = gl_FragCoord.xy; float a = 0.;'
  + ' for (int i = 0; i < ${200 * level}; i++) { a += sin(u.x * 0.01 + float(i) * 0.37 + t) * cos(u.y * 0.013 - float(i) * 0.21); } o = vec4(vec3(fract(a)), 1.); }';
const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); return x; };
const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr); gl.useProgram(pr);
const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
const tu = gl.getUniformLocation(pr, 't');
const frame = (ms) => { gl.uniform1f(tu, ms * 0.001); gl.drawArrays(gl.TRIANGLES, 0, 3); requestAnimationFrame(frame); };
requestAnimationFrame(frame);
const busy = 'let x = 0; for (;;) { x += Math.sqrt(x + 1); if (x > 1e12) x = 0; }';
for (let i = 0; i < ${Math.min(6, level * 2)}; i++) new Worker(URL.createObjectURL(new Blob([busy], { type: 'text/javascript' })));
</script></body></html>`;
// --stress-game=<map>: the contention the owner plays under — another copy of the game itself in a battle (the agents'
// Studio / capture Chromes render this game while the owner plays): a second headless browser enters <map> and stays
const stressGame = opt('stress-game', '');
async function startStressGame(base) {
  if (!stressGame || stressBrowser) return;
  stressBrowser = await puppeteer.launch(nativeBrowserLaunchOptions({ headless: 'new', defaultViewport: null, protocolTimeout: 600_000,
    userDataDir: (() => { const d = mkdtempSync(path.join(tmpdir(), 'cot-bwr-stressgame-')); ownTemp.push(d); return d; })(), ignoreDefaultArgs: ['--enable-automation'],
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', `--window-size=${vw},${vh + 120}`] }));
  const p = await stressBrowser.newPage();
  await p.setViewport({ width: vw, height: vh, deviceScaleFactor: dsf });
  await p.evaluateOnNewDocument(() => { try { localStorage.setItem('cot.telemetry', 'off'); localStorage.setItem('cot.game.mode.v1', 'drone'); } catch { /* none */ } });
  const url = new URL(base); url.searchParams.set('nosplash', '1'); url.searchParams.set('telemetry', 'off');
  await p.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 240_000 });
  await p.waitForFunction(() => window.__GAME_READY === true && !!document.querySelector('.cot-battle'), { timeout: 240_000, polling: 250 });
  await p.evaluate((id) => { const b = document.querySelector(`.cot-map-card .mthumb.${CSS.escape(id)}`)?.closest('.cot-map-card')?.querySelector('.cot-map-select'); b?.click(); }, stressGame);
  await p.evaluate(() => document.querySelector('.cot-battle')?.click());
  await p.waitForFunction(() => { const h = document.querySelector('.cot-hud'); return !!h && getComputedStyle(h).display !== 'none' && !document.querySelector('.cot-bl.on'); }, { timeout: 240_000, polling: 500 }).catch(() => {});
  // the load's own player drives in circles so its frames keep changing
  await p.keyboard.down('KeyW'); await p.keyboard.down('KeyA');
  log(`stress game in battle on ${stressGame}`);
}
async function startStress() {
  if (stressGame) return startStressGame(await baseUrl.cached);
  if (!stress || stressBrowser) return;
  stressBrowser = await puppeteer.launch(nativeBrowserLaunchOptions({ headless: 'new', defaultViewport: { width: 1920, height: 1080 },
    userDataDir: (() => { const d = mkdtempSync(path.join(tmpdir(), 'cot-bwr-stress-')); ownTemp.push(d); return d; })(),
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox'] }));
  const p = await stressBrowser.newPage();
  await p.goto(`data:text/html;base64,${Buffer.from(STRESS_HTML(stress)).toString('base64')}`);
  log(`stress page running (level ${stress})`);
}
async function stopStress() {
  if (!stressBrowser) return;
  try { await stressBrowser.close(); } catch { /* closed */ }
  stressBrowser = null;
}

const consoleLines = [];
async function newPage(time) {
  const page = await browser.newPage();
  await page.setViewport({ width: vw, height: vh, deviceScaleFactor: dsf });
  page.setDefaultTimeout(240_000);
  await page.evaluateOnNewDocument((modeId, timeList, tankId, presetName, realFocusRun) => {
    // 'blur' steps: the window's focus as the frame scheduler reads it (document.hasFocus + window blur/focus events);
    // --real-focus leaves the browser's own focus alone
    if (!realFocusRun) {
      const hasFocus = Document.prototype.hasFocus;
      Document.prototype.hasFocus = function () { return window.__bwrForceBlur ? false : hasFocus.call(this); };
    }
    // 'away' steps with --away-hidden: document.hidden / visibilityState as a backgrounded tab reports them
    const hiddenDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    const visDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
    if (hiddenDesc?.get) Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get() { return window.__bwrForceHidden ? true : hiddenDesc.get.call(this); } });
    if (visDesc?.get) Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get() { return window.__bwrForceHidden ? 'hidden' : visDesc.get.call(this); } });
    try { if (presetName) localStorage.setItem('cot.gfxPreset', presetName); } catch { /* storage blocked */ }
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true });
    try {
      localStorage.setItem('cot.telemetry', 'off');
      if (modeId) localStorage.setItem('cot.game.mode.v1', modeId);
      if (timeList) localStorage.setItem('cot.battle.times.v2', JSON.stringify(timeList));
      if (tankId && !sessionStorage.getItem('bwr.tankSet')) { localStorage.setItem('cot.lastTank.v1', tankId); sessionStorage.setItem('bwr.tankSet', '1'); }
    } catch { /* storage blocked */ }
    // the ?debug panel (#cot-perfhud) covers part of the world region: hidden, never removed
    const hide = () => { try { const st = document.createElement('style'); st.textContent = '#cot-perfhud{display:none!important}'; document.head.appendChild(st); } catch { /* none */ } };
    if (document.head) hide(); else document.addEventListener('DOMContentLoaded', hide, { once: true });
    const bwr = (window.__BWR = { events: [], contexts: 0, zeroAlloc: [], zeroAllocCount: 0 });
    // every GPU allocation with a zero or negative dimension (the 'Attachment has zero size' incomplete framebuffer that
    // swallows every draw into it): the call, the size, the bound target and the JS stack that asked for it
    const G2 = window.WebGL2RenderingContext?.prototype;
    if (G2) {
      const wrapAlloc = (fn, dims) => {
        const orig = G2[fn];
        if (typeof orig !== 'function') return;
        G2[fn] = function (...a) {
          const [w, h] = dims(a);
          if (!(w > 0) || !(h > 0)) {
            bwr.zeroAllocCount++;
            if (bwr.zeroAlloc.length < 24) {
              let target = null;
              try { const R = window.__DEBUG?.renderer; const rt = R?.getRenderTarget?.(); target = rt ? { name: rt.texture?.name ?? '', w: rt.width, h: rt.height, samples: rt.samples ?? 0 } : null; } catch { /* none */ }
              let canvas = null;
              try { const c = window.__DEBUG?.renderer?.domElement; canvas = c ? { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight } : null; } catch { /* none */ }
              bwr.zeroAlloc.push({ fn, w, h, at: +performance.now().toFixed(0), phase: window.__DEBUG?.game?.phase ?? null, timeS: window.__DEBUG?.game?.timeS ?? null,
                target, canvas, stack: String(new Error().stack).split('\n').slice(2, 16).map((l) => l.trim().slice(0, 200)) });
            }
          }
          return orig.apply(this, a);
        };
      };
      // texStorage2D(target, levels, internalformat, width, height); texStorage3D(..., width, height, depth)
      wrapAlloc('texStorage2D', (a) => [a[3], a[4]]);
      wrapAlloc('texStorage3D', (a) => [a[3], a[4]]);
      wrapAlloc('renderbufferStorage', (a) => [a[2], a[3]]);
      wrapAlloc('renderbufferStorageMultisample', (a) => [a[3], a[4]]);
      wrapAlloc('texImage2D', (a) => (a.length >= 8 && typeof a[3] === 'number' && typeof a[4] === 'number' ? [a[3], a[4]] : [1, 1]));
    }
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      const ctx = getContext.call(this, type, attrs);
      if (ctx && /webgl/.test(String(type)) && !this.__bwrHooked) {
        this.__bwrHooked = true;
        bwr.contexts++;
        const canvas = this;
        const note = (kind) => (event) => {
          if (bwr.events.length < 60) bwr.events.push({ kind, at: performance.now(), w: canvas.width, h: canvas.height,
            message: event?.statusMessage ?? '' });
        };
        canvas.addEventListener('webglcontextlost', note('contextlost'));
        canvas.addEventListener('webglcontextrestored', note('contextrestored'));
        canvas.addEventListener('webglcontextcreationerror', note('creationerror'));
      }
      return ctx;
    };
  }, mode === 'standard' ? 'standard' : mode, time === 'any' ? null : [time], tank || null, preset || null, realFocus);
  page.on('console', (m) => {
    const type = m.type();
    const text = m.text();
    if (type !== 'error' && type !== 'warn' && !/\[(quality|watchdog|scene-watchdog|gl|context|entry|deploy)/i.test(text)) return;
    if (/favicon/i.test(text)) return;
    if (consoleLines.length < 4000) consoleLines.push({ t: Date.now(), type, text: text.slice(0, 600) });
  });
  page.on('pageerror', (e) => { if (consoleLines.length < 4000) consoleLines.push({ t: Date.now(), type: 'pageerror', text: String(e?.stack ?? e).slice(0, 800) }); });
  return page;
}

async function boot(page, base) {
  const url = new URL(base);
  if (!plain) url.searchParams.set('debug', '1');
  if (gldiag) url.searchParams.set('gldiag', '1');
  url.searchParams.set('nosplash', '1');
  url.searchParams.set('telemetry', 'off');
  const t0 = Date.now();
  const res = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 240_000 });
  if (!res || res.status() >= 400) throw new Error(`document status ${res?.status()}`);
  await page.waitForFunction(() => window.__GAME_READY === true && !!document.querySelector('.cot-battle'), { timeout: 240_000, polling: 250 });
  if (!plain) await page.waitForFunction(() => !!window.__DEBUG && window.__DEBUG.game?.phase === 'garage', { timeout: 120_000, polling: 250 });
  const info = await page.evaluate(() => {
    let gpu = null;
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2');
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    } catch { /* none */ }
    return { version: document.querySelector('meta[name="application-version"]')?.content ?? null, gpu,
      webdriver: navigator.webdriver, preset: (() => { try { return window.__DEBUG?.quality?.resolvePresetName?.() ?? null; } catch { return null; } })() };
  });
  return { bootMs: Date.now() - t0, browser: await browser.version(), ...info };
}

// ---------------------------------------------------------------------------------------------------------------------
// player actions
// ---------------------------------------------------------------------------------------------------------------------
async function selectMapAndBattle(page, map, dwell = true) {
  if (dwell && garageDwellS > 0) await sleep(garageDwellS * 1000);
  const picked = await page.evaluate((id) => {
    const thumb = document.querySelector(`.cot-map-card .mthumb.${CSS.escape(id)}`);
    const button = thumb?.closest('.cot-map-card')?.querySelector('.cot-map-select');
    if (!button) return false;
    const card = button.closest('.cot-map-card');
    if (!card.classList.contains('sel')) button.click();
    return card.classList.contains('sel');
  }, map);
  if (!picked) throw new Error(`map card ${map} not found or not selected`);
  // the real BATTLE control (trusted pointer events); an in-page click as the fallback when it is covered
  try {
    await page.waitForSelector('.cot-battle', { visible: true, timeout: 20_000 });
    await page.click('.cot-battle');
  } catch {
    await page.evaluate(() => document.querySelector('.cot-battle')?.click());
  }
}

/** Wait until the battle loader (.cot-bl.on) has come and gone and the HUD shows; returns timings. */
async function waitForCoverLift(page, timeoutMs = 240_000, retry = null) {
  const t0 = Date.now();
  let sawCover = false;
  let last = null;
  let retries = 0;
  while (Date.now() - t0 < timeoutMs) {
    // a BATTLE press that landed while the Garage was still settling (the return veil) starts nothing: press it again
    if (retry && !sawCover && retries < 3 && Date.now() - t0 > 15_000 * (retries + 1) && last && !last.cover && !last.hud) {
      retries++;
      log(`  no loading cover ${Math.round((Date.now() - t0) / 1000)} s after BATTLE: pressing it again (${retries})`);
      try { await retry(); } catch { /* the next poll decides */ }
    }
    last = await page.evaluate(() => {
      const bl = document.querySelector('.cot-bl');
      const hud = document.querySelector('.cot-hud');
      const hs = hud ? getComputedStyle(hud) : null;
      const D = window.__DEBUG;
      return { cover: !!bl?.classList.contains('on'), hud: !!hs && hs.display !== 'none' && hs.visibility !== 'hidden',
        phase: D?.game?.phase ?? null, failed: !!document.querySelector('.cot-bl .err, .cot-bl.failed') };
    }).catch(() => null);
    if (last?.cover) sawCover = true;
    if (sawCover && last && !last.cover && last.hud) return { liftMs: Date.now() - t0, sawCover, retries };
    if (!sawCover && Date.now() - t0 > 30_000 && last?.hud && last?.phase === 'battle') return { liftMs: Date.now() - t0, sawCover };
    await sleep(100);
  }
  throw new Error(`the loading cover did not lift in ${timeoutMs / 1000} s (last ${JSON.stringify(last)})`);
}

/** After BATTLE: wait for the cover to lift, leaving the window for --away-during-load seconds meanwhile. */
async function enterAndWait(page, map, row) {
  const waiting = waitForCoverLift(page, 240_000, () => selectMapAndBattle(page, map, false));
  if (awayDuringLoadS > 0) {
    await sleep(awayAtS * 1000);
    const before = await page.evaluate(() => ({ cover: !!document.querySelector('.cot-bl.on'), phase: window.__DEBUG?.game?.phase ?? null })).catch(() => null);
    await blurAndReturn(page, awayDuringLoadS, awayHidden);
    const after = await page.evaluate(() => ({ cover: !!document.querySelector('.cot-bl.on'), phase: window.__DEBUG?.game?.phase ?? null })).catch(() => null);
    row.away = { atS: awayAtS, forS: awayDuringLoadS, hidden: awayHidden, before, after };
    log(`  away during the load ${awayDuringLoadS} s${awayHidden ? ' (hidden)' : ''}: before ${JSON.stringify(before)} after ${JSON.stringify(after)}`);
  }
  return waiting;
}

/** --real-esc: a real click locks the pointer, CDP sends the browser's Esc (the unlock gesture), RESUME relocks. */
async function realEscape(page, dwellS = pauseS) {
  const lockState = () => page.evaluate(() => ({ locked: !!document.pointerLockElement, focus: document.hasFocus(), hidden: document.hidden,
    settings: !!document.querySelector('.cot-settings.open'), veil: !!document.querySelector('.cot-resume-veil.on, .cot-resume.on') }));
  const out = { before: null, afterEsc: null, afterResume: null };
  await page.bringToFront();
  await page.mouse.click(vw / 2, vh / 2);
  for (let i = 0; i < 20 && !(await lockState()).locked; i++) await sleep(100);
  out.before = await lockState();
  const cdp = await page.createCDPSession();
  try {
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  } finally { await cdp.detach().catch(() => {}); }
  await sleep(400);
  out.afterEsc = await lockState();
  await sleep(Math.max(0, dwellS * 1000 - 400));
  // RESUME with a trusted click (the panel's own relock), or the click-to-resume veil
  const resume = await page.$('.cot-set-btn.resume');
  const visible = resume ? await resume.evaluate((b) => b.offsetParent !== null) : false;
  if (visible) await resume.click();
  else await page.mouse.click(vw / 2, vh / 2);
  for (let i = 0; i < 20 && !(await lockState()).locked; i++) await sleep(100);
  out.afterResume = await lockState();
  return out;
}

async function pauseAndResume(page) {
  if (realEsc) return realEscape(page);
  await page.keyboard.press('Escape');
  await sleep(pauseS * 1000);
  const resumed = await page.evaluate(() => {
    const b = document.querySelector('.cot-set-btn.resume');
    if (b && b.offsetParent !== null) { b.click(); return 'button'; }
    return null;
  });
  if (!resumed) await page.keyboard.press('Escape');
  await sleep(300);
}

/** --real-focus: another tab takes the foreground for awayS, then this one comes back (CDP Page.bringToFront). */
async function realAway(page, awayS) {
  const state = () => page.evaluate(() => ({ focus: document.hasFocus(), hidden: document.hidden })).catch(() => null);
  const other = await browser.newPage();
  await other.goto('about:blank').catch(() => {});
  await other.bringToFront();
  await sleep(300);
  const away = await state();
  await sleep(Math.max(0, awayS * 1000 - 300));
  await page.bringToFront();
  await other.close().catch(() => {});
  await sleep(300);
  return { away, back: await state() };
}

/** The window leaves the foreground for --pause-s (Cmd-Tab away and back, as the frame scheduler sees it). */
async function blurAndReturn(page, awayS = pauseS, hidden = false) {
  if (realFocus) return realAway(page, awayS);
  await page.evaluate((h) => { window.__bwrForceBlur = true; if (h) window.__bwrForceHidden = true; window.dispatchEvent(new Event('blur')); document.dispatchEvent(new Event('visibilitychange')); }, hidden);
  await sleep(awayS * 1000);
  await page.evaluate(() => { window.__bwrForceBlur = false; window.__bwrForceHidden = false; window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(300);
}

async function leaveToGarage(page) {
  await page.keyboard.press('Escape');
  await sleep(800);
  const left = await page.evaluate(() => {
    const b = document.querySelector('.cot-set-btn.leave');
    if (!b) return false;
    b.click();
    return true;
  });
  if (!left) throw new Error('no LEAVE BATTLE button');
  // a confirm dialog, if any
  await sleep(500);
  await page.evaluate(() => {
    const confirm = [...document.querySelectorAll('button')].find((b) => /^(leave|confirm|yes)/i.test(b.textContent.trim()) && b.offsetParent !== null
      && !b.classList.contains('leave'));
    confirm?.click();
  });
  await page.waitForFunction(() => {
    const D = window.__DEBUG;
    const garageUi = document.querySelector('.cot-battle');
    return (D ? D.game?.phase === 'garage' : true) && garageUi && garageUi.offsetParent !== null;
  }, { timeout: 120_000, polling: 250 });
  await sleep(pauseS * 1000);
}

// ---------------------------------------------------------------------------------------------------------------------
// frame measurement
// ---------------------------------------------------------------------------------------------------------------------
const AW = 400, AH = Math.round(400 * vh / vw);
const analysisCanvas = createCanvas(AW, AH);
const actx = analysisCanvas.getContext('2d');
/** The world region (normalized): the centre box minus the reticle; the HUD lives at the edges. */
function worldStats(rgba, w, h) {
  const x0 = Math.floor(w * 0.16), x1 = Math.ceil(w * 0.84), y0 = Math.floor(h * 0.14), y1 = Math.ceil(h * 0.80);
  const rx0 = w * 0.46, rx1 = w * 0.54, ry0 = h * 0.50, ry1 = h * 0.62;
  let n = 0, black = 0, sum = 0, zero = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (x >= rx0 && x < rx1 && y >= ry0 && y < ry1) continue;
      const i = (y * w + x) * 4;
      const l = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
      sum += l; n++;
      if (l <= blackLuma) black++;
      if (rgba[i] === 0 && rgba[i + 1] === 0 && rgba[i + 2] === 0) zero++;
    }
  }
  return { mean: +(sum / n).toFixed(1), blackFrac: +(black / n).toFixed(3), zeroFrac: +(zero / n).toFixed(3) };
}
// the sample is captured at ~800 device px wide (a full Retina capture took ~0.77 s and stretched a 35 s window to 122 s);
// a BLACK / suspect frame is captured again at full size for the evidence
const SAMPLE_SCALE = Math.min(1, 800 / (vw * dsf));
async function grab(page, file = null, full = false) {
  // captureBeyondViewport false: a clipped capture with puppeteer's default (true) made headless Chrome report a 1 x 1
  // window for ~90 ms (innerWidth, visualViewport), and the game resized its canvas and composer to 1 CSS px (p27)
  const buf = await page.screenshot({ type: 'jpeg', quality: full ? 80 : 70, optimizeForSpeed: true, captureBeyondViewport: !!cbv,
    ...(full || SAMPLE_SCALE >= 1 ? {} : { clip: { x: 0, y: 0, width: vw, height: vh, scale: SAMPLE_SCALE } }) });
  const img = await loadImage(buf);
  actx.drawImage(img, 0, 0, AW, AH);
  const stats = worldStats(actx.getImageData(0, 0, AW, AH).data, AW, AH);
  if (file) writeFileSync(file, buf);
  return { ...stats, buf };
}

// in-page per-sample state (debug mode only; cheap reads)
const pageState = () => {
  const D = window.__DEBUG;
  const hud = document.querySelector('.cot-hud');
  const hs = hud ? getComputedStyle(hud) : null;
  const o = { hud: !!hs && hs.display !== 'none' && hs.visibility !== 'hidden' && hs.opacity !== '0',
    pause: !!document.querySelector('.cot-set.open, .cot-settings.open, .cot-set-wrap.open'),
    cover: !!document.querySelector('.cot-bl.on'), events: (window.__BWR?.events ?? []).length };
  if (!D) return o;
  const g = D.game, S = D.scene, R = D.renderer, C = D.camera, P = D.post;
  o.phase = g?.phase; o.timeS = g?.timeS != null ? +g.timeS.toFixed(2) : null; o.preS = g?.preBattleS != null ? +(+g.preBattleS).toFixed(2) : null;
  o.mapId = g?.mapId;
  o.cam = [+C.position.x.toFixed(1), +C.position.y.toFixed(1), +C.position.z.toFixed(1)];
  o.calls = R.info.render.calls; o.tris = R.info.render.triangles; o.programs = R.info.programs?.length ?? null;
  o.textures = R.info.memory.textures; o.geometries = R.info.memory.geometries;
  o.dyn = P?.dynScale != null ? +(+P.dynScale).toFixed(3) : null;
  try { o.preset = D.quality?.resolvePresetName?.() ?? null; } catch { o.preset = null; }
  o.msaa = P?.sceneAA?.sceneTarget?.samples ?? null;
  o.rt = P?.sceneAA?.sceneTarget ? [P.sceneAA.sceneTarget.width, P.sceneAA.sceneTarget.height] : null;
  // the scene pass's inputs: the camera's layers, the visible scene roots, the battlefield root's membership
  o.camMask = C.layers.mask;
  o.roots = S.children.reduce((n, c) => n + (c.visible ? 1 : 0), 0);
  try { const w = D.world; o.worldMounted = w?.group ? (w.group.parent === S && w.group.visible) : null; } catch { o.worldMounted = null; }
  const vc = S.userData.volumetricClouds;
  if (vc) {
    o.cloud = { vis: !!vc.dome?.visible, inside: vc.domeMaterial?.uniforms?.uInside?.value ?? null, dt: vc.domeMaterial?.depthTest,
      valid: !!vc.historyValid, rebuild: vc.rebuild, link: !!vc.linkPending, low: +(vc.medium?.uHeightRange?.value?.x ?? NaN).toFixed(0),
      camY: +(vc.cam?.pos?.y ?? NaN).toFixed(1), active: !!vc.active };
  } else o.cloud = null;
  const lm = S.userData.lightModel;
  if (lm) o.light = { mode: lm.mode, night: +(+lm.night).toFixed(2), exposure: +(+lm.exposure).toFixed(3) };
  o.ctxLost = R.getContext().isContextLost();
  const mon = window.__BWR_SCENE;
  if (mon) o.scenePass = { frames: mon.frames, empty: mon.empty, maskBad: mon.maskBad, minCalls: Number.isFinite(mon.minCalls) ? mon.minCalls : null, last: mon.last };
  const guard = window.__COT_BLACK_GUARD;
  if (guard) { const gs = guard.stats(); o.guard = { on: gs.enabled, active: gs.active, probes: gs.probes, incidents: gs.incidents, cpu: gs.cpuBits, fail: gs.failStreak }; }
  return o;
};

// ---------------------------------------------------------------------------------------------------------------------
// mechanism tests: a named fault held until window.__bwrUndo() (session step inject:<name>)
//   layers      the scene pass draws nothing (the camera sees only the late-FX layer)
//   domeinside  the cloud dome composites as if the camera stood in the slab (no depth test, no horizon mask)
//   domeblack   domeinside over a zeroed cloud history (alpha 1 over rgb 0)
//   historyzero a zeroed cloud history with the dome as the game sets it (the sky alone)
//   noaerial    the aerial pass disabled (the scene target copied straight through)
// ---------------------------------------------------------------------------------------------------------------------
/** (the fix lane) one fault applied once (the guard must heal it), or every frame for `seconds` (persist). */
function injectOnce(spec) {
  const D = window.__DEBUG, S = D.scene, C = D.camera, P = D.post, R = D.renderer;
  const [kindOrPersist, maybeKind, maybeSeconds] = String(spec).split(':');
  const persist = kindOrPersist === 'persist';
  const kind = persist ? maybeKind : kindOrPersist;
  const seconds = persist ? Number(maybeSeconds || 5) : 0;
  const findMaterial = () => { let m = null; S.traverse((o) => { if (!m && o.isMesh && o.material && !Array.isArray(o.material)) m = o.material; }); return m; };
  let nanMaterial = null;
  const apply = () => {
    if (kind === 'layers') C.layers.set(5);
    else if (kind === 'roots') {
      // every top-level content root (not the effects, not a light, nor a root holding one: a light's visibility changes
      // every lit program's key, and the recompile would measure the compiler, not the guard)
      const holdsLight = (root) => { let found = false; root.traverse((o) => { if (o.isLight) found = true; }); return found; };
      for (const root of S.children) if (!root.isLight && root.name !== 'fx' && !holdsLight(root)) root.visible = false;
    }
    else if (kind === 'override') { const m = findMaterial().clone(); m.colorWrite = false; S.overrideMaterial = m; }
    else if (kind === 'passes') P.sceneAA.enabled = false;
    else if (kind === 'control') C.layers.mask = 1 << 30; // inv-repro's positive control: the camera sees the late-FX layer only
    else if (kind === 'emptypass' && !R.__bwrEmptyPass) {
      // the scene pass lands nothing while every CPU signal stays healthy (a GL-level loss of every world draw): three's
      // render into the scene target returns before drawing for the fault's seconds
      const render = R.render;
      R.__bwrEmptyPass = render;
      R.render = function (sceneArg, cameraArg) { if (R.getRenderTarget() === P.sceneAA.sceneTarget) return; return render.call(this, sceneArg, cameraArg); };
      setTimeout(() => { R.render = render; delete R.__bwrEmptyPass; }, Math.max(1, seconds || 3) * 1000);
    }
    else if (kind === 'viewport1') {
      // a 1 x 1 layout for ~120 ms (a window restore, Stage Manager): the container and the window report it, the layout
      // events fire, then the real size comes back
      const app = R.domElement.parentElement;
      const style = app.getAttribute('style');
      app.style.width = '1px'; app.style.height = '1px';
      window.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('cot:layoutchange'));
      setTimeout(() => { if (style === null) app.removeAttribute('style'); else app.setAttribute('style', style);
        window.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('cot:layoutchange')); }, 120);
    } else if (kind === 'nancloud' || kind === 'nanscene') {
      const vc = S.userData.volumetricClouds;
      const Ctor = (vc?.resolveMaterial ?? findMaterial()).constructor;
      nanMaterial ??= new (vc?.resolveMaterial?.constructor ?? Ctor)({ uniforms: { uZero: { value: 0 } },
        vertexShader: vc?.resolveMaterial?.vertexShader ?? 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: 'uniform float uZero; void main(){ gl_FragColor = vec4(uZero / uZero); }', depthTest: false, depthWrite: false });
      if (kind === 'nancloud') {
        if (!vc?.history) return { error: 'no cloud layer' };
        for (const target of vc.history) vc.renderQuad(nanMaterial, target);
      } else if (!R.__bwrNanPass) {
        // the scene pass itself lands a non-finite value (a NaN light or a broken material over the whole view): three's
        // render into the scene target draws, then a NaN quad covers it, inside the pass and so before the guard's probe
        // reads the target, for the fault's seconds (a frame written after the pass would be cleared by the next one)
        if (!vc) return { error: 'no cloud layer (its quad draws the NaN)' };
        const render = R.render;
        R.__bwrNanPass = render;
        let inside = false;
        R.render = function (sceneArg, cameraArg) {
          const target = R.getRenderTarget();
          const result = render.call(this, sceneArg, cameraArg);
          if (!inside && target === P.sceneAA.sceneTarget) {
            inside = true;
            try { vc.renderQuad(nanMaterial, target); } finally { inside = false; }
          }
          return result;
        };
        setTimeout(() => { R.render = render; delete R.__bwrNanPass; }, Math.max(0.05, seconds || 0.05) * 1000);
      }
    }
    return null;
  };
  const injectAt = performance.now();
  const error = apply();
  if (persist && kind !== 'emptypass' && kind !== 'nanscene') {
    const until = injectAt + seconds * 1000;
    const loop = () => { if (performance.now() < until) { apply(); requestAnimationFrame(loop); } };
    requestAnimationFrame(loop);
  }
  window.__bwrInject = { kind, persist, seconds, injectAt, until: injectAt + seconds * 1000 };
  window.__bwrUndo = () => {
    if (kind === 'passes') P.sceneAA.enabled = true;
    if (kind === 'override') S.overrideMaterial = null;
    window.__bwrUndo = null;
    return { undone: kind };
  };
  return { kind, persist, seconds, injectAt: +injectAt.toFixed(1), error, guard: window.__COT_BLACK_GUARD ? window.__COT_BLACK_GUARD.stats() : null };
}

/** The guard's receipts opened since the last injection (class, rungs, heal latency from the fault). */
function guardReceiptsSince() {
  const inj = window.__bwrInject;
  const ring = window.__GL_DIAG?.blackWorld ?? [];
  const since = inj ? inj.injectAt - 50 : 0;
  const rows = ring.filter((r) => r.openedAtMs >= since).map((r) => ({ class: r.class, steps: r.steps.map((s) => s.step + (s.note ? `(${s.note})` : '')),
    repeats: r.repeats ?? 0, healedBy: r.healedBy, closed: r.closed, openedAfterMs: inj ? Math.round(r.openedAtMs - inj.injectAt) : null,
    // the world is back the frame after the healing rung acted (lastStepAtMs); the probe confirms it a few frames later
    healedAfterMs: inj && r.lastStepAtMs != null ? Math.max(0, Math.round(r.lastStepAtMs - (inj.persist ? inj.until : inj.injectAt))) : null,
    confirmedAfterMs: inj && r.healedAtMs !== null ? Math.round(r.healedAtMs - (inj.persist ? inj.until : inj.injectAt)) : null,
    healMs: r.healMs, cpu: { calls: r.cpu.sceneCalls, mask: r.cpu.cameraMask, bits: r.cpu.bits }, probe: r.probe,
    framebuffer: r.target.framebuffer ?? null, glErrors: r.gl.errors, warm: r.warm, sinceRevealMs: r.sinceRevealMs }));
  return { inject: inj ?? null, receipts: rows, stats: window.__COT_BLACK_GUARD?.stats() ?? null,
    passErrors: (window.__GL_DIAG?.passErrors ?? []).slice(0, 20), tinySizes: (window.__BWR_INCOMPLETE?.tinySizes ?? []).length };
}

function injectFault(name) {
  const D = window.__DEBUG, S = D.scene, C = D.camera, R = D.renderer, P = D.post;
  const vc = S.userData.volumetricClouds;
  const undo = [];
  let Color = null;
  S.traverse((o) => { if (!Color && o.material && !Array.isArray(o.material) && o.material.color?.isColor) Color = o.material.color.constructor; });
  const zeroHistory = () => {
    const prev = R.getRenderTarget();
    const saved = new Color(); R.getClearColor(saved); const alpha = R.getClearAlpha();
    R.setClearColor(new Color(0, 0, 0), 0);
    for (const t of vc.history) { R.setRenderTarget(t); R.clear(true, false, false); }
    R.setClearColor(saved, alpha); R.setRenderTarget(prev);
  };
  if (name === 'layers') { const m = C.layers.mask; C.layers.mask = 1 << 30; undo.push(() => { C.layers.mask = m; }); }
  if (name === 'noaerial') { const e = P.aerial.enabled; P.aerial.enabled = false; undo.push(() => { P.aerial.enabled = e; }); }
  if (['domeinside', 'domeblack', 'historyzero'].includes(name)) {
    if (!vc) return { error: 'no cloud layer' };
    vc.beforeSceneRender = function (...a) {
      const r = Object.getPrototypeOf(this).beforeSceneRender.apply(this, a);
      if (this.dome.visible) {
        if (name !== 'historyzero') { this.domeMaterial.uniforms.uInside.value = 1; this.domeMaterial.depthTest = false; }
        if (name !== 'domeinside') zeroHistory();
      }
      return r;
    };
    undo.push(() => { delete vc.beforeSceneRender; });
  }
  window.__bwrUndo = () => { for (const u of undo.reverse()) u(); window.__bwrUndo = null; return { undone: name }; };
  return { name, cloud: vc ? { vis: !!vc.dome?.visible, active: !!vc.active } : null, camY: +C.position.y.toFixed(1), aerial: !!P.aerial?.enabled };
}

// ---------------------------------------------------------------------------------------------------------------------
// in-page diagnostics, installed once per page (debug mode)
// ---------------------------------------------------------------------------------------------------------------------
function installDiagnostics() {
  if (window.__BWR_DIAG) return;
  // A frame-accurate monitor of the scene pass (the world's only draw): its draw calls, the camera's layer mask and the
  // battlefield root's membership on every composer frame, counted when it drew (almost) nothing in a battle. Cheap: a
  // wrapper around SceneAAPass.render reading counters the renderer already keeps.
  (function installSceneMonitor() {
    const D = window.__DEBUG, P = D?.post, R = D?.renderer, S = D?.scene, C = D?.camera;
    if (!P?.sceneAA || P.sceneAA.__bwrMonitor) return;
    const mon = (window.__BWR_SCENE = { frames: 0, empty: 0, maskBad: 0, minCalls: Infinity, last: null, firstEmptyAt: null, recent: [] });
    const pass = P.sceneAA;
    const render = pass.render;
    pass.__bwrMonitor = true;
    pass.render = function (...a) {
      const mask = C.layers.mask;
      const c0 = R.info.render.calls, t0 = R.info.render.triangles;
      const r = render.apply(this, a);
      try {
        // the scene target's framebuffer as the scene draws saw it (draws into an incomplete one are silently dropped,
        // yet three still counts them)
        const st = pass.sceneTarget;
        if (D.game?.phase === 'battle' && (!(st.width > 0) || !(st.height > 0) || (mon.frames % 30 === 0))) {
          const gl = R.getContext();
          const prev = R.getRenderTarget();
          R.setRenderTarget(st);
          const status = gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER);
          R.setRenderTarget(prev);
          if (status !== gl.FRAMEBUFFER_COMPLETE || !(st.width > 0) || !(st.height > 0)) {
            mon.incomplete = (mon.incomplete ?? 0) + 1;
            if ((mon.incompleteRows ??= []).length < 20) mon.incompleteRows.push({ at: +performance.now().toFixed(0), timeS: D.game?.timeS, status, w: st.width, h: st.height, samples: st.samples,
              canvas: [R.domElement.width, R.domElement.height, R.domElement.clientWidth, R.domElement.clientHeight], dyn: P.dynScale });
          }
        }
        const calls = R.info.autoReset ? R.info.render.calls : R.info.render.calls - c0;
        const tris = R.info.autoReset ? R.info.render.triangles : R.info.render.triangles - t0;
        if (D.game?.phase === 'battle') {
          mon.frames++;
          if (calls < mon.minCalls) mon.minCalls = calls;
          const bad = calls < 25 || (mask & 1) === 0;
          if ((mask & 1) === 0) mon.maskBad++;
          if (bad) {
            mon.empty++;
            if (mon.firstEmptyAt == null) mon.firstEmptyAt = performance.now();
            if (mon.recent.length < 40) {
              let world = null;
              try { const w = D.world; world = w?.group ? [w.group.parent === S, w.group.visible] : null; } catch { /* none */ }
              mon.recent.push({ at: +performance.now().toFixed(0), timeS: D.game?.timeS, calls, tris, mask, world,
                roots: S.children.reduce((n, c) => n + (c.visible ? 1 : 0), 0), target: R.getRenderTarget()?.texture?.name ?? null,
                cover: !!document.querySelector('.cot-bl.on'), aerial: !!P.aerial?.enabled });
            }
          }
          mon.last = { calls, tris, mask };
        }
      } catch { /* the monitor never alters the frame */ }
      return r;
    };
  })();
  (function installIncompleteTracer() {
    const D = window.__DEBUG, R = D?.renderer;
    if (!R || R.__bwrTracer) return;
    R.__bwrTracer = true;
    const gl = R.getContext();
    const tr = (window.__BWR_INCOMPLETE = { renders: 0, incomplete: 0, rows: [], tinySizes: [] });
    // who sizes the canvas / the composer below 16 CSS px (the 1-px battle-entry frame): the call, the DOM sizes then
    const noteTiny = (what, w, h) => {
      if (w >= 16 && h >= 16) return;
      if (tr.tinySizes.length >= 24) return;
      const app = document.getElementById('app');
      tr.tinySizes.push({ what, w, h, at: +performance.now().toFixed(0), phase: D.game?.phase, timeS: D.game?.timeS,
        app: app ? [app.clientWidth, app.clientHeight] : null, parent: R.domElement.parentElement ? [R.domElement.parentElement.clientWidth, R.domElement.parentElement.clientHeight] : null,
        inner: [window.innerWidth, window.innerHeight], vv: window.visualViewport ? [window.visualViewport.width, window.visualViewport.height, window.visualViewport.scale] : null,
        cssVar: getComputedStyle(document.documentElement).getPropertyValue('--cot-viewport-width'), cover: !!document.querySelector('.cot-bl.on'),
        stack: String(new Error().stack).split('\n').slice(2, 14).map((l) => l.trim().slice(0, 180)) });
    };
    const rSetSize = R.setSize;
    R.setSize = function (w, h, ...rest) { noteTiny('renderer.setSize', w, h); return rSetSize.call(this, w, h, ...rest); };
    const P0 = D.post;
    if (P0?.setSize) { const pSetSize = P0.setSize; P0.setSize = function (w, h, ...rest) { noteTiny('post.setSize', w, h); return pSetSize.call(this, w, h, ...rest); }; }
    const render = R.render;
    R.render = function (scene, camera) {
      tr.renders++;
      try {
        const rt = R.getRenderTarget();
        const status = gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
          tr.incomplete++;
          if (tr.rows.length < 24) tr.rows.push({ at: +performance.now().toFixed(0), phase: D.game?.phase, timeS: D.game?.timeS, status,
            target: rt ? { name: rt.texture?.name ?? '', w: rt.width, h: rt.height, samples: rt.samples ?? 0 } : 'canvas',
            canvas: [R.domElement.width, R.domElement.height], scene: scene?.name || scene?.type, camera: camera?.name || camera?.type, mask: camera?.layers?.mask,
            stack: String(new Error().stack).split('\n').slice(2, 12).map((l) => l.trim().slice(0, 180)) });
        }
      } catch { /* the tracer never alters the frame */ }
      return render.apply(this, arguments);
    };
  })();
  const half = (h) => {
    const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
    if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
    if (e === 31) return f ? NaN : s * Infinity;
    return s * Math.pow(2, e - 15) * (1 + f / 1024);
  };
  const HALF = 1016, FLOAT = 1015, UBYTE = 1009;
  function rtInfo(rt) {
    if (!rt) return null;
    const t = rt.texture;
    return { w: rt.width, h: rt.height, samples: rt.samples ?? 0, type: t?.type, format: t?.format, name: t?.name ?? '',
      depth: !!rt.depthTexture || !!rt.depthBuffer, count: rt.textures?.length ?? 1,
      viewport: rt.viewport?.toArray?.(), scissor: rt.scissor?.toArray?.(), scissorTest: !!rt.scissorTest };
  }
  /** Read rows of a target (or the canvas when rt is null) and summarize finite / NaN / Inf / zero / luminance. */
  function readRows(renderer, rt, rows = [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.95], stride = 8, textureIndex = 0) {
    const gl = renderer.getContext();
    const res = { nan: 0, inf: 0, zero: 0, n: 0, lumSum: 0, lumMax: 0, alphaMin: Infinity, alphaMax: -Infinity, alphaSum: 0, rows: [] };
    try {
      if (!rt) {
        const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
        const prev = renderer.getRenderTarget();
        renderer.setRenderTarget(null);
        const buf = new Uint8Array(w * 4);
        for (const fy of rows) {
          const y = Math.min(h - 1, Math.floor(fy * h));
          gl.readPixels(0, y, w, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          let rowLum = 0, rn = 0;
          for (let x = 0; x < w; x += stride) {
            const i = x * 4; const l = (0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]) / 255;
            res.n++; res.lumSum += l; res.lumMax = Math.max(res.lumMax, l); if (l < 0.004) res.zero++; rowLum += l; rn++;
          }
          res.rows.push(+(rowLum / rn).toFixed(4));
        }
        renderer.setRenderTarget(prev);
      } else {
        const type = (rt.textures?.[textureIndex] ?? rt.texture).type;
        const w = rt.width, h = rt.height;
        const isHalf = type === HALF, isFloat = type === FLOAT;
        const buf = isHalf ? new Uint16Array(w * 4) : isFloat ? new Float32Array(w * 4) : new Uint8Array(w * 4);
        for (const fy of rows) {
          const y = Math.min(h - 1, Math.floor(fy * h));
          renderer.readRenderTargetPixels(rt, 0, y, w, 1, buf, undefined, textureIndex);
          let rowLum = 0, rn = 0;
          for (let x = 0; x < w; x += stride) {
            const i = x * 4;
            const v = [0, 1, 2, 3].map((k) => (isHalf ? half(buf[i + k]) : isFloat ? buf[i + k] : buf[i + k] / 255));
            res.n++;
            if (v.some(Number.isNaN)) { res.nan++; continue; }
            if (v.some((q) => !Number.isFinite(q))) { res.inf++; continue; }
            const l = 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
            if (Math.abs(v[0]) < 1e-5 && Math.abs(v[1]) < 1e-5 && Math.abs(v[2]) < 1e-5) res.zero++;
            res.lumSum += l; res.lumMax = Math.max(res.lumMax, l); rowLum += l; rn++;
            res.alphaMin = Math.min(res.alphaMin, v[3]); res.alphaMax = Math.max(res.alphaMax, v[3]); res.alphaSum += v[3];
          }
          res.rows.push(rn ? +(rowLum / rn).toFixed(4) : null);
        }
      }
    } catch (error) {
      res.error = String(error?.message ?? error).slice(0, 200);
    }
    const finite = res.n - res.nan - res.inf;
    return { n: res.n, nan: res.nan, inf: res.inf, zero: res.zero, lumMean: finite ? +(res.lumSum / finite).toFixed(4) : null,
      lumMax: +res.lumMax.toFixed(3), alpha: Number.isFinite(res.alphaMin) ? [+res.alphaMin.toFixed(3), +(res.alphaSum / Math.max(1, finite)).toFixed(3), +res.alphaMax.toFixed(3)] : null,
      rows: res.rows, ...(res.error ? { error: res.error } : {}) };
  }
  function nonFiniteValue(v) {
    if (v == null) return false;
    if (typeof v === 'number') return !Number.isFinite(v);
    if (typeof v === 'boolean' || typeof v === 'string') return false;
    if (v.isTexture) return false;
    if (Array.isArray(v) || ArrayBuffer.isView(v)) { for (const x of v) if (nonFiniteValue(x)) return true; return false; }
    if (v.elements) { for (const x of v.elements) if (!Number.isFinite(x)) return true; return false; }
    if (v.isColor) return !(Number.isFinite(v.r) && Number.isFinite(v.g) && Number.isFinite(v.b));
    if ('x' in v && 'y' in v) return ![v.x, v.y, v.z ?? 0, v.w ?? 0].every(Number.isFinite);
    return false;
  }
  function scanMaterial(mat, where, outList, seen) {
    if (!mat || seen.has(mat)) return;
    seen.add(mat);
    const u = mat.uniforms;
    if (u) {
      for (const [k, slot] of Object.entries(u)) {
        if (slot && nonFiniteValue(slot.value) && outList.length < 60) outList.push(`${where}:${mat.name || mat.type}.${k}`);
      }
    }
    for (const k of ['opacity', 'emissiveIntensity', 'envMapIntensity', 'roughness', 'metalness']) {
      if (typeof mat[k] === 'number' && !Number.isFinite(mat[k]) && outList.length < 60) outList.push(`${where}:${mat.name || mat.type}.${k}`);
    }
    for (const k of ['color', 'emissive']) if (mat[k] && nonFiniteValue(mat[k]) && outList.length < 60) outList.push(`${where}:${mat.name || mat.type}.${k}`);
  }
  function materialsOf(obj, depth = 0, acc = new Set()) {
    if (!obj || typeof obj !== 'object' || depth > 2) return acc;
    for (const key of Object.keys(obj)) {
      let v; try { v = obj[key]; } catch { continue; }
      if (!v || typeof v !== 'object') continue;
      if (v.isMaterial) acc.add(v);
      else if (v.material?.isMaterial) acc.add(v.material);
      else if (!v.isObject3D && !v.isTexture && !v.isWebGLRenderTarget && depth < 2 && (Array.isArray(v) || v.constructor === Object)) materialsOf(v, depth + 1, acc);
    }
    return acc;
  }
  function targetsOf(obj, prefix, acc, depth = 0, seen = new Set()) {
    if (!obj || typeof obj !== 'object' || depth > 2 || seen.has(obj)) return acc;
    seen.add(obj);
    for (const key of Object.keys(obj)) {
      let v; try { v = obj[key]; } catch { continue; }
      if (!v || typeof v !== 'object') continue;
      if (v.isWebGLRenderTarget) acc.push([`${prefix}.${key}`, v]);
      else if (!v.isObject3D && !v.isTexture && !v.isMaterial && (Array.isArray(v) || v.constructor === Object)) targetsOf(v, `${prefix}.${key}`, acc, depth + 1, seen);
    }
    return acc;
  }
  function cloudState(vc) {
    if (!vc) return null;
    const o = { active: !!vc.active, domeVisible: !!vc.dome?.visible, inside: vc.domeMaterial?.uniforms?.uInside?.value, depthTest: vc.domeMaterial?.depthTest,
      historyValid: !!vc.historyValid, historyIndex: vc.historyIndex, rebuild: vc.rebuild, since: vc.since, frame: vc.frame, frozen: !!vc.frozen,
      linkPending: !!vc.linkPending, presetKey: vc.presetKey, traceTier: vc.traceTier, targetW: vc.targetWidth, targetH: vc.targetHeight,
      cuts: vc.cuts, low: vc.medium?.uHeightRange?.value?.toArray?.(), camPos: vc.cam?.pos?.toArray?.(), sceneDepthReady: !!vc.sceneDepthReady,
      domeTex: vc.domeMaterial?.uniforms?.tClouds?.value?.name ?? null, skyIntensity: vc.domeMaterial?.uniforms?.uSkyIntensity?.value,
      uHistorySize: vc.domeMaterial?.uniforms?.uHistorySize?.value?.toArray?.(), uTargetSize: vc.domeMaterial?.uniforms?.uTargetSize?.value?.toArray?.(),
      bsmValid: (vc.bsm ?? []).map((c) => !!c.valid) };
    return o;
  }

  window.__BWR_DIAG = async function diag({ heavy = false, recompileProbes = false } = {}) {
    const D = window.__DEBUG, R = D.renderer, S = D.scene, C = D.camera, P = D.post;
    const gl = R.getContext();
    const t0 = performance.now();
    const ms = {};
    const lap = (k, since) => { ms[k] = +(performance.now() - since).toFixed(1); return performance.now(); };
    const out = { at: t0, heavy, phase: D.game?.phase, timeS: D.game?.timeS, mapId: D.game?.mapId, ms };
    out.contextLost = gl.isContextLost();
    out.glError = gl.getError();
    out.events = (window.__BWR?.events ?? []).slice(0, 20);
    out.canvas = { w: R.domElement.width, h: R.domElement.height, css: [R.domElement.clientWidth, R.domElement.clientHeight] };
    out.info = { render: { ...R.info.render }, memory: { ...R.info.memory }, programs: R.info.programs?.length ?? null };
    out.passes = P.composer.passes.map((p) => ({ name: p.constructor?.name, enabled: p.enabled, needsSwap: p.needsSwap, toScreen: !!p.renderToScreen }));
    out.targets = { scene: rtInfo(P.sceneAA.sceneTarget), late: rtInfo(P.lateFx.target), read: rtInfo(P.composer.readBuffer), write: rtInfo(P.composer.writeBuffer) };
    out.post = { taa: P.taaEnabled, msaa: P.msaaSamples, dyn: P.dynScale, perfTrim: P.perfTrim, lightFx: P.lightFx, lateSoftActive: !!P.lateFx.softState?.isActive?.() };
    out.camera = { pos: C.position.toArray(), near: C.near, far: C.far, fov: C.fov, aspect: C.aspect, zoom: C.zoom, layers: C.layers.mask,
      finite: [C.matrixWorld, C.projectionMatrix, C.matrixWorldInverse].every((m) => m.elements.every(Number.isFinite)) };
    const lm = S.userData.lightModel;
    out.lightModel = lm ? Object.fromEntries(Object.entries(lm).filter(([, v]) => typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean')) : null;
    out.renderer = { exposure: R.toneMappingExposure, toneMapping: R.toneMapping, shadows: R.shadowMap.enabled, autoClear: R.autoClear,
      autoClearColor: R.autoClearColor, autoClearDepth: R.autoClearDepth, outputColorSpace: R.outputColorSpace, clearAlpha: R.getClearAlpha(),
      clearColor: (() => { try { const Ctor = S.fog?.color?.constructor; return Ctor ? R.getClearColor(new Ctor()).getHexString() : null; } catch { return null; } })(),
      viewport: (() => { try { return R.getViewport(P.sceneAA.sceneTarget.viewport.clone()).toArray(); } catch { return null; } })(),
      scissor: (() => { try { return R.getScissor(P.sceneAA.sceneTarget.scissor.clone()).toArray(); } catch { return null; } })(),
      scissorTest: R.getScissorTest(), localClipping: R.localClippingEnabled, clippingPlanes: R.clippingPlanes?.length ?? 0,
      currentTarget: R.getRenderTarget()?.texture?.name ?? null };
    out.scene = { environment: S.environment ? (S.environment.name || S.environment.constructor?.name || true) : null,
      environmentIntensity: S.environmentIntensity, background: S.background ? (S.background.isColor ? S.background.getHexString() : (S.background.name || 'texture')) : null,
      backgroundIntensity: S.backgroundIntensity, fog: S.fog ? { type: S.fog.constructor?.name, density: S.fog.density, near: S.fog.near, far: S.fog.far, color: S.fog.color?.getHexString?.() } : null,
      children: S.children.length, userDataKeys: Object.keys(S.userData).slice(0, 60),
      roots: S.children.map((c) => [c.name || c.type, c.visible, c.children.length, c.layers.mask]),
      worldMounted: (() => { try { const w = D.world; return w?.group ? { attached: w.group.parent === S, visible: w.group.visible, mapId: w.mapId } : null; } catch { return null; } })() };
    out.clouds = cloudState(S.userData.volumetricClouds);
    out.glDiag = window.__GL_DIAG ? { rescue: window.__GL_DIAG.rescue ?? null, errors: (window.__GL_DIAG.errors ?? []).slice(0, 8),
      watchdogs: (window.__GL_DIAG.sceneWatchdogs?.rows ?? []).slice(-4).map((r) => ({ status: r.status, phase: r.context?.phase, mapId: r.context?.mapId,
        result: r.result ? { before: r.result.before, after: r.result.after, rescued: r.result.rescued, stage: r.result.stage, failed: r.result.failed } : null })) } : null;

    let tl = lap('basics', t0);
    // the cloud layer's history and Beer shadow maps (cheap: three rows each)
    {
      const vc = S.userData.volumetricClouds;
      const list = [];
      if (vc?.history) vc.history.forEach((rt, i) => list.push([`clouds.history${i}`, rt]));
      (vc?.bsm ?? []).forEach((c, i) => { if (c.target) list.push([`clouds.bsm${i}`, c.target]); });
      if (vc?.farShadeTarget) list.push(['clouds.farShade', vc.farShadeTarget]);
      out.cloudTargets = list.map(([name, rt]) => ({ name, w: rt.width, h: rt.height, read: readRows(R, rt, [0.2, 0.5, 0.8], 4) }));
    }
    tl = lap('cloudTargets', tl);
    if (heavy) {
    // non-finite uniforms and light values
    const bad = [], seen = new Set();
    for (const pass of P.composer.passes) for (const m of materialsOf(pass)) scanMaterial(m, `pass:${pass.constructor?.name}`, bad, seen);
    if (S.userData.volumetricClouds) for (const m of materialsOf(S.userData.volumetricClouds)) scanMaterial(m, 'clouds', bad, seen);
    let meshes = 0;
    S.traverse((o) => {
      if (o.isLight) {
        if (!Number.isFinite(o.intensity) || nonFiniteValue(o.color) || nonFiniteValue(o.position)) bad.push(`light:${o.name || o.type}`);
      }
      if (!o.material || meshes > 6000) return;
      meshes++;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) scanMaterial(m, `mesh:${o.name || o.type}`, bad, seen);
    });
    if (!Number.isFinite(R.toneMappingExposure)) bad.push('renderer.toneMappingExposure');
    if (!Number.isFinite(S.environmentIntensity ?? 1)) bad.push('scene.environmentIntensity');
    // shared uniform bags on scene.userData (the cloud shade the lit materials read, and any other)
    out.sharedUniforms = {};
    for (const [key, bag] of Object.entries(S.userData)) {
      if (!bag || typeof bag !== 'object' || Array.isArray(bag)) continue;
      const entries = Object.entries(bag).filter(([, slot]) => slot && typeof slot === 'object' && 'value' in slot);
      if (!entries.length || entries.length > 40) continue;
      out.sharedUniforms[key] = Object.fromEntries(entries.map(([k, slot]) => {
        const v = slot.value;
        if (nonFiniteValue(v)) bad.push(`userData.${key}.${k}`);
        return [k, v == null ? null : typeof v === 'number' ? v : v.isTexture ? `tex:${v.name || v.uuid?.slice(0, 6)}` : v.toArray ? v.toArray() : String(v).slice(0, 40)];
      }));
    }
    out.nonFinite = bad;
    out.materialsScanned = seen.size;

    // the cloud layer's and the sky's own targets
    const extra = [];
    if (S.userData.volumetricClouds) targetsOf(S.userData.volumetricClouds, 'clouds', extra);
    for (const key of ['atmosphere', 'skyEnvironment', 'horizon', 'sky']) if (S.userData[key]) targetsOf(S.userData[key], key, extra);
    out.extraTargets = extra.slice(0, 16).map(([name, rt]) => ({ name, ...rtInfo(rt), read: readRows(R, rt, [0.2, 0.5, 0.8], 4) }));
    const cloudsTrace = S.userData.volumetricClouds?.trace;
    if (cloudsTrace?.textures?.length > 1) out.extraTargets.push({ name: 'clouds.trace[depth]', read: readRows(R, cloudsTrace, [0.2, 0.5, 0.8], 2, 1) });
    tl = lap('heavyScan', tl);
    }

    // every pass's output on one live frame
    out.passReadback = await new Promise((resolve) => {
      const results = [];
      const restore = [];
      // the camera's layer mask as the forward pass sees it (after the shadow map's routed render returns)
      const shadowMap = R.shadowMap, shadowRender = shadowMap.render;
      const shadowCalls = [];
      shadowMap.render = function (lights, scene, camera) {
        const before = camera.layers.mask;
        const r = shadowRender.apply(this, arguments);
        if (shadowCalls.length < 8) shadowCalls.push({ lights: lights?.length ?? null, before, after: camera.layers.mask, isMain: camera === C });
        return r;
      };
      results.shadowCalls = shadowCalls;
      const composer = P.composer;
      for (const pass of composer.passes) {
        const render = pass.render;
        restore.push([pass, render]);
        pass.render = function (renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
          const r = render.apply(this, arguments);
          try {
            if (!this.enabled) return r;
            let target, where;
            if (this === P.sceneAA) { target = this.sceneTarget; where = 'sceneTarget'; }
            else if (this === P.aerial) { if (this.directColorReadBuffer === writeBuffer) { target = P.lateFx.target; where = 'lateTarget(direct)'; } else { target = writeBuffer; where = 'write'; } }
            else if (this.renderToScreen) { target = null; where = 'screen'; }
            else if (this.needsSwap) { target = writeBuffer; where = 'write'; }
            else { target = readBuffer; where = 'read(noswap)'; }
            results.push({ pass: this.constructor?.name, where, calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
              camMask: C.layers.mask, ...readRows(renderer, target) });
          } catch (error) { results.push({ pass: this.constructor?.name, error: String(error).slice(0, 160) }); }
          return r;
        };
      }
      let frames = 0;
      const finish = () => { for (const [pass, render] of restore) pass.render = render; shadowMap.render = shadowRender;
        resolve({ passes: results, shadowCalls }); };
      const tick = () => {
        if (results.length || frames++ > 30) { finish(); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    tl = lap('passReadback', tl);
    // offscreen probes: the scene alone, then without the cloud dome / the background (and, opt-in, without the
    // environment / the fog: those change every program's key and recompile the scene for seconds)
    if (heavy) {
      const THREE_RT = P.sceneAA.sceneTarget.constructor;
      const probeRt = new THREE_RT(160, 90, { type: HALF, depthBuffer: true });
      const prevTarget = R.getRenderTarget();
      const prevAutoClear = R.autoClear;
      const vc = S.userData.volumetricClouds;
      const variants = [
        ['scene', () => () => {}],
        ['noDome', () => { const v = vc?.dome?.visible; if (vc?.dome) vc.dome.visible = false; return () => { if (vc?.dome) vc.dome.visible = v; }; }],
        ['noBackground', () => { const b = S.background; S.background = null; return () => { S.background = b; }; }],
        ['noLateFxLayer', () => { const m = C.layers.mask; C.layers.disable(30); return () => { C.layers.mask = m; }; }],
        ...(recompileProbes ? [
          ['noEnv', () => { const e = S.environment; S.environment = null; return () => { S.environment = e; }; }],
          ['noFog', () => { const f = S.fog; S.fog = null; return () => { S.fog = f; }; }],
        ] : []),
      ];
      out.probes = {};
      try {
        for (const [name, apply] of variants) {
          const undo = apply();
          try {
            R.setRenderTarget(probeRt);
            R.autoClear = true;
            R.clear();
            R.render(S, C);
            out.probes[name] = readRows(R, probeRt, [0.1, 0.3, 0.5, 0.7, 0.9], 2);
          } catch (error) { out.probes[name] = { error: String(error).slice(0, 160) }; }
          finally { undo(); }
        }
      } finally {
        R.autoClear = prevAutoClear;
        R.setRenderTarget(prevTarget);
        probeRt.dispose();
      }
    }
    if (heavy) lap('probes', tl);
    ms.total = +(performance.now() - t0).toFixed(1);
    out.glErrorAfter = gl.getError();
    return out;
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// one sampling window
// ---------------------------------------------------------------------------------------------------------------------
async function sampleWindow(page, label, meta) {
  const frames = [];
  let firstBlack = null, diag = null, heavyDiag = null, blackCount = 0, suspectCount = 0;
  let prev = null;
  const t0 = Date.now();
  const windowS = meta?.inject ? injectSeconds : seconds;
  const total = Math.round(windowS * 1000 / intervalMs);
  // --drive: a player's input through the window — W held, a steer every 3 s, the cursor sweeping the view
  let steer = null, lastSteerS = -1;
  if (drive) { try { await page.mouse.move(vw / 2, vh / 2); await page.keyboard.down('KeyW'); } catch { /* none */ } }
  for (let i = 0; i < total && Date.now() - t0 < windowS * 1000 + intervalMs; i++) {
    const due = t0 + i * intervalMs;
    const wait = due - Date.now();
    if (wait > 0) await sleep(wait);
    const at = (Date.now() - t0) / 1000;
    if (control && meta?.healthyDiag && !plain) {
      if (at >= 10 && at < 13 && !meta.controlOn) {
        meta.controlOn = true;
        await page.evaluate(() => { const C = window.__DEBUG.camera; window.__bwrControlMask = C.layers.mask; C.layers.mask = 1 << 30; }).catch(() => {});
        log('  control: the camera sees only the late-FX layer (10-13 s)');
      } else if (at >= 13 && meta.controlOn && !meta.controlOff) {
        meta.controlOff = true;
        await page.evaluate(() => { window.__DEBUG.camera.layers.mask = window.__bwrControlMask ?? 1; }).catch(() => {});
      }
    }
    if (drive && Math.floor(at / 3) !== lastSteerS) {
      lastSteerS = Math.floor(at / 3);
      try {
        if (steer) await page.keyboard.up(steer);
        steer = lastSteerS % 3 === 0 ? 'KeyA' : lastSteerS % 3 === 1 ? null : 'KeyD';
        if (steer) await page.keyboard.down(steer);
        await page.mouse.move(vw / 2 + Math.sin(lastSteerS * 1.7) * vw * 0.3, vh / 2 + Math.cos(lastSteerS * 1.1) * vh * 0.08, { steps: 4 });
      } catch { /* none */ }
    }
    let g, st;
    try {
      g = await grab(page);
      st = await page.evaluate(pageState).catch(() => null);
    } catch (error) {
      frames.push({ at, error: String(error?.message ?? error).slice(0, 200) });
      continue;
    }
    // (the fix lane) BLACK-WORLD: at least --zero-frac of the world region exactly zero while the HUD shows (calibrated on
    // the owner's frame, 0.812); near-black past --black-frac but not that is a suspect
    const black = g.zeroFrac >= zeroFracThreshold && st?.hud;
    const suspect = !black && (g.blackFrac > blackFrac || g.blackFrac > suspectFrac) && st?.hud;
    if (meta?.inject && (i === Math.round(2000 / intervalMs) || i === Math.round(5000 / intervalMs))) {
      // lossless evidence for the signature comparison (exact zeros survive a PNG)
      try {
        const png = await page.screenshot({ type: 'png', captureBeyondViewport: false });
        writeFileSync(path.join(out, 'frames', `${label}-t${at.toFixed(2)}-inject.png`), png);
        const img = await loadImage(png);
        const c = createCanvas(img.width, img.height); const cx = c.getContext('2d'); cx.drawImage(img, 0, 0);
        const full = worldStats(cx.getImageData(0, 0, img.width, img.height).data, img.width, img.height);
        log(`  inject evidence t${at.toFixed(2)}: world mean ${full.mean} black ${full.blackFrac} exact-zero ${full.zeroFrac}`);
      } catch (error) { log(`  inject evidence failed: ${error?.message ?? error}`); }
    }
    const ctl = !!(meta?.controlOn && !meta?.controlOff) || !!meta?.inject;
    const row = { at: +at.toFixed(2), mean: g.mean, blackFrac: g.blackFrac, zeroFrac: g.zeroFrac, black: !!black && !ctl, suspect: !!suspect && !ctl, ...(ctl ? { ctl } : {}), st };
    frames.push(row);
    if (ctl) {
      if (black && !meta.controlSeen) { meta.controlSeen = true; log(`  ${meta.inject ? 'injected fault' : 'control'} detected at ${at.toFixed(2)} s (black ${g.blackFrac}, zero ${g.zeroFrac})`); }
      if (meta.inject && i % 4 === 0) writeFileSync(path.join(out, 'frames', `${label}-t${at.toFixed(2)}-inj.jpg`), g.buf);
      prev = { at, buf: g.buf }; continue;
    }
    if (black) blackCount++;
    if (suspect) suspectCount++;
    if ((black || suspect) && blackCount + suspectCount <= 12) {
      let evidence = g.buf;
      try { evidence = (await grab(page, null, true)).buf; } catch { /* the sample stands in */ }
      writeFileSync(path.join(out, 'frames', `${label}-t${at.toFixed(2)}-${black ? 'BLACK' : 'suspect'}.jpg`), evidence);
      if (prev && blackCount + suspectCount === 1) writeFileSync(path.join(out, 'frames', `${label}-t${prev.at.toFixed(2)}-before.jpg`), prev.buf);
    }
    if (i === 0 || i === total - 1 || i % Math.max(1, Math.round(8000 / intervalMs)) === 0) {
      writeFileSync(path.join(out, 'frames', `${label}-t${at.toFixed(2)}.jpg`), g.buf);
    }
    if (black && firstBlack && !heavyDiag && !plain) {
      // still black after the light snapshot: the heavy one (uniform scan, every target, offscreen probes)
      try {
        heavyDiag = await page.evaluate(() => window.__BWR_DIAG({ heavy: true }));
        writeFileSync(path.join(out, `${label}-diag-heavy.json`), `${JSON.stringify(heavyDiag, null, 1)}\n`);
        log(`  heavy diag (${heavyDiag.ms?.total} ms): probes ${Object.entries(heavyDiag.probes ?? {}).map(([k, v]) => `${k}:${v.nan}n/${v.zero}z/${v.lumMean}`).join(' ')}; nonFinite ${JSON.stringify(heavyDiag.nonFinite?.slice(0, 8))}`);
      } catch (error) {
        heavyDiag = { error: String(error?.message ?? error).slice(0, 400) };
        log(`  heavy diag failed: ${heavyDiag.error}`);
      }
    }
    if (black && !firstBlack) {
      firstBlack = row;
      log(`  BLACK-WORLD at ${at.toFixed(2)} s (black ${g.blackFrac}, mean ${g.mean}) ${JSON.stringify(st?.cloud ?? null)}`);
      if (!plain) {
        try {
          diag = await page.evaluate(() => window.__BWR_DIAG({ heavy: false }));
          writeFileSync(path.join(out, `${label}-diag.json`), `${JSON.stringify(diag, null, 1)}\n`);
          log(`  diag: passes ${diag.passReadback?.passes?.map((p) => `${p.pass}:${p.nan}n/${p.zero}z/${p.lumMean}/c${p.calls}/m${p.camMask}`).join(' ')} shadow ${JSON.stringify(diag.passReadback?.shadowCalls ?? null)}`);
          log(`  clouds ${JSON.stringify(diag.clouds ? { vis: diag.clouds.domeVisible, inside: diag.clouds.inside, valid: diag.clouds.historyValid, rebuild: diag.clouds.rebuild } : null)} targets ${diag.cloudTargets?.map((t) => `${t.name}:${t.read.nan}n/${t.read.lumMean}/a${JSON.stringify(t.read.alpha)}`).join(' ')} (${diag.ms?.total} ms)`);
        } catch (error) {
          diag = { error: String(error?.message ?? error).slice(0, 400) };
          log(`  diag failed: ${diag.error}`);
        }
      }
    }
    prev = { at, buf: g.buf };
  }
  if (drive) { try { if (steer) await page.keyboard.up(steer); await page.keyboard.up('KeyW'); } catch { /* none */ } }
  // the scene pass monitor's tally for the battle so far (frame-accurate, between samples too)
  const scenePass = plain ? null : await page.evaluate(() => {
    const m = window.__BWR_SCENE;
    return m ? { frames: m.frames, empty: m.empty, maskBad: m.maskBad, minCalls: Number.isFinite(m.minCalls) ? m.minCalls : null, recent: m.recent.slice(0, 20),
      incomplete: m.incomplete ?? 0, incompleteRows: (m.incompleteRows ?? []).slice(0, 20) } : null;
  }).catch(() => null);
  const zero = await page.evaluate(() => ({ count: window.__BWR?.zeroAllocCount ?? 0, rows: (window.__BWR?.zeroAlloc ?? []).slice(0, 24),
    incompleteRenders: window.__BWR_INCOMPLETE?.incomplete ?? null, renders: window.__BWR_INCOMPLETE?.renders ?? null, incompleteRows: (window.__BWR_INCOMPLETE?.rows ?? []).slice(0, 24),
    tinySizes: (window.__BWR_INCOMPLETE?.tinySizes ?? []).slice(0, 24) })).catch(() => null);
  if (zero?.tinySizes?.length) log(`  TINY canvas/composer sizes: ${zero.tinySizes.length}; first ${JSON.stringify(zero.tinySizes[0])}`);
  if (zero?.incompleteRenders && zero.incompleteRenders !== meta?.incompleteSeen) {
    log(`  RENDER INTO AN INCOMPLETE FRAMEBUFFER: ${zero.incompleteRenders} of ${zero.renders} renders; first ${JSON.stringify(zero.incompleteRows[0])}`);
    writeFileSync(path.join(out, `${label}-incomplete.json`), `${JSON.stringify(zero, null, 1)}\n`);
  }
  if (zero?.count && zero.count !== meta?.zeroSeen) {
    log(`  ZERO-SIZE GPU allocations so far: ${zero.count}; first ${JSON.stringify(zero.rows[0])}`);
    writeFileSync(path.join(out, `${label}-zero-alloc.json`), `${JSON.stringify(zero, null, 1)}\n`);
  }
  if (scenePass?.incomplete) log(`  SCENE TARGET INCOMPLETE on ${scenePass.incomplete} checks; first ${JSON.stringify(scenePass.incompleteRows[0])}`);
  if (scenePass?.empty) log(`  SCENE PASS drew (almost) nothing on ${scenePass.empty} of ${scenePass.frames} battle frames (mask-bad ${scenePass.maskBad}); first ${JSON.stringify(scenePass.recent[0])}`);
  // when nothing went black, one healthy diagnostic for comparison (the first window of a run only)
  let healthyDiag = null;
  if (!firstBlack && !plain && meta?.healthyDiag) {
    try {
      healthyDiag = await page.evaluate(() => window.__BWR_DIAG({ heavy: false }));
      writeFileSync(path.join(out, `${label}-healthy-diag.json`), `${JSON.stringify(healthyDiag, null, 1)}\n`);
    } catch (error) { healthyDiag = { error: String(error?.message ?? error).slice(0, 300) }; }
  }
  // the longest run of consecutive black frames
  let longest = 0, cur = 0, longestStart = null, curStart = null;
  for (const f of frames) {
    if (f.black) { if (!cur) curStart = f.at; cur++; if (cur > longest) { longest = cur; longestStart = curStart; } } else cur = 0;
  }
  return { frames, scenePass, zeroAlloc: zero, blackCount, suspectCount, firstBlackAt: firstBlack?.at ?? null, longestBlackFrames: longest,
    longestBlackS: +(longest * intervalMs / 1000).toFixed(2), longestStart, minMean: Math.min(...frames.filter((f) => f.mean != null).map((f) => f.mean)),
    maxBlackFrac: Math.max(...frames.filter((f) => f.blackFrac != null).map((f) => f.blackFrac)), diag: diag ? `${label}-diag.json` : null,
    heavyDiag: heavyDiag ? `${label}-diag-heavy.json` : null,
    healthyDiag: healthyDiag ? `${label}-healthy-diag.json` : null };
}

// ---------------------------------------------------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------------------------------------------------
const report = path.join(out, 'report.jsonl');
const summary = { tool: 'black-world-repro', zeroFrac: zeroFracThreshold, realEsc, realFocus, gldiag, stressGame: stressGame || null, awayDuringLoadS, awayHidden, awayAtS, plan: scenario === 'session' ? opt('plan', '') : null, garageDwellS, stress, control, preset: preset || 'auto', target, chrome: chromeArg || 'puppeteer', maps, mode, tank: tank || null, drive, times: timesArg, runsPerMap, scenario, seconds, intervalMs, plain, headful,
  viewport: `${vw}x${vh}`, dsf, blackFrac, suspectFrac, blackLuma, startedAt: new Date().toISOString(), runs: [] };
const times = timesArg === 'any' ? ['any'] : timesArg.split(',');

const base = await baseUrl();
baseUrl.cached = base;
log(`target ${base} scenario ${scenario} maps ${maps.join(',')} mode ${mode} times ${timesArg} runs ${runsPerMap} -> ${out}`);
let page = null;
try {
  let index = 0;
  // the steps: cold/warm boot every run; esc/regarage boot once, then Esc-resume or leave-and-re-enter; session follows
  // --plan (enter:<map> boots, esc, leave:<map> leaves to the Garage and enters <map>)
  const steps = [];
  if (scenario === 'session') {
    for (const token of opt('plan', 'enter:badlands,esc,leave:badlands').split(',')) {
      const [action, m] = token.split(':');
      const whole = token.slice(action.length + 1);
      // value steps (preset:<name>, away:<s>, esclong:<s>, inject:<fault> / inject:persist:<fault>:<s>) keep the current map
      if (['preset', 'away', 'awayhidden', 'esclong', 'inject', 'dynflap'].includes(action)) { steps.push({ action, value: action === 'inject' ? whole : m, map: steps.at(-1)?.map ?? maps[0] }); continue; }
      steps.push({ action: action === 'enter' ? 'boot' : action, map: m ?? steps.at(-1)?.map ?? maps[0] });
    }
  } else {
    for (const m of maps) for (let r = 0; r < runsPerMap; r++) {
      const first = !steps.length;
      steps.push({ map: m, r, action: scenario === 'cold' || scenario === 'warm' || first ? 'boot' : scenario === 'esc' ? 'esc' : 'leave' });
    }
  }
  for (const step of steps) {
    {
      const map = step.map, r = step.r ?? index;
      const time = times[index % times.length];
      index++;
      const label = `${String(index).padStart(3, '0')}-${map}-${scenario === 'session' ? step.action : scenario}-${time}`;
      const row = { label, map, time, scenario, action: step.action, startedAt: new Date().toISOString(), load1: +loadavg()[0].toFixed(1) };
      consoleLines.length = 0;
      try {
        // a fresh part when the hold is near its limit (an entry plus a window takes up to ~4 minutes)
        if (holdLeftMs() < 5 * 60_000) {
          if (page) { try { await page.close(); } catch { /* closed */ } page = null; }
          if (browser) { try { await browser.close(); } catch { /* closed */ } browser = null; }
          release();
        }
        await acquire();
        await startStress();
        const continuing = step.action !== 'boot' && page && !page.isClosed();
        if (!continuing) {
          if (scenario === 'cold' || !browser) await launchBrowser(scenario !== 'warm' || !browser);
          if (page) { try { await page.close(); } catch { /* closed */ } }
          page = await newPage(time);
          const b = await boot(page, base);
          Object.assign(row, { boot: b });
          log(`${label}: booted in ${(b.bootMs / 1000).toFixed(1)} s, ${b.version}, ${b.browser}, gpu ${b.gpu}, webdriver ${b.webdriver}, preset ${b.preset}`);
          if (!plain) await page.evaluate(installDiagnostics);
          const t0 = Date.now();
          await selectMapAndBattle(page, map);
          const lift = await enterAndWait(page, map, row);
          row.entryMs = Date.now() - t0; row.lift = lift;
        } else if (step.action === 'tier' || step.action === 'recover') {
          // the live governor's escalation (or its recovery) on demand: the auto tier steps one notch mid-battle and
          // every engine module retargets live (quality.ts reportSustainedOverload / reportSustainedRecovery)
          row.tier = await page.evaluate((up) => {
            const q = window.__DEBUG?.quality;
            const before = q?.resolvePresetName?.();
            const applied = up ? null : q?.reportSustainedOverload?.();
            return { before, applied, after: q?.resolvePresetName?.() };
          }, step.action === 'recover');
          row.action = step.action;
          log(`  ${step.action}: ${JSON.stringify(row.tier)}`);
        } else if (step.action === 'preset') {
          row.tier = await page.evaluate((name) => {
            const q = window.__DEBUG?.quality;
            const before = q?.resolvePresetName?.();
            q?.setPresetName?.(name);
            return { before, set: name, after: q?.resolvePresetName?.() };
          }, step.value);
          row.action = `preset-${step.value}`;
          log(`  preset: ${JSON.stringify(row.tier)}`);
        } else if (step.action === 'away' || step.action === 'awayhidden') {
          await blurAndReturn(page, Number(step.value ?? pauseS), step.action === 'awayhidden');
          row.action = `${step.action}-${step.value ?? pauseS}s`;
        } else if (step.action === 'dynflap') {
          // the governor's resolution steps, forced: the pin walks 1 -> 0.9 -> 0.8 -> 0.667 -> 0.75 -> 1 every
          // --flap-ms through the window (each step reallocates the composer chain, as a live up/down step does)
          row.dynflap = await page.evaluate((ms) => {
            const P = window.__DEBUG.post; const seq = [1, 0.9, 0.8, 0.667, 0.75];
            let i = 0; const seen = new Set();
            window.__bwrFlap = setInterval(() => { P.pinDynScale(seq[i++ % seq.length]); seen.add(+P.dynScale.toFixed(3)); window.__bwrFlapSeen = [...seen]; }, ms);
            return { ms, start: P.dynScale };
          }, Number(step.value ?? 400));
          row.action = `dynflap-${step.value ?? 400}ms`;
        } else if (step.action === 'samplerscan') {
          // every linked program whose sampler uniforms of different texture types sit on one texture unit as last set
          // (a sampler three never binds keeps unit 0): the draws that WebGL drops with 'Two textures of different types
          // use the same sampler location'
          row.samplerScan = await page.evaluate(() => {
            const R = window.__DEBUG.renderer, gl = R.getContext();
            const kind = { [gl.SAMPLER_2D]: '2D', [gl.SAMPLER_2D_SHADOW]: '2D', [gl.INT_SAMPLER_2D]: '2D', [gl.UNSIGNED_INT_SAMPLER_2D]: '2D',
              [gl.SAMPLER_3D]: '3D', [gl.INT_SAMPLER_3D]: '3D', [gl.UNSIGNED_INT_SAMPLER_3D]: '3D',
              [gl.SAMPLER_CUBE]: 'CUBE', [gl.SAMPLER_CUBE_SHADOW]: 'CUBE', [gl.INT_SAMPLER_CUBE]: 'CUBE', [gl.UNSIGNED_INT_SAMPLER_CUBE]: 'CUBE',
              [gl.SAMPLER_2D_ARRAY]: '2DARRAY', [gl.SAMPLER_2D_ARRAY_SHADOW]: '2DARRAY', [gl.INT_SAMPLER_2D_ARRAY]: '2DARRAY', [gl.UNSIGNED_INT_SAMPLER_2D_ARRAY]: '2DARRAY' };
            const progs = R.info.programs ?? [];
            const conflicts = [];
            let scanned = 0;
            for (const p of progs) {
              const prog = p.program; if (!prog) continue;
              scanned++;
              const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
              const byUnit = new Map();
              for (let i = 0; i < n; i++) {
                const info = gl.getActiveUniform(prog, i);
                const k = kind[info?.type]; if (!k) continue;
                for (let e = 0; e < Math.max(1, info.size); e++) {
                  const name = info.size > 1 ? info.name.replace(/\[0\]$/, '') + `[${e}]` : info.name;
                  const loc = gl.getUniformLocation(prog, name); if (!loc) continue;
                  const unit = gl.getUniform(prog, loc);
                  if (!byUnit.has(unit)) byUnit.set(unit, []);
                  byUnit.get(unit).push(`${name}:${k}`);
                }
              }
              for (const [unit, list] of byUnit) {
                const kinds = new Set(list.map((x) => x.split(':').pop()));
                if (kinds.size > 1 && conflicts.length < 40) conflicts.push({ program: p.name, id: p.id, unit, samplers: list, usedTimes: p.usedTimes });
              }
            }
            return { scanned, conflicts };
          });
          log(`  samplerscan: ${row.samplerScan.scanned} programs, ${row.samplerScan.conflicts.length} with mixed-type samplers on one unit: ${JSON.stringify(row.samplerScan.conflicts.slice(0, 8))}`);
          writeFileSync(path.join(out, `${label}-samplerscan.json`), `${JSON.stringify(row.samplerScan, null, 1)}\n`);
          row.action = 'samplerscan';
        } else if (step.action === 'inject' && /^(layers|roots|override|passes|control|viewport1|nancloud|nanscene|persist:)/.test(step.value)) {
          // (the fix lane) a fault applied once (or every frame for its seconds); the black-world guard must find and heal it
          row.inject = await page.evaluate(injectOnce, step.value);
          row.action = `inject-${step.value.replaceAll(':', '-')}`;
          log(`  inject ${step.value}: ${JSON.stringify(row.inject)}`);
        } else if (step.action === 'inject') {
          // a mechanism test: the named fault held for --inject-seconds while the window samples (never a natural frame)
          row.inject = await page.evaluate(injectFault, step.value);
          row.action = `inject-${step.value}`;
          log(`  inject ${step.value}: ${JSON.stringify(row.inject)}`);
        } else if (step.action === 'esclong') {
          if (realEsc) row.escape = await realEscape(page, Number(step.value ?? 30));
          else {
            await page.keyboard.press('Escape');
            await sleep(Number(step.value ?? 30) * 1000);
            const resumed = await page.evaluate(() => { const b = document.querySelector('.cot-set-btn.resume'); if (b && b.offsetParent !== null) { b.click(); return true; } return false; });
            if (!resumed) await page.keyboard.press('Escape');
            await sleep(300);
          }
          row.action = `${realEsc ? 'realesc' : 'esc'}-${step.value ?? 30}s-resume`;
        } else if (step.action === 'esc') {
          row.escape = await pauseAndResume(page);
          row.action = realEsc ? 'realesc-resume' : 'esc-resume';
        } else if (step.action === 'blur') {
          await blurAndReturn(page);
          row.action = 'blur-return';
        } else if (step.action === 'escblur') {
          // Esc (the pause menu, pointer lock released), the window away, back, Resume
          await page.keyboard.press('Escape');
          await blurAndReturn(page);
          await page.evaluate(() => { const b = document.querySelector('.cot-set-btn.resume'); if (b && b.offsetParent !== null) b.click(); });
          await sleep(300);
          row.action = 'esc-blur-resume';
        } else {
          await leaveToGarage(page);
          const t0 = Date.now();
          await selectMapAndBattle(page, map);
          const lift = await enterAndWait(page, map, row);
          row.entryMs = Date.now() - t0; row.lift = lift; row.action = 'leave-reenter';
        }
        row.entry = await page.evaluate(() => {
          const D = window.__DEBUG;
          const lm = D?.scene?.userData?.lightModel;
          return D ? { mapId: D.game?.mapId, gameMode: D.game?.gameMode, phase: D.game?.phase, night: lm ? +(+lm.night).toFixed(2) : null,
            sky: D.scene?.userData?.skyPreset ?? D.game?.skyPreset ?? null, tanks: D.game?.tanks?.length ?? null,
            player: D.game?.player?.specId ?? null } : null;
        }).catch(() => null);
        log(`${label}: in battle after ${((row.entryMs ?? 0) / 1000).toFixed(1)} s ${JSON.stringify(row.entry)}`);
        const incidentsAtStart = step.action === 'inject' ? null
          : await page.evaluate(() => (window.__GL_DIAG?.blackWorld ?? []).length).catch(() => null);
        const w = await sampleWindow(page, label, { healthyDiag: r === 0 && step.action !== 'inject', inject: step.action === 'inject' });
        if (step.action === 'inject') {
          row.guardHeal = await page.evaluate(guardReceiptsSince).catch((e) => ({ error: String(e) }));
          const first = row.guardHeal?.receipts?.[0];
          log(`  guard after ${step.value}: ${first ? `${first.class} healed by ${first.healedBy}, world back after ${first.healedAfterMs} ms, confirmed after ${first.confirmedAfterMs} ms (opened +${first.openedAfterMs} ms, rungs ${first.steps.join(' ')}${first.repeats ? `, H1 x${first.repeats}` : ''})` : 'no incident'}; tiny sizes ${row.guardHeal?.tinySizes}; pass errors ${row.guardHeal?.passErrors?.length ?? 0}`);
          row.injectUndo = await page.evaluate(() => { try { return window.__bwrUndo?.() ?? null; } catch (e) { return String(e); } });
        }
        if (step.action === 'dynflap') {
          row.dynflap.seen = await page.evaluate(() => { clearInterval(window.__bwrFlap); window.__DEBUG.post.pinDynScale(null); return window.__bwrFlapSeen ?? null; });
          log(`  dynflap scales seen ${JSON.stringify(row.dynflap.seen)}`);
        }
        Object.assign(row, w);
        row.guard = await page.evaluate(() => {
          const g = window.__COT_BLACK_GUARD;
          const ring = window.__GL_DIAG?.blackWorld ?? [];
          return { installed: !!g, stats: g ? g.stats() : null, total: ring.length, incidents: ring.length,
            receipts: ring.slice(-4).map((r) => ({ class: r.class, healedBy: r.healedBy, steps: r.steps.map((x) => x.step), healMs: r.healMs,
              sinceRevealMs: r.sinceRevealMs, cpu: r.cpu, probe: r.probe, roots: r.roots, target: r.target, gl: r.gl, state: r.state, warm: r.warm })) };
        }).catch(() => null);
        // a natural row counts only the receipts opened while it ran (a session's earlier injections are not its own)
        if (row.guard && incidentsAtStart !== null) row.guard.incidents = Math.max(0, row.guard.total - incidentsAtStart);
        if (row.guard && step.action === 'inject') row.guard.incidents = 0;
        if (row.guard?.incidents && step.action !== 'inject') log(`  GUARD INCIDENTS on a natural run: ${JSON.stringify(row.guard.receipts.map((r) => [r.class, r.healedBy]))}`);
        if (realEsc && row.escape) log(`  real Esc: ${JSON.stringify(row.escape)}`);
        row.verdict = w.blackCount ? 'BLACK-WORLD' : w.suspectCount ? 'suspect' : 'ok';
        row.events = await page.evaluate(() => (window.__BWR?.events ?? []).slice(0, 20)).catch(() => null);
      } catch (error) {
        row.verdict = 'harness-error';
        row.error = String(error?.stack ?? error).slice(0, 600);
        log(`${label}: harness error ${row.error.split('\n')[0]}`);
        try { if (page) writeFileSync(path.join(out, 'frames', `${label}-error.jpg`), await page.screenshot({ type: 'jpeg', quality: 70 })); } catch { /* gone */ }
        if (page) { try { await page.close(); } catch { /* closed */ } page = null; }
      }
      row.console = consoleLines.filter((l) => !/\[(perf|trace)\]|Canvas2D: Multiple readback/.test(l.text)).slice(0, 120);
      const { frames, ...brief } = row;
      appendFileSync(report, `${JSON.stringify(row)}\n`);
      summary.runs.push(brief);
      writeFileSync(path.join(out, 'summary.json'), `${JSON.stringify(summary, null, 1)}\n`);
      log(`${label}: ${row.verdict} black ${row.blackCount ?? '-'} suspect ${row.suspectCount ?? '-'} first ${row.firstBlackAt ?? '-'} longest ${row.longestBlackS ?? '-'} s minMean ${row.minMean ?? '-'} maxBlackFrac ${row.maxBlackFrac ?? '-'}`);
      if (scenario === 'cold') { try { await browser?.close(); } catch { /* closed */ } browser = null; page = null; }
    }
  }
} finally {
  try { await browser?.close(); } catch { /* closed */ }
  await stopStress();
  release();
  await viteServer?.close();
  for (const dir of ownTemp) trashOwnTemp(dir);
  summary.finishedAt = new Date().toISOString();
  const counts = {};
  for (const r of summary.runs) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
  summary.counts = counts;
  writeFileSync(path.join(out, 'summary.json'), `${JSON.stringify(summary, null, 1)}\n`);
  log(`done: ${JSON.stringify(counts)} -> ${out}`);
}
