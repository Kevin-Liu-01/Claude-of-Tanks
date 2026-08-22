import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import '../src/vehicles/tankFactory.js';
import { ALL_TANK_IDS } from '../src/vehicles/specs.js';

const outputArg = process.argv.find((arg) => arg.startsWith('--sheet='));
const sheetPath = resolve(outputArg?.slice('--sheet='.length)
  || '/tmp/claude-of-tanks-vehicle-markings-fleet.png');
const requestedIds = process.argv.find((arg) => arg.startsWith('--ids='))
  ?.slice('--ids='.length).split(',').map((id) => id.trim()).filter(Boolean);
const ids = requestedIds?.length ? requestedIds : ALL_TANK_IDS;
const server = await createServer({
  server: { host: '127.0.0.1', port: 0 },
  logLevel: 'error',
});
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const failures = [];
const pageErrors = [];
let report = null;
try {
  await server.listen();
  const address = server.httpServer.address();
  const port = typeof address === 'object' && address ? address.port : server.config.server.port;
  const page = await browser.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(
    `http://127.0.0.1:${port}/tools/vehicle-marking-visibility.html`,
    { waitUntil: 'domcontentloaded', timeout: 60_000 },
  );
  await page.waitForFunction(
    'window.__VEHICLE_MARKING_AUDIT_READY === true', { timeout: 60_000 });
  report = await page.evaluate(
    (fleet) => window.__AUDIT_VEHICLE_MARKINGS(fleet, true), ids);
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
    writeFileSync(sheetPath, Buffer.from(report.sheet.split(',')[1], 'base64'));
  }
} catch (error) {
  failures.push(`browser audit failed: ${error.message}`);
} finally {
  await browser.close();
  await server.close();
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
