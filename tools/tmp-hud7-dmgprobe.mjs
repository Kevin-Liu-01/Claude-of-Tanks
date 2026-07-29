// hud_ui r7 probe: drive src/ui/damagePanel.js DIRECTLY (vite module import)
// and verify the damaged state — module icons + zone floods pop orange/red on
// the silhouette and dead crew appears as a red chip; healthy panel shows
// nothing but silhouette + HP. Writes shots/hud_r7/dmg_panel_probe.png
// (left = healthy, right = damaged).
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { port: 5900 + Math.floor(Math.random() * 90), strictPort: false },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
mkdirSync(resolve('shots/hud_r7'), { recursive: true });

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--window-size=800,400'],
  defaultViewport: { width: 800, height: 400 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.evaluate(async () => {
  // kill the booting game's DOM/loop noise — we only need module imports
  document.body.innerHTML = '';
  document.body.style.background = '#25301f';
  const dp = await import('/src/ui/damagePanel.js');
  const specs = await import('/src/vehicles/specs.js');
  const spec = specs.getSpec('m1a2');
  const mk = (label, stage) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;top:30px;width:360px;height:340px;';
    wrap.style.left = label === 'healthy' ? '20px' : '420px';
    const p = dp.createDamagePanel();
    p.root.style.position = 'absolute';
    p.root.style.left = '40px';
    p.root.style.bottom = 'auto';
    p.root.style.top = '40px';
    wrap.appendChild(p.root);
    document.body.appendChild(wrap);
    p.setTank(spec);
    if (stage) p.setState(stage);
    return p;
  };
  window.__P1 = mk('healthy', null);
  window.__P2 = mk('damaged', {
    hpFrac: 0.42,
    modules: { engine: 'yellow', ammoRack: 'red', trackL: 'yellow' },
    crew: { gunner: false },
    burning: false,
  });
});
// let the side_silhouette.png decode + redraw, then re-apply the staged state
await new Promise((r) => setTimeout(r, 1800));
await page.evaluate(() => {
  window.__P2.setState({
    hpFrac: 0.42,
    modules: { engine: 'yellow', ammoRack: 'red', trackL: 'yellow' },
    crew: { gunner: false },
  });
});
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: resolve('shots/hud_r7/dmg_panel_probe.png') });
console.log('probe written; console errors:', errors.length ? errors.slice(0, 4) : 'none');
await browser.close();
await server.close();
process.exit(0);
