#!/usr/bin/env node
// The boot splash's own stills, public/media/boot-r1 (owner 2026-11-20, of a one-second Scene Studio clip of Verdant
// Fields: "use a frame from this as the first loading screen"). tools/media-r5/site-media/picks.json `boot` names each
// still: the clip it is cut from (a file in the clips folder given on the command line), the frame (ffmpeg's frame
// number, 0-based), its battlefield and its hour, and how much of the frame's left edge it drops (cropLeft, a fraction of
// the width, 0 by default; 274, the owner on the 273.4 splash: "crop the left of the loading shot a little", then "lets
// see 5%": 0.05, the 1920x1080 frame cut to 1824x1080). Each still ships as one webp of the
// cut at full size, at most 600 KB, encoded at q90 (a busy frame steps down to q86, then q82) through the master filter
// (master-filter.mjs), and its rungs (boot.rungs: the 1280 the boot splash opens on, the 1280x720 frame cut the same
// way, so 1216x720 at 0.05; a rung keeps its name). manifest.json records, per still, its map and hour, its title in
// English and Chinese (the battlefield's catalog name and the hour, as the library places a picture), the clip's name,
// sha256, size and frame, the crop (in frame pixels), and the webps' sizes, bytes and sha256. Nothing is written unless
// every still's clip is there. Files in the folder that no still names are removed. site-media-wire.mjs wires a featured
// pick that names one (`bootStill`) as the boot pick; src/ui/loadingScreens.selftest.mjs holds the result.
//   node tools/media-r5/boot-media.mjs --clips <dir> [--dry]     (or COT_BOOT_CLIPS=<dir>)
//   --crop-left <fraction>   a trial cut: every still drops this share of its left edge instead of its pick's cropLeft
//   --out <dir>              write there instead of public/media/<collection> (a trial cut never lands in public/)
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
const OUT = option('out') ? resolve(option('out')) : join(ROOT, 'public/media', PICKS.collection);
const CROP_LEFT = option('crop-left') === undefined ? undefined : Number(option('crop-left'));
if (CROP_LEFT !== undefined && !option('out') && !DRY) {
  console.error('boot-media: a trial cut (--crop-left) writes only to --out <dir>; the published cut is the pick\'s cropLeft');
  process.exit(2);
}
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
/** The crop of a WIDTHxHEIGHT frame that drops <left> (a fraction of the width) off its left edge, in frame pixels. */
function cropOf(left) {
  if (!Number.isFinite(left) || left < 0 || left >= 0.5) throw new Error(`cropLeft ${left} is not a fraction in [0, 0.5)`);
  const x = Math.round(WIDTH * left);
  return { x, y: 0, width: WIDTH - x, height: HEIGHT };
}
/** The webp of <crop> of <png> at <quality>, scaled so the full frame would be <rung> wide: [bytes, width, height]. */
function cwebp(png, out, quality, crop, rung) {
  const width = Math.round(crop.width * rung / WIDTH), height = Math.round(crop.height * rung / WIDTH);
  run('cwebp', ['-quiet', '-m', '6', '-sharp_yuv', '-q', String(quality), '-crop', String(crop.x), String(crop.y), String(crop.width), String(crop.height),
    '-resize', String(width), String(height), png, '-o', out]);
  const bytes = readFileSync(out), size = webpSize(bytes);
  if (!size || size[0] !== width || size[1] !== height) throw new Error(`encoded ${size ? `${size[0]}x${size[1]}` : 'no webp'}, not ${width}x${height}`);
  return [bytes, width, height];
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
      const crop = cropOf(CROP_LEFT ?? s.cropLeft ?? 0);
      let bytes = null, quality = 0, width = 0, height = 0;
      for (const q of QUALITIES) {
        [bytes, width, height] = cwebp(master, join(work, `${s.id}-q${q}.webp`), q, crop, WIDTH);
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
      const rungs = RUNGS.map(({ width: rung, quality: rq }) => {
        const [rb, rw, rh] = cwebp(master, join(work, `${s.id}-${rung}-q${rq}.webp`), rq, crop, rung), rungName = `${s.id}-${rung}.webp`;
        files.set(rungName, rb);
        return { rung, width: rw, height: rh, quality: rq, path: `${URL_BASE}/${rungName}`, bytes: rb.length, sha256: sha256(rb) };
      });
      const clipBytes = readFileSync(clipFile);
      items.push({ id: s.id, map: s.map, hour: s.hour, title,
        clip: { file: s.clip, bytes: clipBytes.length, sha256: sha256(clipBytes), rate: clip.rate, frames: clip.frames, frame: s.frame },
        crop: { left: crop.x / WIDTH, ...crop },
        path: `${URL_BASE}/${name}`, bytes: bytes.length, sha256: sha256(bytes), width, height, quality, rungs });
      console.log(`${s.id}: frame ${s.frame} of ${s.clip}, left ${crop.x} px cut, ${width}x${height} ${(bytes.length / 1024).toFixed(0)} KB q${quality}${rungs.map((r) => ` + ${r.width}x${r.height} ${r.bytes} B q${r.quality}`).join('')}  ${title.en} | ${title.zh}`);
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
  description: 'The boot splash\'s own stills: each a frame of a Scene Studio clip the owner picked, cut as its crop says (frame pixels), at full size and the 1280 rung the boot splash opens on (the 1280x720 frame, cut the same way).',
  generatedBy: relative(ROOT, fileURLToPath(import.meta.url)),
  sources: 'the clips named per item (clip.file, its sha256 and the frame cut from it), kept outside the repository',
  dimensions: { width: WIDTH, height: HEIGHT },
  ...(CROP_LEFT === undefined ? {} : { trial: `--crop-left ${CROP_LEFT}` }),
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
