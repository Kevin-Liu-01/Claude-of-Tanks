#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { sourceDigest, verifyFile, digest } from './pipeline.mjs';
import { mergePublication } from './mergePublication.mjs';
import { requireCampaignReview, publicCampaignProvenance, assertPortablePublication, campaignCaptions, publishedPosterScene, publishedFilmScene, campaignWebProfile, campaignWebArguments, validateCampaignWebEncode } from './campaignPublication.mjs';

const help = 'node tools/media-production/publishCampaign.mjs --receipt=<campaign-receipt.json> --review=<review.json>\nPublishes hash-reviewed campaign output to public/media/director-r4; preserves existing map and film publication.';
if (process.argv.includes('--help')) { console.log(help); process.exit(0); }
const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const match = /^--(receipt|review)=(.+)$/.exec(value); if (!match) throw Error(help); return [match[1], match[2]];
}));
if (!args.receipt || !args.review) throw Error(help);
const receiptBytes = readFileSync(resolve(args.receipt)), receipt = JSON.parse(receiptBytes);
const review = JSON.parse(readFileSync(resolve(args.review))), currentDigest = sourceDigest();
for (const file of requireCampaignReview(receipt, receiptBytes, review, currentDigest)) verifyFile(file);
for (const input of receipt.inputs) {
  const bytes = readFileSync(input.receipt);
  if (digest(bytes) !== input.receiptSha256) throw Error('Source capture receipt changed');
  const source = JSON.parse(bytes);
  if (!source.finished || source.errors.length || source.maps.some(row => !row.complete) || source.sourceDigest !== currentDigest) throw Error('Source capture is not complete and current');
}
for (const file of receipt.toolFiles) verifyFile(file);
const prefix = '/media/director-r4', stage = mkdtempSync(join(tmpdir(), 'cot-campaign-publish-')), paths = [];
const webEncodes = [];
const publication = { version: 1, created: new Date().toISOString(), sourceDigest: currentDigest, revision: receipt.inputs[0].revision, shots: [], films: [], media: {}, recipes: {}, assets: [], review: publicCampaignProvenance(receipt, review).review };
function target(uri) { const path = join(stage, uri.slice(1)); mkdirSync(dirname(path), { recursive: true }); paths.push(uri); return path; }
function encode(args) { execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', ...args], { stdio: 'inherit' }); }
function copy(file, uri) { copyFileSync(file.path, target(uri)); return uri; }
function webp(input, uri, width, height) { execFileSync('cwebp', ['-quiet', '-m', '6', '-sharp_yuv', '-q', '90', '-resize', String(width), String(height), input.path, '-o', target(uri)]); return uri; }
function recipe(id, scene, uris) { publication.recipes[id] = scene; for (const uri of uris) publication.media[uri] = id; }
function movieProbe(path) { return JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path], { encoding: 'utf8' })); }
function webMovie(input, uri, mobile = false, audio = false) {
  const source = movieProbe(input.path), profile = campaignWebProfile(source, mobile, audio);
  const output = target(uri); encode(campaignWebArguments(input.path, output, profile));
  const bytes = readFileSync(output), result = validateCampaignWebEncode(movieProbe(output), profile, bytes.length);
  webEncodes.push({ src: uri, sourceSha256: input.sha256, sha256: digest(bytes), profile, result });
  return uri;
}

function publishScene(scene) {
  const input = receipt.inputs[scene.index], video = input.video, film = webMovie(video, `${prefix}/films/${scene.id}.mp4`);
  for (const format of ['landscape', 'portrait', 'square']) {
    const original = input.posters.find(file => file.format === format);
    const uri = webp(original, `${prefix}/stills/${scene.id}-${format}.webp`, original.width, original.height);
    const branded = receipt.outputs.find(file => file.kind === 'poster' && file.format === format && file.originalSha256 === original.sha256);
    if (!branded) throw Error(`Missing branded ${scene.id}/${format}`);
    const promo = copy(branded, `${prefix}/promo/${scene.id}-${format}.webp`);
    const cameraScene = publishedPosterScene(original, video);
    recipe(`director-${scene.id}-${format}`, cameraScene, [uri, promo]);
    if (format === 'landscape') {
      const preview = webp(original, `${prefix}/previews/${scene.id}.webp`, 1280, 720);
      const jpeg = `${prefix}/films/${scene.id}.jpg`; encode(['-i', original.path, '-vf', 'scale=1280:720', '-q:v', '2', target(jpeg)]);
      recipe(`director-${scene.id}-landscape`, cameraScene, [uri, preview, jpeg, promo]);
      publication.shots.push({ src: uri, previewSrc: preview, alt: `${scene.description} In-engine staged scene.`, title: scene.title, map: video.scene.map, feature: 'scene studio', kind: 'studio', effects: [video.timeOfDay, 'cinematic camera'], sequence: publication.shots.length + 1 });
    }
  }
  recipe(`director-film-${scene.id}`, publishedFilmScene(video), [film]);
  publication.films.push({ src: film, poster: `${prefix}/previews/${scene.id}.webp`, title: scene.title, map: video.scene.map, timeOfDay: video.timeOfDay, format: 'landscape', fps: video.fps, frames: video.frames, width: 1920, height: 1080, silent: true, staged: true });
}
function publishFilms() {
  const trailer = receipt.outputs.find(row => row.kind === 'trailer'), loop = receipt.outputs.find(row => row.kind === 'loop');
  webMovie(trailer, `${prefix}/hero-trailer.mp4`, false, true); webMovie(loop, `${prefix}/silent-loop.mp4`);
  for (const [file, name] of [[trailer, 'hero-trailer-mobile'], [loop, 'silent-loop-mobile']]) webMovie(file, `${prefix}/${name}.mp4`, true);
  const first = receipt.inputs[0].posters.find(file => file.format === 'landscape');
  for (const name of ['hero-trailer', 'silent-loop']) encode(['-i', first.path, '-vf', 'scale=1920:1080', '-q:v', '2', target(`${prefix}/${name}.jpg`)]);
  writeFileSync(target(`${prefix}/hero-trailer.vtt`), campaignCaptions(receipt.plan));
  publication.films.unshift({ src: `${prefix}/hero-trailer.mp4`, poster: `${prefix}/hero-trailer.jpg`, title: receipt.title, format: 'landscape', fps: receipt.plan.fps, frames: Math.round(receipt.plan.fps * receipt.plan.duration), width: 1920, height: 1080, silent: false, staged: true, edited: true, captions: `${prefix}/hero-trailer.vtt` });
}
try {
  for (const scene of receipt.plan.scenes) publishScene(scene);
  publishFilms();
  const contact = receipt.outputs.find(row => row.kind === 'contact-sheet'); if (contact) copy(contact, `${prefix}/contact-sheet.jpg`);
  for (const uri of paths) publication.assets.push({ src: uri, sha256: digest(readFileSync(join(stage, uri.slice(1)))) });
  const campaign = { ...publication, provenance: { ...publicCampaignProvenance(receipt, review), webEncodes } }; assertPortablePublication(campaign);
  writeFileSync(target(`${prefix}/manifest.json`), JSON.stringify(campaign, null, 2) + '\n');
  const previousPath = join(process.cwd(), 'public/media/production-r1/manifest.json');
  const previous = existsSync(previousPath) ? JSON.parse(readFileSync(previousPath)) : null;
  const merged = mergePublication(previous, publication); assertPortablePublication(merged);
  for (const batch of merged.retainedBatches ?? []) for (const asset of batch.assets) verifyFile({ path: join(process.cwd(), 'public', asset.src.slice(1)), sha256: asset.sha256 });
  writeFileSync(target('/media/production-r1/manifest.json'), JSON.stringify(merged, null, 2) + '\n');
  for (const uri of paths) { const dest = join(process.cwd(), 'public', uri.slice(1)); mkdirSync(dirname(dest), { recursive: true }); copyFileSync(join(stage, uri.slice(1)), dest); }
  console.log(`Published ${receipt.plan.scenes.length} scenes and campaign to ${prefix}; retained ${merged.shots.length - publication.shots.length} earlier archive images.`);
} finally { rmSync(stage, { recursive: true, force: true }); }
