// galleryShots.selftest.mjs — the owner's whole loading-screen gallery (2026-11-11: "we can also add all 78 to the
// galleries and other image areas"): public/media/gallery-r1, src/ui/galleryShots.ts and the surfaces that show it.
//
// - picks.json `gallery` is the gallery in its order: 26 close-ups, then 52 elevated stills, each once; the loading
//   screens' sixteen are among its close-ups.
// - the collection is exactly the picks (tools/media-r5/loading-media.mjs --section=gallery): per still one 1920x1080 webp
//   of at most 600 KB and its 640x360 rung, each with its bytes and sha256 in the manifest, rendered on a recorded commit,
//   on a battlefield, with its focal (two-digit CSS object-position) and its caption in both languages, the battlefield's
//   name in each from its catalog.
// - galleryShots.ts (site-media-wire.mjs --only=gallery) holds the same rows in the same order, and its openers name a
//   gallery still on each Garage battlefield the gallery shows.
// - no module imports galleryShots.ts statically and no caption is a catalog key: the rows load with the surfaces that
//   show them (the Garage's slideshow, the archive's wall), never with a boot chunk.
// - the archive wall counts them (docs.ts limit, the manual's card) and the loading screens' stills aim where the
//   gallery's do.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GALLERY_OPENERS, GALLERY_SHOTS, galleryShotText } from './galleryShots.ts';
import { LOADING_SHOTS } from './featuredShots.ts';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';
import { MAP_IDS } from '../world/maps/index.ts';
import { runtimeImportSpecifiers } from '../../tools/static-import-closure.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const json = async (path) => JSON.parse(await readFile(join(ROOT, path), 'utf8'));
const picks = await json('tools/media-r5/site-media/picks.json');
const G = picks.gallery;
const ids = [...G.close, ...G.elevated];

// --- the picks -----------------------------------------------------------------------------------------------------
assert.equal(G.collection, 'gallery-r1');
assert.equal(G.close.length, 26, 'the gallery\'s 26 close-ups');
assert.equal(G.elevated.length, 52, 'its 52 elevated stills');
assert.equal(new Set(ids).size, 78, 'each of the 78 once');
for (const id of [...picks.loading.close, ...picks.loading.elevated]) {
  assert.ok(G.close.includes(id), `the loading still ${id} is one of the gallery's close-ups`);
}
assert.deepEqual(Object.keys(G.focal), ids, 'a focal for every still, in the gallery\'s order');
assert.deepEqual(G.rungs, [{ width: 640, quality: 80 }]);

// --- the collection --------------------------------------------------------------------------------------------------
const dir = join(ROOT, 'public/media', G.collection);
const manifest = await json(`public/media/${G.collection}/manifest.json`);
function webpSize(buffer) {
  assert.equal(buffer.subarray(0, 4).toString(), 'RIFF');
  assert.equal(buffer.subarray(8, 12).toString(), 'WEBP');
  const kind = buffer.subarray(12, 16).toString();
  if (kind === 'VP8 ') return [buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') { const bits = buffer.readUInt32LE(21); return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1]; }
  if (kind === 'VP8X') return [buffer.readUIntLE(24, 3) + 1, buffer.readUIntLE(27, 3) + 1];
  throw new Error(`a webp without a size chunk (${kind})`);
}
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.equal(manifest.libraryId, 'claude-of-tanks-gallery-r1');
assert.equal(manifest.count, 78);
assert.deepEqual(manifest.dimensions, { width: 1920, height: 1080 });
assert.deepEqual(manifest.items.map((item) => item.id), ids, 'the collection is the picks, in the gallery\'s order');
assert.deepEqual((await readdir(dir)).sort(),
  ['manifest.json', ...ids.flatMap((id) => [`${id}.webp`, `${id}-640.webp`])].sort(),
  'the collection holds each still at 1920 and 640 and its manifest, nothing else');
const catalogs = {
  en: await json('src/ui/i18nCatalog.en-US.json'),
  zh: await json('src/ui/i18nCatalog.zh-CN.json'),
};
const SEP = { en: ': ', zh: '：' };
const FOCAL_RE = /^([1-9]\d)% ([1-9]\d)%$/;
let fullBytes = 0, rungBytes = 0;
for (const [n, item] of manifest.items.entries()) {
  const { id } = item;
  assert.equal(item.group, n < 26 ? 'close' : 'elevated', `${id}: its section of the gallery`);
  assert.equal(item.path, `/media/${G.collection}/${id}.webp`);
  const file = await readFile(join(dir, `${id}.webp`));
  assert.deepEqual(webpSize(file), [1920, 1080], `${id}: a 1920x1080 webp`);
  assert.ok(file.length > 50_000 && file.length <= 600 * 1024, `${id}: ${file.length} B, between 50 KB and 600 KB`);
  assert.equal(file.length, item.bytes, `${id}: the manifest's bytes`);
  assert.equal(sha256(file), item.sha256, `${id}: the manifest's sha256`);
  assert.ok([90, 86, 82].includes(item.quality), `${id}: q${item.quality}, a step of the encode ladder`);
  fullBytes += file.length;
  assert.equal(item.rungs.length, 1, `${id}: one smaller rung`);
  const [rung] = item.rungs;
  assert.deepEqual([rung.width, rung.height, rung.quality, rung.path], [640, 360, 80, `/media/${G.collection}/${id}-640.webp`]);
  const thumb = await readFile(join(dir, `${id}-640.webp`));
  assert.deepEqual(webpSize(thumb), [640, 360], `${id}: a 640x360 rung`);
  assert.ok(thumb.length < file.length / 4 && thumb.length <= 80 * 1024, `${id}: its rung is ${thumb.length} B`);
  assert.equal(thumb.length, rung.bytes, `${id}: the rung's bytes`);
  assert.equal(sha256(thumb), rung.sha256, `${id}: the rung's sha256`);
  rungBytes += thumb.length;
  assert.match(item.revision, /^[0-9a-f]{40}$/, `${id}: the commit it was rendered on`);
  assert.match(item.source, new RegExp(`^${id}/stills/[\\w.-]+\\.png$`), `${id}: its 4K render`);
  assert.ok(MAP_IDS.includes(item.map), `${id}: ${item.map} is a battlefield`);
  assert.equal(item.focal, G.focal[id], `${id}: its focal is the picks'`);
  assert.match(item.focal, FOCAL_RE, `${id}: a two-digit focal`);
  const [, fx, fy] = item.focal.match(FOCAL_RE);
  assert.ok(+fx >= 10 && +fx <= 90 && +fy >= 20 && +fy <= 80, `${id}: focal ${item.focal} within 10-90 % by 20-80 %`);
  assert.ok(item.tanks.some((tank) => tank.role === 'hero'), `${id}: its hero tank`);
  for (const lang of ['en', 'zh']) {
    const place = catalogs[lang][`map.${item.map}`];
    assert.ok(place && item.title[lang].startsWith(`${place}${SEP[lang]}`), `${id}: its ${lang} caption opens on the catalog's ${place}`);
    assert.ok(item.title[lang].length > place.length + 2, `${id}: its ${lang} caption names the tanks`);
    assert.ok(item.title[lang].includes(item.tanks.find((tank) => tank.role === 'hero').displayName), `${id}: the ${lang} caption names its hero`);
  }
}
assert.ok(fullBytes < 33 * 1024 * 1024 && rungBytes < 3 * 1024 * 1024, `${fullBytes} B of stills and ${rungBytes} B of rungs`);

// --- galleryShots.ts -------------------------------------------------------------------------------------------------
assert.equal(GALLERY_SHOTS.length, 78);
for (const [n, shot] of GALLERY_SHOTS.entries()) {
  const item = manifest.items[n];
  assert.deepEqual(
    { id: shot.id, img: shot.img, thumb: shot.thumb, map: shot.map, group: shot.group, focal: shot.focal, title: shot.title },
    { id: item.id, img: item.path, thumb: item.rungs[0].path, map: item.map, group: item.group, focal: item.focal, title: item.title },
    `${item.id}: galleryShots.ts is its manifest row (site-media-wire.mjs --only=gallery)`);
  for (const lang of ['en', 'zh']) {
    assert.equal(`${catalogs[lang][`map.${shot.map}`]}${SEP[lang]}${shot.who[lang]}`, shot.title[lang], `${shot.id}: its ${lang} tanks`);
  }
  assert.equal(galleryShotText(shot, 'title', 'zh-CN'), shot.title.zh);
  assert.equal(galleryShotText(shot, 'who', 'en-US'), shot.who.en);
}
// one opener per Garage battlefield the gallery shows (Frosthollow, which it lacks, keeps its featured still)
const garageMaps = new Set(GARAGE_VARIANTS.map((variant) => variant.mapId));
const shown = new Set(GALLERY_SHOTS.map((shot) => shot.map));
assert.deepEqual(Object.keys(GALLERY_OPENERS).sort(), [...garageMaps].filter((map) => shown.has(map)).sort(),
  'an opener for each Garage battlefield the gallery shows');
assert.deepEqual(GALLERY_OPENERS, G.openers);
for (const [map, id] of Object.entries(GALLERY_OPENERS)) {
  assert.equal(GALLERY_SHOTS.find((shot) => shot.id === id)?.map, map, `the ${map} Garage opens on a still of ${map}`);
}

// --- off the boot path -----------------------------------------------------------------------------------------------
// galleryShots.ts is imported through import() only, and only where a surface shows it
const sources = [];
const walk = (folder) => {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.(?:ts|mts|mjs|js)$/.test(entry.name) && !entry.name.includes('.selftest.')) sources.push(path);
  }
};
walk(join(ROOT, 'src'));
const lazySites = [];
for (const file of sources) {
  const text = readFileSync(file, 'utf8');
  if (!text.includes('galleryShots')) continue;
  const rel = relative(ROOT, file);
  const statics = runtimeImportSpecifiers(text, rel).filter((spec) => /\/galleryShots(?:\.ts)?$/.test(spec));
  assert.deepEqual(statics, [], `${rel} must import galleryShots.ts through import(), never statically`);
  if (/import\('(?:\.\.\/ui|\.)\/galleryShots\.ts'\)/.test(text)) lazySites.push(rel);
}
assert.deepEqual(lazySites.sort(), ['src/game/garageDressing.ts', 'src/presentation/mediaArchive.ts'],
  'the Garage\'s slideshow and the archive\'s wall load the gallery');
for (const lang of ['en', 'zh']) {
  assert.ok(!Object.keys(catalogs[lang]).some((key) => key.startsWith('media.gallery.')),
    `no gallery caption is a ${lang} catalog key (the game loads its catalog whole at boot)`);
}
assert.ok(existsSync(join(ROOT, 'src/ui/galleryShots.ts')));

// --- the surfaces ----------------------------------------------------------------------------------------------------
const dressing = readFileSync(join(ROOT, 'src/game/garageDressing.ts'), 'utf8');
assert.match(dressing, /createLazyChunk\(\(\) => import\('\.\.\/ui\/galleryShots\.ts'\)\)/, 'the slideshow holds the gallery in the lazy-chunk policy');
assert.match(dressing, /battleScreenOpeners\.get\(mapId\)/, 'a Garage opens on its battlefield\'s gallery opener');
const archive = readFileSync(join(ROOT, 'src/presentation/mediaArchive.ts'), 'utf8');
assert.match(archive, /createLazyChunk\(\(\) => import\('\.\.\/ui\/galleryShots\.ts'\)\)/, 'the archive holds the gallery in the lazy-chunk policy');
assert.match(archive, /options\.gallery \?\? options\.mode === 'wall'/, 'the manual\'s wall shows the gallery');
// the wall's limit and its card count every shot: the battlefield photographs, the gallery and the site fifty's frames
const wall = (await json('public/media/site50-r14/archive.json')).shots.length
  + (await json('public/media/production-r1/manifest.json')).shots.length + 78;
assert.match(readFileSync(join(ROOT, 'src/docs/docs.ts'), 'utf8'), new RegExp(`\\{ mode: 'wall', limit: ${wall}, filters: false, takeTitle \\}`));
assert.match(readFileSync(join(ROOT, 'site/docs.html'), 'utf8'),
  new RegExp(`data-i18n="docs\\.aside\\.archiveTitle" data-i18n-vars='\\{"count":"${wall}"\\}'>${wall} field frames`));
// the loading screens' stills (a portrait phone crops them) aim where the gallery's do
const loadingIds = [...picks.loading.close, ...picks.loading.elevated];
assert.deepEqual(LOADING_SHOTS.map((shot) => shot.focal), loadingIds.map((id) => G.focal[id]), 'the loading stills keep the gallery\'s focal');
console.log(`galleryShots.selftest: 78 stills (${(fullBytes / 1048576).toFixed(1)} MB + ${(rungBytes / 1048576).toFixed(1)} MB of 640 rungs), `
  + `${Object.keys(GALLERY_OPENERS).length} Garage openers, a wall of ${wall}, lazy at ${lazySites.length} sites`);
