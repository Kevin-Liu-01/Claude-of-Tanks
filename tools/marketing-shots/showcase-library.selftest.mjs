import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'public/media/showcase-r1/manifest.json'), 'utf8'));
const captureRecipes = JSON.parse(readFileSync(join(ROOT, 'public/media/capture-recipes-r1.json'), 'utf8'));

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
assert.equal(captureRecipes.schemaVersion, 1);
for (const shot of manifest.shots.filter((entry) => entry.sourceScene)) {
  const recipeId = captureRecipes.media[shot.src];
  const recipe = captureRecipes.recipes[recipeId];
  assert.ok(recipeId && recipe, `${shot.id} must publish copyable Studio JSON`);
  assert.ok(recipe.map && Number.isFinite(recipe.seed) && Array.isArray(recipe.actors),
    `${shot.id} recipe must satisfy the Studio load contract`);
  assert.equal(recipe.timeScale, 0, `${shot.id} recipe must open frozen`);
  if (Number.isFinite(shot.timeMs)) assert.equal(recipe.fxTime, shot.timeMs);
}
for (const slug of [
  '01_desert_duel_leclerc_kill', '03_winter_lake_duel',
  '04_urban_street_duel', '06_verdant_meadow_duel',
]) {
  const path = `/media/feature-loops-r1/${slug}.webm`;
  const recipe = captureRecipes.recipes[captureRecipes.media[path]];
  assert.ok(recipe?.storyboard?.shots?.length >= 3, `${path} must publish its complete video storyboard`);
  assert.ok(recipe.storyboard.actorTracks.length >= 2, `${path} must publish actor choreography`);
}

assert.deepEqual(manifest.process.sequence, [
  'deterministic scene JSON',
  'review capture',
  'contact-sheet inspection',
  '4K export',
  'automated grade',
  'owner approval',
]);
for (const kind of ['action', 'foreground']) {
  const sheets = manifest.process.contactSheets[kind];
  assert.equal(sheets.length, 3, `${kind} must publish three review sheets`);
  assert.deepEqual(sheets.map((sheet) => sheet.page), [1, 2, 3]);
  assert.equal(sheets.flatMap((sheet) => sheet.frames).length, 30);
  assert.ok(sheets.every((sheet) => sheet.frames.length === 10));
  assert.ok(sheets.every((sheet) => existsSync(join(ROOT, 'public', sheet.src))));
}

console.log('showcase-library selftest passed');
