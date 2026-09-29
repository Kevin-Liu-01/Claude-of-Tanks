#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { digest, verifyFile } from './media-production/pipeline.mjs';
import { mergePublication } from './media-production/mergePublication.mjs';
import { assertPortablePublication, campaignWebProfile, campaignWebArguments, validateCampaignWebEncode } from './media-production/campaignPublication.mjs';

const INPUTS = ['capture-report.json', 'battle-live.webm', 'battle-opening.png', 'battle-impact.png'];
const PREFIX = '/media/director-r4/gameplay';
const NOTICE = 'Controlled demonstration using the real battle simulation and live HUD. Vehicle positions, target health, movement and scope are staged; firing includes a 0.20-second simulation step. Silent. Encoded frame rate is not a gameplay performance measurement.';
const HELP = `node tools/publish-gameplay-capture.mjs --capture=<native-capture-directory> --source-receipt=<same-frozen-source-video-receipt.json> --review=<hash-bound-review.json> --out=<new-work-directory>
Publish reviewed native battle footage after the cinematic campaign. Retains raw media and its original capture source; refuses existing gameplay assets. See docs/MEDIA-PRODUCTION-CAMPAIGNS.md.`;

function requireReviewDecision(review) {
  if (review.accepted !== true || !review.reviewedAt || !review.notes?.trim() || !review.sourceAttestation?.trim()) throw Error('Explicit visual review and source attestation required');
}

export function requireGameplayReview(report, files, sourceBytes, review, toolHash) {
  if (!Array.isArray(report.consoleErrors) || report.consoleErrors.length) throw Error('Battle capture has browser errors');
  if (report.capture?.nativeComposite !== true || report.capture.width !== 1920 || report.capture.height !== 1080) throw Error('Require native 1920×1080 live HUD capture');
  if (report.capture.toolSha256 !== toolHash) throw Error('Capture tool changed since acquisition');
  const shell = report.battleReceipt?.lastShell;
  if (shell?.terminal !== 'tank' || !shell.hitTankId || !shell.hitKind || !Number.isFinite(shell.damage)) throw Error('Missing real resolved player shell');
  requireReviewDecision(review);
  for (const file of files) if (!review.hashes?.includes(file.sha256)) throw Error(`Unreviewed input: ${file.name}`);
  if (review.sourceReceiptSha256 !== digest(sourceBytes)) throw Error('Source attestation receipt changed');
  const source = JSON.parse(sourceBytes);
  if (!source.finished || source.errors?.length !== 0 || !/^[a-f0-9]{64}$/.test(source.sourceDigest) || source.sourceDigest !== review.sourceDigest || source.revision !== review.revision) throw Error('Source attestation does not match frozen capture source');
  return { sourceDigest: source.sourceDigest, revision: source.revision, sourceReceiptSha256: digest(sourceBytes),
    binding: 'Reviewer attests the battle and referenced Studio capture shared the same frozen runtime. The battle report itself records the capture-tool hash, not the runtime digest.', attestation: review.sourceAttestation };
}

export function nativeGameplayProbe(probe) {
  const video = probe.streams?.find(row => row.codec_type === 'video');
  if (!video || video.width !== 1920 || video.height !== 1080) throw Error('Native gameplay source must be exactly 1920×1080; no upscaling');
  const frames = Number(video.nb_read_frames ?? video.nb_frames);
  if (!Number.isInteger(frames) || frames < 2) throw Error('Cannot establish source frame count');
  const normalized = { ...probe, streams: probe.streams.map(row => row === video ? { ...row, nb_frames: String(frames) } : row) };
  const profile = campaignWebProfile(normalized);
  const duration = Number(probe.format?.duration);
  if (!Number.isFinite(duration) || Math.abs(duration - profile.duration) > .51 / profile.fps) throw Error('Source duration and frame cadence disagree');
  return normalized;
}

function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    const match = /^--(capture|source-receipt|review|out)=(.+)$/.exec(arg);
    if (!match || result[match[1]]) throw Error(HELP);
    result[match[1]] = resolve(match[2]);
  }
  if (Object.keys(result).length !== 4) throw Error(HELP);
  return result;
}
function probe(path, count = false) {
  return JSON.parse(execFileSync('ffprobe', ['-v', 'error', ...(count ? ['-count_frames'] : []), '-show_streams', '-show_format', '-of', 'json', path], { encoding: 'utf8' }));
}
function captions(duration) {
  const end = `00:00:${String(Math.floor(duration)).padStart(2, '0')}.${String(Math.floor(duration % 1 * 1000)).padStart(3, '0')}`;
  return `WEBVTT\n\n00:00:00.000 --> ${end}\nControlled battle demonstration — staged positions and health.\nLive HUD, scope and a real simulation-resolved shot. Silent.\n`;
}

function stageMedia(args, files, sourceProbe) {
  const commands = [], assets = [], encodes = [];
  const run = (command, argv) => { commands.push({ command, argv }); execFileSync(command, argv, { stdio: 'inherit' }); };
  const add = name => { const path = join(args.out, name), bytes = readFileSync(path); const row = { src: `${PREFIX}/${name}`, sha256: digest(bytes), bytes: bytes.length }; assets.push(row); return row; };
  const raw = join(args.capture, 'battle-live.webm');
  for (const mobile of [false, true]) {
    const name = mobile ? 'battle-live-mobile.mp4' : 'battle-live.mp4', output = join(args.out, name);
    const profile = campaignWebProfile(sourceProbe, mobile);
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', ...campaignWebArguments(raw, output, profile)]);
    const asset = add(name), result = validateCampaignWebEncode(probe(output), profile, asset.bytes);
    encodes.push({ ...asset, sourceSha256: files.find(file => file.name === 'battle-live.webm').sha256, profile, result });
  }
  for (const shot of ['opening', 'impact']) {
    const source = join(args.capture, `battle-${shot}.png`), image = probe(source).streams[0];
    if (image.width !== 1920 || image.height !== 1080) throw Error('Gameplay still changed native dimensions');
    run('cwebp', ['-quiet', '-m', '6', '-sharp_yuv', '-q', '90', source, '-o', join(args.out, `battle-${shot}.webp`)]);
    add(`battle-${shot}.webp`);
  }
  writeFileSync(join(args.out, 'battle-live.vtt'), captions(encodes[0].result.duration)); add('battle-live.vtt');
  return { commands, assets, encodes };
}
function publicationFor(report, files, source, review, staged, toolHash) {
  const web = staged.encodes[0].result;
  return { version: 1, created: new Date().toISOString(), sourceDigest: source.sourceDigest, revision: source.revision,
    shots: [{ src: `${PREFIX}/battle-opening.webp`, title: 'Before contact', alt: 'Live battle HUD in a controlled formation demonstration.', kind: 'gameplay', sequence: 1 },
      { src: `${PREFIX}/battle-impact.webp`, title: 'After contact', alt: 'Live scope, module-hit indicators and a destroyed target in a controlled battle demonstration.', kind: 'gameplay', sequence: 2 }],
    films: [{ src: `${PREFIX}/battle-live.mp4`, mobileSrc: `${PREFIX}/battle-live-mobile.mp4`, poster: `${PREFIX}/battle-opening.webp`, captions: `${PREFIX}/battle-live.vtt`, title: 'Scope and fire — controlled gameplay', kind: 'gameplay', controlled: true, staged: true, silent: true, width: web.width, height: web.height, fps: web.fps, frames: web.frames, duration: web.duration, notice: NOTICE }],
    assets: staged.assets, media: {}, recipes: {}, review: { reviewedAt: review.reviewedAt, notes: review.notes, hashes: review.hashes },
    provenance: { notice: NOTICE, captureSource: source, sourceFiles: files.map(({ name, sha256, bytes }) => ({ name, sha256, bytes })),
      captureTool: { path: 'tools/feature-promo-capture.mjs', sha256: toolHash },
      publicationTools: ['tools/publish-gameplay-capture.mjs', 'tools/media-production/campaignPublication.mjs', 'tools/media-production/mergePublication.mjs', 'tools/media-production/pipeline.mjs'].map(path => ({ path, sha256: digest(readFileSync(path)) })),
      shellResult: report.battleReceipt, consoleErrors: report.consoleErrors, optionalAnalyticsErrors: report.optionalAnalyticsErrors,
      outcomeNotice: `The recorded player shell resolved as ${report.battleReceipt.lastShell.hitKind} for ${report.battleReceipt.lastShell.damage} damage. A later target destruction is not independently attributed by this receipt.`, webEncodes: staged.encodes } };
}

export function publishGameplay(argv) {
  const args = parseArgs(argv), toolHash = digest(readFileSync('tools/feature-promo-capture.mjs'));
  if (existsSync(args.out)) throw Error('Refusing existing work directory');
  if (!existsSync('public/media/director-r4/manifest.json')) throw Error('Publish reviewed cinematic campaign first');
  if (existsSync(join('public', PREFIX, 'manifest.json'))) throw Error('Refusing previously published gameplay assets');
  const files = INPUTS.map(name => { const bytes = readFileSync(join(args.capture, name)); return { name, sha256: digest(bytes), bytes: bytes.length }; });
  const report = JSON.parse(readFileSync(join(args.capture, 'capture-report.json'))), review = JSON.parse(readFileSync(args.review));
  const source = requireGameplayReview(report, files, readFileSync(args['source-receipt']), review, toolHash);
  const sourceProbe = nativeGameplayProbe(probe(join(args.capture, 'battle-live.webm'), true));
  mkdirSync(args.out, { recursive: true });
  const staged = stageMedia(args, files, sourceProbe), publication = publicationFor(report, files, source, review, staged, toolHash);
  assertPortablePublication(publication);
  for (const file of files) verifyFile({ path: join(args.capture, file.name), sha256: file.sha256 });
  if (digest(readFileSync('tools/feature-promo-capture.mjs')) !== toolHash) throw Error('Capture tool changed during encoding');
  const manifestPath = 'public/media/production-r1/manifest.json', previousBytes = readFileSync(manifestPath);
  const merged = mergePublication(JSON.parse(previousBytes), publication); assertPortablePublication(merged);
  for (const batch of merged.retainedBatches ?? []) for (const asset of batch.assets) verifyFile({ path: join('public', asset.src), sha256: asset.sha256 });
  for (const asset of staged.assets) if (existsSync(join('public', asset.src))) throw Error(`Refusing existing asset ${asset.src}`);
  // Retain private input locations and exact encoder commands only in the local receipt.
  writeFileSync(join(args.out, 'publication-receipt.json'), JSON.stringify({ args, sourceProbe, commands: staged.commands, publication }, null, 2) + '\n', { flag: 'wx' });
  if (digest(readFileSync(manifestPath)) !== digest(previousBytes)) throw Error('Publication changed during encoding; rerun after coordinating');
  for (const asset of staged.assets) { const target = join('public', asset.src); mkdirSync(dirname(target), { recursive: true }); copyFileSync(join(args.out, asset.src.split('/').at(-1)), target); }
  writeFileSync(join('public', PREFIX, 'manifest.json'), JSON.stringify(publication, null, 2) + '\n', { flag: 'wx' });
  writeFileSync(manifestPath, JSON.stringify(merged, null, 2) + '\n');
  console.log(`Published reviewed controlled gameplay: ${staged.encodes.map(row => `${row.result.width}×${row.result.height}, ${row.bytes} bytes`).join('; ')}.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--help')) console.log(HELP);
  else publishGameplay(process.argv.slice(2));
}
