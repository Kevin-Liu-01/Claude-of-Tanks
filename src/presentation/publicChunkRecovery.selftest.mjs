// publicChunkRecovery.selftest.mjs — a public page left open across a deploy reloads once when an on-demand chunk
// 404s, never loops, and never hides the failure from Vite (perf lane, 2026-10-09).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installPublicChunkRecovery } from './publicChunkRecovery.ts';

function harness({ href = 'https://cot.test/docs/rendering', storageBlocked = false, fetchOk = true, stored = null, owner } = {}) {
  const listeners = new Map();
  const storage = new Map(stored ? [['cot.publicChunkRecovery.v1', JSON.stringify(stored)]] : []);
  const h = { listeners, storage, replaced: [], fetched: [], history: [], pendingFetch: [] };
  const scope = {
    ...(owner ? { __COT_CHUNK_RECOVERY: owner } : {}),
    addEventListener: (type, fn) => { assert.equal(listeners.has(type), false, `one ${type} listener`); listeners.set(type, fn); },
    location: { href, replace: (url) => h.replaced.push(url) },
    history: { replaceState: (_d, _u, url) => { h.history.push(url); scope.location.href = url; } },
    sessionStorage: {
      getItem: (k) => { if (storageBlocked) throw new Error('blocked'); return storage.get(k) ?? null; },
      setItem: (k, v) => { if (storageBlocked) throw new Error('blocked'); storage.set(k, v); },
    },
    fetch: (url, init) => {
      h.fetched.push({ url, init });
      return new Promise((resolve, reject) => h.pendingFetch.push(() => (fetchOk ? resolve({ ok: true }) : reject(new Error('offline')))));
    },
  };
  installPublicChunkRecovery(scope);
  h.scope = scope;
  h.fire = (type, event = {}) => {
    let prevented = false;
    listeners.get(type)?.({ ...event, preventDefault() { prevented = true; } });
    return prevented;
  };
  h.settle = async () => { for (const f of h.pendingFetch.splice(0)) f(); await new Promise((r) => setTimeout(r, 0)); };
  return h;
}

// 1. A lazy chunk 404 after a deploy: one reload, through the root route's deployment-pin reset, with a URL receipt.
{
  const h = harness();
  assert.equal(h.fire('vite:preloadError', { payload: new Error('Failed to fetch dynamically imported module') }), false,
    'the failed import is never marked handled (Vite would resolve it as undefined)');
  assert.equal(h.fetched.length, 1);
  assert.equal(new URL(h.fetched[0].url).pathname, '/');
  assert.equal(new URL(h.fetched[0].url).searchParams.get('_dplreset'), '1', 'the stale __vdpl pin is cleared first');
  assert.equal(h.fetched[0].init.cache, 'no-store');
  await h.settle();
  assert.equal(h.replaced.length, 1, 'exactly one reload');
  const next = new URL(h.replaced[0]);
  assert.equal(next.pathname, '/docs/rendering', 'the reload keeps the page');
  assert.ok(next.searchParams.get('_chunkretry'), 'the reload carries its receipt');
  h.fire('vite:preloadError', {});
  await h.settle();
  assert.equal(h.replaced.length, 1, 'a second failure while navigating does not schedule another reload');
}

// 2. The reload also happens when the pin reset itself fails (offline root, old deployment without middleware).
{
  const h = harness({ fetchOk: false });
  h.fire('vite:preloadError', {});
  await h.settle();
  assert.equal(h.replaced.length, 1);
}

// 3. The reloaded page: the receipt leaves the address bar, and a failure inside 15 minutes does not reload again.
{
  const h = harness({ href: 'https://cot.test/docs?_chunkretry=abc&x=1', stored: { at: Date.now() - 60_000 } });
  assert.equal(h.history.length, 1, 'with working storage the receipt is dropped from the URL');
  assert.equal(new URL(h.history[0]).searchParams.has('_chunkretry'), false);
  assert.equal(new URL(h.history[0]).searchParams.get('x'), '1', 'other parameters stay');
  h.fire('vite:preloadError', {});
  await h.settle();
  assert.deepEqual([h.fetched.length, h.replaced.length], [0, 0], 'no loop: the reload was spent');
}

// 4. An old record (past the window) allows a new recovery: a later deploy is a new incident.
{
  const h = harness({ stored: { at: Date.now() - 16 * 60_000 } });
  h.fire('vite:preloadError', {});
  await h.settle();
  assert.equal(h.replaced.length, 1);
}

// 5. Blocked storage: the URL receipt is the loop guard, so it stays in the address bar.
{
  const first = harness({ storageBlocked: true });
  first.fire('vite:preloadError', {});
  await first.settle();
  assert.equal(first.replaced.length, 1, 'blocked storage still recovers once');
  const second = harness({ href: first.replaced[0], storageBlocked: true });
  assert.equal(second.history.length, 0, 'the receipt stays when storage cannot hold the guard');
  second.fire('vite:preloadError', {});
  await second.settle();
  assert.equal(second.replaced.length, 0, 'and it stops the loop');
}

// 6. A rejected import() outside Vite's helper recovers; an unrelated rejection does not.
{
  const h = harness();
  h.fire('unhandledrejection', { reason: new Error('quota exceeded') });
  h.fire('unhandledrejection', { reason: 'boom' });
  await h.settle();
  assert.equal(h.replaced.length, 0, 'unrelated rejections never reload');
  h.fire('unhandledrejection', { reason: new TypeError('Failed to fetch dynamically imported module: https://cot.test/assets/reference-x.js') });
  await h.settle();
  assert.equal(h.replaced.length, 1);
}

// 7. A document whose inline guard owns recovery keeps it; a second install on one document is a no-op.
{
  const gallery = harness({ owner: 'gallery' });
  assert.equal(gallery.listeners.size, 0, 'the Gallery inline guard stays the only one');
  gallery.fire('vite:preloadError', {});
  await gallery.settle();
  assert.equal(gallery.replaced.length, 0);
  const page = harness();
  assert.equal(page.scope.__COT_CHUNK_RECOVERY, 'public', 'the public guard claims the document');
  installPublicChunkRecovery(page.scope);
  assert.equal(page.listeners.size, 2, 'installing twice adds no listener');
}

// 8. Wiring: publicNav.ts (every public page's shared entry, so no request of its own) installs it; the Gallery, which
// also loads publicNav, claims recovery inline before any module runs; the game document never loads publicNav.
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
assert.match(read('./publicNav.ts'), /^installPublicChunkRecovery\(\);$/m, 'publicNav installs the public chunk recovery');
const galleryHtml = read('../../site/gallery.html');
const marker = galleryHtml.indexOf("globalThis.__COT_CHUNK_RECOVERY = 'gallery';");
assert.ok(marker > 0 && marker < galleryHtml.indexOf('<script type="module"'), 'the Gallery claims recovery before its modules');
assert.match(galleryHtml, /vite:preloadError/, 'the Gallery inline guard is still there');
const gameHtml = read('../../index.html');
assert.match(gameHtml, /vite:preloadError/, 'the game inline guard is still there');
assert.doesNotMatch(gameHtml, /src="\/src\/presentation\/publicNav\.ts"/, 'the game document does not load publicNav');
for (const page of ['../../site/home.html', '../../site/docs.html', '../../site/docs-topic.html', '../../site/docs-rendering.html']) {
  assert.match(read(page), /<script type="module" src="\/src\/presentation\/publicNav\.ts"><\/script>/, `${page} loads publicNav`);
  assert.doesNotMatch(read(page), /vite:preloadError/, `${page} has no inline guard of its own`);
}

console.log('publicChunkRecovery.selftest: one reload per deploy incident, no loop, Vite still sees the failure, installed by publicNav on home, the manual and its topics, the Gallery keeps its own guard');
