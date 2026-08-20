// Encode the six visually reviewed Studio feature masters for public pages.
// Masters remain under shots/; lightweight VP9, GIF, poster, and manifest
// renditions are committed under public/media/feature-loops-r1.

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
function opt(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

const inputDir = resolve(opt('input', 'shots/feature-loops-r1/masters'));
const outputDir = resolve(opt('out', 'public/media/feature-loops-r1'));
const sourceManifest = JSON.parse(readFileSync(join(inputDir, 'manifest.json'), 'utf8'));
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
for (const [index, video] of sourceManifest.videos.entries()) {
  const sequence = String(index + 1).padStart(2, '0');
  const slug = video.file.replace(/^\d+_/, '').replace(/\.(?:webm|mp4)$/, '');
  const base = `${sequence}_${slug}`;
  const source = join(inputDir, video.file);
  const webm = join(outputDir, `${base}.webm`);
  const gif = join(outputDir, `${base}.gif`);
  const poster = join(outputDir, `${base}.jpg`);

  run(['-loglevel', 'error', '-y', '-i', source, '-an', '-vf', 'scale=960:-2:flags=lanczos',
    '-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0', '-deadline', 'good', '-row-mt', '1', webm]);
  run(['-loglevel', 'error', '-y', '-i', source, '-vf',
    'fps=10,scale=720:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=192:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4',
    '-loop', '0', gif]);
  run(['-loglevel', 'error', '-y', '-ss', '3', '-i', source, '-frames:v', '1',
    '-vf', 'scale=1280:-2:flags=lanczos', '-q:v', '3', poster]);

  const gifBytes = statSync(gif).size;
  const videoBytes = statSync(webm).size;
  if (gifBytes < 150_000 || videoBytes < 80_000) throw new Error(`${base}: encoded output is unexpectedly small`);
  loops.push({
    id: base,
    title: featureLabels[index] || slug.replaceAll('_', ' '),
    map: video.map,
    durationMs: video.durationMs,
    gif: `/media/feature-loops-r1/${base}.gif`,
    video: `/media/feature-loops-r1/${base}.webm`,
    poster: `/media/feature-loops-r1/${base}.jpg`,
    gifBytes,
    videoBytes,
    actors: [video.alpha, video.bravo],
  });
  console.log(`[feature-loops] ${base}: ${gifBytes} byte GIF / ${videoBytes} byte WebM`);
}

const manifest = {
  libraryId: 'claude-of-tanks-feature-loops-r1',
  schemaVersion: 1,
  renderer: sourceManifest.renderer,
  source: 'Scene Studio using approved action-campaign sightlines',
  qualityGate: {
    reviewedFramesPerLoop: 3,
    requirements: ['tank visible throughout', 'unobstructed approved sightline', 'moving vehicle', 'live firing or impact'],
    passed: loops.length,
    failed: 0,
  },
  loops,
};
writeFileSync(join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[feature-loops] published ${loops.length} loops to ${outputDir}`);
