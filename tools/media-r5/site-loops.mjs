#!/usr/bin/env node
// Site deliverables from the cinema renders of the site fifty (site50.mjs): for each shot, a seamless loop (the
// take's last XFADE_MS dissolved into its head, so the wrap never jumps) in every video and GIF format, its poster,
// its still and its scene. Owner 2026-10-03: "the quality of the images, gifs and videos has to be super high" — the
// takes render at 2160p and every format comes straight from the film master through the loop graph: no denoise on the
// videos, generous rates, lanczos downscales from 4K; only the GIFs get a light denoise (grain is what 256-colour
// palettes cannot hold).
//   <id>-loop-master.mov  source size HEVC Main10 crf 10 (visually lossless edit master; --loop-master only: 3.5 GB
//                         for the fifty, and the 4K H.264 at crf 16 already carries the picture)
//   <id>-4k.mp4           3840x2160 H.264 High crf 16, silent           (when the take rendered at 2160p)
//   <id>.mp4              1920x1080 H.264 High crf 16, silent           (landing loops)
//   <id>.webm             1920x1080 VP9 crf 24, silent                  (hero rails, docs topic heroes, feature loops)
//   <id>-mobile.mp4       1280x720 H.264 crf 22, capped at 3 Mbit/s     (phone variants)
//   <id>.gif              960 px, 25 fps, loop palette, error diffusion (full-quality GIF)
//   <id>-share.gif        640 px / 20 fps, stepped down to 560/18, 480/16, 400/15 until under 15 MB (upload limits)
//   <id>.jpg              1920x1080 poster = the loop's first frame
//   <id>-4k.png           the 4K still master; <id>-4k.jpg (q95) and <id>.webp (1920, q92) from it
//   <id>.scene.json       the Studio scene the take was rendered from (map, hour, cast and paint, turrets, effects,
//                         lens path); the still is the same scene at meta.still.tMs (owner 2026-10-02)
//   node tools/media-r5/site-loops.mjs [rendersRoot=shots/media-r5/site50/renders] [deliverRoot=shots/media-r5/site50/deliver] [ids,...] [--drop-film-masters] [--loop-master] [--force] [--stills-only]
// --stills-only delivers the stills (and the scene) without the video and GIF encodes: for takes whose formats are
// written and whose ProRes masters are gone (re-encoding them from the H.264 proxy would cost quality).
// rendersRoot holds the cinema outputs as films/<id>/ (cinema-jobs films) and stills/<id>/ (cinema-jobs blur).
// --drop-film-masters deletes each ProRes film master once its formats are written (the proxy stays; a take rendered
// without one gets it from the master first).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { SHOTS } from './paths.mjs';
import { XFADE_MS } from './site50.mjs';

const argv = process.argv.slice(2), flags = new Set(argv.filter(a => a.startsWith('--'))), pos = argv.filter(a => !a.startsWith('--'));
const renders = resolve(pos[0] ?? join(SHOTS, 'site50/renders'));
const deliver = resolve(pos[1] ?? join(SHOTS, 'site50/deliver'));
const only = pos[2]?.split(',');
const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a], { stdio: ['ignore', 'ignore', 'inherit'] });
const probe = f => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim());
const heightOf = f => Number(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=height', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim());
const pick = (dir, re) => existsSync(dir) ? readdirSync(dir).filter(f => re.test(f)).sort().map(f => join(dir, f))[0] : null;
const DOWN = w => `scale=${w}:-2:flags=lanczos`;
// [label, file suffix, filter after the loop graph, encoder args, needs a 2160p take]
const VIDEO = [
  ['master', '-loop-master.mov', 'format=yuv420p10le', ['-c:v', 'libx265', '-preset', 'medium', '-crf', '10', '-pix_fmt', 'yuv420p10le', '-tag:v', 'hvc1', '-x265-params', 'log-level=error']],
  ['mp4k', '-4k.mp4', `${DOWN(3840)},format=yuv420p`, ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-profile:v', 'high', '-level:v', '5.1', '-movflags', '+faststart'], true],
  ['mp4', '.mp4', `${DOWN(1920)},format=yuv420p`, ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-profile:v', 'high', '-movflags', '+faststart']],
  ['webm', '.webm', `${DOWN(1920)},format=yuv420p`, ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '24', '-row-mt', '1', '-tile-columns', '2', '-deadline', 'good', '-cpu-used', '1', '-auto-alt-ref', '1', '-lag-in-frames', '25']],
  ['mobile', '-mobile.mp4', `${DOWN(1280)},format=yuv420p`, ['-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-maxrate', '3M', '-bufsize', '6M', '-profile:v', 'high', '-movflags', '+faststart']],
];
const GIF = [
  ['gif', '.gif', 'hqdn3d=3:2.5:6:5,fps=25,' + DOWN(960), 'palettegen=max_colors=256:stats_mode=diff', 'paletteuse=dither=sierra2_4a:diff_mode=rectangle'],
  ['gifShare', '-share.gif', 'hqdn3d=3:2.5:6:5,fps=20,' + DOWN(640), 'palettegen=max_colors=256:stats_mode=diff', 'paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle'],
];
// 15 MB fits the common GIF limits; busy smoke-and-fire loops came out at 18-21 MB at 640 px / 20 fps (2026-10-03)
const SHARE_GIF_MAX = 15e6, SHARE_LADDER = [[560, 18, 'bayer:bayer_scale=4'], [480, 16, 'bayer:bayer_scale=4'], [400, 15, 'bayer:bayer_scale=4']];
mkdirSync(deliver, { recursive: true });
const rows = [];
for (const id of (existsSync(join(renders, 'films')) ? readdirSync(join(renders, 'films')) : []).filter(d => /^s\d\d-/.test(d)).sort()) {
  if (only && !only.some(o => id.includes(o))) continue;
  const filmMaster = pick(join(renders, 'films', id, 'films'), /-master\.mov$/);
  const master = filmMaster ?? pick(join(renders, 'films', id, 'films'), /-proxy\.mp4$/);
  // the designated still by its moment (the scene's still.tMs), the close portrait (stillsExtra) apart: cinema names
  // a still by its milliseconds, and a name sort put a 1200 ms portrait before a 4380 ms still (2026-10-06)
  const sceneFile = join(renders, 'films', 'scenes', `${id}.json`), src = existsSync(sceneFile) ? JSON.parse(readFileSync(sceneFile, 'utf8')) : null;
  const stillAt = (ms) => pick(join(renders, 'stills', id, 'stills'), new RegExp(`-still-${Math.round(ms)}ms(-e\\d+ms)?\\.png$`));
  const designated = src?.still ?? src?.meta?.still;
  const still = (designated ? stillAt(designated.tMs) : null) ?? pick(join(renders, 'stills', id, 'stills'), /\.png$/);
  // the close portrait: the scene's stillsExtra; a scene resolved before 2026-10-06's still moments carries only
  // meta.still, so then it is the other still the stills job rendered (it reads the builder's current scene)
  const extra = src?.stillsExtra ?? src?.meta?.stillsExtra;
  const stillDir = join(renders, 'stills', id, 'stills');
  const others = existsSync(stillDir) ? readdirSync(stillDir).filter(f => /-still-\d+ms(-e\d+ms)?\.png$/.test(f)).map(f => join(stillDir, f)).filter(f => f !== still) : [];
  const closeStill = extra?.length ? stillAt(extra[0]) : (others[0] ?? null);
  if (!master) { console.log(`${id}: no film yet`); continue; }
  const out = join(deliver, id);
  const stillsOnly = flags.has('--stills-only');
  const files = {};
  let L = null, uhd = false;
  if (!stillsOnly) {
  // up to date: every format newer than its film and still (several passes may cover one shot; --force re-encodes)
  const done = existsSync(join(out, `${id}.mp4`)) && existsSync(join(out, `${id}-share.gif`)) && (!still || existsSync(join(out, `${id}-4k.png`)));
  const newest = Math.max(statSync(master).mtimeMs, still ? statSync(still).mtimeMs : 0);
  if (done && !flags.has('--force') && statSync(join(out, `${id}-share.gif`)).mtimeMs > newest && statSync(join(out, `${id}.mp4`)).mtimeMs > newest) {
    console.log(`${id}: formats up to date`); continue;
  }
  mkdirSync(out, { recursive: true });
  const D = probe(master), X = XFADE_MS / 1000;
  L = +(D - X).toFixed(3); uhd = heightOf(master) >= 2160;
  if (!(L >= 2)) throw new Error(`${id}: take of ${D}s is too short for a ${X}s crossfade`);
  // tail (L..D) dissolves into head (0..X); then the body (X..L): out(L-) = clip(L-) and out(0) = clip(L), so the wrap is continuous
  const loop = `[0:v]split=3[a][b][c];[a]trim=start=0:end=${X},setpts=PTS-STARTPTS[head];[b]trim=start=${X}:end=${L},setpts=PTS-STARTPTS[body];` +
    `[c]trim=start=${L}:end=${D},setpts=PTS-STARTPTS[tail];[tail][head]xfade=transition=fade:duration=${X}:offset=0[blend];[blend][body]concat=n=2:v=1:a=0[loop]`;
  for (const [key, suffix, post, enc, needsUhd] of VIDEO) {
    if (key === 'master' && !flags.has('--loop-master')) continue;
    if (needsUhd && !uhd) continue;
    ff('-i', master, '-filter_complex', `${loop};[loop]${post}[v]`, '-map', '[v]', '-an', ...enc, join(out, `${id}${suffix}`));
    files[key] = `${id}/${id}${suffix}`;
  }
  for (const [key, suffix, pre, gen, use] of GIF) {
    ff('-i', master, '-filter_complex', `${loop};[loop]${pre},split[g1][g2];[g1]${gen}[p];[g2][p]${use}[v]`, '-map', '[v]', '-loop', '0', join(out, `${id}${suffix}`));
    files[key] = `${id}/${id}${suffix}`;
  }
  // the share GIF must fit common upload limits: step down size and rate until it is under SHARE_GIF_MAX
  for (const [w, fps, dither] of SHARE_LADDER) {
    if (statSync(join(out, `${id}-share.gif`)).size <= SHARE_GIF_MAX) break;
    ff('-i', master, '-filter_complex', `${loop};[loop]hqdn3d=3:2.5:6:5,fps=${fps},${DOWN(w)},split[g1][g2];[g1]palettegen=max_colors=256:stats_mode=diff[p];[g2][p]paletteuse=dither=${dither}:diff_mode=rectangle[v]`,
      '-map', '[v]', '-loop', '0', join(out, `${id}-share.gif`));
  }
  ff('-i', master, '-filter_complex', `${loop};[loop]${DOWN(1920)}[v]`, '-map', '[v]', '-frames:v', '1', '-q:v', '2', join(out, `${id}.jpg`));
  files.poster = `${id}/${id}.jpg`;
  } else {
    if (!existsSync(join(out, `${id}.mp4`))) { console.log(`${id}: no formats delivered yet (--stills-only)`); continue; }
    L = +(probe(join(out, `${id}.mp4`))).toFixed(3);
  }
  const scene = join(renders, 'films', 'scenes', `${id}.json`);
  if (existsSync(scene)) { copyFileSync(scene, join(out, `${id}.scene.json`)); files.scene = `${id}/${id}.scene.json`; }
  if (still) {
    const png = join(out, `${id}-4k.png`); copyFileSync(still, png);
    const im = await loadImage(readFileSync(png));
    const full = createCanvas(im.width, im.height); full.getContext('2d').drawImage(im, 0, 0);
    writeFileSync(join(out, `${id}-4k.jpg`), full.toBuffer('image/jpeg', 95));
    const c = createCanvas(1920, Math.round(im.height * 1920 / im.width));
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    writeFileSync(join(out, `${id}.webp`), c.toBuffer('image/webp', 92));
    Object.assign(files, { still4k: `${id}/${id}-4k.png`, still4kJpg: `${id}/${id}-4k.jpg`, still: `${id}/${id}.webp` });
  }
  if (closeStill) {
    // the close portrait (owner 2026-10-06): the 4K master, a q95 JPEG and a 1920 px WebP beside the still
    const png = join(out, `${id}-close-4k.png`); copyFileSync(closeStill, png);
    const im = await loadImage(readFileSync(png));
    const full = createCanvas(im.width, im.height); full.getContext('2d').drawImage(im, 0, 0);
    writeFileSync(join(out, `${id}-close-4k.jpg`), full.toBuffer('image/jpeg', 95));
    const c = createCanvas(1920, Math.round(im.height * 1920 / im.width));
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    writeFileSync(join(out, `${id}-close.webp`), c.toBuffer('image/webp', 92));
    Object.assign(files, { close4k: `${id}/${id}-close-4k.png`, close4kJpg: `${id}/${id}-close-4k.jpg`, close: `${id}/${id}-close.webp` });
  }
  if (filmMaster && flags.has('--drop-film-masters') && !stillsOnly) {
    // the raw take stays for the films' cuts (motion/sync-footage.mjs links <stem>-proxy.mp4): a finals run without
    // cinema's proxy (--film-proxy=false, launch night 2026-10-08: its encode held the GPU lease ~5 min a take) gets it
    // here, on the CPU, from the master and with cinema's settings, before the master goes
    const proxy = filmMaster.replace(/-master\.mov$/, '-proxy.mp4');
    if (proxy !== filmMaster && !existsSync(proxy)) {
      ff('-i', filmMaster, '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
        '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', proxy);
    }
    unlinkSync(filmMaster);
  }
  const size = f => statSync(join(deliver, f)).size, mb = k => files[k] ? `${(size(files[k]) / 1e6).toFixed(1)} MB` : '—';
  rows.push({ id, loopS: L, files, bytes: Object.fromEntries(Object.entries(files).map(([k, f]) => [k, size(f)])) });
  console.log(`${id}: loop ${L}s${uhd ? ' (2160p)' : ''}; 4k ${mb('mp4k')}, mp4 ${mb('mp4')}, webm ${mb('webm')}, mobile ${mb('mobile')}, gif ${mb('gif')}, share ${mb('gifShare')}${still ? ', still' : ', no still yet'}`);
}
// the index is rebuilt from the deliver folder itself, so overlapping runs (one per render chunk) never drop a shot
const index = join(deliver, 'deliver-index.json');
const KEYS = { master: '-loop-master.mov', mp4k: '-4k.mp4', mp4: '.mp4', webm: '.webm', mobile: '-mobile.mp4', gif: '.gif', gifShare: '-share.gif',
  poster: '.jpg', still4k: '-4k.png', still4kJpg: '-4k.jpg', still: '.webp', close4k: '-close-4k.png', close4kJpg: '-close-4k.jpg',
  close: '-close.webp', scene: '.scene.json' };
const merged = readdirSync(deliver).filter(d => /^s\d\d-/.test(d) && existsSync(join(deliver, d, `${d}.mp4`))).sort().map(id => {
  const files = Object.fromEntries(Object.entries(KEYS).filter(([, ext]) => existsSync(join(deliver, id, `${id}${ext}`))).map(([k, ext]) => [k, `${id}/${id}${ext}`]));
  const loopS = rows.find(r => r.id === id)?.loopS ?? +probe(join(deliver, id, `${id}.mp4`)).toFixed(3);
  return { id, loopS, files, bytes: Object.fromEntries(Object.entries(files).map(([k, f]) => [k, statSync(join(deliver, f)).size])) };
});
writeFileSync(index, JSON.stringify(merged, null, 1));
console.log(`${rows.length} shots delivered -> ${deliver} (${merged.length} in the index)`);
