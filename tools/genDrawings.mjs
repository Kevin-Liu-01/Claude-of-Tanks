#!/usr/bin/env node
// genDrawings.mjs — the technical drawings (258): each tank's side, top and front plates (2x and 1x WebP, text-free) and
// its drawing data (<id>_drawing.json: per view the frame, the scale, and the armour, module and crew polygons traced
// from the anatomy), rendered by tools/drawing-page.ts in headless Chrome. Copyright © 2026 Kevin B. Liu.
//
//   node tools/genDrawings.mjs --ids=t90m,t90am --out <dir> [--views=side,top,front]
//
// Writes into --out (a fresh folder for a review run; public/icons for the fleet). Run it inside the capture queue (a
// lane's capture wrapper); it opens one Vite server and a fresh browser per chunk of ids (tools/browser-id-chunks.mjs).
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { eachBrowserChunk } from './browser-id-chunks.mjs';
import { boundOrigin, loadReadyPage, toolServerOptions } from './tool-page-load.mjs';
import { filterPublishedImage } from './media-r5/master-filter.mjs';
import { uniqueIds } from './id-list.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback = '') => {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback;
};
const ids = uniqueIds(opt('ids').split(',').map((id) => id.trim()).filter(Boolean), 'genDrawings --ids');
const outDir = resolve(opt('out'));
const views = opt('views', 'side,top,front').split(',').filter(Boolean);
if (!ids.length || !opt('out')) {
  console.error('usage: node tools/genDrawings.mjs --ids=<a,b> --out <dir> [--views=side,top,front]');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const server = await createServer({
  root: process.cwd(), configFile: false, cacheDir: resolve('/tmp', `cot-drawings-vite-${process.pid}`),
  logLevel: 'error', optimizeDeps: { noDiscovery: true }, server: toolServerOptions(7600),
});
await server.listen();
let failed = false;
try {
  await eachBrowserChunk('tools/genDrawings.mjs', ids, async (chunk, { launch }) => {
    const browser = await launch(puppeteer, {
      headless: 'new', protocolTimeout: 15 * 60 * 1000,
      args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=3072'],
    });
    try {
      const page = await browser.newPage();
      page.on('pageerror', (error) => { failed = true; console.error(`[drawings] page error: ${String(error).slice(0, 400)}`); });
      await loadReadyPage(page, `${boundOrigin(server)}/tools/drawing-page.html`, { label: 'drawings', ready: 'window.__drawingReady === true' });
      for (const id of chunk) {
        const started = Date.now();
        const result = await page.evaluate((id, views) => window.__drawTank(id, views), id, views);
        let bytes = 0;
        for (const [name, dataUrl] of Object.entries(result.files)) {
          const raw = Buffer.from(dataUrl.split(',')[1], 'base64');
          const buffer = await filterPublishedImage(raw, `drawing-${name.replace(/\.[^.]+$/, '')}`, { type: 'image/webp', quality: 90 });
          writeFileSync(resolve(outDir, name), buffer);
          bytes += buffer.length;
          // the published bytes' hash beside the extent measured from them (the receipts refuse a plate replaced alone)
          const [, view, density] = name.match(/_drawing_(side|top|front)(_1x)?\.webp$/) ?? [];
          if (view) (result.data.views[view].plate.sha ??= ['', ''])[density ? 1 : 0] = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
        }
        const json = `${JSON.stringify(result.data)}\n`;
        writeFileSync(resolve(outDir, `${id}_drawing.json`), json);
        bytes += Buffer.byteLength(json);
        const counts = Object.entries(result.data.views).map(([view, v]) =>
          `${view} ${v.size.join('x')} ${v.pxPerM.toFixed(0)} px/m armour ${v.layers.armor.length} modules ${v.layers.modules.length} crew ${v.layers.crew.length}`).join('; ');
        console.log(`[drawings] ${id}: ${counts}; ${Math.round(bytes / 1024)} KB (${((Date.now() - started) / 1000).toFixed(1)} s)`);
      }
    } finally {
      await browser.close();
    }
  });
} catch (error) {
  failed = true;
  console.error(`[drawings] ${error?.stack || error}`);
} finally {
  await server.close();
}
process.exitCode = failed ? 1 : 0;
