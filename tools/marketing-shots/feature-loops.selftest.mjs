import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../public/media/feature-loops-r1/', import.meta.url));
const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8'));
const approvedMaps = new Set(['desert', 'winter', 'urban', 'verdant']);

assert.equal(manifest.libraryId, 'claude-of-tanks-feature-loops-r1');
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.qualityGate?.passed, 6);
assert.equal(manifest.qualityGate?.failed, 0);
assert.equal(manifest.loops?.length, 6);

const ids = new Set();
const representedMaps = new Set();

for (const loop of manifest.loops) {
  assert.match(loop.id, /^0[1-6]_[a-z0-9_]+$/);
  assert.equal(ids.has(loop.id), false, `duplicate loop id: ${loop.id}`);
  ids.add(loop.id);
  assert.equal(loop.durationMs, 6000, `${loop.id} duration`);
  assert.equal(approvedMaps.has(loop.map), true, `${loop.id} map`);
  representedMaps.add(loop.map);
  assert.ok(loop.actors.length >= 2, `${loop.id} actor count`);

  for (const [kind, expectedBytes] of [['gif', loop.gifBytes], ['video', loop.videoBytes]]) {
    const publicPath = loop[kind];
    assert.equal(publicPath.startsWith('/media/feature-loops-r1/'), true, `${loop.id} ${kind} path`);
    const file = `${root}/${publicPath.split('/').at(-1)}`;
    assert.equal((await stat(file)).size, expectedBytes, `${loop.id} ${kind} byte receipt`);
  }

  const poster = `${root}/${loop.poster.split('/').at(-1)}`;
  assert.ok((await stat(poster)).size > 100_000, `${loop.id} poster size`);
}

assert.deepEqual([...representedMaps].sort(), [...approvedMaps].sort());
console.log('feature-loops.selftest: PASS');
