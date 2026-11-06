import { launchGuardedBrowser } from './browser-launch.mjs';
import { eachBrowserChunk } from './browser-id-chunks.mjs';
import { openCaptureHold } from './capture-hold.mjs';
import { uniqueIds } from './id-list.mjs';
// Turret-furniture parenting audit driver (owner law 2026-08-04,
// BUILD-STANDARD §B5): fleet driver for tools/turret-parent-audit.html.
// STRANDED = hull-parented mesh overlapping the turret casting envelope
// (reads as turret furniture but will not yaw with the turret);
// DANGLING = turret-parented mesh entirely below the ring plane (the m1a1
// tow-cable class: sweeps mid-air on yaw). Prints offenders worst-first,
// writes shots/turret-parent.json.
// Own vite 74xx-77xx; cot-shots FIFO lock shared with the capture harnesses.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';

// A repeated --ids entry fails before the capture hold (2026-10-16, test-speed R4c)
uniqueIds(process.argv.find((a) => a.startsWith('--ids='))?.slice(6).split(','), 'turret-parent-audit --ids');
// (round 3 A5 review) the grace is the page's own step timeout (180 s, not the default 60): an id in flight when the lock's
// cap comes finishes before the hold yields (see the id loop)
const hold = await openCaptureHold({ label: 'turret-parent-audit', timeoutMs: 45 * 60 * 1000, graceSeconds: 180 });

const idArg = process.argv.find((a) => a.startsWith('--ids='));
const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: { port: 7461 + Math.floor(Math.random() * 30), strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
});
await server.listen();
const port = server.config.server.port;
const launchOptions = {
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
};
const results = [];
try {
  let ids;
  if (idArg) {
    ids = idArg.slice(6).split(',');
  } else {
    // the procedural roster from a short-lived list page, so the audit below can chunk it
    const browser = await launchGuardedBrowser(puppeteer, launchOptions);
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(180000);
      await page.goto(`http://localhost:${port}/tools/turret-parent-audit.html?mode=list`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('window.__TP_READY === true', { polling: 50 });
      ids = (await page.evaluate('window.__TP_RESULT')).ids;
    } finally {
      await browser.close();
    }
  }
  console.log(`[turret-parent] auditing ${ids.length} procedural ids`);
  // (round 3 A5 review) a whole-fleet run is far past the lock's 20-min cap, which the hold enforces: between ids it yields
  // while anyone waits (the page idles on its last id: turret-parent-audit.html runs no frame loop, so nothing draws
  // unheld). A hold that was stopped (a signal, a yield that could not hold again) ends the run there: the ids it audited
  // are written and the ones left named for the next run (exit 3), never an ERROR row each.
  const audited = new Set();
  let stopped = null;
  // A fresh browser per chunk of ids (tools/browser-id-chunks.mjs), inside the run's one capture hold.
  await eachBrowserChunk('tools/turret-parent-audit.mjs', ids, async (chunk, { launch }) => {
    const browser = await launch(puppeteer, launchOptions);
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(180000);
      for (const id of chunk) {
        await hold.checkpoint();
        hold.signal.throwIfAborted();
        try {
          await page.goto(`http://localhost:${port}/tools/turret-parent-audit.html?id=${id}`, { waitUntil: 'domcontentloaded' });
          await page.waitForFunction('window.__TP_READY === true', { polling: 50 });
          const r = await page.evaluate('window.__TP_RESULT');
          results.push(r);
          audited.add(id);
          const s = r.stranded?.length ?? '?';
          const a = r.abutting?.length ?? '?';
          const d = r.dangling?.length ?? '?';
          const worst = (r.stranded || []).slice(0, 3)
            .map((h) => `${h.mesh}(${Math.round(h.overlap * 100)}%)`).join(' ');
          console.log(`[turret-parent] ${id.padEnd(18)} stranded ${String(s).padStart(3)} abutting ${String(a).padStart(3)} dangling ${String(d).padStart(3)}  ${r.anomaly || ''}${worst}`);
        } catch (e) {
          if (hold.signal.aborted) throw e; // the stop cut this id (its browser stopped under it): left, not an ERROR
          results.push({ id, error: e.message.slice(0, 120) });
          audited.add(id);
          console.log(`[turret-parent] ${id.padEnd(18)} ERROR ${e.message.slice(0, 80)}`);
        }
      }
    } finally {
      await browser.close();
    }
  }).catch((error) => {
    if (!hold.signal.aborted) throw error;
    stopped = String(hold.signal.reason?.message ?? hold.signal.reason ?? error?.message ?? error).split('\n')[0];
  });
  mkdirSync('shots', { recursive: true });
  writeFileSync('shots/turret-parent.json', JSON.stringify(results, null, 1));
  const offenders = results.filter((r) => (r.stranded && r.stranded.length) || (r.abutting && r.abutting.length) || (r.dangling && r.dangling.length));
  console.log(`[turret-parent] offenders: ${offenders.length}/${results.length} -> shots/turret-parent.json`);
  if (stopped) {
    const left = ids.filter((id) => !audited.has(id));
    console.error(`[turret-parent] the capture hold was stopped (${stopped}): ${left.length} id(s) left for the next run; finish with `
      + `--ids=${left.join(',')} (it rewrites shots/turret-parent.json: keep this one first)`);
    process.exitCode = 3;
  }
} finally {
  await server.close();
  await hold.release();
}
