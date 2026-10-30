// The sourced photos decoded off the main thread compose byte for byte as before (260; the rooms census: a composition's
// first drawImage of a loaded photo decoded it on the main thread, 337 ms of a 597 ms room-entry task, and
// sourcedTextures.ts composeDecoded now draws bitmaps decoded from the photos' files, as the worker client does).
//
//   node tools/sourced-decode-digest.mjs [--json=<path>]
//
// In headless Chrome on the dev server, every photo under public/textures/{terrain,buildings} is read back the way the
// composer reads it (drawn into a willReadFrequently canvas), at its own size min(width, 1024) and at a phone's 512,
// once from the loaded element (the old draw, which decodes it) and once from createImageBitmap of its file; and every
// ambientCG / Poly Haven set's colour, AO and roughness go through the module's own composeAlbedo (roughness in alpha)
// and composeSurface both ways. Each unscaled readback's and each composition's SHA-256 must match. The scaled draws are
// reported, not held: the element decodes to the smaller size, so a bitmap reads other pixels there, which is why
// composeDecoded keeps the element for a scaled draw. The photos' readback times say what the main thread no longer pays.
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { launchGuardedBrowser } from './browser-launch.mjs';

const root = process.cwd();
const jsonPath = process.argv.find((a) => a.startsWith('--json='))?.slice(7) ?? '';
const files = ['terrain', 'buildings'].flatMap((dir) => readdirSync(join(root, 'public/textures', dir))
  .filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).map((f) => `/textures/${dir}/${f}`)).sort();
// the sets: a colour map and its AO and roughness by either naming
const sets = files.flatMap((color) => {
  const acg = /^(.*)_1K-JPG_Color\.jpg$/.exec(color), ph = /^(.*)_diff_1k\.jpg$/.exec(color);
  if (acg) return [{ color, ao: `${acg[1]}_1K-JPG_AmbientOcclusion.jpg`, rough: `${acg[1]}_1K-JPG_Roughness.jpg` }];
  if (ph) return [{ color, ao: `${ph[1]}_ao_1k.jpg`, rough: `${ph[1]}_rough_1k.jpg` }];
  return [];
}).map((s) => ({ ...s, ao: files.includes(s.ao) ? s.ao : null, rough: files.includes(s.rough) ? s.rough : null }));

const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 7700 + Math.floor(Math.random() * 300), strictPort: false, hmr: false, watch: null } });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await launchGuardedBrowser(puppeteer, { headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'], protocolTimeout: 600000 }, { label: 'sourced-decode-digest' });
let failures = 0;
try {
  const page = await browser.newPage();
  await page.goto(`${origin}/robots.txt`, { waitUntil: 'domcontentloaded', timeout: 900000 });
  const report = await page.evaluate(async (files, sets) => {
    const { composeAlbedo, composeSurface } = await import('/src/world/sourcedTextures.ts');
    // a fresh element per read (a query apart), so neither read borrows the other's decode
    let reads = 0;
    const element = (url) => new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error(url));
      im.src = `${url}?read=${++reads}`;
    });
    // the shipped path: the element loads, then its file's bitmap (sourceFileBitmap: the HTTP cache's blob)
    const bitmap = async (url) => {
      const im = await element(url);
      const response = await fetch(im.currentSrc || im.src, { cache: 'force-cache' });
      return createImageBitmap(await response.blob());
    };
    const source = (url, decoded) => (url ? (decoded ? bitmap(url) : element(url)) : null);
    const sha = async (data) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const pixels = (canvas) => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const readback = (image, s) => {
      const c = document.createElement('canvas');
      c.width = c.height = s;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      const t = performance.now();
      ctx.drawImage(image, 0, 0, s, s);
      return [ctx.getImageData(0, 0, s, s).data, performance.now() - t];
    };
    const rows = [];
    for (const url of files) {
      for (const desktop of [true, false]) {
        const [el, bm] = [await element(url), await bitmap(url)];
        const s = desktop ? Math.min(el.width, 1024) : 512;
        const [[a, elementMs], [b, bitmapMs]] = [readback(el, s), readback(bm, s)];
        const [elementSha, bitmapSha] = [await sha(a), await sha(b)];
        bm.close();
        rows.push({ kind: desktop ? 'photo' : 'photo scaled', size: s, url, element: elementSha, bitmap: bitmapSha,
          same: elementSha === bitmapSha, elementMs, bitmapMs });
      }
    }
    for (const set of sets) {
      const digest = async (decoded) => {
        const [color, ao, rough] = await Promise.all([set.color, set.ao, set.rough].map((u) => source(u, decoded)));
        const s = Math.min(color.width, 1024);
        const out = [await sha(pixels(composeAlbedo(color, ao, rough, { roughInAlpha: true }))),
          await sha(pixels(composeSurface(ao, rough, s, 0.9)))];
        for (const b of [color, ao, rough]) if (decoded) b?.close();
        return out;
      };
      const [[elementAlbedo, elementSurface], [bitmapAlbedo, bitmapSurface]] = [await digest(false), await digest(true)];
      rows.push({ kind: 'composeAlbedo', url: set.color, element: elementAlbedo, bitmap: bitmapAlbedo, same: elementAlbedo === bitmapAlbedo });
      rows.push({ kind: 'composeSurface', url: set.color, element: elementSurface, bitmap: bitmapSurface, same: elementSurface === bitmapSurface });
    }
    return rows;
  }, files, sets);
  const scaled = report.filter((row) => row.kind === 'photo scaled');
  const held = report.filter((row) => row.kind !== 'photo scaled');
  for (const row of held) if (!row.same) { failures++; console.log(`DIFFERS ${row.kind} ${row.url}: element ${row.element.slice(0, 12)} bitmap ${row.bitmap.slice(0, 12)}`); }
  const unscaled = report.filter((r) => r.kind === 'photo'), sum = (k) => unscaled.reduce((a, r) => a + r[k], 0);
  console.log(`the unscaled draw on the main thread, ${unscaled.length} photos: element ${sum('elementMs').toFixed(0)} ms, file bitmap ${sum('bitmapMs').toFixed(0)} ms`);
  console.log(`scaled to 512 (kept on the element): ${scaled.filter((r) => !r.same).length} of ${scaled.length} read other pixels from a bitmap`);
  console.log(`sourced-decode-digest: ${files.length} photos and ${sets.length} sets composed, ${held.length} digests held, ${failures} differing`);
  if (jsonPath) writeFileSync(jsonPath, JSON.stringify(report, null, 1));
} finally {
  await browser.close().catch(() => {});
  await server.close();
}
process.exit(failures ? 1 : 0);
