// lighting_post r3 A/B probe: screenshot battlefield, apply candidate fixes
// in-page, re-screenshot. HMR-robust: re-asserts the view before captures.
// Usage: node tools/tmp-lp-r3-abprobe.mjs
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const port = 5700 + Math.floor(Math.random() * 200);
const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  // concurrent specialist agents edit src/ while this probe runs — disable
  // file watching so HMR can never reload the page mid-capture
  server: { port, strictPort: false, watch: null, hmr: false },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
page.on('pageerror', (e) => console.error('PAGEERROR', String(e)));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });

async function ensureView(name) {
  for (let i = 0; i < 5; i++) {
    await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
    await page.evaluate((v) => window.__SHOTS.set(v), name);
    await new Promise((r) => setTimeout(r, 2400));
    const ok = await page.evaluate(() => window.__DEBUG && window.__DEBUG.game.phase === 'shot');
    if (ok) return;
    console.warn('view reverted (HMR reload?) — retrying');
  }
  throw new Error('could not hold shot view');
}

await ensureView('battlefield');
await page.screenshot({ path: 'shots/crops/r3lp_ab_base.png' });

// A: disable frustum culling on every tank mesh (shadow-camera culling test)
const applied = await page.evaluate(() => {
  const D = window.__DEBUG;
  if (D.game.phase !== 'shot') return false;
  let n = 0;
  for (const t of D.game.tanks) {
    if (!t.visual) continue;
    t.visual.root.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; n++; } });
  }
  D.lighting.update(true);
  return n;
});
console.log('meshes uncullled:', applied);
await new Promise((r) => setTimeout(r, 500));
const still = await page.evaluate(() => window.__DEBUG.game.phase);
console.log('phase before B shot:', still);
await page.screenshot({ path: 'shots/crops/r3lp_ab_nocull.png' });

await browser.close();
await server.close();
