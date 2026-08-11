// Visual proof for the fleet-wide muzzle-bore fallback. Structural coverage is
// enforced by tank-assets-check; this probe also renders representative main
// gun, autocannon and howitzer mouths straight-on and checks dark-center read.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const idsArg = process.argv.find((arg) => arg.startsWith('--ids='));
const all = process.argv.includes('--all');
const ids = all ? [] : idsArg ? idsArg.slice(6).split(',').filter(Boolean) : ['m1a2', 'bmp2', 'kv2'];
const outDir = resolve('/private/tmp/cot-muzzle-bore-proof');
mkdirSync(outDir, { recursive: true });

const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: { port: 5982, strictPort: false, hmr: false, watch: null },
});
await server.listen();
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
const failures = [];
let checkedIds = ids;
try {
  await page.goto(`http://localhost:${server.config.server.port}/tools/icons-page.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__ICONS_READY === true', { timeout: 60000 });
  await page.evaluate((tankIds) => window.__WARM(tankIds), ids);
  await page.waitForFunction(
    () => {
      window.__BORE_POLLS = (window.__BORE_POLLS || 0) + 1;
      const stats = window.__GLB_STATS;
      if (!stats) return window.__BORE_POLLS >= 10;
      const settled = stats.started === stats.settled;
      window.__BORE_SETTLE = settled ? (window.__BORE_SETTLE || 0) + 1 : 0;
      return window.__BORE_SETTLE >= 2;
    },
    { timeout: 120000, polling: 400 },
  );
  const shots = await page.evaluate((tankIds) => window.__BORE_SHOTS(tankIds), ids);
  checkedIds = ids.length ? ids : Object.keys(shots);
  for (const id of checkedIds) {
    const shot = shots[id];
    if (!shot || shot.error) {
      failures.push(`${id}: ${shot && shot.error || 'missing shot'}`);
      continue;
    }
    const path = resolve(outDir, `${id}.png`);
    writeFileSync(path, Buffer.from(shot.image.split(',')[1], 'base64'));
    const contrast = shot.surroundLuma - shot.innerLuma;
    console.log(`[muzzle-bore] ${id} inner ${shot.innerLuma.toFixed(1)} surround ${shot.surroundLuma.toFixed(1)} contrast ${contrast.toFixed(1)} ${JSON.stringify(shot.muzzleBore)} -> ${path}`);
    if (!(shot.muzzleBore.tagged > 0)) failures.push(`${id}: no visible tagged bore`);
    const firstHit = shot.boreDebug && shot.boreDebug.centerHits && shot.boreDebug.centerHits[0];
    const firstHitIsBore = !!(firstHit && /muzzleBoreShadow.*Disc/i.test(firstHit.name));
    const readsRecessed = shot.innerLuma < 80 && contrast > 15;
    // Very dark-painted barrel faces (Vickers Mk.1) have no useful outer
    // contrast at this macro framing. Accept that case only when the center
    // ray proves the near-black pixel belongs to the explicit bore disc.
    const readsAbsoluteBlack = shot.innerLuma < 20 && firstHitIsBore;
    if (!(readsRecessed || readsAbsoluteBlack)) {
      failures.push(`${id}: center does not read as a recessed dark bore ${JSON.stringify(shot.boreDebug)}`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  for (const failure of failures) console.error(`[muzzle-bore] FAIL ${failure}`);
  process.exit(2);
}
console.log(`[muzzle-bore] PASS ${checkedIds.length} muzzle classes`);
