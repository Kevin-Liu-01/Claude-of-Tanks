#!/usr/bin/env node
// The versus collection, public/media/versus-r1 (owner 2026-10-15: "these will be our opengraph foundations and for
// marketing"). Each still in picks.json ships as one 1920x1080 webp made from its delivered 1440p master, found in the
// masters folder given on the command line: <id>-1920.webp as it stands, else <id>.png encoded at q90. manifest.json
// records, per still, its round, map and hour, its titles in English and Chinese (the game's own map, hour and vehicle
// names: the i18n catalogs and public/icons/tank-assets.json label.displayName, never an id), its tanks at this tree's
// tank-id schema, its scene (scenes/<id>.json) and the file's bytes and sha256. Nothing is written unless every pick
// has its master. Files in the folder that no pick names are removed. tools/marketing-shots/versus-media.selftest.mjs
// holds the result.
//   node tools/media-r5/versus/versus-media.mjs --masters <dir> [--dry]     (or COT_VERSUS_MASTERS=<dir>)
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIRST_PARTY_LICENSE, PROJECT_COPYRIGHT, PROJECT_CREATOR } from '../../../src/authorship.ts';
import { TANK_IDS } from '../../../src/vehicles/tankIdAliases.ts';
import { REPO as ROOT } from '../paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const option = (name) => {
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  return argv[i].includes('=') ? argv[i].slice(name.length + 3) : argv[i + 1];
};
const DRY = argv.includes('--dry');
const mastersArg = option('masters') ?? process.env.COT_VERSUS_MASTERS;
if (!mastersArg) {
  console.error('versus-media: give the masters folder: --masters <dir> (or COT_VERSUS_MASTERS=<dir>)');
  process.exit(2);
}
const MASTERS = resolve(mastersArg);
const PICKS = JSON.parse(readFileSync(join(HERE, 'picks.json'), 'utf8'));
const OUT = join(ROOT, 'public/media', PICKS.collection);
const URL_BASE = `/media/${PICKS.collection}`;
const WIDTH = 1920, HEIGHT = 1080, MAX_BYTES = 600 * 1024, QUALITY = 90;
const EN = JSON.parse(readFileSync(join(ROOT, 'src/ui/i18nCatalog.en-US.json'), 'utf8'));
const ZH = JSON.parse(readFileSync(join(ROOT, 'src/ui/i18nCatalog.zh-CN.json'), 'utf8'));
const TANKS = JSON.parse(readFileSync(join(ROOT, 'public/icons/tank-assets.json'), 'utf8')).tanks;

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
function webpSize(buffer) {
  if (buffer.subarray(0, 4).toString() !== 'RIFF' || buffer.subarray(8, 12).toString() !== 'WEBP') return null;
  const kind = buffer.subarray(12, 16).toString();
  if (kind === 'VP8 ') return [buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') { const bits = buffer.readUInt32LE(21); return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1]; }
  if (kind === 'VP8X') return [buffer.readUIntLE(24, 3) + 1, buffer.readUIntLE(27, 3) + 1];
  return null;
}
/** A catalog string, or an error: a title never falls back to a key or an id. */
const word = (catalog, key, lang) => {
  const value = catalog[key];
  if (typeof value !== 'string' || !value) throw new Error(`${lang} catalog has no ${key}`);
  return value;
};
/** An id's round: its -rN suffix; unsuffixed, the f6/f7 remakes are round 3 and the versus scenes round 4. */
const roundOf = (id) => { const m = /-r(\d+)$/.exec(id); return m ? Number(m[1]) : /^f[67]-/.test(id) ? 3 : 4; };
const roleOf = (name) => (/^foe\d*$/.test(name) ? 'foe' : /^ally\d*$/.test(name) ? 'ally' : /^wreck\d*$/.test(name) ? 'wreck' : name);

function stillOf(id) {
  const webp = join(MASTERS, `${id}-1920.webp`), png = join(MASTERS, `${id}.png`);
  if (existsSync(webp)) return { bytes: readFileSync(webp), source: basename(webp) };
  if (existsSync(png)) {
    const dir = mkdtempSync(join(tmpdir(), 'cot-versus-')), out = join(dir, `${id}.webp`);
    try {
      const r = spawnSync('cwebp', ['-quiet', '-m', '6', '-sharp_yuv', '-q', String(QUALITY), '-resize', String(WIDTH), String(HEIGHT), png, '-o', out], { encoding: 'utf8' });
      if (r.status !== 0) return { error: `cwebp failed on ${basename(png)}: ${(r.stderr || r.error?.message || '').trim()}` };
      return { bytes: readFileSync(out), source: basename(png) };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return { error: `no master (${id}-1920.webp or ${id}.png in ${MASTERS})` };
}

function itemOf(id) {
  const sceneFile = join(HERE, 'scenes', `${id}.json`);
  if (!existsSync(sceneFile)) throw new Error(`${id}: no scene at ${relative(ROOT, sceneFile)}`);
  const scene = JSON.parse(readFileSync(sceneFile, 'utf8'));
  const tanks = scene.actors.map((a) => {
    const current = TANK_IDS.resolve(a.id, scene.tankIdSchema), displayName = TANKS[current]?.label?.displayName;
    if (!displayName) throw new Error(`${id}: ${a.name} ${a.id} (${current}) has no label.displayName in public/icons/tank-assets.json`);
    return { role: roleOf(a.name), id: current, displayName, paint: a.camo ?? null };
  });
  const hero = tanks[scene.actors.findIndex((a) => a.name === 'hero')], foe = tanks[scene.actors.findIndex((a) => /^foe\d*$/.test(a.name))];
  if (!hero || !foe) throw new Error(`${id}: the scene names no hero and foe`);
  const map = scene.map, hour = scene.timeOfDay;
  // a top-down still names its view in its place, so it reads apart from the close still of the same scene
  const above = scene.meta?.view === 'top-down';
  const title = {
    en: `${word(EN, `map.${map}`, 'en-US')}, ${word(EN, `atmosphere.${hour}`, 'en-US').toLowerCase()}${above ? ', from above' : ''}: ${hero.displayName} v ${foe.displayName}`,
    zh: `${word(ZH, `map.${map}`, 'zh-CN')}，${word(ZH, `atmosphere.${hour}`, 'zh-CN')}${above ? '，俯瞰' : ''}：${hero.displayName} 对 ${foe.displayName}`,
  };
  return { id, round: roundOf(id), map, hour, title, tanks, scene: relative(ROOT, sceneFile) };
}

const items = [], problems = [], files = new Map();
for (const id of PICKS.ship) {
  let item, problem = null;
  try { item = itemOf(id); } catch (e) { problem = String(e.message ?? e); }
  const still = item ? stillOf(id) : null, size = still?.bytes ? webpSize(still.bytes) : null;
  if (!problem && still.error) problem = still.error;
  else if (!problem && (!size || size[0] !== WIDTH || size[1] !== HEIGHT)) problem = `${still.source} is ${size ? `${size[0]}x${size[1]}` : 'not a webp'}, not ${WIDTH}x${HEIGHT}`;
  else if (!problem && still.bytes.length > MAX_BYTES) problem = `${still.source} is ${still.bytes.length} B, over ${MAX_BYTES}`;
  console.log(`${id.padEnd(30)} ${problem ? 'NOT READY' : `${(still.bytes.length / 1024).toFixed(0).padStart(4)} KB `}  ${item?.title.en ?? ''}${problem ? `\n    ${problem}` : ''}`);
  if (problem) { problems.push(id); continue; }
  const name = `${id}.webp`;
  files.set(name, still.bytes);
  items.push({ ...item, path: `${URL_BASE}/${name}`, bytes: still.bytes.length, sha256: sha256(still.bytes), width: WIDTH, height: HEIGHT,
    source: still.source });
}
if (problems.length) {
  console.error(`versus-media: nothing written; ${problems.length} of ${PICKS.ship.length} picks are not ready (${problems.join(', ')})`);
  process.exit(1);
}
const manifest = {
  libraryId: PICKS.libraryId,
  schemaVersion: 1,
  ...TANK_IDS.stamp(),
  author: PROJECT_CREATOR,
  copyright: PROJECT_COPYRIGHT,
  license: FIRST_PARTY_LICENSE,
  description: 'The versus stills: two of the game\'s tanks in one fight on its own maps, staged in the Scene Studio and rendered by the game engine; the foundations of the site\'s social cards and its marketing.',
  generatedBy: relative(ROOT, fileURLToPath(import.meta.url)),
  sources: 'the delivered 1440p masters of the Scene Studio renders (each item\'s source names its file)',
  dimensions: { width: WIDTH, height: HEIGHT },
  count: items.length,
  items,
};
const total = items.reduce((sum, i) => sum + i.bytes, 0);
console.log(`versus-media: ${items.length} stills, ${(total / 1048576).toFixed(2)} MB -> ${relative(ROOT, OUT)}${DRY ? ' (dry run: nothing written)' : ''}`);
if (!DRY) {
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) {
    if (f !== 'manifest.json' && !files.has(f)) { unlinkSync(join(OUT, f)); console.log(`  removed ${f} (no pick names it)`); }
  }
  for (const [name, bytes] of files) writeFileSync(join(OUT, name), bytes);
  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
}
