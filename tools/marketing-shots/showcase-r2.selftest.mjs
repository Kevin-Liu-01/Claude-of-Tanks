import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const config = JSON.parse(readFileSync(join(HERE, 'showcase-r2.json'), 'utf8'));
const publicDir = join(ROOT, 'public/media/showcase-r2');
const manifestFile = join(publicDir, 'manifest.json');

assert.equal(config.expectedCount, 40, 'R2 must declare exactly 40 frames');
assert.equal(config.shots.length, 40, 'R2 must define exactly 40 frames');
assert.equal(new Set(config.shots.map((shot) => shot.id)).size, 40, 'R2 shot IDs must be unique');
assert.deepEqual(config.shots.map((shot) => shot.sequence), Array.from({ length: 40 }, (_, index) => index + 1));

const expectedKinds = { garage: 10, interface: 6, live: 9, vehicle: 3, battle: 12 };
for (const [kind, count] of Object.entries(expectedKinds)) {
  assert.equal(config.shots.filter((shot) => shot.kind === kind).length, count, `${kind} shot count`);
}

const expectedRoutes = [
  'home', 'garage', 'gallery', 'studio', 'docs',
  'docs/build', 'docs/models', 'docs/simulation', 'docs/vehicles',
  'docs/rendering', 'docs/performance', 'docs/worlds', 'docs/ai',
  'docs/multiplayer', 'docs/audio', 'docs/interface', 'docs/studio',
];
assert.deepEqual(Object.keys(config.pageAssignments).sort(), expectedRoutes.sort(),
  'R2 must explicitly cover every public page');
const ids = new Set(config.shots.map((shot) => shot.id));
for (const [route, routeIds] of Object.entries(config.pageAssignments)) {
  assert.ok(routeIds.length > 0, `${route} must have at least one frame`);
  for (const id of routeIds) assert.ok(ids.has(id), `${route} references unknown frame ${id}`);
}

assert.ok(existsSync(manifestFile), 'published R2 manifest must exist');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
assert.equal(manifest.libraryId, config.collectionId);
assert.equal(manifest.shots.length, 40);
assert.deepEqual(manifest.counts, { ...expectedKinds, total: 40 });
assert.deepEqual(manifest.pageAssignments, config.pageAssignments);
assert.deepEqual(manifest.qualityGate.required, { images: 40, passed: 40, failed: 0 });
for (const shot of manifest.shots) {
  assert.ok(shot.feature && shot.map && shot.alt && shot.title, `${shot.id} archive metadata`);
  assert.ok(shot.quality?.passed, `${shot.id} must pass the image gate`);
  assert.ok(existsSync(join(ROOT, 'public', shot.src)), `${shot.id} public rendition`);
}
assert.equal(manifest.process.contactSheets.length, 4, 'R2 must publish four review sheets');
for (const sheet of manifest.process.contactSheets) {
  assert.equal(sheet.frames.length, 10, `review sheet ${sheet.page} must contain ten frames`);
  assert.ok(existsSync(join(ROOT, 'public', sheet.src)), `review sheet ${sheet.page} file`);
}

const archiveSource = readFileSync(join(ROOT, 'src/presentation/mediaArchive.ts'), 'utf8');
assert.match(archiveSource, /\/media\/showcase-r2\/manifest\.json/,
  'live media archive must read the R2 collection');

const pageText = [
  readFileSync(join(ROOT, 'index.html'), 'utf8'),
  readFileSync(join(ROOT, 'home.html'), 'utf8'),
  readFileSync(join(ROOT, 'docs.html'), 'utf8'),
  readFileSync(join(ROOT, 'src/docs/topics.ts'), 'utf8'),
  readFileSync(join(ROOT, 'src/ui/featuredShots.ts'), 'utf8'),
  readFileSync(join(ROOT, 'README.md'), 'utf8'),
  readFileSync(join(ROOT, 'docs/SHOWCASE-LIBRARY.md'), 'utf8'),
  readFileSync(join(ROOT, 'docs/SCREENSHOT_CONTRACT.md'), 'utf8'),
  readFileSync(join(ROOT, 'docs/GALLERY.md'), 'utf8'),
  readFileSync(join(ROOT, 'docs/HOW-IT-WORKS.md'), 'utf8'),
  readFileSync(join(ROOT, 'docs/INDEX.md'), 'utf8'),
  readFileSync(join(ROOT, 'docs/FEATURES.md'), 'utf8'),
  readFileSync(join(ROOT, 'docs/STUDIO.md'), 'utf8'),
].join('\n');
for (const staleFamily of [
  '/media/presentation-r1/', '/media/showcase-r1/', '/media/featured/',
  '/media/feature-evidence-r2/', '/media/multiplayer-r1/',
]) {
  assert.ok(!pageText.includes(staleFamily), `public pages still reference stale screenshots: ${staleFamily}`);
}
for (const route of expectedRoutes.filter((route) => route.startsWith('docs/'))) {
  const topicId = route.slice('docs/'.length);
  const topicBlock = readFileSync(join(ROOT, 'src/docs/topics.ts'), 'utf8')
    .match(new RegExp(`\\n  ${topicId}: \\{[\\s\\S]*?(?=\\n  \\w+: \\{|\\n};)`))?.[0] || '';
  assert.match(topicBlock, /\/media\/showcase-r2\//, `${route} must use current R2 media`);
}

console.log('showcase-r2 selftest: ok (40 frames, 17 public routes, 4 review sheets)');
