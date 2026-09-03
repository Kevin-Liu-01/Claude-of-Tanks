#!/usr/bin/env node

// Render every procedural trunk from whole-tree and close root views. This is
// a committed visual regression gate, not a one-off screenshot harness.

import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { TREE_SPECIES } from '../src/world/treeSpecies.ts';

const args = process.argv.slice(2);
const valueArg = (name, fallback) => {
  const prefix = `--${name}=`;
  const hit = args.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
};
const ROOT = path.resolve(valueArg('root', process.cwd()));
const outDir = path.resolve(ROOT, valueArg('out', '.qa-tree-trunks'));
const captureShots = args.includes('--shots');
const requested = valueArg('species', '').split(',').map((id) => id.trim()).filter(Boolean);
const speciesList = requested.length ? requested : [...TREE_SPECIES];
const unknown = speciesList.filter((species) => !TREE_SPECIES.includes(species));
if (unknown.length) throw new Error(`unknown tree species: ${unknown.join(', ')}`);
const views = [
  'front', 'rear', 'left', 'right', 'three-quarter', 'roof',
  'base-front', 'base-quarter',
];
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
await page.setViewport({ width: 720, height: 560, deviceScaleFactor: 1 });
page.setDefaultTimeout(120_000);
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));

const rows = [];
try {
  for (const species of speciesList) {
    const url = `http://127.0.0.1:${port}/tools/tree-trunk-visual-audit.html?`
      + new URLSearchParams({ species, seed: String(0x71ee), collision: '1' });
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.__TREE_TRUNK_AUDIT?.ready === true);
    const base = await page.evaluate(() => {
      const audit = window.__TREE_TRUNK_AUDIT;
      return {
        score: audit.score,
        receipt: audit.receipt,
        collisionRadius: audit.collisionRadius,
        visibleRadius: audit.visibleRadius,
      };
    });
    if (!(base.score > 90)) {
      throw new Error(`${species}: trunk quality ${base.score.toFixed(1)}/100 is not above 90`);
    }
    const frames = [];
    for (const view of views) {
      const frame = await page.evaluate((nextView) => {
        const audit = window.__TREE_TRUNK_AUDIT;
        return { ...audit.setView(nextView), ...audit.probeFrame() };
      }, view);
      const majorSpan = Math.max(frame.frameWidth, frame.frameHeight);
      const minorSpan = Math.min(frame.frameWidth, frame.frameHeight);
      if (!(majorSpan >= 0.35 && majorSpan <= 1.95 && minorSpan >= 0.01)) {
        throw new Error(`${species}/${view}: invalid framing ${frame.frameWidth.toFixed(3)} x ${frame.frameHeight.toFixed(3)}`);
      }
      if (!(frame.variance >= 20 && frame.opaqueRatio >= 0.99)) {
        throw new Error(`${species}/${view}: blank/flat render probe (${frame.variance.toFixed(1)} variance)`);
      }
      if (captureShots) {
        const dir = path.join(outDir, species);
        fs.mkdirSync(dir, { recursive: true });
        await page.screenshot({ path: path.join(dir, `${view}.png`) });
      }
      frames.push(frame);
    }
    rows.push({ species, ...base, frames });
    process.stdout.write(`\r[tree-trunk-cert] ${rows.length}/${speciesList.length} ${species} ${base.score.toFixed(1)}/100`);
  }
} finally {
  await browser.close();
  await server.close();
}
process.stdout.write('\n');
if (pageErrors.length) throw new Error(`browser errors:\n${pageErrors.join('\n')}`);

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  threshold: 90,
  viewCount: views.length,
  speciesCount: rows.length,
  minimumScore: Math.min(...rows.map((row) => row.score)),
  rows,
};
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(`[tree-trunk-cert] PASS ${rows.length} species x ${views.length} views; minimum ${report.minimumScore.toFixed(1)}/100`);
