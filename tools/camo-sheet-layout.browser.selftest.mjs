#!/usr/bin/env node
// The Garage's paint sheet opens on whole rows that fill it (owner 2026-11-11: "a bug right now in camo window is that its
// squished for some reason on open. fix"). Copyright © 2026 Kevin B. Liu. First-party tool; see NOTICE.md.
//
// Release 271's docked sheet opened on one row of swatches over an empty half sheet, its names cut by a sideways
// scrollbar. Each docked swatch stood a 3:2 picture over its name, so a row's height followed its column's width (a
// stretched 1fr track): at 900 to 1920 px two rows missed the sheet's room by a few pixels, and the whole-row fit
// (garage.ts fitCamoRows, fitWholeRows) pinned the grid to the one row that fit. The fit now fills the room with whole
// rows of one height and the picture takes the row's height (showroom.css), so the rows come from the sheet, not from
// the column widths.
//
// The receipt serves this checkout's production Garage owners (tools/fixtures/mobile-surfaces.html: garage.ts, its CSS
// and the real catalog, no renderer), or a served game with --url= (its own page, /?nosplash=1). At each window (--sizes)
// it presses the band's every-paint button as a player does and, two frames and 600 ms on, then after a kind chip on and
// off, checks the sheet's grid:
//   - no sideways overflow (its scroll width within its box), at every window;
//   - every name inside its swatch and inside the grid's visible box (a row cut at the foot is no row);
//   - docked: at least --min-rows whole rows in a desktop window (1280 px wide or more; a smaller window's sheet may hold
//     one row), and no strip under the last whole row deeper than half a row.
// --negative-control puts the 3:2 picture back over the fitted rows, and the receipt must then fail (exit 1 when it
// passes).
//   node tools/camo-sheet-layout.browser.selftest.mjs [--url=https://cot.kevinliu.studio] [--out=<new dir>]
//     [--sizes=1920x1080,1512x982@2,900x700,844x390,390x844] [--min-rows=2] [--negative-control]
// Takes the shared capture lock (render class) for the run: the manual `ui` suite's (npm run test:heavy -- ui), never the
// default tier. Writes <out>/report.json and a PNG per window.
import puppeteer from 'puppeteer';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { openCaptureHold } from './capture-hold.mjs';

const option = (name, fallback = '') => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
let base = option('url').replace(/\/$/, '');
const game = Boolean(base);
const negative = process.argv.includes('--negative-control');
const MIN_ROWS = Number(option('min-rows', '2'));
const out = option('out') ? resolve(option('out')) : mkdtempSync(join(tmpdir(), `cot-camo-sheet-${negative ? 'negative-' : ''}`));
if (option('out') && existsSync(out)) throw new Error(`${out} exists: the receipt never overwrites an earlier run`);
mkdirSync(out, { recursive: true });
const SIZES = option('sizes', '1920x1080,1512x982@2,900x700,844x390,390x844').split(',').map((text) => {
  const [wh, dpr = '1'] = text.split('@');
  const [width, height] = wh.split('x').map(Number);
  // a phone-sized window is a touch phone, as the Garage lays it out (a 900 px window is a small desktop)
  const touch = Math.min(width, height) < 500;
  return { name: text, width, height, deviceScaleFactor: Number(dpr), isMobile: touch, hasTouch: touch };
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = (page, n = 2) => page.evaluate((count) => new Promise((done) => {
  const step = (left) => (left ? requestAnimationFrame(() => step(left - 1)) : done()); step(count);
}), n);

/** In the page: the open sheet's grid as drawn. */
const measure = () => {
  const sheet = document.querySelector('.cot-leftcol');
  const grid = document.querySelector('.cot-camos .cot-c-picker__grid');
  if (!sheet || !grid || !sheet.getClientRects().length || !grid.getClientRects().length) return { open: false };
  const box = grid.getBoundingClientRect();
  const top = box.top + grid.clientTop, bottom = top + grid.clientHeight;
  const opts = [...grid.querySelectorAll('.cot-c-picker__opt')].filter((o) => o.getClientRects().length);
  const shown = opts.filter((o) => { const r = o.getBoundingClientRect(); return r.bottom > top + 0.5 && r.top < bottom - 0.5; });
  const whole = shown.filter((o) => { const r = o.getBoundingClientRect(); return r.top >= top - 0.5 && r.bottom <= bottom + 0.5; });
  const rowTops = [...new Set(whole.map((o) => Math.round(o.getBoundingClientRect().top)))];
  const rowHeight = whole.length ? Math.max(...whole.map((o) => o.getBoundingClientRect().height)) : 0;
  const lastFoot = whole.length ? Math.max(...whole.map((o) => o.getBoundingClientRect().bottom)) : top;
  const sheetFoot = document.querySelector('.cot-camos').getBoundingClientRect().bottom;
  const cut = shown.flatMap((o) => {
    const r = o.getBoundingClientRect(), n = o.querySelector('.cot-c-picker__name')?.getBoundingClientRect();
    if (!n) return [];
    // a name below its swatch's foot, or under the grid's visible foot (a scrollbar's band included)
    return n.bottom > r.bottom + 0.5 || (r.top >= top - 0.5 && n.bottom > bottom + 0.5) ? [o.dataset.id] : [];
  });
  return {
    open: true, panels: document.body.dataset.cotPanels, count: opts.length,
    clientWidth: grid.clientWidth, scrollWidth: grid.scrollWidth, overflowX: grid.scrollWidth - grid.clientWidth,
    rows: rowTops.length, rowHeight: +rowHeight.toFixed(1), emptyBelow: +(Math.min(sheetFoot, bottom) - lastFoot).toFixed(1),
    moreBelow: grid.scrollHeight > grid.clientHeight + 1, cut, style: grid.getAttribute('style') ?? '',
  };
};

const failures = (state, size) => {
  if (!state.open) return ['the sheet did not open'];
  const found = [];
  if (state.overflowX > 1) found.push(`sideways overflow ${state.overflowX} px (scroll ${state.scrollWidth} in ${state.clientWidth})`);
  if (state.cut.length) found.push(`${state.cut.length} names cut (${state.cut.slice(0, 4).join(', ')})`);
  if (state.panels === 'persistent' && state.moreBelow) {
    if (size.width >= 1280 && state.rows < MIN_ROWS) found.push(`${state.rows} whole row${state.rows === 1 ? '' : 's'} (at least ${MIN_ROWS})`);
    if (state.emptyBelow > state.rowHeight / 2) found.push(`${state.emptyBelow} px empty under the last whole row of ${state.rowHeight} px`);
  }
  return found.map((text) => `${size.name}: ${text}`);
};

const hold = await openCaptureHold({ label: 'camo-sheet-layout.browser.selftest', timeoutMs: 60 * 60 * 1000, lockClass: 'render', holdCapMinutes: 18 });
let server = null, cacheDir = null;
if (!base) {
  const { createServer } = await import('vite');
  cacheDir = mkdtempSync(join(tmpdir(), 'cot-camo-sheet-vite-'));
  server = await createServer({ root: process.cwd(), logLevel: 'error', cacheDir,
    server: { host: '127.0.0.1', port: 7500 + (process.pid % 90), strictPort: false, hmr: false, watch: null } });
  await server.listen();
  base = server.resolvedUrls.local[0].replace(/\/$/, '');
}
const report = { base, game, negative, sizes: [] };
const problems = [];
const browser = await launchGuardedBrowser(puppeteer, { headless: true, protocolTimeout: 900_000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox'] }, { label: 'camo-sheet-layout' });
try {
  for (const size of SIZES) {
    const page = await browser.newPage();
    page.on('pageerror', (error) => console.log(`pageerror (${size.name}): ${error.message}`));
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem('cot.telemetry', 'off'); } catch { /* none */ } });
    await page.setViewport(size);
    await page.goto(game ? `${base}/?nosplash=1&telemetry=off` : `${base}/tools/fixtures/mobile-surfaces.html?full=1`,
      { waitUntil: 'domcontentloaded', timeout: 600_000 });
    const button = await page.waitForSelector('.cot-lt-paint-all', { visible: true, timeout: 600_000 });
    await sleep(1000);
    if (negative) {
      await page.addStyleTag({ content: "body[data-cot-panels='persistent'] .cot-camos .cot-c-picker--swatches .cot-c-picker__media{aspect-ratio:3/2!important;flex:none!important}" });
    }
    if (size.hasTouch) await button.tap(); else await button.click();
    const states = [];
    await frames(page, 2);
    states.push({ at: 'open', ...(await page.evaluate(measure)) });
    await sleep(600);
    states.push({ at: 'open+600ms', ...(await page.evaluate(measure)) });
    // the picture waits for the swatches in view to paint (they drain under the painter's frame budget), 20 s at most
    const unpainted = await page.evaluate(async () => {
      const waiting = () => [...document.querySelectorAll('.cot-camos .cot-camo-swatch[data-loading]')].filter((canvas) => {
        const grid = canvas.closest('.cot-c-picker__grid'); const g = grid.getBoundingClientRect(), r = canvas.getBoundingClientRect();
        return r.bottom > g.top && r.top < g.top + grid.clientHeight; }).length;
      for (const end = performance.now() + 20_000; waiting() && performance.now() < end;) await new Promise((r) => setTimeout(r, 200));
      return waiting();
    });
    if (unpainted) console.log(`${size.name}: ${unpainted} swatches in view still unpainted after 20 s (the picture shows their skeleton)`);
    await page.screenshot({ path: `${out}/${size.name.replace('@', '-dpr')}.png` });
    const chip = await page.$('.cot-camo-picker [data-chip^="tag:"]');
    if (chip) {
      await chip.click(); await sleep(400);
      states.push({ at: 'chip on', ...(await page.evaluate(measure)) });
      await chip.click(); await sleep(400);
      states.push({ at: 'chip off', ...(await page.evaluate(measure)) });
    }
    const found = states.flatMap((state) => failures(state, size).map((text) => `${text} (${state.at})`));
    problems.push(...found);
    report.sizes.push({ size: size.name, states, failures: found });
    const first = states[1];
    console.log(`${size.name} (${first.panels ?? 'closed'}): ${first.rows ?? 0} whole rows of ${first.rowHeight ?? 0} px, `
      + `${first.emptyBelow ?? 0} px under them, overflow ${first.overflowX ?? 0} px, ${first.cut?.length ?? 0} cut names`
      + `${found.length ? `\n  ${found.join('\n  ')}` : ''}`);
    await page.close();
  }
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
  await browser.close();
  await hold?.release();
  await server?.close();
  if (cacheDir) rmSync(cacheDir, { recursive: true, force: true });
}
const failed = negative ? problems.length === 0 : problems.length > 0;
console.log(negative
  ? `camo-sheet-layout --negative-control: ${problems.length} findings with the 3:2 picture (${failed ? 'FAIL: the receipt cannot see the squish' : 'the receipt sees the squish'})`
  : `camo-sheet-layout: ${problems.length} findings (${failed ? 'FAIL' : 'PASS'}); report ${out}/report.json`);
process.exit(failed ? 1 : 0);
