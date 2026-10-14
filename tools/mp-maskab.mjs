#!/usr/bin/env node
/**
 * The damage panel's top-down masks, tree against tree (2026-10-13, the MP stream; MP-SINCE-0930 plan step 3, MU.01).
 * fix/top-mask-coverage-materials draws the mask passes with coverage-only stand-ins instead of each tank's real
 * materials (about 38 light-less program variants per entry that no battle frame uses). The panel reads alpha alone, so
 * the change must leave every mask's alpha exactly as it was. This proves it over the whole playable fleet: each tree's
 * dev server and one headless page at the Garage builds every tank's hull and turret masks (prepareTopDownMasks, the
 * product's own path) and returns their pixels; the report compares alpha pixel for pixel (and the mask geometry), counts
 * RGB differences for information, and records the programs the passes added and their wall time.
 *
 *   node tools/mp-maskab.mjs --a=<tree A> --b=<tree B> [--ids=m1a2,t90m] [--limit=N] [--out=<dir>] [--json]
 *   Needs the capture lock (GPU): run it under the lane's lock wrapper.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import net from 'node:net';
import puppeteer from 'puppeteer';

const root = new URL('..', import.meta.url).pathname;
const arg = (name, fallback) => (process.argv.find((entry) => entry.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).slice(name.length + 3);
const json = process.argv.includes('--json');
const trees = { A: resolve(arg('a', root)), B: resolve(arg('b', root)) };
const idFilter = arg('ids', '').split(',').filter(Boolean);
const limit = Number(arg('limit', 0));
const outDir = resolve(arg('out', join(root, '.qa-dev', 'mp-maskab')));
const log = (line) => { if (!json) process.stderr.write(`[mp-maskab] ${line}\n`); };

const freePort = () => new Promise((done, fail) => {
  const probe = net.createServer();
  probe.once('error', fail);
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => done(port)); });
});

/** In the page: build every tank's masks through the product's path and return their pixels (alpha as base64). */
async function collectMasks(ids, filter, cap) {
  const thumbs = await import('/src/ui/tankThumbs.ts');
  const specs = await import('/src/vehicles/specs.ts');
  const renderer = window.__DEBUG?.renderer ?? null;
  // the battle HUD's loader installs the rig (battleHudAccess.ts); at the Garage the tool installs the same one
  if (renderer) thumbs.initTopMaskRig({ renderer });
  const programs = () => renderer?.info?.programs?.length ?? null;
  let list = ids ?? [...specs.PRODUCTION_TANK_IDS];
  if (filter.length) list = list.filter((id) => filter.includes(id));
  if (cap > 0) list = list.slice(0, cap);
  const pixels = (canvas) => {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const alpha = new Uint8Array(width * height);
    const rgb = new Uint8Array(width * height * 3);
    for (let i = 0, j = 0, k = 0; i < data.length; i += 4, j++, k += 3) { alpha[j] = data[i + 3]; rgb[k] = data[i]; rgb[k + 1] = data[i + 1]; rgb[k + 2] = data[i + 2]; }
    const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
    return { width, height, alpha: b64(alpha), rgb: b64(rgb) };
  };
  const out = { ids: list, programsBefore: programs(), tanks: [] };
  const started = performance.now();
  for (const id of list) {
    const at = performance.now();
    const before = programs();
    let entry = null, error = null;
    try { entry = await thumbs.prepareTopDownMasks(specs.getSpec(id)); } catch (e) { error = String(e?.message ?? e); }
    const row = { id, ms: Math.round(performance.now() - at), programsAdded: before === null ? null : programs() - before, error: error ?? (entry ? null : 'no_entry') };
    if (entry) {
      const { canvas: hullCanvas, ...hull } = entry.hull;
      const { canvas: turretCanvas, ...turret } = entry.turret;
      row.hull = { ...hull, ...pixels(hullCanvas) };
      row.turret = { ...turret, ...pixels(turretCanvas) };
      row.pivot = entry.pivot;
    }
    out.tanks.push(row);
  }
  out.programsAfter = programs();
  out.wallMs = Math.round(performance.now() - started);
  return out;
}

async function runTree(label, tree, browser, ids) {
  const { createServer } = await import(pathToFileURL(join(tree, 'node_modules/vite/dist/node/index.js')).href);
  const port = await freePort();
  const server = await createServer({ root: tree, configFile: join(tree, 'vite.config.ts'), cacheDir: join(outDir, `vite-cache-${label}`), logLevel: 'error',
    server: { host: '127.0.0.1', port, strictPort: true, hmr: false } });
  await server.listen();
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message ?? error)));
  try {
    await page.setViewport({ width: 1024, height: 640, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${port}/?nosplash=1&tier=desktop&gfxreset=1`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
    await page.waitForFunction(() => window.__GAME_READY === true && window.__DEBUG?.game?.phase === 'garage', { timeout: 300_000, polling: 250 });
    log(`${label}: garage ready (${tree})`);
    const result = await page.evaluate(collectMasks, ids, idFilter, limit);
    const sha = await import('node:child_process').then(({ execFileSync }) => execFileSync('git', ['rev-parse', '--short=9', 'HEAD'], { cwd: tree, encoding: 'utf8' }).trim()).catch(() => null);
    log(`${label}: ${result.tanks.length} tanks in ${(result.wallMs / 1000).toFixed(1)} s, programs ${result.programsBefore} -> ${result.programsAfter}`);
    return { label, tree, sha, errors, ...result };
  } finally {
    await context.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

const decode = (b64) => Buffer.from(b64, 'base64');
function compare(a, b) {
  const rows = [];
  for (const tankA of a.tanks) {
    const tankB = b.tanks.find((entry) => entry.id === tankA.id);
    const row = { id: tankA.id, msA: tankA.ms, msB: tankB?.ms ?? null, programsA: tankA.programsAdded, programsB: tankB?.programsAdded ?? null };
    // errorB 'missing' only when B has no row for the tank; null when B built it (2026-10-13: 'missing' read as B's failure)
    if (!tankB || tankA.error || tankB.error) { rows.push({ ...row, verdict: 'error', errorA: tankA.error, errorB: tankB ? tankB.error : 'missing' }); continue; }
    for (const part of ['hull', 'turret']) {
      const pa = tankA[part], pb = tankB[part];
      const geometry = Object.keys(pa).filter((key) => !['alpha', 'rgb', 'width', 'height'].includes(key)).every((key) => JSON.stringify(pa[key]) === JSON.stringify(pb[key]));
      const sizeSame = pa.width === pb.width && pa.height === pb.height;
      let alphaDiff = 0, alphaMax = 0, rgbDiff = 0;
      if (sizeSame) {
        const aa = decode(pa.alpha), ab = decode(pb.alpha), ra = decode(pa.rgb), rb = decode(pb.rgb);
        for (let i = 0; i < aa.length; i++) { const d = Math.abs(aa[i] - ab[i]); if (d) { alphaDiff++; if (d > alphaMax) alphaMax = d; } }
        for (let i = 0; i < ra.length; i += 3) if (ra[i] !== rb[i] || ra[i + 1] !== rb[i + 1] || ra[i + 2] !== rb[i + 2]) rgbDiff++;
      }
      row[part] = { size: `${pa.width}x${pa.height}`, sizeSame, geometry, alphaDiff, alphaMax, rgbDiff,
        alphaSha: createHash('sha256').update(decode(pa.alpha)).digest('hex').slice(0, 12) };
    }
    row.pivotSame = JSON.stringify(tankA.pivot) === JSON.stringify(tankB.pivot);
    row.verdict = ['hull', 'turret'].every((part) => row[part].sizeSame && row[part].geometry && row[part].alphaDiff === 0) && row.pivotSame ? 'identical' : 'differs';
    rows.push(row);
  }
  return rows;
}

await mkdir(outDir, { recursive: true });
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 900_000,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--enable-webgl', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
let report;
try {
  const a = await runTree('A', trees.A, browser, null);
  const b = await runTree('B', trees.B, browser, a.ids);
  const rows = compare(a, b);
  const sum = (list, key) => list.reduce((total, value) => total + (Number(value[key]) || 0), 0);
  report = {
    a: { tree: a.tree, sha: a.sha, tanks: a.tanks.length, wallMs: a.wallMs, programsAdded: a.programsAfter - a.programsBefore, errors: a.errors.slice(0, 5) },
    b: { tree: b.tree, sha: b.sha, tanks: b.tanks.length, wallMs: b.wallMs, programsAdded: b.programsAfter - b.programsBefore, errors: b.errors.slice(0, 5) },
    identical: rows.filter((row) => row.verdict === 'identical').length, differs: rows.filter((row) => row.verdict === 'differs').map((row) => row.id),
    errors: rows.filter((row) => row.verdict === 'error').map((row) => ({ id: row.id, a: row.errorA, b: row.errorB })),
    msA: sum(a.tanks, 'ms'), msB: sum(b.tanks, 'ms'), rows,
  };
  await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
} finally {
  await browser.close().catch(() => {});
}
if (json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`mp maskab: A ${report.a.sha} vs B ${report.b.sha}: ${report.identical}/${report.rows.length} tanks with identical masks (alpha pixel for pixel, geometry, pivot); differs ${report.differs.length ? report.differs.join(',') : 'none'}; errors ${report.errors.length}`);
  console.log(`  mask build wall: A ${(report.msA / 1000).toFixed(1)} s, B ${(report.msB / 1000).toFixed(1)} s; programs the passes added: A ${report.a.programsAdded}, B ${report.b.programsAdded}`);
  for (const row of report.rows.filter((entry) => entry.verdict !== 'identical').slice(0, 12)) console.log(`  ${row.id}: ${row.verdict} ${JSON.stringify({ hull: row.hull, turret: row.turret, errorA: row.errorA, errorB: row.errorB })}`);
  console.log(`  report: ${join(outDir, 'report.json')}`);
}
process.exitCode = report && report.differs.length === 0 && report.errors.length === 0 ? 0 : 1;
