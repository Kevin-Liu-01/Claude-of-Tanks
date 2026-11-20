#!/usr/bin/env node
// The boot splash's own stills, public/media/boot-r1 (owner 2026-11-20, of a one-second Scene Studio clip of Verdant
// Fields: "use a frame from this as the first loading screen"). tools/media-r5/site-media/picks.json `boot` names each
// still: the clip it is cut from (a file in the clips folder given on the command line), the frame (ffmpeg's frame
// number, 0-based), its battlefield and its hour. Each still ships as one 1920x1080 webp of at most 600 KB, encoded at q90
// (a busy frame steps down to q86, then q82) through the master filter (master-filter.mjs), and its rungs (boot.rungs:
// the 1280 the boot splash opens on). manifest.json records, per still, its map and hour, its title in English and
// Chinese (the battlefield's catalog name and the hour, as the library places a picture), the clip's name, sha256, size
// and frame, and the webps' bytes and sha256. Nothing is written unless every still's clip is there. Files in the folder
// that no still names are removed. site-media-wire.mjs wires a featured pick that names one (`bootStill`) as the boot
// pick; src/ui/loadingScreens.selftest.mjs holds the result.
//   node tools/media-r5/boot-media.mjs --clips <dir> [--dry]     (or COT_BOOT_CLIPS=<dir>)
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIRST_PARTY_LICENSE, PROJECT_COPYRIGHT, PROJECT_CREATOR } from '../../src/authorship.ts';
import { filteredStill } from './master-filter.mjs';
import { REPO as ROOT } from './paths.mjs';

const argv = process.argv.slice(2);
const option = (name) => {
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  return argv[i].includes('=') ? argv[i].slice(name.length + 3) : argv[i + 1];
};
const DRY = argv.includes('--dry');
const clipsArg = option('clips') ?? process.env.COT_BOOT_CLIPS;
if (!clipsArg) {
  console.error('boot-media: give the clips folder: --clips <dir> (or COT_BOOT_CLIPS=<dir>)');
  process.exit(2);
}
const CLIPS = resolve(clipsArg);
const PICKS = JSON.parse(readFileSync(join(ROOT, 'tools/media-r5/site-media/picks.json'), 'utf8')).boot;
const OUT = join(ROOT, 'public/media', PICKS.collection);
const URL_BASE = `/media/${PICKS.collection}`;
const WIDTH = 1920, HEIGHT = 1080, MAX_BYTES = 600 * 1024, QUALITIES = [90, 86, 82];
const RUNGS = PICKS.rungs ?? [];
const EN = JSON.parse(readFileSync(join(ROOT, 'src/ui/i18nCatalog.en-US.json'), 'utf8'));
const ZH = JSON.parse(readFileSync(join(ROOT, 'src/ui/i18nCatalog.zh-CN.json'), 'utf8'));

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
/** A catalog string, or an error: a title never falls back to a key or an id. */
const word = (catalog, key, lang) => {
  const value = catalog[key];
  if (typeof value !== 'string' || !value) throw new Error(`${lang} catalog has no ${key}`);
  return value;
};
function webpSize(buffer) {
  if (buffer.subarray(0, 4).toString() !== 'RIFF' || buffer.subarray(8, 12).toString() !== 'WEBP') return null;
  const kind = buffer.subarray(12, 16).toString();
  if (kind === 'VP8 ') return [buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') { const bits = buffer.readUInt32LE(21); return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1]; }
  if (kind === 'VP8X') return [buffer.readUIntLE(24, 3) + 1, buffer.readUIntLE(27, 3) + 1];
  return null;
}
function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${(r.stderr || r.error?.message || '').trim()}`);
  return r.stdout;
}
/** The clip's frame size, frame count and rate, as ffprobe reads its video stream. */
function probe(clip) {
  const [w, h, rate, frames] = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames',
    '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames', '-of', 'csv=p=0', clip]).trim().split(',');
  return { width: Number(w), height: Number(h), rate, frames: Number(frames) };
}
/** The webp of <png> at <quality>, <width> wide and 16:9. */
function cwebp(png, out, quality, width) {
  run('cwebp', ['-quiet', '-m', '6', '-sharp_yuv', '-q', String(quality), '-resize', String(width), String(Math.round(width * HEIGHT / WIDTH)), png, '-o', out]);
  const bytes = readFileSync(out), size = webpSize(bytes), height = Math.round(width * HEIGHT / WIDTH);
  if (!size || size[0] !== width || size[1] !== height) throw new Error(`encoded ${size ? `${size[0]}x${size[1]}` : 'no webp'}, not ${width}x${height}`);
  return bytes;
}

const ids = PICKS.stills.map((s) => s.id);
if (new Set(ids).size !== ids.length) throw new Error('boot-media: a still is picked twice');
const work = mkdtempSync(join(tmpdir(), 'cot-boot-'));
const files = new Map();
const items = [];
const problems = [];
try {
  for (const s of PICKS.stills) {
    try {
      const clipFile = join(CLIPS, s.clip);
      if (!existsSync(clipFile)) throw new Error(`no clip (${clipFile})`);
      const clip = probe(clipFile);
      if (clip.width !== WIDTH || clip.height !== HEIGHT) throw new Error(`the clip is ${clip.width}x${clip.height}, not ${WIDTH}x${HEIGHT}`);
      if (!Number.isInteger(s.frame) || s.frame < 0 || s.frame >= clip.frames) throw new Error(`frame ${s.frame} is not one of the clip's ${clip.frames}`);
      const png = join(work, `${s.id}.png`);
      run('ffmpeg', ['-v', 'error', '-y', '-i', clipFile, '-vf', `select=eq(n\\,${s.frame})`, '-fps_mode', 'passthrough', '-frames:v', '1', png]);
      const master = filteredStill(png, work, s.id);
      let bytes = null, quality = 0;
      for (const q of QUALITIES) {
        bytes = cwebp(master, join(work, `${s.id}-q${q}.webp`), q, WIDTH);
        quality = q;
        if (bytes.length <= MAX_BYTES) break;
      }
      if (bytes.length > MAX_BYTES) throw new Error(`over ${MAX_BYTES} B even at q${QUALITIES.at(-1)}`);
      const title = {
        en: `${word(EN, `map.${s.map}`, 'en-US')}, ${word(EN, `atmosphere.${s.hour}`, 'en-US').toLowerCase()}`,
        zh: `${word(ZH, `map.${s.map}`, 'zh-CN')}，${word(ZH, `atmosphere.${s.hour}`, 'zh-CN')}`,
      };
      const name = `${s.id}.webp`;
      files.set(name, bytes);
      const rungs = RUNGS.map(({ width, quality: rq }) => {
        const rb = cwebp(master, join(work, `${s.id}-${width}-q${rq}.webp`), rq, width), rungName = `${s.id}-${width}.webp`;
        files.set(rungName, rb);
        return { width, height: Math.round(width * HEIGHT / WIDTH), quality: rq, path: `${URL_BASE}/${rungName}`, bytes: rb.length, sha256: sha256(rb) };
      });
      const clipBytes = readFileSync(clipFile);
      items.push({ id: s.id, map: s.map, hour: s.hour, title,
        clip: { file: s.clip, bytes: clipBytes.length, sha256: sha256(clipBytes), rate: clip.rate, frames: clip.frames, frame: s.frame },
        path: `${URL_BASE}/${name}`, bytes: bytes.length, sha256: sha256(bytes), width: WIDTH, height: HEIGHT, quality, rungs });
      console.log(`${s.id}: frame ${s.frame} of ${s.clip}, ${(bytes.length / 1024).toFixed(0)} KB q${quality}${rungs.map((r) => ` + ${r.width} ${(r.bytes / 1024).toFixed(0)} KB q${r.quality}`).join('')}  ${title.en} | ${title.zh}`);
    } catch (error) {
      problems.push(s.id);
      console.log(`${s.id}: NOT READY\n    ${error.message ?? error}`);
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
if (problems.length) {
  console.error(`boot-media: nothing written; ${problems.length} of ${ids.length} stills are not ready (${problems.join(', ')})`);
  process.exit(1);
}
const manifest = {
  libraryId: `claude-of-tanks-${PICKS.collection}`,
  schemaVersion: 1,
  author: PROJECT_CREATOR,
  copyright: PROJECT_COPYRIGHT,
  license: FIRST_PARTY_LICENSE,
  description: 'The boot splash\'s own stills: each a frame of a Scene Studio clip the owner picked, at 1920 and the 1280 rung the boot splash opens on.',
  generatedBy: relative(ROOT, fileURLToPath(import.meta.url)),
  sources: 'the clips named per item (clip.file, its sha256 and the frame cut from it), kept outside the repository',
  dimensions: { width: WIDTH, height: HEIGHT },
  count: items.length,
  items,
};
console.log(`boot-media: ${items.length} still${items.length === 1 ? '' : 's'} -> ${relative(ROOT, OUT)}${DRY ? ' (dry run: nothing written)' : ''}`);
if (!DRY) {
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) {
    if (f !== 'manifest.json' && !files.has(f)) { unlinkSync(join(OUT, f)); console.log(`  removed ${f} (no still names it)`); }
  }
  for (const [name, bytes] of files) writeFileSync(join(OUT, name), bytes);
  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
}
