import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_COPYRIGHT, PROJECT_CREATOR } from '../../src/authorship.ts';
import { resolveTankId } from '../../src/vehicles/tankIdAliases.ts';

// The versus stills (owner 2026-10-15: "these will be our opengraph foundations and for marketing"). Each still that
// ships (tools/media-r5/versus/picks.json) keeps its scene in tools/media-r5/versus/scenes, and its tanks are vehicles
// of this build. Once the collection is in the tree, public/media/versus-r1 is exactly the picks, in order: one
// 1920x1080 webp each, at most 600 KB, made by tools/media-r5/versus/versus-media.mjs from its 1440p master, and
// manifest.json pinning every file's bytes and sha256, its scene, its tanks by id at the manifest's tank-id schema,
// and titles written from the game's names, never an id. No PNG or GIF ships there. Every count comes from the picks
// and the manifest.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const VERSUS = join(ROOT, 'tools/media-r5/versus');
const PICKS = JSON.parse(readFileSync(join(VERSUS, 'picks.json'), 'utf8'));
const DIR = join(ROOT, 'public/media', PICKS.collection);
const TANKS = JSON.parse(readFileSync(join(ROOT, 'public/icons/tank-assets.json'), 'utf8')).tanks;
const MAX_BYTES = 600 * 1024;
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
function webpSize(buffer) {
  assert.equal(buffer.subarray(0, 4).toString(), 'RIFF');
  assert.equal(buffer.subarray(8, 12).toString(), 'WEBP');
  const kind = buffer.subarray(12, 16).toString();
  if (kind === 'VP8 ') return [buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') { const bits = buffer.readUInt32LE(21); return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1]; }
  if (kind === 'VP8X') return [buffer.readUIntLE(24, 3) + 1, buffer.readUIntLE(27, 3) + 1];
  throw new Error(`unknown WebP chunk ${kind}`);
}
const sceneOf = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
/** A scene's tanks in this build's ids (an unstamped scene is schema 1). */
const sceneTanks = (scene) => scene.actors.map((a) => resolveTankId(a.id, scene.tankIdSchema));

// 1. The picks: each has its scene kept, and every tank in it is a vehicle of this build.
assert.ok(PICKS.ship.length > 0, 'picks.json names the stills that ship');
assert.equal(new Set(PICKS.ship).size, PICKS.ship.length, 'no still is picked twice');
for (const id of PICKS.ship) {
  const rel = `tools/media-r5/versus/scenes/${id}.json`;
  assert.ok(existsSync(join(ROOT, rel)), `${id}: its scene is kept (${rel})`);
  const scene = sceneOf(rel);
  assert.ok(scene.actors.some((a) => a.name === 'hero') && scene.actors.some((a) => /^foe\d*$/.test(a.name)), `${id}: a hero and a foe`);
  for (const [i, id2] of sceneTanks(scene).entries()) {
    assert.ok(TANKS[id2]?.label?.displayName, `${id}: ${scene.actors[i].name} ${scene.actors[i].id} is a vehicle of this build`);
  }
}
if (!existsSync(join(DIR, 'manifest.json'))) {
  console.log(`versus-media.selftest: ${PICKS.ship.length} picks with their scenes; the collection is not in this tree`);
  process.exit(0);
}

// 2. The collection.
const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'));
assert.equal(manifest.libraryId, PICKS.libraryId);
assert.equal(manifest.author, PROJECT_CREATOR, 'the collection names its author');
assert.equal(manifest.copyright, PROJECT_COPYRIGHT);
assert.ok(Number.isInteger(manifest.tankIdSchema) && manifest.tankIdSchema >= 1, 'the manifest stamps its tank-id schema');
assert.equal(manifest.count, manifest.items.length, 'the manifest count is its items');
assert.deepEqual(manifest.items.map((i) => i.id), PICKS.ship, 'the collection is the picks, in order');
const named = new Set(['manifest.json']);
let total = 0;
for (const item of manifest.items) {
  assert.equal(item.path, `/media/${PICKS.collection}/${item.id}.webp`, `${item.id}: its path`);
  const bytes = readFileSync(join(ROOT, 'public', item.path));
  assert.equal(bytes.length, item.bytes, `${item.id}: bytes as pinned`);
  assert.equal(sha256(bytes), item.sha256, `${item.id}: sha256 as pinned`);
  assert.ok(bytes.length <= MAX_BYTES, `${item.id}: ${bytes.length} B, at most ${MAX_BYTES}`);
  assert.deepEqual(webpSize(bytes), [1920, 1080], `${item.id}: 1920x1080`);
  assert.deepEqual([item.width, item.height], [1920, 1080], `${item.id}: its dimensions as recorded`);
  // its scene is the kept one, on the map and hour it names, with the same tanks
  assert.equal(item.scene, `tools/media-r5/versus/scenes/${item.id}.json`, `${item.id}: its scene`);
  const scene = sceneOf(item.scene);
  assert.equal(item.map, scene.map, `${item.id}: the scene's map`);
  assert.equal(item.hour, scene.timeOfDay, `${item.id}: the scene's hour`);
  assert.deepEqual(item.tanks.map((t) => resolveTankId(t.id, manifest.tankIdSchema)), sceneTanks(scene), `${item.id}: the scene's tanks`);
  for (const t of item.tanks) {
    assert.ok(TANKS[resolveTankId(t.id, manifest.tankIdSchema)], `${item.id}: ${t.id} is a vehicle of this build`);
    assert.ok(t.displayName && t.role, `${item.id}: ${t.id} has its name and role`);
  }
  // the titles name the tanks as the game does, never by an id
  const ids = new Set([...item.tanks.map((t) => t.id), ...scene.actors.map((a) => a.id)]);
  for (const lang of ['en', 'zh']) {
    const title = item.title?.[lang];
    assert.ok(typeof title === 'string' && title.length > 0, `${item.id}: a ${lang} title`);
    for (const id of ids) assert.doesNotMatch(title, new RegExp(`(?<![A-Za-z0-9_])${id}(?![A-Za-z0-9_])`), `${item.id}: the ${lang} title names ${id} by its id`);
  }
  named.add(basename(item.path));
  total += bytes.length;
}
const files = readdirSync(DIR);
assert.deepEqual(files.filter((f) => /\.(?:png|gif)$/i.test(f)), [], 'no PNG or GIF in the versus collection');
assert.deepEqual(files.filter((f) => !named.has(f)), [], 'every file in the versus collection belongs to an item');
console.log(`versus-media.selftest: ${manifest.items.length} stills, ${(total / 1048576).toFixed(2)} MB (1920x1080 webp, each at most 600 KB)`);
