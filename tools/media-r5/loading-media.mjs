#!/usr/bin/env node
// The loading-screen collection, public/media/loading-r1 (owner 2026-11-04: "for loading screens we need to use these
// elevated scenes"; 2026-11-11, on the gallery's full rotation sheet: "only need 1-16 for the loading screen").
// tools/media-r5/site-media/picks.json `loading` names the stills in the gallery's order, its close-ups and then any
// elevated stills. Each ships as one
// 1920x1080 webp of at most 600 KB, encoded at q90 (a busy scene steps down to q86, then q82) from its 4K render,
// <masters>/<id>/stills/<one>.png, through the master filter (master-filter.mjs); the render's cinema-receipt.json holds
// its scene. manifest.json records, per still, its map and hour, its caption in English and Chinese (the battlefield's catalog name, then the hero and the tank its scene pairs
// it with: "A v B" for a foe, "A and B" for an ally, "A pair" for two of one vehicle, the hero alone for a solo; names
// are public/icons/tank-assets/ rows' label.displayName at this tree's tank-id schema, never an id), its tanks, the
// render's revision and source file, and the webp's bytes and sha256. Nothing is written unless every pick has its
// render. Files in the folder that no pick names are removed. site-media-wire.mjs (--only=loading) wires the rotation
// and the captions; src/ui/loadingScreens.selftest.mjs holds the result.
//   node tools/media-r5/loading-media.mjs [--masters <dir>] [--jobs <n>] [--cache <dir>] [--plan | --dry]
// --plan prints each pick's render and caption and encodes nothing; --cache keeps the encodes between runs.
// (--masters defaults to picks.json loading.masters under the repository: shots/ is ignored, so a lane names the media
// worktree's folder.)
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTankAssets } from '../tank-assets-store.mjs';
import { FIRST_PARTY_LICENSE, PROJECT_COPYRIGHT, PROJECT_CREATOR } from '../../src/authorship.ts';
import { TANK_IDS } from '../../src/vehicles/tankIdAliases.ts';
import { filteredStill } from './master-filter.mjs';
import { REPO as ROOT } from './paths.mjs';

const argv = process.argv.slice(2);
const option = (name) => {
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  return argv[i].includes('=') ? argv[i].slice(name.length + 3) : argv[i + 1];
};
const DRY = argv.includes('--dry');
const PICKS = JSON.parse(readFileSync(join(ROOT, 'tools/media-r5/site-media/picks.json'), 'utf8')).loading;
const MASTERS = resolve(ROOT, option('masters') ?? PICKS.masters);
const JOBS = Math.max(1, Number(option('jobs') ?? 6));
const OUT = join(ROOT, 'public/media', PICKS.collection);
const URL_BASE = `/media/${PICKS.collection}`;
const WIDTH = 1920, HEIGHT = 1080, MAX_BYTES = 600 * 1024, QUALITIES = [90, 86, 82];
const EN = JSON.parse(readFileSync(join(ROOT, 'src/ui/i18nCatalog.en-US.json'), 'utf8'));
const ZH = JSON.parse(readFileSync(join(ROOT, 'src/ui/i18nCatalog.zh-CN.json'), 'utf8'));
const TANKS = readTankAssets(join(ROOT, 'public/icons')).tanks;

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
function webpSize(buffer) {
  if (buffer.subarray(0, 4).toString() !== 'RIFF' || buffer.subarray(8, 12).toString() !== 'WEBP') return null;
  const kind = buffer.subarray(12, 16).toString();
  if (kind === 'VP8 ') return [buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') { const bits = buffer.readUInt32LE(21); return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1]; }
  if (kind === 'VP8X') return [buffer.readUIntLE(24, 3) + 1, buffer.readUIntLE(27, 3) + 1];
  return null;
}
/** A catalog string, or an error: a caption never falls back to a key or an id. */
const word = (catalog, key, lang) => {
  const value = catalog[key];
  if (typeof value !== 'string' || !value) throw new Error(`${lang} catalog has no ${key}`);
  return value;
};
const roleOf = (name) => (/^foe\d*$/.test(name) ? 'foe' : /^ally\d*$/.test(name) ? 'ally' : /^wreck\d*$/.test(name) ? 'wreck' : name);

/** The still's render: its one 4K png and the scene its cinema receipt recorded. */
function renderOf(id) {
  const dir = join(MASTERS, id);
  const receiptFile = join(dir, 'cinema-receipt.json');
  if (!existsSync(receiptFile)) throw new Error(`no render (${relative(ROOT, receiptFile)} is missing)`);
  const pngs = existsSync(join(dir, 'stills')) ? readdirSync(join(dir, 'stills')).filter((f) => f.endsWith('.png')) : [];
  if (pngs.length !== 1) throw new Error(`${pngs.length} pngs in ${id}/stills, not one`);
  const receipt = JSON.parse(readFileSync(receiptFile, 'utf8'));
  if (!receipt.finished || receipt.errors?.length) throw new Error(`its render did not finish cleanly (${receiptFile})`);
  return { png: join(dir, 'stills', pngs[0]), source: `${id}/stills/${pngs[0]}`, revision: receipt.revision, scene: receipt.config.scene };
}

/** The still's map, hour, tanks and caption (the owner's gallery, ~/cot-lanes/og-r1/elevated-269/gallery-build.py). */
function itemOf(id, group, scene) {
  const tanks = scene.actors.map((a) => {
    const current = TANK_IDS.resolve(a.id, scene.tankIdSchema), displayName = TANKS[current]?.label?.displayName;
    if (!displayName) throw new Error(`${a.name} ${a.id} (${current}) has no label.displayName in public/icons/tank-assets/`);
    return { role: roleOf(a.name), id: current, displayName };
  });
  const by = new Map(scene.actors.map((a, n) => [a.name, tanks[n]]));
  const hero = by.get('hero');
  if (!hero) throw new Error('the scene names no hero');
  // meta.pair names the hero's partner ("hero and foe1"); any other pairing (a versus scene's "a v b") is the first foe
  const pair = scene.meta?.pair ?? '';
  let mateName = pair.replace(/^hero and /, '') || 'foe0';
  if (!by.has(mateName)) mateName = 'foe0';
  const mate = by.get(mateName);
  if (pair !== 'hero alone' && !mate) throw new Error(`the scene's pair "${pair}" names no tank`);
  const ally = mateName.startsWith('ally');
  const who = pair === 'hero alone' ? { en: hero.displayName, zh: hero.displayName }
    : hero.displayName === mate.displayName ? { en: `${hero.displayName} pair`, zh: `两辆 ${hero.displayName}` }
      : { en: `${hero.displayName} ${ally ? 'and' : 'v'} ${mate.displayName}`, zh: `${hero.displayName} ${ally ? '与' : '对'} ${mate.displayName}` };
  const map = scene.map;
  const title = {
    en: `${word(EN, `map.${map}`, 'en-US')}: ${who.en}`,
    zh: `${word(ZH, `map.${map}`, 'zh-CN')}：${who.zh}`,
  };
  return { id, group, map, hour: scene.timeOfDay, title, tanks };
}

/** cwebp, off the main thread so several encode at once. */
function cwebp(png, out, quality) {
  return new Promise((done) => {
    const child = spawn('cwebp', ['-quiet', '-m', '6', '-sharp_yuv', '-q', String(quality), '-resize', String(WIDTH), String(HEIGHT), png, '-o', out]);
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => done(error.message));
    child.on('close', (status) => done(status === 0 ? null : `cwebp exited ${status}: ${stderr.trim()}`));
  });
}
/**
 * The still's webp at the first quality of QUALITIES that fits MAX_BYTES (a busy scene steps down rather than ship over
 * the cap). An encode in the cache folder (--cache, kept between runs) is reused while it is newer than its render.
 */
async function encode(id, png, cache) {
  for (const quality of QUALITIES) {
    const out = join(cache, `${id}-q${quality}.webp`);
    if (!existsSync(out) || statSync(out).mtimeMs < statSync(png).mtimeMs) {
      const failed = await cwebp(filteredStill(png, cache, id), out, quality);
      if (failed) throw new Error(failed);
    }
    const bytes = readFileSync(out);
    if (bytes.length <= MAX_BYTES) return { bytes, quality };
  }
  throw new Error(`over ${MAX_BYTES} B even at q${QUALITIES.at(-1)}`);
}

const picks = [...PICKS.close.map((id) => [id, 'close']), ...PICKS.elevated.map((id) => [id, 'elevated'])];
if (new Set(picks.map(([id]) => id)).size !== picks.length) throw new Error('loading-media: a still is picked twice');
// --plan: each pick's render and caption, nothing encoded
if (argv.includes('--plan')) {
  let ready = 0;
  for (const [id, group] of picks) {
    try {
      const render = renderOf(id), item = itemOf(id, group, render.scene);
      ready += 1;
      console.log(`${group.padEnd(8)} ${id.padEnd(66)} ${render.revision?.slice(0, 10)}  ${item.title.en}  |  ${item.title.zh}`);
    } catch (error) { console.log(`${group.padEnd(8)} ${id.padEnd(66)} NOT READY: ${error.message ?? error}`); }
  }
  console.log(`loading-media --plan: ${ready} of ${picks.length} ready`);
  process.exit(ready === picks.length ? 0 : 1);
}
const cacheArg = option('cache');
const work = cacheArg ? resolve(cacheArg) : mkdtempSync(join(tmpdir(), 'cot-loading-'));
mkdirSync(work, { recursive: true });
const results = new Array(picks.length);
let next = 0;
async function worker() {
  for (let n = next++; n < picks.length; n = next++) {
    const [id, group] = picks[n];
    try {
      const render = renderOf(id);
      const item = itemOf(id, group, render.scene);
      const { bytes, quality } = await encode(id, render.png, work);
      const size = webpSize(bytes);
      if (!size || size[0] !== WIDTH || size[1] !== HEIGHT) throw new Error(`encoded ${size ? `${size[0]}x${size[1]}` : 'no webp'}, not ${WIDTH}x${HEIGHT}`);
      results[n] = { item, render, bytes, quality };
      console.log(`${String(n + 1).padStart(2)} ${id.padEnd(66)} ${(bytes.length / 1024).toFixed(0).padStart(4)} KB q${quality}  ${item.title.en}`);
    } catch (error) {
      results[n] = { problem: String(error.message ?? error) };
      console.log(`${String(n + 1).padStart(2)} ${id.padEnd(66)} NOT READY\n    ${results[n].problem}`);
    }
  }
}
try {
  await Promise.all(Array.from({ length: Math.min(JOBS, picks.length) }, worker));
} finally {
  if (!cacheArg) rmSync(work, { recursive: true, force: true });
}
const problems = picks.filter((_, n) => results[n].problem).map(([id]) => id);
if (problems.length) {
  console.error(`loading-media: nothing written; ${problems.length} of ${picks.length} picks are not ready (${problems.join(', ')})`);
  process.exit(1);
}
const files = new Map();
const items = results.map(({ item, render, bytes, quality }) => {
  const name = `${item.id}.webp`;
  files.set(name, bytes);
  return { ...item, path: `${URL_BASE}/${name}`, bytes: bytes.length, sha256: sha256(bytes), width: WIDTH, height: HEIGHT, quality,
    source: render.source, revision: render.revision };
});
const manifest = {
  libraryId: `claude-of-tanks-${PICKS.collection}`,
  schemaVersion: 1,
  ...TANK_IDS.stamp(),
  author: PROJECT_CREATOR,
  copyright: PROJECT_COPYRIGHT,
  license: FIRST_PARTY_LICENSE,
  description: 'The loading-screen stills: the ones the owner picked from his loading-screen gallery, its close-ups and then any elevated stills, each a scene staged in the Scene Studio and rendered at 4K by the game engine; after the boot pick they are the loading screens\' rotation (src/ui/featuredShots.ts LOADING_SHOTS).',
  generatedBy: relative(ROOT, fileURLToPath(import.meta.url)),
  sources: `the 4K stills of the Scene Studio renders under ${PICKS.masters} (each item's source names its file, its revision the commit it was rendered on)`,
  dimensions: { width: WIDTH, height: HEIGHT },
  count: items.length,
  items,
};
const total = items.reduce((sum, i) => sum + i.bytes, 0);
console.log(`loading-media: ${items.length} stills, ${(total / 1048576).toFixed(2)} MB -> ${relative(ROOT, OUT)}${DRY ? ' (dry run: nothing written)' : ''}`);
if (!DRY) {
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) {
    if (f !== 'manifest.json' && !files.has(f)) { unlinkSync(join(OUT, f)); console.log(`  removed ${f} (no pick names it)`); }
  }
  for (const [name, bytes] of files) writeFileSync(join(OUT, name), bytes);
  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
}
