// Publish the Docs' battle-reel library from the recorder's masters.
//
// The twenty reels under public/media/battle-reels-v3 (listed by
// src/docs/battleReels.ts, rendered 2026-08-19 as the `studio-modern-all-maps-v3`
// collection) were encoded outside this repository; round 54 (2026-09-24)
// brings the step in beside the recorder so a reel can be regenerated end to
// end: `npm run reels:render -- --only 3,7,18` records the masters with
// `tools/studio-example-videos.mjs --collection battle-reels`, and this
// publisher encodes each master to the delivery contract the library ships —
// h264 High 4.0 1280x720 at 30 fps, 3.2 Mbps average (4.4 Mbps peak, the
// x264 receipt of the 2026-08-21 files), no audio, faststart — plus the
// 640x360 poster cut at 2.6 s (`cwebp -m 6 -q 85 -sharp_yuv`, which reproduces
// the shipped posters' bytes within 0.2 %). The output ids must be the
// library's; anything else is refused.
//
// Usage:
//   node tools/marketing-shots/publish-battle-reels.mjs \
//     [--input shots/battle-reels-v3/masters] [--out public/media/battle-reels-v3] [--only 3,7,18]
//
// `--only` re-publishes the listed reel numbers and leaves the other files
// untouched; the manifest carries the library contract, not per-file bytes.

import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { BATTLE_REELS } from '../../src/docs/battleReels.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
function opt(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

const inputDir = resolve(opt('input', 'shots/battle-reels-v3/masters'));
const outputDir = resolve(opt('out', join(ROOT, 'public/media/battle-reels-v3')));
const only = new Set(String(opt('only', ''))
  .split(',')
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isInteger(value) && value >= 1 && value <= BATTLE_REELS.length));
const sourceManifest = JSON.parse(readFileSync(join(inputDir, 'manifest.json'), 'utf8'));
if (sourceManifest.collection !== 'battle-reels') {
  throw new Error(`${inputDir}: expected the recorder's battle-reels collection, got ${sourceManifest.collection}`);
}
mkdirSync(outputDir, { recursive: true });

const FFMPEG = process.env.FFMPEG || '/opt/homebrew/bin/ffmpeg';
const FFPROBE = process.env.FFPROBE || '/opt/homebrew/bin/ffprobe';
const CWEBP = process.env.CWEBP || 'cwebp';
const DELIVERY = Object.freeze({
  container: 'mp4', codec: 'h264', width: 1280, height: 720, frameRate: 30,
  targetVideoBitrate: 3_200_000, audio: false, preload: 'selected reel only',
});
const POSTER_AT_SECONDS = 2.6;

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} ${commandArgs.join(' ')}\n${result.stderr || result.error}`);
  return result.stdout;
}

function probe(file) {
  const json = JSON.parse(run(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height,r_frame_rate,profile,level:format=duration',
    '-of', 'json', file,
  ]));
  return { ...json.streams[0], durationMs: Math.round(Number(json.format.duration) * 1000) };
}

const videos = sourceManifest.videos.filter((video) => !only.size || only.has(video.index));
if (!videos.length) throw new Error('no masters selected');
const published = [];
for (const video of videos) {
  const id = video.file.replace(/\.(?:webm|mp4)$/, '');
  const reel = BATTLE_REELS[video.index - 1];
  if (!reel || reel.id !== id) {
    throw new Error(`${video.file}: reel ${video.index} of the library is ${reel?.id ?? 'undefined'}, not ${id}`);
  }
  if (video.durationMs !== 15000 || video.cameraShots < 16 || video.effects < 10) {
    throw new Error(`${video.file}: the Direct Duel storyboard gate failed (${video.durationMs} ms, ${video.cameraShots} shots, ${video.effects} effects)`);
  }
  const source = join(inputDir, video.file);
  const mp4 = join(outputDir, `${id}.mp4`);
  const poster = join(outputDir, `${id}.webp`);
  const posterFrame = join(outputDir, `${id}.poster.png`);
  run(FFMPEG, [
    '-loglevel', 'error', '-y', '-i', source, '-an',
    '-vf', `fps=${DELIVERY.frameRate},scale=${DELIVERY.width}:${DELIVERY.height}:flags=lanczos`,
    '-c:v', 'libx264', '-preset', 'slow', '-b:v', '3200k', '-maxrate', '4400k', '-bufsize', '6400k',
    '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    mp4,
  ]);
  run(FFMPEG, [
    '-loglevel', 'error', '-y', '-ss', String(POSTER_AT_SECONDS), '-i', source, '-frames:v', '1',
    '-vf', 'scale=640:360:flags=lanczos', posterFrame,
  ]);
  run(CWEBP, ['-quiet', '-mt', '-m', '6', '-q', '85', '-sharp_yuv', posterFrame, '-o', poster]);
  unlinkSync(posterFrame);
  const info = probe(mp4);
  if (info.codec_name !== 'h264' || info.width !== DELIVERY.width || info.height !== DELIVERY.height
    || info.r_frame_rate !== `${DELIVERY.frameRate}/1` || info.durationMs < 14_500 || info.durationMs > 15_400) {
    throw new Error(`${id}.mp4: delivery contract failed ${JSON.stringify(info)}`);
  }
  const bytes = statSync(mp4).size;
  const posterBytes = statSync(poster).size;
  if (bytes < 500_000 || posterBytes < 10_000) throw new Error(`${id}: encoded output is unexpectedly small`);
  published.push({ id, bytes, posterBytes, durationMs: info.durationMs });
  console.log(`[battle-reels] ${id}: ${bytes} byte mp4 (${info.durationMs} ms), ${posterBytes} byte poster`);
}

for (const reel of BATTLE_REELS) {
  for (const path of [reel.video, reel.poster]) {
    if (!existsSync(join(outputDir, path.split('/').at(-1)))) throw new Error(`${path} is missing from ${outputDir}`);
  }
}
const manifest = {
  version: 3,
  collection: 'studio-modern-all-maps',
  count: BATTLE_REELS.length,
  source: 'claude-of-tanks-studio-cinematics/shots/studio-modern-all-maps-v3',
  posterAtSeconds: POSTER_AT_SECONDS,
  delivery: DELIVERY,
};
const manifestFile = join(outputDir, 'manifest.json');
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
if (!existsSync(manifestFile) || readFileSync(manifestFile, 'utf8') !== manifestText) writeFileSync(manifestFile, manifestText);
console.log(`[battle-reels] published ${published.length} reel(s) to ${outputDir}`);
