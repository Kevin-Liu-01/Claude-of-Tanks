import { eachBrowserChunk } from './browser-id-chunks.mjs';
import { writeFileSync } from 'node:fs';
import { uniqueIds } from './id-list.mjs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import '../src/vehicles/tankFactory.ts';
import { ALL_TANK_IDS } from '../src/vehicles/specs.ts';

const outputArg = process.argv.find((arg) => arg.startsWith('--sheet='));
const sheetPath = resolve(outputArg?.slice('--sheet='.length)
  || '/tmp/claude-of-tanks-vehicle-markings-fleet.png');
const requestedIds = uniqueIds(process.argv.find((arg) => arg.startsWith('--ids='))
  ?.slice('--ids='.length).split(',').map((id) => id.trim()).filter(Boolean), 'vehicle-marking-visibility --ids');
const ids = requestedIds?.length ? requestedIds : ALL_TANK_IDS;
const server = await createServer({
  server: { host: '127.0.0.1', port: 0 },
  logLevel: 'error',
});
const failures = [];
const pageErrors = [];
let report = null;
try {
  await server.listen();
  const address = server.httpServer.address();
  const port = typeof address === 'object' && address ? address.port : server.config.server.port;
  // A fresh browser per chunk of ids (tools/browser-id-chunks.mjs); their reports and contact sheets merge below.
  const chunks = await eachBrowserChunk('tools/vehicle-marking-visibility.mjs', ids, async (chunk, { launch }) => {
    const browser = await launch(puppeteer, { headless: true, args: ['--no-sandbox'] });
    try {
      const page = await browser.newPage();
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.goto(
        `http://127.0.0.1:${port}/tools/vehicle-marking-visibility.html`,
        { waitUntil: 'domcontentloaded', timeout: 60_000 },
      );
      await page.waitForFunction(
        'window.__VEHICLE_MARKING_AUDIT_READY === true', { timeout: 60_000 });
      return { ids: chunk, report: await page.evaluate(
        (fleet) => window.__AUDIT_VEHICLE_MARKINGS(fleet, true), chunk) };
    } finally {
      await browser.close();
    }
  });
  report = {
    ...chunks[0].report,
    tanks: Object.assign({}, ...chunks.map((part) => part.report.tanks)),
    sheet: chunks.every((part) => part.report.sheet) ? await contactSheet(chunks) : null,
  };
  for (const id of ids) {
    for (const kind of ['insignia', 'designation']) {
      const result = report.tanks[id]?.[kind];
      if (!result || result.error) {
        failures.push(`${id}/${kind}: ${result?.error || 'missing audit result'} ${JSON.stringify(result || {})}`);
        continue;
      }
      if (result.clearSamples < 6 || result.sampleCount !== 9) {
        failures.push(`${id}/${kind}: geometry receipt ${result.clearSamples}/${result.sampleCount}`);
      }
      if (!result.visibilityVerified) {
        failures.push(`${id}/${kind}: marking mesh lacks a passing visibility receipt`);
      }
      if (result.changedPixels < 12
          || result.boundsWidth < 3 || result.boundsHeight < 3
          || result.averageRgbDelta < 20) {
        failures.push(`${id}/${kind}: raster evidence too small (${JSON.stringify(result)})`);
      }
    }
  }
  if (report.sheet) {
    writeFileSync(sheetPath, report.sheet);
  }
} catch (error) {
  failures.push(`browser audit failed: ${error.message}`);
} finally {
  await server.close();
}

/** The contact sheet of every id as one page would draw it: each chunk's cells (180 x 240, 11 to a row, from
 *  tools/vehicle-marking-visibility.html) copied to their place in the whole list. One chunk keeps the page's PNG. */
async function contactSheet(chunks) {
  const sheets = chunks.map((part) => Buffer.from(part.report.sheet.split(',')[1], 'base64'));
  if (sheets.length === 1) return sheets[0];
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const columns = 11, cellWidth = 180, cellHeight = 240;
  const sheet = createCanvas(columns * cellWidth, Math.ceil(ids.length / columns) * cellHeight);
  const context = sheet.getContext('2d');
  context.fillStyle = '#081015';
  context.fillRect(0, 0, sheet.width, sheet.height);
  let at = 0;
  for (const [index, part] of chunks.entries()) {
    const image = await loadImage(sheets[index]);
    for (let local = 0; local < part.ids.length; local += 1, at += 1) {
      context.drawImage(image, (local % columns) * cellWidth, Math.floor(local / columns) * cellHeight, cellWidth, cellHeight,
        (at % columns) * cellWidth, Math.floor(at / columns) * cellHeight, cellWidth, cellHeight);
    }
  }
  return sheet.toBuffer('image/png');
}

for (const error of pageErrors) failures.push(`page: ${error}`);
if (failures.length) {
  console.error(`[vehicle-marking-visibility] FAIL (${failures.length})`);
  failures.slice(0, 100).forEach((failure) => console.error(`  - ${failure}`));
  process.exit(2);
}

const measurements = Object.values(report.tanks).flatMap((tank) =>
  ['insignia', 'designation'].map((kind) => tank[kind]));
console.log(`[vehicle-marking-visibility] PASS — ${ids.length} tanks / ${measurements.length} rendered markings`);
console.log(`[vehicle-marking-visibility] minimum raster evidence: ${Math.min(...measurements.map((entry) => entry.changedPixels))} changed pixels`);
console.log(`[vehicle-marking-visibility] contact sheet: ${sheetPath}`);
