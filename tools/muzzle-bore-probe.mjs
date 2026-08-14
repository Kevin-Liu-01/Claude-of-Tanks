// Visual proof for the fleet-wide muzzle-bore fallback. Structural coverage is
// enforced by tank-assets-check; this probe also renders representative main
// gun, autocannon and howitzer mouths straight-on and checks dark-center read.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const idsArg = process.argv.find((arg) => arg.startsWith('--ids='));
const outArg = process.argv.find((arg) => arg.startsWith('--out='));
const all = process.argv.includes('--all');
const ids = all ? [] : idsArg ? idsArg.slice(6).split(',').filter(Boolean) : ['m1a2', 'bmp2', 'kv2'];
const outDir = resolve(outArg ? outArg.slice(6) : '/private/tmp/cot-muzzle-bore-proof');
mkdirSync(outDir, { recursive: true });
const probePort = 30000 + (process.pid % 20000);

const server = await createServer({
  root: process.cwd(), configFile: false, logLevel: 'error',
  // Probe worktrees may share a dependency symlink. Never share Vite's
  // inline-HTML proxy cache: it can otherwise replay an older detector (and
  // older tankFactory module) from a different checkout.
  cacheDir: resolve(outDir, '.vite-cache'),
  // Use a process-unique strict IPv4 port. Vite treats port 0 as its default
  // 5173; when another worktree owns 127.0.0.1:5173 it can bind only IPv6,
  // while a 127.0.0.1 browser URL silently reaches the stale older server.
  server: { host: '127.0.0.1', port: probePort, strictPort: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
await server.listen();
const address = server.httpServer?.address();
if (!address || typeof address === 'string') throw new Error('muzzle probe server did not expose a TCP port');
const origin = `http://127.0.0.1:${address.port}`;
let browser = null;
let page = null;
const openProbePage = async () => {
  browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  page = await browser.newPage();
  await page.goto(`${origin}/tools/icons-page.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__ICONS_READY === true', { timeout: 60000 });
};
const failures = [];
let checkedIds = ids;
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), tanks: {} };
try {
  await openProbePage();
  checkedIds = ids.length ? ids : await page.evaluate(() => [...window.__FLEET_IDS]);
  for (let idIndex = 0; idIndex < checkedIds.length; idIndex++) {
    const id = checkedIds[idIndex];
    if (idIndex > 0 && idIndex % 40 === 0) {
      // Recreate the browser/WebGL process periodically. Three.js disposes
      // each visual, but Chromium's driver process defers GPU frees and a
      // 100+ tank pass can otherwise lose the context in later families.
      await browser.close();
      browser = null;
      page = null;
      await openProbePage();
    }
    // One tank at a time keeps the WebGL working set bounded across the full
    // roster and makes the exact failing id available even if a renderer
    // allocation fails. Each helper disposes its visual before the next id.
    await page.evaluate((tankId) => window.__WARM([tankId]), id);
    const shot = await page.evaluate((tankId) => window.__BORE_SHOTS([tankId])[tankId], id);
    if (!shot || shot.error) {
      failures.push(`${id}: ${shot && shot.error || 'missing shot'}`);
      report.tanks[id] = { pass: false, error: shot && shot.error || 'missing shot' };
      continue;
    }
    const path = resolve(outDir, `${id}.png`);
    writeFileSync(path, Buffer.from(shot.image.split(',')[1], 'base64'));
    const contrast = shot.surroundLuma - shot.innerLuma;
    if (!all) {
      console.log(`[muzzle-bore] ${id} inner ${shot.innerLuma.toFixed(1)} surround ${shot.surroundLuma.toFixed(1)} contrast ${contrast.toFixed(1)} ${JSON.stringify(shot.muzzleBore)} -> ${path}`);
    } else if ((idIndex + 1) % 10 === 0 || idIndex + 1 === checkedIds.length) {
      console.log(`[muzzle-bore] checked ${idIndex + 1}/${checkedIds.length} (latest ${id})`);
    }
    if (shot.muzzleBore.tagged !== 1) {
      failures.push(`${id}: expected one visible tagged bore, found ${shot.muzzleBore.tagged}`);
    }
    if (shot.muzzleBore.rims !== 1 || shot.muzzleBore.discs !== 1) {
      failures.push(`${id}: expected one visible rim/disc pair, found ${JSON.stringify(shot.muzzleBore)}`);
    }
    const firstHit = shot.boreDebug && shot.boreDebug.centerHits && shot.boreDebug.centerHits[0];
    const firstHitIsBore = !!(firstHit && firstHit.bore);
    const readsRecessed = shot.innerLuma < 80 && contrast > 15;
    // Very dark-painted barrel faces (Vickers Mk.1) have no useful outer
    // contrast at this macro framing. Accept that case only when the center
    // ray proves the near-black pixel belongs to the explicit bore disc.
    const readsAbsoluteBlack = shot.innerLuma < 20;
    const innerSamplesPass = shot.boreDebug.innerSamples?.every((sample) => sample.pass) === true;
    const rimSamplesPass = shot.boreDebug.rimSamples?.every((sample) => sample.pass) === true;
    const concentric = Number.isFinite(shot.boreDebug.concentricOffsetM)
      && shot.boreDebug.concentricOffsetM <= 0.004;
    const pass = shot.muzzleBore.tagged === 1
      && shot.muzzleBore.rims === 1
      && shot.muzzleBore.discs === 1
      && firstHitIsBore
      && innerSamplesPass
      && rimSamplesPass
      && concentric
      && (readsRecessed || readsAbsoluteBlack);
    report.tanks[id] = {
      pass,
      proof: `${id}.png`,
      innerLuma: Number(shot.innerLuma.toFixed(2)),
      surroundLuma: Number(shot.surroundLuma.toFixed(2)),
      contrast: Number(contrast.toFixed(2)),
      radiusPx: Number(shot.radiusPx.toFixed(2)),
      muzzleBore: shot.muzzleBore,
      boreDebug: shot.boreDebug,
    };
    if (!(readsRecessed || readsAbsoluteBlack)) {
      failures.push(`${id}: center does not read as a recessed dark bore ${JSON.stringify(shot.boreDebug)}`);
    }
    if (!firstHitIsBore) failures.push(`${id}: first visible center hit is not bore furniture ${JSON.stringify(firstHit)}`);
    if (!innerSamplesPass) failures.push(`${id}: bore disc is blocked or undersized ${JSON.stringify(shot.boreDebug.innerSamples)}`);
    if (!rimSamplesPass) failures.push(`${id}: rim is incomplete or occluded ${JSON.stringify(shot.boreDebug.rimSamples)}`);
    if (!concentric) failures.push(`${id}: rim/disc are not concentric (${shot.boreDebug.concentricOffsetM})`);
  }
} finally {
  if (browser) await browser.close();
  await server.close();
}

report.checked = Object.keys(report.tanks).length;
report.pass = failures.length === 0;
const reportPath = resolve(outDir, 'report.json');
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`[muzzle-bore] report ${reportPath}`);
if (failures.length) {
  for (const failure of failures) console.error(`[muzzle-bore] FAIL ${failure}`);
  process.exit(2);
}
console.log(`[muzzle-bore] PASS ${checkedIds.length} muzzle classes`);
