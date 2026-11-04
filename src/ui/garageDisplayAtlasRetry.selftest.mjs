// 2026-11-02 audit (05-ui-2 #5): the Garage display atlas's load (garageDisplayAtlas.ts). `failed` was terminal for the
// session: one dropped fetch left every display on its dark placeholder until a reload. Now the next display's first
// render asks again. fetch and createImageBitmap are stubbed; nothing is decoded.
import assert from 'node:assert/strict';
import { ensureGarageDisplayAtlas, garageDisplayAtlasTestHooks } from './garageDisplayAtlas.ts';

const hooks = garageDisplayAtlasTestHooks();
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((resolve) => setImmediate(resolve)); };
const fetches = [];
let online = false;
const realFetch = globalThis.fetch;
const realBitmap = globalThis.createImageBitmap;
globalThis.document = {};
globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
globalThis.fetch = async (url) => {
  fetches.push(url);
  if (!online) throw new TypeError('Failed to fetch');
  return { ok: true, blob: async () => ({}) };
};
try {
  hooks.reset();
  ensureGarageDisplayAtlas({ lowTier: true });
  assert.equal(hooks.status(), 'loading');
  ensureGarageDisplayAtlas({ lowTier: true });
  assert.equal(fetches.length, 2, 'one load (albedo and emissive) however many displays ask while it runs');
  await flush();
  assert.equal(hooks.status(), 'failed');
  online = true;
  ensureGarageDisplayAtlas({ lowTier: true });
  assert.equal(fetches.length, 4, 'the next display that asks loads it again');
  await flush();
  assert.equal(hooks.status(), 'ready', 'and the displays get their atlas');
  ensureGarageDisplayAtlas({ lowTier: true });
  assert.equal(fetches.length, 4, 'a ready atlas is never fetched again');
} finally {
  hooks.reset();
  delete globalThis.document;
  globalThis.fetch = realFetch;
  if (realBitmap) globalThis.createImageBitmap = realBitmap; else delete globalThis.createImageBitmap;
}
console.log('garageDisplayAtlasRetry.selftest: a failed atlas load is asked for again by the next display PASS');
