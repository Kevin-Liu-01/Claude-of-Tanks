// r4 content_breadth: tech-tree verification probe.
// - opens the tree (community + germany tabs), captures screenshots
// - dispatches a synthetic pointerdown (regression: setPointerCapture throw)
// - buys one research module on an available ghost, verifies pip state
// - fails on ANY page console error
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = '/private/tmp/claude-501/-Users-kevinliu/1f4a2c2a-8139-4172-b5ea-dd578fb917a3/scratchpad/verify';
mkdirSync(OUT, { recursive: true });

const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: { port: 5904, strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
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

// open tech tree via the garage debug api
await page.evaluate(() => {
  const g = window.__DEBUG.garage || window.__DEBUG.game?.garage;
  if (g && g.showTechTree) { g.showTechTree('community'); return 'api'; }
  document.querySelector('.cot-tech')?.click();
  return 'click';
});
await new Promise((r) => setTimeout(r, 1200));
// ensure community tab
await page.evaluate(() => {
  const tabs = [...document.querySelectorAll('.cot-tt-tab')];
  tabs.find((t) => t.textContent.trim().toUpperCase().includes('COMMUNITY'))?.click();
});
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: `${OUT}/tt_community.png` });

// synthetic pointerdown/up on the pan surface (old code threw NotFoundError)
await page.evaluate(() => {
  const view = document.querySelector('.cot-tt-view');
  view.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 999, button: 0, clientX: 900, clientY: 500, bubbles: true }));
  view.dispatchEvent(new PointerEvent('pointermove', { pointerId: 999, clientX: 940, clientY: 520, bubbles: true }));
  view.dispatchEvent(new PointerEvent('pointerup', { pointerId: 999, clientX: 940, clientY: 520, bubbles: true }));
});
await new Promise((r) => setTimeout(r, 300));

// germany tab: module purchase flow on an available ghost
await page.evaluate(() => {
  const tabs = [...document.querySelectorAll('.cot-tt-tab')];
  tabs.find((t) => t.textContent.trim().toUpperCase() === 'GERMANY' ||
    t.textContent.toUpperCase().includes('GERMANY'))?.click();
});
await new Promise((r) => setTimeout(r, 800));
const buy = await page.evaluate(() => {
  const card = document.querySelector('.cot-tt-node.ghost.available');
  if (!card) return { ok: false, why: 'no available ghost' };
  const before = card.querySelector('.res')?.textContent || '';
  card.click();
  return { ok: true, before };
});
await new Promise((r) => setTimeout(r, 600));
const after = await page.evaluate(() => {
  const card = document.querySelector('.cot-tt-node.ghost.available .res');
  const wallet = document.querySelector('.wxp')?.textContent;
  return { res: card ? card.textContent : null, wallet };
});
await page.screenshot({ path: `${OUT}/tt_germany_after_buy.png` });
console.log(JSON.stringify({ buy, after, errs }));
await browser.close(); await server.close(); process.exit(errs.length ? 1 : 0);
