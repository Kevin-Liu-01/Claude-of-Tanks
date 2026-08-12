// Deterministic geometry-hash driver for tmp-hashgeo.html.
// Usage: node tools/tmp-hashgeo.mjs --ids=m60a1,m60a3
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const eq = process.argv.find((arg) => arg.startsWith('--ids='));
const ids = eq ? eq.slice(6).split(',').map((id) => id.trim()).filter(Boolean) : ['m60a1'];
const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: {
    port: 7450 + Math.floor(Math.random() * 100),
    strictPort: false,
    hmr: false,
    watch: null,
  },
});
await server.listen();

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
page.setDefaultTimeout(120000);

try {
  for (const id of ids) {
    await page.goto(
      `http://localhost:${server.config.server.port}/tools/tmp-hashgeo.html?id=${encodeURIComponent(id)}`,
      { waitUntil: 'domcontentloaded' },
    );
    await page.waitForFunction('window.__HASH_READY === true', { polling: 50 });
    const result = await page.evaluate('window.__GEOHASH');
    console.log(`${result.id}: hash ${result.hash} meshes ${result.meshCount} verts ${result.vertCount}`);
  }
} finally {
  await browser.close();
  await server.close();
}
