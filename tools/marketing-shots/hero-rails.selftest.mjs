import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve('public/media/hero-rails-r2');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));

assert.equal(manifest.libraryId, 'claude-of-tanks-hero-rails-r2');
assert.equal(manifest.rails.length, 5, 'the landing film library owns exactly five reviewed rails');
assert.equal(new Set(manifest.rails.map((rail) => rail.map)).size, 5,
  'each rail opens on a distinct battlefield');
assert.equal(manifest.qualityGate.failed, 0);
assert.equal(manifest.gameplay4k.width, 3840);
assert.equal(manifest.gameplay4k.height, 2160);

for (const rail of manifest.rails) {
  assert.equal(rail.durationMs, 6000);
  assert.ok(rail.cameraShots >= 4);
  assert.ok(rail.effects >= 10);
  assert.ok(rail.actors.length >= 2);
  for (const path of [rail.video, rail.poster]) {
    const file = resolve('public', path.replace(/^\//, ''));
    assert.ok(statSync(file).size > 100_000, `${path} is present and substantial`);
  }
}

for (const path of [manifest.gameplay4k.video, manifest.gameplay4k.poster]) {
  const file = resolve('public', path.replace(/^\//, ''));
  assert.ok(statSync(file).size > 250_000, `${path} is present and substantial`);
}

console.log('hero-rails.selftest: five HD rails and the native 4K gameplay film pass');
