#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { campaignPlan, validateCapture, soundEvents, sha256, footageNotice } from './campaignPlan.mjs';
import { synthesizeSoundtrack } from './campaignAudio.mjs';
import { setupFonts, titleOverlay, endCard, campaignPoster, reviewPage } from './campaignArtwork.mjs';
import { contactSheet } from './pipeline.mjs';

const help = `Campaign Studio finishing\nnode tools/media-production/campaign.mjs --job=campaign.json --out=<new-directory>\nJob: {title, subtitle?, cta?, scenes:[{id,title,description,receipt,videoIndex?:0,inSeconds?:0,durationSeconds?:8}]}\nInputs: complete producer receipts, native landscape >=1920×1080, matched FPS, clean posters.\nOutput: 20–30s trailer with original synthesized sound, clean silent loop, native promo images, review page and auditable receipt.\nNo browser is launched. Existing outputs are never overwritten.`;
if (process.argv.includes('--help')) { console.log(help); process.exit(0); }
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const match = /^--(job|out)=(.+)$/.exec(arg); if (!match) throw Error(help); return [match[1], match[2]];
}));
if (!args.job || !args.out) throw Error(help);
const jobPath = resolve(args.job), out = resolve(args.out), root = process.cwd();
if (existsSync(out)) throw Error('Output already exists; choose a new directory');
const jobBytes = readFileSync(jobPath), job = JSON.parse(jobBytes), commands = [];
const probe = path => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path], { encoding: 'utf8' }));
function checkedFile(file, base) {
  const path = resolve(base, file.path), hash = sha256(readFileSync(path));
  if (hash !== file.sha256) throw Error(`Changed source media: ${path}`);
  return { ...file, path };
}
function readCapture(scene) {
  const path = resolve(dirname(jobPath), scene.receipt), bytes = readFileSync(path), receipt = JSON.parse(bytes);
  const rows = receipt.maps ?? [], films = rows.flatMap(row => row.videos ?? []).filter(row => row.format === 'landscape');
  const index = scene.videoIndex ?? 0;
  if (!Number.isInteger(index) || index < 0 || !films[index]) throw Error(`Missing landscape film for ${scene.id}`);
  // Producer paths are project-root-relative or absolute, not receipt-relative.
  const video = checkedFile(films[index], root), metadata = probe(video.path), dimensions = validateCapture(receipt, video, metadata);
  const posters = rows.flatMap(row => row.posters ?? []).filter(row => !row.branded && row.timeOfDay === video.timeOfDay).map(row => checkedFile(row, root));
  for (const format of ['landscape', 'portrait', 'square']) if (!posters.some(row => row.format === format)) throw Error(`Missing clean ${format} poster for ${scene.id}`);
  return { receipt: path, receiptSha256: sha256(bytes), revision: receipt.revision, sourceDigest: receipt.sourceDigest, renderer: rows.map(row => row.renderer), video, metadata, posters, ...dimensions };
}
const inputs = job.scenes?.map(readCapture) ?? [], plan = campaignPlan(job, inputs);
mkdirSync(out, { recursive: true }); mkdirSync(join(out, 'edit'));
const toolFiles = ['campaign.mjs', 'campaignPlan.mjs', 'campaignArtwork.mjs', 'campaignAudio.mjs', 'pipeline.mjs'].map(name => ({ path: `tools/media-production/${name}`, sha256: sha256(readFileSync(join(root, 'tools/media-production', name))) }));
const encoderVersion = execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' }).split('\n')[0];
const receipt = { version: 1, toolFiles, encoderVersion, title: plan.title, notice: footageNotice, job: { path: jobPath, sha256: sha256(jobBytes) }, started: new Date().toISOString(), plan, inputs, commands, outputs: [], errors: [] };
const save = () => writeFileSync(join(out, 'campaign-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
function ffmpeg(args) {
  commands.push({ executable: 'ffmpeg', args }); save();
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', ...args], { stdio: 'inherit' });
}
function record(path, extra) { const bytes = readFileSync(path); const row = { path, bytes: bytes.length, sha256: sha256(bytes), ...extra }; receipt.outputs.push(row); return row; }
const codec = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-threads', '4', '-movflags', '+faststart'];
async function editClips() {
  const files = [];
  for (const scene of plan.scenes) {
    const overlay = join(out, 'edit', `${scene.id}-title.png`), path = join(out, 'edit', `${scene.id}.mp4`);
    titleOverlay(overlay, plan.width, plan.height, scene);
    const filter = `[0:v]setpts=PTS-STARTPTS[v];[1:v]format=rgba,fade=t=in:st=0:d=0.2:alpha=1,fade=t=out:st=1.6:d=0.35:alpha=1[o];[v][o]overlay=0:0:shortest=1,setsar=1[out]`;
    ffmpeg(['-ss', String(scene.start), '-i', inputs[scene.index].video.path, '-loop', '1', '-framerate', String(plan.fps), '-i', overlay, '-filter_complex', filter, '-map', '[out]', '-an', '-t', String(scene.duration), '-r', String(plan.fps), ...codec, path]);
    files.push(path);
  }
  const card = join(out, 'edit', 'end-card.png'), end = join(out, 'edit', 'end-card.mp4'); await endCard(card, plan, root);
  ffmpeg(['-loop', '1', '-framerate', String(plan.fps), '-i', card, '-t', String(plan.endDuration), '-an', '-vf', 'setsar=1,fade=t=in:st=0:d=0.25', ...codec, end]); files.push(end);
  return files;
}
function finishTrailer(files) {
  const timeline = join(out, 'edit', 'timeline.txt');
  writeFileSync(timeline, files.map(path => `file '${path.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
  const events = soundEvents(plan, inputs.map(row => row.video));
  const audio = synthesizeSoundtrack(plan.duration, events), wav = join(out, 'edit', 'sound-design.wav'); writeFileSync(wav, audio.wav);
  receipt.sound = { ...audio.metrics, events, path: wav, sha256: sha256(audio.wav), note: 'Postproduction sound design synchronized to captured scene event timestamps; not a recording of the live game mix.' };
  const path = join(out, 'hero-trailer.mp4');
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', timeline, '-i', wav, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-af', 'alimiter=limit=0.89:level=false', '-t', String(plan.duration), '-movflags', '+faststart', path]);
  const metadata = probe(path), stream = metadata.streams.find(row => row.codec_type === 'video');
  if (!metadata.streams.some(row => row.codec_type === 'audio') || Math.abs(Number(metadata.format.duration) - plan.duration) > .1 || Number(stream.nb_frames) !== Math.round(plan.duration * plan.fps)) throw Error('Finished trailer does not match edit duration/audio/frame count');
  record(path, { kind: 'trailer', probe: metadata });
}
function finishLoop() {
  const source = inputs[0], path = join(out, 'silent-loop.mp4'), duration = Math.min(6, plan.scenes[0].duration);
  // A brief fade at each boundary makes repeat playback intentional without a reversed tank motion.
  ffmpeg(['-ss', String(plan.scenes[0].start), '-i', source.video.path, '-t', String(duration), '-an', '-vf', `fade=t=in:st=0:d=0.25,fade=t=out:st=${duration - .25}:d=0.25`, ...codec, path]);
  record(path, { kind: 'loop', probe: probe(path) });
}
async function finishPosters() {
  const files = []; mkdirSync(join(out, 'posters'));
  for (const scene of plan.scenes) for (const format of ['landscape', 'portrait', 'square']) {
    const input = inputs[scene.index].posters.find(row => row.format === format), path = join(out, 'posters', `${scene.id}-${format}.webp`);
    const size = await campaignPoster(path, input, plan, scene);
    files.push(record(path, { kind: 'poster', title: scene.title, description: scene.description, format, ...size, originalPath: input.path, originalSha256: input.sha256 }));
  }
  await contactSheet(files.map(file => ({ ...file, label: `${file.title} · ${file.format}` })), join(out, 'contact-sheet.jpg'), `${plan.title.toUpperCase()} / CAMPAIGN REVIEW`);
  record(join(out, 'contact-sheet.jpg'), { kind: 'contact-sheet' });
}
try {
  save(); setupFonts(root); const clips = await editClips(); finishTrailer(clips); finishLoop(); await finishPosters();
  reviewPage(out, plan, receipt.outputs); receipt.finished = new Date().toISOString(); save();
  console.log(`Campaign ready for visual and sound review: ${join(out, 'review.html')}`);
} catch (error) { receipt.errors.push(String(error)); save(); throw error; }
