// Authoring-only baker: converts local, untracked GLBs in public/models/props/
// into a compact
// synchronous-importable JSON module (src/world/props-models.json).
// GLTF parsing/texture decoding happens in headless Chromium via three's
// GLTFLoader (tools/bake-page.html); geometry is world-transformed, painted
// into vertex colors (palette textures sampled per-vertex) and welded.
// Usage: node tools/bake-props-models.mjs model1.glb model2.glb ...
//        (no args = bake every .glb in public/models/props)

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { readdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const dir = resolve('public/models/props');
const args = process.argv.slice(2);
const files = (args.length ? args : (existsSync(dir) ? readdirSync(dir) : []).filter((f) => f.endsWith('.glb')))
  .map((f) => ({ name: basename(f, '.glb'), url: '/models/props/' + basename(f) }));
if (!files.length) {
  throw new Error('No local prop GLBs found. Source binaries are intentionally untracked; restore an attributed authoring input before rebaking.');
}

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5900, strictPort: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/tools/bake-page.html`;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('[bake] pageerror', String(e)));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__BAKE_READY === true', { timeout: 30000 });

const baked = await page.evaluate((fs) => window.__BAKE(fs), files);
await browser.close();
await server.close();

const outPath = resolve('src/world/props-models.json');
const existing = args.length && existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : {};
let ok = 0;
for (const [name, m] of Object.entries(baked)) {
  if (m.error) { console.error(`[bake] ${name}: ${m.error}`); continue; }
  existing[name] = m;
  ok++;
  const kb = Math.round(JSON.stringify(m).length / 1024);
  console.log(`[bake] ${name}: ${m.tris} tris, ${kb} KB, bbox ${m.bbox.min.map((v)=>v.toFixed(1))} .. ${m.bbox.max.map((v)=>v.toFixed(1))}`);
}
writeFileSync(outPath, JSON.stringify(existing));
console.log(`[bake] wrote ${outPath} (${ok}/${files.length} models, ${Math.round(JSON.stringify(existing).length / 1024)} KB total)`);
