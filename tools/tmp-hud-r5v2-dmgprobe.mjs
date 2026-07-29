// hud_ui r5-2 probe: damage panel schematic — healthy, damaged, and ROTATED
// TURRET states side by side, staged in a top z-index overlay AFTER the game
// boots (the game rebuilds body on boot). Writes shots/hud_r5v2/dmg_panel_probe.png.
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
mkdirSync(resolve('shots/hud_r5v2'), { recursive: true });

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--window-size=1100,420'],
  defaultViewport: { width: 1100, height: 420 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });

// Concurrent-agent HMR full-reloads can destroy the execution context at any
// moment — run the whole stage+shoot sequence in a retry loop.
const stageAll = async () => {
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
await page.evaluate(async () => {
  const dp = await import('/src/ui/damagePanel.js');
  const specs = await import('/src/vehicles/specs.js');
  const spec = specs.getSpec('m1a2');
  const ov = document.createElement('div');
  ov.id = 'dmgprobe-ov';
  ov.style.cssText = 'position:fixed;inset:0;background:#25301f;z-index:99999;';
  document.body.appendChild(ov);
  const mk = (x, stage, yaw) => {
    const p = dp.createDamagePanel();
    p.root.style.position = 'absolute';
    p.root.style.left = `${x}px`;
    p.root.style.bottom = 'auto';
    p.root.style.top = '60px';
    ov.appendChild(p.root);
    p.setTank(spec);
    if (yaw) p.setTurretYaw(yaw);
    if (stage) p.setState(stage);
    return p;
  };
  window.__P1 = mk(60, null, 0);
  window.__P2 = mk(420, {
    hpFrac: 0.42,
    modules: { engine: 'yellow', ammoRack: 'red', trackL: 'yellow', gun: 'yellow' },
    crew: { gunner: false },
  }, 0);
  window.__P3 = mk(780, null, 2.2); // turret swung right-rear ~126 deg
});
await new Promise((r) => setTimeout(r, 1800));
await page.evaluate(() => {
  window.__P1.setState({ hpFrac: 1 });
  window.__P2.setState({
    hpFrac: 0.42,
    modules: { engine: 'yellow', ammoRack: 'red', trackL: 'yellow', gun: 'yellow' },
    crew: { gunner: false },
  });
  window.__P3.setTurretYaw(2.2);
  window.__P3.setState({ hpFrac: 0.8 });
});
await new Promise((r) => setTimeout(r, 300));
};
let ok = false;
for (let attempt = 0; attempt < 4 && !ok; attempt++) {
  try {
    await stageAll();
    ok = true;
  } catch (e) {
    console.log(`stage attempt ${attempt} failed (${String(e).slice(0, 80)}), retrying`);
    errors.length = 0;
    await new Promise((r) => setTimeout(r, 3000));
  }
}
if (!ok) { console.log('staging never settled'); process.exit(1); }
await page.screenshot({ path: resolve('shots/hud_r5v2/dmg_panel_probe.png') });
console.log('probe written; console errors:', errors.length ? errors.slice(0, 4) : 'none');
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
