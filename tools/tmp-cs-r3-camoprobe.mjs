// tools/tmp-cs-r3-camoprobe.mjs — camo_spotting r3 TEMP verification probe.
// Cycles camo patterns on several tanks in the garage via the real picker UI
// and screenshots each combination. DELETED after the round's verification.
// Usage: node tools/tmp-cs-r3-camoprobe.mjs [--out <dir>] [--tanks a,b] [--patterns x,y]

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fb) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fb; };
const outDir = resolve(opt('out', 'shots/cs_r3_probe'));
const TANKS = (opt('tanks', 'tiger1,t34_85,t90m,m1a2,leo2a7')).split(',');
const PATTERNS = (opt('patterns', 'factory,summer,desert,winter,digital')).split(',');
mkdirSync(outDir, { recursive: true });

const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: {
    port: 6400 + Math.floor(Math.random() * 300), strictPort: false,
    hmr: false, watch: { ignored: ['**/*'] }, // concurrent editors must not reload the probe
  },
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
console.log(`[csprobe] vite up at ${url}`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1240, height: 720, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

let failed = false;
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 1500));

  for (const tank of TANKS) {
    // select the tank through the real carousel (era chips + cards)
    const sel = await page.evaluate((id) => {
      const NAMES = { tiger1: 'Tiger I', t34_85: 'T-34-85', t90m: 'T-90M Proryv', m1a2: 'M1A2 Abrams SEPv3', leo2a7: 'Leopard 2A7' };
      const want = NAMES[id] || id;
      for (const chip of document.querySelectorAll('.cot-era-chip')) {
        chip.click();
        for (const card of document.querySelectorAll('.cot-card')) {
          const nm = card.querySelector('.nmt');
          if (nm && nm.textContent.trim() === want) { card.click(); return nm.textContent.trim(); }
        }
      }
      return null;
    }, tank);
    if (!sel) { console.error(`[csprobe] FAIL: tank card not found: ${tank}`); failed = true; continue; }
    await new Promise((r) => setTimeout(r, 2500)); // pedestal swap + GLB lane
    for (const pat of PATTERNS) {
      const ok = await page.evaluate((pid) => {
        const grid = document.querySelectorAll('.cot-camos .cgrid')[0];
        if (!grid) return false;
        const order = ['auto', 'factory', 'summer', 'desert', 'winter', 'digital'];
        const idx = order.indexOf(pid);
        const cards = grid.querySelectorAll('.cot-camo-card');
        if (idx < 0 || !cards[idx]) return false;
        cards[idx].click();
        return true;
      }, pat);
      if (!ok) { console.error(`[csprobe] FAIL: pattern card ${pat}`); failed = true; continue; }
      await new Promise((r) => setTimeout(r, 1400)); // repaint + GLB recompose
      const file = `${outDir}/g_${tank}_${pat}.png`;
      await page.screenshot({ path: file });
      console.log(`[csprobe] captured ${file}`);
    }
    // restore factory so localStorage isn't left on the last cycled pattern
    await page.evaluate(() => {
      const grid = document.querySelectorAll('.cot-camos .cgrid')[0];
      if (grid) grid.querySelectorAll('.cot-camo-card')[1].click();
    });
  }
} catch (err) {
  failed = true;
  console.error(`[csprobe] FAILED: ${err.message}`);
} finally {
  if (errors.length) {
    console.error(`[csprobe] page console errors (${errors.length}):`);
    for (const e of errors.slice(0, 20)) console.error(`  ${e}`);
  }
  await browser.close();
  await server.close();
}
process.exit(failed || errors.length ? 1 : 0);
