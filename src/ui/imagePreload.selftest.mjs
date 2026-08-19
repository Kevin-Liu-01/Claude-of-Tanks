import assert from 'node:assert/strict';

const images = [];
class FakeImage {
  constructor() {
    this.fetchPriority = 'auto';
    this.decodeCalls = 0;
    images.push(this);
  }

  set src(value) {
    this.url = value;
    queueMicrotask(() => {
      if (value.includes('missing')) this.onerror?.();
      else this.onload?.();
    });
  }

  async decode() { this.decodeCalls++; }
}
globalThis.Image = FakeImage;

const { isImagePreloaded, preloadImage, preloadImageWhenIdle } =
  await import('./imagePreload.js');

const first = preloadImage('/shared.webp', { priority: 'low' });
const duplicate = preloadImage('/shared.webp', { priority: 'high' });
assert.equal(first, duplicate, 'concurrent callers share one promise');
assert.equal(images.length, 1, 'concurrent callers create one image request');
assert.equal(images[0].fetchPriority, 'high', 'a visible caller promotes background work');
assert.equal(await first, '/shared.webp');
assert.equal(images[0].decodeCalls, 1, 'the shared request decodes once');
assert.equal(isImagePreloaded('/shared.webp'), true);

assert.equal(await preloadImage('/shared.webp'), '/shared.webp');
assert.equal(images.length, 1, 'completed URLs reuse browser-owned cache state');

assert.equal(await preloadImage('/missing.webp'), null);
assert.equal(await preloadImage('/missing.webp'), null);
assert.equal(images.length, 3, 'failed URLs remain retryable');

let idleWork = null;
globalThis.requestIdleCallback = (fn) => { idleWork = fn; return 7; };
assert.equal(preloadImageWhenIdle('/idle.webp'), 7);
assert.equal(images.length, 3, 'speculative images wait for genuine idle time');
idleWork();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(images.length, 4, 'idle callback starts one low-priority request');
assert.equal(images[3].fetchPriority, 'low');

delete globalThis.Image;
delete globalThis.requestIdleCallback;
console.log('image preload selftest: PASS');
