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
// --gate judges the returns against tools/battle-memory-budget.json: the growth from the first return to the last, a
// battle, and the peak.
//
//   node tools/battle-memory-probe.mjs [--scenarios=urban:zone_control] [--size=14] [--battles=3] [--seconds=30]
//        [--root=.] [--port=5398] [--out=<dir>] [--retained] [--gate] [--viewport=1920x1080] [--preset=high]
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

const TOOL = 'battle-memory-probe';
const BUDGET_FILE = fileURLToPath(new URL('./battle-memory-budget.json', import.meta.url));
const log = (message) => console.log(`[${TOOL} ${new Date().toISOString().slice(11, 19)}] ${message}`);

export function parseMemoryArgs(argv) {
  const o = { scenarios: ['urban:zone_control'], size: 14, battles: 3, seconds: 30, root: process.cwd(), port: 5398, out: null,
    retained: false, gate: false, viewport: '1920x1080', preset: 'high', spec: 't90m' };
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
      case 'gate': o.gate = value !== '0'; break;
      case 'viewport': o.viewport = value; break;
      case 'preset': o.preset = value; break;
      case 'spec': o.spec = value; break;
      default: throw new Error(`${TOOL}: unknown flag --${key}`);
    }
  }
  if (!(o.battles >= 2)) throw new Error('--battles: at least 2 (the growth is from the first return to the last)');
  for (const s of o.scenarios) if (!/^[a-z_]+:[a-z_0-9]+$/.test(s)) throw new Error(`--scenarios: <map>:<mode>, not ${s}`);
  o.out ??= path.join(os.homedir(), 'cot-lanes', 'battle-memory', new Date().toISOString().slice(0, 16).replace(/[:T]/g, ''));
  return o;
}

/** The browser tree's resident set by process kind (MB): the browser, the renderers, the GPU process, the rest. */
export function rssByKind(rootPid) {
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
  const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000,
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
      await page.evaluate((request) => { setTimeout(() => window.__DEBUG.beginSoloBattle(request), 0); }, { specId: options.spec, mapId, gameMode });
      await page.waitForFunction('window.__DEBUG.game.phase === "battle" && window.__DEBUG.game.preBattleS <= 0', { timeout: 420000, polling: 250 });
      const inBattle = rssByKind(pid);
      await driveBattle(page, { seconds: options.seconds, mode: gameMode });
      const atEnd = rssByKind(pid);
      await page.evaluate(() => window.__DEBUG.leaveBattleToGarage());
      await page.waitForFunction('window.__DEBUG.game.phase === "garage"', { timeout: 180000, polling: 250 });
      await sleep(5000);
      const row = { label: `garage after battle ${battle}`, battleRss: { atRollout: inBattle, atEnd }, ...(await measure(page, cdp, pid)) };
      returns.push(row);
      log(`${keyOf(scenario, options.size)} battle ${battle}: heap ${row.jsHeapMB} MB, nodes ${row.nodes}, listeners ${row.listeners}, `
        + `textures ${row.textures}, geometries ${row.geometries}, programs ${row.programs}, rss ${row.rss.total} MB (gpu ${row.rss.gpu}, renderer ${row.rss.renderer}); `
        + `in battle ${atEnd.total} MB`);
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
