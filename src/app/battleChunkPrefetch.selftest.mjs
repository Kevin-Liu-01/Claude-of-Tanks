// entry-cpu-278: the solo battle's chunks preloaded behind the ready Garage (app/battleChunkPrefetch.ts). Each listed chunk
// gets one low-priority modulepreload through the 'idle' fetch class, at most BATTLE_CHUNK_LANES at a time, after the quiet
// delay; a chunk already linked (Vite's own preload, or the press) is skipped, before and when its class starts it; Save-Data,
// no modulepreload support, no list or a malformed list does nothing.
import assert from 'node:assert/strict';
import {
  BATTLE_CHUNK_DELAY_MS, BATTLE_CHUNK_LANES, BATTLE_CHUNKS_ELEMENT_ID, listedBattleChunks, startBattleChunkPrefetch,
} from './battleChunkPrefetch.ts';

const tick = () => new Promise((done) => setTimeout(done, 0));

function fakeDocument({ list, supports = true, linked = [] }) {
  const head = { children: [], append(node) { this.children.push(node); } };
  const element = (tag) => {
    const node = { tag, rel: '', fetchPriority: '', onload: null, onerror: null, relList: { supports: (rel) => supports && rel === 'modulepreload' } };
    Object.defineProperty(node, 'href', { get() { return node._href; }, set(value) { node._href = new URL(value, 'https://x.test/').href; } });
    return node;
  };
  for (const href of linked) { const link = element('link'); link.href = href; head.children.push(link); }
  return {
    head,
    baseURI: 'https://x.test/',
    createElement: element,
    getElementById: (id) => (id === BATTLE_CHUNKS_ELEMENT_ID && list !== undefined ? { textContent: list } : null),
    getElementsByTagName: (tag) => head.children.filter((node) => node.tag === tag),
  };
}

// listing: JSON array of strings only
assert.deepEqual(listedBattleChunks(fakeDocument({ list: '["/a.js","",3,"/b.js"]' })), ['/a.js', '/b.js']);
assert.deepEqual(listedBattleChunks(fakeDocument({ list: '{oops' })), []);
assert.deepEqual(listedBattleChunks(fakeDocument({})), []);

// the run: delay, idle class, lanes, skips
{
  const doc = fakeDocument({ list: JSON.stringify(['/assets/a.js', '/assets/b.js', '/assets/c.js', '/assets/d.js', '/assets/e.js']), linked: ['/assets/b.js'] });
  let scheduled = null;
  const classes = [];
  const stats = startBattleChunkPrefetch({
    document: doc, saveData: () => false,
    schedule: (run, delayMs) => { assert.equal(delayMs, BATTLE_CHUNK_DELAY_MS); scheduled = run; },
    fetchAs: (cls, start) => { classes.push(cls); return start(); },
  });
  assert.equal(stats.listed, 5);
  assert.equal(doc.head.children.length, 1, 'nothing before the quiet delay');
  scheduled();
  await tick();
  const links = () => doc.head.children.filter((node) => node.rel === 'modulepreload');
  assert.equal(links().length, BATTLE_CHUNK_LANES, 'at most the lanes in flight');
  assert.ok(links().every((link) => link.fetchPriority === 'low'));
  // a chunk the press links meanwhile is skipped when its turn comes
  const pressed = doc.createElement('link'); pressed.href = '/assets/e.js'; doc.head.append(pressed);
  for (let round = 0; round < 6; round++) {
    for (const link of links()) if (!link.settled) { link.settled = true; link.onload(); }
    await tick();
  }
  assert.deepEqual(links().map((link) => new URL(link.href).pathname), ['/assets/a.js', '/assets/c.js', '/assets/d.js']);
  assert.ok(classes.every((cls) => cls === 'idle'));
  assert.deepEqual({ ...stats }, { listed: 5, requested: 3, skipped: 2, landed: 3, failed: 0, done: true });
}

// a chunk linked while its class held it is not linked again
{
  const doc = fakeDocument({ list: JSON.stringify(['/assets/a.js']) });
  let held = null;
  startBattleChunkPrefetch({ document: doc, saveData: () => false, schedule: (run) => run(), fetchAs: (_cls, start) => new Promise((done) => { held = () => done(start()); }) });
  await tick();
  const pressed = doc.createElement('link'); pressed.href = '/assets/a.js'; doc.head.append(pressed);
  held();
  await tick();
  assert.equal(doc.head.children.length, 1, 'only the press\'s link');
}

// nothing with Save-Data, without modulepreload, or without a list
for (const [name, options] of [['save-data', { saveData: () => true }], ['no support', { supports: false }], ['no list', { list: undefined }]]) {
  const doc = fakeDocument({ list: 'list' in options ? options.list : '["/assets/a.js"]', supports: options.supports ?? true });
  let ran = false;
  const stats = startBattleChunkPrefetch({ document: doc, saveData: options.saveData ?? (() => false), schedule: () => { ran = true; } });
  assert.equal(ran, false, name);
  assert.equal(stats.done, true, name);
}

console.log('battleChunkPrefetch selftest: PASS');
