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
//   (--dev serves this checkout's sources through vite's dev server instead of a dist: the standing receipt,
//   tools/battle-retention.browser.selftest.mjs, runs runRetentionRoute that way)
//
// Exit 0 when the reading matches --expect (default released: world A's root collected and none of its arrays alive) and
// --expect-dressing (released | retained | any, the default); 1 otherwise; 2 on a failed run. --expect=retained is the
// reverted control's side.
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { launchGuardedBrowser, parseFootprint } from './browser-launch.mjs';
import { snapshotRetainerPaths } from './heap-retainers.mjs';
import { readinessExpression } from './game-readiness.mjs';

const root = new URL('..', import.meta.url).pathname;

/** The probe's options from its command line. */
export function parseRetentionArgs(argv = process.argv.slice(2)) {
  const arg = (name, fallback) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
  const [mapA, mapB] = arg('maps', 'verdant,winter').split(',');
  return {
    dev: argv.includes('--dev'),
    distDir: resolve(arg('dist', 'dist')),
    label: arg('label', 'run'),
    out: resolve(arg('out', '.qa-dev/battle-retention')),
    port: Number(arg('port', 4271)),
    mapA, mapB,
    cpuRate: Number(arg('cpu', 4)),
    expect: arg('expect', 'released'),
    expectDressing: arg('expect-dressing', 'any'),
    retainers: argv.includes('--retainers'),
    saveSnapshot: argv.includes('--save-snapshot'),
    settleMs: Number(arg('settle-ms', 4000)),
    memoryDump: argv.includes('--memory-dump'),
  };
}
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

/**
 * (--memory-dump) The renderer's own memory beside the V8 heap: its phys_footprint (footprint(1)) and Chrome's memory-infra
 * dump by allocator (battle-memory-probe memoryInfraDump), renderer rows only. Decoded images, canvases, malloc and the
 * WebGL client's copies live outside V8; Safari's WebContent footprint counts them all.
 */
async function rendererMemory(browser) {
  const root = browser.process()?.pid;
  const rows = execFileSync('ps', ['-A', '-ww', '-o', 'pid=,ppid=,command='], { encoding: 'utf8', maxBuffer: 1 << 26 }).trim().split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean).map((m) => ({ pid: +m[1], ppid: +m[2], command: m[3] }));
  const tree = new Set([root]);
  for (let grew = true; grew;) { grew = false; for (const row of rows) if (!tree.has(row.pid) && tree.has(row.ppid)) { tree.add(row.pid); grew = true; } }
  const renderers = rows.filter((row) => tree.has(row.pid) && row.command.includes('--type=renderer')).map((row) => row.pid);
  let footprintMb = null;
  try {
    const text = execFileSync('footprint', ['-f', 'bytes', '--noCategories', ...renderers.flatMap((pid) => ['-p', String(pid)])],
      { encoding: 'utf8', timeout: 30_000, maxBuffer: 1 << 24 });
    const parsed = parseFootprint(text);
    footprintMb = Object.fromEntries(renderers.map((pid) => [pid, +(parsed.get(pid) ?? 0).toFixed(0)]));
  } catch { /* footprint(1) unavailable: the dump still names the allocators */ }
  const { memoryInfraDump } = await import('./battle-memory-probe.mjs');
  const dump = await memoryInfraDump(browser);
  const renderer = Object.fromEntries(Object.entries(dump).filter(([name]) => /renderer/i.test(name)));
  return { footprintMb, renderer };
}

/**
 * One route (Garage -> A -> Garage -> B) and its reading: the report, with `verdict` (retentionVerdict; `error` on a run
 * that did not finish). Writes `<out>/<label>.json` when `out` is set.
 */
export async function runRetentionRoute({ dev = false, distDir = resolve('dist'), label = 'run', out = null, port = 4271,
  mapA = 'verdant', mapB = 'winter', cpuRate = 4, expect = 'released', expectDressing = 'any', retainers = false,
  saveSnapshot = false, settleMs = 4000, memoryDump = false } = {}) {
  const log = (line) => process.stderr.write(`[battle-retention ${label}] ${line}\n`);
  const [{ default: puppeteer }, vite] = await Promise.all([import('puppeteer'), import('vite')]);
  let server, browser;
  const report = { label, source: dev ? 'dev server' : distDir, maps: [mapA, mapB], cpuRate, steps: [], errors: [] };
  try {
    if (out) await mkdir(out, { recursive: true });
    if (dev) {
      server = await vite.createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } });
      await server.listen();
      port = server.httpServer.address().port;
    } else {
      server = await vite.preview({ root, logLevel: 'error', build: { outDir: distDir }, preview: { host: '127.0.0.1', port, strictPort: true, open: false } });
    }
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
    if (memoryDump) { await collect(); report.garageMemory = await rendererMemory(browser); await step('garage memory', report.garageMemory); }
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
    report.settle = { probes, heap, release: await page.evaluate(() => window.__DEBUG?.getLastWorldRelease?.() ?? null),
      ...(memoryDump ? { memory: await rendererMemory(browser) } : {}) };
    await step(`${mapB} settled`, report.settle);
    const alive = Object.entries(probes).filter(([, probe]) => probe.rootAlive).map(([key]) => key);
    if (retainers && alive.length) {
      const names = alive.map((key) => `RetainMarker_${key}`);
      const locate = Object.fromEntries(alive.map((key) => [`RetainMarker_${key}`,
        `window.__RETENTION?.${key}?.root.deref()?.userData.__retainMarker`]));
      report.retainers = await snapshotRetainerPaths(cdp, names, 4, locate);
      for (const [name, paths] of Object.entries(report.retainers)) for (const steps of paths) log(`retainer of ${name}: ${steps.join(' > ')}`);
    }
    if (saveSnapshot && out) {
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
    const worldA = probes.worldA ?? {}, dressing = probes.dressing ?? {};
    log(`verdict ${JSON.stringify(report.verdict)} world-${mapA}: root ${worldA.rootAlive ? 'ALIVE' : 'collected'}, `
      + `${worldA.arraysAlive}/${worldA.arrays} arrays alive (${worldA.aliveMb} MB); garage dressing: ${dressing.arraysAlive}/`
      + `${dressing.arrays} arrays alive (${dressing.aliveMb} MB); heap ${heap.totalMb} MB`);
  } catch (error) {
    report.errors.push(String(error.stack || error).slice(0, 1200));
    log(`FAIL ${error.message}`);
    report.verdict = { pass: false, error: true };
  } finally {
    if (out) await writeFile(join(out, `${label}.json`), `${JSON.stringify(report, null, 2)}\n`).catch(() => {});
    if (browser) await browser.close().catch(() => browser.process()?.kill('SIGKILL'));
    if (server) await (dev ? server.close() : new Promise((done) => server.httpServer.close(() => done()))).catch(() => {});
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runRetentionRoute(parseRetentionArgs());
  process.exit(report.verdict?.error ? 2 : report.verdict?.pass ? 0 : 1);
}
