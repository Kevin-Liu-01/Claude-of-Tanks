#!/usr/bin/env node
// Detect a second full-length rendered track course without changing vehicle
// geometry. The canonical smart system is one terrain-conforming band per
// side plus its animated tread-pad layer. Connector/guide detail is reported
// separately; overlapping smart layers or a static track-like course fail.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';

// Loading the factory initializes every extension pack before the roster is
// read, matching the provenance audit's complete-fleet discovery order.
await import('../src/vehicles/tankFactory.js');
const { ALL_TANK_IDS } = await import('../src/vehicles/specs.js');

const idArg = process.argv.find((arg) => arg.startsWith('--ids='));
const ids = idArg
  ? idArg.slice('--ids='.length).split(',').map((id) => id.trim()).filter(Boolean)
  : [...ALL_TANK_IDS];

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { port: 7680 + Math.floor(Math.random() * 120), strictPort: false, hmr: false, watch: null },
});
await server.listen();
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
page.setDefaultTimeout(120000);

const failures = [];
const layered = [];
try {
  for (const id of ids) {
    await page.goto(
      `http://localhost:${server.config.server.port}/tools/track-duplicate-audit.html?id=${encodeURIComponent(id)}`,
      { waitUntil: 'domcontentloaded' },
    );
    await page.waitForFunction('window.__TRACK_DUPLICATE_READY === true', { polling: 50 });
    const result = await page.evaluate('window.__TRACK_DUPLICATE_AUDIT');
    if (result.canonical?.connectorLayers) layered.push(id);
    if (!result.pass) failures.push(result);
  }
} finally {
  await browser.close();
  await server.close();
}

console.log(`[track-duplicate] audited ${ids.length} first-party tanks`);
console.log(`[track-duplicate] ${layered.length} retain one animated connector/guide-detail layer; `
  + `${ids.length - layered.length} render tread pads directly on the smart band`);
if (failures.length) {
  console.error(`[track-duplicate] FAIL (${failures.length})`);
  for (const result of failures) {
    console.error(`  - ${result.id}: ${result.error || JSON.stringify({
      duplicatePairs: result.duplicatePairs,
      staticCandidates: result.staticCandidates,
    })}`);
  }
  process.exit(2);
}
console.log('[track-duplicate] PASS — no overlapping smart courses or static full-length track proxies');
