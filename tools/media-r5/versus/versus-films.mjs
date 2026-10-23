#!/usr/bin/env node
// The versus films, public/media/versus-films-r1 (2026-10-22, the owner: "we need all on the site!"): each scene's
// moving take, filmed in the Scene Studio by the game engine, as the landing's versus section plays it (a muted loop
// that plays in view). Each film in picks.json's films ships as three files made from its filtered master, found in
// the folder given on the command line: <id>.mp4 (1920x1080 H.264), <id>-mobile.mp4 (960x540, the phone's) and
// <id>.jpg (its first frame, the poster). manifest.json records, per film, its title in English and Chinese (the
// versus still of the same id: versus-r1's manifest) and each file's bytes, size, length and sha256. Nothing is written
// unless every film has its three files. Files in the folder that no film names are removed.
//   node tools/media-r5/versus/versus-films.mjs --films <dir> [--dry]
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIRST_PARTY_LICENSE, PROJECT_COPYRIGHT, PROJECT_CREATOR } from '../../../src/authorship.ts';
import { REPO as ROOT } from '../paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const at = argv.indexOf('--films');
const filmsArg = at >= 0 ? argv[at + 1] : argv.find((a) => a.startsWith('--films='))?.slice(8);
if (!filmsArg) {
  console.error('versus-films: give the folder of web files: --films <dir>');
  process.exit(2);
}
const DRY = argv.includes('--dry');
const FILMS = resolve(filmsArg);
const PICKS = JSON.parse(readFileSync(join(HERE, 'picks.json'), 'utf8'));
const COLLECTION = PICKS.filmsCollection;
const OUT = join(ROOT, 'public/media', COLLECTION);
const URL_BASE = `/media/${COLLECTION}`;
const STILLS = JSON.parse(readFileSync(join(ROOT, 'public/media', PICKS.collection, 'manifest.json'), 'utf8')).items;
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

/** A file's picture size and length (ffprobe). */
function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffprobe failed on ${file}`);
  const j = JSON.parse(r.stdout);
  return { width: j.streams[0].width, height: j.streams[0].height, seconds: j.format.duration ? Number(Number(j.format.duration).toFixed(2)) : undefined };
}

const items = [], problems = [], files = new Map();
for (const id of PICKS.films) {
  const still = STILLS.find((s) => s.id === id);
  if (!still) { problems.push(`${id}: no versus still of that id (its title)`); continue; }
  const parts = {};
  for (const [key, name] of [['film', `${id}.mp4`], ['mobile', `${id}-mobile.mp4`], ['poster', `${id}.jpg`]]) {
    const file = join(FILMS, name);
    if (!existsSync(file)) { problems.push(`${id}: no ${name} in ${FILMS}`); continue; }
    const bytes = readFileSync(file);
    files.set(name, bytes);
    parts[key] = { path: `${URL_BASE}/${name}`, bytes: bytes.length, sha256: sha256(bytes), ...probe(file) };
  }
  if (Object.keys(parts).length < 3) continue;
  items.push({ id, map: still.map, hour: still.hour, title: still.title, tanks: still.tanks, ...parts });
  console.log(`${id.padEnd(34)} ${(parts.film.bytes / 1048576).toFixed(1).padStart(4)} MB  ${parts.film.seconds} s  ${still.title.en}`);
}
if (problems.length) {
  console.error(`versus-films: nothing written\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
const manifest = {
  libraryId: `claude-of-tanks-${COLLECTION}`,
  schemaVersion: 1,
  author: PROJECT_CREATOR,
  copyright: PROJECT_COPYRIGHT,
  license: FIRST_PARTY_LICENSE,
  description: 'The versus films: each versus scene\'s moving take, staged in the Scene Studio and filmed by the game engine, played muted on the landing page.',
  generatedBy: relative(ROOT, fileURLToPath(import.meta.url)),
  count: items.length,
  items,
};
const total = [...files.values()].reduce((sum, b) => sum + b.length, 0);
console.log(`versus-films: ${items.length} films, ${(total / 1048576).toFixed(1)} MB -> ${relative(ROOT, OUT)}${DRY ? ' (dry run: nothing written)' : ''}`);
if (!DRY) {
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) {
    if (f !== 'manifest.json' && !files.has(f)) { unlinkSync(join(OUT, f)); console.log(`  removed ${f} (no film names it)`); }
  }
  for (const [name, bytes] of files) writeFileSync(join(OUT, name), bytes);
  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
}
