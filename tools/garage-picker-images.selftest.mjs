// garage-env-276: qa:garage's picker-thumbnail wait (garage-picker-images.mjs).
// 1. lazy thumbnails past the fold load once asked for eagerly, and the wait settles;
// 2. control: the old wait (every image's load or error, no eager ask, no timeout) never settles on the same thumbnails;
// 3. negative control: a thumbnail that never loads fails at the timeout, named, instead of hanging;
// 4. settled thumbnails need no wait; an error settles one too;
// 5. qa:garage runs the wait in the page with its 15 s timeout, and the old unbounded wait is gone.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { awaitPickerImages } from './garage-picker-images.mjs';

/** A picker thumbnail: a lazy one past the fold starts loading only when made eager; `never` never settles. */
class FakeThumb {
  constructor(src, { lazy = false, complete = false, never = false, fails = false } = {}) {
    this.src = src; this.currentSrc = ''; this.complete = complete; this.never = never; this.fails = fails;
    this.listeners = { load: [], error: [] }; this._loading = lazy ? 'lazy' : 'eager';
    if (!lazy && !complete) this.start();
  }
  get loading() { return this._loading; }
  set loading(value) { const was = this._loading; this._loading = value; if (was === 'lazy' && value === 'eager') this.start(); }
  start() {
    if (this.never || this.started) return;
    this.started = true;
    setTimeout(() => { this.complete = true; this.currentSrc = this.src; for (const fn of this.listeners[this.fails ? 'error' : 'load']) fn(); }, 5);
  }
  addEventListener(type, fn) { this.listeners[type].push(fn); }
}

const settles = (promise, ms) => Promise.race([promise.then(() => true, () => true), new Promise((r) => setTimeout(() => r(false), ms))]);

// 1. the fix: lazy thumbnails past the fold load once made eager
const shelf = () => [new FakeThumb('/media/verdant.webp'), new FakeThumb('/media/sirocco.webp', { lazy: true }),
  new FakeThumb('/media/glacier.webp', { lazy: true }), new FakeThumb('/media/redrock.webp', { complete: true })];
const settled = await awaitPickerImages(shelf(), { timeoutMs: 500 });
assert.deepEqual(settled, { images: 4, waitedOn: 3 }, 'the lazy thumbnails are asked for and settle');

// 2. control: the old step's wait never settles on lazy thumbnails past the fold
const oldWait = (images) => Promise.all(images.map((image) => image.complete ? Promise.resolve()
  : new Promise((resolve) => { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true }); })));
assert.equal(await settles(oldWait(shelf()), 200), false, 'the old wait hangs on the same shelf (the 180 s protocol timeout)');

// 3. negative control: a thumbnail that never loads fails at the timeout, by name
const started = Date.now();
await assert.rejects(awaitPickerImages([new FakeThumb('/media/ok.webp'), new FakeThumb('/media/stuck.webp', { lazy: true, never: true })],
  { timeoutMs: 60 }), /picker thumbnails never settled in 60 ms: 1 of 2 \(\/media\/stuck\.webp\)/);
assert.ok(Date.now() - started < 1000, 'and fails at its own timeout, not the protocol\'s');

// 4. nothing to wait on; an error settles a thumbnail too
assert.deepEqual(await awaitPickerImages([new FakeThumb('/a.webp', { complete: true })]), { images: 1, waitedOn: 0 });
assert.deepEqual(await awaitPickerImages([new FakeThumb('/gone.webp', { lazy: true, fails: true })], { timeoutMs: 500 }), { images: 1, waitedOn: 1 });

// 5. qa:garage runs it, bounded; the old wait is gone
const probe = await readFile(new URL('./garage-variants-probe.mjs', import.meta.url), 'utf8');
assert.match(probe, /\(\$\{awaitPickerImages\.toString\(\)\}\)\(document\.querySelectorAll\(/, 'qa:garage evaluates the wait in the page');
assert.match(probe, /timeoutMs: 15000/, 'with its own 15 s timeout');
assert.doesNotMatch(probe, /image\.addEventListener\('load', resolve/, 'the unbounded wait is gone');

console.log('garage-picker-images.selftest: lazy thumbnails asked for and settled; the old wait hangs on them (control); '
  + 'a stuck thumbnail fails at 60 ms by name (negative control); qa:garage runs the bounded wait PASS');
