// gunship-lens-strip.browser.mjs — frame strips of the AC-130's guns firing, seen from the pilot's own gimbal lens
// (lane ac130-barrels-230, 2026-10-21; the owner: the guns sit "behind" the camera, their barrels visible so we see
// them fire and recoil, and the tracers, missile trace and smoke come from behind the camera).
//
// Over built dists (`npm run build`), under the shared capture lock (normal band; `--stamp=<ms>` takes a
// coordinator-issued ticket for one hold). A run is one or more builds, each `tag:dist:views:lenses` (views
// desktop|phone, lenses daylight|infrared|thermal|night, joined by +). Per build and viewport one battle (Verdant, the
// AC-130 mode); per lens (switched in the page by its own key) each gun fires (a 30 mm burst, one 152 mm, one missile)
// on a manual clock: the page's requestAnimationFrame and performance.now step 1/60 s at a time, so frame N of a strip
// is the same instant on every build. Frames land in `--out=<dir>` (default .qa-dev/gunship-lens) as
// <tag>-<view>-<lens>-<gun>-f<N>.png beside <tag>-manifest.json. `--soft` renders on SwiftShader without the lock (a
// smoke test of the harness, never a verdict frame).
//   node tools/gunship-lens-strip.browser.mjs --runs=base:dist-base:desktop+phone:daylight+thermal [--stamp=<ms>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { preview } from 'vite';
import puppeteer from 'puppeteer';
import { createCaptureLock, ticketAt } from './capture-lock.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const out = resolve(arg('out', '.qa-dev/gunship-lens'));
const stamp = Number(arg('stamp', '0'));
const soft = process.argv.includes('--soft');
const only = arg('guns', 'cannon,howitzer,missile').split(',');
const VIEWS = { desktop: { width: 1280, height: 800 }, phone: { width: 844, height: 390, isMobile: true, hasTouch: true } };
/** each gun: its slot, how long the trigger is held (frames), and the frames of its strip after the trigger */
const GUNS = [
  { gun: 'cannon', slot: 0, holdF: 20, frames: [1, 2, 3, 5, 8, 12, 18, 26] },
  { gun: 'howitzer', slot: 1, holdF: 2, frames: [1, 2, 4, 7, 11, 16, 24, 40] },
  { gun: 'missile', slot: 2, holdF: 2, frames: [1, 4, 10, 18, 28, 40, 55, 75] },
].filter((g) => only.includes(g.gun));
const runs = arg('runs', 'run:dist:desktop:daylight').split(',').map((spec) => {
  const [tag, dist, views, lenses] = spec.split(':');
  return { tag, dist: resolve(dist), views: (views ?? 'desktop').split('+'), lenses: (lenses ?? 'daylight').split('+') };
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** a hold ends by this (ms after the lock): builds not yet started are skipped (house rule: holds <= 20 min) */
const HOLD_MS = Number(arg('hold-ms', String(19 * 60 * 1000)));
let heldAt = Date.now();
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}] gunship-lens-strip:`, ...a);
mkdirSync(out, { recursive: true });

/** the page's clock, stepped by hand while a strip runs (installed before any page script) */
function manualClock() {
  const realRaf = window.requestAnimationFrame.bind(window), realNow = performance.now.bind(performance);
  let manual = false, offset = 0, frozen = 0, queue = [];
  performance.now = () => (manual ? frozen : realNow() - offset);
  window.requestAnimationFrame = (cb) => {
    if (manual) { queue.push(cb); return queue.length; }
    return realRaf((t) => cb(manual ? frozen : t - offset));
  };
  window.__lensClock = {
    hold() { frozen = realNow() - offset; manual = true; },
    release() {
      offset = realNow() - frozen; manual = false;
      const q = queue; queue = [];
      for (const cb of q) realRaf((t) => cb(t - offset));
    },
    step(n, ms = 1000 / 60) {
      for (let i = 0; i < n; i++) {
        frozen += ms;
        const q = queue; queue = [];
        for (const cb of q) cb(frozen);
      }
    },
  };
}

async function setLens(page, lens) {
  for (let i = 0; i < 5; i++) {
    const view = await page.evaluate(() => document.querySelector('.cot-flight-hud')?.dataset.view ?? null);
    if (view === lens) return true;
    await page.keyboard.press('KeyI');
    await sleep(500);
  }
  return false;
}

async function filmBuild(run, manifest) {
  const server = await preview({ root: process.cwd(), configFile: false, logLevel: 'error', build: { outDir: run.dist },
    preview: { host: '127.0.0.1', port: 5400 + (process.pid % 80), strictPort: false } });
  const port = server.httpServer.address().port;
  const args = ['--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage',
    ...(soft ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-gl=angle'])];
  const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, args,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  try {
    for (const viewName of run.views) {
      if (Date.now() - heldAt > HOLD_MS * 0.55) { log(`${run.tag} ${viewName}: skipped (the hold is nearly over)`); continue; }
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
      await page.setViewport({ deviceScaleFactor: 1, ...VIEWS[viewName] });
      await page.evaluateOnNewDocument(manualClock);
      await page.evaluateOnNewDocument((v) => { try { localStorage.setItem('cot.aerialVision', v); } catch { /* optional */ } }, run.lenses[0]);
      const tier = viewName === 'phone' ? 'mobile' : 'desktop';
      const t0 = Date.now();
      await page.goto(`http://127.0.0.1:${port}/?nosplash=1&tier=${tier}&gfxreset=1`, { waitUntil: 'domcontentloaded', timeout: 600000 });
      try { await page.waitForFunction('window.__GAME_READY === true', { timeout: 600000, polling: 1000 }); }
      catch (error) { await page.screenshot({ path: resolve(out, `${run.tag}-${viewName}-boot-failure.png`) }); log('boot failed', errors.slice(0, 5)); throw error; }
      log(`${run.tag} ${viewName} game ready in ${Math.round((Date.now() - t0) / 1000)} s`);
      await page.evaluate(() => { setTimeout(() => window.__DEBUG.beginSoloBattle({ specId: 'm1a1_abrams_hc', mapId: 'verdant', gameMode: 'ac130' }), 0); });
      await page.waitForFunction('window.__DEBUG.game.phase === "battle" && window.__DEBUG.game.preBattleS <= 0', { timeout: 900000, polling: 1000 });
      log(`${run.tag} ${viewName} battle up in ${Math.round((Date.now() - t0) / 1000)} s`);
      await sleep(2500);
      // the lens guns draw with the airframe's program (its covered compile serves them: no first-use compile mid-battle)
      const programs = await page.evaluate(() => {
        const D = window.__DEBUG, scene = D.fx?.group?.parent ?? null, r = D.renderer;
        const lensMat = scene?.getObjectByName('ac130-lens-cannon-barrel')?.material ?? null;
        const airMat = scene?.getObjectByName('ac130-airframe-body')?.material ?? null;
        const prog = (m) => (m && r?.properties?.get(m)?.currentProgram) || null;
        return { lens: !!lensMat, lensVisible: !!scene?.getObjectByName('AC-130 lens guns')?.visible, airframe: !!airMat,
          sameProgram: !!prog(lensMat) && prog(lensMat) === prog(airMat), lensProgram: prog(lensMat)?.id ?? null,
          airProgram: prog(airMat)?.id ?? null, programs: r?.info?.programs?.length ?? null };
      });
      log(`${run.tag} ${viewName} programs`, JSON.stringify(programs));
      manifest.programs = [...(manifest.programs ?? []), { view: viewName, ...programs }];
      for (const lens of run.lenses) {
        // a lens's three strips take a few minutes under load: none starts that the hold cannot finish
        if (Date.now() - heldAt > HOLD_MS * 0.8) { log(`${run.tag} ${viewName} ${lens}: skipped (the hold is nearly over)`); continue; }
        if (!(await setLens(page, lens))) log(`${run.tag} ${viewName}: the lens did not reach ${lens}`);
        await sleep(800);
        for (const g of GUNS) {
          await page.evaluate((slot) => window.__DEBUG.input.tapVirtual(`shell${slot + 1}`), g.slot);
          await page.waitForFunction((slot) => window.__DEBUG.game.player.combat.shellSlot === slot, { timeout: 30000 }, g.slot);
          // the gun ready (its reload done) before the strip's clock starts
          await page.waitForFunction((slot) => { const r = window.__DEBUG.game.player.combat.reloadChannels?.[slot]; return !r || !(r.t > 0); },
            { timeout: 30000, polling: 200 }, g.slot).catch(() => {});
          await sleep(300);
          await page.evaluate(() => { window.__lensClock.hold(); window.__lensShots0 = window.__DEBUG.game.nextShellId; window.__DEBUG.flags.forceFire = true; });
          let f = 0;
          for (const at of g.frames) {
            if (f < g.holdF && at >= g.holdF) {
              await page.evaluate((a, b) => { window.__lensClock.step(a); window.__DEBUG.flags.forceFire = false; window.__lensClock.step(b); }, g.holdF - f, at - g.holdF);
            } else await page.evaluate((k) => window.__lensClock.step(k), at - f);
            f = at;
            const name = `${run.tag}-${viewName}-${lens}-${g.gun}-f${String(at).padStart(2, '0')}.png`;
            await page.screenshot({ path: resolve(out, name) });
            manifest.frames.push({ name, tag: run.tag, view: viewName, lens, gun: g.gun, frame: at });
          }
          const fired = await page.evaluate((rest) => {
            if (rest > 0) window.__lensClock.step(rest);
            window.__DEBUG.flags.forceFire = false;
            const n = window.__DEBUG.game.nextShellId - window.__lensShots0;
            window.__lensClock.release();
            return n;
          }, Math.max(0, g.holdF - f));
          log(`${run.tag} ${viewName} ${lens} ${g.gun}: ${fired} round(s)`);
          manifest.frames.at(-1).fired = fired;
          await sleep(g.gun === 'missile' ? 3000 : 1200);
        }
      }
      if (errors.length) log('page errors', errors.slice(0, 5));
      manifest.errors.push(...errors);
      await page.close();
    }
  } finally {
    await browser.close().catch(() => {});
    await new Promise((r) => server.httpServer.close(() => r()));
  }
}

const lock = soft ? null : createCaptureLock();
let heartbeat;
try {
  if (lock) {
    await lock.acquire(4 * 60 * 60 * 1000, stamp > 0 ? { ticket: ticketAt(stamp) } : {});
    heartbeat = setInterval(() => lock.refresh(), 30000);
    log('acquired GPU slot', new Date().toISOString());
  }
  heldAt = Date.now();
  for (const run of runs) {
    if (Date.now() - heldAt > HOLD_MS * 0.55) { log(`${run.tag}: skipped (the hold is ${Math.round((Date.now() - heldAt) / 60000)} min old)`); continue; }
    const manifest = { tag: run.tag, dist: run.dist, soft, frames: [], errors: [] };
    await filmBuild(run, manifest);
    writeFileSync(resolve(out, `${run.tag}-manifest.json`), JSON.stringify(manifest, null, 2));
    log(`${run.tag}: ${manifest.frames.length} frames in ${out}`);
  }
} finally { clearInterval(heartbeat); lock?.release(); log('released', new Date().toISOString()); }
