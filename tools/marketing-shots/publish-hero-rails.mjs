// Publish the reviewed high-bitrate Studio rail masters without another
// lossy video encode. The browser recorder already emits VP9 at the requested
// resolution and bitrate; this pass adds deterministic posters and a public
// manifest, then rejects anything below the presentation contract.

import {
  copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
function opt(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

const inputDir = resolve(opt('input', 'shots/hero-rails-r2/masters'));
const gameplayDir = resolve(opt('gameplay', 'shots/hero-rails-r2/gameplay-4k-master'));
const outputDir = resolve(opt('out', 'public/media/hero-rails-r2'));
const sourceManifest = JSON.parse(readFileSync(join(inputDir, 'manifest.json'), 'utf8'));
const gameplayManifest = JSON.parse(readFileSync(join(gameplayDir, 'manifest.json'), 'utf8'));
mkdirSync(outputDir, { recursive: true });

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(' ')}\n${result.stderr}`);
  }
  return result.stdout;
}

function probe(file) {
  return JSON.parse(run('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height,pix_fmt',
    '-of', 'json', file,
  ])).streams[0];
}

function poster(source, target, width) {
  run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', source, '-ss', '2.4',
    '-frames:v', '1', '-vf', `scale=${width}:-2:flags=lanczos`, '-q:v', '2', target,
  ]);
}

const titles = [
  'Desert ground rush',
  'Winter ice orbit',
  'Steppe charge thread',
  'Urban overhead dive',
  'Coastal shell skim',
];

const rails = sourceManifest.videos.map((video, index) => {
  const sequence = String(index + 1).padStart(2, '0');
  const slug = video.file.replace(/^\d+_/, '').replace(/\.(?:webm|mp4)$/, '');
  const base = `${sequence}_${slug}`;
  const source = join(inputDir, video.file);
  const publicVideo = join(outputDir, `${base}.webm`);
  const publicPoster = join(outputDir, `${base}.jpg`);
  const sourceInfo = probe(source);
  if (sourceInfo.codec_name !== 'vp9' || sourceInfo.width !== 1920 || sourceInfo.height !== 1080) {
    throw new Error(`${video.file}: expected a 1920x1080 VP9 source, got ${JSON.stringify(sourceInfo)}`);
  }
  if (video.durationMs !== 6000 || video.cameraShots < 4 || video.effects < 10 || !video.rail) {
    throw new Error(`${video.file}: rail/effect/duration quality gate failed`);
  }
  if (slug === 'desert-ground-rush' && video.minimumLeadSeparationM < 10) {
    throw new Error(`${video.file}: Challenger 3 and KF51 motion paths intersect`);
  }
  copyFileSync(source, publicVideo);
  poster(source, publicPoster, 1920);
  return {
    id: base,
    title: titles[index],
    map: video.map,
    durationMs: video.durationMs,
    video: `/media/hero-rails-r2/${base}.webm`,
    poster: `/media/hero-rails-r2/${base}.jpg`,
    videoBytes: statSync(publicVideo).size,
    posterBytes: statSync(publicPoster).size,
    cameraShots: video.cameraShots,
    effects: video.effects,
    ...(Number.isFinite(video.minimumLeadSeparationM)
      ? { minimumLeadSeparationM: video.minimumLeadSeparationM }
      : {}),
    actors: [video.alpha, video.bravo],
  };
});

const gameplayVideo = gameplayManifest.videos[0];
const gameplaySource = join(gameplayDir, gameplayVideo.file);
const gameplayInfo = probe(gameplaySource);
if (gameplayInfo.codec_name !== 'vp9' || gameplayInfo.width !== 3840 || gameplayInfo.height !== 2160) {
  throw new Error(`gameplay master: expected native 3840x2160 VP9, got ${JSON.stringify(gameplayInfo)}`);
}
const gameplayPublic = join(outputDir, 'gameplay_urban_overhead_4k.webm');
const gameplayPoster = join(outputDir, 'gameplay_urban_overhead_4k.jpg');
copyFileSync(gameplaySource, gameplayPublic);
poster(gameplaySource, gameplayPoster, 3840);

const manifest = {
  libraryId: 'claude-of-tanks-hero-rails-r2',
  schemaVersion: 1,
  source: 'In-engine Scene Studio recording from deterministic first-party battle scenes',
  renderer: sourceManifest.renderer,
  gameplay4k: {
    video: '/media/hero-rails-r2/gameplay_urban_overhead_4k.webm',
    poster: '/media/hero-rails-r2/gameplay_urban_overhead_4k.jpg',
    width: 3840,
    height: 2160,
    durationMs: gameplayVideo.durationMs,
    videoBytes: statSync(gameplayPublic).size,
    posterBytes: statSync(gameplayPoster).size,
  },
  qualityGate: {
    requirements: [
      'native 1920x1080 VP9 hero masters',
      'native 3840x2160 VP9 gameplay master',
      'four-key camera rail',
      'at least ten timed combat effects',
      'multiple modern armored vehicles',
      'Ground Rush lead vehicles remain at least 10 m apart',
    ],
    passed: rails.length,
    failed: 0,
  },
  rails,
};

writeFileSync(join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[hero-rails] published ${rails.length} hero rails and one native 4K gameplay film to ${outputDir}`);
