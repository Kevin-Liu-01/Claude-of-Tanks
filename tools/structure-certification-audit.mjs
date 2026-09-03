#!/usr/bin/env node

// Render every procedural structure from eight deterministic viewpoints and
// combine visual-frame checks with the geometry-derived collision fit score.

import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { VILLAGE_BUILDERS } from '../src/world/maps/villageKit.ts';
import { URBAN_BUILDERS } from '../src/world/maps/urbanKit.ts';
import {
  DESTRUCTIBLE_BUILDING_TYPES, STRUCTURE_BUILDERS,
} from '../src/world/maps/structureKit.ts';
import { DESTRUCTIBLE_TYPES } from '../src/world/maps/inhabitKit.ts';
import { SOURCED_STRUCTURE_TYPES } from '../src/world/sourcedStructureTypes.ts';

const args = process.argv.slice(2);
const valueArg = (name, fallback) => {
  const prefix = `--${name}=`;
  const hit = args.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
};
const flagArg = (name) => args.includes(`--${name}`);
const ROOT = path.resolve(valueArg('root', process.cwd()));
const outDir = path.resolve(ROOT, valueArg('out', '.qa-structure-certification'));
const captureShots = flagArg('shots');
const requestedIds = valueArg('ids', '').split(',').map((id) => id.trim()).filter(Boolean);
const views = [
  'front', 'rear', 'left', 'right',
  'three-quarter', 'front-left', 'rear-right', 'roof',
];
const catalog = {
  ...VILLAGE_BUILDERS,
  ...URBAN_BUILDERS,
  ...STRUCTURE_BUILDERS,
  ...DESTRUCTIBLE_BUILDING_TYPES,
  ...DESTRUCTIBLE_TYPES,
  ...SOURCED_STRUCTURE_TYPES,
};
const ids = requestedIds.length ? requestedIds : Object.keys(catalog);
const unknown = ids.filter((id) => !catalog[id]);
if (unknown.length) throw new Error(`unknown structure ids: ${unknown.join(', ')}`);
fs.mkdirSync(outDir, { recursive: true });

const server = await createServer({
  root: ROOT,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null },
});
await server.listen();
const address = server.httpServer.address();
const port = typeof address === 'object' && address ? address.port : server.config.server.port;
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 720, height: 480, deviceScaleFactor: 1 });
page.setDefaultTimeout(120_000);
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

const rows = [];
try {
  for (const id of ids) {
    const url = `http://127.0.0.1:${port}/tools/structure-visual-audit.html?` +
      new URLSearchParams({ id, collision: 'all', seed: String(0x51a7c7) });
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.__STRUCTURE_AUDIT?.ready === true);
    const base = await page.evaluate(() => ({
      score: window.__STRUCTURE_AUDIT.collisionCertification.minimumScore,
      profileScore: window.__STRUCTURE_AUDIT.collisionProfile.minimumScore,
      contactParts: window.__STRUCTURE_AUDIT.collisionProfile.contact.collisionParts,
      shellBands: window.__STRUCTURE_AUDIT.collisionProfile.shell.length,
      triangles: window.__STRUCTURE_AUDIT.triangles,
    }));
    const frames = [];
    for (const view of views) {
      const frame = await page.evaluate((nextView) => {
        const audit = window.__STRUCTURE_AUDIT;
        const framing = audit.setView(nextView);
        return { ...framing, ...audit.probeFrame() };
      }, view);
      const majorSpan = Math.max(frame.frameWidth, frame.frameHeight);
      const minorSpan = Math.min(frame.frameWidth, frame.frameHeight);
      if (!(majorSpan >= 0.30 && majorSpan <= 1.90 && minorSpan >= 0.008)) {
        throw new Error(`${id}/${view}: framing ${frame.frameWidth.toFixed(3)} x ${frame.frameHeight.toFixed(3)} is invalid`);
      }
      if (!(frame.variance >= 30 && frame.opaqueRatio >= 0.99)) {
        throw new Error(`${id}/${view}: blank/flat render probe (${frame.variance.toFixed(1)} variance)`);
      }
      if (captureShots) {
        const dir = path.join(outDir, id);
        fs.mkdirSync(dir, { recursive: true });
        await page.screenshot({ path: path.join(dir, `${view}.png`) });
      }
      frames.push(frame);
    }
    if (!(base.score > 90)) throw new Error(`${id}: collision score ${base.score.toFixed(1)} is not above 90`);
    rows.push({ id, ...base, frames });
    process.stdout.write(`\r[structure-cert] ${rows.length}/${ids.length} ${id} ${base.score.toFixed(1)}/100`);
  }
} finally {
  await browser.close();
  await server.close();
}
process.stdout.write('\n');
if (errors.length) throw new Error(`browser errors:\n${errors.join('\n')}`);

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  threshold: 90,
  viewCount: views.length,
  structureCount: rows.length,
  minimumScore: Math.min(...rows.map((row) => row.score)),
  rows,
};
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(`[structure-cert] PASS ${rows.length} structures x ${views.length} views; minimum ${report.minimumScore.toFixed(1)}/100`);
