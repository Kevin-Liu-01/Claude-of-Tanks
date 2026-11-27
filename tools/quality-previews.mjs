#!/usr/bin/env node
// Big output (every film, any other file of 256 KB or more) belongs on Vercel Blob: after this tool, run `node tools/blob-media.mjs adopt --sweep` and `families --write` (media-blob-279; tools/blob-media-cutover.selftest.mjs fails while a big file is in public/media).
// tools/quality-previews.mjs — the Settings screen's graphics-quality previews, one per level on both ladders
// (texture-diet-277; Kevin 2026-11-25: "add the previews for the quality levels for all levels").
//
// One scene and one camera for every level: Verdant, the pinned battle (tools/pinned-scene-acquisition.mjs) at the battle's
// chase camera behind the player's hull, shot by tools/ground-surface-shots.mjs with the level stored where the Settings
// picker stores it, so each frame's world was built under that level (the light world, the terrain tier and the grass are
// read at build). The desktop levels are shot on a retina 1280 x 720 display (deviceScaleFactor 2: the raster caps bite),
// the phone levels on an 844 x 390 phone at 3x held for battle (tier=mobile). Each frame becomes one 1280 x 720 WebP (the
// phone's centred 16:9 cut), shown at 640 x 360 CSS pixels: 1:1 on a retina panel.
//
//   node tools/with-capture-lock.mjs --lock-class=render -- node tools/quality-previews.mjs --dist=<built dist> --work=<dir>
//   node tools/quality-previews.mjs --publish --work=<dir>     (encode the shot frames and write the manifest)
//
// Output: public/media/settings-r2/quality-<preset>.webp and manifest.json (each file's bytes and SHA-256, the level's
// preset levers from engine/quality.ts, the device and the shot receipt), read by src/ui/settings.ts.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOBILE_PRESET_ORDER, PRESETS, PRESET_ORDER } from '../src/engine/quality.ts';
import { webpVersion } from './webp-codec.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PREVIEW_DIR = 'public/media/settings-r2';
export const PREVIEW_W = 1280, PREVIEW_H = 720;
const QUALITY = 80;
const MAP = 'verdant', POSE = 'chase';

/** Every level the Settings picker offers, with the display it is shot on. */
export const PREVIEW_LEVELS = Object.freeze([
  ...PRESET_ORDER.map((preset) => ({ preset, device: 'preview-desktop' })),
  ...MOBILE_PRESET_ORDER.map((preset) => ({ preset, device: 'preview-phone' })),
]);

/** A level's published file (repo-relative) and its URL. */
export const previewFile = (preset) => `${PREVIEW_DIR}/quality-${preset}.webp`;

function parse(argv) {
  const out = { dist: null, work: null, publish: false };
  for (const arg of argv) {
    if (arg === '--publish') out.publish = true;
    else if (arg.startsWith('--dist=')) out.dist = path.resolve(arg.slice(7));
    else if (arg.startsWith('--work=')) out.work = path.resolve(arg.slice(7));
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!out.work) throw new Error('--work=<dir> is required');
  if (!out.publish && !out.dist) throw new Error('--dist=<built dist> is required to shoot');
  return out;
}

function shoot({ dist, work }) {
  mkdirSync(work, { recursive: true });
  const jobs = PREVIEW_LEVELS.map(({ preset, device }) => ({
    name: `quality-${preset}`, dist, device, preset, maps: [MAP], poses: [POSE], variants: ['base'],
  }));
  const jobsFile = path.join(work, 'jobs.json');
  writeFileSync(jobsFile, `${JSON.stringify(jobs, null, 1)}\n`);
  execFileSync(process.execPath, [path.join(ROOT, 'tools/ground-surface-shots.mjs'), `--out=${work}`, `--jobs=${jobsFile}`, '--tag=previews'],
    { stdio: 'inherit', cwd: ROOT });
}

/** The PNG's size (its IHDR). */
function pngSize(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function publish({ work }) {
  mkdirSync(path.join(ROOT, PREVIEW_DIR), { recursive: true });
  const items = [];
  for (const { preset, device } of PREVIEW_LEVELS) {
    const job = path.join(work, `quality-${preset}`);
    const frame = path.join(job, 'frames', `${MAP}-${POSE}-base.png`);
    if (!existsSync(frame)) throw new Error(`${preset}: no frame at ${frame}`);
    const receipt = JSON.parse(readFileSync(path.join(job, 'manifest-previews.json'), 'utf8'));
    const shot = receipt.maps?.[MAP];
    if (!shot || shot.errors?.length) throw new Error(`${preset}: the shot recorded errors ${JSON.stringify(shot?.errors)}`);
    if (shot.preset && shot.preset !== preset) throw new Error(`${preset}: the page ran ${shot.preset}`);
    const { width, height } = pngSize(readFileSync(frame));
    // the centred 16:9 cut (the phone's landscape frame is wider than 16:9), then one resample to the preview size
    const cutW = Math.min(width, Math.round(height * 16 / 9)), cutH = Math.round(cutW * 9 / 16);
    const x = Math.floor((width - cutW) / 2), y = Math.floor((height - cutH) / 2);
    const file = previewFile(preset);
    execFileSync('cwebp', ['-quiet', '-metadata', 'none', '-q', String(QUALITY), '-sharp_yuv', '-m', '6',
      '-crop', String(x), String(y), String(cutW), String(cutH), '-resize', String(PREVIEW_W), String(PREVIEW_H),
      frame, '-o', path.join(ROOT, file)]);
    const bytes = readFileSync(path.join(ROOT, file));
    const { label, ...levers } = PRESETS[preset];
    items.push({
      id: `quality-${preset}`, preset, label, device, file: path.basename(file), src: `/${file.replace(/^public\//, '')}`,
      width: PREVIEW_W, height: PREVIEW_H, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
      frame: { width, height, cut: [x, y, cutW, cutH] }, settings: levers,
      shot: { resolved: shot.poses?.[POSE]?.resolved ?? null, groundSettled: shot.poses?.[POSE]?.shots?.groundSettled ?? null },
    });
    console.log(`${file}: ${bytes.length} B (${preset}, ${device}, cut ${cutW}x${cutH} of ${width}x${height})`);
  }
  const manifest = {
    libraryId: 'claude-of-tanks-settings-r2', schemaVersion: 1,
    author: 'Kevin B. Liu', copyright: 'Copyright © 2026 Kevin B. Liu', license: 'LicenseRef-Claude-of-Tanks-Proprietary-Content-1.0',
    description: 'The Settings screen\'s graphics-quality previews: one frame per level on both ladders, the engine\'s own render '
      + `of the pinned ${MAP} battle at the chase camera, each level's world built under it; desktop levels on a 1280 x 720 `
      + 'retina display (2x), phone levels on an 844 x 390 phone (3x, tier=mobile, its centred 16:9 cut); '
      + `published at ${PREVIEW_W} x ${PREVIEW_H}, shown at 640 x 360 CSS pixels.`,
    generatedBy: 'tools/quality-previews.mjs (tools/ground-surface-shots.mjs, then cwebp)',
    encoder: `${webpVersion()} -q ${QUALITY} -sharp_yuv -m 6`,
    capture: { map: MAP, pose: POSE },
    count: items.length, items,
  };
  writeFileSync(path.join(ROOT, PREVIEW_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
  console.log(`wrote ${PREVIEW_DIR}/manifest.json (${items.length} previews)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const options = parse(process.argv.slice(2));
  if (options.publish) publish(options);
  else { shoot(options); publish(options); }
}
