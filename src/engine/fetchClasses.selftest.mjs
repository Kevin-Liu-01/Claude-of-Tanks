// entry-bytes-278: the fetch classes (engine/fetchClasses.ts). With no battle entry open every class starts at once; while
// one is open, decor runs at most DECOR_SLOTS at a time in request order, idle starts only once no decor waits or runs (at most
// IDLE_SLOTS), critical is never held, and closing the window starts everything held. The loading card opens and closes
// the window (ui/battleLoad.ts); the photographs ask for decor (world/sourcedTextures.ts) and the bulk and voice sounds
// for idle, outside the library's own slot (audio/assetLibrary.ts).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  classFetch, DECOR_SLOTS, fetchClassStats, IDLE_SLOTS, openFetchWindow, resetFetchClassesForTest,
} from './fetchClasses.ts';

const tick = () => new Promise((done) => setTimeout(done, 0));
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

// a recorder: each task notes its start and waits for its own release
function harness() {
  const started = [];
  const gates = new Map();
  const task = (name) => () => { started.push(name); const gate = deferred(); gates.set(name, gate); return gate.promise.then(() => name); };
  const finish = async (name) => { gates.get(name).resolve(); await tick(); await tick(); };
  return { started, task, finish };
}

// ---- no window: every class starts at once
{
  resetFetchClassesForTest();
  const { started, task } = harness();
  for (let i = 0; i < 5; i++) void classFetch('decor', task(`d${i}`));
  for (let i = 0; i < 5; i++) void classFetch('idle', task(`i${i}`));
  await tick();
  assert.equal(started.length, 10, 'with no entry open nothing is held');
}

// ---- an open window: decor in slots and in order, idle after decor, critical never held
{
  resetFetchClassesForTest();
  const window = openFetchWindow();
  const { started, task, finish } = harness();
  const results = [];
  for (let i = 0; i < 5; i++) void classFetch('decor', task(`d${i}`)).then((v) => results.push(v));
  for (let i = 0; i < 4; i++) void classFetch('idle', task(`i${i}`));
  void classFetch('critical', task('c0'));
  await tick();
  assert.deepEqual(started, ['d0', 'd1', 'c0'], `decor takes ${DECOR_SLOTS} slots, idle waits behind it, critical goes at once (${started})`);
  await finish('d0');
  assert.deepEqual(started.slice(3), ['d2'], 'a freed decor slot goes to the next decor in request order');
  await finish('d1'); await finish('d2');
  assert.deepEqual(started.slice(4), ['d3', 'd4'], 'decor drains in order');
  await finish('d3');
  assert.ok(!started.some((name) => name.startsWith('i')), 'no idle fetch starts while decor is waiting or running');
  await finish('d4');
  assert.deepEqual(started.slice(6).sort(), ['i0', 'i1', 'i2'].slice(0, IDLE_SLOTS), `idle starts once decor is done, ${IDLE_SLOTS} at a time`);
  assert.equal(fetchClassStats().waiting, 4 - IDLE_SLOTS, 'the rest of idle is held');
  window.close();
  await tick();
  assert.ok(started.includes('i3'), 'closing the window starts everything held');
  assert.deepEqual(results, ['d0', 'd1', 'd2', 'd3', 'd4'], 'each held fetch settles with its own result');
  window.close(); // idempotent
  assert.equal(fetchClassStats().open, false, 'a closed window holds nothing');
}

// ---- a failing held fetch rejects its own caller and frees its slot
{
  resetFetchClassesForTest();
  const window = openFetchWindow();
  const failing = classFetch('decor', () => Promise.reject(new Error('404')));
  const thrown = classFetch('decor', () => { throw new Error('sync'); });
  const after = classFetch('decor', () => Promise.resolve('ok'));
  await assert.rejects(failing, /404/);
  await assert.rejects(thrown, /sync/);
  assert.equal(await after, 'ok', 'the slots a failure held go to the next decor');
  window.close();
}

// ---- the window's owner and the classes' callers are wired as described
{
  const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
  const battleLoad = read('../ui/battleLoad.ts');
  assert.match(battleLoad, /fetchWindow \?\?= openFetchWindow\(\)/, 'the loading card opens the window when it shows');
  assert.match(battleLoad, /fetchWindow\?\.close\(\)/, 'and closes it when it hides');
  assert.match(read('../world/sourcedTextures.ts'), /classFetch\('decor'/, 'the sourced photographs are decor');
  const audio = read('../audio/assetLibrary.ts');
  assert.match(audio, /frontIds\.has\(id\) \? task\(\) : classFetch\('idle', task\)/, 'bulk sounds are idle, the front lane is not held');
  assert.match(audio, /onLink\(id, \(\) => slot\(id,/, 'the hold comes before the library slot');
  assert.match(audio, /onLink\(null, \(\) => voiceSlot\(/, 'the crew voice pack is idle');
}

console.log('fetchClasses.selftest: nothing held with no entry open; decor in slots and order, idle behind decor, critical never held, close starts all, failures free their slot; card, photos and sounds wired passed');
