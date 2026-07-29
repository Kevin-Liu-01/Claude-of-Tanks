// TEMP r6 diag: what materials does a wreck actually get after setDestroyed?
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: { port: 5700 + Math.floor(Math.random() * 90), strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 800, height: 500, deviceScaleFactor: 1 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  const out = await page.evaluate(() => {
    const D = window.__DEBUG;
    D.startBattle('t90m');
    return new Promise((res) => setTimeout(() => {
      const ent = D.game.tanks.find((t) => t.specId === 'm1a2_tusk' || t.specId === 'm1a2');
      if (!ent) return res({ err: 'no m1a2 found', roster: D.game.tanks.map((t) => t.specId) });
      ent.visual.setDestroyed({ pop: true, ageS: 0.6 });
      const stats = { burn: 0, burntFallback: 0, other: {}, samples: [] };
      ent.visual.root.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        const m = o.material;
        const key = m && m.customProgramCacheKey ? String(m.customProgramCacheKey()) : '(none)';
        if (key.includes('burn-r6')) stats.burn++;
        else if (key.includes('burnt-triplanar')) stats.burntFallback++;
        else { stats.other[key] = (stats.other[key] || 0) + 1; }
        if (stats.samples.length < 14) stats.samples.push({ name: (o.name || o.type).slice(0, 30), key: key.slice(0, 44), std: !!(m && m.isMeshStandardMaterial), arr: Array.isArray(m) });
      });
      res({ specId: ent.specId, stats });
    }, 1800));
  });
  console.log(JSON.stringify(out, null, 1));
} finally {
  await browser.close(); await server.close();
}
if (errs.length) { console.log('ERRORS:', errs.slice(0, 6)); process.exit(1); }
