// tools/extract-profiles.mjs — measure every reference GLB into authoring
// data: silhouette polylines (side/plan/front, whole + hull-only) and 14
// hull cross-section stations, traced from 1024px ortho mask renders in the
// fidelity lab (&profiles=1). Output: docs/references/profiles/<id>.json.
// These are measurements (like reading dimensions off photos), never vertex
// data — the from-scratch rebuild program authors against these curves.
//
// Usage: node tools/extract-profiles.mjs [--ids=a,b]

import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const eq = args.find((a) => a.startsWith('--ids='));
const requested = eq ? eq.slice(6).split(',').map((s) => s.trim()).filter(Boolean) : null;
const OUT = path.join(ROOT, 'docs', 'references', 'profiles');
fs.mkdirSync(OUT, { recursive: true });

const server = await createServer({
  root: ROOT,
  logLevel: 'error',
  server: { port: 7100 + Math.floor(Math.random() * 200), strictPort: false, hmr: false, watch: null },
});
await server.listen();
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
page.setDefaultTimeout(120000);
const urlFor = (id) => `http://localhost:${server.config.server.port}/tools/procedural-fidelity.html?id=${encodeURIComponent(id)}&profiles=1`;

try {
  await page.goto(urlFor(requested?.[0] || 'm1a2'), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('Array.isArray(window.__REFERENCE_IDS)');
  const ids = requested || await page.evaluate('window.__REFERENCE_IDS');
  let done = 0;
  for (const id of ids) {
    try {
      await page.goto(urlFor(id), { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('window.__FIDELITY_READY === true', { polling: 60 });
      const profiles = await page.evaluate('window.__PROFILES');
      if (!profiles) throw new Error('no __PROFILES on page');
      fs.writeFileSync(path.join(OUT, `${id}.json`), `${JSON.stringify(profiles)}\n`);
      done++;
      console.log(`[profiles ${String(done).padStart(2)}/${ids.length}] ${id} (${profiles.stations.filter((s) => !s.empty).length} stations)`);
    } catch (error) {
      console.error(`[profiles] ${id}: ${error.message}`);
    }
  }
  console.log(`\nextract-profiles: ${done}/${ids.length} written to docs/references/profiles/`);
} finally {
  await browser.close();
  await server.close();
}
