// r4 content_breadth: isolate the desert "scrub-shadow band" source.
// Captures the band region crop under: baseline / bushes no shadow /
// bushes hidden / tufts hidden too.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = '/private/tmp/claude-501/-Users-kevinliu/1f4a2c2a-8139-4172-b5ea-dd578fb917a3/scratchpad/bandprobe';
mkdirSync(OUT, { recursive: true });

const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: { port: 5900, strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
  optimizeDeps: { entries: ['index.html'], include: ['three'] },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
page.on('pageerror', (e) => console.error('PAGEERR', String(e)));
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
await page.evaluate(() => window.__SHOTS.set('battlefield_desert'));
await new Promise((r) => setTimeout(r, 3500));

async function crop(name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 300, y: 780, width: 900, height: 300 } });
  console.log('captured', name);
}

await crop('A_baseline');

// classify vegetation meshes
const info = await page.evaluate(() => {
  const D = window.__DEBUG; const out = [];
  const veg = [];
  D.scene.traverse((o) => { if (o.name === 'vegetation') veg.push(o); });
  veg.forEach((g) => g.traverse((m) => {
    if (m.isInstancedMesh || m.isMesh) {
      m.geometry.computeBoundingSphere?.();
      out.push({
        type: m.isInstancedMesh ? 'inst' : 'mesh',
        count: m.count ?? 1,
        r: m.geometry.boundingSphere ? +m.geometry.boundingSphere.radius.toFixed(2) : -1,
        cast: !!m.castShadow, hasFade: !!m.geometry.getAttribute?.('aFadeI'),
      });
    }
  }));
  return out;
});
console.log(JSON.stringify(info, null, 1));

// B: bushes (small-radius instanced w/ fade attr) stop casting shadows
await page.evaluate(() => {
  const D = window.__DEBUG;
  window.__mods = [];
  D.scene.traverse((g) => {
    if (g.name !== 'vegetation') return;
    g.traverse((m) => {
      if (m.isInstancedMesh && m.castShadow && m.geometry.boundingSphere && m.geometry.boundingSphere.radius < 5) {
        window.__mods.push(m); m.castShadow = false;
      }
    });
  });
  return window.__mods.length;
});
await new Promise((r) => setTimeout(r, 700));
await crop('B_bush_noshadow');

// C: hide those meshes entirely
await page.evaluate(() => { for (const m of window.__mods) m.visible = false; });
await new Promise((r) => setTimeout(r, 700));
await crop('C_bush_hidden');

// D: hide ALL vegetation
await page.evaluate(() => {
  const D = window.__DEBUG;
  D.scene.traverse((g) => { if (g.name === 'vegetation') g.visible = false; });
});
await new Promise((r) => setTimeout(r, 700));
await crop('D_noveg');

await browser.close(); await server.close(); process.exit(0);
