// tools/tmp-critic-tm-r6b.mjs — articulation re-test with EXACT configured
// turret nodes (r6 first pass hit wrong Object_N meshes with a loose regex).
// Yaws the configured turret node +40deg on four GLB heroes and screenshots.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('shots/tm_r6');
mkdirSync(outDir, { recursive: true });

const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: { port: 6700 + Math.floor(Math.random() * 200), strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
  optimizeDeps: {
    entries: ['index.html'],
    include: ['three', 'three/examples/jsm/loaders/GLTFLoader.js',
      'three/examples/jsm/utils/SkeletonUtils.js',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/geometries/RoundedBoxGeometry.js'],
  },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
console.log(`[tm-r6b] vite up at ${url}`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const CHIP = { ww2: 'WWII', modern: 'MODERN', community: 'COMMUNITY' };
const TARGETS = [
  // [group, id, turretNodeRegexSource]
  ['modern', 'm1a2_tusk', '^TurretPivot$'],
  ['modern', 't80u', '^Object09_24$'],
  ['community', 'tiger2', '^Object_2$'],
  ['community', 'kv2', '^turret$'],
];

async function clickChip(group) {
  return page.evaluate((label) => {
    const chip = [...document.querySelectorAll('.cot-era-chip')].find((c) => c.textContent.toUpperCase().includes(label));
    if (!chip) return false; chip.click(); return true;
  }, CHIP[group]);
}
async function clickCard(id) {
  return page.evaluate((tid) => {
    const card = [...document.querySelectorAll('.cot-card')].find((c) => c.querySelector(`img[data-cot-thumb="${tid}"]`));
    if (!card) return false; card.scrollIntoView(); card.click(); return true;
  }, id);
}
async function waitPedestal(id, timeoutMs = 16000) {
  const t0 = Date.now(); let last = -1, stable = 0;
  while (Date.now() - t0 < timeoutMs) {
    const n = await page.evaluate((tid) => {
      const D = window.__DEBUG; if (!D) return -2;
      let found = null;
      D.scene.traverse((o) => {
        if (found || !o.name || o.name !== `tank_${tid}`) return;
        const dx = o.position.x + 1500, dz = o.position.z + 1500;
        if (dx * dx + dz * dz <= 3600) found = o;
      });
      if (!found || !found.visible) return -1;
      let vis = 0; found.traverse((c) => { if (c.isMesh && c.visible) vis++; });
      return vis;
    }, id);
    if (n > 0 && n === last) { stable++; if (stable >= 2) return n; } else stable = 0;
    last = n;
    await new Promise((r) => setTimeout(r, 700));
  }
  return -1;
}

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 3000));

  for (const [group, id, nodeRe] of TARGETS) {
    await clickChip(group);
    await new Promise((r) => setTimeout(r, 250));
    if (!(await clickCard(id))) { console.log(`  ${id}: CARD NOT FOUND`); continue; }
    await waitPedestal(id);
    const res = await page.evaluate((tid, reSrc) => {
      const D = window.__DEBUG; if (!D) return 'no debug';
      let root = null;
      D.scene.traverse((o) => {
        if (root || o.name !== `tank_${tid}`) return;
        const dx = o.position.x + 1500, dz = o.position.z + 1500;
        if (dx * dx + dz * dz <= 3600) root = o;
      });
      if (!root) return 'no pedestal root';
      const re = new RegExp(reSrc);
      let node = null;
      root.traverse((o) => { if (!node && o.name && re.test(o.name)) node = o; });
      if (!node) return `NODE ${reSrc} NOT FOUND`;
      node.rotation.y += 0.7;
      return `rotated ${node.name}`;
    }, id, nodeRe);
    console.log(`  ${id}: ${res}`);
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: `${outDir}/art2_${id}.png` });
    console.log(`[tm-r6b] captured art2_${id}.png`);
  }
} catch (err) {
  console.error(`[tm-r6b] FAILED: ${err.message}`);
} finally {
  if (errors.length) { console.error(`[tm-r6b] console errors (${errors.length}):`); for (const e of errors.slice(0, 10)) console.error('  ' + e); }
  await browser.close();
  await server.close();
}
process.exit(0);
