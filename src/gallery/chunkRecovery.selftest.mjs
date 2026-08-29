import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const html = await readFile(new URL('../../gallery.html', import.meta.url), 'utf8');
const match = html.match(/<script>\s*(\/\/ GALLERY CHUNK RECOVERY[\s\S]*?)<\/script>/);
assert.ok(match, 'Gallery chunk recovery must remain inline ahead of its module entries');
assert.ok(html.indexOf('// GALLERY CHUNK RECOVERY') < html.indexOf('<script type="module"'),
  'recovery listeners must install before the first module request can fail');

function createHarness({
  href = 'https://game.test/gallery',
  storageBlocked = false,
} = {}) {
  const listeners = new Map();
  const timers = [];
  const storage = new Map();
  const appended = [];
  const fetches = [];
  let replacedUrl = null;
  const document = {
    body: { appendChild(node) { appended.push(node); } },
    createElement: () => ({ style: {} }),
    getElementById: (id) => appended.find((node) => node.id === id) ?? null,
  };
  const context = {
    document,
    location: {
      href,
      replace(url) { replacedUrl = url; },
    },
    sessionStorage: {
      getItem(key) {
        if (storageBlocked) throw new Error('storage blocked');
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        if (storageBlocked) throw new Error('storage blocked');
        storage.set(key, value);
      },
    },
    addEventListener: (type, listener) => listeners.set(type, listener),
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    fetch: (url, init) => {
      fetches.push({ url, init });
      return Promise.resolve({ ok: true });
    },
    URL,
    Date,
  };
  runInNewContext(match[1], context);
  return {
    appended,
    fetches,
    listeners,
    timers,
    get replacedUrl() { return replacedUrl; },
  };
}

const staleModule = createHarness();
staleModule.listeners.get('error')?.({
  target: { tagName: 'SCRIPT', type: 'module' },
  message: '',
});
const recovery = staleModule.timers.find(({ ms }) => ms === 150);
assert.ok(recovery, 'a missing Gallery entry module must schedule document recovery');
recovery.fn();
await new Promise((resolve) => setImmediate(resolve));
assert.match(staleModule.replacedUrl ?? '', /[?&]_galleryretry=1-/,
  'Gallery recovery must leave a bounded retry receipt in the URL');
assert.match(staleModule.fetches[0]?.url ?? '', /\?_dplreset=1$/,
  'Gallery recovery must clear stale pins through the root route supported by older deployments');
assert.equal(staleModule.fetches[0]?.init?.cache, 'no-store',
  'the deployment reset handshake must bypass the browser cache');

const blockedStorageSecondAttempt = createHarness({
  href: 'https://game.test/gallery?_galleryretry=1-first',
  storageBlocked: true,
});
blockedStorageSecondAttempt.listeners.get('unhandledrejection')?.({
  reason: new Error('Failed to fetch dynamically imported module'),
});
const secondRecovery = blockedStorageSecondAttempt.timers.find(({ ms }) => ms === 150);
assert.ok(secondRecovery, 'one second transient module failure may recover automatically');
secondRecovery.fn();
await new Promise((resolve) => setImmediate(resolve));
assert.match(blockedStorageSecondAttempt.replacedUrl ?? '', /[?&]_galleryretry=2-/,
  'URL receipts must bound recovery when sessionStorage is unavailable');

const exhausted = createHarness({
  href: 'https://game.test/gallery?_galleryretry=2-exhausted',
  storageBlocked: true,
});
exhausted.listeners.get('vite:preloadError')?.({});
assert.equal(exhausted.timers.length, 0,
  'an exhausted retry receipt must prevent an automatic reload loop');
assert.equal(exhausted.appended[0]?.id, 'gallery-runtime-retry',
  'an exhausted recovery budget must expose an honest manual retry');

const vercel = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url), 'utf8'));
for (const route of ['/gallery', '/gallery.html']) {
  const rule = vercel.headers?.find(({ source }) => source === route);
  assert.equal(rule?.headers?.find(({ key }) => key.toLowerCase() === 'cache-control')?.value,
    'private, no-store, max-age=0',
    `${route} HTML must not outlive its hashed module graph`);
}

console.log('gallery chunkRecovery.selftest: stale deployment hashes self-heal without clearing cookies');
