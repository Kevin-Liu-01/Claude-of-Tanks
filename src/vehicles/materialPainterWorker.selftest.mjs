import assert from 'node:assert/strict';
import {
  isMaterialPainterRequest, isMaterialPainterResult, isMaterialPlateFeatures,
} from './materialPainterProtocol.ts';
import {
  canPaintMaterialBaseInWorker, tryPaintMaterialBase, createMaterialPainterClient, disposeMaterialPainterWorker,
} from './materialPainterWorkerClient.ts';
import {
  createMaterialPainterWorkerHandler, loadMaterialPainterFont, paintMaterialBase,
} from './materialPainterWorker.ts';

let cases = 0;
async function test(name, run) { await run(); cases++; console.log(`PASS ${name}`); }
const request = (identity = 'fixture') => ({ identity, seed: 4242, visual: { base: '#536044', scheme: 'nato' },
  dimensions: { albedo: 8, map: 4 }, plateLines: true });
const features = () => ({ hLines: [{ p: .2, weld: true, bolts: false, gaps: [[.2, .3]] }], vLines: [],
  rings: [{ x: .3, y: .4, r: .1, n: 8 }], chips: [{ x: .1, y: .2, r: .01, metal: true }],
  streaks: [{ x: .1, y: .2, len: .3, w: .01 }] });
const result = value => ({ identity: value.identity, dimensions: { ...value.dimensions },
  albedo: new Uint8ClampedArray(value.dimensions.albedo ** 2 * 4),
  normal: new Uint8ClampedArray(value.dimensions.map ** 2 * 4),
  roughness: new Uint8ClampedArray(value.dimensions.map ** 2 * 4), features: features() });
class FakeWorker {
  onmessage = null; onerror = null; onmessageerror = null; messages = []; terminated = 0;
  postMessage(message) { this.messages.push(message); this.onPost?.(message); }
  terminate() { this.terminated++; }
  reply(value = result(this.messages.at(-1).request)) {
    this.onmessage?.({ data: { requestId: this.messages.at(-1).requestId, ok: true, result: value } });
  }
}
function fixture(options = {}, changes = {}) {
  const workers = [], timers = [];
  const ports = {
    fontUrl: 'https://example.test/fonts/actual.woff2', clone: value => structuredClone(value),
    createWorker: () => { const worker = new FakeWorker(); workers.push(worker); return worker; },
    schedule: (callback, delay) => {
      const timer = { callback, delay, cancelled: false }; timers.push(timer);
      return () => { timer.cancelled = true; };
    }, ...changes,
  };
  const client = createMaterialPainterClient(ports, options);
  return { client, workers, timers, fire: delay => {
    const timer = timers.find(item => !item.cancelled && item.delay === delay);
    assert.ok(timer, `scheduled timer ${delay}`); timer.cancelled = true; timer.callback();
  } };
}
function released(worker) {
  assert.equal(worker.terminated, 1); assert.equal(worker.onmessage, null);
  assert.equal(worker.onerror, null); assert.equal(worker.onmessageerror, null);
}

await test('unsupported Node is synchronous capability false, no eager worker', async () => {
  assert.equal(canPaintMaterialBaseInWorker(), false);
  assert.equal(await tryPaintMaterialBase(request()), null);
});
await test('public client malformed base URL chooses fallback without synchronous throw', async () => {
  const names = ['Worker', 'OffscreenCanvas', 'FontFace', 'Path2D', 'DOMMatrix', 'document'];
  const saved = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  try {
    for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true,
      value: name === 'document' ? { baseURI: 'not a valid URL' } : class {} });
    assert.equal(canPaintMaterialBaseInWorker(), true);
    assert.equal(await tryPaintMaterialBase(request()), null);
  } finally {
    disposeMaterialPainterWorker();
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
    }
  }
});
await test('request clone-safe finite dimensions and visual validation', () => {
  assert.ok(isMaterialPainterRequest(request()));
  for (const change of [{ identity: '' }, { seed: NaN }, { dimensions: { albedo: 8, map: Infinity } },
    { dimensions: { albedo: 8192, map: 4 } }, { visual: { base: '#000', camoScale: NaN } }]) {
    assert.equal(isMaterialPainterRequest({ ...request(), ...change }), false);
  }
  const cycle = request(); cycle.visual.self = cycle.visual;
  assert.equal(isMaterialPainterRequest(cycle), false);
});
await test('complete finite bounded feature schema', () => {
  assert.ok(isMaterialPlateFeatures(features()));
  for (const mutate of [f => { f.chips[0].r = NaN; }, f => { f.hLines[0].gaps[0] = [1]; },
    f => { f.streaks[0].len = Infinity; }, f => { f.rings = Array(1025).fill(f.rings[0]); }]) {
    const value = features(); mutate(value); assert.equal(isMaterialPlateFeatures(value), false);
  }
});
await test('reply identity, dimensions, allocation, alias and nested feature validation', () => {
  assert.ok(isMaterialPainterResult(result(request()), request()));
  for (const mutate of [r => { r.identity = 'old'; }, r => { r.dimensions.map = 8; },
    r => { r.albedo = new Uint8ClampedArray(1); }, r => { r.normal = new Uint8Array(64); },
    r => { r.normal = r.roughness; }, r => { r.normal = new Uint8ClampedArray(new ArrayBuffer(128), 64); },
    r => { r.features.chips[0].x = Infinity; }, r => { structuredClone(r.normal, { transfer: [r.normal.buffer] }); }]) {
    const value = result(request()); mutate(value); assert.equal(isMaterialPainterResult(value, request()), false);
  }
});
await test('lazy serial queue and immutable request snapshot', async () => {
  const f = fixture(); assert.equal(f.workers.length, 0);
  const original = request('first'), first = f.client.paint(original), second = f.client.paint(request('second'));
  original.identity = 'mutated'; original.visual.base = '#fff'; original.dimensions.map = 99;
  const worker = f.workers[0]; assert.equal(worker.messages.length, 1);
  assert.equal(worker.messages[0].request.identity, 'first'); assert.equal(worker.messages[0].request.visual.base, '#536044');
  worker.reply(); assert.equal((await first).identity, 'first'); assert.equal(worker.messages.length, 2);
  worker.reply(); assert.equal((await second).identity, 'second');
  f.client.dispose(); released(worker); assert.ok(f.timers.every(timer => timer.cancelled));
});
await test('idle shutdown releases worker and stale callback cannot affect new owner', async () => {
  const f = fixture({ idleMs: 5 }); const first = f.client.paint(request());
  const old = f.workers[0], stale = old.onmessage; old.reply(); await first;
  f.fire(5); released(old);
  const second = f.client.paint(request('new')); const worker = f.workers[1];
  stale({ data: { requestId: 1, ok: false } }); assert.equal(worker.terminated, 0);
  worker.reply(); assert.equal((await second).identity, 'new'); f.client.dispose(); released(worker);
});
await test('bounded queue overflow does not cancel active client', async () => {
  const f = fixture({ maxPending: 1 }); const first = f.client.paint(request());
  assert.equal(await f.client.paint(request('overflow')), null);
  f.workers[0].reply(); assert.ok(await first); f.client.dispose();
});
await test('cancelled idle callback cannot terminate a newly active job', async () => {
  const f = fixture({ idleMs: 5 }); const first = f.client.paint(request());
  const worker = f.workers[0]; worker.reply(); await first;
  const staleIdle = f.timers.find(timer => timer.delay === 5).callback;
  const second = f.client.paint(request('second')); staleIdle();
  assert.equal(worker.terminated, 0); worker.reply(); assert.ok(await second); f.client.dispose();
});
await test('absolute timeout drains active and queued jobs and disables retries', async () => {
  const f = fixture({ timeoutMs: 7 }); const a = f.client.paint(request()), b = f.client.paint(request('queued'));
  f.fire(7); assert.deepEqual(await Promise.all([a, b]), [null, null]); released(f.workers[0]);
  assert.equal(await f.client.paint(request('later')), null); assert.equal(f.workers.length, 1);
  assert.ok(f.timers.every(timer => timer.cancelled));
});
for (const event of ['onerror', 'onmessageerror']) await test(`${event} drains all owners`, async () => {
  const f = fixture(); const a = f.client.paint(request()), b = f.client.paint(request('queued'));
  f.workers[0][event](); assert.deepEqual(await Promise.all([a, b]), [null, null]); released(f.workers[0]);
});
await test('malformed or mismatched reply never publishes partial pixels', async () => {
  for (const data of [{ requestId: 999, ok: true, result: result(request()) }, { requestId: 1, ok: false },
    { requestId: 1, ok: true, result: { ...result(request()), features: null } }]) {
    const f = fixture(); const pending = f.client.paint(request()); f.workers[0].onmessage({ data });
    assert.equal(await pending, null); released(f.workers[0]);
  }
});
await test('construction, cloning, send and timer failures become observed fallback', async () => {
  for (const changes of [{ createWorker: () => { throw Error('construct'); } },
    { createWorker: () => null }, { clone: () => { throw Error('clone'); } },
    { schedule: () => { throw Error('timer'); } },
    { createWorker: () => { const w = new FakeWorker(); w.onPost = () => { throw Error('send'); }; return w; } }]) {
    const f = fixture({}, changes); assert.equal(await f.client.paint(request()), null); f.client.dispose();
  }
});
await test('explicit dispose settles every queued promise exactly once', async () => {
  const f = fixture(); const a = f.client.paint(request()), b = f.client.paint(request('queued'));
  f.client.dispose(); f.client.dispose(); assert.deepEqual(await Promise.all([a, b]), [null, null]);
  released(f.workers[0]); assert.equal(await f.client.paint(request()), null);
});

function fontFixture(mode) {
  const foreign = {}, members = new Set([foreign]); let loaded = 0;
  const font = { status: 'unloaded', load: async () => { loaded++; if (mode === 'load') throw Error('font'); font.status = 'loaded'; return font; } };
  const fonts = { add: f => members.add(f), delete: f => members.delete(f), has: f => members.has(f), check: () => mode !== 'check' };
  Object.defineProperty(fonts, 'ready', { get: () => { throw Error('Never await set lifecycle'); } });
  return { font, members, foreign, loaded: () => loaded, ports: {
    fonts, createFont: () => font, readBytes: async () => new ArrayBuffer(4),
  } };
}
await test('individual font load/check only, successful registration stays worker-owned', async () => {
  const f = fontFixture(); assert.equal(await loadMaterialPainterFont('font', f.ports), true);
  assert.equal(f.loaded(), 1); assert.ok(f.members.has(f.font)); assert.ok(f.members.has(f.foreign));
});
await test('font load/check failure removes only owned registration', async () => {
  for (const mode of ['load', 'check']) {
    const f = fontFixture(mode); assert.equal(await loadMaterialPainterFont('font', f.ports), false);
    assert.deepEqual([...f.members], [f.foreign]);
  }
});
await test('worker posts complete independently-owned transfer buffers', async () => {
  const messages = [], transfers = [];
  const handle = createMaterialPainterWorkerHandler({ initialize: async () => true, paint: result,
    post: (reply, transfer) => { transfers.push(transfer.length); messages.push(structuredClone(reply, { transfer })); } });
  await handle({ requestId: 3, fontUrl: 'font', request: request() });
  assert.deepEqual(transfers, [3]); assert.equal(messages[0].ok, true);
  assert.ok(isMaterialPainterResult(messages[0].result, request()));
});
await test('worker initialization/paint/post failures settle without unhandled rejection', async () => {
  for (const failure of ['init', 'paint', 'post']) {
    const messages = []; let posts = 0;
    const handle = createMaterialPainterWorkerHandler({ initialize: async () => failure !== 'init',
      paint: value => { if (failure === 'paint') throw Error('paint'); return result(value); },
      post: reply => { if (failure === 'post' && posts++ === 0) throw Error('post'); messages.push(reply); } });
    await handle({ requestId: 1, fontUrl: 'font', request: request() });
    assert.deepEqual(messages, [{ requestId: 1, ok: false }]);
  }
});
await test('worker rejects overlap and invalid results without publishing arrays', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; }); const messages = [];
  const handle = createMaterialPainterWorkerHandler({ initialize: () => pending, paint: () => ({ ...result(request()), features: null }),
    post: reply => messages.push(reply) });
  const first = handle({ requestId: 1, fontUrl: 'font', request: request() });
  await handle({ requestId: 2, fontUrl: 'font', request: request() }); release(true); await first;
  assert.deepEqual(messages, [{ requestId: 2, ok: false }, { requestId: 1, ok: false }]);
});
await test('actual painter wrapper disposes partial allocations and raster failures', () => {
  for (const failAt of [2, Infinity]) {
    const owned = []; let calls = 0;
    assert.throws(() => paintMaterialBase(request(), (width, height) => {
      if (++calls === failAt) throw Error('allocate');
      const canvas = { width, height, getContext: () => { throw Error('raster'); } }; owned.push(canvas); return canvas;
    }));
    assert.ok(owned.length > 0); assert.ok(owned.every(canvas => canvas.width === 0 && canvas.height === 0));
  }
});
console.log(`materialPainterWorker selftest: ${cases} cases passed`);
