#!/usr/bin/env node
// The battle HUD never measures a box to size the thing that sizes it (266, after the 265 roster thrash: the owner's "find
// any other potential frontend / layout / ui / game ui issues"). Copyright © 2026 Kevin B. Liu. First-party tool; see
// NOTICE.md.
//
// On the HUD layout fixture (tools/fixtures/battle-hud-layout.html), at touch and desktop windows:
// - status: four statuses up (fire, tracks, engine, crew), the strip shows every chip its room fits (its damage panel less
//   --status-room-inset, at a chip's own width). On touch it hugs its chips, so a capacity read from its own width held
//   two and a "+3" whatever the room. Wider, it still keeps the dock's 8 px off the joystick and covers no control.
// - bars: the hull bars over the tanks (?state=markers) keep their widths across four relabels back to their names and a
//   short-band toggle. The vehicle line stretched to the bar read back the width it had been given, 14 px more at every
//   measure, up to 280.
// - idle: at rest nothing on the page rewrites an attribute (2 s watched, 3 writes of one attribute on one element fail).
//   The resume veil's 150 ms sweep rewrote its class seven times a second.
// --negative-control puts the mechanisms back in the page (the vehicle line stretched, and a 150 ms sweep removing an
// absent class) and must see both: it exits 1 when bars or idle pass.
//   node tools/hud-self-measure.browser.selftest.mjs [--url=http://127.0.0.1:5173] [--negative-control] [--sizes=844x390t,1920x1080]
// Takes the shared capture lock (render class); with no --url it serves this checkout on its own vite server and cache.
// The manual `ui` suite's (npm run test:heavy -- ui).
import puppeteer from 'puppeteer';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { acquireCaptureLock, refreshCaptureLock, releaseCaptureLock } from './capture-lock.mjs';

const option = (name, fallback = '') => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
let base = option('url').replace(/\/$/, '');
const negative = process.argv.includes('--negative-control');
const SIZES = option('sizes', '844x390t,390x844t,568x320t,1180x820t,1920x1080,1280x720').split(',').map((s) => {
  const touch = s.endsWith('t');
  const [width, height] = s.replace(/t$/, '').split('x').map(Number);
  return { name: s, width, height, touch };
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** In the page: n HUD frames, each after a paint. */
const frames = (n) => new Promise((done) => {
  const { frame, hud } = window.__HUD_LAYOUT;
  let left = n;
  const step = () => { hud.update(frame); if (--left > 0) requestAnimationFrame(step); else requestAnimationFrame(() => done()); };
  requestAnimationFrame(step);
});

/** In the page: the strip with four statuses up, against its room and its neighbours. */
const statusProblems = async () => {
  const { frame } = window.__HUD_LAYOUT;
  const combat = frame.player.combat;
  combat.fire.burning = true;
  combat.modules.trackL.state = 'red';
  combat.modules.engine.state = 'red';
  combat.crew[Object.keys(combat.crew)[0]] = false;
  await window.__frames(8);
  await new Promise((r) => setTimeout(r, 300));
  await window.__frames(4);
  const problems = [];
  const strip = document.querySelector('.cot-vehicle-status');
  const panel = strip?.parentElement;
  if (!strip || !panel || strip.hidden) return ['no status strip shows with four statuses up'];
  const chips = [...strip.querySelectorAll('.cot-status-box')].filter((b) => !b.hidden);
  const style = getComputedStyle(strip), gap = parseFloat(style.columnGap) || 0;
  const chip = chips[0].getBoundingClientRect().width;
  const inset = parseFloat(style.getPropertyValue('--status-room-inset')) || 0;
  const room = panel.clientWidth - inset;
  const fits = Math.max(2, Math.min(4, Math.floor((room + gap) / (chip + gap))));
  if (chips.length !== fits) problems.push(`${chips.length} chips show where the room (${room} px) fits ${fits} of ${chip} px`);
  const s = strip.getBoundingClientRect();
  if (s.right - s.left > room + 0.5) problems.push(`the strip (${Math.round(s.width)} px) is wider than its room (${room} px)`);
  const joy = document.querySelector('.cot-touch.on .joy')?.getBoundingClientRect();
  if (joy?.width && s.left < joy.right + 8 && s.right > joy.left - 8 && s.bottom > joy.top - 8 && s.top < joy.bottom + 8) {
    problems.push(`the strip comes within 8 px of the joystick (strip left ${Math.round(s.left)}, joystick right ${Math.round(joy.right)})`);
  }
  // (the dock lifts it over what stands above the panel, battleHudLayout.ts statusDockBottom: wider, it must still cover
  // no control)
  for (const control of document.querySelectorAll('.cot-vehicle-controls, .cot-drive, .cot-touch.on :is(button, .joy)')) {
    const c = control.getBoundingClientRect();
    if (!c.width || !control.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    if (s.left < c.right && s.right > c.left && s.top < c.bottom && s.bottom > c.top) {
      problems.push(`the strip covers ${control.className.toString().split(' ').slice(0, 2).join('.') || control.tagName.toLowerCase()}`);
    }
  }
  return problems;
};

/** In the page: each shown hull bar's width (and its lines), keyed by its tank. */
const barWidths = () => Object.fromEntries([...document.querySelectorAll('.cot-hpbars .cot-hpb')]
  .filter((b) => b.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
  .map((b) => [`${b.querySelector('.nm span')?.textContent ?? ''}|${b.querySelector('.vh')?.textContent ?? ''}`, Math.round(b.getBoundingClientRect().width)]));

/** In the page: four relabels of every hull, the last back to its own name. */
const relabel = async () => {
  const { tanks } = window.__HUD_LAYOUT;
  const names = tanks.map((t) => t.displayName);
  for (const round of [1, 2, 3, 4]) {
    tanks.forEach((t, i) => { if (!t.isPlayer && names[i]) t.displayName = names[i] + (round % 2 ? 'X' : ''); });
    await window.__frames(3);
  }
};

/** In the page: attribute writes over `ms`, per element and attribute, those at `min` or more. */
const idleWrites = (ms, min) => new Promise((done) => {
  const counts = new Map();
  const name = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/)[0]}` : ''}`;
  const mo = new MutationObserver((records) => {
    for (const r of records) { const key = `${name(r.target)} @${r.attributeName}`; counts.set(key, (counts.get(key) ?? 0) + 1); }
  });
  mo.observe(document.documentElement, { attributes: true, subtree: true });
  setTimeout(() => { mo.disconnect(); done([...counts].filter(([, n]) => n >= min).map(([k, n]) => `${k} x${n}`)); }, ms);
});

/** The mechanisms put back (--negative-control): the vehicle line stretched again, and a 150 ms sweep that removes an
 *  absent class. */
const regress = () => {
  const style = document.createElement('style');
  style.textContent = '.cot-hpb .vh{align-self:stretch!important}';
  document.head.append(style);
  const veil = document.createElement('div');
  veil.className = 'roster-settle-negative';
  document.body.append(veil);
  setInterval(() => veil.classList.remove('show'), 150);
};

await acquireCaptureLock(60 * 60 * 1000, { lockClass: 'render', holdCapMinutes: 18 });
const refresh = setInterval(() => refreshCaptureLock(), 30_000);
refresh.unref();
// no --url: this checkout on its own server and optimizer cache (a shared cache hangs beside another dev server)
let server = null, cacheDir = null;
if (!base) {
  const { createServer } = await import('vite');
  cacheDir = mkdtempSync(join(tmpdir(), 'cot-hud-measure-vite-'));
  server = await createServer({ root: process.cwd(), logLevel: 'error', cacheDir,
    server: { host: '127.0.0.1', port: 7500 + (process.pid % 90), strictPort: false, hmr: false, watch: null } });
  await server.listen();
  base = server.resolvedUrls.local[0].replace(/\/$/, '');
}
const found = { status: 0, bars: 0, idle: 0 };
const browser = await launchGuardedBrowser(puppeteer, { headless: true, protocolTimeout: 600_000,
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--hide-scrollbars', '--no-sandbox'] }, { label: 'hud-self-measure' });
try {
  for (const s of SIZES) {
    const viewport = { width: s.width, height: s.height, isMobile: s.touch, hasTouch: s.touch };
    const open = async (state) => {
      const page = await browser.newPage();
      await page.setViewport(viewport);
      page.on('pageerror', (error) => console.log(`pageerror ${s.name} ${state}: ${error.message}`));
      await page.goto(`${base}/tools/fixtures/battle-hud-layout.html?state=${state}${s.touch ? '&coarse=1' : ''}`, { waitUntil: 'networkidle0', timeout: 300_000 });
      await page.waitForFunction(() => !!window.__HUD_LAYOUT, { timeout: 120_000 });
      await page.evaluate(`window.__frames = ${frames.toString()}`);
      if (negative) await page.evaluate(regress);
      await sleep(900);
      return page;
    };
    const report = (part, problems) => {
      found[part] += problems.length;
      console.log(`${problems.length ? 'FAIL' : 'ok  '} ${s.name} ${part}${problems.length ? `: ${problems.join('; ')}` : ''}`);
    };
    let page = await open('idle');
    report('idle', await page.evaluate(idleWrites, 2000, 3));
    report('status', await page.evaluate(statusProblems));
    await page.close();
    page = await open('markers');
    await page.evaluate(() => window.__frames(4));
    const first = await page.evaluate(barWidths);
    await page.evaluate(relabel);
    const relabelled = await page.evaluate(barWidths);
    await page.setViewport({ ...viewport, width: 500, height: 500 });
    await sleep(400);
    await page.evaluate(() => window.__frames(3));
    await page.setViewport(viewport);
    await sleep(400);
    await page.evaluate(() => window.__frames(3));
    const toggled = await page.evaluate(barWidths);
    const problems = [];
    for (const [key, width] of Object.entries(first)) {
      if (relabelled[key] !== undefined && relabelled[key] !== width) problems.push(`"${key}" ${width} -> ${relabelled[key]} px after four relabels`);
      else if (toggled[key] !== undefined && toggled[key] !== width) problems.push(`"${key}" ${width} -> ${toggled[key]} px after a short-band toggle`);
    }
    if (!Object.keys(first).length) problems.push('no hull bar shows on the markers state');
    report('bars', problems);
    await page.close();
  }
} finally {
  await browser.close();
  clearInterval(refresh);
  releaseCaptureLock();
  await server?.close();
  if (cacheDir) rmSync(cacheDir, { recursive: true, force: true });
}
const failed = negative ? !(found.bars && found.idle) : found.status + found.bars + found.idle > 0;
console.log(negative
  ? `hud-self-measure --negative-control: bars ${found.bars}, idle ${found.idle} problems with the mechanisms back (${failed ? 'FAIL: the receipt cannot see them' : 'the receipt sees both'})`
  : `hud-self-measure: status ${found.status}, bars ${found.bars}, idle ${found.idle} problems (${failed ? 'FAIL' : 'PASS'})`);
process.exit(failed ? 1 : 0);
