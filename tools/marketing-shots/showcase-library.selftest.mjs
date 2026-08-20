import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'public/media/showcase-r1/manifest.json'), 'utf8'));

assert.equal(manifest.libraryId, 'claude-of-tanks-showcase-r1');
assert.deepEqual(manifest.counts, {
  ownerPicks: 13,
  action: 30,
  foreground: 30,
  studio: 5,
  interface: 10,
  total: 88,
});
assert.deepEqual(manifest.qualityGate.required, { images: 60, passed: 60, failed: 0 });
assert.equal(manifest.shots.length, 88);
assert.equal(new Set(manifest.shots.map((shot) => shot.id)).size, 88, 'showcase IDs must be unique');
assert.deepEqual(manifest.shots.map((shot) => shot.sequence), Array.from({ length: 88 }, (_, i) => i + 1));
assert.ok(manifest.shots.slice(0, 13).every((shot) => shot.kind === 'owner pick'));
assert.ok(manifest.shots.filter((shot) => ['action', 'foreground'].includes(shot.kind))
  .every((shot) => shot.quality?.passed && shot.quality?.ownerApproved && shot.sourceScene && shot.sourceMaster));
assert.ok(manifest.shots.every((shot) => existsSync(join(ROOT, 'public', shot.src))));
assert.ok(existsSync(join(ROOT, 'public', manifest.animatedPreview.src)));
assert.ok(existsSync(join(ROOT, 'public', manifest.animatedPreview.poster)));

console.log('showcase-library selftest passed');
