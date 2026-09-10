import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Execute the actual installed listeners without constructing a GPU. Keeping
// the source boundary explicit catches omissions in success, false and catch.
const source = await readFile(new URL('./renderer.ts', import.meta.url), 'utf8');
const listenersSource = source.match(/  let contextRecoveryGeneration = 0;([\s\S]*?)\n\n  const width =/)?.[0];
assert.ok(listenersSource, 'production renderer context listeners remain directly exercised');
const install = new Function('renderer', 'window', 'document', 'showContextLossOverlay',
  listenersSource.slice(0, listenersSource.lastIndexOf('\n\n  const width =')));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(onRestored) {
  const listeners = new Map();
  const notices = [];
  let reloads = 0;
  let removals = 0;
  let prevented = 0;
  let losses = 0;
  const renderer = { domElement: { addEventListener(name, callback) { listeners.set(name, callback); } },
    userData: { contextRecovery: { onLost() { losses += 1; }, onRestored } } };
  install(renderer, { location: { reload() { reloads += 1; } } },
    { getElementById(id) { assert.equal(id, 'cot-ctxlost'); return { remove() { removals += 1; } }; } },
    (recovering) => notices.push(recovering));
  return {
    lost() { listeners.get('webglcontextlost')({ preventDefault() { prevented += 1; } }); },
    restored() { listeners.get('webglcontextrestored')(); },
    renderer, notices,
    get reloads() { return reloads; }, get removals() { return removals; },
    get prevented() { return prevented; }, get losses() { return losses; },
  };
}
async function flush() { for (let i = 0; i < 12; i += 1) await Promise.resolve(); }

for (const oldResult of ['reject', 'false', 'success']) {
  const old = deferred();
  const current = deferred();
  let calls = 0;
  const f = fixture(() => (++calls === 1 ? old.promise : current.promise));
  f.lost(); f.restored(); await flush();
  f.lost(); f.restored(); await flush();
  if (oldResult === 'reject') old.reject(new Error('expired context'));
  else old.resolve(oldResult !== 'false');
  await flush();
  assert.equal(f.reloads, 0, `${oldResult}: obsolete recovery cannot reload a newer device`);
  assert.equal(f.removals, 0, `${oldResult}: obsolete recovery cannot dismiss the newer cover`);
  current.resolve(true);
  await flush();
  assert.equal(f.removals, 1);
  assert.equal(f.reloads, 0);
  assert.equal(f.prevented, 2);
  assert.equal(f.losses, 2);
  assert.deepEqual(f.notices, [true, true]);
}

{
  const old = deferred();
  let calls = 0;
  const f = fixture(() => (++calls === 1 ? old.promise : Promise.resolve(true)));
  f.lost(); f.restored(); await flush();
  f.lost(); f.restored(); await flush();
  assert.equal(f.removals, 1, 'newer successful context may complete before older rejection');
  old.reject(new Error('late obsolete rejection'));
  await flush();
  assert.equal(f.reloads, 0);
  assert.equal(f.removals, 1);
}

for (const onRestored of [undefined, () => false, () => { throw new Error('fresh failure'); },
  () => Promise.reject(new Error('fresh asynchronous failure'))]) {
  const f = fixture(onRestored);
  f.lost(); f.restored(); await flush();
  assert.equal(f.reloads, 1, 'current-generation failures preserve the existing reload fallback');
  assert.equal(f.removals, 0);
}

{
  let calls = 0;
  const f = fixture(() => { calls += 1; return true; });
  f.lost(); f.restored(); f.lost();
  await flush();
  assert.equal(calls, 0, 'already-obsolete queued callbacks cannot invoke an older application recovery');
  assert.equal(f.removals, 0);
  f.restored(); await flush();
  assert.equal(calls, 1);
  assert.equal(f.removals, 1);
}

console.log('rendererContextRecovery.selftest: actual listener generation, out-of-order completion and fallback passed');
