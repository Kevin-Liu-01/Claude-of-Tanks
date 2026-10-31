#!/usr/bin/env node
// Detect a second full-length rendered track course without changing vehicle
// geometry. The canonical smart system is one terrain-conforming band per
// side plus one animated tread-shoe layer containing its connector/guide
// detail. A separate connector mesh, overlapping smart layer or static
// track-like course fails. This tool is report-only and never edits geometry.

import { withIsolatedCaptureBrowser } from './isolated-capture-browser.mjs';
import { eachBrowserChunk } from './browser-id-chunks.mjs';
import puppeteer from 'puppeteer';
import { uniqueIds } from './id-list.mjs';
import { boundOrigin, toolServerOptions } from './tool-page-load.mjs';

// Loading the factory initializes every extension pack before the roster is
// read, matching the provenance audit's complete-fleet discovery order.
await import('../src/vehicles/tankFactory.ts');
const { ALL_TANK_IDS } = await import('../src/vehicles/specs.ts');

const idArg = process.argv.find((arg) => arg.startsWith('--ids='));
const wheelOverlaysOnly = process.argv.includes('--wheel-overlays-only');
const ids = idArg
  ? uniqueIds(idArg.slice('--ids='.length).split(',').map((id) => id.trim()).filter(Boolean), 'track-duplicate-audit --ids')
  : [...ALL_TANK_IDS];

const failures = [];
const layered = [];
// A fresh server and browser per chunk of ids (tools/browser-id-chunks.mjs).
await eachBrowserChunk('tools/track-duplicate-audit.mjs', ids, async (chunk, { launch }) => await withIsolatedCaptureBrowser({
  root: process.cwd(),
  logLevel: 'error',
  // R4c (2026-10-16): 127.0.0.1 and the address really bound, never `localhost` (an IPv6 bind can leave 127.0.0.1 to another server)
  server: toolServerOptions(7680, { span: 120 }),
}, {
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
}, async ({ server, browser }) => {
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  const origin = boundOrigin(server);

  for (const id of chunk) {
    await page.goto(
      `${origin}/tools/track-duplicate-audit.html?id=${encodeURIComponent(id)}`,
      { waitUntil: 'domcontentloaded' },
    );
    await page.waitForFunction('window.__TRACK_DUPLICATE_READY === true', { polling: 50 });
    const result = await page.evaluate('window.__TRACK_DUPLICATE_AUDIT');
    if (result.canonical?.connectorLayers) layered.push(id);
    if (wheelOverlaysOnly
      ? (result.error || result.staticRoadWheelOverlays?.length)
      : !result.pass) failures.push(result);
  }
}, { launchBrowser: (options) => launch(puppeteer, options) }));

console.log(`[track-duplicate] audited ${ids.length} first-party tanks`);
console.log(`[track-duplicate] ${ids.length - layered.length}/${ids.length} use one integrated `
  + 'animated tread/connector shoe layer');
if (failures.length) {
  console.error(`[track-duplicate] FAIL (${failures.length})`);
  for (const result of failures) {
    if (wheelOverlaysOnly) {
      console.error(`  - ${result.id}: ${JSON.stringify(result.staticRoadWheelOverlays)}`);
      continue;
    }
    console.error(`  - ${result.id}: ${result.error || JSON.stringify({
      duplicatePairs: result.duplicatePairs,
      staticCandidates: result.staticCandidates,
      staticRoadWheelOverlays: result.staticRoadWheelOverlays,
      roadWheelLayers: result.canonical?.roadWheelLayers,
      separateConnectorLayers: result.canonical?.connectorLayers ?? 0,
    })}`);
  }
  process.exit(2);
}
if (wheelOverlaysOnly) {
  console.log('[track-duplicate] PASS — no static road-wheel overlays outside the suspension-driven train');
  process.exit(0);
}
console.log('[track-duplicate] PASS — no overlapping smart courses or static full-length track proxies');
