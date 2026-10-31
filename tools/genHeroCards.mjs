// Tank hero card renderer (GPU part): renders each vehicle's transparent hero tank
// layer through tools/hero-cards-page.html, inside the shared capture lock.
// The flag layers and the composed cards are CPU work (tools/hero-cards-compose.mjs).
// First-party tooling and generated images: Kevin B. Liu (NOTICE.md).
//
// Usage (changed-only: the planner names the stale ids; a full fleet needs an explicit --all):
//   node tools/genHeroCards.mjs --ids=m1a2_abrams_sepv3,leo2a7v --out <dir>
//   node tools/genHeroCards.mjs --plan --out <dir>              (the ids tools/hero-cards-plan.mjs reports stale)
//   node tools/genHeroCards.mjs --all --part=1/2 --out <dir>    (explicit full fleet, one capture-lock hold per part)
//   node tools/genHeroCards.mjs --jobs=<jobs.json> --out <dir>  (sample boards: named jobs with overrides)
//   --resume  skip jobs whose layer and meta already exist in <dir> (a hold that hit its alarm continues)
//   --queue-stamp=<n>  join the capture queue at a stamp the coordinator issued for this hold (never self-issued)
// Each layer is written with its own <name>.json meta as it renders; tank-layers.json collects them.
// Then `node tools/hero-cards-compose.mjs ship --layers <dir> --ids=...` encodes and records them.
//
// The capture-lock wait is bounded by COT_SHOTS_LOCK_TIMEOUT_MS; the hold's own
// alarm (--hold-minutes, default 18) starts only once the lock is taken.
// The Vite server (a child process), Chrome, the page and the tanks' warm-up run while the ticket waits
// (tools/capture-hold.mjs, 2026-10-22): the hold renders only. Before, 70-143 s of each 103-212 s hold was setup.
// One hold per browser chunk of ids (tools/browser-id-chunks.mjs): each chunk warms a fresh server, browser and page.

import { eachBrowserChunk } from './browser-id-chunks.mjs';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { ticketAt } from './capture-lock.mjs';
import { rememberWarm, rewarmPage, runWarmHold, startViteChild, stubViteSocket } from './capture-hold.mjs';
import { fleetIds, planHeroCards, tankPolicyKey } from './hero-cards-plan.mjs';
import { uniqueIds } from './id-list.mjs';

const args = process.argv.slice(2);
function opt(name, fallback = '') {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

const outDir = resolve(opt('out', '.qa-dev/hero-cards'));
const holdMinutes = Number(opt('hold-minutes', '18'));
let jobs = [];
if (opt('jobs')) jobs = JSON.parse(readFileSync(resolve(opt('jobs')), 'utf8'));
else if (opt('ids')) jobs = uniqueIds(opt('ids').split(',').map((id) => id.trim()).filter(Boolean)).map((id) => ({ name: id, id }));
else if (args.includes('--all')) jobs = fleetIds().map((id) => ({ name: id, id }));
else if (args.includes('--plan')) {
  const plan = planHeroCards();
  if (plan.policyMoved) {
    console.error('[hero-cards] the hero policy moved: every card is stale; a full fleet render needs an explicit --all');
    process.exit(1);
  }
  jobs = plan.stale.map(({ id }) => ({ name: id, id }));
}
if (opt('part')) {
  const [index, count] = opt('part').split('/').map(Number);
  if (!(index >= 1 && index <= count)) throw new Error(`--part=${opt('part')}: expected i/n`);
  const size = Math.ceil(jobs.length / count);
  jobs = jobs.slice((index - 1) * size, index * size);
}
if (!jobs.length) {
  console.error('[hero-cards] nothing to render: pass --ids=<id,...> (changed ids only), --plan, --all (explicit full fleet) or --jobs=<file>');
  process.exit(args.includes('--plan') ? 0 : 1);
}
mkdirSync(outDir, { recursive: true });
if (args.includes('--resume')) {
  const before = jobs.length;
  jobs = jobs.filter((job) => !(existsSync(resolve(outDir, `${job.name}.png`)) && existsSync(resolve(outDir, `${job.name}.json`))));
  console.log(`[hero-cards] resume: ${before - jobs.length} of ${before} jobs already rendered`);
  if (!jobs.length) process.exit(0);
}
const ids = [...new Set(jobs.map((job) => job.id))];
// The policy the layers are rendered under; the ship step refuses layers of another policy.
const policyKey = tankPolicyKey();

const lockWait = Number(process.env.COT_SHOTS_LOCK_TIMEOUT_MS) || 4 * 3600 * 1000;
console.log(`[hero-cards] ${jobs.length} jobs over ${ids.length} ids; warming, then waiting for the capture lock (<= ${Math.round(lockWait / 60000)} min)`);
const queueStamp = Number(opt('queue-stamp', '0'));
const viteCacheDir = resolve('/tmp', `cot-hero-vite-${process.pid}`);
const pageErrors = [];

let failed = false;
let stopped = false;
const meta = {};
try {
  await eachBrowserChunk('tools/genHeroCards.mjs', ids, async (chunk, { launch }) => {
    const chunkJobs = jobs.filter((job) => chunk.includes(job.id));
    await runWarmHold({
      label: 'hero-cards',
      holdMinutes,
      waitHours: lockWait / 3600 / 1000,
      ticket: queueStamp ? ticketAt(queueStamp) : null,
      place: opt('place') || null,
      warm: async () => {
        const server = await startViteChild({
          mode: 'dev',
          config: {
            root: process.cwd(), configFile: false, cacheDir: viteCacheDir, logLevel: 'error',
            optimizeDeps: { noDiscovery: true },
            // no HMR socket: a frozen page must not take a Vite reload at the thaw (capture-hold.mjs, 2026-10-23)
            server: { host: '127.0.0.1', port: 7600 + (process.pid % 200), strictPort: false, hmr: false, ws: false, watch: null },
          },
        });
        let browser = null;
        try {
          browser = await launch(puppeteer, {
            headless: 'new',
            timeout: 180_000,
            protocolTimeout: 15 * 60 * 1000,
            // a 3 GB V8 heap per renderer (the capture-browser rule, 2026-10-23: a jetsam report showed a 14 GB renderer)
            args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=3072'],
          });
          const page = await browser.newPage();
          page.on('pageerror', (error) => pageErrors.push(String(error)));
          page.on('console', (message) => {
            if (message.type() === 'error' && !/favicon|404/.test(message.text())) pageErrors.push(message.text());
          });
          await stubViteSocket(page);
          // loaded through the shared warm record, so the hold checks the page after the thaw and loads it again
          // (__HERO_WARM included) if it lost its context
          rememberWarm(page, { url: `${server.url}/tools/hero-cards-page.html`, ready: 'window.__HERO_READY === true',
            after: (warmed) => warmed.evaluate((list) => window.__HERO_WARM(list), chunk) });
          await rewarmPage(page);
          const close = async () => {
            try { await browser.close(); } catch { /* closed */ }
            await server.close();
          };
          return { pages: [page], page, close };
        } catch (error) {
          try { if (browser) await browser.close(); } catch { /* closed */ }
          await server.close();
          throw error;
        }
      },
      shoot: async ({ page, signal, heldAt }) => {
        // One evaluation per job keeps each data URL transfer small and lets a long board finish
        // inside the hold even when one vehicle fails.
        for (const job of chunkJobs) {
          if (signal.aborted) {
            stopped = true;
            console.error(`[hero-cards] hold alarm: ${holdMinutes} min reached; the rest continues with --resume`);
            break;
          }
          const [result] = await page.evaluate((one) => window.__HERO_RENDER([one]), job);
          if (result.error) {
            failed = true;
            console.error(`[hero-cards] ${job.name}: ${result.error}`);
            continue;
          }
          if (!job.overrides) result.meta.policyKey = policyKey;
          const file = resolve(outDir, `${job.name}.png`);
          writeFileSync(file, Buffer.from(result.dataUrl.split(',')[1], 'base64'));
          writeFileSync(resolve(outDir, `${job.name}.json`), `${JSON.stringify(result.meta, null, 1)}\n`);
          meta[job.name] = result.meta;
          console.log(`[hero-cards] wrote ${job.name}.png${result.meta.clipped ? '  CLIPPED' : ''}  (${((Date.now() - heldAt) / 1000).toFixed(0)} s into the hold)`);
        }
      },
    });
  });
  // Every layer's meta in the directory (earlier parts and resumed holds included).
  const all = {};
  for (const name of readdirSync(outDir).filter((f) => f.endsWith('.json') && f !== 'tank-layers.json').sort()) {
    try { all[name.slice(0, -5)] = JSON.parse(readFileSync(resolve(outDir, name), 'utf8')); } catch { /* partial write */ }
  }
  writeFileSync(resolve(outDir, 'tank-layers.json'), `${JSON.stringify({ ...all, ...meta }, null, 1)}\n`);
  if (pageErrors.length) {
    console.error(`[hero-cards] page errors (${pageErrors.length}):`);
    for (const error of pageErrors.slice(0, 20)) console.error(`  ${error}`);
  }
} catch (error) {
  failed = true;
  console.error(`[hero-cards] FAILED: ${error && error.stack || error}`);
} finally {
  rmSync(viteCacheDir, { recursive: true, force: true });
}
if (stopped) process.exit(3);
process.exit(failed ? 1 : 0);
