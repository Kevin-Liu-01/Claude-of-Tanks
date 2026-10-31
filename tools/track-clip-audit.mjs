import { createCaptureLock } from './capture-lock.mjs';
import { uniqueIds } from './id-list.mjs';
// Track-containment audit driver (owner law 2026-08-03, GEOMETRY-GATE.md #4): fleet audit
// driver for tools/track-clip-audit.html. Lists procedural-source ids, audits
// each for track-band interpenetration with hull solids at the bow/stern
// wrap zones, prints offenders worst-first, writes shots/track-clip.json.
// Own vite 74xx-77xx; cot-shots FIFO lock shared with the capture harnesses.
//
// SHOE-ENVELOPE columns (§B4 amendment; m1a1ha owner report 2026-08-05: shoes
// glitched through the rear plates while the band test read 0/0): every zone
// now also carries shoeVox/shoeHits — the instanced shoe/pad system sampled
// per world-transformed instance (the player-visible surface, riding
// +0.085 m outside the band face; see the page header). Band columns and the
// console `front N rear N` tokens are UNCHANGED (tank-standard-check and the
// live lanes parse them); shoe columns append after. Alongside the legacy
// shots/track-clip.json (extended in place with the new fields), the driver
// writes shots/track-clip-shoes.json: the per-zone band-vs-shoe comparison
// with blind spots (shoeVox > 0 while bandVox = 0 — the m1a1ha class)
// ranked worst-first.
import { withIsolatedCaptureBrowser } from './isolated-capture-browser.mjs';
import { eachBrowserChunk } from './browser-id-chunks.mjs';
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { trackClipOptions } from './track-clip-options.mjs';
const { quality, outDir } = trackClipOptions(process.argv.slice(2));

// A repeated --ids entry fails before the capture hold (2026-10-16, test-speed R4c)
uniqueIds(process.argv.find((a) => a.startsWith('--ids='))?.slice(6).split(','), 'track-clip-audit --ids');
// The server and browser start while the ticket waits; the hold covers the page loads only (2026-10-22, capture-hold).
const captureLock = createCaptureLock();
process.on('exit', () => captureLock.release());

const idArg = process.argv.find((a) => a.startsWith('--ids='));
/** Preserve the standard-check parser's band-first line, then append shoe evidence. */
function logTankResult(id, r) {
  const f = r.zones?.[0]?.overlapVox ?? '?';
  const b = r.zones?.[1]?.overlapVox ?? '?';
  const sf = r.zones?.[0]?.shoeVox ?? '?';
  const sb = r.zones?.[1]?.shoeVox ?? '?';
  const sweep = r.zones?.find((z) => z.name === 'sweep');
  const worst = r.zones?.flatMap((z) => z.hits.map((h) => `${z.name}:${h.mesh}(${h.vox})`)).slice(0, 3).join(' ') || '';
  const shoeWorst = r.zones?.flatMap((z) => (z.shoeHits || []).map((h) => `${z.name}:${h.mesh}(${h.vox})`)).slice(0, 3).join(' ') || '';
  // NOTE: `front N rear N` stays the FIRST match on the line — the shoe
  // columns append after it (tank-standard-check regex compatibility).
  console.log(`[track-clip] ${id.padEnd(18)} front ${String(f).padStart(5)} rear ${String(b).padStart(5)} | shoe front ${String(sf).padStart(5)} rear ${String(sb).padStart(5)}` +
    `${sweep ? ` | strict sweep ${sweep.overlapVox}/${sweep.shoeVox ?? '?'}` : ''} ` +
    `${r.mode && r.mode !== 'bands' ? r.mode + ' ' : ''}${r.shoe && r.shoe.mode !== 'instanced' ? r.shoe.mode + ' ' : ''}${r.anomaly || ''} ${worst}${shoeWorst ? ' | shoeHits ' + shoeWorst : ''}`);
}

/** Write both raw band results and the separate player-visible shoe comparison. */
function writeAuditReports(results) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'track-clip.json'), JSON.stringify(results, null, 1));
  const offenders = results.filter((r) => r.zones && r.zones.some((z) => z.overlapVox > 0));
  console.log(`[track-clip] offenders: ${offenders.length}/${results.length} -> ${join(outDir, 'track-clip.json')}`);
  // ---- shoe-envelope comparison report (band vs shoe per zone) --------------
  const rows = [];
  for (const r of results) {
    if (!r.zones) continue;
    for (const z of r.zones) {
      if (z.shoeVox === undefined) continue;
      rows.push({
        id: r.id, quality, zone: z.name, bandVox: z.overlapVox, shoeVox: z.shoeVox,
        blindSpot: z.shoeVox > 0 && z.overlapVox === 0,
        shoeMode: r.shoe?.mode ?? null,
        shoeHits: (z.shoeHits || []).slice(0, 3),
      });
    }
  }
  const blind = rows.filter((r) => r.blindSpot).sort((x, y) => y.shoeVox - x.shoeVox);
  writeFileSync(join(outDir, 'track-clip-shoes.json'), JSON.stringify({
    generated: new Date().toISOString(),
    quality,
    exact: process.argv.includes('--exact'),
    note: 'shoeVox = instanced shoe/pad envelope vs hull solids (player-visible surface); bandVox = legacy band test. blindSpot = shoeVox>0 while bandVox=0 (the m1a1ha class).',
    rows, blindSpots: blind,
  }, null, 1));
  const shoeOffenders = results.filter((r) => r.zones && r.zones.some((z) => (z.shoeVox ?? 0) > 0));
  console.log(`[track-clip] shoe offenders: ${shoeOffenders.length}/${results.length}, blind spots (shoe>0, band=0): ${blind.length} -> ${join(outDir, 'track-clip-shoes.json')}`);
  for (const bz of blind) {
    console.log(`[track-clip]   BLIND-SPOT ${bz.id.padEnd(18)} ${bz.zone.padEnd(5)} band ${String(bz.bandVox).padStart(5)} shoe ${String(bz.shoeVox).padStart(5)} ${bz.shoeHits.map((h) => `${h.mesh}(${h.vox})`).join(' ')}`);
  }
}

const serverOptions = {
  root: process.cwd(), logLevel: 'error',
  server: { port: 7461 + Math.floor(Math.random() * 30), strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
};
const launchOptions = {
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
};
/** One isolated server and browser: the roster's list page, or one chunk of ids in a capture hold of its own. */
async function isolatedBrowser(run, dependencies = {}) {
  return await withIsolatedCaptureBrowser(serverOptions, launchOptions, run, dependencies);
}
let ids;
if (idArg) {
  ids = idArg.slice(6).split(',');
} else {
  // the procedural roster from a short-lived list page (it draws nothing: no hold), so the audit below can chunk it
  ids = await isolatedBrowser(async ({ server, browser }) => {
    const page = await browser.newPage();
    page.setDefaultTimeout(180000);
    await page.goto(`http://localhost:${server.config.server.port}/tools/track-clip-audit.html?mode=list`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__CLIP_READY === true', { polling: 50 });
    return (await page.evaluate('window.__CLIP_RESULT')).ids;
  });
}
console.log(`[track-clip] auditing ${ids.length} procedural ids at ${quality}`);
const results = [];
// A fresh server and browser per chunk of ids (tools/browser-id-chunks.mjs), each chunk in a capture hold of its own.
await eachBrowserChunk('tools/track-clip-audit.mjs', ids, (chunk, { launch }) => isolatedBrowser(async ({ server, browser }) => {
  const port = server.config.server.port;
  const page = await browser.newPage();
  page.setDefaultTimeout(180000);
  for (const id of chunk) {
    try {
      await page.goto(`http://localhost:${port}/tools/track-clip-audit.html?id=${encodeURIComponent(id)}&quality=${quality}${process.argv.includes('--exact') ? '&dilate=0' : ''}${process.argv.includes('--strict') ? '&strict=1' : ''}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('window.__CLIP_READY === true', { polling: 50 });
      const r = await page.evaluate('window.__CLIP_RESULT');
      results.push(r);
      logTankResult(id, r);
    } catch (e) {
      results.push({ id, quality, error: e.message.slice(0, 120) });
      console.log(`[track-clip] ${id.padEnd(18)} ERROR ${e.message.slice(0, 80)}`);
    }
  }
}, { capture: { lock: captureLock, waitMs: 45 * 60 * 1000 }, launchBrowser: (options) => launch(puppeteer, options) }));
writeAuditReports(results);
