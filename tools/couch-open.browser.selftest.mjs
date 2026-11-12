#!/usr/bin/env node
// A real press on Couch keeps the couch lobby open (272). Live 271: Kevin, "when i press couch the window instantly
// disappears". A real press focuses the Couch button inside the Deploy screen; the lobby's modal then takes the focus on
// its close button, and Deploy's focusout closer read that as the focus leaving Deploy: it closed Deploy, and the surface
// stack took the lobby (a surface standing on Deploy) with it. A script click (button.click(), the couch end to end's)
// gives the button no focus, so it never saw this. Here every press is the browser's own input (CDP mouse or touch: the
// pointer, mouse and click events a player's press makes, and the focus move): at each size the Garage boots, Deploy opens
// with a real press, Couch is pressed, and after the lobby has taken the focus both the lobby and Deploy are still open.
// The class reaches any surface opened from inside Deploy whose box is outside it: an info dossier opened from Deploy is
// pressed the same way when the screen offers one. 1200x819 also holds the Couch button to a real box (live 271 drew it
// 0x0 there). A wait that times out above 3 per core of 1-min load exits STARVED (tools/selftest-verdict.mjs), never a red.
//   node tools/couch-open.browser.selftest.mjs [--url=http://127.0.0.1:5173] [--sizes=1920x1080,1200x819,390x844t]
//     [--out=<dir for the frames after each press>]
// A size ending in t is a phone (touch, mobile). Takes the shared capture lock (render class, under 20 minutes): the
// manual `ui` suite's (npm run test:heavy -- ui). Exit 1 on any size the lobby does not stay open at. First-party
// tooling: Kevin B. Liu.
import http from 'node:http';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { openCaptureHold } from './capture-hold.mjs';
import { readinessExpression } from './game-readiness.mjs';
import { machineLoad, SELFTEST_STARVED_EXIT } from './selftest-verdict.mjs';
import { createLocalPadService } from '../server/rooms/localPadService.ts';

const option = (name, fallback = '') => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
let base = option('url').replace(/\/$/, '');
const outDir = option('out') ? resolve(option('out')) : null;
if (outDir) mkdirSync(outDir, { recursive: true });
const SIZES = option('sizes', '1920x1080,1200x819,390x844t').split(',').map((text) => {
  const touch = text.endsWith('t');
  const [width, height] = text.replace(/t$/, '').split('x').map(Number);
  return { name: text, touch, viewport: { width, height, deviceScaleFactor: touch ? 3 : 1, isMobile: touch, hasTouch: touch } };
});
const PHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// the lobby's pairing service, in process (the couch end to end's): the lobby opens with its code, as it does live
const padServer = http.createServer();
const pads = createLocalPadService({ connectLimit: 40 });
padServer.on('upgrade', (request, socket, head) => { if (!pads.handleUpgrade(request, socket, head)) socket.destroy(); });
await new Promise((done) => padServer.listen(0, '127.0.0.1', done));
const padService = `ws://127.0.0.1:${padServer.address().port}`;
const BOOT_QUERY = `nosplash=1&gfxreset=1&telemetry=off&padService=${encodeURIComponent(padService)}`;

const hold = await openCaptureHold({ label: 'couch-open.browser.selftest', timeoutMs: 60 * 60 * 1000, lockClass: 'render', holdCapMinutes: 18 });
let server = null, cacheDir = null;
if (!base) {
  const { createServer } = await import('vite');
  cacheDir = mkdtempSync(join(tmpdir(), 'cot-couch-open-vite-'));
  server = await createServer({ root: process.cwd(), logLevel: 'error', cacheDir,
    server: { host: '127.0.0.1', port: 7500 + (process.pid % 90), strictPort: false, hmr: false, watch: null } });
  await server.listen();
  base = server.resolvedUrls.local[0].replace(/\/$/, '');
}
let starved = null;
const wait = async (page, predicate, label, timeout, ...args) => {
  try { await page.waitForFunction(predicate, { timeout, polling: 100 }, ...args); } catch (error) {
    const load = machineLoad();
    if (load.starved) starved ??= `${label} at 1-min load ${load.load1} on ${load.cores} cores`;
    throw new Error(`${load.starved ? 'STARVED: ' : ''}${label}: ${error.message}`);
  }
};

/** The center of the first shown match of `selector` (a laid-out box), or null. */
const shownBox = (page, selector) => page.evaluate((sel) => {
  for (const node of document.querySelectorAll(sel)) {
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && node.checkVisibility({ visibilityProperty: true, opacityProperty: true })) {
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height };
    }
  }
  return null;
}, selector);

/** A real press (the browser's own input): touch on a phone, else the mouse (move, down, up: pointerdown, mousedown, the
 *  focus, pointerup, mouseup, click). */
async function press(page, size, box) {
  if (size.touch) await page.touchscreen.tap(box.x, box.y);
  else {
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await sleep(60);
    await page.mouse.up();
  }
}

const state = (page) => page.evaluate(() => ({
  lobby: !!document.querySelector('.cot-modal-root.is-open .cot-couch-modal'),
  code: document.querySelector('.cot-couch-code')?.textContent ?? '',
  deploy: !!document.querySelector('.cot-battle-menu.open'),
  surfaces: [...(window.__cotSurfaces?.() ?? [])],
  focus: document.activeElement?.closest('.cot-modal') ? 'modal' : document.activeElement?.closest('.cot-battle-menu') ? 'deploy' : document.activeElement?.tagName ?? null,
}));

const results = [];
const browser = await launchGuardedBrowser(puppeteer, { headless: true, protocolTimeout: 900_000,
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--hide-scrollbars', '--no-sandbox'] }, { label: 'couch-open' });
try {
  for (const size of SIZES) {
    // between sizes the hold may yield to the queue past its cap (capture-hold checkpoint)
    if (results.length) await hold.checkpoint();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const result = { size: size.name, input: size.touch ? 'touch' : 'mouse', checks: [], errors };
    const check = (name, ok, detail = '') => result.checks.push({ name, ok: !!ok, detail });
    try {
      if (size.touch) await page.setUserAgent(PHONE_UA);
      await page.setViewport(size.viewport);
      await page.goto(`${base}/?${BOOT_QUERY}${size.touch ? '' : '&tier=desktop'}`, { waitUntil: 'domcontentloaded', timeout: 600_000 });
      await wait(page, readinessExpression('garage'), `${size.name}: the Garage`, 600_000);
      // Deploy, opened as a player opens it: the Garage's own Deploy entry (the phone's tab, the rail's Deploy, the head's)
      const entry = await shownBox(page, '.cot-tabbar [data-tabbar="deploy"], [data-nav="deploy"], .cot-battle-mode');
      if (!entry) throw new Error('no shown Deploy entry in the Garage');
      await press(page, size, entry);
      await wait(page, () => document.querySelector('.cot-battle-menu.open [data-battle-couch]')?.getClientRects().length > 0,
        `${size.name}: Deploy and its Couch button`, 60_000);
      await sleep(700); // the screen's entrance and its mode picker's focus
      const couch = await shownBox(page, '.cot-battle-menu.open [data-battle-couch]');
      check('the Couch button has a real box', couch && couch.width >= 24 && couch.height >= 24,
        couch ? `${Math.round(couch.width)}x${Math.round(couch.height)}` : '0x0 or hidden');
      if (!couch) throw new Error('the Couch button is not shown');
      await press(page, size, couch);
      const frames = [];
      const shoot = async (tag) => { if (outDir) await page.screenshot({ path: join(outDir, `${size.name}-${tag}.png`) }); };
      // the lobby opens once its chunk is here, then takes the focus a frame later: watch it through that and well past
      await wait(page, () => !!document.querySelector('.cot-modal-root.is-open .cot-couch-modal') || !document.querySelector('.cot-battle-menu.open'),
        `${size.name}: the lobby after the press`, 60_000);
      frames.push({ at: 'opened', ...(await state(page)) });
      await shoot('a-opened');
      for (const ms of [150, 600, 1500]) {
        await sleep(ms - (frames.length > 1 ? [150, 600, 1500][frames.length - 2] : 0));
        frames.push({ at: `+${ms}ms`, ...(await state(page)) });
      }
      await shoot('b-after');
      result.frames = frames;
      const last = frames.at(-1);
      check('the lobby opens and stays open after a real press', frames.every((frame) => frame.lobby),
        frames.map((frame) => `${frame.at}:${frame.lobby ? 'open' : 'closed'}`).join(' '));
      check('Deploy stays open under the lobby', last.deploy, last.surfaces.join(' > '));
      check('the lobby holds the focus', last.focus === 'modal', String(last.focus));
      await wait(page, () => /^[A-Z0-9]{3} [A-Z0-9]{3}$/.test(document.querySelector('.cot-couch-code')?.textContent ?? ''),
        `${size.name}: the lobby's code`, 30_000).then(() => check('the lobby shows its code', true), (error) => check('the lobby shows its code', false, error.message.slice(0, 120)));
      // closing the lobby (its own close, a real press) gives Deploy back, still open
      const close = await shownBox(page, '.cot-modal-root.is-open .cot-couch-modal .cot-modal__close');
      if (close) {
        await press(page, size, close);
        await sleep(500);
        const after = await state(page);
        check('the lobby\'s close returns to Deploy', !after.lobby && after.deploy, after.surfaces.join(' > ') || 'nothing open');
      } else check('the lobby\'s close returns to Deploy', false, 'no shown close');
      // the same class: an info dossier (a body-level modal) opened from inside Deploy, when the screen shows one
      const info = await shownBox(page, '.cot-battle-menu.open .cot-context-info-trigger, .cot-battle-menu.open [data-context-info]');
      if (info) {
        await press(page, size, info);
        await sleep(1200);
        const after = await state(page);
        const dossier = await page.evaluate(() => [...document.querySelectorAll('.cot-modal-root.is-open')].length > 0);
        check('an info dossier opened from Deploy stays open', dossier && after.deploy, after.surfaces.join(' > '));
      }
    } catch (error) {
      check('the run', false, error.message.slice(0, 400));
    } finally {
      await page.close().catch(() => {});
    }
    results.push(result);
  }
} finally {
  await browser.close();
  await hold?.release();
  await server?.close();
  padServer.close();
  if (cacheDir) rmSync(cacheDir, { recursive: true, force: true });
}
const failures = [];
for (const result of results) {
  for (const { name, ok, detail } of result.checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${result.size} (${result.input}) ${name}${detail ? `: ${detail}` : ''}`);
    if (!ok) failures.push(`${result.size}: ${name}`);
  }
  if (result.errors.length) failures.push(`${result.size}: ${result.errors.length} page error(s): ${result.errors[0].slice(0, 160)}`);
}
if (starved && failures.length) {
  console.log(`couch-open: STARVED (${starved}): re-run on a quieter machine`);
  process.exit(SELFTEST_STARVED_EXIT);
}
console.log(`couch-open: ${failures.length ? `FAIL (${failures.join('; ')})` : 'PASS'} at ${SIZES.map((s) => s.name).join(', ')}`);
process.exit(failures.length ? 1 : 0);
