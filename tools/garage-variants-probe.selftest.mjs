import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { withGarageWorkshopProfile, readGarageWorkshopEndpoint } from './garage-workshop-profile.mjs';

const source = await readFile(new URL('./garage-variants-probe.mjs', import.meta.url), 'utf8');
assert.match(source, /variants\.length !== 10/);
assert.match(source, /stats\.triangles <= 0/);
assert.match(source, /architecture\.presented === true/,
  'visual gates must prove that the selected environment is actually mounted and visible');
assert.match(source, /stats\.exhibitCount !== 5/);
assert.match(source, /stats\.sharedMaintenanceBayCount !== 4/);
assert.match(source, /__GARAGE_DRESSING_PROBE/);
assert.match(source, /source !== 'authentic-garage-scene-pack'/);
assert.match(source, /architecture\.drawCalls > 25/);
assert.match(source, /architecture\.residentTextureSets > 9/);
assert.match(source, /for \(let pass = 0; pass < 4/);
assert.match(source, /intentRaceDecoy[\s\S]*architecture\.presented === true/,
  'Garage visual probe must cover concurrent selector prewarm and selection');
assert.match(source, /exerciseEnvironmentCycles\(variants\.length\)/);
assert.match(source, /exerciseEnvironmentCycles\(30\)/);
assert.match(source, /heapGrowth > 24 \* 1024 \* 1024/);
assert.match(source, /width: 1180, height: 820/);
assert.match(source, /width: 390, height: 844/);
assert.match(source, /panelMode !== 'overlay'/);
assert.match(source, /rightDisplay !== 'block'/,
  'responsive QA must preserve the intentionally visible compact stats sidebar');
assert.match(source, /frames\.maxGapMs > maxGapMs/);
assert.match(source, /workshopExhibitTextureCount !== 0/);
assert.match(source, /workshopPaletteCount !== 4/);
assert.match(source,
  /service_t90m\|service_usa_desert\|service_leo2a6m\|service_bmp3_rok/);
assert.match(source, /option\('profile-workshop', ''\)/);
assert.match(source, /cpu-profile-attribution-only/);
assert.match(source, /writeFile\(workshopProfilePath,[\s\S]*?flag: 'wx'/,
  'existing profile evidence cannot be overwritten');
assert.match(source, /workshopProfilePath\}\.receipt\.json/);
assert.match(source, /worstGap = \{ startMs: previous, endMs: now, durationMs: now - previous \}/,
  'the callback interval keeps exact endpoints, not just an aggregate maximum');
assert.match(source, /withGarageWorkshopProfile\([\s\S]*?return frames;[\s\S]*?const results = \[\]/,
  'workshop profiling completes before later selection/cycle/screenshot measurements');
assert.match(source, /finally \{\s*await browser\.close\(\)/,
  'ordinary browser ownership survives profiling and work failures');

function profileFixture({ enabled = true, failWork = false, failMethod, failWrite = false, failAfter = false } = {}) {
  const events = [], receipts = [], cleanups = [];
  let endpoint = 0;
  const primary = new Error('workshop wait failed');
  return { events, receipts, cleanups, primary,
    run: () => withGarageWorkshopProfile({
      enabled,
      page: { evaluate: async fn => {
        if (fn !== readGarageWorkshopEndpoint) return 123;
        events.push(`endpoint${++endpoint}`);
        if (failAfter && endpoint === 2) throw new Error('page closed');
        return { atMs: endpoint * 100, buildTimings: [{ chunk: 'fixture', ms: 888 }] };
      } },
      cdp: { send: async method => {
        events.push(method);
        if (method === failMethod) throw new Error(method);
        return { profile: { nodes: [], startTime: 1, endTime: 2 } };
      } },
      onProfile: async (profile, capture) => {
        events.push('write');
        if (failWrite) throw new Error('file exists');
        receipts.push({ profile, capture });
      },
      onCleanupError: error => cleanups.push(error.message),
    }, async () => { events.push('workshop-only'); if (failWork) throw primary; return 'frames'; }),
  };
}
const normal = profileFixture({ enabled: false });
assert.equal(await normal.run(), 'frames');
assert.deepEqual(normal.events, ['workshop-only'], 'default path has no profiling commands or diagnostic reads');
const profiled = profileFixture();
assert.equal(await profiled.run(), 'frames');
assert.deepEqual(profiled.events, ['Profiler.enable', 'Profiler.start', 'endpoint1', 'workshop-only',
  'endpoint2', 'Profiler.stop', 'write', 'Profiler.disable']);
assert.equal(profiled.receipts[0].capture.completedAction, true);
assert.equal(profiled.receipts[0].capture.attributionOnly, true);
assert.equal(profiled.receipts[0].capture.endpoints.before.atMs, 100);
assert.equal(profiled.receipts[0].capture.endpoints.after.atMs, 200);
assert.match(profiled.receipts[0].capture.caveat, /not CPU attribution/);
const failure = profileFixture({ failWork: true });
await assert.rejects(failure.run(), error => error === failure.primary);
assert.equal(failure.receipts[0].capture.completedAction, false);
assert.equal(failure.receipts[0].capture.endpoints.after.atMs, 200);
assert.equal(failure.events.at(-1), 'Profiler.disable');
const closed = profileFixture({ failWork: true, failAfter: true });
await assert.rejects(closed.run(), error => error === closed.primary);
assert.match(closed.receipts[0].capture.endpoints.after.captureError, /page closed/);
const brokenStop = profileFixture({ failWork: true, failMethod: 'Profiler.stop' });
await assert.rejects(brokenStop.run(), error => error === brokenStop.primary);
assert.deepEqual(brokenStop.cleanups, ['Profiler.stop']);
assert.equal(brokenStop.events.at(-1), 'Profiler.disable');
const brokenWrite = profileFixture({ failWrite: true });
await assert.rejects(brokenWrite.run(), /file exists/);
assert.equal(brokenWrite.events.at(-1), 'Profiler.disable');
const brokenStart = profileFixture({ failMethod: 'Profiler.start' });
await assert.rejects(brokenStart.run(), /Profiler.start/);
assert.deepEqual(brokenStart.events, ['Profiler.enable', 'Profiler.start', 'Profiler.disable']);

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
try {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    __GARAGE_WORKSHOP: { stats: () => ({ selected: 'desert_forward_depot', built: false,
      buildTimings: [{ chunk: 'leopard-bay', ms: 888, at: 6597 }],
      workshopTransferTimings: [{ specId: 'leo2a5_a5nl', nodesAt: 6596 }] }) },
    __GL_DIAG: { rescue: 'example', errors: ['retained diagnostic'] },
    __GARAGE_DRESSING_PROBE: { started: 2500, running: true, gaps: [16, 899],
      worstGap: { startMs: 6000, endMs: 6899, durationMs: 899 } },
  } });
  const point = readGarageWorkshopEndpoint();
  assert.equal(point.selected, 'desert_forward_depot');
  assert.equal(point.buildTimings[0].ms, 888, 'retain elapsed receipts without reinterpretation');
  assert.equal(point.workshopTransferTimings[0].nodesAt, 6596);
  assert.deepEqual(point.graphicsDiagnostics.errors, ['retained diagnostic']);
  assert.deepEqual(point.frames.worstGap, { startMs: 6000, endMs: 6899, durationMs: 899 });
} finally {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else delete globalThis.window;
}

console.log('garage-variants-probe.selftest: authentic scene-pack transition matrix covered');
