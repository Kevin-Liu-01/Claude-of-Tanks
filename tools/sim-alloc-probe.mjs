#!/usr/bin/env node
// The simulation's allocation probe (battle-spikes-253, docs/PERF-SPIKES.md "Allocation"): the authoritative match
// (src/sim/authoritativeMatch.ts: the movement, the terrain contact, the bots, the shells and the destruction the solo
// battle steps too) on a map with bots on both sides, measured two ways after a warm-up:
//   - exactly: the heap's growth over a window of ticks in which no collection ran (the young generation sized past the
//     window's allocation; a GC observer proves none ran), in bytes a tick;
//   - by site: V8's sampling heap profiler over the same ticks (the collected objects included), the sites that
//     allocate most with their source lines (Node strips the types in place, so the lines are the .ts lines).
// A battle allocates per frame what its steps allocate here (and the presentation's own on top): this is the part a
// Node receipt can hold to a budget whatever the machine's load.
//
//   node --max-old-space-size=4096 --max-semi-space-size=512 tools/sim-alloc-probe.mjs [--map=verdant] [--per-side=14]
//        [--warm=600] [--ticks=300] [--seed=7] [--sites=25] [--json=<file>]
import { writeFileSync } from 'node:fs';
import { Session } from 'node:inspector/promises';
import { PerformanceObserver } from 'node:perf_hooks';
import v8 from 'node:v8';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const SPECS = Object.freeze(['m1a1_abrams_hc', 't90am', 'leo2_improved', 'm1a1_abrams_hc', 't90am']);
const DIFFICULTIES = Object.freeze(['normal', 'hard', 'easy', 'normal']);

/** A bot-filled authoritative match on `mapId`, `perSide` hulls a side, ready to step. */
export async function createProbeMatch({ mapId = 'verdant', perSide = 14, seed = 7, gameMode = 'standard' } = {}) {
  await import('../src/vehicles/tankFactory.ts');
  const { createAuthoritativeMatch } = await import('../src/sim/authoritativeMatch.ts');
  const { SIM_DT } = await import('../src/sim/movement.ts');
  const { createDedicatedWorldCollision } = await import('../server/dedicatedWorldCollision.ts');
  const players = [];
  for (let i = 0; i < perSide * 2; i++) {
    players.push({ id: `b${i}`, specId: SPECS[i % SPECS.length], team: i % 2 ? 'bravo' : 'alpha', bot: true, difficulty: DIFFICULTIES[i % DIFFICULTIES.length] });
  }
  const world = createDedicatedWorldCollision(mapId, { retain: true });
  const match = createAuthoritativeMatch({ players, mapId, seed, countdownS: 0, gameMode, worldCollision: world });
  match.onMatchReady();
  const inputs = new Map();
  const step = () => {
    match.step({ dt: SIM_DT, inputs });
    for (const event of match.eventsForViewer('__probe__')) void event;
    match.afterEventBroadcast();
  };
  return { match, step };
}

/** Bytes the window allocated, exactly: the heap's growth when no collection ran inside it (else null). */
export async function exactWindowBytes(step, ticks) {
  let collections = 0;
  const observer = new PerformanceObserver((list) => { collections += list.getEntries().length; });
  observer.observe({ entryTypes: ['gc'] });
  // a collection just before the window empties the young generation, so the window starts with all of it free
  globalThis.gc?.();
  await new Promise((resolve) => setImmediate(resolve));
  collections = 0;
  const before = v8.getHeapStatistics().used_heap_size;
  for (let i = 0; i < ticks; i++) step();
  const after = v8.getHeapStatistics().used_heap_size;
  await new Promise((resolve) => setImmediate(resolve));
  observer.disconnect();
  return collections === 0 ? after - before : null;
}

/** The sampling heap profile of `ticks` steps: the sites by self size (bytes), the source lines relative to the repo. */
export async function sampleWindowSites(step, ticks, { interval = 4096, top = 25 } = {}) {
  const session = new Session();
  session.connect();
  try {
    await session.post('HeapProfiler.enable');
    await session.post('HeapProfiler.startSampling', { samplingInterval: interval, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    for (let i = 0; i < ticks; i++) step();
    const { profile } = await session.post('HeapProfiler.stopSampling');
    const sites = new Map();
    let total = 0;
    const stack = [profile.head];
    while (stack.length) {
      const node = stack.pop();
      for (const child of node.children ?? []) stack.push(child);
      if (!node.selfSize) continue;
      total += node.selfSize;
      const f = node.callFrame;
      const file = f.url ? f.url.replace(/^file:\/\//, '').replace(REPO, '') : '(native)';
      const key = `${file}:${f.lineNumber + 1} ${f.functionName || '(anonymous)'}`;
      sites.set(key, (sites.get(key) ?? 0) + node.selfSize);
    }
    return { totalBytes: total, sites: [...sites].sort((a, b) => b[1] - a[1]).slice(0, top).map(([site, bytes]) => ({ site, bytes })) };
  } finally {
    await session.post('HeapProfiler.disable').catch(() => {});
    session.disconnect();
  }
}

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const mapId = arg('map', 'verdant'), perSide = Number(arg('per-side', 14)), warm = Number(arg('warm', 600));
  const ticks = Number(arg('ticks', 300)), seed = Number(arg('seed', 7)), top = Number(arg('sites', 25)), json = arg('json', '');
  const { match, step } = await createProbeMatch({ mapId, perSide, seed });
  for (let i = 0; i < warm; i++) step();
  const exact = await exactWindowBytes(step, ticks);
  const sampled = await sampleWindowSites(step, ticks, { top });
  const alive = match.entities.filter((e) => !e.combat?.destroyed).length;
  const kb = (bytes) => Math.round(bytes / 1024 * 10) / 10;
  console.log(`[sim-alloc-probe] ${mapId} ${perSide}v${perSide} after ${warm} ticks (${alive} alive): `
    + (exact == null ? 'a collection ran in the exact window (raise --max-semi-space-size)' : `${kb(exact / ticks)} KB a tick exactly`)
    + `; sampled ${kb(sampled.totalBytes / ticks)} KB a tick`);
  for (const { site, bytes } of sampled.sites) console.log(`  ${String(kb(bytes / ticks)).padStart(8)} KB/tick  ${site}`);
  if (json) writeFileSync(json, JSON.stringify({ mapId, perSide, warm, ticks, seed, exactBytesPerTick: exact == null ? null : exact / ticks, sampled }, null, 1));
}
