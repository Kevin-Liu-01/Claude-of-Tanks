// r5 content_breadth: community tab credit legibility + sparse-tab fit probe
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = '/private/tmp/claude-501/-Users-kevinliu/1f4a2c2a-8139-4172-b5ea-dd578fb917a3/scratchpad/verify';
mkdirSync(OUT, { recursive: true });

const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: { port: 5906, strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
  optimizeDeps: { entries: ['index.html'], include: ['three'] },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });

await page.evaluate(() => {
  const g = window.__DEBUG.garage || window.__DEBUG.game?.garage;
  if (g && g.showTechTree) { g.showTechTree('community'); return 'api'; }
  document.querySelector('.cot-tech')?.click();
  return 'click';
});
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => {
  const tabs = [...document.querySelectorAll('.cot-tt-tab')];
  tabs.find((t) => t.textContent.trim().toUpperCase().includes('COMMUNITY'))?.click();
});
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: `${OUT}/tt_community_r5.png` });
// measure effective credit glyph size (font-size * cam scale)
const info = await page.evaluate(() => {
  const world = document.querySelector('.cot-tt-world');
  const m = /scale\(([\d.]+)\)/.exec(world.style.transform);
  const s = m ? parseFloat(m[1]) : 1;
  const cr = document.querySelector('.cot-tt-node .credit');
  const fs = cr ? parseFloat(getComputedStyle(cr).fontSize) : 0;
  return { zoom: s, creditPx: fs, effective: (fs * s).toFixed(1), cards: document.querySelectorAll('.cot-tt-node.comm').length };
});
console.log('community:', JSON.stringify(info));
// sparse tab: SWEDEN
await page.evaluate(() => {
  const tabs = [...document.querySelectorAll('.cot-tt-tab')];
  tabs.find((t) => t.textContent.toUpperCase().includes('ISRAEL'))?.click();
});
await new Promise((r) => setTimeout(r, 900));
const sw = await page.evaluate(() => {
  const world = document.querySelector('.cot-tt-world');
  const m = /scale\(([\d.]+)\)/.exec(world.style.transform);
  return { zoom: m ? parseFloat(m[1]) : 1, nodes: document.querySelectorAll('.cot-tt-node').length };
});
console.log('israel:', JSON.stringify(sw));
await page.screenshot({ path: `${OUT}/tt_sparse_r5.png` });
console.log('errors:', errs.length ? errs : 'none');
await browser.close();
await server.close();
process.exit(errs.length ? 1 : 0);
