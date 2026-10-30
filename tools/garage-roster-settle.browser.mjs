#!/usr/bin/env node
// The Garage's bottom roster settles (owner 2026-10-30: "the bottom tannk lists in teh garage sometimes randomly freak out
// and glitch like constannt layout shifting back and forth ... rn it happens for japan and israel"). Copyright © 2026
// Kevin B. Liu. First-party tool; see NOTICE.md.
//
// The card strip writes two things from what it measures, the cards' fit (--card-fit) and its end pad (--rail-end), and
// neither may move what it measures (garage.ts fitCards and settleRailEnd). Release 264's strip broke that: its arrows
// shrank by flex weight beside it, so its width followed its own content, and with Japan or Israel chosen in a 1392-1437
// or 1850-1880 px window the end pad flipped between none and a whole card every frame, the strip 5 px wider and
// narrower with it.
//
// Against an already served game (--url=), at each window (--sizes, default the UI gauntlet's desktop windows and the
// laptops at DPR 2) the receipt chooses every nation and checks the roster where the window puts it; at the --stepped
// windows it then steps the carousel's width (its right inset, the one thing the strip's room follows) through --steps
// widths spread over the window's whole range. At each, after four frames to settle (a strip writes its fit and pad in
// the frame after it resizes, and the frame after that finds nothing to write), it watches four more: two or more changes
// in the strip's or the nation rail's box, the card width, either end pad or the arrows, or two or more ResizeObserver
// callbacks on either rail or layout shifts, fail. A loop changes every frame; a settled roster never does.
// --negative-control restores the arrows' flex shrink (the mechanism above), and the receipt must then find loops: it
// exits 1 when it finds none.
//   node tools/garage-roster-settle.browser.mjs --url=http://127.0.0.1:5173 [--out=<new dir>] [--negative-control]
//     [--sizes=1920x1080,1512x865@2] [--stepped=1920x1080,1512x865@2,1280x700] [--steps=24] [--nations=jp,il]
// Takes the shared capture lock (render class) for the run. Exit 1 on any loop (or, under --negative-control, on none).
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { acquireCaptureLock, refreshCaptureLock, releaseCaptureLock } from './capture-lock.mjs';

const option = (name, fallback = '') => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const base = option('url').replace(/\/$/, '');
if (!base) throw new Error('Required: --url=http(s)://served-game');
const negative = process.argv.includes('--negative-control');
const out = resolve(option('out', `.qa-dev/garage-roster-settle/${negative ? 'negative-' : ''}${Date.now()}`));
if (existsSync(out)) throw new Error(`${out} exists: the receipt never overwrites an earlier run`);
mkdirSync(out, { recursive: true });
const size = (text) => {
  const [wh, dpr = '1'] = text.split('@');
  const [width, height] = wh.split('x').map(Number);
  return { name: text, width, height, deviceScaleFactor: Number(dpr) };
};
const SIZES = option('sizes', '1280x800,1440x900,1512x865@2,1728x1000@2,1920x1080,2560x1440,3440x1440,5120x1440').split(',').map(size);
const STEPPED = new Set(option('stepped', '1920x1080,1512x865@2,1280x700').split(','));
for (const name of STEPPED) if (!SIZES.some((s) => s.name === name)) SIZES.push(size(name));
const STEPS = Number(option('steps', '24'));
const NATIONS = option('nations') ? option('nations').split(',') : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The game page as a player meets it, minus what a probe page must not do: the dev client's reloads and the 15 s+ recovery
// watchdogs. Motion reduced, so a nation's choice scrolls its flag at once (the loop is not motion: it runs reduced too).
const holds = () => {
  Document.prototype.hasFocus = () => true;
  try { localStorage.setItem('cot.telemetry', 'off'); } catch { /* none */ }
  const Native = window.WebSocket;
  window.WebSocket = function (url, protocols) {
    const list = [].concat(protocols ?? []);
    if (list.includes('vite-hmr') || /[?&]token=/.test(String(url))) { const t = new EventTarget(); t.readyState = 0; t.send = () => {}; t.close = () => {}; return t; }
    return new Native(url, protocols);
  };
  Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3, prototype: Native.prototype });
  const native = window.setTimeout;
  window.setTimeout = function (fn, ms, ...args) { return Number(ms) >= 15000 ? 0 : native.call(window, fn, ms, ...args); };
};

/** In the page: for each nation, at the window's own carousel and at each stepped width, whether the roster stays still. */
const sweep = async ({ nations, widths, negative }) => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const garage = document.querySelector('.cot-garage');
  const cards = garage.querySelector('.cot-cards');
  const chips = garage.querySelector('.cot-country-chips');
  const carousel = garage.querySelector('.cot-carousel');
  const arrows = [...carousel.querySelectorAll('.cot-car-arrow')];
  if (negative && !document.getElementById('roster-settle-negative')) {
    const style = document.createElement('style');
    style.id = 'roster-settle-negative';
    style.textContent = '.cot-garage .cot-car-arrow{flex:0 1 auto!important}';
    document.head.append(style);
  }
  let resized = 0, shifted = 0;
  const observer = new ResizeObserver((entries) => { resized += entries.length; });
  observer.observe(cards);
  observer.observe(chips);
  const shifts = new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) shifted++; });
  shifts.observe({ type: 'layout-shift', buffered: false });
  const card = () => [...cards.children].find((n) => n.getClientRects().length);
  const state = () => {
    const strip = cards.getBoundingClientRect(), rail = chips.getBoundingClientRect();
    return [strip.left, strip.width, rail.left, rail.width, card()?.getBoundingClientRect().width ?? 0,
      ...arrows.map((a) => a.getBoundingClientRect().width)].map((v) => v.toFixed(2)).join('|') +
      `|${cards.style.getPropertyValue('--rail-end')}|${chips.style.getPropertyValue('--rail-end')}|${cards.scrollWidth}|${chips.scrollWidth}`;
  };
  /** Four frames to settle, then four watched: the changes seen (each a state string), callbacks and shifts. */
  const watch = async () => {
    for (let i = 0; i < 4; i++) await frame();
    resized = 0; shifted = 0;
    let last = state();
    const seen = [];
    for (let i = 0; i < 4; i++) {
      await frame();
      const now = state();
      if (now !== last) seen.push(now);
      last = now;
    }
    return { changes: seen.length, resized, shifted, seen: seen.slice(0, 3) };
  };
  const loops = [];
  const shown = {};
  let checks = 0;
  for (const id of nations) {
    const chip = chips.querySelector(`[data-country="${id}"]`);
    if (!chip) { loops.push({ id, missing: true }); continue; }
    carousel.style.right = '';
    chip.click();
    for (let i = 0; i < 6; i++) await frame();
    shown[id] = [...cards.children].filter((n) => n.getClientRects().length).length;
    for (const width of [null, ...widths]) {
      if (width !== null) carousel.style.right = `${(innerWidth - carousel.getBoundingClientRect().left - width).toFixed(2)}px`;
      const result = await watch();
      checks++;
      if (result.changes >= 2 || result.resized >= 2 || result.shifted >= 2) {
        loops.push({ id, carousel: +carousel.getBoundingClientRect().width.toFixed(2), stepped: width !== null, ...result });
      }
    }
  }
  carousel.style.right = '';
  observer.disconnect();
  shifts.disconnect();
  return { loops, checks, shown, panels: document.body.dataset.cotPanels };
};

await acquireCaptureLock(60 * 60 * 1000, { lockClass: 'render', holdCapMinutes: 18 });
const refresh = setInterval(() => refreshCaptureLock(), 30_000);
refresh.unref();
const report = { base, negative, sizes: [] };
let failed = false;
const browser = await launchGuardedBrowser(puppeteer, { headless: true, protocolTimeout: 900_000,
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--hide-scrollbars', '--no-sandbox'] }, { label: 'garage-roster-settle' });
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(holds);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  page.on('pageerror', (error) => console.log(`pageerror: ${error.message}`));
  await page.setViewport(SIZES[0]);
  await page.goto(`${base}/?nosplash=1&telemetry=off`, { waitUntil: 'domcontentloaded', timeout: 600_000 });
  await page.waitForSelector('.cot-garage .cot-cards .cot-card', { visible: true, timeout: 600_000 });
  await sleep(3000);
  const nations = NATIONS ?? await page.evaluate(() => [...document.querySelectorAll('.cot-garage .cot-country-chips .cot-country-chip')]
    .map((chip) => chip.dataset.country));
  for (const s of SIZES) {
    await page.setViewport(s);
    await sleep(1200);
    // the stepped widths: spread over the persistent carousel's whole range at this window, at a stride that walks the
    // sub-pixel phases too (a loop lives in bands a few to tens of pixels wide)
    const range = await page.evaluate(() => {
      const left = document.querySelector('.cot-garage .cot-carousel').getBoundingClientRect().left;
      return { lo: 480, hi: innerWidth - left - 8 };
    });
    const widths = STEPPED.has(s.name)
      ? Array.from({ length: STEPS }, (_, k) => +(range.lo + (k + 0.37) * (range.hi - range.lo) / STEPS).toFixed(2)) : [];
    const result = await page.evaluate(sweep, { nations, widths, negative });
    report.sizes.push({ size: s.name, ...result });
    const real = result.loops.filter((l) => !l.stepped);
    console.log(`${s.name} (${result.panels}): ${result.checks} checks, ${result.loops.length} unsettled` +
      `${real.length ? ` (${real.length} at the window's own width: ${real.map((l) => l.id).join(', ')})` : ''}`);
    for (const loop of result.loops.slice(0, 8)) {
      console.log(`  ${loop.id}${loop.missing ? ' missing' : ` carousel ${loop.carousel}: ${loop.changes} changes, ${loop.resized} resizes, ${loop.shifted} shifts ${loop.seen.join(' / ')}`}`);
    }
    if (result.loops.length) await page.screenshot({ path: `${out}/${s.name.replace('@', '-dpr')}-${result.loops[0].id}.png` });
  }
  const loops = report.sizes.reduce((n, s) => n + s.loops.length, 0);
  failed = negative ? loops === 0 : loops > 0;
  console.log(negative
    ? `garage-roster-settle --negative-control: ${loops} unsettled with the arrows shrinking (${failed ? 'FAIL: the receipt cannot see the loop' : 'the receipt sees the loop'})`
    : `garage-roster-settle: ${loops} unsettled (${failed ? 'FAIL' : 'PASS'})`);
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
  await browser.close();
  clearInterval(refresh);
  releaseCaptureLock();
}
process.exit(failed ? 1 : 0);
