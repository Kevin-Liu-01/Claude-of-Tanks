import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CAPABILITY_CACHE_MAX_AGE_MS, CAPABILITY_CACHE_VERSION, capabilityCacheKey, capabilityProbeForced, capabilitySummary,
  clearCachedCapability, confirmBootCapability, haltRefusedRenderer, readCachedCapability, runBootCapabilityGate,
  TERRAIN_TEXTURE_UNITS_REQUIRED, writeCachedCapability,
} from './capabilityGate.ts';

// The cached capability verdict (2026-10-02): a repeat boot of the same browser skips the throwaway WebGL2
// context and the worker probe. A record exists only after the real renderer confirmed a proceeding verdict,
// it is keyed by the gate version, the user agent, the memory class and the texture-unit requirement, it
// expires, and every boot that used it checks it against the real context. Every storage access may throw.

const KEY = 'cot.capability.verdict';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const t = (key, vars = {}) => `${key}${Object.keys(vars).length ? ' ' + JSON.stringify(vars) : ''}`;

function context({ units = 16, size = 16384, vertexUnits = 16, renderer = 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
  colorFloat = true } = {}) {
  return {
    MAX_TEXTURE_IMAGE_UNITS: 0x8872, MAX_TEXTURE_SIZE: 0x0D33, MAX_VERTEX_TEXTURE_IMAGE_UNITS: 0x8B4C, RENDERER: 0x1F01,
    getParameter(name) {
      return { 0x8872: units, 0x0D33: size, 0x8B4C: vertexUnits, 0x1F01: 'WebKit WebGL', 0x9246: renderer }[name] ?? null;
    },
    getExtension(name) {
      if (name === 'EXT_color_buffer_float') return colorFloat ? {} : null;
      if (name === 'WEBGL_debug_renderer_info') return { UNMASKED_RENDERER_WEBGL: 0x9246 };
      if (name === 'WEBGL_lose_context') return { loseContext() {} };
      return null;
    },
  };
}

/** A browser host over one shared store; counts the expensive probes it runs. */
function host(store, { userAgent = UA, deviceMemory = 8, now = 1_000_000, fresh = false, gl = context(), storageThrows = null } = {}) {
  const counts = { canvas: 0, worker: 0 };
  return {
    counts,
    userAgent, deviceMemory, fresh, now: () => now,
    createCanvas: () => { counts.canvas++; return { getContext: () => gl }; },
    probeWorker: () => { counts.worker++; return true; },
    storage: {
      getItem: (key) => { if (storageThrows === 'get' || storageThrows === 'all') throw new Error('SecurityError'); return store.get(key) ?? null; },
      setItem: (key, value) => { if (storageThrows === 'set' || storageThrows === 'all') throw new Error('QuotaExceededError'); store.set(key, value); },
      removeItem: (key) => { if (storageThrows === 'all') throw new Error('SecurityError'); store.delete(key); },
    },
  };
}

function gateOptions(h, extra = {}) {
  const log = { sent: [], halts: [] };
  const screen = { stage: { textContent: '' }, retry: { textContent: '', classList: { add() {} }, onclick: null },
    notice: { textContent: '', classList: { add() {} } } };
  return { log, screen, options: { translate: t, send: (event) => log.sent.push(event), screen, host: h,
    halt: (code, message) => log.halts.push([code, message]), reload: () => {}, ...extra } };
}

async function boot(store, hostOptions = {}, realContext = context()) {
  const h = host(store, hostOptions);
  const { options, log } = gateOptions(h);
  const result = await runBootCapabilityGate(options);
  const source = result.source;
  await result.confirm(realContext);
  return { h, log, result, source };
}

const neverSettles = async (promise) => {
  let settled = false;
  promise.then(() => { settled = true; }, () => { settled = true; });
  await new Promise((resolve) => setTimeout(resolve, 20));
  return !settled;
};

// first boot probes and records only once the real context confirms it; the repeat boot skips both probes
{
  const store = new Map();
  const h = host(store);
  const { options } = gateOptions(h);
  const first = await runBootCapabilityGate(options);
  assert.equal(first.source, 'probe');
  assert.deepEqual(h.counts, { canvas: 1, worker: 1 }, 'the first boot runs the throwaway context and the worker probe');
  assert.equal(store.has(KEY), false, 'nothing is recorded before the real renderer confirms the verdict');
  await first.confirm(context());
  const record = JSON.parse(store.get(KEY));
  assert.deepEqual(Object.keys(record).sort(), ['key', 'probe', 'savedAt', 'v']);
  assert.equal(record.v, CAPABILITY_CACHE_VERSION);
  assert.equal(record.key, capabilityCacheKey(h));
  assert.equal('storage' in record.probe || 'memoryClass' in record.probe, false, 'storage and memory are read fresh, never cached');

  const repeat = await boot(store, { now: 2_000_000 });
  assert.equal(repeat.source, 'cache');
  assert.deepEqual(repeat.h.counts, { canvas: 0, worker: 0 }, 'a repeat boot creates no throwaway context and starts no worker');
  assert.deepEqual(repeat.result.probe, first.probe, 'the cached verdict stands for the same probe');
  assert.deepEqual(repeat.result.verdict, first.verdict);
  assert.deepEqual(capabilitySummary(repeat.result.probe, { tier: 'desktop' }), capabilitySummary(first.probe, { tier: 'desktop' }),
    'the session beacon carries the same capability summary');
  assert.equal(JSON.parse(store.get(KEY)).savedAt, record.savedAt, 'a confirmed cache hit keeps the age of the last real probe');

  // the cached path still reads storage and memory now
  const quota = await boot(store, { storageThrows: 'set' });
  assert.equal(quota.source, 'cache', 'a readable record is used even when writes fail');
  assert.equal(quota.result.probe.storage, false, 'blocked writes are probed on every boot');
  assert.deepEqual(quota.result.verdict.notices.map(({ code }) => code), ['storage_blocked']);
  const lowMemory = await runBootCapabilityGate(gateOptions(host(store, { deviceMemory: 2 })).options);
  assert.equal(lowMemory.source, 'probe', 'another memory class is another key');
  assert.equal(lowMemory.probe.memoryClass, 'low');
}

// a wrong, old, foreign or corrupt record is ignored (and removed); stops are never cached
{
  const base = new Map();
  await boot(base);
  const good = JSON.parse(base.get(KEY));
  const variants = {
    corrupt: '{"v":1,',
    'not an object': 'null',
    version: JSON.stringify({ ...good, v: CAPABILITY_CACHE_VERSION + 1 }),
    'other browser': JSON.stringify({ ...good, key: capabilityCacheKey({ userAgent: `${UA} Edg/141.0.0.0`, deviceMemory: 8 }) }),
    expired: JSON.stringify({ ...good, savedAt: 1_000_000 - CAPABILITY_CACHE_MAX_AGE_MS }),
    'from the future': JSON.stringify({ ...good, savedAt: 1_000_000 + 1 }),
    'too few units': JSON.stringify({ ...good, probe: { ...good.probe, maxTextureUnits: TERRAIN_TEXTURE_UNITS_REQUIRED - 1 } }),
    'missing field': JSON.stringify({ ...good, probe: { ...good.probe, worker: undefined } }),
    'wrong type': JSON.stringify({ ...good, probe: { ...good.probe, maxTextureSize: '16384' } }),
    fractional: JSON.stringify({ ...good, probe: { ...good.probe, maxTextureUnits: 16.5 } }),
  };
  for (const [name, raw] of Object.entries(variants)) {
    const store = new Map([[KEY, raw]]);
    const h = host(store);
    const result = await runBootCapabilityGate(gateOptions(h).options);
    assert.equal(result.source, 'probe', `${name}: the gate probes`);
    assert.equal(h.counts.canvas, 1, `${name}: the throwaway context runs`);
    assert.equal(store.has(KEY), false, `${name}: the unusable record is removed`);
  }
  assert.equal(readCachedCapability(host(new Map(base)), TERRAIN_TEXTURE_UNITS_REQUIRED + 1), null,
    'a raised texture-unit requirement is another key');
  assert.notEqual(readCachedCapability(host(new Map(base))), null, 'the unchanged record still reads');
  assert.equal(readCachedCapability(host(new Map(base), { now: 1_000_000 + CAPABILITY_CACHE_MAX_AGE_MS - 1 })) !== null, true,
    'a record just inside its lifetime reads');
  assert.equal(readCachedCapability({ ...host(new Map(base)), userAgent: '' }), null, 'no user agent, no cache');

  const store = new Map();
  const noWebgl = host(store, { gl: null });
  const { options, log } = gateOptions(noWebgl);
  assert.equal(await neverSettles(runBootCapabilityGate(options)), true, 'a stop never resolves');
  assert.equal(log.halts[0][0], 'no_webgl2');
  assert.equal(store.size, 0, 'a hard stop is never cached: the next boot probes again');
  assert.equal(writeCachedCapability(noWebgl, { webgl2: false }), false);
}

// ?gate=fresh forces the probe and clears the record
{
  for (const [search, forced] of [['?gate=fresh', true], ['?tank=k2&gate=FRESH', true], ['?gate=0', false], ['?gate', false], ['', false]]) {
    assert.equal(capabilityProbeForced(search), forced, search || '(empty)');
  }
  const store = new Map();
  await boot(store);
  const h = host(store, { fresh: true });
  const result = await runBootCapabilityGate(gateOptions(h).options);
  assert.equal(result.source, 'probe');
  assert.equal(h.counts.canvas, 1);
  assert.equal(store.has(KEY), false, 'the forced run clears the record before probing');
  await result.confirm(context());
  assert.equal(store.has(KEY), true, 'and records the fresh verdict once confirmed');
}

// every storage access may throw: the gate probes and the boot proceeds
{
  for (const mode of ['get', 'set', 'all']) {
    const store = new Map();
    if (mode === 'get') await boot(store);
    const { h, result } = await boot(store, { storageThrows: mode });
    assert.equal(result.verdict.kind, 'proceed', `${mode}: a refusing store never stops the boot`);
    assert.equal(h.counts.canvas, 1, `${mode}: unreadable or unwritable storage means a probe`);
  }
  assert.doesNotThrow(() => clearCachedCapability({ removeItem() { throw new Error('SecurityError'); } }));
  assert.doesNotThrow(() => clearCachedCapability(null));
}

// a cached verdict the real context contradicts is dropped and the gate runs on the real context
{
  const store = new Map();
  await boot(store);
  const swapped = host(store);
  const { options, log } = gateOptions(swapped);
  const result = await runBootCapabilityGate(options);
  assert.equal(result.source, 'cache');
  const egpu = context({ renderer: 'ANGLE (AMD, AMD Radeon Pro 5500M OpenGL Engine, OpenGL 4.1)', size: 8192 });
  const next = await result.confirm(egpu);
  assert.equal(next.source, 'context', 'a different GPU behind the same browser re-reads the real context');
  assert.equal(result.probe.rendererFamily, 'amd', 'the boot continues with the real context\'s values');
  assert.equal(result.probe.maxTextureSize, 8192);
  assert.equal(JSON.parse(store.get(KEY)).probe.renderer, 'ANGLE (AMD, AMD Radeon Pro 5500M OpenGL Engine, OpenGL 4.1)',
    'the record now names the real renderer');
  assert.deepEqual(log.halts, []);

  const softwareStore = new Map();
  await boot(softwareStore);
  const software = host(softwareStore);
  const softwareGate = gateOptions(software);
  const cachedSoftware = await runBootCapabilityGate(softwareGate.options);
  assert.equal(cachedSoftware.source, 'cache');
  const proceed = await cachedSoftware.confirm(context({ renderer: 'Google SwiftShader' }));
  assert.deepEqual(proceed.verdict.notices.map(({ code }) => code), ['software_rendering'],
    'hardware acceleration switched off behind a cached verdict still earns the software notice');
  assert.equal(softwareGate.screen.notice.textContent, 'boot.gate.software');

  const weak = host(store);
  const weakGate = gateOptions(weak);
  const cachedWeak = await runBootCapabilityGate(weakGate.options);
  assert.equal(await neverSettles(cachedWeak.confirm(context({ units: 8, renderer: 'Mali-T720' }))), true,
    'a real context below the requirement stops the boot like the gate would');
  assert.equal(weakGate.log.halts[0][0], 'texture_units');
  assert.equal(weakGate.log.sent[0].outcome, 'halted');
  assert.equal(weakGate.log.sent[0].capability.maxTextureUnits, 8);
  assert.equal(store.has(KEY), false, 'the contradicted record is gone');

  const unreadable = await runBootCapabilityGate(gateOptions(host(store)).options);
  assert.equal(unreadable.source, 'probe');
  await confirmBootCapability(unreadable, null, gateOptions(host(store)).options);
  assert.equal(store.has(KEY), false, 'an unreadable real context records nothing');
}

// a real renderer that throws after a cached verdict drops it
{
  const store = new Map();
  await boot(store);
  const halts = [];
  const halted = haltRefusedRenderer({ translate: t, screen: gateOptions(host(store)).screen, halt: (code) => halts.push(code),
    reload: () => {}, storage: host(store).storage });
  assert.equal(await neverSettles(halted), true);
  assert.deepEqual(halts, ['context_refused']);
  assert.equal(store.has(KEY), false, 'the next boot probes and names the precise reason');
}

// main.ts confirms on the real context right after constructing it, before the device self-test uses it
{
  const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
  const created = mainSource.indexOf('createRenderer(container)');
  const confirmed = mainSource.indexOf('await bootCapability.confirm(renderer.getContext());');
  const diag = mainSource.indexOf('runDeviceDiag(renderer)');
  assert.ok(created > 0 && confirmed > created && diag > confirmed, 'gate -> real renderer -> confirm -> device diagnostics');
}

console.log('capabilityGateCache.selftest: probe then confirm records, repeat boot skips both probes, wrong/old/corrupt records '
  + 'and throwing storage probe again, ?gate=fresh, real-context mismatch re-runs the gate, stops are never cached');
