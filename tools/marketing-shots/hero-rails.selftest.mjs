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

const groundRush = manifest.rails.find((rail) => rail.id === '01_desert-ground-rush');
assert.ok(groundRush.minimumLeadSeparationM >= 10,
  'Ground Rush keeps the Challenger 3 clear of the KF51 throughout the rail');

const shellSkimScene = JSON.parse(readFileSync(
  resolve('tools/marketing-shots/scenes-action-r3/89_action_coastal_beach_storm.json'),
  'utf8',
));
const shellSkimReinforcement = shellSkimScene.actors.find((actor) => actor.name === 'reinforcement');
assert.ok(shellSkimReinforcement?.pos?.[0] >= 186,
  'Shell Skim keeps the right-side reinforcement clear of the coastal warehouse');

for (const path of [manifest.gameplay4k.video, manifest.gameplay4k.poster]) {
  const file = resolve('public', path.replace(/^\//, ''));
  assert.ok(statSync(file).size > 250_000, `${path} is present and substantial`);
}

console.log('hero-rails.selftest: five HD rails and the native 4K gameplay film pass');
