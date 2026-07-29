// TEMP critic probe: does anything mutate a shell:hit event AFTER bus emit?
// Captures deep copy at emit + live reference; diffs them 3s (sim) later.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5960 + Math.floor(Math.random() * 30), strictPort: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 480000, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', String(e)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });

const out = await page.evaluate(async () => {
  const D = window.__DEBUG;
  const yieldTask = () => new Promise((r) => setTimeout(r, 0));
  const caps = [];
  D.bus.on('shell:hit', (ev) => caps.push({ copy: JSON.parse(JSON.stringify(ev)), ref: ev }));
  D.startBattle('m1a2', 'verdant');
  await yieldTask();
  const pid = D.game.player.id;
  const mine = () => caps.filter((c) => c.copy.attackerId === pid && c.copy.targetId !== pid);
  let aimed = null;
  for (let i = 0; i < 40 && !aimed; i++) { aimed = D.aimAtNearest(); if (!aimed) { D.fastForward(1.5); await yieldTask(); } }
  if (!aimed) return { ok: false, why: 'no target' };
  for (let t = 0; t < 8 && mine().length === 0; t++) {
    for (let s = 0; s < 30; s++) { const st = D.aimState(); if (st && st.errMrad < 2.5 && st.reloadT <= 0) break; D.fastForward(0.25); await yieldTask(); }
    D.flags.forceFire = true;
    for (let s = 0; s < 24 && mine().length === 0; s++) { D.fastForward(0.25); await yieldTask(); }
    D.flags.forceFire = false;
    if (!mine().length) { D.aimAtNearest(); await yieldTask(); }
  }
  if (!mine().length) return { ok: false, why: 'no hit' };
  // let the sim keep running: any later resolution step that mutates the
  // emitted object will show up as copy-vs-ref drift
  D.fastForward(3.0); await yieldTask();
  const c = mine()[mine().length - 1];
  const diffs = [];
  const keys = new Set([...Object.keys(c.copy), ...Object.keys(c.ref)]);
  for (const k of keys) {
    const a = JSON.stringify(c.copy[k]);
    const b = JSON.stringify(c.ref[k]);
    if (a !== b) diffs.push({ field: k, atEmit: a, later: b });
  }
  return { ok: true, kind: c.copy.kind, zoneAtEmit: c.copy.zone, zoneLater: c.ref.zone, diffs };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
await server.close();
