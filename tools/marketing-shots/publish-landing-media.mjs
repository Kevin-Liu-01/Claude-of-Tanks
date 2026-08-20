// Publish the landing page's curated still, rail, mosaic, and Studio media contract.
//
// The existing action, foreground, and hero-rail files remain owned by their
// source libraries. This publisher only encodes the landing-specific Studio
// loop and writes a manifest that prevents accidental reuse or omission.
//
// Usage:
//   node tools/marketing-shots/publish-landing-media.mjs


import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
function opt(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

const sourceDir = resolve(opt('input', 'shots/studio-action-loop-r2'));
const outputDir = resolve(opt('out', 'public/media/landing-r1'));
const sourceManifest = JSON.parse(readFileSync(join(sourceDir, 'manifest.json'), 'utf8'));
const promoManifest = JSON.parse(readFileSync(resolve('public/media/promo-v13/manifest.json'), 'utf8'));
const sourceVideo = join(sourceDir, sourceManifest.master);
const studioVideo = join(outputDir, 'studio-leclerc-knockout.mp4');
const studioPoster = join(outputDir, 'studio-leclerc-knockout.jpg');
const gameplayMaster = resolve('public/media/hero-rails-r2/gameplay_urban_overhead_4k.webm');
const gameplayPoster = '/media/hero-rails-r2/gameplay_urban_overhead_4k.jpg';
const gameplayVideo = join(outputDir, 'gameplay-urban-overhead-1080.mp4');
mkdirSync(outputDir, { recursive: true });

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

ffmpeg([
  '-loglevel', 'error', '-y', '-i', gameplayMaster, '-an',
  '-vf', 'fps=30,scale=1920:1080:flags=lanczos',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-profile:v', 'high', '-level', '4.1',
  '-pix_fmt', 'yuv420p', '-g', '60', '-keyint_min', '60', '-movflags', '+faststart',
  gameplayVideo,
]);

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

const hero = [
  { id: 'og-t90-column', title: 'T-90 column fire', src: '/media/featured/f7_studio_t90_column_fire.webp', collection: 'handmade' },
  { id: 'leopard-urban-hero', title: 'Leopard 2A6 urban advance', src: '/media/presentation-r1/13_urban_hero_leo2a6.webp', collection: 'handmade' },
  { id: 'desert-armored-contact', title: 'Desert armored contact', src: '/media/showcase-r1/62_action_desert_ram_abramsx_t90m.webp', collection: 'action' },
  { id: 'urban-overwatch', title: 'Urban overwatch', src: '/media/showcase-r1/103_foreground_urban_overwatch_church.webp', collection: 'foreground' },
  { id: 'verdant-column-fire', title: 'Verdant column under fire', src: '/media/showcase-r1/87_action_verdant_column_massacre.webp', collection: 'action' },
  { id: 'winter-ice-breaker', title: 'Winter ice breaker', src: '/media/showcase-r1/113_foreground_winter_ice_breaker.webp', collection: 'foreground' },
];

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

const mosaic = [
  '61_action_desert_duel_leclerc_kill',
  '63_action_desert_overwatch_line',
  '67_action_winter_lake_duel',
  '69_action_winter_village_brawl',
  '71_action_urban_street_duel',
  '74_action_urban_ruin_brawl',
  '76_action_verdant_field_duel',
  '78_action_verdant_village_brawl',
  '80_action_desert_wadi_gauntlet',
  '84_action_steppe_horizon_charge',
  '86_action_coastal_harbor_kill',
  '89_action_coastal_beach_storm',
  '93_foreground_desert_overwatch_line',
  '95_foreground_coastal_dune_ambush',
  '97_foreground_winter_lake_duel',
  '99_foreground_winter_village_brawl',
  '101_foreground_urban_street_duel',
  '104_foreground_urban_ruin_brawl',
  '106_foreground_verdant_field_duel',
  '109_foreground_verdant_hero_challenger1',
  '111_foreground_steppe_windbreak_snipe',
  '115_foreground_urban_alley_flash',
  '118_foreground_verdant_meadow_duel',
  '120_foreground_verdant_overwatch_ridge',
].map((id) => ({
  id,
  title: id.replace(/^\d+_(?:action|foreground)_/, '').replaceAll('_', ' '),
  collection: id.includes('_action_') ? 'action' : 'foreground',
  src: `/media/showcase-r1/${id}.webp`,
}));

const manifest = {
  libraryId: 'claude-of-tanks-landing-r1',
  schemaVersion: 1,
  source: 'Owner-directed selection from first-party Scene Studio and marketing-shot libraries',
  hero,
  featureReel,
  gameplay: {
    master: '/media/hero-rails-r2/gameplay_urban_overhead_4k.webm',
    video: '/media/landing-r1/gameplay-urban-overhead-1080.mp4',
    poster: gameplayPoster,
    width: 1920,
    height: 1080,
    fps: 30,
    durationMs: durationMs(gameplayVideo),
    videoBytes: statSync(gameplayVideo).size,
  },
  relocatedRails,
  winterDestructionRail: '/media/hero-rails-r2/02_winter-ice-orbit.webm',
  mosaic,
  studio: {
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
  },
};

writeFileSync(join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[landing-media] Gameplay proxy: ${manifest.gameplay.videoBytes} bytes at 1920x1080/30`);
console.log(`[landing-media] Studio video: ${manifest.studio.videoBytes} bytes`);
console.log(`[landing-media] Studio poster: ${manifest.studio.posterBytes} bytes`);
console.log(`[landing-media] ${hero.length} hero stills, one relocated feature reel, ${relocatedRails.length} rail films, ${mosaic.length} mosaic frames`);
