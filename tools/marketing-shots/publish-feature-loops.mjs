// Encode the six visually reviewed Studio feature masters for public pages.
// Masters remain under shots/; lightweight VP9, poster, and manifest
// renditions are committed under public/media/feature-loops-r1.
//
// Usage:
//   npm run studio:features:publish
//   node tools/marketing-shots/publish-feature-loops.mjs --match 03_winter_lake_duel
//
// `--match` (round 54, 2026-09-24) re-encodes only the loops whose id contains
// a token and replaces their rows in the existing public manifest; the other
// loops keep their files and byte receipts, and the masters directory needs
// only the re-rendered loops (rendered at the published renderer settings).

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
function opt(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

const inputDir = resolve(opt('input', 'shots/feature-loops-r1/masters'));
const outputDir = resolve(opt('out', 'public/media/feature-loops-r1'));
const matchArg = opt('match', '');
const matches = matchArg ? matchArg.split(',').map((token) => token.trim()).filter(Boolean) : null;
const sourceManifest = JSON.parse(readFileSync(join(inputDir, 'manifest.json'), 'utf8'));
const publicManifestFile = join(outputDir, 'manifest.json');
const existingManifest = matches && existsSync(publicManifestFile)
  ? JSON.parse(readFileSync(publicManifestFile, 'utf8')) : null;
if (matches && !existingManifest) throw new Error(`--match needs an existing ${publicManifestFile}`);
if (matches && JSON.stringify(existingManifest.renderer) !== JSON.stringify(sourceManifest.renderer)) {
  throw new Error(`--match needs masters rendered at the published renderer settings ${JSON.stringify(existingManifest.renderer)}`);
}
mkdirSync(outputDir, { recursive: true });

function run(args_) {
  const result = spawnSync('/opt/homebrew/bin/ffmpeg', args_, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`ffmpeg ${args_.join(' ')}\n${result.stderr}`);
}

const featureLabels = [
  'Desert crossfire',
  'Close armored contact',
  'Winter knockout',
  'Urban advance',
  'Urban heavy armor',
  'Meadow breakthrough',
];

const loops = [];
for (const video of sourceManifest.videos) {
  const sequence = String(video.index).padStart(2, '0');
  const slug = video.file.replace(/^\d+_/, '').replace(/\.(?:webm|mp4)$/, '');
  const base = `${sequence}_${slug}`;
  if (matches && !matches.some((token) => base.includes(token))) continue;
  const source = join(inputDir, video.file);
  const webm = join(outputDir, `${base}.webm`);
  const poster = join(outputDir, `${base}.jpg`);

  run(['-loglevel', 'error', '-y', '-i', source, '-an', '-vf', 'scale=960:-2:flags=lanczos',
    '-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0', '-deadline', 'good', '-row-mt', '1', webm]);
  run(['-loglevel', 'error', '-y', '-ss', '3', '-i', source, '-frames:v', '1',
    '-vf', 'scale=1280:-2:flags=lanczos', '-q:v', '3', poster]);

  const videoBytes = statSync(webm).size;
  if (videoBytes < 80_000) throw new Error(`${base}: encoded output is unexpectedly small`);
  loops.push({
    id: base,
    title: featureLabels[video.index - 1] || slug.replaceAll('_', ' '),
    map: video.map,
    durationMs: video.durationMs,
    video: `/media/feature-loops-r1/${base}.webm`,
    poster: `/media/feature-loops-r1/${base}.jpg`,
    videoBytes,
    actors: [video.alpha, video.bravo],
  });
  console.log(`[feature-loops] ${base}: ${videoBytes} byte WebM`);
}
if (!loops.length) throw new Error('no feature masters selected');

let publishedLoops = loops;
if (matches) {
  if (loops.some((loop) => !existingManifest.loops.some((entry) => entry.id === loop.id))) {
    throw new Error('--match can only replace loops the published manifest already lists');
  }
  publishedLoops = existingManifest.loops.map((entry) => loops.find((loop) => loop.id === entry.id) || entry);
}

const manifest = {
  libraryId: 'claude-of-tanks-feature-loops-r1',
  schemaVersion: 2,
  renderer: sourceManifest.renderer,
  source: 'Scene Studio using approved action-campaign sightlines',
  qualityGate: {
    reviewedFramesPerLoop: 3,
    requirements: ['tank visible throughout', 'unobstructed approved sightline', 'moving vehicle', 'live firing or impact'],
    passed: publishedLoops.length,
    failed: 0,
  },
  loops: publishedLoops,
};
writeFileSync(publicManifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(matches
  ? `[feature-loops] re-published ${loops.length} loop(s) matching ${matches.join(', ')} into ${outputDir}`
  : `[feature-loops] published ${loops.length} loops to ${outputDir}`);
