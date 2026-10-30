#!/usr/bin/env node
// The battle memory probe (battle-spikes-253, the memory lockdown; docs/PERF-SPIKES.md "Memory"): one page plays battle
// after battle (the census's driver), returning to the Garage between them, and after each return (two forced
// collections, a settle) reads what the page still holds:
//   - the JS heap, the DOM (nodes, documents, listeners) — CDP Performance.getMetrics;
//   - the renderer's geometries, textures and programs, the scene's objects;
//   - the game's own residency (the world and pedestal caches, the battle visual pool, the phase scene and the Garage
//     GPU residency, the last world release) through __DEBUG;
//   - the browser's resident set by process (the renderer's and the GPU process's: on a Mac the GPU's memory is the GPU
//     process's).
// --retained samples, from the first return to the last, the allocations still alive at the end (V8's sampling heap
// profiler without the collected objects): what battles 2..N left behind, by site (through the dist's source maps).
// --leak-check holds each battle's world weakly under a marker class of its own and reports, after each return, which
// worlds are alive (current, cached, or LEAKED); --retainers (implies it) prints a leaked world's shortest strong
// retainer paths from a heap snapshot parsed as it streams (tools/heap-retainers.mjs).
// --gate judges the returns against tools/battle-memory-budget.json: the growth from the first return to the last, a
// battle, the peak, and (with --leak-check) the released worlds still alive.
//
//   node tools/battle-memory-probe.mjs [--scenarios=urban:zone_control] [--size=14] [--battles=3] [--seconds=30]
//        [--root=.] [--port=5398] [--out=<dir>] [--retained] [--leak-check] [--retainers] [--gate] [--viewport=1920x1080] [--preset=high]
import { launchGuardedBrowser } from './browser-launch.mjs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { MAP_PROBE_BROWSER_ARGS, isMainModule, sleep } from './map-probe-runtime.mjs';
import { acquireProbeLocks, openPreview, pinnedOpponents } from './frame-budget-probe.mjs';
import { driveBattle, installCensusObservers, sourceResolver, summarizeHeapProfile } from './battle-spike-census.mjs';
import { snapshotRetainerPaths } from './heap-retainers.mjs';

const TOOL = 'battle-memory-probe';
const BUDGET_FILE = fileURLToPath(new URL('./battle-memory-budget.json', import.meta.url));
const log = (message) => console.log(`[${TOOL} ${new Date().toISOString().slice(11, 19)}] ${message}`);

export function parseMemoryArgs(argv) {
  const o = { scenarios: ['urban:zone_control'], size: 14, battles: 3, seconds: 30, root: process.cwd(), port: 5398, out: null,
    retained: false, census: false, dump: false, walk: false, leakCheck: false, retainers: false, sequence: null, gate: false, viewport: '1920x1080', preset: 'high', spec: 't90m' };
  for (const arg of argv) {
    const flag = arg.replace(/^--/, ''), at = flag.indexOf('=');
    const key = at < 0 ? flag : flag.slice(0, at), value = at < 0 ? '1' : flag.slice(at + 1);
    switch (key) {
      case 'scenarios': o.scenarios = value.split(',').filter(Boolean); break;
      case 'size': o.size = Number(value); break;
      case 'battles': o.battles = Number(value); break;
      case 'seconds': o.seconds = Number(value); break;
      case 'root': o.root = path.resolve(value); break;
      case 'port': o.port = Number(value); break;
      case 'out': o.out = path.resolve(value); break;
      case 'retained': o.retained = value !== '0'; break;
      case 'census': o.census = value !== '0'; break;
      case 'dump': o.dump = value !== '0'; break;
      case 'walk': o.walk = value !== '0'; break;
      case 'leak-check': o.leakCheck = value !== '0'; break;
      case 'retainers': o.retainers = value !== '0'; o.leakCheck ||= o.retainers; break;
      // a battle per entry, in order, in the one page (a player on the random rotation): the scenario names the first
      case 'sequence': o.sequence = value.split(',').filter(Boolean); break;
      case 'gate': o.gate = value !== '0'; break;
      case 'viewport': o.viewport = value; break;
      case 'preset': o.preset = value; break;
      case 'spec': o.spec = value; break;
      default: throw new Error(`${TOOL}: unknown flag --${key}`);
    }
  }
  if (!(o.battles >= 2)) throw new Error('--battles: at least 2 (the growth is from the first return to the last)');
  for (const s of [...o.scenarios, ...(o.sequence ?? [])]) if (!/^[a-z_]+:[a-z_0-9]+$/.test(s)) throw new Error(`--scenarios/--sequence: <map>:<mode>, not ${s}`);
  o.out ??= path.join(os.homedir(), 'cot-lanes', 'battle-memory', new Date().toISOString().slice(0, 16).replace(/[:T]/g, ''));
  return o;
}

/** The browser tree's resident set by process kind (MB): the browser, the renderers, the GPU process, the rest. */
function rssByKind(rootPid) {
  const rows = execSync('ps -axo pid=,ppid=,rss=,command=', { encoding: 'utf8', maxBuffer: 1 << 26 }).trim().split('\n').map((line) => {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
    return m ? { pid: Number(m[1]), ppid: Number(m[2]), kb: Number(m[3]), command: m[4] } : null;
  }).filter(Boolean);
  const children = new Map();
  for (const row of rows) { const list = children.get(row.ppid) ?? []; list.push(row); children.set(row.ppid, list); }
  const out = { browser: 0, renderer: 0, gpu: 0, other: 0 };
  const stack = rows.filter((row) => row.pid === rootPid);
  while (stack.length) {
    const row = stack.pop();
    const type = /--type=([a-z-]+)/.exec(row.command)?.[1] ?? 'browser';
    const kind = type === 'renderer' ? 'renderer' : type === 'gpu-process' ? 'gpu' : type === 'browser' ? 'browser' : 'other';
    out[kind] += row.kb / 1024;
    stack.push(...(children.get(row.pid) ?? []));
  }
  for (const key of Object.keys(out)) out[key] = Math.round(out[key]);
  out.total = out.browser + out.renderer + out.gpu + out.other;
  return out;
}

/**
 * (--census) The CPU-side bytes the page keeps beside the GPU's copies, by owner: each top-level child of the world's
 * group (its geometries' attribute and index arrays, its instance matrices and colours, its materials' texture pixels:
 * a canvas or an image at 4 bytes a texel, a data texture's array; each counted once), the height field's typed arrays,
 * and the scene outside the world. Run in the page (no closures).
 */
function pageMemoryCensus() {
  const seenGeo = new Set(), seenTex = new Set(), seenArr = new Set();
  const arrBytes = (a) => { if (!a || seenArr.has(a.buffer ?? a)) return 0; seenArr.add(a.buffer ?? a); return a.byteLength ?? 0; };
  const geoBytes = (g) => {
    let b = 0;
    for (const attr of Object.values(g.attributes ?? {})) b += arrBytes(attr.array ?? attr.data?.array);
    if (g.index) b += arrBytes(g.index.array);
    for (const list of Object.values(g.morphAttributes ?? {})) for (const attr of list) b += arrBytes(attr.array);
    return b;
  };
  const texBytes = (t) => {
    const img = t.image;
    if (!img) return 0;
    if (img.data) return arrBytes(img.data);
    if (Array.isArray(img)) return img.reduce((sum, face) => sum + (face?.width ?? 0) * (face?.height ?? 0) * 4, 0);
    return (img.width ?? 0) * (img.height ?? 0) * 4;
  };
  const tally = (root) => {
    const out = { geoMB: 0, instMB: 0, texMB: 0, geometries: 0, textures: 0 };
    root.traverse((o) => {
      if (o.geometry && !seenGeo.has(o.geometry)) { seenGeo.add(o.geometry); out.geoMB += geoBytes(o.geometry); out.geometries++; }
      if (o.instanceMatrix) out.instMB += arrBytes(o.instanceMatrix.array);
      if (o.instanceColor) out.instMB += arrBytes(o.instanceColor.array);
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        for (const v of Object.values(m)) if (v && v.isTexture && !seenTex.has(v)) { seenTex.add(v); out.texMB += texBytes(v); out.textures++; }
        for (const u of Object.values(m.uniforms ?? {})) {
          const v = u?.value;
          if (v && v.isTexture && !seenTex.has(v)) { seenTex.add(v); out.texMB += texBytes(v); out.textures++; }
        }
      }
    });
    for (const k of ['geoMB', 'instMB', 'texMB']) out[k] = Math.round(out[k] / 1e5) / 10;
    return out;
  };
  const world = window.__DEBUG?.world;
  const result = { world: null, heightFieldMB: 0, outsideWorld: null };
  if (world?.group) {
    result.world = {};
    for (const child of world.group.children) result.world[`${child.name || child.type}#${child.id}`] = tally(child);
    let hf = 0;
    const field = world.heightField ?? {};
    for (const v of Object.values(field)) {
      if (ArrayBuffer.isView(v)) hf += arrBytes(v);
      else if (v && typeof v === 'object') for (const w of Object.values(v)) if (ArrayBuffer.isView(w)) hf += arrBytes(w);
    }
    result.heightFieldMB = Math.round(hf / 1e5) / 10;
  }
  const scene = window.__DEBUG?.scene;
  if (scene) {
    const outside = { geoMB: 0, instMB: 0, texMB: 0, geometries: 0, textures: 0 };
    for (const child of scene.children) {
      if (world?.group && child === world.group) continue;
      const t = tally(child);
      for (const k of Object.keys(outside)) outside[k] += t[k];
    }
    result.outsideWorld = outside;
  }
  return result;
}

/**
 * (--dump) Chrome's memory-infra dump of every process (a browser-level trace, disabled-by-default-memory-infra, one
 * detailed dump): per process its top-level allocators past 5 MB (v8 with each isolate — the page's and its workers' —
 * partition_alloc, malloc, blink_gc, gpu, skia, cc, web_cache ...). What the resident set the census cannot see is made of.
 */
async function memoryInfraDump(browser) {
  const cdp = await browser.target().createCDPSession();
  const events = [];
  cdp.on('Tracing.dataCollected', ({ value }) => { for (const e of value) events.push(e); });
  const complete = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: {
    includedCategories: ['disabled-by-default-memory-infra'], memoryDumpConfig: { triggers: [] }, recordMode: 'recordUntilFull' } });
  await sleep(500);
  await cdp.send('Tracing.requestMemoryDump', { deterministic: true, levelOfDetail: 'detailed' }).catch(() => null);
  await sleep(2000);
  await cdp.send('Tracing.end');
  await complete;
  await cdp.detach().catch(() => {});
  const names = new Map();
  for (const e of events) if (e.ph === 'M' && e.name === 'process_name') names.set(e.pid, e.args?.name ?? '?');
  const out = {};
  for (const e of events) {
    const allocators = e.ph === 'v' ? e.args?.dumps?.allocators : null;
    if (!allocators) continue;
    const rows = {};
    for (const [name, dump] of Object.entries(allocators)) {
      // two levels everywhere; three under partition_alloc/partitions (array_buffer, buffer, fast_malloc, layout) and v8
      const depth = name.split('/').length;
      if (depth > 3 || (depth === 3 && !/^(partition_alloc\/partitions|v8\/(main|workers))\//.test(name))) continue;
      const size = dump?.attrs?.size?.value ? parseInt(dump.attrs.size.value, 16) : 0;
      if (size >= 5e6) rows[name] = Math.round(size / 1e6);
    }
    out[`${names.get(e.pid) ?? 'process'} ${e.pid}`] = Object.fromEntries(Object.entries(rows).sort((a, b) => b[1] - a[1]).slice(0, 60));
  }
  return out;
}

/**
 * (--walk) The ArrayBuffers reachable from the game's roots (the world, the game, the scene, the renderer's info), each
 * counted once at the property path it was first reached by, summed to three levels (world.props.destructibles ...).
 * Depth-first (a stack) through plain objects, arrays, Maps and Sets; DOM nodes and functions are not entered (a closure's
 * captures and module-level caches are out of its sight). Run in the page (no closures).
 */
function pageBufferWalk() {
  const roots = { world: window.__DEBUG?.world, game: window.__DEBUG?.game, scene: window.__DEBUG?.scene };
  const seen = new Set(), buffers = new Set(), byPath = new Map();
  const queue = [];
  for (const [name, value] of Object.entries(roots)) if (value && typeof value === 'object') queue.push([value, name, 0]);
  let visited = 0;
  const credit = (path, bytes) => {
    const key = path.split('.').slice(0, 3).join('.');
    byPath.set(key, (byPath.get(key) ?? 0) + bytes);
  };
  const push = (value, path, depth) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    if (ArrayBuffer.isView(value)) {
      const buffer = value.buffer;
      if (!buffers.has(buffer)) { buffers.add(buffer); credit(path, buffer.byteLength); }
      seen.add(value);
      return;
    }
    if (value instanceof ArrayBuffer) { if (!buffers.has(value)) { buffers.add(value); credit(path, value.byteLength); } return; }
    if (typeof Node !== 'undefined' && value instanceof Node) return;
    if (depth > 24) return;
    queue.push([value, path, depth]);
  };
  while (queue.length && visited < 3e6) {
    const [object, path, depth] = queue.pop();
    if (seen.has(object)) continue;
    seen.add(object);
    visited++;
    if (object instanceof Map) { let i = 0; for (const [k, v] of object) { push(k, path, depth + 1); push(v, `${path}.${typeof k === 'string' ? k : '[map]'}`, depth + 1); if (++i > 2e5) break; } continue; }
    if (object instanceof Set) { let i = 0; for (const v of object) { push(v, `${path}.[set]`, depth + 1); if (++i > 2e5) break; } continue; }
    if (Array.isArray(object)) { const n = Math.min(object.length, 2e5); for (let i = 0; i < n; i++) push(object[i], `${path}.[]`, depth + 1); continue; }
    let keys;
    try { keys = Object.keys(object); } catch { continue; }
    for (const key of keys) {
      let value;
      try { value = object[key]; } catch { continue; }
      push(value, `${path}.${key}`, depth + 1);
    }
  }
  const rows = [...byPath].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([key, bytes]) => [key, Math.round(bytes / 1e5) / 10]);
  return { visited, buffers: buffers.size, totalMB: Math.round([...buffers].reduce((a, b) => a + b.byteLength, 0) / 1e5) / 10, rows };
}

/** What the page holds now (after its collections): the heap, the DOM, the renderer, the game's residency. */
async function measure(page, cdp, pid) {
  await cdp.send('HeapProfiler.collectGarbage');
  await sleep(300);
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  const metric = (name) => metrics.find((m) => m.name === name)?.value ?? null;
  const game = await page.evaluate(() => {
    const D = window.__DEBUG;
    const r = D.renderer;
    let objects = 0, meshes = 0;
    D.scene.traverse((o) => { objects++; if (o.isMesh) meshes++; });
    const copy = (value) => { try { return JSON.parse(JSON.stringify(value ?? null)); } catch { return null; } };
    return {
      phase: D.game.phase, textures: r.info.memory.textures, geometries: r.info.memory.geometries, programs: r.info.programs?.length ?? null,
      sceneObjects: objects, sceneMeshes: meshes, allTanks: D.game.allTanks?.length ?? null,
      worldCacheIds: copy(D.worldCacheIds), pedestalCacheIds: copy(D.pedestalCacheIds), battleVisualPool: copy(D.battleVisualPool),
      phaseSceneResidency: copy(D.phaseSceneResidency), garageGpuResidency: copy(D.garageGpuResidency), lastWorldRelease: copy(D.lastWorldRelease),
    };
  });
  return {
    jsHeapMB: Math.round((metric('JSHeapUsedSize') ?? 0) / 1048576), jsHeapTotalMB: Math.round((metric('JSHeapTotalSize') ?? 0) / 1048576),
    nodes: metric('Nodes'), documents: metric('Documents'), listeners: metric('JSEventListeners'), layoutObjects: metric('LayoutObjects'),
    rss: rssByKind(pid), ...game,
  };
}

const keyOf = (scenario, size) => `${scenario.replace(':', '-')}-${size}v${size}`;

/** One page, `battles` battles of a scenario; the measures after each return, the retained sample over battles 2..N. */
async function probeScenario(options, scenario) {
  const [mapId, gameMode] = scenario.split(':');
  const [width, height] = options.viewport.split('x').map(Number);
  const allies = options.size - 1, enemies = options.size;
  const browser = await launchGuardedBrowser(puppeteer, { headless: 'new', protocolTimeout: 900000,
    args: [...MAP_PROBE_BROWSER_ARGS, `--window-size=${width},${height}`, '--js-flags=--max-old-space-size=3072'] });
  const pid = browser.process()?.pid;
  let peak = { total: 0 };
  const watch = setInterval(() => { try { const now = rssByKind(pid); if (now.total > peak.total) peak = now; } catch { /* a closing browser */ } }, 3000);
  watch.unref();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error?.message ?? error).slice(0, 300)));
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(installCensusObservers, { preset: options.preset, allies, enemies });
    await page.goto(`http://127.0.0.1:${options.port}/?nosplash=1&tier=desktop`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction('window.__GAME_READY === true', { timeout: 300000 });
    await page.evaluate(() => { const P = window.__DEBUG.post; P.setAdaptiveSuspended?.(true); P.pinDynScale?.(1); });
    const catalog = await page.evaluate(() => window.__DEBUG.game.allTanks.map((e) => e.specId));
    await page.evaluate((ids) => { const f = window.__DEBUG.flags; f.forceRoster = ids; f.rosterExact = true; }, pinnedOpponents(catalog, options.spec, allies + enemies));
    const cdp = await page.target().createCDPSession();
    await cdp.send('Performance.enable');
    await cdp.send('HeapProfiler.enable');
    await sleep(3000);
    const returns = [{ label: 'garage at boot', ...(await measure(page, cdp, pid)) }];
    let sampling = false;
    for (let battle = 1; battle <= options.battles; battle++) {
      if (options.retained && battle === 2) {
        await cdp.send('HeapProfiler.startSampling', { samplingInterval: 32768 });
        sampling = true;
      }
      const entryStarted = Date.now();
      const [battleMap, battleMode] = options.sequence ? options.sequence[(battle - 1) % options.sequence.length].split(':') : [mapId, gameMode];
      await page.evaluate((request) => { setTimeout(() => window.__DEBUG.beginSoloBattle(request), 0); }, { specId: options.spec, mapId: battleMap, gameMode: battleMode });
      await page.waitForFunction('window.__DEBUG.game.phase === "battle"', { timeout: 420000, polling: 250 });
      const entryMs = Date.now() - entryStarted;
      // the entry's covered first-battle warm (once a session; window.__BATTLE_FIRST_WARM) and its load stages
      const entry = await page.evaluate(() => ({ firstWarm: window.__BATTLE_FIRST_WARM ?? null,
        loadStages: window.__BATTLE_LOAD?.stages ?? null }));
      await page.waitForFunction('window.__DEBUG.game.preBattleS <= 0', { timeout: 420000, polling: 250 });
      const inBattle = rssByKind(pid);
      await driveBattle(page, { seconds: options.seconds, mode: battleMode });
      const atEnd = rssByKind(pid);
      // (--leak-check) this battle's world, held weakly and marked (a class of its own, named in a heap snapshot)
      if (options.leakCheck) await page.evaluate((label, battleIndex) => {
        const world = window.__DEBUG?.world;
        if (!world) return;
        window.__WORLD_REFS ??= [];
        // a class named in its own source: a heap snapshot names an instance by its class's declared (or inferred) name,
        // not by a computed .name (a `{ [key]: class {} }` marker read as its variable's name)
        const markers = [class LeakMarker_1 {}, class LeakMarker_2 {}, class LeakMarker_3 {}, class LeakMarker_4 {},
          class LeakMarker_5 {}, class LeakMarker_6 {}, class LeakMarker_7 {}, class LeakMarker_8 {}, class LeakMarker_9 {},
          class LeakMarker_10 {}, class LeakMarker_11 {}, class LeakMarker_12 {}];
        world.__leakMarker = new markers[(battleIndex - 1) % markers.length]();
        window.__WORLD_REFS.push({ label, mapId: world.mapId, ref: new WeakRef(world) });
      }, `${battle}_${battleMap}`, battle);
      const inBattleCensus = options.census ? await page.evaluate(pageMemoryCensus) : null;
      await page.evaluate(() => window.__DEBUG.leaveBattleToGarage());
      await page.waitForFunction('window.__DEBUG.game.phase === "garage"', { timeout: 180000, polling: 250 });
      await sleep(5000);
      const row = { label: `garage after battle ${battle} (${battleMap})`, map: battleMap, entryMs, ...entry, battleRss: { atRollout: inBattle, atEnd }, ...(await measure(page, cdp, pid)) };
      if (options.leakCheck) {
        // after measure's collections: which battles' worlds are still alive, and whether each is still cached
        row.worldsAlive = await page.evaluate(() => (window.__WORLD_REFS ?? []).map(({ label, mapId, ref }) => {
          const world = ref.deref();
          return { label, mapId, alive: !!world, cached: (window.__DEBUG?.worldCacheIds ?? []).includes(mapId),
            current: world ? window.__DEBUG?.world === world : false };
        }));
        log(`worlds alive: ${row.worldsAlive.map((w) => `${w.label}${w.alive ? (w.current ? ' (current)' : w.cached ? ' (cached)' : ' (LEAKED)') : ' (collected)'}`).join(', ')}`);
        // (--retainers) a leaked world's shortest strong retainer paths, from a heap snapshot parsed as it streams
        const leakedRows = row.worldsAlive.filter((w) => w.alive && !w.current && !w.cached);
        const leaked = leakedRows.map((w) => `LeakMarker_${((Number.parseInt(w.label, 10) - 1) % 12) + 1}`);
        if (options.retainers && leaked.length) {
          // each marker found by its heap id as well (the string table can lose a stretch and misname it)
          const locate = Object.fromEntries(leakedRows.map((w, k) => [leaked[k],
            `(window.__WORLD_REFS ?? []).find((w) => w.label === ${JSON.stringify(w.label)})?.ref.deref()?.__leakMarker`]));
          row.retainers = await snapshotRetainerPaths(cdp, leaked, 3, locate);
          for (const [name, perMarker] of Object.entries(row.retainers)) {
            for (const paths of perMarker) for (const steps of paths) log(`retainer of ${name}: ${steps.join(' > ')}`);
          }
        }
      }
      if (options.walk) {
        row.bufferWalk = await page.evaluate(pageBufferWalk);
        log(`walk ${row.bufferWalk.visited} objects, ${row.bufferWalk.buffers} buffers, ${row.bufferWalk.totalMB} MB: ${JSON.stringify(row.bufferWalk.rows.slice(0, 40))}`);
      }
      if (options.dump) {
        row.memoryInfra = await memoryInfraDump(browser);
        for (const [proc, rows] of Object.entries(row.memoryInfra)) log(`dump ${proc}: ${JSON.stringify(rows).slice(0, 900)}`);
      }
      if (options.census) {
        row.census = { inBattle: inBattleCensus, garage: await page.evaluate(pageMemoryCensus) };
        log(`census in battle ${JSON.stringify(inBattleCensus).slice(0, 1500)}`);
        log(`census in the garage ${JSON.stringify(row.census.garage).slice(0, 600)}`);
      }
      returns.push(row);
      log(`${keyOf(scenario, options.size)} battle ${battle}: heap ${row.jsHeapMB} MB, nodes ${row.nodes}, listeners ${row.listeners}, `
        + `textures ${row.textures}, geometries ${row.geometries}, programs ${row.programs}, rss ${row.rss.total} MB (gpu ${row.rss.gpu}, renderer ${row.rss.renderer}); `
        + `in battle ${atEnd.total} MB; entry ${entryMs} ms, first warm ${JSON.stringify(entry.firstWarm)}`);
    }
    let retained = null;
    if (sampling) {
      const { profile } = await cdp.send('HeapProfiler.stopSampling');
      writeFileSync(path.join(options.out, `${keyOf(scenario, options.size)}.retained.json.gz`), gzipSync(JSON.stringify(profile)));
      retained = summarizeHeapProfile(profile, 0, { resolve: await sourceResolver(options.root), top: 40 });
    }
    return { scenario, size: `${options.size}v${options.size}`, battles: options.battles, seconds: options.seconds, returns, peakRss: peak,
      growth: growthOf(returns), retained, errors };
  } finally {
    clearInterval(watch);
    await browser.close().catch(() => {});
  }
}

/** From the first return to the last: each measure's growth in all and a battle. */
export function growthOf(returns) {
  const first = returns[1], last = returns[returns.length - 1];
  const battles = returns.length - 2;
  if (!first || !last || battles < 1) return null;
  const out = {};
  for (const key of ['jsHeapMB', 'nodes', 'listeners', 'documents', 'textures', 'geometries', 'programs', 'sceneObjects']) {
    if (typeof first[key] === 'number' && typeof last[key] === 'number') {
      out[key] = { total: last[key] - first[key], perBattle: Math.round((last[key] - first[key]) / battles * 10) / 10 };
    }
  }
  out.rssMB = { total: last.rss.total - first.rss.total, perBattle: Math.round((last.rss.total - first.rss.total) / battles) };
  out.gpuMB = { total: last.rss.gpu - first.rss.gpu, perBattle: Math.round((last.rss.gpu - first.rss.gpu) / battles) };
  return out;
}

/** A record against the budget: [{ name, value, limit, verdict }]. */
export function judgeMemory(record, budget) {
  const g = record.growth ?? {};
  const readings = {
    jsHeapGrowthPerBattleMB: g.jsHeapMB?.perBattle, nodesGrowthPerBattle: g.nodes?.perBattle, listenersGrowthPerBattle: g.listeners?.perBattle,
    texturesGrowthPerBattle: g.textures?.perBattle, geometriesGrowthPerBattle: g.geometries?.perBattle, rssGrowthPerBattleMB: g.rssMB?.perBattle,
    peakRssMB: record.peakRss?.total,
    // (--leak-check) the most worlds alive after a return that are neither the current nor a cached one (released, held)
    leakedWorlds: (record.returns ?? []).some((row) => row.worldsAlive)
      ? Math.max(0, ...(record.returns ?? []).map((row) => (row.worldsAlive ?? []).filter((w) => w.alive && !w.current && !w.cached).length))
      : undefined,
  };
  return Object.entries(budget.limits ?? {}).map(([name, limit]) => {
    const value = readings[name];
    if (value == null) return { name, value, limit, verdict: 'FAIL', why: 'not measured' };
    return { name, value, limit, verdict: value <= limit ? 'PASS' : 'FAIL' };
  });
}

if (isMainModule(import.meta.url)) {
  const options = parseMemoryArgs(process.argv.slice(2));
  mkdirSync(options.out, { recursive: true });
  if (!existsSync(path.join(options.root, 'dist', 'index.html'))) throw new Error(`${options.root} has no dist`);
  const locks = await acquireProbeLocks({ log });
  const refresh = setInterval(() => locks.refresh(), 30000);
  refresh.unref();
  const server = await openPreview(options.root, options.port);
  let failed = 0;
  try {
    const budget = options.gate ? JSON.parse(readFileSync(BUDGET_FILE, 'utf8')) : null;
    for (const scenario of options.scenarios) {
      const record = await probeScenario(options, scenario);
      writeFileSync(path.join(options.out, `${keyOf(scenario, options.size)}.json`), JSON.stringify(record, null, 1));
      log(`${keyOf(scenario, options.size)}: growth ${JSON.stringify(record.growth)}; peak ${JSON.stringify(record.peakRss)}`);
      if (record.retained) for (const site of record.retained.sites.slice(0, 12)) log(`  retained ${site.mb} MB ${site.chunk} ${site.fn} ${site.source ?? site.at}`);
      if (budget) {
        const verdicts = judgeMemory(record, budget);
        failed += verdicts.filter((v) => v.verdict === 'FAIL').length;
        log(`${keyOf(scenario, options.size)}: ${verdicts.map((v) => `${v.name} ${v.value} ≤ ${v.limit} ${v.verdict}`).join('; ')}`);
      }
    }
  } finally {
    await server.close().catch(() => {});
    clearInterval(refresh);
    locks.release();
  }
  if (options.gate && failed) { log(`${failed} limit(s) FAILED`); process.exitCode = 1; }
}
