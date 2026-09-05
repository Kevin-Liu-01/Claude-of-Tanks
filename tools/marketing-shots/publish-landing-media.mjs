// Publish the landing page's curated still, rail, mosaic, and Studio media contract.
//
// The existing action, foreground, and hero-rail files remain owned by their
// source libraries. This publisher only encodes the landing-specific Studio
// loop and writes a manifest that prevents accidental reuse or omission.
//
// Usage:
//   node tools/marketing-shots/publish-landing-media.mjs


import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
function opt(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

const sourceDir = resolve(opt('input', 'shots/studio-action-loop-r2'));
const outputDir = resolve(opt('out', 'public/media/landing-r1'));
const sourceManifestFile = join(sourceDir, 'manifest.json');
const sourceManifest = existsSync(sourceManifestFile)
  ? JSON.parse(readFileSync(sourceManifestFile, 'utf8'))
  : null;
const promoManifest = JSON.parse(readFileSync(resolve('public/media/promo-v13/manifest.json'), 'utf8'));
const showcaseManifest = JSON.parse(readFileSync(resolve('public/media/showcase-r2/manifest.json'), 'utf8'));
const studioVideo = join(outputDir, 'studio-leclerc-knockout.mp4');
const studioPoster = join(outputDir, 'studio-leclerc-knockout.jpg');
mkdirSync(outputDir, { recursive: true });
const existingManifestFile = join(outputDir, 'manifest.json');
const existingStudio = existsSync(existingManifestFile)
  ? JSON.parse(readFileSync(existingManifestFile, 'utf8')).studio
  : null;

function ffmpeg(input) {
  const result = spawnSync('/opt/homebrew/bin/ffmpeg', input, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`ffmpeg ${input.join(' ')}\n${result.stderr}`);
}

function durationMs(file) {
  const result = spawnSync('/opt/homebrew/bin/ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file,
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`ffprobe ${file}\n${result.stderr}`);
  return Math.round(Number.parseFloat(result.stdout) * 1000);
}

if (sourceManifest) {
  const sourceVideo = join(sourceDir, sourceManifest.master);
  ffmpeg([
    '-loglevel', 'error', '-y', '-i', sourceVideo, '-an',
    '-vf', 'fps=30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21',
    '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p',
    '-g', '60', '-keyint_min', '60', '-movflags', '+faststart',
    studioVideo,
  ]);
  ffmpeg([
    '-loglevel', 'error', '-y', '-ss', '4.15', '-i', sourceVideo, '-frames:v', '1',
    '-vf', 'scale=1920:-2:flags=lanczos', '-q:v', '2', studioPoster,
  ]);
}

const shotById = new Map(showcaseManifest.shots.map((shot) => [shot.id, shot]));
function selectShot(id) {
  const shot = shotById.get(id);
  if (!shot) throw new Error(`Missing R2 showcase shot: ${id}`);
  return { id: shot.id, title: shot.title, src: shot.src, collection: shot.kind };
}

const hero = [
  '31_battle_steinburg',
  '29_battle_sirocco',
  '30_battle_frosthollow',
  '32_battle_verdant',
  '33_battle_saltmere',
  '40_battle_urban_hero',
].map(selectShot);

const relocatedRails = [
  { id: 'desert-ground-rush', title: 'Desert ground rush', video: '/media/hero-rails-r2/01_desert-ground-rush.webm', poster: '/media/hero-rails-r2/01_desert-ground-rush.jpg' },
  { id: 'steppe-charge-thread', title: 'Steppe charge thread', video: '/media/hero-rails-r2/03_steppe-charge-thread.webm', poster: '/media/hero-rails-r2/03_steppe-charge-thread.jpg' },
  { id: 'urban-overhead-dive', title: 'Urban overhead dive', video: '/media/hero-rails-r2/04_urban-overhead-dive.webm', poster: '/media/hero-rails-r2/04_urban-overhead-dive.jpg' },
  { id: 'coastal-shell-skim', title: 'Coastal shell skim', video: '/media/hero-rails-r2/05_coastal-shell-skim.webm', poster: '/media/hero-rails-r2/05_coastal-shell-skim.jpg' },
];

const featureReel = {
  video: promoManifest.assets.hero.file,
  poster: promoManifest.assets.hero.poster,
  width: promoManifest.width,
  height: promoManifest.height,
  durationMs: Math.round(promoManifest.durationSeconds * 1000),
  fps: promoManifest.fps,
};

const mosaic = showcaseManifest.shots
  .filter((shot) => shot.sequence >= 17 && shot.sequence <= 40)
  .map((shot) => ({ id: shot.id, title: shot.title, collection: shot.kind, src: shot.src }));
if (mosaic.length !== 24) throw new Error(`Expected 24 R2 mosaic shots, found ${mosaic.length}`);

const studio = sourceManifest ? {
  video: '/media/landing-r1/studio-leclerc-knockout.mp4',
  poster: '/media/landing-r1/studio-leclerc-knockout.jpg',
  width: sourceManifest.renderer.width,
  height: sourceManifest.renderer.height,
  durationMs: durationMs(studioVideo),
  videoBytes: statSync(studioVideo).size,
  posterBytes: statSync(studioPoster).size,
  captureMode: sourceManifest.captureMode,
  actors: sourceManifest.actors,
  effects: sourceManifest.effects,
} : existingStudio;
if (!studio) throw new Error('Studio source and existing landing Studio receipt are both unavailable');

const manifest = {
  libraryId: 'claude-of-tanks-landing-r2',
  schemaVersion: 1,
  source: 'Current R2 selection from first-party runtime captures and directed Scene Studio media',
  hero,
  featureReel,
  relocatedRails,
  winterDestructionRail: '/media/hero-rails-r2/02_winter-ice-orbit.webm',
  mosaic,
  studio,
};

writeFileSync(join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[landing-media] Studio video: ${manifest.studio.videoBytes} bytes`);
console.log(`[landing-media] Studio poster: ${manifest.studio.posterBytes} bytes`);
console.log(`[landing-media] ${hero.length} hero stills, one relocated feature reel, ${relocatedRails.length} rail films, ${mosaic.length} mosaic frames`);
