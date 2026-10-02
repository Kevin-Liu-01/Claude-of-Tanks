// lazyImportRetry.selftest.mjs — bounded lazy-import retries and removed-chunk detection (INFRA-P11).
import assert from 'node:assert/strict';
import {
  LAZY_IMPORT_RETRY, classifyChunkFailure, failedChunkUrl, importRetryDelayMs,
} from './lazyImportRetry.ts';

// Exponential backoff with a cap, then a stop.
assert.deepEqual([1, 2, 3, 4, 5, 6].map((failures) => importRetryDelayMs(failures)), [2000, 4000, 8000, 16000, null, null],
  'the default policy waits 2, 4, 8 and 16 s, then stops at the fifth consecutive failure');
const policy = { baseMs: 1000, maxMs: 5000, maxFailures: 8 };
assert.deepEqual([1, 2, 3, 4, 5, 7, 8].map((failures) => importRetryDelayMs(failures, policy)), [1000, 2000, 4000, 5000, 5000, 5000, null],
  'delays never exceed maxMs');
assert.throws(() => importRetryDelayMs(0), RangeError);
assert.ok(Object.isFrozen(LAZY_IMPORT_RETRY));
const totalAttempts = (p) => { let attempts = 1; for (let n = 1; importRetryDelayMs(n, p) !== null; n++) attempts++; return attempts; };
assert.equal(totalAttempts(LAZY_IMPORT_RETRY), 5, 'one stale tab costs at most five requests per garage visit (was unbounded)');

// The failed module URL from each engine's message.
const chrome = new TypeError('Failed to fetch dynamically imported module: https://cot.kevinliu.studio/assets/garageDressing-BO96SP48.js');
const firefox = new TypeError('error loading dynamically imported module: https://cot.kevinliu.studio/assets/garageDressing-bo96sp48.js');
const css = new Error('Unable to preload CSS for /assets/mediaArchive-k2j4h5g6.css');
const safari = new TypeError('Importing a module script failed.');
assert.equal(failedChunkUrl(chrome), 'https://cot.kevinliu.studio/assets/garageDressing-BO96SP48.js');
assert.equal(failedChunkUrl(firefox), 'https://cot.kevinliu.studio/assets/garageDressing-bo96sp48.js');
assert.equal(failedChunkUrl(css), '/assets/mediaArchive-k2j4h5g6.css');
assert.equal(failedChunkUrl(safari), null);
assert.equal(failedChunkUrl(new Error('/assets/not-hashed.js')), null, 'only content-hashed chunk names count');
assert.equal(failedChunkUrl('Failed to fetch dynamically imported module: /assets/preload-helper-kw565qv5.js'), '/assets/preload-helper-kw565qv5.js');

// Classification: a 404 means the deployment is gone; anything else may recover.
const calls = [];
const respond = (status) => async (url, init) => { calls.push([url, init.method, init.cache]); return { status }; };
assert.equal(await classifyChunkFailure(chrome, { fetchImpl: respond(404), timing: null }), 'missing');
assert.deepEqual(calls.at(-1), ['https://cot.kevinliu.studio/assets/garageDressing-BO96SP48.js', 'HEAD', 'no-store']);
assert.equal(await classifyChunkFailure(chrome, { fetchImpl: respond(200), timing: null }), 'transient',
  'a chunk that exists again (flaky network) is retried with backoff');
assert.equal(await classifyChunkFailure(chrome, { fetchImpl: respond(503), timing: null }), 'transient');
assert.equal(await classifyChunkFailure(chrome, { fetchImpl: async () => { throw new TypeError('offline'); }, timing: null }), 'transient',
  'an offline probe is not proof of a removed deployment');
const before = calls.length;
assert.equal(await classifyChunkFailure(safari, { fetchImpl: respond(404), timing: null }), 'transient',
  'without a named chunk there is nothing to probe');
assert.equal(await classifyChunkFailure(css, { fetchImpl: respond(404), timing: null, baseUrl: 'https://cot.kevinliu.studio/' }), 'missing');
assert.equal(calls.at(-1)[0], 'https://cot.kevinliu.studio/assets/mediaArchive-k2j4h5g6.css', 'relative chunk paths resolve against the document');
const timing = { getEntriesByName: (name) => (name.endsWith('BO96SP48.js') ? [{ responseStatus: 404 }] : []) };
const probesBefore = calls.length;
assert.equal(await classifyChunkFailure(chrome, { fetchImpl: respond(200), timing }), 'missing',
  'Resource Timing answers without a request where the browser exposes responseStatus');
assert.equal(calls.length, probesBefore, 'no HEAD probe when Resource Timing already proved the 404');
assert.ok(calls.length > before);

console.log('lazyImportRetry.selftest: backoff 2/4/8/16 s then stop; removed hashed chunks classified by 404');
