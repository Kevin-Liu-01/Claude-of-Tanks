// r4 content_breadth: project world points to screen in battlefield_winter
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: { port: 5903, strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
  optimizeDeps: { entries: ['index.html'], include: ['three'] },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
await page.evaluate(() => window.__SHOTS.set('battlefield_winter'));
await new Promise((r) => setTimeout(r, 3500));
const out = await page.evaluate(() => {
  const D = window.__DEBUG;
  const cam = D.camera || D.game?.camera;
  if (!cam) return 'no camera on __DEBUG: ' + Object.keys(D).join(',');
  const pts = [
    [-24, -206], [48, -206], [-24, -152], [-2, -158], [56, -158],
    [66, -244], [138, -244], [88, -178], [156, -178], [0, -120], [-60, -180],
    [-40, -120], [-80, -80], [-120, -40], [0, -60],
  ];
  const res = [];
  const v = new (Object.getPrototypeOf(cam.position).constructor)();
  for (const [x, z] of pts) {
    const y = D.game?.world?.heightField?.getHeightAt?.(x, z) ?? 2;
    v.set(x, y + 1, z);
    const p = v.clone().project(cam);
    res.push({ x, z, sx: Math.round((p.x * 0.5 + 0.5) * 1920), sy: Math.round((-p.y * 0.5 + 0.5) * 1080), inz: p.z < 1 && p.z > -1 });
  }
  return res;
});
console.log(JSON.stringify(out));
await browser.close(); await server.close(); process.exit(0);
