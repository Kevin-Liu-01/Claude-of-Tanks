import assert from 'node:assert/strict';
import { createSourcedCompositionClient } from './sourcedTextureCompositionClient.ts';
import { SOURCED_TEXTURE_COMPOSITION_PROTOCOL as protocol } from './sourcedTextureCompositionProtocol.ts';

const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const images = { color: { name: 'color' }, ao: { name: 'ao' }, rough: { name: 'rough' } };
const input = (changes = {}) => ({ key: 'grass', size: 2, options: { roughInAlpha: true }, includeSurface: false, images, ...changes });

function harness(options = {}, yieldPreparation = null) {
  let now = 0;
  const timers = new Set(), workers = [], conversions = [], bitmaps = [];
  const state = { convert: null, create: null, postThrows: false };
  const client = createSourcedCompositionClient({
    ...(yieldPreparation ? { yieldPreparation } : {}),
    schedule(callback, delay) {
      const timer = { callback, at: now + delay }; timers.add(timer);
      return () => timers.delete(timer);
    },
    createBitmap(image) {
      conversions.push(image);
      if (state.convert) return state.convert(image);
      return Promise.resolve(bitmap(image));
    },
    createWorker() {
      if (state.create) return state.create();
      const owned = {
        onmessage: null, onerror: null, onmessageerror: null, posts: [], terminated: 0,
        postMessage(request, transfer) {
          if (state.postThrows) throw new Error('post denied');
          assert.equal(new Set(transfer).size, transfer.length);
          assert.deepEqual(new Set(transfer), new Set(Object.values(request.bitmaps).filter(Boolean)));
          owned.posts.push({ request, transfer });
        },
        terminate() { owned.terminated++; },
        ready() { owned.onmessage?.({ data: { type: 'ready', protocol } }); },
        complete(index = owned.posts.length - 1, overrides = {}) {
          const { request, transfer } = owned.posts[index];
          for (const value of transfer) value.close();
          const result = {
            type: 'complete', protocol, requestId: request.requestId, key: request.key, size: request.size,
            albedo: new Uint8ClampedArray(request.size ** 2 * 4),
            surface: request.includeSurface ? new Uint8ClampedArray(request.size ** 2 * 4) : null,
            closedBitmaps: transfer.length, ...overrides,
          };
          owned.onmessage?.({ data: result });
          return result;
        },
      };
      workers.push(owned); return owned;
    },
  }, { timeoutMs: 100, idleMs: 30, ...options });
  function bitmap(image) {
    const value = { image, width: 2, height: 2, closes: 0, close() { this.closes++; } };
    bitmaps.push(value); return value;
  }
  function advance(ms) {
    now += ms;
    for (const timer of [...timers].sort((a, b) => a.at - b.at)) {
      if (timer.at <= now && timers.delete(timer)) timer.callback();
    }
  }
  return { client, state, workers, conversions, bitmaps, bitmap, timers, advance };
}

// Lazy boot, ready handshake, option snapshots, joins, serial work, and cache
// independence: the service coalesces pending jobs, never retains completed RGBA.
{
  const h = harness();
  assert.equal(h.workers.length, 0);
  const tint = [0.8, 1, 0.5];
  const a = h.client.compose(input({ options: { roughInAlpha: true, tint } }));
  const b = h.client.compose(input({ options: { tint: [...tint], roughInAlpha: true } }));
  tint[0] = 0.1;
  assert.equal(h.workers.length, 1);
  assert.equal(h.conversions.length, 0, 'no native conversions before worker ready');
  h.workers[0].ready(); await flush();
  assert.equal(h.workers[0].posts.length, 1);
  assert.equal(h.conversions.length, 3);
  assert.equal(h.workers[0].posts[0].request.options.tint[0], 0.8);
  const result = h.workers[0].complete();
  assert.equal(await a, result); assert.equal(await b, result);
  const again = h.client.compose(input()); await flush();
  assert.equal(h.workers.length, 1, 'persistent ready worker reused');
  assert.equal(h.workers[0].posts.length, 2, 'completed RGBA is not a second cache');
  h.workers[0].complete(); await again;
  assert.ok(h.bitmaps.every(value => value.closes === 1));
  h.advance(30); assert.equal(h.workers[0].terminated, 1);
  assert.equal(h.client.available(), true);
  const fresh = h.client.compose(input());
  assert.equal(h.workers.length, 2);
  h.workers[1].ready(); await flush(); h.workers[1].complete(); await fresh;
  h.client.dispose(); assert.equal(h.timers.size, 0);
}

// Every pixel/output/source owner participates in pending identity, including
// unused option values. Cached separate surfaces need only the color bitmap.
{
  const h = harness({ maxPending: 20 });
  const variants = [
    input(), input({ key: 'dirt' }), input({ size: 1 }),
    ...[{ roughInAlpha: false }, { roughMul: 1.2 }, { tint: [1, 0.5, 1] }, { desat: 0.1 }, { lift: 0.1 },
      { separateSurface: true }, { roughInAlpha: false, separateSurface: true }]
      .map(options => input({ options: { roughInAlpha: true, ...options } })),
    input({ options: { separateSurface: true }, includeSurface: true }),
    input({ images: { ...images, ao: { name: 'other AO' } } }),
  ];
  const promises = variants.map(value => h.client.compose(value));
  h.workers[0].ready(); await flush();
  assert.equal(h.conversions.length, 3, 'queued work does not allocate bitmaps');
  for (let i = 0; i < variants.length; i++) {
    assert.equal(h.workers[0].posts.length, i + 1);
    h.workers[0].complete(); await flush();
  }
  assert.ok((await Promise.all(promises)).every(Boolean));
  const colorOnly = h.workers[0].posts.find(value => value.request.options.separateSurface
    && !value.request.options.roughInAlpha && !value.request.includeSurface);
  assert.equal(colorOnly.transfer.length, 1);
  h.client.dispose();
}

// One shared consumer abort cannot cancel another; queued/active cancellation
// owns no late publication and preserves the single native conversion slot.
{
  const h = harness(), aborted = new AbortController();
  const first = h.client.compose(input(), aborted.signal);
  const joined = h.client.compose(input());
  aborted.abort(); assert.equal(await first, null);
  h.workers[0].ready(); await flush(); h.workers[0].complete(); assert.ok(await joined);
  const queuedAbort = new AbortController();
  const active = h.client.compose(input());
  const queued = h.client.compose(input({ key: 'queued' }), queuedAbort.signal);
  queuedAbort.abort(); assert.equal(await queued, null);
  await flush(); h.workers[0].complete(); await active;
  assert.equal(h.workers[0].posts.length, 2);
  h.client.dispose();
}
{
  const h = harness(), pending = [], abort = new AbortController();
  h.state.convert = image => { const item = deferred(); pending.push({ ...item, image }); return item.promise; };
  const active = h.client.compose(input(), abort.signal);
  h.workers[0].ready(); await flush();
  abort.abort(); assert.equal(await active, null);
  const next = h.client.compose(input());
  assert.equal(h.conversions.length, 1, 'same-key arrival cannot overtake the one abandoned native conversion');
  assert.equal(pending.length, 1);
  h.state.convert = null;
  for (const value of pending) value.resolve(h.bitmap(value.image));
  await flush();
  assert.equal(h.workers[0].posts.length, 1, 'abandoned first request never transfers');
  assert.equal(h.conversions.length, 4, 'abandoned work skips its remaining images before the next job converts');
  h.workers[0].complete(); assert.ok(await next);
  assert.ok(h.bitmaps.every(value => value.closes === 1)); h.client.dispose();
}

// Native createImageBitmap cannot be cancelled. Deadline/dispose must drain
// callers promptly and close any backing arriving afterwards, without retries.
for (const end of ['deadline', 'dispose']) {
  const h = harness(), pending = [];
  h.state.convert = image => { const item = deferred(); pending.push({ ...item, image }); return item.promise; };
  const a = h.client.compose(input()), b = h.client.compose(input({ key: 'next' }));
  h.workers[0].ready(); await flush();
  assert.equal(pending.length, 1, 'only one native conversion can be in flight');
  if (end === 'deadline') h.advance(100); else h.client.dispose();
  assert.equal(await a, null); assert.equal(await b, null);
  assert.equal(h.workers[0].terminated, 1);
  assert.equal(h.client.available(), false);
  assert.equal(h.timers.size, 0);
  for (const item of pending) item.resolve(h.bitmap(item.image));
  await flush(); assert.ok(h.bitmaps.every(value => value.closes === 1));
  assert.equal(h.conversions.length, 1, 'late completion never starts the remaining images');
  assert.equal(h.workers[0].posts.length, 0);
  assert.equal(await h.client.compose(input()), null);
}

// Each image owns its own native conversion interval, even when a preparation
// port is omitted. Neither the next role nor a queued job can overtake it.
{
  const h = harness(), pending = [];
  h.state.convert = image => { const gate = deferred(); pending.push({ ...gate, image }); return gate.promise; };
  const first = h.client.compose(input());
  const queued = h.client.compose(input({ key: 'queued' }));
  h.workers[0].ready(); await flush();
  for (const [index, image] of [images.color, images.ao, images.rough].entries()) {
    assert.equal(pending.length, index + 1, 'one conversion in flight, not Promise.all siblings');
    assert.equal(pending[index].image, image);
    assert.equal(h.workers[0].posts.length, 0, 'transfer requires every used image');
    pending[index].resolve(h.bitmap(image));
    await flush();
  }
  assert.equal(h.workers[0].posts.length, 1);
  assert.equal(pending.length, 3, 'queued job waits for the active worker reply');
  h.state.convert = null;
  h.workers[0].complete(); assert.ok(await first); await flush();
  assert.equal(h.workers[0].posts.length, 2);
  h.workers[0].complete(); assert.ok(await queued);
  assert.ok(h.bitmaps.every(value => value.closes === 1)); h.client.dispose();
}

// A pending preparation turn already owns the serial slot. Cancellation may
// settle consumers, but cannot start a replacement job through that old turn.
for (const boundary of ['before-first', 'after-first']) {
  for (const end of ['abort', 'dispose', 'deadline']) {
    const turns = [], abort = new AbortController();
    const h = harness({}, () => { const turn = deferred(); turns.push(turn); return turn.promise; });
    const first = h.client.compose(input(), abort.signal);
    h.workers[0].ready(); await flush();
    assert.equal(turns.length, 1); assert.equal(h.conversions.length, 0);
    if (boundary === 'after-first') {
      turns[0].resolve(); await flush();
      assert.equal(turns.length, 2); assert.equal(h.conversions.length, 1);
      assert.equal(h.bitmaps[0].closes, 0);
    }
    const held = turns.at(-1), count = h.conversions.length, turnCount = turns.length;
    let next;
    if (end === 'abort') {
      abort.abort(); assert.equal(await first, null);
      next = h.client.compose(input()); // same-key replacement, not the abandoned job
    } else {
      next = h.client.compose(input({ key: 'queued' }));
      if (end === 'dispose') h.client.dispose(); else h.advance(100);
      assert.equal(await first, null); assert.equal(await next, null);
      assert.equal(h.client.available(), false);
      assert.equal(h.workers[0].terminated, 1); assert.equal(h.timers.size, 0);
    }
    assert.equal(turns.length, turnCount, 'no replacement preparation while the old boundary is held');
    assert.equal(h.conversions.length, count); assert.equal(h.workers[0].posts.length, 0);
    held.resolve(); await flush();
    assert.equal(h.conversions.length, count, 'resuming an abandoned turn never creates another bitmap');
    assert.ok(h.bitmaps.every(value => value.closes === 1));
    if (end === 'abort') {
      assert.equal(turns.length, turnCount + 1, 'same-key replacement receives its own first boundary');
      for (let role = 0; role < 3; role++) {
        turns.at(-1).resolve(); await flush();
        assert.equal(h.conversions.length, count + role + 1);
      }
      assert.equal(h.workers[0].posts.length, 1, 'only the replacement transfers');
      h.workers[0].complete(); assert.ok(await next);
      assert.equal(h.client.available(), true);
    } else {
      assert.equal(turns.length, turnCount, 'disposed/deadline turns cannot reacquire the worker');
      assert.equal(await h.client.compose(input()), null);
    }
    h.client.dispose();
    assert.equal(h.timers.size, 0); assert.ok(h.bitmaps.every(value => value.closes === 1));
  }
}

// Cached separate surfaces consume color only: no preparation turns for null
// AO/rough roles, and no new bitmap work inside the initial ready callback.
{
  const turns = [], h = harness({}, () => { const turn = deferred(); turns.push(turn); return turn.promise; });
  const pending = h.client.compose(input({ options: { separateSurface: true }, includeSurface: false }));
  h.workers[0].ready();
  assert.equal(h.conversions.length, 0); await flush();
  assert.equal(turns.length, 1);
  turns[0].resolve(); await flush();
  assert.deepEqual(h.conversions, [images.color]); assert.equal(turns.length, 1);
  assert.equal(h.workers[0].posts[0].transfer.length, 1);
  h.workers[0].complete(); assert.ok(await pending);
  h.client.dispose(); assert.equal(h.timers.size, 0);
}

// A rejected/throwing preparation port follows the existing fatal scheduling
// failure policy: drain all callers, release partial backing, and do not retry.
for (const failure of ['throw-before-first', 'reject-after-first']) {
  const turns = [];
  const h = harness({}, () => {
    if (failure === 'throw-before-first') throw new Error('preparation unavailable');
    const turn = deferred(); turns.push(turn); return turn.promise;
  });
  const first = h.client.compose(input()), queued = h.client.compose(input({ key: 'queued' }));
  h.workers[0].ready(); await flush();
  if (failure === 'reject-after-first') {
    turns[0].resolve(); await flush();
    assert.equal(h.conversions.length, 1); assert.equal(turns.length, 2);
    turns[1].reject(new Error('paint deadline')); await flush();
  }
  assert.equal(await first, null); assert.equal(await queued, null);
  assert.equal(h.client.available(), false); assert.equal(h.workers[0].terminated, 1);
  assert.equal(h.workers[0].posts.length, 0); assert.equal(h.timers.size, 0);
  assert.equal(h.conversions.length, Number(failure === 'reject-after-first'));
  assert.ok(h.bitmaps.every(value => value.closes === 1));
}

// Partial conversion failure does not leak successful siblings or permanently
// disable the service. A valid job error recreates a worker for the next job,
// because the failed realm may already have closed during bitmap cleanup.
{
  const h = harness();
  h.state.convert = image => image === images.ao ? Promise.reject(new Error('decode denied')) : Promise.resolve(h.bitmap(image));
  const a = h.client.compose(input()); h.workers[0].ready(); await flush();
  assert.equal(await a, null); assert.ok(h.bitmaps.every(value => value.closes === 1));
  h.state.convert = null;
  const b = h.client.compose(input()); await flush();
  const request = h.workers[0].posts[0].request;
  for (const bitmap of h.workers[0].posts[0].transfer) bitmap.close();
  h.workers[0].onmessage({ data: { type: 'error', protocol, requestId: request.requestId, key: request.key, error: 'Canvas denied' } });
  assert.equal(await b, null); assert.equal(h.client.available(), true);
  assert.equal(h.workers[0].terminated, 1);
  const c = h.client.compose(input());
  assert.equal(h.workers.length, 2); h.workers[1].ready(); await flush();
  h.workers[1].complete(); assert.ok(await c);
  h.client.dispose();
}

for (const failure of ['post', 'protocol', 'duplicate-ready', 'worker-error', 'message-error', 'startup-timeout']) {
  const h = harness();
  const a = h.client.compose(input()), b = h.client.compose(input({ key: 'queued' }));
  if (failure === 'startup-timeout') h.advance(100);
  else {
    h.state.postThrows = failure === 'post';
    h.workers[0].ready(); await flush();
    if (failure === 'protocol') h.workers[0].complete(0, { size: 7 });
    if (failure === 'duplicate-ready') h.workers[0].ready();
    if (failure === 'worker-error') h.workers[0].onerror();
    if (failure === 'message-error') h.workers[0].onmessageerror();
  }
  assert.equal(await a, null, failure); assert.equal(await b, null, failure);
  assert.equal(h.client.available(), false); assert.equal(h.workers[0].terminated, 1);
  assert.equal(h.timers.size, 0);
  if (failure === 'post') assert.ok(h.bitmaps.every(value => value.closes === 1));
}
for (const create of [() => null, () => { throw new Error('CSP'); }]) {
  const h = harness(); h.state.create = create;
  assert.equal(await h.client.compose(input()), null);
  assert.equal(h.timers.size, 0); assert.equal(h.conversions.length, 0);
}
{
  const h = harness({ maxPending: 1 });
  const a = h.client.compose(input()), joined = h.client.compose(input());
  assert.equal(await h.client.compose(input({ key: 'overflow' })), null);
  h.workers[0].ready(); await flush(); h.workers[0].complete();
  assert.ok(await a); assert.ok(await joined); h.client.dispose();
}
{
  const h = harness(), abort = new AbortController(); abort.abort();
  assert.equal(await h.client.compose(input(), abort.signal), null);
  assert.equal(h.workers.length, 0); assert.equal(h.timers.size, 0);
  assert.equal(await h.client.compose(input({ images: null })), null);
  h.client.dispose();
}
console.log('sourcedTextureCompositionClient.selftest: serial persistent ownership, full identity, cancellation, deadlines, fallback, and cleanup passed');
