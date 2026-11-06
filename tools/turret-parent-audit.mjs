import { launchGuardedBrowser } from './browser-launch.mjs';
import { eachBrowserChunk } from './browser-id-chunks.mjs';
import { openCaptureHold } from './capture-hold.mjs';
import { heldRunExitCode, heldStopWhy, runHeldItem } from './held-items.mjs';
import { uniqueIds } from './id-list.mjs';
// Turret-furniture parenting audit driver (owner law 2026-08-04,
// BUILD-STANDARD §B5): fleet driver for tools/turret-parent-audit.html.
// STRANDED = hull-parented mesh overlapping the turret casting envelope
// (reads as turret furniture but will not yaw with the turret);
// DANGLING = turret-parented mesh entirely below the ring plane (the m1a1
// tow-cable class: sweeps mid-air on yaw). Prints offenders worst-first,
// writes shots/turret-parent.json.
// Own vite 74xx-77xx; cot-shots FIFO lock shared with the capture harnesses.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The audit as a function (round 4 F12: tools/long-hold-users.selftest.mjs drives it in Node, with no Vite or Chrome).
 * `argv` is the command line's arguments. `deps` stand in for what serves and draws: `createServer` (Vite's),
 * `puppeteer` (the launcher launchGuardedBrowser takes), `hold` (openCaptureHold options laid over the tool's own: a
 * stand-in lock, its log, its teardown) and `outFile`.
 */
export async function runTurretParentAudit(argv = process.argv.slice(2), { createServer = null, puppeteer = null, hold: holdOptions = {},
  outFile = 'shots/turret-parent.json' } = {}) {
  // A repeated --ids entry fails before the capture hold (2026-10-16, test-speed R4c)
  uniqueIds(argv.find((a) => a.startsWith('--ids='))?.slice(6).split(','), 'turret-parent-audit --ids');
  createServer ??= (await import('vite')).createServer;
  puppeteer ??= (await import('puppeteer')).default;
  // (round 3 A5 review) the grace is the page's own step timeout (180 s, not the default 60): an id in flight when the lock's
  // cap comes finishes before the hold yields (see the id loop)
  const hold = await openCaptureHold({ label: 'turret-parent-audit', timeoutMs: 45 * 60 * 1000, graceSeconds: 180, ...holdOptions });

  const idArg = argv.find((a) => a.startsWith('--ids='));
  const launchOptions = {
    headless: 'new',
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
  };
  const results = [];
  let server = null;
  try {
    server = await createServer({
      root: process.cwd(), logLevel: 'error',
      server: { port: 7461 + Math.floor(Math.random() * 30), strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
    });
    await server.listen();
    const port = server.config.server.port;
    let ids;
    if (idArg) {
      ids = idArg.slice(6).split(',');
    } else {
      // the procedural roster from a short-lived list page, so the audit below can chunk it. (round 4 E10) A stop while it
      // loads (a signal) ends the run with nothing audited, its exit code kept (128 + n); it threw past that code (exit 1).
      const roster = await runHeldItem(hold, async () => {
        const browser = await launchGuardedBrowser(puppeteer, launchOptions);
        try {
          const page = await browser.newPage();
          page.setDefaultTimeout(180000);
          await page.goto(`http://localhost:${port}/tools/turret-parent-audit.html?mode=list`, { waitUntil: 'domcontentloaded' });
          await page.waitForFunction('window.__TP_READY === true', { polling: 50 });
          return (await page.evaluate('window.__TP_RESULT')).ids;
        } finally {
          await browser.close();
        }
      });
      if (roster.outcome === 'failed') throw roster.error;
      if (roster.outcome === 'left') {
        console.error(`[turret-parent] the capture hold was stopped (${roster.why}) before the roster was read: nothing audited; run it again`);
        heldRunExitCode({ left: true });
        return;
      }
      ids = roster.value;
    }
    console.log(`[turret-parent] auditing ${ids.length} procedural ids`);
    // (round 3 A5 review) a whole-fleet run is far past the lock's 20-min cap, which the hold enforces: between ids it yields
    // while anyone waits (the page idles on its last id: turret-parent-audit.html runs no frame loop, so nothing draws
    // unheld). A hold that was stopped (a signal, a yield that could not hold again) ends the run there: the ids it audited
    // are written and the ones left named for the next run, never an ERROR row each. (round 4 E10) Each id's end is
    // tools/held-items.mjs runHeldItem's ('done', 'failed': an ERROR row, 'left'), and the exit code heldRunExitCode's:
    // 3 with ids left, a signal's 128 + n kept.
    const audited = new Set();
    let stopped = null;
    // A fresh browser per chunk of ids (tools/browser-id-chunks.mjs), inside the run's one capture hold.
    await eachBrowserChunk('tools/turret-parent-audit.mjs', ids, async (chunk, { launch }) => {
      const browser = await launch(puppeteer, launchOptions);
      try {
        const page = await browser.newPage();
        page.setDefaultTimeout(180000);
        for (const id of chunk) {
          const item = await runHeldItem(hold, async () => {
            await page.goto(`http://localhost:${port}/tools/turret-parent-audit.html?id=${id}`, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction('window.__TP_READY === true', { polling: 50 });
            return page.evaluate('window.__TP_RESULT');
          });
          // the stop came before this id or cut it (its browser stopped under it): left with the rest, not an ERROR
          if (item.outcome === 'left') hold.signal.throwIfAborted();
          audited.add(id);
          if (item.outcome === 'failed') {
            results.push({ id, error: item.error.message.slice(0, 120) });
            console.log(`[turret-parent] ${id.padEnd(18)} ERROR ${item.error.message.slice(0, 80)}`);
            continue;
          }
          const r = item.value;
          results.push(r);
          const s = r.stranded?.length ?? '?';
          const a = r.abutting?.length ?? '?';
          const d = r.dangling?.length ?? '?';
          const worst = (r.stranded || []).slice(0, 3)
            .map((h) => `${h.mesh}(${Math.round(h.overlap * 100)}%)`).join(' ');
          console.log(`[turret-parent] ${id.padEnd(18)} stranded ${String(s).padStart(3)} abutting ${String(a).padStart(3)} dangling ${String(d).padStart(3)}  ${r.anomaly || ''}${worst}`);
        }
      } finally {
        await browser.close();
      }
    }).catch((error) => {
      if (!hold.signal.aborted) throw error;
      stopped = heldStopWhy(hold.signal);
    });
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, JSON.stringify(results, null, 1));
    const offenders = results.filter((r) => (r.stranded && r.stranded.length) || (r.abutting && r.abutting.length) || (r.dangling && r.dangling.length));
    console.log(`[turret-parent] offenders: ${offenders.length}/${results.length} -> ${outFile}`);
    if (stopped) {
      const left = ids.filter((id) => !audited.has(id));
      console.error(`[turret-parent] the capture hold was stopped (${stopped}): ${left.length} id(s) left for the next run; finish with `
        + `--ids=${left.join(',')} (it rewrites ${outFile}: keep this one first)`);
    }
    heldRunExitCode({ left: stopped !== null });
  } finally {
    if (server) await server.close();
    await hold.release();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runTurretParentAudit();
