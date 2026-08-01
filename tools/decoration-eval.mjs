// tools/decoration-eval.mjs — headless capture driver for the decoration
// system (tools/decoration-board.html). Owns its own vite on a 7xxx port
// (never 5001/5002).
//
//   node tools/decoration-eval.mjs                 # catalog + the 8 marquee tanks
//   node tools/decoration-eval.mjs --ids=a,b       # subset of tank sheets
//   node tools/decoration-eval.mjs --catalog-only
//   node tools/decoration-eval.mjs --out=shots/decorations-r2
//
// Writes: <out>/catalog/<kit>.png, <out>/tank-<id>/<sheet>.png and
// <out>/report.json (per-kit tris + per-tank assertion table), and prints a
// summary table. Exits 1 when any tank assertion fails.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const arg = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : d; };
const OUT = path.resolve(ROOT, arg('out', 'shots/decorations-r1'));
const TANKS = arg('ids', 'tiger1,t34_85,m4a3e8,m60a1,kv2,leo2a6,k2,isu152').split(',').map((s) => s.trim()).filter(Boolean);
const CATALOG_ONLY = args.includes('--catalog-only');
const TANKS_ONLY = args.includes('--tanks-only');
fs.mkdirSync(OUT, { recursive: true });

const server = await createServer({
  root: ROOT, logLevel: 'error',
  server: { port: 7350 + Math.floor(Math.random() * 100), strictPort: false, hmr: false, watch: null },
});
await server.listen();
const port = server.config.server.port;
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1900, height: 1400, deviceScaleFactor: 1 });
page.setDefaultTimeout(240000);
page.on('pageerror', (e) => console.error('[page]', String(e).slice(0, 300)));

async function captureSheets(url, dir) {
  fs.mkdirSync(dir, { recursive: true });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__BOARD_READY === true', { polling: 100 });
  const ids = await page.evaluate(() => [...document.querySelectorAll('canvas[id]')].map((c) => c.id));
  for (const id of ids) {
    const el = await page.$(`#${id}`);
    // capture the CANVAS BITMAP (not the scaled element box)
    const data = await page.evaluate((cid) => document.getElementById(cid).toDataURL('image/png'), id);
    fs.writeFileSync(path.join(dir, `${id.replace(/^(kit_|sheet_)/, '')}.png`), Buffer.from(data.split(',')[1], 'base64'));
    void el;
  }
  return page.evaluate('window.__BOARD_REPORT');
}

const report = { generatedAt: new Date().toISOString(), catalog: null, tanks: [] };
try {
  if (!TANKS_ONLY) {
    console.log('[decor-eval] catalog…');
    report.catalog = await captureSheets(
      `http://localhost:${port}/tools/decoration-board.html?mode=catalog`,
      path.join(OUT, 'catalog'),
    );
    console.log(`[decor-eval] catalog: ${report.catalog.rows.length} kit variants captured`);
  }
  if (!CATALOG_ONLY) {
    for (const id of TANKS) {
      console.log(`[decor-eval] tank ${id}…`);
      try {
        const rep = await captureSheets(
          `http://localhost:${port}/tools/decoration-board.html?mode=tank&id=${encodeURIComponent(id)}`,
          path.join(OUT, `tank-${id}`),
        );
        report.tanks.push(rep.rows[0]);
        const a = rep.rows[0].asserts;
        console.log(`  ${id.padEnd(10)} tris ${String(a.summary ? a.summary.tris : '?').padStart(5)} ` +
          `draws ${a.summary ? a.summary.drawCalls : '?'} pieces ${a.summary ? a.summary.pieces.length : '?'} | ` +
          `width ${a.widthGuard.pass ? 'PASS' : 'FAIL'} sweep ${a.gunSweep.pass ? 'PASS' : 'FAIL'} ` +
          `metrology ${a.metrologyDecorNodes === 0 ? 'CLEAN' : 'DIRTY!'} burn ${a.burn.pass ? 'PASS' : 'FAIL'}`);
      } catch (e) {
        console.error(`  ${id}: FAILED — ${e.message}`);
        report.tanks.push({ id, error: e.message });
      }
    }
  }
} finally {
  await browser.close();
  await server.close();
}

fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 1)}\n`);
const bad = report.tanks.filter((t) => t.error
  || !t.asserts || !t.asserts.widthGuard.pass || !t.asserts.gunSweep.pass
  || t.asserts.metrologyDecorNodes !== 0 || !t.asserts.burn.pass);
console.log(`\n[decor-eval] done -> ${OUT} (${bad.length ? `FAILURES: ${bad.map((b) => b.id).join(',')}` : 'all assertions green'})`);
if (bad.length) process.exitCode = 1;
