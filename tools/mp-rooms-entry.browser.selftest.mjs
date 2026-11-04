#!/usr/bin/env node
// The multiplayer end-to-end's way into the rooms panel works in the Garage's layouts (268). The 267 production smoke's
// tools/mp-p2p-e2e.mjs pressed .cot-multiplayer-entry, which the persistent panels hide at its 1024x640 window, so the
// stock tool went red before it tested anything. tools/mp-rooms-entry.mjs now reads the page's layout and presses the
// surface registry's recipe for it. This receipt runs that entry step against a local build of this checkout, at 1024x640
// (the tool's window) and at 1440x900 (a desktop): the Garage boots, openRooms presses the recipe the way a player can,
// and the play menu opens with its room kinds. Control: at 1024x640 the old selector is not shown, so this layout is the
// one that used to fail. A wait that times out above 3 per core of 1-min load exits the STARVED verdict
// (tools/selftest-verdict.mjs), never a red.
//   node tools/mp-rooms-entry.browser.selftest.mjs [--url=http://127.0.0.1:5173] [--sizes=1024x640,1440x900]
// Takes the shared capture lock (render class) for the run: the manual `ui` suite's (npm run test:heavy -- ui). Exit 1 on
// any size the entry fails at. First-party tooling: Kevin B. Liu.
import puppeteer from 'puppeteer';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { acquireCaptureLock, refreshCaptureLock, releaseCaptureLock } from './capture-lock.mjs';
import { openRooms } from './mp-rooms-entry.mjs';
import { readinessExpression } from './game-readiness.mjs';
import { machineLoad, SELFTEST_STARVED_EXIT } from './selftest-verdict.mjs';

const option = (name, fallback = '') => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
let base = option('url').replace(/\/$/, '');
const SIZES = option('sizes', '1024x640,1440x900').split(',').map((text) => {
  const [width, height] = text.split('x').map(Number);
  return { name: text, width, height, deviceScaleFactor: 1 };
});
// the tool's own boot (tools/mp-p2p-e2e.mjs BOOT_QUERY)
const BOOT_QUERY = 'nosplash=1&tier=desktop&gfxreset=1&telemetry=off';

await acquireCaptureLock(60 * 60 * 1000, { lockClass: 'render', holdCapMinutes: 18 });
const refresh = setInterval(() => refreshCaptureLock(), 30_000);
refresh.unref();
// no --url: this checkout on its own server and optimizer cache (a shared cache hangs beside another dev server)
let server = null, cacheDir = null;
if (!base) {
  const { createServer } = await import('vite');
  cacheDir = mkdtempSync(join(tmpdir(), 'cot-rooms-entry-vite-'));
  server = await createServer({ root: process.cwd(), logLevel: 'error', cacheDir,
    server: { host: '127.0.0.1', port: 7400 + (process.pid % 90), strictPort: false, hmr: false, watch: null } });
  await server.listen();
  base = server.resolvedUrls.local[0].replace(/\/$/, '');
}
const results = [];
let starved = null;
const browser = await launchGuardedBrowser(puppeteer, { headless: true, protocolTimeout: 900_000,
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--hide-scrollbars', '--no-sandbox'] }, { label: 'mp-rooms-entry' });
/** A wait; its timeout above the starved load is the machine's (STARVED), not the entry's. */
const wait = async (page, predicate, label, timeout) => {
  try { await page.waitForFunction(predicate, { timeout, polling: 200 }); } catch (error) {
    const load = machineLoad();
    if (load.starved) starved ??= `${label} at 1-min load ${load.load1} on ${load.cores} cores`;
    throw new Error(`${load.starved ? 'STARVED: ' : ''}${label}: ${error.message}`);
  }
};
try {
  for (const size of SIZES) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.setViewport(size);
      await page.goto(`${base}/?${BOOT_QUERY}`, { waitUntil: 'domcontentloaded', timeout: 600_000 });
      await wait(page, readinessExpression('garage'), `${size.name}: the Garage`, 600_000);
      const oldEntryShown = await page.evaluate(() => {
        const node = document.querySelector('.cot-multiplayer-entry');
        return !!node && node.getClientRects().length > 0 && node.checkVisibility({ visibilityProperty: true });
      });
      const entry = await openRooms(page);
      await wait(page, () => document.querySelector('.cot-play')?.classList.contains('show')
        && [...document.querySelectorAll('.cot-play .modes [data-value]')].some((node) => node.getClientRects().length > 0),
      `${size.name}: the play menu and its room kinds`, 30_000);
      results.push({ size: size.name, ok: true, layout: entry.layout, pressed: entry.pressed, oldEntryShown, errors });
    } catch (error) {
      results.push({ size: size.name, ok: false, error: error.message.slice(0, 400), errors });
    } finally {
      await page.close().catch(() => {});
    }
  }
} finally {
  await browser.close();
  clearInterval(refresh);
  releaseCaptureLock();
  await server?.close();
  if (cacheDir) rmSync(cacheDir, { recursive: true, force: true });
}
const failures = [];
for (const result of results) {
  console.log(result.ok
    ? `${result.size}: ${result.layout} layout, opened by ${result.pressed.join(' > ')} (the old .cot-multiplayer-entry ${result.oldEntryShown ? 'shown' : 'hidden'})`
    : `${result.size}: FAIL ${result.error}`);
  if (!result.ok) failures.push(result.size);
  if (result.errors.length) failures.push(`${result.size}: ${result.errors.length} page error(s): ${result.errors[0].slice(0, 160)}`);
}
// the control: the tool's own window is the layout whose old selector a player cannot press
const tools = results.find((result) => result.size === '1024x640');
if (tools?.ok && tools.oldEntryShown) failures.push('1024x640: the old .cot-multiplayer-entry is shown, so this receipt no longer covers the layout that failed');
if (starved && failures.length) {
  console.log(`mp-rooms-entry: STARVED (${starved}): re-run on a quieter machine`);
  process.exit(SELFTEST_STARVED_EXIT);
}
console.log(`mp-rooms-entry: ${failures.length ? `FAIL (${failures.join('; ')})` : 'PASS'} at ${SIZES.map((s) => s.name).join(', ')}`);
process.exit(failures.length ? 1 : 0);
