// Publish the reviewed high-bitrate Studio rail masters without another
// lossy video encode. The browser recorder already emits VP9 at the requested
// resolution and bitrate; this pass adds deterministic posters and a public
// manifest, then rejects anything below the presentation contract.
//
// Usage:
//   node tools/marketing-shots/publish-hero-rails.mjs
//   node tools/marketing-shots/publish-hero-rails.mjs --match winter-ice-orbit,steppe-charge-thread
//
// `--match` (round 54, 2026-09-24) re-publishes only the rails whose slug
// contains a token: their entries replace the matching rows of the existing
// public manifest, the other rails and the 4K gameplay film keep their files
// and receipts, and the masters directory needs only the re-rendered rails.
// Every published rail also derives its landing-page mobile proxy
// (public/media/web-video-r1: h264 960x540 at 24 fps, crf 29 — the x264
// receipt of the 2026-08-21 proxies) from the published WebM and updates the
// proxy's byte receipt in place, so the proxy cannot drift from the film it
// stands in for.

import {
  copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync,
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
const mobileDir = resolve(opt('mobile', 'public/media/web-video-r1'));
const matchArg = opt('match', '');
const matches = matchArg ? matchArg.split(',').map((token) => token.trim()).filter(Boolean) : null;
const sourceManifest = JSON.parse(readFileSync(join(inputDir, 'manifest.json'), 'utf8'));
const publicManifestFile = join(outputDir, 'manifest.json');
const existingManifest = existsSync(publicManifestFile)
  ? JSON.parse(readFileSync(publicManifestFile, 'utf8')) : null;
if (matches && !existingManifest) throw new Error(`--match needs an existing ${publicManifestFile}`);
if (matches && JSON.stringify(existingManifest.renderer) !== JSON.stringify(sourceManifest.renderer)) {
  throw new Error(`--match needs masters rendered at the published renderer settings ${JSON.stringify(existingManifest.renderer)}`);
}
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

// The landing page's lightweight proxy of a rail, derived from the published
// WebM; its row in the web-video-r1 manifest names the rail as its source.
function publishMobileProxy(publicPath, publicVideo) {
  const manifestFile = join(mobileDir, 'manifest.json');
  const manifestText = readFileSync(manifestFile, 'utf8');
  const manifest = JSON.parse(manifestText);
  const entry = manifest.files.find((file) => file.source === publicPath);
  if (!entry) throw new Error(`${manifestFile}: no mobile proxy lists ${publicPath} as its source`);
  const target = join(mobileDir, entry.path);
  run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', publicVideo, '-an',
    '-vf', `fps=${manifest.encoding.framesPerSecond},scale=${manifest.encoding.width}:${manifest.encoding.height}:flags=lanczos`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '29',
    '-profile:v', 'high', '-level', '3.1', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    target,
  ]);
  const bytes = statSync(target).size;
  const row = new RegExp(`("path": "${entry.path.replace(/\./g, '\\.')}", "bytes": )\\d+`);
  if (!row.test(manifestText)) throw new Error(`${manifestFile}: cannot re-pin ${entry.path}`);
  writeFileSync(manifestFile, manifestText.replace(row, `$1${bytes}`));
  return { path: entry.path, bytes };
}

const titles = [
  'Desert ground rush',
  'Winter ice orbit',
  'Steppe charge thread',
  'Urban overhead dive',
  'Coastal shell skim',
];

const slugOf = (file) => file.replace(/^\d+_/, '').replace(/\.(?:webm|mp4)$/, '');
const selected = sourceManifest.videos.filter((video) => !matches || matches.some((token) => slugOf(video.file).includes(token)));
if (!selected.length) throw new Error('no rail masters selected');
const proxies = [];
const rails = selected.map((video) => {
  const sequence = String(video.index).padStart(2, '0');
  const slug = slugOf(video.file);
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
  proxies.push(publishMobileProxy(`/media/hero-rails-r2/${base}.webm`, publicVideo));
  return {
    id: base,
    title: titles[video.index - 1],
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

let gameplay4k;
if (matches) {
  gameplay4k = existingManifest.gameplay4k;
} else {
  const gameplayManifest = JSON.parse(readFileSync(join(gameplayDir, 'manifest.json'), 'utf8'));
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
  gameplay4k = {
    video: '/media/hero-rails-r2/gameplay_urban_overhead_4k.webm',
    poster: '/media/hero-rails-r2/gameplay_urban_overhead_4k.jpg',
    width: 3840,
    height: 2160,
    durationMs: gameplayVideo.durationMs,
    videoBytes: statSync(gameplayPublic).size,
    posterBytes: statSync(gameplayPoster).size,
  };
}

const publishedRails = matches
  ? existingManifest.rails.map((rail) => rails.find((entry) => entry.id === rail.id) || rail)
  : rails;
if (matches && rails.some((entry) => !existingManifest.rails.some((rail) => rail.id === entry.id))) {
  throw new Error('--match can only replace rails the published manifest already lists');
}

const manifest = {
  libraryId: 'claude-of-tanks-hero-rails-r2',
  schemaVersion: 1,
  source: 'In-engine Scene Studio recording from deterministic first-party battle scenes',
  renderer: sourceManifest.renderer,
  gameplay4k,
  qualityGate: {
    requirements: [
      'native 1920x1080 VP9 hero masters',
      'native 3840x2160 VP9 gameplay master',
      'four-key camera rail',
      'at least ten timed combat effects',
      'multiple modern armored vehicles',
      'Ground Rush lead vehicles remain at least 10 m apart',
    ],
    passed: publishedRails.length,
    failed: 0,
  },
  rails: publishedRails,
};

writeFileSync(publicManifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
for (const proxy of proxies) console.log(`[hero-rails] mobile proxy ${proxy.path}: ${proxy.bytes} bytes`);
console.log(matches
  ? `[hero-rails] re-published ${rails.length} rail(s) matching ${matches.join(', ')} into ${outputDir}`
  : `[hero-rails] published ${rails.length} hero rails and one native 4K gameplay film to ${outputDir}`);
