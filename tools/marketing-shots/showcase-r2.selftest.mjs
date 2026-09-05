import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const config = JSON.parse(readFileSync(join(HERE, 'showcase-r2.json'), 'utf8'));
const publicDir = join(ROOT, 'public/media/showcase-r2');
const manifestFile = join(publicDir, 'manifest.json');

assert.equal(config.expectedCount, 22, 'R2 must declare exactly 22 UI frames');
assert.equal(config.shots.length, 22, 'R2 must define exactly 22 UI frames');
assert.equal(new Set(config.shots.map((shot) => shot.id)).size, 22, 'R2 shot IDs must be unique');
assert.deepEqual(config.shots.map((shot) => shot.sequence),
  Array.from({ length: 22 }, (_, index) => index + 1));

const expectedKinds = { garage: 10, interface: 6, live: 6, vehicle: 0, battle: 0 };
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

const preserved = config.shots.filter((shot) => shot.preservePublic);
assert.deepEqual(preserved.map((shot) => shot.id), ['18_live_spectator'],
  'the archived spectator evidence is the only retained R2 frame');
const vehicleShots = config.shots.filter((shot) => shot.vehicleId);
assert.ok(new Set(vehicleShots.map((shot) => shot.vehicleId)).size >= 10,
  'refreshed UI must show a broad vehicle mix');
assert.ok(vehicleShots.every((shot) => !/m1|abrams/i.test(`${shot.vehicleId} ${shot.alt}`)),
  'recaptured UI must not fall back to Abrams');

assert.ok(existsSync(manifestFile), 'published R2 manifest must exist');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
assert.equal(manifest.libraryId, config.collectionId);
assert.equal(manifest.shots.length, 22);
assert.deepEqual(manifest.counts, { ...expectedKinds, total: 22 });
assert.deepEqual(manifest.pageAssignments, config.pageAssignments);
assert.deepEqual(manifest.qualityGate.required, { images: 22, passed: 22, failed: 0 });
for (const shot of manifest.shots) {
  assert.ok(shot.feature && shot.map && shot.alt && shot.title, `${shot.id} archive metadata`);
  assert.ok(shot.quality?.passed, `${shot.id} must pass the image gate`);
  assert.ok(existsSync(join(ROOT, 'public', shot.src)), `${shot.id} public rendition`);
}
assert.equal(manifest.process.contactSheets.length, 3, 'R2 must publish three review sheets');
assert.deepEqual(manifest.process.contactSheets.map((sheet) => sheet.frames.length), [10, 10, 2]);
for (const sheet of manifest.process.contactSheets) {
  assert.ok(existsSync(join(ROOT, 'public', sheet.src)), `review sheet ${sheet.page} file`);
}

const archiveSource = readFileSync(join(ROOT, 'src/presentation/mediaArchive.ts'), 'utf8');
assert.match(archiveSource, /\/media\/showcase-r1\/manifest\.json/,
  'live media archive must keep the original action library');

const pageText = [
  'index.html', 'home.html', 'docs.html', 'README.md',
  'src/docs/topics.ts', 'src/ui/featuredShots.ts',
  'docs/SHOWCASE-LIBRARY.md', 'docs/SCREENSHOT_CONTRACT.md',
  'docs/GALLERY.md', 'docs/HOW-IT-WORKS.md', 'docs/INDEX.md',
  'docs/FEATURES.md', 'docs/STUDIO.md',
].map((file) => readFileSync(join(ROOT, file), 'utf8')).join('\n');
for (const restoredFamily of [
  '/media/presentation-r1/', '/media/showcase-r1/', '/media/featured/',
  '/media/feature-evidence-r2/', '/media/multiplayer-r1/',
]) {
  assert.ok(pageText.includes(restoredFamily), `original media family must remain in use: ${restoredFamily}`);
}
assert.ok(pageText.includes('/media/multiplayer-r1/dual-perspective.webp'),
  'the original dual-client multiplayer image must remain in use');
assert.ok(!pageText.includes('/media/showcase-r2/18_live_spectator.webp'),
  'the replaced spectator frame must not remain on public pages');
assert.ok(pageText.includes('/media/showcase-r2/'), 'current UI frames must remain in use');

console.log('showcase-r2 selftest: ok (22 UI frames, restored action and multiplayer libraries)');
