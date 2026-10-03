#!/usr/bin/env node
// Site deliverables from the cinema renders of the site fifty (site50.mjs): for each shot, a seamless loop (the
// take's last XFADE_MS dissolved into its head, so the wrap never jumps) in the site's own video formats, its
// poster, and the 4K still in the site's still format.
//   <id>.webm         1920x1080 VP9, silent        (hero rails, docs topic heroes, feature loops)
//   <id>.mp4          1920x1080 H.264, silent      (landing loops)
//   <id>-mobile.mp4   960x540 H.264 24 fps, silent (phone variants, the web-video-r1 budget)
//   <id>.jpg          1920x1080 poster = the loop's first frame
//   <id>.webp         1920x1080 still from the 4K master; <id>-4k.png the master itself
//   <id>.scene.json   the Studio scene the take was rendered from (map, hour, cast and paint, effects, lens path);
//                     the still is the same scene at meta.still.tMs (owner 2026-10-02: record each image's JSON)
//   node tools/media-r5/site-loops.mjs [rendersRoot=shots/media-r5/site50/renders] [deliverRoot=shots/media-r5/site50/deliver] [ids,...]
// rendersRoot holds the cinema outputs as films/<id>/ (cinema-jobs films) and stills/<id>/ (cinema-jobs blur).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { SHOTS } from './paths.mjs';
import { XFADE_MS } from './site50.mjs';

const renders = resolve(process.argv[2] ?? join(SHOTS, 'site50/renders'));
const deliver = resolve(process.argv[3] ?? join(SHOTS, 'site50/deliver'));
const only = process.argv[4]?.split(',');
const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a], { stdio: ['ignore', 'ignore', 'inherit'] });
const probe = f => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim());
const pick = (dir, re) => existsSync(dir) ? readdirSync(dir).filter(f => re.test(f)).sort().map(f => join(dir, f))[0] : null;
mkdirSync(deliver, { recursive: true });
const rows = [];
for (const id of (existsSync(join(renders, 'films')) ? readdirSync(join(renders, 'films')) : []).filter(d => /^s\d\d-/.test(d)).sort()) {
  if (only && !only.some(o => id.includes(o))) continue;
  const master = pick(join(renders, 'films', id, 'films'), /-master\.mov$/) ?? pick(join(renders, 'films', id, 'films'), /-proxy\.mp4$/);
  const still = pick(join(renders, 'stills', id, 'stills'), /\.png$/);
  if (!master) { console.log(`${id}: no film yet`); continue; }
  const out = join(deliver, id); mkdirSync(out, { recursive: true });
  const D = probe(master), X = XFADE_MS / 1000, L = +(D - X).toFixed(3);
  if (!(L >= 2)) throw new Error(`${id}: take of ${D}s is too short for a ${X}s crossfade`);
  // tail (L..D) dissolves into head (0..X); then the body (X..L): out(L-) = clip(L-) and out(0) = clip(L), so the wrap is continuous
  const graph = `[0:v]split=3[a][b][c];[a]trim=start=0:end=${X},setpts=PTS-STARTPTS[head];[b]trim=start=${X}:end=${L},setpts=PTS-STARTPTS[body];` +
    `[c]trim=start=${L}:end=${D},setpts=PTS-STARTPTS[tail];[tail][head]xfade=transition=fade:duration=${X}:offset=0[blend];[blend][body]concat=n=2:v=1:a=0,format=yuv420p[v]`;
  const loopMaster = join(out, `${id}-loop-master.mov`);
  ff('-i', master, '-filter_complex', graph, '-map', '[v]', '-an', '-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le', loopMaster);
  // the web encodes drop the film grain (a light temporal denoise; the masters keep it): grain is what smoke-and-fire
  // takes cannot compress, and the phone variant has to fit the landing page's mobile budget
  const scale = w => `hqdn3d=1.5:1.5:6:6,scale=${w}:-2:flags=lanczos`;
  ff('-i', loopMaster, '-vf', scale(1920), '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '31', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-pix_fmt', 'yuv420p', join(out, `${id}.webm`));
  ff('-i', loopMaster, '-vf', scale(1920), '-an', '-c:v', 'libx264', '-crf', '20', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(out, `${id}.mp4`));
  ff('-i', loopMaster, '-vf', `${scale(960)},fps=24`, '-an', '-c:v', 'libx264', '-crf', '30', '-maxrate', '800k', '-bufsize', '1600k', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(out, `${id}-mobile.mp4`));
  ff('-i', loopMaster, '-frames:v', '1', '-vf', scale(1920), '-q:v', '3', join(out, `${id}.jpg`));
  const files = { webm: `${id}/${id}.webm`, mp4: `${id}/${id}.mp4`, mobile: `${id}/${id}-mobile.mp4`, poster: `${id}/${id}.jpg` };
  const scene = join(renders, 'films', 'scenes', `${id}.json`);
  if (existsSync(scene)) { copyFileSync(scene, join(out, `${id}.scene.json`)); files.scene = `${id}/${id}.scene.json`; }
  if (still) {
    const png = join(out, `${id}-4k.png`); copyFileSync(still, png);
    const im = await loadImage(readFileSync(png)), c = createCanvas(1920, Math.round(im.height * 1920 / im.width));
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    writeFileSync(join(out, `${id}.webp`), c.toBuffer('image/webp', 86));
    Object.assign(files, { still4k: `${id}/${id}-4k.png`, still: `${id}/${id}.webp` });
  }
  const size = f => statSync(join(deliver, f)).size;
  rows.push({ id, loopS: L, files, bytes: Object.fromEntries(Object.entries(files).map(([k, f]) => [k, size(f)])) });
  console.log(`${id}: loop ${L}s; webm ${(size(files.webm) / 1e6).toFixed(1)} MB, mp4 ${(size(files.mp4) / 1e6).toFixed(1)} MB, mobile ${(size(files.mobile) / 1e3).toFixed(0)} KB${still ? ', still' : ', no still yet'}`);
}
// the index is rebuilt from the deliver folder itself, so overlapping runs (one per render chunk) never drop a shot
const index = join(deliver, 'deliver-index.json');
const KEYS = { webm: '.webm', mp4: '.mp4', mobile: '-mobile.mp4', poster: '.jpg', still4k: '-4k.png', still: '.webp', scene: '.scene.json' };
const merged = readdirSync(deliver).filter(d => /^s\d\d-/.test(d) && existsSync(join(deliver, d, `${d}.mp4`))).sort().map(id => {
  const files = Object.fromEntries(Object.entries(KEYS).filter(([, ext]) => existsSync(join(deliver, id, `${id}${ext}`))).map(([k, ext]) => [k, `${id}/${id}${ext}`]));
  const loopS = rows.find(r => r.id === id)?.loopS ?? +probe(join(deliver, id, `${id}.mp4`)).toFixed(3);
  return { id, loopS, files, bytes: Object.fromEntries(Object.entries(files).map(([k, f]) => [k, statSync(join(deliver, f)).size])) };
});
writeFileSync(index, JSON.stringify(merged, null, 1));
console.log(`${rows.length} shots delivered -> ${deliver} (${merged.length} in the index)`);
