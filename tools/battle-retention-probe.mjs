// battle-retention-probe.mjs (webcontent-diet-278): what a phone page still holds from a battle it left.
//
// Route: Garage -> battle A -> Garage -> battle B, phone tier (390x844 at 3x, touch, iPhone UA), CPU throttled. In-page
// WeakRef probes are taken on battle A's world root (`world-<A>`) and every CPU array its geometry holds at A's reveal,
// and on the Garage dressing's root and arrays before B. At B's settle the page is collected (gc, with turns between)
// and the probes are read: a world-A root or array still alive is retained by something after its world was released;
// a Garage dressing array alive in battle B is CPU geometry the battle does not draw.
// It also reads the V8 heap at B's settle (CDP Runtime.getHeapUsage: used + typed-array backing stores). With --retainers,
// a probed root still alive is marked by a class of its own, and its shortest strong retainer paths are read from a heap
// snapshot (tools/heap-retainers.mjs, as battle-memory-probe --retainers does for a leaked world).
//
//   node tools/with-capture-lock.mjs --lock-class=render -- node tools/battle-retention-probe.mjs --dist=<dist> \
//     --label=fix --out=<dir> [--cpu=4] [--maps=verdant,winter] [--retainers] [--save-snapshot] [--expect=released|retained]
//
// Exit 0 when the reading matches --expect (default released: world A's root collected and none of its arrays alive) and
// --expect-dressing (released | retained | any, the default); 1 otherwise; 2 on a failed run. --expect=retained is the
// reverted control's side.
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { snapshotRetainerPaths } from './heap-retainers.mjs';
import { readinessExpression } from './game-readiness.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const root = new URL('..', import.meta.url).pathname;
const distDir = resolve(arg('dist', 'dist'));
const label = arg('label', 'run');
const out = resolve(arg('out', '.qa-dev/battle-retention'));
const port = Number(arg('port', 4271));
const [mapA, mapB] = arg('maps', 'verdant,winter').split(',');
const cpuRate = Number(arg('cpu', 4));
const expect = arg('expect', 'released');
const expectDressing = arg('expect-dressing', 'any');
const retainers = process.argv.includes('--retainers');
const saveSnapshot = process.argv.includes('--save-snapshot');
const settleMs = Number(arg('settle-ms', 4000));
const log = (line) => process.stderr.write(`[battle-retention ${label}] ${line}\n`);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const PHONE = {
  viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: false },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
};

/** In-page: WeakRefs on a named root and every CPU array its geometry holds (attributes, interleaved buffers, index). */
function probeRoot(key, name) {
  const P = window.__RETENTION ??= {};
  const scene = window.__DEBUG?.scene;
  let rootObject = null;
  scene?.traverse((object) => { if (!rootObject && object.name === name) rootObject = object; });
  if (!rootObject) return { key, found: false };
  const arrays = new Set();
  const addAttribute = (attribute) => {
    const array = attribute?.isInterleavedBufferAttribute ? attribute.data?.array : attribute?.array;
    if (array && ArrayBuffer.isView(array) && array.byteLength >= 4096) arrays.add(array);
  };
  rootObject.traverse((object) => {
    const geometry = object.geometry;
    if (!geometry?.isBufferGeometry) return;
    for (const attribute of Object.values(geometry.attributes)) addAttribute(attribute);
    for (const list of Object.values(geometry.morphAttributes ?? {})) for (const attribute of list) addAttribute(attribute);
    addAttribute(geometry.index);
    if (object.isInstancedMesh) { addAttribute(object.instanceMatrix); addAttribute(object.instanceColor); }
  });
  let bytes = 0;
  for (const array of arrays) bytes += array.byteLength;
  // a class named in its own source: a heap snapshot names the instance by it (tools/heap-retainers.mjs)
  const markers = { worldA: class RetainMarker_worldA {}, worldObjectA: class RetainMarker_worldObjectA {}, dressing: class RetainMarker_dressing {} };
  rootObject.userData.__retainMarker = new markers[key]();
  P[key] = { root: new WeakRef(rootObject), arrays: [...arrays].map((array) => ({ ref: new WeakRef(array), bytes: array.byteLength })) };
  return { key, found: true, arrays: arrays.size, mb: +(bytes / 1048576).toFixed(1) };
}

/** In-page: how much of each probe is still alive. */
function readProbes() {
  const result = {};
  for (const [key, probe] of Object.entries(window.__RETENTION ?? {})) {
    let alive = 0, bytes = 0;
    for (const { ref, bytes: size } of probe.arrays) if (ref.deref()) { alive++; bytes += size; }
    result[key] = { rootAlive: !!probe.root.deref(), arrays: probe.arrays.length, arraysAlive: alive, aliveMb: +(bytes / 1048576).toFixed(1) };
  }
  return result;
}

/**
 * The reading against what the run expects: world A `released` (its root collected and none of its arrays alive) or
 * `retained` (the reverted control's side); the Garage dressing's arrays `released`, `retained` or `any`.
 */
export function retentionVerdict(probes, { expect = 'released', expectDressing = 'any' } = {}) {
  const worldA = probes?.worldA;
  const dressing = probes?.dressing;
  const worldReleased = !!worldA && !worldA.rootAlive && worldA.arraysAlive === 0;
  const dressingReleased = !!dressing && dressing.arraysAlive === 0;
  const worldPass = expect === 'released' ? worldReleased : !worldReleased;
  const dressingPass = expectDressing === 'any' || (expectDressing === 'released' ? dressingReleased : !dressingReleased);
  return { worldReleased, dressingReleased, expect, expectDressing, pass: worldPass && dressingPass };
}

async function main() {
  const [{ default: puppeteer }, { preview }] = await Promise.all([import('puppeteer'), import('vite')]);
  let server, browser;
  const report = { label, distDir, maps: [mapA, mapB], cpuRate, steps: [], errors: [] };
  let failed = false;
  try {
    await mkdir(out, { recursive: true });
    server = await preview({ root, logLevel: 'error', build: { outDir: distDir }, preview: { host: '127.0.0.1', port, strictPort: true, open: false } });
    browser = await launchGuardedBrowser(puppeteer, { headless: true, protocolTimeout: 900_000,
      args: ['--no-sandbox', '--use-gl=angle', '--enable-webgl', '--mute-audio', '--enable-precise-memory-info', '--js-flags=--expose-gc'] },
    { label: `battle-retention:${label}` });
    const page = await (await browser.createBrowserContext()).newPage();
    await page.emulate(PHONE);
    page.on('pageerror', (error) => report.errors.push(String(error.message).slice(0, 300)));
    const cdp = await page.createCDPSession();
    if (cpuRate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
    const collect = async () => {
      // WeakRefs clear only between tasks: collect, yield, collect again
      for (let i = 0; i < 3; i++) {
        await cdp.send('HeapProfiler.collectGarbage');
        await page.evaluate(() => new Promise((done) => setTimeout(done, 50)));
      }
    };
    const step = async (name, extra = {}) => {
      const row = { step: name, atMs: Date.now(), ...extra };
      report.steps.push(row);
      log(`${name} ${JSON.stringify(extra)}`);
    };
    const enter = async (mapId) => {
      await page.evaluate((id) => {
        window.__ENTRY = { done: false };
        Promise.resolve(window.__DEBUG.beginSoloBattle({ specId: 'm1a2_abrams_sepv3', mapId: id, randomRoster: false }))
          .then(() => { window.__ENTRY.done = true; }, (error) => { window.__ENTRY.done = true; window.__ENTRY.error = String(error); });
      }, mapId);
      await page.waitForFunction(readinessExpression('battleRevealed'), { timeout: 400_000, polling: 250 });
      await sleep(settleMs);
    };
    const leave = async () => {
      await page.evaluate(() => window.__DEBUG.leaveBattleToGarage?.());
      await page.waitForFunction(readinessExpression('garage'), { timeout: 300_000, polling: 250 });
      await sleep(3000);
    };

    await page.goto(`http://127.0.0.1:${port}/?nosplash=1&tier=mobile`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
    await page.waitForFunction(readinessExpression('garage'), { timeout: 300_000, polling: 250 });
    await sleep(3000);
    await step('garage booted');
    await enter(mapA);
    await step(`${mapA} revealed`, { probe: await page.evaluate(probeRoot, 'worldA', `world-${mapA}`) });
    await leave();
    // the dressing is complete only after its idle build: wait for it, then probe it before B
    await page.waitForFunction(() => window.__DEBUG?.garageDressing?.isBuilt?.() !== false, { timeout: 120_000, polling: 500 }).catch(() => {});
    // the dressing's own build cost (garageDressing.ts buildTimings: each chunk's ms on this page), for what a rebuild costs
    const dressingBuild = await page.evaluate(() => {
      const timings = window.__DEBUG?.garageDressing?.group?.userData?.buildTimings ?? [];
      return { chunks: timings.length, ms: timings.reduce((sum, row) => sum + (row.ms ?? 0), 0),
        longestMs: timings.reduce((top, row) => Math.max(top, row.ms ?? 0), 0) };
    });
    report.dressingBuild = dressingBuild;
    await step(`garage after ${mapA}`, { probe: await page.evaluate(probeRoot, 'dressing', 'garage_dressing'), dressingBuild });
    await enter(mapB);
    // the world release is paced (6 ms slices between tasks): give it its turns before reading
    await page.waitForFunction((a) => {
      const release = window.__DEBUG?.getLastWorldRelease?.();
      return !release || String(release.id ?? '').startsWith(a);
    }, { timeout: 30_000, polling: 250 }, mapA).catch(() => {});
    await collect();
    const probes = await page.evaluate(readProbes);
    const usage = await cdp.send('Runtime.getHeapUsage');
    const heap = {
      usedMb: +(usage.usedSize / 1048576).toFixed(1),
      backingStoreMb: usage.backingStorageSize !== undefined ? +(usage.backingStorageSize / 1048576).toFixed(1) : null,
      totalMb: +((usage.usedSize + (usage.backingStorageSize ?? 0)) / 1048576).toFixed(1),
      performanceMemoryMb: await page.evaluate(() => performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null),
    };
    report.settle = { probes, heap, release: await page.evaluate(() => window.__DEBUG?.getLastWorldRelease?.() ?? null) };
    await step(`${mapB} settled`, report.settle);
    const alive = Object.entries(probes).filter(([, probe]) => probe.rootAlive).map(([key]) => key);
    if (retainers && alive.length) {
      const names = alive.map((key) => `RetainMarker_${key}`);
      const locate = Object.fromEntries(alive.map((key) => [`RetainMarker_${key}`,
        `window.__RETENTION?.${key}?.root.deref()?.userData.__retainMarker`]));
      report.retainers = await snapshotRetainerPaths(cdp, names, 4, locate);
      for (const [name, paths] of Object.entries(report.retainers)) for (const steps of paths) log(`retainer of ${name}: ${steps.join(' > ')}`);
    }
    if (saveSnapshot) {
      // the raw snapshot on disk, for an offline read (closure source locations through the dist's source maps)
      const file = join(out, `${label}-${mapB}.heapsnapshot`);
      const stream = createWriteStream(file);
      const onChunk = ({ chunk }) => stream.write(chunk);
      cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
      try { await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false }); }
      finally { cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk); }
      await new Promise((done) => stream.end(done));
      report.snapshot = file;
      log(`snapshot ${file}`);
    }
    report.verdict = retentionVerdict(probes, { expect, expectDressing });
    failed = !report.verdict.pass;
    const worldA = probes.worldA ?? {}, dressing = probes.dressing ?? {};
    log(`verdict ${JSON.stringify(report.verdict)} world-${mapA}: root ${worldA.rootAlive ? 'ALIVE' : 'collected'}, `
      + `${worldA.arraysAlive}/${worldA.arrays} arrays alive (${worldA.aliveMb} MB); garage dressing: ${dressing.arraysAlive}/`
      + `${dressing.arrays} arrays alive (${dressing.aliveMb} MB); heap ${heap.totalMb} MB`);
  } catch (error) {
    report.errors.push(String(error.stack || error).slice(0, 1200));
    log(`FAIL ${error.message}`);
    report.verdict = { pass: false, error: true };
  } finally {
    await writeFile(join(out, `${label}.json`), `${JSON.stringify(report, null, 2)}\n`).catch(() => {});
    if (browser) await browser.close().catch(() => browser.process()?.kill('SIGKILL'));
    if (server) await new Promise((done) => server.httpServer.close(() => done())).catch(() => {});
  }
  return report.verdict?.error ? 2 : failed ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
